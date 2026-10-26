import { el, linkButton, spinner } from './dom.js';
import { books, t } from './strings.js';
import { isbnLinks } from './links.js';

// An icon-only button still needs a name for screen readers, and a tooltip for the mouse.
export function iconButton(icon, label) {
  const button = el('button', icon, 'icon');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  return button;
}

// The star on a card or list row: marks or unmarks a book in the Marked list. It keeps one
// name ("Mark") and exposes its state, instead of renaming itself.
export function createMarkToggle({ marked, onChange, onFull }) {
  function sync(button) {
    const isMarked = marked.has(button.dataset.isbn);
    button.textContent = isMarked ? '★' : '☆';
    button.title = isMarked ? t.isMarked : t.mark;
    button.setAttribute('aria-pressed', String(isMarked));
  }
  return {
    // `book.title` is read on click, so a rename after the button was made is picked up.
    create(book, isbn) {
      const button = iconButton('', t.mark);
      button.classList.add('mark-toggle');
      button.dataset.isbn = isbn;
      button.addEventListener('click', () => {
        if (marked.has(isbn)) marked.remove(isbn);
        else if (!marked.add({ isbn, title: book.title })) onFull(); // the list is full
        onChange();
      });
      sync(button);
      return button;
    },
    syncAll() {
      for (const button of document.querySelectorAll('.mark-toggle')) sync(button);
    },
  };
}

// One book list in the page (Scanned or Marked): the rows, and its Copy / Clear actions.
// All text goes in via textContent.
//   list: a book list (src/bookList.js); confirmClear(booksText): the confirm question, given the count as text ("3 книги");
//   rowButton(book): the button at the end of each row; onOpen(isbn): search for a book from the list;
//   onChange(): called after Clear, so every list and star in the page is redrawn;
//   isWaiting(isbn): true while the book's name is still being looked up (the row shows a spinner);
//   notify(text, isError): status line; elements: { section, count, items, empty, copy, clear }
// The section (a <details>) opens by itself when the list stops being empty (on load, or at the
// first book added, also while scanning); after that the user's open/closed choice is left alone.
export function createListView({ list, confirmClear, rowButton, onOpen, onChange, isWaiting = () => false, notify, elements }) {
  const { section, count, items, empty, copy, clear } = elements;
  let locked = false;
  let wasEmpty = true;
  let stale = false; // a closed section is not redrawn (up to 1000 rows per scan); it catches up when opened

  function render() {
    const books = list.list();
    count.textContent = String(books.length);
    if (books.length > 0 && wasEmpty) section.open = true;
    wasEmpty = books.length === 0;
    empty.hidden = books.length > 0;
    copy.disabled = books.length === 0;
    clear.disabled = books.length === 0 || locked;
    stale = !section.open;
    if (stale) return;
    items.replaceChildren(...books.map((book) => {
      const item = el('li');
      const open = el('button', book.title, 'open');
      open.type = 'button';
      open.disabled = locked;
      open.title = book.title; // the full name, for a name the row has to cut
      open.addEventListener('click', () => onOpen(book.isbn));
      const actions = el('span', null, 'row-actions');
      actions.append(
        ...isbnLinks(book.isbn).map((link) => linkButton(link)),
        rowButton(book),
      );
      item.append(open);
      if (isWaiting(book.isbn)) item.append(spinner(t.lookingUp));
      item.append(actions);
      return item;
    }));
  }

  section.addEventListener('toggle', () => {
    if (section.open && stale) render();
  });

  // While the camera is on, opening a book (a search) and Clear are locked.
  function setLocked(value) {
    locked = value;
    clear.disabled = value || list.list().length === 0;
    for (const open of items.querySelectorAll('.open')) open.disabled = value;
  }

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(list.toText());
      notify(t.copied(books(list.list().length)));
    } catch {
      notify(t.copyFailed, true);
    }
  });

  clear.addEventListener('click', () => {
    if (confirm(confirmClear(books(list.list().length)))) {
      list.clear();
      onChange();
    }
  });

  return { render, setLocked };
}
