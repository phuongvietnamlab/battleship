# T0 Spike — Instant Games WSS + identity check

Go/no-go before building the full Facebook Instant Games port (Approach A).
Answers two questions:

1. Does a live `wss://` Socket.IO connection work from inside the Instant Games container?
2. Is `FBInstant.player.getID()` **stable across a reload**? (reconnect-grace depends on it)

If both pass, the rest of the port (T1–T8 in the design doc) is just packaging.
If WSS fails or getID changes on reload → revisit Approach B (async turn-based).

## Files
- `public/spike/` — spike source (index.html, spike.js, fbapp-config.json)
- `build-spike.mjs` — esbuild bundler → `dist-spike/`
- `server.js` — added CORS allowlist + a temporary `spikePing` handler
- `Dockerfile`, `fly.toml`, `.dockerignore` — Fly deploy

## 1. Update deps (adds esbuild + socket.io-client)
```bash
npm install
```

## 2. Local smoke test (no Facebook)
```bash
SERVER_URL=http://localhost:4000 npm run build:spike   # PowerShell: $env:SERVER_URL="http://localhost:4000"; npm run build:spike
npm start
```
Open http://localhost:4000/spike/ — status should go green "socket CONNECTED", RTT shows a number.
Reload once: "getID stability" uses a mock id locally and should read STABLE.

## 3. Deploy server to Fly
```bash
fly launch --no-deploy      # confirm app name + region (sin); keep generated app name
fly deploy
fly status                  # note the URL, e.g. https://<app>.fly.dev
```

## 4. Build the spike pointing at Fly, upload to Facebook
```bash
SERVER_URL=https://<app>.fly.dev npm run build:spike
```
- Zip the **contents** of `dist-spike/` (index.html at the ZIP top level, beside app.js + fbapp-config.json).
- developers.facebook.com → create app → add **Instant Games** product → upload the ZIP.
- Open the game on an **iPhone and an Android** phone.

## 5. Read the result
- **status green + RTT** on both phones → live WSS works in the container ✓
- **getID stability = STABLE ✓** after reloading the game → identity is safe for reconnect-grace ✓
- transport should be `websocket` (not long-polling) in the log line.

Both green → proceed to T1. Either red → stop and reconsider Approach B.

## Cleanup after the spike
- Remove the `spikePing` handler from `server.js`.
- `public/spike/`, `build-spike.mjs`, `dist-spike/` can stay as a deploy template or be deleted.
- `fbapp-config.json` `platform_version`/`orientation` values are a starting point — verify against current FB docs when you create the real game.
