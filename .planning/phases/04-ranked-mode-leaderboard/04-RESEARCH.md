# Phase 4: Ranked Mode & Leaderboard - Research

**Researched:** 2026-06-03
**Domain:** Glicko-2 rating system, Redis leaderboard cache, Postgres schema migration, season reset CLI
**Confidence:** HIGH (core algorithm), HIGH (Redis patterns), HIGH (schema/integration), MEDIUM (Lichess threshold details)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Ranked designation via a `ranked` boolean on room creation (host toggle), mirroring the `room.mode` classic/advance pattern in `createRoom` (~line 1218). Phase-5 queue will later set the same flag.
- **D-02:** Guest block is server-authoritative reject + client hint. Named code `RANKED_REQUIRES_ACCOUNT`. Defense-in-depth: server rejects + client disables/hides toggle for guests.
- **D-03:** A match counts as ranked only if BOTH seats are signed in. Signed-in-vs-guest falls back to unranked.
- **D-04:** Ratings in a new `ratings` table keyed by `user_id` (FK PK): `rating`, `rd`, `volatility`, `games_played`, `updated_at`. Identity stays in `users`.
- **D-05:** Single rating pool, classic-mode-only ranked. Ranked + advance is rejected at room create.
- **D-06:** Snapshot ratings onto matches row. `005_rankings.sql` adds `winner_rating_before/after` and `loser_rating_before/after` via ALTER TABLE ADD COLUMN IF NOT EXISTS.
- **D-07:** Per-match immediate update, rating period = 1 game. Compute and write ratings in the same DB transaction as the match record (RANK-01). Accepted simplification vs canonical batch periods.
- **D-08:** RD-threshold placement gate (RANK-03). Provisional until RD drops below threshold (~RD < 110). Hidden from leaderboard, still rated normally.
- **D-09:** Redis-cached top-100 leaderboard (RANK-04). Refresh on rating change + ≤5-minute TTL fallback. Follows store.js patterns.
- **D-10:** Leaderboard ordered by rating `r` descending. No conservative `r − 2·RD` lower-bound.
- **D-11:** Soft-reset = `new_rating = 1500 + (old_rating − 1500) × factor` (factor ≈ 0.5) + RD reset high (~350).
- **D-12:** Archive to `rating_history` + `seasons` tables before reset. History never deleted.
- **D-13:** Admin trigger = CLI/npm script on server box. No public HTTP surface.

### Claude's Discretion

- Exact Glicko-2 constants beyond defaults (tau, convergence epsilon) — implement per Glickman paper; validate against Lichess reference (D-07).
- Exact column names/types, index choices, DDL for `ratings`/`rating_history`/`seasons` + matches ALTER.
- Redis cache key/structure (sorted set vs cached JSON), TTL value within ≤5-min ceiling, refresh-on-write trigger shape.
- Where rating-write helper and leaderboard read live (`db.js` exports).
- Exact provisional RD threshold (~110) and soft-reset blend factor (~0.5).
- Lobby UI shape for ranked toggle + leaderboard view (EN/VI i18n required).

### Deferred Ideas (OUT OF SCOPE)

- Ranked matchmaking queue + ELO-window pairing (QUEUE-01/02/03) — Phase 5.
- Per-mode rating pools / rankable advance mode (MODE-01) — v2.
- Profile rating display + rating-over-time graphs — later phase.
- Web admin UI / admin auth for season reset — out of scope; CLI script suffices (D-13).
- Conservative `r − 2·RD` leaderboard ordering — rejected for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RANK-01 | A player's Glicko-2 rating (rating, deviation, volatility) updates in the same transaction as the match record | `elo.js` pure function called inside `recordMatch`'s BEGIN/COMMIT block; see "Same-transaction rating write" pattern below |
| RANK-02 | Ranked mode requires a signed-in account (no guest ranked play) | `socket.data.userId` already available; `RANKED_REQUIRES_ACCOUNT` code follows named-error convention; enforced in `createRoom` + `joinRoom` |
| RANK-03 | A new ranked player completes placement matches before appearing on the leaderboard | RD-threshold gate: filter WHERE rd < 110 in leaderboard query; provisional players rated normally, just excluded from view |
| RANK-04 | A global leaderboard shows the top 100 players from a cache refreshed at least every 5 minutes | Redis `SET` with EX 300 (5 min TTL) + refresh-on-write; gracefully falls back to direct Postgres query when Redis unavailable |
| RANK-05 | Ranked ratings can be soft-reset for a new season after archiving prior history | CLI script: INSERT INTO rating_history (snapshot) → UPDATE ratings (blend) → INSERT INTO seasons (end record) |
</phase_requirements>

---

## Summary

Phase 4 introduces Glicko-2 ratings and a top-100 leaderboard to Battleship Online. The math is well-understood and the project's established patterns (single transaction, graceful degrade, named error codes) apply cleanly to every new capability.

**Glicko-2 at period=1** is a deliberate, Lichess-validated simplification. Lichess itself updates ratings immediately after every game; for a single-game period the formula reduces to standard Glicko-2 with `m=1` opponent, which is exactly what `elo.js` implements. The canonical Glickman worked example (r=1500, RD=200, vol=0.06, tau=0.5, three opponents rated 1400/1550/1700 with RD 30/100/300, outcomes W/L/L) yields r'≈1464.06, RD'≈151.52, vol'≈0.05999 — this is the gold-standard test vector for `elo.js`.

**Redis leaderboard** fits cleanly into the existing `store.js` pattern. For a top-100 board that refreshes on rating change with a ≤5 min TTL, a cached-JSON approach (one Redis key, `SET battleship:leaderboard JSON EX 300`) is simpler and more correct for this workload than a live sorted set — it avoids the metadata-join problem (display names live in `users`, not the sorted set), and the leaderboard is always consistent.

**Season soft-reset** is a standalone Node script reusing `db.js`. It is idempotent when the current season is already archived and safe because it reads the CONTEXT.md-locked blend factor at the top as a constant.

**Primary recommendation:** Write `elo.js` as ~40 lines of pure math, validate against the Glickman test vector, then extend `recordMatch` in `db.js` to call it inside the existing transaction when `ranked === true` and both userIds are non-null.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ranked flag on room | API / Backend | — | Server-authoritative; client toggle is UI hint only |
| Guest-block enforcement | API / Backend | Browser / Client | Server rejects; client disables toggle (defense-in-depth D-02) |
| Glicko-2 rating compute | API / Backend | — | Pure function called server-side inside DB transaction |
| Rating storage (`ratings` table) | Database / Storage | — | Persistent, FK to `users.id` |
| Match rating snapshot | Database / Storage | — | Written in same transaction as matches row (RANK-01) |
| Leaderboard cache | CDN / Static | Database / Storage | Redis primary; Postgres fallback |
| Leaderboard HTTP endpoint | API / Backend | — | Express GET endpoint, reads Redis cache |
| Provisional filter | API / Backend | — | WHERE rd < 110 in leaderboard query, not in compute path |
| Season reset | API / Backend | Database / Storage | CLI script; Node + db.js Pool |
| Lobby UI ranked toggle | Browser / Client | — | React state; disabled for guests |
| Leaderboard UI view | Browser / Client | — | React component, reads leaderboard endpoint |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `elo.js` (new, hand-written) | N/A | Pure Glicko-2 math | CONTEXT.md mandates a ~40-line pure function; no dependency overhead, fully testable |
| `pg` (Pool) | ^8.21.0 (installed) | Postgres transactions for rating writes | Already in use; `recordMatch` pattern directly reusable |
| `redis` | ^4.7.0 (installed) | Leaderboard JSON cache | Already in `store.js`; `client.set` / `client.get` with EX |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.1.8 (installed) | Unit tests for `elo.js` test vectors | Test suite already uses vitest; `test/elo.test.js` |
| `node:fs` + `node:readline` | built-in | CLI season-reset script | No new dependency; script at `scripts/season-reset.js` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written `elo.js` | `glicko2` npm pkg (v1.2.1, 2024) | Package is class-based and stateful; adapting it to a pure function for period=1 requires more code than writing the ~40-line math directly. Training data verified; package is 12 years old (2012 origin) and legitimate [ASSUMED — slopcheck unavailable]. Hand-written is simpler, shorter, and fully auditable. |
| Cached-JSON leaderboard | Redis sorted set (ZADD/ZRANGE) | Sorted set is better for live scores changing constantly (e.g. millions of updates/day). For Battleship with tens-to-hundreds of rated games/day and a top-100 board, the sorted-set approach requires a separate hash join to fetch display names — more code for no performance gain. Cached JSON wins here. |
| Redis cache | Postgres query on every request | 5-min cache is indistinguishable to players (explicitly called out in REQUIREMENTS.md "Out of Scope") and avoids lock contention on hot leaderboard queries during active periods. |

**Installation:** No new packages needed. All dependencies (`pg`, `redis`, `vitest`) are already in `package.json`.

---

## Package Legitimacy Audit

> No new npm packages are installed in this phase. All required libraries (`pg`, `redis`, `vitest`) are already present in `package.json`. `elo.js` is hand-written.

| Package | Registry | Age | Disposition |
|---------|----------|-----|-------------|
| `pg` ^8.21.0 | npm | ~13 yrs | Already installed — no action |
| `redis` ^4.7.0 | npm | ~12 yrs | Already installed — no action |
| `vitest` ^4.1.8 | npm | ~4 yrs | Already installed — no action |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable due to sandbox restrictions; the above packages are [ASSUMED] clean based on their established presence in the existing package-lock.json. No new packages are introduced.*

---

## Architecture Patterns

### System Architecture Diagram

```
Client (React)              Server (Express + Socket.IO)               Postgres / Redis
──────────────              ────────────────────────────               ───────────────
Lobby: ranked toggle ──► createRoom (server.js ~1218)
                           ├─ guard: ranked + advance → reject (D-05)
                           ├─ guard: ranked + guest userId → RANKED_REQUIRES_ACCOUNT (D-02)
                           └─ room.ranked = true

joinRoom ──────────────► joinRoom handler
                           └─ guard: room.ranked + guest userId → RANKED_REQUIRES_ACCOUNT

[game plays…]

doShot win / forfeit ──► recordMatch(wId, lId, reason, mode, startedAt, room.ranked)
                           └─ BEGIN TRANSACTION
                              ├─ INSERT INTO matches (…)
                              ├─ if ranked && wId && lId:
                              │    ├─ SELECT winner_rating, loser_rating FROM ratings
                              │    ├─ elo.js:updateRatings(winner, loser, 1, 0) → pure
                              │    ├─ UPDATE ratings (winner) SET rating, rd, vol, games_played
                              │    ├─ UPDATE ratings (loser)  SET rating, rd, vol, games_played
                              │    └─ UPDATE matches SET winner_rating_before/after, loser_rating_before/after
                              └─ COMMIT (or ROLLBACK + swallow — inherits D-07 best-effort)
                                 └─ refreshLeaderboardCache() ← fire-and-forget after commit

GET /api/leaderboard ──► Express handler
                           ├─ try: Redis GET battleship:leaderboard → parse JSON → respond
                           └─ miss/error: SELECT top 100 FROM ratings JOIN users WHERE rd < 110
                              └─ SET battleship:leaderboard JSON EX 300

refreshLeaderboardCache():
  Postgres top-100 query → Redis SET EX 300

Season reset CLI (npm run season-reset):
  node scripts/season-reset.js
  └─ BEGIN TRANSACTION
     ├─ INSERT INTO seasons (label, ended_at)  → get season_id
     ├─ INSERT INTO rating_history SELECT …, season_id FROM ratings
     ├─ UPDATE ratings SET rating = 1500 + (rating-1500)*BLEND, rd = 350, volatility = 0.06, games_played = 0
     └─ COMMIT
```

### Recommended Project Structure

```
/
├── elo.js                       # Pure Glicko-2 function (new, ~40 lines)
├── db.js                        # Add: recordRankedRatings(), getLeaderboard(), refreshLeaderboardCache()
├── server.js                    # Add: ranked flag in createRoom/joinRoom; pass room.ranked to recordMatch
├── store.js                     # Existing Redis client (reused for leaderboard cache)
├── scripts/
│   └── season-reset.js          # CLI: archive + soft-reset (new)
├── migrations/
│   └── 005_rankings.sql         # New: ratings, rating_history, seasons + ALTER matches
├── public/
│   └── app.jsx                  # Add: ranked toggle, leaderboard view, EN/VI strings
└── test/
    └── elo.test.js              # New: Glicko-2 unit tests with test vectors
```

### Pattern 1: Pure elo.js Function

**What:** Stateless function taking winner + loser current ratings and returning new ratings. No DB, no I/O, no side effects.

**When to use:** Called inside `recordMatch` transaction only when `ranked && both userIds non-null`.

```javascript
// elo.js — Pure Glicko-2 single-game rating update (RANK-01, D-07)
// Source: Glickman (2013) "Example of the Glicko-2 system", glicko.net/glicko/glicko2.pdf
// [CITED: glicko.net/glicko/glicko2.pdf]

const SCALE = 173.7178;   // converts r↔μ, RD↔φ [CITED: glicko.net]
const TAU   = 0.5;        // volatility change constraint (Glickman default) [CITED: glicko.net]
const EPS   = 0.000001;   // Illinois convergence epsilon [CITED: glicko.net Step 5]

// g(φ): dampening factor — reduces impact of opponents with high RD
// Formula: 1 / √(1 + 3φ²/π²)  [CITED: glicko.net Step 3]
function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// E(μ, μj, φj): expected score (logistic)  [CITED: glicko.net Step 3]
function E(mu, muj, phij) {
  return 1 / (1 + Math.exp(-g(phij) * (mu - muj)));
}

// Illinois bisection algorithm for new volatility σ'  [CITED: glicko.net Step 5]
function newVolatility(phi, sigma, delta, v) {
  const a = Math.log(sigma * sigma);
  const tau2 = TAU * TAU;
  function f(x) {
    const ex = Math.exp(x);
    const d2 = delta * delta;
    const phi2v = phi * phi + v + ex;
    return (ex * (d2 - phi * phi - v - ex)) / (2 * phi2v * phi2v) - (x - a) / tau2;
  }
  let A = a;
  let B = (delta * delta > phi * phi + v)
    ? Math.log(delta * delta - phi * phi - v)
    : a - TAU;
  // Bisect until |B - A| < EPS
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * f(A)) / (f(B) - f(A)); // Illinois step
    const fC = f(C);
    if (fC * f(B) < 0) { A = B; } else { f(A) * 0.5; /* Illinois halve */ }
    // Fallback: simple bisect when signs agree
    A = B; B = C;
    // Re-check convergence — implementation note: follow Glickman Step 5 exactly
  }
  return Math.exp(A / 2);
}

/**
 * updateRatings — compute new Glicko-2 ratings for one game (period = 1)
 *
 * @param {object} winner  { rating, rd, volatility }  — Glicko scale (r, RD, σ)
 * @param {object} loser   { rating, rd, volatility }
 * @returns {{ winner: {rating, rd, volatility}, loser: {rating, rd, volatility} }}
 *
 * All inputs/outputs in Glicko scale (r ∈ ~[1000,3000], RD ∈ [30,350]).
 * No DB, no I/O. Pure function — safe to unit-test in isolation.
 */
function updateRatings(winner, loser) {
  // Scale to Glicko-2 internal scale  [CITED: glicko.net Step 2]
  const mu_w  = (winner.rating - 1500) / SCALE;
  const phi_w = winner.rd / SCALE;
  const mu_l  = (loser.rating  - 1500) / SCALE;
  const phi_l = loser.rd / SCALE;

  // Compute for winner (outcome s=1 against loser)
  const gL = g(phi_l), gW = g(phi_w);
  const E_w = E(mu_w, mu_l, phi_l); // winner's expected score vs loser
  const E_l = E(mu_l, mu_w, phi_w); // loser's expected score vs winner

  // v: estimated variance (one opponent)  [CITED: glicko.net Step 3]
  const v_w = 1 / (gL * gL * E_w * (1 - E_w));
  const v_l = 1 / (gW * gW * E_l * (1 - E_l));

  // delta: estimated improvement  [CITED: glicko.net Step 4]
  const delta_w = v_w * gL * (1 - E_w);  // s=1, so (s - E) = (1 - E_w)
  const delta_l = v_l * gW * (0 - E_l);  // s=0, so (s - E) = (0 - E_l)

  // New volatility (Illinois algorithm)  [CITED: glicko.net Step 5]
  const sigma_w2 = newVolatility(phi_w, winner.volatility, delta_w, v_w);
  const sigma_l2 = newVolatility(phi_l, loser.volatility,  delta_l, v_l);

  // Pre-period RD (inflate by volatility)  [CITED: glicko.net Step 6]
  const phi_w_star = Math.sqrt(phi_w * phi_w + sigma_w2 * sigma_w2);
  const phi_l_star = Math.sqrt(phi_l * phi_l + sigma_l2 * sigma_l2);

  // New RD  [CITED: glicko.net Step 7]
  const phi_w2 = 1 / Math.sqrt(1 / (phi_w_star * phi_w_star) + 1 / v_w);
  const phi_l2 = 1 / Math.sqrt(1 / (phi_l_star * phi_l_star) + 1 / v_l);

  // New rating  [CITED: glicko.net Step 7]
  const mu_w2 = mu_w + phi_w2 * phi_w2 * gL * (1 - E_w);
  const mu_l2 = mu_l + phi_l2 * phi_l2 * gW * (0 - E_l);

  // Scale back to Glicko scale  [CITED: glicko.net Step 8]
  return {
    winner: { rating: mu_w2 * SCALE + 1500, rd: phi_w2 * SCALE, volatility: sigma_w2 },
    loser:  { rating: mu_l2 * SCALE + 1500, rd: phi_l2 * SCALE, volatility: sigma_l2 },
  };
}

module.exports = { updateRatings };
```

> **Implementation note:** The `newVolatility` function above is a skeleton showing the structure. The final implementation MUST follow Glickman Step 5 exactly (Illinois algorithm with the conditional A = B halving). Use the Python reference at `github.com/ryankirkman/pyglicko2/blob/master/glicko2.py` as a correctness cross-check. The function must produce vol' ≈ 0.05999 for the standard test vector.

### Pattern 2: Same-Transaction Rating Write

**What:** `recordMatch` in `db.js` is extended to accept a `ranked` flag and execute rating reads/writes inside the existing transaction — no new transaction, no new connection.

**When to use:** Every `recordMatch` call site; rating logic only fires when `ranked === true` and both IDs are non-null integers.

```javascript
// Inside recordMatch, after the INSERT INTO matches line, before COMMIT:
// Source: db.js transaction pattern (pool.connect → BEGIN/COMMIT/ROLLBACK/finally release)
// [CITED: C:\battleship\db.js lines 472-488]

if (ranked && winnerId != null && loserId != null) {
  // Read current ratings (upsert defaults if first ranked game)
  const DEFAULT = { rating: 1500, rd: 350, volatility: 0.06, games_played: 0 };
  const { rows: wRow } = await client.query(
    'SELECT rating, rd, volatility, games_played FROM ratings WHERE user_id=$1', [winnerId]
  );
  const { rows: lRow } = await client.query(
    'SELECT rating, rd, volatility, games_played FROM ratings WHERE user_id=$1', [loserId]
  );
  const wBefore = wRow[0] || DEFAULT;
  const lBefore = lRow[0] || DEFAULT;

  const { winner: wAfter, loser: lAfter } = updateRatings(wBefore, lBefore);

  // Upsert ratings (INSERT or UPDATE)
  const UPSERT = `
    INSERT INTO ratings (user_id, rating, rd, volatility, games_played, updated_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (user_id) DO UPDATE
      SET rating=$2, rd=$3, volatility=$4, games_played=$5, updated_at=now()
  `;
  await client.query(UPSERT, [winnerId, wAfter.rating, wAfter.rd, wAfter.volatility, (wBefore.games_played||0)+1]);
  await client.query(UPSERT, [loserId,  lAfter.rating,  lAfter.rd,  lAfter.volatility,  (lBefore.games_played||0)+1]);

  // Snapshot onto matches row
  await client.query(`
    UPDATE matches SET
      winner_rating_before=$1, winner_rating_after=$2,
      loser_rating_before=$3,  loser_rating_after=$4
    WHERE winner_id=$5 AND loser_id=$6 AND started_at=$7
  `, [wBefore.rating, wAfter.rating, lBefore.rating, lAfter.rating, winnerId, loserId, startedAt]);
}
```

### Pattern 3: Redis Leaderboard Cache (Cached-JSON)

**What:** After each rating write, fire-and-forget a cache refresh. On leaderboard read, return cached JSON if fresh; fall back to direct Postgres query and re-cache.

**When to use:** `GET /api/leaderboard` endpoint + post-commit callback in `recordMatch`.

```javascript
// In db.js — leaderboard helpers
// Source: store.js graceful-degrade pattern [CITED: C:\battleship\store.js]

const LEADERBOARD_KEY = 'battleship:leaderboard';
const LEADERBOARD_TTL = 300; // 5 minutes — satisfies RANK-04

async function buildLeaderboard(client) {
  // RD < 110 is the Lichess provisional threshold (D-08)  [CITED: lichess.org/faq]
  const { rows } = await client.query(`
    SELECT u.id, u.display_name, u.avatar_url,
           r.rating, r.rd, r.games_played
    FROM ratings r
    JOIN users u ON u.id = r.user_id
    WHERE r.rd < 110
    ORDER BY r.rating DESC
    LIMIT 100
  `);
  return rows;
}

async function refreshLeaderboardCache() {
  const { isEnabled, client: redisClient } = require('./store');
  const pgClient = await pool.connect();
  try {
    const rows = await buildLeaderboard(pgClient);
    const json = JSON.stringify(rows);
    if (isEnabled()) {
      await redisClient.set(LEADERBOARD_KEY, json, { EX: LEADERBOARD_TTL });
    }
    return rows;
  } catch (e) {
    console.error('[leaderboard] refresh failed:', e.message);
  } finally {
    pgClient.release();
  }
}

async function getLeaderboard() {
  try {
    if (require('./store').isEnabled()) {
      const cached = await require('./store').client.get(LEADERBOARD_KEY);
      if (cached) return JSON.parse(cached);
    }
  } catch (e) {
    console.error('[leaderboard] cache read failed:', e.message);
  }
  // Fallback: direct query
  const pgClient = await pool.connect();
  try {
    return await buildLeaderboard(pgClient);
  } finally {
    pgClient.release();
  }
}
```

> **Note on store.js:** `store.js` exports `init`, `isEnabled`, `saveSnapshot`, `loadSnapshot`. It does not directly expose the Redis client. The leaderboard cache should either be implemented in `store.js` (adding `setLeaderboard`/`getLeaderboard` exports) or use the pattern of checking `isEnabled()` and then using the module-level `client` variable. Recommended: add exports to `store.js` to keep Redis abstraction in one place.

### Pattern 4: Season Reset CLI Script

**What:** Standalone Node script; reads `db.js`, runs a single idempotent transaction.

**When to use:** Admin runs `npm run season-reset -- --label "Season 2"` on the server box (D-13).

```javascript
// scripts/season-reset.js
// Source: db.js transaction pattern [CITED: C:\battleship\db.js]

const BLEND = 0.5;      // D-11: factor toward default — locked at ~0.5
const RESET_RD = 350;   // D-11: RD reset to "unrated" width so ratings move freely

async function main() {
  const label = process.argv[2] || `Season-${Date.now()}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Insert season record (get season_id for history FK)
    const { rows: [season] } = await client.query(
      'INSERT INTO seasons (label, ended_at) VALUES ($1, now()) RETURNING id', [label]
    );
    // 2. Archive all current ratings to history (never delete)
    await client.query(`
      INSERT INTO rating_history (user_id, season_id, rating, rd, volatility, games_played, archived_at)
      SELECT user_id, $1, rating, rd, volatility, games_played, now() FROM ratings
    `, [season.id]);
    // 3. Soft-reset: blend toward 1500, reset RD and volatility
    await client.query(`
      UPDATE ratings SET
        rating      = 1500 + (rating - 1500) * $1,
        rd          = $2,
        volatility  = 0.06,
        games_played = 0,
        updated_at  = now()
    `, [BLEND, RESET_RD]);
    await client.query('COMMIT');
    console.log(`[season-reset] Season "${label}" archived and ratings soft-reset.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[season-reset] FAILED — rolled back:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
```

**Idempotency note:** The script is NOT fully idempotent (running twice archives twice). Add a season uniqueness guard (`UNIQUE(label)` on `seasons.label`) so a re-run with the same label fails at INSERT and rolls back cleanly — preventing double-archive without requiring extra application logic.

### Anti-Patterns to Avoid

- **Rating write outside the transaction:** Calling `recordMatch` then writing ratings separately risks a crash between the two writes, breaking atomicity (RANK-01 hard constraint).
- **Blocking `gameOver` on DB write:** Emit `gameOver` first, then write ratings best-effort (D-07). Never await rating writes on the critical path to the client.
- **Computing new volatility with batch opponents:** The Glickman paper's formula sums over all opponents in a period. For period=1 (one opponent), the sum has exactly one term — this is valid and matches Lichess's per-game update approach.
- **Exposing season-reset as HTTP:** D-13 explicitly rejects this. Keep it CLI-only.
- **Storing provisional players differently:** Provisional players are computed and stored normally; they are only filtered from the leaderboard view (`WHERE rd < 110`). No special column or flag needed.
- **Sorted set for leaderboard:** Attractive for large-scale boards but requires a separate hash join to fetch display names. For top-100 at Battleship's scale, cached JSON is simpler and produces a single round-trip to Redis.

---

## Glicko-2 Algorithm Reference

> [CITED: glicko.net/glicko/glicko2.pdf — Glickman (2013) "Example of the Glicko-2 system"]
> [CITED: lichess.org/forum — confirmed per-game update approach]
> [CITED: ryankirkman/pyglicko2 — reference Python implementation used for cross-check]

### Scale Conversions

| Direction | Formula |
|-----------|---------|
| r → μ (internal) | `μ = (r − 1500) / 173.7178` |
| RD → φ (internal) | `φ = RD / 173.7178` |
| μ → r (display) | `r = μ × 173.7178 + 1500` |
| φ → RD (display) | `RD = φ × 173.7178` |
| σ (volatility) | unchanged across scales |

### Algorithm Steps (period = 1)

1. **Scale down:** `μ = (r−1500)/173.7178`, `φ = RD/173.7178` [CITED: glicko.net Step 2]
2. **Compute g and E for each opponent j:**
   - `g(φj) = 1 / √(1 + 3φj²/π²)` [CITED: glicko.net Step 3]
   - `E(μ, μj, φj) = 1 / (1 + exp(−g(φj)(μ − μj)))` [CITED: glicko.net Step 3]
3. **Compute estimated variance v:**
   - `v = [Σ g(φj)² · E · (1 − E)]⁻¹` [CITED: glicko.net Step 3]
4. **Compute estimated improvement delta:**
   - `Δ = v · Σ g(φj) · (sj − E(μ, μj, φj))` [CITED: glicko.net Step 4]
5. **Compute new volatility σ' via Illinois algorithm** on function:
   - `f(x) = exp(x)(Δ²−φ²−v−exp(x)) / (2(φ²+v+exp(x))²) − (x − ln(σ²))/τ²` [CITED: glicko.net Step 5]
   - Solve `f(A) = 0` iterating until `|B − A| < ε = 0.000001` [CITED: glicko.net Step 5]
   - `σ' = exp(A/2)` [CITED: glicko.net Step 5]
6. **Pre-period RD:** `φ* = √(φ² + σ'²)` [CITED: glicko.net Step 6]
7. **New RD:** `φ' = 1 / √(1/φ*² + 1/v)` [CITED: glicko.net Step 7]
8. **New rating:** `μ' = μ + φ'² · Σ g(φj)(sj − E)` [CITED: glicko.net Step 7]
9. **Scale back:** `r' = μ' × 173.7178 + 1500`, `RD' = φ' × 173.7178` [CITED: glicko.net Step 8]

### Standard Test Vectors (Glickman Worked Example)

> Source: Glickman (2013) official paper. The values below are the canonical test vectors that `elo.js` MUST reproduce to pass unit tests.
> [CITED: glicko.net/glicko/glicko2.pdf — cross-confirmed by multiple independent implementations]

**Input (Player under test):**
- r = 1500, RD = 200, σ = 0.06, τ = 0.5

**Opponents (within one rating period):**
| j | r_j | RD_j | outcome s_j |
|---|-----|------|-------------|
| 1 | 1400 | 30  | 1 (win)     |
| 2 | 1550 | 100 | 0 (loss)    |
| 3 | 1700 | 300 | 0 (loss)    |

**Expected Outputs:**
- r' ≈ **1464.06**
- RD' ≈ **151.52**
- σ' ≈ **0.05999** (≈ 0.059996)

**Period=1 Test Vectors (one opponent, win):**

For `elo.js` which takes exactly one winner + one loser, derive simpler test vectors by running the formula with m=1. The standard paper example (3 opponents) remains the integration test; for unit testing `elo.js` specifically:

| Scenario | Winner (before) | Loser (before) | Winner (after, approx) | Loser (after, approx) |
|----------|-----------------|----------------|------------------------|----------------------|
| Equal rated | r=1500, RD=350, σ=0.06 | r=1500, RD=350, σ=0.06 | r≈1662, RD≈290 | r≈1338, RD≈290 |
| Strong vs weak | r=1800, RD=80, σ=0.06 | r=1200, RD=80, σ=0.06 | r≈1806, RD≈79 | r≈1194, RD≈79 |
| Upset win | r=1300, RD=150, σ=0.06 | r=1700, RD=80, σ=0.06 | r≈1419, RD≈140 | r≈1688, RD≈79 |

> [ASSUMED] The period=1 approximate output values above are derived from training-knowledge application of the Glicko-2 formulas. They must be validated by running the actual `elo.js` implementation against itself or a known-good reference (e.g., the Python pyglicko2 port) before being used as hard test expectations. Use them as order-of-magnitude sanity checks, not exact assertions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Illinois bisection algorithm | Custom iteration | Follow Glickman Step 5 exactly | Subtle convergence conditions (when `f(B) < 0` at init, bracket selection); incorrect implementation produces wrong volatility silently |
| Rating persistence | Raw SQL INSERT per function | Upsert pattern (INSERT ... ON CONFLICT DO UPDATE) | Race condition if two games finish simultaneously for same player; upsert is atomic |
| Redis TTL enforcement | Cron job or setTimeout | `SET key value EX 300` native TTL | Redis TTL is process-safe; setTimeout is not restart-safe |
| Guest-block enforcement | Only client-side | Server-side guard in `createRoom` + `joinRoom` | Client toggle is UX hint only; server guard is the authoritative check (CLAUDE.md: server-authoritative) |
| Season reset | Soft-delete / overwrite | Archive-then-reset (INSERT history, then UPDATE) | Regulatory/audit best practice; CONTEXT.md D-12 explicitly requires history to never be deleted |

**Key insight:** The most dangerous hand-roll here is the volatility iteration. An off-by-one in the Illinois convergence condition produces ratings that look plausible but drift incorrectly over time. Use the Glickman paper's pseudocode as the specification and cross-check against the Python reference.

---

## Common Pitfalls

### Pitfall 1: Transaction Scope Confusion
**What goes wrong:** Rating write succeeds but match INSERT fails (or vice versa), leaving the DB inconsistent — e.g., rating goes up but no match row is recorded.
**Why it happens:** Adding the rating write as a separate `await` after the `COMMIT` instead of before it.
**How to avoid:** All writes (matches INSERT, matches UPDATE for snapshots, ratings UPSERT) use the same `client` (not `pool`) inside the single `BEGIN`/`COMMIT` block.
**Warning signs:** Integration test shows ratings updated but no match row, or vice versa.

### Pitfall 2: Division-by-Zero in elo.js
**What goes wrong:** If `E(mu, muj, phij)` returns exactly 0 or 1, the variance `v = 1 / (g² · E · (1-E))` blows up.
**Why it happens:** Extreme rating differences cause `exp(−g(φ)(μ−μj))` → ∞ or 0.
**How to avoid:** Clamp E to `[0.001, 0.999]` before computing `v`. Add an explicit guard in `elo.js`.
**Warning signs:** `v = Infinity` → new rating = NaN → silent DB write of NaN (Postgres will reject it, triggering the swallow path).

### Pitfall 3: Provisional Filter Logic Inverted
**What goes wrong:** Provisional players appear on leaderboard, or established players are hidden.
**Why it happens:** `WHERE rd > 110` instead of `WHERE rd < 110`. RD starts HIGH (350) and falls with games — so high RD = provisional, low RD = established.
**How to avoid:** Comment the query: "RD < 110 = established = show on leaderboard; RD >= 110 = provisional = hide."
**Warning signs:** New accounts with zero games appear on the leaderboard immediately.

### Pitfall 4: gameOver Blocked by DB Write
**What goes wrong:** If the Postgres connection is slow (or unavailable), players wait indefinitely on the end screen.
**Why it happens:** Awaiting `recordMatch` before emitting `gameOver`.
**How to avoid:** Emit `gameOver` first (inherit Phase-3 D-07 order). The ranked rating write is inside `recordMatch` which is already called with `.catch(() => {})` — never throws to the caller.
**Warning signs:** Players report hanging end screens during DB maintenance.

### Pitfall 5: Double-Archive on Season Reset
**What goes wrong:** Running the season reset script twice archives the same ratings twice for the same season label, inflating history.
**Why it happens:** Script is not idempotent by default.
**How to avoid:** Add `UNIQUE(label)` constraint on `seasons.label`. The second INSERT INTO seasons fails at the constraint, rolling back the entire transaction before any ratings are archived.
**Warning signs:** `rating_history` has duplicate `(user_id, season_id)` rows.

### Pitfall 6: Redis Client Exposure
**What goes wrong:** Leaderboard code imports `store.js` and tries to call `client.set()` directly, but `client` is module-private in `store.js`.
**Why it happens:** `store.js` only exports `init`, `isEnabled`, `saveSnapshot`, `loadSnapshot`.
**How to avoid:** Add `setLeaderboard(json)` and `getLeaderboard()` exports to `store.js`, keeping the client encapsulated. Or add the leaderboard helpers to `db.js` and use a lazy `require('./store')` guard.
**Warning signs:** `TypeError: client is not defined` at leaderboard refresh.

### Pitfall 7: Ranked Flag on Advance-Mode Room
**What goes wrong:** A ranked advance game proceeds and ratings update, polluting the classic-only rating pool.
**Why it happens:** Missing guard in `createRoom` for `ranked && mode === 'advance'`.
**How to avoid:** In `createRoom`, if `arg.ranked && mode === 'advance'`, return `{ ok: false, code: 'RANKED_REQUIRES_CLASSIC' }`. Client should also prevent the combination.
**Warning signs:** D-05 violated — advance-mode rooms with `room.ranked = true` exist.

---

## Schema: 005_rankings.sql

> [ASSUMED] The exact column types and index choices below follow the project conventions from `001_identity.sql` and `004_matches.sql` but are research-stage recommendations, not locked DDL. The planner confirms final DDL.

```sql
-- 005_rankings.sql: Glicko-2 ratings, history, seasons + ALTER matches (RANK-01..05)
-- FK to users(id); all IF NOT EXISTS guarded; auto-picked by lexical migration runner.

-- ratings: one row per user, current rating (D-04)
CREATE TABLE IF NOT EXISTS ratings (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  rating      REAL    NOT NULL DEFAULT 1500,
  rd          REAL    NOT NULL DEFAULT 350,
  volatility  REAL    NOT NULL DEFAULT 0.06,
  games_played INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IDX_ratings_rating_desc ON ratings (rating DESC);
-- Leaderboard query: rating DESC WHERE rd < 110 — this covers the ORDER BY efficiently.

-- seasons: metadata for each competitive season (D-12)
CREATE TABLE IF NOT EXISTS seasons (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL UNIQUE,  -- idempotency guard for season-reset CLI
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

-- rating_history: snapshot of each player's rating at season end (D-12)
CREATE TABLE IF NOT EXISTS rating_history (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  season_id    INTEGER NOT NULL REFERENCES seasons(id),
  rating       REAL    NOT NULL,
  rd           REAL    NOT NULL,
  volatility   REAL    NOT NULL,
  games_played INTEGER NOT NULL,
  archived_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season_id)  -- prevent double-archive per user per season
);

CREATE INDEX IF NOT EXISTS IDX_rating_history_user_id ON rating_history (user_id);

-- ALTER matches: add rating snapshot columns (D-06)
-- IF NOT EXISTS: safe to re-run; does not affect existing rows (NULL allowed).
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS winner_rating_before REAL,
  ADD COLUMN IF NOT EXISTS winner_rating_after  REAL,
  ADD COLUMN IF NOT EXISTS loser_rating_before  REAL,
  ADD COLUMN IF NOT EXISTS loser_rating_after   REAL;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Batch Glicko-2 rating periods (weekly/monthly) | Per-match instant updates (Lichess-validated) | Lichess c. 2012 | Simplifies implementation; acceptable accuracy trade-off for period=1 |
| Redis sorted sets for leaderboards | Cached-JSON for small leaderboards (top-100) | — | Sorted sets win at scale; cached JSON wins for simplicity when full metadata join is needed |
| Manual season reset via DB console | CLI script with idempotency guard | — | Ops safety; script is reviewable, repeatable, rollback-safe |

**Deprecated/outdated:**
- `r − 2·RD` Glicko-1 conservative ordering: Glicko-2 with RD-threshold gate makes this unnecessary for leaderboard purposes. D-10 explicitly rejects it.
- Elo (single-number): No RD or volatility. Superseded for this use case.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Glicko-2 per-match (period=1) produces r'≈1464.06, RD'≈151.52, σ'≈0.05999 for the 3-opponent Glickman worked example | Code Examples / Test Vectors | elo.js test fails; reveals implementation bug before wiring to game |
| A2 | Period=1 approximate output values for equal-rated, strong-vs-weak, and upset-win scenarios | Code Examples | Test assertions need to be derived by running elo.js rather than hardcoded; use as order-of-magnitude sanity only |
| A3 | `glicko2` npm package (v1.2.1) is a legitimate, non-hallucinated package | Package Legitimacy Audit | Low risk — 12 years old, 158 GitHub stars, referenced in multiple authoritative sources. Not used in implementation (hand-written elo.js instead). |
| A4 | Redis `store.js` client is available as `client` module variable for leaderboard helpers | Architecture Patterns / Pitfall 6 | Implementation must inspect store.js exports and add new ones; planner should verify before final task design |
| A5 | Lichess provisional RD threshold is 110 (displayed ratings) vs 75/65 for leaderboard inclusion | Architecture Patterns | Lichess FAQ confirmed >110 = provisional for display; but leaderboard uses 75/65. For Battleship MVP, using 110 (provisional gate) as the single threshold is a conservative, defensible choice. Planner may adjust based on user discussion. |
| A6 | `UNIQUE(user_id, season_id)` constraint on `rating_history` prevents double-archive | Schema: 005_rankings.sql | Season reset script relies on this for idempotency; if constraint is absent, re-runs silently duplicate history rows |

---

## Open Questions

1. **Exact RD threshold for leaderboard visibility**
   - What we know: Lichess uses RD > 110 for "provisional" label on ratings, but uses RD < 75 (standard) / RD < 65 (variants) for leaderboard inclusion. These are two different thresholds.
   - What's unclear: Should Battleship use 110 (provisional gate) or a lower "established" threshold for leaderboard?
   - Recommendation: Use 110 for Phase 4 MVP (CONTEXT.md D-08 says "~RD < 110"). This is the provisional boundary; players reach it after ~5-10 games naturally. The planner can make this a named constant so it's easy to tune.

2. **`store.js` Redis client access pattern for leaderboard**
   - What we know: `store.js` exports `init`, `isEnabled`, `saveSnapshot`, `loadSnapshot`. The module-level `client` is private.
   - What's unclear: Best pattern — add exports to `store.js` or access `client` from `db.js` via a module-level reference.
   - Recommendation: Add `getLeaderboardCache()` / `setLeaderboardCache(json)` exports to `store.js`. Keeps Redis abstraction in one file, consistent with existing graceful-degrade pattern.

3. **`recordMatch` signature change — ranked parameter**
   - What we know: Current signature is `recordMatch(winnerId, loserId, reason, mode, startedAt)`. Phase 4 needs `ranked` flag.
   - What's unclear: Add as 6th positional param or as an options object.
   - Recommendation: Add `ranked = false` as 6th optional parameter (matches existing positional style). All four call sites in server.js pass `room.ranked` as the 6th arg; existing callers that omit it default to unranked (no behavior change).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | elo.js, scripts/season-reset.js | ✓ | v24.14.0 | — |
| npm | package scripts | ✓ | 11.9.0 | — |
| `pg` (Pool) | Rating writes, leaderboard query | ✓ (installed) | ^8.21.0 | — |
| `redis` client | Leaderboard cache | ✓ (installed) | ^4.7.0 | Direct Postgres query (graceful degrade) |
| `vitest` | elo.test.js | ✓ (installed) | ^4.1.8 | — |
| Postgres | migrations/005, rating writes | Assumed ✓ (Phase 1 prerequisite) | — | — |
| Redis server | Leaderboard cache | Assumed ✓ (EC2 self-host, always-available per CONTEXT.md) | — | Direct Postgres query |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:** Redis (leaderboard falls back to direct Postgres query; this is explicitly part of the design).

---

## Validation Architecture

> `nyquist_validation` is enabled (config.json `workflow.nyquist_validation` absent from config = true; key present and true).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.8 |
| Config file | `package.json` ("test": "vitest run") |
| Quick run command | `npx vitest run test/elo.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RANK-01 | Glicko-2 pure function produces correct r/RD/vol for Glickman worked example | unit | `npx vitest run test/elo.test.js` | ❌ Wave 0 |
| RANK-01 | Rating write + match insert are atomic — COMMIT succeeds or both roll back | integration (DB) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-01 | `recordMatch` with `ranked=true` updates `ratings` table and `matches` snapshot columns | integration (DB) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-02 | `createRoom` with `ranked=true` + guest userId=null returns `RANKED_REQUIRES_ACCOUNT` | unit (static, no DB) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-02 | Server.js `createRoom` handler contains `RANKED_REQUIRES_ACCOUNT` guard | static grep | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-03 | Leaderboard query excludes players with `rd >= 110` | unit / integration | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-04 | `getLeaderboard()` returns cached JSON on second call without DB round-trip | unit (mock Redis) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-04 | Leaderboard endpoint `GET /api/leaderboard` returns 200 with array | integration (HTTP) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-05 | Season reset archives current ratings and soft-resets correctly | integration (DB) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |
| RANK-05 | Season reset is idempotent — second run with same label rolls back | integration (DB) | `npx vitest run test/ranking.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run test/elo.test.js` (pure function, fast, no DB)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/elo.test.js` — unit tests for `elo.js` Glicko-2 pure function (RANK-01 math)
- [ ] `test/ranking.test.js` — integration tests for ratings table, leaderboard endpoint, season reset (RANK-01..05)
- [ ] `elo.js` — the pure function itself (Wave 0 creates the file stub that turns RED)

*(Existing `test/match.test.js` covers MATCH-01/03 and the Phase-3 `recordMatch` contract — no changes needed there.)*

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` (config.json).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `socket.data.userId` (Phase 2 Passport sessions); ranked requires non-null userId |
| V3 Session Management | no | Session handling complete in Phase 2; no new session surface |
| V4 Access Control | yes | `RANKED_REQUIRES_ACCOUNT` enforced server-side in `createRoom`/`joinRoom`; CLI script has no HTTP surface |
| V5 Input Validation | yes | `ranked` flag coerced to boolean (never trusted as-is); `label` parameter in season-reset script sanitized before SQL bind |
| V6 Cryptography | no | No new crypto; existing bcrypt/session unchanged |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Guest claims ranked eligibility by forging userId | Spoofing | Server reads `socket.data.userId` from the server-set session, never from client payload |
| Leaderboard endpoint DDoS (hammering `/api/leaderboard`) | Denial of Service | Cache-first: every request within TTL hits Redis only; no Postgres lock contention. Rate-limiting via existing `rate-limiter-flexible` patterns can be applied. |
| Season reset script exposed as HTTP endpoint | Elevation of Privilege | D-13 explicitly rejects HTTP exposure; script only runs via `node scripts/season-reset.js` on the server box |
| SQL injection in leaderboard/rating queries | Tampering | All params bound as `$N`; never string-concatenated (existing CLAUDE.md convention) |
| Double-spend: run season reset twice, double-archive | Tampering / Data integrity | `UNIQUE(label)` on `seasons.label` + `UNIQUE(user_id, season_id)` on `rating_history` prevents duplicate archives |

---

## Sources

### Primary (HIGH confidence)

- [CITED: glicko.net/glicko/glicko2.pdf] — Glickman (2013) "Example of the Glicko-2 system" — algorithm steps, scale conversions, Illinois convergence, worked example test vectors (r'≈1464.06, RD'≈151.52, σ'≈0.05999)
- [CITED: C:\battleship\db.js] — transaction pattern (BEGIN/COMMIT/ROLLBACK/finally release), recordMatch graceful-degrade shape, single Pool
- [CITED: C:\battleship\store.js] — Redis client + graceful-degrade pattern for leaderboard cache
- [CITED: C:\battleship\.planning\phases\04-ranked-mode-leaderboard\04-CONTEXT.md] — all locked decisions D-01..D-13
- [CITED: C:\battleship\migrations\004_matches.sql] — existing schema, anticipates 005 ALTER
- [CITED: C:\battleship\migrations\001_identity.sql] — migration conventions (IF NOT EXISTS, SERIAL PK, FK)
- [CITED: redis.io/docs/latest/develop/use-cases/leaderboard/] — Redis sorted set commands, cached-JSON vs sorted-set tradeoffs
- [CITED: lichess.org/faq] — confirmed RD > 110 = provisional; RD < 75 (standard) for established leaderboard

### Secondary (MEDIUM confidence)

- [CITED: lichess.org/forum/lichess-feedback/glicko-2-rating-periods] — Lichess per-game update approach, 4.6-day nominal period, fractional-period formula `sqrt(phi² + t·sigma²)`
- [CITED: github.com/sublee/glicko/blob/master/glicko2.py] — reference Python implementation confirming SCALE=173.7178, TAU=0.5, EPSILON=0.000001, g() and E() formulas
- [CITED: github.com/ryankirkman/pyglicko2/blob/master/glicko2.py] — Illinois bisection algorithm reference for newVolatility
- [CITED: github.com/mmai/glicko2js] — glicko2 npm package, v1.2.1 (2024), 12-year-old legitimate package, class-based API unsuitable for direct use as elo.js

### Tertiary (LOW confidence / ASSUMED)

- [ASSUMED] Period=1 approximate output values (equal-rated, strong-vs-weak, upset-win) — derived from applying the formulas; must be validated by running actual elo.js
- [ASSUMED] `glicko2` npm package safety (not slopcheck-verified due to sandbox; established by age and stars)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all dependencies verified installed
- Algorithm (elo.js): HIGH for formula structure; MEDIUM for the period=1 output approximations (must be validated by running the code)
- Architecture/integration: HIGH — directly follows established db.js/store.js patterns
- Lichess threshold detail: MEDIUM — confirmed 110 for provisional label; leaderboard threshold (75/65) requires judgment call for Battleship MVP

**Research date:** 2026-06-03
**Valid until:** 2026-09-03 (Glicko-2 algorithm is stable; Redis and pg APIs are stable)
