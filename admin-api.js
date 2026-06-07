// admin-api.js — All /api/admin/* route handlers.
// Phase 16: Admin dashboard API.
//
// Organized by domain: users, matches, content, moderation, analytics, ops.
// Mounted via mountAdminRoutes(router, io, getRooms, eventLoopHistogram) in server.js.

const { pool, debitWallet, creditWallet } = require("./db");
const { requireRole, logAdminAction } = require("./admin-auth");
const path = require("path");
const { execFile } = require("child_process");

function mountAdminRoutes(router, io, getRooms, eventLoopHistogram) {

  // ═══════════════════════════════════════════════════════════════════════════
  // USER MANAGEMENT (Plan 03: ADM-15 to ADM-22)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /users/export — CSV export (must be BEFORE /users/:id)
  router.get("/users/export", requireRole("admin"), async (req, res) => {
    try {
      const { search, status } = req.query;
      let where = "WHERE 1=1";
      const params = [];
      let idx = 1;

      if (search) {
        params.push(search);
        where += ` AND (u.display_name ILIKE '%' || $${idx} || '%' OR u.email ILIKE '%' || $${idx} || '%' OR u.id::text = $${idx})`;
        idx++;
      }
      if (status === "banned") where += " AND EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id=u.id AND ub.active=true AND ub.type='ban')";
      else if (status === "deleted") where += " AND u.deleted_at IS NOT NULL";
      else if (status === "active") where += " AND u.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id=u.id AND ub.active=true AND ub.type='ban')";

      const { rows } = await pool.query(
        `SELECT u.id, u.display_name, u.email, u.created_at,
          CASE WHEN u.deleted_at IS NOT NULL THEN 'deleted'
               WHEN EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id=u.id AND ub.active=true AND ub.type='ban') THEN 'banned'
               ELSE 'active' END AS status
         FROM users u ${where} ORDER BY u.created_at DESC LIMIT 10000`,
        params
      );

      const csv = ["id,display_name,email,created_at,status"];
      for (const r of rows) {
        csv.push(`${r.id},"${(r.display_name || "").replace(/"/g, '""')}","${r.email || ""}",${r.created_at.toISOString()},${r.status}`);
      }

      logAdminAction(req.adminUser.id, "user.export", req, "user", null, { count: rows.length });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="users-export-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csv.join("\n"));
    } catch (e) {
      console.error("[admin] export error:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /users — paginated user list
  router.get("/users", requireRole("moderator"), async (req, res) => {
    try {
      let { page = 1, limit = 25, search, sort = "created_at", order = "desc", status } = req.query;
      page = Math.max(1, parseInt(page) || 1);
      limit = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const offset = (page - 1) * limit;

      const allowedSort = ["id", "display_name", "email", "created_at"];
      if (!allowedSort.includes(sort)) sort = "created_at";
      if (!["asc", "desc"].includes(order)) order = "desc";

      let where = "WHERE 1=1";
      const params = [];
      let idx = 1;

      if (search) {
        params.push(search);
        where += ` AND (u.display_name ILIKE '%' || $${idx} || '%' OR u.email ILIKE '%' || $${idx} || '%' OR u.id::text = $${idx})`;
        idx++;
      }
      if (status === "banned") where += " AND EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id=u.id AND ub.active=true AND ub.type='ban')";
      else if (status === "deleted") where += " AND u.deleted_at IS NOT NULL";
      else if (status === "active") where += " AND u.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id=u.id AND ub.active=true AND ub.type='ban')";

      const countRes = await pool.query(`SELECT COUNT(*) FROM users u ${where}`, params);
      const total = parseInt(countRes.rows[0].count);

      const { rows } = await pool.query(
        `SELECT u.id, u.display_name, u.email, u.avatar_url, u.created_at, u.deleted_at,
          (SELECT ub.type FROM user_bans ub WHERE ub.user_id=u.id AND ub.active=true LIMIT 1) AS ban_type,
          (SELECT ar.role FROM admin_roles ar WHERE ar.user_id=u.id AND ar.revoked_at IS NULL LIMIT 1) AS admin_role
         FROM users u ${where}
         ORDER BY u.${sort} ${order}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );

      res.json({ users: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (e) {
      console.error("[admin] users list error:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /users/:id — user detail
  router.get("/users/:id", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });

    try {
      const { rows: userRows } = await pool.query(
        "SELECT id, display_name, email, avatar_url, created_at, guest_migrated_at, deleted_at FROM users WHERE id=$1", [id]
      );
      if (userRows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });

      const user = userRows[0];
      const [authMethods, wallet, transactions, matchStats, banHistory, adminRole] = await Promise.all([
        pool.query("SELECT type, external_id, created_at FROM credentials WHERE user_id=$1", [id]),
        pool.query("SELECT balance FROM wallets WHERE user_id=$1", [id]),
        pool.query("SELECT type, amount, balance_after, reference_id, created_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [id]),
        pool.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE winner_id=$1) AS wins FROM matches WHERE winner_id=$1 OR loser_id=$1", [id]),
        pool.query("SELECT id, type, reason, starts_at, ends_at, active, banned_by, created_at FROM user_bans WHERE user_id=$1 ORDER BY created_at DESC", [id]),
        pool.query("SELECT role, granted_at FROM admin_roles WHERE user_id=$1 AND revoked_at IS NULL", [id]),
      ]);

      res.json({
        ...user,
        authMethods: authMethods.rows.map(r => ({ type: r.type, externalId: r.type === "guest" ? r.external_id : undefined, createdAt: r.created_at })),
        wallet: wallet.rows[0] || null,
        recentTransactions: transactions.rows,
        matchStats: { total: parseInt(matchStats.rows[0]?.total || 0), wins: parseInt(matchStats.rows[0]?.wins || 0), losses: parseInt(matchStats.rows[0]?.total || 0) - parseInt(matchStats.rows[0]?.wins || 0) },
        banHistory: banHistory.rows,
        adminRole: adminRole.rows[0] || null,
      });
    } catch (e) {
      console.error("[admin] user detail error:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // PUT /users/:id — edit user
  router.put("/users/:id", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });

    const { display_name, avatar_url, email } = req.body || {};
    const updates = [];
    const params = [];
    let idx = 1;

    if (display_name !== undefined) {
      const sanitized = display_name.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
      params.push(sanitized);
      updates.push(`display_name=$${idx++}`);
    }
    if (avatar_url !== undefined) { params.push(avatar_url); updates.push(`avatar_url=$${idx++}`); }
    if (email !== undefined) {
      const norm = (email || "").trim().toLowerCase();
      if (norm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) return res.status(400).json({ error: "INVALID_EMAIL" });
      params.push(norm || null);
      updates.push(`email=$${idx++}`);
    }

    if (updates.length === 0) return res.status(400).json({ error: "NO_FIELDS" });

    params.push(id);
    const { rowCount } = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id=$${idx}`, params
    );
    if (rowCount === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });

    logAdminAction(req.adminUser.id, "user.edit", req, "user", String(id), { fields: Object.keys(req.body) });
    res.json({ ok: true });
  });

  // POST /users/:id/ban
  router.post("/users/:id/ban", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    const { reason, duration } = req.body || {};
    if (!reason) return res.status(400).json({ error: "REASON_REQUIRED" });

    const durInterval = (!duration || duration === "permanent") ? null : duration;
    await pool.query(
      `INSERT INTO user_bans (user_id, type, reason, duration, starts_at, ends_at, active, banned_by)
       VALUES ($1, 'ban', $2, $3::interval, now(), CASE WHEN $3 IS NULL THEN NULL ELSE now() + $3::interval END, true, $4)`,
      [id, reason, durInterval, req.adminUser.id]
    );

    // Force-disconnect banned user
    for (const [, socket] of io.of("/").sockets) {
      if (socket.data && socket.data.userId === id) {
        socket.emit("banned", { reason });
        socket.disconnect(true);
      }
    }

    logAdminAction(req.adminUser.id, "user.ban", req, "user", String(id), { reason, duration: duration || "permanent" });
    res.json({ ok: true });
  });

  // POST /users/:id/unban
  router.post("/users/:id/unban", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    await pool.query(
      "UPDATE user_bans SET active=false, unbanned_by=$1, unbanned_at=now() WHERE user_id=$2 AND type='ban' AND active=true",
      [req.adminUser.id, id]
    );
    logAdminAction(req.adminUser.id, "user.unban", req, "user", String(id), null);
    res.json({ ok: true });
  });

  // POST /users/:id/mute
  router.post("/users/:id/mute", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    const { reason, duration } = req.body || {};
    if (!reason) return res.status(400).json({ error: "REASON_REQUIRED" });

    const durInterval = (!duration || duration === "permanent") ? null : duration;
    await pool.query(
      `INSERT INTO user_bans (user_id, type, reason, duration, starts_at, ends_at, active, banned_by)
       VALUES ($1, 'mute', $2, $3::interval, now(), CASE WHEN $3 IS NULL THEN NULL ELSE now() + $3::interval END, true, $4)`,
      [id, reason, durInterval, req.adminUser.id]
    );
    logAdminAction(req.adminUser.id, "user.mute", req, "user", String(id), { reason, duration: duration || "permanent" });
    res.json({ ok: true });
  });

  // POST /users/:id/unmute
  router.post("/users/:id/unmute", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    await pool.query(
      "UPDATE user_bans SET active=false, unbanned_by=$1, unbanned_at=now() WHERE user_id=$2 AND type='mute' AND active=true",
      [req.adminUser.id, id]
    );
    logAdminAction(req.adminUser.id, "user.unmute", req, "user", String(id), null);
    res.json({ ok: true });
  });

  // POST /users/:id/points — adjust points
  router.post("/users/:id/points", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    const { amount, reason } = req.body || {};
    if (!amount || amount === 0) return res.status(400).json({ error: "INVALID_AMOUNT" });
    if (!reason) return res.status(400).json({ error: "REASON_REQUIRED" });

    // Ensure wallet exists before adjusting (auto-create if missing)
    await pool.query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING", [id]);

    const ref = `admin_adjust_${req.adminUser.id}_${Date.now()}`;
    let result;
    if (amount > 0) {
      result = await creditWallet(id, amount, "admin_credit", ref);
    } else {
      result = await debitWallet(id, Math.abs(amount), "admin_debit", ref);
    }

    if (!result.ok) return res.status(400).json({ error: result.code || "WALLET_ERROR" });

    logAdminAction(req.adminUser.id, "user.point_adjust", req, "user", String(id), { amount, reason });
    res.json({ ok: true, balance: result.balance });
  });

  // DELETE /users/:id — soft or hard delete
  router.delete("/users/:id", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    const hard = req.query.hard === "true";

    if (hard && req.adminUser.role !== "super_admin") return res.status(403).json({ error: "INSUFFICIENT_ROLE" });

    if (hard) {
      await pool.query("DELETE FROM credentials WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM user_bans WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM users WHERE id=$1", [id]);
    } else {
      const { rowCount } = await pool.query(
        "UPDATE users SET deleted_at=now(), display_name='[deleted]', email=NULL, avatar_url=NULL WHERE id=$1 AND deleted_at IS NULL", [id]
      );
      if (rowCount === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Force-disconnect
    for (const [, socket] of io.of("/").sockets) {
      if (socket.data && socket.data.userId === id) { socket.disconnect(true); }
    }

    logAdminAction(req.adminUser.id, "user.delete", req, "user", String(id), { hard });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MATCH MANAGEMENT (Plan 04: ADM-23 to ADM-26)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /matches/live — currently active rooms (BEFORE /matches/:id)
  router.get("/matches/live", requireRole("moderator"), (req, res) => {
    const roomsObj = getRooms();
    const live = [];
    for (const [code, room] of Object.entries(roomsObj)) {
      if (room.started) {
        live.push({ roomCode: code, mode: room.mode, startedAt: room.startedAt || null });
      }
    }
    res.json({ matches: live });
  });

  // GET /matches — paginated match history
  router.get("/matches", requireRole("moderator"), async (req, res) => {
    try {
      let { page = 1, limit = 25, dateFrom, dateTo, mode, status, playerId, sort = "ended_at", order = "desc" } = req.query;
      page = Math.max(1, parseInt(page) || 1);
      limit = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const offset = (page - 1) * limit;

      let where = "WHERE 1=1";
      const params = [];
      let idx = 1;

      if (dateFrom) { params.push(dateFrom); where += ` AND m.ended_at >= $${idx++}::date`; }
      if (dateTo) { params.push(dateTo); where += ` AND m.ended_at <= ($${idx++}::date + INTERVAL '1 day')`; }
      if (mode && mode !== "all") { params.push(mode); where += ` AND m.mode=$${idx++}`; }
      if (status === "voided") where += " AND m.voided_at IS NOT NULL";
      else if (status === "completed") where += " AND m.voided_at IS NULL";
      if (playerId) { params.push(parseInt(playerId)); where += ` AND (m.winner_id=$${idx} OR m.loser_id=$${idx})`; idx++; }

      const countRes = await pool.query(`SELECT COUNT(*) FROM matches m ${where}`, params);
      const total = parseInt(countRes.rows[0].count);

      const { rows } = await pool.query(
        `SELECT m.id, m.winner_id, m.loser_id, w.display_name AS winner_name, l.display_name AS loser_name,
          m.mode, m.reason, m.stake, m.started_at, m.ended_at, m.voided_at
         FROM matches m
         LEFT JOIN users w ON w.id=m.winner_id
         LEFT JOIN users l ON l.id=m.loser_id
         ${where}
         ORDER BY m.ended_at ${order === "asc" ? "ASC" : "DESC"}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );

      res.json({ matches: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (e) {
      console.error("[admin] matches list error:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /matches/:id — match detail
  router.get("/matches/:id", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });

    const { rows } = await pool.query(
      `SELECT m.*, w.display_name AS winner_name, l.display_name AS loser_name
       FROM matches m LEFT JOIN users w ON w.id=m.winner_id LEFT JOIN users l ON l.id=m.loser_id
       WHERE m.id=$1`, [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "MATCH_NOT_FOUND" });
    res.json(rows[0]);
  });

  // POST /matches/:id/void — void a match
  router.post("/matches/:id/void", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
    const { reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: "REASON_REQUIRED" });

    const { rows } = await pool.query("SELECT voided_at, stake, winner_id, loser_id FROM matches WHERE id=$1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "MATCH_NOT_FOUND" });
    if (rows[0].voided_at) return res.status(400).json({ error: "ALREADY_VOIDED" });

    await pool.query(
      "UPDATE matches SET voided_at=now(), voided_by=$1, void_reason=$2 WHERE id=$3",
      [req.adminUser.id, reason, id]
    );

    logAdminAction(req.adminUser.id, "match.void", req, "match", String(id), { reason, stake: rows[0].stake });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT MANAGEMENT (Plan 04: ADM-27 to ADM-30)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Emojis ---
  router.get("/content/emojis", requireRole("moderator"), async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM premium_emojis ORDER BY id");
    res.json({ emojis: rows });
  });

  router.post("/content/emojis", requireRole("admin"), async (req, res) => {
    const { name, cost, animation_url, active = true } = req.body || {};
    if (!name || cost == null || !animation_url) return res.status(400).json({ error: "MISSING_FIELDS" });
    const { rows } = await pool.query(
      "INSERT INTO premium_emojis (name, cost, animation_url, active) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, parseInt(cost), animation_url, active]
    );
    logAdminAction(req.adminUser.id, "content.emoji_create", req, "emoji", String(rows[0].id), { name });
    res.status(201).json({ ok: true, emoji: rows[0] });
  });

  router.put("/content/emojis/:id", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, cost, animation_url, active } = req.body || {};
    const updates = []; const params = []; let idx = 1;
    if (name !== undefined) { params.push(name); updates.push(`name=$${idx++}`); }
    if (cost !== undefined) { params.push(parseInt(cost)); updates.push(`cost=$${idx++}`); }
    if (animation_url !== undefined) { params.push(animation_url); updates.push(`animation_url=$${idx++}`); }
    if (active !== undefined) { params.push(active); updates.push(`active=$${idx++}`); }
    if (updates.length === 0) return res.status(400).json({ error: "NO_FIELDS" });
    params.push(id);
    const { rowCount } = await pool.query(`UPDATE premium_emojis SET ${updates.join(", ")} WHERE id=$${idx}`, params);
    if (rowCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
    logAdminAction(req.adminUser.id, "content.emoji_edit", req, "emoji", String(id), { fields: Object.keys(req.body) });
    res.json({ ok: true });
  });

  router.delete("/content/emojis/:id", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    const { rowCount } = await pool.query("DELETE FROM premium_emojis WHERE id=$1", [id]);
    if (rowCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
    logAdminAction(req.adminUser.id, "content.emoji_delete", req, "emoji", String(id), null);
    res.json({ ok: true });
  });

  // --- Announcements ---
  router.get("/content/announcements", requireRole("moderator"), async (req, res) => {
    let { page = 1, limit = 25, active } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const offset = (page - 1) * limit;
    let where = "WHERE 1=1";
    const params = [];
    let idx = 1;
    if (active !== undefined) { params.push(active === "true"); where += ` AND active=$${idx++}`; }
    const countRes = await pool.query(`SELECT COUNT(*) FROM announcements ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    const { rows } = await pool.query(
      `SELECT * FROM announcements ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    res.json({ announcements: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  router.post("/content/announcements", requireRole("admin"), async (req, res) => {
    const { title_en, title_vi, body_en, body_vi, type = "info", start_at, end_at, active = true } = req.body || {};
    if (!title_en || !title_vi) return res.status(400).json({ error: "MISSING_FIELDS" });
    const validTypes = ["info", "warning", "maintenance", "event"];
    if (!validTypes.includes(type)) return res.status(400).json({ error: "INVALID_TYPE" });
    const { rows } = await pool.query(
      `INSERT INTO announcements (title_en, title_vi, body_en, body_vi, type, start_at, end_at, active, created_by)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()), $7::timestamptz, $8, $9) RETURNING *`,
      [title_en, title_vi, body_en || null, body_vi || null, type, start_at || null, end_at || null, active, req.adminUser.id]
    );
    logAdminAction(req.adminUser.id, "content.announce_create", req, "announcement", String(rows[0].id), { title_en });
    res.status(201).json({ ok: true, announcement: rows[0] });
  });

  router.put("/content/announcements/:id", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    const fields = req.body || {};
    const updates = []; const params = []; let idx = 1;
    for (const key of ["title_en", "title_vi", "body_en", "body_vi", "type", "active"]) {
      if (fields[key] !== undefined) { params.push(fields[key]); updates.push(`${key}=$${idx++}`); }
    }
    if (fields.start_at !== undefined) { params.push(fields.start_at); updates.push(`start_at=$${idx++}::timestamptz`); }
    if (fields.end_at !== undefined) { params.push(fields.end_at); updates.push(`end_at=$${idx++}::timestamptz`); }
    updates.push(`updated_at=now()`);
    if (updates.length <= 1) return res.status(400).json({ error: "NO_FIELDS" });
    params.push(id);
    const { rowCount } = await pool.query(`UPDATE announcements SET ${updates.join(", ")} WHERE id=$${idx}`, params);
    if (rowCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
    logAdminAction(req.adminUser.id, "content.announce_edit", req, "announcement", String(id), { fields: Object.keys(fields) });
    res.json({ ok: true });
  });

  router.delete("/content/announcements/:id", requireRole("admin"), async (req, res) => {
    const id = parseInt(req.params.id);
    const { rowCount } = await pool.query("DELETE FROM announcements WHERE id=$1", [id]);
    if (rowCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
    logAdminAction(req.adminUser.id, "content.announce_delete", req, "announcement", String(id), null);
    res.json({ ok: true });
  });

  // --- Power-ups config ---
  router.get("/content/powerups", requireRole("moderator"), async (req, res) => {
    const { rows } = await pool.query("SELECT key, value FROM runtime_config WHERE key LIKE 'powerup_%' ORDER BY key");
    const powerups = rows.map(r => ({ key: r.key.replace("powerup_", ""), ...r.value }));
    res.json({ powerups });
  });

  router.put("/content/powerups/:key", requireRole("admin"), async (req, res) => {
    const key = "powerup_" + req.params.key;
    const { cost, enabled } = req.body || {};
    const value = JSON.stringify({ cost: cost != null ? parseInt(cost) : undefined, enabled: enabled != null ? enabled : undefined });
    await pool.query(
      `INSERT INTO runtime_config (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value=$2::jsonb, updated_by=$3, updated_at=now()`,
      [key, value, req.adminUser.id]
    );
    logAdminAction(req.adminUser.id, "content.powerup_edit", req, "config", key, { cost, enabled });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODERATION (Plan 04: ADM-31 to ADM-33)
  // ═══════════════════════════════════════════════════════════════════════════

  // Reports
  router.get("/moderation/reports", requireRole("moderator"), async (req, res) => {
    let { page = 1, limit = 25, status = "pending" } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params = [];
    let idx = 1;
    if (status && status !== "all") { params.push(status); where += ` AND r.status=$${idx++}`; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM reports r ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT r.*, rp.display_name AS reporter_name, rd.display_name AS reported_name
       FROM reports r
       LEFT JOIN users rp ON rp.id=r.reporter_id
       LEFT JOIN users rd ON rd.id=r.reported_id
       ${where} ORDER BY r.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    res.json({ reports: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  router.put("/moderation/reports/:id", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    const { status, resolution } = req.body || {};
    if (!["reviewed", "resolved", "dismissed"].includes(status)) return res.status(400).json({ error: "INVALID_STATUS" });

    const { rowCount } = await pool.query(
      "UPDATE reports SET status=$1, reviewed_by=$2, reviewed_at=now(), resolution=$3 WHERE id=$4",
      [status, req.adminUser.id, resolution || null, id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
    logAdminAction(req.adminUser.id, `moderation.report_${status}`, req, "report", String(id), { resolution });
    res.json({ ok: true });
  });

  // Chat logs
  router.get("/moderation/chat", requireRole("moderator"), async (req, res) => {
    let { page = 1, limit = 50, roomCode, userId, flagged, dateFrom, dateTo } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params = [];
    let idx = 1;
    if (roomCode) { params.push(roomCode); where += ` AND cl.room_code=$${idx++}`; }
    if (userId) { params.push(parseInt(userId)); where += ` AND cl.sender_id=$${idx++}`; }
    if (flagged === "true") where += " AND cl.flagged=true";
    if (dateFrom) { params.push(dateFrom); where += ` AND cl.created_at >= $${idx++}::date`; }
    if (dateTo) { params.push(dateTo); where += ` AND cl.created_at <= ($${idx++}::date + INTERVAL '1 day')`; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM chat_logs cl ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    const { rows } = await pool.query(
      `SELECT cl.*, u.display_name AS sender_name FROM chat_logs cl LEFT JOIN users u ON u.id=cl.sender_id ${where} ORDER BY cl.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    res.json({ messages: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  router.post("/moderation/chat/:id/flag", requireRole("moderator"), async (req, res) => {
    const id = parseInt(req.params.id);
    await pool.query("UPDATE chat_logs SET flagged=true WHERE id=$1", [id]);
    res.json({ ok: true });
  });

  // Suspicious activity
  router.get("/moderation/suspicious", requireRole("moderator"), async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT sub.user_id, u.display_name, sub.wins, sub.total,
          ROUND(sub.wins::numeric / sub.total * 100, 1) AS win_rate
        FROM (
          SELECT user_id, COUNT(*) FILTER (WHERE is_winner) AS wins, COUNT(*) AS total
          FROM (
            SELECT winner_id AS user_id, true AS is_winner FROM matches WHERE voided_at IS NULL
            UNION ALL
            SELECT loser_id, false FROM matches WHERE voided_at IS NULL
          ) allm
          GROUP BY user_id
          HAVING COUNT(*) >= 20 AND COUNT(*) FILTER (WHERE is_winner)::float / COUNT(*) > 0.9
        ) sub
        JOIN users u ON u.id=sub.user_id
        ORDER BY sub.wins::float / sub.total DESC
        LIMIT 50
      `);
      res.json({ suspicious: rows });
    } catch (e) {
      console.error("[admin] suspicious error:", e.message);
      res.json({ suspicious: [] });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS (Plan 05: ADM-08 to ADM-14)
  // ═══════════════════════════════════════════════════════════════════════════

  // Dashboard overview
  router.get("/analytics/overview", requireRole("moderator"), async (req, res) => {
    try {
      const [totalUsers, dau, matchesToday, pointsToday, newToday] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"),
        pool.query(`SELECT COUNT(DISTINCT user_id) AS c FROM (SELECT winner_id AS user_id FROM matches WHERE ended_at::date=CURRENT_DATE UNION SELECT loser_id FROM matches WHERE ended_at::date=CURRENT_DATE) sub`),
        pool.query("SELECT COUNT(*) FROM matches WHERE ended_at::date=CURRENT_DATE"),
        pool.query("SELECT COALESCE(ABS(SUM(amount)), 0) AS c FROM transactions WHERE created_at::date=CURRENT_DATE AND amount < 0"),
        pool.query("SELECT COUNT(*) FROM users WHERE created_at::date=CURRENT_DATE"),
      ]);

      const roomsObj = getRooms();
      const activeMatches = Object.values(roomsObj).filter(r => r.started).length;

      res.json({
        totalUsers: parseInt(totalUsers.rows[0].count),
        dau: parseInt(dau.rows[0].c),
        matchesToday: parseInt(matchesToday.rows[0].count),
        pointsSpentToday: parseInt(pointsToday.rows[0].c),
        onlineNow: io.of("/").sockets.size,
        newUsersToday: parseInt(newToday.rows[0].count),
        activeMatches,
      });
    } catch (e) {
      console.error("[admin] overview error:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Time-series: user growth
  router.get("/analytics/users", requireRole("moderator"), async (req, res) => {
    const range = ["30", "90", "365"].includes(req.query.range) ? req.query.range : "30";
    try {
      const { rows } = await pool.query(
        `SELECT created_at::date AS date, COUNT(*) AS new_users
         FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
         GROUP BY created_at::date ORDER BY date ASC`,
        [range]
      );
      res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  // Time-series: match activity
  router.get("/analytics/matches", requireRole("moderator"), async (req, res) => {
    const range = ["30", "90", "365"].includes(req.query.range) ? req.query.range : "30";
    try {
      const { rows } = await pool.query(
        `SELECT ended_at::date AS date, COUNT(*) AS matches_played,
          COUNT(*) FILTER (WHERE stake=0) AS matches_classic,
          COUNT(*) FILTER (WHERE stake>0) AS matches_wagered
         FROM matches WHERE ended_at >= CURRENT_DATE - ($1 || ' days')::interval AND voided_at IS NULL
         GROUP BY ended_at::date ORDER BY date ASC`,
        [range]
      );
      res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  // Time-series: points economy
  router.get("/analytics/points", requireRole("moderator"), async (req, res) => {
    const range = ["30", "90", "365"].includes(req.query.range) ? req.query.range : "30";
    try {
      const { rows } = await pool.query(
        `SELECT created_at::date AS date,
          COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS points_earned,
          COALESCE(ABS(SUM(amount) FILTER (WHERE amount < 0)), 0) AS points_spent
         FROM transactions WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
         GROUP BY created_at::date ORDER BY date ASC`,
        [range]
      );
      res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  // Retention cohorts
  router.get("/analytics/retention", requireRole("moderator"), async (req, res) => {
    try {
      const { rows } = await pool.query(`
        WITH cohorts AS (
          SELECT created_at::date AS cohort_date, id FROM users
          WHERE created_at >= CURRENT_DATE - INTERVAL '60 days'
        )
        SELECT cohort_date, COUNT(*) AS cohort_size,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM matches m WHERE (m.winner_id=cohorts.id OR m.loser_id=cohorts.id) AND m.ended_at::date = cohort_date + 1
          )) AS d1,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM matches m WHERE (m.winner_id=cohorts.id OR m.loser_id=cohorts.id) AND m.ended_at::date = cohort_date + 7
          )) AS d7,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM matches m WHERE (m.winner_id=cohorts.id OR m.loser_id=cohorts.id) AND m.ended_at::date = cohort_date + 30
          )) AS d30
        FROM cohorts
        GROUP BY cohort_date
        ORDER BY cohort_date DESC
        LIMIT 30
      `);
      res.json({ cohorts: rows });
    } catch (e) {
      console.error("[admin] retention error:", e.message);
      res.json({ cohorts: [] });
    }
  });

  // Revenue metrics
  router.get("/analytics/revenue", requireRole("moderator"), async (req, res) => {
    try {
      const [totalSpent, topSpenders, conversion] = await Promise.all([
        pool.query("SELECT COALESCE(ABS(SUM(amount)), 0) AS total FROM transactions WHERE amount < 0"),
        pool.query(`SELECT t.user_id, u.display_name, ABS(SUM(t.amount)) AS total_spent
          FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.amount < 0
          GROUP BY t.user_id, u.display_name ORDER BY total_spent DESC LIMIT 10`),
        pool.query("SELECT COUNT(*) FILTER (WHERE guest_migrated_at IS NOT NULL) AS converted, COUNT(*) AS total FROM users"),
      ]);
      res.json({
        totalPointsSpent: parseInt(totalSpent.rows[0].total),
        topSpenders: topSpenders.rows,
        conversionRate: {
          converted: parseInt(conversion.rows[0].converted),
          total: parseInt(conversion.rows[0].total),
          pct: conversion.rows[0].total > 0 ? Math.round(conversion.rows[0].converted / conversion.rows[0].total * 1000) / 10 : 0,
        },
      });
    } catch (e) {
      console.error("[admin] revenue error:", e.message);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OPERATIONAL CONTROLS (Plan 06: ADM-34 to ADM-38)
  // ═══════════════════════════════════════════════════════════════════════════

  // Server health
  router.get("/ops/health", requireRole("moderator"), (req, res) => {
    const mem = process.memoryUsage();
    const health = {
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(mem.rss / 1048576),
        heapUsed: Math.round(mem.heapUsed / 1048576),
        heapTotal: Math.round(mem.heapTotal / 1048576),
      },
      pgPool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      rooms: Object.keys(getRooms()).length,
      onlinePlayers: io.of("/").sockets.size,
      nodeVersion: process.version,
      pid: process.pid,
    };
    res.json(health);
  });

  // Maintenance mode
  router.get("/ops/maintenance", requireRole("moderator"), (req, res) => {
    res.json({ enabled: global._adminMaintenanceMode || false });
  });

  router.post("/ops/maintenance", requireRole("super_admin"), async (req, res) => {
    const { enabled } = req.body || {};
    global._adminMaintenanceMode = !!enabled;
    await pool.query(
      `INSERT INTO runtime_config (key, value, updated_by) VALUES ('maintenance_mode', $1::jsonb, $2)
       ON CONFLICT (key) DO UPDATE SET value=$1::jsonb, updated_by=$2, updated_at=now()`,
      [JSON.stringify(enabled), req.adminUser.id]
    );
    logAdminAction(req.adminUser.id, enabled ? "ops.maintenance_on" : "ops.maintenance_off", req, null, null, null);
    res.json({ ok: true, enabled: !!enabled });
  });

  // Config editor
  router.get("/ops/config", requireRole("admin"), async (req, res) => {
    const { rows } = await pool.query("SELECT key, value, description, updated_at FROM runtime_config ORDER BY key");
    res.json({ configs: rows });
  });

  router.put("/ops/config/:key", requireRole("super_admin"), async (req, res) => {
    const key = req.params.key;
    if (!/^[a-z0-9_]+$/.test(key)) return res.status(400).json({ error: "INVALID_KEY" });
    const { value, description } = req.body || {};
    await pool.query(
      `INSERT INTO runtime_config (key, value, description, updated_by) VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value=$2::jsonb, description=COALESCE($3, runtime_config.description), updated_by=$4, updated_at=now()`,
      [key, JSON.stringify(value), description || null, req.adminUser.id]
    );
    logAdminAction(req.adminUser.id, "ops.config_update", req, "config", key, { value });
    res.json({ ok: true });
  });

  // Backup
  router.get("/ops/backup", requireRole("admin"), async (req, res) => {
    const { rows } = await pool.query("SELECT value FROM runtime_config WHERE key='last_backup_at'");
    res.json({ lastBackupAt: rows[0]?.value || null });
  });

  router.post("/ops/backup", requireRole("super_admin"), async (req, res) => {
    // Rate limit: 1/hour
    const { rows } = await pool.query("SELECT value FROM runtime_config WHERE key='last_backup_at'");
    if (rows.length > 0) {
      const lastTime = new Date(rows[0].value).getTime();
      if (Date.now() - lastTime < 3600000) {
        return res.status(429).json({ error: "BACKUP_RATE_LIMITED", nextAllowedAt: new Date(lastTime + 3600000).toISOString() });
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${timestamp}.dump`;
    const filepath = path.join("/tmp", filename);

    execFile("pg_dump", ["--format=custom", `--file=${filepath}`], { timeout: 120000 }, async (err) => {
      if (err) {
        console.error("[admin] backup failed:", err.message);
        return res.status(500).json({ error: "BACKUP_FAILED", message: err.message });
      }
      await pool.query(
        `INSERT INTO runtime_config (key, value, updated_by) VALUES ('last_backup_at', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value=$1::jsonb, updated_by=$2, updated_at=now()`,
        [JSON.stringify(new Date().toISOString()), req.adminUser.id]
      );
      logAdminAction(req.adminUser.id, "ops.backup_trigger", req, null, null, { path: filepath });
      res.json({ ok: true, path: filepath, timestamp: new Date().toISOString() });
    });
  });

  // Audit log
  router.get("/audit", requireRole("moderator"), async (req, res) => {
    let { page = 1, limit = 50, adminId, action, dateFrom, dateTo } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params = [];
    let idx = 1;
    if (adminId) { params.push(parseInt(adminId)); where += ` AND al.admin_id=$${idx++}`; }
    if (action) { params.push(action); where += ` AND al.action=$${idx++}`; }
    if (dateFrom) { params.push(dateFrom); where += ` AND al.created_at >= $${idx++}::date`; }
    if (dateTo) { params.push(dateTo); where += ` AND al.created_at <= ($${idx++}::date + INTERVAL '1 day')`; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM admin_audit_log al ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    const { rows } = await pool.query(
      `SELECT al.*, u.display_name AS admin_name FROM admin_audit_log al
       LEFT JOIN users u ON u.id=al.admin_id
       ${where} ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    res.json({ entries: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  // ─── Public announcement endpoint (no admin auth) ─────────────────────────
  // This is actually mounted separately in server.js, not here.
}

module.exports = mountAdminRoutes;
