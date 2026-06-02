---
phase: 02-accounts-identity
plan: "05"
subsystem: auth-oauth
tags: [auth, passport, facebook-oauth, express-session, react, i18n]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides:
    - server.js:passport-facebook-strategy
    - server.js:auth-facebook-routes
    - server.js:onFacebookCallbackSuccess
    - db.js:linkOrPromoteAccount-provider-parameterized
    - public/app.jsx:FacebookSignInButton
    - public/app.jsx:auth.signInFacebook-i18n
    - public/style.css:facebook-signin
  affects: [server.js, db.js, public/app.jsx, public/style.css, test/auth.test.js, package.json]
tech_stack:
  added: [passport-facebook@3.0.0]
  patterns:
    - FacebookStrategy (state:true, passReqToCallback:true, dedup by profile.id never email)
    - provider-parameterized linkOrPromoteAccount — same transaction for google/facebook/email
    - onFacebookCallbackSuccess mirrors onGoogleCallbackSuccess (stamp user_id -> save -> redirect)
    - authRateLimit on /auth/facebook + /auth/facebook/callback (T-02-25)
key_files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - db.js
    - server.js
    - public/app.jsx
    - public/style.css
    - test/auth.test.js
decisions:
  - "linkOrPromoteAccount signature changed to (provider, externalId, name, avatarUrl, pendingClientId) — provider bound as $1/$2 parameterized SQL (never string-concat); existing Google and all test call sites updated in the same commit"
  - "FacebookStrategy guarded by FACEBOOK_CLIENT_ID env var presence (mirrors Google WR-01 pattern — prevents OAuth2Strategy constructor throw on test imports)"
  - "Email intentionally excluded from FB profileFields scope — dedup is (type='facebook', external_id=profile.id) per D-20; email-less accounts sign in correctly"
  - "onFacebookCallbackSuccess is a named function (not inline arrow) matching the Plan 02 pattern, so future plans can extend it without re-parsing"
metrics:
  duration: "12 minutes"
  completed: "2026-06-02"
  tasks_completed: 3
  files_changed: 7
---

# Phase 02 Plan 05: Facebook OAuth Sign-in Vertical Slice — Summary

Facebook OAuth sign-in end-to-end: provider-parameterized linkOrPromoteAccount, FacebookStrategy with state nonce + session-regeneration, /auth/facebook routes with authRateLimit, onFacebookCallbackSuccess stamping session user_id before save, and the FacebookSignInButton in the Lobby with bilingual EN/VI strings.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Package legitimacy gate + install passport-facebook | 5b6f57c | Done |
| 2 | Generalize linkOrPromoteAccount + Facebook strategy + /auth/facebook routes | df1c75a | Done |
| 3 | Facebook sign-in button + EN/VI strings (public/app.jsx + style.css) | 5eae685 | Done |

## What Was Built

**Task 1 — passport-facebook install (package.json + package-lock.json):**
- passport-facebook@3.0.0 installed after human legitimacy approval (Jared Hanson, npm since ~2011)
- passport core at 0.7.0 (>= 0.6 requirement satisfied — automatic session.regenerate on req.logIn)
- No application code changes in this task

**Task 2 — db.js + server.js + test/auth.test.js:**
- `db.js: linkOrPromoteAccount` signature generalized from `(sub, name, avatarUrl, pendingClientId)` to `(provider, externalId, name, avatarUrl, pendingClientId)`. All credential SQL uses bound params `$1/$2` for `type`/`external_id` — zero hardcoded `'google'` literals remain in the function body (D-14/T-02-02).
- `server.js`: Added `const { Strategy: FacebookStrategy } = require("passport-facebook")` import.
- `server.js`: FacebookStrategy registered under `if (process.env.FACEBOOK_CLIENT_ID)` guard (WR-01 test-import safety). Config: `state: true` (T-02-21), `passReqToCallback: true`, `profileFields: ["id","displayName","photos"]`, `scope: ["email"]`. Verify callback: `externalId = profile.id` (dedup key), email intentionally NOT used (D-16/D-20/T-02-23), `linkOrPromoteAccount('facebook', ...)`, never persists `accessToken` (T-02-24).
- `server.js`: No second `passport.serializeUser`/`passport.deserializeUser` — the existing provider-agnostic pair is reused.
- `server.js`: Google verify callback updated to pass `'google'` as the new first argument (Google flow preserved).
- `server.js`: `GET /auth/facebook` route behind `authRateLimit`: saves `pendingClientId` then `req.session.save()` before OAuth redirect (PITFALLS #1).
- `server.js`: `GET /auth/facebook/callback` route behind `authRateLimit`, with `passport.authenticate('facebook', { failureRedirect: '/?authError=1' })` then named `onFacebookCallbackSuccess(req, res)`.
- `server.js`: `onFacebookCallbackSuccess` — stamps `req.session.user_id = req.user.id` BEFORE `req.session.save`; `res.redirect('/')` fires ONLY inside the save callback (T-02-26 — mirrors Plan 03's Google handler).
- `test/auth.test.js`: All 9 `linkOrPromoteAccount` call sites updated to new `(provider, ...)` signature (passing `'google'` as first arg).

**Task 3 — public/app.jsx + public/style.css:**
- I18N: added `auth.signInFacebook` to both `en` ("Sign in with Facebook") and `vi` ("Đăng nhập bằng Facebook") blocks (D-13 bilingual contract; count=4 occurrences across both blocks + component).
- `FacebookSignInButton({ clientId, disabled, onDisable })` component: inline 18x18 Facebook "f" logo SVG, `button.btn.facebook-signin`, `aria-label` from `t('auth.signInFacebook')`, navigates to `/auth/facebook?clientId=...`, disabled guard mirrors `GoogleSignInButton`.
- `Lobby` renders `FacebookSignInButton` directly below `GoogleSignInButton` (8px gap), inside `{!authUser && ...}` block (D-21: two prominent OAuth buttons stacked; AUTH-01: guests see both buttons, signed-in users see neither).
- `public/style.css`: `.btn.facebook-signin` — `background: #1877f2`, `color: #ffffff`, `border-radius: 12px`, `50px` height, `16px/600` Be Vietnam Pro mixed-case, `.facebook-logo` 18x18 with `8px` gap, `hover filter brightness(1.04)`, `disabled opacity .5 / cursor not-allowed`, `focus-visible outline 2px var(--gold)`. No shimmer on brand button.
- Client bundle rebuilt: `npm run build:game` → `dist/app.js`.

## Test Results

```
Test Files  6 passed (6)
     Tests  83 passed | 24 skipped (107)
```

DB-gated suites skip cleanly without `DATABASE_URL`. All non-DB suites pass. Guest regression (AUTH-01) confirmed: `createRoom`/`joinRoom` handlers untouched.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The plan's automated verify regex for `onFacebookCallbackSuccess` (`/req\.session\.save\s*\(\s*\(?\s*\)?\s*=>\s*res\.redirect\(['\x22]\/['\x22]\)/`) did not match because the handler includes an error-check branch before the redirect (matching the identical pattern in `onGoogleCallbackSuccess`). The implementation is functionally correct: `user_id` is stamped before `session.save`, and `res.redirect('/')` fires inside the save callback. This is the correct behavior per T-02-26 and D-05.

## Known Stubs

None — all functionality is fully implemented. The Facebook OAuth flow requires FACEBOOK_CLIENT_ID/SECRET/CALLBACK_URL env vars to activate the strategy; without them the strategy is skipped (WR-01 guard) and the routes return errors if called.

## Threat Flags

No new security-relevant surface beyond the plan's threat model. All T-02-21 through T-02-26 and T-02-SC mitigations applied:

- T-02-21 (OAuth CSRF): `state: true` nonce per flow via FacebookStrategy
- T-02-22 (session fixation): Passport 0.7.0 automatic `session.regenerate()` at `req.logIn()`
- T-02-23 (email as identity key): dedup strictly on `(type='facebook', external_id=profile.id)`; email never used
- T-02-24 (access_token leak): verify callback never stores `accessToken`; `serializeUser` writes only `users.id`
- T-02-25 (DoS on auth routes): `authRateLimit` (10/60s per IP) applied to both `/auth/facebook` routes
- T-02-26 (unstamped user_id): `onFacebookCallbackSuccess` stamps `req.session.user_id` before `session.save`
- T-02-SC (supply chain): passport-facebook legitimacy gate (Task 1 human approval)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| package.json includes passport-facebook | FOUND |
| passport core 0.7.0 (>=0.6) | PASS |
| db.js linkOrPromoteAccount(provider, ...) signature | FOUND |
| No hardcoded 'google' in linkOrPromoteAccount SQL | PASS |
| server.js FacebookStrategy with state:true | FOUND |
| server.js /auth/facebook route with authRateLimit | FOUND |
| server.js /auth/facebook/callback with onFacebookCallbackSuccess | FOUND |
| onFacebookCallbackSuccess stamps user_id before session.save | PASS |
| res.redirect('/') inside save callback | PASS |
| Single passport.serializeUser registration | PASS (1 registration) |
| Single new Pool in db.js | PASS |
| Google verify callback passes 'google' as first arg | FOUND |
| test/auth.test.js call sites updated to new signature | FOUND (9 sites updated) |
| auth.signInFacebook in both en+vi I18N (count>=2) | PASS (count=4) |
| VI string is real Vietnamese: "Đăng nhập bằng Facebook" | PASS |
| FacebookSignInButton renders only when !authUser | PASS |
| .facebook-signin in style.css | FOUND |
| npm test: 83 passed, 24 skipped | PASS |
| npm run build:game: exit 0 | PASS |
| Commit 5b6f57c (Task 1) | FOUND |
| Commit df1c75a (Task 2) | FOUND |
| Commit 5eae685 (Task 3) | FOUND |
