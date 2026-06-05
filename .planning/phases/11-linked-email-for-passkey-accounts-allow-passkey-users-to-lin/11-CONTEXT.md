# Phase 11: Linked Email for Passkey Accounts - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

## Phase Boundary

Allow passkey-only users (who signed up via biometric without email) to link an email address and set a password from their profile page. This enables cross-device login — register on mobile with Face ID, later sign in on desktop via email/password, same account.

## Implementation Decisions

### Backend
- D-01: Email is linked immediately on submission — no verification step (email sending not implemented)
- D-02: Reuse existing `users.email` and credentials `password_hash` columns — no new tables or migrations
- D-03: Two API routes: POST /api/account/link-email, POST /api/account/set-password
- D-04: Server validates email format (regex) and uniqueness (not already linked to another account via credentials type='email')
- D-05: Password hashing uses bcrypt cost 10 (same as existing createEmailAccount)
- D-06: Minimum password length: 8 chars (same as existing WEAK_PASSWORD guard)
- D-07: Both routes require authenticated session (req.user must exist)

### Frontend
- D-08: ProfileView shows "Link Email" section only for passkey-only accounts (no email on user)
- D-09: If user already has email, show current email instead; hide link form
- D-10: After linking email, show password-set form
- D-11: After password is set, show success state with linked email display

### Claude's Discretion
- UI styling/layout within ProfileView (follow existing patterns)
- Error message wording (follow existing i18n patterns)
- Input validation UX (inline vs toast)

## Deferred Ideas

None — scope is tight.

---

*Phase: 11-linked-email-for-passkey-accounts*
*Context gathered: 2026-06-05*
