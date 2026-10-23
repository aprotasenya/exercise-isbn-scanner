// Fake camera for /verify-app. Pass the arrow function below to `page.evaluate` (read this
// file and paste it into the Playwright code; the MCP sandbox has no `require`).
// It replaces navigator.mediaDevices.getUserMedia with a canvas that draws a real EAN-13
// barcode, so the app's real barcode reader decodes it. Control it from the test:
//   window.__setBarcode('9780141365466')  -> show that barcode (any valid 13-digit EAN)
//   window.__setBarcode(null)             -> blank frame, no barcode in view
() => {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const encode = (code) => {
    const d = [...code].map(Number);
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += (PARITY[d[0]][i] === 'L' ? L : G)[d[i + 1]];
    bits += '01010';
    for (let i = 7; i < 13; i++) bits += R[d[i]];
    return bits + '101';
  };
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let bits = null;
  const draw = () => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 640, 360);
    if (!bits) return;
    const m = 4;
    const x0 = (640 - bits.length * m) / 2;
    ctx.fillStyle = '#000';
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') ctx.fillRect(x0 + i * m, 80, m, 200);
  };
  window.__setBarcode = (code) => { bits = code ? encode(code) : null; draw(); };
  draw();
  setInterval(draw, 100); // keep producing frames
  navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15); // a fresh stream per Scan
};
