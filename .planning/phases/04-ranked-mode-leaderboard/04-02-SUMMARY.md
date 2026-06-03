---
phase: 04-ranked-mode-leaderboard
plan: "02"
subsystem: api
tags: [ranked, socket-io, react, i18n, server-authoritative, input-validation]

# Dependency graph
requires:
  - phase: 04-ranked-mode-leaderboard/04-01
    provides: "Glicko-2 math (elo.js), DB schema (005_rankings.sql), test scaffold (ranking.test.js)"
provides:
  - "room.ranked boolean flag stored on room object at create time"
  - "RANKED_REQUIRES_ACCOUNT error code in createRoom + joinRoom (server-authoritative, RANK-02)"
  - "RANKED_REQUIRES_CLASSIC error code in createRoom (D-05)"
  - "Ranked lobby toggle (disabled for guests) + EN/VI i18n strings in app.jsx"
  - "Error surfacing for both ranked error codes in UI"
affects:
  - "04-03 (recordMatch ranked param + rating write reads room.ranked)"
  - "04-04 (leaderboard endpoint — depends on ranked flag existing)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server reads socket.data.userId (session-set), never arg.userId — Spoofing mitigation (T-04-04)"
    - "!!(arg && arg.ranked === true) strict coercion for boolean inputs (T-04-07, V5)"
    - "Guard-clause early returns for ranked violations before room init"
    - "Client toggle as defense-in-depth hint; authoritative reject is always server-side (T-04-05)"
    - "Force classic mode when ranked active — prevents ranked+advance at both client and server (D-05)"

key-files:
  created: []
  modified:
    - server.js
    - public/app.jsx

key-decisions:
  - "D-01: Ranked flag set by host at create time via lobby toggle; stored as room.ranked boolean"
  - "D-02: Server rejects guests (socket.data.userId == null) from creating or joining ranked rooms with RANKED_REQUIRES_ACCOUNT; client toggle hidden/disabled as hint only"
  - "D-05: ranked+advance rejected with RANKED_REQUIRES_CLASSIC; client auto-switches to classic when ranked is enabled"

patterns-established:
  - "Pattern: Guard-clause ranked checks placed BEFORE room object creation (createRoom) and BEFORE player seat insertion (joinRoom)"
  - "Pattern: All ranked eligibility reads from server-set socket.data.userId — client payload userId never trusted"

requirements-completed: [RANK-02]

# Metrics
duration: ~20min
completed: 2026-06-03
---

# Phase 04 Plan 02: Ranked Mode Gating Summary

**server.js `room.ranked` flag + two server-authoritative error codes (RANKED_REQUIRES_ACCOUNT, RANKED_REQUIRES_CLASSIC) + lobby ranked toggle with guest-disable and EN/VI i18n in app.jsx**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-03T11:45:00+07:00
- **Completed:** 2026-06-03T11:56:33+07:00 (human-verify approved)
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Server-authoritative ranked gating: guests (no session userId) are rejected at both createRoom and joinRoom with `RANKED_REQUIRES_ACCOUNT`; ranked+advance rejected with `RANKED_REQUIRES_CLASSIC`
- Strict boolean coercion `!!(arg && arg.ranked === true)` prevents truthy-injection of ranked flag (T-04-07)
- Lobby ranked toggle disabled/hidden for guests with localized hint; when ranked enabled, advance mode is disabled forcing classic (D-05 client guard)
- Full EN/VI i18n: `ranked.label`, `ranked.desc`, `ranked.guestHint`, `err.RANKED_REQUIRES_ACCOUNT`, `err.RANKED_REQUIRES_CLASSIC`
- Human-verify checkpoint (Task 3) confirmed UX and i18n — approved by user

## Task Commits

Each task was committed atomically:

1. **Task 1: server.js — room.ranked flag + ranked guards** - `55e4700` (feat)
2. **Task 2: public/app.jsx — ranked toggle, payload, guest-disable, error surface, EN/VI** - `d2eef5f` (feat)
3. **Task 3: Human verify checkpoint** - approved by user (no code change)

## Files Created/Modified

- `server.js` — Added `const ranked = !!(arg && arg.ranked === true)` coercion; RANKED_REQUIRES_CLASSIC guard (ranked+advance); RANKED_REQUIRES_ACCOUNT guard in createRoom and joinRoom; `ranked` added to room init object
- `public/app.jsx` — `ranked` useState; ranked toggle (disabled for guests); advance mode disabled when ranked; createRoom emits `ranked`; error handling for both ranked error codes; EN/VI i18n strings added

## Decisions Made

- **D-01**: Host sets ranked flag at room creation time via lobby toggle; stored as `room.ranked` boolean alongside `mode`
- **D-02**: Server reads `socket.data.userId` (set from server-side session), never `arg.userId` — eliminates spoofing vector (T-04-04). Client toggle is defense-in-depth only; authoritative reject is server-side (T-04-05)
- **D-05**: Ranked rooms are classic-mode only; `ranked+advance` returns `RANKED_REQUIRES_CLASSIC`; client auto-switches mode to classic when ranked is enabled

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both auto tasks executed cleanly. Human-verify checkpoint (Task 3) was approved by user confirming UX and i18n behavior.

## User Setup Required

None - no external service configuration required for this plan.

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|--------------------|
| T-04-04 Spoofing (guest forges ranked eligibility) | Server reads `socket.data.userId` only; `arg.userId` never read |
| T-04-05 Elevation of Privilege (guest bypasses toggle) | Server-side reject in createRoom + joinRoom is authoritative; client toggle is hint only |
| T-04-06 Tampering (ranked+advance pollutes classic pool) | createRoom rejects with RANKED_REQUIRES_CLASSIC; client forces classic when ranked |
| T-04-07 Input Validation (truthy coercion injection) | `!!(arg && arg.ranked === true)` strict-equals coercion |

## Next Phase Readiness

- `room.ranked` flag is in place — Plan 03 (`recordMatch` ranked param + rating write) can read it directly
- Both error codes defined and tested (ranking.test.js guard grep)
- No blockers for Plan 03

---
*Phase: 04-ranked-mode-leaderboard*
*Completed: 2026-06-03*
