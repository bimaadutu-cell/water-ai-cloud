/**
 * Premium Tic-Tac-Toe board card — full 9:16 portrait, dark glass style
 */
import sharp from "sharp";

export type TttMark = "" | "X" | "O";

export interface TttRenderOpts {
  board: TttMark[];
  turn: "X" | "O";
  mode: "ai" | "pvp";
  statusLine?: string;
  subtitle?: string;
  scoreLine?: string;
  highlight?: number[]; // winning cells
  over?: boolean;
}

function esc(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderTttBoard(opts: TttRenderOpts): Promise<Buffer> {
  // Full 9:16 portrait
  const W = 540;
  const H = Math.round((W * 16) / 9); // 960

  const top = 100;
  const bottom = 90;
  const pad = 36;
  const gap = 14;
  const gridW = W - pad * 2;
  const cell = (gridW - gap * 2) / 3;
  // Center grid
  const avail = H - top - bottom;
  const gridY = top + Math.max(0, (avail - gridW) / 2);

  const win = new Set(opts.highlight || []);
  let cells = "";
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const x = pad + c * (cell + gap);
    const y = gridY + r * (cell + gap);
    const isWin = win.has(i);
    const fill = isWin ? "#1e3a5f" : "#151c2e";
    const stroke = isWin ? "#38bdf8" : "#334155";
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`;
    // subtle inner glow
    cells += `<rect x="${x + 3}" y="${y + 3}" width="${cell - 6}" height="${cell - 6}" rx="17" fill="none" stroke="#ffffff0a" stroke-width="1"/>`;
    const v = opts.board[i] || "";
    if (v === "X") {
      cells += `<text x="${x + cell / 2}" y="${y + cell / 2 + 26}" text-anchor="middle" font-size="82" font-weight="900" fill="#f87171" font-family="Arial Black,Arial,sans-serif" style="filter:drop-shadow(0 0 12px #ef444488)">✕</text>`;
    } else if (v === "O") {
      cells += `<text x="${x + cell / 2}" y="${y + cell / 2 + 26}" text-anchor="middle" font-size="82" font-weight="900" fill="#38bdf8" font-family="Arial Black,Arial,sans-serif" style="filter:drop-shadow(0 0 12px #0ea5e988)">◯</text>`;
    } else if (!opts.over) {
      cells += `<text x="${x + cell / 2}" y="${y + cell / 2 + 10}" text-anchor="middle" font-size="24" fill="#475569" font-family="Arial,sans-serif">${i + 1}</text>`;
    }
  }

  const modeBadge = opts.mode === "pvp" ? "MULTIPLAYER" : "VS AI";
  const modeColor = opts.mode === "pvp" ? "#a78bfa" : "#34d399";
  const status = esc(opts.statusLine || (opts.turn === "X" ? "Giliran: X" : "Giliran: O"));
  const subtitle = esc(opts.subtitle || "WATER AI · REALTIME");
  const score = esc(opts.scoreLine || "");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#070b14"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#1e3a5f44"/>
      <stop offset="100%" stop-color="#00000000"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="5" fill="url(#bar)"/>
  <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="24" fill="#0f1524cc" stroke="#33415566" stroke-width="1"/>

  <text x="${pad}" y="48" fill="#f1f5f9" font-size="22" font-weight="800" font-family="Arial,sans-serif">✕ TIC-TAC-TOE ◯</text>
  <rect x="${W - pad - 110}" y="28" width="110" height="28" rx="14" fill="${modeColor}22" stroke="${modeColor}" stroke-width="1.5"/>
  <text x="${W - pad - 55}" y="47" text-anchor="middle" fill="${modeColor}" font-size="12" font-weight="700" font-family="Arial,sans-serif">${modeBadge}</text>
  <text x="${pad}" y="76" fill="#94a3b8" font-size="13" font-family="Arial,sans-serif">${subtitle}</text>
  ${cells}
  <text x="${W / 2}" y="${H - 58}" text-anchor="middle" fill="#e2e8f0" font-size="17" font-weight="600" font-family="Arial,sans-serif">${status}</text>
  <text x="${W / 2}" y="${H - 32}" text-anchor="middle" fill="#64748b" font-size="13" font-family="Arial,sans-serif">${score}</text>
</svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}
