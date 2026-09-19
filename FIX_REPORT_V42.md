# WATER AI CLOUD V4.2 — CHESS2 BLACK SCREEN + BOT SPEED FINAL FIX

## CHESS2 media HTML
- Rebuilt the Rich HTML chess renderer in `src/server/games/html-board.ts`.
- The board is now rendered as 64 static buttons in the HTML body before JavaScript runs, so a script/rendering hiccup cannot leave an entirely empty black card.
- Simplified CSS to avoid fragile viewport `min()/calc()` sizing in WhatsApp Rich HTML.
- Kept the supplied 3D visual style and playable chess interaction.
- Added EASY / NORMAL / HARD directly in the media.
- Kept legal moves, check/checkmate, capture highlighting, undo, flip, hint and computer play.
- Bot delay reduced to 8/12/18 ms by difficulty.

## TTT media HTML
- Kept the user's supplied 3D TTT design.
- Removed full-board minimax search from the normal response path.
- Bot now checks immediate win, immediate block, then evaluates candidate cells with a lightweight heuristic.
- Bot delay is 0 ms (`setTimeout(..., 0)`), so the O response is effectively immediate while keeping the UI event loop responsive.

## Validation
- Generated Chess2 JavaScript: `node --check` OK.
- Generated TTT JavaScript: `node --check` OK.
- Project-wide TypeScript dependency checking is not available in the extracted ZIP because `node_modules` is not included; existing missing Next/React/Node typings are environment/dependency errors, not generated-game syntax errors.
