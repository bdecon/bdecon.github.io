#!/usr/bin/env python3
"""Scaffold a new blog post or draft.

Examples:
  python3 scripts/new_post.py "Why fewer people are working"
  python3 scripts/new_post.py "Title" --draft
  python3 scripts/new_post.py "Title" -t essay -c "Labor Market"
  python3 scripts/new_post.py "Title" -t data-update --date 2026-05-20
  python3 scripts/new_post.py "Title" -t release

Creates `_posts/YYYY-MM-DD-<slug>.md` (or `_drafts/<slug>.md` with --draft)
with front matter ready, prints the path + local preview URL.

Templates:
  essay        — long-form post with sections (default)
  data-update  — short statistical update post
  release      — version bump / release announcement
  tutorial     — Python tutorial format with setup + numbered steps

Slug is derived from the title (lowercase, hyphens). Date defaults to today.
"""
import argparse
import re
import sys
from datetime import date as date_cls, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO / "_posts"
DRAFTS_DIR = REPO / "_drafts"


COMMON_HEAD = """\
---
title: "{title}"
date: {date}
{categories_block}
unlisted: true                      # post is live at its URL but HIDDEN from index/feed/sitemap.
                                    # Remove this line (or run `make publish POST={slug}`) to publish.
# email: true                       # uncomment + push to email subscribers (otherwise: site updates silently)
"""

TEMPLATES = {

    "essay": COMMON_HEAD + """\
# Optional fields:
# featured_image: /assets/blog/{ymd_path}/{slug}-banner.jpg
# featured_image_style: banner                          # banner | chart
# tags: ["tag-one"]
---

Lede paragraph — one or two punchy sentences. This becomes the auto-excerpt
on the blog index. Set the hook here.

## First section

Body paragraph. Markdown works. Drop in a figure with the `figure` include —
the WebP fallback is added automatically at build time:

{{% include figure.html src="/assets/blog/{ymd_path}/chart-1.png" alt="describe the chart for screen readers" caption="Source: BLS, BEA. Chart shows X over Y period." %}}

> A blockquote becomes a pull quote — larger italic with an accent left border.

## Second section

More content.

For side-by-side text + image (text keeps prose-column left, image bumps
out right), use `<div class="post-split">`. See `_drafts/demo-side-by-side-figure.md`
for the canonical example.
""",

    "data-update": COMMON_HEAD + """\
tags: ["data-update"]
---

According to today's data from [DATA SOURCE](https://example.com), the US
INDICATOR rose / fell AMOUNT in PERIOD.

Brief context: one paragraph explaining what changed and what's notable.

{{% include figure.html src="/assets/blog/{ymd_path}/chart.png" alt="alt text describing the chart" %}}

Short interpretive paragraph. What does this mean?
""",

    "release": COMMON_HEAD + """\
tags: ["release"]
---

PROJECT_NAME version X.Y is released. Here's what's new:

- Change 1
- Change 2
- Change 3

[Download from GitHub](https://github.com/bdecon/...) or [see the docs](...).

Brief context paragraph if needed.
""",

    "tutorial": COMMON_HEAD + """\
tags: ["python", "tutorial"]
---

Brief intro: what this tutorial does, what API or technique it covers, what
the reader will produce by the end. One paragraph.

## Setup

Install the required library:

```bash
pip install REQUIRED_PACKAGE
```

## Step 1: Connect

```python
import REQUIRED_PACKAGE
# explain what this does in 1-2 sentences
```

## Step 2: Fetch data

```python
# get the data
```

## Step 3: Visualize

```python
# plot
```

{{% include figure.html src="/assets/blog/{ymd_path}/result.png" alt="describe the chart" %}}

## Summary

The workflow:
1. Step
2. Step
3. Step

## Resources

- [Library docs](https://example.com)
- [Related tutorial on bd-econ.com](/blog/...)
""",
}


def slugify(text: str) -> str:
    """Title → kebab-case slug. ASCII-only, no punctuation."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "untitled"


def parse_date(s: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise SystemExit(f"Can't parse date: {s!r}. Use YYYY-MM-DD.")


def main():
    ap = argparse.ArgumentParser(description="Scaffold a new blog post or draft.",
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    ap.add_argument("title", help='Post title (e.g. "Why X happened")')
    ap.add_argument("-t", "--template", choices=list(TEMPLATES.keys()),
                    default="essay", help="Template variant (default: essay)")
    ap.add_argument("--draft", action="store_true",
                    help="Save to _drafts/ instead of _posts/")
    ap.add_argument("--date", help="YYYY-MM-DD (default: today). Ignored for drafts.")
    ap.add_argument("--slug", help="Override slug (default: derived from title)")
    ap.add_argument("-c", "--category", action="append", default=[],
                    help='Add a category. Repeatable: -c "Labor Market" -c "Policy"')
    ap.add_argument("--force", action="store_true", help="Overwrite if file exists")
    args = ap.parse_args()

    if args.date:
        d = parse_date(args.date)
    else:
        d = datetime.combine(date_cls.today(), datetime.min.time().replace(hour=9))

    slug = args.slug or slugify(args.title)
    ymd = d.strftime("%Y-%m-%d")
    ymd_path = d.strftime("%Y/%m")

    if args.draft:
        DRAFTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = DRAFTS_DIR / f"{slug}.md"
    else:
        POSTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = POSTS_DIR / f"{ymd}-{slug}.md"

    if out_path.exists() and not args.force:
        raise SystemExit(f"Refusing to overwrite {out_path} (use --force)")

    date_str = d.strftime("%Y-%m-%dT%H:%M:%S-04:00")

    if args.category:
        cats = "categories:\n" + "\n".join(f'  - "{c}"' for c in args.category)
    else:
        cats = (
            '# Pick from: "Data & Python", "Housing & Demographics", "Labor Market",\n'
            '# "Macroeconomics", "Policy", "Prices & Inflation", "Trade & International",\n'
            '# "Wages & Income". Or invent new (add to _data/blog_categories.yml).\n'
            'categories:\n'
            '  - "Labor Market"'
        )

    template = TEMPLATES[args.template]
    content = template.format(
        title=args.title.replace('"', '\\"'),
        date=date_str,
        categories_block=cats,
        ymd_path=ymd_path,
        slug=slug,
    )

    out_path.write_text(content, encoding="utf-8")
    print(f"  Created: {out_path.relative_to(REPO)}")
    print(f"  Template: {args.template}")
    if args.draft:
        print(f"  Preview: run `make draft` to serve drafts at http://127.0.0.1:4000/")
        print(f"  Publish: run `make publish-draft SLUG={slug}` when ready")
    else:
        print(f"  Preview: http://127.0.0.1:4000/blog/{d.strftime('%Y/%m/%d')}/{slug}/")
        print(f"  Run `make serve` to preview locally.")
        print(f"")
        print(f"  This post is UNLISTED by default — pushing it will make it")
        print(f"  live at its real URL but hidden from /blog/, feed, sitemap.")
        print(f"  When ready to publish: `make publish POST={slug}`")


if __name__ == "__main__":
    main()
