"use client";

import { useState } from "react";

type Cell = "X" | "O" | null;

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(b: Cell[]): "X" | "O" | "draw" | null {
  for (const [a, c, d] of WINS) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a] as "X" | "O";
  }
  if (b.every(Boolean)) return "draw";
  return null;
}

export default function TttWebPage() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [status, setStatus] = useState("Giliran: Kamu (X)");
  const [scores, setScores] = useState({ win: 0, lose: 0, draw: 0 });

  function play(i: number) {
    if (board[i] || winner(board)) return;
    const next = board.slice();
    next[i] = turn;
    const w = winner(next);
    setBoard(next);
    if (w === "X" || w === "O") {
      setStatus(w === "X" ? "Kamu menang!" : "O menang!");
      setScores((s) =>
        w === "X" ? { ...s, win: s.win + 1 } : { ...s, lose: s.lose + 1 }
      );
    } else if (w === "draw") {
      setStatus("Seri!");
      setScores((s) => ({ ...s, draw: s.draw + 1 }));
    } else {
      const nt = turn === "X" ? "O" : "X";
      setTurn(nt);
      setStatus(`Giliran: ${nt === "X" ? "Kamu (X)" : "O"}`);
    }
  }

  function reset(first: "X" | "O" = "X") {
    setBoard(Array(9).fill(null));
    setTurn(first);
    setStatus(`Giliran: ${first === "X" ? "Kamu (X)" : "O"}`);
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center p-4">
      <div className="bg-[#1a1a1a] rounded-2xl p-5 shadow-2xl border border-[#333] max-w-sm w-full">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">
            <span className="text-red-400">✕</span> TIC-TAC-TOE{" "}
            <span className="text-blue-400">◯</span>
          </h1>
          <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full">
            WEB
          </span>
        </div>
        <p className="text-sm text-gray-300 mb-4">{status}</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {board.map((cell, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              className="aspect-square rounded-xl bg-[#252525] border border-[#3a3a3a]
                flex items-center justify-center text-4xl font-bold
                hover:bg-[#2f2f2f] active:scale-95 transition"
            >
              {cell === "X" && <span className="text-red-400">✕</span>}
              {cell === "O" && <span className="text-blue-400">◯</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => reset("X")}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-lg font-medium"
          >
            🔄 Main Ulang
          </button>
          <button
            onClick={() => reset(turn === "X" ? "O" : "X")}
            className="px-3 bg-[#333] hover:bg-[#444] py-2.5 rounded-lg text-sm"
          >
            ↕ Giliran Pertama
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3 text-center">
          Menang: {scores.win} · Kalah: {scores.lose} · Seri: {scores.draw}
        </p>
      </div>
    </div>
  );
}
