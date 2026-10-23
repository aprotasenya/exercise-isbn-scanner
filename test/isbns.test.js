import test from 'node:test';
import assert from 'node:assert/strict';
import isbns from './fixtures/isbns.json' with { type: 'json' };
import { isValidIsbn } from '../src/isbn.js';

test('found and not-found entries are valid ISBNs, invalid entries are not', () => {
  for (const { isbn } of [...isbns.found, ...isbns.notFoundInOpenLibrary]) {
    assert.ok(isValidIsbn(isbn), `${isbn} should be valid`);
  }
  for (const { isbn } of isbns.invalid) {
    assert.equal(isValidIsbn(isbn), false, `${isbn} should be invalid`);
  }
});

test('no ISBN is listed twice', () => {
  const all = [...isbns.found, ...isbns.notFoundInOpenLibrary, ...isbns.invalid].map((e) => e.isbn);
  assert.equal(new Set(all).size, all.length);
});

test('there are enough entries in each category for the tests that use them', () => {
  assert.ok(isbns.found.length >= 11, 'the 10-chip test needs 11 real books');
  assert.ok(isbns.notFoundInOpenLibrary.length >= 5);
  assert.ok(isbns.invalid.length >= 1);
});
