# WATER AI CLOUD V3.5 — Upgrade Report V13

## Masalah yang diperbaiki

### 1. `.play` tidak berfungsi
**Penyebab umum:**
- Urutan engine: converter eksternal (sering mati) diprioritaskan sebelum yt-dlp
- Client YouTube terbatas → "Sign in to confirm you're not a bot"
- Error message kurang membantu

**Perbaikan:**
- **yt-dlp dijadikan engine utama** (paling stabil di image Docker yang sudah include binary)
- Fallback: Cobalt (jika `COBALT_API_URL`) → converter eksternal → retry `ytsearch1`
- Multi player client: `android,ios,web,mweb,tv`
- Support opsional `YTDLP_COOKIES` (path file Netscape) untuk bot-check keras
- Pesan error lebih jelas + tips

### 2. `.sandboxdeploy` gagal
**Penyebab:**
- API host salah: `api.e2b.dev` → harus `api.e2b.app`
- Endpoint files/commands di control plane sudah tidak valid; harus lewat **envd** (`49983-<sandboxId>.e2b.app`)
- `getRepliedMedia` tidak mengembalikan `filename` → deteksi ZIP gagal untuk document WA
- Header auth campur Bearer + X-API-KEY tidak konsisten

**Perbaikan:**
- Create sandbox: `POST https://api.e2b.app/sandboxes` + header `X-API-Key`
- Upload ZIP via envd filesystem (`/files?path=...`) dengan `X-Access-Token` (envdAccessToken)
- Extract + `npm install` / static serve di port 3000
- Public URL: `https://3000-<sandboxId>.e2b.app`
- `getRepliedMedia` sekarang return `{ buffer, mimetype, filename }`
- Deteksi ZIP lebih toleran (magic PK, mime, ekstensi nama file)
- Timeout configurable: `E2B_TIMEOUT_SEC` (default 3600, max 3 jam)

## Cara pakai

```
.play faded
.play https://youtu.be/dQw4w9WgXcQ
.song multo
```

```
# Set E2B_API_KEY di .env atau Dashboard → Bot Settings → E2B API Key
# Reply file .zip project, lalu:
.sandboxdeploy
```

## Env baru (opsional)
```
E2B_API_KEY=
E2B_TEMPLATE_ID=base
E2B_TIMEOUT_SEC=3600
YTDLP_COOKIES=/path/to/cookies.txt
COBALT_API_URL=https://your-cobalt-instance
```

## Catatan deploy
- Image Docker sudah menginstall `yt-dlp` (nightly) + ffmpeg + unzip
- Tanpa E2B key, command sandboxdeploy memberi petunjuk setup (tidak crash)
- Sandbox E2B butuh akun di https://e2b.dev (ada free tier)
