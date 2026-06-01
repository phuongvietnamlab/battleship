---
phase: "01-foundation"
plan: "01"
subsystem: "persistence"
tags: ["postgres", "migrations", "identity", "tdd", "vitest"]
dependency_graph:
  requires: []
  provides: ["db.js pool singleton", "identity schema (users+credentials)", "migration runner", "guest-credential upsert", "vitest test harness"]
  affects: ["server.js boot sequence", "createRoom", "joinRoom", "resume", "rejoin"]
tech_stack:
  added: ["pg@8.x", "vitest@4.x"]
  patterns: ["numbered migration runner", "CTE upsert idiom", "fire-and-forget DB writes", "env-gated SSL"]
key_files:
  created:
    - db.js
    - migrations/001_identity.sql
    - vitest.config.js
    - test/db.test.js
    - test/migrate.test.js
  modified:
    - server.js
    - package.json
decisions:
  - "Single shared pg.Pool (max:10) at module scope — never per-request (PITFALLS Pitfall 4 / T-01-D1)"
  - "Fail-loud migration runner: no try/catch around per-file apply, boot aborts on bad SQL (DATA-02)"
  - "CTE upsert: WITH existing_user AS (...) resolves in one parameterized query — avoids orphan users and is idempotent"
  - "upsertGuestCredential added to joinRoom (P2 path) beyond plan D-04 enumeration — closes DATA-01 gap for most common P2 session"
  - "PG_SSL env-gated: false for localhost EC2, {rejectUnauthorized:false} for remote/TLS"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-01"
  tasks_completed: 3
  files_created: 5
  files_modified: 2
---

# Phase 01 Plan 01: Postgres persistence + Vitest harness Summary

**One-liner:** Shared pg.Pool singleton with auto-applying numbered migration runner, identity schema (users+credentials), transparent guest-credential upsert on all connect paths, and Vitest test harness — all as a complete vertical persistence slice.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 0 | Verify package legitimacy (checkpoint) | — | Approved by user (pg@brianc, vitest@vitest-dev) |
| 1 | Test harness scaffold + db.js pool | c6fbb10 (RED), c837756 (GREEN) | Complete |
| 2 | Identity migration + fail-loud runner wired into boot | bbe36fa (RED), d6a1b08 (GREEN) | Complete |
| 3 | Guest-credential upsert on createRoom/joinRoom/resume/rejoin | ae33ad1 | Complete |

## Verification Evidence

- `npm test` passes: 9 tests pass, 11 skipped (DB-dependent tests skip without DATABASE_URL — by design)
- `grep -c "new Pool" db.js` → `1` (single shared pool)
- `node -e "require('./db.js')"` module shape verified: pool, runMigrations, upsertGuestCredential all exported
- `grep -n "runMigrations" server.js` → line 893 (before server.listen at ~902)
- `grep -n "upsertGuestCredential" server.js` → 4 call sites (createRoom:588, joinRoom:639, resume:659, rejoin:683) + require at line 11
- migrations/001_identity.sql: users, credentials (unique type+external_id), schema_migrations tables with CREATE TABLE IF NOT EXISTS
- Parameterized SQL: all external_id references use $1 binding (no string interpolation — T-01-02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing test script in package.json**
- **Found during:** Final verification (`npm test` failed with "Missing script: test")
- **Issue:** `npm install pg vitest` added packages to package.json but did not add the `scripts.test` entry. The vitest.config.js and tests were created correctly but `npm test` was non-functional.
- **Fix:** Added `"test": "vitest run"` to scripts section of package.json.
- **Files modified:** package.json
- **Commit:** 5a46d9b

### Plan-Specified Deviation (documented in plan D-04 extension)

**joinRoom P2 path — closes DATA-01 gap:**
The plan's Task 3 explicitly extends D-04's enumerated paths (connect/resume/rejoin) to also cover `joinRoom` (the join-as-player-2 path). This was a known gap: without it, a second player only gets a durable credential row on their *first reconnect*, not on their initial session. Added `upsertGuestCredential(clientId)` in the new-player branch of joinRoom (after `opponentJoined` emit, before profile exchange).

### Note on grep -c count

The acceptance criterion says `grep -c "upsertGuestCredential" server.js` returns 4. The actual count is 5 because the `require` destructure at line 11 also contains the string. There are exactly 4 handler call sites (createRoom, joinRoom, resume, rejoin) as required — the require line is additional.

## Known Stubs

None — all exported functions are fully implemented:
- `runMigrations`: full numbered-file runner with idempotency tracking
- `upsertGuestCredential`: full CTE upsert with ON CONFLICT DO NOTHING

## Threat Surface Scan

No new network endpoints introduced. SQL injection surface addressed by parameterized queries ($1 binding). Connection pool size bounded at max:10. All mitigations from threat model applied:

| Threat ID | Status |
|-----------|--------|
| T-01-02 | Mitigated — parameterized $1 binding throughout upsertGuestCredential |
| T-01-D1 | Mitigated — single shared Pool (max:10) at module scope |
| T-01-I1 | Accepted — secrets sourced from env only, not logged |
| T-01-A1 | Mitigated — upsertGuestCredential fire-and-forget with caught errors |
| T-01-T2 | Mitigated — fail-loud runner, no try/catch around migration apply |
| T-01-SC | Mitigated — Task 0 checkpoint, user approved pg and vitest |

## Self-Check: PASSED

| Item | Status |
|------|--------|
| db.js | FOUND |
| migrations/001_identity.sql | FOUND |
| vitest.config.js | FOUND |
| test/db.test.js | FOUND |
| test/migrate.test.js | FOUND |
| .planning/phases/01-foundation/01-01-SUMMARY.md | FOUND |
| commit c6fbb10 (RED db tests) | FOUND |
| commit c837756 (GREEN db.js) | FOUND |
| commit bbe36fa (RED migrate tests) | FOUND |
| commit d6a1b08 (GREEN migration+boot) | FOUND |
| commit ae33ad1 (upsertGuestCredential wiring) | FOUND |
| commit 5a46d9b (fix test script) | FOUND |
