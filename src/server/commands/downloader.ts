/**
 * Downloader nyata berbasis yt-dlp.
 *
 * Engine ini hanya mengambil media publik yang dapat diakses tanpa login atau
 * bypass proteksi. yt-dlp menangani YouTube, TikTok, Instagram publik, dan
 * banyak situs lain melalui extractor resminya. File dibatasi 50 MB dan selalu
 * dihapus dari disk sementara setelah dikirim ke WhatsApp.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  CmdCtx,
  CmdResult,
  CmdError,
  MAX_FILE_BYTES,
  box,
  progress,
  safeFetch,
  tmpDir,
  ffmpegPath,
  sanitizeFilename,
} from "./core";

const pExecFile = promisify(execFile);
const FF = ffmpegPath();
const MAX_FILESIZE_ARG = "50M";
const COMMAND_TIMEOUT_MS = 180_000;

interface ExtractedInfo {
  title: string;
  uploader?: string;
  durationSec?: number;
  webpageUrl?: string;
  thumbnailUrl?: string;
}

interface DownloadedMedia {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  info: ExtractedInfo;
  thumbnail?: Buffer;
  engine: string;
}

function sourceFor(arg: string): string {
  return /^https?:\/\//i.test(arg) ? arg : `ytsearch1:${arg}`;
}

function ytdlpBinary(): string {
  const configured = process.env.YTDLP_PATH?.trim();
  if (configured) return configured;
  if (fs.existsSync("/usr/local/bin/yt-dlp")) return "/usr/local/bin/yt-dlp";
  return "yt-dlp";
}

function displayError(error: any): string {
  const message = String(error?.stderr || error?.message || "unknown error")
    .replace(/\s+/g, " ")
    .trim();
  if (error?.code === "ENOENT") {
    return "🥀 Engine downloader belum terpasang. Install yt-dlp dan set YTDLP_PATH bila binary tidak ada di PATH.";
  }
  if (/login|sign in|private|authentication|members only/i.test(message)) {
    return "🥀 Media ini membutuhkan login atau bersifat privat. Bot hanya memproses media publik tanpa bypass akses.";
  }
  if (/unsupported|no suitable extractor/i.test(message)) {
    return "🥀 Situs atau URL ini belum didukung extractor yt-dlp.";
  }
  return `🥀 Downloader gagal memproses media${message ? `: ${message.slice(0, 260)}` : "."}`;
}

async function runYtDlp(args: string[], timeout = COMMAND_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  try {
    return await pExecFile(ytdlpBinary(), args, {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error: any) {
    throw new CmdError(displayError(error));
  }
}

function selectInfo(raw: any): ExtractedInfo {
  const candidate = raw?._type === "playlist" ? raw?.entries?.find(Boolean) : raw;
  if (!candidate) throw new CmdError("❌ Media tidak ditemukan dari query tersebut.");
  return {
    title: String(candidate.title || candidate.fulltitle || "Media tanpa judul"),
    uploader: candidate.uploader || candidate.channel || undefined,
    durationSec: Number.isFinite(Number(candidate.duration)) ? Number(candidate.duration) : undefined,
    webpageUrl: candidate.webpage_url || candidate.original_url || undefined,
    thumbnailUrl: typeof candidate.thumbnail === "string" ? candidate.thumbnail : undefined,
  };
}

async function extractInfo(source: string): Promise<ExtractedInfo> {
  const { stdout } = await runYtDlp([
    "--ignore-config",
    "--no-warnings",
    "--no-playlist",
    "--dump-single-json",
    "--skip-download",
    source,
  ], 60_000);
  try {
    return selectInfo(JSON.parse(stdout));
  } catch (error) {
    if (error instanceof CmdError) throw error;
    throw new CmdError("❌ Metadata media tidak valid dari extractor yt-dlp.");
  }
}

function commonArgs(outputTemplate: string, source: string): string[] {
  const args = [
    "--ignore-config",
    "--no-warnings",
    "--no-playlist",
    "--abort-on-error",
    "--abort-on-unavailable-fragments",
    "--no-part",
    "--force-overwrites",
    "--restrict-filenames",
    "--retries",
    "2",
    "--socket-timeout",
    "30",
    "--max-filesize",
    MAX_FILESIZE_ARG,
    "--output",
    outputTemplate,
  ];
  if (FF) args.push("--ffmpeg-location", FF);
  args.push(source);
  return args;
}

async function downloadWithCobalt(url: string, mode: "audio" | "video", info: ExtractedInfo): Promise<DownloadedMedia> {
  const endpoint = process.env.COBALT_API_URL?.trim().replace(/\/$/, "");
  if (!endpoint) throw new CmdError("❌ URL ini ditolak extractor yt-dlp. Atur COBALT_API_URL ke instance Cobalt milik Anda untuk fallback.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      downloadMode: mode === "audio" ? "audio" : "auto",
      audioFormat: mode === "audio" ? "mp3" : undefined,
      videoQuality: "720",
      filenameStyle: "basic",
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data) throw new CmdError(`❌ Fallback downloader gagal (HTTP ${response.status}).`);
  let direct = data.url as string | undefined;
  if (data.status === "picker" && Array.isArray(data.picker)) {
    const picked = data.picker.find((item: any) => mode === "audio" ? item.type === "audio" : item.type !== "audio");
    direct = picked?.url;
  }
  if (!direct || !/^https?:\/\//i.test(direct)) {
    const code = data.error?.code ? `: ${data.error.code}` : "";
    throw new CmdError(`❌ Fallback downloader tidak menghasilkan URL media${code}.`);
  }
  const buffer = await safeFetch(direct, MAX_FILE_BYTES);
  const fileName = String(data.filename || `${sanitizeFilename(info.title)}.${mode === "audio" ? "mp3" : "mp4"}`);
  return {
    buffer,
    filename: fileName.includes(".") ? fileName : `${fileName}.${mode === "audio" ? "mp3" : "mp4"}`,
    mimetype: mode === "audio" ? "audio/mpeg" : "video/mp4",
    info,
    engine: "Cobalt self-hosted",
  };
}

async function downloadWithYtDlp(source: string, mode: "audio" | "video", info: ExtractedInfo): Promise<DownloadedMedia> {
  const workDir = await fs.promises.mkdtemp(path.join(tmpDir, "ytdlp-"));
  const outputTemplate = path.join(workDir, "download.%(ext)s");
  try {
    let args: string[];
    let expectedExt: string;
    if (mode === "audio") {
      expectedExt = "mp3";
      args = commonArgs(outputTemplate, source).slice(0, -1);
      args.push(
        "--format",
        "bestaudio/best",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "192K",
        source,
      );
    } else {
      expectedExt = "mp4";
      args = commonArgs(outputTemplate, source).slice(0, -1);
      args.push(
        "--format",
        "bv*[height<=720]+ba/b[height<=720]/bv*+ba/best",
        "--merge-output-format",
        "mp4",
        "--recode-video",
        "mp4",
        source,
      );
    }
    await runYtDlp(args);

    const files = (await fs.promises.readdir(workDir))
      .filter((name) => !name.endsWith(".part") && !name.endsWith(".ytdl"))
      .map((name) => path.join(workDir, name));
    if (!files.length) throw new CmdError("❌ yt-dlp selesai tetapi tidak menghasilkan file media.");
    const selected = files.find((file) => file.toLowerCase().endsWith(`.${expectedExt}`)) || files[0];
    const stat = await fs.promises.stat(selected);
    if (!stat.isFile() || stat.size < 64) throw new CmdError("❌ File media kosong atau rusak.");
    if (stat.size > MAX_FILE_BYTES) throw new CmdError("📦 File melebihi batas 50 MB yang didukung bot.");
    const buffer = await fs.promises.readFile(selected);
    let thumbnail: Buffer | undefined;
    if (info.thumbnailUrl) {
      try {
        thumbnail = await safeFetch(info.thumbnailUrl, 2 * 1024 * 1024);
      } catch {
        thumbnail = undefined;
      }
    }
    const fileName = `${sanitizeFilename(info.title)}.${expectedExt}`;
    return {
      buffer,
      filename: fileName,
      mimetype: mode === "audio" ? "audio/mpeg" : "video/mp4",
      info,
      thumbnail,
      engine: "yt-dlp extractor resmi",
    };
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function durationText(value?: number): string {
  if (!value || value < 0) return "-";
  const sec = Math.floor(value);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function mediaCaption(media: DownloadedMedia, mode: "audio" | "video"): string {
  return box(mode === "audio" ? "✅ AUDIO DOWNLOADED" : "✅ VIDEO DOWNLOADED", [
    `🎵 Title : ${media.info.title}`,
    `👤 Creator : ${media.info.uploader || "-"}`,
    `⏱️ Duration : ${durationText(media.info.durationSec)}`,
    `📦 Format : ${media.mimetype}`,
    `📁 Size : ${(media.buffer.length / 1048576).toFixed(2)} MB`,
    `📡 Engine : ${media.engine}`,
  ]);
}

async function downloadCommand(ctx: CmdCtx, mode: "audio" | "video"): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) {
    return { text: mode === "audio" ? `Pakai: ${ctx.bot.prefix}play <judul lagu atau URL>` : `Pakai: ${ctx.bot.prefix}video <judul atau URL>` };
  }

  const key = await progress(ctx.sock, ctx.n.remoteJid, null, `⬇️ Mencari media dengan yt-dlp...\nQuery: ${arg.slice(0, 80)}`);
  try {
    const source = sourceFor(arg);
    let info: ExtractedInfo;
    let media: DownloadedMedia;
    try {
      info = await extractInfo(source);
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, `⬇️ Mengunduh ${mode === "audio" ? "audio" : "video"} nyata...\\n${info.title.slice(0, 80)}`);
      media = await downloadWithYtDlp(source, mode, info);
    } catch (primaryError) {
      if (!/^https?:\/\//i.test(arg) || !process.env.COBALT_API_URL?.trim()) throw primaryError;
      info = { title: `Media ${new URL(arg).hostname}`, webpageUrl: arg };
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔁 Extractor utama ditolak sumber. Mencoba fallback media yang dikonfigurasi...");
      media = await downloadWithCobalt(arg, mode, info);
    }
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Selesai. Mengirim media...");
    return {
      media: {
        kind: mode,
        buffer: media.buffer,
        filename: media.filename,
        mimetype: media.mimetype,
        caption: mediaCaption(media, mode),
        jpegThumbnail: media.thumbnail,
      },
    };
  } catch (error: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Downloader gagal.");
    if (error instanceof CmdError) throw error;
    throw new CmdError(displayError(error));
  }
}

export async function play(ctx: CmdCtx): Promise<CmdResult> {
  return downloadCommand(ctx, "audio");
}

export const song = play;
export const audioCmd = play;

export async function video(ctx: CmdCtx): Promise<CmdResult> {
  return downloadCommand(ctx, "video");
}

export const tiktok = video;
export const instagram = video;
export const youtube = video;

export async function media(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: `Pakai: ${ctx.bot.prefix}media <URL atau judul>` };
  // Media umum diperlakukan sebagai video agar URL TikTok/Instagram/Reels
  // tidak salah dikirim sebagai audio. Gunakan .play untuk audio eksplisit.
  return downloadCommand(ctx, "video");
}

/** AllVid uses the existing multi-engine downloader with yt-dlp first. */
export async function allvid(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: `Pakai: ${ctx.bot.prefix}allvid <URL publik atau judul>` };
  return downloadCommand(ctx, "video");
}

/** Kept as a compatibility helper for older integrations that passed direct URLs. */
export async function downloadDirect(url: string): Promise<Buffer> {
  return safeFetch(url, MAX_FILE_BYTES);
}

// Prevent accidental unused import regressions when the helper is consumed by
// an external integration through tree-shaking.
void downloadDirect;
