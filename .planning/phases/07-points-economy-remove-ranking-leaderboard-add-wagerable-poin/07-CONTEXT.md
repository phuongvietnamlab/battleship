# Phase 7: Points Economy — Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing Glicko-2 ranking system and leaderboard with a virtual points economy. Players earn and spend points through match wagering and in-game power-up purchases. This phase removes all ranked infrastructure and builds the new economy from scratch.

</domain>

<decisions>
## Implementation Decisions

### Point Balance & Storage
- Only signed-in users have a point wallet; guests play for free with no points system
- Starting balance: 500 points on account creation
- When balance = 0: can still create/join 0-stake games (play with friends), but no points earned on win — must wager to earn
- Storage: separate `wallets` table + `transactions` log table for full audit trail (not a column on `users`)

### Wagering Mechanics
- Host chooses a fixed stake from presets: 0 / 10 / 25 / 50 / 100 points
- Joiner must accept the stake to enter the room
- Winner receives 90% of pot; 10% is system fee (economy sink)
- Example: both wager 50 → pot=100, winner gets 90, system keeps 10
- Disconnect/forfeit: reconnect within grace window continues game normally; if 3 consecutive turn timeouts occur (existing forfeit logic), player loses and forfeits their wager
- Matchmaking queue: 2 types — free queue (anyone, 0 points) and wagered queue (choose stake level, matched with same stake, signed-in only with sufficient balance)

### Power-up Purchasing
- Keep existing random power-up spawn (~27%/turn in advance mode) unchanged
- Additionally: signed-in players can BUY power-ups with points mid-match at any time (not just on their turn)
- Purchased power-ups are used when it's the player's turn
- **Pricing model: NEEDS RESEARCH** — power-up pricing relative to wager stakes is an economy balance problem. If power-ups are too cheap relative to pot, buying always has positive expected value. Researcher must analyze optimal pricing model (options include: percentage of stake, fixed + cap, deducted from winnings, etc.)

### Removal Scope — Complete Clean Slate
- DROP `ratings` table and `rating_history` table
- DELETE `elo.js` file entirely
- REMOVE all leaderboard code: `buildLeaderboard()`, `getLeaderboard()`, `refreshLeaderboardCache()` from `db.js`
- REMOVE leaderboard Redis cache logic from `store.js`
- REMOVE leaderboard API endpoint and rate limiter from `server.js`
- REMOVE ranked queue type — replace with free + wagered queues
- REMOVE `getPlayerRating()` from `db.js`
- REMOVE ranked-mode guards, `RANKED_REQUIRES_CLASSIC`, ranked UI elements
- DELETE season reset CLI script (`npm run season-reset`)
- REMOVE all ranked-related test code from `test/queue.test.js`

### Queue Structure (replaces ranked/casual)
- **Free queue** — open to everyone (guests + signed-in), no points involved
- **Wagered queue** — signed-in only, choose stake level, system matches players at same stake level
- Room-code games (friends): host sets stake (0 allowed), joiner accepts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing ranked/leaderboard code (to be removed)
- `elo.js` — Glicko-2 pure function (entire file to delete)
- `db.js` — recordMatch ranked branch (lines ~483-560), leaderboard helpers (lines ~563-700), getPlayerRating (lines ~682-699)
- `server.js` — ranked queue constants (lines ~200-220), rankedWindow function (lines ~1144-1170), ranked guards in joinQueue handler
- `store.js` — leaderboard cache get/set methods
- `test/queue.test.js` — ranked queue tests

### Database migrations
- `migrations/` — existing migration files for ratings table schema

### Existing power-up system
- `server.js` — power-up spawn logic in advance mode
- `public/app.jsx` — power-up UI rendering and usage

</canonical_refs>

<research_topics>
## Research Topics

### Power-up Economy Balance (CRITICAL)
How to price in-match power-up purchases relative to wager stakes without creating a positive-EV exploit. Need to analyze:
- Fixed price vs percentage of stake vs deducted-from-winnings models
- Cap on purchases per match
- Impact on game fairness when one player buys and the other doesn't
- Whether advance mode should be restricted in wagered matches

### Transaction Atomicity
How to ensure wager deduction + match result + payout are atomic (prevent double-spend, ensure no points created from nothing). Likely same pattern as existing recordMatch transaction.

</research_topics>

<deferred>
## Deferred Ideas

- Daily login bonus / free refill — potential future retention feature
- Points decay over time — economy balancing if inflation occurs
- Points leaderboard (richest players) — decided against for now but could revisit
- Friends list integration with wagering — belongs in SOCL-01/02 phase

</deferred>

---

*Phase: 07-points-economy*
*Context gathered: 2026-06-05 via interactive discussion*
