# Phase 2: Accounts & Identity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02 (scope-expansion revision)
**Phase:** 2-accounts-identity
**Areas discussed:** Email infra, Email verification policy, Cross-provider identity, Sign-in UI

**Context:** Re-discussion triggered by mid-execute scope expansion — Phase 2 grew from
Google-only to Google + Facebook + email/password. Existing Google-only CONTEXT.md and
4 plans superseded. User chose "Update context, replan after."

---

## Email infrastructure

| Option | Description | Selected |
|--------|-------------|----------|
| Resend | HTTP API, free tier ~3k/mo, simple Node SDK, good Render fit | ✓ |
| SendGrid | Mature, larger free tier, heavier setup | |
| SMTP (Gmail/Mailgun) | Generic nodemailer + SMTP, most portable, more moving parts | |
| Defer email entirely | Ship email/password without verification or reset | |

**User's choice:** Resend
**Notes:** No email infra in stack today; needed for verification + password reset. Wrapped behind a swappable, gracefully-degrading `mailer` module (D-18).

---

## Email verification policy

| Option | Description | Selected |
|--------|-------------|----------|
| Login immediately, verify async | Account active on signup; verification email sent but play NOT blocked | ✓ |
| Must verify before login | Cannot sign in until email confirmed; strongest anti-spam, most friction | |
| No verification at all | Any email valid on signup | |

**User's choice:** Login immediately, verify async (D-19)
**Notes:** Preserves guest-first low-friction ethos. `email_verified` flag, profile hint for unverified.

---

## Cross-provider identity

| Option | Description | Selected |
|--------|-------------|----------|
| Keep separate accounts | Each (provider, provider_user_id) is its own account; same email across providers = distinct | ✓ |
| Auto-merge by verified email | Link providers sharing a verified email; needs trust rules + merge txn | |
| Prompt user to link | Detect collision, ask; best UX, most edge-cases | |

**User's choice:** Keep separate accounts (D-20)
**Notes:** Avoids email-spoofing trust issues and merge complexity. Merge-by-verified-email deferred.

---

## Sign-in UI

| Option | Description | Selected |
|--------|-------------|----------|
| OAuth buttons primary + email collapsible | Google + FB buttons on top; "or continue with email" expands form | ✓ |
| All three equal, stacked | All shown equal weight; busier | |
| Tabbed | Social vs Email tabs; hides one method | |

**User's choice:** OAuth-primary + collapsible email form (D-21)
**Notes:** Keeps OAuth fast-path prominent, email available without clutter.

---

## Claude's Discretion

- OAuth/email lib choices (Passport google/facebook + bcrypt; substitution allowed if D-05/D-11/D-14 preserved)
- Token storage shape (auth_tokens table vs columns)
- display_name/avatar_url persistence location
- Session table DDL (self-create vs migration)
- Cookie flags, reset/verification token expiry
- Auth-route rate limiting (extend Phase-1 limiter)
- Email-account display-name source

## Deferred Ideas

- Cross-provider account merging by verified email
- Usernames / custom handles
- Editable display name + avatar upload
- Real win/loss stats numbers (Phase 3)
- Orphaned guest-user-row cleanup
- More OAuth providers (schema already supports)
- Account deletion / GDPR export

## Flagged for follow-up (not a gray area)

- **Contract mismatch:** ROADMAP.md + REQUIREMENTS.md still Google-only. Must add AUTH-05/06/07/08 + success criteria via `/gsd-phase` before replan passes plan-checker/verifier.
- **UI-SPEC stale:** 02-UI-SPEC.md covers Google sign-in only; extend for FB button + email form + verify/reset screens.
