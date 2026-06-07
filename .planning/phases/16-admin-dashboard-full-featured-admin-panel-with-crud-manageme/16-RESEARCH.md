# Phase 16 Research: Admin Dashboard

## 1. Admin Authentication & Session Management

### Separate Admin Sessions

The existing project uses `express-session` + `connect-pg-simple` for player sessions (stored in the `session` table, 30-day rolling TTL, cookie name `connect.sid`). The admin panel needs a **separate session** with distinct properties:

**Recommended approach:** A second `express-session` instance with a different cookie name, applied only to `/admin` and `/api/admin` routes.

```javascript
// admin-auth.js
const expressSession = require("express-session");
const pgSession = require("connect-pg-simple")(expressSession);
const { pool } = require("./db");

const adminSessionMiddleware = expressSession({
  store: new pgSession({
    pool,                         // Same pool (PITFALLS #4 — never new Pool())
    tableName: "admin_sessions",  // Separate table from player sessions
  }),
  name: "admin.sid",              // Different cookie name — prevents collision
  secret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET,
  resave: false,
  rolling: true,                  // Sliding window (2h from last activity)
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: "auto",
    sameSite: "strict",           // Stricter than game (lax) — admin never needs cross-site
    maxAge: 2 * 60 * 60 * 1000,  // 2 hours (ADM-04)
    path: "/admin",              // Scoped — never sent to game routes
  },
});
```

**Key differences from player sessions:**
| Property | Player Session | Admin Session |
|----------|---------------|---------------|
| Cookie name | `connect.sid` | `admin.sid` |
| Max age | 30 days | 2 hours |
| SameSite | lax | strict |
| Cookie path | `/` | `/admin` |
| Table | `session` | `admin_sessions` |

### Password Re-verification

Admin login always requires password verification even if the user already has a player session. This prevents privilege escalation from a stolen player cookie.

```javascript
// Admin login flow:
// 1. POST /api/admin/login { email, password }
// 2. Verify password against credentials table (same bcrypt flow as verifyEmailLogin)
// 3. Check admin_roles table for active role
// 4. Create admin session (separate cookie)
// 5. Log to admin_audit_log
```

### RBAC Middleware Pattern

The existing project uses simple `if (!req.user)` guards. For admin RBAC, use a middleware factory:

```javascript
// Hierarchy: super_admin > admin > moderator
const ROLE_HIERARCHY = { super_admin: 3, admin: 2, moderator: 1 };

function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.adminUser) return res.status(401).json({ error: "ADMIN_AUTH_REQUIRED" });
    const userLevel = ROLE_HIERARCHY[req.adminUser.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 999;
    if (userLevel < requiredLevel) return res.status(403).json({ error: "INSUFFICIENT_ROLE" });
    next();
  };
}

// Usage:
router.delete("/users/:id", requireRole("admin"), handleDeleteUser);
router.post("/roles", requireRole("super_admin"), handleAssignRole);
router.get("/reports", requireRole("moderator"), handleListReports);
```

### IP Allowlist Middleware

```javascript
function ipAllowlist(req, res, next) {
  const allowedIps = process.env.ADMIN_ALLOWED_IPS;
  if (!allowedIps) return next(); // No allowlist configured → allow all

  const allowed = allowedIps.split(",").map(s => s.trim());
  // Trust proxy already set (app.set("trust proxy", 1)) — req.ip is correct
  if (!allowed.includes(req.ip)) {
    return res.status(403).json({ error: "IP_NOT_ALLOWED" });
  }
  next();
}
```

### Session Token Strategy

**Decision: Session cookie (not JWT)** — aligns with existing project pattern (express-session + pg store). JWTs are harder to revoke instantly (ADM-04 requires immediate invalidation on logout). The existing `connect-pg-simple` pattern is proven in this codebase and allows server-side revocation via DELETE.

---

## 2. Database Schema Design

### New Tables (migration 009_admin.sql)

```sql
-- 009_admin.sql: Admin dashboard tables

-- Admin roles: maps users to admin privileges
CREATE TABLE IF NOT EXISTS admin_roles (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator')),
  granted_by  INTEGER REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ           -- NULL = active; set to revoke without deleting
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_user_id ON admin_roles (user_id) WHERE revoked_at IS NULL;

-- Admin sessions: separate session store for admin panel
-- Schema matches connect-pg-simple expectations
CREATE TABLE IF NOT EXISTS admin_sessions (
  "sid"     VARCHAR NOT NULL COLLATE "default",
  "sess"    JSON NOT NULL,
  "expire"  TIMESTAMP(6) NOT NULL,
  "user_id" INTEGER,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expire ON admin_sessions ("expire");
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions ("user_id");

-- Admin audit log: immutable record of every admin action
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            SERIAL PRIMARY KEY,
  admin_id      INTEGER NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL,              -- e.g. 'user.ban', 'match.void', 'config.update'
  target_type   TEXT,                       -- 'user', 'match', 'announcement', etc.
  target_id     TEXT,                       -- target entity ID (TEXT for flexibility)
  details       JSONB,                      -- action-specific payload
  ip            INET NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite indexes for common audit queries
CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON admin_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log (created_at DESC);

-- Announcements: server-wide banners shown in game lobby
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title_en    TEXT NOT NULL,
  title_vi    TEXT NOT NULL,
  body_en     TEXT,
  body_vi     TEXT,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'maintenance', 'event')),
  start_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at      TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements (active, start_at, end_at);

-- Reports: player-submitted reports (abuse, cheating)
CREATE TABLE IF NOT EXISTS reports (
  id            SERIAL PRIMARY KEY,
  reporter_id   INTEGER NOT NULL REFERENCES users(id),
  reported_id   INTEGER NOT NULL REFERENCES users(id),
  match_id      INTEGER REFERENCES matches(id),
  reason        TEXT NOT NULL CHECK (reason IN ('chat_abuse', 'cheating', 'harassment', 'other')),
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  resolution    TEXT,                     -- admin notes on resolution
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports (reported_id);

-- Chat logs: stored messages for moderation (selective logging)
CREATE TABLE IF NOT EXISTS chat_logs (
  id          SERIAL PRIMARY KEY,
  room_code   TEXT NOT NULL,
  sender_id   INTEGER REFERENCES users(id),
  client_id   TEXT NOT NULL,
  message     TEXT NOT NULL,
  flagged     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_room ON chat_logs (room_code, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_logs_sender ON chat_logs (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_flagged ON chat_logs (flagged) WHERE flagged = true;

-- Runtime config: key/value store for settings that override env vars
CREATE TABLE IF NOT EXISTS runtime_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User bans: active and historical bans
CREATE TABLE IF NOT EXISTS user_bans (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('ban', 'mute')),
  reason      TEXT NOT NULL,
  duration    INTERVAL,                   -- NULL = permanent
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,               -- computed: starts_at + duration (NULL = permanent)
  active      BOOLEAN NOT NULL DEFAULT true,
  banned_by   INTEGER NOT NULL REFERENCES users(id),
  unbanned_by INTEGER REFERENCES users(id),
  unbanned_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user_active ON user_bans (user_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_user_bans_ends_at ON user_bans (ends_at) WHERE active = true AND ends_at IS NOT NULL;

-- Daily stats: pre-aggregated daily metrics for fast analytics
CREATE TABLE IF NOT EXISTS daily_stats (
  date            DATE PRIMARY KEY,
  new_users       INTEGER NOT NULL DEFAULT 0,
  active_users    INTEGER NOT NULL DEFAULT 0,
  matches_played  INTEGER NOT NULL DEFAULT 0,
  matches_classic INTEGER NOT NULL DEFAULT 0,
  matches_wagered INTEGER NOT NULL DEFAULT 0,
  points_earned   BIGINT NOT NULL DEFAULT 0,
  points_spent    BIGINT NOT NULL DEFAULT 0,
  points_wagered  BIGINT NOT NULL DEFAULT 0,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Index Strategy for Audit Logs

The audit log is append-only and high-volume. Key query patterns:
1. "What did admin X do?" → `idx_audit_admin_id (admin_id, created_at DESC)`
2. "What happened to user Y?" → `idx_audit_target (target_type, target_id, created_at DESC)`
3. "All bans today?" → `idx_audit_action (action, created_at DESC)`
4. "Recent activity feed" → `idx_audit_created_at (created_at DESC)`

For retention, simple 90-day cleanup:
```sql
DELETE FROM admin_audit_log WHERE created_at < now() - INTERVAL '90 days';
```

### Daily Stats Aggregation

Pre-aggregate each day's metrics (run nightly via in-process timer):
```sql
INSERT INTO daily_stats (date, new_users, active_users, matches_played, matches_classic, matches_wagered, points_earned, points_spent, points_wagered)
SELECT
  $1::DATE AS date,
  (SELECT COUNT(*) FROM users WHERE created_at::date = $1::DATE) AS new_users,
  (SELECT COUNT(DISTINCT winner_id) + COUNT(DISTINCT loser_id) FROM matches WHERE ended_at::date = $1::DATE) AS active_users,
  (SELECT COUNT(*) FROM matches WHERE ended_at::date = $1::DATE) AS matches_played,
  (SELECT COUNT(*) FROM matches WHERE ended_at::date = $1::DATE AND stake = 0) AS matches_classic,
  (SELECT COUNT(*) FROM matches WHERE ended_at::date = $1::DATE AND stake > 0) AS matches_wagered,
  COALESCE((SELECT SUM(amount) FROM transactions WHERE created_at::date = $1::DATE AND amount > 0), 0) AS points_earned,
  COALESCE((SELECT ABS(SUM(amount)) FROM transactions WHERE created_at::date = $1::DATE AND amount < 0), 0) AS points_spent,
  COALESCE((SELECT SUM(stake) * 2 FROM matches WHERE ended_at::date = $1::DATE AND stake > 0), 0) AS points_wagered
ON CONFLICT (date) DO UPDATE SET
  new_users = EXCLUDED.new_users,
  active_users = EXCLUDED.active_users,
  matches_played = EXCLUDED.matches_played,
  matches_classic = EXCLUDED.matches_classic,
  matches_wagered = EXCLUDED.matches_wagered,
  points_earned = EXCLUDED.points_earned,
  points_spent = EXCLUDED.points_spent,
  points_wagered = EXCLUDED.points_wagered,
  computed_at = now();
```

---

## 3. Audit Logging Architecture

### Middleware vs Per-handler

**Recommendation: Middleware wrapper for write operations + per-handler for specific actions.**

Use an Express middleware on `/api/admin/*` that wraps the response to log after success:

```javascript
function auditLog(action, getDetails) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const details = getDetails ? getDetails(req, data) : null;
        logAdminAction(req.adminUser.id, action, req, details).catch(e =>
          console.error("[audit] log failed:", e.message)
        );
      }
      return originalJson(data);
    };
    next();
  };
}

// Usage:
router.post("/users/:id/ban",
  requireRole("moderator"),
  auditLog("user.ban", (req) => ({ reason: req.body.reason, duration: req.body.duration })),
  handleBanUser
);
```

### Action Taxonomy

```
user.ban          user.unban         user.mute           user.unmute
user.edit         user.delete        user.point_adjust   user.export
match.void        match.view
content.emoji_create  content.emoji_edit  content.emoji_delete
content.powerup_edit
content.announce_create  content.announce_edit  content.announce_delete
moderation.report_review  moderation.report_resolve  moderation.report_dismiss
ops.maintenance_on    ops.maintenance_off
ops.config_update     ops.backup_trigger    ops.season_reset
auth.login            auth.logout           auth.login_failed
roles.grant           roles.revoke
```

### IP Resolution Behind Reverse Proxy

The project already sets `app.set("trust proxy", 1)`. This means `req.ip` correctly reads `X-Forwarded-For` from the reverse proxy. No additional work needed — just use `req.ip` in the audit log insertion.

### Retention Strategy

For the scale of this project (single EC2, not massive traffic):
- Keep 90 days online in the `admin_audit_log` table
- Archive older entries to a gzipped JSONL file via monthly cron
- No table partitioning needed at this scale (< 100K rows/month estimated)

---

## 4. Analytics & Real-time Stats

### DAU / Retention Computation

**DAU (Daily Active Users):**
```sql
SELECT COUNT(DISTINCT user_id) AS dau
FROM (
  SELECT winner_id AS user_id FROM matches WHERE ended_at::date = CURRENT_DATE
  UNION
  SELECT loser_id AS user_id FROM matches WHERE ended_at::date = CURRENT_DATE
) sub;
```

**Retention Cohorts (D1/D7/D30):**
```sql
WITH cohort AS (
  SELECT id FROM users WHERE created_at::date = $1::DATE
),
returned AS (
  SELECT DISTINCT m.winner_id AS user_id FROM matches m
  JOIN cohort c ON m.winner_id = c.id
  WHERE m.ended_at::date = ($1::DATE + INTERVAL '7 days')
  UNION
  SELECT DISTINCT m.loser_id AS user_id FROM matches m
  JOIN cohort c ON m.loser_id = c.id
  WHERE m.ended_at::date = ($1::DATE + INTERVAL '7 days')
)
SELECT
  (SELECT COUNT(*) FROM cohort) AS cohort_size,
  (SELECT COUNT(*) FROM returned) AS retained,
  CASE WHEN (SELECT COUNT(*) FROM cohort) > 0
    THEN ROUND((SELECT COUNT(*) FROM returned)::numeric / (SELECT COUNT(*) FROM cohort) * 100, 1)
    ELSE 0
  END AS retention_pct;
```

**Conversion Rate (guest → registered):**
```sql
SELECT
  COUNT(*) FILTER (WHERE guest_migrated_at IS NOT NULL) AS converted,
  COUNT(*) AS total,
  ROUND(COUNT(*) FILTER (WHERE guest_migrated_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS rate
FROM users;
```

### Pre-aggregation Strategy

**Recommendation: Scheduled Node.js cron (run by the same process on a timer)**

Uses `setInterval().unref()` — follows existing pattern from sweepRooms, tryPairAll, snapshot:

```javascript
const STATS_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(async () => {
  try {
    await computeDailyStats(new Date(Date.now() - 86400000)); // Yesterday
    await computeDailyStats(new Date()); // Today (partial)
  } catch (e) {
    console.error("[stats] daily aggregation failed:", e.message);
  }
}, STATS_INTERVAL).unref();
```

### Real-time Stats via Socket.IO /admin Namespace

```javascript
const adminNs = io.of("/admin");

adminNs.use(async (socket, next) => {
  const sid = parseCookie(socket.handshake.headers.cookie)["admin.sid"];
  if (!sid) return next(new Error("ADMIN_AUTH_REQUIRED"));
  // Verify session exists and is valid...
  next();
});

setInterval(() => {
  if (adminNs.sockets.size === 0) return; // No admin connected, skip
  adminNs.emit("stats", {
    online: io.of("/").sockets.size,
    activeMatches: Object.values(rooms).filter(r => r.started).length,
    queueSizes: { free: queues.free?.size || 0, wagered: queues.wagered?.size || 0 },
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    ts: Date.now(),
  });
}, 5000).unref();
```

**Metrics to push (every 5s):**
- Players online (WebSocket connection count)
- Active matches (rooms with `started: true`)
- Queue sizes (free + wagered)
- Server memory (RSS, heap used)

**Heavy metrics (every 60s):**
- Event loop lag (via `perf_hooks` monitorEventLoopDelay)
- PostgreSQL pool stats (totalCount, idleCount, waitingCount)

### Chart Library

**Decision: Recharts**

| Criteria | Recharts | Chart.js |
|----------|----------|----------|
| Bundle size | ~45KB gzip | ~65KB gzip |
| React integration | Native JSX | Wrapper |
| Customization | Composable | Imperative |
| Tree-shaking | Yes | Partial |

Recharts wins: JSX-native, smaller bundle, SVG-based (better accessibility), already specified in CONTEXT.md.

---

## 5. Admin UI Architecture

### Separate esbuild Entry Point

Extend `build-game.mjs`:

```javascript
// Admin bundle (new entry point)
await esbuild.build({
  entryPoints: ["public/admin/app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018"],
  loader: { ".jsx": "jsx" },
  outfile: `${OUT}/admin/app.js`,
  define: { "process.env.SERVER_URL": JSON.stringify(SERVER_URL) },
});

copyFileSync("public/admin/index.html", `${OUT}/admin/index.html`);
```

### Express Route Setup

```javascript
// IMPORTANT: Admin static files BEFORE game static middleware
app.use("/admin", express.static(path.join(__dirname, "dist/admin")));
app.use("/api/admin", ipAllowlist, adminSessionMiddleware, adminAuthMiddleware, adminRouter);
app.get("/admin/*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist/admin/index.html"));
});
```

### File Structure

```
public/admin/
├── app.jsx            # Main admin SPA entry point
├── index.html         # Admin HTML shell
├── style.css          # Admin styles (CSS variables for theme)
├── components/
│   ├── Layout.jsx     # Sidebar + content wrapper
│   ├── Sidebar.jsx    # Navigation sidebar
│   ├── DataTable.jsx  # Reusable table (pagination/sort/filter/bulk)
│   ├── Chart.jsx      # Recharts wrapper components
│   ├── Toast.jsx      # Toast notification system
│   ├── Confirm.jsx    # Confirmation dialog
│   └── Loading.jsx    # Skeleton loaders
├── pages/
│   ├── Login.jsx      # Admin login form
│   ├── Dashboard.jsx  # Overview + charts
│   ├── Users.jsx      # User list + detail
│   ├── Matches.jsx    # Match list + detail
│   ├── Content.jsx    # Emoji + powerup + announcement management
│   ├── Moderation.jsx # Reports + chat logs
│   └── Operations.jsx # Health + config + backup + maintenance
├── hooks/
│   ├── useApi.jsx     # Fetch wrapper with admin auth
│   ├── useSocket.jsx  # Admin WebSocket connection
│   └── useTheme.jsx   # Dark/light theme toggle
└── i18n/
    └── admin.js       # Admin-specific translations (EN/VI)
```

### Routing Pattern (Hash-based, no React Router)

```jsx
function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || "/dashboard");
  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || "/dashboard");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return route;
}
```

**Decision: No React Router.** Matches project philosophy (minimal deps). ~10 admin routes handled cleanly with hash routing.

### Theme Implementation

CSS variables + data-theme attribute:
```css
:root[data-theme="dark"] { --bg: #1a1b2e; --text: #e2e8f0; --card: #252640; ... }
:root[data-theme="light"] { --bg: #f8f9fa; --text: #1a202c; --card: #ffffff; ... }
```

---

## 6. Moderation System

### Report Queue State Machine

```
pending → reviewed → resolved (admin took action)
pending → reviewed → dismissed (no violation found)
pending → dismissed (bulk fast-dismiss for spam)
```

### Chat Logging Strategy

**Decision: Selective logging (privacy-preserving)**

Store messages only when:
1. A room has a report filed against either player
2. An admin enables logging for a specific user (investigation)
3. A message matches auto-flag patterns (future)

### Suspicious Activity Detection

```sql
-- High win rate (>90% over 20+ games)
SELECT u.id, u.display_name, win_count, total_games,
  ROUND(win_count::numeric / total_games * 100, 1) AS win_rate
FROM users u
JOIN (
  SELECT user_id, COUNT(*) FILTER (WHERE is_winner) AS win_count, COUNT(*) AS total_games
  FROM (
    SELECT winner_id AS user_id, true AS is_winner FROM matches
    UNION ALL SELECT loser_id, false FROM matches
  ) sub
  GROUP BY user_id
  HAVING COUNT(*) >= 20
) stats ON stats.user_id = u.id
WHERE ROUND(win_count::numeric / total_games * 100, 1) > 90;
```

### Ban Enforcement

Multi-layer enforcement:
1. **WebSocket connection:** Check on `io.use()` middleware
2. **API middleware:** Check on every authenticated request
3. **Force-disconnect:** When admin bans a connected user, find all sockets and disconnect

---

## 7. Operational Controls

### Maintenance Mode

`runtime_config` table + in-memory cache:
- Boot: load flag from DB
- Toggle: update DB + update in-memory flag + broadcast to admin WS
- Check: in-memory (fast) on every request/connection

### pg_dump Trigger

- Rate limited: max 1/hour (in-memory timestamp)
- Uses child_process.exec with PGPASSWORD from env (never in command string)
- Stores metadata in `runtime_config` (last_backup key)
- Timeout: 120s

### Server Health Metrics

```javascript
const { monitorEventLoopDelay } = require("perf_hooks");
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

function getHealthMetrics() {
  return {
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    eventLoop: { min: h.min/1e6, max: h.max/1e6, mean: h.mean/1e6, p99: h.percentile(99)/1e6 },
    pgPool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    redis: store.isEnabled(),
    rooms: Object.keys(rooms).length,
    onlinePlayers: io.of("/").sockets.size,
  };
}
```

---

## 8. Security Considerations

### CSRF Protection

**Decision:** `sameSite: strict` cookie + JSON Content-Type enforcement provides strong CSRF protection without a separate token library.

```javascript
app.use("/api/admin", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (!req.is("json")) return res.status(415).json({ error: "JSON_REQUIRED" });
  }
  next();
});
```

### Rate Limiting

```javascript
// 5 attempts per 15 minutes per IP (ADM-07)
const adminLoginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// 60 req/min for admin API endpoints
const adminApiLimiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
});
```

### CSP for Admin

No changes needed — existing game CSP (`script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self' wss: ws:`) covers admin requirements.

### Admin Route Isolation

1. Separate entry point → separate bundle (game never loads admin code)
2. Separate HTML shell for admin
3. Server-side admin logic in separate file(s)
4. Build verification: grep admin-specific strings should not appear in game bundle

---

## Key Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Session cookies (not JWT) | Matches existing pattern, enables instant revocation |
| 2 | Separate admin_sessions table | Isolation from player sessions, different TTL |
| 3 | Same pg Pool (never new Pool) | Follows PITFALLS #4 |
| 4 | Recharts for charts | Native JSX, smaller bundle, SVG accessibility |
| 5 | Hash-based routing (no React Router) | Minimal deps, matches project philosophy |
| 6 | Selective chat logging | Privacy-preserving, reduces storage |
| 7 | setInterval for daily stats | Follows existing pattern (sweepRooms) |
| 8 | Socket.IO /admin namespace | Extends existing io server, namespace isolation |
| 9 | sameSite strict + JSON check for CSRF | Strong without extra library |
| 10 | pg_dump via child_process | No password in command, env-based auth |
| 11 | Maintenance: DB + in-memory cache | Survives restarts (DB), fast checks (memory) |
| 12 | No external admin framework | Full control, minimal deps (ADM-52) |
| 13 | Migration 009_admin.sql | Single file, sequential naming |
| 14 | RBAC via requireRole middleware | Clean, composable, testable |
| 15 | Dark theme default | Reduces eye strain for admin work |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Admin bundle size | Slow load | Recharts tree-shakes; internal tool (acceptable) |
| Audit log unbounded growth | Disk space | 90-day retention + monthly archive |
| pg_dump blocks DB | Game perf | --jobs=2, max 1/hour, low-traffic schedule |
| Chat logging without consent | Legal/GDPR | Selective only, disclose in policy |
| Admin account compromise | Full access | IP allowlist, 2h session, re-verification, audit log |
| Maintenance mode in-flight | Players stuck | Existing games finish; only new connections blocked |

---

## Dependency Impact

**No new npm dependencies for backend:**
- express-session, connect-pg-simple, rate-limiter-flexible, bcryptjs, pg, socket.io — all already installed

**One new frontend dependency:**
- `recharts` (~45KB gzipped) — analytics charts

---

## File Organization Plan

```
battleship/
├── server.js               # Add: admin static serving, maintenance middleware
├── db.js                   # Unchanged (shared pool)
├── admin-api.js            # NEW: all /api/admin/* route handlers
├── admin-auth.js           # NEW: admin session, RBAC, audit logging
├── scripts/
│   └── admin-create.js     # NEW: CLI to bootstrap first super_admin
├── migrations/
│   └── 009_admin.sql       # NEW: all admin tables
├── public/admin/           # NEW: admin SPA source
│   ├── app.jsx
│   ├── index.html
│   ├── style.css
│   └── components/pages/hooks/i18n/...
├── dist/admin/             # BUILD OUTPUT (generated)
└── build-game.mjs          # MODIFIED: add admin entry point
```

---

## RESEARCH COMPLETE
