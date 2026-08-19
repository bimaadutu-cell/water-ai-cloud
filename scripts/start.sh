#!/bin/sh
# WATER AI CLOUD — production start script.
# 1) Self-healing schema migration + seed (idempotent, runs every boot)
# 2) Start the Next.js production server
set -e

echo "════════════════════════════════════════════"
echo " WATER AI CLOUD — startup"
echo "════════════════════════════════════════════"

node scripts/migrate.mjs

echo "[start] Launching Next.js on port ${PORT:-3000}..."
exec npm start
