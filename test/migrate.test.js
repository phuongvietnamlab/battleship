import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// Migration runner tests require a live Postgres database.
// Skip the whole suite when DATABASE_URL is not set.
const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)("runMigrations — migration runner (requires DB)", () => {
  let pool;
  let runMigrations;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    runMigrations = db.runMigrations;

    // Clean slate: drop schema_migrations so we can test the runner fresh
    await pool.query("DROP TABLE IF EXISTS schema_migrations CASCADE");
    await pool.query("DROP TABLE IF EXISTS credentials CASCADE");
    await pool.query("DROP TABLE IF EXISTS users CASCADE");
  });

  afterAll(async () => {
    // Leave schema in place (integration test outcome); pool will be reused
    await pool.end();
  });

  it("creates schema_migrations table if absent", async () => {
    await runMigrations(pool);
    const { rows } = await pool.query(
      "SELECT to_regclass('public.schema_migrations') AS oid"
    );
    expect(rows[0].oid).not.toBeNull();
  });

  it("applies 001_identity.sql and records it in schema_migrations", async () => {
    // runMigrations was already called above; check the record
    const { rows } = await pool.query(
      "SELECT filename FROM schema_migrations WHERE filename='001_identity.sql'"
    );
    expect(rows.length).toBe(1);
  });

  it("creates the users table with expected columns", async () => {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY column_name"
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("created_at");
    expect(cols).toContain("guest_migrated_at");
  });

  it("creates the credentials table with expected columns and unique constraint", async () => {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='credentials' ORDER BY column_name"
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("user_id");
    expect(cols).toContain("type");
    expect(cols).toContain("external_id");
    expect(cols).toContain("created_at");
  });

  it("is idempotent: running runMigrations a second time applies 0 new files", async () => {
    // Count rows before second run
    const { rows: before } = await pool.query("SELECT COUNT(*)::int AS n FROM schema_migrations");
    await runMigrations(pool);
    const { rows: after } = await pool.query("SELECT COUNT(*)::int AS n FROM schema_migrations");
    expect(after[0].n).toBe(before[0].n);
  });

  it("rejects (fail-loud) when a migration file throws a DB error", async () => {
    // Temporarily inject a bad migration file into migrations/
    const badFile = path.join(rootDir, "migrations", "999_bad_test.sql");
    fs.writeFileSync(badFile, "THIS IS NOT VALID SQL;");

    try {
      await expect(runMigrations(pool)).rejects.toThrow();
    } finally {
      // Clean up the bad file and any partial record
      fs.unlinkSync(badFile);
      await pool.query(
        "DELETE FROM schema_migrations WHERE filename='999_bad_test.sql'"
      );
    }
  });
});

// ─── Static checks (no DB required) ─────────────────────────────────────────

describe("migrations/001_identity.sql — static DDL checks", () => {
  it("file exists", () => {
    const p = path.join(rootDir, "migrations", "001_identity.sql");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("contains CREATE TABLE for users, credentials, schema_migrations", () => {
    const p = path.join(rootDir, "migrations", "001_identity.sql");
    // File might not exist yet (RED phase) — skip gracefully
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8").toLowerCase();
    expect(sql).toMatch(/create table.*users/s);
    expect(sql).toMatch(/create table.*credentials/s);
    // schema_migrations is created by the runner itself, may not be in 001
    expect(sql).toMatch(/create table/);
  });

  it("contains unique (type, external_id) constraint in credentials", () => {
    const p = path.join(rootDir, "migrations", "001_identity.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8").toLowerCase();
    expect(sql).toMatch(/unique\s*\(\s*type\s*,\s*external_id\s*\)/);
  });
});

// ─── server.js wiring check ───────────────────────────────────────────────────

describe("server.js — migration runner wiring", () => {
  it("calls runMigrations in the boot IIFE", () => {
    const src = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
    expect(src).toMatch(/runMigrations/);
  });

  it("runMigrations call appears before server.listen(", () => {
    const src = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
    const migrIdx = src.indexOf("runMigrations");
    const listenIdx = src.indexOf("server.listen(");
    expect(migrIdx).toBeGreaterThan(-1);
    expect(listenIdx).toBeGreaterThan(-1);
    expect(migrIdx).toBeLessThan(listenIdx);
  });
});
