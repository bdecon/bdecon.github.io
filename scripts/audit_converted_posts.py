#!/usr/bin/env python3
"""Quick quality audit of converted blog posts.

Flags per-post issues that a manual review pass should look at:
- raw HTML embedded (significant amount = needs cleanup decision)
- code blocks present (verify they render)
- tables present
- broken-looking patterns (escaped chars, weird characters)
- external links (count, helps spot link-heavy posts)
- post length (warn on suspiciously short)

Run: python3 scripts/audit_converted_posts.py
"""
import re
from pathlib import Path

POSTS_DIR = Path(__file__).resolve().parent.parent / "_posts"


def analyze(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    body = parts[2] if len(parts) >= 3 else text

    # Strip the front matter from the count
    body_len = len(body.strip())

    # Raw HTML tags (count distinct open-tag types, excluding common img/figure/a)
    html_tags = re.findall(r"<([a-zA-Z][a-zA-Z0-9]*)", body)
    html_tag_count = len(html_tags)
    distinct_tags = set(t.lower() for t in html_tags)

    # Specific patterns worth flagging
    has_jupyter = "notebook-container" in body or 'class="cell"' in body
    table_count = body.count("<table")
    pre_count = body.count("<pre")
    fenced_code_count = len(re.findall(r"^```", body, re.MULTILINE)) // 2
    img_count = body.count("<img ")
    figure_count = body.count("<figure")
    link_count = len(re.findall(r"\]\(http", body)) + len(re.findall(r'<a href="http', body))
    escaped_chars = len(re.findall(r"\\[\$%&_]", body))
    # Look for orphan punctuation that suggests bad conversion
    orphan_brackets = len(re.findall(r"\[\s*\]\(", body))

    return {
        "path": path.name,
        "body_len": body_len,
        "html_tags": html_tag_count,
        "distinct_tags": sorted(distinct_tags - {"img", "figure", "a", "br", "hr"}),
        "jupyter_embed": has_jupyter,
        "tables": table_count,
        "pre_blocks": pre_count,
        "fenced_code": fenced_code_count,
        "images": img_count,
        "links": link_count,
        "escaped_chars": escaped_chars,
        "orphan_brackets": orphan_brackets,
    }


def main():
    posts = sorted(POSTS_DIR.glob("*.md"))
    results = [analyze(p) for p in posts]

    print(f"{'Post':<70} {'len':>6} {'html':>5} {'tbl':>3} {'pre':>3} {'imgs':>4} {'lnks':>4}  notes")
    print("-" * 130)
    for r in results:
        notes = []
        if r["jupyter_embed"]:
            notes.append("JUPYTER-HTML")
        if r["body_len"] < 500:
            notes.append("SHORT")
        if r["escaped_chars"] > 5:
            notes.append(f"escaped({r['escaped_chars']})")
        if r["orphan_brackets"]:
            notes.append(f"orphan-link({r['orphan_brackets']})")
        # Flag unusual tags (anything beyond p/h2/h3/h4/strong/em/code/blockquote/ul/ol/li/table-stuff/div/span)
        common = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "code",
                  "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tr",
                  "td", "th", "div", "span", "sub", "sup", "picture", "source",
                  "input", "iframe", "video", "audio", "details", "summary", "noscript",
                  "small", "u", "s", "b", "i"}
        unusual = [t for t in r["distinct_tags"] if t not in common]
        if unusual:
            notes.append("tags=" + ",".join(unusual))
        notes_str = "  " + " ".join(notes) if notes else ""
        print(f"{r['path']:<70} {r['body_len']:>6} {r['html_tags']:>5} "
              f"{r['tables']:>3} {r['pre_blocks']:>3} {r['images']:>4} {r['links']:>4}{notes_str}")

    # Aggregate flags
    n_jupyter = sum(1 for r in results if r["jupyter_embed"])
    n_table = sum(1 for r in results if r["tables"])
    n_short = sum(1 for r in results if r["body_len"] < 500)
    n_no_links = sum(1 for r in results if r["links"] == 0)
    total_imgs = sum(r["images"] for r in results)

    print()
    print(f"Summary: {len(results)} posts")
    print(f"  Posts with embedded Jupyter HTML:  {n_jupyter}  (need code-block cleanup or accept)")
    print(f"  Posts with HTML tables:            {n_table}")
    print(f"  Posts under 500 chars:             {n_short}")
    print(f"  Posts with NO external links:      {n_no_links}")
    print(f"  Total <img> tags across all posts: {total_imgs}")


if __name__ == "__main__":
    main()
