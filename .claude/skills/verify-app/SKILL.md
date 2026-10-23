---
name: verify-app
description: Verify the ISBN Reader in a real browser through the Playwright MCP. Use after UI or search changes, or when asked to check, test or verify the running app.
---

# Verify the ISBN Reader in a browser

Run the checks below with the Playwright MCP (`mcp__playwright__*` tools; if they are deferred, load them with ToolSearch) and report pass/fail. Do not edit app code: report failures instead.

## Setup
1. Confirm the Playwright MCP is connected. If not, stop and tell the user to register it (`.mcp.json`) and check `/mcp`.
2. App server on http://localhost:8000: `curl -s http://localhost:8000/ | grep "<title>"` should show `ISBN Reader`. If so, reuse that server and never stop it. If the port is free, start `python3 -m http.server 8000` in the background from the project root and stop it when done. If the port serves something else, stop and report.
3. Save screenshots to `.playwright-mcp/` (gitignored), named `verify-<check>.png`.

## Checks
Use `browser_run_code_unsafe` for anything that needs timing, request counting or page overrides. Assert shape, not exact numbers (ratings and "other books" can change).

1. **Found book.** Search `9780747532699`. Expect a card titled "Harry Potter and the Philosopher's Stone", an author line, a rating line (`★ …`), a "More by J. K. Rowling" list with up to 5 items, and the line "Search this ISBN on Ereadian." whose link is `https://ereadian.com/search?q=9780747532699` (opens in a new tab).
2. **Not found.** Search `9786171299412`. Expect status "Book not found." and the Ereadian link for that ISBN.
3. **Invalid ISBN.** Count Open Library requests with `page.on('request', …)`, then search `1234567890`. Expect status "Please enter a valid ISBN-10 or ISBN-13.", an empty result area, and zero requests to openlibrary.org.
4. **Controls lock during a search.** `page.route('**/openlibrary.org/**', …)` delaying each request ~1.5 s; submit `9780747532699`; after ~300 ms expect `#isbn`, the Search button and `#scan` all disabled and status "Searching…"; after the card appears expect all three enabled. Remove the route afterwards.
5. **Camera denied.** Reload the page. Expect `vendor/zxing-browser.min.js` was not requested on load (the camera and library must not start by themselves). Headless Chromium leaves the permission prompt pending, so simulate a denial before clicking Scan:
   `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))`.
   Click Scan. Expect status "Camera unavailable. Type the ISBN instead." (error style), `#scanner` hidden, the field and Search enabled, the button labelled "Scan", and the field focused.
6. **Console.** Collect console errors across the run (`browser_console_messages`, level error). Only these are expected: 404 for `/favicon.ico`, 404 for `openlibrary.org/isbn/<unknown ISBN>.json`, and the logged `Could not start the scanner: NotAllowedError` from check 5. Anything else is a failure.

Optional (skip when offline): open `https://ereadian.com/search?q=9786171299412` and expect "1 книжка"; a nonsense ISBN such as `9780000000002` should give "0 книжок".

## Report
End with one table: check, result (pass / fail / not run), notes and screenshot path. State plainly what could not run and why. Close the browser (`browser_close`), stop the server only if you started it, and do not commit anything.
