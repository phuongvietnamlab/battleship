# Phase 3: Match Recording - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Every completed **server-side 2-player game** writes exactly one durable match record to Postgres, giving the system a reliable source of truth for ratings (Phase 4). This includes explicit forfeit losses when a disconnect exceeds the 3-minute grace window (MATCH-03), normal win/loss (MATCH-01), 3-consecutive-timeout forfeits, and deliberate leave-room forfeits.

**In scope:** `matches` schema (migration `004`), match-write on all server game-end paths, forfeit recording on grace-window expiry, exactly-one-record dedup across racing end paths, graceful degradation when DB unavailable.

**Out of scope (other phases):**
- Glicko-2 rating computation / `RANK-01` (Phase 4) — schema must *leave room* for ratings written in the same transaction later, but this phase does NOT compute or store ratings.
- Bot / single-player games — these run entirely client-side with no server room, so there is no match to record. Not in scope.
- Match history UI / profile win-loss display surfacing these records (later phase). This phase produces the data; it does not render it.
- Public matchmaking, leaderboards.

</domain>

<decisions>
## Implementation Decisions

### Match record content
- **D-01:** Lean + Phase-4-ready schema. Store per match: both player `user_id`s, `winner_id`, `loser_id`, `reason`, `mode` (classic vs advance), `started_at`, `ended_at`. No move-by-move log, no per-shot stats. The schema must leave room for Phase 4 to add Glicko rating columns / write ratings in the same transaction (RANK-01) without a breaking migration.
- **D-02:** `reason` is a small named taxonomy (text enum-style, validated server-side, not free text), covering at minimum: `normal` (all ships sunk), `timeout` (3 consecutive turn timeouts), `disconnect` (grace-window expiry), `leave` (deliberate leave-room). Mirrors the existing `reason` string already passed to `endGameForfeit`/`gameOver` so client + record agree.

### Player attribution
- **D-03:** Record **all** started 2-player server games, attributed by `users.id` for both seats — guests included (guest-vs-guest games too). Every `clientId` already resolves to exactly one `users` row via the Phase-1 `upsertGuestCredential` CTE. Bot/single-player excluded (no server room).
- **D-04:** Resolve each seat's `user_id` at match-write time: signed-in player → `socket.data.userId` (set in Phase 2); guest → lookup `credentials WHERE type='guest' AND external_id = clientId`. If a seat's `user_id` cannot be resolved (rare: guest row failed to write on connect, or DB unavailable), the match is not written — recording is best-effort and must never block play (see D-07).

### Forfeit & dedup
- **D-05:** Only record games that **actually started battle** (`room.started === true`). A game abandoned during lobby/placement (before the first shot / before `started`) writes no match row — consistent with "completed game" intent.
- **D-06:** Exactly **one** match row per game. All server end paths converge: normal win (`server.js` ~1116, fire handler), `endGameForfeit` (~1047, timeout + leave), and grace-window expiry in `scheduleSeatRelease` (~730) — which currently only frees the seat and must be extended to record a `disconnect` forfeit loss for a started, not-yet-recorded game. Guard with an idempotency flag on the room (e.g. `room.recorded`) set inside the same critical section so racing paths (simultaneous fire + timeout, or win + disconnect) cannot double-write.

### Write reliability
- **D-07:** Emit `gameOver` to players **first**, then write the match record best-effort in a **single transaction** (MATCH-01). A slow, failed, or unavailable DB write must never block or break the end-game screen. When `DATABASE_URL` is unset the writer no-ops + logs, mirroring the established graceful-degrade convention (Redis/audio/storage/mailer). DB errors are caught, logged with a `[match]`-style prefix, and swallowed — play continues.

### Claude's Discretion
- Exact column names/types, index choices, and the precise `matches` DDL — researcher/planner decide, honoring D-01/D-02 and the existing migration conventions (`migrations/00N_*.sql`, `IF NOT EXISTS` guards, lexical-sort runner in `db.js`).
- The dedup mechanism's exact shape (room flag vs DB unique constraint vs both) — implementation detail honoring D-06.
- Where the match-write helper lives (`db.js` export following the parameterized-query + single-`Pool` convention).
- Whether `started_at` derives from an existing room timestamp or a new one captured at battle start.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — MATCH-01 (every completed game writes a match record, players/winner/reason, single transaction), MATCH-03 (disconnect beyond grace window = explicit forfeit loss). RANK-01 listed there is **Phase 4**, not this phase — but informs D-01 (schema must allow same-transaction rating writes later).
- `.planning/ROADMAP.md` §"Phase 3: Match Recording" — goal + the two success criteria that gate verification.

### Codebase (game-end + identity)
- `server.js:1116` — normal win path (fire handler, `sunkCount >= FLEET.length`) → MATCH-01 record point.
- `server.js:1047` — `endGameForfeit(room, loserId, reason)` → timeout + leave forfeit record point.
- `server.js:730` — `scheduleSeatRelease` grace-expiry callback → MATCH-03 disconnect-forfeit record point (currently only frees seat + emits `opponentLeft`).
- `server.js:182` — `GRACE_MS = 180000` (3-min grace), `RESTORE_GRACE_MS` (5-min post-restart).
- `db.js:75` — `upsertGuestCredential` CTE (proves every clientId → one users row; guest credential lookup pattern for D-04).
- `db.js` module.exports + single `new Pool` + parameterized-query convention (new match-write helper must follow it).
- `migrations/001_identity.sql`, `002_accounts.sql`, `003_email_accounts.sql` — numbering + header + `IF NOT EXISTS` conventions for the new `004_matches.sql`.

### Project conventions
- `CLAUDE.md` — server-authoritative validation, named error codes, flat structure (no util/barrel), guard-clause style, optional features degrade gracefully.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.js` transaction pattern (`pool.connect` → `BEGIN`/`COMMIT`/`ROLLBACK`/`finally release`) from `upsertGuestCredential`/`linkOrPromoteAccount` — directly reusable for the single-transaction match write (MATCH-01).
- `db.js` migration runner (lexical sort, `schema_migrations` tracking, applied-once) — `004_matches.sql` is picked up automatically, no runner edit.
- `socket.data.userId` (Phase 2) — signed-in seat identity already available on the socket.

### Established Patterns
- Graceful degradation: Redis (`store.js`), mailer (`mailer.js`), audio/storage all no-op when their dependency is unconfigured. Match-write follows the same shape when `DATABASE_URL` is unset.
- `reason` string already flows through `endGameForfeit` → `gameOver` emit; record taxonomy (D-02) aligns with it.

### Integration Points
- Three server game-end sites (`server.js` ~1116, ~1047, ~730) must funnel through one idempotent `recordMatch`-style helper (D-06).
- `scheduleSeatRelease` (~730) needs new logic: on grace expiry of a `started`, unrecorded game, record a `disconnect` forfeit loss for the absent seat before/while freeing it.

</code_context>

<specifics>
## Specific Ideas

- Reason taxonomy values should reuse the existing emitted strings (`timeout`, plus `normal`/`disconnect`/`leave`) so server, client, and the stored record stay consistent.
- "Durable source of truth for ratings" is the framing — keep the row authoritative and minimal; resist storing derived/duplicated data.

</specifics>

<deferred>
## Deferred Ideas

- Glicko-2 rating computation + same-transaction rating write (RANK-01) — Phase 4.
- Match history / win-loss surfacing on the profile screen (Phase 2 left 0/0/0 scaffold) — later phase consumes these records.
- Per-game statistics (shots, hits, duration) — not needed for ratings; revisit only if a stats feature is scoped.

</deferred>

---

*Phase: 3-Match Recording*
*Context gathered: 2026-06-02*
