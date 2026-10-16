#!/bin/sh
# API container start. Migrations and the seed ran in the `migrate` service already;
# embedding sync is added in Phase 11.
set -eu

echo "[entrypoint] starting api"
exec node dist/src/server.js
