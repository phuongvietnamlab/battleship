---
phase: 02-accounts-identity
plan: "06"
subsystem: auth-persistence
tags: [auth, email-password, bcryptjs, migration, tdd, postgres]
dependency_graph:
  requires: ["02-01"]
  provides:
    - migrations/003_email_accounts.sql
    - db.createEmailAccount
    - db.verifyEmailLogin
    - db.createAuthToken
    - db.consumeAuthToken
    - db.markEmailVerified
    - test/auth.test.js (AUTH-06 suites)
  affects: [db.js, package.json, test/auth.test.js]
tech_stack:
  added: [bcryptjs@2.4.3]
  patterns:
    - pool.connect() transaction with BEGIN/COMMIT/ROLLBACK/finally-release
    - bcrypt.hash cost 10 (async)
    - crypto.randomBytes(32) hex for token generation
    - conditional UPDATE for single-use token consume
    - describe.skipIf DATABASE_URL guard (TDD RED/GREEN)
key_files:
  created:
    - migrations/003_email_accounts.sql
    - .planning/phases/02-accounts-identity/02-06-SUMMARY.md
  modified:
    - package.json
    - package-lock.json
    - db.js
    - test/auth.test.js
decisions:
  - "createEmailAccount inlines the link transaction rather than delegating to linkOrPromoteAccount — direct pool.connect() needed to keep password_hash UPDATE inside the same BEGIN/COMMIT boundary"
  - "email normalization (trim+lowercase) is the credentials.external_id, same as D-20 states — no global UNIQUE on users.email"
  - "consumeAuthToken uses conditional UPDATE WHERE consumed_at IS NULL — single-use concurrency-safe without a separate SELECT; RETURNING confirms the win"
  - "bcrypt.hash (async) used instead of hashSync — avoids blocking event loop for ~100ms per plan spec"
  - "WEAK_PASSWORD and EMAIL_IN_USE returned as plain objects {error:'...'} not thrown — guard-clause style per CLAUDE.md"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-02"
  tasks_completed: 3
  files_changed: 5
---

# Phase 02 Plan 06: Email-Account Persistence Foundation — Summary

bcryptjs-backed email/password account creation and login helpers with single-use expiring auth tokens in Postgres — migration 003_email_accounts.sql plus five db.js functions (createEmailAccount, verifyEmailLogin, createAuthToken, consumeAuthToken, markEmailVerified) tested with AUTH-06 DB-gated Vitest suites.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Package legitimacy gate + install bcryptjs@2.4.3 | 71c8c97 | Done |
| 2 | Migration 003_email_accounts.sql | 654dc27 | Done |
| 3 RED | AUTH-06 failing tests (RED gate) | b9c32ac | Done |
| 3 GREEN | Email-account db.js helpers (GREEN gate) | 183e67d | Done |

## What Was Built

**Package install (Task 1):**
- `bcryptjs@2.4.3` — pure-JS bcrypt; no native build step; installs cleanly on Render without node-gyp; human legitimacy gate passed (T-02-SC)

**Migration 003_email_accounts.sql (Task 2):**
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT` — contact/display email address (D-15)
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false` — verification gate (AUTH-07 sets to true)
- `ALTER TABLE credentials ADD COLUMN IF NOT EXISTS password_hash TEXT` — nullable; only type='email' rows (D-14); guest/google/facebook rows leave it NULL
- `CREATE TABLE IF NOT EXISTS auth_tokens` — id, user_id FK, token UNIQUE, purpose, expires_at, consumed_at, created_at — for verify + reset (D-19)
- `IDX_auth_tokens_token` + `IDX_auth_tokens_user_id` indexes
- No global UNIQUE on users.email — D-20: same email across providers = distinct accounts; uniqueness via credentials UNIQUE(type='email', external_id=normalized email)
- `migrations/002_accounts.sql` byte-for-byte unchanged (FINAL); runMigrations picks up 003 lexically

**db.js additions (Task 3 TDD):**
- `require('crypto')` (Node built-in) and `require('bcryptjs')` added at top
- `createEmailAccount(email, password, pendingClientId)`:
  - Guard: `password.length < 8` → `{error:'WEAK_PASSWORD'}` (T-02-29)
  - Normalize: `email.trim().toLowerCase()` = external_id (D-20)
  - Dedup: SELECT under BEGIN for race-safe EMAIL_IN_USE check (T-02-32)
  - Hash: `await bcrypt.hash(password, 10)` — async, never hashSync (T-02-27)
  - displayName from email local-part via `sanitizeDisplayName` (D-09)
  - pool.connect() BEGIN/COMMIT/ROLLBACK: promotes guest (D-06) or creates new users row; sets password_hash on credential + email + email_verified=false on user
  - Returns user row on success
- `verifyEmailLogin(email, password)`:
  - Lookup email credential + user in one JOIN, parameterized (T-02-31)
  - Missing row → `{error:'AUTH_FAILED'}` immediately (T-02-28 no enumeration)
  - `await bcrypt.compare(...)` — mismatch → same `{error:'AUTH_FAILED'}` (T-02-28)
  - Returns `{id, display_name, avatar_url}` on success
- `createAuthToken(userId, purpose, ttlSeconds)`:
  - `crypto.randomBytes(32).toString('hex')` — 256-bit token (T-02-30)
  - Parameterized INSERT with interval cast for expires_at (T-02-31)
  - Returns raw token string for caller to email
- `consumeAuthToken(token, purpose)`:
  - Conditional `UPDATE ... WHERE consumed_at IS NULL AND expires_at > now() RETURNING user_id` (T-02-30)
  - No row returned → `{error:'BAD_TOKEN'}` (missing, consumed, expired, or wrong purpose)
  - Returns `{userId}` on success — single-use guaranteed under concurrency
- `markEmailVerified(userId)`: parameterized `UPDATE users SET email_verified=true WHERE id=$1`
- All five appended to `module.exports`; single `new Pool` invariant preserved

**AUTH-06 tests (Task 3 TDD — test/auth.test.js):**
- Suite 4a (no DB): 5 export-shape assertions; passes without DATABASE_URL
- Suite "createEmailAccount" (DB-gated): WEAK_PASSWORD < 8 chars; bcrypt hash ≠ plaintext + `$2b$` prefix; EMAIL_IN_USE dedup; email normalization; email_verified=false on users row
- Suite "verifyEmailLogin" (DB-gated): correct login returns user; wrong password → AUTH_FAILED; unknown email → same AUTH_FAILED (no enumeration)
- Suite "createAuthToken/consumeAuthToken" (DB-gated): round-trip; single-use (second consume BAD_TOKEN); expired token BAD_TOKEN; purpose mismatch BAD_TOKEN; unknown token BAD_TOKEN

## Test Results

```
Test Files  6 passed (6)
     Tests  88 passed | 38 skipped (126)
```

DB-gated suites skip cleanly without `DATABASE_URL`. All non-DB suites pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Architectural clarification] createEmailAccount uses inline transaction rather than delegating to linkOrPromoteAccount**
- **Found during:** Task 3 GREEN implementation
- **Issue:** The plan spec states "call linkOrPromoteAccount('email', ...) then UPDATE credentials SET password_hash". However, linkOrPromoteAccount manages its own pool.connect()/BEGIN/COMMIT — calling it from inside another BEGIN would nest transactions, which is not valid in PostgreSQL (nested BEGIN just issues a warning and is ignored).
- **Fix:** Inline the promote/adopt logic directly in createEmailAccount's own BEGIN/COMMIT boundary, with password_hash set atomically in the same transaction. This achieves the same D-06/D-07 semantics without nesting.
- **Files modified:** db.js
- **Commit:** 183e67d

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — failing tests committed before implementation | b9c32ac | PASS |
| GREEN — implementation passes all tests | 183e67d | PASS |
| REFACTOR — no cleanup needed | — | N/A |

## Known Stubs

None — all five db.js functions are fully implemented with correct semantics. DB-gated test suites are intentional "run with DATABASE_URL" scaffolds, not stubs.

## Threat Flags

No new security surface beyond the plan's threat model. All T-02-27 through T-02-SC mitigations applied:
- T-02-27 (bcrypt hashing): `bcrypt.hash(password, 10)` — plaintext never stored or logged
- T-02-28 (no enumeration): `verifyEmailLogin` returns identical `{error:'AUTH_FAILED'}` for both unknown-email and wrong-password
- T-02-29 (weak passwords): `password.length < 8` guard → WEAK_PASSWORD (server-side, not UI-only)
- T-02-30 (guessable tokens): `crypto.randomBytes(32)` hex + UNIQUE + conditional consumed_at UPDATE + expires_at
- T-02-31 (SQL injection): all auth_tokens + credential SQL parameterized ($1..$4)
- T-02-32 (duplicate email bypass): EMAIL_IN_USE check under BEGIN (race-safe); credentials UNIQUE(type='email', external_id)
- T-02-SC (supply chain): bcryptjs installed after explicit human legitimacy approval

## Self-Check: PASSED

| Item | Status |
|------|--------|
| package.json includes bcryptjs | FOUND |
| migrations/003_email_accounts.sql exists | FOUND |
| db.js exists with 5 new exports | FOUND |
| test/auth.test.js AUTH-06 suites present | FOUND |
| 02-06-SUMMARY.md exists | FOUND |
| Commit 71c8c97 (Task 1 - bcryptjs install) | FOUND |
| Commit 654dc27 (Task 2 - migration 003) | FOUND |
| Commit b9c32ac (Task 3 RED - failing tests) | FOUND |
| Commit 183e67d (Task 3 GREEN - implementation) | FOUND |
| npm test: 88 passed, 38 skipped | PASS |
| migrations/002_accounts.sql unchanged | PASS |
| db.js single new Pool | PASS |
