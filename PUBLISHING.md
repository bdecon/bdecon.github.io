# Publishing a blog post

This is the canonical guide for getting a blog post from idea to published to (optionally) emailed to subscribers. It's written for both Brian and AI agents helping Brian.

**The mental model**: **publishing** and **emailing** are two separate actions. You always do publishing. You sometimes do emailing. They never happen automatically as a side effect of each other.

---

## TL;DR

```
make post-essay TITLE="My next post"   # scaffolds _posts/YYYY-MM-DD-my-next-post.md
# edit the post body in your editor
make preflight POST=my-next-post       # checks alt text, spelling, build, etc.
git add _posts/... && git commit && git push   # site goes live; NO email

# later, when you actually want to email subscribers:
make email POST=my-next-post           # sets `email: true` on the post
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

## Step 2 — Preview locally

```
make serve              # live-reload dev server at http://127.0.0.1:4000
make draft              # same but builds drafts too (for _drafts/)
```

Open `http://127.0.0.1:4000/blog/YYYY/MM/DD/<slug>/` to see how the post will render. Check the rendered figures, the OG card preview, the related-posts section, etc.

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

## Step 4 — Publish (push)

```
git add _posts/YYYY-MM-DD-<slug>.md assets/blog/YYYY/MM/...
git commit -m "Post: <slug>"
git push
```

That's it. Jekyll builds, GitHub Pages deploys, the post is live at `https://bd-econ.com/blog/YYYY/MM/DD/<slug>/`. No email is sent because the post doesn't have `email: true` yet.

You can iterate on a published post — fix typos, swap images, restructure paragraphs, push again. Still no email.

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
| Pushed a post you didn't mean to publish | `mv _posts/<file> _drafts/`, commit, push. Site removes it on next deploy. Search engines may cache the URL for a few hours. |
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

1. **Don't bypass the opt-in model.** Never add `email: true` to a post on Brian's behalf without explicit confirmation. The flag means "send email to all subscribers" — that's a permanent action.
2. **Always run `make preflight POST=<slug>` before suggesting a push.** Surface the `email opt-in` line in your summary so Brian sees whether the push will email.
3. **Default to draft-style editing.** Iterate freely on the post content. Run preflight after substantive changes. Only suggest the email step when Brian explicitly says "I want to email subscribers" or equivalent.
4. **If Brian asks to email**, use `make email POST=<slug>` (or edit the front matter to add `email: true`) and then explicitly confirm: "This push will email N subscribers. Proceed?"
5. **Recovery context**: read the "Recovery" table above and apply when Brian reports a mistake.

If Brian asks how to do something not covered here, check `CLAUDE.md` for the broader site architecture or `scripts/` for the specific automation involved.

## Reference

- Newsletter platform: Buttondown free tier (≤100 subs). See CLAUDE.md "Newsletter" section.
- Subscribe form: `_includes/newsletter-signup.html` — works without JS.
- Email sender script: `scripts/email_new_posts.py`
- Workflow: `.github/workflows/email-new-posts.yml` (auto-fires after Jekyll deploy)
- Preflight: `scripts/preflight.py`
- Scaffolder: `scripts/new_post.py`
- API key: stored as repo secret `BUTTONDOWN_API_KEY`
