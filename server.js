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
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4000;

// Game config
const BOARD = 10;
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

io.on("connection", (socket) => {
  socket.data.code = null;
  socket.data.clientId = null;

  socket.on("createRoom", (arg, cb) => {
    if (typeof arg === "function") { cb = arg; arg = {}; }
    const clientId = (arg && arg.clientId) || socket.id;
    const code = newCode();
    rooms[code] = { players: {}, order: [], started: false, turn: null, scores: {} };
    rooms[code].players[clientId] = {
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null,
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
      sid: socket.id, ready: false, occ: null, hits: new Set(), online: true, timer: null,
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
      room.turn = ids[Math.floor(Math.random() * 2)];
      for (const id of ids) {
        emitToClient(room, id, "gameStart", { yourTurn: room.turn === id });
      }
    }
  });

  socket.on("fire", ({ r, c }, cb) => {
    const code = socket.data.code;
    const clientId = socket.data.clientId;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== clientId) return cb && cb({ ok: false, error: "Chưa tới lượt bạn" });
    const opp = opponentOf(room, clientId);
    if (!opp) return cb && cb({ ok: false });
    const oppData = room.players[opp];
    const me = room.players[clientId];
    const key = r + "," + c;
    if (me.hits.has(key)) return cb && cb({ ok: false, error: "Đã bắn ô này" });
    me.hits.add(key);
    const hit = oppData.occ.has(key);

    let sunkShip = null, sunkCount = 0, sunkSize = 0;
    if (hit) {
      const ship = shipSunkByHit(oppData, me.hits, key);
      if (ship) { sunkShip = ship; sunkSize = ship.size; }
      sunkCount = sunkShipCount(oppData, me.hits);
    }
    const win = sunkCount >= FLEET.length;
    const sunkCells = sunkShip ? [...sunkShip] : null;
    cb && cb({ ok: true, r, c, hit, win, sunk: !!sunkShip, sunkSize, sunkCount, sunkCells });
    emitToClient(room, opp, "incoming", { r, c, hit, sunk: !!sunkShip, sunkSize, sunkCells });

    if (win) {
      room.scores = room.scores || {};
      room.scores[clientId] = (room.scores[clientId] || 0) + 1;
      emitScores(room);
      emitToClient(room, clientId, "gameOver", { win: true });
      emitToClient(room, opp, "gameOver", { win: false });
      room.started = false;
      return;
    }
    if (!hit) room.turn = opp;
    for (const id of room.order) {
      emitToClient(room, id, "turnUpdate", { yourTurn: room.turn === id });
    }
  });

  socket.on("rematch", () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;
    for (const id of room.order) {
      room.players[id].ready = false;
      room.players[id].occ = null;
      room.players[id].hits = new Set();
    }
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
