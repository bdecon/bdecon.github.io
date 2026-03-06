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
function updateThemeIcon() {
	const icon = document.getElementById('theme-icon');
	if (!icon) return;
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	icon.className = isDark ? 'fa fa-sun-o' : 'fa fa-moon-o';
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
			{ href: 'imfweo.html', label: 'IMF WEO' }
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
