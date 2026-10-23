import { isValidIsbn, normalizeIsbn } from './isbn.js';
import { fetchBookByIsbn, fetchOtherBooksByAuthor } from './openLibrary.js';
import { descriptionToText } from './text.js';
import { storeSearchLinks } from './storeLinks.js';
import { startScanner } from './scanner.js';
import { hashForIsbn, isbnFromHash } from './hash.js';
import { createListStore } from './storage.js';
import { createRecent } from './recent.js';
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

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: lists just won't persist
  }
}

const recent = createRecent(createListStore(browserStorage(), 'isbn-reader.recent'));

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

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

function renderBook(book, isbn) {
  const card = el('article', null, 'book');
  if (book.thumbnail) {
    const img = el('img');
    img.src = book.thumbnail;
    img.alt = `Cover of ${book.title}`;
    card.append(img);
  }
  const body = el('div');
  body.append(el('h2', book.title));
  if (book.authors.length) body.append(el('p', `by ${book.authors.join(', ')}`, 'meta'));
  const details = [book.publisher, book.publishedDate, book.pageCount && `${book.pageCount} pages`]
    .filter(Boolean).join(' · ');
  if (details) body.append(el('p', details, 'meta'));
  body.append(el('p', formatRating(book), 'meta'));
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
}

// The "not a book ISBN" hint is shown once and cleared when no such barcode has been
// seen for a moment (decoding fires many times per second while one is in frame).
let hintShown = false;
let hintTimer = null;

function showNotBookHint() {
  if (!hintShown) {
    hintShown = true;
    setStatus("That barcode isn't a book ISBN.");
  }
  clearTimeout(hintTimer);
  hintTimer = setTimeout(clearNotBookHint, 1000);
}

function clearNotBookHint() {
  clearTimeout(hintTimer);
  if (!hintShown) return;
  hintShown = false;
  setStatus('');
}

function closeScanner() {
  scanToken++;
  stopCamera?.();
  stopCamera = null;
  scanner.hidden = true;
  clearNotBookHint();
  updateControls();
}

async function openScanner() {
  if (!scanner.hidden) return;
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
        closeScanner();
        input.value = isbn;
        form.requestSubmit();
      },
      onUnrecognized: showNotBookHint,
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
async function search(isbn, { push = true, focus = push } = {}) {
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
    if (!book) {
      setStatus('Book not found.', true);
      return result.replaceChildren(storeLinksBlock(isbn));
    }
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
  setStatus('');
  recent.add({ isbn, title: book.title });
  renderRecent();
  // Not awaited: the book is already shown, so the form is usable while this loads.
  // If another search replaced the card meanwhile, the container is detached and the
  // late result is simply never displayed.
  renderOthers(renderBook(book, isbn), book);
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

renderRecent();
const linkedIsbn = isbnFromHash(location.hash);
if (linkedIsbn) {
  input.value = linkedIsbn;
  search(linkedIsbn, { push: false, focus: true });
}
