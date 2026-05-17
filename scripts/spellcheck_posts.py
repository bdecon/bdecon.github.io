#!/usr/bin/env python3
"""Hunspell-driven spellcheck of blog post body text.

Strips front matter, code blocks, HTML tags, URLs, and markdown link/image
syntax before piping through hunspell. Filters out a curated wordlist of
acronyms and names that hunspell doesn't know but Brian uses regularly.

Usage:
    python3 scripts/spellcheck_posts.py            # all posts
    python3 scripts/spellcheck_posts.py -p slug    # filter by filename
    python3 scripts/spellcheck_posts.py -c 5       # cap output at 5 words/post
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS = REPO / "_posts"

# Acronyms, names, and domain terms Brian uses that hunspell doesn't know.
SKIP = set("""
    Trump Obama Biden Reagan Yellen Konczal Sahm Furman Setser Bivens Sanders
    Prebisch Booker Bruenig Bernstein Wertheimer Tedeschi Mishel Wertheimer
    Dube Arrow Atlanta Cleveland Denmark Sweden Norway Germany Finland
    Pakistan Cuba Lebanon Aachen Marseille Mexico Brazil Argentina Vietnam
    Thailand Texas Florida Wisconsin Kentucky Mississippi Wyoming Carolina
    Carolinas Idaho Bozeman Wildwood Punta Tampa Atlanta Raleigh Cary Lansing
    Asheville Lakeland Burlington Fayetteville Springdale Rogers Lafayette
    Greeley Hilton Ocala Crestview Daphne Fairhope Foley Wilmington Sherman
    Denison Homosassa Hormuz Iran Israel China India Japan UK
    sdmx pandas numpy matplotlib pyplot mpl pd np plt csv json url ipython
    pyplot pandas pivot dataframe colormap ipython matplotlib mpl
    fred quandl bls bea census imf weo fomc nber bofit ecb wmata cdc kff cbo
    GDP GDPNow CPI CPI-U CPIU NAIRU FOMC SSDI SSA ASEC JOLTS PCE Fed FRED BEA BLS IMF
    WEO LFP CES CPS BTS WTI OECD BOP IMTS ECB IIP ITG QNEA ANEA SDMX FOB CIF
    SSI EITC ACA HR SaaS SCF CFPB FAQ TOC URL JSON CSV API CDN PR UI UX SaaS
    Microsoft Google Amazon NVIDIA Apple Facebook Meta Alphabet Walmart Tesla
    Trump-era post-pandemic pre-pandemic post-COVID pre-COVID near-zero
    full-time part-time long-term short-term high-income low-income
    middle-income working-age prime-age single-parent two-earner one-earner
    macroeconomic microeconomic non-employed non-supervisory non-wage
    re-encoded re-routing re-encoded sub-page sub-pages full-resolution
    sub-Saharan ipy htmlproofer Pagefind GitHub Lunr Liquid Liquify Liquidfilter
    jekyll-paginate jekyll-sitemap jekyll-feed jekyll-redirect-from
    jekyll-last-modified-at jekyll-feed Pagefind's
    Mike Konczal's Wharton's pp ppt percentages percentile percentiles deciles
    NIPA SOCX Eurostat Pexels Unsplash Lucide WCAG nbsp px webp webp's
    Permian Mar-a-Lago Maddison
    realtime nowcast nowcasts nowcasting overcapacity Eurostat Eurozone
    Markups Mar-a-Lago Iranian Israeli
""".lower().split())


SKIP_PATTERNS = [
    re.compile(r"^[a-z]+'s$", re.I),                # possessive — strip 's
    re.compile(r"^\d+(st|nd|rd|th)$"),              # 1st, 2nd
    re.compile(r"^[a-z]+-?\d+$", re.I),              # codes like Q3, Q1
    re.compile(r"^[A-Z]{2,}\d*$"),                  # acronyms (USD, GDP, IMF, BLS200)
    re.compile(r"^[A-Z][A-Za-z]*\d+[A-Za-z]*$"),    # mixed alphanumeric codes
]


def should_skip(word: str) -> bool:
    if word.lower() in SKIP:
        return True
    if word.lower().rstrip("'s") in SKIP:
        return True
    for pat in SKIP_PATTERNS:
        if pat.match(word):
            return True
    return False


def strip_for_spellcheck(text: str) -> str:
    # Remove front matter
    text = re.sub(r'^---\n.*?\n---', '', text, count=1, flags=re.S)
    # Remove fenced code blocks
    text = re.sub(r'```.*?\n.*?\n```', '', text, flags=re.S)
    # Remove inline code
    text = re.sub(r'`[^`]+`', '', text)
    # Remove HTML tags but keep text content
    text = re.sub(r'<[^>]+>', '', text)
    # Remove URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove image alt text inside link parens
    text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', text)
    # Convert markdown links [text](url) to just text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove leading # headers
    text = re.sub(r'^#+\s*', '', text, flags=re.M)
    return text


def spellcheck_post(path: Path) -> list[str]:
    """Return list of suspicious words for this post (deduplicated)."""
    text = strip_for_spellcheck(path.read_text())
    try:
        result = subprocess.run(
            ['hunspell', '-d', 'en_US', '-l'],
            input=text, capture_output=True, text=True, timeout=10,
        )
        words = set(result.stdout.split())
    except Exception:
        return []
    out = sorted(w for w in words if not should_skip(w) and len(w) > 2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--path-contains", help="filter posts by filename substring")
    ap.add_argument("-c", "--cap", type=int, default=20, help="max words to report per post")
    args = ap.parse_args()

    posts = sorted(POSTS.glob("*.md"))
    if args.path_contains:
        posts = [p for p in posts if args.path_contains in p.name]

    total_posts_flagged = 0
    total_unique_words = set()
    for p in posts:
        words = spellcheck_post(p)
        if not words:
            continue
        total_posts_flagged += 1
        total_unique_words.update(words)
        capped = words[:args.cap]
        print(f"\n{p.name} ({len(words)} flagged)")
        print(f"  {', '.join(capped)}")
        if len(words) > args.cap:
            print(f"  ... ({len(words) - args.cap} more)")

    print(f"\n\n{total_posts_flagged} of {len(posts)} posts flagged. "
          f"{len(total_unique_words)} unique words across all.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
