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
| **Framework** | {node:test / jest / vitest — Wave 0 confirms; elo.js needs pure-function unit tests} |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `{quick command}` |
| **Full suite command** | `{full command}` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | RANK-01 | — | rating + match row commit atomically; rollback on failure | unit | `{command}` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Validation Architecture (from 04-RESEARCH.md) — planner expands into the map:**
- `elo.js` pure-function vectors: 3-opponent Glickman example → r'≈1464.06, RD'≈151.52, σ'≈0.05999 (HIGH); defaults 1500/350/0.06, τ=0.5, ε=1e-6.
- Same-transaction atomicity (RANK-01): rating UPSERT + matches snapshot + match row commit together; induced failure rolls all back.
- Placement filter (RANK-03): provisional `rd >= 110` excluded from leaderboard; provisional player still rated, only hidden.
- Cache refresh timing (RANK-04): top-100 served from Redis JSON, ≤5-min TTL fallback + refresh-on-write.
- Season reset (RANK-05): archive active ratings → rating_history/seasons BEFORE soft-reset blend; idempotent; history never deleted.
- Guest block (RANK-02): server rejects ranked create/join with `RANKED_REQUIRES_ACCOUNT` when any seat unauthenticated.

---

## Wave 0 Requirements

- [ ] Test framework confirmed/installed (none detected in repo yet)
- [ ] `elo.js` test file — Glicko-2 known-vector stubs for RANK-01

*If none: "Existing infrastructure covers all phase requirements."*

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
