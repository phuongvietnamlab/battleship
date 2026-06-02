// test/profile.test.js — Wave 0 test scaffold for PROF-01, PROF-02.
// DB-gated suites skip cleanly when DATABASE_URL is not set.
// Follows the test/db.test.js pattern: describe.skipIf, beforeAll runMigrations, afterAll cleanup.
// Note: Full GET /api/profile/:userId route assertions added in Plan 04 when route is wired.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDatabaseUrl = !!process.env.DATABASE_URL;

// ─── Suite 1: profile module shape (no DB required) ──────────────────────────

describe("db.js — profile-related exports", () => {
  it("exports pool as an object", async () => {
    const db = await import("../db.js");
    expect(typeof db.pool).toBe("object");
    expect(db.pool).not.toBeNull();
  });

  it("exports sanitizeDisplayName for display_name storage (D-09)", async () => {
    const db = await import("../db.js");
    expect(typeof db.sanitizeDisplayName).toBe("function");
  });

  it("sanitizeDisplayName('<b>x</b>') returns '&lt;b&gt;x&lt;/b&gt;'", async () => {
    const db = await import("../db.js");
    expect(db.sanitizeDisplayName("<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;");
  });
});

// ─── Suite 2: zero-state profile scaffold (requires DB) ──────────────────────
// PROF-01 / PROF-02: GET /api/profile/:userId zero-state shape.
// Full route assertions filled in Plan 04 when Express route is wired.

describe.skipIf(!hasDatabaseUrl)(
  "GET /api/profile/:userId — zero-state scaffold (requires DB)",
  () => {
    let pool;
    let db;
    let testUserId;

    beforeAll(async () => {
      db = await import("../db.js");
      pool = db.pool;
      await db.runMigrations(pool);

      // Insert a test user row with a display_name to validate profile read
      const clientId = "test-client-profile-" + Date.now();
      await db.upsertGuestCredential(clientId);
      const { rows } = await pool.query(
        "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
        [clientId]
      );
      testUserId = rows[0].user_id;
    });

    afterAll(async () => {
      await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-client-profile-%'");
      await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
      await pool.end();
    });

    it("users row exists for testUserId (sanity check)", async () => {
      const { rows } = await pool.query(
        "SELECT id FROM users WHERE id=$1",
        [testUserId]
      );
      expect(rows.length).toBe(1);
    });

    it("users table has display_name and avatar_url columns after migration (002_accounts.sql)", async () => {
      // If the columns don't exist this query will throw, failing the test
      const { rows } = await pool.query(
        "SELECT display_name, avatar_url FROM users WHERE id=$1",
        [testUserId]
      );
      expect(rows.length).toBe(1);
      // New columns are nullable — null is the expected initial value
      expect(rows[0].display_name === null || typeof rows[0].display_name === "string").toBe(true);
      expect(rows[0].avatar_url === null || typeof rows[0].avatar_url === "string").toBe(true);
    });

    it("session table exists in the DB after migration (002_accounts.sql)", async () => {
      const { rows } = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name='session'"
      );
      expect(rows.length).toBe(1);
    });

    it("session table has user_id column for efficient sign-out-all (D-03)", async () => {
      const { rows } = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='session' AND column_name='user_id'"
      );
      expect(rows.length).toBe(1);
    });
  }
);
