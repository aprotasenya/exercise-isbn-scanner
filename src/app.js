import { isValidIsbn, normalizeIsbn } from './isbn.js';
import { fetchBookByIsbn, fetchOtherBooksByAuthor, unknownBook } from './openLibrary.js';
import { descriptionToText } from './text.js';
import { storeSearchLinks } from './storeLinks.js';
import { startScanner } from './scanner.js';
import { hashForIsbn, isbnFromHash } from './hash.js';
import { createListStore, readFlag, writeFlag } from './storage.js';
import { createRecent } from './recent.js';
import { createMarked } from './marked.js';
import { createNames } from './names.js';
import { createMarkedView } from './markedView.js';
import { el } from './dom.js';
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

function formatRating(book) {
  if (book.averageRating == null) return 'No rating available';
  const count = book.ratingsCount != null ? ` (${book.ratingsCount} ratings)` : '';
  return `★ ${book.averageRating}${count}`;
}

function storeLinksBlock(isbn) {
  const block = el('p', 'Search this ISBN on ', 'store-links meta');
  storeSearchLinks(isbn).forEach(({ name, url }, i) => {
    if (i > 0) block.append(', ');
    const link = el('a', name);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    block.append(link);
  });
  block.append('.');
  return block;
}

// A book Open Library lacks shows the name the user typed for its ISBN, if any.
const withName = (book, isbn) =>
  (book.unknown ? { ...book, title: names.get(isbn) || book.title } : book);

// The field on an unknown book's card. The name is saved per ISBN and also updates the card
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

const markEntry = (book, isbn) =>
  ({ isbn, title: book.title, authors: book.authors, publishedDate: book.publishedDate });

// `hideMark`: the book was just marked automatically, so the Mark button is not offered.
function renderBook(book, isbn, { hideMark = false } = {}) {
  const card = el('article', null, 'book');
  if (book.thumbnail) {
    const img = el('img');
    img.src = book.thumbnail;
    img.alt = `Cover of ${book.title}`;
    card.append(img);
  }
  const body = el('div');
  const heading = el('h2', book.title);
  body.append(heading);
  if (book.authors.length) body.append(el('p', `by ${book.authors.join(', ')}`, 'meta'));
  const details = [book.publisher, book.publishedDate, book.pageCount && `${book.pageCount} pages`]
    .filter(Boolean).join(' · ');
  if (details) body.append(el('p', details, 'meta'));
  body.append(el('p', book.unknown ? 'Not found in Open Library.' : formatRating(book), 'meta'));
  if (book.unknown) body.append(nameField(book, isbn, heading));
  if (!hideMark) body.append(markedView.toggleFor(book, isbn));
  if (book.description) body.append(el('p', descriptionToText(book.description), 'description'));
  const others = el('div', null, 'others');
  body.append(others);
  card.append(body);
  result.replaceChildren(card, storeLinksBlock(isbn));
  return others;
}

async function renderOthers(container, book) {
  if (!book.authorKey) return;
  container.append(el('h3', `More by ${book.authors[0]}`));
  try {
    const books = await fetchOtherBooksByAuthor(book.authorKey, book);
    if (!books.length) return container.append(el('p', 'No other books found.', 'meta'));
    const list = el('ul');
    for (const b of books) {
      const year = b.publishedDate?.slice(0, 4);
      list.append(el('li', year ? `${b.title} (${year})` : b.title));
    }
    container.append(list);
  } catch {
    container.append(el('p', 'Could not load other books by this author.', 'meta'));
  }
}

// Camera scanning. `scanToken` lets a Stop pressed while the permission prompt is still
// open cancel that pending start.
let stopCamera = null;
let scanToken = 0;

let searching = false;

// The field and Search are locked while a search runs or the camera is on;
// The Scan button turns into Stop while the camera is on, and is locked only during a
// search (Stop is the way out of a scan).
function updateControls() {
  const scanning = !scanner.hidden;
  input.disabled = searching || scanning;
  button.disabled = searching || scanning;
  scanButton.disabled = searching;
  scanButton.textContent = scanning ? 'Stop' : 'Scan';
  for (const chip of recentEl.querySelectorAll('button')) chip.disabled = searching || scanning;
  autoMark.disabled = searching || scanning;
  // "Keep scanning" only makes sense when scanned books are marked automatically.
  keepScanning.disabled = searching || scanning || !autoMark.checked;
  markedView.setLocked(searching || scanning);
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

// "Keep scanning" (needs Auto-mark): the camera stays on and each new book is looked up and marked.
const lookups = new Set();
let audio = null;

const BEEP_MARKED = 880; // Hz
const BEEP_ALREADY = 520; // lower: the book was already marked

// Browsers only allow sound after a tap, and a scan result arrives long after it (the camera
// start and the lookup are asynchronous). So the audio is created and unlocked in the Scan tap.
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

// A short beep tells the user what a scan did without looking at the screen:
// a higher tone when the book was marked, a lower one when it already was.
function confirmScan(frequency = BEEP_MARKED) {
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
const failures = new Map(); // isbn -> when its lookup last failed

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

// A scanned book is a lookup like a typed one: it goes to the front of the "last 10" chips.
function noteRecent(isbn, title) {
  recent.add({ isbn, title });
  renderRecent();
}

// Another sighting of a book that is still in view (or was seen moments ago).
function sightedAgain(isbn) {
  if (run?.isbn === isbn && run.fresh) return touchRun(isbn, true);
  if (!marked.has(isbn)) {
    // Its lookup is still running (nothing to do) or failed: retry every 3 s while it stays in view.
    const failedAt = failures.get(isbn);
    if (!lookups.has(isbn) && failedAt !== undefined && Date.now() - failedAt >= RUN_MS) addScanned(isbn);
    return;
  }
  const startOfRun = hintKey !== isbn; // the "Already marked" message is not showing yet
  touchRun(isbn, false);
  showAlreadyMarked(isbn);
  if (startOfRun) {
    noteRecent(isbn, markedTitle(isbn));
    confirmScan(BEEP_ALREADY);
  }
}

async function addScanned(isbn) {
  if (lookups.has(isbn)) return;
  const session = scanToken; // changes when the camera is stopped or restarted
  failures.delete(isbn);
  clearHint();
  if (marked.has(isbn)) {
    touchRun(isbn, false);
    showAlreadyMarked(isbn);
    noteRecent(isbn, markedTitle(isbn));
    return confirmScan(BEEP_ALREADY);
  }

  touchRun(isbn, true);
  lookups.add(isbn);
  setStatus(`Looking up ${isbn}…`);
  try {
    // A book Open Library lacks is kept as a placeholder so the scan is not lost.
    const book = withName((await fetchBookByIsbn(isbn)) ?? unknownBook(isbn), isbn);
    marked.add(markEntry(book, isbn));
    markedView.render();
    noteRecent(isbn, book.title);
    // The scan is recorded either way, but if the camera was stopped meanwhile, stay quiet:
    // the status line and the beep now belong to whatever the user is doing.
    if (session !== scanToken) return;
    confirmScan();
    const unnamed = book.unknown && !names.get(isbn);
    setStatus(unnamed ? `Marked ISBN ${isbn} (not found in Open Library)` : `Marked: ${book.title}`);
  } catch {
    failures.set(isbn, Date.now());
    if (run?.isbn === isbn) run = null; // not marked, so sightings must not count as "fresh"
    if (session === scanToken) setStatus(`Could not look up ${isbn}. Keep it in view to retry.`, true);
  } finally {
    lookups.delete(isbn);
  }
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
  if (searching) return;
  search(normalizeIsbn(input.value));
});

// Each search gets an id; a search that has been superseded (Back/Forward while it was
// loading) must not draw its result, change the status or unlock the controls.
let searchId = 0;

// `push: false` is used when the search comes from the URL itself (load, Back/Forward);
// those don't add a history entry. `focus` moves the cursor to the field when it finishes.
// `fromScan`: a single camera scan, so with Auto-mark the book is marked automatically.
async function search(isbn, { push = true, focus = push, fromScan = false } = {}) {
  closeScanner();
  result.replaceChildren();
  if (!isValidIsbn(isbn)) return setStatus('Please enter a valid ISBN-10 or ISBN-13.', true);
  if (push && isbnFromHash(location.hash) !== isbn) history.pushState(null, '', hashForIsbn(isbn));

  const id = ++searchId;
  searching = true;
  updateControls();
  setStatus('Searching…');
  let book;
  try {
    book = await fetchBookByIsbn(isbn);
    if (id !== searchId) return;
  } catch {
    if (id !== searchId) return;
    return setStatus('Could not reach Open Library. Please try again.', true);
  } finally {
    if (id === searchId) {
      searching = false;
      updateControls();
      if (focus) input.focus();
    }
  }
  // A book Open Library lacks still gets a card (so it can be marked) and the store link.
  book = withName(book ?? unknownBook(isbn), isbn);
  const autoMarked = fromScan && autoMark.checked;
  let note = book.unknown ? 'Not found in Open Library.' : '';
  if (autoMarked) {
    const added = marked.add(markEntry(book, isbn));
    markedView.render();
    confirmScan(added ? BEEP_MARKED : BEEP_ALREADY);
    note = `${added ? 'Marked' : 'Already marked'}: ${book.title}`;
  }
  setStatus(note);
  recent.add({ isbn, title: book.title }); // not-found books too: they can be named later
  renderRecent();
  // Not awaited: the book is already shown, so the form is usable while this loads.
  // If another search replaced the card meanwhile, the container is detached and the
  // late result is simply never displayed.
  renderOthers(renderBook(book, isbn, { hideMark: autoMarked }), book);
}

window.addEventListener('popstate', () => {
  const isbn = isbnFromHash(location.hash);
  if (isbn) {
    input.value = isbn;
    search(isbn, { push: false });
  } else {
    closeScanner();
    searchId++; // cancel a search that is still loading
    searching = false;
    updateControls();
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
