import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { CellPosition, GameClientApi, GameSnapshot, PlayerId, WinningLine } from "./game-client";

interface AppProps {
  loadClient: () => Promise<GameClientApi>;
}

interface WinningLinesProps {
  boardRef: RefObject<HTMLDivElement | null>;
  winningLines: WinningLine[];
}

interface Point {
  x: number;
  y: number;
}

interface WinningGeometry {
  width: number;
  height: number;
  lines: { start: Point; end: Point }[];
}

type Phase = "loading" | "ready" | "unavailable" | "failed";

function PlayerName({ playerId }: { playerId: PlayerId | null }) {
  return (
    <span className={`player-name ${playerId === 1 ? "red" : "yellow"}`}>
      {playerId === 1 ? "Red" : "Yellow"}
    </span>
  );
}

function WinningLines({ boardRef, winningLines }: WinningLinesProps) {
  const [geometry, setGeometry] = useState<WinningGeometry | null>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) {
      throw new Error("The game board is missing.");
    }

    const measure = () => {
      const bounds = board.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        setGeometry(null);
        return;
      }

      const disc = ({ row, column }: CellPosition) => {
        const element = board.querySelector(
          `[data-row="${row}"][data-column="${column}"]`,
        );
        if (!element) {
          throw new Error(`Winning cell at row ${row}, column ${column} is missing.`);
        };
        const cell = element.getBoundingClientRect();
        return {
          x: cell.left + cell.width / 2 - bounds.left,
          y: cell.top + cell.height / 2 - bounds.top,
          radius: Math.min(cell.width, cell.height) / 2,
        };
      }

      setGeometry({
        width: bounds.width,
        height: bounds.height,
        lines: winningLines.map((cells) => {
          const first = disc(cells[0]);
          const last = disc(cells[cells.length - 1]);
          const dx = last.x - first.x;
          const dy = last.y - first.y;
          const length = Math.hypot(dx, dy);
          const directionX = dx / length;
          const directionY = dy / length;
          return {
            start: {
              x: first.x - directionX * first.radius,
              y: first.y - directionY * first.radius,
            },
            end: {
              x: last.x + directionX * last.radius,
              y: last.y + directionY * last.radius,
            },
          };
        }),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [boardRef, winningLines]);

  if (!geometry) {
    return null;
  }

  return (
    <svg
      className="winning-lines"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {geometry.lines.map(({ start, end }, index) => (
        <line
          key={index}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
        />
      ))}
    </svg>
  );
}

export function App({ loadClient }: AppProps) {
  const clientRef = useRef<GameClientApi | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<number | null>(null);

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
          setErrorMessage("Could not load the game");
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
      const message = "The game encountered an error. Reload the page to try again.";
      console.error(message, error);
      setPhase("failed");
      setErrorMessage(message);
    }
  }

  function makeMove(column: number) {
    setHoveredColumn(null);
    setFocusedColumn(null);
    runAction((client) => {
      if (!client.makeMove(column)) {
        setErrorMessage("That move is not allowed. Choose an available column.");
      }
    });
  }

  let statusMessage: ReactNode = "Loading game...";
  if (phase === "unavailable") {
    statusMessage = "Game unavailable";
  } else if (snapshot?.state === "won") {
    statusMessage = (
      <>
        <PlayerName playerId={snapshot.winnerId} />
        {" wins!"}
      </>
    );
  } else if (snapshot?.state === "draw") {
    statusMessage = "It's a draw!";
  } else if (snapshot) {
    statusMessage = (
      <>
        <PlayerName playerId={snapshot.currentPlayerId} />
        {"'s turn"}
      </>
    );
  }

  const active = phase === "ready" && snapshot?.state === "in_progress";
  const topRow = snapshot?.board[0] ?? [];
  const selectedColumn = hoveredColumn ?? focusedColumn;
  const previewColumn =
    active && selectedColumn !== null && topRow[selectedColumn] === null
      ? selectedColumn
      : null;
  const previewRow = previewColumn === null
    ? -1
    : snapshot?.board.reduce(
      (landingRow, row, index) => row[previewColumn] === null ? index : landingRow,
      -1,
    ) ?? -1;
  const previewColor = snapshot?.currentPlayerId === 1 ? "red" : "yellow";
  const winningLines = snapshot?.state === "won" ? snapshot.winningLines : [];
  const winningCells = new Set(
    winningLines.flat().map(({ row, column }) => `${row}-${column}`),
  );

  return (
    <main>
      <h1>Connect Four</h1>
      <p>Connect four discs horizontally, vertically, or diagonally.</p>
      <p id="status" role="status" aria-live="polite">{statusMessage}</p>
      <p id="instructions">
        Click or tap anywhere in a column to drop a disc.
        {" "}It falls to the lowest empty space.
      </p>
      <div
        className="game"
        onPointerLeave={() => setHoveredColumn(null)}
      >
        <div id="columns" className="columns" role="group" aria-label="Choose a column">
          {topRow.map((cell, column) => (
            <button
              key={column}
              type="button"
              data-column={column}
              aria-label={`Drop a disc in column ${column + 1}`}
              aria-describedby="instructions"
              disabled={!active || cell !== null}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") {
                  setHoveredColumn(column);
                }
              }}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) {
                  setFocusedColumn(column);
                }
              }}
              onBlur={() => setFocusedColumn(null)}
              onClick={() => makeMove(column)}
            >
              <span className="drop-label" aria-hidden="true">Drop</span>
              <span aria-hidden="true">{column + 1}</span>
            </button>
          ))}
        </div>
        <div
          id="board"
          ref={boardRef}
          className="board"
          role="group"
          aria-label="Connect Four board"
        >
          {snapshot?.board.map((rowCells, row) =>
            rowCells.map((color, column) => {
              const preview = row === previewRow && column === previewColumn;
              return (
                <div
                  key={`${row}-${column}`}
                  className={`cell ${color ?? (preview ? previewColor : "empty")}${
                    preview ? " preview" : ""
                  }`}
                  data-row={row}
                  data-column={column}
                  role="img"
                  aria-label={`Row ${row + 1}, column ${column + 1}: ${color ?? "empty"}${
                    winningCells.has(`${row}-${column}`) ? ", winning cell" : ""
                  }`}
                />
              );
            }),
          )}
          <div className="board-columns">
            {topRow.map((cell, column) => (
              <button
                key={column}
                className={`board-column${column === previewColumn ? " highlighted" : ""}`}
                type="button"
                data-column={column}
                aria-label={`Drop a disc in column ${column + 1}${cell !== null ? " (full)" : ""}`}
                aria-describedby="instructions"
                disabled={!active || cell !== null}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") {
                    setHoveredColumn(column);
                  }
                }}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) {
                    setFocusedColumn(column);
                  }
                }}
                onBlur={() => setFocusedColumn(null)}
                onClick={() => makeMove(column)}
              />
            ))}
          </div>
          {winningLines.length > 0 && (
            <WinningLines boardRef={boardRef} winningLines={winningLines} />
          )}
        </div>
      </div>
      <p id="error" role="alert">{errorMessage}</p>
      <button
        id="restart"
        type="button"
        disabled={phase !== "ready"}
        onClick={() => runAction((client) => client.reset())}
      >
        New game
      </button>
    </main>
  );
}
