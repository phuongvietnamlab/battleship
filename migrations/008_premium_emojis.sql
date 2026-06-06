-- 008_premium_emojis.sql: Premium animated emoji catalog

CREATE TABLE IF NOT EXISTS premium_emojis (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  emoji_char  TEXT NOT NULL,
  cost        INTEGER NOT NULL CHECK (cost > 0),
  description_en TEXT NOT NULL,
  description_vi TEXT NOT NULL,
  animation_file TEXT NOT NULL,
  impact_type TEXT NOT NULL DEFAULT 'explosion',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 6 initial emoji
INSERT INTO premium_emojis (name, slug, emoji_char, cost, description_en, description_vi, animation_file, impact_type, sort_order) VALUES
  ('Bomb',    'bomb',    '💣', 5, 'Spins and explodes on impact',       'Bay xoay và nổ tung khi chạm',       'bomb.svg',    'explosion', 1),
  ('Boxing',  'boxing',  '🥊', 3, 'Punches forward with knockback',     'Đấm thẳng và rung lắc',              'boxing.svg',  'shake',     2),
  ('Splash',  'splash',  '💦', 3, 'Bucket of water splashes on target', 'Dội nước vào đối thủ',               'splash.svg',  'splash',    3),
  ('Slap',    'slap',    '👋', 3, 'Slaps with red impact mark',         'Tát với vết đỏ',                     'slap.svg',    'shake',     4),
  ('Tease',   'tease',   '😜', 2, 'Teasing face bounces in front',      'Lêu lêu trêu chọc',                  'tease.svg',   'bounce',    5),
  ('Kiss',    'kiss',    '💋', 2, 'Blows a kiss with hearts',           'Thổi hôn với trái tim',               'kiss.svg',    'hearts',    6)
ON CONFLICT (slug) DO NOTHING;
