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

### Phase 11: Linked email for passkey accounts: allow passkey users to link email and set password for cross-device login

**Goal:** Allow users who signed up via passkey (biometric only, no email) to link an email address and optionally set a password from their profile page. This enables cross-device login — if they registered on mobile with Face ID, they can later sign in on desktop via email/password while retaining the same account, stats, and history.

**Requirements**:

- LINK-01: Profile page shows "Link Email" section for passkey-only accounts (accounts with no email linked)
- LINK-02: User can enter an email address; server validates format and uniqueness (not already linked to another account)
- LINK-03: Email is linked immediately upon submission (no verification step — email sending not implemented yet)
- LINK-04: After email is linked, user can set a password for the account (bcrypt hashed, same as existing email/password accounts)
- LINK-05: Once email+password are set, user can sign in via email/password on any device and access the same account (shared user_id)
- LINK-06: Profile page shows linked email and allows changing password if one is set
- LINK-07: If user already has an email (signed up via email/password originally), "Link Email" section is hidden; show current email instead
- LINK-08: Database: reuse existing `users.email`, `users.password_hash` columns — no new tables needed
- LINK-09: API routes: POST /api/account/link-email (link immediately), POST /api/account/set-password (set/change password)

**Depends on:** Phase 8 (WebAuthn passkey auth), Phase 10 (passkey fix)
**Plans:** 1 plan

Plans:

- [x] Plan 01: Link-email backend routes + ProfileView UI

### Phase 12: Merge Quick Play and Wagered Match: unified matchmaking button with conditional wager popup

**Goal:** Remove the separate "Wagered Match" section from the lobby. When the user taps "Quick Play": if they are a guest, join the free queue immediately (0 pts, no popup); if they are logged in, show a popup/bottom-sheet to select the wager amount (0/10/25/50/100), then join the queue with that stake. One button, one flow — simpler lobby UI.

**Requirements**:

- MERGE-01: Remove the entire `wager-strip` section (balance display, chip selector, "Wagered Match" button) from the Lobby component
- MERGE-02: When a logged-in user taps "Quick Play", show a BottomSheet/popup with stake options (Free / 10 / 25 / 50 / 100 pts) before joining the queue
- MERGE-03: When a guest taps "Quick Play", skip the popup entirely — join the free queue immediately with stake=0
- MERGE-04: The stake popup should show the user's current balance and disable options exceeding the balance
- MERGE-05: Remove the `onWageredMatch` prop and `handleWageredMatch` as a separate handler; unify into a single `handleQuickMatch(stake)` flow
- MERGE-06: Server-side joinQueue logic remains unchanged — "free" (stake=0) and "wagered" (stake>0) queue types still work the same way
- MERGE-07: Remove unused i18n keys related to the old separate wagered match button (`queue.wageredMatch`, etc.) or repurpose them
- MERGE-08: The Quick Play hero button text/style remains the same (yellow CTA, ⚡ icon)
- MERGE-09: Friends room wager selector in the BottomSheet remains unaffected (separate feature)

**Depends on:** Phase 7 (points economy)
**Plans:** 1 plan

Plans:

- [x] Plan 01: Unified Quick Play with conditional stake popup

### Phase 13: Match history: view past battles with results, points, and win/loss status

**Goal:** Allow authenticated users to view their past matches — opponent, result (win/loss), points wagered/earned, mode, time, and reason for match ending. Accessible from lobby via a "Lịch sử" button. Also show opponent win-rate popup when tapping their avatar in battle.

**Requirements**:

- HIST-01: GET /api/matches — paginated match history endpoint with offset pagination (page + limit, max 50)
- HIST-02: Dynamic filters — result (all/win/loss), mode (all/classic/advance), wager (all/has/none) via query params
- HIST-03: GET /api/profile/:userId returns real win/loss/winRate stats from matches table (replaces hardcoded zeros)
- HIST-04: MatchHistory screen — scrollable card list with opponent name, result badge, points +/-, mode chip, relative time
- HIST-05: IntersectionObserver infinite scroll — load more when sentinel visible (page size 20)
- HIST-06: Filter pills (sticky bar) — result/mode/wager filter groups with active state
- HIST-07: Opponent mini-profile popup in battle — click avatar shows win rate + total games
- HIST-08: Auth guard — 401 for unauthenticated API calls; lobby button hidden for guests
- HIST-09: i18n — full Vietnamese + English support for all history UI strings

**Depends on:** Phase 3 (match recording data)
**Plans:** 2 plans

Plans:

- [x] Plan 01: Backend API — getMatchHistory, getUserStats, GET /api/matches, upgrade /api/profile stats
- [x] Plan 02: Frontend — MatchHistory component, lobby button, filters, infinite scroll, opponent stats popup

### Phase 14: Premium animated emoji: purchasable GIF stickers that fly from sender to receiver avatar with explosion effects, deducted from points

**Goal:** Add a premium animated emoji system to in-game chat. Users can send special GIF-based stickers that play a fly-and-impact animation from the sender's avatar to the receiver's avatar (e.g., a bomb flies across and explodes on impact). These emoji cost points per use — deducted immediately on send. Start with 6 curated animated emoji. Regular text chat remains free.

**Requirements**:

- EMOJI-01: Database table `premium_emojis` — stores emoji catalog (id, name, slug, animation_url, preview_url, cost_points, description, sort_order, active)
- EMOJI-02: 6 initial animated emoji seeded into the catalog:
  1. 💣 Bomb (quả bom) — flies spinning and explodes on impact (cost: 5 pts)
  2. 🥊 Boxing Glove (đấm) — punches forward, receiver avatar shakes (cost: 3 pts)
  3. 💦 Splash (dội nước) — bucket of water flies and splashes on receiver (cost: 3 pts)
  4. 👋 Slap (tát) — hand flies fast, red impact mark + shake (cost: 3 pts)
  5. 😜 Tease (lêu lêu) — teasing face bounces in front of receiver (cost: 2 pts)
  6. 💋 Kiss (hôn) — lips float slowly with hearts trail (cost: 2 pts)
- EMOJI-03: Socket event `sendPremiumEmoji` — client sends emoji_id; server validates balance ≥ cost, deducts points atomically, broadcasts animation event to room
- EMOJI-04: Server-side validation — reject if: insufficient points, emoji not active, user is guest (must be authenticated), not in active battle phase
- EMOJI-05: Client animation system — emoji sprite/GIF flies from sender avatar position → receiver avatar position with easing curve, then plays impact animation (CSS/JS keyframes or Lottie)
- EMOJI-06: Impact effects per emoji type — each emoji has a unique arrival animation (explosion, shake, splash, zap, etc.) rendered on/over the receiver's avatar area
- EMOJI-07: Emoji picker panel in battle chat — grid of 6 emoji with preview thumbnails + point cost badge; disabled items greyed out if insufficient balance
- EMOJI-08: Real-time balance display in emoji picker showing current points (updates after each send)
- EMOJI-09: Cooldown — 5 second cooldown between premium emoji sends per user (prevents spam, server-enforced)
- EMOJI-10: GET /api/emojis — returns active emoji catalog with costs (public, cached)
- EMOJI-11: Animation assets — lightweight GIF/spritesheet/Lottie files for each emoji (< 100KB each), served from /public/emojis/
- EMOJI-12: i18n — emoji names and descriptions in Vietnamese + English
- EMOJI-13: Sound effect (optional) — short SFX on impact (muted by default, respects user sound preference)
- EMOJI-14: Guest users see a "Đăng nhập để dùng / Sign in to use" prompt when tapping emoji picker

**Depends on:** Phase 7 (points economy — points balance and deduction API)
**Plans:** 3 plans

Plans:

- [ ] Plan 01: Backend — Database migration (premium_emojis table + seed), GET /api/emojis endpoint, socket handler sendPremiumEmoji with validation + debit + cooldown
- [ ] Plan 02: Frontend — Emoji picker tab in ChatComposer, animation overlay component (flight + impact), premiumEmoji socket listener + queue
- [ ] Plan 03: Animation assets + avatar-targeted positioning + per-emoji impact effects + i18n + mobile polish + edge cases
