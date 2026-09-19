/* In-memory game/session state per (botId:chatJid), TTL 10 minutes. */
export interface Game {
  kind: "quiz" | "tebakkata" | "tebakgambar" | "flashcard" | "chess2" | "tictactoe";
  data: any;
  startedAt: number;
}

const games = new Map<string, Game>();
const locks = new Map<string, Promise<void>>();
const TTL = 10 * 60e3;

const keyOf = (botId: string, chat: string, kind?: Game["kind"]) =>
  kind ? `${botId}:${chat}:${kind}` : `${botId}:${chat}`;

export function setGame(botId: string, chat: string, game: Game) {
  // Keep a per-game key so Chess2 and TicTacToe cannot overwrite each other.
  games.set(keyOf(botId, chat, game.kind), game);
  games.set(keyOf(botId, chat), game);
}

export function getGame(botId: string, chat: string, kind?: Game["kind"]): Game | null {
  const g = games.get(keyOf(botId, chat, kind));
  if (!g) return null;
  if (Date.now() - g.startedAt > TTL) {
    games.delete(keyOf(botId, chat, kind));
    const latest = games.get(keyOf(botId, chat));
    if (latest === g) games.delete(keyOf(botId, chat));
    return null;
  }
  return g;
}

export function delGame(botId: string, chat: string, kind?: Game["kind"]) {
  if (kind) {
    const g = games.get(keyOf(botId, chat, kind));
    games.delete(keyOf(botId, chat, kind));
    if (games.get(keyOf(botId, chat)) === g) games.delete(keyOf(botId, chat));
    return;
  }
  const latest = games.get(keyOf(botId, chat));
  games.delete(keyOf(botId, chat));
  if (latest) games.delete(keyOf(botId, chat, latest.kind));
}

/** Serialize state-changing actions per bot/chat/game to prevent double taps and races. */
export async function withGameLock<T>(
  botId: string,
  chat: string,
  kind: Game["kind"],
  fn: () => Promise<T> | T,
): Promise<T> {
  const k = keyOf(botId, chat, kind);
  const previous = locks.get(k) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(k, queued);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(k) === queued) locks.delete(k);
  }
}

export function clearAllGames() {
  games.clear();
}

/* Flood detection: sliding window per (botId:chat:sender) */
const floods = new Map<string, number[]>();
const FLOOD_WINDOW = 12e3;

export function checkFlood(botId: string, chat: string, jid: string, limit: number): boolean {
  const k = `${botId}:${chat}:${jid}`;
  const now = Date.now();
  const arr = (floods.get(k) ?? []).filter((t) => now - t < FLOOD_WINDOW);
  arr.push(now);
  floods.set(k, arr);
  return arr.length > limit;
}

/* periodic cleanup */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, g] of games) if (now - g.startedAt > TTL) games.delete(k);
    for (const [k, arr] of floods) {
      const fresh = arr.filter((t) => now - t < FLOOD_WINDOW);
      if (!fresh.length) floods.delete(k);
      else floods.set(k, fresh);
    }
  }, 5 * 60e3).unref?.();
}

/* ---------- auto AI mode per chat ---------- */
const autoAiChats = new Map<string, number>(); // key botId:chat → enabledAt
const AUTO_AI_TTL = 24 * 60 * 60e3;

export function setAutoAi(botId: string, chat: string, on: boolean) {
  const k = `${botId}:${chat}`;
  if (on) autoAiChats.set(k, Date.now());
  else autoAiChats.delete(k);
}

export function isAutoAi(botId: string, chat: string): boolean {
  const k = `${botId}:${chat}`;
  const at = autoAiChats.get(k);
  if (!at) return false;
  if (Date.now() - at > AUTO_AI_TTL) {
    autoAiChats.delete(k);
    return false;
  }
  return true;
}


/* ---------- AI conversation memory (high context) ---------- */
export type ChatMsg = { role: "user" | "assistant" | "system"; content: string; at: number };
const chatMemory = new Map<string, ChatMsg[]>();
const MEMORY_MAX_TURNS = 24; // 24 user+assistant pairs max ~48 messages
const MEMORY_TTL_MS = 6 * 60 * 60e3; // 6 jam

function memKey(botId: string, chat: string, user?: string) {
  // per-chat memory; optional user suffix for groups
  return user ? `${botId}:${chat}:${user}` : `${botId}:${chat}`;
}

export function pushChatMemory(
  botId: string,
  chat: string,
  role: "user" | "assistant",
  content: string,
  user?: string
) {
  const k = memKey(botId, chat, user);
  const arr = chatMemory.get(k) || [];
  arr.push({ role, content: String(content || "").slice(0, 6000), at: Date.now() });
  // trim old
  const cutoff = Date.now() - MEMORY_TTL_MS;
  while (arr.length && arr[0].at < cutoff) arr.shift();
  while (arr.length > MEMORY_MAX_TURNS * 2) arr.shift();
  chatMemory.set(k, arr);
}

export function getChatMemory(botId: string, chat: string, user?: string): ChatMsg[] {
  const k = memKey(botId, chat, user);
  const arr = chatMemory.get(k) || [];
  const cutoff = Date.now() - MEMORY_TTL_MS;
  const fresh = arr.filter((m) => m.at >= cutoff);
  if (fresh.length !== arr.length) chatMemory.set(k, fresh);
  return fresh;
}

export function clearChatMemory(botId: string, chat: string, user?: string) {
  chatMemory.delete(memKey(botId, chat, user));
}


/* ---------- Termux interactive sessions ---------- */
const termuxSessions = new Map<string, { startedAt: number; cwd: string; history: string[] }>();
const TERMUX_TTL = 30 * 60e3;

export function setTermuxSession(botId: string, chat: string, user: string, on: boolean) {
  const k = `${botId}:${chat}:${user}`;
  if (on) termuxSessions.set(k, { startedAt: Date.now(), cwd: "~/water-ai", history: [] });
  else termuxSessions.delete(k);
}

export function getTermuxSession(botId: string, chat: string, user: string) {
  const k = `${botId}:${chat}:${user}`;
  const s = termuxSessions.get(k);
  if (!s) return null;
  if (Date.now() - s.startedAt > TERMUX_TTL) {
    termuxSessions.delete(k);
    return null;
  }
  return s;
}
