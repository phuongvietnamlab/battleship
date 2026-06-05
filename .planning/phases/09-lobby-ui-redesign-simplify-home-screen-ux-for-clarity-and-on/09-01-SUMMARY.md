# Phase 09 — Plan 01 Summary

## What was done

- Created reusable `BottomSheet` component with slide-up animation, backdrop overlay, Escape key close, and focus management
- Restructured `Lobby` from 10+ inline buttons to: 1 hero CTA ("Quick Play") + 2 secondary cards (Bot / Friends)
- Bot difficulty selection moved into BottomSheet with tier descriptions
- Room create/join moved into Friends BottomSheet
- Mode toggle converted from large cards to compact segmented control
- Wager section converted to inline strip (only shown for logged-in users)
- Added all new CSS: `.hero-cta`, `.lobby-cards`, `.lobby-card`, `.mode-toggle-compact`, `.wager-strip`, `.chip`, `.bottom-sheet-*`, `.sheet-option`
- Added i18n keys for both EN and VI (lobby.quickPlay, lobby.botCard, lobby.friendCard, bot.*Desc, etc.)
- Removed old `.bot-tier-row`, `.mode-pick`, `.mode-opt` CSS rules

## Files changed

- `public/app.jsx` — BottomSheet component + Lobby restructure + i18n keys
- `public/style.css` — New lobby layout CSS, removed old mode-opt/bot-tier-row styles

## Verification

- `node build-game.mjs` → builds successfully
- No diagnostics errors in app.jsx or style.css
- Commit: `be3ad66`
