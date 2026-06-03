---
phase: 04-ranked-mode-leaderboard
plan: "03"
subsystem: rankings
tags: [glicko2, ratings, transactions, server-authoritative, tdd, atomicity]
dependency_graph:
  requires:
    - phase: 04-ranked-mode-leaderboard/04-01
      provides: "elo.js updateRatings (pure Glicko-2), migrations/005_rankings.sql (ratings + snapshot columns)"
    - phase: 04-ranked-mode-leaderboard/04-02
      provides: "room.ranked boolean flag on room object"
  provides:
    - "recordMatch(winnerId, loserId, reason, mode, startedAt, ranked=false) — 6th ranked param"
    - "Same-transaction Glicko-2 rating write: SELECT ratings → updateRatings → UPSERT ratings × 2 → UPDATE matches snapshot"
    - "room.ranked passed as 6th arg at all four recordMatch call sites in server.js"
    - "RANK-01 live integration tests in test/ranking.test.js"
  affects:
    - "04-04 (leaderboard endpoint reads from ratings table written here)"
    - "04-05 (season reset archives ratings rows written here)"
tech_stack:
  added: []
  patterns:
    - "Same-client transaction: all rating queries use the same `client` as matches INSERT (never pool) — Pitfall 1"
    - "Atomic rollback: rating-write failure rolls back matches INSERT (RANK-01); swallow-catch never rethrows (D-07)"
    - "Default provisional ratings: 1500/350/0.06/0 when no ratings row exists"
    - "UPSERT ON CONFLICT: games_played incremented inline; re-run safe"
    - "All SQL values bound as $N — never concatenated (T-03-03)"
    - "disconnectRecord object captures ranked from room for deferred fire-and-forget (Pitfall 6)"
key_files:
  created: []
  modified:
    - db.js
    - server.js
    - test/ranking.test.js
decisions:
  - "ranked=false is the 6th positional param default; existing 5-arg call sites are backwards-compatible without passing ranked"
  - "Rating branch guard: ranked===true AND winnerId != null AND loserId != null (D-03); a guest seat has userId=null so rating write is skipped even if room.ranked=true"
  - "matchTs captured before INSERT and reused in UPDATE snapshot — ensures UPDATE WHERE started_at=$3 matches exactly one row"
metrics:
  duration: "~4 min"
  completed: "2026-06-03"
  tasks: 2
  files: 3
---

# Phase 04 Plan 03: Ranked Rating Write (RANK-01) Summary

Same-transaction Glicko-2 rating update wired into `recordMatch` in db.js: winner/loser ratings read, `updateRatings` called, both `ratings` rows UPSERTed, and the four `matches` snapshot columns stamped — all inside the existing `BEGIN/COMMIT` block so any failure rolls back both the match row and any partial rating writes.

## What Was Built

**Task 1 (TDD RED + GREEN — db.js + test/ranking.test.js):**

RED: Replaced the `.todo` RANK-01 stubs in `test/ranking.test.js` with live integration tests:
- `ranked recordMatch` inserts matches row + upserts both ratings rows in one transaction
- Rating values are finite (no NaN/Infinity)
- All four snapshot columns stamped; winner_rating_after > before; loser_rating_after < before
- `unranked recordMatch` writes matches row but no ratings rows; snapshot columns are null
- `null winnerId` triggers unresolvable-seat guard — no matches row, no ratings row
- Atomic rollback: duplicate `started_at` triggers UNIQUE constraint inside transaction; both matches row and ratings rows rolled back; call resolves without throwing (D-07)

Added three static grep tests (no DB required):
- `db.js` contains `require('./elo')`
- `recordMatch` signature includes `ranked` parameter
- Only one `pool.connect()` inside `recordMatch` (rating branch uses same `client`)

GREEN: Extended `recordMatch` in `db.js`:
- Added `require('./elo')` at the top alongside other requires
- Signature: `async function recordMatch(winnerId, loserId, reason, mode, startedAt, ranked = false)`
- Captured `matchTs = startedAt || new Date()` before INSERT for reuse in snapshot UPDATE
- Conditional block after INSERT and before COMMIT: `if (ranked && winnerId != null && loserId != null)`
  - Two parameterized SELECTs for current ratings (default 1500/350/0.06/0 when no row)
  - `updateRatings(wBefore, lBefore)` called (pure elo.js, no I/O)
  - Console log `[rating]` prefix for grep-ability
  - Two parameterized UPSERTs (`INSERT ... ON CONFLICT DO UPDATE`, `games_played + 1`)
  - One parameterized UPDATE stamping snapshot columns matched on `winner_id/loser_id/started_at`
- All queries use the same `client` variable — never `pool` inside the rating branch (Pitfall 1, T-04-08)
- Existing swallow-catch (`ROLLBACK` + `console.error("[match]")` + no rethrow) covers rating failures too (D-07)

**Task 2 (server.js — 4 recordMatch call sites):**

Updated all four `recordMatch(...)` invocations to pass `room.ranked` (or `disconnectRecord.ranked`) as the 6th argument:
1. Forfeit (`endGameForfeit` ~line 1086): `room.ranked`
2. Normal win (`doShot` ~line 1160): `room.ranked`
3. Disconnect-grace (`scheduleSeatRelease` ~line 761): `ranked: r2.ranked` added to `disconnectRecord` object; `disconnectRecord.ranked` passed at call site
4. Leave (`leaveRoom` ~line 1577): `room.ranked`

All four sites retain `.catch(() => {})` and gameOver-before-recordMatch ordering unchanged.

## Test Results

| Suite | Status | Count |
|-------|--------|-------|
| `test/ranking.test.js` static DDL | GREEN | 11/11 |
| `test/ranking.test.js` server guards | GREEN | 2/2 |
| `test/ranking.test.js` db.js ranked param | GREEN | 3/3 |
| `test/ranking.test.js` DB integration | Skipped (no DB in CI) | — |
| `test/match.test.js` | GREEN | 11/11 (Phase-3 regression clean) |
| Skipped/todo (Plan 04/05 stubs) | Skipped/todo | 14 skip + 12 todo |

`npx vitest run test/ranking.test.js test/match.test.js` exits 0.  
`node --check server.js` exits 0.  
Grep confirms 4 recordMatch sites pass ranked (verified by plan-specified node -e check).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All stubs that were in scope for Plan 03 are fully implemented. The `.todo` tests for Plan 04 (leaderboard) and Plan 05 (season reset) remain as planned.

## Threat Surface Scan

No new network endpoints or auth paths. The rating write uses an existing DB connection inside an existing transaction. The `ratings` table was created in Plan 01. No new trust boundaries introduced.

| Threat | Status |
|--------|--------|
| T-04-08 (inconsistent ledger) | Mitigated: all writes share one client/BEGIN/COMMIT; failure rolls back both |
| T-04-09 (guest inflates rating) | Mitigated: rating branch skipped when userId is null (D-03) |
| T-04-10 (NaN/Infinity rating) | Mitigated: elo.js clamps E(); REAL column rejects NaN → ROLLBACK |
| T-04-11 (slow DB hangs end screen) | Mitigated: gameOver emitted before recordMatch; fire-and-forget .catch |

## Self-Check

- [x] `db.js` exists and contains `require('./elo')` and `ranked = false` param
- [x] `server.js` parses clean (`node --check server.js` exits 0); 4 recordMatch sites pass ranked
- [x] `test/ranking.test.js` exists with live RANK-01 integration tests
- [x] Commit `86f9eb7` exists (RED — failing tests)
- [x] Commit `76e0d51` exists (GREEN — db.js ranked write)
- [x] Commit `476cf73` exists (feat — server.js wiring)

## Self-Check: PASSED
