import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBook,
  parseOtherBooks,
  fetchBookByIsbn,
  fetchOtherBooksByAuthor,
  retry,
  unknownBook,
} from '../src/openLibrary.js';
import isbns from './fixtures/isbns.json' with { type: 'json' };

retry.delayMs = 0;

const ISBN = '9780747532699';

const data = {
  title: "Harry Potter and the Philosopher's Stone",
  authors: [{ name: 'J. K. Rowling', url: 'http://openlibrary.org/authors/OL23919A/J._K._Rowling' }],
  publishers: [{ name: 'Bloomsbury Publishing' }],
  publish_date: '1997',
  number_of_pages: 223,
  cover: { medium: 'https://covers.openlibrary.org/b/id/7355968-M.jpg' },
};
const edition = { works: [{ key: '/works/OL82563W' }] };
const work = { description: { type: '/type/text', value: 'A boy wizard.' } };
const ratings = { summary: { average: 4.215500945179584, count: 1058 } };

const current = { id: 'x', title: 'Current' };

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status) => ({ ok: false, status });

// Routes fetch calls by URL; a value of null means 404.
function mockFetch(t, routes) {
  return t.mock.method(globalThis, 'fetch', async (url) => {
    for (const [fragment, body] of routes) {
      if (url.includes(fragment)) return body === null ? fail(404) : ok(body);
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

const bookRoutes = [
  ['/api/books', { [`ISBN:${ISBN}`]: data }],
  ['/ratings.json', ratings],
  ['/works/OL82563W.json', work],
  [`/isbn/${ISBN}.json`, edition],
];

test('parseBook maps fields and rounds the rating', () => {
  const book = parseBook({ data, workId: 'OL82563W', work, ratings });
  assert.equal(book.id, 'OL82563W');
  assert.equal(book.title, "Harry Potter and the Philosopher's Stone");
  assert.deepEqual(book.authors, ['J. K. Rowling']);
  assert.equal(book.authorKey, 'OL23919A');
  assert.equal(book.publisher, 'Bloomsbury Publishing');
  assert.equal(book.pageCount, 223);
  assert.equal(book.description, 'A boy wizard.');
  assert.equal(book.averageRating, 4.2);
  assert.equal(book.ratingsCount, 1058);
});

test('parseBook tolerates missing fields and plain-string descriptions', () => {
  const book = parseBook({ data: {}, workId: null, work: { description: 'Plain' }, ratings: null });
  assert.equal(book.title, 'Untitled');
  assert.deepEqual(book.authors, []);
  assert.equal(book.authorKey, null);
  assert.equal(book.description, 'Plain');
  assert.equal(book.averageRating, null);
  assert.equal(book.ratingsCount, null);
});

test('parseOtherBooks excludes the current work and duplicate titles', () => {
  const json = { docs: [
    { key: '/works/OL1W', title: 'Matilda', first_publish_year: 1988 },
    { key: '/works/OL2W', title: 'The BFG', first_publish_year: 1982 },
    { key: '/works/OL3W', title: 'the bfg' },
    { key: '/works/OL4W', title: 'The Twits', first_publish_year: 1980 },
  ] };
  assert.deepEqual(parseOtherBooks(json, { id: 'OL1W', title: 'Matilda' }), [
    { id: 'OL2W', title: 'The BFG', publishedDate: '1982' },
    { id: 'OL4W', title: 'The Twits', publishedDate: '1980' },
  ]);
});

test('parseOtherBooks respects the limit', () => {
  const docs = Array.from({ length: 8 }, (_, i) => ({ key: `/works/OL${i}W`, title: `Book ${i}` }));
  assert.equal(parseOtherBooks({ docs }, { id: 'none', title: 'none' }, 3).length, 3);
});

test('fetchBookByIsbn assembles book, description and rating', async (t) => {
  mockFetch(t, bookRoutes);
  const book = await fetchBookByIsbn(ISBN);
  assert.equal(book.title, data.title);
  assert.equal(book.id, 'OL82563W');
  assert.equal(book.description, 'A boy wizard.');
  assert.equal(book.averageRating, 4.2);
});

test('fetchBookByIsbn returns null when Open Library has no such book', async (t) => {
  mockFetch(t, [['/api/books', {}], [`/isbn/${ISBN}.json`, null]]);
  assert.equal(await fetchBookByIsbn(ISBN), null);
});

test('fetchBookByIsbn still returns the book when the rating lookup fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('/ratings.json')) return fail(500);
    const route = bookRoutes.find(([fragment]) => url.includes(fragment));
    return ok(route[1]);
  });
  const book = await fetchBookByIsbn(ISBN);
  assert.equal(book.title, data.title);
  assert.equal(book.averageRating, null);
});

test('fetchBookByIsbn works without a work id', async (t) => {
  mockFetch(t, [['/api/books', { [`ISBN:${ISBN}`]: data }], [`/isbn/${ISBN}.json`, null]]);
  const book = await fetchBookByIsbn(ISBN);
  assert.equal(book.id, null);
  assert.equal(book.description, null);
});

test('retries on 503 and then succeeds', async (t) => {
  const responses = [fail(503), fail(503), ok({ docs: [] })];
  const mock = t.mock.method(globalThis, 'fetch', async () => responses.shift());
  assert.deepEqual(await fetchOtherBooksByAuthor('OL23919A', current), []);
  assert.equal(mock.mock.callCount(), 3);
});

test('gives up after the last attempt', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => fail(503));
  await assert.rejects(fetchOtherBooksByAuthor('OL23919A', current), /503/);
  assert.equal(mock.mock.callCount(), retry.attempts);
});

test('does not retry other client errors', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => fail(400));
  await assert.rejects(fetchOtherBooksByAuthor('OL23919A', current), /400/);
  assert.equal(mock.mock.callCount(), 1);
});

test('fetchOtherBooksByAuthor queries by author key sorted by editions', async (t) => {
  const mock = mockFetch(t, [['/search.json', { docs: [{ key: '/works/OL2W', title: 'The BFG' }] }]]);
  const books = await fetchOtherBooksByAuthor('OL23919A', { id: 'OL1W', title: 'Matilda' });
  assert.deepEqual(books.map((b) => b.id), ['OL2W']);
  const url = mock.mock.calls[0].arguments[0];
  assert.match(url, /author_key=OL23919A/);
  assert.match(url, /sort=editions/);
});

test('parseOtherBooks skips a duplicate work record of the current book by title', () => {
  const json = { docs: [
    { key: '/works/OL9W', title: 'MATILDA' },
    { key: '/works/OL2W', title: 'The BFG' },
  ] };
  assert.deepEqual(
    parseOtherBooks(json, { id: 'OL1W', title: 'Matilda' }).map((b) => b.id),
    ['OL2W'],
  );
});

test('fetchOtherBooksByAuthor asks for 30 works and still returns 5 after dedupe', async (t) => {
  const docs = Array.from({ length: 30 }, (_, i) => ({
    key: `/works/OL${i}W`,
    title: `Title ${i % 8}`, // 8 distinct titles repeated
  }));
  const mock = mockFetch(t, [['/search.json', { docs }]]);
  const books = await fetchOtherBooksByAuthor('OL23919A', current);
  assert.equal(books.length, 5);
  assert.match(mock.mock.calls[0].arguments[0], /limit=30/);
});

test('fetchBookByIsbn fails instead of silently dropping data when the edition lookup fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    url.includes('/isbn/') ? fail(503) : ok({ [`ISBN:${ISBN}`]: data }));
  await assert.rejects(fetchBookByIsbn(ISBN), /503/);
});

test('retries when fetch rejects (network error)', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 1) throw new TypeError('network down');
    return ok({ docs: [] });
  });
  assert.deepEqual(await fetchOtherBooksByAuthor('OL23919A', current), []);
  assert.equal(calls, 2);
});

test('rethrows the network error after the last attempt', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network down'); });
  await assert.rejects(fetchOtherBooksByAuthor('OL23919A', current), /network down/);
  assert.equal(mock.mock.callCount(), retry.attempts);
});

test('every request carries a timeout signal', async (t) => {
  const mock = mockFetch(t, [['/search.json', { docs: [] }]]);
  await fetchOtherBooksByAuthor('OL23919A', current);
  assert.ok(mock.mock.calls[0].arguments[1].signal instanceof AbortSignal);
});

test('ISBNs that Open Library lacks resolve to null (empty data answer, 404 edition)', async (t) => {
  for (const { isbn } of isbns.notFoundInOpenLibrary) {
    t.mock.restoreAll();
    mockFetch(t, [['/api/books', {}], [`/isbn/${isbn}.json`, null]]);
    assert.equal(await fetchBookByIsbn(isbn), null, isbn);
  }
});

test('unknownBook is a card-ready placeholder for an ISBN Open Library lacks', () => {
  const book = unknownBook('9786171299412');
  assert.equal(book.title, 'ISBN 9786171299412');
  assert.deepEqual(book.authors, []);
  assert.equal(book.authorKey, null); // so no "More by…" lookup is attempted
  assert.equal(book.thumbnail, null);
  assert.equal(book.unknown, true);
  assert.equal(book.id, null);
});

