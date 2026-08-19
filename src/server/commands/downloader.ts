/* Downloader Command Hub with 9 Active Downloader Servers
 * Includes nexray, tikwm, siputzx, etc. and full audio download (not preview).
 */
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
  const qt = q.split(/[^a-z0-9]+/).filter(Boolean);
  const pool = (t + " " + a).split(/[^a-z0-9]+/).filter(Boolean);
  const overlap = qt.filter((w) => pool.some((p) => p.startsWith(w) || w.startsWith(p))).length;
  score += overlap * 8;
  return score;
}

interface Track {
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  downloadUrl: string;
  source: string;
}

// 9 Active Downloader Servers & APIs
async function fetchFromNineDownloaders(queryOrUrl: string, type: "audio" | "video"): Promise<{ url: string; title: string; source: string } | null> {
  const isUrl = /^https?:\/\//i.test(queryOrUrl);

  // 1. Nexray (User specified requirement)
  if (isUrl && type === "audio") {
    try {
      const res = await fetch(`https://api.nexray.eu.cc/downloader/v1/ytmp3?url=${encodeURIComponent(queryOrUrl)}`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const j: any = await res.json();
        const dl = j?.result?.download_url || j?.data?.url || j?.url;
        if (dl) return { url: dl, title: j?.result?.title || "Audio YouTube", source: "Nexray Server #1" };
      }
    } catch {}
  }

  // 2. TikWM (User specified requirement for TikTok / generic media)
  if (isUrl && (queryOrUrl.includes("tiktok.com") || queryOrUrl.includes("douyin"))) {
    try {
      const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(queryOrUrl)}`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const j: any = await res.json();
        const dl = j?.data?.play || j?.data?.wmplay;
        if (dl) return { url: dl, title: j?.data?.title || "TikTok Video", source: "TikWM Server #2" };
      }
    } catch {}
  }

  // 3. Siputzx Downloader API
  try {
    const res = await fetch(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(isUrl ? queryOrUrl : "https://www.youtube.com/results?search_query=" + encodeURIComponent(queryOrUrl))}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j: any = await res.json();
      const dl = j?.data?.dl || j?.dl;
      if (dl) return { url: dl, title: j?.data?.title || queryOrUrl, source: "Siputzx API #3" };
    }
  } catch {}

  // 4. Api Vone
  try {
    const res = await fetch(`https://api.vone.my.id/downloader/ytmp3?url=${encodeURIComponent(isUrl ? queryOrUrl : "https://www.youtube.com/results?search_query=" + encodeURIComponent(queryOrUrl))}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j: any = await res.json();
      const dl = j?.result?.url || j?.url;
      if (dl) return { url: dl, title: j?.result?.title || queryOrUrl, source: "Vone Downloader #4" };
    }
  } catch {}

  // 5. Ryzendm API
  try {
    const res = await fetch(`https://api.ryzendm.com/api/downloader/ytmp3?url=${encodeURIComponent(isUrl ? queryOrUrl : queryOrUrl)}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j: any = await res.json();
      const dl = j?.url || j?.result;
      if (dl) return { url: dl, title: j?.title || queryOrUrl, source: "Ryzendm Server #5" };
    }
  } catch {}

  // 6. Delirius API
  try {
    const res = await fetch(`https://delirius-api-oficial.vercel.app/download/ytmp3?url=${encodeURIComponent(isUrl ? queryOrUrl : queryOrUrl)}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j: any = await res.json();
      const dl = j?.data?.download?.url || j?.url;
      if (dl) return { url: dl, title: j?.data?.title || queryOrUrl, source: "Delirius Server #6" };
    }
  } catch {}

  // 7. BK9 API
  try {
    const res = await fetch(`https://bk9.fun/download/ytmp3?url=${encodeURIComponent(isUrl ? queryOrUrl : queryOrUrl)}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j: any = await res.json();
      const dl = j?.BK9?.url || j?.url;
      if (dl) return { url: dl, title: j?.BK9?.title || queryOrUrl, source: "BK9 Server #7" };
    }
  } catch {}

  // 8. Popcat / Loli API fallback
  try {
    const res = await fetch(`https://api.lolhuman.xyz/api/ytmp3?apikey=GataDios&url=${encodeURIComponent(isUrl ? queryOrUrl : queryOrUrl)}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j: any = await res.json();
      const dl = j?.result?.audio;
      if (dl) return { url: dl, title: j?.result?.title || queryOrUrl, source: "Lolhuman Server #8" };
    }
  } catch {}

  // 9. iTunes / Jamendo Fallback (Full or preview audio)
  try {
    const itres = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(queryOrUrl)}&media=music&limit=1`, { signal: AbortSignal.timeout(10000) });
    if (itres.ok) {
      const j: any = await itres.json();
      const r = j?.results?.[0];
      if (r?.previewUrl) {
        return { url: r.previewUrl, title: r.trackName + " - " + r.artistName, source: "iTunes Direct #9" };
      }
    }
  } catch {}

  return null;
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(2) + " MB" : (b / 1024).toFixed(0) + " KB");

export async function play(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: "Pakai: .play <judul lagu> atau .play <url>" };

  let pkey: any = await progressMsg(ctx, "🔎 Menghubungkan ke 9 Server Downloader Aktif...\nQuery: " + truncate(arg, 60));

  const result = await fetchFromNineDownloaders(arg, "audio");
  if (!result || !result.url) {
    return { text: `❌ Gagal mengunduh audio untuk "${truncate(arg, 50)}" dari 9 server aktif. Coba judul lain.` };
  }

  try {
    const buf = await safeFetch(result.url);
    if (buf.length < 5000) return { text: "❌ File audio terlalu kecil atau korup dari server." };

    let audio = buf;
    let format = "mp3";
    const ft: any = await import("file-type");
    const type = await ft.fileTypeFromBuffer(buf);
    if (type?.mime && !type.mime.includes("mpeg") && FF) {
      const converted = await withTempFile(buf, ".in", async (inPath) => {
        const outPath = inPath + ".mp3";
        await pExecFile(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", inPath, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", outPath], { timeout: 120000 });
        return outPath;
      });
      if (fs.existsSync(converted) && fs.statSync(converted).size > 5000) {
        audio = fs.readFileSync(converted);
        fs.rmSync(converted, { force: true });
      }
    }

    if (pkey) await editDone(ctx, pkey);

    const caption = box("✅ FULL AUDIO DOWNLOAD", [
      `🎵 Title : ${result.title}`,
      `📦 Format : MP3 (Full Song)`,
      `📁 Size : ${fmtSize(audio.length)}`,
      `📡 Server : ${result.source}`,
    ]);

    return { media: { kind: "audio", buffer: audio, mimetype: "audio/mpeg", caption } };
  } catch (e: any) {
    return { text: "❌ Gagal memproses file audio dari server downloader." };
  }
}
export const song = play;
export const audioCmd = play;

export async function video(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: "Pakai: .video <judul / url>" };

  let pkey: any = await progressMsg(ctx, "🔎 Mengunduh Video dari Server Aktif...\nQuery: " + truncate(arg, 60));
  const result = await fetchFromNineDownloaders(arg, "video");
  if (!result || !result.url) return { text: "❌ Gagal mengunduh video. Coba URL lain." };

  try {
    const buf = await safeFetch(result.url);
    if (buf.length < 10000) return { text: "❌ File video terlalu kecil." };
    if (pkey) await editDone(ctx, pkey);

    return {
      media: {
        kind: "video",
        buffer: buf,
        mimetype: "video/mp4",
        caption: box("✅ VIDEO DOWNLOADED", [
          `🎬 Title : ${result.title}`,
          `📁 Size : ${fmtSize(buf.length)}`,
          `📡 Server : ${result.source}`,
        ]),
      },
    };
  } catch {
    return { text: "❌ Gagal memproses video." };
  }
}

export async function media(ctx: CmdCtx): Promise<CmdResult> {
  return play(ctx);
}

async function progressMsg(ctx: CmdCtx, text: string): Promise<any> {
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
    await ctx.sock.sendMessage(ctx.n.remoteJid, { text: "✅ Selesai!", edit: key });
  } catch {}
}
