# Phase 3: Match Recording - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 3-Match Recording
**Areas discussed:** Match record content, Player attribution, Forfeit & dedup, Write reliability

---

## Match record content

| Option | Description | Selected |
|--------|-------------|----------|
| Lean + Phase-4-ready | user_ids, winner/loser, reason, mode, started_at, ended_at; no move log | ✓ |
| Minimal | ids, winner, reason, ended_at only | |
| Rich | + per-game stats (shots/hits/duration) | |

**User's choice:** Lean + Phase-4-ready
**Notes:** Schema must leave room for Phase 4 Glicko rating writes in the same transaction (RANK-01) without a breaking migration.

---

## Player attribution

| Option | Description | Selected |
|--------|-------------|----------|
| All 2-player server games | Record every started multiplayer game by users.id, guests included; bot excluded | ✓ |
| Only if ≥1 signed-in | Skip guest-vs-guest | |
| Only both signed-in | Account-vs-account only | |

**User's choice:** All 2-player server games
**Notes:** Every clientId already has a users row (Phase 1 upsertGuestCredential). Bot/single-player is client-side, no server room → nothing to record.

---

## Forfeit & dedup

| Option | Description | Selected |
|--------|-------------|----------|
| Skip pre-start | Record only once battle started (room.started); forfeit on started games | ✓ |
| Record all joins | Lobby/placement abandonment writes no-contest row | |

**User's choice:** Skip pre-start
**Notes:** Matches "completed game" intent. Grace-expiry/leave/timeout on a started game = forfeit loss. Exactly-one-record guard across racing end paths (room flag).

---

## Write reliability

| Option | Description | Selected |
|--------|-------------|----------|
| Emit then record best-effort | gameOver emitted first, then single-txn write; degrade/log on failure | ✓ |
| Record then emit | Await txn before gameOver; stronger durability, risks delaying end screen | |

**User's choice:** Emit then record best-effort
**Notes:** Preserves UX + graceful-degrade convention. DATABASE_URL unset → no-op + log; DB errors caught + swallowed, play continues. Still a single transaction (MATCH-01).

---

## Claude's Discretion

- Exact `matches` DDL (columns/types/indexes), migration `004` shape, dedup mechanism (room flag vs DB unique constraint), match-write helper location in db.js, and `started_at` sourcing — all deferred to research/planning honoring D-01..D-07.

## Deferred Ideas

- Glicko-2 ratings + same-txn write (RANK-01) — Phase 4.
- Match history / win-loss surfacing on profile — later phase.
- Per-game stats (shots/hits/duration) — only if a stats feature is scoped.
