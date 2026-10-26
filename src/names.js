// Names the user typed for books, keyed by ISBN (newest first).
import { createKeyed } from './keyed.js';

const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.name === 'string';

export function createNames(store, limit = 1000) {
  const keyed = createKeyed(store, isEntry, limit);
  return {
    get: (isbn) => keyed.get(isbn)?.name ?? null,
    // Trims and collapses whitespace; an empty name removes the entry. Returns the stored name.
    set(isbn, name) {
      const clean = String(name).trim().replace(/\s+/g, ' ').slice(0, 120);
      if (clean) keyed.put({ isbn, name: clean });
      else keyed.remove(isbn);
      return clean;
    },
  };
}
