# Pitfalls Research

**Domain:** Realtime multiplayer web game — adding accounts, matchmaking, ranked ELO, and persistence to an existing Socket.IO/Node.js game
**Researched:** 2026-06-01
**Confidence:** HIGH (core patterns verified against official docs and multiple sources); MEDIUM for tournament/replay specifics

---

## Existing CONCERNS.md Items That Escalate Under Public Play

The following items from `CONCERNS.md` are LOW-to-MEDIUM severity today but become **critical** once accounts, ranked play, and public matchmaking exist. They are called out inline in pitfalls below, and summarized here for visibility:

| Concern # | Description | Severity Today | Severity Under Public Play | Why it Gets Worse |
|-----------|-------------|---------------|---------------------------|-------------------|
| #2 | No rate limiting on `fire`/`useAbility` | High | **Critical** | Any authenticated user can DoS any game; persistent accounts make ban evasion via new guests trivial |
| #3 | Weak chat/profile validation | Medium | **High** | Persistent usernames enable targeted harassment; XSS in stored names affects profiles/leaderboards |
| #5 | Race condition in `joinRoom`/`placeShips` | High | **Critical** | Matchmaking queue inserts + concurrent joins on shared in-memory state compound the existing race |
| #6 | Missing null/shape validation in `doShot()` | High | **Critical** | Public players will probe for crashes intentionally; a crash mid-ranked game corrupts ELO state |
| #7 | Turn-clock races | Medium | **High** | Cheaters exploit the race to invalidate opponent's shot without consuming a turn |
| #8 | Unbounded room-map memory growth | High | **Critical** | Matchmaking creates rooms continuously; abandoned ranked rooms leak forever |
| #9 | No horizontal scaling | Medium | **High** | Matchmaking queue and presence must be shared state; single-process breaks when a second Render instance starts |
| #10 | Zero automated tests | High | **Critical** | Every persistence migration, ELO formula change, and OAuth callback is untested in production |

---

## Critical Pitfalls

### Pitfall 1: Guest Identity Multiplied After OAuth Linking

**What goes wrong:**
A player plays 10 games as a guest (clientId A), signs in with Google, and the system creates a new `users` row for their Google sub. Their old guest stats are orphaned. Or worse: the system creates a new guest row on every page load if the browser clears localStorage, so one human player has 20 guest rows, diluting leaderboard accuracy and ELO pools.

**Why it happens:**
Developers treat `clientId` (localStorage) and `google_sub` as two parallel identity systems rather than designing a single canonical identity with multiple credentials attached. The merge path — linking a guest to an OAuth identity — is treated as a one-time concern and never hardened.

**How to avoid:**
- Design identity as: one canonical `users` row, multiple `credentials` rows (`type: guest | google`, `external_id`).
- On OAuth sign-in: look up `credentials` by `google_sub`. If found, sign in. If not, check if a guest `clientId` was present in the session — if yes, **link** (do not create); if no, create new.
- Store the current guest `clientId` in the OAuth `state` parameter before the redirect so it survives the round-trip.
- Make the link operation idempotent and atomic (single DB transaction: insert credential + update `users.guest_migrated_at`).
- Deduplicate on `google_sub`, not on email — Google OAuth `sub` is stable; email can be changed.

**Warning signs:**
- `users` table row count grows faster than unique active players.
- Guest players appear on leaderboards with 0 wins and impossible game counts.
- A player reports "my stats are gone after login."

**Phase to address:** Foundation — Persistence & Identity (first phase)

---

### Pitfall 2: ELO Applied to Forfeits, Disconnects, and Abandoned Games Incorrectly

**What goes wrong:**
Player A intentionally disconnects in a losing ranked game. The server either (a) gives no ELO change because the game had no `result`, (b) gives a full win to B and a full loss to A, or (c) crashes mid-resolution (CONCERNS.md #6) and records nothing. Over time: good players exploit disconnects to avoid losses; bad players create throwaway guests to tank ratings; leaderboard top slots fill with boosted accounts.

**Why it happens:**
ELO resolution is bolted onto the existing `gameOver` handler, which was designed for clean wins/losses only. The 3-minute disconnect grace window (existing behavior) was built for crash recovery, not for ranked abuse prevention. The distinction between "connection lost involuntarily" vs. "rage-quit to dodge ELO" is never modeled.

**How to avoid:**
- Define explicit ranked game states: `active`, `completed`, `forfeited`, `abandoned` (grace expired), `disputed`.
- Write ELO to DB only on `completed` or `forfeited` — never on a half-resolved state.
- Treat disconnect-then-grace-expired as a **forfeit loss** for the disconnecting player, full win for the opponent. This is the industry standard (The Finals, Valorant, LoL all use this model).
- Use a DB transaction: insert `game_result` row AND update both players' `elo` in the same transaction. No partial ELO updates.
- Add a cooldown: if a player forfeits/abandons > N ranked games per day, temporarily suspend ranked queue access.
- K-factor: use K=40 for first 10 games, K=20 thereafter (Board Game Arena model). A flat K across all players lets high-volume smurfs move the rating market.

**Warning signs:**
- Top leaderboard accounts have high win rates but suspicious game counts (very few games played).
- Players report rating loss even when their opponent disconnected.
- `game_results` table has rows where `winner_id IS NULL` and `elo_delta` is also NULL.

**Phase to address:** Retention & Competition — Ranked mode

---

### Pitfall 3: Matchmaking Queue Paired with In-Memory State Creates Duplicate Matches

**What goes wrong:**
Two players join the matchmaking queue within milliseconds. The single-process event loop processes both `joinQueue` events "simultaneously" (they are sequential in JS but arrive in the same tick context). Both events see an empty queue, both emit `matchFound` to themselves, and both are assigned to the same room — except the room is also being created twice. One player gets a broken game; ELO records are corrupted.

**Why it happens:**
JavaScript is single-threaded, so developers assume there are no race conditions. But async DB calls (`INSERT player INTO queue`) between the queue-check and the queue-pop create a TOCTOU window. CONCERNS.md #5 (existing `joinRoom` race) is the same class of bug, now amplified by the additional async DB layer.

**How to avoid:**
- Implement a **queue lock** around the pair-and-create-room operation: check queue, pop two players, create room — all within a single synchronous in-memory critical section before any async I/O.
- Better: use `SELECT ... FOR UPDATE SKIP LOCKED` in Postgres if queue is persisted (prevents two server instances from claiming the same player).
- Handle the edge case where a queued player disconnects before being paired: remove from queue on `disconnect`, re-add on reconnect only if they were in queue state.
- Validate: a player cannot be in two rooms simultaneously — enforce with a DB unique constraint on `active_game_id` in `users`.

**Warning signs:**
- Two players in queue but zero matches formed (phantom queue entries).
- A player receives two `matchFound` events.
- `rooms` map size grows without corresponding active game DB rows.

**Phase to address:** Retention & Competition — Public quick-match (before ranked)

---

### Pitfall 4: Render Postgres Connection Pool Exhaustion

**What goes wrong:**
The Render-managed Postgres instance on a starter plan has a max of 25 connections (Starter) to 97 connections (Standard). A naive Node.js + `pg` setup creates a new pool per module import, or creates a pool with `max: 10` per Render service instance. Add two Render services (web + a background worker) and you exhaust connections within minutes of moderate traffic. Every Socket.IO game event that touches the DB hangs waiting for a connection; games freeze.

**Why it happens:**
Render does not include built-in connection pooling (PgBouncer) at any tier. Developers assume their pool size is the only variable. They don't account for: multiple Render service replicas, connection overhead from `pg` on each query, and the fact that Render's free Postgres has a **30-day auto-deletion** policy.

**How to avoid:**
- Use a single shared `pg.Pool` instance — export it from a `db.js` module, never create per-request pools.
- Set pool `max` conservatively: `Math.floor(connectionLimit / numInstances) - 2`. For a single Render instance and a 25-connection Starter plan, `max: 10` is safe.
- Add PgBouncer in transaction-pooling mode if you scale to multiple instances (Render community supports this as a separate service).
- Do NOT use the free Postgres tier for production ranked data — it auto-deletes at 30 days. Use at minimum the Starter ($7/mo) paid tier.
- Set `ssl: { rejectUnauthorized: false }` or configure proper TLS — Render Postgres requires SSL; unencrypted connections will be rejected.
- Add a connection health check (`pool.on('error', ...)`) and alert on pool exhaustion.

**Warning signs:**
- Socket.IO events time out but the game logic itself is synchronous.
- Node.js process hangs with high libuv handle count.
- Postgres logs show "sorry, too many clients already."
- DB disappears entirely (free tier expiry).

**Phase to address:** Foundation — Persistence (before any DB-backed feature)

---

### Pitfall 5: OAuth Callback Lacks CSRF State Validation + Session Fixation

**What goes wrong:**
The OAuth callback handler at `/auth/google/callback` does not validate the `state` parameter. An attacker crafts a link that triggers a login-CSRF: the victim's browser completes the OAuth flow, but the resulting session is tied to the attacker's account. The attacker now has the victim's game session. Alternatively: the OAuth callback creates a new session (regeneration), but the server does not invalidate the old session, leaving a fixated session usable by an attacker.

**Why it happens:**
Tutorials for Passport.js/Google OAuth often omit `state` parameter generation, or use a static string like `"random_string"`. Most examples do not call `req.session.regenerate()` post-login.

**How to avoid:**
- Generate a cryptographically random `state` value (e.g., `crypto.randomBytes(16).toString('hex')`), store it in the pre-OAuth session, and validate it in the callback — reject if mismatch.
- Use PKCE (`code_verifier` + `code_challenge`) in addition to `state` — protects against authorization code injection even if state is leaked.
- Call `req.session.regenerate()` immediately after a successful OAuth login to prevent session fixation.
- If linking an OAuth credential to an existing guest session, re-validate session age — do not allow linking to a session older than a configurable threshold (prevents hijacked-session attacks).
- Scope the OAuth token request to `openid email profile` only — do not request write scopes.

**Warning signs:**
- Auth callback handler has no `state` comparison.
- Session ID does not change between pre-login and post-login requests (observable in browser devtools).
- Multiple OAuth providers share a static `state` string in the codebase.

**Phase to address:** Foundation — Google OAuth sign-up

---

### Pitfall 6: Replay Storage as Full JSONB Blobs Causes Postgres TOAST Bloat

**What goes wrong:**
Each game replay is stored as a single `JSONB` column containing all events (~200 moves for a full Battleship game). Postgres applies TOAST compression to values > 2KB, but updates (e.g., appending a move) duplicate the **entire** TOAST value. After 10,000 games, the `replays` table has multi-GB bloat; index scans slow; `VACUUM` runs become expensive. Render's disk is metered — storage costs spike unexpectedly.

**Why it happens:**
JSONB is convenient and flexible. Developers store `{events: [...]}` and append moves by fetching, modifying, and re-inserting the whole blob — not realizing each re-insert creates a new TOAST value, with the old one reclaimed only by VACUUM.

**How to avoid:**
- Store replays as a **log of individual event rows** in a `replay_events` table: `(game_id, seq, event_type, payload JSONB)`. Each move is one small row — no TOAST, cheap to append, queryable.
- For retrieval, use a single `SELECT ... ORDER BY seq` per game — fast with a `(game_id, seq)` index.
- For completed games, optionally materialize a compact snapshot into a `replay_snapshots` table (final board state) so viewing the outcome does not require replaying all events.
- Implement a retention policy: auto-delete events for games older than N days unless a player explicitly "saves" the replay.
- Monitor `pg_total_relation_size('replay_events')` in your metrics endpoint.

**Warning signs:**
- `replays` table is the largest table by a wide margin.
- `VACUUM` jobs take longer than the average game.
- `pg_stat_user_tables.n_dead_tup` for replays table grows continuously.

**Phase to address:** Spectate & Share — Saved game replays

---

### Pitfall 7: Presence System Shows Stale "Online" Status (Zombie Connections)

**What goes wrong:**
A player's phone loses Wi-Fi. The TCP connection does not send a FIN — it just goes silent. Socket.IO's server never fires `disconnect`. The player appears "online" to their friends for up to 2 hours (OS-level TCP keepalive default). The friends list shows them as available; a challenge invite fires; the matchmaking queue adds them; the game starts; the opponent is matched against a ghost.

**Why it happens:**
Socket.IO relies on the transport layer to detect dropped connections. Without application-level heartbeats, TCP silently holds zombie connections. This is especially acute on mobile (Android WiFi transitions) and behind corporate proxies that terminate idle connections without notifying either end.

**How to avoid:**
- Enable Socket.IO's built-in ping/pong: set `pingTimeout: 10000, pingInterval: 25000` on the server. This is OFF by default in some configurations.
- Maintain a presence table in Redis (or Postgres): `SET presence:{userId} 1 EX 45` — refreshed on each ping-pong cycle. A key expiry = user is offline.
- When a `disconnect` event fires, do NOT immediately mark offline — start a 30-second grace timer (covers mobile app backgrounding). This is distinct from the existing 3-minute reconnect grace, which is per-room.
- For friends list queries, read from the TTL-keyed presence store, not from the Socket.IO rooms map.
- Corollary: the matchmaking queue must also check presence TTL before pairing — do not pair a player whose presence key has expired.

**Warning signs:**
- Players complain "my friend showed online but wouldn't respond to invites."
- Server's `io.sockets.sockets.size` is much larger than the number of recently-active players.
- Presence TTL never expires even after browser tabs are closed.

**Phase to address:** Social — Friends list with online presence

---

### Pitfall 8: Leaderboard Global Rank Query Scans Entire Users Table

**What goes wrong:**
The leaderboard page runs `SELECT *, RANK() OVER (ORDER BY elo DESC) FROM users` on every request. At 1,000 users this is fast. At 50,000 users it is a full sequential scan taking seconds. Render's smallest Postgres instance has no query parallelism. The leaderboard page becomes the slowest page in production, and every load spikes CPU on the shared DB instance.

**Why it happens:**
The RANK() window function requires sorting the entire table to compute positions. Developers write this query in development against 20 rows and never benchmark at scale.

**How to avoid:**
- Add a **materialized leaderboard**: a `leaderboard_cache` table refreshed by a periodic job (every 5 minutes is fine — live ELO feeds are not necessary for casual players).
- The live leaderboard endpoint reads from `leaderboard_cache`, not `users`.
- For "your rank" queries (a single player's position): use `SELECT COUNT(*) FROM users WHERE elo > $1` — an index range scan, much cheaper than a window function.
- Add an index on `users.elo DESC NULLS LAST`.
- Seasonal reset: archive the season's `leaderboard_cache` snapshot into a `leaderboard_seasons` table; reset `users.elo` to a default via a single UPDATE; do NOT delete the historical data.

**Warning signs:**
- Leaderboard endpoint p95 latency is an order of magnitude higher than other endpoints.
- DB CPU spikes to 100% when leaderboard page is opened.
- `EXPLAIN ANALYZE` on the ranking query shows `Seq Scan` on `users`.

**Phase to address:** Retention & Competition — Global leaderboards

---

### Pitfall 9: `fire`/`useAbility` Rate Limit Absent Enables ELO Farming and DoS (CONCERNS.md #2 + #7)

**What goes wrong:**
Without rate limiting, a malicious player writes a script that emits `fire` events at 1000/s. This (a) crashes or freezes the game for the opponent, who forfeits and loses ELO, (b) exploits the turn-clock race (CONCERNS.md #7) to invalidate the opponent's shots, and (c) can cascade to exhaust the Postgres connection pool (CONCERNS.md referencing #8 + new DB layer). With public accounts, every ranked win gained this way inflates the attacker's ELO.

**Why it happens:**
Rate limiting was deferred as low-priority because the original game was invite-only (room codes). Public matchmaking removes that trust assumption entirely.

**How to avoid:**
- Apply per-socket rate limiting on ALL game events — use `rate-limiter-flexible` with a Redis store so limits survive reconnects across the 3-minute grace window.
- Limits: `fire` max 2/second (one per turn plus jitter tolerance), `useAbility` max 1/second, `chat` max 5/10 seconds.
- On limit violation: emit a warning event; on second violation: disconnect the socket; on repeated violations: flag the account for review.
- Do NOT rely on client-side throttle/debounce alone — any MITM or scripted client bypasses this.
- Address CONCERNS.md #7 (turn-clock race) in the same phase: guard the clock timeout handler with a `turn.resolving` boolean flag so a simultaneous `fire` + timeout cannot both resolve.

**Warning signs:**
- Server event queue depth grows without bound during a game.
- Game logs show the same player firing more than once per second.
- Ranked winners have suspiciously short game durations.

**Phase to address:** Foundation — must be addressed before public matchmaking opens

---

### Pitfall 10: Smurfing via Unlimited Guest Accounts Bypasses ELO Floor

**What goes wrong:**
A high-ELO player creates a new guest `clientId` (trivially — just clear localStorage or open incognito). They play ranked with no account, gain easy wins against beginners, then link the guest to a throwaway Google account to lock in the inflated ELO. Repeat with a new guest. The ELO pool fills with artificially high-rated accounts and beginners are crushed in every match.

**Why it happens:**
Guest accounts are intentionally frictionless (a core product requirement). There is no mechanism to link behavioral history to a hardware or IP fingerprint.

**How to avoid:**
- Require account creation (Google OAuth) before ranked queue access. Guest play remains fully supported for casual/quick-match modes only.
- On guest-to-OAuth link: if the new OAuth account has fewer than N games played, inherit the guest's game history — do not allow a clean-slate ranked start via OAuth.
- Implement a **placement match requirement**: new ranked accounts play 5 unrated placement matches before an ELO is published to the leaderboard. This reduces the value of smurfing (the account is recognizably new during placement).
- Rate limit ranked queue joins per IP per hour as a secondary signal (not a primary barrier, but raises the cost of farming).
- Flag accounts where ELO grows faster than 2 standard deviations above the median rate — queue for manual review.

**Warning signs:**
- Leaderboard fills with accounts that have exactly 5-10 games played.
- New ranked accounts have a disproportionate win rate in their first 5 games.
- Guest-to-OAuth link events spike when a leaderboard season ends (stat reset farming).

**Phase to address:** Retention & Competition — Ranked mode (gate ranked behind accounts)

---

### Pitfall 11: Tournament Bracket Created Before All Players Are Confirmed

**What goes wrong:**
A tournament is created with an expected player count. Players sign up asynchronously. At start time, 7 of 8 expected players have confirmed. The bracket is generated with 7 players — bye assignment is ambiguous, the seeding is wrong, and a race condition assigns two players the same bracket slot if two confirmations arrive in the same event loop tick.

**Why it happens:**
Tournament creation logic assumes a fixed, known player count at generation time. Async sign-up + real-time confirmation introduces a variable enrollment window that the bracket generator was not designed for.

**How to avoid:**
- Bracket generation must be a single atomic operation, triggered by an explicit "lock and generate" admin action, not by a player count threshold being crossed.
- Enforce a power-of-2 expansion: if N players enrolled, generate a bracket for `next_power_of_2(N)` slots; distribute byes to lower seeds deterministically.
- Use a DB advisory lock or a `status: 'locking' | 'locked'` state transition with optimistic concurrency control to prevent duplicate bracket generation from concurrent requests.
- Send confirmation emails/notifications with a deadline; mark no-shows as byes automatically.

**Warning signs:**
- Two players report being in the same bracket slot.
- Bracket has N+1 or N-1 entries for N enrolled players.
- Tournament starts mid-enrollment.

**Phase to address:** Spectate & Share — Tournament brackets

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing ELO deltas in application memory, writing to DB async | Faster game resolution | Crash between game-end and DB write leaves ELO in inconsistent state | Never for ranked play |
| Single `users` table with all identity fields (`guest_client_id`, `google_sub`, `elo`, `xp`) | Simple schema | Impossible to add a second OAuth provider later without a migration; guest→OAuth link logic becomes a sprawling UPDATE | Never beyond MVP |
| Using `SELECT COUNT(*) FROM users WHERE elo > $1` for live rank display per profile page | Simple to implement | N profile loads = N full table scans if not indexed | Acceptable with an index on `elo` |
| Guest clientId as the sole ranked identity during early testing | Fast to build | Smurfing trivial; guest-to-ranked path never gets designed properly | Only for private beta, never for public launch |
| JSONB blob per game for replay storage | Simple to write | TOAST bloat, no per-event query, append is full rewrite | Never if > 1000 games expected |
| Skipping placement matches to "get ELO moving faster" | Players get rated immediately | ELO pool is polluted by smurfs and placement games inflate/deflate arbitrarily | Never for public competitive mode |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Render Postgres | Creating a pool per module import | Export a single shared `pg.Pool` from `db.js`; import that singleton everywhere |
| Render Postgres free tier | Using it for production ranked data | Free tier deletes after 30 days; use paid Starter ($7/mo) minimum for any persistent user data |
| Render Postgres SSL | `ssl: false` in connection string | Render requires SSL; use `ssl: { rejectUnauthorized: false }` for self-signed, or configure proper CA |
| Google OAuth | Trusting email as unique identity key | Use `sub` field — email can change; `sub` is the stable, Google-scoped user identifier |
| Google OAuth | Static or missing `state` parameter | Generate a random `state` per login flow; store in session; validate on callback |
| Socket.IO rate limiting | Client-side debounce only | Server-side `rate-limiter-flexible` per socket ID; client-side is trivially bypassed |
| Socket.IO presence | Reading `io.sockets.sockets.size` for online count | Use Redis TTL keys refreshed on ping-pong; socket map includes zombie connections |
| Redis (existing optional store) | Assuming Redis is always available | The existing `store.js` graceful no-op pattern is correct; extend it for presence/queue with the same pattern |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Global `RANK()` window function on `users` per leaderboard request | Leaderboard latency > 2s, DB CPU spikes | Materialized `leaderboard_cache` table, refreshed every 5 min | ~5,000 users |
| Full replay JSONB blob on each move append | TOAST table grows unbounded, `VACUUM` never catches up | Event log table `(game_id, seq, payload)` | ~500 games stored |
| In-memory `rooms` map for matchmaking queue (CONCERNS.md #8) | Phantom queue entries, queue state lost on server restart | Persist queue to Postgres or Redis; enforce cleanup on disconnect | Any server restart or second Render instance |
| `SELECT *` for player profile (fetches all columns including large stats blobs) | Profile page slow at high concurrency | SELECT only needed columns; normalize stats into a separate `player_stats` table | ~1,000 concurrent profile views |
| ELO recalculation on every leaderboard sort | Each leaderboard view triggers N ELO reads + sort | Store current ELO as a column; recalculate only on game result write | Immediate — any non-trivial query |
| Checking presence by querying `users.last_seen` timestamp | Stale by minutes; N queries per friends list view | Redis TTL presence keys; single `MGET` for a friend list | ~50 friends per user |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-emitted `targetCoordinates` without server re-validation | A cheating client fires outside the grid or fires the same cell twice to force a crash | Server re-validates every coordinate against game state before `doShot()` — already server-authoritative but CONCERNS.md #6 shows validation gaps |
| Exposing opponent's full board state in Socket.IO `gameState` event | Client can read the opponent's ship positions from the event payload | Only send each player their own board + the revealed cells of the opponent's board |
| Storing Google `access_token` in the session cookie | Token theft = Google account access | Store only the `sub` + your own session token; never persist access tokens beyond the auth flow |
| Persistent usernames not sanitized in DB (CONCERNS.md #3) | Stored XSS on profile pages, leaderboards, and chat history | Sanitize at write time (HTML-escape + max length); use Content Security Policy header |
| Ranking API endpoint unauthenticated | Automated scraping of all players' ELO and stats enables targeted smurf-hunting | Rate-limit the public leaderboard endpoint; paginate; return only top N or player's local neighborhood |
| Allowing guests to access ranked mode | Unlimited free accounts = trivial ELO manipulation | Gate ranked queue behind OAuth account; guests can only play casual modes |
| No CSRF token on auth state-changing POST routes | CSRF attack can link a third-party credential to the victim's account | Require `state` param in OAuth flows; use `SameSite=Strict` or `SameSite=Lax` on session cookies |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing a ranked queue spinner with no estimated wait time | Users abandon queue after 30s, reducing pool further | Show a rolling average wait time; after 60s show "low player count" notice |
| Requiring account creation before players try ranked | High drop-off; players never discover ranked mode | Let players try one ranked game as guest, then prompt to save their result by signing up |
| ELO shown as a raw number with no context | Players do not know if 1200 is good or bad | Show percentile rank ("Top 15%") alongside ELO; raw number secondary |
| No explicit disconnect penalty warning before ranked queue | Players close browser mid-game without understanding consequence | Show a modal: "Leaving a ranked game counts as a forfeit and reduces your rating" |
| Replay viewer requires full event replay from move 1 | Long games (150+ moves) take seconds to load the final state | Store a terminal snapshot; default view shows final board state; event-by-event scrubber optional |
| Friend invite sent to a player already in a game | Invitee receives interrupt mid-game; inviter gets no feedback | Check presence state before sending; if `in_game`, queue the invite or notify "available in ~N min" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **OAuth sign-in:** Implemented login but missing `state` CSRF validation — verify callback checks `req.session.oauthState === req.query.state` before proceeding.
- [ ] **Guest-to-OAuth linking:** Shows a success message but check: were the guest's game history, ELO history, and room memberships actually migrated in a single DB transaction?
- [ ] **ELO update:** Game shows a "you won, +24 ELO" toast — verify the DB write is inside the same transaction as the `game_results` insert, not a separate subsequent UPDATE.
- [ ] **Matchmaking queue:** Pairs two players and creates a room — verify a player who disconnects from the queue is removed (check `disconnect` handler removes queue entry).
- [ ] **Presence:** Friends list shows green dot — verify the dot reads from a TTL-keyed store, not from `users.last_seen` which only updates on explicit logout.
- [ ] **Rate limiting:** `fire` events are throttled — verify limits are per socket ID AND per account ID (not just per IP, which is easily bypassed via VPN/proxy).
- [ ] **Replay storage:** First game is saved — verify the storage writes events incrementally, not a single blob update per move.
- [ ] **Leaderboard seasonal reset:** Season ends, ratings reset — verify historical season data is archived BEFORE reset, and the reset is a DB migration not an application-level loop.
- [ ] **Ranked forfeit:** Opponent forfeits — verify both the `game_results` INSERT and the ELO UPDATE committed before the winner is notified (not eventual consistency).
- [ ] **Render Postgres:** App connects — verify you are NOT using the free tier for ranked/account data; verify SSL is enabled; verify pool max is set correctly.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Guest identity fragmentation (many orphan guest rows) | MEDIUM | Write a backfill script: identify guest rows with overlapping IP/time windows, merge stats, tombstone duplicates. Require account re-linking if ambiguous. |
| ELO corruption from partial writes | HIGH | Rebuild ELO from `game_results` table (source of truth) — replay all completed/forfeited games chronologically, recompute ELO from initial 1200 for all affected players. |
| Render free Postgres deleted (30-day expiry) | HIGH | Restore from Render's last automated backup (if on paid tier). If free tier: data is gone. Prevention is the only real option. |
| Leaderboard query locking DB | LOW | Kill the query; add the `leaderboard_cache` materialized view as a hotfix; deploy behind a feature flag. |
| Smurf account detected post-ranking | MEDIUM | Nullify the smurf account's ranked results; run ELO rebuild for all players who played against it; communicate to affected players. |
| Zombie presence showing offline users as online | LOW | Force-expire all presence keys; restart presence TTL refresh cycle; no data loss. |
| TOAST bloat from replay blobs | MEDIUM | Migrate existing blob rows to event log format via a background job; `VACUUM FULL` the old table; swap the application write path. |
| OAuth callback CSRF exploit discovered | HIGH | Immediately revoke all sessions; force re-authentication; audit `oauth_state_log` if implemented; patch callback handler; notify affected users. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Guest identity fragmentation (Pitfall 1) | Foundation — Persistence & Identity | No orphan guest rows after 100 sign-up test cycles; guest→OAuth link is idempotent |
| ELO on disconnects/forfeits (Pitfall 2) | Retention — Ranked mode | ELO write inside game_results transaction; forfeit = loss verified via integration test |
| Matchmaking queue race (Pitfall 3) | Retention — Public quick-match | Concurrent queue join stress test: 100 simultaneous pairs, zero duplicate rooms |
| Render Postgres pool exhaustion (Pitfall 4) | Foundation — Persistence (Day 1) | Single pool export verified; pool max set; SSL confirmed; paid tier confirmed |
| OAuth CSRF / session fixation (Pitfall 5) | Foundation — Google OAuth | Automated test verifies `state` mismatch returns 400; session ID changes post-login |
| Replay TOAST bloat (Pitfall 6) | Spectate & Share — Replays | Schema uses event log table; no JSONB replay blob column in schema |
| Zombie presence (Pitfall 7) | Social — Friends & Presence | Presence TTL expires within 45s of browser close; friends list refreshes accordingly |
| Leaderboard full-table scan (Pitfall 8) | Retention — Leaderboards | `EXPLAIN ANALYZE` shows index scan; p95 < 200ms at 10k rows |
| fire/useAbility rate limit absent (Pitfall 9 + CONCERNS.md #2/#7) | Foundation — must ship before public matchmaking | Rate limit integration test: > 2 fire/s triggers disconnect; turn-clock race guarded |
| Smurfing via guest accounts (Pitfall 10) | Retention — Ranked mode | Ranked queue rejects unauthenticated sockets; placement requirement enforced |
| Tournament bracket race (Pitfall 11) | Spectate & Share — Tournaments | Bracket generation is idempotent; concurrent generate requests produce one bracket |
| CONCERNS.md #3 (profile/chat XSS) | Foundation — same phase as persistent usernames | Stored profile names HTML-escaped in DB; CSP header present |
| CONCERNS.md #6 (doShot null crash) | Foundation — before public matchmaking | `doShot()` has null guards; malformed payload returns error event, not server crash |
| CONCERNS.md #8 (unbounded room map) | Foundation — before public matchmaking | Abandoned rooms cleaned up after grace window; map size bounded by active game count |

---

## Sources

- Render PostgreSQL connection pooling docs: https://render.com/docs/postgresql-connection-pooling
- Render free Postgres limits (30-day expiry): https://render.com/docs/free
- Socket.IO handling disconnections tutorial: https://socket.io/docs/v4/tutorial/handling-disconnections
- Socket.IO horizontal scaling step 9: https://socket.io/docs/v4/tutorial/step-9
- Auth0 OAuth state parameter / CSRF: https://auth0.com/docs/secure/attack-protection/state-parameters
- Auth0 PKCE + state layered security: https://auth0.com/blog/demystifying-oauth-security-state-vs-nonce-vs-pkce/
- Google OAuth web server flow + state validation: https://developers.google.com/identity/protocols/oauth2/web-server
- ELO K-factor variable rate (Board Game Arena model): https://opisthokonta.net/?p=1412
- ELO manipulation vectors: https://tonysheng.substack.com/p/elo-rating-systems-and-how-to-manipulate
- FACEIT smurf detection and linked-account penalties: https://support.faceit.com/hc/en-us/articles/16873826012060-Anti-Cheat-Smurf-Detection-FAQ
- VALORANT smurf detection systems: https://playvalorant.com/en-gb/news/dev/valorant-systems-health-series-smurf-detection/
- Postgres JSONB TOAST performance cliff: https://pganalyze.com/blog/5mins-postgres-jsonb-toast
- Postgres JSONB TOAST update duplication: https://www.snowflake.com/en/engineering-blog/postgres-jsonb-columns-and-toast/
- Event storage in Postgres (event log pattern): https://dev.to/kspeakman/event-storage-in-postgres-4dk2
- WebSocket zombie connections and heartbeats: https://websocket.org/guides/heartbeat/
- Presence detection with WebSockets: https://oneuptime.com/blog/post/2026-02-02-websocket-presence-detection/view
- Account linking security (social login): https://www.loginradius.com/blog/identity/account-linking-social-login-ux
- Multiplayer backend authentication patterns: https://blog.catenatools.com/building-a-multiplayer-backend-authentication/
- Matchmaking tips for game developers (GameAnalytics): https://www.gameanalytics.com/blog/matchmaking-tips-for-game-developers
- Disconnect ranked penalties (The Finals): https://id.embark.games/the-finals/support/faq/217-disconnecting-during-ranked-match---pc-console
- rate-limiter-flexible for Socket.IO: https://github.com/fabosch/socket.io-ratelimiter
- Postgres leaderboard RANK() query: https://blog.programster.org/postgresql-leaderboard-query-example
- Large offset paging performance (MongoDB vs Redis vs Postgres): https://www.openmymind.net/Paging-And-Ranking-With-Large-Offsets-MongoDB-vs-Redis-vs-Postgresql/

---
*Pitfalls research for: realtime multiplayer game — accounts, matchmaking, ranked ELO, persistence*
*Researched: 2026-06-01*
