import { isValidIsbn, normalizeIsbn } from './isbn.js';
import { fetchBookByIsbn, fetchOtherBooksByAuthor } from './openLibrary.js';
import { descriptionToText } from './text.js';
import { storeSearchLinks } from './storeLinks.js';

const form = document.getElementById('search');
const input = document.getElementById('isbn');
const status = document.getElementById('status');
const result = document.getElementById('result');
const button = form.querySelector('button');

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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const isbn = normalizeIsbn(input.value);
  result.replaceChildren();
  if (!isValidIsbn(isbn)) return setStatus('Please enter a valid ISBN-10 or ISBN-13.', true);

  button.disabled = true;
  setStatus('Searching…');
  let book;
  try {
    book = await fetchBookByIsbn(isbn);
    if (!book) {
      setStatus('Book not found.', true);
      return result.replaceChildren(storeLinksBlock(isbn));
    }
  } catch {
    return setStatus('Could not reach Open Library. Please try again.', true);
  } finally {
    button.disabled = false;
  }
  setStatus('');
  // Not awaited: the book is already shown, so the form is usable while this loads.
  // If another search replaced the card meanwhile, the container is detached and the
  // late result is simply never displayed.
  renderOthers(renderBook(book, isbn), book);
});
