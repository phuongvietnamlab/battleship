# Phase 4: Ranked Mode & Leaderboard - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `elo.js` | utility | transform | `db.js` (structure/exports), `store.js` (module shape) | role-match (pure module at root) |
| `migrations/005_rankings.sql` | migration | CRUD | `migrations/004_matches.sql`, `migrations/001_identity.sql` | exact |
| `db.js` (add `recordRankedRatings`, `getLeaderboard`, `refreshLeaderboardCache`) | service | CRUD + request-response | `db.js:recordMatch` (lines 447–488), `db.js:linkOrPromoteAccount` (lines 157–237) | exact |
| `store.js` (add `getLeaderboardCache`, `setLeaderboardCache`) | service | request-response | `store.js:saveSnapshot`/`loadSnapshot` (lines 43–64) | exact |
| `server.js` — `createRoom` ranked flag + guards (line 1214) | controller | request-response | `server.js:createRoom` itself (lines 1214–1233) + `joinRoom` guard (lines 1241–1242) | exact |
| `server.js` — `recordMatch` call sites + new `/api/leaderboard` endpoint | controller | request-response | `server.js:healthz`/`metrics` (lines 55–58), `recordMatch` call at line 1086 | exact |
| `scripts/season-reset.js` | utility | batch | `db.js:linkOrPromoteAccount` transaction pattern (lines 157–237) | role-match |
| `public/app.jsx` — ranked toggle + leaderboard view | component | request-response | `app.jsx` mode picker (lines 697–705), `createRoom` function (lines 1755–1762), `useState` for `mode` (line 1491) | exact |
| `test/elo.test.js` | test | transform | `test/match.test.js` (lines 1–65) | exact |
| `test/ranking.test.js` | test | CRUD | `test/match.test.js` | exact |

---

## Pattern Assignments

### `elo.js` (utility, transform)

**Analog:** `store.js` for module shape (single responsibility, named exports, flat root placement); `db.js` for export convention.

**Module shape pattern** (`store.js` lines 1–16, `db.js` lines 1–17):
```javascript
// Flat root file — no path alias, no barrel. Matches db.js / store.js placement.
// No requires for DB or I/O — pure math only.

const SCALE = 173.7178;
const TAU   = 0.5;
const EPS   = 0.000001;

// ... pure functions ...

module.exports = { updateRatings };
```

**Named-export pattern** (`db.js` lines 532–545):
```javascript
module.exports = {
  pool,
  runMigrations,
  recordMatch,
  // ... one export per capability, flat list
};
```

**Guard clause style** (`db.js` lines 459–469 — from `recordMatch`):
```javascript
// Guard: validate inputs before any work — early return, no nesting
if (!VALID_REASONS.includes(reason)) {
  console.log("[match] invalid reason — skipping");
  return;
}
if (winnerId == null || loserId == null) {
  console.log("[match] unresolvable user_id — skipping");
  return;
}
```

---

### `migrations/005_rankings.sql` (migration, CRUD)

**Analog:** `migrations/004_matches.sql` (lines 1–25) and `migrations/001_identity.sql` (lines 1–21)

**Header comment convention** (`004_matches.sql` lines 1–6):
```sql
-- 004_matches.sql: Durable match records (MATCH-01, MATCH-03)
-- One row per completed 2-player server game. Source of truth for Phase 4 ratings.
-- ...
-- All statements are IF NOT EXISTS guarded so re-running is safe.
```

**CREATE TABLE pattern** (`001_identity.sql` lines 7–20):
```sql
CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  guest_migrated_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS credentials (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, external_id)
);
```

**Index naming convention** (`004_matches.sql` lines 21–24):
```sql
-- Fast lookup comment describing why the index exists
CREATE INDEX IF NOT EXISTS IDX_matches_winner_id ON matches (winner_id);
CREATE INDEX IF NOT EXISTS IDX_matches_loser_id  ON matches (loser_id);
CREATE INDEX IF NOT EXISTS IDX_matches_ended_at  ON matches (ended_at DESC);
```

**ALTER TABLE ADD COLUMN pattern** (anticipated in `004_matches.sql` line 4):
```sql
-- Phase 4 (RANK-01) will add rating columns via ALTER TABLE ADD COLUMN IF NOT EXISTS
-- Use: ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_rating_before REAL;
```

**Migration runner auto-pick**: `db.js` lines 50–65 — file must be named `005_rankings.sql` (lexical sort picks it up automatically after `004_matches.sql`; no runner edit needed).

---

### `db.js` additions: `recordRankedRatings`, `getLeaderboard`, `refreshLeaderboardCache` (service, CRUD)

**Analog:** `db.js:recordMatch` (lines 447–488) for the transaction + graceful-degrade pattern; `db.js:linkOrPromoteAccount` (lines 157–237) for the `pool.connect` → `BEGIN/COMMIT/ROLLBACK/finally release` shape.

**Transaction pattern** (`db.js` lines 472–488 — the exact block to extend):
```javascript
// recordMatch — the transaction that rating write must JOIN (not a new transaction)
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO matches (winner_id, loser_id, reason, mode, started_at, ended_at) VALUES ($1, $2, $3, $4, $5, now())",
    [winnerId, loserId, reason, mode || "classic", startedAt || new Date()]
  );
  // ← ranked rating writes go HERE, before COMMIT, using same `client`
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("[match] recordMatch failed:", e.message);
  // Swallow — never rethrow (D-07)
} finally {
  client.release();
}
```

**Graceful-degrade / swallow pattern** (`db.js` lines 452–458):
```javascript
// Fire-and-forget: a DB failure must never block or break the end-game screen (D-07)
if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE) {
  console.log("[match] DATABASE_URL not set — skipping match record");
  return;
}
// ... errors caught, logged [match], and swallowed (never rethrow)
```

**Parameterized query convention** (`db.js` line 476 — comment at top of INSERT):
```javascript
// All values bound as $N — never string-concatenate (T-03-03 SQL-injection mitigation)
await client.query("SELECT rating, rd, volatility FROM ratings WHERE user_id=$1", [userId]);
```

**Named error code return shape** (`db.js` lines 253–256, `createEmailAccount`):
```javascript
// Guard-clause returning named error code — never throw for validation failures
if (typeof password !== "string" || password.length < 8) {
  return { error: "WEAK_PASSWORD" };
}
```

**Module export addition pattern** (`db.js` lines 532–545):
```javascript
// Add new exports to the flat list at the bottom — never wrap in a class
module.exports = {
  pool,
  runMigrations,
  upsertGuestCredential,
  // ... existing exports ...
  recordMatch,
  // Phase 4 additions:
  recordRankedRatings,   // called from inside recordMatch's transaction
  getLeaderboard,
  refreshLeaderboardCache,
};
```

---

### `store.js` additions: `getLeaderboardCache`, `setLeaderboardCache` (service, request-response)

**Analog:** `store.js:saveSnapshot` (lines 43–51) and `loadSnapshot` (lines 53–62)

**Graceful-degrade cache write pattern** (`store.js` lines 43–51):
```javascript
// Best-effort: a failed snapshot must never crash or block the game loop.
async function saveSnapshot(obj) {
  if (!ready) return;       // ← guard: no-op when Redis unavailable
  try {
    await client.set(KEY, JSON.stringify(obj));
  } catch (e) {
    console.error("[store] saveSnapshot failed:", e.message);
    // swallow — no rethrow
  }
}
```

**Graceful-degrade cache read pattern** (`store.js` lines 53–62):
```javascript
async function loadSnapshot() {
  if (!ready) return null;  // ← guard: return null sentinel when Redis unavailable
  try {
    const s = await client.get(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.error("[store] loadSnapshot failed:", e.message);
    return null;             // ← null sentinel on error, never throw
  }
}
```

**Key naming convention** (`store.js` line 13):
```javascript
const KEY = "battleship:rooms";
// New key follows same namespace: "battleship:leaderboard"
```

**isEnabled guard pattern** (`store.js` line 39):
```javascript
function isEnabled() {
  return ready;
}
// Use: if (!isEnabled()) return null;  — before every Redis operation
```

**`client.set` with TTL** (RANK-04 requires ≤5 min TTL):
```javascript
// client.set with EX option — native Redis TTL, restart-safe (unlike setTimeout)
await client.set(LEADERBOARD_KEY, JSON.stringify(rows), { EX: 300 });
```

**Export addition** (`store.js` line 64):
```javascript
// Add new exports to the flat list
module.exports = { init, isEnabled, saveSnapshot, loadSnapshot, getLeaderboardCache, setLeaderboardCache };
```

---

### `server.js` — `createRoom` ranked flag + guards (controller, request-response)

**Analog:** `server.js:createRoom` lines 1214–1233 (exact match — ranked flag mirrors the `mode` flag)

**Mode flag extraction pattern** (`server.js` line 1218):
```javascript
const mode = (arg && arg.mode) === "advance" ? "advance" : "classic";
// Copy this pattern exactly for ranked flag:
const ranked = !!(arg && arg.ranked === true);
```

**Room object initialization** (`server.js` lines 1219–1220):
```javascript
// Add ranked to the room init object alongside mode
rooms[code] = {
  code, players: {}, order: [], started: false, turn: null, scores: {},
  lastStarter: null, mode, ranked,    // ← ranked added here
  powerups: {}, turnTimer: null, turnDeadline: null, resolving: false,
  lastActivityAt: Date.now()
};
```

**Named-error-code guard pattern** (`server.js` line 1241 — existing ROOM_FULL/GAME_STARTED shape):
```javascript
if (!room) return cb && cb({ ok: false, code: "ROOM_NOT_FOUND" });
// Copy for ranked guest block (D-02):
if (ranked && !socket.data.userId) return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });
// Copy for ranked+advance reject (D-05):
if (ranked && mode === "advance") return cb && cb({ ok: false, code: "RANKED_REQUIRES_CLASSIC" });
```

**socket.data.userId access** (`server.js` line 1224 — already in createRoom):
```javascript
userId: socket.data.userId ?? null,
// For ranked guard: check socket.data.userId directly (server-set, not client payload)
```

---

### `server.js` — `recordMatch` call sites + `/api/leaderboard` endpoint (controller, request-response)

**Analog:** `server.js:recordMatch` call at line 1086; `/healthz` and `/metrics` at lines 55–58

**recordMatch call pattern** (`server.js` lines 1082–1087):
```javascript
// Guard: !room.recorded dedup + order.length===2 belt-and-suspenders
if (winnerId && !room.recorded && room.order.length === 2) {
  room.recorded = true; // synchronous dedup guard — set BEFORE the promise
  const wId = room.players[winnerId]?.userId ?? null;
  const lId = room.players[loserId]?.userId ?? null;
  recordMatch(wId, lId, reason, room.mode, room.startedAt).catch(() => {});
  // Phase 4: add room.ranked as 6th arg:
  // recordMatch(wId, lId, reason, room.mode, room.startedAt, room.ranked).catch(() => {});
}
```

**Express endpoint pattern** (`server.js` lines 55–58):
```javascript
// Liveness probe: cheap, no scan, always 200
app.get("/healthz", (req, res) => res.json({ ok: true, uptimeSec: Math.floor(process.uptime()) }));
// Ops snapshot: JSON, no auth
app.get("/metrics", (req, res) => res.json(computeStats()));
// Leaderboard follows same shape — JSON, no auth, async:
app.get("/api/leaderboard", async (req, res) => {
  try {
    const rows = await getLeaderboard();
    res.json(rows);
  } catch (e) {
    console.error("[leaderboard] endpoint error:", e.message);
    res.status(500).json({ error: "LEADERBOARD_UNAVAILABLE" });
  }
});
```

---

### `scripts/season-reset.js` (utility, batch)

**Analog:** `db.js:linkOrPromoteAccount` (lines 157–237) for the `pool.connect → BEGIN/COMMIT/ROLLBACK/finally release` + `process.exit(1)` on error.

**Transaction + process.exit pattern** (`db.js` lines 157–237 condensed):
```javascript
const { pool } = require("./db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... writes ...
    await client.query("COMMIT");
    console.log("[season-reset] done");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[season-reset] FAILED — rolled back:", e.message);
    process.exit(1);          // ← ops scripts exit non-zero on failure
  } finally {
    client.release();
    await pool.end();         // ← close pool so the process exits cleanly
  }
}
main();
```

**CLI arg extraction** (Node.js built-in pattern):
```javascript
// No new dependencies — process.argv only
const label = process.argv[2] || `Season-${Date.now()}`;
```

**Logging prefix** (`db.js` pattern):
```javascript
console.log("[season-reset] Season \"${label}\" archived.");
console.error("[season-reset] FAILED:", e.message);
```

---

### `public/app.jsx` — ranked toggle + leaderboard view (component, request-response)

**Analog:** `app.jsx` mode picker (lines 697–705), `createRoom` function (lines 1755–1762), `useState` for `mode` (line 1491)

**useState pattern** (`app.jsx` line 1491):
```javascript
const [mode, setMode] = useState("classic"); // classic | advance
// Copy for ranked:
const [ranked, setRanked] = useState(false);
```

**Mode button toggle pattern** (`app.jsx` lines 697–704):
```javascript
<div className="mode-pick">
  <button className={"mode-opt" + (mode === "classic" ? " on" : "")} onClick={() => setMode("classic")}>
    <b>Classic</b><span>{t("mode.classicDesc")}</span>
  </button>
  <button className={"mode-opt" + (mode === "advance" ? " on" : "")} onClick={() => setMode("advance")}>
    <b>Advance ⚡</b><span>{t("mode.advanceDesc")}</span>
  </button>
</div>
// Ranked toggle follows same pattern: boolean checkbox/toggle with disabled when guest
```

**Guest-conditional render** (`app.jsx` lines 714–718):
```javascript
{!authUser && (
  <>
    {/* content shown only to guests */}
  </>
)}
// Ranked toggle: disabled={!authUser} or hidden for guests (D-02 client hint)
```

**i18n string pattern** (`app.jsx` lines 26–27 and 134–135):
```javascript
// EN:
"mode.classicDesc": "Classic, no power-ups",
"mode.advanceDesc": "Collect & use power-ups",
// VI:
"mode.classicDesc": "Cổ điển, không power-up",
"mode.advanceDesc": "Nhặt & dùng power-up",
// New strings follow same pattern:
// "ranked.label" / "ranked.labelVI", "ranked.guestHint" / "ranked.guestHintVI"
// "leaderboard.title" / "leaderboard.titleVI", etc.
```

**createRoom with extra arg** (`app.jsx` lines 1755–1762):
```javascript
function createRoom(mode) {
  setError(null);
  setVsBot(false); setMode(mode === "advance" ? "advance" : "classic");
  socket.emit("createRoom", { clientId, mode }, (res) => {
    if (res.ok) { setCode(res.code); persistRoom(res.code); setScreen("room"); }
  });
}
// Phase 4: add ranked flag to the emit payload:
// socket.emit("createRoom", { clientId, mode, ranked }, (res) => { ... });
```

**Error display pattern** (`app.jsx` lines 716–720):
```javascript
{authError && (
  <div className="error">
    {authError === "rateLimited" ? t("auth.errRateLimited") : t("auth.errFailed")}
  </div>
)}
// Ranked error (RANKED_REQUIRES_ACCOUNT): same pattern, check res.code in joinRoom callback
```

---

### `test/elo.test.js` and `test/ranking.test.js` (test, transform / CRUD)

**Analog:** `test/match.test.js` (lines 1–65)

**Test file structure** (`test/match.test.js` lines 1–15):
```javascript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
```

**Static (no-DB) test pattern** (`test/match.test.js` lines 12–56):
```javascript
// Static checks (no DB required) — always run first
describe("migrations/004_matches.sql — static DDL checks", () => {
  it("file exists", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    expect(fs.existsSync(p)).toBe(true);
  });
  it("contains CREATE TABLE IF NOT EXISTS matches", () => {
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS matches/);
  });
});
// For elo.test.js: test pure math — no DB needed, always runs
// For ranking.test.js: static checks first, then DB-gated integration tests
```

---

## Shared Patterns

### Transaction Pattern (BEGIN/COMMIT/ROLLBACK/finally release)
**Source:** `db.js` lines 157–237 (`linkOrPromoteAccount`) and lines 472–488 (`recordMatch`)
**Apply to:** `db.js` ranked rating writes inside `recordMatch`, `scripts/season-reset.js`
```javascript
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // ... parameterized writes using client (not pool) ...
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("[prefix] operation failed:", e.message);
  // recordMatch: swallow. linkOrPromoteAccount/season-reset: rethrow or process.exit(1)
} finally {
  client.release();
}
```

### Named Error Code Return Shape
**Source:** `db.js` lines 253–256, `server.js` line 1241
**Apply to:** `server.js:createRoom` ranked guards, `server.js:joinRoom` ranked guard
```javascript
// Socket event callback: { ok: false, code: "NAMED_ERROR_CODE" }
return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });
return cb && cb({ ok: false, code: "RANKED_REQUIRES_CLASSIC" });
// db.js function return: { error: "NAMED_ERROR_CODE" }
return { error: "WEAK_PASSWORD" };
```

### Redis Graceful-Degrade Pattern
**Source:** `store.js` lines 18–37 (`init`), lines 39–41 (`isEnabled`), lines 43–62
**Apply to:** `store.js` leaderboard cache exports, `db.js:getLeaderboard` fallback
```javascript
// Always check isEnabled() before any Redis call
if (!isEnabled()) return null;  // or return fallback value
try {
  const val = await client.get(KEY);
  return val ? JSON.parse(val) : null;
} catch (e) {
  console.error("[store] operation failed:", e.message);
  return null;  // never throw — fall through to Postgres fallback
}
```

### Fire-and-Forget / Best-Effort Async
**Source:** `server.js` lines 1086, 1160, 761, 1570
**Apply to:** `recordMatch` call sites (adding `room.ranked` arg), `refreshLeaderboardCache` post-commit call
```javascript
// Pattern: .catch(() => {}) swallows all errors — never blocks the game path
recordMatch(wId, lId, reason, room.mode, room.startedAt, room.ranked).catch(() => {});
// Post-commit cache refresh (fire-and-forget, after COMMIT):
refreshLeaderboardCache().catch(() => {});
```

### Parameterized SQL (Never String-Concatenate)
**Source:** `db.js` lines 475–479, comment on line 475
**Apply to:** All new queries in `db.js` (ratings UPSERT, leaderboard SELECT, matches snapshot UPDATE)
```javascript
// All values bound as $N — never string-concatenate (SQL-injection mitigation)
await client.query(
  "SELECT rating, rd, volatility FROM ratings WHERE user_id=$1",
  [userId]
);
// Multi-param: $1, $2, $3, ... positional, matching array order
```

### Logging Prefix Convention
**Source:** `db.js` lines 64, 113, 184 — `[db]`, `[match]` prefixes
**Apply to:** All new console.log/error in `db.js` rated writes, `store.js` leaderboard, `scripts/season-reset.js`
```javascript
console.log("[match] DATABASE_URL not set — skipping match record");
console.error("[match] recordMatch failed:", e.message);
// New prefixes: [leaderboard], [season-reset], [elo]
```

---

## No Analog Found

All files have close analogs in the codebase. No entries.

---

## Metadata

**Analog search scope:** `db.js`, `store.js`, `server.js`, `public/app.jsx`, `migrations/001_identity.sql`, `migrations/004_matches.sql`, `test/match.test.js`
**Files scanned:** 7 source files read in full
**Pattern extraction date:** 2026-06-03
