#!/usr/bin/env python3
"""Find blog images that exist on disk but aren't referenced anywhere.

Walks /assets/blog/ for image files, then greps _posts/ and the
front-matter `featured_image:` field for each filename. Anything not
referenced is an orphan candidate.

Usage:
    python3 scripts/find_orphan_images.py             # list orphans
    python3 scripts/find_orphan_images.py --delete    # delete after confirm
    python3 scripts/find_orphan_images.py --no-fm     # only check inline refs (skip front-matter featured_image)
"""
import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ASSETS = REPO / "assets" / "blog"
POSTS = REPO / "_posts"

IMG_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}


def find_image_files():
    """Return list of (relative_path, absolute_path) for every image under assets/blog/."""
    out = []
    for p in ASSETS.rglob("*"):
        if p.is_file() and (p.suffix.lower() in IMG_EXTS or p.suffix == ""):
            # extensionless UUID files are PNGs from Google Doc exports
            rel = "/" + str(p.relative_to(REPO))
            out.append((rel, p))
    return out


def collect_post_text():
    """Concatenate all post text so we can grep image refs in one pass."""
    parts = []
    for p in sorted(POSTS.glob("*.md")):
        parts.append(p.read_text(encoding="utf-8", errors="ignore"))
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true", help="delete orphans after confirmation")
    ap.add_argument("--no-fm", action="store_true",
                    help="only check inline body refs (ignore front-matter featured_image)")
    args = ap.parse_args()

    images = find_image_files()
    if not images:
        print("No images found under assets/blog/")
        return 0

    text = collect_post_text()

    orphans = []
    for rel, path in images:
        # Match by basename — handles both /assets/blog/YYYY/MM/foo.png and bare foo.png refs
        name = path.name
        if name in text:
            continue
        orphans.append((rel, path))

    if not orphans:
        print(f"No orphans. All {len(images)} images referenced.")
        return 0

    total_kb = sum(p.stat().st_size for _, p in orphans) // 1024
    print(f"{len(orphans)} orphan images ({total_kb} KB):\n")
    for rel, _ in orphans:
        print(f"  {rel}")

    if args.delete:
        print(f"\nDelete all {len(orphans)} files? [y/N] ", end="", flush=True)
        if input().strip().lower() == "y":
            for _, path in orphans:
                path.unlink()
            print(f"Deleted {len(orphans)} files.")
        else:
            print("Aborted.")
    else:
        print(f"\n(Re-run with --delete to remove these {len(orphans)} files.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
