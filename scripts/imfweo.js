(function() {
	'use strict';

	// --- State ---
	let DATA = null;
	let chart = null;
	let currentISO = 'USA';
	let currentIndicator = 'NGDP_RPCH';
	let yearMin = 2010;
	let yearMax = 2030;

	// Extended history (1990–2002 vintages, 3 indicators only)
	const EXTENDED_INDICATORS = new Set(['NGDP_RPCH', 'PCPIPCH', 'BCA_NGDPD']);
	let extData = null;       // raw extended JSON (cached after first fetch)
	let extMerged = false;    // whether extended data has been merged into DATA
	let extActive = false;    // whether extended view is currently shown
	const YEAR_MIN_DEFAULT = 2010;
	const YEAR_MIN_EXTENDED = 1990;
	const YEAR_MIN_RECENT = 2022;
	let recentActive = false;

	// --- Horizon styles (matching vintage_dots.py) ---
	function isDark() {
		return document.documentElement.getAttribute('data-theme') === 'dark';
	}

	function horizonColor(h) {
		const t = Math.min((h - 1) / 4, 1);
		if (isDark()) {
			// Bright cyan-blue gradient that reads on dark backgrounds
			const r = Math.round(80 + t * 40);    // 80 → 120
			const g = Math.round(160 + t * (-30)); // 160 → 130
			const b = Math.round(255 + t * (-40)); // 255 → 215
			return `rgb(${r},${g},${b})`;
		}
		// Light mode: blue (#0000FF) → dark navy (#01153D)
		const r = Math.round(0 + t * 1);
		const g = Math.round(0 + t * 21);
		const b = Math.round(255 + t * (61 - 255));
		return `rgb(${r},${g},${b})`;
	}

	const HORIZON_ALPHA = {1: 1.0, 2: 0.20, 3: 0.16, 4: 0.12, 5: 0.08};
	const HORIZON_RADIUS = {1: 3.5, 2: 5.0, 3: 6.5, 4: 8.0, 5: 9.5};
	const NC_RADIUS = 5;

	const HORIZON_ALPHA_DARK = {1: 1.0, 2: 0.30, 3: 0.24, 4: 0.18, 5: 0.12};
	function horizonAlpha(h) {
		const table = isDark() ? HORIZON_ALPHA_DARK : HORIZON_ALPHA;
		return table[Math.min(h, 5)];
	}
	function horizonRadius(h) {
		if (h <= 5) return HORIZON_RADIUS[h];
		return 9.5 + (h - 5) * 0.8;
	}

	function ncColor() { return isDark() ? '#c060c0' : '#8b008b'; }

	// Format large numbers for clip annotation
	function fmtClip(v) {
		const a = Math.abs(v), s = v < 0 ? '−' : '';
		if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
		if (a >= 1e4) return s + (a / 1e3).toFixed(0) + 'k';
		if (a >= 100) return s + a.toFixed(0);
		return s + a.toFixed(1);
	}

	// --- Y-axis defaults per indicator ---
	const Y_DEFAULTS = {
		'NGDP_RPCH': [-4, 6],
		'PCPIPCH': [-2, 15],
		'BCA_NGDPD': [-10, 10],
		'GGXWDG_NGDP': [0, 100],
		'GGXCNL_NGDP': [-12, 4],
		'NID_NGDP': [10, 40],
		'NGAP_NPGDP': [-6, 4],
		'GGD_NGDP': [0, 100],
		'GGXONLB_NGDP': [-8, 4],
		'TX_RPCH': [-10, 15],
		'LUR': [0, 12]
	};

	// Hard ceilings: clamp y-axis so extreme outliers (hyperinflation,
	// post-war rebounds) don't make the chart unreadable.  Dots beyond
	// these bounds are clipped by Chart.js; tooltip still shows values.
	const Y_SENSIBLE_MAX = {
		'NGDP_RPCH': [-35, 55],
		'BCA_NGDPD': [-40, 40],
		'PCPIPCH': [-5, 120],
		'GGXWDG_NGDP': [0, 250],
		'GGXCNL_NGDP': [-60, 50],
		'NID_NGDP': [0, 80],
		'NGAP_NPGDP': [-15, 15],
		'LUR': [0, 35]
	};

	// --- Theme colors ---
	function getThemeColors() {
		const style = getComputedStyle(document.documentElement);
		const get = (name) => style.getPropertyValue(name).trim();
		return {
			grid: get('--color-grid') || 'rgba(0, 0, 0, 0.06)',
			axisText: get('--color-axis-text') || '#6a6a6a',
			tooltipBg: get('--color-tooltip-bg') || 'rgba(75, 75, 75, 0.95)',
			textDark: get('--color-text-dark') || '#1e1e1e'
		};
	}

	function latestLineColor() {
		return isDark() ? '#f0f0f0' : '#1a1a2e';
	}

	function worldLineColor() {
		return isDark() ? 'rgba(255,255,255,0.2)' : '#c0c0c0';
	}
	function regionLineColor() {
		return isDark() ? 'rgba(180,140,255,0.35)' : 'rgba(120,80,200,0.45)';
	}

	// --- Dynamic legend swatches (sizes match chart constants) ---
	function updateLegendSwatches() {
		const lc = latestLineColor();
		const nc = ncColor();
		const r1 = horizonRadius(1) * 2;  // diameter in px
		const r5 = horizonRadius(5) * 2;
		const ncD = NC_RADIUS * 2;

		const el = (sel) => document.querySelector(sel);

		// Latest line swatches
		const lineActual = el('.legend-line');
		if (lineActual) Object.assign(lineActual.style, { height: '2px', background: lc });

		const lineDashed = el('.legend-line-dashed');
		if (lineDashed) Object.assign(lineDashed.style, {
			height: '0', borderTop: `2px dashed ${lc}`, background: 'none'
		});

		const lineGray = el('.legend-line-gray');
		if (lineGray) Object.assign(lineGray.style, { height: '2.5px', background: worldLineColor() });

		const lineRegion = el('.legend-line-region');
		if (lineRegion) Object.assign(lineRegion.style, { height: '2.5px', background: regionLineColor() });

		// Forecast dots — h=5, h=3, h=1
		for (const h of [5, 3, 1]) {
			const dot = el('.legend-dot-h' + h);
			if (dot) {
				const d = horizonRadius(h) * 2;
				Object.assign(dot.style, {
					width: d + 'px', height: d + 'px', borderRadius: '50%',
					background: horizonColor(h), opacity: Math.min(horizonAlpha(h) * 2, 1)
				});
			}
		}

		// April nowcast diamond — scale down slightly (CSS looks larger than canvas)
		const ncLegendSize = NC_RADIUS * 1.5;
		const ncDiamond = el('.legend-nc-diamond');
		if (ncDiamond) Object.assign(ncDiamond.style, {
			width: ncLegendSize + 'px', height: ncLegendSize + 'px',
			background: nc, transform: 'rotate(45deg)'
		});

		// October nowcast square
		const ncSquare = el('.legend-nc-square');
		if (ncSquare) Object.assign(ncSquare.style, {
			width: ncLegendSize + 'px', height: ncLegendSize + 'px', background: nc
		});
	}

	// --- Legend toggle (click to show/hide series) ---
	// Maps legend data-toggle keys to dataset label patterns
	const TOGGLE_MAP = {
		actual: ['_actual'],
		forecast: ['_forecast_line'],
		world: ['_world'],
		region: ['_region'],
		cloud_far: ['_cloud_h4', '_cloud_h5', '_cloud_h6', '_cloud_h7', '_cloud_h8'],
		cloud_mid: ['_cloud_h3'],
		cloud_near: ['_cloud_h1', '_cloud_h2'],
		nc_apr: ['_nc_apr'],
		nc_oct: ['_nc_oct']
	};
	const hiddenSeries = new Set(['world', 'region']);

	const GROUP_MAP = {
		latest: ['actual', 'forecast', 'world', 'region'],
		prev: ['cloud_far', 'cloud_mid', 'cloud_near'],
		nc: ['nc_apr', 'nc_oct']
	};

	function initLegendToggle() {
		document.querySelectorAll('.chart-legend-item[data-toggle]').forEach(item => {
			item.addEventListener('click', () => {
				const key = item.dataset.toggle;
				if (hiddenSeries.has(key)) {
					hiddenSeries.delete(key);
					item.classList.remove('legend-off');
				} else {
					hiddenSeries.add(key);
					item.classList.add('legend-off');
				}
				syncGroupHeaders();
				applyLegendToggle();
			});
		});

		document.querySelectorAll('[data-toggle-group]').forEach(header => {
			header.addEventListener('click', () => {
				const group = header.dataset.toggleGroup;
				const keys = GROUP_MAP[group];
				const allHidden = keys.every(k => hiddenSeries.has(k));
				keys.forEach(k => {
					if (allHidden) {
						hiddenSeries.delete(k);
					} else {
						hiddenSeries.add(k);
					}
				});
				// Update individual item classes
				document.querySelectorAll('.chart-legend-item[data-toggle]').forEach(item => {
					item.classList.toggle('legend-off', hiddenSeries.has(item.dataset.toggle));
				});
				syncGroupHeaders();
				applyLegendToggle();
			});
		});
	}

	function syncGroupHeaders() {
		document.querySelectorAll('[data-toggle-group]').forEach(header => {
			const keys = GROUP_MAP[header.dataset.toggleGroup];
			const allHidden = keys.every(k => hiddenSeries.has(k));
			header.classList.toggle('legend-off', allHidden);
		});
	}

	function applyLegendToggle() {
		if (!chart) return;
		for (const [key, labels] of Object.entries(TOGGLE_MAP)) {
			const hidden = hiddenSeries.has(key);
			for (const ds of chart.data.datasets) {
				if (labels.includes(ds.label)) {
					ds.hidden = hidden;
				}
			}
		}
		chart.update('none');
	}

	// --- Tooltip icon helpers (match chart symbols) ---
	function tooltipDotHTML(h) {
		const d = horizonRadius(h) * 2;
		const color = horizonColor(h);
		// On dark tooltip bg, boost alpha for visibility
		const alpha = Math.min(horizonAlpha(h) * 3, 1);
		return `<span class="weo-tooltip-icon" style="width:${d}px;height:${d}px;border-radius:50%;background:${color};opacity:${alpha}"></span>`;
	}

	function tooltipNowcastHTML(isOct) {
		const d = NC_RADIUS * 2;
		const color = isDark() ? '#c060c0' : '#da70d6';  // lighter for dark tooltip bg
		if (isOct) {
			return `<span class="weo-tooltip-icon" style="width:${d}px;height:${d}px;background:${color}"></span>`;
		}
		return `<span class="weo-tooltip-icon" style="width:${d}px;height:${d}px;background:${color};transform:rotate(45deg)"></span>`;
	}

	// --- Data loading ---
	async function loadData() {
		const resp = await fetch('files/imfweo/data.json');
		DATA = await resp.json();
		populateInfoBox();
		initDropdowns();
		initLegendToggle();
		restoreState();
		renderChart();
		updateExtLink();
		// View links are wired in updateViewLinks() via viewLink()
	}

	// --- Extended history ---
	async function loadExtended() {
		if (extData) return extData;
		const resp = await fetch('files/imfweo/data-extended.json');
		extData = await resp.json();
		return extData;
	}

	function mergeExtended() {
		if (extMerged || !extData) return;
		const offset = extData.v.length;

		// Offset all existing vid_idx in main DATA
		for (const iso in DATA.c) {
			const c = DATA.c[iso];
			for (const ind of EXTENDED_INDICATORS) {
				if (!c[ind]) continue;
				for (const dot of c[ind].f) dot[3] += offset;
				for (const dot of c[ind].nc) dot[3] += offset;
			}
		}

		// Prepend extended vintages
		DATA.v = extData.v.concat(DATA.v);

		// Prepend extended dots
		for (const iso in extData.c) {
			if (!DATA.c[iso]) continue;
			const ext = extData.c[iso];
			for (const ind of EXTENDED_INDICATORS) {
				if (!ext[ind]) continue;
				if (!DATA.c[iso][ind]) continue;
				DATA.c[iso][ind].f = ext[ind].f.concat(DATA.c[iso][ind].f);
				if (ext[ind].nc) {
					DATA.c[iso][ind].nc = ext[ind].nc.concat(DATA.c[iso][ind].nc);
				}
			}
		}

		extMerged = true;
	}

	function setView(view) {
		// view: 'default', 'extended', 'recent'
		extActive = view === 'extended';
		recentActive = view === 'recent';
		if (extActive) yearMin = YEAR_MIN_EXTENDED;
		else if (recentActive) yearMin = YEAR_MIN_RECENT;
		else yearMin = YEAR_MIN_DEFAULT;
		updateViewLinks();
		renderChart();
	}

	async function toggleExtended() {
		if (!extActive) {
			const link = document.getElementById('ext-history-link');
			link.textContent = 'Loading…';
			await loadExtended();
			mergeExtended();
			setView('extended');
		} else {
			setView('default');
		}
	}

	function toggleRecent() {
		setView(recentActive ? 'default' : 'recent');
	}

	function viewLink(label, view) {
		const a = document.createElement('a');
		a.href = '#';
		a.textContent = label;
		a.style.fontSize = '11px';
		a.addEventListener('click', async (e) => {
			e.preventDefault();
			if (view === 'extended' && !extMerged) {
				a.textContent = 'Loading…';
				await loadExtended();
				mergeExtended();
			}
			setView(view);
		});
		return a;
	}

	function updateViewLinks() {
		const hasExt = EXTENDED_INDICATORS.has(currentIndicator);

		// Reset if switching to non-extended indicator while in extended mode
		if (!hasExt && extActive) {
			extActive = false;
			yearMin = YEAR_MIN_DEFAULT;
		}

		const currentView = extActive ? 'extended' : recentActive ? 'recent' : 'default';

		const elExt = document.getElementById('view-ext');
		const elSep1 = document.getElementById('view-sep-1');
		const elDefault = document.getElementById('view-default');
		const elSep2 = document.getElementById('view-sep-2');
		const elRecent = document.getElementById('view-recent');
		if (!elExt) return;

		// Clear
		elExt.innerHTML = '';
		elDefault.innerHTML = '';
		elRecent.innerHTML = '';

		// Extended (only for 3 indicators)
		if (hasExt) {
			if (currentView === 'extended') {
				elExt.textContent = '1990–';
			} else {
				elExt.appendChild(viewLink('1990–', 'extended'));
			}
			elSep1.textContent = ' | ';
			elSep1.style.display = '';
		} else {
			elSep1.style.display = 'none';
		}

		// Default
		if (currentView === 'default') {
			elDefault.textContent = '2010–';
		} else {
			elDefault.appendChild(viewLink('2010–', 'default'));
		}

		// Recent
		if (currentView === 'recent') {
			elRecent.textContent = '2022–';
		} else {
			elRecent.appendChild(viewLink('2022–', 'recent'));
		}
	}

	// Keep old name as alias
	const updateExtLink = updateViewLinks;

	function populateInfoBox() {
		const lastV = DATA.v[DATA.v.length - 1];
		const abbr = lastV[0]; // e.g. "Oct"
		const year = lastV[1]; // e.g. 2025
		const FULL = {Jan:'January',Feb:'February',Mar:'March',Apr:'April',
			May:'May',Jun:'June',Jul:'July',Aug:'August',
			Sep:'September',Oct:'October',Nov:'November',Dec:'December'};
		const month = FULL[abbr] || abbr;
		document.getElementById('weo-info-edition').textContent = month + ' ' + year;
		const nextMonth = (abbr === 'Oct' || abbr === 'Sep') ? 'April' : 'October';
		const nextYear = (abbr === 'Oct' || abbr === 'Sep') ? year + 1 : year;
		document.getElementById('weo-info-next').textContent = nextMonth + ' ' + nextYear;
	}

	function updateIndicatorDropdown() {
		const is = document.getElementById('indicator-select');
		const country = DATA.c[currentISO];
		const prev = is.value;
		is.innerHTML = '';
		for (const [code, meta] of Object.entries(DATA.i)) {
			if (!country || country[code]) {
				const opt = document.createElement('option');
				opt.value = code;
				opt.textContent = meta[0];
				is.appendChild(opt);
			}
		}
		// Keep current indicator if still available, otherwise use first
		if (country && country[prev]) {
			is.value = prev;
		} else {
			is.value = is.options[0].value;
			currentIndicator = is.value;
		}
	}

	// --- Country combo box ---
	let countryEntries = []; // [{iso, name}, ...] sorted by name
	let comboIdx = -1;       // keyboard highlight index in filtered list

	function setCountryInput(iso) {
		const ci = document.getElementById('country-input');
		const c = DATA.c[iso];
		if (c) ci.value = c.n;
	}

	function buildComboItems(filter) {
		const list = document.getElementById('country-list');
		list.innerHTML = '';
		comboIdx = -1;
		const q = (filter || '').toLowerCase();
		let matches = countryEntries;
		if (q) matches = countryEntries.filter(e =>
			e.name.toLowerCase().includes(q) || e.iso.toLowerCase().startsWith(q));
		for (const e of matches) {
			const div = document.createElement('div');
			div.className = 'combo-item';
			div.dataset.iso = e.iso;
			if (q) {
				const i = e.name.toLowerCase().indexOf(q);
				if (i >= 0) {
					div.innerHTML = esc(e.name.slice(0, i)) + '<mark>' +
						esc(e.name.slice(i, i + q.length)) + '</mark>' +
						esc(e.name.slice(i + q.length));
				} else {
					div.textContent = e.name;
				}
			} else {
				div.textContent = e.name;
			}
			div.addEventListener('mousedown', (ev) => {
				ev.preventDefault(); // keep focus from leaving input
				selectCountry(e.iso);
			});
			list.appendChild(div);
		}
	}

	function esc(s) {
		const d = document.createElement('span');
		d.textContent = s;
		return d.innerHTML;
	}

	function openCombo() {
		const list = document.getElementById('country-list');
		buildComboItems(document.getElementById('country-input').value);
		list.classList.add('open');
	}

	function closeCombo() {
		document.getElementById('country-list').classList.remove('open');
		comboIdx = -1;
	}

	function selectCountry(iso) {
		currentISO = iso;
		setCountryInput(iso);
		closeCombo();
		updateIndicatorDropdown();
		onSelectionChange();
	}

	function initDropdowns() {
		// Build sorted country list
		countryEntries = Object.entries(DATA.c)
			.map(([iso, c]) => ({iso, name: c.n}))
			.sort((a, b) => a.name.localeCompare(b.name));

		const ci = document.getElementById('country-input');
		const list = document.getElementById('country-list');

		ci.addEventListener('focus', () => {
			ci.select();
			openCombo();
		});

		ci.addEventListener('input', () => {
			buildComboItems(ci.value);
			list.classList.add('open');
		});

		ci.addEventListener('blur', () => {
			// Small delay so mousedown on combo-item fires first
			setTimeout(() => {
				closeCombo();
				setCountryInput(currentISO); // reset to current selection
			}, 150);
		});

		ci.addEventListener('keydown', (e) => {
			const items = list.querySelectorAll('.combo-item');
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				comboIdx = Math.min(comboIdx + 1, items.length - 1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				comboIdx = Math.max(comboIdx - 1, 0);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (comboIdx >= 0 && items[comboIdx]) {
					selectCountry(items[comboIdx].dataset.iso);
				} else if (items.length === 1) {
					selectCountry(items[0].dataset.iso);
				}
				ci.blur();
				return;
			} else if (e.key === 'Escape') {
				closeCombo();
				setCountryInput(currentISO);
				ci.blur();
				return;
			} else {
				return;
			}
			// Update highlight
			items.forEach((el, i) => el.classList.toggle('active', i === comboIdx));
			if (items[comboIdx]) items[comboIdx].scrollIntoView({block: 'nearest'});
		});

		updateIndicatorDropdown();

		document.getElementById('indicator-select').addEventListener('change', () => { currentIndicator = document.getElementById('indicator-select').value; onSelectionChange(); });
	}

	function onSelectionChange() {
		saveState();
		updateExtLink();
		renderChart();
	}

	// --- URL hash + localStorage ---
	function saveState() {
		location.hash = currentISO + '/' + currentIndicator;
		localStorage.setItem('weo_iso', currentISO);
		localStorage.setItem('weo_ind', currentIndicator);
	}

	function restoreState() {
		const hash = location.hash.replace('#', '');
		if (hash && hash.includes('/')) {
			const [iso, ind] = hash.split('/');
			if (DATA.c[iso]) currentISO = iso;
			if (DATA.i[ind]) currentIndicator = ind;
		} else {
			const savedISO = localStorage.getItem('weo_iso');
			const savedInd = localStorage.getItem('weo_ind');
			if (savedISO && DATA.c[savedISO]) currentISO = savedISO;
			if (savedInd && DATA.i[savedInd]) currentIndicator = savedInd;
		}
		setCountryInput(currentISO);
		updateIndicatorDropdown();
		document.getElementById('indicator-select').value = currentIndicator;
	}

	window.addEventListener('hashchange', () => {
		const hash = location.hash.replace('#', '');
		if (hash && hash.includes('/')) {
			const [iso, ind] = hash.split('/');
			if (DATA.c[iso]) currentISO = iso;
			if (DATA.i[ind]) currentIndicator = ind;
			setCountryInput(currentISO);
			updateIndicatorDropdown();
			document.getElementById('indicator-select').value = currentIndicator;
			renderChart();
		}
	});

	// --- Smart y-axis range (matches vintage_dots.py logic) ---
	function niceStep(range) {
		// Smallest step from [1,2,5]×10^n that yields at most 11 ticks
		const mag = Math.pow(10, Math.floor(Math.log10(Math.max(range, 0.1))));
		for (const ns of [0.1, 0.2, 0.5, 1, 2, 5, 10]) {
			const step = ns * mag;
			if (range / step <= 11) return step;
		}
		return mag * 10;
	}

	function computeYRange(allVals, indicator) {
		const defaults = Y_DEFAULTS[indicator] || [-10, 20];
		if (!allVals.length) return { min: defaults[0], max: defaults[1], step: niceStep(defaults[1] - defaults[0]) };

		const dmin = Math.min(...allVals);
		const dmax = Math.max(...allVals);
		const range = dmax - dmin;
		const pad = Math.max(range * 0.04, 0.5);

		let yLo = Math.min(defaults[0], dmin - pad);
		let yHi = Math.max(defaults[1], dmax + pad);
		if (dmin - pad > defaults[0]) yLo = dmin - pad;
		if (dmax + pad < defaults[1]) yHi = dmax + pad;

		// Clamp to sensible max so extreme outliers clip instead of
		// blowing up the axis (e.g. Venezuela hyperinflation)
		const sensible = Y_SENSIBLE_MAX[indicator];
		if (sensible) {
			yLo = Math.max(yLo, sensible[0]);
			yHi = Math.min(yHi, sensible[1]);
		}

		// Snap to integers for clean axis edges (adds at most ~1 unit)
		yLo = Math.floor(yLo);
		yHi = Math.ceil(yHi);

		const step = niceStep(yHi - yLo);

		// Snap bounds to multiples of step so ticks always
		// land on clean values (e.g. step=2 → …, -2, 0, 2, …)
		yLo = Math.floor(yLo / step) * step;
		yHi = Math.ceil(yHi / step) * step;

		// Count values that fall outside the final range
		const nAbove = allVals.filter(v => v > yHi).length;
		const nBelow = allVals.filter(v => v < yLo).length;

		return { min: yLo, max: yHi, step, nAbove, nBelow, dataMax: dmax, dataMin: dmin };
	}

	// --- Build datasets ---
	function buildDatasets() {
		const country = DATA.c[currentISO];
		if (!country || !country[currentIndicator]) return { datasets: [], allVals: [], dataYears: [] };

		const d = country[currentIndicator];
		const world = DATA.w[currentIndicator] || [];
		const lc = latestLineColor();

		const yMin = yearMin;
		const yMax = yearMax;

		const inRange = (y) => y >= yMin && y <= yMax;
		const datasets = [];
		const allVals = [];

		// 1a. World reference line (excluded from allVals — hidden by default,
		//     shouldn't drive the y-axis for the country)
		const worldPts = world.filter(p => inRange(p[0])).map(p => ({x: p[0], y: p[1]}));
		if (worldPts.length) {
			datasets.push({
				type: 'line',
				data: worldPts,
				borderColor: worldLineColor(),
				borderWidth: 2.5,
				pointRadius: 0,
				pointHoverRadius: 0,
				fill: false,
				order: 10,
				label: '_world'
			});
		}

		// 1b. Regional reference line (excluded from allVals — hidden by default)
		const regionISO = country.r;
		const regionData = regionISO && DATA.r && DATA.r[regionISO];
		const regionSeries = regionData && regionData[currentIndicator];
		if (regionSeries) {
			const regionPts = regionSeries.filter(p => inRange(p[0])).map(p => ({x: p[0], y: p[1]}));
			if (regionPts.length) {
				datasets.push({
					type: 'line',
					data: regionPts,
					borderColor: regionLineColor(),
					borderWidth: 2.5,
					pointRadius: 0,
					pointHoverRadius: 0,
					fill: false,
					order: 10,
					label: '_region'
				});
			}
		}

		// 2. Forecast cloud — one dataset per horizon (h=8 down to h=1)
		for (let h = 8; h >= 1; h--) {
			const pts = d.f.filter(p => p[2] === h && inRange(p[0]))
				.map(p => ({x: p[0], y: p[1], vid: p[3]}));
			if (!pts.length) continue;
			pts.forEach(p => allVals.push(p.y));

			const alpha = horizonAlpha(h);
			const color = horizonColor(h);
			const r = horizonRadius(h);

			datasets.push({
				type: 'scatter',
				data: pts,
				backgroundColor: color,
				borderColor: h === 1 ? (isDark() ? 'rgba(200,200,200,0.3)' : 'rgba(232,232,232,1)') : 'transparent',
				borderWidth: h === 1 ? 0.5 : 0,
				pointRadius: r,
				pointHoverRadius: r + 1.5,
				order: 9 - h,
				label: '_cloud_h' + h,
				_horizon: h,
				_alpha: alpha
			});
		}

		// 3. Nowcasts
		const ncApr = d.nc.filter(p => p[2] === 0 && inRange(p[0]))
			.map(p => ({x: p[0], y: p[1], vid: p[3]}));
		const ncOct = d.nc.filter(p => p[2] === 1 && inRange(p[0]))
			.map(p => ({x: p[0], y: p[1], vid: p[3]}));
		if (ncApr.length) {
			ncApr.forEach(p => allVals.push(p.y));
			datasets.push({
				type: 'scatter',
				data: ncApr,
				backgroundColor: ncColor(),
				borderColor: isDark() ? 'rgba(200,200,200,0.3)' : 'rgba(232,232,232,1)',
				borderWidth: 0.5,
				pointRadius: NC_RADIUS,
				pointHoverRadius: NC_RADIUS * 1.5,
				pointStyle: 'rectRot',
				order: 2,
				label: '_nc_apr'
			});
		}
		if (ncOct.length) {
			ncOct.forEach(p => allVals.push(p.y));
			datasets.push({
				type: 'scatter',
				data: ncOct,
				backgroundColor: ncColor(),
				borderColor: isDark() ? 'rgba(200,200,200,0.3)' : 'rgba(232,232,232,1)',
				borderWidth: 0.5,
				pointRadius: NC_RADIUS,
				pointHoverRadius: NC_RADIUS * 1.5,
				pointStyle: 'rect',
				order: 2,
				label: '_nc_oct'
			});
		}

		// 4. Latest vintage — actuals (solid) + forecasts (dashed)
		const actPts = d.a.filter(p => inRange(p[0])).map(p => ({x: p[0], y: p[1]}));
		const fcPts = d.p.filter(p => inRange(p[0])).map(p => ({x: p[0], y: p[1]}));

		if (actPts.length) {
			actPts.forEach(p => allVals.push(p.y));
			datasets.push({
				type: 'line',
				data: actPts,
				borderColor: lc,
				borderWidth: 2,
				pointRadius: 0,
				pointHoverRadius: 3,
				fill: false,
				order: 1,
				label: '_actual',
				tension: 0
			});
		}
		if (fcPts.length) {
			// Connect from last actual
			const fLine = [];
			if (actPts.length) fLine.push(actPts[actPts.length - 1]);
			fLine.push(...fcPts);
			fcPts.forEach(p => allVals.push(p.y));
			datasets.push({
				type: 'line',
				data: fLine,
				borderColor: lc,
				borderWidth: 2,
				borderDash: [4, 3],
				pointRadius: 0,
				pointHoverRadius: 3,
				fill: false,
				order: 1,
				label: '_forecast_line',
				tension: 0
			});
		}

		return { datasets, allVals, yMin, yMax };
	}

	// --- Render chart ---
	function renderChart() {
		if (!DATA) return;
		updateLegendSwatches();

		const country = DATA.c[currentISO];
		const indMeta = DATA.i[currentIndicator];
		const countryName = country ? country.n : currentISO;

		document.getElementById('chart-title').textContent = countryName;
		const indLabel = indMeta ? indMeta[0] : '';
		const indUnits = indMeta ? indMeta[1] : '';
		document.getElementById('chart-indicator').innerHTML = `<strong>${indLabel}</strong>` + (indUnits ? ', ' + indUnits.toLowerCase() : '');
		document.getElementById('chart-units').textContent = '';
		const lastV = DATA.v[DATA.v.length - 1];
		document.getElementById('legend-latest-header').textContent = lastV[0] + ' ' + lastV[1] + ' WEO';

		// Update region legend label
		const regionISO = country ? country.r : null;
		const regionInfo = regionISO && DATA.r && DATA.r[regionISO];
		const regionEl = document.getElementById('legend-region');
		const regionNameEl = document.getElementById('legend-region-name');
		if (regionInfo && regionInfo[currentIndicator]) {
			regionNameEl.textContent = regionInfo.n;
			regionEl.style.display = '';
		} else {
			regionEl.style.display = 'none';
		}

		if (!country || !country[currentIndicator]) {
			if (chart) { chart.destroy(); chart = null; }
			document.getElementById('chart-title').textContent = countryName + ' — No data';
			return;
		}

		const { datasets, allVals, yMin, yMax } = buildDatasets();
		const yRange = computeYRange(allVals, currentIndicator);
		const tc = getThemeColors();

		// Apply per-dataset alpha via plugin
		for (const ds of datasets) {
			if (ds._alpha !== undefined) {
				const a = ds._alpha;
				const base = ds.backgroundColor;
				// Parse rgb and add alpha
				const m = base.match(/rgb\((\d+),(\d+),(\d+)\)/);
				if (m) {
					ds.backgroundColor = `rgba(${m[1]},${m[2]},${m[3]},${a})`;
				}
			}
		}

		const config = {
			type: 'scatter',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: true,
				aspectRatio: window.innerWidth <= 760 ? 0.95 : 1.15,
				animation: { duration: 0 },
				interaction: {
					mode: 'nearest',
					intersect: false,
					axis: 'x'
				},
				layout: { padding: { top: 10, right: 5, bottom: 0, left: 2 } },
				scales: {
					x: {
						type: 'linear',
						min: yMin - 0.5,
						max: yMax + 0.5,
						afterBuildTicks: (axis) => {
							const ticks = [];
							// Label: first year, every 5/0, and last year if ≥2 from last labeled
							const labeled = [yMin];
							for (let y = yMin + 1; y < yMax; y++) {
								if (y % 5 === 0) labeled.push(y);
							}
							// Add last year only if ≥2 past the last labeled tick
							const lastLabeled = labeled[labeled.length - 1];
							if (yMax - lastLabeled >= 2) labeled.push(yMax);
							for (const y of labeled) {
								ticks.push({ value: y });
							}
							axis.ticks = ticks;
						},
						ticks: {
							color: tc.axisText,
							font: { size: 13 },
							callback: (v) => v.toString()
						},
						grid: {
							color: tc.grid,
							lineWidth: 0.5
						},
						border: { display: false }
					},
					y: {
						min: yRange.min,
						max: yRange.max,
						ticks: {
							stepSize: yRange.step,
							display: false
						},
						grid: {
							color: tc.grid,
							lineWidth: 0.5
						},
						border: { display: false }
					}
				},
				plugins: {
					legend: { display: false },
					tooltip: { enabled: false },
					_clipInfo: (yRange.nAbove || yRange.nBelow) ? {
						nAbove: yRange.nAbove, nBelow: yRange.nBelow,
						dataMax: yRange.dataMax, dataMin: yRange.dataMin
					} : null
				},
				onHover: null
			},
			plugins: [vintageLinePlugin, yLabelPlugin, zeroLinePlugin, clipAnnotationPlugin]
		};

		if (chart) {
			chart.destroy();
		}
		const ctx = document.getElementById('weoChart').getContext('2d');
		chart = new Chart(ctx, config);
		applyLegendToggle();
	}

	// --- Zero line plugin ---
	// Plugin: draw y-axis labels above each gridline (WSJ style)
	const yLabelPlugin = {
		id: 'yLabelsAboveTick',
		afterDraw(chart) {
			const yScale = chart.scales.y;
			const ctx = chart.ctx;
			const tc = getThemeColors();
			ctx.save();
			ctx.font = '12px system-ui, -apple-system, sans-serif';
			ctx.fillStyle = tc.axisText;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'bottom';
			const left = chart.chartArea.left - 3;
			for (const tick of yScale.ticks) {
				const v = tick.value;
				const py = yScale.getPixelForValue(v);
				// Skip if label would render above the canvas
				if (py < chart.chartArea.top + 2) continue;
				let label;
				if (Math.abs(v) >= 1000) label = (v / 1000) + 'k';
				else label = String(parseFloat(v.toPrecision(10)));
				ctx.fillText(label, left, py - 2);
			}
			ctx.restore();
		}
	};

	// Plugin: thin lines connecting dots from the same vintage
	const vintageLinePlugin = {
		id: 'vintageLines',
		beforeDatasetsDraw(chart) {
			const ctx = chart.ctx;
			const xScale = chart.scales.x;
			const yScale = chart.scales.y;

			// Skip entirely if all cloud datasets are hidden
			const anyCloudVisible = chart.data.datasets.some(ds =>
				ds.label && ds.label.startsWith('_cloud_h') && !ds.hidden
			);
			if (!anyCloudVisible) return;

			// Collect all cloud + nowcast points grouped by vid
			const byVid = {};
			for (const ds of chart.data.datasets) {
				if (!ds.label || (!ds.label.startsWith('_cloud_h') && !ds.label.startsWith('_nc_'))) continue;
				const dsIndex = chart.data.datasets.indexOf(ds);
				const meta = chart.getDatasetMeta(dsIndex);
				if (meta.hidden) continue;
				for (const pt of ds.data) {
					if (pt.vid == null) continue;
					(byVid[pt.vid] ||= []).push(pt);
				}
			}

			ctx.save();
			ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
			ctx.lineWidth = 0.7;
			const area = chart.chartArea;

			for (const vid in byVid) {
				const pts = byVid[vid].sort((a, b) => a.x - b.x);
				if (pts.length < 2) continue;
				ctx.beginPath();
				let started = false;
				for (const p of pts) {
					const px = xScale.getPixelForValue(p.x);
					const py = yScale.getPixelForValue(p.y);
					if (px < area.left || px > area.right || py < area.top || py > area.bottom) {
						started = false;
						continue;
					}
					if (!started) { ctx.moveTo(px, py); started = true; }
					else ctx.lineTo(px, py);
				}
				ctx.stroke();
			}

			ctx.restore();
		}
	};

	const zeroLinePlugin = {
		id: 'zeroLine',
		afterDraw(chart) {
			const yScale = chart.scales.y;
			if (yScale.min <= 0 && yScale.max >= 0) {
				const ctx = chart.ctx;
				const y = yScale.getPixelForValue(0);
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(chart.chartArea.left, y);
				ctx.lineTo(chart.chartArea.right, y);
				ctx.strokeStyle = '#999';
				ctx.lineWidth = 0.5;
				ctx.stroke();
				ctx.restore();
			}
		}
	};

	// --- Clip annotation plugin: shows when dots are beyond the y-axis ---
	const clipAnnotationPlugin = {
		id: 'clipAnnotation',
		afterDraw(chart) {
			const info = chart.options.plugins._clipInfo;
			if (!info || (!info.nAbove && !info.nBelow)) return;
			const ctx = chart.ctx;
			const area = chart.chartArea;
			const tc = getThemeColors();
			ctx.save();
			ctx.font = '10px system-ui, -apple-system, sans-serif';
			ctx.fillStyle = tc.axisText;
			ctx.textAlign = 'right';
			if (info.nAbove) {
				ctx.textBaseline = 'top';
				ctx.fillText('\u25B2 ' + info.nAbove + ' off-chart (max ' + fmtClip(info.dataMax) + ')', area.right, area.top + 2);
			}
			if (info.nBelow) {
				ctx.textBaseline = 'bottom';
				ctx.fillText('\u25BC ' + info.nBelow + ' off-chart (min ' + fmtClip(info.dataMin) + ')', area.right, area.bottom - 2);
			}
			ctx.restore();
		}
	};

	// --- Tooltip ---
	const tooltip = document.getElementById('weo-tooltip');
	let tooltipYear = null;

	function handleHover(evt, elements) {
		if (!chart || !chart.scales || !chart.scales.x) return;
		const nativeEvt = evt.native || evt;
		if (!nativeEvt) return;

		// Get canvas-relative coordinates
		const canvas = document.getElementById('weoChart');
		const canvasRect = canvas.getBoundingClientRect();
		const cx = (nativeEvt.clientX || (nativeEvt.touches && nativeEvt.touches[0].clientX)) - canvasRect.left;
		const cy = (nativeEvt.clientY || (nativeEvt.touches && nativeEvt.touches[0].clientY)) - canvasRect.top;

		// Check if cursor is within the chart area
		const chartArea = chart.chartArea;
		if (!chartArea || cx < chartArea.left || cx > chartArea.right || cy < chartArea.top || cy > chartArea.bottom) {
			tooltip.classList.remove('visible');
			tooltipYear = null;
			return;
		}

		const xVal = chart.scales.x.getValueForPixel(cx);
		const year = Math.round(xVal);

		if (year === tooltipYear) return;
		tooltipYear = year;

		const country = DATA.c[currentISO];
		const d = country[currentIndicator];
		const vintages = DATA.v;
		const indMeta = DATA.i[currentIndicator];

		// Forecasts for this year (chronological)
		const history = d.f
			.filter(p => p[0] === year)
			.map(p => ({ vid: p[3], val: p[1], h: p[2] }))
			.sort((a, b) => a.vid - b.vid);

		// Nowcasts for this year
		const ncs = d.nc
			.filter(p => p[0] === year)
			.map(p => ({ val: p[1], isOct: p[2] }))
			.sort((a, b) => a.isOct - b.isOct); // Apr first, then Oct

		// Latest value
		const latestAct = d.a.find(p => p[0] === year);
		const latestFc = d.p.find(p => p[0] === year);
		const latestVal = latestAct || latestFc;
		const latestLabel = latestAct ? 'Actual' : 'Forecast';

		if (!history.length && !ncs.length && !latestVal) {
			tooltip.classList.remove('visible');
			return;
		}

		let html = `<div class="weo-tooltip-header">${year} &mdash; ${indMeta[0]}</div>`;

		// Always-visible: latest value + nowcasts
		if (latestVal) {
			const lastV = vintages[vintages.length - 1];
			html += `<div class="weo-tooltip-latest">${lastV[0]} ${lastV[1]} (${latestLabel}): ${latestVal[1].toFixed(2)}</div>`;
		}
		if (ncs.length) {
			for (const nc of ncs) {
				const label = nc.isOct ? 'Oct nowcast' : 'Apr nowcast';
				html += `<div class="weo-tooltip-row"><span>${tooltipNowcastHTML(nc.isOct)}${label}</span><span>${nc.val.toFixed(2)}</span></div>`;
			}
		}

		// Scrollable: forecast history
		if (history.length) {
			html += '<div class="weo-tooltip-list">';
			for (const entry of history) {
				const v = vintages[entry.vid];
				html += `<div class="weo-tooltip-row"><span>${tooltipDotHTML(entry.h)}${v[0]} ${v[1]}</span><span>${entry.val.toFixed(2)}</span></div>`;
			}
			html += '</div>';
		}

		tooltip.innerHTML = html;
		tooltip.classList.add('visible');

		// Position tooltip relative to chart-container using page coordinates
		const containerRect = document.querySelector('.chart-container').getBoundingClientRect();
		const pageX = nativeEvt.clientX || (nativeEvt.touches && nativeEvt.touches[0].clientX);
		const pageY = nativeEvt.clientY || (nativeEvt.touches && nativeEvt.touches[0].clientY);
		let left = pageX - containerRect.left + 15;
		let top = pageY - containerRect.top - 20;

		// Keep in viewport
		const tw = tooltip.offsetWidth;
		const th = tooltip.offsetHeight;
		if (left + tw > containerRect.width - 5) left = pageX - containerRect.left - tw - 15;
		if (top + th > containerRect.height) top = containerRect.height - th - 5;
		if (top < 0) top = 5;

		tooltip.style.left = left + 'px';
		tooltip.style.top = top + 'px';
	}

	// Attach hover/touch to canvas directly for reliable triggering
	const weoCanvas = document.getElementById('weoChart');
	weoCanvas.addEventListener('mousemove', (e) => { if (chart) handleHover(e, [1]); });
	weoCanvas.addEventListener('touchmove', (e) => { if (chart) handleHover(e, [1]); }, { passive: true });
	weoCanvas.addEventListener('mouseleave', () => {
		tooltip.classList.remove('visible');
		tooltipYear = null;
	});

	// --- Theme refresh ---
	window.refreshChartColors = function() {
		renderChart();
	};

	// --- Init ---
	loadData();
})();
