// A list of entries with an `isbn`, one per ISBN, newest first, up to `limit`: the shape under
// the typed names (src/names.js) and what the lookup found (src/meta.js). `valid` drops corrupt stored entries.
export function createKeyed(store, valid, limit = 1000) {
  const list = () => store.read().filter(valid).slice(0, limit);
  const others = (isbn) => list().filter((e) => e.isbn !== isbn);
  return {
    all: list,
    get: (isbn) => list().find((e) => e.isbn === isbn) ?? null,
    put: (entry) => store.write([entry, ...others(entry.isbn)].slice(0, limit)),
    remove: (isbn) => store.write(others(isbn)),
  };
}
