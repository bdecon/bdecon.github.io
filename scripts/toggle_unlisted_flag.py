#!/usr/bin/env python3
"""Toggle the `unlisted: true` flag on a post's front matter.

Usage:
    python3 scripts/toggle_unlisted_flag.py --post <slug> --on    # mark unlisted
    python3 scripts/toggle_unlisted_flag.py --post <slug> --off   # publish (visible everywhere)
    python3 scripts/toggle_unlisted_flag.py --post <slug>         # show current state

An unlisted post:
  - renders at its real /blog/YYYY/MM/DD/<slug>/ URL (preview the real output)
  - is HIDDEN from the blog index, feed, sitemap, search, category archives,
    related-posts, and the homepage panel

Promotion to fully published = remove the flag, then push.
"""
import argparse
import re
import sys
from pathlib import Path

POSTS = Path(__file__).resolve().parent.parent / "_posts"


def find_post(slug_substring: str) -> Path | None:
    matches = [p for p in POSTS.glob("*.md") if slug_substring in p.name]
    if not matches:
        return None
    if len(matches) > 1:
        print(f"Multiple posts match '{slug_substring}':", file=sys.stderr)
        for m in matches:
            print(f"  {m.name}", file=sys.stderr)
        return None
    return matches[0]


def read_flag(text: str) -> str:
    """Return 'on', 'off', or 'absent'."""
    fm_match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not fm_match:
        return "absent"
    fm = fm_match.group(1)
    if re.search(r"^unlisted:\s*true\b", fm, re.MULTILINE):
        return "on"
    if re.search(r"^#\s*unlisted:\s*true\b", fm, re.MULTILINE):
        return "off"
    if re.search(r"^unlisted:\s*false\b", fm, re.MULTILINE):
        return "off"
    return "absent"


def set_on(text: str) -> str:
    """Ensure `unlisted: true` is uncommented + present."""
    if read_flag(text) == "on":
        return text
    new = re.sub(r"^#\s*unlisted:\s*true\b.*$", "unlisted: true", text,
                 count=1, flags=re.MULTILINE)
    if new != text:
        return new
    new = re.sub(r"^unlisted:\s*false\b.*$", "unlisted: true", text,
                 count=1, flags=re.MULTILINE)
    if new != text:
        return new
    # Not present — add after the date: line
    new = re.sub(r"^(date:\s*\S.*?)$",
                 r"\1\nunlisted: true",
                 text, count=1, flags=re.MULTILINE)
    return new


def set_off(text: str) -> str:
    """Remove the `unlisted: true` line entirely (publish).

    We delete the line rather than comment it because once published, the
    natural state is 'no unlisted flag' — keeping a commented form just
    clutters every post's front matter forever.
    """
    if read_flag(text) != "on":
        return text
    new = re.sub(r"^unlisted:\s*true\b.*\n", "", text,
                 count=1, flags=re.MULTILINE)
    return new


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--post", "-p", required=True,
                    help="post slug (filename substring)")
    grp = ap.add_mutually_exclusive_group()
    grp.add_argument("--on", action="store_true",
                     help="set `unlisted: true` — hide from index/feed/sitemap")
    grp.add_argument("--off", action="store_true",
                     help="remove `unlisted: true` — publish (visible everywhere)")
    args = ap.parse_args()

    path = find_post(args.post)
    if not path:
        print(f"No post matches '{args.post}' in _posts/", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8")
    before = read_flag(text)

    if args.on:
        new = set_on(text)
    elif args.off:
        new = set_off(text)
    else:
        print(f"  {path.name}")
        if before == "on":
            print(f"  unlisted: ON — post is HIDDEN from index/feed/sitemap")
        else:
            print(f"  unlisted: {before} — post is fully PUBLISHED (visible everywhere)")
        return 0

    if new != text:
        path.write_text(new)

    after = read_flag(new)
    print(f"  {path.name}")
    print(f"  unlisted: {before} -> {after}")
    if after == "on":
        print(f"")
        print(f"  Post will be live at its URL on next push, but HIDDEN from")
        print(f"  the blog index, feed, sitemap, related-posts, and search.")
        print(f"  Promote to published: `make publish POST={args.post}`")
    else:
        print(f"")
        print(f"  Post is now PUBLISHED — visible everywhere on next push.")
        print(f"  To email subscribers: `make email POST={args.post}` then push.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
