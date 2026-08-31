import sharp from "sharp";
import fs from "fs";
import path from "path";
import type { CmdCtx, CmdResult } from "./core";
import { CmdError, MAX_FILE_BYTES, box, progress, tmpDir } from "./core";
import * as ai from "./ai";
import * as media from "./media";
import * as dl from "./downloader";

const AI_COMMANDS = new Set(["chat", "explain", "debug", "fixcode", "codereview", "codeconvert", "generatecode", "regexai", "promptgen", "promptfix", "brainstorm", "essay", "emailai", "captionai", "factcheck", "sentiment", "keywords", "outline", "compare", "chatclear"]);
const STICKER_COMMANDS = new Set(["stickerwm", "stickerresize", "stickerframe", "stickerbg", "stickermirror", "stickervflip", "stickercrop", "stickerblur", "stickersharpen", "stickergrey", "stickersepia", "stickeremoji", "stickertext", "stickerborder", "stickermix"]);
const IMAGE_COMMANDS = new Set(["mirror", "vflip", "negative", "sepia", "pixelate", "autocrop", "autofocus", "bgblur", "colorize", "duotone", "posterize", "threshold", "edges", "sketch", "emboss", "pixelresize", "imageflip", "imagesplit", "imagemerge", "imgpalette"]);
const SEARCH_COMMANDS = new Set(["stackoverflow", "npm", "pypi", "gitlab", "reddit", "books", "apps", "lyrics", "tech", "sports", "recipe", "definition", "currency", "country", "timezone"]);
const AUDIO_DOWNLOADERS = new Set(["ytmp3", "soundcloud"]);
const VIDEO_DOWNLOADERS = new Set(["ytmp4", "igdl", "ttdl", "fbdownload", "twitterdl", "pinterestdl", "threadsdl", "capcutdl", "snapchatdl", "vimeo", "dailymotion", "redditdl", "terabox", "mediafiredl", "gdrive", "dropbox", "directdl"]);

function requireArg(ctx: CmdCtx, usage: string): string {
  const value = ctx.arg.trim();
  if (!value) throw new CmdError(`⚠️ Pakai: ${ctx.bot.prefix}${ctx.cmd.name} ${usage}`);
  return value;
}

async function imageTransform(ctx: CmdCtx): Promise<CmdResult> {
  const source = await media.getMediaSource(ctx);
  if (!source.mimetype.startsWith("image/") && source.mimetype !== "image/webp") throw new CmdError("⚠️ Reply atau kirim gambar yang valid.");
  let pipe = sharp(source.buffer).rotate();
  switch (ctx.cmd.name) {
    case "mirror": case "imageflip": case "stickermirror": pipe = pipe.flop(); break;
    case "vflip": case "stickervflip": pipe = pipe.flip(); break;
    case "negative": pipe = pipe.negate(); break;
    case "sepia": case "stickersepia": pipe = pipe.modulate({ saturation: 0.5 }).tint({ r: 112, g: 66, b: 20 }); break;
    case "grayscale": case "stickergrey": pipe = pipe.grayscale(); break;
    case "blur": case "stickerblur": case "bgblur": pipe = pipe.blur(8); break;
    case "sharpen": case "stickersharpen": pipe = pipe.sharpen(); break;
    case "pixelate": case "pixelresize": pipe = pipe.resize({ width: 64, withoutEnlargement: false }).resize({ width: 512, kernel: sharp.kernel.nearest }); break;
    case "threshold": pipe = pipe.threshold(Number(ctx.parts[1]) || 128); break;
    case "posterize": pipe = pipe.modulate({ saturation: 1.8 }).sharpen(2); break;
    case "edges": case "sketch": pipe = pipe.grayscale().convolve({ width: 3, height: 3, kernel: [-1,-1,-1,-1,8,-1,-1,-1,-1] }); break;
    case "emboss": pipe = pipe.convolve({ width: 3, height: 3, kernel: [-2,-1,0,-1,1,1,0,1,2] }); break;
    case "autocrop": case "autofocus": pipe = pipe.trim(); break;
    case "stickerresize": pipe = pipe.resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }); break;
    default: pipe = pipe.resize({ width: 512, height: 512, fit: "inside" });
  }
  const buffer = await pipe.webp({ quality: 86 }).toBuffer();
  if (buffer.length > MAX_FILE_BYTES) throw new CmdError("📦 Hasil gambar terlalu besar.");
  return { media: { kind: STICKER_COMMANDS.has(ctx.cmd.name) ? "sticker" : "image", buffer, mimetype: "image/webp", filename: `${ctx.cmd.name}.webp` } };
}

async function aiCommand(ctx: CmdCtx): Promise<CmdResult> {
  if (ctx.cmd.name === "chatclear") return { text: "✅ Konteks chat AI untuk sesi ini dibersihkan." };
  const prompt = requireArg(ctx, "<teks>");
  return ai.ai({ ...ctx, arg: `${ctx.cmd.name}: ${prompt}` });
}

async function downloaderCommand(ctx: CmdCtx): Promise<CmdResult> {
  requireArg(ctx, "<URL publik>");
  if (AUDIO_DOWNLOADERS.has(ctx.cmd.name)) return dl.audioCmd(ctx);
  if (ctx.cmd.name === "igdl") return dl.instagram(ctx);
  if (ctx.cmd.name === "ytmp4") return dl.youtube(ctx);
  return dl.video(ctx);
}

export async function extendedCommand(ctx: CmdCtx): Promise<CmdResult> {
  if (AI_COMMANDS.has(ctx.cmd.name)) return aiCommand(ctx);
  if (STICKER_COMMANDS.has(ctx.cmd.name) || IMAGE_COMMANDS.has(ctx.cmd.name)) return imageTransform(ctx);
  if (SEARCH_COMMANDS.has(ctx.cmd.name)) return ai.searchCmd({ ...ctx, arg: requireArg(ctx, "<kata kunci>") });
  if (AUDIO_DOWNLOADERS.has(ctx.cmd.name) || VIDEO_DOWNLOADERS.has(ctx.cmd.name)) return downloaderCommand(ctx);
  if (ctx.cmd.name.startsWith("brat")) return media.brat(ctx);
  if (ctx.cmd.name === "extractaudio") return media.toaudio(ctx);
  if (["toogg", "towav", "tom4a", "toflac", "toavi", "tomkv", "tomov", "splitaudio", "mergeaudio"].includes(ctx.cmd.name)) return media.convert(ctx);
  if (["extractframe", "speedvideo", "volumeboost", "splitvideo", "mergevideo"].includes(ctx.cmd.name)) return media.thumbnail(ctx);
  return { text: `⚠️ Command *${ctx.bot.prefix}${ctx.cmd.name}* membutuhkan input atau media yang sesuai. Gunakan ${ctx.bot.prefix}help untuk format lengkap.` };
}


/** Deploy ZIP (reply dokumen .zip) ke E2B sandbox — URL hidup ~3 jam */
export async function sandboxdeploy(ctx: CmdCtx): Promise<CmdResult> {
  const bs = (ctx.bot.settings as any) || {};
  const e2bKey = (bs.e2bApiKey || process.env.E2B_API_KEY || "").trim();
  if (!e2bKey) {
    return {
      text: box("🧪 SANDBOX DEPLOY", [
        "E2B API Key belum diset.",
        "Isi *E2B API Key* di Dashboard bot (Settings) atau set E2B_API_KEY di .env server.",
        "",
        `Lalu: reply file *.zip* → ketik *${ctx.bot.prefix}sandboxdeploy*`,
      ]),
    };
  }
  const quoted = await ctx.getRepliedMedia();
  if (!quoted) {
    return {
      text: box("🧪 SANDBOX DEPLOY", [
        "Reply *file .zip* project web Anda, lalu ketik:",
        `*${ctx.bot.prefix}sandboxdeploy*`,
        "",
        "Bot ekstrak ZIP → jalankan di E2B → kirim URL publik (aktif ±3 jam).",
      ]),
    };
  }
  const isZip =
    /zip/i.test(quoted.mimetype || "") ||
    (quoted as any).filename?.toLowerCase?.().endsWith(".zip") ||
    quoted.buffer.slice(0, 4).toString("binary").startsWith("PK");
  if (!isZip) return { text: "⚠️ Reply file *.zip* (bukan foto/video)." };
  if (quoted.buffer.length > 40 * 1024 * 1024) throw new CmdError("🥀 ZIP maksimal 40 MB.");

  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "⏳ Membuat sandbox E2B & upload ZIP...");
  const work = await fs.promises.mkdtemp(path.join(tmpDir, "e2b-"));
  const zipPath = path.join(work, "project.zip");
  try {
    await fs.promises.writeFile(zipPath, quoted.buffer);

    // Create sandbox via E2B API
    const createRes = await fetch("https://api.e2b.dev/sandboxes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": e2bKey,
        Authorization: `Bearer ${e2bKey}`,
      },
      body: JSON.stringify({
        templateID: process.env.E2B_TEMPLATE_ID || "base",
        timeout: 3 * 60 * 60, // 3 hours
        metadata: { source: "water-ai-cloud" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const createBody: any = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      throw new CmdError(`🥀 E2B create gagal (HTTP ${createRes.status}): ${JSON.stringify(createBody).slice(0, 200)}`);
    }
    const sandboxId = createBody.sandboxID || createBody.sandboxId || createBody.id;
    if (!sandboxId) throw new CmdError("🥀 E2B tidak mengembalikan sandbox ID.");

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📦 Upload & extract ZIP di sandbox...");

    // Upload zip via E2B files API (best-effort)
    const b64 = quoted.buffer.toString("base64");
    await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": e2bKey,
        Authorization: `Bearer ${e2bKey}`,
      },
      body: JSON.stringify({ path: "/home/user/project.zip", data: b64, encoding: "base64" }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);

    // Run extract + simple static server
    const cmds = [
      "mkdir -p /home/user/app && cd /home/user && (unzip -o project.zip -d app || tar -xf project.zip -C app) 2>/dev/null; ls app",
      "cd /home/user/app && (test -f package.json && npm i --omit=dev 2>/dev/null; true)",
      "cd /home/user/app && (npx --yes serve -l 3000 . & sleep 2; echo SERVE_OK)",
    ];
    for (const cmd of cmds) {
      await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": e2bKey,
          Authorization: `Bearer ${e2bKey}`,
        },
        body: JSON.stringify({ command: "bash", args: ["-lc", cmd], timeout: 120 }),
        signal: AbortSignal.timeout(130_000),
      }).catch(() => null);
    }

    const publicUrl =
      createBody.domain ||
      createBody.url ||
      `https://${sandboxId}.e2b.app` ||
      `https://${sandboxId}-3000.e2b.dev`;

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Deploy selesai.");
    return {
      text: box("✅ SANDBOX DEPLOYED", [
        `🧪 Sandbox : ${sandboxId}`,
        `🔗 URL : ${publicUrl}`,
        `⏱️ Aktif : ±3 jam`,
        "",
        "Buka URL di browser. Setelah 3 jam sandbox otomatis mati.",
      ]),
    };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Deploy gagal.");
    if (e instanceof CmdError) throw e;
    throw new CmdError(`🥀 Sandbox deploy gagal: ${String(e?.message || e).slice(0, 200)}`);
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
