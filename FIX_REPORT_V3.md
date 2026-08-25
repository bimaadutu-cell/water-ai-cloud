# WATER AI CLOUD — Laporan Perbaikan V3

## Ringkasan

Paket ini tidak dibuat ulang dari nol. Perubahan diterapkan pada arsitektur existing WATER AI CLOUD: database, dashboard, bot engine Baileys, downloader, media sender, command registry, dan deployment Railway tetap dipertahankan.

Masalah utama pada screenshot berasal dari dua hal. Pertama, command `.bratvid` belum ada di tabel command bot existing sehingga masuk ke typo fallback. Kedua, `.brat` masih dipetakan ke handler AI dan sebagian jalur sticker menggunakan `wa-sticker-formatter`, yang pada runtime tertentu menyebabkan crash native seperti `corrupted size vs. prev_size`. Keduanya sudah diperbaiki.

## BRAT tanpa AI

| Command | Hasil |
|---|---|
| `.brat halo` | Static WebP sticker lokal yang dirender dengan SVG + Sharp. Tidak memanggil `AI_API_KEY`, OpenAI, atau service AI. |
| `.bratgif halo` | Animated WebP sticker tiga detik dengan 75 frame, diproduksi FFmpeg dari media lokal. |
| `.bratvideo halo` | Alias animated WebP yang sama. |
| `.bratvid halo` | Alias resmi `.bratvideo`, sudah ditambahkan ke registry dan otomatis disinkronkan ke bot lama saat engine start. |
| `.bratsticker` | Variasi teks BRAT lokal existing, tetap dipertahankan. |

Static sticker kini memakai Sharp langsung untuk menghasilkan payload WebP 512×512. Dependency `wa-sticker-formatter` dihapus karena tidak lagi dipakai dan terbukti dapat memicu crash native di jalur test tertentu. Jalur video/GIF memakai FFmpeg sistem yang dipilih dari `/usr/bin/ffmpeg` pada Docker Bookworm, lalu fallback ke binary lain bila diperlukan.

## AllVid dan downloader

`.allvid` ditambahkan sebagai alias resmi pada downloader existing. Pipeline tetap menggunakan yt-dlp sebagai engine utama: validasi URL, metadata, extractor, download, merge/recode MP4, batas 50 MB, pembersihan temporary file, lalu pengiriman melalui sender existing.

Metadata thumbnail asli dari yt-dlp sekarang diambil bila tersedia dan diteruskan sebagai `jpegThumbnail` pada payload video WhatsApp. Jika thumbnail gagal diakses, pengiriman media tetap dilanjutkan dengan caption teks. URL publik yang ditolak yt-dlp dapat memakai `COBALT_API_URL` hanya bila pengguna mengonfigurasi instance Cobalt yang dimiliki atau dikelolanya sendiri. Tidak ada bypass login, URL provider anonim, atau klaim dukungan yang tidak dapat diverifikasi.

## Parser, owner, dan admin

Parser command sekarang menerima prefix dari text biasa, extended text, caption foto, caption video, dan caption dokumen karena `isCommandLike` tidak lagi dibatasi hanya pada tipe text. Wrapper view-once dan ephemeral dibuka saat normalisasi sehingga command reply dapat membaca media yang benar.

Helper pusat `normalizePhoneNumber()` dan `normalizeJid()` menyamakan format `08...`, `628...`, `+628...`, JID WhatsApp, serta JID dengan device suffix. Resolver permission pusat menghitung owner dari `bot.ownerNumber` dan tabel `botOwners`, admin grup dari metadata Baileys, serta status admin bot sendiri. Participant `admin` dan `superadmin` sama-sama dikenali.

## Menu dan command baru

`.menu` menampilkan kategori ringkas dan tombol `ALLMENU`. Jika client WhatsApp menolak legacy interactive buttons, engine mengirim fallback teks tanpa menganggap command gagal. `.allmenu` menampilkan daftar lengkap. Command typo menghasilkan hingga tiga rekomendasi terdekat berdasarkan jarak nama command.

`.smeme` tetap memakai reply foto dan renderer lokal. `.swgc` tetap dibatasi grup dan permission admin/owner, lalu mengirim teks atau media ke `status@broadcast` melalui socket bot nyata. `.rvo` memakai stanza ID quoted message yang benar dan wrapper view-once Baileys untuk mengirim ulang media biasa.

## Railway

`Dockerfile` menggunakan `node:22-bookworm-slim`, memasang `ffmpeg`, ImageMagick, libvips, library image, Python 3, pip, git, curl, wget, unzip, zip, jq, build-essential, pkg-config, dan ca-certificates. Binary yt-dlp resmi dipasang di `/usr/local/bin/yt-dlp`. Tahap dependency menggunakan `npm ci --include=dev` agar build Next.js tidak kehilangan package build-time.

`scripts/start.sh` memeriksa `python3`, `ffmpeg`, dan yt-dlp sebelum migrasi database dan `npm start`; jika salah satu hilang, container berhenti dengan pesan yang jelas. `railway.json` memaksa builder Dockerfile dan health check `/api/health`.

## Validasi

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus, exit code 0 |
| `npm run lint` | Lulus, exit code 0 |
| `npm run build` | Lulus, exit code 0 |
| `sh -n scripts/start.sh` | Lulus, exit code 0 |
| Handler `.brat` asli | WebP, 1 frame, exit code 0 |
| Handler `.bratgif` asli | WebP animated, 75 frame, exit code 0 |
| Handler `.bratvid` asli | WebP animated, 75 frame, exit code 0 |
| Docker build | Tidak dapat dijalankan di sandbox ini karena binary Docker tidak tersedia; Dockerfile memiliki pemeriksaan build-time dan startup-time dependency |

Build Next.js masih menampilkan satu warning NFT tracing terkait operasi filesystem dinamis pada engine. Itu bukan error kompilasi dan seluruh command build tetap exit code 0. Pengujian koneksi WhatsApp end-to-end tetap memerlukan akun WhatsApp, database Railway, volume persisten, dan proses pairing pada deployment nyata.

## Environment tambahan

```env
YTDLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=/usr/bin/ffmpeg
COBALT_API_URL=
```

`COBALT_API_URL` boleh dikosongkan. Jika diisi, gunakan instance Cobalt yang Anda miliki atau yang pemiliknya memberi izin. `AI_API_KEY` tidak dipakai oleh `.brat`, `.bratgif`, `.bratvideo`, atau `.bratvid`.

— **Manus AI**
