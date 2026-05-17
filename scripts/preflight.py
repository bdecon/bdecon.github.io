#!/usr/bin/env python3
"""Pre-publish check for blog posts.

Runs every audit script and reports a clear pass/fail per check. Designed
to be the last thing you run before pushing a new post live.

Usage:
    python3 scripts/preflight.py             # check everything
    python3 scripts/preflight.py -p slug     # focus on one post

Exit code 0 if all checks pass, 1 if any fail.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POSTS = REPO / "_posts"
DRAFTS = REPO / "_drafts"


class Check:
    def __init__(self, name: str, status: str, detail: str = ""):
        self.name = name
        self.status = status   # "pass" | "warn" | "fail"
        self.detail = detail

    def emoji(self):
        return {"pass": "✓", "warn": "!", "fail": "✗"}[self.status]


def run_cmd(cmd: list[str]) -> tuple[int, str]:
    """Run a subprocess, return (returncode, combined_output)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return r.returncode, (r.stdout + r.stderr).strip()
    except FileNotFoundError:
        return 127, f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return 124, "timed out"


def check_alt_text(filter_post: str | None) -> Check:
    cmd = ["python3", str(REPO / "scripts/audit_alt_text.py")]
    if filter_post:
        cmd += ["-p", filter_post]
    rc, out = run_cmd(cmd)
    # Look for "0 images missing"
    m = re.search(r"Summary:\s+(\d+)\s+images missing alt", out)
    if m:
        n = int(m.group(1))
        if n == 0:
            return Check("alt text", "pass", "all images have alt")
        return Check("alt text", "warn",
                     f"{n} images missing alt — run `python3 scripts/audit_alt_text.py`")
    return Check("alt text", "warn", "(could not parse output)")


def check_content_audit(filter_post: str | None) -> Check:
    cmd = ["python3", str(REPO / "scripts/audit_post_content.py"), "--summary"]
    if filter_post:
        cmd += ["-p", filter_post]
    rc, out = run_cmd(cmd)
    m = re.search(r"Total:\s+(\d+) posts with issues,\s+(\d+) findings", out)
    if m:
        posts_n, findings_n = int(m.group(1)), int(m.group(2))
        # Ignore "long_paragraphs" + "html_amp" which are almost always benign
        # Run again with full detail to see if anything else is flagged
        rc2, out2 = run_cmd(cmd[:-1])  # without --summary
        suspicious = []
        for line in out2.split('\n'):
            for bad in ('broken_images', 'latex_textbf', 'latex_emph',
                        'orphan_footnotes', 'placeholder_text', 'empty_link',
                        'wp_shortcode', 'orphan_uuid_link'):
                if bad in line:
                    suspicious.append(bad)
        if suspicious:
            return Check("content audit", "fail",
                         f"flags: {sorted(set(suspicious))}")
        return Check("content audit", "pass",
                     f"{findings_n} benign findings (long paragraphs, URL encoding)")
    return Check("content audit", "warn", "(could not parse output)")


def check_codespell(filter_post: str | None) -> Check:
    target = POSTS if not filter_post else [
        p for p in POSTS.glob("*.md") if filter_post in p.name
    ]
    if isinstance(target, list) and not target:
        return Check("codespell", "warn", f"no posts match {filter_post!r}")
    cmd = ["codespell"]
    if isinstance(target, list):
        cmd += [str(p) for p in target]
    else:
        cmd += [str(target)]
    rc, out = run_cmd(cmd)
    if rc == 127:
        return Check("codespell", "warn", "not installed (pip install codespell)")
    # codespell exits non-zero on findings
    lines = [l for l in out.split('\n') if ':' in l and '==>' in l]
    if not lines:
        return Check("codespell", "pass", "no typos found")
    return Check("codespell", "warn",
                 f"{len(lines)} potential typos — run `make spellcheck` for details")


def check_build(filter_post: str | None) -> Check:
    cmd = ["bundle", "exec", "jekyll", "build", "--quiet"]
    rc, out = run_cmd(cmd)
    if rc == 0:
        return Check("jekyll build", "pass")
    return Check("jekyll build", "fail", out.split('\n')[-1] if out else "build failed")


def check_htmlproofer(filter_post: str | None) -> Check:
    cmd = ["bundle", "exec", "htmlproofer", "_site", "--disable-external",
           "--allow-missing-href", "--ignore-urls", "/^data:/,/pagefind/"]
    rc, out = run_cmd(cmd)
    if rc == 0:
        return Check("htmlproofer", "pass", "no broken links/images")
    # Look for the failure summary
    m = re.search(r"failures? (?:were|was) found", out)
    last = out.split('\n')[-1] if out else "(unknown)"
    return Check("htmlproofer", "fail", last)


def check_og_image(filter_post: str | None) -> Check:
    """Make sure every post has an OG image in the manifest."""
    import yaml
    manifest_path = REPO / "_data" / "og_images.yml"
    if not manifest_path.exists():
        return Check("og images", "warn",
                     "no _data/og_images.yml — run `make og-images`")
    manifest = yaml.safe_load(manifest_path.read_text()) or {}
    posts = list(POSTS.glob("*.md"))
    if filter_post:
        posts = [p for p in posts if filter_post in p.name]
    missing = []
    for p in posts:
        slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", p.stem)
        if slug not in manifest:
            missing.append(slug)
    if not missing:
        return Check("og images", "pass",
                     f"{len(posts)} post(s) covered by manifest")
    return Check("og images", "warn",
                 f"{len(missing)} post(s) missing OG image — run `make og-images`")


def check_drafts() -> Check:
    if not DRAFTS.exists():
        return Check("drafts", "pass", "no _drafts/")
    drafts = list(DRAFTS.glob("*.md"))
    if not drafts:
        return Check("drafts", "pass", "no current drafts")
    return Check("drafts", "warn",
                 f"{len(drafts)} draft(s) in _drafts/ — won't be published")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--post", help="filter to one post (filename substring)")
    ap.add_argument("--skip-build", action="store_true",
                    help="skip jekyll build + htmlproofer (faster)")
    args = ap.parse_args()

    print("Pre-publish checks", "(filter: " + args.post + ")" if args.post else "")
    print("=" * 50)

    checks = [
        check_codespell(args.post),
        check_alt_text(args.post),
        check_content_audit(args.post),
        check_og_image(args.post),
        check_drafts(),
    ]
    if not args.skip_build:
        checks.append(check_build(args.post))
        checks.append(check_htmlproofer(args.post))

    for c in checks:
        print(f"  {c.emoji()}  {c.name:18s}  {c.detail}")
    print()

    fails = [c for c in checks if c.status == "fail"]
    warns = [c for c in checks if c.status == "warn"]
    if fails:
        print(f"FAIL: {len(fails)} check(s) failed.")
        return 1
    if warns:
        print(f"OK with {len(warns)} warning(s). Review and decide.")
        return 0
    print("All checks pass. Ready to publish.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
