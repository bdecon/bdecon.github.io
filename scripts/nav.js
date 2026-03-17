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
			{ href: 'calendar.html', label: 'Release Calendar' }
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
