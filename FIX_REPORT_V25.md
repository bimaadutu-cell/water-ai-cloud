# V25 — Kirim HTML DOM di bubble (untuk uji WhatsApp)

## Apa yang dikirim
Saat `.ttt` / `.tictactoe` / `.chess2`:
1. **Document** `text/html` (file `.html` self-contained + CSS premium + JS klik)
2. **Image** papan (preview di bubble)

## Cara uji di WhatsApp
1. Deploy V25, ketik `.ttt` atau `.chess2`
2. Di chat muncul file HTML + gambar
3. Buka/unduh file HTML
4. Cek apakah di device kamu DOM bisa diklik (browser in-app / external)

## Catatan teknis
WhatsApp **resmi tidak** merender HTML/JS di dalam bubble seperti web app.
Yang dikirim adalah **media document HTML** di bubble — ini cara paling dekat untuk menguji DOM.
Kalau setelah unduh bisa diklik, berarti alur document-HTML berjalan di client kamu.
