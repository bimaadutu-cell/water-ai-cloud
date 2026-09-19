/**
 * Music player card — closer to the example screenshot
 * Dark frame, SEDANG DIPUTAR, neon title block, progress, transport hint
 */
import sharp from "sharp";

export interface PlayerCardOpts {
  title: string;
  artist: string;
  positionSec?: number;
  durationSec?: number;
  status?: "playing" | "paused" | "stopped";
  width?: number;
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderPlayerCard(opts: PlayerCardOpts): Promise<Buffer> {
  const W = opts.width || 420;
  const H = 520;
  const title = (opts.title || "Unknown").slice(0, 32);
  const artist = (opts.artist || "Unknown Artist").slice(0, 36);
  const pos = opts.positionSec ?? 3;
  const dur = opts.durationSec || 102;
  const status = opts.status || "playing";
  const statusLabel =
    status === "paused" ? "DIJEDA" : status === "stopped" ? "BERHENTI" : "SEDANG DIPUTAR";

  const ratio = dur > 0 ? Math.min(1, Math.max(0, pos / dur)) : 0.05;
  const barX = 36;
  const barW = W - 72;
  const filled = Math.max(4, Math.round(barW * ratio));

  // big neon title for artwork area
  const neonTitle = title.length > 12 ? title.slice(0, 12) : title;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0c"/>
      <stop offset="100%" stop-color="#14080e"/>
    </linearGradient>
    <linearGradient id="art" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a0510"/>
      <stop offset="50%" stop-color="#4a0a18"/>
      <stop offset="100%" stop-color="#1a0208"/>
    </linearGradient>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff1744"/>
      <stop offset="50%" stop-color="#ff4d6d"/>
      <stop offset="100%" stop-color="#ff1744"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="100%" height="100%" rx="20" fill="url(#bg)"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="16" fill="none" stroke="#ff174433" stroke-width="1.2"/>

  <!-- status -->
  <text x="${W / 2}" y="42" font-size="11" fill="#ff6b8a" text-anchor="middle" font-family="Arial,sans-serif" letter-spacing="4">${statusLabel}</text>

  <!-- artwork panel -->
  <rect x="36" y="58" width="${W - 72}" height="${W - 72}" rx="12" fill="url(#art)"/>
  <rect x="36" y="58" width="${W - 72}" height="${W - 72}" rx="12" fill="none" stroke="#ff174455" stroke-width="1"/>

  <!-- neon graffiti title inside art -->
  <text x="${W / 2}" y="${58 + (W - 72) / 2 - 10}" font-size="34" fill="#ff1744" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" filter="url(#glow)">${escapeXml(neonTitle.toUpperCase())}</text>
  <text x="${W / 2}" y="${58 + (W - 72) / 2 + 28}" font-size="13" fill="#ff8fa3" text-anchor="middle" font-family="Arial,sans-serif" letter-spacing="2">WATER AI · PLAY2</text>

  <!-- track meta -->
  <text x="36" y="${H - 150}" font-size="18" fill="#ffffff" font-family="Arial,sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="36" y="${H - 128}" font-size="13" fill="#aaaaaa" font-family="Arial,sans-serif">${escapeXml(artist)}</text>
  <text x="${W - 36}" y="${H - 128}" font-size="16" fill="#ff6b8a" text-anchor="end" font-family="Arial,sans-serif">♡</text>

  <!-- progress -->
  <text x="36" y="${H - 98}" font-size="11" fill="#777" font-family="Arial,sans-serif">${formatTime(pos)}</text>
  <text x="${W - 36}" y="${H - 98}" font-size="11" fill="#777" text-anchor="end" font-family="Arial,sans-serif">${formatTime(dur)}</text>
  <rect x="${barX}" y="${H - 88}" width="${barW}" height="4" rx="2" fill="#333"/>
  <rect x="${barX}" y="${H - 88}" width="${filled}" height="4" rx="2" fill="url(#neon)"/>
  <circle cx="${barX + filled}" cy="${H - 86}" r="6" fill="#ff1744"/>

  <!-- transport row -->
  <text x="${W / 2 - 90}" y="${H - 48}" font-size="18" fill="#888" text-anchor="middle" font-family="Arial,sans-serif">🔀</text>
  <text x="${W / 2 - 45}" y="${H - 48}" font-size="20" fill="#ddd" text-anchor="middle" font-family="Arial,sans-serif">⏮</text>
  <circle cx="${W / 2}" cy="${H - 52}" r="22" fill="#ffffff"/>
  <text x="${W / 2}" y="${H - 46}" font-size="18" fill="#111" text-anchor="middle" font-family="Arial,sans-serif">${status === "paused" ? "▶" : "❚❚"}</text>
  <text x="${W / 2 + 45}" y="${H - 48}" font-size="20" fill="#ddd" text-anchor="middle" font-family="Arial,sans-serif">⏭</text>
  <text x="${W / 2 + 90}" y="${H - 48}" font-size="18" fill="#888" text-anchor="middle" font-family="Arial,sans-serif">🔁</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
