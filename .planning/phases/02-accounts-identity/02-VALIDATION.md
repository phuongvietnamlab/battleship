---
phase: 2
slug: accounts-identity
status: draft
nyquist_compliant: true
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
| AUTH-05 | 5 | Facebook callback (valid state) creates/links a user | OAuth CSRF (Spoofing) | Forged/missing state rejected; dedup on FB id not email (D-20) | integration (mock FB) | `npm test` → `test/auth.test.js::facebook` | ❌ W0 | ⬜ pending |
| AUTH-05 | 5 | FB sign-in promotes/adopts guest via shared `linkOrPromoteAccount('facebook', …)` | Identity multiplied | Reuses D-06/D-07 txn, no duplicate user | unit/integration | `npm test` → `test/auth.test.js::facebook-link` | ❌ W0 | ⬜ pending |
| AUTH-06 | 6 | `createEmailAccount` stores bcrypt hash (cost ≥ 10), never plaintext | Credential theft (Info disclosure) | `password_hash` bcrypt, no plaintext column | unit | `npm test` → `test/auth.test.js::createEmailAccount` | ❌ W0 | ⬜ pending |
| AUTH-06 | 6 | `verifyEmailLogin` rejects bad creds without revealing which field | Account enumeration | Same `AUTH_FAILED` for unknown email vs wrong password | unit | `npm test` → `test/auth.test.js::verifyEmailLogin` | ❌ W0 | ⬜ pending |
| AUTH-06 | 7 | `POST /auth/login` sets `req.session.user_id` after `regenerate`+`req.login` | Session fixation (EoP) | Session id changes; user_id stamped post-regenerate | integration (DB-gated) | `npm test` → `test/auth.test.js::email-login-session` | ❌ W0 | ⬜ pending |
| AUTH-06 | 7 | `POST /auth/signup` + `/auth/login` are rate-limited | Brute-force (DoS/EoP) | Rapid attempts throttled (extends Phase-1 limiter) | integration | `npm test` → `test/auth.test.js::email-ratelimit` | ❌ W0 | ⬜ pending |
| AUTH-07 | 8 | `GET /auth/verify?token` flips `email_verified` (single-use token) | Verification-link tampering | Bad/expired/used token rejected; play never gated | integration | `npm test` → `test/auth.test.js::verify` | ❌ W0 | ⬜ pending |
| AUTH-07 | 8 | `mailer` no-ops + logs when `RESEND_API_KEY` unset (D-18) | — | Graceful degrade, no throw | unit | `npm test` → `test/auth.test.js::mailer-degrade` | ❌ W0 | ⬜ pending |
| AUTH-08 | 9 | `POST /auth/reset-request` is enumeration-safe | Account enumeration | Identical response for known/unknown email | integration | `npm test` → `test/auth.test.js::reset-request` | ❌ W0 | ⬜ pending |
| AUTH-08 | 9 | `POST /auth/reset` consumes single-use, time-limited token → new bcrypt hash | Reset-token replay/tampering | Token single-use + ≤1h expiry; sessions invalidated post-reset (D-47) | integration (DB-gated) | `npm test` → `test/auth.test.js::reset` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/auth.test.js` — stubs for SEC-05, AUTH-02, AUTH-03 (D-06/D-07), AUTH-04 (sign-out, sign-out-all)
- [ ] `test/profile.test.js` — stubs for PROF-01, PROF-02 (`GET /api/profile/:id` zero-state)
- [ ] `test/auth.test.js` — stubs for the new methods: AUTH-05 (facebook callback + link), AUTH-06 (`createEmailAccount`/`verifyEmailLogin`, email-login session, rate-limit), AUTH-07 (`/auth/verify`, mailer-degrade), AUTH-08 (`/auth/reset-request` enumeration-safe, `/auth/reset` single-use token). Stubs added in the wave that owns each (5–9), consistent with the Wave 0 stubbing pattern.
- [ ] `linkOrPromoteAccount()` exported (via `TEST_EXPORTS` or extracted to `db.js`) so the link transaction is unit-testable without the full Express stack; generalized to accept a provider arg (`google`/`facebook`/`email`) per 02-05
- [ ] Email token helpers (`createAuthToken`/`consumeAuthToken` or equivalent) and `mailer` exported for unit testing without live Resend
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
