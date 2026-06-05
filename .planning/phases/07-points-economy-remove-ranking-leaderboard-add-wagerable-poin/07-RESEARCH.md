# Phase 7: Points Economy — Research

**Researched:** 2026-06-05  
**Purpose:** Inform the planner with prescriptive, actionable findings  
**Key question:** How to price in-match power-up purchases without creating a positive-EV exploit

---

## 1. Economy Balance — Power-up Pricing Model (CRITICAL)

### 1.1 The Core Problem

In advance mode, power-ups spawn randomly (~27% chance per turn on the defender's board). The new system adds purchasable power-ups for points. If a power-up gives any win-rate advantage, and its price is below the expected value of that advantage times the pot, buying is always rational — creating a "pay-to-win-more" spiral that rewards the richer player.

### 1.2 Power-up Win-Rate Impact Analysis

Current power-ups and their approximate win-rate lift (standard 10×10 Battleship, 17 occupied cells, ~83 unoccupied): [ASSUMED — based on coverage geometry]

| Power-up | Effect | Approx. win-rate lift per use |
|----------|--------|-------------------------------|
| scatter | 3–5 random cells fired | +3–5% (high variance; many misses on random board) |
| cross | 5-cell plus pattern | +4–6% (guaranteed info on 5 cells; often 1–2 hits) |
| double | Next miss keeps turn | +2–3% (tempo advantage; you get one free miss) |
| reveal | Shows 1 hidden ship cell | +3–4% (eliminates one cell of search; guaranteed hit info) |
| mine | Opponent loses next turn | +2–3% (tempo theft; moderate since opponent still fires later) |

**Average power-up win-rate lift: ~3.5% per use.** [ASSUMED]

### 1.3 Expected Value Calculation

For a wagered match with stake S (each player wagers S; pot = 2S, winner receives 0.9 × 2S = 1.8S, net gain = 0.8S after deducting own wager):

- **EV of one power-up** = win_rate_lift × net_gain_from_winning = 0.035 × 0.8S = **0.028S**
- For S=100: one power-up is worth ~2.8 points in EV
- For S=50: one power-up is worth ~1.4 points in EV
- For S=10: one power-up is worth ~0.28 points in EV

### 1.4 Pricing Model Recommendation: **Fixed Price + Percentage Floor + Cap Per Match**

**Use this hybrid model:** [ASSUMED — derived from EV analysis]

```
purchase_price = max(FIXED_FLOOR, STAKE_PERCENTAGE × stake)
```

| Stake | FIXED_FLOOR (5 pts) | 15% of stake | Actual price charged |
|-------|---------------------|--------------|---------------------|
| 0 | 5 | 0 | 5 |
| 10 | 5 | 1.5 | 5 |
| 25 | 5 | 3.75 | 5 |
| 50 | 5 | 7.5 | 7.5 → round to **8** |
| 100 | 5 | 15 | **15** |

**Parameters:**
- `POWERUP_FIXED_FLOOR = 5` — minimum price regardless of stake
- `POWERUP_STAKE_PCT = 0.15` — 15% of stake when that exceeds the floor
- `POWERUP_CAP_PER_MATCH = 3` — maximum 3 purchases per player per match
- Round to nearest integer (server-side)

### 1.5 Why This Model Works

1. **Negative EV at all stake levels:** At stake=100, price=15 but EV=2.8. Buyer pays 5.4× the mathematical value. At stake=50, price=8 but EV=1.4. Buyer pays 5.7× value. The "fun premium" ensures the house (system) always wins on power-up sales. [ASSUMED]

2. **Cap prevents snowball:** 3 purchases max means max spend is 45 points in a 100-stake game (15×3). Even if all 3 give advantage, total EV gain is ~8.4 points vs 45 spent — still negative EV. [ASSUMED]

3. **Zero-stake games still cost points:** The floor of 5 ensures free-queue games aren't a source of free power-ups. Players burning points in 0-stake games is a healthy economy sink. [ASSUMED]

4. **Symmetric access:** Both players can buy up to the cap. If both buy 3, neither has a net advantage — both just spent points (additional economy sink). [ASSUMED]

### 1.6 Advance Mode in Wagered Matches

**Decision: Allow advance mode in wagered matches.** [ASSUMED — recommended]

Rationale:
- The old restriction (`RANKED_REQUIRES_CLASSIC`) existed because random power-up variance could swing Glicko-2 ratings unfairly. With a points economy, variance is acceptable — it's entertainment, not a competitive ladder.
- Purchasable power-ups only function in advance mode. Restricting advance mode in wagered matches would make the purchase system nearly useless.
- The negative-EV pricing ensures purchases don't break fairness.

### 1.7 Where Points Are Deducted

**Deduct from wallet balance at purchase time (not from winnings).** [ASSUMED — recommended]

Rationale:
- "Deducted from winnings" creates a perverse incentive: losing players buy freely since they have nothing to lose from their (already-lost) wager.
- "From balance" means players must have sufficient balance to buy, creating natural restraint.
- Server validates: `wallet.balance >= purchase_price` before granting power-up.

### 1.8 Summary of Economy Sinks

| Sink | Mechanism | Typical drain |
|------|-----------|--------------|
| System fee | 10% of pot on every wagered match | 2–20 pts/match |
| Power-up purchases | 5–15 pts per buy, up to 3/match | 15–45 pts/match (max) |
| Zero-balance lockout | Can't earn without wagering | Encourages careful spending |

Starting balance of 500 supports approximately 10–50 matches of wagered play before requiring consistent wins. This creates engagement pressure without hard-locking players. [ASSUMED]

---

## 2. Transaction System Architecture

### 2.1 Schema Design

**Use these tables:** [ASSUMED — standard double-entry pattern]

```sql
-- wallets: one row per signed-in user, created on account creation
CREATE TABLE wallets (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  balance     INTEGER NOT NULL DEFAULT 500 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- transactions: append-only audit log, never updated or deleted
CREATE TABLE transactions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL,  -- enum: signup_bonus, wager_debit, wager_win, wager_fee, powerup_purchase
  amount       INTEGER NOT NULL,  -- positive = credit, negative = debit
  balance_after INTEGER NOT NULL,  -- snapshot for audit trail
  reference_id TEXT,  -- match code or power-up type for traceability
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions (user_id);
CREATE INDEX idx_transactions_created_at ON transactions (created_at);
```

**Key design choices:**
- `balance` is INTEGER (no decimals — simplifies math, prevents floating-point drift) [ASSUMED]
- CHECK constraint `balance >= 0` prevents negative balances at the DB level [VERIFIED — Postgres CHECK constraints are enforced on UPDATE/INSERT]
- `balance_after` on each transaction enables audit reconciliation without scanning history [ASSUMED — standard pattern]
- `amount` uses signed integers: negative for debits, positive for credits [ASSUMED]

### 2.2 Transaction Types

| Type | Amount sign | When |
|------|-------------|------|
| `signup_bonus` | +500 | Account creation (once per user) |
| `wager_debit` | −stake | Entering wagered room/queue (locked at join) |
| `wager_win` | +pot×0.9 | Match won |
| `wager_loss` | 0 (no row needed) | Match lost (already debited) |
| `wager_refund` | +stake | Room disbanded before game starts, or opponent disconnects pre-start |
| `powerup_purchase` | −price | Mid-match power-up buy |

### 2.3 Atomic Transaction Pattern

**Use the same `pool.connect() + BEGIN/COMMIT/ROLLBACK + client.release()` pattern already established in `recordMatch`.** [VERIFIED — existing pattern in db.js]

Match end flow (single Postgres transaction):

```
BEGIN;
-- 1. Confirm match result
INSERT INTO matches (...) VALUES (...);
-- 2. Credit winner
UPDATE wallets SET balance = balance + $payout, updated_at = now() WHERE user_id = $winner_id;
INSERT INTO transactions (user_id, type, amount, balance_after, reference_id) 
  VALUES ($winner_id, 'wager_win', $payout, (SELECT balance FROM wallets WHERE user_id = $winner_id), $match_code);
-- 3. System fee is implicit (10% never credited to anyone)
COMMIT;
```

The wager debit happens at queue-join/room-join time (separate earlier transaction). This two-phase approach ensures:
- Players can't spend their wagered funds while in a match
- If the server crashes mid-match, refund logic can scan for unfinished matches with debited-but-not-resolved transactions [ASSUMED]

### 2.4 Double-Spend Prevention

1. **CHECK constraint** on `wallets.balance >= 0`: Postgres rejects any UPDATE that would go negative [VERIFIED]
2. **SELECT FOR UPDATE** on the wallet row when deducting:
   ```sql
   SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE;
   -- check balance >= required_amount in application code
   UPDATE wallets SET balance = balance - $amount ...
   ```
   The row lock prevents concurrent transactions from both succeeding [VERIFIED — standard Postgres advisory pattern]
3. **Unique constraint on reference_id + type** (optional — prevents double-crediting the same match win):
   ```sql
   CREATE UNIQUE INDEX idx_transactions_unique_ref ON transactions (user_id, type, reference_id) WHERE reference_id IS NOT NULL;
   ```

### 2.5 Power-up Purchase Mid-Match Flow

```
Client → socket.emit("buyPowerup", { type: "scatter" })
Server:
  1. Validate: player is in active game, mode === "advance"
  2. Calculate price: max(5, Math.round(0.15 * room.stake))
  3. Check purchase count < 3 for this player in this match
  4. BEGIN transaction:
     - SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE
     - If balance < price → ROLLBACK, emit error
     - UPDATE wallets SET balance = balance - price
     - INSERT INTO transactions (...)
     - COMMIT
  5. Grant power-up: player.inv[type]++
  6. Emit "inventory" update + "balanceUpdate" to buyer
  7. Emit "oppBoughtPowerup" to opponent (no type revealed — just a notification)
```

---

## 3. Queue Replacement Architecture

### 3.1 New Queue Structure

Replace the current `queues = { casual: Map, ranked: Map }` with: [ASSUMED]

```javascript
const queues = {
  free: new Map(),     // replaces "casual" — open to everyone
  wagered: new Map(),  // replaces "ranked" — signed-in only, keyed by stake level
};
```

The wagered queue needs sub-grouping by stake level. Two approaches:

**Recommended: Single Map with stake-level filtering in `findPair`.** [ASSUMED]

```javascript
// Entry includes stake field
const entry = { ..., stake: 50 };

// findPair("wagered") only pairs entries with matching stake
function findPair(type, entries) {
  if (type === "wagered") {
    // Group by stake, find first group with 2+ entries
    const byStake = {};
    for (const e of entries) {
      (byStake[e.stake] = byStake[e.stake] || []).push(e);
    }
    for (const group of Object.values(byStake)) {
      if (group.length >= 2) return [group[0], group[1]];
    }
    return null;
  }
  return entries.length >= 2 ? [entries[0], entries[1]] : null;
}
```

This is simpler than multiple Maps and reuses the existing sweep/cleanup infrastructure. [ASSUMED]

### 3.2 Balance Validation at Queue Entry

```javascript
socket.on("joinQueue", async (arg, cb) => {
  const type = arg.type === "wagered" ? "wagered" : "free";
  
  if (type === "wagered") {
    // Guard: must be signed in
    if (!socket.data.userId) return cb({ ok: false, code: "WAGERED_REQUIRES_ACCOUNT" });
    
    // Guard: valid stake preset
    const stake = [10, 25, 50, 100].includes(arg.stake) ? arg.stake : null;
    if (!stake) return cb({ ok: false, code: "INVALID_STAKE" });
    
    // Guard: sufficient balance (read wallet)
    const balance = await getWalletBalance(socket.data.userId);
    if (balance < stake) return cb({ ok: false, code: "INSUFFICIENT_BALANCE" });
    
    // Debit immediately (wager locked)
    const ok = await debitWager(socket.data.userId, stake, "queue");
    if (!ok) return cb({ ok: false, code: "INSUFFICIENT_BALANCE" });
    
    // ... enqueue with stake attached to entry
  }
});
```

### 3.3 Balance Changes While in Queue

**Debit at queue entry, not at match start.** [ASSUMED — recommended]

This eliminates the "balance changed while queuing" problem entirely:
- Points are deducted the moment the player joins the wagered queue
- If they leave the queue (leaveQueue / disconnect), refund immediately
- If matched, the debit is already done — no second check needed
- Prevents the race where a player queues at stake=100, then spends 50 on another tab

The `leaveQueue` and disconnect handlers must refund: [ASSUMED]
```javascript
// On leaveQueue or disconnect while in wagered queue:
if (entry.stake && entry.userId) {
  await refundWager(entry.userId, entry.stake, "queue_cancel");
}
```

### 3.4 Room-Code (Friend) Games

For private room-code games, the host sets stake at room creation:
- `createRoom` accepts `stake` param (0/10/25/50/100)
- If stake > 0: host's wager is debited at room creation
- Joiner sees the stake before joining; their wager is debited on `joinRoom`
- If joiner can't afford it → `INSUFFICIENT_BALANCE` error, not admitted
- If host cancels (closes room before opponent joins) → refund host

---

## 4. Code Removal Scope

### 4.1 Files to Delete Entirely

| File | Lines | Content |
|------|-------|---------|
| `elo.js` | 134 | Glicko-2 updateRatings pure function |
| `scripts/season-reset.js` | 78 | Season archive + soft-reset CLI |

[VERIFIED — these files exist and are isolated]

### 4.2 `db.js` — Code to Remove

| Section | Approx. lines | What |
|---------|---------------|------|
| `require("./elo")` | Line 16 | Import statement |
| `recordMatch` ranked branch | ~50 lines inside recordMatch | The `if (ranked && ...)` block that reads ratings, calls updateRatings, UPSERTs ratings rows, stamps rating columns |
| `buildLeaderboard()` | ~15 lines | Private Postgres query function |
| `getLeaderboard()` | ~20 lines | Redis-then-Postgres public function |
| `refreshLeaderboardCache()` | ~20 lines | Fire-and-forget cache refresh |
| `getPlayerRating()` | ~10 lines | Read rating/rd for queue seeding |
| Module exports | 3 entries | Remove `getLeaderboard`, `refreshLeaderboardCache`, `getPlayerRating` from exports |

[VERIFIED — all found in db.js source]

**Note:** `recordMatch` itself stays but loses the ranked branch. The match INSERT remains — matches are still recorded for history. The `ranked` parameter and rating snapshot columns become unused. Consider: keep `recordMatch` simpler (remove `ranked` param entirely, drop rating snapshot writes). [ASSUMED]

### 4.3 `server.js` — Code to Remove

| Section | Approx. lines | What |
|---------|---------------|------|
| Ranked queue constants | Lines ~200-216 | `RANKED_WINDOW_*`, `RANKED_PROVISIONAL_START` constants |
| `queues.ranked` Map | Line ~213 | Replace with `queues.wagered` |
| `leaderboardLimiter` + `leaderboardRateLimit` | Lines ~219-229 | Rate limiter for removed endpoint |
| `lbCache` in-process cache | Lines ~237-238 | Leaderboard RAM cache |
| `GET /api/leaderboard` route | Lines ~242-258 | Entire route handler |
| `rankedWindow()` function | Lines ~1144-1155 | ELO window width calculator |
| `findPair()` ranked branch | Lines ~1160-1175 | Rating-distance pairing logic |
| `emitQueueStatus()` | Lines ~1220-1235 | Sends windowWidth/waitSec to ranked entries |
| `joinQueue` ranked guards | Lines ~1375-1385 | `RANKED_REQUIRES_ACCOUNT`, `getPlayerRating` call |
| `createRoom` ranked guards | Lines ~1319-1323 | `RANKED_REQUIRES_CLASSIC`, `RANKED_REQUIRES_ACCOUNT` |
| `require('./db')` import | Line 11 | Remove `getLeaderboard`, `getPlayerRating` from destructured import |
| `TEST_EXPORTS` leaderboard entries | Lines ~1949-1953 | `leaderboardLimiter`, `getLbCache`, `resetLbCache` |

[VERIFIED — all found in server.js source]

### 4.4 `store.js` — Code to Remove

| Section | What |
|---------|------|
| `LEADERBOARD_KEY` constant | Line 14 |
| `LEADERBOARD_TTL` constant | Line 15 |
| `setLeaderboardCache()` function | Lines ~73-82 |
| `getLeaderboardCache()` function | Lines ~84-93 |
| Module exports | Remove both leaderboard cache functions |

[VERIFIED — found in store.js source]

### 4.5 Database Migration (New File: `006_points_economy.sql`)

```sql
-- 006_points_economy.sql: Drop ranked infrastructure, add points economy

-- Drop ranked tables (CASCADE handles FK from rating_history → seasons)
DROP TABLE IF EXISTS rating_history CASCADE;
DROP TABLE IF EXISTS seasons CASCADE;
DROP TABLE IF EXISTS ratings CASCADE;

-- Remove rating snapshot columns from matches (optional — or leave for historical data)
ALTER TABLE matches DROP COLUMN IF EXISTS winner_rating_before;
ALTER TABLE matches DROP COLUMN IF EXISTS winner_rating_after;
ALTER TABLE matches DROP COLUMN IF EXISTS loser_rating_before;
ALTER TABLE matches DROP COLUMN IF EXISTS loser_rating_after;

-- Add economy tables
CREATE TABLE IF NOT EXISTS wallets (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  balance     INTEGER NOT NULL DEFAULT 500 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_ref 
  ON transactions (user_id, type, reference_id) WHERE reference_id IS NOT NULL;

-- Add stake column to matches for wager tracking
ALTER TABLE matches ADD COLUMN IF EXISTS stake INTEGER DEFAULT 0;
```

[ASSUMED — standard Postgres DDL patterns; IF NOT EXISTS guards make it re-runnable]

### 4.6 Test Files to Modify/Remove

| File | Action |
|------|--------|
| `test/queue.test.js` | Remove entire "QUEUE-02 — ranked matchmaking" describe block (~90 lines). Remove ranked references from QUEUE-03 cleanup tests. Add new wagered queue tests. |
| `test/ranking.test.js` | Delete entire file (Glicko-2 + leaderboard tests) |
| Any test importing `elo.js` | Remove/rewrite |

[VERIFIED — test/queue.test.js and test/ranking.test.js exist]

### 4.7 `package.json` Changes

- Remove `"season-reset": "node scripts/season-reset.js"` from scripts [VERIFIED — found in package.json]

### 4.8 Client-Side (`public/app.jsx`) Changes

| Section | Action |
|---------|--------|
| `ranked.label`, `ranked.desc`, `ranked.guestHint` i18n keys | Remove (EN + VI) |
| `err.RANKED_REQUIRES_ACCOUNT`, `err.RANKED_REQUIRES_CLASSIC` | Remove |
| Ranked mode toggle in room creation UI | Replace with stake selector |
| Leaderboard display (if any client rendering) | Remove |
| Queue type selector (casual/ranked) | Replace with free/wagered + stake picker |

[VERIFIED — i18n keys found in app.jsx]

---

## 5. Power-up Purchase System — Server Design

### 5.1 Purchased vs Spawned Power-ups Coexistence

**Both systems feed the same inventory.** [ASSUMED — recommended for simplicity]

- Random spawns: appear on the board → collected when attacker shoots that cell → added to `player.inv[type]++`
- Purchases: bypass the board → added directly to `player.inv[type]++`
- Usage: identical for both — `useAbility` / aimed-shot with power consume from the same `inv` object

This means the existing `useAbility` handler, `emitInv`, and all power-up usage code is **unchanged**. Only the acquisition path is new. [VERIFIED — existing inv system is a simple counter per type]

### 5.2 New Socket.IO Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `buyPowerup` | Client → Server | `{ type: "scatter" }` | Request purchase |
| `buyPowerupResult` | Server → Client | `{ ok, type, price, newBalance }` or `{ ok: false, code }` | Result of purchase attempt |
| `balanceUpdate` | Server → Client | `{ balance }` | Push balance changes (purchase, wager debit, win) |
| `oppBoughtPowerup` | Server → Opponent | `{}` | Notify opponent that a purchase was made (no type leaked) |

### 5.3 Rate Limiting for Purchases

Reuse the existing `RateLimiterMemory` pattern: [VERIFIED — established pattern]

```javascript
const buyPowerupLimiter = new RateLimiterMemory({ points: 3, duration: 60 }); // 3/min per player
```

Combined with the cap of 3 per match, this prevents spam attempts.

### 5.4 Error Codes for Purchase

| Code | Meaning |
|------|---------|
| `INSUFFICIENT_BALANCE` | Wallet balance < price |
| `PURCHASE_CAP_REACHED` | Already bought 3 this match |
| `NOT_IN_GAME` | No active match |
| `NOT_ADVANCE_MODE` | Purchases only available in advance mode |
| `GUEST_NO_WALLET` | Guest players can't purchase |
| `RATE_LIMITED` | Too many attempts |

### 5.5 Match State Tracking

Add to room object: [ASSUMED]
```javascript
room.purchases = { [clientId]: 0 }; // count per player per match
room.stake = 50; // wager amount for this room
```

Reset on rematch (same as `room.powerups = {}` pattern already in place).

---

## 6. Wallet Initialization

### 6.1 When to Create Wallet

**Create wallet row in the same transaction that creates/promotes the account.** [ASSUMED — recommended]

Modify `linkOrPromoteAccount` and `createEmailAccount` to include:
```sql
INSERT INTO wallets (user_id) VALUES ($userId) ON CONFLICT (user_id) DO NOTHING;
INSERT INTO transactions (user_id, type, amount, balance_after) VALUES ($userId, 'signup_bonus', 500, 500);
```

The `ON CONFLICT DO NOTHING` handles the case where a user already has a wallet (e.g., they signed up with Google, then also linked email). [VERIFIED — ON CONFLICT is already used throughout db.js]

### 6.2 Balance API Endpoint

Add `GET /api/wallet` (authenticated):
```javascript
app.get("/api/wallet", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT balance FROM wallets WHERE user_id = $1", [req.session.userId]);
  res.json({ balance: rows.length > 0 ? rows[0].balance : 0 });
});
```

Also push balance via Socket.IO on connect (same as profile data). [ASSUMED]

---

## 7. Edge Cases and Failure Modes

### 7.1 Server Crash During Wagered Match

- Both players' wagers were debited at queue-join/room-join
- On restart, scan for matches that were debited but never resolved: `SELECT * FROM transactions WHERE type = 'wager_debit' AND reference_id NOT IN (SELECT reference_id FROM transactions WHERE type IN ('wager_win', 'wager_refund'))`
- Auto-refund orphaned debits on boot [ASSUMED — standard reconciliation]

### 7.2 Both Players Disconnect (Mutual Abandon)

- Existing behavior: room is swept after inactivity → destroyed
- New behavior: room destruction triggers refund for both players (no winner, no fee)
- This is already handled by `sweepRooms` — add a wager refund call to the sweep path [ASSUMED]

### 7.3 Mid-Match Power-up Purchase Fails (DB Error)

- Transaction ROLLBACK — wallet unchanged
- Emit `{ ok: false, code: "PURCHASE_FAILED" }` to client
- Game continues normally — no power-up granted [ASSUMED]

### 7.4 Race: Player Buys Power-up at Exact Moment Game Ends

- Server must check `room.started && !room.resolving` before processing purchase
- If game just ended, reject with `NOT_IN_GAME` [ASSUMED — mirrors existing `room.resolving` guard pattern]

---

## 8. Implementation Order Recommendation

**Suggested plan sequence:** [ASSUMED]

1. **Plan 01 — Database Migration + Wallet Infrastructure**  
   - Write migration `006_points_economy.sql`
   - Add `getWalletBalance`, `debitWallet`, `creditWallet` to db.js
   - Wire wallet creation into account creation flows
   - Add `GET /api/wallet` endpoint

2. **Plan 02 — Code Removal**  
   - Delete `elo.js`, `scripts/season-reset.js`
   - Strip ranked code from server.js, db.js, store.js
   - Remove ranked tests, leaderboard tests
   - Remove ranked i18n keys and UI elements

3. **Plan 03 — Wagering System + Queue Replacement**  
   - Replace ranked/casual queues with free/wagered
   - Implement wager debit on queue join, refund on leave
   - Add stake to room-code games (host sets, joiner accepts)
   - Record wager outcomes in match end flow

4. **Plan 04 — Power-up Purchase System**  
   - Add `buyPowerup` socket handler with balance check
   - Implement pricing formula and per-match cap
   - Add opponent notification
   - Wire balance updates to client

5. **Plan 05 — Client UI + Polish**  
   - Stake selector in lobby (replaces ranked toggle)
   - Balance display in header/lobby
   - Power-up shop button during advance-mode matches
   - Purchase confirmation UX

---

## 9. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Economy inflation (too many points entering) | Medium | 10% system fee + power-up purchases are sinks; starting balance is finite; 0-stake earns nothing |
| Economy deflation (players run out, churn) | Medium | Consider daily login bonus (deferred per CONTEXT.md) if retention drops |
| Power-up purchase griefing (buying to taunt, not to use) | Low | Cap of 3 per match limits spend; price is high relative to EV |
| Double-spend via concurrent socket events | Low | FOR UPDATE lock + CHECK constraint eliminates at DB level |
| Wagered queue starvation (no one at same stake) | Medium | Same solution as ranked window: after 30s, offer bot match or widen to adjacent stake? (deferred — let organic traffic determine) |

---

*Phase: 07-points-economy*  
*Research completed: 2026-06-05*
