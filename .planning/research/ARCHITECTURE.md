# Architecture Research

**Domain:** Competitive real-time multiplayer browser game — adding persistence, matchmaking, and ranked play to an existing single-process Node/Socket.IO/in-memory-rooms backend
**Researched:** 2026-06-01
**Confidence:** HIGH (existing code fully read; new subsystems verified against official Socket.IO docs, node-postgres docs, Render docs, community patterns)

---

## Context: What Already Exists (Do Not Replace)

The existing system is a mature, working foundation. Every new subsystem must layer on top of it:

- `server.js` — Express + Socket.IO bootstrap, in-memory `rooms` map, all game logic
- `store.js` — optional Redis snapshot (crash recovery only, not per-move)
- `public/app.jsx` — React SPA, 4 screens, bot AI, i18n, Web Audio
- Identity today: `clientId` in `localStorage` (guest, no server-side account)
- Single Render process; no load balancer today

The in-memory `rooms` map remains the authoritative game state for the duration of any active game. Postgres is the durable record of outcomes, not the runtime state.

---

## Target System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (React SPA)                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │  Game UI │  │ Matchmaking  │  │  Auth / OAuth │  │ Profile/Leaderbd │   │
│  │ (exists) │  │ waiting room │  │   flow        │  │ screens (new)    │   │
│  └────┬─────┘  └──────┬───────┘  └──────┬────────┘  └────────┬─────────┘   │
│       │               │                 │                     │             │
└───────┼───────────────┼─────────────────┼─────────────────────┼─────────────┘
        │  Socket.IO    │  Socket.IO       │  HTTP REST          │  HTTP REST
        ↓               ↓                 ↓                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           server.js (single process, Render)                │
│                                                                             │
│  ┌──────────────────────┐  ┌───────────────────┐  ┌───────────────────┐   │
│  │  Game Logic Layer    │  │  Matchmaking      │  │  Auth/REST Layer  │   │
│  │  (exists — rooms map)│  │  Queue (new)      │  │  (new — Express)  │   │
│  │  fire / placeShips   │  │  in-memory Set    │  │  /auth/google     │   │
│  │  doShot / turn clock │  │  periodic tick    │  │  /api/profile     │   │
│  └──────────┬───────────┘  └────────┬──────────┘  └────────┬──────────┘   │
│             │  game-end event        │ pair found            │ queries       │
│             ↓                        ↓                       ↓              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         db.js  (pg Pool wrapper — new)               │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                       │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                    ┌─────────────────┴───────────────────┐
                    │     Render-managed PostgreSQL        │
                    │  accounts / matches / ratings /      │
                    │  replay_events / friends             │
                    └─────────────────────────────────────┘

Optional (Redis — already wired via store.js):
  - Existing crash-recovery snapshot (unchanged)
  - Future: @socket.io/redis-adapter pub/sub if horizontal scaling needed
```

---

## Component Boundaries

| Component | File(s) | Owns | Does NOT own |
|-----------|---------|------|--------------|
| Game Logic | `server.js` (existing) | In-memory rooms, shot resolution, turn clock, scores | Persisting outcomes, ELO, matchmaking |
| Matchmaking Queue | `server.js` or `matchmaking.js` | In-memory queue Set, pairing tick, creating rooms for pairs | Rating calculation, rank updates |
| Auth Layer | `auth.js` + Express routes | Google OAuth flow, JWT issuance, guest→account linking | Game logic, Socket.IO rooms |
| DB Layer | `db.js` + `migrations/` | pg Pool, all SQL queries, schema migrations | Business logic, Socket.IO |
| Presence / Friends | `server.js` extension | Per-socket accountId tracking, online Set, friend notifications | Persistent friend graph (DB owns that) |
| Spectator Fan-out | `server.js` extension | Joining spectators to existing Socket.IO rooms, filtering emits | Game state (rooms map owns that) |
| Replay Capture | `server.js` extension | Appending to in-memory event buffer per room | Flushing to DB (that's a post-game async write) |
| REST API | `server.js` (new Express routes) | Profile reads, leaderboard, stats, friend requests | Real-time events (Socket.IO owns those) |

---

## Recommended File / Folder Structure

```
battleship/
├── server.js              # existing — extend in-place; do not split until needed
├── store.js               # existing — keep for Redis crash-recovery snapshot
├── db.js                  # NEW — pg Pool factory, named query functions
├── auth.js                # NEW — passport + google strategy, JWT helpers, middleware
├── matchmaking.js         # NEW — queue data structure + pairing tick (or inline in server.js)
├── elo.js                 # NEW — pure ELO calculation (no I/O, easy to test)
├── migrations/
│   ├── 001_accounts.sql
│   ├── 002_matches.sql
│   ├── 003_ratings.sql
│   ├── 004_replay_events.sql
│   └── 005_friends.sql
├── public/
│   └── app.jsx            # existing — extend with new screens
└── package.json
```

**Structure rationale:**
- Keep `server.js` as the integration hub — it already wires Express + Socket.IO. New files export functions/middleware that `server.js` calls.
- `db.js` as a single Pool instance prevents connection leaks across modules.
- `elo.js` as a pure function module makes ELO testable without Socket.IO or DB.
- Plain SQL migration files avoid ORM lock-in and are readable by any Postgres tool.

---

## PostgreSQL Schema

```sql
-- accounts: one row per persistent player (guests have no row)
CREATE TABLE accounts (
  id            SERIAL PRIMARY KEY,
  google_id     TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- guest_links: maps localStorage clientId → account for history carry-over
CREATE TABLE guest_links (
  guest_client_id  TEXT PRIMARY KEY,
  account_id       INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  linked_at        TIMESTAMPTZ DEFAULT now()
);

-- ratings: current ELO per player per mode (ranked/casual when added)
CREATE TABLE ratings (
  account_id   INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'ranked',
  elo          INTEGER NOT NULL DEFAULT 1200,
  wins         INTEGER NOT NULL DEFAULT 0,
  losses       INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (account_id, mode)
);

-- matches: one row per completed game (both sides identified)
CREATE TABLE matches (
  id              SERIAL PRIMARY KEY,
  room_code       TEXT NOT NULL,
  mode            TEXT NOT NULL,         -- 'classic' | 'advance' | 'ranked'
  winner_id       INTEGER REFERENCES accounts(id),
  loser_id        INTEGER REFERENCES accounts(id),
  winner_guest    TEXT,                  -- clientId if guest (no account)
  loser_guest     TEXT,
  winner_elo_before INTEGER,
  loser_elo_before  INTEGER,
  winner_elo_after  INTEGER,
  loser_elo_after   INTEGER,
  end_reason      TEXT,                  -- 'win' | 'timeout' | 'forfeit'
  duration_sec    INTEGER,
  played_at       TIMESTAMPTZ DEFAULT now()
);

-- replay_events: append-only event log per room (captured during play)
CREATE TABLE replay_events (
  id          BIGSERIAL PRIMARY KEY,
  match_id    INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,          -- monotonic counter within match
  event_type  TEXT NOT NULL,             -- 'fire' | 'ability' | 'turnSkip' | 'gameOver'
  actor       TEXT NOT NULL,             -- clientId or accountId
  payload     JSONB NOT NULL,
  ts          BIGINT NOT NULL            -- Date.now() at event time
);

-- friends: directed graph; pair (a,b) stored as two rows for easy query
CREATE TABLE friends (
  account_id  INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  friend_id   INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted'
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (account_id, friend_id)
);

-- Indexes for hot paths
CREATE INDEX ON ratings (mode, elo DESC);       -- leaderboard queries
CREATE INDEX ON matches (winner_id, played_at); -- profile history
CREATE INDEX ON matches (loser_id, played_at);
CREATE INDEX ON replay_events (match_id, seq);  -- replay read
```

---

## Architectural Patterns

### Pattern 1: Game-End Hook in `doShot` / `endGameForfeit`

**What:** When a game ends (win or forfeit), the existing `doShot` / `endGameForfeit` functions already emit `gameOver`. Add a single `await onGameEnd(room, winnerId, loserId, reason)` call there. `onGameEnd` handles all async persistence without blocking the socket response.

**When to use:** Any time a durable side-effect must happen on game end (ELO, match record, replay flush).

**Trade-offs:** Simple — one injection point. Risk of failure is contained; if the DB write fails, the game result is still delivered to clients (fire-and-forget with error logging is acceptable here).

```javascript
// In server.js — extend existing endGameForfeit / win branch in doShot:
async function onGameEnd(room, winnerId, loserId, reason) {
  try {
    const winnerAccountId = await resolveAccountId(winnerId);   // null if guest
    const loserAccountId  = await resolveAccountId(loserId);

    // 1. Flush replay buffer
    const matchId = await db.insertMatch({
      roomCode: room.code, mode: room.mode,
      winnerId: winnerAccountId, loserId: loserAccountId,
      winnerGuest: winnerAccountId ? null : winnerId,
      loserGuest:  loserAccountId  ? null : loserId,
      reason, durationSec: room.startedAt ? Math.floor((Date.now() - room.startedAt) / 1000) : null,
    });
    await db.insertReplayEvents(matchId, room.replayBuffer || []);

    // 2. ELO update (only if both players have accounts + mode is ranked)
    if (winnerAccountId && loserAccountId && room.mode === 'ranked') {
      const { newWinner, newLoser } = elo.compute(
        await db.getElo(winnerAccountId), await db.getElo(loserAccountId)
      );
      await db.updateElos(winnerAccountId, loserAccountId, newWinner, newLoser, matchId);
    }

    room.replayBuffer = [];  // free memory
  } catch (err) {
    console.error('[onGameEnd] persistence failed:', err.message);
  }
}
```

### Pattern 2: In-Memory Matchmaking Queue with Periodic Pairing Tick

**What:** A simple `Set` (or priority queue for skill-based matching) of waiting sockets. A `setInterval` tick every 1–2 seconds scans the queue and pairs compatible players by creating a room (reusing existing `createRoom` logic) and notifying both sockets.

**When to use:** Phase 1 of matchmaking — FIFO or ±200 ELO window pairing. No external service needed while single-process.

**Trade-offs:** Works perfectly in a single process. When horizontal scaling is introduced, the queue must move to Redis (a Redis list + Lua script or a pub/sub). Design the queue as a small isolated module so the backing store can be swapped.

```javascript
// matchmaking.js
const queue = new Map(); // socketId → { socket, clientId, accountId, elo, joinedAt }

function enqueue(socket, meta) {
  queue.set(socket.id, { socket, ...meta, joinedAt: Date.now() });
}

function dequeue(socketId) {
  queue.delete(socketId);
}

// Called by setInterval every 1500ms in server.js
function tick(onPaired) {
  const waiting = [...queue.values()];
  const paired = new Set();
  for (let i = 0; i < waiting.length; i++) {
    if (paired.has(waiting[i].socket.id)) continue;
    for (let j = i + 1; j < waiting.length; j++) {
      if (paired.has(waiting[j].socket.id)) continue;
      if (isCompatible(waiting[i], waiting[j])) {
        paired.add(waiting[i].socket.id);
        paired.add(waiting[j].socket.id);
        queue.delete(waiting[i].socket.id);
        queue.delete(waiting[j].socket.id);
        onPaired(waiting[i], waiting[j]);
        break;
      }
    }
  }
}

function isCompatible(a, b) {
  const eloWindow = 200 + Math.floor((Date.now() - Math.min(a.joinedAt, b.joinedAt)) / 5000) * 50;
  return Math.abs((a.elo || 1200) - (b.elo || 1200)) <= eloWindow;
}
```

### Pattern 3: Spectator Fan-out via Socket.IO Room Membership

**What:** Spectators `socket.join(roomCode)` the same Socket.IO room as players. All existing `io.to(code).emit(...)` broadcasts reach spectators automatically. Per-socket `socket.data.role = 'spectator'` prevents spectators from emitting game events.

**When to use:** As soon as spectating is implemented — no infrastructure change needed.

**Trade-offs:** Zero overhead on the broadcast path. Spectators receive events players also receive (including private `emitToClient` calls — those target specific sockets and already exclude spectators). The only risk is accidentally leaking private state (e.g., ship positions). Use a separate `spectatorSync` payload that omits hidden ship positions.

```javascript
// server.js — new 'spectate' event handler
socket.on('spectate', (arg, cb) => {
  const code = (arg?.code || '').toUpperCase().trim();
  const room = rooms[code];
  if (!room || !room.started) return cb?.({ ok: false, code: 'NO_ACTIVE_GAME' });
  socket.data.role = 'spectator';
  socket.data.code = code;
  socket.join(code);
  // Send safe view: shot history only, no hidden ship occ
  cb?.({ ok: true, state: spectatorPayload(room, code) });
});

// Guard all game-action handlers with role check:
socket.on('fire', ({ r, c, power }, cb) => {
  if (socket.data.role === 'spectator') return cb?.({ ok: false, code: 'SPECTATOR' });
  // ... existing logic
});
```

### Pattern 4: Append-Only Replay Buffer Flushed on Game End

**What:** During a game, each significant event (`fire`, `useAbility`, `turnSkip`, `gameOver`) is appended to `room.replayBuffer = []` as a lightweight `{ seq, type, actor, payload, ts }` object. On game end, `onGameEnd` batch-inserts the entire buffer into `replay_events`. No per-move DB writes on the hot path.

**When to use:** Always — replay capture is cost-free during play.

**Trade-offs:** If the server crashes between game-end and the DB flush, the replay is lost (the match outcome write is the only critical record). Replays are a bonus feature; losing one on a crash is acceptable. The in-memory buffer is O(turns) — roughly 20-80 entries per game, negligible size.

```javascript
// Append in doShot (hot path — synchronous, no await):
room.replayBuffer = room.replayBuffer || [];
room.replayBuffer.push({
  seq: room.replayBuffer.length,
  event_type: 'fire',
  actor: clientId,
  payload: { r, c, power, results, win },
  ts: Date.now(),
});
```

### Pattern 5: Presence Tracking via Socket Metadata + Online Set

**What:** On `connection`, if the socket carries a valid JWT, extract `accountId` and store it in `socket.data.accountId`. Maintain a server-level `Map<accountId, Set<socketId>>` for multi-tab support. On `disconnect`, remove from the map and broadcast `presence` updates to affected friends (query friend list from DB once at connect, cache on socket).

**When to use:** When friends list lands.

**Trade-offs:** In a single process this is trivial. In multi-process it requires the presence map to live in Redis. Use the same Redis client already wired in `store.js`. Emit presence updates only to friends of the departing/arriving player — not globally.

---

## Data Flow Diagrams

### Game-End → ELO → Match Record

```
doShot() detects win
  │
  ├── emit gameOver to both players (synchronous, immediate)
  │
  └── onGameEnd(room, winnerId, loserId) [async, non-blocking]
        │
        ├── resolveAccountId(winnerId), resolveAccountId(loserId)
        │     └── db: SELECT account_id FROM guest_links WHERE guest_client_id = $1
        │
        ├── db.insertMatch(...)  → returns matchId
        │
        ├── db.insertReplayEvents(matchId, room.replayBuffer)
        │
        └── if both have accounts AND mode === 'ranked':
              db.getElo(winnerAccountId), db.getElo(loserAccountId)
              elo.compute(winnerElo, loserElo) → { newWinner, newLoser }
              db.updateElos(...)     [UPDATE ratings + UPDATE matches ELO cols]
              emit 'eloUpdate' to both sockets if still connected
```

### Matchmaking Queue → Room Creation

```
Client emits 'joinQueue' { clientId, mode }
  │
  server.js: extract accountId from JWT (or null for guest)
  │
  matchmaking.enqueue(socket, { clientId, accountId, elo })
  emit 'queueJoined' { position }
  │
  [every 1500ms — matchmaking.tick()]
  │
  compatible pair found (|eloA - eloB| <= window)
  │
  ├── rooms[newCode] = { ... }    // same room creation as createRoom
  ├── socket A joins room, receives 'matchFound' { code }
  └── socket B joins room, receives 'matchFound' { code }
        │
        both clients auto-navigate to ship placement screen
```

### Google OAuth → JWT → Guest Link

```
Browser: GET /auth/google
  → passport redirect to Google consent screen
  → GET /auth/google/callback?code=...
  → passport verifyCallback: accounts.findOrCreate({ google_id })
  │
  ├── if request carries existing clientId cookie:
  │     INSERT INTO guest_links (guest_client_id, account_id)
  │     ON CONFLICT DO NOTHING   // link historical guest games
  │
  └── sign JWT { accountId, displayName, avatarUrl }
        → set httpOnly cookie OR return token to SPA
        → redirect to /  (existing game lobby)
```

### Spectator Fan-out

```
Spectator emits 'spectate' { code }
  │
  server.js: socket.data.role = 'spectator'; socket.join(code)
  send spectatorPayload (shot history, no hidden ship positions)
  │
[During active game — no change to existing emit paths]
  io.to(code).emit('incoming', ...) → reaches players AND spectators
  io.to(code).emit('turnUpdate', ...) → reaches players AND spectators
  emitToClient(room, clientId, 'sync', ...) → targets specific socket, spectators unaffected
```

---

## Build Order (Dependency Chain)

The constraints are hard: each phase unblocks the next.

```
Phase 1 — Persistence Foundation
  db.js + schema migrations (accounts, ratings, matches, replay_events, friends)
  REASON: everything else writes to Postgres; nothing else can be built without it

Phase 2 — Auth (Google OAuth + JWT + guest linking)
  REASON: ELO, ranked mode, profiles, friends all require account identity
  DEPENDS ON: Phase 1 (accounts table)

Phase 3 — Match Recording + Replay Capture
  onGameEnd hook, replayBuffer, db.insertMatch, db.insertReplayEvents
  REASON: must record outcomes before ELO makes sense historically
  DEPENDS ON: Phase 1

Phase 4 — ELO + Ranked Mode
  elo.js, db.updateElos, ranked room flag, leaderboard REST endpoint
  REASON: requires match history and accounts; leaderboard is a read on ratings table
  DEPENDS ON: Phase 1 + 2 + 3

Phase 5 — Matchmaking Queue
  matchmaking.js, 'joinQueue'/'leaveQueue' socket events, pairing tick
  REASON: ranked matchmaking requires ELO to pair fairly; casual quick-match can come earlier
  DEPENDS ON: Phase 1 + 2 (accounts + ELO); casual subset can ship after Phase 1

Phase 6 — Presence + Friends
  presence Map, friend graph queries, 'friendOnline'/'friendOffline' events
  DEPENDS ON: Phase 2 (accounts) + Phase 1 (friends table)

Phase 7 — Spectator Mode
  'spectate' event, spectatorPayload, role guard
  DEPENDS ON: nothing new — pure Socket.IO; can ship anytime after Phase 3 provides match IDs

Phase 8 — Horizontal Scaling (defer until load justifies)
  @socket.io/redis-adapter, sticky sessions, matchmaking queue in Redis
  DEPENDS ON: all above phases; defer until concurrent user count demands it
```

---

## Scaling Considerations

| Scale | Approach | Notes |
|-------|----------|-------|
| Single process (current) | In-memory rooms + in-memory matchmaking queue | Covers Render free tier; enough for initial public launch |
| Node cluster (same machine) | `@socket.io/sticky` for intra-process sticky + `@socket.io/redis-adapter` for cross-process broadcasts | Redis already half-wired via store.js; add pub/sub clients |
| Multiple Render instances | Redis adapter + Render sticky sessions via cookie (Render supports this) | Matchmaking queue must move to Redis list + atomic pop; one queue worker or leader election |
| >10k concurrent | PgBouncer in front of Postgres (Render supports PgBouncer as a private service) | pg.Pool of 10–20 connections is fine up to this scale |

**Defer scaling work until:**
- Concurrent active games exceed ~500 (memory ceiling at ~50MB per 1k rooms)
- Redis adapter becomes necessary (multi-instance deployment)

**WebSocket-only mode eliminates sticky session complexity.** Socket.IO defaults to HTTP long-polling first, then upgrades. Setting `transports: ['websocket']` on the client skips polling and removes the sticky session requirement for the Redis adapter scenario. This is the recommended path if horizontal scaling lands.

---

## Anti-Patterns

### Anti-Pattern 1: Writing to Postgres on Every Shot (Hot-Path DB Writes)

**What people do:** Call `db.query(INSERT INTO shots ...)` inside `doShot()` on every fire event.
**Why it's wrong:** Adds 5–30ms async latency to the turn hot path. Under load, PG connection waits stack up. The in-memory rooms map is already the authoritative state; DB writes on the hot path add risk with no benefit.
**Do this instead:** Append to `room.replayBuffer` in-memory (synchronous, ~1µs). Flush the entire buffer to `replay_events` in one batch INSERT in `onGameEnd` (async, off the hot path).

### Anti-Pattern 2: Sharing the Same Redis Client for Snapshot and Socket.IO Adapter

**What people do:** Pass the existing `store.js` Redis client to `createAdapter(pubClient, subClient)`.
**Why it's wrong:** The Socket.IO adapter requires two separate clients (one pub, one sub) because a subscribed Redis client cannot issue regular commands. Mixing them causes command errors.
**Do this instead:** Create two new Redis client instances for the adapter, separate from the `store.js` client used for snapshots.

### Anti-Pattern 3: Storing Active Game State in Postgres

**What people do:** Mirror the in-memory `rooms` map to Postgres rows after each move for "real persistence."
**Why it's wrong:** The existing Redis snapshot already covers crash recovery. Postgres is ill-suited for sub-second mutable state. This duplicates state and creates consistency hazards.
**Do this instead:** Keep Postgres as the record of outcomes (matches, ratings). Keep Redis as the crash-recovery snapshot. Keep in-memory as the live runtime.

### Anti-Pattern 4: ELO Update Inside the Socket.IO Event Handler (Blocking Callback)

**What people do:** `await db.updateElos(...)` inside the `fire` callback before calling `cb({ ok: true })`.
**Why it's wrong:** Holds the Socket.IO callback open until all DB round-trips complete. Delays the game-over event delivery to clients. Under DB load, the game appears to freeze.
**Do this instead:** Call `cb(result)` immediately with game outcome, then `onGameEnd(...)` runs async without blocking the callback.

### Anti-Pattern 5: Spectators Receiving Hidden Ship Positions

**What people do:** Send spectators the same `syncPayload` that players receive (which includes `occ` — the player's own ship positions).
**Why it's wrong:** Spectators see both players' ship positions, destroying the information asymmetry that makes Battleship work. Leaking to a cheating player is trivial (open another tab, spectate, map positions).
**Do this instead:** `spectatorPayload(room, code)` returns only shot history (`myShots`, `incoming`, `sunkCells`) — the same information visible on the public boards — and explicitly omits all `occ` and `ships` fields.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Render Postgres | `pg.Pool` in `db.js`, `DATABASE_URL` env var | Pool size 10 is safe for single-process; Render free tier has ~97 connection limit |
| Google OAuth | `passport-google-oauth20` + `express-session` or signed JWT cookie | Session store must be Redis or Postgres if multi-process; JWT cookie is simpler for single-process |
| Redis (existing, via store.js) | Already wired; extend with adapter pub/sub when scaling | Don't reuse the existing client for adapter (see anti-pattern 2 above) |
| Redis (matchmaking queue, future) | Atomic `RPUSH` / `BLPOP` on a `mq:ranked` key | Needed only when multi-process; skip for Phase 5 |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `server.js` ↔ `db.js` | Direct function calls (same process) | `db.js` exports named async functions; no ORM abstraction needed |
| `server.js` ↔ `matchmaking.js` | Direct function calls + `onPaired` callback | Matchmaking is synchronous queue ops; DB calls go through `db.js` directly |
| `server.js` ↔ `elo.js` | Direct function calls | Pure computation; inputs/outputs are plain numbers |
| `server.js` ↔ `auth.js` | Express middleware (`requireAuth`, `optionalAuth`) + Socket.IO handshake middleware | `io.use(authMiddleware)` extracts JWT from `socket.handshake.auth.token` |
| Game logic ↔ Persistence | Only via `onGameEnd` hook | No other cross-boundary writes during active play |

---

## Sources

- Socket.IO official docs: [Using multiple nodes / sticky sessions](https://socket.io/docs/v4/using-multiple-nodes/)
- Socket.IO official docs: [Redis adapter](https://socket.io/docs/v4/redis-adapter/)
- Socket.IO official docs: [Rooms and broadcasting](https://socket.io/docs/v4/rooms/)
- node-postgres official docs: [Connection pooling](https://node-postgres.com/features/pooling)
- Render docs: [PostgreSQL connection pooling / PgBouncer](https://render.com/docs/postgresql-connection-pooling)
- ELO algorithm: [elo-rating npm](https://www.npmjs.com/package/elo-rating); formula: `E = 1 / (1 + 10^((opp-self)/400))`, `newElo = oldElo + K*(score - E)`
- node-pg-migrate: [salsita/node-pg-migrate](https://github.com/salsita/node-pg-migrate) — recommended for Postgres-specific migrations
- Event sourcing for replay: [RisingStack event sourcing](https://blog.risingstack.com/event-sourcing-with-examples-node-js-at-scale/) — append-only log pattern
- Matchmaking pattern: [Codementor Socket.IO matchmaking](https://www.codementor.io/@codementorteam/socketio-multi-user-app-matchmaking-game-server-2-uexmnux4p); elo-window widening over wait time

---

*Architecture research for: Battleship Online — persistence, matchmaking, ranked, spectating milestone*
*Researched: 2026-06-01*
