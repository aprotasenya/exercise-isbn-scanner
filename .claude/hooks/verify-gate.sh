#!/bin/bash
# PreToolUse hook (Bash): blocks `git commit` until syntax and unit tests are green and every verify-* skill
# that covers the changed app files has passed on exactly that diff.
# A skill records its pass with `verify-gate.sh stamp <skill>…`. Only when the user says so, prefix the
# commit command with VERIFY_SKIP=1 to skip the gate.
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
dir="$(git rev-parse --git-dir)/verify-stamps"

# Changed vs HEAD (staged + unstaged) plus untracked files.
changed() { { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u; }

# strings.js: the texts sit above `const groups`; lookup() and applyStrings below it are the plumbing.
# True when a changed line is at or below `const groups` (line numbers, not hunk headers).
strings_plumbing_changed() {
  start=$(grep -n '^const groups' src/strings.js | cut -d: -f1)
  [ -n "$start" ] || return 0
  git diff -U0 HEAD -- src/strings.js | awk -v s="$start" '
    /^@@/ { split($3, a, /[+,]/); n = (a[3] == "" ? 1 : a[3]); if ((n ? a[2] + n - 1 : a[2] + 1) >= s) found = 1 }
    END { exit !found }'
}

# The skills that cover file $1. index.html is covered by test/index.test.js, texts by strings.test.js.
skills_for() {
  case "$1" in
    *.md | docs/* | test/* | .claude/* | index.html | src/bench.js | src/text.js | package*.json) ;;
    src/strings.js) strings_plumbing_changed && echo verify-strings ;;
    style.css | src/theme.js | src/hash.js | src/bookTitles.js | src/details.js | src/links.js | src/dom.js) echo verify-card ;;
    src/bookList.js | src/listView.js | src/storage.js | src/sort.js | src/keyed.js) echo verify-lists ;;
    src/scanner.js | src/scanSession.js | src/isbn.js | vendor/*) echo verify-scan ;;
    src/lookup.js | worker/*) echo verify-lookup ;;
    src/stats.js) echo verify-stats ;;
    src/app.js | src/* | icons/*) echo verify-card; echo verify-lists ;;
  esac
}

# Hash of the diff of the files skill $1 covers: a stamp is valid only while that diff is unchanged.
key() {
  changed | while IFS= read -r f; do
    skills_for "$f" | grep -qx "$1" || continue
    git diff HEAD -- "$f"
    [ -n "$(git ls-files --others --exclude-standard -- "$f")" ] && cat "$f"
  done | shasum | cut -d' ' -f1
}

if [ "$1" = stamp ]; then
  shift; mkdir -p "$dir"
  for s in "$@"; do key "$s" > "$dir/$s"; done
  exit 0
fi

cmd=$(jq -r '.tool_input.command // empty')
printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|[[:space:]])git[[:space:]]+commit' || exit 0
case "$cmd" in *VERIFY_SKIP=1*) exit 0 ;; esac

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

# Syntax and unit tests first: they are quick and are my own breakage to fix.
for f in $(changed | grep -E '^(src|test)/.*\.js$'); do
  [ -f "$f" ] && ! out=$(node --check "$f" 2>&1) && deny "Commit blocked: node --check failed for $f:
$out"
done
if [ -f package.json ] && ! out=$(npm test 2>&1); then
  deny "Commit blocked: tests failed:
$(printf '%s' "$out" | grep -E '^(✖|ℹ (pass|fail))' | head -20)"
fi

needed=$(changed | while IFS= read -r f; do skills_for "$f"; done | sort -u)
missing=""
for s in $needed; do
  [ "$(cat "$dir/$s" 2>/dev/null)" = "$(key "$s")" ] || missing="$missing /$s"
done
[ -n "$missing" ] || exit 0
deny "Commit blocked: browser verification has not passed on this diff for:$missing (see .claude/skills/; each skill stamps itself when all its checks pass). Report failures to the user; do not fix them unasked. Skip only if the user says so, with VERIFY_SKIP=1 in front of the commit command."
