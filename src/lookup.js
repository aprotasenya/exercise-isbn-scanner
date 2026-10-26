// The app's only network call: asks the lookup service (worker/) for a book's name, cover, series, author and rating.
// The app works fully without it: every failure (no URL set, offline, unknown book, slow answer)
// gives null and the book stays `ISBN <number>`.
export const LOOKUP_URL = 'https://isbn-lookup.oleprota.workers.dev'; // the deployed worker (worker/README.md); '' turns the lookup off
const TIMEOUT_MS = 5000;

const clean = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const AUTHOR_URL = 'https://www.goodreads.com/author/';

// What the service said, checked field by field (it is rendered into the page, so nothing is trusted):
// { title, image, series: {name, number} | null, author: {name, url} | null, rating: {value, count} | null }.
export function cleanAnswer(data) {
  const title = clean(data?.title, 120);
  if (!title) return null;
  const seriesName = clean(data.series?.name, 80);
  const authorName = clean(data.author?.name, 100);
  const value = Number(data.rating?.value);
  const count = Number(data.rating?.count);
  return {
    title,
    image: typeof data.image === 'string' && data.image.startsWith('https://') ? data.image : '',
    series: seriesName ? { name: seriesName, number: clean(data.series.number, 12) } : null,
    author: authorName
      ? { name: authorName, url: typeof data.author.url === 'string' && data.author.url.startsWith(AUTHOR_URL) ? data.author.url : '' }
      : null,
    rating: value > 0 && value <= 5 && Number.isInteger(count) && count > 0 ? { value, count } : null,
  };
}

// Returns the cleaned answer or null. Never throws.
export async function lookupBook(isbn, { url = LOOKUP_URL, fetchFn = fetch, timeout = TIMEOUT_MS } = {}) {
  if (!url) return null;
  try {
    const response = await fetchFn(`${url}/lookup?isbn=${encodeURIComponent(isbn)}`, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) return null;
    return cleanAnswer(await response.json());
  } catch {
    return null;
  }
}
