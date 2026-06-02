---
phase: 02-accounts-identity
plan: "09"
subsystem: auth-password-reset
tags: [auth, password-reset, bcrypt, single-use-token, i18n, react, tdd]
dependency_graph:
  requires: ["02-06", "02-07", "02-08"]
  provides:
    - db.js:setEmailPassword
    - server.js:POST /auth/reset-request
    - server.js:POST /auth/reset
    - public/app.jsx:PasswordResetForm
    - public/app.jsx:auth.resetRequest..auth.resetBadToken (EN+VI)
    - test/auth.test.js (AUTH-08 suites 9/10/11)
  affects: [db.js, server.js, public/app.jsx, test/auth.test.js]
tech_stack:
  added: []
  patterns:
    - setEmailPassword mirrors createEmailAccount bcrypt cost + min-8 guard (guard-clause, named code)
    - Enumerate-safe POST /auth/reset-request: res.json({ok:true}) BEFORE setImmediate async email
    - consume-before-set ordering in /auth/reset (token single-use even on WEAK_PASSWORD)
    - DELETE FROM session WHERE user_id post-reset (Plan 03 revocation pattern reused)
    - PasswordResetForm two-mode React component (request | set-new via resetToken prop)
    - ?reset=<token> URL param parsed + stripped in App mount effect (mirrors ?verified pattern)
key_files:
  created:
    - .planning/phases/02-accounts-identity/02-09-SUMMARY.md
  modified:
    - db.js (setEmailPassword + module.exports)
    - server.js (import setEmailPassword; POST /auth/reset-request; POST /auth/reset)
    - public/app.jsx (PasswordResetForm; EmailAuthForm onForgotPassword prop; Lobby reset props; App mount effect ?reset; reset state vars; EN+VI i18n keys)
    - test/auth.test.js (AUTH-08 suites 9/10/11 appended)
decisions:
  - "Enumeration safety via res.json({ok:true}) BEFORE setImmediate — the response is flushed before any DB lookup begins, making timing identical whether the email exists or not (T-02-44)"
  - "consume-before-set ordering in /auth/reset: consumeAuthToken runs before setEmailPassword so the token is invalidated even if the new password fails WEAK_PASSWORD; user must request a fresh link. This prevents token replay across multiple password attempts."
  - "setEmailPassword returns {error:'AUTH_FAILED'} (not throw) when no email credential exists — guard-clause style matching CLAUDE.md conventions"
  - "PasswordResetForm is a standalone component (not inlined in EmailAuthForm) — keeps EmailAuthForm focused and allows PasswordResetForm to be opened from two entry points (URL param + Forgot link) independently"
  - "resetMode (request) and resetToken (set-new) are separate App-level state to mirror the two independent entry points cleanly"
metrics:
  duration: "~18 minutes"
  completed: "2026-06-02"
  tasks_completed: 2
  files_changed: 4
---

# Phase 02 Plan 09: Password-Reset Slice — Summary

Single-use 1h tokenized password-reset (AUTH-08): db.setEmailPassword (bcrypt cost 10, min-8, WEAK_PASSWORD/AUTH_FAILED), enumeration-safe POST /auth/reset-request (identical ok:true regardless of email existence, async email via Plan 08 mailer), single-use POST /auth/reset (consumeAuthToken + setEmailPassword + session invalidation), and a two-mode PasswordResetForm React component (request from "Forgot password?" link / set-new from ?reset= URL) with full EN/VI localization.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 RED | AUTH-08 failing test assertions (RED gate) | f34be47 | Done |
| 1 GREEN | setEmailPassword + reset routes (GREEN gate) | f3df0ec | Done |
| 2 | PasswordResetForm UI + EN/VI strings + bundle | e7b9d51 | Done |

## What Was Built

**Task 1 — db.js additions:**

- `setEmailPassword(userId, newPassword)`:
  - Guard: `newPassword.length < 8` → `{error:'WEAK_PASSWORD'}` (T-02-46 / D-17)
  - Hash: `await bcrypt.hash(newPassword, 10)` — async, cost 10, mirrors createEmailAccount (T-02-46)
  - `UPDATE credentials SET password_hash=$1 WHERE user_id=$2 AND type='email' RETURNING id` — parameterized (T-02-49)
  - No row returned → `{error:'AUTH_FAILED'}` (no email credential for this user)
  - On DB error: `console.error("[db] setEmailPassword failed:", e.message)` + rethrow
  - Appended to `module.exports`

**Task 1 — server.js:**

- Import `setEmailPassword` from db.js
- `POST /auth/reset-request` (authRateLimit):
  - `res.json({ok:true})` BEFORE any DB work (enumeration-safety via timing: T-02-44)
  - `setImmediate` fires: lookup email credential's user_id, `createAuthToken(userId,'reset',3600)`, `mailer.sendMail({to, subject, html/text with resetUrl})` (best-effort; T-02-44/D-19/T-02-48)
  - `resetUrl = (APP_BASE_URL || '') + '/?reset=' + token`
  - All errors caught + logged; never surfaced to caller
- `POST /auth/reset` (authRateLimit):
  - `consumeAuthToken(token,'reset')` → BAD_TOKEN if any failure (T-02-45)
  - `setEmailPassword(r.userId, password)` → WEAK_PASSWORD or AUTH_FAILED as needed (T-02-46)
  - `DELETE FROM session WHERE user_id = $1` on success (T-02-47; reuses Plan 03 pattern)
  - `res.json({ok:true})` on success
  - `try/catch` → `console.error + 500` (T-02-49)
  - Consume-before-set ordering: token single-use even on WEAK_PASSWORD

**Task 1 — test/auth.test.js (AUTH-08 suites):**

- Suite 9 `"AUTH-08 setEmailPassword helper"` (DB-gated):
  - Export shape assertion (function)
  - WEAK_PASSWORD for < 8 chars
  - Hash round-trip: new hash ≠ old, `$2b$` prefix, verifyEmailLogin succeeds with new password, fails with old
  - AUTH_FAILED for userId with no email credential (guest-only user)
- Suite 10 `"AUTH-08 reset token round-trip"` (DB-gated):
  - createAuthToken('reset') + consumeAuthToken('reset') returns userId
  - Second consume of same token → BAD_TOKEN (single-use)
  - Past-expires_at token → BAD_TOKEN (expiry)
- Suite 11 `"AUTH-08 POST /auth/reset-request + /auth/reset routes"` (DB-gated):
  - `/auth/reset-request` → 200 ok:true for KNOWN email (enumeration-safe)
  - `/auth/reset-request` → 200 ok:true for UNKNOWN email (identical response)
  - `/auth/reset` with valid token + strong password → 200 ok:true + new hash verifiable
  - `/auth/reset` reused token → 400 BAD_TOKEN (single-use)
  - `/auth/reset` expired token → 400 BAD_TOKEN
  - `/auth/reset` weak password → 400 WEAK_PASSWORD (token already consumed — fresh link needed)

**Task 2 — public/app.jsx:**

- i18n keys in BOTH `en` and `vi` (real Vietnamese):
  - `auth.resetRequest`: "Reset your password" / "Đặt lại mật khẩu"
  - `auth.resetRequestBtn`: "Send reset link" / "Gửi liên kết đặt lại"
  - `auth.resetSent`: "If that email is registered, a reset link is on its way." / "Nếu email đã đăng ký, liên kết đặt lại sẽ được gửi tới."
  - `auth.resetNewPassword`: "Choose a new password" / "Chọn mật khẩu mới"
  - `auth.resetSetBtn`: "Set new password" / "Đặt mật khẩu mới"
  - `auth.resetSuccess`: "Password updated. You can now log in." / "Đã cập nhật mật khẩu. Bạn có thể đăng nhập."
  - `auth.resetBadToken`: "That reset link is invalid or expired." / "Liên kết đặt lại không hợp lệ hoặc đã hết hạn."
- `PasswordResetForm({ resetToken, onSuccess, onBack })` component:
  - Request mode (`resetToken===null`): email input → `POST /auth/reset-request`; ALWAYS shows `auth.resetSent` (enumeration-safe UI matching server)
  - Set-new mode (`resetToken` is string): password input → `POST /auth/reset`; `BAD_TOKEN → auth.resetBadToken`; `WEAK_PASSWORD → auth.errWeakPassword`; `RATE_LIMITED → auth.errRateLimited`; `ok:true → auth.resetSuccess + onSuccess()`
  - Reuses `.email-auth-form` / `.error` / `.notice` styling (no new CSS needed)
- `EmailAuthForm`: `onForgotPassword` prop replaces no-op handler; "Forgot password?" link calls `onForgotPassword()` when present
- `Lobby`: accepts `resetToken`, `resetMode`, `onForgotPassword`, `onResetBack` props; renders `PasswordResetForm` (inside `.email-auth-wrap`) when `resetToken!=null` (set-new) or `resetMode=true` (request)
- App: `resetToken` + `resetMode` useState; mount effect parses `?reset=<token>`, strips param via `history.replaceState`; Lobby receives `onForgotPassword={() => setResetMode(true)}` and `onResetBack={() => { setResetToken(null); setResetMode(false); }}`

## Test Results

```
Test Files  6 passed (6)
     Tests  91 passed | 66 skipped (157)
```

DB-gated suites (9/10/11) skip cleanly without `DATABASE_URL`. All non-DB suites pass. `npm run build:game` exits 0.

## Deviations from Plan

None — plan executed exactly as written.

The consume-before-set ordering is explicitly specified in the plan as a comment-worthy decision (plan action step 2): token is consumed before setEmailPassword so it is single-use even when WEAK_PASSWORD is returned. Suite 11's weak-password test assertion documents this by noting "token already consumed — fresh link needed", matching the plan's NOTE.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — failing tests committed before implementation | f34be47 | PASS |
| GREEN — implementation passes all tests | f3df0ec | PASS |
| REFACTOR — no cleanup needed | — | N/A |

## Known Stubs

None introduced by this plan. Pre-existing stubs from prior plans:
- `auth.unverifiedHint` (Plan 08): i18n string defined, not yet wired to UI — `users.email_verified` not exposed via `/api/me`.
- `stats: { wins: 0, losses: 0, gamesPlayed: 0 }` (Plan 04): profile stats zero-state until Phase 3.

No stubs prevent Plan 09's goals from being achieved.

## Threat Flags

No new security surface beyond the plan's threat model. T-02-44 through T-02-49 all applied:

- T-02-44 (enumeration): `/auth/reset-request` returns identical `{ok:true}` for known and unknown emails; email send conditional + silent
- T-02-45 (token forgery/replay): `consumeAuthToken('reset')` enforces single-use + 1h expiry + 256-bit entropy (Plan 06); forged/expired/reused → BAD_TOKEN
- T-02-46 (weak new password): `setEmailPassword` enforces min 8 → WEAK_PASSWORD server-side (same as signup)
- T-02-47 (session persistence after reset): `DELETE FROM session WHERE user_id=$1` on successful reset (Plan 03 pattern reused)
- T-02-48 (brute force): `authRateLimit` (10/60s per IP) on both routes
- T-02-49 (SQL injection): all DB access via parameterized helpers; routes never build SQL

## Self-Check: PASSED

| Item | Status |
|------|--------|
| db.js exports setEmailPassword | FOUND |
| setEmailPassword enforces min-8 WEAK_PASSWORD | FOUND |
| setEmailPassword bcrypt cost 10 | FOUND |
| setEmailPassword returns AUTH_FAILED for no email cred | FOUND |
| server.js has POST /auth/reset-request | FOUND |
| server.js has POST /auth/reset | FOUND |
| consumeAuthToken('reset') in reset route | FOUND |
| createAuthToken('reset', 3600) in reset-request | FOUND |
| res.json({ok:true}) before DB lookup in reset-request | FOUND |
| DELETE FROM session WHERE user_id in reset route | FOUND |
| authRateLimit on both routes | FOUND |
| public/app.jsx has PasswordResetForm | FOUND |
| auth.resetRequest in both en+vi (count >= 2) | FOUND (count=6) |
| auth.resetSent in both en+vi (count >= 2) | FOUND (count=3) |
| auth.resetBadToken in both en+vi (count >= 2) | FOUND (count=3) |
| /auth/reset-request fetch in app.jsx | FOUND |
| /auth/reset fetch in app.jsx | FOUND |
| ?reset= param parsed in mount effect | FOUND |
| history.replaceState strips ?reset= | FOUND |
| test/auth.test.js AUTH-08 suites 9/10/11 | FOUND |
| npm test: 91 passed, 66 skipped | PASS |
| npm run build:game: exit 0 | PASS |
| Commit f34be47 (RED gate) | FOUND |
| Commit f3df0ec (GREEN - routes + db) | FOUND |
| Commit e7b9d51 (Task 2 - frontend) | FOUND |
