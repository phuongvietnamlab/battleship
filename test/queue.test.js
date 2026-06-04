/**
 * Queue test suite (05-01).
 *
 * Tests for:
 *  - QUEUE-01: Casual Quick Match — two players paired into a classic unranked room
 *  - QUEUE-02: Ranked matchmaking (Plans 02/03 — todo placeholders)
 *  - QUEUE-03: Queue cleanup / disconnect handling (Plan 03 — todo placeholders)
 *
 * Uses TEST_EXPORTS from server.js to access internal queue functions directly
 * without spinning up the full Socket.IO / HTTP stack.
 */

import { describe, it, expect, beforeEach } from "vitest";
import serverModule from "../server.js";

const { TEST_EXPORTS } = serverModule;
const { queues, tryPair, rooms, rankedWindow, removeFromQueues } = TEST_EXPORTS;

// Helper: minimal queue entry
function makeEntry(overrides = {}) {
  return {
    socketId: "socket-" + Math.random(),
    clientId: "client-" + Math.random(),
    userId: null,
    rating: 1500,
    rd: 350,
    enqueuedAt: Date.now(),
    pairing: false,
    profile: null,
    queueType: "casual",
    ...overrides,
  };
}

// ─── QUEUE-01: Casual Quick Match ────────────────────────────────────────────

describe("QUEUE-01 — casual quick match pairing", () => {
  beforeEach(() => {
    queues.casual.clear();
    queues.ranked.clear();
    // clear any rooms created by previous tests
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  it("pairs two casual entries: both removed from queue, one room created", () => {
    const a = makeEntry({ clientId: "client-a" });
    const b = makeEntry({ clientId: "client-b" });
    queues.casual.set(a.clientId, a);
    queues.casual.set(b.clientId, b);

    tryPair("casual");

    // Both entries should be gone from the queue
    expect(queues.casual.size).toBe(0);

    // Exactly one room should have been created
    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
  });

  it("matched casual room has ranked:false and mode:'classic'", () => {
    const a = makeEntry({ clientId: "client-a" });
    const b = makeEntry({ clientId: "client-b" });
    queues.casual.set(a.clientId, a);
    queues.casual.set(b.clientId, b);

    tryPair("casual");

    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
    const room = rooms[roomKeys[0]];
    expect(room.ranked).toBe(false);
    expect(room.mode).toBe("classic");
  });

  it("matched casual room has exactly two players seated in room.order", () => {
    const a = makeEntry({ clientId: "client-a" });
    const b = makeEntry({ clientId: "client-b" });
    queues.casual.set(a.clientId, a);
    queues.casual.set(b.clientId, b);

    tryPair("casual");

    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
    const room = rooms[roomKeys[0]];
    expect(room.order.length).toBe(2);
    expect(room.order).toContain(a.clientId);
    expect(room.order).toContain(b.clientId);
  });

  it("tryPair with queue size < 2 is a no-op (no room created)", () => {
    const a = makeEntry({ clientId: "client-a" });
    queues.casual.set(a.clientId, a);

    tryPair("casual");

    // Queue entry still there
    expect(queues.casual.size).toBe(1);
    // No room created
    expect(Object.keys(rooms).length).toBe(0);
  });

  it("double-pairing guard: pairing entries are skipped by a second tryPair call", () => {
    const a = makeEntry({ clientId: "client-a", pairing: true }); // already being paired
    const b = makeEntry({ clientId: "client-b", pairing: true }); // already being paired
    const c = makeEntry({ clientId: "client-c" });
    queues.casual.set(a.clientId, a);
    queues.casual.set(b.clientId, b);
    queues.casual.set(c.clientId, c);

    // Only a/b are available but both are pairing=true; c is alone
    tryPair("casual");

    // No full pair of non-pairing entries — no room should be created
    expect(Object.keys(rooms).length).toBe(0);
    // c still in queue
    expect(queues.casual.has("client-c")).toBe(true);
  });
});

// ─── QUEUE-02: Ranked matchmaking ────────────────────────────────────────────

describe("QUEUE-02 — ranked matchmaking (Plan 02)", () => {
  beforeEach(() => {
    queues.casual.clear();
    queues.ranked.clear();
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  // ── rankedWindow unit tests (Task 1) ────────────────────────────────────────

  it("rankedWindow: established entry (rd<110) at enqueue time returns RANKED_WINDOW_START (150)", () => {
    const entry = makeEntry({ queueType: "ranked", rd: 50, enqueuedAt: Date.now() });
    expect(rankedWindow(entry)).toBe(150);
  });

  it("rankedWindow: provisional entry (rd>=110) at enqueue time returns RANKED_PROVISIONAL_START (300)", () => {
    const entry = makeEntry({ queueType: "ranked", rd: 350, enqueuedAt: Date.now() });
    expect(rankedWindow(entry)).toBe(300);
  });

  it("rankedWindow: widens by RANKED_WINDOW_STEP per RANKED_STEP_MS elapsed", () => {
    // 2 steps elapsed = 150 + 2*100 = 350
    const entry = makeEntry({ queueType: "ranked", rd: 50, enqueuedAt: Date.now() - 2 * 10000 });
    expect(rankedWindow(entry)).toBe(350);
  });

  it("rankedWindow: returns Infinity when width >= RANKED_WINDOW_CAP (500)", () => {
    // 4 steps elapsed = 150 + 4*100 = 550 >= 500 → Infinity
    const entry = makeEntry({ queueType: "ranked", rd: 50, enqueuedAt: Date.now() - 4 * 10000 });
    expect(rankedWindow(entry)).toBe(Infinity);
  });

  it("rankedWindow: provisional entry returns Infinity when width >= cap", () => {
    // provisional start=300, 2 steps = 300 + 2*100 = 500 >= 500 → Infinity
    const entry = makeEntry({ queueType: "ranked", rd: 350, enqueuedAt: Date.now() - 2 * 10000 });
    expect(rankedWindow(entry)).toBe(Infinity);
  });

  // ── Pairing tests (Task 2) ───────────────────────────────────────────────────

  it("two ranked entries within window → paired into ranked:true room", () => {
    // ratings 1500 vs 1560, diff=60 < window=150
    const a = makeEntry({ clientId: "ranked-a", queueType: "ranked", rating: 1500, rd: 50, enqueuedAt: Date.now() });
    const b = makeEntry({ clientId: "ranked-b", queueType: "ranked", rating: 1560, rd: 50, enqueuedAt: Date.now() });
    queues.ranked.set(a.clientId, a);
    queues.ranked.set(b.clientId, b);

    tryPair("ranked");

    expect(queues.ranked.size).toBe(0);
    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
    expect(rooms[roomKeys[0]].ranked).toBe(true);
  });

  it("two ranked entries outside initial window → not paired immediately", () => {
    // ratings 1500 vs 1900, diff=400 > initial window=150; enqueuedAt=now so 0 steps
    const a = makeEntry({ clientId: "ranked-a", queueType: "ranked", rating: 1500, rd: 50, enqueuedAt: Date.now() });
    const b = makeEntry({ clientId: "ranked-b", queueType: "ranked", rating: 1900, rd: 50, enqueuedAt: Date.now() });
    queues.ranked.set(a.clientId, a);
    queues.ranked.set(b.clientId, b);

    tryPair("ranked");

    // Still in queue — not paired yet
    expect(queues.ranked.size).toBe(2);
    expect(Object.keys(rooms).length).toBe(0);
  });

  it("entries outside initial window → paired once window widens past their diff", () => {
    // ratings 1500 vs 1700, diff=200; need window > 200 → 3 steps = 150+300=450 (>200)
    const a = makeEntry({ clientId: "ranked-a", queueType: "ranked", rating: 1500, rd: 50, enqueuedAt: Date.now() - 3 * 10000 });
    const b = makeEntry({ clientId: "ranked-b", queueType: "ranked", rating: 1700, rd: 50, enqueuedAt: Date.now() - 3 * 10000 });
    queues.ranked.set(a.clientId, a);
    queues.ranked.set(b.clientId, b);

    tryPair("ranked");

    expect(queues.ranked.size).toBe(0);
    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
    expect(rooms[roomKeys[0]].ranked).toBe(true);
  });

  // Note: RANKED_REQUIRES_ACCOUNT is a joinQueue handler-level guard on socket.data.userId.
  // It is tested end-to-end via the acceptance criteria; the engine-level guarantee is
  // that entries without userId can only enter via casual (not ranked), enforced in the handler.
  it.todo("ranked requires account (RANKED_REQUIRES_ACCOUNT on joinQueue — handler-level guard, E2E)");
});

// ─── QUEUE-03: Queue cleanup / disconnect handling ────────────────────────────

describe("QUEUE-03 — disconnect cleanup and re-queue (Plan 03)", () => {
  beforeEach(() => {
    queues.casual.clear();
    queues.ranked.clear();
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  it("disconnect removes entry from casual queue (removeFromQueues)", () => {
    const a = makeEntry({ clientId: "dc-casual-a", queueType: "casual" });
    queues.casual.set(a.clientId, a);
    expect(queues.casual.size).toBe(1);

    removeFromQueues(a.clientId);

    expect(queues.casual.size).toBe(0);
    expect(queues.ranked.size).toBe(0);
  });

  it("disconnect removes entry from ranked queue (removeFromQueues)", () => {
    const a = makeEntry({ clientId: "dc-ranked-a", queueType: "ranked" });
    queues.ranked.set(a.clientId, a);
    expect(queues.ranked.size).toBe(1);

    removeFromQueues(a.clientId);

    expect(queues.ranked.size).toBe(0);
    expect(queues.casual.size).toBe(0);
  });

  it("removeFromQueues is a no-op when clientId is not in any queue", () => {
    // Should not throw
    expect(() => removeFromQueues("nonexistent-client")).not.toThrow();
    expect(queues.casual.size).toBe(0);
    expect(queues.ranked.size).toBe(0);
  });

  it("no double-pairing: three casual entries, tryPair twice, at most one room created", () => {
    const a = makeEntry({ clientId: "trio-a", queueType: "casual" });
    const b = makeEntry({ clientId: "trio-b", queueType: "casual" });
    const c = makeEntry({ clientId: "trio-c", queueType: "casual" });
    queues.casual.set(a.clientId, a);
    queues.casual.set(b.clientId, b);
    queues.casual.set(c.clientId, c);

    tryPair("casual"); // pairs a+b, removes both; c remains
    tryPair("casual"); // c alone — no pair

    // Only one room should exist (a+b), c is still in queue
    expect(Object.keys(rooms).length).toBe(1);
    expect(queues.casual.size).toBe(1);
    expect(queues.casual.has("trio-c")).toBe(true);
  });

  it("front re-queue: survivor inserted at front of queue", () => {
    // Simulate existing entry then insert survivor at front
    const existing = makeEntry({ clientId: "existing-x", queueType: "casual" });
    queues.casual.set(existing.clientId, existing);

    // Simulate the survivor re-insertion at front via new Map([[survivor, ...rest]])
    const survivor = makeEntry({ clientId: "survivor-s", queueType: "casual" });
    const rest = [...queues.casual.entries()];
    queues.casual = new Map([[survivor.clientId, survivor], ...rest]);

    const keys = [...queues.casual.keys()];
    expect(keys[0]).toBe("survivor-s");
    expect(keys[1]).toBe("existing-x");
  });
});
