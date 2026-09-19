# WATER AI CLOUD V23 — Premium TTT + Multiplayer Invite + In-Chat Media

## Penting soal content:// URI
`content://com.whatsapp.provider.media/item/...` adalah **URI lokal Android** di HP pengguna.
Bot server **tidak bisa** mengambil atau mengirim ulang media dari URI itu.
Game di bubble chat memakai **gambar PNG premium** (Sharp/SVG) + **tombol/list native WhatsApp** — sama seperti UI di foto referensi, tanpa buka browser.

## Tic-Tac-Toe
- Kartu papan premium (dark glass, badge mode, highlight menang)
- Default `.ttt` / `.tictactoe` / `.tictac` → kirim papan di bubble + list 9 kotak
- Mode **VS AI** (minimax) dan **Multiplayer**
- Undang teman di grup:
  - `.ttt undang @628xxx` atau `.ttt undang 628xxx`
  - Teman: `.ttt terima` / tombol Terima
  - Tolak: `.ttt tolak`
- Main lewat *Pilih Kotak* — real-time di chat

## Chess2
- Tetap papan gambar + tombol di bubble
- Multiplayer grup: `.chess2 undang @628xxx` → `.chess2 terima`
- HTML hanya opsional (`.chess2 html`)

## File
- `src/server/interactive/render/tttBoard.ts` (baru)
- `src/server/commands/info.ts` (TTT rewrite + chess invite)
- `src/server/engine.ts` (map tombol TTT_ACCEPT/REJECT/AI/PVP)
- `src/server/commands/registry.ts`
- `FIX_REPORT_V23.md`
