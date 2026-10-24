# ISBN Reader

Minimal web page: enter or scan (camera) an ISBN, get a card with links to look it up on Ereadian and Goodreads. Every ISBN lands in a "Scanned" list, and the ones the user stars go to a "Marked" list (a shopping companion). No book data is fetched from anywhere. Vanilla JS ES modules, no build step, no backend.

## Commands
- Run: `python3 -m http.server 8000`, then open http://localhost:8000 (ES modules don't load over `file://`)
- Test: `npm test` (Node's built-in `node:test`, no network)
- Tests and browser checks that need several ISBNs use `test/fixtures/isbns.json` (valid real ISBNs and invalid ones); add new ones there instead of inventing them
- Verify UI changes in a real browser with `/verify-app` (needs the Playwright MCP from `.mcp.json`)
- Hook (`.claude/settings.json`): after edits to JS in `src/` or `test/`, `node --check` and `npm test` run automatically; a failure is reported back (exit code 2)

Ideas that are not in the current work go to `BACKLOG.md`.

## Constraints
- The app talks to no book API: Open Library was dropped on purpose (and Google Books before it), so a book is only its ISBN or the name the user typed. Don't reintroduce a book-data API, a key or `config.js` without being asked.
- Ereadian and Goodreads are link-only (`src/links.js`): their pages can't be read from the browser (no CORS) and Ukrainian stores (Yakaboo, Rozetka) block scripts (403), so don't scrape them. The user can type a name for a book on its card.
- Render user-supplied text (typed names, stored lists) only via `textContent`, never `innerHTML`.
- Keep it minimal: no frameworks, bundlers or npm dependencies. The one exception is the vendored `@zxing/browser` for barcode scanning (`vendor/`, see its README), loaded lazily only when Scan is pressed.
- State lives in the URL and in `localStorage`: `#isbn=<isbn>` deep-links a search (Back/Forward re-run it), `isbn-reader.scanned` holds every searched or scanned book (newest first; it replaced `isbn-reader.recent`, which is copied once on first load), `isbn-reader.marked` the "Marked" list (the ☆ on a card or a Scanned row), `isbn-reader.names` names the user typed for books (field on the card), `isbn-reader.theme` a light/dark override (absent = follow the device, via the theme button). Both lists hold at most 1000 books; a full list refuses new ones (the card is still shown, with a warning between it and the lists) and they share one list view (`src/listView.js`) and one store (`src/bookList.js`). Storage can be blocked, full or corrupt: reading it must never throw or stop the page from rendering.
- The camera must never start automatically, and the manual ISBN field must keep working when the camera is denied or unavailable. Camera access needs `localhost` or https.
