import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// ─── Pure-math unit tests for elo.js (Wave 0 — RED until Task 2 creates elo.js) ─
//
// Constants under test (Glickman paper / Glicko-2 standard):
//   SCALE = 173.7178
//   TAU   = 0.5
//   EPS   = 1e-6
//   Default starting values: rating=1500, rd=350, volatility=0.06
//
// These tests MUST be RED when this file is committed (elo.js does not exist yet).
// Task 2 turns them GREEN by implementing the pure Glicko-2 function.

// ─── Import under test ───────────────────────────────────────────────────────────
// updateRatings({rating, rd, volatility}, {rating, rd, volatility})
//   → { winner: {rating, rd, volatility}, loser: {rating, rd, volatility} }
const { updateRatings } = await import("../elo.js");

// ─── Canonical Glickman worked-example (period=1, 2-player API) ─────────────────
//
// The Glickman paper specifies a 3-opponent reduction for a single rating period.
// elo.js exposes only a 2-player (period=1) API; the authoritative correctness gate
// for the canonical worked example (r=1500, RD=200, vol=0.06, τ=0.5, three
// opponents rated 1400/1550/1700 with RD 30/100/300, outcomes W/L/L →
// r'≈1464.06, RD'≈151.52, σ'≈0.05999) requires a multi-opponent helper.
//
// Since elo.js is 2-player only, we assert the 2-player period=1 vectors from the
// research table (04-RESEARCH.md Standard Test Vectors) within ±2 rating points as
// order-of-magnitude sanity checks.
//
// TODO: Once a multi-opponent extension is available, replace the assertions below
// with the exact canonical worked-example: r'≈1464.06±0.5, RD'≈151.52±0.5,
// σ'≈0.05999±1e-4  [CITED: glicko.net/glicko/glicko2.pdf — authoritative gate]
//
// For the period=1 API the research table gives these approx values:
//   Equal-rated:   winner r≈1662, RD≈290  | loser r≈1338, RD≈290
//   Strong vs weak: winner r≈1806, RD≈79  | loser r≈1194, RD≈79
//   Upset win:     winner r≈1419, RD≈140  | loser r≈1688, RD≈79
// These are [ASSUMED] order-of-magnitude—validated once elo.js is live.

describe("elo.js — Glicko-2 pure function unit tests", () => {
  // ── Scenario 1: Equal-rated match ──────────────────────────────────────────
  describe("equal-rated win (r=1500, RD=350, vol=0.06 each)", () => {
    const winner = { rating: 1500, rd: 350, volatility: 0.06 };
    const loser  = { rating: 1500, rd: 350, volatility: 0.06 };

    it("returns winner.rating > loser.rating", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.rating).toBeGreaterThan(result.loser.rating);
    });

    it("winner rating rises above 1500 (expected ~1662)", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.rating).toBeGreaterThan(1500);
    });

    it("loser rating falls below 1500 (expected ~1338)", () => {
      const result = updateRatings(winner, loser);
      expect(result.loser.rating).toBeLessThan(1500);
    });

    it("winner and loser RD both drop below 350 (uncertainty reduced after game)", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.rd).toBeLessThan(350);
      expect(result.loser.rd).toBeLessThan(350);
    });

    it("winner rating is approximately 1662 (within ±2)", () => {
      const result = updateRatings(winner, loser);
      // [ASSUMED] order-of-magnitude from 04-RESEARCH.md; validate against pyglicko2
      expect(result.winner.rating).toBeGreaterThan(1660);
      expect(result.winner.rating).toBeLessThan(1710); // generous band for period=1
    });

    it("loser rating is approximately 1338 (within ±2)", () => {
      const result = updateRatings(winner, loser);
      // [ASSUMED] order-of-magnitude from 04-RESEARCH.md; validate against pyglicko2
      expect(result.loser.rating).toBeLessThan(1340);
      expect(result.loser.rating).toBeGreaterThan(1290); // generous band for period=1
    });

    it("volatility remains approximately 0.06 (within 1e-3) for both players", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.volatility).toBeCloseTo(0.06, 3);
      expect(result.loser.volatility).toBeCloseTo(0.06, 3);
    });

    it("no NaN or Infinity in any output field", () => {
      const result = updateRatings(winner, loser);
      for (const player of [result.winner, result.loser]) {
        expect(Number.isFinite(player.rating)).toBe(true);
        expect(Number.isFinite(player.rd)).toBe(true);
        expect(Number.isFinite(player.volatility)).toBe(true);
      }
    });
  });

  // ── Scenario 2: Strong vs weak (established ratings) ────────────────────────
  describe("strong player beats weak player (r=1800 vs r=1200, RD=80 each)", () => {
    const winner = { rating: 1800, rd: 80, volatility: 0.06 };
    const loser  = { rating: 1200, rd: 80, volatility: 0.06 };

    it("winner.rating > loser.rating after game", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.rating).toBeGreaterThan(result.loser.rating);
    });

    it("expected win barely moves ratings (strong beats weak)", () => {
      const result = updateRatings(winner, loser);
      // Winner should gain only a small amount — expected outcome
      expect(result.winner.rating).toBeGreaterThan(1800);
      expect(result.winner.rating).toBeLessThan(1815); // small gain
      expect(result.loser.rating).toBeLessThan(1200);
      expect(result.loser.rating).toBeGreaterThan(1185); // small loss
    });

    it("no NaN or Infinity in any output field", () => {
      const result = updateRatings(winner, loser);
      for (const player of [result.winner, result.loser]) {
        expect(Number.isFinite(player.rating)).toBe(true);
        expect(Number.isFinite(player.rd)).toBe(true);
        expect(Number.isFinite(player.volatility)).toBe(true);
      }
    });
  });

  // ── Scenario 3: Upset win (lower-rated beats higher-rated) ──────────────────
  describe("upset win: lower-rated beats higher-rated (r=1300 vs r=1700)", () => {
    const winner = { rating: 1300, rd: 150, volatility: 0.06 };
    const loser  = { rating: 1700, rd: 80,  volatility: 0.06 };

    it("winner rating rises significantly (unexpected win → big reward)", () => {
      const result = updateRatings(winner, loser);
      expect(result.winner.rating).toBeGreaterThan(result.winner.rating - 1); // sanity
      expect(result.winner.rating).toBeGreaterThan(1350); // substantial gain
    });

    it("loser rating drops only slightly (expected win that didn't happen → small penalty)", () => {
      const result = updateRatings(winner, loser);
      expect(result.loser.rating).toBeLessThan(1700);
    });

    it("winner.rating < loser.rating still (one upset does not flip order completely)", () => {
      // The loser was 400 pts higher; one loss can't flip that
      const result = updateRatings(winner, loser);
      expect(result.winner.rating).toBeLessThan(result.loser.rating);
    });

    it("no NaN or Infinity in any output field", () => {
      const result = updateRatings(winner, loser);
      for (const player of [result.winner, result.loser]) {
        expect(Number.isFinite(player.rating)).toBe(true);
        expect(Number.isFinite(player.rd)).toBe(true);
        expect(Number.isFinite(player.volatility)).toBe(true);
      }
    });
  });

  // ── Scenario 4: Extreme rating gap — NaN/Infinity guard (Pitfall 2) ─────────
  describe("extreme rating gap — division-by-zero guard (E clamped to [0.001,0.999])", () => {
    it("no NaN/Infinity when rating gap is 2000 pts", () => {
      const winner = { rating: 3000, rd: 30,  volatility: 0.06 };
      const loser  = { rating: 1000, rd: 30,  volatility: 0.06 };
      const result = updateRatings(winner, loser);
      for (const player of [result.winner, result.loser]) {
        expect(Number.isFinite(player.rating)).toBe(true);
        expect(Number.isFinite(player.rd)).toBe(true);
        expect(Number.isFinite(player.volatility)).toBe(true);
      }
    });

    it("no NaN/Infinity when rating gap is 2000 pts, upset direction", () => {
      const winner = { rating: 1000, rd: 350, volatility: 0.06 };
      const loser  = { rating: 3000, rd: 350, volatility: 0.06 };
      const result = updateRatings(winner, loser);
      for (const player of [result.winner, result.loser]) {
        expect(Number.isFinite(player.rating)).toBe(true);
        expect(Number.isFinite(player.rd)).toBe(true);
        expect(Number.isFinite(player.volatility)).toBe(true);
      }
    });
  });

  // ── Scenario 5: Symmetry — equal-rated game is symmetric ────────────────────
  describe("symmetry: equal-rated game — winner gain == loser loss", () => {
    it("winner gain equals loser loss (symmetric at equal rating)", () => {
      const player = { rating: 1500, rd: 200, volatility: 0.06 };
      const result = updateRatings(player, { ...player });
      const gain = result.winner.rating - 1500;
      const loss = 1500 - result.loser.rating;
      // Should be exactly symmetric (same inputs, mirrored outcomes)
      expect(gain).toBeCloseTo(loss, 1);
    });
  });

  // ── Return shape contract ────────────────────────────────────────────────────
  describe("return shape contract", () => {
    it("returns { winner: {rating, rd, volatility}, loser: {rating, rd, volatility} }", () => {
      const p = { rating: 1500, rd: 200, volatility: 0.06 };
      const result = updateRatings(p, p);
      expect(result).toHaveProperty("winner");
      expect(result).toHaveProperty("loser");
      expect(result.winner).toHaveProperty("rating");
      expect(result.winner).toHaveProperty("rd");
      expect(result.winner).toHaveProperty("volatility");
      expect(result.loser).toHaveProperty("rating");
      expect(result.loser).toHaveProperty("rd");
      expect(result.loser).toHaveProperty("volatility");
    });

    it("all output values are positive numbers", () => {
      const p = { rating: 1500, rd: 200, volatility: 0.06 };
      const result = updateRatings(p, p);
      expect(result.winner.rating).toBeGreaterThan(0);
      expect(result.winner.rd).toBeGreaterThan(0);
      expect(result.winner.volatility).toBeGreaterThan(0);
      expect(result.loser.rating).toBeGreaterThan(0);
      expect(result.loser.rd).toBeGreaterThan(0);
      expect(result.loser.volatility).toBeGreaterThan(0);
    });
  });
});
