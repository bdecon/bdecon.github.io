# bd-econ.com — Jekyll commands
#
# Requires PATH to include ~/.local/share/gem/ruby/3.4.0/bin
# (or run via full path; see CLAUDE.md "Jekyll" section).

.PHONY: serve build clean rebuild status

# Local dev server with live rebuild + browser auto-refresh on file changes.
serve:
	bundle exec jekyll serve --port 4000 --host 127.0.0.1 --livereload

# One-shot build to _site/. Post-build steps:
#   1) wrap <img> in <picture> when a sibling .webp exists (transparent WebP)
#   2) generate the Pagefind search index into _site/pagefind/
build:
	bundle exec jekyll build
	@python3 scripts/inject_webp_sources.py
	@npx --yes pagefind --site _site --quiet

# Validate _site/ for broken internal links, missing images, malformed HTML.
# Skips external URL checks (slow + flaky); use check-external for those.
# Ignores data: URIs and the /pagefind/ index (machine-generated, not for users).
# Note: htmlproofer regex delimiter is `/`, so a pattern matching a path with
# slashes uses comma-separated regexes rather than alternation in one regex.
check: build
	bundle exec htmlproofer _site --disable-external --allow-missing-href --ignore-urls '/^data:/,/pagefind/'

# Full check including external links (network-bound, slower).
check-external: build
	bundle exec htmlproofer _site --allow-missing-href --ignore-urls '/^data:/,/pagefind/'

# Remove build artifacts.
clean:
	rm -rf _site .jekyll-cache

# Clean + build.
rebuild: clean build

# Quick summary of conversion progress: how many pages have Jekyll front matter.
status:
	@converted=$$(grep -l '^---$$' *.html 2>/dev/null | wc -l); \
	total=$$(ls *.html 2>/dev/null | wc -l); \
	echo "Converted: $$converted / $$total root HTML pages"
