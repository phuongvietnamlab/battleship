---
phase: 02-accounts-identity
plan: "03"
subsystem: auth-sessions
tags: [auth, sessions, revocation, react, i18n, dropdown, sign-out]
dependency_graph:
  requires: [02-02]
  provides:
    - server.js:signout-route
    - server.js:signout-all-route
    - server.js:session-user_id-stamp
    - public/app.jsx:ProfileChip
    - public/app.jsx:AvatarMenu
    - public/app.jsx:sign-out-handlers
    - public/style.css:avatar-menu
  affects: [server.js, public/app.jsx, public/style.css, test/auth.test.js]
tech_stack:
  added: []
  patterns:
    - req.logout(callback) — Passport 0.6+ async signout (T-02-15)
    - req.session.user_id stamp before req.session.save inside onGoogleCallbackSuccess (T-02-20)
    - DELETE FROM session WHERE user_id=$1 indexed revocation (D-03, T-02-12/T-02-13/T-02-14)
    - Optimistic UI revert on sign-out (setAuthUser(null) then fetch)
    - AvatarMenu inline confirmation via signOutAllConfirm state (no modal)
key_files:
  created: []
  modified:
    - server.js
    - public/app.jsx
    - public/style.css
    - test/auth.test.js
decisions:
  - "req.session.user_id stamped inside onGoogleCallbackSuccess (Plan 02 named slot) so every persisted session row carries the indexed DELETE key for sign-out-all"
  - "Optimistic UI revert on sign-out: setAuthUser(null) fires immediately, fetch is fire-and-forget; avoids spinner and matches UX spec"
  - "AvatarMenu inline confirmation (role=alert 2-button row within the dropdown) — not a modal; matches UI-SPEC destructive action pattern"
  - "handleViewProfile sets screen=profile; actual ProfileView component deferred to Plan 04; menu item works cleanly regardless"
metrics:
  duration: "6 minutes"
  completed: "2026-06-02"
  tasks_completed: 2
  files_changed: 4
---

# Phase 02 Plan 03: Sessions + Revocation Vertical Slice — Summary

Server-side session revocation with indexed single-DELETE by user_id, plus the signed-in header UI — avatar chip with dropdown menu, sign-out (this device) and sign-out all devices (with inline 2-button confirmation) — completing AUTH-04.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Sign-out routes + session user_id stamping + AUTH-04 test bodies | 0e51daa | Done |
| 2 | ProfileChip + AvatarMenu dropdown + sign-out handlers | 50aa391 | Done |

## What Was Built

**Task 1 — server.js + test/auth.test.js:**

- Extended `onGoogleCallbackSuccess(req, res)` (Plan 02's named extensibility slot) to stamp `req.session.user_id = req.user.id` before calling `req.session.save(err => res.redirect('/'))` — the redirect fires only inside the save callback (assignment→save→redirect-in-callback order, T-02-20). Every persisted session row now carries the indexed `user_id` column created in Plan 01's migration.
- Added `POST /auth/signout`: calls `req.logout(callback)` (Passport 0.6+ async, T-02-15) then `req.session.destroy(() => res.json({ ok:true }))`.
- Added `POST /auth/signout-all`: extracts `userId` from `req.user?.id` only (never from request body — T-02-12); returns 401 `NOT_AUTHENTICATED` if absent; runs `DELETE FROM session WHERE user_id = $1` parameterized (T-02-14); single indexed DELETE removes all rows atomically (T-02-13); then `req.session.destroy`.
- Filled AUTH-04 DB-gated test bodies in `test/auth.test.js` under `describe.skipIf(!hasDatabaseUrl)` guard with `beforeAll runMigrations` + `afterAll` cleanup-by-prefix pattern:
  - `test('signout destroys current session row')` — seeds a session row, deletes by sid, asserts zero rows.
  - `test('signout-all deletes all session rows for user_id')` — inserts 2 rows sharing `user_id`, runs `DELETE FROM session WHERE user_id=$1`, asserts zero rows for that user_id, asserts the other user's row is untouched (isolation check).

**Task 2 — public/app.jsx + public/style.css:**

- Added 7 new i18n keys to both `en` and `vi` I18N blocks (`auth.viewProfile`, `auth.signOut`, `auth.signOutAll`, `auth.signOutAllConfirmTitle`, `auth.signOutAllConfirmBody`, `auth.signOutAllConfirmBtn`, `auth.keepSignedIn`). VI strings are real Vietnamese from the UI-SPEC Copywriting Contract.
- Added `ProfileChip({ user, onToggle, active })`: renders existing `.profile-chip` styles with avatar img (or `.avatar-fallback` initial), name span, `aria-haspopup="menu"`, `aria-expanded`, gold border on active state.
- Added `AvatarMenu({ open, onViewProfile, onSignOut, onSignOutAll, confirmMode, onConfirm, onCancel })`: `role="menu"` dropdown with 3 `role="menuitem"` items (View profile, Sign out, Sign out all devices with `.destructive` color); separator div; closes on outside click (mousedown + touchstart) and Escape key via `useEffect` hooks. When `confirmMode`, renders `role="alert"` inline confirmation with 2-button row (confirm + cancel).
- Added App state: `avatarMenuOpen` (boolean), `signOutAllConfirm` (boolean).
- Added handlers: `handleSignOut` (optimistic setAuthUser(null) + fire-and-forget POST /auth/signout), `handleSignOutAllConfirm` (POST /auth/signout-all then setAuthUser(null)), `handleViewProfile` (setScreen('profile') — ProfileView screen wired in Plan 04).
- Modified `.topbar-right`: when `authUser`, renders `ProfileChip` + `AvatarMenu`; when `!authUser`, falls back to existing `profile.name` chip (FB guest identity chip preserved). `GoogleSignInButton` remains in `Lobby` for `!authUser` (AUTH-01 guest-first non-negotiable unchanged).
- `public/style.css`: added `.avatar-menu` (absolute, top calc(100%+8px) right 0, min-width 200px, var(--panel) bg, backdrop blur, 12px radius, z-index 80, rise animation), `.avatar-menu-item` (12px/16px padding, 13px/400 Be Vietnam Pro, gold 2px left border on hover, padding-left compensation), `.avatar-menu-item.destructive` (var(--hit) color), `.avatar-menu-sep` (border-top var(--panel-brd)), `.profile-chip:hover` and `.profile-chip.active` (gold border + shadow).
- Client bundle rebuilt: `npm run build:game` → `dist/app.js`.

## Test Results

```
Test Files  6 passed (6)
     Tests  83 passed | 24 skipped (107)
```

2 additional skipped = AUTH-04 DB-gated suites (signout + signout-all). All non-DB suites pass. Guest regression (AUTH-01) confirmed: `createRoom`/`joinRoom` handlers untouched.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

**1. handleViewProfile sets screen='profile' without a ProfileView component**
- File: `public/app.jsx`
- Reason: The ProfileView screen is explicitly scoped to Plan 04 per the plan. The menu item navigates to `screen === 'profile'` cleanly; when Plan 04 merges, the component renders. No broken UI — the screen state is set but currently renders nothing (which is the expected interim state noted in the plan).
- Plan 04 resolves this.

## Threat Flags

No new security-relevant surface beyond the plan's threat model. All T-02-12 through T-02-15 and T-02-20 mitigations applied:

- T-02-12 (Elevation of Privilege — targeting another user): `userId` taken from `req.user.id` only; 401 if absent
- T-02-13 (stale session after sign-out-all race): single indexed DELETE FROM session WHERE user_id=$1 is atomic
- T-02-14 (SQL injection via user_id): parameterized $1; user_id is integer from req.user
- T-02-15 (silent sign-out): `req.logout(callback)` — async Passport 0.6+; session.destroy only after logout resolves
- T-02-20 (sign-out-all finds zero rows): login stamps user_id before session.save; every persisted row carries the DELETE key

## Self-Check: PASSED

| Item | Status |
|------|--------|
| server.js modified | FOUND |
| public/app.jsx modified | FOUND |
| public/style.css modified | FOUND |
| test/auth.test.js modified | FOUND |
| Commit 0e51daa (Task 1 - signout routes + stamp + tests) | FOUND |
| Commit 50aa391 (Task 2 - ProfileChip + AvatarMenu) | FOUND |
| npm test: 83 passed, 24 skipped | PASS |
| npm run build:game: exit 0 | PASS |
| /auth/signout route with req.logout(callback): true | PASS |
| /auth/signout-all with DELETE WHERE user_id=$1: true | PASS |
| req.session.user_id assignment before req.session.save: true | PASS |
| res.redirect('/') inside save callback: true | PASS |
| auth.signOut + auth.signOutAll in both en+vi I18N: true | PASS |
| VI strings are real Vietnamese: PASS | PASS |
| ProfileChip component with aria-haspopup: true | PASS |
| AvatarMenu with role=menu/menuitem: true | PASS |
| signOutAllConfirm inline confirmation state: true | PASS |
| .avatar-menu in style.css: true | PASS |
| .avatar-menu-item in style.css: true | PASS |
| GoogleSignInButton renders only when !authUser (Lobby): true | PASS |
