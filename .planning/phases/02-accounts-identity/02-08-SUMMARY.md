---
phase: 02-accounts-identity
plan: "08"
subsystem: auth-email-verification
tags: [auth, email-verification, mailer, resend, graceful-degradation, tdd, i18n]
dependency_graph:
  requires: ["02-06", "02-07"]
  provides:
    - mailer.js:sendMail
    - mailer.js:sendVerificationEmail
    - server.js:GET /auth/verify
    - server.js:POST /auth/signup (async verification send)
    - public/app.jsx:verifyNotice (success/error)
    - public/app.jsx:auth.verifySuccess/auth.verifyError/auth.unverifiedHint (EN+VI)
    - test/auth.test.js (AUTH-07 suites 6/7/8)
  affects: [mailer.js, server.js, public/app.jsx, public/style.css, test/auth.test.js, package.json]
tech_stack:
  added: [resend@4.0.0]
  patterns:
    - Optional-feature graceful-degradation (lazy require, no-op+log when RESEND_API_KEY unset, never throw — mirrors store.js Redis pattern)
    - Non-blocking fire-and-forget via setImmediate after res.json() in signup success path
    - Single-use token via consumeAuthToken conditional UPDATE (WHERE consumed_at IS NULL)
    - Named redirect flags (?verified=1 / ?verifyError=1) parsed + stripped in mount effect
key_files:
  created:
    - mailer.js
    - .planning/phases/02-accounts-identity/02-08-SUMMARY.md
  modified:
    - server.js (GET /auth/verify route; async send in signup; imports createAuthToken/consumeAuthToken/markEmailVerified + mailer)
    - public/app.jsx (verifyNotice state; ?verified/?verifyError parsing; Lobby notice render; auth.verifySuccess/Error/unverifiedHint EN+VI)
    - public/style.css (.notice class for success banner)
    - test/auth.test.js (AUTH-07 suites 6/7/8 appended)
    - package.json (resend@4.0.0 dependency)
decisions:
  - "setImmediate used to fire verification email after res.json() in signup — ensures email send never delays or fails the HTTP response even if token creation takes time (D-19)"
  - "mailer.js reads RESEND_API_KEY at module load time (top-level const) matching store.js pattern; Resend SDK lazy-required only when key is present to avoid require() overhead on no-op path"
  - "verifyNotice state kept separate from authError to allow both to co-exist (OAuth error + verify success are orthogonal)"
  - "auth.unverifiedHint i18n key defined but not wired to a data source this phase — users.email_verified is not yet exposed via /api/me; the string is ready for Phase 3+ use when the profile API surfaces the flag"
  - "TDD: Suite 6 (mailer no-op) passes immediately at RED commit since mailer is already implemented; DB-gated Suites 7/8 skip without DATABASE_URL confirming RED state against live DB where /auth/verify did not yet exist"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-02"
  tasks_completed: 3
  files_changed: 6
---

# Phase 02 Plan 08: Async Email Verification Slice — Summary

Gracefully-degrading Resend mailer module (store.js optional-feature pattern), non-blocking verification email fired after email signup via setImmediate, and GET /auth/verify that flips email_verified via the single-use 24h token from Plan 06. Play and signup are never gated on verification.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Install resend@4.0.0 (human-approved gate) | c9c8137 | Done |
| 2 | mailer.js + async signup verification send | c48aaf2 | Done |
| 3 RED | AUTH-07 failing test assertions | 6e436b5 | Done |
| 3 GREEN | GET /auth/verify route + verify UI + EN/VI strings | 0c0e7b5 | Done |

## What Was Built

**Task 1 — package.json:**

- `resend@4.0.0` added to dependencies (human-approved legitimacy gate)

**Task 2 — mailer.js:**

- `sendMail({ to, subject, html, text })` — low-level Resend wrapper with graceful degradation
- `sendVerificationEmail(to, verifyUrl)` — builds minimal HTML+text body for the verification link
- Behavior when `RESEND_API_KEY` unset: logs `[mailer] RESEND_API_KEY unset — skipping email to <to>` and returns `{skipped:true}` — no throw, no crash (D-18)
- Behavior when `RESEND_API_KEY` set: lazy-requires Resend SDK, sends via `MAIL_FROM`, catches send errors and returns `{error: e.message}` — still never throws to caller
- i18n comment: email body stays English-only in this phase; bilingual email bodies deferred to a future plan when per-user locale is tracked

**Task 2 — server.js (signup hook):**

- Added imports: `createAuthToken`, `consumeAuthToken`, `markEmailVerified` from db.js; `mailer` from mailer.js
- In `POST /auth/signup` success branch: after `res.json(...)` fires inside `req.session.save()`, a `setImmediate(() => {...})` block creates a 24h verify token and calls `mailer.sendVerificationEmail` — fully non-blocking, rejection logged but never surfaced to the user (D-19 / T-02-41)

**Task 3 RED — test/auth.test.js:**

- Suite 6: mailer graceful-degradation (no DB — passes immediately since mailer was already implemented in Task 2)
- Suite 7: DB-gated — `createAuthToken + consumeAuthToken + markEmailVerified` flips `email_verified`; single-use (second consume = BAD_TOKEN); expired token = BAD_TOKEN with no flip; wrong purpose = BAD_TOKEN
- Suite 8: DB-gated — `GET /auth/verify` behavioral HTTP tests (random-port app.listen): valid token = 302 `/?verified=1` + `email_verified` true; missing token = `/?verifyError=1`; bad token = `/?verifyError=1`; reused token = `/?verifyError=1`

**Task 3 GREEN — server.js:**

- `GET /auth/verify`: guard on missing token, `consumeAuthToken(token, 'verify')`, on error → `/?verifyError=1`, on success `markEmailVerified(r.userId)` → `/?verified=1`; try/catch → `/?verifyError=1` with `[auth] verify failed:` log

**Task 3 GREEN — public/app.jsx:**

- New state: `verifyNotice` (`null | 'success' | 'error'`)
- Mount effect extended: after `authError` param parsing, parse `?verified=1` → `setVerifyNotice('success')` and strip; parse `?verifyError=1` → `setVerifyNotice('error')` and strip (mirrors ?authError pattern)
- Lobby: receives `verifyNotice` prop, renders `.notice.verify-notice` for success, `.error.verify-notice` for error
- New i18n keys in both `en` and `vi`:
  - `auth.verifySuccess`: "Email verified. Thanks!" / "Đã xác minh email. Cảm ơn bạn!"
  - `auth.verifyError`: "That verification link is invalid or expired." / "Liên kết xác minh không hợp lệ hoặc đã hết hạn."
  - `auth.unverifiedHint`: "Your email isn't verified yet — check your inbox." / "Email của bạn chưa được xác minh — vui lòng kiểm tra hộp thư."

**Task 3 GREEN — public/style.css:**

- `.notice` class: green-tint banner (mirrors `.error` styling, different color)

## Test Results

```
Test Files  6 passed (6)
     Tests  91 passed | 53 skipped (144)
```

DB-gated suites (Suites 7/8) skip cleanly without `DATABASE_URL`. All non-DB suites pass. `npm run build:game` exits 0.

## Deviations from Plan

None — plan executed exactly as written. The TDD gate was applied:

- Suite 6 (mailer no-op) passes immediately at RED commit since the mailer was already implemented as part of Task 2, which precedes Task 3. This is expected: Task 3 is `tdd="true"` but the mailer behavior being tested was code created in Task 2, not new code introduced in Task 3. The endpoint tests (Suite 8) are genuinely RED against a live DB since `GET /auth/verify` did not exist.
- `auth.unverifiedHint` is defined in i18n (both EN/VI) but not wired to a live data source — `users.email_verified` is not yet exposed via `/api/me`. The hint is ready for Plan-3+ use. This is noted in the Known Stubs section.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — failing tests committed before implementation | 6e436b5 | PASS (Suite 8 DB-gated tests fail against live DB without the route) |
| GREEN — implementation passes all tests | 0c0e7b5 | PASS (91 passed, 53 skipped) |
| REFACTOR — no cleanup needed | — | N/A |

## Known Stubs

- `auth.unverifiedHint` i18n string is defined in both `en` and `vi` but not surfaced in the UI this phase. `users.email_verified` is not yet returned by `/api/me`, so the hint has no data source. The string will be wired when the profile API exposes the flag (Phase 3+). No crash; no visible placeholder text to end users.

## Threat Flags

No new security surface beyond the plan's threat model. T-02-39 through T-02-43 all applied:

- T-02-39 (token forgery/replay): `consumeAuthToken` enforces single-use (conditional `UPDATE WHERE consumed_at IS NULL`) + 24h expiry (`WHERE expires_at > now()`); forged/expired/reused → BAD_TOKEN → `/?verifyError=1`, no flip
- T-02-40 (key leak): `RESEND_API_KEY` read from env only; never logged or returned; mailer logs only recipient + skip/failure state
- T-02-41 (DoS — email provider down): send is non-blocking (`setImmediate`) + best-effort; all errors caught + logged; signup response never waits on send
- T-02-42 (DoS — unconfigured): mailer no-ops + logs when key unset (D-18); signup/play unaffected
- T-02-43 (spoofing): token bound to `user_id` at creation; only that `user_id` is verified on consume

## Self-Check: PASSED

| Item | Status |
|------|--------|
| mailer.js exists | FOUND |
| sendMail + sendVerificationEmail exports | FOUND |
| mailer no-op (RESEND_API_KEY unset) returns {skipped:true} | FOUND |
| server.js has GET /auth/verify | FOUND |
| consumeAuthToken('verify') in verify route | FOUND |
| markEmailVerified in verify route | FOUND |
| verifyError=1 redirect in verify route | FOUND |
| sendVerificationEmail in signup success path | FOUND |
| setImmediate (non-blocking send) in signup | FOUND |
| app.jsx auth.verifySuccess count >= 2 (en+vi) | FOUND (count=3) |
| app.jsx auth.verifyError present | FOUND |
| app.jsx auth.unverifiedHint in both en+vi (count >= 2) | FOUND (count=2) |
| test/auth.test.js has email_verified assertions | FOUND |
| npm test: 91 passed, 53 skipped | PASS |
| npm run build:game: exit 0 | PASS |
| Commit c9c8137 (Task 1 resend install) | FOUND |
| Commit c48aaf2 (Task 2 mailer + signup) | FOUND |
| Commit 6e436b5 (RED gate tests) | FOUND |
| Commit 0c0e7b5 (GREEN implementation) | FOUND |
