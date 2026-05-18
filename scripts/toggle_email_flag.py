#!/usr/bin/env python3
"""Toggle the `email: true` flag on a post's front matter.

Usage:
    python3 scripts/toggle_email_flag.py --post <slug> --on    # add `email: true`
    python3 scripts/toggle_email_flag.py --post <slug> --off   # remove `email: true`
    python3 scripts/toggle_email_flag.py --post <slug>         # show current state

Always prints what the post will do on the next push.
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
    if re.search(r"^email:\s*true\b", fm, re.MULTILINE):
        return "on"
    if re.search(r"^#\s*email:\s*true\b", fm, re.MULTILINE):
        return "off"
    if re.search(r"^email:\s*false\b", fm, re.MULTILINE):
        return "off"
    return "absent"


def set_on(text: str) -> str:
    """Ensure `email: true` is uncommented + present."""
    # If already on, no-op
    if read_flag(text) == "on":
        return text
    # If commented (`# email: true`), uncomment it
    new = re.sub(r"^#\s*email:\s*true\b.*$", "email: true", text,
                 count=1, flags=re.MULTILINE)
    if new != text:
        return new
    # If `email: false`, flip to true
    new = re.sub(r"^email:\s*false\b.*$", "email: true", text,
                 count=1, flags=re.MULTILINE)
    if new != text:
        return new
    # Not present at all — add it after the date: line
    new = re.sub(r"^(date:\s*\S.*?)$",
                 r"\1\nemail: true",
                 text, count=1, flags=re.MULTILINE)
    return new


def set_off(text: str) -> str:
    """Ensure `email: true` is NOT active. Comment it out if present."""
    if read_flag(text) != "on":
        return text
    new = re.sub(r"^email:\s*true\b.*$", "# email: true", text,
                 count=1, flags=re.MULTILINE)
    return new


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--post", "-p", required=True,
                    help="post slug (filename substring)")
    grp = ap.add_mutually_exclusive_group()
    grp.add_argument("--on", action="store_true",
                     help="set `email: true` — next push will email subscribers")
    grp.add_argument("--off", action="store_true",
                     help="remove `email: true` — next push will publish but not email")
    args = ap.parse_args()

    path = find_post(args.post)
    if not path:
        print(f"No post matches '{args.post}' in _posts/", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8")
    before = read_flag(text)

    if args.on:
        new = set_on(text)
        action = "ON"
    elif args.off:
        new = set_off(text)
        action = "OFF"
    else:
        # Read-only: just report
        print(f"  {path.name}")
        if before == "on":
            print(f"  email flag: ON — next push will EMAIL subscribers")
        else:
            print(f"  email flag: {before} — next push will publish but NOT email")
        return 0

    if new != text:
        path.write_text(new)

    after = read_flag(new)
    print(f"  {path.name}")
    print(f"  email flag: {before} -> {after}")
    if after == "on":
        print(f"")
        print(f"  ⚠️  Next push of this post WILL EMAIL subscribers.")
        print(f"      Run `make preflight POST={args.post}` to double-check.")
        print(f"      To cancel: re-run with --off before pushing.")
    else:
        print(f"")
        print(f"  ✓  Next push will publish the post but NOT email subscribers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
