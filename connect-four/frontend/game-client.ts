export type PlayerId = 1 | 2;
export type DiscColor = "red" | "yellow";
export type GameState = "not_started" | "in_progress" | "won" | "draw";

export interface CellPosition {
  row: number;
  column: number;
}

export type WinningLine = CellPosition[];

export interface GameSnapshot {
  board: (DiscColor | null)[][];
  currentPlayerId: PlayerId;
  state: GameState;
  winnerId: PlayerId | null;
  winningLines: WinningLine[];
}

export interface GameSession {
  makeMove(column: number): boolean;
  getSnapshot(): GameSnapshot;
  reset(): void;
  delete(): void;
}

export interface ConnectFourModule {
  GameSession: new () => GameSession;
}

export type ConnectFourFactory = () => Promise<ConnectFourModule>;

export class GameClient {
  #session: GameSession | null;
  #columnCount: number;

  constructor(module: ConnectFourModule) {
    this.#session = new module.GameSession();
    this.#columnCount = this.#session.getSnapshot().board[0].length;
  }

  makeMove(column: number): boolean {
    const session = this.#getSession();
    if (!Number.isInteger(column) || column < 0 || column >= this.#columnCount) {
      throw new RangeError(
        `Column must be an integer from 0 to ${this.#columnCount - 1}.`,
      );
    }
    return session.makeMove(column);
  }

  getSnapshot(): GameSnapshot {
    return this.#getSession().getSnapshot();
  }

  reset(): void {
    this.#getSession().reset();
  }

  dispose(): void {
    if (this.#session !== null) {
      this.#session.delete();
      this.#session = null;
    }
  }

  #getSession(): GameSession {
    if (this.#session === null) {
      throw new Error("This game session has been disposed.");
    }
    return this.#session;
  }
}

export type GameClientApi = Pick<GameClient, "makeMove" | "getSnapshot" | "reset" | "dispose">;

export async function createGameClient(
  moduleUrl = new URL(
    "connect_four.js",
    new URL(import.meta.env.BASE_URL, window.location.href),
  ).href,
): Promise<GameClient> {
  const { default: createConnectFour }: { default: ConnectFourFactory } =
    await import(/* @vite-ignore */ moduleUrl);
  return new GameClient(await createConnectFour());
}
