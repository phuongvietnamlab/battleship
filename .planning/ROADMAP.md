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
