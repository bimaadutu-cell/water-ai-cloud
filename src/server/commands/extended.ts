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


/** Deploy ZIP (reply dokumen .zip) ke E2B sandbox — URL hidup ~1–3 jam */
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
        "Daftar key gratis: https://e2b.dev/dashboard?tab=keys",
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
        "Bot ekstrak ZIP → install deps (bila ada) → serve di port 3000 → kirim URL publik.",
        "Sandbox aktif ±1–3 jam lalu otomatis mati.",
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
        "Reply file *.zip* (document), bukan foto/video/sticker.",
      ]),
    };
  }
  if (quoted.buffer.length > 40 * 1024 * 1024) throw new CmdError("🥀 ZIP maksimal 40 MB.");

  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "⏳ Membuat sandbox E2B...");
  const work = await fs.promises.mkdtemp(path.join(tmpDir, "e2b-"));
  try {
    // Official control plane: api.e2b.app (bukan api.e2b.dev)
    const templateID = (process.env.E2B_TEMPLATE_ID || bs.e2bTemplateId || "base").trim();
    const timeoutSec = Math.min(
      Number(process.env.E2B_TIMEOUT_SEC || 3600) || 3600,
      3 * 60 * 60
    );

    const createRes = await fetch("https://api.e2b.app/sandboxes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": e2bKey,
      },
      body: JSON.stringify({
        templateID,
        timeout: timeoutSec,
        metadata: { source: "water-ai-cloud", botId: String(ctx.bot.id || "") },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const createBody: any = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      const detail = JSON.stringify(createBody).slice(0, 280);
      throw new CmdError(
        `🥀 E2B create gagal (HTTP ${createRes.status}): ${detail}\n` +
          "Pastikan API key valid dan templateID benar (default: base)."
      );
    }

    const sandboxId: string =
      createBody.sandboxID || createBody.sandboxId || createBody.id;
    if (!sandboxId) throw new CmdError("🥀 E2B tidak mengembalikan sandboxID.");

    const envdToken: string =
      createBody.envdAccessToken || createBody.accessToken || e2bKey;
    const domain: string =
      createBody.domain || process.env.E2B_DOMAIN || "e2b.app";

    // envd host pattern: https://49983-<sandboxId>.<domain>
    const envdBase = `https://49983-${sandboxId}.${domain}`;

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "📦 Upload ZIP ke sandbox...");

    // Upload via envd filesystem API (multipart)
    const form = new FormData();
    form.append(
      "file",
      new Blob([quoted.buffer], { type: "application/zip" }),
      "project.zip"
    );
    const uploadRes = await fetch(
      `${envdBase}/files?path=${encodeURIComponent("/home/user/project.zip")}`,
      {
        method: "POST",
        headers: {
          "X-Access-Token": envdToken,
          "E2b-Sandbox-Id": sandboxId,
          "E2b-Sandbox-Port": "49983",
        },
        body: form,
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text().catch(() => "");
      // Fallback: raw body write
      const rawRes = await fetch(
        `${envdBase}/files?path=${encodeURIComponent("/home/user/project.zip")}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Access-Token": envdToken,
            "E2b-Sandbox-Id": sandboxId,
            "E2b-Sandbox-Port": "49983",
          },
          body: quoted.buffer,
          signal: AbortSignal.timeout(120_000),
        }
      );
      if (!rawRes.ok) {
        throw new CmdError(
          `🥀 Upload ZIP gagal (HTTP ${uploadRes.status}/${rawRes.status}): ${errTxt.slice(0, 120)}`
        );
      }
    }

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔧 Extract & start server...");

    // Run commands via envd process API (Connect-style / process)
    async function runCmd(cmd: string, timeout = 180): Promise<{ ok: boolean; out: string }> {
      try {
        // Preferred: /commands style used by some envd builds
        const res = await fetch(`${envdBase}/commands`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": envdToken,
            "E2b-Sandbox-Id": sandboxId,
            "E2b-Sandbox-Port": "49983",
          },
          body: JSON.stringify({
            command: "bash",
            args: ["-lc", cmd],
            timeout,
            cwd: "/home/user",
          }),
          signal: AbortSignal.timeout((timeout + 15) * 1000),
        });
        const text = await res.text().catch(() => "");
        if (res.ok) return { ok: true, out: text.slice(0, 500) };

        // Fallback: start process via /processes
        const res2 = await fetch(`${envdBase}/processes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": envdToken,
            "E2b-Sandbox-Id": sandboxId,
          },
          body: JSON.stringify({
            cmd: "bash",
            args: ["-lc", cmd],
            timeout,
          }),
          signal: AbortSignal.timeout((timeout + 15) * 1000),
        });
        const text2 = await res2.text().catch(() => "");
        return { ok: res2.ok, out: text2.slice(0, 500) };
      } catch (e: any) {
        return { ok: false, out: String(e?.message || e).slice(0, 200) };
      }
    }

    await runCmd(
      "mkdir -p /home/user/app && cd /home/user && (unzip -o project.zip -d app 2>/dev/null || tar -xf project.zip -C app 2>/dev/null || true) && " +
        "if [ -d app ] && [ $(find app -mindepth 1 -maxdepth 1 | wc -l) -eq 1 ]; then SUB=$(find app -mindepth 1 -maxdepth 1 -type d | head -1); if [ -n \"$SUB\" ]; then mv \"$SUB\"/* app/ 2>/dev/null; fi; fi && ls -la app | head -20",
      120
    );

    await runCmd(
      "cd /home/user/app && " +
        "if [ -f package.json ]; then npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5; " +
        "elif [ -f requirements.txt ]; then pip3 install -r requirements.txt -q 2>&1 | tail -5; " +
        "elif [ -f index.html ] || [ -f public/index.html ]; then echo STATIC; " +
        "else echo NO_MANIFEST; fi",
      240
    );

    // Start static/web server on 3000 in background
    await runCmd(
      "cd /home/user/app && " +
        "( " +
        "  if [ -f package.json ] && grep -q '\"start\"' package.json; then " +
        "    (PORT=3000 npm start > /tmp/serve.log 2>&1 &) ; " +
        "  elif [ -f package.json ] && grep -q '\"dev\"' package.json; then " +
        "    (PORT=3000 npx --yes next start -p 3000 > /tmp/serve.log 2>&1 || PORT=3000 npm run dev > /tmp/serve.log 2>&1 &) ; " +
        "  else " +
        "    (npx --yes serve -l 3000 . > /tmp/serve.log 2>&1 || python3 -m http.server 3000 > /tmp/serve.log 2>&1 &) ; " +
        "  fi " +
        ") ; sleep 3 ; (curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true) ; echo SERVE_STARTED",
      90
    );

    // Public URL: port-forward style used by E2B
    const publicUrl =
      createBody.domain && !String(createBody.domain).includes("e2b")
        ? `https://${createBody.domain}`
        : `https://3000-${sandboxId}.${domain}`;

    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Deploy selesai.");
    return {
      text: box("✅ SANDBOX DEPLOYED", [
        `🧪 Sandbox : ${sandboxId}`,
        `🔗 URL     : ${publicUrl}`,
        `⏱️ Aktif   : ±${Math.round(timeoutSec / 60)} menit`,
        `📦 Template: ${templateID}`,
        "",
        "Buka URL di browser. Sandbox otomatis mati setelah timeout.",
        "Jika halaman kosong, tunggu 10–20 detik (npm start masih warm-up).",
      ]),
    };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Deploy gagal.");
    if (e instanceof CmdError) throw e;
    throw new CmdError(`🥀 Sandbox deploy gagal: ${String(e?.message || e).slice(0, 220)}`);
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
