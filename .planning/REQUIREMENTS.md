# Requirements: Battleship Online

**Defined:** 2026-06-01
**Core Value:** Two players can find each other and play a fair, fast, satisfying game of Battleship — and have a reason to come back tomorrow.

## v1 Requirements

The competitive core: durable persistence, accounts, ranked play, and public matchmaking. Security-hardening items are prerequisites — they must land before the public matchmaking queue opens (see research PITFALLS.md / codebase CONCERNS.md).

### Persistence (DATA)

- [ ] **DATA-01**: Server connects to Render-managed Postgres via a single shared connection pool (`db.js`) with SSL
- [ ] **DATA-02**: Database schema is created and migrated automatically on server startup (prestart migration)

### Security Hardening (SEC)

- [ ] **SEC-01**: Server rate-limits `fire` and `useAbility` socket events per player
- [ ] **SEC-02**: `doShot()` guards against null/malformed opponent state without crashing the handler
- [ ] **SEC-03**: Abandoned rooms are cleaned from the in-memory room map (bounded memory)
- [ ] **SEC-04**: Server validates user-supplied profile and chat input server-side
- [ ] **SEC-05**: OAuth callback validates a random `state` parameter and regenerates the session after login

### Accounts & Identity (AUTH)

- [ ] **AUTH-01**: A new visitor can play instantly as a guest with no login (clientId preserved)
- [ ] **AUTH-02**: A user can sign in with Google OAuth to create a persistent account
- [ ] **AUTH-03**: On first sign-in, a guest's existing game history is atomically linked to the new account
- [ ] **AUTH-04**: An authenticated session persists across visits and can be revoked server-side

### Profile & Stats (PROF)

- [ ] **PROF-01**: A signed-in player can view their profile with win/loss record and lifetime stats
- [ ] **PROF-02**: A player can view another player's public profile

### Match Recording (MATCH)

- [ ] **MATCH-01**: Every completed game writes a match record (players, winner, reason) in a single transaction
- [ ] **MATCH-02**: Each game's moves are captured to an append-only replay event log (storage only; no viewer in v1)
- [ ] **MATCH-03**: A disconnect that exceeds the grace window is recorded as an explicit forfeit loss

### Ranked & Leaderboard (RANK)

- [ ] **RANK-01**: A player's Glicko-2 rating (rating, deviation, volatility) updates in the same transaction as the match record
- [ ] **RANK-02**: Ranked mode requires a signed-in account (no guest ranked play)
- [ ] **RANK-03**: A new ranked player completes placement matches before appearing on the leaderboard
- [ ] **RANK-04**: A global leaderboard shows the top 100 players from a cache refreshed at least every 5 minutes
- [ ] **RANK-05**: Ranked ratings can be soft-reset for a new season after archiving prior history

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

### Spectate & Replay Viewer

- **SPEC-01**: Live spectator mode with a mandatory delay and hidden ship positions
- **SPEC-02**: Replay viewer UI that reconstructs a game from the replay event log
- **SPEC-03**: Replay retention / cleanup policy

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
| Email + password auth | Google OAuth chosen to avoid owning password storage/reset/security |
| Real-money payments / pay-to-win | Not core to gameplay value; pay-to-win kills competitive integrity |
| Real-time (sub-second) global leaderboard | 5-minute refresh is indistinguishable to players, far cheaper |
| Native mobile apps | Web-first; PWA sufficient |
| Voice chat | Text/emoji chat covers the social need; high complexity, low payoff |
| Spectators seeing both boards without delay | Enables external relay of ship positions — cheating vector |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (filled by roadmapper) | — | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 after initial definition*
