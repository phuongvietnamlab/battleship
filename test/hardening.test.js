/**
 * Hardening test suite (01-03).
 *
 * Tests for:
 *  - Task 1: doShot() null/shape guard (SEC-02)
 *  - Task 2: Room cleanup sweep (SEC-03)
 *  - Task 3: Input validation + CSP (SEC-04)
 *
 * Uses TEST_EXPORTS from server.js to access internal functions directly
 * without spinning up the full Socket.IO / HTTP stack.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid room object for unit tests.
 * Does NOT register in the rooms map — tests manipulate it directly.
 */
function makeRoom(overrides = {}) {
  const p1 = "player1";
  const p2 = "player2";
  const occ = new Set(["0,0", "0,1", "0,2", "0,3", "0,4"]); // 5-cell ship
  return {
    code: "TEST",
    players: {
      [p1]: { sid: "s1", ready: true, occ, hits: new Set(), online: true, inv: { cross: 0, reveal: 0, scatter: 0, mine: 0 }, bonus: 0, ships: [[...occ]], timeouts: 0 },
      [p2]: { sid: "s2", ready: true, occ, hits: new Set(), online: true, inv: { cross: 0, reveal: 0, scatter: 0, mine: 0 }, bonus: 0, ships: [[...occ]], timeouts: 0 },
    },
    order: [p1, p2],
    started: true,
    turn: p1,
    scores: {},
    lastStarter: null,
    mode: "classic",
    powerups: {},
    mines: {},
    turnTimer: null,
    turnDeadline: null,
    resolving: false,
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

// ─── Task 1: doShot() null/shape guard (SEC-02) ──────────────────────────────

import { TEST_EXPORTS } from "../server.js";

const { doShot, rooms, sweepRooms, escapeHtml, sanitizeProfile, sanitizeChat, cspMiddleware, CSP_HEADER_VALUE } = TEST_EXPORTS;

describe("doShot — null/shape guard (SEC-02)", () => {
  it("returns BAD_STATE when opponent slot is null", () => {
    const room = makeRoom();
    room.players["player2"] = null;
    const result = doShot(room, "player1", [[1, 1]]);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when opponent slot is missing entirely", () => {
    const room = makeRoom();
    delete room.players["player2"];
    const result = doShot(room, "player1", [[1, 1]]);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when oppData.occ is absent (null)", () => {
    const room = makeRoom();
    room.players["player2"].occ = null;
    const result = doShot(room, "player1", [[1, 1]]);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when oppData.occ is undefined", () => {
    const room = makeRoom();
    delete room.players["player2"].occ;
    const result = doShot(room, "player1", [[1, 1]]);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when me (the firing player) is null", () => {
    const room = makeRoom();
    room.players["player1"] = null;
    const result = doShot(room, "player1", [[1, 1]]);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when me (the firing player) is missing", () => {
    const room = makeRoom();
    delete room.players["player1"];
    const result = doShot(room, "player1", [[1, 1]]);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when cells is not an array", () => {
    const room = makeRoom();
    const result = doShot(room, "player1", null);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("returns BAD_STATE when cells is an empty array", () => {
    const room = makeRoom();
    const result = doShot(room, "player1", []);
    expect(result).toEqual({ ok: false, code: "BAD_STATE" });
  });

  it("does not throw when opponent slot is null", () => {
    const room = makeRoom();
    room.players["player2"] = null;
    expect(() => doShot(room, "player1", [[1, 1]])).not.toThrow();
  });

  it("does not throw when cells is undefined", () => {
    const room = makeRoom();
    expect(() => doShot(room, "player1", undefined)).not.toThrow();
  });

  it("happy path: valid room still resolves a normal shot", () => {
    const room = makeRoom();
    // Register the room so doShot emits work (emitToClient uses rooms map)
    rooms["TEST"] = room;
    try {
      const result = doShot(room, "player1", [[9, 9]]); // miss
      expect(result).toBeDefined();
      expect(result.ok).toBe(true);
    } finally {
      delete rooms["TEST"];
    }
  });
});

// ─── Task 2: Room cleanup sweep (SEC-03) ────────────────────────────────────

describe("sweepRooms — hybrid cleanup (SEC-03)", () => {
  const ROOM_IDLE_THRESHOLD_MS = 300000; // 5 min — matches server.js constant

  beforeEach(() => {
    // Clear rooms before each test
    for (const k in rooms) delete rooms[k];
  });

  afterEach(() => {
    for (const k in rooms) delete rooms[k];
  });

  it("removes a room with empty order array immediately", () => {
    rooms["DEAD1"] = makeRoom({ order: [], code: "DEAD1" });
    sweepRooms();
    expect(rooms["DEAD1"]).toBeUndefined();
  });

  it("removes a room whose lastActivityAt is older than the idle threshold", () => {
    rooms["IDLE1"] = makeRoom({
      code: "IDLE1",
      lastActivityAt: Date.now() - ROOM_IDLE_THRESHOLD_MS - 1000,
    });
    sweepRooms();
    expect(rooms["IDLE1"]).toBeUndefined();
  });

  it("retains a freshly-stamped active room", () => {
    rooms["ACTIVE1"] = makeRoom({
      code: "ACTIVE1",
      lastActivityAt: Date.now(), // just now
    });
    sweepRooms();
    expect(rooms["ACTIVE1"]).toBeDefined();
  });

  it("retains a room stamped just under the threshold", () => {
    rooms["RECENT1"] = makeRoom({
      code: "RECENT1",
      lastActivityAt: Date.now() - ROOM_IDLE_THRESHOLD_MS + 5000,
    });
    sweepRooms();
    expect(rooms["RECENT1"]).toBeDefined();
  });

  it("evicts multiple dead rooms and returns the map to active-only baseline", () => {
    rooms["A1"] = makeRoom({ code: "A1", lastActivityAt: Date.now() }); // keep
    rooms["B1"] = makeRoom({ code: "B1", order: [], lastActivityAt: Date.now() }); // evict (empty)
    rooms["C1"] = makeRoom({ code: "C1", lastActivityAt: Date.now() - ROOM_IDLE_THRESHOLD_MS - 1 }); // evict (idle)
    sweepRooms();
    expect(rooms["A1"]).toBeDefined();
    expect(rooms["B1"]).toBeUndefined();
    expect(rooms["C1"]).toBeUndefined();
    expect(Object.keys(rooms).length).toBe(1);
  });

  it("calls clearTurnTimer (no leaked timers) — idle room with active timer is cleaned", () => {
    let timerCleared = false;
    const fakeTimer = setTimeout(() => {}, 999999);
    // We can't mock clearTurnTimer directly, but we can verify the timer handle
    // is no longer running after sweep by checking rooms is deleted
    rooms["TIMER1"] = makeRoom({
      code: "TIMER1",
      lastActivityAt: Date.now() - ROOM_IDLE_THRESHOLD_MS - 1000,
      turnTimer: fakeTimer,
    });
    expect(() => sweepRooms()).not.toThrow();
    clearTimeout(fakeTimer); // cleanup in case sweep didn't clear it
    expect(rooms["TIMER1"]).toBeUndefined();
  });
});

// ─── Task 3: Input validation hardening + CSP (SEC-04) ──────────────────────

describe("escapeHtml", () => {
  it("escapes < and > to &lt; and &gt;", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("escapes & to &amp;", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("sanitizeProfile — extended (SEC-04)", () => {
  it("HTML-escapes < in name (stored-XSS guard)", () => {
    const result = sanitizeProfile({ name: "<script>alert(1)</script>" });
    expect(result.name).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.name).not.toContain("<");
  });

  it("strips control characters (\\x00–\\x1f) from name", () => {
    const result = sanitizeProfile({ name: "bad\x00name\x1f" });
    expect(result.name).not.toMatch(/[\x00-\x1f]/);
    expect(result.name).toContain("badname");
  });

  it("strips \\x7f from name", () => {
    const result = sanitizeProfile({ name: "del\x7fchar" });
    expect(result.name).not.toContain("\x7f");
  });

  it("caps name at 40 characters", () => {
    const result = sanitizeProfile({ name: "a".repeat(80) });
    expect(result.name.length).toBeLessThanOrEqual(40);
  });

  it("collapses internal whitespace in name", () => {
    const result = sanitizeProfile({ name: "too   many   spaces" });
    expect(result.name).toBe("too many spaces");
  });

  it("returns null for non-object input", () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile("string")).toBeNull();
  });

  it("still validates photo URL (must start with https?://)", () => {
    const valid = sanitizeProfile({ name: "Alice", photo: "https://example.com/img.png" });
    expect(valid.photo).toBe("https://example.com/img.png");
    const invalid = sanitizeProfile({ name: "Alice", photo: "javascript:alert(1)" });
    expect(invalid.photo).toBeNull();
  });
});

describe("sanitizeChat (SEC-04)", () => {
  it("returns null for non-string input", () => {
    expect(sanitizeChat(null)).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
    expect(sanitizeChat(undefined)).toBeNull();
    expect(sanitizeChat({})).toBeNull();
  });

  it("returns null for empty string after trimming", () => {
    expect(sanitizeChat("")).toBeNull();
    expect(sanitizeChat("   ")).toBeNull();
  });

  it("strips control characters from chat text", () => {
    const result = sanitizeChat("hello\x00world\x1f");
    expect(result).not.toMatch(/[\x00-\x1f]/);
    expect(result).toContain("helloworld");
  });

  it("strips \\x7f from chat text", () => {
    const result = sanitizeChat("del\x7fchar");
    expect(result).not.toContain("\x7f");
  });

  it("collapses internal whitespace", () => {
    const result = sanitizeChat("too   many   spaces");
    expect(result).toBe("too many spaces");
  });

  it("trims leading and trailing whitespace", () => {
    const result = sanitizeChat("  hello  ");
    expect(result).toBe("hello");
  });

  it("caps at 200 characters", () => {
    const result = sanitizeChat("a".repeat(300));
    expect(result).not.toBeNull();
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("returns cleaned text for valid input", () => {
    const result = sanitizeChat("Hello, world!");
    expect(result).toBe("Hello, world!");
  });
});

// ─── Content-Security-Policy middleware (SEC-04, T-03-E1) ────────────────────

describe("cspMiddleware — Content-Security-Policy header (SEC-04)", () => {
  function mockRes() {
    const headers = {};
    return {
      setHeader(name, value) { headers[name] = value; },
      getHeaders() { return headers; },
    };
  }

  it("sets the Content-Security-Policy response header", () => {
    const req = {};
    const res = mockRes();
    let nextCalled = false;
    cspMiddleware(req, res, () => { nextCalled = true; });
    expect(res.getHeaders()["Content-Security-Policy"]).toBeDefined();
    expect(nextCalled).toBe(true);
  });

  it("CSP script-src is 'self' only — no unsafe-inline or unsafe-eval in script-src directive", () => {
    const csp = CSP_HEADER_VALUE;
    expect(csp).toContain("script-src 'self'");
    // Extract the script-src directive and ensure it does not contain unsafe keywords
    const scriptSrcMatch = csp.match(/script-src([^;]*)/);
    expect(scriptSrcMatch).not.toBeNull();
    const scriptSrc = scriptSrcMatch[1];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("CSP includes connect-src with wss: for Socket.IO", () => {
    expect(CSP_HEADER_VALUE).toContain("connect-src");
    expect(CSP_HEADER_VALUE).toContain("wss:");
  });

  it("CSP includes frame-ancestors 'none' to block clickjacking", () => {
    expect(CSP_HEADER_VALUE).toContain("frame-ancestors 'none'");
  });
});
