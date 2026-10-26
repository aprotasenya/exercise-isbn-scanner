# Lookup service

A tiny Cloudflare Worker: `GET /lookup?isbn=<isbn>` reads the Goodreads page for that ISBN and answers `{title, series: {name, number}, author: {name, url}, rating: {value, count}, image}` as JSON (the title has its trailing brackets cut off; the series is the bracket with a `#number`; the author is the first one listed; `series`, `author` and `rating` are `null` when the page has none), or `404 {}` when there is nothing. The app (`src/lookup.js`) uses it to name a book and show its cover. The app works fully without it.

- Only `https://oleprota.github.io` and `http://localhost:8000` may call it from a browser (`ALLOWED_ORIGINS` in `index.js`).
- The cache key carries a version (`v3` in `index.js`): change it whenever the answer's shape changes, so old cached answers are not served.
- Answers are cached: 7 days for a found book, 1 day when Goodreads answers 404, and only 5 minutes for any other miss (an empty 202, a block, an error), so a hiccup is not remembered as "no such book". A 202 is asked once more after 1.5 s. A miss carries an `x-miss-reason` header (`curl -i` shows why).
- New (uncached) lookups are limited to 20 per 10 seconds per address (`wrangler.toml`). Past that the answer is 429, and the app waits 5 s and asks again (up to 3 times).
- Free plan: 100,000 requests a day, 10 ms CPU each. Past the limit requests fail (the app then just shows `ISBN <number>`); nothing is billed unless you upgrade to a paid plan.
- Where it is deployed: https://isbn-lookup.oleprota.workers.dev (Cloudflare account of oleprota@gmail.com, worker `isbn-lookup`; first deployed 2026-10-26).

## Deploy (once)

1. Make a free Cloudflare account (no card needed): https://dash.cloudflare.com/sign-up
2. From this folder, log in and deploy (needs Node):

       cd worker
       npx wrangler login
       npx wrangler deploy

   The last line prints the address, like `https://isbn-lookup.<your-name>.workers.dev`.
3. Try it: `curl "https://isbn-lookup.<your-name>.workers.dev/lookup?isbn=9786171299412"` should print the book's JSON.
4. Put the address (no trailing slash) into `LOOKUP_URL` in `src/lookup.js`, commit and push; the Pages site picks it up.

To change the service, edit `worker/` and run `npx wrangler deploy` again. To turn the lookup off, set `LOOKUP_URL` back to `''`.

## Check by hand

`npx wrangler dev` runs it locally on http://localhost:8787; `npm test` covers the parsing and the handler without the network.
