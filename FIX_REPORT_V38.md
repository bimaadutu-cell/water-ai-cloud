# WATER AI CLOUD V3.8 — CHESS2 / TTT Rich HTML Fix

Updated:
- `src/server/games/html-board.ts`
  - CHESS2 uses the supplied 3D chess HTML structure as its visual base.
  - Added local VS COMPUTER bot logic for CHESS2.
  - TTT uses the supplied 3D style and now has a local minimax computer opponent.
  - TTT O is brighter for visibility.
- `src/server/games/send-rich-html.ts`
  - Converts complete HTML documents into self-contained Rich HTML fragments.
  - Preserves `<style>` and `<script>` while removing the document envelope.
  - This targets the empty/black Rich HTML bubble caused by sending a full document where a Rich HTML fragment is expected.
- `src/server/commands/info.ts`
  - CHESS2/TTT now make Rich HTML the primary media.
  - If Rich HTML is rejected/unavailable, the existing PNG/button fallback is used.
  - Successful Rich HTML sends are marked `handled` so the bot does not send a second text/image bubble.

Validation:
- `html-board.ts` transpiled successfully with TypeScript.
- Generated CHESS2 and TTT JavaScript passed `node --check`.
- Full repository typecheck could not be completed in this container because project dependencies/node_modules are not installed; the remaining typecheck output is dependency/type-environment related.
