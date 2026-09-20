# CHESS2 Black Screen Fix — 2026-09-20

Root cause found in `src/server/games/html-board.ts` inside `buildChessHtml()`.

The generated Chess2 HTML contains the buttons:
- `restart`
- `undo`
- `flip`
- `hint`
- `popupOk`

but the initialization code also tried to execute:

`document.getElementById("new").onclick=restart`

There is no element with id `new`. That throws a TypeError during initialization. The invalid handler assignment was removed. The existing `restart` button is now wired directly.

The Chess2 renderer still sends a Rich HTML media bubble through the same `sendRichHtmlToChat()` path used by TTT, and the Chess2 HTML remains self-contained. EASY/NORMAL/HARD and VS COMPUTER remain enabled.

Embedded Chess2 JavaScript syntax was checked with Node.js after the fix.
