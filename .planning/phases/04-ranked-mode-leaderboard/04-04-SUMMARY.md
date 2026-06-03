---
phase: 04-ranked-mode-leaderboard
plan: "04"
subsystem: database
tags: [redis, postgres, leaderboard, glicko2, react, i18n]

# Dependency graph
requires:
  - phase: 04-01
    provides: Glicko-2 elo.js, migrations/005_rankings.sql ratings table with rd column
  - phase: 04-03
    provides: recordMatch ranked branch that writes ratings to Postgres post-COMMIT
provides:
  - store.js getLeaderboardCache / setLeaderboardCache Redis helpers (300s TTL, graceful-degrade)
  - db.js getLeaderboard (rd<110 filter, top 100, Redis-then-Postgres fallback)
  - db.js refreshLeaderboardCache (fire-and-forget post-COMMIT hook in recordMatch)
  - GET /api/leaderboard Express endpoint (public, no auth, non-sensitive fields only)
  - LeaderboardView React component with fetch, ranked list, empty/provisional states
  - EN/VI i18n strings for leaderboard (title, empty, provisionalNote, rating, back, open)
affects: [04-05-season-reset, phase-05-matchmaking, phase-06-bots]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redis-then-Postgres cache fallback: check cache, on miss query DB + populate cache, swallow cache errors"
    - "Fire-and-forget post-COMMIT refresh: refreshLeaderboardCache().catch(()=>{}) after COMMIT never before"
    - "Provisional gate: rd < 110 = established = shown; rd >= 110 = provisional = hidden in SELECT"

key-files:
  created: []
  modified:
    - store.js
    - db.js
    - server.js
    - public/app.jsx
    - test/ranking.test.js

key-decisions:
  - "D-08: Provisional players (rd >= 110) excluded from leaderboard visibility but still rated normally — WHERE rd < 110 with explicit comment"
  - "D-09: Redis cache with 300s TTL (LEADERBOARD_TTL constant) — refreshed fire-and-forget after every rating commit; falls back to direct Postgres on Redis unavailability"
  - "D-10: Leaderboard ordered by rating DESC, limited to top 100 established players; JOIN users for display_name/avatar_url; no email/credential fields exposed (T-04-12)"

patterns-established:
  - "Redis leaderboard cache: store.js encapsulates client, never exposed; LEADERBOARD_KEY/TTL constants; ready guard on all helpers"
  - "Graceful cache degrade: getLeaderboard catches Redis errors and falls through to direct Postgres query"
  - "Post-commit refresh hook: placed AFTER COMMIT in ranked branch, fire-and-forget, never awaited (Pitfall 1/4 compliance)"

requirements-completed: [RANK-03, RANK-04]

# Metrics
duration: ~4min
completed: "2026-06-03"
---

# Phase 4 Plan 4: Leaderboard Cache + Public Endpoint + UI Summary

**Redis-cached top-100 leaderboard (rd<110 provisional gate, 300s TTL, Postgres fallback) served via GET /api/leaderboard with React UI and EN/VI i18n**

## Performance

- **Duration:** ~4 min (198 seconds across task commits)
- **Started:** 2026-06-03T05:09:23Z
- **Completed:** 2026-06-03T05:12:41Z
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint — approved)
- **Files modified:** 5

## Accomplishments

- Store.js gained `getLeaderboardCache` / `setLeaderboardCache` following the existing saveSnapshot/loadSnapshot graceful-degrade shape — Redis client stays encapsulated (Pitfall 6 compliance)
- db.js exports `getLeaderboard` (Redis-then-Postgres fallback with rd<110 filter, top 100, rating DESC) and `refreshLeaderboardCache` (fire-and-forget post-COMMIT hook in recordMatch's ranked branch)
- GET /api/leaderboard Express endpoint returns public non-sensitive fields (id, display_name, avatar_url, rating, rd, games_played); 500 LEADERBOARD_UNAVAILABLE on failure
- LeaderboardView React component fetches on mount, renders ranked list with rank#/avatar/name/integer-rating, empty state, provisional note; display names rendered as text only (T-04-15)
- EN/VI i18n strings added: leaderboard.title, leaderboard.empty, leaderboard.provisionalNote, leaderboard.rating, leaderboard.back, leaderboard.open

## Task Commits

Each task was committed atomically:

1. **Task 1: store.js cache helpers + db.js getLeaderboard/refreshLeaderboardCache + recordMatch refresh hook** - `c7fadd5` (feat)
2. **Task 2: server.js GET /api/leaderboard endpoint** - `05e6340` (feat)
3. **Task 3: public/app.jsx leaderboard view + EN/VI strings** - `4a4e8ae` (feat)
4. **Task 3a: test slice boundary bugfix** - `bc4e31f` (fix — Rule 1)
5. **Task 4: Human-verify checkpoint** — approved by user (no commit; verified behavior only)

## Files Created/Modified

- `store.js` - Added LEADERBOARD_KEY/LEADERBOARD_TTL constants; setLeaderboardCache (EX 300) + getLeaderboardCache with ready guard and swallow-catch; both added to module.exports
- `db.js` - Added buildLeaderboard() private query (rd<110, ORDER BY rating DESC, LIMIT 100, JOIN users); getLeaderboard() Redis-then-Postgres fallback; refreshLeaderboardCache() fire-and-forget; post-COMMIT refresh hook in recordMatch ranked branch
- `server.js` - Destructured getLeaderboard from db.js require; added app.get('/api/leaderboard') async handler with try/catch → 500 LEADERBOARD_UNAVAILABLE
- `public/app.jsx` - LeaderboardView component; Lobby leaderboard button entry point; App wires leaderboard screen; 6 EN/VI i18n string pairs
- `test/ranking.test.js` - Static grep tests for store.js/db.js/server.js exports + filter/order/limit; DB-gated RANK-03 provisional filter and RANK-04 cache integration tests; Task 3a bounded recordMatch slice to prevent false positives from new helpers

## Decisions Made

- **D-08 (RANK-03 provisional gate):** `WHERE rd < 110` with explicit comment ("rd < 110 = established = shown; rd >= 110 = provisional = hidden — Pitfall 3") — provisional players rated but not visible until placement completes
- **D-09 (RANK-04 cache TTL):** 300-second TTL via LEADERBOARD_TTL constant in store.js; cache refreshed fire-and-forget after every rating commit via `refreshLeaderboardCache().catch(()=>{})` placed strictly after COMMIT
- **D-10 (leaderboard shape):** Top 100 by rating DESC; JOIN users for display_name/avatar_url; no email/credential columns in SELECT (T-04-12 mitigated)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bounded recordMatch pool.connect grep to function body slice**
- **Found during:** Task 3a (post-Task-3 regression)
- **Issue:** Plan 04-04 added refreshLeaderboardCache/getLeaderboard after recordMatch in db.js, both calling pool.connect(). The Plan 03 static grep test used `src.slice(indexOf('recordMatch'))` which extends to end-of-file, capturing the new helpers and failing the count-is-1 assertion.
- **Fix:** Limited the slice to 3000 chars (recordMatch body is ~600 chars) so only the recordMatch function body is scanned; grep no longer captures subsequent helper functions.
- **Files modified:** test/ranking.test.js
- **Verification:** Vitest static grep tests pass after the fix.
- **Committed in:** bc4e31f (Rule 1 auto-fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary correctness fix for test isolation; no scope creep.

## Human-Verify Checkpoint

**Task 4** was a `checkpoint:human-verify` gate requiring visual confirmation that:
- Leaderboard renders top players ordered by rating with name/avatar/integer rating
- Provisional players (rd >= 110) do not appear; provisional note is shown
- EN/VI strings correct on language switch
- Redis-down fallback still loads the leaderboard via direct Postgres

**Outcome:** Approved by user ("approved" response). No issues reported.

## Issues Encountered

None beyond the Rule 1 auto-fix documented above.

## User Setup Required

None - no external service configuration required for this plan. Leaderboard requires Postgres (ratings table from Plan 01) and optionally Redis (degrades gracefully if unavailable).

## Next Phase Readiness

- Leaderboard slice complete: GET /api/leaderboard live, cached, provisional-gated, UI wired
- Plan 04-05 (season reset CLI) can proceed — it shares the ratings table and will call refreshLeaderboardCache after season reset
- Phase 05 matchmaking can display ratings from the same leaderboard endpoint
- No blockers from this plan

---
*Phase: 04-ranked-mode-leaderboard*
*Completed: 2026-06-03*
