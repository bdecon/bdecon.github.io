# Design System

This document defines the visual language and component library for bd-econ.com. Every element on the site should trace back to a decision here. If something isn't covered, it should be added — not improvised inline.

## Principles

1. **One way to do each thing.** A tooltip is a tooltip. A select is a select. They look the same everywhere.
2. **Decisions live in CSS variables and shared classes.** Pages consume them, they don't redefine them.
3. **Semantic HTML first.** The right element (`<article>`, `<details>`, `<table>`) with the right class. No `<div>` soup.
4. **Progressive specificity.** Global defaults are sensible. `.prose` adds reading-optimized spacing. Page-specific classes handle only what's genuinely unique.
5. **No defensive CSS.** If a page needs to undo a global rule, the global rule is wrong.

---

## Page Types

Every page is one of these. The type determines the layout skeleton.

### Navigation pages
`index.html`, `python.html`, `reports.html`

- Card grids, callout intro, minimal prose
- No chart containers
- Structure: `<main><section><article class="prose">` (intro) + `<article class="card-grid">` (cards)

### Guides (tutorials)
`getstarted.html`, `imfapi1-3.html`, `blsapi.html`, `beaapi.html`, `censusapi.html`, `censusapi2.html`, `treasuryapi.html`, `cps.html`

- Long-form reading content with code blocks and data tables
- `.tutorial-meta` bar, `.prose` wrapper, `.dataframe` tables
- Structure: `<main><section><article class="card-grid">` (nav cards) + `<article class="prose">` (content)

### Dashboards
`indicators.html`, `gdpm.html`, `imfweo.html`, `calendar.html`

- Interactive charts, controls, data tables
- Chart.js canvases, `.chart-container`, `.form-select` controls
- Structure: `<main><section><article>` (chart area) + `<article class="prose">` (methodology/about)

### Reports
`childcare_test.html` (and future reports)

- Long-form narrative with embedded charts, maps, interactive elements
- `.prose` wrapper throughout, charts inline
- Structure: `<main><section><article class="prose">` (entire document)

### Single pages
`about.html`, `chartbook.html`

- Unique layouts, minimal shared patterns
- Structure: `<main><section><article class="prose">`

---

## Design Tokens (CSS Variables)

These are the decisions. Everything else derives from them.

### Already defined in `:root`

```
--font            Inter
--font-ui         var(--font)       Controls, labels, UI chrome
--radius          0                 Sharp corners everywhere
--text-xs         12px
--text-sm         14px
--text-base       16px
--text-lg         17px
--text-xl         clamp(16-18px)
--text-2xl        clamp(18-20px)
--text-3xl        clamp(20-24px)
--text-4xl        clamp(24-32px)
```

### Spacing

No variables — just 10 allowed px values. New rules should use one of these:
```
2    4    6    8    12    16    20    24    32    40
```
Typography spacing (p, li margins) uses em to scale with font size. Nav uses 14px/50px (structural, tied to nav height).

### Accent colors

Set via `.accent-{color}` class on a parent. Children read `var(--accent)`.
```
blue    #3450B2     Charts, WEO, IMF
green   #229a54     Chartbook, BEA
red     #E04040     GDP, BLS, brand
orange  #ca5c00     Census, calendar
purple  #553581     Treasury
teal    #2A8A8A     Childcare, CPS
ltblue  #4A90C4     Getting started
brown   #8B6914     Calendar
```

---

## Shared Components

Each has one definition in `style.css`. Pages use them as-is or extend with a page-specific class.

### Layout

| Class | Purpose | Key properties |
|-------|---------|---------------|
| `.prose` | Readable content wrapper | max-width: 760px, generous h/p margins |
| `.card-grid` | Auto-fit grid of nav cards | CSS grid, 300px columns |
| `.info-box` | Highlighted metadata container | bg-highlight, border, padding |

### Chart

| Class | Purpose |
|-------|---------|
| `.chart-container` | Outer wrapper — border, background |
| `.chart-header` | Colored top bar — uses `var(--accent)` |
| `.chart-header-indicator` | Subtitle line in header |
| `.chart-body` | Canvas/content area |
| `.chart-subtitle` | Italic unit label |
| `.chart-footer` | Source line + logo |
| `.chart-source` | Italic right-aligned source text |
| `.chart-compact` | Tighter padding variant |
| `.chart-legend` | Legend container (font-size, font-family) |
| `.chart-legend-item` | Clickable legend entry |
| `.chart-tooltip` | Floating data label — position, bg, color, opacity, transition |
| `.chart-tooltip-header` | Bold header row inside tooltip |
| `.chart-nav-btn` | Bordered navigation button |
| `.chart-download-link` | Small download text link |

### Forms

| Class | Purpose |
|-------|---------|
| `.form-select` | Styled select/input — border, padding, font, bg, color |
| `.toggle-group` | Flex container for segmented buttons |
| `.toggle-btn` | Individual toggle — border, font, transitions |
| `.toggle-btn.active` | Active state — bg/border from `var(--accent)`, white text |

### Typography (within `.prose`)

| Element | Size | Margin | Notes |
|---------|------|--------|-------|
| `h2` | `--text-3xl` | 40px top, 12px bottom | Section headings |
| `h3` | `--text-2xl` | 40px top, 12px bottom | Subsection headings |
| `h4` | `--text-lg` | 32px top, 12px bottom | `--color-text-light` |
| `p` | `--text-base` | 1.5em bottom | Reading spacing |
| `li` | `--text-base` | 0.4em bottom | |

Outside `.prose`, headings get only font-size (no margin, no color override). Paragraphs get `0.75em` bottom margin.

### Tables

| Class | Purpose |
|-------|---------|
| (bare `table`) | Just `border-collapse` + `width: 100%` — safe neutral defaults |
| `.dataframe` | Tutorial data tables — center-aligned, bold first col, zebra rows |

Page-specific tables (`.scores-table`, `.cal-grid`, `.cc-table`) define their own styling from the neutral base.

### Navigation

| Class | Purpose |
|-------|---------|
| `.nav-card` / `.nav-card-muted` | Clickable card with colored header |
| `.nav-card-head` | Colored top section |
| `.nav-card-body` | White bottom section |
| `.nav-card-banner` | Thin image strip |
| `.page-strip` | Full-width photo banner below nav |
| `.subfooter` | Sibling page links at bottom |

### Article components

| Class | Purpose |
|-------|---------|
| `.callout` | Border-left accent intro block |
| `.blockquote-accent` | Styled blockquote with accent border |
| `.highlight-accent` | Inline colored background span |
| `.details-section` | Collapsible `<details>` with triangle marker |
| `.tutorial-meta` | Date/difficulty/share bar on guide pages |
| `.step-label` | Uppercase label with accent underline |
| `.hr-accent` | Short centered colored rule |
| `.section-bar` | Full-width colored bar |

### Utility

| Class | Purpose |
|-------|---------|
| `.sr-only` | Screen reader only — visually hidden |
| `.noscript-warning` | Fallback message when JS is disabled |
| `.skip-link` | Keyboard skip-to-main link |

---

## Decisions to Make

These are open questions where we need to pick one answer and apply it everywhere.

### 1. Chart container max-width

Currently varies: 480px (imfweo, gdpm), 580px (indicators), 620px (childcare), 600px (desktop override on imfweo). Should there be 1-2 standard widths?

Options:
- A. Single width for all charts (e.g., 640px)
- B. Two widths: narrow (480px) for single-series, wide (640px+) for complex charts
- C. Keep page-specific (current approach)

### 2. Chart header share/download buttons

Two patterns exist: `.weo-share` (vertical stack, icon buttons) and `.ind-share` (horizontal, icon buttons). Should these merge into one `.chart-share` component?

### 3. Info box variants

Currently: `div.info-box` (generic), `div.info-box.info-section` (gdpm), `div.info-box.weo-info` (imfweo), `div.info-box.bio` (about). Are these all the same component with modifiers, or different components?

### ~~4. Mobile strategy~~ DECIDED

Two standard breakpoints:
- **760px** — main mobile/desktop split (all pages)
- **500px** — small phone compact mode (only for complex layouts like childcare)

### ~~5. Spacing system~~ DECIDED

No variables. Consolidated to 10 allowed px values: **2, 4, 6, 8, 12, 16, 20, 24, 32, 40**. Nav-related 14px/50px are structural exceptions. Typography spacing (paragraph/list margins) uses em. All rem values converted to px. Inline CSS in HTML files still needs a normalization pass.

### ~~6. Color use in body text~~ DECIDED

Three tiers, clearly named by visual weight:
- `--color-text-dark` (#1e1e1e / #efefef) — headings, strong emphasis
- `--color-text-medium` (#555 / #c8c8c8) — body text, readable content
- `--color-text-light` (#888 / #999) — meta, captions, sources, controls

Old variables `--color-text-gray`, `--color-text-muted`, `--color-text-subtle`, `--color-heading-gray` are eliminated.

### ~~7. Dark mode completeness~~ DECIDED

Dark mode works via CSS variable overrides in style.css. Shared components get dark mode automatically. Only page-specific elements with hardcoded colors need inline `[data-theme="dark"]` rules. Current state: 21/23 pages need zero inline dark mode CSS. When building new elements, use existing variables first — only write a dark mode override when no variable covers the color.

---

## What This Enables

Once these decisions are made and the system is in place:

- **Adding a new dashboard** means picking an accent color and writing the chart logic. The container, header, tooltip, controls, legend, and footer all come from shared CSS.
- **Adding a new guide** means writing the content inside `<article class="prose">`. Typography, spacing, code blocks, and tables are automatic.
- **Changing a design detail** (e.g., tooltip background opacity) means editing one rule in style.css. It updates everywhere.
- **Dark mode** works for every shared component automatically.
- **Mobile** works from shared breakpoints, not per-page overrides.
