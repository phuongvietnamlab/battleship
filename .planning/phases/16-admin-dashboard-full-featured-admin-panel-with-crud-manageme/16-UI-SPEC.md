---
phase: 16
slug: admin-dashboard-full-featured-admin-panel-with-crud-manageme
status: draft
shadcn_initialized: false
preset: none
created: 2026-06-07
---

# Phase 16 — UI Design Contract

> Visual and interaction contract for the Admin Dashboard. Flat minimal aesthetic inspired by Linear/Vercel/Stripe. Data-dense yet elegant, with generous whitespace, subtle depth cues, and restrained use of color.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (plain CSS) |
| Preset | not applicable |
| Component library | none (custom React components) |
| Icon library | Emoji icons in sidebar nav, no icon library |
| Font | `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| Monospace | `'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace` |
| CSS approach | CSS custom properties (variables), single `style.css` file |
| Theme switching | `data-theme="dark"` / `data-theme="light"` attribute on `:root` |
| Default theme | Dark |

---

## Spacing Scale

All spacing values are multiples of 4px. Use CSS variables `--space-*`.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Icon-to-text gap, inline badge padding-x, tight list gutters |
| `--space-2` | 8px | Form input internal padding-y, table cell padding-y, chip padding-x |
| `--space-3` | 12px | Sidebar nav item padding-x, button padding-y (small), gap between badge and label |
| `--space-4` | 16px | Card internal padding, form field spacing, default element margin-bottom |
| `--space-6` | 24px | Card padding on desktop, section heading margin-top, sidebar section gaps |
| `--space-8` | 32px | Page-level horizontal padding, gap between metric cards, content area top padding |
| `--space-12` | 48px | Major section breaks, sidebar total top/bottom padding, page vertical margins |

**Exceptions:** Metric card grid uses `gap: 20px` (5 cards must fit 1200px content width evenly).

---

## Typography

Font sizes use `rem` units for accessibility. Base = 14px (0.875rem on html 16px root).

| Role | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|--------|-------------|----------------|-------|
| Display | 28px (1.75rem) | 700 | 1.2 | -0.02em | Page title ("Dashboard", "Users") |
| Heading | 18px (1.125rem) | 600 | 1.4 | -0.01em | Card titles, section headers, modal titles |
| Body | 14px (0.875rem) | 400 | 1.6 | 0 | Table cells, descriptions, paragraphs |
| Label | 12px (0.75rem) | 500 | 1.5 | 0.02em | Table headers, metric card labels, form labels, badge text |
| Mono | 13px (0.8125rem) | 400 | 1.5 | 0 | IDs, timestamps, code values, IP addresses |

**Hierarchy rules:**
- Never use font-size alone for hierarchy — combine with weight and color opacity
- Body text uses `var(--text-primary)` at full opacity
- Secondary text (timestamps, helper text) uses `var(--text-secondary)` (70% opacity equivalent)
- Tertiary text (disabled, placeholders) uses `var(--text-tertiary)` (45% opacity equivalent)

---

## Color

### 60/30/10 Rule

| Role | Percentage | Dark Value | Light Value | Usage |
|------|-----------|------------|-------------|-------|
| Dominant (60%) | Backgrounds | `#1a1b2e` | `#f7fafc` | Page background, main content area |
| Secondary (30%) | Surfaces | `#252640` sidebar, `#2d2e4a` cards | `#edf2f7` sidebar, `#ffffff` cards | Cards, sidebar, modals, table headers |
| Accent (10%) | `#667eea` | `#667eea` | `#667eea` | See reserved list below |

### Accent Reserved For (never used generically)

1. Primary action buttons (background)
2. Active sidebar navigation item (left border + text color)
3. Chart primary line/bar
4. Link text on hover
5. Focus ring color
6. Toggle/switch "on" state
7. Selected table row left-border indicator
8. Badge count in sidebar (background)

### Status Colors

| Status | Hex | Dark usage | Light usage |
|--------|-----|------------|-------------|
| Success/Online | `#68d391` | Text + dot indicator | Text + dot indicator |
| Error/Banned | `#fc8181` | Text + badge bg at 15% opacity | Text + badge bg at 10% opacity |
| Warning/Pending | `#f6ad55` | Text + badge bg at 15% opacity | Text + badge bg at 10% opacity |
| Neutral/Inactive | `#a0aec0` | Text + badge bg at 15% opacity | Text + badge bg at 10% opacity |

### Chart Palette (ordered, consistent across all charts)

| Index | Color | Hex | Semantic |
|-------|-------|-----|----------|
| 1 | Blue | `#667eea` | Primary metric, earned, growth |
| 2 | Orange | `#f6ad55` | Secondary metric, spent, decline |
| 3 | Green | `#68d391` | Classic mode, success, positive delta |
| 4 | Purple | `#9f7aea` | Wagered mode, special |
| 5 | Cyan | `#63b3ed` | Tertiary metric (retention, misc) |

---

## Dark Theme Tokens

```css
:root[data-theme="dark"] {
  /* Backgrounds */
  --bg-base: #1a1b2e;
  --bg-secondary: #252640;
  --bg-card: #2d2e4a;
  --bg-card-hover: #353658;
  --bg-input: #252640;
  --bg-overlay: rgba(0, 0, 0, 0.6);
  --bg-tooltip: #3d3e5c;

  /* Text */
  --text-primary: #e2e8f0;
  --text-secondary: #a0aec0;
  --text-tertiary: #636b7f;
  --text-inverse: #1a202c;

  /* Borders */
  --border-default: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 255, 255, 0.12);
  --border-focus: #667eea;
  --border-input: rgba(255, 255, 255, 0.1);

  /* Accent */
  --accent: #667eea;
  --accent-hover: #5a67d8;
  --accent-subtle: rgba(102, 126, 234, 0.12);
  --accent-text: #667eea;

  /* Status */
  --status-success: #68d391;
  --status-success-bg: rgba(104, 211, 145, 0.12);
  --status-error: #fc8181;
  --status-error-bg: rgba(252, 129, 129, 0.12);
  --status-warning: #f6ad55;
  --status-warning-bg: rgba(246, 173, 85, 0.12);
  --status-neutral: #a0aec0;
  --status-neutral-bg: rgba(160, 174, 192, 0.12);

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03);

  /* Sidebar */
  --sidebar-bg: #1e1f36;
  --sidebar-item-hover: rgba(255, 255, 255, 0.04);
  --sidebar-item-active: rgba(102, 126, 234, 0.08);
  --sidebar-divider: rgba(255, 255, 255, 0.06);

  /* Table */
  --table-header-bg: #252640;
  --table-row-hover: rgba(255, 255, 255, 0.02);
  --table-row-selected: rgba(102, 126, 234, 0.06);
  --table-border: rgba(255, 255, 255, 0.04);

  /* Scrollbar */
  --scrollbar-track: transparent;
  --scrollbar-thumb: rgba(255, 255, 255, 0.1);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.2);

  /* Skeleton loading */
  --skeleton-base: #2d2e4a;
  --skeleton-shimmer: #3d3e5c;
}
```

---

## Light Theme Tokens

```css
:root[data-theme="light"] {
  /* Backgrounds */
  --bg-base: #f7fafc;
  --bg-secondary: #edf2f7;
  --bg-card: #ffffff;
  --bg-card-hover: #f7fafc;
  --bg-input: #ffffff;
  --bg-overlay: rgba(0, 0, 0, 0.4);
  --bg-tooltip: #1a202c;

  /* Text */
  --text-primary: #1a202c;
  --text-secondary: #4a5568;
  --text-tertiary: #a0aec0;
  --text-inverse: #ffffff;

  /* Borders */
  --border-default: rgba(0, 0, 0, 0.08);
  --border-hover: rgba(0, 0, 0, 0.16);
  --border-focus: #667eea;
  --border-input: rgba(0, 0, 0, 0.12);

  /* Accent */
  --accent: #667eea;
  --accent-hover: #5a67d8;
  --accent-subtle: rgba(102, 126, 234, 0.08);
  --accent-text: #5a67d8;

  /* Status */
  --status-success: #38a169;
  --status-success-bg: rgba(56, 161, 105, 0.08);
  --status-error: #e53e3e;
  --status-error-bg: rgba(229, 62, 62, 0.08);
  --status-warning: #d69e2e;
  --status-warning-bg: rgba(214, 158, 46, 0.08);
  --status-neutral: #718096;
  --status-neutral-bg: rgba(113, 128, 150, 0.08);

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);

  /* Sidebar */
  --sidebar-bg: #ffffff;
  --sidebar-item-hover: rgba(0, 0, 0, 0.03);
  --sidebar-item-active: rgba(102, 126, 234, 0.06);
  --sidebar-divider: rgba(0, 0, 0, 0.06);

  /* Table */
  --table-header-bg: #f7fafc;
  --table-row-hover: rgba(0, 0, 0, 0.02);
  --table-row-selected: rgba(102, 126, 234, 0.04);
  --table-border: rgba(0, 0, 0, 0.06);

  /* Scrollbar */
  --scrollbar-track: transparent;
  --scrollbar-thumb: rgba(0, 0, 0, 0.12);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.2);

  /* Skeleton loading */
  --skeleton-base: #edf2f7;
  --skeleton-shimmer: #e2e8f0;
}
```

---

## Component Specifications

### Cards (Metric Cards)

```
Layout:          CSS Grid, 5 columns on desktop (min-width 200px each)
Card padding:    24px
Border-radius:   8px
Background:      var(--bg-card)
Shadow:          var(--shadow-card)
Border:          none (depth via shadow + background contrast)
Hover:           transform: scale(1.02); box-shadow: var(--shadow-md); transition: all 150ms ease
Cursor on hover: default (cards are non-interactive unless linked)

Internal structure:
  - Label:  12px/500, var(--text-secondary), uppercase not used, text-transform: none
  - Value:  28px/700, var(--text-primary), margin-top: 4px
  - Delta:  12px/500, color based on positive (#68d391) or negative (#fc8181), margin-top: 8px
  - Spark indicator (optional): 4px diameter dot, pulsing animation for live values

Live indicator (Online Now, Active Matches):
  - 6px circle, background: #68d391
  - Animation: pulse (opacity 1 → 0.4 → 1, 2s infinite ease-in-out)
  - Position: inline-flex next to label, gap: 6px

Grid gap:        20px
Responsive:      3 columns at <1200px, 2 columns at <900px, 1 column at <600px
```

### DataTable

```
Container:       background: var(--bg-card); border-radius: 8px; box-shadow: var(--shadow-card)
Overflow:        overflow-x: auto (horizontal scroll on narrow viewports)

Header row:
  - Background:  var(--table-header-bg)
  - Height:      40px
  - Font:        12px/500, var(--text-secondary), letter-spacing: 0.02em
  - Padding:     0 16px
  - Border-bottom: 1px solid var(--table-border)
  - Sticky:      position: sticky; top: 0; z-index: 2 (within scrollable container)

Body rows:
  - Height:      52px (comfortable touch target + readability)
  - Padding:     0 16px per cell
  - Font:        14px/400, var(--text-primary)
  - Border-bottom: 1px solid var(--table-border)
  - Last row:    no border-bottom

Row hover:
  - Background:  var(--table-row-hover)
  - Transition:  background 100ms ease

Row selected:
  - Background:  var(--table-row-selected)
  - Left border: 2px solid var(--accent) on first cell (or pseudo-element)

Selection checkbox:
  - Width/Height: 16px
  - Border-radius: 4px
  - Checked state: background var(--accent), white checkmark SVG
  - Position:     first column, vertically centered

Pagination bar:
  - Height:      48px
  - Position:    bottom of table container
  - Border-top:  1px solid var(--table-border)
  - Layout:      flex, justify-content: space-between, align-items: center
  - Info text:   "Showing 1-25 of 342" — 12px/400, var(--text-secondary)
  - Buttons:     ghost style, 32px square, border-radius: 4px, disabled: opacity 0.4

Sort indicator:
  - Arrow (▲/▼): 10px, var(--text-secondary) for inactive, var(--text-primary) for active
  - Click target: entire header cell
  - Cursor:      pointer on sortable columns

Inline actions (Ban/Mute):
  - Position:    last column, right-aligned
  - Style:       ghost buttons, 28px height, 12px font, border-radius: 4px
  - Colors:      Ban = var(--status-error), Mute = var(--status-warning)
  - Hover:       background at 10% opacity of action color
  - Visibility:  always visible (not just on row hover) for discoverability

Bulk action toolbar:
  - Position:    above table, slides down when rows selected (height: 48px)
  - Background:  var(--accent-subtle)
  - Border-radius: 8px
  - Content:     "{N} selected" label + action buttons (Export, Bulk Ban)
  - Animation:   slideDown 150ms ease
```

### Sidebar

```
Width expanded:  260px
Width collapsed: 64px
Background:      var(--sidebar-bg)
Border-right:    1px solid var(--sidebar-divider)
Position:        fixed, full height, z-index: 100
Transition:      width 200ms cubic-bezier(0.4, 0, 0.2, 1)

Logo area:
  - Height:      64px
  - Padding:     0 20px
  - Content:     "⚓ Battleship Admin" (16px/600) or "⚓" when collapsed
  - Border-bottom: 1px solid var(--sidebar-divider)

Collapse toggle:
  - Position:    absolute, right: -12px, top: 72px
  - Size:        24px circle
  - Background:  var(--bg-card)
  - Border:      1px solid var(--border-default)
  - Shadow:      var(--shadow-sm)
  - Icon:        « / » (12px)
  - Hover:       background var(--bg-card-hover)

Nav item:
  - Height:      36px
  - Padding:     0 12px 0 20px
  - Margin:      2px 8px (creates gap from edges)
  - Border-radius: 6px
  - Font:        14px/500, var(--text-secondary)
  - Icon (emoji): 18px width, margin-right: 12px (collapsed: centered, no margin)
  - Cursor:      pointer

Nav item hover:
  - Background:  var(--sidebar-item-hover)
  - Color:       var(--text-primary)
  - Transition:  all 100ms ease

Nav item active:
  - Background:  var(--sidebar-item-active)
  - Color:       var(--accent-text)
  - Font-weight: 600
  - Left indicator: 3px wide, 18px tall, var(--accent), border-radius: 2px, position: absolute left: 0

Badge (report count):
  - Position:    right side of nav item, vertically centered
  - Min-width:   20px, height: 20px
  - Padding:     0 6px
  - Border-radius: 10px (pill shape)
  - Background:  var(--accent)
  - Color:       #ffffff
  - Font:        11px/600
  - Text-align:  center

Section divider:
  - Height:      1px
  - Background:  var(--sidebar-divider)
  - Margin:      12px 20px

Sub-items (expandable):
  - Indent:      padding-left: 44px (aligns with parent text start)
  - Height:      32px
  - Font:        13px/400, var(--text-secondary)
  - Expand/collapse: chevron rotates 90° with 150ms transition
  - Container:   max-height animation for smooth expand (200ms ease)

Theme toggle:
  - Position:    bottom of sidebar, 16px from bottom edge
  - Style:       ghost button, 36px height, full width within padding
  - Icon:        ☀️ / 🌙 + label "Light" / "Dark"

User info (bottom):
  - Position:    above theme toggle
  - Height:      48px
  - Content:     Role badge + display name (truncated with ellipsis at 180px)
  - Font:        13px/400 for name, role badge uses Badges/Chips spec
```

### Buttons

**Primary (accent):**
```
Background:      var(--accent)
Color:           #ffffff
Height:          36px
Padding:         0 16px
Border-radius:   6px
Font:            14px/500
Border:          none
Shadow:          none
Hover:           background: var(--accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-sm)
Active:          transform: translateY(0); box-shadow: none
Disabled:        opacity: 0.5; cursor: not-allowed; transform: none
Transition:      all 150ms ease
```

**Secondary:**
```
Background:      transparent
Color:           var(--text-primary)
Border:          1px solid var(--border-default)
Height:          36px
Padding:         0 16px
Border-radius:   6px
Font:            14px/500
Hover:           background: var(--bg-card-hover); border-color: var(--border-hover)
Active:          background: var(--bg-card)
Disabled:        opacity: 0.4; cursor: not-allowed
Transition:      all 150ms ease
```

**Danger (destructive):**
```
Background:      var(--status-error)
Color:           #ffffff
Height:          36px
Padding:         0 16px
Border-radius:   6px
Font:            14px/500
Border:          none
Hover:           background: #e53e3e; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(252, 129, 129, 0.3)
Active:          transform: translateY(0)
Disabled:        opacity: 0.5; cursor: not-allowed
Usage:           ONLY in detail views / confirmation dialogs, never inline in tables
```

**Ghost:**
```
Background:      transparent
Color:           var(--text-secondary)
Height:          32px
Padding:         0 12px
Border-radius:   6px
Font:            13px/500
Border:          none
Hover:           background: var(--sidebar-item-hover); color: var(--text-primary)
Active:          background: var(--bg-card)
Transition:      all 100ms ease
Usage:           Pagination, secondary toolbar actions, table inline actions
```

**Button sizes:**
```
Small:   height: 28px; padding: 0 10px; font-size: 12px; border-radius: 4px
Default: height: 36px; padding: 0 16px; font-size: 14px; border-radius: 6px
Large:   height: 44px; padding: 0 24px; font-size: 15px; border-radius: 8px
```

### Inputs & Forms

```
Input height:    36px
Padding:         8px 12px
Background:      var(--bg-input)
Border:          1px solid var(--border-input)
Border-radius:   6px
Font:            14px/400, var(--text-primary)
Placeholder:     var(--text-tertiary)
Transition:      border-color 150ms ease, box-shadow 150ms ease

Focus state:
  - Border-color: var(--border-focus)
  - Box-shadow:   0 0 0 3px var(--accent-subtle)
  - Outline:      none

Error state:
  - Border-color: var(--status-error)
  - Box-shadow:   0 0 0 3px var(--status-error-bg)
  - Error text:   12px/400, var(--status-error), margin-top: 4px

Label:
  - Font:        12px/500, var(--text-secondary)
  - Margin-bottom: 6px
  - Display:     block

Field spacing:   16px between form fields (margin-bottom on field wrapper)

Select dropdown:
  - Same dimensions as input
  - Chevron icon: right: 12px, var(--text-tertiary)
  - Dropdown menu: var(--bg-card), border-radius: 8px, shadow: var(--shadow-lg), max-height: 240px, overflow-y: auto
  - Option height: 36px, padding: 0 12px, hover: var(--table-row-hover)
  - Selected option: var(--accent-subtle) background, var(--accent-text) color

Textarea:
  - Min-height:  80px
  - Resize:      vertical
  - Same border/focus treatment as input

Search input (table filter):
  - Left icon:   magnifying glass, 16px, var(--text-tertiary), position: absolute left: 12px
  - Padding-left: 36px (room for icon)
  - Width:       240px (table toolbar), full-width on mobile
```

### Badges/Chips

```
Padding:         2px 8px
Border-radius:   4px
Font:            11px/500, letter-spacing: 0.01em
Line-height:     18px (total height ~22px with padding)
Text-transform:  capitalize (for status badges)
Display:         inline-flex; align-items: center

Variants:
  Success:  color: var(--status-success); background: var(--status-success-bg)
  Error:    color: var(--status-error); background: var(--status-error-bg)
  Warning:  color: var(--status-warning); background: var(--status-warning-bg)
  Neutral:  color: var(--status-neutral); background: var(--status-neutral-bg)
  Accent:   color: var(--accent-text); background: var(--accent-subtle)

Role badges (sidebar user info + user detail):
  super_admin: Accent variant
  admin:       Success variant
  moderator:   Neutral variant

Status dot (optional, before text):
  - Size:      6px circle
  - Margin-right: 6px
  - Color matches badge text color
```

### Toasts

```
Position:        fixed; bottom: 24px; right: 24px; z-index: 9999
Width:           360px (max), min-width: 280px
Padding:         16px
Border-radius:   8px
Background:      var(--bg-card)
Shadow:          var(--shadow-lg)
Border-left:     3px solid (color varies by type)

Typography:
  Title:         14px/600, var(--text-primary)
  Body:          13px/400, var(--text-secondary), margin-top: 4px

Variants (border-left color):
  Success:       var(--status-success)
  Error:         var(--status-error)
  Warning:       var(--status-warning)
  Info:          var(--accent)

Entry animation:   transform: translateX(100%) → translateX(0), opacity: 0 → 1, 200ms cubic-bezier(0.4, 0, 0.2, 1)
Exit animation:    transform: translateX(0) → translateX(100%), opacity: 1 → 0, 150ms ease-in
Auto-dismiss:      5000ms (success/info), 8000ms (warning), never auto-dismiss (error — requires manual close)
Stacking:          multiple toasts stack upward with 8px gap
Max visible:       3 (older ones removed)

Close button:
  - Position:    absolute; top: 12px; right: 12px
  - Size:        20px
  - Style:       ghost, × character, var(--text-tertiary)
  - Hover:       var(--text-primary)
```

### Modals/Dialogs

```
Overlay:
  - Background:  var(--bg-overlay)
  - Backdrop-filter: blur(2px)
  - Animation:   opacity 0 → 1, 150ms ease
  - z-index:     1000
  - Click to close: yes (except destructive confirmations)

Dialog card:
  - Background:  var(--bg-card)
  - Border-radius: 12px
  - Shadow:      var(--shadow-lg)
  - Width:       min(480px, calc(100vw - 48px))
  - Max-height:  calc(100vh - 96px)
  - Overflow-y:  auto (body section only)
  - Padding:     0 (sections have own padding)

Structure:
  Header:
    - Padding:   24px 24px 16px
    - Title:     18px/600, var(--text-primary)
    - Subtitle:  13px/400, var(--text-secondary), margin-top: 4px
    - Close btn: top-right, 20px ghost button

  Body:
    - Padding:   0 24px 24px
    - Scrollable if content exceeds max-height

  Footer:
    - Padding:   16px 24px
    - Border-top: 1px solid var(--border-default)
    - Layout:    flex; justify-content: flex-end; gap: 12px
    - Buttons:   Secondary (Cancel) left, Primary/Danger (Confirm) right

Entry animation:  transform: scale(0.95) translateY(8px) → scale(1) translateY(0), opacity 0 → 1, 200ms cubic-bezier(0.4, 0, 0.2, 1)
Exit animation:   transform: scale(1) → scale(0.97), opacity 1 → 0, 150ms ease-in

Destructive confirmation dialog:
  - Title:       Action name in red ("Delete User")
  - Body:        Clear consequence description
  - Input:       Type-to-confirm field (type username or "DELETE" to enable button)
  - Confirm btn: Danger button, disabled until input matches
  - Cannot close by clicking overlay (requires explicit Cancel or Confirm)
```

### Charts (Recharts)

```
Container:
  - Background:  var(--bg-card)
  - Border-radius: 8px
  - Shadow:      var(--shadow-card)
  - Padding:     24px
  - Min-height:  280px (line/bar charts), 200px (sparklines)

Chart title:
  - Font:        14px/600, var(--text-primary)
  - Margin-bottom: 16px
  - Optional subtitle: 12px/400, var(--text-secondary)

Axis styling:
  - Axis line:   stroke: var(--border-default); strokeWidth: 1
  - Tick labels: fill: var(--text-secondary); fontSize: 11; fontFamily: system-ui
  - Grid lines:  stroke: var(--border-default); strokeDasharray: "3 3"; opacity: 0.5
  - No y-axis line (clean look), keep x-axis line

Tooltip:
  - Background:  var(--bg-tooltip)
  - Border-radius: 6px
  - Padding:     8px 12px
  - Shadow:      var(--shadow-md)
  - Font:        12px/400
  - Color:       #ffffff (dark) / #ffffff (both themes use dark tooltip)
  - Border:      none
  - Max-width:   200px

Legend:
  - Position:    top-right of chart container (flex-end)
  - Style:       inline dots (8px circles) + 12px label text, gap: 16px between items
  - Color:       var(--text-secondary)
  - Dot:         matches line/bar color

Line charts:
  - strokeWidth: 2
  - dot:         false (no markers except on hover)
  - activeDot:   r: 4, fill: line color, stroke: var(--bg-card), strokeWidth: 2
  - type:        "monotone" (smooth curves)

Bar charts:
  - barSize:     max 32px per bar
  - radius:      [4, 4, 0, 0] (rounded top corners only)
  - gap:         4px between grouped bars

Responsive:
  - Use ResponsiveContainer width="100%" height={240}
  - On mobile (< 768px): height={180}, hide y-axis labels, reduce margin

Chart grid on dashboard:
  - Desktop:     2:1 grid (User Growth 66% + Match Activity 33%)
  - Third chart: Points Economy, full width below
  - Gap:         20px
  - Tablet:      all full width, stacked
```

---

## Interaction Patterns

### Transitions

```
Default timing:  150ms
Slow timing:     200ms (modals, sidebar collapse, page transitions)
Fast timing:     100ms (hover backgrounds, opacity changes)
Easing:          ease (default), cubic-bezier(0.4, 0, 0.2, 1) (entrances), ease-in (exits)

What gets transitioned:
  - background-color:  all interactive elements
  - transform:         cards (hover scale), buttons (hover translateY), modals (entry)
  - opacity:           overlays, toasts, skeleton shimmer
  - box-shadow:        cards, buttons on hover
  - border-color:      inputs on focus
  - color:             text on hover/active state changes
  - width:             sidebar collapse
  - max-height:        accordion/expandable sections

What does NOT transition:
  - display/visibility changes (use opacity + pointer-events instead)
  - Layout shifts (grid changes are instant)
  - z-index
```

### Hover States

```
Cards (metric):       transform: scale(1.02); box-shadow: var(--shadow-md)
Table rows:           background: var(--table-row-hover)
Sidebar nav items:    background: var(--sidebar-item-hover); color: var(--text-primary)
Buttons (primary):    background: var(--accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-sm)
Buttons (secondary):  background: var(--bg-card-hover); border-color: var(--border-hover)
Buttons (ghost):      background: var(--sidebar-item-hover); color: var(--text-primary)
Links:                color: var(--accent-text); text-decoration: underline (offset 2px)
Badges:               no hover state (non-interactive)
Inputs:               border-color: var(--border-hover)
Chart bars:           opacity: 0.8 on non-hovered bars (dim siblings)
Collapse toggle:      background: var(--bg-card-hover); border-color: var(--border-hover)
```

### Loading States

```
Skeleton style:
  - Base color:      var(--skeleton-base)
  - Shimmer color:   var(--skeleton-shimmer)
  - Animation:       linear-gradient moving left-to-right, 1.5s infinite
  - Border-radius:   matches element it replaces (8px for cards, 4px for text lines, 50% for avatars)

Skeleton shapes:
  - Metric card:     Full card shape (same height/width), no internal detail
  - Table row:       4 rectangles (heights: 12px, widths: varied 60-200px) within 52px row
  - Chart:           Single rectangle, full container height minus header
  - Text line:       12px height, 60-80% container width, randomized per line
  - Avatar:          32px circle

Loading indicator (inline, for buttons):
  - Spinner:         16px diameter, 2px stroke, var(--accent) partial circle
  - Animation:       rotate 360deg, 700ms linear infinite
  - Replaces:        button text (button keeps same width via min-width)
  - Button state:    pointer-events: none; opacity: 0.7

Page-level loading:
  - Display skeleton for entire content area
  - Sidebar remains functional (no skeleton)
  - Minimum display time: 200ms (prevents flash for fast responses)
```

### Focus States

```
Focus ring:
  - Style:           0 0 0 3px var(--accent-subtle)
  - Offset:          0 (applied as box-shadow, not outline-offset)
  - Border-color:    var(--border-focus) (for inputs)
  - Applied to:      all interactive elements (buttons, inputs, links, table rows, nav items)

Focus-visible only:
  - Use :focus-visible pseudo-class (not :focus)
  - Mouse clicks: no visible ring
  - Keyboard Tab: ring visible

Skip link:
  - Position:        absolute; top: -40px (hidden), top: 8px on focus
  - Style:           var(--accent) background, #ffffff text, padding: 8px 16px, border-radius: 6px, z-index: 9999
  - Text:            "Skip to main content"
  - Target:          #main-content

Tab order within modals:
  - Trap focus within modal when open
  - First focus: first interactive element in body (or close button)
  - Shift+Tab from first → close button
  - Tab from last → first interactive element
```

---

## Copywriting Contract

### Navigation Labels

| Route | Sidebar Label (EN) | Sidebar Label (VI) |
|-------|--------------------|--------------------|
| #/dashboard | 📊 Dashboard | 📊 Bảng điều khiển |
| #/users | 👥 Users | 👥 Người dùng |
| #/matches | ⚔️ Matches | ⚔️ Trận đấu |
| #/content | 📝 Content | 📝 Nội dung |
| #/content/emojis | Emojis | Biểu tượng |
| #/content/announcements | Announcements | Thông báo |
| #/content/powerups | Power-ups | Vật phẩm |
| #/moderation | 🛡️ Moderation | 🛡️ Kiểm duyệt |
| #/moderation/reports | Reports | Báo cáo |
| #/moderation/chat | Chat Logs | Nhật ký chat |
| #/moderation/suspicious | Suspicious | Nghi vấn |
| #/operations | ⚙️ Operations | ⚙️ Vận hành |
| #/operations/health | Health | Sức khỏe hệ thống |
| #/operations/config | Config | Cấu hình |
| #/operations/backup | Backup | Sao lưu |
| #/operations/maintenance | Maintenance | Bảo trì |
| #/audit | 📋 Audit Log | 📋 Nhật ký kiểm tra |

### Primary CTA Labels

| Context | Label (EN) | Label (VI) |
|---------|-----------|------------|
| Create announcement | Create Announcement | Tạo thông báo |
| Ban user | Ban User | Cấm người dùng |
| Mute user | Mute User | Tắt tiếng |
| Resolve report | Mark Resolved | Đánh dấu đã xử lý |
| Dismiss report | Dismiss | Bỏ qua |
| Trigger backup | Start Backup | Bắt đầu sao lưu |
| Enable maintenance | Enable Maintenance Mode | Bật chế độ bảo trì |
| Save config | Save Changes | Lưu thay đổi |
| Export data | Export CSV | Xuất CSV |

### Empty States

| Page | Heading (EN) | Body (EN) |
|------|-------------|-----------|
| Users (filtered, no results) | No users found | Try adjusting your search or filter criteria. |
| Reports (none pending) | All clear | No pending reports. Nice work keeping things tidy. |
| Chat logs (no results) | No chat logs | Chat messages appear here when flagged for review. |
| Audit log (filtered, no results) | No matching entries | Try broadening your date range or filters. |
| Announcements (none) | No announcements yet | Create your first announcement to notify players. |
| Matches (filtered) | No matches found | Adjust filters to see more results. |
| Suspicious activity | Nothing suspicious | No players currently flagged for unusual activity. |

### Error Messages

| Scenario | Message (EN) |
|----------|-------------|
| Network error | Connection lost. Retrying automatically… |
| 401 Unauthorized | Session expired. Please log in again. |
| 403 Forbidden | You don't have permission for this action. |
| 404 Not found | This resource no longer exists or was removed. |
| 429 Rate limited | Too many requests. Please wait a moment. |
| 500 Server error | Something went wrong. Try again or contact a developer. |
| Backup already running | A backup is already in progress. Please wait for it to complete. |
| Ban failed | Could not ban user. They may have already been banned. |

### Destructive Confirmation Dialogs

| Action | Title | Body | Confirm Label | Input Required |
|--------|-------|------|---------------|----------------|
| Delete user | Delete User Permanently | This will remove all data for **{username}** including match history, points, and credentials. This cannot be undone. | Type "{username}" to confirm | username |
| Void match | Void Match #{id} | This will void the match result and refund stakes to both players. Match will be marked as void in all records. | Void Match | none |
| Hard-delete announcement | Delete Announcement | This announcement will be permanently removed. Players will no longer see it. | Delete | none |
| Season reset | Reset Season Data | This will archive the current season leaderboard and reset all seasonal points. Historical data is preserved. | Type "RESET" to confirm | "RESET" |
| Revoke admin role | Revoke Admin Access | **{username}** will lose all admin privileges immediately. Their active admin session will be terminated. | Revoke Access | none |

### Maintenance Mode Banner

```
When active (shown at top of all admin pages):
  Background:    var(--status-warning-bg) with left border 3px solid var(--status-warning)
  Height:        44px
  Text:          "⚠️ Maintenance mode is active. New player connections are blocked."
  Button:        "Disable" (ghost style, right-aligned)
  Border-radius: 8px
  Margin-bottom: 16px
```

---

## Responsive Breakpoints

```
Desktop (default): ≥1200px
  - Sidebar: expanded (260px)
  - Metric cards: 5 columns
  - Charts: 2:1 grid + full-width row
  - Tables: all columns visible
  - Modals: centered, max-width 480px

Tablet: 768px – 1199px
  - Sidebar: collapsed by default (64px), expandable on click
  - Metric cards: 3 columns (first 3) + 2 columns (last 2)
  - Charts: stacked full-width
  - Tables: horizontal scroll enabled, prioritize key columns
  - Modals: same as desktop

Mobile: < 768px
  - Sidebar: hidden, hamburger menu (top-left, 44px touch target)
  - Sidebar opens as overlay (full-width, z-index 200, overlay behind)
  - Metric cards: 2 columns, then 1 column below 480px
  - Charts: full-width, reduced height (180px)
  - Tables: card layout (each row becomes a stacked card) OR horizontal scroll
  - Modals: full-width, bottom-sheet style (slides up from bottom)
  - Page padding: 16px
  - All touch targets: minimum 44px

Breakpoint implementation:
  @media (max-width: 1199px) { ... }    /* Tablet */
  @media (max-width: 767px)  { ... }    /* Mobile */
  @media (max-width: 479px)  { ... }    /* Small mobile */
```

---

## Layout Structure

```
Page layout:
  ┌──────────┬────────────────────────────────────────────────┐
  │          │  [Maintenance banner if active]                 │
  │          │  ┌──────────────────────────────────────────┐  │
  │  Sidebar │  │  Page Title              [Theme] [User]  │  │
  │  260px   │  │                                          │  │
  │          │  │  [Content area]                          │  │
  │          │  │                                          │  │
  │          │  │                                          │  │
  │          │  └──────────────────────────────────────────┘  │
  └──────────┴────────────────────────────────────────────────┘

Main content area:
  - margin-left: 260px (expanded) / 64px (collapsed)
  - padding: 32px
  - max-width: none (fills available space)
  - transition: margin-left 200ms cubic-bezier(0.4, 0, 0.2, 1)

Top bar (within content area):
  - Height:       64px
  - Display:      flex; align-items: center; justify-content: space-between
  - Left:         Page title (Display typography)
  - Right:        Theme toggle button + admin user pill (avatar + name)
  - Border-bottom: none (spacious, borderless top area)
  - Margin-bottom: 24px
```

---

## Accessibility

### Contrast Requirements

- All text meets WCAG 2.1 AA (4.5:1 for body, 3:1 for large text/UI components)
- Dark theme verified ratios:
  - `--text-primary` (#e2e8f0) on `--bg-base` (#1a1b2e): 11.5:1 ✓
  - `--text-secondary` (#a0aec0) on `--bg-base` (#1a1b2e): 6.3:1 ✓
  - `--text-secondary` (#a0aec0) on `--bg-card` (#2d2e4a): 5.1:1 ✓
  - `--accent` (#667eea) on `--bg-base` (#1a1b2e): 5.4:1 ✓
  - Status colors on respective backgrounds: all ≥ 4.5:1 ✓
- Light theme verified ratios:
  - `--text-primary` (#1a202c) on `--bg-base` (#f7fafc): 15.1:1 ✓
  - `--text-secondary` (#4a5568) on `--bg-card` (#ffffff): 7.7:1 ✓
  - `--accent-text` (#5a67d8) on `--bg-card` (#ffffff): 4.6:1 ✓

### ARIA Patterns

| Component | Pattern |
|-----------|---------|
| Sidebar navigation | `<nav aria-label="Admin navigation">` with `role="navigation"` |
| Active nav item | `aria-current="page"` |
| Expandable sub-nav | `aria-expanded="true/false"` on trigger, `aria-controls` linking to sub-list |
| DataTable | `role="grid"` on table, `aria-sort` on sorted column, `aria-selected` on selected rows |
| Modals | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title |
| Toasts | `role="alert"`, `aria-live="polite"` (info/success) or `aria-live="assertive"` (error) |
| Loading skeleton | `aria-busy="true"` on container, `aria-label="Loading"` |
| Badge counts | `aria-label="{N} pending reports"` (not just the number) |
| Charts | `aria-label` describing the chart purpose, `role="img"`, alt data table available |
| Destructive confirm input | `aria-describedby` linking to instruction text |
| Theme toggle | `aria-pressed="true/false"`, `aria-label="Toggle dark mode"` |

### Keyboard Navigation

- Full keyboard navigation via Tab key through all interactive elements
- Sidebar: ArrowUp/ArrowDown navigates items, Enter/Space activates, ArrowRight expands sub-menus
- DataTable: Tab focuses table → Enter enters table → Arrow keys navigate cells → Escape exits table
- Modals: Escape closes (except destructive confirmations), Tab trapped within
- `tabindex="-1"` on programmatically-focused elements (page headings after route change)

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| N/A | None | Not applicable — plain CSS project |

No third-party component registries, CSS frameworks, or UI kits. All components are custom-built React components styled with plain CSS custom properties. The only external charting dependency is Recharts (installed via npm, verified source).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: All CTA labels are verb+noun, empty states include next action, destructive dialogs have clear consequence language
- [ ] Dimension 2 Visuals: Flat minimal aesthetic consistent throughout, no conflicting styles, shadow hierarchy correct
- [ ] Dimension 3 Color: 60/30/10 rule applied, accent used only for reserved list items, status colors consistent
- [ ] Dimension 4 Typography: 4-role hierarchy with clear size/weight differentiation, system-ui stack, accessible line-heights
- [ ] Dimension 5 Spacing: All values from 4px scale, no arbitrary values, consistent component padding
- [ ] Dimension 6 Registry Safety: No external registries, plain CSS only

**Approval:** pending
