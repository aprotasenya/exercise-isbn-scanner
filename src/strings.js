// The interface is Ukrainian only. The page's fixed text is written in index.html; every
// message the user can see that is built in code lives here, so it can be reviewed in one place.
// Developer-facing console messages (e.g. in scanner.js) stay in English.

// Ukrainian plurals: 1 книга, 2-4 книги, 5-20 книг, 21 книга, 22 книги, ... 11-14 are "many".
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const books = (n) => `${n} ${plural(n, ['книга', 'книги', 'книг'])}`;

export const listNames = { scanned: 'Шукане', marked: 'Вибране' };

export const THEME_LABELS = { auto: '🌓 Авто', light: '☀️ Світла', dark: '🌙 Темна' };
export const THEME_NAMES = { auto: 'авто', light: 'світла', dark: 'темна' };

export const t = {
  // the title of a book that has no name (also stored with the lists, so keep it stable)
  isbnTitle: (isbn) => `ISBN ${isbn}`,
  themeAria: (theme) => `Тема: ${THEME_NAMES[theme]}. Натисніть, щоб змінити.`,
  scan: 'Сканувати',
  stop: 'Стоп',
  invalidIsbn: 'Введіть дійсний ISBN-10 або ISBN-13.',
  notABook: 'Це не ISBN книги.',
  cameraUnavailable: 'Камера недоступна. Введіть ISBN вручну.',
  nameLabel: 'Назва книги',
  namePlaceholder: 'Назва книги (необов’язково)',
  mark: 'Вибрати',
  isMarked: 'Вибрано (натисніть, щоб прибрати)',
  unmark: 'Прибрати з вибраного',
  show: (isbn) => `Показати ${isbn}`,
  linkTitle: (isbn, site) => `${isbn} на ${site}`,
  added: (title) => `Додано: ${title}`,
  alreadyScanned: (title) => `Вже в «Шуканому»: ${title}`,
  notAdded: (title) => `Не додано: ${title} (список «${listNames.scanned}» заповнений)`,
  listFull: (list, limit, advice) =>
    `Список «${listNames[list]}» заповнений (${books(limit)}), цю книгу не додано. ${advice}`,
  fullAdvice: {
    scanned: 'Очистіть список, щоб додавати далі.',
    marked: 'Приберіть кілька книг або очистіть список, щоб додавати далі.',
  },
  clearScanned: (booksText) => `Очистити «${listNames.scanned}» (${booksText})? Вибране залишиться.`,
  clearMarked: (booksText) => `Очистити «${listNames.marked}» (${booksText})?`,
  copied: (booksText) => `Скопійовано ${booksText} до буфера.`,
  copyFailed: 'Не вдалося скопіювати. Скористайтеся «Завантажити JSON».',
};
