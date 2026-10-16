#!/usr/bin/env bash
# Stop hook: run the monorepo typecheck and block the stop with the failures
# when it is red, so a phase never ends with a broken build.
set -uo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f pnpm-lock.yaml ] || exit 0
[ -d node_modules ] || exit 0

input="$(cat)"
# Avoid an infinite loop: when this hook already blocked once, let the stop through.
if printf '%s' "$input" | grep -q '"stop_hook_active":true'; then
  exit 0
fi

output="$(pnpm -s typecheck 2>&1)"
status=$?
if [ "$status" -ne 0 ]; then
  echo "pnpm typecheck failed:" >&2
  echo "$output" | tail -n 40 >&2
  exit 2
fi
exit 0
