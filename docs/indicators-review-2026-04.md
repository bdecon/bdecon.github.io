# Indicators Page Review — April 2026

## What works well

- Chart rendering is solid — recession shading, reference lines, last-value labels, multi-series de-overlap logic
- Flip card packs info + data table into compact space
- Category icons in the grid menu are distinctive
- Dark mode, mobile layout, PNG export all work correctly
- 25 charts covering seven categories with consistent config-driven rendering from charts.json

## Where it feels dated

The fundamental interaction pattern is a **carousel**. One chart at a time, prev/next arrows, 25 clicks to see everything. This was the right call when building 25 charts was the hard part. But the hard part is solved — and what's left is a page where someone arrives, sees one chart, and has to guess whether anything else is interesting.

The best modern data pages — FRED, Our World in Data, the FT's visual storytelling, Bloomberg dashboards — share one thing: **you can see the shape of the economy at a glance**. The current page makes people browse for it.

## Directions to consider

### 1. Dashboard grid — the "state of the economy" view

Show all 25 indicators as small multiples (sparkline-sized cards with latest value and trend line) in a categorized grid. Click to expand any chart to the full interactive version. This is the single biggest UX change — it turns the page from "pick a chart" into "see the economy, then drill in."

The grid menu behind "Browse all charts" is halfway there — it just needs the sparklines.

### 2. Bigger charts when you drill in

The 600px max-width (`--width-md`) is tight. The gdpm page gets more room because of its split-row layout. When someone expands a chart, it could fill `--width-lg` (720px) or wider. More room means recession shading, reference lines, and last-value labels all breathe better.

### 3. Kill the flip card, show context inline

The flip card is clever but has a discovery problem — most visitors won't click the info button. Instead, put the description directly below the chart (collapsible or always visible), and put the data table in a tab or expandable section. The back-of-card stats table is genuinely useful — it just shouldn't require a 3D card flip to reach.

### 4. Time range controls like a financial chart

Instead of "Recent 3 years / Full history" as a text toggle in the footer, show preset buttons like `5Y | 10Y | 20Y | Max` in the chart header, the way any stock chart or FRED works. The `filterYears` config already exists — this would just expose more options.

### 5. Category context

When looking at the CPI chart, you might want to see "employment is at 80.7% and GDP is growing at 2.3%." A sidebar or footer strip of related category sparklines would give ambient context without leaving the chart.

### 6. Annotation layer

The 2% target line on CPI is effective. More charts could have these — the pre-COVID peak on employment, the zero line on trade balance with a label, the historical average on productivity. These turn a data chart into something that communicates a point.

### 7. Shareable identity

The PNG export is functional but plain. Charts could have a more distinctive visual signature — the accent-colored top border in the export, a consistent annotation style, something that makes a bd-econ chart recognizable when shared in Slack or a blog post.

## Key decision

The biggest choice is **#1**: should this page be a **dashboard** (see everything at once, drill into details) or a **gallery** (browse one chart at a time)?

The dashboard approach is more modern and more useful, but it's a bigger rebuild. The gallery approach can be improved incrementally. Everything else follows from that choice.

## Technical cleanup completed (2026-04-16)

In the same review session, these issues were fixed:

- **Timezone bug**: ~30 instances of bare `new Date(dateStr)` replaced with `parseDate()` helper that appends `T12:00:00` to prevent UTC midnight shift. Same fix applied to homepage sparkline. gdpm.js was already correct; imfweo.js has no date parsing.
- **IIFE wrap**: Entire indicators.js wrapped in IIFE to prevent global scope pollution. Only `window.refreshChartColors` exposed.
- **Dead code removed**: `getElementById('custom-chart')` references to non-existent element, unused `area`/`scatter` chart type configs, stale comments.
- **Deduplicated constants**: 5 inline `months` arrays → single `MONTHS` constant.
- **Inline handlers converted**: `onclick="toggleTimeRange()"` / `onclick="toggleBreakdown()"` → `addEventListener` in JS.
- **Lint fixes**: Plugin `chart` params renamed to `ch` to avoid shadowing, unused `index` params dropped, inner variable shadows renamed (`lines`→`wrapped`/`tipLines`, `data`→`rows`).
- **CSS**: Deprecated `clip: rect()` → `clip-path: inset(50%)`.
- **HTML**: Empty `src=""` → `src="data:,"` on sparkline placeholder img.
- **Remaining lint warnings (22)**: All intentional — `!= null` idioms (16x) and `ctx`/`filterEl` shadows in mutually exclusive code branches (6x).
