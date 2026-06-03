# Phase 5: Public Matchmaking — Research

**Researched:** 2026-06-03
**Domain:** Socket.IO server-side queue, ELO-window pairing, React wait UX, Node.js single-threaded race guard
**Confidence:** HIGH (all findings verified against the live codebase; no external libraries added)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Two separate queues — casual "Quick Match" and "Ranked". Player explicitly picks one.
- **D-02:** Casual quick-match is classic-only. Advance mode stays private-room-only.
- **D-03:** One queue at a time per player — joining a queue is exclusive; switching leaves the other.
- **D-04:** Pairing is by Glicko-2 `rating` from the existing P4 `ratings` table. Ranked requires signed-in (reuse P4 gate).
- **D-05:** Stepped widening — narrow ELO window, widen in discrete steps on a recheck timer. Exact constants are Claude discretion.
- **D-06:** No dead end — widen to unbounded after cap, keep player queued indefinitely until a match or cancel.
- **D-07:** Provisional players (RD >= 110) match in the same ranked queue with a wider starting window. No separate provisional pool.
- **D-08:** Rich wait status — elapsed timer, "searching…" state, cancel button; ranked surfaces current search window.
- **D-09:** Alone-too-long → keep waiting + offer a bot. Bot game is unranked, writes no match/rating. Exact delay is Claude discretion.
- **D-10:** Instant drop-in — no accept step. Server auto-creates room (createRoom shape + ranked flag) and drops both players into ship placement.
- **D-11:** Auto re-queue the waiter at the front if partner vanishes before game starts.
- **D-12:** Queue-entry removal triggers: socket disconnect, explicit Cancel, and leaving/navigating away from queue screen.

### Claude's Discretion
- Exact ELO window constants (starting width, step size, step interval, cap, provisional wider start).
- "Alone-too-long" delay before bot prompt appears (D-09).
- Queue state storage — in-memory (recommended per SCAL-01 v2 deferral) or Redis-backed.
- Pairing-loop mechanism (check-on-enqueue vs periodic sweep) and double-pairing race guard.
- Socket event and named-error-code names (e.g. `joinQueue`/`leaveQueue`/`matchFound`).
- Exact lobby/home-screen UI shape for two queue buttons and wait panel (EN/VI required).

### Deferred Ideas (OUT OF SCOPE)
- Per-mode rating pools / rankable advance mode (MODE-01).
- Simultaneous multi-queue membership.
- Separate provisional matchmaking pool.
- Accept/ready confirmation step with decline-timeout.
- Hard queue timeout with "no opponents" message.
- Horizontal scaling / Socket.IO Redis adapter (SCAL-01).
- Friends / direct-challenge invites (SOCL-02).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUEUE-01 | A player can join a public quick-match queue and be paired with another online player without a room code | Queue data structure, pairing loop, match handoff via createRoom shape, `joinQueue`/`matchFound` event design |
| QUEUE-02 | Ranked matchmaking pairs players within an ELO window that widens the longer they wait | Glicko-2 rating read from `ratings` table, stepped-widening algorithm, provisional wider-start, recommended constants |
| QUEUE-03 | A player's queue entry is removed when they disconnect or leave the queue | Disconnect hook in existing `socket.on("disconnect")` handler, explicit cancel socket event, navigating-away cleanup |
</phase_requirements>

---

## Summary

Phase 5 adds a thin matchmaking layer **in front of** the existing room/game flow. No new external libraries are needed — everything builds on the in-memory `rooms` map pattern, the existing `createRoom`/`joinRoom` code path, the `socket.data.userId` session identity, and the P4 `ratings` table already in Postgres.

The core server addition is a module-level `queues` object (`{ casual: Map, ranked: Map }`) mirroring the `rooms` map pattern. A `tryPair` function runs synchronously at enqueue-time (check-on-enqueue) and also on a short periodic sweep timer. The double-pairing race guard is a synchronous boolean flag on each entry (`entry.pairing = true`) set before any `await`, mirroring `room.resolving`/`room.recorded`. On pair, the server calls the internal `createRoom` shape inline, seats both sockets, emits `matchFound` + `roomUpdate`, and the client routes straight to ship placement.

The React client adds a new `queue` screen (screen value `"queue"`) with elapsed timer, cancel button, ranked widening-window display (D-08), and a delayed bot-offer prompt (D-09). All new strings go into both `I18N.en` and `I18N.vi` blocks.

**Primary recommendation:** In-memory queue, check-on-enqueue + 5-second sweep timer, named events `joinQueue`/`leaveQueue`/`matchFound`. No new npm packages.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Queue storage & pairing logic | API / Backend (server.js) | — | Server-authoritative; pairing must be in one process; in-memory mirrors rooms map |
| Guest gate for ranked queue | API / Backend (server.js) | Browser (client hint) | Defense in depth; reuses existing RANKED_REQUIRES_ACCOUNT pattern |
| Glicko-2 rating read for pairing | API / Backend (db.js) | — | Ratings live in Postgres; same SELECT pattern as recordMatch |
| Room auto-creation on pair | API / Backend (server.js) | — | Reuses createRoom code path with ranked flag |
| Queue cleanup on disconnect | API / Backend (server.js) | — | socket.on("disconnect") hook is server-side |
| Wait UX (timer, cancel, bot offer) | Browser / Client (app.jsx) | — | Pure UI state; no server round-trips for display |
| EN/VI queue strings | Browser / Client (app.jsx) | — | I18N object in app.jsx |
| ELO window widening display | Browser / Client (app.jsx) | — | Server sends current window width with periodic update event |

---

## Standard Stack

### Core (no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Socket.IO (server) | ^4.7.5 (already installed) | `joinQueue`/`leaveQueue`/`matchFound` events | Already the project's real-time transport |
| Express.js | ^4.19.2 (already installed) | No new HTTP routes needed for queue | Already the HTTP server |
| React 18 | ^18.2.0 (already installed) | Queue wait screen, timer state | Already the client SPA framework |

**No new npm packages are needed for this phase.** [VERIFIED: codebase read]

### Supporting (existing codebase patterns reused)
| Asset | Location | Purpose |
|-------|----------|---------|
| `pool` from `db.js` | `db.js` module export | Read ratings for ranked pairing |
| `rooms` map | `server.js` module-level | Model for `queues` map structure |
| `createRoom` inline logic | `server.js:1264` | Auto-create room on pair |
| `joinRoom` second-seat path | `server.js:1290–1348` | Seat second player, emit `opponentJoined`/`oppProfile` |
| `scheduleSeatRelease` | `server.js:767` | Existing disconnect lifecycle |
| `room.resolving` pattern | `server.js:1469` | Model for `entry.pairing` race guard |
| `room.recorded` pattern | `server.js:790` | Model for dedup synchronous flag |
| Client-side bot AI | `public/app.jsx` `startBot()` | D-09 unranked bot fallback |
| `I18N` object | `public/app.jsx:19` | Add queue strings to both `en` and `vi` |
| Vitest | ^4.1.8 (already installed) | Unit tests for queue logic |

**Installation:** None required.

---

## Package Legitimacy Audit

> No external packages are added in this phase. All functionality is implemented using existing project dependencies (Socket.IO, Express, React, pg, Vitest).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Client (app.jsx)                    Server (server.js)              Database (Postgres)
     │                                      │                              │
     │── joinQueue({type,profile}) ────────>│                              │
     │                                      │ [if ranked] SELECT rating,   │
     │                                      │   rd FROM ratings WHERE      │
     │                                      │   user_id = $1 ─────────────>│
     │                                      │<─────────────────────────────│
     │                                      │                              │
     │                                      │ queues[type].set(clientId,   │
     │                                      │   { socket, userId, rating,  │
     │                                      │     rd, enqueuedAt,          │
     │                                      │     pairing:false })         │
     │                                      │                              │
     │                                      │ tryPair(type)  ◄──── also    │
     │                                      │   [sync: set entry.pairing=  │
     │                                      │    true before any await]    │
     │                                      │                              │
     │<── matchFound({code,ranked}) ────────│  (if pair found)             │
     │<── roomUpdate({...}) ────────────────│  auto-createRoom shape       │
     │                                      │  seat both via joinRoom path  │
     │                                      │  emit opponentJoined/oppProf  │
     │                                      │                              │
[screen → "placement"]                      │                              │
     │                                      │                              │
     │── leaveQueue() ────────────────────>│ queues[type].delete(clientId)│
     │                                      │                              │
     │── disconnect ──────────────────────>│ queues[type].delete(clientId)│
     │                                      │  if partner paired+not       │
     │                                      │  started → re-enqueue waiter  │
```

### Recommended Project Structure

No new directories needed. All additions are in existing files:

```
server.js        — queues map, tryPair(), joinQueue/leaveQueue handlers,
                   disconnect hook extension, periodic sweep setInterval
db.js            — getPlayerRating(userId) helper (SELECT from ratings)
public/app.jsx   — queue screen, QueueWaitPanel component, I18N strings
test/
└── queue.test.js  — unit tests: pairing logic, race guard, cleanup
```

---

### Pattern 1: In-Memory Queue Map (mirrors `rooms` map)

**What:** A module-level `queues` object with two `Map` instances, one per queue type. Each entry is a plain object keyed by `clientId`.

**When to use:** Enqueue, dequeue, pairing lookup. All synchronous reads/writes.

**Recommended structure:**

```javascript
// Source: mirrors server.js rooms map at line 1275
// Module-level — never per-request
const queues = {
  casual: new Map(), // clientId → QueueEntry
  ranked: new Map(), // clientId → QueueEntry
};

// QueueEntry shape
// {
//   socket,        // the live Socket.IO socket
//   clientId,      // string (localStorage id)
//   userId,        // integer | null (null = guest; ranked only allows non-null)
//   rating,        // number (ranked only; casual = 1500 default)
//   rd,            // number (ranked only; casual = 350 default)
//   enqueuedAt,    // Date.now() — for window widening + bot-offer timer
//   pairing,       // boolean — synchronous race guard (set true before await)
// }
```

**Why Map over plain object:** Iteration order is insertion order (predictable for front-of-queue re-insertion D-11); `Map.delete` is O(1); `Map.size` is O(1) for sweep decisions.

---

### Pattern 2: Check-on-Enqueue + Periodic Sweep (recommended mechanism)

**What:** `tryPair(type)` is called immediately after every enqueue, and also by a `setInterval` sweep. The immediate call handles the common case (two players enqueue near-simultaneously); the sweep handles stepped window widening (D-05).

**When to use:** Every `joinQueue` handler and every sweep tick.

```javascript
// Source: derived from rooms sweep pattern (server.js:1094, CLEANUP_INTERVAL_MS)
const QUEUE_SWEEP_MS = 5000; // sweep every 5s — matches step interval for window widening

// Called synchronously at enqueue AND on sweep timer
function tryPairAll() {
  tryPair("casual");
  tryPair("ranked");
}
setInterval(tryPairAll, QUEUE_SWEEP_MS).unref();
```

**Why check-on-enqueue, not sweep-only:** On an active server, two players arriving within the same sweep window would wait up to QUEUE_SWEEP_MS unnecessarily. The immediate call eliminates this latency at zero cost.

**Why not continuous per-second widening:** D-05 explicitly prefers stepped widening on a recheck timer. Continuous widening requires per-player sub-second timers, which scale poorly and add complexity for marginal UX improvement.

---

### Pattern 3: Double-Pairing Race Guard (synchronous flag, no await before check)

**What:** A synchronous boolean `entry.pairing` is set to `true` before any `await` in `tryPair`. This mirrors `room.resolving` (line 1469) and `room.recorded` (line 790).

**Why it works in Node.js:** Node.js is single-threaded. Between synchronous operations there is no interleaving. The only yield points are `await` boundaries. Setting `entry.pairing = true` synchronously, before any `await`, means no other handler can observe `pairing === false` for this entry while the async pairing is in flight.

**Yield points in pairing flow** (where interleaving could occur without the guard):
1. `await getPlayerRating(userId)` — Postgres read for ranked pairing
2. `await pool.query(...)` — any other async DB call
3. Implicit: `socket.emit()` does not yield but triggers client-side processing

**Implementation pattern:**

```javascript
// Source: mirrors room.resolving pattern at server.js:1469
function tryPair(type) {
  const q = queues[type];
  if (q.size < 2) return;
  const entries = [...q.values()].filter(e => !e.pairing);
  // find a match (casual: any two; ranked: within window)
  const pair = findPair(type, entries);
  if (!pair) return;
  const [a, b] = pair;
  // SYNCHRONOUS guard — set before any await so no re-entry can pick these entries
  a.pairing = true;
  b.pairing = true;
  // Remove from queue immediately (synchronous, before async room creation)
  q.delete(a.clientId);
  q.delete(b.clientId);
  // Now safe to await
  createMatchedRoom(a, b, type).catch((err) => {
    console.error("[queue] pair failed, re-enqueuing:", err.message);
    // If room creation fails, put both back (without pairing flag)
    a.pairing = false;
    b.pairing = false;
    q.set(a.clientId, a);
    q.set(b.clientId, b);
  });
}
```

**Key insight:** Delete from queue synchronously before the first `await`. This prevents the sweep timer from re-selecting the same entries during the async room creation window. The `pairing` flag on entries already-removed from the map is belt-and-suspenders (for the error re-enqueue path).

---

### Pattern 4: Stepped ELO Window (recommended constants)

**What:** The window starts at ±W0, widens by +W_STEP every STEP_INTERVAL_MS up to a cap, then becomes unbounded (effective ±∞).

**Recommended constants (Claude discretion, per D-05/D-06/D-07):**

```javascript
// Source: [ASSUMED] — tuned to Glicko-2 model and expected small pool size
const RANKED_WINDOW_START  = 150;   // ±150 rating points at enqueue
const RANKED_WINDOW_STEP   = 100;   // widen by 100 per step
const RANKED_WINDOW_CAP    = 500;   // cap at ±500 before going unbounded
const RANKED_STEP_MS       = 10000; // step every 10s (matches sweep cadence * 2)
const RANKED_PROVISIONAL_START = 300; // wider start for RD >= 110 players (D-07)
```

**Rationale:**
- `±150` start: tight enough to protect established ratings; loose enough that a 1500-rated player can match a 1550 opponent immediately.
- `+100/10s`: at step cap after ~35 seconds of waiting — fast enough to feel responsive on a quiet server.
- `±500` cap before unbounded: covers 99% of the plausible rating spread at launch; effectively unbounded after ~35s.
- `±300` provisional start: high RD means the rating is uncertain by ~300 points anyway, so ±300 is the honest window.

**Window calculation (pure, no await):**

```javascript
function rankedWindow(entry) {
  const isProvisional = entry.rd >= 110; // P4 D-08 provisional threshold
  const base = isProvisional ? RANKED_PROVISIONAL_START : RANKED_WINDOW_START;
  const elapsed = Date.now() - entry.enqueuedAt;
  const steps = Math.floor(elapsed / RANKED_STEP_MS);
  const windowWidth = base + steps * RANKED_WINDOW_STEP;
  const cap = RANKED_WINDOW_CAP;
  return windowWidth >= cap ? Infinity : windowWidth;
}
```

---

### Pattern 5: Glicko-2 Rating Read for Pairing

**What:** For ranked queue entries, read `rating` and `rd` from the `ratings` table at enqueue time. This is a single `SELECT` — no transaction needed, no write.

**Existing pattern (from db.js:491–495):**

```javascript
// Source: db.js:491-495 (verified against live codebase)
// Reuse the same SELECT pattern used in recordMatch
const { rows } = await pool.query(
  "SELECT rating, rd FROM ratings WHERE user_id = $1",
  [userId]
);
const DEFAULT = { rating: 1500, rd: 350 };
const ratingData = rows.length > 0 ? rows[0] : DEFAULT;
```

**New helper to add in db.js:**

```javascript
// getPlayerRating: read rating+rd for matchmaking (no transaction, no write)
// Returns { rating, rd } — defaults to 1500/350 if no row (new player)
async function getPlayerRating(userId) {
  if (!userId) return { rating: 1500, rd: 350 };
  const { rows } = await pool.query(
    "SELECT rating, rd FROM ratings WHERE user_id = $1",
    [userId]
  );
  return rows.length > 0 ? { rating: rows[0].rating, rd: rows[0].rd } : { rating: 1500, rd: 350 };
}
```

**Caching note:** Rating is read once at enqueue time and stored in the queue entry. It is NOT re-read on each sweep tick. This is correct: ratings change only when a game completes, not during the queue wait. For MVP with a small pool, stale-by-one-game is acceptable. [ASSUMED]

---

### Pattern 6: Match Handoff — Auto-Create Room and Seat Both Players

**What:** On a successful pair, the server creates a room using the exact `rooms[code] = {...}` shape from `createRoom` (line 1275), seats both players using the `room.players[clientId] = {...}` shape from `joinRoom` (lines 1330–1334), then emits the same events `joinRoom` emits.

**Exact room object shape (from server.js:1275):** [VERIFIED: codebase read]

```javascript
// Source: server.js:1275
const code = newCode();
rooms[code] = {
  code,
  players: {},
  order: [],
  started: false,
  turn: null,
  scores: {},
  lastStarter: null,
  mode: "classic",        // always classic for matched rooms (D-01/D-02)
  ranked: type === "ranked",  // set from queue type
  powerups: {},
  turnTimer: null,
  turnDeadline: null,
  resolving: false,
  lastActivityAt: Date.now(),
  // room.recorded not set here — defaults to undefined (falsy), same as createRoom
};
```

**Exact player seat shape (from server.js:1330–1334):** [VERIFIED: codebase read]

```javascript
// Source: server.js:1330-1334
rooms[code].players[clientId] = {
  sid: socket.id,
  ready: false,
  occ: null,
  hits: new Set(),
  online: true,
  timer: null,
  inv: newInv(),
  bonus: 0,
  profile: sanitizeProfile(entry.profile),
  userId: entry.userId ?? null,
};
rooms[code].order.push(clientId);
socket.join(code);
socket.data.code = code;
socket.data.clientId = clientId;
```

**Emits after seating both players (mirrors joinRoom lines 1339–1347):** [VERIFIED: codebase read]

```javascript
// Source: server.js:1339-1347 (joinRoom second-seat emits)
// Emit to both players in the new room
io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
io.to(code).emit("opponentJoined");           // triggers placement screen on client
upsertGuestCredential(clientId);              // fire-and-forget identity persistence

// Exchange profiles (both directions)
socketA.emit("oppProfile", entry_b.profile || null);
socketB.emit("oppProfile", entry_a.profile || null);

// NEW: tell both clients they were matched (carries roomCode for client state)
socketA.emit("matchFound", { code, ranked: type === "ranked" });
socketB.emit("matchFound", { code, ranked: type === "ranked" });
```

**Client routing:** On receiving `matchFound`, the client sets `code` state and transitions to `"placement"` screen. On receiving `opponentJoined`, the existing handler (`setScreen(s => s === "room" ? "placement" : s)`) already handles this. The `matchFound` event serves as the primary trigger with the `code` payload; `opponentJoined` is a secondary confirmation matching the existing flow.

---

### Pattern 7: Queue Cleanup (QUEUE-03, D-11, D-12)

**What:** Three triggers must remove a queue entry immediately.

**Trigger 1 — socket disconnect:** Hook into the existing `socket.on("disconnect")` handler (server.js:1652). The existing handler only handles players in rooms. Add a queue check before the existing room check:

```javascript
// Source: server.js:1652 — extend existing disconnect handler
socket.on("disconnect", () => {
  // NEW: queue cleanup (QUEUE-03, D-12) — before room cleanup
  const clientId = socket.data.clientId || socket.id;
  for (const type of ["casual", "ranked"]) {
    if (queues[type].has(clientId)) {
      queues[type].delete(clientId);
      console.log(`[queue] ${type} entry removed on disconnect: ${clientId}`);
    }
  }
  // ... existing room disconnect handling below (unchanged)
  const code = socket.data.code;
  // ...
});
```

**Trigger 2 — explicit cancel:**

```javascript
socket.on("leaveQueue", (arg, cb) => {
  const clientId = socket.data.queueClientId || socket.data.clientId || socket.id;
  let removed = false;
  for (const type of ["casual", "ranked"]) {
    if (queues[type].delete(clientId)) removed = true;
  }
  socket.data.queueClientId = null;
  cb && cb({ ok: true });
});
```

**Trigger 3 — navigate away (D-12):** The client emits `leaveQueue` before navigating away. This is enforced client-side in the queue screen's `useEffect` cleanup / `beforeunload` handler. The socket disconnect (trigger 1) catches any case where navigate-away closes the tab.

**D-11 auto re-queue waiter (partner vanishes before game starts):**
The window before "game starts" is: after `matchFound` emit, before `placeShips` is received (i.e., `room.started === false`). If the partner socket disconnects during this window (triggering the disconnect handler → `scheduleSeatRelease`), the remaining player needs to be re-queued at the front.

Implementation: When `scheduleSeatRelease` fires (or immediately on disconnect before grace), check if `!room.started`. If so, put the surviving player's entry back at the front of the original queue type (stored on `socket.data.queueType`):

```javascript
// After the partner's seat is released and room is cleaned up,
// if the game never started, re-enqueue the survivor
if (!gameHadStarted && survivorEntry) {
  // Insert at front: delete + re-set (Map insertion order)
  // Actually: create new Map with survivor first, spread rest
  const q = queues[survivorEntry.queueType];
  const rest = new Map(q);
  queues[survivorEntry.queueType] = new Map([[survivorEntry.clientId, survivorEntry], ...rest]);
}
```

**Note:** `socket.data.queueType` must be set on the socket when the player joins a queue, and cleared when the match is made or they leave the queue.

---

### Pattern 8: Socket Event Naming Convention

**Following existing convention:** `camelCase` verbs, callback `{ ok, code }` shape (same as `createRoom`/`joinRoom`).

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `joinQueue` | client → server | `{ type: "casual"\|"ranked", clientId, profile }` | Enqueue player |
| `leaveQueue` | client → server | `{}` | Explicit cancel / navigate away |
| `matchFound` | server → client | `{ code, ranked: bool }` | Paired — start placement |
| `queueStatus` | server → client | `{ waitSec, windowWidth, queueSize }` | Optional periodic status for UX (D-08) |

**Named error codes (following `RANKED_REQUIRES_ACCOUNT` convention):**

| Code | When |
|------|------|
| `RANKED_REQUIRES_ACCOUNT` | Guest tries to join ranked queue (reuse P4 code) |
| `ALREADY_IN_QUEUE` | Player calls `joinQueue` while already queued |
| `ALREADY_IN_ROOM` | Player calls `joinQueue` while socket.data.code is set |

---

### Pattern 9: Client Queue Wait Screen

**React state additions (all new `useState` in `App`):**

```javascript
// Source: existing App() state pattern (server.js:1595-1653)
const [screen, setScreen] = useState("lobby"); // ADD "queue" to the comment
const [queueType, setQueueType] = useState(null);       // "casual" | "ranked" | null
const [queueSince, setQueueSince] = useState(null);     // Date.now() when enqueued
const [queueWindow, setQueueWindow] = useState(null);   // current ELO window (ranked only)
const [botOfferVisible, setBotOfferVisible] = useState(false); // D-09 delayed offer
```

**Elapsed timer:** A `useEffect` with `setInterval(1000)` while `screen === "queue"` computes `(Date.now() - queueSince) / 1000` and updates a display ref. No new state needed — derive elapsed from `queueSince`.

**Bot offer delay (D-09):** A `useRef` timer set at enqueue time (e.g., 30 seconds default, Claude discretion). On fire: `setBotOfferVisible(true)`. Cleared on cancel, match found, or unmount.

**Client routing on `matchFound`:**
```javascript
// Source: mirrors opponentJoined handler (app.jsx:1749-1751)
socket.on("matchFound", ({ code: matchCode, ranked: isRanked }) => {
  setCode(matchCode);
  persistRoom(matchCode);
  setQueueType(null);
  setQueueSince(null);
  setBotOfferVisible(false);
  setScreen("placement");   // instant drop-in (D-10)
});
```

---

### Anti-Patterns to Avoid

- **Storing socket objects anywhere persistent:** Queue entries hold a reference to the live socket. This is fine because entries are removed on disconnect. Never serialize queue entries or store them in Redis — sockets are not serializable. [VERIFIED: codebase read — rooms map holds `sid: socket.id`, not the socket object itself, BUT for the queue we need the actual socket for direct emit. Alternative: store `socket.id` and use `io.to(socketId).emit()`. This is the safer pattern.]

  **Correction:** Store `socket.id` (string) in the queue entry, not the socket object itself. Use `io.to(entry.socketId).emit(...)` for direct sends. This mirrors how `emitToClient(room, clientId, ...)` works in the existing codebase.

- **Checking `socket.data.code` to guard duplicate enqueue:** A player in a room has `socket.data.code` set. Use this as the `ALREADY_IN_ROOM` guard. A player already queued has `socket.data.queueType` set. Use this as the `ALREADY_IN_QUEUE` guard.

- **Putting rated casual games:** Casual queue must never set `ranked: true` on the room, even if both players happen to be signed in. D-01/D-02 lock this.

- **Reading ratings on every sweep tick:** Rating is read once at enqueue. Re-reading on every sweep adds N² DB queries. [ASSUMED — considered best practice for small pool MVP]

- **Forgetting `upsertGuestCredential` after seating:** The existing `joinRoom` path calls it (lines 1342, 1322). The pairing handler must also call it for both players (DATA-01 requirement).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique room codes | Custom UUID/nanoid | Existing `newCode()` in server.js | Already collision-resistant within `rooms` map |
| Rating defaults for new players | Custom defaults | `{ rating: 1500, rd: 350 }` already in db.js:489 | Consistent with P4 defaults |
| Profile sanitization for queue entries | Custom sanitizer | Existing `sanitizeProfile()` in server.js | Already handles XSS/length/escaping |
| Session-based userId read | Reading from arg | `socket.data.userId` (already set at connection) | Server-authoritative, not client-supplied |
| Room object construction | New shape | `rooms[code] = { ... }` exact shape from createRoom | Any drift breaks reconnect, sync, recording |

---

## Common Pitfalls

### Pitfall 1: Double-Pairing Race (CONCERNS #5)

**What goes wrong:** The sweep timer fires and `tryPair` starts pairing player A with player B. Before the async room creation completes (after `await getPlayerRating`), the sweep timer fires again. `tryPair` sees A and B still in the map (because deletion was deferred until after the await) and pairs them into a second room.

**Why it happens:** `await` yields control back to the event loop. The timer callback runs. The entries are still in the map.

**How to avoid:** Delete both entries from the queue map SYNCHRONOUSLY before the first `await`. This is the critical discipline. The `pairing` flag is belt-and-suspenders for edge cases.

**Warning signs:** Two `matchFound` events emitted to the same client ID; `ROOM_FULL` errors on `joinRoom` from the queue handler.

---

### Pitfall 2: Queue Entry Survives After Socket Disconnect (CONCERNS #8 analog)

**What goes wrong:** A player disconnects (tab closed, network drop). The socket disconnect event fires. But the queue cleanup is not added to the disconnect handler. The entry lingers in the queue map forever, using memory and appearing as a pairable opponent.

**Why it happens:** The existing disconnect handler (line 1652) only handles the room case (`rooms[code]`). Queue entries are in a separate map.

**How to avoid:** The disconnect handler MUST check both `queues.casual` and `queues.ranked` for the disconnecting `clientId` (using `socket.data.clientId || socket.id`) and delete any entry found. This must be added as the FIRST action in the disconnect handler, before the existing room logic.

**Warning signs:** `queues.casual.size` or `queues.ranked.size` grows monotonically; phantom opponents that never respond to `matchFound`.

---

### Pitfall 3: Guest Socket Doesn't Have `socket.data.clientId` Set Until `joinQueue`

**What goes wrong:** A new visitor connects. Their `socket.data.clientId` is `null` (set at line 1254). The `joinQueue` handler receives `arg.clientId` from the client. If the handler uses `socket.id` as fallback before setting `socket.data.clientId`, the queue entry and the disconnect handler use different keys.

**Why it happens:** `socket.data.clientId` is set lazily by `createRoom`/`joinRoom` on first use (line 1284). A player who goes straight from lobby to queue never goes through those handlers.

**How to avoid:** The `joinQueue` handler must set `socket.data.clientId = arg.clientId || socket.id` (mirroring createRoom line 1266) AND `socket.data.queueType = type` before inserting into the queue. The disconnect handler uses `socket.data.clientId` consistently.

---

### Pitfall 4: `opponentJoined` Emit Before `matchFound` Causes Wrong Screen Transition

**What goes wrong:** The pairing handler emits `opponentJoined` (to both clients in the room), which the existing client handler processes as `setScreen(s => s === "room" ? "placement" : s)`. But the client's `screen` is currently `"queue"`, not `"room"`, so the condition fails and the screen doesn't transition.

**Why it happens:** The existing `opponentJoined` handler guards against non-`"room"` screens for good reason (reconnect safety).

**How to avoid:** Emit `matchFound` with the room code BEFORE or INSTEAD OF relying on `opponentJoined` for screen routing. `matchFound` explicitly sets `screen = "placement"` regardless of current screen. `opponentJoined` can still be emitted for the rest of the state sync (setting `oppPresent = true`, adding to the log), but `matchFound` is the primary routing signal for matchmade games.

---

### Pitfall 5: Re-Queue Front-Insertion with a Regular `Map`

**What goes wrong:** D-11 requires the surviving player be put at the FRONT of the queue (shortest re-wait). A JavaScript `Map` maintains insertion order. You cannot insert "at the front" directly.

**Why it happens:** Maps have no `unshift` equivalent.

**How to avoid:** Replace the entire map: `queues[type] = new Map([[entry.clientId, entry], ...queues[type]])`. This is O(n) but the queue will be very small (single-digit to low dozens of entries at MVP launch), so it is fine. [ASSUMED — acceptable for small pool MVP]

---

### Pitfall 6: Ranked Pairing Reads a Rating That Was Just Updated Mid-Game

**What goes wrong:** Player A finishes a ranked game, rating updates, then immediately joins the ranked queue. The `getPlayerRating` call reads the fresh post-game rating. This is actually correct behavior, but it could surprise if the player was expecting their pre-game rating window. This is not a bug.

**Actual pitfall:** If a player is in the queue AND simultaneously finishes another game (impossible by D-03: one queue at a time + player must be in a room to play), this cannot occur. D-03 prevents it.

---

### Pitfall 7: `newInv()` Reference

**What goes wrong:** The pairing handler calls `newInv()` for each player seat. `newInv` is defined inside `server.js` and is not exported. The pairing logic MUST be added inside `server.js` (not a separate module) to access `newInv`, `sanitizeProfile`, `roomPublic`, `emitToClient`, and `newCode`.

**How to avoid:** Keep all queue logic in `server.js`. Do not extract to `queue.js`. This matches the project's flat structure convention (CLAUDE.md).

---

## Code Examples

### `joinQueue` Handler (full skeleton)

```javascript
// Source: derived from createRoom pattern (server.js:1264) + research findings
// Placed inside io.on("connection") alongside createRoom/joinRoom

socket.on("joinQueue", async (arg, cb) => {
  const type = (arg && arg.type) === "ranked" ? "ranked" : "casual";
  const clientId = (arg && arg.clientId) || socket.id;
  socket.data.clientId = clientId; // mirror createRoom line 1284

  // Guard: already in a room
  if (socket.data.code) return cb && cb({ ok: false, code: "ALREADY_IN_ROOM" });

  // Guard: already queued (D-03: one queue at a time)
  if (socket.data.queueType) return cb && cb({ ok: false, code: "ALREADY_IN_QUEUE" });

  // Guard: ranked requires account (reuse P4 named code)
  if (type === "ranked" && socket.data.userId == null)
    return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });

  // Read rating for ranked pairing (async; guard already cleared sync checks)
  let rating = 1500, rd = 350;
  if (type === "ranked" && socket.data.userId != null) {
    try {
      ({ rating, rd } = await getPlayerRating(socket.data.userId));
    } catch (e) {
      console.error("[queue] rating read failed:", e.message);
      // fail gracefully — use defaults (CLAUDE.md graceful degradation)
    }
  }

  const entry = {
    socketId: socket.id,    // NOT socket object — use io.to(socketId).emit()
    clientId,
    userId: socket.data.userId ?? null,
    rating,
    rd,
    enqueuedAt: Date.now(),
    pairing: false,
    profile: sanitizeProfile(arg && arg.profile),
    queueType: type,
  };

  socket.data.queueType = type;
  socket.data.queueClientId = clientId;
  queues[type].set(clientId, entry);
  upsertGuestCredential(clientId); // DATA-01 fire-and-forget

  cb && cb({ ok: true });

  // Attempt immediate pairing (check-on-enqueue)
  tryPair(type);
});
```

### `createMatchedRoom` (core pairing execution)

```javascript
// Source: synthesized from createRoom (server.js:1264) + joinRoom (server.js:1290)
async function createMatchedRoom(entryA, entryB, type) {
  const code = newCode();
  const ranked = type === "ranked";

  rooms[code] = {
    code, players: {}, order: [],
    started: false, turn: null, scores: {}, lastStarter: null,
    mode: "classic",   // always classic (D-01/D-02)
    ranked,
    powerups: {}, turnTimer: null, turnDeadline: null,
    resolving: false, lastActivityAt: Date.now(),
  };

  for (const entry of [entryA, entryB]) {
    rooms[code].players[entry.clientId] = {
      sid: entry.socketId, ready: false, occ: null,
      hits: new Set(), online: true, timer: null,
      inv: newInv(), bonus: 0,
      profile: entry.profile,
      userId: entry.userId ?? null,
    };
    rooms[code].order.push(entry.clientId);
    const sock = io.sockets.sockets.get(entry.socketId);
    if (sock) {
      sock.join(code);
      sock.data.code = code;
      sock.data.clientId = entry.clientId;
      sock.data.queueType = null;
      sock.data.queueClientId = null;
    }
    upsertGuestCredential(entry.clientId); // DATA-01
  }

  // Emit to room (both players)
  io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
  io.to(code).emit("opponentJoined");   // sets oppPresent, adds log entry

  // Exchange profiles
  io.to(entryA.socketId).emit("oppProfile", entryB.profile || null);
  io.to(entryB.socketId).emit("oppProfile", entryA.profile || null);

  // Primary routing signal for queue clients (carries code)
  io.to(entryA.socketId).emit("matchFound", { code, ranked });
  io.to(entryB.socketId).emit("matchFound", { code, ranked });

  console.log(`[queue] matched ${type}: ${entryA.clientId} vs ${entryB.clientId} -> room ${code}`);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual room codes shared out-of-band | Public queue with auto-pairing | Phase 5 | Removes friction of sharing; enables strangers to play |
| `RateLimiterMemory` (in-process) for rate limiting | Redis store deferred per STATE.md "[Phase 01 P02]: Redis store deferred to Phase 5 (D-06 explicit)" | Phase 5 can upgrade | Queue itself is in-memory per SCAL-01 deferral; Rate limiter upgrade is a separate decision point |
| `rooms` map only, no queues | `rooms` map + `queues` map (same pattern) | Phase 5 | Two data structures, same pattern; `sweepRooms` model applies to queue cleanup |

**Deprecated/outdated:**
- None. Phase 5 is purely additive. No existing code paths change except extending the disconnect handler.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Rating cached at enqueue time (not re-read per sweep tick) is acceptable for MVP | Pattern 5, Pitfall 6 | Minor: player who games immediately after a match could be matched on slightly stale rating — acceptable at this scale |
| A2 | Recommended ELO window constants (±150 start, +100/10s, ±500 cap, ±300 provisional) | Pattern 4 | Medium: too tight = long waits on quiet server; too loose = unfair ranked matches. Tune post-launch |
| A3 | "Alone-too-long" bot offer delay of 30 seconds | Pattern 9 (client) | Low: too short feels pushy; too long feels abandoned. Easy to adjust post-launch |
| A4 | Front-of-queue re-insertion using full Map replacement is acceptable for MVP pool sizes | Pattern 7 (D-11) | Low: O(n) is irrelevant at <50 concurrent queue entries |
| A5 | `io.sockets.sockets.get(socketId)` is the correct Socket.IO v4 API for looking up a socket by ID | createMatchedRoom example | Medium: if API changed, the emit fails silently. Verify against Socket.IO v4 docs |

---

## Open Questions

1. **`io.sockets.sockets.get(socketId)` availability in Socket.IO v4.7.5**
   - What we know: Socket.IO v4 has a `io.sockets.sockets` Map. `get(id)` returns the socket or undefined.
   - What's unclear: Whether the namespace default (`io.sockets`) is the right access path vs `io.of("/").sockets`.
   - Recommendation: Use `io.of("/").sockets.get(socketId)` as the canonical form for v4. Alternative: pass socket objects into the queue entry (simpler but risks stale references on reconnect — use socket.id lookup instead).

2. **Re-queue on D-11: when exactly is "before game starts"?**
   - What we know: `room.started` is set to `true` in `placeShips` when `allReady` (line 1419). Before that, the room exists but `started === false`.
   - What's unclear: Should re-queue trigger on disconnect during placement (after `matchFound`, before `placeShips`) only? Or also during the lobby waiting phase?
   - Recommendation: Re-queue if `!room.started` at disconnect time. This covers both the placement window and any unexpected lobby state. The surviving player's `socket.data.queueType` must be preserved through the match-handoff phase and not cleared until `placeShips allReady`.

3. **Rate limiting for `joinQueue`**
   - What we know: `fire`/`useAbility` are rate-limited (SEC-01). `createRoom`/`joinRoom` are not individually rate-limited (just socket connection rate).
   - What's unclear: Should `joinQueue` be rate-limited? A malicious client could spam join/leave to pollute the queue.
   - Recommendation: Apply a simple `RateLimiterMemory` (existing dep) at 5 joinQueue/min per socket. This prevents queue spam without adding a new dependency.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.14.0 | — |
| Socket.IO server | `joinQueue`/`leaveQueue`/`matchFound` events | Yes (^4.7.5) | 4.7.5 | — |
| Postgres (`ratings` table) | Glicko-2 rating read for ranked pairing | Yes (Phase 4 complete) | — | Default 1500/350 when query fails |
| Vitest | Unit tests | Yes (^4.1.8) | 4.1.8 | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 |
| Config file | `vitest.config.js` (or package.json "test" script) |
| Quick run command | `npm test -- --reporter=dot test/queue.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUEUE-01 | Two players in casual queue are paired into a room | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-01 | `matchFound` event emitted to both paired players | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-01 | Room is created with `ranked: false` and `mode: "classic"` | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-02 | Ranked queue rejects guest (RANKED_REQUIRES_ACCOUNT) | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-02 | ELO window widens with elapsed time | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-02 | Provisional player (rd >= 110) uses wider starting window | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-02 | Window becomes Infinity after cap | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-02 | Ranked room created with `ranked: true` | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-03 | Queue entry removed on socket disconnect | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-03 | Queue entry removed on `leaveQueue` event | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-03 | No double-pairing: same player not paired twice | unit | `npm test -- test/queue.test.js` | No — Wave 0 |
| QUEUE-03 | Surviving player re-queued at front on partner disconnect | unit | `npm test -- test/queue.test.js` | No — Wave 0 |

**Test approach for a single-process Socket.IO server:**
The existing `test/hardening.test.js` and `test/match.test.js` use `server.js TEST_EXPORTS` to access internals directly (no network). `queue.test.js` follows the same pattern: import `TEST_EXPORTS.rooms`, expose `TEST_EXPORTS.queues`, `TEST_EXPORTS.tryPair`, and `TEST_EXPORTS.rankedWindow` for synchronous unit testing without spinning up a Socket.IO server.

```javascript
// Proposed TEST_EXPORTS additions (server.js)
module.exports = {
  TEST_EXPORTS: {
    // ...existing...
    queues,        // the live Map objects
    tryPair,       // pairing function
    rankedWindow,  // window calculation (pure)
  },
};
```

### Sampling Rate

- **Per task commit:** `npm test -- test/queue.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/queue.test.js` — covers all QUEUE-01/02/03 unit tests above
- [ ] Export `queues`, `tryPair`, `rankedWindow` via `TEST_EXPORTS` in server.js
- [ ] `db.js` export: `getPlayerRating` function

*(Existing test infrastructure — Vitest, vitest.config, test/hardening.test.js pattern — is fully operational. No framework install needed.)*

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` per config.json.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (ranked gate) | Reuse `socket.data.userId` session check; `RANKED_REQUIRES_ACCOUNT` error code |
| V3 Session Management | No (queue is transient; no new session state) | — |
| V4 Access Control | Yes (one queue at a time; no cross-type abuse) | `ALREADY_IN_QUEUE` guard; `socket.data.queueType` check |
| V5 Input Validation | Yes (queue type, clientId, profile) | Existing `sanitizeProfile()`; `type` allowlist `["casual","ranked"]`; `clientId` treated as untrusted string |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Queue spam (join/leave cycling to observe who else is queued) | Information Disclosure | Rate-limit `joinQueue` at 5/min per socket (RateLimiterMemory, existing dep) |
| Guest ranked queue bypass (sending `type:"ranked"` with forged `userId`) | Elevation of Privilege | `socket.data.userId` is always read from session (server side), never from `arg.userId`. Mirroring P4 D-02. |
| Double-enqueue (client sends `joinQueue` twice) | Denial of Service | `ALREADY_IN_QUEUE` guard using `socket.data.queueType` |
| Phantom queue slot (disconnect without cleanup) | Denial of Service / Integrity | Disconnect handler cleans up queue entries immediately (QUEUE-03) |
| Profile injection in queue entry | Tampering | `sanitizeProfile()` applied at enqueue time, same as `createRoom`/`joinRoom` |

---

## Sources

### Primary (HIGH confidence — verified against live codebase)

- `server.js` lines 1253–1666 — `io.on("connection")` block, `createRoom`/`joinRoom` shapes, disconnect handler, `scheduleSeatRelease`, `rooms` map, `TEST_EXPORTS`
- `server.js` lines 185–220 — constants (`GRACE_MS`, `CLEANUP_INTERVAL_MS`), `RateLimiterMemory` usage
- `db.js` lines 488–527 — `ratings` table SELECT/UPSERT pattern, `DEFAULT_RATING` constants
- `public/app.jsx` lines 1594–1666 — `App()` state shape, `screen` values, `startBot()`, `resetToLobby()`
- `public/app.jsx` lines 19–251 — `I18N` object structure, existing string keys
- `.planning/phases/05-public-matchmaking/05-CONTEXT.md` — all 12 locked decisions
- `.planning/phases/04-ranked-mode-leaderboard/04-CONTEXT.md` — D-01/D-02/D-03/D-05/D-08 (ranked flag, provisional threshold, RANKED_REQUIRES_ACCOUNT)
- `.planning/codebase/CONCERNS.md` — #5 race condition, #7 turn-clock race, #8 unbounded room-map growth

### Secondary (MEDIUM confidence)

- Node.js event-loop single-thread model — standard documented behavior; `await` as the only yield point in async functions [ASSUMED from training; core Node.js documentation]
- JavaScript `Map` insertion-order guarantee (ES2015+) — [ASSUMED from training; widely documented]

### Tertiary (LOW confidence)

- ELO window constants (±150, +100/10s, ±500 cap, ±300 provisional) — [ASSUMED] — tuned by reasoning from Glicko-2 model characteristics, not validated against live player data
- 30-second bot-offer delay — [ASSUMED] — no empirical data; easy to adjust

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified; no new packages; all patterns from live codebase
- Architecture: HIGH — derived directly from existing `createRoom`/`joinRoom`/`disconnect` code paths
- ELO window constants: LOW — [ASSUMED]; tune post-launch
- Pitfalls: HIGH — derived from CONCERNS.md and direct code analysis of race-prone sections
- Validation architecture: HIGH — mirrors existing test/hardening.test.js + TEST_EXPORTS pattern

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable codebase; no external API dependencies)
