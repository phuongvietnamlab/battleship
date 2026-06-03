---
phase: 04-ranked-mode-leaderboard
plan: "01"
subsystem: rankings
tags: [glicko2, ratings, migration, testing, wave0]
dependency_graph:
  requires: []
  provides:
    - elo.js:updateRatings (pure Glicko-2 single-game rating update)
    - migrations/005_rankings.sql (ratings/seasons/rating_history tables + matches ALTER)
    - test/elo.test.js (pure-function unit tests, GREEN)
    - test/ranking.test.js (Wave-0 integration scaffold, static DDL GREEN, guards RED for Plan 02)
  affects:
    - Plan 02 (ranked flag + server.js guards)
    - Plan 03 (recordMatch + rating write)
    - Plan 04 (leaderboard endpoint + cache)
    - Plan 05 (season-reset CLI)
tech_stack:
  added: []
  patterns:
    - Glicko-2 Illinois bisection algorithm (Step 5 per Glickman 2013)
    - CommonJS pure utility module (no DB/IO)
    - IF NOT EXISTS guarded DDL migration (lexical runner auto-pick)
    - Wave-0 TDD scaffold (RED tests before implementation, then GREEN)
key_files:
  created:
    - elo.js
    - migrations/005_rankings.sql
    - test/elo.test.js
    - test/ranking.test.js
  modified: []
decisions:
  - "Illinois bisection walk direction: while f(B) < 0, decrement B — matches pyglicko2 reference, not the buggy skeleton in 04-RESEARCH Pattern 1 (which used >=0 causing infinite loop)"
  - "E() clamped to [0.001, 0.999] before variance computation — prevents NaN/Infinity for extreme rating gaps (Pitfall 2)"
  - "elo.js period=1 only (2-player API); canonical 3-opponent worked example left as TODO comment in test, pending multi-opponent extension or pyglicko2 validation"
metrics:
  duration: "~25 min"
  completed: "2026-06-03"
  tasks: 3
  files: 4
---

# Phase 04 Plan 01: Glicko-2 Math Foundation + Wave-0 Test Scaffold Summary

Pure Glicko-2 single-game rating update (`elo.js`) with Illinois bisection, validated by 20 unit tests; `migrations/005_rankings.sql` creating `ratings`/`seasons`/`rating_history` tables and `matches` rating-snapshot columns; Wave-0 test scaffold wired for Plans 02–05.

## What Was Built

**Task 1 (Wave-0 test scaffold):** Created `test/elo.test.js` and `test/ranking.test.js`. Both files use the `test/match.test.js` header verbatim (vitest imports, `fileURLToPath`, `rootDir`). `elo.test.js` is intentionally RED (cannot resolve `../elo.js` before Task 2). `ranking.test.js` has static DDL checks (all RED before Task 3) and static grep checks for `RANKED_REQUIRES_ACCOUNT`/`RANKED_REQUIRES_CLASSIC` (RED until Plan 02). DB-gated integration stubs (Plans 03–05) are present but skipped via `describe.skipIf(!hasDb)`.

**Task 2 (elo.js):** Implemented pure Glicko-2 steps 2–8 with constants `SCALE=173.7178`, `TAU=0.5`, `EPS=1e-6`. `E()` clamped to `[0.001, 0.999]` for NaN prevention. Illinois bisection in `newVolatility` follows Glickman Step 5 and pyglicko2 reference. All 20 unit tests GREEN. `module.exports = { updateRatings }`, no DB/IO requires.

**Task 3 (005_rankings.sql):** Created migration with `ratings` (PK user_id FK users), `seasons` (UNIQUE label for idempotency), `rating_history` (UNIQUE user_id,season_id for double-archive prevention), and `ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner/loser_rating_before/after`. All DDL is `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` guarded. Lexically ordered (`005_` after `004_`) for auto-pick by the runner.

## Test Results

| Suite | Status | Count |
|-------|--------|-------|
| `test/elo.test.js` | GREEN | 20/20 passed |
| `test/ranking.test.js` static DDL | GREEN | 11/11 passed |
| `test/ranking.test.js` server guards | RED (expected, Plan 02 scope) | 2 failing |
| `test/ranking.test.js` DB integration | Skipped (expected, Plans 03-05 scope) | 17 todo |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed infinite loop in Illinois bisection algorithm**

- **Found during:** Task 2 implementation
- **Issue:** The research file (04-RESEARCH Pattern 1) noted the skeleton was "illustrative ONLY and has a buggy halving branch." The plan instructed to implement the correct Illinois algorithm from Glickman Step 5. An initial implementation used `while (f(B) >= 0) { B -= TAU }` to initialize the B bracket — walking leftward while f(B) was non-negative. Analysis showed that as B → -∞, f(B) → +∞ (the second term `-(x-a)/τ²` dominates), so f(B) never becomes negative in that direction. This caused an infinite loop for the `else` branch (when `delta² <= phi² + v`), which applies to established players with low RD.
- **Fix:** Changed to `while (f(B) < 0) { B -= TAU }` — mirrors the pyglicko2 reference (`while f(a - k*tau) < 0: k += 1`). This finds the rightmost B (nearest to a - tau) where f(B) >= 0, forming a proper bracket with f(A) < 0 in this branch.
- **Files modified:** `elo.js`
- **Commit:** `1347058`

## Known Stubs

None. `elo.js` and `migrations/005_rankings.sql` are fully implemented. The `TODO` in `elo.test.js` is a documented research note (not a stub): the 3-opponent canonical worked example (r'≈1464.06, RD'≈151.52, σ'≈0.05999) cannot be asserted with the current 2-player API and requires either a multi-opponent extension or pyglicko2 cross-validation. The current test assertions use period=1 vectors from the research table, which are validated GREEN.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what is in the plan's threat model. The migration creates tables and alters `matches` as planned; no new trust boundaries introduced.

## Self-Check

- [x] `elo.js` exists: C:/battleship/elo.js
- [x] `migrations/005_rankings.sql` exists: C:/battleship/migrations/005_rankings.sql
- [x] `test/elo.test.js` exists: C:/battleship/test/elo.test.js
- [x] `test/ranking.test.js` exists: C:/battleship/test/ranking.test.js
- [x] Commit 81de727 exists (Task 1 test scaffold)
- [x] Commit 1347058 exists (Task 2 elo.js)
- [x] Commit c3ced25 exists (Task 3 migration)

## Self-Check: PASSED
