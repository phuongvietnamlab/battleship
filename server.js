// Battleship Online - server
// Node.js + Express + Socket.IO. Room-code based matchmaking.
// clientId-based identity with reconnect grace so iPhone/Safari backgrounding
// does not drop a player out of the room.

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const store = require("./store"); // optional Redis snapshot; no-op without REDIS_URL
const { pool, runMigrations, upsertGuestCredential, linkOrPromoteAccount, createEmailAccount, verifyEmailLogin, createAuthToken, consumeAuthToken, markEmailVerified, setEmailPassword, recordMatch } = require("./db"); // Postgres: identity persistence
const mailer = require("./mailer"); // optional email wrapper (graceful-degrade when RESEND_API_KEY unset)

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

// ─── Auth rate limiter ───────────────────────────────────────────────────────
// Extends existing RateLimiterMemory pattern (lines above) to OAuth endpoints.
// 10 auth attempts/min per IP — protects against auth-route brute-force (T-02-09).
const authLimiter = new RateLimiterMemory({ points: 10, duration: 60 });
function authRateLimit(req, res, next) {
  authLimiter.consume(req.ip).then(next).catch(() => res.status(429).json({ code: "RATE_LIMITED" }));
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
          // Send signup response immediately — verification email is fire-and-forget (D-19).
          res.json({
            ok: true,
            user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url },
          });
          // Non-blocking: fire verification email AFTER the response is flushed.
          // setImmediate defers to the next event loop turn so the response is
          // never delayed by token creation or send (T-02-41 / D-19).
          setImmediate(() => {
            createAuthToken(user.id, "verify", 86400)
              .then((token) => {
                const baseUrl = process.env.APP_BASE_URL || "";
                const verifyUrl = baseUrl + "/auth/verify?token=" + token;
                return mailer.sendVerificationEmail(signupEmail, verifyUrl);
              })
              .catch((e) => {
                // Non-fatal: token creation or send failure must never surface to the user.
                // Email is best-effort (D-19 / T-02-41).
                console.error("[mailer] verification email post-signup failed:", e.message);
              });
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

// GET /auth/verify — single-use email verification link (AUTH-07 / Plan 08).
//
// The token was created by createAuthToken(userId, 'verify', 86400) after signup
// and emailed to the user. consumeAuthToken enforces:
//   - Single-use (conditional UPDATE WHERE consumed_at IS NULL — T-02-39)
//   - Expiry (24h, WHERE expires_at > now() — T-02-39)
//   - Purpose binding (WHERE purpose='verify' — T-02-43)
//
// On success  : flips users.email_verified=true then redirects to /?verified=1.
// On any error: logs + redirects to /?verifyError=1 — never exposes token details.
// play/login: NEVER gated on email_verified (D-19). This is an additive step.
app.get("/auth/verify", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.redirect("/?verifyError=1");
  try {
    const r = await consumeAuthToken(token, "verify");
    if (r.error) return res.redirect("/?verifyError=1");
    await markEmailVerified(r.userId);
    return res.redirect("/?verified=1");
  } catch (e) {
    console.error("[auth] verify failed:", e.message);
    return res.redirect("/?verifyError=1");
  }
});

// POST /auth/reset-request — enumeration-safe password-reset link request (AUTH-08 / D-19).
//
// Security posture (T-02-44 enumeration safety):
//   ALWAYS returns the SAME generic {ok:true} response regardless of whether the
//   email exists. The email is emailed only when the credential is found, and the
//   send is non-blocking + best-effort so timing/shape never leaks account existence.
//
// T-02-48: authRateLimit (10/min per IP) on this route.
// T-02-49: no SQL is built by this route — all DB access via parameterized helpers.
// D-19: reset token created with createAuthToken(userId,'reset',3600) — 1h TTL.
// Non-blocking: token creation + sendMail fired after try/catch resolves ok:true.
app.post("/auth/reset-request", authRateLimit, async (req, res) => {
  // Return generic response FIRST so the server can never reveal account existence
  // via an early-return timing difference. We start the work in a setImmediate so
  // the response is always flush-and-forget from the handler's perspective.
  // Wrap everything in try/catch; even errors return the same ok:true shape.
  try {
    const { email } = req.body || {};
    const normalizedEmail = (typeof email === "string" ? email : "").trim().toLowerCase();

    // Fire the reset email asynchronously (best-effort) AFTER flushing the response.
    // This ensures identical response timing whether or not the credential exists (T-02-44).
    res.json({ ok: true });

    setImmediate(async () => {
      try {
        // Look up the email credential to find user_id (D-20: email cred only)
        const { rows } = await pool.query(
          "SELECT user_id FROM credentials WHERE type='email' AND external_id=$1",
          [normalizedEmail]
        );
        if (rows.length === 0) {
          // Email not registered — do nothing (T-02-44 enumeration-safe; no log of absence)
          return;
        }
        const userId = rows[0].user_id;
        // Create a single-use 1h reset token (Plan 06 primitive — T-02-45)
        const token = await createAuthToken(userId, "reset", 3600);
        const baseUrl = process.env.APP_BASE_URL || "";
        const resetUrl = baseUrl + "/?reset=" + token;
        // Send the reset email (Plan 08 mailer — gracefully degrades when unconfigured)
        await mailer.sendMail({
          to: normalizedEmail,
          subject: "Reset your Battleship Online password",
          html: `
            <p>We received a request to reset your password.</p>
            <p>Click the link below to choose a new password. The link is valid for 1 hour.</p>
            <p><a href="${resetUrl}">Reset my password</a></p>
            <p style="color:#888;font-size:12px;">If you did not request a password reset, you can safely ignore this email.</p>
          `.trim(),
          text: [
            "We received a request to reset your password.",
            "",
            "Click the link below to choose a new password. The link is valid for 1 hour.",
            "",
            resetUrl,
            "",
            "If you did not request a password reset, you can safely ignore this email.",
          ].join("\n"),
        });
      } catch (e) {
        // Non-fatal: token creation or send failure must never surface to the user.
        // Email is best-effort (D-19 / T-02-41).
        console.error("[auth] reset email post-request failed:", e.message);
      }
    });
  } catch (e) {
    // Even internal errors return the same enumeration-safe response (T-02-44)
    console.error("[auth] reset-request failed:", e.message);
    // Response already sent above; do not send again
  }
});

// POST /auth/reset — consume a single-use reset token and set a new bcrypt password.
//
// Ordering note: consumeAuthToken is called BEFORE setEmailPassword. This means
// the token is single-use even if the new password is weak (WEAK_PASSWORD). The
// user must request a fresh reset link in that case. This ordering prevents
// token replay attacks where an attacker tries many passwords on the same token.
//
// T-02-45: token is single-use + 1h expiry via consumeAuthToken('reset') (Plan 06).
// T-02-46: WEAK_PASSWORD enforced by setEmailPassword (min 8 chars).
// T-02-47: on success, DELETE FROM session WHERE user_id invalidates leaked old sessions.
// T-02-48: authRateLimit (10/min per IP) on this route.
// T-02-49: all DB access via parameterized helpers — no SQL built by this route.
app.post("/auth/reset", authRateLimit, async (req, res) => {
  try {
    const { token, password } = req.body || {};

    // Consume the reset token (single-use + expiry + purpose binding — T-02-45)
    const r = await consumeAuthToken(token, "reset");
    if (r.error) {
      return res.status(400).json({ ok: false, code: "BAD_TOKEN" });
    }

    // Set the new password (min-8 enforced, bcrypt cost 10 — T-02-46)
    // Consume happens BEFORE setEmailPassword so the token is single-use even on WEAK_PASSWORD.
    const set = await setEmailPassword(r.userId, password);
    if (set.error === "WEAK_PASSWORD") {
      return res.status(400).json({ ok: false, code: "WEAK_PASSWORD" });
    }
    if (set.error) {
      return res.status(400).json({ ok: false, code: "AUTH_FAILED" });
    }

    // Invalidate all existing sessions for this user (T-02-47 / Plan 03 pattern).
    // A leaked old session cannot persist after a successful password reset.
    try {
      await pool.query("DELETE FROM session WHERE user_id = $1", [r.userId]);
    } catch (e) {
      // Non-fatal: session invalidation failure logs but does not block the response.
      console.error("[auth] session invalidation after reset failed:", e.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth] reset failed:", e.message);
    return res.status(500).json({ ok: false });
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

// HTML-escape a string to prevent stored-XSS when names are rendered in future
// leaderboards or profiles (SEC-04).
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
  // stored names cannot inject markup on future profiles/leaderboards (SEC-04).
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
          ranked: r2.ranked,
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
      recordMatch(disconnectRecord.wId, disconnectRecord.lId, "disconnect", disconnectRecord.mode, disconnectRecord.startedAt, disconnectRecord.ranked).catch(() => {});
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
      powerups: r.powerups || {},
      mines,
      players,
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
      powerups: s.powerups || {},
      mines,
      turnTimer: null,
      turnDeadline: null,
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
    recordMatch(wId, lId, reason, room.mode, room.startedAt, room.ranked).catch(() => {});
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
      recordMatch(wId, lId, "normal", room.mode, room.startedAt, room.ranked).catch(() => {});
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

io.on("connection", (socket) => {
  socket.data.code = null;
  socket.data.clientId = null;

  // D-11: read userId from the shared session (io.engine.use(sessionMiddleware) wired above).
  // socket.request.session is populated because Socket.IO runs the same session middleware.
  // null = guest; integer = authenticated account.
  const userId = socket.request.session?.passport?.user ?? null;
  socket.data.userId = userId;
  console.log("[auth] socket connected, clientId:", socket.data.clientId, "userId:", userId);

  socket.on("createRoom", (arg, cb) => {
    if (typeof arg === "function") { cb = arg; arg = {}; }
    const clientId = (arg && arg.clientId) || socket.id;
    const code = newCode();
    const mode = (arg && arg.mode) === "advance" ? "advance" : "classic";
    const ranked = !!(arg && arg.ranked === true);
    // D-05: ranked requires classic mode — advance mode and ranked are incompatible
    if (ranked && mode === "advance") return cb && cb({ ok: false, code: "RANKED_REQUIRES_CLASSIC" });
    // D-02/D-03: ranked requires an authenticated account — read userId from session, never from arg (T-04-04)
    if (ranked && socket.data.userId == null) return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });
    // room.recorded is the D-06 dedup flag set synchronously at end paths (Task 2 — endGameForfeit/doShot/scheduleSeatRelease/leaveRoom)
    rooms[code] = { code, players: {}, order: [], started: false, turn: null, scores: {}, lastStarter: null, mode, ranked, powerups: {}, turnTimer: null, turnDeadline: null, resolving: false, lastActivityAt: Date.now() };
    rooms[code].players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
      userId: socket.data.userId ?? null,
    };
    rooms[code].order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
    upsertGuestCredential(clientId); // fire-and-forget: durable identity (DATA-01)
  });

  socket.on("joinRoom", (arg, cb) => {
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
    // D-02/D-03: a guest cannot take the second seat in a ranked room (RANK-02)
    if (room.ranked && socket.data.userId == null) return cb && cb({ ok: false, code: "RANKED_REQUIRES_ACCOUNT" });
    room.players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
      userId: socket.data.userId ?? null,
    };
    room.order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code });
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
          touchRoom(rooms[code]); // SEC-03: stamp activity on resume so sweep doesn't evict
          reclaimSeat(rooms[code], code, clientId, clientId, socket);
          upsertGuestCredential(clientId); // fire-and-forget: ensure durable credential on resume (DATA-01)
          // Stamp userId onto seat if the player signed in between sessions; never overwrite existing id with null
          if (socket.data.userId && rooms[code] && rooms[code].players[clientId]) {
            rooms[code].players[clientId].userId = socket.data.userId;
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
    touchRoom(room); // SEC-03: stamp activity on rejoin so sweep doesn't evict live room
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
      for (const id of ids) { room.players[id].inv = newInv(); room.players[id].bonus = 0; room.players[id].skipNext = false; room.players[id].timeouts = 0; }
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
    room.powerups = {}; room.mines = {};
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
          recordMatch(wId, lId, "leave", room.mode, room.startedAt, room.ranked).catch(() => {});
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
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !clientId || !room.players[clientId]) return;
    const p = room.players[clientId];
    if (p.sid !== socket.id) return; // stale socket, newer one already took over
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
  },
};
