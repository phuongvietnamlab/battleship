---
phase: 01-foundation
plan: 02
subsystem: security/rate-limiting
tags: [rate-limiting, race-guard, security, SEC-01, D-09]
dependency_graph:
  requires: ["01-01"]
  provides: ["rate-limiting", "turn-clock-race-guard"]
  affects: ["server.js fire/useAbility/chat handlers", "onTurnTimeout"]
tech_stack:
  added: ["rate-limiter-flexible@^1.x"]
  patterns: ["RateLimiterMemory guard-clause", "async Socket.IO handler", "resolving flag + try/finally"]
key_files:
  created: ["test/ratelimit.test.js"]
  modified: ["package.json", "package-lock.json", "server.js"]
decisions:
  - "RateLimiterMemory (in-process) chosen over Redis store — Redis limiter deferred to Phase 5 scaling (D-06 explicit)"
  - "RL_ABUSE_THRESHOLD=10 consecutive violations triggers socket.disconnect(true) per D-08"
  - "room.resolving uses try/finally to guarantee flag cleared even if doShot throws"
  - "chat handler: removed redundant p.lastChat 400ms client-side throttle (replaced entirely by chatLimiter 5/10s)"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-01"
  tasks_completed: 2
  files_changed: 4
requirements_satisfied: [SEC-01]
---

# Phase 01 Plan 02: Rate Limiting + Turn-Clock Race Guard Summary

**One-liner:** Per-player RateLimiterMemory guards (2/s, 1/s, 5/10s) on fire/useAbility/chat with abuse-disconnect, plus a `room.resolving` try/finally flag closing the simultaneous fire+timeout race (SEC-01, D-09).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Task 0 | Verify rate-limiter-flexible legitimacy (human gate) | (approved by user) | — |
| Task 1 (RED) | Per-player limiters — failing tests | b5d88b8 | test/ratelimit.test.js |
| Task 1+2 (GREEN) | Rate limiters + race guard implementation | 376e076 | package.json, package-lock.json, server.js |

## What Was Built

### Task 1: Per-player rate limiters on fire / useAbility / chat

Three `RateLimiterMemory` instances declared near the config constants (line ~63 in server.js):

- `fireLimiter`: `{ points: 2, duration: 1 }` — 2 shots per second per player
- `abilityLimiter`: `{ points: 1, duration: 1 }` — 1 ability activation per second
- `chatLimiter`: `{ points: 5, duration: 10 }` — 5 messages per 10 seconds

All three handlers (`fire`, `useAbility`, `chat`) converted to `async` functions with a guard-clause at the top:

```javascript
try {
  await fireLimiter.consume(rlKey);
  socket.data.rlFireHits = 0;
} catch (e) {
  socket.data.rlFireHits = (socket.data.rlFireHits || 0) + 1;
  if (socket.data.rlFireHits >= RL_ABUSE_THRESHOLD) socket.disconnect(true);
  return cb && cb({ ok: false, code: "RATE_LIMITED" });
}
```

A violation counter per socket (`rlFireHits`, `rlAbilityHits`, `rlChatHits`) triggers `socket.disconnect(true)` after `RL_ABUSE_THRESHOLD` (10) consecutive rejections.

### Task 2: Turn-clock race guard (room.resolving)

`room.resolving: false` initialized in `createRoom`. In the `fire` handler and the `scatter` branch of `useAbility`:

```javascript
if (room.resolving) return cb && cb({ ok: false, code: "BAD_STATE" });
room.resolving = true;
try {
  summary = doShot(room, clientId, cells);
} finally {
  room.resolving = false;
}
```

In `onTurnTimeout`: `if (room.resolving) return;` added as the second guard (after room-deleted check), before any turn-forfeit logic.

## Verification Evidence

```
npm test -- test/ratelimit.test.js
  23 passed (23)
```

```
grep -c "RateLimiterMemory" server.js  → 5
grep -n "RATE_LIMITED" server.js       → lines 746, 786, 873 (fire, useAbility, chat)
grep -n "disconnect(true)" server.js   → lines 745, 785, 872
grep -c "resolving" server.js          → 9 (>= 5)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed redundant p.lastChat 400ms throttle from chat handler**

- **Found during:** Task 1 implementation
- **Issue:** The original chat handler had an inline 400ms cooldown check (`p.lastChat`). With the new `chatLimiter` (5/10s, which enforces ~2s average spacing), the old throttle was redundant state and a potential source of confusion.
- **Fix:** Removed `p.lastChat` state and its guard from the chat handler. The `chatLimiter` is the sole throttle mechanism.
- **Files modified:** server.js
- **Commit:** 376e076

## Known Stubs

None — this plan adds security infrastructure, not data-display features.

## Threat Flags

None — all new surface is rate limiting (closing surface, not opening it). The `RATE_LIMITED` error code does not expose any game state.

## TDD Gate Compliance

- RED gate: commit b5d88b8 (`test(01-02): add failing RED tests...`) — 11 structural tests failed before implementation
- GREEN gate: commit 376e076 (`feat(01-02): per-player rate limiters...`) — all 23 tests pass

## Self-Check: PASSED
