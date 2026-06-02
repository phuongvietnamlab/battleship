---
phase: 03-match-recording
plan: "01"
subsystem: persistence
tags: [migration, sql, test-scaffold, nyquist, tdd, phase3]
dependency_graph:
  requires:
    - migrations/001_identity.sql (users table FK target)
    - migrations/002_accounts.sql (IDX_ naming pattern reference)
    - migrations/003_email_accounts.sql (file header convention reference)
    - db.js runMigrations (lexical-sort runner picks up 004_matches.sql automatically)
  provides:
    - migrations/004_matches.sql (MATCH-01 schema prerequisite for Plans 02/03/04)
    - test/match.test.js (MATCH-01+MATCH-03 Nyquist verification spine for all of Phase 3)
  affects:
    - db.js (Plan 02 will add recordMatch export — static check in match.test.js goes GREEN)
    - server.js (Plan 03 will add 3 call sites)
tech_stack:
  added: []
  patterns:
    - IF NOT EXISTS guarded DDL migration (003_email_accounts.sql convention)
    - IDX_ index naming (002_accounts.sql convention)
    - Inline CONSTRAINT syntax for CHECK + UNIQUE
    - ESM test with __dirname shim + describe.skipIf DB guard (db.test.js / migrate.test.js convention)
    - information_schema.columns schema column assertion (migrate.test.js convention)
    - it.todo() for forward-contract stubs
key_files:
  created:
    - migrations/004_matches.sql
    - test/match.test.js
  modified: []
decisions:
  - UNIQUE (winner_id, loser_id, started_at) chosen as dedup constraint — backs up in-memory room.recorded flag (D-06)
  - No rating columns in 004_matches.sql — Phase 4 RANK-01 will ADD via 005_rankings.sql ALTER TABLE
  - recordMatch static check intentionally RED at this plan — serves as GREEN spine once Plan 02 lands
  - DB-gated tests guarded by hasDatabaseUrl = !!process.env.DATABASE_URL (skipIf pattern from db.test.js)
metrics:
  duration: "~2 minutes"
  completed: "2026-06-02T17:08:47Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 03 Plan 01: Nyquist test scaffold and matches table DDL Summary

Laid the Phase 3 foundation: `migrations/004_matches.sql` (matches table with reason CHECK + dedup UNIQUE + three IDX_ indexes) and `test/match.test.js` (static DDL assertions + DB-gated schema check + forward-contract `it.todo()` stubs covering all Phase 3 requirements).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migrations/004_matches.sql | 7949aad | migrations/004_matches.sql (created) |
| 2 | Create test/match.test.js Nyquist scaffold | 364941a | test/match.test.js (created) |

## Verification Results

`npm test -- test/match.test.js` result (no DATABASE_URL):

```
Tests  1 failed | 7 passed | 2 skipped | 6 todo (16)
```

- **7 passed:** All static DDL checks for 004_matches.sql (file exists, CREATE TABLE, reason CHECK constraint with all 4 values, IDX_matches_winner_id + IDX_matches_loser_id, dedup UNIQUE, no rating columns)
- **1 failed:** `db.js source contains 'recordMatch'` — **INTENTIONALLY RED** (Phase 3 verification spine; turns GREEN when Plan 02 adds the export to db.js)
- **2 skipped:** DB-gated integration tests (matches table schema column assertion requires DATABASE_URL)
- **6 todo:** Forward-contract stubs for Plan 02/03 behaviors (recordMatch insert, idempotency, no-op, disconnect row)

## TDD Gate Compliance

- RED commit (test): `364941a` — `test(03-01): add match.test.js Nyquist scaffold — RED spine for Phase 3`
- GREEN commit: Will be Plan 02's `feat(03-02)` commit when recordMatch is added to db.js

The intentional RED is the db.js export contract check. All other static checks are green. This is the correct Wave-1 state per the plan spec.

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| migrations/004_matches.sql exists | PASS |
| Contains `CREATE TABLE IF NOT EXISTS matches` | PASS |
| Contains `CONSTRAINT matches_reason_check` with 'normal','timeout','disconnect','leave' | PASS |
| Contains `IDX_matches_winner_id` and `IDX_matches_loser_id` | PASS |
| Contains `CONSTRAINT matches_dedup_unique UNIQUE (winner_id, loser_id, started_at)` | PASS |
| Contains `IDX_matches_ended_at` | PASS |
| No rating/glicko/deviation/volatility columns | PASS |
| test/match.test.js uses ESM `import { describe, it, expect ... } from "vitest"` | PASS |
| Contains `describe.skipIf` gating DB tests on DATABASE_URL | PASS |
| Contains `information_schema.columns` query asserting matches columns | PASS |
| Static DDL checks pass without DB | PASS |
| `recordMatch` static check is intentionally RED until Plan 02 | CONFIRMED |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The following `it.todo()` stubs exist intentionally in `test/match.test.js`. They represent forward-contracts that Plans 02 and 03 must satisfy:

| Stub | Location | Resolved In |
|------|----------|-------------|
| `recordMatch inserts exactly one row into matches` | test/match.test.js, DB-gated suite | Plan 02 |
| `recordMatch returns without throwing (best-effort / graceful degrade)` | test/match.test.js, DB-gated suite | Plan 02 |
| `recordMatch is idempotent via room.recorded flag` | test/match.test.js, DB-gated suite | Plan 02/03 |
| `recordMatch no-ops when DATABASE_URL is absent` | test/match.test.js, DB-gated suite | Plan 02 |
| `disconnect reason row appears` | test/match.test.js, disconnect suite | Plan 03 |
| `db.js exports recordMatch as a function` | test/match.test.js, DB-gated suite | Plan 02 |

These stubs are intentional: they ensure test coverage intent is documented now and verified when the code lands. They do not block this plan's goal.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model covers:

- T-03-01 (reason CHECK constraint): mitigated by `CONSTRAINT matches_reason_check CHECK (reason IN ('normal','timeout','disconnect','leave'))` — present in 004_matches.sql
- T-03-02 (duplicate match rows): mitigated by `CONSTRAINT matches_dedup_unique UNIQUE (winner_id, loser_id, started_at)` — present in 004_matches.sql

No additional threat flags found.

## Self-Check: PASSED

- [x] migrations/004_matches.sql exists at worktree root
- [x] test/match.test.js exists at worktree root
- [x] Commit 7949aad (feat 004_matches.sql) exists in git log
- [x] Commit 364941a (test match.test.js) exists in git log
- [x] No files accidentally deleted in either commit
