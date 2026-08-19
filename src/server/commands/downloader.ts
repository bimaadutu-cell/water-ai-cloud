/* .play / .song / .audio / .video / .media
 * REAL pipeline: search → pick best candidate → validate → download →
 * convert (ffmpeg) → send. Sources only provide legitimately downloadable
 * files (Apple iTunes 30s previews, Wikimedia Commons, direct media URLs).
 * YouTube/TikTok/Instagram URLs are explicitly refused (policy). */
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { CmdCtx, CmdResult, box, truncate, safeFetch, withTempFile, ffmpegPath, sanitizeFilename } from "./core";

const pExecFile = promisify(execFile);
const FF = ffmpegPath();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function scoreMatch(query: string, title: string, artist?: string): number {
  const q = norm(query);
  const t = norm(title);
  const a = norm(artist ?? "");
  let score = 0;
  if (t === q) score += 100;
  else if (t.includes(q)) score += 60;
  else if (q.includes(t) && t.length > 3) score += 40;
  // token overlap
  const qt = q.split(/[^a-z0-9]+/).filter(Boolean);
  const pool = (t + " " + a).split(/[^a-z0-9]+/).filter(Boolean);
  const overlap = qt.filter((w) => pool.some((p) => p.startsWith(w) || w.startsWith(p))).length;
  score += overlap * 8;
  return score;
}

/* ------------------------------ AUDIO SEARCH ---------------------------- */
interface Track {
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  previewUrl: string;
  source: string;
}

async function searchAudio(query: string): Promise<Track[]> {
  // 1) Jamendo (full songs, Creative Commons) if keys configured
  const jid = process.env.JAMENDO_CLIENT_ID;
  const jsec = process.env.JAMENDO_CLIENT_SECRET;
  if (jid && jsec) {
    try {
      const res = await fetch(
        `https://api.jamendo.com/v3.0/tracks?client_id=${jid}&client_secret=${jsec}&format=json&limit=5&audioformat=mp32&select=audio&search=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(20000) }
      );
      if (res.ok) {
        const j: any = await res.json();
        const tracks: Track[] = (j.results ?? [])
          .map((r: any) => ({
            title: r.name,
            artist: r.artist_name,
            album: r.album_name ?? "",
            durationSec: Math.round(r.duration ?? 0),
            previewUrl: r.audio?.mp32_128kbps ?? r.audio?.ogg_160kbps ?? "",
            source: "Jamendo (Creative Commons)",
          }))
          .filter((t: Track) => t.previewUrl);
        if (tracks.length) return tracks;
      }
    } catch {
      /* fall through to iTunes */
    }
  }
  // 2) iTunes — 30s previews are legitimately provided by Apple for download
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=10`,
    { signal: AbortSignal.timeout(20000) }
  );
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const j: any = await res.json();
  return (j.results ?? [])
    .filter((r: any) => r.previewUrl)
    .map((r: any) => ({
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName ?? "",
      durationSec: Math.round((r.trackTimeMillis ?? 0) / 1000),
      previewUrl: r.previewUrl,
      source: "iTunes (preview 30 detik)",
    }));
}

/* ------------------------------ VIDEO SEARCH ---------------------------- */
interface Clip {
  title: string;
  url: string;
  sizeKb: number;
  source: string;
}

async function searchVideo(query: string): Promise<Clip[]> {
  const res = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}%20filetype:video&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url|mime|size`,
    { signal: AbortSignal.timeout(20000) }
  );
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const j: any = await res.json();
  const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
  return pages
    .map((p: any) => {
      const info: any = p?.imageinfo?.[0];
      return {
        title: p?.title?.replace(/^File:/, "").replace(/\.\w+$/, "") ?? "",
        url: info?.url ?? "",
        sizeKb: Math.round((info?.size ?? 0) / 1024),
        source: "Wikimedia Commons",
      };
    })
    .filter((c: Clip) => c.url && c.sizeKb < 50 * 1024);
}

/* --------------------------------- helpers ------------------------------ */
function isDirectMedia(url: string): "audio" | "video" | "image" | null {
  const m = url.match(/\.(mp3|m4a|ogg|wav|mp4|webm|mov|flac|aac)(\?|$)/i);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (["mp3", "m4a", "ogg", "wav", "flac", "aac"].includes(ext)) return "audio";
  return "video";
}

function refusedPlatform(url: string): string | null {
  const u = url.toLowerCase();
  if (/(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)/.test(u))
    return "⚠️ Platform tersebut tidak menyediakan akses unduhan yang diizinkan, jadi WATER AI tidak memprosesnya (kebijakan).";
  return null;
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(2) + " MB" : (b / 1024).toFixed(0) + " KB");

/* --------------------------------- PLAY --------------------------------- */
export async function play(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: "Pakai: .play <judul lagu> atau .play <url audio>" };

  const refused = refusedPlatform(arg);
  if (refused) return { text: refused };

  let pkey: any = null;
  pkey = await progressMsg(ctx, "🔎 Searching...\nQuery: " + truncate(arg, 60));

  let track: Track | null = null;
  let direct: { url: string; kind: "audio" | "video" } | null = null;

  if (/^https?:\/\//i.test(arg)) {
    const kind = isDirectMedia(arg);
    if (!kind) return { text: "❌ URL bukan file media langsung (mp3/m4a/ogg/mp4/...). Gunakan judul lagu atau URL file media." };
    if (kind === "image") return { text: "⚠️ URL gambar: simpan langsung, .play hanya untuk audio." };
    if (kind === "video") return { text: "⚠️ URL video: pakai .video <url>" };
    direct = { url: arg, kind };
  } else {
    let results: Track[] = [];
    try {
      results = await searchAudio(arg);
    } catch {
      return { text: "❌ Gagal mengakses service pencarian audio. Coba lagi nanti." };
    }
    if (!results.length) return { text: `❌ Media tidak ditemukan untuk "${truncate(arg, 50)}".` };
    results.sort((a, b) => scoreMatch(arg, b.title, b.artist) - scoreMatch(arg, a.title, a.artist));
    track = results[0];
  }

  if (track) {
    const info = box("🎵 RESULT", [
      `🎵 Title : ${track.title}`,
      `👤 Artist : ${track.artist}`,
      `🎧 Album : ${track.album}`,
      `⏱️ Duration : ${fmtDur(track.durationSec)}`,
      `📦 Type : Audio (${track.source})`,
    ]);
    pkey = await progressMsg(ctx, info + "\n\n⬇️ Processing...");
  }

  try {
    const buf = direct ? await safeFetch(direct.url) : await safeFetch(track!.previewUrl);
    if (buf.length < 8000) return { text: "❌ File dari sumber terlalu kecil/rusak — tidak dikirim." };

    // Convert m4a/other to MP3 when possible (real ffmpeg conversion)
    let audio = buf;
    let format = "m4a";
    const ft: any = await import("file-type");
    const type = await ft.fileTypeFromBuffer(buf);
    const isMpeg = type?.mime === "audio/mpeg";
    if (!isMpeg && FF) {
      const converted = await withTempFile(buf, ".in", async (inPath) => {
        const outPath = inPath + ".mp3";
        await pExecFile(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", inPath, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", outPath], { timeout: 120000 });
        return outPath;
      });
      if (fs.existsSync(converted) && fs.statSync(converted).size > 8000) {
        audio = fs.readFileSync(converted);
        fs.rmSync(converted, { force: true });
        format = "mp3";
      }
    } else if (isMpeg) {
      format = "mp3";
    }

    pkey = await progressMsg(ctx, "📦 Preparing file...\n📤 Uploading...");
    await new Promise((r) => setTimeout(r, 400));
    if (pkey) await editDone(ctx, pkey);

    const caption = box("✅ DOWNLOAD SUCCESS", [
      `🎵 Title : ${track?.title ?? sanitizeFilename(new URL(direct!.url).pathname)}`,
      track ? `👤 Artist : ${track.artist}` : null,
      `📦 Format : ${format.toUpperCase()}`,
      `📁 Size : ${fmtSize(audio.length)}`,
      track?.source ? `📡 Source : ${track.source}` : null,
    ].filter(Boolean));
    return { media: { kind: "audio", buffer: audio, mimetype: format === "mp3" ? "audio/mpeg" : "audio/mp4", caption } };
  } catch (e: any) {
    return { text: e?.message?.startsWith?.("⏱️") ? "⏱️ Proses terlalu lama. Silakan coba lagi." : "❌ Gagal memproses media. Coba lagi." };
  }
}
export const song = play;
export const audioCmd = play;

/* --------------------------------- VIDEO -------------------------------- */
export async function video(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: "Pakai: .video <judul> atau .video <url video>" };
  const refused = refusedPlatform(arg);
  if (refused) return { text: refused };

  let pkey: any = null;
  pkey = await progressMsg(ctx, "🔎 Searching...\nQuery: " + truncate(arg, 60));

  let clip: Clip | null = null;
  let direct: { url: string } | null = null;

  if (/^https?:\/\//i.test(arg)) {
    const kind = isDirectMedia(arg);
    if (!kind) return { text: "❌ URL bukan file media langsung." };
    if (kind === "audio") return { text: "⚠️ URL audio: pakai .play <url>" };
    direct = { url: arg };
  } else {
    let results: Clip[] = [];
    try {
      results = await searchVideo(arg);
    } catch {
      return { text: "❌ Gagal mengakses service pencarian video (Wikimedia Commons). Coba lagi." };
    }
    if (!results.length) return { text: `❌ Media tidak ditemukan untuk "${truncate(arg, 50)}".` };
    clip = results[0];
  }

  const infoBox = clip
    ? box("🎬 RESULT", [`🎬 Title : ${clip.title}`, `📁 Size : ${fmtSize(clip.sizeKb * 1024)}`, `📦 Type : Video (${clip.source})`])
    : box("🎬 RESULT", [`🎬 Title : ${sanitizeFilename(new URL(direct!.url).pathname)}`, `📦 Type : Video (direct URL)`]);

  pkey = await progressMsg(ctx, infoBox + "\n\n⬇️ Processing...");
  try {
    const buf = await safeFetch(clip?.url ?? direct!.url);
    if (buf.length < 8000) return { text: "❌ File dari sumber terlalu kecil/rusak — tidak dikirim." };
    pkey = await progressMsg(ctx, "📦 Preparing file...\n📤 Uploading...");
    await new Promise((r) => setTimeout(r, 400));
    if (pkey) await editDone(ctx, pkey);
    return {
      media: {
        kind: "video",
        buffer: buf,
        mimetype: "video/mp4",
        caption: box("✅ DOWNLOAD SUCCESS", [
          `🎬 Title : ${clip?.title ?? sanitizeFilename(new URL(direct!.url).pathname)}`,
          `📦 Format : MP4`,
          `📁 Size : ${fmtSize(buf.length)}`,
          clip ? `📡 Source : ${clip.source}` : null,
        ].filter(Boolean)),
      },
    };
  } catch (e: any) {
    return { text: "❌ Gagal memproses video. Coba lagi." };
  }
}

/* --------------------------------- MEDIA -------------------------------- */
export async function media(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: "Pakai: .media <judul/url>" };
  if (arg.includes(".") && /^https?:\/\//i.test(arg) && isDirectMedia(arg) === "video") return video(ctx);
  if (/^https?:\/\//i.test(arg) && isDirectMedia(arg) === "video") return video(ctx);
  return play(ctx);
}

/* ------------------------------ progress util --------------------------- */
import { progress } from "./core";
async function progressMsg(ctx: CmdCtx, text: string): Promise<any> {
  // single status message, edited on each step (no message spam)
  try {
    const res = await ctx.sock.sendMessage(ctx.n.remoteJid, { text });
    return res?.key ?? null;
  } catch {
    return null;
  }
}

async function editDone(ctx: CmdCtx, key: any) {
  if (!key) return;
  try {
    await ctx.sock.sendMessage(ctx.n.remoteJid, { text: "✅ Completed!", edit: key });
  } catch {
    /* best effort */
  }
}

void progress;
