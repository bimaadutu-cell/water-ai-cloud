# V30 — Media send, emojisl, autoai, img2img Gemini, HTML visible

## Fixes
1. **sendMedia** — retry tanpa thumbnail + fallback kirim sebagai dokumen jika image/video gagal
2. **Downloader** — buffer dinormalisasi; thumbnail invalid dibuang; return fokus ke media
3. **Engine media dispatch** — image/video tidak double-text; buffer dijamin Buffer
4. **Emojisl** — pending tidak hilang jika URL salah; fallback server_id 1..20; error lebih jelas
5. **.autoai / .autoaioff** — mode AI tanpa prefix di chat
6. **.img2img** — pakai Gemini (dashboard key) atau IMAGE_EDIT_API_URL
7. **Game board** — selalu kirim **gambar papan** di bubble (HTML rich dicoba di background)

## Catatan Baileys
`@sairidev/baileys-new` tetap dipakai (session/auth tidak diubah).
HTML GenAI live bergantung apakah fork expose `sendRichHtml`.
Papan selalu terlihat via **gambar**.
