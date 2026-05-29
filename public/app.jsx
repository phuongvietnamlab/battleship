const { useState, useEffect, useRef, useCallback } = React;

const BOARD = 10;
const COLS = ["1","2","3","4","5","6","7","8","9","10"];
const ROWS = ["A","B","C","D","E","F","G","H","I","J"];
// fleet definitions
const FLEET_DEF = [
  { id: "carrier", name: "Tàu sân bay", size: 5 },
  { id: "battleship", name: "Thiết giáp hạm", size: 4 },
  { id: "cruiser", name: "Tàu tuần dương", size: 3 },
  { id: "submarine", name: "Tàu ngầm", size: 3 },
  { id: "destroyer", name: "Khu trục hạm", size: 2 },
];

const socket = io();

// pixel geometry of a grid cell (must match style.css)
const CELL = 38, GAP = 2, PAD = 6, PITCH = CELL + GAP; // 40

// ---------- realistic warship SVG ----------
function ShipSVG({ len }) {
  const W = len * PITCH - GAP; // px length
  const H = CELL;
  const bow = 16; // pointed bow length
  const hull = `M2,${H*0.30} L${W-bow},${H*0.22} L${W-3},${H*0.5} L${W-bow},${H*0.78} L2,${H*0.70} Q-1,${H*0.5} 2,${H*0.30} Z`;
  // turrets + superstructure scaled to length
  const turrets = [];
  const n = Math.max(1, len - 2);
  for (let i = 0; i < n; i++) {
    const x = (W * (0.18 + 0.62 * (n === 1 ? 0.5 : i / (n - 1))));
    turrets.push(x);
  }
  return (
    <svg className="ship-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      width={W} height={H} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`hg${len}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9aa6b0" />
          <stop offset="0.5" stopColor="#69757f" />
          <stop offset="1" stopColor="#3c454d" />
        </linearGradient>
      </defs>
      <path d={hull} fill={`url(#hg${len})`} stroke="#2a3138" strokeWidth="1.2" />
      {/* deck stripe */}
      <path d={`M6,${H*0.42} L${W-bow-2},${H*0.37} L${W-bow-2},${H*0.63} L6,${H*0.58} Z`}
        fill="#586671" opacity="0.7" />
      {/* bridge / superstructure */}
      <rect x={W*0.34} y={H*0.30} width={Math.max(7, W*0.10)} height={H*0.40} rx="2"
        fill="#7d8893" stroke="#2a3138" strokeWidth="0.8" />
      <rect x={W*0.37} y={H*0.18} width="4" height={H*0.22} rx="1" fill="#46505a" />
      {/* gun turrets */}
      {turrets.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={H*0.5} r={H*0.13} fill="#48535d" stroke="#222a30" strokeWidth="0.8" />
          <rect x={x} y={H*0.46} width={H*0.30} height={H*0.08} fill="#2c343b" rx="1" />
        </g>
      ))}
    </svg>
  );
}

// ---------- helpers ----------
function key(r, c) { return r + "," + c; }
function cellsFor(r, c, size, dir) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(dir === "h" ? { r, c: c + i } : { r: r + i, c });
  }
  return cells;
}
function inBounds(cells) {
  return cells.every((x) => x.r >= 0 && x.r < BOARD && x.c >= 0 && x.c < BOARD);
}

// ---------- Lobby ----------
function Lobby({ onCreate, onJoin, error }) {
  const [code, setCode] = useState("");
  return (
    <div className="lobby">
      <h2>Trận hải chiến</h2>
      <p className="sub">Tạo phòng rồi gửi mã cho bạn bè, hoặc nhập mã để vào phòng.</p>
      {error && <div className="error">{error}</div>}
      <button className="btn primary" onClick={onCreate}>⚓ Tạo phòng mới</button>
      <div className="divider">HOẶC</div>
      <div className="field">
        <label>Nhập mã phòng</label>
        <input className="code-input" maxLength={5} placeholder="ABCDE"
          value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && code && onJoin(code)} />
      </div>
      <button className="btn steel" disabled={code.length < 4} onClick={() => onJoin(code)}>Vào phòng</button>
    </div>
  );
}

// ---------- Grid ----------
function Grid({ enemy, occ, hits, incoming, onCellClick, hoverCells, onCellHover, shootable, sunk }) {
  // occ: Set of "r,c" your ships (own board)
  // hits: Set of "r,c" shots you fired at enemy (enemy board)
  // incoming: Map "r,c" -> hit boolean (shots enemy fired at you, own board)
  const cells = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      let cls = "cell";
      let content = null;
      if (enemy) {
        if (hits && hits.has(k)) {
          cls += hits.get(k) ? " hit" : " miss";
        } else if (shootable) {
          cls += " shootable";
        }
        if (hoverCells && hoverCells.has(k)) cls += " ship";
      } else {
        if (occ && occ.has(k)) cls += " ship";
        if (incoming && incoming.has(k)) cls += incoming.get(k) ? " hit" : " miss";
        if (hoverCells && hoverCells.has(k)) cls += " ship";
      }
      cells.push(
        <div key={k} className={cls}
          onClick={() => onCellClick && onCellClick(r, c)}
          onMouseEnter={() => onCellHover && onCellHover(r, c)}
          onMouseLeave={() => onCellHover && onCellHover(-1, -1)} />
      );
    }
  }
  return (
    <div className="grid-outer">
      <div className="corner"></div>
      <div className="col-labels">{COLS.map((l) => <div key={l} className="lbl">{l}</div>)}</div>
      <div className="row-labels">{ROWS.map((l) => <div key={l} className="lbl">{l}</div>)}</div>
      <div className={"grid " + (enemy ? "enemy" : "own")}
        style={{ gridTemplateColumns: `repeat(${BOARD}, 1fr)` }}>
        {cells}
      </div>
    </div>
  );
}

// ---------- Placement screen (touch + mouse drag) ----------
function Placement({ onConfirm, ready, waiting }) {
  // placed: id -> {r, c, dir}
  const [placed, setPlaced] = useState({});
  const [dir, setDir] = useState("h");      // orientation for ships dragged from the dock
  const [drag, setDrag] = useState(null);    // {id, dir, offset, dx, dy, sz, fromBoard}
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const gridRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "r" || e.key === "R") setDir((d) => (d === "h" ? "v" : "h")); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sizeOf = (id) => FLEET_DEF.find((f) => f.id === id).size;

  function occExcept(exceptId) {
    const occ = new Set();
    for (const [id, p] of Object.entries(placed)) {
      if (id === exceptId) continue;
      cellsFor(p.r, p.c, sizeOf(id), p.dir).forEach((x) => occ.add(key(x.r, x.c)));
    }
    return occ;
  }
  function validAt(cells, exceptId) {
    if (!inBounds(cells)) return false;
    const occ = occExcept(exceptId);
    return cells.every((x) => !occ.has(key(x.r, x.c)));
  }

  // anchor cell (top-left of ship) from a screen point, given active drag
  function anchorFromPoint(cx, cy, d) {
    const rect = gridRef.current.getBoundingClientRect();
    let c = Math.floor((cx - rect.left - PAD) / PITCH);
    let r = Math.floor((cy - rect.top - PAD) / PITCH);
    if (d.dir === "h") c -= d.offset; else r -= d.offset;
    return { r, c };
  }

  // start dragging (works for pointer = mouse, touch, pen)
  function startDrag(e, id, fromBoard) {
    e.preventDefault();
    const sz = sizeOf(id);
    const useDir = fromBoard ? placed[id].dir : dir;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const along = useDir === "h" ? dx : dy;
    const offset = Math.min(sz - 1, Math.max(0, Math.floor(along / PITCH)));
    setDrag({ id, dir: useDir, offset, dx, dy, sz, fromBoard });
    setPos({ x: e.clientX, y: e.clientY });
  }

  // attach window listeners while dragging
  useEffect(() => {
    if (!drag) return;
    function move(e) {
      if (e.cancelable) e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    }
    function up(e) {
      const { r, c } = anchorFromPoint(e.clientX, e.clientY, drag);
      const cells = cellsFor(r, c, drag.sz, drag.dir);
      if (validAt(cells, drag.id)) {
        setPlaced((p) => ({ ...p, [drag.id]: { r, c, dir: drag.dir } }));
      }
      setDrag(null);
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", () => setDrag(null));
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, placed]); // eslint-disable-line

  function rotatePlaced(id) {
    const p = placed[id];
    const nd = p.dir === "h" ? "v" : "h";
    const cells = cellsFor(p.r, p.c, sizeOf(id), nd);
    if (validAt(cells, id)) setPlaced((pl) => ({ ...pl, [id]: { ...p, dir: nd } }));
  }
  function removeShip(id) { setPlaced((p) => { const n = { ...p }; delete n[id]; return n; }); }

  function randomize() {
    const np = {}, taken = new Set();
    for (const f of FLEET_DEF) {
      let ok = false, t = 0;
      while (!ok && t++ < 800) {
        const d = Math.random() < 0.5 ? "h" : "v";
        const r = Math.floor(Math.random() * BOARD), c = Math.floor(Math.random() * BOARD);
        const cells = cellsFor(r, c, f.size, d);
        if (inBounds(cells) && cells.every((x) => !taken.has(key(x.r, x.c)))) {
          cells.forEach((x) => taken.add(key(x.r, x.c)));
          np[f.id] = { r, c, dir: d }; ok = true;
        }
      }
    }
    setPlaced(np);
  }

  const allPlaced = FLEET_DEF.every((f) => placed[f.id]);
  function confirm() {
    const ships = FLEET_DEF.map((f) => ({
      size: f.size, dir: placed[f.id].dir,
      cells: cellsFor(placed[f.id].r, placed[f.id].c, f.size, placed[f.id].dir),
    }));
    onConfirm(ships);
  }

  // live preview while dragging
  let hoverKeys = new Set(), hoverBad = new Set();
  if (drag) {
    const { r, c } = anchorFromPoint(pos.x, pos.y, drag);
    const cells = cellsFor(r, c, drag.sz, drag.dir);
    const valid = validAt(cells, drag.id);
    const ks = cells.filter((x) => x.r >= 0 && x.r < BOARD && x.c >= 0 && x.c < BOARD).map((x) => key(x.r, x.c));
    if (valid) hoverKeys = new Set(ks); else hoverBad = new Set(ks);
  }

  // build 10x10 cells
  const gridCells = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = key(r, c);
    let cls = "cell";
    if (hoverKeys.has(k)) cls += " preview-ok";
    if (hoverBad.has(k)) cls += " preview-bad";
    gridCells.push(<div key={k} className={cls} />);
  }

  function ghostBox(d) {
    return d.dir === "h"
      ? { width: d.sz * PITCH - GAP, height: CELL }
      : { width: CELL, height: d.sz * PITCH - GAP };
  }

  return (
    <div className="boards">
      <div className="board-wrap">
        <div className="board-title own">Hạm đội của bạn</div>
        <div className="grid-outer">
          <div className="corner"></div>
          <div className="col-labels">{COLS.map((l) => <div key={l} className="lbl">{l}</div>)}</div>
          <div className="row-labels">{ROWS.map((l) => <div key={l} className="lbl">{l}</div>)}</div>
          <div className="grid own" ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${BOARD}, 1fr)`, position: "relative" }}>
            {gridCells}
            {/* placed ships overlay */}
            {Object.entries(placed).map(([id, p]) => {
              if (drag && drag.id === id) return null; // hide while dragging
              const sz = sizeOf(id);
              const box = p.dir === "h"
                ? { left: PAD + p.c * PITCH, top: PAD + p.r * PITCH, width: sz * PITCH - GAP, height: CELL }
                : { left: PAD + p.c * PITCH, top: PAD + p.r * PITCH, width: CELL, height: sz * PITCH - GAP };
              return (
                <div key={id} className="ship-overlay" style={box}
                  onPointerDown={(e) => startDrag(e, id, true)}
                  onDoubleClick={() => rotatePlaced(id)}
                  title="Kéo để di chuyển · chạm 2 lần để xoay">
                  <div className={"ship-fig " + p.dir} style={{ width: sz * PITCH - GAP, height: CELL }}>
                    <ShipSVG len={sz} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="place-panel">
        <h3>Bố trí hạm đội</h3>
        <p className="hint">Chạm giữ &amp; kéo tàu từ kho thả vào lưới ở <b>bất kỳ vị trí</b> nào. Kéo lại để dời, chạm <b>2 lần</b> (hoặc nút Xoay) để đổi ngang/dọc.</p>

        <div className="controls" style={{ marginBottom: 14 }}>
          <button className="btn steel" onClick={() => setDir(dir === "h" ? "v" : "h")}>⟳ Hướng kho: {dir === "h" ? "Ngang" : "Dọc"}</button>
        </div>

        <div className="dock">
          {FLEET_DEF.map((f) => {
            const isPlaced = !!placed[f.id];
            const dragging = drag && drag.id === f.id && !drag.fromBoard;
            return (
              <div key={f.id} className={"dock-item" + (isPlaced ? " placed" : "")}>
                <div className="dock-info">
                  <div className="ship-name">{f.name}</div>
                  <small>{f.size} ô</small>
                </div>
                {isPlaced ? (
                  <button className="btn ghost" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}
                    onClick={() => removeShip(f.id)}>↩ Gỡ về kho</button>
                ) : (
                  <div className={"dock-ship " + dir} onPointerDown={(e) => startDrag(e, f.id, false)}
                    style={Object.assign(
                      dir === "h"
                        ? { width: f.size * PITCH - GAP, height: CELL }
                        : { width: CELL, height: f.size * PITCH - GAP },
                      dragging ? { opacity: 0.25 } : null)}>
                    <div className={"ship-fig " + dir} style={{ width: f.size * PITCH - GAP, height: CELL }}>
                      <ShipSVG len={f.size} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="controls" style={{ marginBottom: 10 }}>
          <button className="btn ghost" onClick={randomize}>🎲 Ngẫu nhiên</button>
          <button className="btn ghost" onClick={() => setPlaced({})}>Xóa hết</button>
        </div>
        <button className="btn primary" disabled={!allPlaced || ready} onClick={confirm}>
          {ready ? (waiting ? "Đang chờ đối thủ..." : "Sẵn sàng ✓") : "⚓ Sẵn sàng chiến đấu"}
        </button>
      </div>

      {/* floating ghost following the finger / cursor */}
      {drag && (
        <div className="drag-ghost" style={Object.assign(
          { left: pos.x - drag.dx, top: pos.y - drag.dy }, ghostBox(drag))}>
          <div className={"ship-fig " + drag.dir} style={{ width: drag.sz * PITCH - GAP, height: CELL }}>
            <ShipSVG len={drag.sz} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Battle screen ----------
const TOTAL_HITS = FLEET_DEF.reduce((a, f) => a + f.size, 0); // 17
function Counter({ label, value, cls }) {
  const pct = Math.round((value / TOTAL_HITS) * 100);
  return (
    <div className="counter">
      <span>{label} {value}/{TOTAL_HITS}</span>
      <div className="bar"><div className={"fill " + cls} style={{ width: pct + "%" }} /></div>
    </div>
  );
}
function Battle({ myTurn, occ, incoming, myShots, onFire, log }) {
  let myHitCount = 0; myShots.forEach((h) => h && myHitCount++);
  let enemyHitCount = 0; incoming.forEach((h) => h && enemyHitCount++);
  return (
    <div>
      <div className="boards">
        <div className="board-wrap">
          <div className="board-title enemy">Vùng biển địch {myTurn ? "— BẮN!" : ""}</div>
          <Grid enemy hits={myShots} shootable={myTurn}
            onCellClick={(r, c) => myTurn && onFire(r, c)} />
          <Counter label="Đã đánh chìm" value={myHitCount} cls="enemy" />
        </div>
        <div className="board-wrap">
          <div className="board-title own">Hạm đội của bạn</div>
          <Grid occ={occ} incoming={incoming} />
          <Counter label="Bị bắn trúng" value={enemyHitCount} cls="own" />
        </div>
      </div>
      <div className="log">
        {log.length === 0 && <div>Trận đấu bắt đầu...</div>}
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

// ---------- App ----------
function App() {
  const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [oppPresent, setOppPresent] = useState(false);
  const [oppReady, setOppReady] = useState(false);
  const [iReady, setIReady] = useState(false);
  const [myTurn, setMyTurn] = useState(false);
  const [occ, setOcc] = useState(new Set());
  const [incoming, setIncoming] = useState(new Map()); // shots on me
  const [myShots, setMyShots] = useState(new Map());   // shots I fired -> hit bool
  const [log, setLog] = useState([]);
  const [over, setOver] = useState(null); // {win}
  const [copied, setCopied] = useState(false);

  const addLog = useCallback((s) => setLog((l) => [s, ...l].slice(0, 40)), []);

  useEffect(() => {
    socket.on("opponentJoined", () => { setOppPresent(true); addLog("Đối thủ đã vào phòng."); });
    socket.on("roomUpdate", (r) => setOppPresent(r.playerCount >= 2));
    socket.on("opponentReady", () => { setOppReady(true); addLog("Đối thủ đã sẵn sàng."); });
    socket.on("gameStart", ({ yourTurn }) => {
      setScreen("battle"); setMyTurn(yourTurn);
      addLog(yourTurn ? "Bạn đi trước. Khai hỏa!" : "Đối thủ đi trước.");
    });
    socket.on("turnUpdate", ({ yourTurn }) => setMyTurn(yourTurn));
    socket.on("incoming", ({ r, c, hit }) => {
      setIncoming((m) => new Map(m).set(key(r, c), hit));
      addLog(hit ? `Địch bắn ${ROWS[r]}${c+1} — TRÚNG tàu bạn!` : `Địch bắn ${ROWS[r]}${c+1} — trượt.`);
    });
    socket.on("gameOver", ({ win }) => setOver({ win }));
    socket.on("opponentLeft", () => { addLog("Đối thủ đã rời đi."); setError("Đối thủ đã rời phòng."); });
    socket.on("rematchStart", () => {
      setScreen("placement"); setIReady(false); setOppReady(false); setMyTurn(false);
      setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map()); setOver(null); setLog([]);
    });
    return () => socket.off();
  }, [addLog]);

  function createRoom() {
    setError(null);
    socket.emit("createRoom", (res) => {
      if (res.ok) { setCode(res.code); setScreen("room"); }
    });
  }
  function joinRoom(c) {
    setError(null);
    socket.emit("joinRoom", c, (res) => {
      if (res.ok) { setCode(res.code); setOppPresent(true); setScreen("placement"); }
      else setError(res.error);
    });
  }
  function confirmPlacement(ships) {
    socket.emit("placeShips", ships, (res) => {
      if (res.ok) {
        setIReady(true);
        const s = new Set();
        ships.forEach((sh) => sh.cells.forEach((x) => s.add(key(x.r, x.c))));
        setOcc(s);
        addLog("Hạm đội đã sẵn sàng. Chờ đối thủ...");
      } else setError(res.error);
    });
  }
  function fire(r, c) {
    if (myShots.has(key(r, c))) return;
    socket.emit("fire", { r, c }, (res) => {
      if (!res.ok) return;
      setMyShots((m) => new Map(m).set(key(r, c), res.hit));
      addLog(res.hit ? `Bạn bắn ${ROWS[r]}${c+1} — TRÚNG!` : `Bạn bắn ${ROWS[r]}${c+1} — trượt.`);
      if (res.hit && !res.win) setMyTurn(true);
    });
  }
  function copyCode() {
    navigator.clipboard && navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="app">
      <div className="ocean-bg"><div className="wave"></div><div className="wave w2"></div><div className="wave w3"></div></div>
      <div className="topbar">
        <div className="logo">
          <div className="badge">⚓</div>
          <div><h1>BATTLESHIP</h1><small>Online · Hải chiến</small></div>
        </div>
        {code && screen !== "lobby" && (
          <div className="status-pill pill-wait">Phòng: <b style={{letterSpacing:3}}>{code}</b></div>
        )}
      </div>

      {screen === "lobby" && <Lobby onCreate={createRoom} onJoin={joinRoom} error={error} />}

      {screen === "room" && (
        <div className="lobby">
          <h2>Mời bạn bè</h2>
          <p className="sub">Gửi mã phòng này cho bạn. Khi họ vào, ván đấu sẽ tự bắt đầu.</p>
          <div className="room-code-box" style={{justifyContent:"center",marginBottom:18}}>
            <div className="code">{code}</div>
            <button className="btn steel copy-btn" onClick={copyCode}>{copied ? "Đã chép ✓" : "Sao chép"}</button>
          </div>
          {!oppPresent
            ? <div className="status-pill pill-wait" style={{textAlign:"center"}}>⏳ Đang chờ đối thủ vào phòng...</div>
            : null}
          {oppPresent && (
            <button className="btn primary" style={{marginTop:16}} onClick={() => setScreen("placement")}>Bắt đầu bố trí hạm đội</button>
          )}
        </div>
      )}

      {screen === "placement" && (
        <div>
          {error && <div className="error">{error}</div>}
          <div className="room-banner">
            <div className="room-code-box">
              <span>Mã phòng:</span><div className="code" style={{fontSize:24}}>{code}</div>
              <button className="btn steel copy-btn" onClick={copyCode}>{copied ? "✓" : "Chép"}</button>
            </div>
            <div className={"status-pill " + (oppReady ? "pill-ready" : "pill-wait")}>
              {oppPresent ? (oppReady ? "Đối thủ đã sẵn sàng" : "Đối thủ đang bố trí...") : "Chờ đối thủ vào..."}
            </div>
          </div>
          <Placement onConfirm={confirmPlacement} ready={iReady} waiting={iReady && !oppReady} />
        </div>
      )}

      {screen === "battle" && (
        <div>
          <div className="room-banner">
            <div className="room-code-box"><span>Mã phòng:</span><div className="code" style={{fontSize:22}}>{code}</div></div>
            <div className={"status-pill " + (myTurn ? "pill-turn" : "pill-enemy")}>
              {myTurn ? "🎯 Lượt của bạn" : "⏳ Lượt đối thủ"}
            </div>
          </div>
          <Battle myTurn={myTurn} occ={occ} incoming={incoming} myShots={myShots} onFire={fire} log={log} />
        </div>
      )}

      {over && (
        <div className="overlay">
          <div className={"modal " + (over.win ? "win" : "lose")}>
            <h2>{over.win ? "CHIẾN THẮNG!" : "THẤT BẠI"}</h2>
            <p>{over.win ? "Bạn đã đánh chìm toàn bộ hạm đội địch." : "Toàn bộ hạm đội của bạn đã bị đánh chìm."}</p>
            <button className="btn primary" onClick={() => socket.emit("rematch")}>Chơi lại</button>
          </div>
        </div>
      )}

      <div className="footer-note">Battleship Online · chia sẻ mã phòng để mời bạn bè</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
