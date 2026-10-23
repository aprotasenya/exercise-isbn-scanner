import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidIsbn, normalizeIsbn } from '../src/isbn.js';

test('normalizeIsbn strips hyphens and spaces', () => {
  assert.equal(normalizeIsbn('978-0-14-032872-1'), '9780140328721');
  assert.equal(normalizeIsbn(' 0 8044 2957 x '), '080442957X');
});

test('valid ISBN-13 and ISBN-10', () => {
  assert.ok(isValidIsbn('9780140328721'));
  assert.ok(isValidIsbn('978-0-14-032872-1'));
  assert.ok(isValidIsbn('0-8044-2957-X'));
});

test('invalid checksum or format', () => {
  assert.equal(isValidIsbn('1234567890'), false);
  assert.equal(isValidIsbn('9780140328722'), false);
  assert.equal(isValidIsbn('abc'), false);
  assert.equal(isValidIsbn(''), false);
});
