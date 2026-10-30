#!/bin/bash
# Stop hook: when the turn changed app files, ask Claude to run the matching verify-* skills.
# Blocks the stop once per distinct diff (stop_hook_active + a stamp in .git), never in a loop.
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = true ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Changed vs HEAD (staged + unstaged) plus untracked files.
files=$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u)
[ -n "$files" ] || exit 0

skills=""
add() { case " $skills " in *" $1 "*) ;; *) skills="$skills $1" ;; esac; }
while IFS= read -r f; do
  # strings.js: texts only raise nothing; a change to applyStrings (static texts) only.
  [ "$f" = src/strings.js ] && git diff -U0 HEAD -- src/strings.js | grep -q applyStrings && add verify-strings
  case "$f" in
    *.md | docs/* | test/* | .claude/* | src/bench.js | src/text.js | src/strings.js | package*.json) ;;
    style.css | src/theme.js | src/hash.js | src/bookTitles.js | src/details.js | src/links.js | src/dom.js) add verify-card ;;
    src/bookList.js | src/listView.js | src/storage.js | src/sort.js | src/keyed.js) add verify-lists ;;
    src/scanner.js | src/scanSession.js | src/isbn.js | vendor/*) add verify-scan ;;
    src/lookup.js | worker/*) add verify-lookup ;;
    src/stats.js) add verify-stats ;;
    src/app.js | src/* | icons/*) add verify-card; add verify-lists ;;
  esac
done <<< "$files"
[ -n "$skills" ] || exit 0

# Same diff already hinted: stay quiet.
stamp="$(git rev-parse --git-dir)/verify-hint-stamp"
sum=$( { printf '%s\n' "$skills"; git diff HEAD; git ls-files --others --exclude-standard | xargs -I{} cat "{}" 2>/dev/null; } | shasum | cut -d' ' -f1)
[ "$(cat "$stamp" 2>/dev/null)" = "$sum" ] && exit 0
printf '%s' "$sum" > "$stamp"

list=$(printf '%s' "$skills" | sed 's/^ //; s/ /, \//g; s/^/\//')
jq -n --arg r "App files changed. Run the matching browser verification before finishing: $list (see .claude/skills/). Report failures; do not fix them unasked." '{decision: "block", reason: $r}'
