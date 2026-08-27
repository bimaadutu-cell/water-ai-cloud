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
  validateExternalUrl,
} from "./core";

const pExecFile = promisify(execFile);
const FF = ffmpegPath();
const MAX_FILESIZE_ARG = "50M";
const COMMAND_TIMEOUT_MS = 180_000;
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async function fetchDirectMedia(url: string, referer?: string): Promise<{ buffer: Buffer; detected: { mime: string; ext: string } | undefined }> {
  validateExternalUrl(url);
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(90_000),
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "video/*,audio/*,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
    });
  } catch (error: any) {
    throw new CmdError(`❌ Gagal mengambil file media: ${String(error?.message || "timeout").slice(0, 160)}`);
  }
  if (!response.ok) throw new CmdError(`❌ Sumber media menolak request (HTTP ${response.status}).`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_FILE_BYTES) throw new CmdError("📦 File melebihi batas 50 MB yang didukung bot.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 64) throw new CmdError("❌ Respons media kosong atau tidak valid.");
  if (buffer.length > MAX_FILE_BYTES) throw new CmdError("📦 File melebihi batas 50 MB yang didukung bot.");
  const detected = await (await import("file-type")).fileTypeFromBuffer(buffer);
  return { buffer, detected };
}

function mediaKind(mime: string): "image" | "video" | "audio" {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "video";
}

interface ExtractedInfo {
  title: string;
  uploader?: string;
  durationSec?: number;
  webpageUrl?: string;
  thumbnailUrl?: string;
}

interface DownloadedMedia {
  buffer: Buffer;
  kind?: "image" | "video" | "audio";
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
  const args = [
    "--ignore-config",
    "--no-warnings",
    "--no-playlist",
    "--dump-single-json",
    "--skip-download",
    "--user-agent",
    BROWSER_USER_AGENT,
    "--add-header",
    "Accept-Language:en-US,en;q=0.9",
  ];
  if (/tiktok.com|douyin.com/i.test(source)) args.push("--referer", "https://www.tiktok.com/");
  args.push(source);
  const { stdout } = await runYtDlp(args, 60_000);
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
    "--user-agent",
    BROWSER_USER_AGENT,
    "--add-header",
    "Accept-Language:en-US,en;q=0.9",
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
  const fetched = await fetchDirectMedia(direct);
  if (!fetched.detected) throw new CmdError("Fallback mengembalikan file dengan format yang tidak dikenal.");
  const detectedMime = fetched.detected.mime;
  const expectedKind = mode === "audio" ? "audio/" : "video/";
  if (!detectedMime.startsWith(expectedKind)) throw new CmdError(`Fallback mengembalikan MIME tidak sesuai: ${detectedMime}.`);
  const fileName = String(data.filename || `${sanitizeFilename(info.title)}.${mode === "audio" ? "mp3" : "mp4"}`);
  return {
    buffer: fetched.buffer,
    filename: fileName.includes(".") ? fileName : `${fileName}.${mode === "audio" ? "mp3" : "mp4"}`,
    mimetype: detectedMime,
    info,
    engine: "Cobalt self-hosted",
  };
}

function serviceCandidates(url: string): { name: string; page: string }[] {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("tiktok.com") || host.includes("douyin.com")) return [
    { name: "SnapTik.net", page: "https://snaptik.net/en" },
    { name: "SnapTik.app", page: "https://snaptik.app" },
  ];
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return [{ name: "Snap-Insta.to", page: "https://snap-insta.to/id" }];
  return [];
}

function pageVar(page: string, key: string): string | undefined {
  const match = page.match(new RegExp(`(?:var\\s+)?${key}\\s*=\\s*[\\"']([^\\"']+)`));
  return match?.[1];
}

async function downloadWithTikwm(url: string, mode: "audio" | "video", info: ExtractedInfo): Promise<DownloadedMedia> {
  const endpoint = new URL("https://www.tikwm.com/api/");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("hd", "1");
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "User-Agent": BROWSER_USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data || data.code !== 0 || !data.data) {
    throw new CmdError(`TikWM gagal memproses URL (HTTP ${response.status}).`);
  }
  const direct = mode === "audio" ? data.data.music : (data.data.hdplay || data.data.play || data.data.wmplay);
  if (typeof direct !== "string" || !/^https?:\/\//i.test(direct)) {
    throw new CmdError(`TikWM tidak menyediakan ${mode === "audio" ? "audio MP3" : "video MP4"} untuk URL ini.`);
  }
  const fetched = await fetchDirectMedia(direct, "https://www.tikwm.com/");
  const mime = fetched.detected?.mime || (mode === "audio" ? "audio/mpeg" : "video/mp4");
  const valid = mode === "audio" ? mime.startsWith("audio/") : mime.startsWith("video/");
  if (!valid) throw new CmdError(`TikWM mengembalikan MIME tidak sesuai: ${mime}.`);
  const ext = fetched.detected?.ext || (mode === "audio" ? "mp3" : "mp4");
  return {
    buffer: fetched.buffer,
    filename: `${sanitizeFilename(String(data.data.title || info.title))}.${ext}`,
    mimetype: mime,
    info: { ...info, title: String(data.data.title || info.title), uploader: data.data.author?.unique_id || data.data.author?.nickname || info.uploader, durationSec: Number(data.data.duration) || info.durationSec },
    engine: "TikWM API",
  };
}

function mediaUrls(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const decoded = text.replaceAll("\\/", "/").replaceAll("&amp;", "&").replaceAll("\\u0026", "&");
  const found = new Set<string>();
  for (const match of decoded.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)) {
    const candidate = match[0].replace(/[),.;]+$/, "");
    if (!/^https?:\/\//i.test(candidate)) continue;
    if (/\.(?:mp4|webm|mov|m4v|jpg|jpeg|png|webp)(?:[?#]|$)/i.test(candidate) || /(?:cdn|download|media|video|image)/i.test(candidate)) found.add(candidate);
  }
  return [...found].sort((a, b) => {
    const score = (value: string) => {
      let result = 0;
      if (/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(value)) result += 10;
      if (/(?:download|video|stream|play)/i.test(value)) result += 5;
      if (/(?:snapcdn|\/get\?)/i.test(value)) result += 8;
      if (/\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i.test(value)) result -= 2;
      return result;
    };
    return score(b) - score(a);
  });
}

async function downloadFromWebService(url: string, mode: "audio" | "video", info: ExtractedInfo, candidate: { name: string; page: string }): Promise<DownloadedMedia> {
  const pageResponse = await fetch(candidate.page, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Mozilla/5.0 (compatible; WaterAICloud/1.0)" } });
  if (!pageResponse.ok) throw new CmdError(`${candidate.name} tidak tersedia (HTTP ${pageResponse.status}).`);
  const page = await pageResponse.text();
  const endpoint = pageVar(page, "k_url_search") || "/api/ajaxSearch";
  const token = pageVar(page, "k_token");
  const exp = pageVar(page, "k_exp");
  if (!token || !exp) throw new CmdError(`${candidate.name} tidak memberikan token request.`);
  const form = new URLSearchParams({ k_exp: exp, k_token: token, q: url, t: "video", lang: pageVar(page, "k_lang") || "en", v: "v2", html: "" });
  const response = await fetch(new URL(endpoint, candidate.page).toString(), {
    method: "POST",
    headers: { Accept: "application/json, text/javascript, */*; q=0.01", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: candidate.page, "User-Agent": "Mozilla/5.0 (compatible; WaterAICloud/1.0)" },
    body: form,
    signal: AbortSignal.timeout(90000),
  });
  const raw = await response.text();
  if (!response.ok) throw new CmdError(`${candidate.name} gagal memproses URL (HTTP ${response.status}).`);
  let parsed: unknown = raw;
  try { parsed = JSON.parse(raw); } catch { /* hasil bisa berupa HTML/JS */ }
  const urls = mediaUrls(parsed);
  if (!urls.length) throw new CmdError(`${candidate.name} tidak mengembalikan URL media; kemungkinan token kedaluwarsa, CAPTCHA, atau struktur berubah.`);
  let lastError = "";
  for (const direct of urls.slice(0, 8)) {
    try {
      const fetched = await fetchDirectMedia(direct, candidate.page);
      const detected = fetched.detected;
      if (!detected) continue;
      const kind = mediaKind(detected.mime);
      if (mode === "audio" && kind !== "audio") continue;
      if (mode === "video" && kind === "audio") continue;
      const ext = detected.ext || (kind === "audio" ? "mp3" : kind === "image" ? "jpg" : "mp4");
      return { buffer: fetched.buffer, filename: `${sanitizeFilename(info.title)}.${ext}`, mimetype: detected.mime, info, engine: candidate.name };
    } catch (error: any) { lastError = String(error?.message || error); }
  }
  throw new CmdError(`${candidate.name} menemukan URL tetapi media tidak dapat diambil${lastError ? `: ${lastError.slice(0, 160)}` : "."}`);
}

async function downloadWithWebServices(url: string, mode: "audio" | "video", info: ExtractedInfo): Promise<DownloadedMedia> {
  const errors: string[] = [];
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("tiktok.com") || host.includes("douyin.com")) {
    try { return await downloadWithTikwm(url, mode, info); }
    catch (error: any) { errors.push(`TikWM API: ${String(error?.message || error).replace(/^🥀\s*/, "")}`); }
  }
  for (const candidate of serviceCandidates(url)) {
    try { return await downloadFromWebService(url, mode, info, candidate); }
    catch (error: any) { errors.push(`${candidate.name}: ${String(error?.message || error).replace(/^🥀\\s*/, "")}`); }
  }
  throw new CmdError(`🥀 Semua web engine gagal. ${errors.join(" | ")}`);
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

async function convertVideoToMp4(input: string, output: string): Promise<void> {
  if (!FF) throw new CmdError("❌ FFmpeg tidak tersedia untuk mengonversi video ke MP4.");
  try {
    await pExecFile(FF, ["-y", "-i", input, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  } catch {
    throw new CmdError("❌ Media gagal dikonversi menjadi MP4.");
  }
  const stat = await fs.promises.stat(output).catch(() => null);
  if (!stat?.isFile() || stat.size < 64 || stat.size > MAX_FILE_BYTES) throw new CmdError("❌ Hasil konversi MP4 tidak valid atau terlalu besar.");
}

async function validateDownloadedMedia(file: string, workDir: string, forced: "image" | "video" | "any"): Promise<{ buffer: Buffer; filename: string; mimetype: string; kind: "image" | "video" }> {
  const original = await fs.promises.readFile(file);
  const detected = await (await import("file-type")).fileTypeFromBuffer(original);
  if (!detected || original.length < 64 || original.length > MAX_FILE_BYTES) throw new CmdError("❌ Media gagal diproses.");
  const kind = mediaKind(detected.mime);
  if (kind === "audio" || (forced !== "any" && kind !== forced)) throw new CmdError("❌ Tipe media tidak sesuai command.");
  if (kind === "video" && detected.mime !== "video/mp4") {
    const output = path.join(workDir, `converted-${Date.now()}.mp4`);
    await convertVideoToMp4(file, output);
    return { buffer: await fs.promises.readFile(output), filename: `${sanitizeFilename(path.basename(file, path.extname(file)))}.mp4`, mimetype: "video/mp4", kind: "video" };
  }
  const ext = kind === "video" ? "mp4" : (detected.ext || "jpg");
  return { buffer: original, filename: `${sanitizeFilename(path.basename(file, path.extname(file)))}.${ext}`, mimetype: kind === "video" ? "video/mp4" : detected.mime, kind };
}

async function downloadInstagramMedia(url: string, mode: "image" | "video" | "any", info: ExtractedInfo): Promise<DownloadedMedia[]> {
  const workDir = await fs.promises.mkdtemp(path.join(tmpDir, "instagram-"));
  try {
    const outputTemplate = path.join(workDir, "item-%(playlist_index)03d.%(ext)s");
    const args = ["--ignore-config", "--no-warnings", "--yes-playlist", "--abort-on-error", "--abort-on-unavailable-fragments", "--no-part", "--force-overwrites", "--restrict-filenames", "--retries", "2", "--socket-timeout", "30", "--max-filesize", MAX_FILESIZE_ARG, "--output", outputTemplate, "--user-agent", BROWSER_USER_AGENT, "--add-header", "Accept-Language:en-US,en;q=0.9"];
    if (FF) args.push("--ffmpeg-location", FF);
    args.push(url);
    await runYtDlp(args);
    const files = (await fs.promises.readdir(workDir)).filter((name) => !name.endsWith(".part") && !name.endsWith(".ytdl") && !name.startsWith("converted-")).sort().map((name) => path.join(workDir, name));
    if (!files.length) throw new CmdError("❌ Instagram tidak menghasilkan media publik.");
    const output: DownloadedMedia[] = [];
    for (const file of files.slice(0, 12)) {
      try {
        const valid = await validateDownloadedMedia(file, workDir, mode);
        output.push({ buffer: valid.buffer, kind: valid.kind, filename: valid.filename, mimetype: valid.mimetype, info, engine: "yt-dlp Instagram extractor" });
      } catch {
        // Carousels may mix photos and videos; skip non-matching items and
        // report an error only when no valid item remains.
      }
    }
    if (!output.length) throw new CmdError("❌ Media Instagram tidak sesuai tipe atau gagal divalidasi.");
    return output;
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
  const kind = mediaKind(media.mimetype);
  return box(kind === "audio" ? "✅ AUDIO DOWNLOADED" : kind === "image" ? "✅ IMAGE DOWNLOADED" : "✅ VIDEO DOWNLOADED", [
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

  const key = await progress(ctx.sock, ctx.n.remoteJid, null, `⬇️ Mencari media dengan engine resmi...\nQuery: ${arg.slice(0, 80)}`);
  try {
    const source = sourceFor(arg);
    let info: ExtractedInfo;
    let media: DownloadedMedia;
    if (/^https?:\/\//i.test(arg) && serviceCandidates(arg).length) {
      info = { title: `Media ${new URL(arg).hostname}`, webpageUrl: arg };
      try {
        if (key) await progress(ctx.sock, ctx.n.remoteJid, key, `⬇️ Memproses ${new URL(arg).hostname} dengan engine web...`);
        media = await downloadWithWebServices(arg, mode, info);
      } catch (webError) {
        if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔁 Engine web gagal. Mencoba yt-dlp extractor resmi...");
        try {
          info = await extractInfo(source);
          media = await downloadWithYtDlp(source, mode, info);
        } catch (primaryError) {
          if (!process.env.COBALT_API_URL?.trim()) throw webError;
          if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🔁 Extractor utama gagal. Mencoba fallback media yang dikonfigurasi...");
          media = await downloadWithCobalt(arg, mode, info);
        }
      }
    } else {
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
    }
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Selesai. Mengirim media...");
    return {
      media: {
        kind: mediaKind(media.mimetype),
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

async function instagramCommand(ctx: CmdCtx, mode: "image" | "video" | "any"): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: `❌ URL Instagram belum diberikan.\n\nContoh: ${ctx.bot.prefix}${mode === "image" ? "instagramphoto" : mode === "video" ? "instagramvideo" : "instagram"} https://www.instagram.com/reel/xxxxx/` };
  let url: URL;
  try { url = new URL(arg); } catch { return { text: "❌ URL Instagram tidak valid." }; }
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return { text: "❌ Gunakan URL Instagram yang valid." };
  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "🔎 Menganalisis URL Instagram...");
  try {
    const items = await downloadInstagramMedia(url.toString(), mode, { title: `Instagram ${url.pathname}`, webpageUrl: url.toString() });
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, `✅ ${items.length} media tervalidasi. Mengirim...`);
    return { media: items.map((item, index) => ({ kind: item.kind === "image" ? "image" as const : "video" as const, buffer: item.buffer, filename: item.filename, mimetype: item.mimetype, caption: `${index + 1}/${items.length} • ${item.kind === "image" ? "IMAGE" : "VIDEO MP4"} • Instagram` })) };
  } catch (error: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "❌ Media Instagram gagal diproses.");
    if (error instanceof CmdError) throw error;
    throw new CmdError("❌ Media Instagram gagal diproses. Silakan gunakan URL publik lain.");
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
export async function instagram(ctx: CmdCtx): Promise<CmdResult> { return instagramCommand(ctx, "any"); }
export async function igdl(ctx: CmdCtx): Promise<CmdResult> { return instagramCommand(ctx, "any"); }
export async function instagramvideo(ctx: CmdCtx): Promise<CmdResult> { return instagramCommand(ctx, "video"); }
export async function instagramphoto(ctx: CmdCtx): Promise<CmdResult> { return instagramCommand(ctx, "image"); }
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
