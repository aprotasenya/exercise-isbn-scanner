import test from 'node:test';
import assert from 'node:assert/strict';
import { plural, books, listNames, THEME_LABELS, THEME_NAMES, t } from '../src/strings.js';
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
  assert.deepEqual(listNames, { scanned: 'Шукане', marked: 'Вибране' });
  assert.equal(t.alreadyScanned('X'), 'Вже в «Шуканому»: X');
  assert.match(t.listFull('marked', 1000, t.fullAdvice.marked), /«Вибране» заповнений \(1000 книг\)/);
  assert.match(t.clearScanned('3 книги'), /«Шукане» \(3 книги\)\? Вибране залишиться\.$/);
  assert.equal(t.copied(books(2)), 'Скопійовано 2 книги до буфера.');
});

test('a book without a name is titled ISBN <number>', () => {
  assert.equal(t.isbnTitle('9780747532699'), 'ISBN 9780747532699');
});

test('every theme has a label and a name', () => {
  for (const theme of THEMES) {
    assert.ok(THEME_LABELS[theme], theme);
    assert.ok(THEME_NAMES[theme], theme);
    assert.match(t.themeAria(theme), /^Тема: /);
  }
});

test('formatRating shows two decimals and groups the count', async () => {
  const { formatRating } = await import('../src/strings.js');
  const { value, count } = formatRating({ value: 4.5, count: 734385 });
  assert.equal(value, '4.50');
  assert.equal(count.replace(/\s/g, ' '), '734 385'); // the group separator is a no-break space
  assert.equal(formatRating({ value: 3, count: 12 }).count, '12');
});
