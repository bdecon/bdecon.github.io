#!/usr/bin/env python3
"""Screenshot a chart element to a PNG for use in emailed blog posts.

Web posts render charts as interactive Chart.js / D3 or as inline SVG — none
of which survives in email (clients strip <svg>, <canvas>, and <script>). This
produces a static PNG of a chart so the emailed version of a post can show it.

How it fits the email pipeline: a chart <figure> in a post carries a
`data-email-png="/assets/blog/.../chart.png"` attribute. On the web the
attribute does nothing; the interactive chart renders normally. When
`scripts/email_new_posts.py` builds the email it swaps that figure for the
PNG (see `swap_chart_figures` there). This script is how you produce the PNG.

It loads a page in headless Chromium (Playwright), waits for the chart to
finish rendering, and screenshots one element by CSS selector at 2x for
crisp output.

Usage:
  python3 scripts/screenshot_chart.py \
      --url http://127.0.0.1:4000/blog/2026/05/20/lose-job-over-childcare/ \
      --selector "#chart1-container" \
      --out assets/blog/2026/05/lose-job-over-childcare-chart1.png

  make screenshot URL=<page> SELECTOR=<css> OUT=<path.png>

The local dev server (`make serve`) is the usual source URL; a live
bd-econ.com URL works too. Select the element you want captured — typically
the chart card itself, not the surrounding <figure> (so the figcaption is
left to the email's own caption line and not duplicated).

Requires: playwright (`pip install playwright` + `playwright install chromium`).
Run locally before pushing; not part of the CI build.
"""
import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


def screenshot(url: str, selector: str, out: Path, wait_ms: int, scale: int) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(device_scale_factor=scale).new_page()
        page.goto(url, wait_until="networkidle", timeout=30000)
        element = page.locator(selector).first
        element.wait_for(state="visible", timeout=15000)
        page.wait_for_timeout(wait_ms)  # let chart animation settle
        element.screenshot(path=str(out))
        browser.close()


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Screenshot a chart element to PNG for emailed posts.")
    ap.add_argument("--url", required=True,
                    help="page URL containing the chart")
    ap.add_argument("--selector", required=True,
                    help="CSS selector of the element to capture")
    ap.add_argument("--out", required=True, help="output PNG path")
    ap.add_argument("--wait", type=int, default=1500,
                    help="extra ms to wait for chart animation (default 1500)")
    ap.add_argument("--scale", type=int, default=2,
                    help="device scale factor — 2 for crisp output (default 2)")
    args = ap.parse_args()

    out = Path(args.out)
    screenshot(args.url, args.selector, out, args.wait, args.scale)
    kb = out.stat().st_size / 1024
    print(f"Wrote {out} ({kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
