# WATER AI CLOUD — Railway production image
# yt-dlp resmi memakai Python 3 saat dijalankan; Bookworm sengaja dipakai
# agar runtime downloader sama dengan lingkungan deployment yang diminta.
FROM node:22-bookworm-slim AS base

ARG YTDLP_VERSION=2026.08.19
ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHONUNBUFFERED=1
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    libmagickwand-dev \
    libmagickcore-dev \
    libvips-dev \
    libjpeg-dev \
    libpng-dev \
    libwebp-dev \
    libgif-dev \
    libtiff-dev \
    libheif-dev \
    libavif-dev \
    librsvg2-dev \
    python3 \
    python3-pip \
    git \
    curl \
    wget \
    unzip \
    zip \
    jq \
    build-essential \
    pkg-config \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && wget -q "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" -O /usr/local/bin/yt-dlp \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --version \
    && python3 --version \
    && ffmpeg -version | head -1

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev --no-audit --no-fund || npm install --include=dev --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://dummy:dummy@127.0.0.1:5432/dummy
RUN npm run build

FROM base AS run
COPY --from=build /app ./
RUN mkdir -p /app/data/bots /app/data/tmp \
    && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["sh", "scripts/start.sh"]
