-- 002_accounts.sql: Add display_name, avatar_url to users; session table for connect-pg-simple.
-- Profile columns (D-08/D-09/D-10): nullable, stored sanitized via sanitizeDisplayName().
-- Session table: full DDL here (createTableIfMissing:false in Plan 02) so all schema lives
-- in numbered migrations consistent with Phase 1 convention.
-- user_id column added for efficient sign-out-all (D-03) via indexed DELETE.

-- Profile fields on users (D-08/D-09/D-10)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- Session table for connect-pg-simple (schema from: github.com/voxpelli/node-connect-pg-simple/blob/main/table.sql)
-- Extra user_id column added for efficient sign-out-all (D-03) — avoids JSON scan on sess column.
CREATE TABLE IF NOT EXISTS "session" (
  "sid"     varchar NOT NULL COLLATE "default",
  "sess"    json NOT NULL,
  "expire"  timestamp(6) NOT NULL,
  "user_id" integer,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire"  ON "session" ("expire");
CREATE INDEX IF NOT EXISTS "IDX_session_user_id" ON "session" ("user_id");
