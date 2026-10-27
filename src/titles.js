// Which title a book shows. In this order: the name the user typed, the title the lookup found,
// a title stored in a list (kept by earlier versions), the title it was picked by from a title search,
// `ISBN <isbn>`.
import { t } from './strings.js';

export function createTitles({ names, meta, lists, foundBy }) {
  // a listed `ISBN <isbn>` is only the default: it must not hide a better title
  const stored = (isbn) => lists.map((l) => l.list().find((b) => b.isbn === isbn)?.title).find((title) => title && title !== t.isbnTitle(isbn));
  const picked = (isbn) => foundBy.get(isbn)?.title;
  return {
    of: (isbn) => names.get(isbn) || meta.get(isbn)?.title || stored(isbn) || picked(isbn) || t.isbnTitle(isbn),
    // what an empty typed name turns back into
    fallback: (isbn) => meta.get(isbn)?.title || picked(isbn) || t.isbnTitle(isbn),
    // Call before the new answer is stored. A found title may replace only the default `ISBN <number>`
    // or the title an earlier lookup gave: never a typed name or another title.
    replaceable(isbn) {
      const earlier = meta.get(isbn)?.title;
      return (title) => title === t.isbnTitle(isbn) || title === earlier;
    },
  };
}
