# Battleship Online

## What This Is

A real-time, browser-based multiplayer Battleship game (Express + Socket.IO + React) with persistent player accounts (Google/Facebook OAuth + email/password), public matchmaking queues (casual + ranked with Glicko-2 ratings), a global leaderboard, four-tier bot difficulty, power-ups, ephemeral chat, and EN/VI localization. Players can jump in instantly as guests or sign up to track stats, climb the ladder, and compete in ranked matches.

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

<!-- Milestone v1.0 deliverables -->

- ✓ Durable Postgres persistence layer: shared pg.Pool + auto-migration runner + identity schema — v1.0 Phase 1
- ✓ Guest-credential durability: upsertGuestCredential on all connect paths — v1.0 Phase 1
- ✓ Security hardening: rate limiting, doShot null guard, room eviction, sanitization, CSP — v1.0 Phase 1
- ✓ Google OAuth sign-in with guest history linking — v1.0 Phase 2
- ✓ Facebook OAuth sign-in (provider-generic, email optional) — v1.0 Phase 2
- ✓ Email/password signup with bcrypt, async verification email — v1.0 Phase 2
- ✓ Password reset via single-use time-limited token — v1.0 Phase 2
- ✓ Session persistence + server-side revocation (sign out all devices) — v1.0 Phase 2
- ✓ Player profile with win/loss record and public view — v1.0 Phase 2
- ✓ Durable match records with explicit forfeit handling — v1.0 Phase 3
- ✓ Glicko-2 ratings atomically updated with match records — v1.0 Phase 4
- ✓ Ranked mode gated to signed-in accounts — v1.0 Phase 4
- ✓ Global leaderboard (top 100, provisional gating, Redis cache) — v1.0 Phase 4
- ✓ Season soft-reset CLI (archive + blend) — v1.0 Phase 4
- ✓ Public quick-match queue (casual pairing, no room code) — v1.0 Phase 5
- ✓ Ranked matchmaking with ELO-window widening — v1.0 Phase 5
- ✓ Queue cleanup on disconnect/navigate-away — v1.0 Phase 5
- ✓ Four-tier bot difficulty (easy/medium/hard/insane) with distinct algorithms — v1.0 Phase 6

### Active

<!-- v2 candidates — not yet planned -->

- [ ] Friends list with online presence (SOCL-01)
- [ ] Direct challenge / invite a friend (SOCL-02)
- [ ] Rematch history between players (SOCL-03)
- [ ] Live spectator mode (SPEC-01)
- [ ] XP / levels / progression (RETN-01)
- [ ] Daily challenges / quests (RETN-02)
- [ ] Configurable game modes (MODE-01)
- [ ] Horizontal scaling via Socket.IO Redis adapter (SCAL-01)
- [ ] Tournament brackets (TOUR-01)

### Out of Scope

- Saved game replays — cut from vision; live spectate covers "watch" need
- Native mobile apps — web-first; PWA sufficient
- Real-money payments / monetization — not core to gameplay
- Voice chat — text/emoji covers social need; high complexity, low payoff
- Real-time sub-second leaderboard — 5-minute cache indistinguishable to players

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
| Self-hosted Postgres on dedicated EC2 | Full control, no managed-tier limits; co-located with app + Redis | ✓ Good — stable through all 6 phases |
| Redis always available (self-hosted on EC2) | Enables snapshots, leaderboard cache, future Socket.IO adapter | ✓ Good — used for crash-recovery + leaderboard |
| Guest-first, optional sign-up | Preserve zero-friction instant play; accounts additive only | ✓ Good — guest play unchanged, 3 sign-in methods added |
| Google + Facebook + Email auth (was: Google only) | Broader reach; email added Phase 2 after feedback | ✓ Good — 3 providers cover most users |
| Glicko-2 over ELO | Handles provisional ratings, deviation, volatility; 40-line pure function | ✓ Good — validated against Glickman reference vector |
| Sequence milestone foundation-first | Persistence + identity unblock matchmaking, ranked, social | ✓ Good — clean dependency chain P1→P2→P3→P4→P5; P6 parallel |
| Extend existing stack, no rewrite | Mature working codebase; lower risk | ✓ Good — server.js grew to ~2800 lines but remained coherent |
| RateLimiterMemory (in-process) for all rate limiting | No new dependency; sufficient for single-process | ⚠️ Revisit — needs Redis-backed limiter for horizontal scaling |
| Season reset as CLI-only script | No HTTP surface = no attack vector; runs manually per season | ✓ Good — simple, secure, idempotent |

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
*Last updated: 2026-06-04 after v1.0 milestone — all 6 phases shipped: persistence, accounts (3 auth methods), match recording, ranked Glicko-2 + leaderboard, public matchmaking, 4-tier bot difficulty.*
