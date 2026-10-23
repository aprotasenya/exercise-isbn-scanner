# ISBN Reader

Minimal local page: enter an ISBN, see book info, rating, and other books by the author (via the Open Library API, no key needed).

Press **Mark** on a book card to add it to the **Marked** list (a shopping companion), or tick **Auto-mark** so every scanned book is marked automatically (then **Keep scanning** keeps the camera on for several books). Copy the list or download it as JSON. The list, recent searches and settings are kept in your browser (`localStorage`).

Press **Scan** to read the ISBN from a book's barcode with the camera (needs camera permission and `localhost` or https); typing the ISBN always works too.

If Open Library doesn't know an ISBN (common for Ukrainian books), the page still shows a card for it (so it can be marked) with a search link on Ereadian, and you can type a name for the book on that card.

## Run
ES modules don't load over `file://`, so use a static server:

    python3 -m http.server 8000

Then open http://localhost:8000.

## Test

    npm test
