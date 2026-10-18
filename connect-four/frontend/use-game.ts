import { useEffect, useRef, useState } from "react";
import type {
  Difficulty,
  GameClientApi,
  GameSnapshot,
  PlayerId,
} from "./game-client";

type Phase = "loading" | "ready" | "unavailable" | "failed";

export interface GameSettings {
  mode: "computer" | "two_players";
  difficulty: Difficulty;
  humanPlayerId: PlayerId;
}

const initialSettings: GameSettings = {
  mode: "computer",
  difficulty: "medium",
  humanPlayerId: 1,
};

export function useGame(loadClient: () => Promise<GameClientApi>) {
  const clientRef = useRef<GameClientApi | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<number | null>(null);
  const [settings, setSettings] = useState<GameSettings>(initialSettings);
  const [activeSettings, setActiveSettings] =
    useState<GameSettings>(initialSettings);
  const generationRef = useRef(0);
  const computerTurn =
    phase === "ready" &&
    snapshot?.state === "in_progress" &&
    activeSettings.mode === "computer" &&
    snapshot.currentPlayerId !== activeSettings.humanPlayerId;
  const active =
    phase === "ready" && snapshot?.state === "in_progress" && !computerTurn;

  useEffect(() => {
    let cancelled = false;
    let ownedClient: GameClientApi | null = null;
    setSnapshot(null);
    setPhase("loading");
    setErrorMessage("");

    function disposeClient() {
      if (ownedClient) {
        if (clientRef.current === ownedClient) {
          clientRef.current = null;
        }
        ownedClient.dispose();
        ownedClient = null;
      }
    }

    async function initialize() {
      try {
        ownedClient = await loadClient();
        if (cancelled) {
          disposeClient();
          return;
        }
        const initialSnapshot = ownedClient.getSnapshot();
        clientRef.current = ownedClient;
        setSnapshot(initialSnapshot);
        setPhase("ready");
      } catch (error) {
        disposeClient();
        console.error("Could not load the game", error);
        if (!cancelled) {
          setPhase("unavailable");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load the game. Reload the page to try again.",
          );
        }
      }
    }

    function handlePageHide(event: PageTransitionEvent) {
      if (!event.persisted) {
        cancelled = true;
        disposeClient();
      }
    }

    window.addEventListener("pagehide", handlePageHide);
    void initialize();
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", handlePageHide);
      disposeClient();
    };
  }, [loadClient]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !computerTurn || !snapshot) {
      return;
    }
    let cancelled = false;
    const generation = generationRef.current;
    const expectedPlayer = snapshot.currentPlayerId;
    async function move(client: GameClientApi) {
      try {
        const column = await client.requestComputerMove(
          activeSettings.difficulty,
        );
        if (
          cancelled ||
          generation !== generationRef.current ||
          clientRef.current !== client
        ) {
          return;
        }
        const current = client.getSnapshot();
        if (
          current.state !== "in_progress" ||
          current.currentPlayerId !== expectedPlayer ||
          !client.makeMove(column)
        ) {
          throw new Error("The computer move does not match the current game.");
        }
        setHoveredColumn(null);
        setFocusedColumn(null);
        setSnapshot(client.getSnapshot());
      } catch (error) {
        if (cancelled || generation !== generationRef.current) {
          return;
        }
        console.error("Computer move failed", error);
        setErrorMessage(
          "The computer could not move. Start a new game or reload to try again.",
        );
        setPhase("failed");
      }
    }
    void move(client);
    return () => {
      cancelled = true;
      client.cancelComputerMove();
    };
  }, [computerTurn, snapshot, activeSettings]);

  function runAction(action: (client: GameClientApi) => void) {
    const client = clientRef.current;
    if (!client || phase !== "ready") {
      return;
    }
    try {
      setErrorMessage("");
      action(client);
      setSnapshot(client.getSnapshot());
    } catch (error) {
      const message =
        "The game encountered an error. Reload the page to try again.";
      console.error(message, error);
      setPhase("failed");
      setErrorMessage(message);
    }
  }

  function makeMove(column: number) {
    if (!active) {
      return;
    }
    setHoveredColumn(null);
    setFocusedColumn(null);
    runAction((client) => {
      if (
        activeSettings.mode === "computer" &&
        client.getSnapshot().currentPlayerId !== activeSettings.humanPlayerId
      ) {
        return;
      }
      if (!client.makeMove(column)) {
        setErrorMessage(
          "That move is not allowed. Choose an available column.",
        );
      }
    });
  }

  function newGame() {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    ++generationRef.current;
    try {
      client.reset();
      setHoveredColumn(null);
      setFocusedColumn(null);
      setErrorMessage("");
      setActiveSettings({ ...settings });
      setSnapshot(client.getSnapshot());
      setPhase("ready");
    } catch (error) {
      console.error("Could not start a new game", error);
      setErrorMessage(
        "Could not start a new game. Reload the page to try again.",
      );
      setPhase("failed");
    }
  }

  return {
    snapshot,
    phase,
    errorMessage,
    settings,
    activeSettings,
    computerTurn,
    active,
    selectedColumn: hoveredColumn ?? focusedColumn,
    setSettings,
    setHoveredColumn,
    setFocusedColumn,
    makeMove,
    newGame,
  };
}
