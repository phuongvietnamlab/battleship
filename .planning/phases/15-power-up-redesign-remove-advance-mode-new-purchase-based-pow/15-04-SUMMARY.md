# Plan 15-04 Summary: Client UI — Placement Shop + Decoy Placement

## Completed

## What Was Done

### Task 1: PlacementShop Component
- Created `PlacementShop` functional component in `public/app.jsx`
- Displays horizontal row of 4 power-up buttons: Sonar (🔊), Cross (➕), Decoy (🪤), Scatter (🌠)
- Shows price (10% of stake) in header
- Disables buttons when: max 2 reached, can't afford, or decoy already owned (max 1)
- Shows "Max (2/2)" or "Not enough points" feedback text

### Task 2: Shop Integrated into Placement Component
- Extended Placement component props: `stake`, `balance`, `authUser`, `vsBot`, `onBuyPowerup`, `inventory`, `purchaseCount`, `decoyPending`, `decoyCell`, `onDecoyPlace`
- Shop rendered between hint text and action buttons
- Visibility condition: `stake > 0 && authUser && !vsBot` — hidden for guests, bot games, and free matches
- All props threaded from App component

### Task 3: Purchase Flow Implementation
- Added state in App: `placementInv`, `placementPurchases`, `decoyPending`, `decoyCell`
- `handlePlacementBuy(type)` emits `buyPlacementPowerup` to server, updates local inventory on success
- Balance updates handled via existing `balanceUpdate` socket event
- Error codes shown via `showNotice()`
- Buying decoy triggers `setDecoyPending(true)`

### Task 4: Decoy Placement Mode
- When `decoyPending === true`: Ready button disabled, empty grid cells highlighted with `.placeable` class
- Hint text "Tap an empty cell to place your decoy" shown in gold
- On valid empty cell click: sets `decoyCell`, clears pending state
- Ship cells are not clickable for decoy placement (guarded in handler)
- Decoy marker (🪤) rendered as absolute-positioned overlay on own board
- Decoy invalidation: useEffect watches `placed` state — if ships overlap decoy after rearrangement, resets decoyCell and re-enters pending mode with a notice

### Task 5: confirmPlacement Extended
- Modified to send `{ ships, decoyCell }` payload when decoy is placed
- Falls back to plain `ships` array when no decoy (backward compatible)
- Ready button disabled while `decoyPending` (decoy purchased but not yet placed)

### Task 6: CSS Styles Added
- `.placement-shop` — centered flex container
- `.shop-row` — flex row with gap for power-up buttons
- `.shop-item` — compact button with icon + name, hover/disabled states
- `.shop-icon` / `.shop-name` — icon sizing and label styling
- `.shop-cap` — orange feedback text for max reached / insufficient balance
- `.decoy-hint` — gold colored hint text
- `.decoy-marker` — absolute overlay for decoy emoji on grid
- `.cell.placeable` — subtle gold highlight for valid decoy placement cells

### Task 7: Localization Strings
- EN: `pw.sonar`, `pw.decoy`, `shop.capReached`, `decoy.place`, `decoy.onShip`, `decoy.invalidated`
- VI: Same keys with Vietnamese translations
- Removed duplicate `shop.capReached` entries from old shop strings (was "Limit reached" / "Đã hết lượt mua", now "Max (2/2)" / "Tối đa (2/2)")

## State Resets
- `resetToLobby()` resets all placement-shop state
- `startBot()` resets all placement-shop state (shop hidden in bot games anyway)

## Verification
- `node build-game.mjs` — builds successfully with 0 warnings ✓
- No syntax errors in JSX ✓
- Commit: `57c3a86`

## Architecture Notes
- PlacementShop is a pure presentational component (no socket interaction)
- Purchase flow lives in App component (`handlePlacementBuy`) for socket access
- Decoy state owned by App, passed to Placement as props — enables cross-component coordination
- Decoy invalidation uses a `useEffect` in Placement watching `placed` state changes

## Notes for Next Plans
1. **Plan 15-05** (Battle-phase power bar): The `placementInv` state tracks what was purchased. Transfer this to battle-phase UI when game starts.
2. The `invUpdate` socket event (from Plan 15-03) will decrement inventory during battle — listen for it in the battle screen.
3. Sonar Ping drag interaction (Plan 15-05/06) will need a different UX pattern during battle phase.
