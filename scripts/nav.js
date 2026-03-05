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
