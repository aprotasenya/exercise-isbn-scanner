// Names the user typed for books Open Library does not know, keyed by ISBN (newest first).
const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.name === 'string';

export function createNames(store, limit = 1000) {
  const list = () => store.read().filter(isEntry).slice(0, limit);
  return {
    get: (isbn) => list().find((e) => e.isbn === isbn)?.name ?? null,
    // Trims and collapses whitespace; an empty name removes the entry. Returns the stored name.
    set(isbn, name) {
      const clean = String(name).trim().replace(/\s+/g, ' ').slice(0, 120);
      const rest = list().filter((e) => e.isbn !== isbn);
      store.write(clean ? [{ isbn, name: clean }, ...rest].slice(0, limit) : rest);
      return clean;
    },
  };
}
