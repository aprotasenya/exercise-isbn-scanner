# ISBN Reader

[![Test](https://github.com/oleprota/isbn-scanner/actions/workflows/test.yml/badge.svg)](https://github.com/oleprota/isbn-scanner/actions/workflows/test.yml)

Live: https://oleprota.github.io/isbn-scanner/ (https, so the camera works on a phone)

The interface is in Ukrainian. Minimal page: enter or scan an ISBN and get a card with two buttons (the site icons) that look the book up on Ereadian and Goodreads. A book is shown as `ISBN <number>` unless you name it (tap the title on its card) or the optional lookup service finds its name and cover on Goodreads (see `worker/README.md`; the app works fully without it).

Every ISBN you search or scan goes into the **Шукане** ("Scanned") list. Press the ☆ on a card or in that list to put a book into the **Вибране** ("Marked") list (a shopping companion); each list holds up to 1000 books and can be copied as text. A full list refuses new books and says so: clear it (or unmark some) to add more. Both lists, typed names and settings are kept in your browser (`localStorage`).

Press **Scan** to read the ISBN from a book's barcode with the camera (needs camera permission and `localhost` or https); tap it to scan one book, or hold it for a moment (it fills with red) to keep the camera on for several books until you press Stop. A beep and a flash confirm each read (amber for a new book, blue for one already scanned). Typing the ISBN always works too.

**Usage counts.** The app sends anonymous usage counts to the same lookup service (`POST /event`, kept in a small D1 database, see `worker/README.md`): which browser and device kind, whether the camera worked and how long a scan took, how the lookup answered, which features were used. Never an ISBN, title or name. Your browser gets a random id (shown at the bottom of the page) to count returning visitors; nothing else identifies you. A browser that sends Do Not Track sends nothing. The developer's own use is flagged by opening the page once with `#dev` (`#nodev` undoes it), so it can be left out of the counts.

## Run
ES modules don't load over `file://`, so use a static server:

    node scripts/serve.mjs

Then open http://localhost:8000. (`python3 -m http.server 8000` also works, but it resets connections when the page loads its modules at once.)

## Test

    npm test
