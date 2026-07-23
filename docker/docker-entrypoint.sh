#!/bin/sh
set -e

echo "[entrypoint] Syncing database schema (prisma db push)..."
npx --no-install prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] Starting server..."
exec "$@"
