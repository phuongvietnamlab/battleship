# Phase 13: Match History — Research

**Researched:** 2026-06-05
**Status:** Ready to inform planning

---

## 1. API Design: Offset Pagination with Filters

**Use: Offset pagination (`?page=1&limit=20`)**, not cursor-based.

Reasoning:
- The dataset (a user's match history) is modest — hundreds/low-thousands of rows, not millions.
- Offset pagination is simple to implement and sufficient for "load more on scroll" UX.
- The existing `ended_at DESC` index supports efficient `OFFSET/LIMIT` with predictable ordering.
- Cursor-based adds complexity for no benefit at this scale.

### Endpoint

```
GET /api/matches?page=1&limit=20&result=all&mode=all&wager=all
```

**Parameters:**
| Param | Values | Default |
|-------|--------|---------|
| `page` | 1-indexed integer | 1 |
| `limit` | 1–50 (cap) | 20 |
| `result` | `all` / `win` / `loss` | `all` |
| `mode` | `all` / `classic` / `advance` | `all` |
| `wager` | `all` / `has` / `none` | `all` |

**Response:**
```json
{
  "matches": [
    {
      "id": 123,
      "result": "win",
      "opponent": { "id": 5, "displayName": "Hùng", "avatarUrl": null },
      "stake": 50,
      "pointsDelta": 45,
      "mode": "classic",
      "reason": "normal",
      "startedAt": "2026-06-04T14:30:00Z",
      "endedAt": "2026-06-04T14:45:00Z"
    }
  ],
  "total": 87,
  "page": 1,
  "hasMore": true
}
```

**Auth guard:** Same pattern as `/api/wallet` — check `req.user?.id`, return 401 if absent.

**Page size recommendation: 20.** Small enough for fast response, large enough to fill a mobile scroll viewport 2-3x over.

---

## 2. SQL Query: Match List with Opponent JOIN

The key challenge: user can be `winner_id` OR `loser_id`. Use a single query with CASE expressions.

```sql
SELECT
  m.id,
  CASE WHEN m.winner_id = $1 THEN 'win' ELSE 'loss' END AS result,
  CASE WHEN m.winner_id = $1 THEN m.loser_id ELSE m.winner_id END AS opponent_id,
  u.display_name AS opponent_name,
  u.avatar_url AS opponent_avatar,
  m.stake,
  CASE WHEN m.winner_id = $1 THEN COALESCE(FLOOR(m.stake * 2 * 0.9), 0)
       ELSE -m.stake END AS points_delta,
  m.mode,
  m.reason,
  m.started_at,
  m.ended_at
FROM matches m
JOIN users u ON u.id = CASE WHEN m.winner_id = $1 THEN m.loser_id ELSE m.winner_id END
WHERE (m.winner_id = $1 OR m.loser_id = $1)
  -- Dynamic filter: result
  AND ($2 = 'all' OR ($2 = 'win' AND m.winner_id = $1) OR ($2 = 'loss' AND m.loser_id = $1))
  -- Dynamic filter: mode
  AND ($3 = 'all' OR m.mode = $3)
  -- Dynamic filter: wager
  AND ($4 = 'all' OR ($4 = 'has' AND m.stake > 0) OR ($4 = 'none' AND m.stake = 0))
ORDER BY m.ended_at DESC
LIMIT $5 OFFSET $6;
```

**Count query** (for `total` + `hasMore`):
```sql
SELECT COUNT(*) AS total
FROM matches m
WHERE (m.winner_id = $1 OR m.loser_id = $1)
  AND ($2 = 'all' OR ($2 = 'win' AND m.winner_id = $1) OR ($2 = 'loss' AND m.loser_id = $1))
  AND ($3 = 'all' OR m.mode = $3)
  AND ($4 = 'all' OR ($4 = 'has' AND m.stake > 0) OR ($4 = 'none' AND m.stake = 0));
```

**Index coverage:** The existing `IDX_matches_winner_id` and `IDX_matches_loser_id` indexes handle the WHERE clause. The `IDX_matches_ended_at` DESC index supports the ORDER BY. For a user with <1000 matches, this runs in <10ms.

**Points delta logic:**
- Win with stake: `floor(stake * 2 * 0.9)` (90% of pot — matches `recordMatch` payout logic)
- Loss with stake: `-stake` (the amount debited)
- No stake: `0`

---

## 3. Frontend Pattern: Adding a New Screen

**Current routing:** `App()` uses `const [screen, setScreen] = useState("lobby")` with conditional rendering:
```jsx
{screen === "lobby" && <Lobby ... />}
{screen === "profile" && <ProfileView ... />}
{screen === "battle" && ...}
```

**To add match history:**
1. Add `"history"` to the screen union: `// lobby | room | placement | battle | profile | queue | history`
2. Add conditional render block: `{screen === "history" && <MatchHistory ... />}`
3. Create `MatchHistory` component (function in app.jsx, same pattern as `ProfileView`)
4. Pass `onBack={() => setScreen("lobby")}` prop

**Lobby integration:** Add a button in the `lobby-footer` div, next to the "How to play" button. Only show when `authUser` is truthy:
```jsx
{authUser && <button className="btn ghost compact" onClick={() => setScreen("history")}>{t("history.title")}</button>}
```

**Data fetching pattern** (copy from ProfileView):
- `useEffect` on mount → `fetch("/api/matches?page=1&limit=20")` → set state
- Loading skeleton while fetching
- Error/empty states

---

## 4. Scroll Container: IntersectionObserver Load-More

**Use IntersectionObserver** — it's the standard approach for infinite scroll, already supported in all target browsers, and avoids the jank of scroll-event listeners.

### Implementation Pattern

```jsx
function MatchHistory({ authUser, onBack }) {
  const [matches, setMatches] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef(null);

  // Fetch page
  async function loadPage(p, filters) {
    setLoading(true);
    const params = new URLSearchParams({ page: p, limit: 20, ...filters });
    const res = await fetch("/api/matches?" + params);
    const data = await res.json();
    setMatches(prev => p === 1 ? data.matches : [...prev, ...data.matches]);
    setHasMore(data.hasMore);
    setLoading(false);
  }

  // IntersectionObserver on sentinel element
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        setPage(p => p + 1);
      }
    }, { threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading]);

  // Load when page changes
  useEffect(() => { loadPage(page, filters); }, [page, filters]);

  return (
    <div className="history-container" style={{ height: "calc(100vh - 56px)", overflowY: "auto" }}>
      {/* filter bar - sticky */}
      {/* match cards */}
      {/* sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && <Spinner />}
    </div>
  );
}
```

**Container styling:**
- Fixed height: `calc(100vh - header)` with `overflow-y: auto`
- Filter bar uses `position: sticky; top: 0; z-index: 2`
- No `body` scroll — matches the mobile-first no-page-scroll decision

---

## 5. Date Formatting: Relative Time

**Use relative time** ("2 giờ trước", "Hôm qua", "3 ngày trước") for recent matches, with absolute fallback for older entries.

### Rules:
| Age | Format |
|-----|--------|
| < 1 hour | "X phút trước" / "X min ago" |
| < 24 hours | "X giờ trước" / "X hours ago" |
| < 7 days | "X ngày trước" / "X days ago" |
| ≥ 7 days | "dd/MM/yyyy HH:mm" (absolute) |

### Implementation (no library needed):

```javascript
function formatMatchTime(isoStr) {
  const d = new Date(isoStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 60) return LANG === "vi" ? `${diffMin} phút trước` : `${diffMin}m ago`;
  if (diffHr < 24) return LANG === "vi" ? `${diffHr} giờ trước` : `${diffHr}h ago`;
  if (diffDay < 7) return LANG === "vi" ? `${diffDay} ngày trước` : `${diffDay}d ago`;
  // Absolute
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}
```

Reasoning: Relative time is the UX standard for activity feeds/match history in games (League of Legends, Chess.com, etc.). It provides instant context ("was that recent?") without mental date math.

---

## 6. Opponent Stats Query: Win Rate + Total Matches

For the opponent mini-profile popup (click avatar in battle screen):

```sql
SELECT
  COUNT(*) AS total_matches,
  COUNT(*) FILTER (WHERE winner_id = $1) AS wins
FROM matches
WHERE winner_id = $1 OR loser_id = $1;
```

Then compute on the server: `winRate = total > 0 ? Math.round((wins / total) * 100) : 0`

**Endpoint:** `GET /api/profile/:userId/stats` (or extend existing `/api/profile/:userId` response).

Recommendation: **Extend the existing `/api/profile/:userId` endpoint** to include real stats instead of the hardcoded `{ wins: 0, losses: 0, gamesPlayed: 0 }`. The profile endpoint already exists and the frontend already calls it. This is a one-line query addition.

Updated profile response `stats` field:
```json
{ "wins": 42, "losses": 18, "gamesPlayed": 60, "winRate": 70 }
```

The query is fast with existing indexes (winner_id, loser_id). For a player with 500 matches, this is two index scans aggregated in <5ms.

---

## 7. Additional Recommendations

### Empty State
When no matches exist, show a centered illustration/emoji + message:
- Vietnamese: "Chưa có trận đấu nào. Hãy bắt đầu trận đầu tiên! ⚓"
- English: "No battles yet. Start your first match! ⚓"
- Include a CTA button back to lobby.

### Animation/Transition
- Match cards: simple `opacity 0→1` + `translateY(8px→0)` on appear (CSS `@keyframes fadeSlideIn`)
- Screen transition: instant mount (no page transition animation) — consistent with existing ProfileView behavior
- Load-more spinner: small centered spinner below last card

### Filter Bar UX
- Use pill/chip buttons (similar to the existing `wager-chips` in lobby stake selector)
- Horizontally scrollable on mobile if needed, but 3 filter groups × 3 options = compact enough for one row

### Error Handling
- Network error on fetch → show inline retry button
- 401 during fetch → redirect to lobby (session expired)

### DB Function Location
Add `getMatchHistory(userId, filters, page, limit)` and `getUserStats(userId)` to `db.js` — consistent with existing `recordMatch` pattern. All SQL uses parameterized queries ($1, $2...).

---

## Summary: Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Pagination | Offset (`page` + `limit`) | Simple, sufficient scale |
| Page size | 20 | Fills mobile viewport, fast query |
| API auth | `req.user?.id` check → 401 | Same as `/api/wallet` |
| Query pattern | CASE + JOIN users | Single query, uses existing indexes |
| Frontend screen | `screen === "history"` | Same as ProfileView pattern |
| Scroll | IntersectionObserver sentinel | Standard, no scroll-event jank |
| Date format | Relative (<7d) → absolute | Game-standard UX |
| Opponent stats | Extend `/api/profile/:userId` | Already exists, just add real query |
| Component location | In `app.jsx` | Same-file pattern, no bundler |
