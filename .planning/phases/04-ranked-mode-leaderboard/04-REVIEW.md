---
phase: 04-ranked-mode-leaderboard
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - db.js
  - elo.js
  - migrations/005_rankings.sql
  - public/app.jsx
  - scripts/season-reset.js
  - server.js
  - store.js
  - test/elo.test.js
  - test/ranking.test.js
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase-04 ranked-mode + leaderboard work: Glicko-2 rating math (`elo.js`),
same-transaction rating writes (`db.js#recordMatch`), the public leaderboard endpoint +
Redis cache (`server.js`, `store.js`, `db.js`), ranked-room gating (`server.js`), the
`005_rankings.sql` migration, and the season-reset CLI (`scripts/season-reset.js`).

Overall the core mechanics are sound: SQL is consistently parameterized, the rating write
shares the `recordMatch` transaction (atomic rollback verified by tests), ranked gating reads
`userId` from the server session rather than client args, and the leaderboard SELECT projects
only non-sensitive columns. The Glicko-2 implementation passes its unit suite.

Two blockers stand out: (1) the Redis snapshot/restore path does **not** persist `room.ranked`,
seat `userId`, or `room.recorded`, so any server restart mid-ranked-game silently drops both
the rating write and the match record entirely; and (2) the public unauthenticated
`/api/leaderboard` endpoint has no rate limiting and, in the documented RAM-only (no-Redis)
Render configuration, hits Postgres on every single request with no cache layer. A PII concern
(email local-parts surfaced as public display names) and a few robustness gaps round out the list.

## Critical Issues

### CR-01: Redis restore drops `ranked`, seat `userId`, and `recorded` — ranked results silently lost on restart

**File:** `server.js:781-817` (serializeRooms), `server.js:822-863` (restoreRooms)
**Issue:**
`serializeRooms` does not write `r.ranked` or `r.recorded` into the snapshot, and the per-player
serialized object (lines 788-798) omits `userId`. `restoreRooms` correspondingly never restores
`ranked`, `recorded`, or per-seat `userId` (the rebuilt room object at lines 847-861 has no
`ranked` key; the rebuilt player object at 830-843 has no `userId`).

Consequence: if a ranked game is in progress when the process restarts and is restored from the
Redis snapshot, `rooms[code].ranked` is `undefined` (falsy) and every seat's `userId` is `undefined`.
When that game then ends (`endGameForfeit` / `doShot` / `scheduleSeatRelease` / `leaveRoom`),
`recordMatch(wId, lId, reason, mode, startedAt, room.ranked)` is invoked with `wId == null`,
`lId == null`, and `ranked == undefined`. The `winnerId == null || loserId == null` guard in
`recordMatch` (db.js:468) then skips the write entirely — so the ranked rating update is lost
**and** no match row is written at all. This defeats the stated crash-recovery value of the
snapshot for exactly the games (ranked) where correctness matters most. It is a data-loss bug.

`recorded` being lost is a secondary correctness hazard: after restore the dedup flag is reset,
so any code path that fired before the snapshot could be re-evaluated.

**Fix:** Persist and restore the ranked/identity fields:
```js
// serializeRooms — add to the per-room object (line ~810):
ranked: !!r.ranked,
recorded: !!r.recorded,
// serializeRooms — add to the per-player object (line ~797):
userId: p.userId ?? null,

// restoreRooms — add to the rebuilt room (line ~856):
ranked: !!s.ranked,
recorded: !!s.recorded,
// restoreRooms — add to the rebuilt player (line ~842):
userId: p.userId ?? null,
```

### CR-02: Public `/api/leaderboard` has no rate limit and bypasses caching entirely in RAM-only mode

**File:** `server.js:62-70`, `db.js:591-617`, `store.js:80-88`
**Issue:**
The endpoint is public and unauthenticated by design. Its only stated DoS mitigation is the
Redis cache ("Postgres is touched at most once per TTL window"). But CLAUDE.md documents that the
current Render deployment runs **RAM-only** (no `REDIS_URL`). In that configuration
`store.getLeaderboardCache()` returns `null` on every call (store.js:81 guard), so `getLeaderboard`
falls through to `buildLeaderboard` — a `JOIN` + `ORDER BY rating DESC LIMIT 100` over the full
`ratings`/`users` tables — on **every** request, and `setLeaderboardCache` is a no-op. There is no
rate-limiting middleware on this route even though the codebase already has an established
`authRateLimit` helper (server.js:214) and `RateLimiterMemory` (server.js:203-206). A trivial
unauthenticated request flood drives unbounded Postgres load. The phase explicitly called out
DDoS mitigation as in-scope.

**Fix:** Apply an in-memory IP rate limiter to the route (no Redis dependency), mirroring the
existing `authRateLimit` pattern:
```js
const leaderboardLimiter = new RateLimiterMemory({ points: 30, duration: 60 }); // 30/min/IP
function leaderboardRateLimit(req, res, next) {
  leaderboardLimiter.consume(req.ip).then(next).catch(() => res.status(429).json({ error: "RATE_LIMITED" }));
}
app.get("/api/leaderboard", leaderboardRateLimit, async (req, res) => { /* ... */ });
```
Optionally also serve a short-TTL in-process cache so RAM-only mode still amortizes the query.

## Warnings

### WR-01: Email local-part leaks as a public display name on the leaderboard (PII)

**File:** `db.js:274-276` and `db.js:317`, surfaced via `db.js:575-587` + `server.js:62-70`
**Issue:**
For email/password signups, the display name is derived directly from the email local-part
(`normalizedEmail.split("@")[0]`) and stored in `users.display_name`. `buildLeaderboard` selects
`u.display_name` and the public `/api/leaderboard` returns it verbatim. A user registering as
`firstname.lastname@employer.com` is published on a public, unauthenticated endpoint as
`firstname.lastname` without ever choosing a public handle. The phase brief explicitly flags PII
leakage in the leaderboard response as a review focus. While the email address itself is not
exposed, the derived real-name local-part frequently is.

**Fix:** Do not default a public display name to the email local-part, or exclude email-derived
default names from the public leaderboard until the user sets an explicit handle. E.g. generate a
neutral default (`Player-<id>`) for email accounts, or add a `display_name_is_default` flag and
render anonymized names for defaults in `buildLeaderboard`.

### WR-02: Empty `ratings` table still creates a season + advances state in season-reset

**File:** `scripts/season-reset.js:34-62`
**Issue:**
If `ratings` is empty, the archive `INSERT ... SELECT FROM ratings` inserts zero rows and the
`UPDATE ratings` touches zero rows, but the `seasons` row is still created and committed. Running
the CLI before any ranked games exist (or against the wrong/empty database) silently produces an
"empty" season with no archived history, consuming a label and a season id. The idempotency guard
(UNIQUE label) only protects against re-using the *same* label; it does not protect against
archiving nothing. Combined with the `Season-${Date.now()}` default label in `main()` (line 77),
an accidental no-arg invocation always succeeds and creates a junk season.

**Fix:** Either require a non-empty arg (fail if `process.argv[2]` is missing instead of
defaulting to a timestamp), or guard the transaction to abort when `SELECT count(*) FROM ratings`
is 0, so an empty reset does not silently consume a season slot.

### WR-03: `createAuthToken` interpolates TTL into an interval expression instead of binding a typed parameter

**File:** `db.js:401-408`
**Issue:**
`now() + ($4 || ' seconds')::interval` with `$4 = String(ttlSeconds)` builds the interval by string
concatenation of a bound parameter. It is parameterized (so not classic SQL injection), but the
value is coerced via `String(ttlSeconds)` with no validation — a non-numeric or malformed
`ttlSeconds` produces a runtime cast error (`invalid input syntax for type interval`) rather than a
guarded named-code response, and a negative value yields an already-expired token. This is a
robustness/correctness gap in token issuance.

**Fix:** Bind the seconds as a numeric and use `make_interval`, validating up front:
```js
const ttl = Number(ttlSeconds);
if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("BAD_TTL");
await pool.query(
  "INSERT INTO auth_tokens (user_id, token, purpose, expires_at) VALUES ($1,$2,$3, now() + make_interval(secs => $4))",
  [userId, token, purpose, ttl]
);
```

### WR-04: `getLeaderboard` cache fallback can still throw and 500 the endpoint on a Postgres outage

**File:** `db.js:591-617`, `server.js:62-70`
**Issue:**
When Redis is down/empty, `getLeaderboard` calls `pool.connect()` + `buildLeaderboard`. If Postgres
is unreachable, the error propagates out of `getLeaderboard` to the route handler, which returns a
500 `LEADERBOARD_UNAVAILABLE`. That is acceptable, but note the `pool.connect()` rejection at
db.js:608 is *not* wrapped in the try/finally (the `try` starts only after a successful connect), so
a connect failure rejects before `client.release()` can ever run — fine for that path, but the
endpoint then has no degraded-mode response (e.g. last-known cache). Minor robustness gap: a single
Postgres blip with cold/no cache surfaces as a hard 500 to all clients.

**Fix:** On the Postgres-fallback failure, attempt to serve any still-present (even slightly stale)
cache value before returning 500, and ensure connect-failure paths cannot leak a connection. Low
priority relative to CR-02 but worth hardening since this is the public hot path.

## Info

### IN-01: `season-reset` no-arg default label is non-deterministic and undermines idempotency intent

**File:** `scripts/season-reset.js:77`
**Issue:** `const label = process.argv[2] || \`Season-${Date.now()}\`;` means a forgotten argument
never trips the UNIQUE-label idempotency guard — every accidental run creates a brand-new season.
The whole idempotency story rests on the operator passing a stable label.
**Fix:** Treat a missing label as a usage error (`console.error` + `process.exit(2)`) rather than
inventing one.

### IN-02: `recordMatch` re-reads each rating with a separate query instead of one round-trip

**File:** `db.js:491-501`
**Issue:** Two separate `SELECT ... FROM ratings WHERE user_id = $1` queries (one per player) inside
the transaction. Functionally correct, but a single `WHERE user_id IN ($1,$2)` (or `= ANY`) would
halve the round-trips. Not a correctness issue; noted only because it is on the ranked write path.
**Fix:** Fetch both rows in one query and split by `user_id` in JS. (Out of strict v1 perf scope —
informational only.)

### IN-03: Leaderboard `avatar_url` is rendered as an `<img src>` with no URL validation

**File:** `public/app.jsx:1567-1570`, source `db.js:584` / `db.js:186,219`
**Issue:** `avatar_url` comes from the OAuth provider profile and is stored/served unvalidated, then
used directly as `<img src={row.avatar_url}>`. `referrerPolicy="no-referrer"` is set (good), and an
`img src` cannot execute script, so this is not XSS. But a `javascript:`/`data:` or attacker-chosen
URL stored via a compromised provider field would be loaded for every leaderboard viewer. Low risk
given the value originates from trusted OAuth providers, but worth constraining to `https://` URLs
at write time.
**Fix:** Validate `avatar_url` starts with `https://` in `sanitize`/write paths before persisting.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
