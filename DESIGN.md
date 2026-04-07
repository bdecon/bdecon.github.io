# Design System

This document defines the visual language and component library for bd-econ.com. Every element on the site should trace back to a decision here. If something isn't covered, it should be added — not improvised inline.

**Pattern library:** `kitchen-sink.html` shows every shared component rendered with labels.

## Principles

1. **One way to do each thing.** A tooltip is a tooltip. A select is a select. They look the same everywhere.
2. **Decisions live in CSS variables and shared classes.** Pages consume them, they don't redefine them.
3. **Semantic HTML first.** The right element (`<article>`, `<details>`, `<table>`) with the right class. No `<div>` soup.
4. **Progressive specificity.** Global defaults are sensible. `.prose` adds reading-optimized spacing. Page-specific classes handle only what's genuinely unique.
5. **No defensive CSS.** If a page needs to undo a global rule, the global rule is wrong.

---

## Fonts

Two fonts, self-hosted from `/fonts/` (woff2):

- **`--font: 'Lato'`** — Body text, paragraphs, buttons, controls, key-stat numbers
- **`--font-accent: 'Albert Sans'`** — Headings, nav, labels, table headers, footer, details summaries

Albert Sans weight assignments (Option B):
- **800** — h1, h2, h3, h4 headings, `.card-title`
- **700** — `.label`, table `th`, `.step-content h3/h4`, `.badge`
- **600** — footer left, `.details-section summary`
- **500** — nav links

---

## Design Tokens

### Type Scale (8 tokens, fluid)
```
--text-xs:   13px
--text-sm:   15px
--text-base: 16px
--text-lg:   17px
--text-xl:   clamp(16-18px)
--text-2xl:  clamp(18-20px)
--text-3xl:  clamp(20-24px)
--text-4xl:  clamp(24-32px)
```

### Spacing Scale (Swiss grid, 4px base, ~1.5x progression)
```
--space-1: 4px   --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 24px  --space-6: 32px  --space-7: 48px  --space-8: 64px
```

### Width Tiers
```
--width-page: 1080px    Page container max-width
--width-xl:   1030px    Card grids
--width-lg:    720px    Prose, footer, subfooter, calendar
--width-md:    600px    Charts, tables, dash-column
--width-sm:    400px    Small charts, selectors
```

### Text Colors (3 tiers)
```
--color-text-strong  #161616 / #efefef   Headings, emphasis
--color-text         #3a3a3a / #c8c8c8   Body paragraphs
--color-text-muted   #666 / #999         Captions, metadata
```

### Accent Colors
Set via `.accent-{color}` on a parent. Children read `var(--accent)`.
```
blue    #3d5a8a    WEO, IMF
green   #3a7a5a    Chartbook, BEA
red     #E04040    GDP, BLS, brand
orange  #9a6830    Census
purple  #5a4a70    Treasury
teal    #3a7878    Childcare, CPS
ltblue  #4a7a96    Getting started
brown   #7a6a3a    Calendar
```

### Transitions
```
--transition-fast:   0.15s ease    Hover states, toggles
--transition-normal: 0.2s ease     Border/color transitions
```

### Breakpoints
- **760px** — tablet (nav collapse, single column)
- **480px** — phone (tighter padding, 44px touch targets, stacked controls)

---

## Shared Components

Each has one definition in `style.css`. Pages use them as-is or extend with a page-specific class.

### Layout

| Class | Purpose |
|-------|---------|
| `.prose` | Readable content wrapper, max-width 720px |
| `.prose-report` | Justified long-form variant |
| `.card-grid` | Auto-fit grid of nav cards, 300px columns |
| `.split-row` | Side-by-side flex, stacks on mobile |
| `.dash-column` | Centered 600px column for dashboard sections |
| `.page-title` | Gray bar with centered white h1 |
| `.page-strip` | Full-width photo banner below nav |
| `.subfooter` | Sibling page navigation |
| `.grid-2` / `.grid-3` / `.grid-4` | Simple equal-width grids, stack on mobile |

### Cards

| Class | Purpose |
|-------|---------|
| `.card` | Universal bordered container. Set `.accent-{color}` on the card. |
| `.card-header` | Gray bg, 4px accent top border, flex space-between |
| `.card-title` | Card heading (Albert Sans 800). Alias: `.chart-title` (legacy) |
| `.card-subtitle` | Italic unit/description line. Alias: `.chart-subtitle` (legacy) |
| `.card-body` | Content area. Has its own heading/paragraph rhythm to prevent prose bleed. |
| `.card-footer` | Source line + logo |
| `.card-compact` | Tighter padding |
| `.card-chart` | Tight vertical padding for canvas |
| `.card-nav` | Clickable nav card with accent dot header |
| `.card-accent` | Border takes accent color, title takes accent color |
| `.card-actions` | Button container in card-header |
| `.card-muted` | 50% opacity, full on hover |

### Info Boxes

| Class | Purpose |
|-------|---------|
| `.info-box` | Secondary container, bg-alt background |
| `.info-box-tab` | Offset label plate above the box |
| `.info-box-accent` | Border takes accent color |

### Controls

| Class | Purpose |
|-------|---------|
| `.btn` | Selectable button. Active state uses `--accent` (fallback: gray). |
| `.btn-sm` / `.btn-lg` | Size variants |
| `.btn--pill` | Rounded pill shape |
| `.btn-group` | Joined segmented control |
| `.btn-primary` | Dark bg CTA/download button |
| `.form-select` | Styled select/input |
| `.control-panel` | Flex bar with top/bottom borders |
| `.control-row` | Label + input horizontal row |
| `.combo-box` / `.combo-list` / `.combo-item` | Autocomplete dropdown |
| `.details-section` | Collapsible `<details>` with triangle marker |
| `.tab-bar` | Horizontal tab navigation |
| `.tab` | Individual tab button. `.tab-bar-filled` for solid active bg. |

### Data Display

| Class | Purpose |
|-------|---------|
| `.key-stat` | Prominent number (Lato, text-3xl, bold) |
| `.stat-group` | Vertical stack: label + value + note/delta |
| `.stat-row` | Multiple stat-groups side by side |
| `.stat-row-inline` | Horizontal year + value + delta (WEO pattern) |
| `.stat-label` / `.stat-value` / `.stat-note` / `.stat-delta` | Stat sub-elements |
| `.data-list` | Key-value pairs with dividers |
| `.data-list-stacked` | Label above value variant |
| `.compare-cols` | Side-by-side comparison lists |
| `.compare-row-highlight` | Highlighted row in comparison |
| `.status-cell` | Color-coded status indicator |
| `.status-established` / `.status-partial` / `.status-planned` / `.status-none` | Status levels |

### Text Components

| Class | Purpose |
|-------|---------|
| `.label` | Small uppercase marker (Albert Sans 700) |
| `.step-label` | Label with accent underline |
| `.heading-accent` | Heading with text-width accent underline |
| `.callout` | Accent left-border intro block |
| `.blockquote-accent` | Styled blockquote with accent border |
| `.highlight-accent` | Inline colored background span |
| `.note` / `.chart-source` | Small muted text (same visual, different semantic role) |
| `.badge` | Tinted pill label |
| `.badge-solid` | Opaque bg, white text (agency labels) |
| `.alert` | Notification box with accent left border |
| `.empty-state` | "No data" placeholder |
| `.noscript-warning` | JS-disabled fallback |

### Tables

| Class | Purpose |
|-------|---------|
| base `table` | Border-collapse, zebra rows, hover, Space Mono headers |
| `.dash-table` | Right-aligned values, uppercase headers |
| `.dataframe` | Tutorial output, centered, sticky first column |
| `.table-wrap` | Horizontal scroll wrapper |

### Chart Elements

| Class | Purpose |
|-------|---------|
| `.chart-legend` / `.chart-legend-item` | Toggleable legend |
| `.chart-tooltip` / `.chart-tooltip-header` | Floating data label |
| `.chart-filter` | "Showing X–Y · Show all" text |
| `.chart-source` | Source attribution in card-footer |
| `.spinner` / `.spinner-sm` / `.spinner-lg` | CSS-only loading spinner |
| `.loading-overlay` | Covers parent, shows spinner centered |

### Media

| Class | Purpose |
|-------|---------|
| `figure` + `figcaption` | Image/chart with caption |
| `.figure-overlay` | Image with gradient caption overlay |
| `.figure-caption-bar` | Solid accent caption bar variant |

### Layout Utilities

| Class | Purpose |
|-------|---------|
| `.step-cards` / `.step-card` / `.step-number` | Numbered instruction sequence |
| `.trail-badge` | Difficulty level badge |
| `.tutorial-meta` | Date/difficulty/share bar |
| `.hr-accent` | Short centered colored rule |
| `.section-bar` | Full-width colored bar |

### Text Utilities

```
.text-center  .text-right  .text-mono  .text-muted  .text-strong  .text-sm  .text-xs
```

### Link Variants

```
.link-muted    Gray, no underline, darkens on hover
.link-plain    Inherits color, no underline, underlines on hover
```

---

## Page Types

### Guides (10 pages, 0 page-specific CSS)
Content in `<article class="prose">`. Everything else is automatic.

### Dashboards (4 pages)
Shared card/info-box/control-panel structure. Page-specific: chart max-width, mobile reorder, unique controls.

### Reports (`childcare.html`)
`.prose-report` justified text. Uses shared cards, tabs, info-boxes, compare-cols. Page-specific: decision tree, map, age coverage grid, infrastructure photos, feedback diagram. Styles in `childcare.css`.

### Nav pages (3 pages)
Card grids, callouts, minimal prose.

### Single pages (2 pages)
Unique layouts using shared primitives.

---

## CSS Files

- **`style.css`** (~2,065 lines) — All shared components + page-specific sections scoped by body class
- **`childcare.css`** (~273 lines) — Childcare report page-specific styles + dark mode overrides

---

## Cascade Rules

Card-body and info-box establish their own heading/paragraph/hr rhythm that overrides prose spacing:
- `.card-body :is(h2, h3, h4)` — 16px top, 8px bottom margin
- `.card-body p` — 12px bottom margin
- `.card-body hr` — 12px margin
- `.prose` h4 muted color does NOT bleed into nested cards/info-boxes

`.btn.active` falls back to `--color-text-muted` (gray) when no `--accent` is set.
