import test from 'node:test';
import assert from 'node:assert/strict';
import { createTitles } from '../src/titles.js';

const listOf = (books) => ({ list: () => books });
function setup({ name, found, listed } = {}) {
  const names = { get: () => name ?? null };
  const meta = { get: () => (found ? { title: found } : null) };
  return createTitles({ names, meta, lists: [listOf(listed ? [{ isbn: '1', title: listed }] : [])] });
}

test('a typed name beats the found title, which beats a stored one, which beats the ISBN', () => {
  assert.equal(setup({ name: 'Mine', found: 'Found', listed: 'Old' }).of('1'), 'Mine');
  assert.equal(setup({ found: 'Found', listed: 'Old' }).of('1'), 'Found');
  assert.equal(setup({ listed: 'Old' }).of('1'), 'Old');
  assert.equal(setup().of('1'), 'ISBN 1');
});

test('an empty name falls back to the found title, else the ISBN', () => {
  assert.equal(setup({ found: 'Found' }).fallback('1'), 'Found');
  assert.equal(setup().fallback('1'), 'ISBN 1');
});

test('a found title replaces only the default or the earlier found title, never a typed name', () => {
  const replaceable = setup({ found: 'Earlier' }).replaceable('1');
  assert.equal(replaceable('ISBN 1'), true);
  assert.equal(replaceable('Earlier'), true);
  assert.equal(replaceable('Typed by the user'), false);
});
