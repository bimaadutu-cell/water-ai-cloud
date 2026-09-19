# FIX REPORT V37 — Media HTML 9:16 + Chess 3D + TTT Auto AI

## Perubahan

### 1. Papan Catur (image + HTML) → hitam-putih 3D, penuh 9:16
- `src/server/interactive/render/chessBoard.ts`
  - Aspect ratio **9:16** (540×960) supaya penuh di bubble WA
  - Warna klasik **hitam-putih** (`#f0d9b5` / `#b58863`)
  - Efek 3D: highlight edge kotak terang, shadow kotak gelap, drop-shadow bidak
  - Frame bevel papan kayu gelap
- `src/server/games/html-board.ts` → `buildChessHtml`
  - Card `aspect-ratio: 9/16`, full viewport
  - Bidak hitam/putih jelas + text-shadow 3D

### 2. Tic-Tac-Toe (image + HTML) → penuh 9:16
- `src/server/interactive/render/tttBoard.ts`
  - Aspect ratio **9:16** (540×960)
  - Grid terpusat, badge VS AI / MULTIPLAYER, glow X/O
- `src/server/games/html-board.ts` → `buildTttHtml`
  - Card 9:16, minimax AI **realtime** di HTML offline
  - Mode AI default: ketik/buka langsung main vs bot (sama seperti chat `.ttt`)

### 3. Perilaku `.ttt`
- Sudah otomatis start vs bot saat `.ttt` (tanpa argumen) — sama seperti `.chess2`
- HTML offline juga auto AI minimax

## File yang diubah
- `src/server/interactive/render/chessBoard.ts`
- `src/server/interactive/render/tttBoard.ts`
- `src/server/games/html-board.ts`

## Cara tes
1. Deploy ulang / restart bot
2. `.chess2` → papan portrait 9:16, hitam-putih 3D
3. `.ttt` → langsung game vs bot, papan 9:16
4. `.chess2 html` / `.ttt html` → unduh HTML offline interaktif
