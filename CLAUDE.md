# ISBN Reader

Minimal local web page: enter or scan (camera) an ISBN, see book info, rating and other books by the author. Vanilla JS ES modules, no build step, no backend.

## Commands
- Run: `python3 -m http.server 8000`, then open http://localhost:8000 (ES modules don't load over `file://`)
- Test: `npm test` (Node's built-in `node:test`, no network; `fetch` is mocked)
- Tests and browser checks that need several ISBNs use `test/fixtures/isbns.json` (verified list: found, not found, invalid); add new ones there instead of inventing them
- Verify UI changes in a real browser with `/verify-app` (needs the Playwright MCP from `.mcp.json`)
- Hook (`.claude/settings.json`): after edits to JS in `src/` or `test/`, `node --check` and `npm test` run automatically; a failure is reported back (exit code 2)

Ideas that are not in the current work go to `BACKLOG.md`.

## Constraints
- Data comes only from Open Library (no API key). Google Books was dropped: anonymous quota exhausted and frequent 503s/empty results. Don't reintroduce it, or any key/`config.js`.
- Ukrainian-store sites (Yakaboo, Rozetka) block scripts and browser requests (403, no CORS), so don't scrape them. Books Open Library lacks still get a card (title `ISBN <isbn>`, so they can be marked) with a plain search link (`src/storeLinks.js`, currently Ereadian). Ereadian's data cannot be read from the page (no CORS headers, `robots.txt` disallows its search), so no names or covers come from there; the user can type a name for an unknown book instead.
- Render API data only via `textContent`, never `innerHTML`.
- Keep it minimal: no frameworks, bundlers or npm dependencies. The one exception is the vendored `@zxing/browser` for barcode scanning (`vendor/`, see its README), loaded lazily only when Scan is pressed.
- State lives in the URL and in `localStorage`: `#isbn=<isbn>` deep-links a search (Back/Forward re-run it), `isbn-reader.recent` holds the last 10 looked-up books (not-found ones too, so they can be named later), `isbn-reader.marked` the "Marked" list (a shopping companion: "Mark" on a card, or "Auto-mark" for scanned books; "Keep scanning" needs Auto-mark), `isbn-reader.automark` the Auto-mark setting, `isbn-reader.names` names the user typed for books Open Library lacks (field on the unknown card), `isbn-reader.theme` holds a light/dark override (absent = follow the device, via the theme button). Storage can be blocked, full or corrupt: reading it must never throw or stop the page from rendering, and a superseded search (Back/Forward while loading) must not draw its result.
- The camera must never start automatically, and the manual ISBN field must keep working when the camera is denied or unavailable. Camera access needs `localhost` or https.
