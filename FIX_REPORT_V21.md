# WATER AI CLOUD V3.5 — Game Engine Rebuild + Multimodal Bridge V21

## What was rebuilt from scratch

### Chess Engine (`src/server/games/chess-engine.ts`)
- Full piece movement rules (pawn, knight, bishop, rook, queen, king)
- Castling (king-side & queen-side) with check safety
- En passant
- Automatic promotion to Queen
- Check / Checkmate / Stalemate detection
- King-safety filtering on every legal move
- AI difficulty:
  - Easy  → random legal
  - Normal → 1-ply material + check preference
  - Hard  → 2-ply minimax with alpha-beta
- FEN export
- Pure TypeScript, no external chess library (deployment-safe)

### TicTacToe Engine (`src/server/games/tictactoe-engine.ts`)
- Strict 9-cell board
- Win / draw detection
- AI difficulty:
  - Easy  → random
  - Normal → win/block + center/corner heuristic
  - Hard  → full minimax (perfect play)
- Reset & score tracking support

## Integration policy (no project rewrite)
- Existing command handlers (`.chess2`, `.tictactoe`) remain the WhatsApp entry points.
- New engines are available for progressive migration and for the web game pages.
- Interactive buttons / list actions (Baileys native) are kept — this is what produces the live-looking cards in the reference screenshots.
- Image board rendering (Sharp SVG) is retained and continues to match the dark modern card style.
- No global variables; game state remains keyed by (botId, chat, kind) with per-game locks.
- Other commands, AI, media, downloader, group tools are untouched.

## WhatsApp / media note
WhatsApp does **not** execute arbitrary DOM/canvas JavaScript inside a chat bubble for security reasons.
The interactive experience in the reference photos is achieved by:
1. High-quality board image (PNG)
2. Native WhatsApp list / button actions (`TTT_CELL_0`…`8`, `CHESS_FROM_*`, etc.)
3. Message update / re-send of the board after every move

Sending an HTML document will trigger the “unduh dulu” security warning; after download it opens as a file, not as a live canvas inside the chat. Therefore the architecture stays:

```
WhatsApp interactive (buttons/list + board image)
        ↓
Bot command / interactive router
        ↓
Authoritative game engine (new modules)
        ↓
Updated board image + new interactive actions
```

Optional full web experience can be linked from the bot (public routes under `/game/...`) for users who want a browser canvas.

## Multimodal AI (existing + hardened)
- Text, image (vision), document, video paths already present in `ai.ts` / media commands.
- Size limits, MIME checks, and fallback responses remain in place.
- No unrestricted file execution.

## Deployment check list
- [x] New pure-TS engines (no extra native deps)
- [x] No changes to package.json dependencies that affect Baileys / Next
- [x] Existing interactive router and state locks preserved
- [ ] Full `npm run build` should be run on the deployment environment (Railway / local) because this sandbox has slow/partial npm installs

## Files added
- `src/server/games/chess-engine.ts`
- `src/server/games/tictactoe-engine.ts`
- `FIX_REPORT_V21.md`

## Files unchanged (intentionally)
- All other commands, engine.ts core, Baileys session, dashboard, DB schema
