---
title: "{{title}}"
date: {{date}}
# Pick from: "Data & Python", "Housing & Demographics", "Labor Market",
# "Macroeconomics", "Policy", "Prices & Inflation", "Trade & International",
# "Wages & Income". Or invent new (add to _data/blog_categories.yml).
categories:
  - "Labor Market"
# Optional fields:
# featured_image: /assets/blog/{{date:YYYY/MM}}/{{title}}-banner.jpg
# featured_image_style: banner                          # banner | chart
# tags: ["tag-one"]
---

Lede paragraph — one or two punchy sentences. This becomes the auto-excerpt
on the blog index. Set the hook here.

## First section

Body paragraph. Markdown works. Inline `<figure>` blocks render with centered
images and italic figcaptions:

{% include figure.html src="/assets/blog/{{date:YYYY/MM}}/chart-1.png" alt="describe the chart for screen readers" caption="Source: BLS, BEA. Chart shows X over Y period." %}

> A blockquote becomes a pull quote — larger italic with an accent left border.

## Second section

More content.

For side-by-side text + image (text keeps prose-column left, image bumps
out right), use `<div class="post-split">`. See `_drafts/demo-side-by-side-figure.md`
for the canonical example.
