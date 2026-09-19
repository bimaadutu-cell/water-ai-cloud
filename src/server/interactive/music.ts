/**
 * PLAY2 Music Player — interactive session + queue per chat
 */
import { createSession, getSession, updateSession, deleteSession } from "./session";
import { registerExactHandler, type InteractiveContext } from "./router";
import { MUSIC_BUTTONS, formatDuration, progressBar } from "./helpers";
import type { InteractiveSession } from "./session";

export interface Track {
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnail?: string;
  url?: string; // original
  audioBuffer?: Buffer;
  mimetype?: string;
  filename?: string;
  engine?: string;
}

export interface MusicState {
  queue: Track[];
  currentIndex: number;
  playing: boolean;
  paused: boolean;
  repeat: "off" | "one" | "all";
  shuffle: boolean;
  position: number; // simulated seconds
  startedAt?: number;
}

export function getMusicSession(botId: string, jid: string) {
  return getSession(botId, jid, "music_player");
}

export function createMusicSession(botId: string, jid: string, firstTrack: Track) {
  const state: MusicState = {
    queue: [firstTrack],
    currentIndex: 0,
    playing: true,
    paused: false,
    repeat: "off",
    shuffle: false,
    position: 0,
    startedAt: Date.now(),
  };
  return createSession(botId, jid, "music_player", state as any);
}

export function addToQueue(botId: string, jid: string, track: Track) {
  const s = getMusicSession(botId, jid);
  if (!s) {
    return createMusicSession(botId, jid, track);
  }
  const q: Track[] = s.state.queue || [];
  q.push(track);
  updateSession(botId, jid, "music_player", { queue: q });
  return s;
}

export function currentTrack(session: InteractiveSession): Track | null {
  const st = session.state as MusicState;
  if (!st.queue?.length) return null;
  return st.queue[st.currentIndex] || null;
}

export function buildPlayerCaption(session: InteractiveSession): string {
  const st = session.state as MusicState;
  const t = currentTrack(session);
  if (!t) return "🎵 Tidak ada lagu di antrean.";
  const status = st.paused ? "⏸️ PAUSED" : st.playing ? "▶️ NOW PLAYING" : "⏹️ STOPPED";
  const pos = st.position || 0;
  const dur = t.duration || 0;
  const bar = progressBar(pos, dur || 1);
  return (
    `🎵 *${status}*\n\n` +
    `*${t.title}*\n` +
    `${t.artist || "Unknown Artist"}\n\n` +
    `${formatDuration(pos)} ${bar} ${formatDuration(dur)}\n\n` +
    `🔁 ${st.repeat} · 🔀 ${st.shuffle ? "ON" : "OFF"} · 📃 ${st.queue.length} track(s)`
  );
}

export function playerButtons(session: InteractiveSession) {
  const st = session.state as MusicState;
  const primary = st.paused || !st.playing ? MUSIC_BUTTONS.play : MUSIC_BUTTONS.pause;
  return [MUSIC_BUTTONS.prev, primary, MUSIC_BUTTONS.next];
}

export function secondaryButtons() {
  return [MUSIC_BUTTONS.stop, MUSIC_BUTTONS.queue, MUSIC_BUTTONS.download];
}

// Handlers
async function handlePlay(ctx: InteractiveContext, session: InteractiveSession) {
  updateSession(ctx.botId, ctx.jid, "music_player", { paused: false, playing: true, startedAt: Date.now() });
  const s = getMusicSession(ctx.botId, ctx.jid)!;
  return {
    text: buildPlayerCaption(s) + "\n\n▶️ *Playing...*",
    buttons: playerButtons(s),
  };
}

async function handlePause(ctx: InteractiveContext, session: InteractiveSession) {
  updateSession(ctx.botId, ctx.jid, "music_player", { paused: true });
  const s = getMusicSession(ctx.botId, ctx.jid)!;
  return {
    text: buildPlayerCaption(s) + "\n\n⏸️ *Paused*",
    buttons: playerButtons(s),
  };
}

async function handleNext(ctx: InteractiveContext, session: InteractiveSession) {
  const st = session.state as MusicState;
  let nextIdx = st.currentIndex + 1;
  if (nextIdx >= st.queue.length) {
    if (st.repeat === "all") nextIdx = 0;
    else {
      return { text: "📃 Antrean habis. Tambah lagu dengan .play2 <judul>" };
    }
  }
  updateSession(ctx.botId, ctx.jid, "music_player", {
    currentIndex: nextIdx,
    position: 0,
    paused: false,
    playing: true,
    startedAt: Date.now(),
  });
  const s = getMusicSession(ctx.botId, ctx.jid)!;
  const track = currentTrack(s);
  return {
    text: buildPlayerCaption(s) + "\n\n⏭️ *Next track*",
    buttons: playerButtons(s),
    // media will be handled by caller if track has buffer
    media: track?.audioBuffer
      ? {
          kind: "audio" as const,
          buffer: track.audioBuffer,
          mimetype: track.mimetype || "audio/mpeg",
          filename: track.filename || "track.mp3",
          ptt: false,
        }
      : undefined,
  };
}

async function handlePrev(ctx: InteractiveContext, session: InteractiveSession) {
  const st = session.state as MusicState;
  let prevIdx = st.currentIndex - 1;
  if (prevIdx < 0) prevIdx = 0;
  updateSession(ctx.botId, ctx.jid, "music_player", {
    currentIndex: prevIdx,
    position: 0,
    paused: false,
    playing: true,
    startedAt: Date.now(),
  });
  const s = getMusicSession(ctx.botId, ctx.jid)!;
  return {
    text: buildPlayerCaption(s) + "\n\n⏮️ *Previous*",
    buttons: playerButtons(s),
  };
}

async function handleStop(ctx: InteractiveContext, session: InteractiveSession) {
  deleteSession(ctx.botId, ctx.jid, "music_player");
  return {
    text: "⏹️ *Player dihentikan.* Session ditutup.\nGunakan .play2 <judul> untuk memutar lagi.",
    endSession: true,
  };
}

async function handleQueue(ctx: InteractiveContext, session: InteractiveSession) {
  const st = session.state as MusicState;
  if (!st.queue.length) return { text: "📃 Antrean kosong." };
  const lines = st.queue.map((t, i) => {
    const mark = i === st.currentIndex ? "▶️" : `${i + 1}.`;
    return `${mark} ${t.title} — ${t.artist || "?"} (${formatDuration(t.duration)})`;
  });
  return {
    text: `📃 *QUEUE* (${st.queue.length})\n\n${lines.join("\n")}`,
    buttons: playerButtons(session),
  };
}

async function handleDownload(ctx: InteractiveContext, session: InteractiveSession) {
  const t = currentTrack(session);
  if (!t?.audioBuffer) {
    return { text: "⬇️ Audio tidak tersedia di cache session. Putar ulang dengan .play2" };
  }
  return {
    text: `⬇️ *Download*\n${t.title} — ${t.artist}`,
    media: {
      kind: "document" as const,
      buffer: t.audioBuffer,
      mimetype: t.mimetype || "audio/mpeg",
      filename: t.filename || `${t.title}.mp3`,
    },
  };
}

async function handleShuffle(ctx: InteractiveContext, session: InteractiveSession) {
  const st = session.state as MusicState;
  updateSession(ctx.botId, ctx.jid, "music_player", { shuffle: !st.shuffle });
  return { text: `🔀 Shuffle: ${!st.shuffle ? "ON" : "OFF"}` };
}

async function handleRepeat(ctx: InteractiveContext, session: InteractiveSession) {
  const st = session.state as MusicState;
  const order: Array<"off" | "one" | "all"> = ["off", "one", "all"];
  const next = order[(order.indexOf(st.repeat) + 1) % order.length];
  updateSession(ctx.botId, ctx.jid, "music_player", { repeat: next });
  return { text: `🔁 Repeat: ${next}` };
}

// Register handlers
registerExactHandler(MUSIC_BUTTONS.play.id, handlePlay);
registerExactHandler(MUSIC_BUTTONS.pause.id, handlePause);
registerExactHandler(MUSIC_BUTTONS.next.id, handleNext);
registerExactHandler(MUSIC_BUTTONS.prev.id, handlePrev);
registerExactHandler(MUSIC_BUTTONS.stop.id, handleStop);
registerExactHandler(MUSIC_BUTTONS.queue.id, handleQueue);
registerExactHandler(MUSIC_BUTTONS.download.id, handleDownload);
registerExactHandler(MUSIC_BUTTONS.shuffle.id, handleShuffle);
registerExactHandler(MUSIC_BUTTONS.repeat.id, handleRepeat);
registerExactHandler(MUSIC_BUTTONS.info.id, async (ctx, session) => {
  const t = currentTrack(session);
  if (!t) return { text: "Tidak ada lagu." };
  return {
    text:
      `ℹ️ *Track Info*\n` +
      `Title : ${t.title}\n` +
      `Artist: ${t.artist}\n` +
      `Dur   : ${formatDuration(t.duration)}\n` +
      `Engine: ${t.engine || "—"}`,
  };
});
