import test from 'node:test';
import assert from 'node:assert/strict';
import { isbnFromBarcode, loadZxing } from '../src/scanner.js';

test('accepts book EAN-13 barcodes (978 and 979)', () => {
  assert.equal(isbnFromBarcode('9780747532699'), '9780747532699');
  assert.equal(isbnFromBarcode('9791032305690'), '9791032305690');
});

test('ignores EAN-13 barcodes that are not books', () => {
  assert.equal(isbnFromBarcode('4006381333931'), null);
});

test('ignores a bad checksum', () => {
  assert.equal(isbnFromBarcode('9780747532698'), null);
});

test('ignores wrong lengths, letters and empty input', () => {
  assert.equal(isbnFromBarcode('978074753269'), null);
  assert.equal(isbnFromBarcode('978074753269X'), null);
  assert.equal(isbnFromBarcode('0747532699'), null);
  assert.equal(isbnFromBarcode(''), null);
  assert.equal(isbnFromBarcode(undefined), null);
});

// loadZxing touches the DOM, so run it against a minimal fake document. `behavior`
// decides what each appended <script> does: fail, load without the global, or load fine.
function fakeDocument(behavior) {
  const scripts = new Set();
  globalThis.document = {
    createElement: () => ({ remove() { scripts.delete(this); } }),
    head: {
      append(script) {
        scripts.add(script);
        queueMicrotask(() => behavior(script));
      },
    },
  };
  return scripts;
}

test('a failed library load removes its script tag and can be retried', async (t) => {
  t.after(() => { delete globalThis.document; delete globalThis.ZXingBrowser; });
  let attempts = 0;
  const scripts = fakeDocument((script) => {
    attempts++;
    if (attempts === 1) return script.onerror();
    globalThis.ZXingBrowser = { ok: true };
    script.onload();
  });
  await assert.rejects(loadZxing(), /Could not load/);
  assert.equal(scripts.size, 0);
  assert.deepEqual(await loadZxing(), { ok: true });
  assert.equal(attempts, 2);
  assert.equal(scripts.size, 1);
});

test('a bundle that does not define the global is rejected, not cached', async (t) => {
  t.after(() => { delete globalThis.document; delete globalThis.ZXingBrowser; });
  // The previous test cached a successful load; reset by re-importing a fresh module copy.
  const fresh = await import('../src/scanner.js?fresh');
  let attempts = 0;
  const scripts = fakeDocument((script) => {
    attempts++;
    if (attempts === 2) globalThis.ZXingBrowser = { ok: true };
    script.onload();
  });
  await assert.rejects(fresh.loadZxing(), /did not define ZXingBrowser/);
  assert.equal(scripts.size, 0);
  assert.deepEqual(await fresh.loadZxing(), { ok: true });
});
