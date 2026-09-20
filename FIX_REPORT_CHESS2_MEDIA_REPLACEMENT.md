# CHESS2 Media HTML Replacement

- Replaced `buildChessHtml()` with the supplied BimzOfficial chess layout as the base renderer.
- Kept Easy / Normal / Hard selectors inside the HTML media.
- Kept Player vs Computer mode, legal chess moves, check/checkmate, promotion, Undo, Restart, Flip and Hint.
- Added 64 server-rendered initial board cells before the inline script runs. This prevents an empty/black card when the client delays JavaScript execution.
- Kept the HTML self-contained: no external CSS, JS, images, fonts, or network fetches.
- Updated `CHESS2_UPGRADED.html` with the generated standalone media HTML.
- Preserved the previous engine compile fix in `src/server/engine.ts` so the stray `bot`/`n` references in `recordOut()` are not reintroduced.

Validation performed in this environment:
- Generated CHESS2 HTML successfully.
- Generated HTML contains 64 initial chess cells.
- Inline CHESS2 JavaScript passes `node --check`.

Note: whether an inline interactive HTML card is actually executable inside WhatsApp still depends on the Rich HTML capability of the installed Baileys fork/client. The project keeps the existing PNG fallback if the Rich HTML send method is rejected.
