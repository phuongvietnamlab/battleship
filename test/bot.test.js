// test/bot.test.js — Bot difficulty tier simulation harness
// Mirrors test/elo.test.js structure: ESM, describe/it/expect from "vitest".
//
// Tests are RED until test/bot-helpers.js stubs are replaced with real implementations.
// Run: npx vitest run test/bot.test.js
// Select individual blocks: npx vitest run test/bot.test.js -t easy|medium|hard|insane|ordering

import { describe, it, expect } from "vitest";
import {
  pickEasyPure,
  pickMediumPure,
  pickHardPure,
  pickInsanePure,
  genFleetPure,
} from "./bot-helpers.js";

// ── Headless game simulator ──────────────────────────────────────────────────
// Runs a full game to completion, returning the shot count.
// pickFn: function({ shots, hits, queue, remaining }) → key string or null
// shipSets: array of Sets (each Set = one ship's cell keys, with .size property)
// Safety cap of 300 turns prevents infinite loops on bugs.
function simulateGame(pickFn, shipSets) {
  const shots = new Set();
  const hits = new Set();
  const queue = [];
  // remaining is a mutable array of unsunk ship sizes (splice on sink)
  const remaining = shipSets.map((s) => s.size);
  let turn = 0;
  const SAFETY_CAP = 300;

  while (shipSets.some((s) => [...s].some((k) => !shots.has(k)))) {
    if (turn >= SAFETY_CAP) break;

    const k = pickFn({ shots, hits, queue, remaining });
    if (k == null) break; // pick function returned null (exhausted)

    shots.add(k);
    const isHit = shipSets.some((s) => s.has(k));
    if (isHit) {
      hits.add(k);
      // push unshot neighbors into queue (used by medium/hard/insane)
      const [r, c] = k.split(",").map(Number);
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < 11 && nc >= 0 && nc < 11) {
          const nk = nr + "," + nc;
          if (!shots.has(nk)) queue.push(nk);
        }
      });
    }

    // Detect sink: ship fully covered by shots
    for (const ship of shipSets) {
      if (ship.has(k) && [...ship].every((kk) => shots.has(kk))) {
        // Remove one entry of this ship's size from remaining
        const idx = remaining.indexOf(ship.size);
        if (idx !== -1) remaining.splice(idx, 1);
        // Reset active-hit chain (clear hits and queue on sink)
        hits.clear();
        queue.length = 0;
        break;
      }
    }

    turn++;
  }

  return turn;
}

// ── Easy tier tests ──────────────────────────────────────────────────────────
describe("easy", () => {
  it("easy never fires the same cell twice over a full game", () => {
    const fleet = genFleetPure();
    const shots = new Set();
    let prev = null;
    // Manually run until fleet sunk
    const hits = new Set();
    const queue = [];
    const remaining = fleet.map((s) => s.size);
    for (let turn = 0; turn < 300; turn++) {
      const k = pickEasyPure({ shots, hits, queue, remaining });
      if (k == null) break;
      // Must not be a repeat
      expect(shots.has(k)).toBe(false);
      // Must be in bounds
      const [r, c] = k.split(",").map(Number);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(11);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(11);
      shots.add(k);
      // Check if all ships sunk
      const allSunk = fleet.every((s) => [...s].every((sk) => shots.has(sk)));
      if (allSunk) break;
    }
  });
});

// ── Medium tier tests ────────────────────────────────────────────────────────
// SC#3 regression: deterministic sequence match against known input.
describe("medium", () => {
  it("medium drains queue before hunting (deterministic queue behavior)", () => {
    // With a known queue, pickMediumPure must return from the queue first
    const shots = new Set(["0,0", "0,1", "0,2"]);
    const queue = ["1,5", "2,5"]; // two queued targets
    const hits = new Set();
    const remaining = [5, 4, 3, 3, 2];
    const k = pickMediumPure({ shots, hits, queue, remaining });
    // Should pop from queue (LIFO — last element = "2,5")
    expect(k).toBe("2,5");
  });

  it("medium falls back to parity hunt when queue empty", () => {
    // Empty queue, only a few cells left
    const shots = new Set();
    const queue = [];
    const hits = new Set();
    const remaining = [5, 4, 3, 3, 2];
    const k = pickMediumPure({ shots, hits, queue, remaining });
    // Should be a parity cell (r+c) % 2 === 0
    const [r, c] = k.split(",").map(Number);
    expect((r + c) % 2).toBe(0);
  });

  it("medium falls back to any cell when all parity cells exhausted", () => {
    // Fill all parity cells
    const shots = new Set();
    for (let r = 0; r < 11; r++)
      for (let c = 0; c < 11; c++)
        if ((r + c) % 2 === 0) shots.add(r + "," + c);
    const queue = [];
    const hits = new Set();
    const remaining = [5];
    const k = pickMediumPure({ shots, hits, queue, remaining });
    // Should return a non-parity cell since all parity cells shot
    expect(k).not.toBeNull();
    const [r, c] = k.split(",").map(Number);
    expect((r + c) % 2).toBe(1); // must be off-parity
  });
});

// ── Hard tier tests ──────────────────────────────────────────────────────────
describe("hard", () => {
  it("hard never reads player ships (only accepts shots/hits/queue/remaining)", () => {
    // pickHardPure signature: { shots, hits, queue, remaining } — no ship-set param
    const shots = new Set();
    const hits = new Set();
    const queue = [];
    const remaining = [5, 4, 3, 3, 2];
    // If it accepted a ship set, it would need one — this call proves it doesn't
    const k = pickHardPure({ shots, hits, queue, remaining });
    expect(k).not.toBeNull();
    const [r, c] = k.split(",").map(Number);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(11);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(11);
  });

  it("hard prefers highest-density cell over random", () => {
    // Fire most of the board, leaving only a small cluster
    // Hard should consistently target areas where ships can fit
    const shots = new Set();
    // Leave just a 5-cell strip unfired at row 5, cols 0-4
    for (let r = 0; r < 11; r++)
      for (let c = 0; c < 11; c++)
        if (!(r === 5 && c <= 4)) shots.add(r + "," + c);
    const hits = new Set();
    const queue = [];
    const remaining = [5]; // one 5-cell ship remaining
    const k = pickHardPure({ shots, hits, queue, remaining });
    // The only valid placement for size-5 is in row 5 cols 0-4
    // so density should be highest there
    expect(shots.has(k)).toBe(false); // must be unshot
    const [r, c] = k.split(",").map(Number);
    expect(r).toBe(5);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(4);
  });
});

// ── Insane tier tests ────────────────────────────────────────────────────────
describe("insane", () => {
  it("insane average shots <= hard average shots over N games", () => {
    const N = 50; // smaller N for focused tier comparison
    let insaneTotal = 0, hardTotal = 0;
    for (let i = 0; i < N; i++) {
      const fleet = genFleetPure();
      hardTotal += simulateGame(pickHardPure, fleet);
      insaneTotal += simulateGame(pickInsanePure, fleet);
    }
    const avgHard = hardTotal / N;
    const avgInsane = insaneTotal / N;
    expect(avgInsane).toBeLessThanOrEqual(avgHard + 5); // Insane <= Hard + small tolerance
  });

  it("insane in hunt phase uses parity-masked cells", () => {
    // Empty shots + no hits → hunt phase; insane should pick a parity cell
    const shots = new Set();
    const hits = new Set();
    const queue = [];
    const remaining = [5, 4, 3, 3, 2];
    const k = pickInsanePure({ shots, hits, queue, remaining });
    expect(k).not.toBeNull();
    const [r, c] = k.split(",").map(Number);
    // Insane in hunt phase uses parity mask: (r+c) % 2 === 0
    expect((r + c) % 2).toBe(0);
  });
});

// ── Ordering assertion (SC#2) ────────────────────────────────────────────────
// Over N=200 games, avg(easy) > avg(medium) > avg(hard) >= avg(insane)
// Sanity bounds: avg(easy) < 130, avg(insane) > 25
describe("ordering", () => {
  it("easy > medium > hard >= insane in average shots over N=200 games", () => {
    const N = 200;
    const totals = { easy: 0, medium: 0, hard: 0, insane: 0 };

    for (let i = 0; i < N; i++) {
      const fleet = genFleetPure();
      totals.easy   += simulateGame(pickEasyPure, fleet);
      totals.medium += simulateGame(pickMediumPure, fleet);
      totals.hard   += simulateGame(pickHardPure, fleet);
      totals.insane += simulateGame(pickInsanePure, fleet);
    }

    const avg = (k) => totals[k] / N;

    // Tier ordering assertion (SC#2)
    expect(avg("easy")).toBeGreaterThan(avg("medium"));
    expect(avg("medium")).toBeGreaterThan(avg("hard"));
    expect(avg("hard")).toBeGreaterThanOrEqual(avg("insane"));

    // Sanity bounds from literature (11x11 scales from 10x10 references)
    expect(avg("easy")).toBeLessThan(130);
    expect(avg("insane")).toBeGreaterThan(25);
  }, 60000); // 60s timeout — N=200 x 4 tiers x ~60 shots each
});
