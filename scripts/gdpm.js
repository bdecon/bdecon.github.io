// Read font families from CSS variables
const FONT_BODY = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'Tahoma, Verdana, sans-serif';
const FONT_UI = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif';

// Read theme colors from CSS variables
function getThemeColors() {
	const style = getComputedStyle(document.documentElement);
	const get = (name) => style.getPropertyValue(name).trim();
	return {
		grid: get('--color-grid') || 'rgba(0, 0, 0, 0.06)',
		axisText: get('--color-text-light') || '#666',
		tooltipBg: get('--color-tooltip-bg') || 'rgba(75, 75, 75, 0.95)'
	};
}

// Color
const chartColor = {
	border: getComputedStyle(document.documentElement).getPropertyValue('--color-card-red').trim() || '#FF2F2F'
};
function getChartFillAlpha() {
	return document.documentElement.getAttribute('data-theme') === 'dark' ? 0.18 : 0.08;
}

let chart = null;
let comparisonChart = null;
let fullData = null;
let isFilteredView = false;
let currentSeries = 'nominal';

// Date formatting for monthly data
function formatTickLabel(value, index) {
	const dateStr = this.getLabelForValue(value);
	return dateStr ? dateStr.substring(0, 4) : '';
}

function formatTooltipTitle(context) {
	const date = new Date(context[0].label);
	const months = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];
	return months[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
}

function formatTooltipTitleWithQuarter(context) {
	const date = new Date(context[0].label);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const quarter = 'Q' + (Math.floor(date.getUTCMonth() / 3) + 1);
	return months[date.getUTCMonth()] + ' ' + date.getUTCFullYear() + ' (' + quarter + ')';
}

function formatLastValueDate(date) {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return [months[date.getUTCMonth()], date.getUTCFullYear()];
}

// Filtered view tick callback
function getFilteredTickCallback() {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return function(value, index) {
		const dateStr = this.getLabelForValue(value);
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return months[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
	};
}

// Custom plugin to draw last value label
const lastValuePlugin = {
	id: 'lastValueLabel',
	afterDraw: function(chart) {
		const ctx = chart.ctx;
		const dataset = chart.data.datasets[0];
		const meta = chart.getDatasetMeta(0);
		const lastIndex = dataset.data.length - 1;
		const lastPoint = meta.data[lastIndex];

		if (!lastPoint) return;

		const x = lastPoint.x + 8;
		const y = lastPoint.y;

		const lastDate = new Date(chart.data.labels[lastIndex]);
		const dateLabels = formatLastValueDate(lastDate);
		const valueStr = '$' + (dataset.data[lastIndex] / 1000).toFixed(1) + 'T';

		ctx.save();
		ctx.font = `10px ${FONT_BODY}`;
		ctx.fillStyle = getThemeColors().axisText;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';

		dateLabels.forEach((label, i) => {
			ctx.fillText(label, x, y - 12 + (i * 12));
		});
		ctx.fillText(valueStr, x, y + (dateLabels.length - 1) * 12);

		ctx.restore();
	}
};

// Filter data to last N years
function filterToLastYears(data, years) {
	const cutoffDate = new Date();
	cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
	return data.filter(d => new Date(d.date) >= cutoffDate);
}

// Get current data based on series and filter state
function getCurrentData() {
	const data = isFilteredView ? filterToLastYears(fullData, 3) : fullData;
	return data.map(d => currentSeries === 'nominal' ? d.nominal : d.real);
}

// Toggle between full data and last 3 years
function toggleTimeRange() {
	if (!chart || !fullData) return;

	const filterLink = document.querySelector('.chart-filter button');
	isFilteredView = !isFilteredView;

	const data = isFilteredView ? filterToLastYears(fullData, 3) : fullData;
	chart.data.labels = data.map(d => d.date);
	chart.data.datasets[0].data = getCurrentData();
	chart.options.scales.x.ticks.callback = isFilteredView ? getFilteredTickCallback() : formatTickLabel;
	filterLink.textContent = isFilteredView ? 'Full history' : 'Recent 3 years';

	chart.update();
}

// Switch series
function switchSeries(series) {
	if (!chart || !fullData || series === currentSeries) return;

	currentSeries = series;
	const label = series === 'nominal' ? 'Nominal GDP' : 'Real GDP';

	chart.data.datasets[0].label = label;
	chart.data.datasets[0].data = getCurrentData();
	chart.update();

	// Update toggle buttons
	document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.series === series);
	});
}

// Load and display chart
async function init() {
	try {
		const response = await fetch('files/gdpm.csv');
		if (!response.ok) {
			throw new Error('Failed to load gdpm.csv');
		}
		const csv = await response.text();

		// Parse CSV
		const lines = csv.trim().split('\n');
		const data = lines.slice(1).map(line => {
			const [date, nominal, real] = line.split(',');
			return {
				date,
				nominal: parseFloat(nominal),
				real: parseFloat(real)
			};
		});

		fullData = data;

		// Populate latest estimate
		const latest = data[data.length - 1];
		const latestDate = new Date(latest.date + 'T12:00:00Z');
		const months = ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'];
		const monthYear = months[latestDate.getUTCMonth()] + ' ' + latestDate.getUTCFullYear();
		const billions = latest.nominal.toLocaleString(undefined, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		});
		document.getElementById('estimate-value').textContent = monthYear + ': $' + billions + 'B';

		// Calculate actual file size from fetched data
		const fileBytes = new Blob([csv]).size;
		const fileKb = (fileBytes / 1024).toFixed(0);
		document.getElementById('file-meta').textContent = ' · ' + fileKb + ' KB';

		const ctx = document.getElementById('lineChart').getContext('2d');

		const tc = getThemeColors();
		chart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: data.map(d => d.date),
				datasets: [
					{
						label: 'Nominal GDP',
						data: data.map(d => d.nominal),
						borderColor: chartColor.border,
						backgroundColor: `rgba(255, 47, 47, ${getChartFillAlpha()})`,
						pointBackgroundColor: chartColor.border,
						pointHoverBackgroundColor: chartColor.border,
						borderWidth: 1.5,
						pointRadius: 1,
						pointHoverRadius: 4,
						fill: true,
						tension: 0.1
					}
				]
			},
			plugins: [lastValuePlugin],
			options: {
				responsive: true,
				maintainAspectRatio: true,
				layout: {
					padding: {
						right: 48,
						top: 15
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
						displayColors: false,
						callbacks: {
							title: formatTooltipTitle,
							label: function(context) {
								const value = '$' + context.parsed.y.toLocaleString(undefined, {
									minimumFractionDigits: 1,
									maximumFractionDigits: 1
								}) + 'B';
								return context.dataset.label + ': ' + value;
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
							font: { size: 10, family: FONT_BODY },
							color: tc.axisText,
							callback: formatTickLabel,
							maxRotation: 0,
							minRotation: 0,
							autoSkipPadding: 12
						}
					},
					y: {
						min: 0,
						border: { display: false },
						grid: { color: tc.grid },
						ticks: {
							font: { size: 10, family: FONT_BODY },
							color: tc.axisText,
							callback: function(value) {
								return '$' + (value / 1000).toFixed(0) + 'T';
							}
						},
						title: { display: false }
					}
				}
			}
		});

		// Set up toggle button handlers
		document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
			btn.addEventListener('click', () => switchSeries(btn.dataset.series));
		});
	} catch (error) {
		console.error('Error loading chart:', error);
	}
}

// Update chart colors after theme toggle
function refreshChartColors() {
	const tc = getThemeColors();
	if (chart) {
		chart.options.scales.x.ticks.color = tc.axisText;
		chart.options.scales.y.ticks.color = tc.axisText;
		chart.options.scales.y.grid.color = tc.grid;
		chart.options.plugins.tooltip.backgroundColor = tc.tooltipBg;
		chart.data.datasets[0].backgroundColor = `rgba(255, 47, 47, ${getChartFillAlpha()})`;
		chart.update();
	}
	if (comparisonChart) {
		const textDark = getComputedStyle(document.documentElement).getPropertyValue('--color-text-dark').trim();
		const textGray = getComputedStyle(document.documentElement).getPropertyValue('--color-text-medium').trim();
		comparisonChart.options.plugins.title.color = textDark;
		comparisonChart.options.plugins.legend.labels.color = tc.axisText;
		comparisonChart.options.scales.x.ticks.color = tc.axisText;
		comparisonChart.options.scales.y.ticks.color = tc.axisText;
		comparisonChart.options.scales.y.grid.color = tc.grid;
		comparisonChart.options.plugins.tooltip.backgroundColor = tc.tooltipBg;
		comparisonChart.data.datasets[0].borderColor = textGray;
		comparisonChart.update();
	}
}

init();

// Fetch and display last updated date
fetch('files/gdpm_updated.txt')
	.then(r => r.text())
	.then(t => {
		const dateStr = t.trim().split(' ')[0];
		const date = new Date(dateStr + 'T12:00:00Z');
		const longFormatted = date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
		document.getElementById('estimate-asof').textContent = longFormatted;
	})
	.catch(() => {
		document.getElementById('estimate-asof').textContent = 'recently';
	});

// Nowcast region plugin for comparison chart
const nowcastPlugin = {
	id: 'nowcastRegion',
	beforeDraw(chart) {
		const ctx = chart.ctx;
		const { top, bottom, right } = chart.chartArea;
		const meta = chart.getDatasetMeta(1);
		const len = meta.data.length;
		if (len < 3) return;
		const startX = meta.data[len - 3].x;
		const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

		ctx.save();
		ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
		ctx.fillRect(startX, top, right - startX, bottom - top);

		ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
		ctx.setLineDash([4, 3]);
		ctx.beginPath();
		ctx.moveTo(startX, top);
		ctx.lineTo(startX, bottom);
		ctx.stroke();
		ctx.restore();
	},
	afterDraw(chart) {
		const ctx = chart.ctx;
		const { bottom, right } = chart.chartArea;
		const meta = chart.getDatasetMeta(1);
		const len = meta.data.length;
		if (len < 3) return;
		const startX = meta.data[len - 3].x;
		const centerX = (startX + right) / 2;

		ctx.save();
		ctx.font = `10px ${FONT_BODY}`;
		ctx.fillStyle = getThemeColors().axisText;
		ctx.textAlign = 'center';
		ctx.fillText('Nowcast', centerX, bottom - 8);
		ctx.restore();
	}
};

// Comparison chart: quarterly vs monthly GDP
async function initComparisonChart() {
	try {
		// Load both CSV files
		const [monthlyRes, quarterlyRes] = await Promise.all([
			fetch('files/gdpm.csv'),
			fetch('files/gdpq.csv')
		]);

		if (!monthlyRes.ok || !quarterlyRes.ok) {
			throw new Error('Failed to load data files');
		}

		const [monthlyCsv, quarterlyCsv] = await Promise.all([
			monthlyRes.text(),
			quarterlyRes.text()
		]);

		// Parse quarterly CSV (original dates at start of quarter, published data only)
		const quarterlyLines = quarterlyCsv.trim().split('\n');
		const quarterlyData = quarterlyLines.slice(1).map(line => {
			const [date, nominal] = line.split(',');
			return { date, nominal: parseFloat(nominal) };
		});

		// Get start date from first quarterly data point
		const startDate = quarterlyData[0].date;

		// Parse monthly CSV and filter from start date
		const monthlyLines = monthlyCsv.trim().split('\n');
		const monthlyData = monthlyLines.slice(1).map(line => {
			const [date, nominal] = line.split(',');
			return { date, nominal: parseFloat(nominal) };
		});
		const monthlyFiltered = monthlyData.filter(d => d.date >= startDate);

		// Create quarterly map for lookup
		const quarterlyMap = new Map();
		quarterlyData.forEach(q => {
			quarterlyMap.set(q.date, q.nominal);
		});

		// Align quarterly to monthly dates with forward-fill
		// Quarterly values appear at start of quarter and extend forward
		let lastQuarterlyValue = null;
		const quarterlyAligned = monthlyFiltered.map(m => {
			if (quarterlyMap.has(m.date)) {
				lastQuarterlyValue = quarterlyMap.get(m.date);
			}
			return lastQuarterlyValue;
		});

		const ctx = document.getElementById('comparisonChart').getContext('2d');
		const tc2 = getThemeColors();

		comparisonChart = new Chart(ctx, {
			type: 'line',
			plugins: [nowcastPlugin],
			data: {
				labels: monthlyFiltered.map(d => d.date),
				datasets: [
					{
						label: 'Quarterly GDP',
						data: quarterlyAligned,
						borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-text-medium').trim() || '#555',
						backgroundColor: 'transparent',
						borderWidth: 2.5,
						pointRadius: 0,
						pointStyle: 'line',
						stepped: 'before',
						order: 2
					},
					{
						label: 'Monthly GDP',
						data: monthlyFiltered.map(d => d.nominal),
						borderColor: chartColor.border,
						backgroundColor: 'transparent',
						borderWidth: 2.5,
						pointRadius: 0,
						pointStyle: 'line',
						tension: 0.1,
						order: 1
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: true,
				aspectRatio: 1.4,
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins: {
					title: {
						display: true,
						text: 'Monthly GDP vs. Quarterly GDP',
						font: { size: 16, family: FONT_UI, weight: '600' },
						color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-dark').trim(),
						padding: { bottom: 10 }
					},
					legend: {
						display: true,
						position: 'bottom',
						labels: {
							usePointStyle: true,
							pointStyle: 'line',
							padding: 15,
							font: { size: 12, family: FONT_BODY },
							color: tc2.axisText
						}
					},
					tooltip: {
						enabled: true,
						backgroundColor: tc2.tooltipBg,
						titleFont: { size: 12, family: FONT_UI },
						bodyFont: { size: 11, family: FONT_BODY },
						padding: 8,
						cornerRadius: 2,
						usePointStyle: true,
						callbacks: {
							title: formatTooltipTitleWithQuarter,
							label: function(context) {
								if (context.parsed.y === null) return null;
								const value = '$' + context.parsed.y.toLocaleString(undefined, {
									minimumFractionDigits: 0,
									maximumFractionDigits: 0
								}) + 'B';
								return context.dataset.label + ': ' + value;
							}
						}
					}
				},
				scales: {
					x: {
						type: 'category',
						grid: { display: false },
						ticks: {
							font: { size: 10, family: FONT_BODY },
							color: tc2.axisText,
							autoSkip: false,
							maxRotation: 0,
							minRotation: 0,
							callback: function(value, index) {
								const dateStr = this.getLabelForValue(value);
								if (!dateStr) return '';
								const date = new Date(dateStr);
								const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
									'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
								// Show label for each quarter (Jan, Apr, Jul, Oct)
								if (date.getUTCMonth() % 3 === 0) {
									return months[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
								}
								return '';
							}
						}
					},
					y: {
						border: { display: false },
						grid: { color: tc2.grid },
						ticks: {
							font: { size: 10, family: FONT_BODY },
							color: tc2.axisText,
							callback: function(value) {
								return '$' + (value / 1000).toFixed(1) + 'T';
							}
						}
					}
				}
			}
		});
	} catch (error) {
		console.error('Error loading comparison chart:', error);
	}
}

initComparisonChart();
