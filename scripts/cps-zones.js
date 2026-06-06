(function () {
  "use strict";

  // ============================================================
  // CPS ZONES — multi-metric, multi-period choropleth (prototype)
  //   Geometry : ../data/cps_zones_era3.topo.json   (object "zones", keyed CPSZ)
  //   Values   : ../data/zone_metric_values.json    ({ CPSZ: {metric: {period: v}} })
  //   Metrics  : ../data/zone_metrics.json           (ordered selector metadata)
  //   Periods  : ../data/zone_periods.json           ([{id,label}], newest last)
  // Color scales are FIXED per metric across all periods so periods are directly
  // comparable; the histogram + ranks + detail recompute for the chosen period.
  // ============================================================

  const TOPO_URL = "/files/cps_zones_era3.topo.json";
  const STATES_URL = "/files/cps_zones_states.topo.json";
  const VALUES_URL = "/files/zone_metric_values.json";
  const METRICS_URL = "/files/zone_metrics.json";
  const PERIODS_URL = "/files/zone_periods.json";

  const W = 960, H = 600;
  // The US fills [W,H]; the viewBox is wider so the NYC inset sits in a right-side
  // ocean gutter, up near NYC's latitude, never over land. The east coast reaches
  // ~x880 at mid-Atlantic latitudes, so the gutter starts the inset east of that.
  const VB_W = W + 110;
  const NO_DATA =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg-highlight").trim() || "#e8e8e8";

  // Per-metric color ramps (the metric's `palette` selects one). Kept off
  // cyan/blue so the brand-cyan hover + selection outline reads on every fill.
  const RAMP = {
    YlOrRd: d3.interpolateYlOrRd, YlGn: d3.interpolateYlGn,
    Reds: d3.interpolateReds, Purples: d3.interpolatePurples,
    RdBu: d3.interpolateRdBu, PuOr: d3.interpolatePuOr, PiYG: d3.interpolatePiYG,
  };
  const rampOf = (meta) => RAMP[meta && meta.palette] || d3.interpolateYlOrRd;

  const FMT = {
    pct1: (v) => v.toFixed(1) + "%",
    usd0: (v) => "$" + Math.round(v).toLocaleString("en-US"),
    usd2: (v) => "$" + v.toFixed(2),
    idx0: (v) => Math.round(v).toLocaleString("en-US"),
    min1: (v) => v.toFixed(1) + " min",
    num0: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString("en-US"),
    margin: (v) => (v >= 0 ? "D+" : "R+") + Math.abs(v).toFixed(1),
    ratio: (v) => v.toFixed(1) + "×",
    count: (v) => Math.round(v).toLocaleString("en-US"),
    num1: (v) => v.toFixed(1),
    usdbig: (v) => (v >= 1000 ? "$" + (v / 1000).toFixed(2) + "T" : "$" + Math.round(v).toLocaleString("en-US") + "B"),
  };
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return Math.round(v / 1e3) + "k";
    return "" + Math.round(v);
  };
  const FMT_SHORT = {
    pct1: (v) => v.toFixed(0) + "%",
    usd0: (v) => "$" + compact(v),
    usd2: (v) => "$" + v.toFixed(2),
    idx0: (v) => "" + Math.round(v),
    min1: (v) => v.toFixed(0) + "m",
    num0: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + compact(Math.abs(v)),
    margin: (v) => (v >= 0 ? "D+" : "R+") + Math.abs(v).toFixed(0),
    ratio: (v) => v.toFixed(1) + "×",
    count: (v) => compact(v),
    num1: (v) => v.toFixed(0),
    usdbig: (v) => (v >= 1000 ? "$" + (v / 1000).toFixed(1) + "T" : "$" + Math.round(v) + "B"),
  };
  // ── State ────────────────────────────────────────────────────────────────
  let values, META, PERIODS, currentId, currentPeriod, currentY, currentView = "map";
  // zone-type colors for the scatter (distinct, off-cyan so the hover/selection pops)
  const TYPE_COLOR = {
    "Metro": "#e6550d", "Standalone State": "#756bb1",
    "State Balance": "#31a354", "Combined Region": "#636363",
  };
  let tableSort = { col: "name", dir: 1 };
  const metaById = {};
  const typeByCode = {};
  const nameByCode = {};                          // CPSZ → human-readable name
  const descByCode = {};                          // CPSZ → "what this zone covers"
  const zoneName = (code) => nameByCode[code] || code.replace(/_/g, " ");
  const scalesByMetric = {};   // id → {fn, lo, hi, type}   (fixed across periods)
  const ranksByMetric = {};    // id → {period → {rank, count}}
  let svg, path, projection, fc, zonesSel, outlineByCode;
  let zoomG, zoom, labelLayer, insetG, statesTopo;
  let curT = d3.zoomIdentity, currentK = 1;
  const featByCode = {}, centroidByCode = {}, bboxByCode = {};
  const LABEL_K = 2.2;   // zoom level at which direct labels appear
  let selLayer, selCasing, selLine, selectedCode = null;
  let highlight, hlCasing, hlLine, insetZonesSel;
  let tip, tipEl;

  const fmtFull = (id, v) => (v == null ? "—" : FMT[metaById[id].fmt](v));
  const fmtShort = (id, v) => FMT_SHORT[metaById[id].fmt](v);

  Promise.all([d3.json(TOPO_URL), d3.json(VALUES_URL), d3.json(METRICS_URL),
               d3.json(PERIODS_URL), d3.json(STATES_URL).catch(() => null)])
    .then(setup)
    .catch((err) => {
      console.error(err);
      document.getElementById("map-status").textContent =
        "Could not load map data. Serve over http (file:// is blocked by CORS).";
    });

  function valueOf(id, code, period) {
    const rec = values[code];
    const byP = rec && rec[id];
    const v = byP ? byP[period] : null;
    return v == null ? null : v;
  }
  function metricValues(id, period) {
    const out = [];
    fc.features.forEach((f) => {
      const v = valueOf(id, f.properties.CPSZ, period);
      if (v != null) out.push(v);
    });
    return out;
  }
  function allValues(id) {
    const out = [];
    fc.features.forEach((f) => {
      const byP = (values[f.properties.CPSZ] || {})[id];
      if (byP) PERIODS.forEach((p) => { const v = byP[p.id]; if (v != null) out.push(v); });
    });
    return out;
  }

  function rewindToD3(coll) {
    coll.features.forEach((f) => {
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates]
                  : g.type === "MultiPolygon" ? g.coordinates : [];
      polys.forEach((rings) => {
        if (d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI) {
          rings.forEach((ring) => ring.reverse());
        }
      });
    });
  }

  // Fixed scale over ALL periods, so a zone's color is comparable across time.
  // Each scale carries norm(v)→[0,1] / denorm(t)→value so the legend (gradient,
  // histogram, markers) is scale-agnostic — linear, diverging, or log.
  function colorScaleFor(meta) {
    const vals = allValues(meta.id);
    const interp = rampOf(meta);
    // Robust domain: clip the color range to the 2nd/98th percentile so one or two
    // outlier zones (NYC's car-free share, the Bay Area's pay) saturate the end
    // color instead of bleaching the other ~68 zones pale. The true extremes are
    // kept (rawLo/rawHi) so the legend flags saturation with ≤ / +.
    const srt = vals.slice().sort((a, b) => a - b);
    const q = (p) => {
      const k = (srt.length - 1) * p, i = Math.floor(k);
      return srt[i] + (srt[Math.min(i + 1, srt.length - 1)] - srt[i]) * (k - i);
    };
    const rawLo = srt[0], rawHi = srt[srt.length - 1];
    const clampu = (x) => Math.max(0, Math.min(1, x));
    if (meta.scale === "div") {
      // Signed metrics (political margin, net migration) diverge about 0; the
      // ramp (RdBu / PuOr) is the metric's own so the two read differently.
      let lo = Math.min(0, q(0.02)), hi = Math.max(0, q(0.98));
      const span = (hi - lo) || 1;
      return { fn: d3.scaleDiverging(interp).domain([lo, 0, hi]).clamp(true), lo, hi, rawLo, rawHi, type: "div",
               loClip: rawLo < lo, hiClip: rawHi > hi,
               norm: (v) => clampu((v - lo) / span), denorm: (t) => lo + t * span };
    }
    if (meta.scale === "log") {
      // Right-skewed counts/levels (population, jobs, density, dollar levels):
      // equal pixels = equal ratio, so the long tail isn't washed out.
      const pos = vals.filter((v) => v > 0);
      let lo = Math.max(q(0.02), d3.min(pos) || 1), hi = q(0.98);
      if (lo <= 0) lo = d3.min(pos) || 1;
      if (!(hi > lo)) hi = (d3.max(pos) || lo * 10);
      const llo = Math.log(lo), lspan = (Math.log(hi) - llo) || 1;
      return { fn: d3.scaleSequentialLog(interp).domain([lo, hi]).clamp(true), lo, hi, rawLo, rawHi, type: "log",
               loClip: rawLo < lo, hiClip: rawHi > hi,
               norm: (v) => clampu((Math.log(Math.max(v, 1e-9)) - llo) / lspan), denorm: (t) => Math.exp(llo + t * lspan) };
    }
    let lo = q(0.02), hi = q(0.98);
    if (lo === hi) { lo = rawLo - 1; hi = rawHi + 1; }
    const span = (hi - lo) || 1;
    return { fn: d3.scaleSequential(interp).domain([lo, hi]).clamp(true), lo, hi, rawLo, rawHi, type: "seq",
             loClip: rawLo < lo, hiClip: rawHi > hi,
             norm: (v) => clampu((v - lo) / span), denorm: (t) => lo + t * span };
  }
  function computeRanks(id, period) {
    const arr = [];
    fc.features.forEach((f) => {
      const c = f.properties.CPSZ, v = valueOf(id, c, period);
      if (v != null) arr.push([c, v]);
    });
    arr.sort((a, b) => b[1] - a[1]);
    const rank = {};
    arr.forEach((e, i) => (rank[e[0]] = i + 1));
    return { rank, count: arr.length };
  }

  // ── Build (once) ───────────────────────────────────────────────────────────
  function setup([topo, vals, metrics, periods, states]) {
    statesTopo = states;
    values = vals; META = metrics; PERIODS = periods;
    META.forEach((m) => (metaById[m.id] = m));
    currentId = META[0].id;
    currentPeriod = PERIODS[PERIODS.length - 1].id;   // newest by default

    fc = topojson.feature(topo, topo.objects.zones);
    rewindToD3(fc);
    fc.features.forEach((f) => {
      typeByCode[f.properties.CPSZ] = f.properties.ZONE_TYPE;
      nameByCode[f.properties.CPSZ] = f.properties.NAME;
      descByCode[f.properties.CPSZ] = f.properties.DESC;
    });
    META.forEach((m) => {
      scalesByMetric[m.id] = colorScaleFor(m);
      ranksByMetric[m.id] = {};
      PERIODS.forEach((p) => (ranksByMetric[m.id][p.id] = computeRanks(m.id, p.id)));
    });

    projection = d3.geoAlbersUsa().fitSize([W, H], fc);
    path = d3.geoPath(projection);

    svg = d3.select("#zone-map")
      .attr("viewBox", `0 0 ${VB_W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();
    tip = d3.select("#map-tooltip");
    tipEl = document.getElementById("map-tooltip");

    outlineByCode = {};
    topo.objects.zones.geometries.forEach((g) => {
      const c = g.properties.CPSZ;
      outlineByCode[c] = path(
        topojson.mesh(topo, topo.objects.zones,
          (a, b) => a.properties.CPSZ === c || b.properties.CPSZ === c));
    });
    // Precompute each zone's projected centroid + bbox (for zoom-to + labels).
    fc.features.forEach((f) => {
      const c = f.properties.CPSZ;
      featByCode[c] = f;
      centroidByCode[c] = path.centroid(f);
      bboxByCode[c] = path.bounds(f);    // [[x0,y0],[x1,y1]]
    });

    // Everything inside zoomG pans/zooms together; labels + inset stay outside.
    zoomG = svg.append("g").attr("class", "zoom-layer");

    zonesSel = zoomG.append("g").selectAll("path.zone")
      .data(fc.features).join("path")
      .attr("class", "zone").attr("d", path)
      .on("mouseover", (e, d) => { highlightZone(d.properties.CPSZ); showTip(e, d.properties.CPSZ); })
      .on("mousemove", moveTip)
      .on("mouseout", clearHover)
      .on("click", (e, d) => toggleSelect(d.properties.CPSZ))
      .on("dblclick", (e, d) => { e.stopPropagation(); zoomToZone(d.properties.CPSZ); });

    zoomG.append("path").attr("class", "zone-borders")
      .attr("d", path(topojson.mesh(topo, topo.objects.zones, (a, b) => a !== b)));

    // State boundaries (same cb_2024 file the zones were carved from, so coincident
    // borders align). Interior state-state lines add orientation, esp. through
    // multi-zone states / cross-state metros. Faint; non-scaling stroke under zoom.
    if (statesTopo && statesTopo.objects && statesTopo.objects.states) {
      zoomG.append("path").attr("class", "state-borders")
        .attr("d", path(topojson.mesh(statesTopo, statesTopo.objects.states, (a, b) => a !== b)));
    }

    selLayer = zoomG.append("g").attr("class", "zone-selected").style("opacity", 0);
    selCasing = selLayer.append("path").attr("class", "sel-casing");
    selLine = selLayer.append("path").attr("class", "sel-line");

    highlight = zoomG.append("g").attr("class", "zone-highlight").style("opacity", 0);
    hlCasing = highlight.append("path").attr("class", "hl-casing");
    hlLine = highlight.append("path").attr("class", "hl-line");

    labelLayer = svg.append("g").attr("class", "map-labels").style("display", "none");

    setupZoom();

    const init = parseHash();
    if (init.metric && metaById[init.metric]) currentId = init.metric;
    if (init.period && PERIODS.some((p) => p.id === init.period)) currentPeriod = init.period;

    currentY = (metaById["median_hh_income"] && currentId !== "median_hh_income")
      ? "median_hh_income" : (META[1] || META[0]).id;
    if (init.metricY && metaById[init.metricY]) currentY = init.metricY;
    buildNYCInset();
    buildSelector();
    buildYSelect();
    buildPeriods();
    buildTabs();
    document.getElementById("download-csv").addEventListener("click", downloadCSV);

    document.getElementById("map-status").textContent = "";
    applyMetric(currentId);
    if (init.zone && values[init.zone]) selectZone(init.zone);
    if (init.view && init.view !== "map") switchView(init.view);
  }

  // ── Zoom / pan + direct labels ───────────────────────────────────────────────
  function setupZoom() {
    zoom = d3.zoom().scaleExtent([1, 12])
      .translateExtent([[0, 0], [VB_W, H]]).extent([[0, 0], [VB_W, H]])
      .filter((e) => e.type !== "wheel" && !e.button)   // no wheel-hijack of page scroll
      .on("zoom", onZoom);
    svg.call(zoom).on("dblclick.zoom", null);   // wheel filtered out (no page-scroll hijack);
    buildZoomControls();                          // touch pinch + drag-pan stay enabled
    updateZoomUI();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && currentK > 1.01) { resetZoom(); }
    });
  }
  function onZoom(e) {
    curT = e.transform; currentK = e.transform.k;
    zoomG.attr("transform", e.transform);
    positionLabels();
    updateZoomUI();
  }
  // Fit + center a single zone in the viewport (zoom-to). Cap k so tiny zones
  // (NYC_CITY) don't over-zoom into a blur.
  function zoomToZone(code) {
    const b = bboxByCode[code]; if (!b) return;
    if (selectedCode !== code) selectZone(code);   // focus it (accent label + panel)
    const w = Math.max(b[1][0] - b[0][0], 1), h = Math.max(b[1][1] - b[0][1], 1);
    const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    const k = Math.max(1, Math.min(12, 0.72 / Math.max(w / VB_W, h / H)));
    const t = d3.zoomIdentity.translate(VB_W / 2, H / 2).scale(k).translate(-cx, -cy);
    svg.transition().duration(750).call(zoom.transform, t);
  }
  function resetZoom() { svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity); }
  function zoomByFactor(f) {
    svg.transition().duration(280).call(zoom.scaleBy, f, [VB_W / 2, H / 2]);
  }
  function updateZoomUI() {
    const zoomed = currentK > 1.01;
    if (insetG) insetG.style("display", zoomed ? "none" : null);  // inset only at national view
    const rst = document.getElementById("zoom-reset");
    if (rst) rst.style.display = zoomed ? "" : "none";
  }
  // Direct labels (zone name + value), shown once zoomed in. Drawn in screen space
  // (outside zoomG) so text stays crisp + constant size. Candidates are visible zones
  // big enough on-screen to hold a label (plus the selected zone, always). They're
  // placed greedily — selected first, then largest — each measured via getBBox and
  // nudged vertically until it clears every already-placed label (and the control
  // corner); a label with no clear slot is dropped rather than overlapped.
  const RESERVED = { x: 0, y: 0, w: 60, h: 150 };   // top-left zoom-control cluster (approx, viewBox units)
  function rectsHit(a, b, px, py) {
    return a.x - px < b.x + b.w && a.x + a.w + px > b.x &&
           a.y - py < b.y + b.h && a.y + a.h + py > b.y;
  }
  function positionLabels() {
    if (!labelLayer) return;
    if (currentK < LABEL_K) { labelLayer.style("display", "none"); return; }
    labelLayer.style("display", null);
    const cand = [];
    fc.features.forEach((f) => {
      const c = f.properties.CPSZ, ctr = centroidByCode[c]; if (!ctr) return;
      const [sx, sy] = curT.apply(ctr);
      if (sx < 2 || sx > VB_W - 2 || sy < 2 || sy > H - 2) return;
      const b = bboxByCode[c];
      const wpx = (b[1][0] - b[0][0]) * currentK, hpx = (b[1][1] - b[0][1]) * currentK;
      if (c !== selectedCode && (wpx < 34 || hpx < 20)) return;
      cand.push({ code: c, sx, sy, area: wpx * hpx });
    });
    // priority: selected zone first, then largest on-screen footprint
    cand.sort((a, b) => (b.code === selectedCode) - (a.code === selectedCode) || b.area - a.area);

    const sel = labelLayer.selectAll("g.zlabel").data(cand, (d) => d.code);
    sel.exit().remove();
    const ent = sel.enter().append("g").attr("class", "zlabel");
    ent.append("text").attr("class", "zlabel-name").attr("text-anchor", "middle");
    ent.append("text").attr("class", "zlabel-val").attr("text-anchor", "middle").attr("dy", "1.05em");
    const all = ent.merge(sel).style("display", null);
    all.classed("zlabel-sel", (d) => d.code === selectedCode);
    all.select(".zlabel-name").text((d) => zoneName(d.code));
    all.select(".zlabel-val").text((d) => fmtFull(currentId, valueOf(currentId, d.code, currentPeriod)));
    all.attr("transform", (d) => `translate(${d.sx.toFixed(1)},${d.sy.toFixed(1)})`);

    // Greedy placement with vertical nudge (in priority order via the sorted data).
    const placed = [RESERVED];
    const STEP = 7, MAXTRY = 8;
    all.each(function (d) {
      const bb = this.getBBox();              // local bbox (text centered on 0,0)
      let chosen = null;
      for (let i = 0; i <= MAXTRY; i++) {
        const dy = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * STEP;
        const r = { x: d.sx + bb.x, y: d.sy + bb.y + dy, w: bb.width, h: bb.height };
        if (r.x < 1 || r.x + r.w > VB_W - 1 || r.y < 1 || r.y + r.h > H - 1) continue;
        if (!placed.some((p) => rectsHit(r, p, 2, 1))) { chosen = { dy, r }; break; }
      }
      if (chosen) {
        placed.push(chosen.r);
        d3.select(this).style("display", null)
          .attr("transform", `translate(${d.sx.toFixed(1)},${(d.sy + chosen.dy).toFixed(1)})`);
      } else {
        d3.select(this).style("display", "none");
      }
    });
  }
  function buildZoomControls() {
    if (document.getElementById("zoom-controls")) return;
    // Anchor the controls to a relative wrapper around the map SVG (so they sit over
    // the empty NW-ocean corner of the map, not over the card title/subtitle).
    const svgEl = document.getElementById("zone-map");
    if (!svgEl) return;
    let host = svgEl.closest(".map-wrap");
    if (!host) {
      host = document.createElement("div");
      host.className = "map-wrap";
      svgEl.parentNode.insertBefore(host, svgEl);
      host.appendChild(svgEl);
    }
    const box = document.createElement("div");
    box.id = "zoom-controls"; box.className = "zoom-controls";
    box.innerHTML =
      '<button type="button" id="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>' +
      '<button type="button" id="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>' +
      '<button type="button" id="zoom-reset" title="Reset view" aria-label="Reset view">⤢</button>';
    host.appendChild(box);
    document.getElementById("zoom-in").onclick = () => zoomByFactor(1.6);
    document.getElementById("zoom-out").onclick = () => zoomByFactor(1 / 1.6);
    document.getElementById("zoom-reset").onclick = resetZoom;
  }

  // NYC region is too small to see/hit on the national map (NYC_CITY = 5 boroughs).
  // Show a zoomed, framed inset (like the source ERA3 map) of the tristate split,
  // colored + interactive like the main map. Replaces the old offshore swatch.
  const INSET_CODES = ["NYC_CITY", "NY_METRO", "NJ_BALANCE", "CT", "PA_BALANCE", "NY_BALANCE"];

  function buildNYCInset() {
    // Right-side ocean gutter, up near NYC's latitude (NOT jammed at the bottom).
    // Land's east edge maxes ~x880 in the mid-Atlantic, so x0 ≈ 886 clears it.
    // Verified vs every mainland zone bbox — zero overlap.
    const BW = 178, BH = 178, PAD = 6, HEAD = 22;
    const x0 = VB_W - BW - 6, y0 = 230;
    const g = svg.append("g").attr("class", "nyc-inset");
    insetG = g;

    g.append("rect").attr("class", "inset-frame")
      .attr("x", x0).attr("y", y0).attr("width", BW).attr("height", BH);

    // leader from the NYC spot on the national map to the inset box
    const nyc = projection([-73.97, 40.70]);
    if (nyc) {
      g.append("line").attr("class", "inset-leader")
        .attr("x1", nyc[0]).attr("y1", nyc[1]).attr("x2", x0).attr("y2", y0 + 18);
      g.append("circle").attr("class", "inset-marker")
        .attr("cx", nyc[0]).attr("cy", nyc[1]).attr("r", 3);
    }
    g.append("text").attr("class", "inset-title")
      .attr("x", x0 + BW / 2).attr("y", y0 + 15).attr("text-anchor", "middle")
      .text("New York metro area");

    const clipId = "nyc-inset-clip";
    svg.append("clipPath").attr("id", clipId).append("rect")
      .attr("x", x0 + 1).attr("y", y0 + HEAD - 3).attr("width", BW - 2).attr("height", BH - HEAD + 1);

    // Manual center/scale (deterministic — avoids the GeoJSON-winding ambiguity
    // that makes a hand-wound fitExtent bbox read as the whole sphere). Shows
    // NYC + inner suburbs + nearby NJ/CT; the big zones extend out and clip.
    const proj = d3.geoMercator().center([-73.8, 40.82]).scale((BW - 2 * PAD) * 30)
      .translate([x0 + BW / 2, y0 + HEAD + (BH - HEAD) / 2]);
    const ip = d3.geoPath(proj);
    const feats = fc.features.filter((f) => INSET_CODES.includes(f.properties.CPSZ));
    insetZonesSel = g.append("g").attr("clip-path", `url(#${clipId})`)
      .selectAll("path.inset-zone").data(feats).join("path")
      .attr("class", "inset-zone").attr("d", ip)
      .on("mouseover", (e, d) => { d3.select(e.currentTarget).raise(); highlightZone(d.properties.CPSZ); showTip(e, d.properties.CPSZ); })
      .on("mousemove", moveTip)
      .on("mouseout", clearHover)
      .on("click", (e, d) => toggleSelect(d.properties.CPSZ));
  }
  function refreshInset() {
    if (insetZonesSel) insetZonesSel.classed("sel", (d) => d.properties.CPSZ === selectedCode)
      .filter((d) => d.properties.CPSZ === selectedCode).raise();
  }

  // Populate a <select> with the metrics, grouped by category.
  function fillMetricSelect(sel) {
    const cats = [];
    META.forEach((m) => { if (!cats.includes(m.category)) cats.push(m.category); });
    cats.forEach((cat) => {
      const og = sel.append("optgroup").attr("label", cat);
      META.filter((m) => m.category === cat).forEach((m) =>
        og.append("option").attr("value", m.id).text(m.short));
    });
  }
  function buildSelector() {
    const sel = d3.select("#metric-select");
    fillMetricSelect(sel);
    sel.property("value", currentId);
    sel.on("change", function () { currentId = this.value; refreshView(); });
  }
  function buildYSelect() {
    const sel = d3.select("#y-select");
    fillMetricSelect(sel);
    sel.property("value", currentY);
    sel.on("change", function () { currentY = this.value; if (currentView === "scatter") renderScatter(); writeHash(); });
  }
  function buildPeriods() {
    const sel = d3.select("#period-select");
    PERIODS.forEach((p) => sel.append("option").attr("value", p.id).text(p.label));
    sel.property("value", currentPeriod);
    sel.on("change", function () { currentPeriod = this.value; refreshView(); });
  }
  function buildTabs() {
    document.querySelectorAll(".view-tab").forEach((b) =>
      (b.onclick = () => switchView(b.dataset.view)));
  }

  // ── View switching (Map / Scatter / Table) ───────────────────────────────────
  function refreshView() {
    if (currentView === "map") applyMetric(currentId);
    else if (currentView === "scatter") renderScatter();
    else renderTable();
  }
  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view-tab").forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    document.getElementById("view-map").hidden = view !== "map";
    document.getElementById("view-scatter").hidden = view !== "scatter";
    document.getElementById("view-table").hidden = view !== "table";
    document.getElementById("y-control").hidden = view !== "scatter";
    clearHover();
    refreshView();
    writeHash();
  }

  // ── Recolor on metric / period change ────────────────────────────────────────
  function applyMetric(id) {
    currentId = id;
    const meta = metaById[id];
    const cs = scalesByMetric[id];

    zonesSel.attr("fill", (d) => {
      const v = valueOf(id, d.properties.CPSZ, currentPeriod);
      return v == null ? NO_DATA : cs.fn(v);
    });
    if (insetZonesSel) {
      insetZonesSel.attr("fill", (d) => {
        const v = valueOf(id, d.properties.CPSZ, currentPeriod);
        return v == null ? NO_DATA : cs.fn(v);
      });
      refreshInset();
    }
    document.getElementById("map-title").textContent = meta.title;
    const vint = (meta.vintage || {})[currentPeriod];
    document.getElementById("map-subtitle").textContent =
      meta.subtitle + (vint ? "  ·  " + vint : "  ·  not available for this period");
    d3.select("#metric-select").property("value", id);
    d3.select("#period-select").property("value", currentPeriod);
    renderLegend(meta, cs);
    if (selectedCode) renderDetail(selectedCode);
    positionLabels();   // direct labels follow the active metric/period
    writeHash();
  }

  // ── Selection + zone detail panel ────────────────────────────────────────────
  function toggleSelect(code) { if (selectedCode === code) clearSelection(); else selectZone(code); }
  function selectZone(code) {
    selectedCode = code;
    selCasing.attr("d", outlineByCode[code]);
    selLine.attr("d", outlineByCode[code]);
    selLayer.style("opacity", 1);
    renderDetail(code);
    refreshLegend();
    refreshInset();
    writeHash();
  }
  function clearSelection() {
    selectedCode = null;
    selLayer.style("opacity", 0);
    document.getElementById("zone-detail").hidden = true;
    refreshLegend();
    refreshInset();
    writeHash();
  }
  // Sparkline of one zone's value for a metric across ALL periods. The y-axis
  // AUTOSCALES to this zone's own min..max over time (in cs.norm space, so it stays
  // correct for log/diverging metrics) — otherwise the trajectory is a sliver of the
  // cross-zone color domain and reads as flat. Dot COLOR still uses the global scale,
  // so absolute level is encoded by color while the line shows the temporal shape.
  // A floor on the band keeps an essentially-flat series from being amplified into
  // fake drama. Current period emphasized; adapts to however many periods exist.
  function sparkSVG(id, code, cs) {
    const W = 110, H = 22, padX = 3, padY = 3.5, n = PERIODS.length;
    const meta = metaById[id], vintOf = (pid) => (meta.vintage || {})[pid];
    // Build one point per period, but DE-DUP periods that carry the same vintage as the
    // next data-bearing period (same underlying data — e.g. a non-CPS "2024" point that
    // equals "Latest"); keep the later one. x stays tied to the true period index so the
    // time axis is honest (a dropped period just leaves a gap). The current-period
    // highlight carries forward to the kept twin if its period was dropped.
    const raw = [];
    let carryCur = false;
    for (let i = 0; i < n; i++) {
      const p = PERIODS[i], v = valueOf(id, code, p.id);
      if (v == null) continue;
      let dup = false;
      const vi = vintOf(p.id);
      if (vi) for (let j = i + 1; j < n; j++) {
        if (valueOf(id, code, PERIODS[j].id) == null) continue;
        dup = vintOf(PERIODS[j].id) === vi; break;
      }
      const isCur = p.id === currentPeriod;
      if (dup) { if (isCur) carryCur = true; continue; }
      raw.push({ idx: i, t: cs.norm(v), c: cs.fn(v), cur: isCur || carryCur, pid: p.id, v: v });
      carryCur = false;
    }
    const ts = raw.map((d) => d.t);
    if (!ts.length) return "";
    const FLOOR = 0.12;                                  // min band width (frac of full scale)
    let lo = Math.min(...ts), hi = Math.max(...ts);
    const span = Math.max(hi - lo, FLOOR), mid = (lo + hi) / 2;
    lo = mid - span / 2; hi = mid + span / 2;            // centered band the series fills
    const xOf = (i) => padX + (n > 1 ? i / (n - 1) : 0.5) * (W - 2 * padX);
    const yOf = (t) => padY + (1 - (t - lo) / (hi - lo)) * (H - 2 * padY);
    const pts = raw.map((d) => ({ x: xOf(d.idx), y: yOf(d.t), c: d.c, cur: d.cur, pid: d.pid, v: d.v }));
    const valid = pts;
    const line = valid.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    const dots = pts.map((p) => p
      ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.cur ? 2.8 : 1.7}" fill="${p.c}"${p.cur ? ' stroke="var(--accent)" stroke-width="1.2"' : ''}/>`
      : "").join("");
    // Invisible larger hit targets so each period dot is hoverable (year + value tip).
    const hits = valid.map((p) =>
      `<circle class="spark-hit" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="none" pointer-events="all" data-m="${id}" data-p="${p.pid}" data-v="${p.v}"/>`).join("");
    return `<svg class="zd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
      `<path d="${line}" fill="none" stroke="var(--color-text-muted)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${dots}${hits}</svg>`;
  }
  function renderDetail(code) {
    const host = document.getElementById("zone-detail");
    const items = META.map((m) => {
      const v = valueOf(m.id, code, currentPeriod);
      const cs = scalesByMetric[m.id];
      const r = ranksByMetric[m.id][currentPeriod];
      const active = m.id === currentId ? " active" : "";
      let spark = "", rankTxt = "—";
      if (v != null) {
        spark = sparkSVG(m.id, code, cs);
        const mv = (m.vintage || {})[currentPeriod];
        rankTxt = `#${r.rank[code]} of ${r.count}` + (mv ? ` · ${mv}` : "");
      }
      return `<button type="button" class="zd-item${active}" data-metric="${m.id}">` +
        `<div class="zd-item-head"><span class="zd-label">${m.short}</span>` +
        `<span class="zd-val">${fmtFull(m.id, v)}</span></div>${spark}` +
        `<div class="zd-rank">${rankTxt}</div></button>`;
    }).join("");
    const plabel = (PERIODS.find((p) => p.id === currentPeriod) || {}).label || "";
    host.innerHTML =
      `<div class="zd-head"><div class="zd-headinfo">` +
      `<h4 class="zd-title">${zoneName(code)}</h4>` +
      `<span class="zd-type">${typeByCode[code] || ""} · ${plabel}</span>` +
      `<p class="zd-desc">${descByCode[code] || ""}</p></div>` +
      `<div class="zd-actions">` +
      `<button type="button" class="zd-zoom" aria-label="Zoom the map to this zone">⤢ Zoom to</button>` +
      `<button type="button" class="zd-close" aria-label="Close zone detail">✕</button></div></div>` +
      `<div class="zd-grid">${items}</div>`;
    host.hidden = false;
    host.querySelector(".zd-close").onclick = clearSelection;
    host.querySelector(".zd-zoom").onclick = () => zoomToZone(code);
    host.querySelectorAll(".zd-item").forEach((b) => (b.onclick = () => applyMetric(b.dataset.metric)));
    host.querySelectorAll(".spark-hit").forEach((h) => {
      h.addEventListener("mouseover", (e) => showSparkTip(e, h.dataset.m, h.dataset.p, +h.dataset.v));
      h.addEventListener("mousemove", moveTip);
      h.addEventListener("mouseout", () => tip.style("opacity", 0));
    });
  }
  // Tooltip for a single sparkline dot: which period (with its true vintage) + value.
  function showSparkTip(event, mid, pid, v) {
    const m = metaById[mid];
    const plabel = (PERIODS.find((p) => p.id === pid) || {}).label || pid;
    const vintage = (m.vintage || {})[pid];
    tip.style("opacity", 1).html(
      `<strong>${plabel}</strong>` +
        (vintage && vintage !== plabel ? `<span class="tip-sub">${vintage}</span>` : "") +
        `<span class="tip-val">${m.short}: ${fmtFull(mid, v)}</span>`);
    moveTip(event);
  }

  // ── Shareable URL state (#m=<metric>&z=<zone>&p=<period>) ─────────────────────
  function parseHash() {
    const out = {};
    (location.hash || "").replace(/^#/, "").split("&").forEach((kv) => {
      const [k, val] = kv.split("=");
      if (k === "m") out.metric = decodeURIComponent(val || "");
      if (k === "z") out.zone = decodeURIComponent(val || "");
      if (k === "p") out.period = decodeURIComponent(val || "");
      if (k === "v") out.view = decodeURIComponent(val || "");
      if (k === "y") out.metricY = decodeURIComponent(val || "");
    });
    return out;
  }
  function writeHash() {
    let h = "#m=" + currentId + "&p=" + currentPeriod;
    if (currentView !== "map") h += "&v=" + currentView;
    if (currentView === "scatter") h += "&y=" + currentY;
    if (selectedCode) h += "&z=" + selectedCode;
    history.replaceState(null, "", h);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────
  function highlightZone(code) {
    hlCasing.attr("d", outlineByCode[code]);
    hlLine.attr("d", outlineByCode[code]);
    highlight.style("opacity", 1);
    if (insetZonesSel) insetZonesSel.classed("hl", (d) => d.properties.CPSZ === code);
  }
  function clearHover() {
    highlight.style("opacity", 0);
    tip.style("opacity", 0);
    if (insetZonesSel) insetZonesSel.classed("hl", false);
  }
  function showTip(event, code) {
    const meta = metaById[currentId];
    const v = valueOf(currentId, code, currentPeriod);
    const r = ranksByMetric[currentId][currentPeriod];
    const rankStr = (v != null && r.rank[code]) ? `#${r.rank[code]} of ${r.count}` : "";
    tip.style("opacity", 1).html(
      `<strong>${zoneName(code)}</strong>` +
        `<span class="tip-sub">${typeByCode[code] || ""}</span>` +
        `<span class="tip-val">${meta.title}: ${fmtFull(currentId, v)}</span>` +
        (rankStr ? `<span class="tip-rank">${rankStr} &middot; click to inspect</span>` : "")
    );
    moveTip(event);
  }
  function moveTip(event) {
    const pad = 16;
    let x = event.clientX + pad, y = event.clientY + pad;
    if (x + tipEl.offsetWidth > window.innerWidth) x = event.clientX - tipEl.offsetWidth - pad;
    if (y + tipEl.offsetHeight > window.innerHeight) y = event.clientY - tipEl.offsetHeight - pad;
    tip.style("left", x + "px").style("top", y + "px");
  }

  // ── Legend: gradient key + per-period histogram (fixed domain) ───────────────
  function refreshLegend() { renderLegend(metaById[currentId], scalesByMetric[currentId]); }
  function renderLegend(meta, cs) {
    const LW = 320, PAD = 6, BAR_H = 8, barY = 8;
    const histTop = 21, histH = 26, baseY = histTop + histH;
    const labelY = baseY + 14, LH = labelY + 4, NB = 18;
    const svgL = d3.select("#zone-legend")
      .attr("viewBox", `0 0 ${LW} ${LH}`).attr("preserveAspectRatio", "xMidYMid meet");
    svgL.selectAll("*").remove();
    const innerW = LW - 2 * PAD;
    const xOf = (v) => PAD + Math.max(0, Math.min(1, cs.norm(v))) * innerW;

    const grad = svgL.append("defs").append("linearGradient").attr("id", "zone-grad");
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      grad.append("stop").attr("offset", t * 100 + "%").attr("stop-color", cs.fn(cs.denorm(t)));
    }
    svgL.append("rect").attr("x", PAD).attr("y", barY).attr("width", innerW).attr("height", BAR_H)
      .attr("fill", "url(#zone-grad)").attr("stroke", "#999").attr("stroke-width", 0.5);

    const vals = metricValues(meta.id, currentPeriod);
    const counts = new Array(NB).fill(0);
    vals.forEach((v) => {
      const b = Math.max(0, Math.min(NB - 1, Math.floor(cs.norm(v) * NB)));
      counts[b]++;
    });
    const maxC = d3.max(counts) || 1, binW = innerW / NB;
    counts.forEach((c, i) => {
      if (!c) return;
      const h = (c / maxC) * histH;
      svgL.append("rect").attr("class", "hist-bar")
        .attr("x", PAD + i * binW + 0.5).attr("y", baseY - h)
        .attr("width", binW - 1).attr("height", h)
        .attr("fill", cs.fn(cs.denorm((i + 0.5) / NB)));
    });
    svgL.append("line").attr("class", "hist-base")
      .attr("x1", PAD).attr("x2", LW - PAD).attr("y1", baseY).attr("y2", baseY);

    if (cs.type === "div") {
      const xMid = xOf(0);
      svgL.append("line").attr("x1", xMid).attr("x2", xMid).attr("y1", barY - 2).attr("y2", baseY)
        .attr("stroke", "var(--color-text-strong)").attr("stroke-width", 1).attr("opacity", 0.55);
    }
    const selV = selectedCode ? valueOf(meta.id, selectedCode, currentPeriod) : null;
    if (selV != null) {
      const x = xOf(selV);
      svgL.append("line").attr("class", "sel-rule").attr("x1", x).attr("x2", x).attr("y1", barY).attr("y2", baseY);
      svgL.append("path").attr("class", "sel-marker").attr("d", `M${x - 4},0 L${x + 4},0 L${x},6 Z`);
    }

    svgL.append("text").attr("class", "legend-end").attr("x", PAD).attr("y", labelY)
      .attr("text-anchor", "start").text((cs.loClip ? "≤" : "") + fmtShort(meta.id, cs.lo));
    svgL.append("text").attr("class", "legend-end").attr("x", LW - PAD).attr("y", labelY)
      .attr("text-anchor", "end").text(fmtShort(meta.id, cs.hi) + (cs.hiClip ? "+" : ""));
    const mid = cs.type === "div" ? "Even" : cs.type === "log" ? "← log scale →" : "← 70 zones →";
    svgL.append("text").attr("class", "legend-mid")
      .attr("x", cs.type === "div" ? xOf(0) : LW / 2).attr("y", labelY)
      .attr("text-anchor", "middle").text(mid);
  }

  // ── Scatter view: relate two indicators across the 70 zones ──────────────────
  function renderScatter() {
    const mx = metaById[currentId], my = metaById[currentY];
    document.getElementById("scatter-title").textContent = `${my.short} vs. ${mx.short}`;
    const pts = fc.features.map((f) => {
      const z = f.properties.CPSZ;
      const x = valueOf(currentId, z, currentPeriod), y = valueOf(currentY, z, currentPeriod);
      return (x == null || y == null) ? null : { z, x, y };
    }).filter(Boolean);
    let rTxt = "";
    if (pts.length > 2) {
      const mxv = d3.mean(pts, (d) => d.x), myv = d3.mean(pts, (d) => d.y);
      let sxy = 0, sx = 0, sy = 0;
      pts.forEach((p) => { sxy += (p.x - mxv) * (p.y - myv); sx += (p.x - mxv) ** 2; sy += (p.y - myv) ** 2; });
      const r = sxy / Math.sqrt(sx * sy);
      if (isFinite(r)) rTxt = ` · correlation r = ${r.toFixed(2)}`;
    }
    const plab = (PERIODS.find((p) => p.id === currentPeriod) || {}).label || "";
    document.getElementById("scatter-subtitle").innerHTML =
      `Each dot is one zone · ${plab}${rTxt}  ` +
      Object.entries(TYPE_COLOR).map(([t, c]) => `<span class="sc-key"><i style="background:${c}"></i>${t}</span>`).join("");

    const W = 640, H = 470, m = { t: 14, r: 16, b: 46, l: 66 };
    const xs = d3.scaleLinear().domain(d3.extent(pts, (d) => d.x)).nice().range([m.l, W - m.r]);
    const ys = d3.scaleLinear().domain(d3.extent(pts, (d) => d.y)).nice().range([H - m.b, m.t]);
    const svg = d3.select("#zone-scatter")
      .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();
    svg.append("g").attr("class", "sc-axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(xs).ticks(6).tickFormat((v) => fmtShort(currentId, v)));
    svg.append("g").attr("class", "sc-axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(ys).ticks(6).tickFormat((v) => fmtShort(currentY, v)));
    svg.append("text").attr("class", "sc-axtitle").attr("x", (m.l + W - m.r) / 2).attr("y", H - 8)
      .attr("text-anchor", "middle").text(mx.short);
    svg.append("text").attr("class", "sc-axtitle").attr("transform", "rotate(-90)")
      .attr("x", -(m.t + H - m.b) / 2).attr("y", 16).attr("text-anchor", "middle").text(my.short);
    svg.append("g").selectAll("circle").data(pts).join("circle")
      .attr("class", "sc-pt").attr("cx", (d) => xs(d.x)).attr("cy", (d) => ys(d.y))
      .attr("r", (d) => (d.z === selectedCode ? 6 : 4))
      .attr("fill", (d) => TYPE_COLOR[typeByCode[d.z]] || "#888")
      .classed("sel", (d) => d.z === selectedCode)
      .on("mouseover", (e, d) => showScatterTip(e, d)).on("mousemove", moveTip).on("mouseout", clearHover)
      .on("click", (e, d) => { toggleSelect(d.z); renderScatter(); });
  }
  function showScatterTip(event, d) {
    tip.style("opacity", 1).html(
      `<strong>${zoneName(d.z)}</strong><span class="tip-sub">${typeByCode[d.z] || ""}</span>` +
      `<span class="tip-val">${metaById[currentId].short}: ${fmtFull(currentId, d.x)}</span>` +
      `<span class="tip-rank">${metaById[currentY].short}: ${fmtFull(currentY, d.y)}</span>`);
    moveTip(event);
  }

  // ── Table view: every indicator by zone, click a column header to sort ───────
  function renderTable() {
    const plab = (PERIODS.find((p) => p.id === currentPeriod) || {}).label || "";
    document.getElementById("table-subtitle").textContent =
      `All indicators by zone · ${plab} · click a column header to sort`;
    const arrow = (col) => (tableSort.col === col ? (tableSort.dir > 0 ? " ▲" : " ▼") : "");
    const sorted = fc.features.map((f) => f.properties.CPSZ).sort((a, b) => {
      const c = tableSort.col, d = tableSort.dir;
      if (c === "name") return d * zoneName(a).localeCompare(zoneName(b));
      if (c === "type") return d * (typeByCode[a] || "").localeCompare(typeByCode[b] || "");
      const av = valueOf(c, a, currentPeriod), bv = valueOf(c, b, currentPeriod);
      if (av == null) return 1;
      if (bv == null) return -1;
      return d * (av - bv);
    });
    const head = `<th class="tcol-name" data-col="name">Zone${arrow("name")}</th>` +
      `<th data-col="type">Type${arrow("type")}</th>` +
      META.map((m) => `<th data-col="${m.id}"${m.id === currentId ? ' class="tcol-active"' : ""} title="${m.title}">${m.short}${arrow(m.id)}</th>`).join("");
    const body = sorted.map((z) => {
      const cells = META.map((m) => `<td${m.id === currentId ? ' class="tcol-active"' : ""}>${fmtFull(m.id, valueOf(m.id, z, currentPeriod))}</td>`).join("");
      return `<tr data-zone="${z}"${z === selectedCode ? ' class="trsel"' : ""}>` +
        `<td class="tcol-name">${zoneName(z)}</td><td class="tcol-type">${typeByCode[z] || ""}</td>${cells}</tr>`;
    }).join("");
    const wrap = document.getElementById("zone-table-wrap");
    wrap.innerHTML = `<table class="zone-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    wrap.querySelectorAll("th[data-col]").forEach((th) => (th.onclick = () => {
      const c = th.dataset.col;
      if (tableSort.col === c) tableSort.dir *= -1;
      else tableSort = { col: c, dir: c === "name" || c === "type" ? 1 : -1 };
      renderTable();
    }));
    wrap.querySelectorAll("tr[data-zone]").forEach((tr) => (tr.onclick = () => { selectZone(tr.dataset.zone); renderTable(); }));
  }

  // ── Download: full table, all periods (zone × period rows) ────────────────────
  function downloadCSV() {
    const cols = META.map((m) => m.id);
    const lines = [["zone", "zone_type", "period", ...cols].join(",")];
    fc.features.map((f) => f.properties.CPSZ).sort().forEach((code) => {
      PERIODS.forEach((p) => {
        const row = [code, csvCell(typeByCode[code]), p.id];
        cols.forEach((id) => { const v = valueOf(id, code, p.id); row.push(v == null ? "" : v); });
        lines.push(row.join(","));
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cps_zones_data.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function csvCell(s) {
    s = String(s == null ? "" : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
})();
