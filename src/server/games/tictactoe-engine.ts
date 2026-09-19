/**
 * WATER AI CLOUD — TicTacToe Engine (rebuilt from scratch)
 * 3x3 board, full minimax for Hard, ownership-safe.
 */

export type TttCell = "X" | "O" | null;
export type TttBoard = TttCell[]; // length 9, row-major

export interface TttState {
  board: TttBoard;
  turn: "X" | "O";
  status: "playing" | "won" | "draw";
  winner: "X" | "O" | null;
  playerX?: string;
  playerO?: string;
  isAi: boolean;
  difficulty: "easy" | "normal" | "hard";
  scores: { win: number; lose: number; draw: number };
  startedAt: number;
  lastMoveAt: number;
}

export function createTttState(opts: {
  isAi?: boolean;
  difficulty?: "easy" | "normal" | "hard";
  playerX?: string;
  first?: "X" | "O";
} = {}): TttState {
  return {
    board: Array(9).fill(null),
    turn: opts.first ?? "X",
    status: "playing",
    winner: null,
    playerX: opts.playerX,
    playerO: opts.isAi ? "AI" : undefined,
    isAi: opts.isAi ?? true,
    difficulty: opts.difficulty ?? "hard",
    scores: { win: 0, lose: 0, draw: 0 },
    startedAt: Date.now(),
    lastMoveAt: Date.now(),
  };
}

const WINS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function checkWinner(board: TttBoard): "X" | "O" | "draw" | null {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as "X" | "O";
    }
  }
  if (board.every((c) => c !== null)) return "draw";
  return null;
}

export function tryTttMove(
  state: TttState,
  cell: number
): { ok: true; state: TttState } | { ok: false; msg: string } {
  if (state.status !== "playing") return { ok: false, msg: "Game sudah selesai." };
  if (cell < 0 || cell > 8) return { ok: false, msg: "Kotak tidak valid (0-8)." };
  if (state.board[cell] !== null) return { ok: false, msg: "Kotak sudah terisi." };

  const board = state.board.slice() as TttBoard;
  board[cell] = state.turn;

  const result = checkWinner(board);
  const next: TttState = {
    ...state,
    board,
    lastMoveAt: Date.now(),
  };

  if (result === "X" || result === "O") {
    next.status = "won";
    next.winner = result;
  } else if (result === "draw") {
    next.status = "draw";
    next.winner = null;
  } else {
    next.turn = state.turn === "X" ? "O" : "X";
  }

  return { ok: true, state: next };
}

function available(board: TttBoard): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i);
  return out;
}

/** Classic minimax. Returns best score for the maximizing player (X). */
function minimax(board: TttBoard, isMax: boolean): number {
  const res = checkWinner(board);
  if (res === "X") return 10;
  if (res === "O") return -10;
  if (res === "draw") return 0;

  if (isMax) {
    let best = -Infinity;
    for (const i of available(board)) {
      board[i] = "X";
      best = Math.max(best, minimax(board, false));
      board[i] = null;
    }
    return best;
  }
  let best = Infinity;
  for (const i of available(board)) {
    board[i] = "O";
    best = Math.min(best, minimax(board, true));
    board[i] = null;
  }
  return best;
}

export function chooseTttAiMove(state: TttState): number | null {
  const empties = available(state.board);
  if (!empties.length) return null;

  const ai = state.turn; // AI plays the current turn
  const human = ai === "X" ? "O" : "X";

  if (state.difficulty === "easy") {
    return empties[Math.floor(Math.random() * empties.length)];
  }

  if (state.difficulty === "normal") {
    // Win if possible, block if needed, else random
    for (const i of empties) {
      const b = state.board.slice() as TttBoard;
      b[i] = ai;
      if (checkWinner(b) === ai) return i;
    }
    for (const i of empties) {
      const b = state.board.slice() as TttBoard;
      b[i] = human;
      if (checkWinner(b) === human) return i;
    }
    // center / corner preference
    if (empties.includes(4)) return 4;
    const corners = [0, 2, 6, 8].filter((i) => empties.includes(i));
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    return empties[Math.floor(Math.random() * empties.length)];
  }

  // Hard — full minimax
  let bestScore = ai === "X" ? -Infinity : Infinity;
  let bestMove = empties[0];
  const board = state.board.slice() as TttBoard;

  for (const i of empties) {
    board[i] = ai;
    const score = minimax(board, ai !== "X");
    board[i] = null;
    if (ai === "X") {
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    } else if (score < bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

export function resetTtt(state: TttState, first?: "X" | "O"): TttState {
  return {
    ...state,
    board: Array(9).fill(null),
    turn: first ?? "X",
    status: "playing",
    winner: null,
    startedAt: Date.now(),
    lastMoveAt: Date.now(),
  };
}
