// admin-api.js — All /api/admin/* route handlers.
// Phase 16: Admin dashboard API.
//
// Each section (users, matches, content, moderation, analytics, ops) is
// organized within this single file for simplicity. The file is mounted
// via mountAdminRoutes(router, io, rooms) in server.js.

const { pool } = require("./db");
const { requireRole, logAdminAction } = require("./admin-auth");

function mountAdminRoutes(router, io, getRooms, eventLoopHistogram) {
  // ─── Health check (placeholder — expanded in Plan 06) ─────────────────────
  router.get("/health", (req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // Plans 03-06 will add routes here.
}

module.exports = mountAdminRoutes;
