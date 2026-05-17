#!/usr/bin/env python3
"""Generate per-post Open Graph social-card images (1200x630 PNG).

For every blog post in _posts/, render a 1200x630 PNG with the post
title + category accent + bd-econ.com wordmark. Writes to
/assets/og/<slug>.png and updates _data/og_images.yml so head.html can
pick up the correct image at build time.

A post is regenerated only if (a) the OG image doesn't exist yet, or
(b) the source post is newer than the existing image.

Usage:
    python3 scripts/generate_og_images.py          # generate any stale
    python3 scripts/generate_og_images.py --force  # regenerate all
    python3 scripts/generate_og_images.py -p slug  # one post
    python3 scripts/generate_og_images.py --preview slug  # preview one to /tmp
"""
import argparse
import re
import sys
import textwrap
import yaml
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow not installed. pip install Pillow")

REPO = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO / "_posts"
OG_DIR = REPO / "assets" / "og"
MANIFEST = REPO / "_data" / "og_images.yml"
CATEGORY_MAP = REPO / "_data" / "blog_categories.yml"

W, H = 1200, 630

# Accent colors (light theme — matches style.css --color-card-*).
ACCENT_HEX = {
    "blue":   "#2c4a85",
    "green":  "#3d8550",
    "red":    "#d63b3b",
    "orange": "#d97f2c",
    "purple": "#7e4ea7",
    "ltblue": "#5497c4",
    "teal":   "#2e9aa0",
    "brown":  "#a89043",
}

# System font paths — Lato is installed at /usr/share/fonts/TTF/.
FONT_BLACK = "/usr/share/fonts/TTF/Lato-Black.ttf"
FONT_BOLD = "/usr/share/fonts/TTF/Lato-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/TTF/Lato-Regular.ttf"


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def load_category_accents() -> dict[str, str]:
    """Flatten the nested category-meta YAML to {name: accent}."""
    if not CATEGORY_MAP.exists():
        return {}
    raw = yaml.safe_load(CATEGORY_MAP.read_text()) or {}
    return {name: meta.get("accent", "blue") for name, meta in raw.items()}


def parse_post(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return None
    try:
        fm = yaml.safe_load(m.group(1)) or {}
    except Exception:
        return None
    if "title" not in fm:
        return None
    return fm


def post_slug(path: Path) -> str:
    """Match Jekyll's date-stripped slug for filenames."""
    name = path.stem
    return re.sub(r"^\d{4}-\d{2}-\d{2}-", "", name)


def wrap_title(draw: ImageDraw.ImageDraw, font: ImageFont.FreeTypeFont,
               text: str, max_w: int, max_lines: int = 3) -> list[str]:
    """Greedy word-wrap to max_w pixels, capped at max_lines."""
    words = text.split()
    lines, line = [], []
    for w in words:
        trial = (" ".join(line + [w])).strip()
        if draw.textlength(trial, font=font) <= max_w:
            line.append(w)
        else:
            if line:
                lines.append(" ".join(line))
            line = [w]
            if len(lines) == max_lines:
                break
    if line and len(lines) < max_lines:
        lines.append(" ".join(line))
    # If we exceeded max_lines, truncate last line with ellipsis
    if len(lines) == max_lines:
        last = lines[-1]
        if " ".join(lines) != text:
            while draw.textlength(last + "…", font=font) > max_w and len(last) > 1:
                last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
            lines[-1] = last + "…"
    return lines


def render(title: str, category: str, accent_hex: str, out_path: Path):
    img = Image.new("RGB", (W, H), "#fafafa")
    draw = ImageDraw.Draw(img)
    accent_rgb = hex_to_rgb(accent_hex)

    # Left accent bar (12px wide, full height)
    draw.rectangle((0, 0, 12, H), fill=accent_rgb)

    # Top wordmark + tiny accent dot.
    brand_font = ImageFont.truetype(FONT_BOLD, 28)
    draw.rectangle((80, 75, 96, 91), fill=accent_rgb)
    draw.text((110, 70), "BD ECONOMICS", font=brand_font,
              fill=(50, 50, 50))

    # Title — auto-fit font size between 56 and 76 to fit 3 lines max.
    max_text_w = W - 160     # 80px gutters
    title_y = 200
    for size in (76, 72, 68, 64, 60, 56):
        tf = ImageFont.truetype(FONT_BLACK, size)
        lines = wrap_title(draw, tf, title, max_text_w, max_lines=3)
        # Each line height ≈ size * 1.15
        total_h = int(size * 1.15) * len(lines)
        if total_h <= 330 and len(lines) <= 3:
            break
    line_h = int(size * 1.15)
    for i, ln in enumerate(lines):
        draw.text((80, title_y + i * line_h), ln, font=tf,
                  fill=(30, 30, 30))

    # Category chip near bottom (accent-colored fill, white text)
    if category:
        cat_text = category.upper()
        chip_font = ImageFont.truetype(FONT_BOLD, 22)
        text_w = draw.textlength(cat_text, font=chip_font)
        chip_pad_x, chip_pad_y = 16, 8
        chip_x, chip_y = 80, H - 100
        chip_w = int(text_w) + chip_pad_x * 2
        chip_h = 22 + chip_pad_y * 2
        draw.rectangle((chip_x, chip_y, chip_x + chip_w, chip_y + chip_h),
                       fill=accent_rgb)
        draw.text((chip_x + chip_pad_x, chip_y + chip_pad_y - 2),
                  cat_text, font=chip_font, fill="white")

    # Bottom-right URL
    url_font = ImageFont.truetype(FONT_REGULAR, 22)
    url_text = "bd-econ.com"
    url_w = draw.textlength(url_text, font=url_font)
    draw.text((W - 80 - url_w, H - 80), url_text, font=url_font,
              fill=(110, 110, 110))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG", optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--post", help="filter by filename substring")
    ap.add_argument("--force", action="store_true",
                    help="regenerate even if up to date")
    ap.add_argument("--preview", metavar="SLUG",
                    help="render one post to /tmp/og-preview.png without writing manifest")
    args = ap.parse_args()

    accents = load_category_accents()
    posts = sorted(POSTS_DIR.glob("*.md"))
    if args.post or args.preview:
        needle = args.post or args.preview
        posts = [p for p in posts if needle in p.name]
    if not posts:
        print(f"No posts match")
        return 1

    # Load manifest (post URL -> /assets/og/<slug>.png)
    manifest = {}
    if MANIFEST.exists() and not args.preview:
        existing = yaml.safe_load(MANIFEST.read_text()) or {}
        manifest = existing

    generated, skipped = 0, 0
    for post in posts:
        fm = parse_post(post)
        if not fm:
            continue
        slug = post_slug(post)
        out = OG_DIR / f"{slug}.png"
        if args.preview:
            out = Path("/tmp/og-preview.png")

        title = fm["title"]
        cats = fm.get("categories") or []
        if isinstance(cats, str):
            cats = [cats]
        cat = cats[0] if cats else ""
        accent = accents.get(cat, "blue")
        accent_hex = ACCENT_HEX.get(accent, ACCENT_HEX["blue"])

        # Up-to-date check
        if (not args.force and not args.preview and out.exists()
                and out.stat().st_mtime >= post.stat().st_mtime):
            skipped += 1
            # still register in manifest
            manifest[slug] = f"/assets/og/{slug}.png"
            continue

        render(title, cat, accent_hex, out)
        generated += 1
        if not args.preview:
            manifest[slug] = f"/assets/og/{slug}.png"
            print(f"  {slug}.png  ({cat}, {accent})")
        else:
            print(f"Preview saved to {out}")
            return 0

    # Write manifest (sorted for clean diffs)
    if not args.preview:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        sorted_manifest = dict(sorted(manifest.items()))
        with open(MANIFEST, "w") as f:
            f.write("# Auto-generated by scripts/generate_og_images.py\n")
            f.write("# Maps post slug -> /assets/og/<slug>.png\n")
            yaml.safe_dump(sorted_manifest, f, default_flow_style=False)

    print(f"\nGenerated {generated}, skipped {skipped} (up to date).")
    print(f"Manifest: {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
