#!/usr/bin/env python3
"""Generate one Jekyll page per blog category.

Why this exists:
  jekyll-paginate-v2 autopages uses the raw category name in the URL (e.g.
  '/blog/category/labor market/'), with no slugify option. Generating stub
  pages by hand gives us clean slugged URLs like '/blog/category/labor-market/'
  AND lets each page opt into pagination via its own front matter.

  Categories come from _data/blog_categories.yml. Run this whenever you add
  a new category to the data file.

Output: /blog/category/<slug>.html (one file per category in the data file).
Idempotent — overwrites existing stubs.
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA_FILE = REPO / "_data" / "blog_categories.yml"
OUT_DIR = REPO / "blog" / "category"

STUB = """\
---
layout: blog-category
title: "{name} | BD Economics"
category: "{name}"
permalink: /blog/category/{slug}/
body_class: "page-blog"
nav_active: "blog"
sitemap: false
pagination:
  enabled: true
  category: "{name}"
---
"""


def slugify(s: str) -> str:
    """Match Jekyll's slugify filter behaviour (lowercase, non-alnum → '-')."""
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_categories(yaml_text: str) -> list[str]:
    """Pull category names from a simple key: value YAML file (skip comments)."""
    names = []
    for line in yaml_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Match "Quoted Name": value
        m = re.match(r'"([^"]+)"\s*:', line)
        if m:
            names.append(m.group(1))
    return names


def main():
    names = parse_categories(DATA_FILE.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in names:
        slug = slugify(name)
        path = OUT_DIR / f"{slug}.html"
        path.write_text(STUB.format(name=name, slug=slug), encoding="utf-8")
        print(f"  {path.relative_to(REPO)}  ({name})")
    print(f"\nGenerated {len(names)} category page(s).")


if __name__ == "__main__":
    main()
