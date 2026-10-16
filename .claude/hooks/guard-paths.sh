#!/usr/bin/env bash
# PreToolUse guard for Edit|Write: refuse writes to real .env files (they hold the
# provider keys; edit .env.example instead). Exit 2 blocks the tool call and shows the
# message to Claude.
set -euo pipefail

input="$(cat)"
file_path="$(printf '%s' "$input" | node -e '
  let data = "";
  process.stdin.on("data", c => (data += c));
  process.stdin.on("end", () => {
    try {
      const json = JSON.parse(data);
      process.stdout.write(String((json.tool_input && json.tool_input.file_path) || ""));
    } catch {
      process.stdout.write("");
    }
  });
')"

[ -z "$file_path" ] && exit 0

base="$(basename "$file_path")"
case "$base" in
  .env|.env.local|.env.development|.env.production|.env.test)
    echo "Blocked: $file_path is a real env file; edit .env.example instead." >&2
    exit 2
    ;;
esac

exit 0
