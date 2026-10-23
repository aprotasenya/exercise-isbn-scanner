const BASE = 'https://openlibrary.org';

// Open Library occasionally answers 429/5xx or stalls; retry with a growing delay.
export const retry = { attempts: 3, delayMs: 300, timeoutMs: 10000 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns parsed JSON, or null when the resource does not exist.
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const last = attempt >= retry.attempts;
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(retry.timeoutMs) });
    } catch (err) {
      // network failure or timeout
      if (last) throw err;
      await sleep(retry.delayMs * attempt);
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (!(res.status === 429 || res.status >= 500) || last) {
      throw new Error(`Open Library request failed (${res.status})`);
    }
    await sleep(retry.delayMs * attempt);
  }
}

// Description and rating are optional extras; they must not hide the main book info.
const optional = (promise) => promise.catch(() => null);

const lastSegment = (key) => key?.split('/').filter(Boolean).pop() ?? null;

export function parseBook({ data, workId, work, ratings }) {
  const description = work?.description;
  return {
    id: workId,
    title: data.title ?? 'Untitled',
    authors: (data.authors ?? []).map((a) => a.name),
    // author url looks like http://openlibrary.org/authors/OL23919A/J._K._Rowling
    authorKey: data.authors?.[0]?.url?.match(/\/authors\/(OL\w+A)\b/)?.[1] ?? null,
    publisher: data.publishers?.[0]?.name ?? null,
    publishedDate: data.publish_date ?? null,
    description: (typeof description === 'string' ? description : description?.value) ?? null,
    pageCount: data.number_of_pages ?? null,
    thumbnail: data.cover?.medium ?? null,
    averageRating: ratings?.summary?.average != null
      ? Math.round(ratings.summary.average * 10) / 10
      : null,
    ratingsCount: ratings?.summary?.count || null,
  };
}

// What the card shows for a valid ISBN that Open Library does not know.
export function unknownBook(isbn) {
  return {
    id: null,
    title: `ISBN ${isbn}`,
    authors: [],
    authorKey: null,
    publisher: null,
    publishedDate: null,
    description: null,
    pageCount: null,
    thumbnail: null,
    averageRating: null,
    ratingsCount: null,
    unknown: true,
  };
}

// `current` is the book being viewed; it is excluded by work id and by title, since
// Open Library sometimes holds duplicate work records for the same title.
export function parseOtherBooks(json, current, limit = 5) {
  const seen = new Set([current.title?.toLowerCase()]);
  const books = [];
  for (const doc of json.docs ?? []) {
    const id = lastSegment(doc.key);
    const title = doc.title ?? 'Untitled';
    const dedupeKey = title.toLowerCase();
    if (id === current.id || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    books.push({
      id,
      title,
      publishedDate: doc.first_publish_year != null ? String(doc.first_publish_year) : null,
    });
    if (books.length === limit) break;
  }
  return books;
}

export async function fetchBookByIsbn(isbn) {
  const bibkey = `ISBN:${isbn}`;
  const [response, edition] = await Promise.all([
    getJson(`${BASE}/api/books?bibkeys=${encodeURIComponent(bibkey)}&format=json&jscmd=data`),
    getJson(`${BASE}/isbn/${encodeURIComponent(isbn)}.json`),
  ]);
  const data = response?.[bibkey];
  if (!data) return null;

  const workId = lastSegment(edition?.works?.[0]?.key);
  const [work, ratings] = workId
    ? await Promise.all([
      optional(getJson(`${BASE}/works/${workId}.json`)),
      optional(getJson(`${BASE}/works/${workId}/ratings.json`)),
    ])
    : [null, null];
  return parseBook({ data, workId, work, ratings });
}

export async function fetchOtherBooksByAuthor(authorKey, current) {
  const params = new URLSearchParams({
    author_key: authorKey,
    sort: 'editions',
    limit: '30', // most-edited works include many duplicate titles; filter down afterwards
    fields: 'key,title,first_publish_year',
  });
  const json = await getJson(`${BASE}/search.json?${params}`);
  return json ? parseOtherBooks(json, current) : [];
}
