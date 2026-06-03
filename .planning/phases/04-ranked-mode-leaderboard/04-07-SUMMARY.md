---
phase: 04-ranked-mode-leaderboard
plan: "07"
subsystem: server
tags: [rate-limiting, caching, security, leaderboard, production-hardening]
dependency_graph:
  requires: ["04-04", "04-06"]
  provides: ["CR-02 resolved", "RANK-04 production-hardening complete"]
  affects: ["server.js GET /api/leaderboard", "test/ranking.test.js CR-02 suite"]
tech_stack:
  added: []
  patterns:
    - "RateLimiterMemory in-process per-IP limiter (mirrors authRateLimit convention)"
    - "Module-scoped short-TTL cache cell (lbCache) for RAM-only amortization"
    - "Guard-clause early return on cache hit"
key_files:
  created: []
  modified:
    - server.js
    - test/ranking.test.js
decisions:
  - "D-14: leaderboardLimiter uses 30 points/60s — accommodates normal browser polling while blocking floods; mirrors authRateLimit error shape (code: 'RATE_LIMITED')"
  - "D-15: LB_INPROC_TTL_MS=10s — amortizes sub-TTL bursts in RAM-only mode while staying well under RANK-04 5-minute freshness budget"
  - "D-16: leaderboard route moved after limiter definitions (const is not hoisted; no TDZ error); in-process cache is a separate additive layer that does not alter the Redis path in db.js getLeaderboard"
  - "D-17: leaderboardLimiter/getLbCache/resetLbCache exported via TEST_EXPORTS for per-test isolation without new test dependencies"
metrics:
  duration: "~25 min"
  completed: "2026-06-03"
  tasks_completed: 1
  files_modified: 2
---

# Phase 04 Plan 07: Leaderboard Rate-Limit + In-Process Cache (CR-02) Summary

**One-liner:** Per-IP RateLimiterMemory (30/min) + 10s in-process cache on GET /api/leaderboard closes CR-02 RANK-04 production-hardening gap.

## What Was Built

### Task 1: Rate-limit + in-process cache the GET /api/leaderboard endpoint (CR-02, RANK-04)

**server.js changes:**

- Added `leaderboardLimiter = new RateLimiterMemory({ points: 30, duration: 60 })` near the existing `authLimiter` (line ~207), reusing the already-required `rate-limiter-flexible` package — no new dependency.
- Added `leaderboardRateLimit(req, res, next)` middleware: `leaderboardLimiter.consume(req.ip).then(next).catch(() => res.status(429).json({ code: "RATE_LIMITED" }))` — identical error shape to `authRateLimit`.
- Added `LB_INPROC_TTL_MS = 10000` (10s) and module-scoped `let lbCache = { at: 0, payload: null }` as a RAM-only amortization layer.
- Moved the `GET /api/leaderboard` route registration to AFTER the limiter/cache definitions (const is not hoisted; placing the route before its middleware would throw ReferenceError at module load).
- Updated the route to `app.get("/api/leaderboard", leaderboardRateLimit, async (req, res) => { ... })` with a guard-clause cache-hit early return before the try/catch getLeaderboard() call.
- The in-process cache fills on first (cold) DB read (`lbCache = { at: Date.now(), payload: rows }`) and serves subsequent requests within the 10s window without touching `getLeaderboard()`.
- Redis path in `db.js getLeaderboard` is completely unchanged — the in-process cell is purely additive.
- Exported `leaderboardLimiter`, `getLbCache`, and `resetLbCache` via `TEST_EXPORTS` for test-time state access without supertest.

**test/ranking.test.js changes:**

Added `describe("CR-02: /api/leaderboard rate limit + in-process cache")` with 9 tests:

1. Static grep: `leaderboardLimiter` is `new RateLimiterMemory`
2. Static grep: `leaderboardRateLimit` is defined and calls `consume(req.ip)`
3. Static grep: `app.get('/api/leaderboard', leaderboardRateLimit, ...)` is registered
4. Static grep: 429 response body uses `code: 'RATE_LIMITED'` (matches authRateLimit shape)
5. Static grep: `LB_INPROC_TTL_MS` constant exists
6. Static grep: `lbCache.payload !== null` and TTL comparison guard the handler
7. Behavioral: exhaust leaderboardLimiter budget for a test IP, assert 429 + `RATE_LIMITED`
8. Behavioral: `getLbCache()` / `resetLbCache()` helpers work — exports wired
9. Behavioral: after `resetLbCache()`, cache is cold (at=0, payload=null)

All 9 CR-02 tests pass. All 52 non-DB tests pass. 19 DB-gated tests skipped (no DATABASE_URL).

## Deviations from Plan

### 1. [Rule 3 - Blocking] Route definition order corrected for const hoisting

**Found during:** Task 1 — when placing the leaderboard rate limiter near `authLimiter` (~line 207) while the original route was at line 62.

**Issue:** JavaScript `const` is not hoisted. Registering `app.get("/api/leaderboard", leaderboardRateLimit, ...)` at line 62 while `leaderboardRateLimit` is a `const` at line 207 causes a ReferenceError at module load time (TDZ violation).

**Fix:** Added a placeholder comment at line 59 noting the route is defined below, then placed both the leaderboard cache constants and the route definition AFTER the `leaderboardLimiter`/`leaderboardRateLimit` declarations. The `GET /api/leaderboard` route is now registered at ~line 224, after all its middleware dependencies are initialized.

**Files modified:** server.js

**Commit:** b80b80d

### 2. [Rule 3 - Blocking] Middleware unit test approach used (no supertest)

**Found during:** Task 1 test implementation.

**Issue:** `supertest` is not in `devDependencies` and is not installed in `node_modules`. Installing it was not permissible (no new package installs without human verification per package legitimacy rules).

**Fix:** Used the plan's explicit fallback: middleware unit tests via limiter `consume()` direct calls + stub `req`/`res` objects for the 429 behavioral assertion, plus static grep tests for route registration and cache guard presence. Exported `leaderboardLimiter`, `getLbCache`, `resetLbCache` from `TEST_EXPORTS` so tests can inspect and reset state.

**Files modified:** server.js, test/ranking.test.js

**Commit:** b80b80d

## Verification

- `npx vitest run test/ranking.test.js -t "CR-02"` — 9/9 tests GREEN
- `node --check server.js` — exits 0
- `npx vitest run test/ranking.test.js` — 52 passed, 19 skipped (DB-gated), 0 failed
- Redis path in `db.js getLeaderboard` verified unchanged (no double-cache regression)
- `app.get("/api/leaderboard", leaderboardRateLimit, ...)` confirmed in source

## Threat Model Coverage

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-19 | Mitigated | `leaderboardLimiter` (30/min/IP) blocks floods with 429 before handler runs |
| T-04-20 | Mitigated | `lbCache` (10s TTL) amortizes repeated reads in RAM-only mode |
| T-04-21 | Mitigated | 10s TTL well under RANK-04 5-minute freshness budget |
| T-04-SC | Accepted | No new packages added — `RateLimiterMemory` already in server.js |

## Known Stubs

None — all functionality is fully wired.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. The leaderboard endpoint existed before this plan; this plan only adds middleware and an in-process cache layer.

## Self-Check: PASSED

- `server.js` modified: FOUND
- `test/ranking.test.js` modified: FOUND
- Commit b80b80d: FOUND (`git log --oneline -1` = `b80b80d feat(04-07): rate-limit + in-process cache GET /api/leaderboard (CR-02, RANK-04)`)
- `leaderboardLimiter` in server.js: FOUND (line 207)
- `leaderboardRateLimit` in server.js: FOUND (line 208)
- `app.get("/api/leaderboard", leaderboardRateLimit`: FOUND (line 224)
- `LB_INPROC_TTL_MS` in server.js: FOUND (line 217)
- `lbCache` in server.js: FOUND (lines 218, 228-233)
- CR-02 describe block in test/ranking.test.js: FOUND
- 9 CR-02 tests PASSED
- `node --check server.js`: PASSED
