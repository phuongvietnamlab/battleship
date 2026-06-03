---
phase: 04-ranked-mode-leaderboard
plan: "05"
subsystem: database
tags: [postgres, node, cli, season-reset, glicko2, ranking, testing]

# Dependency graph
requires:
  - phase: 04-01
    provides: migrations for seasons, rating_history, ratings tables with UNIQUE constraints
  - phase: 04-03
    provides: recordMatch rating write path; ratings table populated
provides:
  - "scripts/season-reset.js — standalone CLI that archives ratings and soft-resets the ladder in a single transaction"
  - "season-reset npm script wired in package.json"
  - "Live RANK-05 integration + idempotency tests in test/ranking.test.js (archive-before-blend, math, history-preserved, same-label rollback)"
affects: [phase-05-accounts-matchmaking, phase-04-leaderboard-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI-only destructive ops script: no express/socket surface, process.exit(1) on failure, pool.end() in finally"
    - "Archive-before-mutate: history INSERT runs before UPDATE blend inside single BEGIN/COMMIT"
    - "UNIQUE-constraint idempotency: duplicate label aborts entire transaction before any archive (Pitfall 5)"
    - "Exported runSeasonReset() for testability while main() handles CLI arg + pool.end()"

key-files:
  created:
    - scripts/season-reset.js
  modified:
    - package.json
    - test/ranking.test.js

key-decisions:
  - "D-11: Soft-reset formula: new_rating = 1500 + (old_rating - 1500) * 0.5; rd reset to 350; volatility = 0.06; games_played = 0"
  - "D-12: Archive runs BEFORE blend — INSERT INTO rating_history SELECT FROM ratings precedes UPDATE ratings; history is INSERT-only, never deleted"
  - "D-13: CLI-only surface — no express route, no socket handler; script runs on server box only; grep assertion in acceptance criteria"

patterns-established:
  - "Season reset pattern: insert seasons row (UNIQUE label = idempotency guard) → archive → blend, all in one transaction"
  - "Script testability: extract async function + export; main() is thin CLI wrapper calling exported function then pool.end()"

requirements-completed: [RANK-05]

# Metrics
duration: ~15min
completed: 2026-06-03
---

# Phase 04 Plan 05: Season Reset CLI Summary

**Standalone Node CLI archives the entire ratings ladder to rating_history then soft-resets active ratings toward 1500 in a single Postgres transaction, with UNIQUE-label idempotency and zero HTTP surface (RANK-05/D-11/D-12/D-13)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-03
- **Completed:** 2026-06-03
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint — approved)
- **Files modified:** 3

## Accomplishments

- `scripts/season-reset.js` archives all current ratings to `rating_history` (pre-blend values) then soft-resets `ratings` — all inside one `BEGIN/COMMIT`; any failure rolls back and `process.exit(1)` exits non-zero
- UNIQUE(seasons.label) constraint is the idempotency guard: a duplicate label aborts the transaction before a single archive row is written (Pitfall 5 / no double-archive)
- Exported `runSeasonReset(label)` enables direct integration testing; live tests cover archive-before-blend math (1700→1600, 1300→1400 ±1), history preservation (never deleted), and same-label rollback
- Human-verify checkpoint confirmed: CLI first run archived + soft-reset correctly; second identical run failed non-zero with no duplicate history rows

## Task Commits

1. **Task 1: scripts/season-reset.js — archive-then-soft-reset CLI + package.json script** - `b221279` (feat)
2. **Task 2: test/ranking.test.js — live RANK-05 season-reset integration + idempotency tests** - `f8690c9` (feat)
3. **Task 3: Human-verify checkpoint** — approved by user (no code commit)

## Files Created/Modified

- `scripts/season-reset.js` — Standalone Node CLI: requires `{ pool }` from `../db`; BLEND=0.5, RESET_RD=350 constants; single transaction: INSERT seasons → INSERT rating_history SELECT FROM ratings → UPDATE ratings soft-reset; ROLLBACK + process.exit(1) on failure; pool.end() in finally; exports runSeasonReset for tests
- `package.json` — Added `"season-reset": "node scripts/season-reset.js"` to scripts block
- `test/ranking.test.js` — RANK-05 integration tests: archive-before-blend correctness, history preservation, same-label idempotency rollback (DB-gated)

## Decisions Made

- **D-11 (blend formula):** `new_rating = 1500 + (old_rating - 1500) * 0.5`; rd reset to 350; volatility to 0.06; games_played to 0. All bound as `$N` parameters — no SQL string concatenation (T-04-18 mitigated)
- **D-12 (archive before blend):** `INSERT INTO rating_history ... SELECT FROM ratings` runs before `UPDATE ratings`; history rows are INSERT-only and never deleted or overwritten
- **D-13 (CLI-only surface):** No express/socket/HTTP in the script; verified by grep; runs on the server box via `npm run season-reset -- "Season 2"` or direct node invocation

## Deviations from Plan

None - plan executed exactly as written. The exported `runSeasonReset()` refactor was listed as a preferred option in the plan's action block; it was implemented as specified.

## Human-Verify Checkpoint

**Task 3 — Human verification of CLI behavior:** User was asked to:
1. Run `npm run season-reset -- "Season-Test-1"` on seeded data
2. Confirm archive+reset success log, correct DB state (seasons row, rating_history pre-reset values, ratings blended, rd=350, games_played=0)
3. Run the same command again — confirm non-zero exit, no duplicate history rows
4. Confirm no HTTP route triggers the reset

**Outcome:** Approved by user ("approved" response). No issues reported.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for the CLI itself. The script requires `DATABASE_URL` / Postgres environment variables already in use by the application server.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. Script is CLI-only (D-13 / T-04-16 mitigated). UNIQUE constraint mitigates T-04-17. Parameterized label mitigates T-04-18 (SQL injection). Single transaction mitigates T-04-19 (partial reset).

## Next Phase Readiness

- RANK-05 complete: season rollover is operational — admin can archive and soft-reset the ladder at any time
- Phase 04 is now fully complete (all 5 plans executed): DB foundation, ranked flag/guards, Glicko-2 rating write, leaderboard cache/API/UI, season reset
- Phase 05 (accounts + matchmaking) can proceed; it builds on the identity and ratings foundation established in phases 01-04

## Self-Check: PASSED

- `scripts/season-reset.js` — FOUND (read confirmed, syntax OK)
- `package.json` `scripts["season-reset"]` — FOUND (node confirmed)
- `test/ranking.test.js` — modified (commit f8690c9)
- Commits b221279, f8690c9 — FOUND (git log confirmed)

---
*Phase: 04-ranked-mode-leaderboard*
*Completed: 2026-06-03*
