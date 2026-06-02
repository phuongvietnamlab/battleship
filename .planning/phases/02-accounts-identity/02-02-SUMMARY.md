---
phase: 02-accounts-identity
plan: "02"
subsystem: auth-oauth
tags: [auth, passport, google-oauth, express-session, socket.io, react, i18n]
dependency_graph:
  requires: [02-01]
  provides: [server.js:session-middleware, server.js:passport-google-strategy, server.js:auth-routes, server.js:api-me, server.js:socket-userId, public/app.jsx:GoogleSignInButton, public/app.jsx:authUser-state, public/style.css:google-signin]
  affects: [server.js, public/app.jsx, public/style.css]
tech_stack:
  added: []
  patterns: [Passport Google OAuth2, express-session + connect-pg-simple, io.engine.use(sessionMiddleware) D-11, named callback handler for extensibility]
key_files:
  created: []
  modified:
    - server.js
    - public/app.jsx
    - public/style.css
decisions:
  - "SESSION_SECRET fail-loud check placed inside require.main guard (not module load) so test imports of server.js do not trigger process.exit (WR-01)"
  - "GoogleStrategy registration guarded by process.env.GOOGLE_CLIENT_ID presence to prevent OAuth2Strategy constructor throwing during test imports"
  - "express-session fallback secret for test environment to suppress deprecation warning — production boot guard still exits without SESSION_SECRET"
  - "onGoogleCallbackSuccess declared as named function (not inline arrow) so Plan 03 can extend the body with user_id stamp + session save without re-parsing"
metrics:
  duration: "8 minutes"
  completed: "2026-06-02"
  tasks_completed: 3
  files_changed: 3
---

# Phase 02 Plan 02: Google OAuth Sign-in Vertical Slice — Summary

JWT-less OAuth sign-in vertical slice: session middleware + Passport Google strategy wired into server.js, auth routes with rate limiting and named extractable callback handler, /api/me endpoint, socket.data.userId from shared session, GoogleSignInButton in lobby for guests with bilingual EN/VI strings, and matching CSS per UI-SPEC.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Mount session + Passport middleware and Google strategy in server.js | 53a15a1 | Done |
| 2 | Auth routes, /api/me, and socket userId extraction in server.js | 79ec407 | Done |
| 3 | Sign-in button + auth hydration + EN/VI strings (public/app.jsx + style.css) | 355c3a9 | Done |

## What Was Built

**Task 1 — Session + Passport middleware (server.js):**
- Single `const sessionMiddleware = expressSession(...)` shared by both `app.use(sessionMiddleware)` and `io.engine.use(sessionMiddleware)` (D-11/T-02-10 — prevents two-store split)
- `connect-pg-simple` store reuses shared `pool` from db.js (PITFALLS #4 — no second Pool)
- Cookie flags: `httpOnly: true`, `secure: 'auto'` + `trust proxy 1`, `sameSite: 'lax'` (T-02-07; lax required for OAuth redirect PITFALLS #5)
- `rolling: true` for 30-day maxAge refresh (D-04)
- `GoogleStrategy` with `state: true` (SEC-05/T-02-05 — cryptographic nonce per flow) and `passReqToCallback: true` (reads `req.session.pendingClientId` for guest linking)
- Verify callback calls `linkOrPromoteAccount(sub, name, avatarUrl, pendingClientId)` from db.js; never persists access token (T-02-08)
- `serializeUser` writes only `users.id`; `deserializeUser` queries SELECT id, display_name, avatar_url
- SESSION_SECRET fail-loud check in `require.main === module` boot block (not module load — WR-01 test compatibility)

**Task 2 — Auth routes + /api/me + socket userId (server.js):**
- `authLimiter` = RateLimiterMemory 10/60s per IP; `authRateLimit` middleware on both auth routes (T-02-09)
- `GET /auth/google`: saves `pendingClientId` to `req.session` then `req.session.save()` before OAuth redirect (PITFALLS #1 / Open Q3 — ensures pendingClientId persists before browser follows Location header)
- `GET /auth/google/callback`: `passport.authenticate('google', { failureRedirect: '/?authError=1' })` then `onGoogleCallbackSuccess(req, res)` — named function by reference (Plan 03 extensibility slot — adds user_id stamp + session save before res.redirect)
- Passport 0.6+ calls `req.session.regenerate()` automatically at `req.logIn()` (SEC-05/T-02-06 — session fixation defense)
- `GET /api/me`: returns `{user:null}` for guests, `{user:{id,displayName,avatarUrl}}` for signed-in
- `io.on('connection')`: reads `socket.request.session?.passport?.user ?? null` to `socket.data.userId` (D-11)
- All existing `createRoom`/`joinRoom`/`fire`/`useAbility`/`chat` handlers byte-for-byte unchanged (AUTH-01 regression guard)

**Task 3 — Frontend (public/app.jsx + public/style.css):**
- I18N: added `auth.signInGoogle`, `auth.errFailed`, `auth.errExpired`, `auth.errRateLimited` to BOTH `en` and `vi` blocks
  - VI strings are real Vietnamese from UI-SPEC Copywriting Contract (not placeholders)
- `authUser` state: null (guest) or `{id,displayName,avatarUrl}` (signed-in), hydrated from `GET /api/me` on mount
- `authError` state: set from `?authError=1` URL param then stripped via `history.replaceState`
- `signInDisabled` state: set on redirect-initiation to prevent double-click
- `GoogleSignInButton` component: inline 18x18 Google G SVG (4-path standard mark), navigates to `/auth/google?clientId=...`, disabled during redirect
- `Lobby` renders `GoogleSignInButton` ONLY when `!authUser` (AUTH-01 — guest-first non-negotiable); authError inline `.error` block above button
- `public/style.css`: `.btn.google-signin` — white background (rgba 255,255,255,0.92), #1f1f1f text, 52px height, 16px/600 Be Vietnam Pro mixed-case, focus-visible outline var(--gold)
- Client bundle rebuilt: `npm run build:game` -> `dist/app.js`

## Test Results

```
Test Files  6 passed (6)
     Tests  83 passed | 22 skipped (105)
```

DB-gated suites skip cleanly without `DATABASE_URL`. All non-DB suites pass. Guest regression (AUTH-01) confirmed: `createRoom`/`joinRoom` handlers untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SESSION_SECRET fail-loud check moved into require.main boot guard**
- **Found during:** Task 2 (test run)
- **Issue:** `if (!process.env.SESSION_SECRET) process.exit(1)` at module load time causes `test/hardening.test.js` to fail with "process.exit unexpectedly called with 1" — hardening test imports server.js without setting SESSION_SECRET (WR-01 pattern).
- **Fix:** Moved the SESSION_SECRET check inside `if (require.main === module)` boot block; added `|| "test-placeholder-..."` fallback for the sessionMiddleware secret declaration to suppress the express-session deprecation warning on test imports.
- **Files modified:** server.js
- **Commit:** 79ec407

**2. [Rule 1 - Bug] GoogleStrategy registration guarded by GOOGLE_CLIENT_ID env var presence**
- **Found during:** Task 2 (test run)
- **Issue:** `new GoogleStrategy({ clientID: undefined, ... })` throws `OAuth2Strategy requires a clientID option` at module load time when tests import server.js without setting GOOGLE_CLIENT_ID.
- **Fix:** Wrapped `passport.use(new GoogleStrategy(...))` with `if (process.env.GOOGLE_CLIENT_ID)` guard — strategy is skipped in test imports; auth routes would return 500 if called without credentials, which is correct behavior.
- **Files modified:** server.js
- **Commit:** 79ec407

## Known Stubs

None — all functionality is fully implemented. The avatar chip and dropdown menu are intentionally deferred to Plans 03/04 per plan scope. The `onGoogleCallbackSuccess` body is intentionally minimal (`res.redirect('/')`) — Plan 03 adds the `user_id` session stamp inside it.

## Threat Flags

No new security-relevant surface introduced beyond the plan's threat model. All T-02-05 through T-02-11 mitigations applied:
- T-02-05 (OAuth CSRF): `state: true` nonce per flow
- T-02-06 (session fixation): Passport 0.6+ automatic `session.regenerate()` at login
- T-02-07 (session hijacking): `httpOnly:true`, `secure:'auto'`, `sameSite:'lax'`
- T-02-08 (access_token leak): verify callback never stores accessToken
- T-02-09 (auth brute force): `authRateLimit` on both /auth/google routes
- T-02-10 (two-store split): single `sessionMiddleware` shared by app.use + io.engine.use
- T-02-11 (clientId smuggling): pendingClientId in server-side session (not trusted from callback URL)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| server.js modified | FOUND |
| public/app.jsx modified | FOUND |
| public/style.css modified | FOUND |
| Commit 53a15a1 (Task 1 - session/passport) | FOUND |
| Commit 79ec407 (Task 2 - auth routes) | FOUND |
| Commit 355c3a9 (Task 3 - frontend) | FOUND |
| npm test: 83 passed, 22 skipped | PASS |
| npm run build:game: exit 0 | PASS |
| Single sessionMiddleware: true | PASS |
| io.engine.use(sessionMiddleware): true | PASS |
| state: true in GoogleStrategy: true | PASS |
| onGoogleCallbackSuccess named function: true | PASS |
| auth.signInGoogle in both en+vi I18N: true (count=4) | PASS |
| VI string is real Vietnamese: "Đăng nhập bằng Google" | PASS |
| GoogleSignInButton renders only when !authUser: true | PASS |
| .google-signin in style.css: true | PASS |
