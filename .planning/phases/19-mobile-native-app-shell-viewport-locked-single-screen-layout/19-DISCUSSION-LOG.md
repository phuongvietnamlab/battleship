# Phase 19: Mobile-Native App Shell — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 19-mobile-native-app-shell-viewport-locked-single-screen-layout
**Areas discussed:** Navigation model, Rollout / sequencing, Battle fold budget, Viewport-fit verification

> Note: UI-SPEC.md (APPROVED) pre-locked most of this phase. Discussion focused only on the still-open decisions.

---

## Navigation model

| Option | Description | Selected |
|--------|-------------|----------|
| Keep UI-SPEC default | No tab bar; back-button + avatar menu nav. Protects lobby fit. | ✓ |
| Add bottom tab bar | Persistent native tab bar; risks breaking lobby 360×640 fit. | |
| Tab bar, lobby only | Tab bar on top-level screens, hidden in-game. | |

**User's choice:** Keep UI-SPEC default
**Notes:** No persistent tab bar; protects lobby one-viewport budget.

---

## Rollout / sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Shell-first, then screens | Plan 1 = ScreenShell + viewport lock + battle (hardest); group rest after. | ✓ |
| Screen-by-screen | One plan per screen (8 plans); more overhead. | |
| Big-bang single pass | Shell + all screens in one plan; any regression blocks whole plan. | |

**User's choice:** Shell-first, then screens
**Notes:** Battle proves the pattern early to de-risk the viewport-fit hard case.

---

## Battle fold budget

| Option | Description | Selected |
|--------|-------------|----------|
| Keep UI-SPEC default | Board+scoreboard+turn ring visible; Powers/Log/Chat as chips. | |
| Pin power-ups | Power bar always visible; costs board height. | |
| Pin a last-action line | Default sheets + always-visible last-shot status line. | ~ (base) |

**User's choice:** Option 3 base, but with two modifications: (1) DROP the "last shot" line — not needed; (2) REMOVE the Log section/chip entirely from the battle screen — it is unused.
**Notes:** Net result = always-visible board+scoreboard+turn ring; footer chips Powers + Chat only; no Log overlay at all. This OVERRIDES UI-SPEC MOBILE-04's battle-Log overlay. Hit/miss/sunk feedback covered by board cell coloring + scoreboard.

---

## Viewport-fit verification

| Option | Description | Selected |
|--------|-------------|----------|
| Automated screenshots | Headless harness asserts no-scroll + captures shots at 3 sizes. | |
| Manual eyeball | Resize devtools, visually confirm per screen. | |
| Hybrid | Automated `scrollHeight <= viewport` hard gate + manual visual polish. | ✓ |

**User's choice:** Hybrid
**Notes:** Automated no-scroll assertion at 360×640 / 390×844 / 414×896 (gstack browse) as hard gate; manual eyeball for polish.

## Claude's Discretion

- Exact grouping of the 7 non-battle screens into plans (within shell-first constraint).
- `--main-h` measurement mechanism (JS vs ResizeObserver).
- Transition CSS-class implementation details.

## Deferred Ideas

- Bottom tab-bar navigation — rejected here; re-scope later with re-verified lobby budget.
- Surfacing the battle log elsewhere (e.g. match-history detail) — out of scope; log removed from battle shell.
