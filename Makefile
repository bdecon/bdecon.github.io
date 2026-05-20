# bd-econ.com — Jekyll commands
#
# Requires PATH to include ~/.local/share/gem/ruby/3.4.0/bin
# (or run via full path; see CLAUDE.md "Jekyll" section).

.PHONY: serve draft build clean rebuild status post post-essay post-update post-release post-tutorial publish-draft spellcheck preflight publish unlist unlisted-status email unmail email-status og-images audit-images

# Local dev server with live rebuild + browser auto-refresh on file changes.
serve:
	bundle exec jekyll serve --port 4000 --host 127.0.0.1 --livereload

# Same as serve, but also includes posts in _drafts/. Drafts get today's date
# in URLs and appear at the top of the blog index for preview purposes.
draft:
	bundle exec jekyll serve --port 4000 --host 127.0.0.1 --livereload --drafts

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

# Authoring shortcuts.
#
# `make post TITLE="Foo bar"`            — scaffold an essay-style post for today
# `make post-essay TITLE="..."`          — explicit; same as `post`
# `make post-update TITLE="..."`         — short data-update template
# `make post-release TITLE="..."`        — release announcement template
# `make post-tutorial TITLE="..."`       — Python tutorial template
#
# Add --draft by appending ARGS="--draft":
#   make post TITLE="Foo bar" ARGS="--draft"
post:
	@python3 scripts/new_post.py "$(TITLE)" -t essay $(ARGS)
post-essay: post
post-update:
	@python3 scripts/new_post.py "$(TITLE)" -t data-update $(ARGS)
post-release:
	@python3 scripts/new_post.py "$(TITLE)" -t release $(ARGS)
post-tutorial:
	@python3 scripts/new_post.py "$(TITLE)" -t tutorial $(ARGS)

# Move a draft from _drafts/ to _posts/ with today's date prefix.
# Usage: make publish-draft SLUG=my-post-slug
publish-draft:
	@if [ -z "$(SLUG)" ]; then echo "Usage: make publish-draft SLUG=my-post-slug"; exit 1; fi
	@if [ ! -f "_drafts/$(SLUG).md" ]; then echo "No _drafts/$(SLUG).md"; exit 1; fi
	@dst="_posts/$$(date +%Y-%m-%d)-$(SLUG).md"; \
	mv "_drafts/$(SLUG).md" "$$dst"; \
	echo "Moved → $$dst"; \
	echo "Update the 'date:' field in the front matter to today before pushing."

# Spellcheck blog posts with codespell. Config + ignore-list in .codespellrc.
# Install: pip install --user codespell
spellcheck:
	@codespell _posts/ || echo "(codespell finished with findings — review above)"

# Generate per-post Open Graph social-card images (1200x630 PNG) for
# any post whose card is stale. Writes /assets/og/<slug>.png and updates
# _data/og_images.yml so head.html picks them up at build time.
og-images:
	@python3 scripts/generate_og_images.py

# Audit blog post image dimensions: flags images oversized for the
# 600px prose column (wasted bytes) or undersized (soft on retina).
audit-images:
	@python3 scripts/audit_image_dimensions.py

# Pre-publish check: runs every audit in turn and reports pass/fail.
# Use after writing a new post, before pushing.
preflight:
	@python3 scripts/preflight.py $(if $(POST),-p $(POST)) $(if $(SKIP_BUILD),--skip-build)

# Unlisted-flag helpers — control whether a post appears in index/feed/sitemap.
# See PUBLISHING.md for the full publishing workflow.
#
# An unlisted post renders at its real URL (so you can preview the rendered
# output on prod) but is hidden from /blog/, the feed, the sitemap, search,
# category archives, related-posts, and the homepage panel. New posts default
# to unlisted via the scaffolder.
#
#   make publish POST=my-slug         # remove unlisted flag (publish: visible everywhere)
#   make unlist POST=my-slug          # set unlisted: true (hide again)
#   make unlisted-status POST=my-slug # show current state without changing it
publish:
	@test -n "$(POST)" || (echo "Usage: make publish POST=<slug>" && exit 1)
	@python3 scripts/toggle_unlisted_flag.py -p $(POST) --off

unlist:
	@test -n "$(POST)" || (echo "Usage: make unlist POST=<slug>" && exit 1)
	@python3 scripts/toggle_unlisted_flag.py -p $(POST) --on

unlisted-status:
	@test -n "$(POST)" || (echo "Usage: make unlisted-status POST=<slug>" && exit 1)
	@python3 scripts/toggle_unlisted_flag.py -p $(POST)

# Email-flag helpers — control whether the next push will email subscribers.
# See PUBLISHING.md for the full publishing workflow.
#   make email POST=my-slug          # set email: true (next push emails subscribers)
#   make unmail POST=my-slug         # remove email: true (next push publishes silently)
#   make email-status POST=my-slug   # show current state without changing it
email:
	@test -n "$(POST)" || (echo "Usage: make email POST=<slug>" && exit 1)
	@python3 scripts/toggle_email_flag.py -p $(POST) --on

unmail:
	@test -n "$(POST)" || (echo "Usage: make unmail POST=<slug>" && exit 1)
	@python3 scripts/toggle_email_flag.py -p $(POST) --off

email-status:
	@test -n "$(POST)" || (echo "Usage: make email-status POST=<slug>" && exit 1)
	@python3 scripts/toggle_email_flag.py -p $(POST)
