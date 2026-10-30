// Static dev server, no dependencies: `node scripts/serve.mjs [port]` (default 8000), serves the project root.
// Used instead of `python3 -m http.server`, whose small accept queue resets connections when a page loads
// about twenty ES modules at once.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    const body = await readFile(file); // read first: headers cannot be changed once sent
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404).end(); // a bad request must never stop the server
  }
}).listen(Number(process.argv[2]) || 8000, () => console.log(`http://localhost:${process.argv[2] || 8000}`));
