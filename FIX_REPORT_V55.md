# WATER AI CLOUD V4.1 — CHESS2 BLACK-SCREEN + TTT SPEED FIX

## CHESS2 media HTML
- Replaced the previous oversized/fragile rich-HTML chess renderer with a compact self-contained renderer based on the supplied 3D chess layout.
- Keeps playable chess in the WhatsApp Rich HTML bubble.
- Includes Easy / Normal / Hard bot difficulty directly inside the media.
- Keeps legal move validation, check/checkmate detection, promotion, undo, flip and hint.
- Reduced HTML/script size to make Rich HTML sanitization/rendering more reliable.
- `.chess2` default AI path continues to call `buildChessHtml()` as the primary media.

## TTT media HTML
- Kept the supplied 3D TTT design.
- Reduced the bot wait from 320ms to 10ms.
- Added immediate win/block tactical checks before minimax so obvious responses happen immediately.
- Bot remains playable against the computer.

## Validation
- `src/server/games/html-board.ts` parses successfully with TypeScript compiler when checked standalone.
- Generated Chess and TTT inline scripts pass `node --check`.
