// Small DOM helper: element with optional text (set via textContent, never HTML) and class.
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// A link to a lookup site (opens in a new tab), shown as the site's icon.
//   big: a card button, the icon with the site's name underneath;
//   otherwise a small icon-only button. Its image carries the site's name as alt text, which
//   names the link for screen readers and shows instead of the icon if the image fails to load.
export function linkButton({ name, url, icon, title }, { big = false } = {}) {
  const link = el('a', null, big ? 'link-button' : 'icon-link');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = title;
  const img = el('img');
  img.src = icon;
  img.alt = big ? '' : name;
  link.append(img);
  if (big) link.append(el('span', name));
  return link;
}
