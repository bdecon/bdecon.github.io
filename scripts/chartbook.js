/* Chartbook page: PDF freshness signal, sources table, lightbox.
   Extracted from chartbook.html inline <script> for caching + separation. */
(function() {
	// Live freshness: read Last-Modified from chartbook.pdf via HEAD,
	// format as "Updated 4 hours ago" / "Updated yesterday" / etc.,
	// and color the status dot (green <48h, yellow <7d, red older).
	fetch('chartbook.pdf', {method: 'HEAD'}).then(r => {
	    const lastMod = r.headers.get('Last-Modified');
	    if (!lastMod) throw new Error('no Last-Modified');
	    const ms = Date.now() - new Date(lastMod).getTime();
	    const hours = Math.max(0, Math.floor(ms / 3600000));
	    const days = Math.floor(hours / 24);
	    let phrase;
	    if (hours < 1)        phrase = 'just now';
	    else if (hours < 24)  phrase = hours + (hours === 1 ? ' hour ago' : ' hours ago');
	    else if (days === 1)  phrase = 'yesterday';
	    else if (days < 7)    phrase = days + ' days ago';
	    else                  phrase = new Date(lastMod).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
	    const status = hours < 48 ? 'fresh' : (days < 7 ? 'stale' : 'old');
	    document.querySelectorAll('.cb-freshness').forEach(el => el.textContent = 'Updated ' + phrase);
	    document.querySelectorAll('.cb-status-dot').forEach(el => el.dataset.status = status);
	    document.querySelectorAll('.cb-update').forEach(el => { if (!el.classList.contains('cb-freshness')) el.textContent = phrase; });
	    // File size — populate the .cb-pdf-size meta line.
	    const bytes = parseInt(r.headers.get('Content-Length') || '0', 10);
	    if (bytes > 0) {
	        const mb = (bytes / (1024 * 1024)).toFixed(1);
	        document.querySelectorAll('.cb-pdf-size').forEach(el => el.textContent = 'PDF · ' + mb + ' MB');
	    }
	}).catch(() => {
	    // Fallback to date.txt if HEAD fails (older browser, CDN issues).
	    fetch('date.txt').then(r => r.text()).then(t => {
	        document.querySelectorAll('.cb-update').forEach(el => el.textContent = t.trim());
	        document.querySelectorAll('.cb-freshness').forEach(el => el.textContent = 'Updated ' + t.trim());
	    });
	});

	fetch('files/chartbook_sources.json').then(r => r.json()).then(d => {
	    const tbody = document.getElementById('cb-sources-table');
	    // Parse "YYYY-MM-DD" as midnight LOCAL time (not UTC), so that
	    // "today" stays "today" for users in any timezone. JS's default
	    // Date('YYYY-MM-DD') parses as UTC, which shifts the date by
	    // ±1 day for non-UTC users — which is why a 12-hour-old release
	    // could read as "yesterday".
	    const parseLocalDate = (s) => {
	        const [y, m, d] = s.split('-').map(Number);
	        return new Date(y, m - 1, d);
	    };
	    // Compare calendar days, not millisecond diffs — date-only data
	    // doesn't carry sub-day resolution to compare against.
	    const calendarDaysAgo = (s) => {
	        const last = parseLocalDate(s);
	        const now = new Date();
	        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	        return Math.max(0, Math.round((today - last) / 86400000));
	    };
	    const fmtAgo = (days) => {
	        if (days === 0) return 'today';
	        if (days === 1) return 'yesterday';
	        if (days < 7)   return days + ' days ago';
	        if (days < 31)  { const w = Math.floor(days / 7); return w === 1 ? '1 week ago' : w + ' weeks ago'; }
	        const m = Math.floor(days / 30);
	        return m === 1 ? '1 month ago' : m + ' months ago';
	    };
	    for (const r of d.recent) {
	        const days = calendarDaysAgo(r.last_changed);
	        const status = days < 14 ? 'fresh' : (days < 60 ? 'stale' : 'old');
	        const tr = document.createElement('tr');
	        tr.innerHTML =
	            `<td>${r.name}</td>` +
	            `<td>${r.period}</td>` +
	            `<td class="cb-src-updated"><span class="cb-status-dot" data-status="${status}" aria-hidden="true"></span>${fmtAgo(days)}</td>`;
	        tbody.appendChild(tr);
	    }
	    const more = document.createElement('tr');
	    more.className = 'cb-more';
	    more.innerHTML = `<td>…</td><td></td><td></td>`;
	    tbody.appendChild(more);
	    document.getElementById('cb-st').textContent =
	        'Also tracks interest rates, equities, commodities, exchange rates, and more.';
	});

	const lightbox = document.getElementById('cb-lightbox');
	const lbImg = document.getElementById('cb-lightbox-img');
	function openLightbox(img) {
	    lbImg.src = img.src;
	    lbImg.alt = img.alt;
	    lightbox.showModal();
	}
	lightbox.addEventListener('click', function(e) {
	    if (e.target === this) lightbox.close();
	});
	lightbox.addEventListener('close', function() {
	    lbImg.removeAttribute('src');
	});
})();
