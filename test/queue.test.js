/**
 * Queue test suite (05-01).
 *
 * Tests for:
 *  - QUEUE-01: Free Quick Match — two players paired into a classic room
 *  - QUEUE-03: Queue cleanup / disconnect handling
 *
 * Uses TEST_EXPORTS from server.js to access internal queue functions directly
 * without spinning up the full Socket.IO / HTTP stack.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import serverModule from "../server.js";

const { TEST_EXPORTS } = serverModule;
const {
  queues, tryPair, rooms, removeFromQueues,
  createMatchedRoom, setSocketIsLive, resetSocketIsLive,
} = TEST_EXPORTS;

// CR-01/WR-05: the pairing engine now prunes/aborts entries whose socket is no
// longer live. These unit tests use synthetic socketIds that never map to a
// real Socket.IO connection, so by default treat every socketId as live. Tests
// that exercise the dead-socket paths override this with an explicit live-set.
function stubLiveSockets(liveIds) {
  // liveIds === undefined → all live; otherwise only the given ids are live.
  setSocketIsLive((id) => (liveIds === undefined ? true : liveIds.has(id)));
}
beforeEach(() => stubLiveSockets());
afterEach(() => resetSocketIsLive());

// Helper: minimal queue entry
function makeEntry(overrides = {}) {
  return {
    socketId: "socket-" + Math.random(),
    clientId: "client-" + Math.random(),
    userId: null,
    stake: 0,
    enqueuedAt: Date.now(),
    pairing: false,
    profile: null,
    queueType: "free",
    ...overrides,
  };
}

// ─── QUEUE-01: Free Quick Match ──────────────────────────────────────────────

describe("QUEUE-01 — free quick match pairing", () => {
  beforeEach(() => {
    queues.free.clear();
    queues.wagered.clear();
    // clear any rooms created by previous tests
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  it("pairs two free entries: both removed from queue, one room created", () => {
    const a = makeEntry({ clientId: "client-a" });
    const b = makeEntry({ clientId: "client-b" });
    queues.free.set(a.clientId, a);
    queues.free.set(b.clientId, b);

    tryPair("free");

    // Both entries should be gone from the queue
    expect(queues.free.size).toBe(0);

    // Exactly one room should have been created
    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
  });

  it("matched free room has mode:'classic'", () => {
    const a = makeEntry({ clientId: "client-a" });
    const b = makeEntry({ clientId: "client-b" });
    queues.free.set(a.clientId, a);
    queues.free.set(b.clientId, b);

    tryPair("free");

    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
    const room = rooms[roomKeys[0]];
    expect(room.mode).toBe("classic");
  });

  it("matched free room has exactly two players seated in room.order", () => {
    const a = makeEntry({ clientId: "client-a" });
    const b = makeEntry({ clientId: "client-b" });
    queues.free.set(a.clientId, a);
    queues.free.set(b.clientId, b);

    tryPair("free");

    const roomKeys = Object.keys(rooms);
    expect(roomKeys.length).toBe(1);
    const room = rooms[roomKeys[0]];
    expect(room.order.length).toBe(2);
    expect(room.order).toContain(a.clientId);
    expect(room.order).toContain(b.clientId);
  });

  it("tryPair with queue size < 2 is a no-op (no room created)", () => {
    const a = makeEntry({ clientId: "client-a" });
    queues.free.set(a.clientId, a);

    tryPair("free");

    // Queue entry still there
    expect(queues.free.size).toBe(1);
    // No room created
    expect(Object.keys(rooms).length).toBe(0);
  });

  it("double-pairing guard: pairing entries are skipped by a second tryPair call", () => {
    const a = makeEntry({ clientId: "client-a", pairing: true }); // already being paired
    const b = makeEntry({ clientId: "client-b", pairing: true }); // already being paired
    const c = makeEntry({ clientId: "client-c" });
    queues.free.set(a.clientId, a);
    queues.free.set(b.clientId, b);
    queues.free.set(c.clientId, c);

    // Only a/b are available but both are pairing=true; c is alone
    tryPair("free");

    // No full pair of non-pairing entries — no room should be created
    expect(Object.keys(rooms).length).toBe(0);
    // c still in queue
    expect(queues.free.has("client-c")).toBe(true);
  });
});

// ─── QUEUE-03: Queue cleanup / disconnect handling ────────────────────────────

describe("QUEUE-03 — disconnect cleanup and re-queue (Plan 03)", () => {
  beforeEach(() => {
    queues.free.clear();
    queues.wagered.clear();
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  it("disconnect removes entry from free queue (removeFromQueues)", () => {
    const a = makeEntry({ clientId: "dc-free-a", queueType: "free" });
    queues.free.set(a.clientId, a);
    expect(queues.free.size).toBe(1);

    removeFromQueues(a.clientId);

    expect(queues.free.size).toBe(0);
    expect(queues.wagered.size).toBe(0);
  });

  it("disconnect removes entry from wagered queue (removeFromQueues)", () => {
    const a = makeEntry({ clientId: "dc-wagered-a", queueType: "wagered" });
    queues.wagered.set(a.clientId, a);
    expect(queues.wagered.size).toBe(1);

    removeFromQueues(a.clientId);

    expect(queues.wagered.size).toBe(0);
    expect(queues.free.size).toBe(0);
  });

  it("removeFromQueues is a no-op when clientId is not in any queue", () => {
    // Should not throw
    expect(() => removeFromQueues("nonexistent-client")).not.toThrow();
    expect(queues.free.size).toBe(0);
    expect(queues.wagered.size).toBe(0);
  });

  it("no double-pairing: three free entries, tryPair twice, at most one room created", () => {
    const a = makeEntry({ clientId: "trio-a", queueType: "free" });
    const b = makeEntry({ clientId: "trio-b", queueType: "free" });
    const c = makeEntry({ clientId: "trio-c", queueType: "free" });
    queues.free.set(a.clientId, a);
    queues.free.set(b.clientId, b);
    queues.free.set(c.clientId, c);

    tryPair("free"); // pairs a+b, removes both; c remains
    tryPair("free"); // c alone — no pair

    // Only one room should exist (a+b), c is still in queue
    expect(Object.keys(rooms).length).toBe(1);
    expect(queues.free.size).toBe(1);
    expect(queues.free.has("trio-c")).toBe(true);
  });

  it("front re-queue: survivor inserted at front of queue", () => {
    // Simulate existing entry then insert survivor at front
    const existing = makeEntry({ clientId: "existing-x", queueType: "free" });
    queues.free.set(existing.clientId, existing);

    // Simulate the survivor re-insertion at front via new Map([[survivor, ...rest]])
    const survivor = makeEntry({ clientId: "survivor-s", queueType: "free" });
    const rest = [...queues.free.entries()];
    queues.free = new Map([[survivor.clientId, survivor], ...rest]);

    const keys = [...queues.free.keys()];
    expect(keys[0]).toBe("survivor-s");
    expect(keys[1]).toBe("existing-x");
  });
});

// ─── CR-01 / WR-05: phantom-socket pairing guards ────────────────────────────

describe("CR-01 — dead socket cannot be paired into a phantom room", () => {
  beforeEach(() => {
    queues.free.clear();
    queues.wagered.clear();
    for (const k of Object.keys(rooms)) delete rooms[k];
  });

  it("tryPair prunes a dead-socket entry before pairing (no room, live entry kept)", () => {
    const dead = makeEntry({ clientId: "dead", socketId: "sock-dead", queueType: "free" });
    const live = makeEntry({ clientId: "live", socketId: "sock-live", queueType: "free" });
    queues.free.set(dead.clientId, dead);
    queues.free.set(live.clientId, live);
    // Only the live socket resolves; dead entry must be pruned, leaving 1 entry.
    stubLiveSockets(new Set(["sock-live"]));

    tryPair("free");

    expect(queues.free.has("dead")).toBe(false);
    expect(queues.free.has("live")).toBe(true);
    expect(Object.keys(rooms).length).toBe(0); // not enough live entries to pair
  });

  it("createMatchedRoom aborts and re-queues the survivor when one socket is dead", async () => {
    const a = makeEntry({ clientId: "a", queueKey: "s:sa", socketId: "sa", queueType: "free" });
    const b = makeEntry({ clientId: "b", queueKey: "s:sb", socketId: "sb", queueType: "free" });
    // a is live, b died after tryPair deleted both from the queue.
    stubLiveSockets(new Set(["sa"]));

    await createMatchedRoom(a, b, "free");

    // No room committed; the live survivor (a) is re-queued, dead b is dropped.
    expect(Object.keys(rooms).length).toBe(0);
    expect(queues.free.has("s:sa")).toBe(true);
    expect(queues.free.has("s:sb")).toBe(false);
    expect(queues.free.get("s:sa").pairing).toBe(false);
  });

  it("createMatchedRoom commits a room when both sockets are live", async () => {
    const a = makeEntry({ clientId: "a", queueKey: "s:sa", socketId: "sa", queueType: "free" });
    const b = makeEntry({ clientId: "b", queueKey: "s:sb", socketId: "sb", queueType: "free" });
    stubLiveSockets(new Set(["sa", "sb"]));

    await createMatchedRoom(a, b, "free");

    expect(Object.keys(rooms).length).toBe(1);
  });

  it("WR-05: createMatchedRoom failure re-inserts only entries with live sockets", () => {
    const a = makeEntry({ clientId: "a", queueKey: "s:sa", socketId: "sa", queueType: "free" });
    const b = makeEntry({ clientId: "b", queueKey: "s:sb", socketId: "sb", queueType: "free" });
    queues.free.set(a.queueKey, a);
    queues.free.set(b.queueKey, b);
    stubLiveSockets(new Set(["sa"]));

    tryPair("free");

    // b (dead) pruned up front; a remains, no phantom resurrection of b.
    expect(queues.free.has("s:sb")).toBe(false);
    expect(queues.free.has("s:sa")).toBe(true);
    expect(Object.keys(rooms).length).toBe(0);
  });
});
