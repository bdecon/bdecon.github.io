/* Site search — lazy-loaded Pagefind UI.
   Called from the nav search button. Loads /pagefind/pagefind-ui.{css,js}
   on first open, then initializes the UI once. Subsequent opens just
   reopen the existing dialog.

   Also wires the `/` keyboard shortcut (Wikipedia-style) — press / from
   anywhere to open search, Esc to close. Ignored when focus is in an
   input/textarea so it doesn't hijack typing.
*/
(function() {
	'use strict';
	var dialog = null;
	var initialized = false;

	function ensureLoaded() {
		return new Promise(function(resolve, reject) {
			if (window.PagefindUI) return resolve();
			// Inject CSS
			var link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = '/pagefind/pagefind-ui.css';
			document.head.appendChild(link);
			// Inject JS
			var s = document.createElement('script');
			s.src = '/pagefind/pagefind-ui.js';
			s.onload = function() { resolve(); };
			s.onerror = function() { reject(new Error('pagefind failed to load')); };
			document.head.appendChild(s);
		});
	}

	function init() {
		if (initialized) return;
		initialized = true;
		new window.PagefindUI({
			element: '#search-ui',
			showImages: false,
			showSubResults: true,
			resetStyles: false,
			translations: {
				placeholder: 'Search posts, charts, guides…',
				zero_results: 'No matches for [SEARCH_TERM]'
			}
		});
	}

	window.openSearch = function() {
		dialog = dialog || document.getElementById('search-dialog');
		if (!dialog) return;
		ensureLoaded().then(function() {
			init();
			dialog.showModal();
			// Focus the search input once Pagefind has rendered it
			requestAnimationFrame(function() {
				var input = dialog.querySelector('.pagefind-ui__search-input');
				if (input) input.focus();
			});
		}).catch(function(e) {
			console.error(e);
		});
	};

	window.closeSearch = function() {
		if (dialog && dialog.open) dialog.close();
	};

	// `/` keyboard shortcut — open search from anywhere
	document.addEventListener('keydown', function(e) {
		if (e.key !== '/') return;
		var t = e.target;
		var tag = t && t.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
		e.preventDefault();
		window.openSearch();
	});

	// Click outside the search content closes the dialog
	document.addEventListener('click', function(e) {
		if (!dialog || !dialog.open) return;
		var content = dialog.querySelector('#search-ui');
		if (content && !content.contains(e.target) && e.target.tagName !== 'BUTTON') {
			dialog.close();
		}
	});
})();
