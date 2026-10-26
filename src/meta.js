// What the lookup service found for a book, keyed by ISBN (newest first): the cleaned answer
// (src/lookup.js) plus { isbn, v }. Only a cache of public data: the lists and typed names stay the
// source of what the user sees. `v` is the shape of the entry: an older one (no series, author or
// rating, a title that still has its brackets) is still readable, but the app asks the service again.
import { createKeyed } from './keyed.js';

export const META_VERSION = 2;
const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.title === 'string';

export function createMeta(store, limit = 1000) {
  const keyed = createKeyed(store, isEntry, limit);
  return {
    get: keyed.get,
    set: (isbn, found) => keyed.put({ ...found, isbn, v: META_VERSION }),
  };
}
