# Phase 3: Match Recording - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 4 (1 new migration, 1 db.js extension, 1 server.js multi-site extension, 1 new test file)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `migrations/004_matches.sql` | migration | batch (DDL) | `migrations/003_email_accounts.sql` | exact |
| `db.js` (add `recordMatch`) | service | CRUD (write) | `db.js` `upsertGuestCredential` + `linkOrPromoteAccount` (lines 75-237) | exact — same file, same pool/transaction pattern |
| `server.js` (3 call sites + seat userId + startedAt) | controller | event-driven | `server.js` `endGameForfeit` + `scheduleSeatRelease` + `doShot` win path (lines 726-744, 1047-1059, 1116-1124) | exact — same file |
| `test/match.test.js` | test | batch | `test/db.test.js` + `test/migrate.test.js` | exact |

---

## Pattern Assignments

### `migrations/004_matches.sql` (migration, DDL)

**Analog:** `migrations/003_email_accounts.sql`

**File header pattern** (lines 1-6 of `003_email_accounts.sql`):
```sql
-- 003_email_accounts.sql: Email/password account schema additions (AUTH-06 / D-14 / D-15 / D-19)
-- Extends users and credentials for email-based accounts; adds auth_tokens for
-- single-use, time-limited verification + password-reset tokens (Plans 07/08/09).
-- migrations/002_accounts.sql is FINAL — this file adds only what email auth needs.
-- All statements are IF NOT EXISTS guarded so re-running is safe.
```
New file must follow this exactly: line 1 = file-name comment + requirement IDs, explain what the table is for, note Phase 4 extensibility.

**CREATE TABLE pattern** (`003_email_accounts.sql` lines 28-36):
```sql
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token       TEXT NOT NULL UNIQUE,
  purpose     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Copy: `SERIAL PRIMARY KEY`, `INTEGER NOT NULL REFERENCES users(id)`, `TIMESTAMPTZ NOT NULL DEFAULT now()` column types, `IF NOT EXISTS` guard. Add `CHECK` constraint for `reason` as in-line `CONSTRAINT matches_reason_check`.

**Index naming pattern** (`002_accounts.sql` lines 23-24):
```sql
CREATE INDEX IF NOT EXISTS "IDX_session_expire"  ON "session" ("expire");
CREATE INDEX IF NOT EXISTS "IDX_session_user_id" ON "session" ("user_id");
```
Index names prefixed `IDX_`, `CREATE INDEX IF NOT EXISTS`, one statement per column.

**ALTER TABLE additive-only pattern** (`002_accounts.sql` lines 8-10):
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;
```
Not needed for `004_matches.sql` (new table, not altering existing). Shown for Phase 4 reference — `005_rankings.sql` will use this pattern to add rating columns to `matches`.

---

### `db.js` — add `recordMatch` export (service, CRUD write)

**Analog 1:** `db.js` `upsertGuestCredential` (lines 75-113) — graceful-degrade + fire-and-forget pattern

**Graceful-degrade no-op pattern** (`store.js` lines 19-21, 44-46 — the clearest instance):
```javascript
// store.js lines 19-21
const REDIS_URL = process.env.REDIS_URL || "";
// ...
async function saveSnapshot(obj) {
  if (!ready) return;   // no-op when dependency absent
  try {
    await client.set(KEY, JSON.stringify(obj));
  } catch (e) {
    console.error("[store] saveSnapshot failed:", e.message);
  }
}
```
`recordMatch` mirrors this: check `process.env.DATABASE_URL` (and `PGHOST`/`PGDATABASE` per db.js lines 22-32) at the top of the function; log with `[match]` prefix and return early if absent.

**db.js pool config check** (lines 22-32) — derive the guard from this:
```javascript
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: sslConfig, max: 10 }
  : {
      host: process.env.PGHOST || "localhost",
      port: parseInt(process.env.PGPORT || "5432", 10),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: sslConfig,
      max: 10,
    };
```
The no-op guard should be: `if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE)`.

**Analog 2:** `db.js` `linkOrPromoteAccount` (lines 157-237) — transaction pattern to copy verbatim

**Transaction pattern** (`db.js` lines 158-236):
```javascript
async function linkOrPromoteAccount(provider, externalId, name, avatarUrl, pendingClientId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... parameterized queries with $1/$2/... bindings ...
    await client.query("COMMIT");
    // ... final SELECT ...
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[db] linkOrPromoteAccount failed:", e.message);
    throw e;  // <-- NOTE: linkOrPromoteAccount rethrows; recordMatch must SWALLOW (D-07)
  } finally {
    client.release();
  }
}
```
**Critical difference:** `linkOrPromoteAccount` rethrows on catch (line 233: `throw e`). `recordMatch` must swallow — `console.error("[match] recordMatch failed:", e.message)` then return, never throw. This is the same pattern as `upsertGuestCredential` (lines 110-112).

**Swallow-on-catch pattern** (`db.js` `upsertGuestCredential` lines 110-113):
```javascript
  } catch (e) {
    console.error("[db] upsertGuestCredential failed:", e.message);
    // Non-fatal: guest play continues even if DB write fails (T-01-A1).
  }
```

**Guest userId resolution pattern** (`db.js` lines 163-167 inside `linkOrPromoteAccount`):
```javascript
const { rows: existing } = await client.query(
  "SELECT user_id FROM credentials WHERE type=$1 AND external_id=$2",
  [provider, externalId]
);
```
For the optional guest fallback lookup in `recordMatch`, adapt as:
```javascript
const { rows } = await client.query(
  "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
  [clientId]
);
return rows.length > 0 ? rows[0].user_id : null;
```

**module.exports pattern** (`db.js` lines 489-501):
```javascript
module.exports = {
  pool,
  runMigrations,
  upsertGuestCredential,
  linkOrPromoteAccount,
  sanitizeDisplayName,
  createEmailAccount,
  verifyEmailLogin,
  createAuthToken,
  consumeAuthToken,
  markEmailVerified,
  setEmailPassword,
};
```
Add `recordMatch` to this object. No new file, no barrel — flat addition to the existing exports.

**Section header comment pattern** (`db.js` lines 68-73):
```javascript
// ─── Guest-credential upsert ─────────────────────────────────────────────────
// Fire-and-forget from connect handlers. A DB failure must never block guest play.
//
// SQL is parameterized — clientId bound as $1, never string-concatenated (T-01-02).
```
New `recordMatch` section header must follow this style: `// ─── recordMatch ───...`, followed by 2-3 lines explaining fire-and-forget and best-effort semantics.

---

### `server.js` — 3 call sites + seat userId + startedAt (controller, event-driven)

**Analog 1: `doShot` win path** — where to add call site 1 (`server.js` lines 1116-1124):
```javascript
  if (win) {
    room.scores = room.scores || {};
    room.scores[clientId] = (room.scores[clientId] || 0) + 1;
    emitScores(room);
    emitToClient(room, clientId, "gameOver", { win: true });
    emitToClient(room, opp, "gameOver", { win: false });
    room.started = false;
    clearTurnTimer(room);
    return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
  }
```
Insert `room.recorded` guard + `recordMatch` fire-and-forget call AFTER `emitToClient(...gameOver...)` and BEFORE `return`. Pattern: `gameOver` emits always happen first (D-07).

**Analog 2: `endGameForfeit`** — where to add call site 2 (`server.js` lines 1047-1059):
```javascript
function endGameForfeit(room, loserId, reason) {
  clearTurnTimer(room);
  const winnerId = opponentOf(room, loserId);
  if (winnerId) {
    room.scores = room.scores || {};
    room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
    emitScores(room);
    emitToClient(room, winnerId, "gameOver", { win: true, reason });
  }
  emitToClient(room, loserId, "gameOver", { win: false, reason });
  room.started = false;
  room.turn = null;
}
```
Insert `room.recorded` guard + `recordMatch` call at the end, after both `gameOver` emits. `winnerId` and `loserId` are already local variables here — use `room.players[winnerId]?.userId` and `room.players[loserId]?.userId`.

**Analog 3: `scheduleSeatRelease`** — where to add call site 3 (`server.js` lines 726-745):
```javascript
function scheduleSeatRelease(room, code, clientId, ms) {
  const p = room.players[clientId];
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    const r2 = rooms[code];
    if (!r2 || !r2.players[clientId]) return;
    if (r2.players[clientId].online) return; // came back
    r2.order = r2.order.filter((id) => id !== clientId);
    delete r2.players[clientId];              // <-- seat deleted HERE
    clearTurnTimer(r2);
    if (r2.order.length === 0) {
      delete rooms[code];
    } else {
      io.to(code).emit("opponentLeft");
      r2.started = false;
      io.to(code).emit("roomUpdate", roomPublic(r2));
    }
  }, ms != null ? ms : GRACE_MS);
}
```
CRITICAL: capture `loserId`, `winnerId`, `loserUserId`, `winnerUserId`, `startedAt` from `r2` BEFORE `delete r2.players[clientId]` (line 735). The seat object is gone after that line.

**`leaveRoom` handler** — where `room.started` must be read BEFORE mutation (`server.js` lines 1506-1531):
```javascript
  socket.on("leaveRoom", (cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (room && clientId && room.players[clientId]) {
      const p = room.players[clientId];
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      room.order = room.order.filter((id) => id !== clientId);
      delete room.players[clientId];           // <-- seat deleted
      socket.leave(code);
      clearTurnTimer(room);
      if (room.order.length === 0) {
        delete rooms[code];
      } else {
        io.to(code).emit("opponentLeft");
        room.started = false;                  // <-- started cleared AFTER delete
```
Guard `if (room.started && !room.recorded && room.order.length === 2)` must be placed at the TOP of the `if (room && clientId && room.players[clientId])` block, before any mutations. Capture `winnerId = opponentOf(room, clientId)` and seat userIds before `delete room.players[clientId]`.

**`createRoom` handler** — where to store `userId` on seat (`server.js` lines 1176-1192):
```javascript
  socket.on("createRoom", (arg, cb) => {
    // ...
    rooms[code].players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
    };
```
Add `userId: socket.data.userId ?? null` to this player seat object. The `socket.data.userId` is set at connection time (line 1172-1173). Same addition needed in `joinRoom`, `resume`, and `rejoin` handlers wherever a seat is assigned.

**`placeShips` allReady path** — where to capture `startedAt` (`server.js` lines 1314-1315):
```javascript
    if (allReady) {
      room.started = true;
```
Add `room.startedAt = new Date();` on the very next line after `room.started = true`. Also add `startedAt: r.startedAt || null` to `serializeRooms()` (line ~756 player snapshot), and `startedAt: s.startedAt ? new Date(s.startedAt) : null` in `restoreRooms()`.

**Fire-and-forget call site pattern** (copy this shape at all 3 sites):
```javascript
if (!room.recorded) {
  room.recorded = true;           // synchronous guard — must be set BEFORE await
  const wId = room.players[winnerId]?.userId ?? null;
  const lId = room.players[loserId]?.userId ?? null;
  recordMatch(wId, lId, reason, room.mode, room.startedAt).catch(() => {});
}
```
The `.catch(() => {})` silences unhandled rejection — errors are already logged inside `recordMatch`.

---

## Shared Patterns

### Graceful No-Op (dependency absent)
**Source:** `store.js` lines 44-51 (saveSnapshot), `db.js` `upsertGuestCredential` lines 77-113
**Apply to:** `recordMatch` in `db.js`
```javascript
// store.js lines 44-46 — clearest shape
async function saveSnapshot(obj) {
  if (!ready) return;  // no-op when Redis absent
  try {
    // ...
  } catch (e) {
    console.error("[store] saveSnapshot failed:", e.message);
  }
}
```
`recordMatch` checks `DATABASE_URL`/`PGHOST`/`PGDATABASE` at function entry; logs with `[match]` prefix; returns without throw.

### Parameterized Queries
**Source:** `db.js` throughout (every query uses `$1`, `$2`, etc.)
**Apply to:** All SQL in `recordMatch` and any `resolveUserId` helper
```javascript
// db.js line 79 — established form
await pool.query(
  `... WHERE c.type = 'guest' AND c.external_id = $1 ...`,
  [clientId]
);
```
Never concatenate `clientId`, `reason`, `mode`, or any user-derived value into SQL strings.

### `[prefix]` Console Log Style
**Source:** `db.js` line 36 (`[db] pool error`), line 64 (`[db] migration applied`), `store.js` line 28 (`[store] redis error`)
**Apply to:** All `console.log` / `console.error` in `recordMatch` and call sites
```javascript
console.error("[match] recordMatch failed:", e.message);
console.log("[match] DATABASE_URL not set — skipping match record");
console.warn("[match] unresolvable user_id for clientId — skipping");
```

### Transaction Shape
**Source:** `db.js` `linkOrPromoteAccount` lines 158-236
**Apply to:** `recordMatch` body
```javascript
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // ... INSERT ...
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("[match] recordMatch failed:", e.message);
  // swallow — never rethrow (D-07)
} finally {
  client.release();
}
```

### Guard-Clause Style
**Source:** `server.js` `doShot` line 1083, `scheduleSeatRelease` lines 732-733
**Apply to:** All call sites in `server.js`
```javascript
// server.js line 1083 — guard-clause style
if (!Array.isArray(cells) || !cells.length) return { ok: false, code: "BAD_STATE" };
// server.js line 1064
if (!room.started || room.turn !== who) return;
```
All three call sites start with `if (!room.started || room.recorded || room.order.length < 2) return/skip`.

---

### `test/match.test.js` (test, batch)

**Analog 1:** `test/db.test.js` — static shape checks + skipIf DB guard

**Test file structure** (`test/db.test.js` lines 1-13):
```javascript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
```
Copy this exact imports block. All test files use ESM (`import`), not CJS (`require`). The `__dirname` shim is always needed in ESM.

**skipIf DB guard** (`test/db.test.js` lines 44-46):
```javascript
const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)("upsertGuestCredential — idempotency (requires DB)", () => {
```
New test file uses this same `const hasDatabaseUrl = !!process.env.DATABASE_URL;` guard on all DB-integration describes. Static checks (file existence, export shape, source text assertions) run unconditionally.

**Analog 2:** `test/migrate.test.js` — DB integration test with beforeAll/afterAll + schema column checks

**beforeAll/afterAll cleanup pattern** (`test/migrate.test.js` lines 18-31):
```javascript
  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    runMigrations = db.runMigrations;
    await pool.query("DROP TABLE IF EXISTS schema_migrations CASCADE");
    // ...
  });

  afterAll(async () => {
    await pool.end();
  });
```
`test/match.test.js` beforeAll: import db, run migrations, insert test `users` rows for winner/loser. afterAll: `DELETE FROM matches WHERE ...`, `await pool.end()`.

**Schema column check pattern** (`test/migrate.test.js` lines 50-58):
```javascript
  it("creates the users table with expected columns", async () => {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY column_name"
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("created_at");
  });
```
Use the same `information_schema.columns` query to verify `matches` table columns after migration.

**Static file existence check** (`test/migrate.test.js` lines 99-114):
```javascript
describe("migrations/001_identity.sql — static DDL checks", () => {
  it("file exists", () => {
    const p = path.join(rootDir, "migrations", "001_identity.sql");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("contains CREATE TABLE for users, credentials, schema_migrations", () => {
    const p = path.join(rootDir, "migrations", "001_identity.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8").toLowerCase();
    expect(sql).toMatch(/create table.*users/s);
  });
});
```
`test/match.test.js` static block: check `migrations/004_matches.sql` exists, contains `CREATE TABLE IF NOT EXISTS matches`, contains the reason CHECK constraint, contains `IDX_matches_winner_id`.

**db.js export check** (`test/db.test.js` lines 11-18 — adapt for recordMatch):
```javascript
  it("exports pool, runMigrations, and upsertGuestCredential", async () => {
    const db = await import("../db.js");
    expect(typeof db.pool).toBe("object");
    expect(typeof db.runMigrations).toBe("function");
    expect(typeof db.upsertGuestCredential).toBe("function");
  });
```
Add an analogous `it("exports recordMatch as a function")` check.

---

## No Analog Found

All four files have close analogs. No entries here.

---

## Metadata

**Analog search scope:** `migrations/`, `db.js`, `server.js`, `store.js`, `test/`
**Files scanned:** 10 (3 migration files, db.js, server.js, store.js, test/db.test.js, test/migrate.test.js, test/auth.test.js, test/profile.test.js)
**Pattern extraction date:** 2026-06-02
