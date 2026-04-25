(function() {
	'use strict';

	// ============================================================
	// STATE MAP — multi-level choropleth (4 metrics × US+Nordic)
	//   L0: 2×2 overview of small-multiple tiles
	//   L1: single full-size map for one metric
	//   L2: zoom into a Census Division
	// See childcare.css for styling; #mapview in childcare.html for markup.
	// ============================================================

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════
const DATA_URL = "files/childcare_us.json";
const US_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json";
const NORDIC_TOPO_URL = "files/nordic_countries.json";

const DIVISIONS = {
  "New England":          ["09","23","25","33","44","50"],
  "Mid Atlantic":         ["34","36","42"],
  "East North Central":   ["17","18","26","39","55"],
  "West North Central":   ["19","20","27","29","31","38","46"],
  "South Atlantic":       ["10","11","12","13","24","37","45","51","54"],
  "East South Central":   ["01","21","28","47"],
  "West South Central":   ["05","22","40","48"],
  "Mountain":             ["04","08","16","30","32","35","49","56"],
  "Pacific":              ["02","06","15","41","53"],
};
const FIPS_TO_DIVISION = {};
for (const [div, fips] of Object.entries(DIVISIONS)) {
  for (const f of fips) FIPS_TO_DIVISION[f] = div;
}
const FIPS_TO_USPS = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL",
  "13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME",
  "24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH",
  "34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
};
const NORDIC_NUM_TO_ISO = {"208":"DNK","246":"FIN","578":"NOR","752":"SWE"};
// Use ISO3 everywhere (map labels + legend markers) so users can't confuse
// "FI" with Florida, "NO" with a USPS code, etc. States stay 2-letter USPS.
const NORDIC_NUM_TO_CODE = {"208":"DNK","246":"FIN","578":"NOR","752":"SWE"};

const METRIC_LABELS = {
  // `name`  = tab label + L0 tile title.
  // `title` = bold part of the chart title (shown at L1/L2 alongside `unit`).
  // `unit`  = non-bold unit string that sits next to `title`.
  // `short`/`high`  = Level 1 legend semantic endpoints (with context embedded).
  // `shortMini`/`highMini` = Level 0 mini-legend terse endpoints.
  // `nycLines` = callout label lines for NYC. Most metrics use 5-borough NYC;
  //              workforce uses the broader NYC Metro (MSA 35620).
  gdp_per_child_0_5:        { name: "Resources",  title: "GDP per child, age 0-5",                      unit: "Millions USD",    short: "4× world avg",    high: "9× world avg+",    shortMini:"Modest", highMini:"Very high", nycLines: ["NYC"],          caveat: "Author, see notes" },
  spending_pct_gdp_narrow:  { name: "Funding",    title: "Public childcare and pre-K funding",          unit: "% of GDP",        short: "Family burden",   high: "Publicly funded",  shortMini:"Low", highMini:"High", nycLines: ["NYC"],          caveat: "Author, see notes" },
  enrollment_pct:           { name: "Enrollment", title: "Public childcare and pre-K enrollment",       unit: "% of children",   short: "Few enrolled",    high: "Most enrolled",    shortMini:"Low", highMini:"High", nycLines: ["NYC"],          caveat: "Age 0-4 enrollment. Author, see notes", subtitleL0: "Public childcare and pre-K enrollment rate" },
  workforce_per_100_kids:   { name: "Workforce",  title: "Childcare and ECE workers per 100 children age 0-5",  unit: "",          short: "Small workforce", high: "Full workforce",   shortMini:"Low", highMini:"High", nycLines: ["NYC", "Metro"], caveat: "Formal workers only. Author, see notes", subtitleL0: "ECEC workers per 100 children age 0-5" },
};

// AK trim (keep mainland, drop far-west Aleutians)
const AK_TRIM_PAD = 0, AK_SHIFT_X = 0, HI_SHIFT_X = 0;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

// Per-metric color scale:
//   funding, workforce   → log (compresses Nordic high end, expands US variation)
//   gdp_per_child_0_5    → winsorized at 95th pct (caps DC outlier)
//   enrollment           → linear
// Returns { scale(v) → color, pos(v) → 0..1 on bar, domain, trueHi, type }.
function getColorScale(metricId, states, nordics, national) {
  const vals = [];
  Object.values(states).forEach(g => { const v = g[metricId]; if (v != null) vals.push(v); });
  Object.values(nordics).forEach(g => { const v = g[metricId]; if (v != null) vals.push(v); });
  if (national && national[metricId] != null) vals.push(national[metricId]);
  vals.sort(d3.ascending);
  let lo = vals[0], hi = vals[vals.length-1];
  if (lo === hi) { lo -= 0.01; hi += 0.01; }

  // Page-aware colorscale. Default is viridis inverted (dark = high). The
  // PPP-styled variant (`childcare_ppp.html`) swaps in d3.interpolateReds so
  // the choropleth sits in the PPP red palette.
  const isPPP = document.body.classList.contains("page-childcare-ppp");
  const viridis = isPPP
    ? t => d3.interpolateReds(0.15 + 0.8 * t)  // avoid pure white at low end
    : t => d3.interpolateViridis(1 - t);       // original: dark = high

  if (metricId === "spending_pct_gdp_narrow" || metricId === "workforce_per_100_kids") {
    const logLo = Math.max(lo, 0.01);
    const raw = d3.scaleSequentialLog(viridis).domain([logLo, hi]);
    const logSpan = Math.log(hi) - Math.log(logLo);
    return {
      scale: v => (v == null ? "var(--color-surface, #eee)" : raw(Math.max(v, logLo))),
      pos: v => (Math.log(Math.max(v, logLo)) - Math.log(logLo)) / logSpan,
      domain: [logLo, hi], trueHi: hi, type: "log",
    };
  }
  if (metricId === "gdp_per_child_0_5") {
    const p95 = d3.quantile(vals, 0.95) ?? hi;
    const raw = d3.scaleSequential(viridis).domain([lo, p95]);
    return {
      scale: v => (v == null ? "var(--color-surface, #eee)" : raw(Math.min(v, p95))),
      pos: v => Math.min(1, (v - lo) / (p95 - lo)),
      domain: [lo, p95], trueHi: hi, type: "winsorized",
    };
  }
  // Linear
  const raw = d3.scaleSequential(viridis).domain([lo, hi]);
  return {
    scale: v => (v == null ? "var(--color-surface, #eee)" : raw(v)),
    pos:   v => (v - lo) / (hi - lo),
    domain: [lo, hi], trueHi: hi, type: "linear",
  };
}
function fmtVal(v, metric) {
  if (v == null) return "—";
  if (metric === "gdp_per_child_0_5") return "$" + v.toFixed(2) + "M";
  if (metric === "workforce_per_100_kids") return v.toFixed(1);
  return v.toFixed(metric === "spending_pct_gdp_narrow" ? 2 : 1) + "%";
}

function trimAlaskaAndShift(usFC) {
  const ak = usFC.features.find(f => f.id === "02");
  const hi = usFC.features.find(f => f.id === "15");
  if (ak && ak.geometry.type === "MultiPolygon") {
    let mainlandIdx = 0, maxPts = 0;
    ak.geometry.coordinates.forEach((poly, i) => {
      if (poly[0].length > maxPts) { maxPts = poly[0].length; mainlandIdx = i; }
    });
    const mainland = ak.geometry.coordinates[mainlandIdx][0];
    const cutoff = d3.min(mainland, p => p[0]) + AK_TRIM_PAD;
    ak.geometry.coordinates = ak.geometry.coordinates.filter(poly => d3.max(poly[0], p => p[0]) >= cutoff);
    if (AK_SHIFT_X) {
      ak.geometry.coordinates = ak.geometry.coordinates.map(poly =>
        poly.map(ring => ring.map(([x,y]) => [x + AK_SHIFT_X, y])));
    }
  }
  if (hi && hi.geometry.type === "MultiPolygon" && HI_SHIFT_X) {
    hi.geometry.coordinates = hi.geometry.coordinates.map(poly =>
      poly.map(ring => ring.map(([x,y]) => [x + HI_SHIFT_X, y])));
  }
}

// Legend layout (viewBox 540 wide):
//   Row: numerics inline at bar ends (left/right of bar, vertically centered on bar)
//   Row: above-bar marker codes (ticks from bar top)
//   Row: the gradient bar
//   Row: below-bar marker codes (ticks from bar bottom)
//   Row: semantic qualitative labels at far left/right, below the markers
//
// This avoids crowding: numerics and markers used to collide on the same
// below-bar y-position. Numerics inline solves that cleanly and mirrors
// the pattern from the live map.
function renderLegend(svgSel, colorScale, metric, markers, opts) {
  const { showNumeric = true, showMarkers = true } = opts || {};
  const svg = d3.select(svgSel);
  svg.selectAll("*").remove();

  const lab = METRIC_LABELS[metric] || {short:"Low", high:"High", shortMini:"Low", highMini:"High"};
  const useMini = !showNumeric && !showMarkers;
  const leftSem  = useMini ? (lab.shortMini || "Low")  : lab.short;
  const rightSem = useMini ? (lab.highMini  || "High") : lab.high;

  // Numeric end-values (only shown at L1).
  const loLabel = showNumeric ? fmtVal(colorScale.domain[0], metric) : "";
  const hiLabel = showNumeric
    ? fmtVal(colorScale.domain[1], metric) + (colorScale.trueHi > colorScale.domain[1] ? "+" : "")
    : "";

  // Approximate widths @ 13px; 7px per char keeps this close enough for layout.
  const approxW = s => s.length * 7 + 6;
  const loW = showNumeric ? approxW(loLabel) : 0;
  const hiW = showNumeric ? approxW(hiLabel) : 0;
  const barX = showNumeric ? loW + 6 : 0;
  const barW = showNumeric ? (540 - loW - hiW - 12) : 540;
  const barY = showMarkers ? 28 : 18;
  const barH = 10;

  // Gradient
  const defs = svg.append("defs");
  const gid = "lg-" + svgSel.replace(/\W/g,"") + "-" + Math.floor(Math.random()*1e6);
  const grad = defs.append("linearGradient").attr("id", gid);
  const [lo, hi] = colorScale.domain;
  for (let i = 0; i <= 20; i++) {
    const t = i/20;
    let v;
    if (colorScale.type === "log") {
      const ll = Math.log(lo), lh = Math.log(hi);
      v = Math.exp(ll + t * (lh - ll));
    } else {
      v = lo + t * (hi - lo);
    }
    grad.append("stop").attr("offset", (i*5) + "%").attr("stop-color", colorScale.scale(v));
  }
  svg.append("rect").attr("class","legend-bar")
    .attr("x", barX).attr("y", barY).attr("width", barW).attr("height", barH)
    .attr("fill", `url(#${gid})`);

  // Inline numeric end-values at bar mid-height (baseline tuned for 13px font)
  if (showNumeric) {
    const numY = barY + barH/2 + 4;
    svg.append("text").attr("class","legend-label")
      .attr("x", 0).attr("y", numY).attr("text-anchor","start").text(loLabel);
    svg.append("text").attr("class","legend-label")
      .attr("x", 540).attr("y", numY).attr("text-anchor","end").text(hiLabel);
  }

  // Semantic qualitative labels at far left/right, BELOW the markers row.
  // Extra breathing room so the labels don't sit right against the codes.
  const semanticY = barY + barH + (showMarkers ? 38 : 14);
  svg.append("text").attr("class","legend-semantic")
    .attr("x", 0).attr("y", semanticY).text(leftSem);
  svg.append("text").attr("class","legend-semantic")
    .attr("x", 540).attr("y", semanticY).attr("text-anchor","end").text(rightSem);

  if (showMarkers && markers && markers.length) {
    // Merge near-duplicates into combined labels (e.g. "DK/NO")
    const mergePx = 8;
    const positioned = markers.slice().sort((a,b) => a.value - b.value).map(m => {
      const t = Math.max(0, Math.min(1, colorScale.pos(m.value)));
      return { label: m.label, value: m.value, x: barX + t * barW };
    });
    const merged = [];
    positioned.forEach(m => {
      const last = merged[merged.length - 1];
      if (last && Math.abs(m.x - last.x) <= mergePx) {
        last.label = last.label + "/" + m.label;
        last.x = (last.x + m.x) / 2;
      } else {
        merged.push({...m});
      }
    });

    // Greedy above/below with per-label width, respecting horizontal extents
    // so labels don't spill past the legend's bounds (0..540).
    let edgeAbove = -Infinity, edgeBelow = -Infinity;
    merged.forEach(m => {
      const w = approxW(m.label);
      const leftEdge = m.x - w/2;
      let above;
      if (leftEdge >= edgeAbove) above = true;
      else if (leftEdge >= edgeBelow) above = false;
      else above = (leftEdge - edgeAbove) >= (leftEdge - edgeBelow);
      if (above) edgeAbove = leftEdge + w + 2;
      else       edgeBelow = leftEdge + w + 2;

      svg.append("line").attr("class","legend-tick")
        .attr("x1", m.x).attr("x2", m.x)
        .attr("y1", above ? barY - 6 : barY + barH + 6)
        .attr("y2", above ? barY : barY + barH);
      svg.append("text").attr("class","legend-code")
        .attr("x", m.x).attr("y", above ? barY - 9 : barY + barH + 20)
        .attr("text-anchor","middle")
        .text(m.label);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// App state
// ═══════════════════════════════════════════════════════════════════════
const APP = {
  data: null, usFC: null, noTopo: null,
  stateBounds: null, pathFn: d3.geoPath(),
  currentMetric: null,     // null = Level 0; string = Level 1 metric id
  currentDivision: null,   // null = Level 1 default; string = drilled division name
  level1US: { gRef: null, defaultTransform: "" },
};

// ═══════════════════════════════════════════════════════════════════════
// Load + kick off at Level 0
// ═══════════════════════════════════════════════════════════════════════
Promise.all([
  d3.json(DATA_URL), d3.json(US_TOPO_URL), d3.json(NORDIC_TOPO_URL)
]).then(([data, usTopo, noTopo]) => {
  const usFC = topojson.feature(usTopo, usTopo.objects.states);
  trimAlaskaAndShift(usFC);
  const stateBounds = {};
  usFC.features.forEach(f => {
    stateBounds[String(f.id).padStart(2,"0")] = APP.pathFn.bounds(f);
  });
  Object.assign(APP, { data, usFC, noTopo, stateBounds });

  renderLevel0();
  wireLevel1Controls();

  // Mobile: skip Level 0 and go straight to Level 1 (Funding) with tabs.
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) {
    showLevel1("spending_pct_gdp_narrow");
    document.getElementById("level0-grid").style.display = "none";
  }
});

// ═══════════════════════════════════════════════════════════════════════
// LEVEL 0: 4 small-multiple tile-cards
// ═══════════════════════════════════════════════════════════════════════
function renderLevel0() {
  const { usFC, noTopo, data } = APP;
  const states = data.us.regions, nordics = data.nordics.regions;
  const METRICS = Object.keys(METRIC_LABELS);
  const grid = d3.select("#level0-grid");
  grid.selectAll("*").remove();

  const [[x0,y0],[x1,y1]] = APP.pathFn.bounds(usFC);
  const US_W = 255, US_H = 160;
  const kUS = Math.min(US_W/(x1-x0), US_H/(y1-y0)) * 0.96;
  const txUS = (US_W - kUS*(x0+x1))/2, tyUS = (US_H - kUS*(y0+y1))/2;

  const noFC = topojson.feature(noTopo, noTopo.objects.data);
  const NO_W = 60, NO_H = 90;
  const noProj = d3.geoMercator().fitSize([NO_W, NO_H], noFC);
  const noPath = d3.geoPath(noProj);

  METRICS.forEach(metric => {
    const cs = getColorScale(metric, states, nordics, data.us.national);

    const tile = grid.append("figure").attr("class","l0-tile report-figure")
      .attr("data-metric", metric);
    tile.on("click", () => showLevel1(metric));
    const card = tile.append("div").attr("class","card card-compact card-chart");
    const body = card.append("div").attr("class","card-body");
    body.append("h4").text(METRIC_LABELS[metric].name);
    // L0 subtitle: prefer an explicit short form if the metric supplies one,
    // otherwise fall back to "title (unit)". Unit parens are skipped when
    // the metric has no separate unit string.
    const m = METRIC_LABELS[metric];
    const subtitle = m.subtitleL0
      ? m.subtitleL0
      : (m.unit ? `${m.title} (${m.unit})` : m.title);
    body.append("p").attr("class","chart-subtitle").text(subtitle);

    const maps = body.append("div").attr("class","l0-maps");
    const usSvg = maps.append("svg").attr("class","l0-us-map")
      .attr("viewBox",`0 0 ${US_W} ${US_H + 12}`).attr("preserveAspectRatio","xMidYMid meet");
    usSvg.append("text").attr("class","map-region-label").attr("x", 2).attr("y", 9).text("US");
    usSvg.append("g").attr("transform", `translate(${txUS},${tyUS + 12}) scale(${kUS})`)
      .selectAll("path.region").data(usFC.features)
      .join("path").attr("class","region").attr("d", APP.pathFn)
      .attr("fill", d => cs.scale((states[String(d.id).padStart(2,"0")] || {})[metric]));

    const noSvg = maps.append("svg").attr("class","l0-nordic-map")
      .attr("viewBox",`0 0 ${NO_W} ${NO_H + 12}`).attr("preserveAspectRatio","xMidYMid meet");
    noSvg.append("text").attr("class","map-region-label").attr("x", 2).attr("y", 9).text("Nordics");
    noSvg.append("g").attr("transform",`translate(0,12)`).selectAll("path.region").data(noFC.features)
      .join("path").attr("class","region").attr("d", noPath)
      .attr("fill", d => cs.scale((nordics[String(d.id)] || {})[metric]));

    // ViewBox tall enough for the bar (y=18..28) plus semantic labels below (y~42)
    body.append("svg").attr("class","l0-legend")
      .attr("viewBox","0 0 540 50").attr("preserveAspectRatio","xMidYMid meet")
      .attr("id", `l0-legend-${metric}`);
    renderLegend(`#l0-legend-${metric}`, cs, metric, [], {showNumeric:false, showMarkers:false});
  });
}

// ═══════════════════════════════════════════════════════════════════════
// LEVEL 1: single expanded map for one metric
// ═══════════════════════════════════════════════════════════════════════
function showLevel1(metric) {
  // Preserve the drill state across tab changes. If the user is currently
  // at L2 for some division, switching tabs should land them at L2 for the
  // same division on the new metric — not bounce them back to L1 default.
  const preserveDiv = APP.currentDivision;
  APP.currentMetric = metric;
  APP.currentDivision = null;
  document.getElementById("level0-grid").style.display = "none";
  const lv1 = document.getElementById("level1-view");
  lv1.classList.add("visible");
  const grid = document.querySelector(".l1-grid");
  if (grid) grid.classList.remove("drilled");
  renderLevel1(metric);
  if (preserveDiv) drillIntoDivision(preserveDiv);
}

function showLevel0() {
  APP.currentMetric = null;
  APP.currentDivision = null;
  document.getElementById("level0-grid").style.display = "";
  document.getElementById("level1-view").classList.remove("visible");
}

function wireLevel1Controls() {
  // Single back button: at L2 returns to L1 (same metric); at L1 returns to L0.
  document.getElementById("l1-back").onclick = () => {
    if (APP.currentDivision) undrillDivision();
    else showLevel0();
  };
  document.querySelectorAll("#l1-tabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = btn.getAttribute("data-metric");
      if (m) showLevel1(m);
    });
  });
  wireSwipeNavigation();
}

// Swipe left/right on the map view changes tabs (mobile convenience).
// Only fires on predominantly-horizontal swipes above threshold distance.
function wireSwipeNavigation() {
  const view = document.getElementById("mapview");
  if (!view) return;
  const MIN_DIST = 50;          // px — below this counts as a tap, not a swipe
  const MAX_VERTICAL = 40;      // px — vertical drift allowed; more = ignore
  let startX = null, startY = null;

  view.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { startX = null; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  view.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;
    startX = null;
    if (Math.abs(dx) < MIN_DIST) return;
    if (Math.abs(dy) > MAX_VERTICAL) return;  // treat as scroll, not swipe
    // Only at Level 1 or 2 (skip when we're at L0 overview).
    if (!APP.currentMetric) return;
    const metrics = Object.keys(METRIC_LABELS);
    const idx = metrics.indexOf(APP.currentMetric);
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;  // swipe left → next tab
    if (nextIdx >= 0 && nextIdx < metrics.length) {
      showLevel1(metrics[nextIdx]);
    }
  }, { passive: true });
}

function setBackLabel() {
  const btn = document.getElementById("l1-back");
  if (!btn) return;
  const isMobile = window.matchMedia &&
    window.matchMedia("(max-width: 560px)").matches;
  btn.textContent = APP.currentDivision ? "← All states" : "← Overview";
  // On mobile, there's no Level 0 to return to — hide the button at L1
  // default. Show it at L2 so users can un-drill back to the all-states view.
  btn.style.display = (isMobile && !APP.currentDivision) ? "none" : "";
}

function renderLevel1(metric) {
  const { usFC, noTopo, data, stateBounds } = APP;
  const states = data.us.regions, nordics = data.nordics.regions, national = data.us.national;
  const cs = getColorScale(metric, states, nordics, national);
  APP.level1US.colorScale = cs;

  // Active tab
  document.querySelectorAll("#l1-tabs .tab").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-metric") === metric);
  });

  // Title (bold main phrase + muted indicator). When a metric has no unit
  // (e.g. workforce, where "per 100 children" is already in the title), hide
  // the indicator span entirely so no orphan "(unit)" appears.
  document.getElementById("l1-title-main").textContent = METRIC_LABELS[metric].title;
  const indSpan = document.getElementById("l1-title-indicator");
  indSpan.textContent = METRIC_LABELS[metric].unit;
  indSpan.style.display = METRIC_LABELS[metric].unit ? "" : "none";
  document.getElementById("l1-caveat").textContent = METRIC_LABELS[metric].caveat || "Author, see notes";

  // US map (default view, no drill)
  const svgUS = d3.select("#l1-us");
  svgUS.selectAll("*").remove();
  svgUS.append("text").attr("class","map-region-label region-us")
    .attr("x", 2).attr("y", 12).text("United States");
  const [[x0,y0],[x1,y1]] = APP.pathFn.bounds(usFC);
  // viewBox 540×420. Leave 18 for the "UNITED STATES" region label at top.
  const W = 540, H = 402, topPad = 18;
  const k = Math.min(W/(x1-x0), H/(y1-y0)) * 0.96;
  const tx = (W - k*(x0+x1))/2, ty = (H - k*(y0+y1))/2 + topPad;
  APP.level1US.defaultTransform = `translate(${tx},${ty}) scale(${k})`;
  APP.level1US.defaultK  = k;
  APP.level1US.defaultTx = tx;
  APP.level1US.defaultTy = ty;

  const g = svgUS.append("g").attr("transform", APP.level1US.defaultTransform);
  APP.level1US.gRef = g;

  g.selectAll("path.region").data(usFC.features).join("path")
    .attr("class","region").attr("d", APP.pathFn)
    .attr("fill", d => cs.scale((states[String(d.id).padStart(2,"0")] || {})[metric]))
    .on("click", (_, d) => {
      const div = FIPS_TO_DIVISION[String(d.id).padStart(2,"0")];
      // Ignore clicks that target the division already on screen.
      if (!div || div === APP.currentDivision) return;
      drillIntoDivision(div);
    });

  Object.entries(DIVISIONS).forEach(([divName, fipsList]) => {
    const divFeats = usFC.features.filter(f => fipsList.includes(String(f.id).padStart(2,"0")));
    g.append("path").attr("class","division-outline").attr("data-div", divName)
      .attr("d", APP.pathFn({type:"FeatureCollection", features: divFeats}));
  });

  // ── City callouts: invisible anchor at real city, short SE leader to
  // colored box, label stacked UNDER the box. Re-rendered when drilling so
  // anchors follow the transform. Offset differs between L1 and L2 because
  // the map zoom changes where "below Long Island" ends up in viewBox space.
  // At L2 we also append the value as a label line (two-line: code + value)
  // matching the state-label pattern.
  APP.level1US.renderCityCallouts = (kArg, txArg, tyArg, drilledDiv) => {
    const dcFeat = usFC.features.find(f => f.id === "11");
    const dcRaw = dcFeat ? APP.pathFn.centroid(dcFeat) : null;
    const nycProj = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
    const nycRaw = nycProj([-73.9857, 40.7484]);
    const nycLines = METRIC_LABELS[metric].nycLines || ["NYC"];

    const CALLOUTS = [
      {
        stateKey: "NYC", division: "Mid Atlantic", anchor: nycRaw,
        leaderOffsetL1: [22, 20],  // L1: up and right of NYC
        leaderOffsetL2: [48, 30],  // L2 Mid Atlantic: under Long Island
        lines: nycLines,
        value: (states["NYC"]||{})[metric],
      },
      {
        stateKey: "11", division: "South Atlantic", anchor: dcRaw,
        leaderOffsetL1: [32, 26],  // L1: right into Chesapeake
        leaderOffsetL2: [54, 26],  // L2: further right (zoomed, more room)
        lines: ["DC"],
        value: (states["11"]||{})[metric],
      },
    ];

    svgUS.selectAll(".insets").remove();
    const ig = svgUS.append("g").attr("class","insets");
    const BOX_SIZE = 12;
    const TEXT_GAP = 4;
    const TEXT_LINE_HEIGHT = 11;
    const proj = (rx, ry) => [rx * kArg + txArg, ry * kArg + tyArg];

    CALLOUTS.forEach(c => {
      if (!c.anchor) return;
      const [ax, ay] = proj(c.anchor[0], c.anchor[1]);
      const isDrilledHere = (drilledDiv === c.division);
      const [ldx, ldy] = isDrilledHere ? c.leaderOffsetL2 : c.leaderOffsetL1;
      const cx = ax + ldx, cy = ay + ldy;
      const bx = cx - BOX_SIZE/2, by = cy - BOX_SIZE/2;
      const unit = ig.append("g").attr("class","inset-unit")
        .attr("data-division", c.division);
      unit.append("line").attr("class","inset-leader")
        .attr("x1", ax).attr("y1", ay)
        .attr("x2", bx).attr("y2", by);
      const box = unit.append("g").attr("class","inset-box");
      box.append("rect")
        .attr("x", bx).attr("y", by)
        .attr("width", BOX_SIZE).attr("height", BOX_SIZE).attr("rx", 1)
        .attr("fill", cs.scale(c.value));
      // Label lines: first is the code (state-label = bold, 14px),
      // subsequent are sublabel/value (state-label-value = lighter, 11px).
      // At L2 we append the value so the callout mirrors the state labels.
      const lines = [...c.lines];
      if (isDrilledHere && c.value != null) lines.push(fmtVal(c.value, metric));
      lines.forEach((line, i) => {
        box.append("text")
          .attr("class", i === 0 ? "state-label" : "state-label-value")
          .attr("x", cx)
          .attr("y", by + BOX_SIZE + TEXT_GAP + 8 + i * TEXT_LINE_HEIGHT)
          .text(line);
      });
    });
  };
  APP.level1US.renderCityCallouts(k, tx, ty, null);

  // Nordic
  const svgN = d3.select("#l1-nordic");
  svgN.selectAll("*").remove();
  svgN.append("text").attr("class","map-region-label region-nordic")
    .attr("x", 2).attr("y", 10).text("Nordics");
  const noFC = topojson.feature(noTopo, noTopo.objects.data);
  // viewBox height 230; leave 15px top padding for the label
  const noProj = d3.geoMercator().fitSize([150, 215], noFC);
  const noPath = d3.geoPath(noProj);
  const noG = svgN.append("g").attr("transform","translate(0,15)");
  noG.selectAll("path.region").data(noFC.features)
    .join("path").attr("class","region").attr("d", noPath)
    .attr("fill", d => cs.scale((nordics[String(d.id)] || {})[metric]));
  // Country-code labels + value labels (value only visible at L2 via CSS).
  // Offsets tuned manually because Nordic centroids often sit in the sea
  // (Norway's arc, Sweden's length, Denmark's two landmasses). Nordic
  // viewBox is 150 wide × ~230 tall, so moves of 10–30 vbU are significant.
  const NORDIC_LABEL_OFFSETS = {
    "208": [-22, 2],   // Denmark — further left onto Jutland
    "246": [0, 22],    // Finland — further south
    "578": [-42, 10],  // Norway  — near top of body
    "752": [4, -18],   // Sweden  — up into central Sweden
  };
  noFC.features.forEach(f => {
    const id = String(f.id);
    const [cx, cy] = noPath.centroid(f);
    const off = NORDIC_LABEL_OFFSETS[id] || [0,0];
    const lx = cx + off[0], ly = cy + off[1];
    noG.append("text").attr("class","nordic-label")
      .attr("x", lx).attr("y", ly)
      .text(NORDIC_NUM_TO_CODE[id] || "");
    const val = (nordics[id] || {})[metric];
    noG.append("text").attr("class","nordic-label-value")
      .attr("x", lx).attr("y", ly + 7)
      .text(fmtVal(val, metric));
  });

  // Legend markers: USA + top state + bottom state + 4 Nordics
  //   For Resources, we also add a "World avg" marker for context (~$0.2M per
  //   child globally, from IMF WEO world GDP / UN WPP pop 0-5, as used in the
  //   live report's resources chart).
  const stateVals = Object.entries(states)
    .filter(([fips, g]) => g[metric] != null && fips !== "NYC")
    .map(([fips, g]) => [fips, g[metric]])
    .sort((a,b) => b[1] - a[1]);
  const topFips = stateVals[0][0], botFips = stateVals[stateVals.length-1][0];
  const uspsFor = f => FIPS_TO_USPS[f] || f;
  const legendMarkers = [
    { label: "USA", value: national[metric] },
    { label: uspsFor(topFips), value: stateVals[0][1] },
    { label: uspsFor(botFips), value: stateVals[stateVals.length-1][1] },
    ...Object.entries(nordics).map(([num, g]) => ({
      label: NORDIC_NUM_TO_CODE[num] || "?", value: g[metric],
    })),
  ];
  renderLegend("#l1-legend", cs, metric, legendMarkers);

  // Stats
  setNationalStats(states, nordics, national, metric);
  setBackLabel();
}

function drillIntoDivision(divName) {
  APP.currentDivision = divName;
  const fipsList = DIVISIONS[divName];
  const g = APP.level1US.gRef;
  const { stateBounds, data } = APP;
  const states = data.us.regions;
  const metric = APP.currentMetric;
  // Match the US SVG viewBox (540×420) for drill zoom calc.
  const W = 540, H = 400;

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  fipsList.forEach(f => {
    const b = stateBounds[f]; if (!b) return;
    if (b[0][0]<minX) minX=b[0][0]; if (b[0][1]<minY) minY=b[0][1];
    if (b[1][0]>maxX) maxX=b[1][0]; if (b[1][1]>maxY) maxY=b[1][1];
  });
  const dk = Math.min(W/(maxX-minX), H/(maxY-minY)) * 0.85;
  const dtx = (W - dk*(minX+maxX))/2, dty = (H - dk*(minY+maxY))/2;
  g.transition().duration(600).attr("transform", `translate(${dtx},${dty}) scale(${dk})`);
  g.selectAll("path.region").classed("faded",
    d => !fipsList.includes(String(d.id).padStart(2,"0")));
  g.selectAll(".division-outline").classed("active",
    function() { return d3.select(this).attr("data-div") === divName; });
  // Re-render insets using the drill transform. Pass the current division
  // so the L2 leaderOffset variant kicks in (and value-line appends).
  if (APP.level1US.renderCityCallouts) {
    APP.level1US.renderCityCallouts(dk, dtx, dty, divName);
  }
  // Then hide the callout that doesn't belong to the current division.
  d3.selectAll("#l1-us .inset-unit").each(function() {
    const unitDiv = this.getAttribute("data-division");
    this.style.display = (unitDiv === divName) ? "" : "none";
  });
  // Widen right column + enlarge Nordic map via .drilled class
  document.querySelector(".l1-grid").classList.add("drilled");

  // On-map labels at Level 2. IMPORTANT: labels are rendered in the US SVG
  // ROOT (not inside the drill-scaled <g>) so their font-size renders at
  // consistent screen pixels regardless of the zoom factor. We project each
  // state's centroid through the drill transform manually.
  // Only remove the state-label-layer group (its child labels go with it).
  // Must NOT broadly select ".state-label" — that class is also used on the
  // NYC/DC inset callout texts, which we don't want to nuke here.
  const svgUS = d3.select("#l1-us");
  svgUS.selectAll(".state-label-layer").remove();
  const labelLayer = svgUS.append("g").attr("class","state-label-layer");

  setTimeout(() => {
    // Offsets are in VIEWBOX units (540 wide). Entries serve two purposes:
    //   (1) small states: nudge label off-coast + draw leader line
    //   (2) irregular shapes (MI with UP, LA with delta, etc.): move label
    //       to the landmass center without a leader.
    // `leader: false` means the offset applies but no leader line is drawn.
    const STATE_OFFSETS = {
      // Small states — leader lines to off-coast positions
      "11": {dx: 22, dy: 20, leader: true},   // DC
      "10": {dx: 20, dy: 8,  leader: true},   // DE
      "44": {dx: 16, dy: 0,  leader: true},   // RI
      "09": {dx: -18, dy: 0, leader: true},   // CT
      "25": {dx: 18, dy: -8, leader: true},   // MA
      "33": {dx: 6,  dy: -14, leader: true},  // NH
      "50": {dx: -10, dy: -14, leader: true}, // VT
      "34": {dx: 18, dy: 0,  leader: true},   // NJ
      "24": {dx: -12, dy: -8, leader: true},  // MD — up and west off-coast
      "54": {dx: -12, dy: 0,  leader: false}, // WV — shift left (bounds center sits too far east)
      // Irregular shapes — centroid in water, nudge onto landmass (no leader)
      "26": {dx: 40, dy: 18, leader: false},  // MI — shift south onto mitten (away from UP)
      "22": {dx: -16, dy: -4, leader: false}, // LA — nudge further left off delta
      "51": {dx: 16, dy: 0,  leader: false},  // VA — shift right (DC inset crowds west edge)
      "40": {dx: 10, dy: 0,  leader: false},  // OK — shift right (panhandle pulls centroid west)
    };
    const smallThresholdPx = 26;
    // DC (FIPS 11) is labeled via its own callout inset — skip it here to
    // avoid a duplicate "DC / value" on top of the state.
    const SKIP_STATE_LABEL = new Set(["11"]);
    fipsList.forEach(f => {
      if (SKIP_STATE_LABEL.has(f)) return;
      const [[ax,ay],[bx,by]] = stateBounds[f];
      // Raw centroid in path space (pre-drill-transform)
      const cx = (ax+bx)/2, cy = (ay+by)/2;
      // Rendered pixel width after drill transform
      const widthPx  = (bx - ax) * dk;
      const heightPx = (by - ay) * dk;
      const isSmall = widthPx < smallThresholdPx || heightPx < smallThresholdPx;
      const off = STATE_OFFSETS[f];

      // Project BOTH centroid and label position through the drill transform
      // into SVG root viewBox coordinates.
      const px = cx * dk + dtx;
      const py = cy * dk + dty;
      const lx = off ? px + off.dx : px;
      const ly = off ? py + off.dy : py;

      if (off && off.leader) {
        labelLayer.append("line").attr("class","state-leader")
          .attr("x1", px).attr("y1", py).attr("x2", lx).attr("y2", ly);
      }
      // Two-line label: state code on top, value below (no tooltip needed).
      const stateVal = (states[f] || {})[metric];
      labelLayer.append("text").attr("class","state-label")
        .attr("x", lx).attr("y", ly + 0)
        .text(FIPS_TO_USPS[f]);
      labelLayer.append("text").attr("class","state-label-value")
        .attr("x", lx).attr("y", ly + 11)
        .text(fmtVal(stateVal, metric));
    });
  }, 100);

  // Title stays the same between L1 and L2 — the zoomed map + back button
  // make clear the user has drilled in; no need to surface the division name.
  setDivisionStats(divName, fipsList, states, data.us.national, data.nordics.regions, metric);
  setBackLabel();
}

function undrillDivision() {
  const g = APP.level1US.gRef;
  if (!g) return;
  const metric = APP.currentMetric;
  APP.currentDivision = null;
  g.transition().duration(500).attr("transform", APP.level1US.defaultTransform);
  g.selectAll("path.region").classed("faded", false);
  g.selectAll(".division-outline").classed("active", false);
  d3.select("#l1-us .state-label-layer").remove();
  // Re-render insets at L1 default transform so both callouts show correctly
  // at their un-zoomed city positions.
  if (APP.level1US.renderCityCallouts) {
    APP.level1US.renderCityCallouts(
      APP.level1US.defaultK, APP.level1US.defaultTx, APP.level1US.defaultTy, null
    );
  }
  document.querySelector(".l1-grid").classList.remove("drilled");
  const textPanel = document.getElementById("l1-text");
  if (textPanel) textPanel.style.display = "";
  setNationalStats(APP.data.us.regions, APP.data.nordics.regions, APP.data.us.national, metric);
  setBackLabel();
}

// Short name: turn full state name into a compact label that fits (e.g. "New Hampshire" → "NH")
function compactStateLabel(fullName) {
  const inv = Object.fromEntries(Object.entries(FIPS_TO_USPS).map(([f,u]) => [f, u]));
  // If fullName matches a state (via name lookup), use its USPS code. Otherwise return as-is.
  // Build name → usps map once.
  return fullName;  // fallback; we'll use USPS codes computed externally
}

// Lean 2-row stats: just US vs Nordic composite.
function setNationalStats(states, nordics, national, metric) {
  const dl = document.getElementById("l1-stats");
  const nordicAvg = d3.mean(Object.values(nordics).map(g => g[metric]));
  const natVal = national[metric];
  const rows = [
    ["United States", fmtVal(natVal, metric)],
    ["Nordics",       fmtVal(nordicAvg, metric)],
  ];
  dl.innerHTML = rows.map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const panelH4 = document.querySelector("#l1-text h4");
  if (panelH4) panelH4.textContent = "At a glance";
  const textPanel = document.getElementById("l1-text");
  if (textPanel) textPanel.style.display = "";
}

// L2 has no right panel — values live in the on-map labels and the legend.
function setDivisionStats() {
  const textPanel = document.getElementById("l1-text");
  if (textPanel) textPanel.style.display = "none";
}

})();

(function() {
	'use strict';

	// ============================================================
	// HERO DOT SPECTRUM — US national, hardcoded for instant render
	// ============================================================
	const US_CHILDCARE = { label: 'Childcare Workers', wage: 15.41 };

	// Manual layout: each peer has a fixed side ('above'/'below') and
	// tier (1 = closest to axis, 2 = further). Positioned by hand to
	// avoid all overlaps in the tight $14.61–$16.23 range.
	// Source: BLS OEWS May 2024 national file.
	const US_PEERS = [
		{ label: 'Fast Food\nCooks',        wage: 14.50, side: 'below', tier: 1 },
		{ label: 'Restaurant\nHosts',       wage: 14.61, side: 'above', tier: 1 },
		{ label: 'Fast Food\nWorkers',      wage: 14.65, side: 'below', tier: 1 },
		{ label: 'Sports Book\nWriters',    wage: 14.65, side: 'below', tier: 3 },
		{ label: 'Recreation\nWorkers',     wage: 14.66, side: 'above', tier: 3 },
		{ label: 'Ushers &\nAttendants',    wage: 14.98, side: 'below', tier: 2 },
		{ label: 'Cashiers',                wage: 14.99, side: 'above', tier: 1 },
		{ label: 'Shampooers',              wage: 15.13, side: 'below', tier: 1 },
		{ label: 'Dining\nAttendants',      wage: 15.71, side: 'above', tier: 1 },
		{ label: 'Gambling\nDealers',       wage: 16.00, side: 'below', tier: 1 },
		{ label: 'Animal\nCaretakers',      wage: 16.09, side: 'above', tier: 1 },
		{ label: 'Bartenders',              wage: 16.12, side: 'below', tier: 3 }
	];

	const heroSvg = d3.select('#wp-hero-svg');
	const heroContainer = document.getElementById('wp-hero-container');
	const wageMin = 14.50, wageMax = 16.19;

	const textColor = function() {
		return document.documentElement.getAttribute('data-theme') === 'dark' ? '#efefef' : '#1e1e1e';
	};
	const mutedColor = function() {
		return document.documentElement.getAttribute('data-theme') === 'dark' ? '#bbb' : '#666';
	};
	const tealColor = function() {
		return document.documentElement.getAttribute('data-theme') === 'dark' ? '#3aadad' : '#2A8A8A';
	};
	const peerDotColor = function() {
		return document.documentElement.getAttribute('data-theme') === 'dark' ? '#888' : '#aaa';
	};

	function drawHero() {
		heroSvg.selectAll('*').remove();

		const cw = heroContainer.clientWidth;
		const mobile = cw < 500;

		if (mobile) {
			drawHeroMobile();
		} else {
			drawHeroDesktop();
		}
	}

	function drawHeroDesktop() {
		const VW = 680, VH = 300;
		heroSvg.attr('viewBox', '0 0 ' + VW + ' ' + VH);

		const MARGIN = { left: 32, right: 8 };
		const axisY = 170;
		const x = d3.scaleLinear().domain([wageMin, wageMax]).range([MARGIN.left, VW - MARGIN.right]);
		const TIER_ABOVE = { 1: -22, 2: -56, 3: -90 };
		const TIER_BELOW = { 1: 20, 2: 56, 3: 92 };

		// Title
		heroSvg.append('text')
			.attr('x', VW / 2).attr('y', 22)
			.attr('text-anchor', 'middle')
			.attr('font-size', 20).attr('font-weight', 700)
			.attr('fill', textColor())
			.text('Who else is paid $15.41 an hour?');

		// Subtitle
		heroSvg.append('text')
			.attr('x', VW / 2).attr('y', 47)
			.attr('text-anchor', 'middle')
			.attr('font-size', 15.5).attr('font-weight', 400)
			.attr('fill', mutedColor())
			.text('Occupations paid closest to childcare workers in the US');


		// Axis arrowhead
		heroSvg.append('defs').append('marker')
			.attr('id', 'axis-arrow')
			.attr('viewBox', '0 0 8 8')
			.attr('refX', 8).attr('refY', 4)
			.attr('markerWidth', 18).attr('markerHeight', 18)
			.attr('orient', 'auto')
			.append('path')
			.attr('d', 'M 0 1 L 8 4 L 0 7 z')
			.attr('fill', mutedColor());

		// Axis line
		heroSvg.append('line')
			.attr('x1', x(14.50)).attr('x2', VW)
			.attr('y1', axisY).attr('y2', axisY)
			.attr('stroke', mutedColor()).attr('stroke-width', 0.5)
			.attr('marker-end', 'url(#axis-arrow)');

		// Peer dots, leader lines, labels + wages
		US_PEERS.forEach(function(p) {
			const px = x(p.wage);
			const tierMap = p.side === 'above' ? TIER_ABOVE : TIER_BELOW;
			const labelY = axisY + tierMap[p.tier];
			const lineStart = p.side === 'above' ? axisY - 4 : axisY + 4;
			const lines = p.label.split('\n');
			const isAbove = p.side === 'above';
			const lineH = 12; // line height for multi-line labels

			// Name first, wage underneath — on both sides
			let labelBaseY, wageY, lineEnd;
			if (isAbove) {
				// name at top, wage below name, line connects wage to axis
				wageY = labelY;
				labelBaseY = labelY - lineH;
				if (lines.length > 1) labelBaseY -= (lines.length - 1) * lineH;
				lineEnd = wageY + 5;
			} else {
				// name at top (near axis), wage below name
				labelBaseY = labelY;
				wageY = labelY + lines.length * lineH;
				lineEnd = labelBaseY - 10;
			}

			heroSvg.append('line')
				.attr('x1', px).attr('x2', px)
				.attr('y1', lineStart).attr('y2', lineEnd)
				.attr('stroke', mutedColor()).attr('stroke-width', 0.4)
				.attr('stroke-dasharray', '2,2');

			heroSvg.append('circle')
				.attr('cx', px).attr('cy', axisY)
				.attr('r', 3.5).attr('fill', peerDotColor());

			// Multi-line label
			const labelText = heroSvg.append('text')
				.attr('x', px).attr('y', labelBaseY)
				.attr('text-anchor', 'middle')
				.attr('font-size', 11.5).attr('fill', textColor());
			lines.forEach(function(line, i) {
				labelText.append('tspan')
					.attr('x', px)
					.attr('dy', i === 0 ? 0 : lineH)
					.text(line);
			});

			heroSvg.append('text')
				.attr('x', px).attr('y', wageY)
				.attr('text-anchor', 'middle')
				.attr('font-size', 11.5).attr('fill', textColor())
				.attr('opacity', 0.75)
				.text('$' + p.wage.toFixed(2));
		});

		// Childcare dot
		heroSvg.append('circle')
			.attr('cx', x(US_CHILDCARE.wage)).attr('cy', axisY)
			.attr('r', 6).attr('fill', tealColor());

		const ccLabel = heroSvg.append('text')
			.attr('x', x(US_CHILDCARE.wage)).attr('y', axisY - 46)
			.attr('text-anchor', 'middle')
			.attr('font-size', 16).attr('font-weight', 700)
			.attr('fill', tealColor());
		ccLabel.append('tspan')
			.attr('x', x(US_CHILDCARE.wage))
			.text('Childcare');
		ccLabel.append('tspan')
			.attr('x', x(US_CHILDCARE.wage))
			.attr('dy', '1.2em')
			.text('Workers');
		heroSvg.append('text')
			.attr('x', x(US_CHILDCARE.wage)).attr('y', axisY - 11)
			.attr('text-anchor', 'middle')
			.attr('font-size', 14).attr('font-weight', 600)
			.attr('fill', tealColor())
			.text('$15.41/hr');

		// Endpoint annotations
		const leftAnnot = heroSvg.append('text')
			.attr('x', 32).attr('y', axisY + 58)
			.attr('text-anchor', 'middle')
			.attr('font-size', 12).attr('fill', tealColor())
			.attr('font-weight', 600);
		leftAnnot.append('tspan')
			.attr('x', 32)
			.text('Lowest');
		leftAnnot.append('tspan')
			.attr('x', 32)
			.attr('dy', '1.0em')
			.text('paid');
		leftAnnot.append('tspan')
			.attr('x', 32)
			.attr('dy', '1.0em')
			.text('occ.');

		const rightAnnot = heroSvg.append('text')
			.attr('x', VW - 16).attr('y', axisY - 90)
			.attr('text-anchor', 'end')
			.attr('font-size', 16).attr('fill', tealColor())
			.attr('font-weight', 600);
		rightAnnot.append('tspan')
			.attr('x', VW - 16)
			.text('742 occupations');
		rightAnnot.append('tspan')
			.attr('x', VW - 16)
			.attr('dy', '1.3em')
			.text('paid more \u2192');

		// Source
		heroSvg.append('text')
			.attr('x', VW / 2).attr('y', VH - 14)
			.attr('text-anchor', 'middle')
			.attr('font-size', 14).attr('fill', mutedColor())
			.attr('font-style', 'italic')
			.text('Hourly median wages, 2024. Source: BLS OEWS.');
	}

	function drawHeroMobile() {
		const VW = 380, VH = 620;
		heroSvg.attr('viewBox', '0 -10 ' + VW + ' ' + (VH + 10));

		const axisX = VW / 2; // center the axis
		const MARGIN = { top: 80, bottom: 40 };
		const labelOffset = 32; // gap from axis to label text

		// Sort peers by wage for vertical layout
		const allPeers = US_PEERS.slice().sort(function(a, b) { return b.wage - a.wage; });

		// Insert childcare worker into the sorted list
		const allItems = [];
		let inserted = false;
		allPeers.forEach(function(p) {
			if (!inserted && US_CHILDCARE.wage >= p.wage) {
				allItems.push({ label: US_CHILDCARE.label, wage: US_CHILDCARE.wage, isChildcare: true });
				inserted = true;
			}
			allItems.push(p);
		});
		if (!inserted) allItems.push({ label: US_CHILDCARE.label, wage: US_CHILDCARE.wage, isChildcare: true });

		// Assign alternating sides: even index = right, odd = left
		// Childcare worker always goes right (prominent side)
		let sideCounter = 0;
		allItems.forEach(function(p) {
			if (p.isChildcare) {
				p.side = 'right';
			} else {
				p.side = (sideCounter % 2 === 0) ? 'right' : 'left';
				sideCounter++;
			}
		});

		const y = d3.scaleLinear()
			.domain([wageMax, wageMin])
			.range([MARGIN.top, VH - MARGIN.bottom]);

		// Title
		heroSvg.append('text')
			.attr('x', VW / 2).attr('y', 12)
			.attr('text-anchor', 'middle')
			.attr('font-size', 18).attr('font-weight', 700)
			.attr('fill', textColor())
			.text('Who else is paid $15.41/hr?');

		// Subtitle
		heroSvg.append('text')
			.attr('x', VW / 2).attr('y', 34)
			.attr('text-anchor', 'middle')
			.attr('font-size', 16).attr('font-weight', 400)
			.attr('fill', mutedColor())
			.text('Closest occupations by wage');


		// Axis arrowhead (points up = higher wage)
		heroSvg.append('defs').append('marker')
			.attr('id', 'axis-arrow-mobile')
			.attr('viewBox', '0 0 8 8')
			.attr('refX', 4).attr('refY', 0)
			.attr('markerWidth', 12).attr('markerHeight', 12)
			.attr('orient', '0')
			.append('path')
			.attr('d', 'M 1 8 L 4 0 L 7 8 z')
			.attr('fill', mutedColor());

		// Vertical axis line — starts at lowest wage, arrow at top
		heroSvg.append('line')
			.attr('x1', axisX).attr('x2', axisX)
			.attr('y1', y(14.50)).attr('y2', MARGIN.top)
			.attr('stroke', mutedColor()).attr('stroke-width', 0.7)
			.attr('marker-end', 'url(#axis-arrow-mobile)');

		// Draw all items
		allItems.forEach(function(p) {
			const py = y(p.wage);
			const dotR = p.isChildcare ? 7 : 4;
			const dotColor = p.isChildcare ? tealColor() : peerDotColor();
			const isRight = p.side === 'right';

			// Dot on axis
			heroSvg.append('circle')
				.attr('cx', axisX).attr('cy', py)
				.attr('r', dotR).attr('fill', dotColor);

			// Leader line
			const lineStart = isRight ? axisX + dotR + 4 : axisX - dotR - 4;
			const lineEnd = isRight ? axisX + labelOffset - 4 : axisX - labelOffset + 4;
			heroSvg.append('line')
				.attr('x1', lineStart).attr('x2', lineEnd)
				.attr('y1', py).attr('y2', py)
				.attr('stroke', p.isChildcare ? tealColor() : mutedColor())
				.attr('stroke-width', 0.5)
				.attr('stroke-dasharray', p.isChildcare ? 'none' : '2,2');

			// Label
			const labelX = isRight ? axisX + labelOffset : axisX - labelOffset;
			const anchor = isRight ? 'start' : 'end';
			const nudge = p.label.indexOf('Recreation') === 0 ? -14 : p.label.indexOf('Restaurant') === 0 ? 14 : p.label.indexOf('Sports Book') === 0 ? 14 : 0;

			if (p.isChildcare) {
				const ccText = heroSvg.append('text')
					.attr('x', labelX).attr('y', py - 10 + nudge)
					.attr('text-anchor', anchor)
					.attr('dominant-baseline', 'auto')
					.attr('font-size', 15)
					.attr('font-weight', 700)
					.attr('fill', tealColor());
				ccText.append('tspan').attr('x', labelX).text('Childcare');
				ccText.append('tspan').attr('x', labelX).attr('dy', '1.2em').text('Workers');
			} else {
				heroSvg.append('text')
					.attr('x', labelX).attr('y', py - 1 + nudge)
					.attr('text-anchor', anchor)
					.attr('dominant-baseline', 'auto')
					.attr('font-size', 12.5)
					.attr('font-weight', 400)
					.attr('fill', textColor())
					.text(p.label);
			}

			// Wage value
			heroSvg.append('text')
				.attr('x', labelX).attr('y', py + (p.isChildcare ? 22 : 13) + nudge)
				.attr('text-anchor', anchor)
				.attr('font-size', p.isChildcare ? 13 : 11)
				.attr('font-weight', p.isChildcare ? 600 : 400)
				.attr('fill', p.isChildcare ? tealColor() : mutedColor())
				.text('$' + p.wage.toFixed(2) + '/hr');
		});

		// Endpoint annotations
		// Bottom: "Lowest paid occ." — left side, aligned with Fast Food Cooks
		const lowestAnnot = heroSvg.append('text')
			.attr('x', axisX - labelOffset - 106).attr('y', y(14.50) - 6)
			.attr('text-anchor', 'end')
			.attr('font-size', 12).attr('fill', tealColor())
			.attr('font-weight', 600);
		lowestAnnot.append('tspan').attr('x', axisX - labelOffset - 106).text('Lowest');
		lowestAnnot.append('tspan').attr('x', axisX - labelOffset - 106).attr('dy', '1.0em').text('paid');
		lowestAnnot.append('tspan').attr('x', axisX - labelOffset - 106).attr('dy', '1.0em').text('occ.');

		// Top: "742 occupations paid more"
		const topAnnot = heroSvg.append('text')
			.attr('x', axisX + labelOffset).attr('y', MARGIN.top - 16)
			.attr('text-anchor', 'start')
			.attr('font-size', 13).attr('fill', tealColor())
			.attr('font-weight', 600);
		topAnnot.append('tspan')
			.attr('x', axisX + labelOffset)
			.text('742 occupations');
		topAnnot.append('tspan')
			.attr('x', axisX + labelOffset)
			.attr('dy', '1.2em')
			.text('paid more \u2191');

		// Source
		heroSvg.append('text')
			.attr('x', VW / 2).attr('y', VH - 2)
			.attr('text-anchor', 'middle')
			.attr('font-size', 11).attr('fill', mutedColor())
			.attr('font-style', 'italic')
			.text('BLS OEWS 2024');
	}

	drawHero();
	window.addEventListener('resize', drawHero);

	// Redraw hero on theme toggle
	const observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(m) {
			if (m.attributeName === 'data-theme') {
				drawHero();
				// Also re-render explore panel if open
				if (wpData) renderColumn(1);
				if (wpData && compareActive) renderColumn(2);
			}
		});
	});
	observer.observe(document.documentElement, { attributes: true });

	// ============================================================
	// EXPLORE PANEL — lazy-loaded from JSON
	// ============================================================
	let wpData = null;
	let compareActive = false;
	const select1 = document.getElementById('wp-select-1');
	const select2 = document.getElementById('wp-select-2');
	const compareBtn = document.getElementById('wp-compare-btn');
	const removeBtn = document.getElementById('wp-remove-btn');
	const col1 = document.getElementById('wp-col-1');
	const col2 = document.getElementById('wp-col-2');
	const crossNote = document.getElementById('wp-cross-note');
	const exploreDetails = document.getElementById('wp-explore');

	function fmtUsd(val, geo) {
		const usd = val / geo.ppp_usd;
		if (geo.period === 'hour') return '$' + usd.toFixed(2) + '/hr';
		return '$' + d3.format(',')(Math.round(usd)) + '/mo';
	}

	function populateDropdown(sel) {
		sel.innerHTML = '';
		const groups = { us: [], canada: [], nordic: [] };
		Object.keys(wpData.geographies).forEach(function(key) {
			const g = wpData.geographies[key];
			if (groups[g.group]) groups[g.group].push({ key: key, label: g.label });
		});

		const groupLabels = {
			us: 'United States',
			canada: 'Canada',
			nordic: 'Nordic Countries'
		};

		['us', 'canada', 'nordic'].forEach(function(grp) {
			const items = groups[grp];
			if (!items.length) return;
			// Sort: national first, then alphabetical
			items.sort(function(a, b) {
				if (a.key.indexOf('National') !== -1) return -1;
				if (b.key.indexOf('National') !== -1) return 1;
				if (a.key.indexOf('Canada') !== -1 && a.key.indexOf('CAN--Canada') !== -1) return -1;
				if (b.key.indexOf('Canada') !== -1 && b.key.indexOf('CAN--Canada') !== -1) return 1;
				return a.label.localeCompare(b.label);
			});
			const og = document.createElement('optgroup');
			og.label = groupLabels[grp];
			items.forEach(function(item) {
				const opt = document.createElement('option');
				opt.value = item.key;
				opt.textContent = item.label;
				og.appendChild(opt);
			});
			sel.appendChild(og);
		});
	}

	function renderColumn(colNum) {
		const sel = colNum === 1 ? select1 : select2;
		const col = colNum === 1 ? col1 : col2;
		const key = sel.value;
		const geo = wpData.geographies[key];
		if (!geo) { col.innerHTML = ''; return; }

		const periodLabel = geo.period === 'hour' ? 'hourly' : 'monthly';
		let html = '<div class="card-header accent-teal wp-col-header">';
		html += '<h4 class="wp-geo-name">' + escHtml(geo.label) + '</h4>';
		html += '<p class="wp-occ-label">Median wage, USD (PPP), ' + periodLabel + '</p>';
		html += '</div>';

		// Build merged array: childcare + peers
		const rows = geo.peers.map(function(p) {
			return { label: p.label, wage: p.wage, isChildcare: false };
		});
		rows.push({ label: geo.childcare_label, wage: geo.childcare_wage, isChildcare: true });

		// Sort by USD wage descending
		rows.sort(function(a, b) {
			return (b.wage / geo.ppp_usd) - (a.wage / geo.ppp_usd);
		});

		html += '<div class="wp-peer-list">';
		rows.forEach(function(r) {
			const cls = 'wp-peer-row' + (r.isChildcare ? ' wp-childcare' : '');
			html += '<div class="' + cls + '">';
			html += '<span class="wp-peer-name">' + escHtml(r.label) + '</span>';
			html += '<span class="wp-peer-wage">' + fmtUsd(r.wage, geo) + '</span>';
			html += '</div>';
		});
		html += '</div>';

		col.innerHTML = html;
		updateNotes();
	}

	function updateNotes() {
		const geo1 = wpData.geographies[select1.value];
		const geo2 = compareActive ? wpData.geographies[select2.value] : null;
		const notes = [];

		if ((geo1 && geo1.comparability === 'low') || (geo2 && geo2.comparability === 'low')) {
			notes.push('Canada uses a broader occupation group (NOC 422) that includes education paraprofessionals alongside childcare workers.');
		}
		if (geo2 && geo1 && geo1.period !== geo2.period) {
			notes.push('Wage periods differ: one geography reports hourly, the other monthly.');
		}

		if (notes.length) {
			crossNote.textContent = notes.join(' ');
			crossNote.style.display = '';
		} else {
			crossNote.style.display = 'none';
		}
	}

	function escHtml(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// Compare mode toggle
	compareBtn.addEventListener('click', function() {
		compareActive = true;
		select2.style.display = '';
		removeBtn.style.display = '';
		compareBtn.style.display = 'none';
		col2.style.display = '';
		// Default second dropdown to a different geography
		if (select2.value === select1.value) {
			const opts = select2.querySelectorAll('option');
			for (let i = 0; i < opts.length; i++) {
				if (opts[i].value !== select1.value) {
					select2.value = opts[i].value;
					break;
				}
			}
		}
		renderColumn(2);
	});

	removeBtn.addEventListener('click', function() {
		compareActive = false;
		select2.style.display = 'none';
		removeBtn.style.display = 'none';
		compareBtn.style.display = '';
		col2.style.display = 'none';
		col2.innerHTML = '';
		updateNotes();
	});

	select1.addEventListener('change', function() { renderColumn(1); });
	select2.addEventListener('change', function() { renderColumn(2); });

	// Lazy load JSON when details is opened
	let loaded = false;
	exploreDetails.addEventListener('toggle', function() {
		if (!exploreDetails.open || loaded) return;
		loaded = true;
		d3.json('files/childcare_wage_peers.json').then(function(data) {
			wpData = data;
			populateDropdown(select1);
			populateDropdown(select2);
			// Default to US national
			select1.value = 'USA--National';
			renderColumn(1);
		}).catch(function(err) {
			console.error('Failed to load wage peers data:', err);
			col1.innerHTML = '<p style="color:var(--color-text-muted);font-size:14px;">Failed to load data.</p>';
		});
	});

})();

(function() {
	'use strict';

	const DATA = [
		{id:"USA",label:"United States",short:"US",group:"us",gdp:1.2753,kids:6.72,enrolled:0.66,notEnrolled:6.06,enrollPct:9.8},
		{id:"NYC",label:"New York City",short:"NYC",group:"us",gdp:2.4135,kids:6.42,enrolled:1.25,notEnrolled:5.17,enrollPct:19.4},
		{id:"MA",label:"Massachusetts",short:"Mass.",group:"us",gdp:1.8567,kids:5.88,enrolled:0.56,notEnrolled:5.32,enrollPct:9.5},
		{id:"NM",label:"New Mexico",short:["New","Mexico"],group:"us",gdp:1.0697,kids:6.45,enrolled:0.96,notEnrolled:5.49,enrollPct:14.9},
		{id:"VT",label:"Vermont",short:"Vermont",group:"us",gdp:1.3569,kids:5.26,enrolled:1.28,notEnrolled:3.98,enrollPct:24.3},
		{id:"WA",label:"Washington",short:"Wash.",group:"us",gdp:1.6233,kids:6.63,enrolled:0.37,notEnrolled:6.26,enrollPct:5.6},
		{id:"CAN",label:"Canada",short:"Canada",group:"canada",gdp:0.997,kids:5.51,enrolled:1.70,notEnrolled:3.81,enrollPct:30.9},
		{id:"QC",label:"Quebec",short:"Quebec",group:"canada",gdp:0.8973,kids:5.65,enrolled:3.14,notEnrolled:2.51,enrollPct:55.5},
		{id:"DNK",label:"Denmark",short:"Denmark",group:"nordic",gdp:1.2271,kids:6.27,enrolled:4.73,notEnrolled:1.54,enrollPct:75.5},
		{id:"FIN",label:"Finland",short:"Finland",group:"nordic",gdp:1.0457,kids:5.15,enrolled:3.35,notEnrolled:1.81,enrollPct:64.9},
		{id:"NOR",label:"Norway",short:"Norway",group:"nordic",gdp:1.5387,kids:6.07,enrolled:4.83,notEnrolled:1.23,enrollPct:79.7},
		{id:"SWE",label:"Sweden",short:"Sweden",group:"nordic",gdp:0.8889,kids:6.59,enrolled:4.81,notEnrolled:1.79,enrollPct:72.9}
	];

	// World average: $123.6T GDP (IMF WEO Oct 2025) / 643.56M pop 0-5 (UN WPP 2024)
	const WORLD_AVG = 123.6e12 / 643.56e6 / 1e6; // ~0.192M

	const GROUP_LABELS = {us: 'United States', canada: 'Canada', nordic: 'Nordics'};
	const GROUP_ORDER = ['us', 'canada', 'nordic'];

	let TEAL = '#2A8A8A';
	const NAVY = '#1B2A4A';

	const svg = d3.select('#resources-svg');
	const containerEl = document.getElementById('resources-container');

	// ── Tooltip ──
	const tooltip = d3.select('#resources-container').append('div')
		.style('position', 'absolute')
		.style('pointer-events', 'none')
		.style('background', 'rgba(0,0,0,0.85)')
		.style('color', '#fff')
		.style('padding', '6px 10px')
		.style('border-radius', '4px')
		.style('font-size', '14px')
		.style('line-height', '1.4')
		.style('max-width', '200px')
		.style('opacity', 0)
		.style('z-index', 10)
		.style('transition', 'opacity 0.15s');

	function showTooltip(evt, html) {
		const rect = containerEl.getBoundingClientRect();
		let x = evt.clientX - rect.left + 12;
		const y = evt.clientY - rect.top - 10;
		if (x + 180 > rect.width) x = x - 190;
		tooltip.html(html).style('left', x + 'px').style('top', y + 'px').style('opacity', 1);
	}
	function hideTooltip() { tooltip.style('opacity', 0); }

	function isDark() {
		return document.documentElement.getAttribute('data-theme') === 'dark';
	}
	function textColor() { return isDark() ? '#e0e0e0' : '#333'; }
	function mutedColor() { return isDark() ? '#b0b0b0' : '#888'; }

	// Compute x positions with gaps between groups
	function computeXSlots() {
		const GAP = 0.45;
		const slots = [];
		let prevGroup = DATA[0].group;
		let s = 0;
		DATA.forEach(function(d) {
			if (d.group !== prevGroup) { s += GAP; prevGroup = d.group; }
			slots.push(s);
			s += 1;
		});
		return {slots: slots, total: s};
	}

	// Helper: render multi-line horizontal x label centered at (cx, baseY)
	function drawLabel(parent, d, cx, baseY, mc, fontSize) {
		const fs = fontSize || 12;
		const lines = Array.isArray(d.short) ? d.short : [d.short];
		lines.forEach(function(line, j) {
			parent.append('text')
				.attr('x', cx).attr('y', baseY + j * (fs + 1))
				.attr('text-anchor', 'middle').attr('font-size', fs).attr('fill', mc)
				.text(line);
		});
	}

	function render() {
		svg.selectAll('*').remove();
		const cw = containerEl.clientWidth;
		const mobile = cw < 500;
		if (mobile) {
			renderMobile();
		} else {
			renderDesktop();
		}
	}

	function renderDesktop() {
		const W = 680, totalH = 712;
		svg.attr('viewBox', '0 -6 ' + W + ' ' + totalH);
		const margin = {top: 54, right: 15, bottom: 60, left: 34};
		const gapBetweenPanels = 155;
		const panelH = (totalH - margin.top - margin.bottom - gapBetweenPanels) / 2;

		const xInfo = computeXSlots();
		const slotWidth = (W - margin.left - margin.right) / xInfo.total;
		function xPos(i) { return margin.left + (xInfo.slots[i] + 0.5) * slotWidth; }
		const barW = slotWidth * 0.6;

		const yGdp = d3.scaleLinear()
			.domain([0, d3.max(DATA, function(d){return d.gdp;}) * 1.10])
			.range([margin.top + panelH, margin.top]);

		const botTop = margin.top + panelH + gapBetweenPanels;
		const yKids = d3.scaleLinear()
			.domain([0, 8.5])
			.range([botTop + panelH - 2, botTop + 18]);

		const tc = textColor(), mc = mutedColor(), dark = isDark();
		TEAL = dark ? '#3aadad' : '#2A8A8A';
		const bl = dark ? '#c8c8c8' : '#555';
		const GRAY_LIGHT = dark ? '#6A6A9A' : '#B0B0D0';

		const tooltipLabel = {WA: 'Washington State'};

		// ── Top panel: GDP per child ──
		const topG = svg.append('g');

		topG.append('text')
			.attr('x', 15).attr('y', margin.top - 42)
			.attr('font-size', 17).attr('font-weight', 700).attr('fill', tc)
			.text('The US and peers have abundant financial resources');
		topG.append('text')
			.attr('x', 15).attr('y', margin.top - 18)
			.attr('font-size', 18).attr('fill', mc)
			.text('GDP per 0\u20135 year old, USD millions');

		const yGdpAxis = d3.axisLeft(yGdp).tickValues([0, 1, 2])
			.tickFormat(function(d){return d;});
		topG.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yGdpAxis)
			.call(function(g){ g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', mc).attr('font-size', 12);

		topG.selectAll('.grid-gdp').data([0, 1, 2]).enter()
			.append('line').attr('class', 'grid-gdp')
			.attr('x1', margin.left).attr('x2', W - margin.right)
			.attr('y1', function(d){return yGdp(d);}).attr('y2', function(d){return yGdp(d);})
			.attr('stroke', dark ? '#333' : '#eee').attr('stroke-width', 0.5);

		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			topG.append('rect')
				.attr('x', cx - barW/2).attr('y', yGdp(d.gdp))
				.attr('width', barW).attr('height', yGdp(0) - yGdp(d.gdp))
				.attr('fill', TEAL).attr('opacity', 0.85);
			topG.append('text')
				.attr('x', cx).attr('y', yGdp(d.gdp) - 3)
				.attr('text-anchor', 'middle').attr('font-size', 11.5).attr('fill', tc)
				.text('$' + d.gdp.toFixed(1) + 'M');
			topG.append('rect')
				.attr('x', cx - barW/2 - 2).attr('y', yGdp.range()[1])
				.attr('width', barW + 4).attr('height', yGdp.range()[0] - yGdp.range()[1])
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					showTooltip(evt,
						'<strong>' + (tooltipLabel[d.id] || d.label) + '</strong><br>' +
						'GDP per child 0\u20135: <strong>$' + d.gdp.toFixed(1) + 'M</strong><br>' +
						'World average: $' + WORLD_AVG.toFixed(1) + 'M<br>' +
						(d.gdp / WORLD_AVG).toFixed(1) + '\u00d7 the world average');
				})
				.on('mouseleave', hideTooltip);
		});

		const navyColor = dark ? '#D4A748' : NAVY;
		topG.append('line')
			.attr('x1', margin.left).attr('x2', W - margin.right)
			.attr('y1', yGdp(WORLD_AVG)).attr('y2', yGdp(WORLD_AVG))
			.attr('stroke', navyColor).attr('stroke-width', 2).attr('stroke-dasharray', '5,3');
		const wavLabelText = 'World average $' + WORLD_AVG.toFixed(1) + 'M';
		const wavG = svg.append('g');
		const wavLabel = wavG.append('text')
			.attr('x', margin.left + 5).attr('y', yGdp(WORLD_AVG) - 6)
			.attr('text-anchor', 'start').attr('font-size', 15).attr('font-weight', 800).attr('fill', navyColor)
			.text(wavLabelText);
		const wavBBox = wavLabel.node().getBBox();
		wavG.insert('rect', 'text')
			.attr('x', wavBBox.x - 3).attr('y', wavBBox.y - 2)
			.attr('width', wavBBox.width + 6).attr('height', wavBBox.height + 4)
			.attr('fill', dark ? '#1a1a2e' : '#fff').attr('opacity', 0.75)
			.attr('rx', 2);

		const labelY = yGdp(0) + 14;
		const labelNudge = {DNK: -4};
		DATA.forEach(function(d, i) { drawLabel(topG, d, xPos(i) + (labelNudge[d.id] || 0), labelY, bl); });

		const groups = GROUP_ORDER.map(function(g) {
			const indices = [];
			DATA.forEach(function(d, i) { if (d.group === g) indices.push(i); });
			return {group: g, start: indices[0], end: indices[indices.length - 1]};
		});
		groups.forEach(function(g) {
			const x1 = xPos(g.start) - barW/2 - 2;
			const x2 = xPos(g.end) + barW/2 + 2;
			topG.append('line')
				.attr('x1', x1).attr('x2', x2)
				.attr('y1', yGdp(0) + 2).attr('y2', yGdp(0) + 2)
				.attr('stroke', '#999').attr('stroke-width', 0.8);
		});

		// ── Bottom panel: Children per 100 people ──
		const botG = svg.append('g');

		botG.append('text')
			.attr('x', 15).attr('y', botTop - 44)
			.attr('font-size', 17).attr('font-weight', 700).attr('fill', tc)
			.text('But the US has no public childcare system');
		botG.append('text')
			.attr('x', 15).attr('y', botTop - 20)
			.attr('font-size', 18).attr('fill', mc)
			.text('Children aged 0\u20135, percent of population');

		const yKidsAxis = d3.axisLeft(yKids).ticks(5);
		botG.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yKidsAxis)
			.call(function(g){ g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', mc).attr('font-size', 12);

		botG.selectAll('.grid-kids').data(yKids.ticks(5)).enter()
			.append('line').attr('class', 'grid-kids')
			.attr('x1', margin.left).attr('x2', W - margin.right)
			.attr('y1', function(d){return yKids(d);}).attr('y2', function(d){return yKids(d);})
			.attr('stroke', dark ? '#333' : '#eee').attr('stroke-width', 0.5);

		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			botG.append('rect')
				.attr('x', cx - barW/2).attr('y', yKids(d.enrolled))
				.attr('width', barW).attr('height', yKids(0) - yKids(d.enrolled))
				.attr('fill', TEAL).attr('opacity', 0.85);
			botG.append('rect')
				.attr('x', cx - barW/2).attr('y', yKids(d.enrolled + d.notEnrolled))
				.attr('width', barW).attr('height', yKids(d.enrolled) - yKids(d.enrolled + d.notEnrolled))
				.attr('fill', GRAY_LIGHT).attr('opacity', 0.85);
			botG.append('rect')
				.attr('x', cx - barW/2 - 2).attr('y', yKids.range()[1])
				.attr('width', barW + 4).attr('height', yKids.range()[0] - yKids.range()[1])
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					showTooltip(evt,
						'<strong>' + (tooltipLabel[d.id] || d.label) + '</strong><br>' +
						'Children per 100 people: ' + d.kids.toFixed(1) + '<br>' +
						'Enrollment rate: <strong>' + d.enrollPct + '%</strong><br>' +
						'In public care: ' + d.enrolled.toFixed(1) + '<br>' +
						'Not enrolled: ' + d.notEnrolled.toFixed(1));
				})
				.on('mouseleave', hideTooltip);
		});

		const botLabelY = yKids(0) + 14;
		DATA.forEach(function(d, i) { drawLabel(botG, d, xPos(i) + (labelNudge[d.id] || 0), botLabelY, bl); });

		groups.forEach(function(g) {
			const x1 = xPos(g.start) - barW/2 - 2;
			const x2 = xPos(g.end) + barW/2 + 2;
			botG.append('line')
				.attr('x1', x1).attr('x2', x2)
				.attr('y1', yKids(0) + 2).attr('y2', yKids(0) + 2)
				.attr('stroke', '#999').attr('stroke-width', 0.8);
		});

		const botGroupLabelY = yKids(0) + 50;
		groups.forEach(function(g) {
			const midX = (xPos(g.start) + xPos(g.end)) / 2;
			const bglY = (g.group === 'canada' || g.group === 'nordic') ? botGroupLabelY - 10 : botGroupLabelY;
			botG.append('text')
				.attr('x', midX).attr('y', bglY)
				.attr('text-anchor', 'middle').attr('font-size', 14).attr('font-weight', 700)
				.attr('fill', mc)
				.text(GROUP_LABELS[g.group]);
		});

		const groupLabelY = yGdp(0) + 50;
		groups.forEach(function(g) {
			const midX = (xPos(g.start) + xPos(g.end)) / 2;
			const glY = (g.group === 'canada' || g.group === 'nordic') ? groupLabelY - 10 : groupLabelY;
			svg.append('text')
				.attr('x', midX).attr('y', glY)
				.attr('text-anchor', 'middle').attr('font-size', 14).attr('font-weight', 700)
				.attr('fill', mc)
				.text(GROUP_LABELS[g.group]);
		});

		const legX = W - margin.right - 270, legY = botTop + 3;
		botG.append('text')
			.attr('x', legX + 125).attr('y', legY + 10)
			.attr('text-anchor', 'middle')
			.attr('font-size', 15).attr('font-weight', 600).attr('fill', mc)
			.text('Childcare/pre-k enrollment');
		const legItemY = legY + 22;
		const legCol2X = legX + 150;
		[{label: 'In public care', color: TEAL, col: 0},
		 {label: 'Not enrolled', color: GRAY_LIGHT, col: 1}].forEach(function(item) {
			const cx = item.col === 0 ? legX : legCol2X;
			botG.append('rect')
				.attr('x', cx).attr('y', legItemY)
				.attr('width', 12).attr('height', 12)
				.attr('fill', item.color).attr('opacity', 0.85);
			botG.append('text')
				.attr('x', cx + 16).attr('y', legItemY + 10)
				.attr('font-size', 16).attr('fill', tc)
				.text(item.label);
		});
	}

	function renderMobile() {
		const W = 400, H = 650;
		svg.attr('viewBox', '0 -16 ' + W + ' ' + H);
		const margin = {top: 56, right: 6, bottom: 40, left: 26};
		const tc = textColor(), mc = mutedColor(), dark = isDark();
		TEAL = dark ? '#3aadad' : '#2A8A8A';
		const bl = dark ? '#c8c8c8' : '#555';
		const GRAY_LIGHT = dark ? '#6A6A9A' : '#B0B0D0';

		const xInfo = computeXSlots();
		const slotWidth = (W - margin.left - margin.right) / xInfo.total;
		function xPos(i) { return margin.left + (xInfo.slots[i] + 0.5) * slotWidth; }
		const barW = slotWidth * 0.6;

		const barArea = 186;

		// Mobile short labels (avoid overlap)
		const MOBILE_LABELS = ['US','NYC','Mass.','NM','VT','Wash.','Can.','Que.','Den.','Fin.','Nor.','Swe.'];

		// Staggered label helper: even indices at baseY, odd at baseY + offset
		function drawStaggeredLabels(parent, baseY) {
			DATA.forEach(function(d, i) {
				const stagger = (i % 2 === 1) ? 12 : 0;
				parent.append('text')
					.attr('x', xPos(i)).attr('y', baseY + stagger)
					.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', bl)
					.text(MOBILE_LABELS[i]);
				// tick mark connecting staggered label to axis
				if (stagger > 0) {
					parent.append('line')
						.attr('x1', xPos(i)).attr('x2', xPos(i))
						.attr('y1', baseY - 4).attr('y2', baseY + stagger - 10)
						.attr('stroke', dark ? '#444' : '#ccc').attr('stroke-width', 0.5);
				}
			});
		}

		// ── Top panel: GDP per child ──
		svg.append('text')
			.attr('x', 8).attr('y', 2)
			.attr('font-size', 17).attr('font-weight', 700).attr('fill', tc)
			.text('The US and peers have abundant');
		svg.append('text')
			.attr('x', 8).attr('y', 24)
			.attr('font-size', 17).attr('font-weight', 700).attr('fill', tc)
			.text('financial resources');
		svg.append('text')
			.attr('x', 8).attr('y', 50)
			.attr('font-size', 16).attr('fill', mc)
			.text('GDP per child aged 0\u20135, USD millions');

		const p1Top = margin.top;
		const yGdp = d3.scaleLinear()
			.domain([0, d3.max(DATA, function(d){return d.gdp;}) * 1.18])
			.range([p1Top + barArea, p1Top]);

		[0, 1, 2].forEach(function(v) {
			svg.append('line')
				.attr('x1', margin.left).attr('x2', W - margin.right)
				.attr('y1', yGdp(v)).attr('y2', yGdp(v))
				.attr('stroke', dark ? '#333' : '#eee').attr('stroke-width', 0.5);
		});

		const yGdpAxis = d3.axisLeft(yGdp).tickValues([0, 1, 2])
			.tickFormat(function(d){return d;});
		svg.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yGdpAxis)
			.call(function(g){ g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', mc).attr('font-size', 11);

		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			svg.append('rect')
				.attr('x', cx - barW/2).attr('y', yGdp(d.gdp))
				.attr('width', barW).attr('height', yGdp(0) - yGdp(d.gdp))
				.attr('fill', TEAL).attr('opacity', 0.85);
			svg.append('text')
				.attr('x', cx).attr('y', yGdp(d.gdp) - 3)
				.attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', tc)
				.text('$' + d.gdp.toFixed(1));
		});

		const navyColor = dark ? '#D4A748' : NAVY;
		svg.append('line')
			.attr('x1', margin.left).attr('x2', W - margin.right)
			.attr('y1', yGdp(WORLD_AVG)).attr('y2', yGdp(WORLD_AVG))
			.attr('stroke', navyColor).attr('stroke-width', 2).attr('stroke-dasharray', '5,3');
		const mWavG = svg.append('g');
		const mWavLabel = mWavG.append('text')
			.attr('x', margin.left + 5).attr('y', yGdp(WORLD_AVG) - 5)
			.attr('text-anchor', 'start').attr('font-size', 13).attr('font-weight', 800).attr('fill', navyColor)
			.text('World average');
		const mWavBBox = mWavLabel.node().getBBox();
		mWavG.insert('rect', 'text')
			.attr('x', mWavBBox.x - 3).attr('y', mWavBBox.y - 2)
			.attr('width', mWavBBox.width + 6).attr('height', mWavBBox.height + 4)
			.attr('fill', dark ? '#1a1a2e' : '#fff').attr('opacity', 0.75)
			.attr('rx', 2);

		drawStaggeredLabels(svg, yGdp(0) + 14);

		// Group bracket lines + labels (belong to top panel)
		const groups = GROUP_ORDER.map(function(g) {
			const indices = [];
			DATA.forEach(function(d, i) { if (d.group === g) indices.push(i); });
			return {group: g, start: indices[0], end: indices[indices.length - 1]};
		});
		groups.forEach(function(g) {
			const x1 = xPos(g.start) - barW/2 - 2;
			const x2 = xPos(g.end) + barW/2 + 2;
			svg.append('line')
				.attr('x1', x1).attr('x2', x2)
				.attr('y1', yGdp(0) + 2).attr('y2', yGdp(0) + 2)
				.attr('stroke', '#999').attr('stroke-width', 0.8);
		});

		const groupLabelY = yGdp(0) + 48;
		groups.forEach(function(g) {
			const midX = (xPos(g.start) + xPos(g.end)) / 2;
			svg.append('text')
				.attr('x', midX).attr('y', groupLabelY)
				.attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 700)
				.attr('fill', mc)
				.text(GROUP_LABELS[g.group]);
		});

		// ── Bottom panel: Children per 100 people ──
		const botTop = groupLabelY + 104;
		svg.append('text')
			.attr('x', 8).attr('y', botTop - 46)
			.attr('font-size', 17).attr('font-weight', 700).attr('fill', tc)
			.text('The US has no public childcare system');
		svg.append('text')
			.attr('x', 8).attr('y', botTop - 20)
			.attr('font-size', 16).attr('fill', mc)
			.text('Children aged 0\u20135, percent of population');

		const yKids = d3.scaleLinear()
			.domain([0, 8.5])
			.range([botTop + barArea, botTop + 18]);

		yKids.ticks(5).forEach(function(v) {
			svg.append('line')
				.attr('x1', margin.left).attr('x2', W - margin.right)
				.attr('y1', yKids(v)).attr('y2', yKids(v))
				.attr('stroke', dark ? '#333' : '#eee').attr('stroke-width', 0.5);
		});

		const yKidsAxis = d3.axisLeft(yKids).ticks(5);
		svg.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yKidsAxis)
			.call(function(g){ g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', mc).attr('font-size', 11);

		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			svg.append('rect')
				.attr('x', cx - barW/2).attr('y', yKids(d.enrolled))
				.attr('width', barW).attr('height', yKids(0) - yKids(d.enrolled))
				.attr('fill', TEAL).attr('opacity', 0.85);
			svg.append('rect')
				.attr('x', cx - barW/2).attr('y', yKids(d.enrolled + d.notEnrolled))
				.attr('width', barW).attr('height', yKids(d.enrolled) - yKids(d.enrolled + d.notEnrolled))
				.attr('fill', GRAY_LIGHT).attr('opacity', 0.85);
		});

		drawStaggeredLabels(svg, yKids(0) + 14);

		groups.forEach(function(g) {
			const x1 = xPos(g.start) - barW/2 - 2;
			const x2 = xPos(g.end) + barW/2 + 2;
			svg.append('line')
				.attr('x1', x1).attr('x2', x2)
				.attr('y1', yKids(0) + 2).attr('y2', yKids(0) + 2)
				.attr('stroke', '#999').attr('stroke-width', 0.8);
		});

		const botGroupLabelY = yKids(0) + 48;
		groups.forEach(function(g) {
			const midX = (xPos(g.start) + xPos(g.end)) / 2;
			svg.append('text')
				.attr('x', midX).attr('y', botGroupLabelY)
				.attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 700)
				.attr('fill', mc)
				.text(GROUP_LABELS[g.group]);
		});

		// Legend
		const legX = W - margin.right - 320, legY = botTop + 1;
		svg.append('text')
			.attr('x', legX + 110).attr('y', legY + 7)
			.attr('text-anchor', 'middle')
			.attr('font-size', 13).attr('font-weight', 600).attr('fill', mc)
			.text('Childcare/pre-k enrollment');
		const legItemY = legY + 20;
		const legCol2X = legX + 130;
		[{label: 'In public care', color: TEAL, col: 0},
		 {label: 'Not enrolled', color: GRAY_LIGHT, col: 1}].forEach(function(item) {
			const cx = item.col === 0 ? legX : legCol2X;
			svg.append('rect')
				.attr('x', cx).attr('y', legItemY)
				.attr('width', 10).attr('height', 10)
				.attr('fill', item.color).attr('opacity', 0.85);
			svg.append('text')
				.attr('x', cx + 14).attr('y', legItemY + 9)
				.attr('font-size', 14).attr('fill', tc)
				.text(item.label);
		});
	}

	render();
	window.addEventListener('resize', render);

	const observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(m) {
			if (m.attributeName === 'data-theme') render();
		});
	});
	observer.observe(document.documentElement, {attributes: true});

})();

(function() {
	'use strict';

	function getColors() {
		const dk = document.documentElement.getAttribute('data-theme') === 'dark';
		return {
			norway:  '#5DC863',
			denmark: dk ? '#aaa' : '#777',
			sweden:  dk ? '#7E7EC8' : '#443983',
			finland: dk ? '#5a9fbf' : '#31688E',
			us:      dk ? '#3aadad' : '#2A8A8A'
		};
	}
	const DATA = [
		{country: 'Norway',    colorKey: 'norway',  ages: [3.0, 86.4, 94.7, 96.8, 97.2, 97.4]},
		{country: 'Denmark',   colorKey: 'denmark', ages: [3.0, 76.2, 86.6, 94.7, 96.2, 95.4]},
		{country: 'Sweden',    colorKey: 'sweden',  ages: [3.0, 50.4, 91.2, 94.4, 95.5, 95.9]},
		{country: 'Finland',   colorKey: 'finland', ages: [3.0, 42.6, 73.9, 86.1, 90.0, 91.1]},
		{country: 'United States', colorKey: 'us',  ages: [3, 5, 7, 14.2, 42.4, 89.4]}
	];

	const AGES = [0, 1, 2, 3, 4, 5];

	const svg = d3.select('#enrollment-age-svg');
	const containerEl = document.getElementById('enrollment-age-container');

	// Tooltip
	const tooltip = d3.select('#enrollment-age-container').append('div')
		.style('position', 'absolute')
		.style('pointer-events', 'none')
		.style('background', 'rgba(0,0,0,0.85)')
		.style('color', '#fff')
		.style('padding', '6px 10px')
		.style('border-radius', '4px')
		.style('font-size', '14px')
		.style('line-height', '1.4')
		.style('max-width', '220px')
		.style('opacity', 0)
		.style('z-index', 10)
		.style('transition', 'opacity 0.15s');

	function showTooltip(evt, html) {
		const rect = containerEl.getBoundingClientRect();
		let x = evt.clientX - rect.left + 12;
		const y = evt.clientY - rect.top - 10;
		if (x + 200 > rect.width) x = x - 220;
		tooltip.html(html).style('left', x + 'px').style('top', y + 'px').style('opacity', 1);
	}
	function hideTooltip() { tooltip.style('opacity', 0); }

	function isDark() {
		return document.documentElement.getAttribute('data-theme') === 'dark';
	}
	function textColor() { return isDark() ? '#e0e0e0' : '#333'; }
	function mutedColor() { return isDark() ? '#b0b0b0' : '#888'; }

	function interp(ages, x) {
		const i = Math.floor(x), f = x - i;
		if (i >= ages.length - 1) return ages[ages.length - 1];
		return ages[i] + f * (ages[i + 1] - ages[i]);
	}

	function render() {
		svg.selectAll('*').remove();
		const cw = containerEl.clientWidth;
		const mobile = cw < 500;
		if (mobile) {
			renderMobile();
		} else {
			renderDesktop();
		}
	}

	function renderDesktop() {
		const W = 680, H = 591;
		svg.attr('viewBox', '0 0 ' + W + ' ' + H);
		const margin = {top: 122, right: 24, bottom: 30, left: 45};
		const chartW = W - margin.left - margin.right;
		const chartH = H - margin.top - margin.bottom;
		const tc = textColor(), mc = mutedColor(), dark = isDark();
		const colors = getColors();
		DATA.forEach(function(d) { d.color = colors[d.colorKey]; });

		const xScale = d3.scaleLinear().domain([0, 5]).range([margin.left, margin.left + chartW]);
		const yScale = d3.scaleLinear().domain([0, 100]).range([margin.top + chartH, margin.top]);
		const lineFn = d3.line()
			.x(function(d, i) { return xScale(i); })
			.y(function(d) { return yScale(d); });

		svg.append('text')
			.attr('x', 15).attr('y', 32)
			.attr('font-size', 22).attr('font-weight', 700).attr('fill', tc)
			.text('Nordic children enter public care at age 1.');
		svg.append('text')
			.attr('x', 15).attr('y', 64)
			.attr('font-size', 22).attr('font-weight', 700).attr('fill', tc)
			.text('US children wait until age 5.');
		svg.append('text')
			.attr('x', 15).attr('y', 100)
			.attr('font-size', 22).attr('fill', mc)
			.text('Children enrolled in public programs, by age');

		[0, 25, 50, 75, 100].forEach(function(v) {
			svg.append('line')
				.attr('x1', margin.left).attr('x2', margin.left + chartW)
				.attr('y1', yScale(v)).attr('y2', yScale(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const yAxis = d3.axisLeft(yScale).tickValues([0, 25, 50, 75, 100])
			.tickFormat(function(d) { return d + '%'; });
		svg.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', tc).attr('font-size', 14);

		const xAxis = d3.axisBottom(xScale).tickValues(AGES)
			.tickFormat(function(d) { return 'Age ' + d; });
		svg.append('g')
			.attr('transform', 'translate(0,' + (margin.top + chartH) + ')')
			.call(xAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', tc).attr('font-size', 17);

		svg.append('rect')
			.attr('x', xScale(0)).attr('y', margin.top)
			.attr('width', xScale(1) - xScale(0)).attr('height', chartH)
			.attr('fill', dark ? '#333' : '#f5f5f5').attr('opacity', 0.5);
		svg.append('text')
			.attr('x', xScale(0.5)).attr('y', margin.top + 26)
			.attr('text-anchor', 'middle').attr('font-size', 16.5).attr('fill', mc)
			.attr('font-style', 'italic')
			.text('Parental');
		svg.append('text')
			.attr('x', xScale(0.5)).attr('y', margin.top + 50)
			.attr('text-anchor', 'middle').attr('font-size', 16.5).attr('fill', mc)
			.attr('font-style', 'italic')
			.text('leave');

		DATA.forEach(function(series) {
			const lineColor = series.color;
			const isUS = series.country === 'United States';
			svg.append('path')
				.datum(series.ages)
				.attr('d', lineFn)
				.attr('fill', 'none')
				.attr('stroke', lineColor)
				.attr('stroke-width', isUS ? 5 : 3.5)
				.attr('opacity', isUS ? 1 : 0.8);
			series.ages.forEach(function(val, i) {
				svg.append('circle')
					.attr('cx', xScale(i)).attr('cy', yScale(val))
					.attr('r', isUS ? 5 : 4)
					.attr('fill', lineColor)
					.attr('opacity', isUS ? 1 : 0.8);
			});
		});

		const bgStroke = dark ? '#1a1a2e' : '#fff';
		const labels = [
			{text: 'Norway',        x: 2,   di: 0, dy: -7,  anchor: 'middle', bold: false},
			{text: 'Denmark',       x: 1.34, di: 1, dy: -4,  anchor: 'middle', bold: false},
			{text: 'Sweden',        x: 1.15, di: 2, dy: -6,  anchor: 'middle', bold: false},
			{text: 'Finland',       x: 2,   di: 3, dy: 14,  anchor: 'middle', bold: false},
			{text: 'United', x: 1.5, di: 4, dy: -37,  anchor: 'middle', bold: true},
			{text: 'States', x: 1.5, di: 4, dy: -13,  anchor: 'middle', bold: true}
		];
		labels.forEach(function(lb) {
			const val = interp(DATA[lb.di].ages, lb.x);
			svg.append('text')
				.attr('x', xScale(lb.x)).attr('y', yScale(val) + lb.dy)
				.attr('text-anchor', lb.anchor)
				.attr('font-size', lb.bold ? 19 : 17).attr('font-weight', lb.bold ? 700 : 600)
				.attr('fill', DATA[lb.di].color)
				.attr('stroke', bgStroke).attr('stroke-width', 2).attr('paint-order', 'stroke')
				.text(lb.text);
		});

		// "Public childcare gap" annotation
		const gapX = xScale(2.3) + 20;
		const gapY = 340;
		const gapFillD = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
		const gapLines = [{t: 'Public', dy: 0}, {t: 'childcare', dy: 26}, {t: 'gap', dy: 52}];
		gapLines.forEach(function(line) {
			svg.append('text')
				.attr('x', gapX).attr('y', gapY + line.dy)
				.attr('text-anchor', 'middle')
				.attr('font-size', 18).attr('font-weight', 600)
				.attr('fill', gapFillD)
				.attr('font-style', 'italic')
				.text(line.t);
		});

		AGES.forEach(function(age) {
			const colW = chartW / 5;
			const x0 = xScale(age) - colW / 2;
			svg.append('rect')
				.attr('x', Math.max(margin.left, x0)).attr('y', margin.top)
				.attr('width', colW).attr('height', chartH)
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					let html = '<strong>Age ' + age + '</strong><br>';
					DATA.forEach(function(s) {
						html += '<span style="color:' + s.color + '">\u25CF</span> ' +
							s.country + ': <strong>' + s.ages[age] + '%</strong><br>';
					});
					showTooltip(evt, html);
				})
				.on('mouseleave', hideTooltip);
		});
	}

	function renderMobile() {
		const W = 420, H = 420;
		svg.attr('viewBox', '0 0 ' + W + ' ' + H);
		const margin = {top: 112, right: 20, bottom: 26, left: 42};
		const chartW = W - margin.left - margin.right;
		const chartH = H - margin.top - margin.bottom;
		const tc = textColor(), mc = mutedColor(), dark = isDark();
		const colors = getColors();
		DATA.forEach(function(d) { d.color = colors[d.colorKey]; });

		const xScale = d3.scaleLinear().domain([0, 5]).range([margin.left, margin.left + chartW]);
		const yScale = d3.scaleLinear().domain([0, 100]).range([margin.top + chartH, margin.top]);
		const lineFn = d3.line()
			.x(function(d, i) { return xScale(i); })
			.y(function(d) { return yScale(d); });

		// Title (two lines)
		svg.append('text')
			.attr('x', 10).attr('y', 30)
			.attr('font-size', 18).attr('font-weight', 700).attr('fill', tc)
			.text('Nordic children enter care at age 1.');
		svg.append('text')
			.attr('x', 10).attr('y', 56)
			.attr('font-size', 18).attr('font-weight', 700).attr('fill', tc)
			.text('US children wait until age 5.');
		svg.append('text')
			.attr('x', 10).attr('y', 84)
			.attr('font-size', 17).attr('fill', mc)
			.text('Children enrolled in public programs, by age');

		[0, 25, 50, 75, 100].forEach(function(v) {
			svg.append('line')
				.attr('x1', margin.left).attr('x2', margin.left + chartW)
				.attr('y1', yScale(v)).attr('y2', yScale(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const yAxis = d3.axisLeft(yScale).tickValues([0, 25, 50, 75, 100])
			.tickFormat(function(d) { return d + '%'; });
		svg.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', tc).attr('font-size', 12);

		const xAxis = d3.axisBottom(xScale).tickValues(AGES)
			.tickFormat(function(d) { return 'Age ' + d; });
		svg.append('g')
			.attr('transform', 'translate(0,' + (margin.top + chartH) + ')')
			.call(xAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', tc).attr('font-size', 14);

		// Parental leave zone
		svg.append('rect')
			.attr('x', xScale(0)).attr('y', margin.top)
			.attr('width', xScale(1) - xScale(0)).attr('height', chartH)
			.attr('fill', dark ? '#333' : '#f5f5f5').attr('opacity', 0.5);
		svg.append('text')
			.attr('x', xScale(0.5)).attr('y', margin.top + 20)
			.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', mc)
			.attr('font-style', 'italic')
			.text('Parental');
		svg.append('text')
			.attr('x', xScale(0.5)).attr('y', margin.top + 36)
			.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', mc)
			.attr('font-style', 'italic')
			.text('leave');

		// Lines + dots
		DATA.forEach(function(series) {
			const lineColor = series.color;
			const isUS = series.country === 'United States';
			svg.append('path')
				.datum(series.ages)
				.attr('d', lineFn)
				.attr('fill', 'none')
				.attr('stroke', lineColor)
				.attr('stroke-width', isUS ? 3.5 : 2.5)
				.attr('opacity', isUS ? 1 : 0.8);
			series.ages.forEach(function(val, i) {
				svg.append('circle')
					.attr('cx', xScale(i)).attr('cy', yScale(val))
					.attr('r', isUS ? 4.5 : 3.5)
					.attr('fill', lineColor)
					.attr('opacity', isUS ? 1 : 0.8);
			});
		});

		// Labels — positioned to right of lines at age 5
		const bgStroke = dark ? '#1a1a2e' : '#fff';
		const mLabels = [
			{text: 'Norway',  di: 0, x: 4.6, dy: -6,  anchor: 'end'},
			{text: 'Denmark', di: 1, x: 1, dy: 20,   anchor: 'middle'},
			{text: 'Sweden',  di: 2, x: 4.6, dy: 15,  anchor: 'end'},
			{text: 'Finland', di: 3, x: 3.5, dy: 14,  anchor: 'middle'},
		];
		mLabels.forEach(function(lb) {
			const val = interp(DATA[lb.di].ages, lb.x);
			svg.append('text')
				.attr('x', xScale(lb.x)).attr('y', yScale(val) + lb.dy)
				.attr('text-anchor', lb.anchor)
				.attr('font-size', 15).attr('font-weight', 600)
				.attr('fill', DATA[lb.di].color)
				.attr('stroke', bgStroke).attr('stroke-width', 2.5).attr('paint-order', 'stroke')
				.text(lb.text);
		});
		// US label — two lines, below line around age 4-5
		const usVal = interp(DATA[4].ages, 4.5);
		[{text: 'United', dy: 130}, {text: 'States', dy: 152}].forEach(function(lb) {
			svg.append('text')
				.attr('x', xScale(4.5) - 40).attr('y', yScale(usVal) + lb.dy)
				.attr('text-anchor', 'middle')
				.attr('font-size', 16).attr('font-weight', 700)
				.attr('fill', DATA[4].color)
				.attr('stroke', bgStroke).attr('stroke-width', 2.5).attr('paint-order', 'stroke')
				.text(lb.text);
		});

		// "Public childcare gap" annotation (3 lines for mobile)
		const gapX = xScale(2.5);
		const gapY = 230;
		const gapFill = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
		[{t:'Public',dy:0},{t:'childcare',dy:28},{t:'gap',dy:56}].forEach(function(line) {
			svg.append('text')
				.attr('x', gapX).attr('y', gapY + line.dy)
				.attr('text-anchor', 'middle')
				.attr('font-size', 16).attr('font-weight', 600)
				.attr('fill', gapFill)
				.attr('font-style', 'italic')
				.text(line.t);
		});

		// Tooltip hit rects
		AGES.forEach(function(age) {
			const colW = chartW / 5;
			const x0 = xScale(age) - colW / 2;
			svg.append('rect')
				.attr('x', Math.max(margin.left, x0)).attr('y', margin.top)
				.attr('width', colW).attr('height', chartH)
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					let html = '<strong>Age ' + age + '</strong><br>';
					DATA.forEach(function(s) {
						html += '<span style="color:' + s.color + '">\u25CF</span> ' +
							s.country + ': <strong>' + s.ages[age] + '%</strong><br>';
					});
					showTooltip(evt, html);
				})
				.on('mouseleave', hideTooltip);
		});
	}

	render();
	window.addEventListener('resize', render);

	const observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(m) {
			if (m.attributeName === 'data-theme') render();
		});
	});
	observer.observe(document.documentElement, {attributes: true});

})();

(function() {
	'use strict';

	const DATA = [
		{id: 'USA', label: 'United States', short: 'US',      ecec: 0.27, total: 39.0},
		{id: 'DNK', label: 'Denmark',        short: 'Denmark', ecec: 1.19, total: 47.4},
		{id: 'FIN', label: 'Finland',        short: 'Finland', ecec: 1.28, total: 55.9},
		{id: 'NOR', label: 'Norway',         short: 'Norway',  ecec: 1.19, total: 46.7},
		{id: 'SWE', label: 'Sweden',         short: 'Sweden',  ecec: 1.49, total: 50.0}
	];

	let TEAL = '#2A8A8A';

	const svgEl = d3.select('#spending-compare-svg');
	const containerEl = document.getElementById('spending-compare-container');

	// Tooltip
	const tooltip = d3.select('#spending-compare-container').append('div')
		.style('position', 'absolute')
		.style('pointer-events', 'none')
		.style('background', 'rgba(0,0,0,0.85)')
		.style('color', '#fff')
		.style('padding', '6px 10px')
		.style('border-radius', '4px')
		.style('font-size', '14px')
		.style('line-height', '1.4')
		.style('max-width', '220px')
		.style('opacity', 0)
		.style('z-index', 10)
		.style('transition', 'opacity 0.15s');

	function showTooltip(evt, html) {
		const rect = containerEl.getBoundingClientRect();
		let x = evt.clientX - rect.left + 12;
		const y = evt.clientY - rect.top - 10;
		if (x + 200 > rect.width) x = x - 220;
		tooltip.html(html).style('left', x + 'px').style('top', y + 'px').style('opacity', 1);
	}
	function hideTooltip() { tooltip.style('opacity', 0); }

	function isDark() {
		return document.documentElement.getAttribute('data-theme') === 'dark';
	}
	function textColor() { return isDark() ? '#e0e0e0' : '#333'; }
	function mutedColor() { return isDark() ? '#b0b0b0' : '#888'; }

	function render() {
		svgEl.selectAll('*').remove();
		const cw = containerEl.clientWidth;
		const mobile = cw < 500;

		if (mobile) {
			renderMobile();
		} else {
			renderDesktop();
		}
	}

	function renderDesktop() {
		const W = 680, H = 395;
		svgEl.attr('viewBox', '0 0 ' + W + ' ' + H);
		const margin = {top: 96, right: 15, bottom: 30, left: 43};
		const panelGap = 46;
		const panelW = (W - margin.left - margin.right - panelGap) / 2;
		const chartH = H - margin.top - margin.bottom;
		const barW = panelW / DATA.length * 0.6;

		const tc = textColor(), mc = mutedColor(), dark = isDark();
		TEAL = dark ? '#3aadad' : '#2A8A8A';
		const bl = dark ? '#c8c8c8' : '#555';

		function xPos(panelLeft, i) {
			return panelLeft + (i + 0.5) * (panelW / DATA.length);
		}

		const leftX = margin.left;
		const rightX = margin.left + panelW + panelGap;

		const yEcec = d3.scaleLinear().domain([0, 1.8]).range([margin.top + chartH, margin.top]);
		const yTotal = d3.scaleLinear().domain([0, 68]).range([margin.top + chartH, margin.top]);

		// Main title
		svgEl.append('text')
			.attr('x', 15).attr('y', 28)
			.attr('font-size', 18).attr('font-weight', 700).attr('fill', tc)
			.text('The US has less government. On childcare, it\u2019s not even close.');
		svgEl.append('text')
			.attr('x', 15).attr('y', 56)
			.attr('font-size', 18).attr('fill', mc)
			.text('Government spending as share of GDP');

		// ── Left panel: Total govt ──
		const leftG = svgEl.append('g');
		leftG.append('text')
			.attr('x', leftX + panelW / 2 - 16).attr('y', margin.top)
			.attr('text-anchor', 'middle').attr('font-size', 15.5).attr('font-weight', 700).attr('fill', mc)
			.text('Total government spending');

		const yTotalAxis = d3.axisLeft(yTotal).tickValues([0, 20, 40, 60])
			.tickFormat(function(d) { return d + '%'; });
		leftG.append('g')
			.attr('transform', 'translate(' + leftX + ',0)')
			.call(yTotalAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', mc).attr('font-size', 11);

		[0, 20, 40, 60].forEach(function(v) {
			leftG.append('line')
				.attr('x1', leftX).attr('x2', leftX + panelW)
				.attr('y1', yTotal(v)).attr('y2', yTotal(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const barColor = isDark() ? '#7B7BC0' : '#443983';
		DATA.forEach(function(d, i) {
			const cx = xPos(leftX, i);
			leftG.append('rect')
				.attr('x', cx - barW / 2).attr('y', yTotal(d.total))
				.attr('width', barW).attr('height', yTotal(0) - yTotal(d.total))
				.attr('fill', barColor).attr('opacity', 0.85);
			leftG.append('text')
				.attr('x', cx).attr('y', yTotal(d.total) - 4)
				.attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', tc)
				.text(d.total.toFixed(1) + '%');
			leftG.append('text')
				.attr('x', cx).attr('y', yTotal(0) + 15)
				.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', bl)
				.text(d.short);
			leftG.append('rect')
				.attr('x', cx - barW / 2 - 2).attr('y', margin.top)
				.attr('width', barW + 4).attr('height', chartH)
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					showTooltip(evt,
						'<strong>' + d.label + '</strong><br>' +
						'Total govt: <strong>' + d.total.toFixed(1) + '% GDP</strong><br>' +
						'ECEC spending: ' + d.ecec.toFixed(2) + '% GDP<br>' +
						'ECEC share of total: ' + (d.ecec / d.total * 100).toFixed(1) + '%');
				})
				.on('mouseleave', hideTooltip);
		});

		// ── Right panel: ECEC ──
		const rightG = svgEl.append('g');
		rightG.append('text')
			.attr('x', rightX + panelW / 2 - 16).attr('y', margin.top)
			.attr('text-anchor', 'middle').attr('font-size', 15.5).attr('font-weight', 700).attr('fill', TEAL)
			.text('Early childhood education & care');

		const yEcecAxis = d3.axisLeft(yEcec).tickValues([0, 0.5, 1.0, 1.5])
			.tickFormat(function(d) { return d.toFixed(1) + '%'; });
		rightG.append('g')
			.attr('transform', 'translate(' + rightX + ',0)')
			.call(yEcecAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', mc).attr('font-size', 11);

		[0, 0.5, 1.0, 1.5].forEach(function(v) {
			rightG.append('line')
				.attr('x1', rightX).attr('x2', rightX + panelW)
				.attr('y1', yEcec(v)).attr('y2', yEcec(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		DATA.forEach(function(d, i) {
			const cx = xPos(rightX, i);
			rightG.append('rect')
				.attr('x', cx - barW / 2).attr('y', yEcec(d.ecec))
				.attr('width', barW).attr('height', yEcec(0) - yEcec(d.ecec))
				.attr('fill', TEAL).attr('opacity', 0.85);
			rightG.append('text')
				.attr('x', cx).attr('y', yEcec(d.ecec) - 4)
				.attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', tc)
				.text(d.ecec.toFixed(2) + '%');
			rightG.append('text')
				.attr('x', cx).attr('y', yEcec(0) + 15)
				.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', bl)
				.text(d.short);
			rightG.append('rect')
				.attr('x', cx - barW / 2 - 2).attr('y', margin.top)
				.attr('width', barW + 4).attr('height', chartH)
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					showTooltip(evt,
						'<strong>' + d.label + '</strong><br>' +
						'ECEC spending: <strong>' + d.ecec.toFixed(2) + '% GDP</strong><br>' +
						'Total govt: ' + d.total.toFixed(1) + '% GDP');
				})
				.on('mouseleave', hideTooltip);
		});
	}

	function renderMobile() {
		const W = 420, panelH = 250;
		const gap = 30;
		const H = panelH * 2 + gap + 30;
		svgEl.attr('viewBox', '0 0 ' + W + ' ' + H);

		const margin = {top: 56, right: 12, bottom: 28, left: 46};
		const chartW = W - margin.left - margin.right;
		const barChartH = panelH - 50;
		const barW = chartW / DATA.length * 0.55;
		const tc = textColor(), mc = mutedColor(), dark = isDark();
		TEAL = dark ? '#3aadad' : '#2A8A8A';
		const bl = dark ? '#c8c8c8' : '#555';

		function xPos(i) {
			return margin.left + (i + 0.5) * (chartW / DATA.length);
		}

		// Panel 1 title
		svgEl.append('text')
			.attr('x', 12).attr('y', 32)
			.attr('font-size', 18).attr('font-weight', 700).attr('fill', tc)
			.text('The US spends less on government.');
		svgEl.append('text')
			.attr('x', 12).attr('y', 58)
			.attr('font-size', 16).attr('fill', mc)
			.text('Total government spending, share of GDP');

		// ── Panel 1: Total govt ──
		const p1Top = margin.top;
		const p1G = svgEl.append('g');

		const yTotal = d3.scaleLinear().domain([0, 68]).range([p1Top + barChartH, p1Top + 16]);

		[0, 20, 40, 60].forEach(function(v) {
			p1G.append('line')
				.attr('x1', margin.left).attr('x2', W - margin.right)
				.attr('y1', yTotal(v)).attr('y2', yTotal(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const yTotalAxis = d3.axisLeft(yTotal).tickValues([0, 20, 40, 60])
			.tickFormat(function(d) { return d + '%'; });
		p1G.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yTotalAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', mc).attr('font-size', 12);

		const barColor = isDark() ? '#7B7BC0' : '#443983';
		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			p1G.append('rect')
				.attr('x', cx - barW / 2).attr('y', yTotal(d.total))
				.attr('width', barW).attr('height', yTotal(0) - yTotal(d.total))
				.attr('fill', barColor).attr('opacity', 0.85);
			p1G.append('text')
				.attr('x', cx).attr('y', yTotal(d.total) - 5)
				.attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', tc)
				.text(d.total.toFixed(1) + '%');
			p1G.append('text')
				.attr('x', cx).attr('y', yTotal(0) + 17)
				.attr('text-anchor', 'middle').attr('font-size', 14).attr('fill', bl)
				.text(d.short);
		});

		// ── Panel 2: ECEC ──
		const p2Top = p1Top + panelH + gap;
		const p2G = svgEl.append('g');

		p2G.append('text')
			.attr('x', 12).attr('y', p2Top - 12)
			.attr('font-size', 18).attr('font-weight', 700).attr('fill', tc)
			.text('On childcare, it\u2019s not even close.');
		p2G.append('text')
			.attr('x', 12).attr('y', p2Top + 15)
			.attr('font-size', 16).attr('fill', mc)
			.text('Early childhood education & care, share of GDP');

		const yEcec = d3.scaleLinear().domain([0, 1.8]).range([p2Top + barChartH + 6, p2Top + 22]);

		[0, 0.5, 1.0, 1.5].forEach(function(v) {
			p2G.append('line')
				.attr('x1', margin.left).attr('x2', W - margin.right)
				.attr('y1', yEcec(v)).attr('y2', yEcec(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const yEcecAxis = d3.axisLeft(yEcec).tickValues([0, 0.5, 1.0, 1.5])
			.tickFormat(function(d) { return d.toFixed(1) + '%'; });
		p2G.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yEcecAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', mc).attr('font-size', 12);

		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			p2G.append('rect')
				.attr('x', cx - barW / 2).attr('y', yEcec(d.ecec))
				.attr('width', barW).attr('height', yEcec(0) - yEcec(d.ecec))
				.attr('fill', TEAL).attr('opacity', 0.85);
			p2G.append('text')
				.attr('x', cx).attr('y', yEcec(d.ecec) - 5)
				.attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', tc)
				.text(d.ecec.toFixed(2) + '%');
			p2G.append('text')
				.attr('x', cx).attr('y', yEcec(0) + 17)
				.attr('text-anchor', 'middle').attr('font-size', 14).attr('fill', bl)
				.text(d.short);
		});
	}

	render();
	window.addEventListener('resize', render);

	const observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(m) {
			if (m.attributeName === 'data-theme') render();
		});
	});
	observer.observe(document.documentElement, {attributes: true});

})();

(function() {
	'use strict';

	const DATA = [
		{id: 'USA', label: 'United States', short: 'US',      nilf: 3.83, poverty: 20.8},
		{id: 'DNK', label: 'Denmark',        short: 'Denmark', nilf: 0.6,  poverty: 4.2},
		{id: 'FIN', label: 'Finland',        short: 'Finland', nilf: 0.3,  poverty: 4.6},
		{id: 'NOR', label: 'Norway',         short: 'Norway',  nilf: 0.3,  poverty: 7.0},
		{id: 'SWE', label: 'Sweden',         short: 'Sweden',  nilf: 0.4,  poverty: 8.4}
	];

	let TEAL = '#2A8A8A';

	const svg = d3.select('#outcomes-svg');
	const containerEl = document.getElementById('outcomes-container');

	// Tooltip
	const tooltip = d3.select('#outcomes-container').append('div')
		.style('position', 'absolute')
		.style('pointer-events', 'none')
		.style('background', 'rgba(0,0,0,0.85)')
		.style('color', '#fff')
		.style('padding', '6px 10px')
		.style('border-radius', '4px')
		.style('font-size', '14px')
		.style('line-height', '1.4')
		.style('max-width', '220px')
		.style('opacity', 0)
		.style('z-index', 10)
		.style('transition', 'opacity 0.15s');

	function showTooltip(evt, html) {
		const rect = containerEl.getBoundingClientRect();
		let x = evt.clientX - rect.left + 12;
		const y = evt.clientY - rect.top - 10;
		if (x + 200 > rect.width) x = x - 220;
		tooltip.html(html).style('left', x + 'px').style('top', y + 'px').style('opacity', 1);
	}
	function hideTooltip() { tooltip.style('opacity', 0); }

	function isDark() {
		return document.documentElement.getAttribute('data-theme') === 'dark';
	}
	function textColor() { return isDark() ? '#e0e0e0' : '#333'; }
	function mutedColor() { return isDark() ? '#b0b0b0' : '#888'; }

	function render() {
		svg.selectAll('*').remove();
		const cw = containerEl.clientWidth;
		const mobile = cw < 500;
		if (mobile) {
			renderMobile();
		} else {
			renderDesktop();
		}
	}

	function renderDesktop() {
		const W = 680, H = 376;
		svg.attr('viewBox', '0 0 ' + W + ' ' + H);
		const margin = {top: 78, right: 15, bottom: 24, left: 43};
		const panelGap = 46;
		const panelW = (W - margin.left - margin.right - panelGap) / 2;
		const chartH = H - margin.top - margin.bottom;
		const barW = panelW / DATA.length * 0.6;
		const tc = textColor(), mc = mutedColor(), dark = isDark();
		TEAL = dark ? '#3aadad' : '#2A8A8A';
		const bl = dark ? '#c8c8c8' : '#555';

		function xPos(panelLeft, i) {
			return panelLeft + (i + 0.5) * (panelW / DATA.length);
		}

		const leftX = margin.left;
		const rightX = margin.left + panelW + panelGap;

		const yNilf = d3.scaleLinear().domain([0, 4.6]).range([margin.top + chartH, margin.top]);
		const yPov = d3.scaleLinear().domain([0, 22]).range([margin.top + chartH, margin.top]);

		// ── Left panel: NILF for childcare ──
		const leftG = svg.append('g');

		leftG.append('text')
			.attr('x', leftX + panelW / 2 - 15).attr('y', margin.top - 40)
			.attr('text-anchor', 'middle').attr('font-size', 18).attr('font-weight', 700).attr('fill', TEAL)
			.text('Parents leave the workforce');
		leftG.append('text')
			.attr('x', leftX + panelW / 2 - 15).attr('y', margin.top - 13)
			.attr('text-anchor', 'middle').attr('font-size', 16).attr('fill', mc)
			.text('Share of adults ages 20-64');
		leftG.append('text')
			.attr('x', leftX + panelW / 2 - 15).attr('y', margin.top + 8)
			.attr('text-anchor', 'middle').attr('font-size', 16).attr('fill', mc)
			.text('out of work for childcare');

		const yNilfAxis = d3.axisLeft(yNilf).tickValues([0, 1, 2, 3, 4])
			.tickFormat(function(d) { return d + '%'; });
		leftG.append('g')
			.attr('transform', 'translate(' + leftX + ',0)')
			.call(yNilfAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', mc).attr('font-size', 11);

		[0, 1, 2, 3, 4].forEach(function(v) {
			leftG.append('line')
				.attr('x1', leftX).attr('x2', leftX + panelW)
				.attr('y1', yNilf(v)).attr('y2', yNilf(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		DATA.forEach(function(d, i) {
			const cx = xPos(leftX, i);
			leftG.append('rect')
				.attr('x', cx - barW / 2).attr('y', yNilf(d.nilf))
				.attr('width', barW).attr('height', yNilf(0) - yNilf(d.nilf))
				.attr('fill', TEAL).attr('opacity', 0.85);
			leftG.append('text')
				.attr('x', cx).attr('y', yNilf(d.nilf) - 4)
				.attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', tc)
				.text(d.nilf.toFixed(1) + '%');
			leftG.append('text')
				.attr('x', cx).attr('y', yNilf(0) + 15)
				.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', bl)
				.text(d.short);
			leftG.append('rect')
				.attr('x', cx - barW / 2 - 2).attr('y', margin.top)
				.attr('width', barW + 4).attr('height', chartH)
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					showTooltip(evt,
						'<strong>' + d.label + '</strong><br>' +
						'NILF for childcare: <strong>' + d.nilf.toFixed(1) + '%</strong><br>' +
						'Poverty rate: ' + d.poverty.toFixed(1) + '%');
				})
				.on('mouseleave', hideTooltip);
		});

		// ── Right panel: Poverty rate ──
		const rightG = svg.append('g');

		rightG.append('text')
			.attr('x', rightX + panelW / 2 - 15).attr('y', margin.top - 40)
			.attr('text-anchor', 'middle').attr('font-size', 18).attr('font-weight', 700).attr('fill', isDark() ? '#9B9BD0' : '#443983')
			.text('Children fall into poverty');
		rightG.append('text')
			.attr('x', rightX + panelW / 2 - 15).attr('y', margin.top - 10)
			.attr('text-anchor', 'middle').attr('font-size', 16).attr('fill', mc)
			.text('Child poverty rate');

		const yPovAxis = d3.axisLeft(yPov).tickValues([0, 5, 10, 15, 20])
			.tickFormat(function(d) { return d + '%'; });
		rightG.append('g')
			.attr('transform', 'translate(' + rightX + ',0)')
			.call(yPovAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', '#ddd'); })
			.selectAll('text').attr('fill', mc).attr('font-size', 11);

		[0, 5, 10, 15, 20].forEach(function(v) {
			rightG.append('line')
				.attr('x1', rightX).attr('x2', rightX + panelW)
				.attr('y1', yPov(v)).attr('y2', yPov(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const barColor = isDark() ? '#7B7BC0' : '#443983';
		DATA.forEach(function(d, i) {
			const cx = xPos(rightX, i);
			rightG.append('rect')
				.attr('x', cx - barW / 2).attr('y', yPov(d.poverty))
				.attr('width', barW).attr('height', yPov(0) - yPov(d.poverty))
				.attr('fill', barColor).attr('opacity', 0.85);
			rightG.append('text')
				.attr('x', cx).attr('y', yPov(d.poverty) - 4)
				.attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', tc)
				.text(d.poverty.toFixed(1) + '%');
			rightG.append('text')
				.attr('x', cx).attr('y', yPov(0) + 15)
				.attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', bl)
				.text(d.short);
			rightG.append('rect')
				.attr('x', cx - barW / 2 - 2).attr('y', margin.top)
				.attr('width', barW + 4).attr('height', chartH)
				.attr('fill', 'transparent').attr('cursor', 'pointer')
				.on('mousemove', function(evt) {
					showTooltip(evt,
						'<strong>' + d.label + '</strong><br>' +
						'Poverty rate: <strong>' + d.poverty.toFixed(1) + '%</strong><br>' +
						'NILF for childcare: ' + d.nilf.toFixed(1) + '%');
				})
				.on('mouseleave', hideTooltip);
		});
	}

	function renderMobile() {
		const W = 420, panelH = 220;
		const gap = 28;
		const H = panelH * 2 + gap + 26;
		svg.attr('viewBox', '0 0 ' + W + ' ' + H);

		const margin = {top: 58, right: 12, bottom: 24, left: 46};
		const chartW = W - margin.left - margin.right;
		const barChartH = panelH - 46;
		const barW = chartW / DATA.length * 0.55;
		const tc = textColor(), mc = mutedColor(), dark = isDark();
		TEAL = dark ? '#3aadad' : '#2A8A8A';
		const bl = dark ? '#c8c8c8' : '#555';

		function xPos(i) {
			return margin.left + (i + 0.5) * (chartW / DATA.length);
		}

		// ── Panel 1: NILF for childcare ──
		const p1Top = margin.top - 16;
		const p1G = svg.append('g');

		p1G.append('text')
			.attr('x', 12).attr('y', 32)
			.attr('font-size', 15).attr('font-weight', 700).attr('fill', TEAL)
			.text('Parents leave the workforce');
		p1G.append('text')
			.attr('x', 12).attr('y', 50)
			.attr('font-size', 14).attr('fill', mc)
			.text('Adults ages 20-64 out of work for childcare');

		const yNilf = d3.scaleLinear().domain([0, 4.6]).range([p1Top + barChartH, p1Top + 16]);

		[0, 1, 2, 3, 4].forEach(function(v) {
			p1G.append('line')
				.attr('x1', margin.left).attr('x2', W - margin.right)
				.attr('y1', yNilf(v)).attr('y2', yNilf(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const yNilfAxis = d3.axisLeft(yNilf).tickValues([0, 1, 2, 3, 4])
			.tickFormat(function(d) { return d + '%'; });
		p1G.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yNilfAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', mc).attr('font-size', 12);

		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			p1G.append('rect')
				.attr('x', cx - barW / 2).attr('y', yNilf(d.nilf))
				.attr('width', barW).attr('height', yNilf(0) - yNilf(d.nilf))
				.attr('fill', TEAL).attr('opacity', 0.85);
			p1G.append('text')
				.attr('x', cx).attr('y', yNilf(d.nilf) - 5)
				.attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', tc)
				.text(d.nilf.toFixed(1) + '%');
			p1G.append('text')
				.attr('x', cx).attr('y', yNilf(0) + 15)
				.attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', bl)
				.text(d.short);
		});

		// ── Panel 2: Poverty rate ──
		const p2Top = p1Top + panelH + gap;
		const p2G = svg.append('g');

		p2G.append('text')
			.attr('x', 12).attr('y', p2Top - 14)
			.attr('font-size', 15).attr('font-weight', 700).attr('fill', isDark() ? '#9B9BD0' : '#443983')
			.text('Children fall into poverty');
		p2G.append('text')
			.attr('x', 12).attr('y', p2Top + 4)
			.attr('font-size', 14).attr('fill', mc)
			.text('Child poverty rate');

		const yPov = d3.scaleLinear().domain([0, 22]).range([p2Top + barChartH, p2Top + 16]);

		[0, 5, 10, 15, 20].forEach(function(v) {
			p2G.append('line')
				.attr('x1', margin.left).attr('x2', W - margin.right)
				.attr('y1', yPov(v)).attr('y2', yPov(v))
				.attr('stroke', v === 0 ? (dark ? '#555' : '#ccc') : (dark ? '#333' : '#eee'))
				.attr('stroke-width', v === 0 ? 1 : 0.5);
		});

		const yPovAxis = d3.axisLeft(yPov).tickValues([0, 5, 10, 15, 20])
			.tickFormat(function(d) { return d + '%'; });
		p2G.append('g')
			.attr('transform', 'translate(' + margin.left + ',0)')
			.call(yPovAxis)
			.call(function(g) { g.select('.domain').remove(); g.selectAll('.tick line').remove(); })
			.selectAll('text').attr('fill', mc).attr('font-size', 12);

		const barColor = isDark() ? '#7B7BC0' : '#443983';
		DATA.forEach(function(d, i) {
			const cx = xPos(i);
			p2G.append('rect')
				.attr('x', cx - barW / 2).attr('y', yPov(d.poverty))
				.attr('width', barW).attr('height', yPov(0) - yPov(d.poverty))
				.attr('fill', barColor).attr('opacity', 0.85);
			p2G.append('text')
				.attr('x', cx).attr('y', yPov(d.poverty) - 5)
				.attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', tc)
				.text(d.poverty.toFixed(1) + '%');
			p2G.append('text')
				.attr('x', cx).attr('y', yPov(0) + 15)
				.attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', bl)
				.text(d.short);
		});
	}

	render();
	window.addEventListener('resize', render);

	const observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(m) {
			if (m.attributeName === 'data-theme') render();
		});
	});
	observer.observe(document.documentElement, {attributes: true});

})();

