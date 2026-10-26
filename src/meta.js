// What the lookup service found for a book, keyed by ISBN (newest first): { isbn, title, image }.
// Only a cache of public data: the lists and typed names stay the source of what the user sees.
const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.title === 'string';

export function createMeta(store, limit = 1000) {
  const list = () => store.read().filter(isEntry).slice(0, limit);
  return {
    get: (isbn) => list().find((e) => e.isbn === isbn) ?? null,
    set(isbn, { title, image = '' }) {
      const rest = list().filter((e) => e.isbn !== isbn);
      store.write([{ isbn, title, image }, ...rest].slice(0, limit));
    },
  };
}
