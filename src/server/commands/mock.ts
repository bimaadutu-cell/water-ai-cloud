import sharp from "sharp";
import type { CmdCtx, CmdResult } from "./core";
import { CmdError, MAX_FILE_BYTES } from "./core";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap(value: string, max = 28): string[] {
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
  return lines.slice(0, 8);
}

async function renderSvg(svg: string): Promise<Buffer> {
  const out = await sharp(Buffer.from(svg)).png().toBuffer();
  if (out.length > MAX_FILE_BYTES) throw new CmdError("📦 Hasil gambar terlalu besar.");
  return out;
}

/** Safe visual mockups. Every generated conversation-style image is visibly watermarked. */
export async function fakech(ctx: CmdCtx): Promise<CmdResult> {
  const [name = "Demo User", count = "0", status = "true"] = ctx.arg.split("|").map((v) => v.trim());
  const lines = wrap(`${name} • ${count} • ${status}`);
  const text = lines.map((line, i) => `<text x="64" y="230" font-size="34" font-family="sans-serif" fill="#f2f7ff">${esc(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><rect width="900" height="520" rx="28" fill="#111827"/><rect x="40" y="40" width="820" height="440" rx="22" fill="#1f2937" stroke="#22d3ee" stroke-width="3"/><text x="70" y="110" font-size="42" font-family="sans-serif" font-weight="700" fill="#60a5fa">WATER AI CLOUD</text><text x="70" y="165" font-size="24" font-family="sans-serif" fill="#94a3b8">CHAT MOCKUP • DEMO ONLY</text>${text}<text x="70" y="420" font-size="30" font-family="sans-serif" fill="#fbbf24">⚠ DEMO / MOCKUP — BUKAN BUKTI PERCAKAPAN</text></svg>`;
  return { media: { kind: "image", buffer: await renderSvg(svg), mimetype: "image/png", filename: "water-demo-mockup.png", caption: "⚠️ DEMO / MOCKUP — gambar desain, bukan bukti percakapan nyata." } };
}

export async function fakeswwa(ctx: CmdCtx): Promise<CmdResult> {
  const name = ctx.arg.trim() || "Demo Contact";
  const message = `Simulasi tampilan WhatsApp untuk ${name}`;
  const lines = wrap(message, 32);
  const bubble = lines.map((line, i) => `<text x="620" y="${250 + i * 42}" font-size="28" font-family="sans-serif" fill="#e5e7eb">${esc(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650"><rect width="1000" height="650" fill="#0b141a"/><rect x="0" y="0" width="1000" height="100" fill="#202c33"/><circle cx="60" cy="50" r="28" fill="#64748b"/><text x="110" y="60" font-size="34" font-family="sans-serif" fill="white">${esc(name)}</text><rect x="480" y="170" width="460" height="220" rx="22" fill="#005c4b"/>${bubble}<text x="60" y="560" font-size="40" font-family="sans-serif" font-weight="700" fill="#fbbf24">DEMO / MOCKUP</text><text x="60" y="610" font-size="24" font-family="sans-serif" fill="#cbd5e1">Bukan bukti chat, transaksi, pembayaran, atau identitas.</text></svg>`;
  return { media: { kind: "image", buffer: await renderSvg(svg), mimetype: "image/png", filename: "water-whatsapp-mockup.png", caption: "⚠️ DEMO / MOCKUP — untuk desain/testing saja." } };
}

export async function windowspink(ctx: CmdCtx): Promise<CmdResult> {
  const text = ctx.arg.trim() || "Kehilangan itu luka, bukan akhir cerita.";
  const lines = wrap(text, 24);
  const textSvg = lines.map((line, i) => `<text x="120" y="${190 + i * 68}" font-size="46" font-family="sans-serif" font-weight="700" fill="#ec4899">${esc(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ffd1e8"/><stop offset="1" stop-color="#ff8bc4"/></linearGradient></defs><rect width="900" height="650" rx="28" fill="url(#g)"/><rect x="55" y="70" width="790" height="510" rx="18" fill="#fff" stroke="#db2777" stroke-width="8"/><rect x="55" y="70" width="790" height="58" rx="18" fill="#ec4899"/><circle cx="95" cy="99" r="12" fill="#fff"/><text x="130" y="108" font-size="26" font-family="sans-serif" fill="#fff">WindowsPink • Retro Template</text>${textSvg}<text x="120" y="535" font-size="22" font-family="sans-serif" fill="#9d174d">WATER AI CLOUD • TEMPLATE</text></svg>`;
  return { media: { kind: "image", buffer: await renderSvg(svg), mimetype: "image/png", filename: "windowspink.png" } };
}
