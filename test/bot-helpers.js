// test/bot-helpers.js — Pure-function wrapper for bot random algorithm + genFleetPure
// ESM module. No React imports. No DOM. Duplicates constants from app.jsx (monolith is
// not importable in Node — per PATTERNS.md no-analog note).
//
// The bot uses pure random targeting (no strategy) for maximum fairness.

const BOARD = 11;
const FLEET_SIZES = [5, 4, 3, 3, 2]; // parallel to FLEET_DEF in app.jsx

// ── Game primitives (duplicated from app.jsx) ────────────────────────────────
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

// ── genFleetPure ─────────────────────────────────────────────────────────────
// Stateless clone of genFleet() from app.jsx.
// Returns array of Sets of cell-key strings; each Set tagged with a .size property.
export function genFleetPure() {
  const occ = new Set(), ships = [];
  for (const size of FLEET_SIZES) {
    let ok = false, t = 0;
    while (!ok && t++ < 800) {
      const d = Math.random() < 0.5 ? "h" : "v";
      const r = Math.floor(Math.random() * BOARD);
      const c = Math.floor(Math.random() * BOARD);
      const cells = cellsFor(r, c, size, d);
      if (inBounds(cells) && cells.every((x) => !occ.has(key(x.r, x.c)))) {
        const set = new Set();
        cells.forEach((x) => { const k = key(x.r, x.c); occ.add(k); set.add(k); });
        ships.push(set);
        ok = true;
      }
    }
  }
  return ships;
}

// ── pickRandomPure ───────────────────────────────────────────────────────────
// Pure random selection from unshot in-bounds cells.
// Accepts: { shots: Set }
// Returns: cell key string or null
export function pickRandomPure({ shots }) {
  const pool = [];
  for (let r = 0; r < BOARD; r++)
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (!shots.has(k)) pool.push(k);
    }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
