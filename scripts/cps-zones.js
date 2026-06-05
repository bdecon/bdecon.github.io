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
  const VALUES_URL = "/files/zone_metric_values.json";
  const METRICS_URL = "/files/zone_metrics.json";
  const PERIODS_URL = "/files/zone_periods.json";

  const W = 960, H = 600;
  const NO_DATA =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg-highlight").trim() || "#e8e8e8";

  // Per-metric color ramps (the metric's `palette` selects one). Kept off
  // cyan/blue so the brand-cyan hover + selection outline reads on every fill.
  const RAMP = {
    YlOrRd: d3.interpolateYlOrRd, YlGn: d3.interpolateYlGn,
    Reds: d3.interpolateReds, Purples: d3.interpolatePurples,
    RdBu: d3.interpolateRdBu, PuOr: d3.interpolatePuOr,
  };
  const rampOf = (meta) => RAMP[meta && meta.palette] || d3.interpolateYlOrRd;

  const FMT = {
    pct1: (v) => v.toFixed(1) + "%",
    usd0: (v) => "$" + Math.round(v).toLocaleString("en-US"),
    idx0: (v) => Math.round(v).toLocaleString("en-US"),
    min1: (v) => v.toFixed(1) + " min",
    num0: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString("en-US"),
    margin: (v) => (v >= 0 ? "D+" : "R+") + Math.abs(v).toFixed(1),
    ratio: (v) => v.toFixed(1) + "×",
    count: (v) => Math.round(v).toLocaleString("en-US"),
    num1: (v) => v.toFixed(1),
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
    idx0: (v) => "" + Math.round(v),
    min1: (v) => v.toFixed(0) + "m",
    num0: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + compact(Math.abs(v)),
    margin: (v) => (v >= 0 ? "D+" : "R+") + Math.abs(v).toFixed(0),
    ratio: (v) => v.toFixed(1) + "×",
    count: (v) => compact(v),
    num1: (v) => v.toFixed(0),
  };
  // ── State ────────────────────────────────────────────────────────────────
  let values, META, PERIODS, currentId, currentPeriod;
  const metaById = {};
  const typeByCode = {};
  const nameByCode = {};                          // CPSZ → human-readable name
  const zoneName = (code) => nameByCode[code] || code.replace(/_/g, " ");
  const scalesByMetric = {};   // id → {fn, lo, hi, type}   (fixed across periods)
  const ranksByMetric = {};    // id → {period → {rank, count}}
  let svg, path, projection, fc, zonesSel, outlineByCode;
  let selLayer, selCasing, selLine, selectedCode = null;
  let highlight, hlCasing, hlLine, calloutG, calloutBox;
  let tip, tipEl;

  const fmtFull = (id, v) => (v == null ? "—" : FMT[metaById[id].fmt](v));
  const fmtShort = (id, v) => FMT_SHORT[metaById[id].fmt](v);

  Promise.all([d3.json(TOPO_URL), d3.json(VALUES_URL), d3.json(METRICS_URL), d3.json(PERIODS_URL)])
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
    if (meta.scale === "div") {
      // Signed metrics (political margin, net migration) diverge about 0; the
      // ramp (RdBu / PuOr) is the metric's own so the two read differently.
      let lo = Math.min(0, d3.min(vals)), hi = Math.max(0, d3.max(vals));
      const span = (hi - lo) || 1;
      return { fn: d3.scaleDiverging(interp).domain([lo, 0, hi]), lo, hi, type: "div",
               norm: (v) => (v - lo) / span, denorm: (t) => lo + t * span };
    }
    if (meta.scale === "log") {
      // Right-skewed counts (population, jobs, transit/capita): equal pixels =
      // equal ratio, so the long tail of small zones isn't washed out by outliers.
      let lo = d3.min(vals.filter((v) => v > 0)) || 1, hi = d3.max(vals);
      if (!(hi > lo)) hi = lo * 10;
      const llo = Math.log(lo), lspan = (Math.log(hi) - llo) || 1;
      return { fn: d3.scaleSequentialLog(interp).domain([lo, hi]), lo, hi, type: "log",
               norm: (v) => (Math.log(Math.max(v, lo)) - llo) / lspan, denorm: (t) => Math.exp(llo + t * lspan) };
    }
    let lo = d3.min(vals), hi = d3.max(vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo;
    return { fn: d3.scaleSequential(interp).domain([lo, hi]), lo, hi, type: "seq",
             norm: (v) => (v - lo) / span, denorm: (t) => lo + t * span };
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
  function setup([topo, vals, metrics, periods]) {
    values = vals; META = metrics; PERIODS = periods;
    META.forEach((m) => (metaById[m.id] = m));
    currentId = META[0].id;
    currentPeriod = PERIODS[PERIODS.length - 1].id;   // newest by default

    fc = topojson.feature(topo, topo.objects.zones);
    rewindToD3(fc);
    fc.features.forEach((f) => {
      typeByCode[f.properties.CPSZ] = f.properties.ZONE_TYPE;
      nameByCode[f.properties.CPSZ] = f.properties.NAME;
    });
    META.forEach((m) => {
      scalesByMetric[m.id] = colorScaleFor(m);
      ranksByMetric[m.id] = {};
      PERIODS.forEach((p) => (ranksByMetric[m.id][p.id] = computeRanks(m.id, p.id)));
    });

    projection = d3.geoAlbersUsa().fitSize([W, H], fc);
    path = d3.geoPath(projection);

    svg = d3.select("#zone-map")
      .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
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

    zonesSel = svg.append("g").selectAll("path.zone")
      .data(fc.features).join("path")
      .attr("class", "zone").attr("d", path)
      .on("mouseover", (e, d) => { highlightZone(d.properties.CPSZ); showTip(e, d.properties.CPSZ); })
      .on("mousemove", moveTip)
      .on("mouseout", clearHover)
      .on("click", (e, d) => toggleSelect(d.properties.CPSZ));

    svg.append("path").attr("class", "zone-borders")
      .attr("d", path(topojson.mesh(topo, topo.objects.zones, (a, b) => a !== b)));

    selLayer = svg.append("g").attr("class", "zone-selected").style("opacity", 0);
    selCasing = selLayer.append("path").attr("class", "sel-casing");
    selLine = selLayer.append("path").attr("class", "sel-line");

    highlight = svg.append("g").attr("class", "zone-highlight").style("opacity", 0);
    hlCasing = highlight.append("path").attr("class", "hl-casing");
    hlLine = highlight.append("path").attr("class", "hl-line");

    const init = parseHash();
    if (init.metric && metaById[init.metric]) currentId = init.metric;
    if (init.period && PERIODS.some((p) => p.id === init.period)) currentPeriod = init.period;

    buildCallout();
    buildSelector();
    buildPeriods();
    document.getElementById("download-csv").addEventListener("click", downloadCSV);

    document.getElementById("map-status").textContent = "";
    applyMetric(currentId);
    if (init.zone && values[init.zone]) selectZone(init.zone);
  }

  function buildCallout() {
    const xy = projection([-73.9857, 40.7484]);
    if (!xy) return;
    const BOX = 14, OFF = [42, 34];
    const [ax, ay] = xy, cx = ax + OFF[0], cy = ay + OFF[1];
    calloutG = svg.append("g").attr("class", "city-callout");
    calloutG.append("line").attr("class", "callout-leader")
      .attr("x1", ax).attr("y1", ay).attr("x2", cx).attr("y2", cy);
    calloutBox = calloutG.append("rect").attr("class", "callout-box")
      .attr("x", cx - BOX / 2).attr("y", cy - BOX / 2).attr("width", BOX).attr("height", BOX);
    calloutG.append("text").attr("class", "callout-label")
      .attr("x", cx).attr("y", cy + BOX / 2 + 13).attr("text-anchor", "middle").text("NYC");
    calloutG
      .on("mouseover", (e) => { calloutG.classed("active", true); highlightZone("NYC_CITY"); showTip(e, "NYC_CITY"); })
      .on("mousemove", moveTip)
      .on("mouseout", clearHover)
      .on("click", () => toggleSelect("NYC_CITY"));
  }

  function buildSelector() {
    const sel = d3.select("#metric-select");
    const cats = [];
    META.forEach((m) => { if (!cats.includes(m.category)) cats.push(m.category); });
    cats.forEach((cat) => {
      const og = sel.append("optgroup").attr("label", cat);
      META.filter((m) => m.category === cat).forEach((m) =>
        og.append("option").attr("value", m.id).text(m.short));
    });
    sel.property("value", currentId);
    sel.on("change", function () { applyMetric(this.value); });
  }

  function buildPeriods() {
    const sel = d3.select("#period-select");
    PERIODS.forEach((p) => sel.append("option").attr("value", p.id).text(p.label));
    sel.property("value", currentPeriod);
    sel.on("change", function () { currentPeriod = this.value; applyMetric(currentId); });
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
    if (calloutBox) {
      const nv = valueOf(id, "NYC_CITY", currentPeriod);
      calloutBox.attr("fill", nv == null ? NO_DATA : cs.fn(nv));
    }
    document.getElementById("map-title").textContent = meta.title;
    const vint = (meta.vintage || {})[currentPeriod];
    document.getElementById("map-subtitle").textContent =
      meta.subtitle + (vint ? "  ·  " + vint : "  ·  not available for this period");
    d3.select("#metric-select").property("value", id);
    d3.select("#period-select").property("value", currentPeriod);
    renderLegend(meta, cs);
    if (selectedCode) renderDetail(selectedCode);
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
    writeHash();
  }
  function clearSelection() {
    selectedCode = null;
    selLayer.style("opacity", 0);
    document.getElementById("zone-detail").hidden = true;
    refreshLegend();
    writeHash();
  }
  function renderDetail(code) {
    const host = document.getElementById("zone-detail");
    const items = META.map((m) => {
      const v = valueOf(m.id, code, currentPeriod);
      const cs = scalesByMetric[m.id];
      const r = ranksByMetric[m.id][currentPeriod];
      const active = m.id === currentId ? " active" : "";
      let bar = "", rankTxt = "—";
      if (v != null) {
        const p = Math.max(0, Math.min(1, cs.norm(v)));
        bar = `<div class="zd-bar"><i style="left:${(p * 100).toFixed(1)}%;background:${cs.fn(v)}"></i></div>`;
        const mv = (m.vintage || {})[currentPeriod];
        rankTxt = `#${r.rank[code]} of ${r.count}` + (mv ? ` · ${mv}` : "");
      }
      return `<button type="button" class="zd-item${active}" data-metric="${m.id}">` +
        `<div class="zd-item-head"><span class="zd-label">${m.short}</span>` +
        `<span class="zd-val">${fmtFull(m.id, v)}</span></div>${bar}` +
        `<div class="zd-rank">${rankTxt}</div></button>`;
    }).join("");
    const plabel = (PERIODS.find((p) => p.id === currentPeriod) || {}).label || "";
    host.innerHTML =
      `<div class="zd-head"><div><h4 class="zd-title">${zoneName(code)}</h4>` +
      `<span class="zd-type">${typeByCode[code] || ""} · ${plabel}</span></div>` +
      `<button type="button" class="zd-close" aria-label="Close zone detail">✕</button></div>` +
      `<div class="zd-grid">${items}</div>`;
    host.hidden = false;
    host.querySelector(".zd-close").onclick = clearSelection;
    host.querySelectorAll(".zd-item").forEach((b) => (b.onclick = () => applyMetric(b.dataset.metric)));
  }

  // ── Shareable URL state (#m=<metric>&z=<zone>&p=<period>) ─────────────────────
  function parseHash() {
    const out = {};
    (location.hash || "").replace(/^#/, "").split("&").forEach((kv) => {
      const [k, val] = kv.split("=");
      if (k === "m") out.metric = decodeURIComponent(val || "");
      if (k === "z") out.zone = decodeURIComponent(val || "");
      if (k === "p") out.period = decodeURIComponent(val || "");
    });
    return out;
  }
  function writeHash() {
    let h = "#m=" + currentId + "&p=" + currentPeriod;
    if (selectedCode) h += "&z=" + selectedCode;
    history.replaceState(null, "", h);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────
  function highlightZone(code) {
    hlCasing.attr("d", outlineByCode[code]);
    hlLine.attr("d", outlineByCode[code]);
    highlight.style("opacity", 1);
  }
  function clearHover() {
    highlight.style("opacity", 0);
    tip.style("opacity", 0);
    if (calloutG) calloutG.classed("active", false);
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
      .attr("text-anchor", "start").text(fmtShort(meta.id, cs.lo));
    svgL.append("text").attr("class", "legend-end").attr("x", LW - PAD).attr("y", labelY)
      .attr("text-anchor", "end").text(fmtShort(meta.id, cs.hi));
    const mid = cs.type === "div" ? "Even" : cs.type === "log" ? "← log scale →" : "← 70 zones →";
    svgL.append("text").attr("class", "legend-mid")
      .attr("x", cs.type === "div" ? xOf(0) : LW / 2).attr("y", labelY)
      .attr("text-anchor", "middle").text(mid);
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
