---
status: partial
phase: 04-ranked-mode-leaderboard
source: [04-VERIFICATION.md]
started: 2026-06-03T17:15:00Z
updated: 2026-06-03T17:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Ranked guest-block UI renders correctly in EN and VI
expected: The lobby "Ranked" toggle is disabled/hidden for guests; attempting ranked as a guest surfaces the localized RANKED_REQUIRES_ACCOUNT message in both EN and VI.
result: [pending — previously approved in 04-02 SUMMARY]

### 2. Leaderboard provisional gating renders correctly
expected: Players with rd >= 110 (provisional / placement incomplete) are hidden from the public top-100 board; established players appear ordered by rating DESC.
result: [pending — previously approved in 04-04 SUMMARY]

### 3. Season-reset CLI behaves correctly on a live database
expected: `scripts/season-reset.js` archives current ratings into rating_history under a new season row, soft-resets active ratings (1500 + (old-1500)*0.5, rd=350, vol=0.06, games=0), and a re-run with the same label fails on UNIQUE(label) and rolls back.
result: [pending — previously approved in 04-05 SUMMARY]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
