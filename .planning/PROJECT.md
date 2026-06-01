# Battleship Online

## What This Is

A real-time, browser-based multiplayer Battleship game (Express + Socket.IO + React) where two players battle on an 11×11 grid via shareable room codes, with a single-player bot mode, power-ups, ephemeral chat, and EN/VI localization. This milestone evolves it from a "play with a friend via code" game into a competitive, social, replayable online game with persistent player identity, public matchmaking, ranked progression, and spectating.

## Core Value

Two players can find each other and play a fair, fast, satisfying game of Battleship — and have a reason to come back tomorrow.

## Requirements

### Validated

<!-- Existing capabilities inferred from the live codebase (commit 943b76e). -->

- ✓ Real-time 2-player multiplayer over Socket.IO with server-authoritative shot resolution — existing
- ✓ Room-based matchmaking via short room codes — existing
- ✓ Single-player mode vs client-side bot AI — existing
- ✓ Reconnect/resume within a 3-minute grace window (seat held by clientId) — existing
- ✓ Optional Redis crash-recovery snapshots (RAM-only when REDIS_URL unset) — existing
- ✓ Power-up / advance mode (mines, scatter, cross shots) — existing
- ✓ Ephemeral in-game chat with emoji bubbles — existing
- ✓ Turn clock (20s) with timeout forfeit after 3 consecutive misses — existing
- ✓ EN/VI internationalization — existing
- ✓ Web Audio sound effects + combat animations — existing
- ✓ SEO / Open Graph social share metadata — existing
- ✓ Health/metrics endpoints + Render auto-deploy — existing

<!-- Milestone v1.0 deliverables, validated per phase. -->

- ✓ Durable Postgres persistence layer: shared `pg.Pool` (db.js) + auto-applied numbered-migration runner (fail-loud, idempotent) + canonical identity schema (`users`/`credentials`/`schema_migrations`) — Validated in Phase 1: Foundation (DATA-01, DATA-02)
- ✓ Guest-credential durability: `upsertGuestCredential` wired into createRoom/joinRoom/resume/rejoin — Validated in Phase 1 (DATA-01)
- ✓ Pre-public-matchmaking security hardening: per-event rate limiting (fire/useAbility/chat) + turn-clock race guard, `doShot` null/shape guard, abandoned-room eviction sweep, server-side profile/chat sanitization + stored-XSS escaping + CSP header — Validated in Phase 1 (SEC-01..SEC-04)

### Active

<!-- New milestone scope. Hypotheses until shipped and validated. Sequenced foundation-first. -->

**Foundation — persistence & identity**
- [x] Postgres-backed durable storage (self-hosted EC2) — persistence layer + identity schema landed in Phase 1; per-feature tables (accounts, stats, rankings) added in later phases
- [x] Guest-first play preserved (instant, no login via clientId) — Phase 1: guest credentials persisted transparently, instant play unchanged
- [ ] Optional account sign-up (Google OAuth) that links a guest's history to a persistent identity
- [ ] Player profile with win/loss record and lifetime stats

**Retention & competition**
- [ ] Public quick-match — pair two online players with no room code
- [ ] Ranked mode with ELO rating
- [ ] Global leaderboards (and seasonal reset)
- [ ] XP / levels / progression

**Social**
- [ ] Friends list with online presence
- [ ] Direct challenge / invite a friend to a game
- [ ] Rematch history between players
- [ ] Public-facing profiles

**Depth & modes**
- [ ] Bot difficulty tiers (easy / medium / hard / insane)
- [ ] New game modes (configurable grid size, custom fleets, time controls, new power-ups)
- [ ] Daily challenges / quests

**Spectate & share**
- [ ] Live spectator mode (watch a game via link)
- [ ] Tournament brackets (future — deferred beyond this milestone)

### Out of Scope

- Email + password auth — Google OAuth chosen to avoid owning password reset / credential-storage burden (revisitable)
- Saved game replays (save / review past matches) — cut from product vision; live spectator mode covers the "watch" need without per-move persistence
- Native mobile apps — web-first; PWA is sufficient for now
- Real-money payments / monetization — not core to gameplay value this milestone
- Voice chat — text/emoji chat covers social need; high complexity, low payoff

## Context

- Brownfield: mature codebase already mapped under `.planning/codebase/` (commit 943b76e). Server-authoritative game logic in `server.js` (~910 lines); React SPA in `public/app.jsx` (~1420 lines); optional Redis via `store.js`; esbuild bundling via `build-game.mjs`.
- Hosting (changing this milestone): migrating off Render onto a dedicated AWS EC2 instance that the owner provisions and manages — app server + self-hosted Redis + self-hosted Postgres all on that one box. This replaces Render's managed Postgres/auto-deploy and shifts ops ownership (OS patching, DB backups, TLS, security groups/firewall, process manager, reverse proxy, deploy pipeline) onto the project.
- Known concerns to weigh during planning (from `CONCERNS.md`): no rate limiting on `fire`/`useAbility`, weak chat/profile sanitization, race conditions in `joinRoom`/`placeShips`/turn-clock, unbounded room-map memory growth, zero automated tests, monolithic `app.jsx`. Several of these (rate limiting, validation, room cleanup, tests) become higher-stakes once public matchmaking and persistent accounts exist.
- Identity today is clientless (`clientId` in localStorage). New account system must layer on top without breaking instant guest play.

## Constraints

- **Tech stack**: Stay on Node.js + Express + Socket.IO + React + esbuild — extend, don't rewrite. New persistence is self-hosted Postgres on the EC2 box.
- **Identity**: Guest-first is non-negotiable — instant play must survive; accounts are strictly additive/optional.
- **Hosting**: Dedicated AWS EC2 instance running app + Redis + Postgres on one box (owner-provisioned). App must connect to Postgres/Redis over localhost (or private address) — no managed-DB SSL quirks; connection strings come from env vars. Single box = still single-process scaling limits; horizontal scaling is out of scope this milestone but Redis is now always available (not optional) for snapshots and a future Socket.IO adapter.
- **Compatibility**: Preserve EN/VI i18n and existing reconnect/grace-window behavior.
- **Security**: Public matchmaking + persistent accounts raise the bar — rate limiting, input sanitization, and OAuth handling must be addressed as features land, not deferred indefinitely.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-hosted Postgres on dedicated EC2 (was: Render-managed) | Owner runs app + Redis + Postgres on one EC2 box; full control, no managed-tier limits; trades low ops burden for self-managed backups/patching/TLS | — Pending |
| Redis always available (self-hosted on EC2) | Was optional on Render; now co-located — usable for snapshots and future Socket.IO adapter | — Pending |
| Guest-first, optional sign-up | Preserve zero-friction instant play; accounts additive only | — Pending |
| Google OAuth for sign-up (no email/password) | Avoid owning password storage/reset/security | — Pending |
| Sequence milestone foundation-first | Persistence + identity unblock matchmaking, social, replays | — Pending |
| Extend existing stack, no rewrite | Mature working codebase; lower risk | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-02 — Phase 1 (Foundation) complete: Postgres persistence layer + identity schema + security hardening validated.*
