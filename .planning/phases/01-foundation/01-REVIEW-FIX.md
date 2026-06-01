---
phase: 01-foundation
fixed_at: 2026-06-01T00:00:00Z
review_path: .planning/phases/01-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-06-01
**Source review:** .planning/phases/01-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, CR-02, WR-01..WR-06)
- Fixed: 8
- Skipped: 0
- Info findings (IN-01..IN-04): out of scope, not addressed

**Test result:** `npm test` → 73 passed, 12 skipped (DB-gated, incl. the new
CR-02 count test which skips without `DATABASE_URL`). No "Vitest caught
unhandled error" warning anymore — the WR-01 boot guard makes server.js
import-safe.

## Fixed Issues

### CR-01: `export const TEST_EXPORTS` turned CommonJS server.js into an ES module

**Files modified:** `server.js`, `test/hardening.test.js`
**Commit:** e11d0fa
**Applied fix:** Replaced the ESM `export const TEST_EXPORTS = {...}` at the
bottom of `server.js` with `module.exports = { TEST_EXPORTS: {...} }` so the
file stays CommonJS. Updated `test/hardening.test.js` from
`import { TEST_EXPORTS } from "../server.js"` to
`import serverModule from "../server.js"; const { TEST_EXPORTS } = serverModule;`
(Vitest CJS default-import interop). Verified `node server.js` no longer throws
`require is not defined` — it now reaches the `require("express")` call
(fails only on missing deps / DB, which is expected without node_modules /
DATABASE_URL).

### CR-02: `upsertGuestCredential` CTE leaked an orphan `users` row per returning guest

**Files modified:** `db.js`, `test/db.test.js`
**Commit:** 7e33221
**Applied fix:** Used the correct conditional `INSERT...SELECT` form (the
review's `INSERT INTO users DEFAULT VALUES SELECT WHERE NOT EXISTS` is invalid
Postgres). The `new_user` CTE is now:
`INSERT INTO users (created_at) SELECT now() WHERE NOT EXISTS (SELECT 1 FROM existing_user) RETURNING id`,
which inserts zero rows for a returning guest. `created_at` is a real
insertable column in `migrations/001_identity.sql` (`id` auto-generates,
`guest_migrated_at` stays NULL). Added a DB-gated test asserting
`SELECT count(*) FROM users` is unchanged across a second
`upsertGuestCredential(sameClientId)` call.
**Note:** Logic/SQL change — recommend human verification against a live DB
(the count test is skipped without `DATABASE_URL`).

### WR-01: Importing server.js booted the server as an import side effect

**Files modified:** `server.js`
**Commit:** e11d0fa
**Applied fix:** Wrapped the boot IIFE in `if (require.main === module) { ... }`
so importing the module in tests no longer runs migrations, `store.init`, the
intervals, or `server.listen`. Confirmed by the absence of the prior unhandled-
rejection warning in the test run.

### WR-02: Chat text was not HTML-escaped (asymmetric with profile names)

**Files modified:** `server.js`
**Commit:** e11d0fa
**Applied fix:** `sanitizeChat` now wraps the cleaned text in `escapeHtml(...)`,
matching `sanitizeProfile`'s server-boundary escaping.

### WR-03: `escapeHtml` threw on non-string input

**Files modified:** `server.js`
**Commit:** e11d0fa
**Applied fix:** Added guard clause `if (typeof s !== "string") return "";` at
the top of `escapeHtml`.

### WR-04: DB-failure on boot died via opaque unhandled rejection

**Files modified:** `server.js`
**Commit:** e11d0fa
**Applied fix:** Wrapped the boot `await runMigrations(pool)` in try/catch that
logs `[db] migration failed on boot, exiting:` and calls `process.exit(1)`.

### WR-05: `joinRoom` reclaim path skipped `upsertGuestCredential`

**Files modified:** `server.js`
**Commit:** e11d0fa
**Applied fix:** Added fire-and-forget `upsertGuestCredential(clientId)` before
the reclaim branch's early return, persisting the reclaimed identity (DATA-01).

### WR-06: `leaveRoom` mid-game left `room.turn` / `room.resolving` stale

**Files modified:** `server.js`
**Commit:** e11d0fa
**Applied fix:** In the opponent-remains branch, also set `room.turn = null` and
`room.resolving = false`, matching `endGameForfeit` / `rematch`.

## Skipped Issues

None in scope. Info findings IN-01..IN-04 were explicitly out of scope and not
addressed.

---

_Fixed: 2026-06-01_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
