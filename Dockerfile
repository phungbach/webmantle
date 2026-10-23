# syntax=docker/dockerfile:1
# Webmantle: Next.js 15 + SQLite (Prisma). Build: docker build -t webmantle:1.0.0 .
# Run: see docs/deploy-docker.md (docker compose up -d --build).

FROM node:22-bookworm-slim AS base
# OpenSSL is needed by the Prisma engines; ca-certificates by the first `prisma generate` download.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/tmp/build.db \
    SITE_URL=http://localhost:3000 \
    PREVIEW_SECRET=build-only-placeholder-value-not-used-at-runtime-0123456789
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    CMS_DATA_DIR=/app/data \
    DATABASE_URL=file:/app/data/cms.db
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "start", "--", "-H", "0.0.0.0"]
