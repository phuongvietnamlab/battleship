const { useState, useEffect, useRef, useCallback } = React;

const BOARD = 11;
const COLS = ["1","2","3","4","5","6","7","8","9","10","11"];
const ROWS = ["A","B","C","D","E","F","G","H","I","J","K"];
// fleet definitions
const FLEET_DEF = [
  { id: "carrier", name: "Tàu sân bay", size: 5 },
  { id: "battleship", name: "Thiết giáp hạm", size: 4 },
  { id: "cruiser", name: "Tàu tuần dương", size: 3 },
  { id: "submarine", name: "Tàu ngầm", size: 3 },
  { id: "destroyer", name: "Khu trục hạm", size: 2 },
];

const socket = io();

// ---------- âm thanh (Web Audio, không cần file) ----------
const Sound = (function () {
  let ctx = null, enabled = true;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // mở khóa âm thanh sau cú chạm đầu tiên (bắt buộc trên iOS Safari)
  function unlock() { const c = ac(); if (c) { const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.01); } }
  window.addEventListener("pointerdown", unlock, { once: true });

  function tone(freq, dur, type, vol, slideTo) {
    const c = ac(); if (!c || !enabled) return;
    const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    const c = ac(); if (!c || !enabled) return;
    const t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol || 0.4;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t);
  }
  return {
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },
    hit() { tone(180, 0.18, "square", 0.35, 90); noise(0.18, 0.25); },
    miss() { tone(320, 0.12, "sine", 0.18, 160); },
    sunk() { noise(0.5, 0.5); tone(120, 0.5, "sawtooth", 0.35, 50); },
    fire() { tone(220, 0.08, "triangle", 0.2, 120); },
    powerup() { tone(660, 0.1, "sine", 0.3); setTimeout(() => tone(990, 0.12, "sine", 0.3), 90); },
    mine() { noise(0.6, 0.6); tone(90, 0.6, "sawtooth", 0.45, 40); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle", 0.3), i * 130)); },
    lose() { [400, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.28, "sawtooth", 0.25), i * 150)); },
  };
})();

// persistent client identity so reconnects (e.g. Safari backgrounding) keep our seat
const clientId = (function () {
  try {
    let id = localStorage.getItem("bs_clientId");
    if (!id) { id = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("bs_clientId", id); }
    return id;
  } catch (e) { return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();
function saveRoom(c) { try { c ? localStorage.setItem("bs_room", c) : localStorage.removeItem("bs_room"); } catch (e) {} }
function loadRoom() { try { return localStorage.getItem("bs_room"); } catch (e) { return null; } }

// pixel geometry of a grid cell (must match style.css)
const CELL = 32, GAP = 2, PAD = 6, PITCH = CELL + GAP; // 34

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
function Lobby({ onCreate, onJoin, onBot, error }) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("classic");
  return (
    <div className="lobby">
      <h2>Trận hải chiến</h2>
      <p className="sub">Chơi với máy, hoặc tạo phòng rồi gửi mã cho bạn bè.</p>
      {error && <div className="error">{error}</div>}
      <button className="btn primary" onClick={onBot}>🤖 Chơi với máy</button>
      <div style={{ height: 10 }} />
      <div className="mode-pick">
        <button className={"mode-opt" + (mode === "classic" ? " on" : "")} onClick={() => setMode("classic")}>
          <b>Classic</b><span>Cổ điển, không power-up</span>
        </button>
        <button className={"mode-opt" + (mode === "advance" ? " on" : "")} onClick={() => setMode("advance")}>
          <b>Advance ⚡</b><span>Nhặt &amp; dùng power-up</span>
        </button>
      </div>
      <button className="btn steel" onClick={() => onCreate(mode)}>⚓ Tạo phòng mới</button>
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
const POWER_ICON = { cluster: "\u{1F4A5}", cross: "➕", double: "\u{1F501}", reveal: "\u{1F50D}", mine: "\u{1F6A7}" };
const POWER_NAME = { cluster: "Bắn chùm 2x2", cross: "Tên lửa chữ thập", double: "Thêm lượt", reveal: "Lộ ô thuyền", mine: "Mìn nước" };
function Grid({ enemy, occ, hits, incoming, onCellClick, hoverCells, onCellHover, shootable, sunk, flash, powerups, revealed, aimCells, mines, placeable }) {
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
        if (powerups && powerups.has(k) && !(hits && hits.has(k))) {
          cls += " powerup"; content = POWER_ICON[powerups.get(k)] || "⭐";
        }
        if (revealed && revealed.has(k) && !(hits && hits.has(k))) cls += " revealed";
        if (aimCells && aimCells.has(k)) cls += " aim";
        if (hoverCells && hoverCells.has(k)) cls += " ship";
      } else {
        if (occ && occ.has(k)) cls += " ship";
        if (incoming && incoming.has(k)) cls += incoming.get(k) ? " hit" : " miss";
        if (mines && mines.has(k)) { cls += " mine"; content = POWER_ICON.mine; }
        if (placeable && !(occ && occ.has(k)) && !(incoming && incoming.has(k)) && !(mines && mines.has(k))) cls += " selectable";
        if (hoverCells && hoverCells.has(k)) cls += " ship";
      }
      if (sunk && sunk.has(k)) cls += " sunk";
      if (flash && flash === k) cls += " flash";
      cells.push(
        <div key={k} className={cls}
          onClick={() => onCellClick && onCellClick(r, c)}
          onMouseEnter={() => onCellHover && onCellHover(r, c)}
          onMouseLeave={() => onCellHover && onCellHover(-1, -1)}>{content}</div>
      );
    }
  }
  return (
    <div className="grid-outer">
      <div className="corner"></div>
      <div className="col-labels">{COLS.map((l) => <div key={l} className="lbl">{l}</div>)}</div>
      <div className="row-labels">{ROWS.map((l) => <div key={l} className="lbl">{l}</div>)}</div>
      <div className={"grid " + (enemy ? "enemy" : "own")}
        style={{ gridTemplateColumns: `repeat(${BOARD}, ${CELL}px)` }}>
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
  const [sel, setSel] = useState(null);      // tap-to-place: {id, fromBoard}
  const gridRef = useRef(null);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

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
    movedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ id, dir: useDir, offset, dx, dy, sz, fromBoard });
    setPos({ x: e.clientX, y: e.clientY });
  }

  // attach window listeners while dragging
  useEffect(() => {
    if (!drag) return;
    function move(e) {
      if (e.cancelable) e.preventDefault();
      const dxm = e.clientX - startRef.current.x, dym = e.clientY - startRef.current.y;
      if (Math.abs(dxm) > 8 || Math.abs(dym) > 8) movedRef.current = true;
      setPos({ x: e.clientX, y: e.clientY });
    }
    function up(e) {
      const d = drag;
      // a tap (barely moved): switch to tap-to-place / rotate instead of drop
      if (!movedRef.current) {
        if (d.fromBoard) rotatePlaced(d.id);
        else setSel({ id: d.id, fromBoard: false });
        setDrag(null);
        return;
      }
      const { r, c } = anchorFromPoint(e.clientX, e.clientY, d);
      const cells = cellsFor(r, c, d.sz, d.dir);
      if (validAt(cells, d.id)) {
        setPlaced((p) => ({ ...p, [d.id]: { r, c, dir: d.dir } }));
        setSel(null);
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
  function removeShip(id) { setPlaced((p) => { const n = { ...p }; delete n[id]; return n; }); if (sel && sel.id === id) setSel(null); }

  // tap-to-place: clicked cell becomes the top-left anchor of the selected ship
  function placeSelectedAt(r, c) {
    if (!sel) return;
    const sz = sizeOf(sel.id);
    const useDir = sel.fromBoard ? placed[sel.id].dir : dir;
    const cells = cellsFor(r, c, sz, useDir);
    if (validAt(cells, sel.id)) {
      setPlaced((p) => ({ ...p, [sel.id]: { r, c, dir: useDir } }));
      setSel(null);
    }
  }

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
    if (sel) cls += " selectable";
    gridCells.push(
      <div key={k} className={cls}
        onClick={() => placeSelectedAt(r, c)}
        onMouseEnter={() => {}} />
    );
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
            style={{ gridTemplateColumns: `repeat(${BOARD}, ${CELL}px)`, position: "relative" }}>
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
        <p className="hint">2 cách: <b>kéo-thả</b> tàu vào lưới, hoặc <b>chạm 1 tàu</b> trong kho rồi <b>chạm ô</b> trên lưới để đặt (ô bạn chạm là đầu tàu). Chạm tàu đã đặt để xoay.</p>

        {sel && (
          <div className="sel-banner">
            Đã chọn: <b>{FLEET_DEF.find((f) => f.id === sel.id).name}</b> — chạm vào lưới để đặt.
            <button className="btn ghost" style={{ width: "auto", padding: "3px 8px", fontSize: 11, marginLeft: 8 }} onClick={() => setSel(null)}>Hủy</button>
          </div>
        )}

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
                  <div className={"dock-ship " + dir + (sel && sel.id === f.id ? " sel" : "")} onPointerDown={(e) => startDrag(e, f.id, false)}
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
const TOTAL_SHIPS = FLEET_DEF.length; // 5
function Counter({ label, value, cls }) {
  const pct = Math.round((value / TOTAL_SHIPS) * 100);
  return (
    <div className="counter">
      <span>{label} {value}/{TOTAL_SHIPS} thuyền</span>
      <div className="bar"><div className={"fill " + cls} style={{ width: pct + "%" }} /></div>
    </div>
  );
}
function PowerBar({ inv, aim, onPower, myTurn }) {
  const items = ["cluster", "cross", "double", "reveal", "mine"];
  return (
    <div className="powerbar">
      {items.map((t) => (
        <button key={t} disabled={!myTurn || (inv[t] || 0) <= 0}
          className={"power-btn" + (aim === t ? " aiming" : "")} onClick={() => onPower(t)}>
          <span className="pi">{POWER_ICON[t]}</span>
          <span className="pn">{POWER_NAME[t]}</span>
          <span className="pc">{inv[t] || 0}</span>
        </button>
      ))}
    </div>
  );
}
function Battle({ myTurn, vsBot, occ, incoming, myShots, onFire, log, sunkOpp, sunkMine, sunkEnemyCells, sunkMyCells, myScore, oppScore, oppLabel, flashEnemy, flashMine, mode, inv, powerups, revealedEnemy, aim, onPower, myMines, onPlaceMine }) {
  const [tab, setTab] = useState("enemy"); // enemy | own (mobile)
  // tự động chuyển tab theo lượt, delay ~2s để kịp nhìn địch bắn vào đâu rồi mới đổi bản đồ
  useEffect(() => {
    if (aim === "mine") { setTab("own"); return; }
    const t = setTimeout(() => setTab(myTurn ? "enemy" : "own"), 2000);
    return () => clearTimeout(t);
  }, [myTurn, aim]);
  return (
    <div>
      <div className="scoreboard">
        <span className="sc-me">Bạn <b>{myScore}</b></span>
        <span className="sc-sep">—</span>
        <span className="sc-opp"><b>{oppScore}</b> {oppLabel}</span>
      </div>
      <div className="battle-tabs">
        <button className={"tab-btn" + (tab === "enemy" ? " active" : "")} onClick={() => setTab("enemy")}>
          🎯 Biển địch {myTurn ? "· BẮN!" : ""}
        </button>
        <button className={"tab-btn" + (tab === "own" ? " active" : "")} onClick={() => setTab("own")}>
          ⚓ Hạm đội bạn
        </button>
      </div>
      {mode === "advance" && (
        <PowerBar inv={inv} aim={aim} onPower={onPower} myTurn={myTurn} />
      )}
      {aim && aim !== "mine" && (
        <div className="aim-banner">Đang ngắm <b>{POWER_NAME[aim]}</b> — chạm vào biển địch để khai hỏa (chạm lại nút để hủy).</div>
      )}
      {aim === "mine" && (
        <div className="aim-banner">Đang đặt <b>Mìn nước</b> — chạm vào ô trống trên hạm đội của bạn để đặt (chạm lại nút để hủy).</div>
      )}
      <div className="turn-indicator">
        <div className={"status-pill " + (myTurn ? "pill-turn" : "pill-enemy")}>
          {myTurn ? "🎯 Lượt của bạn" : (vsBot ? "⏳ Lượt của máy" : "⏳ Lượt đối thủ")}
        </div>
      </div>
      <div className={"boards tab-" + tab}>
        <div className="board-wrap wrap-enemy">
          <div className="board-title enemy">Vùng biển địch {myTurn ? "— BẮN!" : ""}</div>
          <Grid enemy hits={myShots} shootable={myTurn} sunk={sunkEnemyCells} flash={flashEnemy}
            powerups={powerups} revealed={revealedEnemy}
            onCellClick={(r, c) => myTurn && onFire(r, c)} />
          <Counter label="Đã đánh chìm" value={sunkOpp} cls="enemy" />
        </div>
        <div className="board-wrap wrap-own">
          <div className="board-title own">Hạm đội của bạn</div>
          <Grid occ={occ} incoming={incoming} sunk={sunkMyCells} flash={flashMine}
            mines={myMines} placeable={aim === "mine"}
            onCellClick={(r, c) => aim === "mine" && onPlaceMine(r, c)} />
          <Counter label="Thuyền bị chìm" value={sunkMine} cls="own" />
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
  const [sunkOpp, setSunkOpp] = useState(0);   // địch bị ta đánh chìm
  const [sunkMine, setSunkMine] = useState(0); // thuyền của ta bị chìm
  const [mode, setMode] = useState("classic"); // classic | advance
  const [inv, setInv] = useState({ cluster: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
  const [myMines, setMyMines] = useState(new Set()); // mìn ta đã đặt trên hạm đội mình
  const [powerups, setPowerups] = useState(new Map()); // ô power-up trên biển địch: key->type
  const [revealedEnemy, setRevealedEnemy] = useState(new Set()); // ô thuyền địch đã bị lộ
  const [aim, setAim] = useState(null); // power-up đang ngắm: null | "cluster" | "cross"
  const [flashEnemy, setFlashEnemy] = useState(null); // ô mình vừa bắn (biển địch)
  const [flashMine, setFlashMine] = useState(null);   // ô địch vừa bắn (hạm đội mình)
  const [sunkEnemyCells, setSunkEnemyCells] = useState(new Set()); // ô thuyền địch đã chìm
  const [sunkMyCells, setSunkMyCells] = useState(new Set());       // ô thuyền ta đã chìm
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [notice, setNotice] = useState(null); // thông báo nổi (vd: dẫm mìn)
  const [soundOn, setSoundOn] = useState(true);
  function toggleSound() { const v = !soundOn; setSoundOn(v); Sound.setEnabled(v); }
  const [vsBot, setVsBot] = useState(false);   // chế độ chơi với máy
  const botData = useRef(null);                // {occ:Set, ships:[Set]}
  const myShipsRef = useRef([]);               // [Set] thuyền của ta (để máy dò chìm)
  const botShotsRef = useRef(new Set());       // ô máy đã bắn
  const botQueueRef = useRef([]);              // hàng đợi ô mục tiêu của máy
  const myShotsRef = useRef(new Set());         // ô ta đã bắn (đồng bộ tức thời cho bot)

  const addLog = useCallback((s) => setLog((l) => [s, ...l].slice(0, 40)), []);
  const showNotice = useCallback((s) => { setNotice(s); setTimeout(() => setNotice((n) => (n === s ? null : n)), 4000); }, []);

  useEffect(() => {
    socket.on("opponentJoined", () => {
      setOppPresent(true); addLog("Đối thủ đã vào phòng.");
      setScreen((s) => (s === "room" ? "placement" : s));
    });
    socket.on("roomUpdate", (r) => {
      const has = r.playerCount >= 2;
      setOppPresent(has);
      if (r.mode) setMode(r.mode);
      if (has) setScreen((s) => (s === "room" ? "placement" : s));
    });
    socket.on("opponentReady", () => { setOppReady(true); addLog("Đối thủ đã sẵn sàng."); });
    socket.on("opponentOffline", () => { addLog("Đối thủ tạm mất kết nối, đang chờ kết nối lại..."); });
    socket.on("opponentOnline", () => { setOppPresent(true); addLog("Đối thủ đã kết nối lại."); });
    socket.on("sync", (st) => {
      setCode(st.code); saveRoom(st.code);
      setOppPresent(st.oppPresent);
      setOppReady(st.oppReady);
      setOcc(new Set(st.occ || []));
      const ms = new Map(); (st.myShots || []).forEach((s) => ms.set(key(s.r, s.c), s.hit));
      setMyShots(ms);
      const inc = new Map(); (st.incoming || []).forEach((s) => inc.set(key(s.r, s.c), s.hit));
      setIncoming(inc);
      setSunkOpp(st.sunkOpp || 0); setSunkMine(st.sunkMine || 0);
      setSunkEnemyCells(new Set(st.sunkOppCells || []));
      setSunkMyCells(new Set(st.sunkMyCells || []));
      setMyScore(st.myScore || 0); setOppScore(st.oppScore || 0);
      setMode(st.mode || "classic");
      if (st.inv) setInv(st.inv);
      setMyMines(new Set(st.myMines || []));
      setPowerups(new Map((st.powerups || []).map((p) => [key(p.r, p.c), p.type])));
      if (st.started) { setMyTurn(st.yourTurn); setScreen("battle"); }
      else if (st.youReady) { setIReady(true); setScreen("placement"); }
      else { setScreen(st.oppPresent ? "placement" : "room"); }
    });
    // on (re)connect, try to rejoin a stored room
    socket.on("connect", () => {
      const r = loadRoom();
      if (r) socket.emit("rejoin", { code: r, clientId }, (res) => {
        if (!res || !res.ok) { saveRoom(null); }
      });
    });
    socket.on("gameStart", ({ yourTurn, mode: m }) => {
      setScreen("battle"); setMyTurn(yourTurn);
      setMode(m || "classic");
      setInv({ cluster: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
      setPowerups(new Map()); setRevealedEnemy(new Set()); setAim(null); setMyMines(new Set());
      addLog(yourTurn ? "Bạn đi trước. Khai hỏa!" : "Đối thủ đi trước.");
    });
    socket.on("inventory", (i) => setInv(i));
    socket.on("powerups", (list) => setPowerups(new Map((list || []).map((p) => [key(p.r, p.c), p.type]))));
    socket.on("turnUpdate", ({ yourTurn }) => setMyTurn(yourTurn));
    socket.on("incoming", ({ cells, sunkCells, sunkMineCount, newSunk, mineHit }) => {
      const list = cells || [];
      setIncoming((m) => { const n = new Map(m); list.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
      if (list.length) setFlashMine(key(list[list.length - 1].r, list[list.length - 1].c));
      if (typeof sunkMineCount === "number") setSunkMine(sunkMineCount);
      if (sunkCells) setSunkMyCells((s) => { const n = new Set(s); sunkCells.forEach((k) => n.add(k)); return n; });
      if (mineHit) setMyMines((s) => { const n = new Set(s); list.forEach((c) => n.delete(key(c.r, c.c))); return n; });
      const anyHit = list.some((s) => s.hit);
      if (mineHit) { addLog("Địch bắn trúng MÌN của bạn — địch mất lượt kế tiếp!"); showNotice("💥 Địch dẫm phải MÌN của bạn! Địch mất lượt kế tiếp."); Sound.mine(); }
      if (newSunk > 0) addLog(`Địch ĐÁNH CHÌM ${newSunk} thuyền của bạn!`);
      else if (list.length > 1) addLog(anyHit ? `Địch dùng power-up — TRÚNG tàu bạn!` : `Địch dùng power-up — trượt.`);
      else if (list.length === 1) addLog(anyHit ? `Địch bắn ${ROWS[list[0].r]}${list[0].c + 1} — TRÚNG tàu bạn!` : `Địch bắn ${ROWS[list[0].r]}${list[0].c + 1} — trượt.`);
      if (newSunk > 0) Sound.sunk(); else if (anyHit) Sound.hit(); else if (list.length) Sound.miss();
    });
    socket.on("scoreUpdate", ({ you, opp }) => { setMyScore(you); setOppScore(opp); });
    socket.on("gameOver", ({ win }) => { setOver({ win }); win ? Sound.win() : Sound.lose(); });
    socket.on("opponentLeft", () => { addLog("Đối thủ đã rời đi."); setError("Đối thủ đã rời phòng."); });
    socket.on("rematchStart", () => {
      setScreen("placement"); setIReady(false); setOppReady(false); setMyTurn(false);
      setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map()); setOver(null); setLog([]);
      setSunkOpp(0); setSunkMine(0);
      setSunkEnemyCells(new Set()); setSunkMyCells(new Set()); // giữ nguyên tỉ số
      setInv({ cluster: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
      setPowerups(new Map()); setRevealedEnemy(new Set()); setAim(null); setMyMines(new Set());
    });
    // if already connected when listeners attach, attempt rejoin now
    if (socket.connected) {
      const r = loadRoom();
      if (r) socket.emit("rejoin", { code: r, clientId }, (res) => { if (!res || !res.ok) saveRoom(null); });
    }
    return () => socket.off();
  }, [addLog]);

  function createRoom(mode) {
    setError(null);
    setMyScore(0); setOppScore(0); // phòng mới: tỉ số về 0-0
    setVsBot(false); setMode(mode === "advance" ? "advance" : "classic");
    socket.emit("createRoom", { clientId, mode }, (res) => {
      if (res.ok) { setCode(res.code); saveRoom(res.code); setScreen("room"); }
    });
  }
  function joinRoom(c) {
    setError(null);
    socket.emit("joinRoom", { code: c, clientId }, (res) => {
      if (res.ok) { setCode(res.code); saveRoom(res.code); setOppPresent(true); setScreen("placement"); }
      else setError(res.error);
    });
  }
  function confirmPlacement(ships) {
    if (vsBot) {
      const s = new Set();
      myShipsRef.current = ships.map((sh) => {
        const set = new Set();
        sh.cells.forEach((x) => { const k = key(x.r, x.c); s.add(k); set.add(k); });
        return set;
      });
      setOcc(s);
      setIReady(true);
      botData.current = genFleet();
      const youFirst = Math.random() < 0.5;
      setScreen("battle");
      addLog(youFirst ? "Bạn đi trước. Khai hỏa!" : "Máy đi trước.");
      if (youFirst) setMyTurn(true);
      else { setMyTurn(false); setTimeout(botShoot, 700); }
      return;
    }
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
  // ----- chế độ chơi với máy (toàn bộ ở client) -----
  function genFleet() {
    const occ = new Set(), ships = [];
    for (const f of FLEET_DEF) {
      let ok = false, t = 0;
      while (!ok && t++ < 800) {
        const d = Math.random() < 0.5 ? "h" : "v";
        const r = Math.floor(Math.random() * BOARD), c = Math.floor(Math.random() * BOARD);
        const cells = cellsFor(r, c, f.size, d);
        if (inBounds(cells) && cells.every((x) => !occ.has(key(x.r, x.c)))) {
          const set = new Set(); cells.forEach((x) => { const k = key(x.r, x.c); occ.add(k); set.add(k); });
          ships.push(set); ok = true;
        }
      }
    }
    return { occ, ships };
  }
  function startBot(keepScore) {
    setError(null); setVsBot(true); saveRoom(null); setCode(null);
    setOppPresent(true); setOppReady(false); setIReady(false); setMyTurn(false);
    setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map());
    setLog([]); setOver(null); setSunkOpp(0); setSunkMine(0);
    setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
    if (!keepScore) { setMyScore(0); setOppScore(0); }
    botData.current = null; myShipsRef.current = []; botShotsRef.current = new Set();
    botQueueRef.current = []; myShotsRef.current = new Set();
    setScreen("placement");
  }
  function rematchAction() {
    if (vsBot) { startBot(true); return; } // giữ tỉ số
    socket.emit("rematch");
  }
  function botPick() {
    while (botQueueRef.current.length) {
      const k = botQueueRef.current.pop();
      if (!botShotsRef.current.has(k)) return k;
    }
    const parity = [], any = [];
    for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (botShotsRef.current.has(k)) continue;
      any.push(k); if ((r + c) % 2 === 0) parity.push(k);
    }
    const pool = parity.length ? parity : any;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function botShoot() {
    const k = botPick();
    if (k == null) return;
    botShotsRef.current.add(k);
    const [r, c] = k.split(",").map(Number);
    const hit = myShipsRef.current.some((ship) => ship.has(k));
    setIncoming((m) => new Map(m).set(k, hit));
    setFlashMine(k);
    if (hit) {
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < BOARD && nc >= 0 && nc < BOARD) {
          const nk = key(nr, nc); if (!botShotsRef.current.has(nk)) botQueueRef.current.push(nk);
        }
      });
      let sunk = null;
      for (const ship of myShipsRef.current) {
        if (!ship.has(k)) continue;
        if ([...ship].every((kk) => botShotsRef.current.has(kk))) { sunk = ship; break; }
      }
      if (sunk) {
        setSunkMine((n) => n + 1);
        setSunkMyCells((s) => { const n = new Set(s); sunk.forEach((kk) => n.add(kk)); return n; });
        addLog(`Máy ĐÁNH CHÌM thuyền ${sunk.size} ô của bạn!`); Sound.sunk();
      }
      else { addLog(`Máy bắn ${ROWS[r]}${c+1} — TRÚNG tàu bạn!`); Sound.hit(); }
    } else {
      addLog(`Máy bắn ${ROWS[r]}${c+1} — trượt.`); Sound.miss();
    }
    const allMineSunk = myShipsRef.current.every((ship) => [...ship].every((kk) => botShotsRef.current.has(kk)));
    if (allMineSunk) { setOppScore((n) => n + 1); setOver({ win: false }); Sound.lose(); return; }
    if (hit) setTimeout(botShoot, 600);   // trúng -> máy bắn tiếp
    else setMyTurn(true);                  // trượt -> tới lượt bạn
  }
  function fireLocal(r, c) {
    const k = key(r, c);
    if (myShotsRef.current.has(k)) return;
    myShotsRef.current.add(k);
    const hit = botData.current.occ.has(k);
    setMyShots((m) => new Map(m).set(k, hit));
    setFlashEnemy(k); Sound.fire();
    if (hit) {
      let sunk = null;
      for (const ship of botData.current.ships) {
        if (!ship.has(k)) continue;
        if ([...ship].every((kk) => myShotsRef.current.has(kk))) { sunk = ship; break; }
      }
      const cnt = botData.current.ships.filter((ship) => [...ship].every((kk) => myShotsRef.current.has(kk))).length;
      setSunkOpp(cnt);
      if (sunk) {
        setSunkEnemyCells((s) => { const n = new Set(s); sunk.forEach((kk) => n.add(kk)); return n; });
        addLog(`Bạn ĐÁNH CHÌM 1 thuyền (${sunk.size} ô)! Bắn tiếp!`); Sound.sunk();
      }
      else { addLog(`Bạn bắn ${ROWS[r]}${c+1} — TRÚNG! Bắn tiếp!`); Sound.hit(); }
      if (cnt >= FLEET_DEF.length) { setMyScore((n) => n + 1); setOver({ win: true }); Sound.win(); return; }
      // trúng -> giữ lượt
    } else {
      addLog(`Bạn bắn ${ROWS[r]}${c+1} — trượt.`); Sound.miss();
      setMyTurn(false);
      setTimeout(botShoot, 600);
    }
  }

  // áp dụng kết quả một loạt bắn (dùng chung cho fire + pháo kích)
  function applyShotResult(res, label) {
    const cells = res.cells || [];
    setMyShots((m) => { const n = new Map(m); cells.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
    if (cells.length) setFlashEnemy(key(cells[cells.length - 1].r, cells[cells.length - 1].c));
    if (typeof res.sunkCount === "number") setSunkOpp(res.sunkCount);
    if (res.sunkCells) setSunkEnemyCells((s) => { const n = new Set(s); res.sunkCells.forEach((k) => n.add(k)); return n; });
    if (res.collected && res.collected.length) addLog(`Bạn nhặt được power-up: ${res.collected.map((t) => POWER_NAME[t]).join(", ")}!`);
    const anyHit = cells.some((s) => s.hit);
    if (res.newSunk > 0) { addLog(`Bạn ĐÁNH CHÌM ${res.newSunk} thuyền! Bắn tiếp!`); Sound.sunk(); }
    else { addLog(anyHit ? `${label} — TRÚNG! Bắn tiếp!` : `${label} — trượt.`); anyHit ? Sound.hit() : Sound.miss(); }
    if (res.collected && res.collected.length) Sound.powerup();
    if (res.mineHit) { addLog("Bạn bắn trúng MÌN của địch — bạn mất lượt kế tiếp!"); showNotice("💥 Bạn dẫm phải MÌN của địch! Bạn mất lượt kế tiếp."); Sound.mine(); return; }
    if (anyHit && !res.win) setMyTurn(true);
  }

  function fire(r, c) {
    if (vsBot) { if (myTurn) fireLocal(r, c); return; }
    if (!myTurn) return;
    if (aim === "mine") { placeMine(r, c); return; }
    const power = aim; // null | "cluster" | "cross"
    if (!power && myShots.has(key(r, c))) return;
    Sound.fire();
    socket.emit("fire", { r, c, power }, (res) => {
      if (!res.ok) { if (res.error) addLog(res.error); return; }
      setAim(null);
      const label = power ? `Power-up ${POWER_NAME[power]}` : `Bạn bắn ${ROWS[r]}${c + 1}`;
      applyShotResult(res, label);
    });
  }
  function placeMine(r, c) {
    socket.emit("useAbility", { type: "mine", r, c }, (res) => {
      if (!res.ok) { if (res.error) addLog(res.error); return; }
      setMyMines((s) => new Set(s).add(key(res.r, res.c)));
      setAim(null);
      addLog(`Đã đặt mìn tại ${ROWS[res.r]}${res.c + 1}. Địch bắn trúng sẽ mất lượt!`);
    });
  }
  // dùng power-up trong kho
  function activatePower(type) {
    if (!myTurn || (inv[type] || 0) <= 0) return;
    if (type === "cluster" || type === "cross" || type === "mine") { setAim((a) => (a === type ? null : type)); return; }
    socket.emit("useAbility", { type }, (res) => {
      if (!res.ok) { if (res.error) addLog(res.error); return; }
      if (res.type === "double") addLog("Kích hoạt Thêm lượt — phát trượt kế tiếp vẫn giữ lượt!");
      else if (res.type === "reveal") {
        setRevealedEnemy((s) => new Set(s).add(key(res.r, res.c)));
        addLog(`Lộ 1 ô thuyền địch tại ${ROWS[res.r]}${res.c + 1}!`);
      }
    });
  }
  function resetToLobby() {
    saveRoom(null);
    setCode(null); setError(null); setOppPresent(false); setOppReady(false);
    setIReady(false); setMyTurn(false); setOcc(new Set());
    setIncoming(new Map()); setMyShots(new Map()); setLog([]); setOver(null);
    setSunkOpp(0); setSunkMine(0); setVsBot(false);
    setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
    setMyScore(0); setOppScore(0);
    setMode("classic"); setInv({ cluster: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
    setPowerups(new Map()); setRevealedEnemy(new Set()); setAim(null); setMyMines(new Set());
    setScreen("lobby");
  }
  function leaveRoom() {
    if (!window.confirm("Rời phòng và thoát ván đấu?")) return;
    if (!vsBot) socket.emit("leaveRoom", () => {});
    resetToLobby();
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
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="btn ghost" title="Bật/tắt âm thanh" style={{width:"auto",padding:"6px 10px",fontSize:14}} onClick={toggleSound}>{soundOn ? "🔊" : "🔇"}</button>
          {screen !== "lobby" && (code || vsBot) && (<>
            <div className="status-pill pill-wait">{vsBot ? <b>🤖 Với máy</b> : <span>Phòng: <b style={{letterSpacing:3}}>{code}</b></span>}</div>
            <button className="btn ghost" style={{width:"auto",padding:"6px 12px",fontSize:12}} onClick={leaveRoom}>{vsBot ? "Thoát" : "Rời phòng"}</button>
          </>)}
        </div>
      </div>

      {notice && <div className="notice-toast">{notice}</div>}

      {screen === "lobby" && <Lobby onCreate={createRoom} onJoin={joinRoom} onBot={startBot} error={error} />}

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
            {vsBot ? (
              <div className="room-code-box"><span>🤖 Chế độ</span><div className="code" style={{fontSize:20}}>CHƠI VỚI MÁY</div></div>
            ) : (
              <div className="room-code-box">
                <span>Mã phòng:</span><div className="code" style={{fontSize:24}}>{code}</div>
                <button className="btn steel copy-btn" onClick={copyCode}>{copied ? "✓" : "Chép"}</button>
              </div>
            )}
            <div className={"status-pill " + (vsBot ? "pill-ready" : (oppReady ? "pill-ready" : "pill-wait"))}>
              {vsBot ? "Máy đã sẵn sàng" : (oppPresent ? (oppReady ? "Đối thủ đã sẵn sàng" : "Đối thủ đang bố trí...") : "Chờ đối thủ vào...")}
            </div>
          </div>
          <Placement onConfirm={confirmPlacement} ready={iReady} waiting={iReady && !oppReady} />
        </div>
      )}

      {screen === "battle" && (
        <div>
          <Battle myTurn={myTurn} vsBot={vsBot} occ={occ} incoming={incoming} myShots={myShots} onFire={fire} log={log} sunkOpp={sunkOpp} sunkMine={sunkMine} sunkEnemyCells={sunkEnemyCells} sunkMyCells={sunkMyCells} myScore={myScore} oppScore={oppScore} oppLabel={vsBot ? "Máy" : "Đối thủ"} flashEnemy={flashEnemy} flashMine={flashMine} mode={vsBot ? "classic" : mode} inv={inv} powerups={powerups} revealedEnemy={revealedEnemy} aim={aim} onPower={activatePower} myMines={myMines} onPlaceMine={placeMine} />
        </div>
      )}

      {over && (
        <div className="overlay">
          <div className={"modal " + (over.win ? "win" : "lose")}>
            <h2>{over.win ? "CHIẾN THẮNG!" : "THẤT BẠI"}</h2>
            <p>{over.win ? "Bạn đã đánh chìm toàn bộ hạm đội địch." : "Toàn bộ hạm đội của bạn đã bị đánh chìm."}</p>
            <button className="btn primary" onClick={rematchAction}>Chơi lại</button>
          </div>
        </div>
      )}

      <div className="footer-note">Battleship Online · chia sẻ mã phòng để mời bạn bè</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
