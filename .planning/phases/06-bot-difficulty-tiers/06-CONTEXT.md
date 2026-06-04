# Phase 6: Bot Difficulty Tiers - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Single-player bot gets four selectable difficulty tiers (easy / medium / hard / insane), each a **distinct client-side targeting algorithm** producing observably different win rates. All bot AI runs client-side in `public/app.jsx` — no server room, no network round-trips. Requirement: **BOT-01**.

Scope anchor: this phase changes *how the bot targets* and *how the player picks a tier*. It does NOT touch server game logic, persistence, accounts, or multiplayer. Existing single-player behavior must remain reachable unchanged (regression guard, SC#3).

</domain>

<decisions>
## Implementation Decisions

### Tier → algorithm mapping
- **D-01:** Current bot (`botPick`/`botShoot`, `app.jsx:2115-2161`) = **checkerboard-parity search + hunt-after-hit neighbor queue**. This becomes the **Medium** tier verbatim — it is the no-regression anchor for SC#3.
- **D-02:** Four tiers, distinct algorithms:
  - **Easy** — pure random fire among unshot cells. No parity, no hunt-after-hit (strictly dumber than current).
  - **Medium** — existing parity + hunt-after-hit (unchanged behavior).
  - **Hard** — probability-density targeting (compute hit-probability heatmap per cell from remaining-fleet placements; fire highest-density cell). *Research flag — brief spike on the density algorithm before implementation.*
  - **Insane** — near-optimal: probability-density with stronger priors (e.g. parity-constrained density, smarter post-hit ship-orientation inference).

### Insane fairness
- **D-03:** Insane stays **honest** — pure probability-density, **never reads the player's actual ship cells**. No cheating/peeking. Strength comes from better priors, not information leaks. Locks the anti-pattern boundary: a bot that peeks feels unfair and is forbidden.

### Selector UX
- **D-04:** Replace lobby single "Play vs Bot" button with an **inline 4-button tier row** (Easy/Medium/Hard/Insane). One tap selects tier + starts placement.
- **D-05:** **Remember last-picked tier in localStorage**; default to **Medium** on first visit / no stored value.
- **D-06:** EN/VI i18n required for all four tier labels (and any helper text) — follow existing `t()` string convention in `app.jsx`.

### Mode scope
- **D-07:** Tiers apply to **classic single-player only**. Any advance/power-up bot path keeps current behavior unchanged. Difficulty algorithms do not need to reason about mines/abilities this phase.

### Claude's Discretion
- Code organization: whether to extract the four targeting algorithms into a separate module vs keep inline in `app.jsx` (monolith is the established convention — see CONVENTIONS.md; extraction optional, not required).
- Per-tier move pacing (current 600ms `setTimeout` delay) — keep or tune per tier; density compute is trivial on 11×11 so no perf concern.
- Exact heatmap/priors formulation for Hard vs Insane, pending the research spike.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/ROADMAP.md` — Phase 6 section: 3 success criteria + research flag (probability-density spike for Hard tier).
- `.planning/REQUIREMENTS.md` — **BOT-01** (the sole requirement): four tiers, each a distinct targeting algorithm.

### Existing bot implementation (the anchor + integration point)
- `public/app.jsx:2115-2161` — `botPick()` (parity + queue) and `botShoot()` (hunt-after-hit, sink detection). This IS the Medium tier; Easy/Hard/Insane branch off here.
- `public/app.jsx:2100-2110` — `startBot()` reset path; tier selection wires in here.
- `public/app.jsx:734-794` — `Lobby` component + `onBot` handler; the 4-button tier row replaces the current single button here.
- `public/app.jsx:2065` — `genFleet()` (bot fleet generation), reusable for density priors.

No external ADRs/specs — requirements fully captured in decisions above + ROADMAP/REQUIREMENTS.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `botPick`/`botShoot` (`app.jsx:2115-2161`): becomes Medium verbatim; other tiers are alternate `botPick` strategies sharing the same `botShoot` resolution/queue plumbing.
- `botShotsRef` (shots fired), `botQueueRef` (hunt target queue), `myShipsRef` (player fleet for hit detection): per-game refs the new algorithms read/write.
- `genFleet()` (`app.jsx:2065`): fleet/placement generator — useful for computing density priors over legal remaining-ship placements.
- `t()` i18n helper + EN/VI string blocks (`app.jsx` ~line 25 / ~line 156): pattern for new tier labels.

### Established Patterns
- Monolithic `public/app.jsx` SPA — all screens, i18n, bot AI inline (CONVENTIONS.md). New tier logic follows this unless extraction is clearly cleaner.
- Bot uses `setTimeout(botShoot, 600)` pacing and React state setters for board updates — preserve this loop shape across tiers.
- `FLEET_DEF` / `BOARD` constants drive grid + fleet sizes (11×11, ships [5,4,3,3,2]) — density math reads these.

### Integration Points
- Lobby `onBot` → `startBot(tier)`: selected tier threads from button into the bot game state.
- A `botTier` ref/state holds the active tier; `botPick()` dispatches on it.
- localStorage read/write for remembered tier (mirror existing localStorage usage for clientId/lang).

</code_context>

<specifics>
## Specific Ideas

- Win rates must be *observably* different across tiers (SC#2) — Easy clearly losable, Insane clearly punishing-but-fair.
- Insane "stronger priors" candidates: parity-constrained density + post-hit orientation inference (lock ship axis after 2 in-line hits) — exact form deferred to research spike.

</specifics>

<deferred>
## Deferred Ideas

- Difficulty tiers for advance/power-up bot mode (mine/ability targeting strategy) — out of scope this phase (D-07); revisit if power-up single-player gets attention.
- Adaptive/dynamic difficulty (bot scales to player skill) — new capability, not in BOT-01; future idea.

None blocking — discussion stayed within phase scope.

</deferred>

---

*Phase: 6-bot-difficulty-tiers*
*Context gathered: 2026-06-04*
