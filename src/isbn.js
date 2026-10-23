export function normalizeIsbn(input) {
  return String(input).replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn(input) {
  const isbn = normalizeIsbn(input);
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((s, c, i) => s + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}
