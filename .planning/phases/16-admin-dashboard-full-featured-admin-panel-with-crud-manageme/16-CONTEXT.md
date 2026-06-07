# Phase 16 Context: Admin Dashboard

## Overview

Full-featured admin panel for managing the entire Battleship Online platform. Covers user management, match oversight, content control, analytics, moderation, and operational tooling — all behind strict role-based access control with comprehensive audit logging.

## Dependencies

- **Phase 2** (Accounts & Identity) — user schema, authentication, sessions
- **Phase 3** (Match Recording) — matches table, match data
- **Phase 7** (Points Economy) — points/wallet system, transactions
- **Phase 8** (WebAuthn Passkeys) — current auth method (passkey + email/password)

## Architecture Decisions

### Separate App Bundle
The admin panel is a separate React SPA, built independently from the game client. This keeps the game bundle small (admin code never shipped to players) and allows independent deployment/iteration of the admin UI.

- Source: `public/admin/` → Build: `dist/admin/`
- Served at `/admin/*` routes
- Own esbuild entry point in `build-game.mjs`

### Same Stack, No External Frameworks
Built with React + Express (same as game) — no AdminJS, Forest Admin, or similar. Keeps dependency count low and gives full control over security and UX.

### Role Hierarchy
```
super_admin > admin > moderator

super_admin: Full access — manage other admins, delete users, system config
admin: CRUD on all entities, analytics, ban/mute — cannot manage admin roles
moderator: Read-only views + ban/mute/resolve reports — cannot edit data
```

### Security Model
- Separate admin session (distinct cookie, short TTL)
- Password re-verification on login (not just existing session)
- Optional IP allowlist via env var
- Every action audit-logged (who, what, when, from where)
- Strict rate limiting on admin endpoints
- Admin routes never exposed in game client bundle

### Analytics Approach
- Pre-computed daily aggregates stored in materialized views or summary tables
- Real-time stats via WebSocket (piggybacks on existing Socket.IO server)
- Chart data served as time-series JSON — frontend renders with Recharts/Chart.js
- Retention cohorts computed nightly via scheduled query

## Key Technical Considerations

1. **Chat logging** — Currently chat is ephemeral (not stored). Phase 16 adds a `chat_logs` table that stores messages for moderation review. Only stored when a room has a report flag or admin enables logging for a user.

2. **Ban enforcement** — Bans must be checked at WebSocket connection time AND on API calls. A banned user's existing socket connections should be forcibly disconnected.

3. **Maintenance mode** — A runtime flag (in `runtime_config` table + cached in memory) that the main server checks before allowing new connections. Existing games can finish; new ones are blocked.

4. **Backup trigger** — Executes `pg_dump` as a child process. Must be rate-limited (max 1/hour) and runs async. Stores metadata (timestamp, size, path) in DB.

5. **Admin WebSocket** — Extends the existing Socket.IO server with an `/admin` namespace. Requires admin session validation on connect. Pushes real-time stats (online count, active matches, memory).

## UI Design Principles

- **Professional, clean layout** — Sidebar + main content area; no clutter
- **Dark theme default** — Reduces eye strain for extended admin work
- **Consistent data tables** — One reusable DataTable component for all list views
- **Progressive disclosure** — Detail views open in panels/modals, not new pages
- **Accessibility** — WCAG 2.1 AA compliant; keyboard navigable
- **Responsive** — Full experience on desktop/tablet; dashboard-only on mobile

## UI Design Decisions (Locked)

### Visual Style: Flat Minimal (Vercel/Linear-inspired)
- Focus on data density and scannability — no glassmorphism, no gradients
- border-radius: 8px for cards/inputs, 4px for small elements (badges, chips)
- Subtle box-shadow on cards (0 1px 3px rgba(0,0,0,0.1) for light, 0 1px 3px rgba(0,0,0,0.3) for dark)
- Spacing scale: 4/8/12/16/24/32/48px
- Typography: system-ui font stack, use font-weight contrast (400 body, 500 labels, 600 headings) for hierarchy
- No heavy borders — use background color differences to separate sections

### Dashboard Layout (Operational-First)
Priority order when admin opens dashboard:
1. **Alert indicators (top bar):** Pending reports count (red badge), maintenance mode warning banner if active
2. **First row — 5 metric cards:** Online Now (live/pulsing), Active Matches (live), Matches Today, New Users Today, Points Spent Today
3. **Second row — Charts:** User Growth (line) + Match Activity (bar) in 2:1 grid on desktop, full-width stacked on mobile
4. **Third row:** Points Economy chart (full width) + Quick links (pending reports, recent audit entries)

### Navigation Architecture (Grouped Sidebar)
```
📊 Dashboard
─────────────────
👥 Users
⚔️ Matches
─────────────────
📝 Content
   ├─ Emojis
   ├─ Announcements
   └─ Power-ups
🛡️ Moderation [N]     ← badge = pending report count
   ├─ Reports
   ├─ Chat Logs
   └─ Suspicious
─────────────────
⚙️ Operations
   ├─ Health
   ├─ Config
   ├─ Backup
   └─ Maintenance
─────────────────
📋 Audit Log
```

**Quick actions policy:**
- Ban/Mute: available directly from user list row (inline buttons)
- Destructive actions (delete user, void match, hard-delete): require entering detail view → confirmation dialog
- Bulk actions (export, bulk ban): toolbar above table when rows selected

### Color System
**Accent:** #667eea (indigo-blue) — primary buttons, active nav, chart primary line
**Accent hover:** #5a67d8

**Chart palette (ordered):**
- Blue #667eea — earned/positive/primary metric
- Orange #f6ad55 — spent/negative/secondary metric
- Green #68d391 — classic mode / success
- Purple #9f7aea — wagered/ranked mode
- Cyan #63b3ed — tertiary metric (if needed)

**Status badges:**
- Green #68d391 — active, resolved, online, success
- Red #fc8181 — banned, error, critical
- Yellow #f6ad55 — pending, warning, review needed
- Gray #a0aec0 — deleted, dismissed, inactive, muted

**Theme contrast rules:**
- Dark: card backgrounds step up from base (--bg-primary → --bg-card is +1 lightness step)
- Light: card backgrounds step DOWN (white cards on light gray page background)
- Both themes use same accent/status colors (sufficient contrast on both backgrounds)

## Database Schema Preview

New tables:
- `admin_roles` — maps users to admin roles
- `admin_sessions` — separate session store for admin auth
- `admin_audit_log` — immutable log of all admin actions
- `announcements` — scheduled platform announcements
- `reports` — player reports (chat abuse, cheating)
- `chat_logs` — stored chat messages for moderation
- `runtime_config` — key/value config overrides (replaces env vars at runtime)
- `user_bans` — active/historical bans with reason and duration
- `daily_stats` — pre-aggregated daily metrics for fast analytics

## Execution Notes

- Plan 01-02: Foundation (DB + auth) — must be solid before any CRUD work
- Plan 03-06: Backend API — all admin endpoints, organized by domain
- Plan 07-08: Frontend — scaffold then views; can reference design tokens from game CSS
- Charts: Use Recharts (React-native, tree-shakeable, already familiar JSX patterns)
- i18n: Same approach as game (object literal with EN/VI keys) but separate admin translations file
