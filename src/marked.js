// The "Marked" list (a shopping companion): books marked by ISBN, newest first, persisted
// through a list store.
const isEntry = (e) => e && typeof e.isbn === 'string' && typeof e.title === 'string';

export function createMarked(store) {
  const read = () => store.read().filter(isEntry);

  return {
    list: read,
    has: (isbn) => read().some((e) => e.isbn === isbn),
    // Returns false (and changes nothing) when the ISBN is already marked.
    add({ isbn, title, authors = [], publishedDate = null }, now = new Date()) {
      const books = read();
      if (books.some((e) => e.isbn === isbn)) return false;
      store.write([{ isbn, title, authors, publishedDate, addedAt: now.toISOString() }, ...books]);
      return true;
    },
    remove(isbn) {
      store.write(read().filter((e) => e.isbn !== isbn));
    },
    // Changes the title of an already marked book (e.g. after the user names an unknown one).
    rename(isbn, title) {
      store.write(read().map((e) => (e.isbn === isbn ? { ...e, title } : e)));
    },
    clear() {
      store.write([]);
    },
    toText() {
      return read()
        .map((e) => `${e.authors?.length ? e.authors.join(', ') : 'Unknown author'} — ${e.title} (${e.isbn})`)
        .join('\n');
    },
    toJson() {
      return JSON.stringify(read(), null, 2);
    },
  };
}
