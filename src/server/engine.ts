import fs from "fs";
import path from "path";
import { eq, and, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "@sairidev/baileys-new";
import { db } from "@/db";
import {
  bots,
  whatsappSessions,
  messages,
  commands,
  automations,
  groupSettings,
  groupWarnings,
  botOwners,
  banlist,
} from "@/db/schema";
type BotRow = typeof bots.$inferSelect;
type AutomationRow = typeof automations.$inferSelect;
import { ApiError, addLog, notify, getSetting } from "./lib";
import { ssePublish, startSse } from "./sse";
import { dispatchWebhook } from "./webhooks";
import { runCommand, answerGame } from "./commands";
import { REGISTRY } from "./commands/registry";
import { consumeLimit, type CmdCtx } from "./commands/core";
import { checkFlood } from "./commands/state";

/* ============================== state ============================== */
interface RunningBot {
  botId: string;
  userId: string;
  sock: any;
  authState: any;
  startedAt: number;
  onlineSince: number | null;
  retries: number;
  stopping: boolean;
  timers: { reconnect?: any; uptime?: any };
}

const running = new Map<string, RunningBot>();
let booted = false;

const storageRoot = path.resolve(process.env.STORAGE_CONFIG || path.join(process.cwd(), "data"));
const dataDirFor = (botId: string) => path.join(storageRoot, "bots", botId);

export function isEngineRunning(botId: string) {
  return running.has(botId) && !!running.get(botId)?.sock;
}
export function engineRunningCount() {
  return running.size;
}

/* ============================ status utils =========================== */
async function setBotStatus(botId: string, status: string, extra: any = {}) {
  await db.update(bots).set({ status, ...extra }).where(eq(bots.id, botId));
  ssePublish("bot:status", { botId, status, at: Date.now() });
}

async function setWaStatus(botId: string, status: string, extra: any = {}) {
  const existing = await db
    .select({ id: whatsappSessions.id })
    .from(whatsappSessions)
    .where(eq(whatsappSessions.botId, botId))
    .limit(1);
  if (existing.length) {
    await db
      .update(whatsappSessions)
      .set({ status, ...extra })
      .where(eq(whatsappSessions.botId, botId));
  } else {
    await db
      .insert(whatsappSessions)
      .values({ botId, status, ...extra });
  }
  ssePublish("wa:status", { botId, status, at: Date.now() });
}

async function getBotRow(botId: string) {
  const rows = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  return rows[0] ?? null;
}

/* ============================ socket setup =========================== */
async function attachSocket(rb: RunningBot) {
  const dataDir = dataDirFor(rb.botId);
  fs.mkdirSync(dataDir, { recursive: true });
  // Baileys memberi nama fungsi ini useMultiFileAuthState, tetapi ini API backend
  // yang tidak terkait React Hooks.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(dataDir);
  rb.authState = state;
  const sock = makeWASocket({
    auth: state,
    // Platform identity: Ubuntu + Chrome + 22.04 (WA multi-device)
    // Koneksi tetap WebSocket Baileys; QR & pairing code tidak diubah.
    browser: ["Ubuntu", "Chrome", "22.04"] as any,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    logger: pino({ level: "silent" }) as any,
  });
  rb.sock = sock;

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("creds.update", (c: any) => {
    const id = c?.me?.id;
    if (id) {
      setWaStatus(rb.botId, "connecting", {
        jid: id,
        phoneNumber: String(id).split("@")[0],
      }).catch(() => {});
    }
  });

  sock.ev.on("connection.update", async (u: any) => {
    const { connection, qr, lastDisconnect } = u;
    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { width: 560 });
        await setWaStatus(rb.botId, "waiting", {
          qrDataUrl: dataUrl,
          lastQrAt: new Date(),
        });
      } catch {
        /* qr render failed */
      }
    }
    if (connection === "open") {
      rb.retries = 0;
      rb.onlineSince = Date.now();
      const bot = await getBotRow(rb.botId);
      const sockUser: any = (sock as any).user;
      const phone = sockUser?.id ? String(sockUser.id).split("@")[0] : null;
      await db
        .update(bots)
        .set({ whatsappNumber: phone, status: "online", startedAt: new Date() })
        .where(eq(bots.id, rb.botId));
      ssePublish("bot:status", { botId: rb.botId, status: "online", at: Date.now() });
      await setWaStatus(rb.botId, "connected", {
        lastConnectedAt: new Date(),
        qrDataUrl: null,
        platform: sockUser?.name ?? null,
      });
      await addLog({
        userId: rb.userId,
        botId: rb.botId,
        level: "success",
        event: "bot.connected",
        message: `WhatsApp terhubung${phone ? ` ke ${phone}` : ""}`,
        status: "connected",
      });
      if (bot) {
        notify(rb.userId, "bot.connected", `Bot ${bot.name} online`, "WhatsApp terhubung dengan sukses.");
        dispatchWebhook(rb.userId, "bot.connected", { botId: rb.botId, name: bot.name, phoneNumber: phone });
      }
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode as number | undefined;
      rb.onlineSince = null;
      if (rb.stopping) return; // stopBot() manages the final state
      if (code === DisconnectReason.loggedOut) {
        await setBotStatus(rb.botId, "offline");
        await setWaStatus(rb.botId, "disconnected", { qrDataUrl: null });
        const bot = await getBotRow(rb.botId);
        await addLog({
          userId: rb.userId,
          botId: rb.botId,
          level: "warning",
          event: "bot.loggedout",
          message: "Sesi WhatsApp keluar (logged out). Hubungkan ulang.",
          status: "disconnected",
        });
        notify(rb.userId, "bot.disconnected", `Bot ${bot?.name ?? ""} terputus`, "Sesi WhatsApp logged out. Scan QR atau gunakan pairing code untuk menghubungkan ulang.");
        dispatchWebhook(rb.userId, "bot.disconnected", { botId: rb.botId, reason: "loggedOut" });
      } else {
        scheduleReconnect(rb, code);
      }
    }
  });

  sock.ev.on("messages.upsert", async (upsert: any) => {
    if (upsert.type !== "notify") return;
    const bot = await getBotRow(rb.botId);
    if (!bot) return;
    for (const m of upsert.messages || []) {
      try {
        await handleIncoming(rb, bot, m);
      } catch (e: any) {
        await addLog({
          userId: rb.userId,
          botId: rb.botId,
          level: "error",
          event: "message.error",
          message: `Gagal memproses pesan: ${e?.message ?? e}`,
        });
      }
    }
  });
}

function scheduleReconnect(rb: RunningBot, code?: number) {
  rb.retries += 1;
  const bot = getBotRow(rb.botId);
  if (rb.retries > 8) {
    setBotStatus(rb.botId, "error").catch(() => {});
    setWaStatus(rb.botId, "disconnected", { qrDataUrl: null }).catch(() => {});
    addLog({
      userId: rb.userId,
      botId: rb.botId,
      level: "error",
      event: "bot.reconnect_failed",
      message: "Reconnect gagal 8 kali. Bot dalam status ERROR. Restart manual diperlukan.",
      status: "error",
    }).catch(() => {});
    notify(rb.userId, "bot.error", "Bot butuh perhatian", "Reconnect gagal berkali-kali. Silakan restart bot.").catch(() => {});
    dispatchWebhook(rb.userId, "bot.disconnected", { botId: rb.botId, reason: "reconnectFailed" }).catch(() => {});
    return;
  }
  setBotStatus(rb.botId, "reconnecting").catch(() => {});
  setWaStatus(rb.botId, "reconnecting").catch(() => {});
  const delay = Math.min(60000, 1500 * 2 ** rb.retries);
  addLog({
    userId: rb.userId,
    botId: rb.botId,
    level: "warning",
    event: "bot.reconnecting",
    message: `Koneksi terputus (code ${code ?? "?"}). Retry ${rb.retries} dalam ${Math.round(delay / 1000)}s`,
    status: "reconnecting",
  }).catch(() => {});
  rb.timers.reconnect = setTimeout(async () => {
    try {
      await attachSocket(rb);
    } catch (e: any) {
      await setBotStatus(rb.botId, "error");
      await addLog({
        userId: rb.userId,
        botId: rb.botId,
        level: "error",
        event: "bot.reconnect_error",
        message: `Reconnect error: ${e?.message ?? e}`,
      });
    }
  }, delay);
}

/* ============================== lifecycle ============================ */
export async function startBot(bot: {
  id: string;
  userId: string;
  name: string;
  prefix?: string;
  ownerNumber?: string | null;
  settings?: any;
}) {
  if (running.has(bot.id)) return { started: false, already: true as const };
  const rb: RunningBot = {
    botId: bot.id,
    userId: bot.userId,
    sock: null,
    authState: null,
    startedAt: Date.now(),
    onlineSince: null,
    retries: 0,
    stopping: false,
    timers: {},
  };
  running.set(bot.id, rb);
  await setBotStatus(bot.id, "connecting");
  await setWaStatus(bot.id, "connecting");

  // Sync / ensure all REGISTRY commands exist for this bot so commands always respond.
  // The schema historically has no unique (botId, name) constraint, so do an
  // explicit existence check instead of relying on ON CONFLICT (which would not
  // protect this table and could duplicate commands on every reconnect).
  try {
    const existingRows = await db
      .select({ name: commands.name })
      .from(commands)
      .where(eq(commands.botId, bot.id));
    const existing = new Set(existingRows.map((row) => row.name.toLowerCase()));
    for (const c of REGISTRY) {
      if (existing.has(c.name.toLowerCase())) continue;
      await db.insert(commands).values({
        botId: bot.id,
        userId: bot.userId,
        name: c.name,
        description: c.description,
        category: c.category,
        handler: c.handler,
        permissions: c.permissions,
        premium: !!c.premium,
      });
      existing.add(c.name.toLowerCase());
    }
  } catch (e: any) {
    await addLog({
      userId: bot.userId,
      botId: bot.id,
      level: "error",
      event: "commands.sync_failed",
      message: `Sinkronisasi command gagal: ${e?.message ?? e}`,
    }).catch(() => {});
  }
  await addLog({
    userId: bot.userId,
    botId: bot.id,
    level: "info",
    event: "bot.starting",
    message: `Memulai engine untuk bot ${bot.name}`,
  });
  dispatchWebhook(bot.userId, "bot.started", { botId: bot.id, name: bot.name });
  try {
    await attachSocket(rb);
    return { started: true as const, already: false as const };
  } catch (e: any) {
    running.delete(bot.id);
    await setBotStatus(bot.id, "error");
    await addLog({
      userId: bot.userId,
      botId: bot.id,
      level: "error",
      event: "bot.start_failed",
      message: `Gagal memulai engine: ${e?.message ?? e}`,
    });
    throw new ApiError("BOT_START_FAILED", 500, `Gagal memulai bot: ${e?.message ?? "unknown"}`);
  }
}

export async function stopBot(botId: string, reason = "stopped") {
  const rb = running.get(botId);
  const bot = await getBotRow(botId);
  if (rb) {
    rb.stopping = true;
    clearTimeout(rb.timers.reconnect);
    try {
      rb.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    running.delete(botId);
  }
  await setBotStatus(botId, "offline", { startedAt: null });
  await setWaStatus(botId, "disconnected", { qrDataUrl: null });
  if (bot) {
    await addLog({
      userId: bot.userId,
      botId,
      level: "info",
      event: "bot.stopped",
      message: `Bot dihentikan (${reason})`,
      status: "offline",
    });
    dispatchWebhook(bot.userId, "bot.stopped", { botId, name: bot.name, reason });
  }
}

export async function restartBot(botId: string) {
  const bot = await getBotRow(botId);
  if (!bot) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
  await stopBot(botId, "restart");
  await startBot(bot);
  return { ok: true };
}

export async function reconnectBot(botId: string) {
  const rb = running.get(botId);
  if (rb?.sock && !rb.stopping) {
    // force close -> close handler schedules a reconnect with backoff
    try {
      rb.sock.end(undefined);
    } catch {
      /* ignore */
    }
    return { ok: true, mode: "reconnecting" as const };
  }
  const bot = await getBotRow(botId);
  if (!bot) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
  await startBot(bot);
  return { ok: true, mode: "started" as const };
}

/** Real WhatsApp logout: stops the engine and wipes stored credentials. */
export async function waLogout(botId: string) {
  const bot = await getBotRow(botId);
  await stopBot(botId, "logout");
  const dir = dataDirFor(botId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  await setWaStatus(botId, "disconnected", {
    phoneNumber: null,
    jid: null,
    lastPairingCode: null,
    qrDataUrl: null,
  });
  await db
    .update(bots)
    .set({ whatsappNumber: null })
    .where(eq(bots.id, botId));
  if (bot) {
    await addLog({
      userId: bot.userId,
      botId,
      level: "warning",
      event: "whatsapp.logout",
      message: "Sesi WhatsApp di-logout. Kredensial dihapus.",
    });
  }
}

export async function requestPairing(botId: string, phone: string) {
  let rb = running.get(botId);
  if (!rb?.sock) {
    const bot = await getBotRow(botId);
    if (!bot) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
    await startBot(bot);
    rb = running.get(botId);
    for (let i = 0; i < 20; i++) {
      if (rb?.sock) break;
      await new Promise((r) => setTimeout(r, 500));
      rb = running.get(botId);
    }
  }
  if (!rb?.sock)
    throw new ApiError("BOT_OFFLINE", 503, "Bot belum siap terhubung. Coba lagi dalam beberapa detik.");
  const digits = phone.replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(digits)) {
    throw new ApiError("INVALID_PHONE", 400, "Nomor WhatsApp harus berupa 7–15 digit dalam format internasional, contoh 6281234567890.");
  }
  if (rb.authState?.creds?.registered) {
    throw new ApiError("ALREADY_CONNECTED", 409, "Sesi WhatsApp bot ini sudah terhubung. Logout terlebih dahulu jika ingin menautkan nomor lain.");
  }
  try {
    // Pairing code harus diminta lewat socket WebSocket nyata yang sudah terbuka.
    await Promise.race([
      rb.sock.waitForSocketOpen(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Socket WhatsApp belum terbuka setelah 15 detik.")), 15000)),
    ]);
    const code: string = await rb.sock.requestPairingCode(digits);
    await setWaStatus(botId, "waiting", {
      lastPairingCode: code,
      lastPairingAt: new Date(),
      qrDataUrl: null,
    });
    ssePublish("wa:pairing", { botId, code, at: Date.now() });
    await addLog({
      userId: rb.userId,
      botId,
      level: "info",
      event: "pairing.requested",
      message: `Pairing code asli diterima dari WhatsApp untuk +${digits}`,
    });
    return { requested: true as const, code };
  } catch (e: any) {
    throw new ApiError("PAIRING_FAILED", 400, e?.message ?? "Gagal meminta pairing code");
  }
}

/* ============================== messaging ============================ */
export interface SendPayload {
  to: string;
  type: "text" | "image" | "video" | "audio" | "document" | "location" | "contact";
  text?: string;
  caption?: string;
  url?: string;
  fileName?: string;
  mimetype?: string;
  location?: { latitude: number; longitude: number; label?: string };
  contact?: { name: string; phone: string };
}

async function recordOut(
  rb: RunningBot,
  to: string,
  type: string,
  text: string | null
) {
  await db.insert(messages).values({
    botId: rb.botId,
    userId: rb.userId,
    direction: "out",
    type,
    chatJid: to,
    text: text?.slice(0, 2000) ?? null,
  });
  await db
    .update(bots)
    .set({
      messagesSent: sql`"messages_sent" + 1`,
      lastActivityAt: new Date(),
    })
    .where(eq(bots.id, rb.botId));
  ssePublish("message", { botId: rb.botId, dir: "out", type, text: (text ?? "").slice(0, 120), at: Date.now() });
}

async function fetchMedia(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new ApiError("MEDIA_FETCH_FAILED", 502, `Gagal mengambil media (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Send a message through a running bot. Real Baileys call. */
export async function engineSend(botId: string, p: SendPayload) {
  const rb = running.get(botId);
  if (!rb?.sock)
    throw new ApiError("BOT_OFFLINE", 503, "Bot tidak online. Jalankan bot terlebih dahulu.");
  let content: any;
  try {
    switch (p.type) {
      case "text":
        if (!p.text) throw new ApiError("MISSING_TEXT", 400, "Field `text` wajib diisi.");
        content = { text: p.text };
        break;
      case "image":
      case "video":
      case "audio":
      case "document": {
        if (!p.url) throw new ApiError("MISSING_MEDIA", 400, "Field `url` media wajib diisi.");
        const buf = await fetchMedia(p.url);
        if (p.type === "image") content = { image: buf, caption: p.caption };
        else if (p.type === "video")
          content = { video: buf, caption: p.caption, mimetype: p.mimetype || "video/mp4" };
        else if (p.type === "audio")
          content = { audio: buf, mimetype: p.mimetype || "audio/mpeg", fileName: p.fileName || "audio.mp3" };
        else content = {
          document: buf,
          fileName: p.fileName || "file",
          caption: p.caption,
          mimetype: p.mimetype || "application/octet-stream",
        };
        break;
      }
      case "location":
        if (!p.location) throw new ApiError("MISSING_LOCATION", 400, "Field `location` wajib diisi.");
        content = {
          location: {
            degreesLatitude: p.location.latitude,
            degreesLongitude: p.location.longitude,
            name: p.location.label,
          },
        };
        break;
      case "contact":
        if (!p.contact) throw new ApiError("MISSING_CONTACT", 400, "Field `contact` wajib diisi.");
        content = {
          contacts: {
            displayName: p.contact.name,
            contacts: [
              {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${p.contact.name}\nTEL;type=CELL;waid=${p.contact.phone}:${p.contact.phone}\nEND:VCARD`,
              },
            ],
          },
        };
        break;
      default:
        throw new ApiError("UNSUPPORTED_TYPE", 400, "Jenis pesan tidak didukung.");
    }
  } catch (e) {
    if (e instanceof ApiError) {
      dispatchWebhook(rb.userId, "message.failed", { botId, to: p.to, reason: e.code });
      throw e;
    }
    throw e;
  }

  try {
    await rb.sock.sendMessage(p.to, content);
    const text = p.text ?? p.caption ?? null;
    await recordOut(rb, p.to, p.type, text);
    await addLog({
      userId: rb.userId,
      botId,
      level: "success",
      event: "message.sent",
      message: `${p.type} dikirim ke ${p.to}`,
      status: "sent",
    });
    dispatchWebhook(rb.userId, "message.sent", { botId, to: p.to, type: p.type, text });
    return { ok: true as const };
  } catch (e: any) {
    await addLog({
      userId: rb.userId,
      botId,
      level: "error",
      event: "message.failed",
      message: `Gagal mengirim ${p.type} ke ${p.to}: ${e?.message ?? e}`,
      status: "failed",
    });
    dispatchWebhook(rb.userId, "message.failed", { botId, to: p.to, reason: e?.message ?? "unknown" });
    throw new ApiError("SEND_FAILED", 502, `Gagal mengirim pesan: ${e?.message ?? "unknown"}`);
  }
}

/* ========================== incoming handling ======================== */
interface NormalizedMsg {
  type: string;
  text: string;
  sender: string;
  remoteJid: string;
  isGroup: boolean;
  messageId: string;
}

function unwrapMessage(message: any): any {
  let current = message || {};
  for (let i = 0; i < 8; i++) {
    const next = current?.viewOnceMessage?.message
      ?? current?.viewOnceMessageV2?.message
      ?? current?.viewOnceMessageV2Extension?.message
      ?? current?.ephemeralMessage?.message
      ?? current?.documentWithCaptionMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

/** Extract command text from every Baileys message shape in one place. */
export function extractMessageText(message: any): string {
  const msg = unwrapMessage(message);
  const direct = [
    msg?.conversation,
    msg?.extendedTextMessage?.text,
    msg?.imageMessage?.caption,
    msg?.videoMessage?.caption,
    msg?.documentMessage?.caption,
    msg?.buttonsResponseMessage?.selectedButtonId,
    msg?.listResponseMessage?.singleSelectReply?.selectedRowId,
    msg?.listResponseMessage?.title,
    msg?.templateButtonReplyMessage?.selectedId,
    msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson && (() => { try { const j = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson); return j?.id || j?.selectedId || j?.title; } catch { return null; } })(),
    msg?.interactiveResponseMessage?.body?.text,
    msg?.notificationMessage?.text,
  ];
  const found = direct.find((value) => typeof value === "string" && value.trim());
  if (found) return String(found);
  const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) return extractMessageText(quoted);
  return "";
}

function normalize(m: any): NormalizedMsg | null {
  const key = m?.key;
  const remoteJid: string | undefined = key?.remoteJid;
  if (!remoteJid || remoteJid === "status@broadcast" || key?.fromMe) return null;
  const msg = unwrapMessage(m.message || {});
  const text = extractMessageText(msg);
  const type = msg?.extendedTextMessage ? (msg.extendedTextMessage.contextInfo?.quotedMessage ? "reply" : "text")
    : msg?.imageMessage ? "image"
    : msg?.videoMessage ? "video"
    : msg?.audioMessage ? "audio"
    : msg?.documentMessage ? "document"
    : msg?.stickerMessage ? "sticker"
    : msg?.locationMessage ? "location"
    : msg?.contactMessage ? "contact"
    : msg?.contactsArrayMessage ? "contacts"
    : msg?.reactionMessage ? "reaction"
    : msg?.buttonsResponseMessage ? "button"
    : msg?.listResponseMessage ? "list"
    : msg?.notificationMessage ? "notification"
    : msg?.pollUpdateMessage ? "poll" : "text";
  const isGroup = remoteJid.endsWith("@g.us");
  // WA multi-device / LID: prioritaskan field nomor asli (senderPn, participantPn, *Alt)
  const sender: string =
    key?.senderPn ||
    key?.participantPn ||
    key?.participantAlt ||
    key?.remoteJidAlt ||
    key?.participant ||
    remoteJid;
  return { type, text, sender, remoteJid, isGroup, messageId: key?.id || "" };
}

/** Ambil digit nomor Indonesia-friendly dari JID / LID / teks bebas */
export function normalizePhoneNumber(value: unknown): string {
  let raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  // Buang domain JID dan device suffix (:xx)
  raw = raw.split("@")[0].split(":")[0];
  // Jika masih mengandung non-digit (LID hash dll), ambil digit saja
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  // 08xxxx → 628xxxx
  if (digits.startsWith("0") && digits.length >= 9) digits = `62${digits.slice(1)}`;
  // 8xxxx (tanpa 0/62) → 628xxxx bila panjang masuk akal HP ID
  if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 13 && !digits.startsWith("62")) {
    digits = `62${digits}`;
  }
  return digits;
}

/** Semua bentuk nomor yang mungkin untuk matching owner */
function phoneVariants(value: unknown): string[] {
  const n = normalizePhoneNumber(value);
  if (!n) return [];
  const out = new Set<string>([n]);
  if (n.startsWith("62") && n.length > 2) {
    out.add(n.slice(2)); // tanpa 62
    out.add(`0${n.slice(2)}`); // 08...
  }
  if (n.startsWith("0") && n.length > 1) {
    out.add(`62${n.slice(1)}`);
  }
  return [...out];
}

export function normalizeJid(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.endsWith("@g.us")) return raw;
  const phone = normalizePhoneNumber(raw);
  return phone ? `${phone}@s.whatsapp.net` : raw;
}

export function getSenderNumber(messageOrJid: any): string {
  const key = messageOrJid?.key ?? messageOrJid;
  return normalizePhoneNumber(
    key?.senderPn ||
      key?.participantPn ||
      key?.participantAlt ||
      key?.remoteJidAlt ||
      key?.participant ||
      key?.remoteJid ||
      messageOrJid
  );
}

export function isOwner(senderJid: unknown, ownerNumbers: unknown[]): boolean {
  const senderVars = phoneVariants(senderJid);
  if (!senderVars.length) return false;
  const ownerVars = new Set<string>();
  for (const o of ownerNumbers) {
    for (const v of phoneVariants(o)) ownerVars.add(v);
  }
  return senderVars.some((s) => ownerVars.has(s));
}

function participantIsAdmin(participant: any): boolean {
  return participant?.admin === true || participant?.admin === "admin" || participant?.admin === "superadmin";
}

async function isGroupAdmin(rb: RunningBot, groupId: string, sender: string) {
  try {
    const meta = await rb.sock.groupMetadata(groupId);
    const target = normalizeJid(sender);
    const p = (meta.participants || []).find((x: any) => normalizeJid(x.id) === target);
    return participantIsAdmin(p);
  } catch {
    return false;
  }
}

async function isBotAdmin(rb: RunningBot, groupId: string): Promise<boolean> {
  try {
    const meta = await rb.sock.groupMetadata(groupId);
    const botJid = normalizeJid(rb.sock.user?.id);
    const p = (meta.participants || []).find((x: any) => normalizeJid(x.id) === botJid);
    return participantIsAdmin(p);
  } catch {
    return false;
  }
}

async function resolvePermissions(rb: RunningBot, bot: BotRow, n: NormalizedMsg, ownerRows: { phone: string }[]) {
  // Kumpulkan semua kandidat nomor pengirim dari n.sender (sudah diprioritaskan di normalize)
  const senderVars = phoneVariants(n.sender);
  const configuredOwners = [bot.ownerNumber, ...ownerRows.map((row) => row.phone)].filter(Boolean);
  const ownerVars = new Set<string>();
  for (const o of configuredOwners) {
    for (const v of phoneVariants(o)) ownerVars.add(v);
  }
  const isOwnerUser = senderVars.some((s) => ownerVars.has(s));
  const isGroupAdmin = n.isGroup ? await isGroupAdminForMessage(rb, n.remoteJid, n.sender) : false;
  const isBotAdmin = n.isGroup ? await isBotAdminForGroup(rb, n.remoteJid) : false;
  return { isGroup: n.isGroup, isOwner: isOwnerUser, isGroupAdmin, isBotAdmin };
}

async function isGroupAdminForMessage(rb: RunningBot, groupId: string, sender: string) {
  return isGroupAdmin(rb, groupId, sender);
}

async function isBotAdminForGroup(rb: RunningBot, groupId: string) {
  return isBotAdmin(rb, groupId);
}

async function handleIncoming(rb: RunningBot, bot: BotRow, m: any) {
  const n = normalize(m);
  if (!n) return;
  const t0 = Date.now();

  await db.insert(messages).values({
    botId: bot.id,
    userId: bot.userId,
    direction: "in",
    type: n.type,
    chatJid: n.remoteJid,
    chatName: (m.pushName as string | undefined) ?? null,
    text: n.text.slice(0, 2000) || null,
    meta: { messageId: n.messageId, sender: n.sender, isGroup: n.isGroup },
  });
  await db
    .update(bots)
    .set({
      messagesReceived: sql`"messages_received" + 1`,
      lastActivityAt: new Date(),
    })
    .where(eq(bots.id, bot.id));
  ssePublish("message", { botId: bot.id, dir: "in", type: n.type, text: n.text.slice(0, 120), at: Date.now() });
  dispatchWebhook(bot.userId, "message.received", {
    botId: bot.id,
    chat: n.remoteJid,
    sender: n.sender,
    isGroup: n.isGroup,
    type: n.type,
    text: n.text,
  });

  const prefix = bot.prefix || "!";
  const isCommandLike = n.text.startsWith(prefix);
  const botOwnersRows = (await db
    .select({ phone: botOwners.phone })
    .from(botOwners)
    .where(eq(botOwners.botId, bot.id))
    .catch(() => [])) as { phone: string }[];
  const permissions = await resolvePermissions(rb, bot, n, botOwnersRows);
  const isBotOwner = permissions.isOwner;
  const senderNumber = normalizePhoneNumber(n.sender);

  // bot-level maintenance mode — only owner is answered
  const botSettings = (bot.settings ?? {}) as any;
  if (botSettings.maintenance && !isBotOwner && n.type !== "notification") return;

  // banlist
  if (!isBotOwner) {
    const banRow = await db
      .select({ id: banlist.id })
      .from(banlist)
      .where(and(eq(banlist.botId, bot.id), eq(banlist.jid, n.sender)))
      .limit(1);
    if (banRow.length) return;
  }

  // group security engine (real delete + warn)
  if (n.isGroup && !isBotOwner) {
    const gRows = await db
      .select()
      .from(groupSettings)
      .where(and(eq(groupSettings.botId, bot.id), eq(groupSettings.groupId, n.remoteJid)))
      .limit(1);
    const cfg: any = gRows[0]?.settings ?? {};
    const bl: string[] = Array.isArray(cfg?.blacklist) ? cfg.blacklist : [];
    if (bl.includes(n.sender)) {
      if (cfg?.autodelete) await deleteMsg(rb, n);
      return;
    }
    const needAdmin = cfg?.antilink || cfg?.antibot || cfg?.autodelete;
    const isAdm = needAdmin ? permissions.isGroupAdmin || permissions.isOwner : false;
    if (cfg?.antiflood && ["text", "reply"].includes(n.type) && checkFlood(bot.id, n.remoteJid, n.sender, 8)) {
      await deleteMsg(rb, n);
      await addWarn(rb, bot, n, "flood");
      return;
    }
    if (cfg?.antilink && /https?:\/\//i.test(n.text) && !isAdm) {
      await deleteMsg(rb, n);
      await addWarn(rb, bot, n, "link");
      return;
    }
    if (cfg?.antispam && n.text.length > 12) {
      const caps = (n.text.match(/[A-Z]/g)?.length ?? 0) / Math.max(1, n.text.replace(/\s/g, "").length);
      if (caps > 0.7 && !isAdm) {
        await deleteMsg(rb, n);
        return;
      }
    }
    if (cfg?.antibot && /bot/i.test(String(m.pushName ?? "")) && !isAdm) {
      await deleteMsg(rb, n);
      return;
    }
    if (cfg?.autodelete && n.type === "text" && !isAdm && !isCommandLike) {
      await deleteMsg(rb, n);
      return;
    }
  }

  // pending game answer (plain text while a game is active)
  if (["text", "reply"].includes(n.type) && !isCommandLike) {
    const gctx = makeCmdCtx(rb, bot, m, n, t0, null);
    const gameReply = await answerGame(gctx, n.text).catch(() => null);
    if (gameReply?.media) {
      const mediaBatch = Array.isArray(gameReply.media) ? gameReply.media.slice(0, 12) : [gameReply.media];
      for (const item of mediaBatch) await sendMedia(rb, n.remoteJid, item);
    } else if (gameReply?.text) await sendInternal(rb, n.remoteJid, gameReply.text);
    if (gameReply) return;
  }

  if (isCommandLike) {
    const parts = n.text.slice(prefix.length).trim().split(/\s+/);
    const cmdName = (parts[0] || "").toLowerCase();
    if (cmdName) {
      const cmdRows = await db
        .select()
        .from(commands)
        .where(
          and(
            eq(commands.botId, bot.id),
            eq(commands.name, cmdName),
            eq(commands.enabled, true)
          )
        )
        .limit(1);
      const cmd = cmdRows[0];
      if (cmd) {
        if (cmd.permissions === "owner" && !isBotOwner) {
          const hint = bot.ownerNumber
            ? `Owner terdaftar: +${normalizePhoneNumber(bot.ownerNumber)}. Nomor Anda: +${normalizePhoneNumber(n.sender) || "?"}. Samakan format di Dashboard (62xxxxxxxxxx).`
            : "Owner belum diset di Dashboard → Bots → Owner Number.";
          await sendInternal(rb, n.remoteJid, `⛔ Hanya owner yang bisa memakai command ini.\n${hint}`);
          return;
        }
        if (cmd.permissions === "admin") {
          const okAdmin =
            permissions.isOwner || permissions.isGroupAdmin;
          if (!okAdmin) {
            await sendInternal(rb, n.remoteJid, "⛔ Hanya admin grup / owner bot.");
            return;
          }
        }
        const lim = await consumeLimit(bot.id, n.sender, !!cmd.premium);
        if (!lim.ok) {
          await sendInternal(rb, n.remoteJid, lim.reason ?? "Limit tercapai.");
          return;
        }
        const cmdCtx = makeCmdCtx(rb, bot, m, n, t0, cmd);
        if (cmd.name === "restart") {
          await sendInternal(rb, n.remoteJid, "🔄 Restarting bot engine... (otomatis dalam 2 detik)");
          setTimeout(() => {
            restartBot(bot.id).catch(() => {});
          }, 2000);
          await addLog({ userId: bot.userId, botId: bot.id, level: "warning", event: "command.run", message: `/restart dipanggil oleh ${n.sender}`, status: "ok" });
          return;
        }
        try {
          const result = await runCommand(cmdCtx);
          if (result.media) {
            const mediaBatch = Array.isArray(result.media) ? result.media.slice(0, 12) : [result.media];
            // Satu media + tombol → kirim sebagai pesan interaktif (tombol native)
            if (result.buttons?.length && mediaBatch.length === 1 && (mediaBatch[0].kind === "image" || mediaBatch[0].kind === "video")) {
              await sendInteractive(
                rb,
                n.remoteJid,
                result.text || mediaBatch[0].caption || "",
                result.buttons,
                { kind: mediaBatch[0].kind, buffer: mediaBatch[0].buffer, mimetype: mediaBatch[0].mimetype, caption: mediaBatch[0].caption || result.text }
              );
            } else {
              for (const item of mediaBatch) await sendMedia(rb, n.remoteJid, item);
              if (result.buttons?.length) {
                await sendInteractive(rb, n.remoteJid, result.text || "Pilih menu cepat 👇", result.buttons);
              }
            }
          } else if (result.buttons?.length) {
            await sendInteractive(rb, n.remoteJid, result.text || "", result.buttons);
          } else if (result.text) {
            await sendInternal(rb, n.remoteJid, result.text);
          }
          await addLog({
            userId: bot.userId,
            botId: bot.id,
            level: "success",
            event: "command.run",
            message: `/${cmd.name} dijalankan oleh ${n.sender}`,
            status: "ok",
          });
        } catch (e: any) {
          const em = String(e?.message ?? "");
          await sendInternal(rb, n.remoteJid, /^[⚠❌🥀💎📦⏱]/.test(em) ? em : "🥀 Gagal memproses command. Coba lagi.");
          await addLog({
            userId: bot.userId,
            botId: bot.id,
            level: "error",
            event: "command.error",
            message: `/${cmd.name}: ${em || e}`,
            status: "error",
          });
        }
        await db
          .update(commands)
          .set({ runCount: sql`"run_count" + 1` })
          .where(eq(commands.id, cmd.id))
          .catch(() => {});
        return;
      }
      const available = await db
        .select({ name: commands.name })
        .from(commands)
        .where(and(eq(commands.botId, bot.id), eq(commands.enabled, true)));
      const distance = (a: string, b: string): number => {
        const row = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
          let prev = row[0];
          row[0] = i;
          for (let j = 1; j <= b.length; j++) {
            const saved = row[j];
            row[j] = a[i - 1] === b[j - 1]
              ? prev
              : Math.min(prev + 1, row[j] + 1, row[j - 1] + 1);
            prev = saved;
          }
        }
        return row[b.length];
      };
      const ranked = available
        .map((entry) => ({ name: entry.name, score: distance(cmdName, entry.name) }))
        .sort((a, b) => a.score - b.score)
        .filter((entry) => entry.score <= Math.max(2, Math.ceil(cmdName.length * 0.45)))
        .slice(0, 3);
      if (ranked.length) {
        const suggestionText = `⚠️ *Command tidak ditemukan*\n\n┌─「 *${prefix}${cmdName}* 」\n│ Tidak ada di daftar command.\n│\n│ *Mungkin maksud Anda:*\n${ranked.map((entry) => `│ ◦ *${prefix}${entry.name}*`).join("\n")}\n└──────────────\n\nPilih tombol di bawah atau ketik *${prefix}menu*`;
        await sendInteractive(rb, n.remoteJid, suggestionText, [
          { id: `${prefix}${ranked[0].name}`, text: `✨ ${ranked[0].name}` },
          { id: `${prefix}menu`, text: "📋 MENU" },
          { id: `${prefix}allmenu`, text: "📚 ALLMENU" },
        ]);
      } else {
        await sendInteractive(rb, n.remoteJid, `⚠️ *Command tidak ditemukan*\n\n*${prefix}${cmdName}* tidak ada.\nKetik *${prefix}menu* untuk kategori.`, [
          { id: `${prefix}menu`, text: "📋 MENU" },
          { id: `${prefix}allmenu`, text: "📚 ALLMENU" },
          { id: `${prefix}help`, text: "❓ HELP" },
        ]);
      }
      return;
    }
  }

  if (n.type === "notification") {
    const auto = await db
      .select()
      .from(automations)
      .where(and(eq(automations.botId, bot.id), eq(automations.enabled, true)));
    const lower = n.text.toLowerCase();
    for (const a of auto) {
      if (a.type === "welcome" && lower.includes("invited")) {
        const reply = (a.action?.text || "Halo {user}!").replace(/\{user\}/g, "anggota baru");
        await sendInternal(rb, n.remoteJid, reply);
        await addLog({ userId: bot.userId, botId: bot.id, level: "info", event: "automation.welcome", message: "Pesan sambutan dikirim" });
        return;
      }
      if (a.type === "goodbye" && (lower.includes("removed") || lower.includes("left"))) {
        const reply = (a.action?.text || "Sampai jumpa!").replace(/\{user\}/g, "anggota");
        await sendInternal(rb, n.remoteJid, reply);
        await addLog({ userId: bot.userId, botId: bot.id, level: "info", event: "automation.goodbye", message: "Pesan perpisahan dikirim" });
        return;
      }
    }
    return;
  }

  if (!["text", "reply"].includes(n.type)) return;

  const auto = await db
    .select()
    .from(automations)
    .where(and(eq(automations.botId, bot.id), eq(automations.enabled, true)));

  // Anti-link in groups
  if (n.isGroup) {
    const anti = auto.find((a) => a.type === "antiLink");
    if (anti?.enabled && /https?:\/\//i.test(n.text)) {
      const senderNumber = normalizePhoneNumber(n.sender);
      const isAdmin = permissions.isOwner || permissions.isGroupAdmin;
      if (!isAdmin) {
        await sendInternal(rb, n.remoteJid, anti.action?.text || "Link tidak diperbolehkan di grup ini.");
        await addLog({ userId: bot.userId, botId: bot.id, level: "warning", event: "automation.antilink", message: `Link diblokir dari ${n.sender}` });
        return;
      }
    }
  }

  // Keyword reply
  const lower = n.text.toLowerCase();
  for (const a of auto) {
    if (a.type === "keyword" && a.trigger?.contains) {
      if (lower.includes(String(a.trigger.contains).toLowerCase())) {
        const reply = String(a.action?.text || "").replace(/\{user\}/g, m.pushName || "user");
        if (reply) await sendInternal(rb, n.remoteJid, reply);
        await addLog({ userId: bot.userId, botId: bot.id, level: "info", event: "automation.keyword", message: `Keyword "${a.trigger.contains}" terpicu` });
        return;
      }
    }
  }

  // Auto reply fallback
  const autoReply = auto.find((a) => a.type === "autoReply");
  if (autoReply?.enabled && autoReply.action?.text) {
    const reply = String(autoReply.action.text).replace(/\{user\}/g, m.pushName || "user");
    await sendInternal(rb, n.remoteJid, reply);
    await addLog({ userId: bot.userId, botId: bot.id, level: "info", event: "automation.autoreply", message: "Auto reply dikirim" });
    return;
  }

  // AI reply
  const ai = auto.find((a) => a.type === "aiReply");
  if (ai?.enabled) {
    const reply = await aiRespond(bot, n.text);
    if (reply) {
      await sendInternal(rb, n.remoteJid, reply);
      await addLog({ userId: bot.userId, botId: bot.id, level: "info", event: "automation.ai_reply", message: "AI reply dikirim" });
    }
  }
}

async function sendInteractive(
  rb: RunningBot,
  to: string,
  text: string,
  buttons: { id: string; text: string }[],
  media?: { kind?: string; buffer?: Buffer; mimetype?: string; caption?: string }
) {
  const limited = buttons.slice(0, 3);
  const footer = "WATER AI CLOUD V3.5";
  // Format yang didukung @sairidev/baileys-new / fork interactive
  const simpleButtons = limited.map((b) => ({
    text: b.text.slice(0, 25),
    id: b.id,
  }));
  const legacyButtons = limited.map((b) => ({
    buttonId: b.id,
    buttonText: { displayText: b.text.slice(0, 25) },
    type: 1 as const,
  }));
  const interactiveButtons = limited.map((b) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: b.text.slice(0, 25),
      id: b.id,
    }),
  }));

  // 1) Media + buttons (format fork modern: buttons: [{text,id}])
  if (media?.buffer && (media.kind === "image" || media.kind === "video")) {
    const mediaKey = media.kind === "video" ? "video" : "image";
    const attempts: any[] = [
      {
        [mediaKey]: media.buffer,
        mimetype: media.mimetype,
        caption: media.caption || text,
        footer,
        buttons: simpleButtons,
      },
      {
        [mediaKey]: media.buffer,
        mimetype: media.mimetype,
        caption: media.caption || text,
        footer,
        buttons: legacyButtons,
        headerType: media.kind === "video" ? 4 : 4,
      },
      {
        [mediaKey]: media.buffer,
        mimetype: media.mimetype,
        caption: media.caption || text,
        footer,
        interactiveButtons,
        hasMediaAttachment: true,
      },
    ];
    for (const payload of attempts) {
      try {
        await rb.sock.sendMessage(to, payload);
        await recordOut(rb, to, media.kind || "image", media.caption || text);
        return;
      } catch {
        /* next format */
      }
    }
  }

  // 2) Text + simple buttons (format foto: Menu Utama / Selengkapnya)
  const textAttempts: any[] = [
    { text: text || "Pilih menu", footer, buttons: simpleButtons },
    {
      text: text || "Pilih menu",
      footer,
      title: "💧 WATER AI CLOUD",
      buttons: simpleButtons,
    },
    {
      text: text || "Pilih menu",
      footer,
      interactiveButtons,
    },
    {
      text: text || "Pilih tombol",
      footer,
      buttons: legacyButtons,
      headerType: 1,
    },
    {
      text: text || "Pilih tombol",
      footer,
      templateButtons: limited.map((b, i) => ({
        index: i + 1,
        quickReplyButton: { displayText: b.text.slice(0, 25), id: b.id },
      })),
    },
    {
      text: text || "Pilih menu",
      footer,
      title: "💧 WATER AI CLOUD",
      buttonText: "📋 Buka Menu",
      sections: [
        {
          title: "Navigasi Cepat",
          rows: limited.map((b) => ({
            title: b.text.slice(0, 24),
            rowId: b.id,
            description: `Ketik ${b.id}`,
          })),
        },
      ],
    },
  ];
  for (const payload of textAttempts) {
    try {
      await rb.sock.sendMessage(to, payload);
      await recordOut(rb, to, "text", text);
      return;
    } catch {
      /* next */
    }
  }

  // 3) Fallback teks
  const hints = limited.map((b, i) => `${i + 1}. *${b.text}* → ketik *${b.id}*`).join("\n");
  await sendInternal(
    rb,
    to,
    `${text}\n\n┌─「 *TOMBOL CEPAT* 」\n${hints
      .split("\n")
      .map((l) => "│ " + l)
      .join("\n")}\n└──────────────`
  );
}

async function sendInternal(rb: RunningBot, to: string, text: string) {
  try {
    await rb.sock.sendMessage(to, { text });
    await recordOut(rb, to, "text", text);
  } catch (e: any) {
    await addLog({
      userId: rb.userId,
      botId: rb.botId,
      level: "error",
      event: "message.failed",
      message: `Gagal membalas ke ${to}: ${e?.message ?? e}`,
      status: "failed",
    });
    dispatchWebhook(rb.userId, "message.failed", { botId: rb.botId, to, reason: e?.message ?? "unknown" });
  }
}

/* ------------------------- WATER AI command ctx ------------------------ */
function makeCmdCtx(
  rb: RunningBot,
  bot: BotRow,
  m: any,
  n: NormalizedMsg,
  t0: number,
  cmd: any
): CmdCtx {
  const root = unwrapMessage(m?.message || {});
  const contextInfo = root?.extendedTextMessage?.contextInfo
    ?? root?.imageMessage?.contextInfo
    ?? root?.videoMessage?.contextInfo
    ?? root?.documentMessage?.contextInfo
    ?? root?.audioMessage?.contextInfo
    ?? {};
  const quotedKey = contextInfo?.stanzaId ? {
    remoteJid: n.remoteJid,
    fromMe: false,
    id: contextInfo.stanzaId,
    participant: contextInfo.participant || n.sender,
  } : null;
  const parts = n.text.split(/\s+/).filter(Boolean);
  const quotedText = contextInfo?.quotedMessage ? extractMessageText(contextInfo.quotedMessage).trim() : "";
  const parsedArg = parts.slice(1).join(" ").trim() || quotedText;
  return {
    bot,
    sock: rb.sock,
    cmd: cmd
      ? {
          name: cmd.name,
          description: cmd.description,
          handler: cmd.handler,
          permissions: cmd.permissions,
          premium: cmd.premium,
          extra: cmd.extra,
        }
      : { name: "", description: "", handler: "", permissions: "all", premium: false, extra: {} },
    n,
    raw: m,
    parts,
    arg: parsedArg,
    startedAt: t0,
    replyKey: quotedKey,
    getRepliedMedia: async () => {
      try {
        const quotedRaw = contextInfo?.quotedMessage;
        if (!quotedRaw) return null;
        const quoted = unwrapMessage(quotedRaw);
        const buf = (await (downloadMediaMessage as any)(
          { key: quotedKey ?? m.key, message: quoted } as any,
          "buffer",
          {}
        )) as Buffer;
        let mime = "application/octet-stream";
        let filename: string | undefined;
        if (quoted.imageMessage) {
          mime = "image/" + (String(quoted.imageMessage.mimetype || "jpeg").split("/")[1] || "jpeg");
          filename = quoted.imageMessage.fileName || undefined;
        } else if (quoted.videoMessage) {
          mime = String(quoted.videoMessage.mimetype || "video/mp4");
          filename = quoted.videoMessage.fileName || undefined;
        } else if (quoted.audioMessage) {
          mime = String(quoted.audioMessage.mimetype || "audio/ogg");
          filename = quoted.audioMessage.fileName || undefined;
        } else if (quoted.documentMessage) {
          mime = String(quoted.documentMessage.mimetype || "application/octet-stream");
          filename = quoted.documentMessage.fileName || quoted.documentMessage.title || undefined;
        } else if (quoted.stickerMessage) {
          mime = "image/webp";
        } else if (quoted.locationMessage) {
          return null;
        }
        return { buffer: buf, mimetype: mime, filename };
      } catch {
        return null;
      }
    },
  };
}

async function deleteMsg(rb: RunningBot, n: NormalizedMsg) {
  try {
    await rb.sock.sendMessage(n.remoteJid, {
      delete: { remoteJid: n.remoteJid, fromMe: false, id: n.messageId, participant: n.sender },
    });
  } catch {
    /* ignore */
  }
}

async function addWarn(rb: RunningBot, bot: BotRow, n: NormalizedMsg, reason: string) {
  try {
    const existing = await db
      .select()
      .from(groupWarnings)
      .where(
        and(
          eq(groupWarnings.botId, bot.id),
          eq(groupWarnings.groupId, n.remoteJid),
          eq(groupWarnings.jid, n.sender)
        )
      )
      .limit(1);
    const next = (existing[0]?.count ?? 0) + 1;
    await db
      .insert(groupWarnings)
      .values({ botId: bot.id, groupId: n.remoteJid, jid: n.sender, count: next, reason })
      .onConflictDoUpdate({
        target: [groupWarnings.botId, groupWarnings.groupId, groupWarnings.jid],
        set: { count: next, reason, updatedAt: new Date() },
      })
      .catch(() => {});
    await addLog({
      userId: bot.userId,
      botId: bot.id,
      level: "warning",
      event: "security.warn",
      message: `Auto-warn @${n.sender.split("@")[0]}: ${reason}`,
      status: "warned",
      meta: { groupId: n.remoteJid },
    });
    if (next >= 5) {
      try {
        await rb.sock.groupParticipantsUpdate(n.remoteJid, [n.sender], "remove");
        await addLog({
          userId: bot.userId,
          botId: bot.id,
          level: "error",
          event: "security.kick",
          message: `@${n.sender.split("@")[0]} di-kick (5 warns)`,
          meta: { groupId: n.remoteJid },
        });
      } catch {
        /* not admin in group */
      }
    }
  } catch {
    /* ignore */
  }
}

async function sendMedia(rb: RunningBot, to: string, media: {
  kind: string;
  buffer: Buffer;
  filename?: string;
  mimetype?: string;
  caption?: string;
  ptt?: boolean;
  jpegThumbnail?: Buffer;
}) {
  try {
    let content: any;
    if (media.kind === "image") content = { image: media.buffer, caption: media.caption };
    else if (media.kind === "video") content = { video: media.buffer, caption: media.caption, mimetype: media.mimetype, jpegThumbnail: media.jpegThumbnail };
    else if (media.kind === "audio")
      content = { audio: media.buffer, mimetype: media.mimetype ?? "audio/mpeg", fileName: media.filename ?? "audio.mp3", ptt: !!media.ptt };
    else if (media.kind === "sticker") content = { sticker: media.buffer };
    else content = { document: media.buffer, fileName: media.filename ?? "file", caption: media.caption, mimetype: media.mimetype };
    await rb.sock.sendMessage(to, content);
    await recordOut(rb, to, media.kind, media.caption ?? null);
    dispatchWebhook(rb.userId, "message.sent", { botId: rb.botId, to, type: media.kind });
  } catch (e: any) {
    await addLog({
      userId: rb.userId,
      botId: rb.botId,
      level: "error",
      event: "message.failed",
      message: `Gagal mengirim media ${media.kind}: ${e?.message ?? e}`,
      status: "failed",
    });
    try {
      await sendInternal(rb, to, `🥀 Media ${media.kind} gagal dikirim. Coba ulangi dengan URL publik atau gunakan command yang sesuai.`);
    } catch {
      /* do not mask the original send failure */
    }
  }
}

/* ================================ AI ================================= */
async function aiRespond(bot: BotRow, userText: string): Promise<string | null> {
  const bs = (bot.settings as any) || {};
  const ai = bs.ai || {};
  // Auto-reply AI hanya jika enabled; command .ai tetap lewat ai.ts
  if (ai.enabled === false) return null;
  const key = String(bs.geminiApiKey || bs.aiApiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || "").trim();
  if (!key) {
    // Jangan spam error di auto-reply jika key belum diisi
    if (!ai.enabled) return null;
    return "⚠️ AI belum dikonfigurasi. Isi *API Key AI* di Dashboard bot.";
  }
  try {
    const keyLower = key.toLowerCase();
    const isGeminiKey = key.startsWith("AIza") || keyLower.includes("gemini");
    const configuredBase = String(bs.aiBaseUrl || process.env.AI_BASE_URL || process.env.GEMINI_API_BASE || "").trim().replace(/\/$/, "");
    const base =
      configuredBase ||
      (isGeminiKey
        ? "https://generativelanguage.googleapis.com/v1beta/openai"
        : "https://api.openai.com/v1");
    const model =
      String(bs.aiModel || ai.model || process.env.GEMINI_MODEL || process.env.AI_MODEL || "").trim() ||
      (isGeminiKey ? "gemini-2.5-flash-lite" : "gpt-4o-mini");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: Number(ai.temperature ?? process.env.GEMINI_TEMPERATURE ?? 0.7),
        max_tokens: Number(ai.maxTokens ?? process.env.GEMINI_MAX_OUTPUT_TOKENS ?? 8192),
        messages: [
          {
            role: "system",
            content:
              ai.systemPrompt ||
              "Kamu asisten WhatsApp yang ramah, ringkas, dan membantu.",
          },
          { role: "user", content: userText },
        ],
      }),
      signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 60000)),
    });
    if (!res.ok) return res.status === 401 || res.status === 403 ? "⚠️ AI tidak tersedia: API key tidak valid atau tidak memiliki akses." : res.status === 429 ? "⚠️ AI sedang sibuk. Silakan coba lagi nanti." : res.status === 408 || res.status >= 500 ? "⚠️ AI sedang tidak tersedia. Silakan coba lagi." : `⚠️ AI tidak tersedia (HTTP ${res.status}).`;
    const j: any = await res.json();
    return j?.choices?.[0]?.message?.content || "AI tidak memberikan jawaban.";
  } catch {
    return "⚠️ AI tidak dapat dihubungi saat ini.";
  }
}

/* ============================= scheduler ============================= */
async function schedulerTick() {
  try {
    const rows = await db
      .select()
      .from(automations)
      .where(and(eq(automations.type, "scheduled"), eq(automations.enabled, true)));
    const now = Date.now();
    for (const a of rows as AutomationRow[]) {
      const at = a.trigger?.at ? new Date(a.trigger.at).getTime() : 0;
      if (at && at <= now && a.action?.to) {
        try {
          await engineSend(a.botId, {
            to: a.action.to,
            type: "text",
            text: String(a.action.text || ""),
          });
          await addLog({
            userId: a.userId,
            botId: a.botId,
            level: "success",
            event: "automation.scheduled",
            message: "Jadwal pesan terkirim",
          });
        } catch (e: any) {
          await addLog({
            userId: a.userId,
            botId: a.botId,
            level: "error",
            event: "automation.scheduled_failed",
            message: `Jadwal gagal: ${e?.message ?? e}`,
          });
        }
        await db
          .update(automations)
          .set({ enabled: false })
          .where(eq(automations.id, a.id));
      }
    }
  } catch {
    /* scheduler must never crash the process */
  }
}

function uptimeTick() {
  for (const rb of running.values()) {
    if (rb.onlineSince) {
      const sec = Math.floor((Date.now() - rb.onlineSince) / 1000);
      db.update(bots)
        .set({ uptimeSec: sec })
        .where(eq(bots.id, rb.botId))
        .catch(() => {});
    }
  }
}

/* ================================ boot =============================== */
export async function ensureEngineBoot() {
  if (booted) return;
  booted = true;
  startSse();
  setInterval(() => schedulerTick(), 60000);
  setInterval(() => uptimeTick(), 30000);
  (async () => {
    try {
      const rows = await db
        .select()
        .from(bots)
        .where(inArray(bots.status, ["online", "connecting", "reconnecting"]));
      for (const b of rows) {
        startBot(b).catch(async (e: any) => {
          await setBotStatus(b.id, "offline");
          await addLog({
            userId: b.userId,
            botId: b.id,
            level: "error",
            event: "bot.recover_failed",
            message: `Gagal memulihkan bot: ${e?.message ?? e}`,
          });
        });
      }
    } catch {
      /* db not ready yet */
    }
  })();
}

export async function engineBotDetail(botId: string) {
  const rb = running.get(botId);
  return {
    engineRunning: !!rb,
    engineStartedAt: rb ? new Date(rb.startedAt).toISOString() : null,
    retries: rb?.retries ?? 0,
  };
}

export { getSetting };
