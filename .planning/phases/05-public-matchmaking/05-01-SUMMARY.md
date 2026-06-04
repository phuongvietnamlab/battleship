---
phase: 05-public-matchmaking
plan: "01"
subsystem: matchmaking
tags: [queue, matchmaking, casual, socket, i18n, client]
dependency_graph:
  requires: []
  provides:
    - queues map (casual + ranked Maps in server.js)
    - tryPair / tryPairAll / createMatchedRoom engine
    - joinQueue / leaveQueue socket events
    - matchFound / queueStatus socket events
    - TEST_EXPORTS.queues + TEST_EXPORTS.tryPair seam
    - Quick Match UI (queue screen, elapsed timer, Leave Queue)
  affects:
    - server.js (queue engine + handlers + sweep timer + TEST_EXPORTS)
    - public/app.jsx (state, socket handlers, Lobby button, queue screen)
    - public/style.css (queue panel styles)
    - test/queue.test.js (new file)
tech_stack:
  added: []
  patterns:
    - RateLimiterMemory for joinQueueLimiter (5/min per clientId)
    - Synchronous delete-before-await race guard in tryPair (mirrors room.resolving)
    - module-level queues map (mirrors rooms map pattern)
    - TEST_EXPORTS seam for unit testing internal queue state
    - React useEffect 1s interval for elapsed timer
key_files:
  created:
    - test/queue.test.js
  modified:
    - server.js
    - public/app.jsx
    - public/style.css
decisions:
  - "findPair for casual returns any two non-pairing entries; ranked window logic deferred to Plan 02"
  - "matchFound handler sets setScreen('placement') unconditionally — no s==='queue' guard (D-10, Pitfall 4)"
  - "tryPair deletes both entries synchronously before any await — race guard prevents double-pairing (T-5-05)"
  - "joinQueueLimiter: 5 requests/60s per clientId using existing RateLimiterMemory (T-5-03)"
  - "disconnect cleanup from queue deferred to Plan 03 per plan spec"
  - "queueWindow state declared now; setQueueWindow call deferred to Plan 02 queueStatus handler"
  - "elapsedSec state drives 1s re-render; derived from queueSince each tick"
metrics:
  duration: "~7 min"
  completed: "2026-06-04"
  tasks_completed: 3
  files_changed: 4
---

# Phase 5 Plan 01: Casual Quick Match Vertical Slice Summary

Implemented the full casual Quick Match vertical slice (QUEUE-01): server-side queue engine, casual pairing, matched-room creation in the exact createRoom shape, client Quick Match button/queue wait screen/Leave Queue flow, and Wave 0 test scaffold.

## What Was Built

**Server (server.js):**
- `QUEUE_SWEEP_MS`, `BOT_OFFER_DELAY_MS`, `RANKED_WINDOW_*` constants at module scope alongside GRACE_MS/CLEANUP_INTERVAL_MS
- `const queues = { casual: new Map(), ranked: new Map() }` + `joinQueueLimiter` (5/60s per clientId)
- `findPair(type, entries)` — returns first two non-pairing entries
- `tryPair(type)` — synchronous delete + `pairing=true` guard before `createMatchedRoom` async call; on error re-inserts both entries
- `tryPairAll()` — sweeps both queues; called by sweep timer and on each joinQueue
- `createMatchedRoom(entryA, entryB, type)` — builds `rooms[code]` in exact createRoom shape (`mode:"classic"`, `ranked` from type), seats both players, emits `roomUpdate`/`opponentJoined`/`oppProfile`/`matchFound`
- `joinQueue` handler — normalizes type (T-5-02), rate limits (T-5-03), ALREADY_IN_ROOM / ALREADY_IN_QUEUE / RANKED_REQUIRES_ACCOUNT guards, `sanitizeProfile` (T-5-01)
- `leaveQueue` handler — removes from both queues, clears socket.data
- `setInterval(tryPairAll, QUEUE_SWEEP_MS).unref()` in boot block
- TEST_EXPORTS extended with `queues` and `tryPair`

**Client (public/app.jsx):**
- Queue state: `queueType`, `queueSince`, `botOfferVisible`, `elapsedSec`; refs `botOfferTimerRef`, `queueTimerRef`
- `matchFound` socket handler: unconditionally calls `setScreen("placement")` — no screen guard (D-10)
- `queueStatus` socket handler stub (Plan 02 fills `windowWidth` path)
- Elapsed timer `useEffect` gated on `screen === "queue"`, 1s tick interval
- `handleQuickMatch()` and `handleLeaveQueue()` functions
- Quick Match primary button in Lobby above mode picker (with OR divider)
- `screen === "queue"` render branch: MM:SS elapsed timer, `status-pill pill-wait`, Leave Queue ghost button
- All queue i18n keys in both I18N.en and I18N.vi: `queue.quickMatch`, `queue.titleCasual`, `queue.sub`, `queue.searching`, `queue.elapsed`, `queue.cancel`, `err.ALREADY_IN_QUEUE`, `err.ALREADY_IN_ROOM`

**CSS (public/style.css):**
- `.queue-timer`, `.queue-elapsed` (42px Oswald, gold color, glow), `.queue-label` (13px, uppercase)

**Tests (test/queue.test.js):**
- QUEUE-01 describe block: 5 passing tests (paired/removed, ranked:false+classic, two seated, no-op on single entry, pairing guard)
- QUEUE-02 and QUEUE-03 describe blocks with `it.todo()` placeholders for Plans 02/03

## Test Results

- `npx vitest run test/queue.test.js` — 5 passed, 7 todo
- `npx vitest run` (full suite) — 179 passed, 93 skipped, 7 todo — no regressions
- `node build-game.mjs` — exits 0

## Deviations from Plan

None — plan executed exactly as written. Task 1 established the RED scaffold; Task 2 turned tests GREEN; Task 3 delivered the client slice.

## Known Stubs

- `queueStatus` handler in app.jsx: `setQueueWindow(windowWidth)` call commented out — wired in Plan 02 when `rankedWindow()` and the rated queue exist. This stub does not block QUEUE-01's goal.
- `it.todo(...)` blocks in QUEUE-02 and QUEUE-03 describe sections — intentional placeholders, filled by Plans 02/03.

## Self-Check: PASSED

- test/queue.test.js: FOUND
- server.js: FOUND (queues map, tryPair, joinQueue, leaveQueue, TEST_EXPORTS.queues)
- public/app.jsx: FOUND (matchFound handler, queue screen, Quick Match button, i18n keys)
- public/style.css: FOUND (.queue-timer, .queue-elapsed, .queue-label)
- Commits: d617b0b (Task 1), b8c663a (Task 2), 4b0cc1f (Task 3) — all present in git log
