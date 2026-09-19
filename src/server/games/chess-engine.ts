/**
 * WATER AI CLOUD — Chess Engine (rebuilt from scratch)
 * Authoritative pure-JS chess rules + difficulty-based AI.
 */

export type Color = "w" | "b";
export type Piece =
  | "K" | "Q" | "R" | "B" | "N" | "P"
  | "k" | "q" | "r" | "b" | "n" | "p";
export type Board = (Piece | null)[][];

export interface ChessState {
  board: Board;
  turn: Color;
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassant: string | null;
  halfmove: number;
  fullmove: number;
  history: string[];
  status: "playing" | "check" | "checkmate" | "stalemate" | "draw" | "resigned";
  winner: Color | null;
  selected: string | null;
  targets: string[];
  whitePlayer?: string;
  blackPlayer?: string;
  isAi: boolean;
  difficulty: "easy" | "normal" | "hard";
  startedAt: number;
  lastMoveAt: number;
}

const FILES = "abcdefgh";

export function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

export function initialBoard(): Board {
  const b = emptyBoard();
  const back: Piece[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let i = 0; i < 8; i++) {
    b[0][i] = back[i].toLowerCase() as Piece;
    b[1][i] = "p";
    b[6][i] = "P";
    b[7][i] = back[i];
  }
  return b;
}

export function createChessState(opts: {
  isAi?: boolean;
  difficulty?: "easy" | "normal" | "hard";
  whitePlayer?: string;
  blackPlayer?: string;
} = {}): ChessState {
  return {
    board: initialBoard(),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    history: [],
    status: "playing",
    winner: null,
    selected: null,
    targets: [],
    whitePlayer: opts.whitePlayer,
    blackPlayer: opts.blackPlayer,
    isAi: opts.isAi ?? true,
    difficulty: opts.difficulty ?? "normal",
    startedAt: Date.now(),
    lastMoveAt: Date.now(),
  };
}

export function parseSquare(s: string): { r: number; c: number } | null {
  if (!/^[a-h][1-8]$/i.test(s)) return null;
  const c = s.toLowerCase().charCodeAt(0) - 97;
  const r = 8 - parseInt(s[1], 10);
  return { r, c };
}

export function squareName(r: number, c: number): string {
  return FILES[c] + (8 - r);
}

function isWhite(p: Piece | null): boolean {
  return !!p && p === p.toUpperCase();
}

function isBlack(p: Piece | null): boolean {
  return !!p && p === p.toLowerCase();
}

function sameColor(a: Piece | null, b: Piece | null): boolean {
  if (!a || !b) return false;
  return isWhite(a) === isWhite(b);
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

function findKing(board: Board, color: Color): { r: number; c: number } | null {
  const target = color === "w" ? "K" : "k";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === target) return { r, c };
    }
  }
  return null;
}

function isAttacked(board: Board, r: number, c: number, byColor: Color): boolean {
  const enemy = byColor === "w";
  const pr = byColor === "w" ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (inBounds(pr, c + dc)) {
      const p = board[pr][c + dc];
      if (p && (enemy ? p === "P" : p === "p")) return true;
    }
  }
  for (const [dr, dc] of [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ]) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && (enemy ? p === "N" : p === "n")) return true;
    }
  }
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && (enemy ? p === "K" : p === "k")) return true;
      }
    }
  }
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const p = board[nr][nc];
      if (p) {
        if (enemy ? p === "R" || p === "Q" : p === "r" || p === "q") return true;
        break;
      }
    }
  }
  for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const p = board[nr][nc];
      if (p) {
        if (enemy ? p === "B" || p === "Q" : p === "b" || p === "q") return true;
        break;
      }
    }
  }
  return false;
}

export function isInCheck(board: Board, color: Color): boolean {
  const k = findKing(board, color);
  if (!k) return true;
  return isAttacked(board, k.r, k.c, color === "w" ? "b" : "w");
}

function rayMoves(
  board: Board,
  r: number,
  c: number,
  dirs: [number, number][]
): string[] {
  const out: string[] = [];
  const piece = board[r][c];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const t = board[nr][nc];
      if (!t) {
        out.push(squareName(nr, nc));
      } else {
        if (!sameColor(piece, t)) out.push(squareName(nr, nc));
        break;
      }
    }
  }
  return out;
}

function pseudoLegalTargets(
  board: Board,
  from: string,
  turn: Color,
  castling: ChessState["castling"],
  enPassant: string | null
): string[] {
  const sq = parseSquare(from);
  if (!sq) return [];
  const { r, c } = sq;
  const piece = board[r][c];
  if (!piece) return [];
  if (turn === "w" && !isWhite(piece)) return [];
  if (turn === "b" && !isBlack(piece)) return [];

  const targets: string[] = [];
  const color = turn;

  switch (piece.toUpperCase()) {
    case "P": {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const nr = r + dir;
      if (inBounds(nr, c) && !board[nr][c]) {
        targets.push(squareName(nr, c));
        if (r === startRow && !board[r + 2 * dir][c]) {
          targets.push(squareName(r + 2 * dir, c));
        }
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (inBounds(nr, nc)) {
          const t = board[nr][nc];
          if (t && !sameColor(piece, t)) targets.push(squareName(nr, nc));
        }
      }
      if (enPassant) {
        const ep = parseSquare(enPassant);
        if (ep && ep.r === nr && Math.abs(ep.c - c) === 1) {
          targets.push(enPassant);
        }
      }
      break;
    }
    case "N": {
      for (const [dr, dc] of [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ]) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) {
          const t = board[nr][nc];
          if (!t || !sameColor(piece, t)) targets.push(squareName(nr, nc));
        }
      }
      break;
    }
    case "B":
      targets.push(...rayMoves(board, r, c, [[1, 1], [1, -1], [-1, 1], [-1, -1]]));
      break;
    case "R":
      targets.push(...rayMoves(board, r, c, [[0, 1], [0, -1], [1, 0], [-1, 0]]));
      break;
    case "Q":
      targets.push(
        ...rayMoves(board, r, c, [
          [0, 1], [0, -1], [1, 0], [-1, 0],
          [1, 1], [1, -1], [-1, 1], [-1, -1],
        ])
      );
      break;
    case "K": {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc)) {
            const t = board[nr][nc];
            if (!t || !sameColor(piece, t)) targets.push(squareName(nr, nc));
          }
        }
      }
      if (color === "w" && r === 7 && c === 4) {
        if (
          castling.wK &&
          !board[7][5] &&
          !board[7][6] &&
          !isAttacked(board, 7, 4, "b") &&
          !isAttacked(board, 7, 5, "b") &&
          !isAttacked(board, 7, 6, "b")
        ) {
          targets.push("g1");
        }
        if (
          castling.wQ &&
          !board[7][3] &&
          !board[7][2] &&
          !board[7][1] &&
          !isAttacked(board, 7, 4, "b") &&
          !isAttacked(board, 7, 3, "b") &&
          !isAttacked(board, 7, 2, "b")
        ) {
          targets.push("c1");
        }
      }
      if (color === "b" && r === 0 && c === 4) {
        if (
          castling.bK &&
          !board[0][5] &&
          !board[0][6] &&
          !isAttacked(board, 0, 4, "w") &&
          !isAttacked(board, 0, 5, "w") &&
          !isAttacked(board, 0, 6, "w")
        ) {
          targets.push("g8");
        }
        if (
          castling.bQ &&
          !board[0][3] &&
          !board[0][2] &&
          !board[0][1] &&
          !isAttacked(board, 0, 4, "w") &&
          !isAttacked(board, 0, 3, "w") &&
          !isAttacked(board, 0, 2, "w")
        ) {
          targets.push("c8");
        }
      }
      break;
    }
  }
  return targets;
}

export function legalTargets(state: ChessState, from: string): string[] {
  const { board, turn, castling, enPassant } = state;
  const candidates = pseudoLegalTargets(board, from, turn, castling, enPassant);
  const legal: string[] = [];
  for (const to of candidates) {
    const next = applyMoveRaw(state, from, to);
    if (next && !isInCheck(next.board, turn)) legal.push(to);
  }
  return legal;
}

function applyMoveRaw(state: ChessState, from: string, to: string): ChessState | null {
  const a = parseSquare(from);
  const b = parseSquare(to);
  if (!a || !b) return null;
  const board = cloneBoard(state.board);
  const piece = board[a.r][a.c];
  if (!piece) return null;

  const next: ChessState = {
    ...state,
    board,
    castling: { ...state.castling },
    history: state.history.slice(),
    selected: null,
    targets: [],
  };

  if (piece.toUpperCase() === "P" && state.enPassant === to && !board[b.r][b.c]) {
    const capR = state.turn === "w" ? b.r + 1 : b.r - 1;
    board[capR][b.c] = null;
  }

  if (piece.toUpperCase() === "K" && Math.abs(b.c - a.c) === 2) {
    if (b.c === 6) {
      board[a.r][5] = board[a.r][7];
      board[a.r][7] = null;
    } else if (b.c === 2) {
      board[a.r][3] = board[a.r][0];
      board[a.r][0] = null;
    }
  }

  board[b.r][b.c] = piece;
  board[a.r][a.c] = null;

  if (piece === "P" && b.r === 0) board[b.r][b.c] = "Q";
  if (piece === "p" && b.r === 7) board[b.r][b.c] = "q";

  if (piece === "K") {
    next.castling.wK = false;
    next.castling.wQ = false;
  }
  if (piece === "k") {
    next.castling.bK = false;
    next.castling.bQ = false;
  }
  if (piece === "R" && a.r === 7 && a.c === 0) next.castling.wQ = false;
  if (piece === "R" && a.r === 7 && a.c === 7) next.castling.wK = false;
  if (piece === "r" && a.r === 0 && a.c === 0) next.castling.bQ = false;
  if (piece === "r" && a.r === 0 && a.c === 7) next.castling.bK = false;

  next.enPassant = null;
  if (piece.toUpperCase() === "P" && Math.abs(b.r - a.r) === 2) {
    next.enPassant = squareName((a.r + b.r) / 2, a.c);
  }

  next.halfmove =
    piece.toUpperCase() === "P" || !!state.board[b.r][b.c] ? 0 : state.halfmove + 1;
  if (state.turn === "b") next.fullmove = state.fullmove + 1;
  next.turn = state.turn === "w" ? "b" : "w";
  next.lastMoveAt = Date.now();
  next.history.push(from + to);

  return next;
}

export function tryMove(
  state: ChessState,
  from: string,
  to: string
): { ok: true; state: ChessState } | { ok: false; msg: string } {
  if (state.status !== "playing" && state.status !== "check") {
    return { ok: false, msg: "Game sudah selesai." };
  }
  const fromL = from.toLowerCase();
  const toL = to.toLowerCase();
  const legal = legalTargets(state, fromL);
  if (!legal.includes(toL)) {
    return { ok: false, msg: `Langkah ${fromL}${toL} tidak legal.` };
  }
  const next = applyMoveRaw(state, fromL, toL);
  if (!next) return { ok: false, msg: "Move gagal." };

  const opponent = next.turn;
  const hasLegal = hasAnyLegalMove(next);
  if (isInCheck(next.board, opponent)) {
    if (!hasLegal) {
      next.status = "checkmate";
      next.winner = state.turn;
    } else {
      next.status = "check";
    }
  } else if (!hasLegal) {
    next.status = "stalemate";
    next.winner = null;
  } else {
    next.status = "playing";
  }
  return { ok: true, state: next };
}

function hasAnyLegalMove(state: ChessState): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      if (state.turn === "w" && !isWhite(p)) continue;
      if (state.turn === "b" && !isBlack(p)) continue;
      if (legalTargets(state, squareName(r, c)).length > 0) return true;
    }
  }
  return false;
}

function evaluate(board: Board): number {
  const values: Record<string, number> = {
    P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
    p: -100, n: -320, b: -330, r: -500, q: -900, k: -20000,
  };
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        score += values[p] || 0;
        if ((r === 3 || r === 4) && (c === 3 || c === 4)) {
          score += isWhite(p) ? 10 : -10;
        }
      }
    }
  }
  return score;
}

function allLegalMoves(state: ChessState): { from: string; to: string }[] {
  const moves: { from: string; to: string }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      if (state.turn === "w" && !isWhite(p)) continue;
      if (state.turn === "b" && !isBlack(p)) continue;
      const from = squareName(r, c);
      for (const to of legalTargets(state, from)) {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

function minimax(
  state: ChessState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): number {
  if (depth === 0 || state.status === "checkmate" || state.status === "stalemate") {
    if (state.status === "checkmate") {
      return state.winner === "w" ? 100000 : state.winner === "b" ? -100000 : 0;
    }
    return evaluate(state.board);
  }
  const moves = allLegalMoves(state);
  if (!moves.length) return evaluate(state.board);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const m of moves) {
      const res = tryMove(state, m.from, m.to);
      if (!res.ok) continue;
      const val = minimax(res.state, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return maxEval;
  }
  let minEval = Infinity;
  for (const m of moves) {
    const res = tryMove(state, m.from, m.to);
    if (!res.ok) continue;
    const val = minimax(res.state, depth - 1, alpha, beta, true);
    minEval = Math.min(minEval, val);
    beta = Math.min(beta, val);
    if (beta <= alpha) break;
  }
  return minEval;
}

export function chooseAiMove(state: ChessState): { from: string; to: string } | null {
  const moves = allLegalMoves(state);
  if (!moves.length) return null;

  if (state.difficulty === "easy") {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (state.difficulty === "normal") {
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const res = tryMove(state, m.from, m.to);
      if (!res.ok) continue;
      let score = evaluate(res.state.board);
      if (res.state.status === "check" || res.state.status === "checkmate") score += 50;
      if (state.turn === "b") score = -score;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // hard — 2-ply minimax
  let best = moves[0];
  let bestScore = state.turn === "w" ? -Infinity : Infinity;
  for (const m of moves) {
    const res = tryMove(state, m.from, m.to);
    if (!res.ok) continue;
    const val = minimax(res.state, 1, -Infinity, Infinity, state.turn === "b");
    if (state.turn === "w") {
      if (val > bestScore) {
        bestScore = val;
        best = m;
      }
    } else if (val < bestScore) {
      bestScore = val;
      best = m;
    }
  }
  return best;
}

export function resign(state: ChessState, by: Color): ChessState {
  return {
    ...state,
    status: "resigned",
    winner: by === "w" ? "b" : "w",
    selected: null,
    targets: [],
  };
}

export function boardToFen(state: ChessState): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let row = "";
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) empty++;
      else {
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const castling =
    (state.castling.wK ? "K" : "") +
    (state.castling.wQ ? "Q" : "") +
    (state.castling.bK ? "k" : "") +
    (state.castling.bQ ? "q" : "") || "-";
  return `${rows.join("/")} ${state.turn} ${castling} ${state.enPassant || "-"} ${state.halfmove} ${state.fullmove}`;
}
