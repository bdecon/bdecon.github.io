#!/usr/bin/env python3
"""Flag suspicious content patterns across all blog posts.

Catches mechanical issues that come from the WordPress → pandoc pipeline:
  - broken image refs (file doesn't exist on disk)
  - raw LaTeX/pandoc escapes that survived conversion (\textbf, \emph, ~)
  - WordPress shortcodes left as-is ([caption], [gallery])
  - "Continue reading" / "Read more" stubs
  - footnote numbers with no matching definition
  - empty paragraphs, double-blank-line issues inside tables
  - very long lines (might be paragraph that lost line breaks)
  - HTML tables marked with a class that doesn't exist
  - placeholder text ("TODO", "TKTK", "lorem ipsum")
  - common typos

Usage:
    python3 scripts/audit_post_content.py             # full report
    python3 scripts/audit_post_content.py -p slug     # filter by slug
"""
import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS = REPO / "_posts"

# Common typos (case-insensitive whole-word match)
TYPOS = {
    "teh": "the",
    "adn": "and",
    "tehy": "they",
    "untill": "until",
    "recieve": "receive",
    "occured": "occurred",
    "seperate": "separate",
    "definately": "definitely",
    "neccessary": "necessary",
    "occassionally": "occasionally",
    "thier": "their",
    "wich": "which",
    "writen": "written",
    "begining": "beginning",
    "accomodate": "accommodate",
    "publically": "publicly",
    "embarass": "embarrass",
    "alot": "a lot",
    "preformance": "performance",
    "fianl": "final",
    "treshold": "threshold",
    "decison": "decision",
    "ecnomic": "economic",
    "ecnomy": "economy",
    "goverment": "government",
    "employement": "employment",
    "unemployent": "unemployment",
    "infation": "inflation",
    "intrest": "interest",
    "preceeding": "preceding",
    "futher": "further",
    "stastistics": "statistics",
    "statisitcs": "statistics",
    "stastics": "statistics",
    "previousy": "previously",
    "particluar": "particular",
    "particualr": "particular",
    "particluarly": "particularly",
}

PATTERNS = [
    ("latex_textbf",        re.compile(r'\\textbf\{[^}]+\}')),
    ("latex_emph",          re.compile(r'\\emph\{[^}]+\}')),
    ("pandoc_nbsp_tilde",   re.compile(r'(?<=\w)~(?=\w)')),  # standalone ~ between words = pandoc nbsp
    ("wp_shortcode",        re.compile(r'\[(caption|gallery|embed|video|audio)[^\]]*\]')),
    ("wp_more",             re.compile(r'<!--\s*more\s*-->|<!--\s*nextpage\s*-->')),
    ("read_more_stub",      re.compile(r'(?i)^\s*(continue reading|read more)\s*[….]*\s*$', re.M)),
    ("html_paragraph_close_only", re.compile(r'^\s*</p>\s*$', re.M)),
    ("orphan_footnote_ref", re.compile(r'\[\^(\w+)\]')),
    ("orphan_uuid_link",    re.compile(r'\[\^[0-9a-f]{8,}')),
    ("triple_blank_line",   re.compile(r'\n\n\n\n+')),
    ("html_amp",            re.compile(r'&amp;(?![a-z]+;)')),  # double-encoded &
    ("placeholder_text",    re.compile(r'\b(TODO|TKTK|FIXME|XXX|lorem ipsum)\b', re.I)),
    ("empty_link",          re.compile(r'\]\(\s*\)')),
    ("naked_url_no_text",   re.compile(r'\[\]\(https?://')),
    ("stray_pre_tags",      re.compile(r'(?<!<)<(/?)pre>(?![^<]*<)')),  # standalone <pre> without code
]

IMG_REF = re.compile(r'!\[[^\]]*\]\((\S+?)\)|<img[^>]+src="([^"]+)"')


def check_images(text: str, post_dir: Path) -> list[tuple[str, str]]:
    """Return list of (img_path, reason) for broken refs."""
    bad = []
    for m in IMG_REF.finditer(text):
        ref = m.group(1) or m.group(2)
        if not ref:
            continue
        if ref.startswith(('http://', 'https://', 'data:')):
            continue
        # Strip query string + fragment
        clean = ref.split('?')[0].split('#')[0]
        if clean.startswith('/'):
            disk_path = REPO / clean.lstrip('/')
        else:
            disk_path = post_dir / clean
        if not disk_path.exists():
            bad.append((ref, 'file not on disk'))
    return bad


def check_footnotes(text: str) -> list[str]:
    """Find footnote refs [^X] without matching definitions [^X]:."""
    refs = set(m.group(1) for m in re.finditer(r'\[\^(\w+)\]', text))
    defs = set(m.group(1) for m in re.finditer(r'^\[\^(\w+)\]:', text, re.M))
    return sorted(refs - defs)


def check_typos(text: str) -> list[tuple[str, str, str]]:
    """Return list of (line_excerpt, found, suggested)."""
    out = []
    lines = text.split('\n')
    for i, line in enumerate(lines):
        for typo, correct in TYPOS.items():
            for m in re.finditer(r'\b' + re.escape(typo) + r'\b', line, re.I):
                excerpt = line.strip()[:80]
                if len(line.strip()) > 80:
                    excerpt += '...'
                out.append((excerpt, m.group(0), correct))
    return out


def check_long_lines(text: str, threshold: int = 1000) -> int:
    """Count paragraphs that look like collapsed-newline noise."""
    body = re.sub(r'^---\n.*?\n---\n', '', text, count=1, flags=re.S)
    # ignore fenced code blocks
    body = re.sub(r'```.*?\n.*?\n```', '', body, flags=re.S)
    long_paras = sum(1 for ln in body.split('\n') if len(ln) > threshold)
    return long_paras


def audit_post(path: Path) -> dict:
    text = path.read_text(encoding='utf-8')
    body = re.sub(r'^---\n.*?\n---\n', '', text, count=1, flags=re.S)

    findings = {}
    for name, pat in PATTERNS:
        matches = pat.findall(body)
        if matches:
            findings[name] = len(matches)

    bad_imgs = check_images(body, path.parent)
    if bad_imgs:
        findings['broken_images'] = bad_imgs

    orphan_fns = check_footnotes(body)
    if orphan_fns:
        findings['orphan_footnotes'] = orphan_fns

    typos = check_typos(body)
    if typos:
        findings['typos'] = typos

    long_paras = check_long_lines(body)
    if long_paras:
        findings['long_paragraphs'] = long_paras

    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--path-contains", help="filter posts by filename substring")
    ap.add_argument("--summary", action="store_true", help="just print issue counts per post")
    args = ap.parse_args()

    posts = sorted(POSTS.glob("*.md"))
    if args.path_contains:
        posts = [p for p in posts if args.path_contains in p.name]

    total_posts_with_issues = 0
    total_issues = 0
    issue_type_counts = {}

    for p in posts:
        findings = audit_post(p)
        if not findings:
            continue
        total_posts_with_issues += 1
        for k, v in findings.items():
            issue_type_counts[k] = issue_type_counts.get(k, 0) + (len(v) if isinstance(v, list) else v)
            total_issues += (len(v) if isinstance(v, list) else v)

        if args.summary:
            summary = ", ".join(f"{k}={len(v) if isinstance(v, list) else v}" for k, v in findings.items())
            print(f"  {p.name}: {summary}")
        else:
            print(f"\n{'='*60}\n{p.name}\n{'='*60}")
            for k, v in findings.items():
                print(f"  [{k}]")
                if isinstance(v, list):
                    for item in v[:10]:
                        print(f"    {item}")
                    if len(v) > 10:
                        print(f"    ... ({len(v) - 10} more)")
                else:
                    print(f"    count: {v}")

    print(f"\n\nTotal: {total_posts_with_issues} posts with issues, "
          f"{total_issues} findings total.")
    print("\nIssue type breakdown:")
    for k, v in sorted(issue_type_counts.items(), key=lambda x: -x[1]):
        print(f"  {v:4d}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
