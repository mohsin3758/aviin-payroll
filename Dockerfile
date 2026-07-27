# syntax=docker/dockerfile:1

# ---------- deps: install once, reused by builder for fast rebuilds ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder: generate prisma client + next build ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- runner: minimal runtime image ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Overridden by docker-compose / -e for a real deployment; this default is dev-only.
ENV JWT_SECRET=dev-only-insecure-secret-change-me
ENV DATABASE_URL=file:/app/db/custom.db
ENV UPLOADS_DIR=/app/uploads

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output (server.js + traced node_modules + merged static/public, per package.json's build script)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/prisma ./prisma
# Full node_modules (not just @prisma/prisma/.prisma) — the standalone trace only captures
# @prisma/client's own runtime import, but the `prisma` CLI (needed by docker-entrypoint.sh to
# run `db push` on container start) pulls in its own dependency tree (e.g. @prisma/config -> effect)
# that isn't traced. Cherry-picking specific subfolders was fragile and broke at runtime; copying
# the whole builder node_modules is the reliable fix, at the cost of a larger image.
COPY --from=builder /app/node_modules ./node_modules

COPY docker/healthcheck.js ./healthcheck.js
COPY docker/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/db /app/uploads \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node healthcheck.js || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
