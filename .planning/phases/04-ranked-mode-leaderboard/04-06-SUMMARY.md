---
phase: 04-ranked-mode-leaderboard
plan: "06"
subsystem: server
tags: [ranked, redis, snapshot, crash-recovery, data-integrity, tdd, documentation]

# Dependency graph
requires:
  - phase: 04-ranked-mode-leaderboard/04-03
    provides: "recordMatch with ranked param + rating write (reads room.ranked + seat userId)"
  - phase: 04-ranked-mode-leaderboard/04-02
    provides: "room.ranked boolean flag, RANK-02 guards, EN/VI i18n (human-approved)"
provides:
  - "serializeRooms persists ranked/recorded/userId into Redis snapshot"
  - "restoreRooms rebuilds ranked/recorded/userId from Redis snapshot"
  - "TEST_EXPORTS includes serializeRooms and restoreRooms for round-trip testing"
  - "14 in-memory round-trip tests (no DB) proving CR-01 is closed"
  - "REQUIREMENTS.md RANK-02 traceability Complete"
affects:
  - "04-07 (CR-02 leaderboard rate-limit — builds on same server.js)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "!! boolean coercion for ranked/recorded serialization (undefined never serializes to non-JSON)"
    - "?? null for userId serialization (null-safe, JSON-safe)"
    - "TEST_EXPORTS additive extension — no existing export removed"
    - "TDD RED/GREEN: failing test committed before implementation"

key-files:
  created:
    - .planning/phases/04-ranked-mode-leaderboard/04-06-SUMMARY.md
  modified:
    - server.js
    - test/ranking.test.js
    - .planning/REQUIREMENTS.md

key-decisions:
  - "D-14: serializeRooms/restoreRooms use !! for booleans and ?? null for userId — matches existing serialize idioms and guarantees JSON-safe, deterministic values (T-04-18)"
  - "D-15: CR-01 round-trip test is pure in-memory (not gated on hasDb) — runs in all environments without a database connection"

requirements-completed: [RANK-01, RANK-02]

# Metrics
duration: ~4 min
completed: 2026-06-03
---

# Phase 04 Plan 06: CR-01 Gap Closure + RANK-02 Documentation Summary

**One-liner:** Closed the ranked-data-loss crash-recovery bug (CR-01) by adding ranked/recorded/userId to the Redis snapshot round-trip, proved by 14 no-DB TDD tests; flipped RANK-02 traceability to Complete.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing CR-01 round-trip tests | 8d7d719 | test/ranking.test.js |
| 1 (GREEN) | Persist+restore ranked/recorded/userId in snapshot | 1d92ac7 | server.js |
| 2 | Flip RANK-02 traceability Pending -> Complete | 9159b9c | .planning/REQUIREMENTS.md |

## What Was Built

### Task 1: CR-01 — Redis snapshot round-trip fix (RANK-01, TDD)

**Problem (CR-01 BLOCKER):** `serializeRooms` (server.js) built the Redis snapshot but omitted `room.ranked`, `room.recorded`, and per-seat `userId`. `restoreRooms` rebuilt rooms without those fields. When REDIS_URL is set and the process restarts mid-ranked-game, the restored room had `ranked === undefined` and every seat `userId === null`. When that game ended, `recordMatch` received `wId=null`/`lId=null` and silently skipped both the match write and the rating write — data loss on exactly the games where correctness matters most.

**Fix applied (4 field additions):**
- `serializeRooms` per-player: added `userId: p.userId ?? null`
- `serializeRooms` per-room: added `ranked: !!r.ranked`, `recorded: !!r.recorded`
- `restoreRooms` per-player: added `userId: p.userId ?? null`
- `restoreRooms` per-room: added `ranked: !!s.ranked`, `recorded: !!s.recorded`
- `TEST_EXPORTS`: added `serializeRooms`, `restoreRooms` (additive; no existing export removed)

**Tests added (14 total, all no-DB):**
- 6 static grep assertions (serializeRooms/restoreRooms source contain userId/ranked/recorded)
- 2 TEST_EXPORTS inclusion assertions
- 3 serialize round-trip assertions (ranked===true, recorded===false, per-seat userId 101/202)
- 3 restoreRooms restoration assertions (ranked===true, recorded===false, per-seat userId 101/202)

**TDD gate compliance:**
- RED commit `8d7d719`: 14 tests failing before implementation
- GREEN commit `1d92ac7`: all 14 tests passing after implementation
- No REFACTOR needed (clean implementation)

### Task 2: RANK-02 traceability documentation fix

**Problem:** REQUIREMENTS.md marked RANK-02 "Pending" (line 126). The implementation (createRoom + joinRoom guards reading `socket.data.userId`, lobby ranked toggle, `RANKED_REQUIRES_ACCOUNT`/`RANKED_REQUIRES_CLASSIC` error codes, EN/VI i18n) was fully present in server.js and app.jsx since Plan 02, and the human-verify checkpoint (Plan 02 Task 3) was recorded as approved in 04-02-SUMMARY.md.

**Fix:** Changed RANK-02 status cell from `Pending` to `Complete`. No other rows or coverage counts touched.

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run test/ranking.test.js -t "CR-01"` | 14/14 GREEN |
| `node --check server.js` | exits 0 |
| `npx vitest run test/ranking.test.js` (full suite) | 43 passed, 19 skipped (DB-gated) |
| REQUIREMENTS.md RANK-02 grep | `RANK-02 = Complete` |
| No previously-passing test newly failing | confirmed (29 -> 43 passing; +14 new) |

## Deviations from Plan

None — plan executed exactly as written. TDD RED/GREEN cycle followed. No architectural changes.

## Known Stubs

None. This plan's changes are fully wired — the snapshot fields are read at all four `recordMatch` call sites in server.js (disconnect ~774, forfeit ~1099, normal-win ~1173, leave ~1590) and by the round-trip test.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Changes are internal to the Redis snapshot serialization/deserialization path (in-memory to/from JSON). Mitigations for T-04-16, T-04-17, and T-04-18 from the plan's threat model are now in place.

## Self-Check: PASSED

- server.js modified: `[ -f server.js ]` — FOUND
- test/ranking.test.js modified: FOUND
- .planning/REQUIREMENTS.md modified: FOUND
- Commit 8d7d719 (RED test): `git log --oneline --all | grep 8d7d719` — FOUND
- Commit 1d92ac7 (GREEN impl): FOUND
- Commit 9159b9c (RANK-02 docs): FOUND
