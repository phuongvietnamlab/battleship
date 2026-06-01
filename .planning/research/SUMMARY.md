# Project Research Summary

**Project:** Battleship Online — persistence, auth, matchmaking, ranking, replays milestone
**Domain:** Competitive real-time multiplayer browser game (brownfield Node/Express/Socket.IO/React)
**Researched:** 2026-06-01
**Confidence:** HIGH

> **INFRA UPDATE (post-research, 2026-06-01):** Hosting moved from Render to a dedicated AWS EC2 box running app + self-hosted Redis + self-hosted Postgres (owner-provisioned). Render-specific guidance below is **superseded**: ignore the "Render free tier deletes at 30 days / use paid Starter" note and the managed-DB `ssl: { rejectUnauthorized: false }` advice — app connects to Postgres/Redis over localhost/private address with env-var params. Single-box scaling limits still apply; Redis is now always available. See PROJECT.md Constraints + Key Decisions for canonical truth.

## Executive Summary

This milestone evolves a working invite-only Battleship game into a competitive, social, replayable online platform. The research consensus is clear: every feature in scope depends on a single root capability — Postgres persistence. Nothing else (accounts, ranked play, matchmaking, social graph, replays) can be built until the database layer exists. The recommended approach is strictly additive: extend the existing Node/Express/Socket.IO/React stack with `pg` + `drizzle-orm` for persistence, `passport-google-oauth2` + `express-session` for accounts, an in-memory matchmaking queue, and an append-only event log for replays. No rewrites, no new runtimes, no external services beyond Render-managed Postgres.

The key risks are all pre-existing problems from `CONCERNS.md` that become critical at public scale. Rate limiting on `fire`/`useAbility` (CONCERNS.md #2), null guards in `doShot` (#6), and room-map memory cleanup (#8) are currently tolerable in invite-only play but become active attack vectors the moment a public matchmaking queue opens. These must be fixed before any public matchmaking ships — they are not future work, they are prerequisites. The second major risk is Render's free Postgres tier auto-deleting at 30 days with no recovery; use the Starter paid tier ($7/mo) from day one for any user-facing data.

The recommended build order — Persistence → Auth → Match Recording → Ranked/ELO → Matchmaking → Social → Spectate/Replay — is driven by hard dependencies, not preference. Each layer is a prerequisite for the next. Attempting to build ranked play before auth, or matchmaking before ELO, produces throwaway code.

---

## Divergence Reconciliation

Three decisions split across research agents. Recommendations follow.

### 1. Rating System: ELO (`elo-rank`) vs. Glicko-2

**Stack/Architecture** recommend `elo-rank` (simple, no dependencies, K-factor configurable).
**Features** argues for Glicko-2 (Lichess-grade, handles provisional ratings and rating deviation, better for small player pools).

**Recommendation: Glicko-2, implemented by hand.**

Rationale: With a small initial player pool (100–1,000 active players), Glicko-2's rating deviation (RD) band genuinely matters — it prevents a new player's first 5 games from falsely placing them at the same confidence level as a veteran. The `elo-rank` library covers the math correctly but has no RD concept; you'd have to bolt on a provisional period hack. Glicko-2's formulas are 40 lines of arithmetic — simpler than it sounds, and Lichess publishes the reference implementation. Put the calculation in `elo.js` as a pure function. **Tradeoff:** Glicko-2 requires storing `rating`, `rd` (deviation), and `volatility` per player and updating all three per game. The schema needs three columns where ELO needs one; the UI needs to explain the confidence band to players (show as "1350 ±120" or suppress RD below a threshold).

### 2. Session/Auth: `express-session` + `connect-pg-simple` + Passport vs. stateless JWT cookie

**Stack** recommends `express-session` + `connect-pg-simple` for authenticated sessions, with JWT only for guest identity.
**Architecture** prefers a stateless JWT cookie for single-process Render to avoid the session-table read on every request.

**Recommendation: `express-session` + `connect-pg-simple` for OAuth sessions; JWT for guest identity only (as Stack describes).**

Rationale: Server-side sessions allow instant revocation (delete the row) — critical when a user reports account compromise or when you need to invalidate ranked sessions after detecting abuse. On a single Render process with a pool of 10 connections, the session-table SELECT is negligible (one indexed lookup by session ID). Stateless JWTs for authenticated users introduce an irrevocable-token problem that requires a blocklist anyway, collapsing the stateless benefit. The hybrid model — JWT for the frictionless guest path, session for authenticated accounts — is the right split. **Tradeoff:** The session table adds one DB read per authenticated HTTP request. At Render single-process scale this is invisible; revisit only if moving to multi-instance.

### 3. Replay Storage: JSONB blob column vs. event-log table

**Stack** proposes a single `events JSONB` column per replay row.
**Pitfalls** warns that appending to a JSONB blob causes Postgres TOAST duplication on every update, leading to multi-GB bloat past ~500 games.

**Recommendation: Event-log table (`replay_events` with `game_id, seq, event_type, payload JSONB`). No JSONB blob column.**

Rationale: This is not a close call. The TOAST bloat pitfall is well-documented and the fix is architectural — you cannot vacuum your way out of it. The event-log table is also strictly better for queries (seek to any point by `seq`), cheaper to write (one small INSERT per event vs. read-modify-write on a blob), and enables a retention policy (delete rows older than N days without rewriting the table). Architecture research already defines the correct schema (`replay_events` table with `match_id`, `seq`, `event_type`, `actor`, `payload`, `ts`). Use it. **Tradeoff:** Replaying a full game requires a `SELECT ... ORDER BY seq` query rather than deserializing one column — this is a feature, not a cost.

---

## Key Findings

### Recommended Stack

The existing stack (Node.js/Express/Socket.IO/React/esbuild/Render) is preserved entirely. All additions are strictly new files and new npm packages.

**Core new technologies:**

- `pg` 8.21.0 + `drizzle-orm` 0.45.2 — Postgres client and query builder; single shared `pg.Pool` exported from `db.js`; Drizzle generates readable SQL migrations run as a `prestart` script on Render
- `drizzle-kit` 0.31.10 — migration CLI; run `npx drizzle-kit generate` on schema changes, commit migrations, apply on startup
- `passport` 0.7.0 + `passport-google-oauth2` 0.2.0 — Google OAuth flow; `passReqToCallback: true` to read guest `clientId` from request during linking
- `express-session` 1.19.0 + `connect-pg-simple` 10.0.0 — server-side sessions backed by Postgres; no MemoryStore in production
- `jsonwebtoken` 9.0.3 — guest identity tokens only (not for authenticated sessions)
- `helmet` 8.2.0 + `express-rate-limit` 8.5.2 — security headers and per-route rate limiting; `rate-limiter-flexible` for Socket.IO event-level limits
- `joi` 18.2.1 — server-side input validation for profile fields, chat payloads, API bodies

**Critical constraint:** Render free Postgres auto-deletes at 30 days. Use Starter paid tier ($7/mo) from day one. Set `ssl: { rejectUnauthorized: false }` in `pg.Pool` config.

### Expected Features

**Must have (table stakes) — v1:**
- Postgres persistence layer + schema migrations
- Google OAuth account creation + guest-to-account linking (guest play fully preserved)
- Player profile with win/loss record
- Public quick-match queue (FIFO first, ELO-weighted once ratings exist)
- Glicko-2 ranked mode (separate queue from casual)
- Global leaderboard (top 100, refreshed every 5 min via materialized cache — never a live `RANK()` window scan)
- Bot difficulty tiers (easy/medium/hard/insane as distinct algorithms)

**Should have (competitive advantage) — v1.x after retention validation:**
- XP / level progression (cosmetic only)
- Daily challenges / quests
- Seasonal ranked reset (soft reset toward 1200; archive history first)
- Saved game replays (event-log table; client-side reconstruction)
- Friends list + online presence (Redis TTL keys)
- Direct challenge / private invite

**Defer to v2+:**
- Live spectator mode
- Tournament brackets (requires 20+ concurrent players; atomic bracket generation)
- Configurable game modes (non-standard modes must use separate ELO pools)

**Anti-features to avoid permanently:**
- Pay-to-win ranked advantages
- Email + password auth
- Real-time global leaderboard (5-minute refresh is sufficient)
- Spectators seeing both boards without delay (5–10s mandatory delay required)

### Architecture Approach

The architecture preserves the in-memory `rooms` map as the authoritative runtime game state and introduces Postgres strictly as the record of outcomes. New subsystems (`db.js`, `auth.js`, `matchmaking.js`, `elo.js`) are separate files that export functions called by `server.js`. The single injection point for all persistence is `onGameEnd(room, winnerId, loserId, reason)`, called async after `gameOver` is emitted to clients. No DB writes on the hot shot path.

**Major components:**

1. `db.js` — single `pg.Pool` export; all named async query functions; singleton prevents connection leaks
2. `auth.js` — Passport + Google strategy; JWT guest helpers; `requireAuth`/`optionalAuth` middleware; `io.use(authMiddleware)` for Socket.IO handshake
3. `matchmaking.js` — in-memory `Map` queue; periodic `tick()` every 1500ms; ELO window widens 50 per 10s of wait; isolated module (backing store can swap to Redis for multi-process)
4. `elo.js` — pure Glicko-2 calculation; no I/O; easy to unit test
5. `onGameEnd` hook in `server.js` — sole persistence injection point; batch-inserts replay events; updates ratings atomically in a DB transaction; non-blocking
6. REST layer — `/auth/google`, `/api/profile`, `/api/leaderboard`; leaderboard reads from `leaderboard_cache` materialized table

**Schema highlights:**
- `accounts` — one row per OAuth user; `google_id` as stable unique key (not email)
- `guest_links` — maps `localStorage` clientId → `account_id`
- `ratings` — `(account_id, mode)` composite key; stores Glicko-2 `rating`, `rd`, `volatility`
- `matches` — one row per completed game; ELO before/after columns
- `replay_events` — append-only `(match_id, seq, event_type, actor, payload, ts)`; indexed on `(match_id, seq)`
- `friends` — directed graph; pair stored as two rows

### Critical Pitfalls

1. **CONCERNS.md items escalate under public play** — Rate limiting (#2), null guards in `doShot` (#6), and room-map cleanup (#8) must be fixed in Foundation phase before public matchmaking opens.

2. **Guest identity fragmentation after OAuth linking** — Single canonical identity with multiple credentials; link must be one atomic DB transaction; pass `clientId` in OAuth `state` parameter; deduplicate by `google_sub` not email.

3. **Glicko-2 on disconnects and forfeits** — Rating write must be in same DB transaction as `matches` INSERT; treat grace-expired disconnect as forfeit loss; define explicit game states (`active`, `completed`, `forfeited`, `abandoned`).

4. **Render Postgres pool exhaustion** — Single shared `pg.Pool` from `db.js`; `max: 10`; SSL required; paid tier only.

5. **OAuth callback CSRF + session fixation** — Random `state` per login; validate on callback; call `req.session.regenerate()` post-login.

6. **Replay TOAST bloat** — No JSONB blob column; event-log table only; index on `(match_id, seq)`.

7. **Leaderboard full-table scan** — `leaderboard_cache` materialized table refreshed every 5 minutes; individual rank queries use indexed `COUNT(*) WHERE rating > $1`.

---

## Implications for Roadmap

### Phase 1: Foundation — Persistence, Security Hardening, and Identity

**Rationale:** Postgres is the root dependency for every other feature. CONCERNS.md items #2, #6, and #8 must be resolved before public-facing features land — fixing them here prevents retrofitting under time pressure later.

**Delivers:** Render-managed Postgres connected; single `db.js` pool; schema migrations on startup; `doShot` null guards; rate limiting on `fire`/`useAbility`; room-map cleanup; Google OAuth accounts with guest linking; player profiles.

**Features addressed:** Postgres persistence, Google OAuth account creation, guest-to-account linking, player profile with win/loss record.

**Pitfalls to avoid:** Pool exhaustion (single `db.js` singleton), guest identity fragmentation (atomic link transaction + `state` param), OAuth CSRF (random state + session regeneration), Render free-tier deletion (use paid Starter).

**Research flag:** Standard patterns — skip research-phase.

---

### Phase 2: Match Recording and Replay Capture

**Rationale:** Match history must exist before ELO makes historical sense. Replay capture adds zero hot-path cost; doing it now avoids a schema migration later.

**Delivers:** `onGameEnd` hook; `matches` table populated on every completed game; `replay_events` event-log table receiving append-only events per game; `replayBuffer` in-memory during play, flushed async on game end.

**Features addressed:** Win/loss record, saved game replays foundation.

**Pitfalls to avoid:** Hot-path DB writes (batch flush on game-end only); TOAST bloat (event-log table, not JSONB blob).

**Research flag:** Standard patterns — skip research-phase.

---

### Phase 3: Ranked Mode and Leaderboard

**Rationale:** Requires accounts (Phase 1) and match history (Phase 2). This is the core competitive feature that justifies the milestone.

**Delivers:** `elo.js` pure Glicko-2 calculation; `ratings` table updated atomically with `matches` INSERT; ranked queue flag on rooms; `leaderboard_cache` refreshed every 5 minutes; `/api/leaderboard` REST endpoint; seasonal reset logic.

**Features addressed:** Glicko-2 ranked mode, global leaderboard, seasonal ranked reset.

**Pitfalls to avoid:** Partial rating updates (same DB transaction as match insert); full-table leaderboard scan (use `leaderboard_cache`); smurfing (gate ranked behind OAuth; require placement matches before leaderboard visibility).

**Research flag:** Glicko-2 implementation needs validation against Lichess reference formula before connecting to the ranked queue. Unit-test `elo.js` against known inputs.

---

### Phase 4: Public Matchmaking Queue

**Rationale:** Casual FIFO quick-match can ship immediately after Phase 1. Full ELO-based ranked matchmaking requires Phase 3 ratings. Casual subset and ranked matchmaking can be the same module with a mode flag.

**Delivers:** `matchmaking.js` in-memory queue; `joinQueue`/`leaveQueue` Socket.IO events; periodic pairing tick (1500ms); ELO window ±200 widening 50 per 10s wait; `matchFound` emits; queue entry removed on `disconnect`.

**Features addressed:** Public quick-match (no room code), ranked matchmaking.

**Pitfalls to avoid:** Queue race conditions (pair-and-create is a single synchronous critical section); duplicate room creation (DB unique constraint on `active_game_id`); queue cleanup on disconnect.

**Research flag:** Standard patterns — skip research-phase. Note: multi-process future requires `SELECT ... FOR UPDATE SKIP LOCKED`.

---

### Phase 5: Social — Friends, Presence, Direct Challenge

**Rationale:** Depends on accounts (Phase 1). Build after ranked retention is validated via D7/D30 metrics. Friends list is the highest-complexity social primitive.

**Delivers:** `friends` table (directed graph, two rows per pair); presence via Redis TTL keys (45s expiry, refreshed on Socket.IO heartbeat); `friendOnline`/`friendOffline` events to affected friends only; direct challenge invite via Socket.IO; rematch history queries.

**Features addressed:** Friends list with online presence, direct challenge, rematch history.

**Pitfalls to avoid:** Zombie presence (Redis TTL keys only, not `users.last_seen`; 30s grace timer on disconnect); no global presence fan-out.

**Research flag:** Redis TTL presence pattern is well-documented. Socket.IO multi-tab presence (Map<accountId, Set<socketId>>) may need a brief spike.

---

### Phase 6: Spectate and Replay Viewer

**Rationale:** Spectator mode reuses replay event infrastructure from Phase 2. Requires healthy player population.

**Delivers:** `spectate` Socket.IO event; role guard on game-action handlers; `spectatorPayload` (shot history only, no ship positions); 10s server-side delay; replay viewer UI replaying `replay_events` in `setInterval`.

**Features addressed:** Live spectator mode, saved game replays (viewer UI).

**Pitfalls to avoid:** Spectators receiving hidden ship positions (use `spectatorPayload` omitting `occ`).

**Research flag:** Server-side 10s delay implementation for spectator sockets may need a brief spike to confirm the cleanest Socket.IO buffering pattern.

---

### Phase 7: Depth and Retention Features

**Rationale:** XP/levels, daily challenges, bot difficulty tiers. Build after ranked retention validated. Bot difficulty is account-independent and can be parallelized with earlier phases.

**Delivers:** XP system (cosmetic only); level progression; daily challenge system (3 quest slots, midnight UTC reset); bot difficulty tiers (easy/medium/hard/insane as distinct algorithms).

**Features addressed:** XP/levels/progression, daily challenges/quests, bot difficulty tiers.

**Pitfalls to avoid:** XP for gameplay advantage (cosmetic only); configurable game modes must use separate ELO pools or be casual-only.

**Research flag:** Probability-density targeting algorithm for "hard" bot may benefit from a brief research spike.

---

### Phase 8: Tournaments (v2+)

**Rationale:** Requires 20+ concurrent active players and a healthy ranked ecosystem. Bracket generation must be atomic.

**Delivers:** Tournament bracket state machine; power-of-2 expansion with byes; bracket generation with DB advisory lock; notifications.

**Pitfalls to avoid:** Bracket created before all players confirmed (atomic "lock and generate" only); concurrent generation (DB advisory lock).

**Research flag:** Tournament bracket state machine complexity — needs a dedicated research phase before planning.

---

### Phase Ordering Rationale

- Persistence is the non-negotiable root (FEATURES.md dependency tree, ARCHITECTURE.md build order).
- Security hardening co-locates with Foundation (PITFALLS.md CONCERNS.md escalation table): cheaper to fix before public features than after.
- Match recording precedes ELO: ratings without a match record source-of-truth are irrecoverable if corrupted.
- Ranked precedes matchmaking: ELO pairing requires ratings to exist.
- Social after ranked retention validation: build it after D7 data confirms the competitive loop works.
- Spectate reuses replay infrastructure: build event log first, spectator is then a real-time replay.
- Tournaments are v2+: fewer than 20 concurrent players is a poor tournament experience.

### Research Flags

**Needs research before planning:**
- **Phase 3 (Glicko-2):** Validate formula against Lichess reference; unit-test `elo.js` against known inputs before connecting to ranked queue.
- **Phase 6 (Spectate delay):** Server-side event buffering per spectator socket — confirm lowest-overhead Socket.IO pattern for 10s delay.
- **Phase 8 (Tournaments):** Full research phase required before planning.
- **Phase 7 (Bot algorithms):** Brief research spike on probability-density targeting for "hard" tier.

**Standard patterns (skip research-phase):**
- Phase 1: Drizzle + pg.Pool + Passport + express-session are all well-documented.
- Phase 2: Append-only event log + batch INSERT on game-end is textbook.
- Phase 4: In-memory queue with periodic tick and ELO-window widening is standard.
- Phase 5: Redis TTL presence pattern is widely documented.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry; Render constraints from official docs; compatibility matrix confirmed |
| Features | HIGH | Table stakes cross-referenced with Lichess and Chess.com; anti-features backed by documented case studies |
| Architecture | HIGH | Existing codebase fully read; new subsystems verified against official Socket.IO and node-postgres docs |
| Pitfalls | HIGH | Core pitfalls verified against official Postgres, OAuth, and Socket.IO docs; CONCERNS.md cross-referenced with production failure patterns |

**Overall confidence: HIGH**

### Gaps to Address

- **Glicko-2 parameters for Battleship context:** Starting RD (±350 is standard) and volatility need validation against Lichess's published parameters for fast games.
- **Rate limiting library split:** Use `express-rate-limit` for REST endpoints, `rate-limiter-flexible` for Socket.IO event-level limits — Pitfalls recommends the latter; Stack only mentions the former.
- **Replay retention policy:** No decision made on auto-deletion window. Recommend 90 days default unless player explicitly saves; implement background cleanup job in Phase 2 or 6.
- **Render sticky sessions for multi-process future:** `transports: ['websocket']` on the client eliminates sticky session requirements when horizontal scaling lands; flag for Phase 8.

---

## Sources

### Primary (HIGH confidence)
- [orm.drizzle.team/docs/get-started-postgresql](https://orm.drizzle.team/docs/get-started-postgresql) — Drizzle setup, SSL config
- [render.com/docs/postgresql-creating-connecting](https://render.com/docs/postgresql-creating-connecting) — connection strings, SSL requirements
- [socket.io/docs/v4/using-multiple-nodes](https://socket.io/docs/v4/using-multiple-nodes/) — scaling, sticky sessions
- [node-postgres.com/features/pooling](https://node-postgres.com/features/pooling) — Pool configuration
- [developers.google.com/identity/protocols/oauth2/web-server](https://developers.google.com/identity/protocols/oauth2/web-server) — OAuth state validation
- [lichess.org/page/rating-systems](https://lichess.org/page/rating-systems) — Glicko-2 reference

### Secondary (MEDIUM confidence)
- [pganalyze.com/blog/5mins-postgres-jsonb-toast](https://pganalyze.com/blog/5mins-postgres-jsonb-toast) — TOAST bloat mechanics
- [dev.to/kspeakman/event-storage-in-postgres-4dk2](https://dev.to/kspeakman/event-storage-in-postgres-4dk2) — event-log table pattern
- [opisthokonta.net/?p=1412](https://opisthokonta.net/?p=1412) — ELO K-factor variable rate
- [gameanalytics.com/blog/matchmaking-tips-for-game-developers](https://www.gameanalytics.com/blog/matchmaking-tips-for-game-developers) — matchmaking patterns

---
*Research completed: 2026-06-01*
*Ready for roadmap: yes*
