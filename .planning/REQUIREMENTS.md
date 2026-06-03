# Requirements: Battleship Online

**Defined:** 2026-06-01
**Core Value:** Two players can find each other and play a fair, fast, satisfying game of Battleship — and have a reason to come back tomorrow.

## v1 Requirements

The competitive core: durable persistence, accounts, ranked play, and public matchmaking. Security-hardening items are prerequisites — they must land before the public matchmaking queue opens (see research PITFALLS.md / codebase CONCERNS.md).

### Persistence (DATA)

- [x] **DATA-01**: Server connects to the self-hosted Postgres (on the EC2 box) via a single shared connection pool (`db.js`), with connection params from env vars
- [x] **DATA-02**: Database schema is created and migrated automatically on server startup (prestart migration)

### Security Hardening (SEC)

- [x] **SEC-01**: Server rate-limits `fire` and `useAbility` socket events per player
- [x] **SEC-02**: `doShot()` guards against null/malformed opponent state without crashing the handler
- [x] **SEC-03**: Abandoned rooms are cleaned from the in-memory room map (bounded memory)
- [x] **SEC-04**: Server validates user-supplied profile and chat input server-side
- [ ] **SEC-05**: OAuth callback validates a random `state` parameter and regenerates the session after login

### Accounts & Identity (AUTH)

- [ ] **AUTH-01**: A new visitor can play instantly as a guest with no login (clientId preserved)
- [ ] **AUTH-02**: A user can sign in with Google OAuth to create a persistent account
- [ ] **AUTH-03**: On first sign-in, a guest's existing game history is atomically linked to the new account
- [ ] **AUTH-04**: An authenticated session persists across visits and can be revoked server-side
- [ ] **AUTH-05**: A user can sign in with Facebook OAuth to create a persistent account (provider-generic identity; email optional)
- [ ] **AUTH-06**: A user can sign up and sign in with email + password (bcrypt-hashed, min 8 chars, rate-limited login)
- [ ] **AUTH-07**: Email-account signup sends an async verification email that does not block play (`email_verified` flips on link click)
- [ ] **AUTH-08**: A user can reset a forgotten password via a single-use, time-limited emailed token

### Profile & Stats (PROF)

- [ ] **PROF-01**: A signed-in player can view their profile with win/loss record and lifetime stats
- [ ] **PROF-02**: A player can view another player's public profile

### Match Recording (MATCH)

- [x] **MATCH-01**: Every completed game writes a match record (players, winner, reason) in a single transaction
- [x] **MATCH-03**: A disconnect that exceeds the grace window is recorded as an explicit forfeit loss

### Ranked & Leaderboard (RANK)

- [x] **RANK-01**: A player's Glicko-2 rating (rating, deviation, volatility) updates in the same transaction as the match record
- [ ] **RANK-02**: Ranked mode requires a signed-in account (no guest ranked play)
- [x] **RANK-03**: A new ranked player completes placement matches before appearing on the leaderboard
- [ ] **RANK-04**: A global leaderboard shows the top 100 players from a cache refreshed at least every 5 minutes
- [x] **RANK-05**: Ranked ratings can be soft-reset for a new season after archiving prior history

### Matchmaking (QUEUE)

- [ ] **QUEUE-01**: A player can join a public quick-match queue and be paired with another online player without a room code
- [ ] **QUEUE-02**: Ranked matchmaking pairs players within an ELO window that widens the longer they wait
- [ ] **QUEUE-03**: A player's queue entry is removed when they disconnect or leave the queue

### Bot (BOT)

- [ ] **BOT-01**: A single-player can choose a bot difficulty tier (easy / medium / hard / insane), each a distinct targeting algorithm

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Social

- **SOCL-01**: Friends list with online presence
- **SOCL-02**: Direct challenge / private invite to a friend
- **SOCL-03**: Rematch history between two players

### Spectate

- **SPEC-01**: Live spectator mode with a mandatory delay and hidden ship positions (rides live Socket.IO state; no persisted replay log required)

### Retention

- **RETN-01**: XP / level progression (cosmetic only)
- **RETN-02**: Daily challenges / quests

### Modes & Scale

- **MODE-01**: Configurable game modes (grid size, fleet, time controls, power-ups) with separate rating pools
- **SCAL-01**: Horizontal scaling via Socket.IO Redis adapter + websocket-only transport
- **TOUR-01**: Tournament brackets (requires ~20+ concurrent players to be worthwhile)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-money payments / pay-to-win | Not core to gameplay value; pay-to-win kills competitive integrity |
| Real-time (sub-second) global leaderboard | 5-minute refresh is indistinguishable to players, far cheaper |
| Native mobile apps | Web-first; PWA sufficient |
| Voice chat | Text/emoji chat covers the social need; high complexity, low payoff |
| Spectators seeing both boards without delay | Enables external relay of ship positions — cheating vector |
| Saved game replays (save / review past matches) | Cut from product vision — no per-move persistence; live spectate covers the "watch" need |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 — Foundation | Complete |
| DATA-02 | Phase 1 — Foundation | Complete |
| SEC-01 | Phase 1 — Foundation | Complete |
| SEC-02 | Phase 1 — Foundation | Complete |
| SEC-03 | Phase 1 — Foundation | Complete |
| SEC-04 | Phase 1 — Foundation | Complete |
| SEC-05 | Phase 2 — Accounts & Identity | Pending |
| AUTH-01 | Phase 2 — Accounts & Identity | Pending |
| AUTH-02 | Phase 2 — Accounts & Identity | Pending |
| AUTH-03 | Phase 2 — Accounts & Identity | Pending |
| AUTH-04 | Phase 2 — Accounts & Identity | Pending |
| AUTH-05 | Phase 2 — Accounts & Identity | Pending |
| AUTH-06 | Phase 2 — Accounts & Identity | Pending |
| AUTH-07 | Phase 2 — Accounts & Identity | Pending |
| AUTH-08 | Phase 2 — Accounts & Identity | Pending |
| PROF-01 | Phase 2 — Accounts & Identity | Pending |
| PROF-02 | Phase 2 — Accounts & Identity | Pending |
| MATCH-01 | Phase 3 — Match Recording | Complete |
| MATCH-03 | Phase 3 — Match Recording | Complete |
| RANK-01 | Phase 4 — Ranked Mode & Leaderboard | Complete |
| RANK-02 | Phase 4 — Ranked Mode & Leaderboard | Pending |
| RANK-03 | Phase 4 — Ranked Mode & Leaderboard | Complete |
| RANK-04 | Phase 4 — Ranked Mode & Leaderboard | Pending |
| RANK-05 | Phase 4 — Ranked Mode & Leaderboard | Complete |
| QUEUE-01 | Phase 5 — Public Matchmaking | Pending |
| QUEUE-02 | Phase 5 — Public Matchmaking | Pending |
| QUEUE-03 | Phase 5 — Public Matchmaking | Pending |
| BOT-01 | Phase 6 — Bot Difficulty Tiers | Pending |

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-02 — Phase 2 auth scope expanded to 3 methods (added AUTH-05 Facebook, AUTH-06 email/password, AUTH-07 verification, AUTH-08 reset; retired the email+password out-of-scope row)*
