import test from 'node:test';
import assert from 'node:assert/strict';
import { createTitles } from '../src/titles.js';

const listOf = (books) => ({ list: () => books });
function setup({ name, found, listed, picked } = {}) {
  const names = { get: () => name ?? null };
  const meta = { get: () => (found ? { title: found } : null) };
  const foundBy = { get: () => (picked ? { title: picked } : null) };
  return createTitles({ names, meta, lists: [listOf(listed ? [{ isbn: '1', title: listed }] : [])], foundBy });
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

test('the title a book was picked by names it when nothing better is known, even over a listed default', () => {
  assert.equal(setup({ picked: 'Picked' }).of('1'), 'Picked');
  assert.equal(setup({ picked: 'Picked', listed: 'ISBN 1' }).of('1'), 'Picked'); // a listed `ISBN 1` is only the default
  assert.equal(setup({ picked: 'Picked', listed: 'Old' }).of('1'), 'Old');
  assert.equal(setup({ picked: 'Picked', found: 'Found' }).of('1'), 'Found');
  assert.equal(setup({ picked: 'Picked' }).fallback('1'), 'Picked');
});
