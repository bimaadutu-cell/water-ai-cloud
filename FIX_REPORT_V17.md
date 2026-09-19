# V17 — Fix Turbopack Baileys build

## Error
- `cannot reassign const` di rich-message-utils.js (Turbopack transpile bug)
- `Module not found: @napi-rs/image`

## Fix
1. `serverExternalPackages` include `@sairidev/baileys-new`, `@napi-rs/image`, sharp, jimp, libsignal, ...
2. Add dependency `@napi-rs/image@^1.9.2`
3. Browser identity: `["Ubuntu", "Chrome", "22.04"]` — QR/pairing tidak diubah
4. Baileys tetap `@sairidev/baileys-new@0.3.21`

## Downloader
- yt-dlp tetap di Docker image `/usr/local/bin/yt-dlp`
- play memakai yt-dlp sebagai engine utama
