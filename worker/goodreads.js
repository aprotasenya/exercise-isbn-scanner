// Reads a book out of a Goodreads book page: the schema.org `Book` block in its
// <script type="application/ld+json"> (the og: tags hold the same data, but og:title is cut at ~60 characters).
const MARKER = 'application/ld+json';
const CLOSE = '</script>';

// The JSON-LD blocks of a page, parsed. Malformed ones are skipped. A plain indexOf scan keeps
// the CPU time low (a Workers free-tier request has 10 ms).
export function jsonLdBlocks(html) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const tag = html.indexOf(MARKER, from);
    if (tag === -1) return blocks;
    const start = html.indexOf('>', tag) + 1;
    const end = html.indexOf(CLOSE, start);
    if (start === 0 || end === -1) return blocks;
    from = end;
    try {
      blocks.push(JSON.parse(html.slice(start, end)));
    } catch {
      // not JSON: skip it
    }
  }
}

// The JSON-LD strings carry HTML entities ("Philosopher&apos;s Stone"). One pass, so "&amp;apos;" stays "&apos;".
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(?:#(\d{1,6})|#x([\da-f]{1,6})|(amp|lt|gt|quot|apos));/gi, (match, dec, hex, name) => {
    if (name) return NAMED[name.toLowerCase()];
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

const text = (value, max) => (typeof value === 'string' ? decode(value).trim().replace(/\s+/g, ' ').slice(0, max) : '');

// `{ title, authors, image }` for the first Book in the page, or null (no title = no data).
export function parseBook(html) {
  const book = jsonLdBlocks(html)
    .flatMap((block) => (Array.isArray(block) ? block : [block]))
    .find((block) => block?.['@type'] === 'Book');
  const title = text(book?.name, 200);
  if (!title) return null;
  const people = [book.author].flat().map((person) => text(person?.name, 100)).filter(Boolean);
  return {
    title,
    authors: [...new Set(people)].slice(0, 5),
    image: typeof book.image === 'string' && book.image.startsWith('https://') ? book.image : '',
  };
}
