# WATER AI CLOUD V3.5 — Upgrade Report V12

## Perubahan utama

### 1. Fitur `.play` (YouTube / audio)
- Alur baru: **cari → kirim thumbnail + judul → "ntar nih lagi di download" → unduh MP3 → kirim audio**
- Fallback engine Y2Mate-style ke endpoint:
  - https://fashionmaya.pl
  - https://eastsidediner.ca
  - https://id.vidssave.com
- Jika endpoint eksternal gagal, tetap pakai **yt-dlp** (engine utama yang stabil)
- Alias: `.song`, `.audio`, `.ytmp3` → sama dengan `.play`

### 2. Instagram downloader diperbaiki
- Multi-engine: yt-dlp → Snap-Insta/web → Cobalt (jika `COBALT_API_URL` diset)
- Handler `.instagram`, `.igdl`, `.instagramvideo`, `.instagramphoto` diperbarui

### 3. Alias & toleransi input
- Registry sudah punya banyak alias (igdl, ytmp3, ttdl, dll.)
- Matching command: `trim` + `toLowerCase` + fuzzy Levenshtein (sudah ada di engine)
- Contoh `. Play multo` / `.play multo` tetap terbaca sebagai `play`

### 4. Fitur **gantimenu** (Owner only)
- Command: `.gantimenu <1-5>`
- Style 1: default, **tanpa tombol**
- Style 2–5: tampilan makin keren + **tombol interaktif**
- Style tersimpan di `bot.settings.menuStyle`
- Juga bisa diatur dari **Dashboard → Bot Config → Menu Style**

### 5. Tombol WhatsApp
- `sendInteractive` di-upgrade: coba interactiveButtons modern → legacy buttons → fallback teks petunjuk
- Maks 3 tombol (batas WA)

### 6. Promo di `allmenu` / `menu`
Teks promo WATER AI CLOUD V3.5 + Server 1/2 + kontak developer otomatis tampil di footer menu.

### 7. AI (Gemini) lebih fleksibel
- Key dibaca dari **bot settings (dashboard)** dulu, lalu fallback ke `.env` (`GEMINI_API_KEY` / `AI_API_KEY`)
- Di dashboard bot config ada field:
  - Gemini / AI API Key
  - AI Model
- Jika key kosong di keduanya, pesan error jelas mengarahkan set di .env atau dashboard

## Cara pakai singkat
```
.play faded
.instagram https://www.instagram.com/reel/xxxxx/
.gantimenu 3
.menu
.allmenu
.ai siapa kamu
```

## Deploy
1. Set `GEMINI_API_KEY` di .env **atau** isi di dashboard bot
2. Pastikan `yt-dlp` + `ffmpeg` terpasang di server
3. (Opsional) `COBALT_API_URL` untuk fallback Instagram/YouTube
