import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import gameIcon from "./assets/connect-four.gif";
import gameIconStill from "./assets/connect-four-still.svg";
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
    restartNoticeId,
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
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const controlsDisabled = phase === "loading" || phase === "unavailable";
  const settingsChanged =
    settings.mode !== activeSettings.mode ||
    settings.difficulty !== activeSettings.difficulty ||
    settings.humanPlayerId !== activeSettings.humanPlayerId;
  const difficultyLabel =
    activeSettings.difficulty.charAt(0).toUpperCase() +
    activeSettings.difficulty.slice(1);

  useEffect(() => {
    const panel = settingsPanelRef.current;
    if (restartNoticeId !== null && panel?.matches(":popover-open")) {
      panel.hidePopover();
      settingsTriggerRef.current?.focus();
    }
  }, [restartNoticeId]);

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
      <header className="game-header">
        <h1>Connect Four</h1>
        <button
          ref={settingsTriggerRef}
          className="settings-trigger"
          type="button"
          popoverTarget="game-settings"
          aria-haspopup="dialog"
          disabled={controlsDisabled}
        >
          Settings
        </button>
      </header>
      <picture className="game-icon">
        <source
          media="(prefers-reduced-motion: reduce)"
          srcSet={gameIconStill}
        />
        <img src={gameIcon} width="56" height="48" alt="" />
      </picture>
      <p>Connect four discs horizontally, vertically, or diagonally.</p>
      <div
        ref={settingsPanelRef}
        id="game-settings"
        className="settings-panel"
        popover="auto"
        role="dialog"
        aria-labelledby="settings-heading"
        onToggle={(event) => {
          if (event.currentTarget.matches(":popover-open")) {
            event.currentTarget.querySelector("select")?.focus();
          }
        }}
      >
        <div className="settings-panel-header">
          <h2 id="settings-heading">Game settings</h2>
          <button
            className="settings-close"
            type="button"
            popoverTarget="game-settings"
            popoverTargetAction="hide"
            aria-label="Close settings"
            onClick={() => settingsTriggerRef.current?.focus()}
          >
            Close
          </button>
        </div>
        <GameSettingsForm
          settings={settings}
          disabled={controlsDisabled}
          hasChanges={settingsChanged}
          onChange={setSettings}
          onApply={newGame}
        />
      </div>
      {snapshot && (
        <p id="match">
          {activeSettings.mode === "computer" ? (
            <>
              <span>
                {"You: "}
                <PlayerName playerId={activeSettings.humanPlayerId} />
              </span>{" "}
              <span>
                {`Computer(${difficultyLabel}): `}
                <PlayerName
                  playerId={activeSettings.humanPlayerId === 1 ? 2 : 1}
                />
              </span>
            </>
          ) : (
            "Two players"
          )}
        </p>
      )}
      <p id="status" role="status" aria-live="polite">
        {statusMessage}
      </p>
      <div
        id="game-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {restartNoticeId !== null && phase === "ready" && (
          <span key={restartNoticeId} className="game-notice">
            New game started.
          </span>
        )}
      </div>
      <p id="instructions">
        Click or tap anywhere in a column to drop a disc. It falls to the lowest
        empty space.
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
      <p id="error" role="alert">
        {errorMessage}
      </p>
      <button
        id="restart"
        type="button"
        disabled={controlsDisabled}
        onClick={newGame}
      >
        New game
      </button>
      {(phase === "unavailable" || phase === "failed") && (
        <button
          id="reload"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload / retry
        </button>
      )}
    </main>
  );
}
