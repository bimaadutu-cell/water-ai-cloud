# WATER AI CLOUD — production image
# Self-healing: on every boot scripts/start.sh runs schema migration + seed,
# so a stale/empty Railway Postgres recovers automatically.

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json* ./
# npm ci needs package-lock.json; fall back to npm install if the lockfile
# is missing from the repo.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS run
COPY --from=build /app ./
RUN mkdir -p /app/data/bots /app/data/tmp && chown -R node:node /app/data
USER node
EXPOSE 3000
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["sh", "scripts/start.sh"]
