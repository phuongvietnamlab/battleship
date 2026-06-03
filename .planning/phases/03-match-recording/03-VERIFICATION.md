---
phase: 03-match-recording
verified: 2026-06-03T08:24:00Z
status: human_needed
score: 7/7
overrides_applied: 0
human_verification:
  - test: "Start server with DATABASE_URL set. Open two browser tabs, create + join a room, place ships, play to a normal win."
    expected: "Win/lose overlay appears INSTANTLY for both players with no delay. Query `SELECT winner_id, loser_id, reason, started_at, ended_at FROM matches ORDER BY id DESC LIMIT 1` — exactly one new row with reason='normal' and started_at earlier than ended_at."
    why_human: "D-07 non-blocking timing (overlay appears before DB write completes) cannot be verified without a live DB and two browser sessions."
  - test: "Play a second game. Mid-battle, close one tab and wait out the 3-minute grace window."
    expected: "Surviving player sees the existing 'opponent left' behavior (NOT a win overlay). Query matches — one new row with reason='disconnect', loser_id = the absent player's userId."
    why_human: "Full socket-level grace-timer simulation requires live sockets + real DATABASE_URL. The automated test calls recordMatch directly; it does not simulate the 3-min timer."
  - test: "During a battle, have one player deliberately click Leave. Observe both sides."
    expected: "The non-leaving player receives opponentLeft (NOT a gameOver/win overlay). Query matches — one row with reason='leave'."
    why_human: "The opponentLeft vs gameOver routing distinction requires observing client UX, which cannot be verified by grep."
  - test: "Abandon a game during placement (before battle starts) by leaving. Query matches."
    expected: "No match row written for the abandoned pre-battle game."
    why_human: "D-05 lobby-abandon guard can only be confirmed live; static analysis shows the guard exists but cannot prove the negative."
  - test: "Play two complete games in the same room (use rematch). Query matches after each."
    expected: "Two separate match rows with different started_at values — confirming the CR-01 fix (room.recorded reset on rematch)."
    why_human: "The rematch reset (room.recorded = false) is verified statically by the regression test, but live confirmation that two rows appear for two rematched games requires a real DB session."
---

# Phase 3: Match Recording — Verification Report

**Phase Goal:** Every completed game produces a durable match record, giving the system a reliable source of truth for ratings.
**Verified:** 2026-06-03T08:24:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `migrations/004_matches.sql` exists with `matches` table DDL, reason CHECK constraint (normal/timeout/disconnect/leave), dedup UNIQUE, three IDX_ indexes, no rating columns | VERIFIED | File present at `migrations/004_matches.sql`; all 7 static tests in match.test.js pass against its content; confirmed by direct read |
| 2 | `db.js` exports `recordMatch` — fire-and-forget, single-transaction, parameterized, swallows all errors, validates reason server-side, no-ops without DB config | VERIFIED | `recordMatch` at `db.js:452`; exported at `db.js:544`; no `throw` in catch block; all SQL uses `$N` binding; `VALID_REASONS` array guards taxonomy |
| 3 | `server.js` wires `recordMatch` at all four game-end sites: doShot win, endGameForfeit, scheduleSeatRelease, leaveRoom | VERIFIED | Lines 1160, 1086, 761, 1570 respectively; destructured from `./db` at line 11 |
| 4 | Every call site sets `room.recorded = true` synchronously BEFORE the fire-and-forget promise (D-06 dedup guard) | VERIFIED | Lines 1157, 1083, 746, 1567 — all set `room.recorded = true` before `.catch(()=>{})` |
| 5 | `scheduleSeatRelease` captures winner/loser ids and `startedAt` BEFORE deleting the disconnected seat (MATCH-03) | VERIFIED | `disconnectRecord` object built at line 740–745 before `delete r2.players[clientId]` at line 750 |
| 6 | `leaveRoom` records inline with reason='leave', preserves `opponentLeft` UX, does NOT route through `endGameForfeit`, does NOT emit `gameOver` | VERIFIED | Lines 1564–1571 record before mutation; line 1582 emits `opponentLeft`; no `endGameForfeit` call; no `gameOver` emit in the leave path |
| 7 | `rematch` handler clears `room.recorded = false` so rematch games are recorded (CR-01 fix, commit 810bab2) | VERIFIED | Line 1549: `room.recorded = false` inside the rematch handler; regression test in match.test.js lines 85–93 locks it |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `migrations/004_matches.sql` | matches table DDL + CHECK + UNIQUE + indexes | VERIFIED | 25 lines; all required constraints and indexes present; no rating columns |
| `db.js` | `recordMatch` export | VERIFIED | Function at line 452; in `module.exports` at line 544 |
| `server.js` | 4 call sites + startedAt + seat userId + room.recorded | VERIFIED | 4 `recordMatch(` calls confirmed by grep; `room.startedAt = new Date()` at line 1363; `userId: socket.data.userId ?? null` at createRoom/joinRoom; `room.recorded = false` on rematch |
| `test/match.test.js` | Static DDL + unit + DB-gated integration + MATCH-03 + CR-01 regression | VERIFIED | 19 tests total: 11 pass (static + unit), 8 skipped (DB-gated without DATABASE_URL) — matches claimed count exactly |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `migrations/004_matches.sql` | `db.js runMigrations` | filename `004_` picked up by lexical sort | VERIFIED | `runMigrations` at db.js:42 reads all `.sql` files in `migrations/` sorted lexically; `004_matches.sql` is present |
| `db.js recordMatch` | `matches` table | `pool.connect → BEGIN → INSERT INTO matches` | VERIFIED | `db.js:477`: parameterized INSERT with `$1..$5` bindings |
| `server.js doShot win` | `db.js recordMatch` | fire-and-forget after gameOver emits | VERIFIED | `server.js:1160` — after both `gameOver` emits at 1149–1150 |
| `server.js endGameForfeit` | `db.js recordMatch` | fire-and-forget after gameOver emits; reason param passed through | VERIFIED | `server.js:1086` — reason is `'timeout'` from `onTurnTimeout` caller |
| `server.js scheduleSeatRelease` | `db.js recordMatch` | fire-and-forget with captured record before seat delete | VERIFIED | `server.js:761` — fires only when `disconnectRecord` was captured before deletion |
| `server.js leaveRoom` | `db.js recordMatch` | inline fire-and-forget before mutation | VERIFIED | `server.js:1570` — inside block guarded by `room.started && !room.recorded && room.order.length === 2` |
| `server.js placeShips allReady` | `room.startedAt` | `room.startedAt = new Date()` adjacent to `room.started = true` | VERIFIED | `server.js:1363` |
| `serializeRooms` | `startedAt` in Redis snapshot | `startedAt: r.startedAt \|\| null` | VERIFIED | `server.js:793` serialize + `server.js:839` restore with `new Date()` conversion |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `db.js recordMatch` | `winnerId, loserId, reason, mode, startedAt` | server-authoritative room state (not client payload) | Yes — derived from `room.players[id].userId`, `room.mode`, `room.startedAt`; all set server-side | FLOWING |
| `migrations/004_matches.sql` | schema DDL | static file — no data flow | N/A | N/A |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test -- test/match.test.js` exits 0 without DATABASE_URL | `npm test -- test/match.test.js` | 11 passed, 8 skipped, 0 failed | PASS |
| Full suite exits 0 — no regressions | `npm test` | 102 passed, 74 skipped, 0 failed | PASS |
| CR-01 regression: rematch resets room.recorded | Static test in match.test.js lines 85–93 (always runs) | Passes — `room.recorded = false` found at rematch handler | PASS |
| db.js exports recordMatch as a function | Static test in match.test.js lines 74–79 | Passes — `recordMatch` present in source and exports | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files declared or present for this phase. Phase is a persistence layer (no runnable CLI or standalone probe script).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MATCH-01 | 03-01, 03-02, 03-03 | Every completed game writes a match record (players, winner, reason) in a single transaction | SATISFIED | `recordMatch` in db.js writes one parameterized transaction; wired at 4 call sites in server.js; `matches` table exists with correct schema |
| MATCH-03 | 03-01, 03-03 | Disconnect exceeding grace window recorded as explicit forfeit loss | SATISFIED | `scheduleSeatRelease` captures winner/loser before seat deletion, writes `reason='disconnect'`; DB-gated test asserts the row (skips without DB); static capture-before-delete confirmed |

Both requirements declared across the plans are covered. No orphaned requirements found for Phase 3 in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `db.js` | 460 | `VALID_REASONS` array allocated inside function body on every call | Info (WR-IN-02 from code review) | Negligible runtime cost; no behavioral issue |
| `db.js` | 454 | No-op guard checks call-time env vars, not import-time pool config | Warning (WR-02 from code review) | Misleading but not broken — no behavioral failure in normal operation |
| `db.js` | 472–487 | Single INSERT wrapped in explicit `BEGIN/COMMIT/ROLLBACK` transaction | Warning (WR-03 from code review) | Extra round-trips; no correctness risk for this phase |
| `migrations/004_matches.sql` | 11 | No `CHECK` constraint on `mode` column | Warning (WR-01 from code review) | `mode` is validated at `createRoom`; no constraint at DB level for invalid future code paths |

No `TBD`, `FIXME`, or `XXX` markers in any phase-modified files. No placeholder returns or empty stub implementations. All four warnings were identified in the code review (03-REVIEW.md); none rises to BLOCKER level for the phase goal. They are candidates for a follow-up cleanup task.

---

### Human Verification Required

The following five items cannot be verified programmatically. They require a live server with `DATABASE_URL` configured and two browser sessions.

#### 1. Normal Win — Non-Blocking Overlay + DB Row

**Test:** Start server with `DATABASE_URL` set. Open two browser tabs, create and join a room, place ships, play to a normal win.
**Expected:** Win/lose overlay appears instantly for both players (not after a DB delay). Query `SELECT winner_id, loser_id, reason, started_at, ended_at FROM matches ORDER BY id DESC LIMIT 1` — exactly one new row with `reason='normal'` and `started_at < ended_at`.
**Why human:** D-07 timing (overlay before DB write) cannot be proven without a live connection observing both the socket event and the subsequent DB insert latency.

#### 2. Grace-Window Disconnect — Forfeit Row with Correct Loser

**Test:** Play a started game, close one tab, wait 3 minutes without reconnecting.
**Expected:** Surviving player sees the existing "opponent left" behavior, not a win overlay. Query matches — one new row with `reason='disconnect'` and `loser_id` matching the absent player.
**Why human:** The 3-minute `scheduleSeatRelease` timer requires a live socket environment. The automated test calls `recordMatch` directly — it does not simulate the timer expiry or the seat-deletion path.

#### 3. Deliberate Leave — opponentLeft UX Preserved

**Test:** During a started battle, one player clicks Leave.
**Expected:** The other player receives `opponentLeft` event (not `gameOver`/win overlay). Query matches — one row with `reason='leave'`.
**Why human:** `opponentLeft` vs `gameOver` UX distinction requires observing client-side React rendering, which grep cannot verify.

#### 4. Lobby-Abandon — No Row Written

**Test:** Two players join, one leaves before placement completes.
**Expected:** No match row written. Query `SELECT count(*) FROM matches` before and after — count must not increase.
**Why human:** D-05 guard (`room.started` must be true) is present in code, but the negative (no row written for a pre-battle leave) can only be confirmed with a live DB and a real leave-during-placement scenario.

#### 5. Rematch — Two Rows for Two Games (CR-01 Live Regression)

**Test:** Play two complete games in the same room using the Rematch button. Query matches after each game.
**Expected:** Two separate rows with different `started_at` values, confirming the CR-01 fix allows both games to record.
**Why human:** The static regression test confirms `room.recorded = false` is present in the rematch handler source, but live DB confirmation that two rows actually appear for two consecutive rematched games closes the loop on CR-01's impact.

---

### Gaps Summary

No automated gaps. All 7 must-have truths are VERIFIED. The 4 code-review warnings (WR-01 through WR-03 + IN-02) are quality improvements, not correctness blockers for the phase goal. The CR-01 blocker identified in the code review has been fixed in commit `810bab2` and locked with a regression test.

The phase is blocked on **human_needed** status because the live-gameplay UAT carried from 03-03-SUMMARY.md (non-blocking end-game UX, correct per-reason rows, grace-window disconnect behaviour, lobby-abandon negative, rematch double-row) has not been completed against a live database. Automated checks passed; 5 items require a human with a real `DATABASE_URL` to close.

---

_Verified: 2026-06-03T08:24:00Z_
_Verifier: Claude (gsd-verifier)_
