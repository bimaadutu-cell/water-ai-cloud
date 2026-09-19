# WATER AI CLOUD — Laporan Perbaikan V2

## Penyebab error pada screenshot

Pesan `Downloader gagal memproses media: env: can't execute 'python3': No such file or directory` bukan berasal dari URL TikTok atau Instagram. Binary `yt-dlp` resmi yang dipasang pada image lama adalah executable Python dan membutuhkan interpreter `python3`. Image sebelumnya berbasis Alpine dan hanya memasang `ffmpeg` serta binary yt-dlp, sehingga executable ditemukan tetapi gagal dimulai.

Perbaikannya adalah mengganti runtime ke `node:22-bookworm-slim`, memasang `python3` dan `python3-pip`, lalu memvalidasi `python3`, `ffmpeg`, dan `yt-dlp` saat image dibangun serta saat container boot. Railway juga dipaksa memakai `Dockerfile` melalui `railway.json`, jadi instalasi tidak bergantung pada shell buildpack.

## Perubahan inti

| Area | Implementasi |
|---|---|
| Railway runtime | Dockerfile sekarang menggunakan `node:22-bookworm-slim` sesuai permintaan dan memasang ffmpeg, ImageMagick, libvips, library image, Python 3, pip, git, curl, wget, jq, build-essential, dan dependency lain. |
| yt-dlp | Binary resmi dipasang di `/usr/local/bin/yt-dlp`; `YTDLP_PATH` diset eksplisit. Downloader juga mencari lokasi tersebut bila environment variable kosong. |
| Startup check | `scripts/start.sh` gagal cepat dengan pesan jelas bila `python3`, `ffmpeg`, atau yt-dlp tidak tersedia, lalu mencetak versi masing-masing sebelum migrasi database dan Next.js dimulai. |
| Downloader | Menambahkan `--no-part`, `--force-overwrites`, `--abort-on-error`, batas 50 MB, timeout, extractor resmi, dan penghapusan folder sementara. Media privat atau yang memerlukan login tetap ditolak secara jujur. |
| TikTok/Instagram | URL publik diproses melalui extractor yt-dlp. Untuk sumber yang menolak extractor, tersedia fallback Cobalt **hanya** jika `COBALT_API_URL` diisi ke instance yang Anda miliki/kelola; tidak memakai endpoint anonim yang tidak dapat dijamin. |
| `.smeme` | Reply foto lalu kirim `.smeme ATAS|BAWAH`. Satu teks berarti caption bawah. Foto diproses menggunakan Sharp, diberi teks putih dengan outline hitam, dikonversi menjadi WebP sticker melalui `wa-sticker-formatter`. |
| `.swgc` | Hanya di grup dan untuk admin/owner. Kirim `.swgc teks` untuk status teks, atau reply gambar/video/audio lalu `.swgc caption` untuk mempublikasikan media ke `status@broadcast` melalui socket bot aktif. |
| `.rvo` | Reply media view-once lalu `.rvo`. Engine sekarang membuka wrapper `viewOnceMessage`, `viewOnceMessageV2`, `viewOnceMessageV2Extension`, dan `ephemeralMessage`, memakai stanza ID pesan yang benar, lalu mengirim ulang sebagai media biasa. |
| Typo command | Jika prefix benar tetapi nama command salah, engine menghitung command terdekat dan merekomendasikan hingga tiga kandidat, misalnya `.instagra` dapat menyarankan `.image` atau command terdekat yang aktif. |
| Menu | `.menu` kini menampilkan kategori dan jumlah command, plus tombol interactive `ALLMENU` dengan ID prefix aktual. Jika client WhatsApp menolak legacy buttons, engine otomatis mengirim fallback teks. `.allmenu` menampilkan seluruh command panjang. |

## Cara deploy Railway

Pastikan repository berisi `Dockerfile` dan `railway.json` versi terbaru. Railway akan membaca konfigurasi berikut: builder `DOCKERFILE`, path `./Dockerfile`, start command `sh scripts/start.sh`, dan health check `/api/health`.

Environment minimum yang harus diisi adalah `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, serta `STORAGE_CONFIG` yang menunjuk volume persisten. Volume persisten wajib agar credential WhatsApp pada folder `data/bots/<botId>` tidak hilang saat redeploy. `AI_API_KEY` tetap diperlukan untuk `.brat halo` dan command AI; fitur tersebut tidak disimulasikan ketika key kosong.

Untuk downloader utama, tidak perlu memasang Python atau yt-dlp manual pada Railway karena Dockerfile memasangnya otomatis. `COBALT_API_URL` bersifat opsional. Gunakan hanya URL instance Cobalt yang Anda deploy atau yang pemiliknya memang memberi izin. Dokumentasi Cobalt sendiri memperingatkan bahwa instance hosted publik memiliki proteksi bot dan tidak ditujukan untuk dipakai proyek lain tanpa izin.[1]

## Format command baru

| Command | Penggunaan |
|---|---|
| `.smeme` | Reply foto, lalu `.smeme ADUHH|MALU AKU` |
| `.rvo` | Reply foto/video/audio sekali lihat, lalu `.rvo` |
| `.swgc` | Di grup: `.swgc Pengumuman hari ini`; atau reply media lalu `.swgc caption` |
| `.menu` | Menampilkan kategori dan tombol `ALLMENU` |
| `.allmenu` | Menampilkan daftar command lengkap |

## Hasil validasi lokal

`npm run typecheck` lulus dengan exit code 0. `npm run lint` lulus tanpa error dan warning. `npm run build` lulus dengan exit code 0. `sh -n scripts/start.sh` juga lulus. Docker tidak tersedia di sandbox ini, sehingga build image Bookworm tidak dapat dijalankan secara lokal; sebagai gantinya Dockerfile memiliki pemeriksaan build-time dan startup-time untuk memastikan dependency runtime wajib terdeteksi di Railway.

Koneksi WhatsApp, pengiriman status ke nomor/grup tertentu, media view-once aktual, dan keberhasilan extractor terhadap URL privat tidak dapat dinyatakan teruji end-to-end tanpa akun WhatsApp yang terhubung, database Railway aktif, dan URL publik yang dapat diakses saat deployment. Kode tidak mengklaim sukses ketika sumber menolak akses.

## Referensi

[1]: https://github.com/imputnet/cobalt/blob/main/docs/api.md "Dokumentasi API Cobalt resmi"

[2]: https://github.com/yt-dlp/yt-dlp "Repositori resmi yt-dlp"

[3]: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md "Daftar situs yang didukung yt-dlp"

yt-dlp menyediakan extractor resmi untuk banyak platform, tetapi akses platform dapat berubah dan sebagian URL memerlukan login atau ditolak anti-bot.[2] [3]

— **Manus AI**
