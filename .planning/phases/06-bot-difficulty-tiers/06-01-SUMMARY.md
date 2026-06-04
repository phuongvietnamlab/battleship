---
phase: 06-bot-difficulty-tiers
plan: "01"
subsystem: client-bot-ai
tags: [bot, ai, tdd, vitest, algorithms, difficulty-tiers]
dependency_graph:
  requires: []
  provides:
    - four-bot-tier-algorithms
    - bot-tier-dispatch
    - headless-simulation-harness
  affects:
    - public/app.jsx
    - test/bot-helpers.js
    - test/bot.test.js
tech_stack:
  added: []
  patterns:
    - pure-function-test-helpers
    - probability-density-heatmap
    - parity-masked-targeting
    - guard-clause-dispatch
key_files:
  created:
    - test/bot-helpers.js
    - test/bot.test.js
  modified:
    - public/app.jsx
decisions:
  - "pickMedium is verbatim copy of legacy botPick body (SC#3 no-regression anchor)"
  - "botRemainingRef derived from FLEET_DEF at startBot time, spliced on sink — avoids re-derive myShipsRef in density (D-03)"
  - "genFleetPure uses natural Set.size (not a tagged property) since each ship Set contains exactly `size` elements"
  - "Default tier is medium — startBot(keepScore, tier='medium') unchanged by callers until Plan 02 wires selector"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-04T04:23:00Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
---

# Phase 6 Plan 1: Bot Difficulty Tier Algorithms Summary

**One-liner:** Four distinct bot targeting algorithms (Easy/Medium/Hard/Insane) proven by N=200 headless Vitest simulation with observable shot-count separation (SC#2) and Medium regression anchor (SC#3).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — failing headless test scaffold | 3309c1e | test/bot-helpers.js, test/bot.test.js |
| 2 | Implement four pure algorithms in test/bot-helpers.js | c191db1 | test/bot-helpers.js |
| 3 | Port algorithms + dispatch into public/app.jsx | c40332a | public/app.jsx |

## What Was Built

### test/bot-helpers.js
Pure-function ESM module exporting the four tier algorithms and supporting helpers:
- `genFleetPure()` — stateless fleet generator (clone of app.jsx genFleet, no React refs)
- `buildDensityMap({ shots, hits, remaining })` — enumerates valid ship placements; rejects miss cells
- `pickEasyPure({ shots })` — uniform random from unshot cells
- `pickMediumPure({ shots, queue })` — verbatim parity+queue logic from legacy botPick (SC#3)
- `pickHardPure({ shots, hits, queue, remaining })` — highest-density queue drain then global hunt
- `pickInsanePure({ shots, hits, queue, remaining })` — axis-lock + parity-masked density with fallbacks
- `inferAxis(hits)` — derives ship orientation from confirmed hit geometry (D-03 honesty)

### test/bot.test.js
Five describe blocks matching `-t easy|medium|hard|insane|ordering` selectors:
- `easy` — verifies no cell repeat + in-bounds over a full game
- `medium` — deterministic queue drain + parity hunt + any-pool fallback
- `hard` — honesty contract (no ship-set param), highest-density targeting in constrained board
- `insane` — average shots <= hard over 50 games, parity-masked hunt phase
- `ordering` (SC#2) — N=200 games: avg(easy) > avg(medium) > avg(hard) >= avg(insane), sanity bounds

### public/app.jsx
- Three new refs: `botTierRef` (init "medium"), `botHitsRef` (init Set()), `botRemainingRef` (init [])
- `startBot(keepScore, tier = "medium")` — extended signature initializes all three new refs
- `pickEasy()`, `pickMedium()`, `pickHard()`, `pickInsane()`, `buildDensityMap()`, `inferAxis()` — ported from bot-helpers.js using React refs
- `botPick()` replaced with guard-clause dispatch on `botTierRef.current`
- `botShoot()` extended: `botHitsRef.current.add(k)` on hit; on sink splices `botRemainingRef`, clears `botHitsRef` + `botQueueRef`

## Verification Results

- `npx vitest run test/bot.test.js` — 9/9 tests passed (all five describe blocks green)
- `npx vitest run` — 11/11 test files, 206 passed (no regressions in existing 10 files)
- `npm run build` — succeeded, app.jsx bundles correctly
- D-03 grep gate — `myShipsRef` absent from `pickHard`, `pickInsane`, `buildDensityMap` bodies

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | 3309c1e | All 9 tests failed (stubs throw "not implemented") |
| GREEN (feat) | c191db1 | All 9 tests passed |
| GREEN (app integration) | c40332a | Full suite + build green |

## Deviations from Plan

None — plan executed exactly as written.

The only minor adaptation: `genFleetPure` uses `Set.size` (the natural element count) instead of a manually-tagged `.size` property — `Set.size` cannot be overridden (getter-only). Since each ship Set contains exactly `size` elements, `set.size === shipSize` holds naturally. This is functionally equivalent to the plan's intent.

## Known Stubs

None. All bot algorithms are fully implemented. Plan 02 wires the tier selector UI (Lobby 4-button row + localStorage persistence) — this is intentional sequencing, not a stub.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are pure client-side JavaScript. D-03 anti-cheat boundary enforced by grep gate.

## Self-Check

Files created/modified:
- `test/bot-helpers.js` — present
- `test/bot.test.js` — present
- `public/app.jsx` — modified (pickEasy/pickMedium/pickHard/pickInsane confirmed by grep)

Commits verified:
- 3309c1e — test(06-01): add failing bot tier simulation harness
- c191db1 — feat(06-01): implement easy/medium/hard/insane pure targeting algorithms
- c40332a — feat(06-01): wire tier dispatch + density refs into app.jsx botPick/botShoot/startBot

## Self-Check: PASSED
