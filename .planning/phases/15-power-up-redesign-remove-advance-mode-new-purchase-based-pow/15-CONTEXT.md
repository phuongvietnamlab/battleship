# Phase 15: Power-up Redesign — Context

## Overview

Complete redesign of the power-up system. Remove "Advance" mode entirely. Replace random spawning + mid-match shop with a **placement-phase purchase system**. 4 new power-ups focused on skill/strategy rather than raw damage.

## Key Design Decisions

1. **Single game mode** — no more Classic/Advance split
2. **Buy at placement phase** — power-ups purchased before battle, not during
3. **Max 2 per game** — each player picks at most 2 power-ups
4. **Price = 10% of stake** — only available in wagered matches (stake > 0)
5. **Free matches = no power-ups** — keeps free play pure
6. **Complete secrecy** — opponent has zero information about your purchases
7. **Decoy placed at placement time** — must be positioned before Ready
8. **Sonar costs a turn** — information has a real price (tempo loss)
9. **All power-ups ALWAYS consume turn** — hit or miss, turn always passes to opponent (Cross Missile, Scatter Blast included)
10. **No undo on purchases** — once bought, committed
11. **Decoy mandatory placement** — if bought, MUST place before pressing Ready; cannot ready without placing

## 4 Power-ups

### 1. 🔊 Sonar Ping
- Choose a row OR column
- Response: only "YES" (has ship) or "NO" (no ship) — no count
- **Costs your turn** (you don't fire)
- Trade-off: information vs tempo
- **UX: Drag-and-drop interaction** — When activated, shows 2 "lego block" icons (one horizontal bar for row, one vertical bar for column). Player drags the chosen block onto the board grid. The row/column they drop it on is the one scanned. Same interaction pattern as dragging ships during placement.
- **Result display:** YES/NO shown in battle log text. No special popup — keeps flow fast.

### 2. ➕ Cross Missile
- Choose a target cell → fires center + 4 adjacent (cross shape, up to 5 cells)
- Skip already-shot cells and out-of-bounds
- **Always consumes turn** (even if some cells hit)

### 3. 🪤 Decoy
- Placed on an empty cell during Placement_Phase (MANDATORY before Ready)
- Permanent — never disappears
- Enemy hits it → sees "HIT!" with same fire animation as hitting a real ship
- **Silent deception** — no notification to enemy, no special visual. They only discover the decoy was fake by exhausting surrounding cells and realizing no ship connects.
- Does NOT count toward win/loss (sinking all 5 real ships still wins)
- Max 1 Decoy per player
- **Decoy cell must not overlap any ship cell** — validated server-side
- On player's own board view: show a subtle marker so the player remembers where they placed it

### 4. 🌠 Scatter Blast
- Fires 2-3 random unshot cells on enemy board
- No targeting — pure random among remaining cells
- **Always consumes turn** (even if hits occur)

## Purchase Flow
- Shop visible on **placement screen** (between ship area and Ready button)
- Horizontal row of 4 power-up cards with icons + price
- Only for: authenticated users + wagered matches (stake > 0)
- Guests: shop hidden
- Free matches: shop hidden
- After buying Decoy → MUST place on empty cell before Ready button is enabled
- **No undo/refund** — once purchased, committed
- If player moves ships after placing decoy and ship now overlaps decoy → force decoy re-placement (decoy must always be on empty cell)

## Legacy Removal
- Remove `maybeSpawn` function + spawn logic
- Remove `buyPowerup` socket handler (replace with new placement-phase handler)
- Remove mode selection UI (Classic/Advance toggle)
- Remove mid-match shop UI
- Remove advance-mode conditionals server-side
- Keep `mode` column in DB for historical match records

## Source Requirements
Full detailed requirements: `.kiro/specs/power-up-redesign/requirements.md`

## Canonical Refs
- `.kiro/specs/power-up-redesign/requirements.md` — Full acceptance criteria (MUST read before planning)
- `server.js` lines 1141-1200 — Current power-up logic (to be removed/replaced)
- `server.js` lines 2048-2130 — Current useAbility handler (to be rewritten)
- `server.js` lines 2223-2297 — Current buyPowerup handler (to be replaced)
- `public/app.jsx` PowerBar component — UI to adapt for new system
- `public/app.jsx` placement screen section — Where shop UI will be added

## Dependencies
- Phase 7 (points economy — wallet, debit API, `debitWallet()`)
- Phase 2 (auth — userId, session)

## Code Context (reusable assets)
- `debitWallet(userId, amount, type, refId)` — atomic wallet deduction (reuse for power-up purchase)
- `emitToClient(room, clientId, event, data)` — targeted socket emit (reuse for inventory updates)
- `inBounds(r, c)` — coordinate validation (reuse for decoy placement)
- `expandCells("cross", r, c)` — existing cross expansion logic (adapt for new Cross Missile)
- `doShot(room, clientId, cells)` — shot resolution logic (reuse for Scatter Blast and Cross Missile)
- Placement screen drag-and-drop system — reuse for Sonar Ping drag interaction and Decoy placement
