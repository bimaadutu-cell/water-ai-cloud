# V51 — Build fix (html-board syntax)

## Cause
Duplicate orphaned `TermuxHtml(...)` function without `export function build` prefix caused Turbopack parse error at line ~1981.

## Fix
- Removed orphaned duplicate TermuxHtml block
- Kept valid `export function buildTermuxHtml` (with keyboard)
- Verified exports: Chess, TTT, Termux, BlockBlast, Ludo
- Brace balance OK

## Still included (V50)
- Chess/TTT: HTML-only (no PNG)
- Static board cells in HTML (visible without JS)
- Termux on-screen keyboard
- Block Blast + Ludo
- Invite flows: .chess2 undang, .ttt undang, .ludo undang
