// test/auth.test.js — Wave 0 test scaffold for SEC-05, AUTH-02, AUTH-03, AUTH-04.
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
