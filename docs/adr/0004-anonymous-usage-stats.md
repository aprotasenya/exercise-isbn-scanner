# Usage stats are anonymous and from a fixed list

The app sends usage stats to its own worker (`POST /event`), carrying only a random per-browser id and short words or numbers from the fixed list in `worker/events.js`: never an ISBN, title or name. It is off when `LOOKUP_URL` is empty or the browser sends Do Not Track, and the id is shown at the bottom of the page. The worker drops any event not on the list, so a new event needs its name and fields added there too.

The developer's own use is flagged `dev` (`#dev` sets it, `#nodev` clears it, localhost is always dev), and queries on the stats leave `dev = 1` out.
