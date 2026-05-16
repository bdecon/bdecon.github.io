#!/usr/bin/env python3
"""Audit alt text on blog post images.

Walks _posts/*.md, finds every <img> tag and ![](markdown) image, and
reports any with missing/empty alt. Output is grouped by post so it's
easy to fix several images in one pass.

Usage:
    python3 scripts/audit_alt_text.py           # summary + per-post detail
    python3 scripts/audit_alt_text.py --csv     # csv to stdout (post,src,kind)
    python3 scripts/audit_alt_text.py -p slug   # only posts whose path contains slug
"""
import argparse
import csv
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO / "_posts"

# <img ...> with no alt= attribute, or alt="" (empty)
IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)
ALT_ATTR = re.compile(r'\balt\s*=\s*"([^"]*)"', re.I)
SRC_ATTR = re.compile(r'\bsrc\s*=\s*"([^"]*)"', re.I)

# ![alt](src) markdown image
MD_IMG = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def audit_post(path: Path):
    """Return list of (kind, src, alt_or_None) for images missing alt."""
    text = path.read_text(encoding="utf-8")
    # strip front matter so featured_image: in YAML doesn't confuse us
    body = re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.S)

    missing = []
    for tag in IMG_TAG.finditer(body):
        s = tag.group(0)
        src = (SRC_ATTR.search(s) or [None, ""])[1] if SRC_ATTR.search(s) else ""
        alt_m = ALT_ATTR.search(s)
        if alt_m is None:
            missing.append(("html", src, None))  # no alt attr at all
        elif alt_m.group(1).strip() == "":
            missing.append(("html", src, ""))    # empty alt
    for m in MD_IMG.finditer(body):
        alt, src = m.group(1), m.group(2)
        if alt.strip() == "":
            missing.append(("md", src, ""))
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true", help="emit csv to stdout")
    ap.add_argument("-p", "--path-contains", help="filter posts by path substring")
    args = ap.parse_args()

    posts = sorted(POSTS_DIR.glob("*.md"))
    if args.path_contains:
        posts = [p for p in posts if args.path_contains in p.name]
    if not posts:
        print("No posts found", file=sys.stderr)
        return 1

    if args.csv:
        w = csv.writer(sys.stdout)
        w.writerow(["post", "kind", "src", "alt"])
        for p in posts:
            for kind, src, alt in audit_post(p):
                w.writerow([p.name, kind, src, "" if alt is None else alt])
        return 0

    total_imgs = 0
    posts_with_issues = 0
    total_missing = 0
    for p in posts:
        missing = audit_post(p)
        # count all images for this post (for totals)
        body = re.sub(r"^---\n.*?\n---\n", "", p.read_text(), count=1, flags=re.S)
        n_imgs = len(IMG_TAG.findall(body)) + len(MD_IMG.findall(body))
        total_imgs += n_imgs
        if missing:
            posts_with_issues += 1
            total_missing += len(missing)
            print(f"\n{p.name}  ({len(missing)} of {n_imgs} images)")
            for kind, src, alt in missing:
                tag = "no-alt" if alt is None else "empty-alt"
                print(f"  [{kind} {tag}]  {src}")

    print()
    print(f"Summary: {total_missing} images missing alt across {posts_with_issues} posts "
          f"(of {len(posts)} total, {total_imgs} images scanned).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
