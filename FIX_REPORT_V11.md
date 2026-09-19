# WATER AI CLOUD V2 → V3 — Audit dan Upgrade Report

## A. Bug atau gap yang ditemukan

Audit menemukan konfigurasi AI masih berdefault ke model lama, endpoint root `/health` belum tersedia, beberapa command dari spesifikasi belum memiliki handler khusus, pencarian sticker pack belum memiliki provider nyata, dan parser wrapping teks template perlu diperbaiki. Proyek juga membutuhkan konfigurasi environment V3 yang konsisten untuk Gemini dan provider media tambahan.

Alur WhatsApp, QR, pairing code, reconnect exponential backoff, multi-bot isolation, owner normalization, group detection, webhook signature/retry, API key hashing, SSE dashboard, dan cleanup media yang sudah ada dipertahankan karena sudah memiliki implementasi backend nyata.

## B. Bug dan gap yang diperbaiki

| Area | Perbaikan |
| --- | --- |
| Gemini | Default diarahkan ke `gemini-2.5-flash-lite`, dengan `GEMINI_API_KEY`, timeout, temperature, token limit, dan pesan error 401/403/408/429/5xx yang jujur. Dukungan nama environment AI lama tetap kompatibel. |
| Health check | Ditambahkan `GET /health` dengan status database, status engine WhatsApp aktual, status konfigurasi AI, timestamp, dan HTTP 503 jika database gagal. `/api/health` lama tidak dihapus. |
| Command baru | Ditambahkan handler nyata untuk `.fakech`, `.windowspink`, `.fakeswwa`, `.img2img`, `.stickerpack-search`, `.sps`, dan `.toquickvideo`. |
| Mockup aman | `.fakeswwa` menghasilkan gambar template dengan watermark `DEMO / MOCKUP / SIMULATION`, sehingga tidak diposisikan sebagai bukti percakapan nyata. |
| IMG2IMG | Tidak memakai Gemini Flash-Lite sebagai generator gambar. Command menggunakan provider image-edit yang dikonfigurasi melalui `IMAGE_EDIT_API_URL`, dan mengembalikan error jujur jika provider belum tersedia. |
| Sticker pack | Memerlukan `STICKERPACK_SEARCH_URL` provider nyata; tidak mengembalikan data palsu. |
| Video cepat | `.toquickvideo` memvalidasi input video, memproses dengan FFmpeg, memvalidasi signature `video/mp4`, dan membersihkan file sementara. |
| Registry | Command baru dimasukkan ke registry dan dispatcher; duplikasi registry untuk beberapa command lama dibersihkan. |
| Environment | `.env.example` diperbarui untuk V3 dan tidak berisi API key asli. |

## C. Fitur baru

Template image generator untuk `fakech` dan `windowspink` menghasilkan PNG nyata dengan wrapping teks dan tema berbeda. `fakeswwa` menghasilkan desain mockup dengan label keamanan. `img2img` siap memakai provider editing yang kompatibel. `stickerpack-search` memiliki kontrak provider dan validasi respons. `toquickvideo` menghasilkan MP4 yang dioptimalkan untuk WhatsApp.

## D. File yang diubah

File yang diubah atau ditambahkan adalah `src/server/commands/ai.ts`, `src/server/engine.ts`, `src/server/commands/media.ts`, `src/server/commands/index.ts`, `src/server/commands/registry.ts`, `.env.example`, dan `src/app/health/route.ts`.

## E. Dependency yang ditambahkan

Tidak ada dependency npm baru. Proyek tetap menggunakan dependency yang sudah tersedia, termasuk `sharp`, `ffmpeg-static`, `file-type`, Baileys, Drizzle, Next.js, dan PostgreSQL client.

## F. Environment yang dibutuhkan

Environment utama adalah `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash-lite`, `GEMINI_TEMPERATURE`, `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_TIMEOUT_MS`, `STORAGE_CONFIG`, `YTDLP_PATH`, dan `FFMPEG_PATH`. Provider opsional baru adalah `IMAGE_EDIT_API_URL`, `IMAGE_EDIT_API_KEY`, dan `STICKERPACK_SEARCH_URL`. Tidak ada secret yang dimasukkan ke source code.

## G. Test yang dilakukan

`npm install` telah tersedia dan dependency dapat dipasang. `npm run typecheck` lulus. `npm run lint` lulus. Audit TODO/FIXME pada source tidak menemukan marker aktif. Command baru diverifikasi ada di registry dan dispatcher. Server production dijalankan singkat menggunakan `npm start` dan berhasil mencapai status `Ready`.

## H. Hasil build

`npm run build` lulus dengan `DATABASE_URL` build-time yang disediakan sementara. Semua route berhasil dibuat, termasuk `/health`, `/api/health`, API, dashboard, auth, docs, dan status. Next.js masih memberi satu warning tracing NFT terkait operasi filesystem dinamis yang memang diperlukan engine; warning tersebut tidak menggagalkan build.

## I. Hasil test Instagram video

Implementasi Instagram dari upgrade sebelumnya tetap dipertahankan: URL Instagram diproses dengan playlist extraction, setiap item divalidasi memakai signature MIME, video non-MP4 dikonversi nyata ke MP4, foto dikirim sebagai image, dan carousel dikirim per item. Pengujian URL Instagram publik end-to-end membutuhkan URL publik aktif dan session WhatsApp nyata; hal tersebut tidak tersedia dalam sandbox ini, sehingga tidak diklaim sebagai test jaringan sukses.

## J. Hasil test Gemini

Model dan konfigurasi sudah diarahkan ke `gemini-2.5-flash-lite`, tetapi request provider live tidak dijalankan karena API key pengguna tidak tersedia dalam workspace. Error provider ditangani tanpa stack trace dan tanpa membuat bot crash.

## K. Hasil test WhatsApp

Engine menggunakan Baileys real untuk QR, pairing, status, reconnect, dan session. Pengujian koneksi live membutuhkan kredensial/session WhatsApp pengguna, sehingga tidak diklaim sebagai koneksi sukses di sandbox. Pemeriksaan static dan production build lulus.

## L. Masalah yang masih tersisa

Fitur yang memerlukan provider eksternal harus dikonfigurasi oleh administrator: Gemini untuk AI, image-edit provider untuk IMG2IMG, sticker-pack provider untuk pencarian paket, yt-dlp untuk downloader, FFmpeg untuk processing, database PostgreSQL untuk runtime, dan persistent storage untuk session WhatsApp di Railway. Tanpa dependency tersebut, command memberikan pesan error yang jujur dan tidak membuat response palsu.
