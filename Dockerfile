# WATER AI CLOUD — production image
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS run
COPY --from=build /app ./
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
