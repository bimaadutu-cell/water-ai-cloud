import fs from "fs";
import path from "path";
import { eq, and, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
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
    // Descriptor protokol yang didukung Baileys: Ubuntu / Chrome / 22.04.4.
    // Ini tidak menjalankan Chrome palsu; koneksi tetap WebSocket langsung ke WhatsApp.
    browser: Browsers.ubuntu("Chrome"),
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
          content = { audio: buf, mimetype: p.mimetype || "audio/mp4" };
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
  for (let i = 0; i < 5; i++) {
    const next = current?.viewOnceMessage?.message
      ?? current?.viewOnceMessageV2?.message
      ?? current?.viewOnceMessageV2Extension?.message
      ?? current?.ephemeralMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

function normalize(m: any): NormalizedMsg | null {
  const key = m?.key;
  const remoteJid: string | undefined = key?.remoteJid;
  if (!remoteJid || remoteJid === "status@broadcast" || key?.fromMe) return null;
  const msg = unwrapMessage(m.message || {});
  let type = "text";
  let text = "";
  if (typeof msg.conversation === "string") text = msg.conversation;
  else if (msg.extendedTextMessage) {
    type = msg.extendedTextMessage.contextInfo ? "reply" : "text";
    text = msg.extendedTextMessage.text || "";
  } else if (msg.imageMessage) {
    type = "image";
    text = msg.imageMessage.caption || "";
  } else if (msg.videoMessage) {
    type = "video";
    text = msg.videoMessage.caption || "";
  } else if (msg.audioMessage) type = "audio";
  else if (msg.documentMessage) {
    type = "document";
    text = msg.documentMessage.caption || "";
  } else if (msg.stickerMessage) type = "sticker";
  else if (msg.locationMessage) type = "location";
  else if (msg.contactMessage) type = "contact";
  else if (msg.contactsMessage) type = "contacts";
  else if (msg.reactionMessage) type = "reaction";
  else if (msg.buttonsResponseMessage) {
    type = "button";
    text = msg.buttonsResponseMessage.selectedButtonId || "";
  } else if (msg.listResponseMessage) {
    type = "list";
    text = msg.listResponseMessage.title || "";
  } else if (msg.protocolMessage) type = "protocol";
  else if (msg.notificationMessage) {
    type = "notification";
    text = msg.notificationMessage.text || "";
  } else if (msg.pollUpdateMessage) type = "poll";
  const isGroup = remoteJid.endsWith("@g.us");
  const sender: string = key?.participant || remoteJid;
  return { type, text, sender, remoteJid, isGroup, messageId: key?.id || "" };
}

async function isGroupAdmin(rb: RunningBot, groupId: string, sender: string) {
  try {
    const meta = await rb.sock.groupMetadata(groupId);
    const p = (meta.participants || []).find((x: any) => x.id === sender);
    return p?.admin === true;
  } catch {
    return false;
  }
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
  const isCommandLike =
    ["text", "reply", "button", "list"].includes(n.type) && n.text.startsWith(prefix);
  const senderNumber = n.sender.split("@")[0];
  const botOwnersRows = (await db
    .select({ phone: botOwners.phone })
    .from(botOwners)
    .where(eq(botOwners.botId, bot.id))
    .catch(() => [])) as { phone: string }[];
  const isBotOwner = !!bot.ownerNumber && senderNumber === bot.ownerNumber;

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
    const isAdm = needAdmin ? await isGroupAdmin(rb, n.remoteJid, n.sender) : false;
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
    if (gameReply?.media) await sendMedia(rb, n.remoteJid, gameReply.media);
    else if (gameReply?.text) await sendInternal(rb, n.remoteJid, gameReply.text);
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
          await sendInternal(rb, n.remoteJid, "⛔ Hanya owner yang bisa memakai command ini.");
          return;
        }
        if (cmd.permissions === "admin") {
          const okAdmin =
            isBotOwner || botOwnersRows.some((o) => senderNumber === o.phone) ||
            (n.isGroup && (await isGroupAdmin(rb, n.remoteJid, n.sender)));
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
          if (result.media) await sendMedia(rb, n.remoteJid, result.media);
          else if (result.buttons?.length) await sendInteractive(rb, n.remoteJid, result.text || "", result.buttons);
          else if (result.text) await sendInternal(rb, n.remoteJid, result.text);
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
          await sendInternal(rb, n.remoteJid, /^[⚠❌💎📦⏱]/.test(em) ? em : "❌ Gagal memproses command. Coba lagi.");
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
        await sendInternal(rb, n.remoteJid, `⚠️ Command *${prefix}${cmdName}* tidak ditemukan.\n\nMungkin maksud Anda:\n${ranked.map((entry) => `• *${prefix}${entry.name}*`).join("\\n")}\n\nKetik *${prefix}menu* untuk kategori.`);
      } else {
        await sendInternal(rb, n.remoteJid, `⚠️ Command *${prefix}${cmdName}* tidak ditemukan. Ketik *${prefix}menu* untuk melihat kategori.`);
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
      const senderNumber = n.sender.split("@")[0];
      const isAdmin =
        (bot.ownerNumber && senderNumber === bot.ownerNumber) ||
        (await isGroupAdmin(rb, n.remoteJid, n.sender));
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

async function sendInteractive(rb: RunningBot, to: string, text: string, buttons: { id: string; text: string }[]) {
  try {
    await rb.sock.sendMessage(to, {
      text,
      footer: "WATER AI CLOUD",
      buttons: buttons.map((button) => ({ buttonId: button.id, buttonText: { displayText: button.text }, type: 1 })),
      headerType: 1,
    });
    await recordOut(rb, to, "text", text);
  } catch {
    // Some WhatsApp clients disable legacy interactive buttons; text remains reliable.
    await sendInternal(rb, to, text);
  }
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
  const contextInfo = m?.message?.extendedTextMessage?.contextInfo ?? {};
  const quotedKey = contextInfo?.stanzaId ? {
    remoteJid: n.remoteJid,
    fromMe: false,
    id: contextInfo.stanzaId,
    participant: contextInfo.participant || n.sender,
  } : null;
  const parts = n.text.split(/\s+/).filter(Boolean);
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
    arg: parts.slice(1).join(" "),
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
        if (quoted.imageMessage) mime = "image/" + (String(quoted.imageMessage.mimetype || "jpeg").split("/")[1] || "jpeg");
        else if (quoted.videoMessage) mime = String(quoted.videoMessage.mimetype || "video/mp4");
        else if (quoted.audioMessage) mime = String(quoted.audioMessage.mimetype || "audio/ogg");
        else if (quoted.documentMessage) mime = String(quoted.documentMessage.mimetype || "application/octet-stream");
        else if (quoted.stickerMessage) mime = "image/webp";
        else if (quoted.locationMessage) return null;
        return { buffer: buf, mimetype: mime };
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
}) {
  try {
    let content: any;
    if (media.kind === "image") content = { image: media.buffer, caption: media.caption };
    else if (media.kind === "video") content = { video: media.buffer, caption: media.caption, mimetype: media.mimetype };
    else if (media.kind === "audio")
      content = { audio: media.buffer, mimetype: media.mimetype ?? "audio/mpeg", ptt: !!media.ptt };
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
  }
}

/* ================================ AI ================================= */
async function aiRespond(bot: BotRow, userText: string): Promise<string | null> {
  const ai = (bot.settings as any)?.ai;
  if (!ai?.enabled) return null;
  const key = process.env.AI_API_KEY;
  if (!key)
    return "⚠️ AI belum dikonfigurasi di server (AI_API_KEY belum diset). Bot tetap online.";
  try {
    const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: ai.model || process.env.AI_MODEL || "gpt-4o-mini",
        temperature: Number(ai.temperature ?? 0.7),
        max_tokens: Number(ai.maxTokens ?? 300),
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
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return `⚠️ AI error: HTTP ${res.status}`;
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
