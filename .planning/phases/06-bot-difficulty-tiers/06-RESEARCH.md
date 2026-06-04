# Phase 6: Bot Difficulty Tiers - Research

**Researched:** 2026-06-04
**Domain:** Client-side game AI / Battleship targeting algorithms
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Current `botPick`/`botShoot` (`app.jsx:2115-2161`) = checkerboard-parity search + hunt-after-hit neighbor queue. This becomes the **Medium** tier verbatim — it is the no-regression anchor for SC#3.
- **D-02:** Four tiers, distinct algorithms:
  - **Easy** — pure random fire among unshot cells. No parity, no hunt-after-hit.
  - **Medium** — existing parity + hunt-after-hit (unchanged behavior).
  - **Hard** — probability-density targeting (compute hit-probability heatmap per cell from remaining-fleet placements; fire highest-density cell).
  - **Insane** — near-optimal: probability-density with stronger priors (parity-constrained density, smarter post-hit ship-orientation inference).
- **D-03:** Insane stays **honest** — never reads the player's actual ship cells. No cheating/peeking. Strength comes from better priors, not information leaks.
- **D-04:** Replace lobby single "Play vs Bot" button with an **inline 4-button tier row**. One tap selects tier + starts placement.
- **D-05:** **Remember last-picked tier in localStorage**; default to **Medium** on first visit / no stored value.
- **D-06:** EN/VI i18n required for all four tier labels (and any helper text) — follow existing `t()` string convention.
- **D-07:** Tiers apply to **classic single-player only**. Advance/power-up bot path keeps current behavior unchanged.

### Claude's Discretion

- Code organization: whether to extract four targeting algorithms into a separate module vs keep inline in `app.jsx` (monolith is the established convention; extraction optional).
- Per-tier move pacing (current 600ms `setTimeout` delay) — keep or tune per tier; density compute is trivial on 11×11 so no perf concern.
- Exact heatmap/priors formulation for Hard vs Insane, pending the research spike.

### Deferred Ideas (OUT OF SCOPE)

- Difficulty tiers for advance/power-up bot mode (mine/ability targeting strategy).
- Adaptive/dynamic difficulty (bot scales to player skill).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOT-01 | A single-player can choose a bot difficulty tier (easy / medium / hard / insane), each a distinct targeting algorithm | All four algorithms fully specified below; integration shape documented; no external packages needed |
</phase_requirements>

---

## Summary

Phase 6 is a pure client-side JavaScript problem: four distinct Battleship targeting algorithms branching off a shared `botShoot` resolution loop in `public/app.jsx`. The algorithms span a well-studied performance ladder — random (~97 shots median), parity+hunt (~64 shots), probability-density (~42 shots), and density-with-stronger-priors (~40-42 shots, near-optimal without cheating).

The key research spike was the **probability-density (heatmap) algorithm** for the Hard tier. The algorithm is well-understood, has a direct JavaScript implementation path using existing game primitives (`cellsFor`, `inBounds`, `key`), and is computationally trivial on an 11×11 board: a density rebuild costs at most ~3,100 inner loop iterations (~0.3ms worst-case), declining as ships sink. No async work, no Web Worker, no external library needed.

The **Insane tier** delta over Hard is concrete: add checkerboard (parity) masking to the density heatmap during hunt phase (so only even-checkered cells are fire candidates when no active hit queue exists), and after 2+ consecutive collinear hits, lock the ship axis and only test extensions in that axis direction before falling back to unmasked density. This eliminates large swaths of low-probability cells without cheating.

**Primary recommendation:** Implement all four algorithms inline in `public/app.jsx`, dispatching from a `botTierRef` via the existing `botPick()` function pattern. No new dependencies. No module extraction required.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bot targeting algorithm | Browser / Client | — | Bot AI runs entirely client-side; no server room created for single-player (existing pattern) |
| Tier selection UI (4-button row) | Browser / Client | — | Lobby is a client React component; tier state lives in React + localStorage |
| Tier persistence (localStorage) | Browser / Client | — | Mirrors existing `clientId`/`lang` localStorage pattern; no server involvement |
| i18n tier labels | Browser / Client | — | EN/VI strings embedded in `app.jsx` I18N object (existing pattern) |
| Ship placement data for density | Browser / Client | — | `genFleet()` and `FLEET_DEF` are client-side constants; density uses these directly |

---

## Standard Stack

### Core

No new packages. All implementation uses existing project primitives.

| Asset | Location | Purpose |
|-------|----------|---------|
| `BOARD = 11` | `app.jsx:6` | Grid size constant — density loops run 0..10 |
| `FLEET_DEF` | `app.jsx:297-303` | Fleet sizes `[5,4,3,3,2]` — iterated for density enumeration |
| `cellsFor(r, c, size, dir)` | `app.jsx:461` | Returns array of `{r,c}` cells for a placement — reuse in density builder |
| `inBounds(cells)` | `app.jsx:468` | Bounds check — reuse in density builder |
| `key(r, c)` | `app.jsx:460` | Cell key format `"r,c"` — reuse for set lookups |
| `botShotsRef` | Ref | Set of all cells the bot has fired at |
| `botQueueRef` | Ref | Hunt target queue (neighbor cells after a hit) |
| `myShipsRef` | Ref | Array of Sets, each being a ship's cell keys |

### Supporting

| Asset | Purpose | Notes |
|-------|---------|-------|
| `localStorage` | Remember last-picked tier | Key: `bs_botTier`; default `"medium"` on missing |
| `t()` i18n helper | Tier label strings | New keys: `bot.easy`, `bot.medium`, `bot.hard`, `bot.insane` (EN + VI) |
| `setTimeout(botShoot, 600)` | Bot move pacing | Unchanged across all tiers; density compute is ~0.3ms, imperceptible |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline in `app.jsx` | Separate `bot-ai.js` module | Extraction cleaner at scale but contradicts established monolith convention; inline preferred |
| Exhaustive enumeration (density) | Monte Carlo sampling | Monte Carlo needed only if configs > threshold (~10M); 11×11 with 5 ships = ~3,100 iterations; exhaustive is faster and deterministic |

**Installation:** No packages to install.

---

## Package Legitimacy Audit

No external packages are installed in this phase. All implementation uses existing project dependencies and browser-native APIs.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Lobby (React component, app.jsx ~line 734)
  |
  | onBot(tier)          [D-04: 4-button tier row replaces single button]
  v
startBot(tier)           [app.jsx:2100 — reset game state]
  |
  | sets botTierRef.current = tier
  | reads/writes localStorage('bs_botTier')
  v
placement screen → player places ships → ready
  |
  v
botShoot()               [app.jsx:2129 — unchanged orchestrator]
  |
  | calls botPick()
  v
botPick()                [dispatches on botTierRef.current]
  |
  +--[easy]-----> pickEasy()    pure random from unshot cells
  |
  +--[medium]---> pickMedium()  current parity+queue logic (VERBATIM, no change)
  |
  +--[hard]-----> pickHard()    density heatmap (enumerate remaining ships, pick max)
  |
  +--[insane]---> pickInsane()  parity-masked density + axis-lock after 2 collinear hits
  |
  v
botShoot() resolves hit/miss, updates botShotsRef, botQueueRef, React state
  (resolution loop UNCHANGED across all tiers)
```

### Recommended Project Structure

No new files or directories required. All changes in:

```
public/
└── app.jsx              # All four botPick* functions + tier UI + i18n strings
```

Optional (Claude's discretion): if function count grows unwieldy, extract to a sibling `public/bot-ai.js` and import via esbuild. Not recommended unless executor finds it necessary.

---

## The Core Algorithms — Full Specification

### Algorithm 1: Easy (trivial)

**What:** Pure random selection from unshot cells. No parity filtering, no hunt-after-hit.

```javascript
// Source: standard random-search pattern; no external reference needed
function pickEasy() {
  const pool = [];
  for (let r = 0; r < BOARD; r++)
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (!botShotsRef.current.has(k)) pool.push(k);
    }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
```

**Expected performance:** ~97 shots median to win (standard 10×10 reference; 11×11 scales similarly upward). [CITED: datagenetics.com/blog/december32011]

---

### Algorithm 2: Medium (verbatim existing — no change)

**What:** Checkerboard-parity search in hunt phase; push all 4 neighbors to `botQueueRef` on a hit; drain queue before hunting again. This is `botPick()` at `app.jsx:2115-2128` copied verbatim.

**Expected performance:** ~64 shots median to win. [CITED: paulvanderlaken.com/2019/01/21]

**SC#3 anchor:** The executor must NOT modify `botPick()`. Instead, `botPick()` dispatches to `pickMedium()` which contains the current logic unchanged.

---

### Algorithm 3: Hard — Probability-Density Heatmap

**What:** Build a per-cell density count by enumerating every valid placement of every remaining (unsunk) ship; fire the cell with the highest count. Integrate with hunt-after-hit: when `botQueueRef` is non-empty, density is still computed but the queue neighbors are given a density bonus (or density is used as tiebreaker after draining the queue — either approach works; the simpler is to drain the queue first like Medium, but break ties by density score if multiple remain).

**Recommended integration:** drain `botQueueRef` but filter using density — fire the queue cell with highest density score rather than LIFO order. If queue is empty, fire highest-density cell across the board.

**Pseudocode:**

```javascript
function buildDensityMap() {
  // density[key] = count of valid placements covering that cell
  const density = {};
  for (let r = 0; r < BOARD; r++)
    for (let c = 0; c < BOARD; c++)
      density[key(r, c)] = 0;

  // Only enumerate ships that are NOT yet fully sunk
  const remaining = getRemainingShipSizes(); // derived from myShipsRef + botShotsRef

  for (const size of remaining) {
    for (const dir of ["h", "v"]) {
      for (let r = 0; r < BOARD; r++) {
        for (let c = 0; c < BOARD; c++) {
          const cells = cellsFor(r, c, size, dir);
          if (!inBounds(cells)) continue;

          // Placement is invalid if any cell is a confirmed MISS
          // (i.e., bot has shot it AND it was NOT a hit)
          // A cell is a hit if myShipsRef contains it AND botShotsRef contains it
          const hitKeys = getHitKeys(); // botShotsRef cells that are hits
          const missKeys = getMissKeys(); // botShotsRef cells that are misses

          let valid = true;
          for (const cell of cells) {
            const k = key(cell.r, cell.c);
            if (missKeys.has(k)) { valid = false; break; }
            // Also skip cells from SUNK ships (sunk cells are confirmed, no need to target)
          }
          if (!valid) continue;

          // Valid placement: increment density for each covered cell
          for (const cell of cells) {
            density[key(cell.r, cell.c)]++;
          }
        }
      }
    }
  }
  return density;
}

function pickHard() {
  // Drain queue but pick highest-density cell from queue
  if (botQueueRef.current.length) {
    const density = buildDensityMap();
    const queueCandidates = botQueueRef.current
      .filter(k => !botShotsRef.current.has(k));
    botQueueRef.current = []; // clear — we'll re-add if multiple remain
    if (queueCandidates.length) {
      // Pick highest density from queue candidates
      queueCandidates.sort((a, b) => density[b] - density[a]);
      // Re-queue the rest for next turn
      botQueueRef.current = queueCandidates.slice(1);
      return queueCandidates[0];
    }
  }

  // Hunt phase: pick globally highest-density unshot cell
  const density = buildDensityMap();
  let bestKey = null, bestScore = -1;
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (botShotsRef.current.has(k)) continue;
      if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
    }
  }
  return bestKey;
}
```

**Tracking hits vs misses:** The bot currently knows whether a cell was a hit via `myShipsRef.current.some(ship => ship.has(k))` at shot time (line 2134). The executor must maintain two refs: `botHitsRef` (Set of hit keys) and the existing `botShotsRef` (all shots). Miss keys = `botShotsRef` minus `botHitsRef`. Sunk ship cells are hit keys covered by a fully-sunk ship in `myShipsRef`.

**Remaining ship sizes:** After each sink event, remove that ship's size from the remaining-ships list. Maintain a ref `botRemainingRef` initialized from `FLEET_DEF` sizes at `startBot()` time; remove one entry per sink event.

**Expected performance:** ~42 shots median to win (10×10 reference). 11×11 grid scales slightly higher but the relative tier separation is preserved. [CITED: paulvanderlaken.com/2019/01/21, datagenetics.com]

**Compute cost:** On 11×11 with fleet `[5,4,3,3,2]`: at most 946 placement checks, each costing up to 5 cell-mark operations = ~3,100 total operations per density rebuild. At any modern JS engine speed this is under 1ms. No performance concern. [VERIFIED: computed above]

---

### Algorithm 4: Insane — Parity-Constrained Density + Axis Lock

**What:** Two "stronger priors" layered on top of Hard's density:

**Prior 1 — Parity masking during hunt phase:**
When the bot is in hunt phase (no active unsunk hits, i.e., `botQueueRef` is empty or contains only already-shot cells), restrict the density candidate set to checkerboard cells (`(r + c) % 2 === 0`). This halves the search space in hunt mode and still guarantees coverage of every ship of size >= 2. The minimum remaining ship size determines whether parity is still beneficial — once only size-2 ships remain, parity is still valid; once all remaining ships are size 1 (hypothetically impossible in standard Battleship), parity would be lifted. For this game with minimum ship size 2, parity filtering is always valid.

**Prior 2 — Axis lock after 2+ collinear hits:**
Once the bot has >= 2 sequential hits on the same row OR same column (i.e., `botQueueRef` contains cells that are all in the same row or same column as the hit chain), infer the ship axis and only target extensions of that axis.

Implementation: after each hit in `botShoot`, before pushing to `botQueueRef`, run the axis-lock check:

```javascript
function inferAxis(hitQueue) {
  // hitQueue: array of unshot neighbor keys pushed after hits
  // Check if all CONFIRMED HITS so far (not just queue) are collinear
  const hitArr = [...botHitsRef.current].map(k => {
    const [r, c] = k.split(",").map(Number); return { r, c };
  });
  // If 2+ hits share the same row → axis = "h" (horizontal ship)
  // If 2+ hits share the same column → axis = "v" (vertical ship)
  if (hitArr.length < 2) return null;
  const rows = new Set(hitArr.map(h => h.r));
  const cols = new Set(hitArr.map(h => h.c));
  if (rows.size === 1) return "h";
  if (cols.size === 1) return "v";
  return null; // mixed — no inference possible (shouldn't happen in standard game)
}
```

When axis is detected, `pickInsane()` in target phase only proposes extensions along that axis:

```javascript
function pickInsane() {
  const density = buildDensityMap();

  if (botQueueRef.current.length) {
    const validQueue = botQueueRef.current.filter(k => !botShotsRef.current.has(k));
    const axis = inferAxis(validQueue);
    let candidates = validQueue;
    if (axis) {
      // Filter to only same-axis extensions
      const axisFiltered = validQueue.filter(k => {
        const [r, c] = k.split(",").map(Number);
        const hits = [...botHitsRef.current].map(h => {
          const [hr, hc] = h.split(",").map(Number); return { r: hr, c: hc };
        });
        return axis === "h"
          ? hits.some(h => h.r === r)   // same row as any hit
          : hits.some(h => h.c === c);  // same col as any hit
      });
      if (axisFiltered.length) candidates = axisFiltered;
      // If axis filter removes everything (edge: ship wraps), fall back to full queue
    }
    botQueueRef.current = [];
    if (candidates.length) {
      candidates.sort((a, b) => density[b] - density[a]);
      botQueueRef.current = candidates.slice(1);
      return candidates[0];
    }
  }

  // Hunt phase: parity-masked density
  let bestKey = null, bestScore = -1;
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      if ((r + c) % 2 !== 0) continue; // parity mask
      const k = key(r, c);
      if (botShotsRef.current.has(k)) continue;
      if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
    }
  }
  // Fallback: if parity pool exhausted (late game), lift mask
  if (!bestKey) {
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        const k = key(r, c);
        if (botShotsRef.current.has(k)) continue;
        if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
      }
    }
  }
  return bestKey;
}
```

**Why this is NOT cheating (D-03):** Both priors derive entirely from:
1. The bot's own shot history (`botShotsRef`, `botHitsRef`) — its observable evidence.
2. The mathematical constraint that ships must be contiguous and of known sizes.
The bot never accesses `myShipsRef` (player's actual fleet) except through the hit/miss results it already observes from firing. This is the same information a human expert would use.

**Expected performance:** ~40-42 shots median (near-optimal zone). Parity alone lifts the Hard tier by ~2-3 shots; axis lock provides 1-3 additional improvement on average. [CITED: datagenetics.com analysis of parity+density vs density-only; austinrochford.com Thompson sampling comparison]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Ship placement enumeration | A separate grid solver or tree search | Nested for-loops over `cellsFor` + `inBounds` (already exist) — 3,100 max iterations is trivial |
| Performance optimization | Web Worker, caching, bitmasking | Not needed — density rebuild is <1ms on 11×11 |
| Tier persistence | Custom storage layer | `localStorage.getItem/setItem('bs_botTier')` — mirror existing `saveRoom`/`loadRoom` pattern |
| Hit/miss tracking | Re-derive every shot | Maintain `botHitsRef` (new Set ref) alongside existing `botShotsRef` |

**Key insight:** The entire Hard and Insane algorithm fits in ~60 lines of vanilla JS reusing existing game primitives. Do not over-engineer.

---

## Common Pitfalls

### Pitfall 1: Density includes already-sunk ship sizes

**What goes wrong:** If `buildDensityMap()` enumerates all 5 original ship sizes including sunken ones, density scores are inflated in areas the bot knows are resolved. Insane becomes weaker than it should be.

**Why it happens:** Easy to forget to filter out sunk ships when iterating `FLEET_DEF`.

**How to avoid:** Maintain `botRemainingRef` (array of remaining ship sizes, initialized from `FLEET_DEF` sizes, splice out one entry per sink event). `buildDensityMap` iterates `botRemainingRef.current`, not `FLEET_DEF`.

**Warning signs:** Bot keeps targeting areas around sunk ship cells late in the game.

---

### Pitfall 2: Density includes confirmed-miss cells as valid placement positions

**What goes wrong:** A placement is counted in the density even though one of its cells is a confirmed miss. This inflates density near edges of miss clusters.

**Why it happens:** Miss check omitted in the placement validity loop.

**How to avoid:** In `buildDensityMap`, for each candidate placement, verify NO cell in the placement is in the miss set. Miss set = `botShotsRef.current` minus `botHitsRef.current`.

---

### Pitfall 3: Axis-lock eliminates all valid targets (edge ship / wrap)

**What goes wrong:** After inferring horizontal axis, all horizontal extensions are already shot. Bot returns null.

**Why it happens:** Axis-lock filter over-prunes.

**How to avoid:** Always maintain a fallback: if `axisFiltered.length === 0`, use the unfiltered queue. If the unfiltered queue is also empty, fall back to full density hunt. This is the "if axisFiltered.length" guard shown in the pseudocode above.

---

### Pitfall 4: botQueueRef not cleared on sink in density-mode tiers

**What goes wrong:** After a ship sinks in Hard/Insane, the queue still holds neighbors of its cells. Those cells are valid shots, but the ship-axis inference may incorrectly fire along the sunk ship's direction instead of hunting for the next ship.

**Why it happens:** Current `botShoot` clears the queue implicitly by draining it, but density-mode tiers pick from the queue selectively, potentially leaving stale entries.

**How to avoid:** On each sink event in `botShoot`, clear `botQueueRef.current = []` and reset `botHitsRef.current = new Set()` (resetting the active-hit chain — sunk cells are tracked separately in `sunkMyCells`). Also reset any axis inference state.

---

### Pitfall 5: Medium tier regression (SC#3)

**What goes wrong:** Refactoring `botPick()` to dispatch on tier breaks the Medium path, causing subtly different behavior.

**Why it happens:** Copy-paste drift or accidental condition inversion.

**How to avoid:** The executor must extract the current `botPick()` body verbatim into `pickMedium()` and have the new `botPick()` call `pickMedium()` when `botTierRef.current === "medium"`. The Vitest test suite should verify `pickMedium` produces identical output to the pre-refactor `botPick` with a deterministic seed.

---

### Pitfall 6: localStorage tier key collision

**What goes wrong:** A future phase uses the same localStorage key for a different purpose.

**Why it happens:** No namespace discipline.

**How to avoid:** Use key `bs_botTier` (prefixed `bs_` matching existing `bs_clientId`, `bs_room`).

---

### Pitfall 7: Insane parity mask misfires late game

**What goes wrong:** Late game only 1-cell-unshot-parity cells remain and they're all misses; `bestKey` stays null; fallback to unmasked density is skipped, returning null.

**Why it happens:** Fallback guard missing.

**How to avoid:** The parity-mask loop must be followed by an explicit unmasked fallback loop (as shown in pseudocode). This is the standard parity-with-fallback pattern.

---

## Integration Shape

### Tier threading: Lobby → startBot → botPick

```
// In Lobby component (app.jsx ~734):
// Replace:
<button onClick={onBot}>{t("lobby.playBot")}</button>
// With:
<div className="bot-tier-row">
  {["easy","medium","hard","insane"].map(tier => (
    <button
      key={tier}
      className={"btn" + (selectedTier === tier ? " primary" : " ghost")}
      onClick={() => onBot(tier)}
    >
      {t("bot." + tier)}
    </button>
  ))}
</div>
```

`selectedTier` state defaults to `localStorage.getItem("bs_botTier") || "medium"`.

Clicking a button: update `selectedTier`, write to localStorage, call `onBot(tier)`.

```
// In App component, onBot handler:
function handleBot(tier) {
  startBot(false, tier);
}

// startBot signature extends to:
function startBot(keepScore, tier = "medium") {
  // ... existing resets ...
  botTierRef.current = tier;
  // (botTierRef is a new useRef initialized to "medium")
}

// botPick dispatches:
function botPick() {
  const tier = botTierRef.current;
  if (tier === "easy")   return pickEasy();
  if (tier === "hard")   return pickHard();
  if (tier === "insane") return pickInsane();
  return pickMedium(); // default covers "medium" and any future unknown
}
```

### New refs required

| Ref | Init in startBot | Purpose |
|-----|-----------------|---------|
| `botTierRef` | `tier` argument | Active tier; read by `botPick` |
| `botHitsRef` | `new Set()` | Tracks hit (not miss) cells; used by density miss-filtering and axis inference |
| `botRemainingRef` | `[...FLEET_DEF.map(f => f.size)]` | Remaining unsunk ship sizes for density enumeration; splice on sink |

### Hit/miss maintenance in botShoot

At line 2134, the bot already computes `hit`. Add:

```javascript
if (hit) botHitsRef.current.add(k);
// (botShotsRef.current.add(k) already exists at line 2132)
```

On sink (lines 2143-2151), after sink detection:

```javascript
if (sunk) {
  // Remove one entry of sunk.size from botRemainingRef (for density)
  const idx = botRemainingRef.current.indexOf(sunk.size);
  if (idx !== -1) botRemainingRef.current.splice(idx, 1);
  // Clear active-hit tracking (the sunk ship's cells are resolved)
  botHitsRef.current = new Set();
  botQueueRef.current = [];
}
```

---

## i18n Additions

Add to both `en` and `vi` blocks in `I18N`:

```javascript
// EN:
"bot.easy":   "Easy",
"bot.medium": "Medium",
"bot.hard":   "Hard",
"bot.insane": "Insane",
"bot.selectTier": "Select difficulty",

// VI:
"bot.easy":   "Dễ",
"bot.medium": "Trung bình",
"bot.hard":   "Khó",
"bot.insane": "Cực khó",
"bot.selectTier": "Chọn độ khó",
```

---

## Performance Tier Table (Expected)

All figures are from standard 10×10 Battleship references; 11×11 with fleet [5,4,3,3,2] scales slightly higher in absolute shot count but the relative ranking is preserved. [CITED: datagenetics.com, paulvanderlaken.com]

| Tier | Algorithm | Expected Median Shots | Win Rate vs Easy (approx) |
|------|-----------|----------------------|--------------------------|
| Easy | Pure random | ~97 | baseline |
| Medium | Parity + hunt-after-hit | ~64 | significantly higher |
| Hard | Probability-density heatmap | ~42 | clearly punishing |
| Insane | Parity-masked density + axis lock | ~40-42 | near-optimal |

The Easy vs Medium gap (~33 shots) and Medium vs Hard gap (~22 shots) are large enough to be "observably different" (SC#2) without any measurement harness — they are well-established from published simulation studies.

---

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.8 |
| Config file | `vitest.config.js` (exists) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` |
| Test location | `test/` directory |

### SC#2 — Observably Different Win Rates

The core validation question for SC#2: do the four tiers produce meaningfully different outcomes?

**Approach: headless simulation harness in Vitest**

Add `test/bot.test.js`. The test:

1. Imports the four `pick*` functions extracted as pure functions (no React refs — pass shot sets and hit sets as parameters).
2. Generates a random board using a pure `genFleetPure()` (same algorithm as `genFleet()` but stateless — no React refs).
3. Simulates N games per tier (N=200 is sufficient for statistical separation at these shot-count differences).
4. Asserts: `avgShotsEasy > avgShotsHard > avgShotsInsane` and `avgShotsEasy > avgShotsMedium > avgShotsHard`.

**Why this works without a test runner overhead:** The pick functions are pure given simulated ref state. No DOM, no Socket.IO, no React — just vanilla JS game loops. Vitest in `environment: "node"` handles this directly.

**Implementation shape:**

```javascript
// test/bot.test.js
import { describe, it, expect } from "vitest";

// Pure-function versions of each tier algorithm (no refs — accept state as params)
// Executor extracts these from app.jsx or duplicates them for test isolation
import { pickEasyPure, pickMediumPure, pickHardPure, pickInsanePure, genFleetPure } from "../test/bot-helpers.js";

function simulateGame(pickFn, shipSets) {
  const shots = new Set(), hits = new Set();
  const remaining = [5, 4, 3, 3, 2];
  let turn = 0;
  while (shipSets.some(s => [...s].some(k => !shots.has(k)))) {
    const k = pickFn({ shots, hits, remaining });
    shots.add(k);
    const isHit = shipSets.some(s => s.has(k));
    if (isHit) hits.add(k);
    // Detect sink
    for (const ship of shipSets) {
      if (ship.has(k) && [...ship].every(kk => shots.has(kk))) {
        const idx = remaining.indexOf(ship.size);
        if (idx !== -1) remaining.splice(idx, 1);
        hits.clear(); // reset active-hit chain
        break;
      }
    }
    turn++;
    if (turn > 300) break; // safety
  }
  return turn;
}

describe("bot difficulty tiers — shot count differentiation (BOT-01 SC#2)", () => {
  const N = 200;
  it("easy > medium > hard >= insane in average shots", () => {
    const results = { easy: 0, medium: 0, hard: 0, insane: 0 };
    for (let i = 0; i < N; i++) {
      const fleet = genFleetPure(); // generate a random board
      results.easy   += simulateGame(pickEasyPure,   fleet);
      results.medium += simulateGame(pickMediumPure, fleet);
      results.hard   += simulateGame(pickHardPure,   fleet);
      results.insane += simulateGame(pickInsanePure, fleet);
    }
    const avg = k => results[k] / N;
    expect(avg("easy")).toBeGreaterThan(avg("medium"));
    expect(avg("medium")).toBeGreaterThan(avg("hard"));
    expect(avg("hard")).toBeGreaterThanOrEqual(avg("insane"));
    // Sanity bounds (from literature)
    expect(avg("easy")).toBeLessThan(130);
    expect(avg("insane")).toBeGreaterThan(25);
  });
});
```

**Run time estimate:** 200 games × 4 tiers × ~60 shots avg = ~48,000 pick calls. Each pick call: <1ms worst case. Total: <10 seconds. Acceptable for vitest (no timeout needed).

**Wave 0 gap:** `test/bot-helpers.js` must be created in Wave 0 with pure-function wrappers. The executor does NOT need to duplicate all of `app.jsx` — only the four pick functions and `genFleetPure`.

### SC#3 — Medium Regression Check

Add a deterministic test that seeds `pickMediumPure` with the same sequence of hits/misses as a known game and verifies the shot sequence matches a pre-recorded expected sequence. This confirms the Medium tier is bit-for-bit identical to the pre-refactor `botPick` on that input.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOT-01 | Four tiers each with a distinct algorithm | unit | `npm test test/bot.test.js` | Wave 0 |
| BOT-01 SC#1 | UI shows 4-button tier selector | manual | visual inspection in browser | — |
| BOT-01 SC#2 | Observably different win rates | unit simulation | `npm test test/bot.test.js` | Wave 0 |
| BOT-01 SC#3 | Medium tier no-regression | unit | `npm test test/bot.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (full suite; bot tests are fast, ~10s)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/bot.test.js` — covers BOT-01 SC#2 and SC#3
- [ ] `test/bot-helpers.js` — pure-function wrappers for each tier algorithm + `genFleetPure`

---

## Runtime State Inventory

> Not applicable. This phase is greenfield client-side code only. No rename, refactor, or data migration. No stored state references the bot algorithm — localStorage tier key `bs_botTier` is a new key that does not exist yet.

---

## Environment Availability

All implementation is client-side JavaScript using Node.js + existing devDependencies. No new runtime dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build (esbuild) | Assumed ✓ | LTS | — |
| vitest | Test suite | ✓ | ^4.1.8 (in devDependencies) | — |
| Browser localStorage | Tier persistence | ✓ | standard API | graceful no-op (mirror existing try/catch pattern) |

**Missing dependencies with no fallback:** none.

---

## Security Domain

> `security_enforcement: true` in config, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Bot is single-player only; no auth surface |
| V3 Session Management | No | Bot mode creates no server session |
| V4 Access Control | No | Bot runs fully client-side |
| V5 Input Validation | Minimal | `botTier` from localStorage is used only to dispatch to one of 4 known functions; validate against whitelist `["easy","medium","hard","insane"]` before use |
| V6 Cryptography | No | No secrets involved |

### Known Threat Patterns for Client-Side Bot

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| localStorage tampering (botTier set to unexpected value) | Tampering | Whitelist validate: `const VALID_TIERS = ["easy","medium","hard","insane"]; const tier = VALID_TIERS.includes(stored) ? stored : "medium";` |
| D-03 anti-cheat (bot reading player ships) | Information Disclosure | Architectural: `pickHard`/`pickInsane` only access `botShotsRef`, `botHitsRef`, `botRemainingRef` — never `myShipsRef`. Code review gate: grep for `myShipsRef` inside `pickHard`/`pickInsane`. |

The D-03 anti-cheat boundary is the most important security property of this phase. The PLAN must include a code-review verification step that confirms no tier function touches `myShipsRef` except through the existing hit-detection call in `botShoot` (which already does so legitimately).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monte Carlo sampling (needed for 10+ ships) | Exhaustive enumeration (fast for 5 ships on 11×11) | — | Deterministic, no randomness in density, simpler code |
| Separate hunt and density phases | Density replaces hunt + queue used as tie-breaker | This phase | Cleaner than two-mode dispatch |
| Manual axis tracking (flag variable) | Derived from `botHitsRef` geometry on each call | This phase | No state machine, less bug surface |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 11×11 shot-count medians scale proportionally from 10×10 published data | Performance Tier Table | Minor — actual numbers may differ by 5-10 shots; relative ordering is preserved |
| A2 | Parity mask is still valid as a strong prior when minimum remaining ship size = 2 | Insane algorithm | Correct by definition — any ship of size >= 2 spans both parity colors; if wrong, Insane only degrades to Hard-level performance |
| A3 | `botQueueRef.current` order (LIFO via `.pop()`) is acceptable to change to density-sorted selection without breaking SC#3 | Integration shape | SC#3 is about Medium being unchanged; Hard/Insane queue reordering has no regression risk |

---

## Open Questions

1. **Bot pacing per tier**
   - What we know: current delay is `setTimeout(botShoot, 600)` for all tiers
   - What's unclear: should Easy feel "slower/dumber" (longer delay) or just "worse"?
   - Recommendation: Claude's discretion — keep 600ms for all tiers to avoid pacing confusion; the algorithm quality difference is sufficient. If executor wants, Easy could use 800ms for a "thinking" feel.

2. **botRemainingRef vs deriving from myShipsRef at runtime**
   - What we know: `myShipsRef.current` already tracks per-ship Sets with `has(k)` checks; sunk ships are those where all keys are in `botShotsRef`
   - What's unclear: should `botRemainingRef` be a separate ref, or should `buildDensityMap` re-derive remaining sizes each call?
   - Recommendation: re-derive at density-build time for correctness: `const remaining = myShipsRef.current.filter(s => ![...s].every(k => botShotsRef.current.has(k))).map(s => s.size)`. No extra ref needed. Eliminates sync risk.

---

## Sources

### Primary (HIGH confidence)

- DataGenetics "Battleship" (December 2011) — algorithm tiers, median shots-to-win for random/hunt/parity/density — http://datagenetics.com/blog/december32011/ [CITED]
- Project codebase `public/app.jsx` lines 2083-2161 — existing bot implementation, reusable helpers, constants [VERIFIED: codebase read]
- Project codebase `app.jsx:297-303` — `FLEET_DEF`, `BOARD` constants [VERIFIED: codebase read]
- Compute cost calculation — 11×11 with fleet [5,4,3,3,2]: 3,102 max inner loop ops [VERIFIED: computed above]

### Secondary (MEDIUM confidence)

- paulvanderlaken.com/2019/01/21 — performance comparison table (random 96, hunt 65, hunt+parity 62, density 42 median shots) [CITED]
- Austin Rochford, "Playing Battleship with Bayesian Search Theory" (2021) — Thompson sampling near-optimal result ~45.89 shots vs optimistic baseline 42.68 — confirms density-with-priors is within ~3 shots of theoretical optimum [CITED]
- Towards Data Science, "Coding an Intelligent Battleship Agent" — density + weighted adjacency after hit; directional weighting after consecutive hits [CITED]
- C. Liam Brown, battleship methodology — Monte Carlo vs exhaustive; hit/miss constraint integration; sunk-ship removal from sampling [CITED]

### Tertiary (LOW confidence)

- General knowledge of parity-mask validity for min-ship-size >= 2 [ASSUMED — but derivable from first principles]

---

## Metadata

**Confidence breakdown:**
- Algorithm correctness (Hard density, Insane priors): HIGH — multiple independent published sources converge on the same algorithm structure; derived from first principles
- Performance figures (shot counts): MEDIUM — published for 10×10; 11×11 scaling is inferred proportionally
- Integration shape (how to wire into app.jsx): HIGH — based on direct codebase reading of existing bot infrastructure
- Compute cost: HIGH — verified by calculation

**Research date:** 2026-06-04
**Valid until:** 2027-06-04 (stable domain — Battleship AI algorithms are not fast-moving)
