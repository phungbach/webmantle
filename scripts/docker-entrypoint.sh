#!/bin/sh
# Container start-up: prepare the data folder, apply database migrations, install or update the built-in
# themes and the first administrator (idempotent), then run the command (npm start).
set -e

: "${CMS_DATA_DIR:=/app/data}"
mkdir -p "$CMS_DATA_DIR"

echo "Applying database migrations..."
npx prisma migrate deploy

if [ "${SKIP_SEED:-false}" != "true" ]; then
  echo "Installing built-in themes and the first administrator (skipped when SKIP_SEED=true)..."
  npx tsx prisma/seed.ts
fi

exec "$@"
