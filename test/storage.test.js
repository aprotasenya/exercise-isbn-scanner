import test from 'node:test';
import assert from 'node:assert/strict';
import { createListStore } from '../src/storage.js';

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
