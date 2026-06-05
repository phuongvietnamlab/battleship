---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Awaiting next milestone
stopped_at: Phase 7 context gathered
last_updated: "2026-06-05T03:30:35.017Z"
last_activity: 2026-06-04 — Milestone v1.0 completed and archived
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 27
  completed_plans: 27
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Two players can find each other and play a fair, fast, satisfying game of Battleship — and have a reason to come back tomorrow.
**Current focus:** Phase 06 — bot-difficulty-tiers

## Current Position

Phase: Milestone v1.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-04 — Milestone v1.0 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 05 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| Phase 01-foundation | P01 | ~30 min | 3 tasks | 7 files |
| Phase 01-foundation | P02 | ~25 min | 2 tasks | 4 files |
| Phase 01-foundation PP03 | 30 min | 3 tasks | 2 files |
| Phase 04 P01 | 25 min | 3 tasks | 4 files |
| Phase 04 P03 | ~4 min | 2 tasks | 3 files |
| Phase 04-ranked-mode-leaderboard P04 | 4min | 4 tasks | 5 files |
| Phase 05-public-matchmaking P01 | 7 min | 3 tasks | 4 files |
| Phase 05-public-matchmaking P02 | 15min | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Glicko-2 chosen over ELO (handles provisional ratings; 40-line pure function in `elo.js`)
- Roadmap: express-session + connect-pg-simple for OAuth sessions; JWT for guest identity only
- Infra: Self-hosted Postgres + Redis on dedicated EC2 (was Render-managed); app connects over localhost/env-var params; Redis now always available
- Scope: Saved replays cut from vision (MATCH-02 dropped) — live spectate covers "watch"; no per-move persistence needed
- Roadmap: Phase 6 (Bot) depends only on Phase 1 — parallelizable if needed
- [Phase ?]: Single shared pg.Pool (max:10) at module scope in db.js — never per-request (Pitfall 4)
- [Phase ?]: Fail-loud migration runner: no try/catch in runMigrations; boot IIFE has no catch so bad migration exits process (DATA-02)
- [Phase ?]: CTE upsert in upsertGuestCredential: single parameterized query prevents orphan users; all SQL uses $1 binding (T-01-02)
- [Phase ?]: upsertGuestCredential wired into joinRoom P2 path (extends D-04): player 2 persists on first session not only on reconnect (DATA-01 gap)
- [Phase 01 P02]: RateLimiterMemory (in-process) chosen over Redis store for rate limiting — Redis limiter deferred to Phase 5 (D-06 explicit)
- [Phase 01 P02]: room.resolving uses try/finally to guarantee flag cleared even if doShot throws (D-09)
- [Phase ?]: doShot cells guard precedes opp/me resolution (01-03)
- [Phase ?]: sweepRooms exported via TEST_EXPORTS for synchronous unit testing (01-03)
- [Phase ?]: style-src unsafe-inline allowed; script-src self-only enforced for CSP (01-03)
- [Phase 04 P02 D-01]: ranked flag set by host at create time; stored as room.ranked boolean alongside mode
- [Phase 04 P02 D-02]: server reads socket.data.userId (session-set), never arg.userId — ranked eligibility guard is server-authoritative (T-04-04, RANK-02)
- [Phase 04 P02 D-05]: ranked+advance rejected with RANKED_REQUIRES_CLASSIC; client forces classic when ranked enabled
- [Phase 04 P03]: ranked=false is 6th positional default; existing 5-arg call sites remain backwards-compatible
- [Phase 04 P03]: matchTs captured before INSERT and reused in UPDATE snapshot WHERE clause — avoids race if clock changes between queries
- [Phase ?]: D-08: Provisional players (rd >= 110) excluded from leaderboard WHERE rd < 110; still rated normally (RANK-03)
- [Phase ?]: D-09: Leaderboard Redis cache TTL 300s; refreshed fire-and-forget post-COMMIT in recordMatch ranked branch; Postgres fallback on Redis unavailability (RANK-04)
- [Phase ?]: D-10: Leaderboard SELECT top 100 ORDER BY rating DESC; JOIN users for display_name/avatar_url; no email/credential columns (T-04-12)
- [Phase 04 P05 D-11]: Season soft-reset formula: new_rating = 1500 + (old_rating - 1500) * 0.5; rd reset to 350; volatility = 0.06; games_played = 0; all bound as $N (RANK-05)
- [Phase 04 P05 D-12]: Archive runs BEFORE blend — INSERT INTO rating_history SELECT FROM ratings precedes UPDATE ratings; history rows are INSERT-only and never deleted
- [Phase 04 P05 D-13]: Season reset is CLI-only (no express/socket/HTTP surface); runs on server box via npm run season-reset; grep-verified absence of HTTP in script
- [Phase ?]: Synchronous delete-before-await in tryPair prevents double-pairing race (T-5-05)
- [Phase ?]: matchFound sets setScreen('placement') unconditionally — no screen guard per D-10 (Pitfall 4)
- [Phase ?]: joinQueueLimiter: 5/60s per clientId using RateLimiterMemory (T-5-03, no new dependency)
- [Phase ?]: rankedWindow uses Infinity sentinel when width >= RANKED_WINDOW_CAP — thin pools always eventually pair
- [Phase ?]: getPlayerRating in joinQueue: try/catch falls back to 1500/350 on DB failure (graceful degradation T-5-09)

### Roadmap Evolution

- Phase 7 added: Points economy — remove ranking/leaderboard, add wagerable points for matches and power-up purchases
- Phase 8 added: Auth migration — replace Google/Facebook OAuth with WebAuthn Passkeys (biometric auth); keep email/password as fallback
- Phase 9 added: Lobby UI redesign — simplify home screen UX, card-based layout, progressive disclosure, mobile-first one-screen lobby
- Phase 11 added: Linked email for passkey accounts — allow passkey users to link email + set password from profile for cross-device login
- Phase 12 added: Merge Quick Play and Wagered Match — unified matchmaking button with conditional wager popup for logged-in users, free play for guests
- Phase 13 added: Match history — view past battles with results, points, and win/loss status

### Pending Todos

None yet.

### Blockers/Concerns

- Infra: Migrating off Render to a dedicated AWS EC2 box (app + self-hosted Redis + Postgres, owner-provisioned). Owner-managed backups/patching/TLS/security-groups/deploy. EC2 must be reachable before Phase 1 runs.
- Phase 4: Glicko-2 formula must be unit-tested against Lichess reference before connecting to ranked queue.
- Phase 6: Probability-density targeting algorithm for "hard" bot needs a brief research spike.

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-06-04:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 02 - 6 pending UAT scenarios | partial | Milestone close |
| uat_gap | Phase 03 - 5 pending UAT scenarios | partial | Milestone close |
| uat_gap | Phase 05 - 6 pending UAT scenarios | partial | Milestone close |
| verification | Phase 02 - human verification needed | human_needed | Milestone close |
| verification | Phase 03 - human verification needed | human_needed | Milestone close |
| verification | Phase 04 - human verification needed | human_needed | Milestone close |
| verification | Phase 05 - human verification needed | human_needed | Milestone close |
| verification | Phase 06 - human verification needed | human_needed | Milestone close |
| Social | Friends list, direct challenge, rematch history (SOCL-01/02/03) | v2 | Roadmap |
| Spectate | Live spectator mode (SPEC-01) | v2 | Roadmap |
| Retention | XP/levels, daily challenges (RETN-01/02) | v2 | Roadmap |
| Modes/Scale | Configurable modes, Redis adapter, tournaments (MODE-01, SCAL-01, TOUR-01) | v2 (tournaments = future) | Roadmap |
| Replays | Saved game replays / review past matches | Cut from vision | Scope refinement |

## Session Continuity

Last session: 2026-06-05T03:30:35.009Z
Stopped at: Phase 9 planned
Resume file: 
.planning/phases/09-lobby-ui-redesign-simplify-home-screen-ux-for-clarity-and-on/09-CONTEXT.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
