---
phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
plan: 02
subsystem: ui
tags: [react, jsx, css, flexbox, mobile-shell, i18n]

requires:
  - phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
    provides: ScreenShell wrapper + useMainHeight hook + root 100dvh/overflow:hidden viewport lock (Plan 01)
provides:
  - Lobby, Queue, Room, Placement screens refactored onto ScreenShell (header/main/footer regions)
  - Room screen back button routes through leaveRoom() -> confirmLeave modal (no silent screen pop)
  - Placement room-banner (room code + status pill) and place-actions relocated into shell header/footer
affects: [19-03, 19-04]

tech-stack:
  added: []
  patterns:
    - "ScreenShell header/main/footer regions used for lobby/queue/room/placement; SHELL_HEADER_SCREENS array gates legacy .topbar/.roombar rendering"
    - ".shell-header .btn.ghost.compact { flex: none; width: auto } to prevent .btn's width:100% from claiming full header row via flex-basis:auto"

key-files:
  created: []
  modified:
    - public/app.jsx
    - public/style.css

key-decisions:
  - "Moved Placement's room-banner JSX from App() into the Placement component itself (mirrors Plan 01's self-contained Battle component pattern), threading error/code/copied/copyCode/oppPresent/oppReady/onBack props"
  - "Relocated .place-actions (Random + Ready/Cancel-ready) from Placement main content into the ScreenShell footer slot"
  - "Room back button and Placement onBack both wired to leaveRoom() to preserve confirmLeave modal flow (threat T-19-03)"

patterns-established:
  - "New shell-header back buttons use {t('history.back')} directly (no extra literal arrow — i18n string already includes it)"

requirements-completed: [MOBILE-02, MOBILE-05, MOBILE-08, MOBILE-09, MOBILE-11]

duration: ~70min
completed: 2026-06-15
---

# Phase 19 Plan 02: Lobby/Queue/Room/Placement onto ScreenShell Summary

**Refactored lobby, queue, room, and placement screens onto the ScreenShell header/main/footer layout, with the room/placement back buttons routed through the existing leaveRoom() confirmLeave modal instead of a silent screen pop.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 2 completed
- **Files modified:** 2 (`public/app.jsx`, `public/style.css`)

## Accomplishments
- Lobby now renders inside `<ScreenShell header={topbarContent} screenKey="lobby">` — existing `.topbar` becomes the shell header, hero CTA + cards sit in the scrollable `.shell-main`, no page scroll at 360x640/390x844/414x896.
- Queue screen: title ("Free Match") in shell header, search timer/status pill in main, "Leave Queue" button in shell footer; no back button (cancel is the action).
- Room screen: shell header with `← Back` button wired to `leaveRoom()` (routes through `confirmLeave` modal, not a silent pop) + room title; room-code/invite-link/share content in scrollable main.
- Placement: room-banner (room code box + status pill) moved into the `Placement` component and rendered in the shell header next to the back button; `.place-actions` (Random / Ready-for-Battle / Cancel-ready) moved to the shell footer; board + power-up shop remain in main.
- All four screens verified to fit one viewport (no page scroll, no horizontal scroll) at 360x640, 390x844, 414x896 via Playwright + manual screenshot review.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lobby + Queue screens onto ScreenShell** - `3483f79` (feat)
2. **Task 2: Room + Placement screens onto ScreenShell with leave-confirm back button** - `8bef475` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `public/app.jsx` - Added `topbarContent`/`SHELL_HEADER_SCREENS`; wrapped Lobby/Queue/Room in ScreenShell with header/main/footer slots; extended `Placement` signature with `error, code, copied, copyCode, oppPresent, oppReady, onBack` and restructured its render into `<ScreenShell header={...} footer={...}>` containing the room-banner and place-actions
- `public/style.css` - Added `.shell-header h2` truncation rules, `.shell-header .btn.ghost.compact { flex: none; width: auto }` fix, `.shell-header .topbar` padding/width override (Task 1), and `.shell-header .room-banner` compacted-chrome rules (Task 2)

## Decisions Made
- Self-contained component pattern (room-banner moved into `Placement`) chosen over keeping banner JSX in `App()` and passing it as a header prop, to mirror Plan 01's Battle component precedent and keep Placement's shell composition local.
- `leaveRoom` reused directly as both Room's back-button handler and Placement's `onBack` — single source of truth for the leave-confirmation flow (threat T-19-03 mitigated: no new silent-pop path introduced).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Double-arrow "← ← Back" in new shell-header back buttons**
- **Found during:** Task 2 (visual screenshot verification of room/placement screens)
- **Issue:** `history.back` i18n value (`"← Back"` / `"← Quay lại"`) already includes a leading arrow; new buttons were written as `<button>← {t("history.back")}</button>`, producing a duplicated arrow.
- **Fix:** Removed the literal `← ` prefix from both new back buttons (Room header, Placement header) — now `{t("history.back")}` only.
- **Files modified:** `public/app.jsx`
- **Verification:** Screenshot review (shot3/shot4 series) confirms single arrow.
- **Committed in:** `8bef475`

**2. [Rule 1 - Bug] `.shell-header .btn.ghost.compact` claimed ~100% of header width, squeezing sibling content to near-zero**
- **Found during:** Task 2 (room title "Invite a friend" truncated to "Invite ..."; placement room-banner content invisible)
- **Issue:** `.btn` base CSS sets `width: 100%`. Combined with `flex: none` (= `flex: 0 0 auto`), `flex-basis: auto` resolves to the explicit `width` (100% of `.shell-header`), so the back button consumed nearly the entire header row (~330px of 360px), leaving the room title `<h2>` at `width: 0` and Placement's `.room-banner` invisible.
- **Fix:** Added `.shell-header .btn.ghost.compact { flex: none; width: auto }` so the back button sizes to its content, plus `.shell-header h2 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 }` and `.shell-header .room-banner { flex: 1; min-width: 0; ... }` so remaining header content fills available space with proper truncation.
- **Files modified:** `public/style.css`
- **Verification:** Rebuilt + re-screenshotted (shot4 series) at 360x640 — room title displays in full ("Invite a friend"), placement room-code box + status pill render correctly alongside the back button. Full Playwright suite re-run after fix: 28 passed, 12 skipped.
- **Committed in:** `8bef475`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug fixes in new code introduced by this plan's tasks)
**Impact on plan:** Both fixes were necessary for correctness of the newly-built shell headers. No scope creep — pre-existing identical double-arrow bug in `.friends-header` (Plan 19-PATTERNS.md "canonical" example) was left untouched as out-of-scope.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Lobby, Queue, Room, and Placement screens now follow the ScreenShell pattern established in Plan 01, ready for Plans 19-03/19-04 to apply the same pattern to remaining screens (profile, history, friends).
- `.shell-header .btn.ghost.compact` width/flex fix is reusable for any future shell header containing a back button alongside other content.
- No blockers.

---
*Phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout*
*Completed: 2026-06-15*
