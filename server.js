// Battleship Online - server
// Node.js + Express + Socket.IO. Room-code based matchmaking.
// clientId-based identity with reconnect grace so iPhone/Safari backgrounding
// does not drop a player out of the room.

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const store = require("./store"); // optional Redis snapshot; no-op without REDIS_URL
const { pool, runMigrations, upsertGuestCredential } = require("./db"); // Postgres: identity persistence

const app = express();
const server = http.createServer(app);
// CORS: the client is served same-origin in production, so a fixed allowlist is
// enough. SITE_ORIGIN lets a separately-hosted front-end connect; localhost for
// local dev. Empty SITE_ORIGIN falls back to same-origin only.
const SITE_ORIGIN = process.env.SITE_ORIGIN;
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:4000",
      ...(SITE_ORIGIN ? [SITE_ORIGIN] : []),
    ],
    methods: ["GET", "POST"],
  },
});

// Canonical host: when CANONICAL_HOST is set (e.g. "battleshiponline.xyz"),
// 301-redirect the Render *.onrender.com host to it so Google indexes a single
// URL (avoids duplicate-content between onrender.com and the custom domain).
// Opt-in + scoped to onrender hosts, so localhost and the custom domain are
// untouched. /healthz is exempt so uptime pings still hit any host directly.
const CANONICAL_HOST = process.env.CANONICAL_HOST;
app.use((req, res, next) => {
  const host = req.headers.host;
  if (CANONICAL_HOST && host && host !== CANONICAL_HOST && /\.onrender\.com$/i.test(host) && req.path !== "/healthz") {
    return res.redirect(301, "https://" + CANONICAL_HOST + req.originalUrl);
  }
  next();
});

// Liveness probe for Render/uptime monitors: cheap, no room scan, always 200.
app.get("/healthz", (req, res) => res.json({ ok: true, uptimeSec: Math.floor(process.uptime()) }));
// Lightweight ops snapshot: room/game/player counts + memory. JSON, no auth
// (no secrets exposed). Useful to eyeball load and spot leaked rooms.
app.get("/metrics", (req, res) => res.json(computeStats()));

// Built game bundle (run `npm run build:game`) served first, so the no-CDN
// index.html + bundled app.js are used for local/web preview. Falls back to
// public/ for any unbuilt asset.
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4000;

// Game config
const BOARD = 11;
const FLEET = [5, 4, 3, 3, 2];
const GRACE_MS = 180000; // keep a disconnected player's seat for 3 min (reload / brief network drop)
const RESTORE_GRACE_MS = 300000; // after a server restore, give seats 5 min to reconnect
const SNAPSHOT_MS = 3000; // how often to snapshot rooms to Redis (when enabled)

// rooms: code -> {
//   players: { clientId: {sid, ready, occ:Set|null, hits:Set, online, timer} },
//   order: [clientId, clientId],
//   started, turn
// }
const rooms = {};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function newCode() {
  let c;
  do { c = makeCode(); } while (rooms[c]);
  return c;
}

// Guard every client-supplied coordinate: integer and inside the board. Without
// this a crafted `fire`/`useAbility` payload could push arbitrary keys into
// `me.hits` (unbounded memory growth) or drop a mine off-grid.
function inBounds(r, c) {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < BOARD && c >= 0 && c < BOARD;
}

function validatePlacement(ships) {
  if (!Array.isArray(ships)) return null;
  const sizes = ships.map((s) => (s.cells ? s.cells.length : 0)).sort((a, b) => a - b);
  const need = [...FLEET].sort((a, b) => a - b);
  if (sizes.length !== need.length) return null;
  for (let i = 0; i < need.length; i++) if (sizes[i] !== need[i]) return null;

  const occ = new Set();
  const shipSets = [];
  for (const s of ships) {
    if (!s.cells || !s.cells.length) return null;
    const rs = s.cells.map((x) => x.r);
    const cs = s.cells.map((x) => x.c);
    const horiz = rs.every((r) => r === rs[0]);
    const vert = cs.every((c) => c === cs[0]);
    if (!horiz && !vert) return null;
    const set = new Set();
    for (const cell of s.cells) {
      const { r, c } = cell;
      if (r < 0 || r >= BOARD || c < 0 || c >= BOARD) return null;
      const key = r + "," + c;
      if (occ.has(key)) return null;
      occ.add(key);
      set.add(key);
    }
    shipSets.push(set);
  }
  return { occ, ships: shipSets };
}

// how many of a player's ships are fully sunk given the attacker's hits
function sunkShipCount(playerData, attackerHits) {
  if (!playerData.ships) return 0;
  let n = 0;
  for (const ship of playerData.ships) {
    let all = true;
    for (const k of ship) if (!attackerHits.has(k)) { all = false; break; }
    if (all) n++;
  }
  return n;
}

function opponentOf(room, clientId) {
  return room.order.find((x) => x !== clientId);
}

// Validate a client-supplied FB profile before storing/relaying it.
function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return null;
  const name = typeof p.name === "string" ? p.name.replace(/\s+/g, " ").trim().slice(0, 40) : null;
  let photo = typeof p.photo === "string" ? p.photo.trim().slice(0, 500) : null;
  if (photo && !/^https?:\/\//i.test(photo)) photo = null;
  if (!name && !photo) return null;
  return { name, photo };
}
// Store a profile on a seat without wiping an existing one when none is supplied.
function setProfileIfAny(p, prof) {
  if (!p) return;
  const s = sanitizeProfile(prof);
  if (s) p.profile = s;
}

// Free a disconnected seat after `ms`, unless the player reconnected meanwhile.
// Shared by the disconnect grace and the post-restore grace.
function scheduleSeatRelease(room, code, clientId, ms) {
  const p = room.players[clientId];
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    const r2 = rooms[code];
    if (!r2 || !r2.players[clientId]) return;
    if (r2.players[clientId].online) return; // came back
    r2.order = r2.order.filter((id) => id !== clientId);
    delete r2.players[clientId];
    clearTurnTimer(r2);
    if (r2.order.length === 0) {
      delete rooms[code];
    } else {
      io.to(code).emit("opponentLeft");
      r2.started = false;
      io.to(code).emit("roomUpdate", roomPublic(r2));
    }
  }, ms != null ? ms : GRACE_MS);
}

// Build a JSON-safe snapshot of all rooms: Sets -> arrays, transient fields
// (sockets, timers, online flags) dropped — they are rebuilt on restore.
function serializeRooms() {
  const out = {};
  for (const code in rooms) {
    const r = rooms[code];
    const players = {};
    for (const id in r.players) {
      const p = r.players[id];
      players[id] = {
        ready: !!p.ready,
        occ: p.occ ? [...p.occ] : null,
        hits: [...(p.hits || [])],
        ships: p.ships ? p.ships.map((s) => [...s]) : null,
        inv: p.inv || null,
        bonus: p.bonus || 0,
        skipNext: !!p.skipNext,
        timeouts: p.timeouts || 0,
        profile: p.profile || null,
      };
    }
    const mines = {};
    if (r.mines) for (const id in r.mines) mines[id] = [...r.mines[id]];
    out[code] = {
      code: r.code || code,
      order: r.order || [],
      started: !!r.started,
      turn: r.turn || null,
      scores: r.scores || {},
      lastStarter: r.lastStarter || null,
      mode: r.mode || "classic",
      powerups: r.powerups || {},
      mines,
      players,
    };
  }
  return out;
}

// Rebuild the live `rooms` map from a snapshot. All seats come back OFFLINE
// (sockets are gone after a restart); a grace timer is armed so abandoned games
// don't linger, and the turn clock is re-armed for games that were in progress.
function restoreRooms(snap) {
  if (!snap) return 0;
  let n = 0;
  for (const code in snap) {
    const s = snap[code];
    const players = {};
    for (const id in s.players) {
      const p = s.players[id];
      players[id] = {
        sid: null,
        ready: !!p.ready,
        occ: p.occ ? new Set(p.occ) : null,
        hits: new Set(p.hits || []),
        ships: p.ships ? p.ships.map((a) => new Set(a)) : undefined,
        online: false,
        timer: null,
        inv: p.inv || newInv(),
        bonus: p.bonus || 0,
        skipNext: !!p.skipNext,
        timeouts: p.timeouts || 0,
        profile: p.profile || null,
      };
    }
    const mines = {};
    if (s.mines) for (const id in s.mines) mines[id] = new Set(s.mines[id]);
    rooms[code] = {
      code: s.code || code,
      players,
      order: s.order || [],
      started: !!s.started,
      turn: s.turn || null,
      scores: s.scores || {},
      lastStarter: s.lastStarter || null,
      mode: s.mode || "classic",
      powerups: s.powerups || {},
      mines,
      turnTimer: null,
      turnDeadline: null,
    };
    for (const id of rooms[code].order) scheduleSeatRelease(rooms[code], code, id, RESTORE_GRACE_MS);
    if (rooms[code].started) armTurnTimer(rooms[code]);
    n++;
  }
  return n;
}

// Snapshot for /metrics: counts derived from the in-memory `rooms` map.
function computeStats() {
  let activeGames = 0, waitingRooms = 0, players = 0, online = 0;
  for (const code in rooms) {
    const r = rooms[code];
    if (r.started) activeGames++; else waitingRooms++;
    for (const id of r.order) {
      players++;
      if (r.players[id] && r.players[id].online) online++;
    }
  }
  return {
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    rooms: Object.keys(rooms).length,
    activeGames,
    waitingRooms,
    players,
    online,
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
    redis: store.isEnabled(),
    ts: Date.now(),
  };
}

function roomPublic(room) {
  const present = room.order.filter((id) => room.players[id] && room.players[id].online);
  return {
    started: room.started,
    playerCount: room.order.length,
    onlineCount: present.length,
    mode: room.mode || "classic",
  };
}

function emitToClient(room, clientId, event, data) {
  const p = room.players[clientId];
  if (p && p.sid) io.to(p.sid).emit(event, data);
}

// all cells belonging to the player's ships that are fully sunk by attackerHits
function sunkCellsList(playerData, attackerHits) {
  const out = [];
  if (!playerData.ships) return out;
  for (const ship of playerData.ships) {
    let all = true;
    for (const k of ship) if (!attackerHits.has(k)) { all = false; break; }
    if (all) for (const k of ship) out.push(k);
  }
  return out;
}

function emitScores(room) {
  room.scores = room.scores || {};
  for (const id of room.order) {
    const oppId = opponentOf(room, id);
    emitToClient(room, id, "scoreUpdate", {
      you: room.scores[id] || 0,
      opp: (oppId && room.scores[oppId]) || 0,
    });
  }
}

// ---------- Advance mode: power-ups ----------
const POWERS = ["scatter", "cross", "double", "reveal", "mine"];
function newInv() { return { scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 }; }
function expandCells(power, r, c) {
  if (power === "cross") {
    const out = [[r, c]];
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
      if (nr >= 0 && nr < BOARD && nc >= 0 && nc < BOARD) out.push([nr, nc]);
    });
    return out;
  }
  return [[r, c]];
}
// power-ups sitting on the board that `attackerId` shoots (their opponent's board)
function powerupsForAttacker(room, attackerId) {
  const defId = opponentOf(room, attackerId);
  const map = room.powerups && room.powerups[defId];
  if (!map) return [];
  return Object.keys(map).map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c, type: map[k] };
  });
}
function emitInv(room, clientId) {
  const p = room.players[clientId];
  emitToClient(room, clientId, "inventory", (p && p.inv) || newInv());
}
// maybe drop a new power-up on defenderId's board (visible to the attacker)
function maybeSpawn(room, defenderId) {
  if (room.mode !== "advance") return;
  if (Math.random() > 0.27) return; // ~1 power-up mỗi 3-4 lượt
  const defData = room.players[defenderId];
  const attackerId = opponentOf(room, defenderId);
  const attacker = attackerId && room.players[attackerId];
  if (!defData || !attacker) return;
  room.powerups = room.powerups || {};
  room.powerups[defenderId] = room.powerups[defenderId] || {};
  const taken = room.powerups[defenderId];
  const free = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = r + "," + c;
    if (defData.occ && defData.occ.has(k)) continue; // not on a ship
    if (attacker.hits.has(k)) continue;              // not an already-shot cell
    if (taken[k]) continue;
    free.push(k);
  }
  if (!free.length) return;
  const k = free[Math.floor(Math.random() * free.length)];
  taken[k] = POWERS[Math.floor(Math.random() * POWERS.length)];
  emitToClient(room, attackerId, "powerups", powerupsForAttacker(room, attackerId));
}

// Build a full state snapshot so a (re)connecting client can restore its screen.
function syncPayload(room, code, clientId) {
  const me = room.players[clientId];
  const oppId = opponentOf(room, clientId);
  const opp = oppId ? room.players[oppId] : null;
  const myShots = [];
  if (me) {
    for (const k of me.hits) {
      const [r, c] = k.split(",").map(Number);
      const hit = opp && opp.occ ? opp.occ.has(k) : false;
      myShots.push({ r, c, hit });
    }
  }
  const incoming = [];
  if (opp) {
    for (const k of opp.hits) {
      const [r, c] = k.split(",").map(Number);
      const hit = me && me.occ ? me.occ.has(k) : false;
      incoming.push({ r, c, hit });
    }
  }
  return {
    code,
    started: room.started,
    yourTurn: room.turn === clientId,
    turnDeadline: room.started ? (room.turnDeadline || null) : null,
    turnDur: TURN_MS,
    oppProfile: (opp && opp.profile) || null,
    youReady: !!(me && me.ready),
    oppPresent: !!opp,
    oppReady: !!(opp && opp.ready),
    oppOnline: !!(opp && opp.online),
    occ: me && me.occ ? [...me.occ] : [],
    myShots,
    incoming,
    sunkOpp: opp ? sunkShipCount(opp, me ? me.hits : new Set()) : 0,
    sunkMine: me ? sunkShipCount(me, opp ? opp.hits : new Set()) : 0,
    sunkOppCells: opp ? sunkCellsList(opp, me ? me.hits : new Set()) : [],
    sunkMyCells: me ? sunkCellsList(me, opp ? opp.hits : new Set()) : [],
    myScore: (room.scores && room.scores[clientId]) || 0,
    oppScore: (room.scores && oppId && room.scores[oppId]) || 0,
    mode: room.mode || "classic",
    inv: me && me.inv ? me.inv : newInv(),
    powerups: powerupsForAttacker(room, clientId),
    myMines: (room.mines && room.mines[clientId]) ? [...room.mines[clientId]] : [],
  };
}

// Give the turn to `toId`, unless they owe a skipped turn (e.g. hit a mine), in which case it bounces back.
function giveTurn(room, toId, otherId) {
  const p = room.players[toId];
  if (p && p.skipNext) { p.skipNext = false; room.turn = otherId; }
  else room.turn = toId;
}

// ---------- Turn clock: cap each turn so a player cannot stall the game ----------
const TURN_MS = 20000;   // tối đa 20s mỗi lượt
const MAX_TIMEOUTS = 3;  // bỏ lượt liên tiếp >= 3 (≈1 phút không thao tác) -> xử thua

function clearTurnTimer(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  room.turnDeadline = null;
}

// (Re)start the countdown for whoever holds the turn, and push the absolute
// deadline to both clients so they render a synced countdown.
function armTurnTimer(room) {
  clearTurnTimer(room);
  if (!room.started || !room.turn) return;
  const who = room.turn;
  room.turnDeadline = Date.now() + TURN_MS;
  for (const id of room.order) emitToClient(room, id, "turnTimer", { deadline: room.turnDeadline, dur: TURN_MS, yourTurn: id === who });
  room.turnTimer = setTimeout(() => onTurnTimeout(room, who), TURN_MS);
}

// End the game awarding the win to the opponent of loserId (forfeit/timeout).
function endGameForfeit(room, loserId, reason) {
  clearTurnTimer(room);
  const winnerId = opponentOf(room, loserId);
  if (winnerId) {
    room.scores = room.scores || {};
    room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
    emitScores(room);
    emitToClient(room, winnerId, "gameOver", { win: true, reason });
  }
  emitToClient(room, loserId, "gameOver", { win: false, reason });
  room.started = false;
  room.turn = null;
}

function onTurnTimeout(room, who) {
  if (rooms[room.code] !== room) return;            // room đã bị xóa
  if (!room.started || room.turn !== who) return;   // lượt đã chuyển đi rồi
  const p = room.players[who];
  if (!p) return;
  p.timeouts = (p.timeouts || 0) + 1;
  if (p.timeouts >= MAX_TIMEOUTS) { endGameForfeit(room, who, "timeout"); return; }
  // bỏ lượt: chuyển cho đối thủ, báo cả hai, rồi lên giờ lại
  const opp = opponentOf(room, who);
  emitToClient(room, who, "turnSkipped", { you: true });
  if (opp) emitToClient(room, opp, "turnSkipped", { you: false });
  giveTurn(room, opp, who);
  for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
  armTurnTimer(room);
}

// Resolve a set of shots fired by clientId at their opponent. Handles power-up pickup,
// mines, sunk/win detection, turn handover and all emits. Returns a summary for the caller's cb.
function doShot(room, clientId, cells) {
  const opp = opponentOf(room, clientId);
  const oppData = room.players[opp];
  const me = room.players[clientId];
  me.inv = me.inv || newInv();
  me.timeouts = 0; // người chơi vừa thao tác -> reset chuỗi bỏ lượt
  const before = sunkShipCount(oppData, me.hits);
  room.powerups = room.powerups || {};
  const pmap = room.powerups[opp] || {};
  room.mines = room.mines || {};
  const mineSet = room.mines[opp] || null;
  const results = [], collected = [];
  let anyHit = false, mineHit = false;
  for (const [rr, cc] of cells) {
    const k = rr + "," + cc;
    const hit = oppData.occ.has(k);
    if (me.hits.has(k)) { results.push({ r: rr, c: cc, hit }); continue; }
    me.hits.add(k);
    if (hit) anyHit = true;
    if (pmap[k]) { collected.push(pmap[k]); me.inv[pmap[k]] = (me.inv[pmap[k]] || 0) + 1; delete pmap[k]; }
    if (mineSet && mineSet.has(k)) { mineHit = true; mineSet.delete(k); }
    results.push({ r: rr, c: cc, hit });
  }
  const sunkCount = sunkShipCount(oppData, me.hits);
  const newSunk = sunkCount - before;
  const sunkCells = sunkCellsList(oppData, me.hits);
  const win = sunkCount >= FLEET.length;

  if (collected.length) emitToClient(room, clientId, "powerups", powerupsForAttacker(room, clientId));
  emitInv(room, clientId);
  emitToClient(room, opp, "incoming", { cells: results, sunkCells, sunkMineCount: sunkCount, newSunk, mineHit });

  if (win) {
    room.scores = room.scores || {};
    room.scores[clientId] = (room.scores[clientId] || 0) + 1;
    emitScores(room);
    emitToClient(room, clientId, "gameOver", { win: true });
    emitToClient(room, opp, "gameOver", { win: false });
    room.started = false;
    clearTurnTimer(room);
    return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
  }
  // turn: a hit keeps it; a clean miss can be saved by a bonus shot; a mine forces a loss + skip
  let keep = anyHit;
  if (!keep && (me.bonus || 0) > 0) { me.bonus--; keep = true; }
  if (mineHit) { me.skipNext = true; keep = false; }
  if (!keep) giveTurn(room, opp, clientId);
  maybeSpawn(room, opp);
  for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
  armTurnTimer(room);
  return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
}

// Reattach `socket` to a seat in `room`, migrating the seat's data to
// `newClientId` when the returning player's id changed (mobile FB wipes
// storage + player id is null under Zero Permissions). Sends sync.
function reclaimSeat(room, code, seatId, newClientId, socket) {
  const p = room.players[seatId];
  if (!p) return false;
  if (p.timer) { clearTimeout(p.timer); p.timer = null; }
  if (seatId !== newClientId) {
    delete room.players[seatId];
    room.players[newClientId] = p;
    room.order = room.order.map((id) => (id === seatId ? newClientId : id));
    if (room.turn === seatId) room.turn = newClientId;
    if (room.lastStarter === seatId) room.lastStarter = newClientId;
    if (room.scores && room.scores[seatId] != null) { room.scores[newClientId] = room.scores[seatId]; delete room.scores[seatId]; }
    if (room.powerups && room.powerups[seatId]) { room.powerups[newClientId] = room.powerups[seatId]; delete room.powerups[seatId]; }
    if (room.mines && room.mines[seatId]) { room.mines[newClientId] = room.mines[seatId]; delete room.mines[seatId]; }
  }
  p.sid = socket.id; p.online = true;
  socket.join(code);
  socket.data.code = code;
  socket.data.clientId = newClientId;
  io.to(code).emit("roomUpdate", roomPublic(room));
  const oppId = opponentOf(room, newClientId);
  if (oppId) emitToClient(room, oppId, "opponentOnline");
  emitToClient(room, newClientId, "sync", syncPayload(room, code, newClientId));
  return true;
}

io.on("connection", (socket) => {
  socket.data.code = null;
  socket.data.clientId = null;

  socket.on("createRoom", (arg, cb) => {
    if (typeof arg === "function") { cb = arg; arg = {}; }
    const clientId = (arg && arg.clientId) || socket.id;
    const code = newCode();
    const mode = (arg && arg.mode) === "advance" ? "advance" : "classic";
    rooms[code] = { code, players: {}, order: [], started: false, turn: null, scores: {}, lastStarter: null, mode, powerups: {}, turnTimer: null, turnDeadline: null };
    rooms[code].players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
    };
    rooms[code].order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
    upsertGuestCredential(clientId); // fire-and-forget: durable identity (DATA-01)
  });

  socket.on("joinRoom", (arg, cb) => {
    let code, clientId;
    if (typeof arg === "string") { code = arg; clientId = socket.id; }
    else { code = arg && arg.code; clientId = (arg && arg.clientId) || socket.id; }
    code = (code || "").toUpperCase().trim();
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false, code: "ROOM_NOT_FOUND" });
    // allow rejoin of own seat
    if (room.players[clientId]) {
      const p = room.players[clientId];
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      setProfileIfAny(p, arg && arg.profile);
      p.sid = socket.id; p.online = true;
      socket.join(code);
      socket.data.code = code;
      socket.data.clientId = clientId;
      cb && cb({ ok: true, code });
      io.to(code).emit("roomUpdate", roomPublic(room));
      const oppId = opponentOf(room, clientId);
      if (oppId) emitToClient(room, oppId, "opponentOnline");
      emitToClient(room, clientId, "sync", syncPayload(room, code, clientId));
      return;
    }
    // Reclaim a disconnected (offline) seat by code. If a returning player's
    // clientId differs from the one they left with (e.g. localStorage cleared),
    // matching by clientId fails. Letting them take over the offline seat just by
    // re-entering the room code makes reconnect work regardless. (Hijack risk
    // during the grace window is acceptable here.)
    if (room.order.length >= 2) {
      const offlineId = room.order.find((id) => room.players[id] && !room.players[id].online);
      if (offlineId) {
        reclaimSeat(room, code, offlineId, clientId, socket);
        return cb && cb({ ok: true, code, reclaimed: true });
      }
      return cb && cb({ ok: false, code: "ROOM_FULL" });
    }
    if (room.started) return cb && cb({ ok: false, code: "GAME_STARTED" });
    room.players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
      profile: sanitizeProfile(arg && arg.profile),
    };
    room.order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(room));
    io.to(code).emit("opponentJoined");
    upsertGuestCredential(clientId); // fire-and-forget: P2 persists on first session (DATA-01)
    // exchange profiles so both scoreboards show avatar + name immediately
    const oppId = opponentOf(room, clientId);
    if (oppId) {
      emitToClient(room, oppId, "oppProfile", room.players[clientId].profile || null);
      emitToClient(room, clientId, "oppProfile", room.players[oppId].profile || null);
    }
  });

  // Resume without a room code: find any room that already holds this clientId
  // (online or in its disconnect-grace window) and reattach. Lets a player who
  // reloaded or reopened the tab land straight back in their game, as long as
  // their clientId survived in localStorage.
  socket.on("resume", (arg, cb) => {
    const clientId = arg && arg.clientId;
    // Exact clientId seat — works when the id (localStorage) survived.
    if (clientId) {
      for (const code in rooms) {
        if (rooms[code].players && rooms[code].players[clientId]) {
          reclaimSeat(rooms[code], code, clientId, clientId, socket);
          upsertGuestCredential(clientId); // fire-and-forget: ensure durable credential on resume (DATA-01)
          return cb && cb({ ok: true, code });
        }
      }
    }
    return cb && cb({ ok: false });
  });

  // Reconnect attempt: client reloaded or came back from background.
  socket.on("rejoin", (arg, cb) => {
    const code = (arg && arg.code ? arg.code : "").toUpperCase().trim();
    const clientId = arg && arg.clientId;
    const room = rooms[code];
    if (!room || !clientId || !room.players[clientId]) {
      return cb && cb({ ok: false });
    }
    const p = room.players[clientId];
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    p.sid = socket.id; p.online = true;
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true });
    io.to(code).emit("roomUpdate", roomPublic(room));
    upsertGuestCredential(clientId); // fire-and-forget: ensure durable credential on rejoin (DATA-01)
    const oppId = opponentOf(room, clientId);
    if (oppId) emitToClient(room, oppId, "opponentOnline");
    emitToClient(room, clientId, "sync", syncPayload(room, code, clientId));
  });

  socket.on("placeShips", (ships, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.players[clientId]) return cb && cb({ ok: false, code: "NO_ROOM" });
    const pv = validatePlacement(ships);
    if (!pv) return cb && cb({ ok: false, code: "BAD_PLACEMENT" });
    room.players[clientId].occ = pv.occ;
    room.players[clientId].ships = pv.ships;
    room.players[clientId].ready = true;
    cb && cb({ ok: true });

    const ids = room.order;
    const allReady = ids.length === 2 && ids.every((id) => room.players[id].ready);
    const opp = opponentOf(room, clientId);
    if (opp) emitToClient(room, opp, "opponentReady");

    if (allReady) {
      room.started = true;
      // ván đầu chọn ngẫu nhiên; các ván sau đổi lượt người đi trước (so le)
      if (room.lastStarter && ids.includes(room.lastStarter)) {
        room.turn = ids.find((id) => id !== room.lastStarter);
      } else {
        room.turn = ids[Math.floor(Math.random() * 2)];
      }
      room.lastStarter = room.turn;
      room.powerups = {}; room.mines = {};
      for (const id of ids) { room.players[id].inv = newInv(); room.players[id].bonus = 0; room.players[id].skipNext = false; room.players[id].timeouts = 0; }
      for (const id of ids) {
        emitToClient(room, id, "gameStart", { yourTurn: room.turn === id, mode: room.mode || "classic" });
        emitInv(room, id);
        emitToClient(room, id, "powerups", []);
      }
      armTurnTimer(room);
    }
  });

  socket.on("fire", ({ r, c, power }, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
    if (!inBounds(r, c)) return cb && cb({ ok: false, code: "BAD_CELL" });
    const me = room.players[clientId];
    me.inv = me.inv || newInv();

    // aimed power-up shots consume inventory; classic mode ignores power entirely
    if (room.mode === "advance" && power === "cross") {
      if ((me.inv[power] || 0) <= 0) return cb && cb({ ok: false, code: "NO_POWERUP" });
      me.inv[power]--;
    } else {
      power = null;
    }
    const summary = doShot(room, clientId, expandCells(power, r, c));
    cb && cb(summary);
  });

  // Advance abilities that aren't an aimed shot
  socket.on("useAbility", ({ type, r, c }, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== clientId) return cb && cb({ ok: false, code: "NOT_YOUR_TURN" });
    const me = room.players[clientId];
    me.inv = me.inv || newInv();
    if ((me.inv[type] || 0) <= 0) return cb && cb({ ok: false, code: "NO_POWERUP" });

    if (type === "double") {
      me.inv.double--; me.bonus = (me.bonus || 0) + 1;
      me.timeouts = 0; armTurnTimer(room);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "double" });
    }
    if (type === "reveal") {
      const opp = opponentOf(room, clientId);
      const oppData = opp && room.players[opp];
      const cand = [];
      if (oppData && oppData.occ) for (const k of oppData.occ) if (!me.hits.has(k)) cand.push(k);
      if (!cand.length) return cb && cb({ ok: false, code: "NO_REVEAL" });
      me.inv.reveal--;
      me.timeouts = 0; armTurnTimer(room);
      const k = cand[Math.floor(Math.random() * cand.length)];
      const [rr, cc] = k.split(",").map(Number);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "reveal", r: rr, c: cc });
    }
    if (type === "mine") {
      // đặt mìn lên ô trống của chính mình
      if (!inBounds(r, c)) return cb && cb({ ok: false, code: "BAD_CELL" });
      const k = r + "," + c;
      const opp = opponentOf(room, clientId);
      const oppHits = opp && room.players[opp] ? room.players[opp].hits : new Set();
      if (me.occ && me.occ.has(k)) return cb && cb({ ok: false, code: "MINE_ON_SHIP" });
      if (oppHits.has(k)) return cb && cb({ ok: false, code: "CELL_SHOT" });
      room.mines = room.mines || {};
      room.mines[clientId] = room.mines[clientId] || new Set();
      if (room.mines[clientId].has(k)) return cb && cb({ ok: false, code: "MINE_EXISTS" });
      me.inv.mine--;
      room.mines[clientId].add(k);
      me.timeouts = 0; armTurnTimer(room);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "mine", r, c });
    }
    if (type === "scatter") {
      // nổ ngẫu nhiên 3-5 vị trí trên biển địch
      const cand = [];
      for (let rr = 0; rr < BOARD; rr++) for (let cc = 0; cc < BOARD; cc++) {
        const k = rr + "," + cc;
        if (!me.hits.has(k)) cand.push([rr, cc]);
      }
      if (!cand.length) return cb && cb({ ok: false, code: "NO_CELLS" });
      me.inv.scatter--;
      const n = Math.min(cand.length, 3 + Math.floor(Math.random() * 3)); // 3..5
      const pick = [];
      for (let i = 0; i < n; i++) pick.push(cand.splice(Math.floor(Math.random() * cand.length), 1)[0]);
      emitInv(room, clientId);
      const summary = doShot(room, clientId, pick);
      return cb && cb(Object.assign({ type: "scatter" }, summary));
    }
    cb && cb({ ok: false });
  });

  // Relay a chat message to the opponent. Text is trimmed + length-capped, and a
  // light per-player throttle stops a flood. No persistence — chat is ephemeral.
  socket.on("chat", (arg, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.players[clientId]) return cb && cb({ ok: false });
    const p = room.players[clientId];
    const now = Date.now();
    if (p.lastChat && now - p.lastChat < 400) return cb && cb({ ok: false }); // throttle
    p.lastChat = now;
    let text = (arg && typeof arg.text === "string") ? arg.text : "";
    text = text.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return cb && cb({ ok: false });
    const opp = opponentOf(room, clientId);
    if (opp) emitToClient(room, opp, "chat", { text, ts: now });
    cb && cb({ ok: true });
  });

  socket.on("rematch", () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;
    for (const id of room.order) {
      room.players[id].ready = false;
      room.players[id].occ = null;
      room.players[id].hits = new Set();
      room.players[id].inv = newInv();
      room.players[id].bonus = 0;
      room.players[id].skipNext = false;
      room.players[id].timeouts = 0;
    }
    room.powerups = {}; room.mines = {};
    room.started = false;
    room.turn = null;
    clearTurnTimer(room);
    io.to(code).emit("rematchStart");
  });

  socket.on("leaveRoom", (cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (room && clientId && room.players[clientId]) {
      const p = room.players[clientId];
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      room.order = room.order.filter((id) => id !== clientId);
      delete room.players[clientId];
      socket.leave(code);
      clearTurnTimer(room);
      if (room.order.length === 0) {
        delete rooms[code];
      } else {
        io.to(code).emit("opponentLeft");
        room.started = false;
        io.to(code).emit("roomUpdate", roomPublic(room));
      }
    }
    socket.data.code = null;
    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !clientId || !room.players[clientId]) return;
    const p = room.players[clientId];
    if (p.sid !== socket.id) return; // stale socket, newer one already took over
    p.online = false;
    const oppId = opponentOf(room, clientId);
    if (oppId) emitToClient(room, oppId, "opponentOffline");
    io.to(code).emit("roomUpdate", roomPublic(room));
    // free the seat only after grace period if not reconnected
    scheduleSeatRelease(room, code, clientId, GRACE_MS);
  });
});

// Boot: run DB migrations (fail-loud), then connect optional store, then listen.
(async () => {
  await runMigrations(pool); // must succeed before server.listen() — exits non-zero on failure (DATA-02)
  await store.init();
  if (store.isEnabled()) {
    try {
      const n = restoreRooms(await store.loadSnapshot());
      if (n) console.log(`[store] restored ${n} room(s) from snapshot`);
    } catch (e) {
      console.error("[store] restore failed:", e.message);
    }
    // Periodic snapshot. unref() so it never keeps the process alive on its own.
    setInterval(() => { store.saveSnapshot(serializeRooms()); }, SNAPSHOT_MS).unref();
  }
  server.listen(PORT, () => {
    console.log(`Battleship server running at http://localhost:${PORT}`);
  });
})();

// Capture the latest state on redeploy (Render/Fly send SIGTERM) before exit.
async function gracefulExit() {
  try { if (store.isEnabled()) await store.saveSnapshot(serializeRooms()); } catch (e) {}
  process.exit(0);
}
process.on("SIGTERM", gracefulExit);
process.on("SIGINT", gracefulExit);
