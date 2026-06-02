-- 004_matches.sql: Durable match records (MATCH-01, MATCH-03)
-- One row per completed 2-player server game. Source of truth for Phase 4 ratings.
-- Phase 4 (RANK-01) will add rating columns (winner_rating_before, loser_rating_before, etc.)
-- in a future 005_rankings.sql migration (ALTER TABLE ADD COLUMN IF NOT EXISTS) — no column
-- in this file needs to be altered. All statements are IF NOT EXISTS guarded so re-running is safe.

CREATE TABLE IF NOT EXISTS matches (
  id          SERIAL PRIMARY KEY,
  winner_id   INTEGER NOT NULL REFERENCES users(id),
  loser_id    INTEGER NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,                   -- 'normal' | 'timeout' | 'disconnect' | 'leave'
  mode        TEXT NOT NULL DEFAULT 'classic', -- 'classic' | 'advance'
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_reason_check CHECK (reason IN ('normal','timeout','disconnect','leave')),
  CONSTRAINT matches_dedup_unique UNIQUE (winner_id, loser_id, started_at)
);

-- Fast lookup: all matches for a given player (profile win/loss, Phase 4 rating history)
CREATE INDEX IF NOT EXISTS IDX_matches_winner_id ON matches (winner_id);
CREATE INDEX IF NOT EXISTS IDX_matches_loser_id  ON matches (loser_id);
-- Covers time-range queries and leaderboard lookups ("recent matches between two players")
CREATE INDEX IF NOT EXISTS IDX_matches_ended_at  ON matches (ended_at DESC);
