// db.js — shared Postgres pool + migration runner + guest-credential upsert.
//
// Postgres is a HARD dependency (identity is core, not optional). Connection
// failures surface loudly — no graceful no-op fallback. See store.js for the
// analogous optional Redis pattern.
//
// Config priority:
//   1. DATABASE_URL  — full connection string (e.g. postgres://user:pass@host/db)
//   2. Discrete PG*  — PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
//
// SSL: off for localhost EC2; set PG_SSL=true for remote/TLS connections.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const sslConfig =
  process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: sslConfig, max: 10 }
  : {
      host: process.env.PGHOST || "localhost",
      port: parseInt(process.env.PGPORT || "5432", 10),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: sslConfig,
      max: 10,
    };

const pool = new Pool(poolConfig);

pool.on("error", (e) => console.error("[db] pool error:", e.message));

// ─── Migration runner ────────────────────────────────────────────────────────
// Applies numbered SQL files in migrations/ lexically.
// Fail-loud: no try/catch here — a bad migration must abort boot (DATA-02).

async function runMigrations(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexical sort = numeric order given 001_, 002_ prefixes

  const { rows } = await p.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await p.query(sql);
    await p.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    console.log(`[db] migration applied: ${file}`);
  }
}

// ─── Guest-credential upsert ─────────────────────────────────────────────────
// Fire-and-forget from connect handlers. A DB failure must never block guest play.
//
// SQL is parameterized — clientId bound as $1, never string-concatenated (T-01-02).
// CTE ensures one users row + one credentials row per clientId, idempotent via
// ON CONFLICT (type, external_id) DO NOTHING.

async function upsertGuestCredential(clientId) {
  if (!clientId) return;
  try {
    await pool.query(
      `
      WITH existing_user AS (
        SELECT u.id
        FROM users u
        JOIN credentials c ON c.user_id = u.id
        WHERE c.type = 'guest' AND c.external_id = $1
        LIMIT 1
      ),
      new_user AS (
        -- Conditional INSERT: a data-modifying CTE always executes once, so
        -- guard the row creation itself with WHERE NOT EXISTS. INSERT...SELECT
        -- (not DEFAULT VALUES) inserts zero rows for a returning guest, so no
        -- orphaned users row leaks on reconnect (CR-02). id auto-generates;
        -- guest_migrated_at stays NULL.
        INSERT INTO users (created_at)
        SELECT now()
        WHERE NOT EXISTS (SELECT 1 FROM existing_user)
        RETURNING id
      ),
      resolved_user AS (
        SELECT id FROM existing_user
        UNION ALL
        SELECT id FROM new_user
        LIMIT 1
      )
      INSERT INTO credentials (user_id, type, external_id)
      SELECT id, 'guest', $1 FROM resolved_user
      ON CONFLICT (type, external_id) DO NOTHING
      `,
      [clientId]
    );
  } catch (e) {
    console.error("[db] upsertGuestCredential failed:", e.message);
    // Non-fatal: guest play continues even if DB write fails (T-01-A1).
  }
}

// ─── HTML escape helper ──────────────────────────────────────────────────────
// Copied from server.js — flat-structure per CLAUDE.md, no shared barrel/util.
// Prevents stored-XSS when names are rendered in profiles/leaderboards (T-02-01).

function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── sanitizeDisplayName ─────────────────────────────────────────────────────
// Mirrors sanitizeProfile name logic in server.js (D-09 / T-02-01).
// Strip control chars, collapse whitespace, cap at 40 chars, HTML-escape.
// Returns null for non-string input so callers can store NULL safely.

function sanitizeDisplayName(name) {
  if (typeof name !== "string") return null;
  return escapeHtml(
    name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)
  );
}

// ─── linkOrPromoteAccount ────────────────────────────────────────────────────
// D-06: First-time Google sign-in (new sub) — promote the guest users row by
//   attaching a new google credential to the existing user_id, stamp guest_migrated_at.
//   If no pendingClientId (rare: fresh browser), create a new users row instead.
// D-07: Returning Google user (sub already linked) — adopt the guest credential
//   by re-pointing it to the existing Google account's user_id.
//
// All SQL parameterized ($1/$2/...) — never string-concatenated (T-02-02).
// Transaction: BEGIN/COMMIT/ROLLBACK with pool.connect() release in finally.
// On error: logs + rethrows — caller (Passport verify callback) passes err to done(err).

async function linkOrPromoteAccount(sub, name, avatarUrl, pendingClientId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if this Google sub is already in credentials (D-07 path)
    const { rows: existing } = await client.query(
      "SELECT user_id FROM credentials WHERE type='google' AND external_id=$1",
      [sub]
    );

    let userId;
    if (existing.length === 0) {
      // D-06: New Google sub — promote guest row if we have a pendingClientId
      if (pendingClientId) {
        const { rows: guest } = await client.query(
          "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
          [pendingClientId]
        );
        if (guest.length > 0) {
          userId = guest[0].user_id;
          // Attach google credential to existing user_id; ON CONFLICT is idempotency guard
          await client.query(
            "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,'google',$2) ON CONFLICT (type, external_id) DO NOTHING",
            [userId, sub]
          );
          const safeName = sanitizeDisplayName(name);
          await client.query(
            "UPDATE users SET guest_migrated_at=now(), display_name=$1, avatar_url=$2 WHERE id=$3",
            [safeName, avatarUrl, userId]
          );
        }
      }
      // If no guest clientId resolved (rare: brand-new user with no prior guest session)
      if (!userId) {
        const { rows: newUser } = await client.query(
          "INSERT INTO users DEFAULT VALUES RETURNING id"
        );
        userId = newUser[0].id;
        await client.query(
          "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,'google',$2)",
          [userId, sub]
        );
        const safeName = sanitizeDisplayName(name);
        await client.query(
          "UPDATE users SET display_name=$1, avatar_url=$2 WHERE id=$3",
          [safeName, avatarUrl, userId]
        );
      }
    } else {
      // D-07: Returning Google user — adopt guest credential into existing account
      userId = existing[0].user_id;
      if (pendingClientId) {
        await client.query(
          "UPDATE credentials SET user_id=$1 WHERE type='guest' AND external_id=$2",
          [userId, pendingClientId]
        );
      }
      // Update display_name/avatar_url in case they changed on the Google side
      const safeName = sanitizeDisplayName(name);
      await client.query(
        "UPDATE users SET display_name=$1, avatar_url=$2 WHERE id=$3",
        [safeName, avatarUrl, userId]
      );
    }

    await client.query("COMMIT");

    const { rows } = await client.query(
      "SELECT id, display_name, avatar_url FROM users WHERE id=$1",
      [userId]
    );
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[db] linkOrPromoteAccount failed:", e.message);
    throw e; // fatal — Passport verify callback must call done(err)
  } finally {
    client.release();
  }
}

module.exports = { pool, runMigrations, upsertGuestCredential, linkOrPromoteAccount, sanitizeDisplayName };
