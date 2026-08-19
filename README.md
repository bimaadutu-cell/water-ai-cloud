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
| Bot engine | `@whiskeysockets/baileys` v7 (multi-device, per-bot auth state di disk) |
| Database | PostgreSQL + Drizzle ORM |
| Validasi | Zod |
| Realtime | Server-Sent Events (tanpa polling berlebihan) |

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
5. Stop bot A tidak memengaruhi bot B (instance terpisah).

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

Lihat `.env.example`. Variabel penting: `DATABASE_URL` (Railway PostgreSQL or Neon PostgreSQL), `APP_URL`, `AUTH_SECRET`, `AI_API_KEY` (opsional, server-side), `STORAGE_CONFIG` (folder default `./data`).

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


## Neon PostgreSQL

The application accepts a standard Neon pooled PostgreSQL URL through `DATABASE_URL`, including URLs with `sslmode=require&channel_binding=require`. The server detects Neon automatically and enables TLS plus node-postgres channel binding. It also contains a startup migration for older WATER AI CLOUD databases whose `public.users.id` is `BIGINT`/`INTEGER`: existing user IDs are mapped to UUIDs without deleting the user records, and dependent `user_id` columns are migrated before foreign keys are restored.

**Important:** never put a real Neon password in source code, `.env.example`, or Git. Configure the full connection string only in Railway Variables.


## Railway + Neon deployment fix

This build keeps database initialization out of the Next.js build phase. `DATABASE_URL` is read at runtime, so Railway can build the Docker image without requiring the database secret as a Docker build argument. At runtime the app supports standard PostgreSQL/Neon URLs, including `sslmode=require` and `channel_binding=require`.

The startup migration also handles legacy `public.users.id` values stored as BIGINT/INTEGER by mapping them to UUID and updating `user_id` foreign-key columns before the application creates its UUID-based tables.
