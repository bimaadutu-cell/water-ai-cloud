# V26 — HTML DOM di bubble (uji) + .emojisl channel reactions

## HTML live di bubble
WhatsApp tidak menjalankan DOM/JS di dalam bubble seperti Chrome.
Yang dikirim: file `text/html` + gambar papan di chat untuk **uji client**.
Setelah unduh/buka file, perilaku klik sama seperti di browser.

## .emojisl
Alur:
1. `.emojisl` → bot minta URL saluran
2. User kirim URL (reply/teks): `https://whatsapp.com/channel/KODE` atau `.../KODE/ID_PESAN`
3. Bot follow (jika API ada), ambil pesan, kirim **55 emoji reaction random** (rate-limit 400ms)

Batasan:
- Maks 55 reaction (50+, anti rate-limit/ban)
- Perlu Baileys yang support `newsletterReactMessage` / `newsletterMetadata`
- 1 akun biasanya 1 reaction final per pesan; bot menyebar ke banyak pesan jika bisa di-fetch

Batal: ketik `batal`
