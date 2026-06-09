# Phase 18: Bot Quick Match — Research

**Researched:** 2026-06-09
**Status:** Complete

## Key Findings

### 1. Current Bot System = Client-Side Only

The existing bot (Phase 6) is **entirely client-side** in `app.jsx`:
- `startBot()` sets `vsBot=true` and enters placement locally
- `genFleet()` generates random ship placement (11×11 board)
- `botPick()` / `botShoot()` — pure random targeting, runs in browser
- No server involvement, no DB recording, no real users

**Implication:** Phase 18 needs a completely new **server-side bot player** that:
- Exists as a real user in the DB
- Has a real socket connection (or virtual/simulated socket)
- Places ships server-side
- Fires shots on a timer
- Gets wagered/credited through the real wallet system

### 2. Matchmaking Queue Architecture

```
joinQueue → queues[type].set(queueKey, entry)
          → tryPair(type) called immediately + every 5s via sweep
tryPair   → findPair (FIFO for free, same-stake for wagered)
          → delete from map synchronously (race guard)
          → createMatchedRoom(entryA, entryB, type)
```

Key data: each queue entry has `{socketId, clientId, queueKey, userId, stake, wagerId, enqueuedAt, pairing, profile, queueType}`

**Integration point:** The 15s timeout check fits naturally in the `tryPairAll()` sweep (runs every 5s). When an entry has been waiting >15s and no human pair found, create a bot entry and call `createMatchedRoom(humanEntry, botEntry, type)`.

### 3. createMatchedRoom Expectations

`createMatchedRoom(entryA, entryB, type)` expects:
- Both entries have valid `socketId` that passes `socketIsLive()` check
- Each entry has `clientId`, `userId`, `profile`, `stake`, `wagerId`
- After room creation, emits `matchFound` to both sockets

**Problem:** A bot has no real browser socket. Options:
1. **Virtual socket** — create a fake socket object that passes `socketIsLive()` but doesn't actually send/receive. Complex, fragile.
2. **Bypass createMatchedRoom** — create a dedicated `createBotMatchRoom(humanEntry, botUserId)` that sets up the room with only the human socket joined, and spawns the server-side bot logic internally.
3. **Internal Socket.IO client** — the bot connects as a real Socket.IO client from within the server process. Clean but adds network overhead.

**Recommended: Option 2** — a dedicated function keeps the existing PvP path untouched and avoids socket fakery. The bot "player" is just server-side state management in the room object.

### 4. Server-Side Bot Game Loop

Needed components:
- **Ship placement:** Reuse `genFleetPure()` from `test/bot-helpers.js` (already a pure server-side function)
- **Targeting:** The Phase 6 4-tier algorithms exist only in `app.jsx`. For server-side, port the pure-random algorithm first (simplest). Can later add difficulty tiers.
- **Turn management:** After human fires and it's bot's turn, schedule `botFire()` after 2-5s random delay. Uses the existing `room.turn` / `room.turnTimer` system.
- **Shot resolution:** Call the same `doShot()` logic the server uses for real players.

### 5. Wallet/Wager Integration

Current flow for wagered queue:
1. `joinQueue` with type=wagered → `debitWallet(userId, stake, 'wager_debit', referenceId)`
2. Match ends → `recordMatch(winnerId, loserId, reason, mode, startedAt, stake)` → credits winner 90% of pot

**For bot matches:**
- Bot needs a wallet row with a balance
- When bot is matched with human at human's stake:
  - Debit bot wallet for the same stake
  - On match end: `recordMatch(winnerId, loserId, ...)` handles payout normally
  - If bot's balance is too low: fall back to stake=0 (free match)
- **Auto-replenish:** Before match, check bot balance; if < 100, top-up to 1000

### 6. Database Changes Needed

```sql
-- Add is_bot flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false;

-- Seed 10 bot accounts
INSERT INTO users (display_name, avatar_url, is_bot) VALUES
  ('Minh Anh', '/avatars/bot1.png', true),
  ... (10 rows)

-- Create wallets for each bot (1000 initial balance)
INSERT INTO wallets (user_id, balance) VALUES (bot_id, 1000);
```

**Note:** The users table currently doesn't have `display_name` or `avatar_url` columns directly — those are set via a profile update mechanism. Need to check how profiles work.

### 7. Client-Side Changes

Minimal:
- Remove/modify the 30s bot offer (currently shows "Play vs Bot" client-side button)
- The auto-match happens silently — player just sees "opponent found" after 15s
- No visual indicator that it's a bot (BOT-QM-13)
- Player sees the bot's display_name/avatar as normal opponent

### 8. Existing Queue Sweep Mechanism

```javascript
const QUEUE_SWEEP_MS = 5000; // 5s cadence
setInterval(tryPairAll, QUEUE_SWEEP_MS);
```

The sweep already runs every 5s. Adding a bot-timeout check within `tryPairAll()` (or as a parallel sweep) is straightforward.

## Architecture Decision

**Approach: Server-Side Bot with Dedicated Room Creation**

```
Queue sweep (every 5s):
  → For each entry with enqueuedAt > 15s ago
    → If no human pair available for this entry's stake
      → Pick a random available bot
      → Check/replenish bot wallet
      → Debit bot wallet for stake
      → createBotMatchRoom(humanEntry, botId, stake)
        → Create room, join human socket
        → Mark room as botMatch (internal flag)
        → Start bot ship placement (immediate, using genFleetPure)
        → Bot auto-readies after placement
        → Game proceeds with bot firing on a timer

Bot turn logic (in-room):
  → When it's bot's turn: setTimeout(botFire, random(2000, 5000))
  → botFire: pick target using random algo → call doShot internally
  → If hit: chain another botFire after delay
  → If miss: switch to human turn

Match end:
  → recordMatch(winnerId, loserId, ...) — same as PvP
  → Wallet credits/debits same as PvP
```

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Bot balance depletion | Auto-replenish to 1000 if < 100 before each match |
| All 10 bots busy | Extend wait, retry every 5s (BOT-QM-04) |
| Bot detection by players | Realistic names, 2-5s delay, no chat |
| Room cleanup if human disconnects mid-bot-match | Existing disconnect/forfeit logic handles it |
| doShot not designed for internal calls | Extract core logic; or emit internally |

## Files to Modify

| File | Changes |
|------|---------|
| `migrations/0XX_bot_accounts.sql` | New migration: add is_bot column + seed 10 bots + bot wallets |
| `server.js` | Bot queue timeout logic, createBotMatchRoom, bot turn loop, bot fire |
| `db.js` | getBotAccounts(), replenishBotWallet(), getAvailableBot() |
| `public/app.jsx` | Reduce BOT_OFFER_DELAY or remove (auto-match replaces manual offer) |
| `test/bot-helpers.js` | Already usable server-side (genFleetPure) |

## Implementation Order

1. **Database migration** — add is_bot, seed bots, create wallets
2. **Server-side bot logic** — createBotMatchRoom, bot placement, bot firing loop
3. **Queue timeout integration** — modify sweep to detect 15s timeout and trigger bot match
4. **Client-side cleanup** — remove/adjust the 30s manual bot offer

---
*Research complete. Ready for planning.*
