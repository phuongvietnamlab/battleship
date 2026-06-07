#!/usr/bin/env node
// scripts/admin-create.js — CLI to bootstrap the first super_admin user.
// Usage: npm run admin:create <email>
//
// Promotes an existing user (looked up by email credential) to super_admin.
// Must register an account first (email/password or OAuth) before running this.

const { pool, runMigrations } = require("../db");

(async () => {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npm run admin:create <email>");
    console.error("Example: npm run admin:create admin@example.com");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Ensure all migrations (including 009_admin.sql) are applied
    await runMigrations(pool);

    // Find user by email credential
    const { rows: creds } = await pool.query(
      "SELECT user_id FROM credentials WHERE type='email' AND external_id=$1",
      [normalizedEmail]
    );

    if (creds.length === 0) {
      console.error(`Error: No user found with email "${normalizedEmail}".`);
      console.error("Register an account first, then re-run this command.");
      process.exit(1);
    }

    const userId = creds[0].user_id;

    // Check if already has an active admin role
    const { rows: existing } = await pool.query(
      "SELECT role FROM admin_roles WHERE user_id=$1 AND revoked_at IS NULL",
      [userId]
    );

    if (existing.length > 0) {
      console.log(`User "${normalizedEmail}" already has role: ${existing[0].role}`);
      process.exit(0);
    }

    // Promote to super_admin
    await pool.query(
      "INSERT INTO admin_roles (user_id, role, granted_by, granted_at) VALUES ($1, 'super_admin', $1, now())",
      [userId]
    );

    console.log(`Success: "${normalizedEmail}" promoted to super_admin`);
  } catch (e) {
    console.error("Failed:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
