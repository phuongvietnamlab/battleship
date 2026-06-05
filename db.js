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
const crypto = require("crypto");
const bcrypt = require("bcryptjs");


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
// Prevents stored-XSS when names are rendered in profiles (T-02-01).

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
// D-06: First-time OAuth sign-in (new externalId for provider) — promote the
//   guest users row by attaching a new provider credential to the existing
//   user_id, stamp guest_migrated_at. If no pendingClientId (rare: fresh
//   browser), create a new users row instead.
// D-07: Returning OAuth user (externalId already linked) — adopt the guest
//   credential by re-pointing it to the existing account's user_id.
//
// provider: 'google' | 'facebook' | 'email' — parameterized, never hardcoded.
// Dedup key: (provider, externalId) — NEVER email (D-20 / D-16).
//
// All SQL parameterized ($1/$2/...) — never string-concatenated (T-02-02).
// Transaction: BEGIN/COMMIT/ROLLBACK with pool.connect() release in finally.
// On error: logs + rethrows — caller (Passport verify callback) passes err to done(err).

async function linkOrPromoteAccount(provider, externalId, name, avatarUrl, pendingClientId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if this (provider, externalId) pair is already in credentials (D-07 path)
    const { rows: existing } = await client.query(
      "SELECT user_id FROM credentials WHERE type=$1 AND external_id=$2",
      [provider, externalId]
    );

    let userId;
    if (existing.length === 0) {
      // D-06: New provider credential — promote guest row if we have a pendingClientId
      if (pendingClientId) {
        const { rows: guest } = await client.query(
          "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
          [pendingClientId]
        );
        if (guest.length > 0) {
          userId = guest[0].user_id;
          // Attach provider credential to existing user_id; ON CONFLICT is idempotency guard
          await client.query(
            "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,$2,$3) ON CONFLICT (type, external_id) DO NOTHING",
            [userId, provider, externalId]
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
          "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,$2,$3)",
          [userId, provider, externalId]
        );
        const safeName = sanitizeDisplayName(name);
        await client.query(
          "UPDATE users SET display_name=$1, avatar_url=$2 WHERE id=$3",
          [safeName, avatarUrl, userId]
        );
      }
    } else {
      // D-07: Returning user — adopt guest credential into existing account
      userId = existing[0].user_id;
      if (pendingClientId) {
        await client.query(
          "UPDATE credentials SET user_id=$1 WHERE type='guest' AND external_id=$2",
          [userId, pendingClientId]
        );
      }
      // Update display_name/avatar_url in case they changed on the provider side
      const safeName = sanitizeDisplayName(name);
      await client.query(
        "UPDATE users SET display_name=$1, avatar_url=$2 WHERE id=$3",
        [safeName, avatarUrl, userId]
      );
    }

    // Phase 7: create wallet for signed-in user (idempotent)
    await createWallet(userId, client);

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

// ─── createEmailAccount ──────────────────────────────────────────────────────
// Creates an email/password account, promoting or adopting the guest row via
// linkOrPromoteAccount('email', ...) (D-06/D-07, reuse — no reimplementation).
//
// Returns the user row on success, or {error: 'WEAK_PASSWORD'} / {error: 'EMAIL_IN_USE'}.
// Never throws for validation failures — uses named error codes (CLAUDE.md convention).
//
// Security:
//   T-02-27: bcrypt cost 10 — password never stored as plaintext
//   T-02-29: min 8 chars enforced server-side (WEAK_PASSWORD)
//   T-02-32: EMAIL_IN_USE dedup via credentials UNIQUE(type='email', external_id)
//   T-02-31: all SQL parameterized — email bound as $1, never concatenated

async function createEmailAccount(email, password, pendingClientId) {
  // Guard: minimum password length (D-17 / T-02-29)
  if (typeof password !== "string" || password.length < 8) {
    return { error: "WEAK_PASSWORD" };
  }

  // Normalize email: trim + lowercase. This is the external_id stored in credentials.
  const normalizedEmail = (typeof email === "string" ? email : "").trim().toLowerCase();

  // Guard: duplicate email credential (T-02-32 / D-20)
  const { rows: existing } = await pool.query(
    "SELECT id FROM credentials WHERE type='email' AND external_id=$1",
    [normalizedEmail]
  );
  if (existing.length > 0) {
    return { error: "EMAIL_IN_USE" };
  }

  // Hash password (async bcrypt, cost 10 — never hashSync; T-02-27)
  const hash = await bcrypt.hash(password, 10);

  // Derive display name from email local-part (D-09)
  const localPart = normalizedEmail.split("@")[0] || normalizedEmail;
  const displayName = sanitizeDisplayName(localPart);

  // Promote guest row (or create new user) via the shared link transaction (D-06/D-07)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // linkOrPromoteAccount handles D-06/D-07 atomically; returns the user row
    // We call it directly using client queries embedded in our own transaction
    // by invoking the exported function (which manages its own connection).
    // To keep this in one transaction we replicate the core logic here using client.

    // Check if email credential already linked (race-safe — re-check under BEGIN)
    const { rows: raceCheck } = await client.query(
      "SELECT id FROM credentials WHERE type='email' AND external_id=$1",
      [normalizedEmail]
    );
    if (raceCheck.length > 0) {
      await client.query("ROLLBACK");
      return { error: "EMAIL_IN_USE" };
    }

    let userId;

    // D-06: promote existing guest row if pendingClientId is present
    if (pendingClientId) {
      const { rows: guest } = await client.query(
        "SELECT user_id FROM credentials WHERE type='guest' AND external_id=$1",
        [pendingClientId]
      );
      if (guest.length > 0) {
        userId = guest[0].user_id;
        await client.query(
          "INSERT INTO credentials (user_id, type, external_id) VALUES ($1,'email',$2) ON CONFLICT (type, external_id) DO NOTHING",
          [userId, normalizedEmail]
        );
        await client.query(
          "UPDATE credentials SET password_hash=$1 WHERE type='email' AND external_id=$2",
          [hash, normalizedEmail]
        );
        await client.query(
          "UPDATE users SET guest_migrated_at=now(), display_name=$1, email=$2, email_verified=false WHERE id=$3",
          [displayName, normalizedEmail, userId]
        );
      }
    }

    // No guest row resolved — create a brand-new users row
    if (!userId) {
      const { rows: newUser } = await client.query(
        "INSERT INTO users DEFAULT VALUES RETURNING id"
      );
      userId = newUser[0].id;
      await client.query(
        "INSERT INTO credentials (user_id, type, external_id, password_hash) VALUES ($1,'email',$2,$3)",
        [userId, normalizedEmail, hash]
      );
      await client.query(
        "UPDATE users SET display_name=$1, email=$2, email_verified=false WHERE id=$3",
        [displayName, normalizedEmail, userId]
      );
    }

    // Phase 7: create wallet for signed-in user (idempotent)
    await createWallet(userId, client);

    await client.query("COMMIT");

    const { rows } = await client.query(
      "SELECT id, display_name, avatar_url FROM users WHERE id=$1",
      [userId]
    );
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[db] createEmailAccount failed:", e.message);
    throw e;
  } finally {
    client.release();
  }
}

// ─── verifyEmailLogin ─────────────────────────────────────────────────────────
// Looks up the email credential and bcrypt-compares the password.
// Returns the user row on success, or {error: 'AUTH_FAILED'} for both
// unknown-email and wrong-password — identical response, no enumeration (T-02-28).
//
// T-02-28: uniform AUTH_FAILED; timing is ~constant (bcrypt.compare always runs
// when the credential row is found; missing-credential returns immediately —
// this is acceptable per plan: "no distinguishing message/timing branch").
// T-02-31: email parameterized as $1.

async function verifyEmailLogin(email, password) {
  const normalizedEmail = (typeof email === "string" ? email : "").trim().toLowerCase();

  // Look up credential + user in one join
  const { rows } = await pool.query(
    `SELECT c.password_hash, u.id, u.display_name, u.avatar_url
     FROM credentials c
     JOIN users u ON u.id = c.user_id
     WHERE c.type='email' AND c.external_id=$1`,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    return { error: "AUTH_FAILED" };
  }

  const row = rows[0];
  const match = await bcrypt.compare(
    typeof password === "string" ? password : "",
    row.password_hash || ""
  );
  if (!match) {
    return { error: "AUTH_FAILED" };
  }

  return { id: row.id, display_name: row.display_name, avatar_url: row.avatar_url };
}

// ─── createAuthToken ─────────────────────────────────────────────────────────
// Inserts a high-entropy, time-limited token into auth_tokens.
// Returns the raw token string. Caller is responsible for emailing it (AUTH-07/08).
//
// T-02-30: crypto.randomBytes(32) = 256-bit random hex; UNIQUE constraint;
//          single-use enforced at consume time; expiry via expires_at.
// T-02-31: all params bound as $1/$2/$3/$4 — no string concatenation.

async function createAuthToken(userId, purpose, ttlSeconds) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO auth_tokens (user_id, token, purpose, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)",
    [userId, token, purpose, String(ttlSeconds)]
  );
  return token;
}

// ─── consumeAuthToken ─────────────────────────────────────────────────────────
// Marks the token as consumed (single-use) and returns {userId} on success.
// Returns {error: 'BAD_TOKEN'} if the token is missing, already consumed, expired,
// or purpose doesn't match.
//
// T-02-30: conditional UPDATE (WHERE consumed_at IS NULL) prevents double-spend
//          under concurrent requests — only the first UPDATE wins (RETURNING row).

async function consumeAuthToken(token, purpose) {
  const { rows } = await pool.query(
    `UPDATE auth_tokens
     SET consumed_at = now()
     WHERE token = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > now()
     RETURNING user_id`,
    [token, purpose]
  );

  if (rows.length === 0) {
    return { error: "BAD_TOKEN" };
  }

  return { userId: rows[0].user_id };
}

// ─── markEmailVerified ────────────────────────────────────────────────────────
// Sets email_verified=true on the user row after a successful token verification.
// Called by the email-verification route (AUTH-07 / Plan 07).

async function markEmailVerified(userId) {
  await pool.query(
    "UPDATE users SET email_verified = true WHERE id = $1",
    [userId]
  );
}

// ─── recordMatch ─────────────────────────────────────────────────────────────
// Fire-and-forget, best-effort, single-transaction match writer (MATCH-01, D-07).
// Never throws — all errors are caught, logged with [match] prefix, and swallowed
// so a failing DB write can never block or break the end-game screen.

async function recordMatch(winnerId, loserId, reason, mode, startedAt, stake = 0) {
  // Graceful no-op guard: derive from poolConfig env vars (lines 22-32)
  if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE) {
    console.log("[match] DATABASE_URL not set — skipping match record");
    return;
  }

  // Reason taxonomy validation (D-02): reject unknown values before any DB round-trip
  const VALID_REASONS = ["normal", "timeout", "disconnect", "leave"];
  if (!VALID_REASONS.includes(reason)) {
    console.log("[match] invalid reason — skipping");
    return;
  }

  // Unresolvable-seat guard (D-04): matches FK is NOT NULL; skip rather than throw
  if (winnerId == null || loserId == null) {
    console.log("[match] unresolvable user_id — skipping");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // All values bound as $N — never string-concatenate (T-03-03 SQL-injection mitigation)
    const matchTs = startedAt || new Date();
    const matchCode = "match_" + Date.now() + "_" + winnerId;
    await client.query(
      "INSERT INTO matches (winner_id, loser_id, reason, mode, started_at, ended_at, stake) VALUES ($1, $2, $3, $4, $5, now(), $6)",
      [winnerId, loserId, reason, mode || "classic", matchTs, stake]
    );

    // Phase 7: wager payout — credit winner with 90% of pot
    if (stake > 0 && winnerId != null) {
      const pot = stake * 2;
      const payout = Math.floor(pot * 0.9); // 90% to winner, 10% system fee
      const { rows: wRows } = await client.query(
        "SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE",
        [winnerId]
      );
      if (wRows.length > 0) {
        const newBal = wRows[0].balance + payout;
        await client.query(
          "UPDATE wallets SET balance = $1, updated_at = now() WHERE user_id = $2",
          [newBal, winnerId]
        );
        await client.query(
          "INSERT INTO transactions (user_id, type, amount, balance_after, reference_id) VALUES ($1, 'wager_win', $2, $3, $4)",
          [winnerId, payout, newBal, matchCode]
        );
      }
    }

    await client.query("COMMIT");
    return { payout: stake > 0 ? Math.floor(stake * 2 * 0.9) : 0 };
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[match] recordMatch failed:", e.message);
    // Swallow — never rethrow (D-07)
  } finally {
    client.release();
  }
}

// ─── setEmailPassword ─────────────────────────────────────────────────────────
// Updates the password_hash on the email credential for a given user.
// Called by POST /auth/reset after a valid single-use reset token is consumed.
//
// Security:
//   T-02-46: minimum 8 chars enforced (WEAK_PASSWORD) — mirrors createEmailAccount
//   T-02-46: bcrypt cost 10 (async) — never hashSync
//   T-02-49: parameterized UPDATE — external_id never concatenated
//   D-20: only updates credentials WHERE type='email' — never touches google/facebook rows
//
// Returns {ok:true} on success.
// Returns {error:'WEAK_PASSWORD'} if newPassword < 8 chars (named code, not thrown).
// Returns {error:'AUTH_FAILED'} if no email credential exists for userId (no row updated).
// On DB error: console.error + rethrow (caller wraps in try/catch).

async function setEmailPassword(userId, newPassword) {
  // Guard: minimum password length (T-02-46 / D-17)
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return { error: "WEAK_PASSWORD" };
  }

  // Hash at same cost as createEmailAccount (cost 10, async — T-02-46 / T-02-27)
  const hash = await bcrypt.hash(newPassword, 10);

  try {
    const { rows } = await pool.query(
      "UPDATE credentials SET password_hash=$1 WHERE user_id=$2 AND type='email' RETURNING id",
      [hash, userId]
    );

    if (rows.length === 0) {
      // No email credential found for this user (guest-only, google-only, etc.)
      return { error: "AUTH_FAILED" };
    }

    return { ok: true };
  } catch (e) {
    console.error("[db] setEmailPassword failed:", e.message);
    throw e;
  }
}

// ─── linkEmailToUser ──────────────────────────────────────────────────────────
// Links an email address to an existing user account (Phase 11: LINK-01/02/03).
// Used by passkey-only accounts to enable cross-device email/password login.
// Does NOT hash a password — that's a separate step via set-password.
// Returns { ok: true } on success, or { error: 'INVALID_EMAIL' | 'EMAIL_IN_USE' | 'ALREADY_HAS_EMAIL' }.
async function linkEmailToUser(userId, email) {
  // Normalize email
  const normalizedEmail = (typeof email === "string" ? email : "").trim().toLowerCase();

  // Validate format
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { error: "INVALID_EMAIL" };
  }

  // Check uniqueness — same dedup as createEmailAccount (D-20)
  const { rows: existing } = await pool.query(
    "SELECT id FROM credentials WHERE type='email' AND external_id=$1",
    [normalizedEmail]
  );
  if (existing.length > 0) {
    return { error: "EMAIL_IN_USE" };
  }

  // Check user doesn't already have an email credential
  const { rows: ownEmail } = await pool.query(
    "SELECT id FROM credentials WHERE type='email' AND user_id=$1",
    [userId]
  );
  if (ownEmail.length > 0) {
    return { error: "ALREADY_HAS_EMAIL" };
  }

  // Link: insert email credential + update users.email (transaction)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO credentials (user_id, type, external_id) VALUES ($1, 'email', $2)",
      [userId, normalizedEmail]
    );
    await client.query(
      "UPDATE users SET email=$1 WHERE id=$2",
      [normalizedEmail, userId]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[db] linkEmailToUser failed:", e.message);
    throw e;
  } finally {
    client.release();
  }
}

// ─── Wallet helpers (Phase 7: Points Economy) ────────────────────────────────

async function getWalletBalance(userId) {
  if (!userId) return 0;
  const { rows } = await pool.query(
    "SELECT balance FROM wallets WHERE user_id = $1",
    [userId]
  );
  return rows.length > 0 ? rows[0].balance : 0;
}

async function debitWallet(userId, amount, type, referenceId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    if (rows.length === 0 || rows[0].balance < amount) {
      await client.query("ROLLBACK");
      return { ok: false, code: "INSUFFICIENT_BALANCE" };
    }
    const newBalance = rows[0].balance - amount;
    await client.query(
      "UPDATE wallets SET balance = $1, updated_at = now() WHERE user_id = $2",
      [newBalance, userId]
    );
    await client.query(
      "INSERT INTO transactions (user_id, type, amount, balance_after, reference_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, type, -amount, newBalance, referenceId]
    );
    await client.query("COMMIT");
    return { ok: true, balance: newBalance };
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[wallet] debitWallet failed:", e.message);
    return { ok: false, code: "WALLET_ERROR" };
  } finally {
    client.release();
  }
}

async function creditWallet(userId, amount, type, referenceId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "NO_WALLET" };
    }
    const newBalance = rows[0].balance + amount;
    await client.query(
      "UPDATE wallets SET balance = $1, updated_at = now() WHERE user_id = $2",
      [newBalance, userId]
    );
    await client.query(
      "INSERT INTO transactions (user_id, type, amount, balance_after, reference_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, type, amount, newBalance, referenceId]
    );
    await client.query("COMMIT");
    return { ok: true, balance: newBalance };
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[wallet] creditWallet failed:", e.message);
    return { ok: false, code: "WALLET_ERROR" };
  } finally {
    client.release();
  }
}

async function createWallet(userId, client) {
  // Creates wallet + signup_bonus in a single INSERT pair.
  // ON CONFLICT guards idempotency (user links multiple providers).
  const q = client || pool;
  await q.query(
    "INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [userId]
  );
  // Only insert signup_bonus if no prior bonus exists for this user
  await q.query(
    `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id)
     SELECT $1, 'signup_bonus', 500, 500, 'initial'
     WHERE NOT EXISTS (
       SELECT 1 FROM transactions WHERE user_id = $1 AND type = 'signup_bonus'
     )`,
    [userId]
  );
}

// ─── getUserById ──────────────────────────────────────────────────────────────
// Simple user lookup by ID — used by the user-loading middleware.
// Returns {id, display_name, avatar_url} or null.

async function getUserById(id) {
  if (!id) return null;
  try {
    const { rows } = await pool.query(
      "SELECT id, display_name, avatar_url FROM users WHERE id=$1", [id]
    );
    return rows[0] || null;
  } catch (e) {
    console.error("[db] getUserById failed:", e.message);
    return null;
  }
}

// ─── WebAuthn credential functions (Phase 8) ─────────────────────────────────

async function getWebAuthnCredentials(userId) {
  if (!userId) return [];
  const { rows } = await pool.query(
    "SELECT id, public_key, counter, transports FROM webauthn_credentials WHERE user_id=$1",
    [userId]
  );
  return rows;
}

async function getWebAuthnCredentialById(credentialId) {
  if (!credentialId) return null;
  const { rows } = await pool.query(
    "SELECT id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE id=$1",
    [credentialId]
  );
  return rows[0] || null;
}

async function saveWebAuthnCredential({ id, userId, publicKey, counter, transports, deviceName }) {
  await pool.query(
    `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports, device_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, publicKey, counter, transports || [], deviceName || null]
  );
}

async function updateWebAuthnCounter(credentialId, newCounter) {
  await pool.query(
    "UPDATE webauthn_credentials SET counter=$1 WHERE id=$2",
    [newCounter, credentialId]
  );
}

// ─── Match History (Phase 13) ─────────────────────────────────────────────────
async function getMatchHistory(userId, { result = "all", mode = "all", wager = "all" } = {}, page = 1, limit = 20) {
  if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE) {
    return { matches: [], total: 0, page, hasMore: false };
  }
  limit = Math.min(50, Math.max(1, limit));
  page = Math.max(1, page);
  const offset = (page - 1) * limit;

  const countRes = await pool.query(
    `SELECT COUNT(*) AS total FROM matches m
     WHERE (m.winner_id = $1 OR m.loser_id = $1)
       AND ($2 = 'all' OR ($2 = 'win' AND m.winner_id = $1) OR ($2 = 'loss' AND m.loser_id = $1))
       AND ($3 = 'all' OR m.mode = $3)
       AND ($4 = 'all' OR ($4 = 'has' AND m.stake > 0) OR ($4 = 'none' AND m.stake = 0))`,
    [userId, result, mode, wager]
  );
  const total = parseInt(countRes.rows[0].total, 10);

  const dataRes = await pool.query(
    `SELECT
       m.id,
       CASE WHEN m.winner_id = $1 THEN 'win' ELSE 'loss' END AS result,
       CASE WHEN m.winner_id = $1 THEN m.loser_id ELSE m.winner_id END AS opponent_id,
       u.display_name AS opponent_name,
       u.avatar_url AS opponent_avatar,
       m.stake,
       CASE WHEN m.winner_id = $1 THEN COALESCE(FLOOR(m.stake * 2 * 0.9), 0)
            ELSE -m.stake END AS points_delta,
       m.mode,
       m.reason,
       m.started_at,
       m.ended_at
     FROM matches m
     JOIN users u ON u.id = CASE WHEN m.winner_id = $1 THEN m.loser_id ELSE m.winner_id END
     WHERE (m.winner_id = $1 OR m.loser_id = $1)
       AND ($2 = 'all' OR ($2 = 'win' AND m.winner_id = $1) OR ($2 = 'loss' AND m.loser_id = $1))
       AND ($3 = 'all' OR m.mode = $3)
       AND ($4 = 'all' OR ($4 = 'has' AND m.stake > 0) OR ($4 = 'none' AND m.stake = 0))
     ORDER BY m.ended_at DESC
     LIMIT $5 OFFSET $6`,
    [userId, result, mode, wager, limit, offset]
  );

  const matches = dataRes.rows.map(r => ({
    id: r.id,
    result: r.result,
    opponent: { id: r.opponent_id, displayName: r.opponent_name, avatarUrl: r.opponent_avatar },
    stake: r.stake,
    pointsDelta: parseInt(r.points_delta, 10),
    mode: r.mode,
    reason: r.reason,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  }));

  return { matches, total, page, hasMore: offset + matches.length < total };
}

async function getUserStats(userId) {
  if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE) {
    return { wins: 0, losses: 0, gamesPlayed: 0, winRate: 0 };
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE winner_id = $1) AS wins
     FROM matches WHERE winner_id = $1 OR loser_id = $1`,
    [userId]
  );
  const total = parseInt(rows[0].total, 10);
  const wins = parseInt(rows[0].wins, 10);
  const losses = total - wins;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { wins, losses, gamesPlayed: total, winRate };
}

module.exports = {
  pool,
  runMigrations,
  upsertGuestCredential,
  linkOrPromoteAccount,
  sanitizeDisplayName,
  createEmailAccount,
  verifyEmailLogin,
  createAuthToken,
  consumeAuthToken,
  markEmailVerified,
  setEmailPassword,
  linkEmailToUser,
  recordMatch,
  getMatchHistory,
  getUserStats,
  getWalletBalance,
  debitWallet,
  creditWallet,
  createWallet,
  getUserById,
  getWebAuthnCredentials,
  getWebAuthnCredentialById,
  saveWebAuthnCredential,
  updateWebAuthnCounter,
};
