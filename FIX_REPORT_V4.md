# WATER AI CLOUD — Laporan Perbaikan V4

## Perubahan utama

Versi ini memperbaiki kegagalan TikTok pada screenshot, mengubah BRAT ke desain putih/hitam tanpa watermark, menambahkan alias platform, dan memperbaiki publikasi media ke WhatsApp Status.

| Area | Perubahan |
|---|---|
| BRAT | `.brat` menghasilkan WebP lokal dengan latar putih dan teks hitam tebal. Tidak ada watermark, branding, atau pemanggilan AI. |
| BRAT animated | `.bratgif`, `.bratvideo`, dan `.bratvid` menghasilkan animated WebP tiga detik melalui FFmpeg; hanya teks yang dianimasikan. |
| Downloader | Selector format video tidak lagi memaksa ext mp4+m4a yang menyebabkan `Requested format is not available` pada TikTok. Fallback kini `bv*[height<=720]+ba/b[height<=720]/bv*+ba/best`. |
| Alias platform | `.tiktok`, `.instagram`, `.youtube`, dan `.allvid` memanggil pipeline downloader yang sama. |
| SWGC | Reply video/foto sekarang dikirim sebagai media nyata ke `status@broadcast`, dengan `statusJidList` anggota grup, mimetype, caption, progress `⌛`, sukses `✅`, dan gagal `🥀`. |
| Emoji | Downloader memakai `⬇️` saat mulai, `✅` saat selesai, dan `🥀` saat gagal. BRAT dan SWGC memakai progress yang sama. |
| Runtime | FFmpeg sistem `/usr/bin/ffmpeg` diprioritaskan; `wa-sticker-formatter` dihapus karena menyebabkan crash native pada test static sticker. |

## Status engine eksternal yang diminta

URL `vidssave.com`, `fdown.net`, `savefrom.co.id`, dan `savekit.io/id` yang diberikan adalah halaman web downloader, bukan dokumentasi API backend publik. Audit halaman menunjukkan alur form browser; SaveKit juga terkena CAPTCHA saat dibuka secara otomatis. Tidak ada kontrak request/response resmi yang dapat dipakai dengan aman. Karena itu paket **tidak menebak endpoint internal** dan tidak mengklaim bahwa `.allvid` sedang memanggil halaman tersebut sebagai engine.

Engine otomatis yang benar-benar dipakai adalah yt-dlp resmi untuk URL publik yang extractor-nya berhasil. Fallback Cobalt hanya aktif jika `COBALT_API_URL` diisi dengan instance yang dimiliki/dikelola pengguna. Jika Anda memperoleh endpoint API resmi dari salah satu situs tersebut, endpoint itu dapat ditambahkan sebagai adapter terverifikasi; homepage-nya sendiri tidak cukup untuk integrasi server-side.

| Sumber | Bisa dipanggil sebagai engine tanpa API resmi? | Status V4 |
|---|---:|---|
| VidsSave | Tidak | Dicatat sebagai sumber web; tidak ada POST spekulatif |
| FDown | Tidak; fokus utama Facebook | Tidak dipakai sebagai engine umum |
| SaveFrom Indonesia | Tidak | Dicatat sebagai sumber web; tidak ada POST spekulatif |
| SaveKit | Tidak; halaman dilindungi CAPTCHA saat audit | Dicatat sebagai sumber web; tidak ada scraping |
| yt-dlp | Ya, sebagai CLI resmi | Engine utama |

## Validasi

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus, exit code 0 |
| `npm run lint` | Lulus, exit code 0 |
| BRAT static handler | WebP valid, latar putih, 1 frame |
| BRAT animated handler | WebP valid, 75 frame untuk `.bratgif` dan `.bratvid` |
| SWGC mock integration | Payload video diterima, target `status@broadcast`, audience list diteruskan |
| TikTok metadata | URL publik contoh berhasil diekstrak metadata; unduhan sumber ditolak challenge TikTok, sehingga error dilaporkan jujur |
| `npm run build` | Lulus, exit code 0 |
| `sh -n scripts/start.sh` | Lulus, exit code 0 |
| Docker build | Tidak dijalankan karena Docker tidak tersedia di sandbox |

## Deployment

Railway tetap memakai Dockerfile Bookworm dengan Python 3, ffmpeg, ImageMagick, libvips, library gambar, dan yt-dlp. Pastikan `YTDLP_PATH=/usr/local/bin/yt-dlp`, `FFMPEG_PATH=/usr/bin/ffmpeg`, volume persisten `STORAGE_CONFIG`, serta database Railway sudah aktif. Posting status WhatsApp bukan operasi 0,2 milidetik; waktu aktual bergantung pada jaringan, ukuran media, dan respons server WhatsApp.

## Referensi

[1]: https://vidssave.com "VidsSave homepage"
[2]: https://fdown.net "FDOWN homepage"
[3]: https://savefrom.co.id "SaveFrom Indonesia homepage"
[4]: https://savekit.io/id "SaveKit Indonesia homepage"
[5]: https://github.com/yt-dlp/yt-dlp "yt-dlp official repository"
[6]: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md "yt-dlp supported sites"
