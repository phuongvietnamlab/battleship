# Roadmap: Battleship Online

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-06-04)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-06-04</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-06-01
- [x] Phase 2: Accounts & Identity (9/9 plans) — completed 2026-06-02
- [x] Phase 3: Match Recording (3/3 plans) — completed 2026-06-03
- [x] Phase 4: Ranked Mode & Leaderboard (7/7 plans) — completed 2026-06-03
- [x] Phase 5: Public Matchmaking (3/3 plans) — completed 2026-06-04
- [x] Phase 6: Bot Difficulty Tiers (2/2 plans) — completed 2026-06-04

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-06-01 |
| 2. Accounts & Identity | v1.0 | 9/9 | Complete | 2026-06-02 |
| 3. Match Recording | v1.0 | 3/3 | Complete | 2026-06-03 |
| 4. Ranked Mode & Leaderboard | v1.0 | 7/7 | Complete | 2026-06-03 |
| 5. Public Matchmaking | v1.0 | 3/3 | Complete | 2026-06-04 |
| 6. Bot Difficulty Tiers | v1.0 | 2/2 | Complete | 2026-06-04 |

### Phase 7: Points economy: remove ranking/leaderboard, add wagerable points for matches and power-up purchases

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 7 to break down)

### Phase 8: Auth migration: replace OAuth with WebAuthn Passkeys

**Goal:** Replace Google/Facebook OAuth with WebAuthn/Passkeys (biometric auth) as the primary sign-in method. Keep email/password as fallback for devices that don't support passkeys. Remove all OAuth dependencies and code. Guest-first flow unchanged.

**Requirements**:

- AUTHM-01: Remove Google OAuth strategy, routes, and `passport-google-oauth20` dependency
- AUTHM-02: Remove Facebook OAuth strategy, routes, `passport-facebook` dependency, and data-deletion callback
- AUTHM-03: Remove `passport` package entirely (no longer needed without OAuth)
- AUTHM-04: WebAuthn registration — signed-in email user can register a passkey (biometric) for their account
- AUTHM-05: WebAuthn authentication — user can sign in with passkey (Face ID / Touch ID / Windows Hello / fingerprint) in one tap
- AUTHM-06: Guest → passkey account creation — guest can create a passkey-linked account directly (without email)
- AUTHM-07: Email/password remains as fallback sign-in (existing code, no changes needed beyond OAuth removal cleanup)
- AUTHM-08: UI updated — replace OAuth buttons with "Sign in with Passkey" primary button; email/password form secondary
- AUTHM-09: Credential storage — new `webauthn_credentials` table (credential_id, public_key, user_id, counter, transports, created_at)
- AUTHM-10: Session management unchanged — express-session + connect-pg-simple remains; passkey login stamps session same as email login

**Depends on:** Phase 2 (reuses identity schema, session infra, email/password auth)
**Plans:** 2 plans

Plans:

- [ ] Plan 01: Remove OAuth/Passport, add user-loading middleware, webauthn_credentials migration
- [ ] Plan 02: Implement WebAuthn registration + authentication + passkey-first UI

### Phase 9: Lobby UI redesign: simplify home screen UX for clarity and onboarding

**Goal:** Redesign the lobby screen from a cluttered list of 10+ buttons into a clean, card-based layout with 1 hero CTA + 2 secondary cards + progressive disclosure via bottom sheets. Reduce cognitive load so a new player knows what to do within 2 seconds. Fit everything above the fold on mobile (no scroll needed).

**Requirements**:

- LOBBY-01: Single primary CTA "Chơi nhanh / Quick Play" — one tap to enter matchmaking queue (classic mode default)
- LOBBY-02: Two compact secondary cards side-by-side: "Bot" (practice) and "Với bạn / Friends" (room code)
- LOBBY-03: Bot card → bottom sheet with difficulty picker (Easy/Medium/Hard/Insane) + brief descriptions
- LOBBY-04: Friends card → bottom sheet with "Create room" (shows code) and "Join room" (input field)
- LOBBY-05: Mode toggle (Classic/Advance) moved to small toggle or sub-option, not a full section
- LOBBY-06: Wager section only visible to signed-in users with balance > 0; compact chip-row design
- LOBBY-07: Entire lobby fits on one mobile viewport (≤ 667px height) without scrolling
- LOBBY-08: Progressive disclosure — details hidden behind bottom sheets instead of inline
- LOBBY-09: First-time tooltip / pulse on "Chơi nhanh" button for new users (shown once, stored in localStorage)
- LOBBY-10: Auth/sign-in moved to avatar menu or settings — not cluttering the main lobby
- LOBBY-11: Responsive: cards stack vertically on very small screens (< 320px width)

**Depends on:** Phase 7 (points API), Phase 8 (auth UI)
**Plans:** 2 plans

Plans:

- [x] Plan 01: Card-based lobby layout + BottomSheet component
- [x] Plan 02: Auth relocation, first-time onboarding tooltip, polish & cleanup

### Phase 10: Fix Passkey auth: rewrite WebAuthn registration and login flows

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 9
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 10 to break down)
