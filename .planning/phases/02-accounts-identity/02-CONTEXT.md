# Phase 2: Accounts & Identity - Context

**Gathered:** 2026-06-02 (revised — scope expanded from Google-only to 3 auth methods)
**Status:** Ready for planning

> **⚠ SCOPE EXPANSION — replan required.** This CONTEXT.md supersedes the original
> Google-only version. Phase 2 now ships **three** sign-in methods: Google OAuth,
> Facebook OAuth, and email/password. The original 4-plan Google-only set
> (02-01..02-04) is **superseded** — replan after this discussion.
>
> **CONTRACT MISMATCH — must fix before/with replan:** ROADMAP.md Phase 2 and
> REQUIREMENTS.md still describe Google-only (REQUIREMENTS line 89 records
> "Email + password auth → rejected"). Add the new auth requirements + success
> criteria via `/gsd-phase` (or a REQUIREMENTS.md edit) so plan-checker and
> verifier grade against the real scope. Suggested new requirements:
> AUTH-05 (Facebook OAuth), AUTH-06 (email/password signup + login),
> AUTH-07 (email verification, async/non-blocking), AUTH-08 (password reset).

<domain>
## Phase Boundary

Phase 2 delivers optional, additive accounts on top of guest-first play, via **three** sign-in methods that all share one provider-generic identity model:

1. **Google OAuth sign-in (AUTH-02, SEC-05)** — sign in with Google to create/activate a persistent account. OAuth callback validates a random `state`; session regenerated after login.
2. **Facebook OAuth sign-in (new — AUTH-05)** — parallels Google (`passport-facebook`). Same `state` + session-regeneration hardening. Needs its own package-legitimacy gate. FB may not return an email — that's fine (email column nullable; dedup is by provider id, not email).
3. **Email/password sign-in (new — AUTH-06, the heavy slice)** — signup + login with email + password. Password hashing, **async email verification** (does NOT block play), and **password reset** flow. Requires email-sending infra that does not exist in the stack yet (chosen: Resend).
4. **Guest → account linking (AUTH-03)** — on first sign-in via ANY method, the guest's existing `clientId` identity is linked atomically to the account; no history lost, no duplicate user.
5. **Persistent + revocable sessions (AUTH-04)** — signed-in player stays logged in across visits; can sign out and sign out from all devices (server-side revocation).
6. **Guest preservation (AUTH-01)** — instant guest play via `clientId` is unchanged; no sign-in prompt, no friction. All three methods are strictly additive/optional (CLAUDE.md non-negotiable).
7. **Player profiles (PROF-01, PROF-02)** — signed-in player views own profile (win/loss + lifetime stats, zero-state scaffold this phase); any player views another's public profile.

**Not in this phase:** match recording / real stats numbers (Phase 3 — profile ships zero-state scaffold now), ELO/ranked (Phase 4), matchmaking queue (Phase 5), bot tiers (Phase 6). No `matches`/`ratings`/`queue` tables here. **Cross-provider account merging** is out (separate accounts per provider — see D-20). Editable display name / avatar upload deferred. Account deletion / GDPR export deferred.

**Builds on Phase 1 (locked):** canonical `users` + `credentials` identity model (`migrations/001_identity.sql`) is live. Guests are `type='guest'`, `external_id=clientId`; dedup on the `credentials (type, external_id)` unique constraint; `users.guest_migrated_at` reserved for the link flow.

</domain>

<decisions>
## Implementation Decisions

### Provider-generic identity schema (NEW — applies to all 3 methods)
- **D-14:** Migration `002_accounts.sql` is **provider-generic**. Reuse the Phase-1 `credentials (type, external_id)` model rather than per-provider columns: `type ∈ {guest, google, facebook, email}`, `external_id` = provider's stable id (`sub` for Google, FB user id for Facebook, the normalized email for email-accounts). Add a **nullable `password_hash`** for `type='email'` credentials, and account-level profile/verification columns (see D-15). No `google_id`/`facebook_id` columns — one schema, all three methods, no rework when more providers are added.
- **D-15:** Email-account state lives on the credential/user: store `email`, `email_verified` (bool, default false), and verification/reset token state. Token storage (dedicated `auth_tokens` table vs columns) is planner's call. Display-name/avatar storage decision carried from D-09b below.

### Auth method mechanism
- **D-01 (carried):** Google OAuth via **Passport.js + `passport-google-oauth20`**. Battle-tested Express standard; lowest custom-crypto risk. (User deferred lib choice — "choose what's most suitable".)
- **D-16 (NEW):** Facebook OAuth via **`passport-facebook`**, mirroring the Google strategy. Request `email` scope but treat email as optional (FB may withhold it). Subject to a package-legitimacy gate (same as the Google package gate at the 02-01 boundary). Real FB identities limited until the FB app is provisioned — see canonical ref to the FB dev-identity note.
- **D-17 (NEW):** Email/password — **hash with bcrypt** (`bcryptjs` or `bcrypt`, planner's call; argon2id acceptable if it installs cleanly on Render). Min password length **8 chars**; no exotic complexity rules. Login on the email route is rate-limited (extend the Phase-1 `rate-limiter-flexible`). New named error codes: `AUTH_FAILED`, `OAUTH_STATE_MISMATCH`, `EMAIL_IN_USE`, `WEAK_PASSWORD`, `BAD_TOKEN`.
- **D-02 (carried):** Sessions use **`express-session` + `connect-pg-simple`** — Postgres-backed store reusing the shared `pg.Pool` from `db.js`. Survives restart; one source of truth alongside identity.
- **D-03 (carried):** **Server-side revocation = delete session rows.** "Sign out all devices" deletes all session rows for a `user_id`; "Sign out (this device)" destroys the current session. Account menu offers both (AUTH-04).
- **D-04 (carried):** **Session lifetime: 30-day rolling cookie** (`maxAge` 30d, refreshed each visit).
- **D-05 (carried):** **SEC-05** satisfied for both OAuth providers: Passport carries a random `state` validated on callback, and the login handler calls `req.session.regenerate()` (session-fixation defense) before establishing the authenticated session.

### Email infrastructure + verification (NEW)
- **D-18:** **Email provider = Resend.** HTTP API (no SMTP), simple Node SDK, free tier sufficient for low volume, good fit for Render. Wrapped behind a small `mailer` module so the provider is swappable and **gracefully degrades** (no-op + log if `RESEND_API_KEY` unset, consistent with the Redis/audio/storage optional-feature pattern). New env var: `RESEND_API_KEY` (+ a `FROM`/sender address).
- **D-19:** **Verification is async and non-blocking.** Email-account signup creates an active account immediately and sends a verification email, but play is **NOT gated** on verification (preserves guest-first low-friction ethos). `email_verified=false` until the link is clicked; profile may surface an "unverified" hint. A verification link endpoint flips the flag. Password reset is a standard tokenized email flow (request → emailed token link → set new password); reset tokens are single-use and time-limited (planner sets expiry, e.g. 1h).

### Cross-provider identity policy (NEW)
- **D-20:** **Keep accounts separate per provider.** Each `(type, external_id)` is its own account; the **same email arriving via different methods produces distinct accounts** (no auto-merge, no link-prompt this phase). Avoids email-spoofing trust issues and merge-transaction complexity. Account-merging-by-verified-email is deferred (see Deferred).

### Guest → account linking (PITFALLS #1 — carried, now applies to all 3 methods)
- **D-06 (carried):** **First-time sign-in (new provider credential):** promote the guest's existing `users` row — attach the new credential to the guest's current `user_id`, stamp `guest_migrated_at`, in a **single transaction**. The guest's user row *becomes* the account. `clientId` keeps working. Applies identically to google/facebook/email first sign-in.
- **D-07 (carried):** **Returning user (credential already maps to a different existing account):** adopt the guest credential into the existing account (re-point the `clientId` guest credential's `user_id`, UPDATE in a transaction). Throwaway empty guest `users` row left orphaned (harmless; cleanup deferred). No duplicate user, nothing deleted.

### Profile identity & stats (carried)
- **D-08 (carried):** Public profiles addressed by **opaque `users.id`** (or a short public token), not a username. No uniqueness/squatting/profanity surface this phase.
- **D-09 (carried + generalized):** **Display name = the provider display name, non-editable** this phase (Google/FB display name; for email accounts, derive from email local-part or prompt once at signup — planner's call). Guests keep their in-game nickname. `sanitizeProfile()` (server.js:172) handles HTML-escaping on persisted profile fields.
- **D-09b:** Where `display_name`/`avatar_url` persist (new columns on `users` vs small `profiles` table) — planner's call (no such column today). `avatar_url` nullable for email accounts.
- **D-10 (carried):** **Profile ships as a zero-state scaffold** — UI + stats-shaped read path returning zeros. Phase 3 fills real numbers with no UI rework. No ad-hoc win/loss counting this phase.

### Sign-in UX + socket auth
- **D-11 (carried):** **Socket.IO authenticates by sharing the express-session** (`io.engine.use(sessionMiddleware)`). One revocation path — deleting session rows kills socket auth too. Socket knows whether it's a signed-in account (needed for Phase 4 ranked gating).
- **D-12 (revised):** **UI entry point** — a "Sign in" affordance on the home/landing menu opening the auth screen; a header avatar+name once signed in (menu: View profile / Sign out / Sign out all devices). Does not touch the in-game battle screen.
- **D-21 (NEW):** **Auth screen layout = OAuth-primary + email collapsible.** Two prominent provider buttons (Sign in with Google, Sign in with Facebook) on top; an "or continue with email" control expands an email/password form (login + signup + "forgot password"). Keeps the OAuth fast-path prominent, email available without clutter.
- **D-13 (carried):** **All new auth/profile UI strings are bilingual EN/VI** — including FB button, email form labels, verification/reset copy, error messages.

### Claude's Discretion
- **OAuth/email lib choices (D-01/D-16/D-17):** user deferred. Passport google/facebook + bcrypt chosen; planner may substitute (e.g. `arctic`, argon2id) if a better fit, but MUST preserve D-05 (state + session regeneration), D-11 (session-shared socket auth), and the provider-generic schema (D-14).
- **Token storage shape** (D-15) — `auth_tokens` table vs columns for email-verification + password-reset tokens.
- **Where display_name/avatar_url persist** (D-09b) — `users` columns vs `profiles` table.
- **Session table DDL** — `connect-pg-simple` self-create vs numbered migration, consistent with Phase-1 migration-runner convention.
- **Exact cookie flags** (`httpOnly`, `secure`, `sameSite`) — per localhost/Render + `SITE_ORIGIN`, consistent with Phase-1 CSP.
- **Auth-route rate limiting** — extend Phase-1 `rate-limiter-flexible` to OAuth/login/signup/reset routes.
- **Reset/verification token expiry** — sensible defaults (e.g. reset 1h, verification 24h).
- **Email-account display name source** — derive from email vs prompt at signup.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope-change source of truth (read FIRST)
- This CONTEXT.md header block — the Google→3-method expansion and the ROADMAP/REQUIREMENTS contract-mismatch that must be fixed before replan passes review.

### Identity model & linking (CRITICAL — read before designing the link flow)
- `migrations/001_identity.sql` — live `users` + `credentials` schema this phase extends. New: `type ∈ {guest,google,facebook,email}`, `external_id` per-provider, nullable `password_hash`; dedup on `(type, external_id)`; `users.guest_migrated_at` reserved for D-06.
- `.planning/research/PITFALLS.md` §"Pitfall 1: Guest Identity Multiplied After OAuth Linking" — the failure mode D-06/D-07 avoid. Read before implementing the link transaction.
- `.planning/phases/01-foundation/01-CONTEXT.md` §`<decisions>` D-03/D-04 — rationale for the canonical identity model + guest-credential upsert this phase links from.

### Persistence & pool
- `db.js` — shared `pg.Pool` singleton; session store (D-02), token tables, and all link-flow queries reuse it (never a second pool — PITFALLS #4).
- `.planning/research/PITFALLS.md` §"Pitfall 4: Postgres Connection Pool Exhaustion".

### Security
- `.planning/research/PITFALLS.md` §"Security Mistakes" + §"Looks Done But Isn't Checklist" — OAuth `state`, session regeneration (SEC-05), cookie hardening, plus NEW for email/password: password-hash cost, reset-token single-use/expiry, login + signup + reset rate-limiting, verification-link tampering.
- `.planning/codebase/CONCERNS.md` #3 (profile/chat validation) — `sanitizeProfile()` reuse point for D-09.

### Facebook dev-identity caveat
- Memory note `fb-ig-dev-identity-limits` (user memory) — FB withholds player-identity APIs until the app is provisioned; relevant to Facebook OAuth testing expectations (real FB identities limited in dev).

### UI contract (NEEDS REVISION — currently Google-only)
- `.planning/phases/02-accounts-identity/02-UI-SPEC.md` — existing design contract covers Google sign-in only. Must be extended for the Facebook button + email/password form + verification/reset screens (D-21) — re-run `/gsd-ui-phase 2` or update during replan.

### Phase contract (acceptance source of truth — NEEDS UPDATE)
- `.planning/ROADMAP.md` §"Phase 2: Accounts & Identity" — goal + success criteria (currently Google-only; add FB + email/password criteria).
- `.planning/REQUIREMENTS.md` — SEC-05, AUTH-01..04, PROF-01/02 (add AUTH-05 FB, AUTH-06 email/password, AUTH-07 verification, AUTH-08 reset; line 89 "email rejected" row is now obsolete).

### Codebase orientation
- `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/STRUCTURE.md` — Socket.IO handlers, existing `clientId` flow, `public/app.jsx` screen-state.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.js` — shared `pg.Pool` singleton. Session store (D-02), token tables, all link queries reuse it.
- `migrations/001_identity.sql` + the Phase-1 migration runner — add `002_accounts.sql` (profile cols, password_hash, verification/reset token state, session table) following the numbered-file convention.
- `sanitizeProfile()` (`server.js:172`) — HTML-escaping for persisted display name (D-09).
- `clientId` flow + guest-credential upsert (connect/`resume`/`rejoin`, `GRACE_MS=180000` at `server.js:70`) — the link flow (D-06/D-07) hooks the existing guest identity path; instant guest play (AUTH-01) unchanged.
- Phase-1 `rate-limiter-flexible` setup — extend to OAuth/login/signup/reset routes (D-17).

### Established Patterns
- Server-authoritative validation, guard-clause early returns, structured error codes — add `AUTH_FAILED`, `OAUTH_STATE_MISMATCH`, `EMAIL_IN_USE`, `WEAK_PASSWORD`, `BAD_TOKEN`.
- Optional features degrade gracefully (Redis/audio/storage) — the `mailer` module (D-18) follows this: no-op + log when `RESEND_API_KEY` unset.
- Bilingual EN/VI i18n embedded in `public/app.jsx` / `public/index.html` (D-13).
- Screen-state-driven SPA (no router) — auth screen + profile view are new screen states/overlays, not routes.

### Integration Points
- Express: OAuth routes (`/auth/google`, `/auth/google/callback`, `/auth/facebook`, `/auth/facebook/callback`), email routes (`/auth/signup`, `/auth/login`, `/auth/verify`, `/auth/reset-request`, `/auth/reset`), sign-out routes (`/auth/signout`, `/auth/signout-all`), session middleware — mounted in `server.js` before Socket.IO setup.
- Socket.IO: `io.engine.use(sessionMiddleware)` so the handshake sees the session (D-11); handlers read authenticated `user_id` off the socket.
- `users` table needs `display_name`/`avatar_url` storage (D-09b) + email/verification state (D-15); `credentials` gains nullable `password_hash` (D-14).
- New `mailer` module (Resend) for verification + reset emails (D-18).
- Profile read path: stats-shaped query returning zeros now (D-10), filled by Phase 3 `matches`.

</code_context>

<specifics>
## Specific Ideas

Scope expanded mid-execute (at the 02-01 package-legitimacy gate, no commits made) — user wants Google + Facebook + email/password, all guest-first-additive. On the new gray areas the user chose: **Resend** for email infra; **login-immediately + verify-async** (non-blocking); **separate accounts per provider** (no email merge); **OAuth-buttons-primary with collapsible email form** for the sign-in screen. Earlier carried decisions (Passport sessions, Postgres store, promote-guest link flow, zero-state profile) accepted as recommended. `.planning/research/PITFALLS.md` (esp. Pitfall #1) remains the primary linking-flow reference.

</specifics>

<deferred>
## Deferred Ideas

- **Cross-provider account merging by verified email** — separate accounts per provider this phase (D-20); merge/link-prompt is a later enhancement (needs verified-email trust rules + merge transaction).
- **Usernames / custom handles** — opaque id now (D-08); `/u/handle` URLs are v2 polish.
- **Editable display name + avatar upload** — non-editable provider name this phase (D-09); editing is later.
- **Real win/loss/lifetime stats numbers** — Phase 3 (Match Recording) fills the zero-state scaffold (D-10).
- **Orphaned guest-user-row cleanup** — empty row from the D-07 conflict path is harmless; periodic sweep later if needed.
- **More OAuth providers** — `credentials.type` model (D-14) supports adding providers with no schema change.
- **Account deletion / GDPR data export** — not in scope.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 2-Accounts & Identity*
*Context gathered: 2026-06-02 (revised for 3-method scope)*
</content>
</invoke>
