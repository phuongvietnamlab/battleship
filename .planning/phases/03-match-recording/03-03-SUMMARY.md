---
plan: 03-03
phase: 03
title: Wire recordMatch into game-end paths
status: complete
completed: 2026-06-03
requirements: [MATCH-01, MATCH-03]
---

# Plan 03-03 Summary — Wire recordMatch into game-end paths

## What was built

Wired the `recordMatch` helper (Plan 02) into the four server-authoritative game-end paths in `server.js`, so every started 2-player game produces exactly one durable `matches` row — including grace-window disconnect forfeits (MATCH-03). End-to-end slice: a real game-end emits `gameOver`/`opponentLeft` first, then best-effort writes a queryable row, never blocking the end-game screen (D-07).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Capture startedAt + seat userId + room.recorded prerequisites | `3509e3e` |
| 2 | Wire recordMatch into the four game-end paths + MATCH-03 test | `3032362` |
| 3 | Human-verify non-blocking UX + recorded rows | approved (UAT) |

## Implementation

### Prerequisites (Task 1)
- `room.startedAt = new Date()` captured at battle start (`server.js:1363`, the `started=true` transition).
- `startedAt` added to room serialize (`:793`) and restore (`:839`) for Redis snapshot continuity (null-safe fallback).
- Seat `userId` stored at seat assignment so it survives the 3-min grace closure (gone from `socket.data.userId` after disconnect).

### Four call sites (Task 2) — all guarded fire-and-forget after the emit
1. **doShot win** (`:1156-1160`) — `reason='normal'`.
2. **endGameForfeit** (`:1082-1086`) — passed `reason` (`timeout`).
3. **scheduleSeatRelease** (`:744-761`) — `reason='disconnect'`; captures winner/loser ids **before** deleting the disconnected seat (MATCH-03).
4. **leaveRoom** (`:1560-1568`) — `reason='leave'`; captures before mutation, preserves existing `opponentLeft` UX (does NOT route through endGameForfeit / does NOT emit gameOver — locked decision verified against app.jsx).

All sites: `room.recorded = true` set **synchronously before** the `recordMatch(...).catch(()=>{})` promise (D-06 dedup); guarded by `room.started` (D-05), `!room.recorded`, and `order.length === 2`.

## Verification

- `npm test` → 101 passed, 74 skipped (DB-gated integration tests skip without `DATABASE_URL`), 0 failed. Nyquist RED spine from Wave 1 now green.
- Static + unit assertions cover: recordMatch export, no-op without DB, invalid-reason rejection, four-site wiring.
- DB-gated integration tests cover: one-row insert, idempotent duplicate, disconnect (MATCH-03) row.

## Outstanding UAT

Live-gameplay manual verification (two browsers + real `DATABASE_URL`) was **approved** by the operator without running the live session. Carried as outstanding UAT:
- Win/lose overlay appears instantly under a real DB write (D-07 timing).
- Disconnect-after-grace shows opponent-left (not a win overlay) + writes `reason='disconnect'`.
- No row for pre-battle abandon; no duplicate per game.

## Key files
- `server.js` — 4 call sites + startedAt capture + serialize/restore + seat userId + dedup guards.
- `test/match.test.js` — MATCH-03 disconnect test + activated forward-contract assertions.

## Self-Check: PASSED
