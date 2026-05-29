function responsiveNav() {
	const menu = document.getElementById("menu");
	const button = document.querySelector(".icon button");
	menu.classList.toggle("responsive");
	const expanded = menu.classList.contains("responsive");
	button.setAttribute("aria-expanded", expanded);
}
document.addEventListener("click", function(e) {
	const menu = document.getElementById("menu");
	if (!menu.classList.contains("responsive")) return;
	if (!e.target.closest("nav")) {
		menu.classList.remove("responsive");
		document.querySelector(".icon button").setAttribute("aria-expanded", "false");
	}
});
function toggleTheme() {
	const current = document.documentElement.getAttribute('data-theme');
	const next = current === 'dark' ? 'light' : 'dark';
	document.documentElement.setAttribute('data-theme', next);
	localStorage.setItem('theme', next);
	updateThemeIcon();
	if (typeof refreshChartColors === 'function') refreshChartColors();
}
const moonSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const sunSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m9.32 9.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.73-12.73-1.41 1.41"/></svg>';
function updateThemeIcon() {
	const icon = document.getElementById('theme-icon');
	if (!icon) return;
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	icon.innerHTML = isDark ? sunSvg : moonSvg;
}
updateThemeIcon();

// Subfooter: sibling navigation
const subfooterHubs = {
	guides: {
		label: 'All Guides',
		href: 'python.html',
		pages: [
			{ href: 'imfapi1.html', label: 'IMF API' },
			{ href: 'blsapi.html', label: 'BLS API' },
			{ href: 'beaapi.html', label: 'BEA API' },
			{ href: 'censusapi.html', label: 'Census API' },
			{ href: 'treasuryapi.html', label: 'Treasury API' },
			{ href: 'cps.html', label: 'CPS Microdata' }
		]
	},
	reports: {
		label: 'All Reports',
		href: 'reports.html',
		pages: [
			{ href: 'chartbook.html', label: 'US Chartbook' },
			{ href: 'indicators.html', label: 'Economic Indicators' },
			{ href: 'gdpm.html', label: 'Monthly GDP' },
			{ href: 'imfweo.html', label: 'IMF WEO' },
			{ href: 'calendar.html', label: 'Data Calendar' }
		]
	}
};
(function initSubfooter() {
	const el = document.querySelector('.subfooter');
	if (!el) return;
	const hubKey = el.dataset.hub;
	const current = el.dataset.current;
	const hub = subfooterHubs[hubKey];
	if (!hub) return;

	const hubLink = document.createElement('p');
	hubLink.className = 'subfooter-hub';
	hubLink.innerHTML = `<a href="${hub.href}">&larr; ${hub.label}</a>`;
	el.appendChild(hubLink);

	const siblings = document.createElement('div');
	siblings.className = 'subfooter-siblings';
	hub.pages.forEach(function(page) {
		const a = document.createElement('a');
		a.href = page.href;
		a.textContent = page.label;
		if (page.href === current) {
			a.classList.add('current');
			a.setAttribute('aria-current', 'page');
		}
		siblings.appendChild(a);
	});
	el.appendChild(siblings);
})();

// Tutorial share button (copy link)
document.querySelectorAll('.tutorial-share').forEach(function(btn) {
	btn.addEventListener('click', function() {
		const label = btn.querySelector('.share-label');
		navigator.clipboard.writeText(window.location.href).then(function() {
			const origSVG = btn.querySelector('svg').outerHTML;
			const origText = label.textContent;
			btn.querySelector('svg').outerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
			label.textContent = 'Copied!';
			btn.title = 'Copied!';
			setTimeout(function() {
				btn.querySelector('svg').outerHTML = origSVG;
				label.textContent = origText;
				btn.title = 'Copy link';
			}, 1500);
		});
	});
});

// Copy-code button on every <pre><code> block (tutorials, blog posts).
// No-op on browsers without clipboard support; no-op on <pre> blocks
// that don't contain a <code> (e.g., output cells in tutorials).
(function initCodeCopy() {
	if (!navigator.clipboard) return;
	const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
	const CHECK_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
	const idle = COPY_ICON + '<span class="code-copy-feedback" aria-live="polite"></span>';
	const done = CHECK_ICON + '<span class="code-copy-feedback" aria-live="polite">Copied</span>';
	document.querySelectorAll('pre').forEach(function(pre) {
		const code = pre.querySelector('code');
		if (!code) return;
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'code-copy';
		btn.setAttribute('aria-label', 'Copy code to clipboard');
		btn.innerHTML = idle;
		pre.appendChild(btn);
		btn.addEventListener('click', function() {
			navigator.clipboard.writeText(code.textContent).then(function() {
				btn.classList.add('is-copied');
				btn.innerHTML = done;
				setTimeout(function() {
					btn.classList.remove('is-copied');
					btn.innerHTML = idle;
				}, 1500);
			}).catch(function(err) {
				console.warn('Copy failed:', err);
			});
		});
	});
})();
