// Read theme colors from CSS variables
function getThemeColors() {
	const style = getComputedStyle(document.documentElement);
	const get = (name) => style.getPropertyValue(name).trim();
	return {
		grid: get('--color-grid') || 'rgba(0, 0, 0, 0.06)',
		axisText: get('--color-axis-text') || '#6a6a6a',
		tooltipBg: get('--color-tooltip-bg') || 'rgba(75, 75, 75, 0.95)',
		textDark: get('--color-text-dark') || '#333'
	};
}

// Global state
let manifest = null;
let chart = null;
let currentDateFormat = null;
let fullData = null;
let isFilteredView = false;
let currentConfig = null;
let isFlipped = false;
const csvCache = new Map();

// NBER recession periods [start, end]
const recessionPeriods = [
	['1948-11-01', '1949-10-01'],
	['1953-07-01', '1954-05-01'],
	['1957-08-01', '1958-04-01'],
	['1960-04-01', '1961-02-01'],
	['1969-12-01', '1970-11-01'],
	['1973-11-01', '1975-03-01'],
	['1980-01-01', '1980-07-01'],
	['1981-07-01', '1982-11-01'],
	['1990-07-01', '1991-03-01'],
	['2001-03-01', '2001-11-01'],
	['2007-12-01', '2009-06-01'],
	['2020-02-01', '2020-04-01']
];

// Recession shading plugin
const recessionPlugin = {
	id: 'recessionShading',
	beforeDraw: function(chart) {
		const config = chart.config._config.datasetConfig;
		if (config?.timeSeries === false) return;

		const ctx = chart.ctx;
		const xAxis = chart.scales.x;
		const yAxis = chart.scales.y;
		const labels = chart.data.labels;
		if (!labels || labels.length === 0) return;

		const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
		ctx.save();
		ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

		recessionPeriods.forEach(([start, end]) => {
			if (end < labels[0] || start > labels[labels.length - 1]) return;

			let startIdx = 0, endIdx = labels.length - 1;
			for (let i = labels.length - 1; i >= 0; i--) {
				if (labels[i] <= start) { startIdx = i; break; }
			}
			for (let i = labels.length - 1; i >= 0; i--) {
				if (labels[i] <= end) { endIdx = i; break; }
			}
			if (startIdx > endIdx) return;

			const x1 = xAxis.getPixelForValue(startIdx);
			const x2 = xAxis.getPixelForValue(endIdx);
			ctx.fillRect(x1, yAxis.top, x2 - x1, yAxis.bottom - yAxis.top);
		});

		ctx.restore();
	}
};

// Color mapping to CSS variables (rebuilt on each chart load for theme changes)
let colorMap = null;
// Mix a hex color toward white by a given ratio (0 = original, 1 = white)
function lighten(hex, ratio) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const lr = Math.round(r + (255 - r) * ratio);
	const lg = Math.round(g + (255 - g) * ratio);
	const lb = Math.round(b + (255 - b) * ratio);
	return `rgb(${lr}, ${lg}, ${lb})`;
}
function updateColorMap() {
	const style = getComputedStyle(document.documentElement);
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	const a = isDark ? 0.18 : 0.08;
	const aStrong = isDark ? 0.35 : 0.3;
	const mix = isDark ? 0.25 : 0;
	colorMap = {
		blue: {
			border: style.getPropertyValue('--color-card-blue').trim() || '#3450B2',
			line: lighten(style.getPropertyValue('--color-card-blue').trim() || '#3450B2', mix),
			background: `rgba(52, 80, 178, ${a})`,
			backgroundStrong: `rgba(52, 80, 178, ${aStrong})`
		},
		green: {
			border: style.getPropertyValue('--color-card-green').trim() || '#229a54',
			line: lighten(style.getPropertyValue('--color-card-green').trim() || '#229a54', mix),
			background: `rgba(34, 154, 84, ${a})`,
			backgroundStrong: `rgba(34, 154, 84, ${aStrong})`
		},
		red: {
			border: style.getPropertyValue('--color-card-red').trim() || '#E04040',
			line: lighten(style.getPropertyValue('--color-card-red').trim() || '#E04040', mix),
			background: `rgba(224, 64, 64, ${a})`,
			backgroundStrong: `rgba(224, 64, 64, ${aStrong})`
		},
		orange: {
			border: style.getPropertyValue('--color-card-orange').trim() || '#ca5c00',
			line: lighten(style.getPropertyValue('--color-card-orange').trim() || '#ca5c00', mix),
			background: `rgba(202, 92, 0, ${a})`,
			backgroundStrong: `rgba(202, 92, 0, ${aStrong})`
		},
		purple: {
			border: style.getPropertyValue('--color-card-purple').trim() || '#553581',
			line: lighten(style.getPropertyValue('--color-card-purple').trim() || '#553581', mix),
			background: `rgba(85, 53, 129, ${a})`,
			backgroundStrong: `rgba(85, 53, 129, ${aStrong})`
		},
		teal: {
			border: style.getPropertyValue('--color-card-teal').trim() || '#2A8A8A',
			line: lighten(style.getPropertyValue('--color-card-teal').trim() || '#2A8A8A', mix),
			background: `rgba(42, 138, 138, ${a})`,
			backgroundStrong: `rgba(42, 138, 138, ${aStrong})`
		},
		ltblue: {
			border: style.getPropertyValue('--color-card-ltblue').trim() || '#4A90C4',
			line: lighten(style.getPropertyValue('--color-card-ltblue').trim() || '#4A90C4', mix),
			background: `rgba(74, 144, 196, ${a})`,
			backgroundStrong: `rgba(74, 144, 196, ${aStrong})`
		}
	};
}
updateColorMap();

// Featured chart gets a refractor holographic effect
const FEATURED_CHART = 'cpi';

// Chart type configurations
function getChartTypeConfig(type, colors, config) {
	const baseDataset = {
		borderColor: colors.line,
		backgroundColor: colors.background,
		borderWidth: 1.5,
		pointRadius: 1,
		pointHoverRadius: 4,
		pointBackgroundColor: colors.line,
		pointHoverBackgroundColor: colors.line
	};

	switch (type) {
		case 'line':
			return {
				type: 'line',
				dataset: {
					...baseDataset,
					fill: config.fill !== false,
					tension: 0.1
				}
			};
		case 'area':
			return {
				type: 'line',
				dataset: {
					...baseDataset,
					fill: true,
					tension: 0.1,
					backgroundColor: colors.backgroundStrong
				}
			};
		case 'bar':
			return {
				type: 'bar',
				dataset: {
					backgroundColor: colors.line,
					borderColor: colors.line,
					borderWidth: 0,
					categoryPercentage: 0.7,
					barPercentage: 0.85
				}
			};
		case 'scatter':
			return {
				type: 'scatter',
				dataset: {
					backgroundColor: colors.line,
					borderColor: colors.line,
					pointRadius: 3,
					pointHoverRadius: 5
				}
			};
		default:
			return {
				type: 'line',
				dataset: baseDataset
			};
	}
}

// Date formatting based on frequency
function getDateFormatConfig(dateFormat) {
	switch (dateFormat) {
		case 'monthly':
			return {
				tickCallback: function(value, index) {
					const dateStr = this.getLabelForValue(value);
					return dateStr ? dateStr.substring(0, 4) : '';
				},
				tooltipTitle: function(context) {
					const date = new Date(context[0].label);
					const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
						'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					return months[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
				},
				lastValueFormat: function(date) {
					const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
						'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					return [months[date.getUTCMonth()], date.getUTCFullYear()];
				}
			};
		case 'annual':
			return {
				tickCallback: function(value, index) {
					const dateStr = this.getLabelForValue(index);
					return dateStr.substring(0, 4);
				},
				tooltipTitle: function(context) {
					const date = new Date(context[0].label);
					return date.getUTCFullYear().toString();
				},
				lastValueFormat: function(date) {
					return [date.getUTCFullYear()];
				}
			};
		case 'daily':
			return {
				tickCallback: function(value, index) {
					if (index % 30 === 0) {
						const dateStr = this.getLabelForValue(index);
						return dateStr.substring(0, 7);
					}
					return '';
				},
				tooltipTitle: function(context) {
					return context[0].label;
				},
				lastValueFormat: function(date) {
					return [date.toISOString().substring(0, 10)];
				}
			};
		case 'quarterly':
		default:
			return {
				tickCallback: function(value, index) {
					const dateStr = this.getLabelForValue(value);
					return dateStr ? dateStr.substring(0, 4) : '';
				},
				tooltipTitle: function(context) {
					const date = new Date(context[0].label);
					const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
					return 'Q' + quarter + ' ' + date.getUTCFullYear();
				},
				lastValueFormat: function(date) {
					const quarter = 'Q' + Math.ceil((date.getUTCMonth() + 1) / 3);
					return [quarter, date.getUTCFullYear()];
				}
			};
	}
}

// Custom plugin to draw last value label
const lastValuePlugin = {
	id: 'lastValueLabel',
	afterDraw: function(chart) {
		if (window.innerWidth <= 760) return;
		const config = chart.config._config.datasetConfig;
		const isMultiSeries = config?.series && config.series.length > 1;
		const decimals = config?.decimals ?? 2;
		const prefix = config?.valuePrefix || '';
		const suffix = config?.valueSuffix || '';
		const ctx = chart.ctx;

		// For multi-series, position labels at actual y-positions (or stack if overlapping)
		if (isMultiSeries) {
			const visibleDatasets = chart.data.datasets
				.map((ds, i) => ({ ds, i }))
				.filter(({ i }) => chart.isDatasetVisible(i));

			if (visibleDatasets.length === 0) return;

			// Find each dataset's last valid (non-NaN) data point
			const labelData = visibleDatasets.map(({ ds, i }) => {
				let lastIdx = ds.data.length - 1;
				while (lastIdx >= 0 && (ds.data[lastIdx] == null || isNaN(ds.data[lastIdx]))) {
					lastIdx--;
				}
				if (lastIdx < 0) return null;

				const meta = chart.getDatasetMeta(i);
				const lastPoint = meta.data[lastIdx];
				if (!lastPoint) return null;

				const lastDate = new Date(chart.data.labels[lastIdx]);
				const dateLabels = currentDateFormat
					? currentDateFormat.lastValueFormat(lastDate)
					: ['Q' + Math.ceil((lastDate.getUTCMonth() + 1) / 3), lastDate.getUTCFullYear()];

				return {
					ds, i, lastIdx,
					value: ds.data[lastIdx],
					xPos: lastPoint.x,
					yPos: lastPoint.y,
					dateLabels
				};
			}).filter(Boolean);

			if (labelData.length === 0) return;

			const allSameEnd = labelData.every(d => d.lastIdx === labelData[0].lastIdx);

			ctx.save();
			ctx.font = '10px Tahoma, Verdana, sans-serif';
			ctx.textAlign = 'left';

			if (allSameEnd && labelData.length > 1) {
				// Multiple series share the same end date — one shared date label
				const x = labelData[0].xPos + 8;

				// Check for overlap (labels within 25px of each other)
				const sortedByY = [...labelData].sort((a, b) => a.yPos - b.yPos);
				const hasOverlap = sortedByY.some((item, idx) =>
						idx > 0 && Math.abs(item.yPos - sortedByY[idx-1].yPos) < 25
					);

				if (hasOverlap) {
					// Stack labels at top when lines are close together
					ctx.textBaseline = 'top';
					let y = 12;

					ctx.fillStyle = getThemeColors().axisText;
					labelData[0].dateLabels.forEach((label) => {
						ctx.fillText(label, x, y);
						y += 11;
					});

					const sortedByValue = [...labelData].sort((a, b) => b.value - a.value);
					sortedByValue.forEach(({ ds, value }) => {
						const valueStr = prefix + value.toFixed(decimals) + suffix;
						ctx.fillStyle = ds.borderColor;
						ctx.fillText(valueStr, x, y);
						y += 11;
					});
				} else {
					// Position labels at actual y-positions when lines are far apart
					ctx.textBaseline = 'middle';

					ctx.fillStyle = getThemeColors().axisText;
					let dateY = 12;
					labelData[0].dateLabels.forEach((label) => {
						ctx.fillText(label, x, dateY);
						dateY += 11;
					});

					const dateAreaBottom = 12 + (labelData[0].dateLabels.length * 11) + 3;
					labelData.forEach(({ ds, value, yPos }) => {
						const valueStr = prefix + value.toFixed(decimals) + suffix;
						ctx.fillStyle = ds.borderColor;
						const adjustedY = yPos < dateAreaBottom ? dateAreaBottom : yPos;
						ctx.fillText(valueStr, x, adjustedY);
					});
				}
			} else {
				// Series end at different dates — each gets its own date+value label
				ctx.textBaseline = 'top';

				labelData.forEach(item => {
					const x = item.xPos + 8;
					const blockHeight = (item.dateLabels.length + 1) * 11;
					let startY = item.yPos - blockHeight / 2;
					if (startY < 4) startY = 4;

					let y = startY;
					ctx.fillStyle = getThemeColors().axisText;
					item.dateLabels.forEach(label => {
						ctx.fillText(label, x, y);
						y += 11;
					});

					const valueStr = prefix + item.value.toFixed(decimals) + suffix;
					ctx.fillStyle = item.ds.borderColor;
					ctx.fillText(valueStr, x, y);
				});
			}

			ctx.restore();
		} else {
			// Single series - original behavior
			const dataset = chart.data.datasets[0];
			const meta = chart.getDatasetMeta(0);
			const lastIndex = dataset.data.length - 1;
			const lastPoint = meta.data[lastIndex];

			if (!lastPoint) return;

			const x = lastPoint.x + 8;
			const y = lastPoint.y;

			const lastDate = new Date(chart.data.labels[lastIndex]);
			const valueStr = prefix + dataset.data[lastIndex].toFixed(decimals) + suffix;

			const dateLabels = currentDateFormat
				? currentDateFormat.lastValueFormat(lastDate)
				: ['Q' + Math.ceil((lastDate.getUTCMonth() + 1) / 3), lastDate.getUTCFullYear()];

			ctx.save();
			ctx.font = '10px Tahoma, Verdana, sans-serif';
			ctx.fillStyle = getThemeColors().axisText;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';

			dateLabels.forEach((label, i) => {
				ctx.fillText(label, x, y - 12 + (i * 12));
			});
			ctx.fillStyle = getThemeColors().textDark;
			ctx.fillText(valueStr, x, y + (dateLabels.length - 1) * 12);

			ctx.restore();
		}
	}
};

// Custom plugin to draw data labels above bars
const dataLabelsPlugin = {
	id: 'dataLabels',
	afterDatasetsDraw: function(chart) {
		const config = chart.config._config.datasetConfig;
		if (!config?.showDataLabels) return;

		const ctx = chart.ctx;
		const meta = chart.getDatasetMeta(0);
		const decimals = config.decimals ?? 0;

		ctx.save();
		ctx.font = '12px Tahoma, Verdana, sans-serif';
		ctx.fillStyle = getThemeColors().textDark;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';

		meta.data.forEach((bar, index) => {
			const value = chart.data.datasets[0].data[index];
			ctx.fillText(value.toFixed(decimals), bar.x, bar.y - 4);
		});

		ctx.restore();
	}
};

// Render horizontal bar chart with latest + previous period bars
function renderDualBarChart(config, data, latestLabel, prevLabel) {
	const allVals = data.flatMap(d => [d.value, d.previous].filter(v => v != null));
	const maxVal = Math.max(...allVals.map(v => Math.abs(v)));
	const maxNeg = Math.max(...allVals.filter(v => v < 0).map(v => Math.abs(v)), 0);

	// Labels on left (labelPct%), bars on right (barPct%)
	// Within bar zone, zero line offset by negative share
	const labelPct = 32;
	const barPct = 100 - labelPct;
	const negShare = maxNeg > 0 ? Math.max(maxNeg / (maxVal + maxNeg), 0.15) : 0;
	const zeroInBar = negShare * 100; // % within bar zone

	function renderBar(val, fillClass) {
		if (val == null) return '';
		const pct = val >= 0
			? (Math.abs(val) / maxVal) * (100 - zeroInBar)
			: (Math.abs(val) / maxNeg) * zeroInBar;
		const valStr = val.toFixed(2);
		if (val >= 0) {
			return `<div class="hbar-row">
				<div class="hbar-left" style="width: ${zeroInBar}%;"></div>
				<div class="hbar-right" style="width: ${100 - zeroInBar}%;"><div class="${fillClass}" style="width: ${pct}%;"></div><span class="hbar-bar-label">${valStr}</span></div>
			</div>`;
		} else {
			return `<div class="hbar-row">
				<div class="hbar-left" style="width: ${zeroInBar}%;"><span class="hbar-bar-label">${valStr}</span><div class="${fillClass}" style="width: ${pct}%;"></div></div>
				<div class="hbar-right" style="width: ${100 - zeroInBar}%;"></div>
			</div>`;
		}
	}

	const groups = data.map(d => {
		const tipText = `${d.name}: ${d.value.toFixed(2)} (${latestLabel})` +
			(d.previous != null ? `, ${d.previous.toFixed(2)} (${prevLabel})` : '');
		return `<div class="hbar-group">
			<div class="hbar-row-label" style="width: ${labelPct}%; text-align: right; padding-right: 6px;">${d.name}</div>
			<div class="hbar-bars" style="width: ${barPct}%;">
				${renderBar(d.value, 'hbar-fill')}
				${renderBar(d.previous, 'hbar-fill-prev')}
			</div>
			<div class="hbar-group-tooltip">${tipText}</div>
		</div>`;
	}).join('');

	const legend = `<div class="hbar-legend">
		<div class="hbar-legend-item"><div class="hbar-legend-swatch" style="background: var(--color-card-red);"></div>${latestLabel || 'Latest'}</div>
		<div class="hbar-legend-item"><div class="hbar-legend-swatch" style="background: #d8dce0; border: 1px solid #b0b8c0; box-sizing: border-box;"></div>${prevLabel || 'Previous'}</div>
	</div>`;

	const zeroLinePos = labelPct + negShare * barPct;

	return `<div class="hbar-chart-container">
		${legend}
		<div class="hbar-rows-container">
			<div class="hbar-zero-line" style="left: ${zeroLinePos}%;"></div>
			${groups}
		</div>
	</div>`;
}

// Show error message
function showError(message) {
	document.getElementById('chart-title').textContent = 'Error';
	document.getElementById('chart-subtitle').textContent = message;
	document.getElementById('chart-source').textContent = '';
	if (chart) {
		chart.destroy();
		chart = null;
	}
}

// Filter data to last N years
function filterToLastYears(data, years) {
	const cutoffDate = new Date();
	cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
	return data.filter(d => new Date(d.date) >= cutoffDate);
}

// Tick callback for filtered view (shows month/quarter + year)
function getFilteredTickCallback(dateFormat) {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	return function(value, index) {
		const dateStr = this.getLabelForValue(value);
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const month = date.getUTCMonth();
		const year = date.getUTCFullYear();

		if (dateFormat === 'monthly') {
			return months[month] + ' ' + year;
		} else if (dateFormat === 'quarterly') {
			const quarter = Math.floor(month / 3) + 1;
			return 'Q' + quarter + ' ' + year;
		} else if (dateFormat === 'annual') {
			return year.toString();
		} else {
			return months[month] + ' ' + year;
		}
	};
}

// Toggle between full data and last 3 years
function toggleTimeRange() {
	if (!chart || !fullData) return;

	const filterLink = document.getElementById('chart-filter').querySelector('button');
	const dateFormat = currentConfig?.dateFormat || 'quarterly';
	const isMultiSeries = currentConfig?.series && currentConfig.series.length > 1;

	if (isFilteredView) {
		// Show all data
		chart.data.labels = fullData.map(d => d.date);
		if (isMultiSeries) {
			chart.data.datasets.forEach((ds, i) => {
				ds.data = fullData.map(d => d.values[i]);
			});
		} else {
			chart.data.datasets[0].data = fullData.map(d => d.value);
		}
		chart.options.scales.x.ticks.callback = currentDateFormat.tickCallback;
		filterLink.textContent = 'Recent 3 years';
		isFilteredView = false;
		chart.options.scales.y.suggestedMin = undefined;
		chart.options.scales.y.suggestedMax = undefined;
	} else {
		// Filter to last 3 years
		const filtered = filterToLastYears(fullData, 3);
		chart.data.labels = filtered.map(d => d.date);
		if (isMultiSeries) {
			chart.data.datasets.forEach((ds, i) => {
				ds.data = filtered.map(d => d.values[i]);
			});
		} else {
			chart.data.datasets[0].data = filtered.map(d => d.value);
		}
		chart.options.scales.x.ticks.callback = getFilteredTickCallback(dateFormat);
		filterLink.textContent = 'Full history';
		isFilteredView = true;
		if (currentConfig.filteredYRef != null) {
			chart.options.scales.y.suggestedMin = currentConfig.filteredYRef;
			chart.options.scales.y.suggestedMax = currentConfig.filteredYRef;
		}
	}

	chart.update();
}

// Render legend for multi-series charts
function renderLegend(config) {
	const legendContainer = document.getElementById('chart-legend');

	if (!config.series || config.series.length <= 1) {
		legendContainer.innerHTML = '';
		legendContainer.style.display = 'none';
		return;
	}

	legendContainer.style.display = 'flex';
	legendContainer.innerHTML = config.series.map((s, i) => {
		const colors = colorMap[s.color || config.color || 'blue'];
		return `
			<div class="chart-legend-item" data-index="${i}">
				<span class="chart-legend-box" style="background-color: ${colors.line}"></span>
				<span>${s.label}</span>
			</div>
		`;
	}).join('');

	// Add click handlers
	legendContainer.querySelectorAll('.chart-legend-item').forEach(item => {
		item.addEventListener('click', () => {
			const index = parseInt(item.dataset.index);
			const isVisible = chart.isDatasetVisible(index);
			chart.setDatasetVisibility(index, !isVisible);
			item.classList.toggle('hidden', isVisible);
			chart.update();
		});
	});
}

// Flip card functions
function flipCard() {
	const wrapper = document.querySelector('.chart-flip-wrapper');
	wrapper.classList.toggle('flipped');
	isFlipped = !isFlipped;
	document.querySelector('.chart-flip-front').setAttribute('aria-hidden', isFlipped);
	document.querySelector('.chart-flip-back').setAttribute('aria-hidden', !isFlipped);
}

function resetFlip() {
	const wrapper = document.querySelector('.chart-flip-wrapper');
	wrapper.classList.remove('flipped');
	isFlipped = false;
}

function updateBackFace(config, data, latestDate, prevDate) {
	// Title and source
	document.getElementById('chart-title-back').textContent = config.title;
	document.getElementById('chart-source-back').textContent = 'Source: ' + config.source;

	// Header color
	const backHeader = document.querySelector('.chart-flip-back .chart-header');
	const isMultiSeries = config.series && config.series.length > 1;
	const colorKey = isMultiSeries
		? (config.series[0].color || 'blue')
		: (config.color || 'blue');
	const headerColor = colorMap[colorKey];
	backHeader.style.backgroundColor = headerColor.border;
	const isDarkText = colorKey === 'yellow';
	backHeader.style.color = isDarkText ? '#222' : 'white';
	backHeader.classList.toggle('dark-text', isDarkText);

	// Category badge (back and front)
	const categoryEl = document.getElementById('card-category');
	const categoryFrontEl = document.getElementById('card-category-front');
	if (config.category) {
		categoryEl.textContent = config.category;
		categoryEl.style.display = '';
		categoryFrontEl.textContent = config.category;
		categoryFrontEl.style.display = '';
	} else {
		categoryEl.style.display = 'none';
		categoryFrontEl.style.display = 'none';
	}

	// Card number
	const cardIndex = manifest.charts.indexOf(config) + 1;
	const cardTotal = manifest.charts.length;
	document.getElementById('card-number').textContent = `#${cardIndex} / ${cardTotal}`;

	// Featured badge
	document.getElementById('featured-badge').classList.toggle('active', config.id === FEATURED_CHART);

	// Description
	const descEl = document.getElementById('chart-description');
	if (config.description) {
		descEl.textContent = config.description;
		descEl.style.display = '';
	} else {
		descEl.style.display = 'none';
	}

	// Subtitle (units / scale info)
	const subtitleBackEl = document.getElementById('chart-subtitle-back');
	if (config.subtitle) {
		subtitleBackEl.innerHTML = config.subtitle;
		subtitleBackEl.style.display = '';
	} else {
		subtitleBackEl.style.display = 'none';
	}

	// Stats table
	const latestEl = document.getElementById('chart-latest');
	latestEl.innerHTML = generateStatsTable(config, data, latestDate, prevDate);

	// Show/hide info icon
	const infoBtn = document.getElementById('chart-info');
	infoBtn.style.display = config.description ? '' : 'none';
}

function generateStatsTable(config, data, latestDate, prevDate) {
	const decimals = config.decimals ?? 2;
	const prefix = config.valuePrefix || '';
	const suffix = config.valueSuffix || '';
	const isMultiSeries = config.series && config.series.length > 1;
	const formatVal = (v) => prefix + v.toFixed(decimals) + suffix;

	if (config.type === 'dualBar') {
		// Table of all categories with period-labeled columns
		if (!data || data.length === 0) return '';
		let latestLabel = 'Latest';
		let prevLabel = 'Previous';
		if (latestDate) {
			const dateFmt = getDateFormatConfig(config.latestDateFormat || 'monthly');
			latestLabel = dateFmt.lastValueFormat(new Date(latestDate)).join(' ');
		}
		if (prevDate) {
			const dateFmt = getDateFormatConfig(config.latestDateFormat || 'monthly');
			prevLabel = dateFmt.lastValueFormat(new Date(prevDate)).join(' ');
		}
		let html = `<table class="card-stats-table"><thead><tr><th>Category</th><th>${latestLabel}</th><th>${prevLabel}</th></tr></thead><tbody>`;
		data.forEach(d => {
			html += `<tr><td>${d.name}</td><td>${formatVal(d.value)}</td>`;
			html += `<td>${d.previous != null ? formatVal(d.previous) : '\u2014'}</td></tr>`;
		});
		html += '</tbody></table>';
		return html;
	}

	if (config.timeSeries === false) {
		// Non-time-series bar: table of all entries
		if (!data || data.length === 0) return '';
		let html = '<table class="card-stats-table"><tbody>';
		data.forEach(d => {
			const name = d.date || d.name;
			const isUSA = /^(United States|USA|US)$/i.test(name);
			const cls = isUSA ? ' class="stat-highlight"' : '';
			html += `<tr><td${cls}>${name}</td><td${cls}>${formatVal(d.value)}</td></tr>`;
		});
		html += '</tbody></table>';
		return html;
	}

	// Time series - multi-series
	if (isMultiSeries) {
		// Anchor on the last row where all series have data
		let last = data[data.length - 1];
		for (let ri = data.length - 1; ri >= 0; ri--) {
			if (data[ri].values.every(v => v != null && !isNaN(v))) {
				last = data[ri];
				break;
			}
		}
		const lastDate = new Date(last.date);
		const dateFormat = getDateFormatConfig(config.dateFormat || 'quarterly');

		function findClosestMulti(targetDate) {
			let closest = null;
			let minDiff = Infinity;
			for (const entry of data) {
				const diff = Math.abs(new Date(entry.date) - targetDate);
				if (diff < minDiff) {
					minDiff = diff;
					closest = entry;
				}
			}
			return closest && minDiff < 45 * 24 * 60 * 60 * 1000 ? closest : null;
		}

		const rows = [];
		for (let yr = 6; yr >= 0; yr--) {
			const target = new Date(lastDate);
			target.setFullYear(target.getFullYear() - yr);
			const entry = yr === 0 ? last : findClosestMulti(target);
			if (entry) rows.push({ entry, isLatest: yr === 0 });
		}

		let html = '<table class="card-stats-table"><thead><tr><th>Period</th>';
		config.series.forEach(s => { html += `<th>${s.label}</th>`; });
		html += '</tr></thead><tbody>';
		rows.forEach(({ entry, isLatest }) => {
			const d = new Date(entry.date);
			const label = dateFormat.lastValueFormat(d).join(' ');
			const b = isLatest ? '<strong>' : '';
			const bc = isLatest ? '</strong>' : '';
			html += `<tr><td>${b}${label}${bc}</td>`;
			config.series.forEach((s, i) => {
				const v = entry.values[i] != null && !isNaN(entry.values[i]) ? formatVal(entry.values[i]) : '\u2014';
				html += `<td>${b}${v}${bc}</td>`;
			});
			html += '</tr>';
		});
		html += '</tbody></table>';
		return html;
	}

	// Time series - single series: 5 consecutive years
	const last = data[data.length - 1];
	const lastDate = new Date(last.date);
	const dateFormat = getDateFormatConfig(config.dateFormat || 'quarterly');

	function findClosest(targetDate) {
		let closest = null;
		let minDiff = Infinity;
		for (const entry of data) {
			const diff = Math.abs(new Date(entry.date) - targetDate);
			if (diff < minDiff) {
				minDiff = diff;
				closest = entry;
			}
		}
		// Only use if within 45 days of target
		return closest && minDiff < 45 * 24 * 60 * 60 * 1000 ? closest : null;
	}

	// Build rows for latest + 6 prior years, chronological order
	const rows = [];
	for (let yr = 6; yr >= 0; yr--) {
		const target = new Date(lastDate);
		target.setFullYear(target.getFullYear() - yr);
		const entry = yr === 0 ? last : findClosest(target);
		if (entry) rows.push({ entry, isLatest: yr === 0 });
	}

	const hasComponents = config.components && rows.some(r => r.entry.components);

	if (hasComponents) {
		// Table with component columns instead of change
		const comps = config.components;
		let html = '<table class="card-stats-table"><thead><tr><th>Period</th><th>' +
			(config.tooltipLabel || 'Value');
		comps.forEach(c => { html += `</th><th>${c.label}`; });
		html += '</th></tr></thead><tbody>';
		rows.forEach(({ entry, isLatest }) => {
			const d = new Date(entry.date);
			const label = dateFormat.lastValueFormat(d).join(' ');
			const b = isLatest ? '<strong>' : '';
			const bc = isLatest ? '</strong>' : '';
			html += `<tr><td>${b}${label}${bc}</td><td>${b}${formatVal(entry.value)}${bc}</td>`;
			comps.forEach((c, ci) => {
				const cv = entry.components && entry.components[ci] != null
					? (c.prefix || '') + entry.components[ci].toFixed(c.decimals ?? 1) + (c.suffix || '')
					: '\u2014';
				html += `<td>${b}${cv}${bc}</td>`;
			});
			html += '</tr>';
		});
		html += '</tbody></table>';
		return html;
	}

	// Standard table with year-over-year change
	const pctChange = config.changeType === 'percent';
	const formatChange = (curr, prev) => {
		if (pctChange) {
			const pct = ((curr - prev) / Math.abs(prev)) * 100;
			const sign = pct >= 0 ? '+' : '';
			return sign + pct.toFixed(1) + '%';
		}
		const diff = curr - prev;
		const sign = diff >= 0 ? '+' : '';
		return sign + diff.toFixed(decimals);
	};

	const chgHeader = pctChange ? 'Chg %' : 'Chg';
	let html = `<table class="card-stats-table"><thead><tr><th>Period</th><th>Value</th><th>${chgHeader}</th></tr></thead><tbody>`;
	rows.forEach(({ entry, isLatest }, i) => {
		const d = new Date(entry.date);
		const label = dateFormat.lastValueFormat(d).join(' ');
		const change = i === 0 ? '\u2014' : formatChange(entry.value, rows[i - 1].entry.value);
		const b = isLatest ? '<strong>' : '';
		const bc = isLatest ? '</strong>' : '';
		html += `<tr><td>${b}${label}${bc}</td><td>${b}${formatVal(entry.value)}${bc}</td><td>${b}${change}${bc}</td></tr>`;
	});
	html += '</tbody></table>';
	return html;
}

// Populate hidden dropdown (for prev/next navigation) and visible grid menu
function populateDropdown() {
	const select = document.getElementById('dataset-select');
	select.innerHTML = '';

	const charts = manifest.charts;

	// Populate hidden select for prev/next
	charts.forEach(ds => {
		const option = document.createElement('option');
		option.value = ds.id;
		option.textContent = ds.title;
		select.appendChild(option);
	});

	// Populate grid menu
	const grid = document.getElementById('chart-grid-menu');
	if (!grid) return;
	grid.innerHTML = '';

	const groups = new Map();
	charts.forEach(ds => {
		const cat = ds.category || 'Other';
		if (!groups.has(cat)) groups.set(cat, []);
		groups.get(cat).push(ds);
	});

	groups.forEach((items, category) => {
		const header = document.createElement('div');
		header.className = 'chart-grid-category';
		header.textContent = category;
		grid.appendChild(header);

		items.forEach(ds => {
			const link = document.createElement('a');
			link.className = 'chart-grid-item';
			link.textContent = ds.title;
			link.dataset.id = ds.id;
			link.href = '#' + ds.id;
			link.addEventListener('click', function(e) {
				e.preventDefault();
				select.value = ds.id;
				loadChart(ds.id);
				document.getElementById('chart-grid-details').removeAttribute('open');
			});
			grid.appendChild(link);
		});
	});
}

// Update the selector title and grid active state
function updateSelectorTitle(datasetId) {
	const config = manifest.charts.find(d => d.id === datasetId);
	if (!config) return;
	document.getElementById('chart-selector-title').textContent = config.title;

	// Update grid active state
	document.querySelectorAll('.chart-grid-item').forEach(el => {
		el.classList.toggle('active', el.dataset.id === datasetId);
	});
}

// Load and display chart for given dataset
async function loadChart(datasetId) {
	updateColorMap();
	resetFlip();

	const config = manifest.charts.find(d => d.id === datasetId);
	if (!config) {
		showError('Dataset not found: ' + datasetId);
		return;
	}

	// Update URL hash for sharing
	window.history.replaceState(null, '', '#' + datasetId);

	// Fade out chart body and show loading
	const chartBody = document.querySelector('.chart-flip-front .chart-body');
	const loadingEl = document.getElementById('chart-loading');
	chartBody.classList.add('fading');
	loadingEl.classList.add('active');

	// Update DOM elements
	updateSelectorTitle(datasetId);
	document.getElementById('chart-title').textContent = config.title;
	document.getElementById('chart-subtitle').innerHTML = config.subtitle || '';
	document.getElementById('chart-source').textContent = 'Source: ' + config.source;
	document.getElementById('chart-download').href = config.file;

	// Update header color (use first series color for multi-series)
	const header = document.querySelector('.chart-flip-front .chart-header');
	const isMultiSeries = config.series && config.series.length > 1;
	const colorKey = isMultiSeries
		? (config.series[0].color || 'blue')
		: (config.color || 'blue');
	const headerColor = colorMap[colorKey];
	header.style.backgroundColor = headerColor.border;
	// Set CSS custom property for gradient fade
	document.querySelector('.chart-flip-wrapper').style.setProperty('--chart-color', headerColor.border);
	// Use dark text for low-contrast backgrounds (yellow)
	const isDarkText = colorKey === 'yellow';
	header.style.color = isDarkText ? '#222' : 'white';
	header.classList.toggle('dark-text', isDarkText);

	// Toggle refractor effect for featured chart
	const isFeatured = datasetId === FEATURED_CHART;
	header.classList.toggle('refractor', isFeatured);
	document.querySelector('.chart-flip-front .chart-container').classList.toggle('refractor-card', isFeatured);

	try {
		// Use cached CSV if available
		let csv;
		if (csvCache.has(config.file)) {
			csv = csvCache.get(config.file);
		} else {
			const response = await fetch(config.file);
			if (!response.ok) {
				throw new Error('Failed to load ' + config.file);
			}
			csv = await response.text();
			csvCache.set(config.file, csv);
		}

		// Parse CSV - handle multi-series differently
		const lines = csv.trim().split('\n');
		let data;
		if (isMultiSeries) {
			data = lines.slice(1).map(line => {
				const parts = line.split(',');
				return {
					date: parts[0],
					values: parts.slice(1).map(v => parseFloat(v))
				};
			});
		} else {
			data = lines.slice(1).map(line => {
				const parts = line.split(',');
				const entry = { date: parts[0], value: parseFloat(parts[1]) };
				if (parts.length > 2) {
					entry.components = parts.slice(2).map(v => parseFloat(v));
				}
				return entry;
			});
		}

		// Store full data for filtering and reset view state
		fullData = data;
		isFilteredView = false;
		currentConfig = config;

		// Show/hide filter link (only for time series charts)
		const filterEl = document.getElementById('chart-filter');
		if (config.timeSeries !== false) {
			filterEl.style.visibility = 'visible';
			filterEl.querySelector('button').textContent = 'Recent 3 years';
		} else {
			filterEl.style.visibility = 'hidden';
		}

		// Destroy existing chart
		if (chart) {
			chart.destroy();
			chart = null;
		}

		// Toggle vertical card orientation for bar-only charts
		const wrapper = document.querySelector('.chart-flip-wrapper');
		if (config.type === 'dualBar') {
			wrapper.classList.add('card-vertical');
		} else {
			wrapper.classList.remove('card-vertical');
		}

		// Handle dual bar chart type
		if (config.type === 'dualBar') {
			const dualData = lines.slice(1).map(line => {
				const parts = line.split(',');
				return { name: parts[0], value: parseFloat(parts[1]), previous: parts[2] ? parseFloat(parts[2]) : null };
			});

			// Fetch latest and previous dates from a related time series if configured
			let latestDate = null;
			let prevDate = null;
			if (config.latestDateSource) {
				try {
					let dateCsv;
					if (csvCache.has(config.latestDateSource)) {
						dateCsv = csvCache.get(config.latestDateSource);
					} else {
						const dateResp = await fetch(config.latestDateSource);
						if (dateResp.ok) {
							dateCsv = await dateResp.text();
							csvCache.set(config.latestDateSource, dateCsv);
						}
					}
					if (dateCsv) {
						const dateLines = dateCsv.trim().split('\n');
						latestDate = dateLines[dateLines.length - 1].split(',')[0];
						if (dateLines.length > 2) {
							prevDate = dateLines[dateLines.length - 2].split(',')[0];
						}
					}
				} catch (e) {
					console.warn('Could not fetch latest date:', e);
				}
			}

			// Hide canvas, show custom chart
			document.getElementById('lineChart').style.display = 'none';
			document.getElementById('chart-legend').style.display = 'none';
			let customContainer = document.getElementById('custom-chart');
			if (!customContainer) {
				customContainer = document.createElement('div');
				customContainer.id = 'custom-chart';
				document.querySelector('.chart-flip-front .chart-body').appendChild(customContainer);
			}
			customContainer.style.display = 'block';
			const dateFmt2 = getDateFormatConfig(config.latestDateFormat || 'monthly');
			const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June',
				'July', 'August', 'September', 'October', 'November', 'December'];
			const useFullMonth = window.innerWidth > 760;
			let latestLabel = 'Latest';
			let prevLabel = 'Previous';
			if (latestDate) {
				const d = new Date(latestDate);
				latestLabel = useFullMonth
					? fullMonths[d.getUTCMonth()] + ' ' + d.getUTCFullYear()
					: dateFmt2.lastValueFormat(d).join(' ');
			}
			if (prevDate) {
				const d = new Date(prevDate);
				prevLabel = useFullMonth
					? fullMonths[d.getUTCMonth()] + ' ' + d.getUTCFullYear()
					: dateFmt2.lastValueFormat(d).join(' ');
			}
			customContainer.innerHTML = renderDualBarChart(config, dualData, latestLabel, prevLabel);
			document.getElementById('chart-latest-mobile').classList.remove('active');
			updateBackFace(config, dualData, latestDate, prevDate);
			chartBody.classList.remove('fading');
			loadingEl.classList.remove('active');
			return;
		}

		// Show canvas for regular charts, hide custom container
		document.getElementById('lineChart').style.display = 'block';
		const customContainer = document.getElementById('custom-chart');
		if (customContainer) {
			customContainer.style.display = 'none';
		}

		// Get configurations
		currentDateFormat = getDateFormatConfig(config.dateFormat || 'quarterly');
		const ctx = document.getElementById('lineChart').getContext('2d');

		// Build datasets based on single vs multi-series
		let datasets;
		let chartType = config.type || 'line';
		if (isMultiSeries) {
			datasets = config.series.map((s, i) => {
				const seriesColors = colorMap[s.color || config.color || 'blue'];
				return {
					label: s.label,
					data: data.map(d => d.values[i]),
					borderColor: seriesColors.line,
					backgroundColor: seriesColors.background,
					pointBackgroundColor: seriesColors.line,
					pointHoverBackgroundColor: seriesColors.line,
					borderWidth: 1.5,
					pointRadius: 1,
					pointHoverRadius: 4,
					fill: false,
					tension: 0.1,
					spanGaps: true
				};
			});
		} else {
			const colors = colorMap[config.color || 'blue'];
			const typeConfig = getChartTypeConfig(config.type || 'line', colors, config);
			chartType = typeConfig.type;
			datasets = [{
				label: config.tooltipLabel || config.title,
				data: data.map(d => d.value),
				...typeConfig.dataset
			}];
		}

		const tc = getThemeColors();
		chart = new Chart(ctx, {
			type: chartType,
			datasetConfig: config,
			data: {
				labels: data.map(d => d.date),
				datasets: datasets
			},
			plugins: [
				...(config.timeSeries !== false ? [lastValuePlugin, recessionPlugin] : []),
				...(config.showDataLabels ? [dataLabelsPlugin] : [])
			],
			options: {
				responsive: true,
				maintainAspectRatio: true,
				layout: {
					padding: {
						right: config.timeSeries !== false ? (window.innerWidth <= 760 ? 5 : 50) : (window.innerWidth <= 760 ? 0 : 4),
						left: window.innerWidth <= 760 ? 0 : 4,
						top: config.timeSeries !== false ? (window.innerWidth <= 760 ? 5 : (config.series ? 8 : 15)) : (window.innerWidth <= 760 ? 4 : 20)
					}
				},
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins: {
					tooltip: {
						enabled: true,
						backgroundColor: tc.tooltipBg,
						titleFont: { size: 12, family: "system-ui, sans-serif" },
						bodyFont: { size: 11, family: "Tahoma, Verdana, sans-serif" },
						padding: 8,
						cornerRadius: 2,
						displayColors: isMultiSeries,
						callbacks: {
							title: config.timeSeries !== false
								? currentDateFormat.tooltipTitle
								: function(context) { return context[0].label; },
							label: function(context) {
								if (context.parsed.y == null || isNaN(context.parsed.y)) return null;
								const decimals = config.decimals ?? 2;
								const prefix = config.valuePrefix || '';
								const suffix = config.valueSuffix || '';
								const formattedValue = prefix + context.parsed.y.toFixed(decimals) + suffix;
								if (isMultiSeries) {
									return context.dataset.label + ': ' + formattedValue;
								}
								const label = config.tooltipLabel || config.title;
								const lines = [label + ': ' + formattedValue];
								if (config.components && fullData) {
									const dateLabel = chart.data.labels[context.dataIndex];
									const entry = fullData.find(d => d.date === dateLabel);
									if (entry && entry.components) {
										config.components.forEach((comp, ci) => {
											if (entry.components[ci] != null) {
												const cv = (comp.prefix || '') + entry.components[ci].toFixed(comp.decimals ?? 1) + (comp.suffix || '');
												lines.push('  ' + comp.label + ': ' + cv);
											}
										});
									}
								}
								return lines;
							}
						}
					},
					legend: { display: false }
				},
				scales: {
					x: {
						type: 'category',
						bounds: 'data',
						grid: { display: false },
						ticks: {
							font: { size: config.timeSeries === false ? (window.innerWidth <= 760 ? 11 : 14) : 11, family: "Tahoma, Verdana, sans-serif" },
							color: config.timeSeries === false ? tc.textDark : tc.axisText,
							callback: config.timeSeries !== false
								? currentDateFormat.tickCallback
								: function(value, index) { return this.getLabelForValue(index); },
							maxRotation: 0,
							minRotation: 0,
							autoSkipPadding: 12
						}
					},
					y: {
						grace: '5%',
						border: { display: false },
						grid: config.type === 'bar'
							? { color: function(context) { return context.tick.value === 0 ? tc.axisText : 'transparent'; } }
							: { color: tc.grid },
						ticks: config.type === 'bar'
							? { font: { size: 11, family: "Tahoma, Verdana, sans-serif" }, color: tc.axisText,
								callback: function(value) { return value === 0 ? '0' : ''; } }
							: { font: { size: 11, family: "Tahoma, Verdana, sans-serif" }, color: tc.axisText },
						title: { display: false },
						beginAtZero: config.type === 'bar' || config.beginAtZero || false,
						min: config.yAxisMin ?? undefined,
						max: config.yAxisMax ?? undefined
					}
				}
			}
		});

		// Populate mobile annotation
		const mobileLatest = document.getElementById('chart-latest-mobile');
		if (config.timeSeries !== false) {
			const lastEntry = data[data.length - 1];
			const lastDate = new Date(lastEntry.date);
			const dateLabels = currentDateFormat.lastValueFormat(lastDate);
			const dateStr = dateLabels.join(' ');
			const prefix = config.valuePrefix || '';
			const suffix = config.valueSuffix || '';
			const decimals = config.decimals ?? 2;

			if (isMultiSeries) {
				const parts = config.series.map((s, i) => {
					let val = null;
					for (let j = data.length - 1; j >= 0; j--) {
						if (data[j].values[i] != null && !isNaN(data[j].values[i])) {
							val = data[j].values[i];
							break;
						}
					}
					return val != null ? `${s.label}: ${prefix}${val.toFixed(decimals)}${suffix}` : null;
				}).filter(Boolean);
				mobileLatest.textContent = `Latest: ${parts.join(', ')} (${dateStr})`;
			} else {
				const val = prefix + lastEntry.value.toFixed(decimals) + suffix;
				mobileLatest.textContent = `Latest: ${val} (${dateStr})`;
			}
			mobileLatest.classList.add('active');
		} else {
			mobileLatest.textContent = '';
			mobileLatest.classList.remove('active');
		}

		// Render legend for multi-series charts
		renderLegend(config);

		// Update back face with description and latest value
		updateBackFace(config, data);

		// Fade in
		chartBody.classList.remove('fading');
		loadingEl.classList.remove('active');
	} catch (error) {
		console.error('Error loading chart:', error);
		showError(error.message);
		chartBody.classList.remove('fading');
		loadingEl.classList.remove('active');
	}
}

// Initialize application
async function init() {
	try {
		const response = await fetch('files/charts.json');
		if (!response.ok) {
			throw new Error('Failed to load charts.json');
		}
		manifest = await response.json();

		// Sort by order if present, then by title
		manifest.charts.sort((a, b) => {
			if (a.order !== undefined && b.order !== undefined) {
				return a.order - b.order;
			}
			if (a.order !== undefined) return -1;
			if (b.order !== undefined) return 1;
			return a.title.localeCompare(b.title);
		});

		populateDropdown();

		// Load chart from URL hash or first chart
		const hashId = window.location.hash.slice(1);
		const initialId = hashId && manifest.charts.find(d => d.id === hashId)
			? hashId
			: manifest.charts[0].id;

		document.getElementById('dataset-select').value = initialId;
		loadChart(initialId);

	} catch (error) {
		console.error('Initialization error:', error);
		showError(error.message);
	}
}

// Update chart colors after theme toggle
function refreshChartColors() {
	csvCache.clear();
	const select = document.getElementById('dataset-select');
	if (select && select.value) {
		loadChart(select.value);
	}
}

// Navigate to previous or next chart
function navigateChart(direction) {
	if (!manifest) return;
	const select = document.getElementById('dataset-select');
	const options = Array.from(select.querySelectorAll('option'));
	const currentIdx = options.findIndex(o => o.value === select.value);
	const newIdx = currentIdx + direction;
	if (newIdx < 0 || newIdx >= options.length) return;
	select.value = options[newIdx].value;
	loadChart(select.value);
}

// Handle dropdown changes
document.getElementById('dataset-select').addEventListener('change', (e) => {
	loadChart(e.target.value);
});

// Flip card event listeners
document.getElementById('chart-info').addEventListener('click', flipCard);
document.getElementById('chart-back-btn').addEventListener('click', flipCard);

// Navigation button listeners
document.getElementById('chart-prev').addEventListener('click', () => navigateChart(-1));
document.getElementById('chart-next').addEventListener('click', () => navigateChart(1));

// Keyboard navigation
document.addEventListener('keydown', (e) => {
	// Skip if user is typing in an input/select/textarea
	const tag = document.activeElement.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

	if (e.key === 'ArrowLeft') {
		e.preventDefault();
		navigateChart(-1);
	} else if (e.key === 'ArrowRight') {
		e.preventDefault();
		navigateChart(1);
	}
});

// Touch swipe navigation
(function() {
	const wrapper = document.querySelector('.chart-flip-wrapper');
	let startX = null;
	wrapper.addEventListener('touchstart', (e) => {
		startX = e.touches[0].clientX;
	}, { passive: true });
	wrapper.addEventListener('touchend', (e) => {
		if (startX === null) return;
		const dx = e.changedTouches[0].clientX - startX;
		startX = null;
		if (Math.abs(dx) < 50) return;
		navigateChart(dx > 0 ? -1 : 1);
	}, { passive: true });
})();

// Refractor holographic mouse tracking
(function() {
	const wrapper = document.querySelector('.chart-flip-wrapper');
	wrapper.addEventListener('mousemove', (e) => {
		if (!document.querySelector('.chart-header.refractor')) return;
		const rect = wrapper.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;
		const angle = Math.atan2(y - 50, x - 50) * (180 / Math.PI);
		wrapper.style.setProperty('--refractor-x', `${x}%`);
		wrapper.style.setProperty('--refractor-y', `${y}%`);
		wrapper.style.setProperty('--refractor-angle', `${angle}deg`);
	});
	wrapper.addEventListener('mouseleave', () => {
		wrapper.style.removeProperty('--refractor-x');
		wrapper.style.removeProperty('--refractor-y');
		wrapper.style.removeProperty('--refractor-angle');
	});
})();

// Initialize on page load
init();
