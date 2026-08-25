# WATER AI CLOUD

> **Powerful WhatsApp Automation, Built for Everyone.**

Platform SaaS untuk menjalankan bot WhatsApp di cloud: koneksi QR/pairing code real (Baileys),
multi-bot terisolasi, command & automation engine, REST API + webhook (HMAC-signed, retry),
AI integration, dashboard real-time (SSE), billing, admin panel, dan PWA.

## Stack

| Layer | Teknologi |
|---|---|
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind CSS v4 |
| Backend | Node.js REST API (route handlers) + SSE realtime |
| Bot engine | `@whiskeysockets/baileys` v6 (multi-device, per-bot auth state di disk) |
| Downloader | Binary `yt-dlp` resmi + `ffmpeg` (extractor publik) |
| Database | PostgreSQL + Drizzle ORM |
| Validasi | Zod |
| Realtime | Server-Sent Events (tanpa polling berlebihan) |

## Deploy ke Railway (panduan)

1. Push repo ke GitHub — **WAJIB commit `package-lock.json`** (tanpa lockfile `npm ci` akan gagal).
2. Railway → New Project → Deploy from GitHub repo.
3. Railway akan otomatis memakai `railway.json` (builder **Dockerfile**). Kalau sebelumnya memakai Nixpacks, ubah: Settings → Build → Builder = **Dockerfile** (Nixpacks install tanpa devDependencies sehingga Tailwind gagal di-build).
4. Tambah **Railway Postgres** ke project yang sama, lalu set environment variables:
   - `DATABASE_URL` — otomatis terisi oleh plugin Railway Postgres
   - `APP_URL` — domain publik Railway (mis. `https://water-ai-cloud-v2.up.railway.app`)
   - `ADMIN_INITIAL_PASSWORD` — (opsional) password awal akun admin; default `Water@2026`
   - `AI_API_KEY` — (opsional) untuk command AI
   - Volume persisten yang dipasang ke `STORAGE_CONFIG` — wajib jika sesi WhatsApp harus bertahan setelah restart/deploy
5. Deploy. **Setiap boot** server menjalankan `scripts/migrate.mjs` (auto-migrasi skema + seed admin/pricing, idempotent) sehingga:
   - kolom sisa versi lama (mis. `users.password`) dihapus otomatis
   - skema sinkron dengan `src/db/schema.ts`
   - akun admin & pricing selalu ada
   - login/register/dashboard langsung berfungsi tanpa migrasi manual

> Kalau deploy sebelumnya pernah gagal dengan error `null value in column "password"`,
> `operator does not exist: uuid = text`, atau `Plan ENTERPRISE membatasi 1 bot` —
> itu semua gejala database yang tidak sinkron / belum ter-seed. Deploy ulang dengan
> versi ini dan startup script akan memperbaikinya otomatis.

Password admin awal **hanya dicetak di log terminal deployment** (Railway → Console),
tidak pernah ditampilkan di halaman web. Segera ganti lewat Dashboard → Settings.

## Menjalankan

```bash
npm install
cp .env.example .env          # isi DATABASE_URL, AUTH_SECRET, ADMIN_INITIAL_PASSWORD, dll
npx drizzle-kit push          # buat tabel
npx tsx src/db/seed.ts        # seed pricing + admin + announcement (credential dicetak di terminal, bukan di website)
npm run build
npm start
```

Seed membuat user admin awal (`admin` / `admin@wateraicloud.dev`).
Password awalnya dibaca dari env `ADMIN_INITIAL_PASSWORD` (default bila kosong: `Water@2026`)
dan **hanya dicetak ke terminal saat seed** — tidak pernah tampil di halaman web.
Segera ganti lewat Dashboard → Settings → Change Password.

## Alur Bot (100% nyata, bukan simulasi)

```
Web (dashboard) → API → Auth → Bot Manager → WhatsApp Session (Baileys)
   → Message Handler → Command Handler → Automation → Database + Webhook
```

1. Buat bot → engine Baileys membuat socket dengan auth state terisolasi `data/bots/<botId>/`.
2. Start bot → socket menyambung ke WhatsApp, QR asli ditampilkan (atau pairing code via `requestPairingCode`).
3. Pesan masuk → dinormalisasi (text/reply/image/video/audio/document/sticker/location/contact/reaction/notification) → command handler (prefix, permission owner/admin) → automation (keyword, auto reply, welcome, goodbye, anti-link, scheduled, AI reply) → log + webhook + SSE.
4. Disconnect → status `RECONNECTING` + exponential backoff (1.5s×2ⁿ, maks 8x → `ERROR`, tanpa infinite loop).
5. Pairing code diminta dari socket WhatsApp yang sudah terbuka melalui `requestPairingCode`; tidak ada generator kode lokal, kode dummy, atau browser simulasi.
6. Descriptor client yang dikirim Baileys adalah `Ubuntu / Chrome / 22.04.4`; Baileys tetap memakai WebSocket protokol WhatsApp, bukan menjalankan Chrome headless.
7. Stop bot A tidak memengaruhi bot B (instance terpisah).

## Downloader nyata

Command `.play`/`.song`/`.audio` mengambil audio dan `.video`/`.media` mengambil video melalui binary `yt-dlp` resmi. Query judul diubah menjadi pencarian `ytsearch1`; URL publik YouTube, TikTok, Instagram, dan situs lain diproses melalui extractor yang tersedia pada versi yt-dlp yang terpasang. `ffmpeg` dipakai untuk menggabungkan atau mengonversi stream. Ukuran media dibatasi 50 MB. Media privat, media yang membutuhkan login, playlist, dan bypass proteksi tidak diproses.

Pada image Docker, binary di-install ke `/usr/local/bin/yt-dlp` dan `ffmpeg` di-install dari Alpine. Untuk instalasi lokal, pasang `yt-dlp` serta `ffmpeg`, lalu atur `YTDLP_PATH` bila binary tidak berada di `PATH`. Engine tidak mengklaim sukses bila extractor gagal; bot mengirim pesan error yang sebenarnya.

## REST API (Gateway v1)

Autentikasi: `Authorization: Bearer WAC_...` (DB hanya menyimpan SHA-256 key).
Permission: `messages.send`, `messages.read`, `bots.read`, `bots.manage`, `webhooks.manage`.
Rate limit: 60 req/menit per key. IP whitelist per key.

```
POST /api/v1/messages/text|image|video|audio|document|contact|location
GET  /api/v1/bot/status          GET /api/v1/bots
POST /api/v1/bots                DELETE /api/v1/bots/{id}
POST /api/v1/webhooks
```

Coba langsung: **/docs/playground** (request sungguhan ke backend).

## Keamanan

- Password di-hash **scrypt** (salt acak); sesi token 256-bit disimpan sebagai **hash SHA-256**, cookie httpOnly `SameSite=Lax`.
- Rate limit per-IP (login/register/forgot) & per-user/per-key (API).
- Origin check pada request mutasi (CSRF); header keamanan (HSTS, XFO, nosniff, referrer-policy).
- Webhook ditandatangani **HMAC-SHA256** (`x-water-signature`) + retry 3x.
- Otorisasi **server-side** (role check di setiap route admin; maintenance gate di layout + API).
- API key & webhook secret tidak pernah bocor ke frontend; AI key hanya dibaca server dari env.
- Stack trace tidak pernah dikirim ke client (error format konsisten `{ success, error: { code, message } }`).

## Environment

Lihat `.env.example`. Variabel penting: `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `AI_API_KEY` (opsional, server-side), `STORAGE_CONFIG` (folder default `./data`).

## Struktur

```
src/
  app/            # landing, auth, dashboard/*, admin, docs, status, api/*
  app/api/        # health, events (SSE), auth, public, dashboard, v1 (gateway), admin
  components/     # UI kit, landing islands, auth, dashboard shell
  server/         # lib (auth/rate-limit/log), sse hub, webhooks, engine (Baileys)
  db/             # drizzle schema + seed
data/bots/<id>/   # auth state WhatsApp per bot (tergitignore)
```

## PWA

`manifest.webmanifest` + service worker (`/sw.js`) dengan offline fallback; API/SSE tidak di-cache.

## Legal

Platform ini untuk otomasi komunikasi yang sah. Koneksi WhatsApp berjalan melalui Baileys
(multi-device link) dan Anda bertanggung jawab untuk mematuhi Terms of Service WhatsApp
serta peraturan yang berlaku di wilayah Anda. Jangan gunakan untuk spam atau gangguan.

© 2026 WATER AI CLOUD.
