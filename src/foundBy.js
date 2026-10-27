// The title and author a book was found by (picked from a title search), keyed by ISBN (newest first): its
// site links search for them instead of the ISBN, because the ISBN Goodreads has for the edition may not be the
// one in the user's hands.
import { createKeyed } from './keyed.js';

const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.title === 'string' && typeof e.author === 'string';
const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function createFoundBy(store, limit = 1000) {
  const keyed = createKeyed(store, isEntry, limit);
  return {
    get: (isbn) => keyed.get(isbn),
    // an empty title removes the entry (the book is no longer one found by its title)
    set(isbn, title, author) {
      const found = { isbn, title: clean(title, 120), author: clean(author, 100) };
      if (found.title) keyed.put(found);
      else keyed.remove(isbn);
    },
    all: () => new Map(keyed.all().map((e) => [e.isbn, e])),
  };
}
