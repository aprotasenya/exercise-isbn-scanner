import test from 'node:test';
import assert from 'node:assert/strict';
import { isbnLinks } from '../src/links.js';
import isbns from './fixtures/isbns.json' with { type: 'json' };

test('returns Ereadian and Goodreads links, in that order', () => {
  assert.deepEqual(isbnLinks('9786171299412'), [
    { name: 'Ereadian', url: 'https://ereadian.com/search?q=9786171299412' },
    { name: 'Goodreads', url: 'https://www.goodreads.com/book/isbn/9786171299412' },
  ]);
});

test('encodes the ISBN in every link', () => {
  const [ereadian, goodreads] = isbnLinks('080442957X&x=1 2');
  assert.ok(ereadian.url.endsWith('q=080442957X%26x%3D1%202'), ereadian.url);
  assert.ok(goodreads.url.endsWith('/isbn/080442957X%26x%3D1%202'), goodreads.url);
});

test('builds both links for every ISBN in the shared list', () => {
  for (const { isbn } of [...isbns.found, ...isbns.notFoundInOpenLibrary]) {
    assert.deepEqual(isbnLinks(isbn).map((l) => l.url), [
      `https://ereadian.com/search?q=${isbn}`,
      `https://www.goodreads.com/book/isbn/${isbn}`,
    ]);
  }
});
