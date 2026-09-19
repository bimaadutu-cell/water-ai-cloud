# WATER AI CLOUD V3.5 — Fix V14 (Sandbox port 3000)

## Masalah
`.sandboxdeploy` berhasil create sandbox + kirim URL, tapi browser error:
**Closed Port Error — no service running on port 3000**

## Penyebab
Command extract/start server lewat REST envd mentah (`/commands`, `/processes`) tidak mengeksekusi process dengan benar. Server HTTP tidak pernah listen di 3000.

## Perbaikan
1. Tambah dependency resmi **`e2b`** (`^2.8.0`)
2. Rewrite `.sandboxdeploy` memakai SDK:
   - `Sandbox.create(template, { apiKey, timeoutMs })`
   - `sandbox.files.write('/home/user/project.zip', buffer)`
   - `sandbox.commands.run(...)` untuk extract + npm install
   - Start server: `nohup` + **`commands.run(..., { background: true })`** dengan `python3 -m http.server 3000`
   - Fallback paksa static server jika probe port gagal
   - URL via `sandbox.getHost(3000)` → `https://3000-<id>.e2b.app`
3. Sandbox **tidak di-kill** setelah deploy agar URL tetap hidup sampai timeout

## Deploy ulang
1. Pakai ZIP V14
2. Railway rebuild (Dockerfile akan `npm install` termasuk package `e2b`)
3. Pastikan `E2B_API_KEY` masih valid
4. Reply `.zip` → `.sandboxdeploy` lagi
5. Buka URL; jika masih warm-up tunggu 5–15 detik lalu refresh

## Catatan
- Template `base` E2B sudah include Python 3 + Node.js → `python3 -m http.server` selalu tersedia
- Project static (HTML) langsung serve; project Node dengan `start`/`dev` script juga dicoba
