---
phase: 05-public-matchmaking
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - db.js
  - public/app.jsx
  - public/style.css
  - server.js
  - test/queue.test.js
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 5 public-matchmaking changes: the `queues` map, `tryPair`/`findPair`/`createMatchedRoom` pairing engine, the `joinQueue`/`leaveQueue`/`matchFound`/`queueStatus`/`requeued` socket handlers, `rankedWindow`, `getPlayerRating`, the disconnect cleanup + D-11 re-queue path, and the client Quick Match / Ranked / queue-wait-screen / bot-offer UI.

The double-pairing race guard (synchronous `pairing=true` + `q.delete` before any await) is sound, untrusted `userId`/rating correctly come from the session and DB rather than the client arg, profiles are sanitized server-side, and queue cleanup runs first on disconnect. Tests cover the core pairing and cleanup contracts.

However there are two shipping blockers: a **phantom-player room** when a queued socket dies between enqueue and pairing (the pairing engine never re-validates `entry.socketId` liveness), and **missing i18n keys** for queue error codes that surface raw key strings to users. There are also correctness defects in the D-11 ranked re-queue (rating reset to 1500), a rate-limiter that lets one client lock out another via a forged `clientId`, and several queue-state desync paths.

## Critical Issues

### CR-01: Dead/stale socket can be paired into a phantom-player room

**File:** `server.js:1372-1407` (`createMatchedRoom`), `server.js:1316-1339` (`tryPair`)
**Issue:** `tryPair` selects entries purely by `!e.pairing` and never checks whether `entry.socketId` still maps to a live socket. `createMatchedRoom` then does:

```js
const sock = io.of("/").sockets.get(entry.socketId);
if (sock) { sock.join(code); sock.data.code = code; ... }
```

If the socket has already disconnected (e.g. the queued player closed the tab a moment before a second player joined, and the sweep/disconnect cleanup hasn't removed the entry yet — there is a window because `removeFromQueues` keys on `socket.data.clientId || socket.id` while the entry may have been keyed on a different client-supplied `clientId`), the player is still pushed into `rooms[code].order` and `players[clientId]`, but `sock.join` is skipped. The *surviving* opponent receives `matchFound` + `roomUpdate` for a room whose other seat is a phantom that will never place ships. The game stalls in placement; the opponent is consumed out of the queue into a dead room. Worse, the dead seat's `clientId` came from client-controlled `arg.clientId`, so disconnect cleanup keyed on the socket's own clientId may not match the queue entry key (see CR-02 / WR-02), widening the window.

**Fix:** Re-validate socket liveness inside `createMatchedRoom` before committing the room, and abort + re-queue the live partner if either socket is gone:
```js
async function createMatchedRoom(entryA, entryB, type) {
  const sockA = io.of("/").sockets.get(entryA.socketId);
  const sockB = io.of("/").sockets.get(entryB.socketId);
  if (!sockA || !sockB) {
    // Re-queue whichever side is still connected; drop the dead one.
    const survivor = sockA ? entryA : (sockB ? entryB : null);
    if (survivor) { survivor.pairing = false; queues[type].set(survivor.clientId, survivor); }
    return;
  }
  // ... proceed to build room
}
```
Also prune entries with dead `socketId` at the top of `tryPair`.

### CR-02: Queue error codes render as raw i18n keys to the user

**File:** `public/app.jsx:284-289` (`t`), `public/app.jsx:292` (`errText`), `server.js:1459/1467` (`RATE_LIMITED`, `RANKED_REQUIRES_ACCOUNT`)
**Issue:** `joinQueue` can reject with `code: "RATE_LIMITED"` and `code: "RANKED_REQUIRES_ACCOUNT"`, and `handleQuickMatch`/`handleRankedMatch` call `setError(errText(res))`. `errText` returns `t("err." + res.code)`, and `t` falls back to the raw key when missing:

```js
function t(k, p) {
  let s = (I18N[LANG] && I18N[LANG][k] != null) ? I18N[LANG][k] : I18N.en[k];
  if (s == null) return k;   // <- returns "err.RATE_LIMITED"
  ...
}
```

Only `err.ALREADY_IN_QUEUE` and `err.ALREADY_IN_ROOM` were added to the i18n table. A rate-limited Quick Match (trivially hit: 6 clicks in 60s) shows the literal text `err.RATE_LIMITED`. A guest who somehow reaches the ranked path sees `err.RANKED_REQUIRES_ACCOUNT`. This is user-facing broken UI on a normal, reachable path.

**Fix:** Add the missing keys to both `en` and `vi` tables, e.g.:
```js
"err.RATE_LIMITED": "Too many attempts — wait a moment",
"err.RANKED_REQUIRES_ACCOUNT": "Sign in to play ranked",
```
(Vietnamese equivalents likewise.) Verify every `code` returned by the queue handlers has a matching `err.*` key.

## Warnings

### WR-01: D-11 re-queue resets a ranked survivor's rating to 1500

**File:** `server.js:1880-1899` (disconnect re-queue)
**Issue:** When a queue-matched partner disconnects before the game starts, the survivor is re-enqueued with hardcoded `rating: 1500, rd: 350`:
```js
const survivorEntry = {
  ...
  rating: 1500, // default; exact rating not needed for re-queue
  rd: 350,
  ...
};
```
For a *ranked* re-queue (`qt === "ranked"`), this is wrong: a 2000-rated player is re-inserted as a 1500 entry, so `findPair`/`rankedWindow` will pair them against opponents up to ±150 of 1500 (i.e. 1350-1650), producing a wildly mismatched ranked game whose result still writes to Glicko ratings. The comment "exact rating not needed" is false for ranked. The original entry's `rating`/`rd` were available on the seat at match time but are not carried onto the room player record.

**Fix:** Persist the queued rating/rd onto the room player in `createMatchedRoom` (`rating: entry.rating, rd: entry.rd`) and reuse them when re-queuing, or re-read via `getPlayerRating(oppPlayer.userId)` before re-inserting:
```js
let rating = 1500, rd = 350;
if (qt === "ranked" && oppPlayer.userId != null) {
  try { ({ rating, rd } = await getPlayerRating(oppPlayer.userId)); } catch {}
}
```
(Note: the disconnect handler is synchronous; making it async here requires care, so carrying the values on the seat is the simpler fix.)

### WR-02: Rate limiter + queue keyed on client-supplied `clientId` enables victim lockout and entry displacement

**File:** `server.js:1452-1460` (`joinQueue`)
**Issue:** `clientId = (arg && arg.clientId) || socket.id` is fully client-controlled, and both the rate limiter key (`rlKey = clientId`) and the queue map key are derived from it. A malicious client can:
- Spam `joinQueue` with a *victim's* `clientId` to exhaust the victim's 5/min limiter, so the victim's own legitimate `joinQueue` returns `RATE_LIMITED` (denial of service against a specific player).
- Pass a `clientId` already present in `queues[type]`, overwriting (`queues[type].set(clientId, entry)`) another player's entry with the attacker's `socketId`, hijacking the pairing slot.

`socket.data.queueType`/`queueClientId` track per-socket state, but the queue map is keyed on the forgeable clientId, so the guards do not prevent cross-client interference.

**Fix:** Key the rate limiter on a non-forgeable identity (`socket.handshake.address` and/or `socket.id`), and key the queue on the server-trusted identity (`socket.data.userId` when present, else `socket.id`). Reject `joinQueue` if `arg.clientId` does not match the session's established clientId, or stop trusting `arg.clientId` for queue identity entirely.

### WR-03: Queue entry survives reconnect → orphaned/phantom entry and `ALREADY_IN_QUEUE` desync

**File:** `server.js:1862-1865` (disconnect cleanup), `server.js:1462-1464` (guards)
**Issue:** On disconnect, `removeFromQueues(socket.data.clientId || socket.id)` removes by the *socket's* clientId. But the queue entry may have been stored under a different client-supplied `arg.clientId` (WR-02), in which case the entry is **not** removed and becomes a phantom with a dead `socketId` (feeds CR-01). Conversely, the per-socket `ALREADY_IN_QUEUE` guard checks `socket.data.queueType`; a player who reconnects on a fresh socket (Safari backgrounding — an explicitly supported scenario per CLAUDE.md) has `queueType=null` and can enqueue a *second* entry while the first (now dead-socket) entry lingers. Neither `resume` nor `rejoin` calls `removeFromQueues` or restores `queueType`.

**Fix:** Always key queue entries on the server-trusted identity (see WR-02) so disconnect cleanup is consistent. Have `resume`/`rejoin` call `removeFromQueues` for the resolved clientId. Make the `ALREADY_IN_QUEUE` guard authoritative by checking the queue maps directly, not just `socket.data`.

### WR-04: `leaveQueue` and bot-offer leave the room-matched player able to re-enter a stale queue / no double-guard

**File:** `server.js:1531-1538` (`leaveQueue`), `public/app.jsx:2052-2071` (bot offer handler)
**Issue:** `leaveQueue` blindly deletes from both queues and nulls `socket.data.queueType` regardless of current state. If a `matchFound` has already fired (socket now in a room) but a stray client `leaveQueue` arrives (e.g. the unmount cleanup in the `screen==="queue"` effect races the `matchFound` transition), it will null queue state harmlessly — but it does not guard against being called while `socket.data.code` is set, and does not verify the caller actually owned the entry it deletes. Combined with WR-02's forgeable key, `leaveQueue` lets any socket delete the resolved clientId's entry. The client cleanup uses `queueTypeRef` to avoid firing on the matchFound batch, which is fragile (depends on React batching timing) rather than gating on `screen`/`code`.

**Fix:** In `leaveQueue`, early-return if `socket.data.code` is set (already in a room). Delete only the entry whose `socketId === socket.id` to prevent cross-client deletion. On the client, gate the leave on an explicit "still queued and not matched" check rather than ref-vs-batch timing.

### WR-05: `tryPair` re-insertion on `createMatchedRoom` failure can resurrect a stale entry

**File:** `server.js:1328-1338` (`tryPair` catch), `server.js:1372` (`createMatchedRoom` is `async`)
**Issue:** On `createMatchedRoom` rejection, `tryPair` re-inserts both entries: `q.set(a.clientId, a); q.set(b.clientId, b);`. But between the synchronous delete and the async rejection, the player may have disconnected (removeFromQueues already ran and found nothing, since the entry was deleted by tryPair) or called `leaveQueue`. The catch resurrects a dead entry with a stale `socketId` back into the queue — a phantom that will be matched on the next sweep (feeds CR-01). There is also no liveness check before re-insertion.

**Fix:** Before re-inserting in the catch, verify each socket is still live (`io.of("/").sockets.get(entry.socketId)`) and skip re-insertion otherwise. Reset `entry.enqueuedAt` is not needed, but liveness is.

### WR-06: `getPlayerRating` returns raw DB numeric types that may break `rankedWindow` arithmetic

**File:** `db.js:687-694` (`getPlayerRating`), `server.js:1303` (`rankedWindow`)
**Issue:** `getPlayerRating` returns `{ rating: rows[0].rating, rd: rows[0].rd }` straight from Postgres. Depending on the `ratings` column types (the migration defines `rd`/`rating` — likely `numeric`/`real`), the `pg` driver returns `numeric` columns as **strings**, not numbers. `rankedWindow` does `entry.rd >= 110` and `findPair` does `Math.abs(a.rating - b.rating)`. With string `rating`, `"1500" - "1560"` coerces fine, but `"50" >= 110` is a numeric comparison that works, while `Math.abs` on strings works by coercion — yet `Math.min(rankedWindow(a), rankedWindow(b))` and the `<=` comparison can misbehave if any value is a string vs the numeric window. This is fragile and type-unsafe at the API boundary between db.js and the pairing engine.

**Fix:** Coerce explicitly in `getPlayerRating`:
```js
return rows.length > 0
  ? { rating: Number(rows[0].rating), rd: Number(rows[0].rd) }
  : { rating: 1500, rd: 350 };
```

## Info

### IN-01: Test mutates module-level `queues.casual` binding via reassignment

**File:** `test/queue.test.js:276`
**Issue:** The "front re-queue" test does `queues.casual = new Map([...])`, reassigning the imported `queues.casual` property. This mirrors the production D-11 pattern (`queues[qt] = new Map(...)`) but means the test depends on `queues` being a mutable object whose `.casual` property can be replaced. If the production code ever froze `queues` or captured `queues.casual` by reference elsewhere (e.g. a closure holding the old Map), the reassignment pattern would silently diverge. The test asserts ordering but never asserts the new Map is the one production code reads.

**Fix:** Consider testing the actual re-queue code path (the disconnect handler) rather than re-implementing the Map-replacement inline, so the test guards the real behavior.

### IN-02: `emitQueueStatus` payload includes `queueSize` exposing aggregate ranked population

**File:** `server.js:1342-1357` (`emitQueueStatus`)
**Issue:** The comment says "No opponent identity or rating exposed," and indeed it sends `waitSec`, `windowWidth`, `queueSize`. `queueSize` leaks the live ranked queue depth to every client. This is low-risk but is an information disclosure not strictly required by the UI (the client's `queueStatus` handler only reads `windowWidth`; `queueSize` is destructured-but-unused in `app.jsx:1932`). Sending data the client ignores is needless surface.

**Fix:** Drop `queueSize` from the payload, or confirm it is intended for a future UI and document it.

### IN-03: Magic-number duplication of `rd >= 110` provisional threshold

**File:** `server.js:1302` (`rankedWindow`), `db.js:584` (`buildLeaderboard`)
**Issue:** The provisional/established boundary `rd >= 110` (server) and `r.rd < 110` (leaderboard) is a bare literal in two files with no shared constant. A future tuning change must be made in both places or the leaderboard-visible set and matchmaking-window logic will silently diverge.

**Fix:** Extract a named constant (e.g. `RD_ESTABLISHED_THRESHOLD = 110`) and reference it in both modules, acknowledging the flat no-barrel convention (duplicate the constant with a cross-reference comment if a shared util is undesired).

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
