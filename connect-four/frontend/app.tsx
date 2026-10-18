import type { ReactNode } from "react";
import { GameBoard } from "./components/game-board";
import { GameSettingsForm } from "./components/game-settings-form";
import { PlayerName } from "./components/player-name";
import type { GameClientApi } from "./game-client";
import { useGame } from "./use-game";

interface AppProps {
  loadClient: () => Promise<GameClientApi>;
}

export function App({ loadClient }: AppProps) {
  const {
    snapshot,
    phase,
    errorMessage,
    settings,
    activeSettings,
    computerTurn,
    active,
    selectedColumn,
    setSettings,
    setHoveredColumn,
    setFocusedColumn,
    makeMove,
    newGame,
  } = useGame(loadClient);
  const controlsDisabled = phase === "loading" || phase === "unavailable";

  let statusMessage: ReactNode = "Loading game...";
  if (phase === "unavailable") {
    statusMessage = "Game unavailable";
  } else if (phase === "failed") {
    statusMessage = "Game paused";
  } else if (snapshot?.state === "won") {
    statusMessage = (
      <>
        <PlayerName playerId={snapshot.winnerId} />
        {" wins!"}
      </>
    );
  } else if (snapshot?.state === "draw") {
    statusMessage = "It's a draw!";
  } else if (computerTurn) {
    statusMessage = "Computer is thinking...";
  } else if (snapshot) {
    statusMessage = (
      <>
        <PlayerName playerId={snapshot.currentPlayerId} />
        {"'s turn"}
      </>
    );
  }

  return (
    <main>
      <h1>Connect Four</h1>
      <p>Connect four discs horizontally, vertically, or diagonally.</p>
      <GameSettingsForm
        settings={settings}
        disabled={controlsDisabled}
        onChange={setSettings}
        onApply={newGame}
      />
      {snapshot && (
        <p id="match">
          {activeSettings.mode === "computer" ? (
            <>
              <span>
                {"You: "}
                <PlayerName playerId={activeSettings.humanPlayerId} />
              </span>
              {" "}
              <span>
                {"Computer: "}
                <PlayerName playerId={activeSettings.humanPlayerId === 1 ? 2 : 1} />
              </span>
            </>
          ) : "Two players"}
        </p>
      )}
      <p id="status" role="status" aria-live="polite">{statusMessage}</p>
      <p id="instructions">
        Click or tap anywhere in a column to drop a disc.
        {" "}It falls to the lowest empty space.
      </p>
      <GameBoard
        snapshot={snapshot}
        active={active}
        computerTurn={computerTurn}
        selectedColumn={selectedColumn}
        onHoverColumn={setHoveredColumn}
        onFocusColumn={setFocusedColumn}
        onMove={makeMove}
      />
      <p id="error" role="alert">{errorMessage}</p>
      <button
        id="restart"
        type="button"
        disabled={controlsDisabled}
        onClick={newGame}
      >
        New game
      </button>
      {(phase === "unavailable" || phase === "failed") && (
        <button id="reload" type="button" onClick={() => window.location.reload()}>
          Reload / retry
        </button>
      )}
    </main>
  );
}
