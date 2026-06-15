# Phase 19: Mobile-Native App Shell - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 2 (both modified, no new files — single monolithic JSX/CSS pair)
**Analogs found:** 6 / 6 artifacts (all analogs found in-file — this is a self-referential restructure)

This phase is a CLIENT-ONLY restructure of exactly two existing files: `public/app.jsx` and `public/style.css`. There are no "new files" in the traditional sense — instead, new COMPONENTS/HOOKS/CSS-BLOCKS are added to these files, and existing screen-render blocks are refactored to use them. The "analogs" below are existing patterns within the SAME files that the new artifacts must mirror.

## File Classification

| New/Modified Artifact | Role | Data Flow | Closest Analog | Match Quality |
|------------------------|------|-----------|-----------------|----------------|
| `ScreenShell` component (app.jsx, new, near line 860) | component (wrapper/layout) | request-response (render props) | `BottomSheet` component (app.jsx:860-891) | role-match (overlay-style wrapper component with header/body/close regions) |
| `useMainHeight` hook (app.jsx, new) | hook | event-driven (ResizeObserver) | none existing — first ResizeObserver usage in codebase | no analog |
| `useKeyboardInset` hook (app.jsx, new) | hook | event-driven (visualViewport) | `useEffect` cleanup pattern in `Battle` turn-timer effect (app.jsx:1759-1761) | role-match (effect+cleanup shape only) |
| `.shell-header`/`.shell-main`/`.shell-footer` CSS regions (style.css, new) | config (CSS layout) | transform (layout) | `.topbar` (style.css:88) + `.roombar` (style.css:689-697) + `.chat-panel` (style.css:701-707) | role-match (glass-panel chrome blocks) |
| Root viewport lock `html,body{height:100dvh;overflow:hidden}` (style.css, modify lines 24/31) | config (CSS root) | transform | existing `html,body{height:100%}` (style.css:24) + `body{min-height:100dvh; overscroll-behavior:none}` (style.css:31,37) | exact (same selectors, modify values) |
| `--cell` height-cap formula (style.css, modify line 5) | config (CSS token) | transform | existing `--cell: min(32px, calc((100vw - 40px) / 11))` (style.css:5) | exact (extend same custom property) |
| Battle screen refactor: scoreboard→header, boards→main, powers/chat chips→footer, `.log` REMOVED (D-07) (app.jsx, modify `Battle` render ~1771-1856) | component (screen) | request-response | `Battle` function itself (app.jsx:1771-1856) — refactor in place | exact (self) |
| Lobby screen refactor: `.topbar`→shell-header (app.jsx, modify App() render ~3892-3926, 3963) | component (screen) | request-response | `App()` topbar block (app.jsx:3892-3926) | exact (self) |
| Room/Placement screen refactor: room-banner→header, confirm button→footer (app.jsx, modify ~4004-4030+) | component (screen) | request-response | `.room-banner` block (app.jsx:4030) + room screen render (app.jsx:4004-4024) | exact (self) |
| Profile screen refactor: header+back, `.profile-actions`→footer (app.jsx, `ProfileView`, modify ~2940-2965) | component (screen) | request-response | `.profile-actions` block (app.jsx:2951-2965) | exact (self) |
| History screen refactor: `.history-header`→shell-header, list→shell-main (app.jsx, `MatchHistory`, modify ~2583-2609) | component (screen) | CRUD (paginated list + IntersectionObserver) | `.history-header`/`.history-list` block (app.jsx:2585-2609) + sentinel `IntersectionObserver` (app.jsx:2575-2581) | exact (self) |
| Friends screen refactor: `.friends-header`→shell-header (app.jsx, `FriendsList`, modify ~2396-2401+) | component (screen) | CRUD | `.friends-header` block (app.jsx:2396-2401) | exact (self) |
| Queue screen refactor: title→header, timer→main, cancel→footer (app.jsx, modify ~3965-3981) | component (screen) | request-response | queue screen block (app.jsx:3965-3981) | exact (self) |
| `navigate()` direction-tracking wrapper + `.screen-enter-forward/back` CSS (app.jsx new fn + style.css new rules) | utility / config | event-driven | `setScreen(...)` calls throughout `App()` (app.jsx:3963-4000) + reduced-motion block (style.css:490-493) | role-match |
| New i18n key `shell.powersToggle` (app.jsx I18N object, EN ~line 72-area, VI ~line 264-area) | config (i18n) | transform | `history.back` key pair (app.jsx:72 EN / app.jsx:264 VI) | exact |
| `.footer-note` relocation to avatar menu/About overlay (app.jsx ~4141, AvatarMenu component) | component | event-driven | `AvatarMenu` items block (style.css:667-687 CSS; app.jsx AvatarMenu component near ProfileChip ~2237) | role-match |

## Pattern Assignments

### `ScreenShell` component (app.jsx, new — place near line 860, before/after `BottomSheet`)

**Analog:** `BottomSheet` (app.jsx:860-891)

**Why this analog:** It's the only existing component in the codebase that wraps arbitrary `children` in a structured shell with distinct named regions (title bar + close + body), uses `useRef` for a DOM node, and is reused across multiple screens. `ScreenShell` follows the same "wrapper component with named slot props + ref-based DOM measurement" shape.

**Core pattern to copy** (app.jsx:860-891):
```jsx
function BottomSheet({ open, onClose, title, children }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    function handleKey(e) { if (e.key === "Escape") onCloseRef.current(); }
    document.addEventListener("keydown", handleKey);
    const timer = setTimeout(() => {
      if (panelRef.current) {
        const el = panelRef.current.querySelector("input, button, [tabindex]");
        if (el) el.focus();
      }
    }, 100);
    return () => { document.removeEventListener("keydown", handleKey); clearTimeout(timer); };
  }, [open]);
  return (
    <div className={"bottom-sheet-overlay" + (open ? " open" : "")} ...>
      <div className="bottom-sheet-panel" ref={panelRef} role="dialog" ...>
        <div className="bottom-sheet-title">{title}</div>
        <button className="bottom-sheet-close" onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  );
}
```

**Apply as:**
```jsx
function ScreenShell({ header, footer, children, screenKey, direction }) {
  const mainRef = useRef(null);
  useMainHeight(mainRef);
  return (
    <>
      {header && <div className="shell-header">{header}</div>}
      <div className={"shell-main" + (direction ? " screen-enter-" + direction : "")} ref={mainRef} key={screenKey}>
        {children}
      </div>
      {footer && <div className="shell-footer">{footer}</div>}
    </>
  );
}
```

**Naming/conventions to follow:**
- camelCase props (`onClose`, `screenKey`) — matches `BottomSheet`'s `onClose`/`onToggle` convention.
- Optional regions rendered with `&&` guards (`header && <div ...>`) — matches `{balance !== null && <span ...>}` pattern (app.jsx:3905).
- No new files — component defined inline in `app.jsx`, near other small structural components (`PlayerCard`, `TurnRing`, `BottomSheet` cluster ~1562-891... actually BottomSheet at 860, PlayerCard/TurnRing at 1562/1581 — place `ScreenShell` near `BottomSheet` since both are generic UI wrappers).

---

### `useMainHeight` hook (app.jsx, new)

**Analog:** none existing — first `ResizeObserver` usage in this codebase. Use RESEARCH.md Pattern 2 verbatim (already vetted against codebase conventions: plain `function useXxx(ref) { useEffect(...) }`, no external libs).

**Closest stylistic analog — effect/cleanup shape** (Battle turn-timer effect, app.jsx:1759-1766):
```jsx
useEffect(() => {
  // ... interval/observer setup ...
  return () => clearInterval(iv); // cleanup
}, [turnDeadline, turnDur]);
```

Follow this `useEffect(() => { setup; return cleanup; }, [deps])` shape with `ResizeObserver`:
```jsx
function useMainHeight(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      const set = () => { el.style.setProperty("--main-h", el.clientHeight + "px"); };
      set();
      window.addEventListener("resize", set);
      return () => window.removeEventListener("resize", set);
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) el.style.setProperty("--main-h", entry.contentRect.height + "px");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
```

---

### `useKeyboardInset` hook (app.jsx, new — for `.chat-panel`, MOBILE-12)

**Analog:** Battle turn-timer `useEffect` (app.jsx:1759-1766) for the effect/cleanup shape; `.chat-panel` itself (style.css:701-707) is the element being repositioned.

**Guard pattern to copy** — codebase consistently no-ops optional browser APIs gracefully (CLAUDE.md: "optional features gracefully degradable"). Mirror the Redis/localStorage try/no-op style used elsewhere (`store.js` pattern: feature-detect, return early if unavailable):
```jsx
function useKeyboardInset(panelRef) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !panelRef.current) return; // graceful no-op, matches CLAUDE.md convention
    function reposition() { /* ... RESEARCH.md Pattern 3 ... */ }
    vv.addEventListener("resize", reposition);
    vv.addEventListener("scroll", reposition);
    return () => { vv.removeEventListener("resize", reposition); vv.removeEventListener("scroll", reposition); };
  }, [panelRef]);
}
```

---

### `.shell-header` / `.shell-main` / `.shell-footer` CSS (style.css, new — add near `.bottom-sheet-*` block, after line 277, or near `.roombar`/`.chat-panel` ~689-719)

**Analog 1 — header chrome:** `.topbar` (style.css:88)
```css
/* Source: public/style.css line 88 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px 18px; padding-top: calc(6px + env(safe-area-inset-top, 0px)); gap:8px; }
```
Copy the `padding-top: calc(Npx + env(safe-area-inset-top, 0px))` idiom verbatim for `.shell-header`'s safe-area handling (UI-SPEC: `padding-top: calc(8px + env(safe-area-inset-top, 0px))`).

**Analog 2 — glass panel treatment:** `.lobby, .room-banner, .modal, .log` shared rule (style.css:101-106)
```css
/* Source: public/style.css lines 101-106 */
.lobby, .room-banner, .modal, .log {
  background: var(--panel);
  border: 1px solid var(--panel-brd);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
}
```
`.shell-header` and `.shell-footer` should ADD themselves to this shared selector list (or duplicate the 4 declarations) — this is the established "glass chrome" treatment token-for-token.

**Analog 3 — footer chrome with bottom safe-area + border-top:** `.chat-panel` (style.css:701-707) and `.roombar` (style.css:689-693)
```css
/* Source: public/style.css lines 701-707 */
.chat-panel {
  position:fixed; left:50%; bottom:0; transform:translateX(-50%);
  width:min(440px, 100%); display:flex; flex-direction:column;
  background:var(--panel); border:1px solid var(--panel-brd); border-bottom:none;
  border-radius:14px 14px 0 0; box-shadow:0 -8px 30px rgba(0,0,0,.45); z-index:50;
  max-height:70vh; max-height:70dvh;
}
```
Use the `border-top: 1px solid var(--panel-brd)` + `--panel` background combo (also seen in `.roombar`, style.css:691) for `.shell-footer`'s top edge.

**Apply (from RESEARCH.md Pattern 1, already vetted):**
```css
.shell-header {
  flex: none; padding: 8px 14px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  background: var(--panel); border: 1px solid var(--panel-brd);
  backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
  display: flex; align-items: center; gap: 8px;
}
.shell-main { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 14px; }
.shell-footer {
  flex: none; padding: 10px 14px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  background: var(--panel); border-top: 1px solid var(--panel-brd);
  backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
}
```

---

### Root viewport lock (style.css, modify lines 24, 31, 37)

**Analog:** the EXACT same selectors, current values (style.css:24, 31-37):
```css
/* Source: public/style.css line 24 */
html, body { height: 100%; }
```
```css
/* Source: public/style.css lines 26-42 (relevant subset) */
body {
  margin: 0;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  ...
  min-height: 100dvh;
  overflow-x: hidden;
  ...
  overscroll-behavior: none;
  ...
}
```

**Change:** `html, body { height: 100%; }` → add `height: 100vh; height: 100dvh; overflow: hidden;` (source-order fallback per RESEARCH.md). Change `body { min-height: 100dvh; }` → `body { height: 100dvh; overflow: hidden; }`. `overscroll-behavior: none` and the `env(safe-area-inset-*)` body padding (style.css:28) STAY — already correct, do not duplicate.

Also modify `#root, .app` (style.css:73) to become a flex column:
```css
/* Source: public/style.css line 73 — current */
.app { max-width: 480px; margin: 0 auto; padding: 14px 14px 60px; position: relative; z-index: 1; }
```
→ add `display:flex; flex-direction:column; height:100vh; height:100dvh;` and change padding from `14px 14px 60px` to `14px` sides only (footer-note's 60px bottom reserve is removed per Pitfall 5 — relocate `.footer-note`, see below).

---

### `--cell` height-cap formula (style.css, modify line 5)

**Analog:** exact same custom property, current value:
```css
/* Source: public/style.css line 5 */
--cell: min(32px, calc((100vw - 40px) / 11));
```

**Apply:**
```css
--cell: min(
  32px,
  calc((100vw - 40px) / 11),
  calc((var(--main-h, 100vh) - 220px) / 11)
);
```
The `220px` reserved-space constant is an estimate (RESEARCH.md A5) — tune against the actual rendered `.scoreboard` (style.css:434-441, `margin:0 auto 14px; padding:8px 12px`) + `.shell-footer` heights at 360×640.

---

### Battle screen refactor (app.jsx, modify `Battle` function ~1771-1856)

**Analog:** the `Battle` function itself — refactor in place, region-by-region per UI-SPEC mapping table.

**Current structure** (app.jsx:1771-1856):
```jsx
return (
  <div>
    <div className="scoreboard">...PlayerCard + TurnRing...</div>   {/* → shell-header */}
    <div className={"boards tab-" + tab + (shake ? " shake" : "")}>  {/* → shell-main */}
      <div className="board-wrap wrap-enemy">
        <PowerBar inv={inv} aim={aim} onPower={onPower} myTurn={myTurn} />  {/* → footer chip + BottomSheet */}
        ...Grid (enemy)...
      </div>
      <div className="board-wrap wrap-own">...Grid (own)...</div>
    </div>
    {aim === "cross" && <div className="aim-hint">...}
    <div className="log">...</div>  {/* D-07: REMOVE ENTIRELY — no chip, no sheet */}
  </div>
);
```

**Target structure:**
- `.scoreboard` block (app.jsx:1773-1819, including `PlayerCard`/`TurnRing`/opp-stats-popup) → passed as `header` prop to `ScreenShell`. Compact via CSS to fit `.shell-header` height.
- `.boards` block (app.jsx:1820-1849) → `ScreenShell` `children` (rendered inside `.shell-main`).
- `<PowerBar inv={inv} aim={aim} onPower={onPower} myTurn={myTurn} />` (app.jsx:1823) → MOVE out of `.board-wrap`, render its buttons inside a `<BottomSheet>` triggered by a new `.shell-footer` chip (D-05: Powers + Chat only).
- `.log` block (app.jsx:1851-1854) → **DELETE** per D-07. Also remove `log`/`setLog`/`addLog` writes if they become fully unused (verify — `log` state may still be referenced for accessibility/debug; if so keep state but drop the JSX block and footer chip).
- `.aim-hint` (app.jsx:1850) stays inside `.shell-main`.

**PowerBar function signature for reuse** (app.jsx:1605):
```jsx
function PowerBar({ inv, aim, onPower, myTurn }) {
```
No signature change needed — only its RENDER LOCATION moves (from inline `.board-wrap` to inside a `<BottomSheet title={t("shell.powersToggle")}>`).

---

### Lobby screen refactor (app.jsx, modify `App()` ~3892-3926, 3963)

**Analog:** existing `.topbar` block (app.jsx:3892-3926):
```jsx
<div className="topbar">
  <div className="logo">
    <div className="badge">⚓</div>
    <div><h1>BATTLESHIP</h1><small>{t("topbar.tagline")}</small></div>
  </div>
  <div className="topbar-right" style={{ position: "relative" }}>
    {/* ProfileChip / AvatarMenu / sound toggle */}
  </div>
</div>
```

**Apply:** This entire block becomes the `header` prop passed to `ScreenShell` for the lobby screen (UI-SPEC: "the header is the existing `.topbar` ... unchanged content, just now pinned as the shell header region"). No content changes — only relocate from top-level `.app` child to `ScreenShell`'s `header` slot. `Lobby` component (app.jsx:3963) becomes `ScreenShell` `children`.

---

### Room/Placement screen refactor (app.jsx, modify ~4004-4030+)

**Analog:** `.room-banner` (app.jsx:4030, referenced) + room screen block (app.jsx:4004-4024):
```jsx
{screen === "room" && (
  <div className="lobby">
    <h2>{t("room.title")}</h2>
    <p className="sub">{t("room.sub")}</p>
    <div className="room-code-box" ...>...</div>
    ...
    {oppPresent && (
      <button className="btn primary" style={{marginTop:16}} onClick={() => setScreen("placement")}>{t("room.startPlacement")}</button>
    )}
  </div>
)}
```

**Apply:** Title "Room" + new back button → `header` (back button routes through `leaveRoom()` per UI-SPEC copywriting contract, NOT a silent `setScreen("lobby")`). Room code box / invite link / waiting pill → `ScreenShell` children. "Start placement" button → could stay in `.shell-main` (UI-SPEC per-screen table doesn't list a room footer) OR move to `shell-footer` — planner's discretion, but if moved, follow the `.shell-footer` primary-button pattern established for Placement's "Confirm" button.

For Placement, `.room-banner` (status pill/room code, compacted) → `header`; placement board + power-up shop row → `.shell-main`; existing "Confirm placement" button → `.shell-footer` (UI-SPEC explicit).

**Back-button leave flow to copy** (app.jsx:3827-3831):
```jsx
function leaveRoom() { setConfirmLeave(true); }
function doLeave() {
  setConfirmLeave(false);
  // ... resetToLobby() etc.
}
```
And the modal (app.jsx:4121-4134, referenced by line numbers in grep):
```jsx
{confirmLeave && (
  <div className="...">
    ...
    <button className="btn primary" onClick={doLeave}>{vsBot ? t("common.exit") : t("common.leaveRoom")}</button>
  </div>
)}
```
Shell-header back buttons on `room`/`placement`/`battle` call `leaveRoom()` (NOT `setScreen("lobby")`) — exact same handler as the current `.roombar` leave button (app.jsx:3935).

---

### Profile screen refactor (`ProfileView`, modify ~2940-2965)

**Analog:** `.profile-actions` block (app.jsx:2951-2965):
```jsx
<div className="profile-actions">
  {isOwn && onSignOut && (
    <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onSignOut}>{t("auth.signOut")}</button>
  )}
  {!isOwn && friendStatus === "accepted" && (
    <button className="btn primary" style={{ padding: "8px 20px" }} onClick={() => onChallengeFriend && onChallengeFriend(userId)}>
      ⚔️ {t("challenge.send")}
    </button>
  )}
  ...
</div>
```

**Apply:** `.profile-actions` content → `footer` prop of `ScreenShell` verbatim (button markup unchanged, just relocated). Profile title + back button (existing `onBack` prop, app.jsx:3987 `onBack={() => setScreen("lobby")}`) → `header` (using `history.back` i18n key per UI-SPEC).

---

### History screen refactor (`MatchHistory`, modify ~2583-2609)

**Analog:** `.history-header`/`.history-list` (app.jsx:2585-2609):
```jsx
<div className="history-view">
  <div className="history-header">
    <button className="btn ghost compact" onClick={onBack}>←</button>
    <div className="history-header-text">
      <h2 className="history-title">{t("history.title")}</h2>
      <span className="history-total">{total} {LANG === "vi" ? "trận đấu" : "matches"}</span>
    </div>
  </div>
  <div className="history-list">
    {matches.map(m => ( ... ))}
  </div>
</div>
```

**Apply:** `.history-header` → `header` prop (back button reuses `history.back` i18n key, matches existing `← ` + `t("history.back")` idiom seen in friends-header, app.jsx:2399). `.history-list` → `ScreenShell` children (this is the screen UI-SPEC explicitly allows to scroll within `.shell-main`).

**IntersectionObserver sentinel** (app.jsx:2575-2581) — verify `root` option per RESEARCH.md Open Question 1:
```jsx
/* Source: public/app.jsx lines 2575-2581 */
const obs = new IntersectionObserver((entries) => {
  const entry = entries[0];
  if (entry.isIntersecting && hasMore && !loading) {
    setPage(p => p + 1);
  }
}, { threshold: 0.1 });
obs.observe(sentinelRef.current);
```
If no `root` specified, defaults to nearest scrollable ancestor in modern browsers, but VERIFY — may need `root: mainRef.current` passed explicitly once `.shell-main` (not `body`) is the scroll container.

---

### Friends screen refactor (`FriendsList`, modify ~2396-2401+)

**Analog:** `.friends-header` (app.jsx:2396-2401), which is ALSO the model `history.back` usage referenced by UI-SPEC for ALL new shell headers:
```jsx
/* Source: public/app.jsx lines 2396-2401 */
<div className="friends-screen">
  <div className="friends-header">
    <button className="btn ghost compact" onClick={onBack}>← {t("history.back")}</button>
    <h2>👥 {t("friends.title")} ({friends.length})</h2>
  </div>
```
This is the CANONICAL "← {t('history.back')}" + title pattern to copy for ALL new `shell-header` back buttons across room/placement/profile/history/friends. `.friends-header` → `header` prop; search + friend list → `.shell-main` children (may scroll, UI-SPEC allows).

---

### Queue screen refactor (modify ~3965-3981)

**Analog:** queue block itself (app.jsx:3965-3981):
```jsx
{screen === "queue" && (
  <div className="lobby">
    <h2>{queueType === "wagered" ? t("queue.titleWagered") : t("queue.titleFree")}</h2>
    <p className="sub">{t("queue.sub")}</p>
    ...
    <div className="queue-timer">...</div>
    ...
    <span className="status-pill pill-wait">{t("queue.searching")}</span>
    <div style={{ height: 20 }} />
    <button className="btn ghost" onClick={handleLeaveQueue}>{t("queue.cancel")}</button>
  </div>
)}
```

**Apply:** Title (`<h2>`) → `header` (no back button per UI-SPEC — "Cancel is the action"). Timer + searching pill → `.shell-main` children. `handleLeaveQueue` cancel button → `.shell-footer`.

---

### `navigate()` direction wrapper + transition CSS (app.jsx new fn + style.css new rules)

**Analog — state-setter call sites:** `setScreen(...)` calls throughout `App()` (app.jsx:3963-4000, dozens of call sites). Per RESEARCH.md Pattern 4, either wrap all calls with a `navigate()` helper or derive direction by comparing old/new screen names against a fixed hierarchy array. Given the codebase's "guard-clause, minimal abstraction" convention (CLAUDE.md), prefer the SIMPLER derive-from-comparison approach over rewriting every `setScreen` call site.

**Analog — reduced-motion CSS block:** existing block (style.css:490-493):
```css
/* Source: public/style.css lines 490-493 */
@media (prefers-reduced-motion: reduce) {
  .cell.hit, .cell.miss, .cell.sunk, .cell.hit::after, .boards.shake { animation: none !important; }
  .grid.enemy .cell.shootable:hover { transform: none; }
}
```
Add a SEPARATE rule for `.shell-main.screen-enter-*` in the SAME `@media (prefers-reduced-motion: reduce)` block (don't merge into the `.cell`/`.boards` selector list — per RESEARCH.md explicit guidance) OR add alongside the existing `@media (prefers-reduced-motion: no-preference)` block at style.css:581 (also referenced for screen transitions in RESEARCH.md).

---

### New i18n key `shell.powersToggle` (app.jsx I18N object)

**Analog:** `history.back` key pair — EN (app.jsx:72) / VI (app.jsx:264):
```jsx
/* Source: public/app.jsx line 72 (EN block) */
"history.open": "📋 History", "history.title": "Match History", "history.empty": "No battles yet. ⚓", "history.back": "← Back",
```
```jsx
/* Source: public/app.jsx line 264 (VI block) */
"history.open": "📋 Lịch sử", "history.title": "Lịch sử trận đấu", "history.empty": "Chưa có trận đấu nào. ⚓", "history.back": "← Quay lại",
```

**Apply:** Add `"shell.powersToggle": "⚡ Powers"` to the EN object (near `history.*` keys, ~line 72) and `"shell.powersToggle": "⚡ Vũ khí"` to the VI object (~line 264). Follow the SAME flat key-naming convention (`"namespace.camelCaseName": "string"`), comma-separated within the same logical grouping line. D-07 means do NOT add `shell.logToggle` (UI-SPEC originally specified it — explicitly dropped).

---

### `.footer-note` relocation (app.jsx ~4141; AvatarMenu near app.jsx:2237 region; style.css `.avatar-menu-item` 667-687)

**Analog:** `.footer-note` current render (app.jsx:4141):
```jsx
/* Source: public/app.jsx line 4141 */
<div className="footer-note">{t("footer")}</div>
```
and its CSS (style.css:578):
```css
/* Source: public/style.css line 578 */
.footer-note { text-align:center; color:#5878a0; font-size:12px; margin-top:32px; }
```

**Avatar menu item analog** (style.css:667-687 region — `.avatar-menu-item`, `.avatar-menu-item.destructive`):
```css
/* Source: public/style.css lines 685-687 */
.avatar-menu-item.destructive:hover { border-left-color:var(--hit); }
.avatar-menu-item:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
.avatar-menu-sep { border-top:1px solid var(--panel-brd); margin:4px 0; }
```

**Apply (planner's discretion per RESEARCH.md Open Question 2):** Add a new `.avatar-menu-item` (non-destructive) labeled "About"/"Giới thiệu" that opens a small modal reusing `.modal`/`.overlay` classes (style.css:101, shared with `.lobby`/`.room-banner`/`.log`) containing `{t("footer")}`. This MUST be sequenced into the SAME plan/task that lands the root `overflow:hidden` lock (Pitfall 5) — `.footer-note` becomes unreachable the moment page-scroll is removed if not relocated first.

---

## Shared Patterns

### Glass-panel chrome (background/border/blur)
**Source:** `public/style.css` lines 101-106 (`.lobby, .room-banner, .modal, .log`)
**Apply to:** `.shell-header`, `.shell-footer` (both new region classes)
```css
background: var(--panel);
border: 1px solid var(--panel-brd);
backdrop-filter: blur(14px) saturate(1.2);
-webkit-backdrop-filter: blur(14px) saturate(1.2);
```

### Safe-area inset padding idiom
**Source:** `public/style.css` line 88 (`.topbar`)
**Apply to:** `.shell-header` (top), `.shell-footer` (bottom)
```css
padding-top: calc(8px + env(safe-area-inset-top, 0px));   /* shell-header */
padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); /* shell-footer */
```

### Back-button + title header pattern
**Source:** `public/app.jsx` lines 2396-2401 (`.friends-header`), reused at lines 2585-2591 (`.history-header`)
**Apply to:** All new `shell-header` content for room, placement, profile, history, friends
```jsx
<button className="btn ghost compact" onClick={onBack}>← {t("history.back")}</button>
<h2>{title}</h2>
```
For `room`/`placement`/`battle`, `onBack` must be `leaveRoom()` (app.jsx:3827) not a bare `setScreen("lobby")`.

### BottomSheet reuse (no new overlay primitives)
**Source:** `public/app.jsx` lines 860-891 + `public/style.css` lines 260-277
**Apply to:** Battle screen's "Powers" footer chip (D-05). Verbatim reuse — pass `PowerBar`'s buttons as `children`, `title={t("shell.powersToggle")}`.

### Effect + cleanup hook shape
**Source:** `public/app.jsx` lines 1759-1766 (Battle turn-timer `useEffect`)
**Apply to:** `useMainHeight`, `useKeyboardInset` (both new hooks)
```jsx
useEffect(() => {
  // setup (ResizeObserver / visualViewport listener)
  return () => { /* cleanup: disconnect/removeEventListener */ };
}, [deps]);
```

### Graceful no-op for optional browser APIs
**Source:** CLAUDE.md "Patterns to Follow" — Redis/localStorage/Web Audio all no-op if unavailable (store.js pattern)
**Apply to:** `useKeyboardInset` (`if (!window.visualViewport) return;`), `useMainHeight` (`if (typeof ResizeObserver === "undefined") { /* window.resize fallback */ }`)

## No Analog Found

| File/Artifact | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `useMainHeight` (ResizeObserver usage) | hook | event-driven | First `ResizeObserver` usage in codebase — no existing analog; use RESEARCH.md Pattern 2 verbatim, follow effect/cleanup shape from Battle turn-timer |
| Screen-transition CSS keyframes (`slide-in-fwd`/`slide-in-back`/`cross-fade`) | config (CSS animation) | transform | No existing screen-to-screen transition exists (current `setScreen` is an instant swap); use RESEARCH.md Pattern 4 verbatim, placed near existing `@media (prefers-reduced-motion: ...)` blocks (style.css:490, 581) |

## Metadata

**Analog search scope:** `public/app.jsx` (3956 lines — sections read: 1-90, 860-891, 1760-1860, 2380-2420, 2575-2610, 2940-2965, 3795-3830, 3880-4030), `public/style.css` (full structural grep + sections 1-110, 255-285, 430-495, 685-720)
**Files scanned:** 2 (the only files this phase touches)
**Pattern extraction date:** 2026-06-15
