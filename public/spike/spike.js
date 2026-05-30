// T0 spike client — answers two go/no-go questions for the Instant Games port:
//   1. Does a live wss:// Socket.IO connection work from inside the Instant Games container?
//   2. Is FBInstant.player.getID() STABLE across a reload? (reconnect-grace keys on it)
//
// Build: `npm run build:spike` (esbuild bundles this + socket.io-client → dist-spike/app.js,
// injecting SERVER_URL via define). Outside FB it falls back to a persisted mock id so the
// socket path can still be smoke-tested locally.
import { io } from "socket.io-client";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

const $ = (id) => document.getElementById(id);
function log(msg) {
  const el = $("log");
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent;
}
function setStatus(txt, ok) {
  const el = $("status");
  el.textContent = txt;
  el.className = ok ? "ok" : "bad";
}

async function getIdentity() {
  if (typeof FBInstant !== "undefined") {
    await FBInstant.initializeAsync();
    FBInstant.setLoadingProgress(100);
    await FBInstant.startGameAsync();
    return {
      source: "FBInstant",
      playerId: FBInstant.player.getID(),
      contextId: FBInstant.context.getID(),
      contextType: FBInstant.context.getType(),
    };
  }
  // Local fallback (not inside FB) — persist a mock id so the reload-stability test still works.
  let mock = localStorage.getItem("spikeMockId");
  if (!mock) {
    mock = "mock-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("spikeMockId", mock);
  }
  return { source: "mock(local)", playerId: mock, contextId: null, contextType: null };
}

// Compares this run's player id against the previous run stored in localStorage.
// CHANGED ✗ would mean reconnect-grace cannot trust the id — a critical-gap finding.
function checkStability(playerId) {
  const prev = localStorage.getItem("spikeLastPlayerId");
  localStorage.setItem("spikeLastPlayerId", playerId);
  if (prev === null) return "first run — reload the game to test stability";
  return prev === playerId ? "STABLE ✓ (same id after reload)" : `CHANGED ✗ (was ${prev})`;
}

async function main() {
  setStatus("booting…", false);
  let ident;
  try {
    ident = await getIdentity();
  } catch (e) {
    setStatus("FBInstant init FAILED: " + e.message, false);
    log("init error: " + e.message);
    return;
  }

  $("pid").textContent = ident.playerId;
  $("ctx").textContent = (ident.contextId || "—") + " (" + (ident.contextType || "n/a") + ")";
  $("src").textContent = ident.source;
  $("stab").textContent = checkStability(ident.playerId);
  log("identity via " + ident.source);

  setStatus("connecting " + SERVER_URL + " …", false);
  const socket = io(SERVER_URL, { transports: ["websocket"], reconnection: true });

  socket.on("connect", () => {
    setStatus("socket CONNECTED (" + socket.io.engine.transport.name + ")", true);
    const t0 = performance.now();
    socket.emit("spikePing", { playerId: ident.playerId, contextId: ident.contextId }, (res) => {
      const rtt = Math.round(performance.now() - t0);
      $("rtt").textContent = rtt + " ms";
      log("pong rtt=" + rtt + "ms server=" + JSON.stringify(res));
    });
  });
  socket.on("connect_error", (e) => {
    setStatus("connect_error: " + e.message, false);
    log("connect_error: " + e.message);
  });
  socket.on("disconnect", (r) => {
    setStatus("DISCONNECTED: " + r, false);
    log("disconnect: " + r);
  });
}

main();
