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

### Active

<!-- New milestone scope. Hypotheses until shipped and validated. Sequenced foundation-first. -->

**Foundation — persistence & identity**
- [ ] Postgres-backed durable storage (Render-managed) for accounts, stats, replays, rankings
- [ ] Guest-first play preserved (instant, no login via clientId)
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
- [ ] Saved game replays (review past matches)
- [ ] Tournament brackets

### Out of Scope

- Email + password auth — Google OAuth chosen to avoid owning password reset / credential-storage burden (revisitable)
- Native mobile apps — web-first; PWA is sufficient for now
- Real-money payments / monetization — not core to gameplay value this milestone
- Voice chat — text/emoji chat covers social need; high complexity, low payoff

## Context

- Brownfield: mature codebase already mapped under `.planning/codebase/` (commit 943b76e). Server-authoritative game logic in `server.js` (~910 lines); React SPA in `public/app.jsx` (~1420 lines); optional Redis via `store.js`; esbuild bundling via `build-game.mjs`.
- Hosting: Render.io free tier, auto-deploy on push to `main`. Adding managed Postgres is the foundational infra change this milestone.
- Known concerns to weigh during planning (from `CONCERNS.md`): no rate limiting on `fire`/`useAbility`, weak chat/profile sanitization, race conditions in `joinRoom`/`placeShips`/turn-clock, unbounded room-map memory growth, zero automated tests, monolithic `app.jsx`. Several of these (rate limiting, validation, room cleanup, tests) become higher-stakes once public matchmaking and persistent accounts exist.
- Identity today is clientless (`clientId` in localStorage). New account system must layer on top without breaking instant guest play.

## Constraints

- **Tech stack**: Stay on Node.js + Express + Socket.IO + React + esbuild — extend, don't rewrite. New persistence is Render-managed Postgres.
- **Identity**: Guest-first is non-negotiable — instant play must survive; accounts are strictly additive/optional.
- **Hosting**: Must run on Render; in-memory game state + single process today means scaling/shared-state is a known limitation to address before heavy public-matchmaking load.
- **Compatibility**: Preserve EN/VI i18n and existing reconnect/grace-window behavior.
- **Security**: Public matchmaking + persistent accounts raise the bar — rate limiting, input sanitization, and OAuth handling must be addressed as features land, not deferred indefinitely.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Render-managed Postgres for durable storage | Relational queries (leaderboards, history, ranked) fit SQL; managed = low ops burden | — Pending |
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
*Last updated: 2026-06-01 after initialization*
