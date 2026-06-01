---
last_mapped_commit: 943b76e
mapped_date: 2026-06-01
---

# Testing

## Current State

**No automated tests exist.**

- No `.test.js` / `.spec.js` files.
- No test framework installed (no Jest, Vitest, Mocha, etc.).
- No `test` script in `package.json`.
- No CI test configuration.

## How Code Is Currently Validated

- **Server-side guards** — coordinate/turn/placement validation via guard clauses returning structured error codes (`ROOM_NOT_FOUND`, `BAD_PLACEMENT`, …).
- **Client feedback** — UI surfaces invalid actions to the player.
- **Manual testing** — browser play-throughs and 2-client multiplayer checks.

## Gaps (untested critical paths)

- Reconnect / seat-restoration within the 3-minute grace window.
- Turn-clock races (timeout vs. in-flight fire event).
- Grid saturation / endgame edge cases.
- Power-up spawn and resolution (scatter / cross / mine).
- Redis snapshot crash-recovery round-trip.
- Concurrent `joinRoom` → `placeShips` race.

## Recommended Setup (if adding tests)

- Framework: **Vitest** (fast, ESM-native, matches the JS/esbuild stack).
- Priority targets:
  1. Pure shot-resolution logic in `server.js` (unit).
  2. Room lifecycle / seat reconnect (integration with Socket.IO test client).
  3. Placement validation guards.
- Add `"test": "vitest"` to `package.json` scripts.
