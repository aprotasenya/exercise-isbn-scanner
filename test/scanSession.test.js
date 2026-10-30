import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startScanner } from '../src/scanner.js';
import { createScanSession } from '../src/scanSession.js';

const BOOK = '9786171299412';
const OTHER = '9780747532699';

// The zxing stand-in: `see(text)` plays a frame in which that barcode was read; `ready()` lets a pending camera start finish.
function setup({ inList = [], limit = 10, failWith = null, held = false } = {}) {
  let callback;
  let release;
  const camera = { stopped: false };
  const zxing = {
    BrowserMultiFormatOneDReader: class {
      async decodeFromConstraints(constraints, video, onResult) {
        if (held) await new Promise((resolve) => { release = resolve; });
        if (failWith) throw Object.assign(new Error('no camera'), { name: failWith });
        callback = onResult;
        return { stop: () => { camera.stopped = true; } };
      }
    },
  };
  const list = [...inList];
  const outcomes = [];
  const tracked = [];
  const session = createScanSession({
    start: (handlers) => startScanner({}, { zxing, ...handlers }),
    scanned: { has: (isbn) => list.includes(isbn), isFull: () => list.length >= limit },
    track: (name, fields) => tracked.push([name, fields]),
    onOutcome: (outcome) => outcomes.push(outcome),
  });
  const types = () => outcomes.map((o) => o.type);
  return { session, camera, outcomes, tracked, types, list, see: (text) => callback({ getText: () => text }), ready: () => release() };
}

// fake timers for the whole test; the camera start settles on microtasks, which they do not touch
async function timed(body) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    await body();
  } finally {
    mock.timers.reset();
  }
}

test('a single scan waits out the minimum open time, beeps, closes, and reports the book once', () => timed(async () => {
  const s = setup();
  await s.session.open();
  assert.equal(s.session.active, true);
  s.see(BOOK);
  mock.timers.tick(299);
  assert.deepEqual(s.types(), ['opened']);
  mock.timers.tick(1);
  assert.deepEqual(s.outcomes.slice(1), [{ type: 'beep', kind: 'new' }, { type: 'closed' }, { type: 'found', isbn: BOOK, again: false }]);
  assert.equal(s.session.active, false);
  assert.equal(s.camera.stopped, true);
  assert.deepEqual(s.tracked, [['scan_start', { mode: 'one' }], ['scan_ok', { mode: 'one', ms: 300 }]]);
}));

test('a single scan of a book already in Scanned beeps low and says so', () => timed(async () => {
  const s = setup({ inList: [BOOK] });
  await s.session.open();
  s.see(BOOK);
  mock.timers.tick(300);
  assert.deepEqual(s.outcomes.find((o) => o.type === 'beep'), { type: 'beep', kind: 'again' });
  assert.deepEqual(s.outcomes.at(-1), { type: 'found', isbn: BOOK, again: true });
}));

test('a single scan with a full list beeps lowest', () => timed(async () => {
  const s = setup({ inList: [OTHER], limit: 1 });
  await s.session.open();
  s.see(BOOK);
  mock.timers.tick(300);
  assert.deepEqual(s.outcomes.find((o) => o.type === 'beep'), { type: 'beep', kind: 'full' });
}));

test('Stop while the permission prompt is open cancels the start', () => timed(async () => {
  const s = setup({ held: true });
  const opening = s.session.open();
  s.session.stop();
  s.ready();
  await opening;
  assert.equal(s.camera.stopped, true); // the camera that came up late is switched off again
  assert.equal(s.session.active, false);
  assert.deepEqual(s.types(), ['opened', 'closed']);
  assert.deepEqual(s.tracked.map(([name]) => name), ['scan_start', 'scan_stop']);
}));

test('a camera that cannot start fails once, with the reason, and the manual field is free again', () => timed(async () => {
  mock.method(console, 'error', () => {});
  const s = setup({ failWith: 'NotAllowedError' });
  await s.session.open();
  assert.deepEqual(s.types(), ['opened', 'closed', 'failed']);
  assert.deepEqual(s.tracked.at(-1), ['scan_fail', { reason: 'denied' }]);
  assert.equal(s.session.active, false);
}));

test('a failure after Stop is not reported', () => timed(async () => {
  mock.method(console, 'error', () => {});
  const s = setup({ held: true, failWith: 'NotReadableError' });
  const opening = s.session.open();
  s.session.close();
  s.ready();
  await opening;
  assert.deepEqual(s.types(), ['opened', 'closed']);
}));

test('open does nothing while a scan is on', () => timed(async () => {
  const s = setup();
  await s.session.open(true);
  await s.session.open(true);
  assert.deepEqual(s.tracked, [['scan_start', { mode: 'series' }]]);
}));

test('a series adds each new book once; the same barcode in view is a repeat inside the duplicate window', () => timed(async () => {
  const s = setup();
  await s.session.open(true);
  s.see(BOOK);
  s.see(BOOK);
  mock.timers.tick(2900);
  s.see(BOOK); // each sighting renews the window
  mock.timers.tick(2900);
  s.see(BOOK);
  assert.equal(s.outcomes.filter((o) => o.type === 'added').length, 1);
  assert.deepEqual(s.outcomes.filter((o) => o.type === 'added'), [{ type: 'added', isbn: BOOK, again: false }]);
  assert.deepEqual(s.outcomes.filter((o) => o.type === 'beep'), [{ type: 'beep', kind: 'new' }]);
  assert.equal(s.outcomes.some((o) => o.type === 'hint'), false); // fresh: it never flips to "Already scanned"
}));

test('after 3 s out of view the same book is added again as already scanned', () => timed(async () => {
  const s = setup();
  await s.session.open(true);
  s.see(BOOK);
  s.list.push(BOOK); // the page added it
  mock.timers.tick(3001);
  s.see(BOOK);
  assert.deepEqual(s.outcomes.filter((o) => o.type === 'added'), [{ type: 'added', isbn: BOOK, again: false }, { type: 'added', isbn: BOOK, again: true }]);
  assert.deepEqual(s.outcomes.at(-1), { type: 'added', isbn: BOOK, again: true });
  assert.ok(s.outcomes.some((o) => o.type === 'hint' && o.kind === 'already'));
}));

test('a repeat of a listed book flips to "Already scanned" once: one hint, one bump, one low beep', async () => {
  // drive the session's handlers directly: the sighting rules do not depend on the camera
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    let handlers;
    const outcomes = [];
    const session = createScanSession({
      start: async (h) => { handlers = h; return () => {}; },
      scanned: { has: () => true, isFull: () => false },
      track: () => {},
      onOutcome: (o) => outcomes.push(o),
    });
    await session.open(true);
    handlers.onRepeat(BOOK);
    handlers.onRepeat(BOOK);
    handlers.onRepeat(BOOK);
    assert.deepEqual(outcomes.slice(1), [{ type: 'hint', kind: 'already', isbn: BOOK }, { type: 'bump', isbn: BOOK }, { type: 'beep', kind: 'again' }]);
    mock.timers.tick(2001); // out of view for a moment: the message goes
    assert.equal(outcomes.at(-1).type, 'hintCleared');
    handlers.onRepeat(BOOK);
    assert.equal(outcomes.filter((o) => o.type === 'bump').length, 2); // a new run
  } finally {
    mock.timers.reset();
  }
});

test('a repeat of a book that is not in Scanned is ignored', async () => {
  const outcomes = [];
  let handlers;
  const session = createScanSession({
    start: async (h) => { handlers = h; return () => {}; },
    scanned: { has: () => false, isFull: () => false },
    track: () => {},
    onOutcome: (o) => outcomes.push(o),
  });
  await session.open(true);
  handlers.onRepeat(BOOK);
  assert.deepEqual(outcomes.map((o) => o.type), ['opened']);
});

test('a series with a full list beeps lowest and still reports the book', () => timed(async () => {
  const s = setup({ inList: [OTHER], limit: 1 });
  await s.session.open(true);
  s.see(BOOK);
  assert.deepEqual(s.outcomes.slice(1), [{ type: 'beep', kind: 'full' }, { type: 'added', isbn: BOOK, again: false }]);
}));

test('a barcode that is not a book hints once and the hint clears after it leaves the view', () => timed(async () => {
  const s = setup();
  await s.session.open(true);
  s.see('4006381333931');
  s.see('4006381333931');
  mock.timers.tick(1500);
  s.see('4006381333931'); // still in view: the timer starts over
  mock.timers.tick(1500);
  assert.deepEqual(s.outcomes.slice(1), [{ type: 'hint', kind: 'not-book' }]);
  mock.timers.tick(501);
  assert.deepEqual(s.types(), ['opened', 'hint', 'hintCleared']);
}));

test('Stop reports the length and the count, and clears a hint that is showing', () => timed(async () => {
  const s = setup();
  await s.session.open(true);
  s.see(BOOK);
  mock.timers.tick(1000);
  s.see('4006381333931');
  s.session.stop();
  assert.deepEqual(s.tracked.at(-1), ['scan_stop', { ms: 1000, found: 1 }]);
  assert.deepEqual(s.types().slice(-2), ['hintCleared', 'closed']);
}));

test('close with nothing open still reports closed, and nothing else', () => {
  const s = setup();
  s.session.close();
  assert.deepEqual(s.outcomes, [{ type: 'closed' }]);
});
