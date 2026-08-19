# WATER AI CLOUD — production image
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
# Install libc6-compat and build essentials for native dependencies like sharp
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json package-lock.json* ./
# Install ALL dependencies (including devDependencies needed for Tailwind 4 / PostCSS build)
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build

FROM base AS run
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat
# Copy node_modules and built output from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src ./src

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
