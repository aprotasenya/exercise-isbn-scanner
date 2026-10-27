// Measures the scanner in a real camera: time to the first book barcode and decode attempts per second.
// Not part of the app (not linked from index.html); open bench.html over https or localhost.
import { isbnFromBarcode, loadZxing } from './scanner.js';

const TIMEOUT_MS = 15000;
const HD = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
const AUTOFOCUS = { advanced: [{ focusMode: 'continuous' }] };

// A is what the app does today; each next config adds one change.
const CONFIGS = {
  'A current': { video: undefined, options: undefined },
  'B 1080p': { video: HD },
  'C 1080p + autofocus': { video: { ...HD, ...AUTOFOCUS } },
  'D C + 100 ms loop': { video: { ...HD, ...AUTOFOCUS }, options: { delayBetweenScanAttempts: 100 } },
};

const $ = (id) => document.getElementById(id);
const video = $('v');
const runs = [];

for (const name of Object.keys(CONFIGS)) $('cfg').add(new Option(name));

async function run(name) {
  const { video: constraints, options } = CONFIGS[name];
  const { BrowserMultiFormatOneDReader } = await loadZxing();
  const reader = new BrowserMultiFormatOneDReader(undefined, options);
  const started = performance.now();
  let attempts = 0;
  let decodedAt = null;
  let controls;
  const decoded = new Promise((resolve) => {
    const callback = (result) => {
      attempts += 1;
      if (result && isbnFromBarcode(result.getText())) resolve(performance.now());
    };
    const start = constraints
      ? reader.decodeFromConstraints({ video: constraints }, video, callback)
      : reader.decodeFromVideoDevice(undefined, video, callback);
    start.then((c) => { controls = c; }, () => resolve(null));
    setTimeout(() => resolve(null), TIMEOUT_MS);
  });
  // A denied camera resolves `decoded` with null and never reaches `playing`.
  await Promise.race([decoded, new Promise((resolve) => video.addEventListener('playing', resolve, { once: true }))]);
  const cameraMs = Math.round(performance.now() - started);
  const playing = performance.now();
  decodedAt = await decoded;
  const track = video.srcObject?.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};
  controls?.stop();
  return {
    name,
    ok: decodedAt !== null,
    cameraMs,
    decodeMs: decodedAt === null ? null : Math.round(decodedAt - playing),
    perSecond: +(attempts / ((decodedAt ?? performance.now()) - playing) * 1000).toFixed(1),
    size: `${settings.width}x${settings.height}`,
    focus: settings.focusMode ?? 'n/a',
  };
}

const median = (xs) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : '-');

function report() {
  const lines = ['config | runs | found | median ms to decode | attempts/s | camera start ms | size | focus'];
  for (const name of Object.keys(CONFIGS)) {
    const mine = runs.filter((r) => r.name === name);
    if (!mine.length) continue;
    const ok = mine.filter((r) => r.ok);
    lines.push([name, mine.length, `${ok.length}/${mine.length}`, median(ok.map((r) => r.decodeMs)),
      median(mine.map((r) => r.perSecond)), median(mine.map((r) => r.cameraMs)),
      mine[0].size, mine[0].focus].join(' | '));
  }
  $('out').textContent = `${lines.join('\n')}\n\nUA: ${navigator.userAgent}`;
}

$('run').onclick = async () => {
  $('run').disabled = true;
  try {
    runs.push(await run($('cfg').value));
  } catch (error) {
    $('out').textContent = String(error);
  }
  $('run').disabled = false;
  if (runs.length) report();
};
$('copy').onclick = () => navigator.clipboard?.writeText($('out').textContent);
