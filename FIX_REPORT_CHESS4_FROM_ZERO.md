# CHESS4 — FULL INTERACTIVE HTML REBUILD

## Root cause addressed
The previous card could render the HTML visually while its JavaScript controls were inert. The sender was reducing the document to a fragment before sending it. CHESS4 now sends the complete HTML document to the Rich HTML renderer, which is the documented interactive HTML form for the installed Baileys fork.

## CHESS4 changes
- New command: `.chess4`.
- New source files: `CHESS4.html` and `public/CHESS4.html`.
- Existing `.chess3` remains for compatibility.
- VS COMPUTER: Easy / Normal / Hard.
- Human color selection: White / Black.
- TWO PLAYER mode.
- Legal chess movement, check, checkmate, stalemate.
- Castling.
- En passant.
- Pawn promotion: queen, rook, bishop, knight.
- Undo.
- Restart.
- Menu navigation.
- Settings: music, sound effects, move history, coordinates, timer.
- Statistics persisted with localStorage.
- Help and About screens.
- Responsive board for mobile.
- Background music URL retained: https://files.catbox.moe/j8dvrp.mp3
- Audio is requested on load and retried after user interaction to comply with mobile autoplay restrictions.
- Modal promotion can be closed by tapping outside or Escape.
- Runtime JS errors are surfaced in the card instead of silently killing the UI.

## Rich HTML transport fix
`src/server/games/send-rich-html.ts` now sends the **full HTML document** first through `sock.sendRichHtml(...)`, then tries the documented raw-string overload and compatible fallbacks. `APP_URL` is supplied as the trusted/base URL when available, and the audio host is trusted.

## Validation
- CHESS4 embedded JavaScript passes `node --check`.
- All visible button/select IDs have corresponding handlers in the embedded script.
- `CHESS2` does not occur in CHESS4.
- Audio URL occurs in CHESS4.
- Full TypeScript project validation could not be completed because dependency installation timed out in the build environment; no claim of a successful full production build is made here.
