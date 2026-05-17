#!/usr/bin/env python3
"""Wrap <img src="X.png|.jpg"> in <picture> when a WebP alternate exists.

Runs over _site/ as a post-build step. For each <img> whose src points
at a PNG/JPG in /assets/blog/ that has a sibling .webp file, wraps the
tag in:

    <picture>
      <source srcset="X.webp" type="image/webp">
      <img src="X.png" …>
    </picture>

Idempotent — already-wrapped images are skipped. Leaves images outside
/assets/blog/ alone (site banners use their own <picture> markup).

Usage:
    python3 scripts/inject_webp_sources.py            # in-place rewrite
    python3 scripts/inject_webp_sources.py --check    # report only, no write
"""
import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE = REPO / "_site"

# Match <img …src="/assets/blog/…/X.(png|jpg|jpeg)"…>
IMG_RE = re.compile(
    r'<img\b([^>]*?)\bsrc="(/assets/blog/[^"]+?\.(?:png|jpe?g))"([^>]*?)/?>',
    re.IGNORECASE,
)


def webp_path_for(src: str) -> Path:
    """Map /assets/blog/x.png → SITE/assets/blog/x.webp on disk."""
    stem = src.rsplit(".", 1)[0]
    return SITE / stem.lstrip("/") / ""  # adjusted below


def process_html(html: str, html_path: Path) -> tuple[str, int]:
    """Return (new_html, count_wrapped)."""
    wrapped = 0

    def repl(m):
        nonlocal wrapped
        full = m.group(0)
        before_src = m.group(1)
        src = m.group(2)
        after_src = m.group(3)

        # Skip if already inside <picture> — quick check: look back 60 chars
        start = m.start()
        ctx = html[max(0, start - 60):start]
        if "<picture" in ctx and "</picture" not in ctx:
            return full

        stem = src.rsplit(".", 1)[0]
        webp_disk = SITE / stem.lstrip("/")  # will append .webp below
        webp_file = webp_disk.with_suffix(".webp")
        if not webp_file.exists():
            return full

        webp_src = stem + ".webp"
        wrapped += 1
        # Self-close or not — match the original's trailing slash if present
        self_close = "/>" if full.rstrip().endswith("/>") else ">"
        new_img = f'<img{before_src}src="{src}"{after_src}{self_close}'
        return (
            f'<picture>'
            f'<source srcset="{webp_src}" type="image/webp">'
            f'{new_img}'
            f'</picture>'
        )

    new = IMG_RE.sub(repl, html)
    return new, wrapped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, do not write")
    args = ap.parse_args()

    if not SITE.exists():
        print(f"No {SITE} — build first with `make build`", file=sys.stderr)
        return 1

    total_files = 0
    total_wrapped = 0
    for html_path in SITE.rglob("*.html"):
        original = html_path.read_text(encoding="utf-8")
        new, count = process_html(original, html_path)
        if count == 0:
            continue
        total_files += 1
        total_wrapped += count
        if not args.check:
            html_path.write_text(new, encoding="utf-8")

    print(f"Wrapped {total_wrapped} <img> in <picture> across {total_files} HTML files"
          + (" (check only)" if args.check else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
