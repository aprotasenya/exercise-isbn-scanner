import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { coverRect, createDedupe, frameGate, startScanner, isbnFromBarcode, loadZxing } from '../src/scanner.js';

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

test('coverRect crops a picture to fill a box without stretching, from the center', () => {
  assert.deepEqual(coverRect(1080, 1920, 400, 300), [0, 555, 1080, 810]); // a portrait picture in a 4:3 box: a band across the middle
  assert.deepEqual(coverRect(1920, 1080, 300, 400), [555, 0, 810, 1080]); // a landscape one in a portrait box: a band down the middle
  assert.deepEqual(coverRect(640, 480, 400, 300), [0, 0, 640, 480]); // the same shape: all of it
});

test('frameGate draws about the wanted number of frames a second from a camera of any speed', () => {
  const drawn = (sourceFps) => {
    const ready = frameGate(24);
    let count = 0;
    for (let t = 0; t < 10000; t += 1000 / sourceFps) if (ready(t)) count++;
    return count / 10;
  };
  assert.ok(Math.abs(drawn(30) - 24) <= 1.5, `30 fps source: ${drawn(30)}`);
  assert.ok(Math.abs(drawn(60) - 24) <= 1.5, `60 fps source: ${drawn(60)}`);
  assert.ok(Math.abs(drawn(120) - 24) <= 1.5, `120 fps source: ${drawn(120)}`);
  assert.ok(drawn(15) >= 14.9, `15 fps source: ${drawn(15)}`); // a slower source is never held back
});

test('frameGate does not hurry after a pause', () => {
  const ready = frameGate(24);
  assert.equal(ready(0), true);
  assert.equal(ready(5000), true); // a long pause...
  assert.equal(ready(5010), false); // ...is not followed by a burst of frames
});

// startScanner with a stand-in for the barcode library: `see(text)` plays a frame in which that barcode was read
function fakeCamera() {
  let callback;
  const camera = {
    stopped: false,
    zxing: {
      BrowserMultiFormatOneDReader: class {
        async decodeFromConstraints(constraints, video, onResult) {
          callback = onResult;
          return { stop: () => { camera.stopped = true; } };
        }
      },
    },
    see: (text) => callback({ getText: () => text }),
  };
  return camera;
}
const BOOK = '9786171299412';

test('a single scan read at once waits until 300 ms after the camera started, and then reports once', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const camera = fakeCamera();
    const found = [];
    await startScanner({}, { zxing: camera.zxing, onIsbn: (isbn) => found.push(isbn) });
    camera.see(BOOK);
    camera.see(BOOK); // the same barcode in the next frame
    mock.timers.tick(299);
    assert.deepEqual(found, []);
    mock.timers.tick(1);
    assert.deepEqual(found, [BOOK]);
    camera.see(BOOK);
    mock.timers.tick(1000);
    assert.deepEqual(found, [BOOK]);
  } finally {
    mock.timers.reset();
  }
});

test('Stop during the wait cancels the scan', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const camera = fakeCamera();
    const found = [];
    const stop = await startScanner({}, { zxing: camera.zxing, onIsbn: (isbn) => found.push(isbn) });
    camera.see(BOOK);
    mock.timers.tick(100);
    stop();
    mock.timers.tick(1000);
    assert.deepEqual(found, []);
    assert.equal(camera.stopped, true);
  } finally {
    mock.timers.reset();
  }
});

test('a scan after the first picture has been up for 300 ms is reported at once; a series never waits', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    let frame;
    const video = { videoWidth: 640, videoHeight: 480, requestVideoFrameCallback: (callback) => { frame = callback; } };
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, clearRect() {} }), getBoundingClientRect: () => ({ width: 300, height: 200 }) };
    const camera = fakeCamera();
    const found = [];
    await startScanner(video, { canvas, zxing: camera.zxing, onIsbn: (isbn) => found.push(isbn) });
    frame(); // the first picture is drawn: the 300 ms start here
    mock.timers.tick(300);
    camera.see(BOOK);
    mock.timers.tick(0);
    assert.deepEqual(found, [BOOK]);

    const series = fakeCamera();
    const seen = [];
    await startScanner({}, { zxing: series.zxing, continuous: true, onIsbn: (isbn) => seen.push(isbn) });
    series.see(BOOK);
    assert.deepEqual(seen, [BOOK]);
  } finally {
    mock.timers.reset();
  }
});
