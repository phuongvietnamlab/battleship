# Phase 3: Match Recording - Research

**Researched:** 2026-06-02
**Domain:** PostgreSQL match persistence, server-side game-end hooks, idempotent write pattern
**Confidence:** HIGH (all findings verified against live codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Lean + Phase-4-ready schema. Store per match: both player `user_id`s, `winner_id`, `loser_id`, `reason`, `mode` (classic vs advance), `started_at`, `ended_at`. No move-by-move log, no per-shot stats. Schema must leave room for Phase 4 Glicko rating columns / same-transaction rating write (RANK-01) without a breaking migration.
- **D-02:** `reason` is a small named taxonomy (text enum-style, validated server-side, not free text): `normal`, `timeout`, `disconnect`, `leave`. Mirrors the existing `reason` string already passed to `endGameForfeit`/`gameOver`.
- **D-03:** Record **all** started 2-player server games, attributed by `users.id` for both seats — guests included. Bot/single-player excluded (no server room).
- **D-04:** Resolve each seat's `user_id` at match-write time: signed-in player → `socket.data.userId` (set in Phase 2); guest → lookup `credentials WHERE type='guest' AND external_id = clientId`. If a seat's `user_id` cannot be resolved, the match is not written — recording is best-effort and must never block play (see D-07).
- **D-05:** Only record games that **actually started battle** (`room.started === true` at time of end, or was `true` — see research note below on `leaveRoom`). Lobby/placement abandonments write no match row.
- **D-06:** Exactly **one** match row per game. All server end paths converge through one idempotent `recordMatch`-style helper in `db.js`. Guard with `room.recorded` flag set in the same critical section so racing paths cannot double-write.
- **D-07:** Emit `gameOver` to players **first**, then write match record best-effort in a **single transaction**. Slow/failed/unavailable DB write must never block or break the end-game screen. When `DATABASE_URL` is unset the writer no-ops + logs. DB errors are caught, logged with `[match]` prefix, and swallowed.

### Claude's Discretion

- Exact column names/types, index choices, and the precise `matches` DDL — researcher/planner decide, honoring D-01/D-02 and the existing migration conventions.
- The dedup mechanism's exact shape (room flag vs DB unique constraint vs both) — implementation detail honoring D-06.
- Where the match-write helper lives (`db.js` export following parameterized-query + single-Pool convention).
- Whether `started_at` derives from an existing room timestamp or a new one captured at battle start.

### Deferred Ideas (OUT OF SCOPE)

- Glicko-2 rating computation + same-transaction rating write (RANK-01) — Phase 4.
- Match history / win-loss surfacing on the profile screen — later phase.
- Per-game statistics (shots, hits, duration) — not needed for ratings.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-01 | Every completed game writes a match record (players, winner, reason) in a single transaction | DDL design, `recordMatch` helper pattern, three call sites in server.js |
| MATCH-03 | A disconnect that exceeds the grace window is recorded as an explicit forfeit loss | `scheduleSeatRelease` extension pattern, userId derivation at grace expiry |

</phase_requirements>

---

## Summary

Phase 3 writes exactly one `matches` row to Postgres whenever a 2-player server game reaches a terminal state (normal win, 3-timeout forfeit, deliberate leave, or grace-window disconnect). The write is best-effort and fire-and-forget — `gameOver` emits first, then the helper runs. No new UI is needed; the output is a database row consumed by Phase 4 ratings.

The codebase has three distinct game-end paths in `server.js`:

1. **Normal win** (`doShot`, line 1116): `win = sunkCount >= FLEET.length` — sets `room.started = false`, emits `gameOver`, returns. Currently no match write.
2. **Forfeit: timeout + leave** (`endGameForfeit`, line 1047): called from `onTurnTimeout` (after 3 consecutive timeouts) with `reason='timeout'`. Currently, `leaveRoom` does NOT call `endGameForfeit` — it removes the player directly and sets `room.started = false` (see critical finding below). The CONTEXT references `endGameForfeit` as the leave record point, but the current code will require `leaveRoom` to be extended to call it or record inline.
3. **Disconnect grace expiry** (`scheduleSeatRelease` timeout callback, line 730): currently frees the seat and emits `opponentLeft`. Must be extended to record a `disconnect` forfeit before clearing.

**Primary recommendation:** Add `recordMatch(room, winnerId, loserId, reason)` to `db.js` exports; call it at each of the three end sites in `server.js` after `gameOver` emits; guard with `room.recorded` in-memory flag; no-op when `DATABASE_URL` unset.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Match record write | API / Backend (`server.js` + `db.js`) | — | Server-authoritative: only the server knows the true game outcome |
| `matches` schema DDL | Database / Storage (`migrations/004_matches.sql`) | — | Follows established migration-runner convention |
| `user_id` resolution | API / Backend (`db.js` helper) | — | Credential lookup is a DB operation; guest lookup mirrors existing CTE pattern |
| `room.recorded` dedup flag | API / Backend (in-memory, `server.js`) | — | In-process flag guards racing same-process paths; DB UNIQUE is belt-and-suspenders |
| Graceful no-op when DB absent | API / Backend (`recordMatch` guard) | — | Mirrors store.js/mailer.js pattern — DATABASE_URL check at call time |

---

## Standard Stack

### Core (already installed — no new packages)

| Library | Version (live) | Purpose | Why Standard |
|---------|----------------|---------|--------------|
| `pg` | ^8.21.0 [VERIFIED: package.json] | Postgres client, `pool.connect()` → transaction | Already used in `db.js` for all existing queries |
| `vitest` | ^4.1.8 [VERIFIED: package.json] | Test runner | Established test infrastructure (serial, `fileParallelism: false`) |

**No new packages are needed.** Phase 3 extends `db.js` and `server.js` using patterns already in the codebase.

### Installation

```bash
# No new installs required.
```

---

## Package Legitimacy Audit

> No new packages are introduced in this phase. All capabilities are implemented via existing dependencies (`pg`, already installed and in production).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Game ends (3 paths)
        │
        ▼
[1] doShot (win)        [2] leaveRoom / endGameForfeit   [3] scheduleSeatRelease grace expiry
        │                          │                                │
        │    emit gameOver first   │                                │
        └──────────────────────────┴────────────────────────────────┘
                                   │
                                   ▼
                         room.recorded? → YES → skip (dedup)
                                   │ NO
                                   ▼
                         recordMatch(room, winnerId, loserId, reason)
                          in db.js — checks DATABASE_URL
                                   │
                  ┌────────────────┴────────────────────────┐
                  │ DB available                             │ DB absent / error
                  ▼                                         ▼
        pool.connect → BEGIN                    log [match] skip → return
        resolve user_ids (signed-in: socket.data.userId;
                          guest: SELECT from credentials)
        INSERT INTO matches (...)
        COMMIT → room.recorded = true           ROLLBACK + log [match] err
                                                room.recorded = false (retry not attempted)
```

### Recommended Project Structure

```
migrations/
├── 001_identity.sql       # existing
├── 002_accounts.sql       # existing
├── 003_email_accounts.sql # existing
└── 004_matches.sql        # NEW — matches table

db.js                      # add: recordMatch() export
server.js                  # extend: 3 game-end sites + scheduleSeatRelease
test/
└── match.test.js          # NEW — recordMatch unit + DB integration tests
```

### Pattern 1: Transaction Write in db.js (reuse from linkOrPromoteAccount)

**What:** `pool.connect()` → `BEGIN` → queries → `COMMIT`, with `ROLLBACK` in catch and `client.release()` in finally.
**When to use:** Any multi-step write that must be atomic.

```javascript
// Source: db.js line 157-236 (linkOrPromoteAccount) — exact pattern to reuse
async function recordMatch(winnerId, loserId, reason, mode, startedAt, endedAt) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO matches (winner_id, loser_id, reason, mode, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [winnerId, loserId, reason, mode, startedAt, endedAt]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[match] recordMatch failed:", e.message);
  } finally {
    client.release();
  }
}
```

**Why:** Follows CLAUDE.md flat-structure convention — no barrel/util files. New helper lives directly in `db.js`, exported via `module.exports`.

### Pattern 2: Graceful No-Op Guard (reuse from store.js / mailer.js)

**What:** Check dependency availability at call time; log and return early if absent.
**When to use:** Every optional-feature entry point.

```javascript
// Source: store.js line 44-51, mailer.js line 25-29 — established pattern
async function recordMatch(...) {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    // Match write skipped — no DATABASE_URL/PGHOST configured
    return;
  }
  // ... pool.connect transaction
}
```

**Note:** The actual no-op check should mirror how `db.js` initialises the pool — check whether `DATABASE_URL` or discrete `PG*` vars are set. [ASSUMED] A simple `process.env.DATABASE_URL` guard is sufficient per the existing pool config logic (`db.js` lines 22-32).

### Pattern 3: In-Memory Idempotency Flag (room.recorded)

**What:** Set `room.recorded = true` after a successful write (or after the write attempt returns, to block double-attempts from racing paths).
**When to use:** All three call sites check `if (room.recorded) return` before calling `recordMatch`.
**Critical section:** Set the flag synchronously before `await recordMatch(...)` — this prevents racing synchronous entry from a simultaneous event. The flag stays `true` even if the async write fails (best-effort: no retry).

```javascript
// In server.js at each game-end site:
if (!room.recorded) {
  room.recorded = true;           // synchronous guard — set before await
  // ... gather winnerId, loserId, reason, mode, startedAt
  recordMatch(winnerId, loserId, reason, mode, room.startedAt, new Date())
    .catch(() => {}); // fire-and-forget; errors already logged inside recordMatch
}
```

**Why not DB UNIQUE alone:** A unique constraint catches duplicate INSERTs but doesn't prevent two concurrent transactions from both attempting the INSERT simultaneously (both read `room.recorded = false`, both proceed). The in-memory flag is a first line of defense within the single Node.js process.

**Optional belt-and-suspenders:** A `UNIQUE(winner_id, loser_id, started_at)` constraint on `matches` catches any race that slips past the flag (e.g., after a server restore). This is safe to add and recommended.

### Pattern 4: `started_at` Capture

**What:** Room has no `startedAt` timestamp today. It must be added when `room.started` flips to `true`.
**Where:** `server.js` line 1315 — `room.started = true` in the `placeShips` handler (`allReady` branch).
**How:** `room.startedAt = new Date();` added on the same line as `room.started = true`.

```javascript
// server.js ~line 1315
room.started = true;
room.startedAt = new Date(); // NEW — captured once per battle, used in recordMatch
```

**Why not existing timestamp:** `room.lastActivityAt` (touches on every action — `touchRoom`) and `rooms[code].lastActivityAt` are activity stamps, not battle-start stamps. No existing `startedAt`-equivalent field exists on the room object. [VERIFIED: codebase grep, room creation at line 1181, restoreRooms at line 814]

### Pattern 5: `leaveRoom` Does NOT Currently Call `endGameForfeit` — Critical Finding

**What was found:** The current `leaveRoom` handler (line 1506-1531) removes the player directly from the room and emits `opponentLeft`. It does NOT call `endGameForfeit`. The CONTEXT states "endGameForfeit (~1047, timeout + leave)" as the leave forfeit record point — this means Phase 3 must either:
  - Route `leaveRoom` through `endGameForfeit` (changing behavior: opponent gets a `gameOver` with `win:true`), OR
  - Call `recordMatch` inline in `leaveRoom` when `room.started` is true at leave time

**Important timing:** At the moment `leaveRoom` fires, `room.started` is still `true` (it's set to `false` later in the same handler, line 1521). So the guard `room.started === true` check must happen BEFORE `room.started = false` is set.

**Recommendation (planner discretion):** Route `leaveRoom` through `endGameForfeit` — it already does the `room.started = false`, `room.turn = null` cleanup, plus emits `gameOver` with `win:true` to the winner. This aligns with the CONTEXT intent and avoids duplicate cleanup logic. The current `leaveRoom` would then call `endGameForfeit(room, clientId, 'leave')` when `room.started` is true, then continue with the seat-removal logic.

### Pattern 6: userId Resolution in scheduleSeatRelease

**What:** The grace-expiry timeout in `scheduleSeatRelease` is a closure that captures `room`, `code`, and `clientId`. At fire time, the absent player's socket is gone — `socket.data.userId` is unavailable.

**Resolution:** The absent player's `userId` must be stored on the player seat at connect time, or looked up from the DB in the `recordMatch` helper using the `clientId`.

**Options (planner discretion):**

Option A — **Store userId on seat at join/create time (recommended):** When a player joins or creates a room, write `room.players[clientId].userId = socket.data.userId` (integer for signed-in, `null` for guest at that instant). At match-write time, resolve: if `p.userId` is set use it; otherwise fall back to credential lookup.

Option B — **Always resolve from DB inside `recordMatch`:** Pass both `clientId` values to `recordMatch`; the helper looks up `credentials WHERE type='guest' AND external_id=$1` for any null userId. This adds a DB round-trip per seat but keeps the seat object unchanged.

**Research recommendation:** Option A, because it avoids an extra query, mirrors how `socket.data.userId` is already read at connect time, and the seat object already carries per-player transient state (`timeouts`, `bonus`, etc.). One line per join/create: `room.players[clientId].userId = socket.data.userId`.

**Note on D-04 unresolvable seat:** If `userId` is null AND the credential lookup returns no row (rare: guest upsert failed at connect time), skip the match write entirely and log `[match] unresolvable user_id for clientId — skipping`. This matches the D-04 spec exactly.

### Anti-Patterns to Avoid

- **Blocking gameOver on DB write:** Must never `await recordMatch()` before emitting `gameOver`. Emit first, write after.
- **Per-request pool connections:** Never `new Pool()` inside `recordMatch` — use the module-level `pool` from `db.js` (existing constraint from Phase 1 decision).
- **Free-text reason strings:** Always use one of: `'normal'`, `'timeout'`, `'disconnect'`, `'leave'`. No other values.
- **Writing match for lobby/placement abandonment:** Guard `if (!room.started)` — don't record games that never got to the battle screen.
- **Calling recordMatch for bot games:** Bot games run client-side — no server room is created, so this path is never hit. No explicit guard needed, but document it.
- **Setting `room.recorded = false` after a write failure:** Keep it `true` even on DB failure. The flag's purpose is to prevent double-writes, not to enable retries. Retrying a failed match write is out of scope (D-07: best-effort).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic single-write | Custom retry/queue logic | `pool.connect` BEGIN/COMMIT with catch+swallow | One transaction is sufficient; retries are explicitly out of scope (D-07 best-effort) |
| Dedup | Distributed lock / external queue | In-memory `room.recorded` flag + optional DB UNIQUE | Single-process Node.js; in-memory flag is safe within one process |
| `user_id` resolution | Custom auth lookup middleware | Direct `pool.query` parameterized SELECT from credentials | Existing pattern in `upsertGuestCredential` and `linkOrPromoteAccount` |
| Migration | Manual SQL execution | Drop `004_matches.sql` in `migrations/` — runner picks it up automatically | Migration runner already handles lexical-sort, applied-once (DATA-02) |

**Key insight:** This phase adds ~80 lines total across `db.js` (helper), `server.js` (3 call sites + `placeShips` timestamp), and one migration file. The infrastructure is already there.

---

## Exact DDL Recommendation: `004_matches.sql`

**Convention verified against live migrations:** [VERIFIED: codebase]
- File header comment on line 1 naming the file and requirement IDs
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for additive changes
- `CREATE TABLE IF NOT EXISTS` for new tables
- Inline comments on nullable/reserved columns explaining Phase 4 intent
- Index names prefixed `IDX_` (matches `002_accounts.sql` style)

```sql
-- 004_matches.sql: Durable match records (MATCH-01, MATCH-03)
-- One row per completed 2-player server game. Source of truth for Phase 4 ratings.
-- Phase 4 (RANK-01) will add rating_before_winner / rating_before_loser / etc.
-- in a 005_rankings.sql migration — no column in this file needs to be altered.

CREATE TABLE IF NOT EXISTS matches (
  id          SERIAL PRIMARY KEY,
  winner_id   INTEGER NOT NULL REFERENCES users(id),
  loser_id    INTEGER NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,                -- 'normal' | 'timeout' | 'disconnect' | 'leave'
  mode        TEXT NOT NULL DEFAULT 'classic', -- 'classic' | 'advance'
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_reason_check CHECK (reason IN ('normal','timeout','disconnect','leave'))
);

-- Fast lookup: all matches for a given player (profile win/loss, Phase 4 rating history)
CREATE INDEX IF NOT EXISTS IDX_matches_winner_id ON matches (winner_id);
CREATE INDEX IF NOT EXISTS IDX_matches_loser_id  ON matches (loser_id);
-- Optional: covers compound queries like "recent matches between two players"
CREATE INDEX IF NOT EXISTS IDX_matches_ended_at  ON matches (ended_at DESC);
```

**Phase 4 extensibility (D-01 "leave room"):** Phase 4 (RANK-01) needs to write Glicko rating deltas in the same transaction as the match record. Two design options:

- **Option A (recommended):** Phase 4 adds columns `winner_rating_before`, `loser_rating_before`, `winner_rating_after`, `loser_rating_after` (all nullable NUMERIC) in a `005_rankings.sql` migration with `ALTER TABLE matches ADD COLUMN IF NOT EXISTS`. No breaking change — existing rows get NULL in those columns.
- **Option B:** Phase 4 writes to a separate `rating_history` table with a FK to `matches.id`. Also non-breaking.

Either option works without altering `004_matches.sql`. The research recommends Option A for co-locality — ratings and the match that produced them in the same row — matching the CONTEXT wording "write ratings in the same transaction."

**`reason` CHECK constraint vs application-level validation:** Both are used (per CONTEXT D-02: "validated server-side"). The CHECK constraint in DDL is belt-and-suspenders against bugs in the application layer. It does not replace server-side validation.

---

## Common Pitfalls

### Pitfall 1: Reading `room.started` Too Late in `leaveRoom`

**What goes wrong:** `leaveRoom` sets `room.started = false` at line 1521 AFTER removing the player. If `recordMatch` is called after this, the `room.started` guard returns false and the match is skipped.
**Why it happens:** The handler removes the seat, then resets room state.
**How to avoid:** Capture the started state and winnerId BEFORE modifying room state. Check `if (room.started && room.order.length === 2)` at the top of the `leaveRoom` block, derive `winnerId = opponentOf(room, clientId)`, then proceed.
**Warning signs:** A `leaveRoom` during a game produces no match record.

### Pitfall 2: `socket.data.userId` Unavailable in `scheduleSeatRelease` Callback

**What goes wrong:** The grace-expiry timeout fires ~3 minutes after disconnect; the socket is long gone. `socket.data.userId` cannot be accessed.
**Why it happens:** `scheduleSeatRelease` is a closure that captures only `room`, `code`, `clientId`, and `ms`. The socket object is not captured.
**How to avoid:** Store `userId` on the player seat (`room.players[clientId].userId`) at the time the player joins/creates the room (when `socket.data.userId` is available). The grace-expiry callback reads `room.players[clientId].userId` — but this seat has already been deleted by the time the callback runs! So capture `userId` and `winnerId` from the room state BEFORE `delete r2.players[clientId]` executes.
**Warning signs:** `recordMatch` is called with `null` userId and credential lookup fails.

### Pitfall 3: Race Between Fire Win and Disconnect Cleanup

**What goes wrong:** Player A fires the winning shot; simultaneously, Player B's grace timer fires. Both try to call `recordMatch`.
**Why it happens:** `doShot` and the grace-expiry setTimeout run in the same Node.js event loop but as separate turns. The timeout callback could fire in the same tick as the fire handler.
**How to avoid:** `room.recorded = true` is set synchronously before `await recordMatch(...)`. Since both code paths run in the Node.js event loop (single-threaded), the first to set `room.recorded = true` wins; the second path sees `room.recorded === true` and returns immediately.
**Warning signs:** Two rows in `matches` with the same `winner_id`/`loser_id`/`started_at`.

### Pitfall 4: Writing a Match When `room.order.length === 1` (Lobby Abandon)

**What goes wrong:** A player creates a room, nobody joins, and the creator leaves. `room.order.length === 1`, so there's no winner.
**Why it happens:** `opponentOf()` returns `null`; `endGameForfeit`'s `winnerId` is null.
**How to avoid:** Guard `if (!room.started || room.order.length < 2) return` before any match-write call. `room.started` is only `true` after both players placed ships (line 1315), which requires two players, so `room.started` is a sufficient guard. Explicit `room.order.length === 2` check is belt-and-suspenders.
**Warning signs:** `INSERT INTO matches` with a `NULL` winner_id or loser_id (violates NOT NULL constraint, which is correct behavior — the constraint catches this).

### Pitfall 5: `restoreRooms` Restores Games Without `startedAt`

**What goes wrong:** After a server restart, rooms are restored from Redis snapshot. The snapshot does not include `startedAt` (it's a new field). A restored, in-progress game that ends after restart will have `room.startedAt = undefined`.
**Why it happens:** `serializeRooms()` must explicitly include `startedAt` in the serialized snapshot, and `restoreRooms()` must deserialize it.
**How to avoid:** Add `startedAt: r.startedAt || null` to `serializeRooms()` output (line ~776 in the snapshot object). Add `startedAt: s.startedAt ? new Date(s.startedAt) : null` in `restoreRooms()` (line ~814). In `recordMatch`, if `startedAt` is null, fall back to `now()` with a log warning.
**Warning signs:** `started_at` in `matches` equals `ended_at` for games that ended after a restart.

### Pitfall 6: `endGameForfeit` Emits `gameOver` to the Loser After Their Socket Is Gone

**What goes wrong:** In the `scheduleSeatRelease` path, the absent player has no socket. `emitToClient(room, loserId, ...)` calls `io.to(p.sid).emit(...)` — but `p.sid` is from the disconnected socket, and the player seat has been deleted before the callback normally runs.
**Why it happens:** The current `scheduleSeatRelease` deletes the seat (`delete r2.players[clientId]`) before any emit to the absent player. The absent player's socket won't receive the event anyway (already disconnected).
**How to avoid:** The `recordMatch` call in the grace-expiry path must capture `loserId`, `winnerId`, `reason`, and `startedAt` BEFORE `delete r2.players[clientId]` executes. The `gameOver` emit to the absent player can be skipped in this path — they're gone and will see the result on reconnect/next login.

---

## Code Examples

### `recordMatch` helper shape (db.js)

```javascript
// Source: db.js linkOrPromoteAccount pattern (line 157) — adapted for match write
// Called fire-and-forget from server.js: recordMatch(...).catch(() => {})

async function recordMatch(winnerId, loserId, reason, mode, startedAt) {
  // Graceful no-op: mirrors store.js pattern when dependency is absent
  if (!process.env.DATABASE_URL &&
      !process.env.PGHOST &&
      !process.env.PGDATABASE) {
    console.log("[match] DATABASE_URL not set — skipping match record");
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO matches (winner_id, loser_id, reason, mode, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [winnerId, loserId, reason, mode || "classic", startedAt || new Date()]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[match] recordMatch failed:", e.message);
    // Swallow — must never propagate (D-07)
  } finally {
    client.release();
  }
}
```

### Call site: `doShot` win path (server.js ~line 1116)

```javascript
// Emit gameOver FIRST (D-07), then fire-and-forget match write
if (win) {
  room.scores[clientId] = (room.scores[clientId] || 0) + 1;
  emitScores(room);
  emitToClient(room, clientId, "gameOver", { win: true });
  emitToClient(room, opp, "gameOver", { win: false });
  room.started = false;
  clearTurnTimer(room);
  // Match recording (MATCH-01): best-effort, fire-and-forget (D-06, D-07)
  if (!room.recorded) {
    room.recorded = true;
    const wId = room.players[clientId]?.userId ?? null;
    const lId = room.players[opp]?.userId ?? null;
    recordMatch(wId, lId, "normal", room.mode, room.startedAt).catch(() => {});
  }
  return { ... };
}
```

### `userId` resolution in `recordMatch` (handling guest fallback)

```javascript
// Inside recordMatch, if winnerId or loserId is null (guest), resolve from credentials
// Caller should resolve upstream if possible; this is the inner fallback.
// Source pattern: upsertGuestCredential CTE (db.js line 75)
async function resolveUserId(clientId) {
  if (!clientId) return null;
  const { rows } = await pool.query(
    "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
    [clientId]
  );
  return rows.length > 0 ? rows[0].user_id : null;
}
```

**Planner decision point:** Either resolve `userId` inside `recordMatch` (pass `clientId` as fallback), or resolve it upstream in the call site before calling `recordMatch`. Research recommends resolving upstream (store on seat) to keep `recordMatch` simple and avoid extra async hops in the failure path.

### scheduleSeatRelease extension (server.js ~line 730)

```javascript
p.timer = setTimeout(() => {
  const r2 = rooms[code];
  if (!r2 || !r2.players[clientId]) return;
  if (r2.players[clientId].online) return; // came back

  // MATCH-03: record disconnect forfeit BEFORE removing the seat (data needed)
  if (r2.started && !r2.recorded && r2.order.length === 2) {
    r2.recorded = true;
    const loserUId   = r2.players[clientId]?.userId ?? null;
    const winnerId   = opponentOf(r2, clientId);
    const winnerUId  = winnerId ? r2.players[winnerId]?.userId ?? null : null;
    recordMatch(winnerUId, loserUId, "disconnect", r2.mode, r2.startedAt).catch(() => {});
  }

  // Existing seat-release logic
  r2.order = r2.order.filter((id) => id !== clientId);
  delete r2.players[clientId];
  clearTurnTimer(r2);
  if (r2.order.length === 0) {
    delete rooms[code];
  } else {
    io.to(code).emit("opponentLeft");
    r2.started = false;
    io.to(code).emit("roomUpdate", roomPublic(r2));
  }
}, ms != null ? ms : GRACE_MS);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No match persistence | Single transaction write to `matches` | Phase 3 | Enables Phase 4 Glicko ratings |
| Grace expiry = silent abandon | Grace expiry = recorded forfeit loss | Phase 3 | MATCH-03 compliance |

**Deprecated/outdated:**
- Nothing deprecated — this phase adds new capability, does not replace existing patterns.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Graceful no-op check uses `DATABASE_URL || PGHOST || PGDATABASE` to detect configured DB | Architecture Patterns #2 | If wrong: match writes silently skipped on EC2 where `PGHOST` is set but `DATABASE_URL` is not. Planner should verify the exact pool config logic in `db.js` lines 22-32 and mirror it precisely. |
| A2 | `leaveRoom` should route through `endGameForfeit` (call it before removing the seat) | Architecture Patterns #5 | If wrong: `leaveRoom` currently emits `opponentLeft` not `gameOver(win:true)`. Routing through `endGameForfeit` changes client-visible behavior (opponent now gets `gameOver` instead of `opponentLeft`). Planner must confirm this behavioral change is acceptable or choose inline-record path instead. |
| A3 | `recordMatch` should be exported from `db.js` (not inlined in `server.js`) | Architecture Patterns #1 | Low risk — CONTEXT explicitly says "match-write helper lives in `db.js` export following the parameterized-query + single-Pool convention" (locked as Claude's Discretion guidance). |

**If this table is empty:** All claims in this research were verified or cited.

---

## Open Questions

1. **`leaveRoom` behavioral change**
   - What we know: `leaveRoom` currently removes the player and emits `opponentLeft`. `endGameForfeit` emits `gameOver({ win: true })` to the surviving player.
   - What's unclear: Is the client prepared to handle `gameOver` arriving from a `leaveRoom` path (vs `opponentLeft`)? The app.jsx handles both events. Does changing `leaveRoom` to route through `endGameForfeit` break the rematch flow?
   - Recommendation: Planner reads `app.jsx` handling of `gameOver` vs `opponentLeft` (short check). If rematch logic depends on `opponentLeft` specifically, use an inline record approach in `leaveRoom` instead of routing through `endGameForfeit`.

2. **`startedAt` in Redis snapshot**
   - What we know: `serializeRooms` (line ~750) must be updated to include `startedAt`.
   - What's unclear: Is the `restoreRooms` path a real concern? Redis is always available per STATE.md ("Redis now always available").
   - Recommendation: Still add `startedAt` to `serializeRooms`/`restoreRooms` for correctness. Fallback to `now()` on null is sufficient.

3. **`userId` on player seat vs DB lookup in `recordMatch`**
   - What we know: Both approaches work. Option A (store on seat) avoids an extra DB query. Option B (lookup in helper) keeps the seat object unchanged.
   - Recommendation: Option A. The planner should add `room.players[clientId].userId = socket.data.userId ?? null` in `createRoom`, `joinRoom`, `resume`, and `rejoin` handlers — wherever a seat is assigned.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | `recordMatch` transaction | Per STATE.md: EC2 always on | Per EC2 provisioning | No-op when DB vars absent (D-07) |
| `pg` npm package | `pool.connect()` | ✓ (package.json) | ^8.21.0 | — |
| `vitest` | test suite | ✓ (package.json) | ^4.1.8 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Postgres absent → `recordMatch` no-ops and logs.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.8 |
| Config file | `vitest.config.js` (exists) |
| Quick run command | `npm test -- --reporter=verbose test/match.test.js` |
| Full suite command | `npm test` |

Note: `fileParallelism: false` is already set — DB-gated tests run serially. New `test/match.test.js` follows the existing pattern (`skipIf(!hasDatabaseUrl)` for live DB tests, static checks always run).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-01 | `recordMatch` inserts one row into `matches` | integration | `npm test -- test/match.test.js` | ❌ Wave 0 |
| MATCH-01 | `recordMatch` is idempotent (no-op if called twice for same game via room.recorded) | unit | `npm test -- test/match.test.js` | ❌ Wave 0 |
| MATCH-01 | `recordMatch` no-ops when DATABASE_URL absent | unit | `npm test -- test/match.test.js` | ❌ Wave 0 |
| MATCH-01 | `matches` table exists with expected columns after migration | integration | `npm test -- test/match.test.js` | ❌ Wave 0 |
| MATCH-03 | A `disconnect` reason row appears in `matches` | integration | `npm test -- test/match.test.js` | ❌ Wave 0 |
| MATCH-01 | `004_matches.sql` file exists with correct DDL | static | `npm test -- test/match.test.js` | ❌ Wave 0 |
| MATCH-01 | `recordMatch` is exported from `db.js` | static | `npm test -- test/match.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- test/match.test.js` (fast static + skip DB tests if no DB)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/match.test.js` — covers MATCH-01, MATCH-03 (static DDL checks + DB-gated integration tests)
- [ ] `migrations/004_matches.sql` — must exist before any tests can pass

*(No framework install needed — vitest already in devDependencies)*

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` per config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth flows |
| V3 Session Management | no | No new session handling |
| V4 Access Control | partial | `recordMatch` is server-internal — no user-supplied outcome data trusted |
| V5 Input Validation | yes | `reason` validated server-side against taxonomy (CHECK constraint in DB) |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-supplied winner/loser fields | Tampering | Never accept winner/loser from client — derive entirely from server-authoritative game state |
| SQL injection via clientId or reason | Tampering | All SQL parameterized (`$1`/`$2` binding, never string concatenation) — existing project convention |
| Match flooding (many short games) | Denial of Service | Not a concern for Phase 3 — one row per game, bounded by actual game completion rate |

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to Phase 3 |
|-----------|-------------------|
| Server-authoritative validation — never trust client-sent state | Winner/loser/reason derived entirely from server room state |
| Named error codes, not free-text strings | `reason` taxonomy uses named constants: `'normal'`, `'timeout'`, `'disconnect'`, `'leave'` |
| Flat structure — no util/barrel files | `recordMatch` lives in `db.js`, not a new `match.js` or `utils/` file |
| Guard-clause style — early returns on invalid input | `if (!room.started)` before any record attempt |
| Optional features degrade gracefully | `recordMatch` no-ops when `DATABASE_URL`/`PGHOST` absent |
| No TypeScript | All new code is plain JavaScript/CommonJS |
| Single shared `pg.Pool` at module scope — never per-request | `recordMatch` uses the module-level `pool` from `db.js` |
| `try/catch` reserved for optional features | `recordMatch` wraps the DB call in try/catch (it IS an optional feature — best-effort) |
| Minimal `console` logging with `[prefix]` tags | Use `[match]` prefix for all match-write log lines |
| Parameterized queries only — never string concatenation | `$1`, `$2`, ... binding for all SQL |

---

## Sources

### Primary (HIGH confidence — verified against live codebase)

- `server.js` — lines 726-744 (scheduleSeatRelease), 1046-1059 (endGameForfeit), 1061-1075 (onTurnTimeout), 1110-1135 (doShot win path), 1165-1174 (socket connection + userId), 1176-1191 (createRoom), 1306-1331 (placeShips → battle start), 1506-1531 (leaveRoom), 1533-1546 (disconnect)
- `db.js` — lines 1-501 (full file): pool config, transaction pattern, upsertGuestCredential, linkOrPromoteAccount, module.exports shape
- `migrations/001_identity.sql`, `002_accounts.sql`, `003_email_accounts.sql` — verified naming/convention/DDL style
- `store.js` — graceful-degrade pattern (DATABASE_URL check + no-op)
- `mailer.js` — graceful-degrade pattern (API key check + no-op)
- `package.json` — dependency versions, test script
- `vitest.config.js` — test configuration
- `.planning/phases/03-match-recording/03-CONTEXT.md` — locked decisions D-01 through D-07
- `.planning/REQUIREMENTS.md` — MATCH-01, MATCH-03
- `.planning/ROADMAP.md` — Phase 3 success criteria

### Secondary (MEDIUM confidence)

None needed — all research grounded in live codebase.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing packages only, verified in package.json
- Architecture: HIGH — all integration points verified against live server.js/db.js line numbers
- DDL design: HIGH — conventions verified against 3 existing migrations
- Pitfalls: HIGH — derived from direct code reading, not speculation
- leaveRoom behavioral change: MEDIUM — consequence is clear from code reading; whether it's acceptable UI change requires planner review of app.jsx (Open Question 1)

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable stack; only risk is server.js/db.js edits in the interim)
