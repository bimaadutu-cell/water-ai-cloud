/**
 * Chess board image renderer — matched to the example video style
 * - Wooden board colors
 * - Clear piece glyphs
 * - Yellow selection + soft target highlights
 * - Side labels, turn text, overlay lines (lyrics/status)
 * - Clean dark frame like WhatsApp card
 */
import sharp from "sharp";

const PIECES: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const LIGHT = "#ebc992";
const DARK = "#b58863";
const BG = "#111111";
const PANEL = "#1c1c1c";
const TEXT = "#f2f2f2";
const MUTED = "#9a9a9a";
const ACCENT = "#f6c945";
const YELLOW_BTN = "#f5c518";

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
  const W = opts.width || 560;
  const topBar = 52;
  const bottomBar = 78;
  const sidePad = 28;
  const boardSize = W - sidePad * 2;
  const cell = boardSize / 8;
  const H = topBar + boardSize + bottomBar + 36;

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
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = sidePad + c * cell;
      const y = topBar + r * cell;
      const isDark = (r + c) % 2 === 1;
      let fill = isDark ? DARK : LIGHT;

      if (selected && selected.r === r && selected.c === c) {
        fill = "#f5c518";
      } else if (targetSet.has(`${r},${c}`)) {
        fill = isDark ? "#c9a03a" : "#e8d080";
      }

      cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${fill}"/>`;

      if (selected && selected.r === r && selected.c === c) {
        cells += `<rect x="${(x + 2).toFixed(1)}" y="${(y + 2).toFixed(1)}" width="${(cell - 4).toFixed(1)}" height="${(cell - 4).toFixed(1)}" fill="none" stroke="#fff3a0" stroke-width="2"/>`;
      }

      const piece = opts.board[r]?.[c];
      if (piece) {
        const glyph = PIECES[piece] || piece;
        const cx = x + cell / 2;
        const cy = y + cell / 2 + cell * 0.14;
        const isWhite = piece === piece.toUpperCase();
        cells += `<text x="${cx.toFixed(1)}" y="${(cy + 1.5).toFixed(1)}" font-size="${(cell * 0.68).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#000" opacity="0.28">${glyph}</text>`;
        cells += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${(cell * 0.68).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${isWhite ? "#fafafa" : "#111"}">${glyph}</text>`;
      }

      if (targetSet.has(`${r},${c}`) && !opts.board[r]?.[c]) {
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        cells += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(cell * 0.14).toFixed(1)}" fill="#000" opacity="0.35"/>`;
      }
    }
  }

  const files = "abcdefgh";
  let labels = "";
  for (let i = 0; i < 8; i++) {
    const fx = sidePad + i * cell + cell / 2;
    labels += `<text x="${fx.toFixed(1)}" y="${(topBar + boardSize + 16).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="middle" font-family="Arial,sans-serif">${files[i]}</text>`;
    const ry = topBar + i * cell + cell / 2 + 4;
    labels += `<text x="${(sidePad - 10).toFixed(1)}" y="${ry.toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="middle" font-family="Arial,sans-serif">${8 - i}</text>`;
  }

  const title = opts.title || "CHESS2";
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
    const startY = topBar + boardSize / 2 - (overlays.length * 20) / 2;
    overlays.forEach((line, i) => {
      const oy = startY + i * 22;
      overlaySvg += `<text x="${W / 2}" y="${oy.toFixed(1)}" font-size="15" fill="#ffffff" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" style="paint-order:stroke;stroke:#000;stroke-width:3.5px">${escapeXml(line)}</text>`;
    });
  }

  const sideTopY = topBar - 18;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG}"/>
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="16" fill="${PANEL}" stroke="#2a2a2a" stroke-width="1"/>

  <text x="${W / 2}" y="30" font-size="16" fill="${ACCENT}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="${sidePad}" y="${sideTopY}" font-size="11" fill="${MUTED}" font-family="Arial,sans-serif">Bagian bot - Hitam</text>
  <text x="${W - sidePad}" y="${sideTopY}" font-size="11" fill="${MUTED}" text-anchor="end" font-family="Arial,sans-serif">Bagian kamu - Putih</text>

  ${cells}
  ${labels}
  ${overlaySvg}

  <text x="${W / 2}" y="${(topBar + boardSize + 40).toFixed(1)}" font-size="15" fill="${TEXT}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700">${escapeXml(sub)}</text>
  <text x="${W / 2}" y="${(topBar + boardSize + 60).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="middle" font-family="Arial,sans-serif">${escapeXml(status)}</text>

  <rect x="${sidePad}" y="${H - 36}" width="150" height="22" rx="6" fill="#2c2c2c"/>
  <text x="${sidePad + 75}" y="${H - 21}" font-size="11" fill="#ddd" text-anchor="middle" font-family="Arial,sans-serif">BATALKAN LANGKAH</text>
  <rect x="${W - sidePad - 120}" y="${H - 36}" width="120" height="22" rx="6" fill="${YELLOW_BTN}"/>
  <text x="${W - sidePad - 60}" y="${H - 21}" font-size="11" fill="#111" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700">GAME BARU</text>
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
