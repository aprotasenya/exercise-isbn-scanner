import { isValidIsbn, normalizeIsbn } from './isbn.js';

// Book barcodes are EAN-13 codes starting with 978/979 (Bookland). Other barcodes
// (e.g. an ordinary product code on a bookmark) are not ISBNs.
export function isbnFromBarcode(text) {
  const code = normalizeIsbn(text ?? '');
  return /^97[89]\d{10}$/.test(code) && isValidIsbn(code) ? code : null;
}

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
// Rejects if the library cannot load or the camera is denied/unavailable.
export async function startScanner(video, { onIsbn, onUnrecognized }) {
  const { BrowserMultiFormatOneDReader } = await loadZxing();
  const reader = new BrowserMultiFormatOneDReader();
  let done = false;
  const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
    // Called for every frame; `result` is only set when a barcode was decoded.
    if (!result || done) return;
    const isbn = isbnFromBarcode(result.getText());
    if (isbn) {
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
