# WATER AI CLOUD V3 — Upgrade/Fix Report V11

Tanggal: 2026-08-29

## Fokus
Upgrade dilakukan pada salinan project yang diberikan, bukan membuat project baru. Struktur frontend/backend/DB/Baileys lama dipertahankan.

## Perubahan utama
- Gemini menjadi provider AI utama jika `GEMINI_API_KEY` tersedia.
- Default model AI di dashboard dan server menjadi `gemini-2.5-flash-lite`.
- Ditambahkan `src/server/ai-client.ts` untuk satu jalur AI server-side, timeout, error mapping, dan fallback kompatibilitas `AI_API_KEY`.
- `.env.example` diperbarui dengan `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GEMINI_MODEL`, `GEMINI_TEMPERATURE`, `GEMINI_MAX_OUTPUT_TOKENS`, dan `GEMINI_TIMEOUT_MS`.
- Instagram video dipaksa mengambil stream video/audio yang benar, merge/recode ke MP4, lalu diverifikasi menggunakan file signature sebelum dikirim.
- Downloader umum sekarang menolak hasil dengan MIME yang tidak dikenal; video tidak boleh dilabeli `video/mp4` bila signature file sebenarnya bukan video.
- Web downloader video diperketat agar tidak menerima image sebagai hasil video.
- Temporary output `.mp4` pada `toquickvideo` selalu dihapus dengan `finally`.
- Ditambahkan `.toquickvideo` untuk optimasi/re-encode video nyata ke MP4.
- Ditambahkan `.fakech`, `.fakeswwa`, dan `.windowspink` sebagai generator template lokal. Chat/WhatsApp mockup selalu diberi watermark `DEMO / MOCKUP` dan peringatan bahwa hasil bukan bukti percakapan/transaksi/identitas.
- Registry command dideduplikasi agar command yang sama tidak masuk database/menu dua kali.
- Ditambahkan endpoint `/health` dan `/api/health` dengan status database, engine, AI, FFmpeg, yt-dlp, uptime, dan jumlah bot aktif.
- Existing Baileys QR, pairing code, owner normalization, group detection, caption parsing, reconnect, multi-bot, API, webhook, database, dan UI tidak dihapus.

## Audit penting yang dipastikan
- QR tetap berasal dari event QR Baileys nyata.
- Pairing code tetap berasal dari `sock.requestPairingCode()` nyata.
- Caption foto/video/dokumen tetap dibaca oleh parser command.
- Owner number dinormalisasi ke format internal sebelum dibandingkan.
- Group ditentukan dari JID `@g.us`.
- Instagram thumbnail tidak digunakan sebagai file video utama.
- Media sementara dibersihkan melalui `finally` pada jalur downloader yang diaudit.

## Verifikasi yang tersedia di lingkungan kerja
- Struktur source dan dependency diperiksa.
- Registry diperiksa dan duplikat command dihapus.
- Referensi model Gemini lama yang digunakan sebagai default server/dashboard diganti.
- Dependency install/build penuh tidak dapat diselesaikan di lingkungan kerja ini karena proses `npm ci` ke registry melebihi batas waktu. Karena itu laporan ini tidak mengklaim production build 100% teruji di lingkungan ini.

## Catatan deployment
Pastikan Railway memiliki:
- `DATABASE_URL`
- `AUTH_SECRET`
- `GEMINI_API_KEY` bila ingin AI aktif
- `STORAGE_CONFIG` pada storage persisten untuk session WhatsApp
- FFmpeg
- yt-dlp

Jangan memasukkan API key atau session credential ke repository.
