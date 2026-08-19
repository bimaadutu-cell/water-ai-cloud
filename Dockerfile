# WATER AI CLOUD — production image
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
# Install libc6-compat and build essentials for native dependencies like sharp
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build

FROM base AS run
RUN apk add --no-cache libc6-compat
COPY --from=build /app ./
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
