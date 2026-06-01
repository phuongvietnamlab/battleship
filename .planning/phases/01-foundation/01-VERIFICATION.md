---
phase: 01-foundation
verified: 2026-06-02T00:07:00Z
status: passed
score: 5/5
overrides_applied: 0
reverification_note: "Criteria 1 & 2 (initially human_needed for lack of DATABASE_URL) verified 2026-06-02 against a local Postgres 16 Docker container (localhost:5433) standing in for EC2. Live boot E2E: server migrated 001_identity.sql, created users/credentials/schema_migrations, listened, /healthz=ok. DB-gated suites run live: db.test.js 10/10, migrate.test.js 11/11, full suite 85/85 (after vitest fileParallelism=false fix bfefbfe to stop shared-DB worker races). CR-02 no-orphan-users count test passes against real Postgres."
---

# Phase 01: Foundation Verification Report

**Phase Goal:** The server durably stores data in self-hosted Postgres (on the dedicated EC2 box) and is hardened against the attack vectors that become critical under public play.
**Verified:** 2026-06-02T00:07:00Z (initial 2026-06-01T23:58:00Z)
**Status:** passed
**Re-verification:** Yes — criteria 1 & 2 re-verified live against local Postgres 16 Docker container (stand-in for EC2)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server connects to self-hosted Postgres via a shared pool (params from env vars) and all queries succeed without crashing under normal play | ✓ VERIFIED | Pool singleton confirmed in db.js (single `new Pool` at module scope, line 32, max:10, env-gated). VERIFIED LIVE 2026-06-02 against Postgres 16 Docker (localhost:5433): server connected, `/healthz`=`{ok:true}`, db.test.js 10/10 incl. CR-02 no-orphan-users count test. |
| 2 | Database schema is created/migrated automatically on server start — no manual SQL step | ✓ VERIFIED | `runMigrations(pool)` wired in boot IIFE (server.js line 1030) before `server.listen`, try/catch + `process.exit(1)` on failure (DATA-02 fail-loud). VERIFIED LIVE 2026-06-02: fresh DB auto-created users/credentials/schema_migrations on boot; schema_migrations recorded 001_identity.sql; migrate.test.js 11/11 (idempotency + fail-loud). |
| 3 | `fire` and `useAbility` socket events are rate-limited per player; rapid-fire attacker gets errors, not a crash | VERIFIED | `fireLimiter {points:2, duration:1}`, `abilityLimiter {points:1, duration:1}` declared at server.js lines 80-81; `RATE_LIMITED` returned in fire (line 815) and useAbility (line 856); `socket.disconnect(true)` on abuse (lines 814, 855). 23 ratelimit tests pass. |
| 4 | A `doShot()` call with null/malformed opponent state returns an error response instead of throwing | VERIFIED | Guard at doShot lines 562-566: cells array check + oppData/me null check, both return `{ok:false,code:"BAD_STATE"}`. 11 doShot guard tests pass including null opponent, missing occ, missing me, null/empty cells, and happy-path regression. |
| 5 | Abandoned rooms are evicted from the in-memory room map (bounded growth); user-supplied profile + chat inputs validated server-side and rejected if malformed | VERIFIED | `sweepRooms()` with `ROOM_IDLE_THRESHOLD_MS=300000` registered in boot with `.unref()` (server.js line 1048). `touchRoom()` called in fire, placeShips, chat, resume, rejoin. `sanitizeProfile` HTML-escapes + strips control chars + caps at 40 chars. `sanitizeChat` strips control chars, collapses whitespace, caps at 200, returns null for invalid. CSP middleware sets `script-src 'self'` (no unsafe-inline). 41 hardening tests pass. |

**Score:** 3/5 truths verified (2 require human testing against live DB)

### Deferred Items

None — all items are either verified or require human testing in this phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db.js` | Single shared pg.Pool singleton + runMigrations + upsertGuestCredential | VERIFIED | All three exports present (line 114); single `new Pool` at module scope (line 32); CJS `require("pg")` — no ESM |
| `migrations/001_identity.sql` | users, credentials (unique type+external_id) tables | VERIFIED | Both tables with `CREATE TABLE IF NOT EXISTS`; `UNIQUE (type, external_id)` on credentials (line 19); schema_migrations created by runner in db.js, not in this file (test accommodates this at migrate.test.js line 112) |
| `vitest.config.js` | Test runner scaffold | VERIFIED | Present; node environment; `test/**/*.test.js` glob |
| `server.js` | RateLimiterMemory, BAD_STATE guard, sweepRooms, sanitizeProfile/Chat, CSP, CJS module.exports | VERIFIED | All present; `module.exports = { TEST_EXPORTS: {...} }` at line 1067 (CJS — CR-01 fix confirmed); `require.main === module` boot guard at line 1024 (WR-01 fix confirmed) |
| `test/db.test.js` | Pool shape + upsertGuestCredential idempotency tests | VERIFIED | Pool/module shape tests (4) pass; DB-gated idempotency tests (6) skip cleanly without DATABASE_URL; CR-02 count test present (line 95) |
| `test/migrate.test.js` | Migration runner idempotency + fail-loud tests | VERIFIED | Runner idempotency and fail-loud tests present; DB-gated (skip without DATABASE_URL); static DDL checks pass |
| `test/ratelimit.test.js` | Rate limiter + resolving race guard tests | VERIFIED | 23 tests pass; limiter isolation, reject limits, abuse-disconnect path, resolving flag |
| `test/hardening.test.js` | doShot guard, sweepRooms, sanitization, CSP tests | VERIFIED | 41 tests pass; imports via CJS default-import interop (CR-01 fix wired in test) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js boot IIFE | db.js runMigrations | `await runMigrations(pool)` before server.listen (line 1030) | WIRED | Confirmed: runMigrations at index 9884 in file, server.listen at index 10083 — migration precedes listen |
| server.js createRoom/joinRoom/resume/rejoin | db.js upsertGuestCredential | fire-and-forget call after seat assignment | WIRED | 6 occurrences in server.js (1 require, 5 call sites: createRoom line 664, joinRoom reclaim line 699, joinRoom new-player line 716, resume line 737, rejoin line 762) — 5 call sites covers 4 handlers + the WR-05 reclaim path fix |
| fire/useAbility/chat handlers | RateLimiterMemory limiters | `await limiter.consume(rlKey)` at top of handler | WIRED | Confirmed in fire (line 810), useAbility (line 852), chat (line 938) |
| fire handler + onTurnTimeout | room.resolving flag | set before doShot, checked in onTurnTimeout | WIRED | `room.resolving = true` before doShot (line 836), `finally { room.resolving = false }` (line 841); `if (room.resolving) return` in onTurnTimeout (line 542); initialized in createRoom (line 653) |
| chat handler | sanitizeChat | replaces inline text processing | WIRED | `sanitizeChat(arg && arg.text)` at line 949; definition at line 187; grep -c returns 3 (definition + call + TEST_EXPORTS) |

### Data-Flow Trace (Level 4)

Not applicable — this phase adds infrastructure (DB pool, rate limiters, sanitization functions, room eviction) rather than data-rendering components. No UI rendering paths or data-display artifacts to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| server.js imports as CJS without booting | `node -e "require('./server.js')"` | "CJS import OK" | PASS |
| server.js entry-point fails loudly on missing DB (not "require is not defined") | `node server.js` (timeout 8s) | "[db] migration failed on boot, exiting: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string" — exits 1 | PASS (CR-01 fix confirmed; WR-04 exit message confirmed) |
| Full test suite | `npm test` | 73 passed, 12 skipped (DB-gated), 0 failed, no unhandled-rejection warning | PASS |
| Single shared pool | `grep -c "new Pool" db.js` | 1 | PASS |
| upsertGuestCredential call sites | `grep -c "upsertGuestCredential" server.js` | 6 (1 require + 5 call sites) | PASS |
| RATE_LIMITED in all three handlers | `grep -n "RATE_LIMITED" server.js` | Lines 815 (fire), 856 (useAbility), 943 (chat) | PASS |
| resolving flag occurrences | `grep -c "resolving" server.js` | 10 (>= 5 required) | PASS |
| BAD_STATE guard in doShot | `grep -n "BAD_STATE" server.js` | Lines 562, 566 (doShot guard) + 824, 912 (resolving guards) | PASS |
| sanitizeChat wired in chat handler | `grep -c "sanitizeChat" server.js` | 3 (definition + chat call + TEST_EXPORTS) | PASS |
| CSP header present | `grep -n "Content-Security-Policy" server.js` | Lines 43 (comment), 48 (setHeader) | PASS |

### Probe Execution

No probes declared in PLAN files. Step 7c: no probe scripts found in `scripts/*/tests/probe-*.sh`. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| DATA-01 | 01-01-PLAN.md | Server connects to Postgres via shared pool with env params | ? HUMAN_NEEDED | Pool singleton confirmed in code; live DB connection requires human testing |
| DATA-02 | 01-01-PLAN.md | Schema auto-migrated on server startup; failed migration exits non-zero | ? HUMAN_NEEDED | Runner wired before listen, fail-loud exit confirmed; live migration run requires human testing |
| SEC-01 | 01-02-PLAN.md | fire and useAbility rate-limited per player | SATISFIED | RateLimiterMemory instances with D-07 limits in server.js; RATE_LIMITED in all 3 handlers; 23 tests pass |
| SEC-02 | 01-03-PLAN.md | doShot() guards null/malformed opponent state without crashing | SATISFIED | Guard clause at lines 562-566; never throws; 11 tests pass |
| SEC-03 | 01-03-PLAN.md | Abandoned rooms cleaned from in-memory map | SATISFIED | sweepRooms() with ROOM_IDLE_THRESHOLD_MS; clearTurnTimer called in sweep (line 508); setInterval with .unref(); 6 sweep tests pass |
| SEC-04 | 01-03-PLAN.md | Server validates user-supplied profile and chat input | SATISFIED | sanitizeProfile escapes HTML + strips control chars + caps at 40; sanitizeChat strips + caps + returns null; CSP script-src 'self'; 20+ sanitization/CSP tests pass |

All 6 phase requirements are addressed. DATA-01 and DATA-02 satisfy code + structural requirements fully but require human testing of the live DB path.

### Review Findings Verification (Post-Fix)

| Finding | Severity | Fix Commit | Verified Hold |
|---------|----------|-----------|---------------|
| CR-01: `export const TEST_EXPORTS` broke CJS boot | BLOCKER | e11d0fa | CONFIRMED — `module.exports = { TEST_EXPORTS: {...} }` at line 1067; `node server.js` no longer throws "require is not defined" |
| CR-02: CTE leaked orphan users row per returning guest | BLOCKER | 7e33221 | CONFIRMED IN CODE — `INSERT INTO users (created_at) SELECT now() WHERE NOT EXISTS (SELECT 1 FROM existing_user)` at db.js line 91-93; count test present but DB-gated |
| WR-01: server.js boot as import side effect | WARNING | e11d0fa | CONFIRMED — `if (require.main === module)` at line 1024; no unhandled-rejection warning in `npm test` |
| WR-02: chat not HTML-escaped | WARNING | e11d0fa | CONFIRMED — `sanitizeChat` wraps with `escapeHtml(...)` at line 191 |
| WR-03: escapeHtml threw on non-string | WARNING | e11d0fa | CONFIRMED — `if (typeof s !== "string") return ""` guard at line 162 |
| WR-04: DB failure was opaque unhandled rejection | WARNING | e11d0fa | CONFIRMED — try/catch around runMigrations with `process.exit(1)` and logged message (lines 1029-1033); verified by `node server.js` output |
| WR-05: joinRoom reclaim path skipped upsertGuestCredential | WARNING | e11d0fa | CONFIRMED — `upsertGuestCredential(clientId)` at line 699 before reclaim return |
| WR-06: leaveRoom left room.turn/resolving stale | WARNING | e11d0fa | CONFIRMED — `room.turn = null; room.resolving = false` in leaveRoom opponent-remains branch (lines 996-997) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 933 | Duplicate comment block ("Relay a chat message...") — IN-03 flagged in review | INFO | Dead comment only; no functional impact. Review finding IN-03 was out of scope for the fix round. |

No TBD, FIXME, or XXX markers found in any phase-modified files. No stubs detected in production code paths.

### Human Verification Required

#### 1. Live Postgres Connection + Auto-Migration (DATA-01, DATA-02)

**Test:** On the EC2 box with DATABASE_URL set to `postgres://battleship:PASS@localhost:5432/battleship`, run `node server.js`.
**Expected:** Server logs `[db] migration applied: 001_identity.sql` on first boot, then `Battleship server running at http://localhost:PORT`. Verify `users`, `credentials`, and `schema_migrations` tables exist with correct columns. On second restart, no migration log appears (idempotency). Kill DB and verify server logs `[db] migration failed on boot, exiting: ...` and exits non-zero (DATA-02 fail-loud).
**Why human:** No DATABASE_URL available in this environment. The 12 DB-gated tests cover all these assertions but require a live Postgres instance.

#### 2. CR-02 Orphan Users Fix — Count Verification (DATA-01 correctness)

**Test:** With DATABASE_URL set, run `npm test` (the previously-skipped DB-gated tests will now run, including the CR-02 count test at test/db.test.js line 95).
**Expected:** All 85 tests pass (73 previously passing + 12 now running). The CR-02 count test asserts `SELECT count(*) FROM users` is unchanged after a second `upsertGuestCredential(sameClientId)` call.
**Why human:** The conditional `INSERT...SELECT WHERE NOT EXISTS` CTE fix is correct in code review, but the count assertion can only run against a live Postgres instance where the CTE semantics are actually exercised.

### Gaps Summary

No automated gaps found. The two human_needed items are environment-only blockers — the code implementation is complete and correct. All 8 code-review findings (2 BLOCKERs + 6 warnings) have been fixed and verified to hold in the codebase.

The `schema_migrations` table not appearing in `migrations/001_identity.sql` diverges from the literal plan acceptance criterion (01-01-PLAN.md line 160), but the test explicitly accommodates this (migrate.test.js line 112: "schema_migrations is created by the runner itself, may not be in 001") and the functional behavior is equivalent — the table is created by `runMigrations` before any SQL files are applied. No override is needed as the test already handles this deviation.

---

_Verified: 2026-06-01T23:58:00Z_
_Verifier: Claude (gsd-verifier)_
