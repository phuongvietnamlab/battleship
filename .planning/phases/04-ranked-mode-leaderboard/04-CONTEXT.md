# Phase 4: Ranked Mode & Leaderboard - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Signed-in players earn a **Glicko-2 rating** through ranked classic-mode matches, and the **top 100** rated players are publicly visible on a leaderboard. Ratings update in the **same DB transaction** as the match record (RANK-01); ranked play is gated to authenticated accounts (RANK-02); new players are hidden until their rating is confident enough (RANK-03); the leaderboard is served from a cache refreshed at least every 5 minutes (RANK-04); and an admin can run a **seasonal soft-reset** that archives prior ratings without deleting history (RANK-05).

**In scope:**
- `elo.js` — pure Glicko-2 implementation (validated against Lichess reference; defaults rating 1500, RD 350, volatility 0.06, standard tau).
- A `ranked` flag on room creation (host toggle) — designates a game as ranked **before** the Phase-5 matchmaking queue exists, so the full rating slice is demoable now.
- `005_rankings.sql` migration: new `ratings`, `rating_history`, `seasons` tables + `ALTER matches` to add rating-before/after snapshot columns.
- Rating compute + write inside the existing single match-record transaction.
- Public top-100 leaderboard endpoint backed by a Redis cache.
- A CLI/npm season soft-reset script (archive → soft-reset).
- Guest-block enforcement (server reject + client hint) for ranked.

**Out of scope (other phases):**
- **Matchmaking / ranked queue** (QUEUE-01/02/03 — Phase 5). Phase 4 only defines *what makes a match ranked* (the room flag); automatic pairing within an ELO window comes later. The Phase-5 queue will set the same `ranked` flag.
- **Per-mode rating pools** (MODE-01 — v2). Phase 4 is a **single pool, classic-mode-only** ranked.
- **Admin auth / admin UI** — the season reset is an ops CLI script, not a web admin surface.
- **Profile rating display / rating-over-time graphs** — Phase 4 produces the data (incl. per-match snapshots); a later phase renders it.

</domain>

<decisions>
## Implementation Decisions

### Ranked designation & gating
- **D-01:** A game becomes ranked via a **`ranked` boolean on room creation** (host toggle in the lobby), mirroring the existing `room.mode` classic/advance pattern (`server.js` createRoom ~1218). This yields a full vertical slice playable now via code-share; the Phase-5 queue will later set the same flag. Engine-only/dev-hook and separate-button alternatives rejected (former isn't demoable as a real game; latter is just a UI variant of the flag).
- **D-02:** Guest block (RANK-02) is **server-authoritative reject + client hint**. Server rejects a ranked create/join when any seat is unauthenticated, returning a named code **`RANKED_REQUIRES_ACCOUNT`** surfaced as a toast/banner; client also disables/hides the ranked toggle for guests. Defense in depth, consistent with the server-authoritative + named-error-code convention.
- **D-03:** A match counts as ranked **only if BOTH seats are signed in**. A signed-in-vs-guest game falls back to unranked (no rating change). Keeps ratings fair — both players need persistent identity.

### Rating model & storage
- **D-04:** Ratings live in a **new `ratings` table** keyed by `user_id` (FK PK): `rating`, `rd` (deviation), `volatility`, `games_played`, `updated_at`. Mirrors the normalized `credentials` separation; `users` stays identity-only. Columns-on-users rejected.
- **D-05:** **Single rating pool, classic-mode-only ranked.** Advance-mode power-ups add luck/variance that would pollute a skill rating, so advance games are never ranked. MODE-01 separate pools is v2-deferred. (Implication: ranked + advance is rejected at room create — a ranked room is classic.)
- **D-06:** **Snapshot ratings onto the matches row.** `005_rankings.sql` adds `winner_rating_before/after` and `loser_rating_before/after` to `matches` (IF NOT EXISTS — the `004_matches.sql` header already anticipates this ALTER). Written in the same transaction (RANK-01). Enables rating history/graphs + audit.
- **D-07:** **Per-match immediate update, rating period = 1 game.** Compute and write the new ratings in the **same DB transaction** as the match record (success criterion 1). Each game is treated as a one-game Glicko-2 rating period — a deliberate, accepted simplification vs canonical batch periods (which conflict with the same-transaction criterion). `elo.js` is unit-tested against known Lichess inputs before being wired to game-end.

### Placement & leaderboard
- **D-08:** **RD-threshold placement gate** (RANK-03). A player is *provisional* and hidden from the leaderboard until their rating deviation drops below a threshold (Lichess-style, ~RD < 110). Idiomatic Glicko-2 and self-correcting — RD naturally falls with games played. Fixed-count gate rejected as arbitrary.
- **D-09:** **Redis-cached top-100 leaderboard** (RANK-04). Cache the computed top-100 in Redis, refreshed on rating change with a ≤5-minute TTL fallback. Redis is always available (EC2 self-host) and this survives the single-process model + is Phase-5-scaling friendly. Postgres materialized view and in-memory TTL rejected (scheduling complexity / not restart- or multi-process-safe).
- **D-10:** **Leaderboard ordered by rating `r` descending.** Intuitive for players; provisional players already excluded by D-08. Conservative `r − 2·RD` lower-bound rejected as confusing to players.

### Season reset
- **D-11:** **Soft-reset = blend toward default + reset RD** (RANK-05). `new_rating = 1500 + (old_rating − 1500) × factor` (factor ≈ 0.5) with RD reset high (~350) so ratings move freely again. Matches the "soft-reset toward the default" wording — skilled players keep an edge but must re-prove. RD-inflate-only and full-reset rejected.
- **D-12:** **Archive to `rating_history` + `seasons` tables.** `seasons(id, label, started_at, ended_at)`; `rating_history(user_id, season_id, rating, rd, volatility, games_played, archived_at)`. Snapshot all active ratings into history **before** the soft-reset — history is never deleted. Clean season metadata + queryable past ladders.
- **D-13:** **Admin trigger = CLI / npm script** run on the server box (migration-runner ops style). Zero public attack surface, no new admin-auth scope. Protected/flag-guarded HTTP endpoints rejected — a destructive seasonal op should not be a public surface.

### Claude's Discretion
- Exact Glicko-2 constants beyond the locked defaults (tau value, convergence epsilon) — implement per the canonical Glicko-2 paper; validate against Lichess reference inputs (D-07).
- Exact column names/types, index choices, and DDL for `ratings`/`rating_history`/`seasons` + the `matches` ALTER — honor D-04/D-06/D-12 and the existing migration conventions (`migrations/00N_*.sql`, `IF NOT EXISTS`, lexical-sort runner in `db.js`).
- Redis cache key/structure (sorted set vs cached JSON), TTL value within the ≤5-min ceiling, and the refresh-on-write trigger shape (D-09).
- Where the rating-write helper and leaderboard read live (`db.js` exports following the parameterized-query + single-`Pool` convention).
- Exact provisional RD threshold value (~110) and the soft-reset blend factor (~0.5) — tune to the Glicko-2 model; D-08/D-11 lock the *mechanism*, not the precise constant.
- Lobby UI shape for the ranked toggle + the leaderboard view (EN/VI i18n required).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — RANK-01 (rating updates in same txn as match record), RANK-02 (ranked requires signed-in account), RANK-03 (placement before leaderboard), RANK-04 (top-100 cache ≤5 min), RANK-05 (seasonal soft-reset after archiving). Also notes MODE-01 (per-mode pools) is v2 / out of scope.
- `.planning/ROADMAP.md` §"Phase 4: Ranked Mode & Leaderboard" — goal, 5 success criteria (verification gates), `Mode: mvp`, and the research flag (validate Glicko-2 vs Lichess; unit-test `elo.js` with 1500/350/0.06).

### Prior-phase context (rating source of truth)
- `.planning/phases/03-match-recording/03-CONTEXT.md` — D-01 (Phase-4-ready `matches` schema), D-06 (single idempotent `recordMatch` funnel + `room.recorded` dedup), D-07 (best-effort write, single transaction, never blocks play — **the rating write inherits this graceful-degrade contract**).

### Codebase (match-write + identity + mode)
- `migrations/004_matches.sql` — live `matches` table; header explicitly anticipates the Phase-4 `005_rankings.sql` ALTER (winner/loser rating before/after). Dedup constraint `UNIQUE (winner_id, loser_id, started_at)`.
- `migrations/001_identity.sql` — `users` / `credentials` model (FK target for `ratings.user_id`); numbering + `IF NOT EXISTS` conventions for `005_rankings.sql`.
- `server.js:1086`, `server.js:1160`, `server.js:761`, `server.js:1570` — the four `recordMatch(...)` call sites (forfeit, normal win, disconnect-grace, leave). Ranked rating compute/write must ride inside the same `recordMatch` transaction so it's atomic with the match row (RANK-01).
- `server.js:1218` — `createRoom` (`mode = advance|classic` parsing + room object init) → where the `ranked` flag is added (D-01) and ranked+advance is rejected (D-05).
- `db.js` — single `new Pool`, parameterized `$1` bindings, `BEGIN/COMMIT/ROLLBACK/finally release` transaction pattern (reuse for atomic rating write), lexical-sort migration runner (`005_rankings.sql` auto-picked up).
- `store.js` — Redis client + graceful-degrade pattern (leaderboard cache D-09 follows it; but note Redis is now always-available per STATE infra decision).

### Project conventions
- `CLAUDE.md` — server-authoritative validation, named error codes (e.g. `RANKED_REQUIRES_ACCOUNT`), guard-clause style, flat structure (`elo.js` at root like `db.js`/`mailer.js`), optional features degrade gracefully, EN/VI i18n preserved.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.js` transaction helper pattern (`pool.connect` → `BEGIN`/`COMMIT`/`ROLLBACK`/`finally release`) — directly reusable to wrap match-record + rating write atomically (RANK-01).
- `recordMatch(...)` (Phase 3) — single idempotent funnel for all four game-end paths; the rating update hooks in here once, covering every ranked end path with no duplication.
- `db.js` migration runner (lexical sort, `schema_migrations` tracking) — `005_rankings.sql` is applied automatically, no runner edit.
- `store.js` Redis client — backing store for the leaderboard cache (D-09).
- `room.mode` host-selection flow in `createRoom` — direct analog for the new `ranked` flag (D-01).

### Established Patterns
- Graceful degradation (Redis/mailer/match-write all no-op when their dependency is unavailable). The rating write inherits Phase-3 D-07: best-effort, swallowed errors, `gameOver` emitted first, never blocks the end screen.
- Named error codes returned to clients (`ROOM_NOT_FOUND`, `BAD_PLACEMENT`, …) → `RANKED_REQUIRES_ACCOUNT` follows the same shape.
- `socket.data.userId` (Phase 2) — authenticated-seat identity already on the socket; used to enforce D-02/D-03 and to key the `ratings` row.

### Integration Points
- `createRoom` (`server.js:1218`) — add `ranked` flag, reject ranked+advance (D-05), reject ranked when a seat is a guest (D-02).
- `recordMatch` call sites (`server.js:1086/1160/761/1570`) — only rated when `room.ranked && both seats signed-in`; rating compute (`elo.js`) + write + match-snapshot all inside the one transaction.
- New leaderboard read endpoint (Express, alongside `/healthz` / `/metrics`) backed by the Redis cache.
- Season-reset CLI script — standalone node entry using the same `db.js` Pool.

</code_context>

<specifics>
## Specific Ideas

- Glicko-2 defaults pinned by the roadmap research flag: starting rating **1500**, RD **350**, volatility **0.06**, standard tau. `elo.js` MUST be unit-tested against known Lichess reference inputs/outputs before wiring to the ranked queue/game-end.
- "Same DB transaction as the match record" is the hard constraint shaping the per-match (period=1) design — do not batch.
- Keep `elo.js` a **pure function** (no DB, no I/O) — the ~40-line pure-function framing from the roadmap key-decision; testable in isolation.
- Provisional players are computed and rated normally; they're just *filtered out of the leaderboard view* until RD drops below threshold (D-08) — don't withhold their rating, only their visibility.

</specifics>

<deferred>
## Deferred Ideas

- Ranked matchmaking queue + ELO-window pairing (QUEUE-01/02/03) — **Phase 5**. Phase 4 only adds the `ranked` room flag the queue will later drive.
- Per-mode rating pools / rankable advance mode (MODE-01) — v2.
- Profile rating display + rating-over-time graphs (consumes D-06 snapshots) — later phase.
- Web admin UI / admin auth for season reset — out of scope; CLI script suffices (D-13).
- Conservative `r − 2·RD` leaderboard ordering — considered, rejected for v1 (D-10); revisit if player feedback wants consistency-weighting.

</deferred>

---

*Phase: 4-ranked-mode-leaderboard*
*Context gathered: 2026-06-03*
