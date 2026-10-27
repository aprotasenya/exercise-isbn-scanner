// Measures the scanner in a real camera: time to the first book barcode and decode attempts per second.
// Not part of the app (not linked from index.html); open bench.html over https or localhost.
// Results are kept in localStorage, so a page reload (a stuck camera) does not lose them.
import { isbnFromBarcode, loadZxing } from './scanner.js';

const TIMEOUT_MS = 15000;
const CAMERA_TIMEOUT_MS = 10000;
const COOLDOWN_MS = 500; // the camera needs a moment after it is released before it can be opened again
const KEY = 'isbn-reader.bench';
const HD = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
const FOCUSED = { ...HD, advanced: [{ focusMode: 'continuous' }] };

const HOLD_MS = 5000; // "hold" mode: the barcode stays in view and every frame the decoder can take is counted

// A is what the app did before; each next config changes one thing. D is what the app does now. (A native BarcodeDetector
// and zxing-cpp in WebAssembly were benched against D on an iPhone and an Android phone and were not better: see the git history.)
const CONFIGS = {
  'A before (zxing, 500 ms)': { delay: 500 },
  'B 1080p': { delay: 500, video: HD },
  'C 1080p + autofocus': { delay: 500, video: FOCUSED },
  'D C + 250 ms loop': { delay: 250, video: FOCUSED },
};

const $ = (id) => document.getElementById(id);
const video = $('v');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = (ms, message) => sleep(ms).then(() => { throw new Error(message); });

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    // storage blocked: the results live until the page is closed
  }
}
const runs = load();

for (const name of Object.keys(CONFIGS).sort()) $('cfg').add(new Option(name));

// Starts decoding `video` with the config's decoder. Returns { hit, stop, stats }: `hit` settles with the time of the first book barcode.
async function startDecoder({ delay }) {
  const stats = { attempts: 0, hits: 0 };
  let found;
  const hit = new Promise((resolve) => { found = resolve; }); // the time of the first book barcode
  const seen = () => {
    stats.hits += 1;
    if (stats.hits === 1) found(performance.now());
  };
  const { BrowserMultiFormatOneDReader } = await loadZxing();
  const reader = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: delay, delayBetweenScanSuccess: delay });
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    stats.attempts += 1;
    if (result && isbnFromBarcode(result.getText())) seen();
  });
  return { hit, stats, stop: () => controls.stop() };
}

async function openCamera(constraints) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: constraints ?? { facingMode: 'environment' } });
  video.srcObject = stream;
  await video.play();
  return stream;
}

function closeCamera(stream) {
  for (const track of stream?.getTracks() ?? []) track.stop();
  video.srcObject = null;
}

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : '-');

async function run(name, note, hold) {
  const config = hold ? { ...CONFIGS[name], delay: 0 } : CONFIGS[name]; // hold: no pause between frames, to see what the decoder can do
  const row = { name, note, hold, ok: false };
  let stream;
  let decoder;
  try {
    const started = performance.now();
    stream = await Promise.race([openCamera(config.video), timeout(CAMERA_TIMEOUT_MS, 'the camera did not start')]);
    row.cameraMs = Math.round(performance.now() - started);
    const playing = performance.now();
    decoder = await startDecoder(config);
    const hitAt = hold ? (await sleep(HOLD_MS), decoder.stats.hits ? 1 : null) : await Promise.race([decoder.hit, sleep(TIMEOUT_MS).then(() => null)]);
    row.ok = hitAt !== null;
    row.decodeMs = row.ok && !hold ? Math.round(hitAt - playing) : null;
    // a run that ends after a single attempt has no rate to speak of, so only a hold gives one
    row.perSecond = hold ? +(decoder.stats.attempts / (HOLD_MS / 1000)).toFixed(1) : null;
    row.hitPercent = hold && decoder.stats.attempts ? Math.round((100 * decoder.stats.hits) / decoder.stats.attempts) : null;
    row.attempts = decoder.stats.attempts;
    const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
    row.size = `${settings.width}x${settings.height}`;
    row.focus = settings.focusMode ?? 'n/a';
  } catch (error) {
    row.error = String(error?.message ?? error);
  } finally {
    try { decoder?.stop(); } catch { /* already stopped */ }
    closeCamera(stream);
  }
  return row;
}

function report() {
  const lines = ['config | note | mode | runs | found | median ms to decode | frames decoded % | frames/s | camera start ms | size | focus'];
  const groups = new Map();
  for (const r of runs) {
    const key = `${r.name}\u0000${r.note}\u0000${Boolean(r.hold)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const mine of groups.values()) {
    const good = mine.filter((r) => !r.error);
    const ok = good.filter((r) => r.ok);
    const failed = mine.length - good.length;
    const of = (field) => median(good.map((r) => r[field]).filter((x) => x !== null && x !== undefined));
    lines.push([mine[0].name, mine[0].note || '-', mine[0].hold ? 'hold 5 s' : 'first hit', `${mine.length}${failed ? ` (${failed} camera errors)` : ''}`, `${ok.length}/${good.length}`,
      mine[0].hold ? '-' : median(ok.map((r) => r.decodeMs)), of('hitPercent'), of('perSecond'),
      median(good.map((r) => r.cameraMs)), good[0]?.size ?? '-', good[0]?.focus ?? '-'].join(' | '));
  }
  const last = runs.at(-1);
  $('out').textContent = `${lines.join('\n')}\n\nUA: ${navigator.userAgent}${last?.error ? `\nLast run failed: ${last.error}` : ''}`;
}

$('run').onclick = async () => {
  $('run').disabled = true;
  $('cfg').disabled = true;
  $('hold').disabled = true;
  runs.push(await run($('cfg').value, $('note').value.trim().slice(0, 30), $('hold').checked));
  save();
  report();
  await sleep(COOLDOWN_MS);
  $('run').disabled = false;
  $('cfg').disabled = false;
  $('hold').disabled = false;
};
$('copy').onclick = () => navigator.clipboard?.writeText($('out').textContent);
$('clear').onclick = () => {
  if (!confirm('Delete all results?')) return;
  runs.length = 0;
  save();
  $('out').textContent = '';
};
if (runs.length) report();
