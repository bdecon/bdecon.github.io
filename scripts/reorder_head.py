#!/usr/bin/env python3
"""
Reorder <head> elements across all HTML pages to a canonical sequence.
Dry-run by default — pass --apply to write changes.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PAGES = [
    'index.html', 'about.html', 'python.html', 'chartbook.html',
    'reports.html', 'indicators.html', 'gdpm.html', 'imfweo.html',
    'imfapi1.html', 'imfapi2.html', 'imfapi3.html', 'blsapi.html',
    'cps.html', 'censusapi.html', 'censusapi2.html', 'treasuryapi.html',
    'beaapi.html',
]

# Priority order for head element categories
ORDER = [
    'charset',          # <meta charset>
    'viewport',         # <meta viewport>
    'title',            # <title>
    'preconnect',       # <link rel="preconnect">
    'stylesheet',       # <link rel="stylesheet"> (github.css, style.css, font-awesome)
    'chart_script',     # <script src="chart.js/adapter">
    'meta_desc',        # <meta name="description">
    'meta_keywords',    # <meta name="keywords">
    'meta_author',      # <meta name="author">
    'canonical',        # <link rel="canonical">
    'og_comment',       # <!-- Open Graph -->
    'og_meta',          # <meta property="og:*">
    'twitter_comment',  # <!-- Twitter Card -->
    'twitter_meta',     # <meta name="twitter:*">
    'site_verify',      # <meta name="google-site-verification">
    'favicon',          # <link rel="apple-touch-icon">, <link rel="icon">, manifest
    'ms_meta',          # <meta name="msapplication-*">, theme-color
    'theme_script',     # Theme detection script block
    'jsonld',           # <script type="application/ld+json">
    'gtag_comment',     # <!-- Google tag -->
    'gtag',             # Google Analytics script blocks
    'inline_style',     # <style> blocks
]


def classify_block(block_text):
    """Classify a head block into a category."""
    t = block_text.strip()

    if re.match(r'<meta\s+charset', t):
        return 'charset'
    if re.match(r'<meta\s+(id="meta"\s+)?name="viewport"', t):
        return 'viewport'
    if re.match(r'<title>', t):
        return 'title'
    if re.match(r'<link\s+rel="preconnect"', t):
        return 'preconnect'
    if re.match(r'<link\s+rel="stylesheet"', t):
        return 'stylesheet'
    if re.match(r'<script\s+src=".*(chart\.js|chartjs-adapter)', t):
        return 'chart_script'
    if re.match(r'<meta\s+name="description"', t):
        return 'meta_desc'
    if re.match(r'<meta\s+name="keywords"', t):
        return 'meta_keywords'
    if re.match(r'<meta\s+name="author"', t):
        return 'meta_author'
    if re.match(r'<link\s+rel="canonical"', t):
        return 'canonical'
    if t == '<!-- Open Graph -->':
        return 'og_comment'
    if re.match(r'<meta\s+property="og:', t):
        return 'og_meta'
    if t == '<!-- Twitter Card -->':
        return 'twitter_comment'
    if re.match(r'<meta\s+name="twitter:', t):
        return 'twitter_meta'
    if re.match(r'<meta\s+name="google-site-verification"', t):
        return 'site_verify'
    if re.match(r'<link\s+rel="(apple-touch-icon|icon|manifest)"', t):
        return 'favicon'
    if re.match(r'<meta\s+name="msapplication', t):
        return 'ms_meta'
    if re.match(r'<meta\s+name="theme-color"', t):
        return 'ms_meta'
    if 'application/ld+json' in t:
        return 'jsonld'
    if t == '<!-- Google tag (gtag.js) -->':
        return 'gtag_comment'
    if re.match(r'<script\s+(async\s+)?src=".*googletagmanager', t):
        return 'gtag'
    if t.startswith('<script>') and 'dataLayer' in block_text:
        return 'gtag'
    if t.startswith('<script>') and 'localStorage' in block_text:
        return 'theme_script'
    if t.startswith('<script') and 'localStorage' in block_text:
        return 'theme_script'
    if t.startswith('<style'):
        return 'inline_style'

    return 'unknown'


def parse_head_blocks(head_lines):
    """Parse head lines into logical blocks (single-line or multi-line)."""
    blocks = []
    i = 0
    while i < len(head_lines):
        line = head_lines[i]
        stripped = line.strip()

        # Skip blank lines
        if not stripped:
            i += 1
            continue

        # Multi-line: <script ...> ... </script>
        if re.match(r'<script', stripped) and '</script>' not in stripped:
            block_lines = [line]
            i += 1
            while i < len(head_lines) and '</script>' not in head_lines[i]:
                block_lines.append(head_lines[i])
                i += 1
            if i < len(head_lines):
                block_lines.append(head_lines[i])
                i += 1
            blocks.append('\n'.join(block_lines))
            continue

        # Multi-line: <style> ... </style>
        if re.match(r'<style', stripped) and '</style>' not in stripped:
            block_lines = [line]
            i += 1
            while i < len(head_lines) and '</style>' not in head_lines[i]:
                block_lines.append(head_lines[i])
                i += 1
            if i < len(head_lines):
                block_lines.append(head_lines[i])
                i += 1
            blocks.append('\n'.join(block_lines))
            continue

        # Single line
        blocks.append(line)
        i += 1

    return blocks


def order_key(category):
    """Return sort key for a category."""
    try:
        return ORDER.index(category)
    except ValueError:
        return len(ORDER)


def process_page(filepath, apply=False):
    """Process a single page. Returns (changed, summary)."""
    text = filepath.read_text()

    # Extract head content
    head_match = re.search(r'(<head>\n?)(.*?)(</head>)', text, re.DOTALL)
    if not head_match:
        return False, f"  No <head> found"

    head_open = head_match.group(1)
    head_content = head_match.group(2)
    head_close = head_match.group(3)
    head_lines = head_content.split('\n')

    # Parse into blocks
    blocks = parse_head_blocks(head_lines)

    # Classify each block
    classified = []
    unknowns = []
    for block in blocks:
        cat = classify_block(block)
        classified.append((cat, block))
        if cat == 'unknown':
            unknowns.append(block.strip()[:80])

    # Current order of categories
    current_order = [cat for cat, _ in classified]

    # Sort by canonical order, stable within same category
    sorted_blocks = sorted(classified, key=lambda x: order_key(x[0]))
    new_order = [cat for cat, _ in sorted_blocks]

    # Check if order changed
    if current_order == new_order:
        summary = "  Already in canonical order"
        if unknowns:
            summary += f"\n  Unknown blocks: {unknowns}"
        return False, summary

    # Build summary of changes
    changes = []
    for i, (old, new) in enumerate(zip(current_order, new_order)):
        if old != new:
            changes.append(f"  Position {i+1}: {old} -> {new}")

    summary = '\n'.join(changes[:10])
    if len(changes) > 10:
        summary += f'\n  ...and {len(changes) - 10} more'
    if unknowns:
        summary += f"\n  Unknown blocks: {unknowns}"

    if apply:
        # Reconstruct head
        new_head_content = '\n'.join(block for _, block in sorted_blocks)
        # Ensure trailing newline before </head>
        if not new_head_content.endswith('\n'):
            new_head_content += '\n'
        new_text = text[:head_match.start()] + head_open + new_head_content + head_close + text[head_match.end():]
        filepath.write_text(new_text)
        summary = "  APPLIED\n" + summary

    return True, summary


def main():
    apply = '--apply' in sys.argv

    if apply:
        print("=== APPLYING CHANGES ===\n")
    else:
        print("=== DRY RUN (pass --apply to write changes) ===\n")

    changed_count = 0
    for page_name in PAGES:
        filepath = ROOT / page_name
        if not filepath.exists():
            print(f"{page_name}: NOT FOUND")
            continue

        changed, summary = process_page(filepath, apply=apply)
        status = "NEEDS REORDER" if changed else "OK"
        print(f"{page_name}: {status}")
        print(summary)
        print()
        if changed:
            changed_count += 1

    print(f"Total: {changed_count} pages {'changed' if apply else 'need reordering'}")


if __name__ == '__main__':
    main()
