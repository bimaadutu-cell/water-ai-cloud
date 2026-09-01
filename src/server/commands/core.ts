import fs from "fs";
import os from "os";
import path from "path";
import { eq, and, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commands as commandsTable,
  premiumUsers,
  messageLimits,
} from "@/db/schema";
import { bots } from "@/db/schema";
import { CATEGORIES, CATEGORY_MAP } from "./registry";

/* --------------------------------- types -------------------------------- */
export interface NormalizedMsg {
  type: string;
  text: string;
  sender: string;
  remoteJid: string;
  isGroup: boolean;
  messageId: string;
}

export interface CmdCtx {
  bot: (typeof bots.$inferSelect);
  sock: any;
  cmd: {
    name: string;
    description: string;
    handler: string;
    permissions: string;
    premium: boolean;
    extra: any;
  };
  n: NormalizedMsg;
  raw: any;
  parts: string[];
  arg: string;
  startedAt: number;
  replyKey: any | null;
  getRepliedMedia: () => Promise<{ buffer: Buffer; mimetype: string; filename?: string } | null>;
}

export interface CmdMedia {
  kind: "image" | "video" | "audio" | "document" | "sticker";
  buffer: Buffer;
  filename?: string;
  mimetype?: string;
  caption?: string;
  ptt?: boolean;
  jpegThumbnail?: Buffer;
}

export interface CmdResult {
  text?: string;
  buttons?: { id: string; text: string }[];
  /** A single media item or a bounded batch for public carousels. */
  media?: CmdMedia | CmdMedia[];
}

export class CmdError extends Error {}

/* ------------------------------- constants ------------------------------ */
export const BOT_VERSION = "V3.5";

export const PROMO_TEXT = `
━━━━━━━━━━━━━━━━━━━━
✨ *bot WhatsApp instan onlinee 24 nonstop?*
coba aja *WATER AI CLOUD V3.5*

*Server 1:* https://water-ai-cloud-v2.up.railway.app
_(jarang update)_
*Server 2:* https://water-ai-cloud-newv.up.railway.app
_(jarang update)_
*Server 3:* https://water-ai-cloud-bimxz.up.railway.app
_(masih update)_ ✅

silakan di coba😊
Jika ada kendala atau mau nanya silahkan hubungi developer

Telegram: @b1mxzstore
WhatsApp: wa.me//+6283115955196

Thanks atas perhatian nya😊🙏
━━━━━━━━━━━━━━━━━━━━
`.trim();

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const PREMIUM_DAILY_FREE = 10;
const HARD_DAILY_LIMIT = 200;

const storageRoot = path.resolve(process.env.STORAGE_CONFIG || path.join(process.cwd(), "data"));
export const tmpDir = path.join(storageRoot, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

/** Remove stale temporary artifacts left by interrupted media jobs. */
export function cleanupOldTemp(maxAgeMs = 6 * 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxAgeMs;
  try {
    for (const entry of fs.readdirSync(tmpDir, { withFileTypes: true })) {
      const target = path.join(tmpDir, entry.name);
      const stat = fs.statSync(target);
      if (stat.mtimeMs < cutoff) fs.rmSync(target, { recursive: true, force: true });
    }
  } catch {
    /* cleanup is best effort and must never crash the bot */
  }
}
cleanupOldTemp();

export function ffmpegPath(): string | null {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured && fs.existsSync(configured)) return configured;
  for (const candidate of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const p = require("ffmpeg-static");
    return typeof p === "string" ? p : null;
  } catch {
    return null;
  }
}

/* ---------------------------- file utilities ---------------------------- */
export async function safeFetch(
  url: string,
  maxBytes = MAX_FILE_BYTES
): Promise<Buffer> {
  validateExternalUrl(url);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: "follow" });
  } catch {
    throw new CmdError("⏱️ Gagal mengunduh dari sumber (timeout). Coba lagi.");
  }
  if (!res.ok) throw new CmdError(`❌ Gagal mengakses service (HTTP ${res.status}).`);
  const ct = res.headers.get("content-type") || "";
  const lenHeader = Number(res.headers.get("content-length") || 0);
  if (lenHeader && lenHeader > maxBytes)
    throw new CmdError("📦 File melebihi batas yang didukung (50MB).");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes)
    throw new CmdError("📦 File melebihi batas yang didukung (50MB).");
  if (buf.length < 64) throw new CmdError("❌ Respons sumber kosong/tidak valid.");
  void ct;
  return buf;
}

export function validateExternalUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new CmdError("❌ URL tidak valid."); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new CmdError("❌ Hanya URL HTTP/HTTPS yang didukung.");
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1' || /^127\\./.test(host) || /^10\\./.test(host) || /^192\\.168\\./.test(host) || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(host) || host.startsWith('169.254.')) {
    throw new CmdError("❌ URL menuju jaringan internal tidak diizinkan.");
  }
  return url;
}

/**
 * Run fn with a temp file (safe name, auto-cleanup).
 */
export async function withTempFile<T>(
  buffer: Buffer,
  ext: string,
  fn: (filePath: string) => Promise<T>
): Promise<T> {
  const safe = `wac_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const filePath = path.join(tmpDir, `${safe}${ext}`);
  fs.writeFileSync(filePath, buffer);
  try {
    return await fn(filePath);
  } finally {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-() ]+/g, "_").slice(0, 80);
  return base || "media";
}

/* ------------------------------ progress UI ----------------------------- */
/** Send or edit a single progress message. Returns the message key to keep. */
export async function progress(
  sock: any,
  jid: string,
  prevKey: any | null,
  text: string
): Promise<any> {
  try {
    if (prevKey) {
      const res = await sock.sendMessage(jid, { text, edit: prevKey });
      return res?.key ?? prevKey;
    }
    const res = await sock.sendMessage(jid, { text });
    return res?.key ?? null;
  } catch {
    return null;
  }
}

/* ---------------------------- premium / limits -------------------------- */
export async function isPremium(botId: string, jid: string): Promise<boolean> {
  const rows = await db
    .select({ expiresAt: premiumUsers.expiresAt })
    .from(premiumUsers)
    .where(
      and(
        eq(premiumUsers.botId, botId),
        eq(premiumUsers.jid, jid),
        sql`(${premiumUsers.expiresAt} is null or ${premiumUsers.expiresAt} > now())`
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function consumeLimit(
  botId: string,
  jid: string,
  premium: boolean
): Promise<{ ok: boolean; used: number; reason?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ used: messageLimits.used })
    .from(messageLimits)
    .where(
      and(
        eq(messageLimits.botId, botId),
        eq(messageLimits.jid, jid),
        eq(messageLimits.date, today)
      )
    )
    .limit(1);
  const used = rows[0]?.used ?? 0;
  if (used >= HARD_DAILY_LIMIT)
    return { ok: false, used, reason: "📦 Limit harian maksimal tercapai. Coba lagi besok." };
  if (premium && used >= PREMIUM_DAILY_FREE && !(await isPremium(botId, jid)))
    return {
      ok: false,
      used,
      reason: `💎 Command ini memakai quota premium (${PREMIUM_DAILY_FREE}/hari untuk gratis). Ketik .mypremium untuk info.`,
    };
  await db
    .insert(messageLimits)
    .values({ botId, jid, date: today, used: used + 1 })
    .onConflictDoUpdate({
      target: [messageLimits.botId, messageLimits.jid, messageLimits.date],
      set: { used: sql`"used" + 1` },
    })
    .catch(() => {});
  return { ok: true, used: used + 1 };
}

export async function todayUsed(botId: string, jid: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ used: messageLimits.used })
    .from(messageLimits)
    .where(
      and(
        eq(messageLimits.botId, botId),
        eq(messageLimits.jid, jid),
        eq(messageLimits.date, today)
      )
    )
    .limit(1);
  return rows[0]?.used ?? 0;
}

/* ------------------------------ menu builder ---------------------------- */
export function getMenuStyle(bot: (typeof bots.$inferSelect)): number {
  const s = Number((bot.settings as any)?.menuStyle ?? 1);
  return s >= 1 && s <= 5 ? s : 1;
}

export function buildMenu(
  bot: (typeof bots.$inferSelect),
  username: string,
  enabledCommands: { name: string; category: string }[],
  ownerNumbers: string[],
  full = false
): string {
  const p = (bot.prefix || "!").trim();
  const style = getMenuStyle(bot);
  const statusMap: Record<string, string> = {
    online: "Online",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    offline: "Offline",
    error: "Error",
  };
  const byCat = new Map<string, string[]>();
  for (const cmd of enabledCommands) {
    if (!CATEGORY_MAP.has(cmd.category)) continue;
    const list = byCat.get(cmd.category) ?? [];
    list.push(`${p}${cmd.name}`);
    byCat.set(cmd.category, list);
  }

  const L: string[] = [];
  if (style === 1) {
    L.push("*💧 WATER AI CLOUD*");
    L.push("");
    L.push(`👋 Halo, @${username}`);
    L.push("");
    L.push("_Advanced WhatsApp AI Assistant_");
    L.push("_Fast • Stable • Powerful_");
    L.push("");
    L.push("╭─「 *BOT INFO* 」");
    L.push("│");
    L.push(`│ ◦ *Prefix* : ${p}`);
    L.push(`│ ◦ *Version* : ${BOT_VERSION}`);
    L.push(`│ ◦ *Status* : ${statusMap[bot.status] ?? bot.status}`);
    L.push(`│ ◦ *Owner* : ${ownerNumbers[0] ?? bot.ownerNumber ?? "-"}`);
    L.push("│");
    L.push("╰────────────────────");
  } else if (style === 2) {
    L.push("✦━━━━━━━━━━━━━━━━━━━✦");
    L.push("   *💧 W A T E R  A I  C L O U D*");
    L.push("✦━━━━━━━━━━━━━━━━━━━✦");
    L.push(`✨ Halo *${username}*`);
    L.push(`⚡ Prefix: *${p}* | Ver: *${BOT_VERSION}*`);
    L.push(`📡 Status: *${statusMap[bot.status] ?? bot.status}*`);
  } else if (style === 3) {
    L.push("╔══════════════════════╗");
    L.push("║  💧 *WATER AI CLOUD*  ║");
    L.push("╚══════════════════════╝");
    L.push(`Selamat datang, *${username}*`);
    L.push(`▸ Prefix  : ${p}`);
    L.push(`▸ Version : ${BOT_VERSION}`);
    L.push(`▸ Status  : ${statusMap[bot.status] ?? bot.status}`);
    L.push(`▸ Owner   : ${ownerNumbers[0] ?? bot.ownerNumber ?? "-"}`);
    L.push("────────────────────────");
  } else if (style === 4) {
    L.push("▣■■■■■■■■■■■■■■■■■■▣");
    L.push("  ⚡ *WATER AI CLOUD* ⚡");
    L.push("▣■■■■■■■■■■■■■■■■■■▣");
    L.push(`👤 *${username}* | 🔖 *${BOT_VERSION}*`);
    L.push(`🔗 ${p}  •  ${statusMap[bot.status] ?? bot.status}`);
  } else {
    L.push("✦･ﾟ✧*･ﾟ✧ WATER AI CLOUD ✧･ﾟ*✧･ﾟ✦");
    L.push(`🌟 *Halo ${username}* 🌟`);
    L.push(`💎 Version *${BOT_VERSION}*  •  Prefix *${p}*`);
    L.push(`🚀 Status: *${statusMap[bot.status] ?? bot.status}*`);
    L.push("･ﾟ✧･ﾟ✧･ﾟ✧･ﾟ✧･ﾟ✧･ﾟ✧･ﾟ✧･ﾟ✧");
  }

  if (full) {
    for (const cat of CATEGORIES) {
      const cmds = byCat.get(cat.id);
      if (!cmds || !cmds.length) continue;
      L.push("");
      if (style === 1) {
        L.push(`╭─「 *${cat.emoji} ${cat.label}* 」`);
        L.push("│");
        for (const cmd of cmds) L.push(`│ ◦ *${cmd}*`);
        L.push("│");
        L.push("╰────────────────────");
      } else if (style === 2) {
        L.push(`✧ *${cat.emoji} ${cat.label}*`);
        for (const cmd of cmds) L.push(`  › *${cmd}*`);
      } else if (style === 3) {
        L.push(`『 ${cat.emoji} ${cat.label} 』`);
        for (const cmd of cmds) L.push(`  • ${cmd}`);
      } else if (style === 4) {
        L.push(`◆ ${cat.emoji} *${cat.label}*`);
        for (const cmd of cmds) L.push(`  ◇ ${cmd}`);
      } else {
        L.push(`✨ *${cat.emoji} ${cat.label}* ✨`);
        for (const cmd of cmds) L.push(`  ⭐ *${cmd}*`);
      }
    }
  } else {
    L.push("");
    if (style === 1) {
      L.push("╭─「 *📚 KATEGORI COMMAND* 」");
      L.push("│");
      for (const cat of CATEGORIES) {
        const cmds = byCat.get(cat.id);
        if (cmds?.length) L.push(`│ ◦ *${cat.emoji} ${cat.label}* — ${cmds.length} command`);
      }
      L.push("│");
      L.push(`│ ◦ Ketik *${p}allmenu* untuk melihat semua command`);
      L.push("╰────────────────────");
    } else {
      for (const cat of CATEGORIES) {
        const cmds = byCat.get(cat.id);
        if (cmds?.length) L.push(`${cat.emoji} *${cat.label}* — ${cmds.length}`);
      }
      L.push(`\nKetik *${p}allmenu* untuk semua command`);
    }
  }
  L.push("");
  L.push(PROMO_TEXT);
  return L.join("\n");
}





/* -------------------------------- helpers ------------------------------- */
export function box(title: string, lines: (string | null | undefined | false)[]): string {
  const L: string[] = [`╭─「 ${title} 」`, "│"];
  for (const l of lines) if (l) L.push(`│ ${l}`);
  L.push("╰────────────────────");
  return L.join("\n");
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export { isNull, gte };
