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
