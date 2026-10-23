import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, loadTheme, nextTheme, saveTheme } from '../src/theme.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

test('cycles auto → light → dark → auto', () => {
  assert.equal(nextTheme('auto'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'auto');
  assert.equal(nextTheme('garbage'), 'auto');
});

test('stores light and dark, and stores nothing for auto', () => {
  const storage = fakeStorage();
  saveTheme(storage, 'dark');
  assert.equal(loadTheme(storage), 'dark');
  saveTheme(storage, 'light');
  assert.equal(loadTheme(storage), 'light');
  saveTheme(storage, 'auto');
  assert.deepEqual(storage.data, {});
  assert.equal(loadTheme(storage), 'auto');
});

test('an unknown stored value or blocked storage means auto', () => {
  assert.equal(loadTheme(fakeStorage({ 'isbn-reader.theme': 'purple' })), 'auto');
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(loadTheme(broken), 'auto');
  assert.doesNotThrow(() => saveTheme(broken, 'dark'));
  assert.equal(loadTheme(null), 'auto');
  assert.doesNotThrow(() => saveTheme(null, 'dark'));
});

test('applyTheme sets or removes the data-theme attribute', () => {
  const root = { dataset: {} };
  applyTheme(root, 'dark');
  assert.equal(root.dataset.theme, 'dark');
  applyTheme(root, 'auto');
  assert.equal('theme' in root.dataset, false);
});
