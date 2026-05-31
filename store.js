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

module.exports = { init, isEnabled, saveSnapshot, loadSnapshot };
