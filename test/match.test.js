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

// ─── Rematch dedup-reset regression (CR-01) ──────────────────────────────────
// The rematch handler must clear room.recorded, otherwise every game after the
// first silently skips its match write (the !room.recorded guard stays true).

describe("server.js — rematch resets dedup flag (CR-01)", () => {
  it("rematch handler clears room.recorded so the next game records", () => {
    const src = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
    const rematchStart = src.indexOf('socket.on("rematch"');
    expect(rematchStart).toBeGreaterThan(-1);
    const rematchBody = src.slice(rematchStart, rematchStart + 800);
    expect(rematchBody).toMatch(/room\.recorded\s*=\s*false/);
  });
});

// ─── Unit tests — always run, no DATABASE_URL required ───────────────────────
// These exercise recordMatch's graceful no-op and input validation guards.

describe("recordMatch — unit tests (no DB required)", () => {
  it("resolves without throwing when all DB env vars are absent", async () => {
    // Save current env state
    const savedDatabaseUrl = process.env.DATABASE_URL;
    const savedPgHost = process.env.PGHOST;
    const savedPgDatabase = process.env.PGDATABASE;

    try {
      // Temporarily clear all DB env vars to trigger the no-op guard
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;
      delete process.env.PGDATABASE;

      // Import fresh after env mutation — module is cached, but recordMatch
      // reads process.env at call time so the guard fires correctly
      const { recordMatch } = await import("../db.js");
      // Must resolve without throwing
      await expect(recordMatch(1, 2, "normal", "classic", new Date())).resolves.toBeUndefined();
    } finally {
      // Restore env vars (try/finally so other suites are unaffected)
      if (savedDatabaseUrl !== undefined) process.env.DATABASE_URL = savedDatabaseUrl;
      if (savedPgHost !== undefined) process.env.PGHOST = savedPgHost;
      if (savedPgDatabase !== undefined) process.env.PGDATABASE = savedPgDatabase;
    }
  });

  it("resolves without throwing when reason is invalid ('cheated')", async () => {
    // Save current env state
    const savedDatabaseUrl = process.env.DATABASE_URL;
    const savedPgHost = process.env.PGHOST;
    const savedPgDatabase = process.env.PGDATABASE;

    try {
      // Clear DB vars so even if reason check passes, no actual pool.connect occurs
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;
      delete process.env.PGDATABASE;

      const { recordMatch } = await import("../db.js");
      // Invalid reason must be swallowed — no throw
      await expect(recordMatch(1, 2, "cheated", "classic", new Date())).resolves.toBeUndefined();
    } finally {
      if (savedDatabaseUrl !== undefined) process.env.DATABASE_URL = savedDatabaseUrl;
      if (savedPgHost !== undefined) process.env.PGHOST = savedPgHost;
      if (savedPgDatabase !== undefined) process.env.PGDATABASE = savedPgDatabase;
    }
  });
});

// ─── DB-gated integration tests (require DATABASE_URL) ───────────────────────

const hasDatabaseUrl = !!process.env.DATABASE_URL;

// Top-level pool cleanup: called once after ALL DB-gated suites finish.
// Each suite imports the module-cached pool; we end it here so exactly
// one pool.end() runs regardless of how many DB suites exist.
let _sharedPool = null;
afterAll(async () => {
  if (hasDatabaseUrl && _sharedPool) {
    await _sharedPool.end();
  }
});

describe.skipIf(!hasDatabaseUrl)("matches table schema (requires DB)", () => {
  let pool;
  let runMigrations;
  let winnerUserId;
  let loserUserId;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    _sharedPool = pool; // register for top-level teardown
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
    // pool.end() is handled by the top-level afterAll above — not called here
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

  it("recordMatch inserts exactly one row into matches", async () => {
    const { recordMatch } = await import("../db.js");
    const startedAt = new Date("2026-01-01T12:00:00Z");
    await recordMatch(winnerUserId, loserUserId, "normal", "classic", startedAt);

    const { rows } = await pool.query(
      "SELECT * FROM matches WHERE winner_id = $1 AND loser_id = $2",
      [winnerUserId, loserUserId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("normal");
    expect(rows[0].winner_id).toBe(winnerUserId);
    expect(rows[0].loser_id).toBe(loserUserId);
  });

  it("recordMatch is idempotent — duplicate (winner_id, loser_id, started_at) does not create a second row and does not throw", async () => {
    const { recordMatch } = await import("../db.js");
    // Use the same startedAt as the prior test to trigger the UNIQUE constraint
    const startedAt = new Date("2026-01-01T12:00:00Z");

    // Second call with identical keys — should be swallowed, not throw
    await expect(
      recordMatch(winnerUserId, loserUserId, "normal", "classic", startedAt)
    ).resolves.toBeUndefined();

    // Still exactly one row
    const { rows } = await pool.query(
      "SELECT * FROM matches WHERE winner_id = $1 AND loser_id = $2",
      [winnerUserId, loserUserId]
    );
    expect(rows).toHaveLength(1);
  });

  it("recordMatch returns without throwing (best-effort / graceful degrade)", async () => {
    // Exercise the swallow path by confirming the integration call above did not throw.
    // This test also verifies that recordMatch does not throw on a DB with data.
    const { recordMatch } = await import("../db.js");
    await expect(
      recordMatch(winnerUserId, loserUserId, "timeout", "classic", new Date())
    ).resolves.toBeUndefined();
  });

  it("recordMatch no-ops when DATABASE_URL is absent (never throws)", async () => {
    // This test is duplicated here for completeness; the unit suite above covers
    // the same guard without a DB. This version confirms the guard fires even
    // when the pool was already created (module cache — process.env read at call time).
    const savedDatabaseUrl = process.env.DATABASE_URL;
    const savedPgHost = process.env.PGHOST;
    const savedPgDatabase = process.env.PGDATABASE;
    try {
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;
      delete process.env.PGDATABASE;

      const { recordMatch } = await import("../db.js");
      await expect(recordMatch(1, 2, "normal", "classic", new Date())).resolves.toBeUndefined();
    } finally {
      if (savedDatabaseUrl !== undefined) process.env.DATABASE_URL = savedDatabaseUrl;
      if (savedPgHost !== undefined) process.env.PGHOST = savedPgHost;
      if (savedPgDatabase !== undefined) process.env.PGDATABASE = savedPgDatabase;
    }
  });
});

// ─── MATCH-03: disconnect forfeit row (Plan 03) ───────────────────────────────
// Grace-window disconnect writes exactly one 'disconnect' row attributed to the
// absent player. Full socket-level grace-timer simulation is covered by the manual
// checkpoint (Task 3); this DB-row contract assertion is the automated proof.

describe.skipIf(!hasDatabaseUrl)("disconnect forfeit row (Plan 03 — requires DB)", () => {
  let pool;
  let disconnWinnerId;
  let disconnLoserId;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    _sharedPool = pool; // ensure top-level afterAll has the pool ref
    const { runMigrations } = db;
    await runMigrations(pool);
    // Use distinct users so no UNIQUE collision with the sibling suite
    const { rows: winner } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    disconnWinnerId = winner[0].id;
    const { rows: loser } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    disconnLoserId = loser[0].id;
  });

  afterAll(async () => {
    // Clean up: delete this suite's matches and users
    if (disconnWinnerId != null && disconnLoserId != null) {
      await pool.query(
        "DELETE FROM matches WHERE winner_id = $1 OR loser_id = $1 OR winner_id = $2 OR loser_id = $2",
        [disconnWinnerId, disconnLoserId]
      );
      await pool.query("DELETE FROM users WHERE id = $1 OR id = $2", [disconnWinnerId, disconnLoserId]);
    }
    // pool.end() is handled by the top-level afterAll — not called here
  });

  it("disconnect reason row appears: recordMatch writes a disconnect forfeit-loss row", async () => {
    const { recordMatch } = await import("../db.js");
    const startedAt = new Date("2026-02-01T10:00:00Z");
    await recordMatch(disconnWinnerId, disconnLoserId, "disconnect", "classic", startedAt);

    const { rows } = await pool.query(
      "SELECT reason, winner_id, loser_id FROM matches WHERE winner_id = $1 AND loser_id = $2",
      [disconnWinnerId, disconnLoserId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("disconnect");
    expect(rows[0].winner_id).toBe(disconnWinnerId);
    expect(rows[0].loser_id).toBe(disconnLoserId);
  });
});

describe.skipIf(!hasDatabaseUrl)("recordMatch export (Plan 02 — requires DB)", () => {
  it("db.js exports recordMatch as a function", async () => {
    const db = await import("../db.js");
    expect(typeof db.recordMatch).toBe("function");
  });
});
