---
phase: 06-bot-difficulty-tiers
plan: "02"
subsystem: client-lobby-ui
tags: [bot, difficulty-tiers, lobby, localStorage, i18n, ui]
dependency_graph:
  requires:
    - bot-tier-dispatch
    - four-bot-tier-algorithms
  provides:
    - bot-tier-selector-ui
    - bot-tier-persistence
  affects:
    - public/app.jsx
    - public/style.css
tech_stack:
  added: []
  patterns:
    - whitelist-validated-localStorage-read
    - one-tap-tier-start
    - guard-clause-defaulting
key_files:
  created: []
  modified:
    - public/app.jsx
    - public/style.css
decisions:
  - "selectedTier lobby state initialized lazily via loadBotTier() — defaults to medium on first visit or garbage value"
  - "loadBotTier whitelist-validates bs_botTier against VALID_TIERS; unknown/invalid/throwing read => medium (T-06-02 mitigation)"
  - "queue-offer startBot() at ~line 2561 left tier-less => defaults Medium (D-07 advance bot unchanged)"
  - "each tier button persists via saveBotTier, highlights primary, others ghost, calls onBot(tier) for one-tap start"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-04T04:35:00Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 2
---

# Phase 6 Plan 2: Bot Difficulty Selector UI Summary

**One-liner:** Replaced single "Play vs Bot" button with a 4-button Easy/Medium/Hard/Insane difficulty row that persists the last pick in localStorage (whitelist-validated), localizes EN/VI, and threads the chosen tier into `startBot(false, tier)` for one-tap start — human-verified in browser.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | VALID_TIERS + saveBotTier/loadBotTier + EN/VI i18n labels | 0a917e8 | public/app.jsx |
| 2 | 4-button tier row in Lobby + thread tier into startBot | 789a37d | public/app.jsx, public/style.css |
| 3 | Human verification — selector renders, persists, advance bot unchanged | (checkpoint, approved) | — |

## What Was Built

### public/app.jsx
- `VALID_TIERS` constant (`["easy","medium","hard","insane"]`)
- `saveBotTier(tier)` / `loadBotTier()` helpers — whitelist-validated read, defaults `"medium"` on unknown/invalid/throwing localStorage access (`bs_botTier` key)
- EN/VI i18n labels: Easy/Medium/Hard/Insane → Dễ / Trung bình / Khó / Cực khó; "Select difficulty" → "Chọn độ khó"
- Lobby `selectedTier` state initialized lazily via `loadBotTier`
- 4-button tier row: each button persists via `saveBotTier`, highlights as `primary` (others `ghost`), and calls `onBot(tier)` for one-tap start
- App wires `onBot={handleBot}`, `handleBot(tier)` → `startBot(false, tier)`
- Queue-offer `startBot()` left tier-less (defaults Medium) — D-07 advance bot path untouched

### public/style.css
- `.bot-tier-row` styling modeled on existing `.mode-pick`

## Verification Results

- `npm run build` — succeeded
- `npx vitest run` — 11/11 files, 206 passed, no regressions
- Human-verify checkpoint (approved): 4-button render (SC#1), EN/VI labels (D-06), persistence + medium default + garbage-value fallback (D-05), advance-mode bot unchanged (D-07)

## Deviations from Plan

None — plan executed as written.

## Known Stubs

None.

## Threat Surface Scan

T-06-02 (localStorage tampering of `bs_botTier`) mitigated: `loadBotTier` whitelist-validates against `VALID_TIERS` and defaults to medium; `botPick` dispatch (Plan 01) also defaults unknown values to pickMedium (defense in depth). No new network endpoints, auth paths, or schema changes.

## Self-Check

Files modified:
- `public/app.jsx` — VALID_TIERS / saveBotTier / loadBotTier / tier row present
- `public/style.css` — `.bot-tier-row` present

Commits verified:
- 0a917e8 — feat(06-02): add VALID_TIERS, saveBotTier/loadBotTier, EN/VI i18n tier labels
- 789a37d — feat(06-02): add bot tier selector row + persistence + i18n

## Self-Check: PASSED
