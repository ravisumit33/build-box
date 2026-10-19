import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../app";
import { createGameClient } from "../game-client";
import type { GameClientApi } from "../game-client";
import "../styles.css";

const element = document.getElementById("root");
if (!element) {
  throw new Error("Test root is missing.");
}
const root = createRoot(element);
const mode = new URLSearchParams(location.search).get("mode");
let searchRequests = 0;
const loadClient = async (): Promise<GameClientApi> => {
  const client = await createGameClient();
  return {
    makeMove: (column) => client.makeMove(column),
    getSnapshot: () => client.getSnapshot(),
    reset: () => {
      if (mode === "reset-error") {
        throw new Error("Injected reset failure");
      }
      client.reset();
    },
    cancelComputerMove: () => client.cancelComputerMove(),
    dispose: () => client.dispose(),
    requestComputerMove: (difficulty) => {
      if (mode === "search-error") {
        return Promise.reject(new Error("Injected search failure"));
      }
      if (mode === "instant-search" || mode === "slow-search") {
        document.documentElement.dataset.computerSearches = String(++searchRequests);
        return mode === "instant-search"
          ? Promise.resolve(3)
          : new Promise<number>((resolve) => window.setTimeout(() => resolve(3), 800));
      }
      return client.requestComputerMove(difficulty);
    },
  };
};

if (mode !== "native-bindings") {
  root.render(<StrictMode><App loadClient={loadClient} /></StrictMode>);
  document.addEventListener("unmount-game", () => root.unmount());
}
