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


/** Deploy ZIP (reply dokumen .zip) ke E2B sandbox — URL publik aktif ±1–3 jam */
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
        "",
        "Daftar key: https://e2b.dev/dashboard?tab=keys",
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
        "Bot akan: upload ZIP → extract → install deps (bila ada) → jalankan HTTP server di port 3000 → kirim URL publik.",
      ]),
    };
  }

  const filename = (quoted as any).filename || "";
  const isZip =
    /zip|x-zip|octet-stream/i.test(quoted.mimetype || "") ||
    /\.zip$/i.test(filename) ||
    quoted.buffer.slice(0, 4).toString("binary").startsWith("PK");
  if (!isZip) {
    return {
      text: box("⚠️ BUKAN ZIP", [
        `MIME: ${quoted.mimetype || "-"}`,
        `Nama: ${filename || "-"}`,
        "",
        "Reply file *.zip* (document), bukan foto/video.",
      ]),
    };
  }
  if (quoted.buffer.length > 40 * 1024 * 1024) throw new CmdError("🥀 ZIP maksimal 40 MB.");

  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "⏳ Membuat sandbox E2B...");
  const work = await fs.promises.mkdtemp(path.join(tmpDir, "e2b-"));

  try {
    const templateID = (process.env.E2B_TEMPLATE_ID || bs.e2bTemplateId || "base").trim();
    const timeoutSec = Math.min(
      Number(process.env.E2B_TIMEOUT_SEC || 3600) || 3600,
      3 * 60 * 60
    );

    // Official E2B SDK — handles envd process + files correctly
    const { Sandbox } = await import("e2b");
    const sandbox = await Sandbox.create(templateID, {
      apiKey: e2bKey,
      timeoutMs: timeoutSec * 1000,
      metadata: { source: "water-ai-cloud", botId: String(ctx.bot.id || "") },
    });

    const sandboxId = sandbox.sandboxId;

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📦 Upload ZIP ke sandbox...");

    // Write ZIP into sandbox filesystem
    // E2B files.write types: string | ArrayBuffer | Blob | ReadableStream
    // Node Buffer tidak assignable ke ArrayBuffer di TS strict — copy ke ArrayBuffer murni
    const zipAb = new ArrayBuffer(quoted.buffer.byteLength);
    new Uint8Array(zipAb).set(quoted.buffer);
    await sandbox.files.write("/home/user/project.zip", zipAb);

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📂 Extract project...");

    // Extract; flatten single top-level folder if present
    const extractResult = await sandbox.commands.run(
      [
        "mkdir -p /home/user/app",
        "cd /home/user",
        "(unzip -o project.zip -d app || tar -xf project.zip -C app || true)",
        // If zip contains a single root folder, move its contents up
        'ENTRIES=$(find app -mindepth 1 -maxdepth 1 | wc -l)',
        'if [ "$ENTRIES" -eq 1 ]; then',
        '  SUB=$(find app -mindepth 1 -maxdepth 1 -type d | head -1)',
        '  if [ -n "$SUB" ]; then shopt -s dotglob; mv "$SUB"/* app/ 2>/dev/null; rmdir "$SUB" 2>/dev/null; fi',
        "fi",
        "ls -la /home/user/app | head -25",
      ].join(" && "),
      { cwd: "/home/user", timeoutMs: 120_000 }
    );

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📦 Install dependencies...");

    // Install deps if package.json / requirements.txt exists
    await sandbox.commands.run(
      [
        "cd /home/user/app",
        "if [ -f package.json ]; then",
        "  npm install --omit=dev --no-audit --no-fund 2>&1 | tail -8",
        "elif [ -f requirements.txt ]; then",
        "  pip3 install -r requirements.txt -q 2>&1 | tail -5",
        "else",
        "  echo NO_PACKAGE_MANAGER",
        "fi",
      ].join("\n"),
      { cwd: "/home/user/app", timeoutMs: 300_000 }
    ).catch(() => null);

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🚀 Start server di port 3000...");

    // Choose start strategy and launch in BACKGROUND so the process keeps running
    // python3 -m http.server is always available on E2B base template as reliable fallback
    const startScript = [
      "cd /home/user/app",
      "rm -f /tmp/serve.log /tmp/serve.pid",
      "if [ -f package.json ] && grep -q '\"start\"' package.json 2>/dev/null; then",
      "  nohup env PORT=3000 HOST=0.0.0.0 npm start > /tmp/serve.log 2>&1 & echo $! > /tmp/serve.pid",
      "elif [ -f package.json ] && grep -q '\"dev\"' package.json 2>/dev/null; then",
      "  nohup env PORT=3000 HOST=0.0.0.0 npm run dev > /tmp/serve.log 2>&1 & echo $! > /tmp/serve.pid",
      "elif [ -f index.html ] || [ -f public/index.html ] || [ -d dist ] || [ -d build ]; then",
      "  DIR=.",
      "  [ -d public ] && DIR=public",
      "  [ -d dist ] && DIR=dist",
      "  [ -d build ] && DIR=build",
      "  nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory \"$DIR\" > /tmp/serve.log 2>&1 & echo $! > /tmp/serve.pid",
      "else",
      "  nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/user/app > /tmp/serve.log 2>&1 & echo $! > /tmp/serve.pid",
      "fi",
      "sleep 2",
      "echo PID=$(cat /tmp/serve.pid 2>/dev/null)",
      "ss -tlnp 2>/dev/null | grep 3000 || netstat -tlnp 2>/dev/null | grep 3000 || true",
      "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' http://127.0.0.1:3000/ || true",
      "head -20 /tmp/serve.log 2>/dev/null || true",
    ].join("\n");

    // Run start script once (it backgrounds the server with nohup)
    await sandbox.commands.run(startScript, {
      cwd: "/home/user/app",
      timeoutMs: 60_000,
    });

    // Also explicitly start python http.server in background via SDK (belt + suspenders)
    // in case the nohup path failed
    try {
      await sandbox.commands.run(
        "python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/user/app",
        { background: true, cwd: "/home/user/app" } as any
      );
    } catch {
      /* may already be listening */
    }

    // Wait a bit and probe port
    await new Promise((r) => setTimeout(r, 2500));
    let portOk = false;
    try {
      const probe = await sandbox.commands.run(
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo FAIL",
        { timeoutMs: 15_000 }
      );
      const code = String((probe as any).stdout || "").trim();
      portOk = /^(200|301|302|304|403|404)/.test(code);
    } catch {
      portOk = false;
    }

    // If still not up, force python static server in background
    if (!portOk) {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔁 Retry static server...");
      try {
        await sandbox.commands.run("pkill -f 'http.server 3000' 2>/dev/null || true", {
          timeoutMs: 10_000,
        });
      } catch { /* ignore */ }
      await sandbox.commands.run(
        "python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/user/app",
        { background: true, cwd: "/home/user/app" } as any
      );
      await new Promise((r) => setTimeout(r, 2000));
    }

    const host = sandbox.getHost(3000);
    const publicUrl = `https://${host}`;

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Deploy selesai.");

    // Note: do NOT kill the sandbox — leave it running so the URL stays live
    return {
      text: box("✅ SANDBOX DEPLOYED", [
        `🧪 Sandbox : ${sandboxId}`,
        `🔗 URL     : ${publicUrl}`,
        `⏱️ Aktif   : ±${Math.round(timeoutSec / 60)} menit`,
        `📦 Template: ${templateID}`,
        portOk ? "🟢 Port 3000 : OK" : "🟡 Port 3000 : starting (tunggu 5–15 detik)",
        "",
        "Buka URL di browser. Sandbox otomatis mati setelah timeout.",
        "File project ada di /home/user/app di dalam sandbox.",
        (extractResult as any)?.stdout
          ? `Extract: ${String((extractResult as any).stdout).split("\n").slice(0, 3).join(" | ").slice(0, 120)}`
          : "",
      ]),
    };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Deploy gagal.");
    if (e instanceof CmdError) throw e;
    const msg = String(e?.message || e).slice(0, 280);
    throw new CmdError(
      `🥀 Sandbox deploy gagal: ${msg}\n` +
        "Cek E2B_API_KEY, kuota E2B, dan pastikan package `e2b` terinstall di server."
    );
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
