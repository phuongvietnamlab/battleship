import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// ─── Static checks (no DB required) ─────────────────────────────────────────
// These always run — no DATABASE_URL needed.

describe("migrations/004_matches.sql — static DDL checks", () => {
  it("file exists", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("contains CREATE TABLE IF NOT EXISTS matches", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS matches/);
  });

  it("contains matches_reason_check constraint with all four reason values", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toContain("CONSTRAINT matches_reason_check");
    expect(sql).toContain("'normal'");
    expect(sql).toContain("'timeout'");
    expect(sql).toContain("'disconnect'");
    expect(sql).toContain("'leave'");
  });

  it("contains IDX_matches_winner_id index", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toContain("IDX_matches_winner_id");
  });

  it("contains IDX_matches_loser_id index", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toContain("IDX_matches_loser_id");
  });

  it("contains dedup UNIQUE constraint on (winner_id, loser_id, started_at)", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toContain("matches_dedup_unique");
    expect(sql).toMatch(/UNIQUE\s*\(\s*winner_id\s*,\s*loser_id\s*,\s*started_at\s*\)/);
  });

  it("contains no rating/glicko/deviation columns (Phase 4 scope deferred)", () => {
    const p = path.join(rootDir, "migrations", "004_matches.sql");
    if (!fs.existsSync(p)) return;
    const sql = fs.readFileSync(p, "utf8");
    // Strip comments before checking for column definitions
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/\brating\b/i);
    expect(sqlNoComments).not.toMatch(/\bdeviation\b/i);
    expect(sqlNoComments).not.toMatch(/\bvolatility\b/i);
  });
});

// ─── db.js export contract check (static — Plan 02 spine) ───────────────────
// This assert goes RED now and GREEN when Plan 02 adds recordMatch to db.js.
// It is the intentional RED→GREEN spine for the whole phase.

describe("db.js — recordMatch export contract (Plan 02 spine)", () => {
  it("db.js source contains 'recordMatch' (export contract — RED until Plan 02)", async () => {
    const src = fs.readFileSync(path.join(rootDir, "db.js"), "utf8");
    expect(src).toContain("recordMatch");
  });
});

// ─── DB-gated integration tests (require DATABASE_URL) ───────────────────────

const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)("matches table schema (requires DB)", () => {
  let pool;
  let runMigrations;
  let winnerUserId;
  let loserUserId;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    runMigrations = db.runMigrations;
    // Run all migrations (idempotent — safe to re-run)
    await runMigrations(pool);
    // Insert two test users to satisfy the FK constraints on matches
    const { rows: winner } = await pool.query(
      "INSERT INTO users DEFAULT VALUES RETURNING id"
    );
    winnerUserId = winner[0].id;
    const { rows: loser } = await pool.query(
      "INSERT INTO users DEFAULT VALUES RETURNING id"
    );
    loserUserId = loser[0].id;
  });

  afterAll(async () => {
    // Clean up: delete test matches and test users
    if (winnerUserId != null && loserUserId != null) {
      await pool.query(
        "DELETE FROM matches WHERE winner_id = $1 OR loser_id = $1 OR winner_id = $2 OR loser_id = $2",
        [winnerUserId, loserUserId]
      );
      await pool.query("DELETE FROM users WHERE id = $1 OR id = $2", [winnerUserId, loserUserId]);
    }
    await pool.end();
  });

  it("matches table exists with expected columns after migration", async () => {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='matches' ORDER BY column_name"
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("winner_id");
    expect(cols).toContain("loser_id");
    expect(cols).toContain("reason");
    expect(cols).toContain("mode");
    expect(cols).toContain("started_at");
    expect(cols).toContain("ended_at");
    expect(cols).toContain("created_at");
  });

  it("winnerUserId and loserUserId are valid integers (FK setup succeeded)", () => {
    expect(typeof winnerUserId).toBe("number");
    expect(typeof loserUserId).toBe("number");
  });

  // ── Placeholder tests for Plan 02/03 behaviors (todo — not yet implementable) ──

  it.todo("recordMatch inserts exactly one row into matches");
  it.todo("recordMatch returns without throwing (best-effort / graceful degrade)");
  it.todo("recordMatch is idempotent via room.recorded flag (no double-write)");
  it.todo("recordMatch no-ops when DATABASE_URL is absent (never throws)");
});

describe.skipIf(!hasDatabaseUrl)("disconnect forfeit row (Plan 03 — requires DB)", () => {
  it.todo("disconnect reason row appears: grace-window expiry writes a disconnect forfeit-loss row");
});

describe.skipIf(!hasDatabaseUrl)("recordMatch export (Plan 02 — requires DB)", () => {
  it.todo("db.js exports recordMatch as a function");
});
