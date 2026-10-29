# Ereadian and Goodreads are link-only

The app links to Ereadian and Goodreads and never reads their pages: their servers send no CORS headers, so a browser can't fetch them, and the Ukrainian stores (Yakaboo, Rozetka) block scripts with 403. The icons are saved in `icons/` for the same reason; they are never fetched at runtime. Scraping through our own server was ruled out.
