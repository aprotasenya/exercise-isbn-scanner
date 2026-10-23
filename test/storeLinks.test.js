import test from 'node:test';
import assert from 'node:assert/strict';
import { storeSearchLinks } from '../src/storeLinks.js';

test('returns an Ereadian search link', () => {
  assert.deepEqual(storeSearchLinks('9786171299412'), [
    { name: 'Ereadian', url: 'https://ereadian.com/search?q=9786171299412' },
  ]);
});

test('encodes the ISBN in the query string', () => {
  for (const { url } of storeSearchLinks('080442957X&x=1 2')) {
    assert.ok(url.endsWith('q=080442957X%26x%3D1%202'), url);
  }
});
