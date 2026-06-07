// admin-auth.js — Admin session, RBAC middleware, audit logging, rate limiting.
// Phase 16: Separate admin auth from player sessions.

const expressSession = require("express-session");
const pgSession = require("connect-pg-simple")(expressSession);
const { pool } = require("./db");
const { RateLimiterMemory } = require("rate-limiter-flexible");

// ─── Admin session middleware ────────────────────────────────────────────────
// Separate cookie from player sessions: different name, shorter TTL, strict sameSite.
const adminSessionMiddleware = expressSession({
  store: new pgSession({
    pool,
    tableName: "admin_sessions",
  }),
  name: "admin.sid",
  secret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || "admin-fallback-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" ? true : false,
    sameSite: "strict",
    maxAge: 2 * 60 * 60 * 1000, // 2 hours (ADM-04)
    path: "/",
  },
});

// ─── Load admin user from session ────────────────────────────────────────────
// Reads adminUserId from session, queries admin_roles for active role.
async function loadAdminUser(req, res, next) {
  if (req.session && req.session.adminUserId) {
    try {
      const { rows } = await pool.query(
        "SELECT user_id, role FROM admin_roles WHERE user_id=$1 AND revoked_at IS NULL",
        [req.session.adminUserId]
      );
      if (rows.length > 0) {
        req.adminUser = { id: rows[0].user_id, role: rows[0].role };
      }
    } catch (e) {
      console.error("[admin-auth] loadAdminUser error:", e.message);
    }
  }
  next();
}

// ─── Require admin (must have valid admin session) ───────────────────────────
function requireAdmin(req, res, next) {
  if (!req.adminUser) {
    return res.status(401).json({ error: "ADMIN_AUTH_REQUIRED" });
  }
  next();
}

// ─── RBAC middleware factory ─────────────────────────────────────────────────
// Hierarchy: super_admin(3) > admin(2) > moderator(1)
const ROLE_HIERARCHY = { super_admin: 3, admin: 2, moderator: 1 };

function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ error: "ADMIN_AUTH_REQUIRED" });
    }
    const userLevel = ROLE_HIERARCHY[req.adminUser.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 999;
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: "INSUFFICIENT_ROLE" });
    }
    next();
  };
}

// ─── IP allowlist middleware ─────────────────────────────────────────────────
// Reads ADMIN_ALLOWED_IPS env var (comma-separated). If not set, allows all.
function ipAllowlist(req, res, next) {
  const allowedIps = process.env.ADMIN_ALLOWED_IPS;
  if (!allowedIps) return next();

  const allowed = allowedIps.split(",").map((s) => s.trim());
  if (!allowed.includes(req.ip)) {
    return res.status(403).json({ error: "IP_NOT_ALLOWED" });
  }
  next();
}

// ─── CSRF / JSON content-type enforcement ────────────────────────────────────
// Admin API is JSON-only. Combined with sameSite:strict, this provides strong CSRF.
function csrfJsonCheck(req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (!req.is("json")) {
      return res.status(415).json({ error: "JSON_REQUIRED" });
    }
  }
  next();
}

// ─── Audit logging helper ────────────────────────────────────────────────────
// Never throws — errors are caught and logged. Fire-and-forget.
async function logAdminAction(adminId, action, req, targetType, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId || 0,
        action,
        targetType || null,
        targetId || null,
        details ? JSON.stringify(details) : null,
        req.ip || "0.0.0.0",
        req.get("user-agent") || null,
      ]
    );
  } catch (e) {
    console.error("[audit] log failed:", e.message);
  }
}

// ─── Rate limiters ───────────────────────────────────────────────────────────
// Login: 5 attempts per 15 minutes per IP (ADM-07)
const adminLoginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// API: 60 requests per minute per IP
const adminApiLimiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
});

// Rate limit middleware for admin API endpoints
async function adminRateLimitMiddleware(req, res, next) {
  try {
    await adminApiLimiter.consume(req.ip);
    next();
  } catch (e) {
    return res.status(429).json({ error: "RATE_LIMITED" });
  }
}

module.exports = {
  adminSessionMiddleware,
  loadAdminUser,
  requireAdmin,
  requireRole,
  ipAllowlist,
  csrfJsonCheck,
  logAdminAction,
  adminLoginLimiter,
  adminApiLimiter,
  adminRateLimitMiddleware,
  ROLE_HIERARCHY,
};
