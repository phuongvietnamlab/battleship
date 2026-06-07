-- 010_friendships.sql: Social & Friends system (SOCL-01)
-- Friend requests with pending/accepted/blocked status.
-- Bidirectional: user_id sends request to friend_id.
-- UNIQUE(user_id, friend_id) prevents duplicate requests.
-- CHECK(user_id != friend_id) prevents self-friending.

CREATE TABLE IF NOT EXISTS friendships (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  friend_id   INTEGER NOT NULL REFERENCES users(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(user_id, friend_id),
  CHECK(user_id != friend_id),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id, status);
