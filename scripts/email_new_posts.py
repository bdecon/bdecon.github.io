#!/usr/bin/env python3
"""Email new blog posts to Buttondown subscribers via the free-tier API.

Runs in CI after a successful Jekyll deploy. For each post in `_posts/` that:
  - Was published within the last `WINDOW_DAYS` days (default 3), AND
  - Has `email: true` in its front matter (EXPLICIT OPT-IN), AND
  - Has not already been emailed (checked via post_slug metadata on
    existing Buttondown emails)
... it creates + sends a Buttondown email containing the post.

Chart figures that carry a `data-email-png` attribute are swapped to a static
PNG for the email (email clients can't render inline SVG or interactive
Chart.js/D3) — see `swap_chart_figures`. The email body opens with a
"read on the site" link and ends with a Buttondown `{{ subscribe_form }}` tag.

OPT-IN MODEL — read this carefully:
  Posts default to NOT emailing. The site publishes normally on push, but
  no email goes out. To actually email a post to subscribers, add this
  one line to the post's front matter:

      email: true

  Push that change, the workflow runs, and the email goes out within ~1
  minute. Until that flag is set (or `email: true` is removed before the
  push that introduced the post), no email is ever triggered for that post.

Other guards:
  - Idempotent: re-runs won't double-send (metadata.post_slug dedup)
  - 3-day window (no retroactive blast on install)
  - `published: false` is honored (skipped)

Environment:
  BUTTONDOWN_API_KEY   — required, stored as repo secret
  DRY_RUN              — if "1", prints what it would send but doesn't POST

Usage (CI):
  python3 scripts/email_new_posts.py
Usage (local dry-run):
  BUTTONDOWN_API_KEY=xxx DRY_RUN=1 python3 scripts/email_new_posts.py
"""
import json
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import requests
import yaml

API = "https://api.buttondown.email/v1"
SITE_URL = "https://bd-econ.com"
WINDOW_DAYS = 3            # consider only posts dated within last N days
POSTS_DIR = Path("_posts")
DRY_RUN = os.environ.get("DRY_RUN") == "1"

TOKEN = os.environ.get("BUTTONDOWN_API_KEY")
if not TOKEN:
    sys.exit("BUTTONDOWN_API_KEY env var not set")

HEADERS = {
    "Authorization": f"Token {TOKEN}",
    "Content-Type": "application/json",
    # Required once per API key to opt into actually sending vs drafting.
    # Sending it on every call is harmless.
    "X-Buttondown-Live-Dangerously": "true",
}


def parse_post(path: Path) -> tuple[str, dict, str, date] | None:
    """Return (slug, front_matter, body_markdown, pub_date) or None."""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$", path.name)
    if not m:
        return None
    y, mo, d, slug = m.groups()
    pdate = date(int(y), int(mo), int(d))

    text = path.read_text(encoding="utf-8")
    fm_match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
    if not fm_match:
        return None
    fm = yaml.safe_load(fm_match.group(1)) or {}
    body = fm_match.group(2)
    return slug, fm, body, pdate


def list_recent_posts() -> list[tuple[str, dict, str, date]]:
    """Posts that should email: dated within WINDOW_DAYS AND have email: true
    in front matter. Opt-in: posts default to NOT emailing — adding
    `email: true` to front matter is the explicit signal to send."""
    cutoff = date.today() - timedelta(days=WINDOW_DAYS)
    out = []
    for path in sorted(POSTS_DIR.glob("*.md")):
        parsed = parse_post(path)
        if not parsed:
            continue
        slug, fm, body, pdate = parsed
        if pdate < cutoff:
            continue
        # Skip drafts / unlisted
        if fm.get("published") is False:
            continue
        # Opt-in gate: only send posts with `email: true` in front matter.
        # Default is NOT to email — protects against accidental sends.
        if fm.get("email") is not True:
            continue
        out.append(parsed)
    return out


def get_sent_slugs() -> set[str]:
    """All post slugs already sent (per metadata.post_slug on Buttondown emails)."""
    sent = set()
    url = f"{API}/emails?page_size=100"
    while url:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()
        for email in data.get("results", []):
            meta = email.get("metadata") or {}
            slug = meta.get("post_slug")
            if slug:
                sent.add(slug)
        url = data.get("next")
    return sent


def absolutize_urls(body: str) -> str:
    """Rewrite root-relative URLs in markdown + raw HTML to absolute."""
    # Markdown: [text](/path)  →  [text](https://bd-econ.com/path)
    body = re.sub(r'(\]\()(/[^)]+)\)', rf'\1{SITE_URL}\2)', body)
    # HTML: src="/path"  →  src="https://bd-econ.com/path"
    body = re.sub(r'(src=")(/[^"]+)', rf'\1{SITE_URL}\2', body)
    # HTML: href="/path"  →  href="https://bd-econ.com/path"
    body = re.sub(r'(href=")(/[^"]+)', rf'\1{SITE_URL}\2', body)
    return body


def swap_chart_figures(body: str) -> str:
    """Replace each chart <figure> that carries a data-email-png attribute
    with a plain image.

    Web posts render charts as inline SVG or interactive Chart.js/D3 — none
    of which survives in email (clients strip <svg>, <canvas>, and scripts).
    A chart figure opts into an email-safe version by carrying:

        <figure ... data-email-png="/assets/blog/.../chart.png"> ... </figure>

    For the email, the whole figure is replaced by a Markdown image pointing
    at that static PNG screenshot, plus the figcaption text as an italic
    caption. Figures without the attribute are left untouched.
    """
    fig_re = re.compile(
        r'<figure\b[^>]*\bdata-email-png="(?P<png>[^"]+)"[^>]*>'
        r'(?P<inner>.*?)</figure>',
        re.DOTALL,
    )

    def repl(m: "re.Match") -> str:
        png = m.group("png")
        cap_m = re.search(r"<figcaption[^>]*>(.*?)</figcaption>",
                          m.group("inner"), re.DOTALL)
        caption = re.sub(r"<[^>]+>", "", cap_m.group(1)).strip() if cap_m else ""
        src = png if png.startswith("http") else SITE_URL + png
        img = f'![{caption or "Chart"}]({src})'
        return f"{img}\n\n_{caption}_" if caption else img

    return fig_re.sub(repl, body)


def build_email_body(slug: str, fm: dict, body: str, pdate: date) -> str:
    """Compose the email body: a "read on the site" link, the post itself
    (chart figures swapped to PNGs, URLs absolutized), and a Buttondown
    `{{ subscribe_form }}` tag at the end."""
    perma = (
        f"{SITE_URL}/blog/{pdate.year}/{pdate.month:02d}/{pdate.day:02d}/{slug}/"
    )
    intro = f"_[Read this post on bd-econ.com]({perma})_\n\n"
    body = absolutize_urls(swap_chart_figures(body))
    subscribe = "\n\n---\n\n{{ subscribe_form }}\n"
    return intro + body + subscribe


def send_post(slug: str, fm: dict, body: str, pdate: date) -> None:
    title = fm.get("title", slug)
    payload = {
        "subject": title,
        "body": build_email_body(slug, fm, body, pdate),
        "status": "about_to_send",
        "metadata": {"post_slug": slug},
    }
    if DRY_RUN:
        print(f"  [dry-run] would send: {slug} — {title}")
        return
    r = requests.post(f"{API}/emails", json=payload, headers=HEADERS, timeout=30)
    if r.status_code in (200, 201):
        eid = r.json().get("id", "?")
        print(f"  ✓ sent: {slug} (id={eid})")
    else:
        print(f"  ✗ FAILED: {slug}: HTTP {r.status_code}")
        print(f"    body: {r.text[:400]}")
        sys.exit(1)


def main() -> int:
    posts = list_recent_posts()
    if not posts:
        print(f"No posts within last {WINDOW_DAYS} day(s) have `email: true` "
              f"in front matter. Nothing to email.")
        return 0

    print(f"Found {len(posts)} recent post(s):")
    for slug, fm, _, pdate in posts:
        print(f"  - {pdate}  {slug}  ({fm.get('title', '?')})")

    if DRY_RUN:
        sent_slugs = set()
        print("\n[dry-run] skipping API list of sent emails")
    else:
        sent_slugs = get_sent_slugs()
        if sent_slugs:
            print(f"\nAlready sent ({len(sent_slugs)}): "
                  f"{', '.join(sorted(sent_slugs))}")

    to_send = [p for p in posts if p[0] not in sent_slugs]
    if not to_send:
        print("All recent posts already emailed. Nothing to do.")
        return 0

    print(f"\nSending {len(to_send)} new post(s):")
    for slug, fm, body, pdate in to_send:
        send_post(slug, fm, body, pdate)
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
