# Publishing a blog post

This is the canonical guide for getting a blog post from idea to published to (optionally) emailed to subscribers. It's written for both Brian and AI agents helping Brian.

**The mental model**: there are **three** separate states, each with its own deliberate gate.

1. **Unlisted** — the post exists at its real URL on prod, so you can preview the rendered output exactly as readers will see it. Hidden from `/blog/`, the feed, the sitemap, related-posts, the homepage panel, and search. New posts default to this state.
2. **Published** — the post is visible in every listing. Run `make publish POST=<slug>` to promote.
3. **Emailed** — subscribers get an email with the post body. Run `make email POST=<slug>` to opt in, then push.

None of these happen as a side effect of another. You always push to deploy; the front-matter flags on the post control which state the post lands in.

---

## TL;DR

```
make post-essay TITLE="My next post"   # scaffolds with unlisted: true
# edit the post body in your editor
git add _posts/... && git commit && git push   # post lives at its URL but is HIDDEN
                                                # — no email, not in /blog/, not in feed
# preview the live page at https://bd-econ.com/blog/YYYY/MM/DD/my-next-post/
# iterate as much as you want — keep pushing fixes

make preflight POST=my-next-post       # checks alt text, spelling, build, etc.
make publish POST=my-next-post         # strips unlisted: true
git commit && git push                 # now in /blog/, feed, sitemap

# later, when you want to email subscribers:
make email POST=my-next-post           # sets `email: true`
git commit && git push                 # email sends within ~1 minute
```

That's the whole flow. Read on for what each step does and how to recover from mistakes.

---

## Step 1 — Write the post

Pick a template based on what you're writing:

| Command | Use for |
|--|--|
| `make post-essay TITLE="..."` | Long-form analysis (default) |
| `make post-update TITLE="..."` | Short data-update post |
| `make post-release TITLE="..."` | Version bump / changelog |
| `make post-tutorial TITLE="..."` | Python tutorial |

All four scaffolders write to `_posts/YYYY-MM-DD-<slug>.md` with sensible front matter and body skeleton. Add `ARGS="--draft"` to write to `_drafts/` instead (won't publish until you move it).

Other writing tools:
- **Obsidian vault** is configured at `.obsidian/` with templates matching the scaffolders. Open `_posts/` or `_drafts/` in Obsidian for a richer editor.
- **Side-by-side figure layout**: use `<div class="post-split">` — see `_drafts/demo-side-by-side-figure.md` for the canonical example.
- **Inline figures**: `{% include figure.html src="..." alt="..." caption="..." %}`

## Step 2 — Preview

You have two preview paths.

**Local preview** (fast iteration loop, no commits):
```
make serve              # live-reload dev server at http://127.0.0.1:4000
```
Open `http://127.0.0.1:4000/blog/YYYY/MM/DD/<slug>/`.

**Live unlisted preview** (the real thing — see the post on prod, on your phone, share a link with a friend):
```
git add _posts/... && git commit && git push
```
Because `make post-*` scaffolds with `unlisted: true`, the push deploys the post at its real URL but keeps it hidden from `/blog/`, the feed, the sitemap, related-posts, the homepage panel, and site search. The post page itself shows a yellow **Unlisted preview** banner at the top so you can't forget it's not actually published.

Iterate as much as you want — `git commit && git push` again with edits. The post stays unlisted until you explicitly run `make publish`.

Why both paths? Local serve is faster for typo-level edits. Live unlisted is the only way to see the post exactly as readers will see it (same fonts, same dark mode logic, same OG card resolution, same mobile rendering on actual devices). Brian's workflow is "I can't really edit until I see the final version" — that's what live unlisted is for.

## Step 3 — Preflight check

```
make preflight POST=my-next-post
```

Runs every audit at once. Looks for:

- **codespell**: typos (uses `.codespellrc` with your domain ignore-list)
- **alt text**: any `<img>` missing descriptive alt
- **content audit**: malformed images, orphan footnotes, broken WP-block artifacts
- **og images**: confirms OG social card is generated for this post
- **drafts**: warns if you have unrelated drafts pending
- **unlisted state**: lists posts that are still unlisted (hidden) — `make publish POST=<slug>` to promote
- **email opt-in**: ⚠️ **WILL EMAIL ON PUSH: <slug>** if `email: true` is set
- **jekyll build + htmlproofer**: full build, link check

Add `SKIP_BUILD=1` to skip the jekyll/htmlproofer step (faster, useful while iterating).

The single most important line in the output:

```
✓  email opt-in        no posts have `email: true` — push is safe (no email)
```

means your next push will publish the post BUT NOT email subscribers.

If you see:

```
!  email opt-in        WILL EMAIL ON PUSH: <slug>
```

then your next push WILL email subscribers. Make sure that's what you want.

## Step 4 — Publish (promote from unlisted)

When the post is ready to appear in listings:

```
make publish POST=my-next-post        # removes unlisted: true from front matter
git add _posts/... && git commit -m "Publish: <slug>" && git push
```

After the next deploy, the post appears in `/blog/`, the feed, the sitemap, related-posts, the homepage panel, and site search. The yellow Unlisted preview banner disappears. No email is sent because the post doesn't have `email: true` yet.

You can iterate on a published post — fix typos, swap images, restructure paragraphs, push again. Still no email. If you need to take a published post BACK to unlisted (you noticed a serious problem), run `make unlist POST=<slug>`.

## Step 5 — Email subscribers (optional, deliberate)

When the post is ready for subscribers:

```
make email POST=my-next-post     # adds `email: true` to front matter
```

It prints the post slug and confirms the flag is set. Then:

```
git add _posts/... && git commit -m "Email: <slug>" && git push
```

The `email-new-posts` workflow runs ~1 minute after the deploy completes. It:
1. Sees the post is dated within the last 3 days AND has `email: true`
2. Checks Buttondown for an existing email with `metadata.post_slug == <slug>` — none, so proceeds
3. POSTs the post body to Buttondown with `status: about_to_send`
4. Buttondown emails all confirmed subscribers
5. The email shows in your Buttondown archive

**To undo before the email fires**: you have ~60 seconds between push and send. Run `make unmail POST=<slug>` and push immediately. After the email fires, it's out — you can't recall it.

**To re-email the same post**: doesn't work. The `metadata.post_slug` dedup prevents it. If you want to resend, you need to delete the existing email from Buttondown's dashboard first (or pick a new slug).

## Charts in emailed posts

Email clients don't render interactive charts (Chart.js / D3) or inline SVG. A post can still show its chart in the email by pointing at a static PNG:

1. Build the post with its chart as usual (interactive or SVG).
2. Screenshot the chart to a PNG. With `make serve` running:
   ```
   make screenshot URL=http://127.0.0.1:4000/blog/2026/05/20/my-post/ \
                    SELECTOR='#chart1-container' \
                    OUT=assets/blog/2026/05/my-post-chart1.png
   ```
   Select the chart *card*, not the surrounding `<figure>`, so the figcaption isn't captured into the image (the email adds it as a caption line itself).
3. Add `data-email-png="/assets/blog/2026/05/my-post-chart1.png"` to the chart's `<figure>` tag.

On the web the attribute does nothing — the real chart renders. When the post is emailed, `scripts/email_new_posts.py` (`swap_chart_figures`) replaces that figure with the PNG plus the figcaption as a caption line. A chart figure without `data-email-png` is left untouched — and won't show in email.

## Drafts (not ready to publish)

Two ways to keep something hidden:

**A. Put it in `_drafts/`** (Jekyll convention)
```
make post-essay TITLE="..." ARGS="--draft"
# or move an existing post:
mv _posts/YYYY-MM-DD-slug.md _drafts/slug.md
```
Drafts are gitignored from production builds. Won't appear on the live site. Won't email. View locally with `make draft`.

Promote a draft when ready: `make publish-draft SLUG=slug`. Moves it to `_posts/` with today's date.

**B. Set `published: false` in front matter**
Keeps the file in `_posts/` but Jekyll won't render it and the email script will skip it.

## Recovery

| Mistake | Fix |
|--|--|
| Promoted a post to published, but it's not ready | `make unlist POST=<slug>`, commit, push. Post stays at its URL but disappears from /blog/, feed, sitemap. |
| Pushed a post you didn't mean to push at all | `mv _posts/<file> _drafts/`, commit, push. Site removes it on next deploy. Note: it was probably unlisted anyway — only its direct URL would have been reachable. |
| Pushed with `email: true` set by mistake | If <60 seconds: `make unmail POST=<slug>`, commit, push immediately. May still go out depending on timing. After that: nothing to do — email is in subscribers' inboxes. |
| Email went out with a typo | The email content is frozen. Fix the typo on the live site (push a fix), but subscribers got the original. |
| Want to email a post older than 3 days | The 3-day window blocks this by default. Easiest: temporarily edit `WINDOW_DAYS` in `scripts/email_new_posts.py`, OR just send manually from the Buttondown dashboard. |

## Backup workflow: manual send from Buttondown

If the auto-workflow ever breaks (CI issues, API changes, etc.), you can always send manually:

1. Go to https://buttondown.com (logged in as Brian)
2. New Email → paste the post content (or "Import from URL" with the post's permalink)
3. Subject = post title
4. Click "Send now"

The subscribe form on the site doesn't depend on the auto-workflow. Subscribers can still sign up even if CI is broken.

## For AI agents helping with publishing

If Brian asks "help me write a post" or "publish this" or similar:

1. **Don't bypass the opt-in models.** Never run `make publish` OR add `email: true` on Brian's behalf without explicit confirmation. Both are state changes Brian wants control over.
2. **New posts are unlisted by default.** The scaffolder seeds `unlisted: true`. Pushing a freshly-scaffolded post is safe — it goes live at its URL but is hidden from listings. Tell Brian: "Pushed. Preview at <URL>. Unlisted — run `make publish POST=<slug>` when ready."
3. **Always run `make preflight POST=<slug>` before suggesting a publish or email push.** Surface the `unlisted state` and `email opt-in` lines in your summary so Brian sees what state the push will leave the post in.
4. **Default to iterating on the unlisted post.** Brian's stated workflow: "I need to see a final copy before I can really even edit." Use the live unlisted URL as the editorial preview surface; iterate by pushing edits, not by reformulating drafts. Only suggest `make publish` when Brian says the post is ready.
5. **If Brian asks to email**, use `make email POST=<slug>` and then explicitly confirm: "This push will email N subscribers. Proceed?"
6. **Recovery context**: read the "Recovery" table above and apply when Brian reports a mistake.

If Brian asks how to do something not covered here, check `CLAUDE.md` for the broader site architecture or `scripts/` for the specific automation involved.

## Reference

- Newsletter platform: Buttondown free tier (≤100 subs). See CLAUDE.md "Newsletter" section.
- Subscribe form: `_includes/newsletter-signup.html` — works without JS.
- Email sender script: `scripts/email_new_posts.py`
- Workflow: `.github/workflows/email-new-posts.yml` (auto-fires after Jekyll deploy)
- Preflight: `scripts/preflight.py`
- Scaffolder: `scripts/new_post.py`
- API key: stored as repo secret `BUTTONDOWN_API_KEY`
