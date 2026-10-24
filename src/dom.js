// Small DOM helper: element with optional text (set via textContent, never HTML) and class.
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// An external link that opens in a new tab.
export function externalLink(text, url, tooltip) {
  const link = el('a', text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (tooltip) link.title = tooltip;
  return link;
}
