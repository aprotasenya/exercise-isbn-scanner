# Lookup site icons

Used on the book card and in the lists (see `src/links.js`). Saved here once, so the app never
fetches anything from these sites to show them.

| File | Source | Saved |
| --- | --- | --- |
| `ereadian.png` | https://ereadian.com/static/icons/apple-touch-icon.png (180 px), resized to 128 px | 2026-10-24 |
| `goodreads.png` | https://www.goodreads.com/apple-touch-icon.png (1024 px), resized to 128 px | 2026-10-24 |

128 px stays sharp when drawn at 64 px on a high-density phone screen. If a site changes its icon,
download the new one and resize it again (macOS: `sips -Z 128 in.png --out icons/name.png`).
