# Phase 8: Auth Migration — Replace OAuth with WebAuthn Passkeys

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 replaces the Google/Facebook OAuth sign-in methods with WebAuthn/Passkeys (FIDO2 standard), providing biometric authentication across all platforms. Email/password remains as fallback.

### What changes:
1. **Remove Google OAuth** — strategy, routes (`/auth/google`, `/auth/google/callback`), `passport-google-oauth20` package
2. **Remove Facebook OAuth** — strategy, routes (`/auth/facebook`, `/auth/facebook/callback`), data-deletion callback, `passport-facebook` package
3. **Remove Passport.js entirely** — replaced by `@simplewebauthn/server` for WebAuthn + existing manual session management for email/password
4. **Add WebAuthn/Passkeys** — biometric sign-in (Face ID, Touch ID, Windows Hello, fingerprint) as the PRIMARY auth method
5. **Keep email/password** — fallback for devices/browsers that don't support WebAuthn
6. **Keep guest-first** — no change to instant guest play via clientId

### User experience by platform:
| Platform | Primary auth | Fallback |
|----------|-------------|----------|
| iPhone (Safari) | Face ID / Touch ID | Email/password |
| Android (Chrome) | Fingerprint / Face Unlock | Email/password |
| Mac (Safari/Chrome) | Touch ID / iCloud Keychain | Email/password |
| Windows (Chrome/Edge) | Windows Hello (PIN/fingerprint/face) | Email/password |
| Linux/older browsers | — | Email/password |

### What stays the same:
- Guest-first play (AUTH-01) — unchanged
- express-session + connect-pg-simple sessions — unchanged
- Socket.IO session sharing (D-11) — unchanged
- Email/password signup + login — unchanged (just remove Passport wrapping)
- Guest → account linking flow — unchanged logic (D-06/D-07)
- Profile system — unchanged
- Session revocation (sign out / sign out all) — unchanged

**Not in this phase:** Email verification, password reset via email (no email infra), multi-device passkey sync (handled by platform automatically), account merging.

</domain>

<decisions>
## Implementation Decisions

### WebAuthn library
- **D-01:** Use `@simplewebauthn/server` (server-side) + `@simplewebauthn/browser` (client-side). Well-maintained, TypeScript, abstracts CBOR/attestation complexity. No native app needed — pure web standard.

### Credential storage
- **D-02:** New migration `00X_webauthn.sql` adds `webauthn_credentials` table:
  ```sql
  CREATE TABLE webauthn_credentials (
    id TEXT PRIMARY KEY,               -- base64url credential ID
    user_id INTEGER NOT NULL REFERENCES users(id),
    public_key BYTEA NOT NULL,         -- credential public key
    counter BIGINT NOT NULL DEFAULT 0, -- signature counter (replay protection)
    transports TEXT[],                 -- ['internal','hybrid'] etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_webauthn_user ON webauthn_credentials(user_id);
  ```

### Registration flows
- **D-03:** Two passkey registration paths:
  1. **Existing email user adds passkey** — logged-in user → "Add Passkey" in profile/settings → biometric prompt → credential stored
  2. **Guest creates passkey-only account** — guest → "Create Account with Passkey" → biometric prompt → new user created + credential stored + guest linked (D-06 flow)

### Authentication flow
- **D-04:** Passkey login flow:
  1. User taps "Sign in with Passkey"
  2. Server generates challenge (`generateAuthenticationOptions`)
  3. Browser triggers biometric prompt (platform authenticator)
  4. Browser returns assertion to server
  5. Server verifies (`verifyAuthenticationResponse`) against stored credential
  6. Session established (same as current email login: `req.session.regenerate` → stamp `user_id` → `req.session.save`)

### Session management (NO Passport)
- **D-05:** Remove Passport entirely. Email login already does manual `req.session.regenerate` + `req.login` equivalent (stamps user_id). Refactor to pure express-session:
  - Remove `passport.initialize()`, `passport.session()`, `passport.serializeUser`, `passport.deserializeUser`
  - Login = `req.session.regenerate()` → `req.session.user_id = user.id` → `req.session.save()`
  - `req.user` population via a simple middleware: read `req.session.user_id` → query user → attach to `req.user`
  - Socket.IO session sharing unchanged (reads session from cookie)

### Relying Party configuration
- **D-06:** WebAuthn RP config from environment:
  - `RP_NAME` = "Battleship Online" (display name)
  - `RP_ID` = domain (e.g., "battleshiponline.xyz" in prod, "localhost" in dev)
  - `RP_ORIGIN` = full origin (e.g., "https://battleshiponline.xyz")
  - Falls back to `SITE_ORIGIN` env var already in use

### UI changes
- **D-07:** Auth screen layout changes:
  - Remove "Sign in with Google" and "Sign in with Facebook" buttons
  - Add "Sign in with Passkey 🔐" as PRIMARY large button (top)
  - Email/password form below (secondary, collapsible)
  - "Create Account" flow: offer passkey-first, email/password as alternative
  - Feature-detect WebAuthn: if `!window.PublicKeyCredential`, hide passkey button, show only email/password

### Bilingual
- **D-08:** All new UI strings bilingual EN/VI (existing i18n pattern in app.jsx)

</decisions>

<canonical_refs>
## Canonical References

### Identity model (extends)
- `migrations/001_identity.sql` — `users` + `credentials` tables
- `db.js` — `linkOrPromoteAccount`, `createEmailAccount`, `verifyEmailLogin`

### Current OAuth code (to remove)
- `server.js` lines ~71-312 — Passport setup, Google/Facebook strategies, OAuth routes
- `package.json` — `passport`, `passport-google-oauth20`, `passport-facebook`

### Session infrastructure (keep)
- `server.js` — `sessionMiddleware`, `express-session` + `connect-pg-simple`
- Socket.IO `io.engine.use(sessionMiddleware)`

### Email auth (keep, refactor slightly)
- `server.js` — `/auth/signup`, `/auth/login` routes
- `db.js` — `createEmailAccount`, `verifyEmailLogin`

### Client UI
- `public/app.jsx` — auth screen, sign-in buttons, i18n

### Env vars to ADD
- `RP_ID`, `RP_NAME`, `RP_ORIGIN` (or derive from existing `SITE_ORIGIN`)

### Env vars to REMOVE
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_CALLBACK_URL`

</canonical_refs>

<code_context>
## Existing Code Insights

### Code to REMOVE
- `passport`, `passport-google-oauth20`, `passport-facebook` from package.json
- Passport strategy definitions (Google + Facebook) in server.js
- `passport.serializeUser` / `passport.deserializeUser`
- `app.use(passport.initialize())` / `app.use(passport.session())`
- Routes: `/auth/google`, `/auth/google/callback`, `/auth/facebook`, `/auth/facebook/callback`
- Facebook data-deletion callback route
- OAuth-related comments and rate-limiter references specific to OAuth

### Code to ADD
- `@simplewebauthn/server` dependency
- `@simplewebauthn/browser` (bundled into client via esbuild)
- WebAuthn routes: `/auth/webauthn/register-options`, `/auth/webauthn/register-verify`, `/auth/webauthn/login-options`, `/auth/webauthn/login-verify`
- `webauthn_credentials` table migration
- Simple user-loading middleware to replace Passport's deserializeUser
- Client-side WebAuthn registration + authentication flows in app.jsx

### Code to REFACTOR
- Email login currently uses `req.login()` (Passport method) — replace with manual session stamp
- Sign-out routes may reference Passport's `req.logout()` — replace with `req.session.destroy()`

### Patterns to follow
- Migration numbered files (`migrations/00X_webauthn.sql`)
- Guard-clause early returns with structured error codes
- Rate limiting via existing `authLimiter` (RateLimiterMemory)
- Bilingual EN/VI strings
- Optional feature degradation (if WebAuthn not supported → email/password only)

</code_context>

<deferred>
## Deferred Ideas

- **Passkey cross-device sync** — handled automatically by platform (iCloud Keychain, Google Password Manager)
- **Multiple passkeys per user** — supported by schema, management UI deferred
- **Email verification** — no email infra, skip for now
- **Password reset via email** — no email infra, skip for now
- **Account recovery if passkey lost** — email/password serves as recovery path
- **Discoverable credentials (resident keys)** — nice-to-have, can add later for true usernameless login
</deferred>

---

*Phase: 8-Auth Migration: Replace OAuth with WebAuthn Passkeys*
*Context gathered: 2026-06-05*
