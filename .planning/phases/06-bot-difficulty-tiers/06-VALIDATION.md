---
phase: 6
slug: bot-difficulty-tiers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (per RESEARCH.md — pure-JS headless harness, no DOM/React) |
| **Config file** | none — Wave 0 installs vitest + adds `test` script |
| **Quick run command** | `npx vitest run test/bot.test.js` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (200-game self-play per tier) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/bot.test.js`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | BOT-01 | — | Easy fires only at unshot cells (no out-of-bounds, no repeat) | unit | `npx vitest run test/bot.test.js -t easy` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | BOT-01 | — | Medium behaves identically to pre-phase bot (SC#3 regression anchor) | unit | `npx vitest run test/bot.test.js -t medium` | ❌ W0 | ⬜ pending |
| 6-01-03 | 01 | 1 | BOT-01 | — | Hard density picks highest-probability unshot cell; never reads myShips | unit | `npx vitest run test/bot.test.js -t hard` | ❌ W0 | ⬜ pending |
| 6-01-04 | 01 | 1 | BOT-01 | — | Insane (parity + orientation lock) honest; shots ≤ Hard | unit | `npx vitest run test/bot.test.js -t insane` | ❌ W0 | ⬜ pending |
| 6-01-05 | 01 | 1 | BOT-01 (SC#2) | — | Win-rate ordering observable: avg shots `easy > medium > hard >= insane` | unit | `npx vitest run test/bot.test.js -t ordering` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/bot-helpers.js` — extract pure-JS targeting algorithms (easy/medium/hard/insane) + a headless game simulator (place fleet, run bot to completion, count shots). Algorithms must be importable without React/DOM.
- [ ] `test/bot.test.js` — per-tier behavior tests + the 200-game self-play ordering assertion for SC#2.
- [ ] `npx vitest` install — no framework present today; add as devDependency + `"test": "vitest run"` script.

*The headless harness is the key enabler: SC#2 ("observably different win rates") is only automatable if the four targeting functions are callable in pure JS. Plan the algorithm extraction so the same functions power both the live `botPick()` dispatch and the test harness.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 4-button tier row renders in lobby (EN + VI) | BOT-01 (SC#1, D-04/D-06) | DOM/visual render not in headless harness | Open app, confirm Easy/Medium/Hard/Insane buttons replace single "Play vs Bot"; toggle lang, confirm VI labels |
| Last-picked tier persists across reload | BOT-01 (D-05) | localStorage + reload behavior | Pick Hard, reload, confirm Hard is default; clear storage, confirm Medium default |
| Advance/power-up single-player bot unchanged | BOT-01 (D-07) | Separate code path, no automated coverage | Start advance-mode bot game, confirm prior behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
