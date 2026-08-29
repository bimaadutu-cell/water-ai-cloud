import sharp from "sharp";
import type { CmdCtx, CmdResult } from "./core";
import { CmdError, MAX_FILE_BYTES } from "./core";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap(value: string, max = 20): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

async function renderSvg(svg: string): Promise<Buffer> {
  const out = await sharp(Buffer.from(svg)).png().toBuffer();
  if (out.length > MAX_FILE_BYTES) throw new CmdError("📦 Hasil gambar terlalu besar.");
  return out;
}

/**
 * WindowsPink — template visual bertema Windows Media Player pink/retro.
 * Tidak ada watermark.
 */
export async function windowspink(ctx: CmdCtx): Promise<CmdResult> {
  const text = ctx.arg.trim() || "Kehilangan itu luka, bukan akhir cerita.";
  const lines = wrap(text, 20);
  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="70" y="${210 + i * 52}" font-size="42" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#e91e8c">${esc(line)}</text>`
    )
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="560" viewBox="0 0 720 560">
  <defs>
    <linearGradient id="titleBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff7eb9"/>
      <stop offset="100%" stop-color="#ff4da6"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe6f2"/>
      <stop offset="100%" stop-color="#ffd1e8"/>
    </linearGradient>
    <linearGradient id="control" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff8bc4"/>
      <stop offset="100%" stop-color="#ff5eaa"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#00000040"/>
    </filter>
  </defs>

  <!-- Outer window -->
  <rect x="20" y="20" width="680" height="520" rx="8" fill="#ff9ecf" filter="url(#shadow)"/>
  <rect x="24" y="24" width="672" height="512" rx="6" fill="url(#body)" stroke="#db2777" stroke-width="3"/>

  <!-- Title bar -->
  <rect x="24" y="24" width="672" height="42" rx="6" fill="url(#titleBar)"/>
  <rect x="24" y="50" width="672" height="16" fill="url(#titleBar)"/>

  <!-- Window controls -->
  <rect x="620" y="32" width="22" height="18" rx="2" fill="#fff" opacity="0.9"/>
  <rect x="648" y="32" width="22" height="18" rx="2" fill="#fff" opacity="0.9"/>
  <rect x="676" y="32" width="14" height="18" rx="2" fill="#ff6b6b"/>

  <!-- Title text -->
  <circle cx="48" cy="45" r="10" fill="#fff"/>
  <polygon points="44,40 44,50 52,45" fill="#ff4da6"/>
  <text x="68" y="50" font-size="18" font-family="Segoe UI, Arial, sans-serif" font-weight="600" fill="#fff">Windows Media Player</text>

  <!-- Menu bar -->
  <rect x="24" y="66" width="672" height="28" fill="#ffb3d9"/>
  <text x="40" y="85" font-size="13" font-family="Segoe UI, Arial, sans-serif" fill="#6b1a45">File   View   Play   Tools   Help</text>

  <!-- Content area -->
  <rect x="40" y="110" width="640" height="320" rx="4" fill="#fff" stroke="#f9a8d4" stroke-width="2"/>

  <!-- Quote text -->
  ${textSvg}

  <!-- Simple white figure (pointing pose) -->
  <g transform="translate(480, 180)">
    <circle cx="60" cy="30" r="28" fill="#f5f5f5" stroke="#ddd" stroke-width="1"/>
    <ellipse cx="60" cy="110" rx="38" ry="55" fill="#f5f5f5" stroke="#ddd" stroke-width="1"/>
    <path d="M40 90 Q10 50 0 20" stroke="#f5f5f5" stroke-width="16" stroke-linecap="round" fill="none"/>
    <circle cx="0" cy="18" r="10" fill="#f5f5f5"/>
    <path d="M80 90 Q110 40 120 10" stroke="#f5f5f5" stroke-width="16" stroke-linecap="round" fill="none"/>
    <circle cx="120" cy="8" r="10" fill="#f5f5f5"/>
    <path d="M40 155 Q35 210 30 230" stroke="#f5f5f5" stroke-width="18" stroke-linecap="round" fill="none"/>
    <path d="M80 155 Q85 210 90 230" stroke="#f5f5f5" stroke-width="18" stroke-linecap="round" fill="none"/>
  </g>

  <!-- Control bar -->
  <rect x="40" y="450" width="640" height="60" rx="4" fill="url(#control)"/>

  <!-- Play button -->
  <circle cx="80" cy="480" r="18" fill="#fff"/>
  <polygon points="74,470 74,490 92,480" fill="#ff4da6"/>

  <!-- Progress -->
  <rect x="120" y="474" width="400" height="10" rx="5" fill="#ffcce6"/>
  <rect x="120" y="474" width="180" height="10" rx="5" fill="#fff"/>

  <!-- Volume -->
  <rect x="540" y="474" width="80" height="10" rx="5" fill="#ffcce6"/>
  <rect x="540" y="474" width="40" height="10" rx="5" fill="#fff"/>
</svg>`;

  return {
    media: {
      kind: "image",
      buffer: await renderSvg(svg),
      mimetype: "image/png",
      filename: "windowspink.png",
    },
  };
}
