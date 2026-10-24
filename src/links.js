// Where to look a book up by ISBN. Link-only: the pages can't be read from here (no CORS).
export function isbnLinks(isbn) {
  const q = encodeURIComponent(isbn);
  return [
    { name: 'Ereadian', url: `https://ereadian.com/search?q=${q}` },
    { name: 'Goodreads', url: `https://www.goodreads.com/book/isbn/${q}` },
  ];
}
