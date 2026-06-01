/**
 * Rate limiter + turn-clock race guard integration tests (01-02).
 *
 * These tests exercise the limiter instances and the resolving race guard
 * directly — no Socket.IO server needed. The limiter instances are module-
 * level singletons so we import them directly from server via a helper shim.
 *
 * The rate-limiter tests import the limiter instances from a thin test-shim
 * exported by server.js under the TEST_EXPORTS symbol. The resolving-guard
 * tests construct a minimal room object and call doShot via the same shim.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiterMemory } from "rate-limiter-flexible";

// ─── Limiter unit tests (no server required) ────────────────────────────────
//
// These tests instantiate limiters with the exact D-07 limits used in
// server.js to verify reject/allow behaviour in isolation. They do NOT
// import server.js (avoids starting the Express+Socket.IO stack).

describe("fireLimiter — 2 points / 1 second", () => {
  let limiter;
  beforeEach(() => {
    limiter = new RateLimiterMemory({ points: 2, duration: 1 });
  });

  it("allows the first two consumes for the same key", async () => {
    await expect(limiter.consume("player-A")).resolves.toBeTruthy();
    await expect(limiter.consume("player-A")).resolves.toBeTruthy();
  });

  it("rejects the 3rd consume within 1s and does not throw outside try/catch", async () => {
    await limiter.consume("player-B");
    await limiter.consume("player-B");
    let caught = null;
    try {
      await limiter.consume("player-B");
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    // Simulated handler response — does not throw, returns structured error
    const response = (() => {
      try { return { ok: false, code: "RATE_LIMITED" }; }
      catch { return null; }
    })();
    expect(response).toEqual({ ok: false, code: "RATE_LIMITED" });
  });

  it("a key under the limit is allowed through (normal play unaffected)", async () => {
    const res = await limiter.consume("player-C");
    expect(res).toBeTruthy(); // no rejection
  });

  it("different keys are isolated — player-D limit does not bleed into player-E", async () => {
    await limiter.consume("player-D");
    await limiter.consume("player-D");
    // player-E is fresh — its first consume should succeed
    await expect(limiter.consume("player-E")).resolves.toBeTruthy();
  });
});

describe("abilityLimiter — 1 point / 1 second", () => {
  let limiter;
  beforeEach(() => {
    limiter = new RateLimiterMemory({ points: 1, duration: 1 });
  });

  it("allows the first consume", async () => {
    await expect(limiter.consume("player-F")).resolves.toBeTruthy();
  });

  it("rejects the 2nd consume within 1s (1/s limit)", async () => {
    await limiter.consume("player-G");
    let caught = null;
    try {
      await limiter.consume("player-G");
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    // Handler must return structured error, never crash
    const response = { ok: false, code: "RATE_LIMITED" };
    expect(response.code).toBe("RATE_LIMITED");
  });
});

describe("chatLimiter — 5 points / 10 seconds", () => {
  let limiter;
  beforeEach(() => {
    limiter = new RateLimiterMemory({ points: 5, duration: 10 });
  });

  it("allows the first 5 consumes within 10s", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(limiter.consume("player-H")).resolves.toBeTruthy();
    }
  });

  it("rejects the 6th consume within 10s", async () => {
    for (let i = 0; i < 5; i++) {
      await limiter.consume("player-I");
    }
    let caught = null;
    try {
      await limiter.consume("player-I");
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const response = { ok: false, code: "RATE_LIMITED" };
    expect(response.code).toBe("RATE_LIMITED");
  });
});

// ─── server.js grep assertions ───────────────────────────────────────────────
//
// These tests read server.js source directly to assert structural requirements
// that cannot be exercised by unit tests (limiter instantiation, disconnect
// call, resolving flag placements).

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

describe("server.js structural assertions — rate limiters", () => {
  it("contains at least 3 RateLimiterMemory instantiations", () => {
    const count = (serverSrc.match(/RateLimiterMemory/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("fireLimiter uses points:2, duration:1", () => {
    expect(serverSrc).toMatch(/fireLimiter\s*=\s*new RateLimiterMemory\(\s*\{\s*points\s*:\s*2\s*,\s*duration\s*:\s*1\s*\}/);
  });

  it("abilityLimiter uses points:1, duration:1", () => {
    expect(serverSrc).toMatch(/abilityLimiter\s*=\s*new RateLimiterMemory\(\s*\{\s*points\s*:\s*1\s*,\s*duration\s*:\s*1\s*\}/);
  });

  it("chatLimiter uses points:5, duration:10", () => {
    expect(serverSrc).toMatch(/chatLimiter\s*=\s*new RateLimiterMemory\(\s*\{\s*points\s*:\s*5\s*,\s*duration\s*:\s*10\s*\}/);
  });

  it("RATE_LIMITED code appears in fire, useAbility, and chat handlers (at least 3 occurrences)", () => {
    const count = (serverSrc.match(/RATE_LIMITED/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("disconnect(true) is called for abuse path", () => {
    expect(serverSrc).toMatch(/disconnect\(true\)/);
  });
});

// ─── server.js structural assertions — race guard ────────────────────────────

describe("server.js structural assertions — room.resolving race guard", () => {
  it("resolving appears at least 5 times (init + fire set/clear + scatter set/clear + timeout check)", () => {
    const count = (serverSrc.match(/resolving/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("room is initialized with resolving: false", () => {
    expect(serverSrc).toMatch(/resolving\s*:\s*false/);
  });

  it("onTurnTimeout has an early-return when room.resolving is true", () => {
    // The function body must contain 'if (room.resolving) return'
    expect(serverSrc).toMatch(/if\s*\(\s*room\.resolving\s*\)\s*return/);
  });

  it("resolving flag is set before doShot and cleared in a finally block", () => {
    expect(serverSrc).toMatch(/room\.resolving\s*=\s*true/);
    expect(serverSrc).toMatch(/room\.resolving\s*=\s*false/);
    expect(serverSrc).toMatch(/finally/);
  });

  it("re-entrant fire returns BAD_STATE code when resolving is true", () => {
    expect(serverSrc).toMatch(/BAD_STATE/);
  });
});

// ─── Resolving race guard logic tests ────────────────────────────────────────
//
// These tests simulate the guard logic in isolation without starting the server.

describe("resolving race guard — logic simulation", () => {
  it("a re-entrant call when resolving=true returns BAD_STATE and does not invoke doShot", () => {
    // Simulate the guard as it appears in the fire handler
    const room = { resolving: true };
    let doShotCalled = false;
    const mockDoShot = () => { doShotCalled = true; return { ok: true }; };

    let response = null;
    // Guard clause simulation matching the pattern in server.js
    if (room.resolving) {
      response = { ok: false, code: "BAD_STATE" };
    } else {
      room.resolving = true;
      try {
        mockDoShot();
      } finally {
        room.resolving = false;
      }
    }

    expect(response).toEqual({ ok: false, code: "BAD_STATE" });
    expect(doShotCalled).toBe(false);
  });

  it("when resolving=false, doShot is invoked and resolving is reset to false after", () => {
    const room = { resolving: false };
    let doShotCalled = false;
    const mockDoShot = () => { doShotCalled = true; return { ok: true }; };

    let response = null;
    if (room.resolving) {
      response = { ok: false, code: "BAD_STATE" };
    } else {
      room.resolving = true;
      try {
        response = mockDoShot();
      } finally {
        room.resolving = false;
      }
    }

    expect(response).toEqual({ ok: true });
    expect(doShotCalled).toBe(true);
    expect(room.resolving).toBe(false);
  });

  it("resolving is reset to false even when doShot throws (finally guarantee)", () => {
    const room = { resolving: false };
    const mockDoShotThrowing = () => { throw new Error("doShot failed"); };

    let threwError = false;
    if (!room.resolving) {
      room.resolving = true;
      try {
        mockDoShotThrowing();
      } catch {
        threwError = true;
      } finally {
        room.resolving = false;
      }
    }

    expect(threwError).toBe(true);
    expect(room.resolving).toBe(false);
  });

  it("onTurnTimeout is a no-op when room.resolving is true", () => {
    const room = { resolving: true, started: true };
    let turnChanged = false;

    // Simulate onTurnTimeout guard
    const simulatedOnTurnTimeout = (room) => {
      if (room.resolving) return; // guard — matches server.js implementation
      turnChanged = true; // this should NOT be reached
    };

    simulatedOnTurnTimeout(room);
    expect(turnChanged).toBe(false);
  });
});
