// store.js — optional Redis snapshot of the in-memory room map.
//
// When REDIS_URL is UNSET this module is a complete no-op: isEnabled() stays
// false, save/load do nothing, and the `redis` package is never required. The
// game then runs purely in RAM (current Render behavior — unchanged).
//
// When REDIS_URL is set, server.js periodically serializes `rooms` to a single
// Redis key and reloads it on boot, so an app restart / redeploy can restore
// in-progress games. This is a SNAPSHOT, not a per-move write — no extra latency
// on the game hot path.

const REDIS_URL = process.env.REDIS_URL || "";
const KEY = "battleship:rooms";
const LEADERBOARD_KEY = "battleship:leaderboard";
const LEADERBOARD_TTL = 300; // 5-minute TTL (RANK-04)

let client = null;
let ready = false;

async function init() {
  if (!REDIS_URL) {
    console.log("[store] REDIS_URL not set — RAM-only mode");
    return false;
  }
  try {
    // Lazy require so the dependency is only loaded when actually configured.
    const { createClient } = require("redis");
    client = createClient({ url: REDIS_URL });
    client.on("error", (e) => console.error("[store] redis error:", e.message));
    await client.connect();
    ready = true;
    console.log("[store] redis connected — snapshot persistence ON");
  } catch (e) {
    console.error("[store] redis unavailable, falling back to RAM-only:", e.message);
    client = null;
    ready = false;
  }
  return ready;
}

function isEnabled() {
  return ready;
}

// Best-effort: a failed snapshot must never crash or block the game loop.
async function saveSnapshot(obj) {
  if (!ready) return;
  try {
    await client.set(KEY, JSON.stringify(obj));
  } catch (e) {
    console.error("[store] saveSnapshot failed:", e.message);
  }
}

async function loadSnapshot() {
  if (!ready) return null;
  try {
    const s = await client.get(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.error("[store] loadSnapshot failed:", e.message);
    return null;
  }
}

// ─── Leaderboard cache helpers (RANK-04, D-09) ───────────────────────────────
// Best-effort: cache read/write errors must never crash or block the endpoint.
// client is never exposed outside store.js (Pitfall 6).

async function setLeaderboardCache(json) {
  if (!ready) return; // guard: no-op when Redis unavailable
  try {
    await client.set(LEADERBOARD_KEY, json, { EX: LEADERBOARD_TTL });
  } catch (e) {
    console.error("[store] setLeaderboardCache failed:", e.message);
    // swallow — never rethrow; cache miss is non-fatal
  }
}

async function getLeaderboardCache() {
  if (!ready) return null; // guard: return null sentinel when Redis unavailable
  try {
    return await client.get(LEADERBOARD_KEY); // raw string or null
  } catch (e) {
    console.error("[store] getLeaderboardCache failed:", e.message);
    return null; // null sentinel on error — caller falls back to Postgres
  }
}

module.exports = { init, isEnabled, saveSnapshot, loadSnapshot, getLeaderboardCache, setLeaderboardCache };
