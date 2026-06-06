---
inclusion: fileMatch
fileMatchPattern: "**/app.jsx,**/style.css,**/008_premium_emojis.sql"
---

# Premium Emoji System — Developer Guide

This document describes how the premium animated emoji system works and how to add new emojis.

## Architecture Overview

Premium emojis fly from the sender's avatar to the receiver's avatar with a unique impact effect per type.

**Files involved:**
- `public/app.jsx` — `PremiumEmojiAnimation` component + `Sound` module
- `public/style.css` — CSS animations (search `/* ─── Premium Emoji Animation */`)
- `migrations/008_premium_emojis.sql` — Database catalog (name, slug, cost, impact_type)
- `public/emojis/{slug}.svg` — SVG animation file for each emoji

## How the Animation Works

### 1. Flight Phase (0 → 850ms)

The emoji flies in an arc from sender avatar to receiver avatar:
- Component reads DOM positions via `getBoundingClientRect()` on `.pcard.me .pc-avatar` and `.pcard.opp .pc-avatar`
- CSS custom properties control the path: `--start-x/y`, `--mid-x/y`, `--end-x/y`
- Arc height: `min(60, abs(dx) * 0.3 + 20)` pixels above the straight line
- Class `.pe-anim-emoji` uses keyframe `pe-fly` (0.85s duration)
- Direction class `from-left` or `from-right` is added based on `dx` sign

### 2. Impact Phase (850ms → 2200ms)

A `pe-impact-zone` div anchors at `--end-x/y` (receiver avatar center).
Each `impactType` renders different child elements inside this zone.
All impact elements use class `pe-fx` (position:absolute inside the zone).

### 3. Sound

- **Launch:** `Sound.emojiWhoosh()` plays immediately
- **Impact:** type-specific sound plays at ~830ms (or ~1050ms for `hearts`)

## Impact Types Reference

| impactType | Visual Effect | Sound Method | Flight Modifier |
|---|---|---|---|
| `explosion` | Orange flash + 2 expanding rings + 5 debris particles | `Sound.emojiExplosion()` | Bomb spins (720°) |
| `shake` | Red mark + 3 gold stars burst + avatar shakes | `Sound.emojiShake()` | Normal wobble |
| `splash` | Blue radial burst + ring + 7 directional water drops | `Sound.emojiSplash()` | Normal wobble |
| `hearts` | 5 hearts float upward with stagger | `Sound.emojiHearts()` | Slower (1.1s), higher arc |
| `bounce` | Emoji bounces/lingers at avatar then fades | `Sound.emojiBounce()` | Springy curve |

## Adding a New Premium Emoji

### Step 1: Database Migration

Create a new SQL migration file (e.g., `migrations/009_new_emoji.sql`):

```sql
INSERT INTO premium_emojis (name, slug, emoji_char, cost, description_en, description_vi, animation_file, impact_type, sort_order)
VALUES ('Name', 'slug-name', '🎉', 3, 'English description', 'Mô tả tiếng Việt', 'slug-name.svg', 'your_impact_type', 7);
```

### Step 2: SVG File

Add `public/emojis/{slug}.svg` — this is displayed in the chat grid and as the flying projectile.
Recommended: 64×64 viewBox, single-color or simple gradient, clean paths.

### Step 3: If Using an Existing Impact Type

Done! The animation system will automatically use the matching `impactType` for:
- Impact visual effect
- Impact sound
- Flight behavior modifier

### Step 4: If Creating a NEW Impact Type

You need to add 4 things:

#### 4a. Impact JSX in `PremiumEmojiAnimation` (app.jsx)

Add an `else if (impact === "your_type")` block with your impact DOM elements:

```jsx
} else if (impact === "your_type") {
  impactEl = (
    <>
      <div className="pe-fx pe-yourtype-main" />
      {/* Add as many pe-fx children as needed */}
    </>
  );
}
```

#### 4b. Impact CSS (style.css)

Add a new section after the existing impact types:

```css
/* ════════ YOUR_TYPE (Emoji 🎉) ═══════════════════════════════════════════ */
.pe-yourtype-main {
  width:60px; height:60px; margin:-30px 0 0 -30px;
  /* ... your styling ... */
  opacity:0; animation:pe-yourtype-anim 0.5s ease-out 0.82s forwards;
}
@keyframes pe-yourtype-anim {
  0% { opacity:0; transform:scale(0.2); }
  40% { opacity:1; transform:scale(1.1); }
  100% { opacity:0; transform:scale(1.5); }
}
```

**Key timing:** Impact animations should start at `animation-delay: 0.82s–0.85s` (when emoji arrives).

#### 4c. Impact Sound in `Sound` module (app.jsx)

Add a method using the `tone(freq, dur, type, vol, slideTo)` and `noise(dur, vol)` helpers:

```js
emojiYourType() { tone(freq, duration, 'waveform', volume, slideToFreq); noise(duration, volume); },
```

**Waveform options:** `sine` (smooth), `square` (punchy), `triangle` (soft), `sawtooth` (harsh)

#### 4d. Wire Sound in useEffect

In `PremiumEmojiAnimation`'s useEffect, add to the sound switch:

```js
else if (impact === "your_type") Sound.emojiYourType();
```

#### 4e. (Optional) Flight Modifier CSS

If the new type needs custom flight behavior:

```css
.pe-anim.impact-your_type .pe-anim-emoji { animation-duration:1.1s; }
.pe-anim.impact-your_type .pe-anim-img { animation:pe-your-flight 1.1s ease-in-out forwards; }
```

## CSS Naming Convention

- `.pe-anim` — Root overlay (fixed, inset:0, z-index:9999)
- `.pe-anim-emoji` — The flying projectile (positioned via CSS vars)
- `.pe-anim-img` — The emoji image inside projectile
- `.pe-impact-zone` — Anchor div at receiver avatar (width:0, height:0)
- `.pe-fx` — Base class for all impact effect children (position:absolute)
- `.pe-{type}-{element}` — Type-specific elements (e.g., `.pe-explosion-flash`)
- `.from-left` / `.from-right` — Direction modifier for directional effects

## CSS Custom Properties (set by JS)

| Property | Description |
|---|---|
| `--start-x`, `--start-y` | Sender avatar center (px) |
| `--end-x`, `--end-y` | Receiver avatar center (px) |
| `--mid-x`, `--mid-y` | Arc midpoint (between avatars, raised up) |

## Direction-Dependent Effects

For effects that depend on throw direction (like splash), use:

```css
.pe-anim.from-left .pe-yourtype-drop { animation-name:pe-yourtype-ltr; }
.pe-anim.from-right .pe-yourtype-drop { animation-name:pe-yourtype-rtl; }

@keyframes pe-yourtype-ltr {
  0% { transform:translate(0,0); }
  100% { transform:translate(var(--dx), var(--dy)); }  /* positive dx = rightward */
}
@keyframes pe-yourtype-rtl {
  0% { transform:translate(0,0); }
  100% { transform:translate(calc(var(--dx) * -1), var(--dy)); }  /* mirror */
}
```

## Timing Reference

| Phase | Time | What happens |
|---|---|---|
| 0ms | Launch | `Sound.emojiWhoosh()`, emoji appears at sender avatar |
| ~130ms | In flight | Emoji at full size, wobbling/spinning |
| ~425ms | Arc peak | Emoji at highest point between avatars |
| ~830ms | Impact | Emoji hits receiver, disappears (scale→0), impact FX starts |
| ~830ms | Impact sound | Type-specific `Sound.emoji*()` plays |
| ~1300ms | FX fading | Impact particles/rings reaching end of their animations |
| 2200ms | Complete | `onComplete()` called, DOM removed |

## Checklist for New Emoji

- [ ] Migration SQL with slug, emoji_char, cost, descriptions, animation_file, impact_type
- [ ] SVG file at `public/emojis/{slug}.svg`
- [ ] If new impact_type: JSX block in `PremiumEmojiAnimation`
- [ ] If new impact_type: CSS section in `style.css`
- [ ] If new impact_type: Sound method in `Sound` module
- [ ] If new impact_type: Sound wiring in useEffect
- [ ] If new impact_type: (optional) flight modifier CSS
- [ ] Run `npm run build` and test locally
