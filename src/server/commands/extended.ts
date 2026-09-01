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


/** Deploy ZIP (reply dokumen .zip) ke E2B sandbox — Next.js / static / Node */
export async function sandboxdeploy(ctx: CmdCtx): Promise<CmdResult> {
  const bs = (ctx.bot.settings as any) || {};
  const e2bKey = (bs.e2bApiKey || process.env.E2B_API_KEY || "").trim();
  if (!e2bKey) {
    return {
      text: box("🧪 SANDBOX DEPLOY", [
        "E2B API Key belum diset.",
        "Isi *E2B API Key* di Dashboard bot (Settings) atau set E2B_API_KEY di .env server.",
        "",
        `Reply file *.zip* → ketik *${ctx.bot.prefix}sandboxdeploy*`,
        "Support: Next.js, static HTML, Node (package.json).",
        "Key: https://e2b.dev/dashboard?tab=keys",
      ]),
    };
  }

  const quoted = await ctx.getRepliedMedia();
  if (!quoted) {
    return {
      text: box("🧪 SANDBOX DEPLOY", [
        "Reply *file .zip* project web (Next.js / HTML / Node), lalu:",
        `*${ctx.bot.prefix}sandboxdeploy*`,
        "",
        "Bot akan: upload → extract → npm install → build (jika Next) → serve :3000 → URL publik.",
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
        "Reply file *.zip* document.",
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

    const { Sandbox } = await import("e2b");
    const sandbox = await Sandbox.create(templateID, {
      apiKey: e2bKey,
      timeoutMs: timeoutSec * 1000,
      metadata: { source: "water-ai-cloud", botId: String(ctx.bot.id || "") },
    });
    const sandboxId = sandbox.sandboxId;

    /** Run shell; never throw on non-zero exit */
    async function sh(cmd: string, timeoutMs = 180_000, background = false): Promise<string> {
      const full = `bash -lc ${JSON.stringify(cmd + "\nexit 0")}`;
      try {
        const opts: any = { timeoutMs };
        if (background) opts.background = true;
        const res: any = await sandbox.commands.run(full, opts);
        return String(res?.stdout || "");
      } catch (e: any) {
        if (background) return "bg";
        return String(e?.result?.stdout || e?.stdout || e?.message || "");
      }
    }

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📦 Upload ZIP...");
    const zipAb = new ArrayBuffer(quoted.buffer.byteLength);
    new Uint8Array(zipAb).set(quoted.buffer);
    await sandbox.files.write("/home/user/project.zip", zipAb);

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📂 Extract project...");
    await sh(
      [
        "mkdir -p /home/user/app",
        "cd /home/user",
        "rm -rf app/*",
        "unzip -o project.zip -d app 2>/dev/null || python3 -c \"import zipfile; zipfile.ZipFile('project.zip').extractall('app')\"",
        "cd /home/user/app",
        // flatten one root folder
        "count=$(find . -mindepth 1 -maxdepth 1 | wc -l)",
        'if [ "$count" -eq 1 ]; then',
        '  sub=$(find . -mindepth 1 -maxdepth 1 -type d | head -1)',
        '  if [ -n "$sub" ]; then shopt -s dotglob; mv "$sub"/* . 2>/dev/null; rmdir "$sub" 2>/dev/null; fi',
        "fi",
        "ls -la | head -25",
        "test -f package.json && echo HAS_PACKAGE_JSON || echo NO_PACKAGE_JSON",
        "test -f next.config.js -o -f next.config.mjs -o -f next.config.ts && echo HAS_NEXT || true",
      ].join("\n"),
      120_000
    );

    // Detect project type
    const detect = await sh(
      "cd /home/user/app; " +
        "if [ -f package.json ]; then " +
        "  if grep -q next package.json 2>/dev/null || [ -f next.config.js ] || [ -f next.config.mjs ] || [ -f next.config.ts ]; then echo TYPE=next; " +
        "  elif grep -q '\"start\"' package.json; then echo TYPE=node; " +
        "  else echo TYPE=node; fi; " +
        "elif [ -f index.html ] || [ -f public/index.html ]; then echo TYPE=static; " +
        "else echo TYPE=static; fi",
      30_000
    );
    const isNext = /TYPE=next/i.test(detect);
    const isNode = /TYPE=node/i.test(detect) || isNext;

    if (isNode) {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📥 npm install...");
      await sh(
        "cd /home/user/app && npm install --no-audit --no-fund 2>&1 | tail -15",
        400_000
      );

      if (isNext) {
        if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔨 next build (bisa 1–3 menit)...");
        await sh(
          [
            "cd /home/user/app",
            "export NODE_ENV=production",
            "export NEXT_TELEMETRY_DISABLED=1",
            // dummy env for build
            "export DATABASE_URL=\"${DATABASE_URL:-postgresql://u:p@127.0.0.1:5432/db}\"",
            "export AUTH_SECRET=\"${AUTH_SECRET:-sandbox-build-secret}\"",
            "npx next build 2>&1 | tail -30 || npm run build 2>&1 | tail -30 || true",
            "ls -la .next 2>/dev/null | head -5 || echo NO_NEXT_DIR",
          ].join("\n"),
          500_000
        );
      }
    }

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🚀 Start server :3000...");
    await sh("pkill -f 'http.server 3000' 2>/dev/null; pkill -f 'next start' 2>/dev/null; pkill -f 'node.*3000' 2>/dev/null; true", 15_000);

    if (isNext) {
      // Prefer next start after build; fallback next dev
      await sh(
        [
          "cd /home/user/app",
          "export PORT=3000 HOSTNAME=0.0.0.0 HOST=0.0.0.0 NODE_ENV=production",
          "export DATABASE_URL=\"${DATABASE_URL:-postgresql://u:p@127.0.0.1:5432/db}\"",
          "export AUTH_SECRET=\"${AUTH_SECRET:-sandbox-secret}\"",
          "if [ -d .next ]; then",
          "  nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/serve.log 2>&1 &",
          "else",
          "  nohup npx next dev -H 0.0.0.0 -p 3000 > /tmp/serve.log 2>&1 &",
          "fi",
          "echo $! > /tmp/serve.pid",
          "sleep 4",
          "head -30 /tmp/serve.log",
        ].join("\n"),
        60_000
      );
    } else if (isNode) {
      await sh(
        [
          "cd /home/user/app",
          "export PORT=3000 HOST=0.0.0.0",
          "if grep -q '\"start\"' package.json; then",
          "  nohup npm start > /tmp/serve.log 2>&1 &",
          "else",
          "  nohup npx --yes serve -l 3000 . > /tmp/serve.log 2>&1 &",
          "fi",
          "echo $! > /tmp/serve.pid",
          "sleep 3",
          "head -20 /tmp/serve.log",
        ].join("\n"),
        60_000
      );
    } else {
      await sh(
        [
          "DIR=/home/user/app",
          "[ -d /home/user/app/public ] && DIR=/home/user/app/public",
          "[ -d /home/user/app/dist ] && DIR=/home/user/app/dist",
          "[ -d /home/user/app/build ] && DIR=/home/user/app/build",
          "nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory \"$DIR\" > /tmp/serve.log 2>&1 &",
          "echo $! > /tmp/serve.pid",
          "sleep 2",
        ].join("\n"),
        30_000
      );
    }

    // SDK background backup for static
    try {
      await sandbox.commands.run(
        "bash -lc 'python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/user/app'",
        { background: true, timeoutMs: 0 } as any
      );
    } catch { /* may already bound */ }

    await new Promise((r) => setTimeout(r, isNext ? 8000 : 3000));
    let probe = await sh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo FAIL", 20_000);
    let portOk = /200|301|302|304|403|404/.test(probe);

    if (!portOk) {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔁 Fallback static server...");
      await sh(
        "pkill -f 'http.server' 2>/dev/null; " +
          "nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/user/app > /tmp/serve.log 2>&1 & sleep 2; " +
          "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/",
        30_000
      );
      probe = await sh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo FAIL", 15_000);
      portOk = /200|301|302|304|403|404/.test(probe);
    }

    const host = sandbox.getHost(3000);
    const publicUrl = `https://${host}`;
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Deploy selesai.");

    const kind = isNext ? "Next.js" : isNode ? "Node" : "Static";
    return {
      text: box("✅ SANDBOX DEPLOYED", [
        `🧪 Sandbox : ${sandboxId}`,
        `📦 Jenis   : ${kind}`,
        `🔗 URL     : ${publicUrl}`,
        `⏱️ Aktif   : ±${Math.round(timeoutSec / 60)} menit`,
        portOk ? "🟢 Port 3000 : OK" : "🟡 Port 3000 : warm-up — refresh 10–30 detik",
        "",
        isNext
          ? "Next.js: npm install → build → next start. Jika blank, tunggu build selesai lalu refresh."
          : "Buka URL di browser. Bisa dibagikan ke orang lain selama sandbox hidup.",
      ]),
    };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Deploy gagal.");
    if (e instanceof CmdError) throw e;
    throw new CmdError(
      `🥀 Sandbox deploy gagal: ${String(e?.message || e).slice(0, 280)}\n` +
        "Cek E2B_API_KEY, kuota, dan package e2b di server."
    );
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
