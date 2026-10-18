import { useRef } from "react";
import type { GameSnapshot } from "../game-client";
import { WinningLines } from "./winning-lines";

interface GameBoardProps {
  snapshot: GameSnapshot | null;
  active: boolean;
  computerTurn: boolean;
  selectedColumn: number | null;
  onHoverColumn: (column: number | null) => void;
  onFocusColumn: (column: number | null) => void;
  onMove: (column: number) => void;
}

export function GameBoard({
  snapshot,
  active,
  computerTurn,
  selectedColumn,
  onHoverColumn,
  onFocusColumn,
  onMove,
}: GameBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const topRow = snapshot?.board[0] ?? [];
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
    <div
      className="game"
      aria-busy={computerTurn}
      onPointerLeave={() => onHoverColumn(null)}
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
                onHoverColumn(column);
              }
            }}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                onFocusColumn(column);
              }
            }}
            onBlur={() => onFocusColumn(null)}
            onClick={() => onMove(column)}
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
                  onHoverColumn(column);
                }
              }}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) {
                  onFocusColumn(column);
                }
              }}
              onBlur={() => onFocusColumn(null)}
              onClick={() => onMove(column)}
            />
          ))}
        </div>
        {winningLines.length > 0 && (
          <WinningLines boardRef={boardRef} winningLines={winningLines} />
        )}
      </div>
    </div>
  );
}
