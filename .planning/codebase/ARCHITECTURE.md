---
last_mapped_commit: 943b76e
mapped_date: 2026-06-01
---

# Architecture

## System Type

Real-time multiplayer 2-player naval strategy game (Battleship) with optional single-player bot mode. Room-based WebSocket multiplayer with in-memory game state and optional Redis crash-recovery snapshots.

## Pattern

- **Server-authoritative** game logic over Socket.IO. All shot resolution, turn handover, and validation happen on the server (`server.js`).
- **Room-based** sessions identified by short room codes. Players hold seats via a `clientId` persisted in browser `localStorage`.
- **In-memory primary state** with optional Redis persistence layer for crash recovery (graceful no-op when `REDIS_URL` unset).
- **Single-player** mode runs bot AI entirely client-side — no network round-trips.

## Layers

1. **Transport / HTTP** — Express serves static assets from `dist/`; Socket.IO handles realtime events.
2. **Game logic** — `server.js` validates coordinates, resolves shots (hit / miss / mine / power-up), enforces turn clock.
3. **Persistence (optional)** — `store.js` abstracts Redis snapshot read/write; no-ops if Redis absent.
4. **Client SPA** — `public/app.jsx` (React) renders 4 screens and manages local UI state + bot AI.

## Data Flow

**Multiplayer fire sequence:**
1. Player clicks cell → Socket.IO `fire` event emitted.
2. Server validates coordinates against game state + turn ownership.
3. Server resolves shot: hit / miss / mine / power-up trigger.
4. Server hands turn to opponent, resets turn clock.
5. Both clients receive state update → re-render boards.

**Session continuity:**
- Room codes + player seats keyed by `clientId` (localStorage).
- Reconnect within 3-minute grace window restores held seat.
- Redis snapshot allows recovery if server restarts mid-game.

**Single-player:**
- Bot AI runs client-side in `app.jsx`. No server room created.

## Key Entry Points

- **Server:** `server.js` (line 1) — Express + Socket.IO bootstrap, event handlers.
- **Client:** `public/index.html` → loads `dist/app.js` (built from `public/app.jsx`).
- **Build:** `build-game.mjs` — esbuild bundles `app.jsx` → `dist/app.js`.

## Key Abstractions

- **Room** — container for two seats, boards, turn state, clock.
- **Seat** — player slot bound to a `clientId`; survives disconnects within grace window.
- **Shot resolution** — central server function classifying each fire outcome.
- **Store** (`store.js`) — Redis abstraction, swappable / optional.

## Constraints (fixed game rules)

- Grid: **11×11**.
- Fleet: ships of size **[5, 4, 3, 3, 2]**.
- Turn time limit: **20 seconds**; forfeit after **3** consecutive timeouts.
- Disconnect grace: **3 minutes** (seat held by `clientId`).
- Power-up spawn: **~27% per turn** (advance mode only).

## Components

| Component | File | Approx Lines | Role |
|-----------|------|--------------|------|
| Server | `server.js` | ~910 | Rooms, Socket.IO handlers, game logic, turn clock |
| Client SPA | `public/app.jsx` | ~1420 | React UI, i18n (EN/VI), Web Audio, bot AI |
| Store | `store.js` | ~65 | Optional Redis persistence |
| Build | `build-game.mjs` | ~30 | esbuild bundler config |
