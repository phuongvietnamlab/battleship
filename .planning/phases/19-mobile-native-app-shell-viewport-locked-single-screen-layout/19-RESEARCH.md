# Phase 19: Mobile-Native App Shell - Research

**Researched:** 2026-06-15
**Domain:** CSS layout restructure (viewport-locked app shell) for an existing React 18 SPA — no new dependencies
**Confidence:** HIGH

## Summary

This phase is a pure client-side CSS/JSX restructure of `public/app.jsx` and `public/style.css` — no new npm packages, no server changes, no build-pipeline changes. The core technical primitives needed (`100dvh`, `env(safe-area-inset-*)`, `window.visualViewport`, `ResizeObserver`, CSS class-toggle transitions) are all native browser APIs with broad 2025/2026 support (Safari 15.4+, Chrome 108+ — ~95% global coverage per caniuse). The codebase already has `viewport-fit=cover` in `index.html`, `overscroll-behavior: none`, `env(safe-area-inset-*)` padding on `body` and `.topbar`, and a working `.bottom-sheet-overlay`/`.bottom-sheet-panel` pattern from Phase 9 — all directly reusable.

The riskiest areas are (1) `100dvh` reliability across iOS Safari versions (address-bar show/hide triggers `dvh` recalculation — generally desirable for this phase since the goal IS to track the visible viewport, but causes a visible reflow on scroll-driven bar collapse, which is why `overflow:hidden` + `overscroll-behavior:none` matter), (2) the `--cell` formula needing a JS-measured `--main-h` to cap board size by *available height*, which requires either `ResizeObserver` on `.shell-main` or a `resize`/`orientationchange` + `visualViewport.resize` listener combo, and (3) keeping `.chat-panel` (already `position:fixed; bottom:0`) glued above the keyboard via `visualViewport.resize` — a well-documented iOS quirk with a known fix pattern.

**Primary recommendation:** Build a single `ScreenShell` wrapper component (`.shell-header`/`.shell-main`/`.shell-footer`) reusing existing CSS classes and the Phase 9 `BottomSheet`; lock the root with `html,body{height:100dvh; overflow:hidden}` (replacing `min-height:100dvh`); measure `.shell-main` height via `ResizeObserver` into a `--main-h` CSS variable consumed by the existing `--cell` formula; drive screen transitions with a single CSS class toggle on a `direction` ref; verify with Playwright (already installed, v1.60.0) at 360×640/390×844/414×896 using `document.documentElement.scrollHeight <= window.innerHeight` and horizontal-scroll assertions.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Root viewport lock (`100dvh`, `overflow:hidden`) | Browser/Client (CSS) | — | Pure CSS on `html`/`body`/`#root`/`.app`; no JS needed for the lock itself |
| Shell regions (header/main/footer) | Browser/Client (React component + CSS) | — | New `ScreenShell` wrapper in `app.jsx`; CSS flex column in `style.css` |
| Battle board sizing (`--cell` capped by height) | Browser/Client (CSS var + JS measurement) | — | `ResizeObserver` on `.shell-main` sets `--main-h`; CSS `min()` formula consumes it |
| Overlay/bottom-sheet (Powers) | Browser/Client (existing `BottomSheet` component) | — | Reuse Phase 9 component verbatim, no new overlay CSS |
| Screen transitions (slide/push) | Browser/Client (CSS class toggle) | — | Single class on shell-main wrapper, `prefers-reduced-motion` media query |
| Safe-area insets | Browser/Client (CSS `env()`) | — | Already partially present (`body`, `.topbar`); extend to shell-header/footer |
| Keyboard handling (chat composer) | Browser/Client (`window.visualViewport` JS) | — | `.chat-panel` already `position:fixed`; needs `visualViewport.resize` listener |
| No-scroll verification (D-08) | Tooling (Playwright, dev-only) | — | Automated assertion at 3 viewport sizes; not part of shipped app |

All capabilities in this phase are Browser/Client tier — no Frontend-SSR, API/Backend, CDN, or Database tier involvement (consistent with CLAUDE.md "this phase is client-only").

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOBILE-01 | Root layout locked to `100dvh`, `overflow:hidden` | See "Viewport Units" below — replace `html,body{min-height:100dvh}` with `height:100dvh;overflow:hidden`. `#root`/`.app` become flex columns. |
| MOBILE-02 | Per-screen shell regions (header/main/footer) | `ScreenShell` component pattern below; UI-SPEC already specifies the 3-region contract and per-screen mapping table |
| MOBILE-03 | Battle screen fits one viewport, board sized by `min(width,height)` | `--main-h` measurement pattern (ResizeObserver) below; extends existing `--cell` formula |
| MOBILE-04 | Power-up bar + (per D-07, NOT battle log) become tap-open overlays | Reuse `BottomSheet`/`.bottom-sheet-*` verbatim (Phase 9); D-07 removes the Log chip entirely — only `shell.powersToggle` is new |
| MOBILE-05 | All 8 screens refactored + verified at 360×640/390×844/414×896 | Playwright verification pattern below (Validation Architecture section) |
| MOBILE-06 | Native tap transitions, slide/push, `prefers-reduced-motion` | CSS class-toggle transition pattern below; codebase already has a `prefers-reduced-motion` block at style.css:490 to extend |
| MOBILE-07 | `env(safe-area-inset-*)` for notch/home-indicator/system bars | `viewport-fit=cover` already present in index.html:5; `body` already has inset padding (style.css:28); extend to shell-header/footer |
| MOBILE-08 | Desktop/tablet preserved (~480px phone-frame) | `.app{max-width:480px;margin:0 auto}` (style.css:73) stays; shell regions nest inside, no breakpoint changes needed beyond existing 560/380/320px |
| MOBILE-09 | EN/VI i18n preserved, new controls have both | `I18N` object at app.jsx:20 (EN) / app.jsx:264 (VI); add `shell.powersToggle`, reuse `history.back` |
| MOBILE-10 | Existing behavior preserved (reconnect, chat, modals, install banner) | `.pwa-install-banner`, `.notice-toast` (z-index 200), `.offline-banner` (z-index 190) are `position:fixed` — verify they still render above/below shell regions correctly (see Pitfalls) |
| MOBILE-11 | No horizontal scroll at any width | `overflow-x:hidden` on shell regions; existing ellipsis truncation on `.pc-name`/`.friend-name` extends to shell-header title |
| MOBILE-12 | Keyboard-open handling for chat composer | `window.visualViewport.resize` pattern below; `.chat-panel` already `max-height:70dvh` |

## Standard Stack

### Core

No new libraries. This phase uses only browser-native CSS/JS APIs already part of the platform:

| API | Support | Purpose | Why Standard |
|-----|---------|---------|---------------|
| `100dvh` / `100svh` / `100lvh` (CSS) | Safari 15.4+, Chrome/Edge 108+, Firefox 101+ — Baseline "Widely Available" since June 2025 [CITED: caniuse.com/viewport-unit-variants] | Viewport-relative sizing that accounts for mobile browser UI chrome | Native CSS, zero JS cost, purpose-built for this exact problem |
| `env(safe-area-inset-*)` (CSS env vars) | iOS Safari 11.2+, Android Chrome (notch-aware devices) [ASSUMED — long-standing, training-data knowledge, not re-verified via Context7] | Notch/home-indicator/system-bar clearance | Already in use in this codebase (body, .topbar) |
| `window.visualViewport` | iOS Safari 13+, Chrome 61+ [ASSUMED — training-data knowledge] | Detect soft-keyboard open/close, reposition fixed elements | Documented fix for the iOS "fixed element behind keyboard" bug [CITED: saricden.com pattern via WebSearch] |
| `ResizeObserver` | All modern browsers (Safari 13.1+, Chrome 64+) [ASSUMED — training-data knowledge] | Measure `.shell-main` height for `--main-h` CSS var | Native, async, doesn't poll; correct tool for "element resized" vs `window.resize` [CITED via WebSearch cross-source] |
| CSS class-toggle transitions + `prefers-reduced-motion` | Universal | Slide/push screen transitions | No router/animation library; matches "extend, don't rewrite" |

### Supporting

| Asset | Location | Purpose | When to Use |
|-------|----------|---------|-------------|
| `BottomSheet` component | app.jsx:860 | Reusable overlay/sheet | Powers overlay on battle screen (MOBILE-04) |
| `.bottom-sheet-overlay`/`.bottom-sheet-panel` | style.css:260-277 | Sheet CSS (already `max-height:70dvh`, slide-up transform) | No new overlay CSS needed |
| `history.back` i18n key | app.jsx:72 (EN) / app.jsx:264 (VI) | "← Back" / "← Quay lại" | Extend to all shell-header back buttons |
| `--cell` formula | style.css:5 | Board cell sizing | Extend with height-cap term for MOBILE-03 |
| `confirmLeave`/`doLeave`/`leaveRoom()` | app.jsx:3827-3831 | Leave-room confirmation modal | Wire shell-header back button on room/placement/battle through this (D-07/UI-SPEC) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ResizeObserver` for `--main-h` | `window.addEventListener('resize', ...)` + `visualViewport.resize` | `window.resize` doesn't fire when only an element (not the window) resizes — e.g. when `.shell-header`/`.shell-footer` heights change due to content/locale differences, or when the keyboard opens (that's `visualViewport`, not `window.resize`). `ResizeObserver` on `.shell-main` directly catches both window-driven and content-driven size changes in one listener. [CITED via WebSearch cross-source] |
| CSS class-toggle transitions | A routing/animation library (React Router + Framer Motion, etc.) | UI-SPEC explicitly mandates "no router/animation library needed" — adding one would violate CLAUDE.md "extend, don't rewrite" and add bundle weight to an esbuild IIFE build with no code-splitting |
| `100dvh` everywhere | `100vh` with JS `--vh` custom-property polyfill (the classic 2020-era trick: `document.documentElement.style.setProperty('--vh', window.innerHeight + 'px')`) | `100dvh` is now Baseline (95% global support, June 2025) and needs zero JS — the old JS polyfill is legacy/deprecated for this use case. Keep `100vh` only as a static fallback for the ~5% non-supporting browsers (declared before the `dvh` rule so it's overridden where supported). |

**Installation:** None — no `npm install` required for this phase.

**Version verification:** Not applicable — no packages.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages (`npm view` / `slopcheck` / registry checks skipped). All implementation uses browser-native CSS and JavaScript APIs already available in the target browsers and already partially used in this codebase (`env()`, `100dvh` appears nowhere yet but `min-height:100dvh` does at style.css:31).

**Packages removed due to slopcheck [SLOP] verdict:** none (n/a — no packages proposed)
**Packages flagged as suspicious [SUS]:** none (n/a)

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ html, body  { height:100dvh; overflow:hidden }                │  ← MOBILE-01 root lock
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ #root > .app  { display:flex; flex-direction:column;      │ │
│ │                 height:100dvh; max-width:480px (desktop) }│ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ .shell-header  (fixed height, no scroll)              │ │ │  ← MOBILE-02, MOBILE-07
│ │ │  [back btn?] [title] [right-action: avatar/sound]     │ │ │     (safe-area-inset-top)
│ │ ├─────────────────────────────────────────────────────┤ │ │
│ │ │ .shell-main  (flex:1; min-height:0; overflow-y:auto)  │ │ │  ← MOBILE-02, MOBILE-03
│ │ │                                                        │ │ │     ResizeObserver writes
│ │ │  [per-screen content, sized to fill]                  │ │ │     --main-h here, consumed
│ │ │  [.screen-enter/.screen-exit transition class]        │ │ │     by --cell formula
│ │ │                                                        │ │ │     (MOBILE-06)
│ │ ├─────────────────────────────────────────────────────┤ │ │
│ │ │ .shell-footer  (fixed height, optional, no scroll)    │ │ │  ← MOBILE-02, MOBILE-07
│ │ │  [primary action btn(s)] [overlay-trigger chips]      │ │ │     (safe-area-inset-bottom)
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │   ↑ tap overlay-trigger chip                              │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ <BottomSheet> (existing, .bottom-sheet-overlay/panel) │ │ │  ← MOBILE-04
│ │ │  Powers list (battle screen only, D-05/D-07)          │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ .chat-panel (position:fixed, bottom:0)                │ │ │  ← MOBILE-12
│ │ │  visualViewport.resize listener re-clamps bottom:0    │ │ │     when keyboard opens/closes
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

setScreen("lobby"|"room"|"placement"|"battle"|"profile"|"history"|"friends"|"queue")
  → ScreenShell re-renders with new header/main/footer content for that screen
  → direction ref (forward/back) sets .screen-enter / .screen-exit class on .shell-main
  → CSS transition (220ms slide+fade, or 100ms opacity-only under reduced-motion)
```

### Recommended Project Structure

No new files — everything lands in the existing two files:

```
public/
├── app.jsx     # ADD: ScreenShell component (~near BottomSheet, line ~860)
│               # ADD: useMainHeight hook (ResizeObserver → --main-h)
│               # ADD: useKeyboardInset hook (visualViewport → chat-panel offset)
│               # MODIFY: App() render — wrap each screen's content in <ScreenShell>
│               # MODIFY: Battle — remove .log block + footer chip (D-07)
│               # MODIFY: I18N — add shell.powersToggle (EN+VI)
└── style.css
    ├── :root           # MODIFY: html,body height:100dvh + overflow:hidden (replace min-height)
    ├── .shell-header   # ADD: new region CSS
    ├── .shell-main     # ADD: new region CSS (flex:1, overflow-y:auto, --main-h consumer)
    ├── .shell-footer   # ADD: new region CSS
    ├── --cell formula  # MODIFY: add height-cap term using --main-h
    ├── .screen-enter/  # ADD: transition classes
    │   .screen-exit
    └── @media (prefers-reduced-motion: reduce)  # MODIFY: add screen-transition override
```

### Pattern 1: ScreenShell Wrapper Component

**What:** A single React component that renders the 3-region flex-column structure. Each screen passes `header`, `footer` (optional), and children for `.shell-main`.

**When to use:** Every screen render in `App()` (lobby, room, placement, battle, profile, history, friends, queue) wraps its content.

**Example:**
```jsx
// Pattern synthesized from UI-SPEC contract + existing BottomSheet conventions
// (app.jsx — new component near line 860)
function ScreenShell({ header, footer, children, screenKey, direction }) {
  const mainRef = useRef(null);
  useMainHeight(mainRef); // ResizeObserver -> sets --main-h on mainRef.current

  return (
    <>
      {header && <div className="shell-header">{header}</div>}
      <div
        className={"shell-main" + (direction ? " screen-" + direction : "")}
        ref={mainRef}
        key={screenKey}
      >
        {children}
      </div>
      {footer && <div className="shell-footer">{footer}</div>}
    </>
  );
}
```

```css
/* style.css additions */
html, body {
  height: 100dvh;        /* falls back to 100vh on browsers without dvh support */
  height: 100vh;         /* declared FIRST so 100dvh (if supported) overrides it */
  overflow: hidden;
}
/* NOTE: order matters - the LAST declaration a browser understands wins.
   Put 100vh first, 100dvh second, so unsupported browsers use 100vh and
   supported browsers use 100dvh. (Same technique already implicitly used
   at style.css:706 for .bottom-sheet-panel max-height.) */

#root, .app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  height: 100vh; /* fallback order note applies here too — see above; in practice
                    declare vh BEFORE dvh in source order */
}

.shell-header {
  flex: none;
  padding: 8px 14px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  background: var(--panel);
  border: 1px solid var(--panel-brd);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  display: flex; align-items: center; gap: 8px;
}

.shell-main {
  flex: 1;
  min-height: 0;        /* CRITICAL: without this, flex children don't shrink below content size */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px;
}

.shell-footer {
  flex: none;
  padding: 10px 14px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  background: var(--panel);
  border-top: 1px solid var(--panel-brd);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
}
```

### Pattern 2: `--main-h` Measurement via ResizeObserver (MOBILE-03)

**What:** Measure `.shell-main`'s actual rendered height and expose it as a CSS custom property, which the `--cell` formula consumes to cap board size by available vertical space.

**When to use:** Battle screen (D-02/D-04 — hardest viewport-fit case, build first). Can be applied to `ScreenShell` generically since it's cheap, but only Battle's `--cell` formula reads `--main-h`.

**Example:**
```jsx
// Source: pattern synthesized from MDN ResizeObserver + UI-SPEC note
// (app.jsx — new hook, place near top with other utility hooks)
function useMainHeight(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      // Fallback for browsers without ResizeObserver: one-shot + window resize
      const set = () => { el.style.setProperty("--main-h", el.clientHeight + "px"); };
      set();
      window.addEventListener("resize", set);
      return () => window.removeEventListener("resize", set);
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentBoxSize/contentRect gives the OBSERVED element's own box —
        // setting a CSS var on that SAME element does not change its own
        // border-box size, so this does not re-trigger the observer (no loop).
        const h = entry.contentRect.height;
        el.style.setProperty("--main-h", h + "px");
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
```

```css
/* style.css — extend the existing --cell formula (style.css:5) */
:root {
  --cell: min(
    32px,
    calc((100vw - 40px) / 11),
    calc((var(--main-h, 100vh) - 220px) / 11)  /* 220px ≈ scoreboard + turn-ring +
                                                    counters + footer chips reserved
                                                    space; tune during implementation */
  );
}
```

**Loop-safety note:** `ResizeObserver` has a built-in cycle-prevention mechanism (only notifies for elements deeper in the DOM tree than the shallowest changed element per frame) [CITED via WebSearch cross-source: w3.org/TR/resize-observer]. Setting a custom property on the *observed* element itself (`el.style.setProperty`) does not change `el`'s own border-box dimensions, so it does not re-trigger `ro`'s callback for `el`. However, if `--main-h` is consumed by a CHILD element whose resulting size change bubbles back up to affect `.shell-main`'s height (e.g., if `.shell-main` had `height:auto` and its child grew), THAT could loop — hence `.shell-main` MUST have a fixed/flex-constrained height (`flex:1; min-height:0`) independent of its children's `--cell`-driven sizes.

### Pattern 3: `window.visualViewport` for Chat Composer Keyboard (MOBILE-12)

**What:** When the iOS/Android soft keyboard opens, `window.visualViewport` shrinks (and on iOS, `offsetTop` may shift) while the layout viewport (`100dvh`) does not always track it identically. `.chat-panel` is `position:fixed; bottom:0` — on iOS this can end up positioned behind/below the keyboard. Re-clamp it using `visualViewport.height` instead of relying on `bottom:0`.

**When to use:** Only `.chat-panel` (battle screen, non-bot). The shell header/footer do NOT need this — they're not `position:fixed` with `bottom:0` in a way the keyboard affects (footer is part of the flex column, which `100dvh` recalculation already handles for layout-viewport-based units; the issue is specific to `position:fixed` elements anchored with `bottom:0`).

**Example:**
```jsx
// Source: pattern synthesized from saricden.com "fixed elements + visualViewport"
// (WebSearch, MEDIUM confidence — cross-verify exact offsetTop math during implementation
// on a real iOS device; this is the documented SHAPE of the fix, not a copy-paste guarantee)
function useKeyboardInset(panelRef) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !panelRef.current) return;
    function reposition() {
      const el = panelRef.current;
      if (!el) return;
      // When keyboard is open, vv.height < window.innerHeight and vv.offsetTop > 0.
      // Position the panel's bottom edge at the visual viewport's bottom edge
      // (i.e. just above the keyboard), using `top` instead of `bottom` to avoid
      // the iOS "fixed bottom:0 doesn't track visualViewport" bug.
      const keyboardOpen = vv.height < window.innerHeight * 0.85; // heuristic threshold
      if (keyboardOpen) {
        el.style.position = "fixed";
        el.style.top = (vv.offsetTop + vv.height - el.offsetHeight) + "px";
        el.style.bottom = "auto";
      } else {
        el.style.position = ""; el.style.top = ""; el.style.bottom = "";
        // revert to CSS-defined position:fixed; bottom:0
      }
    }
    vv.addEventListener("resize", reposition);
    vv.addEventListener("scroll", reposition); // iOS also fires scroll on viewport shift
    return () => {
      vv.removeEventListener("resize", reposition);
      vv.removeEventListener("scroll", reposition);
    };
  }, [panelRef]);
}
```

**Important:** `.chat-input input` already has `font-size:16px` with the comment `/* >=16px: ngăn iOS tự zoom khi focus */` (≥16px prevents iOS auto-zoom on focus) — style.css:716. This is correct and must be preserved; do not shrink this for mobile breakpoints.

### Pattern 4: CSS Class-Toggle Screen Transitions (MOBILE-06)

**What:** A single class (`screen-enter-forward` / `screen-enter-back` / etc.) applied to `.shell-main` on `setScreen()`, driven by a `direction` ref. UI-SPEC already specifies: 220ms slide+fade (`cubic-bezier(.34,1.4,.4,1)`), reverse direction for back-nav, `prefers-reduced-motion` → 100ms opacity-only cross-fade.

**Example:**
```jsx
// app.jsx — wrap setScreen to track direction
const screenDirection = useRef("forward");
const FORWARD_SCREENS = ["room", "placement", "battle", "profile", "history", "friends", "queue"];
function navigate(next) {
  screenDirection.current = (next === "lobby") ? "back" : "forward";
  setScreen(next);
}
// Replace setScreen("lobby") calls used for "back" navigation with navigate("lobby"),
// and setScreen(<forward target>) with navigate(<target>) — OR keep setScreen everywhere
// and derive direction by comparing old/new screen against a fixed hierarchy order.
```

```css
/* style.css additions */
@media (prefers-reduced-motion: no-preference) {
  .shell-main.screen-enter-forward { animation: slide-in-fwd .22s cubic-bezier(.34,1.4,.4,1) both; }
  .shell-main.screen-enter-back    { animation: slide-in-back .22s cubic-bezier(.34,1.4,.4,1) both; }
  @keyframes slide-in-fwd  { from { opacity:0; transform: translateX(20%); }  to { opacity:1; transform:none; } }
  @keyframes slide-in-back { from { opacity:0; transform: translateX(-20%); } to { opacity:1; transform:none; } }
}
@media (prefers-reduced-motion: reduce) {
  .shell-main.screen-enter-forward,
  .shell-main.screen-enter-back {
    animation: cross-fade .1s linear both;
  }
  @keyframes cross-fade { from { opacity:0; } to { opacity:1; } }
}
```

**Note:** The existing reduced-motion block at style.css:490-493 disables `.cell.hit/.miss/.sunk` and `.boards.shake` animations. Add the screen-transition reduced-motion override as a SEPARATE rule near it (or in the same `@media (prefers-reduced-motion: reduce)` block) — don't merge into unrelated selectors.

### Anti-Patterns to Avoid

- **Using `100vh` alone for the root lock:** On iOS Safari, `100vh` is calculated against the *largest* possible viewport (address bar hidden), causing content to be clipped/overflow when the address bar is shown — exactly the scroll/overflow bug this phase fixes. Always prefer `100dvh` with `100vh` as a same-property fallback declared first in source order.
- **Setting `--main-h` via `window.innerHeight` instead of measuring `.shell-main`:** `window.innerHeight` includes the shell-header and shell-footer heights, which vary per screen (e.g., placement has a footer, lobby doesn't). Measuring `.shell-main` directly via `ResizeObserver` gives the TRUE available space for that screen's content, automatically accounting for header/footer presence.
- **Re-implementing the bottom sheet:** D-07/UI-SPEC are explicit — reuse `.bottom-sheet-overlay`/`.bottom-sheet-panel`/`<BottomSheet>` verbatim. Do not create `.shell-overlay` or similar new overlay primitives.
- **Changing the `.app` 14px padding to 16px:** UI-SPEC explicitly locks this as the "one justified non-canonical value" — changing it shifts every existing screen's horizontal rhythm, out of scope.
- **Adding a router library for transitions:** UI-SPEC and CLAUDE.md both rule this out. The existing `setScreen` state-machine + CSS class toggle is sufficient and is the "extend don't rewrite" path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bottom sheet / overlay panel | New `.shell-sheet` CSS + component | Existing `<BottomSheet>` (app.jsx:860) + `.bottom-sheet-overlay`/`.bottom-sheet-panel` (style.css:260-277) | Already handles focus-trap, Escape-to-close, overlay-click-to-close, `70dvh` max-height, slide transform — exactly what MOBILE-04 needs |
| Viewport-height tracking | JS `--vh` custom-property polyfill (the 2018-era `window.innerHeight` → CSS var trick) | Native `100dvh` (+ `100vh` fallback) | `100dvh` is Baseline since June 2025 and needs zero JS; the polyfill adds a resize listener + reflow risk for no benefit at current browser support levels |
| Back-button confirmation | New confirm dialog for shell-header back button on room/placement/battle | Existing `confirmLeave`/`doLeave`/`leaveRoom()` (app.jsx:3827) + `leave.*` i18n keys | UI-SPEC explicitly requires routing through the SAME forfeit-confirmation flow as the current leave button — a new dialog would diverge behavior |
| Safe-area handling | Custom notch-detection JS (UA sniffing, `window.screen` heuristics) | `env(safe-area-inset-*)` CSS function | Already correctly used at style.css:28 (body) and style.css:88 (.topbar); `viewport-fit=cover` already set in index.html:5 — just extend to new shell regions |

**Key insight:** Almost everything this phase needs already exists in the codebase in some form (bottom sheets, safe-area padding, `--cell` sizing, back-button i18n, leave-confirmation flow, reduced-motion blocks, `70dvh` max-heights). The work is primarily *reorganizing* existing JSX/CSS into the 3-region shell structure and adding the height-measurement glue (`--main-h`), not building new primitives.

## Common Pitfalls

### Pitfall 1: `100dvh` causes visible reflow when the iOS address bar collapses/expands on scroll

**What goes wrong:** `100dvh` recalculates live as the browser chrome shows/hides during scroll, so a `100dvh` element resizes mid-scroll — feels janky if the page itself can still scroll.
**Why it happens:** `dvh` is *designed* to track the dynamic viewport; on a page that can scroll, this means constant resize.
**How to avoid:** This phase sets `overflow:hidden` on `html,body` AND `overscroll-behavior:none` (already present, style.css:37) — with no page scroll possible, there's nothing to trigger the address-bar collapse/expand cycle in the first place. The risk is residual: if ANY screen's content is taller than `.shell-main` and relies on `.shell-main`'s `overflow-y:auto` to scroll, scrolling INSIDE `.shell-main` should not affect the outer `100dvh` root (since the root itself never scrolls). Verify this empirically on the history/friends screens (the only ones expected to scroll per UI-SPEC).
**Warning signs:** Visual "jump" or resize flicker when scrolling inside `.shell-main` on a real iOS device.

### Pitfall 2: `min-height: 0` omission on flex children breaks `overflow-y: auto`

**What goes wrong:** `.shell-main { flex:1; overflow-y:auto }` without `min-height:0` will NOT scroll — it expands to fit content instead, pushing `.shell-footer` off-screen (defeating MOBILE-02).
**Why it happens:** Flex items default to `min-height:auto`, which for a flex item means "at least as tall as content" — this overrides `flex:1`'s shrink behavior.
**How to avoid:** Always pair `flex:1` with `min-height:0` on `.shell-main` (and on `#root`/`.app` if they're also flex containers in a chain). This is the single most common flexbox-scrolling bug.
**Warning signs:** `.shell-footer` disappears below the fold on screens with long content (history, friends with many entries).

### Pitfall 3: `position:fixed` overlays (`.notice-toast`, `.offline-banner`, `.pwa-install-banner`, `.bottom-sheet-overlay`, `.chat-panel`) may render behind or in front of shell regions unexpectedly after z-index/stacking-context changes

**What goes wrong:** Wrapping screen content in `.shell-main` (a new stacking context if it gets `position:relative` + transform for the slide animation) can change how child `position:fixed` elements behave — `position:fixed` is relative to the nearest ancestor with a `transform`/`filter`/`will-change` property, NOT always the viewport, once CSS transitions are added.
**Why it happens:** Adding `transform` to `.shell-main` for the slide transition (Pattern 4) creates a new containing block for any descendant `position:fixed` elements. `.chat-panel`, `.notice-toast`, etc. are currently siblings of screen content in the React tree (rendered at the `.app` level, app.jsx:4134, 3940, 3943) — if they stay OUTSIDE `.shell-main`, they're unaffected. If any get nested INSIDE `.shell-main`, their `position:fixed` becomes relative to `.shell-main` instead of the viewport.
**How to avoid:** Keep `.chat-panel`, `.notice-toast`, `.offline-banner`, `.pwa-install-banner`, `.bottom-sheet-overlay`, and modal `.overlay` elements as DIRECT CHILDREN of `.app` (outside any `.shell-main` with `transform`), exactly as they are today (app.jsx:3940-4141 render them after/alongside the screen-conditional blocks). Only the per-screen CONTENT moves into `.shell-main`.
**Warning signs:** Toast/banner/sheet appears clipped to `.shell-main`'s bounds, or shifts position during the slide transition.

### Pitfall 4: `--cell` height-cap term creates a circular dependency if `.shell-main`'s height itself depends on `--cell`

**What goes wrong:** If `.shell-main`'s height is `auto` (sized by its content, which includes the board sized by `--cell`, which is capped by `--main-h` = `.shell-main`'s height) — infinite recursion / oscillation.
**Why it happens:** `--main-h` is supposed to be the INPUT to `--cell`, not derived from it.
**How to avoid:** `.shell-main` height MUST come from the flex layout (`flex:1` within a `height:100dvh` ancestor chain), NEVER from `height:auto`/content-size. `ResizeObserver` then measures this flex-determined height (a stable, top-down value) and writes it to `--main-h`. The board's `--cell`-driven size is a CHILD of `.shell-main` and does not feed back into `.shell-main`'s own height because `.shell-main` doesn't size-to-content.
**Warning signs:** Board "jumps" between two sizes repeatedly, or `ResizeObserver` console warning "loop limit exceeded".

### Pitfall 5: Existing `.app { padding: 14px 14px 60px }` and `.footer-note` removal must be coordinated

**What goes wrong:** UI-SPEC says `.footer-note` (the SEO/copyright link, app.jsx:4141) is "REMOVED from the always-rendered shell on mobile ... relocated to avatar menu or overlay." If this isn't done BEFORE the `100dvh`/`overflow:hidden` lock lands, `.footer-note` will be clipped/invisible (not just "below the fold" — actually unreachable since the page can't scroll to it).
**Why it happens:** `.app`'s current `padding-bottom:60px` exists specifically to make room for `.footer-note` in the old scrolling layout. Once `overflow:hidden` lands, anything relying on that bottom padding + page scroll to become visible is permanently hidden.
**How to avoid:** Sequence: either (a) relocate `.footer-note` content into the avatar menu / an "About" overlay in the SAME plan that adds the root lock, or (b) keep `.footer-note` rendering only when `screen === "lobby"` AND inside `.shell-main` (so it's part of the scrollable lobby content, not a separate fixed region) as an interim step, with final relocation as a follow-up. D-02/D-03 (shell-first, battle screen first) means the root lock likely lands in Plan 1 alongside Battle — `.footer-note` handling should be explicitly scoped into whichever plan adds the root `overflow:hidden`.
**Warning signs:** SEO footer link disappears entirely with no way to access it; Lighthouse/SEO regression if the crawlable footer content (index.html's `<footer class="seo">`, which is SEPARATE from `.footer-note` and lives outside `#root`) is conflated with `.footer-note` (they are different elements — `.footer-note` is `{t("footer")}` inside `#root`; the SEO block in index.html:125-156 is outside `#root` and is NOT affected by the `100dvh #root` lock, but verify this assumption).

### Pitfall 6: `.app { max-width: 480px; margin: 0 auto }` combined with `#root, .app { height: 100dvh }` on desktop

**What goes wrong:** On desktop/tablet (MOBILE-08), `.app` is centered with `max-width:480px` but the surrounding viewport is much wider/taller. If `.app` gets `height:100dvh`, it becomes a full-viewport-height column EVEN on desktop, which may look correct (phone-frame effect) but must be checked against the existing `@media (max-width:768px)` rules (style.css:998) and the `max-height:calc(100dvh - 14vh)` rule at style.css:1092 (likely a modal/sheet rule) for conflicts.
**Why it happens:** The shell lock applies globally; desktop-specific overrides may be needed to preserve the "centered phone-frame, not full-bleed" look.
**How to avoid:** Test the shell at a desktop width (e.g., 1280×800) early — `.app` should still look like a centered phone-shaped column, with the ocean-bg gradient filling the rest of the viewport (it's already `position:fixed; inset:0` at the `body`/`.ocean-bg` level, style.css:52, so it's unaffected by `.app`'s width).
**Warning signs:** On desktop, the shell header/footer stretch full-width instead of staying within the 480px column, or `.app` no longer centers vertically/horizontally.

## Code Examples

### Existing `--cell` formula (current, style.css:5)
```css
/* Source: public/style.css line 5 */
--cell: min(32px, calc((100vw - 40px) / 11));
```

### Existing safe-area usage (current, style.css:28, 88)
```css
/* Source: public/style.css */
body {
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
}
.topbar {
  padding: 6px 4px 18px;
  padding-top: calc(6px + env(safe-area-inset-top, 0px));
}
```

### Existing reduced-motion block (current, style.css:490-493)
```css
/* Source: public/style.css lines 490-493 */
@media (prefers-reduced-motion: reduce) {
  .cell.hit, .cell.miss, .cell.sunk, .cell.hit::after, .boards.shake { animation: none !important; }
  .grid.enemy .cell.shootable:hover { transform: none; }
}
```

### Existing BottomSheet (current, app.jsx:860-891)
```jsx
// Source: public/app.jsx lines 860-891 — reuse verbatim for Powers overlay
function BottomSheet({ open, onClose, title, children }) {
  // ... focus trap, Escape key, overlay-click-to-close, role="dialog" ...
  return (
    <div className={"bottom-sheet-overlay" + (open ? " open" : "")} onClick={handleOverlayClick} onTouchEnd={handleOverlayClick} role="presentation">
      <div className="bottom-sheet-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-title">{title}</div>
        <button className="bottom-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `100vh` + JS `--vh` custom-property polyfill (listen to `window.resize`, set `--vh: ${window.innerHeight}px`) | `100dvh` (native CSS, no JS) | `dvh`/`svh`/`lvh` reached Baseline "Widely Available" June 2025 [CITED: caniuse.com] | This phase can skip the JS polyfill entirely; use `100vh` only as a same-property CSS fallback (declared before `100dvh` in source order) for the ~5% of users on older browsers |
| `min-height: 100dvh` (current codebase, style.css:31) — permits page scroll if content exceeds viewport | `height: 100dvh; overflow: hidden` — hard-locks, no page scroll | This phase (MOBILE-01) | Fundamental behavior change: content that previously "pushed the page down" must now fit `.shell-main` or go into an overlay/sheet |
| Page-level scroll for overflow (history list, friends list, help modal) | `.shell-main` is the ONLY scrollable region; page itself never scrolls | This phase (MOBILE-02) | History/Friends screens' list scrolling moves from `body`/`html` scroll to `.shell-main` scroll — `IntersectionObserver` infinite-scroll (HIST-05, Phase 13) sentinel logic must still work when its scroll container changes from the document to `.shell-main` (verify sentinel `root` option or default-to-nearest-scrollable-ancestor behavior) |

**Deprecated/outdated:**
- JS-based `--vh` viewport-height polyfills: superseded by native `100dvh` for all target browsers (Safari 15.4+, Chrome 108+).
- Relying on `window.innerHeight` for "available height" calculations: superseded by `ResizeObserver` on the specific flex container (`.shell-main`) for this phase's `--main-h` measurement.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `env(safe-area-inset-*)` browser support (iOS Safari 11.2+, notch-aware Android) | Standard Stack | Low — codebase already relies on this (style.css:28, :88); if wrong, pre-existing behavior, not a new risk introduced by this phase |
| A2 | `window.visualViewport` support (iOS Safari 13+, Chrome 61+) | Standard Stack, Pattern 3 | Low — both are well below the project's effective minimum (iOS 15.4+ implied by `dvh` usage); if `visualViewport` is unavailable, `useKeyboardInset` should no-op gracefully (guard with `if (!window.visualViewport) return`) |
| A3 | `ResizeObserver` support (Safari 13.1+, Chrome 64+) | Standard Stack, Pattern 2 | Low — below effective minimum; fallback to `window.resize` is provided in Pattern 2's code example |
| A4 | The exact `visualViewport.offsetTop`/`height` repositioning math in Pattern 3 (saricden.com pattern, found via WebSearch, source page returned 404 on direct fetch — summary only from search snippet) | Pattern 3 | MEDIUM — the SHAPE of the fix (listen to `visualViewport.resize`, reposition with `top` instead of `bottom`) is corroborated by multiple search results, but the exact threshold/offset arithmetic should be validated on a real iOS device during implementation; budget a manual-device-test task for MOBILE-12 |
| A5 | `220px` reserved-space constant in the `--cell` height-cap formula (Pattern 2) | Pattern 2 | LOW — explicitly marked "tune during implementation"; this is a starting estimate based on UI-SPEC's scoreboard+turn-ring+footer description, not a measured value |

## Open Questions

1. **Does `IntersectionObserver`-based infinite scroll (HIST-05, Phase 13) work correctly when its scrollable ancestor changes from `document`/`body` to `.shell-main`?**
   - What we know: `IntersectionObserver` defaults to the browser viewport as `root` if not specified; if Phase 13's implementation didn't pass an explicit `root` option, the sentinel may stop triggering once `.shell-main` (not the document) is the scrolling container.
   - What's unclear: Whether Phase 13's `MatchHistory` component (app.jsx:2523) explicitly sets `root` on its `IntersectionObserver`.
   - Recommendation: Planner should add a verification task for the History screen specifically — check `IntersectionObserver` `root` option, set to `.shell-main`'s ref if needed.

2. **Where exactly does `.footer-note` content get relocated (avatar menu vs. new "About" overlay)?**
   - What we know: UI-SPEC says "relocated to a Settings/About entry inside the avatar menu or a dedicated overlay — not part of the primary shell." This is a UI-SPEC-level open decision, not fully pinned.
   - What's unclear: Avatar menu (`.avatar-menu`/`.avatar-menu-item`, style.css:668-687) already has several items (sign out, etc.) — does adding an "About" item fit, or does it need its own modal?
   - Recommendation: Planner's discretion per CONTEXT.md "Claude's Discretion" — likely simplest as a new `.avatar-menu-item` that opens a small modal reusing `.modal`/`.overlay` classes with `{t("footer")}` content.

3. **Exact `220px` (or similar) reserved-height constant for the `--cell` height-cap formula** — see Assumption A5. Will require live measurement against the actual rendered scoreboard + turn-ring + footer-chip heights at 360×640.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | Build (`build-game.mjs`, esbuild) | ✓ (assumed — existing project builds) | — | — |
| esbuild | Bundling `app.jsx` → `dist/app.js` | ✓ (^0.24.0 in package.json) | 0.24.x | — |
| Playwright | D-08 automated no-scroll viewport gate | ✓ | 1.60.0 [VERIFIED: `npx playwright --version`] | — |
| Browser-native `100dvh`, `env()`, `visualViewport`, `ResizeObserver` | All MOBILE-* requirements | ✓ (client-side, no install needed) | Baseline since June 2025 | `100vh` fallback for `dvh`; `window.resize` fallback for `ResizeObserver`; graceful no-op for `visualViewport` |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none — all fallbacks are inline CSS/JS feature-detection as documented in Patterns 2-3.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (unit/server tests, `test/*.test.js`) + Playwright 1.60.0 (installed, no e2e dir yet) |
| Config file | `vitest.config.js` (exists); Playwright config — none yet, create in Wave 0 |
| Quick run command | `npx playwright test test/e2e/shell-viewport.spec.js --grep @smoke` (once created) |
| Full suite command | `npx playwright test test/e2e/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOBILE-01 | Root `html,body` no page scroll at any screen | smoke (Playwright) | `npx playwright test -g "no page scroll"` | ❌ Wave 0 |
| MOBILE-03 | Battle board fits viewport, no overflow at 360×640 | smoke (Playwright) | `npx playwright test -g "battle viewport fit"` | ❌ Wave 0 |
| MOBILE-05 | All 8 screens fit at 360×640 / 390×844 / 414×896, no horiz scroll | smoke (Playwright, parametrized) | `npx playwright test test/e2e/shell-viewport.spec.js` | ❌ Wave 0 |
| MOBILE-08 | Desktop (e.g. 1280×800) preserves centered phone-frame | smoke (Playwright) | `npx playwright test -g "desktop phone frame"` | ❌ Wave 0 |
| MOBILE-11 | No horizontal scroll at any width incl. 320px | smoke (Playwright) | included in shell-viewport.spec.js | ❌ Wave 0 |
| MOBILE-09 | i18n keys present for EN+VI (no untranslated strings) | unit (grep-based) | `node -e "..."` check both `I18N.en`/`I18N.vi` have matching key sets for new `shell.*` keys | ❌ Wave 0 (simple script) |
| MOBILE-02, 04, 06, 07, 10, 12 | Manual/visual verification (overlay behavior, transitions, safe-area on real device, keyboard) | manual-only | n/a — D-08 explicitly designates manual eyeball pass for visual polish | n/a |

### Sampling Rate

- **Per task commit:** Run the relevant single-screen Playwright spec (e.g., `npx playwright test -g "battle"` after the battle shell task).
- **Per wave merge:** `npx playwright test test/e2e/shell-viewport.spec.js` (full 3-viewport x 8-screen matrix).
- **Phase gate:** Full Playwright shell-viewport suite green + manual eyeball pass (D-08 hybrid verification) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `test/e2e/shell-viewport.spec.js` — Playwright spec asserting, for each of the 8 screens × 3 viewport sizes (360×640, 390×844, 414×896): `document.documentElement.scrollHeight <= window.innerHeight` (or a small tolerance, e.g. ≤1px for sub-pixel rounding) AND `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal scroll, MOBILE-11).
- [ ] Playwright config (`playwright.config.js`) — define `devices`/viewport presets for 360×640, 390×844, 414×896, plus a desktop preset (e.g. 1280×800) for MOBILE-08. Base URL should point at `app_url` from `.planning/config.json` (`http://localhost:4000`).
- [ ] A way to drive `setScreen()` to each of the 8 screens from a fresh page load for testing — likely via UI taps (Quick Play → bot → placement → battle path) since there's no test-only screen router. Consider whether a `?screen=` query-param test hook is acceptable (would need a tiny, clearly-marked dev-only branch in `App()`) or whether navigating via real taps is preferred (slower but tests real flow). Planner should decide — flagged here as it affects spec-writing effort.
- [ ] Simple Node script or Vitest test asserting `Object.keys(I18N.en.shell || {})` matches `Object.keys(I18N.vi.shell || {})` for the new `shell.*` namespace (MOBILE-09).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Phase is layout-only; no auth flow changes |
| V3 Session Management | No | No session changes |
| V4 Access Control | No | No access-control changes |
| V5 Input Validation | No | No new input fields; existing chat input (`maxLength=200`) unchanged |
| V6 Cryptography | No | N/A |

This phase is **out of scope for ASVS controls** — it is a pure CSS/JSX layout restructure with no new user input, no new data flows, no new endpoints, and no changes to authentication/authorization/session/crypto code paths. The only "new" interactive elements (back buttons, overlay-trigger chips) are pure navigation/UI-state toggles (`setScreen`, `useState` for sheet `open`), routed through EXISTING confirmation flows (`confirmLeave`/`doLeave`) where destructive actions are involved.

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| n/a | n/a | No new threat surface introduced by this phase |

## Sources

### Primary (HIGH confidence)
- `public/app.jsx` (3956 lines, read in full structure) — existing `BottomSheet`, `Battle`, `ChatComposer`, `App()` render tree, i18n `I18N` object, `setScreen`/`leaveRoom`/`confirmLeave` flow
- `public/style.css` (1363 lines, key sections read) — `:root` tokens, `--cell` formula, `.bottom-sheet-*`, `.chat-panel`, `.scoreboard`, mobile breakpoints (560/380/320px), reduced-motion blocks
- `public/index.html` — confirmed `viewport-fit=cover` already present (line 5)
- `.planning/phases/19-.../19-CONTEXT.md` — locked decisions D-01..D-08
- `.planning/phases/19-.../19-UI-SPEC.md` — APPROVED design contract (shell regions, per-screen mapping, overlay contract, transitions, safe-area/keyboard rules)
- `.planning/ROADMAP.md` Phase 19 section — MOBILE-01..12 requirement text
- `package.json` — confirmed Playwright 1.60.0, Vitest 4.1.8 installed; no new deps needed
- `npx playwright --version` → `Version 1.60.0` [VERIFIED: command output]

### Secondary (MEDIUM confidence)
- caniuse.com viewport-unit-variants (via WebSearch summary) — `dvh`/`svh`/`lvh` Baseline "Widely Available" since June 2025, Safari 15.4+ / Chrome 108+
- WebSearch cross-source on `ResizeObserver` vs `window.resize` for flex-container measurement and built-in loop-prevention mechanism (w3.org/TR/resize-observer referenced)
- WebSearch summary of saricden.com `visualViewport`-based fixed-element repositioning pattern (direct fetch 404'd; pattern corroborated across multiple search results including bram.us and Apple developer forums)

### Tertiary (LOW confidence)
- A4 in Assumptions Log — exact `visualViewport.offsetTop`/`height` arithmetic for the chat-panel keyboard fix; shape is corroborated but exact numbers need real-device validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are native, well-documented, and several are already in use in this exact codebase
- Architecture: HIGH — UI-SPEC is APPROVED and prescriptive; this research maps it onto concrete code locations (line numbers verified by direct read)
- Pitfalls: HIGH for flexbox/CSS pitfalls (well-established patterns); MEDIUM for the exact `visualViewport` keyboard-fix arithmetic (flagged as A4)

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (30 days — stable browser-native APIs, low churn risk; re-check caniuse `dvh` support if implementation slips past Q3 2026)
