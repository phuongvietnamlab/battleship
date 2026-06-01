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
        INSERT INTO users DEFAULT VALUES
        RETURNING id
      ),
      resolved_user AS (
        SELECT id FROM existing_user
        UNION ALL
        SELECT id FROM new_user
        WHERE NOT EXISTS (SELECT 1 FROM existing_user)
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

module.exports = { pool, runMigrations, upsertGuestCredential };
