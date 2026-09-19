"use client";

/**
 * Optional full web Chess experience.
 * Linked from WhatsApp when user wants browser canvas play.
 * Game state is local for demo; production can connect to bot session via API.
 */
import { useCallback, useMemo, useState } from "react";

type Piece = string | null;
type Board = Piece[][];

const PIECES: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function initial(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let i = 0; i < 8; i++) {
    b[0][i] = back[i].toLowerCase();
    b[1][i] = "p";
    b[6][i] = "P";
    b[7][i] = back[i];
  }
  return b;
}

export default function ChessWebPage() {
  const [board, setBoard] = useState<Board>(initial);
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState("Giliran Putih");

  const files = "abcdefgh";

  const onCell = useCallback(
    (r: number, c: number) => {
      const sq = files[c] + (8 - r);
      if (!selected) {
        const p = board[r][c];
        if (!p) return;
        if (turn === "w" && p !== p.toUpperCase()) return;
        if (turn === "b" && p !== p.toLowerCase()) return;
        setSelected(sq);
        return;
      }
      // simple move (client-side demo only)
      const from = selected;
      const fr = 8 - parseInt(from[1], 10);
      const fc = from.charCodeAt(0) - 97;
      const next = board.map((row) => row.slice());
      next[r][c] = next[fr][fc];
      next[fr][fc] = null;
      if (next[r][c] === "P" && r === 0) next[r][c] = "Q";
      if (next[r][c] === "p" && r === 7) next[r][c] = "q";
      setBoard(next);
      setSelected(null);
      const nextTurn = turn === "w" ? "b" : "w";
      setTurn(nextTurn);
      setStatus(nextTurn === "w" ? "Giliran Putih" : "Giliran Hitam");
    },
    [board, selected, turn]
  );

  const cells = useMemo(() => {
    const out = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const dark = (r + c) % 2 === 1;
        const p = board[r][c];
        const sq = files[c] + (8 - r);
        const isSel = selected === sq;
        out.push(
          <button
            key={sq}
            onClick={() => onCell(r, c)}
            className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-3xl select-none
              ${dark ? "bg-[#b58863]" : "bg-[#ebc992]"}
              ${isSel ? "ring-4 ring-yellow-400" : ""}
              hover:brightness-110 transition`}
          >
            {p ? PIECES[p] || p : ""}
          </button>
        );
      }
    }
    return out;
  }, [board, selected, onCell]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center p-4">
      <div className="bg-[#1a1a1a] rounded-2xl p-4 shadow-2xl border border-[#333] max-w-md w-full">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold tracking-wide">♟️ CHESS REALTIME</h1>
          <span className="text-xs bg-green-600/30 text-green-400 px-2 py-0.5 rounded-full">
            WEB
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-3">{status}</p>
        <div className="grid grid-cols-8 gap-0 rounded-lg overflow-hidden border border-[#444]">
          {cells}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              setBoard(initial());
              setTurn("w");
              setSelected(null);
              setStatus("Giliran Putih");
            }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium"
          >
            🔄 Main Lagi
          </button>
          <button
            onClick={() => setSelected(null)}
            className="px-4 bg-[#333] hover:bg-[#444] py-2 rounded-lg"
          >
            ↩ Balik
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-3 text-center">
          Mode demo lokal · Sinkronisasi dengan session WhatsApp via bot API
        </p>
      </div>
    </div>
  );
}
