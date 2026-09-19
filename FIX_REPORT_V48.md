# V48 — Board image + audio yt-dlp fallback

## Masalah
1. Papan catur & TTT hanya kirim rich-HTML → di WhatsApp banyak client tampil kotak hitam kosong
2. `.play3` / SoundCloud hanya mirror Cobalt/Piped (banyak mati + butuh JWT) → audio gagal, HTML tanpa sumber
3. Mirror list usang

## Perbaikan
1. **Chess `.chess2`**: HTML opsional; **gambar papan (sharp)** selalu dikirim sebagai primary
2. **TTT `.ttt`**: sama — HTML opsional, **gambar papan** primary + tombol
3. **PLAY3**: setelah mirror gagal → **fallback yt-dlp / playV35** (engine Docker resmi)
4. Update daftar Piped + Invidious mirror

## Deploy
1. Deploy image ini (yt-dlp + ffmpeg sudah di Dockerfile)
2. Opsional: set `COBALT_API_URL` ke instance Cobalt **milik sendiri** (public API sekarang butuh JWT)
3. Opsional: `YTDLP_COOKIES` bila YouTube block

## Uji
- `.chess2` → harus muncul **gambar papan** + tombol
- `.ttt` → harus muncul **gambar papan 3x3** + tombol
- `.play3 bergema sampai selamanya` → audio WA + HTML (jika buffer ada)
- `.play2 ...` / `.play ...` → sama, via yt-dlp
