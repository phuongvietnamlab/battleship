---
phase: 03-match-recording
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - db.js
  - server.js
  - migrations/004_matches.sql
  - test/match.test.js
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase 3 match-recording changes: the `recordMatch` helper in `db.js`, the four call sites in `server.js` (`doShot` win, `endGameForfeit`, `leaveRoom`, `scheduleSeatRelease`), the `004_matches.sql` DDL, and `test/match.test.js`.

The SQL-injection mitigation is solid (all values bound as `$N`). The D-06 synchronous dedup guard (`room.recorded = true` before the `await`) and D-07 best-effort pattern (errors swallowed, never rethrows) are correctly implemented. The `scheduleSeatRelease` call correctly captures `wId`/`lId`/`mode`/`startedAt` before the seat deletion. The reason taxonomy validation (`VALID_REASONS` in `recordMatch`) and the DB-level `CHECK` constraint are both present.

One blocker was found: `room.recorded` is never cleared in the `rematch` handler, meaning **every rematch game's result goes unrecorded**. Three warnings cover the missing `mode` CHECK constraint in the DDL, a misleading no-op guard comment, and unused transaction overhead in `recordMatch`. Two info items cover a test coverage gap and minor code duplication.

---

## Critical Issues

### CR-01: `room.recorded` not reset on rematch — all rematch results silently dropped

**File:** `server.js:1534-1552`

**Issue:** The `rematch` handler resets all per-game fields (`ready`, `occ`, `hits`, `inv`, `bonus`, `skipNext`, `timeouts`, `powerups`, `mines`, `started`, `turn`) but never clears `room.recorded`. Once any game in the room ends — via `doShot` win (line 1157), `endGameForfeit` (line 1083), `leaveRoom` (line 1565), or `scheduleSeatRelease` (line 746) — `room.recorded` is set to `true`. Every subsequent game played in the same room (all rematches) hits the `!room.recorded` guard in all four end-game paths and silently skips the DB write. The bug is silent: no error, no log, no client signal — the match just never appears in the database.

**Fix:** Add `room.recorded = false;` to the `rematch` handler:

```javascript
socket.on("rematch", () => {
  const code = socket.data.code;
  const room = rooms[code];
  if (!room) return;
  for (const id of room.order) {
    room.players[id].ready = false;
    room.players[id].occ = null;
    room.players[id].hits = new Set();
    room.players[id].inv = newInv();
    room.players[id].bonus = 0;
    room.players[id].skipNext = false;
    room.players[id].timeouts = 0;
  }
  room.powerups = {}; room.mines = {};
  room.started = false;
  room.turn = null;
  room.recorded = false; // reset dedup flag so rematch result is recorded (MATCH-01)
  clearTurnTimer(room);
  io.to(code).emit("rematchStart");
});
```

---

## Warnings

### WR-01: `matches` table has no `CHECK` constraint on `mode`

**File:** `migrations/004_matches.sql:11-16`

**Issue:** The DDL enforces `CHECK (reason IN ('normal','timeout','disconnect','leave'))` but there is no equivalent constraint on the `mode` column. The application always produces `'classic'` or `'advance'` (validated at `createRoom`), but nothing at the DB layer prevents an invalid mode string from being persisted if `recordMatch` is ever called with a raw value from a future code path.

**Fix:** Add a mode check constraint alongside the reason constraint:

```sql
CONSTRAINT matches_mode_check   CHECK (mode IN ('classic','advance')),
CONSTRAINT matches_reason_check CHECK (reason IN ('normal','timeout','disconnect','leave'))
```

---

### WR-02: `recordMatch` no-op guard is misleading and can silently pass through to a broken pool

**File:** `db.js:454-457`

**Issue:** The guard `if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE)` is advertised as "graceful no-op when DATABASE_URL not set." However, the `pool` is constructed at module-load time from whatever env vars existed then. At call time, this guard only fires if all three vars are absent. If `PGHOST` is set to a wrong/unreachable value (but `DATABASE_URL` is absent), the guard passes, `pool.connect()` is called, fails with a connection error, and the `catch` swallows it. The comment leads maintainers to believe this is a clean no-op path; it is actually a fallthrough-to-error path in that scenario. Separately, the guard checks `process.env` at call time, but the pool was created at import time — the pool's actual connection behavior is determined by the import-time env, not the call-time env. The unit tests exploit this by deleting env vars after the module is already cached, which means the guard fires in tests but a real pool with bad credentials would still attempt `connect()`.

**Fix:** Simplify the intent: the real guard should be `if (!process.env.DATABASE_URL && !process.env.PGHOST)` to match exactly the `poolConfig` logic above (which uses `DATABASE_URL` OR `PGHOST` — `PGDATABASE` alone is not enough to form a connection). Or, more robustly, expose a `db.isConfigured()` helper that checks the same condition used to build `poolConfig`, and use that here. At minimum, update the comment to accurately describe the pass-through behavior.

---

### WR-03: `recordMatch` wraps a single INSERT in an explicit transaction — no correctness benefit, adds round-trips

**File:** `db.js:472-487`

**Issue:** `BEGIN` + single `INSERT` + `COMMIT` is three extra round-trips. A single-row INSERT is already atomic in PostgreSQL; no partial state can exist. The `ROLLBACK` on error rolls back nothing that wasn't already gone. The extra round-trips add latency on every match write, and the `ROLLBACK` in the catch block can itself fail if the connection drops, adding an unhandled rejection risk in the `finally` path (though `client.release()` will still run).

**Fix:** Remove the transaction wrapper and use a direct `pool.query()` call (matching the pattern used in other best-effort helpers):

```javascript
async function recordMatch(winnerId, loserId, reason, mode, startedAt) {
  if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE) {
    console.log("[match] DATABASE_URL not set — skipping match record");
    return;
  }
  const VALID_REASONS = ["normal", "timeout", "disconnect", "leave"];
  if (!VALID_REASONS.includes(reason)) {
    console.log("[match] invalid reason — skipping");
    return;
  }
  if (winnerId == null || loserId == null) {
    console.log("[match] unresolvable user_id — skipping");
    return;
  }
  try {
    await pool.query(
      "INSERT INTO matches (winner_id, loser_id, reason, mode, started_at, ended_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT DO NOTHING",
      [winnerId, loserId, reason, mode || "classic", startedAt || new Date()]
    );
  } catch (e) {
    console.error("[match] recordMatch failed:", e.message);
  }
}
```

Note: adding `ON CONFLICT DO NOTHING` on the `pool.query` path provides the same dedup guarantee the UNIQUE constraint offers without needing a transaction.

---

## Info

### IN-01: Test suite does not cover the `rematch` scenario (second game recording)

**File:** `test/match.test.js`

**Issue:** No test verifies that a second `recordMatch` call for the same room (simulating a rematch with a new `startedAt`) produces a second row. The existing idempotency test (line 217) only confirms that a duplicate `(winner_id, loser_id, started_at)` tuple is deduplicated. A rematch with a different `started_at` should produce a second row — this is untested. The bug in CR-01 (uncleared `room.recorded`) would be invisible to the current test suite because the tests call `recordMatch` directly, bypassing the `room.recorded` guard.

**Fix:** Add an integration test that calls `recordMatch` twice with the same `(winner_id, loser_id)` but a different `started_at` (simulating a rematch) and asserts `rows.length === 2`.

---

### IN-02: `VALID_REASONS` array is re-created on every `recordMatch` invocation

**File:** `db.js:460-461`

**Issue:** `const VALID_REASONS = ["normal", "timeout", "disconnect", "leave"];` is declared inside the function body and allocates a new array on every call. This should be a module-level constant.

**Fix:** Hoist to module level:

```javascript
// Near top of file, after imports
const VALID_MATCH_REASONS = Object.freeze(["normal", "timeout", "disconnect", "leave"]);

// Inside recordMatch:
if (!VALID_MATCH_REASONS.includes(reason)) {
```

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
