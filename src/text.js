const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Open Library descriptions may contain HTML tags and entities; return plain text
// with paragraph breaks kept as newlines. The result is only ever shown via textContent.
export function descriptionToText(raw) {
  return String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, dec, hex, name) => {
      if (name?.toLowerCase() === 'amp') return '&';
      if (name) return ENTITIES[name.toLowerCase()] ?? match;
      return String.fromCodePoint(dec ? Number(dec) : parseInt(hex, 16));
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
