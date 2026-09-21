# CHESS3 V59 — Interactive/Rich HTML Fix

## Fixed
- Rebuilt the CHESS3 game interaction layer so menu, VS Computer, Two Player, Settings, Help, Statistics, About, restart, undo and menu buttons use explicit event listeners.
- Fixed the chess state bug where legal move generation referenced `S.castling` while the state previously stored the value under a different property. This could stop moves/AI after the first interaction.
- VS Computer now has separate Easy, Normal and Hard behavior. Hard uses a lightweight alpha-beta minimax search suitable for mobile WebView use.
- Two Player mode is fully local and turn-based.
- Added real promotion selection (Queen/Rook/Bishop/Knight) instead of silently forcing a queen.
- Preserved legal move validation, check, checkmate, stalemate, castling, en-passant, timer, move history and undo.
- Undo in VS Computer returns the game to the human's previous turn by undoing the appropriate two plies when possible.
- Music unlock is attempted from the first user gesture and when game/menu controls are tapped.
- Removed `crossorigin="anonymous"` from the remote MP3 element so a normal cross-origin audio request is used instead of requiring CORS headers from the audio host.
- The remote music URL remains `https://files.catbox.moe/j8dvrp.mp3`.
- `public/CHESS3.html` is kept identical to the root `CHESS3.html`.

## Validation
- Embedded JavaScript passes `node --check`.
- No `CHESS2` marker remains in CHESS3.html.
- The supplied music URL is present.
- Both root and public copies are synchronized.

## Autoplay note
The HTML requests autoplay and retries playback on user interaction. A WhatsApp/Rich HTML WebView can still impose its own autoplay policy, so the first tap may be required before remote music starts.
