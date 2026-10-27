import { isValidIsbn, normalizeIsbn } from './isbn.js';

// Book barcodes are EAN-13 codes starting with 978/979 (Bookland). Other barcodes
// (e.g. an ordinary product code on a bookmark) are not ISBNs.
export function isbnFromBarcode(text) {
  const code = normalizeIsbn(text ?? '');
  return /^97[89]\d{10}$/.test(code) && isValidIsbn(code) ? code : null;
}

// Barcodes stay in frame for many decode callbacks. `isDuplicate(key)` is true when `key`
// was seen less than `ms` ago; every sighting renews the window, so a book held in front
// of the camera is reported once, and again only after it has been out of view for `ms`.
export function createDedupe(ms, now = Date.now) {
  const lastSeen = new Map();
  return (key) => {
    const t = now();
    const previous = lastSeen.get(key);
    lastSeen.set(key, t);
    return previous !== undefined && t - previous < ms;
  };
}

// The library tries a frame every 500 ms by default. Measured on a webcam (bench.html): 500 ms found a book in ~510 ms,
// 100 ms in ~240 ms, but 100 ms felt too fast on a phone, so this is the middle.
const SCAN_INTERVAL_MS = 250;

// Without constraints a phone gives a 480x640 picture, in which a barcode in dim light often does not decode (bench.html on an
// iPhone 13: 9 of 13 found, against 81 of 81 at 1080x1920). All are `ideal`, so a camera that can't do them still starts.
const VIDEO = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] };

let zxingLoaded;

// The barcode library is large, so it is only fetched when scanning is first requested.
export function loadZxing() {
  zxingLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/zxing-browser.min.js';
    // On failure, drop the tag and the cached promise so the next Scan press retries cleanly.
    const fail = (message) => {
      script.remove();
      zxingLoaded = undefined;
      reject(new Error(message));
    };
    script.onload = () => (globalThis.ZXingBrowser
      ? resolve(globalThis.ZXingBrowser)
      : fail('Barcode library loaded but did not define ZXingBrowser'));
    script.onerror = () => fail('Could not load the barcode library');
    document.head.append(script);
  });
  return zxingLoaded;
}

// Starts the camera in `video` and resolves to a function that stops it.
// By default the first book ISBN ends the scan; with `continuous`, `onIsbn` keeps firing
// for each newly seen book and `onRepeat` for every further sighting of a book still in view. Rejects if the library cannot load or the camera is
// denied/unavailable.
export async function startScanner(video, { onIsbn, onUnrecognized, onRepeat, continuous = false }) {
  const { BrowserMultiFormatOneDReader } = await loadZxing();
  const reader = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: SCAN_INTERVAL_MS });
  let done = false;
  const isDuplicate = createDedupe(3000);
  const controls = await reader.decodeFromConstraints({ video: VIDEO }, video, (result) => {
    // Called for every frame; `result` is only set when a barcode was decoded.
    if (!result || done) return;
    const isbn = isbnFromBarcode(result.getText());
    if (isbn && continuous) {
      if (isDuplicate(isbn)) onRepeat?.(isbn); // the same book is still in view
      else onIsbn(isbn);
    } else if (isbn) {
      done = true;
      onIsbn(isbn);
    } else {
      onUnrecognized();
    }
  });
  return () => {
    done = true;
    controls.stop();
  };
}
