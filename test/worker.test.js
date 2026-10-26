import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../worker/index.js';

const ISBN = '9786171299412'; // valid; see test/fixtures/isbns.json for more
const ORIGIN = 'https://oleprota.github.io';
const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Book', name: 'Title', image: 'https://m.media-amazon.com/a.jpg', author: [{ name: 'A' }] })}</script>`;

function memoryCache() {
  const map = new Map();
  return {
    match: async (request) => map.get(request.url)?.clone(),
    put: async (request, response) => { map.set(request.url, response); },
  };
}

function setup(respond) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return respond(url);
  };
  const handle = createHandler({ fetchFn, cache: memoryCache(), wait: async () => {} });
  const get = (query, headers = { origin: ORIGIN }, env) =>
    handle(new Request(`https://worker.test/lookup${query}`, { headers }), env);
  return { calls, get };
}

const goodreads = (body = html, status = 200) => () => Object.defineProperty(new Response(body, { status }), 'url', { value: 'https://www.goodreads.com/book/show/1' });

test('returns the book and allows the app origin', async () => {
  const { get, calls } = setup(goodreads());
  const response = await get(`?isbn=${ISBN}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.deepEqual(await response.json(), { title: 'Title', authors: ['A'], image: 'https://m.media-amazon.com/a.jpg', url: 'https://www.goodreads.com/book/show/1' });
  assert.deepEqual(calls, [`https://www.goodreads.com/book/isbn/${ISBN}`]);
});

test('accepts a hyphenated ISBN and rejects invalid ones without asking Goodreads', async () => {
  const { get, calls } = setup(goodreads());
  assert.equal((await get('?isbn=978-617-129-941-2')).status, 200);
  assert.equal((await get('?isbn=9786171299413')).status, 400);
  assert.equal((await get('')).status, 400);
  assert.equal(calls.length, 1);
});

test('refuses other origins, answers the preflight, only serves GET /lookup', async () => {
  const { get, calls } = setup(goodreads());
  assert.equal((await get(`?isbn=${ISBN}`, { origin: 'https://evil.example' })).status, 403);
  assert.equal(calls.length, 0);
  const handle = createHandler({ fetchFn: goodreads(), cache: memoryCache() });
  const preflight = await handle(new Request('https://worker.test/lookup', { method: 'OPTIONS', headers: { origin: 'http://localhost:8000' } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:8000');
  assert.equal((await handle(new Request('https://worker.test/other'))).status, 404);
});

test('an empty 202, an error status, a page without the block or a failure is 404 {} with the reason', async () => {
  const cases = [[goodreads('', 202), 'status 202'], [goodreads('x', 500), 'status 500'], [goodreads('<html></html>'), 'no book data in page'], [() => { throw new Error('offline'); }, 'timeout or network error']];
  for (const [respond, reason] of cases) {
    const { get } = setup(respond);
    const response = await get(`?isbn=${ISBN}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {});
    assert.equal(response.headers.get('x-miss-reason'), reason);
  }
});

test('a 202 is asked once more, and the full page that follows is the answer', async () => {
  const answers = [goodreads('', 202), goodreads()];
  const { get, calls } = setup(() => answers.shift()());
  const response = await get(`?isbn=${ISBN}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).title, 'Title');
  assert.equal(calls.length, 2);
});

test('only a real 404 is remembered for a day; doubtful misses are asked again after 5 minutes', async () => {
  const day = await setup(goodreads('', 404)).get(`?isbn=${ISBN}`);
  assert.equal(day.status, 404);
  assert.equal(day.headers.get('cache-control'), 'public, max-age=86400');
  for (const respond of [goodreads('', 202), goodreads('x', 500), goodreads('<html></html>')]) {
    const unsure = await setup(respond).get(`?isbn=${ISBN}`);
    assert.equal(unsure.headers.get('cache-control'), 'public, max-age=300');
  }
});

test('answers (found or not) are cached: Goodreads is asked once per ISBN', async () => {
  for (const respond of [goodreads(), goodreads('', 404)]) {
    const { get, calls } = setup(respond);
    const first = await get(`?isbn=${ISBN}`);
    const second = await get(`?isbn=${ISBN}`, { origin: 'http://localhost:8000' });
    assert.equal(second.status, first.status);
    assert.equal(second.headers.get('access-control-allow-origin'), 'http://localhost:8000');
    assert.equal(calls.length, 1);
  }
});

test('the rate limiter stops requests that are not in the cache', async () => {
  const { get, calls } = setup(goodreads());
  const env = { LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await get(`?isbn=${ISBN}`, undefined, env)).status, 429);
  assert.equal(calls.length, 0);
});
