// The camera-scan lifecycle, without the page: start (a Stop pressed while the permission prompt is open
// cancels the start), one book or a series, the "still in view" rule, hints and the stats events.
// The page keeps the DOM and reacts to `onOutcome({ type, ... })`:
//   opened            the camera is about to start: show the scanner, clear the card and the field
//   closed            the scan is over, for any reason (also fired by `close()` when nothing was open)
//   hint {kind, isbn} a message tied to the barcode in view: kind 'not-book' or 'already' (with its isbn)
//   hintCleared       the barcode has left the view for a moment
//   beep {kind}       'new' | 'again' | 'full' (the list is full and the book was not added)
//   found {isbn, again}   a single scan read a book (the scan is already closed)
//   added {isbn, again}   a series read a book, new or already in Scanned
//   bump {isbn}       a book already in Scanned came back into view: move it to the top
//   failed            the camera could not start (the stats event is tracked here)
// `start(handlers)` begins the camera and resolves to its stop function (the page wraps `startScanner`).
// `scanned` is the Scanned list (`has`, `isFull`). Nothing here touches the DOM.
import { DUPLICATE_MS } from './scanner.js';

const HINT_MS = 2000; // how long a message stays after its barcode leaves the view (long enough to read)
const FAIL_REASONS = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'no_camera', NotReadableError: 'busy' };

export function createScanSession({ start, scanned, track, onOutcome }) {
  let active = false;
  let token = 0; // bumped by every open and close, so a start that was cancelled can tell
  let stopCamera = null;
  let opened = null; // { at, found }
  let hintKey = null;
  let hintTimer = null;
  // What is in front of the camera right now. A run lasts until its barcode has been out of view for a moment.
  // A book added at the start of a run is "fresh": while it is still in view it must not flip to "Already scanned".
  let run = null; // { isbn, fresh }
  let runTimer = null;

  function showHint(key, outcome) {
    if (hintKey !== key) {
      hintKey = key;
      onOutcome({ type: 'hint', ...outcome });
    }
    clearTimeout(hintTimer);
    hintTimer = setTimeout(clearHint, HINT_MS);
  }

  function clearHint() {
    clearTimeout(hintTimer);
    if (hintKey === null) return;
    hintKey = null;
    onOutcome({ type: 'hintCleared' });
  }

  const showAlreadyScanned = (isbn) => showHint(isbn, { kind: 'already', isbn });

  function touchRun(isbn, fresh) {
    if (run?.isbn !== isbn) run = { isbn, fresh };
    clearTimeout(runTimer);
    runTimer = setTimeout(() => { run = null; }, DUPLICATE_MS);
  }

  // Another sighting of a book that is still in view (or was seen moments ago).
  function sightedAgain(isbn) {
    if (run?.isbn === isbn && run.fresh) return touchRun(isbn, true);
    if (!scanned.has(isbn)) return;
    const startOfRun = hintKey !== isbn; // the "Already scanned" message is not showing yet
    touchRun(isbn, false);
    showAlreadyScanned(isbn);
    if (startOfRun) {
      onOutcome({ type: 'bump', isbn });
      onOutcome({ type: 'beep', kind: 'again' });
    }
  }

  function close() {
    token++;
    stopCamera?.();
    stopCamera = null;
    active = false;
    clearHint();
    clearTimeout(runTimer);
    run = null;
    onOutcome({ type: 'closed' });
  }

  async function open(continuous = false) {
    if (active) return;
    const mine = ++token;
    const mode = continuous ? 'series' : 'one';
    active = true;
    opened = { at: Date.now(), found: 0 };
    track('scan_start', { mode });
    onOutcome({ type: 'opened' });
    try {
      const stop = await start({
        continuous,
        onIsbn(isbn) {
          const again = scanned.has(isbn);
          const full = !again && scanned.isFull();
          opened.found++;
          track('scan_ok', { mode, ms: Date.now() - opened.at });
          onOutcome({ type: 'beep', kind: full ? 'full' : again ? 'again' : 'new' });
          if (!continuous) {
            close();
            return onOutcome({ type: 'found', isbn, again });
          }
          clearHint();
          touchRun(isbn, !again);
          if (again) showAlreadyScanned(isbn);
          onOutcome({ type: 'added', isbn, again });
        },
        onUnrecognized: () => showHint('not-book', { kind: 'not-book' }),
        onRepeat: sightedAgain,
      });
      if (mine === token) stopCamera = stop;
      else stop();
    } catch (err) {
      console.error('Could not start the scanner:', err);
      if (mine !== token) return;
      track('scan_fail', { reason: FAIL_REASONS[err?.name] ?? 'other' });
      close();
      onOutcome({ type: 'failed' });
    }
  }

  // The user pressed Stop.
  function stop() {
    track('scan_stop', { ms: Date.now() - opened.at, found: opened.found });
    close();
  }

  return { open, close, stop, get active() { return active; } };
}
