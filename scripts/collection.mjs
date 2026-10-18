import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sdk = join(root, ".tools", "emsdk");
const output = join(root, "site-dist");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.signal ?? result.status}).`);
  }
}

function options() {
  const [command, ...args] = process.argv.slice(2);
  const allowed = {
    setup: ["--app"],
    build: ["--app"],
    "lint:cpp": ["--app"],
    dev: ["--app"],
    preview: ["--port"],
  };
  if (!Object.hasOwn(allowed, command)) {
    throw new Error("Use setup, build, lint:cpp, dev, or preview.");
  }
  const flags = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed[command].includes(flag) || !value || value.startsWith("--") || Object.hasOwn(flags, flag)) {
      throw new Error(`Invalid or duplicate option: ${flag}`);
    }
    flags[flag] = value;
  }
  const port = Number(flags["--port"] ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The port must be an integer from 1 to 65535.");
  }
  return { command, app: flags["--app"], port };
}

async function readApps() {
  const apps = JSON.parse(await readFile(join(root, "apps.json"), "utf8"));
  if (!Array.isArray(apps) || apps.length === 0) {
    throw new Error("apps.json must contain at least one app.");
  }
  const slugs = new Set();
  for (const app of apps) {
    if (!app || typeof app.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.slug)) {
      throw new Error("Every app needs a lowercase, hyphen-separated slug.");
    }
    if (slugs.has(app.slug)) throw new Error(`Duplicate app slug: ${app.slug}`);
    slugs.add(app.slug);
    if (typeof app.title !== "string" || !app.title.trim() || typeof app.description !== "string" || !app.description.trim()) {
      throw new Error(`${app.slug} needs a title and description.`);
    }
    const frontend = join(root, app.slug, "frontend");
    await access(join(root, app.slug, "backend", "CMakeLists.txt"));
    await access(join(frontend, "package-lock.json"));
    const pkg = JSON.parse(await readFile(join(frontend, "package.json"), "utf8"));
    for (const script of ["build:wasm", "build", "dev"]) {
      if (typeof pkg.scripts?.[script] !== "string") {
        throw new Error(`${app.slug} is missing the ${script} frontend script.`);
      }
    }
  }
  return apps;
}

async function setup(apps) {
  const version = (await readFile(join(root, ".emscripten-version"), "utf8")).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid pinned Emscripten version.");
  if (!existsSync(sdk)) {
    await mkdir(join(root, ".tools"), { recursive: true });
    run("git", ["clone", "--depth", "1", "--branch", version, "https://github.com/emscripten-core/emsdk.git", sdk]);
  }
  run(join(sdk, "emsdk"), ["install", version]);
  run(join(sdk, "emsdk"), ["activate", version]);
  for (const app of apps) {
    run("npm", ["--prefix", join(root, app.slug, "frontend"), "ci"]);
  }
}

async function buildWasm(app) {
  const envFile = join(sdk, "emsdk_env.sh");
  if (!existsSync(envFile)) throw new Error("The shared Emscripten SDK is missing. Run npm run setup first.");
  run("bash", [
    "-c",
    'export EMSDK_QUIET=1; source "$1" && npm --prefix "$2" run build:wasm',
    "build-wasm",
    envFile,
    join(root, app.slug, "frontend"),
  ]);
  const generated = await readdir(join(root, app.slug, "frontend", "generated"));
  if (!generated.some((name) => name.endsWith(".wasm")) || !generated.some((name) => name.endsWith(".js"))) {
    throw new Error(`${app.slug} did not generate both JavaScript and WebAssembly.`);
  }
}

function clangTidyCommand() {
  let command = process.env.CLANG_TIDY || "clang-tidy";
  let result = spawnSync(command, ["--version"], { cwd: root, encoding: "utf8" });
  if (result.error?.code === "ENOENT" && !process.env.CLANG_TIDY) {
    const brew = spawnSync("brew", ["--prefix", "llvm"], { cwd: root, encoding: "utf8" });
    if (brew.status === 0) {
      command = join(brew.stdout.trim(), "bin", "clang-tidy");
      result = spawnSync(command, ["--version"], { cwd: root, encoding: "utf8" });
    }
  }
  if (result.error || result.status !== 0) {
    throw new Error(
      "Could not run clang-tidy. Install LLVM 20+ and add its bin directory to PATH, or set CLANG_TIDY to the executable path.",
      { cause: result.error ?? new Error(result.stderr.trim() || `Exited with ${result.signal ?? result.status}`) },
    );
  }
  return command;
}

async function lintCpp(apps) {
  const tidy = clangTidyCommand();
  const envFile = join(sdk, "emsdk_env.sh");
  if (!existsSync(envFile)) throw new Error("The shared Emscripten SDK is missing. Run npm run setup first.");
  run(tidy, ["--verify-config"]);
  for (const app of apps) {
    const backend = join(root, app.slug, "backend");
    const nativeBuild = join(backend, "build-tidy-native");
    const wasmBuild = join(backend, "build-tidy-wasm");
    run("cmake", [
      "-S", backend, "-B", nativeBuild,
      "-DCMAKE_BUILD_TYPE=Debug", "-DBUILD_TESTING=ON", "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
    ]);
    run("bash", [
      "-c",
      'export EMSDK_QUIET=1; source "$1" && emcmake cmake -S "$2" -B "$3" -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON',
      "lint-wasm",
      envFile,
      backend,
      wasmBuild,
    ]);
    const sysroot = join(sdk, "upstream", "emscripten", "cache", "sysroot");
    const configurations = [
      [nativeBuild, []],
      [wasmBuild, [
        "--extra-arg=--target=wasm32-unknown-emscripten",
        `--extra-arg=--sysroot=${sysroot}`,
        `--extra-arg=-isystem${join(sysroot, "include", "compat")}`,
      ]],
    ];
    for (const [directory, extraArgs] of configurations) {
      const commands = JSON.parse(await readFile(join(directory, "compile_commands.json"), "utf8"));
      const sources = [...new Set(commands.map(({ file }) => file))];
      if (sources.length === 0) throw new Error(`No C++ compilation commands found in ${directory}.`);
      console.log(`Checking ${sources.length} C++ translation units from ${relative(root, directory)}.`);
      run(tidy, ["--quiet", "-p", directory, ...extraArgs, ...sources]);
    }
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function build(apps, singleApp) {
  for (const app of apps) {
    await buildWasm(app);
    run("npm", ["--prefix", join(root, app.slug, "frontend"), "run", "build", "--", "--base", `/${app.slug}/`]);
  }
  if (singleApp) {
    console.log(`Built ${apps[0].slug}/frontend/dist/. Run npm run build to assemble the complete site.`);
    return;
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const app of apps) {
    await cp(join(root, app.slug, "frontend", "dist"), join(output, app.slug), { recursive: true });
  }
  const cards = apps.map((app) => `
        <a class="app" href="/${app.slug}/">
          <h2>${escapeHtml(app.title)}</h2>
          <p>${escapeHtml(app.description)}</p>
          <span>Open app &rarr;</span>
        </a>`).join("\n");
  const template = await readFile(join(root, "site", "index.html"), "utf8");
  if (!template.includes("{{APP_CARDS}}")) throw new Error("The site template is missing its app-card placeholder.");
  await writeFile(join(output, "index.html"), template.replace("{{APP_CARDS}}", () => cards));
  await cp(join(root, "site", "_headers"), join(output, "_headers"));
  await writeFile(join(output, "404.html"), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>Page not found</h1><p><a href="/">Back to Build Box</a></p></html>\n');
  console.log(`Built ${apps.length} app(s) into site-dist/`);
}

async function preview(port) {
  await access(join(output, "index.html"));
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };
  const server = createServer(async (request, response) => {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
        return;
      }
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        response.writeHead(400).end("Invalid URL");
        return;
      }
      let file = resolve(output, pathname.slice(1));
      const within = relative(output, file);
      if (isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if ((await stat(file)).isDirectory()) {
        if (!pathname.endsWith("/")) {
          response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end();
          return;
        }
        file = join(file, "index.html");
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": "no-cache",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        response.writeHead(404).end("Not found");
      } else {
        console.error(error);
        response.writeHead(500).end("Could not serve the requested file");
      }
    }
  });
  server.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Build Box: http://127.0.0.1:${port}/`);
  });
}

async function main() {
  const { command, app: slug, port } = options();
  const registered = await readApps();
  const apps = slug ? registered.filter((app) => app.slug === slug) : registered;
  if (apps.length === 0) throw new Error(`Unknown app: ${slug}`);
  if (command === "setup") await setup(apps);
  if (command === "build") await build(apps, Boolean(slug));
  if (command === "lint:cpp") await lintCpp(apps);
  if (command === "dev") {
    if (!slug) throw new Error("Choose an app with --app <slug>.");
    await buildWasm(apps[0]);
    run("npm", ["--prefix", join(root, slug, "frontend"), "run", "dev"]);
  }
  if (command === "preview") await preview(port);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
