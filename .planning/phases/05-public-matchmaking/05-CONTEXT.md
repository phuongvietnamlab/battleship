# Phase 5: Public Matchmaking - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Players find opponents automatically — **no room code**. Two public queues pair online players and drop them straight into a game: a **casual Quick Match** queue (QUEUE-01) and a **Ranked** queue whose ELO window **widens the longer a player waits** (QUEUE-02). A player's queue entry is **removed immediately** when they disconnect, cancel, or navigate away, so they never block a slot or appear as a phantom opponent (QUEUE-03).

Phase 5 *drives* the existing Phase-4 `ranked` room flag — it does not redefine ratings, the rating math, the guest-gate, or match recording. It adds the automatic pairing layer in front of the existing room/game flow.

**In scope:**
- Two server-side queues: casual (classic-only) and ranked (classic-only, signed-in only). One queue per player at a time.
- Ranked pairing by Glicko-2 rating with a stepped, widening ELO window → unbounded after a cap (D-05/D-06).
- On pair: server auto-creates a seatless room (reusing the `createRoom` shape) and drops both players straight into ship placement — no accept step (D-10).
- Queue-entry removal on disconnect / explicit cancel / navigate-away (QUEUE-03, D-12).
- Auto re-queue of the remaining player if a partner vanishes before the game starts (D-11).
- Queue wait UX: elapsed timer, searching state, cancel; ranked surfaces the widening window. "Play a bot instead?" offered after a delay when alone (unranked) (D-08/D-09).
- EN/VI i18n for all new UI strings.

**Out of scope (other phases / v2):**
- Per-mode rating pools / rankable advance mode (MODE-01) — v2. Ranked stays classic-only single pool (P4 D-05).
- Rating math, `ratings` table, `RANKED_REQUIRES_ACCOUNT` gate, match recording — built in Phases 3–4; this phase reuses them unchanged.
- Horizontal scaling / Socket.IO Redis adapter (SCAL-01) — v2. Single-process in-memory queue is acceptable this milestone.
- Private room-code play — untouched and preserved (additive).
- Friends/direct-challenge matchmaking (SOCL-02) — v2.

</domain>

<decisions>
## Implementation Decisions

### Queue scope & modes
- **D-01:** **Two separate queues** — a casual "Quick Match" and a "Ranked" queue. Player explicitly picks one. Cleanest mental model; ranked stays account-gated (reuses P4 `RANKED_REQUIRES_ACCOUNT`), casual open to guests. Single auto-ranked-if-able queue rejected (blurs the guest-gate UX).
- **D-02:** **Casual quick-match is classic-only.** Advance mode (power-ups) stays a private-room-only mode reachable via room codes. Keeps the casual pool unfragmented and matchable; mirrors ranked. (Ranked classic-only is already locked by P4 D-05.)
- **D-03:** **One queue at a time** per player — joining a queue is exclusive; switching leaves the other. Simple server state, removes double-pairing risk. Simultaneous casual+ranked queueing rejected (needs atomic cross-queue removal for marginal gain).

### Ranked pairing window
- **D-04:** Pairing is by **Glicko-2 `rating`** (the existing P4 `ratings` table). Ranked queue requires both seats signed-in — reuse the P4 gate; guests cannot enter the ranked queue.
- **D-05:** **Stepped widening.** Start with a narrow ELO window and widen in discrete steps on a recheck timer (e.g. ±100 start, +100 every ~10s up to a cap — exact constants are Claude discretion). Cheap to re-evaluate on a timer; easy to reason about. Continuous per-second widening rejected as marginal UX for more recompute.
- **D-06:** **No dead end — widen to unbounded, keep waiting.** After the cap the window effectively becomes infinite: pair with anyone available and keep the player queued until someone appears or they cancel. A small pool stays playable. Hard timeout-with-failure rejected (dead end on a quiet server).
- **D-07:** **Provisional players (RD ≥ 110, P4 D-08) match in the same ranked queue with a wider starting window.** High RD = uncertain rating, so be lenient on the window; ratings converge quickly. A separate provisional-only pool rejected (fragments an already-small pool).

### Queue UX & empty pool
- **D-08:** **Rich wait status.** While queued the player sees an elapsed timer, a "searching…" state, and a Cancel button; the ranked queue additionally surfaces the current (widening) search window. Reassuring on a quiet server. Minimal spinner rejected (a silent wait reads as broken).
- **D-09:** **Alone-too-long → keep waiting + offer a bot.** The player stays queued indefinitely, but after a delay a "Play a bot instead?" prompt surfaces, reusing the existing client-side bot. The bot game is **unranked** and does not write a match/rating. Always something to do; pure-wait rejected (quiet server feels dead).

### Match handoff & cleanup
- **D-10:** **Instant drop-in — no accept step.** On a pair the server auto-creates the room (reusing the `createRoom` room-object shape + `ranked` flag) and drops both players straight into ship placement. Matches the project's instant-play value. Accept/ready-prompt-with-countdown rejected (adds friction + a decline-timeout to build; vanish is handled by D-11 instead).
- **D-11:** **Auto re-queue the waiter on partner-vanish.** If a paired player disconnects/leaves before the game actually starts, the remaining player is put back into their queue (ideally at the front) and search resumes — no penalty to either. Best experience on a thin pool. Drop-to-menu rejected (frustrating mid-search dead end).
- **D-12:** **Queue-entry removal triggers (QUEUE-03):** socket **disconnect**, explicit **Cancel** button, and **leaving/navigating away from** the queue screen all drop the entry immediately. Covers every phantom-slot path the success criterion calls out. Disconnect+cancel-only rejected (a backgrounded tab could linger as a phantom slot before the socket drops).

### Claude's Discretion
- Exact ELO window constants — starting width, step size, step interval, the cap before unbounded, and the wider provisional starting window (D-05/D-07 lock the *mechanism* and shape, not the numbers). Tune against the Glicko-2 model and expected pool size.
- The "alone-too-long" delay before the bot prompt appears (D-09).
- **Queue state storage** — in-memory structure (matching the existing `rooms` map, single-process) vs a Redis-backed queue. Redis is always available (EC2) and Phase-5-scaling-friendly, but single-process in-memory is sufficient this milestone (SCAL-01 is v2). Researcher/planner decide; honor QUEUE-03's immediate-removal requirement either way.
- Pairing-loop mechanism (check-on-enqueue vs periodic sweep) and the double-pairing race guard — must prevent the same player being matched into two rooms (see CONCERNS #5/#7 race patterns). Reuse a synchronous critical-section + flag pattern like P3 `room.recorded` / P1 `room.resolving`.
- Socket event + named-error-code names for the new queue ops (e.g. `joinQueue` / `leaveQueue` / `matchFound`) — follow the existing `createRoom`/`joinRoom` + `ROOM_NOT_FOUND`/`RANKED_REQUIRES_ACCOUNT` conventions.
- Exact lobby/home-screen UI shape for the two queue buttons and the wait panel (EN/VI required).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — QUEUE-01 (public quick-match, no room code), QUEUE-02 (ranked ELO-window pairing that widens with wait), QUEUE-03 (queue entry removed on disconnect/leave). Also notes MODE-01 (per-mode pools) and SCAL-01 (horizontal scaling) are **v2 / out of scope**.
- `.planning/ROADMAP.md` §"Phase 5: Public Matchmaking" — goal + the 3 success criteria that gate verification (`Mode: mvp`).

### Prior-phase context (the flag + ratings this phase drives)
- `.planning/phases/04-ranked-mode-leaderboard/04-CONTEXT.md` — D-01 (`ranked` boolean on room creation — the queue **sets this same flag**), D-02 (`RANKED_REQUIRES_ACCOUNT` server reject — reused as the ranked-queue gate), D-03 (ranked only if **both** seats signed-in), D-05 (ranked = classic-only), D-08 (provisional = RD ≥ 110). The `ratings` table (`rating`/`rd`/`volatility`) is the source for D-04 pairing.
- `.planning/phases/03-match-recording/03-CONTEXT.md` — D-06 (single `recordMatch` funnel + `room.recorded` dedup), D-07 (best-effort write, never blocks play). Matchmade games record exactly like room-code games — no new recording path.

### Codebase (room lifecycle + socket handlers)
- `server.js:1264` — `createRoom`: room-object shape (`{ code, players, order, started, turn, mode, ranked, ... lastActivityAt }`), `ranked`+`mode` parsing, and the `RANKED_REQUIRES_CLASSIC` / `RANKED_REQUIRES_ACCOUNT` guards. The pairing handler auto-creates a room of this exact shape and seats both players.
- `server.js:1290` — `joinRoom`: second-seat insertion, `opponentJoined`/`oppProfile` emits, profile exchange — the pattern for seating the second matched player into the auto-created room.
- `server.js:1253` — `io.on("connection")`: `socket.data.clientId` / `socket.data.userId` setup — queue entries key off these; `socket.data.userId == null` is the guest check for the ranked queue.
- `server.js:767` (`scheduleSeatRelease`) and the `disconnect` handler — existing disconnect lifecycle; QUEUE-03 removal must hook the same disconnect path so a queued (not-yet-in-room) socket is dropped from the queue.
- `server.js:185` (`GRACE_MS`), `lastActivityAt`/`touchRoom` + the SEC-03 abandoned-room sweep — model for bounded queue cleanup.
- `public/app.jsx` — single React SPA holding all screens, i18n (EN/VI), and the **existing client-side bot AI** reused by the D-09 "play a bot instead" offer. New queue UI + strings land here.

### Project conventions
- `CLAUDE.md` — server-authoritative validation (never trust client-sent state), named error codes, guard-clause early returns, flat module structure, optional features degrade gracefully, EN/VI i18n preserved.
- `.planning/codebase/CONCERNS.md` — #5 `joinRoom`/`placeShips` race, #7 turn-clock race, #8 unbounded room-map growth. Pairing must not introduce a new double-pairing race; queue storage must be bounded/cleaned (QUEUE-03 covers this).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createRoom` room-object construction (`server.js:1264`) — the pairing handler builds an identical room (with the `ranked` flag from the queue type) and seats both players, instead of a host calling `createRoom` with a shared code.
- `joinRoom` second-seat path (`server.js:1290`) — seating logic, `opponentJoined` + `oppProfile` exchange, `roomUpdate` emit — reused to drop the matched opponent in.
- Existing **client-side bot AI** in `public/app.jsx` — directly reused for the D-09 unranked "play a bot instead" fallback; no server room needed.
- `room.recorded` (P3) / `room.resolving` (P1) synchronous-flag-in-critical-section pattern — model for the double-pairing guard.
- P4 `ranked` flag + `ratings` table + `RANKED_REQUIRES_ACCOUNT` — the entire ranked substrate; the queue only decides *who* gets paired and sets the flag.

### Established Patterns
- Server-authoritative + named error codes (`ROOM_NOT_FOUND`, `RANKED_REQUIRES_ACCOUNT`) → new `joinQueue`/`leaveQueue`/`matchFound` events follow the same `cb({ ok, code })` shape.
- Disconnect lifecycle via `socket.on("disconnect")` + `scheduleSeatRelease` — QUEUE-03 hooks here so a queued socket leaves the queue on drop.
- `lastActivityAt` + sweep (SEC-03) — bounded-memory discipline applies to queue entries too.
- Graceful degradation — if queue storage is Redis-backed it must no-op/fallback like `store.js`.

### Integration Points
- New socket handlers (`joinQueue` / `leaveQueue`) alongside `createRoom`/`joinRoom` in the `io.on("connection")` block (`server.js:1253+`).
- Pairing success → auto-create room (createRoom shape) + seat both + emit a `matchFound`/`roomUpdate` that the client routes into the placement screen (instant drop-in, D-10).
- `disconnect` handler — remove from queue (QUEUE-03) and, if mid-pair, re-queue the partner (D-11).
- `public/app.jsx` home screen — two new queue buttons + a wait panel (elapsed timer, search window for ranked, cancel, bot offer); EN/VI strings.

</code_context>

<specifics>
## Specific Ideas

- "Instant play" is the guiding value: instant drop-in to placement on pair (D-10), no accept friction.
- Quiet-server resilience shaped several calls: unbounded widening rather than failure (D-06), rich wait feedback (D-08), and the bot fallback (D-09) all assume the live pool may be near-empty early in the milestone.
- Bot fallback games are explicitly **unranked** and write no match/rating record — they reuse the existing client-side bot with no server room.
- Re-queue the vanished partner's waiter at the **front** of the queue (D-11) to minimize re-wait penalty.

</specifics>

<deferred>
## Deferred Ideas

- Per-mode rating pools / rankable advance mode (MODE-01) — v2. Casual advance stays private-room-only this phase.
- Simultaneous multi-queue membership (casual + ranked at once) — rejected for v1 (D-03); revisit if pool grows.
- Separate provisional matchmaking pool — rejected for v1 (D-07); revisit if established players complain about volatile newbies.
- Accept/ready confirmation step with decline-timeout — rejected for v1 (D-10); revisit if no-show abuse appears.
- Hard queue timeout with "no opponents" message — rejected for v1 (D-06).
- Horizontal scaling / Socket.IO Redis adapter (SCAL-01) — v2; queue may stay in-memory single-process this milestone.
- Friends / direct-challenge invites (SOCL-02) — v2 social phase.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-public-matchmaking*
*Context gathered: 2026-06-03*
