// The most recently looked-up books (found or not), newest first, one entry per ISBN.
// Stored data can be corrupt or tampered with, so entries are checked on every read.
const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.title === 'string';

export function createRecent(store, limit = 10) {
  const list = () => store.read().filter(isEntry).slice(0, limit);
  return {
    list,
    add({ isbn, title }) {
      const rest = list().filter((entry) => entry.isbn !== isbn);
      store.write([{ isbn, title }, ...rest].slice(0, limit));
    },
    // Changes the title of a chip (e.g. after the user names an unknown book).
    rename(isbn, title) {
      store.write(list().map((entry) => (entry.isbn === isbn ? { ...entry, title } : entry)));
    },
  };
}
