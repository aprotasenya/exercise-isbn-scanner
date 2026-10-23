# ISBN Reader

Minimal local page: enter an ISBN, see book info, rating, and other books by the author (via the Open Library API, no key needed).

If Open Library doesn't know an ISBN (common for Ukrainian books), the page shows search links for it on Ereadian.

## Run
ES modules don't load over `file://`, so use a static server:

    python3 -m http.server 8000

Then open http://localhost:8000.

## Test

    npm test
