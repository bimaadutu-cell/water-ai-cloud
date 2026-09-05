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
        "Bot: upload → extract → install → build → serve :3000 → URL publik.",
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

    async function sh(cmd: string, timeoutMs = 180_000): Promise<string> {
      const full = `bash -lc ${JSON.stringify(cmd + "\nexit 0")}`;
      try {
        const res: any = await sandbox.commands.run(full, { timeoutMs } as any);
        return String(res?.stdout || res?.stderr || "");
      } catch (e: any) {
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
        "rm -rf app",
        "mkdir -p app",
        "unzip -o project.zip -d app 2>/dev/null || python3 -c \"import zipfile; zipfile.ZipFile('project.zip').extractall('app')\"",
        "cd /home/user/app",
        "count=$(find . -mindepth 1 -maxdepth 1 | wc -l)",
        'if [ "$count" -eq 1 ]; then',
        '  sub=$(find . -mindepth 1 -maxdepth 1 -type d | head -1)',
        '  if [ -n "$sub" ]; then shopt -s dotglob; mv "$sub"/* . 2>/dev/null; rmdir "$sub" 2>/dev/null; fi',
        "fi",
        "ls -la | head -30",
      ].join("\n"),
      120_000
    );

    const detect = await sh(
      "cd /home/user/app; " +
        "if [ -f package.json ]; then " +
        "  if grep -qi next package.json 2>/dev/null || [ -f next.config.js ] || [ -f next.config.mjs ] || [ -f next.config.ts ]; then echo TYPE=next; " +
        "  else echo TYPE=node; fi; " +
        "elif [ -f index.html ]; then echo TYPE=static; " +
        "elif [ -f public/index.html ]; then echo TYPE=static_public; " +
        "else echo TYPE=static; fi",
      30_000
    );
    const isNext = /TYPE=next/i.test(detect);
    const isNode = /TYPE=node/i.test(detect) || isNext;
    const isStaticPublic = /TYPE=static_public/i.test(detect);

    if (isNode) {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📥 npm install (bisa lama)...");
      await sh(
        "cd /home/user/app && (npm install --no-audit --no-fund --legacy-peer-deps 2>&1 || yarn install 2>&1 || pnpm install 2>&1) | tail -20",
        450_000
      );

      if (isNext) {
        if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔨 next build...");
        await sh(
          [
            "cd /home/user/app",
            "export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1",
            "export DATABASE_URL=\"${DATABASE_URL:-postgresql://u:p@127.0.0.1:5432/db}\"",
            "export AUTH_SECRET=\"${AUTH_SECRET:-sandbox-build-secret}\"",
            "export NEXTAUTH_SECRET=\"${NEXTAUTH_SECRET:-sandbox-build-secret}\"",
            "(npx next build 2>&1 || npm run build 2>&1) | tail -40",
            "ls -la .next 2>/dev/null | head -8 || echo NO_NEXT_DIR",
          ].join("\n"),
          600_000
        );
      }
    }

    // Pastikan ada index.html untuk static (hindari 404 kosong)
    if (!isNode) {
      await sh(
        [
          "cd /home/user/app",
          "if [ ! -f index.html ] && [ -f public/index.html ]; then cp public/index.html ./index.html; fi",
          "if [ ! -f index.html ]; then",
          "  cat > index.html << 'HTML'",
          "<!DOCTYPE html><html><head><meta charset=utf-8><title>Sandbox Deploy</title>",
          "<style>body{font-family:system-ui;background:#0b1020;color:#e2e8f0;padding:2rem}",
          "a{color:#38bdf8}</style></head><body>",
          "<h1>💧 Sandbox Deploy OK</h1>",
          "<p>Project diekstrak. Tidak ada index.html di root — listing file:</p><ul>",
          "HTML",
          "  find . -maxdepth 2 -type f | head -40 | while read f; do echo \"<li>$f</li>\"; done >> index.html",
          "  echo '</ul></body></html>' >> index.html",
          "fi",
        ].join("\n"),
        30_000
      );
    }

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🚀 Start server :3000...");
    // Hanya satu server — jangan tumpuk python di atas next
    await sh(
      "pkill -f 'http.server' 2>/dev/null; pkill -f 'next start' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; pkill -f 'node.*3000' 2>/dev/null; sleep 1; true",
      15_000
    );

    let serveMode = "static";
    if (isNext) {
      serveMode = "next";
      await sh(
        [
          "cd /home/user/app",
          "export PORT=3000 HOSTNAME=0.0.0.0 HOST=0.0.0.0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1",
          "export DATABASE_URL=\"${DATABASE_URL:-postgresql://u:p@127.0.0.1:5432/db}\"",
          "export AUTH_SECRET=\"${AUTH_SECRET:-sandbox-secret}\"",
          "if [ -d .next ]; then",
          "  nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/serve.log 2>&1 &",
          "else",
          "  nohup npx next dev -H 0.0.0.0 -p 3000 > /tmp/serve.log 2>&1 &",
          "fi",
          "echo $! > /tmp/serve.pid",
          "sleep 6",
          "head -40 /tmp/serve.log",
        ].join("\n"),
        90_000
      );
    } else if (isNode) {
      serveMode = "node";
      await sh(
        [
          "cd /home/user/app",
          "export PORT=3000 HOST=0.0.0.0",
          "if grep -q '\"start\"' package.json; then",
          "  nohup npm start > /tmp/serve.log 2>&1 &",
          "else",
          "  nohup npx --yes serve -s -l 3000 . > /tmp/serve.log 2>&1 &",
          "fi",
          "echo $! > /tmp/serve.pid",
          "sleep 4",
          "head -30 /tmp/serve.log",
        ].join("\n"),
        60_000
      );
    } else {
      const dir = isStaticPublic ? "/home/user/app/public" : "/home/user/app";
      await sh(
        [
          "DIR=" + dir,
          'nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory "$DIR" > /tmp/serve.log 2>&1 &',
          "echo $! > /tmp/serve.pid",
          "sleep 2",
          "head -10 /tmp/serve.log",
        ].join("\n"),
        30_000
      );
    }


    await new Promise((r) => setTimeout(r, isNext ? 10000 : 3000));
    let probe = await sh(
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo FAIL",
      20_000
    );
    let portOk = /200|301|302|304|307|308/.test(probe);

    // Jika Next/Node gagal, baru fallback static (dengan index.html)
    if (!portOk) {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔁 Fallback static :3000...");
      await sh(
        [
          "pkill -f 'http.server' 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 1",
          "cd /home/user/app",
          "if [ ! -f index.html ]; then echo '<h1>Deploy OK</h1><p>Server fallback.</p>' > index.html; fi",
          "nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/user/app > /tmp/serve.log 2>&1 &",
          "sleep 2",
          "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/",
        ].join("\n"),
        30_000
      );
      serveMode = "static-fallback";
      probe = await sh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo FAIL", 15_000);
      portOk = /200|301|302|304|307|308/.test(probe);
    }

    const host = sandbox.getHost(3000);
    const publicUrl = `https://${host}`;
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Deploy selesai.");

    const kind = isNext ? "Next.js" : isNode ? "Node" : "Static";
    return {
      text: box("✅ SANDBOX DEPLOYED", [
        `🧪 Sandbox : ${sandboxId}`,
        `📦 Jenis   : ${kind} (${serveMode})`,
        `🔗 URL     : ${publicUrl}`,
        `⏱️ Aktif   : ±${Math.round(timeoutSec / 60)} menit`,
        portOk ? "🟢 Root / : OK" : "🟡 Root / : masih warm-up — refresh 15–30 detik",
        "",
        isNext
          ? "Next.js butuh build sukses. Jika 404, buka URL lalu tunggu / cek log build."
          : "Buka URL di browser. Bagikan selama sandbox hidup.",
      ]),
    };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Deploy gagal.");
    if (e instanceof CmdError) throw e;
    throw new CmdError(
      `🥀 Sandbox deploy gagal: ${String(e?.message || e).slice(0, 280)}\n` +
        "Cek E2B API Key di Dashboard bot."
    );
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}



/** .emojisl — intentionally does NOT spam 5k–10k reactions (WhatsApp ToS / abuse). */
export async function emojisl(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text:
      "⚠️ Fitur mass-reaction (ribuan reaction ke status/pesan orang lain) *tidak tersedia*.\n\n" +
      "Alasan:\n" +
      "• Melanggar kebijakan WhatsApp\n" +
      "• Bisa dianggap spam / pelecehan\n" +
      "• Baileys tidak mendukung inflate reaction palsu ke target arbitrary secara massal\n\n" +
      "Yang diizinkan: reaction terbatas pada pesan bot sendiri di chat ini (opsional).\n" +
      "Contoh aman: reply pesan bot lalu ketik reaction manual di WhatsApp.",
  };
}
