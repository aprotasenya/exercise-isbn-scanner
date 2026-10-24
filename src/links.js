// Where to look a book up by ISBN. Link-only: the pages can't be read from here (no CORS).
// The icons are the sites' own icons, saved in icons/ (see icons/README.md), so nothing is
// fetched from the sites to show them.
export function isbnLinks(isbn) {
  const q = encodeURIComponent(isbn);
  return [
    { name: 'Ereadian', url: `https://ereadian.com/search?q=${q}`, icon: 'icons/ereadian.png', title: `${isbn} on Ereadian` },
    { name: 'Goodreads', url: `https://www.goodreads.com/book/isbn/${q}`, icon: 'icons/goodreads.png', title: `${isbn} on Goodreads` },
  ];
}
