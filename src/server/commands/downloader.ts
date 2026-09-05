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
import {
  createMusicSession,
  addToQueue,
  buildPlayerCaption,
  playerButtons,
  getMusicSession,
} from "../interactive/music";

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
  // Jangan salah-klasifikasi error pencarian / rate-limit sebagai privat
  if (/Sign in to confirm|confirm you.?re not a bot|bot check/i.test(message)) {
    return "🥀 YouTube meminta verifikasi. Coba lagi atau gunakan URL lengkap video.";
  }
  if (/login|sign in|private|authentication|members only/i.test(message) && !/ytsearch|no results|unable to download/i.test(message)) {
    return "🥀 Media ini membutuhkan login atau bersifat privat. Bot hanya memproses media publik tanpa bypass akses.";
  }
  if (/unsupported|no suitable extractor/i.test(message)) {
    return "🥀 Situs atau URL ini belum didukung extractor yt-dlp.";
  }
  if (/no results|unable to extract|did not return any results|not found/i.test(message)) {
    return "🥀 Lagu/video tidak ditemukan. Coba judul lebih spesifik atau tempel URL YouTube.";
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
    "--extractor-args",
    "youtube:player_client=android,ios,web,mweb;player_skip=webpage,configs",
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

/** Cari lagu via API publik + scrape YouTube (tanpa login). */
async function searchSongPublic(query: string): Promise<ExtractedInfo> {
  const q = query.trim();
  if (!q) throw new CmdError("❌ Judul lagu kosong.");

  // 1) Scrape halaman pencarian YouTube (paling andal tanpa key)
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`; // filter video
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      // videoId dari ytInitialData / watch?v=
      const idMatches = [
        ...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g),
        ...html.matchAll(/watch\?v=([a-zA-Z0-9_-]{11})/g),
      ];
      const seen = new Set<string>();
      for (const m of idMatches) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        // Ambil title di sekitar videoId bila ada
        const around = html.slice(Math.max(0, (m.index || 0) - 200), (m.index || 0) + 400);
        const titleMatch =
          around.match(/"title":\{"runs":\[\{"text":"([^"]{2,120})"\}/) ||
          around.match(/"title":\{"simpleText":"([^"]{2,120})"/) ||
          around.match(/"text":"([^"]{2,120})"/);
        const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"') : q;
        return {
          title,
          webpageUrl: `https://www.youtube.com/watch?v=${id}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      }
    }
  } catch {
    /* lanjut engine lain */
  }

  // 2) Piped API mirrors
  const pipedHosts = [
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.nosebs.ru",
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks",
  ];
  for (const host of pipedHosts) {
    try {
      const url = `${host}/search?q=${encodeURIComponent(q)}&filter=videos`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "User-Agent": BROWSER_USER_AGENT },
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const items = Array.isArray(data) ? data : data?.items || [];
      const video = items.find((it: any) => it?.url || it?.id || it?.videoId) || items[0];
      if (!video) continue;
      const id =
        video.videoId ||
        video.id ||
        String(video.url || "").match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1];
      if (!id) continue;
      return {
        title: String(video.title || video.name || q),
        uploader: video.uploaderName || video.uploader || undefined,
        durationSec: Number(video.duration) || undefined,
        webpageUrl: `https://www.youtube.com/watch?v=${id}`,
        thumbnailUrl: video.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    } catch {
      /* next */
    }
  }

  // 3) Invidious
  for (const host of ["https://invidious.nerdvpn.de", "https://vid.puffyan.us"]) {
    try {
      const res = await fetch(`${host}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "User-Agent": BROWSER_USER_AGENT },
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const video = Array.isArray(data) ? data.find((x: any) => x.videoId) : null;
      if (!video?.videoId) continue;
      return {
        title: String(video.title || q),
        uploader: video.author || undefined,
        durationSec: Number(video.lengthSeconds) || undefined,
        webpageUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
      };
    } catch {
      /* next */
    }
  }

  // 4) yt-dlp ytsearch last resort
  try {
    return await extractInfo(`ytsearch1:${q}`);
  } catch {
    throw new CmdError(
      `🥀 Lagu tidak ditemukan untuk: *${q.slice(0, 60)}*\nCoba judul lebih lengkap atau tempel URL YouTube (contoh: https://youtu.be/xxxx).`
    );
  }
}

async function resolvePlayInfo(arg: string): Promise<ExtractedInfo> {
  if (/^https?:\/\//i.test(arg)) {
    try {
      return await extractInfo(arg);
    } catch {
      // fallback: parse youtube id
      const m = arg.match(/(?:youtu\.be\/|v=|\/shorts\/)([\w-]{6,})/i);
      if (m) {
        return {
          title: arg,
          webpageUrl: `https://www.youtube.com/watch?v=${m[1]}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
        };
      }
      throw new CmdError("🥀 URL tidak bisa diproses. Pastikan link publik.");
    }
  }
  return searchSongPublic(arg);
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
  // Multi-client reduces "Sign in to confirm you're not a bot"
  if (/youtube\.com|youtu\.be|ytsearch/i.test(source)) {
    args.push(
      "--extractor-args",
      "youtube:player_client=android,ios,web,mweb,tv;player_skip=webpage,configs;skip=hls,dash"
    );
    // Optional cookies file for stubborn bot-checks
    const cookies = process.env.YTDLP_COOKIES?.trim();
    if (cookies && fs.existsSync(cookies)) {
      args.push("--cookies", cookies);
    }
  }
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
  return playV35(ctx);
}

export const song = play;
export const audioCmd = play;
export const ytmp3 = play;

export async function video(ctx: CmdCtx): Promise<CmdResult> {
  return downloadCommand(ctx, "video");
}

export const tiktok = video;
export const ytmp4 = video;
export const ttdl = video;
export const youtube = video;

export async function instagram(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: `❌ URL Instagram belum diberikan.\n\nContoh: ${ctx.bot.prefix}instagram https://www.instagram.com/reel/xxxxx/` };
  let url: URL;
  try { url = new URL(arg); } catch { return { text: "❌ URL Instagram tidak valid." }; }
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return { text: "❌ Gunakan URL Instagram yang valid." };
  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "🔎 Menganalisis URL Instagram (multi-engine)...");
  try {
    const items = await downloadInstagramWithFallbacks(url.toString(), "any", { title: `Instagram ${url.pathname}`, webpageUrl: url.toString() });
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, `✅ ${items.length} media tervalidasi. Mengirim...`);
    return {
      media: items.map((item, index) => ({
        kind: (item.kind === "image" ? "image" : "video") as "image" | "video",
        buffer: item.buffer,
        filename: item.filename,
        mimetype: item.mimetype,
        caption: `${index + 1}/${items.length} • ${item.kind === "image" ? "IMAGE" : "VIDEO"} • ${item.engine || "Instagram"}`,
      })),
    };
  } catch (error: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "❌ Media Instagram gagal diproses.");
    if (error instanceof CmdError) throw error;
    throw new CmdError("❌ Media Instagram gagal. Pastikan URL publik (bukan private).");
  }
}
export async function igdl(ctx: CmdCtx): Promise<CmdResult> { return instagram(ctx); }
export async function instagramvideo(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: `Pakai: ${ctx.bot.prefix}instagramvideo <URL>` };
  let url: URL;
  try { url = new URL(arg); } catch { return { text: "❌ URL tidak valid." }; }
  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "🔎 Download video Instagram...");
  try {
    const items = await downloadInstagramWithFallbacks(url.toString(), "video", { title: "IG Video", webpageUrl: url.toString() });
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Mengirim...");
    return { media: items.map((item) => ({ kind: "video" as const, buffer: item.buffer, filename: item.filename, mimetype: item.mimetype, caption: item.engine })) };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "❌ Gagal.");
    throw e instanceof CmdError ? e : new CmdError(String(e?.message || e));
  }
}
export async function instagramphoto(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) return { text: `Pakai: ${ctx.bot.prefix}instagramphoto <URL>` };
  let url: URL;
  try { url = new URL(arg); } catch { return { text: "❌ URL tidak valid." }; }
  const key = await progress(ctx.sock, ctx.n.remoteJid, null, "🔎 Download foto Instagram...");
  try {
    const items = await downloadInstagramWithFallbacks(url.toString(), "image", { title: "IG Photo", webpageUrl: url.toString() });
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Mengirim...");
    return { media: items.map((item) => ({ kind: "image" as const, buffer: item.buffer, filename: item.filename, mimetype: item.mimetype, caption: item.engine })) };
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "❌ Gagal.");
    throw e instanceof CmdError ? e : new CmdError(String(e?.message || e));
  }
}

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

/* ===== V3.5 UPGRADE: external MP3 endpoints + improved play flow ===== */
const YT_MP3_ENDPOINTS = [
  "https://fashionmaya.pl",
  "https://eastsidediner.ca",
  "https://yt5s.io",
  "https://y2mate.nu",
];

async function tryY2MateStyle(url: string, info: ExtractedInfo): Promise<DownloadedMedia | null> {
  for (const base of YT_MP3_ENDPOINTS) {
    try {
      const analyzeUrl = `${base}/mates/analyze/ajax`;
      const form = new URLSearchParams({ url, q_auto: "0", ajax: "1" });
      const res = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": BROWSER_USER_AGENT,
          Referer: base + "/",
        },
        body: form,
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const data: any = await res.json().catch(() => null);
      if (!data) continue;
      const html = typeof data.result === "string" ? data.result : JSON.stringify(data);
      const idMatch = html.match(/k__id\s*=\s*["']([^"']+)/) || html.match(/data-id=["']([^"']+)/) || html.match(/"id"\s*:\s*"([^"]+)"/);
      const titleMatch = html.match(/k_data_vtitle\s*=\s*["']([^"']+)/) || html.match(/<b[^>]*>([^<]+)/);
      if (!idMatch) continue;
      const kId = idMatch[1];
      const convertForm = new URLSearchParams({
        type: "youtube",
        _id: kId,
        v_id: kId,
        ajax: "1",
        token: "",
        ftype: "mp3",
        fquality: "128",
      });
      const convertRes = await fetch(`${base}/mates/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": BROWSER_USER_AGENT,
          Referer: base + "/",
        },
        body: convertForm,
        signal: AbortSignal.timeout(45000),
      });
      if (!convertRes.ok) continue;
      const convertData: any = await convertRes.json().catch(() => null);
      const resultHtml = typeof convertData?.result === "string" ? convertData.result : JSON.stringify(convertData || {});
      const urls = mediaUrls(resultHtml);
      for (const direct of urls.slice(0, 5)) {
        try {
          const fetched = await fetchDirectMedia(direct, base);
          const mime = fetched.detected?.mime || "audio/mpeg";
          if (!mime.startsWith("audio/") && !mime.includes("mpeg") && !mime.includes("mp3") && !mime.includes("octet")) continue;
          return {
            buffer: fetched.buffer,
            filename: `${sanitizeFilename(titleMatch?.[1] || info.title)}.mp3`,
            mimetype: "audio/mpeg",
            info: { ...info, title: titleMatch?.[1] || info.title },
            engine: `Y2Mate-style (${new URL(base).hostname})`,
          };
        } catch { /* next url */ }
      }
    } catch { /* next endpoint */ }
  }

  // loader.to / similar ajax pattern
  try {
    const form = new URLSearchParams({
      format: "mp3",
      url,
      ajax: "1",
    });
    const res = await fetch("https://loader.to/ajax/download.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": BROWSER_USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      const id = data?.id || data?.hash;
      if (id) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const prog = await fetch(`https://loader.to/ajax/progress.php?id=${id}`, {
            signal: AbortSignal.timeout(10000),
            headers: { "User-Agent": BROWSER_USER_AGENT },
          });
          const pj: any = await prog.json().catch(() => null);
          const downloadUrl = pj?.download_url || pj?.url;
          if (downloadUrl && /^https?:\/\//i.test(downloadUrl)) {
            const fetched = await fetchDirectMedia(downloadUrl, "https://loader.to/");
            return {
              buffer: fetched.buffer,
              filename: `${sanitizeFilename(info.title)}.mp3`,
              mimetype: fetched.detected?.mime || "audio/mpeg",
              info,
              engine: "loader.to",
            };
          }
          if (pj?.success === 0 || pj?.text === "Error") break;
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}

async function downloadInstagramWithFallbacks(url: string, mode: "image" | "video" | "any", info: ExtractedInfo): Promise<DownloadedMedia[]> {
  const errors: string[] = [];
  // 1) yt-dlp
  try {
    return await downloadInstagramMedia(url, mode, info);
  } catch (e: any) {
    errors.push(`yt-dlp: ${String(e?.message || e).slice(0, 120)}`);
  }
  // 2) Snap-Insta / web services
  try {
    const media = await downloadWithWebServices(url, mode === "image" ? "video" : "video", info);
    if (media) {
      const kind = mediaKind(media.mimetype);
      if (mode === "image" && kind !== "image") throw new Error("bukan image");
      if (mode === "video" && kind !== "video") throw new Error("bukan video");
      return [media];
    }
  } catch (e: any) {
    errors.push(`web: ${String(e?.message || e).slice(0, 120)}`);
  }
  // 3) Cobalt fallback
  if (process.env.COBALT_API_URL?.trim()) {
    try {
      const media = await downloadWithCobalt(url, mode === "image" ? "video" : "video", info);
      return [media];
    } catch (e: any) {
      errors.push(`cobalt: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  throw new CmdError(`❌ Instagram gagal di semua engine. ${errors.join(" | ")}`);
}

export async function playV35(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) {
    return { text: `Pakai: ${ctx.bot.prefix}play <judul lagu atau URL YouTube>` };
  }

  // Step 1: cari via API publik (Piped/Invidious) lalu yt-dlp
  const key = await progress(ctx.sock, ctx.n.remoteJid, null, `🔎 Mencari: *${arg.slice(0, 60)}*...`);
  let info: ExtractedInfo;
  try {
    info = await resolvePlayInfo(arg);
  } catch (e: any) {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Lagu tidak ditemukan.");
    throw e instanceof CmdError ? e : new CmdError(displayError(e));
  }

  // Step 2: kirim thumbnail + "ntar nih lagi di download"
  let thumbBuf: Buffer | undefined;
  if (info.thumbnailUrl) {
    try { thumbBuf = await safeFetch(info.thumbnailUrl, 2 * 1024 * 1024); } catch { /* ignore */ }
  }
  const previewCaption = [
    "╭─━━━━━━━━━━━━━━━━━━━─╮",
    "│  🎧  *TRACK FOUND*",
    "╰─━━━━━━━━━━━━━━━━━━━─╯",
    "",
    `🎵 *${info.title}*`,
    `🎤 ${info.uploader || "Unknown Artist"}`,
    `⏱️ ${durationText(info.durationSec)}`,
    info.webpageUrl ? `🔗 ${info.webpageUrl}` : "",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "⬇️  _Sedang mengunduh audio..._",
    "⏳  _Tunggu sebentar ya_",
  ].filter(Boolean).join("\n");
  if (thumbBuf) {
    try {
      await ctx.sock.sendMessage(ctx.n.remoteJid, {
        image: thumbBuf,
        caption: previewCaption,
      });
    } catch {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, previewCaption);
    }
  } else if (key) {
    await progress(ctx.sock, ctx.n.remoteJid, key, previewCaption);
  }

  // Step 3: unduh MP3 — multi engine (yt-dlp dulu, lalu Cobalt, lalu converter)
  const ytUrl = info.webpageUrl || (/^https?:\/\//i.test(arg) ? arg : undefined);
  const errors: string[] = [];

  async function sendAudio(media: DownloadedMedia): Promise<CmdResult> {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "✅ Selesai. Mengirim audio...");
    return {
      media: {
        kind: "audio",
        buffer: media.buffer,
        filename: media.filename,
        mimetype: media.mimetype || "audio/mpeg",
        caption: mediaCaption(media, "audio"),
        jpegThumbnail: media.thumbnail || thumbBuf,
      },
    };
  }

  // 3a) yt-dlp (paling andal di Docker dengan binary resmi)
  try {
    if (key) await progress(ctx.sock, ctx.n.remoteJid, key, `⬇️ Mengunduh MP3: ${info.title.slice(0, 50)}`);
    // Prefer explicit YouTube URL; if only title, use ytsearch1
    const src = ytUrl || `ytsearch1:${arg}`;
    const media = await downloadWithYtDlp(src, "audio", info);
    return await sendAudio(media);
  } catch (e: any) {
    errors.push(`yt-dlp: ${String(e?.message || e).slice(0, 120)}`);
  }

  // 3b) Cobalt self-hosted (jika diset)
  if (ytUrl && process.env.COBALT_API_URL?.trim()) {
    try {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "⬇️ Download via Cobalt...");
      const media = await downloadWithCobalt(ytUrl, "audio", info);
      return await sendAudio(media);
    } catch (e: any) {
      errors.push(`cobalt: ${String(e?.message || e).slice(0, 80)}`);
    }
  }

  // 3c) External converter (Y2Mate-style) — last resort
  if (ytUrl && /youtube\.com|youtu\.be/i.test(ytUrl)) {
    try {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "⬇️ Download via converter...");
      const media = await tryY2MateStyle(ytUrl, info);
      if (media) return await sendAudio(media);
      errors.push("converter: no media");
    } catch (e: any) {
      errors.push(`converter: ${String(e?.message || e).slice(0, 80)}`);
    }
  }

  // 3d) Second yt-dlp attempt with pure ytsearch if first used URL that failed
  if (ytUrl) {
    try {
      if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "⬇️ Retry yt-dlp (ytsearch)...");
      const media = await downloadWithYtDlp(`ytsearch1:${info.title}`, "audio", info);
      return await sendAudio(media);
    } catch (e: any) {
      errors.push(`yt-dlp-retry: ${String(e?.message || e).slice(0, 80)}`);
    }
  }

  if (key) await progress(ctx.sock, ctx.n.remoteJid, key, "🥀 Gagal download audio.");
  throw new CmdError(
    `🥀 Gagal mengunduh audio untuk *${info.title.slice(0, 50)}*.\n` +
    `Tips:\n` +
    `• Tempel URL YouTube lengkap (https://youtu.be/... )\n` +
    `• Pastikan yt-dlp terpasang (Docker image sudah include)\n` +
    `• Opsional: set COBALT_API_URL atau YTDLP_COOKIES di server\n` +
    (errors.length ? `Detail: ${errors.join(" | ").slice(0, 220)}` : "")
  );
}


/* ===== Spotify Client Credentials search for .play2 ===== */
let _spotifyToken: { access: string; exp: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const id = (process.env.SPOTIFY_CLIENT_ID || "").trim();
  const secret = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!id || !secret) return null;
  if (_spotifyToken && Date.now() < _spotifyToken.exp - 30000) return _spotifyToken.access;
  try {
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    if (!j.access_token) return null;
    _spotifyToken = { access: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return _spotifyToken.access;
  } catch {
    return null;
  }
}

export async function searchSpotifyTrack(query: string): Promise<{
  title: string;
  artist: string;
  duration: number;
  thumbnail?: string;
  externalUrl?: string;
  uri?: string;
} | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const t = j?.tracks?.items?.[0];
    if (!t) return null;
    return {
      title: t.name || query,
      artist: (t.artists || []).map((a: any) => a.name).filter(Boolean).join(", ") || "Unknown",
      duration: Math.round((t.duration_ms || 0) / 1000),
      thumbnail: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url,
      externalUrl: t.external_urls?.spotify,
      uri: t.uri,
    };
  } catch {
    return null;
  }
}

export async function play2(ctx: CmdCtx): Promise<CmdResult> {
  const arg = ctx.arg.trim();
  if (!arg) {
    return {
      text:
        `🎵 *PLAY2 — Interactive Music Player*\n\n` +
        `Pakai: ${ctx.bot.prefix}play2 <judul lagu>\n` +
        `Contoh: ${ctx.bot.prefix}play2 montagem\n\n` +
        `Setelah lagu diputar, gunakan tombol:\n` +
        `▶️/⏸️  ⏮️  ⏭️  ⏹️  📃 Queue`,
    };
  }

  // Re-use the solid playV35 download pipeline
  const audioResult = await playV35(ctx);
  if (!audioResult.media) {
    return audioResult;
  }

  const mediaItem = Array.isArray(audioResult.media) ? audioResult.media[0] : audioResult.media;
  if (!mediaItem || mediaItem.kind !== "audio") {
    return audioResult;
  }

  // Spotify metadata first (if SPOTIFY_CLIENT_ID/SECRET set)
  const sp = await searchSpotifyTrack(arg).catch(() => null);
  const titleMatch = (audioResult.text || mediaItem.caption || arg).match(/\*(.+?)\*/);
  const title = (sp?.title || (titleMatch ? titleMatch[1] : arg)).slice(0, 60);
  const artist = sp?.artist || "Unknown";
  const duration = sp?.duration || 0;
  const track = {
    title,
    artist,
    duration,
    thumbnail: sp?.thumbnail,
    audioBuffer: mediaItem.buffer,
    mimetype: mediaItem.mimetype || "audio/mpeg",
    filename: mediaItem.filename || "track.mp3",
    engine: sp ? "play2+spotify" : "play2",
  };

  // Generate neon player card (visual closer to the screenshot)
  let cardBuf: Buffer | null = null;
  try {
    const { renderPlayerCard } = await import("../interactive/render/playerCard");
    cardBuf = await renderPlayerCard({
      title: track.title,
      artist: track.artist,
      positionSec: 3,
      durationSec: track.duration || 102,
      status: "playing",
    });
  } catch (e) {
    console.error("[PLAY2] player card render failed", e);
  }

  const existing = getMusicSession(ctx.bot.id, ctx.n.remoteJid);
  if (existing) {
    addToQueue(ctx.bot.id, ctx.n.remoteJid, track);
    const s = getMusicSession(ctx.bot.id, ctx.n.remoteJid)!;
    const media: any[] = [];
    if (cardBuf) {
      media.push({
        kind: "image" as const,
        buffer: cardBuf,
        mimetype: "image/png",
        caption: `➕ Ditambahkan ke antrean\n\n${buildPlayerCaption(s)}`,
      });
    }
    media.push({
      kind: "audio" as const,
      buffer: track.audioBuffer!,
      mimetype: track.mimetype,
      filename: track.filename,
      ptt: false,
    });
    return {
      text: cardBuf ? undefined : `➕ Ditambahkan ke antrean.\n\n${buildPlayerCaption(s)}`,
      buttons: playerButtons(s),
      media,
    };
  }

  const session = createMusicSession(ctx.bot.id, ctx.n.remoteJid, track);
  const media: any[] = [];
  if (cardBuf) {
    media.push({
      kind: "image" as const,
      buffer: cardBuf,
      mimetype: "image/png",
      caption: buildPlayerCaption(session),
    });
  }
  media.push({
    kind: "audio" as const,
    buffer: track.audioBuffer!,
    mimetype: track.mimetype,
    filename: track.filename,
    ptt: false,
  });
  return {
    text: cardBuf ? undefined : buildPlayerCaption(session) + "\n\nGunakan tombol di bawah untuk kontrol.",
    buttons: playerButtons(session),
    media,
  };
}
