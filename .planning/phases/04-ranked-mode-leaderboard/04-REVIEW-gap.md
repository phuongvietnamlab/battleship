---
phase: 04-ranked-mode-leaderboard
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - server.js
  - test/ranking.test.js
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 04 (Gap Closure): Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 2 (`server.js`, `test/ranking.test.js`)
**Status:** issues_found

## Summary

Reviewed the gap-closure changes for plans 04-06 (snapshot round-trip of
`userId`/`ranked`/`recorded`) and 04-07 (leaderboard rate limiter + in-process
cache). Scope was the changed surfaces in `server.js` plus the supporting
`test/ranking.test.js`, with cross-reads into `db.js` and `store.js` to trace the
multi-layer leaderboard cache.

No BLOCKER-level defects were found in the gap-closure code. The CR-01 round-trip
fix is correct and conservative (`?? null` coercion is symmetric between
serialize/restore). The CR-02 rate limiter is wired correctly (middleware runs
before the handler, `req.ip` is meaningful because `trust proxy` is set to 1, and
the 429 shape matches the existing `authRateLimit` convention).

The findings below are correctness/robustness concerns in the new cache layer and
two test-quality defects that weaken the gap-closure proof. The most material is
WR-01: the new in-process `lbCache` is never invalidated when a match completes,
so it silently overrides the Redis refresh-on-write that `recordMatch` performs.

## Warnings

### WR-01: In-process `lbCache` is never invalidated on match completion — defeats Redis refresh-on-write

**File:** `server.js:218`, `server.js:224-239` (cross-ref `db.js:551`, `db.js:619-638`)
**Issue:** `recordMatch` fires `refreshLeaderboardCache()` post-COMMIT (`db.js:551`),
which recomputes and rewrites the **Redis** leaderboard cache so a finished ranked
game is reflected promptly. The new module-scoped `lbCache` (`server.js:218`) sits
*in front of* `getLeaderboard()` and is only ever written on a cold read
(`server.js:233`) and only ever cleared by the test-only `resetLbCache`
(`server.js:1736`). Nothing in the match-completion path touches `lbCache`. As a
result, for up to `LB_INPROC_TTL_MS` (10 s) after a match, `/api/leaderboard` serves
a stale payload even though Redis was already refreshed. The whole point of the
post-commit refresh (fresh standings immediately after a ranked result) is
partially defeated by the layer added on top of it. This is within the RANK-04
5-minute freshness budget, so it is not a BLOCKER, but the two mechanisms work
against each other and the staleness is invisible to operators.
**Fix:** Either (a) document explicitly that 10 s post-match staleness is accepted
and that `refreshLeaderboardCache` does not propagate to in-process caches, or
(b) export a `clearLbCache()` and invoke it (best-effort) from the same place the
Redis refresh is triggered. Minimal option (b):
```js
// server.js — export an invalidation hook
function invalidateLbCache() { lbCache = { at: 0, payload: null }; }
module.exports.TEST_EXPORTS.invalidateLbCache = invalidateLbCache;
// db.js recordMatch post-COMMIT, alongside refreshLeaderboardCache():
try { require("./server").TEST_EXPORTS.invalidateLbCache(); } catch (_) {}
```
(Note the circular-require risk of option (b) — if avoided, prefer documenting (a).)

### WR-02: `lbCache` caches across all callers regardless of Redis state — comment claims it is RAM-only

**File:** `server.js:212-218`, `server.js:228-234`
**Issue:** The comment block states the in-process cell exists "When REDIS_URL is
absent ... this in-process cell amortizes reads" and "Works in RAM-only mode where
Redis cache amortization is absent." But the handler caches **unconditionally** —
it never checks `store.isEnabled()`. In a Redis-enabled deployment the in-process
cache still front-runs the Redis cache, so the effective freshness is governed by
the 10 s in-process TTL, not Redis. This is the mechanism behind WR-01 and means
the code does not match its own stated intent (RAM-only only). The divergence
between comment and behavior is a maintenance hazard: a future reader will assume
the cell is dormant under Redis.
**Fix:** Either gate the cache fill/read on `!store.isEnabled()` so the cell truly
only activates in RAM-only mode (matching the comment), or update the comment to
state plainly that the in-process cache is always active and is an additional layer
in front of Redis with its own TTL.

### WR-03: Burst test asserts against a private limiter internal (`leaderboardLimiter._points`) and re-implements the middleware instead of calling it

**File:** `test/ranking.test.js:830`, `test/ranking.test.js:837-851`
**Issue:** The "429-after-burst" test (a) reads `leaderboardLimiter._points`, an
undocumented private field of `rate-limiter-flexible` that can change between minor
versions (the `?? 30` fallback masks the breakage but then the loop count silently
diverges from the real budget), and (b) does not exercise `leaderboardRateLimit`
itself — it hand-rolls a copy of the middleware body inside the test
(`server.js:208-210` logic duplicated at `test/ranking.test.js:841-847`). The test
can therefore pass even if the real `leaderboardRateLimit` middleware is wired
incorrectly (wrong status code, wrong key, missing `.catch`). This weakens the
CR-02 proof to a static grep plus a self-fulfilling behavioral stub.
**Fix:** Export `leaderboardRateLimit` via `TEST_EXPORTS` and invoke it directly
with the req/res/next stubs so the assertion covers the shipped code path. Drive the
configured point budget from the known constant (30) rather than a private field.

## Info

### IN-01: `lbCache` cannot be exercised end-to-end by the test that claims to prove amortization

**File:** `test/ranking.test.js:865-893`
**Issue:** The "in-process cache stores payload and serves repeat reads within TTL
window" test explicitly concedes it "cannot mutate it from outside because it's a
module-scoped let binding" and only verifies `resetLbCache` zeroes the cell. The
amortization behavior (warm-cache short-circuit at `server.js:228-230`) is asserted
only via static grep (`test/ranking.test.js:798-804`). The test name overstates
what it verifies.
**Fix:** Expose a `setLbCache(payload)` test helper (or test the route through
`app` with a supertest-style request) so the warm-cache early-return is actually
executed, then rename the test to match what it proves.

### IN-02: Duplicate inline comment above the `chat` handler

**File:** `server.js:1563-1566`
**Issue:** The two-line comment describing the chat relay/throttle is duplicated
verbatim-then-paraphrased (lines 1563-1564 vs 1565-1566). Not in the gap-closure
scope but adjacent dead documentation noise.
**Fix:** Delete the first of the two comment blocks.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
