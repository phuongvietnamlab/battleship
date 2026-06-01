---
phase: 2
slug: accounts-identity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 |
| **Config file** | `vitest.config.js` (exists; `fileParallelism: false` set to avoid DB races) |
| **Quick run command** | `npm test` |
| **Full suite command** | `DATABASE_URL=<live-db> npm test` |
| **Estimated runtime** | ~2–5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `DATABASE_URL=<live-db> npm test` (includes DB-gated suites)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Req | Wave | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----|------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| SEC-05 | 1 | OAuth `state` nonce validated on callback | OAuth CSRF (Spoofing) | Forged/missing state rejected | integration | `npm test` → `test/auth.test.js` | ❌ W0 | ⬜ pending |
| SEC-05 | 1 | Session ID changes post-login (`regenerate`) | Session fixation (EoP) | New session id after `req.logIn` | unit | `npm test` → `test/auth.test.js` | ❌ W0 | ⬜ pending |
| AUTH-01 | 1 | Guest `createRoom`/`joinRoom` works with no session | — | Guest play unchanged | integration | `npm test` → `test/db.test.js` (no regression) | ✅ partial | ⬜ pending |
| AUTH-02 | 2 | OAuth callback (valid state) creates/links a user | Sub/email confusion (Spoofing) | Dedup on `sub` not email | integration (mock Google) | `npm test` → `test/auth.test.js` | ❌ W0 | ⬜ pending |
| AUTH-03 | 2 | First sign-in promotes guest row atomically (D-06) | — | Single txn, `guest_migrated_at` stamped | unit/integration | `npm test` → `test/auth.test.js::linkOrPromoteAccount` | ❌ W0 | ⬜ pending |
| AUTH-03 | 2 | Returning sub adopts guest credential, no dup user (D-07) | Identity multiplied | No duplicate `users` row | unit/integration | `npm test` → `test/auth.test.js::d07-adopt` | ❌ W0 | ⬜ pending |
| AUTH-04 | 2 | Sign-out destroys current session row | — | Current session gone | integration | `npm test` → `test/auth.test.js::signout` | ❌ W0 | ⬜ pending |
| AUTH-04 | 2 | Sign-out-all deletes all session rows for user_id | Sign-out-all race (EoP) | All user sessions gone | integration | `npm test` → `test/auth.test.js::signout-all` | ❌ W0 | ⬜ pending |
| PROF-01 | 3 | `GET /api/profile/:id` returns zero-state stats for self | — | 0 wins/0 losses scaffold | unit | `npm test` → `test/profile.test.js` | ❌ W0 | ⬜ pending |
| PROF-02 | 3 | `GET /api/profile/:id` for another user returns public fields only | Info disclosure | No private fields leaked | unit | `npm test` → `test/profile.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/auth.test.js` — stubs for SEC-05, AUTH-02, AUTH-03 (D-06/D-07), AUTH-04 (sign-out, sign-out-all)
- [ ] `test/profile.test.js` — stubs for PROF-01, PROF-02 (`GET /api/profile/:id` zero-state)
- [ ] `linkOrPromoteAccount()` exported (via `TEST_EXPORTS` or extracted to `db.js`) so the link transaction is unit-testable without the full Express stack
- [ ] No new fixtures — existing `test/db.test.js` `DATABASE_URL`-guard pattern is the template

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Google OAuth round-trip | AUTH-02 | Requires live Google Cloud OAuth app + browser redirect | Register OAuth app, click "Sign in with Google" on home menu, confirm redirect back signed-in |
| Cookie flags over HTTPS (EC2) | SEC-05 | `secure` cookie only set under TLS; localhost is http | Inspect Set-Cookie on deployed host: `HttpOnly; Secure; SameSite=Lax` |
| Persistence across browser restart | AUTH-04 | Browser session lifecycle | Sign in, close browser, reopen — still logged in (30-day rolling cookie) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
