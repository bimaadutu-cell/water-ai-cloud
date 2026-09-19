# V18 — Major Interactive & Stability Upgrade

## AI endpoint (fix continuous reject)
- Default Gemini model: `gemini-2.0-flash` (was invalid `gemini-2.5-flash-lite`)
- Multi-model fallback chain: 2.0-flash → 2.0-flash-lite → 1.5-flash → 1.5-pro → gemini-pro
- Nested loop: try every model × every base URL (OpenAI-compat + native generateContent)
- Clearer error messages when all endpoints fail

## .smeme
- Text no longer tilted: upright Impact-style, proper baseline, no skew
- Video path now outputs **animated WebP sticker** (not MP4 video)
- Max 6s square sticker for WhatsApp compatibility

## .tictactoe / .ttt / .tictac (NEW)
- Interactive board image (dark premium UI like screenshot)
- Play vs smart AI (win/block/center/corners)
- Score tracking: Menang / Kalah / Seri
- Buttons: Main Ulang · Hint · Menyerah
- Moves: `.tictactoe 1` … `.tictactoe 9` or button actions

## Instagram / downloader
- **All videos** re-encoded to H.264 + AAC MP4 via ffmpeg (fixes corrupt/green frames)
- Non-JPEG images normalized to JPEG for WA compatibility

## Menu styles 1–5 (redesigned)
1. Glass Soft (premium transparent)
2. Neon Minimal
3. Card Clean
4. Elite Border
5. Aurora Soft

## Website
- Soft white radial wash over dark base
- Enhanced `neon-white` theme (cards, text, glass)
- New **TypeWriter** hero phrases animation

## Chess2
- Existing interactive board + buttons retained
- TTT button routing added alongside CHESS_/WATER_ handlers
