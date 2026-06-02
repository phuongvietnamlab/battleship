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
      const user = await db.linkOrPromoteAccount(sub, "Alice", null, clientId);
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
      const user = await db.linkOrPromoteAccount(sub, "Bob", null, clientId);

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
      const user1 = await db.linkOrPromoteAccount(sub, "Carol", null, clientId);
      const user2 = await db.linkOrPromoteAccount(sub, "Carol", null, clientId);

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

      const user = await db.linkOrPromoteAccount(sub, "NewUser", null, null);
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
      const googleUser = await db.linkOrPromoteAccount(sub, "Dave", null, firstClientId);

      // Step 2: Create a new guest (second device/session)
      const secondClientId = "test-client-d07-second-" + Date.now();
      await db.upsertGuestCredential(secondClientId);

      // Step 3: D-07 — returning Google user adopts the new guest credential
      const resultUser = await db.linkOrPromoteAccount(sub, "Dave", null, secondClientId);

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
      const googleUser = await db.linkOrPromoteAccount(sub, "Eve", null, clientId1);

      await db.upsertGuestCredential(clientId2);

      // Count users before D-07
      const { rows: beforeRows } = await pool.query(
        "SELECT count(*)::int AS n FROM users WHERE id >= $1",
        [googleUser.id]
      );
      const countBefore = beforeRows[0].n;

      // D-07 adopt
      await db.linkOrPromoteAccount(sub, "Eve", null, clientId2);

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
