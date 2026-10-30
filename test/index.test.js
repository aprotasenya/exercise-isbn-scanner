import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

test('every id app.js looks up exists in index.html', () => {
  const wanted = [...app.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  // The list ids are built from a template: getElementById(`${id}-count`), copy-${id}, …
  for (const list of ['scanned', 'marked']) {
    wanted.push(list, `${list}-count`, `${list}-list`, `${list}-empty`, `copy-${list}`, `clear-${list}`);
  }
  assert.ok(wanted.length >= 25);
  assert.deepEqual(wanted.filter((id) => !ids.has(id)), []);
});
