-- 0002_subscribers.sql — mailnotificatie bij een nieuwe post
-- Uitvoeren: npm run db:migrate:subs  (remote)  /  :subs:local
--
-- LET OP: dit bestand bevat met opzet géén DROP TABLE, in tegenstelling tot
-- 0001_init.sql. Draai 0001 nooit opnieuw op productie — die gooit alle posts weg.

CREATE TABLE IF NOT EXISTS subscribers (
  email             TEXT PRIMARY KEY,          -- kleingeletterd opgeslagen
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | unsubscribed
  confirm_token     TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  confirmed_at      TEXT,
  unsubscribed_at   TEXT,
  source            TEXT                       -- waar iemand zich aanmeldde (pad)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status  ON subscribers(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_confirm ON subscribers(confirm_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsub   ON subscribers(unsubscribe_token);

-- Houdt bij welke post al gemaild is, zodat twee klikken op "verstuur" niet
-- twee mails opleveren.
CREATE TABLE IF NOT EXISTS post_notifications (
  slug       TEXT PRIMARY KEY,
  sent_at    TEXT NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0
);
