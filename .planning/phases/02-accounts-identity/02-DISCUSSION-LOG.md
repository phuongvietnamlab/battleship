# Phase 2: Accounts & Identity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 2-Accounts & Identity
**Areas discussed:** OAuth + session mechanism, Guest→account link & conflicts, Profile identity & stats, Sign-in UX + socket auth

---

## OAuth + session mechanism

### OAuth library
| Option | Description | Selected |
|--------|-------------|----------|
| Passport + google-oauth20 | Battle-tested Express standard; handles redirect/callback, integrates with express-session | ✓ |
| Hand-rolled OAuth | Manual auth-code flow, zero deps, own all correctness | |
| Lightweight lib (arctic) | Modern minimal OAuth helper, lighter than Passport | |

**User's choice:** Deferred to Claude — "hãy chọn cái gì mà bạn cảm thấy phù hợp nhất" (choose whatever is most suitable). Claude selected Passport + passport-google-oauth20.
**Notes:** Logged as Claude's discretion; planner may swap to a lighter lib if it preserves state-param + session regeneration and session-shared socket auth.

### Session store
| Option | Description | Selected |
|--------|-------------|----------|
| Postgres session store | express-session + connect-pg-simple; revoke = delete rows; reuses pg.Pool | ✓ |
| Redis session store | connect-redis; fast, TTL expiry; revoke-all needs key scanning | |
| Stateless JWT | No server store; server-side revocation hard — conflicts with AUTH-04 | |

**User's choice:** Postgres session store.

### Session lifetime
| Option | Description | Selected |
|--------|-------------|----------|
| 30-day rolling | maxAge 30d, refreshed each visit | ✓ |
| Long fixed (90d) | Absolute expiry, no renewal | |
| Short + silent re-auth | ~7d leaning on Google re-auth | |

**User's choice:** 30-day rolling.

---

## Guest→account link & conflicts

### Conflict: returning Google user with a guest clientId that has history
| Option | Description | Selected |
|--------|-------------|----------|
| Adopt guest creds into account | Re-point clientId credential to the existing Google user; no dup, nothing deleted | ✓ |
| Account wins, guest discarded | Existing account active, guest history abandoned | |
| Merge histories | Transfer all guest history onto account; complex/ambiguous | |

**User's choice:** Adopt guest creds into account.

### First-time sign-in (new Google sub)
| Option | Description | Selected |
|--------|-------------|----------|
| Promote guest's user | Attach Google cred to guest's existing user_id, stamp guest_migrated_at, one txn | ✓ |
| New user + relink | Create fresh users row, move guest cred, delete old row | |

**User's choice:** Promote guest's user.

---

## Profile identity & stats

### Public profile addressing
| Option | Description | Selected |
|--------|-------------|----------|
| Opaque user id | Address by users.id / short token; no uniqueness surface | ✓ |
| Unique username | /u/handle; adds username table + validation + squatting concerns | |
| Display name (non-unique) | Names collide; can't reliably resolve | |

**User's choice:** Opaque user id.

### Display name source
| Option | Description | Selected |
|--------|-------------|----------|
| Google name, non-editable | Use Google display name; no edit UI | ✓ |
| Google name, editable | Prefill + override; adds edit form + validation | |
| Reuse existing nickname | Keep guest nickname, ignore Google name | |

**User's choice:** Google name, non-editable.

### Stats before Phase 3
| Option | Description | Selected |
|--------|-------------|----------|
| Zero-state scaffold | Profile UI + stats read path returning zeros; Phase 3 fills it | ✓ |
| Hide stats until Phase 3 | Identity only now | |
| Track minimal stats now | Ad-hoc counters; duplicates Phase 3 logic | |

**User's choice:** Zero-state scaffold.

---

## Sign-in UX + socket auth

### Socket.IO authentication
| Option | Description | Selected |
|--------|-------------|----------|
| Share express-session | io.engine.use(sessionMiddleware); handshake reads session cookie; one revocation path | ✓ |
| Token in handshake auth | Issue token, verify on connect; second revocation path | |
| Keep clientId only | Socket stays guest-style; blocks Phase 4 ranked gating | |

**User's choice:** Share express-session.

### Sign-in UI placement
| Option | Description | Selected |
|--------|-------------|----------|
| Home/menu + header avatar | Button on home menu; avatar+name header menu once signed in | ✓ |
| Modal from anywhere | Persistent account button opening a modal | |
| Dedicated account screen | Separate routed screen | |

**User's choice:** Home/menu + header avatar.

### Sign-out options
| Option | Description | Selected |
|--------|-------------|----------|
| Both options | "Sign out" (this device) + "Sign out all devices" | ✓ |
| All-devices only | Single sign-out kills all sessions | |
| This-device only | Doesn't satisfy AUTH-04 | |

**User's choice:** Both options.

---

## Claude's Discretion

- OAuth library choice (user explicitly deferred — Passport selected).
- Where `display_name` / `avatar_url` are persisted (new `users` columns vs `profiles` table).
- Session table DDL (connect-pg-simple auto-create vs a `002_*.sql` migration).
- Exact cookie flags (httpOnly/secure/sameSite) per deployment.
- Auth-route rate limiting (extend Phase-1 limiter).

## Deferred Ideas

- Usernames / custom handles (v2).
- Editable display name + avatar upload.
- Real win/loss stats numbers (Phase 3).
- Orphaned guest-user-row cleanup.
- Additional OAuth providers (Facebook/Instagram).
- Account deletion / GDPR export.
