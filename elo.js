// elo.js — Pure Glicko-2 single-game rating update (RANK-01, D-07)
// Source: Glickman (2013) "Example of the Glicko-2 system", glicko.net/glicko/glicko2.pdf
// [CITED: glicko.net/glicko/glicko2.pdf]
//
// No DB, no I/O, no side effects. Safe to unit-test in isolation.
// Exports: { updateRatings }

"use strict";

const SCALE = 173.7178; // converts r↔μ, RD↔φ  [CITED: glicko.net Step 2]
const TAU   = 0.5;      // volatility change constraint (Glickman default) [CITED: glicko.net]
const EPS   = 1e-6;     // Illinois convergence epsilon [CITED: glicko.net Step 5]

/**
 * g(φ): dampening factor — reduces impact of opponents with high RD
 * Formula: 1 / √(1 + 3φ²/π²)  [CITED: glicko.net Step 3]
 */
function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/**
 * E(μ, μj, φj): expected score (logistic) [CITED: glicko.net Step 3]
 * Clamped to [0.001, 0.999] to prevent division-by-zero in variance (Pitfall 2).
 */
function E(mu, muj, phij) {
  const raw = 1 / (1 + Math.exp(-g(phij) * (mu - muj)));
  return Math.max(0.001, Math.min(0.999, raw));
}

/**
 * newVolatility — Illinois bisection algorithm for σ' [CITED: glicko.net Step 5]
 *
 * Follows Glickman Step 5 exactly:
 *   f(x) = exp(x)(Δ²−φ²−v−exp(x)) / (2(φ²+v+exp(x))²) − (x − ln(σ²))/τ²
 * Illinois bracket selection:
 *   - if f(B)*f(A) < 0: A = B, fA = fB  (signs opposite — B is the new lower bound)
 *   - else: fA = fA / 2                  (Illinois halving when signs agree)
 *   - then: B = C, fB = f(C)
 *
 * Cross-checked against github.com/ryankirkman/pyglicko2 for correctness.
 * Must produce σ'≈0.05999 for the Glickman worked example.
 */
function newVolatility(phi, sigma, delta, v) {
  const a     = Math.log(sigma * sigma);  // ln(σ²)
  const tau2  = TAU * TAU;
  const phi2  = phi * phi;
  const delta2 = delta * delta;

  // f(x): Glickman Step 5 objective function
  function f(x) {
    const ex      = Math.exp(x);
    const denom   = phi2 + v + ex;
    const num     = ex * (delta2 - phi2 - v - ex);
    return num / (2 * denom * denom) - (x - a) / tau2;
  }

  // Initialize interval [A, B] such that f(A) > 0 and f(B) < 0
  // (or the inverse bracket depending on the condition)
  let A  = a;
  let fA = f(A);

  let B;
  let fB;
  if (delta2 > phi2 + v) {
    // Δ² is large enough that the upper bound can be set directly
    B  = Math.log(delta2 - phi2 - v);
  } else {
    // Walk B left while f(B) < 0; stop at first B where f(B) >= 0.
    // This mirrors pyglicko2 Step 5.2: find the tightest B such that f(B) >= 0
    // (which brackets the root since f(A) <= 0 in this branch).
    // [CITED: github.com/ryankirkman/pyglicko2/blob/master/glicko2.py Step 5.2]
    B  = a - TAU;
    while (f(B) < 0) {
      B -= TAU;
    }
  }
  fB = f(B);

  // Illinois bisection: iterate until |B − A| < EPS
  while (Math.abs(B - A) > EPS) {
    // Illinois secant step
    const C  = A + (A - B) * fA / (fB - fA);
    const fC = f(C);

    if (fC * fB < 0) {
      // Signs of f(C) and f(B) differ → A moves to B
      A  = B;
      fA = fB;
    } else {
      // Signs agree → Illinois halving (prevents slow convergence)
      fA = fA / 2;
    }
    // B always moves to C
    B  = C;
    fB = fC;
  }

  // σ' = exp(A/2)  [CITED: glicko.net Step 5]
  return Math.exp(A / 2);
}

/**
 * updateRatings — compute new Glicko-2 ratings for one game (period = 1)
 *
 * @param {object} winner  { rating, rd, volatility }  — Glicko display scale
 * @param {object} loser   { rating, rd, volatility }
 * @returns {{ winner: {rating, rd, volatility}, loser: {rating, rd, volatility} }}
 *
 * All inputs/outputs on Glicko display scale (r ∈ ~[1000,3000], RD ∈ [30,350]).
 * Pure: no require('./db'), no require('./store'), no fs/network/Date side effects.
 */
function updateRatings(winner, loser) {
  // Step 2: Scale to Glicko-2 internal scale [CITED: glicko.net Step 2]
  const mu_w  = (winner.rating - 1500) / SCALE;
  const phi_w = winner.rd / SCALE;
  const mu_l  = (loser.rating  - 1500) / SCALE;
  const phi_l = loser.rd / SCALE;

  // Step 3: g() and E() for each player (period=1, one opponent each)
  const gL  = g(phi_l);  // dampening by loser's RD (for winner's update)
  const gW  = g(phi_w);  // dampening by winner's RD (for loser's update)
  const E_w = E(mu_w, mu_l, phi_l); // winner's expected score vs loser
  const E_l = E(mu_l, mu_w, phi_w); // loser's expected score vs winner

  // Step 3: estimated variance v (one opponent) [CITED: glicko.net Step 3]
  const v_w = 1 / (gL * gL * E_w * (1 - E_w));
  const v_l = 1 / (gW * gW * E_l * (1 - E_l));

  // Step 4: estimated improvement Δ [CITED: glicko.net Step 4]
  // s=1 for winner (won), s=0 for loser (lost)
  const delta_w = v_w * gL * (1 - E_w);  // s=1 → (s − E) = (1 − E_w)
  const delta_l = v_l * gW * (0 - E_l);  // s=0 → (s − E) = (0 − E_l) = −E_l

  // Step 5: new volatility σ' via Illinois bisection [CITED: glicko.net Step 5]
  const sigma_w2 = newVolatility(phi_w, winner.volatility, delta_w, v_w);
  const sigma_l2 = newVolatility(phi_l, loser.volatility,  delta_l, v_l);

  // Step 6: pre-period RD (inflate by volatility) [CITED: glicko.net Step 6]
  const phi_w_star = Math.sqrt(phi_w * phi_w + sigma_w2 * sigma_w2);
  const phi_l_star = Math.sqrt(phi_l * phi_l + sigma_l2 * sigma_l2);

  // Step 7: new RD [CITED: glicko.net Step 7]
  const phi_w2 = 1 / Math.sqrt(1 / (phi_w_star * phi_w_star) + 1 / v_w);
  const phi_l2 = 1 / Math.sqrt(1 / (phi_l_star * phi_l_star) + 1 / v_l);

  // Step 7: new rating [CITED: glicko.net Step 7]
  const mu_w2 = mu_w + phi_w2 * phi_w2 * gL * (1 - E_w);
  const mu_l2 = mu_l + phi_l2 * phi_l2 * gW * (0 - E_l);

  // Step 8: scale back to Glicko display scale [CITED: glicko.net Step 8]
  return {
    winner: {
      rating:     mu_w2 * SCALE + 1500,
      rd:         phi_w2 * SCALE,
      volatility: sigma_w2,
    },
    loser: {
      rating:     mu_l2 * SCALE + 1500,
      rd:         phi_l2 * SCALE,
      volatility: sigma_l2,
    },
  };
}

module.exports = { updateRatings };
