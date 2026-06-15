# Phase 19: Mobile-Native App Shell — Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the current responsive-document layout into a mobile-native app shell. On phones, every screen fits exactly one `100dvh` viewport with no page-level scroll; navigation is by tap, overflow lives in a single scrollable region or a tap-open overlay. Desktop keeps the existing centered ~480px phone-frame look. EN/VI i18n and all current behavior preserved.

This is a **layout-structure restructure of existing screens** — NOT a visual redesign. Brand, colors, fonts, glass panels, animations, CSS tokens stay locked as-is.

</domain>

<spec_lock>
## Requirements & Design Contract (locked)

**Requirements (12) locked by ROADMAP.md** — MOBILE-01..MOBILE-12 (root viewport lock, per-screen shell regions, battle viewport fit, overlay/sheet for overflow, all 8 screens refactored, native tap transitions, safe-area insets, desktop preserved, i18n preserved, behavior preserved, no horizontal scroll, keyboard handling).

**Design contract locked by `19-UI-SPEC.md`** (APPROVED, gsd-ui-checker 2026-06-15). Downstream agents MUST read it before planning/implementing. It locks: shell regions (`.shell-header` / `.shell-main` / `.shell-footer`), per-screen shell mapping table, overlay/bottom-sheet reuse, slide transitions, copy/i18n keys, safe-area + keyboard handling, color/type/spacing tokens.

**One decision below OVERRIDES the UI-SPEC** — see D-07 (battle Log removed).

</spec_lock>

<decisions>
## Implementation Decisions

### Navigation model
- **D-01:** Keep UI-SPEC default — **no persistent bottom tab-bar.** Navigation between top-level screens (lobby/profile/history/friends) is via shell-header back-button + the existing avatar menu (Phase 9 LOBBY-10). Protects lobby one-viewport fit (saves ~56px vertical budget at 360×640).

### Rollout / sequencing
- **D-02:** **Shell-first plan structure.** Plan 1 builds the `ScreenShell` wrapper component + root `100dvh`/`overflow:hidden` viewport lock + the **battle screen** (hardest viewport-fit case) to prove the pattern early and de-risk.
- **D-03:** Remaining screens (lobby, room, placement, profile, history, friends, queue) grouped into subsequent plans after the shell pattern is proven — NOT one-plan-per-screen, NOT big-bang single pass. Planner decides exact grouping.

### Battle screen fold budget
- **D-04:** Always-visible on battle screen: board + scoreboard + turn ring. Board sized to fit per MOBILE-03 (`--cell` capped by available height via measured `.shell-main` height).
- **D-05:** Footer tap-chips on battle screen = **Powers + Chat only.**
- **D-06:** No always-visible "last shot" status line (considered, rejected — hit/miss/sunk feedback already comes from board cell coloring + scoreboard).
- **D-07:** ⚠ **OVERRIDES UI-SPEC MOBILE-04 / Overlay contract:** the **Battle Log chip and its bottom-sheet are REMOVED entirely** — the log is unused. No `📜 Log` footer chip, no log overlay on the battle screen. (Drop the `shell.logToggle` new key; existing `.log` battle-log block is not surfaced in the new shell.)

### Viewport-fit verification
- **D-08:** **Hybrid verification.** Hard gate per screen = automated no-scroll assertion (page-body `scrollHeight <= viewport height`, no horizontal scroll) run at 360×640, 390×844, 414×896 via headless browser (gstack `browse` skill available). Manual eyeball pass for visual polish/feel on top of the automated gate.

### Claude's Discretion
- Exact plan grouping of the 7 non-battle screens (within D-02/D-03 shell-first constraint).
- `--main-h` measurement mechanism (JS measure vs `ResizeObserver`) — technical, planner/executor choice per UI-SPEC note.
- Single-CSS-class transition implementation details (UI-SPEC already specifies the approach).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & design
- `.planning/phases/19-mobile-native-app-shell-viewport-locked-single-screen-layout/19-UI-SPEC.md` — LOCKED design contract (shell regions, per-screen mapping, overlay/transition/safe-area/keyboard rules, tokens). Read FIRST. Note D-07 overrides its battle-Log overlay.
- `.planning/ROADMAP.md` §"Phase 19" — MOBILE-01..12 requirements + goal.

### Codebase
- `public/app.jsx` — single monolithic JSX (all screens, i18n EN/VI, bot AI); where `ScreenShell` wrapper + per-screen refactors land.
- `public/style.css` — hand-authored CSS token system (`:root`), existing `.bottom-sheet-overlay`/`.bottom-sheet-panel` (≈260-277), `.app` frame, reduced-motion block (≈489-493), mobile breakpoints (560/380/320px).
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md` — file layout + JS/JSX conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BottomSheet` component + `.bottom-sheet-overlay`/`.bottom-sheet-panel` (Phase 9 lobby) — reuse verbatim for the battle Powers sheet; no new overlay CSS.
- Existing `.topbar` (lobby), `.room-banner`, `.scoreboard`, `.history-header`/`.friends-header`, `.profile-actions`, `.chat-panel`/`.chat-toggle` — map into shell regions per UI-SPEC table; mostly content moves, not rewrites.
- `history.back` i18n key (`← Back` / `← Quay lại`, app.jsx:72/264) — extend to all shell headers (UI-SPEC copy contract).
- Existing `confirmLeave` / `leave.*` modal flow — back-button on room/placement/battle routes through it (no silent screen pop).

### Established Patterns
- CSS custom properties as design tokens; no Tailwind/shadcn (CLAUDE.md "extend, don't rewrite").
- Server-authoritative; this phase is client-only (`app.jsx` + `style.css`) — no server changes expected.
- `--cell` board-sizing formula already exists; extend to cap by measured main height.

### Integration Points
- `setScreen(...)` state drives navigation — wrap shell-main in a single transition class toggle (no router lib).
- `window.visualViewport.resize` listener for chat-composer keyboard handling (MOBILE-12).

</code_context>

<specifics>
## Specific Ideas

- Battle screen must feel like an installed native app: max board size, minimal chrome — driving the Log removal (D-07) and chip-only footer (D-05).
- Verification must be repeatable enough to catch a one-screen regression — hence the automated no-scroll hard gate (D-08).

</specifics>

<deferred>
## Deferred Ideas

- **Bottom tab-bar navigation** — considered (D-01), rejected for this phase to protect lobby fit. If wanted later, scope explicitly with a re-verified one-viewport budget (UI-SPEC Open Question 1).
- **Surfacing the battle log differently** (e.g. in match history detail) — out of scope; log simply removed from the battle shell here.

</deferred>

---

*Phase: 19-mobile-native-app-shell-viewport-locked-single-screen-layout*
*Context gathered: 2026-06-15*
