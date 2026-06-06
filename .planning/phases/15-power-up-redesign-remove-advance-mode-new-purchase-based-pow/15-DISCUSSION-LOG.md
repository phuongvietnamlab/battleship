# Phase 15 Discussion Log

Date: 2026-06-06

## Areas Discussed

### 1. Sonar Ping UX
**Question:** How does the player select a row/column to scan?
**Options presented:** Tap header, dropdown, separate UI, drag-and-drop
**User decided:** Drag-and-drop — show 2 "lego block" icons (horizontal for row, vertical for column). Player drags the block onto the grid, same interaction pattern as ship placement drag-and-drop.
**Note:** Result (YES/NO) displayed in battle log text. No special popup.

### 2. Decoy interaction — enemy perception
**Question:** When enemy hits decoy and exhausts surrounding cells, is there any notification?
**Options presented:** Announce "fake!", subtle hint, stay completely silent
**User decided:** Completely silent. Decoy shows same fire/hit animation as a real ship hit. No special visual or text. Enemy discovers the decoy is fake only by their own deduction after wasting shots around it.

### 3. Shop flow & undo policy
**Question:** Can purchases be undone? What about decoy placement conflicts?
**Options presented:** Allow undo, no undo with refund on cancel, no undo at all
**User decided:** No undo at all. Once purchased, committed. Decoy placement is mandatory — cannot press Ready without placing it. If ship moved to overlap decoy after placement, force decoy re-placement.

### 4. Turn consumption rules
**Question:** Do Cross Missile and Scatter Blast keep the turn on hit (like normal shots) or always consume turn?
**Options presented:** Keep turn on hit (like current game), always consume turn
**User decided:** Always consume turn regardless of hit/miss. All power-ups end your turn. This prevents power-ups from being too strong and keeps the game balanced.

## Deferred Ideas
None.

## Key Decisions Summary
- Sonar Ping: drag-and-drop lego blocks onto grid (reuse placement DnD system)
- Decoy: completely silent deception, same visual as real hit
- No purchase undo, mandatory decoy placement before Ready
- All power-ups always consume turn (no "hit = keep turn" exception)
