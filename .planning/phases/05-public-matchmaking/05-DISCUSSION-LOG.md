# Phase 5: Public Matchmaking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 5-public-matchmaking
**Areas discussed:** Queue scope & modes, Ranked pairing window, Queue UX & empty pool, Match handoff & cleanup

---

## Queue scope & modes

### Q: How should the casual and ranked queues relate?
| Option | Description | Selected |
|--------|-------------|----------|
| Two separate queues | Distinct Quick Match (casual) + Ranked; player picks one; ranked stays account-gated | ✓ |
| One queue, ranked if able | Single Find Match; ranked when both signed-in, else casual | |

### Q: Casual quick-match — advance mode or classic-only?
| Option | Description | Selected |
|--------|-------------|----------|
| Classic-only | Quick-match always classic; advance stays private-room-only | ✓ |
| Player picks, match same mode | Casual lets you choose classic/advance; pairs same-mode only | |

### Q: Can a player sit in more than one queue at the same time?
| Option | Description | Selected |
|--------|-------------|----------|
| One queue at a time | Exclusive; switching leaves the other | ✓ |
| Both simultaneously | Queue casual+ranked, first match wins | |

**Notes:** Cleanest mental model; ranked account-gate stays unambiguous; no double-pair risk.

---

## Ranked pairing window

### Q: How should the ranked ELO window widen?
| Option | Description | Selected |
|--------|-------------|----------|
| Stepped intervals | Start narrow, widen in steps on a timer up to a cap | ✓ |
| Continuous | Window grows smoothly with elapsed seconds | |

### Q: When no opponent found after a long wait?
| Option | Description | Selected |
|--------|-------------|----------|
| Widen to unbounded, wait | After cap, match anyone; keep waiting until someone appears | ✓ |
| Time out with message | Give up after N seconds, drop from queue | |

### Q: How should provisional players (RD ≥ 110) be paired?
| Option | Description | Selected |
|--------|-------------|----------|
| Match by rating, wide window | Same queue, wider starting window for high-RD players | ✓ |
| Separate provisional pool | Provisional players only match each other | |

**Notes:** No dead end on a quiet server; provisional ratings converge fast, no need to fragment the pool.

---

## Queue UX & empty pool

### Q: What should the waiting player see?
| Option | Description | Selected |
|--------|-------------|----------|
| Rich status | Elapsed timer + searching + cancel; ranked shows widening window | ✓ |
| Minimal spinner | Just "Finding opponent…" + cancel | |

### Q: Alone in queue with no opponents for a while?
| Option | Description | Selected |
|--------|-------------|----------|
| Keep waiting, offer bot | Stay queued; after a delay offer unranked bot game (reuses client bot) | ✓ |
| Just keep waiting | Stay queued until a human appears or cancel | |

**Notes:** Quiet-server resilience; bot fallback is unranked, writes no record.

---

## Match handoff & cleanup

### Q: Confirmation step before the game starts?
| Option | Description | Selected |
|--------|-------------|----------|
| Instant drop-in | Auto-create room, drop both into placement, no accept click | ✓ |
| Accept/ready prompt | "Match found — Accept?" countdown; both must accept | |

### Q: Paired player vanishes before the game starts?
| Option | Description | Selected |
|--------|-------------|----------|
| Auto re-queue the waiter | Put remaining player back in queue (front), resume search | ✓ |
| Drop to menu | Tell them opponent left, return to menu | |

### Q: What removes a player's queue entry (QUEUE-03)?
| Option | Description | Selected |
|--------|-------------|----------|
| Disconnect + cancel + navigate | Socket disconnect, Cancel button, leaving the screen all drop it | ✓ |
| Disconnect + cancel only | Rely on disconnect to catch navigation | |

**Notes:** Instant-play value; vanish handled by re-queue rather than an accept gate; cover every phantom-slot path.

---

## Claude's Discretion

- Exact ELO window constants (start width, step size, step interval, cap, provisional widening).
- "Alone-too-long" delay before the bot prompt.
- Queue state storage: in-memory vs Redis-backed (single-process in-memory sufficient this milestone).
- Pairing-loop mechanism + double-pairing race guard (reuse `room.recorded`/`room.resolving` flag pattern).
- New socket event + error-code names (`joinQueue`/`leaveQueue`/`matchFound`).
- Lobby/home-screen UI shape for the two queue buttons + wait panel (EN/VI).

## Deferred Ideas

- Per-mode rating pools / rankable advance (MODE-01) — v2.
- Simultaneous multi-queue membership — rejected v1.
- Separate provisional pool — rejected v1.
- Accept/ready step with decline-timeout — rejected v1.
- Hard queue timeout with failure message — rejected v1.
- Horizontal scaling / Socket.IO Redis adapter (SCAL-01) — v2.
- Friends / direct-challenge invites (SOCL-02) — v2.
