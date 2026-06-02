-- 003_email_accounts.sql: Email/password account schema additions (AUTH-06 / D-14 / D-15 / D-19)
-- Extends users and credentials for email-based accounts; adds auth_tokens for
-- single-use, time-limited verification + password-reset tokens (Plans 07/08/09).
-- migrations/002_accounts.sql is FINAL — this file adds only what email auth needs.
-- All statements are IF NOT EXISTS guarded so re-running is safe.

-- ── 1. Email fields on users (D-15) ──────────────────────────────────────────
-- email: the display/contact address associated with the account.
-- email_verified: false until the user clicks the verification link (AUTH-07).
-- No global UNIQUE constraint here — D-20: the same email address across different
-- providers (google + email) creates distinct accounts; uniqueness is enforced via the
-- existing credentials UNIQUE(type, external_id) with type='email', external_id=normalized email.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- ── 2. password_hash on credentials (D-14) ───────────────────────────────────
-- Nullable: only type='email' rows populate this column.
-- guest/google/facebook rows leave it NULL.
ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ── 3. auth_tokens table (D-15 / D-19) ───────────────────────────────────────
-- Stores single-use, time-limited tokens for email verification (purpose='verify', 24h)
-- and password reset (purpose='reset', 1h). Both flows (AUTH-07, AUTH-08) reuse
-- this table. Single-use enforcement: conditional consumed_at UPDATE in the app layer
-- (consumeAuthToken); UNIQUE(token) prevents duplicate-token collisions.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token       TEXT NOT NULL UNIQUE,          -- high-entropy random string (crypto.randomBytes)
  purpose     TEXT NOT NULL,                 -- 'verify' | 'reset'
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,                   -- NULL = not yet used; set by consumeAuthToken
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast token lookup (consumeAuthToken, verifyEmail)
CREATE INDEX IF NOT EXISTS IDX_auth_tokens_token   ON auth_tokens (token);
-- Index for efficient per-user token queries / cleanup
CREATE INDEX IF NOT EXISTS IDX_auth_tokens_user_id ON auth_tokens (user_id);
