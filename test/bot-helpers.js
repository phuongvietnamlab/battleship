// test/bot-helpers.js — Pure-function wrappers for bot tier algorithms + genFleetPure
// ESM module. No React imports. No DOM. Duplicates constants from app.jsx (monolith is
// not importable in Node — per PATTERNS.md no-analog note).
//
// All pick functions accept a plain-object state bag:
//   { shots: Set, hits: Set, queue: Array, remaining: Array }
// The ".current" ref accessor is replaced by direct property access.

const BOARD = 11;
const FLEET_SIZES = [5, 4, 3, 3, 2]; // parallel to FLEET_DEF in app.jsx

// ── Game primitives (duplicated from app.jsx:460-469) ────────────────────────
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
// Stateless clone of genFleet() from app.jsx:2084-2099.
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
        // Note: set.size already equals the ship size (Set contains exactly `size` keys)
        ships.push(set);
        ok = true;
      }
    }
  }
  return ships;
}

// ── buildDensityMap ───────────────────────────────────────────────────────────
// Builds a per-cell density count by enumerating valid placements for remaining
// (unsunk) ship sizes. Miss cells (shots minus hits) reject placements.
// Accepts: { shots: Set, hits: Set, remaining: Array<number> }
// Returns: object mapping key → density count
// Per Pitfall 1: iterates `remaining` (unsunk sizes), NOT FLEET_SIZES.
// Per Pitfall 2: rejects any placement covering a confirmed-miss cell.
export function buildDensityMap({ shots, hits, remaining }) {
  // Compute miss set: cells that were shot but NOT hits
  const misses = new Set();
  for (const k of shots) {
    if (!hits.has(k)) misses.add(k);
  }

  // Initialize density for all cells
  const density = {};
  for (let r = 0; r < BOARD; r++)
    for (let c = 0; c < BOARD; c++)
      density[key(r, c)] = 0;

  // Enumerate valid placements for each remaining (unsunk) ship size
  for (const size of remaining) {
    for (const dir of ["h", "v"]) {
      for (let r = 0; r < BOARD; r++) {
        for (let c = 0; c < BOARD; c++) {
          const cells = cellsFor(r, c, size, dir);
          if (!inBounds(cells)) continue;

          // Reject if any cell in placement is a confirmed miss
          let valid = true;
          for (const cell of cells) {
            if (misses.has(key(cell.r, cell.c))) { valid = false; break; }
          }
          if (!valid) continue;

          // Valid placement: increment density for each covered cell
          for (const cell of cells) {
            density[key(cell.r, cell.c)]++;
          }
        }
      }
    }
  }
  return density;
}

// ── inferAxis ────────────────────────────────────────────────────────────────
// Infers ship axis from confirmed hit geometry.
// Returns "h" (horizontal), "v" (vertical), or null (< 2 hits or mixed).
// Reads only the passed `hits` set — never a ship set (D-03 honesty boundary).
function inferAxis(hits) {
  if (hits.size < 2) return null;
  const hitArr = [...hits].map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  });
  const rows = new Set(hitArr.map((h) => h.r));
  const cols = new Set(hitArr.map((h) => h.c));
  if (rows.size === 1) return "h"; // all hits share same row → horizontal ship
  if (cols.size === 1) return "v"; // all hits share same col → vertical ship
  return null; // mixed — no inference possible
}

// ── pickEasyPure ──────────────────────────────────────────────────────────────
// Pure random selection from unshot in-bounds cells.
// Accepts: { shots: Set }
// Returns: cell key string or null
export function pickEasyPure({ shots }) {
  const pool = [];
  for (let r = 0; r < BOARD; r++)
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (!shots.has(k)) pool.push(k);
    }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// ── pickMediumPure ────────────────────────────────────────────────────────────
// Parity + hunt-after-hit queue logic.
// Verbatim copy of legacy botPick body (app.jsx:2115-2128), de-ref'd.
// SC#3 anchor: must be bit-for-bit identical to legacy botPick under same RNG.
// Accepts: { shots: Set, queue: Array } (queue is mutated in-place — pop())
// Returns: cell key string or null
export function pickMediumPure({ shots, queue }) {
  // Drain queue first (LIFO via pop) — hunt-after-hit phase
  while (queue.length) {
    const k = queue.pop();
    if (!shots.has(k)) return k;
  }
  // Hunt phase: prefer parity cells (r+c) % 2 === 0, fallback to any
  const parity = [], any = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = key(r, c);
    if (shots.has(k)) continue;
    any.push(k); if ((r + c) % 2 === 0) parity.push(k);
  }
  const pool = parity.length ? parity : any;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// ── pickHardPure ──────────────────────────────────────────────────────────────
// Probability-density heatmap targeting.
// Drains queue choosing highest-density candidate; else fires globally highest-density
// unshot cell. Never inspects ship sets for targeting (D-03).
// Accepts: { shots: Set, hits: Set, queue: Array, remaining: Array<number> }
// Returns: cell key string or null
export function pickHardPure({ shots, hits, queue, remaining }) {
  // If queue has candidates, pick highest-density one from queue
  if (queue.length) {
    const density = buildDensityMap({ shots, hits, remaining });
    const queueCandidates = queue.filter((k) => !shots.has(k));
    queue.length = 0; // clear — will re-add remainder

    if (queueCandidates.length) {
      // Sort by density descending — highest density first
      queueCandidates.sort((a, b) => density[b] - density[a]);
      // Re-queue the rest for next turns
      for (let i = 1; i < queueCandidates.length; i++) {
        queue.push(queueCandidates[i]);
      }
      return queueCandidates[0];
    }
  }

  // Hunt phase: pick globally highest-density unshot cell
  const density = buildDensityMap({ shots, hits, remaining });
  let bestKey = null, bestScore = -1;
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (shots.has(k)) continue;
      if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
    }
  }
  return bestKey;
}

// ── pickInsanePure ────────────────────────────────────────────────────────────
// Parity-masked density + axis-lock after 2+ collinear hits.
// Per Pitfall 3: axis-lock includes fallback to full queue if axis filter exhausts.
// Per Pitfall 7: hunt phase includes unmasked fallback when parity pool exhausted.
// Accepts: { shots: Set, hits: Set, queue: Array, remaining: Array<number> }
// Returns: cell key string or null
export function pickInsanePure({ shots, hits, queue, remaining }) {
  const density = buildDensityMap({ shots, hits, remaining });

  // Target phase: active hit queue exists
  if (queue.length) {
    const validQueue = queue.filter((k) => !shots.has(k));
    const axis = inferAxis(hits);
    let candidates = validQueue;

    if (axis) {
      // Filter to only same-axis extensions
      const hitArr = [...hits].map((h) => {
        const [hr, hc] = h.split(",").map(Number);
        return { r: hr, c: hc };
      });
      const axisFiltered = validQueue.filter((k) => {
        const [r, c] = k.split(",").map(Number);
        return axis === "h"
          ? hitArr.some((h) => h.r === r)  // same row as any hit
          : hitArr.some((h) => h.c === c); // same col as any hit
      });
      // Per Pitfall 3: fallback to full queue if axis-filter removes everything
      if (axisFiltered.length) candidates = axisFiltered;
    }

    queue.length = 0; // clear — will re-add remainder

    if (candidates.length) {
      candidates.sort((a, b) => density[b] - density[a]);
      for (let i = 1; i < candidates.length; i++) {
        queue.push(candidates[i]);
      }
      return candidates[0];
    }
  }

  // Hunt phase: parity-masked density
  let bestKey = null, bestScore = -1;
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      if ((r + c) % 2 !== 0) continue; // parity mask
      const k = key(r, c);
      if (shots.has(k)) continue;
      if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
    }
  }

  // Per Pitfall 7: unmasked fallback when parity pool exhausted (late game)
  if (!bestKey) {
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        const k = key(r, c);
        if (shots.has(k)) continue;
        if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
      }
    }
  }

  return bestKey;
}
