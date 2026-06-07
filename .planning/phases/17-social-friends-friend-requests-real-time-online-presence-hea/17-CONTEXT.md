# Phase 17: Social & Friends

## Goal

Build a social layer that creates lasting bonds between players — explicit friend requests, real-time presence (friends-only, Socket.IO), head-to-head rivalry stats, and direct challenge invites. Players return because of *people*, not just rank.

## Core Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Friend discovery | Explicit friend request only | Intentional relationships; no auto-tracking strangers |
| Online presence | Real-time via Socket.IO, friends-only | Low latency; privacy-first |
| H2H stats access | Click avatar in battle → popup with stats + "Add Friend" | Natural discovery point; already have avatar click pattern |
| Direct challenge | Same flow as "Create Room" (choose coin → send invite) | Reuse existing room creation logic; familiar UX |
| Challenge recipient | Popup on client side with accept/decline | Real-time Socket.IO; 60s expiry |

## Requirements

### Friends System (SOCL-01)

- **SOCL-01a**: Authenticated user can send a friend request (from avatar popup in battle, or from friends list search)
- **SOCL-01b**: Recipient sees pending requests and can accept/reject
- **SOCL-01c**: Either friend can unfriend (removes relationship both ways)
- **SOCL-01d**: Friends list UI shows all friends with real-time online/offline/in-game status
- **SOCL-01e**: Maximum 100 friends per user (prevents abuse)
- **SOCL-01f**: Cannot send request to self, duplicate, or blocked user
- **SOCL-01g**: Guest users cannot use friend system (must be authenticated)

### Online Presence (PRES)

- **PRES-01**: Socket.IO real-time presence broadcast to online friends on connect
- **PRES-02**: 30s grace period before showing offline (avoids flicker on page refresh)
- **PRES-03**: Three presence states: online (lobby), in-game (active match), offline
- **PRES-04**: Presence only visible to accepted friends (not pending, not strangers)
- **PRES-05**: Server tracks userId → socket mapping for targeted broadcasts

### Head-to-Head Stats (H2H)

- **H2H-01**: Click opponent avatar in battle → popup shows H2H stats (total games, wins each side, streak)
- **H2H-02**: Same popup shows "Add Friend" button if not already friends
- **H2H-03**: In friends list, each friend card shows mini H2H summary (X wins - Y losses)
- **H2H-04**: Stats derived from existing `matches` table (no new data needed)
- **H2H-05**: "Rival" badge on friend with most games played together (cosmetic)

### Direct Challenge (CHAL)

- **CHAL-01**: From friends list, tap online friend → "Challenge" button appears
- **CHAL-02**: Challenger picks coin amount (same chip selector as room creation: 0/10/25/50/100)
- **CHAL-03**: Server creates a private room (same as createRoom flow) and sends invite via Socket.IO
- **CHAL-04**: Recipient sees a popup: "[Name] thách đấu bạn! Cược: X coin" with Accept/Decline
- **CHAL-05**: Accept → recipient joins the room (same as joinRoom flow) → both enter placement
- **CHAL-06**: Challenge expires after 60s if no response; room is destroyed
- **CHAL-07**: Cannot challenge a friend who is in-game or offline

### i18n

- **SOCL-i18n**: Full Vietnamese + English for all social UI strings

## Database Schema

```sql
CREATE TABLE friendships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, accepted, blocked
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(user_id, friend_id),
  CHECK(user_id != friend_id)
);

CREATE INDEX idx_friendships_user ON friendships(user_id, status);
CREATE INDEX idx_friendships_friend ON friendships(friend_id, status);
```

## UI Design

### 1. Battle Avatar Popup (Enhanced `opp-stats-popup`)

Current: Click opponent avatar → shows win rate + total games (4s auto-dismiss).
New: Click opponent avatar → shows **expanded card** that stays until tapped outside:

```
┌─────────────────────────────────┐
│  👤 NguyenA                     │
│  ─────────────────────────────  │
│  🏆 Win rate: 65% (120 games)  │
│  ─────────────────────────────  │
│  ⚔️ You vs NguyenA             │
│     You: 3 wins                 │
│     Them: 7 wins                │
│     Total: 10 games             │
│     🔥 Streak: them +2          │
│  ─────────────────────────────  │
│  [➕ Add Friend]                │  ← hidden if already friends
│  [👥 Already friends ✓]        │  ← shown if already friends
└─────────────────────────────────┘
```

Implementation: Extend existing `handleOppClick` + `opp-stats-popup` with H2H data from a new endpoint `GET /api/friends/h2h/:userId` and a friend-request button.

### 2. Friends List (New screen/panel)

Accessible from lobby via a new button "👥 Bạn bè" (next to History button).
Shows friends grouped by status:

```
┌─────────────────────────────────┐
│  👥 Friends (12)      [🔍 Search] │
│  ─────────────────────────────────│
│  🟢 ONLINE (3)                    │
│  ┌───────────────────────────┐   │
│  │ 🟢 NguyenA    3-7  [⚔️]  │   │  ← [⚔️] = Challenge button
│  │ 🟢 TranB      5-5  [⚔️]  │   │
│  │ 🟢 LeC        1-0  [⚔️]  │   │
│  └───────────────────────────┘   │
│                                   │
│  🎮 IN GAME (1)                   │
│  ┌───────────────────────────┐   │
│  │ 🎮 PhamD      0-2         │   │  ← no challenge button (in-game)
│  └───────────────────────────┘   │
│                                   │
│  ⚫ OFFLINE (8)                   │
│  ┌───────────────────────────┐   │
│  │ ⚫ HoangE     4-3         │   │
│  │ ⚫ VuF        2-1         │   │
│  │ ...                        │   │
│  └───────────────────────────┘   │
│                                   │
│  📬 Pending Requests (2)          │
│  ┌───────────────────────────┐   │
│  │ PlayerX wants to be friends│   │
│  │ [✓ Accept] [✗ Decline]    │   │
│  └───────────────────────────┘   │
└───────────────────────────────────┘
```

Each friend row shows:
- Presence indicator (🟢/🎮/⚫)
- Display name
- Mini H2H record (your wins - their wins)
- Challenge button (only if online)

### 3. Challenge Flow (Sender side)

When user clicks [⚔️] on an online friend:

```
┌─────────────── BottomSheet ──────────────┐
│  ⚔️ Challenge NguyenA                    │
│  ──────────────────────────────────────  │
│  Choose wager:                            │
│  [Free] [10] [25] [50] [100]            │
│                                           │
│  💰 Your balance: 350 coin               │
│                                           │
│  [⚔️ Send Challenge]                     │
└───────────────────────────────────────────┘
```

Same chip selector pattern as existing room wager UI. On send:
1. Server creates room (reuse `createRoom` logic)
2. Server emits `friend:challenge-received` to recipient's socket
3. Sender sees "Waiting for response..." with 60s countdown

### 4. Challenge Flow (Recipient side)

Recipient sees a modal popup overlay (not dismissable by outside click):

```
┌───────────────────────────────────┐
│  ⚔️ Challenge!                    │
│                                   │
│  NguyenA thách đấu bạn!          │
│  Cược: 25 coin                    │
│                                   │
│  ⏱️ 45s                           │  ← countdown
│                                   │
│  [✓ Accept]    [✗ Decline]        │
└───────────────────────────────────┘
```

- Accept → `socket.emit("joinRoom", { code: challengeRoomCode })` → same flow as joining a room
- Decline → notify sender, destroy room
- Timeout (60s) → auto-decline

### 5. Friend Search (in Friends panel)

Simple search input at top:

```
┌─────────────────────────────────┐
│  🔍 Search player...            │
│  ─────────────────────────────  │
│  Results:                        │
│  │ NguyenA (65% WR, 120 games) │
│  │ [➕ Add Friend]              │
│  │ NguyenB (52% WR, 45 games)  │
│  │ [➕ Add Friend]              │
└─────────────────────────────────┘
```

Searches by `display_name` (ILIKE). Shows basic stats + add friend button.

### 6. Post-Match "Add Friend" Prompt

After game over screen, if opponent is authenticated and not already a friend:

```
┌─────────────────────────────────┐
│  VICTORY! / DEFEAT              │
│  ...existing content...          │
│  ─────────────────────────────  │
│  [🔄 Play again]               │
│  [➕ Add NguyenA as friend]     │  ← NEW: subtle button
└─────────────────────────────────┘
```

## Socket.IO Events (New)

| Event | Direction | Payload |
|-------|-----------|---------|
| `friend:request` | C→S | `{ targetUserId }` |
| `friend:accept` | C→S | `{ friendshipId }` |
| `friend:reject` | C→S | `{ friendshipId }` |
| `friend:remove` | C→S | `{ friendId }` |
| `friend:challenge` | C→S | `{ friendId, stake }` |
| `friend:challenge-accept` | C→S | `{ challengeId }` |
| `friend:challenge-decline` | C→S | `{ challengeId }` |
| `friend:online` | S→C | `{ userId, displayName, status }` |
| `friend:offline` | S→C | `{ userId }` |
| `friend:status-change` | S→C | `{ userId, status }` |
| `friend:request-received` | S→C | `{ friendshipId, from: { id, displayName, avatarUrl } }` |
| `friend:challenge-received` | S→C | `{ challengeId, from: { id, displayName }, stake, roomCode, expiresAt }` |
| `friend:challenge-expired` | S→C | `{ challengeId }` |
| `friend:list` | S→C | `[{ id, displayName, avatarUrl, status, h2h: {wins, losses} }]` |
| `friend:pending` | S→C | `[{ friendshipId, from: { id, displayName, avatarUrl } }]` |

## API Endpoints (New)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/friends` | Get friends list with presence + mini H2H |
| GET | `/api/friends/pending` | Get pending incoming requests |
| GET | `/api/friends/h2h/:userId` | Get detailed H2H stats vs a specific user |
| GET | `/api/friends/search?q=name` | Search users by display_name |
| POST | `/api/friends/request` | Send friend request (body: `{ targetUserId }`) |
| POST | `/api/friends/accept` | Accept request (body: `{ friendshipId }`) |
| POST | `/api/friends/reject` | Reject request (body: `{ friendshipId }`) |
| DELETE | `/api/friends/:friendId` | Unfriend |

## Presence System (Server-side)

```
Data structures:
  userSockets: Map<userId, Set<socketId>>  (multi-tab support)
  userPresence: Map<userId, 'online' | 'in-game' | 'offline'>
  disconnectTimers: Map<userId, setTimeout>

On authenticated socket connect:
  1. Clear any pending disconnect timer for userId
  2. Add socketId to userSockets[userId]
  3. Set userPresence[userId] = 'online'
  4. Query accepted friends from DB
  5. For each friend who is in userSockets: emit 'friend:online' to their sockets
  6. Send friend:list to connecting user (with current presence of each friend)

On socket disconnect:
  1. Remove socketId from userSockets[userId]
  2. If userSockets[userId] is empty:
     - Start 30s timer (disconnectTimers[userId])
     - After 30s: set 'offline', emit 'friend:offline' to online friends

On game start (existing joinRoom/placeShips → battle):
  - Set userPresence[userId] = 'in-game'
  - Emit 'friend:status-change' to online friends

On game end (existing gameOver/leaveRoom):
  - Set userPresence[userId] = 'online'
  - Emit 'friend:status-change' to online friends
```

## Challenge Flow (Server-side)

```
On 'friend:challenge' { friendId, stake }:
  1. Validate: sender authenticated, friendId is accepted friend, friend is online (not in-game)
  2. Validate: sender has enough balance if stake > 0
  3. Create room (reuse createRoom logic) → get roomCode
  4. Store pending challenge: { id, senderId, receiverId, roomCode, stake, expiresAt: now+60s }
  5. Emit 'friend:challenge-received' to receiver's sockets
  6. Set 60s timeout → if not accepted, destroy room + emit 'friend:challenge-expired' to both

On 'friend:challenge-accept' { challengeId }:
  1. Validate: challenge exists, not expired, receiver matches
  2. Join receiver to the room (reuse joinRoom logic with roomCode)
  3. Clear expiry timeout
  4. Both players now in room → normal game flow

On 'friend:challenge-decline' { challengeId }:
  1. Clear expiry timeout
  2. Destroy room
  3. Emit notification to sender: "Challenge declined"
```

## Dependencies

- Phase 2 (accounts/identity) — requires authenticated users with userId
- Phase 3 (match recording) — H2H stats query from matches table
- Phase 7 (points) — optional stake on challenges (graceful: stake=0 if no points system)

## Estimated Plans

| # | Plan | Scope |
|---|------|-------|
| 1 | DB migration + Friend CRUD API + search | Schema, REST endpoints, validation |
| 2 | Presence system (Socket.IO) | Server-side tracking, broadcast, grace period |
| 3 | H2H stats + enhanced battle avatar popup | Query, API, upgraded opp-stats-popup with add-friend |
| 4 | Direct challenge flow | Server challenge logic, room reuse, expiry |
| 5 | Frontend — Friends list screen + challenge popup + i18n | Full client UI |

**Total: ~5 plans**
