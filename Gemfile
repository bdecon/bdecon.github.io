source "https://rubygems.org"

gem "jekyll"

# Ruby 3.4+ removed these from stdlib; Jekyll still requires them.
gem "erb"
gem "csv"
gem "logger"
gem "base64"
gem "ostruct"

# Plugins (all supported by GitHub Pages):
# - sitemap: auto-generates sitemap.xml from page metadata
# - feed: auto-generates /feed.xml from _posts/ (will populate when blog migrates)
# - redirect-from: supports `redirect_from: ["/old"]` in any page's front matter
gem "jekyll-sitemap"
gem "jekyll-feed"
gem "jekyll-redirect-from"
# Pagination + auto-generated category archive pages. NOT in the default
# GitHub Pages plugin allowlist — requires the GitHub Actions build workflow
# in .github/workflows/jekyll.yml.
gem "jekyll-paginate-v2"
# Auto-stamps page.last_modified_at from git history (falls back to file mtime).
# Used in the post layout to show "Updated: ..." and in JSON-LD dateModified.
gem "jekyll-last-modified-at"

# Used by `make check` locally and by the CI workflow's check step.
# Not in :development group so `bundler-cache: true` in CI installs it.
gem "html-proofer"
