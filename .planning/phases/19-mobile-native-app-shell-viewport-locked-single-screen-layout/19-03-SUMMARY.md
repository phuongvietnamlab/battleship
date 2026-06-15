---
phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
plan: 03
subsystem: ui
tags: [react, jsx, css, intersection-observer, mobile-shell, i18n]

requires:
  - phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
    provides: ScreenShell wrapper + useMainHeight hook + root 100dvh/overflow:hidden viewport lock (Plan 01); SHELL_HEADER_SCREENS pattern + history.back canonical header (Plan 02)
provides:
  - Profile, friends, and match-history screens refactored onto ScreenShell (header/main/footer regions)
  - ScreenShell mainRef callback prop forwarding the .shell-main DOM node to children
  - MatchHistory infinite-scroll IntersectionObserver root fixed to .shell-main (MOBILE-10)
affects: [19-04]

tech-stack:
  added: []
  patterns:
    - "ScreenShell mainRef callback prop: ({ mainRef }) forwards the .shell-main DOM node to children needing scroll-container-relative APIs (IntersectionObserver root, etc.)"
    - "Profile header title is data-driven (viewed player's display name) instead of a static 'Profile' i18n string — avoids adding a new i18n key while showing whose profile is open"

key-files:
  created: []
  modified:
    - public/app.jsx

key-decisions:
  - "ProfileView's notFound/loading/main render branches all wrap in ScreenShell with the same header (back button + display name when available) for layout consistency across all profile states"
  - "Profile shell-header title uses data.displayName (the viewed player's name) rather than a new 'profile.title' i18n key — UI-SPEC calls for 'Profile' but the plan explicitly forbids new i18n keys and no existing 'Profile' string exists; the player's name is arguably more useful as a header title"
  - "MatchHistory's back button changed from a bare literal '←' to {t('history.back')} to match the canonical shell-header pattern (MOBILE-09, no untranslated strings)"
  - "ScreenShell's mainRef is an optional callback prop (not forwardRef) — keeps ScreenShell's primary API (header/footer/children/screenKey/direction) unchanged for the 6 other screens that don't need it"

patterns-established:
  - "IntersectionObserver root fix: store the ScreenShell-forwarded .shell-main node in component state (not just a ref) so the observer effect re-runs once the node attaches on first render"

requirements-completed: [MOBILE-02, MOBILE-05, MOBILE-08, MOBILE-09, MOBILE-10, MOBILE-11]

duration: ~35min
completed: 2026-06-15
---

# Phase 19 Plan 03: List/Profile Screen Group onto ScreenShell Summary

**Profile, match history, and friends screens refactored onto ScreenShell (header/main/footer regions), with the Phase 13 infinite-scroll IntersectionObserver's root fixed to target `.shell-main` instead of the document viewport.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files modified:** 1 (`public/app.jsx`)

## Accomplishments
- `ProfileView` (all three render branches: notFound, loading skeleton, and the full profile) now renders inside `<ScreenShell header={...} footer={...} screenKey="profile">` — header shows a back button + the viewed player's display name, footer carries the existing `.profile-actions` button row relocated verbatim.
- `FriendsList` renders inside `<ScreenShell header={...} screenKey="friends">` — the `.friends-header` content (back button + "👥 Friends (N)") moves to the shell header; search input + friend-status sections scroll inside `.shell-main`.
- `MatchHistory` renders inside `<ScreenShell header={...} screenKey="history" mainRef={setMainEl}>` — `.history-header` content moves to the shell header (back button now `{t('history.back')}`), `.history-list` scrolls inside `.shell-main`.
- `ScreenShell` gained an optional `mainRef` callback prop that forwards the `.shell-main` DOM node to children, without changing its existing API for the other 6 screens.
- The infinite-scroll `IntersectionObserver` (Phase 13, MOBILE-10) now passes `root: mainEl` — the `.shell-main` scroll container — instead of defaulting to the document viewport, with a null-guard so the effect re-runs once `ScreenShell` attaches the node on first render.
- `node build-game.mjs` succeeds; full Playwright suite (28 applicable tests across mobile-360/390/414 + desktop phone-frame) passes, including "no page scroll" for profile, history, and friends at all three mobile sizes; i18n shell-parity vitest suite (4 tests) passes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Profile + Friends screens onto ScreenShell** - `1470470` (feat)
2. **Task 2: Match History onto ScreenShell + IntersectionObserver root fix** - `15e5198` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `public/app.jsx`:
  - `ScreenShell` — added optional `mainRef` callback prop (forwards `.shell-main` DOM node via an internal `setRefs` wrapper that still drives `useMainHeight`)
  - `ProfileView` — extracted `.profile-actions` into a `profileActions` JSX variable used as the `footer` prop; built a shared `profileHeader` (back button + `data.displayName` when loaded); wrapped all three render branches (`notFound`, `loading`, main) in `<ScreenShell header={profileHeader} footer={profileActions} screenKey="profile">`
  - `FriendsList` — extracted `.friends-header` content into a `friendsHeader` JSX variable (back button without literal arrow + title), wrapped render in `<ScreenShell header={friendsHeader} screenKey="friends">`
  - `MatchHistory` — added `mainEl` state set via `ScreenShell`'s `mainRef`; extracted `.history-header` content into `historyHeader` (back button now `{t("history.back")}`); wrapped `.history-list` + empty state in `<ScreenShell header={historyHeader} screenKey="history" mainRef={setMainEl}>`; `IntersectionObserver` now constructed with `{ root: mainEl, threshold: 0.1 }` and guarded on `!mainEl`

## Decisions Made
- Profile shell-header title is the viewed player's `displayName` (data-driven) rather than a new "Profile" i18n string — satisfies "no new i18n keys" while giving the header a meaningful title; falls back to no title (back button only) while loading/notFound since `data` is null in those states.
- `ScreenShell.mainRef` implemented as an optional callback prop rather than `React.forwardRef`, per the plan's preference for "the cleanest approach that does not change ScreenShell's public API broadly" — the other 6 screen call sites are unaffected.
- `MatchHistory`'s back button changed from a bare `←` glyph to `{t("history.back")}` (which already renders as "← Back" / "← Quay lại") to match the canonical shell-header back-button pattern established in Plans 01/02 and satisfy MOBILE-09 (no untranslated UI strings).

## Deviations from Plan

None beyond the documented i18n-title decision above (which is a direct application of the plan's own "no new i18n keys" constraint, not a correctness fix). No Rule 1-4 auto-fixes were needed — both ProfileView and FriendsList built and passed verification on the first pass.

## Issues Encountered
- The Playwright `webServer` requires `SESSION_SECRET` + reachable Postgres env vars to boot (same pre-existing project-wide requirement documented in 19-01-SUMMARY.md). Used `SESSION_SECRET=test-secret-for-verification PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres` for the verification run only; no project files changed to work around this.
- `.history-view`, `.history-header`, and `.friends-header` CSS classes in `public/style.css` are now unused dead rules (their content moved into `.shell-header`/inline JSX). Left in place per "keep changes minimal" — same precedent as Plan 02 leaving `.lobby`'s standalone glass-panel chrome in place. Flagged here for a future cleanup pass if desired; does not affect rendering or the no-page-scroll gate.

## Known Stubs
None — no new stubs introduced. All three screens render real data-driven content (profile stats, friend lists, match history) as before; only the layout container changed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Profile, history, and friends screens follow the same ScreenShell pattern as battle/lobby/queue/room/placement (Plans 01-02), leaving only the remaining screen(s) for Plan 04.
- `ScreenShell`'s new `mainRef` callback prop is reusable by Plan 04 if any other screen needs the `.shell-main` scroll-container node.
- No blockers.

---
*Phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout*
*Completed: 2026-06-15*

## Self-Check: PASSED

All claimed files found on disk; all commit hashes (1470470, 15e5198, 0c59cbb) found in git log.
