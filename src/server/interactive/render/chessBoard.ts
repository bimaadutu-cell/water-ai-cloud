/**
 * Chess board image renderer — 9:16 portrait, classic black/white 3D style
 * Full height for WhatsApp media bubble (looks full-screen portrait)
 */
import sharp from "sharp";

const PIECES: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

// Classic black/white 3D board
const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const LIGHT_3D = "#e8d0a8";
const DARK_3D = "#a07850";
const BG = "#0a0a0c";
const PANEL = "#121214";
const TEXT = "#f5f5f5";
const MUTED = "#8a8a8a";
const ACCENT = "#e8c547";
const YELLOW_BTN = "#f5c518";
const SEL = "#f5c518";
const TGT_LIGHT = "#c9e07a";
const TGT_DARK = "#8fbc4a";

export interface BoardRenderOpts {
  board: (string | null)[][];
  turn: "w" | "b";
  selected?: string | null;
  targets?: string[];
  title?: string;
  subtitle?: string;
  statusLine?: string;
  overlayLines?: string[];
  width?: number;
}

function sqToRC(sq: string): { r: number; c: number } | null {
  if (!/^[a-h][1-8]$/i.test(sq)) return null;
  const c = sq.toLowerCase().charCodeAt(0) - 97;
  const r = 8 - parseInt(sq[1], 10);
  return { r, c };
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderChessBoard(opts: BoardRenderOpts): Promise<Buffer> {
  // Full 9:16 portrait (WhatsApp-friendly)
  const W = opts.width || 540;
  const H = Math.round((W * 16) / 9); // exact 9:16

  const topBar = 72;
  const bottomBar = 110;
  const sidePad = 22;
  const boardSize = W - sidePad * 2;
  const cell = boardSize / 8;
  // Center board vertically in remaining space
  const avail = H - topBar - bottomBar;
  const boardY = topBar + Math.max(0, (avail - boardSize) / 2);

  const selected = opts.selected ? sqToRC(opts.selected) : null;
  const targetSet = new Set(
    (opts.targets || [])
      .map((s) => {
        const p = sqToRC(s);
        return p ? `${p.r},${p.c}` : "";
      })
      .filter(Boolean)
  );

  let cells = "";
  // Board frame / 3D bevel
  const framePad = 6;
  cells += `<rect x="${sidePad - framePad}" y="${boardY - framePad}" width="${boardSize + framePad * 2}" height="${boardSize + framePad * 2}" rx="10" fill="#2a2218" stroke="#3d3228" stroke-width="2"/>`;
  cells += `<rect x="${sidePad - 2}" y="${boardY - 2}" width="${boardSize + 4}" height="${boardSize + 4}" rx="6" fill="#1a1610"/>`;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = sidePad + c * cell;
      const y = boardY + r * cell;
      const isDark = (r + c) % 2 === 1;
      let fill = isDark ? DARK : LIGHT;

      if (selected && selected.r === r && selected.c === c) {
        fill = SEL;
      } else if (targetSet.has(`${r},${c}`)) {
        fill = isDark ? TGT_DARK : TGT_LIGHT;
      }

      // Main square
      cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${fill}"/>`;

      // Subtle 3D highlight on top-left edge of light squares
      if (!isDark && !(selected && selected.r === r && selected.c === c)) {
        cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${(cell * 0.12).toFixed(1)}" fill="#ffffff22"/>`;
        cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cell * 0.1).toFixed(1)}" height="${cell.toFixed(1)}" fill="#ffffff15"/>`;
      }
      // Subtle shadow on dark squares bottom-right
      if (isDark && !(selected && selected.r === r && selected.c === c)) {
        cells += `<rect x="${(x + cell * 0.85).toFixed(1)}" y="${y.toFixed(1)}" width="${(cell * 0.15).toFixed(1)}" height="${cell.toFixed(1)}" fill="#00000018"/>`;
        cells += `<rect x="${x.toFixed(1)}" y="${(y + cell * 0.88).toFixed(1)}" width="${cell.toFixed(1)}" height="${(cell * 0.12).toFixed(1)}" fill="#00000022"/>`;
      }

      if (selected && selected.r === r && selected.c === c) {
        cells += `<rect x="${(x + 2).toFixed(1)}" y="${(y + 2).toFixed(1)}" width="${(cell - 4).toFixed(1)}" height="${(cell - 4).toFixed(1)}" fill="none" stroke="#fff8c0" stroke-width="2.5"/>`;
      }

      const piece = opts.board[r]?.[c];
      if (piece) {
        const glyph = PIECES[piece] || piece;
        const cx = x + cell / 2;
        const cy = y + cell / 2 + cell * 0.12;
        const isWhite = piece === piece.toUpperCase();
        // Soft drop shadow for 3D piece feel
        cells += `<text x="${(cx + 1.2).toFixed(1)}" y="${(cy + 2.2).toFixed(1)}" font-size="${(cell * 0.72).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#000" opacity="0.35">${glyph}</text>`;
        // Main piece — white pieces bright, black pieces deep charcoal
        cells += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${(cell * 0.72).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${isWhite ? "#faf8f0" : "#1a1a1a"}" stroke="${isWhite ? "#2a2a2a" : "#000"}" stroke-width="0.6">${glyph}</text>`;
      }

      if (targetSet.has(`${r},${c}`) && !opts.board[r]?.[c]) {
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        cells += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(cell * 0.15).toFixed(1)}" fill="#000" opacity="0.32"/>`;
      }
    }
  }

  const files = "abcdefgh";
  let labels = "";
  for (let i = 0; i < 8; i++) {
    const fx = sidePad + i * cell + cell / 2;
    labels += `<text x="${fx.toFixed(1)}" y="${(boardY + boardSize + 18).toFixed(1)}" font-size="13" fill="${MUTED}" text-anchor="middle" font-family="Arial,sans-serif">${files[i]}</text>`;
    const ry = boardY + i * cell + cell / 2 + 4;
    labels += `<text x="${(sidePad - 12).toFixed(1)}" y="${ry.toFixed(1)}" font-size="13" fill="${MUTED}" text-anchor="middle" font-family="Arial,sans-serif">${8 - i}</text>`;
  }

  const title = opts.title || "CHESS3";
  const sub =
    opts.subtitle ||
    (opts.turn === "w" ? "Giliran kamu" : "Bot sedang berpikir...");
  const status =
    opts.statusLine ||
    (opts.turn === "w"
      ? "Pilih bidak putih terlebih dahulu."
      : "Tunggu giliran berikutnya.");

  const overlays = (opts.overlayLines || []).slice(0, 5);
  let overlaySvg = "";
  if (overlays.length) {
    const startY = boardY + boardSize / 2 - (overlays.length * 22) / 2;
    overlays.forEach((line, i) => {
      const oy = startY + i * 24;
      overlaySvg += `<text x="${W / 2}" y="${oy.toFixed(1)}" font-size="16" fill="#ffffff" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" style="paint-order:stroke;stroke:#000;stroke-width:3.5px">${escapeXml(line)}</text>`;
    });
  }

  const btnY = H - 52;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121214"/>
      <stop offset="100%" stop-color="#0a0a0c"/>
    </linearGradient>
    <linearGradient id="topGlow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e8c54700"/>
      <stop offset="50%" stop-color="#e8c54733"/>
      <stop offset="100%" stop-color="#e8c54700"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="${W}" height="4" fill="url(#topGlow)"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="20" fill="${PANEL}" stroke="#2a2a2e" stroke-width="1"/>

  <text x="${W / 2}" y="42" font-size="18" fill="${ACCENT}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="${sidePad}" y="62" font-size="11" fill="${MUTED}" font-family="Arial,sans-serif">Bagian bot · Hitam</text>
  <text x="${W - sidePad}" y="62" font-size="11" fill="${MUTED}" text-anchor="end" font-family="Arial,sans-serif">Bagian kamu · Putih</text>

  ${cells}
  ${labels}
  ${overlaySvg}

  <text x="${W / 2}" y="${(H - 78).toFixed(1)}" font-size="16" fill="${TEXT}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700">${escapeXml(sub)}</text>
  <text x="${W / 2}" y="${(H - 56).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="middle" font-family="Arial,sans-serif">${escapeXml(status)}</text>

  <rect x="${sidePad}" y="${btnY}" width="160" height="28" rx="8" fill="#2c2c30"/>
  <text x="${sidePad + 80}" y="${btnY + 19}" font-size="12" fill="#ddd" text-anchor="middle" font-family="Arial,sans-serif">BATALKAN LANGKAH</text>
  <rect x="${W - sidePad - 130}" y="${btnY}" width="130" height="28" rx="8" fill="${YELLOW_BTN}"/>
  <text x="${W - sidePad - 65}" y="${btnY + 19}" font-size="12" fill="#111" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700">GAME BARU</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function initialBoard(): (string | null)[][] {
  const b: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let i = 0; i < 8; i++) {
    b[0][i] = back[i].toLowerCase();
    b[1][i] = "p";
    b[6][i] = "P";
    b[7][i] = back[i];
  }
  return b;
}
