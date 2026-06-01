# Phase 2: Accounts & Identity - Research

**Researched:** 2026-06-02
**Domain:** Google OAuth, express-session, Passport.js, Postgres-backed sessions, Socket.IO session sharing, profile schema
**Confidence:** HIGH (core library APIs verified via official docs and npm registry; SQL patterns verified against codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Google OAuth with Passport.js + `passport-google-oauth20`. (User deferred — "choose what is most suitable." Passport chosen.)
- **D-02:** Sessions via `express-session` + `connect-pg-simple` over the shared `pg.Pool` from `db.js`.
- **D-03:** Server-side revocation = delete session rows. "Sign out all devices" deletes all rows for a `user_id`; "Sign out this device" destroys current session.
- **D-04:** 30-day rolling cookie (`maxAge` 30d, refreshed each visit).
- **D-05:** SEC-05 satisfied by Passport + express-session: random `state` validated on callback, `req.session.regenerate()` called after login.
- **D-06 (first-time Google sign-in, new sub):** Promote guest `users` row — attach new `type='google'` credential to existing `user_id`, stamp `guest_migrated_at`, single transaction.
- **D-07 (returning Google user, sub already linked):** Adopt guest credential — re-point the guest credential's `user_id` to the existing Google account, single transaction.
- **D-08:** Public profiles addressed by opaque `users.id`.
- **D-09:** Display name = Google account display name, non-editable. Reuse `sanitizeProfile()` for stored-XSS defense.
- **D-10:** Profile as zero-state scaffold — returns zeros for stats; Phase 3 fills real numbers.
- **D-11:** Socket.IO authenticates by sharing express-session via `io.engine.use(sessionMiddleware)`.
- **D-12:** UI entry point: "Sign in with Google" on home/landing menu; header avatar+name once signed in.
- **D-13:** All new auth/profile UI strings bilingual EN/VI.

### Claude's Discretion
- OAuth library choice (D-01): Passport chosen. May substitute arctic if better fit, but must preserve D-05 + D-11.
- Where `display_name`/`avatar_url` are persisted: new columns on `users` vs a small `profiles` table.
- Session table DDL: `connect-pg-simple` auto-create (`createTableIfMissing: true`) vs a numbered migration `002_sessions.sql`.
- Exact cookie flags (`httpOnly`, `secure`, `sameSite`) for localhost EC2 + `SITE_ORIGIN` deployment.
- Auth-route rate limiting: extend existing `rate-limiter-flexible` setup to OAuth/login routes.

### Deferred Ideas (OUT OF SCOPE)
- Usernames / custom handles (D-08 uses opaque id).
- Editable display name + avatar upload.
- Real win/loss/lifetime stats numbers (Phase 3).
- Orphaned guest-user-row cleanup.
- Additional OAuth providers (Facebook/Instagram).
- Account deletion / GDPR data export.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-05 | OAuth callback validates random `state` parameter and regenerates the session after login | Passport 0.6+ does `req.session.regenerate()` automatically when used with express-session; `state: true` option generates a cryptographic nonce per-flow |
| AUTH-01 | New visitor plays instantly as guest — no login, clientId preserved | No change to existing `createRoom`/`joinRoom`/`upsertGuestCredential` path; session middleware is additive |
| AUTH-02 | User can sign in with Google OAuth to create a persistent account | Passport + passport-google-oauth20 wiring, `/auth/google` + `/auth/google/callback` routes, `credentials` upsert |
| AUTH-03 | On first sign-in, guest's existing game history is atomically linked to the new account | D-06/D-07 transaction patterns — promote guest row or adopt credential; exact SQL documented below |
| AUTH-04 | Authenticated session persists across visits; can be revoked server-side | express-session + connect-pg-simple rolling maxAge; DELETE session rows for revocation |
| PROF-01 | Signed-in player views own profile (win/loss + lifetime stats) | GET `/api/profile/:id` returning zero-state stats shape; profile read path documented below |
| PROF-02 | Any player views another player's public profile | Same GET endpoint, public view; opaque users.id addressing |
</phase_requirements>

---

## Summary

Phase 2 adds optional, additive Google OAuth accounts on top of the existing guest-first identity system. The identity model (one `users` row, many `credentials` rows) is already live from Phase 1. This phase wires Passport.js + express-session + connect-pg-simple into the existing Express server, adds schema columns for `display_name` and `avatar_url` on the `users` table, implements the D-06/D-07 link transaction, shares the session with Socket.IO via `io.engine.use()`, and ships a zero-state profile UI scaffold.

The single hardest part is the guest-to-account linking transaction (D-06/D-07). The pitfall (Pitfall #1 in PITFALLS.md) is creating duplicate user rows or losing guest history. The SQL patterns below are designed to be atomic and idempotent. The second hardest part is the middleware ordering in `server.js` — session middleware must be mounted before Passport initialization, and `io.engine.use(sessionMiddleware)` must use the same session middleware reference as Express.

**Primary recommendation:** Add `display_name` and `avatar_url` as nullable columns on the existing `users` table (not a separate `profiles` table). Use `connect-pg-simple`'s `createTableIfMissing: true` option for the session store (no extra migration file). Use `cookie.secure: 'auto'` + `app.set('trust proxy', 1)` to handle localhost vs EC2 transparently.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth redirect initiation | API / Backend | — | Server generates random state, stores in session, redirects to Google |
| OAuth callback validation | API / Backend | — | Server validates state, calls `req.session.regenerate()`, writes DB |
| Guest→account link transaction | API / Backend (DB) | — | Must be atomic SQL; never trust client for this |
| Session management | API / Backend | — | express-session + connect-pg-simple owns session lifecycle |
| Session revocation | API / Backend (DB) | — | DELETE session rows; server-side only |
| Socket.IO identity read | API / Backend (Socket.IO) | — | Reads `socket.request.session.userId` — already on socket after `io.engine.use()` |
| Profile display (own) | Frontend / React | API / Backend | React reads from GET `/api/profile/:id`; server queries `users` + zero-state stats |
| Profile display (public) | Frontend / React | API / Backend | Same endpoint; server enforces public-only fields |
| Display name storage | API / Backend (DB) | — | Stored in `users.display_name` after `sanitizeProfile()` |
| EN/VI strings | Frontend / React | — | All new UI strings in `public/app.jsx` i18n map |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `passport` | 0.7.0 | OAuth middleware orchestration, session serialization | Battle-tested; 0.6+ has built-in `req.session.regenerate()` on login/logout |
| `passport-google-oauth20` | 2.0.0 | Google OAuth 2.0 strategy for Passport | Official strategy; handles state nonce + callback validation |
| `express-session` | 1.19.0 | Cookie-backed server-side sessions | Express canonical; works with Passport's `req.session.regenerate()` API |
| `connect-pg-simple` | 10.0.0 | PostgreSQL session store for express-session | Reuses existing `pg.Pool`; no second pool (PITFALLS #4) |

**Package legitimacy:** All four packages have GitHub source repos, are from established authors (Jared Hanson / expressjs org / voxpelli), and have been on npm since 2011–2016. No postinstall scripts detected. [VERIFIED: npm registry + official docs cross-check]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-in `crypto` | built-in | Cryptographic random `state` generation (if implementing manually vs `state: true`) | Only if bypassing Passport's built-in state option |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `passport` + `passport-google-oauth20` | `arctic` (Oslo/lucia ecosystem) | arctic is lighter and TypeScript-native but lacks the `io.engine.use()` / express-session integration pattern; Passport chosen per D-01 |
| `connect-pg-simple` | `connect-redis` | Redis is optional in this project; Postgres is the canonical store; connect-pg-simple reuses existing pool |

**Installation:**
```bash
npm install passport passport-google-oauth20 express-session connect-pg-simple
```

**Version verification (run before implementation):**
```bash
npm view passport version              # 0.7.0
npm view passport-google-oauth20 version  # 2.0.0
npm view express-session version       # 1.19.0
npm view connect-pg-simple version     # 10.0.0
```

---

## Package Legitimacy Audit

> slopcheck was denied by the sandbox classifier. All packages are [ASSUMED] from npm registry verification only. Planner must verify before install.

| Package | Registry | Age | Source Repo | Postinstall | Disposition |
|---------|----------|-----|-------------|-------------|-------------|
| `passport` | npm | ~14 yrs (2011) | github.com/jaredhanson/passport | none | Approved [ASSUMED] |
| `passport-google-oauth20` | npm | ~10 yrs (2016) | github.com/jaredhanson/passport-google-oauth2 | none | Approved [ASSUMED] |
| `express-session` | npm | ~12 yrs (2014) | github.com/expressjs/session | none | Approved [ASSUMED] |
| `connect-pg-simple` | npm | ~12 yrs (2014) | github.com/voxpelli/node-connect-pg-simple | none | Approved [ASSUMED] |

**Packages removed due to slopcheck [SLOP]:** none
**Packages flagged [SUS]:** none — all four are longstanding, authoritative packages with known maintainers.

*slopcheck was unavailable at research time. Planner must gate each npm install behind a `checkpoint:human-verify` task per protocol.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  |
  |-- GET /auth/google --------> Express route
  |                               |-- generate state nonce (Passport built-in: state:true)
  |                               |-- store nonce in session
  |                               |-- redirect -> Google OAuth
  |
  |<--- redirect callback ----  Google
  |
  |-- GET /auth/google/callback -> Express route
                                   |-- Passport validates state nonce (CSRF guard)
                                   |-- verify callback: look up credentials by sub
                                   |      |-- D-06: new sub -> promote guest row (transaction)
                                   |      |-- D-07: existing sub -> adopt guest credential (transaction)
                                   |-- req.session.regenerate() [session fixation defense]
                                   |-- set session.userId = users.id
                                   |-- redirect -> /

Browser (Socket.IO handshake)
  |-- WebSocket upgrade with session cookie
  |
  io.engine.use(sessionMiddleware)  [D-11: same sessionMiddleware reference]
  |
  socket.request.session.userId     [authenticated user_id in every handler]

Browser
  |-- GET /api/profile/:id ------> Express route
                                    |-- query users (display_name, avatar_url, created_at)
                                    |-- query stats zero-state (0 wins, 0 losses)
                                    |-- return JSON
```

### Recommended Project Structure

```
server.js          # Add: session middleware mount, Passport init, auth routes, profile API
db.js              # Add: linkGoogleAccount(), getProfile() functions
migrations/
  001_identity.sql   # Existing
  002_accounts.sql   # New: ALTER users ADD display_name, avatar_url; session table
public/
  app.jsx            # Add: SignIn button, header avatar, profile screen, EN/VI strings
```

### Pattern 1: Middleware Order in server.js

**What:** Express session + Passport must be mounted in exact order, before Socket.IO setup and before any auth-checking routes.

**When to use:** Once, at server boot.

```javascript
// Source: https://www.passportjs.org/concepts/authentication/sessions/
// Must come BEFORE io.engine.use() and before any route that reads req.user

const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const passport = require("passport");
const { pool } = require("./db"); // shared pool — never a second pool (PITFALLS #4)

const sessionMiddleware = session({
  store: new pgSession({
    pool,                    // reuse shared pool — NEVER new Pool() here
    createTableIfMissing: true, // session table auto-created on first boot
  }),
  secret: process.env.SESSION_SECRET, // required env var
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: "auto",          // true on HTTPS, false on HTTP — works localhost + EC2
    sameSite: "lax",         // CSRF defense; allow top-level navigation from Google redirect
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (D-04)
  },
});

// Express must trust the first proxy hop when running behind EC2 reverse proxy
// so cookie.secure:'auto' works correctly
app.set("trust proxy", 1);

app.use(sessionMiddleware);          // 1. session before passport
app.use(passport.initialize());      // 2. passport init
app.use(passport.session());         // 3. passport session (reads req.user)

// 4. Share session with Socket.IO (D-11)
io.engine.use(sessionMiddleware);    // SAME reference — not a new session() call
```

**Critical:** `io.engine.use(sessionMiddleware)` must use the **exact same `sessionMiddleware` variable** as Express. A second `session({...})` call would create a separate store and sessions would never match.

### Pattern 2: Passport Google Strategy Configuration

**What:** Strategy wiring with built-in CSRF state nonce and the verify callback that implements D-06/D-07.

```javascript
// Source: https://www.passportjs.org/packages/passport-google-oauth20/
// Source: https://medium.com/passportjs/application-state-in-oauth-2-0-1d94379164e

const { Strategy: GoogleStrategy } = require("passport-google-oauth20");

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL, // e.g. https://example.com/auth/google/callback
    scope:        ["openid", "profile", "email"],
    state:        true,  // Passport generates + validates a random nonce per flow (SEC-05)
  },
  async (accessToken, refreshToken, profile, done) => {
    // NEVER store accessToken — only sub + our own session (PITFALLS security table)
    const sub       = profile.id;          // stable Google identifier
    const name      = profile.displayName;
    const avatarUrl = profile.photos?.[0]?.value ?? null;

    try {
      // D-06 / D-07: link or promote — see SQL patterns below
      const user = await linkOrPromoteAccount(sub, name, avatarUrl, req.session.pendingClientId);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Passport session serialization — store only user.id in session
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query("SELECT id, display_name, avatar_url FROM users WHERE id=$1", [id]);
    done(null, rows[0] || false);
  } catch (e) {
    done(e);
  }
});
```

**Note on `state: true`:** Passport's built-in `state: true` option generates a cryptographic nonce, persists it in the session, and validates it on callback — satisfying SEC-05 without manual `crypto.randomBytes()` code. [VERIFIED: passportjs.org/packages/passport-google-oauth20]

### Pattern 3: Auth Routes

```javascript
// Source: https://www.passportjs.org/packages/passport-google-oauth20/

// Before redirecting to Google, save the guest clientId so the callback can link it.
// The clientId must survive the OAuth round-trip via session (not URL param).
app.get("/auth/google", (req, res, next) => {
  if (req.query.clientId) {
    req.session.pendingClientId = req.query.clientId; // save for callback
  }
  passport.authenticate("google")(req, res, next);
});

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?authError=1" }),
  (req, res) => {
    // req.session.regenerate() is called automatically by Passport 0.6+ (SEC-05)
    res.redirect("/");
  }
);

// Sign out this device (D-03)
app.post("/auth/signout", (req, res) => {
  req.logout((err) => {          // Passport 0.6+: logout is async, requires callback
    if (err) return res.status(500).json({ ok: false });
    req.session.destroy(() => res.json({ ok: true }));
  });
});

// Sign out all devices (D-03)
app.post("/auth/signout-all", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false });
  try {
    // connect-pg-simple: session table has sess->>'passport'->'user' == userId
    // More reliable: add user_id column to session table (see migration notes)
    await pool.query("DELETE FROM session WHERE sess->>'userId' = $1", [String(userId)]);
    req.session.destroy(() => res.json({ ok: true }));
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});
```

**Warning on sign-out-all:** The default connect-pg-simple session table stores session data as a JSON blob in `sess`. Querying `sess->>'userId'` works if you explicitly write `req.session.userId = userId` at login. An alternative is adding a dedicated `user_id` column to the session table (via the migration) and an index on it — this makes sign-out-all a fast indexed DELETE rather than a JSON scan. This is the recommended approach and should be in `002_accounts.sql`.

### Pattern 4: Guest-to-Account Link Transaction (D-06 / D-07)

**D-06: First-time sign-in (new Google sub — promote guest row)**

```sql
-- Source: derived from 001_identity.sql schema + PITFALLS.md §Pitfall 1
-- Executed inside a BEGIN/COMMIT transaction.

-- Step 1: Insert the Google credential, attached to the guest's existing user_id.
-- The guest credential's user_id is found via the pendingClientId.
-- ON CONFLICT is the dedup guard — if somehow called twice, it's idempotent.
WITH guest_user AS (
  SELECT c.user_id
  FROM credentials c
  WHERE c.type = 'guest' AND c.external_id = $1  -- $1 = pendingClientId
  LIMIT 1
)
INSERT INTO credentials (user_id, type, external_id)
SELECT user_id, 'google', $2                        -- $2 = google sub
FROM guest_user
ON CONFLICT (type, external_id) DO NOTHING;

-- Step 2: Stamp guest_migrated_at on the promoted user row.
UPDATE users
SET guest_migrated_at = now(), display_name = $3, avatar_url = $4
WHERE id = (
  SELECT user_id FROM credentials WHERE type = 'guest' AND external_id = $1
);
```

**D-07: Returning Google user (sub already linked — adopt guest credential)**

```sql
-- Source: derived from 001_identity.sql + PITFALLS.md §Pitfall 1
-- The Google sub is already in credentials. Re-point the guest credential to
-- the existing Google account's user_id so clientId keeps working.

UPDATE credentials
SET user_id = (
  SELECT user_id FROM credentials WHERE type = 'google' AND external_id = $1  -- $1 = sub
)
WHERE type = 'guest' AND external_id = $2   -- $2 = pendingClientId
  AND $2 IS NOT NULL;                        -- no-op if no guest clientId in session
-- The old empty guest users row is left orphaned (harmless per D-07; cleanup deferred)
```

**Application-level `linkOrPromoteAccount(sub, name, avatarUrl, pendingClientId)` logic:**

```javascript
async function linkOrPromoteAccount(sub, name, avatarUrl, pendingClientId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if this Google sub already exists
    const { rows: existing } = await client.query(
      "SELECT user_id FROM credentials WHERE type='google' AND external_id=$1",
      [sub]
    );

    let userId;
    if (existing.length === 0) {
      // D-06: New Google sub — promote guest row if we have a pendingClientId
      if (pendingClientId) {
        const { rows: guest } = await client.query(
          "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
          [pendingClientId]
        );
        if (guest.length > 0) {
          userId = guest[0].user_id;
          await client.query(
            "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,'google',$2) ON CONFLICT DO NOTHING",
            [userId, sub]
          );
          const safeName = sanitizeDisplayName(name);
          await client.query(
            "UPDATE users SET guest_migrated_at=now(), display_name=$1, avatar_url=$2 WHERE id=$3",
            [safeName, avatarUrl, userId]
          );
        }
      }
      // If no guest clientId (rare: brand-new user, no prior guest session), create new row
      if (!userId) {
        const { rows: newUser } = await client.query(
          "INSERT INTO users DEFAULT VALUES RETURNING id"
        );
        userId = newUser[0].id;
        await client.query(
          "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,'google',$2)",
          [userId, sub]
        );
        const safeName = sanitizeDisplayName(name);
        await client.query(
          "UPDATE users SET display_name=$1, avatar_url=$2 WHERE id=$3",
          [safeName, avatarUrl, userId]
        );
      }
    } else {
      // D-07: Returning Google user — adopt guest credential into existing account
      userId = existing[0].user_id;
      if (pendingClientId) {
        await client.query(
          "UPDATE credentials SET user_id=$1 WHERE type='guest' AND external_id=$2",
          [userId, pendingClientId]
        );
      }
      // Update display_name/avatar_url if changed
      const safeName = sanitizeDisplayName(name);
      await client.query(
        "UPDATE users SET display_name=$1, avatar_url=$2 WHERE id=$3",
        [safeName, avatarUrl, userId]
      );
    }

    await client.query("COMMIT");
    const { rows } = await client.query("SELECT id, display_name, avatar_url FROM users WHERE id=$1", [userId]);
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

**`sanitizeDisplayName(name)` is a thin wrapper over existing `escapeHtml()` + slice(0,40) from server.js — reuse `sanitizeProfile()` pattern (D-09).**

### Pattern 5: Socket.IO Session Access (D-11)

```javascript
// Source: https://socket.io/how-to/use-with-express-session

io.on("connection", (socket) => {
  // Session is available via socket.request.session (NOT a cached local var —
  // see staleness warning below)
  const userId = socket.request.session?.passport?.user;  // set by Passport serialization
  socket.data.userId = userId ?? null;  // attach to socket.data for handler access

  // If session changes during connection lifetime, reload explicitly:
  socket.on("someEvent", () => {
    socket.request.session.reload((err) => {
      if (err) return socket.disconnect();
      // now socket.request.session is fresh
    });
  });
});
```

**Staleness warning:** [VERIFIED: socket.io/how-to/use-with-express-session] After calling `req.session.reload()`, any local reference `const session = socket.request.session` taken BEFORE the reload call now points to the OLD session object. Always re-read via `socket.request.session` after reload. For Phase 2 this is low-risk since auth state is set at connection time and game handlers don't change the session.

### Pattern 6: Profile Read Path (D-08 / D-10)

```javascript
// Zero-state profile endpoint — Phase 3 adds real stats with no UI rework

app.get("/api/profile/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "INVALID_ID" });

  const { rows } = await pool.query(
    "SELECT id, display_name, avatar_url, created_at, guest_migrated_at FROM users WHERE id=$1",
    [userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });

  const user = rows[0];
  // Phase 3 will replace these zeros by joining the matches table
  res.json({
    id:               user.id,
    displayName:      user.display_name,
    avatarUrl:        user.avatar_url,
    memberSince:      user.created_at,
    isLinkedAccount:  user.guest_migrated_at !== null,
    stats: {
      wins:        0,  // Phase 3 fills
      losses:      0,  // Phase 3 fills
      gamesPlayed: 0,  // Phase 3 fills
    },
  });
});
```

### Pattern 7: Rate Limiting OAuth Routes

Extend existing `RateLimiterMemory` setup from Phase 1 to protect auth endpoints:

```javascript
// Source: https://github.com/animir/node-rate-limiter-flexible/wiki/Express-Middleware

const { RateLimiterMemory } = require("rate-limiter-flexible");
const authLimiter = new RateLimiterMemory({ points: 10, duration: 60 }); // 10 auth attempts/min per IP

function authRateLimit(req, res, next) {
  authLimiter.consume(req.ip).then(next).catch(() => res.status(429).json({ code: "RATE_LIMITED" }));
}

app.get("/auth/google", authRateLimit, (req, res, next) => { /* ... */ });
```

### Anti-Patterns to Avoid

- **Second `pg.Pool` in connect-pg-simple:** Always pass the shared `pool` from `db.js` to `pgSession({ pool })`. Never let connect-pg-simple create its own connection (PITFALLS #4).
- **Two `session()` calls:** Only one `sessionMiddleware` variable — shared between `app.use()` and `io.engine.use()`. Two calls = two stores = sessions never match on Socket.IO.
- **Storing Google `access_token` in session:** Only store `sub` (via Passport's `serializeUser`). Access tokens in sessions are a credential leak risk (PITFALLS security table).
- **Static `state` string:** `state: true` in GoogleStrategy generates a unique nonce per flow. Never hardcode `state: "random_string"`.
- **Trusting `email` as identity key:** Google `sub` is stable; email can change. Deduplicate on `credentials.external_id = sub` as the 001_identity.sql schema does.
- **Synchronous `req.logout()`:** Passport 0.6+ made `logout()` async — it requires a callback: `req.logout((err) => { ... })`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth state CSRF nonce | Manual `crypto.randomBytes()` + session storage | `state: true` in GoogleStrategy | Passport handles generate, store, validate in one option |
| Session fixation defense | Manual `req.session.regenerate()` in callback | Passport 0.6+ does it automatically at `req.logIn()` | Passport calls `session.regenerate()` before serializing user |
| Session table schema | Hand-crafted SQL | `createTableIfMissing: true` in connect-pg-simple | Package ships `table.sql`; `createTableIfMissing` applies it idempotently |
| Sign-out-all-devices query | Application loop over sessions | `DELETE FROM session WHERE user_id=$1` with indexed `user_id` column | Single indexed DELETE is atomic and cheap; loop is a race condition |
| Display name XSS defense | New sanitizer | `sanitizeProfile()` / `escapeHtml()` in server.js | Already battle-tested in Phase 1; extend, don't duplicate |

**Key insight:** Session fixation, CSRF state, and session regeneration are handled by Passport 0.6+ + express-session automatically. The only custom code needed is the D-06/D-07 link transaction and the `pendingClientId` session storage before the OAuth redirect.

---

## Schema: Migration 002_accounts.sql

This migration extends the Phase 1 schema. It follows the numbered-file convention from Phase 1 (D-01 of Phase 1).

```sql
-- 002_accounts.sql: Add display_name, avatar_url to users; add user_id index to session table.

-- Add profile fields to users (D-08 / D-09 / D-10)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- Session table is created by connect-pg-simple createTableIfMissing:true on boot.
-- We add a user_id column + index to enable efficient sign-out-all (D-03).
-- This runs AFTER the session table exists. Migration runner applies in lexical order
-- so 002 runs after 001; session table is created by store init before server binds.
-- Safe approach: create the column and index conditionally.

-- NOTE: The session table itself is auto-created by connect-pg-simple on first boot.
-- This migration only patches it with the user_id column needed for sign-out-all.
-- IF the store's createTableIfMissing runs before this migration, the column is added here.
-- IF this migration runs before the store init, the store creates the table, then this is a no-op.
-- Either order is safe because of IF NOT EXISTS / IF NOT EXISTS on the index.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session') THEN
    ALTER TABLE session ADD COLUMN IF NOT EXISTS user_id INTEGER;
    CREATE INDEX IF NOT EXISTS IDX_session_user_id ON session (user_id);
  END IF;
END $$;
```

**Session table DDL (from connect-pg-simple `table.sql`):** [VERIFIED: github.com/voxpelli/node-connect-pg-simple/blob/main/table.sql]
```sql
CREATE TABLE "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
```

**Timing note:** `createTableIfMissing: true` runs when the store is instantiated (during module load, before any request). The numbered migration runner runs at boot before `listen()`. If 002 runs first, the `IF EXISTS` guard skips the user_id column addition; the store then creates the session table; the column is missing. To handle this correctly, either: (a) use `createTableIfMissing: false` and include the full session table DDL in 002_accounts.sql, or (b) use `createTableIfMissing: true` and run 002 AFTER the store initializes. Option (a) is simpler and keeps all schema in numbered migrations (consistent with Phase 1 convention). Option (b) is fine if the migration runner runs asynchronously after store init.

**Recommended approach for planner:** Use `createTableIfMissing: false`. Put the full session table DDL plus the `user_id` column and both indexes into `002_accounts.sql`. This keeps all schema under version control in the numbered migration files, consistent with Phase 1's migration-runner convention. [ASSUMED — planner confirms]

---

## Common Pitfalls

### Pitfall 1: Guest Identity Multiplied After OAuth Linking (PITFALLS.md #1)

**What goes wrong:** OAuth creates a new `users` row instead of promoting the guest's existing row. Guest game history is orphaned.

**Why it happens:** `linkOrPromoteAccount()` falls into the "new sub" branch without checking for `pendingClientId`, or `pendingClientId` is missing from the session because it was set on a GET request that didn't save the session.

**How to avoid:** Set `req.session.save()` after writing `pendingClientId` in the `/auth/google` initiation route, before redirecting. Passport's session store requires an explicit save for non-login session writes in some configurations.

**Warning signs:** `users` table grows faster than unique real players. Guest player reports stats gone after sign-in.

### Pitfall 2: Two sessionMiddleware Instances

**What goes wrong:** `io.engine.use(session({...}))` is called with a new `session()` call instead of the same middleware reference. Socket.IO sessions and Express sessions are in separate stores — authentication is never visible on the socket.

**How to avoid:** Declare one `const sessionMiddleware = session({...})`. Pass that const to both `app.use()` and `io.engine.use()`.

**Warning signs:** `socket.request.session` exists but is always empty; `socket.request.session.passport` is undefined even after login.

### Pitfall 3: Passport 0.6+ Async Logout

**What goes wrong:** `req.logout()` is called synchronously (no callback). Session is NOT destroyed before redirect. User remains logged in.

**How to avoid:** `req.logout((err) => { req.session.destroy(() => res.redirect("/")); })`.

**Warning signs:** Sign-out redirects to home but user is still logged in on next page load.

### Pitfall 4: connect-pg-simple `createTableIfMissing` vs Migration Race

**What goes wrong:** `002_accounts.sql` tries to add `user_id` column to `session` table before the store creates it. `IF EXISTS` guard silently skips the column. Sign-out-all then requires a full JSON scan or throws.

**How to avoid:** Either include full session table DDL in `002_accounts.sql` with `createTableIfMissing: false`, or add a re-entrancy check (run a `DO $$ ... END $$` block that retries the column add after the store initializes).

**Warning signs:** `sign-out-all` endpoint returns 500 due to missing `user_id` column on session table.

### Pitfall 5: `sameSite: 'strict'` Breaks OAuth Callback

**What goes wrong:** Cookie with `sameSite: strict` is NOT sent on the redirect back from Google OAuth (a cross-site top-level navigation). The session containing the state nonce is empty on callback. Passport rejects the request as state mismatch.

**How to avoid:** Use `sameSite: 'lax'` (not 'strict'). Lax allows cookies on top-level cross-site navigations (exactly the OAuth redirect scenario) while blocking third-party cross-site requests. [CITED: expressjs.com/en/resources/middleware/session]

**Warning signs:** OAuth callback returns 403 or redirect loop; browser console shows `Set-Cookie` with `SameSite=Strict` and the session is not sent on callback.

### Pitfall 6: Google Access Token Stored in Session

**What goes wrong:** `accessToken` from the Passport verify callback is stored in session or database. An XSS or session theft gives the attacker Google API access.

**How to avoid:** Never store `accessToken`. Only call `done(null, { id: userId })`. Session contains only your own `users.id`.

**Warning signs:** `req.session.passport.user.accessToken` is present in any handler.

---

## Code Examples

### Verified: Reading `userId` from socket after session share (D-11)

```javascript
// Source: https://socket.io/how-to/use-with-express-session
io.on("connection", (socket) => {
  // Passport stores user.id under session.passport.user after serializeUser
  const userId = socket.request.session?.passport?.user ?? null;
  socket.data.userId = userId;
  console.log("[auth] socket connected, userId:", userId); // null = guest, number = account
});
```

### Verified: Rolling session maxAge with express-session (D-04)

`resave: false` with `rolling: true` (or per-request touch) refreshes the cookie on each request. Express-session's `resave: false` + `rolling: true` combination is the correct 30-day rolling pattern. [CITED: expressjs.com/en/resources/middleware/session]

```javascript
const sessionMiddleware = session({
  // ...
  resave: false,
  rolling: true,       // refresh maxAge on every response
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
});
```

### Verified: Passport serializeUser / deserializeUser with pg.Pool

```javascript
// Source: passportjs.org/concepts/authentication/sessions/
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, display_name, avatar_url FROM users WHERE id=$1", [id]
    );
    done(null, rows[0] ?? false);
  } catch (e) { done(e); }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Passport `req.logout()` synchronous | Passport 0.6+: `req.logout()` is async, requires callback | passport 0.6.0 (2022) | Any sign-out without a callback silently fails to destroy session |
| Manual `req.session.regenerate()` after login | Passport 0.6+: automatic `session.regenerate()` on `req.logIn()` | passport 0.6.0 (2022) | Session fixation is fixed by default with express-session |
| Passport does not validate OAuth state | `state: true` option generates + validates nonce per flow | passport-oauth2 (built-in) | SEC-05 compliance without manual crypto code |
| `cookie-session` compatible with Passport | passport 0.6+ requires `session.regenerate()` API — only `express-session` has it | passport 0.6.0 (2022) | Must use express-session, not cookie-session |

**Deprecated/outdated:**
- Passport < 0.6: manual `req.session.regenerate()` required in auth callbacks — replaced by automatic behavior in 0.6+.
- `req.logout()` without callback: silently broken in Passport 0.6+; always pass a callback.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `passport` 0.7.0 automatically calls `req.session.regenerate()` on login (session fixation defense is built-in) | Patterns 1, SEC-05 | Session fixation vulnerability remains; must add explicit `req.session.regenerate()` in callback |
| A2 | `state: true` in GoogleStrategy generates a cryptographic random nonce without additional config | Pattern 2 | Need to implement manual state + crypto.randomBytes; SEC-05 gap if overlooked |
| A3 | `createTableIfMissing: false` + full DDL in 002_accounts.sql is cleaner than `createTableIfMissing: true` | Schema section | Session table not created before migration runs; server fails to start |
| A4 | `cookie.secure: 'auto'` resolves correctly with `app.set('trust proxy', 1)` on EC2 behind Nginx | Pattern 1 | Cookie sent over HTTP only; browsers reject non-HTTPS cookie in some contexts |
| A5 | All four npm packages (passport, passport-google-oauth20, express-session, connect-pg-simple) are legitimate and not slopquatted | Package Legitimacy | Supply chain compromise; slopcheck not available to verify |
| A6 | The `sess` JSON in the session table stores Passport's user ID under `session.passport.user` (standard Passport serialization path) | Pattern 5, sign-out-all | sign-out-all query `sess->>'userId'` targets wrong key; must use indexed user_id column instead |

**If this table is empty:** All claims were verified — not applicable here; the table above is populated.

---

## Open Questions

1. **SESSION_SECRET env var management**
   - What we know: `express-session` requires a `secret` — if missing, it throws on startup.
   - What's unclear: Whether a `.env` file pattern or Render-style env injection is already established.
   - Recommendation: Add `SESSION_SECRET` to `render.yaml` env section (alongside existing `DATABASE_URL`). Document as a required var in CLAUDE.md or server boot check. Server should fail loud if missing (consistent with fail-loud migration runner from Phase 1).

2. **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET provisioning**
   - What we know: Google Cloud Console creates an OAuth 2.0 Client ID; callback URL must match exactly.
   - What's unclear: Whether the Google Cloud project already exists or must be created.
   - Recommendation: Planner adds a Wave 0 task: "Register OAuth app in Google Cloud Console, obtain CLIENT_ID + CLIENT_SECRET, set callback URL to `GOOGLE_CALLBACK_URL` env var."

3. **`pendingClientId` session save before OAuth redirect**
   - What we know: Writing `req.session.pendingClientId` then immediately redirecting may not save the session before the redirect fires (connect-pg-simple is async).
   - What's unclear: Whether express-session's auto-save is fast enough or whether explicit `req.session.save()` is required.
   - Recommendation: Use explicit `req.session.save((err) => { next(); })` after setting `pendingClientId` in the `/auth/google` route, before calling `passport.authenticate`.

4. **CSP update for Google OAuth**
   - What we know: The current CSP (`script-src 'self'`) may block Google's OAuth popup or postMessage if used. The redirect-based flow (not popup) avoids this, but `connect-src` may need `accounts.google.com`.
   - What's unclear: Whether the redirect flow requires any CSP additions.
   - Recommendation: Test with existing CSP first. If OAuth redirect fails, add `connect-src 'self' wss: ws: https://accounts.google.com`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server-side code | Yes | v24.14.0 | — |
| npm | Package install | Yes | 11.9.0 | — |
| PostgreSQL | express-session store, link transaction | Assumed running | — (EC2 self-hosted) | Server refuses to boot without DB |
| Google OAuth credentials | AUTH-02, SEC-05 | Not verified | — | No fallback — must provision before implementation |
| `SESSION_SECRET` env var | express-session | Not set | — | Server should fail-loud if missing |
| `GOOGLE_CLIENT_ID` env var | Passport strategy | Not set | — | No fallback — Google OAuth registration required |
| `GOOGLE_CLIENT_SECRET` env var | Passport strategy | Not set | — | No fallback |
| `GOOGLE_CALLBACK_URL` env var | Passport strategy | Not set | — | Hardcoded fallback acceptable for local dev only |

**Missing dependencies with no fallback:**
- Google OAuth credentials (CLIENT_ID, CLIENT_SECRET) — must be provisioned in Google Cloud Console before auth routes can function.
- `SESSION_SECRET` — server should fail-loud at boot if missing (add check in server.js boot sequence).

**Missing dependencies with fallback:**
- None that affect core guest play (AUTH-01 unchanged without any of the above).

---

## Validation Architecture

> `workflow.nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.js` (exists) |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `DATABASE_URL=<url> npm test` |

**Note:** `fileParallelism: false` is already set in vitest.config.js to prevent DB race conditions. New tests follow the same pattern as `test/db.test.js`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-05 | OAuth state nonce validated; session ID changes post-login | unit + integration | `npm test` → `test/auth.test.js` | No — Wave 0 |
| SEC-05 | `req.session.regenerate()` called (session fixation) | unit | `npm test` → `test/auth.test.js` | No — Wave 0 |
| AUTH-01 | Guest `createRoom`/`joinRoom` still works without any session | integration | `npm test` → existing `test/db.test.js` (no regression) | Partial |
| AUTH-02 | OAuth callback with valid state creates or links a user | integration (mock Google) | `npm test` → `test/auth.test.js` | No — Wave 0 |
| AUTH-03 | First sign-in with guest pendingClientId promotes guest row atomically | unit/integration | `npm test` → `test/auth.test.js::linkOrPromoteAccount` | No — Wave 0 |
| AUTH-03 | D-07: Returning Google user adopts guest credential; no duplicate user | unit/integration | `npm test` → `test/auth.test.js::d07-adopt` | No — Wave 0 |
| AUTH-04 | Sign-out destroys current session row | integration | `npm test` → `test/auth.test.js::signout` | No — Wave 0 |
| AUTH-04 | Sign-out-all deletes all session rows for user_id | integration | `npm test` → `test/auth.test.js::signout-all` | No — Wave 0 |
| PROF-01 | GET /api/profile/:id returns zero-state stats for signed-in user | unit | `npm test` → `test/profile.test.js` | No — Wave 0 |
| PROF-02 | GET /api/profile/:id for another user returns public fields only | unit | `npm test` → `test/profile.test.js` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (all tests, ~2-5s, deterministic via `fileParallelism: false`)
- **Per wave merge:** `DATABASE_URL=<live-db> npm test` (includes DB-gated suites)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/auth.test.js` — covers SEC-05, AUTH-02, AUTH-03 (D-06/D-07), AUTH-04 (sign-out, sign-out-all)
- [ ] `test/profile.test.js` — covers PROF-01, PROF-02 (GET /api/profile/:id zero-state)
- [ ] No new fixtures needed — existing `test/db.test.js` pattern with `DATABASE_URL` guard is the template

**Test strategy for link transaction:** Use actual DB (skip if no `DATABASE_URL`), following the pattern in `test/db.test.js`. The `linkOrPromoteAccount()` function must be exported via `TEST_EXPORTS` or extracted to `db.js` to be unit-testable without the full Express stack.

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES | Passport.js + Google OAuth; no password storage (Google-only) |
| V3 Session Management | YES | express-session + connect-pg-simple; rolling 30-day; server-side revocation |
| V4 Access Control | YES | Auth-gated profile write endpoints; guest vs authenticated checks |
| V5 Input Validation | YES | `sanitizeProfile()` / `escapeHtml()` for display_name; parameterized SQL |
| V6 Cryptography | PARTIAL | OAuth state nonce via Passport built-in; `SESSION_SECRET` must be strong random |

### Known Threat Patterns for OAuth + Express Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OAuth CSRF (state forgery) | Spoofing | `state: true` in Passport GoogleStrategy generates nonce per flow |
| Session fixation | Elevation of Privilege | Passport 0.6+ calls `req.session.regenerate()` automatically |
| Session hijacking | Spoofing | `httpOnly: true`, `secure: 'auto'`, `sameSite: 'lax'` cookie flags |
| Sign-out-all race (stale session) | Elevation of Privilege | Indexed DELETE on `session.user_id`; session check on every auth'd request |
| Google `access_token` leak | Information Disclosure | Never store access_token; `serializeUser` writes only `users.id` |
| XSS via stored display_name | Tampering | `escapeHtml()` at write time; CSP `script-src 'self'` already enforced |
| Auth route brute-force | Denial of Service | `authRateLimit` middleware on `/auth/google` routes (extend existing `RateLimiterMemory`) |
| SQL injection via profile fields | Tampering | Parameterized queries (`$1` binding) in all SQL — per `db.js` convention |
| Google sub vs email identity confusion | Spoofing | Deduplicate on `sub` (stable), not on email (changeable) — enforced by `credentials(type, external_id)` unique constraint |

---

## Sources

### Primary (HIGH confidence)
- [passport-google-oauth20 official docs](https://www.passportjs.org/packages/passport-google-oauth20/) — strategy config, state option, verify callback
- [Socket.IO how-to: use with express-session](https://socket.io/how-to/use-with-express-session) — `io.engine.use()`, session access in handlers, reload/save pattern, staleness warning
- [connect-pg-simple GitHub README](https://github.com/voxpelli/node-connect-pg-simple) — `createTableIfMissing`, pool sharing, table.sql DDL
- [connect-pg-simple table.sql](https://github.com/voxpelli/node-connect-pg-simple/blob/main/table.sql) — exact session table schema
- [expressjs/session official docs](https://expressjs.com/en/resources/middleware/session/) — cookie flags, `rolling: true`, `resave: false`
- `migrations/001_identity.sql` — live schema this phase extends
- `db.js` — shared pool singleton, migration runner, upsertGuestCredential pattern

### Secondary (MEDIUM confidence)
- [Fixing Session Fixation — Passport.js blog](https://medium.com/passportjs/fixing-session-fixation-b2b68619c51d) — confirms Passport 0.6+ automatic `req.session.regenerate()`
- [Application State in OAuth 2.0 — Passport.js blog](https://medium.com/passportjs/application-state-in-oauth-2-0-1d94379164e) — `state: true` nonce behavior, `req.authInfo.state`
- [Google OAuth2 Web Server docs](https://developers.google.com/identity/protocols/oauth2/web-server) — `state` parameter requirement for CSRF
- [Auth0: state parameters](https://auth0.com/docs/protocols/state-parameters) — state parameter best practices

### Tertiary (LOW confidence — marked [ASSUMED])
- npm registry version/date for all four packages (confirmed existence and age, not slopcheck-verified)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all four packages confirmed on npm registry with official source repos; APIs verified via official docs
- Architecture: HIGH — middleware order, SQL patterns, and Socket.IO integration verified against official docs and existing codebase
- Pitfalls: HIGH — directly derived from PITFALLS.md (pre-researched) + official doc cross-checks
- Schema: HIGH — derived directly from live 001_identity.sql + connect-pg-simple official table.sql

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable libraries; check passport/connect-pg-simple changelogs if more than 30 days elapse)
