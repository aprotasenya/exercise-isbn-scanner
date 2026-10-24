import test from 'node:test';
import assert from 'node:assert/strict';
import { isbnLinks } from '../src/links.js';
import { existsSync, readFileSync } from 'node:fs';
import isbns from './fixtures/isbns.json' with { type: 'json' };

test('returns Ereadian and Goodreads links, in that order', () => {
  assert.deepEqual(isbnLinks('9786171299412'), [
    { name: 'Ereadian', url: 'https://ereadian.com/search?q=9786171299412', icon: 'icons/ereadian.png', title: '9786171299412 на Ereadian' },
    { name: 'Goodreads', url: 'https://www.goodreads.com/book/isbn/9786171299412', icon: 'icons/goodreads.png', title: '9786171299412 на Goodreads' },
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

test('every link has an icon file in the repo, and it is a PNG', () => {
  for (const { name, icon } of isbnLinks('9780747532699')) {
    const file = new URL(`../${icon}`, import.meta.url);
    assert.ok(existsSync(file), `${name}: ${icon} is missing`);
    assert.equal(readFileSync(file).subarray(1, 4).toString(), 'PNG', `${icon} is not a PNG`);
  }
});
