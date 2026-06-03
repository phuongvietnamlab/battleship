---
phase: 5
slug: public-matchmaking
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.js` (or package.json `test` script) — existing, no install needed |
| **Quick run command** | `npx vitest run test/queue.test.js --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (quick), ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/queue.test.js --reporter=dot`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | QUEUE-01 | T-5-05 | Double-pairing race guard via synchronous queue delete + `pairing` flag | unit | `npx vitest run test/queue.test.js --reporter=dot` | ❌ W0 (this task creates it) | ⬜ pending |
| 5-01-02 | 01 | 1 | QUEUE-01 | T-5-01 / T-5-02 / T-5-03 / T-5-04 / T-5-05 | `sanitizeProfile` at enqueue; `type` allowlist; `joinQueueLimiter` 5/60s → RATE_LIMITED; ALREADY_IN_QUEUE/ALREADY_IN_ROOM guards; synchronous delete race guard | unit | `npx vitest run test/queue.test.js --reporter=dot` (+ `npm test` for no-regression) | ✅ (after 5-01-01) | ⬜ pending |
| 5-01-03 | 01 | 1 | QUEUE-01 | T-5-02 | Client emits `type:"casual"`; matchFound drops to placement unconditionally (no phantom guard) | build | `node build-game.mjs` | N/A (client bundle) | ⬜ pending |
| 5-01-04 | 01 | 1 | QUEUE-01 | — | Casual two-tab pairing, leave-queue, EN/VI strings | manual | Human checkpoint (see Manual-Only Verifications) | N/A | ⬜ pending |
| 5-02-01 | 02 | 2 | QUEUE-02 | T-5-07 | Rating/rd read server-side; `getPlayerRating(null)` no-DB default; `rankedWindow` pure math | unit | `npx vitest run test/queue.test.js --reporter=dot` | ✅ (extends 5-01-01) | ⬜ pending |
| 5-02-02 | 02 | 2 | QUEUE-02 | T-5-06 / T-5-08 / T-5-09 | Guest gate reads `socket.data.userId` only (RANKED_REQUIRES_ACCOUNT); queueStatus carries no opponent identity; getPlayerRating failure falls back to 1500/350 | unit | `npx vitest run test/queue.test.js --reporter=dot` (+ `npm test`) | ✅ | ⬜ pending |
| 5-02-03 | 02 | 2 | QUEUE-02 | T-5-06 | Ranked button disabled for guests (client mirror of server gate); windowAny branch when not finite | build | `node build-game.mjs` | N/A (client bundle) | ⬜ pending |
| 5-02-04 | 02 | 2 | QUEUE-02 | — | Guest-disabled Ranked, two-account ranked pairing, widening window display, EN/VI | manual | Human checkpoint (see Manual-Only Verifications) | N/A | ⬜ pending |
| 5-03-01 | 03 | 3 | QUEUE-03 | T-5-10 / T-5-11 | Disconnect deletes entry from BOTH queues as first action; D-11 front re-queue creates single fresh entry (no duplicate); `requeued` emit; dead-room teardown | unit | `npx vitest run test/queue.test.js --reporter=dot` (+ `npm test`) | ✅ | ⬜ pending |
| 5-03-02 | 03 | 3 | QUEUE-03 | T-5-12 / T-5-13 | Client cleanup emits leaveQueue on navigate-away (D-12); bot game client-side only, no server room / no recordMatch (D-09); `requeued` handler routes survivor to queue screen | build | `node build-game.mjs` | N/A (client bundle) | ⬜ pending |
| 5-03-03 | 03 | 3 | QUEUE-03 | — | Partner-vanish re-queue, navigate-away cleanup (no phantom pair), delayed bot offer, EN/VI | manual | Human checkpoint (see Manual-Only Verifications) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/queue.test.js` — created by 5-01-01 with describe blocks QUEUE-01 / QUEUE-02 / QUEUE-03 (QUEUE-02/03 start as `it.todo`, filled live by 05-02 and 05-03)
- [ ] `server.js` TEST_EXPORTS seam — 5-01-01 extends the existing TEST_EXPORTS block with `queues`, `tryPair` (and `rankedWindow` in 05-02, `removeFromQueues` in 05-03 if extracted)
- [ ] Framework install — none. Vitest ^4.1.8 already present; existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-09 "alone-too-long" bot offer appears after delay | QUEUE-03 (D-09) | The bot offer is driven by a client-side `botOfferTimerRef` `setTimeout(... BOT_OFFER_DELAY_MS)` firing `setBotOfferVisible(true)`. The timer + render path is UI timing in the bundled client and is not exercised by the engine-level (no-DOM) `test/queue.test.js` suite; it has no automated coverage. | Queue alone in one tab and wait ~30 seconds; confirm the "Play vs Bot" offer card (`.queue-bot-offer`) appears, click it, and confirm a single-player bot game starts (unranked, no server room, no recorded match). Repeat with language set to VI to confirm `queue.botOfferBody` / `queue.botOfferBtn` render Vietnamese. (Covered by checkpoint 5-03-03 steps 3–4.) |
| D-11 partner-vanish survivor returns to queue screen | QUEUE-03 (D-11) | The server-side re-queue (front re-insertion) is unit-tested in 5-03-01, but the end-to-end survivor navigation (server `requeued` emit → client `setScreen("queue")`) crosses the socket boundary and the rendered screen transition, which the no-DOM unit suite does not cover. | Tab A + Tab B pair via Quick Match; in Tab B, before placing ships, close the tab; confirm Tab A returns to the searching/queue screen rather than a dead room. (Covered by checkpoint 5-03-03 step 1.) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every code task has a vitest or build command; only the trailing per-plan human checkpoints are manual)
- [x] Wave 0 covers all MISSING references (`test/queue.test.js` created by 5-01-01)
- [x] No watch-mode flags (all use `vitest run`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-03
