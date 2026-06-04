---
status: partial
phase: 05-public-matchmaking
source: [05-VERIFICATION.md]
started: 2026-06-04T09:10:00Z
updated: 2026-06-04T09:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Casual two-tab pairing
expected: Two browser tabs click Quick Match → both transition to ship-placement, no room code, classic unranked game.
result: [pending] (verified at wave-1 checkpoint pre-fix)

### 2. Leave Queue returns to lobby
expected: A lone queued tab clicking Leave Queue returns to lobby; wait screen shows MM:SS timer + "Searching…" pill while queued.
result: [pending] (verified at wave-1 checkpoint pre-fix)

### 3. Ranked guest gate + pairing + widening window
expected: Ranked button disabled for guests with "Sign in to play ranked" hint; two signed-in accounts pair into a ranked game; wait panel shows "Search window ±N" rising over time → "Any rating".
result: [pending] (verified at wave-2 checkpoint pre-fix)

### 4. Phantom-slot elimination + D-11 re-queue
expected: Navigate-away/reload drops queue entry (a later joiner is NOT instantly paired with the phantom). Partner closing tab pre-placement re-queues the survivor at the front (returns to queue wait screen, not stuck in dead room).
result: [pending] (verified at wave-3 checkpoint pre-fix)

### 5. Delayed bot offer (D-09)
expected: After ~30s alone in queue, "Play vs Bot" card appears; clicking starts a client-side unranked bot game (no network opponent, no match/rating record).
result: [pending] (verified at wave-3 checkpoint pre-fix)

### 6. Vietnamese localization
expected: All queue surfaces (Quick Match, Ranked, wait copy, window labels, bot offer) render Vietnamese strings under VI locale.
result: [pending] (verified across wave checkpoints pre-fix)

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
