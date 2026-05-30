// Battleship Online - server
// Node.js + Express + Socket.IO. Room-code based matchmaking.
// clientId-based identity with reconnect grace so iPhone/Safari backgrounding
// does not drop a player out of the room.

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
// CORS: Instant Games client is hosted on Facebook's container domain, so the
// WebSocket is cross-origin. Allowlist FB origins + localhost for dev.
const io = new Server(server, {
  cors: {
    origin: [
      "https://apps.fbsbx.com", // Instant Games bundle is served from here (primary WS Origin)
      "https://www.facebook.com",
      "https://m.facebook.com", // mobile wrapper
      "http://localhost:4000",
    ],
    methods: ["GET", "POST"],
  },
});

// Built game bundle (run `npm run build:game`) served first, so the no-CDN
// index.html + bundled app.js are used for local/web preview. Falls back to
// public/ for any unbuilt asset.
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));
// Built T0 spike (run `npm run build:spike` first) at /spike/
app.use("/spike", express.static(path.join(__dirname, "dist-spike")));

const PORT = process.env.PORT || 4000;

// Game config
const BOARD = 11;
const FLEET = [5, 4, 3, 3, 2];
const TOTAL_CELLS = FLEET.reduce((a, b) => a + b, 0); // 17
const GRACE_MS = 60000; // keep a disconnected player's seat for 60s

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

// returns the ship Set that contains key and is now fully sunk, else null
function shipSunkByHit(playerData, attackerHits, key) {
  if (!playerData.ships) return null;
  for (const ship of playerData.ships) {
    if (!ship.has(key)) continue;
    for (const k of ship) if (!attackerHits.has(k)) return null;
    return ship;
  }
  return null;
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

function checkWin(room, attackerId) {
  const me = room.players[attackerId];
  const oppId = opponentOf(room, attackerId);
  const opp = room.players[oppId];
  if (!me || !opp || !opp.occ) return false;
  let count = 0;
  for (const o of opp.occ) if (me.hits.has(o)) count++;
  return count >= TOTAL_CELLS;
}

// Give the turn to `toId`, unless they owe a skipped turn (e.g. hit a mine), in which case it bounces back.
function giveTurn(room, toId, otherId) {
  const p = room.players[toId];
  if (p && p.skipNext) { p.skipNext = false; room.turn = otherId; }
  else room.turn = toId;
}

// Resolve a set of shots fired by clientId at their opponent. Handles power-up pickup,
// mines, sunk/win detection, turn handover and all emits. Returns a summary for the caller's cb.
function doShot(room, clientId, cells) {
  const opp = opponentOf(room, clientId);
  const oppData = room.players[opp];
  const me = room.players[clientId];
  me.inv = me.inv || newInv();
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
    return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
  }
  // turn: a hit keeps it; a clean miss can be saved by a bonus shot; a mine forces a loss + skip
  let keep = anyHit;
  if (!keep && (me.bonus || 0) > 0) { me.bonus--; keep = true; }
  if (mineHit) { me.skipNext = true; keep = false; }
  if (!keep) giveTurn(room, opp, clientId);
  maybeSpawn(room, opp);
  for (const id of room.order) emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
  return { ok: true, cells: results, collected, sunkCells, sunkCount, newSunk, win, anyHit, mineHit };
}

io.on("connection", (socket) => {
  socket.data.code = null;
  socket.data.clientId = null;

  // T0 spike probe: confirms WSS reachability + echoes the FBInstant identity the
  // client saw. Remove once the spike has been verified on real devices.
  socket.on("spikePing", (arg, cb) => {
    cb && cb({
      pong: true,
      serverTime: Date.now(),
      sawPlayerId: arg && arg.playerId,
      sawContextId: arg && arg.contextId,
      transport: socket.conn.transport.name,
    });
  });

  socket.on("createRoom", (arg, cb) => {
    if (typeof arg === "function") { cb = arg; arg = {}; }
    const clientId = (arg && arg.clientId) || socket.id;
    const code = newCode();
    const mode = (arg && arg.mode) === "advance" ? "advance" : "classic";
    rooms[code] = { players: {}, order: [], started: false, turn: null, scores: {}, lastStarter: null, mode, powerups: {} };
    rooms[code].players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
    };
    rooms[code].order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
  });

  socket.on("joinRoom", (arg, cb) => {
    let code, clientId;
    if (typeof arg === "string") { code = arg; clientId = socket.id; }
    else { code = arg && arg.code; clientId = (arg && arg.clientId) || socket.id; }
    code = (code || "").toUpperCase().trim();
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false, error: "Phòng không tồn tại" });
    // allow rejoin of own seat
    if (room.players[clientId]) {
      const p = room.players[clientId];
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
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
    if (room.order.length >= 2) return cb && cb({ ok: false, error: "Phòng đã đủ người" });
    if (room.started) return cb && cb({ ok: false, error: "Ván đấu đã bắt đầu" });
    room.players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null, inv: newInv(), bonus: 0,
    };
    room.order.push(clientId);
    socket.join(code);
    socket.data.code = code;
    socket.data.clientId = clientId;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(room));
    io.to(code).emit("opponentJoined");
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
    const oppId = opponentOf(room, clientId);
    if (oppId) emitToClient(room, oppId, "opponentOnline");
    emitToClient(room, clientId, "sync", syncPayload(room, code, clientId));
  });

  socket.on("placeShips", (ships, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.players[clientId]) return cb && cb({ ok: false, error: "Không có phòng" });
    const pv = validatePlacement(ships);
    if (!pv) return cb && cb({ ok: false, error: "Sắp xếp thuyền không hợp lệ" });
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
      for (const id of ids) { room.players[id].inv = newInv(); room.players[id].bonus = 0; room.players[id].skipNext = false; }
      for (const id of ids) {
        emitToClient(room, id, "gameStart", { yourTurn: room.turn === id, mode: room.mode || "classic" });
        emitInv(room, id);
        emitToClient(room, id, "powerups", []);
      }
    }
  });

  socket.on("fire", ({ r, c, power }, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== clientId) return cb && cb({ ok: false, error: "Chưa tới lượt bạn" });
    const me = room.players[clientId];
    me.inv = me.inv || newInv();

    // aimed power-up shots consume inventory; classic mode ignores power entirely
    if (room.mode === "advance" && power === "cross") {
      if ((me.inv[power] || 0) <= 0) return cb && cb({ ok: false, error: "Không có power-up" });
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
    if (room.turn !== clientId) return cb && cb({ ok: false, error: "Chưa tới lượt bạn" });
    const me = room.players[clientId];
    me.inv = me.inv || newInv();
    if ((me.inv[type] || 0) <= 0) return cb && cb({ ok: false, error: "Không có power-up" });

    if (type === "double") {
      me.inv.double--; me.bonus = (me.bonus || 0) + 1;
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "double" });
    }
    if (type === "reveal") {
      const opp = opponentOf(room, clientId);
      const oppData = opp && room.players[opp];
      const cand = [];
      if (oppData && oppData.occ) for (const k of oppData.occ) if (!me.hits.has(k)) cand.push(k);
      if (!cand.length) return cb && cb({ ok: false, error: "Không còn ô để lộ" });
      me.inv.reveal--;
      const k = cand[Math.floor(Math.random() * cand.length)];
      const [rr, cc] = k.split(",").map(Number);
      emitInv(room, clientId);
      return cb && cb({ ok: true, type: "reveal", r: rr, c: cc });
    }
    if (type === "mine") {
      // đặt mìn lên ô trống của chính mình
      const k = r + "," + c;
      const opp = opponentOf(room, clientId);
      const oppHits = opp && room.players[opp] ? room.players[opp].hits : new Set();
      if (me.occ && me.occ.has(k)) return cb && cb({ ok: false, error: "Không đặt mìn lên thuyền" });
      if (oppHits.has(k)) return cb && cb({ ok: false, error: "Ô này đã bị bắn" });
      room.mines = room.mines || {};
      room.mines[clientId] = room.mines[clientId] || new Set();
      if (room.mines[clientId].has(k)) return cb && cb({ ok: false, error: "Đã có mìn ở đây" });
      me.inv.mine--;
      room.mines[clientId].add(k);
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
      if (!cand.length) return cb && cb({ ok: false, error: "Hết ô để bắn" });
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
    }
    room.powerups = {}; room.mines = {};
    room.started = false;
    room.turn = null;
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
    p.timer = setTimeout(() => {
      const r2 = rooms[code];
      if (!r2 || !r2.players[clientId]) return;
      if (r2.players[clientId].online) return; // came back
      r2.order = r2.order.filter((id) => id !== clientId);
      delete r2.players[clientId];
      if (r2.order.length === 0) {
        delete rooms[code];
      } else {
        io.to(code).emit("opponentLeft");
        r2.started = false;
        io.to(code).emit("roomUpdate", roomPublic(r2));
      }
    }, GRACE_MS);
  });
});

server.listen(PORT, () => {
  console.log(`Battleship server running at http://localhost:${PORT}`);
});
