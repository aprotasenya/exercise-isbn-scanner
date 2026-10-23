import { el } from './dom.js';
import { storeSearchLinks } from './storeLinks.js';

const plural = (n) => `${n} book${n === 1 ? '' : 's'}`;

// The "Marked" UI: the list, its Copy / Download / Clear actions, and the "Mark" toggle on a
// book card. All text goes in via textContent.
//   elements: { count, list, empty, copy, download, clear }
//   onOpen(isbn): search for a book from the list; notify(text, isError): status line.
export function createMarkedView({ marked, elements, onOpen, notify }) {
  const { count, list, empty, copy, download, clear } = elements;
  let locked = false;

  function syncToggle(button) {
    button.textContent = marked.has(button.dataset.isbn) ? 'Unmark' : 'Mark';
  }

  function render() {
    const books = marked.list();
    count.textContent = String(books.length);
    empty.hidden = books.length > 0;
    for (const button of [copy, download, clear]) button.disabled = books.length === 0;
    list.replaceChildren(...books.map((book) => {
      const item = el('li');
      const open = el('button', book.title, 'open');
      open.type = 'button';
      open.disabled = locked;
      open.title = `Show ${book.isbn}`;
      open.addEventListener('click', () => onOpen(book.isbn));
      const meta = el('span', [book.authors?.join(', '), book.isbn].filter(Boolean).join(' · '), 'meta');
      const remove = el('button', 'Unmark');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        marked.remove(book.isbn);
        render();
      });
      const links = storeSearchLinks(book.isbn).map(({ name, url }) => {
        const link = el('a', name);
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = `Search ${book.isbn} on ${name}`;
        return link;
      });
      item.append(open, meta, ...links, remove);
      return item;
    }));
    for (const toggle of document.querySelectorAll('.mark-toggle')) syncToggle(toggle);
  }

  // Opening a book from the list runs a search, so it is locked while one runs or the camera is on.
  function setLocked(value) {
    locked = value;
    for (const open of list.querySelectorAll('.open')) open.disabled = value;
  }

  function toggleFor(book, isbn) {
    const button = el('button', null, 'mark-toggle');
    button.type = 'button';
    button.dataset.isbn = isbn;
    button.addEventListener('click', () => {
      if (marked.has(isbn)) marked.remove(isbn);
      else marked.add({ isbn, title: book.title, authors: book.authors, publishedDate: book.publishedDate });
      render();
    });
    syncToggle(button);
    return button;
  }

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(marked.toText());
      notify(`Copied ${plural(marked.list().length)} to the clipboard.`);
    } catch {
      notify('Could not copy. Use Download JSON instead.', true);
    }
  });

  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([marked.toJson()], { type: 'application/json' }));
    const link = el('a');
    link.href = url;
    link.download = 'isbn-marked.json';
    document.body.append(link); // some browsers ignore a click on a link that is not in the page
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  clear.addEventListener('click', () => {
    if (confirm(`Unmark all ${plural(marked.list().length)}?`)) {
      marked.clear();
      render();
    }
  });

  return { render, setLocked, toggleFor };
}
