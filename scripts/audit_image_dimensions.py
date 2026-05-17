#!/usr/bin/env python3
"""Audit blog post image dimensions.

For every <img> in _posts/*.md, compare the file's intrinsic pixel size
to the size it's actually displayed at (the width="" attribute, or the
600px prose column cap). Images much larger than displayed waste bytes;
images smaller than displayed will look soft on retina screens.

Targets:
  - Blog prose column is 600px wide.
  - For crisp display on 2x screens, intrinsic width should be ~2x
    the displayed width.
  - Anything >2.5x displayed is oversized (re-export to save bytes).
  - Anything <1.5x displayed will look soft on retina.

Usage:
    python3 scripts/audit_image_dimensions.py            # all posts
    python3 scripts/audit_image_dimensions.py -p slug    # one post
    python3 scripts/audit_image_dimensions.py --top 20   # worst N
    python3 scripts/audit_image_dimensions.py --csv      # csv to stdout
"""
import argparse
import csv
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow not installed. Run: pip install Pillow")

REPO = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO / "_posts"

PROSE_WIDTH = 600       # .prose column in blog posts
OVERSIZED = 2.5         # intrinsic > 2.5x displayed → flag as oversized
UNDERSIZED = 1.5        # intrinsic < 1.5x displayed → flag as soft on retina

IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)
SRC_ATTR = re.compile(r'\bsrc\s*=\s*"([^"]*)"', re.I)
WIDTH_ATTR = re.compile(r'\bwidth\s*=\s*"(\d+)"', re.I)
MD_IMG = re.compile(r"!\[[^\]]*\]\((/assets/blog/[^)\s]+)")


def find_images_in_post(md_path: Path):
    """Yield (src_url, declared_width_or_None) for each image in a post."""
    text = md_path.read_text(encoding="utf-8", errors="replace")
    for m in IMG_TAG.finditer(text):
        tag = m.group(0)
        s = SRC_ATTR.search(tag)
        if not s:
            continue
        src = s.group(1)
        if not src.startswith("/assets/blog/"):
            continue
        w = WIDTH_ATTR.search(tag)
        yield src, (int(w.group(1)) if w else None)
    for m in MD_IMG.finditer(text):
        yield m.group(1), None


def resolve_src_to_path(src: str) -> Path | None:
    """Map /assets/blog/... URL to filesystem path."""
    rel = src.lstrip("/")
    p = REPO / rel
    return p if p.exists() else None


def file_size_kb(p: Path) -> int:
    return p.stat().st_size // 1024


def analyse(filter_substr: str | None):
    posts = sorted(POSTS_DIR.glob("*.md"))
    if filter_substr:
        posts = [p for p in posts if filter_substr in p.name]

    findings = []  # list of dicts
    for post in posts:
        for src, declared_w in find_images_in_post(post):
            path = resolve_src_to_path(src)
            if not path:
                findings.append({
                    "post": post.name,
                    "src": src,
                    "kind": "missing_file",
                    "intrinsic_w": None, "intrinsic_h": None,
                    "displayed_w": declared_w or PROSE_WIDTH,
                    "ratio": None,
                    "kb": 0,
                })
                continue
            try:
                with Image.open(path) as im:
                    iw, ih = im.size
            except Exception as e:
                findings.append({
                    "post": post.name, "src": src,
                    "kind": f"unreadable: {e}",
                    "intrinsic_w": None, "intrinsic_h": None,
                    "displayed_w": declared_w or PROSE_WIDTH,
                    "ratio": None, "kb": file_size_kb(path),
                })
                continue

            displayed = min(declared_w or iw, PROSE_WIDTH)
            ratio = iw / displayed if displayed else 0
            if ratio >= OVERSIZED:
                kind = "oversized"
            elif ratio < UNDERSIZED:
                kind = "undersized"
            else:
                kind = "ok"

            findings.append({
                "post": post.name,
                "src": src,
                "kind": kind,
                "intrinsic_w": iw,
                "intrinsic_h": ih,
                "displayed_w": displayed,
                "ratio": round(ratio, 2),
                "kb": file_size_kb(path),
            })
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--post", help="filter by filename substring")
    ap.add_argument("--csv", action="store_true",
                    help="emit CSV to stdout")
    ap.add_argument("--top", type=int, default=20,
                    help="show top N worst offenders by KB (default 20)")
    ap.add_argument("--show-ok", action="store_true",
                    help="also list well-sized images")
    args = ap.parse_args()

    findings = analyse(args.post)
    if not findings:
        print("No images found.")
        return 0

    if args.csv:
        w = csv.DictWriter(sys.stdout, fieldnames=list(findings[0].keys()))
        w.writeheader()
        w.writerows(findings)
        return 0

    by_kind = {"oversized": [], "undersized": [], "missing_file": [],
               "ok": [], "unreadable": []}
    for f in findings:
        kind = "unreadable" if f["kind"].startswith("unreadable") else f["kind"]
        by_kind.setdefault(kind, []).append(f)

    total = len(findings)
    print(f"Scanned {total} images across blog posts.")
    print()
    print(f"  oversized  (intrinsic >= {OVERSIZED}x displayed): "
          f"{len(by_kind['oversized'])}")
    print(f"  undersized (intrinsic <  {UNDERSIZED}x displayed): "
          f"{len(by_kind['undersized'])}")
    print(f"  missing on disk: {len(by_kind['missing_file'])}")
    print(f"  unreadable:      {len(by_kind['unreadable'])}")
    print(f"  ok:              {len(by_kind['ok'])}")
    print()

    if by_kind["missing_file"]:
        print("Missing image files (referenced but not on disk):")
        for f in by_kind["missing_file"][:10]:
            print(f"  {f['post']}: {f['src']}")
        if len(by_kind["missing_file"]) > 10:
            print(f"  ... and {len(by_kind['missing_file']) - 10} more")
        print()

    if by_kind["oversized"]:
        worst = sorted(by_kind["oversized"], key=lambda f: -f["kb"])[: args.top]
        print(f"Top {len(worst)} oversized images by file size:")
        print(f"  {'KB':>5}  {'intrinsic':>10}  {'shown':>5}  {'ratio':>5}  src")
        for f in worst:
            print(f"  {f['kb']:5d}  {f['intrinsic_w']:>4}x{f['intrinsic_h']:<4}  "
                  f"{f['displayed_w']:>5}  {f['ratio']:>4}x  {f['src']}")
        total_kb = sum(f["kb"] for f in by_kind["oversized"])
        print(f"\nOversized images total {total_kb} KB on disk.")
        print()

    if by_kind["undersized"]:
        print("Undersized images (will look soft on retina):")
        for f in by_kind["undersized"][:10]:
            print(f"  {f['intrinsic_w']:>4}px (shown at {f['displayed_w']}px) "
                  f"{f['src']}")
        if len(by_kind["undersized"]) > 10:
            print(f"  ... and {len(by_kind['undersized']) - 10} more")
        print()

    if args.show_ok and by_kind["ok"]:
        print(f"Well-sized images: {len(by_kind['ok'])}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
