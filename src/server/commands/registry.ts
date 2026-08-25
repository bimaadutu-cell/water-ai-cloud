/* WATER AI — built-in command registry.
 * Every command has metadata; the menu is generated automatically from this
 * registry (seeded into the commands table per bot, so users can enable,
 * disable, rename or extend per bot — disabled commands vanish from menu).
 */
export type Permission = "all" | "admin" | "owner";

export interface RegistryCommand {
  name: string;
  category: string;
  description: string;
  permissions: Permission;
  premium?: boolean;
  handler: string;
  extra?: Record<string, unknown>;
}

export const CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "ai", label: "AI", emoji: "🤖" },
  { id: "sticker", label: "STICKER", emoji: "🎨" },
  { id: "brat", label: "BRAT", emoji: "🅱️" },
  { id: "image", label: "IMAGE", emoji: "🖼️" },
  { id: "media", label: "MEDIA", emoji: "🎬" },
  { id: "search", label: "SEARCH", emoji: "🔎" },
  { id: "downloader", label: "DOWNLOADER", emoji: "📥" },
  { id: "group", label: "GROUP", emoji: "👥" },
  { id: "security", label: "SECURITY", emoji: "🛡️" },
  { id: "fun", label: "FUN", emoji: "🎮" },
  { id: "education", label: "EDUCATION", emoji: "📚" },
  { id: "tools", label: "TOOLS", emoji: "🧰" },
  { id: "premium", label: "PREMIUM", emoji: "💎" },
  { id: "information", label: "INFORMATION", emoji: "📊" },
  { id: "owner", label: "OWNER", emoji: "👑" },
];

const c = (
  name: string,
  category: string,
  description: string,
  permissions: Permission = "all",
  premium = false,
  extra?: Record<string, unknown>
): RegistryCommand => ({
  name,
  category,
  description,
  permissions,
  premium,
  handler: name,
  extra,
});

export const REGISTRY: RegistryCommand[] = [
  /* 🤖 AI — real calls to OpenAI-compatible API (AI_API_KEY server-side) */
  c("ai", "ai", "AI chat: .ai <pertanyaan>"),
  c("ask", "ai", "Tanya AI apa saja"),
  c("vision", "ai", "Analisis gambar dengan AI (reply gambar)", "all", true),
  c("ocr", "ai", "Ekstrak teks dari gambar (AI vision)", "all", true),
  c("translate", "ai", "Terjemahkan: .translate <bahasa> <teks> (MyMemory)"),
  c("summarize", "ai", "Ringkas teks panjang", "all", true),
  c("rewrite", "ai", "Tulis ulang teks dengan gaya tertentu"),
  c("prompt", "ai", "Buat prompt untuk AI/image generator"),
  c("code", "ai", "Bantu tulis/explain kode"),
  c("question", "ai", "Jawab pertanyaan dengan AI"),
  c("study", "ai", "Mode belajar: jelaskan materi step-by-step"),

  /* 🎨 STICKER — real WebP generation (Sharp + FFmpeg) */
  c("sticker", "sticker", "Buat sticker (reply gambar / URL)"),
  c("s", "sticker", "Alias .sticker"),
  c("stiker", "sticker", "Alias .sticker"),
  c("toimg", "sticker", "Sticker → gambar (reply sticker)"),
  c("textsticker", "sticker", "Sticker dari teks: .textsticker <teks>"),
  c("videosticker", "sticker", "Sticker dari video (reply video / URL)", "all", true),
  c("gifsticker", "sticker", "Sticker dari GIF (reply GIF / URL)", "all", true),
  c("stickersearch", "sticker", "Cari sticker (butuh sumber yang mengizinkan)", "all", true),
  c("randomsticker", "sticker", "Sticker emoji acak"),
  c("smeme", "sticker", "Stiker meme dari reply foto: .smeme atas|bawah"),
  c("rvo", "sticker", "Simpan ulang media sekali lihat (reply media)"),
  c("stickerinfo", "sticker", "Info EXIF sticker (reply sticker)"),

  /* 🅱️ BRAT */
  c("brat", "brat", "Sticker teks BRAT WebP lokal: .brat <teks> (tanpa AI)"),
  c("bratsticker", "brat", "Sticker caption BRAT acak"),
  c("bratgif", "brat", "Animated WebP sticker BRAT 3 detik (ffmpeg, tanpa AI)"),
  c("bratvideo", "brat", "Animated WebP sticker BRAT 3 detik (ffmpeg, tanpa AI)"),
  c("bratvid", "brat", "Alias bratvideo: animated WebP sticker (tanpa AI)"),

  /* 🖼️ IMAGE — real processing with sharp */
  c("removebg", "image", "Hapus background (butuh REMOVEBG_API_KEY)", "all", true),
  c("enhance", "image", "Enhance kualitas gambar"),
  c("upscale", "image", "Upscale 2x (reply gambar / URL)", "all", true),
  c("compress", "image", "Kompres gambar (reply gambar)"),
  c("resize", "image", "Resize: .resize <lebar> <tinggi>"),
  c("crop", "image", "Crop center: .crop <lebar> <tinggi>"),
  c("rotate", "image", "Rotate 90°: .rotate 90|180|270"),
  c("flip", "image", "Flip: .flip horizontal|vertical"),
  c("blur", "image", "Blur gambar (reply gambar)"),
  c("sharpen", "image", "Sharpen gambar (reply gambar)"),
  c("grayscale", "image", "Ubah ke grayscale"),
  c("watermark", "image", "Tambah watermark WATER AI"),
  c("imginfo", "image", "Info gambar: ukuran, format, DPI"),

  /* 🎬 MEDIA — real conversion with ffmpeg */
  c("tomp3", "media", "Video/audio → MP3 (reply media / URL)"),
  c("toaudio", "media", "Video → audio (reply media / URL)"),
  c("tovoice", "media", "Video/audio → voice note (PTT)"),
  c("togif", "media", "Video → GIF (reply video / URL)"),
  c("topdf", "media", "Gambar/teks → PDF (pdf-lib)", "all", true),
  c("toimage", "media", "Sticker/GIF/webp → gambar"),
  c("convert", "media", "Konversi format: .convert <png|jpg|webp|mp3|ogg>"),
  c("mediainfo", "media", "Info file media (format, durasi, ukuran)"),
  c("thumbnail", "media", "Thumbnail frame pertama video"),

  /* 🔎 SEARCH — real public APIs (tanpa key) */
  c("search", "search", "Pencarian web (DuckDuckGo)"),
  c("image", "search", "Cari gambar (Wikimedia Commons)"),
  c("news", "search", "Berita terbaru (Google News RSS)"),
  c("wikipedia", "search", "Cari di Wikipedia"),
  c("movie", "search", "Info film (TMDB/Wikipedia)"),
  c("anime", "search", "Cari anime (Kitsu API)"),
  c("manga", "search", "Cari manga (MangaDex API)"),
  c("github", "search", "Cari repo GitHub"),
  c("dictionary", "search", "Kamus definisi (Dictionary API)"),
  c("weather", "search", "Cuaca real (Open-Meteo)"),

  /* 📥 DOWNLOADER — real pipeline: search → validate → download → send */
  c("play", "downloader", "Download audio otomatis: .play <judul/url>"),
  c("allvid", "downloader", "Downloader video multi-engine: URL publik"),
  c("song", "downloader", "Alias .play (audio)"),
  c("audio", "downloader", "Alias .play (audio)"),
  c("video", "downloader", "Download video otomatis: .video <judul/url>"),
  c("tiktok", "downloader", "Download TikTok publik: .tiktok <URL>"),
  c("instagram", "downloader", "Download Instagram publik: .instagram <URL>"),
  c("youtube", "downloader", "Download YouTube publik: .youtube <URL/judul>"),
  c("media", "downloader", "Download media umum: .media <judul/url>"),

  /* 👥 GROUP — real Baileys group APIs */
  c("groupinfo", "group", "Info grup (subject, anggota)"),
  c("admin", "group", "Daftar admin grup"),
  c("tagall", "group", "Tag semua anggota", "admin"),
  c("hidetag", "group", "Tag semua (mention) tanpa teks", "admin"),
  c("mention", "group", "Mention semua (alias hidetag)", "admin"),
  c("add", "group", "Add member: .add <nomor>", "admin"),
  c("kick", "group", "Kick member: .kick @tag", "admin"),
  c("promote", "group", "Promote jadi admin: .promote @tag", "admin"),
  c("demote", "group", "Demote admin: .demote @tag", "admin"),
  c("warn", "group", "Beri warning: .warn @tag [alasan]", "admin"),
  c("warnings", "group", "Lihat warning: .warnings @tag"),
  c("mute", "group", "Mute/unmute grup: .mute on|off", "admin"),
  c("linkgroup", "group", "Link invite grup"),
  c("setname", "group", "Ubah nama grup: .setname <nama>", "admin"),
  c("setdesc", "group", "Ubah deskripsi grup: .setdesc <teks>", "admin"),
  c("setppgc", "group", "Ubah PP grup (reply gambar)", "admin"),
  c("groupstats", "group", "Statistik grup"),
  c("swgc", "group", "Kirim teks/media grup ke WhatsApp Status", "admin"),

  /* 🛡️ SECURITY — real per-group engine */
  c("antilink", "security", "Anti link: .antilink on|off", "admin"),
  c("antispam", "security", "Anti spam: .antispam on|off", "admin"),
  c("antiflood", "security", "Anti flood: .antiflood on|off", "admin"),
  c("antibot", "security", "Blokir bot lain: .antibot on|off", "admin"),
  c("autodelete", "security", "Auto hapus pesan non-admin: .autodelete on|off", "admin"),
  c("blacklist", "security", "Blokir user: .blacklist @tag", "admin"),
  c("whitelist", "security", "Cabut blokir: .whitelist @tag", "admin"),
  c("securitylog", "security", "Log keamanan grup"),

  /* 🎮 FUN — real games & free APIs */
  c("quiz", "fun", "Kuis sains (OpenTDB)"),
  c("trivia", "fun", "Alias .quiz"),
  c("tebakkata", "fun", "Tebak kata (Jawab: jawaban)"),
  c("tebakgambar", "fun", "Tebak subjek gambar"),
  c("random", "fun", "Angka acak: .random [max]"),
  c("quote", "fun", "Kutipan motivasi (ZenQuotes)"),
  c("daily", "fun", "Kutipan harian"),
  c("leaderboard", "fun", "Peringkat game grup"),

  /* 📚 EDUCATION */
  c("math", "education", "Kalkulasi matematika: .math 2+2*10"),
  c("physics", "education", "Tutor fisika (AI)"),
  c("chemistry", "education", "Tutor kimia (AI)"),
  c("summary", "education", "Ringkas materi (AI)"),
  c("flashcard", "education", "Flashcard: .flashcard istilah|definisi; ..."),
  c("study2", "education", "Alias .study"),

  /* 🧰 TOOLS — real, no external services */
  c("calc", "tools", "Kalkulator: .calc 12*8"),
  c("json", "tools", "Validasi & pretty-print JSON"),
  c("base64", "tools", "Base64: .base64 encode|decode <teks>"),
  c("urlencode", "tools", "URL-encode teks"),
  c("urldecode", "tools", "URL-decode teks"),
  c("uuid", "tools", "Generate UUID v4"),
  c("hash", "tools", "Hash: .hash md5|sha1|sha256 <teks>"),
  c("regex", "tools", "Test regex: .regex /pat/i teks"),
  c("timestamp", "tools", "Waktu: .timestamp [unix]"),
  c("color", "tools", "Info warna: .color #22d3ee"),
  c("jwt", "tools", "Decode JWT (header+payload, tanpa signature check)"),
  c("html", "tools", "Escape/unescape HTML"),
  c("javascript", "tools", "Cek sintaks JS (parse-only, aman)"),

  /* 💎 PREMIUM — real premium & limit system */
  c("premium", "premium", "Info premium & cara aktif"),
  c("mypremium", "premium", "Cek status premium Anda"),
  c("limit", "premium", "Sisa limit hari ini"),
  c("premiuminfo", "premium", "Detail limit & harga premium"),
  c("buy", "premium", "Beli premium (petunjuk pembayaran)"),

  /* 📊 INFORMATION */
  c("menu", "information", "Menu lengkap dengan format tebal"),
  c("allmenu", "information", "Alias menu lengkap dengan format tebal"),
  c("help", "information", "Help singkat + cara pakai"),
  c("status", "information", "Status bot & statistik"),
  c("ping", "information", "Uji latensi"),
  c("runtime", "information", "Info runtime & resource"),
  c("stats", "information", "Statistik bot (alias status)"),
  c("botinfo", "information", "Detail info bot"),
  c("owner", "information", "Nomor owner bot"),
  c("copymenu", "information", "Petunjuk salin menu"),

  /* 👑 OWNER */
  c("addowner", "owner", "Tambah owner: .addowner <nomor>", "owner"),
  c("delowner", "owner", "Hapus owner: .delowner <nomor>", "owner"),
  c("listowner", "owner", "Daftar owner", "owner"),
  c("addprem", "owner", "Tambah premium: .addprem @tag [1jam|2hari|forever] (default 1 jam)", "owner"),
  c("delprem", "owner", "Hapus premium: .delprem @tag", "owner"),
  c("listprem", "owner", "Daftar premium", "owner"),
  c("ban", "owner", "Ban user: .ban @tag", "owner"),
  c("unban", "owner", "Unban user: .unban @tag", "owner"),
  c("restart", "owner", "Restart bot engine", "owner"),
  c("backup", "owner", "Export konfigurasi bot (file JSON)", "owner"),
  c("restore", "owner", "Import konfigurasi bot (reply file JSON)", "owner"),
  c("clearcache", "owner", "Bersihkan state game & cache", "owner"),
  c("plugin", "owner", "Modul & jumlah command aktif", "owner"),
  c("maintenance", "owner", "Mode maintenance bot: .maintenance on|off", "owner"),
  c("logs", "owner", "Log aktivitas bot terbaru", "owner"),
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));
