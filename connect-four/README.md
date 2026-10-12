# Connect Four

A two-player browser game built with a C++ engine compiled to WebAssembly and a
React/TypeScript frontend. Players take turns dropping red and yellow discs into
a column. Connect four discs horizontally, vertically, or diagonally to win.

Click or tap anywhere in a board column (including an existing disc), or use its
**Drop** button above the board. Hover over or keyboard-focus a column to preview
where the current player's disc will land. The preview clears after each move;
hover over a column again or change keyboard focus to preview the next move.
Full columns and finished games cannot accept moves.

This app is part of the [Build Box collection](../README.md). Its public path is
`/build-box/connect-four/`.

## Build this app

From the collection root, set up the shared SDK and app dependencies:

```sh
npm run setup -- --app connect-four
npm run build -- --app connect-four
```

This generates `connect_four.js` and `connect_four.wasm` in `frontend/generated/`.
The frontend build is written to `frontend/dist/`. To rebuild only the engine
from the collection root:

```sh
source .tools/emsdk/emsdk_env.sh
npm --prefix connect-four/frontend run build:wasm
```

## Development

From the collection root:

```sh
npm run dev -- --app connect-four
```

Open <http://127.0.0.1:5173/>. To build and preview the complete collection:

```sh
npm run build
npm run preview
```

Open <http://127.0.0.1:4173/build-box/connect-four/>.
