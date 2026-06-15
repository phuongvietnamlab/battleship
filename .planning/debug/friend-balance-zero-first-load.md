# Debug: friend balance shows 0 in challenge popup on first load

**Status:** resolved
**Date:** 2026-06-15
**Reporter symptom:** "lần đầu vào nó toàn lỗi như này, phải F5 lại vài lần mới được" — challenge stake popup shows `phương 123: 0` on first load; refreshing a few times eventually shows the real balance.

## Scientific investigation

### Observation
- Challenge popup line: `You: 446 · phương 123: 0` (friend balance 0).
- Intermittent — F5 sometimes fixes it. Classic load-order race.

### Hypotheses
1. DB wallet row missing / wrong for the friend. **Rejected** — replicated the `/api/friends` balance query against the live DB: `getFriendsList(1)` → friend id 5, `wallets` → balance 608. Server data correct.
2. HTTP `/api/friends` omits balance. **Rejected** — handler maps `balance: balances[f.id] ?? 0` (server.js ~966).
3. Socket `friend:list` payload omits balance and overwrites the HTTP-loaded list. **Confirmed.**

### Root cause
`sendFriendListWithPresence` (server.js ~1119) built the `friend:list` socket payload with `status` + `h2h` but **no `balance`**. The client (`LobbyFriendsWidget` `onList → setFriends`, app.jsx ~1030) replaces `friends` wholesale with this payload. Sequence on first load:

1. `authUser` hydrates → `loadFriends()` → `GET /api/friends` → friends **with** balance.
2. Socket connects → server emits `friend:list` (no balance) → `setFriends` clobbers → `f.balance` undefined → popup `challengeTarget.balance ?? 0` → **0**.

Order is timing-dependent, so F5 sometimes lands the HTTP response last and shows the right value. `friend:status-change` was fine (it spreads the prior `f`, preserving balance) — only `friend:list` dropped it.

## Fix
Add the same wallet lookup to `sendFriendListWithPresence` so the socket `friend:list` payload includes `balance`, matching `GET /api/friends`. Now neither source clobbers the other.

- `server.js` — `sendFriendListWithPresence`: query `wallets` for `friendIds`, set `balance: balances[f.id] ?? 0` on each friend.

Server-side change → requires server restart to take effect.

## Verification
- DB query parity confirmed (608 returned).
- `node -c server.js` passes.
- Manual: after restart, open challenge popup on first load (no F5) → friend balance shows real value; paid stake chips enabled correctly.
