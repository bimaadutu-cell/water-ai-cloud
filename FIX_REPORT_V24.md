# V24 — Live board di bubble TANPA tombol interaktif

## Perubahan
- Tic-Tac-Toe default: **hanya media gambar papan + caption** (tidak kirim buttons/list)
- Setiap langkah (`.ttt 1`…`9`) bot kirim ulang papan terbaru → terasa **live di bubble**
- Multiplayer undang/terima/tolak tetap teks + gambar undangan (tanpa tombol)
- Tidak memakai content:// URI
- Tidak membuka browser / unduh HTML sebagai alur utama

## Cara main
```
.ttt              → papan muncul di bubble
.ttt 5            → taruh di kotak 5, papan update live
.ttt undang @62…  → undang di grup
.ttt terima       → gabung
.chess2           → papan catur di bubble
.chess2 e2e4      → gerak, papan update
```

## Batasan WhatsApp
WhatsApp tidak menjalankan canvas/DOM interaktif di bubble.
"Live action" = setiap move mengirim **gambar papan baru** di chat (media nyata).
