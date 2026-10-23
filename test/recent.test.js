import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecent } from '../src/recent.js';

function memoryStore(initial = []) {
  let list = initial;
  return { read: () => list, write: (next) => { list = next; } };
}

test('newest first, one entry per ISBN', () => {
  const recent = createRecent(memoryStore());
  recent.add({ isbn: '1', title: 'A' });
  recent.add({ isbn: '2', title: 'B' });
  recent.add({ isbn: '1', title: 'A again' });
  assert.deepEqual(recent.list(), [
    { isbn: '1', title: 'A again' },
    { isbn: '2', title: 'B' },
  ]);
});

test('keeps only the most recent entries up to the limit', () => {
  const recent = createRecent(memoryStore(), 3);
  for (let i = 1; i <= 5; i++) recent.add({ isbn: String(i), title: `T${i}` });
  assert.deepEqual(recent.list().map((e) => e.isbn), ['5', '4', '3']);
});

test('ignores corrupt or tampered entries instead of throwing', () => {
  const store = memoryStore([null, 5, 'x', { isbn: 1 }, { isbn: '2', title: 'Ok' }, { title: 'No ISBN' }]);
  const recent = createRecent(store);
  assert.deepEqual(recent.list(), [{ isbn: '2', title: 'Ok' }]);
  assert.doesNotThrow(() => recent.add({ isbn: '3', title: 'New' }));
  assert.deepEqual(store.read(), [{ isbn: '3', title: 'New' }, { isbn: '2', title: 'Ok' }]);
});

test('a tampered over-long list is cut to the limit', () => {
  const long = Array.from({ length: 500 }, (_, i) => ({ isbn: String(i), title: `T${i}` }));
  const recent = createRecent(memoryStore(long), 10);
  assert.equal(recent.list().length, 10);
});

test('rename changes a chip title and ignores unknown ISBNs', () => {
  const recent = createRecent(memoryStore());
  recent.add({ isbn: '1', title: 'ISBN 1' });
  recent.add({ isbn: '2', title: 'Two' });
  recent.rename('1', 'My book');
  recent.rename('9', 'Nobody');
  assert.deepEqual(recent.list(), [{ isbn: '2', title: 'Two' }, { isbn: '1', title: 'My book' }]);
});

