# Build Box

A collection of small browser apps, each with a C++ engine compiled to
WebAssembly and a TypeScript frontend. GitHub Pages hosts the collection at
`https://ravisumit33.github.io/build-box/`, with each app under its own path.

## Local development

Requires Git, CMake 3.20+, Emscripten, and Node.js (the pinned version is in
`.node-version`). The setup command installs the shared, pinned Emscripten SDK
and runs `npm ci` for every registered app:

```sh
npm run setup
npm run dev -- --app connect-four
```

Development builds the app's Wasm engine first, then starts its Vite server at
`http://127.0.0.1:5173/`. Rerun the dev command after changing C++ sources.

To set up only one app:

```sh
npm run setup -- --app connect-four
```

## Build and preview

```sh
npm run build
npm run preview
```

The full build compiles every registered C++ engine, builds each frontend with
its app-specific base URL, and assembles the landing page plus all apps in
`site-dist/`. Preview serves that artifact at
`http://127.0.0.1:4173/build-box/`

Build just one app without replacing the collection artifact:

```sh
npm run build -- --app connect-four
```

## Apps

- [Connect Four](https://ravisumit33.github.io/build-box/connect-four/) - A two-player game. Drop discs into a column and connect four to win.
