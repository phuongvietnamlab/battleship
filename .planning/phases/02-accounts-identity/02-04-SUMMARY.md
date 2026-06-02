---
phase: 02-accounts-identity
plan: "04"
subsystem: profile
tags: [profile, react, i18n, api, tdd, zero-state]
dependency_graph:
  requires: [02-03]
  provides:
    - server.js:GET-/api/profile/:userId
    - public/app.jsx:ProfileView
    - public/app.jsx:profile-screen-state
    - public/app.jsx:profile-i18n-strings
    - public/style.css:profile-view-styles
    - test/profile.test.js:PROF-01-PROF-02-assertions
  affects: [server.js, public/app.jsx, public/style.css, test/profile.test.js]
tech_stack:
  added: []
  patterns:
    - parseInt + Number.isInteger guard (400 INVALID_ID) before parameterized $1 SQL (T-02-16)
    - Explicit SELECT of public columns only — no SELECT * (T-02-17)
    - Zero-state stats scaffold {wins:0,losses:0,gamesPlayed:0} — D-10, Phase 3 fills real data
    - ProfileView useEffect fetch on userId change with skeleton/404 handling
    - prefers-reduced-motion respected via @media in skeleton CSS
key_files:
  created: []
  modified:
    - server.js
    - public/app.jsx
    - public/style.css
    - test/profile.test.js
decisions:
  - "ProfileView fetches /api/profile/:id on mount via useEffect; skeleton shown while loading, .error block on 404"
  - "handleViewProfile(userId) accepts optional userId param; defaults to authUser.id for own-profile navigation from dropdown"
  - "Own vs other-player: isOwn = String(userId) === String(currentUserId) comparison (robust to number/string mismatch)"
  - "Challenge placeholder button rendered for other-player profiles with disabled+opacity:0.4; no Phase 5 layout change needed"
  - "Skeleton uses new @keyframes skeletonPulse in CSS; prefers-reduced-motion suppresses animation per UI-SPEC"
  - "Zero-state stats (wins:0, losses:0, gamesPlayed:0) are intentional per D-10 — Phase 3 swaps the SELECT"
metrics:
  duration: "10 minutes"
  completed: "2026-06-02"
  tasks_completed: 2
  files_changed: 4
---

# Phase 02 Plan 04: Profile View Vertical Slice — Summary

GET /api/profile/:userId zero-state read path + ProfileView component with skeleton/404/own-vs-other rendering, closing PROF-01 and PROF-02.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | GET /api/profile/:userId route + profile.test.js assertions | dc2e023 | Done |
| 2 | ProfileView component + profile screen state + EN/VI strings + CSS | 0234e19 | Done |

## What Was Built

**Task 1 — server.js + test/profile.test.js:**

- Added `GET /api/profile/:userId` to server.js alongside `/api/me`:
  - `parseInt(req.params.userId, 10)` + `Number.isInteger` guard → 400 `INVALID_ID` (T-02-16: SQL injection mitigation)
  - Parameterized `SELECT id, display_name, avatar_url, created_at, guest_migrated_at FROM users WHERE id=$1` — explicit columns only, never `SELECT *` (T-02-17: no private fields leak)
  - `rows[0]` absent → 404 `NOT_FOUND`; success → `{ id, displayName, avatarUrl, memberSince, isLinkedAccount, stats: { wins:0, losses:0, gamesPlayed:0 } }` (D-10 zero-state)
  - `try/catch` with `console.error("[auth] profile fetch failed:", e.message)` + 500 `SERVER_ERROR`
- Replaced the profile.test.js stub with DB-gated assertions:
  - Suite 1 (no DB): existing `sanitizeDisplayName` export checks preserved
  - Suite 2 (DB-gated): `describe.skipIf(!hasDatabaseUrl)` with `beforeAll runMigrations` + `afterAll` cleanup-by-prefix:
    - PROF-01: known user returns 200 with zero-state stats `{wins:0, losses:0, gamesPlayed:0}` and correct shape
    - PROF-02: unknown userId → 404 NOT_FOUND
    - INVALID_ID: non-integer input → 400
    - Public-fields-only check: assert response does NOT contain `email`, `passwordHash`, `sessionId`, `credentials`

**Task 2 — public/app.jsx + public/style.css:**

- Added 8 `profile.*` i18n keys to both `en` and `vi` I18N blocks (all real Vietnamese copy per UI-SPEC Copywriting Contract):
  - `profile.memberSince`, `profile.wins`, `profile.losses`, `profile.games`, `profile.noGamesYet`, `profile.back`, `profile.challengeSoon`, `profile.notFound`
- Updated `screen` state comment to include `'profile'`
- Added `viewProfileId`, `profileData`, `profileLoading` useState to App
- Updated `handleViewProfile(userId)` to accept optional userId, set `viewProfileId`, clear `profileData`, then `setScreen('profile')` — completing the end-to-end View-profile flow from Plan 03's AvatarMenu click
- Added `ProfileView({ userId, currentUserId, onBack, onSignOut })` component before `function App()`:
  - `useEffect` fetches `/api/profile/${userId}` on `userId` change → skeleton while loading → 404 `.error` block → data display
  - Loading skeleton: `profile-avatar-skel`, `profile-name-skel`, `profile-since-skel`, `stat-label-skel`/`stat-fig-skel` all using `skeleton-pulse` class
  - Profile header: 64px `<img>` with `referrerPolicy="no-referrer"` or `.profile-avatar-fallback` initial letter
  - `.profile-stats` 3-column grid: Wins | Losses | Games with `var(--gold)` figures (22px Oswald)
  - `.profile-no-games` sub-line shown when all stats are 0
  - Own profile (`isOwn = String(userId) === String(currentUserId)`): Sign out ghost button
  - Other player: disabled Challenge placeholder button (`opacity:0.4`, `cursor:not-allowed`, `aria-disabled="true"`)
  - 404: `.error` block + Back button
- Added `screen === 'profile'` branch in App render tree mounting `<ProfileView userId={viewProfileId} currentUserId={authUser?.id} onBack={() => setScreen('lobby')} onSignOut={handleSignOut} />`
- Added CSS in `public/style.css`:
  - `.profile-view`: max-width 480px, margin 6vh auto 0, glass panel identical to `.lobby`, `rise` animation
  - `.profile-header`: flex row, 64px avatar left, name+since right, gap 16px
  - `.profile-avatar`, `.profile-avatar-fallback`: 64px circle, fallback uses `var(--sky)` bg + 28px Oswald initial
  - `.profile-name`: 22px Oswald 700 `#eaf2ff`, max-width 260px truncated
  - `.profile-since`: 12px `#a9ccec`
  - `.profile-stats`: 3-col grid, `.stat-label` 12px uppercase `#a9ccec`, `.stat-fig` 22px Oswald bold `var(--gold)`
  - `.profile-no-games`: 13px `#a9ccec` centered
  - `.skeleton-pulse` + `@keyframes skeletonPulse`; `@media (prefers-reduced-motion: reduce)` suppresses animation
  - `.profile-view .error`: amber-tinted error block

## Test Results

```
Test Files  6 passed (6)
     Tests  83 passed | 25 skipped (108)
```

25 skipped = DB-gated suites (including 5 new profile DB assertions that skip without DATABASE_URL). All non-DB suites pass. Guest regression (AUTH-01) confirmed: `createRoom`/`joinRoom` handlers untouched.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

**1. Zero-state stats (wins:0, losses:0, gamesPlayed:0)**
- File: `server.js` line 337 (`stats: { wins: 0, losses: 0, gamesPlayed: 0 }`)
- Reason: Intentional per D-10 — Phase 3 match recording fills real numbers with NO UI rework required. The endpoint shape and UI are final; only the SELECT query changes in Phase 3.
- This is not a stub that prevents PROF-01/PROF-02 from being achieved — profiles display correctly with zero-state numbers.

**2. Challenge button (disabled placeholder)**
- File: `public/app.jsx` ProfileView component
- Reason: Intentional per spec — disabled placeholder (`opacity:0.4`, `aria-disabled`) for Phase 5 challenge wiring. Layout is already correct; Phase 5 only removes `disabled`.

## Threat Flags

All mitigations applied per plan threat model:

| Flag | File | Description |
|------|------|-------------|
| T-02-16 mitigated | server.js | parseInt + Number.isInteger guard before parameterized $1 — SQL injection on :userId blocked |
| T-02-17 mitigated | server.js | Explicit SELECT of 5 named public columns; no SELECT *; no email/credential/session fields in response |
| T-02-18 mitigated | server.js/db.js | display_name sanitized at write by sanitizeDisplayName (Plan 01); CSP script-src 'self' second layer |
| T-02-19 accepted | server.js | user enumeration via 404 timing accepted per plan — opaque IDs, profiles intentionally public |

## Self-Check: PASSED

| Item | Status |
|------|--------|
| server.js modified | FOUND |
| public/app.jsx modified | FOUND |
| public/style.css modified | FOUND |
| test/profile.test.js modified | FOUND |
| dist/app.js rebuilt | FOUND |
| Commit dc2e023 (Task 1 - profile route + tests) | FOUND |
| Commit 0234e19 (Task 2 - ProfileView + CSS + strings) | FOUND |
| npm test: 83 passed, 25 skipped | PASS |
| npm run build:game: exit 0 | PASS |
| /api/profile/:userId route in server.js | PASS |
| INVALID_ID + NOT_FOUND + explicit SELECT in server.js | PASS |
| gamesPlayed: 0 (zero-state scaffold D-10) | PASS |
| profile.noGamesYet in both en+vi I18N (3 occurrences) | PASS |
| ProfileView component defined | PASS |
| screen === 'profile' branch renders ProfileView | PASS |
| .profile-view in style.css | PASS |
| .profile-header in style.css | PASS |
| .profile-stats in style.css | PASS |
| VI strings are real Vietnamese | PASS |
| Own profile shows sign-out; other shows disabled Challenge | PASS |
| Skeleton pulse + prefers-reduced-motion | PASS |
| 404 .error block with profile.notFound | PASS |
| handleViewProfile sets viewProfileId before setScreen('profile') | PASS |
