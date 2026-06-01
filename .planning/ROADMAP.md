# Roadmap: Battleship Online

## Overview

This milestone evolves Battleship Online from an invite-only game into a competitive, social platform. The build order is strictly dependency-driven: Postgres persistence is the root that unlocks everything else. Security hardening co-locates with foundation because those concerns become critical attack vectors the moment a public matchmaking queue opens. Accounts and identity layer on top of persistence; match recording must precede ranked ratings; ranked ratings must precede ELO-weighted matchmaking. Bot difficulty tiers are account-independent and close out the milestone.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Postgres persistence layer + security hardening prerequisites
- [ ] **Phase 2: Accounts & Identity** - Google OAuth, guest-to-account linking, player profiles
- [ ] **Phase 3: Match Recording** - Durable match records + explicit forfeit handling
- [ ] **Phase 4: Ranked Mode & Leaderboard** - Glicko-2 ratings, ranked queue gating, global leaderboard
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
  5. Abandoned rooms are evicted from the in-memory room map; the room count no longer grows unboundedly under load. User-supplied profile fields and chat inputs are validated server-side and rejected if malformed.**Plans**: 3 plans

**Wave 1**

- [ ] 01-01-PLAN.md — Persistence slice: pg.Pool (db.js), auto-migrated identity schema, guest-credential upsert, test harness (DATA-01, DATA-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Rate-limiting + turn-clock race guard on fire/useAbility/chat (SEC-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — doShot null guard, abandoned-room cleanup sweep, profile/chat sanitization + CSP (SEC-02, SEC-03, SEC-04)

### Phase 2: Accounts & Identity

**Goal**: Players can optionally create a persistent account via Google OAuth, and their guest history carries over seamlessly. Every player has a viewable profile.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SEC-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, PROF-01, PROF-02
**Success Criteria** (what must be TRUE):

  1. A visitor can open the game and start playing immediately with no sign-in prompt — guest identity (clientId) works exactly as before.
  2. A player can click "Sign in with Google," complete the OAuth flow, and land back in the game with a persistent account active.
  3. When a guest signs in for the first time, their pre-login game history is linked to the new account atomically — no history is lost and no duplicate account is created.
  4. A signed-in player stays logged in across browser sessions and can revoke access server-side (sign out from all devices).
  5. A signed-in player can view their own profile showing win/loss record and lifetime stats; any player can view another player's public profile.

**Plans**: TBD
**UI hint**: yes

### Phase 3: Match Recording

**Goal**: Every completed game produces a durable match record, giving the system a reliable source of truth for ratings.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MATCH-01, MATCH-03
**Success Criteria** (what must be TRUE):

  1. When a game ends normally (win/loss), a match record (players, winner, reason, timestamps) is written to Postgres in a single transaction — verifiable by querying the `matches` table.
  2. When a player disconnects and the 3-minute grace window expires without reconnect, the match is recorded as an explicit forfeit loss (not abandoned/null) — the losing player's record reflects the loss.

**Plans**: TBD

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

**Plans**: TBD
**Research flag**: Validate Glicko-2 formula against Lichess reference implementation. Unit-test `elo.js` with known inputs (starting rating 1500, RD 350, volatility 0.06) before connecting to the ranked queue.

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
| 1. Foundation | 0/3 | Not started | - |
| 2. Accounts & Identity | 0/TBD | Not started | - |
| 3. Match Recording | 0/TBD | Not started | - |
| 4. Ranked Mode & Leaderboard | 0/TBD | Not started | - |
| 5. Public Matchmaking | 0/TBD | Not started | - |
| 6. Bot Difficulty Tiers | 0/TBD | Not started | - |
