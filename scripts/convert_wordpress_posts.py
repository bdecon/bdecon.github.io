#!/usr/bin/env python3
"""Convert WordPress JSON backup to Jekyll markdown posts.

Reads:  backups/wordpress/posts.json     (from backup_wordpress.py)
Writes: _posts/YYYY-MM-DD-slug.md         (one per post)
Writes: assets/blog/YYYY/MM/<filename>    (downloaded images)

Run from project root:
  python3 scripts/convert_wordpress_posts.py             # convert all 79
  python3 scripts/convert_wordpress_posts.py --limit 3   # test on 3 newest
  python3 scripts/convert_wordpress_posts.py --skip-images   # write posts only

What it does per post:
  1. Decodes HTML entities in title, categories, tags
  2. Extracts all image URLs (featured + inline)
  3. Downloads images to assets/blog/YYYY/MM/<filename> (skips if exists)
  4. Rewrites image src in post HTML to local paths
  5. Strips WP responsive srcset / sizes attrs (use main src only)
  6. Pandoc-converts HTML body to Markdown (GFM, no wrap)
  7. Writes _posts/YYYY-MM-DD-slug.md with full front matter
"""
import argparse
import html
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS_JSON = REPO / "backups" / "wordpress" / "posts.json"
OUT_POSTS_DIR = REPO / "_posts"
OUT_IMAGES_DIR = REPO / "assets" / "blog"
PANDOC = "/home/brian/miniconda3/bin/pandoc"


def decode_entities(text: str) -> str:
    """Decode HTML entities (&amp;, &#8217;, etc.) to plain unicode."""
    return html.unescape(text or "")


def slug_from_url(url: str) -> str:
    """Last path segment of a URL, sans query/fragment."""
    parsed = urllib.parse.urlparse(url)
    return os.path.basename(parsed.path)


def local_image_path(url: str) -> tuple[Path, str]:
    """Compute (filesystem path, local URL) for a WordPress image URL.

    WP uploads pattern: .../wp-content/uploads/YYYY/MM/filename.ext (with optional ?w=NNN)
    -> assets/blog/YYYY/MM/filename.ext + /assets/blog/YYYY/MM/filename.ext

    Falls back to flat filename for non-standard URLs.
    """
    # Strip query string (?w=1024 etc.)
    url_clean = url.split("?")[0]
    parsed = urllib.parse.urlparse(url_clean)
    path = parsed.path.lstrip("/")
    m = re.match(r"wp-content/uploads/(\d{4}/\d{2}/.+)$", path)
    if m:
        rel = m.group(1)
    else:
        # Flat fallback — use last segment
        rel = path.rsplit("/", 1)[-1] or "unknown"
    fs = OUT_IMAGES_DIR / rel
    url_path = "/assets/blog/" + rel
    return fs, url_path


def download_image(url: str, dest: Path) -> bool:
    """Download url to dest unless it already exists. Returns True if downloaded."""
    if dest.exists() and dest.stat().st_size > 0:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "bd-econ-migrator/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"    ! download failed: {url} ({e})")
        return False


# Image URL extraction — handles <img src="..."> with attributes in any order.
IMG_SRC_RE = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"', re.IGNORECASE)
# Strip srcset / sizes attributes (WP responsive images bloat HTML).
SRCSET_RE = re.compile(r'\s+(?:srcset|sizes)="[^"]*"', re.IGNORECASE)
# Strip WP's data-* attributes (data-id, data-link, etc. — analytics noise).
DATA_ATTR_RE = re.compile(r'\s+data-[a-z-]+="[^"]*"', re.IGNORECASE)
# Strip width/height attributes that point at full-resolution rather than rendered size.
# (Pandoc preserves them as markdown image attrs, but they don't help us.)
# Actually keep these — they help with CLS. Leaving for now.


IMG_TAG_RE = re.compile(r'<img\b[^>]*?>', re.IGNORECASE)


def ensure_alt(html_content: str) -> str:
    """Add alt='' to any <img> missing an alt attribute (decorative semantic).
    WordPress posts often have no alt text — Brian can write descriptive alts
    during review. Empty alt is preferable to no alt for screen readers."""
    def add_alt(m):
        tag = m.group(0)
        if re.search(r'\balt\s*=', tag, re.IGNORECASE):
            return tag
        if tag.endswith("/>"):
            return tag[:-2] + ' alt="" />'
        return tag[:-1] + ' alt="">'
    return IMG_TAG_RE.sub(add_alt, html_content)


def process_content(html_content: str, skip_images: bool) -> tuple[str, set]:
    """Rewrite image URLs to local paths; download images. Returns (new_html, downloaded_set)."""
    downloaded = set()
    image_urls = list(set(IMG_SRC_RE.findall(html_content)))
    for url in image_urls:
        if not url.startswith("http"):
            continue
        fs, local_url = local_image_path(url)
        if not skip_images:
            # Download from URL without query string (gets original full-res)
            if download_image(url.split("?")[0], fs):
                downloaded.add(local_url)
        # Replace all occurrences of this exact URL (including any with ?query)
        html_content = html_content.replace(url, local_url)
    # Strip noisy attributes
    html_content = SRCSET_RE.sub("", html_content)
    html_content = DATA_ATTR_RE.sub("", html_content)
    return html_content, downloaded


def html_to_markdown(html_content: str) -> str:
    """Pipe HTML through pandoc to get GFM markdown."""
    result = subprocess.run(
        [PANDOC, "-f", "html", "-t", "gfm", "--wrap=none", "--markdown-headings=atx"],
        input=html_content, capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def yaml_string(s: str) -> str:
    """Quote a YAML string safely."""
    if s is None:
        return '""'
    s = decode_entities(s)
    # Escape backslash and double-quote
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


FIRST_P_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.DOTALL | re.IGNORECASE)


def first_paragraph_excerpt(content_html: str, max_len: int = 240) -> str:
    """Pull the first real paragraph from post body HTML.

    Why this exists: Jekyll's auto-excerpt grabs everything up to the first
    blank line, which for our converted posts is the leading h2 (since pandoc
    output starts with the first heading). WordPress's `excerpt` field is also
    bad — it concatenated heading text with the first paragraph.

    Walk through <p> blocks until we find one with enough content to be a
    real intro sentence (skip empty / very short / image-only paragraphs).
    """
    for m in FIRST_P_RE.finditer(content_html):
        text = re.sub(r"<[^>]+>", "", m.group(1))
        text = decode_entities(text).strip()
        text = re.sub(r"\s+", " ", text)
        if len(text) < 30:
            continue
        if len(text) > max_len:
            text = text[:max_len].rstrip() + "…"
        return text
    return ""


def detect_featured_image_style(local_url: str | None) -> str | None:
    """Return 'banner' or 'chart' based on image aspect ratio.

    Reads the downloaded image to decide:
      aspect (w/h) >= 1.5 -> 'banner' (landscape, hero treatment with cover)
      aspect < 1.5        -> 'chart'  (squarer/portrait, contain treatment)
    Returns None if image not found or PIL not available.
    """
    if not local_url:
        return None
    try:
        from PIL import Image
    except ImportError:
        return None
    fs = REPO / local_url.lstrip("/")
    if not fs.exists():
        return None
    try:
        with Image.open(fs) as im:
            w, h = im.size
        aspect = w / h if h > 0 else 1.0
        return "banner" if aspect >= 1.5 else "chart"
    except Exception:
        return None


def build_front_matter(post: dict, featured_image_local: str | None) -> str:
    """Build the YAML front-matter block."""
    title = decode_entities(post.get("title", ""))

    # Excerpt: first real paragraph from body (not WordPress's bad excerpt
    # which mashed heading text with first paragraph).
    excerpt = first_paragraph_excerpt(post.get("content", "") or "")

    categories = [decode_entities(c) for c in (post.get("categories") or {}).keys()]
    tags = [decode_entities(t) for t in (post.get("tags") or {}).keys()]

    # Date — preserve original WP timestamp (incl. timezone)
    date_str = post.get("date", "")

    # Original WP URL — derive redirect_from path (drop host, keep path)
    wp_url = post.get("URL", "")
    parsed = urllib.parse.urlparse(wp_url)
    redirect_path = parsed.path  # /2026/05/05/slug/

    lines = ["---"]
    lines.append(f"title: {yaml_string(title)}")
    lines.append(f"date: {date_str}")
    if post.get("slug"):
        lines.append(f"slug: {post['slug']}")
    if categories:
        lines.append("categories:")
        for c in categories:
            lines.append(f"  - {yaml_string(c)}")
    if tags:
        lines.append("tags:")
        for t in tags:
            lines.append(f"  - {yaml_string(t)}")
    if excerpt:
        lines.append(f"excerpt: {yaml_string(excerpt)}")
    if featured_image_local:
        lines.append(f"featured_image: {featured_image_local}")
        style = detect_featured_image_style(featured_image_local)
        if style:
            lines.append(f"featured_image_style: {style}")
    if redirect_path:
        lines.append("redirect_from:")
        lines.append(f"  - {redirect_path}")
    lines.append("---")
    return "\n".join(lines)


def post_filename(post: dict) -> str:
    """YYYY-MM-DD-slug.md"""
    date_str = post.get("date", "")
    date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    return f"{date.strftime('%Y-%m-%d')}-{post['slug']}.md"


def convert_post(post: dict, skip_images: bool) -> dict:
    """Convert one post; return {path, downloaded_count}."""
    print(f"\n{post['slug']} ({post['date'][:10]})")
    print(f"  title: {decode_entities(post['title'])[:80]}")

    # Featured image
    featured_local = None
    featured_url = post.get("featured_image")
    if featured_url and not skip_images:
        fs, local = local_image_path(featured_url)
        if download_image(featured_url, fs):
            print(f"  featured: downloaded {fs.name}")
        featured_local = local
    elif featured_url:
        _, featured_local = local_image_path(featured_url)

    # Content
    content_html, downloaded = process_content(post.get("content", ""), skip_images)
    if downloaded:
        print(f"  images: {len(downloaded)} downloaded")

    # Markdown convert
    markdown = html_to_markdown(content_html)
    # Ensure every <img> has an alt attribute (pandoc strips empty alt; apply post-conversion).
    # WP posts often had no alt text — empty alt is decorative-image semantic.
    # Brian can write descriptive alt during review.
    markdown = ensure_alt(markdown)
    # Upgrade external http:// links to https:// — most domains support it.
    # Won't touch /assets/ paths (those don't have a scheme) or already-https links.
    # A few obscure sites may not support https; flag during launch review.
    markdown = re.sub(r'\bhttp://', 'https://', markdown)
    # Strip broken UUID anchor links — pandoc doesn't preserve WordPress block IDs,
    # AND in many cases the destinations don't exist in the WP source either
    # (footnote refs pointing nowhere). Two patterns to strip:
    #   Markdown: [text](#XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX) → text
    #   Raw HTML: <a href="#UUID" ...>text</a> → text
    UUID = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
    markdown = re.sub(rf'\[([^\]]+)\]\(#{UUID}\)', r'\1', markdown)
    markdown = re.sub(rf'<a href="#{UUID}"[^>]*>([^<]+)</a>', r'\1', markdown)

    # Compose file
    front = build_front_matter(post, featured_local)
    out_path = OUT_POSTS_DIR / post_filename(post)
    OUT_POSTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(f"{front}\n\n{markdown}\n", encoding="utf-8")
    print(f"  wrote: {out_path.relative_to(REPO)}")
    return {"path": out_path, "images": len(downloaded)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Convert only the N newest posts (test mode)")
    ap.add_argument("--skip-images", action="store_true",
                    help="Don't download images (faster, for testing markdown)")
    args = ap.parse_args()

    if not POSTS_JSON.exists():
        raise SystemExit(f"No backup at {POSTS_JSON}. Run scripts/backup_wordpress.py first.")

    posts = json.loads(POSTS_JSON.read_text())
    # Sort by date descending (newest first) for --limit behavior
    posts.sort(key=lambda p: p.get("date", ""), reverse=True)
    if args.limit:
        posts = posts[:args.limit]
        print(f"Converting {args.limit} newest posts (of {len(json.loads(POSTS_JSON.read_text()))} total)")
    else:
        print(f"Converting all {len(posts)} posts")

    total_images = 0
    for p in posts:
        try:
            result = convert_post(p, args.skip_images)
            total_images += result["images"]
        except Exception as e:
            print(f"  ! FAILED: {p.get('slug')}: {e}")

    print(f"\nDone. {len(posts)} posts written, {total_images} images downloaded.")


if __name__ == "__main__":
    main()
