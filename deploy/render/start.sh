#!/bin/sh
# Render sets RENDER_EXTERNAL_URL to the service's public address; the API accepts
# browser writes only from allowed origins, so that address is the default origin.
set -eu

export CORS_ORIGINS="${CORS_ORIGINS:-${RENDER_EXTERNAL_URL:-}}"

if node migrations-up-to-date.mjs; then
  echo "[start] migrations up to date"
else
  echo "[start] prisma migrate deploy"
  ./node_modules/.bin/prisma migrate deploy
fi

echo "[start] seed (${SEED_ON_START:-always})"
node dist/prisma/seed.js "${SEED_ON_START:-always}"

echo "[start] api and web on port ${PORT:-4000}"
exec node dist/src/server.js
