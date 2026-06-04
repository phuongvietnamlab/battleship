# Phase 6: Bot Difficulty Tiers - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 4 (1 major modification + 2 new test files + 1 new helper file)
**Analogs found:** 3 / 4 (test harness is net-new infrastructure)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `public/app.jsx` (Lobby tier row) | component | event-driven | `public/app.jsx:750` — single `onBot` button | exact-context |
| `public/app.jsx` (botPick dispatch + 4 pick* fns) | utility / game-AI | event-driven | `public/app.jsx:2115-2161` — `botPick()`/`botShoot()` | exact-context |
| `public/app.jsx` (localStorage tier persistence) | utility | request-response | `public/app.jsx:369-377` — `clientId`/`saveRoom`/`loadRoom` | role-match |
| `public/app.jsx` (i18n tier labels) | config | — | `public/app.jsx:22-153` — `I18N` object EN+VI blocks | exact-context |
| `test/bot-helpers.js` | utility / test-support | transform | none | no-analog (net-new) |
| `test/bot.test.js` | test | batch simulation | `test/elo.test.js` — pure-function vitest unit tests | role-match |

---

## Pattern Assignments

### `public/app.jsx` — Lobby 4-button tier row (replaces single `onBot` button)

**Analog:** `public/app.jsx` lines 750–751 (the existing single Play vs Bot button) and lines 764–771 (existing multi-button `mode-pick` row for Classic/Advance).

**Existing single-button pattern** (lines 750–751):
```jsx
<button className="btn primary" onClick={onBot}>{t("lobby.playBot")}</button>
<div style={{ height: 8 }} />
```

**Existing multi-option button row pattern** (lines 764–771 — copy this shape for the tier row):
```jsx
<div className="mode-pick">
  <button className={"mode-opt" + (mode === "classic" ? " on" : "")} onClick={() => handleModeChange("classic")}>
    <b>Classic</b><span>{t("mode.classicDesc")}</span>
  </button>
  <button className={"mode-opt" + (mode === "advance" ? " on" : "") + (ranked ? " disabled" : "")} onClick={() => handleModeChange("advance")} disabled={ranked}>
    <b>Advance ⚡</b><span>{t("mode.advanceDesc")}</span>
  </button>
</div>
```

**Convention to replicate:** Use a wrapping `<div className="bot-tier-row">` (new CSS class, parallel to `mode-pick`). Map over `["easy","medium","hard","insane"]`, applying `" primary"` to the selected tier and `" ghost"` to the rest. Each button calls `onBot(tier)` directly — no separate confirm step. `selectedTier` local state defaults to `localStorage.getItem("bs_botTier") || "medium"`, validated against the whitelist before use.

**Lobby component prop signature** (line 734 — `onBot` is already passed in):
```jsx
function Lobby({ onCreate, onJoin, onBot, onQuickMatch, onRankedMatch, onHelp,
                 onLeaderboard, error, authUser, authError, verifyNotice, clientId,
                 signInDisabled, onSignInDisable, onEmailAuthSuccess,
                 resetToken, resetMode, onForgotPassword, onResetBack })
```
`onBot` changes signature from `onBot()` → `onBot(tier)`. The Lobby itself reads/writes `bs_botTier` localStorage for visual pre-selection; the actual tier value flows up to the App via the argument.

---

### `public/app.jsx` — `botPick()` dispatch + four `pick*` functions

**Analog:** `public/app.jsx` lines 2115–2161 — the existing `botPick()` + `botShoot()`.

**Existing `botPick()` body** (lines 2115–2128 — this becomes `pickMedium()` verbatim):
```javascript
function botPick() {
  while (botQueueRef.current.length) {
    const k = botQueueRef.current.pop();
    if (!botShotsRef.current.has(k)) return k;
  }
  const parity = [], any = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = key(r, c);
    if (botShotsRef.current.has(k)) continue;
    any.push(k); if ((r + c) % 2 === 0) parity.push(k);
  }
  const pool = parity.length ? parity : any;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
```

**Convention to replicate for the new dispatch shell:**
```javascript
function botPick() {
  const tier = botTierRef.current;
  if (tier === "easy")   return pickEasy();
  if (tier === "hard")   return pickHard();
  if (tier === "insane") return pickInsane();
  return pickMedium(); // default: covers "medium" + any unknown stored value
}
```
The body of `botPick()` above moves verbatim into `pickMedium()`. Guard-clause dispatch style matches the project convention (CLAUDE.md: "Guard-clause style — early returns on invalid input").

**Existing `botShoot()` hit/sink resolution** (lines 2129–2161 — unchanged across all tiers):
```javascript
function botShoot() {
  const k = botPick();
  if (k == null) return;
  botShotsRef.current.add(k);
  const [r, c] = k.split(",").map(Number);
  const hit = myShipsRef.current.some((ship) => ship.has(k));
  setIncoming((m) => new Map(m).set(k, hit));
  setFlashMine(k);
  if (hit) {
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
      if (nr >= 0 && nr < BOARD && nc >= 0 && nc < BOARD) {
        const nk = key(nr, nc); if (!botShotsRef.current.has(nk)) botQueueRef.current.push(nk);
      }
    });
    let sunk = null;
    for (const ship of myShipsRef.current) {
      if (!ship.has(k)) continue;
      if ([...ship].every((kk) => botShotsRef.current.has(kk))) { sunk = ship; break; }
    }
    if (sunk) {
      setSunkMine((n) => n + 1);
      setSunkMyCells((s) => { const n = new Set(s); sunk.forEach((kk) => n.add(kk)); return n; });
      addLog(t("log.botSunk", { n: sunk.size })); Sound.sunk(); triggerShake();
    }
    else { addLog(t("log.botFireHit", { cell: cellLabel(r, c) })); Sound.hit(); triggerShake(); }
  } else {
    addLog(t("log.botFireMiss", { cell: cellLabel(r, c) })); Sound.miss();
  }
  const allMineSunk = myShipsRef.current.every((ship) => [...ship].every((kk) => botShotsRef.current.has(kk)));
  if (allMineSunk) { setOppScore((n) => n + 1); setOver({ win: false }); Sound.lose(); return; }
  if (hit) setTimeout(botShoot, 600);
  else setMyTurn(true);
}
```
Add `botHitsRef.current.add(k)` immediately after `botShotsRef.current.add(k)` (line 2132) when `hit === true`. On sink, add: splice `botRemainingRef`, clear `botHitsRef`, clear `botQueueRef`.

**Existing `startBot()` reset pattern** (lines 2100–2110 — new refs initialized here):
```javascript
function startBot(keepScore) {
  setError(null); setVsBot(true); persistRoom(null); setCode(null); setTurnDeadline(null);
  setOppPresent(true); setOppReady(false); setIReady(false); setMyTurn(false);
  setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map());
  setLog([]); setOver(null); setSunkOpp(0); setSunkMine(0);
  setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
  if (!keepScore) { setMyScore(0); setOppScore(0); }
  botData.current = null; myShipsRef.current = []; botShotsRef.current = new Set();
  botQueueRef.current = []; myShotsRef.current = new Set();
  setScreen("placement");
}
```
Extend signature to `startBot(keepScore, tier = "medium")`. Add inside the reset block:
```javascript
botTierRef.current = tier;
botHitsRef.current = new Set();
botRemainingRef.current = FLEET_DEF.map(f => f.size);
```

**Existing game primitives reused by density algorithms** (confirmed in codebase):
- `key(r, c)` — `app.jsx:460` — cell key format `"r,c"`
- `cellsFor(r, c, size, dir)` — `app.jsx:461` — returns `[{r,c}]` for a ship placement
- `inBounds(cells)` — `app.jsx:468` — bounds check
- `BOARD = 11` — `app.jsx:6`
- `FLEET_DEF` — `app.jsx:297-303` — fleet sizes `[5,4,3,3,2]`
- `genFleet()` — `app.jsx:2084-2099` — fleet generator (model for `genFleetPure()` in helpers)

---

### `public/app.jsx` — localStorage tier persistence

**Analog:** `public/app.jsx` lines 369–377 — `clientId` bootstrap + `saveRoom`/`loadRoom`.

**Existing localStorage read pattern with try/catch + default** (lines 369–375):
```javascript
let clientId = (function () {
  try {
    let id = localStorage.getItem("bs_clientId");
    if (!id) { id = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("bs_clientId", id); }
    return id;
  } catch (e) { return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();
```

**Existing named save/load helper pattern** (lines 376–377):
```javascript
function saveRoom(c) { try { c ? localStorage.setItem("bs_room", c) : localStorage.removeItem("bs_room"); } catch (e) {} }
function loadRoom() { try { return localStorage.getItem("bs_room"); } catch (e) { return null; } }
```

**Convention to replicate for `bs_botTier`:**
```javascript
const VALID_TIERS = ["easy", "medium", "hard", "insane"];

function saveBotTier(tier) {
  try { localStorage.setItem("bs_botTier", tier); } catch (e) {}
}
function loadBotTier() {
  try {
    const stored = localStorage.getItem("bs_botTier");
    return VALID_TIERS.includes(stored) ? stored : "medium";
  } catch (e) { return "medium"; }
}
```
Key rules from existing pattern:
- Key prefix `bs_` — mandatory for namespace consistency (existing keys: `bs_clientId`, `bs_room`).
- Always wrap in `try/catch` — `localStorage` can throw in private browsing or storage-full scenarios.
- Whitelist-validate on read (security: ASVS V5 input validation for localStorage tampering).
- Default to `"medium"` on missing or invalid stored value.

---

### `public/app.jsx` — i18n tier labels (I18N additions)

**Analog:** `public/app.jsx` lines 22–153 — the `I18N` object with `en` and `vi` sub-objects.

**Existing EN i18n block structure** (lines 23–29, representative):
```javascript
const I18N = {
  en: {
    "common.or": "OR", "common.copied": "Copied ✓",
    "lobby.playBot": "🤖 Play vs Bot", "lobby.createRoom": "⚓ Create new room",
    "mode.classicDesc": "Classic, no power-ups", "mode.advanceDesc": "Collect & use power-ups",
    // ...
  },
  vi: {
    "common.or": "HOẶC", "common.copied": "Đã chép ✓",
    "lobby.playBot": "🤖 Chơi với máy", "lobby.createRoom": "⚓ Tạo phòng mới",
    // ...
  }
};
```

**t() helper usage pattern:** `t("bot.easy")` — dot-namespaced key, EN + VI required. Missing keys fall back to `en`.

**New keys to add (both `en` and `vi` blocks):**
```javascript
// EN block additions:
"bot.easy":        "Easy",
"bot.medium":      "Medium",
"bot.hard":        "Hard",
"bot.insane":      "Insane",
"bot.selectTier":  "Select difficulty",

// VI block additions:
"bot.easy":        "Dễ",
"bot.medium":      "Trung bình",
"bot.hard":        "Khó",
"bot.insane":      "Cực khó",
"bot.selectTier":  "Chọn độ khó",
```
Convention: keys are inserted inline with existing keys in the same conceptual group. No trailing comma on the last key of a block. Existing keys are never renamed; new keys are additive only.

---

### `test/bot-helpers.js` — pure-function wrappers (net-new; no in-repo analog)

**No direct analog.** This is the first pure-function test helper in the project. The closest structural model is the target-under-test pattern in `test/elo.test.js` (pure math functions imported from a dedicated module).

**What this file must export:**
- `genFleetPure()` — stateless clone of `genFleet()` (`app.jsx:2084-2099`); returns array of Sets of cell key strings; no React refs.
- `pickEasyPure({ shots, hits, remaining })` — pure version of `pickEasy`; accepts state as plain objects, not refs.
- `pickMediumPure({ shots, hits, queue, remaining })` — pure version of `pickMedium`.
- `pickHardPure({ shots, hits, queue, remaining })` — pure version of `pickHard`.
- `pickInsanePure({ shots, hits, queue, remaining })` — pure version of `pickInsane`.

**Convention:** ESM (`export function`). No React imports. No DOM. Uses duplicated constants (`const BOARD = 11`, `const FLEET_DEF = [...]`) rather than importing from `app.jsx` (the monolith is not importable in Node). Functions accept plain-object state bags; the `.current` ref accessor is replaced by direct property access.

**Model for `genFleetPure`** (duplicate of `app.jsx:2084-2099`, de-ref'd):
```javascript
// app.jsx genFleet() — copy and remove React ref access
function genFleet() {
  const occ = new Set(), ships = [];
  for (const f of FLEET_DEF) {
    let ok = false, t = 0;
    while (!ok && t++ < 800) {
      const d = Math.random() < 0.5 ? "h" : "v";
      const r = Math.floor(Math.random() * BOARD), c = Math.floor(Math.random() * BOARD);
      const cells = cellsFor(r, c, f.size, d);
      if (inBounds(cells) && cells.every((x) => !occ.has(key(x.r, x.c)))) {
        const set = new Set(); cells.forEach((x) => { const k = key(x.r, x.c); occ.add(k); set.add(k); });
        ships.push(set); ok = true;
      }
    }
  }
  return { occ, ships };
}
```
`genFleetPure` exports only `ships` (array of Sets), with `.size` property added per set for density filtering.

---

### `test/bot.test.js` — simulation-based vitest unit tests

**Analog:** `test/elo.test.js` — pure-function vitest imports, `describe`/`it`/`expect` structure, no DB, no network, no DOM.

**Existing test file structure** (`test/elo.test.js` lines 1–22):
```javascript
import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// Named import from pure module under test
const { updateRatings } = await import("../elo.js");

describe("elo.js — Glicko-2 pure function unit tests", () => {
  describe("equal-rated win ...", () => {
    it("returns winner.rating > loser.rating", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.rating).toBeGreaterThan(result.loser.rating);
    });
  });
});
```

**Convention to replicate for `test/bot.test.js`:**
```javascript
import { describe, it, expect } from "vitest";
import { pickEasyPure, pickMediumPure, pickHardPure, pickInsanePure, genFleetPure }
  from "./bot-helpers.js";

// Simulation loop — pure JS, no React, no DOM
function simulateGame(pickFn, shipSets) { ... }

describe("bot difficulty tiers — shot count differentiation (BOT-01 SC#2)", () => {
  it("easy > medium > hard >= insane in average shots", () => {
    // N=200 games per tier, assert ordering
    expect(avg("easy")).toBeGreaterThan(avg("medium"));
    expect(avg("medium")).toBeGreaterThan(avg("hard"));
    expect(avg("hard")).toBeGreaterThanOrEqual(avg("insane"));
  });
});
```

**Key vitest config facts** (`vitest.config.js`):
- `environment: "node"` — no DOM; pure JS only; consistent with bot-helpers design.
- `include: ["test/**/*.test.js"]` — `test/bot.test.js` is picked up automatically; no config change needed.
- `fileParallelism: false` — tests run serially; bot simulation tests do not need ordering but benefit from deterministic output.
- Run command: `npm test` (existing; no new script needed).

---

## Shared Patterns

### Guard-clause + early return
**Source:** `public/app.jsx:2116-2118` (existing `botPick`), CLAUDE.md
**Apply to:** `botPick()` dispatch, `pickEasy()`, `pickMedium()`, `pickHard()`, `pickInsane()`, `loadBotTier()`
```javascript
// Pattern: early return on null/empty, no nested conditionals
if (k == null) return;
while (botQueueRef.current.length) {
  const k = botQueueRef.current.pop();
  if (!botShotsRef.current.has(k)) return k;
}
```

### Named error/constant codes
**Source:** CLAUDE.md conventions — `UPPERCASE` for constants
**Apply to:** `VALID_TIERS` whitelist array, any new constants
```javascript
const VALID_TIERS = ["easy", "medium", "hard", "insane"];
```

### Try/catch only for optional/external features
**Source:** `public/app.jsx:370-375`, CLAUDE.md
**Apply to:** `saveBotTier()`, `loadBotTier()` — localStorage is the only try/catch surface in this phase; bot AI logic itself uses no exceptions.

### Logging with prefix tags
**Source:** CLAUDE.md conventions
**Apply to:** Any `console` calls added (use `[bot]` prefix if needed, e.g. `[bot] tier set to insane`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `test/bot-helpers.js` | test-support utility | transform | First pure-function helper module in project; app.jsx monolith is not importable in Node. Must duplicate constants and primitives. |

The test harness infrastructure (`vitest.config.js`, `test/` directory, `npm test` script) already exists from prior phases — only the specific bot helper and test files are new.

---

## Metadata

**Analog search scope:** `public/app.jsx` (full file, targeted reads), `test/` directory (all .test.js files), `vitest.config.js`
**Files scanned:** 12 (app.jsx, vitest.config.js, 10 test files)
**Pattern extraction date:** 2026-06-04
