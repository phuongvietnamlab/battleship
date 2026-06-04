# Phase 6: Bot Difficulty Tiers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 6-bot-difficulty-tiers
**Areas discussed:** Selector UX, Tier→current mapping, Insane fairness, Mode scope

---

## Selector UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline tier row + remember | Replace lobby 'Play vs Bot' with 4-button row; remember last pick in localStorage, default Medium; one tap to start | ✓ |
| Modal picker | Keep single button; click opens modal to choose tier then start | |
| Segmented + start | Segmented control + separate Start button | |

**User's choice:** Inline tier row + remember
**Notes:** Default Medium on first visit; EN/VI labels required.

---

## Tier→current mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Medium = current | Current parity+hunt becomes Medium; Easy=random, Hard=density, Insane=near-optimal | ✓ |
| Hard = current | Current becomes Hard; compresses top end | |

**User's choice:** Medium = current
**Notes:** Existing `botPick`/`botShoot` is the no-regression anchor (SC#3).

---

## Insane fairness

| Option | Description | Selected |
|--------|-------------|----------|
| Honest probability | Pure probability-density; never reads player ship cells; fair | ✓ |
| Slight cheat | ~15% shots peek at a real ship cell; brutal but risks unfair perception | |

**User's choice:** Honest probability
**Notes:** Strength from better priors, not info leaks. Cheating bot forbidden.

---

## Mode scope

| Option | Description | Selected |
|--------|-------------|----------|
| Classic only | Tiers affect classic single-player targeting only; advance/power-up bot unchanged | ✓ |
| Classic + advance | Tiers also drive mine/ability use in advance mode | |

**User's choice:** Classic only
**Notes:** Smaller, safer scope; no targeting↔ability interaction this phase.

---

## Claude's Discretion

- Code organization (extract bot algorithms to a module vs keep inline in `app.jsx`).
- Per-tier move pacing (keep/tune the 600ms delay).
- Exact heatmap/priors formulation for Hard vs Insane, pending research spike.

## Deferred Ideas

- Difficulty tiers for advance/power-up bot mode — future.
- Adaptive/dynamic difficulty scaling to player skill — not in BOT-01; future.
