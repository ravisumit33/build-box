import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { createGameClient } from "./game-client";
import "./styles.css";

const moduleUrl = new URL(`${import.meta.env.BASE_URL}connect_four.js`, document.baseURI);
const loadClient = () => createGameClient(moduleUrl.href);

const root = document.querySelector("#root");
if (!root) {
  throw new Error("The React root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App loadClient={loadClient} />
  </StrictMode>,
);
