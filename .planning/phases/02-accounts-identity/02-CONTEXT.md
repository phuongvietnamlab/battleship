# Phase 2: Accounts & Identity - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers optional, additive accounts on top of guest-first play:

1. **Google OAuth sign-in (AUTH-02, SEC-05)** — a player can sign in with Google to create/activate a persistent account. The OAuth callback validates a random `state` and regenerates the session after login.
2. **Guest → account linking (AUTH-03)** — on sign-in, the guest's existing `clientId` identity is linked atomically to the account; no history lost, no duplicate user.
3. **Persistent + revocable sessions (AUTH-04)** — a signed-in player stays logged in across visits and can revoke access server-side (sign out, and sign out from all devices).
4. **Guest preservation (AUTH-01)** — instant guest play via `clientId` is unchanged; no sign-in prompt, no friction.
5. **Player profiles (PROF-01, PROF-02)** — a signed-in player can view their own profile (win/loss + lifetime stats); any player can view another player's public profile.

**Not in this phase:** match recording / real stats numbers (Phase 3 — profile ships with a zero-state scaffold now), ELO/ranked (Phase 4), matchmaking queue (Phase 5), bot tiers (Phase 6). No `matches`/`ratings`/`queue` tables created here. No email/password auth (out of scope, Google-only).

**Builds on Phase 1 (locked):** the canonical `users` + `credentials` identity model (`migrations/001_identity.sql`) is already live. Guests are `type='guest'`, `external_id=clientId`; Google creds will be `type='google'`, `external_id=sub`; dedup is on the `credentials (type, external_id)` unique constraint. `users.guest_migrated_at` column is reserved for this phase's link flow.

</domain>

<decisions>
## Implementation Decisions

### OAuth + session mechanism
- **D-01:** Implement Google OAuth with **Passport.js + `passport-google-oauth20`**. Battle-tested Express standard, handles the redirect/callback dance, lowest custom-crypto risk. (User deferred to Claude — "choose what's most suitable"; this is the recommended pick.)
- **D-02:** Sessions use **`express-session` + `connect-pg-simple`** — a **Postgres-backed session store** reusing the shared `pg.Pool` from `db.js`. One source of truth alongside identity; survives server restart.
- **D-03:** **Server-side revocation = delete session rows.** "Sign out all devices" deletes all session rows for a `user_id`; "Sign out (this device)" destroys the current session only. The account menu offers **both** options (satisfies AUTH-04).
- **D-04:** **Session lifetime: 30-day rolling cookie** (`maxAge` 30d, refreshed each visit). Feels "always logged in" for active players; idle accounts expire after 30 days.
- **D-05:** **SEC-05** is satisfied by the Passport + express-session pairing: Passport's Google strategy carries a random `state` parameter validated on callback, and the login handler calls `req.session.regenerate()` (session fixation defense) before establishing the authenticated session.

### Guest → account linking (PITFALLS #1)
- **D-06 (first-time sign-in, new Google `sub`):** **Promote the guest's existing `users` row.** Attach the new `type='google'` credential to the guest's current `user_id`, stamp `guest_migrated_at`, in a **single transaction** (INSERT credential + UPDATE users). The guest's user row *becomes* the account — zero history to migrate, naturally atomic (AUTH-03). `clientId` keeps working unchanged.
- **D-07 (returning Google user, `sub` already maps to a different existing account):** **Adopt the guest credential into the existing account.** Re-point the `clientId` guest credential's `user_id` to the existing Google user (UPDATE within a transaction). The guest's throwaway/empty `users` row is left orphaned (harmless; cleanup deferred). No duplicate user created, nothing deleted — avoids the "guest identity multiplied after OAuth linking" pitfall.

### Profile identity & stats
- **D-08:** **Public profiles are addressed by opaque `users.id`** (or a short public token derived from it), not a username. No uniqueness/squatting/profanity surface this phase. Usernames are a possible v2 polish (deferred).
- **D-09:** **Display name = the Google account display name, non-editable** this phase. Guests keep their existing in-game nickname. No edit form, no new validation surface; existing `sanitizeProfile()` (server.js:172) handles name HTML-escaping for stored-XSS on persisted profile fields.
- **D-10:** **Profile ships as a zero-state scaffold.** Build the profile UI + a stats-shaped read path that returns zeros ("0 wins, 0 losses, no games yet"). Phase 3 match recording fills it with real numbers with no UI rework. Do **not** start ad-hoc win/loss counting this phase (that's Phase 3 scope).

### Sign-in UX + socket auth
- **D-11:** **Socket.IO authenticates by sharing the express-session.** Wrap the session middleware into Socket.IO's engine (`io.engine.use(sessionMiddleware)`) so the handshake reads the same session cookie. One revocation path — deleting session rows kills socket auth too. The in-game socket knows whether it's a signed-in account (needed for Phase 4 ranked gating).
- **D-12:** **UI entry point: "Sign in with Google" on the home/landing menu; a header avatar+name once signed in**, opening a menu (View profile / Sign out / Sign out all devices). Does not touch the in-game battle screen — lowest disruption to existing flow.
- **D-13:** **All new auth/profile UI strings are bilingual EN/VI** (compatibility constraint — i18n strings embedded in `public/app.jsx` / `public/index.html`).

### Claude's Discretion
- **OAuth library choice (D-01):** user explicitly deferred ("choose what's most suitable"). Passport chosen; planner may substitute a lighter lib (e.g. `arctic`) if it proves a better fit, but must preserve D-05 (state + session regeneration) and D-11 (session-shared socket auth).
- **Where display_name / avatar_url are persisted** (new columns on `users` vs a small `profiles` table) — planner's call. The `users` table currently has no name/avatar column; one is needed for D-08/D-09 public-profile rendering by id.
- **Session table DDL** — `connect-pg-simple` ships its own `session` table schema; whether it's created by the store's auto-create or a numbered migration (`migrations/002_*.sql`) is planner's call, consistent with the Phase-1 migration-runner convention (D-01/D-02 of Phase 1).
- **Exact cookie flags** (`httpOnly`, `secure`, `sameSite`) — planner sets per the localhost-EC2 / `SITE_ORIGIN` deployment, consistent with the Phase-1 CSP work.
- **Auth-route rate limiting** — extend the Phase-1 `rate-limiter-flexible` setup to the OAuth/login routes if cheap; not a gray area the user needs to decide.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Identity model & linking (CRITICAL — read before designing the link flow)
- `migrations/001_identity.sql` — the live `users` + `credentials` schema this phase extends. Google creds = `type='google'`, `external_id=sub`; dedup on `(type, external_id)`; `users.guest_migrated_at` reserved for D-06.
- `.planning/research/PITFALLS.md` §"Pitfall 1: Guest Identity Multiplied After OAuth Linking" — the failure mode D-06/D-07 are designed to avoid. Read before implementing the link transaction.
- `.planning/phases/01-foundation/01-CONTEXT.md` §`<decisions>` D-03/D-04 — rationale for the canonical identity model and the guest-credential upsert this phase links from.

### Persistence & pool
- `db.js` — the shared `pg.Pool` singleton; the session store (D-02) and all link-flow queries reuse it (never a second pool — PITFALLS #4).
- `.planning/research/PITFALLS.md` §"Pitfall 4: Postgres Connection Pool Exhaustion" — pool reuse caveats.

### Security
- `.planning/research/PITFALLS.md` §"Security Mistakes" + §"\"Looks Done But Isn't\" Checklist" — OAuth `state`, session regeneration (SEC-05), cookie hardening verification cues.
- `.planning/codebase/CONCERNS.md` #3 (profile/chat validation) — `sanitizeProfile()` is the reuse point for D-09.

### Phase contract (acceptance source of truth)
- `.planning/ROADMAP.md` §"Phase 2: Accounts & Identity" — goal + 5 success criteria.
- `.planning/REQUIREMENTS.md` — SEC-05, AUTH-01..04, PROF-01, PROF-02.

### Codebase orientation
- `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/STRUCTURE.md` — where Socket.IO handlers, the existing `clientId` flow, and `public/app.jsx` screen-state live.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.js` — shared `pg.Pool` singleton (Phase 1). Session store (D-02) and all link queries reuse it.
- `migrations/001_identity.sql` + the custom migration runner (Phase 1) — add a `002_*.sql` for any new columns/session table following the same numbered-file convention.
- `sanitizeProfile()` (`server.js:172`) — name/photo HTML-escaping; reuse for the persisted Google display name (D-09).
- `clientId` flow + guest-credential upsert (connect/`resume`/`rejoin`, `GRACE_MS=180000` at `server.js:70`) — the link flow (D-06/D-07) hooks the existing guest identity path; instant guest play (AUTH-01) stays unchanged.

### Established Patterns
- Server-authoritative validation, guard-clause early returns, structured error codes (`ROOM_NOT_FOUND`, `RATE_LIMITED`, `BAD_STATE`) — add named codes for auth failures (e.g. `AUTH_FAILED`, `OAUTH_STATE_MISMATCH`).
- Bilingual EN/VI i18n strings embedded in `public/app.jsx` / `public/index.html` (D-13).
- Screen-state-driven SPA (no router) — the sign-in entry / profile view (D-12) are new screen states / overlays, not new routes.

### Integration Points
- Express: new OAuth routes (`/auth/google`, `/auth/google/callback`), session middleware, sign-out routes — mounted in `server.js` before Socket.IO setup.
- Socket.IO: `io.engine.use(sessionMiddleware)` so the handshake sees the session (D-11); handlers can read the authenticated `user_id` off the socket.
- `users` table needs a `display_name` / `avatar_url` storage decision (no such column today) for public-profile rendering by opaque id (D-08/D-09).
- Profile read path: a stats-shaped query returning zeros now (D-10), filled by Phase 3 `matches`.

</code_context>

<specifics>
## Specific Ideas

User deferred the OAuth library choice explicitly ("hãy chọn cái gì mà bạn cảm thấy phù hợp nhất" — choose whatever is most suitable) and accepted the recommended option on every other decision. No "I want it like X" reference designs beyond the locked decisions. `.planning/research/PITFALLS.md` (esp. Pitfall #1) is the primary design reference for the linking flow.

</specifics>

<deferred>
## Deferred Ideas

- **Usernames / custom handles** — addressing profiles by opaque id now (D-08); unique usernames with `/u/handle` URLs are a v2 polish.
- **Editable display name + avatar upload** — non-editable Google name this phase (D-09); profile editing is a later enhancement.
- **Real win/loss/lifetime stats numbers** — Phase 3 (Match Recording) fills the zero-state scaffold (D-10).
- **Orphaned guest-user-row cleanup** — the empty `users` row left by the D-07 conflict path is harmless; a periodic cleanup sweep can come later if it matters.
- **Additional OAuth providers (e.g. Facebook/Instagram)** — Google-only this milestone; the `credentials.type` model already supports adding providers without schema change. (See memory note on FB/IG dev-identity provisioning limits if ever revisited.)
- **Account deletion / GDPR data export** — not in scope this phase.

</deferred>

---

*Phase: 2-Accounts & Identity*
*Context gathered: 2026-06-02*
