/**
 * Interactive Session Manager for WATER AI CLOUD V3.5
 * Per-chat isolated sessions for music_player, chess, menu, etc.
 */
export type SessionType = "music_player" | "chess" | "menu" | "queue" | string;

export interface InteractiveSession {
  jid: string;
  botId: string;
  type: SessionType;
  messageId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  state: Record<string, any>;
}

const sessions = new Map<string, InteractiveSession>();
const DEFAULT_TTL = 20 * 60 * 1000; // 20 minutes

function keyOf(botId: string, jid: string, type?: string) {
  return type ? `${botId}:${jid}:${type}` : `${botId}:${jid}`;
}

export function createSession(
  botId: string,
  jid: string,
  type: SessionType,
  state: Record<string, any> = {},
  ttlMs = DEFAULT_TTL
): InteractiveSession {
  const now = Date.now();
  const session: InteractiveSession = {
    jid,
    botId,
    type,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
    state: { ...state },
  };
  sessions.set(keyOf(botId, jid, type), session);
  // also set primary key for latest session of this chat
  sessions.set(keyOf(botId, jid), session);
  return session;
}

export function getSession(
  botId: string,
  jid: string,
  type?: SessionType
): InteractiveSession | null {
  const k = type ? keyOf(botId, jid, type) : keyOf(botId, jid);
  const s = sessions.get(k);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(k);
    if (type) sessions.delete(keyOf(botId, jid));
    return null;
  }
  return s;
}

export function updateSession(
  botId: string,
  jid: string,
  type: SessionType,
  patch: Partial<InteractiveSession["state"]> | ((prev: Record<string, any>) => Record<string, any>),
  extendTtl = true
): InteractiveSession | null {
  const s = getSession(botId, jid, type);
  if (!s) return null;
  if (typeof patch === "function") {
    s.state = patch(s.state);
  } else {
    s.state = { ...s.state, ...patch };
  }
  s.updatedAt = Date.now();
  if (extendTtl) s.expiresAt = Date.now() + DEFAULT_TTL;
  sessions.set(keyOf(botId, jid, type), s);
  sessions.set(keyOf(botId, jid), s);
  return s;
}

export function deleteSession(botId: string, jid: string, type?: SessionType) {
  if (type) {
    sessions.delete(keyOf(botId, jid, type));
  }
  const primary = sessions.get(keyOf(botId, jid));
  if (primary && (!type || primary.type === type)) {
    sessions.delete(keyOf(botId, jid));
  }
}

export function touchSession(botId: string, jid: string, type: SessionType) {
  const s = getSession(botId, jid, type);
  if (s) {
    s.updatedAt = Date.now();
    s.expiresAt = Date.now() + DEFAULT_TTL;
  }
  return s;
}

/** Cleanup expired sessions periodically */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, s] of sessions) {
      if (now > s.expiresAt) sessions.delete(k);
    }
  }, 60 * 1000).unref?.();
}

export function sessionCount() {
  return sessions.size;
}
