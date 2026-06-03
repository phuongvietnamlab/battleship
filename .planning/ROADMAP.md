# Roadmap: Battleship Online

## Overview

This milestone evolves Battleship Online from an invite-only game into a competitive, social platform. The build order is strictly dependency-driven: Postgres persistence is the root that unlocks everything else. Security hardening co-locates with foundation because those concerns become critical attack vectors the moment a public matchmaking queue opens. Accounts and identity layer on top of persistence; match recording must precede ranked ratings; ranked ratings must precede ELO-weighted matchmaking. Bot difficulty tiers are account-independent and close out the milestone.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Postgres persistence layer + security hardening prerequisites (completed 2026-06-01)
- [x] **Phase 2: Accounts & Identity** - Google + Facebook OAuth + email/password sign-in, guest-to-account linking, player profiles (completed 2026-06-02)
- [x] **Phase 3: Match Recording** - Durable match records + explicit forfeit handling (completed 2026-06-03)
- [ ] **Phase 4: Ranked Mode & Leaderboard** - Glicko-2 ratings, ranked queue gating, global leaderboard (5/5 plans built; verification gaps_found — 2 gap-closure plans (04-06, 04-07) planned to close CR-01 blocker + CR-02 hardening)
- [ ] **Phase 5: Public Matchmaking** - Quick-match and ranked queues, ELO-window pairing
- [ ] **Phase 6: Bot Difficulty Tiers** - Easy / medium / hard / insane bot algorithms

## Phase Details

### Phase 1: Foundation

**Goal**: The server durably stores data in self-hosted Postgres (on the dedicated EC2 box) and is hardened against the attack vectors that become critical under public play.
**Mode:** mvp
**Depends on**: Nothing (first phase). External: owner provisions the EC2 instance with Postgres + Redis installed and reachable before this phase runs.
**Requirements**: DATA-01, DATA-02, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):

  1. The server connects to the self-hosted Postgres via a shared pool (params from env vars) and all queries succeed without crashing under normal play.
  2. Database schema is created (or migrated) automatically when the server starts — no manual SQL steps required on deploy.
  3. `fire` and `useAbility` socket events are rate-limited per player; an attacker sending rapid-fire events receives errors, not a crash.
  4. A `doShot()` call with a null or malformed opponent state returns an error response instead of throwing an unhandled exception.
  5. Abandoned rooms are evicted from the in-memory room map; the room count no longer grows unboundedly under load. User-supplied profile fields and chat inputs are validated server-side and rejected if malformed.

**Plans**: 3 plans

**Wave 1**

- [x] 01-01-PLAN.md — Persistence slice: pg.Pool (db.js), auto-migrated identity schema, guest-credential upsert, test harness (DATA-01, DATA-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Rate-limiting + turn-clock race guard on fire/useAbility/chat (SEC-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — doShot null guard, abandoned-room cleanup sweep, profile/chat sanitization + CSP (SEC-02, SEC-03, SEC-04)

### Phase 2: Accounts & Identity

**Goal**: Players can optionally create a persistent account via Google OAuth, Facebook OAuth, or email/password, and their guest history carries over seamlessly. Every player has a viewable profile.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SEC-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, PROF-01, PROF-02
**Success Criteria** (what must be TRUE):

  1. A visitor can open the game and start playing immediately with no sign-in prompt — guest identity (clientId) works exactly as before.
  2. A player can click "Sign in with Google," complete the OAuth flow, and land back in the game with a persistent account active.
  3. A player can click "Sign in with Facebook," complete the OAuth flow, and land back signed in — even if Facebook withholds an email (dedup by provider id, not email).
  4. A player can sign up and sign in with email + password (bcrypt-hashed); signup sends an async verification email that does NOT block play, and a forgotten password can be reset via a single-use, time-limited emailed token.
  5. When a guest signs in for the first time via ANY method, their pre-login game history is linked to the new account atomically — no history is lost and no duplicate account is created.
  6. A signed-in player stays logged in across browser sessions and can revoke access server-side (sign out from all devices).
  7. A signed-in player can view their own profile showing win/loss record and lifetime stats; any player can view another player's public profile.

**Plans**: 9 plans (Google: 02-01..04; Facebook: 02-05; email/password + verification/reset: 02-06..09)
**UI hint**: yes

**Wave 1**

- [x] 02-01-PLAN.md — Foundation: auth-package legitimacy gate + install, 002_accounts.sql (profile cols + session table), linkOrPromoteAccount/sanitizeDisplayName, Wave 0 test stubs (AUTH-03, SEC-05)

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — OAuth sign-in slice: session+Passport middleware, /auth/google(+callback), /api/me, io.engine.use session-share, sign-in button + auth hydration (AUTH-02, SEC-05, AUTH-01, AUTH-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 02-03-PLAN.md — Sessions + revocation slice: /auth/signout + /auth/signout-all, avatar chip + dropdown menu with sign-out-all confirmation (AUTH-04)

**Wave 4** *(blocked on Wave 3)*

- [x] 02-04-PLAN.md — Profile view slice: GET /api/profile/:id zero-state + ProfileView screen (own + other player) (PROF-01, PROF-02)

**Wave 5** *(blocked on Wave 2 — reuses the Passport/session stack; mirrors Google)*

- [x] 02-05-PLAN.md — Facebook OAuth slice: passport-facebook strategy + /auth/facebook(+callback), provider-generic linkOrPromoteAccount, FB sign-in button (AUTH-05, SEC-05)

**Wave 6** *(blocked on Wave 5 — shares package.json/db.js)*

- [x] 02-06-PLAN.md — Email-account foundation: bcryptjs gate, NEW migration 003_email_accounts.sql (email/email_verified/password_hash + auth_tokens), createEmailAccount/verifyEmailLogin/token helpers (AUTH-06)

**Wave 7** *(blocked on Wave 6)*

- [x] 02-07-PLAN.md — Email signup/login slice: rate-limited POST /auth/signup + /auth/login (manual session.regenerate + stamp), collapsible "or continue with email" form (AUTH-06)

**Wave 8** *(blocked on Wave 7)*

- [x] 02-08-PLAN.md — Email verification slice: resend gate + graceful-degrade mailer.js, async non-blocking verification email, GET /auth/verify (AUTH-07)

**Wave 9** *(blocked on Wave 8)*

- [x] 02-09-PLAN.md — Password reset slice: enumeration-safe POST /auth/reset-request + /auth/reset (single-use token -> new bcrypt hash), reset UI (AUTH-08)

### Phase 3: Match Recording

**Goal**: Every completed game produces a durable match record, giving the system a reliable source of truth for ratings.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MATCH-01, MATCH-03
**Success Criteria** (what must be TRUE):

  1. When a game ends normally (win/loss), a match record (players, winner, reason, timestamps) is written to Postgres in a single transaction — verifiable by querying the `matches` table.
  2. When a player disconnects and the 3-minute grace window expires without reconnect, the match is recorded as an explicit forfeit loss (not abandoned/null) — the losing player's record reflects the loss.

**Plans**: 3 plans

**Wave 1**

- [x] 03-01-PLAN.md — Schema + Nyquist test scaffold: migrations/004_matches.sql (matches table, reason CHECK, dedup UNIQUE, IDX_ indexes) + test/match.test.js (MATCH-01, MATCH-03)

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — recordMatch helper in db.js: single-transaction parameterized match write, graceful no-op without DB, server-side reason validation, never throws (MATCH-01, D-07)

**Wave 3** *(blocked on Wave 2)*

- [x] 03-03-PLAN.md — Wire recordMatch into the four game-end paths (doShot win, endGameForfeit, scheduleSeatRelease grace expiry, leaveRoom inline) + room.startedAt + seat userId + room.recorded dedup; disconnect forfeit (MATCH-01, MATCH-03)

### Phase 4: Ranked Mode & Leaderboard

**Goal**: Signed-in players can earn a Glicko-2 rating through ranked matches, and the top 100 players are publicly visible on a leaderboard.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: RANK-01, RANK-02, RANK-03, RANK-04, RANK-05
**Success Criteria** (what must be TRUE):

  1. After a ranked match completes, the winner's and loser's Glicko-2 rating, deviation, and volatility are updated atomically in the same DB transaction as the match record.
  2. A guest who attempts to join the ranked queue is shown an error; only signed-in accounts can play ranked.
  3. A newly ranked player's rating does not appear on the public leaderboard until they complete the required placement matches.
  4. The global leaderboard endpoint returns the top 100 players within 5 minutes of any rating change — the cache refreshes automatically at least every 5 minutes.
  5. An admin can trigger a seasonal rated reset: prior ratings are archived to history, and active ratings are soft-reset toward the default — without deleting historical records.

**Plans**: 7 plans (5 built + 2 gap-closure)
**Research flag**: Validate Glicko-2 formula against Lichess reference implementation. Unit-test `elo.js` with known inputs (starting rating 1500, RD 350, volatility 0.06) before connecting to the ranked queue.

**Wave 1**

- [x] 04-01-PLAN.md — Math + schema foundation: pure `elo.js` Glicko-2 (validated vs Glickman vector) + migrations/005_rankings.sql (ratings/seasons/rating_history + matches ALTER) + Wave-0 test scaffold (RANK-01, RANK-03, RANK-05)

**Wave 2** *(blocked on Wave 1)*

- [x] 04-02-PLAN.md — Ranked-flag slice: `room.ranked` + server-authoritative guest block (RANKED_REQUIRES_ACCOUNT) + ranked+advance reject (RANKED_REQUIRES_CLASSIC) + lobby ranked toggle (EN/VI) (RANK-02)

**Wave 3** *(blocked on Waves 1-2)*

- [x] 04-03-PLAN.md — Same-transaction rating write: recordMatch 6th `ranked` param + in-transaction Glicko-2 update + matches snapshot, wired at all four call sites (RANK-01)

**Wave 4** *(blocked on Waves 1, 3)*

- [x] 04-04-PLAN.md — Leaderboard slice: store.js cache helpers + db.js getLeaderboard/refreshLeaderboardCache (rd<110 top-100) + GET /api/leaderboard + leaderboard UI (EN/VI) (RANK-03, RANK-04)

**Wave 5** *(blocked on Waves 1, 4)*

- [x] 04-05-PLAN.md — Season-reset CLI: scripts/season-reset.js archive-then-soft-reset (single txn, UNIQUE-label idempotency, CLI-only) + npm script (RANK-05)

**Wave 6** *(gap closure — verification gaps_found)*

- [x] 04-06-PLAN.md — CR-01 blocker fix: persist+restore room.ranked/recorded + seat userId through the Redis snapshot path (serializeRooms/restoreRooms) with a no-DB round-trip test, + flip RANK-02 traceability to Complete (RANK-01, RANK-02)

**Wave 7** *(gap closure — blocked on Wave 6, shared server.js)*

- [ ] 04-07-PLAN.md — CR-02 hardening: per-IP rate limit (429 RATE_LIMITED) + short-TTL in-process cache on GET /api/leaderboard so RAM-only mode amortizes reads (RANK-04)

### Phase 5: Public Matchmaking

**Goal**: Players can find opponents automatically — no room code required — with casual and ranked queues handling pairing.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: QUEUE-01, QUEUE-02, QUEUE-03
**Success Criteria** (what must be TRUE):

  1. A player can click "Quick Match" and be paired with another online player and dropped into a game without entering a room code.
  2. In the ranked queue, two players within a starting ELO window are paired; if no close match is found, the window widens automatically the longer they wait.
  3. When a queued player disconnects or navigates away, their queue entry is removed immediately — they do not block a pairing slot or appear as a phantom opponent.

**Plans**: TBD

### Phase 6: Bot Difficulty Tiers

**Goal**: A single-player can choose a bot opponent at one of four distinct difficulty levels, each with a meaningfully different targeting strategy.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: BOT-01
**Success Criteria** (what must be TRUE):

  1. The bot difficulty selector shows four options (easy / medium / hard / insane) before a single-player game starts.
  2. Each difficulty tier uses a distinct targeting algorithm — easy fires at random cells; medium hunts after a hit; hard uses probability-density targeting; insane plays near-optimally — producing observably different win rates.
  3. An existing single-player game started before this phase behaves identically to before (no regression in the current bot behavior).

**Plans**: TBD
**Research flag**: Brief spike recommended on probability-density targeting algorithm for "hard" tier before implementation.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete    | 2026-06-01 |
| 2. Accounts & Identity | 9/9 | Complete   | 2026-06-02 |
| 3. Match Recording | 3/3 | Complete    | 2026-06-03 |
| 4. Ranked Mode & Leaderboard | 6/7 | In Progress|  |
| 5. Public Matchmaking | 0/TBD | Not started | - |
| 6. Bot Difficulty Tiers | 0/TBD | Not started | - |
