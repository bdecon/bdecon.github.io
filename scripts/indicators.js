// Read theme colors and fonts from CSS variables
const FONT_BODY = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'Inter, sans-serif';
const FONT_UI = FONT_BODY;

// Number formatting with Intl.NumberFormat (comma grouping, fixed decimals)
const numFmtCache = {};
function fmtNum(value, decimals, prefix, suffix) {
	const key = decimals;
	if (!numFmtCache[key]) {
		numFmtCache[key] = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		});
	}
	return (prefix || '') + numFmtCache[key].format(value) + (suffix || '');
}

// Parse hex color to [r, g, b]
function hexToRGB(hex) {
	return [
		parseInt(hex.slice(1, 3), 16),
		parseInt(hex.slice(3, 5), 16),
		parseInt(hex.slice(5, 7), 16)
	];
}

function getThemeColors() {
	const style = getComputedStyle(document.documentElement);
	const get = (name) => style.getPropertyValue(name).trim();
	return {
		grid: get('--color-grid') || 'rgba(0, 0, 0, 0.06)',
		axisText: get('--color-text-muted') || '#666',
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
let isBreakdownView = false;
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

// Reference line plugin (e.g., 2% inflation target)
const refLinePlugin = {
	id: 'refLines',
	afterDraw: function(chart) {
		const config = chart.config._config.datasetConfig;
		if (!config?.refLines) return;

		const ctx = chart.ctx;
		const yAxis = chart.scales.y;
		const xAxis = chart.scales.x;
		const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

		ctx.save();
		config.refLines.forEach(function(ref) {
			const y = yAxis.getPixelForValue(ref.value);
			if (y < yAxis.top || y > yAxis.bottom) return;

			ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
			ctx.lineWidth = 1;
			ctx.setLineDash(ref.style === 'dashed' ? [4, 4] : []);
			ctx.beginPath();
			ctx.moveTo(xAxis.left, y);
			ctx.lineTo(xAxis.right, y);
			ctx.stroke();

			if (ref.label) {
				ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
				ctx.font = '10px ' + FONT_UI;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'bottom';
				ctx.fillText(ref.label, xAxis.left + 4, y - 3);
			}
		});
		ctx.setLineDash([]);
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

	const colorDefs = {
		blue:   ['--color-card-blue',   '#3450B2'],
		green:  ['--color-card-green',  '#229a54'],
		red:    ['--color-card-red',    '#E04040'],
		orange: ['--color-card-orange', '#ca5c00'],
		purple: ['--color-card-purple', '#553581'],
		teal:   ['--color-card-teal',   '#2A8A8A'],
		ltblue: ['--color-card-ltblue', '#4A90C4']
	};

	colorMap = {};
	for (const [name, [cssVar, fallback]] of Object.entries(colorDefs)) {
		const hex = style.getPropertyValue(cssVar).trim() || fallback;
		const [r, g, b] = hexToRGB(hex);
		colorMap[name] = {
			border: hex,
			line: lighten(hex, mix),
			background: `rgba(${r}, ${g}, ${b}, ${a})`,
			backgroundStrong: `rgba(${r}, ${g}, ${b}, ${aStrong})`
		};
	}
}
updateColorMap();

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
					const dateStr = this.getLabelForValue(value);
					return dateStr ? dateStr.substring(0, 4) : '';
				},
				tooltipTitle: function(context) {
					const date = new Date(context[0].label);
					return date.getUTCFullYear().toString();
				},
				lastValueFormat: function(date) {
					return [date.getUTCFullYear()];
				}
			};
		case 'weekly':
			return {
				tickCallback: function(value, index) {
					const dateStr = this.getLabelForValue(value);
					if (!dateStr) return '';
					const date = new Date(dateStr);
					const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
						'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					return months[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
				},
				tooltipTitle: function(context) {
					const date = new Date(context[0].label);
					const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
						'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					return months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
				},
				lastValueFormat: function(date) {
					const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
						'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					return [months[date.getUTCMonth()] + ' ' + date.getUTCDate(), date.getUTCFullYear()];
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
			ctx.font = `10px ${FONT_BODY}`;
			ctx.textAlign = 'left';

			if (allSameEnd && labelData.length > 1) {
				// Multiple series share the same end date — one shared date label
				const x = labelData[0].xPos + 8;
				const minGap = 13;
				const chartBottom = chart.chartArea.bottom;

				// Date label at top
				ctx.textBaseline = 'middle';
				ctx.fillStyle = getThemeColors().axisText;
				let dateY = 12;
				labelData[0].dateLabels.forEach((label) => {
					ctx.fillText(label, x, dateY);
					dateY += 11;
				});
				const dateAreaBottom = 12 + (labelData[0].dateLabels.length * 11) + 3;

				// Position labels at actual y, then de-overlap
				const sorted = [...labelData].sort((a, b) => a.yPos - b.yPos);
				const positions = sorted.map(d => Math.max(dateAreaBottom, Math.min(d.yPos, chartBottom - 4)));

				// Push overlapping labels downward
				for (let i = 1; i < positions.length; i++) {
					if (positions[i] - positions[i - 1] < minGap) {
						positions[i] = positions[i - 1] + minGap;
					}
				}
				// If bottom labels overflow, push back upward
				if (positions[positions.length - 1] > chartBottom - 4) {
					positions[positions.length - 1] = chartBottom - 4;
					for (let i = positions.length - 2; i >= 0; i--) {
						if (positions[i + 1] - positions[i] < minGap) {
							positions[i] = positions[i + 1] - minGap;
						}
					}
				}

				sorted.forEach(({ ds, value }, i) => {
					const valueStr = fmtNum(value, decimals, prefix, suffix);
					ctx.fillStyle = ds.borderColor;
					ctx.fillText(valueStr, x, positions[i]);
				});
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

					const valueStr = fmtNum(item.value, decimals, prefix, suffix);
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
			const valueStr = fmtNum(dataset.data[lastIndex], decimals, prefix, suffix);

			const dateLabels = currentDateFormat
				? currentDateFormat.lastValueFormat(lastDate)
				: ['Q' + Math.ceil((lastDate.getUTCMonth() + 1) / 3), lastDate.getUTCFullYear()];

			ctx.save();
			ctx.font = `10px ${FONT_BODY}`;
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
		ctx.font = `12px ${FONT_BODY}`;
		ctx.fillStyle = getThemeColors().textDark;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';

		meta.data.forEach((bar, index) => {
			const value = chart.data.datasets[0].data[index];
			ctx.fillText(fmtNum(value, decimals), bar.x, bar.y - 4);
		});

		ctx.restore();
	}
};

// Render horizontal bar chart with latest + previous period bars
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

// Toggle between total and breakdown view for stacked bar charts
function toggleBreakdown() {
	if (!currentConfig) return;
	isBreakdownView = !isBreakdownView;
	loadChart(currentConfig.id);
}

// Toggle between full data and last 3 years
async function toggleTimeRange() {
	if (!chart || !fullData) return;

	const filterLink = document.getElementById('chart-filter').querySelector('button');
	const dateFormat = currentConfig?.dateFormat || 'quarterly';
	const isMultiSeries = currentConfig?.series && currentConfig.series.length > 1;
	const isStackedBar = currentConfig?.type === 'stackedBar' && currentConfig.stackedSeries;
	const filterYears = currentConfig?.filterYears || 3;

	const hasFilteredFile = !!currentConfig?.filteredFile;

	if (isFilteredView) {
		// Show all data — restore original date format
		if (hasFilteredFile) {
			currentDateFormat = getDateFormatConfig(dateFormat);
		}
		chart.data.labels = fullData.map(d => d.date);
		if (isStackedBar) {
			currentConfig.stackedSeries.forEach((s, i) => {
				chart.data.datasets[i].data = fullData.map(d => d[s.col] || 0);
				if (currentConfig.timeSeries !== false) {
					chart.data.datasets[i].categoryPercentage = 1.0;
					chart.data.datasets[i].barPercentage = 1.0;
					chart.data.datasets[i].borderWidth = 0;
				}
			});
		} else if (isMultiSeries) {
			chart.data.datasets.forEach((ds, i) => {
				ds.data = fullData.map(d => d.values[i]);
			});
		} else {
			chart.data.datasets[0].data = fullData.map(d => d.value);
		}
		chart.options.scales.x.ticks.callback = currentDateFormat.tickCallback;
		chart.options.plugins.tooltip.callbacks.title = currentDateFormat.tooltipTitle;
		filterLink.textContent = `Recent ${filterYears} years`;
		isFilteredView = false;
		chart.options.scales.y.suggestedMin = undefined;
		chart.options.scales.y.suggestedMax = undefined;
	} else {
		// If chart has a separate filtered file (e.g. weekly data), fetch and use it
		let filtered;
		if (currentConfig.filteredFile) {
			let csv;
			if (csvCache.has(currentConfig.filteredFile)) {
				csv = csvCache.get(currentConfig.filteredFile);
			} else {
				const resp = await fetch(currentConfig.filteredFile);
				if (!resp.ok) throw new Error('Failed to load ' + currentConfig.filteredFile);
				csv = await resp.text();
				csvCache.set(currentConfig.filteredFile, csv);
			}
			const lines = csv.trim().split('\n');
			const headers = lines[0].split(',');
			filtered = lines.slice(1).map(line => {
				const parts = line.split(',');
				if (isStackedBar) {
					const entry = { date: parts[0] };
					headers.slice(1).forEach((h, i) => { entry[h] = parseFloat(parts[i + 1]); });
					return entry;
				}
				return isMultiSeries
					? { date: parts[0], values: parts.slice(1).map(v => parseFloat(v)) }
					: { date: parts[0], value: parseFloat(parts[1]) };
			});
		} else {
			filtered = filterToLastYears(fullData, filterYears);
		}
		chart.data.labels = filtered.map(d => d.date);
		if (isStackedBar) {
			currentConfig.stackedSeries.forEach((s, i) => {
				chart.data.datasets[i].data = filtered.map(d => d[s.col] || 0);
				if (currentConfig.timeSeries !== false) {
					chart.data.datasets[i].categoryPercentage = 0.9;
					chart.data.datasets[i].barPercentage = 0.9;
				}
			});
		} else if (isMultiSeries) {
			chart.data.datasets.forEach((ds, i) => {
				ds.data = filtered.map(d => d.values[i]);
			});
		} else {
			chart.data.datasets[0].data = filtered.map(d => d.value);
		}
		if (hasFilteredFile) {
			currentDateFormat = getDateFormatConfig('weekly');
			chart.options.scales.x.ticks.callback = currentDateFormat.tickCallback;
			chart.options.plugins.tooltip.callbacks.title = currentDateFormat.tooltipTitle;
		} else {
			chart.options.scales.x.ticks.callback = getFilteredTickCallback(dateFormat);
		}
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
	const prefix = config.legendLabel
		? `<span class="chart-legend-label">${config.legendLabel}</span>`
		: '';
	legendContainer.innerHTML = prefix + config.series.map((s, i) => {
		const colors = colorMap[s.color || config.color || 'blue'];
		const active = !s.hidden;
		return `
			<div class="chart-legend-item${s.hidden ? ' legend-off' : ''}" data-index="${i}"
				role="button" tabindex="0" aria-pressed="${active}" aria-label="Toggle ${s.label} series">
				<span class="chart-legend-box" style="background-color: ${colors.line}"></span>
				<span>${s.label}</span>
			</div>
		`;
	}).join('');

	legendContainer.querySelectorAll('.chart-legend-item').forEach(item => {
		const toggle = () => {
			const index = parseInt(item.dataset.index);
			const isVisible = chart.isDatasetVisible(index);
			chart.setDatasetVisibility(index, !isVisible);
			item.classList.toggle('legend-off', isVisible);
			item.setAttribute('aria-pressed', !isVisible);
			chart.update();
		};
		item.addEventListener('click', toggle);
		item.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
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
	const formatVal = (v) => fmtNum(v, decimals, prefix, suffix);

	if (config.type === 'stackedBar' && config.stackedSeries) {
		if (!data || data.length === 0) return '';

		// Time-series stacked bar: long format (periods as rows, series as columns)
		if (config.timeSeries !== false) {
			const last = data[data.length - 1];
			const lastDate = new Date(last.date);
			const dateFormat = getDateFormatConfig(config.dateFormat || 'quarterly');

			function findClosestStacked(targetDate) {
				let closest = null;
				let minDiff = Infinity;
				for (const entry of data) {
					const diff = Math.abs(new Date(entry.date) - targetDate);
					if (diff < minDiff) { minDiff = diff; closest = entry; }
				}
				return closest && minDiff < 100 * 24 * 60 * 60 * 1000 ? closest : null;
			}

			const rows = [];
			for (let yr = 6; yr >= 0; yr--) {
				const target = new Date(lastDate);
				target.setFullYear(target.getFullYear() - yr);
				const entry = yr === 0 ? last : findClosestStacked(target);
				if (entry) rows.push({ entry, isLatest: yr === 0 });
			}

			let html = '<table class="card-stats-table"><thead><tr><th>Period</th>';
			config.stackedSeries.forEach(s => { html += `<th>${s.label}</th>`; });
			html += '</tr></thead><tbody>';
			rows.forEach(({ entry, isLatest }) => {
				const d = new Date(entry.date);
				const label = dateFormat.lastValueFormat(d).join(' ');
				const b = isLatest ? '<strong>' : '';
				const bc = isLatest ? '</strong>' : '';
				html += `<tr><td>${b}${label}${bc}</td>`;
				config.stackedSeries.forEach(s => {
					const v = entry[s.col] != null ? formatVal(entry[s.col]) : '\u2014';
					html += `<td>${b}${v}${bc}</td>`;
				});
				html += '</tr>';
			});
			html += '</tbody></table>';
			return html;
		}

		// Non-time-series stacked bar: wide format (series as rows, quarters as columns)
		const recent = data.slice(-4);
		const qLabels = recent.map(d => {
			const [yr, q] = d.date.split('-');
			return `Q${parseInt(q)} '${yr.slice(2)}`;
		});
		let html = '<table class="card-stats-table"><thead><tr><th></th>';
		qLabels.forEach(q => { html += `<th>${q}</th>`; });
		html += '</tr></thead><tbody>';
		config.stackedSeries.forEach(s => {
			html += `<tr><td>${s.label}</td>`;
			recent.forEach(d => {
				html += `<td>${formatVal(d[s.col] || 0)}</td>`;
			});
			html += '</tr>';
		});
		// Total row — skip if totals are always near zero
		const totals = recent.map(d => config.stackedSeries.reduce((sum, s) => sum + (d[s.col] || 0), 0));
		const showTotal = totals.some(t => Math.abs(t) > 0.1);
		if (showTotal) {
			html += '<tr style="font-weight:600;border-top:1px solid var(--color-border)"><td>Total</td>';
			totals.forEach(t => { html += `<td>${formatVal(t)}</td>`; });
			html += '</tr>';
		}
		html += '</tbody></table>';
		return html;
	}

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

		const tableSeries = config.series.map((s, i) => ({ ...s, idx: i }))
			.filter(s => s.showInTable !== false);
		let html = '<table class="card-stats-table"><thead><tr><th>Period</th>';
		tableSeries.forEach(s => { html += `<th>${s.label}</th>`; });
		html += '</tr></thead><tbody>';
		rows.forEach(({ entry, isLatest }) => {
			const d = new Date(entry.date);
			const label = dateFormat.lastValueFormat(d).join(' ');
			const b = isLatest ? '<strong>' : '';
			const bc = isLatest ? '</strong>' : '';
			html += `<tr><td>${b}${label}${bc}</td>`;
			tableSeries.forEach(s => {
				const v = entry.values[s.idx] != null && !isNaN(entry.values[s.idx]) ? formatVal(entry.values[s.idx]) : '\u2014';
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
					? fmtNum(entry.components[ci], c.decimals ?? 1, c.prefix, c.suffix)
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
			return (pct >= 0 ? '+' : '') + fmtNum(pct, 1) + '%';
		}
		const diff = curr - prev;
		return (diff >= 0 ? '+' : '') + fmtNum(diff, decimals);
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

	const categoryIcons = {
		'Output': 'icon-factory.svg',
		'Labor': 'icon-construction.svg',
		'Prices': 'icon-house.svg',
		'Monetary': 'icon-fed.svg',
		'Trade': 'icon-ship.svg',
		'Government': 'icon-govt.svg',
		'Businesses': 'icon-store.svg'
	};

	const categoryColors = {
		'Monetary': 'var(--color-card-blue)',
		'Output': 'var(--color-card-ltblue)',
		'Prices': 'var(--color-card-red)',
		'Trade': 'var(--color-card-purple)',
		'Labor': 'var(--color-card-orange)',
		'Government': 'var(--color-card-green)',
		'Businesses': 'var(--color-card-teal)'
	};

	const groups = new Map();
	charts.forEach(ds => {
		const cat = ds.category || 'Other';
		if (!groups.has(cat)) groups.set(cat, []);
		groups.get(cat).push(ds);
	});

	groups.forEach((items, category) => {
		const group = document.createElement('div');
		group.className = 'chart-grid-group';
		if (categoryColors[category]) {
			group.style.setProperty('--cat-color', categoryColors[category]);
		}

		const iconFile = categoryIcons[category];
		if (iconFile) {
			const iconDiv = document.createElement('div');
			iconDiv.className = 'chart-grid-icon';
			const img = document.createElement('img');
			img.src = 'images/' + iconFile;
			img.alt = category;
			img.loading = 'lazy';
			iconDiv.appendChild(img);
			const firstId = items[0].id;
			iconDiv.addEventListener('click', function(e) {
				e.preventDefault();
				select.value = firstId;
				loadChart(firstId);

			});
			group.appendChild(iconDiv);
		}

		const linksDiv = document.createElement('div');
		linksDiv.className = 'chart-grid-links';

		const header = document.createElement('div');
		header.className = 'chart-grid-category';
		header.textContent = category;

		const firstId = items[0].id;
		header.addEventListener('click', function(e) {
			e.preventDefault();
			select.value = firstId;
			loadChart(firstId);
			document.querySelector('.ind-chart').scrollIntoView({ behavior: 'smooth' });
		});
		linksDiv.appendChild(header);

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

			});
			linksDiv.appendChild(link);
		});

		group.appendChild(linksDiv);
		grid.appendChild(group);
	});
}

// Update the selector title, counter, and grid active state
function updateSelectorTitle(datasetId) {
	const config = manifest.charts.find(d => d.id === datasetId);
	if (!config) return;
	document.getElementById('chart-selector-title').textContent = config.title;

	// Update chart counter
	const idx = manifest.charts.indexOf(config) + 1;
	const total = manifest.charts.length;
	const counterEl = document.getElementById('chart-counter');
	if (counterEl) counterEl.textContent = idx + ' / ' + total;

	// Update grid active state
	document.querySelectorAll('.chart-grid-item').forEach(el => {
		el.classList.toggle('active', el.dataset.id === datasetId);
	});
	document.querySelectorAll('.chart-grid-group').forEach(group => {
		const hasActive = group.querySelector('.chart-grid-item.active');
		group.classList.toggle('active', !!hasActive);
	});
}

// Load and display chart for given dataset
async function loadChart(datasetId) {
	updateColorMap();
	resetFlip();

	// Reset breakdown view when switching to a different chart
	if (currentConfig && currentConfig.id !== datasetId) {
		isBreakdownView = false;
	}

	const config = manifest.charts.find(d => d.id === datasetId);
	if (!config) {
		showError('Dataset not found: ' + datasetId);
		return;
	}

	// Update URL hash for sharing
	window.history.replaceState(null, '', '#' + datasetId);

	const chartBody = document.querySelector('.chart-flip-front .chart-body');
	const loadingEl = document.getElementById('chart-loading');
	if (config.type !== 'dualBar') {
		chartBody.classList.add('fading');
		loadingEl.classList.add('active');
	}

	// Update DOM elements
	updateSelectorTitle(datasetId);
	document.getElementById('chart-title').textContent = config.title;
	document.getElementById('chart-subtitle').innerHTML = config.subtitle || '';
	document.getElementById('chart-source').textContent = 'Source: ' + config.source;
	document.getElementById('chart-download').href = config.file;
	document.getElementById('lineChart').setAttribute('aria-label', `Chart: ${config.title}`);

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

		// Store full data for filtering, preserve filter state across charts
		fullData = data;
		currentConfig = config;

		// Show/hide filter link (only for time series charts)
		const filterEl = document.getElementById('chart-filter');
		if (config.timeSeries !== false) {
			filterEl.style.display = '';
			filterEl.querySelector('button').textContent = isFilteredView ? 'Full history' : `Recent ${config.filterYears || 3} years`;
		} else {
			filterEl.style.display = 'none';
		}

		// Destroy existing chart
		if (chart) {
			chart.destroy();
			chart = null;
		}

		// Hide PNG download for non-canvas chart types
		const pngBtn = document.getElementById('btn-download-png');
		if (pngBtn) pngBtn.style.display = config.type === 'dualBar' ? 'none' : '';

		// Hide breakdown toggle by default (stackedBar handler shows it when needed)
		const breakdownDefault = document.getElementById('chart-breakdown');
		if (breakdownDefault) breakdownDefault.style.display = 'none';

		// Toggle vertical card orientation for bar-only charts
		const wrapper = document.querySelector('.chart-flip-wrapper');
		if (config.type === 'dualBar') {
			wrapper.classList.add('card-vertical');
		} else {
			wrapper.classList.remove('card-vertical');
		}

		// Handle dual bar chart — render as Chart.js horizontal bar
		if (config.type === 'dualBar') {
			const dualData = lines.slice(1).map(line => {
				const parts = line.split(',');
				return { name: parts[0], value: parseFloat(parts[1]), previous: parts[2] ? parseFloat(parts[2]) : null };
			});

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

			document.getElementById('chart-latest-mobile').classList.remove('active');
			updateBackFace(config, dualData, latestDate, prevDate);

			// Render on the standard canvas
			document.getElementById('lineChart').style.display = 'block';
			const customContainer = document.getElementById('custom-chart');
			if (customContainer) customContainer.style.display = 'none';

			if (chart) { chart.destroy(); chart = null; }
			const ctx = document.getElementById('lineChart').getContext('2d');
			const tc = getThemeColors();
			const colors = colorMap[config.color || 'red'];
			const dec = config.decimals ?? 2;
			const pfx = config.valuePrefix || '';
			const sfx = config.valueSuffix || '';
			const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
			const prevColor = isDark ? '#666' : '#d0d4d8';
			const prevBorder = isDark ? '#aaa' : '#888';

			const isMobile = window.innerWidth <= 760;

			// ── KNOBS ──────────────────────────────────────
			const CANVAS_HEIGHT = 480;                    // total chart height in px
			const BAR_THICKNESS = 0.98;                   // bar width (0-1, fraction of slot)
			const GROUP_THICKNESS = 0.7;                  // group width (0-1, fraction of category)
			const PAD_LEFT = isMobile ? 2 : 6;            // px, space left of y-labels
			const PAD_RIGHT = isMobile ? -24 : -2;        // px, space right of value labels
			const PAD_TOP = 0;                            // px, space above legend
			const PAD_BOTTOM = 2;                         // px, space below last bar
			const LABEL_FONT = 14;                        // y-label font size
			const LABEL_GAP = isMobile ? 10 : 12;         // px between y-labels and bars
			const VALUE_FONT = 12;                        // value label font size
			const VALUE_GAP = 4;                          // px between bar end and value label
			const LABEL_WRAP = isMobile ? 10 : 12;        // chars before wrapping y-label
			const LEGEND_FONT = 14;                       // legend font size
			// ───────────────────────────────────────────────

			const wrapLabel = (name) => {
				if (name.length <= LABEL_WRAP) return name;
				const words = name.split(' ');
				const lines = [''];
				words.forEach(w => {
					const cur = lines[lines.length - 1];
					if ((cur + ' ' + w).trim().length <= LABEL_WRAP) {
						lines[lines.length - 1] = (cur + ' ' + w).trim();
					} else {
						lines.push(w);
					}
				});
				return lines;
			};

			chart = new Chart(ctx, {
				type: 'bar',
				datasetConfig: config,
				data: {
					labels: dualData.map(d => wrapLabel(d.name)),
					datasets: [
						{
							label: latestLabel,
							data: dualData.map(d => d.value),
							backgroundColor: colors.line,
							borderWidth: 0,
							barPercentage: BAR_THICKNESS,
							categoryPercentage: GROUP_THICKNESS
						},
						{
							label: prevLabel,
							data: dualData.map(d => d.previous),
							backgroundColor: prevColor,
							borderColor: prevBorder,
							borderWidth: 1.5,
							barPercentage: BAR_THICKNESS,
							categoryPercentage: GROUP_THICKNESS,
						}
					]
				},
				plugins: [{
					id: 'dualBarDataLabels',
					afterDatasetsDraw: function(chart) {
						const ctx = chart.ctx;
						ctx.save();
						ctx.font = `${VALUE_FONT}px ${FONT_BODY}`;
						ctx.textBaseline = 'middle';
						chart.data.datasets.forEach((dataset, di) => {
							if (!chart.isDatasetVisible(di)) return;
							chart.getDatasetMeta(di).data.forEach((bar, i) => {
								const val = dataset.data[i];
								if (val == null || isNaN(val)) return;
								ctx.fillStyle = tc.textDark;
								ctx.textAlign = val >= 0 ? 'left' : 'right';
								ctx.fillText(fmtNum(val, dec, pfx, sfx), bar.x + (val >= 0 ? VALUE_GAP : -VALUE_GAP), bar.y);
							});
						});
						ctx.restore();
					}
				}],
				options: {
					indexAxis: 'y',
					responsive: true,
					maintainAspectRatio: false,
					layout: { padding: { left: PAD_LEFT, right: PAD_RIGHT, top: PAD_TOP, bottom: PAD_BOTTOM } },
					plugins: {
						legend: {
							display: true,
							position: 'top',
							labels: {
								font: { size: LEGEND_FONT, family: FONT_UI },
								color: tc.textDark,
								boxWidth: 14,
								boxHeight: 10,
								padding: 12
							},
							onClick: function(e, item, legend) {
								const idx = item.datasetIndex;
								const ci = legend.chart;
								ci.setDatasetVisibility(idx, !ci.isDatasetVisible(idx));
								ci.update();
							}
						},
						tooltip: {
							enabled: true,
							backgroundColor: tc.tooltipBg,
							titleFont: { size: 12, family: FONT_UI },
							bodyFont: { size: 11, family: FONT_BODY },
							padding: 8,
							cornerRadius: 2,
							callbacks: {
								label: function(ctx) {
									return ctx.dataset.label + ': ' + fmtNum(ctx.parsed.x, dec, pfx, sfx);
								}
							}
						}
					},
					scales: {
						x: {
							ticks: { display: false },
							border: { display: false },
							grid: {
								drawTicks: false,
								color: function(ctx) {
									return ctx.tick && ctx.tick.value === 0
										? (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)')
										: 'transparent';
								}
							}
						},
						y: {
							afterFit: function(axis) {
								axis.width = isMobile ? 100 : 120;
							},
							grid: { display: false },
							border: { display: false },
							ticks: {
								font: { size: LABEL_FONT, family: FONT_UI },
								color: tc.textDark,
								crossAlign: 'near',
								autoSkip: false,
								padding: LABEL_GAP
							}
						}
					}
				}
			});

			document.getElementById('chart-legend').style.display = 'none';
			ctx.canvas.parentElement.style.height = CANVAS_HEIGHT + 'px';

			chartBody.classList.remove('fading');
			loadingEl.classList.remove('active');
			return;
		}

		// Handle stacked bar chart (e.g. Mag 7 OCF, sectoral balances)
		if (config.type === 'stackedBar' && config.stackedSeries) {
			const headers = lines[0].split(',');
			const isTimeSeries = config.timeSeries !== false;
			const stackData = lines.slice(1).map(line => {
				const parts = line.split(',');
				const entry = { date: parts[0] };
				headers.slice(1).forEach((h, i) => {
					entry[h] = parseFloat(parts[i + 1]);
				});
				return entry;
			});

			// Format labels based on whether this is a time series
			const filterYears = config.filterYears || 3;
			function stackedLabel(dateStr) {
				if (isTimeSeries) return dateStr; // use raw date, tick callback formats
				return dateStr; // keep raw "YYYY-QQ" for tick callback to format
			}

			// Apply filter if persisted
			let chartStackData = stackData;
			if (isTimeSeries && isFilteredView) {
				chartStackData = filterToLastYears(stackData, filterYears);
			}

			// Build datasets — total (aggregate) or breakdown (stacked per series)
			const tc = getThemeColors();
			const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
			const isFilteredTS = isTimeSeries && isFilteredView;
			const showTotal = config.stackedDefault === 'total' && !isBreakdownView;
			const getColor = (s) => isDark && s.darkColor ? s.darkColor : s.color;

			const buildDatasets = (data) => {
				if (showTotal) {
					const colors = colorMap[config.color || 'teal'];
					return [{
						label: config.tooltipLabel || 'Total',
						data: data.map(d => config.stackedSeries.reduce((sum, s) => sum + (d[s.col] || 0), 0)),
						backgroundColor: colors.line,
						borderColor: colors.line,
						borderWidth: 0
					}];
				}
				return config.stackedSeries.map(s => ({
					label: s.label,
					data: data.map(d => d[s.col] || 0),
					backgroundColor: getColor(s),
					borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)',
					borderWidth: isTimeSeries ? 0 : 0.5,
					...(isTimeSeries ? {
						categoryPercentage: isFilteredTS ? 0.9 : 1.0,
						barPercentage: isFilteredTS ? 0.9 : 1.0
					} : {})
				}));
			};

			// Show canvas, hide custom container
			document.getElementById('lineChart').style.display = 'block';
			document.getElementById('lineChart').parentElement.style.height = '';
			const customContainer = document.getElementById('custom-chart');
			if (customContainer) customContainer.style.display = 'none';

			const ctx = document.getElementById('lineChart').getContext('2d');
			const dec = config.decimals ?? 2;
			const pfx = config.valuePrefix || '';
			const sfx = config.valueSuffix || '';

			// Tick callback for stacked bars
			let stackedTickCallback;
			if (isTimeSeries) {
				stackedTickCallback = isFilteredView
					? getFilteredTickCallback(config.dateFormat || 'quarterly')
					: getDateFormatConfig(config.dateFormat || 'quarterly').tickCallback;
			} else {
				// Non-time-series: two-row labels — "Q1" with year below on Q1, just "Q2"/"Q3"/"Q4" otherwise
				stackedTickCallback = function(value, index) {
					const raw = this.getLabelForValue(value);
					if (!raw) return '';
					const [yr, q] = raw.split('-');
					const qn = parseInt(q);
					return qn === 1 ? ['Q1', yr] : [`Q${qn}`, ''];
				};
			}

			// Tooltip title for stacked bars
			let stackedTooltipTitle;
			if (isTimeSeries) {
				stackedTooltipTitle = getDateFormatConfig(config.dateFormat || 'quarterly').tooltipTitle;
			} else {
				stackedTooltipTitle = function(context) {
					const raw = context[0].label;
					const [yr, q] = raw.split('-');
					return `Q${parseInt(q)} ${yr}`;
				};
			}

			// Data labels plugin for total view
			const stackedDataLabelsPlugin = {
				id: 'stackedDataLabels',
				afterDatasetsDraw: function(ch) {
					if (!showTotal) return;
					const ctx2 = ch.ctx;
					const meta = ch.getDatasetMeta(0);
					ctx2.save();
					ctx2.font = `500 ${window.innerWidth <= 760 ? 10 : 12}px ${FONT_BODY}`;
					ctx2.fillStyle = tc.textDark;
					ctx2.textAlign = 'center';
					ctx2.textBaseline = 'bottom';
					meta.data.forEach((bar, i) => {
						const v = ch.data.datasets[0].data[i];
						if (v != null && !isNaN(v)) {
							ctx2.fillText(fmtNum(v, 1, '', ''), bar.x, bar.y - 3);
						}
					});
					ctx2.restore();
				}
			};

			chart = new Chart(ctx, {
				type: 'bar',
				datasetConfig: config,
				data: {
					labels: chartStackData.map(d => stackedLabel(d.date)),
					datasets: buildDatasets(chartStackData)
				},
				plugins: [
					...(isTimeSeries ? [recessionPlugin] : []),
					stackedDataLabelsPlugin
				],
				options: {
					responsive: true,
					maintainAspectRatio: true,
					layout: {
						padding: {
							right: window.innerWidth <= 760 ? 2 : 8,
							left: window.innerWidth <= 760 ? 0 : 4,
							top: showTotal ? 16 : 8
						}
					},
					interaction: { intersect: false, mode: 'index' },
					plugins: {
						tooltip: {
							enabled: true,
							backgroundColor: tc.tooltipBg,
							titleFont: { size: 12, family: FONT_UI },
							bodyFont: { size: 11, family: FONT_BODY },
							padding: 8,
							cornerRadius: 2,
							displayColors: !showTotal,
							itemSort: (a, b) => b.raw - a.raw,
							callbacks: {
								title: stackedTooltipTitle,
								afterTitle: config.tooltipSubtitle ? function() { return config.tooltipSubtitle; } : undefined,
								label: function(context) {
									if (context.parsed.y == null || isNaN(context.parsed.y)) return null;
									return (showTotal ? 'Total' : context.dataset.label) + ': ' + fmtNum(context.parsed.y, dec, pfx, sfx);
								},
								afterBody: showTotal ? undefined : function(context) {
									const total = context.reduce((sum, c) => sum + (c.parsed.y || 0), 0);
									if (Math.abs(total) < 0.1) return [];
									return ['Total: ' + fmtNum(total, dec, pfx, sfx)];
								}
							}
						},
						legend: { display: false }
					},
					scales: {
						x: {
							stacked: true,
							grid: { display: false },
							ticks: {
								font: { size: window.innerWidth <= 760 ? 10 : 12, family: FONT_BODY },
								color: tc.axisText,
								maxRotation: 0,
								minRotation: 0,
								autoSkip: isTimeSeries,
								autoSkipPadding: isTimeSeries ? 12 : 0,
								callback: stackedTickCallback
							}
						},
						y: {
							stacked: true,
							grace: '5%',
							border: { display: false },
							grid: {
								color: function(context) {
									if (context.tick.value === 0) {
										return isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
									}
									return tc.grid;
								},
								lineWidth: function(context) { return context.tick.value === 0 ? 1.3 : 1; }
							},
							ticks: {
								font: { size: 11, family: FONT_BODY },
								color: tc.axisText
							},
							beginAtZero: true
						}
					}
				}
			});

			// Render inline legend for stacked series (hidden in total view)
			const legendContainer = document.getElementById('chart-legend');
			if (showTotal) {
				legendContainer.innerHTML = '';
				legendContainer.style.display = 'none';
			} else {
				legendContainer.innerHTML = config.stackedSeries.map((s, i) =>
					`<span class="chart-legend-item" data-index="${i}" style="cursor:pointer;">` +
					`<span class="legend-swatch" style="background:${getColor(s)};width:10px;height:10px;display:inline-block;margin-right:4px;"></span>` +
					`${s.label}</span>`
				).join('');
				legendContainer.style.display = '';

				// Toggle series visibility on legend click
				legendContainer.querySelectorAll('.chart-legend-item').forEach(el => {
					el.addEventListener('click', () => {
						const idx = parseInt(el.dataset.index);
						const visible = chart.isDatasetVisible(idx);
						chart.setDatasetVisibility(idx, !visible);
						el.style.opacity = visible ? 0.35 : 1;
						chart.update();
					});
				});
			}

			// Store data for filtering and back face
			fullData = stackData;
			currentConfig = config;
			if (isTimeSeries) currentDateFormat = getDateFormatConfig(config.dateFormat || 'quarterly');

			// Populate mobile annotation for time-series stacked bars
			const mobileLatest = document.getElementById('chart-latest-mobile');
			if (isTimeSeries) {
				const lastEntry = stackData[stackData.length - 1];
				const lastDate = new Date(lastEntry.date);
				const dateStr = currentDateFormat.lastValueFormat(lastDate).join(' ');
				const parts = config.stackedSeries.map(s => {
					const v = lastEntry[s.col];
					return v != null ? `${s.label}: ${fmtNum(v, dec, pfx, sfx)}` : null;
				}).filter(Boolean);
				mobileLatest.textContent = `Latest: ${parts.join(', ')} (${dateStr})`;
				mobileLatest.classList.add('active');
			} else {
				mobileLatest.textContent = '';
				mobileLatest.classList.remove('active');
			}

			// Update back face
			updateBackFace(config, stackData, null, null);

			// Show/hide filter
			const filterEl = document.getElementById('chart-filter');
			if (isTimeSeries) {
				filterEl.style.display = '';
				filterEl.querySelector('button').textContent = isFilteredView ? 'Full history' : `Recent ${filterYears} years`;
			} else {
				filterEl.style.display = 'none';
			}

			// Show/hide breakdown toggle
			const breakdownEl = document.getElementById('chart-breakdown');
			if (config.stackedDefault === 'total' && config.toggleLabel) {
				breakdownEl.style.display = '';
				breakdownEl.querySelector('button').textContent = isBreakdownView ? config.toggleLabel[1] : config.toggleLabel[0];
			} else {
				breakdownEl.style.visibility = 'hidden';
			}

			chartBody.classList.remove('fading');
			loadingEl.classList.remove('active');
			return;
		}

		// Show canvas for regular charts, hide custom container
		document.getElementById('lineChart').style.display = 'block';
		document.getElementById('lineChart').parentElement.style.height = '';
		const customContainer = document.getElementById('custom-chart');
		if (customContainer) {
			customContainer.style.display = 'none';
		}

		// Get configurations
		currentDateFormat = getDateFormatConfig(config.dateFormat || 'quarterly');
		const ctx = document.getElementById('lineChart').getContext('2d');

		// Apply filter if persisted from previous chart
		const chartData = (isFilteredView && config.timeSeries !== false)
			? filterToLastYears(data, config.filterYears || 3)
			: data;

		// Build datasets based on single vs multi-series
		let datasets;
		let chartType = config.type || 'line';
		if (isMultiSeries) {
			datasets = config.series.map((s, i) => {
				const seriesColors = colorMap[s.color || config.color || 'blue'];
				return {
					label: s.label,
					data: chartData.map(d => d.values[i]),
					borderColor: seriesColors.line,
					backgroundColor: seriesColors.background,
					pointBackgroundColor: seriesColors.line,
					pointHoverBackgroundColor: seriesColors.line,
					borderWidth: 1.5,
					pointRadius: 1,
					pointHoverRadius: 4,
					fill: false,
					tension: 0.1,
					spanGaps: true,
					hidden: s.hidden || false
				};
			});
		} else {
			const colors = colorMap[config.color || 'blue'];
			const typeConfig = getChartTypeConfig(config.type || 'line', colors, config);
			chartType = typeConfig.type;
			datasets = [{
				label: config.tooltipLabel || config.title,
				data: chartData.map(d => d.value),
				...typeConfig.dataset
			}];
		}

		const tc = getThemeColors();
		chart = new Chart(ctx, {
			type: chartType,
			datasetConfig: config,
			data: {
				labels: chartData.map(d => d.date),
				datasets: datasets
			},
			plugins: [
				...(config.timeSeries !== false ? [lastValuePlugin, recessionPlugin] : []),
				...(config.showDataLabels ? [dataLabelsPlugin] : []),
				...(config.refLines ? [refLinePlugin] : [])
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
						titleFont: { size: 12, family: FONT_UI },
						bodyFont: { size: 11, family: FONT_BODY },
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
								const formattedValue = fmtNum(context.parsed.y, decimals, prefix, suffix);
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
												const cv = fmtNum(entry.components[ci], comp.decimals ?? 1, comp.prefix, comp.suffix);
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
							font: { size: config.timeSeries === false ? (window.innerWidth <= 760 ? 11 : 14) : 11, family: FONT_BODY },
							color: config.timeSeries === false ? tc.textDark : tc.axisText,
							callback: config.timeSeries !== false
								? (isFilteredView ? getFilteredTickCallback(config.dateFormat || 'quarterly') : currentDateFormat.tickCallback)
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
							: {
								color: function(context) {
									if (context.tick.value === 0) {
										const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
										return isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
									}
									return tc.grid;
								},
								lineWidth: function(context) { return context.tick.value === 0 ? 1.3 : 1; }
							},
						ticks: config.type === 'bar'
							? { font: { size: 11, family: FONT_BODY }, color: tc.axisText,
								callback: function(value) { return value === 0 ? '0' : ''; } }
							: { font: { size: 11, family: FONT_BODY }, color: tc.axisText },
						title: { display: false },
						beginAtZero: config.type === 'bar' || config.beginAtZero || false,
						min: config.yAxisMin ?? undefined,
						max: config.yAxisMax ?? undefined,
						suggestedMin: (isFilteredView && config.filteredYRef != null) ? config.filteredYRef : undefined,
						suggestedMax: (isFilteredView && config.filteredYRef != null) ? config.filteredYRef : undefined
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

			if (config.type === 'stackedBar' && config.stackedSeries) {
				const parts = config.stackedSeries.map(s => {
					const v = lastEntry[s.col];
					return v != null ? `${s.label}: ${fmtNum(v, decimals, prefix, suffix)}` : null;
				}).filter(Boolean);
				mobileLatest.textContent = `Latest: ${parts.join(', ')} (${dateStr})`;
			} else if (isMultiSeries) {
				const parts = config.series.map((s, i) => {
					let val = null;
					for (let j = data.length - 1; j >= 0; j--) {
						if (data[j].values[i] != null && !isNaN(data[j].values[i])) {
							val = data[j].values[i];
							break;
						}
					}
					return val != null ? `${s.label}: ${fmtNum(val, decimals, prefix, suffix)}` : null;
				}).filter(Boolean);
				mobileLatest.textContent = `Latest: ${parts.join(', ')} (${dateStr})`;
			} else {
				const val = fmtNum(lastEntry.value, decimals, prefix, suffix);
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

// Update chart colors after theme toggle (keep CSV cache — data doesn't change)
function refreshChartColors() {
	const select = document.getElementById('dataset-select');
	if (select && select.value) {
		loadChart(select.value);
	}
}

// Navigate to previous or next chart (wraps around)
function navigateChart(direction) {
	if (!manifest) return;
	const select = document.getElementById('dataset-select');
	const options = Array.from(select.querySelectorAll('option'));
	const currentIdx = options.findIndex(o => o.value === select.value);
	const newIdx = (currentIdx + direction + options.length) % options.length;
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

// Share tools: copy link
document.getElementById('btn-copy-link').addEventListener('click', function() {
	const btn = this;
	const origSVG = btn.querySelector('svg').outerHTML;
	navigator.clipboard.writeText(window.location.href).then(function() {
		btn.querySelector('svg').outerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
		btn.title = 'Copied!';
		setTimeout(function() {
			btn.querySelector('svg').outerHTML = origSVG;
			btn.title = 'Copy link to this chart';
		}, 1500);
	});
});

// Share tools: download PNG
document.getElementById('btn-download-png').addEventListener('click', function() {
	if (!currentConfig) return;

	// For dualBar charts, skip PNG (no canvas)
	if (currentConfig.type === 'dualBar') return;

	const canvas = document.getElementById('lineChart');
	const dpr = window.devicePixelRatio || 1;
	const srcW = canvas.width;
	const srcH = canvas.height;

	// Offscreen canvas with padding for title/source/branding
	const pad = 24 * dpr;
	const titleH = 40 * dpr;
	const subtitleH = 20 * dpr;
	const legendH = (currentConfig.series && currentConfig.series.length > 1) ? 22 * dpr : 0;
	const footerH = 30 * dpr;
	const totalW = srcW + pad * 2;
	const totalH = titleH + subtitleH + legendH + srcH + footerH + pad;

	const off = document.createElement('canvas');
	off.width = totalW;
	off.height = totalH;
	const ctx = off.getContext('2d');

	// Background
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
	ctx.fillRect(0, 0, totalW, totalH);

	const textColor = isDark ? '#e0e0e0' : '#333';
	const mutedColor = isDark ? '#999' : '#888';

	// Title
	ctx.fillStyle = textColor;
	ctx.font = `bold ${16 * dpr}px ${FONT_UI}`;
	ctx.textAlign = 'left';
	ctx.fillText(currentConfig.title, pad, pad + 16 * dpr);

	// Subtitle
	ctx.fillStyle = mutedColor;
	ctx.font = `${11 * dpr}px ${FONT_UI}`;
	const subtitleText = (currentConfig.subtitle || '').replace(/<br\s*\/?>/g, ' ');
	ctx.fillText(subtitleText, pad, pad + titleH + 2 * dpr);

	// Legend for multi-series
	if (legendH > 0 && currentConfig.series) {
		const ly = pad + titleH + subtitleH + 4 * dpr;
		let lx = pad;
		ctx.font = `${10 * dpr}px ${FONT_UI}`;
		currentConfig.series.forEach(function(s) {
			const colors = colorMap[s.color || currentConfig.color || 'blue'];
			// Line swatch
			ctx.strokeStyle = colors.line;
			ctx.lineWidth = 2 * dpr;
			ctx.beginPath();
			ctx.moveTo(lx, ly);
			ctx.lineTo(lx + 14 * dpr, ly);
			ctx.stroke();
			lx += 18 * dpr;
			// Label
			ctx.fillStyle = textColor;
			ctx.fillText(s.label, lx, ly + 4 * dpr);
			lx += ctx.measureText(s.label).width + 16 * dpr;
		});
	}

	// Chart canvas
	const chartY = pad + titleH + subtitleH + legendH;
	ctx.drawImage(canvas, pad, chartY, srcW, srcH);

	// Footer: source + branding
	const footerY = chartY + srcH + 14 * dpr;
	ctx.fillStyle = mutedColor;
	ctx.font = `${9 * dpr}px ${FONT_UI}`;
	ctx.textAlign = 'left';
	ctx.fillText('Source: ' + currentConfig.source, pad, footerY);
	ctx.textAlign = 'right';
	ctx.fillText('bd-econ.com', totalW - pad, footerY);

	// Download
	const link = document.createElement('a');
	link.download = currentConfig.id + '.png';
	link.href = off.toDataURL('image/png');
	link.click();
});

// Initialize on page load
init();
