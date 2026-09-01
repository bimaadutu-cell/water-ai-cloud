/* In-memory game/session state per (botId:chatJid), TTL 10 minutes. */
export interface Game {
  kind: "quiz" | "tebakkata" | "tebakgambar" | "flashcard" | "chess2";
  data: any;
  startedAt: number;
}

const games = new Map<string, Game>();
const TTL = 10 * 60e3;

const keyOf = (botId: string, chat: string) => `${botId}:${chat}`;

export function setGame(botId: string, chat: string, game: Game) {
  games.set(keyOf(botId, chat), game);
}

export function getGame(botId: string, chat: string): Game | null {
  const g = games.get(keyOf(botId, chat));
  if (!g) return null;
  if (Date.now() - g.startedAt > TTL) {
    games.delete(keyOf(botId, chat));
    return null;
  }
  return g;
}

export function delGame(botId: string, chat: string) {
  games.delete(keyOf(botId, chat));
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
