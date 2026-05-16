#!/usr/bin/env python3
"""Unwrap WordPress block-editor noise around code blocks in converted posts.

Pandoc left behind deeply nested wrappers like:

    <div class="wp-block-code">
    <div class="cm-editor">
    <div class="cm-scroller">

        actual code

    </div>
    </div>
    </div>

These add nothing — the code is just text. This script collapses each
such block to a fenced markdown code block. Targets the 2016 IMF tutorial
posts; safely scans any post with the pattern.

Usage:
    python3 scripts/unwrap_wp_blocks.py             # dry run, show what would change
    python3 scripts/unwrap_wp_blocks.py --apply     # write changes
"""
import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS = REPO / "_posts"

# Match the full nested wrapper, capture the inner content.
# The inner pandoc-emitted code is an indented paragraph (4-space prefix
# from the original <pre>) sitting between blank lines.
PATTERN = re.compile(
    r'<div class="(?:is-style-default )?wp-block-code">\s*\n'
    r'\s*\n'
    r'<div class="cm-editor">\s*\n'
    r'\s*\n'
    r'<div class="cm-scroller">\s*\n'
    r'\s*\n'
    r'\s*\n'
    r'(?P<code>.*?)\n'
    r'\s*\n'
    r'</div>\s*\n'
    r'\s*\n'
    r'</div>\s*\n'
    r'\s*\n'
    r'</div>',
    re.DOTALL,
)


def dedent_code(s: str) -> str:
    """Strip the pandoc 4-space indent that marks a Markdown code block."""
    lines = s.split("\n")
    # find common leading whitespace
    indents = [len(l) - len(l.lstrip()) for l in lines if l.strip()]
    if not indents:
        return s
    common = min(indents)
    return "\n".join(l[common:] if len(l) >= common else l for l in lines)


def transform(text: str) -> tuple[str, int]:
    count = 0
    def repl(m):
        nonlocal count
        count += 1
        code = dedent_code(m.group("code"))
        return f"```python\n{code}\n```"
    new = PATTERN.sub(repl, text)
    return new, count


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes to disk")
    ap.add_argument("-p", "--path-contains", help="filter by post filename substring")
    args = ap.parse_args()

    posts = sorted(POSTS.glob("*.md"))
    if args.path_contains:
        posts = [p for p in posts if args.path_contains in p.name]

    total_files = 0
    total_blocks = 0
    for p in posts:
        text = p.read_text(encoding="utf-8")
        new, count = transform(text)
        if count == 0:
            continue
        total_files += 1
        total_blocks += count
        print(f"{p.name}  {count} block(s)")
        if args.apply:
            p.write_text(new, encoding="utf-8")

    if total_files == 0:
        print("No matching wp-block-code wrappers found.")
        return 0

    print(f"\n{total_blocks} blocks across {total_files} file(s).")
    if args.apply:
        print("Written.")
    else:
        print("(Re-run with --apply to write.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
