# Phase 1: Foundation - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Foundation delivers two things and nothing else:

1. **Durable persistence** — the server connects to the self-hosted Postgres (on the dedicated EC2 box) via a single shared `pg.Pool` (`db.js`, params from env), and schema is created/migrated automatically on startup with zero manual SQL on deploy (DATA-01, DATA-02).
2. **Security hardening prerequisites** — the attack vectors that become critical the moment public matchmaking opens: per-player rate limiting on `fire`/`useAbility` (SEC-01), `doShot()` null/shape guarding (SEC-02), abandoned-room cleanup (SEC-03), and server-side profile/chat input validation (SEC-04).

**Not in this phase:** OAuth/accounts (Phase 2), match recording (Phase 3), ELO/ranked (Phase 4), matchmaking queue (Phase 5), bot tiers (Phase 6). No ELO/matches/queue tables are created here.

**Hosting note (locked):** Hosting migrated Render → dedicated EC2 (app + Postgres + Redis co-located on one box). Render-specific pitfalls — free-tier 30-day deletion, no built-in PgBouncer, forced SSL — do **not** apply. Postgres is reachable on localhost; SSL is off for the local connection (env-gated so it can be turned on later).

</domain>

<decisions>
## Implementation Decisions

### Migration mechanism
- **D-01:** Schema is managed by **numbered `.sql` migration files** (`migrations/001_*.sql`, applied in lexical order) executed by a **small custom runner** (~30 lines) that records each applied filename in a `schema_migrations` table and skips already-applied files. No migration framework dependency — fits the project's minimal-deps / no-TypeScript / guard-clause ethos while giving real version tracking and full SQL control as schema grows across Phases 2–6.
- **D-02:** The runner executes on server **boot, before `listen()`** — so deploys never require manual SQL (DATA-02). If a migration fails, the server refuses to start (fail loud, don't serve on a half-migrated schema).

### Phase-1 schema scope (canonical identity model laid now)
- **D-03:** Create the **canonical identity model up front**, even though accounts ship in Phase 2: one `users` row, many `credentials` rows. This follows PITFALLS #1 — designing identity as a single canonical user with multiple attached credentials avoids a painful identity retrofit when Google OAuth lands.
  - `users` — canonical player identity (id, created_at, and a `guest_migrated_at`-style column reserved for the Phase-2 link flow).
  - `credentials` — `(id, user_id FK, type ['guest'|'google'], external_id, created_at)` with a **unique constraint on `(type, external_id)`**. Guests are `type='guest'`, `external_id = clientId`. Google credentials (Phase 2) dedupe on `sub`, not email.
  - `schema_migrations` — applied-migration tracking (from D-01).
- **D-04:** On socket connect/resume, the server **upserts a guest credential** keyed by the browser `clientId`, giving Phase 1 a real durable write/read path (satisfies "all queries succeed under normal play"). Guest-first stays non-negotiable — no login, no friction; the DB row is created transparently behind the existing `clientId` flow.
- **D-05:** `db.js` exports a **single shared `pg.Pool`** (never per-request/per-module pools — PITFALLS #4). Conservative `max` (~10). Connection params from env (`DATABASE_URL` or discrete `PG*` vars). `ssl` off for localhost EC2, env-gated for future remote use.

### Rate-limit backing + policy
- **D-06:** Use **`rate-limiter-flexible` with the in-memory store (`RateLimiterMemory`)**, keyed per player (socket/clientId). Single process on EC2 means no cross-process need yet; the limiter store is swappable to Redis later when horizontal scaling arrives (Phase 5). Keep the existing graceful-degradation ethos — limiter is a hard dependency of the handlers, but its backing store is an implementation detail.
- **D-07:** Limits (from PITFALLS #9 research): `fire` ≤ 2/s, `useAbility` ≤ 1/s, `chat` ≤ 5 per 10s.
- **D-08:** Violation response follows the structured-error-code convention: emit a named **`RATE_LIMITED`** error code and **drop** the offending event (never crash). After repeated rapid violations, **disconnect** the socket. (Account-level flagging is out of scope until accounts exist.)
- **D-09 (folded):** Guard the **turn-clock race** (CONCERNS #7 / PITFALLS #9 corollary) with a `turn.resolving` boolean so a simultaneous `fire` + timeout cannot both resolve. Lands in the same phase as rate limiting.

### Room cleanup trigger
- **D-10:** **Hybrid eviction.** Each room carries a `lastActivityAt` timestamp. A **periodic sweep** (~60s interval) evicts rooms idle past a threshold — this catches pre-game/abandoned rooms and zombie rooms where no `disconnect` event ever fired. **Plus** immediate eviction when **both seats are empty past the 3-minute grace window**. Net effect: in-memory room-map size is bounded by active games (SEC-03), no unbounded growth under load.

### Claude's Discretion
- **`doShot()` guard (SEC-02):** guard-clause early return on null/malformed opponent state with a structured code (e.g. `BAD_STATE`); never throw an unhandled exception. Follows existing guard-clause + named-code conventions.
- **Input validation (SEC-04):** extend the existing `sanitizeProfile()` (`server.js`); add equivalent server-side chat validation (trim, enforce max length, strip control chars, HTML-escape names stored to DB to prevent stored XSS on future profiles/leaderboards). Add a Content-Security-Policy header. Exact limits/regex left to planner, consistent with existing sanitizer.
- **Migration file layout & runner shape, env var names, pool `max` tuning** — planner's call within D-01/D-05.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Persistence & pool
- `.planning/research/PITFALLS.md` §"Pitfall 4: Render Postgres Connection Pool Exhaustion" — single shared `pg.Pool` from `db.js`; conservative `max`; SSL/connection caveats (note: EC2-self-hosted reduces several of these).
- `.planning/research/PITFALLS.md` §"Pitfall 1: Guest Identity Multiplied After OAuth Linking" — the `users` + `credentials` identity model laid down in D-03 (read before designing the schema).
- `.planning/research/PITFALLS.md` §"Integration Gotchas" + §"Technical Debt Patterns" — pool singleton, no all-in-one `users` table.

### Security hardening
- `.planning/research/PITFALLS.md` §"Pitfall 9: fire/useAbility Rate Limit Absent" — limiter choice, limit values, turn-clock race corollary (D-06…D-09).
- `.planning/codebase/CONCERNS.md` #2 (rate limit), #6 (`doShot()` null crash), #7 (turn-clock race), #8 (unbounded room map), #3 (profile/chat validation) — the concrete code locations and severities this phase closes.
- `.planning/research/PITFALLS.md` §"Security Mistakes" + §"\"Looks Done But Isn't\" Checklist" — verification cues for SEC-01..04.

### Phase contract
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — goal + 5 success criteria.
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-02, SEC-01..04 (acceptance source of truth).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `store.js` (~65 lines) — existing optional-Redis abstraction with the graceful no-op pattern. Mirror this pattern's shape for `db.js` (single module, env-driven, exported singleton). Redis stays for game-state snapshots; Postgres is the new durable store for identity.
- `sanitizeProfile()` (`server.js` ~line 137) — existing name/photo sanitizer (40-char name, HTTPS photo regex). Extend it for SEC-04; add a sibling chat validator.
- `clientId` flow + 3-minute grace window (`GRACE_MS = 180000`) — guest identity already keyed by `clientId` in localStorage; D-04 upsert hooks into this without changing UX.

### Established Patterns
- Server-authoritative validation, guard-clause early returns, structured error codes (`ROOM_NOT_FOUND`, `BAD_PLACEMENT`) — new codes `RATE_LIMITED`, `BAD_STATE` follow this.
- Optional features degrade gracefully (Redis, audio, storage) — keep DB connection failures loud enough to matter (identity is now core) but pool/SSL config env-driven.
- `rooms` object (`server.js` ~line 68) holds in-memory room/seat state — the cleanup sweep (D-10) operates on this map.

### Integration Points
- `db.js` (new) imported by `server.js`; migration runner invoked at boot before `listen()`.
- Rate limiter wraps the `fire` / `useAbility` / `chat` Socket.IO handlers in `server.js`.
- Guest-credential upsert hooks into the existing connect/`resume`/`rejoin` path.
- Room-cleanup sweep registered as an interval alongside the existing turn-clock timers.

</code_context>

<specifics>
## Specific Ideas

User deferred specific choices to Claude ("choose what you think is appropriate and correct") and then locked all four area decisions as proposed. No "I want it like X" references beyond the locked decisions above. Research (PITFALLS.md) is the primary design reference for this phase.

</specifics>

<deferred>
## Deferred Ideas

- **Redis-backed rate limiter** — swap `RateLimiterMemory` → Redis store when horizontal scaling / multi-instance lands. Belongs with Phase 5 (Public Matchmaking) / the scaling work, not Foundation.
- **Account-level violation flagging / ban review** — meaningful only once persistent accounts exist (Phase 2+).
- **ELO / matches / queue / leaderboard tables** — Phases 3–5 own these; not created in Foundation.
- **PgBouncer / multi-instance pool math** — only relevant if the EC2 single-process assumption changes (Phase 5 scaling).

None — discussion stayed within phase scope (all deferrals above are natural future-phase boundaries, not dropped scope).

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-06-01*
