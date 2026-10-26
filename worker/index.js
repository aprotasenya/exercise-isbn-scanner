// ISBN lookup service: GET /lookup?isbn=<isbn> -> {title, authors, image, url} or 404 {}.
// It reads the Goodreads page for the ISBN on behalf of the app (a browser page can't: no CORS
// headers there). Runs as a Cloudflare Worker, see README.md in this folder.
import { isValidIsbn, normalizeIsbn } from '../src/isbn.js';
import { parseBook } from './goodreads.js';

export const ALLOWED_ORIGINS = ['https://oleprota.github.io', 'http://localhost:8000'];
const FOUND_SECONDS = 7 * 24 * 3600;
const MISSING_SECONDS = 24 * 3600; // Goodreads said 404: it really doesn't know the book
const UNSURE_SECONDS = 5 * 60; // anything else (an empty 202, a block, an error): ask again soon
const RETRY_DELAY_MS = 1500;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 400_000; // the JSON-LD block is near the top of a ~1 MB page
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Reads the page only until the JSON-LD block is complete, then drops the rest.
async function readHead(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    html += decoder.decode(value, { stream: true });
    const marker = html.indexOf('application/ld+json');
    if (marker !== -1 && html.indexOf('</script>', marker) !== -1) break;
  }
  reader.cancel().catch(() => {});
  return html;
}

// Goodreads sometimes answers an empty 202 for a page it has not built yet and serves the full page
// a moment later, so a 202 is asked once more. Returns { book } or { miss, certain }: `certain` only
// when Goodreads answered 404, so that a hiccup is never remembered as "no such book".
async function fromGoodreads(isbn, fetchFn, wait) {
  let miss = 'no answer';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchFn(`https://www.goodreads.com/book/isbn/${isbn}`, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status === 404) return { miss: 'status 404', certain: true };
      miss = `status ${response.status}`;
      if (response.status === 200 && response.body) {
        const book = parseBook(await readHead(response));
        if (book) return { book: { ...book, url: response.url } };
        miss = 'no book data in page';
      }
      if (response.status !== 202) break;
    } catch {
      miss = 'timeout or network error';
      break;
    }
    await wait(RETRY_DELAY_MS);
  }
  return { miss, certain: false };
}

const json = (body, status, seconds, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${seconds}`, ...extra },
  });

// `fetchFn` and `cache` are parameters so that tests don't touch the network.
export function createHandler({ fetchFn, cache, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  return async function handle(request, env = {}) {
    const origin = request.headers.get('origin');
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET' } });

    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/lookup') return json({}, 404, 0, cors);
    const isbn = normalizeIsbn(url.searchParams.get('isbn') ?? '');
    if (!isValidIsbn(isbn)) return json({ error: 'invalid isbn' }, 400, 0, cors);

    // v2: answers cached by the first version may hold a wrongly remembered miss
    const key = new Request(`https://lookup.invalid/v2/${isbn}`);
    const cached = await cache.match(key);
    if (cached) return new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), ...cors } });

    const limited = await env.LIMITER?.limit({ key: request.headers.get('cf-connecting-ip') ?? 'anonymous' });
    if (limited && !limited.success) return json({ error: 'slow down' }, 429, 0, cors);

    const { book, miss, certain } = await fromGoodreads(isbn, fetchFn, wait);
    const response = book
      ? json(book, 200, FOUND_SECONDS)
      : json({}, 404, certain ? MISSING_SECONDS : UNSURE_SECONDS, { 'x-miss-reason': miss }); // the reason is for curl, when debugging
    await cache.put(key, response.clone());
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...cors } });
  };
}

export default {
  fetch: (request, env, ctx) => {
    const handle = createHandler({ fetchFn: fetch, cache: caches.default });
    return handle(request, env);
  },
};
