# Phase 2: Accounts & Identity - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (modify) | server / middleware | request-response | `server.js` itself | exact (self-modify) |
| `db.js` (modify) | service / data access | CRUD | `db.js` itself | exact (self-modify) |
| `migrations/002_accounts.sql` | migration | batch/DDL | `migrations/001_identity.sql` | exact |
| `public/app.jsx` (modify) | component / SPA | request-response | `public/app.jsx` itself | exact (self-modify) |
| `test/auth.test.js` | test | CRUD + integration | `test/db.test.js` | exact |
| `test/profile.test.js` | test | request-response | `test/db.test.js` | exact |

---

## Pattern Assignments

### `server.js` — session + Passport middleware mount, auth routes, profile API, socket wiring (D-01..D-11)

**Analog:** `server.js` itself — extend at the four integration points listed below.

#### Integration point 1: Middleware insertion order (lines 6–27 → insert BEFORE io is used)

The pattern for inserting new middleware is to add `app.use()` calls early, after static files but before Socket.IO route binding. Current middleware stack in order:
- `cspMiddleware` (line 51)
- `express.static` (lines 62–63)
- Socket.IO handlers start at line ~320 (`io.on("connection", ...)`)

New session + Passport middleware must be inserted **after line 63 (static files) and before the `io.on("connection")` block**. The `io.engine.use(sessionMiddleware)` call must use the **same variable** as `app.use(sessionMiddleware)`.

```javascript
// Insert after line 63 (app.use express.static calls):

const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const passport = require("passport");
// pool is already required from db.js at line 11

app.set("trust proxy", 1); // for cookie.secure:'auto' behind EC2/Nginx

const sessionMiddleware = session({
  store: new pgSession({
    pool,                         // reuse shared pool — NEVER new Pool() (PITFALLS #4)
    createTableIfMissing: false,  // session table DDL is in 002_accounts.sql (see migration)
  }),
  secret: process.env.SESSION_SECRET,  // fail-loud env var check below
  resave: false,
  rolling: true,                  // refresh maxAge on every response (D-04)
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: "auto",               // true on HTTPS, false on HTTP — works localhost + EC2 (A4)
    sameSite: "lax",              // 'strict' breaks OAuth callback redirect (PITFALLS #5)
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (D-04)
  },
});

if (!process.env.SESSION_SECRET) {
  console.error("[auth] SESSION_SECRET env var is required — exiting");
  process.exit(1);
}

app.use(sessionMiddleware);       // 1. session before passport
app.use(passport.initialize());   // 2. passport init
app.use(passport.session());      // 3. passport session (populates req.user)

// D-11: share SAME sessionMiddleware reference with Socket.IO
// Do this AFTER io is constructed (line 19), BEFORE io.on("connection")
io.engine.use(sessionMiddleware);
```

#### Integration point 2: Passport strategy + serializeUser (new block, after session setup)

```javascript
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    scope:        ["openid", "profile"],
    state:        true,   // Passport generates + validates random nonce per flow (SEC-05, A2)
  },
  async (accessToken, refreshToken, profile, done) => {
    // NEVER store accessToken (PITFALLS security table — Pitfall 6)
    const sub       = profile.id;
    const name      = profile.displayName;
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    // pendingClientId not accessible here — GoogleStrategy verify callback
    // does not receive req by default. Use passReqToCallback:true to access req.
    // See auth routes below for how pendingClientId is threaded in.
    try {
      const user = await linkOrPromoteAccount(sub, name, avatarUrl, profile._pendingClientId);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

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

#### Integration point 3: Auth routes (new block — add alongside `/healthz` and `/metrics`)

Pattern: guard-clause early returns, named error codes, same prefix log style as `[db]` / `[store]`.

```javascript
// Rate limiter for auth routes — extend existing RateLimiterMemory pattern (lines 79-84)
const authLimiter = new RateLimiterMemory({ points: 10, duration: 60 });
function authRateLimit(req, res, next) {
  authLimiter.consume(req.ip).then(next).catch(() => res.status(429).json({ code: "RATE_LIMITED" }));
}

// Save pendingClientId before OAuth redirect so callback can link guest identity
app.get("/auth/google", authRateLimit, (req, res, next) => {
  if (req.query.clientId) {
    req.session.pendingClientId = req.query.clientId;
    req.session.save((err) => {   // explicit save before redirect (PITFALLS #1 / Open Question 3)
      if (err) return res.redirect("/?authError=1");
      passport.authenticate("google")(req, res, next);
    });
  } else {
    passport.authenticate("google")(req, res, next);
  }
});

app.get("/auth/google/callback",
  authRateLimit,
  passport.authenticate("google", { failureRedirect: "/?authError=1" }),
  (req, res) => {
    // req.session.regenerate() called automatically by Passport 0.6+ (SEC-05, A1)
    res.redirect("/");
  }
);

// Sign out this device (D-03)
app.post("/auth/signout", (req, res) => {
  req.logout((err) => {         // Passport 0.6+: logout is async — must have callback (PITFALLS #3)
    if (err) return res.status(500).json({ ok: false });
    req.session.destroy(() => res.json({ ok: true }));
  });
});

// Sign out all devices (D-03) — uses indexed user_id column added in 002_accounts.sql
app.post("/auth/signout-all", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, code: "NOT_AUTHENTICATED" });
  try {
    await pool.query("DELETE FROM session WHERE user_id = $1", [userId]);
    req.session.destroy(() => res.json({ ok: true }));
  } catch (e) {
    console.error("[auth] signout-all failed:", e.message);
    res.status(500).json({ ok: false });
  }
});

// Profile read path — zero-state scaffold (D-08/D-10); Phase 3 adds real stats
app.get("/api/profile/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const { rows } = await pool.query(
      "SELECT id, display_name, avatar_url, created_at, guest_migrated_at FROM users WHERE id=$1",
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
    const u = rows[0];
    res.json({
      id: u.id,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      memberSince: u.created_at,
      isLinkedAccount: u.guest_migrated_at !== null,
      stats: { wins: 0, losses: 0, gamesPlayed: 0 },  // Phase 3 fills
    });
  } catch (e) {
    console.error("[auth] profile fetch failed:", e.message);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Current session info — used by client SPA to hydrate auth state on load
app.get("/api/me", (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: { id: req.user.id, displayName: req.user.display_name, avatarUrl: req.user.avatar_url } });
});
```

#### Integration point 4: Socket.IO connection handler (inside existing `io.on("connection", socket => { ... })`)

Current connection handler starts around line 320. Add userId extraction at the top of the handler, after existing `clientId` setup:

```javascript
// Inside io.on("connection", (socket) => { ... }) — add after existing socket.data setup
// socket.request.session is populated because io.engine.use(sessionMiddleware) was called
const userId = socket.request.session?.passport?.user ?? null;
socket.data.userId = userId;  // null = guest, integer = authenticated account
console.log("[auth] socket connected, clientId:", socket.data.clientId, "userId:", userId);
```

---

### `db.js` — add `linkOrPromoteAccount()` and export it (D-06/D-07)

**Analog:** `db.js` itself — the `upsertGuestCredential` function (lines 73–112) is the direct pattern to copy for the new link transaction.

**Existing pattern to copy from** (`upsertGuestCredential`, lines 73–112):
- `pool.connect()` for transaction (vs `pool.query()` for single queries)
- try / catch / finally with `client.release()`
- Parameterized SQL only (`$1`, never string concat) — comment at line 69
- Error: `console.error("[db] ...:", e.message)` — then decide fatal vs swallow
- `module.exports` at line 114 — add new function to the same export object

**New function shape** (copy transaction pattern from `upsertGuestCredential`):

```javascript
// After upsertGuestCredential, before module.exports:

// linkOrPromoteAccount — D-06/D-07 atomic guest→account linking transaction.
// Called from Passport verify callback. Never trust client input — sub/name/avatarUrl
// come from Google token, pendingClientId from server-side session only.
async function linkOrPromoteAccount(sub, name, avatarUrl, pendingClientId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... D-06/D-07 SQL per RESEARCH.md Pattern 4 ...
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;   // fatal — Passport verify callback passes to done(err)
  } finally {
    client.release();
  }
}

// sanitizeDisplayName — thin wrapper over escapeHtml, mirrors sanitizeProfile() in server.js:172
// db.js needs it here for display_name stored via linkOrPromoteAccount (D-09)
function sanitizeDisplayName(name) {
  if (typeof name !== "string") return null;
  return escapeHtml(name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40));
}
// escapeHtml must be copied/required here from server.js or extracted to a shared util

module.exports = { pool, runMigrations, upsertGuestCredential, linkOrPromoteAccount };
```

**Note on `escapeHtml`:** It currently lives in `server.js` at lines 161–169. To use it in `db.js`, either: (a) duplicate the 8-line function in `db.js` (simplest — CLAUDE.md: "No barrel/index re-export files. Flat imports"), or (b) extract to a tiny `utils.js`. Option (a) is consistent with the project's flat structure.

---

### `migrations/002_accounts.sql` — DDL to extend Phase 1 schema

**Analog:** `migrations/001_identity.sql` (lines 1–21) — exact same numbered-file convention, `IF NOT EXISTS` guards, SQL comment header.

**001_identity.sql header pattern** (lines 1–5):
```sql
-- 001_identity.sql: Canonical identity model (DATA-01 / DATA-02)
-- One users row per player identity; many credentials rows (one per auth type).
-- ...
```

**002_accounts.sql should follow this pattern:**
```sql
-- 002_accounts.sql: Add display_name, avatar_url to users; session table for connect-pg-simple.

-- Profile fields on users (D-08/D-09/D-10)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- Session table for connect-pg-simple (createTableIfMissing:false — DDL lives here)
-- Schema from: github.com/voxpelli/node-connect-pg-simple/blob/main/table.sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid"     varchar NOT NULL COLLATE "default",
  "sess"    json NOT NULL,
  "expire"  timestamp(6) NOT NULL,
  "user_id" integer,   -- extra column for efficient sign-out-all (D-03)
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire"   ON "session" ("expire");
CREATE INDEX IF NOT EXISTS "IDX_session_user_id"  ON "session" ("user_id");
```

**Migration runner behavior** (`db.js` lines 40–64): files read lexically from `migrations/`, applied once, tracked in `schema_migrations`. The `runMigrations(pool)` call at server boot (line 1030) applies 002 automatically after 001. No extra wiring needed.

---

### `public/app.jsx` — i18n strings, screen state, new UI components (D-12/D-13)

**Analog:** `public/app.jsx` itself — three patterns to copy from.

#### Pattern 1: i18n string addition (lines 19–160)

The `I18N` object at line 19 has `en` and `vi` sub-objects with flat `"namespace.key"` keys. New auth/profile strings must be added to **both** `en` and `vi` blocks in one pass.

```javascript
// Inside I18N.en (after line 80's last key, before closing brace):
"auth.signInGoogle": "Sign in with Google",
"auth.viewProfile": "View profile",
"auth.signOut": "Sign out",
"auth.signOutAll": "Sign out all devices",
"auth.signOutAllConfirmTitle": "Sign out everywhere?",
"auth.signOutAllConfirmBody": "You will be signed out on all devices, including this one.",
"auth.signOutAllConfirmBtn": "Sign out all devices",
"auth.keepSignedIn": "Keep me signed in",
"auth.errFailed": "Sign-in failed. Please try again.",
"auth.errExpired": "Your session has expired. Please sign in again.",
"auth.errRateLimited": "Too many sign-in attempts. Please wait a moment.",
"profile.memberSince": "Member since {month} {year}",
"profile.wins": "Wins",
"profile.losses": "Losses",
"profile.games": "Games",
"profile.noGamesYet": "No games yet. Play some matches to see your record here.",
"profile.back": "Back to lobby",
"profile.challengeSoon": "Challenge (coming soon)",
"profile.notFound": "Player not found. Return to lobby.",

// Same keys in I18N.vi:
"auth.signInGoogle": "Đăng nhập bằng Google",
"auth.viewProfile": "Xem hồ sơ",
"auth.signOut": "Đăng xuất",
"auth.signOutAll": "Đăng xuất tất cả thiết bị",
"auth.signOutAllConfirmTitle": "Đăng xuất khỏi tất cả thiết bị?",
"auth.signOutAllConfirmBody": "Bạn sẽ bị đăng xuất khỏi tất cả thiết bị, kể cả thiết bị này.",
"auth.signOutAllConfirmBtn": "Đăng xuất tất cả",
"auth.keepSignedIn": "Giữ đăng nhập",
"auth.errFailed": "Đăng nhập thất bại. Vui lòng thử lại.",
"auth.errExpired": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
"auth.errRateLimited": "Quá nhiều lần thử. Vui lòng chờ một chút.",
"profile.memberSince": "Thành viên từ tháng {month} năm {year}",
"profile.wins": "Chiến thắng",
"profile.losses": "Thất bại",
"profile.games": "Ván đấu",
"profile.noGamesYet": "Chưa có ván nào. Hãy chơi vài trận để xem thành tích tại đây.",
"profile.back": "Quay lại sảnh",
"profile.challengeSoon": "Thách đấu (sắp có)",
"profile.notFound": "Không tìm thấy người chơi. Quay lại sảnh.",
```

#### Pattern 2: Screen state extension (line 806)

```javascript
// Current (line 806):
const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle

// Modified — add 'profile' to the comment:
const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle | profile
```

New state vars to add alongside existing ones (lines 807–865 pattern — one `useState` per concern):

```javascript
const [authUser, setAuthUser] = useState(null);     // null = guest; {id, displayName, avatarUrl} = signed-in
const [profileData, setProfileData] = useState(null); // loaded profile for profile screen
const [profileLoading, setProfileLoading] = useState(false);
const [viewProfileId, setViewProfileId] = useState(null); // opaque users.id to view
const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
const [signOutAllConfirm, setSignOutAllConfirm] = useState(false);
const [authError, setAuthError] = useState(null);   // 'failed' | 'expired' | 'rateLimited'
```

#### Pattern 3: New React components (add before `function App()` at line 804)

The existing component pattern (e.g., `function Lobby(...)` around line 340, `function HelpOverlay(...)` around line 755) is: named function component, props destructured in signature, returns JSX, uses `t()` for all text.

```javascript
// Pattern from Lobby component (line ~340):
function Lobby({ onCreate, onJoin, onBot, onHelp, ... }) {
  // ... useState for local state ...
  return (
    <div className="lobby">
      <h2>{t("lobby.title")}</h2>
      // ...
    </div>
  );
}
```

New components follow same shape:
- `function GoogleSignInButton({ onSignIn, disabled })` — renders `.btn.google-signin`
- `function ProfileChip({ user, onToggleMenu })` — renders `.profile-chip` in topbar
- `function AvatarMenu({ open, onViewProfile, onSignOut, onSignOutAll, confirmMode, onConfirm, onCancel })` — `.avatar-menu`
- `function ProfileView({ userId, currentUserId, onBack })` — replaces lobby when `screen === 'profile'`

---

### `test/auth.test.js` — new test file for SEC-05, AUTH-02, AUTH-03, AUTH-04

**Analog:** `test/db.test.js` (lines 1–127) — copy the file structure exactly.

**Key patterns to copy from `test/db.test.js`:**

```javascript
// Lines 1-7: ESM imports — Vitest + Node built-ins only
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Lines 44-46: DATABASE_URL guard — skip integration tests without live DB
const hasDatabaseUrl = !!process.env.DATABASE_URL;
describe.skipIf(!hasDatabaseUrl)("suite name — (requires DB)", () => {

// Lines 50-55: beforeAll pattern — import db.js, run migrations to ensure schema
beforeAll(async () => {
  db = await import("../db.js");
  pool = db.pool;
  await db.runMigrations(pool);
});

// Lines 57-61: afterAll cleanup — DELETE test rows by prefix, then end pool
afterAll(async () => {
  await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-client-%'");
  await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
  await pool.end();
});
```

**`test/auth.test.js` structure:**

```javascript
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDatabaseUrl = !!process.env.DATABASE_URL;

// Suite 1: module shape (no DB required)
describe("db.js — linkOrPromoteAccount export", () => {
  it("exports linkOrPromoteAccount function", async () => {
    const db = await import("../db.js");
    expect(typeof db.linkOrPromoteAccount).toBe("function");
  });
});

// Suite 2: D-06 promote guest row (requires DB)
describe.skipIf(!hasDatabaseUrl)("linkOrPromoteAccount — D-06 first-time Google sign-in (requires DB)", () => {
  // ... beforeAll / afterAll per db.test.js pattern ...
  it("attaches google credential to guest user_id", async () => { ... });
  it("stamps guest_migrated_at", async () => { ... });
  it("is idempotent (second call with same sub is a no-op)", async () => { ... });
});

// Suite 3: D-07 adopt guest credential (requires DB)
describe.skipIf(!hasDatabaseUrl)("linkOrPromoteAccount — D-07 returning Google user (requires DB)", () => {
  it("re-points guest credential to existing google account's user_id", async () => { ... });
  it("does not create a duplicate users row", async () => { ... });
});

// Suite 4: session / sign-out (integration — may mock req/res)
describe("auth routes — sign-out behaviors", () => {
  // Unit tests with mock req/res since Passport setup is in server.js
});
```

---

### `test/profile.test.js` — new test file for PROF-01, PROF-02

**Analog:** `test/db.test.js` — same DATABASE_URL guard and import pattern.

```javascript
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)("GET /api/profile/:userId — zero-state (requires DB)", () => {
  // beforeAll: import db.js, runMigrations, insert a test user row
  // afterAll: DELETE test rows, pool.end()

  it("returns 200 with zero-state stats for a known user", async () => {
    // Call profile read path function directly (exported from db.js or server TEST_EXPORTS)
    // Verify shape: { id, displayName, avatarUrl, memberSince, isLinkedAccount, stats: {wins:0,...} }
  });

  it("returns 404 for unknown userId", async () => { ... });

  it("returns 400 for non-integer userId", async () => { ... });
});
```

---

## Shared Patterns

### Guard-clause style (applies to all new server-side code)

**Source:** `server.js` lines 109–111, 155–157, `db.js` lines 74–76

Early-return on invalid input; no nested conditionals. Named error codes returned as `{ ok: false, code: "AUTH_FAILED" }` or `{ error: "NOT_FOUND" }` — never free-text error strings.

```javascript
// Pattern from server.js line 861:
if (!room || !room.started) return cb && cb({ ok: false });
if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
```

New named error codes to introduce:
- `AUTH_FAILED` — OAuth callback error
- `NOT_AUTHENTICATED` — auth-required endpoint called without session
- `INVALID_ID` — bad profile userId param
- `NOT_FOUND` — profile userId not in DB

### sanitizeProfile / escapeHtml (applies to display_name storage)

**Source:** `server.js` lines 161–183

`escapeHtml()` at line 161 strips `& < > " '`. `sanitizeProfile()` at line 172 adds control-char removal, whitespace collapse, 40-char cap, then `escapeHtml()`. For `display_name` (D-09): copy the name-processing logic from `sanitizeProfile` into a `sanitizeDisplayName(name)` function in `db.js`.

```javascript
// server.js lines 161-168 — escapeHtml (copy to db.js or shared util):
function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// server.js lines 172-183 — sanitizeProfile name extraction logic:
const name = typeof p.name === "string"
  ? escapeHtml(p.name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40))
  : null;
```

### Parameterized SQL (applies to all new db queries)

**Source:** `db.js` lines 77–107, comment at line 69

All SQL uses `$1`, `$2` positional params — never string concatenation. `ON CONFLICT (...) DO NOTHING` for idempotent upserts. CTE pattern for multi-step operations.

### Console log prefix convention (applies to all new log lines)

**Source:** `server.js` lines 34, `db.js` lines 34, 61

Format: `[prefix] message` — e.g., `[auth]`, `[db]`. New auth/session code uses `[auth]`.

### Migration runner convention (applies to 002_accounts.sql)

**Source:** `db.js` lines 40–64

Files in `migrations/` named `NNN_description.sql`, sorted lexically, applied once, tracked in `schema_migrations`. `002_accounts.sql` is picked up automatically — no changes to `runMigrations` needed.

### RateLimiterMemory pattern (applies to auth routes)

**Source:** `server.js` lines 79–84

```javascript
// Existing pattern (lines 79-84):
const { RateLimiterMemory } = require("rate-limiter-flexible");
const fireLimiter = new RateLimiterMemory({ points: 2, duration: 1 });
// ...
// Usage in handler (lines 851-856):
try {
  await fireLimiter.consume(rlKey);
} catch (e) {
  return cb && cb({ ok: false, code: "RATE_LIMITED" });
}
```

New `authLimiter` follows the same shape, keyed by `req.ip`, wrapping HTTP routes via middleware.

### Boot-time fail-loud env check (applies to SESSION_SECRET)

**Source:** `server.js` lines 1026–1034 (migration fail-loud pattern)

```javascript
// server.js lines 1029-1034:
try {
  await runMigrations(pool);
} catch (e) {
  console.error("[db] migration failed on boot, exiting:", e.message);
  process.exit(1);
}
```

New SESSION_SECRET check should use the same `process.exit(1)` + `console.error("[auth] ...")` pattern, placed before `app.use(sessionMiddleware)`.

---

## No Analog Found

All files have close analogs in the existing codebase. No entries.

---

## Metadata

**Analog search scope:** `server.js`, `db.js`, `migrations/`, `public/app.jsx`, `test/`
**Files scanned:** 6 source files read in full or targeted sections
**Pattern extraction date:** 2026-06-02
