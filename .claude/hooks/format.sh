#!/usr/bin/env bash
# PostToolUse for Edit|Write: format the touched file with Prettier when it is a
# file type Prettier handles. Never fails the tool call.
set -uo pipefail

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
[ -f "$file_path" ] || exit 0

case "$file_path" in
  *.ts|*.tsx|*.js|*.cjs|*.mjs|*.json|*.css|*.md|*.yaml|*.yml)
    if [ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier" ]; then
      "$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier" --log-level warn --write "$file_path" || true
    fi
    ;;
esac

exit 0
