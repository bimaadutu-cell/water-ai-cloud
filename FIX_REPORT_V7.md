# WATER AI CLOUD — FIX REPORT V7

## Ringkasan

V7 memperbaiki dua masalah yang terlihat pada screenshot: TikTok berhenti pada `HTTP 403`/token SnapTik dan kemudian jatuh ke error `yt-dlp Unexpected response from webpage request`, sedangkan BRAT lama hanya merender glyph emoji melalui font fallback dan teks polos tanpa layout visual. Perbaikannya tetap non-AI untuk sticker, menggunakan engine downloader nyata, dan memvalidasi file sebelum payload dikirim ke Baileys.

## Akar masalah downloader

Pada V6, request ke SnapTik/Snap-Insta bergantung pada halaman web pihak ketiga. Saat halaman membalas `403` atau tidak memberikan token, fallback yt-dlp langsung mencoba halaman TikTok. Issue upstream yt-dlp yang diperbarui pada Agustus 2026 memang mendokumentasikan bahwa extractor TikTok dapat menerima respons web yang tidak terduga, sehingga mengandalkan satu extractor saja tidak cukup [1]. Selain itu, jalur payload API memiliki default audio `audio/mp4`, dan hasil media command menentukan jenis payload dari mode command, bukan MIME file aktual. Hal tersebut dapat membuat file yang valid dikirim dengan jenis yang keliru.

## Perbaikan MP4 dan MP3

### TikTok

V7 menambahkan TikWM sebagai engine pertama untuk URL TikTok/Douyin. Endpoint publik TikWM mengembalikan field `play`/`hdplay` untuk video dan `music` untuk audio. Pada saat pengujian, short link yang sama dengan screenshot berhasil diproses menjadi video MP4 dan audio MPEG/MP3. Situs TikWM menjelaskan dukungan link share seperti `vm.tiktok.com` dan menyediakan tautan API resminya sendiri [2] [3].

Urutan fallback TikTok sekarang adalah TikWM, SnapTik.net, SnapTik.app, yt-dlp dengan User-Agent browser dan `Accept-Language`, lalu Cobalt hanya jika `COBALT_API_URL` dikonfigurasi. Tidak ada bypass login, cookie, CAPTCHA, atau media private.

### Validasi file

Semua URL media langsung sekarang diambil dengan redirect, User-Agent browser, header `Accept`, referer bila tersedia, timeout 90 detik, dan batas 50 MB. Buffer diinspeksi dengan `file-type`; respons yang bukan audio/video/image yang sesuai ditolak. Untuk `.video`, payload menggunakan jenis `video` hanya jika MIME terdeteksi sebagai video; untuk `.play`, payload menggunakan jenis `audio` dan MIME `audio/mpeg` bila hasilnya audio. Foto Instagram yang sah tidak lagi dipaksa menjadi payload video.

### Baileys delivery

Default MIME audio pada jalur pengiriman API dan command diperbaiki menjadi `audio/mpeg`. Nama file audio juga diteruskan sebagai `audio.mp3` atau nama hasil yang telah disanitasi. Jika pengiriman media gagal setelah proses download sukses, bot mencatat error dan mengirim pesan kegagalan yang dapat dipahami, bukan diam-diam menelan error.

### Runtime Railway

Dockerfile sekarang mengambil binary yt-dlp nightly terbaru dari kanal resmi `yt-dlp-nightly-builds` secara default, dengan opsi build `YTDLP_CHANNEL=stable` bila diperlukan. Image memasang Python 3, FFmpeg, fontconfig, DejaVu, Noto Sans, dan Noto Color Emoji. Build nightly dipilih karena issue TikTok upstream menunjukkan perbaikan extractor dapat bergerak lebih cepat daripada release stabil [1].

## Perbaikan BRAT

`.brat`, `.bratvid`, dan `.bratgif` tetap dirender lokal memakai SVG, Sharp, dan FFmpeg tanpa AI. Renderer baru menggunakan `Intl.Segmenter` bila tersedia sehingga emoji gabungan seperti `👨‍👩‍👧‍👦`, variasi skin tone, dan emoji dengan variation selector tidak dipotong di tengah. Teks dibungkus sebagai grapheme, dibatasi maksimal lima baris, memakai font Noto Sans/Noto Color Emoji, dan ditempatkan di dalam kapsul putih dengan border hitam serta bayangan halus. Teks tetap horizontal, hitam, tebal, dan tidak memakai watermark.

Perubahan ini menjaga latar utama putih seperti permintaan sebelumnya, tetapi membuat setiap baris memiliki bentuk kartu/kapsul yang lebih rapi dan estetis. Teks panjang tetap diperkecil dan diberi `textLength` agar tidak keluar dari bidang 480×480. Daftar emoji acak `.randomsticker` juga diperbaiki karena versi lama memiliki beberapa string emoji kosong/korup.

## Hasil pengujian

| Pengujian | Hasil |
|---|---|
| TikTok `.video` dengan short link screenshot | Lulus; `kind=video`, `mimetype=video/mp4`, magic bytes MP4 valid, engine TikWM API |
| TikTok `.play` dengan short link screenshot | Lulus; `kind=audio`, `mimetype=audio/mpeg`, ID3 MP3 valid, engine TikWM API |
| BRAT emoji multi-baris | Lulus; WebP 512×512 |
| BRATVID emoji | Lulus; WebP 480×480 |
| BRATGIF emoji | Lulus; WebP 480×480 |
| `npm run typecheck` | Lulus, exit code 0 |
| `npm run lint` | Lulus, exit code 0 |
| `npm run build` | Lulus, exit code 0 |

Uji downloader menggunakan media publik yang dapat diakses tanpa login. Tidak ada downloader yang dapat menjamin semua URL akan selalu aktif karena situs sumber dapat menerapkan rate limit, mengubah token, atau memblokir IP server. V7 mengurangi titik kegagalan dengan beberapa engine dan menolak hasil yang bukan file media valid.

## Deployment

Deploy ulang menggunakan Dockerfile V7 agar instalasi `yt-dlp` nightly, FFmpeg, dan font emoji ikut masuk ke image Railway. Tidak perlu memasang `node_modules` secara manual. Environment wajib seperti `DATABASE_URL`, secret autentikasi, storage, dan konfigurasi bot tetap harus diisi pada Railway. `COBALT_API_URL` opsional dan hanya digunakan bila operator memiliki instance Cobalt sendiri.

Setelah deploy, uji dengan `.video https://vm.tiktok.com/ZSV4Bnvq6/`, `.play https://vm.tiktok.com/ZSV4Bnvq6/`, `.brat BRAT 😂🔥✨`, `.bratvid BRAT 🚀`, dan `.bratgif BRAT 💧`. Gunakan prefix tunggal, misalnya `.tiktok`; input `..tiktok` sebelumnya memang dibaca sebagai nama command `.tiktok` dan menghasilkan pesan command tidak ditemukan.

## Referensi

[1]: https://github.com/yt-dlp/yt-dlp/issues/17403 "yt-dlp issue #17403 — TikTok Unexpected response from webpage request"
[2]: https://www.tikwm.com/en/ "TikWM public TikTok downloader"
[3]: https://tikwmapi.com/ "TikWM API documentation and service page"
