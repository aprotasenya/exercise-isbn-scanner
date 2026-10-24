import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarked } from '../src/marked.js';

function memoryStore(initial = []) {
  let list = initial;
  return { read: () => list, write: (next) => { list = next; } };
}

const matilda = { isbn: '9780141365466', title: 'Matilda' };
const potter = { isbn: '9780747532699', title: 'ISBN 9780747532699' };

test('adds books newest first and records when', () => {
  const marked = createMarked(memoryStore());
  assert.equal(marked.add(matilda, new Date('2026-10-23T10:00:00Z')), true);
  assert.equal(marked.add(potter, new Date('2026-10-23T11:00:00Z')), true);
  assert.deepEqual(marked.list().map((b) => b.isbn), [potter.isbn, matilda.isbn]);
  assert.equal(marked.list()[1].addedAt, '2026-10-23T10:00:00.000Z');
});

test('refuses a duplicate ISBN', () => {
  const marked = createMarked(memoryStore());
  marked.add(matilda);
  assert.equal(marked.add({ ...matilda, title: 'Other' }), false);
  assert.equal(marked.list().length, 1);
  assert.equal(marked.list()[0].title, 'Matilda');
});

test('has, remove and clear', () => {
  const marked = createMarked(memoryStore());
  marked.add(matilda);
  marked.add(potter);
  assert.equal(marked.has(matilda.isbn), true);
  marked.remove(matilda.isbn);
  assert.equal(marked.has(matilda.isbn), false);
  assert.equal(marked.list().length, 1);
  marked.clear();
  assert.deepEqual(marked.list(), []);
});

test('toText lists "Title (ISBN)" per line, newest first', () => {
  const marked = createMarked(memoryStore());
  marked.add(potter);
  marked.add(matilda);
  assert.equal(marked.toText(), 'Matilda (9780141365466)\nISBN 9780747532699 (9780747532699)');
});

test('entries saved by earlier versions (with authors) are still listed', () => {
  const marked = createMarked(memoryStore([{ isbn: '1', title: 'Old', authors: ['A'], publishedDate: '1999' }]));
  assert.equal(marked.toText(), 'Old (1)');
});

test('toJson round-trips the list', () => {
  const marked = createMarked(memoryStore());
  marked.add(matilda, new Date('2026-10-23T10:00:00Z'));
  assert.deepEqual(JSON.parse(marked.toJson()), marked.list());
});

test('ignores malformed stored entries', () => {
  const marked = createMarked(memoryStore([null, { isbn: 1 }, { isbn: '1', title: 'Ok', authors: [] }]));
  assert.deepEqual(marked.list().map((b) => b.isbn), ['1']);
});

test('rename changes the title of a marked book and ignores others', () => {
  const marked = createMarked(memoryStore());
  marked.add(matilda);
  marked.add(potter);
  marked.rename(matilda.isbn, 'My Matilda');
  marked.rename('0000000000', 'Nobody');
  assert.deepEqual(marked.list().map((b) => b.title), [potter.title, 'My Matilda']);
});

