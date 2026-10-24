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

// One-time migration: copies a list saved under an old key to a new key, unless the new key
// already exists. Only entries accepted by `isValid` are copied; the old key stays.
export function copyListOnce(storage, fromKey, toKey, isValid) {
  try {
    if (storage.getItem(toKey) !== null) return;
    const list = JSON.parse(storage.getItem(fromKey));
    if (!Array.isArray(list)) return;
    storage.setItem(toKey, JSON.stringify(list.filter(isValid)));
  } catch {
    // missing, corrupt or blocked storage: nothing to migrate
  }
}
