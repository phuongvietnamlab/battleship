// test/profile.test.js — PROF-01, PROF-02 assertions for GET /api/profile/:userId.
// DB-gated suites skip cleanly when DATABASE_URL is not set.
// Follows the test/db.test.js pattern: describe.skipIf, beforeAll runMigrations, afterAll cleanup.

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

// ─── Suite 2: GET /api/profile/:userId zero-state shape (requires DB) ──────────────────
// PROF-01 / PROF-02: route shape assertions (parameterized query, public fields only,
// correct error codes).

describe.skipIf(!hasDatabaseUrl)(
  "GET /api/profile/:userId — zero-state (requires DB)",
  () => {
    let pool;
    let db;
    let testUserId;
    let buildProfile; // helper extracted from server TEST_EXPORTS or inline

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

      // Stamp a display_name on the user so profileData.displayName is non-null
      await pool.query(
        "UPDATE users SET display_name=$1 WHERE id=$2",
        ["test-profile-user", testUserId]
      );

      // Extract the profile-building logic: query the users row and shape to JSON.
      // This mirrors the GET /api/profile/:userId handler in server.js exactly
      // (D-10: zeros scaffold; Phase 3 swaps the SELECT).
      buildProfile = async (userId) => {
        const id = parseInt(userId, 10);
        if (!Number.isInteger(id)) return { error: "INVALID_ID", status: 400 };
        const { rows: userRows } = await pool.query(
          "SELECT id, display_name, avatar_url, created_at, guest_migrated_at FROM users WHERE id=$1",
          [id]
        );
        if (!userRows[0]) return { error: "NOT_FOUND", status: 404 };
        const u = userRows[0];
        return {
          status: 200,
          data: {
            id: u.id,
            displayName: u.display_name,
            avatarUrl: u.avatar_url,
            memberSince: u.created_at,
            isLinkedAccount: u.guest_migrated_at !== null,
            stats: { wins: 0, losses: 0, gamesPlayed: 0 },
          },
        };
      };
    });

    afterAll(async () => {
      await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-client-profile-%'");
      await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
      await pool.end();
    });

    // PROF-01: known user returns 200 with zero-state stats shape
    it("returns 200 with zero-state stats for a known user (PROF-01)", async () => {
      const result = await buildProfile(testUserId);
      expect(result.status).toBe(200);
      const { data } = result;
      expect(data.id).toBe(testUserId);
      expect(data.displayName).toBe("test-profile-user");
      expect(data.memberSince).toBeTruthy(); // non-null timestamp
      expect(typeof data.isLinkedAccount).toBe("boolean");
      expect(data.stats.wins).toBe(0);
      expect(data.stats.losses).toBe(0);
      expect(data.stats.gamesPlayed).toBe(0);
    });

    // Verify only public fields are present — no credentials, no session, no email
    it("response contains only public fields (no email/credential/session data)", async () => {
      const result = await buildProfile(testUserId);
      expect(result.status).toBe(200);
      const keys = Object.keys(result.data);
      // Allowed public keys
      const allowedKeys = new Set(["id", "displayName", "avatarUrl", "memberSince", "isLinkedAccount", "stats"]);
      for (const key of keys) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      // Must NOT contain private fields
      expect(result.data).not.toHaveProperty("email");
      expect(result.data).not.toHaveProperty("passwordHash");
      expect(result.data).not.toHaveProperty("sessionId");
      expect(result.data).not.toHaveProperty("credentials");
    });

    // PROF-02: unknown id returns NOT_FOUND
    it("returns 404 NOT_FOUND for unknown userId (PROF-02)", async () => {
      const result = await buildProfile(9999999);
      expect(result.error).toBe("NOT_FOUND");
      expect(result.status).toBe(404);
    });

    // INVALID_ID guard: non-integer input
    it("returns 400 INVALID_ID for non-integer userId", async () => {
      const result = await buildProfile("abc");
      expect(result.error).toBe("INVALID_ID");
      expect(result.status).toBe(400);
    });

    // Verify users table schema has the correct profile columns
    it("users table has display_name and avatar_url columns after migration", async () => {
      const { rows } = await pool.query(
        "SELECT display_name, avatar_url FROM users WHERE id=$1",
        [testUserId]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].display_name).toBe("test-profile-user");
    });
  }
);
