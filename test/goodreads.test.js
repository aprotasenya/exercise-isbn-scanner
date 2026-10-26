import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBook } from '../worker/goodreads.js';

const page = (...blocks) =>
  `<html><head>${blocks.map((b) => `<script type="application/ld+json">${typeof b === 'string' ? b : JSON.stringify(b)}</script>`).join('')}</head></html>`;

// shaped like the real page of 9786171299412 (checked 2026-10-25)
const book = {
  '@context': 'https://schema.org',
  '@type': 'Book',
  name: 'Шлях королів (Хроніки Буресвітла #1)',
  image: 'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1678531272i/123221824.jpg',
  author: [
    { '@type': 'Person', name: 'Brandon Sanderson' },
    { '@type': 'Person', name: 'Брендон Сандерсон' },
    { '@type': 'Person', name: 'Brandon Sanderson' },
  ],
};

test('reads title, authors (without repeats) and cover from the Book block', () => {
  assert.deepEqual(parseBook(page(book)), {
    title: 'Шлях королів (Хроніки Буресвітла #1)',
    authors: ['Brandon Sanderson', 'Брендон Сандерсон'],
    image: book.image,
  });
});

test('finds the Book among other blocks, in an array, and skips malformed ones', () => {
  assert.equal(parseBook(page('{not json', { '@type': 'Organization' }, [book]))?.title, book.name);
});

test('decodes HTML entities in the title and authors, once', () => {
  const parsed = parseBook(page({ ...book, name: 'Philosopher&apos;s Stone &amp; &#8220;Co&#x201D; &amp;apos;', author: [{ name: 'A &lt;B&gt;' }] }));
  assert.equal(parsed.title, 'Philosopher\'s Stone & “Co” &apos;');
  assert.deepEqual(parsed.authors, ['A <B>']);
});

test('a single author object and a missing author both work', () => {
  assert.deepEqual(parseBook(page({ ...book, author: { name: 'One' } }))?.authors, ['One']);
  assert.deepEqual(parseBook(page({ ...book, author: undefined }))?.authors, []);
});

test('only an https cover is kept', () => {
  assert.equal(parseBook(page({ ...book, image: 'http://x/y.jpg' }))?.image, '');
  assert.equal(parseBook(page({ ...book, image: 5 }))?.image, '');
});

test('no Book block or no name is no data', () => {
  assert.equal(parseBook(''), null);
  assert.equal(parseBook('<html>no data</html>'), null);
  assert.equal(parseBook(page({ '@type': 'Book', name: '  ' })), null);
  assert.equal(parseBook('<script type="application/ld+json">{"@type":"Book"'), null); // cut off
});
