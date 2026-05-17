#!/usr/bin/env python3
"""Generate WebP alternates for oversize blog images.

Walks /assets/blog/ for PNG and JPG files above a size threshold and
creates a sibling .webp at high quality. This does NOT delete or modify
the originals — they stay as fallback. To consume the WebP, posts use
the `<picture>` element (HTML) or the converter / new posts can prefer
WebP src when both exist.

Usage:
    python3 scripts/optimize_blog_images.py               # dry run
    python3 scripts/optimize_blog_images.py --apply       # write
    python3 scripts/optimize_blog_images.py --apply -t 100  # threshold 100 KB
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow required: pip install Pillow", file=sys.stderr)
    sys.exit(1)

REPO = Path(__file__).resolve().parent.parent
ASSETS = REPO / "assets" / "blog"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("-t", "--threshold-kb", type=int, default=200,
                    help="only convert sources at least this large (default 200 KB)")
    ap.add_argument("-q", "--quality", type=int, default=82,
                    help="WebP quality (default 82, range 0-100)")
    args = ap.parse_args()

    thresh = args.threshold_kb * 1024
    targets = []
    for p in ASSETS.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        if p.stat().st_size < thresh:
            continue
        webp = p.with_suffix(".webp")
        if webp.exists():
            continue   # already has WebP alternate
        targets.append(p)

    if not targets:
        print(f"No PNG/JPG files >{args.threshold_kb}KB without a .webp alternate.")
        return 0

    total_orig = 0
    total_webp = 0
    for src in targets:
        try:
            img = Image.open(src)
            # PNG with palette/RGBA needs RGBA. WebP supports both lossy + alpha.
            if img.mode == "P":
                img = img.convert("RGBA")
            out = src.with_suffix(".webp")
            if args.apply:
                img.save(out, "WEBP", quality=args.quality, method=6)
                w_size = out.stat().st_size
            else:
                # Estimate by encoding to in-memory
                from io import BytesIO
                buf = BytesIO()
                img.save(buf, "WEBP", quality=args.quality, method=6)
                w_size = buf.tell()
            o_size = src.stat().st_size
            total_orig += o_size
            total_webp += w_size
            pct = (1 - w_size / o_size) * 100
            print(f"  {o_size//1024:5d} → {w_size//1024:5d} KB  ({pct:5.1f}% smaller)  {src.relative_to(REPO)}")
        except Exception as e:
            print(f"  ERR  {src.relative_to(REPO)}: {e}", file=sys.stderr)

    total_saved = total_orig - total_webp
    print(f"\n{len(targets)} files, total {total_orig//1024} → {total_webp//1024} KB "
          f"(saved {total_saved//1024} KB, {total_saved/total_orig*100:.0f}%)")
    if not args.apply:
        print("(Re-run with --apply to write .webp files.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
