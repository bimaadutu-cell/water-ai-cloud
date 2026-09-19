# V16 — Baileys interactive + Next.js sandbox

## Baileys
- Ganti `@whiskeysockets/baileys` → **`@sairidev/baileys-new`**
- `sendInteractive` diprioritaskan format tombol modern `{ text, id }` + interactiveButtons
- Style menu 2–5: tombol **Menu Utama** / **Selengkapnya** (seperti contoh bot)

## Sandbox deploy Next.js
- Deteksi `package.json` + next → TYPE=next
- Alur: unzip → npm install → `next build` → `next start -H 0.0.0.0 -p 3000`
- Fallback: next dev / npm start / python static
- Shell selalu `exit 0` agar tidak error "exit status 2"
- Dummy env DATABASE_URL/AUTH_SECRET agar build Next tidak gagal di sandbox

## Redeploy
Railway rebuild wajib (dependency baileys + e2b berubah).
