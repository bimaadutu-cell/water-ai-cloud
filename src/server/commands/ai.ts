/* AI + SEARCH + EDUCATION — real API calls. AI requires AI_API_KEY (server-side).
 * translate uses MyMemory (free, no key). Search uses public keyless APIs. */
import { CmdCtx, CmdResult, box, truncate, CmdError } from "./core";

async function aiChat(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number; imageBase64?: string; imageMime?: string; botSettings?: any } = {}
): Promise<string> {
  // Priority: bot settings (dashboard) > env — support Gemini (AIza), OpenAI (sk-), Groq/custom (gsk_/AQ/...)
  const bs = opts.botSettings || {};
  const key = (bs.geminiApiKey || bs.aiApiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || "").trim();
  if (!key)
    return "⚠️ AI belum dikonfigurasi. Isi *API Key AI* di Dashboard bot ATAU set GEMINI_API_KEY / AI_API_KEY di .env server.";

  const keyLower = key.toLowerCase();
  const isGeminiKey = key.startsWith("AIza") || keyLower.includes("gemini");
  const isGroq = key.startsWith("gsk_") || keyLower.startsWith("gsk");
  const configuredBase = (bs.aiBaseUrl || process.env.AI_BASE_URL || process.env.GEMINI_API_BASE || "").trim().replace(/\/$/, "");

  let base = configuredBase;
  if (!base) {
    if (isGeminiKey) base = "https://generativelanguage.googleapis.com/v1beta/openai";
    else if (isGroq) base = "https://api.groq.com/openai/v1";
    else base = "https://api.openai.com/v1"; // OpenAI-compatible (termasuk key AQ dari proxy)
  }

  const model =
    (bs.aiModel || process.env.AI_MODEL || process.env.GEMINI_MODEL || "").trim() ||
    (isGeminiKey ? "gemini-2.5-flash-lite" : isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

  const messages: any[] = [{ role: "system", content: system }];
  if (opts.imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: `data:${opts.imageMime ?? "image/png"};base64,${opts.imageBase64}` } },
      ],
    });
  } else {
    messages.push({ role: "user", content: user });
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
      messages,
    }),
    signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 60000)),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const hint = res.status === 401 || res.status === 403
      ? " Key ditolak — cek API key di dashboard & AI Base URL (jika pakai proxy)."
      : res.status === 404
        ? " Endpoint/model tidak ditemukan — set AI Base URL + AI Model di dashboard."
        : "";
    return `❌ Gagal mengakses service AI (HTTP ${res.status}).${hint}${errBody ? "\n" + errBody.slice(0, 180) : ""}`;
  }
  const j: any = await res.json();
  return j?.choices?.[0]?.message?.content || j?.candidates?.[0]?.content?.parts?.[0]?.text || "AI tidak memberikan jawaban.";
}

const WA_SYSTEM =
  "Kamu WATER AI, asisten WhatsApp yang ramah, ringkas, dan akurat. Jawab dalam bahasa user. Hindari markdown berat; gunakan emoji secukupnya.";

export async function ai(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .ai <pertanyaan>" };
  const r = await aiChat(WA_SYSTEM, ctx.arg, { botSettings: ctx.bot.settings });
  return { text: truncate(r, 3800) };
}
export const ask = ai;
export const question = ai;

export async function study(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .study <topik>" };
  const r = await aiChat(
    WA_SYSTEM + " Kamu mode belajar: jelaskan step-by-step dari dasar, beri contoh, dan akhiri dengan 3 pertanyaan uji.",
    `Jelaskan topik: ${ctx.arg}`,
    { botSettings: ctx.bot.settings }
  );
  return { text: truncate(r, 3800) };
}
export const study2 = study;

export async function summarize(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .summarize <teks>" };
  const r = await aiChat(WA_SYSTEM + " Ringkas teks user maksimal 5 poin singkat.", ctx.arg
  , { botSettings: ctx.bot.settings });
  return { text: truncate(r, 2500) };
}
export const summary = summarize;

export async function rewrite(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .rewrite <teks> [gaya: formal/santai/iklan]" };
  const [style, ...rest] = ctx.parts;
  const text = rest.join(" ");
  const prompt = style && !text ? `gaya ${style}` : `gaya ${style}\nteks: ${text}`;
  const r = await aiChat(WA_SYSTEM + " Tulis ulang teks dengan gaya yang diminta. Hanya hasil akhir.", prompt || ctx.arg
  , { botSettings: ctx.bot.settings });
  return { text: truncate(r, 3000) };
}

export async function prompt(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .prompt <ide>" };
  const r = await aiChat(WA_SYSTEM + " Buat prompt detail (untuk AI chat/image generator) dari ide user. Hanya output prompt-nya.", ctx.arg
  , { botSettings: ctx.bot.settings });
  return { text: truncate(r, 2500) };
}

export async function code(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .code <permintaan kode>" };
  const r = await aiChat(WA_SYSTEM + " Kamu senior developer. Jawab dengan kode (block code) + penjelasan singkat.", ctx.arg
  , { botSettings: ctx.bot.settings });
  return { text: truncate(r, 3800) };
}

/* ------------------------------ TRANSLATE ------------------------------ */
const LANGS: Record<string, string> = {
  id: "id", indo: "id", indonesia: "id",
  en: "en", english: "en", inggris: "en",
  ja: "ja", jepang: "ja", japanese: "ja",
  ko: "ko", korea: "ko", korean: "ko",
  zh: "zh-CN", cina: "zh-CN", chinese: "zh-CN",
  es: "es", spanish: "es", spanyol: "es",
  fr: "fr", french: "fr", prancis: "fr",
  ar: "ar", arab: "ar",
  de: "de", german: "de", jerman: "de",
};

export async function translate(ctx: CmdCtx): Promise<CmdResult> {
  const [lang, ...rest] = ctx.parts.slice(1);
  const text = rest.join(" ");
  if (!lang || !text) return { text: "Pakai: .translate en Halo (bahasa: id, en, ja, ko, zh, es, fr, ar, de)" };
  const target = LANGS[lang.toLowerCase()];
  if (!target) return { text: `Bahasa "${lang}" belum didukung. Pilihan: id, en, ja, ko, zh, es, fr, ar, de` };
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=autodetect|${target}`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (!res.ok) return { text: "❌ Gagal mengakses service terjemahan." };
    const j: any = await res.json();
    const out = j?.responseData?.translatedText;
    if (!out || /MYMEMORY WARNING/i.test(out))
      return { text: "⚠️ Service terjemahan membatasi panjang/kuota. Coba teks lebih pendek." };
    return { text: `🌐 Terjemahan (${target}):\n${truncate(String(out), 2000)}` };
  } catch {
    return { text: "⏱️ Proses terlalu lama. Silakan coba lagi." };
  }
}

/* -------------------------------- VISION -------------------------------- */
export async function vision(ctx: CmdCtx): Promise<CmdResult> {
  const media = await ctx.getRepliedMedia();
  if (!media) return { text: "Reply gambar dengan .vision <pertanyaan>" };
  const r = await aiChat(WA_SYSTEM + " Kamu analis gambar. Jawab pertanyaan user tentang gambar yang diberikan.", ctx.arg || "Jelaskan gambar ini.", { botSettings: ctx.bot.settings, imageBase64: media.buffer.toString("base64"), imageMime: media.mimetype });
  return { text: truncate(r, 3000) };
}

export async function ocr(ctx: CmdCtx): Promise<CmdResult> {
  const media = await ctx.getRepliedMedia();
  if (!media) return { text: "Reply gambar berisi teks dengan .ocr" };
  const r = await aiChat(
    "OCR engine: ekstrak SEMUA teks pada gambar secara persis, tanpa komentar. Jika tidak ada teks, jawab: (tidak ada teks)",
    "Extract all text.",
    { botSettings: ctx.bot.settings, imageBase64: media.buffer.toString("base64"), imageMime: media.mimetype }
  );
  return { text: `📝 Teks terdeteksi:\n${truncate(r, 3000)}` };
}

export async function brat(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .brat <teks> — chat dengan persona BRAT 💅" };
  const r = await aiChat(
    "Kamu persona BRAT: sok angkuh, manja, drama, tapi pada dasarnya manis. Gunakan kata 'brat', 'dude', 'iconic', emoji 💅✨😤. Jawab singkat (maks 3 kalimat) dalam bahasa Indonesia campur slang.",
    ctx.arg,
    { botSettings: ctx.bot.settings }
  );
  return { text: truncate(r, 2000) };
}

/* ------------------------------ EDUCATION ------------------------------ */
export async function physics(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .physics <pertanyaan fisika>" };
  const r = await aiChat(WA_SYSTEM + " Kamu tutor fisika: jelaskan konsep + rumus + contoh soal singkat.", ctx.arg
  , { botSettings: ctx.bot.settings });
  return { text: truncate(r, 3000) };
}

export async function chemistry(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .chemistry <pertanyaan kimia>" };
  const r = await aiChat(
    WA_SYSTEM + " Kamu tutor kimia: jelaskan reaksi, persamaan, dan contoh.",
    ctx.arg,
    { botSettings: ctx.bot.settings }
  );
  return { text: truncate(r, 3000) };
}

/* -------------------------------- SEARCH -------------------------------- */
async function jget(url: string, timeoutMs = 20000): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "WATER-AI-Bot/3.5 (educational; contact via dashboard)", accept: "application/json" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function cleanHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function duckHtml(query: string): Promise<{ title: string; url: string; description: string }[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; WATER-AI-Bot/3.5)", accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const results: { title: string; url: string; description: string }[] = [];
  const blockRe = /<div[^>]+class="result__body"[\s\S]*?<\/div>\s*<\/div>/gi;
  for (const block of html.matchAll(blockRe)) {
    const value = block[0];
    const link = value.match(/class="result__a"[^>]+href="([^"]+)"/i)?.[1];
    const title = cleanHtml(value.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    const description = cleanHtml(value.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a?>/i)?.[1] || "");
    if (link && /^https?:\/\//i.test(link) && title) results.push({ title, url: link, description });
  }
  return results.slice(0, 5);
}

export async function duckduckgo(ctx: CmdCtx): Promise<CmdResult> {
  const query = ctx.arg.trim();
  if (!query) return { text: "❌ Query DuckDuckGo belum diberikan.\n\nContoh: .duckduckgo artificial intelligence" };
  if (query.length > 300) return { text: "❌ Query terlalu panjang (maksimal 300 karakter)." };
  try {
    let results: { title: string; url: string; description: string }[] = [];
    try {
      const j = await jget(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&tl=id`, 15000);
      if (j?.AbstractURL && j?.AbstractText) results.push({ title: j.Heading || query, url: j.AbstractURL, description: j.AbstractText });
      for (const item of (j?.RelatedTopics || [])) {
        if (item?.FirstURL && item?.Text) results.push({ title: String(item.Text).split(" - ")[0], url: item.FirstURL, description: String(item.Text) });
      }
    } catch { /* HTML fallback below */ }
    if (!results.length) results = await duckHtml(query);
    if (!results.length) return { text: `❌ Tidak ditemukan hasil untuk:\n${query}` };
    const lines = results.slice(0, 5).map((r, i) => `${i + 1}. *${truncate(cleanHtml(r.title), 120)}*\n${truncate(cleanHtml(r.description), 240)}\n${r.url}`);
    return { text: box("🔎 DUCKDUCKGO SEARCH", [`Query: ${truncate(query, 200)}`, ...lines]) };
  } catch (error: any) {
    const message = String(error?.name || error?.message || "");
    if (/timeout|abort/i.test(message)) return { text: "⏱️ DuckDuckGo timeout.\nSilakan coba lagi." };
    return { text: "❌ DuckDuckGo sedang tidak tersedia." };
  }
}

export async function searchCmd(ctx: CmdCtx): Promise<CmdResult> {
  return duckduckgo(ctx);
}

export async function wikipedia(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .wikipedia <topik>" };
  try {
    const j = await jget(
      `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(ctx.arg)}&srlimit=3&format=json`
    );
    const rows = j?.query?.search ?? [];
    if (!rows.length) return { text: `❌ Tidak ditemukan di Wikipedia: "${ctx.arg}"` };
    return {
      text: box("📖 WIKIPEDIA", rows.map((r: any) => `• ${r.title}\n${truncate(String(r.snippet ?? "").replace(/<[^>]+>/g, ""), 160)}\nhttps://id.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`)),
    };
  } catch {
    return { text: "❌ Gagal mengakses Wikipedia." };
  }
}

export async function imageSearch(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .image <kata kunci>" };
  try {
    const j = await jget(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(ctx.arg)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=900`
    );
    const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
    const p: any = pages[0];
    const info: any = p?.imageinfo?.[0];
    if (!info?.url || !info.mime?.startsWith("image"))
      return { text: `❌ Gambar tidak ditemukan untuk "${ctx.arg}" di Wikimedia Commons.` };
    const buf = await (await fetch(info.url, { signal: AbortSignal.timeout(30000) })).arrayBuffer();
    return {
      media: { kind: "image" as const, buffer: Buffer.from(buf), caption: `🖼️ "${ctx.arg}" — ${info.width}×${info.height} (Wikimedia Commons, ${info.mime})` },
    };
  } catch {
    return { text: "❌ Gagal memuat gambar dari Wikimedia." };
  }
}

export async function news(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .news <topik>" };
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(ctx.arg)}&hl=id&gl=ID&ceid=ID:ID`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("rss fail");
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(.*?)<\/link>/g)].slice(0, 5);
    if (!items.length) return { text: `❌ Tidak ada berita untuk "${ctx.arg}".` };
    return { text: box(`📰 NEWS: ${truncate(ctx.arg, 30)}`, items.map((m) => `• ${truncate(m[1], 100)}\n${m[2]}`)) };
  } catch {
    return { text: "❌ Gagal memuat berita (Google News RSS)." };
  }
}

export async function movie(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .movie <judul>" };
  const key = process.env.TMDB_API_KEY;
  if (key) {
    try {
      const j = await jget(`https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(ctx.arg)}&language=id-ID`);
      const results: any[] = Array.isArray(j?.results) ? j.results.slice(0, 3) : [];
      const m: any = results[0];
      if (!m) return { text: `❌ Film "${ctx.arg}" tidak ditemukan di TMDB.` };
      const details = box("🎬 MOVIE RESULT", [
        `Judul : ${m.title}`,
        `Tahun : ${m.release_date || "-"}`,
        `Rating: ${m.vote_average ?? "-"}/10`,
        `Plot  : ${truncate(m.overview || "-", 550)}`,
        results.length > 1 ? `\nHasil lain:\n${results.slice(1).map((item) => `• ${item.title} (${item.release_date || "-"}) — ${item.vote_average ?? "-"}/10`).join("\n")}` : "",
      ].filter(Boolean));
      if (m.poster_path) {
        try {
          const poster = await fetch(`https://image.tmdb.org/t/p/w500${m.poster_path}`, { signal: AbortSignal.timeout(20000) });
          if (poster.ok) {
            return { media: { kind: "image" as const, buffer: Buffer.from(await poster.arrayBuffer()), mimetype: poster.headers.get("content-type") || "image/jpeg", caption: details } };
          }
        } catch {
          /* Poster optional: text result remains valid. */
        }
      }
      return { text: details };
    } catch {
      return { text: "❌ Gagal mengakses TMDB." };
    }
  }
  try {
    const j = await jget(
      `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(ctx.arg)}%20film&srwhat=title&srlimit=3&format=json`
    );
    const rows = j?.query?.search ?? [];
    if (!rows.length) return { text: `❌ Film "${ctx.arg}" tidak ditemukan (TMDB key belum diset; fallback Wikipedia kosong).` };
    return { text: box("🎬 MOVIE (Wikipedia)", rows.map((r: any) => `• ${r.title}\n${truncate(String(r.snippet ?? "").replace(/<[^>]+>/g, ""), 200)}`)) };
  } catch {
    return { text: "❌ Gagal mengakses service film." };
  }
}

export async function anime(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .anime <judul>" };
  try {
    const j = await jget(`https://kitsu.io/api/edge/anime?filter%5Btext%5D=${encodeURIComponent(ctx.arg)}&limit=3`);
    const data = j?.data ?? [];
    if (!data.length) return { text: `❌ Anime "${ctx.arg}" tidak ditemukan di Kitsu.` };
    return {
      text: box("🌸 ANIME (Kitsu)", data.map((a: any) => `• ${a.attributes?.names?.["en-JP"] ?? a.attributes?.canonicalTitle}\n${truncate(a.attributes?.synopsis ?? "", 180)}`)),
    };
  } catch {
    return { text: "❌ Gagal mengakses Kitsu API." };
  }
}

export async function manga(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .manga <judul>" };
  try {
    const j = await jget(`https://api.mangadex.org/manga?title=${encodeURIComponent(ctx.arg)}&limit=3&order[relevance]=desc`);
    const data = j?.data ?? [];
    if (!data.length) return { text: `❌ Manga "${ctx.arg}" tidak ditemukan di MangaDex.` };
    return { text: box("📕 MANGA (MangaDex)", data.map((m: any) => `• ${m.attributes?.title?.en ?? m.attributes?.title?.ja ?? "?"}`)) };
  } catch {
    return { text: "❌ Gagal mengakses MangaDex API." };
  }
}

export async function github(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .github <repo/keyword>" };
  try {
    const j = await jget(`https://api.github.com/search/repositories?q=${encodeURIComponent(ctx.arg)}&per_page=3`);
    const items = j?.items ?? [];
    if (!items.length) return { text: `❌ Repo "${ctx.arg}" tidak ditemukan di GitHub.` };
    return {
      text: box("🐙 GITHUB", items.map((r: any) => `• ${r.full_name} ⭐${r.stargazers_count}\n${truncate(r.description ?? "", 120)}\n${r.html_url}`)),
    };
  } catch {
    return { text: "❌ Gagal mengakses GitHub API (mungkin rate limit)." };
  }
}

export async function dictionary(ctx: CmdCtx): Promise<CmdResult> {
  const word = ctx.parts[0];
  if (!word) return { text: "Pakai: .dictionary <kata>" };
  try {
    const j = await jget(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const entry: any = Array.isArray(j) ? j[0] : j;
    const def = entry?.meanings?.[0]?.definitions?.[0];
    if (!def) return { text: `❌ "${word}" tidak ditemukan di kamus.` };
    return {
      text: box("📖 DICTIONARY", [
        `Kata   : ${entry.word} (${entry.phonetics?.[0]?.text ?? "-"})`,
        `Jenis  : ${entry.meanings?.[0]?.partOfSpeech ?? "-"}`,
        `Definisi: ${truncate(def.definition, 400)}`,
        `Contoh : ${truncate(def.example ?? "-", 200)}`,
      ]),
    };
  } catch {
    return { text: "❌ Gagal mengakses Dictionary API." };
  }
}

const WMO: Record<number, string> = {
  0: "Cerah", 1: "Cerah berawan", 2: "Berawan sebagian", 3: "Berawan",
  45: "Berkabut", 48: "Kabut es", 51: "Hujan gerimis", 53: "Gerimis", 55: "Gerimis lebat",
  61: "Hujan ringan", 63: "Hujan", 65: "Hujan lebat", 71: "Hujan salju ringan", 73: "Hujan salju",
  80: "Hujan singkat", 81: "Hujan deras", 82: "Hujan deras lebat", 95: "Badai", 96: "Badai + es", 99: "Badai + es lebat",
};

export async function weather(ctx: CmdCtx): Promise<CmdResult> {
  if (!ctx.arg) return { text: "Pakai: .weather <kota>" };
  try {
    const geo = await jget(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ctx.arg)}&count=1&language=id`);
    const loc: any = geo?.results?.[0];
    if (!loc) return { text: `❌ Lokasi "${ctx.arg}" tidak ditemukan.` };
    const wx = await jget(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
    );
    const cur = wx?.current;
    if (!cur) return { text: "❌ Gagal memuat data cuaca." };
    return {
      text: box(`🌤️ CUACA ${loc.name.toUpperCase()}`, [
        `${loc.admin1 ?? ""} ${loc.country_code ?? ""}`.trim(),
        `Kondisi : ${WMO[cur.weather_code] ?? "kode " + cur.weather_code}`,
        `Suhu    : ${cur.temperature_2m}°C (terasa ${cur.apparent_temperature}°C)`,
        `Kelembapan : ${cur.relative_humidity_2m}%`,
        `Angin   : ${cur.wind_speed_10m} km/j`,
      ]),
    };
  } catch {
    return { text: "❌ Gagal mengakses service cuaca (Open-Meteo)." };
  }
}

export { aiChat, CmdError };
