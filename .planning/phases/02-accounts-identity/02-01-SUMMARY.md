---
phase: 02-accounts-identity
plan: "01"
subsystem: auth-persistence
tags: [auth, passport, express-session, postgres, migration, tdd]
dependency_graph:
  requires: []
  provides: [migrations/002_accounts.sql, db.linkOrPromoteAccount, db.sanitizeDisplayName, test/auth.test.js, test/profile.test.js]
  affects: [db.js, package.json]
tech_stack:
  added: [passport@0.7.0, passport-google-oauth20@2.0.0, express-session@1.19.0, connect-pg-simple@10.0.0]
  patterns: [pool.connect() transaction, BEGIN/COMMIT/ROLLBACK, describe.skipIf DATABASE_URL guard, TDD RED/GREEN]
key_files:
  created:
    - migrations/002_accounts.sql
    - test/auth.test.js
    - test/profile.test.js
  modified:
    - package.json
    - package-lock.json
    - db.js
decisions:
  - "Used createTableIfMissing:false for connect-pg-simple so full session DDL lives in numbered migration 002_accounts.sql (consistent with Phase 1 convention)"
  - "Copied escapeHtml into db.js (flat-structure per CLAUDE.md, no barrel/util)"
  - "linkOrPromoteAccount rethrows errors (fatal — Passport verify callback must call done(err)), contrasting upsertGuestCredential which swallows"
metrics:
  duration: "4 minutes"
  completed: "2026-06-02"
  tasks_completed: 3
  files_changed: 6
---

# Phase 02 Plan 01: Auth Persistence Foundation — Summary

Installed four auth packages (passport@0.7.0, passport-google-oauth20@2.0.0, express-session@1.19.0, connect-pg-simple@10.0.0), added migration 002_accounts.sql (profile columns + session table with indexed user_id), implemented the D-06/D-07 `linkOrPromoteAccount` transaction and `sanitizeDisplayName` in db.js, and created Wave 0 test stubs. All tests pass; DB-gated suites skip cleanly without DATABASE_URL.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Package legitimacy gate + install auth packages | 92b1b22 | Done |
| 2 | Migration 002_accounts.sql — profile columns + session table | 3e43fe3 | Done |
| 3 | linkOrPromoteAccount + sanitizeDisplayName + Wave 0 test stubs | 1b14bce (RED), a164092 (GREEN) | Done |

## What Was Built

**Package installs (Task 1):**
- `passport@0.7.0` — >=0.6 required for automatic `req.session.regenerate()` on login (SEC-05/D-05 session fixation defense)
- `passport-google-oauth20@2.0.0` — Google OAuth 2.0 strategy with built-in cryptographic state nonce (SEC-05)
- `express-session@1.19.0` — cookie-backed server-side sessions; Passport 0.6+ requires its `session.regenerate()` API
- `connect-pg-simple@10.0.0` — Postgres session store that reuses the shared `pool` from db.js (PITFALLS #4: no second Pool)

**Migration 002_accounts.sql (Task 2):**
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT` — stored via `sanitizeDisplayName` at write time (D-08/D-09/T-02-01)
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT` — sourced from Google profile (D-10)
- `CREATE TABLE IF NOT EXISTS "session"` — full DDL from connect-pg-simple `table.sql`, extended with `user_id INTEGER` column for efficient sign-out-all (D-03)
- `IDX_session_expire` and `IDX_session_user_id` indexes — fast session cleanup and indexed `DELETE FROM session WHERE user_id=$1`
- `createTableIfMissing:false` pattern: all schema under numbered migration files, consistent with Phase 1

**db.js additions (Task 3 TDD):**
- `escapeHtml(s)` — copied from server.js (flat-structure per CLAUDE.md, no barrel/util)
- `sanitizeDisplayName(name)` — strips control chars, collapses whitespace, slice(0,40), escapeHtml; returns null for non-string (D-09/T-02-01)
- `linkOrPromoteAccount(sub, name, avatarUrl, pendingClientId)` — D-06/D-07 atomic transaction:
  - D-06 (new sub): promotes existing guest user_id or creates new users row; stamps `guest_migrated_at`; idempotent via `ON CONFLICT DO NOTHING`
  - D-07 (existing sub): re-points guest credential to existing Google account's user_id
  - All SQL parameterized `$1/$2` — no string concatenation (T-02-02)
  - Error: logs `[db] linkOrPromoteAccount failed:` then rethrows (fatal; Passport verify callback passes `done(err)`)
- `module.exports` extended: `{ pool, runMigrations, upsertGuestCredential, linkOrPromoteAccount, sanitizeDisplayName }`
- Single `new Pool` invariant preserved

**Test stubs (Task 3 TDD):**
- `test/auth.test.js` — 7 non-DB assertions + 2 DB-gated suites (D-06 promote, D-07 adopt); uses `test-client-` / `test-sub-` prefixes + afterAll cleanup-by-prefix
- `test/profile.test.js` — 3 non-DB assertions + 1 DB-gated suite (migration columns + session table existence)

## Test Results

```
Test Files  6 passed (6)
     Tests  83 passed | 22 skipped (105)
```

DB-gated suites skip cleanly without `DATABASE_URL`. All non-DB suites pass.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `linkOrPromoteAccount` and `sanitizeDisplayName` are fully implemented. The DB-gated test suites in `test/auth.test.js` and `test/profile.test.js` are intentional Wave 0 scaffolds; they run green when `DATABASE_URL` is set and skip gracefully otherwise. No hardcoded empty values or placeholder data flow to UI rendering.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — failing tests committed before implementation | 1b14bce | PASS |
| GREEN — implementation passes all tests | a164092 | PASS |
| REFACTOR — no cleanup needed | — | N/A |

## Threat Flags

No new security-relevant surface introduced beyond the plan's threat model. All T-02-01 through T-02-SC mitigations applied:
- T-02-01 (display_name stored XSS): `sanitizeDisplayName` called at write time
- T-02-02 (SQL injection): all link SQL uses `$1/$2` — no string concatenation
- T-02-03 (Google identity spoofing): dedup on `credentials(type,external_id)=('google',sub)`
- T-02-04 (duplicate users rows): single BEGIN/COMMIT transaction; D-06 promotes existing guest row
- T-02-SC (supply chain): all four packages installed after explicit human legitimacy approval

## Self-Check: PASSED

| Item | Status |
|------|--------|
| package.json exists | FOUND |
| migrations/002_accounts.sql exists | FOUND |
| db.js exists | FOUND |
| test/auth.test.js exists | FOUND |
| test/profile.test.js exists | FOUND |
| 02-01-SUMMARY.md exists | FOUND |
| Commit 92b1b22 (Task 1 - packages) | FOUND |
| Commit 3e43fe3 (Task 2 - migration) | FOUND |
| Commit 1b14bce (Task 3 RED - tests) | FOUND |
| Commit a164092 (Task 3 GREEN - implementation) | FOUND |
| npm test: 83 passed, 22 skipped | PASS |
