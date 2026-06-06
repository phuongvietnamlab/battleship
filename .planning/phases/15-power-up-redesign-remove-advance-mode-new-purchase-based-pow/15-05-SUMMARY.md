# Plan 15-05 Summary: Client UI — Battle Phase Power-ups

## Completed

## What Was Done

### Task 1: Rewrote PowerBar Component
- New `PowerBar` component renders only purchased power-ups (filters by `inv[type] > 0`)
- Returns `null` when no power-ups purchased (hidden completely)
- Shows icon, name, and count badge (×N) for each available power-up
- Buttons disabled when `!myTurn`; gold glow highlight when in aim mode (`.aiming` class)
- Excludes Decoy (passive — placed during placement phase only)

### Task 2: Sonar Ping UX — Panel-based Selection
- Implemented as a `SonarPanel` component with row/column button selection
- Shows when `aim === "sonar"` — horizontal row of 11 buttons for rows (A-K) and 11 for columns (1-11)
- On button click: emits `socket.emit("useAbility", { type: "sonar", axis, index }, cb)`
- Result displayed in battle log: "🔊 Sonar scanned row B — YES! Ships detected." or "...— NO ships."
- Cancel button + re-tap the PowerBar button cancels sonar mode
- Simpler approach chosen over full DnD — acceptable for first iteration per plan notes

### Task 3: Cross Missile UX — Aim Mode
- `setAim("cross")` enters cross aim mode
- Grid cells show gold cross-pattern highlight on hover (center + 4 adjacent via `aimCells`)
- On click: emits `socket.emit("useAbility", { type: "cross", r, c }, cb)`
- Result processed through `applyShotResult` (updates shots, sunk counts, flash)
- Log entry: "➕ Cross Missile at {cell}!"
- Cancel: re-tap Cross button clears aim

### Task 4: Scatter Blast UX — One-click Activate
- No aim mode — immediate emit on button click
- Emits `socket.emit("useAbility", { type: "scatter" }, cb)`
- Plays explosion sound, shows results via `applyShotResult`
- Log entry: "🌠 Scatter Blast!"

### Task 5: activatePower Function
- Central dispatcher for all power-up activation
- Handles "sonar" (toggle aim), "cross" (toggle aim), "scatter" (immediate fire)
- Also handles "sonar-fire" internal type for SonarPanel selections
- Guards: `!myTurn` or no inventory → early return
- Toggle pattern: re-tap same power cancels aim mode

### Task 6: Sonar Result Display
- Log message shows axis + target label + YES/NO result
- EN: "🔊 Sonar scanned row B — YES! Ships detected." / "...— NO ships."
- VI: "🔊 Dò sóng hàng B — CÓ tàu!" / "...— KHÔNG có tàu."

### Task 7: Localization Strings
- Added EN keys: `log.sonarYes`, `log.sonarNo`, `log.scatterBoom`, `log.crossFire`, `battle.aimingSonar`, `battle.aimingCross`
- Added VI keys: matching Vietnamese translations for all new strings
- Updated existing `log.scatterBoom` emoji from 💥 to 🌠 (matches icon)

### Task 8: Cleaned Old Power-up UX
- No functional code remained for mine/reveal/double (already removed in Plan 15-01)
- Old i18n strings left in place (harmless dead keys, no runtime impact)
- Removed duplicate `log.scatterBoom` entries that caused build warnings

## State Architecture

### New States Added to App
| State | Type | Purpose |
|-------|------|---------|
| `inv` | `{sonar, cross, decoy, scatter}` | Battle-phase inventory counts |
| `aim` | `null \| "sonar" \| "cross"` | Current targeting mode |
| `crossHover` | `Set \| null` | Cells highlighted for cross preview |

### Inventory Transfer Flow
1. **Placement phase**: `placementInv` tracks purchases
2. **gameStart event**: copies `placementInv` → `inv`
3. **invUpdate event**: server sends updated `inv` after each ability use
4. **Bot mode**: copies `placementInv` → `inv` when entering battle

### Turn Handling
- `turnUpdate` event clears aim/crossHover when turn passes to opponent
- `applyShotResult` does NOT optimistically set `myTurn=true` for power-ups (they always end turn via server's `forceEndTurn`)
- Normal fire still gets optimistic `myTurn=true` on hit

## CSS Added
- `.power-bar` — flex container for battle-phase power buttons
- `.aim-hint` — inline banner showing aim mode instruction text
- `.sonar-panel` — dark panel with row/col selection buttons
- `.sonar-hint` / `.sonar-label` / `.sonar-btns` / `.sonar-pick` — sonar UI elements
- `.sonar-cancel` — cancel button in sonar panel
- Mobile breakpoint styles for compact layouts

## Verification
- `node build-game.mjs` — builds successfully with 0 warnings ✓
- No syntax errors in JSX ✓
- Commit: `a00a327`

## Notes for Next Plans
1. The `POWER_ICON` constant is available globally for any future component needing power-up icons.
2. Sonar DnD (full drag-and-drop blocks onto grid) was deferred — current panel approach is functional and accessible. Can be upgraded in a future UX polish pass.
3. Bot mode does not support power-ups in battle (server-only feature) — PowerBar shows nothing for bot games since shop is hidden for free/bot matches.
