import test from 'node:test';
import assert from 'node:assert/strict';
import { createListStore, copyListOnce } from '../src/storage.js';
import { isBookEntry } from '../src/bookList.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

test('round-trips a list', () => {
  const store = createListStore(fakeStorage(), 'k');
  store.write([{ a: 1 }, { a: 2 }]);
  assert.deepEqual(store.read(), [{ a: 1 }, { a: 2 }]);
});

test('missing, corrupt or non-list data reads as an empty list', () => {
  assert.deepEqual(createListStore(fakeStorage(), 'k').read(), []);
  assert.deepEqual(createListStore(fakeStorage({ k: '{not json' }), 'k').read(), []);
  assert.deepEqual(createListStore(fakeStorage({ k: '{"a":1}' }), 'k').read(), []);
});

test('a throwing or missing storage never throws', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
  };
  for (const storage of [broken, null]) {
    const store = createListStore(storage, 'k');
    assert.deepEqual(store.read(), []);
    assert.doesNotThrow(() => store.write([1]));
  }
});

test('copyListOnce copies an old list to a new key, only when the new key is missing', () => {
  const storage = fakeStorage();
  storage.setItem('old', JSON.stringify([{ isbn: '1', title: 'A' }, null, { isbn: 2 }]));
  copyListOnce(storage, 'old', 'new', isBookEntry);
  assert.deepEqual(JSON.parse(storage.getItem('new')), [{ isbn: '1', title: 'A' }]);
  assert.ok(storage.getItem('old'), 'the old key is left alone');
  storage.setItem('old', JSON.stringify([{ isbn: '9', title: 'Z' }]));
  copyListOnce(storage, 'old', 'new', isBookEntry);
  assert.deepEqual(JSON.parse(storage.getItem('new')), [{ isbn: '1', title: 'A' }], 'an existing new list is not overwritten');
});

test('copyListOnce ignores a missing, corrupt or blocked source', () => {
  const storage = fakeStorage();
  copyListOnce(storage, 'old', 'new', isBookEntry);
  assert.equal(storage.getItem('new'), null);
  storage.setItem('old', '{not json');
  copyListOnce(storage, 'old', 'new', isBookEntry);
  assert.equal(storage.getItem('new'), null);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  for (const s of [broken, null]) assert.doesNotThrow(() => copyListOnce(s, 'old', 'new', isBookEntry));
});
