# Backlog

Ideas that are not part of the current work. Move an item into the plan when it is next.

## Next up (after the current iteration)
- **"Add this book to Open Library" link** on the not-found screen, next to the Ereadian link, so a missing (e.g. Ukrainian) book can be contributed back. Note: Open Library's add page needs a login and drops an `?isbn=` prefill (it redirects to login, then `/books/add`), so the link only opens the add form.

## Later
- **Live ISBN check script** (e.g. `scripts/check-isbns.mjs`, run on demand and not part of `npm test`): resolve every entry of `test/fixtures/isbns.json` against Open Library and report entries whose result no longer matches (`found` must resolve, `notFoundInOpenLibrary` must not, `invalid` must fail the checksum). The offline tests can't verify those claims; today they rest on a one-off live check and `/verify-app`.
- **Accessible recent chips:** give each chip an `aria-label` like "Matilda, ISBN 9780141365466" (today the ISBN is only in the tooltip), and keep keyboard focus sensible when the chips get disabled during a search.
- **Title and author search** (Open Library `search.json`; Cyrillic queries work), so a book can be found without an ISBN.
- **Ukrainian interface** with an EN/UK toggle (only if not done as the optional last phase of the current iteration).
- **Installable PWA / offline shell** (service worker) for phone use.
- **Shelf sync between devices.** Needs a backend or file export/import, which conflicts with "no backend"; only if the constraint changes.
- **Make "More by…" items clickable** to open that book in the app (needs a work → ISBN lookup).
