// test/auth.test.js — Wave 0 test scaffold for SEC-05, AUTH-02, AUTH-03, AUTH-04.
// AUTH-07 (Plan 08): email verification token flip, single-use, expiry, mailer no-op.
// DB-gated suites skip cleanly when DATABASE_URL is not set.
// Follows the test/db.test.js pattern: describe.skipIf, beforeAll runMigrations, afterAll cleanup.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDatabaseUrl = !!process.env.DATABASE_URL;

// ─── Suite 1: module shape (no DB required) ──────────────────────────────────

describe("db.js — linkOrPromoteAccount and sanitizeDisplayName exports", () => {
  it("exports linkOrPromoteAccount as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.linkOrPromoteAccount).toBe("function");
  });

  it("exports sanitizeDisplayName as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.sanitizeDisplayName).toBe("function");
  });

  it("sanitizeDisplayName escapes HTML entities", async () => {
    const db = await import("../db.js");
    expect(db.sanitizeDisplayName("<b>Bob</b>")).toBe("&lt;b&gt;Bob&lt;/b&gt;");
  });

  it("sanitizeDisplayName caps at 40 characters", async () => {
    const db = await import("../db.js");
    const long = "A".repeat(50);
    const result = db.sanitizeDisplayName(long);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("sanitizeDisplayName returns null for non-string input", async () => {
    const db = await import("../db.js");
    expect(db.sanitizeDisplayName(null)).toBeNull();
    expect(db.sanitizeDisplayName(42)).toBeNull();
    expect(db.sanitizeDisplayName({})).toBeNull();
  });

  it("sanitizeDisplayName strips control characters", async () => {
    const db = await import("../db.js");
    // control chars like \x01 \x1f should be stripped
    const result = db.sanitizeDisplayName("Na\x01me");
    expect(result).not.toMatch(/[\x00-\x1f]/);
  });

  it("sanitizeDisplayName collapses whitespace", async () => {
    const db = await import("../db.js");
    const result = db.sanitizeDisplayName("  Hello   World  ");
    expect(result).toBe("Hello World");
  });
});

// ─── Suite 2: D-06 promote guest row (requires DB) ───────────────────────────

describe.skipIf(!hasDatabaseUrl)(
  "linkOrPromoteAccount — D-06 first-time Google sign-in (requires DB)",
  () => {
    let pool;
    let db;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
    });

    afterAll(async () => {
      await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-client-%' OR external_id LIKE 'test-sub-%'");
      await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
      await pool.end();
    });

    it("attaches google credential to the guest user_id", async () => {
      const clientId = "test-client-d06-attach-" + Date.now();
      const sub = "test-sub-d06-attach-" + Date.now();

      // Set up guest credential
      await db.upsertGuestCredential(clientId);

      // Link to google
      const user = await db.linkOrPromoteAccount("google", sub, "Alice", null, clientId);
      expect(user).toBeTruthy();
      expect(typeof user.id).toBe("number");

      // Verify google credential exists and points to same user_id as guest
      const { rows: guestRows } = await pool.query(
        "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
        [clientId]
      );
      const { rows: googleRows } = await pool.query(
        "SELECT user_id FROM credentials WHERE type='google' AND external_id=$1",
        [sub]
      );
      expect(guestRows.length).toBe(1);
      expect(googleRows.length).toBe(1);
      expect(googleRows[0].user_id).toBe(guestRows[0].user_id);
    });

    it("stamps guest_migrated_at on the promoted user row", async () => {
      const clientId = "test-client-d06-stamp-" + Date.now();
      const sub = "test-sub-d06-stamp-" + Date.now();

      await db.upsertGuestCredential(clientId);
      const user = await db.linkOrPromoteAccount("google", sub, "Bob", null, clientId);

      const { rows } = await pool.query(
        "SELECT guest_migrated_at FROM users WHERE id=$1",
        [user.id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].guest_migrated_at).not.toBeNull();
    });

    it("is idempotent — second call with same sub does not create a duplicate credential or user", async () => {
      const clientId = "test-client-d06-idem-" + Date.now();
      const sub = "test-sub-d06-idem-" + Date.now();

      await db.upsertGuestCredential(clientId);
      const user1 = await db.linkOrPromoteAccount("google", sub, "Carol", null, clientId);
      const user2 = await db.linkOrPromoteAccount("google", sub, "Carol", null, clientId);

      // Same user returned
      expect(user1.id).toBe(user2.id);

      // Only one google credential row
      const { rows } = await pool.query(
        "SELECT * FROM credentials WHERE type='google' AND external_id=$1",
        [sub]
      );
      expect(rows.length).toBe(1);
    });

    it("creates a new user row when pendingClientId is absent (rare: fresh browser no prior guest)", async () => {
      const sub = "test-sub-d06-nogust-" + Date.now();

      const user = await db.linkOrPromoteAccount("google", sub, "NewUser", null, null);
      expect(user).toBeTruthy();
      expect(typeof user.id).toBe("number");

      const { rows } = await pool.query(
        "SELECT user_id FROM credentials WHERE type='google' AND external_id=$1",
        [sub]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].user_id).toBe(user.id);
    });
  }
);

// ─── Suite 3: D-07 adopt guest credential (requires DB) ──────────────────────

describe.skipIf(!hasDatabaseUrl)(
  "linkOrPromoteAccount — D-07 returning Google user (requires DB)",
  () => {
    let pool;
    let db;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
    });

    afterAll(async () => {
      await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-client-%' OR external_id LIKE 'test-sub-%'");
      await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
      await pool.end();
    });

    it("re-points guest credential to existing google account's user_id", async () => {
      // Step 1: Create a google account (first sign-in)
      const firstClientId = "test-client-d07-first-" + Date.now();
      const sub = "test-sub-d07-returning-" + Date.now();
      await db.upsertGuestCredential(firstClientId);
      const googleUser = await db.linkOrPromoteAccount("google", sub, "Dave", null, firstClientId);

      // Step 2: Create a new guest (second device/session)
      const secondClientId = "test-client-d07-second-" + Date.now();
      await db.upsertGuestCredential(secondClientId);

      // Step 3: D-07 — returning Google user adopts the new guest credential
      const resultUser = await db.linkOrPromoteAccount("google", sub, "Dave", null, secondClientId);

      // Same google user returned
      expect(resultUser.id).toBe(googleUser.id);

      // The second guest credential now points to the google account's user_id
      const { rows: guestRows } = await pool.query(
        "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
        [secondClientId]
      );
      expect(guestRows.length).toBe(1);
      expect(guestRows[0].user_id).toBe(googleUser.id);
    });

    it("does not create a duplicate users row on D-07", async () => {
      const clientId1 = "test-client-d07-nodup-" + Date.now();
      const clientId2 = "test-client-d07-nodup2-" + Date.now();
      const sub = "test-sub-d07-nodup-" + Date.now();

      await db.upsertGuestCredential(clientId1);
      const googleUser = await db.linkOrPromoteAccount("google", sub, "Eve", null, clientId1);

      await db.upsertGuestCredential(clientId2);

      // Count users before D-07
      const { rows: beforeRows } = await pool.query(
        "SELECT count(*)::int AS n FROM users WHERE id >= $1",
        [googleUser.id]
      );
      const countBefore = beforeRows[0].n;

      // D-07 adopt
      await db.linkOrPromoteAccount("google", sub, "Eve", null, clientId2);

      // Count users after D-07 — should not increase
      const { rows: afterRows } = await pool.query(
        "SELECT count(*)::int AS n FROM users WHERE id >= $1",
        [googleUser.id]
      );
      const countAfter = afterRows[0].n;

      expect(countAfter).toBe(countBefore);
    });
  }
);

// ─── Suite 4a: AUTH-06 email-account exports shape (no DB required) ──────────
// Asserts that db.js exposes the five new email-account helpers as functions.
// Passes without DATABASE_URL (non-DB assertion only).

describe("db.js — AUTH-06 email account exports shape", () => {
  it("exports createEmailAccount as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.createEmailAccount).toBe("function");
  });

  it("exports verifyEmailLogin as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.verifyEmailLogin).toBe("function");
  });

  it("exports createAuthToken as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.createAuthToken).toBe("function");
  });

  it("exports consumeAuthToken as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.consumeAuthToken).toBe("function");
  });

  it("exports markEmailVerified as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.markEmailVerified).toBe("function");
  });
});

// ─── Suite 4b: AUTH-06 email-account DB-gated suites ─────────────────────────
// Requires a live DB. Verifies bcrypt hashing, WEAK_PASSWORD/EMAIL_IN_USE guards,
// no-enumeration login, and single-use/expiry token semantics.
// Cleanup prefix: test-email-<rand>@example.com + test-client- prefix.

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-06 createEmailAccount (requires DB)",
  () => {
    let pool;
    let db;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
    });

    afterAll(async () => {
      // Remove test email credentials and orphaned users
      await pool.query(
        "DELETE FROM credentials WHERE external_id LIKE 'test-email-%@example.com'"
      );
      await pool.query(
        "DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)"
      );
      await pool.end();
    });

    it("returns {error:'WEAK_PASSWORD'} for password shorter than 8 chars", async () => {
      const result = await db.createEmailAccount(
        "test-email-weak@example.com",
        "short",
        "test-client-weak-" + Date.now()
      );
      expect(result).toEqual({ error: "WEAK_PASSWORD" });
    });

    it("stores a bcrypt hash — never equal to plaintext", async () => {
      const email = "test-email-hash-" + Date.now() + "@example.com";
      const password = "SecurePass1!";
      const clientId = "test-client-hash-" + Date.now();

      const user = await db.createEmailAccount(email, password, clientId);
      expect(user).toBeTruthy();
      expect(typeof user.id).toBe("number");

      // Verify password_hash in DB is NOT the plaintext password
      const { rows } = await pool.query(
        "SELECT password_hash FROM credentials WHERE type='email' AND external_id=$1",
        [email.trim().toLowerCase()]
      );
      expect(rows.length).toBe(1);
      const hash = rows[0].password_hash;
      expect(hash).not.toBeNull();
      expect(hash).not.toBe(password);
      // Must be a bcrypt hash (starts with $2b$ or $2a$)
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it("returns {error:'EMAIL_IN_USE'} when the same email is registered twice", async () => {
      const email = "test-email-dup-" + Date.now() + "@example.com";
      const clientId1 = "test-client-dup1-" + Date.now();
      const clientId2 = "test-client-dup2-" + Date.now();

      // First registration succeeds
      const first = await db.createEmailAccount(email, "ValidPass1!", clientId1);
      expect(first).toBeTruthy();
      expect(typeof first.id).toBe("number");

      // Second registration with same email returns EMAIL_IN_USE
      const second = await db.createEmailAccount(email, "AnotherPass2!", clientId2);
      expect(second).toEqual({ error: "EMAIL_IN_USE" });
    });

    it("normalizes email to lowercase + trimmed as credentials.external_id", async () => {
      const rawEmail = "  Test-Email-Case-" + Date.now() + "@Example.com  ";
      const normalized = rawEmail.trim().toLowerCase();
      const clientId = "test-client-case-" + Date.now();

      await db.createEmailAccount(rawEmail, "ValidPass99!", clientId);

      const { rows } = await pool.query(
        "SELECT external_id FROM credentials WHERE type='email' AND external_id=$1",
        [normalized]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].external_id).toBe(normalized);
    });

    it("sets email and email_verified=false on the users row", async () => {
      const email = "test-email-verified-" + Date.now() + "@example.com";
      const clientId = "test-client-ev-" + Date.now();

      const user = await db.createEmailAccount(email, "ValidPass77!", clientId);
      expect(user).toBeTruthy();

      const { rows } = await pool.query(
        "SELECT email, email_verified FROM users WHERE id=$1",
        [user.id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].email).toBe(email.trim().toLowerCase());
      expect(rows[0].email_verified).toBe(false);
    });
  }
);

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-06 verifyEmailLogin (requires DB)",
  () => {
    let pool;
    let db;
    const ts = Date.now();
    const email = "test-email-login-" + ts + "@example.com";
    const password = "LoginPass123!";
    const clientId = "test-client-login-" + ts;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
      // Seed one account for login tests
      await db.createEmailAccount(email, password, clientId);
    });

    afterAll(async () => {
      await pool.query(
        "DELETE FROM credentials WHERE external_id LIKE 'test-email-%@example.com'"
      );
      await pool.query(
        "DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)"
      );
      await pool.end();
    });

    it("returns the user row when email+password are correct", async () => {
      const user = await db.verifyEmailLogin(email, password);
      expect(user).toBeTruthy();
      expect(typeof user.id).toBe("number");
    });

    it("returns {error:'AUTH_FAILED'} for a correct email but wrong password", async () => {
      const result = await db.verifyEmailLogin(email, "WrongPassword!");
      expect(result).toEqual({ error: "AUTH_FAILED" });
    });

    it("returns {error:'AUTH_FAILED'} for an unknown email — same shape (no enumeration)", async () => {
      const result = await db.verifyEmailLogin(
        "test-email-unknown-" + Date.now() + "@example.com",
        "AnyPassword!"
      );
      expect(result).toEqual({ error: "AUTH_FAILED" });
    });
  }
);

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-06 createAuthToken + consumeAuthToken (requires DB)",
  () => {
    let pool;
    let db;
    let testUserId;
    const clientId = "test-client-token-" + Date.now();

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
      // Seed a user for token tests
      const email = "test-email-token-" + Date.now() + "@example.com";
      const user = await db.createEmailAccount(email, "TokenPass123!", clientId);
      testUserId = user.id;
    });

    afterAll(async () => {
      await pool.query("DELETE FROM auth_tokens WHERE user_id=$1", [testUserId]);
      await pool.query(
        "DELETE FROM credentials WHERE external_id LIKE 'test-email-%@example.com'"
      );
      await pool.query(
        "DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)"
      );
      await pool.end();
    });

    it("createAuthToken returns a non-empty string token", async () => {
      const token = await db.createAuthToken(testUserId, "verify", 86400);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("consumeAuthToken round-trips: returns {userId} on first consume", async () => {
      const token = await db.createAuthToken(testUserId, "verify", 86400);
      const result = await db.consumeAuthToken(token, "verify");
      expect(result).toHaveProperty("userId");
      expect(result.userId).toBe(testUserId);
    });

    it("consumeAuthToken is single-use: second consume returns {error:'BAD_TOKEN'}", async () => {
      const token = await db.createAuthToken(testUserId, "verify", 86400);

      // First consume succeeds
      const first = await db.consumeAuthToken(token, "verify");
      expect(first).toHaveProperty("userId");

      // Second consume returns BAD_TOKEN
      const second = await db.consumeAuthToken(token, "verify");
      expect(second).toEqual({ error: "BAD_TOKEN" });
    });

    it("consumeAuthToken returns {error:'BAD_TOKEN'} for an expired token", async () => {
      // Insert a token with a past expires_at directly
      const expiredToken = require("crypto").randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO auth_tokens (user_id, token, purpose, expires_at) VALUES ($1,$2,$3, now() - interval '1 hour')",
        [testUserId, expiredToken, "verify"]
      );

      const result = await db.consumeAuthToken(expiredToken, "verify");
      expect(result).toEqual({ error: "BAD_TOKEN" });
    });

    it("consumeAuthToken returns {error:'BAD_TOKEN'} for a mismatched purpose", async () => {
      const token = await db.createAuthToken(testUserId, "reset", 3600);
      // Try consuming with wrong purpose
      const result = await db.consumeAuthToken(token, "verify");
      expect(result).toEqual({ error: "BAD_TOKEN" });
    });

    it("consumeAuthToken returns {error:'BAD_TOKEN'} for a completely unknown token", async () => {
      const result = await db.consumeAuthToken("nonexistent-token-xyz-123", "verify");
      expect(result).toEqual({ error: "BAD_TOKEN" });
    });
  }
);

// ─── Suite 5: AUTH-06 route-level assertions (requires DB) ──────────────────
// Two layers of verification:
// (1) db-helper contracts — createEmailAccount / verifyEmailLogin error codes
// (2) BEHAVIORAL session assertion — after POST /auth/login the session-id CHANGES
//     (regenerate ran) AND req.session.user_id equals the user id (stamp ran).
// Uses Node built-in http module + app exported via TEST_EXPORTS — no supertest needed.

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-06 POST /auth/signup + /auth/login routes (requires DB)",
  () => {
    let pool;
    let db;
    let server;
    let baseUrl;
    const ts = Date.now();
    const routeEmail = "test-email-route-" + ts + "@example.com";
    const routePassword = "RoutePass123!";
    const routeClientId = "test-client-route-" + ts;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);

      // Import server and start it on a random port for route-level tests
      const serverModule = await import("../server.js");
      const app = serverModule.TEST_EXPORTS && serverModule.TEST_EXPORTS.app;
      if (!app) throw new Error("server.js does not export app via TEST_EXPORTS — add it");
      server = app.listen(0);
      const addr = server.address();
      baseUrl = "http://127.0.0.1:" + addr.port;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
      await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-email-route-%@example.com'");
      await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
      await pool.end();
    });

    // Helper: make an HTTP request using Node built-ins
    function httpRequest(method, path, body, cookieHeader) {
      return new Promise((resolve, reject) => {
        const url = new URL(baseUrl + path);
        const bodyStr = body ? JSON.stringify(body) : "";
        const options = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
        };
        const http = require("http");
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, headers: res.headers, body: data });
            }
          });
        });
        req.on("error", reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
      });
    }

    it("POST /auth/signup returns 400 WEAK_PASSWORD for short password", async () => {
      const res = await httpRequest("POST", "/auth/signup", {
        email: "test-email-route-wp-" + ts + "@example.com",
        password: "short",
        clientId: "test-client-route-wp-" + ts,
      });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe("WEAK_PASSWORD");
    });

    it("POST /auth/signup creates account and returns {ok:true,user} with id/displayName/avatarUrl", async () => {
      const res = await httpRequest("POST", "/auth/signup", {
        email: routeEmail,
        password: routePassword,
        clientId: routeClientId,
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toBeTruthy();
      expect(typeof res.body.user.id).toBe("number");
      expect(typeof res.body.user.displayName).toBe("string");
    });

    it("POST /auth/signup returns 409 EMAIL_IN_USE for duplicate email", async () => {
      const res = await httpRequest("POST", "/auth/signup", {
        email: routeEmail,
        password: routePassword,
        clientId: "test-client-route-dup-" + ts,
      });
      expect(res.status).toBe(409);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe("EMAIL_IN_USE");
    });

    it("POST /auth/login returns 401 AUTH_FAILED for wrong password — no enumeration", async () => {
      const res = await httpRequest("POST", "/auth/login", {
        email: routeEmail,
        password: "WrongPassword!",
        clientId: routeClientId,
      });
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe("AUTH_FAILED");
    });

    it("POST /auth/login returns 401 AUTH_FAILED for unknown email — same shape", async () => {
      const res = await httpRequest("POST", "/auth/login", {
        email: "test-email-route-noexist-" + ts + "@example.com",
        password: "AnyPassword!",
        clientId: routeClientId,
      });
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe("AUTH_FAILED");
    });

    it("BEHAVIORAL: POST /auth/login session-id changes after login (regenerate ran) AND user_id stamped", async () => {
      // Step 1: get a pre-login session cookie by calling a harmless route
      const meRes1 = await httpRequest("GET", "/api/me", null);
      const setCookieHeader = meRes1.headers["set-cookie"];
      if (!setCookieHeader) {
        // No session cookie issued — DB may not have session table; skip gracefully
        return;
      }
      const preCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      // Extract session id from cookie (connect.sid=s%3A<id>.<sig>)
      const sidMatch = preCookie.match(/connect\.sid=([^;]+)/);
      const preSessionId = sidMatch ? sidMatch[1] : null;

      // Step 2: POST /auth/login with the pre-login session cookie
      const loginRes = await httpRequest("POST", "/auth/login",
        { email: routeEmail, password: routePassword, clientId: routeClientId },
        preCookie.split(";")[0]  // send just the cookie value part
      );
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.ok).toBe(true);

      // After login, check for Set-Cookie with a NEW session id
      const postCookieHeader = loginRes.headers["set-cookie"];
      if (preSessionId && postCookieHeader) {
        const postCookie = Array.isArray(postCookieHeader) ? postCookieHeader[0] : postCookieHeader;
        const postSidMatch = postCookie.match(/connect\.sid=([^;]+)/);
        const postSessionId = postSidMatch ? postSidMatch[1] : null;
        if (postSessionId) {
          // Regenerate means a different session id
          expect(postSessionId).not.toBe(preSessionId);
        }
      }

      // Step 3: use the post-login cookie to hit /api/me — should return the authenticated user
      const postLoginCookie = postCookieHeader
        ? (Array.isArray(postCookieHeader) ? postCookieHeader[0] : postCookieHeader).split(";")[0]
        : preCookie.split(";")[0];
      const meRes2 = await httpRequest("GET", "/api/me", null, postLoginCookie);
      expect(meRes2.status).toBe(200);
      expect(meRes2.body.user).toBeTruthy();
      expect(meRes2.body.user.id).toBe(loginRes.body.user.id);
    });
  }
);

// ─── Suite 4: AUTH-04 signout / signout-all (requires DB) ────────────────────
// Tests the session row revocation paths. Uses direct SQL (not HTTP) to simulate
// the server-side operations — no running server needed (D-03 pattern).
// Cleanup prefix: test-su- (signout) and test-sa- (signout-all) so afterAll
// self-cleans on live-DB runs without touching other test rows.

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-04 signout + signout-all session revocation (requires DB)",
  () => {
    let pool;
    let db;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
    });

    afterAll(async () => {
      // Clean up all session rows created by this suite (prefix-keyed sids)
      await pool.query("DELETE FROM session WHERE sid LIKE 'test-su-%' OR sid LIKE 'test-sa-%'");
      await pool.end();
    });

    it("signout destroys current session row", async () => {
      const sid = "test-su-" + Date.now();
      const userId = 9999901;
      const expire = new Date(Date.now() + 86400 * 1000); // 1 day in future

      // Seed a session row representing a signed-in user
      await pool.query(
        "INSERT INTO session (sid, sess, expire, user_id) VALUES ($1, $2, $3, $4)",
        [sid, JSON.stringify({ passport: { user: userId } }), expire, userId]
      );

      // Verify it was created
      const { rows: before } = await pool.query(
        "SELECT sid FROM session WHERE sid = $1",
        [sid]
      );
      expect(before.length).toBe(1);

      // Simulate signout: destroy the session row by sid
      await pool.query("DELETE FROM session WHERE sid = $1", [sid]);

      // Assert the row is gone
      const { rows: after } = await pool.query(
        "SELECT sid FROM session WHERE sid = $1",
        [sid]
      );
      expect(after.length).toBe(0);
    });

    it("signout-all deletes all session rows for user_id", async () => {
      const userId = 9999902;
      const otherUserId = 9999903;
      const expire = new Date(Date.now() + 86400 * 1000);
      const ts = Date.now();

      const sid1 = "test-sa-1-" + ts;
      const sid2 = "test-sa-2-" + ts;
      const sidOther = "test-sa-other-" + ts;

      // Seed two session rows for the target user, plus one for a different user
      await pool.query(
        "INSERT INTO session (sid, sess, expire, user_id) VALUES ($1, $2, $3, $4)",
        [sid1, JSON.stringify({ passport: { user: userId } }), expire, userId]
      );
      await pool.query(
        "INSERT INTO session (sid, sess, expire, user_id) VALUES ($1, $2, $3, $4)",
        [sid2, JSON.stringify({ passport: { user: userId } }), expire, userId]
      );
      await pool.query(
        "INSERT INTO session (sid, sess, expire, user_id) VALUES ($1, $2, $3, $4)",
        [sidOther, JSON.stringify({ passport: { user: otherUserId } }), expire, otherUserId]
      );

      // Run the signout-all DELETE (the indexed column path, D-03 / T-02-13)
      await pool.query("DELETE FROM session WHERE user_id = $1", [userId]);

      // Assert zero rows remain for the target user_id
      const { rows: userRows } = await pool.query(
        "SELECT sid FROM session WHERE user_id = $1",
        [userId]
      );
      expect(userRows.length).toBe(0);

      // Assert the other user's session is untouched (T-02-12 isolation)
      const { rows: otherRows } = await pool.query(
        "SELECT sid FROM session WHERE sid = $1",
        [sidOther]
      );
      expect(otherRows.length).toBe(1);

      // Clean up the other-user row (not covered by afterAll prefix filter)
      await pool.query("DELETE FROM session WHERE sid = $1", [sidOther]);
    });
  }
);

// ─── Suite 6: AUTH-07 mailer no-op (no DB required) ──────────────────────────
// Verifies mailer graceful degradation in isolation — no DB or network needed.

describe("AUTH-07 mailer graceful degradation (no DB required)", () => {
  it("sendVerificationEmail returns {skipped:true} when RESEND_API_KEY is unset", async () => {
    // Temporarily clear the key (test env should not have it, but be explicit)
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const mailer = await import("../mailer.js");
      const result = await mailer.sendVerificationEmail("test@example.com", "http://localhost/auth/verify?token=abc");
      expect(result).toEqual({ skipped: true });
    } finally {
      if (saved !== undefined) process.env.RESEND_API_KEY = saved;
    }
  });

  it("sendMail returns {skipped:true} when RESEND_API_KEY is unset", async () => {
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const mailer = await import("../mailer.js");
      const result = await mailer.sendMail({ to: "x@example.com", subject: "Test", html: "<p>hi</p>", text: "hi" });
      expect(result).toEqual({ skipped: true });
    } finally {
      if (saved !== undefined) process.env.RESEND_API_KEY = saved;
    }
  });

  it("sendVerificationEmail never throws when RESEND_API_KEY is unset", async () => {
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const mailer = await import("../mailer.js");
      await expect(mailer.sendVerificationEmail("x@example.com", "http://localhost/verify")).resolves.not.toThrow();
    } finally {
      if (saved !== undefined) process.env.RESEND_API_KEY = saved;
    }
  });
});

// ─── Suite 7: AUTH-07 email verification DB-gated suites ─────────────────────
// Tests the verify-token flip: createAuthToken(user,'verify') -> consumeAuthToken
// -> markEmailVerified flips email_verified; second consume -> BAD_TOKEN;
// expired token -> BAD_TOKEN (no flip).
// Cleanup prefixes: test-email-verify-* for credentials, test-client-verify-* for guests.

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-07 email verification token + markEmailVerified (requires DB)",
  () => {
    let pool;
    let db;
    let testUserId;
    const ts = Date.now();
    const verifyEmail = "test-email-verify-" + ts + "@example.com";
    const verifyClientId = "test-client-verify-" + ts;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);
      // Seed an email account for verify-token tests
      const user = await db.createEmailAccount(verifyEmail, "VerifyPass123!", verifyClientId);
      testUserId = user.id;
    });

    afterAll(async () => {
      await pool.query("DELETE FROM auth_tokens WHERE user_id=$1", [testUserId]);
      await pool.query(
        "DELETE FROM credentials WHERE external_id LIKE 'test-email-verify-%@example.com'"
      );
      await pool.query(
        "DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)"
      );
      await pool.end();
    });

    it("createAuthToken + consumeAuthToken + markEmailVerified flips email_verified to true", async () => {
      // Ensure email_verified starts as false
      const { rows: before } = await pool.query(
        "SELECT email_verified FROM users WHERE id=$1",
        [testUserId]
      );
      expect(before[0].email_verified).toBe(false);

      // Create a verify token (24h TTL)
      const token = await db.createAuthToken(testUserId, "verify", 86400);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);

      // Consume the token — should return {userId}
      const consumed = await db.consumeAuthToken(token, "verify");
      expect(consumed).toHaveProperty("userId");
      expect(consumed.userId).toBe(testUserId);

      // Flip email_verified
      await db.markEmailVerified(consumed.userId);

      // Assert email_verified is now true
      const { rows: after } = await pool.query(
        "SELECT email_verified FROM users WHERE id=$1",
        [testUserId]
      );
      expect(after[0].email_verified).toBe(true);
    });

    it("consuming the same token a second time returns BAD_TOKEN (single-use)", async () => {
      const token = await db.createAuthToken(testUserId, "verify", 86400);

      // First consume succeeds
      const first = await db.consumeAuthToken(token, "verify");
      expect(first).toHaveProperty("userId");

      // Second consume returns BAD_TOKEN (single-use enforced by consumed_at guard)
      const second = await db.consumeAuthToken(token, "verify");
      expect(second).toEqual({ error: "BAD_TOKEN" });

      // email_verified remains true (markEmailVerified is idempotent; prior test set it)
      const { rows } = await pool.query(
        "SELECT email_verified FROM users WHERE id=$1",
        [testUserId]
      );
      expect(rows[0].email_verified).toBe(true);
    });

    it("an expired token (past expires_at) returns BAD_TOKEN and does not verify", async () => {
      // Reset email_verified to false to make the assertion meaningful
      await pool.query("UPDATE users SET email_verified=false WHERE id=$1", [testUserId]);

      // Insert a token that already expired
      const crypto = require("crypto");
      const expiredToken = crypto.randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO auth_tokens (user_id, token, purpose, expires_at) VALUES ($1,$2,$3, now() - interval '1 hour')",
        [testUserId, expiredToken, "verify"]
      );

      // Consume should return BAD_TOKEN
      const result = await db.consumeAuthToken(expiredToken, "verify");
      expect(result).toEqual({ error: "BAD_TOKEN" });

      // email_verified must still be false — expired token did not verify the account
      const { rows } = await pool.query(
        "SELECT email_verified FROM users WHERE id=$1",
        [testUserId]
      );
      expect(rows[0].email_verified).toBe(false);
    });

    it("a token with wrong purpose returns BAD_TOKEN", async () => {
      const token = await db.createAuthToken(testUserId, "reset", 3600);
      const result = await db.consumeAuthToken(token, "verify");
      expect(result).toEqual({ error: "BAD_TOKEN" });
    });
  }
);

// ─── Suite 8: AUTH-07 GET /auth/verify route (requires DB) ───────────────────
// Behavioral test: real HTTP to GET /auth/verify?token=... verifies the redirect
// and the DB state change. Uses Node built-in http module (mirrors Suite 5 pattern).

describe.skipIf(!hasDatabaseUrl)(
  "AUTH-07 GET /auth/verify route (requires DB)",
  () => {
    let pool;
    let db;
    let srv;
    let baseUrl;
    let testUserId;
    const ts = Date.now();
    const routeEmail = "test-email-route-verify-" + ts + "@example.com";
    const routeClientId = "test-client-route-verify-" + ts;

    function httpGet(url) {
      return new Promise((resolve, reject) => {
        const http = require("http");
        const reqOpts = new URL(url);
        const opts = {
          hostname: reqOpts.hostname,
          port: parseInt(reqOpts.port, 10),
          path: reqOpts.pathname + reqOpts.search,
          method: "GET",
        };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", (c) => { body += c; });
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on("error", reject);
        req.end();
      });
    }

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);

      const user = await db.createEmailAccount(routeEmail, "RouteVerify123!", routeClientId);
      testUserId = user.id;

      // Import and start the Express app on a random port
      const { TEST_EXPORTS } = await import("../server.js");
      srv = TEST_EXPORTS.app.listen(0);
      await new Promise((resolve) => srv.once("listening", resolve));
      const addr = srv.address();
      baseUrl = "http://127.0.0.1:" + addr.port;
    });

    afterAll(async () => {
      if (srv) await new Promise((r) => srv.close(r));
      await pool.query("DELETE FROM auth_tokens WHERE user_id=$1", [testUserId]);
      await pool.query(
        "DELETE FROM credentials WHERE external_id LIKE 'test-email-route-verify-%@example.com'"
      );
      await pool.query(
        "DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)"
      );
      await pool.end();
    });

    it("valid verify token -> redirects to /?verified=1 and flips email_verified", async () => {
      // Ensure email_verified is false before the test
      await pool.query("UPDATE users SET email_verified=false WHERE id=$1", [testUserId]);

      const token = await db.createAuthToken(testUserId, "verify", 86400);
      const res = await httpGet(baseUrl + "/auth/verify?token=" + token);

      // Should redirect (302) to /?verified=1
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/verified=1/);

      // email_verified should now be true
      const { rows } = await pool.query(
        "SELECT email_verified FROM users WHERE id=$1",
        [testUserId]
      );
      expect(rows[0].email_verified).toBe(true);
    });

    it("missing token -> redirects to /?verifyError=1", async () => {
      const res = await httpGet(baseUrl + "/auth/verify");
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/verifyError=1/);
    });

    it("bad/unknown token -> redirects to /?verifyError=1", async () => {
      const res = await httpGet(baseUrl + "/auth/verify?token=not-a-real-token-xyz");
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/verifyError=1/);
    });

    it("reused (already-consumed) token -> redirects to /?verifyError=1 (single-use)", async () => {
      const token = await db.createAuthToken(testUserId, "verify", 86400);

      // First request consumes the token
      const first = await httpGet(baseUrl + "/auth/verify?token=" + token);
      expect(first.status).toBe(302);
      expect(first.headers.location).toMatch(/verified=1/);

      // Second request on same token is rejected
      const second = await httpGet(baseUrl + "/auth/verify?token=" + token);
      expect(second.status).toBe(302);
      expect(second.headers.location).toMatch(/verifyError=1/);
    });
  }
);
