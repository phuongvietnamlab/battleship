---
status: partial
phase: 02-accounts-identity
source: [02-VERIFICATION.md]
started: 2026-06-02T20:15:00Z
updated: 2026-06-02T20:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Google OAuth round-trip on deployed host (SEC-05 + AUTH-02 + AUTH-03)
expected: Guest plays instantly; clicking "Sign in with Google" completes the OAuth flow, lands signed-in; DevTools shows HttpOnly Secure SameSite=Lax cookie; prior guest clientId maps to the account (no duplicate users row).
result: [pending]

### 2. Facebook OAuth round-trip — including email-withheld account (AUTH-05 + SEC-05)
expected: Facebook sign-in completes; dedup by provider id (not email); an email-withheld FB test account signs in successfully; FB session is sign-out-all-able (user_id stamped).
result: [pending]

### 3. Sign out all devices revokes sessions on a second browser (AUTH-04)
expected: Sign in on browser A and B with same account; "Sign out all devices" in A causes B to be signed out on next request.
result: [pending]

### 4. Email verification end-to-end: signup -> receive email -> click link -> verified (AUTH-07)
expected: With RESEND_API_KEY + MAIL_FROM + APP_BASE_URL set: signup returns signed-in immediately (non-blocking); verification email arrives; clicking link redirects to /?verified=1 and shows localized success notice; second click shows verifyError.
result: [pending]

### 5. Password reset end-to-end: request -> receive email -> set new password (AUTH-08)
expected: Forgot password submits; same "reset link on its way" message for both registered and unregistered emails (no enumeration); clicking emailed link opens set-new form; new password works; old password fails; second link click returns "invalid or expired"; sign-out-all occurs on reset.
result: [pending]

### 6. Profile view for own account and another player's account (PROF-01 + PROF-02)
expected: Signed-in: avatar dropdown "View profile" shows display name, member-since, 0/0/0 stats with "No games yet"; other player's profile shows disabled Challenge button, no sign-out shortcut; non-integer id gives 400 in browser; unknown id shows "Player not found".
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
