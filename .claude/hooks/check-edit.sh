#!/bin/bash
# PostToolUse hook (Edit|Write): syntax-check and test after JS edits under src/ or test/.
# Exit 2 sends stderr back to Claude; on success a systemMessage shows the user it ran.
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_response.filePath // .tool_input.file_path // empty')
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

case "$file" in
  "$root"/src/*.js | "$root"/test/*.js) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
rel="${file#"$root"/}"
cd "$root" || exit 0

if ! out=$(node --check "$file" 2>&1); then
  printf 'node --check failed for %s:\n%s\n' "$rel" "$out" >&2
  exit 2
fi

if ! out=$(npm test --silent 2>&1); then
  printf 'npm test failed after editing %s:\n' "$rel" >&2
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi

count=$(printf '%s\n' "$out" | grep -E '^ℹ pass' | grep -oE '[0-9]+')
jq -n --arg m "✓ $rel: syntax OK, ${count:-?} tests passed" '{systemMessage: $m}'
