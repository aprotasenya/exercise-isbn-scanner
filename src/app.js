import { isValidIsbn, normalizeIsbn } from './isbn.js';
import { isbnLinks } from './links.js';
import { startScanner } from './scanner.js';
import { hashForIsbn, isbnFromHash } from './hash.js';
import { createListStore, copyListOnce } from './storage.js';
import { createBookList, isBookEntry } from './bookList.js';
import { createNames } from './names.js';
import { createListView, createMarkToggle, iconButton } from './listView.js';
import { el, linkButton } from './dom.js';
import { applyTheme, loadTheme, nextTheme, saveTheme } from './theme.js';
import { THEME_LABELS, t } from './strings.js';

const form = document.getElementById('search');
const input = document.getElementById('isbn');
const status = document.getElementById('status');
const result = document.getElementById('result');
const button = form.querySelector('button[type="submit"]');
const scanButton = document.getElementById('scan');
const scanLabel = document.getElementById('scan-label');
const scanner = document.getElementById('scanner');
const preview = document.getElementById('preview');
const themeButton = document.getElementById('theme');

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: lists just won't persist
  }
}

// "Scanned" is everything searched or scanned (it used to be the "last 10" chips, key
// isbn-reader.recent); "Marked" is the subset the user picked.
copyListOnce(browserStorage(), 'isbn-reader.recent', 'isbn-reader.scanned', isBookEntry);
try {
  browserStorage()?.removeItem('isbn-reader.automark'); // the Auto-mark setting no longer exists
} catch {
  // blocked storage: nothing to clean up
}
const scanned = createBookList(createListStore(browserStorage(), 'isbn-reader.scanned'));
const marked = createBookList(createListStore(browserStorage(), 'isbn-reader.marked'));
const names = createNames(createListStore(browserStorage(), 'isbn-reader.names'));

// Opening a book from a list shows its card but does not move it in Scanned: only a new
// search or scan does that.
// A full list refuses new books. The book is still shown on its card; this warning sits
// between the card and the lists until the next search or scan, or until there is room again.
const warning = document.getElementById('list-warning');
let warnedList = null;

function warnFull(name, list) {
  warnedList = list;
  warning.textContent = t.listFull(name, list.limit, t.fullAdvice[name]);
  warning.hidden = false;
}

function clearWarning() {
  warnedList = null;
  warning.hidden = true;
}

const openBook = (isbn) => {
  input.value = isbn;
  search(isbn, { move: false });
};
const listElements = (id) => ({
  section: document.getElementById(id),
  count: document.getElementById(`${id}-count`),
  items: document.getElementById(`${id}-list`),
  empty: document.getElementById(`${id}-empty`),
  copy: document.getElementById(`copy-${id}`),
  clear: document.getElementById(`clear-${id}`),
});

// Marking changes both lists (the stars in Scanned) and every star on the page.
function renderLists() {
  if (warnedList && !warnedList.isFull()) clearWarning(); // room again (Clear, Unmark)
  scannedView.render();
  markedView.render();
  markToggle.syncAll();
}
const markToggle = createMarkToggle({
  marked,
  onChange: renderLists,
  onFull: () => warnFull('marked', marked),
});
const scannedView = createListView({
  list: scanned,
  confirmClear: t.clearScanned,
  rowButton: (book) => markToggle.create(book, book.isbn),
  onOpen: openBook,
  onChange: renderLists,
  notify: (text, isError) => setStatus(text, isError, isError ? 0 : NOTE_MS),
  elements: listElements('scanned'),
});
const markedView = createListView({
  list: marked,
  confirmClear: t.clearMarked,
  rowButton: (book) => {
    const remove = iconButton('✕', t.unmark);
    remove.addEventListener('click', () => {
      marked.remove(book.isbn);
      renderLists();
    });
    return remove;
  },
  onOpen: openBook,
  onChange: renderLists,
  notify: (text, isError) => setStatus(text, isError, isError ? 0 : NOTE_MS),
  elements: listElements('marked'),
});

// `ttl`: the message clears itself after that many ms unless another one replaces it first.
let statusTimer = null;
function setStatus(text, isError = false, ttl = 0) {
  clearTimeout(statusTimer);
  status.textContent = text;
  status.className = isError ? 'error' : '';
  if (ttl && text) statusTimer = setTimeout(() => setStatus(''), ttl);
}

// Messages about what was typed (invalid ISBN, camera unavailable, list full) go away as soon as
// the field is edited; a confirmation (Copied) goes away on its own.
const NOTE_MS = 4000;
input.addEventListener('input', () => {
  setStatus('');
  clearWarning();
});

// No book data is fetched: a book is its ISBN, or the name the user typed for it. Titles stored
// by earlier versions (from Open Library) are kept; renaming updates the stored titles too, so
// clearing a typed name falls back to `ISBN <isbn>`.
const storedTitle = (isbn) =>
  [scanned, marked].map((l) => l.list().find((b) => b.isbn === isbn)?.title).find(Boolean);
const bookFor = (isbn) => ({ title: names.get(isbn) || storedTitle(isbn) || t.isbnTitle(isbn) });

// The title on a card is also where the book is named: tap it to type a name (Enter or leaving
// the field saves, Escape cancels); an empty name goes back to `ISBN <number>`. The name is saved
// per ISBN and also updates the Scanned and Marked entries for that book.
function titleHeading(book, isbn) {
  const heading = el('h2', null, 'book-title');

  // `refocus`: the editor was closed from the keyboard, so keep the focus on the title
  // (otherwise it would fall back to the top of the page).
  function showTitle(refocus = false) {
    const title = el('button', book.title, 'title-edit');
    title.type = 'button';
    title.title = t.editName;
    title.addEventListener('click', startEditing);
    heading.replaceChildren(title);
    if (refocus) title.focus();
  }

  function save(raw) {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (value === book.title) return; // unchanged: this also keeps titles saved by earlier versions
    const name = value.slice(0, 120) === t.isbnTitle(isbn) ? '' : value;
    const title = names.set(isbn, name) || t.isbnTitle(isbn);
    if (title === book.title) return; // e.g. an empty name on a card that already shows the default
    book.title = title;
    marked.rename(isbn, book.title);
    scanned.rename(isbn, book.title);
    renderLists();
  }

  function startEditing() {
    const field = el('input', null, 'title-input');
    field.type = 'text';
    field.maxLength = 120;
    field.value = book.title;
    field.placeholder = t.isbnTitle(isbn); // what an empty name turns back into
    field.setAttribute('aria-label', t.nameLabel);
    let finished = false;
    const finish = (keep, refocus) => {
      if (finished) return; // Enter and the blur that follows it must not save twice
      finished = true;
      if (keep) save(field.value);
      showTitle(refocus);
    };
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault(); // else the Enter is also delivered to the title button that takes the field's place, and reopens the editor
        finish(true, true);
      }
      if (event.key === 'Escape') finish(false, true);
    });
    field.addEventListener('blur', () => finish(true, false));
    heading.replaceChildren(field);
    field.focus();
    field.select();
  }

  showTitle();
  return heading;
}

function renderBook(book, isbn) {
  const card = el('article', null, 'book');
  const head = el('div', null, 'book-head');
  const body = el('div');
  body.append(titleHeading(book, isbn));
  // the star sits at the right edge of the card, like the buttons at the end of the list rows
  head.append(body, markToggle.create(book, isbn));
  const links = el('div', null, 'link-row');
  links.append(...isbnLinks(isbn).map((link) => linkButton(link, { big: true })));
  card.append(head, links);
  result.replaceChildren(card);
}

// Camera scanning. `scanToken` lets a Stop pressed while the permission prompt is still
// open cancel that pending start.
let stopCamera = null;
let scanToken = 0;

// The field and Search are locked while the camera is on; the Scan button
// turns into Stop (the way out of a scan).
function updateControls() {
  const scanning = !scanner.hidden;
  input.disabled = scanning;
  button.disabled = scanning;
  scanLabel.textContent = scanning ? t.stop : t.scan;
  scanButton.classList.toggle('stop', scanning);
  scannedView.setLocked(scanning);
  markedView.setLocked(scanning);
}

// Transient scanner messages ("not a book ISBN", "Already scanned") are shown once and cleared
// when the barcode has been out of view for a moment (decoding fires many times per second
// while one is in frame). `hintKey` says which barcode the message belongs to.
let hintKey = null;
let hintTimer = null;
const HINT_MS = 2000; // how long a message stays after its barcode leaves the view (long enough to read)

function showHint(key, text) {
  if (hintKey !== key) {
    hintKey = key;
    setStatus(text);
  }
  clearTimeout(hintTimer);
  hintTimer = setTimeout(clearHint, HINT_MS);
}

function clearHint() {
  clearTimeout(hintTimer);
  if (hintKey === null) return;
  hintKey = null;
  setStatus('');
}

const showNotBookHint = () => showHint('not-a-book', t.notABook);

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

// Continuous scanning (hold the Scan button): the camera stays on and each new book is added to Scanned.
let audio = null;

const BEEP_NEW = 880; // Hz
const BEEP_AGAIN = 520; // lower: the book was already scanned
const BEEP_FULL = 330; // lowest: the list is full, the book was not added

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

// The matching visual: a short flash over the page (amber for a new book, blue for a repeat,
// red when the list is full and the book was not added).
const snapEl = document.getElementById('snap');
function flashSnap(kind) {
  snapEl.classList.remove('flash');
  void snapEl.offsetWidth; // restart the animation when scans follow each other quickly
  snapEl.classList.toggle('again', kind === 'again');
  snapEl.classList.toggle('full', kind === 'full');
  snapEl.classList.add('flash');
}

// A short beep tells the user, without looking at the screen, that the camera read a barcode:
// a higher tone for a new book, a lower one for one that was already scanned, the lowest
// (with a red flash) when the Scanned list is full and the book was not added.
function confirmScan(frequency = BEEP_NEW) {
  flashSnap({ [BEEP_AGAIN]: 'again', [BEEP_FULL]: 'full' }[frequency] ?? 'new');
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
// for a moment. A book added at the start of a run is "fresh": while it is still in view it
// must not flip to "Already scanned".
let run = null; // { isbn, fresh }
let runTimer = null;
const RUN_MS = 3000; // same as the scanner's duplicate window, so the two never disagree

function touchRun(isbn, fresh) {
  if (run?.isbn !== isbn) run = { isbn, fresh };
  clearTimeout(runTimer);
  runTimer = setTimeout(() => { run = null; }, RUN_MS);
}

const scannedTitle = (isbn) => scanned.list().find((book) => book.isbn === isbn)?.title;

function showAlreadyScanned(isbn) {
  const title = scannedTitle(isbn);
  if (title) showHint(isbn, t.alreadyScanned(title));
}

// Every search or scan puts the book at the top of the Scanned list. Returns false when the
// list is full and the book is new: it is not added, and the warning says so.
function noteScanned(isbn, title) {
  const stored = scanned.bump({ isbn, title });
  if (!stored) warnFull('scanned', scanned);
  renderLists();
  return stored;
}

// Showing a book without searching for it again (opened from a list, Back/Forward, a reload
// with a link): it is added to Scanned if missing, but an existing row stays where it is.
function noteShown(isbn, title) {
  if (!scanned.has(isbn)) noteScanned(isbn, title);
}

// Another sighting of a book that is still in view (or was seen moments ago).
function sightedAgain(isbn) {
  if (run?.isbn === isbn && run.fresh) return touchRun(isbn, true);
  if (!scanned.has(isbn)) return;
  const startOfRun = hintKey !== isbn; // the "Already scanned" message is not showing yet
  touchRun(isbn, false);
  showAlreadyScanned(isbn);
  if (startOfRun) {
    noteScanned(isbn, bookFor(isbn).title);
    confirmScan(BEEP_AGAIN);
  }
}

function addScanned(isbn) {
  clearHint();
  clearWarning();
  if (scanned.has(isbn)) {
    touchRun(isbn, false);
    showAlreadyScanned(isbn);
    return noteScanned(isbn, bookFor(isbn).title);
  }
  const book = bookFor(isbn);
  touchRun(isbn, true);
  if (noteScanned(isbn, book.title)) setStatus(t.added(book.title));
  else setStatus(t.notAdded(book.title), true);
}

async function openScanner(continuous = false) {
  if (!scanner.hidden) return;
  prepareAudio(); // still inside the tap, which is what lets sound play later
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
        // high = a new book, low = already scanned, lowest = list full (not added)
        const again = scanned.has(isbn);
        const full = !again && scanned.isFull();
        confirmScan(full ? BEEP_FULL : again ? BEEP_AGAIN : BEEP_NEW);
        if (continuous) return addScanned(isbn);
        closeScanner();
        input.value = isbn;
        search(isbn);
        if (again) setStatus(t.alreadyScanned(bookFor(isbn).title));
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
    setStatus(t.cameraUnavailable, true);
    input.focus();
  }
}

// Tap = scan one book. Hold: nothing happens for MIN_HOLD_MS (a tap, or a press not yet meant as a hold),
// then the button fills with red over the rest of MAX_HOLD_MS, and when it is full the camera stays on and adds
// every book until Stop. Letting go once the fill has started only cancels (the fill drains): it is not a tap.
const MIN_HOLD_MS = 300;
const MAX_HOLD_MS = 1000;
const FILL_DRAIN_MS = 200; // how fast the fill empties when the press is cancelled
scanButton.style.setProperty('--hold', `${MAX_HOLD_MS - MIN_HOLD_MS}ms`);
scanButton.style.setProperty('--drain', `${FILL_DRAIN_MS}ms`);
let startTimer = null;
let doneTimer = null;
let swallowClick = false; // set once the fill starts: the click that ends the press is not a tap or a Stop

function cancelHold() {
  clearTimeout(startTimer);
  clearTimeout(doneTimer);
  scanButton.classList.remove('holding');
}

scanButton.addEventListener('pointerdown', (event) => {
  if (!scanner.hidden || (event.pointerType === 'mouse' && event.button !== 0)) return;
  prepareAudio(); // the hold ends outside a tap, so unlock sound now
  startTimer = setTimeout(() => {
    swallowClick = true;
    scanButton.classList.add('holding');
    doneTimer = setTimeout(() => {
      cancelHold();
      navigator.vibrate?.(30);
      openScanner(true);
    }, MAX_HOLD_MS - MIN_HOLD_MS);
  }, MIN_HOLD_MS);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  scanButton.addEventListener(type, () => {
    cancelHold();
    if (swallowClick) setTimeout(() => { swallowClick = false; }, 50); // after the click that follows the release
  });
}
scanButton.addEventListener('contextmenu', (event) => event.preventDefault());

scanButton.addEventListener('click', () => {
  if (swallowClick) return;
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
// those don't add a history entry. A valid search drops the focus from the field, so the phone keyboard closes.
// `move: false`: the book is only shown again, so it keeps its place in the Scanned list.
function search(isbn, { push = true, move = true } = {}) {
  closeScanner();
  result.replaceChildren();
  if (!isValidIsbn(isbn)) return setStatus(t.invalidIsbn, true);
  if (push && isbnFromHash(location.hash) !== isbn) history.pushState(null, '', hashForIsbn(isbn));

  const book = bookFor(isbn);
  setStatus('');
  clearWarning();
  (move ? noteScanned : noteShown)(isbn, book.title);
  renderBook(book, isbn);
  input.blur();
}

window.addEventListener('popstate', () => {
  const isbn = isbnFromHash(location.hash);
  if (isbn) {
    input.value = isbn;
    search(isbn, { push: false, move: false });
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
  themeButton.setAttribute('aria-label', t.themeAria(theme));
}

themeButton.addEventListener('click', () => {
  theme = nextTheme(theme);
  saveTheme(browserStorage(), theme);
  showTheme();
});
showTheme();

renderLists();
updateControls();
const linkedIsbn = isbnFromHash(location.hash);
if (linkedIsbn) {
  input.value = linkedIsbn;
  search(linkedIsbn, { push: false, move: false });
}
