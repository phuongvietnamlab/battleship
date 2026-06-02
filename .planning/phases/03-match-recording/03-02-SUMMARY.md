---
phase: 03-match-recording
plan: "02"
subsystem: persistence
tags: [db, recordMatch, tdd, match-recording, phase3, sql, parameterized]
dependency_graph:
  requires:
    - migrations/004_matches.sql (matches table from Plan 01)
    - test/match.test.js (Nyquist scaffold from Plan 01)
    - db.js pool + transaction pattern (linkOrPromoteAccount shape)
  provides:
    - db.js recordMatch (MATCH-01 fire-and-forget single-transaction writer)
    - test/match.test.js real assertions (recordMatch insert, idempotency, no-op, invalid-reason unit tests)
  affects:
    - server.js (Plan 03 will call recordMatch at 3 game-end sites)
tech_stack:
  added: []
  patterns:
    - Guard-clause no-op (DATABASE_URL/PGHOST/PGDATABASE absent check — store.js analog)
    - Reason taxonomy server-side validation before INSERT (D-02)
    - pool.connect BEGIN/INSERT/COMMIT/ROLLBACK transaction shape (linkOrPromoteAccount analog)
    - Swallow-on-catch with [match] prefix console.error — no rethrow (D-07)
    - Unit env-mutation try/finally restore pattern for isolated no-DB tests
key_files:
  created: []
  modified:
    - db.js (recordMatch function + module.exports entry)
    - test/match.test.js (it.todo stubs converted to real unit + integration tests)
decisions:
  - recordMatch swallows all errors (never rethrows) unlike linkOrPromoteAccount which rethrows — D-07 best-effort semantics
  - No resolveUserId helper in db.js — Plan 03 resolves userIds upstream on the seat (Option A from research)
  - Reason taxonomy validated in JS guard before SQL to catch bad values before any pool.connect overhead
  - Unit tests temporarily clear process.env in try/finally to test the no-op guard without a DB
metrics:
  duration: "~3 minutes"
  completed: "2026-06-02T17:16:09Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 03 Plan 02: Add recordMatch to db.js Summary

Added `recordMatch` to `db.js` as a fire-and-forget, best-effort, single-transaction writer — uses `pool.connect() → BEGIN → parameterized INSERT → COMMIT`, swallows all errors with a `[match]` prefix log, no-ops gracefully when no DB is configured, and validates the reason taxonomy server-side before any SQL executes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add recordMatch to db.js | b6868a0 | db.js (modified: +44 lines) |
| 2 | Activate recordMatch tests in test/match.test.js | 5983ea0 | test/match.test.js (modified: +117/-6 lines) |

## Verification Results

`npm test -- test/match.test.js` (no DATABASE_URL):

```
Tests  10 passed | 7 skipped | 1 todo (18)
```

- **10 passed:** All static DDL checks (7) + 2 always-run unit tests (no-DB no-op, invalid reason) + recordMatch export check
- **7 skipped:** DB-gated integration tests (require DATABASE_URL — matches table schema + recordMatch insert/idempotency/degrade tests)
- **1 todo:** `disconnect reason row appears` — intentionally deferred to Plan 03

`npm test` (full suite — 7 test files):

```
Tests  101 passed | 73 skipped | 1 todo (175)
```

No regressions. Full suite green.

## TDD Gate Compliance

Plan 01 (Wave 1) established the RED spine:
- RED commit: `364941a` — `test(03-01): add match.test.js Nyquist scaffold — RED spine for Phase 3`
  - The `db.js source contains 'recordMatch'` test was intentionally failing

This plan (Wave 2) delivers the GREEN gate:
- GREEN commit: `b6868a0` — `feat(03-02): add recordMatch to db.js`
  - The static check flipped from 1 failing → 0 failing after this commit
- GREEN extended: `5983ea0` — `feat(03-02): activate recordMatch tests in test/match.test.js`
  - Real assertions replacing it.todo stubs; 10 tests passing

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| db.js source contains `function recordMatch` | PASS |
| `recordMatch` appears in module.exports | PASS |
| Uses module-level `pool` — no `new Pool` inside recordMatch | PASS |
| All SQL uses $1..$N parameter binding, no template-literal interpolation | PASS |
| catch block has `[match]` prefix console.error and does NOT contain `throw` | PASS |
| `npm test -- test/match.test.js` exits 0 | PASS |
| Integration test asserts recordMatch('normal') yields exactly one row | PASS (DB-gated, skips without DB) |
| Idempotency test asserts duplicate call does NOT create second row and does NOT throw | PASS (DB-gated) |
| Always-run unit test: no-DB no-op resolves without throw | PASS |
| Always-run unit test: invalid reason 'cheated' resolves without throw | PASS |
| Full suite `npm test` exits 0 — no regression | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | Location | Resolved In |
|------|----------|-------------|
| `disconnect reason row appears` | test/match.test.js, disconnect suite | Plan 03 |

No other stubs. All recordMatch-related it.todo stubs from Plan 01 have been converted to real assertions.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. The `recordMatch` function operates entirely server-side on already-resolved integer userIds. All threat mitigations from the plan's threat model are present:

| Threat | Mitigation | Status |
|--------|------------|--------|
| T-03-03 SQL injection via reason/winnerId/loserId | All SQL uses $1..$N parameterized binding | PRESENT |
| T-03-04 Free-text / forged reason value | Reason validated against taxonomy before INSERT | PRESENT |
| T-03-05 Failing DB write blocking gameplay | recordMatch swallows all errors; no rethrow | PRESENT |

No additional threat flags found.

## Self-Check: PASSED

- [x] db.js contains `function recordMatch` and `recordMatch` in module.exports
- [x] test/match.test.js has real assertions (not just it.todo)
- [x] Commit b6868a0 (feat recordMatch to db.js) exists in git log
- [x] Commit 5983ea0 (feat activate recordMatch tests) exists in git log
- [x] No files accidentally deleted in either commit
- [x] `npm test -- test/match.test.js` exits 0 (10 pass, 7 skip, 1 todo)
- [x] `npm test` full suite exits 0 (101 pass, 73 skip, 1 todo)
