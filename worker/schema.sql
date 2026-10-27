-- Usage events from the app (worker/events.js). `dev` is 1 for the developer's own use: leave it out of every real count.
CREATE TABLE IF NOT EXISTS events (
  ts INTEGER NOT NULL,   -- ms since 1970
  id TEXT NOT NULL,      -- the app's random per-browser id (8 hex digits)
  dev INTEGER NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL     -- JSON of the event's fields
);
CREATE INDEX IF NOT EXISTS events_by_time ON events (dev, ts);
