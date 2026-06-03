---
status: partial
phase: 03-match-recording
source: [03-VERIFICATION.md]
started: 2026-06-03T08:30:00Z
updated: 2026-06-03T08:30:00Z
---

## Current Test

[awaiting human testing — operator approved proceeding without a live DB session]

## Tests

### 1. Normal win — non-blocking overlay + recorded row
expected: Two browsers play to a normal win. Win/lose overlay appears instantly for both players (DB write must not delay it, D-07). DB query `SELECT winner_id, loser_id, reason, started_at, ended_at FROM matches ORDER BY id DESC LIMIT 1` returns one row with reason='normal', started_at < ended_at.
result: [pending]

### 2. Grace-window disconnect (MATCH-03)
expected: Mid-battle, one player closes their tab and the 3-minute grace window expires without reconnect. Surviving player still sees opponent-left behavior (NOT a win overlay). A new matches row appears with reason='disconnect', loss attributed to the absent player.
result: [pending]

### 3. Deliberate leave
expected: A player uses Leave mid-battle. Surviving side sees opponentLeft (not gameOver). A matches row appears with reason='leave'.
result: [pending]

### 4. Lobby-abandon negative
expected: A player leaves before battle starts (lobby/placement). No matches row is written (D-05 — only started games record).
result: [pending]

### 5. Rematch double-row (CR-01 live regression)
expected: Play a game to completion, then rematch and play a second game to completion. Two separate matches rows exist (one per game) — the rematch is not silently skipped by the dedup guard.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
