<!-- GSD:project-start source:PROJECT.md -->

## Project

**Battleship Online**

A real-time, browser-based multiplayer Battleship game (Express + Socket.IO + React) where two players battle on an 11×11 grid via shareable room codes, with a single-player bot mode, power-ups, ephemeral chat, and EN/VI localization. This milestone evolves it from a "play with a friend via code" game into a competitive, social, replayable online game with persistent player identity, public matchmaking, ranked progression, and spectating.

**Core Value:** Two players can find each other and play a fair, fast, satisfying game of Battleship — and have a reason to come back tomorrow.

### Constraints

- **Tech stack**: Stay on Node.js + Express + Socket.IO + React + esbuild — extend, don't rewrite. New persistence is Render-managed Postgres.
- **Identity**: Guest-first is non-negotiable — instant play must survive; accounts are strictly additive/optional.
- **Hosting**: Must run on Render; in-memory game state + single process today means scaling/shared-state is a known limitation to address before heavy public-matchmaking load.
- **Compatibility**: Preserve EN/VI i18n and existing reconnect/grace-window behavior.
- **Security**: Public matchmaking + persistent accounts raise the bar — rate limiting, input sanitization, and OAuth handling must be addressed as features land, not deferred indefinitely.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- JavaScript (Node.js) - Backend server (`server.js`, `store.js`)
- JavaScript (ES6+) - Build tooling (`build-game.mjs`)
- JSX - React frontend (`public/app.jsx`)
- HTML5 - Page structure (`public/index.html`)
- CSS3 - Styling (`public/style.css`)

## Runtime

- Node.js (no specific version pinned; Render uses latest LTS by default)
- Runtime target: es2018 (for bundled client)
- npm (v9+)
- Lockfile: `package-lock.json` (present)

## Frameworks

- Express.js ^4.19.2 - HTTP server and static file serving
- React ^18.2.0 - Frontend UI framework
- React DOM ^18.2.0 - React rendering for web
- Socket.IO ^4.7.5 - WebSocket server for game state sync
- Socket.IO Client ^4.7.5 - WebSocket client for real-time updates
- esbuild ^0.24.0 - Fast JavaScript bundler (minified IIFE output)

## Key Dependencies

- socket.io (^4.7.5) - Multiplayer game synchronization and real-time events
- express (^4.19.2) - HTTP server and middleware
- react, react-dom (^18.2.0) - Frontend UI rendering
- redis (^4.7.0) - Optional persistent game state snapshots (lazy-loaded only when REDIS_URL is set)

## Configuration

- `PORT` - Server listen port (default: 4000)
- `REDIS_URL` - Optional Redis connection string (when unset, game runs in RAM only)
- `SITE_ORIGIN` - Optional CORS allowlist for cross-origin requests (e.g., separate frontend domain)
- `CANONICAL_HOST` - Optional primary domain for SEO redirect (redirects *.onrender.com to custom domain)
- `SERVER_URL` - Build-time injection of server WebSocket endpoint for client (injected into bundled app.js)
- esbuild configuration: `build-game.mjs`

## Platform Requirements

- Node.js (LTS recommended)
- npm
- Bash/shell for build scripts
- Render.io (configured via `render.yaml`)

## Build Process

## API & Server

- `GET /healthz` - Liveness probe for uptime monitors (returns `{ ok: true, uptimeSec }`)
- `GET /metrics` - Operations snapshot: room counts, player counts, memory, Redis status
- Static files: `dist/` (bundled app), then `public/` (fallback)
- `createRoom` - Host creates a new room
- `joinRoom` - Client joins existing room
- `resume` - Reconnect to existing room (for Safari/iPhone backgrounding)
- `rejoin` - Re-join after disconnect grace period expires
- `placeShips` - Client places fleet before battle
- `fire` - Client fires at opponent
- `useAbility` - Client activates power-up (Advance mode)
- `chat` - Client sends ephemeral chat bubble
- `rematch` - Restart game in same room
- `leaveRoom` - Gracefully exit room
- `disconnect` - Built-in Socket.IO event

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Language & Tooling

- **JavaScript / JSX** throughout. No TypeScript.
- **No linter / formatter config** — no ESLint, no Prettier present.
- React 18 on the client; Node.js + Express + Socket.IO on the server.
- Build via esbuild (`build-game.mjs`).

## Naming

- `camelCase` for functions and variables.
- `UPPERCASE` for constants (e.g. error codes, game rule constants).
- Lowercase filenames for entry files (`server.js`, `store.js`).

## Error Handling

- **Guard-clause style** — early returns on invalid input rather than nested conditionals.
- **Structured error codes** returned to clients, e.g. `ROOM_NOT_FOUND`, `BAD_PLACEMENT`.
- **try/catch reserved for optional features** — Redis connection, `localStorage`, Web Audio. Core game logic relies on guards, not exceptions.

## Logging

- Minimal `console` logging.
- Prefixed context tags, e.g. `[prefix] message`, for grep-ability.

## Code Organization

- **Frontend:** single monolithic JSX file — `public/app.jsx` (~1420 lines) holds all screens, i18n, audio, bot AI.
- **Backend:** modular — `server.js` (logic + handlers), `store.js` (persistence).
- No path aliases. No barrel/index re-export files. Flat imports.

## i18n

- Bilingual EN / VI strings embedded in `public/app.jsx` and `public/index.html`.

## Patterns to Follow

- Validate on the **server** — never trust client-sent coordinates or state.
- Keep optional features **gracefully degradable** (Redis, audio, storage all no-op if unavailable).
- Add new error outcomes as **named codes**, not free-text strings.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Type

## Pattern

- **Server-authoritative** game logic over Socket.IO. All shot resolution, turn handover, and validation happen on the server (`server.js`).
- **Room-based** sessions identified by short room codes. Players hold seats via a `clientId` persisted in browser `localStorage`.
- **In-memory primary state** with optional Redis persistence layer for crash recovery (graceful no-op when `REDIS_URL` unset).
- **Single-player** mode runs bot AI entirely client-side — no network round-trips.

## Layers

## Data Flow

- Room codes + player seats keyed by `clientId` (localStorage).
- Reconnect within 3-minute grace window restores held seat.
- Redis snapshot allows recovery if server restarts mid-game.
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
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
