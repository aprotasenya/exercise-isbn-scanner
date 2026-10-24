import { isValidIsbn, normalizeIsbn } from './isbn.js';
import { isbnLinks } from './links.js';
import { startScanner } from './scanner.js';
import { hashForIsbn, isbnFromHash } from './hash.js';
import { createListStore, readFlag, writeFlag } from './storage.js';
import { createRecent } from './recent.js';
import { createMarked } from './marked.js';
import { createNames } from './names.js';
import { createMarkedView } from './markedView.js';
import { el, externalLink } from './dom.js';
import { THEME_LABELS, applyTheme, loadTheme, nextTheme, saveTheme } from './theme.js';

const form = document.getElementById('search');
const input = document.getElementById('isbn');
const status = document.getElementById('status');
const result = document.getElementById('result');
const button = form.querySelector('button[type="submit"]');
const scanButton = document.getElementById('scan');
const scanner = document.getElementById('scanner');
const preview = document.getElementById('preview');
const recentEl = document.getElementById('recent');
const themeButton = document.getElementById('theme');
const autoMark = document.getElementById('auto-mark');
const keepScanning = document.getElementById('keep-scanning');

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: lists just won't persist
  }
}

const recent = createRecent(createListStore(browserStorage(), 'isbn-reader.recent'));
const marked = createMarked(createListStore(browserStorage(), 'isbn-reader.marked'));
const AUTO_MARK_KEY = 'isbn-reader.automark';
const names = createNames(createListStore(browserStorage(), 'isbn-reader.names'));
const markedView = createMarkedView({
  marked,
  elements: {
    count: document.getElementById('marked-count'),
    list: document.getElementById('marked-list'),
    empty: document.getElementById('marked-empty'),
    copy: document.getElementById('copy-marked'),
    download: document.getElementById('download-marked'),
    clear: document.getElementById('clear-marked'),
  },
  onOpen(isbn) {
    input.value = isbn;
    form.requestSubmit();
  },
  notify: (text, isError) => setStatus(text, isError),
});

function setStatus(text, isError = false) {
  status.textContent = text;
  status.className = isError ? 'error' : '';
}

function renderRecent() {
  const entries = recent.list();
  recentEl.hidden = entries.length === 0;
  recentEl.replaceChildren(...entries.map(({ isbn, title }) => {
    const chip = el('button', title, 'chip');
    chip.type = 'button';
    chip.title = isbn;
    chip.addEventListener('click', () => {
      input.value = isbn;
      form.requestSubmit();
    });
    return chip;
  }));
  updateControls();
}

function linksBlock(isbn) {
  const block = el('p', 'Look up this ISBN on ', 'store-links meta');
  isbnLinks(isbn).forEach(({ name, url }, i, all) => {
    if (i > 0) block.append(i === all.length - 1 ? ' or ' : ', ');
    block.append(externalLink(name, url));
  });
  block.append('.');
  return block;
}

// No book data is fetched: a book is its ISBN, or the name the user typed for it. Titles stored
// by earlier versions (from Open Library) are kept; renaming updates the stored titles too, so
// clearing a typed name falls back to `ISBN <isbn>`.
const storedTitle = (isbn) =>
  marked.list().find((b) => b.isbn === isbn)?.title ?? recent.list().find((b) => b.isbn === isbn)?.title;
const bookFor = (isbn) => ({ title: names.get(isbn) || storedTitle(isbn) || `ISBN ${isbn}` });

// The name field on a card. The name is saved per ISBN and also updates the card, the chip
// and the Marked entry for that book.
function nameField(book, isbn, heading) {
  const field = el('input', null, 'name-input');
  field.type = 'text';
  field.maxLength = 120;
  field.placeholder = 'Name this book (optional)';
  field.setAttribute('aria-label', 'Name this book');
  field.value = names.get(isbn) ?? '';
  field.addEventListener('change', () => {
    field.value = names.set(isbn, field.value);
    book.title = field.value || `ISBN ${isbn}`;
    heading.textContent = book.title;
    marked.rename(isbn, book.title);
    markedView.render();
    recent.rename(isbn, book.title);
    renderRecent();
  });
  return field;
}

const markEntry = (book, isbn) => ({ isbn, title: book.title });

// `hideMark`: the book was just marked automatically, so the Mark button is not offered.
function renderBook(book, isbn, { hideMark = false } = {}) {
  const card = el('article', null, 'book');
  const body = el('div');
  const heading = el('h2', book.title);
  body.append(heading, nameField(book, isbn, heading));
  card.append(body);
  if (!hideMark) card.append(markedView.toggleFor(book, isbn)); // right edge, like the ✕ in the list
  result.replaceChildren(card, linksBlock(isbn));
}

// Camera scanning. `scanToken` lets a Stop pressed while the permission prompt is still
// open cancel that pending start.
let stopCamera = null;
let scanToken = 0;

// The field, Search, chips and checkboxes are locked while the camera is on; the Scan button
// turns into Stop (the way out of a scan).
function updateControls() {
  const scanning = !scanner.hidden;
  input.disabled = scanning;
  button.disabled = scanning;
  scanButton.textContent = scanning ? 'Stop' : 'Scan';
  for (const chip of recentEl.querySelectorAll('button')) chip.disabled = scanning;
  autoMark.disabled = scanning;
  // "Keep scanning" only makes sense when scanned books are marked automatically.
  keepScanning.disabled = scanning || !autoMark.checked;
  markedView.setLocked(scanning);
}

// Transient scanner messages ("not a book ISBN", "Already marked") are shown once and cleared
// when the barcode has been out of view for a moment (decoding fires many times per second
// while one is in frame). `hintKey` says which barcode the message belongs to.
let hintKey = null;
let hintTimer = null;

function showHint(key, text) {
  if (hintKey !== key) {
    hintKey = key;
    setStatus(text);
  }
  clearTimeout(hintTimer);
  hintTimer = setTimeout(clearHint, 1000);
}

function clearHint() {
  clearTimeout(hintTimer);
  if (hintKey === null) return;
  hintKey = null;
  setStatus('');
}

const showNotBookHint = () => showHint('not-a-book', "That barcode isn't a book ISBN.");

function closeScanner() {
  scanToken++;
  stopCamera?.();
  stopCamera = null;
  scanner.hidden = true;
  clearHint();
  clearTimeout(runTimer);
  run = null;
  updateControls();
}

// "Keep scanning" (needs Auto-mark): the camera stays on and each new book is marked.
let audio = null;

const BEEP_MARKED = 880; // Hz
const BEEP_ALREADY = 520; // lower: the book was already marked

// Browsers only allow sound after a tap, and a scan result arrives long after it (the camera
// start is asynchronous). So the audio is created and unlocked in the Scan tap.
// Returns a promise that settles once the audio is running (it never rejects).
function prepareAudio() {
  try {
    audio ??= new AudioContext();
    return Promise.resolve(audio.resume?.()).catch(() => {});
  } catch {
    // no audio available: the status line still shows what happened
    return Promise.resolve();
  }
}

// The matching visual: a short flash over the page (amber for a new book, blue for a marked one).
const snapEl = document.getElementById('snap');
function flashSnap(again) {
  snapEl.classList.remove('flash');
  void snapEl.offsetWidth; // restart the animation when scans follow each other quickly
  snapEl.classList.toggle('again', again);
  snapEl.classList.add('flash');
}

// A short beep tells the user, without looking at the screen, that the camera read a barcode:
// a higher tone for a book that is not marked yet, a lower one for one that already is.
function confirmScan(frequency = BEEP_MARKED) {
  flashSnap(frequency === BEEP_ALREADY);
  // a context that is still resuming has a frozen clock, so wait for it before scheduling
  prepareAudio().then(() => {
    if (audio?.state !== 'running') return;
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
    } catch {
      // audio went away (closed context): the status line still shows what happened
    }
  });
}

// What is in front of the camera right now. A run lasts until its barcode has been out of view
// for a moment. A book marked at the start of a run is "fresh": while it is still in view it
// must not flip to "Already marked".
let run = null; // { isbn, fresh }
let runTimer = null;
const RUN_MS = 3000; // same as the scanner's duplicate window, so the two never disagree

function touchRun(isbn, fresh) {
  if (run?.isbn !== isbn) run = { isbn, fresh };
  clearTimeout(runTimer);
  runTimer = setTimeout(() => { run = null; }, RUN_MS);
}

const markedTitle = (isbn) => marked.list().find((book) => book.isbn === isbn)?.title;

function showAlreadyMarked(isbn) {
  const title = markedTitle(isbn);
  if (title) showHint(isbn, `Already marked: ${title}`);
}

// A scanned book is a search like a typed one: it goes to the front of the "last 10" chips.
function noteRecent(isbn, title) {
  recent.add({ isbn, title });
  renderRecent();
}

// Another sighting of a book that is still in view (or was seen moments ago).
function sightedAgain(isbn) {
  if (run?.isbn === isbn && run.fresh) return touchRun(isbn, true);
  if (!marked.has(isbn)) return;
  const startOfRun = hintKey !== isbn; // the "Already marked" message is not showing yet
  touchRun(isbn, false);
  showAlreadyMarked(isbn);
  if (startOfRun) {
    noteRecent(isbn, markedTitle(isbn));
    confirmScan(BEEP_ALREADY);
  }
}

function addScanned(isbn) {
  clearHint();
  if (marked.has(isbn)) {
    touchRun(isbn, false);
    showAlreadyMarked(isbn);
    return noteRecent(isbn, markedTitle(isbn));
  }
  const book = bookFor(isbn);
  touchRun(isbn, true);
  marked.add(markEntry(book, isbn));
  markedView.render();
  noteRecent(isbn, book.title);
  setStatus(`Marked: ${book.title}`);
}

async function openScanner() {
  if (!scanner.hidden) return;
  prepareAudio(); // still inside the tap, which is what lets sound play later
  const continuous = keepScanning.checked;
  if (continuous) document.getElementById('marked').open = true; // show the list filling up
  const token = ++scanToken;
  scanner.hidden = false;
  updateControls();
  // Start from a clean slate: no previous ISBN, book card or message.
  input.value = '';
  result.replaceChildren();
  setStatus('');
  try {
    const stop = await startScanner(preview, {
      onIsbn(isbn) {
        // high = a book not marked yet, low = already marked
        confirmScan(marked.has(isbn) ? BEEP_ALREADY : BEEP_MARKED);
        if (continuous) return addScanned(isbn);
        closeScanner();
        input.value = isbn;
        search(isbn, { fromScan: true }); // fromScan lets search() auto-mark this book
      },
      onUnrecognized: showNotBookHint,
      onRepeat: sightedAgain,
      continuous,
    });
    if (token === scanToken) stopCamera = stop;
    else stop();
  } catch (err) {
    console.error('Could not start the scanner:', err);
    if (token !== scanToken) return;
    closeScanner();
    setStatus('Camera unavailable. Type the ISBN instead.', true);
    input.focus();
  }
}

scanButton.addEventListener('click', () => {
  if (scanner.hidden) return openScanner();
  closeScanner();
  setStatus('');
});
window.addEventListener('pagehide', closeScanner);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(normalizeIsbn(input.value));
});

// `push: false` is used when the search comes from the URL itself (load, Back/Forward);
// those don't add a history entry. `focus` moves the cursor to the field when it is done.
// `fromScan`: a single camera scan, so with Auto-mark the book is marked automatically.
function search(isbn, { push = true, focus = push, fromScan = false } = {}) {
  closeScanner();
  result.replaceChildren();
  if (!isValidIsbn(isbn)) return setStatus('Please enter a valid ISBN-10 or ISBN-13.', true);
  if (push && isbnFromHash(location.hash) !== isbn) history.pushState(null, '', hashForIsbn(isbn));

  const book = bookFor(isbn);
  const autoMarked = fromScan && autoMark.checked;
  let note = '';
  if (autoMarked) {
    const added = marked.add(markEntry(book, isbn));
    markedView.render();
    note = `${added ? 'Marked' : 'Already marked'}: ${book.title}`;
  }
  setStatus(note);
  recent.add({ isbn, title: book.title });
  renderRecent();
  renderBook(book, isbn, { hideMark: autoMarked });
  if (focus) input.focus();
}

window.addEventListener('popstate', () => {
  const isbn = isbnFromHash(location.hash);
  if (isbn) {
    input.value = isbn;
    search(isbn, { push: false });
  } else {
    closeScanner();
    input.value = '';
    result.replaceChildren();
    setStatus('');
  }
});

let theme = loadTheme(browserStorage());

function showTheme() {
  applyTheme(document.documentElement, theme);
  themeButton.textContent = THEME_LABELS[theme];
  themeButton.setAttribute('aria-label', `Theme: ${theme}. Click to change.`);
}

themeButton.addEventListener('click', () => {
  theme = nextTheme(theme);
  saveTheme(browserStorage(), theme);
  showTheme();
});
showTheme();

autoMark.checked = readFlag(browserStorage(), AUTO_MARK_KEY);
autoMark.addEventListener('change', () => {
  writeFlag(browserStorage(), AUTO_MARK_KEY, autoMark.checked);
  if (!autoMark.checked) keepScanning.checked = false;
  updateControls();
});

markedView.render();
renderRecent();
const linkedIsbn = isbnFromHash(location.hash);
if (linkedIsbn) {
  input.value = linkedIsbn;
  search(linkedIsbn, { push: false, focus: true });
}
