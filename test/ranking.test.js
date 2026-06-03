import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// ─── DB gate (mirrors match.test.js pattern) ─────────────────────────────────
// Integration tests require a live database. Skip when no DB env vars are set.
const hasDb = !!(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE);

// ─── Static DDL checks (no DB required — always run) ─────────────────────────
// These assert file existence and required DDL strings in migrations/005_rankings.sql.
// They run in Wave 0 and go RED until Task 3 creates the migration file.

describe("migrations/005_rankings.sql — static DDL", () => {
  const migPath = path.join(rootDir, "migrations", "005_rankings.sql");

  it("file exists at migrations/005_rankings.sql", () => {
    expect(fs.existsSync(migPath)).toBe(true);
  });

  it("contains CREATE TABLE IF NOT EXISTS ratings", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ratings/);
  });

  it("contains CREATE TABLE IF NOT EXISTS seasons", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS seasons/);
  });

  it("contains CREATE TABLE IF NOT EXISTS rating_history", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS rating_history/);
  });

  it("contains ALTER TABLE matches with winner_rating_before", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/ALTER TABLE matches/);
    expect(sql).toContain("winner_rating_before");
  });

  it("contains loser_rating_after column in matches ALTER", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toContain("loser_rating_after");
  });

  it("seasons table has label TEXT NOT NULL UNIQUE (idempotency guard, Pitfall 5)", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/label\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });

  it("rating_history has UNIQUE (user_id, season_id) — prevents double-archive", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*season_id\s*\)/i);
  });

  it("all CREATE TABLE statements use IF NOT EXISTS guard (re-runnable)", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    // Every CREATE TABLE must have IF NOT EXISTS
    const createTableMatches = sql.match(/CREATE TABLE(?!\s+IF NOT EXISTS)/gi);
    expect(createTableMatches).toBeNull();
  });

  it("ALTER TABLE uses ADD COLUMN IF NOT EXISTS guard (re-runnable)", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  it("contains IDX_ratings_rating_desc index for leaderboard query", () => {
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, "utf8");
    expect(sql).toContain("IDX_ratings_rating_desc");
  });
});

// ─── server.js ranked guards — static grep (no DB required) ──────────────────
// Checks that server.js source contains the two named error codes required for
// ranked guard enforcement (RANK-02, D-02, D-05). These go RED until Plan 02
// adds the ranked flag and guards to createRoom/joinRoom.

describe("server.js — ranked guards (static grep)", () => {
  const serverPath = path.join(rootDir, "server.js");

  it("server.js contains RANKED_REQUIRES_ACCOUNT (guest-block guard, RANK-02)", () => {
    const src = fs.readFileSync(serverPath, "utf8");
    expect(src).toContain("RANKED_REQUIRES_ACCOUNT");
  });

  it("server.js contains RANKED_REQUIRES_CLASSIC (advance-mode rejection guard, D-05)", () => {
    const src = fs.readFileSync(serverPath, "utf8");
    expect(src).toContain("RANKED_REQUIRES_CLASSIC");
  });
});

// ─── DB-gated integration test stubs ─────────────────────────────────────────
// These stubs are skipped when no DATABASE_URL/PGHOST is available.
// They become live in Plans 03 / 04 / 05 as the ranked vertical is wired in.

describe.skipIf(!hasDb)("RANK-01: same-transaction rating write (DB integration — Plan 03)", () => {
  // TODO (Plan 03): import recordMatch from ../db.js and recordRankedRatings
  // Test: calling recordMatch with ranked=true, both real user IDs:
  //   - Exactly one row inserted in matches
  //   - ratings table row upserted for both winner and loser
  //   - matches.winner_rating_before/after columns are non-null
  //   - All writes committed atomically (rollback if any step fails)
  it.todo("recordMatch with ranked=true inserts matches row and upserts ratings in one transaction");
  it.todo("matches.winner_rating_before reflects loser's pre-game rating");
  it.todo("matches.winner_rating_after reflects loser's post-game rating");
  it.todo("ratings table updated for both winner and loser");
  it.todo("rating write rolls back if match insert fails (atomicity)");
});

describe.skipIf(!hasDb)("RANK-03: leaderboard excludes provisional players (DB integration — Plan 04)", () => {
  // TODO (Plan 04): import getLeaderboard from ../db.js
  // Test: player with rd >= 110 is excluded from leaderboard result;
  //       player with rd < 110 is included.
  it.todo("player with rd >= 110 (provisional) is excluded from leaderboard");
  it.todo("player with rd < 110 (established) appears in leaderboard");
  it.todo("leaderboard is ordered by rating DESC");
  it.todo("leaderboard returns at most 100 rows");
});

describe.skipIf(!hasDb)("RANK-04: leaderboard cache served from Redis (integration — Plan 04)", () => {
  // TODO (Plan 04): import getLeaderboard, refreshLeaderboardCache from ../db.js
  //                 import isEnabled, getLeaderboardCache, setLeaderboardCache from ../store.js
  // Test: after refreshLeaderboardCache(), getLeaderboard() returns cached JSON
  //       without a second Postgres round-trip.
  it.todo("refreshLeaderboardCache stores JSON in Redis with battleship:leaderboard key");
  it.todo("getLeaderboard returns cached data on second call (no Postgres hit)");
  it.todo("getLeaderboard falls back to Postgres when Redis is unavailable");
});

describe.skipIf(!hasDb)("RANK-05: season reset — archive + soft-reset + idempotency (DB integration — Plan 05)", () => {
  // TODO (Plan 05): require ../scripts/season-reset.js main() or use db.js helpers directly
  // Test: running season reset archives ratings to rating_history, soft-blends toward 1500,
  //       resets RD to 350. Running twice with same label fails at UNIQUE(label) → rolls back.
  it.todo("season reset archives all current ratings to rating_history");
  it.todo("season reset soft-blends rating: new = 1500 + (old - 1500) * BLEND");
  it.todo("season reset resets rd to 350 and volatility to 0.06");
  it.todo("season reset is idempotent: second run with same label rolls back (UNIQUE label)");
  it.todo("rating_history UNIQUE(user_id, season_id) prevents double-archive");
});
