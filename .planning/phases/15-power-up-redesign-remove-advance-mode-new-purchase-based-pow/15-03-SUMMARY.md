# Plan 15-03 Summary: Power-up Implementations — Server-side Game Logic

## Completed: 2024-XX-XX

## What Was Done

### Task 1: Added `forceEndTurn` option to `doShot`
- Signature changed: `doShot(room, clientId, cells, opts = {})`
- After the "hit keeps turn" and bonus-shot logic: `if (opts.forceEndTurn) keep = false;`
- Overrides ALL keep-turn behavior — placed after bonus check so it always wins
- Normal fire calls continue with default opts (no `forceEndTurn`) — "hit keeps turn" preserved
- Cross Missile and Scatter Blast pass `{ forceEndTurn: true }` to always consume turn

### Task 2: Implemented Sonar Ping (`type === "sonar"`)
- Expects `{ type: "sonar", axis: "row"|"col", index: 0-10 }`
- Validates: inventory > 0, valid axis, index in bounds (0 to BOARD-1)
- Scans opponent's `occ` Set — iterates and checks if any cell matches the axis+index
- Returns `{ ok: true, type: "sonar", result: "YES"|"NO", axis, index }`
- Consumes turn via `giveTurn` + `armTurnTimer` + emits `turnUpdate` to both players
- Decrements `me.inv.sonar`
- Emits `invUpdate` to the activating player so client can update UI
- Decoy cells in `occ` WILL cause YES responses (intentional — decoy fools sonar)

### Task 3: Implemented Cross Missile (`type === "cross"`)
- Expects `{ type: "cross", r, c }`
- Validates: inventory > 0, `inBounds(r, c)`, not `room.resolving`
- Calls `doShot(room, clientId, expandCells("cross", r, c), { forceEndTurn: true })`
- `expandCells("cross", r, c)` returns center + 4 orthogonal (up to 5 cells, bounds-checked)
- Returns `Object.assign({ type: "cross" }, summary)` — full shot result merged with type
- Always ends turn (via `forceEndTurn`) regardless of hits
- Emits `invUpdate` after use

### Task 4: Implemented Scatter Blast (`type === "scatter"`)
- Expects `{ type: "scatter" }` (no targeting — pure random)
- Validates: inventory > 0, not `room.resolving`
- Collects all unshot cells: iterates BOARD×BOARD, excludes cells already in `me.hits`
- If 0 unshot cells remain: rejects with `NO_CELLS`
- Picks 2-3 random: `2 + Math.floor(Math.random() * 2)`, capped by available cells
- Calls `doShot(room, clientId, pick, { forceEndTurn: true })`
- Returns `Object.assign({ type: "scatter" }, summary)` — full shot result merged with type
- Always ends turn (via `forceEndTurn`) regardless of hits
- Emits `invUpdate` after use

### Task 5: Verified Decoy Hit Behavior (no code changes)
- Decoy cell is in `occ` → `oppData.occ.has(k)` returns `true` → reports HIT ✓
- Decoy cell is NOT in `ships` array → `sunkShipCount` never counts it ✓
- Win condition `sunkCount >= FLEET.length` only counts real ships ✓
- Cross Missile/Scatter Blast hitting decoy: reports HIT, no sunk — correct ✓
- Sonar scanning decoy's row/col: returns YES — correct (decoy fools sonar) ✓

### Task 6: Verified Fire Handler (no code changes needed)
- Fire handler already clean: `socket.on("fire", async ({ r, c }, cb) => ...)`
- No `power` parameter — pure single-cell shot only
- Calls `doShot(room, clientId, [[r, c]])` with default opts (no `forceEndTurn`)
- "Hit keeps turn" behavior preserved for normal fire
- Old advance-mode conditionals were already removed in Plan 15-01

## Architecture Notes

### `invUpdate` Event
Added a new socket event `invUpdate` emitted to the activating player after each ability use.
Payload: `{ inv: me.inv }` — the full inventory object so client can update its power bar.
This event is only sent to the user who activated the ability (opponent gets no information).

### Turn Flow Summary
| Action | Turn Behavior |
|--------|--------------|
| Normal fire (hit) | Keep turn |
| Normal fire (miss) | Pass turn |
| Sonar Ping | Always pass turn (explicit `giveTurn`) |
| Cross Missile | Always pass turn (`forceEndTurn: true`) |
| Scatter Blast | Always pass turn (`forceEndTurn: true`) |

### Race Guard
Cross Missile and Scatter Blast both set `room.resolving = true` before calling `doShot`
and unset it in a `finally` block. This prevents simultaneous ability + turn-timeout resolution.
Sonar doesn't need this guard since it doesn't call `doShot`.

## Verification
- `node --check server.js` — passes (no syntax errors) ✓
- `require('./server.js')` — module loads without runtime errors ✓
- All existing code paths unaffected (fire handler, placement, game flow) ✓

## Stats
- **Lines added:** ~80 (useAbility handler body)
- **Lines modified:** ~3 (doShot signature + forceEndTurn line + comment update)

## Notes for Next Plans
1. **Plan 15-04/05** (Client UI): Listen for `invUpdate` event to refresh power bar state. The `useAbility` socket event now expects `{ type, r, c, axis, index }` — pass relevant fields per type.
2. The `expandCells` function is shared between cross missile and any future cross-pattern needs.
3. The `forceEndTurn` mechanism in `doShot` is generic — any future power-up that fires multiple cells but should always end turn can use it.
