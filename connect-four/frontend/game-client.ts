export type PlayerId = 1 | 2;
export type DiscColor = "red" | "yellow";
export type GameState = "not_started" | "in_progress" | "won" | "draw";
export type Difficulty = "easy" | "medium" | "hard";

interface PendingSearch {
  timeout: number | undefined;
  reject: (error: Error) => void;
}

export interface ComputerSearch {
  state: "ready" | "cancelled" | "error";
  requestId: number;
  column: number | null;
  completedDepth: number;
  error: string;
}

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

// Native sessions invalidate searches on successful moves and resets.
export interface GameSession {
  makeMove(column: number): boolean;
  getSnapshot(): GameSnapshot;
  reset(): void;
  startComputerSearch(
    difficulty: Difficulty,
    requestId: number,
    complete: (result: ComputerSearch) => void,
  ): void;
  cancelComputerSearch(): void;
  delete(): void;
}

export interface ConnectFourModule {
  GameSession: new () => GameSession;
}

export type ConnectFourFactory = (options?: {
  onAbort?: (reason: unknown) => void;
}) => Promise<ConnectFourModule>;

export class GameClient {
  #session: GameSession | null;
  #columnCount: number;
  #requestId = 0;
  #pending: PendingSearch | null = null;

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
    const moved = session.makeMove(column);
    if (moved) {
      this.#rejectPendingSearch();
    }
    return moved;
  }

  getSnapshot(): GameSnapshot {
    return this.#getSession().getSnapshot();
  }

  reset(): void {
    this.#rejectPendingSearch();
    this.#getSession().reset();
  }

  requestComputerMove(difficulty: Difficulty): Promise<number> {
    this.cancelComputerMove();
    const session = this.#getSession();
    const requestId = this.#requestId = this.#requestId % 2147483647 + 1;
    return new Promise((resolve, reject) => {
      const pending: PendingSearch = { timeout: undefined, reject };
      this.#pending = pending;
      const finish = () => {
        if (this.#pending !== pending) {
          return false;
        }
        window.clearTimeout(pending.timeout);
        this.#pending = null;
        return true;
      };
      const complete = (result: ComputerSearch) => {
        if (!finish()) {
          return;
        }
        try {
          if (result.requestId !== requestId) {
            throw new Error("The computer returned an unexpected search result.");
          }
          if (result.state === "error") {
            throw new Error(result.error || "The computer search failed.");
          }
          if (result.state === "cancelled") {
            throw new DOMException("Computer search cancelled.", "AbortError");
          }
          if (result.state !== "ready" || result.column === null ||
              !Number.isInteger(result.column) || result.column < 0 ||
              result.column >= this.#columnCount) {
            throw new Error("The computer returned an invalid move.");
          }
          resolve(result.column);
        } catch (error) {
          reject(error);
        }
      };
      pending.timeout = window.setTimeout(() => {
        if (finish()) {
          try {
            session.cancelComputerSearch();
          } finally {
            reject(new Error("The computer did not respond. Start a new game or reload."));
          }
        }
      }, 10000);
      try {
        session.startComputerSearch(difficulty, requestId, complete);
      } catch (error) {
        if (finish()) {
          reject(error);
        }
      }
    });
  }

  cancelComputerMove(): void {
    this.#rejectPendingSearch();
    this.#session?.cancelComputerSearch();
  }

  dispose(): void {
    if (this.#session !== null) {
      try {
        this.cancelComputerMove();
      } finally {
        this.#session.delete();
        this.#session = null;
      }
    }
  }

  #rejectPendingSearch(): void {
    if (this.#pending) {
      const pending = this.#pending;
      this.#pending = null;
      window.clearTimeout(pending.timeout);
      pending.reject(new DOMException("Computer search cancelled.", "AbortError"));
    }
  }

  #getSession(): GameSession {
    if (this.#session === null) {
      throw new Error("This game session has been disposed.");
    }
    return this.#session;
  }
}

export type GameClientApi = Pick<GameClient,
  "makeMove" | "getSnapshot" | "reset" | "dispose" |
  "requestComputerMove" | "cancelComputerMove">;

const modules = new Map<string, Promise<ConnectFourModule>>();

export function checkThreadSupport(): void {
  if (!globalThis.crossOriginIsolated) {
    throw new Error(
      "This game requires cross-origin isolation for C++ threads. " +
      "Use the configured dev/preview server, or check the site's COOP/COEP headers.",
    );
  }
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error("Shared memory is unavailable. Check your browser's security settings.");
  }
  try {
    new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  } catch (cause) {
    throw new Error("Your browser cannot initialize shared WebAssembly memory.", { cause });
  }
}

export async function createGameClient(
  moduleUrl = new URL(
    "connect_four.js",
    new URL(import.meta.env.BASE_URL, window.location.href),
  ).href,
): Promise<GameClient> {
  checkThreadSupport();
  let module = modules.get(moduleUrl);
  if (!module) {
    module = new Promise<ConnectFourModule>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(
        "The threaded engine did not finish loading. Check worker/network " +
        "permissions and the site's COOP/COEP headers, then reload to retry.",
      )), 15000);
      const fail = (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(
          "The threaded engine could not initialize. Reload to retry.",
          { cause: error },
        ));
      };
      import(/* @vite-ignore */ moduleUrl).then(
        ({ default: createConnectFour }: { default: ConnectFourFactory }) =>
          createConnectFour({
            onAbort: (reason) => fail(new Error(
              `The threaded engine aborted: ${String(reason)}. Reload to retry.`,
            )),
          }),
      ).then((loaded) => {
        window.clearTimeout(timer);
        resolve(loaded);
      }, fail);
    });
    modules.set(moduleUrl, module);
    module.catch(() => {
      modules.delete(moduleUrl);
    });
  }
  return new GameClient(await module);
}
