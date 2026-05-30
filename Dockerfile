# Server image for Fly.io. Hosts the Socket.IO game server only — the client
# bundle is uploaded separately to Facebook Instant Games. Fly terminates TLS at
# the edge, so the server stays plain HTTP/WS internally; clients reach it via wss://.
FROM node:20-alpine

WORKDIR /app

# Runtime deps only (omit dev: esbuild + socket.io-client are build-time, not server runtime).
COPY package*.json ./
RUN npm ci --omit=dev

# Server code. game.js is added in T3 (engine extraction); the glob tolerates its absence.
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "server.js"]
