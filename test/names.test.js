import test from 'node:test';
import assert from 'node:assert/strict';
import { createNames } from '../src/names.js';

function memoryStore(initial = []) {
  let list = initial;
  return { read: () => list, write: (next) => { list = next; } };
}

test('stores a trimmed name per ISBN and reads it back', () => {
  const names = createNames(memoryStore());
  assert.equal(names.get('1'), null);
  assert.equal(names.set('1', '  My   book  '), 'My book');
  assert.equal(names.get('1'), 'My book');
});

test('renaming replaces the old name; an empty name removes it', () => {
  const store = memoryStore();
  const names = createNames(store);
  names.set('1', 'First');
  names.set('2', 'Second');
  names.set('1', 'Renamed');
  assert.deepEqual(store.read(), [{ isbn: '1', name: 'Renamed' }, { isbn: '2', name: 'Second' }]);
  assert.equal(names.set('1', '   '), '');
  assert.equal(names.get('1'), null);
  assert.deepEqual(store.read(), [{ isbn: '2', name: 'Second' }]);
});

test('names are cut to 120 characters and the list to its limit', () => {
  const names = createNames(memoryStore(), 3);
  assert.equal(names.set('1', 'x'.repeat(500)).length, 120);
  for (const isbn of ['2', '3', '4']) names.set(isbn, `Book ${isbn}`);
  assert.equal(names.get('1'), null); // the oldest was dropped
  assert.equal(names.get('4'), 'Book 4');
});

test('ignores corrupt stored entries', () => {
  const names = createNames(memoryStore([null, 5, { isbn: 1 }, { isbn: '9', name: 'Ok' }]));
  assert.equal(names.get('9'), 'Ok');
  assert.doesNotThrow(() => names.set('8', 'New'));
});
