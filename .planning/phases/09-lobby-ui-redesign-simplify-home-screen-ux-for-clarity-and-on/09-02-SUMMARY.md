# Phase 09 — Plan 02 Summary

## What was done

(Merged into Plan 01 execution — all Plan 02 tasks implemented in the same commit)

- Auth UI moved out of lobby into dedicated BottomSheet (opens via "Sign in" link in footer)
- First-time onboarding pulse animation on hero CTA + hint text ("Bấm vào đây để bắt đầu chơi!")
- Onboarding state persisted in localStorage (`lobby_onboarded`) — shown once only
- `dismissOnboarding()` called on any lobby interaction
- Old `.mode-opt` / `.bot-tier-row` CSS completely removed
- Accessibility: `aria-label` on lobby cards, `role="dialog"` + `aria-modal` on BottomSheet, `role="radiogroup"` + `aria-checked` on mode toggle, Escape key closes sheets, focus management

## Files changed

- `public/app.jsx` — Auth bottom sheet, onboarding state, dismissOnboarding, aria attributes
- `public/style.css` — `.onboarding-pulse` keyframes, `.onboarding-hint`, cleaned old selectors in media queries

## Verification

- Build passes
- No CSS or JSX diagnostics
- Commit: `be3ad66` (combined with Plan 01)
