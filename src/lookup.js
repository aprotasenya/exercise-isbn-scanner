// The app's only network call: asks the lookup service (worker/) for a book's name and cover.
// The app works fully without it: every failure (no URL set, offline, unknown book, slow answer)
// gives null and the book stays `ISBN <number>`.
export const LOOKUP_URL = 'https://isbn-lookup.oleprota.workers.dev'; // the deployed worker (worker/README.md); '' turns the lookup off
const TIMEOUT_MS = 5000;

// Returns { title, image } (image may be '') or null. Never throws.
export async function lookupBook(isbn, { url = LOOKUP_URL, fetchFn = fetch, timeout = TIMEOUT_MS } = {}) {
  if (!url) return null;
  try {
    const response = await fetchFn(`${url}/lookup?isbn=${encodeURIComponent(isbn)}`, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) return null;
    const data = await response.json();
    const title = typeof data?.title === 'string' ? data.title.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
    if (!title) return null;
    const image = typeof data.image === 'string' && data.image.startsWith('https://') ? data.image : '';
    return { title, image };
  } catch {
    return null;
  }
}
