# Posts with `unlisted: true` in front matter are "live but hidden":
#   - The post page itself renders at its normal
#     /blog/YYYY/MM/DD/<slug>/ URL so you can preview the real output.
#   - It is excluded from /feed.xml, /sitemap.xml, and jekyll-paginate-v2
#     by also setting `hidden: true` + `sitemap: false`.
#   - Templates that iterate site.posts directly (homepage panel,
#     related-posts widget, per-category counters) filter on
#     `post.unlisted != true` explicitly.
#
# We use the :site, :post_read hook because it runs AFTER posts are parsed
# but BEFORE generators (paginate-v2, feed, sitemap) build their output.
# The per-post :posts, :post_init hook fires too early (before front matter
# parsing finishes) so flags set there don't reach downstream plugins.
#
# Promote a post out of unlisted via `make publish POST=<slug>`.

Jekyll::Hooks.register :site, :post_read do |site|
  count = 0
  site.posts.docs.each do |post|
    if post.data['unlisted'] == true
      post.data['hidden'] = true
      post.data['sitemap'] = false
      count += 1
    end
  end
  Jekyll.logger.info "Unlisted:", "#{count} post(s) hidden from feed/sitemap/pagination" if count > 0
end
