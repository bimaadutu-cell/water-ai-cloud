# WATER AI CLOUD — FIX REPORT V8

## Ringkasan

V8 memperbaiki tampilan BRAT yang pada pengujian WhatsApp terlihat terlalu kecil dan terkunci dalam kapsul sempit. Renderer sekarang kembali ke komposisi BRAT yang lebih normal: latar putih, teks hitam tebal, ukuran besar, horizontal, terpusat, dan proporsional. Dukungan emoji tetap aktif melalui pembungkusan berbasis grapheme dan font Noto Emoji yang dipasang di image Railway.

V8 juga memasang logo WATER AI CLOUD dari lampiran pengguna sebagai foto default untuk `.menu` dan `.allmenu`. URL foto custom yang diatur admin tetap diprioritaskan; bila URL custom kosong, gagal diakses, atau tidak valid, sistem memakai aset lokal `public/menu-water-ai-cloud.png` sehingga menu tetap menampilkan foto tanpa bergantung pada host eksternal.

## Perbaikan BRAT

Masalah visual sebelumnya berasal dari layout kapsul per baris dan perhitungan lebar berdasarkan jumlah grapheme yang membuat teks pendek seperti `OYY 😹` terlihat sangat kecil. Layout tersebut diganti dengan blok teks klasik BRAT. Seluruh baris dihitung berdasarkan panjang baris terpanjang, lalu menggunakan satu ukuran font yang konsisten agar komposisi tampak rapi.

Teks maksimum dibungkus menjadi lima baris. `Intl.Segmenter` digunakan ketika tersedia agar emoji gabungan, skin tone modifier, variation selector, dan zero-width joiner tidak terpotong sembarangan. Teks tidak diputar, tidak dimiringkan, tidak diberi watermark, dan tetap memakai warna hitam di atas latar putih.

`.bratvid` dan `.bratgif` memakai SVG BRAT yang sama sebelum diproses FFmpeg, sehingga desain dan dukungan emoji konsisten di semua varian. Font `Noto Sans`, `Noto Color Emoji`, dan `DejaVu Sans` disertakan melalui Dockerfile bersama fontconfig agar hasil tidak bergantung pada font host.

## Foto menu dan allmenu

Aset lampiran logo disalin sebagai `public/menu-water-ai-cloud.png` dengan format PNG RGBA 1254×1254 dan permission baca untuk user runtime `node`. Fungsi `renderMenu` sekarang mengikuti urutan berikut:

| Prioritas | Sumber foto | Perilaku |
|---|---|---|
| 1 | `bot.settings.menuPhotoUrl` | Dipakai jika URL admin valid dan berhasil diunduh sebagai image |
| 2 | `public/menu-water-ai-cloud.png` | Dipakai sebagai default/fallback lokal |
| 3 | Menu teks | Dipakai hanya jika kedua sumber foto tidak tersedia |

Perubahan berlaku untuk `.menu` dan `.allmenu`, sedangkan tombol `ALLMENU` pada `.menu` tetap dipertahankan.

## Validasi

| Pemeriksaan | Hasil |
|---|---|
| BRAT teks + emoji | Lulus; WebP 512×512 |
| BRATVID teks + emoji | Lulus; WebP 480×480 |
| BRATGIF teks + emoji | Lulus; WebP 480×480 |
| Logo menu | Lulus; PNG RGBA 1254×1254, 2,3 MB |
| `npm run typecheck` | Lulus, exit code 0 |
| `npm run lint` | Lulus, exit code 0 |
| `npm run build` | Lulus, exit code 0 |

Smoke test memakai teks `OYY 😹🔥✨` dan `WATER AI CLOUD` tanpa error. Uji WhatsApp setelah redeploy dapat dilakukan dengan `.brat OYY 😹🔥✨`, `.bratvid WATER AI 🚀`, `.bratgif WATER AI 💧`, `.menu`, dan `.allmenu`.

## Deployment

Gunakan Dockerfile V8 ketika redeploy Railway. Tidak perlu mengatur URL menu untuk mendapatkan logo default. Jika admin ingin mengganti foto di masa depan, setting **Menu Photo URL** tetap dapat diisi dengan URL gambar publik. Setelah deploy, restart bot agar proses Node memuat source baru dan aset lokal.

Paket distribusi tidak menyertakan `node_modules`, `.next`, cache TypeScript, log, atau kredensial produksi.
