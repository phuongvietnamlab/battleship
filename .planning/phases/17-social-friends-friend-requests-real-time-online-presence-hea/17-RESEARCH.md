# Phase 17 Research: Social & Friends

## Codebase Patterns (Relevant to Phase 17)

### Room Creation/Join Flow
- `createRoom`: client emits → server generates code → creates `rooms[code]` in-memory → joins socket to room → ACKs `{ok, code, stake}`
- `joinRoom`: validates code → checks capacity (max 2) → handles rejoin → optionally debits wager → seats player → emits `roomUpdate` + `opponentJoined` + `oppProfile`
- Challenge feature can reuse: create a room server-side, send code to recipient, recipient calls joinRoom with that code

### Socket.IO Connection & Auth
- On connect: `socket.data.userId = socket.request.session?.user_id ?? null`
- `socket.data` fields: `code`, `clientId`, `userId`, `queueType`, `queueKey`
- Session middleware shared between Express and Socket.IO
- Presence system needs: map userId → Set<socketId> (multi-tab), emit on connect/disconnect

### Match Recording (for H2H stats)
- `matches` table: winner_id, loser_id, reason, mode, started_at, ended_at, stake
- Indexes: winner_id, loser_id, ended_at DESC
- H2H query: `SELECT * FROM matches WHERE (winner_id = $1 AND loser_id = $2) OR (winner_id = $2 AND loser_id = $1)`
- Can aggregate wins/losses/total/last_played in a single query with GROUP BY

### Database Schema
- Migration numbering: 001-009 exist → next is `010_friendships.sql`
- Users table: `users(id, created_at, guest_migrated_at)` — friendships will FK to users.id
- No existing friends/social tables

### Existing UI Patterns
- `BottomSheet` component: reusable overlay with focus-trap, ESC close, click-outside close
- `PlayerCard` in battle: avatar + name + score, `onClick` prop supported (opponent has handleOppClick)
- Existing `opp-stats-popup`: fetches `/api/profile/:id`, shows winRate + gamesPlayed, auto-dismiss 4s
- Wager chip selector: `[0, 10, 25, 50, 100].map(...)` with active state + balance check — reuse for challenge

### Key Integration Points for Phase 17

1. **Presence tracking**: Hook into `io.on("connection")` (line 1712) — after userId is set, register in presence map
2. **Disconnect handling**: Hook into existing disconnect handler (line 2485) — start grace timer for presence
3. **Game state change**: Hook into room start (placeShips both ready) and game end (gameOver) — update presence to in-game/online
4. **Challenge → createRoom**: Server creates room programmatically (same shape as createRoom handler) then emits challenge to recipient; recipient does joinRoom
5. **Battle avatar popup**: Extend `handleOppClick` + `opp-stats-popup` with H2H data + add-friend button

## Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Migration number | 010 | Follows existing 001-009 sequence |
| Presence storage | In-memory Map (not Redis) | Single-process app; same pattern as rooms/queues |
| Friend CRUD | REST API + Socket.IO events | REST for list/search/CRUD (cacheable); Socket for real-time notifications |
| Challenge room | Reuse existing createRoom logic | No new room type needed; just a normal room created programmatically |
| H2H query | Aggregate from matches table | No denormalized table; data already exists |
| Grace period | 30s setTimeout (same pattern as room disconnect) | Consistent with existing 3-min room grace |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Memory growth from presence maps | Max 100 friends + cleanup on disconnect; same scale as room map |
| Race condition: challenge accepted after expiry | Server validates challenge.expiresAt before seating; idempotent room destruction |
| Spam friend requests | Rate limit (5/min per user); max 100 friends cap |
| Multi-tab presence flicker | Use Set<socketId> per userId; only go offline when ALL tabs disconnect + 30s grace |
