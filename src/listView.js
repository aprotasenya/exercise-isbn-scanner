import { el, externalLink } from './dom.js';
import { isbnLinks } from './links.js';

const plural = (n) => `${n} book${n === 1 ? '' : 's'}`;

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
    button.title = isMarked ? 'Marked (click to unmark)' : 'Mark';
    button.setAttribute('aria-pressed', String(isMarked));
  }
  return {
    // `book.title` is read on click, so a rename after the button was made is picked up.
    create(book, isbn) {
      const button = iconButton('', 'Mark');
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

// One book list in the page (Scanned or Marked): the rows, and its Copy / Download / Clear actions.
// All text goes in via textContent.
//   list: a book list (src/bookList.js); filename: for the JSON download; confirmClear(count): the confirm question;
//   rowButton(book): the button at the end of each row; onOpen(isbn): search for a book from the list;
//   onChange(): called after Clear, so every list and star in the page is redrawn;
//   notify(text, isError): status line; elements: { section, count, items, empty, copy, download, clear }
// The section (a <details>) opens by itself when the list stops being empty (on load, or at the
// first book added, also while scanning); after that the user's open/closed choice is left alone.
export function createListView({ list, filename, confirmClear, rowButton, onOpen, onChange, notify, elements }) {
  const { section, count, items, empty, copy, download, clear } = elements;
  let locked = false;
  let wasEmpty = true;

  function render() {
    const books = list.list();
    count.textContent = String(books.length);
    if (books.length > 0 && wasEmpty) section.open = true;
    wasEmpty = books.length === 0;
    empty.hidden = books.length > 0;
    for (const button of [copy, download]) button.disabled = books.length === 0;
    clear.disabled = books.length === 0 || locked;
    items.replaceChildren(...books.map((book) => {
      const item = el('li');
      const open = el('button', book.title, 'open');
      open.type = 'button';
      open.disabled = locked;
      open.title = `Show ${book.isbn}`;
      open.addEventListener('click', () => onOpen(book.isbn));
      const actions = el('span', null, 'row-actions');
      actions.append(
        ...isbnLinks(book.isbn).map(({ name, url }) => externalLink(name, url, `${book.isbn} on ${name}`)),
        rowButton(book),
      );
      item.append(open, actions);
      return item;
    }));
  }

  // While the camera is on, opening a book (a search) and Clear are locked.
  function setLocked(value) {
    locked = value;
    clear.disabled = value || list.list().length === 0;
    for (const open of items.querySelectorAll('.open')) open.disabled = value;
  }

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(list.toText());
      notify(`Copied ${plural(list.list().length)} to the clipboard.`);
    } catch {
      notify('Could not copy. Use Download JSON instead.', true);
    }
  });

  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([list.toJson()], { type: 'application/json' }));
    const link = el('a');
    link.href = url;
    link.download = filename;
    document.body.append(link); // some browsers ignore a click on a link that is not in the page
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  clear.addEventListener('click', () => {
    if (confirm(confirmClear(plural(list.list().length)))) {
      list.clear();
      onChange();
    }
  });

  return { render, setLocked };
}
