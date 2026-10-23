// The most recently found books, newest first, one entry per ISBN.
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
  };
}
