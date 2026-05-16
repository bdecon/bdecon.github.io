#!/usr/bin/env python3
"""Scaffold a new blog post.

Usage:
  python3 scripts/new_post.py "Why fewer people are working"
  python3 scripts/new_post.py "Title" --date 2026-05-20 --category "Labor Market" -c "Policy"

Creates _posts/YYYY-MM-DD-<slug>.md with front matter ready, prints the path
+ the local preview URL. Open the file in your editor, write the body in
markdown, and `make serve` to preview.

Slug is derived from the title (lowercase, hyphens, no punctuation).
Date defaults to today.
"""
import argparse
import re
import sys
from datetime import date as date_cls, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO / "_posts"

TEMPLATE = """\
---
title: "{title}"
date: {date}
{categories_block}
# Optional fields you can fill in:
# featured_image: /assets/blog/{ymd_path}/{slug}.jpg   # also handles .png/.webp
# featured_image_style: banner                          # banner | chart
# tags:
#   - tag-one
#   - tag-two
---

Write the opening paragraph here. This becomes the auto-excerpt for the blog
index. Keep it punchy: one or two sentences that get the reader in.

## First section heading

Body content. Markdown works. Inline `<figure>` blocks render with centered
images and italic figcaptions. For side-by-side image + text, wrap a figure
and a paragraph in `<div class="split-row post-split-row">`.

> Use a blockquote for a pull quote. Stands out in larger italic with an accent
> left border.

Add more sections as needed.
"""


def slugify(text: str) -> str:
    """Title → kebab-case slug. ASCII-only, no punctuation."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)        # strip punctuation
    s = re.sub(r"[\s_]+", "-", s)         # collapse spaces/underscores
    s = re.sub(r"-+", "-", s).strip("-")  # collapse dashes
    return s or "untitled"


def parse_date(s: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise SystemExit(f"Can't parse date: {s!r}. Use YYYY-MM-DD.")


def main():
    ap = argparse.ArgumentParser(description="Scaffold a new blog post.")
    ap.add_argument("title", help='Post title (e.g. "Why X happened")')
    ap.add_argument("--date", help="YYYY-MM-DD (default: today)")
    ap.add_argument("--slug", help="Override slug (default: derived from title)")
    ap.add_argument(
        "-c", "--category", action="append", default=[],
        help='Add a category. Repeat to add multiple: -c "Labor Market" -c "Policy"'
    )
    ap.add_argument("--force", action="store_true", help="Overwrite if file exists")
    args = ap.parse_args()

    if args.date:
        d = parse_date(args.date)
    else:
        d = datetime.combine(date_cls.today(), datetime.min.time().replace(hour=9))

    slug = args.slug or slugify(args.title)
    ymd = d.strftime("%Y-%m-%d")
    ymd_path = d.strftime("%Y/%m")
    filename = f"{ymd}-{slug}.md"
    out_path = POSTS_DIR / filename

    if out_path.exists() and not args.force:
        raise SystemExit(f"Refusing to overwrite {out_path} (use --force)")

    # Format the YAML date the way Jekyll's converter writes it
    date_str = d.strftime("%Y-%m-%dT%H:%M:%S-04:00")

    if args.category:
        cats = "categories:\n" + "\n".join(f'  - "{c}"' for c in args.category)
    else:
        cats = (
            '# Pick one or more from existing categories (or invent new):\n'
            '#   "Data & Python", "Housing & Demographics", "Labor Market", "Macroeconomics",\n'
            '#   "Policy", "Prices & Inflation", "Trade & International", "Wages & Income"\n'
            'categories:\n'
            '  - "Labor Market"'
        )

    content = TEMPLATE.format(
        title=args.title.replace('"', '\\"'),
        date=date_str,
        categories_block=cats,
        ymd_path=ymd_path,
        slug=slug,
    )

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    print(f"  Created: {out_path.relative_to(REPO)}")
    print(f"  Preview: http://127.0.0.1:4000/blog/{d.strftime('%Y/%m/%d')}/{slug}/")
    print(f"  Open in editor, then `make serve` to preview.")


if __name__ == "__main__":
    main()
