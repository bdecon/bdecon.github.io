/* Sparkline widget for the homepage's "US Economic Indicators" panel.
   Driven by charts.json manifest. Call initSparkline(SPARKLINES) with an
   array of { id, btn?, label?, col?, refLine? } entries.

   For stacked/multi-series charts, specify col: 'COLUMN_NAME'.
   Example: { id: 'mag7ocf', col: 'NVDA', label: 'NVIDIA Cash Flow', btn: 'NVIDIA' }
*/
(function() {
	'use strict';
	function init(SPARKLINES) {
		/* Reference-line plugin — draws a dashed horizontal line at a fixed
		   y-value with a small label, useful for thresholds (Fed inflation
		   target, NAIRU, etc.). Configured per-chart via plugins.refline. */
		const refLinePlugin = {
			id: 'refline',
			afterDatasetsDraw(chart, args, opts) {
				if (!opts || opts.value == null) return;
				const { ctx, chartArea: { left, right }, scales: { y } } = chart;
				const yPx = y.getPixelForValue(opts.value);
				if (yPx < chart.chartArea.top || yPx > chart.chartArea.bottom) return;
				ctx.save();
				ctx.strokeStyle = 'rgba(0,0,0,0.30)';
				ctx.setLineDash([4, 4]);
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(left, yPx);
				ctx.lineTo(right, yPx);
				ctx.stroke();
				if (opts.label) {
					ctx.setLineDash([]);
					ctx.fillStyle = 'rgba(0,0,0,0.55)';
					ctx.font = '11px ' + (opts.font || 'sans-serif');
					ctx.textAlign = 'right';
					ctx.textBaseline = 'bottom';
					ctx.fillText(opts.label, right - 4, yPx - 3);
				}
				ctx.restore();
			}
		};

		const CATEGORY_ICONS = {
			'Output': 'icon-factory.svg', 'Labor': 'icon-construction.svg',
			'Prices': 'icon-house.svg', 'Monetary': 'icon-fed.svg',
			'Trade': 'icon-ship.svg', 'Government': 'icon-govt.svg',
			'Businesses': 'icon-store.svg'
		};

		// Chart strokes use -strong variants for the 4 accents that fall
		// short of WCAG 1.4.11 (3:1 graphical-component contrast) on
		// white. Blue/red/green/purple already pass and use base.
		// In dark mode -strong falls back to base via the .accent class.
		const CATEGORY_CSS_VARS = {
			'Monetary': '--color-card-blue',
			'Output': '--color-card-ltblue-strong',
			'Prices': '--color-card-red',
			'Trade': '--color-card-purple',
			'Labor': '--color-card-orange-strong',
			'Government': '--color-card-green',
			'Businesses': '--color-card-teal-strong'
		};

		let chart = null;
		const ctx = document.getElementById('sparkline-chart');
		if (!ctx) return;
		const rootStyle = getComputedStyle(document.documentElement);
		const FONT = rootStyle.getPropertyValue('--font').trim() || "'Lato', sans-serif";

		function getCategoryColor(category) {
			const v = CATEGORY_CSS_VARS[category];
			return v ? rootStyle.getPropertyValue(v).trim() || '#888' : '#888';
		}

		function parseData(text, config, sp) {
			const lines = text.trim().split('\n');
			const headers = lines[0].split(',');
			const rows = lines.slice(1).map(l => l.split(','));
			const cutoff = new Date();
			cutoff.setFullYear(cutoff.getFullYear() - 3);

			const recent = rows.filter(r => {
				const d = r[0];
				if (d.includes('Q')) {
					const [y, q] = d.split('-Q');
					return new Date(parseInt(y), (parseInt(q) - 1) * 3) >= cutoff;
				}
				return new Date(d + 'T12:00:00') >= cutoff;
			});

			// Determine which column to read
			let colIdx = 1;
			if (sp.col) {
				const idx = headers.indexOf(sp.col);
				if (idx !== -1) colIdx = idx;
			} else if (config.type === 'stackedBar' && config.stackedSeries) {
				// Default to sum of all stacked series
				return {
					labels: recent.map(r => r[0]),
					values: recent.map(r => config.stackedSeries.reduce((sum, s) => {
						const i = headers.indexOf(s.col);
						return sum + (i !== -1 ? parseFloat(r[i]) || 0 : 0);
					}, 0))
				};
			}

			return {
				labels: recent.map(r => r[0]),
				values: recent.map(r => parseFloat(r[colIdx]))
			};
		}

		function formatDate(dateStr) {
			if (dateStr.includes('Q')) return dateStr.replace('-', ' ');
			const d = new Date(dateStr + 'T12:00:00');
			return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
		}
		function formatDateCompact(dateStr) {
			if (dateStr.includes('Q')) return dateStr.replace('-', ' ');
			const d = new Date(dateStr + 'T12:00:00');
			const mon = d.toLocaleDateString('en-US', { month: 'short' });
			const yr = String(d.getFullYear()).slice(2);
			return mon + " '" + yr;
		}

		function render(sp, config) {
			fetch(config.file)
				.then(r => r.text())
				.then(text => {
					const data = parseData(text, config, sp);
					if (!data || !data.values.length) return;

					const { labels, values } = data;
					const latest = values[values.length - 1];
					const prev = values.length > 1 ? values[values.length - 2] : null;
					const delta = prev !== null ? latest - prev : null;
					const color = getCategoryColor(config.category);
					const sfx = config.valueSuffix || '';
					const pfx = config.valuePrefix || '';
					const dec = config.decimals ?? 1;

					const titleEl = document.getElementById('sparkline-title');
					titleEl.textContent = sp.label || config.title;
					titleEl.href = 'indicators.html#' + sp.id;
					document.getElementById('sparkline-value').textContent = pfx + latest.toFixed(dec) + sfx;
					document.getElementById('sparkline-period').textContent = formatDateCompact(labels[labels.length - 1]);
					/* Chart line uses indicator-specific category color; box's --accent
					   stays as accent-ltblue (set on the element class) for tab, buttons,
					   and "See all" link — separating box identity from chart hue. */
					document.getElementById('sparkline-box').style.setProperty('--chart-color', color);

					const deltaEl = document.getElementById('sparkline-delta');
					if (delta !== null && Math.abs(delta) >= Math.pow(10, -dec) / 2) {
						const arrow = delta > 0 ? '▲' : '▼';
						const sign = delta > 0 ? '+' : '−';
						deltaEl.textContent = arrow + ' ' + sign + Math.abs(delta).toFixed(dec) + sfx;
						deltaEl.dataset.dir = delta > 0 ? 'up' : 'down';
						deltaEl.style.display = '';
					} else {
						deltaEl.style.display = 'none';
					}

					const iconEl = document.getElementById('sparkline-icon');
					const iconFile = CATEGORY_ICONS[config.category];
					if (iconEl && iconFile) {
						iconEl.src = 'images/' + iconFile;
						iconEl.alt = config.category;
						iconEl.style.display = '';
					} else if (iconEl) {
						iconEl.style.display = 'none';
					}

					const min = Math.min(...values);
					const max = Math.max(...values);
					const minIdx = values.indexOf(min);
					const maxIdx = values.indexOf(max);
					/* Extend y range to include reference-line value if set, so a
					   2% target on inflation stays visible even when all values
					   are above (or below) it. */
					const refV = sp.refLine && sp.refLine.value;
					const yLo = refV != null ? Math.min(min, refV) : min;
					const yHi = refV != null ? Math.max(max, refV) : max;
					const pad = (yHi - yLo) * 0.10 || 0.5;

					const minLabel = pfx + min.toFixed(dec) + sfx + ' · ' + formatDateCompact(labels[minIdx]);
					const maxLabel = pfx + max.toFixed(dec) + sfx + ' · ' + formatDateCompact(labels[maxIdx]);
					document.getElementById('sparkline-min').textContent = minLabel;
					document.getElementById('sparkline-max').textContent = maxLabel;

					/* Markers — large color dot at latest, smaller muted dots at min/max
					   anchors. Latest is duplicated if it equals min or max (color wins). */
					const lastIdx = values.length - 1;
					const isMarker = i => i === lastIdx || i === minIdx || i === maxIdx;
					const pointRadii = values.map((_, i) => i === lastIdx ? 4.5 : (isMarker(i) ? 3 : 0));
					const muted = 'rgba(0,0,0,0.45)';
					const pointBg = values.map((_, i) => i === lastIdx ? color : (isMarker(i) ? muted : 'transparent'));
					const pointBorder = values.map((_, i) => isMarker(i) ? '#fff' : 'transparent');

					/* Position min/max DOM labels next to their points. Called after
					   the chart calculates pixel coordinates (synchronously available
					   immediately after construction; also re-run on resize). */
					const positionMinMax = () => {
						if (!chart) return;
						const meta = chart.getDatasetMeta(0).data;
						if (!meta || !meta[minIdx] || !meta[maxIdx]) return;
						const wrap = document.querySelector('.sparkline-wrap');
						const wrapW = wrap.clientWidth;
						const place = (el, idx, isMax) => {
							const pt = meta[idx];
							el.style.transform = '';
							/* Horizontal: if point is in right third, anchor by right edge;
							   if in left third, by left edge; otherwise center on point. */
							const xFrac = pt.x / wrapW;
							let left, right;
							if (xFrac > 0.66) {
								right = (wrapW - pt.x) + 'px'; left = '';
							} else if (xFrac < 0.34) {
								left = pt.x + 'px'; right = '';
							} else {
								left = pt.x + 'px'; right = '';
								el.style.transform = 'translateX(-50%)';
							}
							el.style.left = left; el.style.right = right;
							/* Vertical: max sits above its point, min sits below. */
							const offset = 8;
							if (isMax) { el.style.top = (pt.y - offset) + 'px'; el.style.transform += ' translateY(-100%)'; el.style.bottom = ''; }
							else       { el.style.top = (pt.y + offset) + 'px'; el.style.bottom = ''; }
						};
						place(document.getElementById('sparkline-max'), maxIdx, true);
						place(document.getElementById('sparkline-min'), minIdx, false);
					};

					if (chart) chart.destroy();
					chart = new Chart(ctx, {
						type: 'line',
						data: {
							labels,
							datasets: [{
								data: values,
								borderColor: color,
								borderWidth: 2.5,
								pointRadius: pointRadii,
								pointBackgroundColor: pointBg,
								pointBorderColor: pointBorder,
								pointBorderWidth: 1.5,
								pointHitRadius: 8,
								pointHoverRadius: 5,
								pointHoverBackgroundColor: color,
								tension: 0.3,
								fill: false,
								clip: false
							}]
						},
						plugins: [refLinePlugin],
						options: {
							responsive: true,
							maintainAspectRatio: false,
							layout: { padding: { left: 6, right: 16, top: 14, bottom: 14 } },
							plugins: {
								legend: { display: false },
								tooltip: {
									displayColors: false,
									bodyFont: { family: FONT, size: 12 },
									titleFont: { family: FONT, size: 11 },
									callbacks: {
										title: items => formatDate(items[0].label),
										label: item => pfx + parseFloat(item.raw).toFixed(dec) + sfx
									}
								},
								refline: sp.refLine
									? { value: sp.refLine.value, label: sp.refLine.label, font: FONT }
									: { value: null }
							},
							scales: {
								x: { display: false },
								y: { display: false, min: yLo - pad, max: yHi + pad }
							},
							animation: { duration: 300, onComplete: positionMinMax },
							onResize: positionMinMax
						}
					});
					/* Run once now in case animation is suppressed (reduced motion etc). */
					requestAnimationFrame(positionMinMax);

					/* Hide min/max labels while pointer hovers the chart so the
					   Chart.js tooltip (rendered on canvas) doesn't sit behind
					   the floating DOM labels. */
					const wrapEl = document.querySelector('.sparkline-wrap');
					if (wrapEl && !wrapEl.dataset.hoverWired) {
						wrapEl.addEventListener('mouseenter', () => wrapEl.classList.add('is-hovered'));
						wrapEl.addEventListener('mouseleave', () => wrapEl.classList.remove('is-hovered'));
						wrapEl.dataset.hoverWired = '1';
					}
				})
				.catch(() => {});
		}

		// Fetch manifest and build UI
		fetch('files/charts.json')
			.then(r => r.json())
			.then(data => {
				const manifest = Object.fromEntries(data.charts.map(c => [c.id, c]));
				const nav = document.querySelector('.sparkline-nav');
				const seeAll = nav.querySelector('a');

				const panel = document.getElementById('sparkline-panel');
				const tabs = [];

				const activate = (idx) => {
					tabs.forEach((t, j) => {
						const sel = j === idx;
						t.classList.toggle('active', sel);
						t.setAttribute('aria-selected', sel ? 'true' : 'false');
						t.tabIndex = sel ? 0 : -1;
					});
					if (panel) panel.setAttribute('aria-labelledby', 'sparkline-tab-' + idx);
					render(SPARKLINES[idx], manifest[SPARKLINES[idx].id]);
				};

				SPARKLINES.forEach((sp, i) => {
					const config = manifest[sp.id];
					if (!config) return;
					const btn = document.createElement('button');
					btn.className = 'btn' + (i === 0 ? ' active' : '');
					btn.id = 'sparkline-tab-' + i;
					btn.type = 'button';
					btn.setAttribute('role', 'tab');
					btn.setAttribute('aria-controls', 'sparkline-panel');
					btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
					btn.tabIndex = i === 0 ? 0 : -1;
					btn.dataset.sparkIdx = i;
					btn.textContent = sp.btn || sp.label || config.title;
					btn.addEventListener('click', () => activate(i));
					btn.addEventListener('keydown', (e) => {
						if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
							e.preventDefault();
							const dir = e.key === 'ArrowRight' ? 1 : -1;
							const next = (i + dir + tabs.length) % tabs.length;
							activate(next);
							tabs[next].focus();
						} else if (e.key === 'Home') {
							e.preventDefault(); activate(0); tabs[0].focus();
						} else if (e.key === 'End') {
							e.preventDefault(); activate(tabs.length - 1); tabs[tabs.length - 1].focus();
						}
					});
					nav.insertBefore(btn, seeAll);
					tabs.push(btn);
				});

				// Initial render
				const first = SPARKLINES[0];
				const firstConfig = manifest[first.id];
				if (firstConfig) render(first, firstConfig);
			});
	}

	// Expose
	window.initSparkline = init;
})();
