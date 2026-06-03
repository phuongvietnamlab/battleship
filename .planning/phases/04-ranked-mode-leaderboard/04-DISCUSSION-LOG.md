# Phase 4: Ranked Mode & Leaderboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 04-ranked-mode-leaderboard
**Areas discussed:** Ranked designation & gating, Rating model & storage, Placement & leaderboard cache, Season reset

---

## Ranked designation & gating

### How a game becomes ranked (pre-Phase-5 queue)
| Option | Description | Selected |
|--------|-------------|----------|
| Ranked flag on room create | Host toggles 'Ranked' at room creation (mirrors room.mode). Full slice playable now; Phase-5 queue sets the same flag. | ✓ |
| Engine-only + dev hook | Build rating engine, no player-facing ranked entry; dev/test hook only. Thinner, not demoable as a real game. | |
| Separate 'Play Ranked' button | Distinct ranked entry creating a ranked room. UI variant of the flag. | |

**User's choice:** Ranked flag on room create → **D-01**

### Guest block enforcement (RANK-02)
| Option | Description | Selected |
|--------|-------------|----------|
| Server reject + client hint | Server rejects unauthenticated ranked w/ `RANKED_REQUIRES_ACCOUNT`; client hides toggle for guests. Defense in depth. | ✓ |
| Server reject only | Server rejects only; no client hiding. | |

**User's choice:** Server reject + client hint → **D-02**

### Both seats vs initiator only
| Option | Description | Selected |
|--------|-------------|----------|
| Both seats signed in | Match is ranked only if both players authenticated; signed-in-vs-guest falls back to unranked. | ✓ |
| Only initiator | Initiator signed in; opponent can be guest. Complicates rating (guest has no persistent rating). | |

**User's choice:** Both seats signed in → **D-03**

---

## Rating model & storage

### Where ratings live
| Option | Description | Selected |
|--------|-------------|----------|
| New ratings table | ratings(user_id PK, rating, rd, volatility, games_played, updated_at). Normalized, users stays identity-only. | ✓ |
| Columns on users | Add rating cols to users. Mixes identity with game state. | |

**User's choice:** New ratings table → **D-04**

### Rating pool scope
| Option | Description | Selected |
|--------|-------------|----------|
| Single pool, classic-only ranked | Only classic games ranked; advance power-ups add luck. One rating per player. | ✓ |
| Single pool, both modes count | Classic + advance feed one rating. Mixes skill domains. | |
| Per-mode pools | Separate ratings. v2 MODE-01 — out of scope. | |

**User's choice:** Single pool, classic-only → **D-05**

### Snapshot rating onto matches row
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — ALTER matches before/after | 005 adds winner/loser rating before/after to matches (same txn). 004 anticipated it. Enables history + audit. | ✓ |
| No — only current rating | Live rating only, no per-match history. | |

**User's choice:** Yes, snapshot on matches → **D-06**

### Rating update timing
| Option | Description | Selected |
|--------|-------------|----------|
| Per-match immediate, period=1 | Compute + write in same txn as match record (criterion 1). One-game rating period. | ✓ |
| Batched rating periods | Cron recompute per period. Conflicts with same-transaction criterion. | |

**User's choice:** Per-match immediate, period=1 → **D-07**

---

## Placement & leaderboard cache

### Placement gate (RANK-03)
| Option | Description | Selected |
|--------|-------------|----------|
| RD threshold | Provisional (hidden) until RD < ~110 (Lichess-style). Idiomatic Glicko-2, self-correcting. | ✓ |
| Fixed game count | Hidden until N games (e.g. 10). Arbitrary; ignores rating confidence. | |

**User's choice:** RD threshold → **D-08**

### Leaderboard cache (RANK-04)
| Option | Description | Selected |
|--------|-------------|----------|
| Redis cached top-100 | Cache top-100 in Redis, refresh on rating change + ≤5-min TTL. Always-available, scaling-friendly. | ✓ |
| Postgres materialized view | MATERIALIZED VIEW refreshed every 5 min. Scheduling + stale-window complexity. | |
| In-memory TTL cache | In-process TTL. Lost on restart, not multi-process safe. | |

**User's choice:** Redis cached top-100 → **D-09**

### Leaderboard ordering metric
| Option | Description | Selected |
|--------|-------------|----------|
| Rating r descending | Order by Glicko-2 rating. Intuitive; provisional already excluded. | ✓ |
| Conservative r − 2·RD | Glicko lower-bound (rewards consistency). Rigorous but confusing. | |

**User's choice:** Rating r descending → **D-10**

---

## Season reset

### Soft-reset method (RANK-05)
| Option | Description | Selected |
|--------|-------------|----------|
| Blend toward 1500 + reset RD | new = 1500 + (old−1500)×factor (~0.5), RD reset high. Matches "soft-reset toward default". | ✓ |
| Inflate RD only | Keep rating, raise RD only. Ratings barely move toward default. | |
| Full reset to 1500/350 | Hard reset all. Not soft; discards skill signal. | |

**User's choice:** Blend toward 1500 + reset RD → **D-11**

### Archive target
| Option | Description | Selected |
|--------|-------------|----------|
| rating_history + seasons tables | seasons(id,label,started_at,ended_at) + rating_history snapshot. Clean metadata, queryable past ladders. | ✓ |
| rating_history only | One history table w/ season label string. Denormalized. | |

**User's choice:** rating_history + seasons → **D-12**

### Admin trigger
| Option | Description | Selected |
|--------|-------------|----------|
| CLI / npm script on server | Node script (migration-runner ops style). Zero public surface, no new auth. | ✓ |
| Protected admin HTTP endpoint | New admin-auth endpoint. Adds scope + public destructive surface. | |
| Env/flag-guarded endpoint | Secret-gated endpoint. Leaked/guessed secret = destructive exposure. | |

**User's choice:** CLI / npm script → **D-13**

---

## Claude's Discretion

- Glicko-2 constants beyond locked defaults (tau, convergence epsilon).
- Exact DDL/column names/indexes for ratings/rating_history/seasons + matches ALTER.
- Redis cache key/structure, TTL value (≤5-min), refresh-on-write trigger shape.
- Location of rating-write helper + leaderboard read in db.js.
- Exact provisional RD threshold (~110) and soft-reset blend factor (~0.5).
- Lobby ranked-toggle UI + leaderboard view (EN/VI i18n).

## Deferred Ideas

- Ranked matchmaking queue + ELO-window pairing (QUEUE-01/02/03) — Phase 5.
- Per-mode rating pools / rankable advance mode (MODE-01) — v2.
- Profile rating display + rating-over-time graphs — later phase.
- Web admin UI / admin auth for season reset — out of scope.
- Conservative r − 2·RD leaderboard ordering — rejected for v1, revisit on feedback.
