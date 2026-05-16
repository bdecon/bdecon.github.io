# bd-econ.com — Jekyll commands
#
# Requires PATH to include ~/.local/share/gem/ruby/3.4.0/bin
# (or run via full path; see CLAUDE.md "Jekyll" section).

.PHONY: serve build clean rebuild status

# Local dev server with live rebuild + browser auto-refresh on file changes.
serve:
	bundle exec jekyll serve --port 4000 --host 127.0.0.1 --livereload

# One-shot build to _site/.
build:
	bundle exec jekyll build

# Validate _site/ for broken internal links, missing images, malformed HTML.
# Skips external URL checks (slow + flaky); use check-external for those.
check: build
	bundle exec htmlproofer _site --disable-external --allow-missing-href

# Full check including external links (network-bound, slower).
check-external: build
	bundle exec htmlproofer _site --allow-missing-href

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
