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
  getRepliedMedia: () => Promise<{ buffer: Buffer; mimetype: string } | null>;
}

export interface CmdResult {
  text?: string;
  buttons?: { id: string; text: string }[];
  media?: {
    kind: "image" | "video" | "audio" | "document" | "sticker";
    buffer: Buffer;
    filename?: string;
    mimetype?: string;
    caption?: string;
    ptt?: boolean;
  };
}

export class CmdError extends Error {}

/* ------------------------------- constants ------------------------------ */
export const BOT_VERSION = "V3.5";
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const PREMIUM_DAILY_FREE = 10;
const HARD_DAILY_LIMIT = 200;

const storageRoot = path.resolve(process.env.STORAGE_CONFIG || path.join(process.cwd(), "data"));
export const tmpDir = path.join(storageRoot, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

export function ffmpegPath(): string | null {
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

/** Run fn with a temp file (safe name, auto-cleanup). */
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
export function buildMenu(
  bot: (typeof bots.$inferSelect),
  username: string,
  enabledCommands: { name: string; category: string }[],
  ownerNumbers: string[],
  full = false
): string {
  const p = (bot.prefix || "!").trim();
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
  if (full) {
    for (const cat of CATEGORIES) {
      const cmds = byCat.get(cat.id);
      if (!cmds || !cmds.length) continue;
      L.push("");
      L.push(`╭─「 *${cat.emoji} ${cat.label}* 」`);
      L.push("│");
      for (const cmd of cmds) L.push(`│ ◦ *${cmd}*`);
      L.push("│");
      L.push("╰────────────────────");
    }
  } else {
    L.push("");
    L.push("╭─「 *📚 KATEGORI COMMAND* 」");
    L.push("│");
    for (const cat of CATEGORIES) {
      const cmds = byCat.get(cat.id);
      if (cmds?.length) L.push(`│ ◦ *${cat.emoji} ${cat.label}* — ${cmds.length} command`);
    }
    L.push("│");
    L.push(`│ ◦ Ketik *${p}allmenu* untuk melihat semua command`);
    L.push("╰────────────────────");
  }
  L.push("");
  L.push("━━━━━━━━━━━━━━━━━━━━");
  L.push("*💧 WATER AI CLOUD*");
  L.push("_Powerful • Fast • Modern_");
  L.push("━━━━━━━━━━━━━━━━━━━━");
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
