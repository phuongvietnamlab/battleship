# Stack Research

**Domain:** Multiplayer web game — adding persistence, auth, matchmaking, ranking, and replays to existing Node/Express/Socket.IO/React stack
**Researched:** 2026-06-01
**Confidence:** HIGH (versions verified against npm registry; architecture claims cross-referenced with official docs and current community guidance)

---

## Existing Stack (Do Not Re-Recommend)

The following are already in production and must be preserved:

- Node.js + Express ^4.19.2 — HTTP server
- Socket.IO ^4.7.5 — real-time game communication
- React ^18.2.0 + esbuild ^0.24.0 — frontend bundle
- Redis ^4.7.0 (optional) — crash-recovery snapshots
- Render.io free tier — hosting, auto-deploy

Everything below is strictly additive.

---

## Recommended Stack — New Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `pg` (node-postgres) | 8.21.0 | Postgres client driver | Battle-tested, widely supported, first-class SSL support, Pool API fits single-process Node server. Render managed Postgres docs show `pg.Pool` as the standard connection pattern. Drizzle ORM wraps it natively. |
| `drizzle-orm` | 0.45.2 | Schema definition + query builder + migration runner | Lightest viable ORM at ~50 KB. Works with plain JavaScript (no TypeScript required). Generates readable SQL migrations. `drizzle-kit migrate` runs on app startup — safe for Render auto-deploy. Zero codegen step unlike Prisma. Crossed Prisma in weekly downloads mid-2025. |
| `drizzle-kit` | 0.31.10 | Migration file generation + CLI | Companion to drizzle-orm. `drizzle-kit generate` produces SQL migration files; `drizzle-kit migrate` applies them. Run as a prestart script on Render so migrations always precede app boot. |
| `passport` | 0.7.0 | Auth middleware framework | De-facto Express authentication middleware. Strategy-based — adding Google OAuth is one `require()` away. Integrates cleanly with `express-session`. |
| `passport-google-oauth2` | 0.2.0 | Google OAuth 2.0 strategy | Official Passport strategy for Google. Handles PKCE + token exchange. The verify callback is where guest-to-account linking logic lives. |
| `express-session` | 1.19.0 | Server-side session management | Required by Passport to persist the authenticated identity across requests. Must be backed by Postgres (not the default in-memory store) in production. |
| `connect-pg-simple` | 10.0.0 | Postgres session store for express-session | Stores sessions in a `session` table in Render Postgres. Most actively maintained Postgres session store for Express. Avoids a separate Redis session dependency. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `helmet` | 8.2.0 | HTTP security headers | Add to Express on every request. Sets CSP, HSTS, X-Frame-Options. Required once OAuth and public matchmaking are live — auth endpoints are attack surface. |
| `express-rate-limit` | 8.5.2 | Per-IP rate limiting on REST + Socket.IO | Apply to `/auth/*`, `/api/matchmaking`, and `fire`/`useAbility` Socket.IO events. PROJECT.md explicitly flags `fire`/`useAbility` as unrate-limited. No extra infrastructure needed — uses in-memory sliding window by default. |
| `jsonwebtoken` | 9.0.3 | Stateless guest identity tokens | Issue a signed JWT containing `clientId` on first visit. The browser stores it in `localStorage` (already the pattern). When the player authenticates via Google, the server reads `clientId` from the JWT and merges guest stats into the new account row. Does not replace `express-session` — JWT is for client→server identity proof only. |
| `elo-rank` | 1.0.4 | ELO rating calculation | Tiny (no dependencies), configurable K-factor. `new EloRank(32)` creates a ranker; `.getExpected(ratingA, ratingB)` and `.updateRating(expected, actual, rating)` are the only two methods needed. Sufficient for a 1v1 game. See hand-rolled section below for why a library is still the right call. |
| `joi` | 18.2.1 | Input validation for REST API bodies | Validate player profile fields, tournament bracket submissions, and chat message payloads on the server. Pairs with Express middleware. Prefer over `zod` here because the project is plain JavaScript — `zod`'s value is TypeScript inference which doesn't apply. |
| `dotenv` | 17.4.2 | Local env var loading | Load `.env` in development. Render injects env vars natively in production — `dotenv` is a dev-only convenience. Already likely needed once `GOOGLE_CLIENT_ID`, `DATABASE_URL`, `SESSION_SECRET` are added. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `drizzle-kit` | Schema diffing + migration file generation | Run `npx drizzle-kit generate` when schema changes; commit the generated SQL to `drizzle/` folder. Run `npx drizzle-kit migrate` as `prestart` in `package.json`. |
| `pg-mem` (optional) | In-process Postgres emulation for tests | Lets future unit tests run database queries without a live Postgres. Low priority until the project adds a test suite, but worth knowing exists. |

---

## Installation

```bash
# Core persistence + auth
npm install pg drizzle-orm passport passport-google-oauth2 express-session connect-pg-simple

# Rating + validation
npm install elo-rank joi jsonwebtoken dotenv

# Security
npm install helmet express-rate-limit

# Dev: migration CLI
npm install -D drizzle-kit
```

---

## Render Postgres — Critical Constraint

**Free tier expires after 30 days with no grace period and no backup.**

For any milestone work:
- Use the **Starter paid tier at $7/month** (persistent, 256 MB RAM, 1 GB storage) for development persistence.
- The $20/month Basic tier is minimum viable for production load with multiple connections.
- Connection limit: ~97 simultaneous connections on <8 GB RAM instances. A single-process Node server with `pg.Pool` (default pool size: 10) is well within this limit.
- SSL is required for external connections. Set `ssl: { rejectUnauthorized: false }` in `pg.Pool` config when using Render's external URL. Internal connections (same Render private network) can skip SSL.

---

## Architecture Decisions by Feature

### Postgres Client Setup

Use `pg.Pool` directly, wrapped by Drizzle:

```js
// db.js
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { schema } = require('./schema');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,          // fits within Render's connection limit
  idleTimeoutMillis: 30000,
});

const db = drizzle(pool, { schema });
module.exports = { db, pool };
```

### Guest-First Identity + Google OAuth Upgrade

The identity model has three states:

1. **Pure guest** — `clientId` in `localStorage`, no account row in Postgres.
2. **Registered** — Google OAuth completed, `players` table row exists, `google_id` column populated.
3. **Linked** — guest upgraded to registered; guest `clientId` mapped to a `players` row.

**Linking flow:**

```
Player clicks "Sign in with Google"
  → server reads clientId JWT from request header
  → Passport Google strategy callback fires
  → verify callback looks up existing player by google_id
    → found: log in, done
    → not found: create player row, copy stats from guest_stats where clientId matches, return new player
```

The key: the Passport verify callback receives the current `req` object (use `passport.use(new GoogleStrategy({ passReqToCallback: true }, callback))`). Inside, read `req.headers['x-client-id']` or a short-lived signed token. Use it to look up any existing guest game records and `UPDATE` their `player_id` foreign key before committing the new account.

### Session vs JWT

- `express-session` + `connect-pg-simple` handles **authenticated** sessions (after Google OAuth).
- A **signed JWT** (HS256, `jsonwebtoken`) carries `clientId` for guests. The client sends it as a header on matchmaking/ranked API calls. This avoids a session for non-authenticated users and keeps guest play stateless.
- Do NOT issue JWTs as auth tokens for OAuth users — use sessions. Sessions allow instant invalidation (server-side revocation by deleting the session row).

### ELO / Ranking

Use `elo-rank` rather than hand-rolling. The formula is three lines but teams consistently miscalculate provisional period behavior and rating floors. `elo-rank` handles K-factor configuration. Recommended settings:

- Starting rating: 1200 (industry standard)
- K-factor: 32 for players under 30 games; 16 for established players
- Minimum floor: 100 (prevent negative ratings)
- Provisional flag: first 10 games displayed as "?" or "~rating"

Store `elo_rating` (integer), `elo_games_played` (integer), and `elo_peak` (integer) on the `players` table.

For seasonal resets: add an `elo_season` column. Copy current rating to `elo_peak`, set `elo_rating = floor(elo_rating * 0.75 + 1200 * 0.25)` (soft reset toward 1200). Store season history in a separate `elo_history` table.

### Replay Storage

Store replays as a **JSONB event log** in Postgres — do not use a separate file store.

A Battleship game is ~50-100 shots. Each event is a small object: `{ type: 'fire', player: 1, x: 4, y: 7, result: 'hit', ts: 1234567890 }`. The full event log for one game serializes to 5-15 KB. At 10,000 games/day this is ~100 MB/day of replay data — manageable in a 1 GB Render Postgres for months.

Schema:
```sql
CREATE TABLE replays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code   text,
  player1_id  uuid REFERENCES players(id),
  player2_id  uuid REFERENCES players(id),
  winner_id   uuid REFERENCES players(id),
  mode        text,        -- 'ranked', 'quick', 'private'
  events      jsonb,       -- array of game events
  grid_size   smallint,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX replays_player1_idx ON replays (player1_id);
CREATE INDEX replays_player2_idx ON replays (player2_id);
```

Client-side replay: feed the events array through the existing game renderer by replaying Socket.IO events in a `setInterval` loop. No new renderer code required.

### Matchmaking Queue

No external queue library needed. In a single-process Render deployment, an in-memory array is sufficient for the quick-match queue:

```
waitingQueue: [{ socketId, playerId, clientId, elo, enqueuedAt }, ...]
```

When a player enqueues, scan for the opponent with the closest ELO rating within a max delta (start at ±200, widen by 50 every 10 seconds). If found, create a room and emit `matchFound` to both sockets. If the process restarts (Render redeploy), players re-queue — acceptable for free-tier reliability.

**Important:** Socket.IO is already using in-memory rooms. Matchmaking rooms flow through the same path. No Redis pub-sub needed at single-process scale.

For multi-process scale (future): add a Postgres `matchmaking_queue` table with `SELECT ... FOR UPDATE SKIP LOCKED`. This pattern requires zero additional infrastructure and scales to multiple Render instances when needed.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `drizzle-orm` | Prisma 6 | If the project migrates to TypeScript; Prisma's DX and Prisma Studio become valuable. Not worth the 500 KB bundle overhead for a plain-JS project. |
| `drizzle-orm` | Kysely | If you want maximum SQL control with no ORM opinions. Kysely requires writing your own migration tooling — adds friction on a solo/small team project. |
| `drizzle-orm` | Raw `pg` queries | Fine for small projects, but migration management and query composition become painful past ~10 tables. |
| `passport` + `passport-google-oauth2` | `@auth/express` (Auth.js) | Auth.js v5 now officially supports Express adapter. More batteries-included (automatic session handling). Choose Auth.js if starting fresh. Passport is the lower-risk choice for brownfield Express because it requires fewer middleware changes. |
| `elo-rank` | Hand-rolled ELO | Hand-rolled is fine — the math is simple. Use a library to avoid subtle mistakes with K-factor assignment and rating floor clamping during early implementation. |
| `connect-pg-simple` | Redis session store | Redis already optional in this project; adding it as a session-only dependency introduces another moving part. `connect-pg-simple` consolidates everything in the already-required Postgres. |
| Postgres JSONB event log (replays) | S3/object storage | Unnecessary complexity for game-scale event logs (<15 KB each). Object storage makes sense only if storing video or large binary replays. |
| In-memory matchmaking queue | Bull/BullMQ (Redis queue) | Bull is appropriate when jobs need persistence across restarts, retries, or distributed workers. Matchmaking retries are cheap (player re-queues); a Redis-backed job queue is over-engineering for this use case at single-process scale. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Prisma (for this project) | ~15 MB install, requires codegen (`prisma generate`), designed for TypeScript. Over-engineered for a plain-JS brownfield codebase that needs simple persistence added. | `drizzle-orm` |
| TypeORM | Unmaintained in practice; decorator-based design assumes TypeScript classes; known issues with complex migration generation. Fell out of community favor by 2024. | `drizzle-orm` |
| Auth0 / Firebase Auth | Monthly cost and vendor lock-in for an indie game. Brings more features than needed (MFA, enterprise SSO). | `passport` + `passport-google-oauth2` (self-hosted) |
| `next-auth` / `@auth/express` (for brownfield) | Auth.js Express adapter was in beta as of early 2025 and requires more middleware refactoring than Passport for existing Express apps. Revisit once the adapter stabilizes. | `passport` |
| `express-session` with default MemoryStore in production | Leaks memory, resets on every Render redeploy, does not survive process restarts. Official docs warn against it explicitly. | `connect-pg-simple` as the session store |
| `sequelize` | Last major release 2022; TypeScript support bolted-on; heavy and slow query generation. Effectively community-deprecated in favor of Drizzle/Prisma/Kysely. | `drizzle-orm` |
| `socket.io-redis` adapter (for single-process) | Adds Redis as a hard dependency for a problem that doesn't exist yet (multi-process Socket.IO). Wait until horizontal scaling is actually needed. | In-memory adapter (current) |
| JWT as sessions for authenticated users | JWTs cannot be revoked without a blocklist, which defeats the purpose. Use server-side sessions (express-session + Postgres store) for logged-in users. | `express-session` |
| `bcrypt` / email+password auth | Out of scope per PROJECT.md. Owning password storage means owning resets, breach response, and credential hashing. Google OAuth avoids all of this. | `passport-google-oauth2` |
| zod (in plain JavaScript) | `zod`'s primary value is TypeScript type inference at compile time. In a plain-JS project you get runtime validation only — the same thing `joi` provides with a more mature API and better Express middleware ecosystem. | `joi` |

---

## Environment Variables to Add

```
# Postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE

# Session
SESSION_SECRET=<random 64-char string>

# Google OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback

# JWT (guest tokens)
JWT_SECRET=<random 64-char string>
```

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `drizzle-orm` 0.45.2 | `pg` 8.x | `drizzle-orm/node-postgres` driver. Use `pg` 8.21.0. Do NOT use `postgres.js` driver — it uses prepared statements by default which conflict with PgBouncer if Render connection pooling is added later. |
| `drizzle-kit` 0.31.10 | `drizzle-orm` 0.45.2 | Must match minor versions. Both are on the 0.x track until Drizzle reaches v1.0 stable (currently in RC as of 2026-06). |
| `passport` 0.7.0 | `express-session` 1.19.0 | Passport `serializeUser` / `deserializeUser` requires session middleware to be mounted before `passport.session()`. |
| `connect-pg-simple` 10.0.0 | `express-session` 1.19.0 | Pass the `session` constructor: `new (connectPgSimple(session))({ pool })`. |
| `passport-google-oauth2` 0.2.0 | `passport` 0.7.0 | Set `passReqToCallback: true` to access `req.headers` in the verify callback for guest-linking. |

---

## Sources

- [npmjs.com — drizzle-orm](https://www.npmjs.com/package/drizzle-orm) — version 0.45.2 verified via npm registry
- [npmjs.com — drizzle-kit](https://www.npmjs.com/package/drizzle-kit) — version 0.31.10 verified via npm registry
- [npmjs.com — pg](https://www.npmjs.com/package/pg) — version 8.21.0 verified via npm registry
- [npmjs.com — passport](https://www.npmjs.com/package/passport) — version 0.7.0 verified
- [npmjs.com — passport-google-oauth2](https://www.npmjs.com/package/passport-google-oauth2) — version 0.2.0 verified
- [npmjs.com — express-session](https://www.npmjs.com/package/express-session) — version 1.19.0 verified
- [npmjs.com — connect-pg-simple](https://www.npmjs.com/package/connect-pg-simple) — version 10.0.0 verified
- [npmjs.com — elo-rank](https://www.npmjs.com/package/elo-rank) — version 1.0.4 verified
- [orm.drizzle.team/docs/get-started-postgresql](https://orm.drizzle.team/docs/get-started-postgresql) — setup, driver options, SSL config (HIGH confidence)
- [pkgpulse.com — Drizzle ORM v1 vs Prisma 6 vs Kysely 2026](https://www.pkgpulse.com/guides/drizzle-orm-v1-vs-prisma-6-vs-kysely-2026) — download trends, ecosystem comparison (MEDIUM confidence)
- [render.com/docs/postgresql-creating-connecting](https://render.com/docs/postgresql-creating-connecting) — connection strings, SSL requirements (HIGH confidence)
- [kuberns.com/blogs/render-postgres-pricing-setup-limits](https://kuberns.com/blogs/render-postgres-pricing-setup-limits) — free tier 30-day expiry, RAM/storage limits (MEDIUM confidence, cross-references Render official docs)
- [github.com/dmamills/elo-rank](https://github.com/dmamills/elo-rank) — elo-rank API (HIGH confidence)
- [dev.to — Event Storage in Postgres](https://dev.to/kspeakman/event-storage-in-postgres-4dk2) — JSONB event log pattern for replay storage (MEDIUM confidence)

---
*Stack research for: Battleship Online — persistence, auth, matchmaking, ranking, replays milestone*
*Researched: 2026-06-01*
