# WATER AI CLOUD — production image
# Self-healing: on every boot scripts/start.sh runs schema migration + seed,
# so a stale/empty Railway Postgres recovers automatically.

FROM node:22-alpine AS base
ARG YTDLP_VERSION=2026.08.19
RUN apk add --no-cache ca-certificates ffmpeg wget \
  && wget -q "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" -O /usr/local/bin/yt-dlp \
  && chmod 0755 /usr/local/bin/yt-dlp
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
RUN apk add --no-cache git openssh-client
COPY package.json package-lock.json* ./
# npm ci needs package-lock.json; fall back to npm install if the lockfile
# is missing from the repo.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
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
