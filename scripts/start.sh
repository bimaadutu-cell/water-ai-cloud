#!/bin/sh
# WATER AI CLOUD — production start script.
# 1) Self-healing schema migration + seed (idempotent, runs every boot)
# 2) Start the Next.js production server
set -e

echo "════════════════════════════════════════════"
echo " WATER AI CLOUD — startup"
echo "════════════════════════════════════════════"

# Fail early instead of returning an opaque WhatsApp downloader error.
command -v python3 >/dev/null 2>&1 || { echo "[start] ERROR: python3 tidak tersedia" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "[start] ERROR: ffmpeg tidak tersedia" >&2; exit 1; }
YTDLP_BIN="${YTDLP_PATH:-/usr/local/bin/yt-dlp}"
[ -x "$YTDLP_BIN" ] || YTDLP_BIN="$(command -v yt-dlp || true)"
[ -n "$YTDLP_BIN" ] || { echo "[start] ERROR: yt-dlp tidak tersedia" >&2; exit 1; }
echo "[start] python3=$(python3 --version 2>&1)"
echo "[start] ffmpeg=$(ffmpeg -version 2>&1 | head -1)"
echo "[start] yt-dlp=$($YTDLP_BIN --version 2>&1)"

echo "[start] Launching Next.js on port ${PORT:-3000}..."
exec npm start
