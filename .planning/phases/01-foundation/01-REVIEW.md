---
phase: 01-foundation
reviewed: 2026-06-01T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - db.js
  - migrations/001_identity.sql
  - package.json
  - server.js
  - test/db.test.js
  - test/hardening.test.js
  - test/migrate.test.js
  - test/ratelimit.test.js
  - vitest.config.js
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-01
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 01 delivers Postgres identity persistence, per-event rate limiting, a turn-clock race guard, the `doShot` null-guard, a room-eviction sweep, input sanitization, and a CSP header. The hardening primitives (rate limiters, `doShot` guard, `sweepRooms`, `sanitizeProfile`, CSP value) are individually sound and well-tested in isolation.

However, the review surfaced two BLOCKER-level defects that undermine the whole submission:

1. **The production server cannot boot.** `export const TEST_EXPORTS` (ESM syntax) was added to the bottom of an otherwise CommonJS `server.js`. On Node 24 this forces the file to be reparsed as an ES module, after which every `require(...)` call at the top throws `ReferenceError: require is not defined in ES module scope`. `node server.js` (i.e. `npm start`, the Render entrypoint) exits 1 immediately.
2. **The migration CTE leaks an orphaned `users` row on every repeat guest connection**, and the test that purports to guard against this does not actually count user rows, so the bug ships green.

The green test run (73 passed) is itself misleading: importing `server.js` executes the boot IIFE as an import side effect, producing an unhandled Postgres rejection that Vitest explicitly warns "might cause false positive tests." These two issues must be fixed before this phase ships.

## Critical Issues

### CR-01: `export const TEST_EXPORTS` turns CommonJS `server.js` into an ES module — production boot crashes

**File:** `server.js:1043`
**Issue:**
`server.js` is written in CommonJS (`const express = require("express")` at line 6, `module`-style throughout, no `"type": "module"` in `package.json`). Line 1043 introduces ESM `export` syntax:

```js
export const TEST_EXPORTS = { doShot, rooms, sweepRooms, ... };
```

On Node 24, the presence of `export` causes the loader to reparse the file as an ES module (`MODULE_TYPELESS_PACKAGE_JSON` warning: "Reparsing as ES module because module syntax was detected"). As an ES module, the top-level `require(...)` calls are invalid. Verified directly:

```
$ node server.js
ReferenceError: require is not defined in ES module scope, you can use import instead
    at file:///C:/battleship/server.js:6:17
EXIT: 1
```

`npm start` runs `node server.js`, so the deployed server never starts. The unit tests pass only because Vitest imports the file through its ESM pipeline, where the boot IIFE's failure is swallowed as an unhandled rejection rather than a hard exit.

**Fix:** Do not mix module systems. Export via CommonJS so the file stays CJS:

```js
// remove the `export const TEST_EXPORTS = {...}` block, and instead:
module.exports = { /* whatever server.js legitimately exports, if anything */ };
module.exports.TEST_EXPORTS = {
  doShot, rooms, sweepRooms, escapeHtml, sanitizeProfile,
  sanitizeChat, cspMiddleware, CSP_HEADER_VALUE,
};
```

Then update the test imports from `import { TEST_EXPORTS } from "../server.js"` to a CJS-compatible import (`const { TEST_EXPORTS } = require("../server.js")` or Vitest default-import interop). Re-run `node server.js` to confirm the process stays up and logs `Battleship server running...`.

### CR-02: `upsertGuestCredential` CTE creates an orphan `users` row on every call for an existing guest

**File:** `db.js:73-106` (CTE at lines 85-95)
**Issue:**
In Postgres, **every data-modifying CTE in a statement executes exactly once**, regardless of whether its output is referenced downstream. The `new_user` CTE unconditionally inserts a row:

```sql
new_user AS (
  INSERT INTO users DEFAULT VALUES
  RETURNING id
),
resolved_user AS (
  SELECT id FROM existing_user
  UNION ALL
  SELECT id FROM new_user
  WHERE NOT EXISTS (SELECT 1 FROM existing_user)   -- only filters which id flows on
  LIMIT 1
)
```

The `WHERE NOT EXISTS (...)` clause only controls which `id` is *selected* into `resolved_user`; it does **not** prevent the `INSERT INTO users`. So for a returning guest (clientId already in `credentials`), the function still inserts a brand-new `users` row. That row gets no credential (the final `INSERT ... ON CONFLICT DO NOTHING` is a no-op because the credential already exists), so it is orphaned. `upsertGuestCredential` is called fire-and-forget on `createRoom`, `joinRoom`, `resume`, and `rejoin` — every reconnect of an existing guest leaks one `users` row. Over time the `users` table grows unbounded with rows that represent no real identity, corrupting any future per-user aggregation (ranked progression in later phases).

The guarding test (`test/db.test.js:76-93`, "does not create a second users row") only checks that the credential's `user_id` still resolves to one user — it never counts total rows in `users`, so the leak is invisible to the suite.

**Fix:** Guard the INSERT itself so it runs only when no existing user was found:

```sql
WITH existing_user AS (
  SELECT u.id
  FROM users u
  JOIN credentials c ON c.user_id = u.id
  WHERE c.type = 'guest' AND c.external_id = $1
  LIMIT 1
),
new_user AS (
  INSERT INTO users DEFAULT VALUES
  SELECT WHERE NOT EXISTS (SELECT 1 FROM existing_user)   -- conditional INSERT
  RETURNING id
),
resolved_user AS (
  SELECT id FROM existing_user
  UNION ALL
  SELECT id FROM new_user
  LIMIT 1
)
INSERT INTO credentials (user_id, type, external_id)
SELECT id, 'guest', $1 FROM resolved_user
ON CONFLICT (type, external_id) DO NOTHING
```

(`INSERT ... SELECT WHERE NOT EXISTS (...)` inserts zero rows when the guest already exists.) Add a test that asserts `SELECT count(*) FROM users` is unchanged across a second `upsertGuestCredential(sameClientId)` call.

## Warnings

### WR-01: Importing `server.js` boots the server as an import side effect (no main-module guard)

**File:** `server.js:1012-1031`
**Issue:**
The boot IIFE (`(async () => { await runMigrations(pool); await store.init(); ... server.listen(PORT) })()`) runs unconditionally at module load. There is no `require.main === module` / `import.meta.url` guard. Because `test/hardening.test.js:49` imports the module to reach `TEST_EXPORTS`, the test run triggers `runMigrations`, `store.init`, the snapshot/sweep `setInterval`s, and `server.listen`. With no DB reachable this produces an unhandled rejection that Vitest reports: "Vitest caught 1 unhandled error... This might cause false positive tests." With a DB reachable, the test process would additionally bind `PORT` and run real migrations against the configured database — a destructive side effect for anyone running `npm test` with `DATABASE_URL` set.
**Fix:** Guard the boot sequence so it only runs when the file is the entrypoint:

```js
if (require.main === module) {
  (async () => { await runMigrations(pool); /* ...listen... */ })();
}
```

(After CR-01 makes the file CJS again, `require.main === module` is the correct guard.) This makes the module import-safe for tests.

### WR-02: Chat text is not HTML-escaped, unlike profile names — inconsistent XSS defense

**File:** `server.js:186-190` (`sanitizeChat`) vs `server.js:171-182` (`sanitizeProfile`)
**Issue:**
`sanitizeProfile` HTML-escapes the name (`escapeHtml(...)`) "so stored names cannot inject markup." `sanitizeChat` strips control characters and caps length but does **not** call `escapeHtml`. Chat text containing `<img src=x onerror=...>` is relayed verbatim to the opponent (`server.js:948`). The phase scope explicitly calls out "stored XSS via player names/chat," and the codebase has already decided to escape at the server boundary for names — chat is the asymmetric gap. Whether it becomes executable XSS depends on client rendering (safe if rendered as a React text node; unsafe if injected via `innerHTML`/`dangerouslySetInnerHTML`), but the server-side defense is inconsistent with the project's own pattern and should not rely on the client.
**Fix:** Apply the same escaping to chat:

```js
function sanitizeChat(text) {
  if (typeof text !== "string") return null;
  const cleaned = escapeHtml(
    text.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200)
  );
  return cleaned || null;
}
```

Confirm the client renders chat as escaped text (and does not double-escape if it already uses text nodes).

### WR-03: `escapeHtml` will throw on non-string input

**File:** `server.js:161-168`
**Issue:**
`escapeHtml(s)` calls `s.replace(...)` with no type guard. All current callers pre-coerce to string, but it is exported in `TEST_EXPORTS` and is a reusable utility; a future caller passing `undefined`/`null`/a number crashes with `TypeError: s.replace is not a function`. Given the guard-clause convention in CLAUDE.md, this primitive should defend its own input.
**Fix:**

```js
function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s.replace(/&/g, "&amp;")./* ...rest unchanged... */;
}
```

### WR-04: DB-failure unhandled rejection on boot is fatal but undiagnosable

**File:** `server.js:1012-1014`, `db.js:40-64`
**Issue:**
`runMigrations` is intentionally fail-loud (good, per DATA-02), but it is awaited inside a bare IIFE with no surrounding `try/catch` and no `.catch()` on the IIFE promise. When the DB is unreachable the process dies via an *unhandled promise rejection* rather than a clean, logged `[db] migration failed: ...; exiting`. On Render this surfaces as an opaque stack trace (the `SASL: SCRAM-SERVER-FIRST-MESSAGE` error observed here) instead of an actionable message. It also leaves the `store`/sweep intervals and any partially-applied migration in an ambiguous state.
**Fix:** Wrap the boot in explicit error handling:

```js
(async () => {
  try {
    await runMigrations(pool);
  } catch (e) {
    console.error("[db] migration failed on boot, exiting:", e.message);
    process.exit(1);
  }
  await store.init();
  /* ...rest... */
})();
```

### WR-05: `joinRoom` reclaim path skips `upsertGuestCredential`

**File:** `server.js:690-696`
**Issue:**
`createRoom`, the normal `joinRoom` join, `resume`, and `rejoin` all call `upsertGuestCredential(clientId)` to persist durable identity (DATA-01). The reclaim branch (`room.order.length >= 2` → `reclaimSeat(...)`) returns early without it. A player whose `clientId` changed (the exact scenario reclaim exists for — localStorage cleared) re-enters via this path and never gets a credential row written for the new id. This is precisely the case where persisting the new identity matters most, and it is the only join path that omits the call.
**Fix:** Add the fire-and-forget call before returning from the reclaim branch:

```js
if (offlineId) {
  reclaimSeat(room, code, offlineId, clientId, socket);
  upsertGuestCredential(clientId); // DATA-01: persist reclaimed identity
  return cb && cb({ ok: true, code, reclaimed: true });
}
```

### WR-06: `leaveRoom` mid-game leaves `room.turn` / `room.resolving` stale

**File:** `server.js:972-993`
**Issue:**
When a player leaves an in-progress game and an opponent remains, the handler sets `room.started = false` and clears the turn timer, but does not reset `room.turn` or `room.resolving`. `room.turn` still points at a (possibly now-deleted) clientId, and if the leave races with an in-flight shot, `room.resolving` could remain `true`, wedging the room so a later rematch's `fire`/`useAbility` is rejected with `BAD_STATE` until eviction. Contrast `endGameForfeit` (line 532) and `rematch` (lines 967-968), which both null out `room.turn`.
**Fix:** In the `order.length > 0` branch of `leaveRoom`, also reset turn state:

```js
} else {
  io.to(code).emit("opponentLeft");
  room.started = false;
  room.turn = null;
  room.resolving = false;
  io.to(code).emit("roomUpdate", roomPublic(room));
}
```

## Info

### IN-01: CSP omits `object-src`, `base-uri`, and allows `style-src 'unsafe-inline'`

**File:** `server.js:46`
**Issue:** The CSP is a solid start (`script-src 'self'`, `frame-ancestors 'none'`) but omits `object-src 'none'` (blocks legacy plugin vectors) and `base-uri 'self'` (blocks `<base>` hijacking that can subvert relative script paths). `style-src 'unsafe-inline'` is also broad. None are exploitable on their own here, but they are cheap hardening that matches the "defense-in-depth" intent stated in the comment.
**Fix:** Append `object-src 'none'; base-uri 'self'` to `CSP_HEADER_VALUE`; consider moving inline styles to the bundle to drop `'unsafe-inline'` from `style-src` in a later pass.

### IN-02: Coordinate-bounds logic duplicated between `inBounds` and `validatePlacement`

**File:** `server.js:109-111` and `server.js:132`
**Issue:** `validatePlacement` re-implements the bounds check (`r < 0 || r >= BOARD || c < 0 || c >= BOARD`) inline instead of reusing `inBounds(r, c)`. Two copies of the same rule can drift (e.g. if `inBounds` later adds integer validation that the inline copy lacks — which is already the case: the inline copy does not assert `Number.isInteger`).
**Fix:** Reuse `if (!inBounds(r, c)) return null;` inside the placement loop so integer + range validation stays single-sourced.

### IN-03: `chat` handler computes `now` but the throttle/dedup it once supported is gone

**File:** `server.js:946-948`
**Issue:** `const now = Date.now()` is used only as the `ts` field on the relayed message — harmless, but the duplicated comment block at lines 924-927 (two near-identical "Relay a chat message..." comments) suggests an earlier in-handler throttle was refactored out into `chatLimiter` and the comments/locals were not fully cleaned up.
**Fix:** Remove the duplicate comment block (keep the lines 926-927 version that references the rate limiter).

### IN-04: `vitest.config.js` does not isolate DB-dependent suites; green run hides a crashed boot

**File:** `vitest.config.js:1-8`, `test/hardening.test.js:49`
**Issue:** With `environment: "node"` and no `setupFiles`/pool, the suite that imports `server.js` triggers the boot IIFE (see WR-01). The run reports "73 passed" while emitting an unhandled rejection — a maintainer scanning the summary would not notice the server failed to initialize. This is a test-reliability concern: the suite's green status does not imply the server is bootable (it is not — see CR-01).
**Fix:** After fixing CR-01/WR-01 (main-module guard), importing `server.js` will no longer boot. Additionally consider failing the run on unhandled rejections (Vitest `dangerouslyIgnoreUnhandledErrors: false` is the default; surface it in CI logs).

---

_Reviewed: 2026-06-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
