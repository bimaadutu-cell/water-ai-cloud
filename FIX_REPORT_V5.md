# WATER AI CLOUD — Laporan Perbaikan V5

## Ringkasan

V5 memperbaiki error runtime yang tampak pada screenshot dan menambahkan konfigurasi foto menu. Dua sumber error utama adalah pemanggilan method Baileys yang tidak tersedia untuk foto profil grup dan asumsi bahwa WhatsApp memiliki objek status grup terpisah.

| Area | Perbaikan V5 |
|---|---|
| `.setppgc` | Mengganti `groupUpdateProfilePicture` yang tidak tersedia menjadi `updateProfilePicture(jid, buffer)`, memvalidasi reply gambar, dan memberi pesan error yang akurat. |
| `.swgc` | Mengirim reply foto/video ke `status@broadcast` sebagai payload media nyata, dengan caption, mimetype, dan `statusJidList` berisi anggota grup. WhatsApp tidak memiliki “status grup” terpisah; daftar anggota grup menjadi audiens status. |
| BRAT | Latar putih, teks hitam tebal, tegak/non-italic, tanpa watermark/branding, tanpa AI. |
| `.bratgif`/`.bratvid` | Animated WebP dengan teks tegak; hanya teks yang dianimasikan. |
| `.react` | Command baru untuk reaksi pada pesan reply, ditempatkan di kategori IMAGE sesuai permintaan. Contoh: reply pesan lalu `.react ❤️`. |
| Foto menu | Dashboard → Bots → Settings memiliki field Foto Menu (URL HTTPS). URL tersimpan di `bots.settings.menuPhotoUrl` dan dipakai untuk `.menu` serta `.allmenu`. Bila gagal diambil, bot kembali ke menu teks. |
| API settings | Update settings digabung dengan settings lama sehingga konfigurasi lain tidak tertimpa. URL dibatasi HTTP/HTTPS dan maksimum 2000 karakter. |
| Alias platform | `.tiktok`, `.instagram`, dan `.youtube` tetap tersedia pada registry dan memakai downloader existing. |

## Validasi

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus, exit code 0 |
| `npm run lint` | Lulus, exit code 0 |
| `npm run build` | Lulus, exit code 0 |
| `sh -n scripts/start.sh` | Lulus, exit code 0 |
| `.setppgc` mock | Memanggil `updateProfilePicture` dengan JID grup dan Buffer gambar |
| `.react` mock | Memanggil `sendMessage` dengan payload `react` dan key pesan reply |
| `.swgc` mock | Payload video dikirim ke `status@broadcast` dengan `statusJidList` anggota grup |
| Foto menu | Handler mengambil URL HTTPS sebagai image dan menaruh menu pada caption; fallback teks tersedia |

## Kredensial admin awal

Migrasi membuat akun awal dengan username `admin` dan email `admin@wateraicloud.dev`. Password default adalah `Water@2026` hanya apabila `ADMIN_INITIAL_PASSWORD` tidak didefinisikan sebelum migrasi. Jika deployment sudah pernah berjalan atau environment tersebut pernah diubah, gunakan password environment yang Anda tetapkan atau lakukan reset password; aplikasi tidak dapat mengetahui password lama dari hash database.

## Catatan status WhatsApp

`status@broadcast` adalah feed Status WhatsApp, bukan chat group. Agar konten ditujukan kepada anggota grup, V5 meneruskan `statusJidList` berdasarkan metadata grup. Visibilitas aktual tetap tunduk pada kebijakan privasi dan dukungan akun WhatsApp bot. Waktu “0,2 milidetik” tidak dapat dijamin karena pengiriman media melibatkan upload dan server WhatsApp.

## Deployment

Railway tetap memakai Dockerfile Node 22 Bookworm dengan Python 3, ffmpeg, ImageMagick, libvips, dan yt-dlp. Jalankan redeploy penuh setelah mengunggah paket agar registry command dan bundle server terbaru digunakan. Pastikan `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `STORAGE_CONFIG`, dan volume persisten sudah aktif.
