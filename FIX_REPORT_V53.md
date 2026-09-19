# V53 — Fix black screen `.chess2` / `.ttt` + update Server 4 URL

## Root cause (black screen)
`.chess2` dan `.ttt` (tanpa argumen / undangan / accept) HANYA mengirim
"rich-HTML" card lewat `sendRichHtmlToChat` (fitur non-resmi dari fork
Baileys, meniru bubble GenAI). Fitur ini **tidak didukung** oleh client
WhatsApp pada umumnya, sehingga bubble yang muncul cuma kotak hitam kosong
("Diteruskan" + kotak hitam) — persis seperti di screenshot kamu.

Kode gambar papan (`chessBoardImage` / `renderChessBoard`,
`tttBoardImage` / `renderTttBoard`, keduanya via `sharp`) sudah ada dan
sudah dipakai di setiap langkah SETELAH game jalan — tapi khusus di titik
awal (`.chess2` baru, `.chess2 undang`, `.chess2 terima`, dan **semua**
balasan `.ttt` lewat `tttResponse`) gambar papannya tidak pernah dipanggil.

## Fix
- `chess2()` — new game, invite (`undang`), accept (`terima`): kirim
  **gambar papan PNG** sebagai media utama; rich-HTML tetap dicoba
  best-effort di background (tidak lagi memblokir/menggantikan balasan).
- `tttResponse()` — dipakai oleh SEMUA balasan `.ttt` (baru, invite,
  terima, gerak, hint, dst): sekarang selalu melampirkan gambar papan
  (`tttBoardImage`) sebagai media utama, dengan fallback teks bila render
  gambar gagal. Rich-HTML tetap dicoba di background saja.
- Files: `src/server/commands/info.ts`

## Server 4 URL
Diganti di semua tempat:
- `src/server/commands/core.ts` (teks promo `.info`/broadcast)
- `src/server/games/html-board.ts` (daftar `SERVERS` di menu game hub)

Dari: `https://water-ai-cloud-server4.up.railway.app/`
Ke: `https://water-ai-cloud-server4neww.up.railway.app/`

## Cara tes
1. Deploy ulang / restart bot
2. `.chess2` → harus langsung muncul **gambar papan catur** (bukan kotak hitam)
3. `.ttt` → harus langsung muncul **gambar papan 3x3** (bukan kotak hitam)
4. `.chess2 undang 08xxx` / `.ttt undang 08xxx` → lawan menerima gambar papan
5. Cek menu game hub / `.info` — link Server 4 sudah pakai domain baru
