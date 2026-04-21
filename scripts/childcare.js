(function() {
	'use strict';

	// ============================================================
	// LAYOUT: Three map panels stacked vertically
	//
	// Row 1: US map (pre-projected AlbersUsa, proven reliable)
	//         with DC inset square at right
	// Teal horizontal separator
	// Row 2: Canada (left) | Nordics (right) | Legend (bottom-right)
	//
	// viewBox: 680 x 520 (mobile-first, ~4:3)
	// ============================================================
	const VB_W = 680, VB_H = 900;

	// Row 1: US map (centered)
	const US_LABEL_X = (VB_W - 660) / 2;
	const US_LABEL_Y = 32; // pinned — title stays in place
	const US = { x: (VB_W - 660) / 2 + 10, y: 40, w: 660, h: 370 };

	// --- Middle zone: separators + legend (all independent) ---
	const US_BOTTOM = US.y + US.h;
	let SEP_TOP_Y = US_BOTTOM + 20;           // top separator
	let LEGEND_Y = US_BOTTOM + 88;             // legend bar + flags + labels
	let SEP_BOT_Y = US_BOTTOM + 130;           // bottom separator
	const LEG = { x: 55, y: LEGEND_Y, w: 570, h: 12 };

	// --- Row 2: Canada + Nordics (independent of legend) ---
	let ROW2_LABELS_Y = US_BOTTOM + 176;       // "Canada" / "Nordic Countries" titles
	let ROW2_MAP_Y = US_BOTTOM + 180;           // where maps start rendering
	const ROW2_GAP = 20;
	const ROW2_CA_W = 399, ROW2_NO_W = 209;
	const ROW2_TOTAL = ROW2_CA_W + ROW2_GAP + ROW2_NO_W;
	const ROW2_X = (VB_W - ROW2_TOTAL) / 2;
	let ROW2_H = VB_H - ROW2_MAP_Y - 6;
	const CA = { x: ROW2_X, y: ROW2_LABELS_Y, w: ROW2_CA_W, h: ROW2_H };
	const NO = { x: ROW2_X + ROW2_CA_W + ROW2_GAP + 4, y: ROW2_LABELS_Y, w: ROW2_NO_W, h: ROW2_H };
	// DC inset — positioned off the mid-Atlantic coast near actual DC
	// Exact position is set dynamically after computing the US projection transform
	// HI note: Hawaii is included in pre-projected AlbersUsa (repositioned)

	// --- TopoJSON sources ---
	const TOPO = {
		us:      { url: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json', key: 'states' },
		canada:  { url: 'files/canada_provinces.json', key: 'data' },
		nordics: { url: 'files/nordic_countries.json', key: 'data' }
	};

	// --- State ---
	let DATA = null, METRICS = [], currentMetric = null;
	const WORLD_AVG_GDP = 123.6e12 / 643.56e6 / 1e6; // ~$0.192M (IMF WEO Oct 2025 / UN WPP 2024)
	const topoCache = {};
	let spendingTier = 'narrow'; // 'narrow' or 'broad'
	let wageOccupation = 'cc_only'; // 'cc_only', 'preschool', or 'cacomp'

	// --- DOM refs ---
	const metricTabs = document.getElementById('metric-tabs');
	const mapIndicator = document.getElementById('map-indicator');
	const mapSource = document.getElementById('map-source');
	const mapCaveat = document.getElementById('map-caveat');
	const tooltip = document.getElementById('map-tooltip');
	const container = document.getElementById('map-container');
	const svg = d3.select('#map-svg');
	const spendingToggle = document.getElementById('spending-toggle');
	const wageToggle = document.getElementById('wage-toggle');

	// Click on SVG background clears pinned tooltip
	svg.on('click', function() { clearPin(); });

	// --- Per-metric adaptive color scale ---
	// spending: log (70x range between US and Nordics)
	// wage_ratio: linear (50-75%, reasonable range)
	// enrollment: linear (25-77%, fine)
	// gdp_per_child: winsorized at 95th percentile (caps DC outlier)
	function getColorScale(metricId) {
		const vals = [];
		['us', 'canada', 'nordics'].forEach(function(r) {
			const rd = DATA[r];
			if (!rd || !rd.regions) return;
			Object.values(rd.regions).forEach(function(d) {
				if (d[metricId] != null) vals.push(d[metricId]);
			});
		});
		if (!vals.length) return null;
		vals.sort(d3.ascending);

		let lo = vals[0], hi = vals[vals.length - 1];
		if (lo === hi) { lo -= 0.01; hi += 0.01; }
		let scale;

		if (metricId === 'spending_pct_gdp_narrow' || metricId === 'spending_pct_gdp_broad' || metricId === 'workforce_share_pct') {
			// Log scale: compresses high end, expands low end
			const logLo = Math.max(lo, 0.01);  // avoid log(0)
			scale = d3.scaleSequentialLog(function(t) { return d3.interpolateViridis(1 - t); })
				.domain([logLo, hi]);
			return { scale: scale, lo: logLo, hi: hi, type: 'log' };
		} else if (metricId === 'gdp_per_child_0_5') {
			// Winsorized: cap at 95th percentile
			const p95 = d3.quantile(vals, 0.95);
			const capHi = p95 || hi;
			scale = d3.scaleSequential(function(t) { return d3.interpolateViridis(1 - t); })
				.domain([lo, capHi]);
			// Wrap so values above cap get the max color
			const rawScale = scale;
			scale = function(v) {
				return rawScale(Math.min(v, capHi));
			};
			scale.domain = rawScale.domain.bind(rawScale);
			return { scale: scale, lo: lo, hi: capHi, type: 'winsorized', trueHi: hi };
		} else {
			// Linear (wage_ratio, enrollment, any future metrics)
			scale = d3.scaleSequential(function(t) { return d3.interpolateViridis(1 - t); })
				.domain([lo, hi]);
			return { scale: scale, lo: lo, hi: hi, type: 'linear' };
		}
	}

	// --- Format value ---
	function fmtVal(val, metric) {
		if (val == null) return 'N/A';
		return metric.prefix + val.toFixed(metric.decimals) + metric.suffix;
	}

	// --- Lookup region data (handles zero-padded and unpadded FIPS) ---
	function lookupRegion(regionData, id) {
		const s = String(id);
		return regionData[s] || regionData[s.padStart(2, '0')];
	}

	// --- Tooltip ---
	let pinnedRegion = null; // currently pinned element

	function showTooltip(event, html) {
		tooltip.innerHTML = html;
		tooltip.classList.add('visible');
		const rect = container.getBoundingClientRect();
		let x = event.clientX - rect.left + 12;
		let y = event.clientY - rect.top - 10;
		const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
		if (x + tw > rect.width - 10) x = x - tw - 24;
		if (y + th > rect.height - 10) y = rect.height - th - 10;
		if (y < 0) y = 10;
		tooltip.style.left = x + 'px';
		tooltip.style.top = y + 'px';
	}
	function hideTooltip() {
		if (pinnedRegion) return; // don't hide while pinned
		tooltip.classList.remove('visible');
	}
	function clearPin() {
		if (pinnedRegion) {
			d3.select(pinnedRegion).classed('active', false);
			pinnedRegion = null;
		}
		tooltip.classList.remove('visible');
	}

	function tooltipHtml(info, regionKey) {
		const mid = currentMetric.id;
		const val = info[mid];
		// Show "(national)" when Canada is in national fallback mode
		let displayName = info.name;
		if (regionKey === 'canada' && isCanadaNational(mid) &&
			DATA.canada && info === DATA.canada.national) {
			displayName = 'Canada (national)';
		}
		let lines = '<div class="chart-tooltip-header">' + displayName + '</div>';
		lines += '<div style="margin-bottom:3px"><span class="cc-tooltip-value">' +
			fmtVal(val, currentMetric) + '</span></div>';
		if (mid === 'gdp_per_child_0_5' && val != null) {
			lines += '<div style="font-size:10px;opacity:0.8">' +
				(val / WORLD_AVG_GDP).toFixed(1) + 'x world average</div>';
		}
		if (mid === 'wage_ratio_cc_pct' && info.cc_wage_annual != null) {
			lines += '<div style="font-size:10px;opacity:0.8">Wage: $' +
				d3.format(',')(info.cc_wage_annual) +
				' / $' + d3.format(',')(info.all_median_wage_annual) + '</div>';
		} else if (mid === 'wage_ratio_pt_pct' && info.pt_wage_annual != null) {
			lines += '<div style="font-size:10px;opacity:0.8">Wage: $' +
				d3.format(',')(info.pt_wage_annual) +
				' / $' + d3.format(',')(info.all_median_wage_annual) + '</div>';
		} else if (mid === 'wage_ratio_cacomp_pct' && info.cc_wage_annual != null && info.pt_wage_annual != null) {
			const blended = Math.round(0.63 * info.pt_wage_annual + 0.37 * info.cc_wage_annual);
			lines += '<div style="font-size:10px;opacity:0.8">Wage: $' +
				d3.format(',')(blended) +
				' / $' + d3.format(',')(info.all_median_wage_annual) + '</div>';
		} else if (val != null && isWageMetric(currentMetric) && info.wage_local_fmt) {
			const wLocal = mid === 'wage_ratio_cc_pct' ? info.wage_local_cc :
				mid === 'wage_ratio_pt_pct' ? info.wage_local_pt : info.wage_local_comp;
			if (wLocal != null && info.wage_local_all != null) {
				const fmtW = function(v) {
					const s = v >= 100 ? d3.format(',')(Math.round(v)) : v.toFixed(2);
					return info.wage_local_fmt.replace('%s', s);
				};
				lines += '<div style="font-size:10px;opacity:0.8">Wage: ' +
					fmtW(wLocal) + ' / ' + fmtW(info.wage_local_all) + '</div>';
			}
		}
		const natData = DATA[regionKey] && DATA[regionKey].national;
		// Skip national comparison when showing national-level data
		if (natData && natData[mid] != null && val != null && info !== natData) {
			const natVal = natData[mid];
			const diff = val - natVal;
			const sign = diff >= 0 ? '+' : '';
			const label = regionKey === 'us' ? 'US average' :
				regionKey === 'canada' ? 'CA average' : 'Average';
			lines += '<div style="font-size:10px;opacity:0.7;margin-top:2px">' + label + ': ' +
				fmtVal(natVal, currentMetric) +
				' (' + sign + diff.toFixed(currentMetric.decimals) + ')</div>';
		}
		return lines;
	}

	// --- Load TopoJSON with cache ---
	function loadTopo(key) {
		if (topoCache[key]) return Promise.resolve(topoCache[key]);
		return d3.json(TOPO[key].url).then(function(t) { topoCache[key] = t; return t; });
	}

	// --- Check if Canada has only national-level data for the current metric ---
	function isCanadaNational(metricId) {
		const regions = DATA.canada && DATA.canada.regions;
		const nat = DATA.canada && DATA.canada.national;
		if (!regions || !nat) return true;
		const natVal = nat[metricId];
		if (natVal == null) return true;
		const vals = Object.values(regions).map(function(d) { return d[metricId]; });
		const unique = vals.filter(function(v, i, a) { return v != null && a.indexOf(v) === i; });
		// National-only if every province has the same value or null
		return unique.length <= 1;
	}

	// --- Draw features into a group ---
	function drawFeatures(g, features, mesh, regionData, regionKey, colorInfo, path) {
		const mid = currentMetric.id;
		const hasData = Object.values(regionData).some(function(d) { return d[mid] != null; });

		g.selectAll('.region')
			.data(features)
			.enter().append('path')
			.attr('class', 'region')
			.attr('d', path)
			.attr('data-id', function(d) { return d.id; })
			.attr('fill', '#ddd')
			.on('mousemove', function(event, d) {
				if (pinnedRegion) return;
				// Raise to top so stroke isn't clipped by neighbors
				this.parentNode.appendChild(this);
				const info = lookupRegion(regionData, d.id);
				if (info) showTooltip(event, tooltipHtml(info, regionKey));
			})
			.on('mouseleave', function() {
				if (pinnedRegion !== this) hideTooltip();
			})
			.on('click', function(event, d) {
				event.stopPropagation();
				if (pinnedRegion === this) {
					clearPin();
					return;
				}
				clearPin();
				pinnedRegion = this;
				d3.select(this).classed('active', true);
				this.parentNode.appendChild(this);
				const info = lookupRegion(regionData, d.id);
				if (info) showTooltip(event, tooltipHtml(info, regionKey));
			})
			.transition().duration(400)
			.attr('fill', function(d) {
				const info = lookupRegion(regionData, d.id);
				const val = info ? info[mid] : null;
				if (!hasData || val == null || !colorInfo) return '#ddd';
				return colorInfo.scale(val);
			});

		if (mesh) {
			g.append('path').datum(mesh)
				.attr('class', 'region-border').attr('d', path);
		}
	}

	// --- Draw inset box ---
	function drawInset(parent, info, regionKey, colorInfo, x, y, size, label, fs) {
		if (!info) return;
		const val = info[currentMetric.id];
		const fill = (val != null && colorInfo) ? colorInfo.scale(val) : '#ddd';
		const g = parent.append('g').attr('class', 'inset-box');
		g.append('rect')
			.attr('x', x).attr('y', y)
			.attr('width', size).attr('height', size)
			.attr('fill', fill).attr('rx', 1);
		const labelLines = label.split('\n');
		const lx = x + size + 4;
		const ly = labelLines.length > 1 ? y + size / 2 - 4 : y + size / 2 + 4;
		const txt = g.append('text')
			.attr('x', lx)
			.attr('y', ly)
			.attr('text-anchor', 'start')
			.attr('font-size', fs ? fs(12) : 12);
		if (labelLines.length === 1) {
			txt.text(label);
		} else {
			labelLines.forEach(function(line, i) {
				txt.append('tspan')
					.attr('x', lx)
					.attr('dy', i === 0 ? 0 : '1.1em')
					.text(line);
			});
		}
		g.on('mousemove', function(event) {
			if (pinnedRegion) return;
			showTooltip(event, tooltipHtml(info, regionKey));
		}).on('mouseleave', function() {
			if (pinnedRegion !== this) hideTooltip();
		}).on('click', function(event) {
			event.stopPropagation();
			if (pinnedRegion === this) { clearPin(); return; }
			clearPin();
			pinnedRegion = this;
			showTooltip(event, tooltipHtml(info, regionKey));
		});
	}

	// --- Map a value to 0-1 position on the legend bar ---
	function legendPos(v, colorInfo) {
		const lo = colorInfo.lo, hi = colorInfo.hi;
		if (colorInfo.type === 'log') {
			const logLo = Math.log(lo), logHi = Math.log(hi);
			return Math.max(0, Math.min(1, (Math.log(Math.max(v, lo)) - logLo) / (logHi - logLo)));
		}
		return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
	}

	// --- Legend semantic labels (low/high end descriptors) ---
	const LEGEND_LABELS = {
		'enrollment_pct': ['Low enrollment', 'High enrollment'],
		'wage_ratio_cc_pct': ['Poverty wage', 'Livable wage'],
		'wage_ratio_pt_pct': ['Lower wage', 'Higher wage'],
		'wage_ratio_cacomp_pct': ['Lower wage', 'Higher wage'],
		'workforce_share_pct': ['Small workforce', 'Full workforce'],
		'spending_pct_gdp_narrow': ['Family burden', 'Public funded'],
		'spending_pct_gdp_broad': ['Family burden', 'Public funded'],
		'gdp_per_child_0_5': ['4x world average', '9x world average+']
	};

	// --- Draw legend inside SVG ---
	function drawLegend(parent, colorInfo, metric, fs) {
		const lx = LEG.x, ly = LEG.y, lw = LEG.w, lh = LEG.h;
		const lg = parent.append('g').attr('class', 'legend-group');
		if (!colorInfo) return;

		const gradId = 'lg-' + Date.now();
		const defs = lg.append('defs');
		const grad = defs.append('linearGradient').attr('id', gradId);
		// Generate gradient stops that match the scale type
		for (let i = 0; i <= 20; i++) {
			const t = i / 20;
			let v;
			if (colorInfo.type === 'log') {
				// Log-spaced stops so gradient visually matches the scale
				const logLo = Math.log(colorInfo.lo), logHi = Math.log(colorInfo.hi);
				v = Math.exp(logLo + t * (logHi - logLo));
			} else {
				v = colorInfo.lo + t * (colorInfo.hi - colorInfo.lo);
			}
			grad.append('stop')
				.attr('offset', (t * 100) + '%')
				.attr('stop-color', colorInfo.scale(v));
		}

		const isResources = metric.id === 'gdp_per_child_0_5';
		const barX = isResources ? lx - 30 : lx;
		const barW = isResources ? lw + 60 : lw;

		lg.append('rect')
			.attr('x', barX).attr('y', ly)
			.attr('width', barW).attr('height', lh)
			.attr('fill', 'url(#' + gradId + ')')
			.attr('rx', 1);

		// Min/max labels
		const hiLabel = colorInfo.trueHi
			? fmtVal(colorInfo.hi, metric) + '+'
			: fmtVal(colorInfo.hi, metric);
		if (isResources) {
			// Resources: labels above endpoints of the wider bar
			const aboveY = ly - 6;
			lg.append('text').attr('class', 'legend-label legend-label-end')
				.attr('x', barX).attr('y', aboveY)
				.attr('text-anchor', 'start')
				.attr('font-size', fs(14))
				.text(fmtVal(colorInfo.lo, metric));
			lg.append('text').attr('class', 'legend-label legend-label-end')
				.attr('x', barX + barW).attr('y', aboveY)
				.attr('text-anchor', 'end')
				.attr('font-size', fs(14))
				.text(hiLabel);
		} else {
			// Default: labels outside the bar, vertically centered
			const labelY = ly + lh / 2 + 7.5;
			lg.append('text').attr('class', 'legend-label legend-label-end')
				.attr('x', lx - 6).attr('y', labelY)
				.attr('text-anchor', 'end')
				.attr('font-size', fs(14))
				.text(fmtVal(colorInfo.lo, metric));
			lg.append('text').attr('class', 'legend-label legend-label-end')
				.attr('x', lx + lw + 6).attr('y', labelY)
				.attr('text-anchor', 'start')
				.attr('font-size', fs(14))
				.text(hiLabel);
		}

		// Semantic legend labels (e.g. "Low enrollment" / "High enrollment")
		const semLabels = LEGEND_LABELS[metric.id];
		if (semLabels) {
			const semY = SEP_TOP_Y + 22;
			const semOff = container.clientWidth < 500 ? 8 : 2;
			lg.append('text').attr('class', 'legend-semantic')
				.attr('x', lx - 32).attr('y', semY + semOff)
				.attr('text-anchor', 'start')
				.attr('font-size', fs(13))
				.text(semLabels[0]);
			lg.append('text').attr('class', 'legend-semantic')
				.attr('x', lx + lw + 32).attr('y', semY + semOff)
				.attr('text-anchor', 'end')
				.attr('font-size', fs(13))
				.text(semLabels[1]);
		}

		// National average ticks with flags (alternating above/below)
		const fw = fs(18), fh = fs(13);
		const legendMarkers = [];

		// US and Canada national averages
		['us', 'canada'].forEach(function(rk) {
			const nat = DATA[rk] && DATA[rk].national;
			if (!nat || nat[metric.id] == null) return;
			legendMarkers.push({ code: rk === 'us' ? 'US' : 'CA', val: nat[metric.id] });
		});

		// Nordic countries (each is its own nation)
		const nordicMap = { '208': 'DK', '246': 'FI', '578': 'NO', '752': 'SE' };
		if (DATA.nordics && DATA.nordics.regions) {
			Object.keys(nordicMap).forEach(function(id) {
				const r = DATA.nordics.regions[id];
				if (r && r[metric.id] != null) {
					legendMarkers.push({ code: nordicMap[id], val: r[metric.id] });
				}
			});
		}

		// Sort by value (left to right on legend bar)
		legendMarkers.sort(function(a, b) { return a.val - b.val; });

		// Greedy collision avoidance: assign each flag to above or below,
		// picking whichever level has room (rightmost edge is clear)
		let edgeAbove = -Infinity, edgeBelow = -Infinity;
		const minGap = fw + 3; // minimum horizontal space between flags on same level

		// Name map for legend tooltip headers
		const legendNames = { US: 'United States', CA: 'Canada', DK: 'Denmark', FI: 'Finland', NO: 'Norway', SE: 'Sweden' };

		legendMarkers.forEach(function(m) {
			const tPos = legendPos(m.val, colorInfo);
			const xp = barX + tPos * barW;
			const flagLeft = xp - fw / 2;

			// Pick the level with more clearance
			let above;
			if (flagLeft >= edgeAbove && flagLeft >= edgeBelow) {
				above = true; // both clear, default to above
			} else if (flagLeft >= edgeAbove) {
				above = true;
			} else if (flagLeft >= edgeBelow) {
				above = false;
			} else {
				// both overlap -- pick whichever has less overlap
				above = (flagLeft - edgeAbove) > (flagLeft - edgeBelow);
			}

			if (above) {
				edgeAbove = flagLeft + minGap;
			} else {
				edgeBelow = flagLeft + minGap;
			}

			const mg = lg.append('g').attr('class', 'legend-marker').style('cursor', 'pointer');

			mg.append('line')
				.attr('x1', xp).attr('x2', xp)
				.attr('y1', above ? ly - fh : ly)
				.attr('y2', above ? ly + lh : ly + lh + fh)
				.attr('stroke', 'var(--color-text-strong)')
				.attr('stroke-width', 0.8);
			const fy = above ? ly - fh - 3 : ly + lh + 3;
			drawFlag(mg, m.code, xp - fw/2, fy, fw, fh);
			// Invisible hit area over flag + tick
			mg.append('rect')
				.attr('x', xp - fw/2 - 2).attr('y', Math.min(ly - fh - 4, fy) - 2)
				.attr('width', fw + 4)
				.attr('height', (above ? lh + fh + 7 : lh + fh + 7) + 4)
				.attr('fill', 'transparent');

			// Tooltip on hover
			const ttLabel = (legendNames[m.code] || m.code) + ' (national)';
			const ttVal = fmtVal(m.val, metric);
			mg.on('mouseenter', function(event) {
				const html = '<div class="chart-tooltip-header">' + ttLabel + '</div>' +
					'<div><span class="cc-tooltip-value">' + ttVal + '</span></div>';
				showTooltip(event, html);
			}).on('mousemove', function(event) {
				showTooltip(event, tooltip.innerHTML);
			}).on('mouseleave', hideTooltip);
		});
	}

	// --- SVG flag drawing helper ---
	function drawFlag(parent, code, x, y, w, h) {
		parent.append('image')
			.attr('href', 'files/childcare-images/flags/' + code.toLowerCase() + '.png')
			.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
		parent.append('rect')
			.attr('x', x).attr('y', y).attr('width', w).attr('height', h)
			.attr('fill', 'none').attr('stroke', 'rgba(0,0,0,0.15)').attr('stroke-width', 0.5)
			.attr('rx', 0.5);
	}

	// --- Composite render ---
	// Resolve current spending metric based on toggle state
	function resolveSpendingMetric() {
		const id = spendingTier === 'broad' ? 'spending_pct_gdp_broad' : 'spending_pct_gdp_narrow';
		return METRICS.find(function(m) { return m.id === id; });
	}

	function isSpendingMetric(metric) {
		return metric && (metric.id === 'spending_pct_gdp_narrow' || metric.id === 'spending_pct_gdp_broad');
	}

	// Resolve current wage metric based on occupation toggle state
	function resolveWageMetric() {
		const id = wageOccupation === 'cc_only' ? 'wage_ratio_cc_pct' :
			wageOccupation === 'preschool' ? 'wage_ratio_pt_pct' : 'wage_ratio_cacomp_pct';
		return METRICS.find(function(m) { return m.id === id; });
	}

	function isWageMetric(metric) {
		return metric && (metric.id === 'wage_ratio_cc_pct' || metric.id === 'wage_ratio_pt_pct' || metric.id === 'wage_ratio_cacomp_pct');
	}

	function render() {
		clearPin();
		svg.selectAll('*').remove();
		if (!DATA || !currentMetric) return;

		// Mobile detection: scale up fonts when viewBox (680) is wider than container
		const mobile = container.clientWidth < 500;
		const fs = mobile ? function(base) { return Math.round(base * 1.6); } : function(base) { return base; };

		// Desktop/mobile layout overrides (outer vars are shared defaults)
		if (!mobile) {
			SEP_TOP_Y = US_BOTTOM + 10;
			LEGEND_Y = US_BOTTOM + 62;
			SEP_BOT_Y = US_BOTTOM + 96;
			LEG.y = LEGEND_Y;
			ROW2_LABELS_Y = US_BOTTOM + 138;
			ROW2_MAP_Y = US_BOTTOM + 138;
			ROW2_H = 304; // match mobile projection zoom so northern Canada clips
			CA.y = ROW2_LABELS_Y; CA.h = ROW2_H;
			NO.y = ROW2_LABELS_Y; NO.h = ROW2_H;
		} else {
			SEP_TOP_Y = US_BOTTOM + 20;
			LEGEND_Y = US_BOTTOM + 88;
			SEP_BOT_Y = US_BOTTOM + 130;
			LEG.y = LEGEND_Y;
			ROW2_LABELS_Y = US_BOTTOM + 176;
			ROW2_MAP_Y = US_BOTTOM + 180;
			ROW2_H = VB_H - ROW2_MAP_Y - 6;
			CA.y = ROW2_LABELS_Y; CA.h = ROW2_H;
			NO.y = ROW2_LABELS_Y; NO.h = ROW2_H;
		}

		// Set viewBox based on desktop/mobile
		const vbH = mobile ? 900 : 858;
		svg.attr('viewBox', '0 0 ' + VB_W + ' ' + vbH);

		// Show/hide spending toggle
		if (spendingToggle) spendingToggle.classList.toggle('visible', isSpendingMetric(currentMetric));
		// Show/hide wage occupation toggle
		if (wageToggle) wageToggle.classList.toggle('visible', isWageMetric(currentMetric));

		const colorInfo = getColorScale(currentMetric.id);
		mapIndicator.textContent = currentMetric.name;
		mapSource.textContent = 'Source: ' + currentMetric.source;
		mapCaveat.textContent = currentMetric.caveat || '';
		mapCaveat.style.display = currentMetric.caveat ? '' : 'none';

		Promise.all([
			loadTopo('us'),
			loadTopo('canada'),
			loadTopo('nordics')
		]).then(function(topos) {
			const usTopo = topos[0], caTopo = topos[1], noTopo = topos[2];

			// =======================
			// US MAP (pre-projected AlbersUsa)
			// =======================
			// states-albers-10m.json is already projected to ~960x600.
			// We need a null-projection path generator and scale to fit our area.
			const usFC = topojson.feature(usTopo, usTopo.objects.states);

			// Compute bounding box of the pre-projected coordinates
			// Clamp left edge to X=50 to exclude far-west Aleutian Islands from sizing
			const usBounds = d3.geoPath(null).bounds(usFC);
			const bx = Math.max(usBounds[0][0], 50), by = usBounds[0][1];
			const bw = usBounds[1][0] - bx, bh = usBounds[1][1] - by;

			// Scale and translate to fit our US area
			const usScale = Math.min(US.w / bw, US.h / bh);
			const usTx = US.x + (US.w - bw * usScale) / 2 - bx * usScale;
			const usTy = US.y + (US.h - bh * usScale) / 2 - by * usScale;

			const usPath = d3.geoPath(
				d3.geoTransform({
					point: function(x, y) {
						this.stream.point(x * usScale + usTx, y * usScale + usTy);
					}
				})
			);

			// All US features (AlbersUsa already excludes territories,
			// and repositions AK + HI)
			const usMesh = topojson.mesh(usTopo, usTopo.objects.states,
				function(a, b) { return a !== b; });

			const usG = svg.append('g');
			drawFeatures(usG, usFC.features, usMesh,
				DATA.us.regions, 'us', colorInfo, usPath);

			// US label with flag on new line below
			svg.append('text').attr('class', 'group-label')
				.attr('x', US_LABEL_X + 4).attr('y', US_LABEL_Y - 7)
				.attr('font-size', fs(16))
				.text('United States');
			drawFlag(svg, 'US', US_LABEL_X + 4, US_LABEL_Y + 1, mobile ? 28 : 18, mobile ? 20 : 13);

			// DC and NYC inset positions
			const dcSize = 14, nycSize = 14;

			const dcFeature = usFC.features.find(function(f) {
				return String(f.id) === '11' || String(f.id).padStart(2, '0') === '11';
			});
			const dcCentroid = dcFeature ? usPath.centroid(dcFeature) : [0, 0];
			const dcX = dcCentroid[0] + 40;
			const dcY = dcCentroid[1] + 15;

			const nyFeature = usFC.features.find(function(f) {
				return String(f.id) === '36' || String(f.id).padStart(2, '0') === '36';
			});
			// NYC — exact pre-projected coordinates from the TopoJSON geometry
			// (southern tip of NY state polygon, ~Manhattan area)
			const nycOriginX = 869 * usScale + usTx;
			const nycOriginY = 219 * usScale + usTy;
			const nycX = nycOriginX + 25;
			const nycY = nycOriginY + 10;

			// Draw leader lines first (below boxes in z-order)
			if (dcFeature) {
				svg.append('line')
					.attr('x1', dcCentroid[0]).attr('y1', dcCentroid[1])
					.attr('x2', dcX + dcSize / 2).attr('y2', dcY + dcSize / 2)
					.attr('stroke', 'var(--color-text-muted)')
					.attr('stroke-width', 0.7)
					.attr('stroke-dasharray', '2,2')
					.attr('pointer-events', 'none');
			}
			if (nyFeature) {
				svg.append('line')
					.attr('x1', nycOriginX).attr('y1', nycOriginY)
					.attr('x2', nycX + nycSize / 2).attr('y2', nycY + nycSize / 2)
					.attr('stroke', 'var(--color-text-muted)')
					.attr('stroke-width', 0.7)
					.attr('stroke-dasharray', '2,2')
					.attr('pointer-events', 'none');
			}

			// Draw inset boxes on top of lines
			drawInset(svg, lookupRegion(DATA.us.regions, 11), 'us', colorInfo,
				dcX, dcY, mobile ? 20 : dcSize, 'DC', fs);
			const nycMetroMetrics = {'wage_ratio_cc_pct': 1, 'wage_ratio_pt_pct': 1, 'wage_ratio_cacomp_pct': 1, 'workforce_share_pct': 1};
			const nycLabel = nycMetroMetrics[currentMetric.id] ? 'NYC\nMetro' : 'NYC';
			drawInset(svg, DATA.us.regions['NYC'], 'us', colorInfo,
				nycX, nycY, mobile ? 20 : nycSize, nycLabel, fs);

			// =======================
			// SEPARATOR LINES + LEGEND (full width, between US and row 2)
			// =======================
			svg.append('rect')
				.attr('class', 'map-divider')
				.attr('x', 6).attr('y', SEP_TOP_Y)
				.attr('width', VB_W - 12).attr('height', 3)
				.attr('rx', 1.5);

			drawLegend(svg, colorInfo, currentMetric, fs);

			svg.append('rect')
				.attr('class', 'map-divider')
				.attr('x', 6).attr('y', SEP_BOT_Y)
				.attr('width', VB_W - 12).attr('height', 3)
				.attr('rx', 1.5);

			// =======================
			// CANADA (conic equal-area, own projection)
			// =======================
			const caFC = topojson.feature(caTopo, caTopo.objects.data);

			// Fit to Canada excluding Nunavut's arctic islands (same
			// approach as Svalbard for Norway — NU is still rendered
			// but doesn't drive the zoom level)
			const caFitFC = {
				type: 'FeatureCollection',
				features: caFC.features.filter(function(f) {
					return f.id !== 'NU';
				})
			};
			const caProj = d3.geoConicEqualArea()
				.rotate([96, 0])
				.parallels([49, 63])
				.fitExtent([[CA.x - 6, ROW2_MAP_Y], [CA.x + CA.w - 6, ROW2_MAP_Y + CA.h]], caFitFC);
			const caPath = d3.geoPath(caProj);

			// Clip Canada to its area
			svg.append('defs').append('clipPath').attr('id', 'ca-clip')
				.append('rect')
				.attr('x', CA.x - 6).attr('y', ROW2_MAP_Y)
				.attr('width', CA.w + 6).attr('height', CA.h);

			const caG = svg.append('g')
				.attr('clip-path', 'url(#ca-clip)');

			const caNatMode = isCanadaNational(currentMetric.id);

			if (caNatMode) {
				// National fallback: draw one merged shape
				const caMerged = topojson.merge(caTopo, caTopo.objects.data.geometries);
				const natData = DATA.canada.national;
				const natVal = natData ? natData[currentMetric.id] : null;
				const fill = (natVal != null && colorInfo) ? colorInfo.scale(natVal) : '#ddd';
				caG.append('path')
					.datum(caMerged)
					.attr('class', 'region')
					.attr('d', caPath)
					.attr('fill', fill)
					.on('mousemove', function(event) {
						if (pinnedRegion) return;
						if (natData) showTooltip(event, tooltipHtml(natData, 'canada'));
					})
					.on('mouseleave', function() {
						if (pinnedRegion !== this) hideTooltip();
					})
					.on('click', function(event) {
						event.stopPropagation();
						if (pinnedRegion === this) { clearPin(); return; }
						clearPin();
						pinnedRegion = this;
						d3.select(this).classed('active', true);
						if (natData) showTooltip(event, tooltipHtml(natData, 'canada'));
					});
			} else {
				// Province mode: individual features + internal borders
				const caMesh = topojson.mesh(caTopo, caTopo.objects.data,
					function(a, b) { return a !== b; });
				drawFeatures(caG, caFC.features, caMesh,
					DATA.canada.regions, 'canada', colorInfo, caPath);
			}

			// Canada label with flag on new line below
			svg.append('text').attr('class', 'group-label')
				.attr('x', CA.x - 8).attr('y', CA.y - 6)
				.attr('font-size', fs(16))
				.text('Canada');
			drawFlag(svg, 'CA', CA.x - 8, CA.y + 2, mobile ? 28 : 18, mobile ? 20 : 13);

			// =======================
			// NORDICS (conformal, own projection)
			// =======================
			const noFC = topojson.feature(noTopo, noTopo.objects.data);
			const noMesh = topojson.mesh(noTopo, noTopo.objects.data,
				function(a, b) { return a !== b; });
			const noProj = d3.geoConicConformal()
				.parallels([57, 68])
				.rotate([-15, 0])
				.fitExtent([[NO.x, ROW2_MAP_Y], [NO.x + NO.w, ROW2_MAP_Y + NO.h]], noFC);
			const noPath = d3.geoPath(noProj);

			const noG = svg.append('g');
			drawFeatures(noG, noFC.features, noMesh,
				DATA.nordics.regions, 'nordics', colorInfo, noPath);

			// Nordics label with flags on second line, spaced
			svg.append('text').attr('class', 'group-label')
				.attr('x', NO.x - 18).attr('y', NO.y - 8)
				.attr('font-size', fs(16))
				.text('Nordic Countries');
			const nfx = NO.x - 18, nfy = NO.y + 1;
			const nfw = mobile ? 26 : 17, nfh = mobile ? 18 : 12, nfg = mobile ? 5 : 4;
			drawFlag(svg, 'DK', nfx, nfy, nfw, nfh);
			drawFlag(svg, 'FI', nfx + nfw + nfg, nfy, nfw, nfh);
			drawFlag(svg, 'NO', nfx + 2*(nfw + nfg), nfy, nfw, nfh);
			drawFlag(svg, 'SE', nfx + 3*(nfw + nfg), nfy, nfw, nfh);
		});
	}

	// --- Tab clicks ---
	metricTabs.addEventListener('click', function(e) {
		const btn = e.target.closest('.cc-tab');
		if (!btn) return;
		const metricId = btn.getAttribute('data-metric');
		if (metricId === 'spending_pct_gdp') {
			// Spending meta-tab: resolve to current tier
			currentMetric = resolveSpendingMetric();
		} else if (metricId === 'wage_ratio_pct') {
			// Wage meta-tab: resolve to current occupation toggle
			currentMetric = resolveWageMetric();
		} else {
			currentMetric = METRICS.find(function(m) { return m.id === metricId; });
		}
		metricTabs.querySelectorAll('.cc-tab').forEach(function(t) { t.classList.remove('active'); });
		btn.classList.add('active');
		render();
	});

	// --- Spending toggle clicks ---
	if (spendingToggle) {
		spendingToggle.addEventListener('click', function(e) {
			const btn = e.target.closest('.spending-toggle-btn');
			if (!btn) return;
			spendingTier = btn.getAttribute('data-tier');
			spendingToggle.querySelectorAll('.spending-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
			btn.classList.add('active');
			currentMetric = resolveSpendingMetric();
			render();
		});
	}

	// --- Wage occupation toggle clicks ---
	if (wageToggle) {
		wageToggle.addEventListener('click', function(e) {
			const btn = e.target.closest('.wage-toggle-btn');
			if (!btn) return;
			wageOccupation = btn.getAttribute('data-occ');
			wageToggle.querySelectorAll('.wage-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
			btn.classList.add('active');
			currentMetric = resolveWageMetric();
			render();
		});
	}

	// --- Load data & render ---
	d3.json('files/childcare_us.json').then(function(data) {
		DATA = data;
		METRICS = data.metrics;
		// Default to enrollment (the "Enrollment" tab is active by default)
		currentMetric = METRICS.find(function(m) { return m.id === 'enrollment_pct'; });
		render();
	}).catch(function(err) {
		console.error('Failed to load data:', err);
		svg.append('text')
			.attr('x', VB_W / 2).attr('y', VB_H / 2)
			.attr('text-anchor', 'middle')
			.attr('font-size', 14)
			.attr('fill', 'var(--color-text-muted)')
			.text('Failed to load data');
	});

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

