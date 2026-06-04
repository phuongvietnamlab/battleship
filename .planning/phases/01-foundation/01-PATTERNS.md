# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 4 (db.js, migrations/001_*.sql, migration runner, server.js modifications)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `db.js` | service/singleton | request-response | `store.js` | exact — same singleton/env-driven/graceful pattern |
| `migrations/001_*.sql` | config/schema | batch | `store.js` Redis key schema (conceptual) | partial — no SQL analog exists |
| migration runner (in `server.js` boot or `migrate.js`) | utility | batch | `store.js` `init()` + boot sequence in `server.js` lines 887–901 | role-match |
| `server.js` (modify) | controller/middleware | request-response + event-driven | itself — existing handlers at lines 721–825 | exact |

---

## Pattern Assignments

### `db.js` (service singleton, request-response)

**Analog:** `store.js` (entire file, 65 lines)

**Module structure + env-driven init pattern** (`store.js` lines 1–37):
```javascript
// store.js — optional Redis snapshot of the in-memory room map.
// When REDIS_URL is UNSET this module is a complete no-op ...

const REDIS_URL = process.env.REDIS_URL || "";
let client = null;
let ready = false;

async function init() {
  if (!REDIS_URL) {
    console.log("[store] REDIS_URL not set — RAM-only mode");
    return false;
  }
  try {
    const { createClient } = require("redis");
    client = createClient({ url: REDIS_URL });
    client.on("error", (e) => console.error("[store] redis error:", e.message));
    await client.connect();
    ready = true;
    console.log("[store] redis connected — snapshot persistence ON");
  } catch (e) {
    console.error("[store] redis unavailable, falling back to RAM-only:", e.message);
    client = null;
    ready = false;
  }
  return ready;
}
```

**Key differences for `db.js`:** Postgres is a hard dependency (identity is core, not optional), so connection failure should throw/log loudly and let the boot sequence reject rather than silently degrade. SSL is off for localhost EC2 (`ssl: false`) but env-gated (`process.env.PG_SSL === 'true'`). Pool `max` set conservatively (~10). Accept either `DATABASE_URL` or discrete `PG*` env vars.

**Export shape** (`store.js` line 64):
```javascript
module.exports = { init, isEnabled, saveSnapshot, loadSnapshot };
// db.js equivalent:
module.exports = { pool, init };
// or simply:
module.exports = pool; // single pg.Pool instance; caller requires and queries directly
```

**Logging prefix convention** (`store.js` lines 27, 30, 32):
```javascript
console.log("[store] redis connected — snapshot persistence ON");
console.error("[store] redis unavailable, falling back to RAM-only:", e.message);
// follow same bracket-prefix pattern:
console.log("[db] postgres connected");
console.error("[db] connection failed:", e.message);
```

---

### `migrations/001_*.sql` (config/schema, batch)

**No analog exists in the codebase.** Pure SQL DDL files. Planner should use the D-03 schema decisions directly:

- Table `users`: `id` (serial or uuid PK), `created_at`, `guest_migrated_at` (nullable timestamp, reserved for Phase 2 account-link flow).
- Table `credentials`: `id`, `user_id` (FK → users), `type` (`'guest'` or `'google'`), `external_id`, `created_at`. Unique constraint on `(type, external_id)`.
- Table `schema_migrations`: `filename` (text PK), `applied_at` (timestamptz default now()).

Migration files are numbered for lexical ordering: `migrations/001_identity.sql`.

---

### Migration runner (utility, batch)

**Analog:** `store.js` `init()` + boot sequence in `server.js` lines 887–901

**Boot sequence pattern** (`server.js` lines 887–901):
```javascript
// Boot: connect optional store, restore any snapshot, then start listening.
(async () => {
  await store.init();
  if (store.isEnabled()) {
    try {
      const n = restoreRooms(await store.loadSnapshot());
      if (n) console.log(`[store] restored ${n} room(s) from snapshot`);
    } catch (e) {
      console.error("[store] restore failed:", e.message);
    }
    setInterval(() => { store.saveSnapshot(serializeRooms()); }, SNAPSHOT_MS).unref();
  }
  server.listen(PORT, () => {
    console.log(`Battleship server running at http://localhost:${PORT}`);
  });
})();
```

**Migration runner shape** — mirror this boot pattern: `await runMigrations(pool)` is called inside the same IIFE, before `server.listen()`. If any migration throws, the error propagates and the process exits (fail-loud, D-02):

```javascript
// pseudo-shape for the runner (30-line target):
async function runMigrations(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const files = fs.readdirSync(path.join(__dirname, "migrations"))
    .filter(f => f.endsWith(".sql"))
    .sort(); // lexical order = numeric order given 001_, 002_ prefixes
  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map(r => r.filename));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(__dirname, "migrations", file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    console.log(`[db] migration applied: ${file}`);
  }
}
```

**Error handling rule:** do NOT wrap in try/catch here — let it throw. Boot IIFE has no catch for migration errors so the process exits with a stack trace (matches D-02 "fail loud").

---

### `server.js` modifications (controller/middleware, event-driven)

**Analog:** itself — existing handlers and boot sequence.

#### 1. Rate-limiter wrapper around `fire` / `useAbility` / `chat` handlers

**Existing handler pattern to wrap** (`server.js` lines 721–740, `fire` handler):
```javascript
socket.on("fire", ({ r, c, power }, cb) => {
  const code = socket.data.code;
  const clientId = socket.data.clientId;
  const room = rooms[code];
  if (!room || !room.started) return cb && cb({ ok: false });
  if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
  if (!inBounds(r, c)) return cb && cb({ ok: false, code: "BAD_CELL" });
  // ... rest of handler
});
```

**Rate-limit guard pattern** — insert at the top of each guarded handler, before any room/state access, following the guard-clause early-return convention:
```javascript
// At top of each guarded handler (fire, useAbility, chat):
try {
  await fireLimiter.consume(socket.data.clientId || socket.id);
} catch (e) {
  cb && cb({ ok: false, code: "RATE_LIMITED" });
  // repeated violations: disconnect after N consecutive rejections
  // (track p.rateLimitHits on the seat or a local counter)
  return;
}
```

**Limiter instantiation pattern** — declare near the top of `server.js` alongside other config constants (lines 54–68), mirroring how `GRACE_MS` and `SNAPSHOT_MS` are declared:
```javascript
const { RateLimiterMemory } = require("rate-limiter-flexible");
const fireLimiter    = new RateLimiterMemory({ points: 2,  duration: 1  }); // 2/s
const abilityLimiter = new RateLimiterMemory({ points: 1,  duration: 1  }); // 1/s
const chatLimiter    = new RateLimiterMemory({ points: 5,  duration: 10 }); // 5/10s
```

**Structured error code convention** (`server.js` lines 595, 623, 625 — existing codes):
```javascript
return cb && cb({ ok: false, code: "ROOM_NOT_FOUND" });
return cb && cb({ ok: false, code: "ROOM_FULL" });
return cb && cb({ ok: false, code: "GAME_STARTED" });
// new code follows same shape:
return cb && cb({ ok: false, code: "RATE_LIMITED" });
return cb && cb({ ok: false, code: "BAD_STATE" });
```

#### 2. `doShot()` null/shape guard (SEC-02)

**Existing guard-clause pattern** (`server.js` lines 725–728):
```javascript
if (!room || !room.started) return cb && cb({ ok: false });
if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
if (!inBounds(r, c)) return cb && cb({ ok: false, code: "BAD_CELL" });
```

**Guard to add at top of `doShot()`** (`server.js` line 486, start of function):
```javascript
function doShot(room, clientId, cells) {
  const opp = opponentOf(room, clientId);
  const oppData = room.players[opp];
  const me = room.players[clientId];
  // Guard: null/shape check before any property access
  if (!oppData || !oppData.occ || !me) return { ok: false, code: "BAD_STATE" };
  // ... existing body continues
```

#### 3. Turn-clock race guard (`turn.resolving`) (D-09)

**Existing turn clock pattern** (`server.js` lines 444–451, `armTurnTimer`):
```javascript
function armTurnTimer(room) {
  clearTurnTimer(room);
  if (!room.started || !room.turn) return;
  const who = room.turn;
  room.turnDeadline = Date.now() + TURN_MS;
  // ...
  room.turnTimer = setTimeout(() => onTurnTimeout(room, who), TURN_MS);
}
```

**Race guard pattern** — add `room.turn.resolving` boolean, set it at the start of shot resolution in the `fire` handler and in `onTurnTimeout`, clear it after resolution. Mirrors the pattern used for `p.online` checks (`server.js` line 161):
```javascript
// In fire handler, before doShot():
if (room.resolving) return cb && cb({ ok: false, code: "BAD_STATE" });
room.resolving = true;
const summary = doShot(room, clientId, expandCells(power, r, c));
room.resolving = false;

// In onTurnTimeout(), at top of function:
if (room.resolving) return; // shot already resolving, skip timeout
```

#### 4. Room-cleanup sweep (D-10)

**Existing periodic pattern** (`server.js` lines 897–898):
```javascript
setInterval(() => { store.saveSnapshot(serializeRooms()); }, SNAPSHOT_MS).unref();
```

**Cleanup sweep pattern** — register alongside the snapshot interval in the boot IIFE, same `.unref()` idiom:
```javascript
const CLEANUP_INTERVAL_MS = 60000;   // sweep every 60s
const ROOM_IDLE_THRESHOLD_MS = 300000; // evict rooms idle > 5 min

setInterval(() => {
  const now = Date.now();
  for (const code in rooms) {
    const r = rooms[code];
    // immediate evict: both seats empty
    if (r.order.length === 0) { delete rooms[code]; continue; }
    // idle evict: no activity past threshold
    if (r.lastActivityAt && now - r.lastActivityAt > ROOM_IDLE_THRESHOLD_MS) {
      clearTurnTimer(r);
      delete rooms[code];
    }
  }
}, CLEANUP_INTERVAL_MS).unref();
```

`lastActivityAt` must be stamped on the room object whenever any game action occurs (fire, placeShips, chat, rejoin). Add it to `createRoom` initialization alongside `turnTimer: null` (`server.js` line 576).

#### 5. `sanitizeProfile()` extension + chat validator (SEC-04)

**Existing sanitizer** (`server.js` lines 137–144):
```javascript
function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return null;
  const name = typeof p.name === "string" ? p.name.replace(/\s+/g, " ").trim().slice(0, 40) : null;
  let photo = typeof p.photo === "string" ? p.photo.trim().slice(0, 500) : null;
  if (photo && !/^https?:\/\//i.test(photo)) photo = null;
  if (!name && !photo) return null;
  return { name, photo };
}
```

**Extension pattern** — add HTML-escaping to `name` (prevents stored XSS on future leaderboards) and strip control characters. Add sibling `sanitizeChat()` following the same guard-clause shape:
```javascript
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Extend sanitizeProfile name processing:
const name = typeof p.name === "string"
  ? escapeHtml(p.name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40))
  : null;

// New sibling validator (same guard-clause style):
function sanitizeChat(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  return cleaned || null;
}
```

Replace the inline text processing in the `chat` handler (`server.js` lines 819–821) with a call to `sanitizeChat()`.

#### 6. CSP header

**Existing middleware pattern** (`server.js` lines 34–40, canonical-host redirect middleware):
```javascript
app.use((req, res, next) => {
  const host = req.headers.host;
  if (CANONICAL_HOST && host && host !== CANONICAL_HOST && /\.onrender\.com$/i.test(host) && req.path !== "/healthz") {
    return res.redirect(301, "https://" + CANONICAL_HOST + req.originalUrl);
  }
  next();
});
```

**CSP header** — add as another `app.use()` middleware immediately after the canonical-host block, same position pattern:
```javascript
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' wss:; frame-ancestors 'none'");
  next();
});
```

#### 7. Guest-credential upsert on connect/resume/rejoin (D-04)

**Existing connect/resume/rejoin pattern** (`server.js` lines 567–682):

`createRoom` (line 571): clientId extracted from `arg.clientId || socket.id`, seat object created.
`resume` (line 649): `clientId` from `arg.clientId`, loops `rooms` to find seat.
`rejoin` (line 664): `clientId` from `arg.clientId`, looks up room+seat directly.

**Upsert pattern** — call an async helper after seat is confirmed/assigned in each of these three handlers, using the pg `ON CONFLICT DO NOTHING` idiom:
```javascript
async function upsertGuestCredential(clientId) {
  if (!clientId) return;
  try {
    await pool.query(
      `INSERT INTO users (created_at) VALUES (now())
       ON CONFLICT DO NOTHING`, // placeholder; actual upsert uses credentials table
      []
    );
    await pool.query(
      `INSERT INTO credentials (user_id, type, external_id, created_at)
       VALUES (
         (SELECT id FROM users u
          JOIN credentials c ON c.user_id = u.id
          WHERE c.type = 'guest' AND c.external_id = $1
          LIMIT 1),
         'guest', $1, now()
       )
       ON CONFLICT (type, external_id) DO NOTHING`,
      [clientId]
    );
  } catch (e) {
    console.error("[db] upsertGuestCredential failed:", e.message);
    // non-fatal: guest play continues even if DB write fails
  }
}
```

Note: actual SQL will use a CTE to atomically insert `users` then `credentials` in one statement. The pattern above is illustrative — planner should use `WITH ins AS (INSERT INTO users ... RETURNING id) INSERT INTO credentials ...`.

The call is fire-and-forget (no `await` in the handler, or `await` but errors caught inside the helper). Follows the graceful-degradation pattern from `store.js` — a failed DB write must never block or crash the game loop.

---

## Shared Patterns

### Guard-clause early return
**Source:** `server.js` lines 595, 623, 625, 688, 725–728
**Apply to:** All new validation logic (rate limiter, doShot guard, migration runner input checks)
```javascript
if (!room || !room.started) return cb && cb({ ok: false });
if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
```

### Structured error codes
**Source:** `server.js` lines 595, 623, 625, 727, 733
**Apply to:** `RATE_LIMITED` (new), `BAD_STATE` (new) — follow exact `{ ok: false, code: "SCREAMING_SNAKE" }` shape
```javascript
return cb && cb({ ok: false, code: "ROOM_NOT_FOUND" });
```

### Logging prefix convention
**Source:** `store.js` lines 27, 30, 32; `server.js` line 900
**Apply to:** `db.js`, migration runner, upsert helper
```javascript
console.log("[store] redis connected — snapshot persistence ON");
console.error("[store] redis unavailable, falling back to RAM-only:", e.message);
console.log(`Battleship server running at http://localhost:${PORT}`);
// new:
console.log("[db] postgres connected");
console.log("[db] migration applied: 001_identity.sql");
console.error("[db] upsertGuestCredential failed:", e.message);
```

### setInterval + .unref() for background tasks
**Source:** `server.js` line 897
**Apply to:** Room-cleanup sweep
```javascript
setInterval(() => { store.saveSnapshot(serializeRooms()); }, SNAPSHOT_MS).unref();
```

### Boot IIFE async sequence
**Source:** `server.js` lines 887–901
**Apply to:** Migration runner insertion point — `await runMigrations(pool)` goes before `await store.init()`, and before `server.listen()`
```javascript
(async () => {
  await runMigrations(pool);  // NEW — fail-loud; throws on error = process exits
  await store.init();
  // ...
  server.listen(PORT, () => { ... });
})();
```

### module.exports singleton
**Source:** `store.js` line 64
**Apply to:** `db.js` — export pool (and optionally `init`) as module-level singleton; never instantiate pool inside a request handler
```javascript
module.exports = { init, isEnabled, saveSnapshot, loadSnapshot };
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `migrations/001_*.sql` | config/schema | batch | No SQL migration files exist in the codebase today |

---

## Metadata

**Analog search scope:** `server.js` (910 lines), `store.js` (65 lines)
**Files scanned:** 2 (all existing JS source files relevant to this phase)
**Pattern extraction date:** 2026-06-01
