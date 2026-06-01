# Technology Stack

**Analysis Date:** 2026-06-01

## Languages

**Primary:**
- JavaScript (Node.js) - Backend server (`server.js`, `store.js`)
- JavaScript (ES6+) - Build tooling (`build-game.mjs`)
- JSX - React frontend (`public/app.jsx`)

**Secondary:**
- HTML5 - Page structure (`public/index.html`)
- CSS3 - Styling (`public/style.css`)

## Runtime

**Environment:**
- Node.js (no specific version pinned; Render uses latest LTS by default)
- Runtime target: es2018 (for bundled client)

**Package Manager:**
- npm (v9+)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Express.js ^4.19.2 - HTTP server and static file serving
- React ^18.2.0 - Frontend UI framework
- React DOM ^18.2.0 - React rendering for web

**Real-time Communication:**
- Socket.IO ^4.7.5 - WebSocket server for game state sync
- Socket.IO Client ^4.7.5 - WebSocket client for real-time updates

**Build/Dev:**
- esbuild ^0.24.0 - Fast JavaScript bundler (minified IIFE output)

## Key Dependencies

**Critical:**
- socket.io (^4.7.5) - Multiplayer game synchronization and real-time events
- express (^4.19.2) - HTTP server and middleware
- react, react-dom (^18.2.0) - Frontend UI rendering

**Infrastructure:**
- redis (^4.7.0) - Optional persistent game state snapshots (lazy-loaded only when REDIS_URL is set)

## Configuration

**Environment:**
- `PORT` - Server listen port (default: 4000)
- `REDIS_URL` - Optional Redis connection string (when unset, game runs in RAM only)
- `SITE_ORIGIN` - Optional CORS allowlist for cross-origin requests (e.g., separate frontend domain)
- `CANONICAL_HOST` - Optional primary domain for SEO redirect (redirects *.onrender.com to custom domain)
- `SERVER_URL` - Build-time injection of server WebSocket endpoint for client (injected into bundled app.js)

**Build:**
- esbuild configuration: `build-game.mjs`
  - Entry: `public/app.jsx`
  - Output: `dist/app.js` (minified IIFE, no external dependencies)
  - JSX loader enabled
  - Target: es2018
  - Bundling: all dependencies included (React, Socket.IO client)

## Platform Requirements

**Development:**
- Node.js (LTS recommended)
- npm
- Bash/shell for build scripts

**Production:**
- Render.io (configured via `render.yaml`)
  - Runtime: Node
  - Auto-deploy on git push
  - Plan: Free tier (can be upgraded)
  - Build command: `npm install` (triggers postinstall build)
  - Start command: `npm start`

## Build Process

**npm run build:game** (also runs as postinstall hook):
1. Bundles `public/app.jsx` into `dist/app.js` using esbuild
2. Minifies for production
3. Copies `public/index.html` to `dist/`
4. Copies `public/style.css` to `dist/`
5. Injects `SERVER_URL` environment variable at build time
6. Output served before `public/` directory (dist/ takes precedence)

**No CDN.** All assets (React, Socket.IO client, game code) bundled into a single `app.js` file for offline-first resilience.

## API & Server

**REST Endpoints:**
- `GET /healthz` - Liveness probe for uptime monitors (returns `{ ok: true, uptimeSec }`)
- `GET /metrics` - Operations snapshot: room counts, player counts, memory, Redis status
- Static files: `dist/` (bundled app), then `public/` (fallback)

**WebSocket Events (Socket.IO):**
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

---

*Stack analysis: 2026-06-01*
