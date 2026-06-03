# Phase 5: Public Matchmaking - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 4 (server.js modified, db.js modified, public/app.jsx modified, test/queue.test.js new)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server.js` (queue logic + handlers) | service + controller | event-driven | `server.js` `createRoom`/`joinRoom`/`disconnect` (lines 1264–1666) | exact |
| `db.js` (`getPlayerRating` helper) | service | request-response | `db.js` `recordMatch` rating read (lines 488–502) | exact |
| `public/app.jsx` (queue screen + state) | component | event-driven | `public/app.jsx` `App()` state + socket handlers (lines 1594–1800) | exact |
| `test/queue.test.js` | test | — | `test/hardening.test.js` TEST_EXPORTS pattern (lines 1–55) | exact |

---

## Pattern Assignments

### `server.js` — Queue map (module-level constant)

**Analog:** `server.js` lines 185–199 (module-level constants + rate limiter maps)

**Pattern** (lines 185–199):
```javascript
// Module-level constants and maps — never per-request
const GRACE_MS = 180000;
const CLEANUP_INTERVAL_MS = 60000;
const ROOM_IDLE_THRESHOLD_MS = 300000;

const { RateLimiterMemory } = require("rate-limiter-flexible");
const fireLimiter    = new RateLimiterMemory({ points: 2,  duration: 1  });
const abilityLimiter = new RateLimiterMemory({ points: 1,  duration: 1  });
```

**Copy for `queues` map and queue constants:**
```javascript
// Placed alongside CLEANUP_INTERVAL_MS / GRACE_MS constants at top of server.js
const RANKED_WINDOW_START      = 150;   // ±150 rating points at enqueue
const RANKED_WINDOW_STEP       = 100;   // widen by 100 per step
const RANKED_WINDOW_CAP        = 500;   // cap at ±500 before unbounded
const RANKED_STEP_MS           = 10000; // step every 10s
const RANKED_PROVISIONAL_START = 300;   // wider start for RD >= 110 (P4 D-08)
const BOT_OFFER_DELAY_MS       = 30000; // 30s alone before bot prompt (D-09)
const QUEUE_SWEEP_MS           = 5000;  // sweep timer (matches step cadence)

// mirrors `rooms` map pattern — module-level, never per-request
const queues = {
  casual: new Map(), // clientId → QueueEntry
  ranked: new Map(), // clientId → QueueEntry
};

const joinQueueLimiter = new RateLimiterMemory({ points: 5, duration: 60 }); // 5/min per socket
```

---

### `server.js` — `joinQueue` socket handler

**Analog:** `server.js` `createRoom` handler (lines 1264–1288)

**Guard-clause + session-read pattern** (lines 1264–1287):
```javascript
socket.on("createRoom", (arg, cb) => {
  if (typeof arg === "function") { cb = arg; arg = {}; }
  const clientId = (arg && arg.clientId) || socket.id;
  const code = newCode();
  const mode = (arg && arg.mode) === "advance" ? "advance" : "classic";
  const ranked = !!(arg && arg.ranked === true);
  // Guard: ranked + advance incompatible
  if (ranked && mode === "advance") return cb && cb({ ok: false, code: "RANKED_REQUIRES_CLASSIC" });
  // Guard: ranked requires account — read from SESSION, never from arg
  if (ranked && socket.data.userId == null) return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });
  rooms[code] = { code, players: {}, order: [], started: false, turn: null, scores: {},
    lastStarter: null, mode, ranked, powerups: {}, turnTimer: null, turnDeadline: null,
    resolving: false, lastActivityAt: Date.now() };
  rooms[code].players[clientId] = {
    sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null,
    inv: newInv(), bonus: 0,
    profile: sanitizeProfile(arg && arg.profile),
    userId: socket.data.userId ?? null,
  };
  rooms[code].order.push(clientId);
  socket.join(code);
  socket.data.code = code;
  socket.data.clientId = clientId;
  cb && cb({ ok: true, code });
  io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
  upsertGuestCredential(clientId); // fire-and-forget: durable identity (DATA-01)
});
```

**Copy `joinQueue` following this exact shape:**
- Set `socket.data.clientId` early (line 1284 pattern: `const clientId = (arg && arg.clientId) || socket.id`)
- Guard `socket.data.code` → `ALREADY_IN_ROOM` before anything else
- Guard `socket.data.queueType` → `ALREADY_IN_QUEUE` (D-03)
- Guard `type === "ranked" && socket.data.userId == null` → `RANKED_REQUIRES_ACCOUNT` (reuse P4 code)
- `socket.data.userId` is always read from session (`socket.data.userId`), never from `arg`
- `sanitizeProfile()` on `arg.profile` (same as createRoom line 1278)
- `upsertGuestCredential(clientId)` fire-and-forget after enqueue (DATA-01, same as line 1287)
- `cb && cb({ ok: true })` at end (same callback shape)

**Rate limit pattern** (lines 1482–1489) — copy for `joinQueue`:
```javascript
// Rate limit pattern from useAbility (lines 1482-1489)
const rlKey = socket.data.clientId || socket.id;
try {
  await joinQueueLimiter.consume(rlKey);
} catch (e) {
  return cb && cb({ ok: false, code: "RATE_LIMITED" });
}
```

---

### `server.js` — `createMatchedRoom` (pairing execution)

**Analog:** `server.js` `joinRoom` second-seat path (lines 1330–1348)

**Second seat insertion + emit pattern** (lines 1330–1348):
```javascript
room.players[clientId] = {
  sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null,
  inv: newInv(), bonus: 0,
  profile: sanitizeProfile(arg && arg.profile),
  userId: socket.data.userId ?? null,
};
room.order.push(clientId);
socket.join(code);
socket.data.code = code;
socket.data.clientId = clientId;
cb && cb({ ok: true, code });
io.to(code).emit("roomUpdate", roomPublic(room));
io.to(code).emit("opponentJoined");
upsertGuestCredential(clientId);
const oppId = opponentOf(room, clientId);
if (oppId) {
  emitToClient(room, oppId, "oppProfile", room.players[clientId].profile || null);
  emitToClient(room, clientId, "oppProfile", room.players[oppId].profile || null);
}
```

**Room object shape to copy exactly** (line 1275):
```javascript
rooms[code] = {
  code, players: {}, order: [], started: false, turn: null, scores: {},
  lastStarter: null, mode, ranked, powerups: {}, turnTimer: null, turnDeadline: null,
  resolving: false, lastActivityAt: Date.now()
};
```

**`createMatchedRoom` additions vs `joinRoom`:**
- Use `io.of("/").sockets.get(entry.socketId)` to retrieve socket from stored `socketId` string
- Emit `matchFound` with `{ code, ranked }` to each socket AFTER `opponentJoined` (primary routing signal)
- Clear `socket.data.queueType` and `socket.data.queueClientId` on both sockets at seating time
- `upsertGuestCredential` called for BOTH players (not just the second — DATA-01)

---

### `server.js` — Double-pairing race guard

**Analog:** `server.js` `room.resolving` flag (lines 1469–1476) and `room.recorded` flag (line 790)

**`room.resolving` synchronous flag pattern** (lines 1469–1476):
```javascript
room.resolving = true;
let summary;
try {
  summary = doShot(room, clientId, expandCells(power, r, c));
} finally {
  room.resolving = false;
}
```

**`room.recorded` dedup flag** (line 790):
```javascript
r2.recorded = true; // synchronous dedup guard (D-06) — set BEFORE delete
```

**Copy for `tryPair`:** Set `entry.pairing = true` AND `queues[type].delete(entry.clientId)` synchronously BEFORE any `await`. Both operations must happen in the same synchronous block. The delete is the critical line — `pairing` is belt-and-suspenders.

---

### `server.js` — Sweep timer

**Analog:** `server.js` lines 1700–1701 (room cleanup sweep):
```javascript
// Room cleanup sweep: evict empty and idle rooms every 60s
setInterval(sweepRooms, CLEANUP_INTERVAL_MS).unref();
```

**Copy for queue sweep — placed in the same boot `setInterval` block:**
```javascript
setInterval(tryPairAll, QUEUE_SWEEP_MS).unref(); // D-05 stepped widening recheck
```

**`.unref()` is mandatory** — mirrors existing pattern so the timer never keeps the process alive on its own.

---

### `server.js` — Disconnect handler extension

**Analog:** `server.js` disconnect handler (lines 1652–1665):
```javascript
socket.on("disconnect", () => {
  const code = socket.data.code;
  const clientId = socket.data.clientId;
  const room = rooms[code];
  if (!room || !clientId || !room.players[clientId]) return;
  const p = room.players[clientId];
  if (p.sid !== socket.id) return; // stale socket
  p.online = false;
  const oppId = opponentOf(room, clientId);
  if (oppId) emitToClient(room, oppId, "opponentOffline");
  io.to(code).emit("roomUpdate", roomPublic(room));
  scheduleSeatRelease(room, code, clientId, GRACE_MS);
});
```

**Queue cleanup MUST be inserted BEFORE the existing room block:**
```javascript
socket.on("disconnect", () => {
  // NEW: queue cleanup (QUEUE-03) — runs before room cleanup
  const clientId = socket.data.clientId || socket.id;
  for (const type of ["casual", "ranked"]) {
    if (queues[type].has(clientId)) {
      queues[type].delete(clientId);
      console.log(`[queue] ${type} entry removed on disconnect: ${clientId}`);
    }
  }
  // + D-11: if clientId was in a paired-but-not-started room, re-enqueue partner
  // (see D-11 pattern below)

  // ... existing room disconnect handling (unchanged) ...
  const code = socket.data.code;
  // ...
});
```

---

### `server.js` — TEST_EXPORTS extension

**Analog:** `server.js` TEST_EXPORTS (lines 1720–1738):
```javascript
module.exports = {
  TEST_EXPORTS: {
    doShot, rooms, sweepRooms, escapeHtml, sanitizeProfile, sanitizeChat,
    cspMiddleware, CSP_HEADER_VALUE, app, serializeRooms, restoreRooms,
    leaderboardLimiter, getLbCache: () => lbCache, resetLbCache: () => { lbCache = { at: 0, payload: null }; },
  },
};
```

**Add to TEST_EXPORTS (do not replace):**
```javascript
queues,        // { casual: Map, ranked: Map }
tryPair,       // (type: string) => void
rankedWindow,  // (entry: QueueEntry) => number
```

---

### `db.js` — `getPlayerRating` helper

**Analog:** `db.js` lines 488–502 (rating SELECT in `recordMatch`):
```javascript
// Source: db.js:488-502
const DEFAULT_RATING = { rating: 1500, rd: 350, volatility: 0.06, games_played: 0 };
const { rows: wRows } = await client.query(
  "SELECT rating, rd, volatility, games_played FROM ratings WHERE user_id = $1",
  [winnerId]
);
const wBefore = wRows.length > 0 ? wRows[0] : { ...DEFAULT_RATING };
```

**Copy for `getPlayerRating` — simpler (no transaction, no write, `pool` not `client`):**
```javascript
// db.js — export alongside recordMatch
async function getPlayerRating(userId) {
  if (!userId) return { rating: 1500, rd: 350 };
  const { rows } = await pool.query(
    "SELECT rating, rd FROM ratings WHERE user_id = $1",
    [userId]
  );
  return rows.length > 0 ? { rating: rows[0].rating, rd: rows[0].rd } : { rating: 1500, rd: 350 };
}
```

**Export pattern** — `db.js` exports via destructuring in server.js line 11:
```javascript
const { pool, runMigrations, upsertGuestCredential, ..., recordMatch, getLeaderboard } = require("./db");
```
Add `getPlayerRating` to both `module.exports` in `db.js` and the destructure in `server.js` line 11.

---

### `public/app.jsx` — Queue screen state

**Analog:** `public/app.jsx` `App()` state declarations (lines 1596–1670)

**Existing `screen` state pattern** (line 1596):
```javascript
const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle | profile | leaderboard
```

**New state to add — follow exact same `useState` declaration style:**
```javascript
// Queue state (Phase 5) — add after existing state declarations
const [queueType, setQueueType]           = useState(null);   // "casual" | "ranked" | null
const [queueSince, setQueueSince]         = useState(null);   // Date.now() when enqueued
const [queueWindow, setQueueWindow]       = useState(null);   // current ELO window width (ranked only)
const [botOfferVisible, setBotOfferVisible] = useState(false); // D-09 delayed bot prompt
```

**Add `"queue"` to the `screen` comment** (line 1596):
```javascript
const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle | profile | leaderboard | queue
```

**`useRef` timer pattern** (lines 1653–1662 — `shakeTimer` model):
```javascript
const shakeTimer = useRef(null);
const triggerShake = useCallback(() => {
  setShake(true);
  if (shakeTimer.current) clearTimeout(shakeTimer.current);
  shakeTimer.current = setTimeout(() => setShake(false), 380);
}, []);
```
Copy this ref pattern for bot offer timer:
```javascript
const botOfferTimerRef = useRef(null);
```

---

### `public/app.jsx` — Socket event handlers for queue

**Analog:** `public/app.jsx` `opponentJoined` + `roomUpdate` handlers (lines 1748–1758):
```javascript
useEffect(() => {
  socket.on("opponentJoined", () => {
    setOppPresent(true); addLog(t("log.oppJoined"));
    setScreen((s) => (s === "room" ? "placement" : s));
  });
  socket.on("roomUpdate", (r) => {
    const has = r.playerCount >= 2;
    setOppPresent(has);
    if (r.mode) setMode(r.mode);
    if (has) setScreen((s) => (s === "room" ? "placement" : s));
  });
  // ...
}, []);
```

**Copy for `matchFound` handler — add inside the SAME `useEffect` block:**
```javascript
socket.on("matchFound", ({ code: matchCode, ranked: isRanked }) => {
  setCode(matchCode);
  persistRoom(matchCode);          // same pattern as joinRoom success handler
  setQueueType(null);
  setQueueSince(null);
  setBotOfferVisible(false);
  if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
  setScreen("placement");          // instant drop-in (D-10) — does NOT guard on s === "queue"
});
```

**`queueStatus` handler (D-08 — ranked window display):**
```javascript
socket.on("queueStatus", ({ waitSec, windowWidth }) => {
  if (windowWidth != null) setQueueWindow(windowWidth);
  // waitSec is derived client-side from queueSince for accuracy; server value is secondary
});
```

---

### `public/app.jsx` — Elapsed timer `useEffect`

**Analog:** `public/app.jsx` `graceTimerRef` countdown pattern (lines 1763–1766):
```javascript
graceTimerRef.current = setInterval(() => {
  setGraceLeft((s) => {
    if (s <= 1) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; return 0; }
    return s - 1;
  });
}, 1000);
```

**Copy for elapsed display — derive from `queueSince`, no extra state needed:**
```javascript
// In a useEffect gated on screen === "queue"
const queueTimerRef = useRef(null);
useEffect(() => {
  if (screen !== "queue") {
    if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
    return;
  }
  // Bot offer delay (D-09)
  botOfferTimerRef.current = setTimeout(() => setBotOfferVisible(true), BOT_OFFER_DELAY_MS);
  return () => {
    if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
  };
}, [screen]);
// Elapsed seconds: derive in render — Math.floor((Date.now() - queueSince) / 1000)
// Re-render every 1s using a forceUpdate ref or a separate elapsedSec state updated by interval
```

---

### `public/app.jsx` — I18N strings

**Analog:** `public/app.jsx` I18N object (lines 19–251) — both `en` and `vi` keys are required for every string.

**Pattern** (lines 21–29):
```javascript
const I18N = {
  en: {
    "common.or": "OR",
    "lobby.title": "Sea Battle",
    "ranked.label": "Ranked",
    "err.RANKED_REQUIRES_ACCOUNT": "Ranked requires a signed-in account",
    // ...
  },
  vi: {
    "common.or": "HOẶC",
    "lobby.title": "Hải Chiến",
    // ...
  }
};
```

**New queue keys to add to BOTH `en` and `vi`:**
```javascript
// en additions
"queue.quickMatch": "Quick Match",
"queue.ranked": "Ranked",
"queue.searching": "Searching for opponent…",
"queue.cancel": "Cancel",
"queue.elapsed": "Wait: {sec}s",
"queue.window": "Rating window: ±{width}",
"queue.botOffer": "No opponents yet. Play a bot instead?",
"queue.playBot": "Play vs Bot",
"queue.keepWaiting": "Keep Waiting",
"err.ALREADY_IN_QUEUE": "Already in queue",
"err.ALREADY_IN_ROOM": "Already in a game",
```

---

### `test/queue.test.js` — New test file

**Analog:** `test/hardening.test.js` (lines 1–55) — TEST_EXPORTS import pattern

**Import + setup pattern** (lines 1–55):
```javascript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import serverModule from "../server.js";

const { TEST_EXPORTS } = serverModule;
const { doShot, rooms, sweepRooms, ... } = TEST_EXPORTS;
```

**Copy for `queue.test.js`:**
```javascript
import { describe, it, expect, beforeEach } from "vitest";
import serverModule from "../server.js";

const { TEST_EXPORTS } = serverModule;
const { queues, tryPair, rankedWindow } = TEST_EXPORTS;

// Helper: minimal queue entry
function makeEntry(overrides = {}) {
  return {
    socketId: "socket-" + Math.random(),
    clientId: "client-" + Math.random(),
    userId: null,
    rating: 1500,
    rd: 350,
    enqueuedAt: Date.now(),
    pairing: false,
    profile: null,
    queueType: "casual",
    ...overrides,
  };
}
```

**Test structure follows existing pattern** — `describe` blocks per requirement ID (QUEUE-01, QUEUE-02, QUEUE-03), each with `beforeEach` that clears `queues.casual` and `queues.ranked`.

---

## Shared Patterns

### Named error code callback shape
**Source:** `server.js` lines 1271–1273 (`createRoom` guards)
**Apply to:** `joinQueue` and `leaveQueue` handlers
```javascript
return cb && cb({ ok: false, code: "NAMED_ERROR_CODE" });
// success:
cb && cb({ ok: true });
```

### Session-authoritative userId (never trust `arg`)
**Source:** `server.js` lines 1260–1261, 1272–1273
**Apply to:** `joinQueue` ranked gate
```javascript
const userId = socket.request.session?.passport?.user ?? null;
socket.data.userId = userId;
// ...
if (ranked && socket.data.userId == null) return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });
```

### `upsertGuestCredential` fire-and-forget (DATA-01)
**Source:** `server.js` lines 1287, 1342 — called after every seat assignment
**Apply to:** `joinQueue` handler AND `createMatchedRoom` for BOTH players
```javascript
upsertGuestCredential(clientId); // fire-and-forget: durable identity (DATA-01)
```

### `sanitizeProfile` on all user-supplied profile data
**Source:** `server.js` lines 1278, 1332
**Apply to:** queue entry creation in `joinQueue`
```javascript
profile: sanitizeProfile(arg && arg.profile),
```

### `console.log` prefixed context tag
**Source:** `server.js` line 1262 `[auth]`, line 790 implicit `[store]`
**Apply to:** all queue log lines
```javascript
console.log(`[queue] ${type} entry removed on disconnect: ${clientId}`);
console.log(`[queue] matched ${type}: ${entryA.clientId} vs ${entryB.clientId} -> room ${code}`);
```

### `.unref()` on all `setInterval` calls
**Source:** `server.js` line 1701
**Apply to:** `setInterval(tryPairAll, QUEUE_SWEEP_MS).unref()`

### Graceful degradation for async operations
**Source:** `CLAUDE.md` — "try/catch reserved for optional features"
**Apply to:** `getPlayerRating` call in `joinQueue`
```javascript
try {
  ({ rating, rd } = await getPlayerRating(socket.data.userId));
} catch (e) {
  console.error("[queue] rating read failed:", e.message);
  // use defaults — CLAUDE.md graceful degradation
}
```

---

## No Analog Found

All files have close analogs in the existing codebase. No new patterns need to be sourced from RESEARCH.md alone.

| File section | Notes |
|---|---|
| `rankedWindow()` pure function | No prior analog for stepped ELO widening — implement from RESEARCH.md Pattern 4 exactly as specified |
| `QueueWaitPanel` React component | No prior wait-panel analog — implement from scratch following existing screen component style in `app.jsx` |

---

## Metadata

**Analog search scope:** `server.js` (full, 1739 lines), `db.js` (lines 480–540), `public/app.jsx` (lines 1–60, 1594–1800), `test/hardening.test.js` (lines 1–60)
**Files scanned:** 4 source files + 9 test files (glob)
**Pattern extraction date:** 2026-06-03
