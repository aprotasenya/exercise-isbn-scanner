// What the lookup service found for a book, keyed by ISBN (newest first): the cleaned answer
// (src/lookup.js) plus { isbn, v }. Only a cache of public data: the lists and typed names stay the
// source of what the user sees. `v` is the shape of the entry: an older one (no series, author or
// rating, a title that still has its brackets) is still readable, but the app asks the service again.
export const META_VERSION = 2;
const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.title === 'string';

export function createMeta(store, limit = 1000) {
  const list = () => store.read().filter(isEntry).slice(0, limit);
  return {
    get: (isbn) => list().find((e) => e.isbn === isbn) ?? null,
    set(isbn, found) {
      const rest = list().filter((e) => e.isbn !== isbn);
      store.write([{ ...found, isbn, v: META_VERSION }, ...rest].slice(0, limit));
    },
  };
}
