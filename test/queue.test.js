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
const { queues, tryPair, rooms } = TEST_EXPORTS;

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

  it.todo("two ranked entries within window → paired into ranked:true room");
  it.todo("two ranked entries outside initial window → not paired yet");
  it.todo("entries outside initial window → paired after window widens past their diff");
  it.todo("ranked requires account (RANKED_REQUIRES_ACCOUNT on joinQueue)");
});

// ─── QUEUE-03: Queue cleanup / disconnect handling ────────────────────────────

describe("QUEUE-03 — disconnect cleanup and re-queue (Plan 03)", () => {
  beforeEach(() => {
    queues.casual.clear();
    queues.ranked.clear();
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  it.todo("disconnect removes entry from casual queue");
  it.todo("disconnect removes entry from ranked queue");
  it.todo("partner re-enqueue on disconnect from paired-but-not-started room (D-11)");
});
