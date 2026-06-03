---
phase: 4
slug: ranked-mode-leaderboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.8 (already installed; existing tests in `test/`) |
| **Config file** | none — vitest zero-config; `npm test` → `vitest run` |
| **Quick run command** | `npx vitest run test/elo.test.js test/ranking.test.js` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/elo.test.js test/ranking.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

> Plan 01 (Wave 1) creates `test/elo.test.js` + `test/ranking.test.js` (Wave-0 scaffold), progressively activated by later plans. Map mirrors the Validation Architecture in 04-RESEARCH.md.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 4-01 | 01 | 1 | RANK-01/03/05 | elo.js pure fn → Glickman vector r'≈1464.06, RD'≈151.52, σ'≈0.05999; 005 schema applies | unit | `npx vitest run test/elo.test.js` | ⬜ pending |
| 4-02 | 02 | 2 | RANK-02 | ranked create/join with unauth seat → `RANKED_REQUIRES_ACCOUNT`; ranked+advance → `RANKED_REQUIRES_CLASSIC` | unit/integration | `npx vitest run test/ranking.test.js` | ⬜ pending |
| 4-03 | 03 | 3 | RANK-01 | rating UPSERT + matches snapshot + match row commit/rollback in one txn | integration | `npx vitest run test/ranking.test.js` | ⬜ pending |
| 4-04 | 04 | 4 | RANK-03/04 | leaderboard excludes `rd >= 110`; served from Redis JSON ≤5-min TTL + refresh-on-write | integration | `npx vitest run test/ranking.test.js` | ⬜ pending |
| 4-05 | 05 | 5 | RANK-05 | season reset archives ratings→rating_history/seasons BEFORE blend; history never deleted; idempotent | integration | `npx vitest run test/ranking.test.js` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Granular per-task rows expand at execution as task IDs finalize.*

**Validation Architecture (from 04-RESEARCH.md) — planner expands into the map:**
- `elo.js` pure-function vectors: 3-opponent Glickman example → r'≈1464.06, RD'≈151.52, σ'≈0.05999 (HIGH); defaults 1500/350/0.06, τ=0.5, ε=1e-6.
- Same-transaction atomicity (RANK-01): rating UPSERT + matches snapshot + match row commit together; induced failure rolls all back.
- Placement filter (RANK-03): provisional `rd >= 110` excluded from leaderboard; provisional player still rated, only hidden.
- Cache refresh timing (RANK-04): top-100 served from Redis JSON, ≤5-min TTL fallback + refresh-on-write.
- Season reset (RANK-05): archive active ratings → rating_history/seasons BEFORE soft-reset blend; idempotent; history never deleted.
- Guest block (RANK-02): server rejects ranked create/join with `RANKED_REQUIRES_ACCOUNT` when any seat unauthenticated.

---

## Wave 0 Requirements

- [x] Test framework present (vitest ^4.1.8 already installed; `test/` dir active)
- [ ] `test/elo.test.js` — Glicko-2 known-vector stubs for RANK-01 (created Plan 01)
- [ ] `test/ranking.test.js` — ranked-flow integration stubs, progressively activated (created Plan 01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ranked toggle lobby UI (EN/VI) | RANK-02 | Visual/i18n surface | Create ranked room as guest → toggle disabled/hidden; signed-in → enabled |
| Season soft-reset CLI run | RANK-05 | Destructive ops script run on server box | Run script on seeded ratings → verify history archived + ratings blended |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
