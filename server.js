// Battleship Online - server
// Node.js + Express + Socket.IO. Room-code based matchmaking.

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
// Standard fleet: sizes
const FLEET = [5, 4, 3, 3, 2];
const TOTAL_CELLS = FLEET.reduce((a, b) => a + b, 0); // 17

// rooms: code -> { players: { socketId: {ready, board, hits} }, turn, started, order: [id,id] }
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

// Validate a placement payload: array of ships {size, cells:[{r,c}], dir}
// returns set of occupied "r,c" or null if invalid
function validatePlacement(ships) {
  if (!Array.isArray(ships)) return null;
  const sizes = ships.map((s) => (s.cells ? s.cells.length : 0)).sort((a, b) => a - b);
  const need = [...FLEET].sort((a, b) => a - b);
  if (sizes.length !== need.length) return null;
  for (let i = 0; i < need.length; i++) if (sizes[i] !== need[i]) return null;

  const occ = new Set();
  for (const s of ships) {
    if (!s.cells || !s.cells.length) return null;
    // contiguity check
    const rs = s.cells.map((x) => x.r);
    const cs = s.cells.map((x) => x.c);
    const horiz = rs.every((r) => r === rs[0]);
    const vert = cs.every((c) => c === cs[0]);
    if (!horiz && !vert) return null;
    for (const cell of s.cells) {
      const { r, c } = cell;
      if (r < 0 || r >= BOARD || c < 0 || c >= BOARD) return null;
      const key = r + "," + c;
      if (occ.has(key)) return null; // overlap
      occ.add(key);
    }
  }
  return occ;
}

function opponentOf(room, id) {
  return room.order.find((x) => x !== id);
}

function roomPublic(room) {
  return {
    started: room.started,
    playerCount: room.order.length,
  };
}

io.on("connection", (socket) => {
  socket.data.code = null;

  socket.on("createRoom", (cb) => {
    const code = newCode();
    rooms[code] = {
      players: {},
      order: [],
      started: false,
      turn: null,
    };
    rooms[code].players[socket.id] = { ready: false, occ: null, hits: new Set() };
    rooms[code].order.push(socket.id);
    socket.join(code);
    socket.data.code = code;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(rooms[code]));
  });

  socket.on("joinRoom", (code, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false, error: "Phòng không tồn tại" });
    if (room.order.length >= 2) return cb && cb({ ok: false, error: "Phòng đã đủ người" });
    if (room.started) return cb && cb({ ok: false, error: "Ván đấu đã bắt đầu" });
    room.players[socket.id] = { ready: false, occ: null, hits: new Set() };
    room.order.push(socket.id);
    socket.join(code);
    socket.data.code = code;
    cb && cb({ ok: true, code });
    io.to(code).emit("roomUpdate", roomPublic(room));
    io.to(code).emit("opponentJoined");
  });

  // player submits ship placement and is ready
  socket.on("placeShips", (ships, cb) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false, error: "Không có phòng" });
    const occ = validatePlacement(ships);
    if (!occ) return cb && cb({ ok: false, error: "Sắp xếp thuyền không hợp lệ" });
    room.players[socket.id].occ = occ;
    room.players[socket.id].ready = true;
    cb && cb({ ok: true });

    const ids = room.order;
    const allReady = ids.length === 2 && ids.every((id) => room.players[id].ready);
    // notify opponent that this player is ready
    const opp = opponentOf(room, socket.id);
    if (opp) io.to(opp).emit("opponentReady");

    if (allReady) {
      room.started = true;
      room.turn = ids[Math.floor(Math.random() * 2)];
      for (const id of ids) {
        io.to(id).emit("gameStart", { yourTurn: room.turn === id });
      }
    }
  });

  // fire at opponent
  socket.on("fire", ({ r, c }, cb) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || !room.started) return cb && cb({ ok: false });
    if (room.turn !== socket.id) return cb && cb({ ok: false, error: "Chưa tới lượt bạn" });
    const opp = opponentOf(room, socket.id);
    if (!opp) return cb && cb({ ok: false });
    const oppData = room.players[opp];
    const key = r + "," + c;
    const me = room.players[socket.id];
    if (me.hits.has(key)) return cb && cb({ ok: false, error: "Đã bắn ô này" });
    me.hits.add(key);
    const hit = oppData.occ.has(key);

    // count hits on opponent occ
    let sunkAll = false;
    if (hit) {
      let count = 0;
      for (const o of oppData.occ) if (me.hits.has(o)) count++;
      if (count >= TOTAL_CELLS) sunkAll = true;
    }

    // tell shooter the result
    cb && cb({ ok: true, r, c, hit, win: sunkAll });
    // tell opponent they were shot at
    io.to(opp).emit("incoming", { r, c, hit });

    if (sunkAll) {
      io.to(socket.id).emit("gameOver", { win: true });
      io.to(opp).emit("gameOver", { win: false });
      room.started = false;
      return;
    }
    // miss -> switch turn; hit -> keep turn (classic optional rule: here switch on miss only)
    if (!hit) {
      room.turn = opp;
    }
    for (const id of room.order) {
      io.to(id).emit("turnUpdate", { yourTurn: room.turn === id });
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

  socket.on("disconnect", () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;
    room.order = room.order.filter((id) => id !== socket.id);
    delete room.players[socket.id];
    if (room.order.length === 0) {
      delete rooms[code];
    } else {
      io.to(code).emit("opponentLeft");
      room.started = false;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Battleship server running at http://localhost:${PORT}`);
});
