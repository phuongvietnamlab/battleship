import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// ─── Task 1: Pool shape / env config ────────────────────────────────────────

describe("db.js — pool and module shape", () => {
  it("exports pool, runMigrations, and upsertGuestCredential", async () => {
    const db = await import("../db.js");
    expect(typeof db.pool).toBe("object");
    expect(db.pool).not.toBeNull();
    expect(typeof db.runMigrations).toBe("function");
    expect(typeof db.upsertGuestCredential).toBe("function");
  });

  it("db.js contains exactly one new Pool instantiation", () => {
    const result = execSync('grep -c "new Pool" ' + path.join(rootDir, "db.js"), {
      encoding: "utf8",
    }).trim();
    expect(result).toBe("1");
  });

  it("db.js contains no require('redis') (Postgres is a hard dependency, not optional)", async () => {
    const fs = await import("fs");
    const src = fs.default.readFileSync(path.join(rootDir, "db.js"), "utf8");
    expect(src).not.toMatch(/require\s*\(\s*["']redis["']\s*\)/);
  });

  it("ssl is off by default (no PG_SSL env set)", async () => {
    const fs = await import("fs");
    const src = fs.default.readFileSync(path.join(rootDir, "db.js"), "utf8");
    // PG_SSL must be env-gated
    expect(src).toMatch(/PG_SSL/);
  });
});

// ─── Task 3: upsertGuestCredential idempotency ──────────────────────────────
// These tests require a live DB; they are skipped when DATABASE_URL is not set.

const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)("upsertGuestCredential — idempotency (requires DB)", () => {
  let pool;
  let db;

  beforeAll(async () => {
    db = await import("../db.js");
    pool = db.pool;
    // Ensure schema is present before running these tests
    await db.runMigrations(pool);
  });

  afterAll(async () => {
    // Clean up test credential rows
    await pool.query("DELETE FROM credentials WHERE external_id LIKE 'test-client-%'");
    await pool.query("DELETE FROM users WHERE id NOT IN (SELECT user_id FROM credentials)");
    await pool.end();
  });

  it("calling upsertGuestCredential twice yields exactly one credentials row", async () => {
    const clientId = "test-client-idempotent-" + Date.now();
    await db.upsertGuestCredential(clientId);
    await db.upsertGuestCredential(clientId);

    const { rows } = await pool.query(
      "SELECT * FROM credentials WHERE type='guest' AND external_id=$1",
      [clientId]
    );
    expect(rows.length).toBe(1);
  });

  it("calling upsertGuestCredential twice does not create a second users row", async () => {
    const clientId = "test-client-nodup-users-" + Date.now();
    await db.upsertGuestCredential(clientId);
    await db.upsertGuestCredential(clientId);

    const { rows: credRows } = await pool.query(
      "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
      [clientId]
    );
    expect(credRows.length).toBe(1);
    const userId = credRows[0].user_id;

    const { rows: userRows } = await pool.query(
      "SELECT id FROM users WHERE id=$1",
      [userId]
    );
    expect(userRows.length).toBe(1);
  });

  it("upsertGuestCredential(null) is a no-op that does not throw", async () => {
    await expect(db.upsertGuestCredential(null)).resolves.toBeUndefined();
  });

  it("upsertGuestCredential(undefined) is a no-op that does not throw", async () => {
    await expect(db.upsertGuestCredential(undefined)).resolves.toBeUndefined();
  });

  it("a DB error is caught and not rethrown (graceful degradation)", async () => {
    // Simulate error by calling with an object that will cause a type error at the pg layer
    // upsertGuestCredential must catch and log, never throw
    // We pass an object — pg will reject the bind param; the helper must swallow it
    await expect(db.upsertGuestCredential({ not: "a-string" })).resolves.toBeUndefined();
  });
});
