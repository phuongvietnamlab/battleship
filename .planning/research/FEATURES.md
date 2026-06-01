# Feature Research

**Domain:** Competitive online multiplayer game (turn-based, browser, 1v1 — Battleship)
**Researched:** 2026-06-01
**Confidence:** HIGH (accounts/ranked/social), MEDIUM (spectator/replays/tournaments), HIGH (anti-features)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features players assume exist in any competitive online game. Missing these causes immediate bounce or perception of an "unfinished" product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Persistent player account (opt-in) | Players want their history and rank to carry forward across sessions; guest-only feels disposable | MEDIUM | Must layer on top of existing guest clientId without breaking instant play. Google OAuth is the right call — avoids owning credential storage. Guest accounts can remain indefinitely but are unlinkable to ranked play |
| Public quick-match (no room code) | Typing room codes and sharing links is a friction barrier; competitive players expect to press one button and find an opponent | MEDIUM | Queue lives server-side. Match made by availability first, ELO second (expand skill window over wait time). Requires in-memory queue with Socket.IO notifications on match found |
| ELO / rating system for ranked play | Any game calling itself "competitive" is expected to have a numerical skill signal | MEDIUM | Glicko-2 preferred over raw ELO — handles provisional ratings and accounts for rating deviation (confidence interval); widely used by Lichess and modern games. New players get wide deviation (±300+) that narrows over first ~20 ranked games |
| Global leaderboard | Players who rank up expect to see where they stand | LOW | Simple SQL `ORDER BY rating DESC LIMIT 100`. Key decision: show only registered accounts (guests excluded from leaderboard) |
| Win/loss record on profile | Baseline social credibility signal | LOW | Postgres counter columns updated on game-end. Visible on public profile |
| Player profiles (public-facing) | Players want to inspect opponents before/after a match | LOW | Show: username, rank, win/loss, recent games. Keep simple — no private data |
| Friends list with online presence | Direct challenge requires knowing which friends are online; presence is the social heartbeat | HIGH | Requires persistent identity (accounts first), bidirectional friend relationship in DB, real-time presence via Socket.IO presence rooms or a heartbeat channel. This is the highest-complexity social primitive |
| Direct challenge / private invite | Core social loop: "play a game with someone you know" | MEDIUM | Depends on friends list. Invite as a Socket.IO notification; recipient accepts/declines. Fallback: shareable invite link (simpler, no friends list dependency) |
| Reconnect/session resume | Already exists; players rage-quit if disconnects end ranked games immediately | LOW (exists) | Existing 3-minute grace window covers this. Ranked matches should apply same grace |
| Bot difficulty tiers | Single-player value degrades fast if there's only one difficulty; players expect a challenge ladder | MEDIUM | Existing bot is client-side. Add parameterized difficulty: easy (random), medium (hunt+parity), hard (probability-density targeting), insane (near-optimal). Each is a distinct algorithm, not just a slider |

### Differentiators (Competitive Advantage)

Features that elevate this game above a generic "Battleship clone." Align with the core value: a reason to come back tomorrow.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seasonal ranked reset with rank decay | Creates urgency and new competitive cycles; seasons give players a fresh start and a reason to grind. Standard in LoL, VALORANT, chess.com | MEDIUM | Soft reset (not full reset): at season end, ratings compress toward median (e.g., regress 25–30% toward 1200). Seasons should be 4–8 weeks given game speed. Season history preserved on profile |
| XP / level progression | Visible progression beyond rank satisfies players who aren't climbing; gives casual players a goal | MEDIUM | XP awarded for: game played, win, streak, daily challenge, ranked placement bonus. Levels unlock cosmetic profile frames or chat emoji packs — no gameplay advantage |
| Saved game replays | Allows post-game analysis and viral sharing; unique for a browser Battleship game | HIGH | Turn-based game is ideal for replays: store event log (each shot + outcome + timestamp) rather than full state snapshots. Full game log is < 1 KB for a Battleship match. Replay viewer reconstructs board state by replaying events client-side |
| Live spectator mode | Tournament viability; lets players watch friends' games; creates social energy | HIGH | Server broadcasts a read-only game state stream to spectator sockets. Key design: slight delay (5–10 s) to prevent ghost-intel cheating. Spectator sees both boards; active players cannot see spectator count to avoid distraction |
| Daily challenges / quests | Core retention loop; gives players a reason to open the game daily | MEDIUM | Examples: "Win a game without using a power-up", "Land 5 consecutive hits in one game", "Play 3 ranked games today". Reset at midnight UTC. Completing grants XP. Harder quests grant more XP. Start with 3 quest slots |
| Configurable game modes | Differentiates from identical Battleship games; gives community something to explore | HIGH | Grid size (8×8, 10×10, 11×11, 15×15), custom fleet composition, time control variants (10s, 20s, 30s per turn), power-ups on/off. Modes should be opt-in room settings, not replace standard ranked |
| Tournament brackets | High-engagement event format; creates community moments; drives player acquisition | VERY HIGH | Single-elimination is simplest. Swiss is better for small fields. Requires: account system, scheduling, bracket state machine, notifications, bracket progression. Best deferred until ranked ecosystem is healthy |
| Rematch history between players | Deepens rivalries; contextualizes current match | LOW | Query: all games where both players participated. Display on profile or post-game screen |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pay-to-win ranked advantages (buy power-ups, buy stronger fleet) | Monetization pressure | Destroys competitive integrity instantly; drives away serious players; backlash is severe and lasting (Star Wars Battlefront II is the canonical example) | Cosmetic-only monetization: profile frames, chat emoji packs, board skins — never gameplay-affecting |
| Email + password authentication | Seems like complete auth coverage | Requires owning password reset, credential storage, breach notification, GDPR compliance — massive security and ops burden for a game side project | Google OAuth only (already the stated decision). Revisit only if Google OAuth adoption proves insufficient |
| Voice chat | Requested by socially active players | High complexity, moderation burden (toxicity, harassment), legal compliance (COPPA if any under-13 users), essentially building a separate product | Existing emoji chat covers social need. Text chat is sufficient for Battleship's pace |
| Real-time global leaderboard (sub-second updates) | Feels impressive | Triggers DB writes on every game end; websocket fan-out to leaderboard subscribers is expensive; creates hot rows at rank #1 | Leaderboard refreshes every 5 minutes via a scheduled query. Players cannot tell the difference |
| Spectators seeing both boards in real time (no delay) | Complete information is more interesting to watch | Enables ghost intel: spectators can relay opponent ship positions to players via external chat | Mandatory 5–10 second spectator delay. Flag this in UI clearly |
| Guaranteed 1200-1400 ELO "protected" smurf zone | Some players request lower starting rating to avoid hard opponents early | Creates smurf accounts that ruin new player experience | Provisional rating system with wide deviation band. High-rated players cannot easily hide in low brackets because deviation narrows quickly |
| Full in-client tournament scheduling / calendar | Sounds like good engagement | Heavy product complexity; tournaments require admin tooling, dispute resolution, no-show handling, timezone management | Start with ad-hoc tournaments using room codes + external bracket tool. Build first-class tournament only after ranked system is proven |
| Native mobile app | Broader reach | Separate codebase, App Store review cycles, push notification infrastructure — out of scope and low ROI vs PWA on mobile browser | PWA (already stated out-of-scope decision). Ensure mobile-responsive design |
| Forced account creation before first game | Seems better for data collection | Eliminates zero-friction instant play that is the product's current strength; every forced registration step loses ~20–40% of new users | Guest-first is non-negotiable. Prompt account creation after first game win or at ranked mode entry |

---

## Feature Dependencies

```
[Postgres persistence]
    └──required by──> [Player accounts / Google OAuth]
                          └──required by──> [ELO / Ranked mode]
                          │                     └──required by──> [Global leaderboard]
                          │                     └──required by──> [Seasonal reset]
                          │                     └──required by──> [Placement matches / onboarding]
                          └──required by──> [Friends list]
                          │                     └──required by──> [Online presence]
                          │                     └──required by──> [Direct challenge]
                          └──required by──> [Public profiles]
                          │                     └──required by──> [Rematch history]
                          └──required by──> [XP / levels]
                          └──required by──> [Saved replays]
                          └──required by──> [Daily challenges / quests]

[Public quick-match]
    └──enhanced by──> [ELO matchmaking]
    └──required by──> [Ranked mode] (ranked requires matchmaking, not just room codes)

[Spectator mode]
    └──requires──> [Server broadcast architecture] (game state fan-out to non-player sockets)
    └──enhanced by──> [Saved replays] (replay viewer reuses spectator rendering)

[Tournament brackets]
    └──requires──> [Player accounts]
    └──requires──> [ELO / Ranked mode] (seeding by rank)
    └──requires──> [Notifications / invites]

[Bot difficulty tiers]
    └──independent of──> [account system] (client-side bot, no dependency)
    └──enhanced by──> [Daily challenges] (bot challenges drive solo engagement)

[Daily challenges / quests]
    └──requires──> [Player accounts] (progress must be persisted)
    └──enhanced by──> [XP / levels] (quests are primary XP source)

[Game modes (configurable)]
    └──conflicts with──> [Ranked mode] (non-standard modes should be casual-only to preserve rating integrity)
```

### Dependency Notes

- **Postgres persistence is the root blocker:** Everything in the "Active" milestone depends on it. Ship persistence + accounts before any other feature is attempted.
- **Guest play must remain independent:** The guest/bot path (`clientId` + client-side bot) must never require Postgres to function.
- **ELO requires accounts requires persistence:** This three-layer dependency means ranked cannot be phase 1.
- **Friends list is the most complex social primitive:** Bidirectional relationships, real-time presence events, and notification delivery make this higher-effort than ELO. Consider deferring friends list until after basic ranked is working.
- **Spectator reuses replay infrastructure:** Build replay event log first; spectator mode is then a real-time replay. Doing spectator before replay storage forces you to build the rendering twice.
- **Configurable game modes conflict with ranked integrity:** Non-standard grids or fleets cannot use the same ELO pool as standard ranked. Enforce mode-specific pools or make variants casual-only.
- **Tournament requires a healthy ranked ecosystem:** Tournaments with fewer than 20 concurrent players are a poor experience. This is a v2+ feature.

---

## MVP Definition

### Launch With (v1 — "Foundation + Basic Competition")

Minimum viable scope to validate whether public matchmaking + ranked brings retention lift.

- [ ] Postgres persistence layer + schema migrations
- [ ] Guest-first preserved (zero regression on instant play)
- [ ] Google OAuth account creation + guest-to-account linking
- [ ] Player profile with win/loss record
- [ ] Public quick-match queue (ELO-agnostic first, then ELO-weighted)
- [ ] ELO/Glicko-2 ranked mode (separate queue from casual)
- [ ] Global leaderboard (top 100, refreshed every 5 min)
- [ ] Bot difficulty tiers (easy / medium / hard as distinct algorithms)

### Add After Validation (v1.x — "Social + Retention")

Add once quick-match + ranked proves the engagement loop works (measure D7 retention before building these).

- [ ] XP / levels — when ranked is working and players have a reason to grind
- [ ] Daily challenges / quests — once XP system is in place
- [ ] Seasonal ranked reset — once there's a meaningful player base to reset
- [ ] Saved game replays — once players are playing enough games to want to review them
- [ ] Friends list + online presence — after basic ranked retention is proven
- [ ] Direct challenge / private invite — after friends list

### Future Consideration (v2+ — "Depth + Events")

Defer until product-market fit and active player base are established.

- [ ] Live spectator mode — requires healthy player population for it to feel alive
- [ ] Tournament brackets — requires 20+ concurrent players minimum to be worthwhile
- [ ] Configurable game modes — defer until standard mode is proven popular
- [ ] Public-facing profile pages (SEO-indexable player cards) — nice retention mechanic but not urgent
- [ ] Rematch history — low effort but only meaningful with active social graph

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Postgres persistence | HIGH (enables everything) | MEDIUM | P1 |
| Guest-first preserved | HIGH (no regression) | LOW | P1 |
| Google OAuth accounts | HIGH | MEDIUM | P1 |
| Public quick-match | HIGH | MEDIUM | P1 |
| ELO / Glicko-2 ranked | HIGH | MEDIUM | P1 |
| Global leaderboard | MEDIUM | LOW | P1 |
| Bot difficulty tiers | MEDIUM | MEDIUM | P1 |
| Player profiles | MEDIUM | LOW | P1 |
| XP / levels | MEDIUM | MEDIUM | P2 |
| Daily challenges / quests | HIGH | MEDIUM | P2 |
| Seasonal ranked reset | MEDIUM | LOW | P2 |
| Saved game replays | HIGH | HIGH | P2 |
| Friends list + presence | HIGH | HIGH | P2 |
| Direct challenge | HIGH | MEDIUM | P2 |
| Rematch history | LOW | LOW | P2 |
| Spectator mode | MEDIUM | HIGH | P3 |
| Tournament brackets | MEDIUM | VERY HIGH | P3 |
| Configurable game modes | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must ship for this milestone's value hypothesis to be testable
- P2: Should add once P1 is validated (meaningful D7/D30 retention signal)
- P3: Future milestone — defer until active community exists

---

## Competitor Feature Analysis

| Feature | Lichess (chess, open-source) | Chess.com | Our Approach |
|---------|------------------------------|-----------|--------------|
| Rating system | Glicko-2, no seasons, transparent formula | Glicko-1, no hard seasons | Glicko-2 (better confidence model, handles inactivity); soft seasonal reset every 6–8 weeks |
| Account vs guest | Must have account (no true guest) | Must have account | Guest-first is our moat — preserve it |
| Quick match | Lobby + time-control selector | Same | Single "Quick Match" button; time control fixed at standard for ranked |
| Bot difficulty | Stockfish levels 1–8 | Multiple named personas | 4 tiers: easy / medium / hard / insane — named, not numbered |
| Spectator | Yes, with slight delay | Yes | Yes, 10 s delay, both boards visible |
| Replays | Full PGN download + in-browser viewer | Full game replay | Event log storage + client-side replay reconstruction |
| Daily puzzles | Yes (high retention driver) | Yes | Daily challenges (game-completion based, not puzzles — fits Battleship format) |
| Friends/social | Full friends system | Full friends system | Friends list after ranked is proven |
| Leaderboard | Yes, per time control | Yes | Global + per-season, top 100 |
| Tournaments | Yes, arena + swiss | Yes | v2+ only |

---

## Sources

- [Elo rating system — Wikipedia](https://en.wikipedia.org/wiki/Elo_rating_system)
- [Lichess rating systems — Glicko-2](https://lichess.org/lichess.org/page/rating-systems)
- [Glicko-2 vs ELO — Lichess forum](https://lichess.org/forum/general-chess-discussion/glicko-2-rating-system-vs-elo-rating)
- [Crafting Perfect Matches — matchmaking design](https://www.numberanalytics.com/blog/ultimate-guide-matchmaking-game-design)
- [Designing Real-Time Matchmaking Service](https://yashh21.medium.com/designing-a-simple-real-time-matchmaking-service-architecture-implementation-96e10f095ce1)
- [One Identity — OAuth for games (Mighty Bear Games)](https://medium.com/mighty-bear-games/one-identity-to-unite-them-the-case-for-oauth-cfeb4578cd77)
- [Daily Rewards, Streaks, and Battle Passes in Player Retention](https://www.designthegame.com/learning/tutorial/daily-rewards-streaks-battle-passes-player-retention)
- [17 Proven Player Retention Strategies](https://gamedesignskills.com/game-design/player-retention/)
- [Predatory Monetisation — player perspective research](https://link.springer.com/article/10.1007/s10551-021-04970-6)
- [Design and safety tips for leaderboard — GDC](https://www.gamedeveloper.com/design/design-and-safety-tips-for-leaderboard)
- [Game Server Architecture Basics — replay/snapshot patterns](https://techtidesolutions.com/blog/game-server-architecture-basics/)
- [MMR, Rank, and LP — Riot Games support](https://support-leagueoflegends.riotgames.com/hc/en-us/articles/4405781372051-MMR-Rank-and-LP)
- [Ask VALORANT — Rank Rating system design](https://playvalorant.com/en-us/news/dev/ask-valorant-rank-rating-edition/)

---
*Feature research for: Battleship Online — competitive multiplayer milestone*
*Researched: 2026-06-01*
