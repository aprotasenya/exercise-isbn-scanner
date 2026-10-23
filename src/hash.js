import { isValidIsbn, normalizeIsbn } from './isbn.js';

// Deep links look like `#isbn=9780747532699`.
export function isbnFromHash(hash) {
  const match = /^#isbn=([^&]+)/.exec(hash ?? '');
  if (!match) return null;
  let raw;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const isbn = normalizeIsbn(raw);
  return isValidIsbn(isbn) ? isbn : null;
}

export function hashForIsbn(isbn) {
  return `#isbn=${encodeURIComponent(isbn)}`;
}
