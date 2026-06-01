---
status: partial
phase: 01-foundation
source: [01-VERIFICATION.md]
started: 2026-06-02T00:00:00Z
updated: 2026-06-02T00:00:00Z
---

## Current Test

[awaiting human testing against live EC2 Postgres]

## Tests

### 1. Server connects to self-hosted Postgres via shared pool (DATA-01)
expected: With `DATABASE_URL` (or discrete `PG*` env vars) pointing at the EC2 Postgres, `node server.js` boots, logs the server-running line, and normal play (createRoom/joinRoom/fire/resume) issues queries that succeed without crashing. `upsertGuestCredential` writes exactly one `users` + one `credentials` row per clientId, and a returning guest creates NO additional `users` row (CR-02 fix — confirm `SELECT count(*) FROM users` is stable across reconnects).
result: [pending]

### 2. Database schema auto-migrates on server start (DATA-02)
expected: On a fresh database, starting the server applies `migrations/001_identity.sql` automatically (no manual SQL), creating `schema_migrations`, `users`, `credentials`. Restarting is idempotent (already-applied migration skipped). A deliberately broken migration makes boot fail loudly with `[db] migration failed on boot, exiting:` and a non-zero exit.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
