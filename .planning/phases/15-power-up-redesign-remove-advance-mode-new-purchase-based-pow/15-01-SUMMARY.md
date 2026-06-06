# Plan 15-01 Summary: Legacy Removal — Remove Advance Mode & Old Power-up System

## Completed: 2024-XX-XX

## What Was Done

### Task 1: Server-side advance mode logic removed
- Deleted `POWERS` array, `newInv()` function, `powerupsForAttacker()`, `emitInv()`, `maybeSpawn()`
- Deleted `POWERUP_FIXED_FLOOR`, `POWERUP_STAKE_PCT`, `POWERUP_CAP_PER_MATCH` constants
- Deleted `buyPowerupLimiter` rate limiter
- Removed mode parameter from `createRoom` handler (always creates "classic" rooms)
- Removed mode from `joinQueue` entry creation
- Removed mode from queue pairing logic (`findPair`) — free queue is now pure FIFO, wagered groups by stake only
- Removed `room.powerups = {}` and `room.mines = {}` from room creation, matched rooms, and rematch reset
- Removed `inv: newInv()` from all player seat initializations
- Removed `room.purchases` tracking from game start and rematch
- Simplified `roomPublic()` to always return `mode: "classic"`
- Cleaned `syncPayload`: removed `powerups`, `myMines`, `inv`, `purchasesRemaining`, `powerupPrice` fields
- Kept `room.mode` in serialize/restore for backward compat during deploy
- Kept all `recordMatch(..., room.mode, ...)` calls — they pass whatever the room has (always "classic" for new games)

### Task 2: Old useAbility handlers removed
- Gutted `useAbility` handler body — removed `double`, `reveal`, `mine`, `scatter` blocks
- Left the handler shell (rate limiting, room/turn validation) returning `{ ok: false }` for any type
- Removed cross-missile from `fire` handler — fire is now pure single-cell shots only (`expandCells` kept for Plan 03)
- Removed mine-related code from `doShot` (`mineSet`, `mineHit`, `pmap` pickup logic, `collected` array)
- Removed `maybeSpawn(room, opp)` call from `doShot`
- Removed `emitInv` and `powerupsForAttacker` calls from `doShot`
- Simplified `doShot` return value (no `collected`, no `mineHit`)

### Task 3: Client-side advance mode UI removed
- Removed mode toggle (segmented control) from Lobby component
- Removed `mode` state from Lobby and from App-level state
- Removed mode from `createRoom` and `joinQueue` socket emissions
- Removed `showShop`, `oppBoughtNotice`, `purchasesRemaining`, `powerupPrice` states
- Removed `inv`, `myMines`, `powerups`, `revealedEnemy`, `aim` states
- Removed `handleBuyPowerup()`, `activatePower()`, `placeMine()` functions
- Removed mid-match shop UI block and `oppBoughtNotice` toast
- Removed `socket.on("oppBoughtPowerup")`, `socket.on("inventory")`, `socket.on("powerups")` listeners
- Removed `PowerBar` component entirely
- Removed `POWER_ICON`, `POWER_NAME` objects
- Simplified `Grid` component (removed `powerups`, `mines`, `placeable` props)
- Simplified `Battle` component (removed `mode`, `inv`, `powerups`, `revealedEnemy`, `aim`, `onPower`, `myMines`, `onPlaceMine` props)
- Removed modes/power-up help section from `HelpModal`
- Removed advance-mode localization strings (`mode.advance`, `mode.advanceDesc`, `help.modesTitle`, `help.modesBody`, `help.powerTitle`, `help.pwScatter/Cross/Double/Reveal/Mine`, `err.NOT_ADVANCE_MODE`, `err.PURCHASE_CAP_REACHED`)
- Simplified `applyShotResult` (removed `collected` and `mineHit` handling)
- Simplified `fire()` function (no power parameter, no aim routing)

### Task 4: Verification
- Server module loads without errors ✓
- Build (`node build-game.mjs`) completes successfully ✓
- Bot play unaffected (no mode dependency — purely client-side) ✓
- Match recording works (always passes "classic") ✓
- Match history filter still accepts "advance" for historical records ✓
- `expandCells("cross", r, c)` kept for Plan 03 reuse ✓

## Stats
- **Lines removed:** ~480
- **Lines added:** ~232  
- **Net reduction:** ~248 lines

## Notes for Next Plans

1. **Plan 15-02** (New Purchase System): Will define new `newInv()`, add `buyPlacementPowerup` handler, extend `placeShips` for decoy
2. **Plan 15-03** (Power-up Implementations): Will fill in the `useAbility` handler shell with sonar/cross/scatter/decoy implementations. `expandCells` is already available.
3. **Plan 15-04/05** (Client UI): Will recreate `POWER_ICON`/`POWER_NAME` for new 4 types, add `PlacementShop` component, and new `PowerBar`
4. The `expandCells` function is intentionally kept — Plan 03 will use it for Cross Missile
5. The `abilityLimiter` rate limiter is kept — Plan 03 will use it
6. Match history API still accepts `mode=advance` filter for historical data display
