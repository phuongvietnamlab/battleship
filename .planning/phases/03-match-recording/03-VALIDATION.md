---
phase: 03
slug: match-recording
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.8 |
| **Config file** | `vitest.config.js` (exists; `fileParallelism: false` — DB-gated tests run serially) |
| **Quick run command** | `npm test -- test/match.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- test/match.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | MATCH-01 | — | N/A | static | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | MATCH-01 | — | `004_matches.sql` exists with expected columns + CHECK on reason | static | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | MATCH-01 | — | `matches` table exists with expected columns after migration | integration | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | MATCH-01 | — | `recordMatch` exported from `db.js` | static | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | MATCH-01 | — | `recordMatch` inserts exactly one row into `matches` | integration | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | MATCH-01 | — | `recordMatch` no-ops when DATABASE_URL absent (never throws) | unit | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | MATCH-01 | — | normal win path writes one row; `room.recorded` blocks double-write | integration | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | MATCH-03 | — | grace-window expiry writes a `disconnect` forfeit-loss row | integration | `npm test -- test/match.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/match.test.js` — stubs for MATCH-01, MATCH-03 (static DDL checks + DB-gated integration tests via `skipIf(!hasDatabaseUrl)`)
- [ ] `migrations/004_matches.sql` — must exist before integration tests can pass

*No framework install needed — vitest already in devDependencies.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-game screen renders before/independent of match write | MATCH-01 (D-07) | Timing/UX best-effort guarantee hard to assert in unit test | Play a full 2-player game to completion; confirm `gameOver` screen appears instantly even with a slow/failing DB |

*Most behaviors have automated verification; the best-effort non-blocking guarantee is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
