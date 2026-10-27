import test from 'node:test';
import assert from 'node:assert/strict';
import { bucket, createStats, describeClient } from '../src/stats.js';

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const URL_ = 'https://worker.test';
const make = (options = {}) => {
  const sent = [];
  const stats = createStats({ url: URL_, storage: fakeStorage(), send: (endpoint, body) => sent.push({ endpoint, body: JSON.parse(body) }), setTimer: () => 1, ...options });
  return { stats, sent };
};

test('the id is 8 hex digits, made once and kept', () => {
  const storage = fakeStorage();
  const first = createStats({ url: URL_, storage });
  assert.match(first.id, /^[0-9a-f]{8}$/);
  assert.equal(createStats({ url: URL_, storage }).id, first.id);
  assert.notEqual(createStats({ url: URL_, storage: fakeStorage({ 'isbn-reader.id': 'junk' }) }).id, 'junk');
});

test('the dev flag: #dev sets it, #nodev clears it, localhost is always dev', () => {
  const storage = fakeStorage();
  assert.equal(createStats({ url: URL_, storage, hostname: 'oleprota.github.io' }).dev, false);
  assert.equal(createStats({ url: URL_, storage, hash: '#dev' }).dev, true);
  assert.equal(createStats({ url: URL_, storage }).dev, true); // remembered
  assert.equal(createStats({ url: URL_, storage, hash: '#nodev' }).dev, false);
  assert.equal(createStats({ url: URL_, storage, hostname: 'localhost' }).dev, true);
});

test('events go out in one batch with the id and dev flag, each with its age', () => {
  const { stats, sent } = make({ hash: '#dev' });
  stats.track('star', { on: 1 });
  stats.track('search', { via: 'typed', ok: 1 });
  assert.equal(sent.length, 0); // nothing leaves until the flush
  stats.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, `${URL_}/event`);
  const { id, dev, events } = sent[0].body;
  assert.equal(id, stats.id);
  assert.equal(dev, 1);
  assert.deepEqual(events.map(({ name, on, via, ok }) => [name, on, via, ok]), [['star', 1, undefined, undefined], ['search', undefined, 'typed', 1]]);
  assert.ok(events.every((e) => e.ago >= 0 && !('at' in e)));
  stats.flush();
  assert.equal(sent.length, 1); // an empty queue sends nothing
});

test('a batch holds 20 events, and the queue keeps the newest 50', () => {
  const { stats, sent } = make();
  for (let i = 0; i < 60; i++) stats.track('star', { on: i });
  stats.flush();
  assert.deepEqual(sent.map((s) => s.body.events.length), [20, 20, 10]);
  assert.equal(sent[0].body.events[0].on, 10);
});

test('no service address or Do Not Track: nothing is queued or sent', () => {
  for (const options of [{ url: '' }, { doNotTrack: true }]) {
    const { stats, sent } = make(options);
    stats.track('star', { on: 1 });
    stats.flush();
    assert.equal(stats.enabled, false);
    assert.equal(sent.length, 0);
  }
});

test('blocked storage or a failing send never throws', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const stats = createStats({ url: URL_, storage: broken, hash: '#dev', send() { throw new Error('offline'); }, setTimer: () => 1 });
  stats.track('star', { on: 1 });
  stats.flush();
  assert.match(stats.id, /^[0-9a-f]{8}$/);
  assert.equal(createStats({ url: URL_, storage: null }).enabled, true);
});

test('the timer flushes after the first event only once', () => {
  const timers = [];
  const { stats, sent } = make({ setTimer: (fn, ms) => timers.push([fn, ms]) });
  stats.track('star', { on: 1 });
  stats.track('star', { on: 0 });
  assert.equal(timers.length, 1);
  timers[0][0]();
  assert.equal(sent.length, 1);
});

test('describes the device and browser', () => {
  const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const chromeAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
  const chromeIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0';
  assert.deepEqual(describeClient(ios), { os: 'ios', browser: 'safari' });
  assert.deepEqual(describeClient(chromeAndroid), { os: 'android', browser: 'chrome' });
  assert.deepEqual(describeClient(chromeIos), { os: 'ios', browser: 'chrome' });
  assert.deepEqual(describeClient(mac), { os: 'mac', browser: 'safari' });
  assert.deepEqual(describeClient(mac, 5), { os: 'ios', browser: 'safari' }); // an iPad asking for the desktop site
  assert.deepEqual(describeClient(edge), { os: 'windows', browser: 'edge' });
  assert.deepEqual(describeClient(''), { os: 'other', browser: 'other' });
});

test('list sizes are bucketed', () => {
  assert.deepEqual([0, 1, 9, 10, 49, 50, 1000].map(bucket), ['0', '1-9', '1-9', '10-49', '10-49', '50+', '50+']);
});
