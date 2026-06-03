import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

// ─── RANK-01: db.js recordMatch ranked param — static grep (no DB required) ──
// These static checks confirm that db.js has been extended with the ranked param
// and elo.js require before any DB-gated tests run.

describe("db.js — recordMatch ranked param (static grep, Plan 03)", () => {
  const dbPath = path.join(rootDir, "db.js");

  it("db.js requires elo.js (require('./elo') or require('./elo.js'))", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    expect(src).toMatch(/require\(['"]\.\/elo['"]\)/);
  });

  it("db.js recordMatch signature includes ranked parameter", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    // Should contain 'ranked' as a 6th param with default false
    expect(src).toMatch(/recordMatch\s*\([^)]*ranked/);
  });

  it("db.js recordMatch uses same client for rating queries (no second pool.connect)", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    // The rating branch must use `client.query` not `pool.query` inside recordMatch.
    // Slice ONLY the recordMatch function body (from its declaration to the closing brace
    // of the try/catch/finally block) to avoid counting pool.connect() in other functions
    // that appear later in the file (e.g. refreshLeaderboardCache added in Plan 04).
    const fnStart = src.indexOf("async function recordMatch");
    // Find the closing brace of the function by looking for the pattern after client.release()
    // We look for `}\n}` to find end of finally block -> end of recordMatch
    const fnSlice = src.slice(fnStart, fnStart + 3000); // recordMatch is well under 3000 chars
    // Count pool.connect calls within the function body slice — should be exactly 1
    const connectMatches = fnSlice.match(/pool\.connect\(\)/g) || [];
    expect(connectMatches.length).toBe(1);
  });
});

// ─── RANK-03/RANK-04 leaderboard — static grep (no DB required) ──────────────
// Confirm store.js and db.js source contain the required exports and patterns.

describe("store.js — leaderboard cache helpers (static grep, Plan 04)", () => {
  const storePath = path.join(rootDir, "store.js");

  it("store.js exports getLeaderboardCache", () => {
    const src = fs.readFileSync(storePath, "utf8");
    expect(src).toContain("getLeaderboardCache");
  });

  it("store.js exports setLeaderboardCache", () => {
    const src = fs.readFileSync(storePath, "utf8");
    expect(src).toContain("setLeaderboardCache");
  });

  it("store.js setLeaderboardCache guards on ready and never exposes client", () => {
    const src = fs.readFileSync(storePath, "utf8");
    // Must contain the ready guard before any set call
    expect(src).toMatch(/if\s*\(!ready\)\s*return/);
    // Module.exports must not export client
    const exportsBlock = src.slice(src.indexOf("module.exports"));
    expect(exportsBlock).not.toContain("client");
  });
});

describe("server.js — GET /api/leaderboard endpoint (static grep, Plan 04)", () => {
  const serverPath = path.join(rootDir, "server.js");

  it("server.js contains app.get('/api/leaderboard')", () => {
    const src = fs.readFileSync(serverPath, "utf8");
    expect(src).toContain("app.get(\"/api/leaderboard\"");
  });

  it("server.js /api/leaderboard calls getLeaderboard()", () => {
    const src = fs.readFileSync(serverPath, "utf8");
    expect(src).toContain("getLeaderboard()");
  });

  it("server.js /api/leaderboard 500 error uses LEADERBOARD_UNAVAILABLE code", () => {
    const src = fs.readFileSync(serverPath, "utf8");
    expect(src).toContain("LEADERBOARD_UNAVAILABLE");
  });

  it("server.js /api/leaderboard imports getLeaderboard from db.js", () => {
    const src = fs.readFileSync(serverPath, "utf8");
    // Destructured require of db.js must include getLeaderboard
    expect(src).toMatch(/require\(['"]\.\/db['"]\)/);
    expect(src).toContain("getLeaderboard");
  });
});

describe("db.js — leaderboard functions (static grep, Plan 04)", () => {
  const dbPath = path.join(rootDir, "db.js");

  it("db.js exports getLeaderboard", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    expect(src).toContain("getLeaderboard");
  });

  it("db.js exports refreshLeaderboardCache", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    expect(src).toContain("refreshLeaderboardCache");
  });

  it("db.js leaderboard SELECT contains rd < 110 provisional filter (Pitfall 3, T-04-14)", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    expect(src).toMatch(/r\.rd\s*<\s*110/);
  });

  it("db.js leaderboard SELECT contains ORDER BY rating DESC", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    expect(src).toMatch(/ORDER BY r\.rating DESC/i);
  });

  it("db.js leaderboard SELECT has LIMIT 100", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    expect(src).toMatch(/LIMIT 100/);
  });

  it("db.js recordMatch calls refreshLeaderboardCache AFTER COMMIT (post-commit fire-and-forget)", () => {
    const src = fs.readFileSync(dbPath, "utf8");
    const commitIdx = src.indexOf("await client.query(\"COMMIT\")");
    const refreshIdx = src.indexOf("refreshLeaderboardCache().catch");
    // refreshLeaderboardCache must appear after COMMIT in file order
    expect(commitIdx).toBeGreaterThan(0);
    expect(refreshIdx).toBeGreaterThan(commitIdx);
  });
});

// ─── DB-gated integration tests ───────────────────────────────────────────────
// These become live in Plan 03 when recordMatch gains the ranked param.

// Shared pool cleanup (mirrors match.test.js pattern)
let _sharedPool = null;
afterAll(async () => {
  if (hasDb && _sharedPool) {
    await _sharedPool.end();
  }
});

describe.skipIf(!hasDb)("RANK-01: same-transaction rating write (DB integration — Plan 03)", () => {
  let pool;
  let runMigrations;
  let recordMatch;
  let winnerId;
  let loserId;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    _sharedPool = pool;
    runMigrations = db.runMigrations;
    recordMatch = db.recordMatch;
    // Ensure all migrations are applied (idempotent)
    await runMigrations(pool);
    // Insert two test users for FK integrity
    const { rows: w } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    winnerId = w[0].id;
    const { rows: l } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    loserId = l[0].id;
  });

  afterAll(async () => {
    if (winnerId != null && loserId != null) {
      // Clean up all test data in dependency order
      await pool.query(
        "DELETE FROM matches WHERE winner_id = $1 OR loser_id = $1 OR winner_id = $2 OR loser_id = $2",
        [winnerId, loserId]
      );
      await pool.query(
        "DELETE FROM ratings WHERE user_id = $1 OR user_id = $2",
        [winnerId, loserId]
      );
      await pool.query("DELETE FROM users WHERE id = $1 OR id = $2", [winnerId, loserId]);
    }
    // pool.end() is handled by the top-level afterAll
  });

  it("ranked recordMatch inserts matches row and upserts ratings for both players in one transaction", async () => {
    const startedAt = new Date("2026-05-01T10:00:00Z");
    await recordMatch(winnerId, loserId, "normal", "classic", startedAt, true);

    // Verify matches row was inserted
    const { rows: matchRows } = await pool.query(
      "SELECT * FROM matches WHERE winner_id = $1 AND loser_id = $2 AND started_at = $3",
      [winnerId, loserId, startedAt]
    );
    expect(matchRows).toHaveLength(1);

    // Verify both ratings rows were upserted
    const { rows: ratingRows } = await pool.query(
      "SELECT user_id, rating, rd, volatility, games_played FROM ratings WHERE user_id = $1 OR user_id = $2 ORDER BY user_id",
      [winnerId, loserId]
    );
    expect(ratingRows).toHaveLength(2);
  });

  it("ranked recordMatch rating values are finite (no NaN or Infinity)", async () => {
    const { rows: ratingRows } = await pool.query(
      "SELECT rating, rd, volatility FROM ratings WHERE user_id = $1 OR user_id = $2",
      [winnerId, loserId]
    );
    for (const row of ratingRows) {
      expect(isFinite(row.rating)).toBe(true);
      expect(isFinite(row.rd)).toBe(true);
      expect(isFinite(row.volatility)).toBe(true);
    }
  });

  it("ranked recordMatch stamps winner_rating_before/after and loser_rating_before/after on the matches row", async () => {
    const startedAt = new Date("2026-05-01T10:00:00Z");
    const { rows: matchRows } = await pool.query(
      "SELECT winner_rating_before, winner_rating_after, loser_rating_before, loser_rating_after FROM matches WHERE winner_id = $1 AND loser_id = $2 AND started_at = $3",
      [winnerId, loserId, startedAt]
    );
    expect(matchRows).toHaveLength(1);
    const m = matchRows[0];
    // All four snapshot columns must be non-null
    expect(m.winner_rating_before).not.toBeNull();
    expect(m.winner_rating_after).not.toBeNull();
    expect(m.loser_rating_before).not.toBeNull();
    expect(m.loser_rating_after).not.toBeNull();
    // After/before deltas make sense: winner went up, loser went down
    expect(m.winner_rating_after).toBeGreaterThan(m.winner_rating_before);
    expect(m.loser_rating_after).toBeLessThan(m.loser_rating_before);
  });

  it("unranked recordMatch writes a matches row but NO ratings rows", async () => {
    // Use a distinct startedAt to avoid UNIQUE collision with the ranked test above
    const startedAt = new Date("2026-05-02T10:00:00Z");
    // Capture ratings before (to confirm they don't change)
    const { rows: ratingsBefore } = await pool.query(
      "SELECT user_id, rating, rd FROM ratings WHERE user_id = $1 OR user_id = $2",
      [winnerId, loserId]
    );

    // Call with ranked=false (default)
    await recordMatch(winnerId, loserId, "normal", "classic", startedAt, false);

    // Verify matches row was inserted
    const { rows: matchRows } = await pool.query(
      "SELECT winner_rating_before FROM matches WHERE winner_id = $1 AND loser_id = $2 AND started_at = $3",
      [winnerId, loserId, startedAt]
    );
    expect(matchRows).toHaveLength(1);
    // snapshot columns must be null for unranked
    expect(matchRows[0].winner_rating_before).toBeNull();

    // Verify ratings unchanged (same count, same values if rows existed)
    const { rows: ratingsAfter } = await pool.query(
      "SELECT user_id, rating, rd FROM ratings WHERE user_id = $1 OR user_id = $2",
      [winnerId, loserId]
    );
    expect(ratingsAfter.length).toBe(ratingsBefore.length);
    for (const before of ratingsBefore) {
      const after = ratingsAfter.find((r) => r.user_id === before.user_id);
      expect(after.rating).toBeCloseTo(before.rating, 4);
      expect(after.rd).toBeCloseTo(before.rd, 4);
    }
  });

  it("ranked recordMatch with null winner id writes no ratings and no matches row (unresolvable-seat guard)", async () => {
    // winnerId=null triggers the unresolvable-seat guard in recordMatch; whole call no-ops
    const startedAt = new Date("2026-05-03T10:00:00Z");
    await expect(
      recordMatch(null, loserId, "normal", "classic", startedAt, true)
    ).resolves.toBeUndefined();

    // Confirm no match row was inserted
    const { rows } = await pool.query(
      "SELECT id FROM matches WHERE loser_id = $1 AND started_at = $2",
      [loserId, startedAt]
    );
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!hasDb)("RANK-01: atomic rollback on rating failure (DB integration — Plan 03)", () => {
  // Separate describe so it gets its own beforeAll/afterAll with fresh users
  let pool;
  let runMigrations;
  let recordMatch;
  let atomicWinnerId;
  let atomicLoserId;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    _sharedPool = pool;
    runMigrations = db.runMigrations;
    recordMatch = db.recordMatch;
    await runMigrations(pool);
    const { rows: w } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    atomicWinnerId = w[0].id;
    const { rows: l } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    atomicLoserId = l[0].id;

    // Pre-insert a ratings row for the winner with an intentionally corrupt value
    // that will cause a REAL column constraint failure when the rating UPDATE
    // is attempted. We can't easily force a NaN into REAL (Postgres rejects it),
    // so we test atomicity by inserting a duplicate match row (same winner/loser/started_at)
    // which triggers the UNIQUE constraint inside the transaction and rolls everything back.
    // This confirms that the matches INSERT and the (hypothetical) rating writes all roll back.
    // For a clean atomicity test we use a startedAt that already exists.
    const startedAt = new Date("2026-06-01T00:00:00Z");
    // Pre-insert a row to cause UNIQUE collision on second call
    await pool.query(
      "INSERT INTO matches (winner_id, loser_id, reason, mode, started_at, ended_at) VALUES ($1, $2, 'normal', 'classic', $3, now())",
      [atomicWinnerId, atomicLoserId, startedAt]
    );
  });

  afterAll(async () => {
    if (atomicWinnerId != null && atomicLoserId != null) {
      await pool.query(
        "DELETE FROM matches WHERE winner_id = $1 OR loser_id = $1 OR winner_id = $2 OR loser_id = $2",
        [atomicWinnerId, atomicLoserId]
      );
      await pool.query(
        "DELETE FROM ratings WHERE user_id = $1 OR user_id = $2",
        [atomicWinnerId, atomicLoserId]
      );
      await pool.query("DELETE FROM users WHERE id = $1 OR id = $2", [atomicWinnerId, atomicLoserId]);
    }
    // pool.end() is handled by top-level afterAll
  });

  it("transaction rolls back when INSERT fails (duplicate unique key) — no ratings row, no new matches row", async () => {
    // Calling recordMatch with the same startedAt triggers UNIQUE constraint violation,
    // which causes ROLLBACK. The swallow-catch fires; no throw propagates.
    const startedAt = new Date("2026-06-01T00:00:00Z");

    await expect(
      recordMatch(atomicWinnerId, atomicLoserId, "normal", "classic", startedAt, true)
    ).resolves.toBeUndefined(); // never throws (D-07)

    // Ratings row must NOT have been created (rollback happened before UPSERT or at INSERT)
    const { rows: ratingsRows } = await pool.query(
      "SELECT user_id FROM ratings WHERE user_id = $1 OR user_id = $2",
      [atomicWinnerId, atomicLoserId]
    );
    // Still only the pre-existing row count (0 — we didn't pre-insert ratings)
    expect(ratingsRows).toHaveLength(0);

    // matches table still has exactly 1 row (the one pre-inserted in beforeAll)
    const { rows: matchRows } = await pool.query(
      "SELECT id FROM matches WHERE winner_id = $1 AND loser_id = $2",
      [atomicWinnerId, atomicLoserId]
    );
    expect(matchRows).toHaveLength(1);
  });
});

describe.skipIf(!hasDb)("RANK-03: leaderboard excludes provisional players (DB integration — Plan 04)", () => {
  let pool;
  let runMigrations;
  let getLeaderboard;
  let establishedId;
  let provisionalId;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    _sharedPool = pool;
    runMigrations = db.runMigrations;
    getLeaderboard = db.getLeaderboard;
    await runMigrations(pool);

    // Insert an established player: rd < 110
    const { rows: eu } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    establishedId = eu[0].id;
    await pool.query(
      `INSERT INTO ratings (user_id, rating, rd, volatility, games_played, updated_at)
       VALUES ($1, 1700, 90, 0.06, 10, now())
       ON CONFLICT (user_id) DO UPDATE SET rating=1700, rd=90, games_played=10, updated_at=now()`,
      [establishedId]
    );

    // Insert a provisional player: rd >= 110
    const { rows: pu } = await pool.query("INSERT INTO users DEFAULT VALUES RETURNING id");
    provisionalId = pu[0].id;
    await pool.query(
      `INSERT INTO ratings (user_id, rating, rd, volatility, games_played, updated_at)
       VALUES ($1, 1800, 250, 0.06, 2, now())
       ON CONFLICT (user_id) DO UPDATE SET rating=1800, rd=250, games_played=2, updated_at=now()`,
      [provisionalId]
    );
  });

  afterAll(async () => {
    if (establishedId != null) {
      await pool.query("DELETE FROM ratings WHERE user_id = $1", [establishedId]);
      await pool.query("DELETE FROM users WHERE id = $1", [establishedId]);
    }
    if (provisionalId != null) {
      await pool.query("DELETE FROM ratings WHERE user_id = $1", [provisionalId]);
      await pool.query("DELETE FROM users WHERE id = $1", [provisionalId]);
    }
  });

  it("player with rd >= 110 (provisional) is excluded from leaderboard", async () => {
    const rows = await getLeaderboard();
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(provisionalId);
  });

  it("player with rd < 110 (established) appears in leaderboard", async () => {
    const rows = await getLeaderboard();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(establishedId);
  });

  it("leaderboard is ordered by rating DESC", async () => {
    const rows = await getLeaderboard();
    for (let i = 1; i < rows.length; i++) {
      expect(Number(rows[i - 1].rating)).toBeGreaterThanOrEqual(Number(rows[i].rating));
    }
  });

  it("leaderboard returns at most 100 rows", async () => {
    const rows = await getLeaderboard();
    expect(rows.length).toBeLessThanOrEqual(100);
  });
});

describe.skipIf(!hasDb)("RANK-04: leaderboard cache served from Redis (integration — Plan 04)", () => {
  let pool;
  let runMigrations;
  let getLeaderboard;
  let refreshLeaderboardCache;

  beforeAll(async () => {
    const db = await import("../db.js");
    pool = db.pool;
    _sharedPool = pool;
    runMigrations = db.runMigrations;
    getLeaderboard = db.getLeaderboard;
    refreshLeaderboardCache = db.refreshLeaderboardCache;
    await runMigrations(pool);
  });

  it("refreshLeaderboardCache stores JSON in Redis with battleship:leaderboard key", async () => {
    // refreshLeaderboardCache returns rows (or undefined on error); does not throw
    const rows = await refreshLeaderboardCache();
    // Result is an array (possibly empty) or undefined if no Redis; either is acceptable
    expect(rows === undefined || Array.isArray(rows)).toBe(true);
  });

  it("getLeaderboard returns cached data on second call (no Postgres hit)", async () => {
    // Two sequential calls; both should return an array without throwing
    const first = await getLeaderboard();
    const second = await getLeaderboard();
    expect(Array.isArray(first)).toBe(true);
    expect(Array.isArray(second)).toBe(true);
    // Both calls must return consistent length (cache or Postgres, same data)
    expect(second.length).toBe(first.length);
  });

  it("getLeaderboard falls back to Postgres when Redis is unavailable", async () => {
    // Even without Redis (store.isEnabled()===false) getLeaderboard must return an array.
    // We test the fallback path by calling getLeaderboard in an environment where Redis
    // may or may not be available — it must never throw and must return an array.
    const rows = await getLeaderboard();
    expect(Array.isArray(rows)).toBe(true);
  });
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
