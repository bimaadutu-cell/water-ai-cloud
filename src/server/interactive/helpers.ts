/**
 * Helpers for building WhatsApp Interactive / Native Flow payloads
 * Compatible with @sairidev/baileys-new
 */

export interface ButtonDef {
  id: string;
  text: string;
}

export interface ListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

/** Quick reply / button params for Native Flow */
export function quickReplyButton(id: string, displayText: string) {
  return {
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: displayText.slice(0, 25),
      id,
    }),
  };
}

/** Build interactiveButtons array (max practical ~3 for reliability on many clients) */
export function buildInteractiveButtons(buttons: ButtonDef[]) {
  return buttons.slice(0, 3).map((b) => quickReplyButton(b.id, b.text));
}

/** Legacy buttons format still used by some forks */
export function buildLegacyButtons(buttons: ButtonDef[]) {
  return buttons.slice(0, 3).map((b) => ({
    buttonId: b.id,
    buttonText: { displayText: b.text.slice(0, 25) },
    type: 1 as const,
  }));
}

/** Simple {text,id} format used by some Baileys forks */
export function buildSimpleButtons(buttons: ButtonDef[]) {
  return buttons.slice(0, 3).map((b) => ({
    text: b.text.slice(0, 25),
    id: b.id,
  }));
}

/** Native list message sections (for chess move selection etc.) */
export function buildListMessage(
  title: string,
  description: string,
  buttonText: string,
  sections: ListSection[],
  footer = "WATER AI CLOUD V3.5"
) {
  return {
    text: description,
    footer,
    title,
    buttonText,
    sections: sections.map((sec) => ({
      title: sec.title.slice(0, 24),
      rows: sec.rows.slice(0, 10).map((r) => ({
        rowId: r.id,
        title: r.title.slice(0, 24),
        description: (r.description || "").slice(0, 72),
      })),
    })),
  };
}

/** Music player button set */
export const MUSIC_BUTTONS = {
  play: { id: "WATER_PLAY_PLAY", text: "▶️" },
  pause: { id: "WATER_PLAY_PAUSE", text: "⏸️" },
  prev: { id: "WATER_PLAY_PREV", text: "⏮️" },
  next: { id: "WATER_PLAY_NEXT", text: "⏭️" },
  stop: { id: "WATER_PLAY_STOP", text: "⏹️ Stop" },
  shuffle: { id: "WATER_PLAY_SHUFFLE", text: "🔀 Shuffle" },
  repeat: { id: "WATER_PLAY_REPEAT", text: "🔁 Repeat" },
  download: { id: "WATER_PLAY_DOWNLOAD", text: "⬇️ Download" },
  queue: { id: "WATER_PLAY_QUEUE", text: "📃 Queue" },
  info: { id: "WATER_PLAY_INFO", text: "ℹ️ Info" },
};

/** Chess action IDs */
export const CHESS_IDS = {
  new: "CHESS_NEW",
  move: "CHESS_MOVE",
  hint: "CHESS_HINT",
  undo: "CHESS_UNDO",
  resign: "CHESS_RESIGN",
  board: "CHESS_BOARD",
  reset: "CHESS_RESET",
  ai: "CHESS_AI",
  selectFrom: "CHESS_SELECT_FROM",
  selectTo: "CHESS_SELECT_TO",
};

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function progressBar(current: number, total: number, width = 12): string {
  if (total <= 0) return "─".repeat(width);
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(ratio * width);
  return "━".repeat(filled) + "─".repeat(width - filled);
}
