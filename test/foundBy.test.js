import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoundBy } from '../src/foundBy.js';

function memoryStore(initial = []) {
  let list = initial;
  return { read: () => list, write: (next) => { list = next; } };
}

test('keeps the title and author a book was found by, newest first, and clears them on an empty title', () => {
  const foundBy = createFoundBy(memoryStore());
  assert.equal(foundBy.get('1'), null);
  foundBy.set('1', '  Хірург ', 'Tess   Gerritsen');
  foundBy.set('2', 'Other', undefined);
  assert.deepEqual(foundBy.get('1'), { isbn: '1', title: 'Хірург', author: 'Tess Gerritsen' });
  assert.deepEqual([...foundBy.all().keys()], ['2', '1']);
  assert.equal(foundBy.get('2').author, '');
  foundBy.set('1');
  assert.equal(foundBy.get('1'), null);
});

test('is cut to its limit and ignores corrupt entries', () => {
  const foundBy = createFoundBy(memoryStore([null, { isbn: '9', title: 5 }, { isbn: '8', title: 'Ok', author: '' }]), 2);
  assert.equal(foundBy.get('9'), null);
  assert.equal(foundBy.get('8').title, 'Ok');
  foundBy.set('1', 'A', '');
  foundBy.set('2', 'B', '');
  assert.equal(foundBy.get('8'), null); // the oldest was dropped
});
