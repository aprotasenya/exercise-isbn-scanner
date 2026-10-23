// Theme choice: "auto" follows the device setting (prefers-color-scheme, handled in CSS),
// "light" and "dark" override it. The override is remembered; "auto" is stored as nothing.
export const THEMES = ['auto', 'light', 'dark'];
export const THEME_LABELS = { auto: '🌓 Auto', light: '☀️ Light', dark: '🌙 Dark' };

const KEY = 'isbn-reader.theme';

export function nextTheme(theme) {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

export function loadTheme(storage) {
  try {
    const value = storage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveTheme(storage, theme) {
  try {
    if (theme === 'auto') storage.removeItem(KEY);
    else storage.setItem(KEY, theme);
  } catch {
    // storage blocked: the choice just won't persist
  }
}

// `root` is document.documentElement; CSS reads the data-theme attribute.
export function applyTheme(root, theme) {
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
