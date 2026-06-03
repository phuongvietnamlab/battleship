-- 005_rankings.sql: Glicko-2 ratings, history, seasons + ALTER matches (RANK-01, RANK-03, RANK-05)
-- FK to users(id); auto-applied by lexical runner after 004_matches.sql; no runner edit needed.
-- All statements are IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guarded so re-running is safe.

-- ratings: one row per user, current Glicko-2 rating (D-04)
-- Primary key is user_id (one rating per user, not per season).
CREATE TABLE IF NOT EXISTS ratings (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id),
  rating       REAL    NOT NULL DEFAULT 1500,
  rd           REAL    NOT NULL DEFAULT 350,    -- rating deviation; starts high, falls with games
  volatility   REAL    NOT NULL DEFAULT 0.06,
  games_played INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leaderboard query: ORDER BY rating DESC WHERE rd < 110 (D-08/RANK-03 provisional filter).
-- This index covers the ORDER BY efficiently for the top-100 query.
CREATE INDEX IF NOT EXISTS IDX_ratings_rating_desc ON ratings (rating DESC);

-- seasons: metadata for each competitive season (D-12)
-- label TEXT NOT NULL UNIQUE is the idempotency guard for season-reset CLI (Pitfall 5, RANK-05):
-- running the script twice with the same label fails at this UNIQUE constraint → rolls back cleanly.
CREATE TABLE IF NOT EXISTS seasons (
  id         SERIAL PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,   -- idempotency guard: duplicate label → rollback
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ             -- set by season-reset script
);

-- rating_history: snapshot of each player's rating at season end (D-12)
-- History is never deleted — archive before reset, history survives forever.
-- UNIQUE (user_id, season_id) prevents double-archive per user per season (Pitfall 5, RANK-05).
CREATE TABLE IF NOT EXISTS rating_history (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  season_id    INTEGER NOT NULL REFERENCES seasons(id),
  rating       REAL    NOT NULL,
  rd           REAL    NOT NULL,
  volatility   REAL    NOT NULL,
  games_played INTEGER NOT NULL,
  archived_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season_id)  -- prevent double-archive per user per season
);

CREATE INDEX IF NOT EXISTS IDX_rating_history_user_id ON rating_history (user_id);

-- ALTER matches: add rating snapshot columns (D-06, RANK-01)
-- ADD COLUMN IF NOT EXISTS: safe to re-run; existing rows stay NULL (nullable by design).
-- winner_rating_before/after and loser_rating_before/after capture the Glicko-2 state
-- at game time — used for replay/audit and prevents recalculation from match history.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS winner_rating_before REAL,
  ADD COLUMN IF NOT EXISTS winner_rating_after  REAL,
  ADD COLUMN IF NOT EXISTS loser_rating_before  REAL,
  ADD COLUMN IF NOT EXISTS loser_rating_after   REAL;
