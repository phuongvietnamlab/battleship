---
status: passed
phase: 01-foundation
source: [01-VERIFICATION.md]
started: 2026-06-02T00:00:00Z
updated: 2026-06-02T00:07:00Z
---

## Current Test

[complete — verified against local Postgres 16 Docker container (localhost:5433) as EC2 stand-in]

## Tests

### 1. Server connects to self-hosted Postgres via shared pool (DATA-01)
expected: With `DATABASE_URL` (or discrete `PG*` env vars) pointing at the EC2 Postgres, `node server.js` boots, logs the server-running line, and normal play (createRoom/joinRoom/fire/resume) issues queries that succeed without crashing. `upsertGuestCredential` writes exactly one `users` + one `credentials` row per clientId, and a returning guest creates NO additional `users` row (CR-02 fix — confirm `SELECT count(*) FROM users` is stable across reconnects).
result: PASSED (2026-06-02, local Postgres 16 Docker stand-in) — server booted, /healthz=ok, db.test.js 10/10 incl. CR-02 count test. Re-confirm against real EC2 before production deploy.

### 2. Database schema auto-migrates on server start (DATA-02)
expected: On a fresh database, starting the server applies `migrations/001_identity.sql` automatically (no manual SQL), creating `schema_migrations`, `users`, `credentials`. Restarting is idempotent (already-applied migration skipped). A deliberately broken migration makes boot fail loudly with `[db] migration failed on boot, exiting:` and a non-zero exit.
result: PASSED (2026-06-02, local Postgres 16 Docker stand-in) — fresh DB auto-migrated all 3 tables on boot, schema_migrations recorded 001_identity.sql, migrate.test.js 11/11 (idempotency + fail-loud). Re-confirm against real EC2 before production deploy.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
