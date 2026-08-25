# WATER AI CLOUD — Laporan Perbaikan

## Ringkasan

Proyek telah diperbaiki pada alur koneksi WhatsApp, pemrosesan prefix, format menu, idempotensi command, dan downloader. Pairing code sekarang diminta dari socket Baileys yang benar-benar terhubung ke endpoint WhatsApp; tidak ada generator kode lokal atau kode simulasi.

> **Catatan penting:** koneksi end-to-end ke nomor WhatsApp tertentu tidak dapat saya klaim sudah berhasil tanpa nomor uji, database PostgreSQL yang aktif, dan tindakan pengguna untuk memasukkan kode di WhatsApp. Yang dapat diverifikasi di sandbox adalah kode produksi, dependency, build, lint, dan smoke test extractor.

## Perubahan utama

| Area | Perbaikan |
|---|---|
| Pairing | State `AuthenticationState` disimpan dari `useMultiFileAuthState`; tidak lagi membaca `rb.sock.authState` yang tidak tersedia. Socket ditunggu sampai WebSocket terbuka melalui `waitForSocketOpen()` sebelum `requestPairingCode()`. |
| Identitas client | Descriptor Baileys diset ke `Ubuntu / Chrome / 22.04.4`, sesuai helper `Browsers.ubuntu("Chrome")`. Ini adalah descriptor protokol, bukan browser Chrome palsu atau headless browser. |
| Storage | `STORAGE_CONFIG` sekarang dipakai untuk sesi WhatsApp dan file sementara. Production wajib memakai volume persisten supaya sesi linked device tidak hilang saat restart/deploy. |
| Prefix | `.Brat halo` tetap dikenali karena nama command dinormalisasi ke lowercase. Pesan penggunaan kini memakai prefix bot aktual, termasuk bila prefix bukan titik. |
| Menu | `.menu` dan `.allmenu` tersedia, menggunakan WhatsApp bold (`*...*`) dan renderer yang sama. `.allmenu` ditambahkan ke registry dan dispatcher. |
| Command seeding | Sinkronisasi registry dibuat idempoten melalui pemeriksaan `(botId, name)` karena tabel lama tidak memiliki unique constraint yang sesuai. |
| Downloader | Endpoint acak dan fallback preview iTunes diganti dengan binary yt-dlp resmi. Query judul menggunakan `ytsearch1`, URL publik memakai extractor yt-dlp, dan ffmpeg dipakai untuk audio/merge video. Media privat/login/playlist serta file di atas 50 MB ditolak secara jujur. |
| Build quality | Dependency `pino` ditambahkan secara eksplisit, lockfile diselaraskan, lint error frontend/backend dibersihkan, dan QR data URL tetap memakai `<img>` dengan pengecualian lint yang terdokumentasi. |

## Cara menjalankan

Salin `.env.example` menjadi `.env`, isi `DATABASE_URL`, `AUTH_SECRET`, dan `APP_URL`, lalu pastikan `STORAGE_CONFIG` menunjuk ke volume persisten. Untuk lokal, install `yt-dlp` dan `ffmpeg`; atur `YTDLP_PATH` bila binary tidak berada di `PATH`. Image Docker memasang yt-dlp resmi ke `/usr/local/bin/yt-dlp` dan ffmpeg melalui Alpine.

Setelah server hidup, buat bot, tekan **Start Bot**, kemudian pilih salah satu cara berikut:

1. **QR asli:** buka WhatsApp → Settings → Linked Devices → Link a Device, lalu scan QR yang tampil di dashboard.
2. **Pairing code asli:** isi nomor dalam format internasional tanpa tanda `+`, misalnya `6281234567890`, lalu tekan **Minta Pairing Code**. Masukkan kode yang tampil pada menu Link a Device di WhatsApp.

Untuk pengujian command, gunakan `.menu`, `.allmenu`, `.brat halo`, dan `.brat` tanpa argumen. Command terakhir harus mengembalikan petunjuk penggunaan, bukan error generik. `.brat halo` memerlukan `AI_API_KEY`; jika key belum diatur, bot mengirim pesan konfigurasi yang jujur.

## Hasil pengujian

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus (`exit 0`) |
| `npm run lint` | Lulus tanpa error/warning (`exit 0`) |
| `npm run build` dengan env database dummy | Lulus (`exit 0`) |
| Binary yt-dlp resmi | Versi `2026.08.19` berhasil dijalankan |
| Extractor | `Youtube`, `TikTok`, dan `Instagram` terdeteksi pada daftar extractor |
| Metadata URL publik YouTube | Berhasil mengambil judul, URL, dan extractor `Youtube` |
| Unduhan penuh YouTube | Dapat bergantung pada anti-bot/login sumber; jika sumber meminta login, bot mengembalikan error sumber dan tidak berpura-pura sukses |

## File yang diubah

`src/server/engine.ts`, `src/server/commands/core.ts`, `src/server/commands/registry.ts`, `src/server/commands/index.ts`, `src/server/commands/info.ts`, `src/server/commands/downloader.ts`, `src/components/landing.tsx`, `src/components/ui.tsx`, `src/components/DashboardShell.tsx`, `src/app/admin/page.tsx`, `src/app/dashboard/api-keys/page.tsx`, `src/app/dashboard/automation/page.tsx`, `src/app/dashboard/whatsapp/page.tsx`, `src/app/page.tsx`, `Dockerfile`, `.env.example`, `README.md`, `package.json`, dan `package-lock.json`.

## Referensi

[1]: https://github.com/yt-dlp/yt-dlp "yt-dlp — repositori resmi"

[2]: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md "yt-dlp — daftar situs yang didukung"

[3]: https://github.com/WhiskeySockets/Baileys "Baileys — repositori resmi library WhatsApp Web multi-device"

[4]: https://github.com/yt-dlp/yt-dlp#dependencies "yt-dlp — dependency ffmpeg dan runtime extractor"

yt-dlp mendokumentasikan dukungan untuk ribuan situs dan kebutuhan ffmpeg untuk penggabungan atau post-processing media.[1] [2] Baileys menyediakan `requestPairingCode` dan descriptor browser/platform untuk alur multi-device.[3]

## Legal dan operasional

Gunakan hanya untuk komunikasi yang sah dan media publik yang memang boleh diunduh. Patuhi Terms of Service WhatsApp, hak cipta, kebijakan platform sumber, serta hukum setempat. Jangan gunakan bot untuk spam, scraping akun privat, atau bypass login/proteksi.

— **Manus AI**

Tambahan keamanan: arsip hasil perbaikan tidak menyertakan sesi WhatsApp atau kredensial bot dari folder data asli.
