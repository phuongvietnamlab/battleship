# Phase 12: Merge Quick Play and Wagered Match - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate the two matchmaking buttons ("Quick Play" and "Wagered Match") into a single "Quick Play" hero CTA with conditional behavior:
- Guest users: tap → join free queue immediately (stake=0)
- Logged-in users: tap → bottom sheet popup to choose stake (0/10/25/50/100) → then join queue

Remove the `wager-strip` section entirely from the lobby. Server-side queue logic stays unchanged.

</domain>

<decisions>
## Implementation Decisions

### UI Flow
- Quick Play button remains the yellow hero CTA (style unchanged)
- On tap: check `authUser` state
  - If null (guest): call `handleQuickMatch()` with stake=0 directly
  - If truthy (logged-in): open a new `stakeSheetOpen` BottomSheet
- BottomSheet shows balance + stake chips (Free/10/25/50/100) + "Find Match" confirm button
- Selecting a stake + confirming calls the unified handler with chosen stake

### Code Removal
- Remove `wager-strip` div and all its contents from Lobby
- Remove `onWageredMatch` prop from Lobby
- Remove `handleWageredMatch` as separate function in App — merge into `handleQuickMatch(stake)`
- Remove `selectedStake` state from Lobby (move to BottomSheet local state or keep minimal)

### Server Compatibility
- Server joinQueue already handles both `type: "free"` (stake=0) and `type: "wagered"` (stake>0)
- Client sends `type: "wagered"` when stake > 0, `type: "free"` when stake === 0
- No server changes needed

### i18n
- Keep `queue.stakeSelect`, `queue.stake0/10/25/50/100` keys (reused in new BottomSheet)
- `queue.wageredMatch` key can remain but is no longer rendered in lobby (no breaking change)

</decisions>

<specifics>
## Specific Ideas

- Reuse existing `<BottomSheet>` component (already used for bot/friends)
- Show balance at top of stake sheet: "💰 {balance}" 
- "Free (0 pts)" option always enabled, others disabled if balance < stake
- After selecting stake, a single "Find Match" button joins the queue
- Keep friends room stake selector untouched (separate BottomSheet)

</specifics>

<deferred>
## Deferred Ideas

None — this is a UI consolidation, no new features.

</deferred>

---

*Phase: 12-merge-quick-play-and-wagered-match*
*Context gathered: 2026-06-05*
