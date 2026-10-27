# Vendored libraries

- `zxing-browser.min.js`: [@zxing/browser](https://github.com/zxing-js/browser) 0.2.1 UMD bundle (global `ZXingBrowser`), Apache-2.0 license.
  Source: https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js
  SHA-256: `066bc34edfcdd4a33f0964aeec967752a0dea1ccaf36e58e319ac9fcb5070f6a`
- `barcode-detector.js` and `zxing_reader.wasm`: used by `bench.html` only (the app does not load them yet). [barcode-detector](https://github.com/Sec-ant/barcode-detector) 3.2.3 (MIT, `BarcodeDetector` API over zxing-cpp) with [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6 (MIT; zxing-cpp is Apache-2.0), bundled into one ES module with `esbuild --bundle --format=esm --minify` from `export { BarcodeDetector } from 'barcode-detector/ponyfill'; export { setZXingModuleOverrides } from 'zxing-wasm/reader'`. The `.wasm` is `zxing-wasm/dist/reader/zxing_reader.wasm` unchanged (it is fetched from `vendor/`, not from a CDN: see `locateFile` in `src/bench.js`).
  SHA-256: `barcode-detector.js` `c8543c66c1655ae3bbf3eb2b477d26c3d0537a0707e3dedf291fadc0d63d9421`, `zxing_reader.wasm` `5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e`.
