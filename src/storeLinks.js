// Search links for ISBNs that Open Library does not know (mostly Ukrainian books).
export function storeSearchLinks(isbn) {
  const q = encodeURIComponent(isbn);
  return [
    { name: 'Ereadian', url: `https://ereadian.com/search?q=${q}` },
  ];
}
