---
phase: 19
slug: mobile-native-app-shell-viewport-locked-single-screen-layout
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 19-RESEARCH.md "Validation Architecture". Planner fills the Per-Task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (existing unit/server) + Playwright 1.60.0 (installed, no e2e dir yet) |
| **Config file** | `vitest.config.js` (exists); `playwright.config.js` — none yet, Wave 0 creates |
| **Quick run command** | `npx playwright test test/e2e/shell-viewport.spec.js -g "@smoke"` (once created) |
| **Full suite command** | `npx playwright test test/e2e/` |
| **Estimated runtime** | ~30–60 seconds (8 screens × 3 viewports) |

---

## Sampling Rate

- **After every task commit:** Run the single-screen Playwright spec for the screen touched (e.g. `npx playwright test -g "battle"`).
- **After every plan wave:** Run `npx playwright test test/e2e/shell-viewport.spec.js` (full 3-viewport × 8-screen matrix).
- **Before `/gsd-verify-work`:** Full Playwright shell-viewport suite green + manual eyeball pass (D-08 hybrid).
- **Max feedback latency:** ~60 seconds.

---

## Per-Task Verification Map

> Wave 0 harness (`playwright.config.js`, `test/e2e/shell-viewport.spec.js`, `test/i18n-shell-parity.test.js`) is created in Plan 19-01. The per-screen rows below are covered by the parametrized `shell-viewport.spec.js` run after the screen's plan lands.

| Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01 | 1 | MOBILE-01 | smoke | `npx playwright test -g "no page scroll"` | ❌ W0 (Plan 01) | ⬜ pending |
| 19-01 | 1 | MOBILE-03 | smoke | `npx playwright test -g "battle viewport fit"` | ❌ W0 (Plan 01) | ⬜ pending |
| 19-02 / 19-03 | 2,3 | MOBILE-05 | smoke | `npx playwright test test/e2e/shell-viewport.spec.js` | ❌ W0 (Plan 01) | ⬜ pending |
| 19-01 / 19-02 / 19-03 | 1,2,3 | MOBILE-08 | smoke | `npx playwright test -g "desktop phone frame"` | ❌ W0 (Plan 01) | ⬜ pending |
| 19-01 / 19-02 / 19-03 | 1,2,3 | MOBILE-11 | smoke | included in shell-viewport.spec.js | ❌ W0 (Plan 01) | ⬜ pending |
| 19-01 / 19-02 / 19-03 | 1,2,3 | MOBILE-09 | unit | `npx vitest run test/i18n-shell-parity.test.js` (I18N en/vi `shell.*` key parity) | ❌ W0 (Plan 01) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `playwright.config.js` — viewport presets 360×640, 390×844, 414×896 + desktop 1280×800 (MOBILE-08); baseURL `http://localhost:4000`.
- [ ] `test/e2e/shell-viewport.spec.js` — per screen × viewport assert `documentElement.scrollHeight <= innerHeight` (≤1px tolerance) AND `scrollWidth <= innerWidth` (no horizontal scroll, MOBILE-11).
- [ ] Screen-driving strategy: decide `?screen=` dev-only test hook vs real-tap navigation (planner decides; affects spec effort).
- [ ] i18n parity script — assert `Object.keys(I18N.en.shell||{})` matches `Object.keys(I18N.vi.shell||{})` (MOBILE-09).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Overlay/bottom-sheet open/close feel | MOBILE-04 | Visual polish | Open Powers sheet on battle, confirm slide + dismiss |
| Native slide/push transition + reduced-motion | MOBILE-06 | Visual/animation | Navigate between screens; toggle `prefers-reduced-motion`, confirm transition disabled |
| Safe-area insets on real device | MOBILE-07 | Needs notch/home-indicator hardware | Load on iPhone + Android, confirm header/footer clear notch + system bars |
| Existing behavior preserved (reconnect, chat bubbles, modals, install banner) | MOBILE-10 | Cross-flow regression | Run a full match incl. reconnect within new shell |
| Keyboard-open chat composer | MOBILE-12 | visualViewport arithmetic needs real keyboard | Open chat composer on device, confirm input stays visible above keyboard |
| Shell regions only main scrolls | MOBILE-02 | Visual | Overflow content scrolls in `.shell-main` only, header/footer fixed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
