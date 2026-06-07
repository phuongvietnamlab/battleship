-- 009_admin.sql: Admin dashboard tables
-- Phase 16: Admin panel RBAC, audit logging, moderation, announcements, operational controls

-- ─── Admin roles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_roles (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator')),
  granted_by  INTEGER REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_user_id
  ON admin_roles (user_id) WHERE revoked_at IS NULL;

-- ─── Admin sessions (connect-pg-simple schema) ───────────────────────────────
CREATE TABLE IF NOT EXISTS admin_sessions (
  "sid"     VARCHAR NOT NULL COLLATE "default",
  "sess"    JSON NOT NULL,
  "expire"  TIMESTAMP(6) NOT NULL,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expire ON admin_sessions ("expire");

-- ─── Admin audit log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            SERIAL PRIMARY KEY,
  admin_id      INTEGER NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  details       JSONB,
  ip            INET NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON admin_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log (created_at DESC);

-- ─── Announcements ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title_en    TEXT NOT NULL,
  title_vi    TEXT NOT NULL,
  body_en     TEXT,
  body_vi     TEXT,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'maintenance', 'event')),
  start_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at      TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements (active, start_at, end_at);

-- ─── Reports ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id            SERIAL PRIMARY KEY,
  reporter_id   INTEGER NOT NULL REFERENCES users(id),
  reported_id   INTEGER NOT NULL REFERENCES users(id),
  match_id      INTEGER REFERENCES matches(id),
  reason        TEXT NOT NULL CHECK (reason IN ('chat_abuse', 'cheating', 'harassment', 'other')),
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  resolution    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports (reported_id);

-- ─── Chat logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_logs (
  id          SERIAL PRIMARY KEY,
  room_code   TEXT NOT NULL,
  sender_id   INTEGER REFERENCES users(id),
  client_id   TEXT NOT NULL,
  message     TEXT NOT NULL,
  flagged     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_room ON chat_logs (room_code, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_logs_sender ON chat_logs (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_flagged ON chat_logs (flagged) WHERE flagged = true;

-- ─── Runtime config ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runtime_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── User bans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_bans (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('ban', 'mute')),
  reason      TEXT NOT NULL,
  duration    INTERVAL,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT true,
  banned_by   INTEGER NOT NULL REFERENCES users(id),
  unbanned_by INTEGER REFERENCES users(id),
  unbanned_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user_active
  ON user_bans (user_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_user_bans_ends_at
  ON user_bans (ends_at) WHERE active = true AND ends_at IS NOT NULL;

-- ─── Daily stats ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
  date            DATE PRIMARY KEY,
  new_users       INTEGER NOT NULL DEFAULT 0,
  active_users    INTEGER NOT NULL DEFAULT 0,
  matches_played  INTEGER NOT NULL DEFAULT 0,
  matches_classic INTEGER NOT NULL DEFAULT 0,
  matches_wagered INTEGER NOT NULL DEFAULT 0,
  points_earned   BIGINT NOT NULL DEFAULT 0,
  points_spent    BIGINT NOT NULL DEFAULT 0,
  points_wagered  BIGINT NOT NULL DEFAULT 0,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Add void columns to matches table ───────────────────────────────────────
ALTER TABLE matches ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS void_reason TEXT;


-- Add deleted_at to users table for soft-delete support
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
