-- 0001_init.sql — posts + categories voor waarisniels.nl
-- Uitvoeren: npm run db:migrate  (remote)  /  npm run db:migrate:local

DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;

CREATE TABLE posts (
  id          TEXT PRIMARY KEY,             -- uuid
  category    TEXT NOT NULL DEFAULT 'reis',
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  body        TEXT NOT NULL,                -- markdown; rauwe HTML toegestaan
  pub_date    TEXT NOT NULL,                -- ISO8601, bv. 2025-09-25T00:00:00.000Z
  tags        TEXT NOT NULL DEFAULT '[]',   -- JSON array van strings
  loc_lat     REAL,
  loc_lon     REAL,
  loc_name    TEXT,
  media       TEXT NOT NULL DEFAULT '[]',   -- JSON array, zie src/lib/db.ts MediaItem
  cover_key   TEXT,                         -- R2-key van de hero-afbeelding
  cover_alt   TEXT,
  place_fact  TEXT,                          -- AI-weetje, 1x gegenereerd en gecachet
  draft       INTEGER NOT NULL DEFAULT 0,   -- 0 = live, 1 = concept
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_posts_slug     ON posts(slug);
CREATE        INDEX idx_posts_feed     ON posts(draft, pub_date DESC);
CREATE        INDEX idx_posts_category ON posts(category, draft, pub_date DESC);

-- Categorieen in de DB zodat je er een kunt bijzetten zonder deploy.
CREATE TABLE categories (
  slug  TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (slug, label, sort) VALUES
  ('reis',   'Reisverhaal', 10),
  ('overig', 'Overig',      20);
