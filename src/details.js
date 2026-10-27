// The parts of a book card that come from the lookup: the rating (the accent of the card), and the
// series and author with links to Goodreads. All text goes in via textContent.
import { el } from './dom.js';
import { formatRating, t } from './strings.js';
import { goodreadsSearch } from './links.js';

const SVG = 'http://www.w3.org/2000/svg';

function starIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'rating-star');
  svg.setAttribute('aria-hidden', 'true'); // the number next to it says it
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z');
  svg.append(path);
  return svg;
}

// "★ 4.66 (734 385)": the value large, the count small. A screen reader gets "Рейтинг на Goodreads: 4.66 (734 385)".
export function ratingBlock(rating) {
  const { value, count } = formatRating(rating);
  const block = el('p', null, 'rating');
  block.title = t.ratingTitle(value, count);
  block.append(starIcon(), el('span', `${t.ratingLabel}: `, 'sr-only'), el('strong', value, 'rating-value'), el('span', `(${count})`, 'rating-count'));
  return block;
}

function outsideLink(href, text) {
  const link = el('a', text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

// "Серія  Хроніки Буресвітла #1" and "Автор  Brandon Sanderson", each name a link to Goodreads
// (the series a search for its name; the author's own page). Null when there is neither.
export function factsBlock({ series, author }) {
  if (!series && !author) return null;
  const facts = el('dl', null, 'facts');
  if (series) {
    const value = el('dd');
    value.append(outsideLink(goodreadsSearch(series.name), series.name));
    if (series.number) value.append(el('span', ` #${series.number}`, 'series-number'));
    facts.append(el('dt', t.seriesLabel), value);
  }
  if (author) {
    const value = el('dd');
    value.append(author.url ? outsideLink(author.url, author.name) : author.name);
    facts.append(el('dt', t.authorLabel), value);
  }
  return facts;
}
