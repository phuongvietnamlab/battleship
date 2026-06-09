# Phase 18 — Bot Quick Match — Summary

**Completed:** 2026-06-09
**Plans:** 3/3 complete

## What Was Built

### Plan 01: Database migration + Bot accounts
- Added `is_bot` column to `users` table
- Seeded 10 bot accounts with realistic Vietnamese/English names (Minh Anh, Hải Long, Thuỷ Tiên, Đức Mạnh, Quỳnh Như, Captain Jack, Sea Wolf, Admiral Fox, Storm Rider, Iron Anchor)
- Each bot has a wallet with 1000 pts initial balance
- Added `getAvailableBots()`, `replenishBotWallet()`, `getBotUserIds()` utilities in db.js

### Plan 02: Server-side bot engine + game loop
- Created `bot-engine.js` — pure functions for fleet generation, random targeting, fire delay
- `createBotMatchRoom()` — creates a room with human player + bot (virtual player, no socket)
- `startBotMatchGame()` — starts battle immediately when human places ships (no 3s countdown)
- `scheduleBotTurn()` / `executeBotShot()` — bot fires with 2-5s random delay, chains on hit
- Modified `armTurnTimer()` to auto-schedule bot shots instead of timing out the bot
- Bot match integrates with existing `doShot()`, `recordMatch()`, wallet debit/credit
- Disconnect/leave/timeout all properly clean up bot tracking and record the match

### Plan 03: Queue timeout + client cleanup
- `tryBotMatch()` runs every 5s in the queue sweep — after BOT_MATCH_TIMEOUT_MS (default 15s), auto-pairs waiting players with a random available bot
- Human-to-human pairing always takes priority
- Bot wallet auto-replenished to 1000 if below 100 before each match
- Removed the 30s manual "Play vs Bot" offer from queue screen (now silent auto-match)
- Added `BOT_MATCH_TIMEOUT_MS` to `.env.example`

## Files Changed

| File | Change |
|------|--------|
| `migrations/011_bot_accounts.sql` | New — seeds 10 bot accounts + wallets |
| `db.js` | Added getAvailableBots, replenishBotWallet, getBotUserIds |
| `bot-engine.js` | New — server-side fleet generation + targeting |
| `server.js` | Bot match creation, game loop, queue timeout, disconnect handling |
| `public/app.jsx` | Removed bot offer UI, botOfferVisible state, botOfferTimerRef |
| `.env.example` | Added BOT_MATCH_TIMEOUT_MS |

## Key Decisions

- **No virtual socket** — bot has `sid: null`, `emitToClient` becomes a no-op for bot (clean)
- **`armTurnTimer` handles bot scheduling** — when turn passes to bot, schedules shot instead of timer
- **Random targeting only (v1)** — simplest algorithm, can upgrade to 4-tier later
- **Real coin economy** — bot debit/credit uses same `debitWallet`/`recordMatch` path as PvP
- **Silent auto-match** — player never knows they're fighting a bot (BOT-QM-13)

## Commits

- `128173b` — feat(phase-18-p01): bot accounts migration + DB utility functions
- `c9edf2e` — feat(phase-18-p02): server-side bot engine + createBotMatchRoom + bot turn loop
- `f8c08d1` — feat(phase-18-p03): remove manual bot offer, add BOT_MATCH_TIMEOUT_MS config
