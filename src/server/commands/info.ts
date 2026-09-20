/* INFORMATION + TOOLS + PREMIUM + FUN — all real implementations. */
import { randomUUID, createHash } from "crypto";
import fs from "fs";
import path from "path";
import { eq, and, desc, sql, isNull, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  commands,
  automations,
  botOwners,
  premiumUsers,
  gameScores,
  logs,
} from "@/db/schema";
import {
  CmdCtx,
  CmdResult,
  buildMenu, getMenuStyle, PROMO_TEXT,
  box,
  truncate,
  BOT_VERSION,
  isPremium,
  todayUsed,
  safeFetch,
} from "./core";
import { getGame, delGame, setGame } from "./state";
import { APP_URL } from "@/server/lib";
import { createRoom, inviteGuest, acceptRoom, getRoom } from "../games/game-rooms";
import { createChessState } from "../games/chess-engine";
import { createTttState } from "../games/tictactoe-engine";

/* ------------------------------ math parser ----------------------------- */
export function evalMath(expr: string): number {
  const s = expr.replace(/\s+/g, "").replace(/x/gi, "*").replace(/÷/g, "/");
  let i = 0;
  const peek = () => s[i];
  const eat = (ch: string) => {
    if (s[i] !== ch) throw new Error(`harapan "${ch}"`);
    i++;
  };
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = s[i++];
      const r = parseFactor();
      if (op === "*") v *= r;
      else if (op === "/") {
        if (r === 0) throw new Error("pembagian nol");
        v /= r;
      } else v %= r;
    }
    return v;
  }
  function parseFactor(): number {
    let v = parseUnary();
    if (peek() === "^") {
      i++;
      v = Math.pow(v, parseFactor());
    }
    return v;
  }
  function parseUnary(): number {
    if (peek() === "-") {
      i++;
      return -parseAtom();
    }
    if (peek() === "+") {
      i++;
      return parseAtom();
    }
    return parseAtom();
  }
  function parseAtom(): number {
    if (peek() === "(") {
      i++;
      const v = parseExpr();
      eat(")");
      return v;
    }
    const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error("token tidak valid");
    i += m[0].length;
    return parseFloat(m[0]);
  }
  const result = parseExpr();
  if (i !== s.length) throw new Error("ekspresi tidak valid");
  if (!isFinite(result)) throw new Error("hasil tidak hingga");
  return result;
}

function fmtNum(n: number): string {
  return Math.abs(n) >= 1e12 ? n.toExponential(6) : String(Math.round(n * 1e8) / 1e8);
}

/* ----------------------------- quiz data -------------------------------- */
const TEBAK_KATA: { word: string; hint: string }[] = [
  { word: "kancil", hint: "Hewan kecil licin dalam fabel Indonesia" },
  { word: "merapi", hint: "Gunung berapi aktif di Jawa Tengah" },
  { word: "komodo", hint: "Kadal raksasa endemik Indonesia" },
  { word: "batik", hint: "Kain bercorak warisan budaya UNESCO" },
  { word: "gerhana", hint: "Fenomena bulan menutupi matahari" },
  { word: "samudra", hint: "Wilayah air asin terluas di bumi" },
  { word: "pesawat", hint: "Alat transportasi udara bermesin" },
  { word: "planet", hint: "Benda langit yang mengelilingi matahari" },
  { word: "gizi", hint: "Unsur makanan untuk kesehatan tubuh" },
  { word: "vaksin", hint: "Cairan pencegah penyakit" },
  { word: "hujan", hint: "Air yang turun dari awan" },
  { word: "komodo", hint: "Reptil terbesar di dunia" },
  { word: "candi", hint: "Bangunan purba seperti Prambanan" },
  { word: "sampan", hint: "Perahu kecil tradisional" },
  { word: "angin", hint: "Pergerakan udara yang terasa" },
];

const TEBAK_GAMBAR: { subject: string; wiki: string; answers: string[] }[] = [
  { subject: "Menara Eiffel", wiki: "Eiffel Tower", answers: ["eiffel", "menara eiffel", "eiffeltower"] },
  { subject: "Candi Borobudur", wiki: "Borobudur", answers: ["borobudur", "candi borobudur", "borobudur candi"] },
  { subject: "Gunung Everest", wiki: "Mount Everest", answers: ["everest", "gunung everest"] },
  { subject: "Taj Mahal", wiki: "Taj Mahal", answers: ["taj mahal", "tajmahal"] },
  { subject: "Statue of Liberty", wiki: "Statue of Liberty", answers: ["statue of liberty", "statue liberty", "statu of liberty"] },
  { subject: "Colosseum", wiki: "Colosseum", answers: ["colosseum", "kolosseum"] },
  { subject: "Malioboro Yogyakarta", wiki: "Malioboro", answers: ["malioboro"] },
  { subject: "Air Terjun Niagara", wiki: "Niagara Falls", answers: ["niagara", "air terjun niagara"] },
];

/* -------------------------------- handlers ------------------------------ */
async function renderMenu(ctx: CmdCtx, full: boolean): Promise<CmdResult> {
  const rows = await db
    .select({ name: commands.name, category: commands.category })
    .from(commands)
    .where(and(eq(commands.botId, ctx.bot.id), eq(commands.enabled, true)));
  const owners = await db.select({ phone: botOwners.phone }).from(botOwners).where(eq(botOwners.botId, ctx.bot.id));
  const name = (ctx.raw?.pushName as string) || "user";
  const text = buildMenu(ctx.bot, name, rows, [ctx.bot.ownerNumber ?? "", ...owners.map((o) => o.phone)].filter(Boolean), full);
  const settings = (ctx.bot.settings as any) || {};
  const menuMediaUrl = String(settings.menuPhotoUrl || settings.menuVideoUrl || "").trim();
  let buffer: Buffer | null = null;
  if (/^https?:\/\//i.test(menuMediaUrl)) {
    try { buffer = await safeFetch(menuMediaUrl, 15 * 1024 * 1024); } catch { buffer = null; }
  }
  if (!buffer) {
    try { buffer = await fs.promises.readFile(path.join(process.cwd(), "public", "menu-water-ai-cloud.png")); } catch { buffer = null; }
  }
  if (!buffer) return { text: `${text}\n\n🥀 Media menu tidak tersedia; menu teks tetap ditampilkan.` };
  try {
    const ft = await import("file-type");
    const detected = await ft.fileTypeFromBuffer(buffer);
    const mime = detected?.mime || "";
    if (mime.startsWith("video/")) {
      return { media: { kind: "video", buffer, mimetype: mime, caption: text } };
    }
    if (mime.startsWith("image/")) {
      return { media: { kind: "image", buffer, mimetype: mime, caption: text } };
    }
    throw new Error("bukan image/video");
  } catch {
    return { text: `${text}\n\n🥀 Media menu tidak valid; menu teks tetap ditampilkan.` };
  }

}

export async function menu(ctx: CmdCtx): Promise<CmdResult> {
  const result = await renderMenu(ctx, false);
  const style = getMenuStyle(ctx.bot);
  const p = ctx.bot.prefix || "!";
  // Style 1: teks only
  if (style === 1) return result;
  // Style 2-5: tombol interaktif WA (max 3)
  // Style makin keren = tombol navigasi lebih lengkap
  const buttonSets: Record<number, { id: string; text: string }[]> = {
    2: [
      { id: `${p}allmenu`, text: "📋 Menu Utama" },
      { id: `${p}allmenu`, text: "✨ Selengkapnya" },
      { id: `${p}owner`, text: "👑 Owner" },
    ],
    3: [
      { id: `${p}allmenu`, text: "📋 Menu Utama" },
      { id: `${p}help`, text: "❓ Bantuan" },
      { id: `${p}owner`, text: "👑 Owner" },
    ],
    4: [
      { id: `${p}allmenu`, text: "⚡ All Menu" },
      { id: `${p}status`, text: "📊 Status" },
      { id: `${p}owner`, text: "👑 Owner" },
    ],
    5: [
      { id: `${p}allmenu`, text: "📋 Menu Utama" },
      { id: `${p}allmenu`, text: "✨ Selengkapnya" },
      { id: `${p}donasi`, text: "💎 Donasi" },
    ],
  };
  const buttons = buttonSets[style] || buttonSets[2];
  return {
    ...result,
    text: result.text || "Pilih tombol di bawah 👇",
    buttons,
  };
}

export async function allmenu(ctx: CmdCtx): Promise<CmdResult> {
  const result = await renderMenu(ctx, true);
  const style = getMenuStyle(ctx.bot);
  if (style === 1) return result;
  const p = ctx.bot.prefix || "!";
  const buttonSets: Record<number, { id: string; text: string }[]> = {
    2: [
      { id: `${p}menu`, text: "🏠 Menu Utama" },
      { id: `${p}help`, text: "✨ Selengkapnya" },
      { id: `${p}owner`, text: "👑 Owner" },
    ],
    3: [
      { id: `${p}menu`, text: "🏠 Menu Utama" },
      { id: `${p}status`, text: "📊 Status" },
      { id: `${p}owner`, text: "👑 Owner" },
    ],
    4: [
      { id: `${p}menu`, text: "🏠 Menu" },
      { id: `${p}help`, text: "❓ Help" },
      { id: `${p}ping`, text: "🏓 Ping" },
    ],
    5: [
      { id: `${p}menu`, text: "🏠 Menu Utama" },
      { id: `${p}help`, text: "✨ Selengkapnya" },
      { id: `${p}donasi`, text: "💎 Donasi" },
    ],
  };
  return {
    ...result,
    text: result.text || "Navigasi cepat 👇",
    buttons: buttonSets[style] || buttonSets[2],
  };
}

export async function gantimenu(ctx: CmdCtx): Promise<CmdResult> {
  const arg = (ctx.arg || "").trim();
  if (!arg || !/^[1-5]$/.test(arg)) {
    const current = getMenuStyle(ctx.bot);
    return {
      text: box("🎨 GANTI MENU (Owner)", [
        `Style saat ini: *${current}*`,
        ``,
        `*1* — Default (teks polos, tanpa tombol)`,
        `*2* — Clean + tombol *Menu Utama / Selengkapnya*`,
        `*3* — Elegan + tombol navigasi`,
        `*4* — Neon + tombol cepat`,
        `*5* — Premium + tombol *Menu Utama / Selengkapnya / Donasi*`,
        ``,
        `Pakai: ${ctx.bot.prefix}gantimenu <1-5>`,
      ]),
    };
  }
  const style = Number(arg);
  // Persist to bot.settings.menuStyle
  const { db } = await import("@/db");
  const { bots } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const currentSettings = (ctx.bot.settings as any) || {};
  const newSettings = { ...currentSettings, menuStyle: style };
  await db.update(bots).set({ settings: newSettings }).where(eq(bots.id, ctx.bot.id));
  // Update in-memory
  (ctx.bot as any).settings = newSettings;
  return {
    text: box("✅ MENU DIGANTI", [
      `Style menu sekarang: *${style}*`,
      style === 1 ? "Mode teks polos (tanpa tombol)." : "Mode dengan tombol interaktif WhatsApp.",
      `Ketik ${ctx.bot.prefix}menu untuk melihat hasilnya.`,
    ]),
  };
}

export async function help(ctx: CmdCtx): Promise<CmdResult> {
  const p = (ctx.bot.prefix || "!").trim();
  return {
    text: box("📖 HELP", [
      `Ketik ${p}menu atau ${p}allmenu untuk melihat semua command.`,
      `Contoh: ${p}play faded, ${p}weather jawa barat, ${p}math 2+2*10`,
      `Untuk BRAT: ${p}brat halo — jangan jalankan ${p}brat tanpa teks.`,
      `Reply gambar dengan ${p}sticker untuk membuat sticker.`,
      `${p}help <command> untuk detail singkat.`,
    ]),
  };
}

export async function ping(ctx: CmdCtx): Promise<CmdResult> {
  return { text: `🏓 Pong! ${Date.now() - ctx.startedAt}ms` };
}

export async function runtime(ctx: CmdCtx): Promise<CmdResult> {
  const mem = process.memoryUsage();
  return {
    text: box("🖥️ RUNTIME", [
      `Node : ${process.version}`,
      `Uptime engine : ${Math.floor((Date.now() - ctx.startedAt) / 1000) + ctx.bot.uptimeSec}s`,
      `Memory : ${(mem.heapUsed / 1048576).toFixed(1)} / ${(mem.heapTotal / 1048576).toFixed(1)} MB`,
      `Platform : ${process.platform}`,
    ]),
  };
}

export async function status(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text: box("📊 STATUS BOT", [
      `Nama : ${ctx.bot.name}`,
      `Status : ${ctx.bot.status.toUpperCase()}`,
      `Uptime : ${ctx.bot.uptimeSec}s`,
      `Terima : ${ctx.bot.messagesReceived.toLocaleString()}`,
      `Kirim : ${ctx.bot.messagesSent.toLocaleString()}`,
      `WA : ${ctx.bot.whatsappNumber ? "+" + ctx.bot.whatsappNumber : "belum linked"}`,
      `Versi : ${BOT_VERSION}`,
    ]),
  };
}

export async function botinfo(ctx: CmdCtx): Promise<CmdResult> {
  const [cmds] = await db
    .select({ n: sql<number>`count(*)` })
    .from(commands)
    .where(and(eq(commands.botId, ctx.bot.id), eq(commands.enabled, true)));
  const [auto] = await db
    .select({ n: sql<number>`count(*)` })
    .from(automations)
    .where(and(eq(automations.botId, ctx.bot.id), eq(automations.enabled, true)));
  return {
    text: box("🤖 BOT INFO", [
      `Nama : ${ctx.bot.name}`,
      `Prefix : ${ctx.bot.prefix}`,
      `Owner : ${ctx.bot.ownerNumber ?? "-"}`,
      `Version : ${BOT_VERSION}`,
      `Command aktif : ${cmds?.n ?? 0}`,
      `Automation aktif : ${auto?.n ?? 0}`,
      `Dibuat : ${new Date(ctx.bot.createdAt).toLocaleDateString("id-ID")}`,
    ]),
  };
}

export async function owner(ctx: CmdCtx): Promise<CmdResult> {
  return { text: `👑 Owner bot: ${ctx.bot.ownerNumber ? "+" + ctx.bot.ownerNumber : "belum diset"}` };
}

export async function copymenu(): Promise<CmdResult> {
  return {
    text:
      "📋 SALIN MENU\n\nLong-press pesan .menu lalu pilih Copy.\n" +
      "Pengguna web: tombol 📋 di halaman Commands dashboard memakai Clipboard API.",
  };
}

/* --------------------------------- TOOLS -------------------------------- */
export async function calc(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .calc 2+2*10" };
  try {
    return { text: box("🧮 HASIL", [`${ctx.arg} = ${fmtNum(evalMath(ctx.arg))}`]) };
  } catch {
    return { text: "❌ Ekspresi matematika tidak valid." };
  }
}
export const math = calc;

export async function jsonCmd(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .json {\"key\": 1}" };
  try {
    const parsed = JSON.parse(ctx.arg);
    return { text: `✅ JSON valid\n\`\`\`json\n${truncate(JSON.stringify(parsed, null, 2), 3500)}\n\`\`\`` };
  } catch (e: any) {
    return { text: `❌ JSON tidak valid: ${e.message}` };
  }
}

export async function base64(ctx: CmdCtx): Promise<CmdResult> {
  const [mode, ...rest] = ctx.parts.slice(1);
  const input = rest.join(" ");
  if (!mode || !input) return { text: "Pakai: .base64 encode <teks>" };
  if (mode === "encode") return { text: Buffer.from(input, "utf8").toString("base64") };
  if (mode === "decode") {
    try {
      return { text: Buffer.from(input, "base64").toString("utf8") };
    } catch {
      return { text: "❌ Base64 tidak valid." };
    }
  }
  return { text: "Mode: encode | decode" };
}

export async function urlencode(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .urlencode <teks>" };
  return { text: encodeURIComponent(ctx.arg) };
}
export async function urldecode(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .urldecode <teks>" };
  try {
    return { text: decodeURIComponent(ctx.arg) };
  } catch {
    return { text: "❌ URL-encoded tidak valid." };
  }
}

export async function uuidCmd(): Promise<CmdResult> {
  return { text: `🆔 ${randomUUID()}` };
}

export async function hash(ctx: CmdCtx): Promise<CmdResult> {
  const [alg, ...rest] = ctx.parts.slice(1);
  const input = rest.join(" ");
  if (!alg || !input) return { text: "Pakai: .hash sha256 <teks>" };
  if (!["md5", "sha1", "sha256"].includes(alg)) return { text: "Algoritma: md5 | sha1 | sha256" };
  return { text: `${alg}:\n${createHash(alg).update(input).digest("hex")}` };
}

export async function regex(ctx: CmdCtx): Promise<CmdResult> {
  const m = /^\/(.*)\/([a-z]*)\s+(.*)$/.exec(ctx.arg);
  if (!m) return { text: "Pakai: .regex /\\d+/i 12abc34" };
  const [, pattern, flags, subject] = m;
  try {
    const re = new RegExp(pattern, flags);
    const res = re.exec(subject);
    return {
      text: res
        ? `✅ Match: "${res[0]}"\nIndex: ${res.index}${res[1] ? `\nGroup1: ${res[1]}` : ""}`
        : "❌ Tidak ada match.",
    };
  } catch (e: any) {
    return { text: `❌ Regex invalid: ${e.message}` };
  }
}

export async function timestamp(ctx: CmdCtx): Promise<CmdResult> {
  if (/^\d{10,13}$/.test(ctx.arg)) {
    const t = parseInt(ctx.arg, 10);
    const d = new Date(ctx.arg.length === 13 ? t : t * 1000);
    return { text: `${ctx.arg} → ${d.toUTCString()}` };
  }
  const now = Math.floor(Date.now() / 1000);
  return { text: `Unix : ${now}\nUTC  : ${new Date().toUTCString()}\nLocal: ${new Date().toLocaleString("id-ID")}` };
}

export async function color(ctx: CmdCtx): Promise<CmdResult> {
  const hex = ctx.arg.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { text: "Pakai: .color #22d3ee" };
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r / 255) hue = ((g - b) / 255 / d) % 6;
    else if (max === g / 255) hue = (b - r) / 255 / d + 2;
    else hue = (r - g) / 255 / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return {
    text: box("🎨 WARNA", [
      `Hex : #${h.toUpperCase()}`,
      `RGB : ${r}, ${g}, ${b}`,
      `HSL : ${Math.round(hue)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`,
    ]),
  };
}

export async function jwt(ctx: CmdCtx): Promise<CmdResult> {
  const token = ctx.arg.trim();
  const parts = token.split(".");
  if (parts.length !== 3) return { text: "❌ Format JWT tidak valid (3 bagian)." };
  try {
    const dec = (p: string) => JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const header = dec(parts[0]);
    const payload = dec(parts[1]);
    return {
      text:
        `🔓 JWT DECODE (signature TIDAK diverifikasi)\n\nHeader:\n${JSON.stringify(header, null, 2)}\n\nPayload:\n${truncate(
          JSON.stringify(payload, null, 2),
          2500
        )}`,
    };
  } catch (e: any) {
    return { text: `❌ Gagal decode JWT: ${e.message}` };
  }
}

export async function html(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .html <tag>" };
  const esc = ctx.arg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const unesc = esc
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  return { text: `Input : ${truncate(ctx.arg, 200)}\n\nEscaped:\n${truncate(esc, 400)}\n\nUnescaped:\n${truncate(unesc, 400)}` };
}

export async function javascript(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .javascript <kode JS> (parse-only, aman)" };
  try {
    // Compile WITHOUT executing — real syntax validation only.
    new Function(ctx.arg);
    return { text: "✅ Sintaks JavaScript valid (tidak dieksekusi — parse only)." };
  } catch (e: any) {
    return { text: `❌ Syntax error: ${e.message}` };
  }
}

/* -------------------------------- PREMIUM ------------------------------- */
export async function premium(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text: box("💎 PREMIUM", [
      "Premium membuka command ber-marka premium tanpa limit.",
      ".addprem dilakukan owner bot, atau beli lewat dashboard Billing.",
      "Cek status: .mypremium",
    ]),
  };
}

export async function mypremium(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db
    .select({ expiresAt: premiumUsers.expiresAt })
    .from(premiumUsers)
    .where(
      and(
        eq(premiumUsers.botId, ctx.bot.id),
        eq(premiumUsers.jid, ctx.n.sender),
        sql`(${premiumUsers.expiresAt} is null or ${premiumUsers.expiresAt} > now())`
      )
    )
    .limit(1);
  if (rows[0])
    return { text: `💎 Status: PREMIUM${rows[0].expiresAt ? ` (exp ${new Date(rows[0].expiresAt).toLocaleDateString("id-ID")})` : " (forever)"}` };
  return { text: "👤 Status: FREE — limit harian tetap berlaku. Cek .limit" };
}

export async function limit(ctx: CmdCtx): Promise<CmdResult> {
  const used = await todayUsed(ctx.bot.id, ctx.n.sender);
  const prem = await isPremium(ctx.bot.id, ctx.n.sender);
  return {
    text: box("⏳ LIMIT HARI INI", [
      `Terpakai : ${used}/200`,
      `Quota premium/hari : ${prem ? "∞ (premium)" : "10"}`,
      `Sisa command biasa : ${Math.max(0, 200 - used)}`,
    ]),
  };
}

export async function premiuminfo(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text: box("💎 PREMIUM INFO", [
      "FREE  : 200 cmd/hari, quota premium 10/hari",
      "PREMIUM: tanpa limit harian, semua fitur premium",
      "Aktivasi: owner bot (.addprem) / dashboard Billing",
    ]),
  };
}

export async function buy(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text:
      "🛒 Beli Premium\n\n1. Hubungi owner bot Anda, atau\n" +
      "2. Buka Dashboard → Billing → Upgrade plan.\n" +
      "Pembayaran diverifikasi admin (server-side), lalu .addprem diaktifkan.",
  };
}

/* ---------------------------------- FUN --------------------------------- */
export async function random(ctx: CmdCtx): Promise<CmdResult> {
  const max = Math.min(1_000_000, Math.max(1, parseInt(ctx.arg, 10) || 100));
  return { text: `🎲 ${Math.floor(Math.random() * max) + 1}` };
}

async function fetchQuote(): Promise<string | null> {
  try {
    const res = await fetch("https://zenquotes.io/api/quotes", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const j: any = await res.json();
    const q = Array.isArray(j) ? j[0] : j;
    return q?.q ? `"${q.q}"\n— ${q.a ?? ""}` : null;
  } catch {
    return null;
  }
}

export async function quote(ctx: CmdCtx): Promise<CmdResult> {
  const q = await fetchQuote();
  return { text: q ?? "❌ Gagal mengakses service quote (ZenQuotes). Coba lagi nanti." };
}
export async function daily(ctx: CmdCtx): Promise<CmdResult> {
  const q = await fetchQuote();
  return { text: (q ? "📅 DAILY\n\n" : "❌ Gagal memuat.") + (q ?? "") };
}

export async function quiz(ctx: CmdCtx): Promise<CmdResult> {
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { text: "❌ Gagal mengakses OpenTDB." };
    const j: any = await res.json();
    const q = j?.response?.results?.[0];
    if (!q?.question) return { text: "❌ Tidak ada kuis tersedia saat ini." };
    const options = [q.correct_answer, ...q.incorrect_answers].sort(() => Math.random() - 0.5);
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "quiz", data: { answer: q.correct_answer, question: q.question, options }, startedAt: Date.now() });
    return {
      text: box("🎮 QUIZ", [decode(q.question), ...options.map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${decode(o)}`), "Jawab: A / B / C / D"]),
    };
  } catch {
    return { text: "⏱️ Proses terlalu lama. Silakan coba lagi." };
  }
}
export const trivia = quiz;
function decode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function tebakkata(ctx: CmdCtx): Promise<CmdResult> {
  const item = TEBAK_KATA[Math.floor(Math.random() * TEBAK_KATA.length)];
  setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "tebakkata", data: item, startedAt: Date.now() });
  return { text: box("🎯 TEBAK KATA", [`Petunjuk: ${item.hint}`, "Jawab langsung dengan kata itu."]) };
}

export async function tebakgambar(ctx: CmdCtx): Promise<CmdResult> {
  const item = TEBAK_GAMBAR[Math.floor(Math.random() * TEBAK_GAMBAR.length)];
  try {
    const res = await fetch(
      `https://commons.wikimedia.org/w/rest.php/v1/page/${encodeURIComponent(item.wiki)}/summary`,
      { signal: AbortSignal.timeout(15000) }
    );
    const j: any = await res.json();
    const url = j?.thumbnail?.source || j?.originalimage?.source;
    if (!url) throw new Error("no image");
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "tebakgambar", data: item, startedAt: Date.now() });
    return {
      media: { kind: "image" as const, buffer: await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer() as any, caption: box("🖼️ TEBAK GAMBAR", ["Gambar apakah ini? Jawab dengan nama tempat/monumennya."]) },
    };
  } catch {
    return { text: "❌ Gagal memuat gambar (Wikimedia). Coba lagi." };
  }
}

export async function leaderboard(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db
    .select()
    .from(gameScores)
    .where(and(eq(gameScores.botId, ctx.bot.id), eq(gameScores.groupId, ctx.n.remoteJid)))
    .orderBy(desc(gameScores.wins))
    .limit(10);
  if (!rows.length) return { text: "🏆 Skor belum ada. Mainkan .quiz / .tebakkata dulu!" };
  const lines = rows.map((r, i) => `${i + 1}. ${r.name ?? r.jid.split("@")[0]} — ${r.wins}M/${r.total}P`);
  return { text: box("🏆 LEADERBOARD", lines) };
}

export async function flashcard(ctx: CmdCtx): Promise<CmdResult> {
  if (ctx.arg) {
    const cards = ctx.arg
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [k, ...v] = s.split("|");
        return { term: k?.trim() ?? "", def: v.join("|").trim() };
      })
      .filter((c) => c.term && c.def);
    if (!cards.length) return { text: "Format: .flashcard istilah|definisi; istilah2|definisi2" };
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "flashcard", data: { cards, idx: 0 }, startedAt: Date.now() });
  }
  const g = getGame(ctx.bot.id, ctx.n.remoteJid);
  if (g?.kind !== "flashcard") return { text: "Buat dulu: .flashcard istilah|definisi; ..." };
  const card = g.data.cards[g.data.idx];
  return {
    text: box("🗂️ FLASHCARD", [
      `(${g.data.idx + 1}/${g.data.cards.length})`,
      `Istilah : ${card.term}`,
      "Ketik jawaban definisinya, atau 'next' untuk lewat.",
    ]),
  };
}

/** Process a plain-text answer for pending games. Returns reply or null. */

/* ============================== CHESS2 ============================== */
const CHESS_PIECES: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function chessEmptyBoard(): (string | null)[][] {
  const b: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let i = 0; i < 8; i++) {
    b[0][i] = back[i].toLowerCase();
    b[1][i] = "p";
    b[6][i] = "P";
    b[7][i] = back[i];
  }
  return b;
}

function chessRender(board: (string | null)[][], turn: "w" | "b"): string {
  const files = "  a  b  c  d  e  f  g  h";
  const lines = [files];
  for (let r = 0; r < 8; r++) {
    let row = `${8 - r} `;
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      const dark = (r + c) % 2 === 1;
      const cell = p ? CHESS_PIECES[p] || p : dark ? "·" : " ";
      row += cell + " ";
    }
    lines.push(row + `${8 - r}`);
  }
  lines.push(files);
  return (
    `♟️ *CHESS2* — VS BOT · FUN MODE\n` +
    `Giliran: *${turn === "w" ? "Kamu (Putih)" : "Bot (Hitam)"}*\n\n` +
    "```\n" +
    lines.join("\n") +
    "\n```\n" +
    `Gerak: \`.chess2 e2e4\` · Batal: \`.chess2 resign\` · Baru: \`.chess2 new\``
  );
}

function parseSquare(s: string): { r: number; c: number } | null {
  if (!/^[a-h][1-8]$/i.test(s)) return null;
  const c = s.toLowerCase().charCodeAt(0) - 97;
  const r = 8 - parseInt(s[1], 10);
  return { r, c };
}

function isWhite(p: string | null) {
  return !!p && p === p.toUpperCase();
}

function chessTryMove(
  board: (string | null)[][],
  from: string,
  to: string,
  turn: "w" | "b"
): { ok: boolean; msg?: string } {
  const a = parseSquare(from);
  const b = parseSquare(to);
  if (!a || !b) return { ok: false, msg: "Kotak tidak valid. Contoh: e2e4" };
  const piece = board[a.r][a.c];
  if (!piece) return { ok: false, msg: `Tidak ada bidak di ${from}` };
  if (turn === "w" && piece !== piece.toUpperCase()) return { ok: false, msg: "Giliran putih" };
  if (turn === "b" && piece !== piece.toLowerCase()) return { ok: false, msg: "Giliran hitam" };
  const legal = chessLegalTargets(board, from, turn);
  if (!legal.includes(to.toLowerCase())) return { ok: false, msg: `Langkah ${from}${to} tidak legal.` };

  const target = board[b.r][b.c];
  if (target && target.toUpperCase() === "K") return { ok: false, msg: "Raja tidak boleh dimakan; posisi harus di-checkmate." };
  board[b.r][b.c] = piece;
  board[a.r][a.c] = null;
  // Automatic promotion to queen keeps the WhatsApp UI simple.
  if (piece === "P" && b.r === 0) board[b.r][b.c] = "Q";
  if (piece === "p" && b.r === 7) board[b.r][b.c] = "q";
  return { ok: true };
}

function chessBotMove(board: (string | null)[][]): void {
  const moves: { from: string; to: string; capture: boolean }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p !== p.toLowerCase()) continue;
      const from = String.fromCharCode(97 + c) + String(8 - r);
      for (const to of chessLegalTargets(board, from, "b")) {
        const t = parseSquare(to);
        const target = t ? board[t.r][t.c] : null;
        moves.push({ from, to, capture: !!target });
      }
    }
  }
  if (!moves.length) return;
  // Prefer captures, then choose from the remaining legal moves.
  const captures = moves.filter((m) => m.capture);
  const pool = captures.length ? captures : moves;
  const m = pool[Math.floor(Math.random() * pool.length)];
  const a = parseSquare(m.from);
  const b = parseSquare(m.to);
  if (!a || !b) return;
  const piece = board[a.r][a.c];
  if (!piece) return;
  board[b.r][b.c] = piece;
  board[a.r][a.c] = null;
  if (piece === "p" && b.r === 7) board[b.r][b.c] = "q";
}


async function chessBoardImage(
  board: (string | null)[][],
  turn: "w" | "b",
  selected?: string | null,
  targets?: string[],
  overlay?: string[],
  statusLine?: string,
  subtitle?: string
): Promise<Buffer | null> {
  try {
    const { renderChessBoard } = await import("../interactive/render/chessBoard");
    return await renderChessBoard({
      board,
      turn,
      selected: selected || null,
      targets: targets || [],
      title: "CHESS2",
      subtitle: subtitle || (turn === "w" ? "Giliran kamu" : "Bot sedang berpikir..."),
      statusLine:
        statusLine ||
        (turn === "w" ? "Pilih bidak putih terlebih dahulu." : "Tunggu giliran berikutnya."),
      overlayLines: overlay,
    });
  } catch (e) {
    console.error("[CHESS2] board render failed", e);
    return null;
  }
}

function chessFindKing(board: (string | null)[][], side: "w" | "b"): { r: number; c: number } | null {
  const king = side === "w" ? "K" : "k";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === king) return { r, c };
  return null;
}

function chessSquareAttacked(board: (string | null)[][], r: number, c: number, by: "w" | "b"): boolean {
  const pawn = by === "w" ? "P" : "p";
  const pawnRow = by === "w" ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (board[pawnRow]?.[c + dc] === pawn) return true;
  const knight = by === "w" ? "N" : "n";
  for (const [dr, dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
    if (board[r + dr]?.[c + dc] === knight) return true;
  }
  const bishop = by === "w" ? "B" : "b";
  const rook = by === "w" ? "R" : "r";
  const queen = by === "w" ? "Q" : "q";
  const king = by === "w" ? "K" : "k";
  const rays = [
    [[1,0],[-1,0],[0,1],[0,-1], rook, queen],
    [[1,1],[1,-1],[-1,1],[-1,-1], bishop, queen],
  ] as any[];
  for (const group of rays) {
    const pieces = group.slice(-2);
    for (const [dr, dc] of group.slice(0,4)) {
      for (let n = 1; n < 8; n++) {
        const rr = r + dr * n, cc = c + dc * n;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
        const p = board[rr][cc];
        if (!p) continue;
        if (p === pieces[0] || p === pieces[1]) return true;
        break;
      }
    }
  }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    if (board[r + dr]?.[c + dc] === king) return true;
  }
  return false;
}

function chessInCheck(board: (string | null)[][], side: "w" | "b"): boolean {
  const king = chessFindKing(board, side);
  return !!king && chessSquareAttacked(board, king.r, king.c, side === "w" ? "b" : "w");
}

/** Pseudo-legal moves plus a king-safety filter. Castling/en-passant are intentionally omitted. */
function chessPseudoLegalTargets(board: (string | null)[][], from: string, turn: "w" | "b"): string[] {
  const a = parseSquare(from);
  if (!a) return [];
  const piece = board[a.r][a.c];
  if (!piece) return [];
  if (turn === "w" && piece !== piece.toUpperCase()) return [];
  if (turn === "b" && piece === piece.toUpperCase()) return [];

  const out: string[] = [];
  const push = (r: number, c: number) => {
    if (r < 0 || r > 7 || c < 0 || c > 7) return;
    const t = board[r][c];
    const enemy = t && (turn === "w" ? t === t.toLowerCase() : t === t.toUpperCase());
    if (!t || enemy) {
      const sq = String.fromCharCode(97 + c) + String(8 - r);
      out.push(sq);
    }
  };

  const p = piece.toUpperCase();
  if (p === "P") {
    const dir = turn === "w" ? -1 : 1;
    const startRank = turn === "w" ? 6 : 1;
    if (!board[a.r + dir]?.[a.c]) {
      push(a.r + dir, a.c);
      if (a.r === startRank && !board[a.r + dir * 2]?.[a.c]) push(a.r + dir * 2, a.c);
    }
    // captures
    for (const dc of [-1, 1]) {
      const tr = a.r + dir;
      const tc = a.c + dc;
      if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
        const t = board[tr][tc];
        if (t && (turn === "w" ? t === t.toLowerCase() : t === t.toUpperCase())) push(tr, tc);
      }
    }
  } else if (p === "N") {
    for (const [dr, dc] of [
      [2, 1], [2, -1], [-2, 1], [-2, -1],
      [1, 2], [1, -2], [-1, 2], [-1, -2],
    ]) push(a.r + dr, a.c + dc);
  } else if (p === "K") {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (dr || dc) push(a.r + dr, a.c + dc);
  } else {
    // R/B/Q approximate sliding for fun mode
    const dirs: number[][] =
      p === "R"
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : p === "B"
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : [
              [1, 0], [-1, 0], [0, 1], [0, -1],
              [1, 1], [1, -1], [-1, 1], [-1, -1],
            ];
    for (const [dr, dc] of dirs) {
      for (let s = 1; s < 8; s++) {
        const rr = a.r + dr * s;
        const cc = a.c + dc * s;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
        const t = board[rr][cc];
        if (!t) {
          push(rr, cc);
        } else {
          const enemy = turn === "w" ? t === t.toLowerCase() : t === t.toUpperCase();
          if (enemy) push(rr, cc);
          break;
        }
      }
    }
  }
  return out;
}

function chessLegalTargets(board: (string | null)[][], from: string, turn: "w" | "b"): string[] {
  const pseudo = chessPseudoLegalTargets(board, from, turn);
  const a = parseSquare(from);
  if (!a) return [];
  const piece = board[a.r][a.c];
  if (!piece) return [];
  const legal: string[] = [];
  for (const to of pseudo) {
    const b = parseSquare(to);
    if (!b) continue;
    const captured = board[b.r][b.c];
    if (captured && captured.toUpperCase() === "K") continue;
    board[b.r][b.c] = piece;
    board[a.r][a.c] = null;
    const safe = !chessInCheck(board, turn);
    board[a.r][a.c] = piece;
    board[b.r][b.c] = captured;
    if (safe) legal.push(to);
  }
  return legal;
}

const CHESS_BTNS = [
  { id: "CHESS_UNDO", text: "↩ BATALKAN LANGKAH" },
  { id: "CHESS_NEW", text: "GAME BARU" },
];

export async function chess2(ctx: CmdCtx): Promise<CmdResult> {
  const arg = (ctx.arg || "").trim().toLowerCase();
  const requestedDifficulty = /^(easy|normal|hard)$/.test(arg) ? (arg as "easy" | "normal" | "hard") : null;
  const existing = getGame(ctx.bot.id, ctx.n.remoteJid, "chess2");

  // HTML offline opsional — game utama tetap gambar + tombol di bubble
  if (arg === "html" || arg === "web" || arg === "canvas") {
    try {
      const { buildChessHtml } = await import("../games/html-board");
      const html = buildChessHtml({ title: "CHESS REALTIME · WATER AI" });
      return {
        text: "📦 Paket HTML offline opsional. Game utama: papan di bubble chat.",
        media: {
          kind: "document" as const,
          buffer: Buffer.from(html, "utf8"),
          filename: "chess-water-ai.html",
          mimetype: "text/html",
          caption: "Chess HTML offline",
        },
      };
    } catch (e: any) {
      return { text: `❌ Gagal membuat HTML chess: ${e?.message ?? e}` };
    }
  }

  // Multiplayer undang teman by phone (private + grup)
  const chessInvite = arg.match(/^(undang|invite)\s+(.+)$/i);
  if (chessInvite) {
    const mNum = chessInvite[2].match(/(?:@)?(\d{8,15})/);
    if (!mNum) return { text: "Format: `.chess2 invite 0812xxxxxxx` atau `.chess2 undang 62812xxxxxxx`" };
    let d = mNum[1];
    if (d.startsWith("0")) d = "62" + d.slice(1);
    if (d.startsWith("8") && d.length <= 13) d = "62" + d;
    const targetJid = `${d}@s.whatsapp.net`;
    const board = chessEmptyBoard();
    const gameId = randomUUID();
    const onlineRoom = createRoom("chess", ctx.n.sender, createChessState({
      isAi: false,
      whitePlayer: ctx.n.sender,
      difficulty: "hard",
    }));
    const invited = inviteGuest(onlineRoom.id, d);
    if (!invited.ok || !invited.room) return { text: `❌ ${invited.error || "Gagal membuat room online"}` };
    const data = {
      board,
      turn: "w" as const,
      history: [] as string[],
      selected: null as string | null,
      targets: [] as string[],
      playerJid: ctx.n.sender,
      opponentJid: targetJid,
      mode: "pvp" as const,
      pendingInvite: true,
      gameId,
      hostJid: ctx.n.remoteJid,
      roomId: onlineRoom.id,
      hostToken: onlineRoom.hostToken,
      guestToken: onlineRoom.guestToken,
    };
    // Store on host chat + guest chat key for accept
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "chess2", data, startedAt: Date.now() });
    setGame(ctx.bot.id, targetJid, { kind: "chess2", data: { ...data, pendingInvite: true }, startedAt: Date.now() });

    // Send invite to guest — gambar papan (PNG) sebagai bukti visual utama,
    // HTML rich-card dikirim best-effort saja (tidak semua client WA bisa render-nya).
    try {
      const { buildChessHtml, attachOnlineGameHtml } = await import("../games/html-board");
      const { sendRichHtmlToChat } = await import("../games/send-rich-html");
      const html = attachOnlineGameHtml(
        buildChessHtml({ title: "UNDANGAN CATUR · WATER AI", mode: "pvp" }),
        { kind: "chess", roomId: onlineRoom.id, token: onlineRoom.guestToken!, side: "guest", apiBase: `${APP_URL}/api/games` },
      );
      const sent = await sendRichHtmlToChat(ctx.sock, targetJid, html, {
        title: "♟️ Undangan Catur Online",
        id: `chess-inv-${gameId.slice(0, 8)}`,
        source: "water_ai_chess_invite",
      });
      if (!sent.ok) {
        await ctx.sock.sendMessage(targetJid, { text: `♟️ Undangan Catur Online\n\nDari: ${String(ctx.n.sender).split("@")[0].split(":")[0]}\nKetik *.chess2 terima* untuk mulai.\n\nMedia HTML gagal dikirim: ${sent.error || "client tidak mendukung Rich HTML"}` });
      }
    } catch (e: any) {
      console.error("[chess2 invite]", e?.message || e);
    }

    return {
      text:
        `♟️ *UNDANGAN TERKIRIM*\n\n` +
        `Host (Putih): kamu\n` +
        `Lawan (Hitam): ${d}\n` +
        `Kode: ${gameId.slice(0, 8)}\n\n` +
        `Media HTML undangan sudah dikirim ke nomor lawan.\n` +
        `Lawan ketik *.chess2 terima* untuk mulai.\n` +
        `_Sinkron real-time lewat bot (bukan simulasi lokal)._`,
      buttons: [
        { id: "CHESS_NEW", text: "GAME BARU" },
      ],
    };
  }

  if (arg === "terima" || arg === "accept") {
    const g = existing?.kind === "chess2" ? (existing.data as any) : null;
    if (!g?.pendingInvite || !g?.opponentJid) return { text: "Tidak ada undangan catur aktif. Minta host: `.chess2 invite 08xxx`" };
    const inv = String(g.opponentJid).split("@")[0].split(":")[0];
    const me = String(ctx.n.sender).split("@")[0].split(":")[0];
    if (inv !== me && String(g.opponentJid) !== ctx.n.sender && String(g.opponentJid) !== ctx.n.remoteJid) {
      // allow accept on guest jid chat
      if (String(ctx.n.remoteJid).split("@")[0] !== inv) {
        return { text: "⛔ Undangan ini bukan untuk kamu." };
      }
    }
    g.pendingInvite = false;
    g.blackPlayerJid = ctx.n.sender;
    const hostKey = g.hostJid || ctx.n.remoteJid;
    const onlineRoom = g.roomId ? getRoom(g.roomId) : null;
    if (!onlineRoom) return { text: "❌ Room online sudah tidak tersedia. Buat undangan baru." };
    const accepted = acceptRoom(onlineRoom.id, ctx.n.sender);
    if (!accepted.ok || !accepted.room?.guestToken) return { text: "❌ Gagal mengaktifkan room online." };
    setGame(ctx.bot.id, hostKey, { kind: "chess2", data: g, startedAt: Date.now() });
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "chess2", data: g, startedAt: Date.now() });
    try {
      const { buildChessHtml, attachOnlineGameHtml } = await import("../games/html-board");
      const { sendRichHtmlToChat } = await import("../games/send-rich-html");
      const baseHtml = buildChessHtml({ title: "CATUR ONLINE · WATER AI", mode: "pvp" });
      const hostHtml = attachOnlineGameHtml(baseHtml, { kind: "chess", roomId: accepted.room.id, token: accepted.room.hostToken, side: "host", apiBase: `${APP_URL}/api/games` });
      const guestHtml = attachOnlineGameHtml(baseHtml, { kind: "chess", roomId: accepted.room.id, token: accepted.room.guestToken, side: "guest", apiBase: `${APP_URL}/api/games` });
      const hostSent = await sendRichHtmlToChat(ctx.sock, hostKey, hostHtml, { title: "♟️ Catur Online", id: `chess-on-host-${Date.now().toString(36)}`, source: "water_ai_chess" });
      const guestSent = await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, guestHtml, { title: "♟️ Catur Online", id: `chess-on-guest-${Date.now().toString(36)}`, source: "water_ai_chess" });
      if (!hostSent.ok || !guestSent.ok) console.error("[chess2 accept] rich html host/guest", hostSent.error, guestSent.error);
    } catch (e: any) {
      console.error("[chess2 accept]", e?.message || e);
    }
    return {
      text: `✅ Kamu bergabung sebagai Hitam!\n🎮 Media HTML online dikirim ke kedua HP.\nPutih mulai — tap bidak di media untuk bermain real-time.`,
      buttons: CHESS_BTNS,
    };
  }

  if (arg === "multi" || arg === "pvp") {
    return {
      text:
        "👥 *Catur Multiplayer*\n\n" +
        "Di grup: `.chess2 undang @628xxx`\n" +
        "Teman: `.chess2 terima`\n" +
        "Main lewat papan + tombol di chat (real-time bubble).",
    };
  }

  // ---- NEW GAME ----
  if (!arg || arg === "new" || arg === "start" || requestedDifficulty) {
    const board = chessEmptyBoard();
    setGame(ctx.bot.id, ctx.n.remoteJid, {
      kind: "chess2",
      data: { board, turn: "w", history: [], selected: null, targets: [] as string[], playerJid: ctx.n.sender, mode: "ai", difficulty: requestedDifficulty || "normal", gameId: randomUUID() },
      startedAt: Date.now(),
    });
    // Kirim LIVE HTML sebagai media utama. Jika client/library tidak mendukung
    // Rich HTML, baru fallback ke PNG agar tidak ada bubble kosong.
    try {
      const { buildChessHtml } = await import("../games/html-board");
      const { sendRichHtmlToChat } = await import("../games/send-rich-html");
      const html = buildChessHtml({
        title: "CHESS · WATER AI",
        status: `VS COMPUTER · ${(requestedDifficulty || "normal").toUpperCase()} · Giliran Putih · sentuh bidak di HTML`,
        mode: "ai",
        difficulty: requestedDifficulty || "normal",
      });
      const rich = await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, html, {
        title: "Chess · WATER AI",
        id: `chess-${randomUUID()}`,
        source: "water_ai_chess",
      });
      if (rich.ok) return { handled: true };
      console.error("[CHESS] rich html unavailable:", rich.error);
    } catch (e: any) {
      console.error("[CHESS] rich html", e?.message || e);
    }

    const img = await chessBoardImage(board, "w", null, [], undefined, "Pilih bidak putih terlebih dahulu.", "Giliran kamu");
    if (img) {
      return {
        buttons: CHESS_BTNS,
        media: {
          kind: "image" as const,
          buffer: img,
          mimetype: "image/png",
          caption: "♟️ *CHESS · WATER AI*\nvs Bot · Giliran Putih\n\nFormat: `.chess2 e2e4`",
        },
      };
    }
    return {
      text: "♟️ *CHESS · WATER AI*\nvs Bot · Giliran Putih\n" + chessRender(board, "w") + "\n\nFormat: `.chess2 e2e4`",
      buttons: CHESS_BTNS,
    };
  }

  // ---- RESIGN / CANCEL ----
  if (arg === "resign" || arg === "surrender" || arg === "batal" || arg === "undo") {
    if (arg === "undo" && existing?.kind === "chess2") {
      // soft undo: clear selection
      const data = existing.data as any;
      data.selected = null;
      data.targets = [];
      setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "chess2", data, startedAt: Date.now() });
      const img = await chessBoardImage(data.board, data.turn, null, [], undefined, "Pilih bidak putih terlebih dahulu.", "Giliran kamu");
      if (img) {
        return {
          buttons: CHESS_BTNS,
          media: {
            kind: "image" as const,
            buffer: img,
            mimetype: "image/png",
            caption: "↩ Langkah dibatalkan. Pilih bidak lagi.",
          },
        };
      }
    }
    delGame(ctx.bot.id, ctx.n.remoteJid, "chess2");
    return {
      text: "🏳️ Game dibatalkan. Ketik *.chess2* untuk main lagi.",
      buttons: [{ id: "CHESS_NEW", text: "GAME BARU" }],
    };
  }

  if (!existing || existing.kind !== "chess2") {
    return { text: `Belum ada game. Mulai: *${ctx.bot.prefix}chess2*` };
  }

  const data = existing.data as {
    board: (string | null)[][];
    turn: "w" | "b";
    history: string[];
    selected?: string | null;
    targets?: string[];
    playerJid?: string;
    gameId?: string;
  };

  if (data.playerJid && data.playerJid !== ctx.n.sender) {
    return { text: "⛔ Game Chess2 ini sedang dimainkan oleh pemain lain." };
  }

  // Single square: select piece OR destination
  const single = arg.match(/^([a-h][1-8])$/i);
  if (single) {
    const sq = single[1].toLowerCase();
    // If already selected from → treat as destination
    if (data.selected) {
      const from = data.selected;
      const to = sq;
      const result = chessTryMove(data.board, from, to, data.turn);
      if (!result.ok) {
        const img = await chessBoardImage(
          data.board,
          data.turn,
          from,
          data.targets || [],
          undefined,
          result.msg || "Langkah tidak valid",
          "Giliran kamu"
        );
        if (img) {
          return {
            buttons: CHESS_BTNS,
            media: {
              kind: "image" as const,
              buffer: img,
              mimetype: "image/png",
              caption: `⚠️ ${result.msg}`,
            },
          };
        }
        return { text: `⚠️ ${result.msg}\n` + chessRender(data.board, data.turn), buttons: CHESS_BTNS };
      }
      data.history.push(from + to);
      data.selected = null;
      data.targets = [];
      data.turn = "b";
      chessBotMove(data.board);
      data.turn = "w";
      setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "chess2", data, startedAt: Date.now() });
      const img = await chessBoardImage(
        data.board,
        "w",
        null,
        [],
        [`Gerak: ${from}${to}`, "Giliran kamu lagi"],
        "Pilih bidak putih terlebih dahulu.",
        "Giliran kamu"
      );
      if (img) {
        return {
          buttons: CHESS_BTNS,
          media: {
            kind: "image" as const,
            buffer: img,
            mimetype: "image/png",
            caption: `♟️ Gerak *${from}${to}* · Bot sudah balas\nGiliran kamu — Putih`,
          },
        };
      }
      return { text: chessRender(data.board, "w"), buttons: CHESS_BTNS };
    }

    // Select origin square
    const piece = (() => {
      const p = parseSquare(sq);
      return p ? data.board[p.r][p.c] : null;
    })();
    if (!piece || piece !== piece.toUpperCase()) {
      const img = await chessBoardImage(data.board, data.turn, null, [], undefined, "Pilih bidak putih yang valid.", "Giliran kamu");
      if (img) {
        return {
          buttons: CHESS_BTNS,
          media: {
            kind: "image" as const,
            buffer: img,
            mimetype: "image/png",
            caption: `⚠️ Tidak ada bidak putih di *${sq}*`,
          },
        };
      }
      return { text: `⚠️ Tidak ada bidak putih di ${sq}`, buttons: CHESS_BTNS };
    }
    const targets = chessLegalTargets(data.board, sq, "w");
    data.selected = sq;
    data.targets = targets;
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "chess2", data, startedAt: Date.now() });
    const img = await chessBoardImage(
      data.board,
      "w",
      sq,
      targets,
      undefined,
      targets.length ? `${targets.length} langkah tersedia.` : "Tidak ada langkah legal.",
      "Giliran kamu"
    );
    const targetList =
      targets.length > 0
        ? {
            title: `♟️ Dari ${sq.toUpperCase()}`,
            buttonText: "Pilih Tujuan",
            footer: "WATER AI · CHESS LIVE",
            sections: [
              {
                title: `${targets.length} langkah legal`,
                rows: targets.slice(0, 10).map((t) => ({
                  id: `CHESS_TO_${t}`,
                  title: t.toUpperCase(),
                  description: `Gerakkan ${sq.toUpperCase()} → ${t.toUpperCase()}`,
                })),
              },
            ],
          }
        : undefined;

    if (img) {
      return {
        text:
          `Kotak *${sq}* dipilih\n` +
          (targets.length
            ? `${targets.length} langkah tersedia.\nTekan *Pilih Tujuan* di bawah.`
            : "Tidak ada langkah tersedia."),
        buttons: CHESS_BTNS,
        list: targetList,
        media: {
          kind: "image" as const,
          buffer: img,
          mimetype: "image/png",
          caption:
            `Kotak *${sq}* dipilih\n` +
            (targets.length
              ? `${targets.length} langkah tersedia.\nTekan *Pilih Tujuan* 👇`
              : "Tidak ada langkah tersedia."),
        },
      };
    }
    return {
      text: `Kotak ${sq} dipilih · ${targets.length} langkah tersedia`,
      buttons: CHESS_BTNS,
      list: targetList,
    };
  }

  // Full move e2e4
  const m = arg.replace(/\s+/g, "").match(/^([a-h][1-8])([a-h][1-8])$/i);
  if (!m) {
    const img = await chessBoardImage(data.board, data.turn, data.selected || null, data.targets || []);
    if (img) {
      return {
        buttons: CHESS_BTNS,
        media: {
          kind: "image" as const,
          buffer: img,
          mimetype: "image/png",
          caption: "Format: *.chess2 e2* lalu *.chess2 e4*  atau  *.chess2 e2e4*",
        },
      };
    }
    return {
      text: "Format gerak: *.chess2 e2e4*\n" + chessRender(data.board, data.turn),
      buttons: CHESS_BTNS,
    };
  }

  const result = chessTryMove(data.board, m[1], m[2], data.turn);
  if (!result.ok) {
    const img = await chessBoardImage(data.board, data.turn, m[1], data.targets || [], undefined, result.msg);
    if (img) {
      return {
        buttons: CHESS_BTNS,
        media: {
          kind: "image" as const,
          buffer: img,
          mimetype: "image/png",
          caption: `⚠️ ${result.msg}`,
        },
      };
    }
    return { text: `⚠️ ${result.msg}\n` + chessRender(data.board, data.turn), buttons: CHESS_BTNS };
  }

  data.history.push(m[1] + m[2]);
  data.selected = null;
  data.targets = [];
  data.turn = "b";
  chessBotMove(data.board);
  data.turn = "w";
  setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "chess2", data, startedAt: Date.now() });

  const img = await chessBoardImage(
    data.board,
    "w",
    null,
    [],
    [`Gerak: ${m[1]}${m[2]}`],
    "Pilih bidak putih terlebih dahulu.",
    "Giliran kamu"
  );
  if (img) {
    return {
      buttons: CHESS_BTNS,
      media: {
        kind: "image" as const,
        buffer: img,
        mimetype: "image/png",
        caption: `♟️ Gerak *${m[1]}${m[2]}* · Bot sudah balas\nGiliran kamu — Putih`,
      },
    };
  }
  return { text: chessRender(data.board, "w"), buttons: CHESS_BTNS };
}

export async function answerGame(ctx: CmdCtx, text: string): Promise<CmdResult | null> {
  const g = getGame(ctx.bot.id, ctx.n.remoteJid);
  if (!g) return null;
  const ans = text.trim().toLowerCase();
  const record = (win: boolean) =>
    db
      .insert(gameScores)
      .values({
        botId: ctx.bot.id,
        groupId: ctx.n.remoteJid,
        jid: ctx.n.sender,
        name: (ctx.raw?.pushName as string) ?? ctx.n.sender.split("@")[0],
        wins: win ? 1 : 0,
        total: 1,
      })
      .onConflictDoUpdate({
        target: [gameScores.botId, gameScores.groupId, gameScores.jid],
        set: { wins: sql`"wins" + ${win ? 1 : 0}`, total: sql`"total" + 1` },
      })
      .catch(() => {});

  if (g.kind === "quiz") {
    const letter = ans.slice(0, 1);
    const map: Record<string, string> = {
      a: g.data.options?.[0] ?? "",
      b: g.data.options?.[1] ?? "",
      c: g.data.options?.[2] ?? "",
      d: g.data.options?.[3] ?? "",
    };
    if (!["a", "b", "c", "d"].includes(letter)) return null;
    const picked = map[letter];
    const win = picked === g.data.answer;
    delGame(ctx.bot.id, ctx.n.remoteJid);
    record(win);
    return { text: (win ? "✅ Benar! Skor +1\n" : `❌ Salah. Jawaban: ${g.data.answer}\n`) + "Ketik .quiz untuk main lagi." };
  }
  if (g.kind === "tebakkata") {
    if (ans === "skip") {
      delGame(ctx.bot.id, ctx.n.remoteJid);
      return { text: `⏭️ Skip. Jawabannya: ${g.data.word}` };
    }
    if (ans === g.data.word || ans.includes(g.data.word)) {
      delGame(ctx.bot.id, ctx.n.remoteJid);
      record(true);
      return { text: "✅ Benar! Skor +1. Ketik .tebakkata untuk main lagi." };
    }
    return { text: "❌ Belum tepat, coba lagi! (atau 'skip')" };
  }
  if (g.kind === "tebakgambar") {
    if (ans === "skip") {
      delGame(ctx.bot.id, ctx.n.remoteJid);
      return { text: `⏭️ Skip. Jawabannya: ${g.data.subject}` };
    }
    if (g.data.answers.includes(ans)) {
      delGame(ctx.bot.id, ctx.n.remoteJid);
      record(true);
      return { text: `✅ Benar! ${g.data.subject}. Skor +1.` };
    }
    return { text: "❌ Belum tepat, coba lagi! (atau 'skip')" };
  }
  if (g.kind === "flashcard") {
    if (ans === "next") {
      g.data.idx = (g.data.idx + 1) % g.data.cards.length;
      const card = g.data.cards[g.data.idx];
      return {
        text: box("🗂️ FLASHCARD", [
          `(${g.data.idx + 1}/${g.data.cards.length})`,
          `Istilah : ${card.term}`,
          "Ketik jawaban definisinya, atau 'next' untuk lewat.",
        ]),
      };
    }
    if (ans === "stop") {
      delGame(ctx.bot.id, ctx.n.remoteJid);
      return { text: "🗂️ Flashcard selesai." };
    }
    const card = g.data.cards[g.data.idx];
    const close =
      ans.includes(card.def.toLowerCase().slice(0, 8)) || card.def.toLowerCase().includes(ans) || ans.includes(card.def.toLowerCase());
    if (close) {
      g.data.idx = (g.data.idx + 1) % g.data.cards.length;
      const next = g.data.cards[g.data.idx];
      return {
        text: `✅ Tepat!\n\n${box("🗂️ FLASHCARD", [`(${g.data.idx + 1}/${g.data.cards.length})`, `Istilah : ${next.term}`, "Ketik jawaban, 'next', atau 'stop'."])}`,
      };
    }
    return { text: `❌ Belum. Petunjuk: definisi diawali "${card.def.slice(0, 20)}..."` };
  }
  return null;
}

/* ------------------------- owner-only: logs etc ------------------------- */
export async function logsCmd(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db
    .select()
    .from(logs)
    .where(eq(logs.botId, ctx.bot.id))
    .orderBy(desc(logs.createdAt))
    .limit(10);
  if (!rows.length) return { text: "Log kosong." };
  return {
    text: box("📜 LOG TERBARU", rows.map((l) => `[${new Date(l.createdAt).toLocaleTimeString("id-ID")}] ${l.level}: ${truncate(l.message, 60)}`)),
  };
}

export { isNull, gte };


export async function donasi(ctx: CmdCtx): Promise<CmdResult> {
  return {
    text: box("💎 DONASI", [
      "Support WATER AI CLOUD biar makin kenceng 🚀",
      "",
      "Hubungi owner untuk info donasi:",
      "Telegram: @b1mxzstore",
      "WhatsApp: wa.me/+6283115955196",
      "",
      "Makasih banyak! 🙏",
    ]),
  };
}

/* ========================= TIC-TAC-TOE (interactive) ========================= */

/* ============================== TICTACTOE (premium + multiplayer) ============================== */
type TttCell = "" | "X" | "O";
interface TttState {
  board: TttCell[];
  turn: "X" | "O";
  /** mark owned by the human who started vs AI; in pvp X is host */
  player: "X" | "O";
  scores: { win: number; lose: number; draw: number };
  over: boolean;
  winner: TttCell | "draw" | null;
  smart: boolean;
  mode: "ai" | "pvp";
  playerXJid?: string;
  playerOJid?: string;
  pendingInviteJid?: string;
  hostJid?: string;
  /** chat JID where the host started the invite (group or private) */
  hostChat?: string;
  gameId?: string;
  /** Online multiplayer room credentials used by the Rich HTML client. */
  roomId?: string;
  hostToken?: string;
  guestToken?: string;
}

function tttEmpty(): TttCell[] {
  return ["", "", "", "", "", "", "", "", ""];
}

const tttLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function tttWinner(b: TttCell[]): TttCell | "draw" | null {
  for (const [a, c, d] of tttLines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  if (b.every((x) => x)) return "draw";
  return null;
}

function tttWinCells(b: TttCell[]): number[] {
  for (const line of tttLines) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return line;
  }
  return [];
}

/** Perfect minimax AI */
function tttBestMove(board: TttCell[], ai: TttCell): number {
  const human: TttCell = ai === "X" ? "O" : "X";
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return -1;

  let bestScore = -Infinity;
  let bestMove = empty[0];

  const minimax = (b: TttCell[], maximizing: boolean, depth: number): number => {
    const result = tttWinner(b);
    if (result === ai) return 10 - depth;
    if (result === human) return depth - 10;
    if (result === "draw") return 0;

    const moves = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (maximizing) {
      let score = -Infinity;
      for (const i of moves) {
        b[i] = ai;
        score = Math.max(score, minimax(b, false, depth + 1));
        b[i] = "";
      }
      return score;
    }
    let score = Infinity;
    for (const i of moves) {
      b[i] = human;
      score = Math.min(score, minimax(b, true, depth + 1));
      b[i] = "";
    }
    return score;
  };

  for (const i of empty) {
    const next = board.slice() as TttCell[];
    next[i] = ai;
    const score = minimax(next, false, 0);
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

function tttTag(jid?: string): string {
  if (!jid) return "-";
  const n = String(jid).split("@")[0].split(":")[0];
  return n ? `@${n}` : "-";
}

function tttRenderText(st: TttState): string {
  const modeLabel = st.mode === "pvp" ? "MULTIPLAYER" : "VS AI CERDAS";
  if (st.pendingInviteJid) {
    return (
      `❌ *TIC-TAC-TOE* ⭕ · ${modeLabel}\n` +
      `⏳ Menunggu *${tttTag(st.pendingInviteJid)}* menerima undangan...\n` +
      `Host: ${tttTag(st.hostJid)}\n` +
      `Teman: ketik *.ttt terima* atau *.ttt tolak*`
    );
  }
  const status = st.over
    ? st.winner === "draw"
      ? "🤝 Seri!"
      : st.mode === "pvp"
        ? st.winner === "X"
          ? `🏆 ${tttTag(st.playerXJid)} (X) menang!`
          : `🏆 ${tttTag(st.playerOJid)} (O) menang!`
        : st.winner === st.player
          ? "🏆 Kamu menang!"
          : "🤖 Bot menang!"
    : st.mode === "pvp"
      ? `Giliran: ${st.turn === "X" ? tttTag(st.playerXJid) + " (X)" : tttTag(st.playerOJid) + " (O)"}`
      : `Giliran: ${st.turn === st.player ? "Kamu (" + st.player + ")" : "Bot (" + st.turn + ")"}`;
  return (
    `❌ *TIC-TAC-TOE* ⭕ · ${modeLabel}\n` +
    `${status}\n` +
    `Menang: ${st.scores.win} · Kalah: ${st.scores.lose} · Seri: ${st.scores.draw}`
  );
}

function tttButtons(st: TttState): { id: string; text: string }[] {
  if (st.pendingInviteJid) {
    return [
      { id: "TTT_ACCEPT", text: "✅ Terima" },
      { id: "TTT_REJECT", text: "❌ Tolak" },
      { id: "TTT_RESIGN", text: "🏳️ Batal" },
    ];
  }
  if (st.over) {
    return [
      { id: "TTT_AGAIN", text: "🔄 Main Ulang" },
      { id: "TTT_AI", text: "🤖 VS Bot" },
      { id: "TTT_PVP", text: "👥 Multiplayer" },
      { id: "TTT_RESIGN", text: "🏳️ Tutup" },
    ];
  }
  return [
    { id: "TTT_HINT", text: "💡 Hint" },
    { id: "TTT_AGAIN", text: "🔄 Main Ulang" },
    { id: "TTT_RESIGN", text: "🏳️ Menyerah" },
  ];
}

function tttMoveList(st: TttState) {
  if (st.over || st.pendingInviteJid) return undefined;
  const rows = st.board.map((cell, i) => ({
    id: `TTT_CELL_${i}`,
    title: cell ? `${cell === "X" ? "❌" : "⭕"} Kotak ${i + 1}` : `⬜ Kotak ${i + 1}`,
    description: cell ? "Sudah terisi" : `Tap untuk menaruh ${st.turn}`,
  }));
  return {
    title: "❌ TIC-TAC-TOE ⭕",
    buttonText: "Pilih Kotak",
    footer: "WATER AI · REALTIME · TANPA BUKA BROWSER",
    sections: [{ title: "Papan 1–9 · Tap untuk bermain", rows }],
  };
}

async function tttBoardImage(st: TttState): Promise<Buffer | null> {
  try {
    const { renderTttBoard } = await import("../interactive/render/tttBoard");
    const statusLine = st.pendingInviteJid
      ? `Menunggu ${tttTag(st.pendingInviteJid)}...`
      : st.over
        ? st.winner === "draw"
          ? "SERI"
          : st.winner === "X"
            ? "X MENANG"
            : "O MENANG"
        : st.mode === "pvp"
          ? `Giliran ${st.turn}`
          : `Giliran: ${st.turn === st.player ? "Kamu" : "Bot"} (${st.turn})`;
    return await renderTttBoard({
      board: st.board,
      turn: st.turn,
      mode: st.mode,
      statusLine,
      subtitle:
        st.mode === "pvp"
          ? `X ${tttTag(st.playerXJid)}  vs  O ${tttTag(st.playerOJid || st.pendingInviteJid)}`
          : "Mode AI Cerdas · Minimax",
      scoreLine: `Menang ${st.scores.win} · Kalah ${st.scores.lose} · Seri ${st.scores.draw}`,
      highlight: st.over ? tttWinCells(st.board) : [],
      over: st.over,
    });
  } catch (e) {
    console.error("[TTT] board render failed", e);
    return null;
  }
}

function tttNormalizeInviteTarget(raw: string, ctx: CmdCtx): string | null {
  const mentioned =
    (ctx as any).mentionedJids?.[0] ||
    (ctx as any).n?.mentionedJids?.[0] ||
    null;
  if (mentioned) return String(mentioned);
  // @628xxx or 628xxx or 08xxx
  const m = raw.match(/(?:@)?(\d{8,15})/);
  if (!m) return null;
  let d = m[1];
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (d.startsWith("8") && d.length <= 13) d = "62" + d;
  return `${d}@s.whatsapp.net`;
}

/**
 * Coba HTML live di bubble (sendRichHtml / GenAI) jika library + client WA support.
 * Fallback: gambar papan di bubble.
 */
async function tttResponse(
  ctx: CmdCtx,
  st: TttState,
  extraText?: string
): Promise<CmdResult> {
  const howTo = st.over
    ? "\n\n`.ttt` main lagi · `.ttt multi` undang teman"
    : st.pendingInviteJid
      ? "\n\nTeman: `.ttt terima` / `.ttt tolak`"
      : "\n\nMain di media HTML · atau `.ttt 1`…`9`";
  const caption =
    (extraText ? extraText + "\n\n" : "") + tttRenderText(st) + howTo;

  // LIVE HTML menjadi media utama. Jika Rich HTML gagal/ditolak client,
  // fallback ke PNG interaktif berbasis tombol supaya game tetap terlihat.
  try {
    const { buildTttHtml } = await import("../games/html-board");
    const { sendRichHtmlToChat } = await import("../games/send-rich-html");
    const html = buildTttHtml({
      title: "TIC-TAC-TOE · WATER AI",
      size: 3,
      status: st.over
        ? st.winner === "draw"
          ? "Seri!"
          : `${st.winner} menang!`
        : `Giliran ${st.turn}`,
      mode: st.mode === "pvp" ? "pvp" : "ai",
      board: st.board,
      turn: st.turn,
    });
    const rich = await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, html, {
      title: "Tic-Tac-Toe · WATER AI",
      id: `ttt-${st.gameId || "x"}`,
      source: "water_ai_ttt",
    });
    if (rich.ok) return { handled: true };
    console.error("[TTT] rich html unavailable:", rich.error);
  } catch (e: any) {
    console.error("[TTT] rich html", e?.message || e);
  }

  const img = await tttBoardImage(st);
  if (img) {
    return {
      buttons: tttButtons(st),
      list: tttMoveList(st),
      media: {
        kind: "image" as const,
        buffer: img,
        mimetype: "image/png",
        caption,
      },
    };
  }
  return {
    text: caption,
    buttons: tttButtons(st),
    list: tttMoveList(st),
  };
}

export async function tictactoe(ctx: CmdCtx): Promise<CmdResult> {
  const arg = (ctx.arg || "").trim().toLowerCase();
  const existing = getGame(ctx.bot.id, ctx.n.remoteJid, "tictactoe");
  let st: TttState | null =
    existing?.kind === "tictactoe" ? (existing.data as TttState) : null;

  // Keep html as optional offline pack (not default)
  if (arg === "html" || arg === "web") {
    try {
      const { buildTttHtml } = await import("../games/html-board");
      const html = buildTttHtml({ title: "TIC-TAC-TOE · WATER AI" });
      return {
        text: "📦 Paket HTML offline (opsional). Game utama tetap di bubble chat.",
        media: {
          kind: "document" as const,
          buffer: Buffer.from(html, "utf8"),
          filename: "tictactoe-water-ai.html",
          mimetype: "text/html",
          caption: "TTT HTML offline",
        },
      };
    } catch (e: any) {
      return { text: `❌ ${e?.message ?? e}` };
    }
  }

  const startAi = (playerFirst = true) => {
    const board = tttEmpty();
    const turn: "X" | "O" = playerFirst ? "X" : "O";
    const scores = st?.scores || { win: 0, lose: 0, draw: 0 };
    st = {
      board,
      turn,
      player: "X",
      scores,
      over: false,
      winner: null,
      smart: true,
      mode: "ai",
      playerXJid: ctx.n.sender,
      hostJid: ctx.n.sender,
      gameId: randomUUID(),
    };
    if (!playerFirst) {
      const mv = tttBestMove(board, "O");
      if (mv >= 0) board[mv] = "O";
      st.turn = "X";
    }
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "tictactoe", data: st, startedAt: Date.now() });
  };

  // ---- invite: .ttt undang / invite by phone (private + grup) ----
  const inviteMatch = arg.match(/^(undang|invite|challange|challenge)\s+(.+)$/i);
  if (inviteMatch) {
    const target = tttNormalizeInviteTarget(inviteMatch[2], ctx);
    if (!target) {
      return { text: "Format: `.ttt invite 0812xxxxxxx` atau `.ttt undang 628xxxxxxxxxx`" };
    }
    const targetNum = target.split("@")[0];
    const selfNum = String(ctx.n.sender).split("@")[0].split(":")[0];
    if (targetNum === selfNum) return { text: "❌ Tidak bisa mengundang diri sendiri." };

    const gameId = randomUUID();
    const onlineRoom = createRoom("ttt", ctx.n.sender, createTttState({ isAi: false, playerX: ctx.n.sender }));
    const invited = inviteGuest(onlineRoom.id, target.split("@")[0]);
    if (!invited.ok || !invited.room) return { text: `❌ ${invited.error || "Gagal membuat room online"}` };
    st = {
      board: tttEmpty(),
      turn: "X",
      player: "X",
      scores: st?.scores || { win: 0, lose: 0, draw: 0 },
      over: false,
      winner: null,
      smart: false,
      mode: "pvp",
      playerXJid: ctx.n.sender,
      pendingInviteJid: target,
      hostJid: ctx.n.sender,
      hostChat: ctx.n.remoteJid,
      gameId,
      roomId: onlineRoom.id,
      hostToken: onlineRoom.hostToken,
      guestToken: onlineRoom.guestToken,
    };
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "tictactoe", data: st, startedAt: Date.now() });
    setGame(ctx.bot.id, target, { kind: "tictactoe", data: { ...st }, startedAt: Date.now() });

    try {
      const { buildTttHtml, attachOnlineGameHtml } = await import("../games/html-board");
      const { sendRichHtmlToChat } = await import("../games/send-rich-html");
      const html = attachOnlineGameHtml(
        buildTttHtml({ title: "UNDANGAN TTT · WATER AI", mode: "pvp" }),
        { kind: "ttt", roomId: onlineRoom.id, token: onlineRoom.guestToken!, side: "guest", apiBase: `${APP_URL}/api/games` },
      );
      const sent = await sendRichHtmlToChat(ctx.sock, target, html, {
        title: "🎮 Undangan TTT Online",
        id: `ttt-inv-${gameId.slice(0, 8)}`,
        source: "water_ai_ttt_invite",
      });
      if (!sent.ok) {
        await ctx.sock.sendMessage(target, { text: `🎮 Undangan Tic-Tac-Toe Online\n\nDari: ${selfNum}\nKetik *.ttt terima* untuk bergabung.\n\nMedia HTML gagal dikirim: ${sent.error || "client tidak mendukung Rich HTML"}` });
      }
    } catch (e: any) {
      console.error("[ttt invite]", e?.message || e);
    }

    return {
      text:
        `🎮 *UNDANGAN TERKIRIM*\n\n` +
        `Host (X): kamu\nLawan (O): ${targetNum}\nKode: ${gameId.slice(0, 8)}\n\n` +
        `Media HTML undangan dikirim ke nomor lawan.\n` +
        `Lawan ketik *.ttt terima* untuk mulai (real-time lewat bot).`,
    };
  }

  if (arg === "terima" || arg === "accept" || arg === "ya") {
    if (!st?.pendingInviteJid) return { text: "Tidak ada undangan aktif." };
    const inv = String(st.pendingInviteJid).split("@")[0].split(":")[0];
    const me = String(ctx.n.sender).split("@")[0].split(":")[0];
    if (inv !== me) return { text: "⛔ Undangan ini bukan untuk kamu." };
    st.playerOJid = ctx.n.sender;
    st.pendingInviteJid = undefined;
    st.mode = "pvp";
    st.turn = "X";
    const onlineRoom = st.roomId ? getRoom(st.roomId) : null;
    if (!onlineRoom) return { text: "❌ Room online sudah tidak tersedia. Buat undangan baru." };
    const accepted = acceptRoom(onlineRoom.id, ctx.n.sender);
    if (!accepted.ok || !accepted.room?.guestToken) return { text: "❌ Gagal mengaktifkan room online." };
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "tictactoe", data: st, startedAt: Date.now() });
    try {
      const { buildTttHtml, attachOnlineGameHtml } = await import("../games/html-board");
      const { sendRichHtmlToChat } = await import("../games/send-rich-html");
      const baseHtml = buildTttHtml({ title: "TIC-TAC-TOE ONLINE · WATER AI", mode: "pvp" });
      const hostHtml = attachOnlineGameHtml(baseHtml, { kind: "ttt", roomId: accepted.room.id, token: accepted.room.hostToken, side: "host", apiBase: `${APP_URL}/api/games` });
      const guestHtml = attachOnlineGameHtml(baseHtml, { kind: "ttt", roomId: accepted.room.id, token: accepted.room.guestToken, side: "guest", apiBase: `${APP_URL}/api/games` });
      await sendRichHtmlToChat(ctx.sock, st.hostChat || ctx.n.remoteJid, hostHtml, { title: "🎮 Tic-Tac-Toe Online", id: `ttt-on-host-${Date.now().toString(36)}`, source: "water_ai_ttt" });
      await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, guestHtml, { title: "🎮 Tic-Tac-Toe Online", id: `ttt-on-guest-${Date.now().toString(36)}`, source: "water_ai_ttt" });
      return { text: `✅ ${tttTag(ctx.n.sender)} bergabung sebagai *O*!\n${tttTag(st.playerXJid)} (X) mulai dulu.\n\n🎮 Media HTML online sudah dikirim ke kedua HP. Tap kotak di media untuk bermain real-time.` };
    } catch (e:any) {
      return { text: `⚠️ ${tttTag(ctx.n.sender)} bergabung, tetapi media HTML online gagal dikirim: ${e?.message || e}` };
    }
  }

  if (arg === "tolak" || arg === "reject" || arg === "no") {
    if (!st?.pendingInviteJid) return { text: "Tidak ada undangan aktif." };
    const inv = String(st.pendingInviteJid).split("@")[0].split(":")[0];
    const me = String(ctx.n.sender).split("@")[0].split(":")[0];
    const host = String(st.hostJid || "").split("@")[0].split(":")[0];
    if (inv !== me && host !== me) return { text: "⛔ Hanya penerima undangan / host yang bisa menolak." };
    delGame(ctx.bot.id, ctx.n.remoteJid, "tictactoe");
    return { text: "❌ Undangan dibatalkan. Ketik *.ttt* untuk main vs bot." };
  }

  if (arg === "multi" || arg === "pvp" || arg === "teman") {
    return {
      text:
        "👥 *Mode Multiplayer Tic-Tac-Toe*\n\n" +
        "Di **grup**, undang teman:\n" +
        "• `.ttt undang @628xxx`\n" +
        "• `.ttt undang 628xxxxxxxxxx`\n\n" +
        "Teman: `.ttt terima`\n" +
        "Main: `.ttt 1` … `.ttt 9`\n" +
        "Papan di-update live di bubble chat (gambar, tanpa tombol).",
    };
  }

  // Ownership: only active players may move
  const isPlayer = (jid: string) => {
    if (!st) return true;
    if (st.mode === "ai") return !st.playerXJid || st.playerXJid === jid || String(st.playerXJid).split("@")[0] === String(jid).split("@")[0].split(":")[0];
    const a = String(jid).split("@")[0].split(":")[0];
    const x = String(st.playerXJid || "").split("@")[0].split(":")[0];
    const o = String(st.playerOJid || "").split("@")[0].split(":")[0];
    return a === x || a === o;
  };

  if (st && !st.pendingInviteJid && !st.over && !isPlayer(ctx.n.sender) && !["new", "ulang", "again", "first", "pertama", "ai", "bot"].includes(arg)) {
    return { text: "⛔ Game ini sedang dimainkan pemain lain. Ketik *.ttt new* untuk game baru (host)." };
  }

  if (!st || arg === "new" || arg === "ulang" || arg === "again" || arg === "ai" || arg === "bot") {
    startAi(true);
  } else if (arg === "first" || arg === "pertama") {
    startAi(true);
  } else if (arg === "resign" || arg === "nyerah") {
    delGame(ctx.bot.id, ctx.n.remoteJid, "tictactoe");
    return { text: "🏳️ Tic-Tac-Toe dibatalkan. Ketik *.ttt* untuk main lagi." };
  } else if (/^[1-9]$/.test(arg) && st && !st.over && !st.pendingInviteJid) {
    const idx = parseInt(arg, 10) - 1;
    if (st.board[idx]) {
      return tttResponse(ctx, st, "⚠️ Kotak sudah terisi.");
    }
    // Whose turn?
    if (st.mode === "pvp") {
      const me = String(ctx.n.sender).split("@")[0].split(":")[0];
      const expected =
        st.turn === "X"
          ? String(st.playerXJid || "").split("@")[0].split(":")[0]
          : String(st.playerOJid || "").split("@")[0].split(":")[0];
      if (me !== expected) {
        return tttResponse(ctx, st, "⏳ Bukan giliranmu.");
      }
      st.board[idx] = st.turn;
      const w = tttWinner(st.board);
      if (w) {
        st.over = true;
        st.winner = w;
        if (w === "draw") st.scores.draw++;
        else if (w === "X") st.scores.win++;
        else st.scores.lose++;
      } else {
        st.turn = st.turn === "X" ? "O" : "X";
      }
    } else {
      // AI mode
      if (st.turn !== st.player) {
        return tttResponse(ctx, st, "⏳ Tunggu giliran bot...");
      }
      st.board[idx] = st.player;
      let w = tttWinner(st.board);
      if (w) {
        st.over = true;
        st.winner = w;
        if (w === "draw") st.scores.draw++;
        else if (w === st.player) st.scores.win++;
        else st.scores.lose++;
      } else {
        st.turn = st.player === "X" ? "O" : "X";
        const aiMark: TttCell = st.player === "X" ? "O" : "X";
        const mv = st.smart ? tttBestMove(st.board, aiMark) : st.board.findIndex((c) => !c);
        if (mv >= 0) st.board[mv] = aiMark;
        w = tttWinner(st.board);
        if (w) {
          st.over = true;
          st.winner = w;
          if (w === "draw") st.scores.draw++;
          else if (w === st.player) st.scores.win++;
          else st.scores.lose++;
        } else {
          st.turn = st.player;
        }
      }
    }
    setGame(ctx.bot.id, ctx.n.remoteJid, { kind: "tictactoe", data: st, startedAt: Date.now() });
  } else if (arg === "hint" && st && !st.over) {
    const mv = tttBestMove(st.board, st.turn) + 1;
    return tttResponse(ctx, st, `💡 Hint: coba kotak *${mv}*`);
  } else if (st && !st.over && arg && !/^[1-9]$/.test(arg)) {
    return tttResponse(ctx, st, "Pilih kotak lewat tombol/list di bawah.");
  }

  if (!st) startAi(true);
  return tttResponse(ctx, st!);
}

export const ttt = tictactoe;
export const tictac = tictactoe;

/* ============================== ALL GAMES (Poki-style hub) ============================== */
export async function allgames(ctx: CmdCtx): Promise<CmdResult> {
  const arg = (ctx.arg || "").trim().toLowerCase();

  // Optional: send as downloadable HTML document
  if (arg === "html" || arg === "file" || arg === "doc") {
    try {
      const { buildAllGamesHtml } = await import("../games/html-board");
      const html = buildAllGamesHtml({ title: "ALL GAMES · WATER AI" });
      return {
        text: "📦 Paket HTML All Games (katalog Poki + mini-game offline).",
        media: {
          kind: "document" as const,
          buffer: Buffer.from(html, "utf8"),
          filename: "allgames-water-ai.html",
          mimetype: "text/html",
          caption: "ALL GAMES · Poki catalog + playable mini-games",
        },
      };
    } catch (e: any) {
      return { text: `❌ Gagal membuat HTML: ${e?.message ?? e}` };
    }
  }

  try {
    const { buildAllGamesHtml } = await import("../games/html-board");
    const { sendRichHtmlToChat } = await import("../games/send-rich-html");
    const html = buildAllGamesHtml({ title: "ALL GAMES · WATER AI" });
    const sent = await sendRichHtmlToChat(ctx.sock, ctx.n.remoteJid, html, {
      title: "All Games · WATER AI",
      id: `allgames-${randomUUID()}`,
      source: "water_ai_allgames",
    });
    if (sent.ok) return { handled: true };
    console.error("[ALLGAMES] rich html failed", sent.error || "unknown");
    // Fallback: document attachment
    return {
      text: "🎮 *ALL GAMES* — katalog Poki + mini-game offline.\nBuka file HTML di bawah untuk main.",
      media: {
        kind: "document" as const,
        buffer: Buffer.from(html, "utf8"),
        filename: "allgames-water-ai.html",
        mimetype: "text/html",
        caption: "ALL GAMES · WATER AI × Poki style",
      },
    };
  } catch (e: any) {
    console.error("[ALLGAMES]", e?.message || e);
    return { text: `❌ All Games gagal dikirim: ${String(e?.message || e).slice(0, 180)}` };
  }
}

export const allgame = allgames;
export const games = allgames;
export const pokigames = allgames;
