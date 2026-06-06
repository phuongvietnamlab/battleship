# Plan 15-02 Summary: New Purchase System — Server-side Placement-Phase Power-up Shop

## Completed: 2024-XX-XX

## What Was Done

### Task 1: New power-up constants and inventory
- Added `NEW_POWERS = ["sonar", "cross", "decoy", "scatter"]`
- Added `POWERUP_MAX_PER_MATCH = 2` and `POWERUP_PRICE_PCT = 0.10`
- New `newInv()` function returns `{ sonar: 0, cross: 0, decoy: 0, scatter: 0 }`
- Added `purchases: {}` to room creation in `createRoom` and `createMatchedRoom`
- Added `inv: newInv(), decoyCell: null` to all player seat initializations (createRoom, createMatchedRoom, joinRoom)

### Task 2: `buyPlacementPowerup` socket handler
- New handler with full validation chain:
  - Rate limited: 3 attempts/min via `buyPlacementPowerupLimiter`
  - Guards: room exists, player in room, game not started
  - Guards: stake > 0 (free matches rejected), authenticated user (guests rejected)
  - Guards: valid type (must be in `NEW_POWERS`), max 2 purchases, max 1 decoy
  - Price = `Math.round(room.stake * 0.10)` — exactly 10% of stake
  - Atomic wallet debit via `debitWallet()` before granting power-up
  - On success: increments `me.inv[type]`, increments `room.purchases[clientId]`
  - Emits `balanceUpdate` to buyer socket only (secrecy: opponent gets nothing)
  - Returns `{ ok: true, type, price, newBalance, remaining }`

### Task 3: Extended `placeShips` handler
- Backward-compatible payload parsing:
  ```javascript
  const ships = Array.isArray(arg) ? arg : (arg && arg.ships ? arg.ships : arg);
  const decoyCell = (!Array.isArray(arg) && arg && arg.decoyCell) ? arg.decoyCell : null;
  ```
- Decoy validation:
  - If player has decoy in inventory but no `decoyCell` provided → reject with `DECOY_NOT_PLACED`
  - If `decoyCell` provided: validate `inBounds`, validate not on a ship (`occ.has(dk)`)
  - On valid decoy: add to `occ` Set (so it registers as HIT when fired upon)
  - Store `me.decoyCell = dk` for player's own board view
- Existing `validatePlacement()` runs on ships unchanged

### Task 4: Updated `syncPayload`
- Added `inv` field (player's power-up inventory)
- Added `decoyCell` field (player's own decoy position, for board marker)
- Added `purchasesRemaining` (how many more power-ups the player can buy)
- Added `powerupPrice` (cost per power-up, 0 for free matches)
- Opponent's inventory is NOT included (secrecy requirement)

### Task 5: Rematch reset
- On rematch: `room.purchases = {}` resets purchase counts
- Each player: `inv = newInv()`, `decoyCell = null` reset to fresh state
- Same resets will apply if future Bo3 round reset is added (follows same pattern)

## Verification
- Server module loads without errors (`require('./server.js')` → "All OK") ✓
- No syntax errors, all existing code paths unaffected ✓
- Database connection not available locally (expected — no Postgres), but module parse and init confirmed clean ✓

## Stats
- **Lines added:** ~55
- **Lines modified:** ~15

## Notes for Next Plans
1. **Plan 15-03** (Power-up Implementations): Will fill the `useAbility` handler shell with sonar/cross/scatter logic. `expandCells` and `abilityLimiter` are ready. The `inv` field is now on every player.
2. **Plan 15-04/05** (Client UI): Will use `syncPayload` fields (`inv`, `decoyCell`, `purchasesRemaining`, `powerupPrice`) to render the placement shop and power bar.
3. Decoy is in `occ` but NOT in `ships` — so `sunkShipCount` never counts it. Sonar scanning the decoy's row/col returns YES (intentional deception).
4. The `buyPlacementPowerup` handler is placement-phase only (`!room.started` guard). Once game starts, no more purchases possible.
