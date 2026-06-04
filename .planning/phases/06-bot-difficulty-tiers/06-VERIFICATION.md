---
phase: 06-bot-difficulty-tiers
verified: 2026-06-04T11:42:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the app in a browser and verify the 4-button difficulty selector renders correctly, persists selection, and the advance-mode bot path is unchanged"
    expected: |
      1. Four buttons (Easy / Medium / Hard / Insane) appear in the Lobby under a 'Select difficulty' heading, replacing the old single 'Play vs Bot' button.
      2. Toggling language to Vietnamese shows: Dễ / Trung bình / Khó / Cực khó and heading 'Chọn độ khó'.
      3. Tapping 'Hard' starts placement immediately (one tap, no extra confirm step).
      4. Reloading the page after picking Hard shows Hard pre-highlighted (bs_botTier persisted).
      5. Clearing localStorage (delete bs_botTier) and reloading shows Medium highlighted by default.
      6. Setting bs_botTier to a garbage value (e.g. 'xyz') in devtools and reloading falls back to Medium without crashing.
      7. Starting an Advance-mode single-player bot game (toggle Advance, play vs bot) behaves identically to before this phase — no tier row applied to the advance path.
    why_human: "Visual rendering, one-tap UX flow, language toggle, localStorage state-across-reload, and advance-mode regression cannot be confirmed by static grep or automated headless test."
---

# Phase 6: Bot Difficulty Tiers Verification Report

**Phase Goal:** A single-player can choose a bot opponent at one of four distinct difficulty levels, each with a meaningfully different targeting strategy.
**Verified:** 2026-06-04T11:42:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The bot difficulty selector shows four options (easy / medium / hard / insane) before a single-player game starts | ✓ VERIFIED | `app.jsx:766-774`: Lobby renders `<div className="bot-tier-row">` mapping `VALID_TIERS` (= `["easy","medium","hard","insane"]`) to buttons; heading from `t("bot.selectTier")`; `selectedTier` state init from `loadBotTier()`. Full wiring: `onBot={handleBot}` → `handleBot(tier) { startBot(false, tier); }` confirmed at lines 2146 and 2523. |
| 2 | Each difficulty tier uses a distinct targeting algorithm — easy random; medium hunts after a hit; hard probability-density; insane near-optimal — producing observably different win rates | ✓ VERIFIED | `test/bot.test.js` ordering block (`-t ordering`) asserts `avg(easy) > avg(medium) > avg(hard) >= avg(insane)` over N=200 games with sanity bounds `avg(easy) < 130` and `avg(insane) > 25`. `npx vitest run test/bot.test.js` exits 0 with 9/9 tests passing (confirmed live run). Four distinct algorithm functions exist in `app.jsx`: `pickEasy` (line 2149), `pickMedium` (line 2159), `pickHard` (line 2215), `pickInsane` (line 2237); dispatched by `botPick()` guard-clause on `botTierRef.current` (lines 2279-2285). |
| 3 | An existing single-player game started before this phase behaves identically (no regression in current bot behavior) | ✓ VERIFIED | `pickMedium()` is a verbatim copy of the legacy `botPick` body. Default `tier = "medium"` in `startBot(keepScore, tier = "medium")`. Queue-offer `startBot()` call at line 2561 passes no tier → defaults Medium. Full test suite `npx vitest run` exits 0: 11/11 files, 206 passed, no regressions against pre-existing 10 test files. |

**Score:** 3/3 success criteria verified (6/6 must-haves — see below)

---

### Observable Must-Haves (merged from PLAN 01 + PLAN 02 frontmatter)

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Easy tier fires only at unshot, in-bounds cells (never a repeat) | ✓ VERIFIED | `bot.test.js` easy describe block: asserts no repeat + bounds per turn. `pickEasyPure` in `bot-helpers.js:118-126` and `pickEasy()` in `app.jsx:2149-2157` — pure pool from unshot cells, uniform random. Tests GREEN. |
| 2 | Medium tier behaves bit-for-bit identically to the pre-phase botPick (SC#3 anchor) | ✓ VERIFIED | `bot.test.js` medium describe block: queue-drain (LIFO), parity fallback, any-cell fallback. `pickMediumPure` is labeled "verbatim copy of legacy botPick body" (`bot-helpers.js:134-149`). `pickMedium()` in `app.jsx:2159-2172` is identical logic using refs. |
| 3 | Hard tier fires the highest probability-density unshot cell and never reads myShipsRef | ✓ VERIFIED | `pickHardPure` / `pickHard()` use `buildDensityMap()` exclusively. Grep of `app.jsx` confirms `myShipsRef` appears ONLY in `botShoot` (hit-detection) — not inside `pickHard`, `pickInsane`, or `buildDensityMap`. D-03 gate: CLEAN. |
| 4 | Insane tier (parity mask + axis lock) is honest and finishes in <= Hard average shots | ✓ VERIFIED | `bot.test.js` insane block: `avg(insane) <= avg(hard) + 5` over 50 games. Full ordering block: `avg(hard) >= avg(insane)` over 200 games. Both GREEN. |
| 5 | Headless 200-game simulation shows avg shots easy > medium > hard >= insane (SC#2) | ✓ VERIFIED | `npx vitest run test/bot.test.js` → 9/9 PASSED including the ordering describe block with N=200, timeout 60s. Live run completed in 8.55s total. |
| 6 | botPick dispatches on botTierRef.current; live app and test harness share the same algorithm logic | ✓ VERIFIED | `app.jsx:2279-2285`: `botPick()` guard-clause dispatches `easy→pickEasy`, `hard→pickHard`, `insane→pickInsane`, else `pickMedium`. `botTierRef` declared at line 1749, set in `startBot` at line 2136. `bot-helpers.js` exports the pure-function analogs with identical logic. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/bot-helpers.js` | Pure-function tier algorithms + genFleetPure | ✓ VERIFIED (WIRED) | Exists, substantive (254 lines). Exports: `genFleetPure`, `buildDensityMap`, `pickEasyPure`, `pickMediumPure`, `pickHardPure`, `pickInsanePure`. Imported by `test/bot.test.js` at line 9. |
| `test/bot.test.js` | Per-tier behavior tests + 200-game ordering assertion | ✓ VERIFIED (WIRED) | Exists, substantive (239 lines). Five describe blocks selectable by `-t easy|medium|hard|insane|ordering`. Consumed by vitest via existing config — all 9 tests PASS. |
| `public/app.jsx` | pickEasy/pickMedium/pickHard/pickInsane + botPick dispatch + botTierRef/botHitsRef/botRemainingRef + VALID_TIERS + saveBotTier/loadBotTier + bot-tier-row UI + handleBot | ✓ VERIFIED (WIRED) | All functions confirmed present. Refs declared at lines 1749-1751. `VALID_TIERS` at line 13. `saveBotTier`/`loadBotTier` at lines 390-391. Lobby tier row at lines 765-774. `handleBot` at line 2146. `onBot={handleBot}` at line 2523. |
| `public/style.css` | .bot-tier-row styling | ✓ VERIFIED (WIRED) | Lines 268-270: `.bot-tier-row { display:flex; gap:8px; margin:0 0 8px; }` + `.bot-tier-row .btn { flex:1; padding:10px 4px; font-size:14px; }`. Mirrors `.mode-pick` pattern. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `public/app.jsx botPick()` | `pickEasy/pickMedium/pickHard/pickInsane` | dispatch on `botTierRef.current` | ✓ WIRED | Lines 2280-2284: guard-clause dispatch confirmed. `botTierRef.current` appears at lines 1749, 2136, 2280. |
| `test/bot.test.js` | `test/bot-helpers.js` | ESM import of pure pick functions | ✓ WIRED | `bot.test.js:9-15`: `import { pickEasyPure, pickMediumPure, pickHardPure, pickInsanePure, genFleetPure } from "./bot-helpers.js"` |
| Lobby tier button | `startBot(false, tier)` | `onBot(tier)` → `handleBot` wrapper | ✓ WIRED | Button `onClick` at line 771: `onBot(tier)` → App passes `onBot={handleBot}` (line 2523) → `handleBot(tier) { startBot(false, tier); }` (line 2146). |
| `loadBotTier()` | `localStorage bs_botTier` | whitelist-validated read | ✓ WIRED | Line 391: `VALID_TIERS.includes(stored) ? stored : "medium"`. `selectedTier` state at line 752 initialized from `loadBotTier`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `Lobby` tier buttons | `selectedTier` | `useState(loadBotTier)` → `localStorage.getItem("bs_botTier")` | Yes — whitelist-validated read with "medium" default | ✓ FLOWING |
| `botPick()` dispatch | `botTierRef.current` | `startBot(false, tier)` ← `handleBot(tier)` ← button `onClick` | Yes — tier string flows from user click through to ref | ✓ FLOWING |
| `buildDensityMap()` | `remaining` | `botRemainingRef.current` — initialized from `FLEET_DEF.map(f => f.size)`, spliced on sink | Yes — real unsunk ship sizes; tested by N=200 sim | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC#2 win-rate ordering (N=200) | `npx vitest run test/bot.test.js` | 9/9 tests passed, 8.55s | ✓ PASS |
| Full regression (11 test files) | `npx vitest run` | 11/11 files, 206 passed, 0 failures | ✓ PASS |
| app.jsx bundles without error | `npm run build` | `Game built → dist/ (SERVER_URL=(same-origin))` | ✓ PASS |
| D-03 honesty gate | `myShipsRef` absent from `pickHard`/`pickInsane`/`buildDensityMap` | Grep confirms `myShipsRef` appears only in `botShoot` (hit detection) and ref declarations — not in any targeting function body | ✓ PASS |

---

### Probe Execution

No phase-declared probes. `test/bot.test.js` is the functional equivalent and was run directly above.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BOT-01 | 06-01-PLAN.md, 06-02-PLAN.md | A single-player can choose a bot difficulty tier (easy / medium / hard / insane), each a distinct targeting algorithm | ✓ SATISFIED | Four algorithms implemented and tested. Selector UI present and wired. 200-game simulation proves observable win-rate difference. Pending human browser verification of the UI (SC#1, D-05, D-06, D-07). |

No orphaned requirements — REQUIREMENTS.md traceability table maps BOT-01 exclusively to Phase 6.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No TBD/FIXME/XXX debt markers found in any phase-modified file. No stub returns (empty array/object with no data source). No unreferenced `TODO` markers. |

---

### Human Verification Required

#### 1. Bot Tier Selector — UI Render, Persistence, and Advance Regression (SC#1, D-05, D-06, D-07)

**Test:** Run `npm run build` then `npm start`, open the app at the lobby.

1. Confirm four buttons (Easy / Medium / Hard / Insane) appear under a "Select difficulty" heading in place of the old single "Play vs Bot" button.
2. Toggle the language to Vietnamese: confirm labels read **Dễ / Trung bình / Khó / Cực khó** and the heading reads **Chọn độ khó**.
3. Tap "Hard" — confirm placement starts immediately without an extra confirmation step (one-tap start).
4. Complete or exit, then reload the page: confirm "Hard" is the pre-highlighted default.
5. In devtools, delete the `bs_botTier` localStorage key and reload: confirm "Medium" is the default highlighted tier.
6. Set `bs_botTier` to a garbage value (e.g. `"xyz"`) in devtools and reload: confirm it falls back to Medium without crash or visible error.
7. Enable Advance mode, start a single-player bot game: confirm bot behavior matches what it was before this phase (advance path defaults to Medium, no tier-row interference).

**Expected:** All 7 steps pass.

**Why human:** Visual button rendering, language-toggle behavior, one-tap UX flow, localStorage state-across-reload, and advance-mode regression cannot be confirmed by static code analysis or headless simulation.

---

### Gaps Summary

No automated gaps found. All six must-haves are VERIFIED by codebase inspection and live test execution.

The `human_needed` status reflects the blocking human-verify checkpoint in Plan 02 Task 3, which the SUMMARY.md records as "(checkpoint, approved)" — meaning the developer already ran these steps and approved. However, since that approval is documented in a SUMMARY (not independently observed by this verifier), and the PLAN explicitly gates Task 3 as `checkpoint:human-verify gate="blocking"`, the classification is `human_needed` per the verification decision tree (any human verification items → `human_needed`, even when automated checks all pass).

If the developer can confirm the Task 3 checkpoint approval still holds (UI has not regressed since commit `789a37d`), this verification can be closed as passed.

---

_Verified: 2026-06-04T11:42:00Z_
_Verifier: Claude (gsd-verifier)_
