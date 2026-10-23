# ISBN Reader

Minimal local web page: enter or scan (camera) an ISBN, see book info, rating and other books by the author. Vanilla JS ES modules, no build step, no backend.

## Commands
- Run: `python3 -m http.server 8000`, then open http://localhost:8000 (ES modules don't load over `file://`)
- Test: `npm test` (Node's built-in `node:test`, no network; `fetch` is mocked)

## Constraints
- Data comes only from Open Library (no API key). Google Books was dropped: anonymous quota exhausted and frequent 503s/empty results. Don't reintroduce it, or any key/`config.js`.
- Ukrainian-store sites (Yakaboo, Rozetka) block scripts and browser requests (403, no CORS), so don't scrape them. Books Open Library lacks get a plain search link instead (`src/storeLinks.js`, currently Ereadian).
- Render API data only via `textContent`, never `innerHTML`.
- Keep it minimal: no frameworks, bundlers or npm dependencies. The one exception is the vendored `@zxing/browser` for barcode scanning (`vendor/`, see its README), loaded lazily only when Scan is pressed.
- The camera must never start automatically, and the manual ISBN field must keep working when the camera is denied or unavailable. Camera access needs `localhost` or https.
