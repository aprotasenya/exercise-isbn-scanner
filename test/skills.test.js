import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as strings from '../src/strings.js';

// The verify skills name expected UI texts as `S.group.key` (S = src/strings.js): a renamed or removed string must fail here, not in a browser run.
const placeholders = new Set(['S.group.key', 'S.fn']); // how common.md explains the notation

const markdown = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? markdown(path) : name.endsWith('.md') ? [path] : [];
  });

test('every S.* reference in the verify skills exists in strings.js', () => {
  const missing = [];
  for (const file of markdown(fileURLToPath(new URL('../.claude/skills', import.meta.url)))) {
    for (const [, ref] of readFileSync(file, 'utf8').matchAll(/(?<![\w.])(S(?:\.[A-Za-z_]\w*)+)/g)) {
      if (placeholders.has(ref)) continue;
      const found = ref.split('.').slice(1).reduce((o, key) => o?.[key], strings);
      if (found === undefined) missing.push(`${file.split('.claude/')[1]}: ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});
