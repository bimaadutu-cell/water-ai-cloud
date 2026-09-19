#!/bin/sh
# WATER AI CLOUD V3.6 — production start
# 1) Schema migration + seed (idempotent)
# 2) Next.js production server
set -e

echo "════════════════════════════════════════════"
echo " WATER AI CLOUD V3.6 — startup"
echo "════════════════════════════════════════════"

command -v python3 >/dev/null 2>&1 || { echo "[start] ERROR: python3 tidak tersedia" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "[start] ERROR: ffmpeg tidak tersedia" >&2; exit 1; }
YTDLP_BIN="${YTDLP_PATH:-/usr/local/bin/yt-dlp}"
[ -x "$YTDLP_BIN" ] || YTDLP_BIN="$(command -v yt-dlp || true)"
[ -n "$YTDLP_BIN" ] || { echo "[start] ERROR: yt-dlp tidak tersedia" >&2; exit 1; }
echo "[start] python3=$(python3 --version 2>&1)"
echo "[start] ffmpeg=$(ffmpeg -version 2>&1 | head -1)"
echo "[start] yt-dlp=$($YTDLP_BIN --version 2>&1)"

if [ -z "$DATABASE_URL" ]; then
  echo "[start] ERROR: DATABASE_URL tidak di-set di Railway Variables" >&2
  exit 1
fi

echo "[start] Running DB migrate + seed..."
if node scripts/migrate.mjs; then
  echo "[start] migrate OK"
else
  echo "[start] WARNING: migrate gagal — lanjut start (cek log Railway)" >&2
fi

echo "[start] Launching Next.js on port ${PORT:-3000}..."
exec npm start
