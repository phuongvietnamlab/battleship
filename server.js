// Battleship Online - server
// Node.js + Express + Socket.IO. Room-code based matchmaking.
// clientId-based identity with reconnect grace so iPhone/Safari backgrounding
// does not drop a player out of the room.

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const store = require("./store"); // optional Redis snapshot; no-op without REDIS_URL
const { pool, runMigrations, upsertGuestCredential, linkOrPromoteAccount, createEmailAccount, verifyEmailLogin, recordMatch, getWalletBalance, debitWallet, creditWallet, createWallet } = require("./db"); // Postgres: identity persistence + wallet

const app = express();
const server = http.createServer(app);
// CORS: the client is served same-origin in production, so a fixed allowlist is
// enough. SITE_ORIGIN lets a separately-hosted front-end connect; localhost for
// local dev. Empty SITE_ORIGIN falls back to same-origin only.
const SITE_ORIGIN = process.env.SITE_ORIGIN;
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:4000",
      ...(SITE_ORIGIN ? [SITE_ORIGIN] : []),
    ],
    methods: ["GET", "POST"],
  },
});

// Canonical host: when CANONICAL_HOST is set (e.g. "battleshiponline.xyz"),
// 301-redirect the Render *.onrender.com host to it so Google indexes a single
// URL (avoids duplicate-content between onrender.com and the custom domain).
// Opt-in + scoped to onrender hosts, so localhost and the custom domain are
// untouched. /healthz is exempt so uptime pings still hit any host directly.
const CANONICAL_HOST = process.env.CANONICAL_HOST;
app.use((req, res, next) => {
  const host = req.headers.host;
  if (CANONICAL_HOST && host && host !== CANONICAL_HOST && /\.onrender\.com$/i.test(host) && req.path !== "/healthz") {
    return res.redirect(301, "https://" + CANONICAL_HOST + req.originalUrl);
  }
  next();
});

// Content-Security-Policy: restrict script execution to same-origin, allow
// Socket.IO WebSocket connections, block framing. No unsafe-inline in script-src
// (defense-in-depth against XSS — SEC-04, T-03-E1).
const CSP_HEADER_VALUE = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' wss: ws:; frame-ancestors 'none'";
function cspMiddleware(req, res, next) {
  res.setHeader("Content-Security-Policy", CSP_HEADER_VALUE);
  next();
}
app.use(cspMiddleware);

// Liveness probe for Render/uptime monitors: cheap, no room scan, always 200.
app.get("/healthz", (req, res) => res.json({ ok: true, uptimeSec: Math.floor(process.uptime()) }));
// Lightweight ops snapshot: room/game/player counts + memory. JSON, no auth
// (no secrets exposed). Useful to eyeball load and spot leaked rooms.
app.get("/metrics", (req, res) => res.json(computeStats()));
// Built game bundle (run `npm run build:game`) served first, so the no-CDN
// index.html + bundled app.js are used for local/web preview. Falls back to
// public/ for any unbuilt asset.
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));

// ─── Session + Passport middleware ──────────────────────────────────────────
// SESSION_SECRET check is in the require.main boot block (below) so importing
// server.js in tests does not trigger process.exit (WR-01 pattern).

const expressSession = require("express-session");
const pgSession = require("connect-pg-simple")(expressSession);
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { Strategy: FacebookStrategy } = require("passport-facebook");

app.set("trust proxy", 1); // cookie.secure:'auto' works correctly behind EC2/Render reverse proxy

const sessionMiddleware = expressSession({
  store: new pgSession({
    pool,                         // reuse shared pool — NEVER new Pool() (PITFALLS #4)
    createTableIfMissing: false,  // session table DDL is in 002_accounts.sql
  }),
  // SESSION_SECRET must be set at runtime; the boot guard (require.main block) exits if absent.
  // The "test-placeholder" fallback is only reached in test imports where auth routes are never
  // exercised — it prevents express-session from emitting a deprecation for missing secret (WR-01).
  secret: process.env.SESSION_SECRET || "test-placeholder-not-used-in-production",
  resave: false,
  rolling: true,                  // refresh maxAge on every response (D-04)
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: "auto",               // true on HTTPS, false on HTTP — works localhost + Render (A4)
    sameSite: "lax",              // 'strict' breaks OAuth callback redirect (PITFALLS #5)
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days rolling (D-04)
  },
});

app.use(sessionMiddleware);       // 1. session before passport
app.use(passport.initialize());   // 2. passport init
app.use(passport.session());      // 3. passport session (populates req.user)

// D-11: share SAME sessionMiddleware reference with Socket.IO so socket.request.session
// is the same store as Express sessions. NEVER call session() a second time here.
io.engine.use(sessionMiddleware);

// ─── Passport Google Strategy ────────────────────────────────────────────────
// state:true: Passport generates + validates a random nonce per flow (SEC-05, T-02-05).
// passReqToCallback:true: verify callback receives req so it can read req.session.pendingClientId.
// Guard: skip strategy registration in test environments where credentials are absent (WR-01).
if (process.env.GOOGLE_CLIENT_ID) passport.use(new GoogleStrategy(
  {
    clientID:          process.env.GOOGLE_CLIENT_ID,
    clientSecret:      process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:       process.env.GOOGLE_CALLBACK_URL,
    scope:             ["openid", "profile"],
    state:             true,  // SEC-05: cryptographic nonce per flow
    passReqToCallback: true,  // allow verify callback to read req.session.pendingClientId
  },
  async (req, accessToken, refreshToken, profile, done) => {
    // NEVER persist the access token — only users.id is stored via serializeUser (T-02-08 / PITFALLS #6)
    const sub       = profile.id;          // stable Google identifier (not email — PITFALLS anti-pattern)
    const name      = profile.displayName;
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    const pendingClientId = req.session.pendingClientId ?? null;
    try {
      const user = await linkOrPromoteAccount("google", sub, name, avatarUrl, pendingClientId);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ─── Passport Facebook Strategy ──────────────────────────────────────────────
// state:true: per-flow nonce (SEC-05/T-02-21). passReqToCallback:true: reads pendingClientId.
// profileFields: request id, displayName, photos — email intentionally NOT requested as
// identity key (D-16/D-20: dedup on (type='facebook', external_id=profile.id); email may
// be absent and must never be the dedup key — T-02-23).
// Guard: skip in test environments where credentials are absent (mirrors Google WR-01).
if (process.env.FACEBOOK_CLIENT_ID) passport.use(new FacebookStrategy(
  {
    clientID:          process.env.FACEBOOK_CLIENT_ID,
    clientSecret:      process.env.FACEBOOK_CLIENT_SECRET,
    callbackURL:       process.env.FACEBOOK_CALLBACK_URL,
    profileFields:     ["id", "displayName", "photos"],
    scope:             ["email"],
    state:             true,  // SEC-05/T-02-21: cryptographic nonce per flow
    passReqToCallback: true,  // allow verify callback to read req.session.pendingClientId
  },
  async (req, accessToken, refreshToken, profile, done) => {
    // NEVER persist the access token — only users.id stored via serializeUser (T-02-24)
    // Dedup key: profile.id (stable FB user id) — NOT email (D-16/D-20/T-02-23)
    const externalId     = profile.id;
    const name           = profile.displayName;
    const avatarUrl      = profile.photos?.[0]?.value ?? null;
    const pendingClientId = req.session.pendingClientId ?? null;
    try {
      const user = await linkOrPromoteAccount("facebook", externalId, name, avatarUrl, pendingClientId);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Passport serialization: store only users.id in session (not the full user object)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, display_name, avatar_url FROM users WHERE id=$1", [id]
    );
    done(null, rows[0] ?? false);
  } catch (e) { done(e); }
});

const PORT = process.env.PORT || 4000;

// Game config
const BOARD = 11;
const FLEET = [5, 4, 3, 3, 2];
const GRACE_MS = 180000; // keep a disconnected player's seat for 3 min (reload / brief network drop)
const RESTORE_GRACE_MS = 300000; // after a server restore, give seats 5 min to reconnect
const SNAPSHOT_MS = 3000; // how often to snapshot rooms to Redis (when enabled)
const CLEANUP_INTERVAL_MS = 60000;    // run the room cleanup sweep every 60s (SEC-03)
const ROOM_IDLE_THRESHOLD_MS = 300000; // evict rooms with no activity for > 5 min (SEC-03)

// Per-player rate limiters (D-06/D-07 — close rapid-fire DoS vector, SEC-01).
// RateLimiterMemory is in-process (no Redis dependency — Redis store deferred to Phase 5).
// Key: socket.data.clientId || socket.id (per-player isolation).
const { RateLimiterMemory } = require("rate-limiter-flexible");
const fireLimiter    = new RateLimiterMemory({ points: 2,  duration: 1  }); // 2 shots/s
const abilityLimiter = new RateLimiterMemory({ points: 1,  duration: 1  }); // 1 ability/s
const chatLimiter    = new RateLimiterMemory({ points: 5,  duration: 10 }); // 5 messages/10s
// Consecutive violation threshold before forcibly disconnecting the abusing socket (D-08).
const RL_ABUSE_THRESHOLD = 10;

// ─── Matchmaking queue constants and maps (05-01) ────────────────────────────
const BOT_OFFER_DELAY_MS       = 30000; // 30 s alone before bot prompt (D-09)
const QUEUE_SWEEP_MS           = 5000;  // sweep timer cadence

// mirrors rooms map — module-level, never per-request (clientId → QueueEntry)
const queues = {
  free: new Map(),
  wagered: new Map(),
};

// Phase 7: valid wager presets for the wagered queue and room-code games
const VALID_STAKES = [10, 25, 50, 100];

// Power-up purchase economy constants (Phase 7)
const POWERUP_FIXED_FLOOR = 5;     // minimum price regardless of stake
const POWERUP_STAKE_PCT = 0.15;    // 15% of stake when that exceeds the floor
const POWERUP_CAP_PER_MATCH = 3;   // max 3 purchases per player per match

const joinQueueLimiter = new RateLimiterMemory({ points: 5, duration: 60 }); // 5/min per clientId
const buyPowerupLimiter = new RateLimiterMemory({ points: 3, duration: 60 }); // 3 attempts/min

// ─── Auth rate limiter ───────────────────────────────────────────────────────
// Extends existing RateLimiterMemory pattern (lines above) to OAuth endpoints.
// 10 auth attempts/min per IP — protects against auth-route brute-force (T-02-09).
const authLimiter = new RateLimiterMemory({ points: 10, duration: 60 });
function authRateLimit(req, res, next) {
  authLimiter.consume(req.ip).then(() => next()).catch(() => res.status(429).json({ code: "RATE_LIMITED" }));
}

// ─── JSON body parsing for email auth routes ────────────────────────────────
// Mounted once, before the auth-route block. Does NOT affect Socket.IO (which
// does its own framing) or express.static (which never reaches a body parser).
// The path restriction limits body parsing to /auth/* so static/socket handling
// is untouched (T-02-37: untrusted POST body only parsed where routes expect it).
app.use("/auth", express.json());

// ─── Auth routes ─────────────────────────────────────────────────────────────

// Initiate Google OAuth — save guest clientId so callback can link the account.
// Explicit req.session.save before redirect ensures pendingClientId persists in
// the store before the browser follows the Location header (PITFALLS #1 / Open Q3).
app.get("/auth/google", authRateLimit, (req, res, next) => {
  if (req.query.clientId) {
    req.session.pendingClientId = req.query.clientId;
    req.session.save((err) => {
      if (err) return res.redirect("/?authError=1");
      passport.authenticate("google")(req, res, next);
    });
  } else {
    passport.authenticate("google")(req, res, next);
  }
});

// Declare the success handler as a named function so Plan 03 can extend its body
// (add user_id stamp + session save) without re-parsing an inline arrow chain.
// Passport 0.6+ calls req.session.regenerate() automatically at req.logIn() —
// this named handler runs AFTER that regeneration (SEC-05 / T-02-06).
// Stamp user_id BEFORE session.save; redirect fires ONLY inside the save callback
// so connect-pg-simple persists the user_id column for sign-out-all (T-02-20).
function onGoogleCallbackSuccess(req, res) {
  req.session.user_id = req.user.id;
  req.session.save((err) => {
    if (err) {
      console.error("[auth] session save failed after login:", err.message);
      return res.redirect("/?authError=1");
    }
    res.redirect("/");
  });
}

app.get("/auth/google/callback",
  authRateLimit,
  passport.authenticate("google", { failureRedirect: "/?authError=1" }),
  onGoogleCallbackSuccess
);

// ─── Facebook auth routes ─────────────────────────────────────────────────────
// Mirrors the Google routes exactly (T-02-25: authRateLimit on both routes;
// T-02-21: state nonce validated by FacebookStrategy; T-02-22: session.regenerate
// automatic via Passport 0.6+; T-02-26: onFacebookCallbackSuccess stamps user_id).

// Initiate Facebook OAuth — save guest clientId so callback can link the account.
// Explicit req.session.save before redirect ensures pendingClientId persists in
// the store before the browser follows the Location header (PITFALLS #1 / Open Q3).
app.get("/auth/facebook", authRateLimit, (req, res, next) => {
  if (req.query.clientId) {
    req.session.pendingClientId = req.query.clientId;
    req.session.save((err) => {
      if (err) return res.redirect("/?authError=1");
      passport.authenticate("facebook")(req, res, next);
    });
  } else {
    passport.authenticate("facebook")(req, res, next);
  }
});

// Named success handler mirrors onGoogleCallbackSuccess (Plan 03's pattern):
// stamps req.session.user_id BEFORE req.session.save so the indexed DELETE works
// for sign-out-all (T-02-26). res.redirect fires ONLY inside the save callback.
function onFacebookCallbackSuccess(req, res) {
  req.session.user_id = req.user.id;
  req.session.save((err) => {
    if (err) {
      console.error("[auth] session save failed after facebook login:", err.message);
      return res.redirect("/?authError=1");
    }
    res.redirect("/");
  });
}

app.get("/auth/facebook/callback",
  authRateLimit,
  passport.authenticate("facebook", { failureRedirect: "/?authError=1" }),
  onFacebookCallbackSuccess
);

// ─── Facebook Data Deletion Callback ─────────────────────────────────────────
// Facebook requires apps to provide a "Data Deletion Request Callback URL".
// When a user removes the app from their Facebook settings, Facebook POSTs a
// signed_request to this endpoint. We verify the HMAC-SHA256 signature using
// FACEBOOK_CLIENT_SECRET, decode the payload to get the Facebook user ID,
// then delete all associated data from our database.
// Returns JSON { url, confirmation_code } per Facebook's spec.
// Ref: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

app.post("/auth/facebook/data-deletion", async (req, res) => {
  const signedRequest = req.body?.signed_request;
  if (!signedRequest) {
    return res.status(400).json({ error: "Missing signed_request" });
  }

  const appSecret = process.env.FACEBOOK_CLIENT_SECRET;
  if (!appSecret) {
    console.error("[fb-deletion] FACEBOOK_CLIENT_SECRET not configured");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  // Parse and verify signed_request (base64url-encoded HMAC-SHA256 signature + payload)
  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    return res.status(400).json({ error: "Invalid signed_request format" });
  }

  const [encodedSig, encodedPayload] = parts;

  // base64url → standard base64
  const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expectedSig = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch (e) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const fbUserId = payload.user_id;
  if (!fbUserId) {
    return res.status(400).json({ error: "Missing user_id in payload" });
  }

  // Generate a unique confirmation code for status tracking
  const confirmationCode = crypto.randomBytes(16).toString("hex");

  // Delete user data associated with this Facebook account
  try {
    const { rows } = await pool.query(
      "SELECT user_id FROM credentials WHERE type='facebook' AND external_id=$1",
      [String(fbUserId)]
    );

    if (rows.length > 0) {
      const userId = rows[0].user_id;

      // Delete in dependency order (child tables first)
      await pool.query("DELETE FROM transactions WHERE user_id=$1", [userId]);
      await pool.query("DELETE FROM wallets WHERE user_id=$1", [userId]);
      await pool.query("DELETE FROM auth_tokens WHERE user_id=$1", [userId]);
      await pool.query("DELETE FROM session WHERE user_id=$1", [userId]);
      await pool.query("DELETE FROM matches WHERE winner_id=$1 OR loser_id=$1", [userId]);
      await pool.query("DELETE FROM credentials WHERE user_id=$1", [userId]);
      // Finally delete the user row
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);

      console.log(`[fb-deletion] Deleted data for FB user ${fbUserId} (internal user_id=${userId}), code=${confirmationCode}`);
    } else {
      // User not found — still return success (data may already be gone or never existed)
      console.log(`[fb-deletion] No data found for FB user ${fbUserId}, code=${confirmationCode}`);
    }
  } catch (e) {
    console.error("[fb-deletion] DB error:", e.message);
    return res.status(500).json({ error: "Deletion failed" });
  }

  // Facebook expects: { url: "status check page", confirmation_code: "unique code" }
  const baseUrl = process.env.APP_BASE_URL || "https://battleshiponline.xyz";
  res.json({
    url: `${baseUrl}/deletion-status.html?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

// POST /auth/signout — destroy current session (this device only).
// req.logout must take a callback (Passport 0.6+ async; Pitfall 3 / T-02-15).
app.post("/auth/signout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ ok: false, code: "AUTH_FAILED" });
    req.session.destroy(() => res.json({ ok: true }));
  });
});

// POST /auth/signout-all — delete every session row for the user_id (server-side
// revocation, AUTH-04 / D-03). Uses the indexed user_id column from 002_accounts.sql.
// T-02-12: userId taken from req.user.id only — never from request body.
// T-02-14: parameterized $1 — user_id is an integer from req.user.
// T-02-13: single indexed DELETE is atomic; subsequent requests find no session.
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

// Current session info — client SPA calls this on mount to hydrate auth state.
// Returns {user:null} for guests; {user:{id,displayName,avatarUrl}} for signed-in.
app.get("/api/me", (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: { id: req.user.id, displayName: req.user.display_name, avatarUrl: req.user.avatar_url } });
});

// ─── Wallet balance endpoint (Phase 7) ──────────────────────────────────────
app.get("/api/wallet", (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  getWalletBalance(userId)
    .then((balance) => res.json({ balance }))
    .catch((e) => {
      console.error("[wallet] balance fetch failed:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    });
});

// ─── Email auth routes ───────────────────────────────────────────────────────
// POST /auth/signup — create an email/password account and log in.
// POST /auth/login  — sign in an existing email account.
//
// Session fixation defense (SEC-05 / T-02-33 / D-05):
// Email login has NO Passport OAuth strategy auto-calling req.session.regenerate().
// We call it manually — BEFORE req.login() — in this EXACT order:
//   1. req.session.regenerate(cb)   — generate a fresh session id (prevents fixation)
//   2. req.login(user, cb)          — populate req.user + serialize to session
//   3. req.session.user_id = id     — stamp indexed column (Plan 03 sign-out-all)
//   4. req.session.save(cb)         — flush to store before responding
// Stamping user_id after req.login but before save mirrors onGoogleCallbackSuccess
// (T-02-36) so DELETE FROM session WHERE user_id=$1 (sign-out-all) revokes email
// sessions too.
//
// Rate limiting (T-02-34 / D-17): authRateLimit (10/60s per IP) on both routes.
// Enumeration defense (T-02-35): login returns uniform 401 AUTH_FAILED for any
// bad credential — never reveals which field was wrong.
// SQL injection (T-02-37): all DB work via Plan 06 parameterized helpers.
// Log safety (T-02-38): req.body is never logged; response returns only {id,displayName,avatarUrl}.

app.post("/auth/signup", authRateLimit, async (req, res) => {
  try {
    const { email, password, clientId: bodyClientId } = req.body || {};
    const pendingClientId = bodyClientId || req.session.pendingClientId || null;
    const result = await createEmailAccount(email, password, pendingClientId);
    if (result && result.error === "WEAK_PASSWORD") {
      return res.status(400).json({ ok: false, code: "WEAK_PASSWORD" });
    }
    if (result && result.error === "EMAIL_IN_USE") {
      return res.status(409).json({ ok: false, code: "EMAIL_IN_USE" });
    }
    // Establish authenticated session: regenerate -> login -> stamp -> save (SEC-05)
    const user = result;
    // Capture email for verification send (normalized external_id from createEmailAccount)
    const signupEmail = (typeof email === "string" ? email : "").trim().toLowerCase();
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false });
      req.login(user, (err2) => {
        if (err2) return res.status(500).json({ ok: false });
        req.session.user_id = user.id;
        req.session.save(() => {
          res.json({
            ok: true,
            user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url },
          });
        });
      });
    });
  } catch (e) {
    console.error("[auth] signup failed:", e.message);
    res.status(500).json({ ok: false });
  }
});

app.post("/auth/login", authRateLimit, async (req, res) => {
  try {
    const { email, password, clientId: bodyClientId } = req.body || {};
    const result = await verifyEmailLogin(email, password);
    if (result && result.error) {
      // Uniform 401 AUTH_FAILED — never reveal which field was wrong (T-02-35)
      return res.status(401).json({ ok: false, code: "AUTH_FAILED" });
    }
    // On success: adopt guest credential if a clientId was supplied (D-07)
    if (bodyClientId) {
      try {
        await pool.query(
          "UPDATE credentials SET user_id=$1 WHERE type='guest' AND external_id=$2",
          [result.id, bodyClientId]
        );
      } catch (_) { /* non-fatal: guest-link failure must not block login */ }
    }
    // Establish authenticated session: regenerate -> login -> stamp -> save (SEC-05)
    const user = result;
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false });
      req.login(user, (err2) => {
        if (err2) return res.status(500).json({ ok: false });
        req.session.user_id = user.id;
        req.session.save(() => res.json({
          ok: true,
          user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url },
        }));
      });
    });
  } catch (e) {
    console.error("[auth] login failed:", e.message);
    res.status(500).json({ ok: false });
  }
});


// Profile read path — zero-state scaffold (D-08/D-10); Phase 3 adds real stats.
// T-02-16: parseInt + Number.isInteger guard (400 INVALID_ID) before parameterized $1 query.
// T-02-17: explicit SELECT of public columns only — never SELECT * (no email/credential/session).
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
      stats: { wins: 0, losses: 0, gamesPlayed: 0 },  // D-10: Phase 3 fills real numbers
    });
  } catch (e) {
    console.error("[auth] profile fetch failed:", e.message);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// rooms: code -> {
//   players: { clientId: {sid, ready, occ:Set|null, hits:Set, online, timer} },
//   order: [clientId, clientId],
//   started, turn
// }
const rooms = {};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function newCode() {
  let c;
  do { c = makeCode(); } while (rooms[c]);
  return c;
}

// Guard every client-supplied coordinate: integer and inside the board. Without
// this a crafted `fire`/`useAbility` payload could push arbitrary keys into
// `me.hits` (unbounded memory growth) or drop a mine off-grid.
function inBounds(r, c) {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < BOARD && c >= 0 && c < BOARD;
}

function validatePlacement(ships) {
  if (!Array.isArray(ships)) return null;
  const sizes = ships.map((s) => (s.cells ? s.cells.length : 0)).sort((a, b) => a - b);
  const need = [...FLEET].sort((a, b) => a - b);
  if (sizes.length !== need.length) return null;
  for (let i = 0; i < need.length; i++) if (sizes[i] !== need[i]) return null;

  const occ = new Set();
  const shipSets = [];
  for (const s of ships) {
    if (!s.cells || !s.cells.length) return null;
    const rs = s.cells.map((x) => x.r);
    const cs = s.cells.map((x) => x.c);
    const horiz = rs.every((r) => r === rs[0]);
    const vert = cs.every((c) => c === cs[0]);
    if (!horiz && !vert) return null;
    const set = new Set();
    for (const cell of s.cells) {
      const { r, c } = cell;
      if (r < 0 || r >= BOARD || c < 0 || c >= BOARD) return null;
      const key = r + "," + c;
      if (occ.has(key)) return null;
      occ.add(key);
      set.add(key);
    }
    shipSets.push(set);
  }
  return { occ, ships: shipSets };
}

// how many of a player's ships are fully sunk given the attacker's hits
function sunkShipCount(playerData, attackerHits) {
  if (!playerData.ships) return 0;
  let n = 0;
  for (const ship of playerData.ships) {
    let all = true;
    for (const k of ship) if (!attackerHits.has(k)) { all = false; break; }
    if (all) n++;
  }
  return n;
}

function opponentOf(room, clientId) {
  return room.order.find((x) => x !== clientId);
}

// HTML-escape a string to prevent stored-XSS when names are rendered in
// profiles or other user-facing contexts (SEC-04).
function escapeHtml(s) {
  if (typeof s !== "string") return ""; // guard-clause: defend reusable primitive (WR-03)
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Validate a client-supplied FB profile before storing/relaying it.
function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return null;
  // Strip control chars, collapse whitespace, cap at 40, then HTML-escape so
  // stored names cannot inject markup in profiles or other contexts (SEC-04).
  const name = typeof p.name === "string"
    ? escapeHtml(p.name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40))
    : null;
  let photo = typeof p.photo === "string" ? p.photo.trim().slice(0, 500) : null;
  if (photo && !/^https?:\/\//i.test(photo)) photo = null;
  if (!name && !photo) return null;
  return { name, photo };
}

// Validate and sanitize chat text (SEC-04). Returns null for invalid/empty input
// so the chat handler can early-return cleanly.
function sanitizeChat(text) {
  if (typeof text !== "string") return null;
  // HTML-escape like sanitizeProfile so relayed chat cannot inject markup —
  // server-side defense, independent of how the client renders it (WR-02, SEC-04).
  const cleaned = escapeHtml(
    text.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200)
  );
  return cleaned || null;
}
// Store a profile on a seat without wiping an existing one when none is supplied.
function setProfileIfAny(p, prof) {
  if (!p) return;
  const s = sanitizeProfile(prof);
  if (s) p.profile = s;
}

// Free a disconnected seat after `ms`, unless the player reconnected meanwhile.
// Shared by the disconnect grace and the post-restore grace.
function scheduleSeatRelease(room, code, clientId, ms) {
  const p = room.players[clientId];
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    const r2 = rooms[code];
    if (!r2 || !r2.players[clientId]) return;
    if (r2.players[clientId].online) return; // came back
    // Capture match recording data BEFORE seat deletion (Pitfall 2+6: seat gone after delete)
    // Guard: r2.started (D-05 no lobby-abandon writes) and order.length===2 (D-04 belt-and-suspenders)
    let disconnectRecord = null;
    if (r2.started && !r2.recorded && r2.order.length === 2) {
      const winnerId = opponentOf(r2, clientId);
      if (winnerId) {
        disconnectRecord = {
          wId: r2.players[winnerId]?.userId ?? null,
          lId: r2.players[clientId]?.userId ?? null,
          mode: r2.mode,
          startedAt: r2.startedAt,
          stake: r2.stake || 0, // Phase 7
        };
        r2.recorded = true; // synchronous dedup guard (D-06) — set BEFORE delete
      }
    }
    r2.order = r2.order.filter((id) => id !== clientId);
    delete r2.players[clientId];
    clearTurnTimer(r2);
    if (r2.order.length === 0) {
      delete rooms[code];
    } else {
      io.to(code).emit("opponentLeft");
      r2.started = false;
      io.to(code).emit("roomUpdate", roomPublic(r2));
    }
    // Fire-and-forget match record after opponentLeft emit (D-07)
    if (disconnectRecord) {
      recordMatch(disconnectRecord.wId, disconnectRecord.lId, "disconnect", disconnectRecord.mode, disconnectRecord.startedAt, disconnectRecord.stake || 0).catch(() => {});
      // Phase 7: push balance update to winner after wagered disconnect-forfeit
      if (disconnectRecord.stake > 0 && disconnectRecord.wId) {
        getWalletBalance(disconnectRecord.wId).then((bal) => {
          // Winner is the remaining player in the room (disconnected player was removed)
          const winId = r2.order[0];
          if (winId && r2.players[winId]) emitToClient(r2, winId, "balanceUpdate", { balance: bal });
        }).catch(() => {});
      }
    }
  }, ms != null ? ms : GRACE_MS);
}

// Build a JSON-safe snapshot of all rooms: Sets -> arrays, transient fields
// (sockets, timers, online flags) dropped — they are rebuilt on restore.
function serializeRooms() {
  const out = {};
  for (const code in rooms) {
    const r = rooms[code];
    const players = {};
    for (const id in r.players) {
      const p = r.players[id];
      players[id] = {
        ready: !!p.ready,
        occ: p.occ ? [...p.occ] : null,
        hits: [...(p.hits || [])],
        ships: p.ships ? p.ships.map((s) => [...s]) : null,
        inv: p.inv || null,
        bonus: p.bonus || 0,
        skipNext: !!p.skipNext,
        timeouts: p.timeouts || 0,
        profile: p.profile || null,
        userId: p.userId ?? null,
      };
    }
    const mines = {};
    if (r.mines) for (const id in r.mines) mines[id] = [...r.mines[id]];
    out[code] = {
      code: r.code || code,
      order: r.order || [],
      started: !!r.started,
      startedAt: r.startedAt || null,
      turn: r.turn || null,
      scores: r.scores || {},
      lastStarter: r.lastStarter || null,
      mode: r.mode || "classic",
      recorded: !!r.recorded,
      powerups: r.powerups || {},
      mines,
      players,
      stake: r.stake || 0, // Phase 7
      purchases: r.purchases || {}, // Phase 7: power-up purchase counts
    };
  }
  return out;
}

// Rebuild the live `rooms` map from a snapshot. All seats come back OFFLINE
// (sockets are gone after a restart); a grace timer is armed so abandoned games
// don't linger, and the turn clock is re-armed for games that were in progress.
function restoreRooms(snap) {
  if (!snap) return 0;
  let n = 0;
  for (const code in snap) {
    const s = snap[code];
    const players = {};
    for (const id in s.players) {
      const p = s.players[id];
      players[id] = {
        sid: null,
        ready: !!p.ready,
        occ: p.occ ? new Set(p.occ) : null,
        hits: new Set(p.hits || []),
        ships: p.ships ? p.ships.map((a) => new Set(a)) : undefined,
        online: false,
        timer: null,
        inv: p.inv || newInv(),
        bonus: p.bonus || 0,
        skipNext: !!p.skipNext,
        timeouts: p.timeouts || 0,
        profile: p.profile || null,
        userId: p.userId ?? null,
      };
    }
    const mines = {};
    if (s.mines) for (const id in s.mines) mines[id] = new Set(s.mines[id]);
    rooms[code] = {
      code: s.code || code,
      players,
      order: s.order || [],
      started: !!s.started,
      startedAt: s.startedAt ? new Date(s.startedAt) : null,
      turn: s.turn || null,
      scores: s.scores || {},
      lastStarter: s.lastStarter || null,
      mode: s.mode || "classic",
      recorded: !!s.recorded,
      powerups: s.powerups || {},
      mines,
      turnTimer: null,
      turnDeadline: null,
      stake: s.stake || 0, // Phase 7
      purchases: s.purchases || {}, // Phase 7: power-up purchase counts
    };
    for (const id of rooms[code].order) scheduleSeatRelease(rooms[code], code, id, RESTORE_GRACE_MS);
    if (rooms[code].started) armTurnTimer(rooms[code]);
    n++;
  }
  return n;
}

// Snapshot for /metrics: counts derived from the in-memory `rooms` map.
function computeStats() {
  let activeGames = 0, waitingRooms = 0, players = 0, online = 0;
  for (const code in rooms) {
    const r = rooms[code];
    if (r.started) activeGames++; else waitingRooms++;
    for (const id of r.order) {
      players++;
      if (r.players[id] && r.players[id].online) online++;
    }
  }
  return {
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    rooms: Object.keys(rooms).length,
    activeGames,
    waitingRooms,
    players,
    online,
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
    redis: store.isEnabled(),
    ts: Date.now(),
  };
}

function roomPublic(room) {
  const present = room.order.filter((id) => room.players[id] && room.players[id].online);
  return {
    started: room.started,
    playerCount: room.order.length,
    onlineCount: present.length,
    mode: room.mode || "classic",
    stake: room.stake || 0, // Phase 7
  };
}

function emitToClient(room, clientId, event, data) {
  const p = room.players[clientId];
  if (p && p.sid) io.to(p.sid).emit(event, data);
}

// all cells belonging to the player's ships that are fully sunk by attackerHits
function sunkCellsList(playerData, attackerHits) {
  const out = [];
  if (!playerData.ships) return out;
  for (const ship of playerData.ships) {
    let all = true;
    for (const k of ship) if (!attackerHits.has(k)) { all = false; break; }
    if (all) for (const k of ship) out.push(k);
  }
  return out;
}

function emitScores(room) {
  room.scores = room.scores || {};
  for (const id of room.order) {
    const oppId = opponentOf(room, id);
    emitToClient(room, id, "scoreUpdate", {
      you: room.scores[id] || 0,
      opp: (oppId && room.scores[oppId]) || 0,
    });
  }
}

// ---------- Advance mode: power-ups ----------
const POWERS = ["scatter", "cross", "double", "reveal", "mine"];
function newInv() { return { scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 }; }
function expandCells(power, r, c) {
  if (power === "cross") {
    const out = [[r, c]];
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
      if (nr >= 0 && nr < BOARD && nc >= 0 && nc < BOARD) out.push([nr, nc]);
    });
    return out;
  }
  return [[r, c]];
}
// power-ups sitting on the board that `attackerId` shoots (their opponent's board)
function powerupsForAttacker(room, attackerId) {
  const defId = opponentOf(room, attackerId);
  const map = room.powerups && room.powerups[defId];
  if (!map) return [];
  return Object.keys(map).map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c, type: map[k] };
  });
}
function emitInv(room, clientId) {
  const p = room.players[clientId];
  emitToClient(room, clientId, "inventory", (p && p.inv) || newInv());
}
// maybe drop a new power-up on defenderId's board (visible to the attacker)
function maybeSpawn(room, defenderId) {
  if (room.mode !== "advance") return;
  if (Math.random() > 0.27) return; // ~1 power-up mỗi 3-4 lượt
  const defData = room.players[defenderId];
  const attackerId = opponentOf(room, defenderId);
  const attacker = attackerId && room.players[attackerId];
  if (!defData || !attacker) return;
  room.powerups = room.powerups || {};
  room.powerups[defenderId] = room.powerups[defenderId] || {};
  const taken = room.powerups[defenderId];
  const free = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = r + "," + c;
    if (defData.occ && defData.occ.has(k)) continue; // not on a ship
    if (attacker.hits.has(k)) continue;              // not an already-shot cell
    if (taken[k]) continue;
    free.push(k);
  }
  if (!free.length) return;
  const k = free[Math.floor(Math.random() * free.length)];
  taken[k] = POWERS[Math.floor(Math.random() * POWERS.length)];
  emitToClient(room, attackerId, "powerups", powerupsForAttacker(room, attackerId));
}

// Build a full state snapshot so a (re)connecting client can restore its screen.
function syncPayload(room, code, clientId) {
  const me = room.players[clientId];
  const oppId = opponentOf(room, clientId);
  const opp = oppId ? room.players[oppId] : null;
  const myShots = [];
  if (me) {
    for (const k of me.hits) {
      const [r, c] = k.split(",").map(Number);
      const hit = opp && opp.occ ? opp.occ.has(k) : false;
      myShots.push({ r, c, hit });
    }
  }
  const incoming = [];
  if (opp) {
    for (const k of opp.hits) {
      const [r, c] = k.split(",").map(Number);
      const hit = me && me.occ ? me.occ.has(k) : false;
      incoming.push({ r, c, hit });
    }
  }
  return {
    code,
    started: room.started,
    yourTurn: room.turn === clientId,
    turnDeadline: room.started ? (room.turnDeadline || null) : null,
    turnDur: TURN_MS,
    oppProfile: (opp && opp.profile) || null,
    youReady: !!(me && me.ready),
    oppPresent: !!opp,
    oppReady: !!(opp && opp.ready),
    oppOnline: !!(opp && opp.online),
    occ: me && me.occ ? [...me.occ] : [],
    myShots,
    incoming,
    sunkOpp: opp ? sunkShipCount(opp, me ? me.hits : new Set()) : 0,
    sunkMine: me ? sunkShipCount(me, opp ? opp.hits : new Set()) : 0,
    sunkOppCells: opp ? sunkCellsList(opp, me ? me.hits : new Set()) : [],
    sunkMyCells: me ? sunkCellsList(me, opp ? opp.hits : new Set()) : [],
    myScore: (room.scores && room.scores[clientId]) || 0,
    oppScore: (room.scores && oppId && room.scores[oppId]) || 0,
    mode: room.mode || "classic",
    inv: me && me.inv ? me.inv : newInv(),
    powerups: powerupsForAttacker(room, clientId),
    myMines: (room.mines && room.mines[clientId]) ? [...room.mines[clientId]] : [],
    stake: room.stake || 0, // Phase 7
    purchasesRemaining: room.started && room.mode === "advance" && room.players[clientId]?.userId
      ? POWERUP_CAP_PER_MATCH - ((room.purchases && room.purchases[clientId]) || 0)
      : 0,
    powerupPrice: room.mode === "advance"
      ? Math.max(POWERUP_FIXED_FLOOR, Math.round(POWERUP_STAKE_PCT * (room.stake || 0)))
      : 0,
  };
}

// Give the turn to `toId`, unless they owe a skipped turn (e.g. hit a mine), in which case it bounces back.
function giveTurn(room, toId, otherId) {
  const p = room.players[toId];
  if (p && p.skipNext) { p.skipNext = false; room.turn = otherId; }
  else room.turn = toId;
}

// ---------- Turn clock: cap each turn so a player cannot stall the game ----------
const TURN_MS = 20000;   // tối đa 20s mỗi lượt
const MAX_TIMEOUTS = 3;  // bỏ lượt liên tiếp >= 3 (≈1 phút không thao tác) -> xử thua

function clearTurnTimer(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  room.turnDeadline = null;
}

// Stamp last activity time so the cleanup sweep can evict truly idle rooms (SEC-03).
function touchRoom(room) {
  if (room) room.lastActivityAt = Date.now();
}

// Hybrid room-eviction sweep (SEC-03, D-10): run every CLEANUP_INTERVAL_MS.
// - Immediately deletes rooms where both seats are gone (order.length === 0).
// - Evicts rooms idle longer than ROOM_IDLE_THRESHOLD_MS (zombie / abandoned games).
// Exported via TEST_EXPORTS so tests can invoke one sweep pass synchronously.
function sweepRooms() {
  const now = Date.now();
  for (const code in rooms) {
    const r = rooms[code];
    if (r.order.length === 0) { delete rooms[code]; continue; }
    if (r.lastActivityAt && now - r.lastActivityAt > ROOM_IDLE_THRESHOLD_MS) {
      clearTurnTimer(r);
      // Phase 7: refund wagers if game was started but never resolved (mutual abandon)
      if (r.stake > 0 && r.started && !r.recorded) {
        for (const id of r.order) {
          const userId = r.players[id]?.userId;
          if (userId) creditWallet(userId, r.stake, "wager_refund", "sweep_" + code).catch(() => {});
        }
      }
      // Phase 7: also refund wagers for non-started wagered rooms (abandoned lobby)
      if (r.stake > 0 && !r.started) {
        for (const id of r.order) {
          const userId = r.players[id]?.userId;
          const wagerId = r.players[id]?.wagerId;
          if (userId) creditWallet(userId, r.stake, "wager_refund", wagerId || "sweep_" + code).catch(() => {});
        }
      }
      delete rooms[code];
    }
  }
}

// (Re)start the countdown for whoever holds the turn, and push the absolute
// deadline to both clients so they render a synced countdown.
function armTurnTimer(room) {
  clearTurnTimer(room);
  if (!room.started || !room.turn) return;
  const who = room.turn;
  room.turnDeadline = Date.now() + TURN_MS;
  for (const id of room.order) emitToClient(room, id, "turnTimer", { deadline: room.turnDeadline, dur: TURN_MS, yourTurn: id === who });
  room.turnTimer = setTimeout(() => onTurnTimeout(room, who), TURN_MS);
}

// End the game awarding the win to the opponent of loserId (forfeit/timeout).
function endGameForfeit(room, loserId, reason) {
  clearTurnTimer(room);
  const winnerId = opponentOf(room, loserId);
  if (winnerId) {
    room.scores = room.scores || {};
    room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
    emitScores(room);
    emitToClient(room, winnerId, "gameOver", { win: true, reason });
  }
  emitToClient(room, loserId, "gameOver", { win: false, reason });
  room.started = false;
  room.turn = null;
  // Record match after both gameOver emits (D-07); room.started was true entering forfeit.
  // Guard: !room.recorded dedup (D-06); order.length===2 belt-and-suspenders.
  if (winnerId && !room.recorded && room.order.length === 2) {
    room.recorded = true; // synchronous dedup guard (D-06) — set BEFORE the promise
    const wId = room.players[winnerId]?.userId ?? null;
    const lId = room.players[loserId]?.userId ?? null;
    recordMatch(wId, lId, reason, room.mode, room.startedAt, room.stake || 0).catch(() => {});
    // Phase 7: push balance update to winner after wagered forfeit
    if (room.stake > 0 && wId) {
      getWalletBalance(wId).then((bal) => {
        emitToClient(room, winnerId, "balanceUpdate", { balance: bal });
      }).catch(() => {});
    }
  }
}

function onTurnTimeout(room, who) {
  if (rooms[room.code] !== room) return;            // room đã bị xóa
  if (room.resolving) return;                       // D-09: shot in flight — skip double-resolution
  if (!room.started || room.turn !== who) return;   // lượt đã chuyển đi rồi
  const p = room.players[who];
  if (!p) return;
  p.timeouts = (p.timeouts || 0) + 1;
  if (p.timeouts >= MAX_TIMEOUTS) { endGameForfeit(room, who, "timeout"); return; }
  // bỏ lượt: chuyển cho đối thủ, báo cả hai, rồi lên giờ lại
  const opp = opponentOf(room, who);
  emitToClient(room, who, "turnSkipped", { you: true });
  if (opp) emitToClient(room, opp, "turnSkipped", { you: false });
  giveTurn(room, opp, who);
  for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
  armTurnTimer(room);
}

// Resolve a set of shots fired by clientId at their opponent. Handles power-up pickup,
// mines, sunk/win detection, turn handover and all emits. Returns a summary for the caller's cb.
function doShot(room, clientId, cells) {
  // Guard: null/shape check before any property access — prevents crash-probing
  // a game mid-resolution (SEC-02, T-03-02).
  if (!Array.isArray(cells) || !cells.length) return { ok: false, code: "BAD_STATE" };
  const opp = opponentOf(room, clientId);
  const oppData = room.players[opp];
  const me = room.players[clientId];
  if (!oppData || !oppData.occ || !me) return { ok: false, code: "BAD_STATE" };
  me.inv = me.inv || newInv();
  me.timeouts = 0; // người chơi vừa thao tác -> reset chuỗi bỏ lượt
  const before = sunkShipCount(oppData, me.hits);
  room.powerups = room.powerups || {};
  const pmap = room.powerups[opp] || {};
  room.mines = room.mines || {};
  const mineSet = room.mines[opp] || null;
  const results = [], collected = [];
  let anyHit = false, mineHit = false;
  for (const [rr, cc] of cells) {
    const k = rr + "," + cc;
    const hit = oppData.occ.has(k);
    if (me.hits.has(k)) { results.push({ r: rr, c: cc, hit }); continue; }
    me.hits.add(k);
    if (hit) anyHit = true;
    if (pmap[k]) { collected.push(pmap[k]); me.inv[pmap[k]] = (me.inv[pmap[k]] || 0) + 1; delete pmap[k]; }
    if (mineSet && mineSet.has(k)) { mineHit = true; mineSet.delete(k); }
    results.push({ r: rr, c: cc, hit });
  }
  const sunkCount = sunkShipCount(oppData, me.hits);
  const newSunk = sunkCount - before;
  const sunkCells = sunkCellsList(oppData, me.hits);
  const win = sunkCount >= FLEET.length;

  if (collected.length) emitToClient(room, clientId, "powerups", powerupsForAttacker(room, clientId));
  emitInv(room, clientId);
  emitToClient(room, opp, "incoming", { cells: results, sunkCells, sunkMineCount: sunkCount, newSunk, mineHit });

  if (win) {
    room.scores = room.scores || {};
    room.scores[clientId] = (room.scores[clientId] || 0) + 1;
    emitScores(room);
    emitToClient(room, clientId, "gameOver", { win: true });
    emitToClient(room, opp, "gameOver", { win: false });
    room.started = false;
    clearTurnTimer(room);
    // Record match after gameOver emits (D-07: never block end-game on DB write).
    // room.started was true entering doShot win; order.length===2 belt-and-suspenders.
    // Bot/single-player never reach server (no server room created — no guard needed).
    if (!room.recorded && room.order.length === 2) {
      room.recorded = true; // synchronous dedup guard (D-06) — set BEFORE the promise
      const wId = room.players[clientId]?.userId ?? null;
      const lId = room.players[opp]?.userId ?? null;
      recordMatch(wId, lId, "normal", room.mode, room.startedAt, room.stake || 0).catch(() => {});
      // Phase 7: push balance update to winner after wagered win
      if (room.stake > 0 && wId) {
        getWalletBalance(wId).then((bal) => {
          emitToClient(room, clientId, "balanceUpdate", { balance: bal });
        }).catch(() => {});
      }
    }
    return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
  }
  // turn: a hit keeps it; a clean miss can be saved by a bonus shot; a mine forces a loss + skip
  let keep = anyHit;
  if (!keep && (me.bonus || 0) > 0) { me.bonus--; keep = true; }
  if (mineHit) { me.skipNext = true; keep = false; }
  if (!keep) giveTurn(room, opp, clientId);
  maybeSpawn(room, opp);
  for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
  armTurnTimer(room);
  return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
}

// Reattach `socket` to a seat in `room`, migrating the seat's data to
// `newClientId` when the returning player's id changed (mobile FB wipes
// storage + player id is null under Zero Permissions). Sends sync.
function reclaimSeat(room, code, seatId, newClientId, socket) {
  const p = room.players[seatId];
  if (!p) return false;
  if (p.timer) { clearTimeout(p.timer); p.timer = null; }
  if (seatId !== newClientId) {
    delete room.players[seatId];
    room.players[newClientId] = p;
    room.order = room.order.map((id) => (id === seatId ? newClientId : id));
    if (room.turn === seatId) room.turn = newClientId;
    if (room.lastStarter === seatId) room.lastStarter = newClientId;
    if (room.scores && room.scores[seatId] != null) { room.scores[newClientId] = room.scores[seatId]; delete room.scores[seatId]; }
    if (room.powerups && room.powerups[seatId]) { room.powerups[newClientId] = room.powerups[seatId]; delete room.powerups[seatId]; }
    if (room.mines && room.mines[seatId]) { room.mines[newClientId] = room.mines[seatId]; delete room.mines[seatId]; }
  }
  p.sid = socket.id; p.online = true;
  socket.join(code);
  socket.data.code = code;
  socket.data.clientId = newClientId;
  io.to(code).emit("roomUpdate", roomPublic(room));
  const oppId = opponentOf(room, newClientId);
  if (oppId) emitToClient(room, oppId, "opponentOnline");
  emitToClient(room, newClientId, "sync", syncPayload(room, code, newClientId));
  return true;
}

// ─── Matchmaking queue engine (05-01 + 05-02 + 05-03) ──────────────────────

// Liveness check for a queue entry's socketId (CR-01, WR-05).
// Returns true only if the socketId still maps to a connected socket on the
// default namespace. A queue entry can outlive its socket (tab closed between
// enqueue and pairing) because disconnect cleanup is keyed on the socket's own
// clientId, which may differ from the entry key — see WR-02/WR-03. Pairing a
// dead entry produces a phantom-player room that stalls in placement.
// Indirected through a mutable binding so unit tests can simulate liveness
// without a live Socket.IO server (default consults the real io namespace).
let socketIsLive = (socketId) => !!io.of("/").sockets.get(socketId);

// Server-trusted queue key (WR-02/WR-03). The queue Map MUST NOT be keyed on
// the client-supplied arg.clientId: a malicious client could pass a victim's
// clientId to overwrite/displace their entry, and disconnect cleanup (keyed on
// the socket's own identity) could diverge from the entry key, orphaning a
// phantom. Derive the key from non-forgeable, server-held state:
//   - authenticated: "u:<userId>" (stable across reconnects on the same account)
//   - guest:         "s:<socket.id>" (unique per live connection)
// The entry still carries the real clientId for the room seat / localStorage
// reclaim, but it is never used as the map key.
function queueKeyFor(socket) {
  return socket.data.userId != null ? `u:${socket.data.userId}` : `s:${socket.id}`;
}

// Remove a queue key from BOTH queues atomically (QUEUE-03, T-5-10).
// Safe to call when the key was never queued — no-op in that case.
function removeFromQueues(queueKey) {
  for (const type of ["free", "wagered"]) {
    if (queues[type].delete(queueKey)) {
      console.log(`[queue] ${type} entry removed: ${queueKey}`);
    }
  }
}

// Return a valid pair from entries in the given queue type.
// For free, any two entries pair (FIFO).
// For wagered: pair only entries with the same stake level.
function findPair(type, entries) {
  if (entries.length < 2) return null;
  if (type === "wagered") {
    // Match only entries with the same stake level
    const byStake = {};
    for (const e of entries) {
      (byStake[e.stake] = byStake[e.stake] || []).push(e);
    }
    for (const group of Object.values(byStake)) {
      if (group.length >= 2) return [group[0], group[1]];
    }
    return null;
  }
  return [entries[0], entries[1]];
}

// Attempt to pair the two oldest non-pairing entries in the given queue.
// Synchronous deletion of both entries from the map happens BEFORE any async
// work — this is the double-pairing race guard (T-5-05, mirrors room.resolving).
function tryPair(type) {
  const q = queues[type];
  // CR-01: prune entries whose socket has already disconnected before they can
  // be selected for pairing — prevents a dead entry being matched into a
  // phantom-player room. Skip entries currently mid-pairing (their socket
  // liveness is re-checked in createMatchedRoom).
  for (const [key, e] of [...q.entries()]) {
    if (!e.pairing && !socketIsLive(e.socketId)) {
      q.delete(key);
      console.log(`[queue] pruned dead ${type} entry before pairing: ${key}`);
    }
  }
  if (q.size < 2) return;
  const entries = [...q.values()].filter((e) => !e.pairing);
  const pair = findPair(type, entries);
  if (!pair) return;
  const [a, b] = pair;
  // Synchronous race guard: mark + delete BEFORE any await (T-5-05).
  // Entries are keyed on the server-trusted queueKey (WR-02), with a fallback
  // to clientId for entries created before this field existed.
  a.pairing = true;
  b.pairing = true;
  q.delete(a.queueKey ?? a.clientId);
  q.delete(b.queueKey ?? b.clientId);
  createMatchedRoom(a, b, type).catch((err) => {
    console.error("[queue] createMatchedRoom error:", err && err.message);
    // On failure: reset pairing flag and re-insert ONLY entries whose socket is
    // still live (WR-05) — re-inserting a dead entry resurrects a phantom that
    // would be matched on the next sweep.
    a.pairing = false;
    b.pairing = false;
    if (socketIsLive(a.socketId)) q.set(a.queueKey ?? a.clientId, a);
    if (socketIsLive(b.socketId)) q.set(b.queueKey ?? b.clientId, b);
  });
}

// Sweep both queues — called by the setInterval sweep and after each joinQueue.
function tryPairAll() {
  tryPair("free");
  tryPair("wagered");
}

// Build a matched room in the exact createRoom shape and seat both players.
async function createMatchedRoom(entryA, entryB, type) {
  // CR-01: re-validate BOTH sockets are still live before committing the room.
  // tryPair deleted these entries from the queue synchronously; if one socket
  // died in the meantime, seating it would create a phantom-player room that
  // stalls in placement. Abort and re-queue whichever side is still connected.
  if (!socketIsLive(entryA.socketId) || !socketIsLive(entryB.socketId)) {
    const survivor = socketIsLive(entryA.socketId)
      ? entryA
      : (socketIsLive(entryB.socketId) ? entryB : null);
    if (survivor) {
      survivor.pairing = false;
      queues[type].set(survivor.queueKey ?? survivor.clientId, survivor);
      console.log(`[queue] aborted ${type} pairing — partner socket gone; re-queued ${survivor.clientId}`);
    }
    return;
  }
  const code = newCode();
  rooms[code] = {
    code, players: {}, order: [], started: false, turn: null, scores: {},
    lastStarter: null, mode: "classic",
    powerups: {}, turnTimer: null, turnDeadline: null,
    resolving: false, lastActivityAt: Date.now(),
    matchQueueType: type, // D-11: preserved for partner re-queue on pre-start disconnect
    stake: type === "wagered" ? (entryA.stake || 0) : 0, // Phase 7: carry stake from queue entries
  };
  for (const entry of [entryA, entryB]) {
    rooms[code].players[entry.clientId] = {
      sid: entry.socketId, ready: false, occ: null, hits: new Set(), online: true,
      timer: null, inv: newInv(), bonus: 0,
      profile: entry.profile,
      userId: entry.userId ?? null,
      matchQueueType: type, // D-11: retained so disconnect handler can re-queue survivor
      wagerId: entry.wagerId ?? null, // Phase 7: track for potential refund
    };
    rooms[code].order.push(entry.clientId);
    const sock = io.of("/").sockets.get(entry.socketId);
    if (sock) {
      sock.join(code);
      sock.data.code = code;
      sock.data.clientId = entry.clientId;
      sock.data.queueType = null;
      sock.data.queueClientId = null;
    }
    upsertGuestCredential(entry.clientId); // fire-and-forget: durable identity (DATA-01)
  }
  io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
  io.to(code).emit("opponentJoined");
  io.to(entryA.socketId).emit("oppProfile", entryB.profile || null);
  io.to(entryB.socketId).emit("oppProfile", entryA.profile || null);
  io.to(entryA.socketId).emit("matchFound", { code, stake: rooms[code].stake || 0 });
  io.to(entryB.socketId).emit("matchFound", { code, stake: rooms[code].stake || 0 });
  console.log(`[queue] matched ${type}: ${entryA.clientId} vs ${entryB.clientId} -> room ${code}`);
}

io.on("connection", (socket) => {
  socket.data.code = null;
  socket.data.clientId = null;

  // D-11: read userId from the shared session (io.engine.use(sessionMiddleware) wired above).
  // socket.request.session is populated because Socket.IO runs the same session middleware.
  // null = guest; integer = authenticated account.
  const userId = socket.request.session?.passport?.user ?? null;
  socket.data.userId = userId;
  console.log("[auth] socket connected, clientId:", socket.data.clientId, "userId:", userId);

  // Phase 7: push wallet balance to authenticated sockets on connect
  if (userId) {
    getWalletBalance(userId)
      .then((balance) => socket.emit("balanceUpdate", { balance }))
      .catch(() => {}); // non-fatal: balance can be fetched via /api/wallet
  }

  socket.on("createRoom", async (arg, cb) => {
    if (typeof arg === "function") { cb = arg; arg = {}; }
    const clientId = (arg && arg.clientId) || socket.id;
    const code = newCode();
    const mode = (arg && arg.mode) === "advance" ? "advance" : "classic";
    // Phase 7: stake for room-code games (0 = free, or from VALID_STAKES)
    const stake = VALID_STAKES.includes(arg && arg.stake) ? arg.stake : 0;
    if (stake > 0) {
      // Guard: must be signed in to wager
      if (socket.data.userId == null) {
        return cb && cb({ ok: false, code: "WAGERED_REQUIRES_ACCOUNT" });
      }
      // Debit host's wager immediately
      const referenceId = "room_host_" + Date.now() + "_" + socket.id;
      const debitResult = await debitWallet(socket.data.userId, stake, "wager_debit", referenceId);
      if (!debitResult.ok) {
        return cb && cb({ ok: false, code: "INSUFFICIENT_BALANCE" });
      }
      // Store hostWagerId for potential refund
      var hostWagerId = referenceId;
    }
    // room.recorded is the D-06 dedup flag set synchronously at end paths (Task 2 — endGameForfeit/doShot/scheduleSeatRelease/leaveRoom)
    rooms[code] = { code, players: {}, order: [], started: false, turn: null, scores: {}, lastStarter: null, mode, powerups: {}, turnTimer: null, turnDeadline: null, resolving: false, lastActivityAt: Date.now(), stake, hostWagerId: hostWagerId || null };
    rooms[code].players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
      userId: socket.data.userId ?? null,
      wagerId: hostWagerId || null, // Phase 7: track for refund
    };
    rooms[code].order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code, stake });
    io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
    upsertGuestCredential(clientId); // fire-and-forget: durable identity (DATA-01)
  });

  // ─── Queue handlers (05-01) ───────────────────────────────────────────────

  socket.on("joinQueue", async (arg, cb) => {
    // Normalize type to allowlist — any non-"wagered" value coerces to free (T-5-02)
    const type = (arg && arg.type) === "wagered" ? "wagered" : "free";
    const clientId = (arg && arg.clientId) || socket.id;
    socket.data.clientId = clientId;
    // Server-trusted queue key — never the forgeable arg.clientId (WR-02).
    const queueKey = queueKeyFor(socket);
    // Rate limit on a non-forgeable identity (WR-02): the live socket id, so a
    // malicious client cannot spend another player's budget by passing their
    // clientId. socket.id is unique per connection and not client-controlled.
    const rlKey = socket.id;
    try {
      await joinQueueLimiter.consume(rlKey);
    } catch (e) {
      return cb && cb({ ok: false, code: "RATE_LIMITED" });
    }
    // Guard: already in a room (T-5-04)
    if (socket.data.code) return cb && cb({ ok: false, code: "ALREADY_IN_ROOM" });
    // Guard: already in queue (T-5-04). Authoritative check against the queue
    // maps using the server-trusted key (WR-03) — not just socket.data, which a
    // fresh reconnect socket (Safari backgrounding) would have reset to null.
    if (socket.data.queueType || queues.free.has(queueKey) || queues.wagered.has(queueKey)) {
      return cb && cb({ ok: false, code: "ALREADY_IN_QUEUE" });
    }

    // Phase 7: wagered queue requires signed-in user + valid stake + sufficient balance
    let stake = 0;
    let wagerId = null;
    if (type === "wagered") {
      // Guard: must be signed in
      if (socket.data.userId == null) {
        return cb && cb({ ok: false, code: "WAGERED_REQUIRES_ACCOUNT" });
      }
      // Guard: valid stake preset
      const requestedStake = arg && arg.stake;
      if (!VALID_STAKES.includes(requestedStake)) {
        return cb && cb({ ok: false, code: "INVALID_STAKE" });
      }
      stake = requestedStake;
      // Debit wager immediately at queue join
      const referenceId = "queue_" + Date.now() + "_" + socket.id;
      const debitResult = await debitWallet(socket.data.userId, stake, "wager_debit", referenceId);
      if (!debitResult.ok) {
        return cb && cb({ ok: false, code: "INSUFFICIENT_BALANCE" });
      }
      wagerId = referenceId;
    }

    const entry = {
      socketId: socket.id,
      clientId,
      queueKey, // WR-02: server-trusted map key, retained for re-queue/cleanup
      userId: socket.data.userId ?? null,
      stake,
      wagerId, // Phase 7: for refund tracking
      enqueuedAt: Date.now(),
      pairing: false,
      profile: sanitizeProfile(arg && arg.profile), // T-5-01
      queueType: type,
    };
    socket.data.queueType = type;
    socket.data.queueKey = queueKey;
    socket.data.queueClientId = clientId;
    socket.data.queueStake = stake;       // Phase 7: for refund on disconnect/leave
    socket.data.queueWagerId = wagerId;   // Phase 7: for refund tracking
    queues[type].set(queueKey, entry);
    upsertGuestCredential(clientId); // fire-and-forget: durable identity (DATA-01)
    cb && cb({ ok: true });
    tryPair(type);
  });

  socket.on("leaveQueue", async (arg, cb) => {
    // WR-04: never null queue state while already in a room — a stray client
    // leaveQueue racing the matchFound transition must not touch the queue.
    if (socket.data.code) return cb && cb({ ok: true });
    const queueKey = socket.data.queueKey || queueKeyFor(socket);
    // WR-04: delete only an entry this socket actually owns (socketId match),
    // so a forged key cannot evict another player's entry.
    for (const type of ["free", "wagered"]) {
      const e = queues[type].get(queueKey);
      if (e && e.socketId === socket.id) {
        queues[type].delete(queueKey);
        // Phase 7: refund wager if leaving wagered queue
        if (e.stake && e.userId) {
          creditWallet(e.userId, e.stake, "wager_refund", e.wagerId).catch(() => {});
          getWalletBalance(e.userId).then((bal) => {
            socket.emit("balanceUpdate", { balance: bal });
          }).catch(() => {});
        }
      }
    }
    socket.data.queueType = null;
    socket.data.queueKey = null;
    socket.data.queueClientId = null;
    socket.data.queueStake = null;
    socket.data.queueWagerId = null;
    cb && cb({ ok: true });
  });

  socket.on("joinRoom", async (arg, cb) => {
    let code, clientId;
    if (typeof arg === "string") { code = arg; clientId = socket.id; }
    else { code = arg && arg.code; clientId = (arg && arg.clientId) || socket.id; }
    code = (code || "").toUpperCase().trim();
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false, code: "ROOM_NOT_FOUND" });
    // allow rejoin of own seat
    if (room.players[clientId]) {
      const p = room.players[clientId];
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      setProfileIfAny(p, arg && arg.profile);
      p.sid = socket.id; p.online = true;
      socket.join(code);
      socket.data.code = code;
      socket.data.clientId = clientId;
      cb && cb({ ok: true, code });
      io.to(code).emit("roomUpdate", roomPublic(room));
      const oppId = opponentOf(room, clientId);
      if (oppId) emitToClient(room, oppId, "opponentOnline");
      emitToClient(room, clientId, "sync", syncPayload(room, code, clientId));
      return;
    }
    // Reclaim a disconnected (offline) seat by code. If a returning player's
    // clientId differs from the one they left with (e.g. localStorage cleared),
    // matching by clientId fails. Letting them take over the offline seat just by
    // re-entering the room code makes reconnect work regardless. (Hijack risk
    // during the grace window is acceptable here.)
    if (room.order.length >= 2) {
      const offlineId = room.order.find((id) => room.players[id] && !room.players[id].online);
      if (offlineId) {
        reclaimSeat(room, code, offlineId, clientId, socket);
        upsertGuestCredential(clientId); // fire-and-forget: persist reclaimed identity (DATA-01, WR-05)
        return cb && cb({ ok: true, code, reclaimed: true });
      }
      return cb && cb({ ok: false, code: "ROOM_FULL" });
    }
    if (room.started) return cb && cb({ ok: false, code: "GAME_STARTED" });

    // Phase 7: wagered room-code game — debit joiner's wager
    let joinerWagerId = null;
    if (room.stake > 0) {
      // Guard: must be signed in
      if (socket.data.userId == null) {
        return cb && cb({ ok: false, code: "WAGERED_REQUIRES_ACCOUNT", stake: room.stake });
      }
      // Debit joiner's wager
      const referenceId = "room_join_" + Date.now() + "_" + socket.id;
      const debitResult = await debitWallet(socket.data.userId, room.stake, "wager_debit", referenceId);
      if (!debitResult.ok) {
        return cb && cb({ ok: false, code: "INSUFFICIENT_BALANCE", stake: room.stake });
      }
      joinerWagerId = referenceId;
    }

    room.players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
      userId: socket.data.userId ?? null,
      wagerId: joinerWagerId, // Phase 7: track for refund
    };
    room.order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code, stake: room.stake || 0 });
    io.to(code).emit("roomUpdate", roomPublic(room));
    io.to(code).emit("opponentJoined");
    upsertGuestCredential(clientId); // fire-and-forget: P2 persists on first session (DATA-01)
    // exchange profiles so both scoreboards show avatar + name immediately
    const oppId = opponentOf(room, clientId);
    if (oppId) {
      emitToClient(room, oppId, "oppProfile", room.players[clientId].profile || null);
      emitToClient(room, clientId, "oppProfile", room.players[oppId].profile || null);
    }
  });

  // Resume without a room code: find any room that already holds this clientId
  // (online or in its disconnect-grace window) and reattach. Lets a player who
  // reloaded or reopened the tab land straight back in their game, as long as
  // their clientId survived in localStorage.
  socket.on("resume", (arg, cb) => {
    const clientId = arg && arg.clientId;
    // Exact clientId seat — works when the id (localStorage) survived.
    if (clientId) {
      for (const code in rooms) {
        if (rooms[code].players && rooms[code].players[clientId]) {
          const room = rooms[code];
          // BUG-FIX: if the room has only this player left (opponent already left)
          // and the game is not active, don't resume into a dead room. Clean it up
          // so the player lands on the lobby instead of a stale empty room.
          if (room.order.length <= 1 && !room.started) {
            const p = room.players[clientId];
            if (p && p.timer) { clearTimeout(p.timer); p.timer = null; }
            clearTurnTimer(room);
            delete rooms[code];
            break; // fall through to cb({ ok: false })
          }
          touchRoom(room); // SEC-03: stamp activity on resume so sweep doesn't evict
          // WR-03: a player back in a room must not leave a phantom queue entry
          // behind. Clear any lingering entry under this socket's queue key and
          // reset per-socket queue state.
          removeFromQueues(socket.data.queueKey || queueKeyFor(socket));
          socket.data.queueType = null;
          socket.data.queueKey = null;
          socket.data.queueClientId = null;
          reclaimSeat(room, code, clientId, clientId, socket);
          upsertGuestCredential(clientId); // fire-and-forget: ensure durable credential on resume (DATA-01)
          // Stamp userId onto seat if the player signed in between sessions; never overwrite existing id with null
          if (socket.data.userId && room && room.players[clientId]) {
            room.players[clientId].userId = socket.data.userId;
          }
          return cb && cb({ ok: true, code });
        }
      }
    }
    return cb && cb({ ok: false });
  });

  // Reconnect attempt: client reloaded or came back from background.
  socket.on("rejoin", (arg, cb) => {
    const code = (arg && arg.code ? arg.code : "").toUpperCase().trim();
    const clientId = arg && arg.clientId;
    const room = rooms[code];
    if (!room || !clientId || !room.players[clientId]) {
      return cb && cb({ ok: false });
    }
    // BUG-FIX: if room is dead (only me left, game not active), clean up and reject.
    if (room.order.length <= 1 && !room.started) {
      const p = room.players[clientId];
      if (p && p.timer) { clearTimeout(p.timer); p.timer = null; }
      clearTurnTimer(room);
      delete rooms[code];
      return cb && cb({ ok: false });
    }
    touchRoom(room); // SEC-03: stamp activity on rejoin so sweep doesn't evict live room
    // WR-03: clear any lingering queue entry so a reconnect cannot leave a
    // phantom behind, and reset per-socket queue state.
    removeFromQueues(socket.data.queueKey || queueKeyFor(socket));
    socket.data.queueType = null;
    socket.data.queueKey = null;
    socket.data.queueClientId = null;
    const p = room.players[clientId];
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    p.sid = socket.id; p.online = true;
    // Stamp userId onto seat if the player signed in between sessions; never overwrite existing id with null
    if (socket.data.userId) p.userId = socket.data.userId;
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true });
    io.to(code).emit("roomUpdate", roomPublic(room));
    upsertGuestCredential(clientId); // fire-and-forget: ensure durable credential on rejoin (DATA-01)
    const oppId = opponentOf(room, clientId);
    if (oppId) emitToClient(room, oppId, "opponentOnline");
    emitToClient(room, clientId, "sync", syncPayload(room, code, clientId));
  });

  socket.on("placeShips", (ships, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.players[clientId]) return cb && cb({ ok: false, code: "NO_ROOM" });
    const pv = validatePlacement(ships);
    if (!pv) return cb && cb({ ok: false, code: "BAD_PLACEMENT" });
    room.players[clientId].occ = pv.occ;
    room.players[clientId].ships = pv.ships;
    room.players[clientId].ready = true;
    touchRoom(room); // SEC-03: stamp activity
    cb && cb({ ok: true });

    const ids = room.order;
    const allReady = ids.length === 2 && ids.every((id) => room.players[id].ready);
    const opp = opponentOf(room, clientId);
    if (opp) emitToClient(room, opp, "opponentReady");

    if (allReady) {
      room.started = true;
      room.startedAt = new Date(); // capture battle start time for match recording (MATCH-01)
      // ván đầu chọn ngẫu nhiên; các ván sau đổi lượt người đi trước (so le)
      if (room.lastStarter && ids.includes(room.lastStarter)) {
        room.turn = ids.find((id) => id !== room.lastStarter);
      } else {
        room.turn = ids[Math.floor(Math.random() * 2)];
      }
      room.lastStarter = room.turn;
      room.powerups = {}; room.mines = {};
      room.purchases = {};
      for (const id of ids) { room.players[id].inv = newInv(); room.players[id].bonus = 0; room.players[id].skipNext = false; room.players[id].timeouts = 0; room.purchases[id] = 0; }
      for (const id of ids) {
        emitToClient(room, id, "gameStart", { yourTurn: room.turn === id, mode: room.mode || "classic" });
        emitInv(room, id);
        emitToClient(room, id, "powerups", []);
      }
      armTurnTimer(room);
    }
  });

  socket.on("fire", async ({ r, c, power }, cb) => {
    // Rate limit: 2 shots/s per player (D-06/D-07, SEC-01)
    const rlKey = socket.data.clientId || socket.id;
    try {
      await fireLimiter.consume(rlKey);
      socket.data.rlFireHits = 0; // reset on successful consume
    } catch (e) {
      socket.data.rlFireHits = (socket.data.rlFireHits || 0) + 1;
      if (socket.data.rlFireHits >= RL_ABUSE_THRESHOLD) socket.disconnect(true); // D-08: repeated abuse
      return cb && cb({ ok: false, code: "RATE_LIMITED" });
    }
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
    if (!inBounds(r, c)) return cb && cb({ ok: false, code: "BAD_CELL" });
    // D-09: race guard — prevent simultaneous fire + turn-timeout from both resolving
    if (room.resolving) return cb && cb({ ok: false, code: "BAD_STATE" });
    touchRoom(room); // SEC-03: stamp activity so idle sweep doesn't evict active games
    const me = room.players[clientId];
    me.inv = me.inv || newInv();

    // aimed power-up shots consume inventory; classic mode ignores power entirely
    if (room.mode === "advance" && power === "cross") {
      if ((me.inv[power] || 0) <= 0) return cb && cb({ ok: false, code: "NO_POWERUP" });
      me.inv[power]--;
    } else {
      power = null;
    }
    room.resolving = true;
    let summary;
    try {
      summary = doShot(room, clientId, expandCells(power, r, c));
    } finally {
      room.resolving = false;
    }
    cb && cb(summary);
  });

  // Advance abilities that aren't an aimed shot
  socket.on("useAbility", async ({ type, r, c }, cb) => {
    // Rate limit: 1 ability/s per player (D-06/D-07, SEC-01)
    const rlKey = socket.data.clientId || socket.id;
    try {
      await abilityLimiter.consume(rlKey);
      socket.data.rlAbilityHits = 0; // reset on successful consume
    } catch (e) {
      socket.data.rlAbilityHits = (socket.data.rlAbilityHits || 0) + 1;
      if (socket.data.rlAbilityHits >= RL_ABUSE_THRESHOLD) socket.disconnect(true); // D-08: repeated abuse
      return cb && cb({ ok: false, code: "RATE_LIMITED" });
    }
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
    const me = room.players[clientId];
    me.inv = me.inv || newInv();
    if ((me.inv[type] || 0) <= 0) return cb && cb({ ok: false, code: "NO_POWERUP" });

    if (type === "double") {
      me.inv.double--; me.bonus = (me.bonus || 0) + 1;
      me.timeouts = 0; armTurnTimer(room);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "double" });
    }
    if (type === "reveal") {
      const opp = opponentOf(room, clientId);
      const oppData = opp && room.players[opp];
      const cand = [];
      if (oppData && oppData.occ) for (const k of oppData.occ) if (!me.hits.has(k)) cand.push(k);
      if (!cand.length) return cb && cb({ ok: false, code: "NO_REVEAL" });
      me.inv.reveal--;
      me.timeouts = 0; armTurnTimer(room);
      const k = cand[Math.floor(Math.random() * cand.length)];
      const [rr, cc] = k.split(",").map(Number);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "reveal", r: rr, c: cc });
    }
    if (type === "mine") {
      // đặt mìn lên ô trống của chính mình
      if (!inBounds(r, c)) return cb && cb({ ok: false, code: "BAD_CELL" });
      const k = r + "," + c;
      const opp = opponentOf(room, clientId);
      const oppHits = opp && room.players[opp] ? room.players[opp].hits : new Set();
      if (me.occ && me.occ.has(k)) return cb && cb({ ok: false, code: "MINE_ON_SHIP" });
      if (oppHits.has(k)) return cb && cb({ ok: false, code: "CELL_SHOT" });
      room.mines = room.mines || {};
      room.mines[clientId] = room.mines[clientId] || new Set();
      if (room.mines[clientId].has(k)) return cb && cb({ ok: false, code: "MINE_EXISTS" });
      me.inv.mine--;
      room.mines[clientId].add(k);
      me.timeouts = 0; armTurnTimer(room);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "mine", r, c });
    }
    if (type === "scatter") {
      // nổ ngẫu nhiên 3-5 vị trí trên biển địch
      const cand = [];
      for (let rr = 0; rr < BOARD; rr++) for (let cc = 0; cc < BOARD; cc++) {
        const k = rr + "," + cc;
        if (!me.hits.has(k)) cand.push([rr, cc]);
      }
      if (!cand.length) return cb && cb({ ok: false, code: "NO_CELLS" });
      // D-09: race guard for scatter (also calls doShot)
      if (room.resolving) return cb && cb({ ok: false, code: "BAD_STATE" });
      me.inv.scatter--;
      const n = Math.min(cand.length, 3 + Math.floor(Math.random() * 3)); // 3..5
      const pick = [];
      for (let i = 0; i < n; i++) pick.push(cand.splice(Math.floor(Math.random() * cand.length), 1)[0]);
      emitInv(room, clientId);
      room.resolving = true;
      let summary;
      try {
        summary = doShot(room, clientId, pick);
      } finally {
        room.resolving = false;
      }
      return cb && cb(Object.assign({ type: "scatter" }, summary));
    }
    cb && cb({ ok: false });
  });

  // Relay a chat message to the opponent. Text is trimmed + length-capped, and a
  // light per-player throttle stops a flood. No persistence — chat is ephemeral.
  // Relay a chat message to the opponent. Text is trimmed + length-capped, and a
  // per-player rate limiter stops a flood (5 per 10s). No persistence — chat is ephemeral.
  socket.on("chat", async (arg, cb) => {
    // Rate limit: 5 messages/10s per player (D-06/D-07, SEC-01)
    const rlKey = socket.data.clientId || socket.id;
    try {
      await chatLimiter.consume(rlKey);
      socket.data.rlChatHits = 0; // reset on successful consume
    } catch (e) {
      socket.data.rlChatHits = (socket.data.rlChatHits || 0) + 1;
      if (socket.data.rlChatHits >= RL_ABUSE_THRESHOLD) socket.disconnect(true); // D-08: repeated abuse
      return cb && cb({ ok: false, code: "RATE_LIMITED" });
    }
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.players[clientId]) return cb && cb({ ok: false });
    const text = sanitizeChat(arg && arg.text); // SEC-04: validate/sanitize chat input
    if (!text) return cb && cb({ ok: false });
    touchRoom(room); // SEC-03: stamp activity
    const opp = opponentOf(room, clientId);
    const now = Date.now();
    if (opp) emitToClient(room, opp, "chat", { text, ts: now });
    cb && cb({ ok: true });
  });

  // ─── Power-up purchase handler (Phase 7, Plan 04) ─────────────────────────
  socket.on("buyPowerup", async (arg, cb) => {
    const clientId = socket.data.clientId;
    const code = socket.data.code;
    const room = rooms[code];

    // Guard: must be in an active game
    if (!room || !clientId || !room.players[clientId] || !room.started || room.resolving) {
      return cb && cb({ ok: false, code: "NOT_IN_GAME" });
    }

    // Guard: advance mode only
    if (room.mode !== "advance") {
      return cb && cb({ ok: false, code: "NOT_ADVANCE_MODE" });
    }

    // Guard: must be signed in (guests have no wallet)
    const userId = room.players[clientId].userId;
    if (!userId) {
      return cb && cb({ ok: false, code: "GUEST_NO_WALLET" });
    }

    // Guard: valid power-up type
    const type = arg && arg.type;
    if (!POWERS.includes(type)) {
      return cb && cb({ ok: false, code: "INVALID_TYPE" });
    }

    // Guard: purchase cap
    room.purchases = room.purchases || {};
    room.purchases[clientId] = room.purchases[clientId] || 0;
    if (room.purchases[clientId] >= POWERUP_CAP_PER_MATCH) {
      return cb && cb({ ok: false, code: "PURCHASE_CAP_REACHED" });
    }

    // Rate limit
    try {
      await buyPowerupLimiter.consume(socket.id);
    } catch (e) {
      return cb && cb({ ok: false, code: "RATE_LIMITED" });
    }

    // Calculate price: max(FIXED_FLOOR, round(STAKE_PCT * stake))
    const stake = room.stake || 0;
    const price = Math.max(POWERUP_FIXED_FLOOR, Math.round(POWERUP_STAKE_PCT * stake));

    // Debit wallet
    const referenceId = `powerup_${code}_${clientId}_${room.purchases[clientId]}`;
    const result = await debitWallet(userId, price, "powerup_purchase", referenceId);
    if (!result.ok) {
      return cb && cb({ ok: false, code: result.code || "INSUFFICIENT_BALANCE" });
    }

    // Grant power-up
    const me = room.players[clientId];
    me.inv = me.inv || newInv();
    me.inv[type] = (me.inv[type] || 0) + 1;
    room.purchases[clientId]++;

    // Emit inventory update to buyer
    emitInv(room, clientId);

    // Emit balance update to buyer
    socket.emit("balanceUpdate", { balance: result.balance });

    // Notify opponent (no type revealed)
    const oppId = opponentOf(room, clientId);
    if (oppId) {
      emitToClient(room, oppId, "oppBoughtPowerup", {});
    }

    // Success callback
    cb && cb({ ok: true, type, price, newBalance: result.balance, remaining: POWERUP_CAP_PER_MATCH - room.purchases[clientId] });
  });

  socket.on("rematch", () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;
    for (const id of room.order) {
      room.players[id].ready = false;
      room.players[id].occ = null;
      room.players[id].hits = new Set();
      room.players[id].inv = newInv();
      room.players[id].bonus = 0;
      room.players[id].skipNext = false;
      room.players[id].timeouts = 0;
    }
    room.powerups = {}; room.mines = {}; room.purchases = {};
    room.started = false;
    room.recorded = false; // CR-01: clear dedup flag so the rematch game records its own match (MATCH-01)
    room.startedAt = null; // re-captured at battle start in placeShips allReady
    room.turn = null;
    clearTurnTimer(room);
    io.to(code).emit("rematchStart");
  });

  socket.on("leaveRoom", (cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (room && clientId && room.players[clientId]) {
      // Record match BEFORE any mutation (Pitfall 1: room.started cleared after delete).
      // Guard: room.started (D-05) and !room.recorded (D-06) and order.length===2 (D-04).
      // Keep existing opponentLeft emit — do NOT route through endGameForfeit (locked decision).
      if (room.started && !room.recorded && room.order.length === 2) {
        const winnerId = opponentOf(room, clientId);
        if (winnerId) {
          room.recorded = true; // synchronous dedup guard (D-06) — set BEFORE promise
          const wId = room.players[winnerId]?.userId ?? null;
          const lId = room.players[clientId]?.userId ?? null;
          recordMatch(wId, lId, "leave", room.mode, room.startedAt, room.stake || 0).catch(() => {});
          // Phase 7: push balance update to winner after wagered leave-forfeit
          if (room.stake > 0 && wId) {
            getWalletBalance(wId).then((bal) => {
              emitToClient(room, winnerId, "balanceUpdate", { balance: bal });
            }).catch(() => {});
          }
        }
      }
      // Phase 7: refund wagered pre-start leave (game not started yet)
      if (!room.started && room.stake > 0) {
        // Refund the leaving player
        const leavingUserId = room.players[clientId]?.userId;
        const leavingWagerId = room.players[clientId]?.wagerId;
        if (leavingUserId) {
          creditWallet(leavingUserId, room.stake, "wager_refund", leavingWagerId || "leave_" + code).catch(() => {});
        }
        // Refund the remaining player too (room will be torn down or they'll be alone)
        const oppId = opponentOf(room, clientId);
        if (oppId) {
          const oppUserId = room.players[oppId]?.userId;
          const oppWagerId = room.players[oppId]?.wagerId;
          if (oppUserId) {
            creditWallet(oppUserId, room.stake, "wager_refund", oppWagerId || "leave_opp_" + code).catch(() => {});
            emitToClient(room, oppId, "balanceUpdate", { balance: -1 }); // client will re-fetch
            getWalletBalance(oppUserId).then((bal) => {
              emitToClient(room, oppId, "balanceUpdate", { balance: bal });
            }).catch(() => {});
          }
        }
      }
      const p = room.players[clientId];
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      room.order = room.order.filter((id) => id !== clientId);
      delete room.players[clientId];
      socket.leave(code);
      clearTurnTimer(room);
      if (room.order.length === 0) {
        delete rooms[code];
      } else {
        io.to(code).emit("opponentLeft");
        room.started = false;
        // Reset turn state so a stale turn pointer / in-flight resolve flag does
        // not wedge a later rematch with BAD_STATE (matches endGameForfeit/rematch) (WR-06).
        room.turn = null;
        room.resolving = false;
        io.to(code).emit("roomUpdate", roomPublic(room));
      }
    }
    socket.data.code = null;
    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    // QUEUE-03: queue cleanup with wager refund runs FIRST — must happen before
    // any room handling so a phantom slot never lingers (T-5-10, RESEARCH Pitfall 2).
    // Phase 7: refund wagered entries on disconnect.
    const queueKey = socket.data.queueKey || queueKeyFor(socket);
    for (const type of ["free", "wagered"]) {
      const e = queues[type].get(queueKey);
      if (e && e.socketId === socket.id) {
        queues[type].delete(queueKey);
        // Phase 7: refund wager if disconnecting from wagered queue
        if (e.stake && e.userId) {
          creditWallet(e.userId, e.stake, "wager_refund", e.wagerId).catch(() => {});
        }
      }
    }

    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !clientId || !room.players[clientId]) return;
    const p = room.players[clientId];
    if (p.sid !== socket.id) return; // stale socket, newer one already took over

    // D-11: if the room was queue-matched but NOT yet started, re-enqueue the
    // surviving partner at the FRONT of the original queue type so search resumes
    // immediately, then tear down the dead room — no grace window for un-started rooms.
    if (!room.started && room.matchQueueType) {
      const oppId = opponentOf(room, clientId);
      const oppPlayer = oppId && room.players[oppId];
      if (oppPlayer && oppPlayer.online) {
        const qt = room.matchQueueType;
        const survivorEntry = {
          socketId: oppPlayer.sid,
          clientId: oppId,
          userId: oppPlayer.userId ?? null,
          stake: room.stake || 0, // Phase 7: preserve stake from room (originally from queue entry)
          wagerId: oppPlayer.wagerId ?? null, // Phase 7: preserve wagerId for refund tracking
          enqueuedAt: Date.now(), // fresh window — they are first in line
          pairing: false,
          profile: oppPlayer.profile || null,
          queueType: qt,
        };
        // WR-02/WR-03: re-queue under the server-trusted key so disconnect
        // cleanup (which also keys on queueKey) stays consistent.
        const survivorKey = oppPlayer.userId != null ? `u:${oppPlayer.userId}` : `s:${oppPlayer.sid}`;
        survivorEntry.queueKey = survivorKey;
        // Insert survivor at FRONT via full Map replacement (Pitfall 5)
        queues[qt] = new Map([[survivorKey, survivorEntry], ...queues[qt]]);
        console.log(`[queue] D-11: partner disconnected before start, re-queued survivor ${oppId} at front of ${qt}`);
        // Phase 7: refund disconnecting player's wager (match never started)
        const dcUserId = room.players[clientId]?.userId;
        if (room.stake > 0 && dcUserId) {
          creditWallet(dcUserId, room.stake, "wager_refund", "prestart_dc_" + code).catch(() => {});
        }
        // Tear down the dead room before emitting so it cannot be re-paired
        clearTurnTimer(room);
        delete rooms[code];
        // Restore socket.data on survivor's socket so it can re-enter the queue
        const survivorSock = io.of("/").sockets.get(oppPlayer.sid);
        if (survivorSock) {
          survivorSock.leave(code);
          survivorSock.data.code = null;
          survivorSock.data.queueType = qt;
          survivorSock.data.queueKey = survivorKey;
          survivorSock.data.queueClientId = oppId;
          survivorSock.data.queueStake = room.stake || 0;       // Phase 7: preserve wager tracking
          survivorSock.data.queueWagerId = oppPlayer.wagerId ?? null; // Phase 7
        }
        // Notify survivor to return to queue wait screen (D-11 — dedicated event)
        io.to(oppPlayer.sid).emit("requeued", { type: qt });
        return; // room already deleted — skip standard disconnect handling
      }
    }

    p.online = false;
    const oppId = opponentOf(room, clientId);
    if (oppId) emitToClient(room, oppId, "opponentOffline");
    io.to(code).emit("roomUpdate", roomPublic(room));
    // free the seat only after grace period if not reconnected
    scheduleSeatRelease(room, code, clientId, GRACE_MS);
  });
});

// Boot: run DB migrations (fail-loud), then connect optional store, then listen.
// Guarded by require.main === module so importing server.js in tests does not
// boot the server / bind PORT / run migrations as an import side effect (WR-01).
if (require.main === module) {
  // SESSION_SECRET is required for cookie-backed sessions. Fail-loud here
  // (not at module load) so tests can import server.js without triggering exit (WR-01).
  if (!process.env.SESSION_SECRET) {
    console.error("[auth] SESSION_SECRET env var is required — exiting");
    process.exit(1);
  }
  (async () => {
    // Migrations must succeed before listen() (DATA-02). Wrap in try/catch so a
    // DB failure exits cleanly with a logged, actionable message instead of an
    // opaque unhandled rejection (WR-04).
    try {
      await runMigrations(pool);
    } catch (e) {
      console.error("[db] migration failed on boot, exiting:", e.message);
      process.exit(1);
    }
    await store.init();
    if (store.isEnabled()) {
      try {
        const n = restoreRooms(await store.loadSnapshot());
        if (n) console.log(`[store] restored ${n} room(s) from snapshot`);
      } catch (e) {
        console.error("[store] restore failed:", e.message);
      }
      // Periodic snapshot. unref() so it never keeps the process alive on its own.
      setInterval(() => { store.saveSnapshot(serializeRooms()); }, SNAPSHOT_MS).unref();
    }
    // Room cleanup sweep: evict empty and idle rooms every 60s so memory is bounded
    // by active games, not by all rooms ever created (SEC-03, ROOM_IDLE_THRESHOLD_MS).
    setInterval(sweepRooms, CLEANUP_INTERVAL_MS).unref();
    // Queue pairing sweep: re-run tryPairAll every QUEUE_SWEEP_MS so entries that
    // missed a pair on enqueue (e.g. single waiter) get matched when a second joins.
    setInterval(tryPairAll, QUEUE_SWEEP_MS).unref();
    server.listen(PORT, () => {
      console.log(`Battleship server running at http://localhost:${PORT}`);
    });
  })();
}

// Capture the latest state on redeploy (Render/Fly send SIGTERM) before exit.
async function gracefulExit() {
  try { if (store.isEnabled()) await store.saveSnapshot(serializeRooms()); } catch (e) {}
  process.exit(0);
}
process.on("SIGTERM", gracefulExit);
process.on("SIGINT", gracefulExit);

// TEST_EXPORTS: expose internal functions for unit tests only.
// Not used by the production code path. Exported via CommonJS so server.js
// stays a CJS module — using `export` here forces Node to reparse the file as
// an ES module, after which the top-level require() calls throw (CR-01).
module.exports = {
  TEST_EXPORTS: {
    doShot,
    rooms,
    sweepRooms,
    escapeHtml,
    sanitizeProfile,
    sanitizeChat,
    cspMiddleware,
    CSP_HEADER_VALUE,
    app,  // exported for AUTH-06 route-level behavioral tests (Plan 07)
    serializeRooms,
    restoreRooms,
    // Phase 5 queue exports (05-01)
    queues,
    tryPair,
    removeFromQueues,
    createMatchedRoom,
    queueKeyFor,
    VALID_STAKES, // Phase 7
    POWERUP_FIXED_FLOOR, POWERUP_STAKE_PCT, POWERUP_CAP_PER_MATCH, // Phase 7: purchase economy
    // CR-01/WR-05 test helpers: override the socket-liveness predicate so unit
    // tests can simulate live/dead sockets without a running Socket.IO server.
    setSocketIsLive: (fn) => { socketIsLive = fn; },
    resetSocketIsLive: () => { socketIsLive = (socketId) => !!io.of("/").sockets.get(socketId); },
  },
};
