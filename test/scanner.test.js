import test from 'node:test';
import assert from 'node:assert/strict';
import { createDedupe, isbnFromBarcode, loadZxing } from '../src/scanner.js';

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

test('createDedupe reports a repeat within the window and renews it on every sighting', () => {
  let t = 0;
  const isDuplicate = createDedupe(3000, () => t);
  assert.equal(isDuplicate('a'), false);
  t = 1000;
  assert.equal(isDuplicate('a'), true);
  t = 3500; // 2500 ms after the last sighting: still the same sighting run
  assert.equal(isDuplicate('a'), true);
  t = 7000; // out of view for 3500 ms
  assert.equal(isDuplicate('a'), false);
});

test('createDedupe tracks each key separately', () => {
  const isDuplicate = createDedupe(3000, () => 0);
  assert.equal(isDuplicate('a'), false);
  assert.equal(isDuplicate('b'), false);
  assert.equal(isDuplicate('a'), true);
});
