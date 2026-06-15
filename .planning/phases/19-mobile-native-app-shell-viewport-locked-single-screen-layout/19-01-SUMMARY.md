---
phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout
plan: 01
subsystem: ui
tags: [react, css, playwright, vitest, i18n, mobile-shell, responsive]

# Dependency graph
requires: []
provides:
  - ScreenShell component (header/main/footer regions) + useMainHeight ResizeObserver hook
  - Root 100dvh/overflow:hidden viewport lock + .shell-header/.shell-main/.shell-footer CSS
  - --cell height-cap formula consuming --main-h
  - Battle screen refactored onto ScreenShell (Powers bottom-sheet, Log removed per D-07)
  - shell.powersToggle / shell.about / common.ok EN+VI i18n keys
  - Footer-note relocated into AvatarMenu "About" modal
  - Dev-only ?screen=<name> query-param hook in App()
  - Wave 0 Playwright harness (4 viewport projects) + i18n shell.* parity test
affects: [19-02, 19-03, 19-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ScreenShell wrapper ({ header, footer, children }) for per-screen layout — reused by remaining Phase 19 plans"
    - "useMainHeight ResizeObserver writes --main-h CSS var consumed by --cell height-cap"
    - "Dev-only ?screen= query param for Playwright navigation to static screens (App() lazy state init)"
    - "Powers bottom-sheet pattern: footer chip toggles useState -> BottomSheet renders existing PowerBar"

key-files:
  created:
    - playwright.config.js
    - test/e2e/shell-viewport.spec.js
    - test/i18n-shell-parity.test.js
  modified:
    - public/style.css
    - public/app.jsx
    - .gitignore

key-decisions:
  - "Battle's shell-footer carries only the Powers chip (conditional on usable inventory); the existing roombar chat-toggle (D-05, !vsBot-guarded) stays in place outside ScreenShell per Pitfall 3 — no duplication"
  - "AvatarMenu owns its own aboutOpen state and renders the About modal independent of the menu's open/closed guard, so the modal survives menu auto-close"
  - "Added common.ok (EN/VI) for the About modal's dismiss button rather than using a non-i18n fallback string"
  - "Fixed pre-existing Wave-0 Playwright spec bugs found while running this plan's verification: test.skip(fn) is describe-scope only (switched to test.info().project.name boolean form), and the bot-mode tap-flow selector targeted non-existent 'Play vs Bot' text (actual aria-label is 'Bot - Practice')"

patterns-established:
  - "ScreenShell + useMainHeight: all subsequent Phase 19 screen refactors (19-02..19-04) wrap their render in <ScreenShell header={...} footer={...}>"

requirements-completed: [MOBILE-01, MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-08, MOBILE-09, MOBILE-11]

# Metrics
duration: ~45min
completed: 2026-06-15
---

# Phase 19 Plan 01: Mobile App Shell Foundation + Battle Screen Refactor Summary

**ScreenShell/useMainHeight viewport-lock shell proven on the Battle screen — scoreboard as header, boards as scrollable main, Powers moved to a footer-chip BottomSheet, Log block removed (D-07), and the SEO footer note relocated into an AvatarMenu "About" modal.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-06-15T07:13:19Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Wave 0 automated harness: Playwright config (4 viewport projects: 360x640, 390x844, 414x896, 1280x800 desktop) + shell-viewport spec asserting the D-08 no-scroll/no-horizontal-scroll gate across all 8 screens, plus an i18n `shell.*` EN/VI parity test
- Root viewport lock (`100dvh`/`overflow:hidden` on html/body/.app) + `.shell-header`/`.shell-main`/`.shell-footer` flex regions + `--cell` height-cap term wired to `--main-h`
- `ScreenShell` component + `useMainHeight` ResizeObserver hook added to app.jsx, and the Battle screen fully refactored onto it — proving the pattern on the hardest viewport-fit case before the remaining 7 screens
- Powers moved from inline `PowerBar` to a footer chip + `BottomSheet`; `.log` block deleted entirely (D-07); footer-note relocated to AvatarMenu "About" modal; dev-only `?screen=` hook added for Playwright navigation

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test harness — Playwright config + shell-viewport spec + i18n parity test** - `d50cbe6` (test)
2. **Task 2: Root viewport lock + shell region CSS + --cell height-cap** - `6607abf` (feat)
3. **Task 3: ScreenShell + useMainHeight + Battle screen refactor + footer-note relocation + ?screen= hook** - `556e3cd` (feat)

**Plan metadata:** (pending — written after this commit)

## Files Created/Modified
- `playwright.config.js` - 4 viewport projects (mobile-360/390/414, desktop), webServer boots `node server.js`
- `test/e2e/shell-viewport.spec.js` - per-screen x per-viewport no-scroll gate, battle viewport-fit, desktop phone-frame checks
- `test/i18n-shell-parity.test.js` - asserts I18N.en/I18N.vi `shell.*` key sets match exactly and `shell.logToggle` does not exist (D-07)
- `public/style.css` - root `100dvh`/`overflow:hidden` lock, `.app` flex column, `.shell-header`/`.shell-main`/`.shell-footer` regions, `--cell` height-cap term using `var(--main-h, 100vh)`
- `public/app.jsx` - `useMainHeight` hook, `ScreenShell` component, Battle screen refactor (header/footer/children via ScreenShell, Powers BottomSheet, `.log` removed), `shell.powersToggle`/`shell.about`/`common.ok` i18n keys (EN+VI), AvatarMenu "About" modal replacing page-bottom `.footer-note`, dev-only `?screen=` hook in `App()`
- `.gitignore` - added `test-results/` and `playwright-report/` (Playwright generated output)

## Decisions Made
- Battle's new `.shell-footer` carries only the Powers chip; the chat toggle (D-05) remains in the existing `.roombar` outside `ScreenShell`, unchanged — avoids duplicating chat UI and respects Pitfall 3 (overlays stay direct children of `.app`)
- `AvatarMenu` manages its own `aboutOpen` state so the About modal can stay open after the menu itself closes (menu close and modal open are independent)
- Added `common.ok` i18n key (EN "OK" / VI "OK") for the About modal's dismiss button instead of a raw string fallback, keeping with the project's "no free-text" i18n convention

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Playwright `test.skip()` function-form misuse in Wave 0 spec**
- **Found during:** Task 3 overall-verification run (`npx playwright test -g "battle viewport fit"`)
- **Issue:** `test.skip(({ project }) => project.name === "desktop", "...")` called inside a test body throws `Error: test.skip() with a function can only be called inside describe block` in Playwright 1.60 — this form is only valid at describe-scope, not inside an individual test callback
- **Fix:** Replaced all four occurrences with the boolean form `test.skip(test.info().project.name === "desktop", "...")` (and `!== "desktop"` for the desktop-only check), which is valid inside a test body
- **Files modified:** test/e2e/shell-viewport.spec.js
- **Verification:** `npx playwright test` — 28 passed, 12 skipped (correct per-project skip behavior), 0 failed
- **Committed in:** 556e3cd (Task 3 commit)

**2. [Rule 1 - Bug] Fixed lobby bot-mode selector targeting non-existent text**
- **Found during:** Same overall-verification run
- **Issue:** The battle/bot tap-flow tests used `page.getByRole("button", { name: /Play vs Bot/i })`, but the actual lobby "Bot" card's `aria-label` is `"Bot - Practice"` (composed from `lobby.botCard` + `lobby.botCardSub`) — no element ever matched, causing a 30s timeout
- **Fix:** Changed the selector to `page.getByRole("button", { name: /Bot - Practice/i })` in both affected tests
- **Files modified:** test/e2e/shell-viewport.spec.js
- **Verification:** `npx playwright test -g "battle viewport fit"` — 6 passed, 2 skipped (desktop), 0 failed
- **Committed in:** 556e3cd (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs in the Wave 0 Playwright spec written in Task 1, surfaced only once Task 3 made the harness runnable end-to-end)
**Impact on plan:** Both fixes were necessary for the plan's own verification gate to pass; no scope creep — fixes confined to test/e2e/shell-viewport.spec.js.

## Issues Encountered
- The Playwright `webServer` (`node server.js`) requires `SESSION_SECRET` and a reachable Postgres (`DATABASE_URL` or `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`) to boot — this is a pre-existing project-wide hard dependency (db.js, "Postgres is a HARD dependency"), unrelated to Phase 19. A local Postgres instance was already running on the sandbox (port 5432, `postgres`/`postgres`); migrations were applied and `SESSION_SECRET`/`PG*` env vars were exported for the verification run only. No project files were changed to work around this — documented here for the next plan's executor in case the env vars are not pre-set in their shell.

## User Setup Required
None - no external service configuration required beyond the pre-existing Postgres + SESSION_SECRET requirements (already satisfied in this environment).

## Next Phase Readiness
- `ScreenShell`, `useMainHeight`, the shell CSS regions, and the Playwright harness are proven on the Battle screen (the hardest viewport-fit case) and ready for reuse by Plans 02-04 across the remaining 7 screens
- i18n parity test (`test/i18n-shell-parity.test.js`) will continue to gate future `shell.*` key additions
- No blockers identified

---
*Phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout*
*Completed: 2026-06-15*

## Self-Check: PASSED

All created/modified files found on disk; all task commits (d50cbe6, 6607abf, 556e3cd) found in git log.
