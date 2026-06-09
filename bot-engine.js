// bot-engine.js — Server-side bot game logic for Phase 18 (Bot Quick Match)
// Pure functions for ship placement and targeting. No React, no DOM.
// Mirrors logic from test/bot-helpers.js and app.jsx bot algorithms.

'use strict';

const BOARD = 11;
const FLEET_SIZES = [5, 4, 3, 3, 2];

function key(r, c) { return r + ',' + c; }

function cellsFor(r, c, size, dir) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(dir === 'h' ? { r, c: c + i } : { r: r + i, c });
  }
  return cells;
}

function inBounds(cells) {
  return cells.every(x => x.r >= 0 && x.r < BOARD && x.c >= 0 && x.c < BOARD);
}

/**
 * Generate a valid random fleet placement.
 * Returns { occ: Set<key>, ships: Array<Set<key>> }
 * Each ship in ships is a Set of "r,c" key strings.
 */
function generateBotFleet() {
  const occ = new Set();
  const ships = [];
  for (const size of FLEET_SIZES) {
    let ok = false, t = 0;
    while (!ok && t++ < 800) {
      const d = Math.random() < 0.5 ? 'h' : 'v';
      const r = Math.floor(Math.random() * BOARD);
      const c = Math.floor(Math.random() * BOARD);
      const cells = cellsFor(r, c, size, d);
      if (inBounds(cells) && cells.every(x => !occ.has(key(x.r, x.c)))) {
        const set = new Set();
        cells.forEach(x => { const k = key(x.r, x.c); occ.add(k); set.add(k); });
        ships.push(set);
        ok = true;
      }
    }
  }
  return { occ, ships };
}

/**
 * Pick a random unshot cell (pure random targeting — easiest/fairest).
 * @param {Set<string>} shots - Set of already-fired cell keys
 * @returns {string|null} Cell key "r,c" or null if board exhausted
 */
function pickRandomTarget(shots) {
  const pool = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (!shots.has(k)) pool.push(k);
    }
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/**
 * Get a random delay for bot firing (2000-5000ms) to simulate human-like play.
 * @returns {number} Delay in milliseconds
 */
function getBotFireDelay() {
  return 2000 + Math.floor(Math.random() * 3000);
}

/**
 * Check if all ships in a fleet are sunk given a set of shots.
 * @param {Array<Set<string>>} ships - Array of ship cell sets
 * @param {Set<string>} shots - Set of shots fired at this fleet
 * @returns {boolean}
 */
function allShipsSunk(ships, shots) {
  return ships.every(ship => [...ship].every(k => shots.has(k)));
}

/**
 * Find which ship (if any) was just sunk by the latest shot.
 * @param {Array<Set<string>>} ships - Array of ship cell sets
 * @param {Set<string>} shots - All shots (including the latest)
 * @param {string} latestShot - The cell key just fired
 * @returns {Set<string>|null} The sunk ship set, or null
 */
function findSunkShip(ships, shots, latestShot) {
  for (const ship of ships) {
    if (!ship.has(latestShot)) continue;
    if ([...ship].every(k => shots.has(k))) return ship;
  }
  return null;
}

module.exports = {
  generateBotFleet,
  pickRandomTarget,
  getBotFireDelay,
  allShipsSunk,
  findSunkShip,
  BOARD,
  FLEET_SIZES,
  key,
};
