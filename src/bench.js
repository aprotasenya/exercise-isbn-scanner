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

// A is what the app did before; each next config changes one thing. `decoder`: zxing = the JS port in the app,
// native = the browser's own BarcodeDetector (Chrome/Android), wasm = zxing-cpp in WebAssembly (vendor/barcode-detector.js).
const CONFIGS = {
  'A before (zxing, 500 ms)': { decoder: 'zxing', delay: 500 },
  'B 1080p': { decoder: 'zxing', delay: 500, video: HD },
  'C 1080p + autofocus': { decoder: 'zxing', delay: 500, video: FOCUSED },
  'D C + 250 ms loop': { decoder: 'zxing', delay: 250, video: FOCUSED },
  'F wasm, 250 ms': { decoder: 'wasm', delay: 250, video: FOCUSED },
};
if ('BarcodeDetector' in window) CONFIGS['E native, 250 ms'] = { decoder: 'native', delay: 250, video: FOCUSED };

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

let wasm; // the WebAssembly detector, made once
async function wasmDetector() {
  if (!wasm) {
    const { BarcodeDetector, setZXingModuleOverrides } = await import('../vendor/barcode-detector.js');
    setZXingModuleOverrides({ locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL('../vendor/zxing_reader.wasm', import.meta.url).href : prefix + path) });
    wasm = new BarcodeDetector({ formats: ['ean_13'] });
    await wasm.detect(document.createElement('canvas')).catch(() => {}); // loads and compiles the module now, not during the timed run
  }
  return wasm;
}

// Starts decoding `video` with the config's decoder. Returns { hit, stop, stats }: `hit` settles with the time of the first book barcode.
async function startDecoder({ decoder, delay }) {
  const stats = { attempts: 0, detectMs: [] };
  let active = true;
  if (decoder === 'zxing') {
    const { BrowserMultiFormatOneDReader } = await loadZxing();
    const reader = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: delay });
    let found;
    const hit = new Promise((resolve) => { found = resolve; });
    const controls = await reader.decodeFromVideoElement(video, (result) => {
      stats.attempts += 1;
      if (result && isbnFromBarcode(result.getText())) found(performance.now());
    });
    return { hit, stats, stop: () => controls.stop() };
  }
  const detector = decoder === 'native' ? new BarcodeDetector({ formats: ['ean_13'] }) : await wasmDetector();
  const hit = (async () => {
    while (active) {
      const began = performance.now();
      const codes = await detector.detect(video).catch(() => []);
      stats.detectMs.push(performance.now() - began);
      stats.attempts += 1;
      if (codes.some((code) => isbnFromBarcode(code.rawValue))) return performance.now();
      await sleep(delay);
    }
    return null;
  })();
  return { hit, stats, stop: () => { active = false; } };
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

async function run(name, note) {
  const config = CONFIGS[name];
  const row = { name, note, ok: false };
  let stream;
  let decoder;
  try {
    const prepared = performance.now();
    if (config.decoder === 'wasm') await wasmDetector();
    row.prepMs = Math.round(performance.now() - prepared);
    const started = performance.now();
    stream = await Promise.race([openCamera(config.video), timeout(CAMERA_TIMEOUT_MS, 'the camera did not start')]);
    row.cameraMs = Math.round(performance.now() - started);
    const playing = performance.now();
    decoder = await startDecoder(config);
    const hitAt = await Promise.race([decoder.hit, sleep(TIMEOUT_MS).then(() => null)]);
    row.ok = hitAt !== null;
    row.decodeMs = row.ok ? Math.round(hitAt - playing) : null;
    row.perSecond = +(decoder.stats.attempts / (((hitAt ?? performance.now()) - playing) / 1000)).toFixed(1);
    row.detectMs = decoder.stats.detectMs.length ? Math.round(median(decoder.stats.detectMs)) : null;
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
  const lines = ['config | note | runs | found | median ms to decode | attempts/s | detect ms | camera start ms | size | focus | prep ms (first run)'];
  const groups = new Map();
  for (const r of runs) {
    const key = `${r.name}\u0000${r.note}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const mine of groups.values()) {
    const good = mine.filter((r) => !r.error);
    const ok = good.filter((r) => r.ok);
    const failed = mine.length - good.length;
    lines.push([mine[0].name, mine[0].note || '-', `${mine.length}${failed ? ` (${failed} camera errors)` : ''}`, `${ok.length}/${good.length}`,
      median(ok.map((r) => r.decodeMs)), median(good.map((r) => r.perSecond)), median(good.map((r) => r.detectMs).filter((x) => x !== null)),
      median(good.map((r) => r.cameraMs)), good[0]?.size ?? '-', good[0]?.focus ?? '-', mine[0].prepMs ?? '-'].join(' | '));
  }
  const last = runs.at(-1);
  $('out').textContent = `${lines.join('\n')}\n\nUA: ${navigator.userAgent}${last?.error ? `\nLast run failed: ${last.error}` : ''}`;
}

$('run').onclick = async () => {
  $('run').disabled = true;
  $('cfg').disabled = true;
  runs.push(await run($('cfg').value, $('note').value.trim().slice(0, 30)));
  save();
  report();
  await sleep(COOLDOWN_MS);
  $('run').disabled = false;
  $('cfg').disabled = false;
};
$('copy').onclick = () => navigator.clipboard?.writeText($('out').textContent);
$('clear').onclick = () => {
  if (!confirm('Delete all results?')) return;
  runs.length = 0;
  save();
  $('out').textContent = '';
};
if (runs.length) report();
