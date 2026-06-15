---
phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
plan: 04
subsystem: ui
tags: [react, jsx, css, visualviewport, portal, mobile-shell, transitions]

# Dependency graph
requires:
  - phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
    provides: ScreenShell wrapper + useMainHeight hook + root 100dvh/overflow:hidden viewport lock (Plan 01); all 8 screens refactored onto ScreenShell (Plans 01-03)
provides:
  - Screen-transition direction tracking (forward/back) derived in App() from prev-vs-next screen comparison, fed to ScreenShell as direction/screenKey
  - screen-enter-forward/back keyframe CSS (220ms slide, cubic-bezier(.34,1.4,.4,1)) degrading to a 100ms cross-fade under prefers-reduced-motion
  - useKeyboardInset(panelRef, ready) hook: visualViewport-based reposition of .chat-panel above the on-screen keyboard
  - BottomSheet rendered via createPortal(document.body) — fixes Pitfall 3 containing-block trap for all 6 bottom-sheet instances
  - Safe-area double-gutter fix: removed body-level env(safe-area-inset-*) padding (now per-region only via .app/.shell-header/.shell-footer/.shell-main)
affects: [19-04 Task 3 (checkpoint), future phases touching app shell navigation/overlays]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direction derivation by comparison: a ref-tracked prevScreenRef compared against current screen each render, against a HIERARCHY array (lobby/queue/room/placement/battle) and SECONDARY leaf screens (profile/history/friends) — avoids rewriting every setScreen() call site"
    - "useKeyboardInset(panelRef, ready): visualViewport resize/scroll listener pair, re-runs when `ready` (open state) toggles so the effect attaches once the DOM node exists; graceful no-op when visualViewport is absent"
    - "BottomSheet via createPortal(document.body): escapes any transformed ancestor (.shell-main during screen-enter animation) so position:fixed overlays remain viewport-relative"
    - "Per-region safe-area insets only: .app owns left/right, .shell-header owns top, .shell-footer (or .shell-main:not(:has(~ .shell-footer)) for footer-less screens) owns bottom — no body-level duplication"

key-files:
  created: []
  modified:
    - public/app.jsx
    - public/style.css

key-decisions:
  - "Direction derived via IIFE + prevScreenRef comparison in App() (option b from plan) rather than a navigate() wrapper, per CLAUDE.md minimal-abstraction convention — all existing setScreen() call sites unchanged"
  - "BottomSheet ported to document.body via createPortal rather than lifting each of the 6 bottom-sheet instances' open/close state up to App() — smaller, contained fix that resolves the Pitfall 3 trap for every instance at once, including two the plan's read_first list did not enumerate (LobbyFriendsWidget's 4 sheets and FriendsList's challenge sheet, both nested inside a ScreenShell .shell-main)"
  - "Removed the pre-existing body-level `padding: env(safe-area-inset-*)` (added 2026-06-09 for iPhone Dynamic Island, commit cabb6400) — it double-gutters against Plan 01's per-region inset design (.app left/right, .shell-header top, .shell-footer bottom); per-region insets are now the single source of truth"
  - "Added .shell-main:not(:has(~ .shell-footer)) bottom-inset rule for the 3 ScreenShell usages with no footer (friends, history, profile not-found/loading) so their .shell-main bottom edge still clears the home indicator"
  - "Verification ran against a fresh server on an alternate port (4101/4102) with PW_PORT-driven baseURL/webServer overrides in playwright.config.js, since port 4000 was already occupied by an unrelated/stale server returning 404 for '/'; the config edit was reverted after each run and is not part of the committed diff"

patterns-established:
  - "react-dom's createPortal (imported separately from react-dom/client, which does not export it) is the standard escape hatch for position:fixed overlays nested inside a transform-bearing ancestor"

requirements-completed: [MOBILE-06, MOBILE-07, MOBILE-12]

# Metrics
duration: ~75min
completed: 2026-06-15
---

# Phase 19 Plan 04: Screen Transitions, Keyboard Inset, Fixed-Overlay Audit & Safe-Area Pass Summary

**Native slide/push screen transitions with reduced-motion cross-fade, visualViewport-based chat-composer keyboard handling, BottomSheet ported to document.body to fix a containing-block trap on 6 overlay instances, and a body-level safe-area double-gutter fix — Task 3's end-of-phase human verification checkpoint is pending.**

## Performance

- **Duration:** ~75 min (Tasks 1-2)
- **Started:** 2026-06-15T11:20:00Z (approx, prior session)
- **Completed (Tasks 1-2):** 2026-06-15T12:36:29Z
- **Tasks:** 2/3 completed (Task 3 is a blocking human-verify checkpoint)
- **Files modified:** 2 (public/app.jsx, public/style.css)

## Accomplishments
- Forward/back navigation now plays a 220ms slide/push (cubic-bezier(.34,1.4,.4,1)), degrading to a 100ms opacity cross-fade under `prefers-reduced-motion: reduce`, across all 8 shell screens
- `useKeyboardInset` keeps `.chat-panel` visible above the on-screen keyboard via `visualViewport` resize/scroll, with graceful no-op and full listener cleanup
- Fixed-overlay audit (Pitfall 3 / T-19-07): `BottomSheet` now portals to `document.body`, resolving a containing-block trap for the Battle Powers sheet, the 4 LobbyFriendsWidget sheets (challenge, friend, auth, stake), and the FriendsList challenge sheet — none of which the plan's read_first list had enumerated beyond the Battle Powers sheet
- Fixed a pre-existing safe-area double-gutter: body-level `env(safe-area-inset-*)` padding (added pre-Phase-19 for iPhone Dynamic Island) was stacking with Plan 01's per-region `.app`/`.shell-header`/`.shell-footer` insets; removed the body-level rule and added a footer-less `.shell-main` bottom-inset fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Screen transitions — navigate() direction tracking + keyframe CSS + reduced-motion** - `f386b0f` (feat)
2. **Task 2: useKeyboardInset for chat composer + fixed-overlay placement audit + final safe-area pass** - `173e916` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `public/app.jsx` - Added prevScreenRef-based screen-direction derivation in App(); threaded `direction`/`screenKey` into Placement/Battle/FriendsList/MatchHistory/ProfileView ScreenShell instances; added `useKeyboardInset` hook and wired it to `ChatComposer`'s `.chat-panel`; converted `BottomSheet` to `createPortal(document.body)`; added `createPortal` import from `react-dom`
- `public/style.css` - Added `.shell-main.screen-enter-forward/back` + `slide-in-fwd`/`slide-in-back` keyframes (no-preference block) and a separate `cross-fade` reduced-motion rule; removed body-level `env(safe-area-inset-*)` padding; added `.shell-main:not(:has(~ .shell-footer))` bottom-inset rule

## Decisions Made
- Direction derivation via comparison (not a `navigate()` wrapper) — see key-decisions in frontmatter
- `BottomSheet` → `createPortal(document.body)` instead of lifting state for 6 call sites — see key-decisions
- Removed body-level safe-area padding in favor of per-region insets — see key-decisions
- Playwright verification run against an alternate port with a temporary (reverted) config override — see key-decisions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed-overlay audit found 5 additional Pitfall-3-violating BottomSheet instances beyond the one flagged in read_first**
- **Found during:** Task 2 (fixed-overlay placement audit)
- **Issue:** The plan's read_first explicitly flagged only the Battle Powers `<BottomSheet>` (app.jsx ~1944) as nested inside a ScreenShell `.shell-main`. The audit found `LobbyFriendsWidget` (rendered inside `Lobby`, which is inside Lobby's ScreenShell) renders 4 more BottomSheets (challenge, friend, auth, stake — originally lines ~1086-1243), and `FriendsList` (lines ~2586-2596) renders its own challenge BottomSheet inside its own ScreenShell. All 6 instances' `.bottom-sheet-overlay`/`.bottom-sheet-panel` (`position:fixed`) would be trapped by `.shell-main`'s `transform` during the ~220ms screen-enter animation.
- **Fix:** Converted the shared `BottomSheet` component to render via `createPortal(..., document.body)`. This is a single, contained change to one component (no prop/API changes) that resolves the containing-block trap for all 6 instances simultaneously, including the 5 not enumerated in read_first.
- **Files modified:** public/app.jsx (BottomSheet component + new `createPortal` import from `react-dom`)
- **Verification:** `node build-game.mjs` succeeds; full `shell-viewport.spec.js` matrix (28/28 applicable tests) and `i18n-shell-parity.test.js` (4/4) pass.
- **Committed in:** 173e916 (Task 2 commit)

**2. [Rule 1 - Bug] Safe-area insets were double-applied (body + per-region), violating MOBILE-07's "no double gutter" acceptance criterion**
- **Found during:** Task 2 (final safe-area pass)
- **Issue:** `body { padding: env(safe-area-inset-top/right/bottom/left) }` (added pre-Phase-19, commit cabb6400, for iPhone Dynamic Island) was still present alongside Plan 01's per-region insets (`.app` left/right at lines 96-97, `.shell-header` top at 318, `.shell-footer` bottom at 361) — Plan 01's own code comment claimed "left/right safe-area insets stay here to avoid double-gutter" but the body-level rule made that claim false, doubling the inset on all 4 edges where nonzero.
- **Fix:** Removed the `env(safe-area-inset-*)` portion of `body`'s padding (now `padding: 0`), making the per-region rules the single source of truth. Added `.shell-main:not(:has(~ .shell-footer)) { padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)) }` so the 3 footer-less ScreenShell usages (friends, history, profile not-found/loading) still clear the home indicator.
- **Files modified:** public/style.css (body rule, new `.shell-main` rule)
- **Verification:** `node build-game.mjs` succeeds; full Playwright matrix passes (no scroll regressions). Real-device notch/home-indicator confirmation deferred to Task 3 human verification (MOBILE-07 is manual-only per VALIDATION.md).
- **Committed in:** 173e916 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs affecting MOBILE-06/07/10/12 correctness)
**Impact on plan:** Both fixes are within Task 2's explicitly-scoped "fixed-overlay placement audit" and "final safe-area pass" actions — they extend the audit's findings beyond what read_first enumerated but do not expand scope to files outside `public/app.jsx`/`public/style.css`. No architectural changes; no new dependencies.

## Issues Encountered
- Port 4000 was already occupied by a stale/unrelated `node server.js` process returning 404 for `/` (not this worktree's `dist/`). Verification ran against a fresh server on port 4101 (Task 1) / 4102 (Task 2) using a temporary `PW_PORT`-driven override to `playwright.config.js`'s `baseURL`/`webServer.url`; the override was reverted after each run (not part of the committed diff — `git status` confirms `playwright.config.js` is clean).
- `react-dom/client` does not export `createPortal` — added a separate `import { createPortal } from "react-dom"` (react-dom is already a transitive dependency of react-dom/client; no package.json change needed, confirmed via `node -e "require('react-dom').createPortal"`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Tasks 1-2 are complete and committed (f386b0f, 173e916). **Task 3 (checkpoint:human-verify, gate="blocking") is pending** — the plan cannot be marked complete until a developer performs the 5 manual checks (transitions, real-device safe-area, keyboard, behavior-preservation regression sweep, D-07/D-01/D-06 absence) and responds "approved" or describes a regression. All automated prerequisites for Task 3 are green (28/28 Playwright shell-viewport tests, 4/4 i18n parity tests, build succeeds).

This is the final plan of Phase 19 — once Task 3 is approved, Phase 19 (mobile-native-app-shell-viewport-locked-single-screen-layout) is complete.

---
*Phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout*
*Completed: 2026-06-15 (Tasks 1-2; Task 3 pending)*

## Self-Check: PASSED

- FOUND: .planning/phases/19-mobile-native-app-shell-viewport-locked-single-screen-layout/19-04-SUMMARY.md
- FOUND: f386b0f (Task 1 commit)
- FOUND: 173e916 (Task 2 commit)
