# External Integrations

**Analysis Date:** 2026-06-01

## APIs & External Services

**None Detected**

The application does not integrate with external APIs (Stripe, Twilio, Auth0, etc.). All game logic, matchmaking, and state management are self-contained.

## Data Storage

**Databases:**
- Redis (optional, lazily configured)
  - Purpose: Persistent game state snapshots for server restarts
  - Connection: `REDIS_URL` environment variable
  - Client: `redis` npm package (^4.7.0)
  - Behavior: When `REDIS_URL` is unset, entire game runs in RAM with no persistence
  - Storage key: `battleship:rooms` (single key, JSON-serialized room map)
  - Snapshot frequency: Every 3 seconds (`SNAPSHOT_MS = 3000`)
  - Lazy load: Redis client only initialized if `REDIS_URL` is provided; package not required otherwise

**Default:** RAM-only (no Redis)
- Rooms and game state stored in `rooms` object (`server.js` line 68)
- In-memory Sets used for ship occupancy, hits, mines
- Lost on server restart (Render redeploy)

**File Storage:**
- Local filesystem only
- Static assets: `public/` and `dist/` directories
- No S3, CDN, or cloud storage integration

**Caching:**
- None (Socket.IO broadcasts state directly to clients)

## Authentication & Identity

**Auth Provider:**
- None (no sign-up, login, or user accounts)

**Identity Model:**
- Clientless: Each player identified by a randomly generated `clientId` (UUID-like)
- Room code: 5-character alphanumeric code (e.g., `AB3K9`) for matchmaking
- Session persistence: `clientId` stored in browser localStorage; used to rejoin if disconnected for up to 3 minutes (GRACE_MS = 180000)
- Profile data: Optional client-supplied name and photo URL (sanitized in `sanitizeProfile()`, `server.js` line 137)
  - Name: Trimmed to 40 chars, whitespace normalized
  - Photo: HTTPS URL only, max 500 chars, validated via regex

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, or similar)
- Errors logged to stdout via `console.error()` and `console.log()`
- Redis connection failures caught and logged; game continues in RAM-only mode

**Logs:**
- Console logs only (no centralized logging service)
- Examples:
  - `[store] REDIS_URL not set — RAM-only mode` (`store.js`)
  - `[store] redis connected — snapshot persistence ON` (`store.js`)
  - `Battleship server running at http://localhost:{PORT}` (`server.js` line 900)

**Example Render logs:**
- Server startup messages
- Connection events (no persistent audit log)

## CI/CD & Deployment

**Hosting:**
- Render.io (configured in `render.yaml`)
  - Service type: Web
  - Runtime: Node
  - Plan: Free (upgradeable)
  - Build command: `npm install`
  - Start command: `npm start`
  - Auto-deploy: Enabled (on git push to main)

**CI Pipeline:**
- None detected (no GitHub Actions, CircleCI, etc.)
- Render auto-build on push only

**Post-Deployment:**
- Health checks via `/healthz` endpoint (Render/uptime monitors can ping this)
- No smoke tests or integration tests post-deploy

## Environment Configuration

**Required env vars (optional, all have safe defaults):**
- `PORT` - Server port (default 4000)
- `REDIS_URL` - Redis connection (default: empty, RAM-only)
- `SITE_ORIGIN` - CORS allowlist (default: empty, same-origin only)
- `CANONICAL_HOST` - Primary domain for redirects (default: empty, no redirect)
- `SERVER_URL` - Build-time WebSocket endpoint (default: empty, same-origin)

**Example Render env setup:**
```
PORT=4000
REDIS_URL=redis://user:pass@redis-provider.com:6379
SITE_ORIGIN=https://custom-frontend.com
CANONICAL_HOST=battleshiponline.xyz
SERVER_URL=wss://battleshiponline.xyz
```

**Secrets location:**
- None detected
- All sensitive data (if any) would be passed via env vars to Render
- Code contains no hardcoded secrets, API keys, or credentials

## Webhooks & Callbacks

**Incoming:**
- `/healthz` - GET endpoint for uptime monitors (Render, StatusPage, etc.)
- `/metrics` - GET endpoint for ops monitoring (public JSON, no auth)

**Outgoing:**
- None detected
- No webhooks to external services
- Game events (chat, fire, etc.) are local Socket.IO broadcasts only

## SEO & Social Integration

**Open Graph / Social Sharing:**
- `og:image` metadata in `public/index.html` (static image at `/og-image.jpg`)
- Supports Facebook, Zalo, Messenger link previews
- Twitter/X card metadata
- No OAuth or social login integration

**Schema.org Structured Data:**
- VideoGame schema (helps Google understand it's a free game)
- FAQPage schema (for Google FAQ rich results)
- No third-party data synchronization

## Browser/Device APIs

**Client-side only (no backend integration):**
- `localStorage` - Persist clientId for reconnection
- `navigator.language` - Auto-detect user locale (EN vs VI)
- Web Audio API - Sound effects (if enabled)
- WebSocket (Socket.IO) - Real-time updates

---

*Integration audit: 2026-06-01*
