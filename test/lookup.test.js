import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupBook } from '../src/lookup.js';
import { createMeta } from '../src/meta.js';

const URL_ = 'https://lookup.example';
const answer = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });

test('does nothing without a service address', async () => {
  let asked = false;
  assert.equal(await lookupBook('1', { url: '', fetchFn: async () => { asked = true; } }), null);
  assert.equal(asked, false);
});

test('returns a clean title and an https cover', async () => {
  let requested;
  const found = await lookupBook('9786171299412', {
    url: URL_,
    fetchFn: async (url) => { requested = url; return answer({ title: '  Шлях   королів ', image: 'https://m.media-amazon.com/a.jpg' })(); },
  });
  assert.deepEqual(found, { title: 'Шлях королів', image: 'https://m.media-amazon.com/a.jpg' });
  assert.equal(requested, `${URL_}/lookup?isbn=9786171299412`);
});

test('a title is cut to 120 characters; a cover that is not https is dropped', async () => {
  const found = await lookupBook('1', { url: URL_, fetchFn: answer({ title: 'x'.repeat(300), image: 'javascript:alert(1)' }) });
  assert.equal(found.title.length, 120);
  assert.equal(found.image, '');
});

test('every failure is null and never throws', async () => {
  const cases = [answer({}, 404), answer({ title: '' }), answer({ title: 5 }), answer(null), async () => new Response('<html>', { status: 200 }), async () => { throw new Error('offline'); }];
  for (const fetchFn of cases) assert.equal(await lookupBook('1', { url: URL_, fetchFn }), null);
});

test('gives up after the timeout', async () => {
  const slow = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  assert.equal(await lookupBook('1', { url: URL_, fetchFn: slow, timeout: 20 }), null);
});

function memoryStore(initial = []) {
  let list = initial;
  return { read: () => list, write: (next) => { list = next; } };
}

test('meta keeps one entry per ISBN, newest first, up to its limit', () => {
  const meta = createMeta(memoryStore(), 2);
  meta.set('1', { title: 'One' });
  meta.set('2', { title: 'Two', image: 'https://x/2.jpg' });
  meta.set('1', { title: 'One again' });
  meta.set('3', { title: 'Three' });
  assert.equal(meta.get('2'), null); // pushed out
  assert.deepEqual(meta.get('1'), { isbn: '1', title: 'One again', image: '' });
});

test('meta ignores corrupt stored entries', () => {
  const meta = createMeta(memoryStore([null, 5, { isbn: 1 }, { isbn: '9', title: 'Ok', image: '' }]));
  assert.equal(meta.get('9').title, 'Ok');
  assert.doesNotThrow(() => meta.set('8', { title: 'New' }));
});
