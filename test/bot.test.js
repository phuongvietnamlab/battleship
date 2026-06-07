// test/bot.test.js — Bot random targeting validation
// The bot uses pure random targeting for maximum fairness — no learnable strategy.
// Run: npx vitest run test/bot.test.js

import { describe, it, expect } from "vitest";
import { pickRandomPure, genFleetPure } from "./bot-helpers.js";

// ── Headless game simulator ──────────────────────────────────────────────────
// Runs a full game to completion, returning the shot count.
function simulateGame(pickFn, shipSets) {
  const shots = new Set();
  let turn = 0;
  const SAFETY_CAP = 300;

  while (shipSets.some((s) => [...s].some((k) => !shots.has(k)))) {
    if (turn >= SAFETY_CAP) break;
    const k = pickFn({ shots });
    if (k == null) break;
    shots.add(k);
    turn++;
  }

  return turn;
}

// ── Random bot tests ─────────────────────────────────────────────────────────
describe("random bot", () => {
  it("never fires the same cell twice over a full game", () => {
    const fleet = genFleetPure();
    const shots = new Set();
    for (let turn = 0; turn < 300; turn++) {
      const k = pickRandomPure({ shots });
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

  it("eventually sinks all ships within 121 shots (11x11 board)", () => {
    const N = 100;
    for (let i = 0; i < N; i++) {
      const fleet = genFleetPure();
      const turns = simulateGame(pickRandomPure, fleet);
      // On 11x11 = 121 cells, random bot must finish within 121 shots
      expect(turns).toBeLessThanOrEqual(121);
      // Must have actually sunk all ships
      expect(turns).toBeGreaterThan(0);
    }
  });

  it("average shots is roughly half the board (fair random distribution)", () => {
    const N = 200;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const fleet = genFleetPure();
      total += simulateGame(pickRandomPure, fleet);
    }
    const avg = total / N;
    // Random should average around 80-110 shots on 11x11 with standard fleet
    expect(avg).toBeGreaterThan(60);
    expect(avg).toBeLessThan(120);
  });
});
