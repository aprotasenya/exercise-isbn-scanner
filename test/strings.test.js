import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plural, books, lists, card, theme, lookup } from '../src/strings.js';
import { THEMES } from '../src/theme.js';

const forms = ['книга', 'книги', 'книг'];

test('Ukrainian plural forms', () => {
  const cases = { 0: 2, 1: 0, 2: 1, 3: 1, 4: 1, 5: 2, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2, 20: 2, 21: 0, 22: 1, 24: 1, 25: 2, 101: 0, 102: 1, 111: 2, 112: 2, 121: 0, 1000: 2 };
  for (const [n, index] of Object.entries(cases)) {
    assert.equal(plural(Number(n), forms), forms[index], `${n} → ${forms[index]}`);
  }
});

test('books() puts the number before the right form', () => {
  assert.equal(books(1), '1 книга');
  assert.equal(books(3), '3 книги');
  assert.equal(books(1000), '1000 книг');
});

test('the two lists have their names, used in the messages', () => {
  assert.equal(lists.names.scanned, 'Шукане');
  assert.equal(lists.names.marked, 'Вибране');
  assert.equal(lists.alreadyScanned('X'), 'Вже в «Шуканому»: X');
  assert.match(lists.listFull('marked', 1000, lists.fullAdvice.marked), /«Вибране» заповнений \(1000 книг\)/);
  assert.match(lists.clearScanned('3 книги'), /«Шукане» \(3 книги\)\? Вибране залишиться\.$/);
  assert.equal(lists.copied(books(2)), 'Скопійовано 2 книги до буфера.');
});

test('a book without a name is titled ISBN <number>', () => {
  assert.equal(card.isbnTitle('9780747532699'), 'ISBN 9780747532699');
});

test('every theme has a label and a name', () => {
  for (const mode of THEMES) {
    assert.ok(theme.labels[mode], mode);
    assert.ok(theme.names[mode], mode);
    assert.match(theme.aria(mode), /^Тема: /);
  }
});

test('formatRating shows two decimals and groups the count', async () => {
  const { formatRating } = await import('../src/strings.js');
  const { value, count } = formatRating({ value: 4.5, count: 734385 });
  assert.equal(value, '4.50');
  assert.equal(count.replace(/\s/g, ' '), '734 385'); // the group separator is a no-break space
  assert.equal(formatRating({ value: 3, count: 12 }).count, '12');
});

test('every data-s path in index.html resolves to a string', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const paths = [...html.matchAll(/data-s(?:-[\w-]+)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 10);
  for (const path of paths) assert.equal(typeof lookup(path), 'string', path);
});
