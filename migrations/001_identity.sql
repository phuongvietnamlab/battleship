-- 001_identity.sql: Canonical identity model (DATA-01 / DATA-02)
-- One users row per player identity; many credentials rows (one per auth type).
-- Guests use type='guest', external_id=clientId.
-- Google OAuth (Phase 2) uses type='google', external_id=sub.
-- Deduplication is on the credentials unique constraint, not on users.

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  guest_migrated_at   TIMESTAMPTZ           -- reserved: set when guest account links to Google (Phase 2)
);

CREATE TABLE IF NOT EXISTS credentials (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,                -- 'guest' | 'google'
  external_id TEXT NOT NULL,               -- clientId for guest; sub for Google
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, external_id)
);
