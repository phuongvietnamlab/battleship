// scripts/season-reset.js — Season archive + soft-reset CLI (RANK-05)
//
// Usage: npm run season-reset -- "Season 2"
//        node scripts/season-reset.js "Season 2"
//
// Runs as a standalone Node CLI on the server box ONLY (D-13).
// There is NO HTTP / Express / Socket.IO surface in this file.
//
// In a single transaction:
//   1. INSERT a new seasons row (UNIQUE label = idempotency guard, Pitfall 5)
//   2. Archive all current ratings → rating_history (BEFORE any blend, D-12)
//   3. Soft-reset ratings toward 1500 (D-11: factor ~0.5, rd reset, volatility 0.06)
//
// Re-running with the same label fails at the UNIQUE(label) constraint and rolls
// back the entire transaction — no double-archive, no partial state.

"use strict";

const { pool } = require("../db");

const BLEND = 0.5;     // D-11: blend factor toward 1500 (~half-way)
const RESET_RD = 350;  // D-11: RD reset to "unrated" width so ratings move freely

// runSeasonReset is exported for testability (Task 2).
// main() calls it with the CLI arg and then drains the pool.
async function runSeasonReset(label) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: Insert the seasons row.
    // UNIQUE(label) constraint aborts here if the same label is re-used,
    // rolling back the whole transaction before any archive happens (Pitfall 5).
    const { rows: [season] } = await client.query(
      "INSERT INTO seasons (label, ended_at) VALUES ($1, now()) RETURNING id",
      [label]
    );

    // Step 2: Archive BEFORE blend (D-12). History is INSERT-only — never deleted.
    await client.query(
      `INSERT INTO rating_history
         (user_id, season_id, rating, rd, volatility, games_played, archived_at)
       SELECT user_id, $1, rating, rd, volatility, games_played, now()
         FROM ratings`,
      [season.id]
    );

    // Step 3: Soft-reset (D-11).
    //   new_rating  = 1500 + (old_rating - 1500) * BLEND
    //   rd          = RESET_RD
    //   volatility  = 0.06 (starting default)
    //   games_played = 0
    // BLEND and RESET_RD are bound as $1/$2 — no string concatenation (V5/T-04-18).
    await client.query(
      `UPDATE ratings SET
         rating       = 1500 + (rating - 1500) * $1,
         rd           = $2,
         volatility   = 0.06,
         games_played = 0,
         updated_at   = now()`,
      [BLEND, RESET_RD]
    );

    await client.query("COMMIT");
    console.log(`[season-reset] Season "${label}" archived and ratings soft-reset.`);
    return season.id;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[season-reset] FAILED — rolled back:", e.message);
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const label = process.argv[2] || `Season-${Date.now()}`;
  try {
    await runSeasonReset(label);
  } catch (e) {
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

module.exports = { runSeasonReset };
