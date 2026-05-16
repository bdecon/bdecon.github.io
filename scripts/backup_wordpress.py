#!/usr/bin/env python3
"""Backup briandew.wordpress.com posts to a local JSON file.

Why this exists:
- Insurance: if WordPress.com loses content or you cancel without a Site Redirect,
  the post data lives here.
- Source of truth for the eventual blog migration to `_posts/`.

Pulls the public WP REST API (no auth). Saves to backups/wordpress/posts.json.
Re-running overwrites — the API always returns the latest, including edits.

Run from project root: python3 scripts/backup_wordpress.py
"""
import json
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

SITE = "briandew.wordpress.com"
API = f"https://public-api.wordpress.com/rest/v1.1/sites/{SITE}/posts/"
# Fields explicitly requested so we get everything we'd need to reconstruct.
FIELDS = ",".join([
    "ID", "title", "URL", "slug", "date", "modified",
    "author", "content", "excerpt", "status",
    "categories", "tags", "featured_image", "format",
    "type", "parent", "discussion",
])
PAGE_SIZE = 100  # WP API max per page

OUT_DIR = Path(__file__).resolve().parent.parent / "backups" / "wordpress"
OUT_FILE = OUT_DIR / "posts.json"
META_FILE = OUT_DIR / "backup_meta.json"


def fetch_page(offset: int) -> dict:
    url = f"{API}?number={PAGE_SIZE}&offset={offset}&fields={FIELDS}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    first = fetch_page(0)
    total = first.get("found", 0)
    posts = list(first.get("posts", []))
    print(f"Found {total} posts on {SITE}")

    offset = PAGE_SIZE
    while len(posts) < total:
        page = fetch_page(offset)
        new_posts = page.get("posts", [])
        if not new_posts:
            break
        posts.extend(new_posts)
        offset += PAGE_SIZE
        print(f"  fetched {len(posts)} / {total}")

    # Sort by date ascending (oldest first) for stable git diffs if ever tracked.
    posts.sort(key=lambda p: p.get("date", ""))

    with open(OUT_FILE, "w") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)

    # Compute summary metadata
    categories = set()
    tags = set()
    image_urls = set()
    for p in posts:
        categories.update((p.get("categories") or {}).keys())
        tags.update((p.get("tags") or {}).keys())
        if p.get("featured_image"):
            image_urls.add(p["featured_image"])
        # Pull inline image URLs from content (rough regex-free scan)
        content = p.get("content", "")
        i = 0
        while True:
            i = content.find('<img', i)
            if i == -1:
                break
            src_i = content.find('src="', i)
            if src_i == -1:
                break
            src_i += 5
            end = content.find('"', src_i)
            image_urls.add(content[src_i:end])
            i = end

    summary = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "site": SITE,
        "total_posts": len(posts),
        "date_range": [
            posts[0]["date"] if posts else None,
            posts[-1]["date"] if posts else None,
        ],
        "categories_count": len(categories),
        "categories": sorted(categories),
        "tags_count": len(tags),
        "unique_image_urls": len(image_urls),
    }
    with open(META_FILE, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(posts)} posts to {OUT_FILE}")
    print(f"Date range: {summary['date_range'][0]} .. {summary['date_range'][1]}")
    print(f"Categories ({summary['categories_count']}): {', '.join(summary['categories'])}")
    print(f"Tags: {summary['tags_count']}")
    print(f"Unique image URLs: {summary['unique_image_urls']}")
    print(f"Metadata summary: {META_FILE}")


if __name__ == "__main__":
    main()
