-- 006_points_economy.sql: Drop ranked infrastructure, add points economy

-- Drop ranked tables (CASCADE handles FK from rating_history → seasons)
DROP TABLE IF EXISTS rating_history CASCADE;
DROP TABLE IF EXISTS seasons CASCADE;
DROP TABLE IF EXISTS ratings CASCADE;

-- Remove rating snapshot columns from matches
ALTER TABLE matches DROP COLUMN IF EXISTS winner_rating_before;
ALTER TABLE matches DROP COLUMN IF EXISTS winner_rating_after;
ALTER TABLE matches DROP COLUMN IF EXISTS loser_rating_before;
ALTER TABLE matches DROP COLUMN IF EXISTS loser_rating_after;

-- Add stake column to matches for wager tracking
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stake INTEGER DEFAULT 0;

-- Wallets: one row per signed-in user, created on account creation
CREATE TABLE IF NOT EXISTS wallets (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  balance     INTEGER NOT NULL DEFAULT 500 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions: append-only audit log, never updated or deleted
CREATE TABLE IF NOT EXISTS transactions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_ref
  ON transactions (user_id, type, reference_id) WHERE reference_id IS NOT NULL;
