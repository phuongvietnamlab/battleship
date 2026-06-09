-- 011_bot_accounts.sql: Bot accounts for quick-match auto-pairing (Phase 18)
-- Seeds 10 bot users with realistic names, wallets (1000 pts), and credentials.
-- All statements are IF NOT EXISTS / ON CONFLICT guarded for idempotent re-runs.

-- Add is_bot flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

-- Seed 10 bot accounts with realistic Vietnamese/English names
-- Using DO block to handle the INSERT + wallet creation atomically
DO $$
DECLARE
  bot_names TEXT[] := ARRAY[
    'Minh Anh', 'Hải Long', 'Thuỷ Tiên', 'Đức Mạnh', 'Quỳnh Như',
    'Captain Jack', 'Sea Wolf', 'Admiral Fox', 'Storm Rider', 'Iron Anchor'
  ];
  bot_name TEXT;
  new_id INTEGER;
BEGIN
  FOREACH bot_name IN ARRAY bot_names
  LOOP
    -- Check if bot with this name already exists
    SELECT id INTO new_id FROM users WHERE display_name = bot_name AND is_bot = true;

    IF new_id IS NULL THEN
      -- Create user
      INSERT INTO users (display_name, is_bot) VALUES (bot_name, true) RETURNING id INTO new_id;

      -- Create credential
      INSERT INTO credentials (user_id, type, external_id)
        VALUES (new_id, 'bot', 'bot_' || new_id)
        ON CONFLICT (type, external_id) DO NOTHING;

      -- Create wallet with 1000 balance
      INSERT INTO wallets (user_id, balance)
        VALUES (new_id, 1000)
        ON CONFLICT (user_id) DO NOTHING;

      RAISE NOTICE 'Created bot account: % (id=%)', bot_name, new_id;
    ELSE
      -- Ensure wallet exists for existing bot
      INSERT INTO wallets (user_id, balance)
        VALUES (new_id, 1000)
        ON CONFLICT (user_id) DO NOTHING;

      RAISE NOTICE 'Bot account already exists: % (id=%)', bot_name, new_id;
    END IF;
  END LOOP;
END $$;
