import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import type { CellPosition, WinningLine } from "../game-client";

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

export function WinningLines({ boardRef, winningLines }: WinningLinesProps) {
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
        }
        const cell = element.getBoundingClientRect();
        return {
          x: cell.left + cell.width / 2 - bounds.left,
          y: cell.top + cell.height / 2 - bounds.top,
          radius: Math.min(cell.width, cell.height) / 2,
        };
      };

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
