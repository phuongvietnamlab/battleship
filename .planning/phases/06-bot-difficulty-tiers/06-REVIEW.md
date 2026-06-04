---
phase: 06-bot-difficulty-tiers
reviewed: 2026-06-04T11:40:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - public/app.jsx
  - public/style.css
  - test/bot-helpers.js
  - test/bot.test.js
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-06-04T11:40:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase 06 diff (base `45e40c1`): bot difficulty tier algorithms in
`public/app.jsx`, pure-function test wrappers in `test/bot-helpers.js`, the
simulation harness in `test/bot.test.js`, and the difficulty selector UI / i18n /
localStorage / CSS.

The implementation is solid: the four tier algorithms (easy/medium/hard/insane)
are correctly structured, the D-03 honesty boundary (no bot reads of player ship
sets for targeting) is respected, `botRemainingRef`/`botHitsRef` state is reset
on `startBot` and on sink, and `loadBotTier` validates stored values against a
whitelist. The test suite passes and the statistical ordering test was stable
across 3 repeat runs.

No Critical defects found. The findings below are correctness/maintainability
warnings and minor quality issues. The most material is a real UX bug: the
difficulty selector's "selected" visual state is dead because clicking any tier
immediately launches the game, and the two production tier algorithms are
hand-duplicated from the test helpers with no shared source (drift risk against
the very tests meant to guard them).

## Warnings

### WR-01: Difficulty selection has no confirm step — "selected tier" highlight is dead state, and prior selection is unreachable

**File:** `public/app.jsx:752`, `public/app.jsx:766-774`
**Issue:** Each tier button's `onClick` does
`saveBotTier(tier); setSelectedTier(tier); onBot(tier)` — and `onBot` →
`handleBot` → `startBot` immediately calls `setScreen("placement")`. The screen
navigates away in the same click, so the `primary`/`ghost` highlight driven by
`selectedTier` is never visible. The `selectedTier` state and `setSelectedTier`
call are effectively dead code: the initial value loaded from `loadBotTier()`
only matters for a frame the user never sees, and the persisted `bs_botTier`
value is never used to pre-select or default a play action — every game requires
an explicit per-click choice. This makes the persistence (`saveBotTier`/
`loadBotTier`) and the whitelist-validated `medium` default largely
unobservable, and removes the single-tap "Play vs Bot" affordance that existed
before (now you must always pick a difficulty).
**Fix:** Decide the intended UX and make state match it. Either (a) make the row
a selector and add a separate "Play vs Bot" button that calls
`onBot(selectedTier)`:
```jsx
<div className="bot-tier-row">
  {VALID_TIERS.map((tier) => (
    <button key={tier}
      className={"btn" + (selectedTier === tier ? " primary" : " ghost")}
      onClick={() => { saveBotTier(tier); setSelectedTier(tier); }}>
      {t("bot." + tier)}
    </button>
  ))}
</div>
<button className="btn primary" onClick={() => onBot(selectedTier)}>
  {t("lobby.playBot")}
</button>
```
or (b) if instant-launch is intended, drop `selectedTier`/`setSelectedTier` and
the `primary`/`ghost` conditional entirely (they are misleading dead state) and
document that persistence is unused.

### WR-02: Tier algorithms duplicated between production and test helpers with no shared source — guard tests can silently diverge

**File:** `public/app.jsx:2173-2285` and `test/bot-helpers.js:58-253`
**Issue:** `buildDensityMap`, `inferAxis`, `pickHard`, and `pickInsane` exist as
two independently maintained copies — one in `app.jsx` (ref-based) and one in
`bot-helpers.js` (state-bag based). The header comment acknowledges this is
forced by the monolith not being importable in Node. The risk: the test suite
asserts properties of the *helpers*, not of the shipped `app.jsx` code, so a bug
fix or behavior change in `app.jsx` will not be caught by these tests unless the
helper copy is also hand-edited identically. The SC#3 "bit-for-bit identical to
legacy botPick" guarantee for `pickMedium` is enforced by comment only, not by
any test that compares the two implementations. Tie-breaking in the
density sort (`density[b] - density[a]` is not a total order — equal-density
cells keep array/scan order) means the two copies can diverge in output for
identical RNG if their iteration order ever drifts.
**Fix:** At minimum, add a regression test that imports the *legacy* medium body
and asserts equality with `pickMediumPure` output under a seeded RNG, and add a
checklist note (or a small script) requiring any edit to the `app.jsx` tier
functions to be mirrored in `bot-helpers.js`. Longer term, extract the pure tier
logic into a plain `.js` module that both `app.jsx` (via the esbuild bundle) and
the tests import, eliminating the duplication entirely.

### WR-03: `inferAxis` reads the whole active-hit set, so adjacent enemy ships can corrupt axis-lock targeting

**File:** `public/app.jsx:2227-2236`, `test/bot-helpers.js:101-112`
**Issue:** `inferAxis` infers orientation from *all* cells in `botHitsRef`, which
accumulates every hit since the last sink. If the bot hits one cell of ship A and
then (via the neighbor queue) hits a cell of an adjacent ship B that happens to
share a row/column with A before either sinks, `rows.size === 1` (or
`cols.size === 1`) can hold across two different ships, locking the axis to a
line that spans both ships and steering the queue filter toward cells that belong
to neither ship's remaining extent. With two size-3 ships in the fleet, adjacent
placements are common. This degrades the Insane tier into wasted shots in exactly
the situations it is meant to excel at, and is a latent logic error rather than a
pure heuristic preference.
**Fix:** Constrain axis inference to a single contiguous run. For example, only
infer an axis when the hit set forms one straight, gap-free line (sort hits along
the candidate axis and require consecutive indices), and abandon the lock when a
hit breaks collinearity. Apply the same fix to the helper copy.

### WR-04: Ordering test relies on unseeded `Math.random` and statistical margins — inherently flaky under CI variance

**File:** `test/bot.test.js:184-209`, `test/bot.test.js:214-238`
**Issue:** Both the "insane <= hard + 5" test and the `ordering` test
(`easy > medium > hard >= insane`, `avg(easy) < 130`, `avg(insane) > 25`) draw
fleets from unseeded `Math.random()` and assert on sampled averages over N=50 /
N=200. These are probabilistic: the strict `>` between adjacent tiers and the
`hard >= insane` boundary have no guaranteed margin, so a statistically unlucky
run can fail with no code regression. It passed 3x here, but unseeded statistical
assertions are a known source of intermittent CI failures and erode trust in the
suite. There is also no RNG seeding to make a failure reproducible.
**Fix:** Inject a seeded PRNG (e.g., mulberry32) into `genFleetPure` and the pick
functions for the deterministic tests, or widen the tolerance and add explicit
margin (e.g., `expect(avg.easy).toBeGreaterThan(avg.medium + 3)`), and log the
seed on failure so flakes are reproducible. Keep at least one deterministic,
seed-pinned ordering assertion as the real SC#2 guard.

## Info

### IN-01: Orphaned i18n key `lobby.playBot` after button replacement

**File:** `public/app.jsx:31`, `public/app.jsx:167`
**Issue:** The single "Play vs Bot" button was replaced by the tier row, so the
`lobby.playBot` EN/VI strings are now unused (no remaining reference in render
code). Dead translation strings accumulate maintenance noise.
**Fix:** Remove both `lobby.playBot` entries, or reuse the key per WR-01 if a
dedicated play button is reintroduced.

### IN-02: `genFleet` / `genFleetPure` silently produce a short fleet if placement fails

**File:** `public/app.jsx:2111-2126`, `test/bot-helpers.js:30-49`
**Issue:** Both fleet generators cap retries at `t++ < 800` and, on exhaustion,
push nothing for that ship and continue — yielding a fleet with fewer than 5
ships and no error. This is pre-existing for `genFleet`, but `genFleetPure`
copies it and `botRemainingRef` is seeded from `FLEET_DEF` (always 5 sizes), so a
short bot fleet would desync `remaining` from actual ships. Extremely unlikely on
an 11x11 board, but it fails silently rather than loudly.
**Fix:** After the loop, assert/guard `ships.length === FLEET_SIZES.length` (in
tests) and log a warning in `genFleet` if a ship was dropped.

### IN-03: `bot-helpers.js` comment claims Sets are "tagged with a .size property"

**File:** `test/bot-helpers.js:29`, `test/bot-helpers.js:42`
**Issue:** The doc comment says each Set is "tagged with a `.size` property,"
implying a custom attribute. It is actually the native `Set.prototype.size`. The
comment is misleading to a future maintainer who might try to set `.size`
explicitly (which would throw / be ignored).
**Fix:** Reword to "each Set's native `.size` equals the ship's cell count."

### IN-04: Redundant `buildDensityMap()` call in `pickHard` / `pickInsane` queue-miss path

**File:** `public/app.jsx:2245-2261` (`pickHard`), `test/bot-helpers.js:157-186`
**Issue:** In `pickHard`, when the queue is non-empty but all candidates are
already shot, `buildDensityMap()` is computed once inside the queue branch and
then again in the hunt branch. (Flagged as quality/duplication, not performance —
per scope, perf is out of v1.) It is also a readability smell that the density
map is built in two places.
**Fix:** Compute `const density = buildDensityMap()` once at the top of the
function and reuse it in both branches.

### IN-05: Inline styles for the "Select difficulty" label instead of a CSS class

**File:** `public/app.jsx:765`
**Issue:** The label uses an inline `style={{...}}` object while the adjacent row
uses the `.bot-tier-row` CSS class added in `style.css`. Mixing inline styles
with the project's CSS-class convention is inconsistent.
**Fix:** Move the label styling into a `.bot-tier-label` rule in `style.css`.

---

_Reviewed: 2026-06-04T11:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
