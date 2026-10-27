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

// The preview is for aiming, not for watching: at most this many pictures a second are drawn, however fast the camera
// (a phone set to 90 or 120 fps) or the screen is.
const PREVIEW_FPS = 30;

// A scan that finishes sooner than this after the first picture appears waits for the rest, so the camera does not
// flash open and shut on a fast read. Only a single scan waits: in a series the camera stays on anyway.
const MIN_SCAN_MS = 300;

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

// The part [x, y, width, height] of a picture w x h that fills a box cw x ch without stretching, centered (the CSS `object-fit: cover`).
export function coverRect(w, h, cw, ch) {
  const scale = Math.max(cw / w, ch / h);
  const sw = cw / scale;
  const sh = ch / scale;
  return [(w - sw) / 2, (h - sh) / 2, sw, sh];
}

// Says for each frame (its time in ms) whether to draw it, so that about `fps` a second are drawn from a source of any speed. The next
// frame is due one step after the last one was due, not after it was drawn: from a 30 fps camera this draws 4 of every 5 frames, not every 2nd.
export function frameGate(fps) {
  const step = 1000 / fps;
  let due = 0;
  return (now) => {
    if (now < due) return false;
    due = now - due > step ? now + step : due + step; // after a pause (or a slow source) start afresh: no backlog to catch up on
    return true;
  };
}

// Shows what `video` plays in `canvas`, cropped to fill it, one drawing per new frame. The <video> element itself is
// not shown: an iPhone lays it out late (the picture first at its own size, then fitted to the box), and here every
// frame is fitted to the box before it is drawn. Returns a function that stops the drawing and clears the picture.
export function drawPreview(video, canvas, onFirstFrame = () => {}) {
  const context = canvas.getContext('2d');
  const wanted = frameGate(PREVIEW_FPS);
  let stopped = false;
  let first = true;
  const next = () => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw));
  function draw() {
    if (stopped) return;
    if (video.videoWidth && video.videoHeight && wanted(performance.now())) {
      const box = canvas.getBoundingClientRect();
      const scale = Math.min(globalThis.devicePixelRatio || 1, 2); // enough sharpness for a preview, and fewer pixels to draw
      const width = Math.round(box.width * scale);
      const height = Math.round(box.height * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.drawImage(video, ...coverRect(video.videoWidth, video.videoHeight, width, height), 0, 0, width, height);
      if (first) onFirstFrame();
      first = false;
    }
    next();
  }
  next();
  return () => {
    stopped = true;
    context.clearRect(0, 0, canvas.width, canvas.height); // else the next start begins with this session's last frame
  };
}

// Starts the camera in `video` (shown in `canvas`, if given) and resolves to a function that stops it.
// By default the first book ISBN ends the scan; with `continuous`, `onIsbn` keeps firing
// for each newly seen book and `onRepeat` for every further sighting of a book still in view. Rejects if the library cannot load or the camera is
// denied/unavailable.
export async function startScanner(video, { canvas, onIsbn, onUnrecognized, onRepeat, continuous = false }) {
  const { BrowserMultiFormatOneDReader } = await loadZxing();
  const reader = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: SCAN_INTERVAL_MS });
  let done = false;
  let shownAt = null; // when the first picture appeared
  let waiting = null; // the timer of a scan that waits for MIN_SCAN_MS
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
      waiting = setTimeout(() => onIsbn(isbn), Math.max(0, MIN_SCAN_MS - (shownAt === null ? 0 : Date.now() - shownAt)));
    } else {
      onUnrecognized();
    }
  });
  const stopDrawing = canvas ? drawPreview(video, canvas, () => { shownAt = Date.now(); }) : () => {};
  return () => {
    done = true;
    clearTimeout(waiting);
    stopDrawing();
    controls.stop();
  };
}
