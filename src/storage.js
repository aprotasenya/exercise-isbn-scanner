// A JSON list kept in a Storage-like object (localStorage in the browser, a fake in tests).
// Storage can be missing, full, corrupt or blocked (private mode), so nothing here may throw.
export function createListStore(storage, key) {
  return {
    read() {
      try {
        const value = JSON.parse(storage.getItem(key));
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    },
    write(list) {
      try {
        storage.setItem(key, JSON.stringify(list));
      } catch {
        // quota exceeded or storage blocked: the list just won't persist
      }
    },
  };
}
