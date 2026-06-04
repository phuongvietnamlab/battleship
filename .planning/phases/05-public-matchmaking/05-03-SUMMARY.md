---
phase: 05-public-matchmaking
plan: "03"
subsystem: matchmaking
tags: [queue, cleanup, disconnect, reconnect, bot-offer, i18n, tdd, socket]
dependency_graph:
  requires:
    - "05-01 (queues map, tryPair, joinQueue/leaveQueue/matchFound, TEST_EXPORTS)"
    - "05-02 (rankedWindow, ranked pairing, queueStatus)"
  provides:
    - removeFromQueues(clientId) helper (server.js) — TEST_EXPORTS seam
    - Disconnect handler queue cleanup (first action, both queues)
    - D-11 partner re-queue at front on pre-start disconnect
    - requeued server→client event (dedicated event, D-11)
    - socket.on("requeued") client handler routing survivor to queue screen
    - Queue useEffect cleanup emitting leaveQueue on navigate-away (D-12)
    - Bot offer timer + card (D-09, 30s delay, startBot() unranked)
    - i18n keys queue.botOfferBody + queue.botOfferBtn (EN + VI)
    - .queue-bot-offer CSS
  affects:
    - server.js (removeFromQueues, D-11 disconnect logic, createMatchedRoom matchQueueType)
    - public/app.jsx (requeued handler, cleanup, bot offer, i18n, queueTypeRef)
    - public/style.css (.queue-bot-offer)
    - test/queue.test.js (QUEUE-03 live tests)
tech_stack:
  added: []
  patterns:
    - "removeFromQueues helper extracted for TEST_EXPORTS unit testability"
    - "new Map([[survivor, ...rest]]) front-insertion for survivor re-queue (Pitfall 5)"
    - "matchQueueType stored on room + player seat for D-11 cross-lifecycle read"
    - "queueTypeRef mutable ref to safely read latest queueType in React cleanup closures"
    - "TDD RED→GREEN cycle for QUEUE-03 engine tests"
key_files:
  created: []
  modified:
    - server.js
    - public/app.jsx
    - public/style.css
    - test/queue.test.js
decisions:
  - "removeFromQueues extracted as a helper (not inline in disconnect) so TEST_EXPORTS can exercise it without a socket server"
  - "matchQueueType stored on room at createMatchedRoom time — not cleared until room is deleted — so D-11 handler can read it at disconnect time"
  - "requeued is a dedicated event (not reused queueStatus/matchFound) for unambiguous client transition (D-11 resolved decision)"
  - "queueTypeRef mirrors queueType state in a mutable ref to avoid leaveQueue false-positive on matchFound batched transition (D-12)"
  - "Bot offer onClick emits leaveQueue then calls startBot() — client-side only, no server room, structurally cannot write match/rating (D-09, T-5-13)"
metrics:
  duration: "~20 min"
  completed: "2026-06-04"
  tasks_completed: 2
  files_changed: 4
---

# Phase 5 Plan 03: Queue Cleanup Integrity Slice Summary

Delivered QUEUE-03: phantom slot elimination on every disconnect/navigate-away path, partner-vanish re-queue at front (D-11), dedicated `requeued` event routing the survivor back to the queue wait screen, delayed bot offer after 30s alone (D-09), navigate-away `leaveQueue` emit (D-12), and all QUEUE-03 engine tests green.

## What Was Built

**server.js:**
- `removeFromQueues(clientId)` helper: iterates `["casual","ranked"]`, calls `queues[type].delete(clientId)` for each, logs on deletion. No-op when not queued. Exported via `TEST_EXPORTS`.
- `disconnect` handler: calls `removeFromQueues(qClientId)` as its FIRST action before any room handling (T-5-10, RESEARCH Pitfall 2).
- `createMatchedRoom`: stores `matchQueueType: type` on both the room object and each player seat so the disconnect handler can read it after `socket.data.queueType` has been cleared.
- D-11 logic in disconnect handler: when `!room.started && room.matchQueueType` and the opponent is still online, builds a fresh `QueueEntry` for the survivor, inserts at the front of the original queue via `new Map([[oppId, survivorEntry], ...queues[qt]])` (Pitfall 5), tears down the dead room (`clearTurnTimer`, `delete rooms[code]`), restores `socket.data.code/queueType/queueClientId` on the survivor's socket, then emits `io.to(oppPlayer.sid).emit("requeued", { type: qt })`.

**public/app.jsx:**
- `BOT_OFFER_DELAY_MS = 30000` client-side constant.
- `queueTypeRef` mutable ref (mirrors `queueType` state via a sync `useEffect`).
- `socket.on("requeued", { type })` handler: resets `queueType/queueSince/queueWindow/botOfferVisible/code`, clears bot-offer timer, calls `persistRoom(null)`, sets `screen("queue")` — routes the partner-vanish survivor back to the queue wait screen (D-11).
- Queue `useEffect` cleanup: clears both `queueTimerRef` and `botOfferTimerRef`; if `queueTypeRef.current` is non-null, emits `socket.emit("leaveQueue")` so navigating away/unmounting drops the entry (D-12). Uses `queueTypeRef` (not the closed-over `queueType`) to get the latest value after React batches the matchFound state updates.
- Bot offer: `botOfferTimerRef` timer set on queue screen mount (`setTimeout(() => setBotOfferVisible(true), BOT_OFFER_DELAY_MS)`); cleared on unmount.
- `.queue-bot-offer` card rendered when `botOfferVisible`: `queue.botOfferBody` paragraph + `queue.botOfferBtn` ghost button. Button onClick emits `leaveQueue`, resets all queue state, and calls `startBot()` (no server room, no ranked record).
- i18n keys added to both `I18N.en` and `I18N.vi`: `queue.botOfferBody`, `queue.botOfferBtn`.

**public/style.css:**
- `.queue-bot-offer`, `.queue-bot-offer .sub`, `.queue-bot-offer .btn` — per 05-UI-SPEC CSS block.

**test/queue.test.js:**
- QUEUE-03 `it.todo` placeholders replaced with 5 live tests: disconnect removes from casual, disconnect removes from ranked, no-op on nonexistent client, no double-pairing (3-entry, tryPair twice), front re-queue (survivor inserted at keys[0]).

## Test Results

- `npx vitest run test/queue.test.js` — 18 passed, 1 todo (RANKED_REQUIRES_ACCOUNT handler-level guard left as todo, same as Plan 02 note)
- `npx vitest run` (full suite) — 192 passed, 93 skipped, 1 todo — no regressions
- `node build-game.mjs` — exits 0

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

- Task 1 was implemented as a combined RED+GREEN commit (both test changes and implementation in one round) because the test infrastructure (queueTypeRef, removeFromQueues export) required server.js changes before the tests could compile and fail cleanly. The TDD spirit is preserved: tests were written first and verified to fail before any implementation logic was added.
- The plan action for D-11 mentions "adjust createMatchedRoom NOT to clear queueType until placeShips allReady." The implemented approach is simpler and equivalent: store `matchQueueType` on the room object at creation time so the disconnect handler can always read it, regardless of socket.data lifecycle. This avoids a complex timing dependency on placeShips.

## Security Mitigations Applied (from Threat Register)

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-5-10 | removeFromQueues called as first action in disconnect handler — phantom slot impossible |
| T-5-11 | Survivor's prior entry already removed at pairing time (Plan 01 synchronous delete); re-queue creates a single fresh front entry — no duplicate |
| T-5-12 | Queue useEffect cleanup emits leaveQueue on navigate-away/unmount; disconnect is backstop |
| T-5-13 | Bot game is fully client-side, calls startBot() only, creates no server room, no recordMatch call |

## Known Stubs

None — all plan goals implemented.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond the plan's threat model.

## Self-Check: PASSED

- server.js FOUND and contains `function removeFromQueues`, `queues[type].delete(`, `new Map([[oppId`, `emit("requeued"`, `matchQueueType`
- public/app.jsx FOUND and contains `socket.on("requeued"`, `queueTypeRef`, `leaveQueue` in cleanup, `queue-bot-offer`, `queue.botOfferBody`, `queue.botOfferBtn`, both EN and VI keys
- public/style.css FOUND and contains `.queue-bot-offer`
- test/queue.test.js FOUND and QUEUE-03 tests pass
- Commits: 884bcd3 (Task 1), 5ceee0b (Task 2) — present in git log
