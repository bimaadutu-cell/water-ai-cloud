# WATER AI CLOUD V3.5 — FIX REPORT V9

## Ringkasan
Source lama dipertahankan dan di-upgrade langsung pada workspace yang sama. Backup sebelum perubahan tersedia di `water-ai-cloud-backup`. Framework utama Next.js/TypeScript, runtime Baileys, database Drizzle, media Sharp/FFmpeg, serta command lama tidak dihapus.

## Perubahan inti
| Area | Hasil |
|---|---|
| Registry | Registry terpusat berisi **353 command unik**; jumlah berasal dari entri registry, bukan angka menu hardcode. |
| Handler | Command lama tetap memakai handler lama. Command ekspansi memakai handler modular `extendedCommand` dengan validasi argumen/media, pemrosesan Sharp nyata, routing AI/search/downloader nyata, dan error jujur. |
| Parser | Ditambahkan `extractMessageText()` untuk conversation, extended text, image/video/document/audio caption, button/list/interactive response, view-once/ephemeral/document wrapper, serta quoted message. |
| Quoted media | Context quoted dicari dari root media dan extended message; downloader media lama tetap dipakai oleh command yang sudah ada. |
| Owner | Ditambahkan `getSenderNumber()` dan `isOwner()` berbasis normalisasi JID/nomor. Group message memakai `key.participant` atau `senderPn`, bukan remoteJid grup. Format `628...`, `+628...`, `08...`, dan JID didukung. |
| AI | Jika `AI_API_KEY` tidak tersedia tetapi `GEMINI_API_KEY` ada, sistem memakai endpoint OpenAI-compatible Gemini dan default model `gemini-2.5-flash-lite`. API key tetap hanya dari environment. |
| `.swgc` | Makna lama sebagai publikasi teks/media grup ke WhatsApp Status dipertahankan. Sukses hanya dikirim jika Baileys mengembalikan message key; kegagalan dikembalikan secara jujur. |
| Temporary files | Ditambahkan cleanup otomatis untuk artefak temporary yang berusia lebih dari enam jam. Cleanup bersifat best-effort dan tidak boleh menjatuhkan bot. |
| Safety downloader | Jalur downloader lama tetap memakai extractor/fallback nyata, batas ukuran, timeout, validasi file, dan penolakan media privat/login/DRM. |

## Verifikasi
| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus |
| `npm run lint` | Lulus |
| `npm run build` dengan `DATABASE_URL` runtime sementara | Lulus |
| Registry count | 353 entri |
| Duplicate command | Tidak ada |
| Backup source | Tersedia sebelum perubahan |

Build menampilkan peringatan NFT tracing dari dynamic filesystem access yang sudah ada pada jalur engine; peringatan tersebut tidak menghentikan kompilasi dan seluruh route berhasil dibuat.

## Konfigurasi penting
Untuk AI Gemini, isi `GEMINI_API_KEY` pada environment produksi; `AI_MODEL` dan `AI_BASE_URL` dapat digunakan untuk override. `DATABASE_URL`, kredensial aplikasi, storage, dan sesi WhatsApp tetap wajib diisi sesuai deployment. Downloader tidak mengklaim berhasil apabila engine tidak menghasilkan media yang tervalidasi.
