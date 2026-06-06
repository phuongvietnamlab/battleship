# Phase 15: Power-up Redesign — Research

## 1. Legacy Removal Map

### Server (`server.js`)

**Constants to remove:**
- Line 155: `POWERUP_FIXED_FLOOR = 5` — replaced by new 10%-of-stake formula
- Line 156: `POWERUP_STAKE_PCT = 0.15` — replaced by fixed 10%
- Line 157: `POWERUP_CAP_PER_MATCH = 3` — replaced by cap of 2
- Line 161: `buyPowerupLimiter` — handler being removed entirely

**Functions to remove:**
- Line 1141: `POWERS` array `["scatter", "cross", "double", "reveal", "mine"]` — replace with new 4 powers
- Line 1142: `newInv()` — replace with new inventory shape
- Line 1155: `powerupsForAttacker(room, attackerId)` — power-ups no longer spawn on board
- Line 1166: `emitInv(room, clientId)` — rewrite for new inv shape
- Line 1170: `maybeSpawn(room, defenderId)` — DELETE entirely (random spawning removed)

**Socket handlers to remove:**
- Line 2223–2297: `buyPowerup` handler — DELETE entirely (replace with new placement-phase handler)

**Conditionals to remove:**
- Line 1170: `if (room.mode !== "advance") return;` in maybeSpawn (whole function goes)
- Line 2031: `if (room.mode === "advance" && power === "cross")` in fire handler — rework
- Line 2235: `if (room.mode !== "advance")` guard in buyPowerup (handler deleted)
- Line 1239–1245: `purchasesRemaining` / `powerupPrice` in syncPayload — rework for new system
- Line 1504: `e.stake + "_" + (e.mode || "classic")` in findPair — remove mode from pairing key
- Line 1515: `e.mode || "classic"` in free queue findPair — remove mode grouping
- Line 1653: `const mode = (arg && arg.mode) === "advance" ? "advance" : "classic"` in createRoom — always "classic" or remove entirely
- Line 1756: `mode: (arg && arg.mode === "advance") ? "advance" : "classic"` in joinQueue entry — remove

**Code to keep but modify:**
- Line 1108: `roomPublic()` still includes `mode` — keep for backwards compat but always return "classic"
- Line 1011, 1061: `mode: r.mode || "classic"` in serialize/restore — keep for existing rooms
- Line 947, 966, 1330, 1410, 2334: `recordMatch(..., room.mode, ...)` — keep passing mode for DB records
- Line 1234: `mode` in syncPayload — remove or always send "classic"
- Line 1999: `gameStart` emit includes mode — always send "classic" or remove field

**useAbility handler (lines 2048–2130) — heavy rewrite:**
- Remove `type === "double"` (Extra Turn gone)
- Remove `type === "reveal"` (Reveal Cell gone)  
- Remove `type === "mine"` (Sea Mine gone)
- Rewrite `type === "scatter"` for 2-3 cells (currently 3-5)
- Keep `type === "cross"` but adapt to new behavior (always end turn)
- Add new `type === "sonar"` handler

**doShot (lines 1359–1427) — modify:**
- Line 1386: `const pmap = room.powerups[opp] || {};` — remove power-up pickup from board
- Line 1390–1393: power-up collection logic in shot loop — remove
- Line 1399: `if (collected.length) emitToClient(...)` — remove
- Line 1420: `maybeSpawn(room, opp)` call — remove
- Line 1414–1416: "hit keeps turn" logic — Cross Missile and Scatter Blast now always end turn (but normal fire still keeps on hit)

### Client (`public/app.jsx`)

**State variables to remove:**
- Line 2375: `mode` state — remove or repurpose (always "classic")
- Line 2421: `purchasesRemaining` — repurpose for placement-phase purchases
- Line 2422: `powerupPrice` — repurpose
- Line 2423: `showShop` — remove (mid-match shop gone)
- Line 2424: `oppBoughtNotice` — remove (opponent notification gone)

**Functions to remove:**
- Line 3143: `handleBuyPowerup(type)` — DELETE (mid-match purchase)

**UI Components to remove:**
- Lines 3397–3421: Mid-match shop button + popup (mode === "advance" conditional blocks)
- Lines 3422–3426: `oppBoughtNotice` toast

**UI to modify:**
- Lines 946–953: Mode toggle in Lobby — DELETE entirely
- Line 1428–1431: `mode === "advance" && (<PowerBar .../>)` — change to show PowerBar when player has any inventory
- Lines 1057–1058: `POWER_ICON` / `POWER_NAME` maps — replace with new 4 types

**Localization strings to remove (lines 33, 65, 67–68, 168, 225, 257, 259–260):**
- `mode.classic`, `mode.advance`, `mode.classicDesc`, `mode.advanceDesc`
- `help.modesTitle`, `help.modesBody`
- `help.powerTitle` (rewrite for new powers)
- `help.pwScatter`, `help.pwCross`, `help.pwDouble`, `help.pwReveal`, `help.pwMine`
- `err.NOT_ADVANCE_MODE`
- `shop.oppBought`

**Socket event listeners to remove:**
- Line 2646: `socket.on("oppBoughtPowerup", ...)` — opponent purchase notification removed

---

## 2. New Purchase Flow Architecture

### Current Placement Flow
1. Client renders `Placement` component (line 1109)
2. Player arranges ships via drag-and-drop
3. Player clicks "Ready" → calls `confirmPlacement(ships)` (line 2812)
4. `confirmPlacement` emits `socket.emit("placeShips", ships, cb)` (line 2833)
5. Server validates placement in `validatePlacement()` (line 838)
6. Server marks `room.players[clientId].ready = true` (line 1972)
7. When both ready → `allReady` triggers `gameStart` (line 1979)

### Recommended Architecture: Separate purchase event during placement

**Option A: New `buyPlacementPowerup` socket event (RECOMMENDED)**
- Player purchases power-ups one at a time during placement phase via a new event
- Each purchase: `socket.emit("buyPlacementPowerup", { type }, cb)`
- Server validates: room exists, placement phase (not started), stake > 0, authenticated, balance sufficient, max 2 cap, max 1 decoy
- Server debits wallet, adds to inventory, returns new balance
- Decoy purchase triggers client-side placement mode (Ready button disabled until placed)
- When player clicks Ready: `placeShips` payload extended with optional `decoyCell: { r, c }` field

**Why not batch with Ready signal?**
- Wallet debit needs to happen per purchase (user sees balance update)
- If Decoy is purchased, user must place it BEFORE Ready
- Cancellation of purchases would require refund logic if batched
- Context doc says "no undo" — immediate debit is cleaner

**Why not a single combined event?**
- User feedback loop: they need to see "purchase succeeded" before placing decoy
- If debit fails (insufficient funds), they need to know immediately

### Server-side flow for new `buyPlacementPowerup`:
```
1. Validate: room exists, !room.started, clientId is a player
2. Validate: room.stake > 0, player has userId (authenticated)
3. Validate: purchases[clientId] < 2, type is valid
4. Validate: if type === "decoy", player doesn't already have a decoy
5. Calculate price: Math.round(room.stake * 0.10)
6. Call debitWallet(userId, price, "powerup_purchase", refId)
7. On success: add to player inventory, increment purchases count
8. Emit balanceUpdate to buyer
9. Do NOT emit anything to opponent (secrecy requirement)
```

### Extended `placeShips` payload:
```javascript
// Current: socket.emit("placeShips", ships, cb)
// New:     socket.emit("placeShips", { ships, decoyCell: { r, c } | null }, cb)
```
Server `validatePlacement` must be extended to also validate the decoy cell:
- Must be within bounds
- Must not overlap any ship cell
- Only required if player has a decoy in inventory

---

## 3. Decoy Implementation Strategy

### Current Hit Detection (doShot, line 1359)

The key hit-detection line is:
```javascript
const hit = oppData.occ.has(k);  // line ~1389 in the loop
```

`occ` is a `Set` of all cells occupied by real ships. Sinking is checked via:
```javascript
function sunkShipCount(playerData, attackerHits) {
  for (const ship of playerData.ships) {
    let all = true;
    for (const k of ship) if (!attackerHits.has(k)) { all = false; break; }
    if (all) n++;
  }
}
```

Win condition: `sunkCount >= FLEET.length` (i.e., all 5 real ships sunk).

### Decoy Strategy

**Approach: Add decoy cell to `occ` but NOT to `ships`**

1. During placement validation, add the decoy cell key to `playerData.occ`
2. Do NOT add it to `playerData.ships` (so it never counts toward sinking)
3. When opponent fires at decoy cell: `oppData.occ.has(k)` → `true` → reports HIT
4. Since decoy isn't in any `ship` Set in `playerData.ships`, it can never trigger "all cells of a ship are hit" → never counts as sunk
5. Win condition remains `sunkCount >= 5` (real ships only) — decoy has zero effect on this

**Server state additions:**
```javascript
room.players[clientId].decoyCell = "r,c" | null;  // track decoy position
```

**Validation in `placeShips`:**
```javascript
if (decoyCell) {
  const dk = decoyCell.r + "," + decoyCell.c;
  if (occ.has(dk)) return { ok: false, code: "DECOY_ON_SHIP" };
  occ.add(dk);  // add to occ so it reports as hit
  room.players[clientId].decoyCell = dk;
}
```

**Key insight:** The current sinking logic (`sunkShipCount`) iterates over `playerData.ships` (array of Sets). Since decoy is never added as a "ship", it naturally never gets "sunk". The `occ` Set is only used for hit detection. This is an elegant, minimal-change approach.

**Edge cases:**
- Decoy cell is already hit (can't happen — it's placed at placement time, no shots yet)
- All ships sunk but decoy not hit → game still ends correctly (win based on FLEET.length)
- Reconnect: decoy cell must be in `occ` on restore (it's part of the serialized occ Set)

---

## 4. Sonar Ping Implementation

### Turn System Analysis

Turn flow in `doShot` (line 1414–1416):
```javascript
let keep = anyHit;
if (!keep && (me.bonus || 0) > 0) { me.bonus--; keep = true; }
if (mineHit) { me.skipNext = true; keep = false; }
if (!keep) giveTurn(room, opp, clientId);
```

After doShot: `armTurnTimer(room)` resets the clock.

For Sonar Ping, we need a simpler flow: **consume turn, send result, advance turn**.

### Sonar Handler Design (in `useAbility`):

```javascript
if (type === "sonar") {
  // Validate: { axis: "row"|"col", index: 0-10 }
  if (!["row", "col"].includes(axis)) return cb({ ok: false, code: "BAD_AXIS" });
  if (!Number.isInteger(index) || index < 0 || index >= BOARD) return cb({ ok: false, code: "BAD_INDEX" });
  
  me.inv.sonar--;
  me.timeouts = 0;
  
  // Check if any ship cell exists in the specified row/column
  const opp = opponentOf(room, clientId);
  const oppData = room.players[opp];
  let found = false;
  if (oppData && oppData.occ) {
    for (const k of oppData.occ) {
      const [r, c] = k.split(",").map(Number);
      if (axis === "row" && r === index) { found = true; break; }
      if (axis === "col" && c === index) { found = true; break; }
    }
  }
  
  // Consume turn (always)
  giveTurn(room, opp, clientId);
  for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
  armTurnTimer(room);
  
  emitInv(room, clientId);
  return cb({ ok: true, type: "sonar", result: found ? "YES" : "NO" });
}
```

**Important:** The sonar scans `occ` which includes the decoy cell. This is correct per requirements — "whether any opponent ship cells (including cells already hit) exist". The decoy IS in occ, so scanning its row/column would return YES. This is intentional (decoy fools sonar too).

### Client UX: Drag-and-Drop Sonar

The context file specifies: "Drag-and-drop interaction — 2 lego blocks (row/column). Player drags onto grid."

The existing drag system in `Placement` (lines 1109–1290) provides the pattern:
- `startDrag` → captures pointer, sets drag state
- `pointermove` → updates position
- `pointerup` → calculates grid cell from screen coordinates via `anchorFromPoint`
- Uses `gridRef.current.getBoundingClientRect()` for coordinate translation

**Adaptation for Sonar:**
- When Sonar is activated during battle phase, show 2 draggable blocks (row indicator, column indicator)
- On drop onto enemy grid: calculate which row or column the drop landed on
- The Battle component already has `gridRef` for the enemy board (used for rendering)
- Reuse the same coordinate-to-cell math: `Math.floor((cy - rect.top - PAD) / PITCH)`

**Client flow:**
1. Player clicks Sonar in PowerBar → `setAim("sonar")`
2. Shows drag overlay with row/col blocks
3. Player drags block onto enemy grid
4. On drop: determine axis + index
5. Emit `socket.emit("useAbility", { type: "sonar", axis, index }, cb)`
6. Show "YES" or "NO" in battle log
7. Turn advances to opponent

---

## 5. Cross Missile Adaptation

### Current Cross Missile Behavior

**In `fire` handler (line 2031):**
```javascript
if (room.mode === "advance" && power === "cross") {
  if ((me.inv[power] || 0) <= 0) return cb && cb({ ok: false, code: "NO_POWERUP" });
  me.inv[power]--;
} else {
  power = null;
}
summary = doShot(room, clientId, expandCells(power, r, c));
```

`expandCells("cross", r, c)` (line 1144) returns center + 4 orthogonal cells (within bounds).

**In `doShot` turn logic (line 1414):**
```javascript
let keep = anyHit;  // hit keeps turn
```

### Changes Needed

1. **Remove mode check:** Cross Missile no longer requires advance mode — works in the single unified mode
2. **Always consume turn:** After `doShot`, override the "hit keeps turn" logic when Cross Missile was used
3. **Move to `useAbility` handler:** Currently Cross Missile rides the `fire` event with a `power` param. In the new system, it should go through `useAbility` for consistency (all power-ups activate the same way).

**New approach — use `useAbility` for Cross Missile:**
```javascript
if (type === "cross") {
  if (!inBounds(r, c)) return cb({ ok: false, code: "BAD_CELL" });
  me.inv.cross--;
  me.timeouts = 0;
  
  room.resolving = true;
  let summary;
  try {
    summary = doShot(room, clientId, expandCells("cross", r, c));
  } finally {
    room.resolving = false;
  }
  
  // OVERRIDE: always consume turn regardless of hits
  // doShot already called giveTurn on miss; on hit it kept turn — we need to force advance
  if (summary.anyHit && room.turn === clientId) {
    giveTurn(room, opponentOf(room, clientId), clientId);
    for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
    armTurnTimer(room);
  }
  
  emitInv(room, clientId);
  return cb(Object.assign({ type: "cross" }, summary));
}
```

**Alternative (cleaner):** Add a `forceEndTurn` flag to `doShot` so it always passes turn. This avoids post-hoc correction.

**`fire` handler simplification:** Remove the `power` parameter entirely from the `fire` event. The fire event becomes pure single-cell shots only.

---

## 6. Scatter Blast Adaptation

### Current Scatter Behavior (useAbility, type === "scatter")

```javascript
const n = Math.min(cand.length, 3 + Math.floor(Math.random() * 3)); // 3..5 cells
```

Then calls `doShot(room, clientId, pick)` and returns summary.

### Changes Needed

1. **Cell count: 2-3 instead of 3-5:**
   ```javascript
   const n = Math.min(cand.length, 2 + Math.floor(Math.random() * 2)); // 2..3 cells
   ```

2. **Always consume turn:** Same issue as Cross Missile. Currently `doShot` keeps turn on hit.

3. **Minimum cell guard:** If fewer than 2 unshot cells remain, fire at all remaining (requirement 7.3). If zero, reject (requirement 7.4).

**Adapted handler:**
```javascript
if (type === "scatter") {
  const cand = [];
  for (let rr = 0; rr < BOARD; rr++) for (let cc = 0; cc < BOARD; cc++) {
    const k = rr + "," + cc;
    if (!me.hits.has(k)) cand.push([rr, cc]);
  }
  if (!cand.length) return cb({ ok: false, code: "NO_CELLS" });
  if (room.resolving) return cb({ ok: false, code: "BAD_STATE" });
  
  me.inv.scatter--;
  const n = Math.min(cand.length, 2 + Math.floor(Math.random() * 2)); // 2-3
  const pick = [];
  for (let i = 0; i < n; i++) pick.push(cand.splice(Math.floor(Math.random() * cand.length), 1)[0]);
  
  room.resolving = true;
  let summary;
  try {
    summary = doShot(room, clientId, pick);
  } finally {
    room.resolving = false;
  }
  
  // Force turn end (same approach as Cross Missile)
  if (summary.anyHit && room.turn === clientId) {
    giveTurn(room, opponentOf(room, clientId), clientId);
    for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
    armTurnTimer(room);
  }
  
  emitInv(room, clientId);
  return cb(Object.assign({ type: "scatter" }, summary));
}
```

---

## 7. Inventory State Design

### Current State Shape
```javascript
me.inv = { scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 };
```

### Proposed New State Shape

**Option A: Same pattern, new keys (RECOMMENDED)**
```javascript
me.inv = { sonar: 0, cross: 0, decoy: 0, scatter: 0 };
// newInv() returns this shape
```

Plus room-level tracking:
```javascript
room.purchases = room.purchases || {};
room.purchases[clientId] = 0; // total purchases (max 2)
```

And decoy tracking:
```javascript
room.players[clientId].decoyCell = null; // "r,c" string if decoy placed
```

**Why keep the count-based shape?**
- Max 2 total, but both could be the same type (except decoy which is max 1)
- e.g., player buys 2 Scatter Blasts → `{ scatter: 2 }`
- e.g., player buys 1 Sonar + 1 Cross → `{ sonar: 1, cross: 1 }`
- Client displays only items with count > 0
- Simple decrement on use

**Constraint enforcement:**
- `room.purchases[clientId] >= 2` → reject any purchase
- `me.inv.decoy >= 1` → reject second decoy purchase (max 1 decoy)

**Constants:**
```javascript
const NEW_POWERS = ["sonar", "cross", "decoy", "scatter"];
const POWERUP_MAX_PER_MATCH = 2;
const POWERUP_PRICE_PCT = 0.10; // 10% of stake
```

---

## 8. Client Placement Screen Integration

### Current Placement Component Structure (lines 1109–1290)

```jsx
<div className="place-wrap">
  <p className="hint place-hint">{t("place.hint")}</p>
  <div className="controls place-actions">
    <button onClick={randomize}>Random</button>
    <button onClick={confirm}>Ready</button>       ← Ready button HERE
  </div>
  <div className="board-wrap">
    <div className="grid-outer">
      <div className="grid own" ref={gridRef}>     ← Ship grid
        {gridCells}
        {placed ship overlays}
      </div>
    </div>
  </div>
  {drag ghost}
</div>
```

### Where to Inject Shop UI

Per requirement 8.1: "below the ship arrangement area and above the Ready button"

The current layout has the Ready button ABOVE the grid (in `.place-actions`). This means either:
1. Move Ready button below the grid, or
2. Place shop between grid and Ready button (restructure)

**Recommended structure:**
```jsx
<div className="place-wrap">
  <p className="hint place-hint">{...}</p>
  <div className="board-wrap">
    {/* Ship grid */}
  </div>
  {/* NEW: Power-up shop row (conditionally shown) */}
  {showPowerUpShop && <PlacementShop ... />}
  <div className="controls place-actions">
    <button onClick={randomize}>Random</button>
    <button onClick={confirm} disabled={decoyPending}>Ready</button>
  </div>
</div>
```

**Shop visibility conditions (parent App passes props):**
- `stake > 0` AND `authUser` (not guest) AND `!vsBot`
- When conditions not met: shop row simply not rendered

**PlacementShop component structure:**
```jsx
function PlacementShop({ stake, balance, inventory, onBuy, maxReached }) {
  const price = Math.round(stake * 0.10);
  return (
    <div className="placement-shop">
      {["sonar", "cross", "decoy", "scatter"].map(type => (
        <button key={type} onClick={() => onBuy(type)}
          disabled={maxReached || balance < price || (type === "decoy" && inventory.decoy >= 1)}>
          <span>{POWER_ICON[type]}</span>
          <span>{POWER_NAME[type]}</span>
          <span>{price} 💰</span>
        </button>
      ))}
      {maxReached && <span>Max reached</span>}
    </div>
  );
}
```

**Decoy placement mode:** After purchasing decoy, the grid switches to "decoy placement mode":
- Ready button disabled
- Grid cells become clickable (empty cells highlighted)
- Clicking a valid empty cell places the decoy
- Clicking a ship cell shows error
- Marker shows on the player's board where decoy is

**Integration with `Placement` component:**
Currently `Placement` is self-contained (manages its own state). The shop needs to be either:
- **Inside Placement** (simpler — shop is part of placement screen)
- **Outside Placement** (in parent App, between `<Placement />` and something else)

Looking at line 3386: `<Placement onConfirm={confirmPlacement} ready={iReady} waiting={...} />`

The `Placement` component only receives `onConfirm`, `ready`, `waiting`. The shop requires additional props: `stake`, `balance`, `authUser`, `onBuyPowerup`, inventory state, etc.

**Best approach:** Add shop-related props to `Placement` OR create a wrapper component that includes both. Given the Placement component manages the grid and decoy placement needs to interact with the grid (click an empty cell), it's cleanest to integrate shop INTO `Placement`.

---

## 9. Wallet Integration

### Current `debitWallet` API Shape

From `server.js` line 12, imported from `./db`:
```javascript
const { ..., debitWallet, creditWallet, ... } = require("./db");
```

Usage pattern (line 1663, 1736, 1845, 2199, 2271):
```javascript
const result = await debitWallet(userId, amount, type, referenceId);
// result = { ok: true, balance: newBalance } on success
// result = { ok: false, code: "INSUFFICIENT_BALANCE" } on failure
```

**Parameters:**
1. `userId` — the user's DB ID
2. `amount` — integer points to debit
3. `type` — string category (e.g., "wager_debit", "powerup_purchase", "emoji_purchase")
4. `referenceId` — unique string for idempotency/audit

**Confirmed: API shape works perfectly for placement-phase purchases.**

New usage:
```javascript
const price = Math.round(room.stake * 0.10);
const referenceId = `powerup_placement_${code}_${clientId}_${room.purchases[clientId]}`;
const result = await debitWallet(userId, price, "powerup_purchase", referenceId);
```

The `balanceUpdate` emit pattern is also established:
```javascript
socket.emit("balanceUpdate", { balance: result.balance });
```

No changes needed to the wallet/debit infrastructure.

---

## 10. Bot Compatibility

### Analysis

**Client-side bot handling (line 2857–2876):**
```javascript
function startBot(keepScore, tier = "medium") {
  setError(null); setVsBot(true); ...
}
```

**Bot games are 100% client-side.** There is no server room for bot games. The `Placement` component passes `confirmPlacement` which, when `vsBot` is true (line 2814), handles everything locally without `socket.emit`.

**Battle screen passes `mode: "classic"` for bot games (line 3429):**
```jsx
mode={vsBot ? "classic" : mode}
```

**Bot games have no stake** — bot play is initiated via `handleBot(tier)` which calls `startBot(false, tier)` without any stake. The `stake` state is only set for online games.

### Confirmation: No Breakage

1. **Bot games don't use power-ups:** Mode is forced to "classic" in Battle props for vsBot, and bot games don't have a shop UI.
2. **Bot games have no stake:** Shop visibility condition is `stake > 0` — always false for bots.
3. **Bot games don't use the server:** No socket events, no room state — completely unaffected.
4. **Removing advance mode has zero impact on bot play.**

After the redesign, even if the mode concept is removed, bot games will continue to work because they're purely client-side and never had power-ups.

---

## Summary: Key Implementation Risks

### 1. doShot "hit keeps turn" logic conflict
The biggest code risk. `doShot` currently keeps the turn on a hit. Cross Missile and Scatter Blast must ALWAYS end turn. Solutions:
- **Option A:** Add a `forceEndTurn` parameter to doShot
- **Option B:** Override turn after doShot returns (post-hoc correction)
Option A is cleaner but requires touching the heavily-tested doShot function. Option B is safer but introduces temporal coupling.

### 2. Decoy + occ Set interaction
Adding decoy to `occ` is elegant but creates subtle interactions:
- Sonar scanning the decoy's row/column will return YES (intended? Yes per design — it's deception)
- Scatter Blast could randomly hit the decoy (reports HIT, no sunk — correct)
- Cross Missile could hit decoy (reports HIT, no sunk — correct)
- `sunkCellsList` returns all cells of fully-sunk ships — decoy won't appear here since it's not in `ships` array. Good.

### 3. Placement validation extension
`validatePlacement` currently only validates ships. Must be extended to accept and validate decoy cell. The `placeShips` event payload changes shape — backward compatibility for any in-flight old clients during deploy.

### 4. Race condition: purchase during placement
Two rapid purchase clicks could cause double-debit if not guarded. Need a `room.purchasing[clientId]` lock or sequentialization flag similar to `room.resolving`.

### 5. Matchmaking queue simplification
Removing mode from pairing criteria could match players who previously expected different modes. During transition, any queued players at deploy time will be force-paired regardless of old mode preference. Minimal risk since queue entries are short-lived.

---

## Recommended Plan Breakdown

### Plan 15-01: Legacy Removal (Server + Client)
- Remove `maybeSpawn`, `powerupsForAttacker`, board spawn logic
- Remove `buyPowerup` handler and `buyPowerupLimiter`
- Remove mode conditionals from `createRoom`, `joinQueue`, `findPair`
- Remove mode toggle from Lobby UI
- Remove mid-match shop UI and related state
- Remove `oppBoughtPowerup` event handler
- Remove old `POWERS` array, old `newInv()`
- Clean up localization strings
- Remove `powerups` map from room state (board spawns)
- Keep `mode` in DB records and syncPayload (always "classic")

### Plan 15-02: New Purchase System (Server)
- New constants: `NEW_POWERS`, `POWERUP_MAX_PER_MATCH = 2`, `POWERUP_PRICE_PCT = 0.10`
- New `newInv()`: `{ sonar: 0, cross: 0, decoy: 0, scatter: 0 }`
- New `buyPlacementPowerup` socket handler with all validations
- Extend `placeShips` to accept `decoyCell`
- Extend `validatePlacement` for decoy validation
- Add decoy cell to `occ` in player state
- Update `syncPayload` for new inventory shape
- Update `gameStart` emission (no mode, include placement purchase info)

### Plan 15-03: Power-up Implementations (Server)
- Rewrite `useAbility` handler for new 4 types
- Implement Sonar Ping (row/col scan, consume turn)
- Adapt Cross Missile (from fire handler to useAbility, always end turn)
- Adapt Scatter Blast (2-3 cells, always end turn)
- Add `forceEndTurn` mechanism to doShot or post-doShot correction
- Remove mine/double/reveal logic
- Clean up doShot (remove power-up pickup, mine detection)

### Plan 15-04: Client UI — Placement Shop + Decoy Placement
- New `PlacementShop` component (horizontal row of 4 power-ups)
- Integrate into Placement component (between grid and Ready button)
- Implement purchase interaction (buy → debit → update inventory)
- Implement Decoy placement mode (grid becomes clickable, Ready disabled until placed)
- Decoy marker on own board
- Handle "Max reached" state
- Show price, balance feedback

### Plan 15-05: Client UI — Battle Phase Power-ups
- Rewrite `PowerBar` for new 4 types (show only purchased items)
- Implement Sonar Ping UX (drag-and-drop row/col blocks onto enemy grid)
- Implement Cross Missile UX (aim mode → click target cell)
- Scatter Blast UX (one-click activate, show results)
- Remove old power-up UX (mine placement, reveal highlight, double indicator)
- Update battle log messages and localization
- Handle "turn consumed" feedback for all power-ups

### Plan 15-06: Integration Testing + Edge Cases
- Test decoy doesn't trigger sunk/win
- Test sonar correctly detects ship rows/columns (including decoy interference)
- Test cross missile boundary cells (edges/corners)
- Test scatter blast with < 2 cells remaining
- Test purchase cap enforcement
- Test guest/free-match shop hidden
- Test reconnection with new inventory shape
- Test bot games unaffected
- Verify mode removal doesn't break match history display
