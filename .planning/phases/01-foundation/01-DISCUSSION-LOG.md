# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 1-Foundation
**Areas discussed:** Migration mechanism, Phase-1 schema scope, Rate-limit backing + policy, Room cleanup trigger

---

## Migration mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| node-pg-migrate | Dedicated lib, numbered up/down migrations, version table, rollback. +1 dep. | |
| Numbered .sql + tiny runner | Plain `migrations/001_*.sql` applied by a ~30-line runner tracking applied files in `schema_migrations`. No framework. | ✓ |
| Inline CREATE TABLE IF NOT EXISTS | Idempotent create at boot, zero deps, no version tracking. Messy across ALTERs. | |

**User's choice:** Deferred to Claude — "hãy chọn cái gì bạn cho là phù hợp và đúng" (choose what's appropriate and correct). Claude selected **Numbered .sql + tiny runner**.
**Notes:** Chosen for minimal-deps / no-TypeScript / guard-clause ethos while keeping real version tracking and full SQL control as schema grows across Phases 2–6. Runs on boot before `listen()`; fails loud on migration error.

---

## Phase-1 schema scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full identity model now (users + credentials) | Lay canonical identity (PITFALLS #1) up front; guest credential keyed by clientId. | ✓ |
| Minimal harness only | Pool + migration runner + bare table for this phase; defer identity to Phase 2. | |

**User's choice:** Deferred to Claude; Claude selected **full identity model now**.
**Notes:** PITFALLS #1 warns that retrofitting one-canonical-user / many-credentials later forces a painful migration. Foundation creates `users`, `credentials`, `schema_migrations` and upserts a guest credential on connect — giving Phase 1 a real durable read/write path. No ELO/matches/queue tables (later phases).

---

## Rate-limit backing + policy

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory (RateLimiterMemory) | Per-process, simplest; swap to Redis when scaling. | ✓ |
| Redis-backed | Survives reconnect across instances; needs Redis (on EC2 box). | |

**User's choice:** Deferred to Claude; Claude selected **in-memory**.
**Notes:** Single process on EC2 → no cross-process need yet; store is swappable to Redis at Phase 5 scaling. Limits: fire 2/s, useAbility 1/s, chat 5/10s. Violation → `RATE_LIMITED` code + drop event; disconnect on repeated rapid violations. Folded in: turn-clock race guard (`turn.resolving` flag).

---

## Room cleanup trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Periodic sweep (last-activity TTL) | ~60s sweep evicts idle rooms; catches zombie/pre-game rooms. | ✓ (hybrid) |
| Event-driven grace-expiry eviction | Evict when both seats empty past 3-min grace. | ✓ (hybrid) |

**User's choice:** Deferred to Claude; Claude selected **hybrid** (both).
**Notes:** `lastActivityAt` per room + ~60s sweep catches rooms where no `disconnect` fired; immediate eviction when both seats empty past grace. Memory bound = active games.

---

## Claude's Discretion

- `doShot()` null/shape guard (SEC-02) — guard-clause early return with `BAD_STATE` code, never throw.
- Input validation (SEC-04) — extend `sanitizeProfile()`, add chat validation, HTML-escape stored names, add CSP header. Exact limits/regex left to planner.
- `db.js` shape, env var names, pool `max` tuning, migration file layout.

All four area decisions were explicitly deferred by the user ("choose what's appropriate and correct") and then locked as proposed via the confirmation gate ("Lock all four").

## Deferred Ideas

- Redis-backed rate limiter — Phase 5 scaling.
- Account-level violation flagging / ban review — Phase 2+ (needs accounts).
- ELO / matches / queue / leaderboard tables — Phases 3–5.
- PgBouncer / multi-instance pool math — only if EC2 single-process assumption changes (Phase 5).
