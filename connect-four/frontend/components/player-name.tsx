import type { PlayerId } from "../game-client";

export function PlayerName({ playerId }: { playerId: PlayerId | null }) {
  return (
    <span className={`player-name ${playerId === 1 ? "red" : "yellow"}`}>
      {playerId === 1 ? "Red" : "Yellow"}
    </span>
  );
}
