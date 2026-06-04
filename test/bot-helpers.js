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
  throw new Error("not implemented");
}

// ── buildDensityMap ───────────────────────────────────────────────────────────
// Builds a per-cell density count by enumerating valid placements for remaining
// (unsunk) ship sizes. Miss cells (shots minus hits) reject placements.
// Accepts: { shots: Set, hits: Set, remaining: Array<number> }
// Returns: object mapping key → density count
export function buildDensityMap({ shots, hits, remaining }) {
  throw new Error("not implemented");
}

// ── pickEasyPure ──────────────────────────────────────────────────────────────
// Pure random selection from unshot in-bounds cells.
// Accepts: { shots: Set }
// Returns: cell key string or null
export function pickEasyPure({ shots }) {
  throw new Error("not implemented");
}

// ── pickMediumPure ────────────────────────────────────────────────────────────
// Parity + hunt-after-hit queue logic. Verbatim copy of legacy botPick body.
// Accepts: { shots: Set, queue: Array }
// Returns: cell key string or null
export function pickMediumPure({ shots, queue }) {
  throw new Error("not implemented");
}

// ── pickHardPure ──────────────────────────────────────────────────────────────
// Probability-density heatmap targeting. Drains queue choosing highest-density
// candidate; else fires globally highest-density unshot cell.
// Accepts: { shots: Set, hits: Set, queue: Array, remaining: Array<number> }
// Returns: cell key string or null
export function pickHardPure({ shots, hits, queue, remaining }) {
  throw new Error("not implemented");
}

// ── pickInsanePure ────────────────────────────────────────────────────────────
// Parity-masked density + axis-lock after 2+ collinear hits.
// Accepts: { shots: Set, hits: Set, queue: Array, remaining: Array<number> }
// Returns: cell key string or null
export function pickInsanePure({ shots, hits, queue, remaining }) {
  throw new Error("not implemented");
}
