#!/bin/sh
# One-shot container (compose service `migrate`): apply migrations, then seed per
# SEED_ON_START (always | if-empty | never). The api service starts only after this exits 0.
set -eu

echo "[migrate] prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

echo "[migrate] seed (${SEED_ON_START:-if-empty})"
node dist/prisma/seed.js "${SEED_ON_START:-if-empty}"
