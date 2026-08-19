/* INFORMATION + TOOLS + PREMIUM + FUN — all real implementations. */
import { randomUUID, createHash } from "crypto";
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
  buildMenu,
  box,
  truncate,
  BOT_VERSION,
  isPremium,
  todayUsed,
} from "./core";
import { getGame, delGame, setGame } from "./state";

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
export async function menu(ctx: CmdCtx): Promise<CmdResult> {
  const rows = await db
    .select({ name: commands.name, category: commands.category })
    .from(commands)
    .where(and(eq(commands.botId, ctx.bot.id), eq(commands.enabled, true)));
  const owners = await db.select({ phone: botOwners.phone }).from(botOwners).where(eq(botOwners.botId, ctx.bot.id));
  const name = (ctx.raw?.pushName as string) || "user";
  return { text: buildMenu(ctx.bot, name, rows, [ctx.bot.ownerNumber ?? "", ...owners.map((o) => o.phone)].filter(Boolean)) };
}

export async function help(): Promise<CmdResult> {
  const p = "";
  return {
    text: box("📖 HELP", [
      `Ketik ${p}.menu untuk lihat semua command.`,
      "Contoh: .play faded, .weather jawa barat, .math 2+2*10",
      "Reply gambar dengan .sticker untuk buat sticker.",
      ".help <command> untuk detail singkat.",
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
    // eslint-disable-next-line no-new-func
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
