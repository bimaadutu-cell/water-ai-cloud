# WATER AI CLOUD V3.9 — CHESS2 Difficulty Update

## Updated
- CHESS2 rich HTML now has three bot difficulty buttons: EASY, NORMAL, HARD.
- EASY: random legal move, fastest response.
- NORMAL: tactical/material-aware one-ply selection.
- HARD: compact two-ply search with check/checkmate awareness.
- Difficulty can be changed directly inside the HTML game without leaving the media bubble.
- `.chess2 easy`, `.chess2 normal`, and `.chess2 hard` now start a new game with the selected default difficulty.
- Rich HTML remains the primary media; existing fallback behavior is preserved if the client cannot render Rich HTML.
- Standalone CHESS2_UPGRADED.html updated with the same difficulty selector and bot logic.

## Validation
- Standalone CHESS2 JavaScript passes `node --check`.
- `html-board.ts` passes isolated TypeScript syntax/type parsing.
- Full project typecheck cannot be completed in this environment because project dependencies/node_modules are not installed; dependency-resolution errors are environmental.
