#!/usr/bin/env python3
"""Recover line breaks in the 2016 IMF tutorial code blocks.

Pandoc lost newlines when converting WordPress's CodeMirror-styled
<pre><code><div class="cm-line">…</div>…</code></pre> blocks: each
<div class="cm-line"> sibling held one source line, but lacked an
explicit newline, so pandoc concatenated them into a single text run.

This script reads the WordPress backup at backups/wordpress/posts.json,
extracts the cm-line-structured code blocks in their original order
for the two IMF tutorial posts, and replaces the corresponding
```python ... ``` blocks in the Jekyll posts with multi-line versions.

Usage:
    python3 scripts/reformat_imf_code_blocks.py             # dry run
    python3 scripts/reformat_imf_code_blocks.py --apply     # write
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BACKUP = REPO / "backups" / "wordpress" / "posts.json"
POSTS = REPO / "_posts"

# Slugs in WP backup → matching Jekyll post filenames
TARGETS = {
    "machine-reading-imf-data-data-retrieval-with-python":
        "2016-05-01-machine-reading-imf-data-data-retrieval-with-python.md",
    "using-the-imf-data-api-data-retrieval-with-python":
        "2016-08-10-using-the-imf-data-api-data-retrieval-with-python.md",
}

# Match <pre><code>…</code></pre> or <pre><code class="language-python">…</code></pre>
PRE_BLOCK_RE = re.compile(
    r'<pre>\s*<code(?:\s+class="[^"]*")?\s*>(?P<inner>.*?)</code>\s*</pre>',
    re.DOTALL,
)
CM_LINE_RE = re.compile(r'<div class="cm-line">(?P<line>.*?)</div>', re.DOTALL)
# Strip CodeMirror token spans (<span class="tok-...">…</span>) but keep text.
TOK_SPAN_RE = re.compile(r'<span class="tok-[^"]+">(?P<text>.*?)</span>', re.DOTALL)

# Match python code fences in the Jekyll markdown post.
FENCE_RE = re.compile(r"```python\n(?P<body>.*?)\n```", re.DOTALL)


def clean_line(s: str) -> str:
    # Recursively unwrap token spans, then unescape HTML entities.
    prev = None
    while prev != s:
        prev = s
        s = TOK_SPAN_RE.sub(r"\g<text>", s)
    return html.unescape(s)


def extract_blocks_from_html(html_text: str) -> list[str]:
    """Return list of code-block contents (joined by \n) in order of appearance."""
    blocks = []
    for m in PRE_BLOCK_RE.finditer(html_text):
        inner = m.group("inner")
        lines = [clean_line(lm.group("line")) for lm in CM_LINE_RE.finditer(inner)]
        if not lines:
            lines = [clean_line(inner).strip()]
        blocks.append("\n".join(lines))
    return blocks


def rewrite_post(jekyll_text: str, original_blocks: list[str]) -> tuple[str, int]:
    """Replace each ```python …``` block in order with the corresponding original block."""
    idx = [0]
    def repl(_m):
        if idx[0] >= len(original_blocks):
            return _m.group(0)  # leave alone if mismatch
        block = original_blocks[idx[0]]
        idx[0] += 1
        return f"```python\n{block}\n```"
    new = FENCE_RE.sub(repl, jekyll_text)
    return new, idx[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    backup = json.loads(BACKUP.read_text())
    by_slug = {p["slug"]: p for p in backup}

    for slug, filename in TARGETS.items():
        wp = by_slug.get(slug)
        if wp is None:
            print(f"  [skip] no WP entry for {slug}")
            continue
        html_text = wp["content"] if isinstance(wp["content"], str) else wp["content"].get("rendered", "")
        original = extract_blocks_from_html(html_text)

        post_path = POSTS / filename
        post = post_path.read_text(encoding="utf-8")
        fences = FENCE_RE.findall(post)

        print(f"\n{filename}")
        print(f"  WP original code blocks: {len(original)}")
        print(f"  Jekyll ```python fences: {len(fences)}")

        if len(original) != len(fences):
            print(f"  WARNING: count mismatch — replacement will pair by order, extras left as-is")

        new, replaced = rewrite_post(post, original)
        print(f"  Replacing {replaced} block(s)")

        if args.apply:
            post_path.write_text(new, encoding="utf-8")
            print(f"  Written.")
        else:
            # show a diff preview for the first block
            if replaced and fences:
                print(f"  Sample old (first fence): {fences[0][:80]!r}")
                print(f"  Sample new (first block): {original[0][:80]!r}")

    if not args.apply:
        print(f"\n(Re-run with --apply to write.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
