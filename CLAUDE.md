# ISBN Reader

Minimal web page: enter or scan (camera) an ISBN, or type a title, get a card with links to look it up on Ereadian and Goodreads. Every ISBN lands in a "Scanned" list, and the ones the user stars go to a "Marked" list (a shopping companion). The only book data is an optional name and cover from a tiny lookup service (`worker/`, reads Goodreads); without it a book is its ISBN or the name the user typed. Vanilla JS ES modules, no build step.

## Commands
- Run: `python3 -m http.server 8000`, then open http://localhost:8000 (ES modules don't load over `file://`)
- Test: `npm test` (Node's built-in `node:test`, no network; covers `worker/` too)
- Lookup service: `worker/` (Cloudflare Worker, deploy steps in `worker/README.md`); its address goes in `LOOKUP_URL` in `src/lookup.js`, empty = lookup off
- Tests and browser checks that need several ISBNs use `test/fixtures/isbns.json` (valid real ISBNs and invalid ones); add new ones there instead of inventing them
- Verify UI changes in a real browser with `/verify-app` (needs the Playwright MCP from `.mcp.json`)
- Hook (user-level, `~/.claude/hooks/check-edit.sh`, not in the repo): after edits to JS in `src/` or `test/`, `node --check` and `npm test` run automatically; only failed tests are reported back (exit code 2)

Ideas that are not in the current work go to `BACKLOG.md`.

## Constraints
Before changing scanning, lookup or search, site links or usage stats, read the matching ADR in `docs/adr/`. Domain terms are in `GLOSSARY.md`.

- The interface is Ukrainian only (no language toggle): every text is in `src/strings.js`. Keep new texts concise.
- Render user-supplied text (typed names, stored lists) only via `textContent`, never `innerHTML`.
- Keep it minimal: be very frugal about dependencies, frameworks and build tooling. Suggest one only when the gain is clear, and ask before adding it.
- The camera must never start automatically, and the manual ISBN field must keep working when the camera is denied or unavailable.

## Agent skills

### Issue tracker

GitHub Issues on `oleprota/isbn-scanner`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
