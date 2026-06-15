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

### Phase 15: Power-up redesign: remove advance mode, new purchase-based power-up system

**Goal:** Replace the dual-mode (Classic/Advance) power-up system with a unified single-mode game where players purchase up to 2 power-ups (Sonar Ping, Cross Missile, Decoy, Scatter Blast) during the placement phase using 10% of the match stake. Remove all advance-mode code, random spawning, and mid-match shop.

**Requirements**: See `.kiro/specs/power-up-redesign/requirements.md`
**Depends on:** Phase 7 (wallet/points economy), Phase 2 (auth)
**Plans:** 6 plans

Plans:

- [ ] Plan 01: Legacy removal — remove advance mode & old power-up system
- [ ] Plan 02: New purchase system — server-side placement-phase shop
- [ ] Plan 03: Power-up implementations — server-side game logic (sonar, cross, scatter, decoy)
- [ ] Plan 04: Client UI — placement shop + decoy placement
- [ ] Plan 05: Client UI — battle phase power-ups (sonar DnD, cross aim, scatter)
- [ ] Plan 06: Integration testing + edge cases

### Phase 16: Admin dashboard: full-featured admin panel with CRUD management, analytics, security, and operational controls

**Goal:** Build a comprehensive, secure admin panel at `/admin` with role-based access control, full CRUD management of all game entities (users, matches, points, emojis, power-ups, reports), real-time analytics dashboard with charts, operational controls (ban/unban, point adjustments, season resets, server health), and audit logging. The admin UI should be professionally designed with a modern sidebar layout, dark/light theme, responsive design, and Vietnamese/English i18n. Separate React app bundled independently from the game client.

**Requirements**:

**Authentication & Authorization:**

- ADM-01: Admin role system — `admin_roles` table (user_id, role ENUM['super_admin', 'admin', 'moderator'], granted_by, granted_at); first admin bootstrapped via CLI
- ADM-02: Admin login page — separate auth flow at `/admin/login`; requires admin role + password re-verification (not just session)
- ADM-03: Role-based permissions — super_admin (all), admin (CRUD + analytics, no role management), moderator (read-only + ban/mute actions)
- ADM-04: Admin session — separate cookie/token from player sessions; 2-hour expiry with sliding window; logout invalidates immediately
- ADM-05: IP allowlist (optional) — configurable ADMIN_ALLOWED_IPS env var; rejects non-allowlisted IPs with 403
- ADM-06: Audit log — every admin action logged to `admin_audit_log` table (admin_id, action, target_type, target_id, details_json, ip, timestamp)
- ADM-07: Rate limiting — strict rate limit on admin login (5 attempts/15min per IP); admin API endpoints (60 req/min)

**Dashboard & Analytics:**

- ADM-08: Overview dashboard — cards showing: total users, active today (DAU), matches today, revenue (points spent), online now (WebSocket count)
- ADM-09: User growth chart — line chart showing daily new registrations over last 30/90/365 days (selectable range)
- ADM-10: Match activity chart — bar chart showing daily matches played, split by mode (classic/ranked/bot)
- ADM-11: Points economy chart — line chart showing daily points earned vs spent (balance health indicator)
- ADM-12: Revenue metrics — total points purchased via emoji/power-ups, top spenders, conversion rate (guest→registered)
- ADM-13: Real-time stats panel — live WebSocket-fed counter of: players online, active matches, queue sizes, server memory/CPU
- ADM-14: Retention metrics — D1/D7/D30 retention cohort table; returning users percentage

**User Management (CRUD):**

- ADM-15: User list — paginated table with search (by name/email/ID), sortable columns, bulk actions
- ADM-16: User detail view — profile info, auth methods linked, match history, point balance, transaction log, ban history
- ADM-17: Edit user — change display_name, avatar_url, email (with reason logged); reset password
- ADM-18: Ban/unban user — temporary (duration) or permanent ban; ban reason required; bans enforced on WebSocket connect + API calls
- ADM-19: Mute user — disable chat for a user (duration-based); server-enforced on chat events
- ADM-20: Point adjustment — manually add/deduct points with mandatory reason (logged to audit); no negative balance
- ADM-21: Delete user — soft-delete (set deleted_at, anonymize PII); hard-delete option for GDPR with confirmation
- ADM-22: User export — CSV export of user list with filters applied

**Match Management:**

- ADM-23: Match list — paginated table with filters (date range, mode, status, player), sortable
- ADM-24: Match detail — full match info: players, boards (visual grid), moves sequence, result, duration, points wagered/awarded
- ADM-25: Void match — admin can void a match (reverse point transactions, mark as voided with reason); does not affect ratings retroactively
- ADM-26: Live matches — list of currently active matches with ability to spectate (read-only board view via admin WebSocket)

**Content Management:**

- ADM-27: Emoji management — CRUD for premium_emojis table; upload/replace animation assets; toggle active/inactive; edit cost
- ADM-28: Power-up management — edit power-up costs, enable/disable individual power-ups
- ADM-29: Announcement system — create/schedule server-wide announcements shown as banner in game lobby (title, body, type, start_at, end_at)
- ADM-30: i18n management — view/edit translation strings for EN/VI from admin (stored in DB, overrides file-based defaults)

**Moderation:**

- ADM-31: Report queue — view player reports (chat abuse, cheating); mark as resolved/dismissed; link to ban action
- ADM-32: Chat log viewer — searchable chat history by room/user/date; flag offensive messages
- ADM-33: Suspicious activity alerts — auto-flag accounts with unusual patterns (win rate >90% over 20+ games, rapid point accumulation, multiple accounts from same IP)

**Operational Controls:**

- ADM-34: Server health — real-time view of: Node.js memory, event loop lag, PostgreSQL connection pool, Redis connection status, uptime
- ADM-35: Season management — trigger season reset from admin UI (same logic as CLI but with confirmation + preview of affected users count)
- ADM-36: Maintenance mode — toggle maintenance mode; when active, players see "Server maintenance" message; only admins can still play
- ADM-37: Config editor — view/edit runtime config values (rate limits, queue settings, matchmaking params) without restart (stored in DB, overrides env)
- ADM-38: Backup trigger — one-click pg_dump trigger; show last backup time and size

**UI/UX Design:**

- ADM-39: Sidebar navigation — collapsible sidebar with icon + text links to each section; active state indicator
- ADM-40: Dark/light theme — toggle between dark and light themes; persisted in localStorage; defaults to dark
- ADM-41: Responsive design — fully usable on tablet (1024px); read-only dashboard on mobile (768px); management features desktop-preferred
- ADM-42: Data tables — consistent table component with: pagination, column sorting, row selection, bulk actions toolbar, column visibility toggle
- ADM-43: Toast notifications — success/error/warning toasts for all admin actions with auto-dismiss
- ADM-44: Confirmation dialogs — destructive actions (ban, delete, void) require typed confirmation
- ADM-45: Loading states — skeleton loaders for all data-fetching views; optimistic updates where safe
- ADM-46: Charts library — lightweight chart library (Chart.js or Recharts) for analytics visualizations
- ADM-47: Vietnamese + English — full i18n for all admin UI strings

**Technical:**

- ADM-48: Separate bundle — admin React app built separately from game client (`public/admin/` → `dist/admin/`); not loaded by regular players
- ADM-49: Admin API routes — all under `/api/admin/*` prefix; middleware checks admin session + role before any handler
- ADM-50: Database migrations — new tables: admin_roles, admin_audit_log, admin_sessions, announcements, reports, chat_logs, runtime_config
- ADM-51: CLI bootstrap — `npm run admin:create <email>` CLI to promote an existing user to super_admin (first admin setup)
- ADM-52: No external admin framework — built with same React + Express stack; no AdminJS/Forest Admin/etc. to keep dependencies minimal

**Depends on:** Phase 2 (identity/auth), Phase 3 (matches), Phase 7 (points), Phase 8 (passkey auth)
**Plans:** 8 plans

Plans:

- [ ] Plan 01: Database migrations — admin_roles, admin_audit_log, admin_sessions, announcements, reports, chat_logs, runtime_config tables + CLI bootstrap
- [ ] Plan 02: Admin auth & middleware — login endpoint, session management, role-based access control middleware, rate limiting, IP allowlist, audit logging
- [ ] Plan 03: Admin API — User management endpoints (list, detail, edit, ban/unban, mute, point adjustment, delete, export)
- [ ] Plan 04: Admin API — Match management, content management (emoji/power-up CRUD, announcements), moderation (reports, chat logs, suspicious activity)
- [ ] Plan 05: Admin API — Analytics endpoints (dashboard stats, charts data, real-time WebSocket feed, retention metrics)
- [ ] Plan 06: Admin API — Operational controls (server health, season management, maintenance mode, config editor, backup)
- [ ] Plan 07: Admin Frontend — React app scaffold, routing, sidebar layout, auth flow, theme system, data table component, chart components, i18n
- [ ] Plan 08: Admin Frontend — All management views (users, matches, content, moderation, analytics dashboard, operational controls, responsive polish)

### Phase 17: Social & Friends: friend requests, real-time online presence, head-to-head stats, direct challenge

**Goal:** Build a social layer that creates lasting bonds between players — explicit friend requests, real-time presence (friends-only, Socket.IO), head-to-head rivalry stats (accessible via battle avatar click), and direct challenge invites (reuses room creation flow). Players return because of *people*, not just rank.

**Requirements**:

**Friends System:**

- SOCL-01a: Send friend request from battle avatar popup or friends list search
- SOCL-01b: Recipient sees pending requests, can accept/reject
- SOCL-01c: Either side can unfriend (removes both ways)
- SOCL-01d: Friends list screen with real-time online/offline/in-game indicators
- SOCL-01e: Max 100 friends per user
- SOCL-01f: Guard: no self-add, no duplicate, no blocked
- SOCL-01g: Auth-only (guests cannot use friend system)

**Online Presence:**

- PRES-01: Real-time Socket.IO broadcast to online friends on connect
- PRES-02: 30s grace period before offline (avoids flicker)
- PRES-03: States: online (lobby), in-game (active match), offline
- PRES-04: Visible to accepted friends only
- PRES-05: Server userId→socket map for targeted broadcasts

**Head-to-Head Stats (via battle avatar popup):**

- H2H-01: Click opponent avatar in battle → expanded popup: H2H record + "Add Friend" button
- H2H-02: Popup shows: wins each side, total games, current streak, last played
- H2H-03: Friends list also shows mini H2H (X-Y) per friend row
- H2H-04: Derived from existing matches table
- H2H-05: "Rival" badge on most-played friend (cosmetic)

**Direct Challenge (reuses room creation flow):**

- CHAL-01: Tap online friend in friends list → BottomSheet with coin selector (same as room wager)
- CHAL-02: Server creates room (reuse createRoom), sends invite via Socket.IO
- CHAL-03: Recipient sees modal popup with accept/decline + 60s countdown
- CHAL-04: Accept = joinRoom with challenge roomCode → placement phase
- CHAL-05: Decline or timeout (60s) → destroy room, notify sender
- CHAL-06: Cannot challenge in-game or offline friends

**i18n:**

- SOCL-i18n: Full Vietnamese + English for all social UI strings

**Depends on:** Phase 2 (accounts/identity), Phase 3 (match recording for H2H)
**Plans:** 5 plans

Plans:

- [x] Plan 01: Database migration (010_friendships.sql) + Friend CRUD API + search
- [x] Plan 02: Real-time presence system (Socket.IO) — online/in-game/offline with 30s grace
- [x] Plan 03: Head-to-head stats + enhanced battle avatar popup with "Add Friend"
- [x] Plan 04: Direct challenge flow — server creates room, Socket.IO invite, accept/decline/expire
- [x] Plan 05: Frontend — Friends list screen, challenge send/receive UI, post-match add friend, i18n

### Phase 18: Bot Quick Match: auto-match with bot after 15s queue timeout, 10 pre-created bot accounts, real coin wagering

**Goal:** When a real player taps Quick Match and waits 15 seconds without finding a human opponent, the system automatically matches them against one of 10 pre-created bot accounts. The bot plays as a real player — placing ships, firing shots with server-side AI, and wagering real coins. The match is fully server-authoritative and recorded like any PvP match.

**Requirements**:

- BOT-QM-01: 10 pre-seeded bot accounts in the `users` table (bot_01 through bot_10), each with a display name, avatar, and initial point balance; identifiable by a `is_bot` flag
- BOT-QM-02: Database migration to seed bot accounts + add `is_bot` boolean column to users table
- BOT-QM-03: After 15s in the quick-match queue without a human match, server automatically pairs the player with a random available bot account
- BOT-QM-04: Bot selection logic — pick a random bot that is not currently in an active match; if all 10 are busy, extend the wait (retry every 5s)
- BOT-QM-05: Bot joins the match as player 2 using its own user account (bot userId, bot display_name visible to opponent)
- BOT-QM-06: Bot places ships automatically using a randomized valid placement (server-side, no client needed)
- BOT-QM-07: Bot fires shots using the existing 4-tier AI algorithms (difficulty assigned per bot account or random per match — configurable)
- BOT-QM-08: Bot respects the same turn timer (20s) — fires within 2-5s of its turn starting (randomized delay for realism)
- BOT-QM-09: Real coin wagering — bot matches the player's stake from its own balance; if bot has insufficient balance, use stake=0 (free match)
- BOT-QM-10: Match is fully recorded in the matches table with winner/loser, points transferred, same as PvP
- BOT-QM-11: Points won from bot are real — deducted from bot account balance, credited to player (and vice versa if player loses)
- BOT-QM-12: Bot accounts have a mechanism to replenish points (e.g., auto-topped-up to 1000 pts if balance drops below 100, via a check before each match)
- BOT-QM-13: Player should NOT know they're playing a bot — no visual indicator; bot display names are realistic Vietnamese/English names
- BOT-QM-14: Bot does not use premium emoji or power-ups (keeps it simple for v1)
- BOT-QM-15: The 15s timeout is configurable via environment variable (BOT_MATCH_TIMEOUT_MS, default 15000)
- BOT-QM-16: i18n — no new user-facing strings needed (bot plays silently, no chat)

**Depends on:** Phase 5 (public matchmaking queue), Phase 6 (bot AI algorithms), Phase 7 (points economy)
**Plans:** 3 plans

Plans:

- [x] Plan 01: Database migration + Bot accounts + Bot utility functions
- [x] Plan 02: Server-side bot game logic + createBotMatchRoom
- [x] Plan 03: Queue timeout integration + Client-side adjustments

### Phase 19: Mobile-Native App Shell: viewport-locked single-screen layout — each screen fits one mobile viewport, navigate by tap not scroll

**Goal:** Convert the current responsive-document layout into a mobile-native app shell. On phones (iPhone/Android), every screen fits exactly one `100dvh` viewport with no page-level scroll — the app feels like an installed native app, not a scrolling web page. Navigation between screens happens by tap, and any overflow content is contained in a single scrollable region or a tap-open overlay, never the page body. Desktop preserves the existing centered phone-frame look. EN/VI i18n and all current behavior preserved.

**Requirements**:

- MOBILE-01: Root layout locked to viewport — `html, body` height `100dvh` with `overflow: hidden`; the app shell is a `100dvh` flex column so the page itself never scrolls
- MOBILE-02: Per-screen app-shell regions — fixed/sticky header + flexible main content region + fixed footer/action bar; only the main region may scroll, and only when content genuinely exceeds available height
- MOBILE-03: Battle screen fits one viewport — the 11×11 board is sized via `min(available-width, available-height)` so board + turn indicator + essential controls fit without page scroll
- MOBILE-04: Power-up bar and battle log become tap-open overlays/sheets on mobile instead of stacked blocks that push content past the fold
- MOBILE-05: Lobby, room, placement, profile, history, friends, and queue screens each refactored to the app-shell pattern and verified to fit one viewport at common mobile sizes (e.g. 360×640, 390×844, 414×896)
- MOBILE-06: Screen transitions feel native — tap-driven navigation with a slide/push animation (respecting `prefers-reduced-motion`); no reliance on scroll to reach another screen
- MOBILE-07: Safe-area insets honored — `env(safe-area-inset-*)` padding so header/footer clear the iPhone notch and home indicator and Android system bars
- MOBILE-08: Desktop/tablet preserved — shell constrained to the existing ~480px centered "phone frame" on wide viewports; no regression to current desktop appearance
- MOBILE-09: EN/VI i18n preserved — no untranslated strings introduced; any new controls (e.g. overlay toggles, back buttons) have EN+VI labels
- MOBILE-10: Existing behavior preserved — reconnect/grace-window, chat bubbles, modals, install banner, and all game flows continue to work within the new shell
- MOBILE-11: No horizontal scroll at any supported width; long names/text truncate or wrap within their region
- MOBILE-12: Keyboard-open handling on mobile (chat composer) does not break the shell — input remains visible, layout adapts to the reduced viewport (`dvh`/visualViewport)

**Depends on:** Phase 9 (lobby UI redesign), Phase 15 (power-up redesign), Phase 17 (friends UI), Phase 18 (bot match) — touches all existing screens
**Plans:** 4 plans

Plans:

- [ ] 19-01-PLAN.md — Shell foundation + battle screen (ScreenShell, useMainHeight, root viewport lock, Powers sheet, Log removed, footer-note relocation, Wave 0 Playwright + i18n harness)
- [ ] 19-02-PLAN.md — Room-flow screens onto shell (lobby, queue, room, placement; leave-confirm back buttons)
- [ ] 19-03-PLAN.md — List/profile screens onto shell (profile, history, friends; IntersectionObserver root fix)
- [ ] 19-04-PLAN.md — Native transitions + keyboard handling + safe-area pass + behavior regression (end-of-phase human verify)
