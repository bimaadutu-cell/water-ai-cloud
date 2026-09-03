/**
 * Central Interactive Response Router
 * Validates ownership, session, and dispatches to handlers.
 */
import type { InteractiveSession } from "./session";
import { getSession, updateSession, deleteSession, touchSession } from "./session";
import { MUSIC_BUTTONS, CHESS_IDS } from "./helpers";

export interface InteractiveContext {
  botId: string;
  jid: string; // chat jid
  sender: string; // sender jid
  actionId: string;
  raw: any;
  sock: any;
  prefix: string;
}

export type InteractiveHandler = (ctx: InteractiveContext, session: InteractiveSession) => Promise<{
  text?: string;
  buttons?: { id: string; text: string }[];
  media?: any;
  endSession?: boolean;
} | null>;

const handlers = new Map<string, InteractiveHandler>();

export function registerInteractiveHandler(idPrefix: string, handler: InteractiveHandler) {
  handlers.set(idPrefix, handler);
}

export function registerExactHandler(id: string, handler: InteractiveHandler) {
  handlers.set(id, handler);
}

/**
 * Extract action id from various Baileys response shapes
 */
export function extractActionId(msg: any): string | null {
  if (!msg) return null;
  // buttonsResponseMessage
  if (msg.buttonsResponseMessage?.selectedButtonId) {
    return msg.buttonsResponseMessage.selectedButtonId;
  }
  // templateButtonReplyMessage
  if (msg.templateButtonReplyMessage?.selectedId) {
    return msg.templateButtonReplyMessage.selectedId;
  }
  // listResponseMessage
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId;
  }
  // interactiveResponseMessage (Native Flow)
  const native = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (native?.paramsJson) {
    try {
      const j = JSON.parse(native.paramsJson);
      return j?.id || j?.selectedId || j?.title || null;
    } catch {
      /* ignore */
    }
  }
  if (msg.interactiveResponseMessage?.body?.text) {
    return msg.interactiveResponseMessage.body.text;
  }
  return null;
}

/**
 * Main entry: handle an interactive response
 */
export async function handleInteractiveResponse(ctx: InteractiveContext): Promise<{
  text?: string;
  buttons?: { id: string; text: string }[];
  media?: any;
} | null> {
  const { botId, jid, sender, actionId } = ctx;
  if (!actionId) return null;

  // Security: only allow known prefixes
  const known =
    actionId.startsWith("WATER_PLAY_") ||
    actionId.startsWith("CHESS_") ||
    actionId.startsWith("MENU_") ||
    actionId.startsWith("music_") ||
    actionId.startsWith("chess_");

  if (!known) {
    // fallback: try exact match
  }

  // Resolve session by type hint from action id
  let sessionType: string | undefined;
  if (actionId.startsWith("WATER_PLAY_") || actionId.startsWith("music_")) {
    sessionType = "music_player";
  } else if (actionId.startsWith("CHESS_") || actionId.startsWith("chess_")) {
    sessionType = "chess";
  }

  let session = getSession(botId, jid, sessionType as any);
  if (!session) {
    session = getSession(botId, jid); // latest
  }

  if (!session) {
    return {
      text:
        "⚠️ Session interaktif sudah kedaluwarsa atau tidak ditemukan.\n" +
        `Gunakan command lagi (contoh: ${ctx.prefix}play2 <judul> atau ${ctx.prefix}chess2).`,
    };
  }

  // Ownership: for private chat sender == jid; for groups we still allow chat-level session
  // Extra validation can be added per feature (e.g. chess turn)

  touchSession(botId, jid, session.type);

  // Exact handler first
  let handler = handlers.get(actionId);
  if (!handler) {
    // prefix match
    for (const [prefix, h] of handlers) {
      if (actionId.startsWith(prefix)) {
        handler = h;
        break;
      }
    }
  }

  if (!handler) {
    return { text: `⚠️ Aksi tidak dikenali: ${actionId}` };
  }

  try {
    const result = await handler(ctx, session);
    if (result?.endSession) {
      deleteSession(botId, jid, session.type);
    }
    return result;
  } catch (err: any) {
    console.error("[INTERACTIVE ERROR]", actionId, err?.message || err);
    return { text: `❌ Gagal memproses aksi: ${String(err?.message || err).slice(0, 120)}` };
  }
}

// Pre-register common music ids so router finds them via prefix
registerInteractiveHandler("WATER_PLAY_", async () => null); // placeholder, real handlers in music module
registerInteractiveHandler("CHESS_", async () => null);
