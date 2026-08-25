/* STICKER + IMAGE + MEDIA converters — real processing (sharp + ffmpeg-static). */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CmdCtx, CmdResult, box, truncate, safeFetch, withTempFile, ffmpegPath, sanitizeFilename, CmdError } from "./core";

const pExecFile = promisify(execFile);
const FF = ffmpegPath();

async function ffmpeg(args: string[], timeoutMs = 120000): Promise<void> {
  if (!FF) throw new CmdError("❌ Media processor (ffmpeg) tidak tersedia di server ini.");
  await pExecFile(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
}

/* media source: URL arg OR replied message */
export async function getMediaSource(ctx: CmdCtx): Promise<{ buffer: Buffer; mimetype: string; url?: string }> {
  const arg = ctx.arg.trim();
  if (/^https?:\/\//i.test(arg)) {
    const buf = await safeFetch(arg);
    const ft: any = await import("file-type");
    const type = await ft.fileTypeFromBuffer(buf);
    return { buffer: buf, mimetype: type?.mime ?? "application/octet-stream", url: arg };
  }
  const m = await ctx.getRepliedMedia();
  if (!m) throw new CmdError("⚠️ Reply media (gambar/video/audio/sticker) atau kirim URL.");
  return { buffer: m.buffer, mimetype: m.mimetype };
}

const extOf = (mime: string): string => {
  const map: Record<string, string> = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
    "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/ogg": ".ogg", "audio/wav": ".wav",
  };
  return map[mime] ?? ".bin";
};

/* -------------------------------- STICKERS ------------------------------ */
async function makeSticker(buffer: Buffer, ctx: CmdCtx): Promise<Buffer> {
  const { default: StickerFactory } = await import("wa-sticker-formatter");
  const Sticker = (StickerFactory as any).default ?? (StickerFactory as any);
  const sticker = new Sticker(buffer, {
    pack: "WATER AI",
    author: ctx.bot.ownerNumber ? "+" + ctx.bot.ownerNumber : "WATER AI CLOUD",
    type: (StickerFactory as any).StickerTypes?.FULL ?? 1,
    quality: 70,
    ffmpegPath: FF ?? undefined,
  });
  return (await sticker.toBuffer()) as Buffer;
}

export async function sticker(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  const isVideo = src.mimetype.startsWith("video") || src.mimetype === "image/gif";
  if (isVideo) {
    const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
      const outPath = inPath + ".webp";
      await ffmpeg(["-i", inPath, "-vf", "scale=480:480:force_original_aspect_ratio=decrease,format=rgba,pad=480:480:(ow-iw)/2:(oh-ih)/2", "-lossless", "true", "-q:v", "70", "-vsync", "0", "-c:v", "libwebp", outPath]);
      return outPath;
    });
    const buf = fs.readFileSync(out);
    fs.rmSync(out, { force: true });
    return { media: { kind: "sticker", buffer: buf, mimetype: "image/webp" } };
  }
  const webp = await makeSticker(src.buffer, ctx);
  return { media: { kind: "sticker", buffer: webp, mimetype: "image/webp" } };
}
export const s = sticker;
export const stiker = sticker;

const EMOJIS = ["💧", "", "⚡", "🔥", "", "🤖", "😎", "", "", "", "✨", "", "", "️", "💙"];
export async function textsticker(ctx: CmdCtx): Promise<CmdResult> {
  const text = ctx.arg || "WATER AI";
  const lines = text
    .split(/\n/)
    .flatMap((l) => l.match(/.{1,18}/g) ?? [l]);
  const safe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svgLines = lines
    .map((l, i) => `<text x="240" y="${150 + i * 90}" font-family="sans-serif" font-size="64" font-weight="bold" fill="#e0faff" text-anchor="middle">${safe(l)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#071018"/>${svgLines}<text x="240" y="455" font-size="22" fill="#22d3ee" text-anchor="middle" font-family="sans-serif">💧 WATER AI</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const webp = await makeSticker(png, ctx);
  return { media: { kind: "sticker", buffer: webp, mimetype: "image/webp" } };
}

export async function randomsticker(ctx: CmdCtx): Promise<CmdResult> {
  const e = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  return textsticker({ ...ctx, arg: e } as any);
}

function svgEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function memeLines(value: string, max = 22): string[] {
  return value.trim().split(/\s+/).flatMap((word) => {
    const parts = word.match(new RegExp(`.{1,${max}}`, "g")) ?? [word];
    return parts;
  }).slice(0, 4);
}

/** Reply an image and use `atas|bawah` (or one text for bottom) to make a meme sticker. */
export async function smeme(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  if (!src.mimetype.startsWith("image/")) throw new CmdError("⚠️ .smeme hanya menerima reply foto/gambar.");
  if (!ctx.arg.trim()) return { text: `Pakai: ${ctx.bot.prefix}smeme teks atas|teks bawah\nContoh: ${ctx.bot.prefix}smeme ADUHH|MALU AKU` };
  const parts = ctx.arg.split(/\s*[|;]\s*/);
  const top = parts.length > 1 ? parts[0] : "";
  const bottom = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  const input = await sharp(src.buffer).rotate().jpeg({ quality: 92 }).toBuffer();
  const meta = await sharp(input).metadata();
  const width = Math.max(320, Math.min(960, meta.width ?? 640));
  const height = Math.max(320, Math.min(960, meta.height ?? 640));
  const topLines = memeLines(top);
  const bottomLines = memeLines(bottom);
  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text{font-family:Impact,Arial,sans-serif;font-weight:900;font-size:${Math.max(28, Math.floor(width / 12))}px;fill:#fff;stroke:#000;stroke-width:${Math.max(2, Math.floor(width / 180))}px;paint-order:stroke;letter-spacing:1px}</style>
    ${topLines.map((line, i) => `<text x="50%" y="${50 + i * Math.max(34, Math.floor(width / 11))}" text-anchor="middle">${svgEscape(line.toUpperCase())}</text>`).join("")}
    ${bottomLines.map((line, i) => `<text x="50%" y="${height - 35 - (bottomLines.length - 1 - i) * Math.max(34, Math.floor(width / 11))}" text-anchor="middle">${svgEscape(line.toUpperCase())}</text>`).join("")}
  </svg>`;
  const rendered = await sharp(input).composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }]).png().toBuffer();
  const webp = await makeSticker(rendered, ctx);
  return { media: { kind: "sticker", buffer: webp, mimetype: "image/webp" } };
}

/** Re-send a quoted view-once image/video/audio as a normal WhatsApp media message. */
export async function rvo(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.replyKey) return { text: `Pakai: reply foto/video sekali lihat lalu ketik ${ctx.bot.prefix}rvo` };
  const src = await ctx.getRepliedMedia();
  if (!src) throw new CmdError("⚠️ Media view-once tidak dapat dibaca. Pastikan bot masih memiliki akses ke pesan tersebut.");
  const kind: "image" | "video" | "audio" | "document" = src.mimetype.startsWith("image/") ? "image" : src.mimetype.startsWith("video/") ? "video" : src.mimetype.startsWith("audio/") ? "audio" : "document";
  const ext = extOf(src.mimetype).replace(/^\./, "") || "bin";
  return { media: { kind, buffer: src.buffer, mimetype: src.mimetype, filename: `recovered-view-once.${ext}`, caption: "✅ Media view-once berhasil disimpan sebagai media biasa." } };
}

export async function toimg(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  const png = await sharp(src.buffer).rotate().png().toBuffer();
  return { media: { kind: "image", buffer: png, mimetype: "image/png" } };
}

export async function stickerinfo(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  // parse WebP EXIF chunk (real EXIF data written by sticker tools)
  let exifXml = "";
  try {
    const b = src.buffer;
    const idx = b.indexOf(Buffer.from("EXIF", "ascii"), 12);
    if (idx > 0) {
      const size = b.readUInt32LE(idx - 4);
      const chunk = b.subarray(idx + 4, idx + 4 + size);
      const txt = chunk.toString("utf8");
      const xmlStart = txt.indexOf("<?xmp");
      exifXml = xmlStart > -1 ? txt.slice(xmlStart) : "";
    }
  } catch {
    /* ignore */
  }
  const pack = /dc:creator="([^"]*)"/.exec(exifXml)?.[1];
  const author = /xmp:CreatorTool="([^"]*)"/.exec(exifXml)?.[1];
  const ft: any = await import("file-type");
  const type = await ft.fileTypeFromBuffer(src.buffer);
  return {
    text: box("🏷️ STICKER INFO", [
      `Format : ${type?.mime ?? src.mimetype}`,
      `Ukuran : ${(src.buffer.length / 1024).toFixed(1)} KB`,
      `Pack   : ${pack ?? "-"}`,
      `Tool   : ${author ?? "-"}`,
    ]),
  };
}

export async function videosticker(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  if (!src.mimetype.startsWith("video") && src.mimetype !== "image/gif")
    throw new CmdError("⚠️ Video/GIF dibutuhkan untuk .videosticker");
  const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
    const outPath = inPath + ".webp";
    await ffmpeg(["-i", inPath, "-t", "10", "-vf", "scale=480:480:force_original_aspect_ratio=decrease,format=rgba,pad=480:480:(ow-iw)/2:(oh-ih)/2", "-lossless", "true", "-q:v", "70", "-vsync", "0", "-c:v", "libwebp", outPath]);
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return { media: { kind: "sticker", buffer: buf, mimetype: "image/webp" } };
}
export const gifsticker = videosticker;

export async function stickersearch(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text: "❌ Sumber pencarian sticker publik yang mengizinkan akses belum dikonfigurasi di server ini. Gunakan .sticker (reply gambar) atau .textsticker untuk membuat sticker asli.",
  };
}

/* --------------------------------- IMAGE -------------------------------- */
async function imgSource(ctx: CmdCtx): Promise<Buffer> {
  const src = await getMediaSource(ctx);
  if (!src.mimetype.startsWith("image")) throw new CmdError("❌ Format media tidak didukung — reply gambar.");
  return src.buffer;
}

export async function enhance(ctx: CmdCtx): Promise<CmdResult> {
  const buf = await imgSource(ctx);
  const out = await (sharp(buf) as any).enhance().jpeg({ quality: 90 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function upscale(ctx: CmdCtx): Promise<CmdResult> {
  const buf = await imgSource(ctx);
  const meta = await sharp(buf).metadata();
  const out = await sharp(buf).resize({ width: (meta.width ?? 512) * 2, kernel: "lanczos3" }).jpeg({ quality: 92 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function compress(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  if (src.mimetype.startsWith("video")) {
    const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
      const outPath = inPath.replace(/\.\w+$/, ".mp4");
      await ffmpeg(["-i", inPath, "-crf", "30", "-preset", "veryfast", "-c:v", "libx264", "-c:a", "aac", outPath], 180000);
      return outPath;
    });
    const buf = fs.readFileSync(out);
    fs.rmSync(out, { force: true });
    return { media: { kind: "video", buffer: buf, mimetype: "video/mp4", caption: `📦 Terkompres: ${(buf.length / 1024 / 1024).toFixed(2)} MB` } };
  }
  let buf: Buffer;
  if (src.mimetype.startsWith("image")) buf = await sharp(src.buffer).jpeg({ quality: 60 }).toBuffer();
  else buf = src.buffer;
  const before = (src.buffer.length / 1024).toFixed(1);
  const after = (buf.length / 1024).toFixed(1);
  return { media: { kind: "image", buffer: buf, mimetype: "image/jpeg", caption: `📦 ${before} KB → ${after} KB` } };
}

export async function resize(ctx: CmdCtx): Promise<CmdResult> {
  const [w, h] = ctx.parts.slice(1).map((x) => parseInt(x, 10));
  if (!w || !h) return { text: "Pakai: .resize <lebar> <tinggi> (reply gambar)" };
  const buf = await imgSource(ctx);
  const out = await sharp(buf).resize(w, h, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function crop(ctx: CmdCtx): Promise<CmdResult> {
  const [w, h] = ctx.parts.slice(1).map((x) => parseInt(x, 10));
  if (!w || !h) return { text: "Pakai: .crop <lebar> <tinggi> (center crop, reply gambar)" };
  const buf = await imgSource(ctx);
  const meta = await sharp(buf).metadata();
  const iw = Math.min(w, meta.width ?? 0);
  const ih = Math.min(h, meta.height ?? 0);
  const out = await sharp(buf).extract({ left: Math.max(0, ((meta.width ?? 0) - iw) >> 1), top: Math.max(0, ((meta.height ?? 0) - ih) >> 1), width: iw, height: ih }).jpeg({ quality: 92 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function rotate(ctx: CmdCtx): Promise<CmdResult> {
  const deg = parseInt(ctx.arg, 10);
  if (![90, 180, 270].includes(deg)) return { text: "Pakai: .rotate 90 | 180 | 270" };
  const buf = await imgSource(ctx);
  const out = await sharp(buf).rotate(deg).jpeg({ quality: 92 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function flip(ctx: CmdCtx): Promise<CmdResult> {
  const dir = ctx.arg.toLowerCase();
  if (dir === "horizontal") {
    const buf = await imgSource(ctx);
    const out = await sharp(buf).flip().jpeg({ quality: 92 }).toBuffer();
    return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
  }
  if (dir === "vertical") {
    const buf = await imgSource(ctx);
    const out = await sharp(buf).flop().jpeg({ quality: 92 }).toBuffer();
    return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
  }
  return { text: "Pakai: .flip horizontal | vertical" };
}

export async function blur(ctx: CmdCtx): Promise<CmdResult> {
  const buf = await imgSource(ctx);
  const out = await sharp(buf).blur(3).jpeg({ quality: 90 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function sharpen(ctx: CmdCtx): Promise<CmdResult> {
  const buf = await imgSource(ctx);
  const out = await sharp(buf).sharpen({ sigma: 2 }).jpeg({ quality: 90 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function grayscale(ctx: CmdCtx): Promise<CmdResult> {
  const buf = await imgSource(ctx);
  const out = await sharp(buf).greyscale().jpeg({ quality: 90 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function watermark(ctx: CmdCtx): Promise<CmdResult> {
  const buf = await imgSource(ctx);
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 800;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="80"><text x="${w - 12}" y="50" font-size="28" font-family="sans-serif" font-weight="bold" fill="rgba(34,211,238,0.9)" text-anchor="end">💧 WATER AI</text></svg>`;
  const out = await sharp(buf).composite([{ input: Buffer.from(svg), gravity: "southeast" }]).jpeg({ quality: 92 }).toBuffer();
  return { media: { kind: "image", buffer: out, mimetype: "image/jpeg" } };
}

export async function removebg(ctx: CmdCtx): Promise<CmdResult> {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) return { text: "❌ Feature removebg butuh REMOVEBG_API_KEY di server (diset oleh admin). Tidak ada simulasi." };
  const src = await getMediaSource(ctx);
  try {
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/octet-stream", "Accept": "image/png" },
      body: new Uint8Array(src.buffer),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) return { text: `❌ remove.bg menolak request (HTTP ${res.status}).` };
    const out = Buffer.from(await res.arrayBuffer());
    return { media: { kind: "image", buffer: out, mimetype: "image/png" } };
  } catch {
    return { text: "⏱️ Proses terlalu lama. Silakan coba lagi." };
  }
}

export async function imginfo(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  const ft: any = await import("file-type");
  const type = await ft.fileTypeFromBuffer(src.buffer);
  let extra = "";
  if (src.mimetype.startsWith("image") || type?.mime?.startsWith("image")) {
    try {
      const m = await sharp(src.buffer).metadata();
      extra = `\nDimensi : ${m.width}×${m.height}\nFormat  : ${m.format}\nColor   : ${m.space ?? "-"}`;
    } catch {
      /* not an image */
    }
  }
  return {
    text: box("🖼️ MEDIA INFO", [
      `Type    : ${type?.mime ?? src.mimetype}`,
      `Ext     : ${type?.ext ?? extOf(src.mimetype)}`,
      `Ukuran  : ${(src.buffer.length / 1024).toFixed(1)} KB`,
      extra.trim(),
    ].filter(Boolean)),
  };
}

/* --------------------------------- MEDIA -------------------------------- */
function needsMedia(mime: string, kind: "video" | "audio"): string | null {
  if (kind === "video" && !(mime.startsWith("video") || mime === "image/gif")) return "⚠️ Video dibutuhkan untuk command ini.";
  if (kind === "audio" && !(mime.startsWith("audio") || mime.startsWith("video") || mime === "image/gif")) return "⚠️ Audio/video dibutuhkan untuk command ini.";
  return null;
}

export async function tomp3(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  const err = needsMedia(src.mimetype, "audio");
  if (err) return { text: err };
  const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
    const outPath = inPath + ".mp3";
    await ffmpeg(["-i", inPath, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", outPath]);
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return { media: { kind: "audio", buffer: buf, mimetype: "audio/mpeg", filename: "audio.mp3" } };
}
export const toaudio = tomp3;

export async function tovoice(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  const err = needsMedia(src.mimetype, "audio");
  if (err) return { text: err };
  const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
    const outPath = inPath + ".ogg";
    await ffmpeg(["-i", inPath, "-vn", "-c:a", "libopus", "-b:a", "64k", outPath]);
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return { media: { kind: "audio", buffer: buf, mimetype: "audio/ogg", caption: "🎤 Voice" } };
}

export async function togif(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  if (!src.mimetype.startsWith("video") && src.mimetype !== "image/gif") return { text: "⚠️ Video dibutuhkan untuk .togif" };
  const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
    const outPath = inPath + ".gif";
    await ffmpeg(
      ["-i", inPath, "-t", "8", "-vf", "fps=12,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", outPath],
      180000
    );
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return { media: { kind: "image", buffer: buf, mimetype: "image/gif" } };
}

export async function topdf(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  const doc = await PDFDocument.create();
  if (/^https?:\/\//i.test(arg)) {
    const src = { buffer: await safeFetch(arg), mimetype: "image/jpeg" };
    return { text: "⚠️ URL gambar untuk .topdf: reply gambar, atau pakai .topdf dengan reply. (URL teks tidak didukung)" };
  }
  const media = await ctx.getRepliedMedia().catch(() => null);
  if (media && (media.mimetype.startsWith("image") || media.mimetype === "application/pdf")) {
    let page = doc.addPage([595, 842]);
    try {
      if (media.mimetype === "application/pdf") {
        const srcDoc = await PDFDocument.load(media.buffer);
        const pages = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
        page = undefined as any;
        void page;
      } else {
        const img = media.mimetype === "image/png" ? await doc.embedPng(media.buffer) : await doc.embedJpg(media.buffer);
        const w = Math.min(555, img.width);
        const h = (img.height / img.width) * w;
        page.drawImage(img, { x: (595 - w) / 2, y: (842 - h) / 2, width: w, height: Math.min(h, 800) });
      }
    } catch {
      return { text: "❌ Gagal memproses file menjadi PDF (format tidak didukung)." };
    }
  } else if (ctx.arg) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = ctx.arg.split(/\n/).flatMap((l) => l.match(/.{1,90}/g) ?? [l]);
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const line of lines.slice(0, 100)) {
      page.drawText(line, { x: 40, y, size: 11, font, color: rgb(0.1, 0.2, 0.3) });
      y -= 16;
      if (y < 40) break;
    }
  } else {
    return { text: "Pakai: .topdf <teks> atau reply gambar" };
  }
  const bytes = await doc.save();
  return { media: { kind: "document", buffer: Buffer.from(bytes), mimetype: "application/pdf", filename: "water-ai.pdf", caption: "📄 PDF dibuat (pdf-lib)" } };
}

export async function convert(ctx: CmdCtx): Promise<CmdResult> {
  const target = (ctx.parts[1] ?? "").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp", "mp3", "ogg", "m4a"].includes(target))
    return { text: "Pakai: .convert <png|jpg|webp|mp3|ogg|mp4>" };
  const src = await getMediaSource(ctx);
  if (["png", "jpg", "jpeg", "webp"].includes(target)) {
    if (!src.mimetype.startsWith("image")) return { text: "⚠️ Reply gambar untuk konversi image." };
    const fmt = target === "jpg" || target === "jpeg" ? "jpeg" : target;
    const img = sharp(src.buffer);
    const out =
      fmt === "jpeg"
        ? await img.jpeg({ quality: 90 }).toBuffer()
        : fmt === "webp"
          ? await img.webp({ quality: 90 }).toBuffer()
          : await img.png().toBuffer();
    return { media: { kind: "image", buffer: out, mimetype: `image/${fmt}`, caption: ` Dikonversi ke .${target}` } };
  }
  const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
    const ext = target === "m4a" ? ".m4a" : `.${target}`;
    const outPath = inPath + ext;
    await ffmpeg(["-i", inPath, "-vn", "-ar", "44100", "-ac", "2", outPath]);
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  const mime = target === "mp3" ? "audio/mpeg" : target === "ogg" ? "audio/ogg" : "audio/mp4";
  return { media: { kind: "audio", buffer: buf, mimetype: mime, caption: `🔁 Dikonversi ke .${target}` } };
}

export async function mediainfo(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  const lines = [`Type : ${src.mimetype}`, `Ukuran : ${(src.buffer.length / 1024).toFixed(1)} KB`];
  try {
    const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
      const { stderr } = await pExecFile(FF || "ffmpeg", ["-hide_banner", "-i", inPath], { timeout: 30000 });
      const dur = /Duration:\s*([\d:.]+)/.exec(stderr)?.[1];
      const res = /(\d{2,5})x(\d{2,5})/.exec(stderr)?.[0];
      const codec = /Video:\s*([\w ]+)/.exec(stderr)?.[1];
      return { dur, res, codec };
    });
    if (out?.dur) lines.push(`Durasi : ${out.dur}`);
    if (out?.res) lines.push(`Resolusi: ${out.res}`);
    if (out?.codec) lines.push(`Codec : ${out.codec}`);
  } catch {
    /* image or no ffprobe */
    try {
      const m = await sharp(src.buffer).metadata();
      if (m.width) lines.push(`Dimensi : ${m.width}×${m.height}`, `Format  : ${m.format}`);
    } catch {
      /* ignore */
    }
  }
  return { text: box("🎬 MEDIA INFO", lines) };
}

export async function thumbnail(ctx: CmdCtx): Promise<CmdResult> {
  const src = await getMediaSource(ctx);
  if (!src.mimetype.startsWith("video")) return { text: "⚠️ Video dibutuhkan untuk .thumbnail" };
  const out = await withTempFile(src.buffer, extOf(src.mimetype), async (inPath) => {
    const outPath = inPath + ".jpg";
    await ffmpeg(["-i", inPath, "-vframes", "1", "-q:v", "2", "-vf", "scale=640:-1", outPath]);
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return { media: { kind: "image", buffer: buf, mimetype: "image/jpeg" } };
}

/* ---------------------------------- BRAT -------------------------------- */
const BRAT_LINES = ["BRATSTAR 💅", "iconic moment ✨", "no cap, ini brat energy 😤", "it's giving... menang 🏆", "dude. literal icon 💎"];

export async function bratsticker(ctx: CmdCtx): Promise<CmdResult> {
  const line = BRAT_LINES[Math.floor(Math.random() * BRAT_LINES.length)];
  const c: CmdCtx = { ...ctx, arg: line };
  return textsticker(c);
}

async function bratVideo(ctx: CmdCtx): Promise<CmdResult> {
  const line = BRAT_LINES[Math.floor(Math.random() * BRAT_LINES.length)];
  const out = await withTempFile(Buffer.from(""), ".txt", async (tmp) => {
    const outPath = tmp.replace(".txt", ".mp4");
    const safe = line.replace(/'/g, "").replace(/:/g, "\\:");
    await ffmpeg(
      ["-f", "lavfi", "-i", "color=c=0x071018:s=640x360:d=3", "-vf", `drawtext=text='${safe}':fontcolor=0x22d3ee:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2`, "-c:v", "libx264", "-pix_fmt", "yuv420p", outPath],
      90000
    );
    return outPath;
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return { media: { kind: "video", buffer: buf, mimetype: "video/mp4", caption: "💅 BRAT" } };
}
export async function bratgif(ctx: CmdCtx): Promise<CmdResult> {
  const r = await bratVideo(ctx);
  if (r.media) r.media.caption = "💅 BRAT (video)";
  return r;
}
export const bratvideo = bratgif;

export { sanitizeFilename };
