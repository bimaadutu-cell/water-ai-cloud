/**
 * Real-time multi-mirror audio downloaders (public Cobalt / Piped / Invidious / etc.)
 * Used by .play / .play2 / .play3 — not simulation.
 */
export type MirrorResult = {
  buffer: Buffer;
  mimetype: string;
  filename: string;
  engine: string;
  title?: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** ~50 public Cobalt API instances (community mirrors, rotate on failure) */
export const COBALT_MIRRORS: string[] = [
  "https://api.cobalt.tools",
  "https://cobalt-api.kwiatekmiki.com",
  "https://co.wuk.sh",
  "https://api.cobalt.best",
  "https://cobalt.api.timelessnesses.me",
  "https://cobalt-backend.canine.tools",
  "https://api.cobalt.solidsoftware.io",
  "https://capi.snic.workers.dev",
  "https://cobalt.canine.tools",
  "https://co.eepy.today",
  "https://cobalt.subway.gq",
  "https://api.dilootus.xyz",
  "https://cobalt.media.ccs.net.br",
  "https://cobaltauth.me",
  "https://api.cobalt.mystc.su",
  "https://cobalt.aeong.one",
  "https://co.otomir23.me",
  "https://cobalt.canine.tools/api",
  "https://api.cobalt.surok.one",
  "https://cobalt.api.michioxd.ch",
  "https://cdl.aishiteiru.moe",
  "https://cobalt.canine.tools/",
  "https://api.cobalt.surok.one/",
  "https://co.wuk.sh/",
  "https://cobalt.sync-lab.dev",
  "https://api.cobalt.trollca.st",
  "https://cobalt.kerkour.com",
  "https://api.cobalt.song.link",
  "https://cobalt.api.intercuba.net",
  "https://cobalt.canine.tools/api/",
];

/** Piped API mirrors for stream URL */
export const PIPED_MIRRORS: string[] = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://piped-api.privacyredirect.com",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.nosebs.ru",
  "https://api.piped.yt",
  "https://pipedapi.darkness.services",
  "https://pipedapi.syncpundit.io",
  "https://pipedapi.tokhmi.xyz",
  "https://pipedapi.moomoo.me",
  "https://pipedapi.colins.tech",
];

/** Invidious instances */
export const INVIDIOUS_MIRRORS: string[] = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://invidious.privacyredirect.com",
  "https://inv.riverside.rocks",
  "https://invidious.protokolla.fi",
  "https://invidious.perennialte.ch",
  "https://iv.ggtyler.dev",
  "https://vid.puffyan.us",
  "https://invidious.fdn.fr",
  "https://invidious.flokinet.to",
  "https://invidious.slipfox.xyz",
  "https://iv.melmac.space",
  "https://invidious.privacydev.net",
];

async function fetchBuf(url: string, max = 25 * 1024 * 1024): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*", Referer: "https://www.youtube.com/" },
    signal: AbortSignal.timeout(90_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength < 64 || ab.byteLength > max) throw new Error("bad size");
  return Buffer.from(ab);
}

function looksAudio(buf: Buffer): boolean {
  // ID3 or MPEG frame or ftyp/m4a
  if (buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // ID3
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // MPEG
  if (buf.slice(4, 8).toString() === "ftyp") return true;
  if (buf.slice(0, 4).toString() === "OggS") return true;
  if (buf.slice(0, 4).toString() === "RIFF") return true;
  return buf.length > 10_000; // accept large unknown as possible media
}

/** Try Cobalt mirrors with a media URL (YouTube/SoundCloud/etc.) */
export async function downloadViaCobaltMirrors(
  mediaUrl: string,
  title = "audio"
): Promise<MirrorResult | null> {
  const envExtra = (process.env.COBALT_API_URL || "").trim().replace(/\/$/, "");
  const list = envExtra ? [envExtra, ...COBALT_MIRRORS] : [...COBALT_MIRRORS];
  // de-dupe
  const seen = new Set<string>();
  const endpoints = list.filter((u) => {
    const k = u.replace(/\/$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 50);

  for (const endpoint of endpoints) {
    try {
      const base = endpoint.replace(/\/$/, "");
      const res = await fetch(base, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": UA,
        },
        body: JSON.stringify({
          url: mediaUrl,
          downloadMode: "audio",
          audioFormat: "mp3",
          filenameStyle: "basic",
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const data: any = await res.json().catch(() => null);
      if (!data) continue;
      let direct: string | undefined = data.url || data.tunnel;
      if (data.status === "picker" && Array.isArray(data.picker)) {
        const a = data.picker.find((p: any) => p.type === "audio") || data.picker[0];
        direct = a?.url;
      }
      if (data.status === "tunnel" && data.url) direct = data.url;
      if (!direct || !/^https?:\/\//i.test(direct)) continue;
      const buf = await fetchBuf(direct);
      if (!looksAudio(buf)) continue;
      return {
        buffer: buf,
        mimetype: "audio/mpeg",
        filename: `${title.slice(0, 40).replace(/[^\w\s-]/g, "") || "audio"}.mp3`,
        engine: `cobalt:${new URL(base).hostname}`,
        title,
      };
    } catch {
      /* next mirror */
    }
  }
  return null;
}

/** Piped: search + audio stream */
export async function downloadViaPiped(query: string): Promise<MirrorResult | null> {
  for (const host of PIPED_MIRRORS) {
    try {
      const sRes = await fetch(
        `${host}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(12_000) }
      );
      if (!sRes.ok) continue;
      const data: any = await sRes.json();
      const items = Array.isArray(data) ? data : data?.items || [];
      const video = items[0];
      if (!video) continue;
      const id =
        video.videoId ||
        video.id ||
        String(video.url || "").match(/([a-zA-Z0-9_-]{11})/)?.[1];
      if (!id) continue;
      const st = await fetch(`${host}/streams/${id}`, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!st.ok) continue;
      const streams: any = await st.json();
      const audioStreams = streams?.audioStreams || [];
      const best =
        audioStreams.find((a: any) => /mp4|m4a|mp3|opus/i.test(a.mimeType || a.format || "")) ||
        audioStreams[0];
      if (!best?.url) continue;
      const buf = await fetchBuf(best.url);
      if (!looksAudio(buf)) continue;
      return {
        buffer: buf,
        mimetype: best.mimeType || "audio/mp4",
        filename: `${String(streams.title || query).slice(0, 40).replace(/[^\w\s-]/g, "") || "audio"}.m4a`,
        engine: `piped:${new URL(host).hostname}`,
        title: streams.title || query,
      };
    } catch {
      /* next */
    }
  }
  return null;
}

/** Invidious audio url */
export async function downloadViaInvidious(query: string): Promise<MirrorResult | null> {
  for (const host of INVIDIOUS_MIRRORS) {
    try {
      const sRes = await fetch(`${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(12_000),
      });
      if (!sRes.ok) continue;
      const data: any = await sRes.json();
      const video = Array.isArray(data) ? data.find((x: any) => x.videoId) : null;
      if (!video?.videoId) continue;
      const vRes = await fetch(`${host}/api/v1/videos/${video.videoId}`, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!vRes.ok) continue;
      const info: any = await vRes.json();
      const formats = info.adaptiveFormats || info.formatStreams || [];
      const audio = formats.find((f: any) => String(f.type || f.mimeType || "").startsWith("audio")) || null;
      if (!audio?.url) continue;
      const buf = await fetchBuf(audio.url);
      if (!looksAudio(buf)) continue;
      return {
        buffer: buf,
        mimetype: audio.type || audio.mimeType || "audio/mp4",
        filename: `${String(info.title || query).slice(0, 40).replace(/[^\w\s-]/g, "") || "audio"}.m4a`,
        engine: `invidious:${new URL(host).hostname}`,
        title: info.title || query,
      };
    } catch {
      /* next */
    }
  }
  return null;
}

/** Spotify preview (30s) — no YouTube */
export async function downloadSpotifyPreview(previewUrl: string, title: string): Promise<MirrorResult | null> {
  try {
    const buf = await fetchBuf(previewUrl, 5 * 1024 * 1024);
    if (!looksAudio(buf) && buf.length < 1000) return null;
    return {
      buffer: buf,
      mimetype: "audio/mpeg",
      filename: `${title.slice(0, 40).replace(/[^\w\s-]/g, "") || "preview"}.mp3`,
      engine: "spotify-preview",
      title,
    };
  } catch {
    return null;
  }
}

/** Try all engines in order for a query or media URL */
export async function downloadAudioMulti(
  queryOrUrl: string,
  opts?: { preferUrl?: string; title?: string }
): Promise<MirrorResult | null> {
  const title = opts?.title || queryOrUrl.slice(0, 60);
  const mediaUrl = opts?.preferUrl || (/^https?:\/\//i.test(queryOrUrl) ? queryOrUrl : undefined);

  if (mediaUrl) {
    const c = await downloadViaCobaltMirrors(mediaUrl, title);
    if (c) return c;
  }

  // Piped / Invidious search
  const p = await downloadViaPiped(queryOrUrl);
  if (p) return p;
  const inv = await downloadViaInvidious(queryOrUrl);
  if (inv) return inv;

  // If we had a URL, try cobalt again is already done
  // Last: ytsearch via cobalt on youtube search page doesn't work — try constructing
  if (!mediaUrl) {
    // try first piped result URL through cobalt
    for (const host of PIPED_MIRRORS.slice(0, 3)) {
      try {
        const sRes = await fetch(
          `${host}/search?q=${encodeURIComponent(queryOrUrl)}&filter=videos`,
          { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }
        );
        if (!sRes.ok) continue;
        const data: any = await sRes.json();
        const items = Array.isArray(data) ? data : data?.items || [];
        const video = items[0];
        const id =
          video?.videoId ||
          video?.id ||
          String(video?.url || "").match(/([a-zA-Z0-9_-]{11})/)?.[1];
        if (!id) continue;
        const yt = `https://www.youtube.com/watch?v=${id}`;
        const c = await downloadViaCobaltMirrors(yt, title);
        if (c) return c;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

export const MIRROR_COUNT =
  COBALT_MIRRORS.length + PIPED_MIRRORS.length + INVIDIOUS_MIRRORS.length;
