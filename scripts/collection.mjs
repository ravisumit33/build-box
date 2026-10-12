import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

function normalizeBase(value) {
  if (!/^\/(?:[A-Za-z0-9_.-]+\/)*$/.test(value) || value.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("The site base must be a path with leading and trailing slashes, such as /build-box/ or /.");
  }
  return value;
}

function options() {
  const [command, ...args] = process.argv.slice(2);
  const allowed = {
    setup: ["--app"],
    build: ["--app", "--base"],
    dev: ["--app"],
    preview: ["--base", "--port"],
  };
  if (!Object.hasOwn(allowed, command)) {
    throw new Error("Use setup, build, dev, or preview.");
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
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? basename(root);
  const base = normalizeBase(flags["--base"] ?? process.env.SITE_BASE_PATH ?? `/${repoName}/`);
  const port = Number(flags["--port"] ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The port must be an integer from 1 to 65535.");
  }
  return { command, app: flags["--app"], base, port };
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function build(apps, base, singleApp) {
  for (const app of apps) {
    await buildWasm(app);
    run("npm", ["--prefix", join(root, app.slug, "frontend"), "run", "build", "--", "--base", `${base}${app.slug}/`]);
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
        <a class="app" href="${base}${app.slug}/">
          <h2>${escapeHtml(app.title)}</h2>
          <p>${escapeHtml(app.description)}</p>
          <span>Open app &rarr;</span>
        </a>`).join("\n");
  const template = await readFile(join(root, "site", "index.html"), "utf8");
  if (!template.includes("{{APP_CARDS}}")) throw new Error("The site template is missing its app-card placeholder.");
  await writeFile(join(output, "index.html"), template.replace("{{APP_CARDS}}", () => cards));
  await writeFile(join(output, ".nojekyll"), "");
  await writeFile(join(output, "404.html"), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>Page not found</h1><p><a href="' + base + '">Back to Build Box</a></p></html>\n');
  console.log(`Built ${apps.length} app(s) into site-dist/ for ${base}`);
}

async function preview(base, port) {
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
      if (base !== "/" && pathname === base.slice(0, -1)) {
        response.writeHead(308, { Location: `${base}${url.search}` }).end();
        return;
      }
      if (!pathname.startsWith(base)) {
        response.writeHead(404).end("Not found");
        return;
      }
      let file = resolve(output, pathname.slice(base.length));
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
    console.log(`Build Box: http://127.0.0.1:${port}${base}`);
  });
}

async function main() {
  const { command, app: slug, base, port } = options();
  const registered = await readApps();
  const apps = slug ? registered.filter((app) => app.slug === slug) : registered;
  if (apps.length === 0) throw new Error(`Unknown app: ${slug}`);
  if (command === "setup") await setup(apps);
  if (command === "build") await build(apps, base, Boolean(slug));
  if (command === "dev") {
    if (!slug) throw new Error("Choose an app with --app <slug>.");
    await buildWasm(apps[0]);
    run("npm", ["--prefix", join(root, slug, "frontend"), "run", "dev"]);
  }
  if (command === "preview") await preview(base, port);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
