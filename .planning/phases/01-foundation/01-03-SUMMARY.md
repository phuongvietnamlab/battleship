---
phase: 01-foundation
plan: 03
subsystem: security/hardening
tags: [doShot-guard, room-cleanup, sanitization, CSP, SEC-02, SEC-03, SEC-04]
dependency_graph:
  requires: ["01-02"]
  provides: ["doShot-BAD_STATE-guard", "room-cleanup-sweep", "input-sanitization", "CSP-header"]
  affects: ["server.js doShot", "server.js chat/fire/placeShips/resume/rejoin handlers", "server.js boot IIFE"]
tech_stack:
  added: []
  patterns: ["guard-clause null/shape check", "hybrid eviction sweep + .unref()", "escapeHtml stored-XSS guard", "CSP middleware named function"]
key_files:
  created: ["test/hardening.test.js"]
  modified: ["server.js"]
decisions:
  - "doShot cells guard precedes opp/me resolution — cells is checked first because opponentOf(room, clientId) could itself return undefined for malformed state"
  - "sweepRooms exported via TEST_EXPORTS (named function) so tests invoke one pass synchronously without 60s timer wait"
  - "cspMiddleware extracted as named function (not inline arrow) to enable unit testing without spinning up HTTP"
  - "style-src allows 'unsafe-inline' (existing app uses inline styles); script-src remains 'self' only — plan acceptance criteria is script-src, not global CSP"
  - "touchRoom() single helper stamps lastActivityAt — prevents duplicate inline Date.now() across 5 handler sites"
  - "Unhandled rejection from Postgres boot in test env is pre-existing (no DB in CI) — tests pass; Errors:1 is cosmetic"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-01"
  tasks_completed: 3
  files_changed: 2
requirements_satisfied: [SEC-02, SEC-03, SEC-04]
---

# Phase 01 Plan 03: doShot Guard + Room Sweep + Input Sanitization + CSP Summary

**One-liner:** doShot null/shape guard (BAD_STATE, no throws), hybrid idle-room eviction sweep (60s interval), escapeHtml + sanitizeProfile extension + sanitizeChat, and a Content-Security-Policy middleware — closing SEC-02, SEC-03, SEC-04 end-to-end with 41 automated tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Task 1 (RED) | Failing hardening tests | 3b93cba | test/hardening.test.js |
| Task 1+2+3 (GREEN) | doShot guard + sweep + sanitization + CSP | 133c44a | server.js, test/hardening.test.js |

## What Was Built

### Task 1: doShot() null/shape guard (SEC-02)

Guard clause added at the very top of `doShot(room, clientId, cells)` (server.js ~line 558):

```javascript
if (!Array.isArray(cells) || !cells.length) return { ok: false, code: "BAD_STATE" };
const opp = opponentOf(room, clientId);
const oppData = room.players[opp];
const me = room.players[clientId];
if (!oppData || !oppData.occ || !me) return { ok: false, code: "BAD_STATE" };
```

- `cells` array check precedes property access to prevent TypeError on undefined spread
- `oppData`, `oppData.occ`, `me` checked before any property access
- No throw path — always returns structured `{ ok: false, code: "BAD_STATE" }`
- Satisfies T-03-02: crash-probing a game mid-resolution no longer kills the game

### Task 2: Hybrid room cleanup sweep (SEC-03)

New constants (server.js ~line 74):
- `CLEANUP_INTERVAL_MS = 60000` — sweep every 60s
- `ROOM_IDLE_THRESHOLD_MS = 300000` — evict rooms with no activity for > 5 min

`touchRoom(room)` helper stamps `room.lastActivityAt = Date.now()` in:
- `fire` handler (after rate limiter, before resolving)
- `placeShips` handler (after ship validation)
- `chat` handler (after sanitizeChat)
- `resume` handler (before reclaimSeat)
- `rejoin` handler (before seat reassignment)

`sweepRooms()` function (exported via `TEST_EXPORTS`):
- Immediately deletes rooms where `order.length === 0` (both seats gone)
- Calls `clearTurnTimer(r)` then deletes rooms idle longer than `ROOM_IDLE_THRESHOLD_MS`
- Registered in boot IIFE: `setInterval(sweepRooms, CLEANUP_INTERVAL_MS).unref()`

`createRoom` room object now includes `lastActivityAt: Date.now()`.

### Task 3: Input validation hardening + CSP (SEC-04)

**escapeHtml(s):** escapes `& < > " '` to HTML entities.

**sanitizeProfile() extended:** name now runs through `p.name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)` then `escapeHtml(...)` — stored names cannot inject markup on future leaderboards/profiles.

**sanitizeChat(text):** new function following same guard-clause shape:
- Returns `null` for non-string input
- Strips `[\x00-\x1f\x7f]` control chars
- Collapses whitespace, trims, caps at 200 chars
- Returns `null` for empty result

**chat handler** replaced inline `text.replace(...).slice(0,200)` with `sanitizeChat(arg && arg.text)` call with early-return on `null`.

**CSP middleware** (`cspMiddleware`) added immediately after canonical-host redirect:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' wss: ws:; frame-ancestors 'none'
```
- `script-src 'self'` — no `unsafe-inline` or `unsafe-eval`
- `connect-src wss: ws:` — Socket.IO client connects without CSP block
- `frame-ancestors 'none'` — clickjacking protection

## Verification Evidence

```
npm test -- test/hardening.test.js
  41 passed (41)
```

```
grep -n "BAD_STATE" server.js
  → lines 558, 562 (doShot guard), 819, 907 (resolving guards from P02)

grep -n "ROOM_IDLE_THRESHOLD_MS" server.js
  → lines 75, 496, 503, 1027

grep -n "clearTurnTimer" server.js
  → line 504 (inside sweepRooms)

grep -c "sanitizeChat" server.js
  → 3 (definition + chat-handler call + touchRoom after it)

grep -n "Content-Security-Policy" server.js
  → lines 43, 48
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CSP test scope: 'unsafe-inline' check scoped to script-src only**

- **Found during:** Task 3 GREEN (first test run)
- **Issue:** Initial test asserted `'unsafe-inline'` absent from entire CSP string, but `style-src` legitimately needs `'unsafe-inline'` (app uses inline styles). Plan acceptance criteria says script-src only.
- **Fix:** Test now extracts the `script-src` directive and checks for unsafe keywords only within that directive. The CSP value was not changed.
- **Files modified:** test/hardening.test.js
- **Commit:** 133c44a

**2. [Rule 2 - Missing critical functionality] cspMiddleware extracted as named function**

- **Found during:** Task 3 implementation
- **Issue:** Inline arrow `app.use((req, res, next) => {...})` not testable via TEST_EXPORTS. Plan acceptance criteria requires asserting CSP header in tests.
- **Fix:** Extracted to named `cspMiddleware` function with `CSP_HEADER_VALUE` const; both exported via TEST_EXPORTS; `app.use(cspMiddleware)` unchanged at call site.
- **Files modified:** server.js
- **Commit:** 133c44a

## Known Stubs

None — this plan adds security infrastructure only. No data-display features or UI rendering paths.

## Threat Flags

None — all changes reduce attack surface (null-crash guard, memory bounding, input sanitization, CSP). No new network endpoints, auth paths, or trust boundaries introduced.

## TDD Gate Compliance

- RED gate: commit 3b93cba (`test(01-03): add failing RED tests...`) — tests failed with `Cannot destructure property 'doShot' of 'TEST_EXPORTS'` before implementation
- GREEN gate: commit 133c44a (`feat(01-03): doShot guard, room cleanup sweep...`) — all 41 tests pass

## Self-Check: PASSED
