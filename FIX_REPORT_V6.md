# WATER AI CLOUD — FIX REPORT V6

## Ringkasan

V6 memperkuat platform bot WhatsApp WATER AI CLOUD dengan downloader multi-engine yang benar-benar melakukan request ke engine web yang ditentukan, fallback `yt-dlp` yang terpasang di runtime Railway, serta validasi MIME dan ukuran file sebelum media dikirim ke WhatsApp. Perubahan ini melanjutkan perbaikan koneksi WhatsApp Baileys, renderer BRAT lokal, fitur grup, menu, dan sistem permission yang telah ada pada V5.

> Batasan keamanan: downloader hanya memproses media publik yang dapat diakses tanpa login atau bypass proteksi. Media private, URL yang memerlukan CAPTCHA, dan konten yang ditolak sumber akan menghasilkan pesan gagal yang jelas.

## Perubahan downloader V6

### TikTok dan Douyin

Untuk URL TikTok/Douyin, urutan engine adalah:

1. `SnapTik.net` melalui halaman `https://snaptik.net/en`.
2. `SnapTik.app` sebagai fallback web engine.
3. `yt-dlp` extractor resmi sebagai fallback terakhir.
4. `COBALT_API_URL` hanya digunakan jika dikonfigurasi dan jalur fallback tersebut diperlukan.

Adapter mengambil token dinamis (`k_url_search`, `k_token`, dan `k_exp`) dari halaman engine, mengirim POST form-urlencoded ke endpoint pencarian, mem-parsing respons JSON maupun HTML, lalu mengambil URL media langsung. Kandidat `dl.snapcdn.app/get` dan link MP4 diprioritaskan di atas thumbnail agar hasil `.video` tidak salah mengirim gambar cover. MIME file diverifikasi dari isi buffer menggunakan `file-type` sebelum file dikembalikan.

### Instagram

Untuk URL Instagram publik, engine pertama adalah `Snap-Insta.to` pada halaman `https://snap-insta.to/id`. Adapter menggunakan token halaman yang berlaku, mengirim URL target melalui endpoint pencarian, mengekstrak link media dari JSON/HTML, dan memverifikasi MIME hasilnya. Bila engine web menolak URL atau strukturnya berubah, bot mencoba `yt-dlp`. Profil atau post private yang meminta login tidak dibypass.

### YouTube dan query pencarian

URL YouTube serta query judul umum tetap menggunakan `yt-dlp` karena extractor tersebut mendukung metadata dan penggabungan audio-video secara konsisten. Untuk video, pipeline membatasi kualitas sampai 720p, menggabungkan audio-video, dan merekode keluaran ke MP4. Untuk audio, pipeline mengekstrak MP3 192K. Binary dapat diarahkan dengan `YTDLP_PATH`; Dockerfile memasang Python 3 dan `yt-dlp` saat build.

### Proteksi operasional

Semua jalur downloader memiliki timeout, retry terbatas, batas ukuran maksimum 50 MB, pembersihan direktori temporer, dan pesan progress. File yang bukan audio/video/image yang valid akan ditolak. Pesan kegagalan membedakan binary belum terpasang, media private/login, extractor yang tidak mendukung situs, dan sumber web yang gagal.

## BRAT dan media processing

`.brat`, `.bratvid`, dan `.bratgif` menggunakan renderer lokal berbasis SVG, Sharp, dan FFmpeg; tidak ada pemanggilan AI untuk pembuatan stiker. Desain default menggunakan latar putih, teks hitam tebal, tanpa watermark, dan orientasi teks tidak miring. `.smeme` memakai alur media lokal yang sama untuk membuat meme sticker dari foto yang direply.

## WhatsApp dan fitur grup yang dipertahankan

Pairing memakai socket Baileys nyata dan `requestPairingCode`, bukan simulasi Chrome/Ubuntu. `.rvo` mengambil media view-once dari pesan yang direply sesuai data pesan yang diterima. `.swgc` mengirim media atau teks ke status WhatsApp dengan audience grup melalui mekanisme status yang tersedia pada socket aktif. `.react`, permission resolver terpusat, normalisasi JID/nomor telepon, sinkronisasi registry idempotent, dan rekomendasi typo prefix tetap berada dalam paket.

## Menu dan administrasi

`.menu` menampilkan kategori terlebih dahulu dan menyediakan pilihan `allmenu` untuk daftar lengkap. `.menu` serta `.allmenu` dapat menggunakan foto yang diatur admin melalui setting **Menu Photo URL**. Kredensial admin tidak ditanamkan ke dalam ZIP; kredensial harus diatur melalui environment/database deployment agar tidak bocor.

## Runtime Railway

Dockerfile V6 menggunakan `node:22-bookworm-slim` dan memasang FFmpeg, ImageMagick, libvips, Python 3, pip, serta dependency build media yang diperlukan. `scripts/start.sh` menyiapkan `yt-dlp` bila binary belum tersedia, menjalankan migrasi database, lalu memulai aplikasi. `COBALT_API_URL` bersifat opsional dan harus menunjuk ke instance Cobalt yang dikendalikan operator sendiri.

## Validasi yang dijalankan

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus, exit code 0 |
| `npm run lint` | Lulus, exit code 0 |
| `npm run build` | Lulus, exit code 0 |
| TikTok publik melalui URL canonical | Lulus; `SnapTik.net`, `video/mp4`, sekitar 0,86 MB |
| Instagram publik | Lulus; `Snap-Insta.to`, `image/jpeg`, sekitar 0,05 MB |
| `sh -n scripts/start.sh` | Lulus, exit code 0 |

Smoke test dilakukan terhadap media publik yang tersedia saat pengujian. Karena engine web pihak ketiga dapat mengubah token, endpoint, rate limit, atau kebijakan akses sewaktu-waktu, fallback `yt-dlp` dan pesan error terkontrol tetap dipertahankan.

## Cara deploy

1. Upload ZIP V6 ke repository/deployment Railway.
2. Pastikan service memakai Dockerfile yang disertakan, bukan image Node generik tanpa Python/FFmpeg.
3. Isi environment wajib sesuai `.env.example`, khususnya `DATABASE_URL`, secret autentikasi, URL aplikasi, dan konfigurasi storage.
4. Jalankan deployment dan tunggu proses instalasi `yt-dlp` serta migrasi database pada startup.
5. Buka dashboard, buat atau pilih bot, lalu gunakan alur pairing untuk memperoleh pairing code Baileys nyata.
6. Uji berurutan dengan `.menu`, `.allmenu`, `.brat`, `.video <URL TikTok publik>`, `.play <URL YouTube publik>`, `.rvo` pada media view-once, dan `.swgc` pada grup yang telah memberi izin status.

Jangan memasukkan `node_modules`, `.next`, log, secret, atau kredensial produksi ke repository. Paket distribusi V6 dibuat tanpa dependency terinstal dan tanpa artefak build.
