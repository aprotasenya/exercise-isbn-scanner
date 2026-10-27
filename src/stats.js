// Anonymous usage counts, sent to the lookup service (POST /event): what is used and what fails, never a
// book, ISBN, title or name. `id` is a random number made on first run and kept in this browser; it
// is shown at the bottom of the page. The developer's own use is flagged `dev` (open the app with #dev once,
// #nodev to undo; localhost is always dev), so that it can be left out of real counts. Nothing here may
// throw or slow the page: events wait in a small queue and go out in a batch when the page is hidden or after a while.
const ID_KEY = 'isbn-reader.id';
const DEV_KEY = 'isbn-reader.dev';
const FLUSH_MS = 30000;
const MAX_QUEUE = 50;
const BATCH = 20; // same as the service's limit per request

const attempt = (action) => {
  try {
    return action();
  } catch {
    return null; // storage blocked or full: a new id next time, no worse
  }
};

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, '0')).join('');

// What kind of device and browser this is, from the user agent (Vivaldi and Brave look like Chrome, an iPad asking for the desktop site like a Mac).
export function describeClient(ua = '', touchPoints = 0) {
  let os = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Macintosh/.test(ua) ? 'mac' : /Linux|CrOS/.test(ua) ? 'linux' : 'other';
  if (os === 'mac' && touchPoints > 1) os = 'ios';
  const browser = /Edg|EdgA|EdgiOS/.test(ua) ? 'edge' : /OPR|Opera/.test(ua) ? 'opera' : /Firefox|FxiOS/.test(ua) ? 'firefox' : /Chrome|CriOS/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'other';
  return { os, browser };
}

export const bucket = (n) => (n === 0 ? '0' : n < 10 ? '1-9' : n < 50 ? '10-49' : '50+');

const beacon = (endpoint, body) => navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'text/plain' })); // text/plain needs no CORS preflight

// `url`: the service's address ('' = no stats); `hash`/`hostname`: the page's, for the dev flag; `send(endpoint, body)`.
export function createStats({ url, storage, hash = '', hostname = '', doNotTrack = false, send = beacon, setTimer = setTimeout }) {
  let id = attempt(() => storage.getItem(ID_KEY));
  if (!/^[0-9a-f]{8}$/.test(id ?? '')) {
    id = newId();
    attempt(() => storage.setItem(ID_KEY, id));
  }
  if (hash === '#dev') attempt(() => storage.setItem(DEV_KEY, '1'));
  if (hash === '#nodev') attempt(() => storage.removeItem(DEV_KEY));
  const dev = attempt(() => storage.getItem(DEV_KEY)) === '1' || ['localhost', '127.0.0.1'].includes(hostname);
  const enabled = Boolean(url) && !doNotTrack;

  const queue = [];
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    const now = Date.now();
    while (queue.length) {
      const events = queue.splice(0, BATCH).map(({ at, ...event }) => ({ ...event, ago: now - at }));
      attempt(() => send(`${url}/event`, JSON.stringify({ id, dev: dev ? 1 : 0, events })));
    }
  }

  function track(name, fields = {}) {
    if (!enabled) return;
    queue.push({ name, ...fields, at: Date.now() });
    if (queue.length > MAX_QUEUE) queue.shift();
    timer ??= setTimer(flush, FLUSH_MS);
  }

  return { id, dev, enabled, track, flush };
}
