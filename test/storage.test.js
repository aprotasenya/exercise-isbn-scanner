import test from 'node:test';
import assert from 'node:assert/strict';
import { createListStore, readFlag, writeFlag } from '../src/storage.js';

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

test('a flag is stored as "1" when on and removed when off', () => {
  const storage = fakeStorage();
  assert.equal(readFlag(storage, 'f'), false);
  writeFlag(storage, 'f', true);
  assert.equal(readFlag(storage, 'f'), true);
  assert.deepEqual(storage.data, { f: '1' });
  writeFlag(storage, 'f', false);
  assert.equal(readFlag(storage, 'f'), false);
  assert.deepEqual(storage.data, {});
});

test('flags tolerate blocked storage', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  for (const storage of [broken, null]) {
    assert.equal(readFlag(storage, 'f'), false);
    assert.doesNotThrow(() => writeFlag(storage, 'f', true));
    assert.doesNotThrow(() => writeFlag(storage, 'f', false));
  }
});
