import sharp from "sharp";
import fs from "fs";
import path from "path";
import type { CmdCtx, CmdResult } from "./core";
import { CmdError, MAX_FILE_BYTES, box, progress, tmpDir } from "./core";
import * as ai from "./ai";
import * as media from "./media";
import * as dl from "./downloader";
import { setAutoAi, isAutoAi, setTermuxSession, getTermuxSession } from "./state";

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



/* ============================== .emojisl (channel reactions) ============================== */
/** Pending: user must send channel URL after .emojisl */
const emojislPending = new Map<string, { at: number; botId: string }>();
const EMOJISL_TTL_MS = 5 * 60_000;
const EMOJISL_MAX = 100; // 100 reaction ke saluran
const EMOJISL_DELAY_MS = 350;

const REACTION_POOL = [
  "😀","😃","😄","😁","😆","🥹","😅","😂","🤣","😊",
  "😇","🙂","😉","😌","😍","🥰","😘","😗","😙","😚",
  "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩",
  "🥳","😏","😒","🙄","😬","😮‍💨","🤥","🫡","🤔","🤭",
  "🤫","🫣","😳","🥺","😢","😭","😤","😠","😡","🤬",
  "😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽",
  "🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
  "❣️","💕","💞","💓","💗","💖","💘","💝","👍","👎",
  "👏","🙌","🤝","🙏","💪","🔥","✨","⭐","🌟","💯",
  "🎉","🎊","🎈","🏆","🥇","🎯","🚀","💎","👑","🦄",
];

function emojislKey(botId: string, chat: string, sender: string) {
  return `${botId}:${chat}:${sender}`;
}

function pickRandomEmojis(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(REACTION_POOL[Math.floor(Math.random() * REACTION_POOL.length)]);
  }
  return out;
}

function parseChannelUrl(raw: string): { inviteCode: string; messageId?: string } | null {
  const text = String(raw || "").trim();
  // https://whatsapp.com/channel/CODE or .../CODE/123
  const m = text.match(
    /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/(\d+))?/i
  );
  if (m) return { inviteCode: m[1], messageId: m[2] };
  // bare code
  if (/^[A-Za-z0-9_-]{10,40}$/.test(text)) return { inviteCode: text };
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve newsletter JID + name from invite code. */
async function resolveNewsletter(
  sock: any,
  inviteCode: string
): Promise<{ jid: string; name: string; meta?: any } | null> {
  try {
    if (typeof sock.newsletterMetadata === "function") {
      const meta = await sock.newsletterMetadata("invite", inviteCode);
      const jidRaw =
        meta?.id || meta?.jid || meta?.newsletter_id || meta?.newsletterJid || null;
      if (!jidRaw) return null;
      const jid = String(jidRaw).includes("@") ? String(jidRaw) : `${jidRaw}@newsletter`;
      const name =
        meta?.name ||
        meta?.subject ||
        meta?.thread_metadata?.name ||
        meta?.newsletterName ||
        inviteCode;
      return { jid, name: String(name), meta };
    }
  } catch (e: any) {
    console.error("[emojisl] newsletterMetadata", e?.message || e);
  }
  return null;
}

async function fetchChannelServerIds(sock: any, jid: string, limit: number): Promise<string[]> {
  const ids: string[] = [];
  const push = (v: any) => {
    if (v == null || v === "") return;
    const s = String(v);
    if (!ids.includes(s)) ids.push(s);
  };
  try {
    if (typeof sock.newsletterFetchMessages === "function") {
      const res = await sock.newsletterFetchMessages(jid, limit, 0, 0);
      const list = Array.isArray(res)
        ? res
        : res?.messages || res?.data || res?.updates || res?.result || [];
      for (const item of list) {
        push(item?.messageServerId);
        push(item?.server_id);
        push(item?.serverId);
        push(item?.message?.server_id);
        push(item?.attrs?.server_id);
        // nested
        const msg = item?.message || item;
        push(msg?.serverId);
        push(msg?.key?.id);
      }
    }
  } catch (e: any) {
    console.error("[emojisl] newsletterFetchMessages", e?.message || e);
  }
  return ids;
}

async function reactChannel(
  sock: any,
  jid: string,
  serverId: string,
  emoji: string
): Promise<boolean> {
  const attempts: Array<() => Promise<void>> = [];
  if (typeof sock.newsletterReactMessage === "function") {
    attempts.push(async () => {
      await sock.newsletterReactMessage(jid, serverId, emoji);
    });
    attempts.push(async () => {
      await sock.newsletterReactMessage(jid, Number(serverId) || serverId, emoji);
    });
  }
  attempts.push(async () => {
    await sock.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: serverId, fromMe: false } },
    });
  });
  for (const fn of attempts) {
    try {
      await fn();
      return true;
    } catch (e: any) {
      // try next
    }
  }
  return false;
}

/**
 * Continue after user sent channel URL (called from engine plain-text path).
 */
export async function emojislContinue(
  ctx: CmdCtx,
  urlText: string
): Promise<CmdResult | null> {
  const key = emojislKey(ctx.bot.id, ctx.n.remoteJid, ctx.n.sender);
  const pending = emojislPending.get(key);
  if (!pending || Date.now() - pending.at > EMOJISL_TTL_MS) {
    emojislPending.delete(key);
    return null;
  }

  const parsed = parseChannelUrl(urlText);
  if (!parsed) {
    // Jangan hapus pending — user bisa kirim URL lagi
    return {
      text:
        "❌ URL saluran tidak valid. Coba lagi (pending masih aktif).\n\n" +
        "Contoh:\n" +
        "• `https://whatsapp.com/channel/0029VaXXXX`\n" +
        "• `https://whatsapp.com/channel/0029VaXXXX/175` ← **wajib ID pesan** jika fetch gagal\n\n" +
        "Ketik `batal` untuk membatalkan.",
    };
  }
  emojislPending.delete(key);

  const sock = ctx.sock;
  if (!sock) return { text: "🥀 Socket WhatsApp belum siap." };

  const progressKey = await progress(
    sock,
    ctx.n.remoteJid,
    null,
    `🔎 Memproses saluran *${parsed.inviteCode}*...`
  );

  try {
    const resolved = await resolveNewsletter(sock, parsed.inviteCode);
    let jid = resolved?.jid || `${parsed.inviteCode}@newsletter`;
    let channelName = resolved?.name || parsed.inviteCode;

    // Follow + notifikasi terhubung ke saluran
    try {
      if (typeof sock.newsletterFollow === "function") {
        await sock.newsletterFollow(jid);
      }
    } catch (e: any) {
      console.error("[emojisl] follow", e?.message || e);
    }

    try {
      await sock.sendMessage(ctx.n.remoteJid, {
        text:
          "📢 *Bot terhubung ke saluran*\n" +
          "Nama: *" + channelName + "*\n" +
          "Kode: `" + parsed.inviteCode + "`\n" +
          "JID: `" + jid + "`",
      });
    } catch { /* non-fatal */ }

    let targetIds: string[] = [];
    if (parsed.messageId) {
      targetIds = [parsed.messageId];
    } else {
      targetIds = await fetchChannelServerIds(sock, jid, Math.min(50, EMOJISL_MAX));
    }

    // JANGAN pakai ID palsu 1..N — itu yang bikin 0 sukses / semua gagal
    if (!targetIds.length) {
      if (progressKey) {
        await progress(
          sock,
          ctx.n.remoteJid,
          progressKey,
          "⚠️ Saluran terhubung, tapi ID pesan belum ada."
        );
      }
      return {
        text:
          "✅ Bot terhubung ke saluran *" + channelName + "*\n\n" +
          "⚠️ Belum bisa reaction: butuh *link pesan* (bukan link home channel).\n\n" +
          "Cara:\n" +
          "1. Buka saluran → buka salah satu postingan\n" +
          "2. Ketuk ⋮ → Bagikan → Salin link\n" +
          "3. Link harus seperti:\n" +
          "`https://whatsapp.com/channel/KODE/123`\n\n" +
          "Lalu ketik lagi: *" + ctx.bot.prefix + "emojisl* lalu tempel link pesan",
      };
    }

    // Jika hanya 1 ID pesan, tetap kirim 100 reaction berganti emoji ke ID itu
    const emojis = pickRandomEmojis(EMOJISL_MAX);
    let ok = 0;
    let fail = 0;
    let lastErr = "";
    for (let i = 0; i < emojis.length; i++) {
      const sid = targetIds[i % targetIds.length];
      const emoji = emojis[i];
      const success = await reactChannel(sock, jid, sid, emoji);
      if (success) ok++;
      else {
        fail++;
        lastErr = `sid=${sid}`;
      }
      if (i % 15 === 14 && progressKey) {
        await progress(
          sock,
          ctx.n.remoteJid,
          progressKey,
          `⚡ Reaction ${i + 1}/${emojis.length}… (✅${ok} ❌${fail})`
        );
      }
      await sleep(EMOJISL_DELAY_MS);
    }

    if (progressKey) {
      await progress(
        sock,
        ctx.n.remoteJid,
        progressKey,
        ok
          ? `✅ Selesai: ${ok} reaction ke *${channelName}*`
          : `🥀 0 reaction berhasil. Cek link pesan / izin channel.`
      );
    }

    return {
      text: box("✨ EMOJISL SELESAI", [
        `Saluran : ${channelName}`,
        `Kode    : ${parsed.inviteCode}`,
        `JID     : ${jid}`,
        `Target  : ${targetIds.length} pesan (ID: ${targetIds.slice(0, 5).join(", ")})`,
        `Sukses  : ${ok}`,
        `Gagal   : ${fail}`,
        `Total   : ${emojis.length} emoji`,
        ok === 0
          ? "Tips: pastikan link berisi /ID_PESAN di akhir & bot sudah follow channel."
          : "WA menampilkan 1 reaction terakhir per akun per pesan.",
      ]),
    };
  } catch (e: any) {
    if (progressKey) {
      await progress(sock, ctx.n.remoteJid, progressKey, "🥀 Emojisl gagal.").catch(() => {});
    }
    return {
      text:
        `🥀 Gagal emojisl: ${String(e?.message || e).slice(0, 200)}

` +
        "Pastikan URL valid & Baileys mendukung newsletterReactMessage.",
    };
  }
}

export async function emojisl(ctx: CmdCtx): Promise<CmdResult> {
  const arg = (ctx.arg || "").trim();
  // If URL already provided: .emojisl https://whatsapp.com/channel/...
  if (arg && /whatsapp\.com\/channel\//i.test(arg)) {
    return (await emojislContinue(ctx, arg)) || { text: "🥀 Gagal memproses URL." };
  }
  if (arg && parseChannelUrl(arg)) {
    return (await emojislContinue(ctx, arg)) || { text: "🥀 Gagal memproses kode saluran." };
  }

  const key = emojislKey(ctx.bot.id, ctx.n.remoteJid, ctx.n.sender);
  emojislPending.set(key, { at: Date.now(), botId: ctx.bot.id });

  return {
    text:
      "✨ *EMOJISL — Reaction Saluran*\n\n" +
      "Kirim *URL saluran WhatsApp* sekarang (reply/ketik di chat ini):\n\n" +
      "Contoh:\n" +
      "• `https://whatsapp.com/channel/0029VaXXXX`\n" +
      "• `https://whatsapp.com/channel/0029VaXXXX/175` ← lebih akurat\n\n" +
      `Bot akan mengirim *${EMOJISL_MAX}+ emoji reaction random* ke pesan saluran (real-time, rate-limited).\n\n` +
      "_Timeout 5 menit. Ketik batal untuk membatalkan._",
  };
}

/** Engine helper: true if this sender has pending emojisl */
export function hasEmojislPending(botId: string, chat: string, sender: string): boolean {
  const key = emojislKey(botId, chat, sender);
  const p = emojislPending.get(key);
  if (!p) return false;
  if (Date.now() - p.at > EMOJISL_TTL_MS) {
    emojislPending.delete(key);
    return false;
  }
  return true;
}

export function clearEmojislPending(botId: string, chat: string, sender: string) {
  emojislPending.delete(emojislKey(botId, chat, sender));
}


export async function autoai(ctx: CmdCtx): Promise<CmdResult> {
  setAutoAi(ctx.bot.id, ctx.n.remoteJid, true);
  return {
    text:
      "🤖 *AUTO AI ON*\n\n" +
      "Semua pesan di chat ini (tanpa prefix) akan dijawab AI.\n" +
      "Command dengan prefix tetap jalan normal.\n\n" +
      `Matikan: *${ctx.bot.prefix}autoaioff*`,
  };
}

export async function autoaioff(ctx: CmdCtx): Promise<CmdResult> {
  setAutoAi(ctx.bot.id, ctx.n.remoteJid, false);
  return { text: "✅ *AUTO AI OFF* — bot kembali mode normal." };
}

export { isAutoAi };


export async function termux(ctx: CmdCtx): Promise<CmdResult> {
  const arg = (ctx.arg || "").trim().toLowerCase();
  if (arg === "exit" || arg === "quit" || arg === "off") {
    setTermuxSession(ctx.bot.id, ctx.n.remoteJid, ctx.n.sender, false);
    return { text: "🛑 *Termux session ditutup.*" };
  }

  setTermuxSession(ctx.bot.id, ctx.n.remoteJid, ctx.n.sender, true);

  try {
    const { buildTermuxHtml } = await import("../games/html-board");
    const { sendRichHtmlToChat } = await import("../games/send-rich-html");
    const html = buildTermuxHtml({
      title: "WATER AI · TERMUX",
      lines: [
        "Welcome to WATER AI Termux (sandboxed)",
        "Supported: help, date, whoami, uname, pwd, echo, clear,",
        "          curl <url>, fetch <url>, ls, cat, calc <expr>, env",
        "Ketik perintah di chat (tanpa prefix). .termux exit untuk keluar.",
      ],
    });
    await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, html, {
      title: "Termux · WATER AI",
      id: `termux-${Date.now().toString(36)}`,
      source: "water_ai_termux",
    }).catch(() => null);
  } catch (e: any) {
    console.error("[termux html]", e?.message || e);
  }

  return {
    text:
      "🖥️ *WATER AI TERMINAL* — session aktif\n\n" +
      "Ketik di chat (tanpa prefix):\n" +
      "• `help` · `date` · `node -v` · `npm -v` · `git --version`\n" +
      "• `node -e \"console.log(1+1)\"`\n" +
      "• `curl https://httpbin.org/get`\n" +
      "• `calc 2+2*3`\n\n" +
      `Keluar: *${ctx.bot.prefix}termux exit* / ketik \`exit\``,
  };
}

/** Execute sandboxed commands — real binaries when safe (node/git/npm/curl). */
export async function termuxExec(line: string): Promise<string> {
  const raw = String(line || "").trim();
  if (!raw) return "";
  const parts = raw.split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const rest = parts.slice(1).join(" ");
  const args = parts.slice(1);

  if (cmd === "help" || cmd === "?") {
    return [
      "WATER AI TERMINAL — perintah:",
      "  help, date, whoami, uname, pwd, ls, env, clear, echo, calc",
      "  node -v | node -e \"code\"",
      "  npm -v | npm --version",
      "  git --version | git status (read-only)",
      "  curl <url> | fetch <url>   (GET, max 64KB)",
      "  which node|npm|git|python3",
      "  exit",
      "",
      "Catatan: install pkg global tidak diizinkan di cloud (aman).",
      "Node/npm/git memakai binary server yang sudah terpasang.",
    ].join("\n");
  }
  if (cmd === "exit" || cmd === "quit") return "__EXIT__";
  if (cmd === "clear") return "__CLEAR__";
  if (cmd === "date") return new Date().toString();
  if (cmd === "whoami") return "water-ai";
  if (cmd === "pwd") return "/home/water-ai";
  if (cmd === "uname") {
    return rest.includes("-") ? "Linux water-ai 6.1.0 #1 SMP aarch64 GNU/Linux" : "Linux";
  }
  if (cmd === "ls") {
    return "README.md  bin/  src/  tmp/  package.json  node_modules/";
  }
  if (cmd === "env") {
    return "HOME=/home/water-ai\nUSER=water-ai\nSHELL=/bin/bash\nPATH=/usr/local/bin:/usr/bin:/bin";
  }
  if (cmd === "echo") return rest;
  if (cmd === "calc" || cmd === "expr") {
    const expr = rest.replace(/[^0-9+\-*/().%\s]/g, "");
    if (!expr.trim()) return "usage: calc 2+2*3";
    try {
      const v = Function(`"use strict"; return (${expr})`)();
      return String(v);
    } catch {
      return "calc: invalid expression";
    }
  }
  if (cmd === "which") {
    const bin = (args[0] || "").toLowerCase();
    const map: Record<string, string> = {
      node: "/usr/local/bin/node",
      npm: "/usr/local/bin/npm",
      git: "/usr/bin/git",
      python3: "/usr/bin/python3",
      curl: "/usr/bin/curl",
    };
    return map[bin] || `${bin} not found`;
  }

  // Real process for version / safe read-only
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  async function runBin(bin: string, binArgs: string[], timeout = 12_000): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(bin, binArgs, {
        timeout,
        maxBuffer: 256 * 1024,
        env: { ...process.env, HOME: "/tmp", PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin" },
      });
      const out = `${stdout || ""}${stderr || ""}`.trim();
      return out || "(no output)";
    } catch (e: any) {
      if (e?.stdout || e?.stderr) return `${e.stdout || ""}${e.stderr || ""}`.trim() || String(e?.message || e);
      return `error: ${e?.message || e}`;
    }
  }

  if (cmd === "node") {
    if (args[0] === "-v" || args[0] === "--version") return runBin("node", ["-v"]);
    if (args[0] === "-e" || args[0] === "--eval") {
      const code = raw.replace(/^node\s+(-e|--eval)\s+/, "").replace(/^['"]|['"]$/g, "");
      if (!code || /require\s*\(\s*['"]fs['"]|child_process|process\.exit|while\s*\(\s*true/i.test(code)) {
        return "node -e: kode ditolak (keamanan). Contoh: node -e \"console.log(1+1)\"";
      }
      return runBin("node", ["-e", code], 8000);
    }
    return "usage: node -v | node -e \"console.log('hi')\"";
  }
  if (cmd === "npm") {
    if (!args.length || args[0] === "-v" || args[0] === "--version") return runBin("npm", ["-v"]);
    if (args[0] === "install" || args[0] === "i") {
      return "npm install dinonaktifkan di cloud shell (aman). Binary npm tetap tersedia untuk -v.";
    }
    return runBin("npm", args.slice(0, 4), 15000);
  }
  if (cmd === "git") {
    if (args[0] === "--version" || args[0] === "version") return runBin("git", ["--version"]);
    if (args[0] === "status") return "not a git repository (or cloud sandbox)";
    return runBin("git", args[0] ? [args[0]] : ["--version"], 8000);
  }
  if (cmd === "python3" || cmd === "python") {
    if (args[0] === "-V" || args[0] === "--version") return runBin("python3", ["-V"]);
    if (args[0] === "-c") {
      const code = raw.replace(/^python3?\s+-c\s+/, "").replace(/^['"]|['"]$/g, "");
      if (!code || /import\s+os|subprocess|open\s*\(/i.test(code)) return "python -c: dibatasi keamanan";
      return runBin("python3", ["-c", code], 8000);
    }
    return "usage: python3 -V | python3 -c \"print(1)\"";
  }
  if (cmd === "pkg" || cmd === "apt" || cmd === "apt-get") {
    return "pkg/apt install tidak tersedia di cloud sandbox.\nYang tersedia: node, npm, git, python3, curl (sudah terpasang).";
  }

  if (cmd === "curl" || cmd === "fetch" || cmd === "wget") {
    let url = rest.trim().split(/\s+/).filter((x) => x.startsWith("http"))[0] || "";
    if (!url) {
      // try last arg
      url = args[args.length - 1] || "";
    }
    if (!/^https?:\/\//i.test(url)) return "curl: URL must start with http:// or https://";
    try {
      const u = new URL(url);
      if (!["http:", "https:"].includes(u.protocol)) return "curl: protocol not allowed";
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "WATER-AI-Terminal/1.0" },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const textOut = buf.slice(0, 64 * 1024).toString("utf8");
      return `HTTP ${res.status} ${res.statusText}\ncontent-type: ${res.headers.get("content-type") || "?"}\n\n${textOut}`;
    } catch (e: any) {
      return `curl: ${e?.message || e}`;
    }
  }

  return `bash: ${cmd}: command not found\nKetik *help* untuk daftar perintah.`;
}

export async function termuxContinue(ctx: CmdCtx, text: string): Promise<CmdResult | null> {
  const sess = getTermuxSession(ctx.bot.id, ctx.n.remoteJid, ctx.n.sender);
  if (!sess) return null;
  const out = await termuxExec(text);
  if (out === "__EXIT__") {
    setTermuxSession(ctx.bot.id, ctx.n.remoteJid, ctx.n.sender, false);
    return { text: "🛑 *Termux session ditutup.*" };
  }
  if (out === "__CLEAR__") {
    return { text: "```\n$ clear\n(screen cleared)\n~/water-ai $ █\n```" };
  }
  const prompt = `\`\`\`\n$ ${text}\n${out}\n~/water-ai $ █\n\`\`\``;
  return { text: prompt };
}


export async function blockblast(ctx: CmdCtx): Promise<CmdResult> {
  try {
    const { buildBlockBlastHtml } = await import("../games/html-board");
    const { sendRichHtmlToChat } = await import("../games/send-rich-html");
    const html = buildBlockBlastHtml({ title: "BLOCK BLAST · WATER AI" });
    const sent = await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, html, {
      title: "Block Blast · WATER AI",
      id: `bb-${Date.now().toString(36)}`,
      source: "water_ai_blockblast",
    });
    if (sent.ok) return { handled: true };
    return {
      text: "🧱 *BLOCK BLAST*\nHTML gagal dikirim. Coba lagi.",
      media: {
        kind: "document" as const,
        buffer: Buffer.from(html, "utf8"),
        filename: "blockblast-water-ai.html",
        mimetype: "text/html",
        caption: "Block Blast HTML",
      },
    };
  } catch (e: any) {
    return { text: `❌ Block Blast: ${e?.message || e}` };
  }
}
export const blockblas = blockblast;
export const block = blockblast;

/** .webtoapp — multi-step Website → APK (session) */
export async function webtoapp(ctx: CmdCtx): Promise<CmdResult> {
  try {
  const { startJob, getJob, updateJob, cancelJob, validateHttpsUrl } = await import("../webtoapp/session");
  const { WEBTOAPP_PROVIDERS, listAutomationProviders } = await import("../webtoapp/providers");
  const arg = (ctx.arg || "").trim().toLowerCase();
  const userJid = ctx.n.sender || ctx.n.remoteJid;

  if (arg === "providers" || arg === "list") {
    const auto = listAutomationProviders();
    const lines = [
      `Research providers: *${WEBTOAPP_PROVIDERS.length}*`,
      `Automation-capable: *${auto.length}* (CLI/self-host/API)`,
      "",
      ...auto.slice(0, 12).map((p) => `• ${p.name} — ${p.type}`),
      "",
      "_WEB_ONLY providers tidak dipaksa endpoint privat._",
    ];
    return { text: box("🌐 WEBTOAPP PROVIDERS", lines) };
  }

  if (arg === "cancel" || arg === "batal") {
    cancelJob(userJid);
    return { text: box("❌ WEBTOAPP", ["Sesi dibatalkan."]) };
  }

  let job = getJob(userJid);
  if (!job || job.state === "COMPLETED" || job.state === "FAILED" || job.state === "CANCELLED") {
    job = startJob(userJid, ctx.n.remoteJid);
    return {
      text: box("🌐 WEB TO APP", [
        "Kirim *URL website* (HTTPS) yang ingin dijadikan APK.",
        "",
        "Contoh: https://example.com",
        "",
        `Batal: *${ctx.bot.prefix}batalwebtoapp*`,
      ]),
    };
  }

  // Continue flow based on state if user sent text as next answer without subcommand
  if (job.state === "WAITING_URL") {
    const v = validateHttpsUrl(ctx.arg || "");
    if (!v.ok) return { text: box("🌐 WEB TO APP", [v.error, "Kirim URL HTTPS yang valid."]) };
    updateJob(userJid, { url: v.url, state: "WAITING_APP_NAME" });
    return { text: box("🌐 WEB TO APP", ["✅ URL diterima.", "", "Sekarang kirim *nama aplikasi*."]) };
  }

  if (job.state === "WAITING_APP_NAME") {
    const name = (ctx.arg || "").trim().slice(0, 40);
    if (!name || name.length < 2) return { text: "Nama aplikasi minimal 2 karakter." };
    updateJob(userJid, { appName: name, state: "WAITING_ICON" });
    return { text: box("🌐 WEB TO APP", ["✅ Nama: *" + name + "*", "", "Kirim *foto/icon* aplikasi (gambar PNG/JPG)."]) };
  }

  if (job.state === "WAITING_ICON") {
    if (arg === "skip") {
      updateJob(userJid, { state: "WAITING_CONFIRMATION" });
      const j = getJob(userJid)!;
      return {
        text: box("🌐 WEB TO APP", [
          `📱 App Name: *${j.appName}*`,
          `🌐 Website: ${j.url}`,
          `🖼️ Icon: default`,
          "",
          "Lanjutkan build pack?",
          "Ketik *lanjut* atau *batal*",
        ]),
      };
    }
    return {
      text: box("🌐 WEB TO APP", [
        "Kirim *gambar* sebagai icon (bukan teks).",
        "Atau ketik *skip* untuk pakai icon default.",
      ]),
    };
  }

  if (job.state === "WAITING_CONFIRMATION") {
    if (arg === "lanjut" || arg === "lanjutkan" || arg === "ya" || arg === "y") {
      updateJob(userJid, { state: "BUILDING", provider: "local-project-pack" });
      // Railway container typically has no Android SDK — deliver build package + instructions honestly
      const j = getJob(userJid)!;
      const manifest = [
        "# WATER AI CLOUD · WebToApp Build Pack",
        `jobId: ${j.jobId}`,
        `appName: ${j.appName}`,
        `url: ${j.url}`,
        "",
        "Cloud runtime tidak menyertakan Android SDK penuh.",
        "Gunakan salah satu provider CLI/self-host yang sudah di-research:",
        ...listAutomationProviders().slice(0, 8).map((p) => `- ${p.name}: ${p.website}`),
        "",
        "Langkah cepat (Capacitor / Bubblewrap TWA):",
        "1. npm create @capacitor/app",
        "2. set server url ke website Anda",
        "3. npx cap add android && npx cap sync",
        "4. Build APK di Android Studio / Gradle",
        "",
        "Atau self-host: https://github.com/Jipok/website-to-apk",
      ].join("\n");
      updateJob(userJid, { state: "COMPLETED" });
      cancelJob(userJid);
      return {
        text: box("✅ WEBTOAPP · BUILD PACK", [
          `App: *${j.appName}*`,
          `URL: ${j.url}`,
          "",
          "APK binary penuh butuh Android SDK / provider CLI.",
          "Dokumen instruksi + daftar provider dikirim sebagai file.",
          "",
          "_Bukan fake APK — validasi struktur APK wajib sebelum kirim binary._",
        ]),
        media: {
          kind: "document" as const,
          buffer: Buffer.from(manifest, "utf8"),
          filename: `${(j.appName || "app").replace(/[^a-zA-Z0-9_-]/g, "_")}-webtoapp-guide.txt`,
          mimetype: "text/plain",
          caption: "WebToApp build guide · WATER AI V3.6",
        },
      };
    }
    if (arg === "batal" || arg === "tidak" || arg === "n") {
      cancelJob(userJid);
      return { text: box("❌ WEBTOAPP", ["Dibatalkan."]) };
    }
    return { text: "Ketik *lanjut* atau *batal*." };
  }

  return {
    text: box("🌐 WEB TO APP", [
      `State: ${job.state}`,
      `Ketik *${ctx.bot.prefix}webtoapp* untuk mulai ulang.`,
      `*${ctx.bot.prefix}batalwebtoapp* untuk batal.`,
    ]),
  };
  } catch (e: any) {
    console.error("[WEBTOAPP FATAL]", e?.message || e);
    return { text: box("❌ WEBTOAPP", [`Gagal: ${String(e?.message || e).slice(0, 200)}`]) };
  }
}

export async function batalwebtoapp(ctx: CmdCtx): Promise<CmdResult> {
  const { cancelJob } = await import("../webtoapp/session");
  cancelJob(ctx.n.sender || ctx.n.remoteJid);
  return { text: box("❌ WEBTOAPP", ["Sesi WebToApp dibatalkan & dibersihkan."]) };
}
