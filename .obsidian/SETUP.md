# Obsidian setup for bd-econ.com

This repo is set up as an Obsidian vault. Open the repo root
(`/home/brian/Documents/bdecon.github.io`) as a vault in Obsidian and you'll
get a writing workspace tuned for the blog.

## First-time setup

1. **Open as vault:** Obsidian → Open folder as vault → pick the repo root.
2. **Trust author:** Obsidian asks before enabling community plugins. Trust.
3. **Enable Templates** (core plugin, already enabled in `core-plugins.json`):
   - Settings → Core plugins → Templates → on
   - Settings → Templates → Template folder location → `.obsidian/templates`
   - Date format → `YYYY-MM-DDTHH:mm:ss-04:00`
   - (These match `.obsidian/templates.json` and the rest of the workflow.)
4. **Optional community plugins** (Settings → Community plugins → Browse):
   - **Linter** — auto-format markdown on save (trims trailing whitespace,
     fixes heading spacing, normalizes blank lines)
   - **Paste image rename** — when you paste a screenshot, prompts for filename
   - **Image converter** — lets you compress images on paste
   - **Outline** — heading navigation (also a core plugin, can use either)

## Creating a new post

Two ways:

### Via the Makefile (terminal)
```bash
make post TITLE="Why X happened"                  # essay, _posts/
make post-update TITLE="Union Membership in 2026" # short data update
make post-release TITLE="bd CPS v0.5 released"    # release announcement
make post-tutorial TITLE="Reading FRED with Python" # python tutorial

# Append ARGS="--draft" to scaffold into _drafts/ instead:
make post TITLE="Half-baked idea" ARGS="--draft"
```

The file appears in `_posts/` (or `_drafts/`) and Obsidian's file explorer
picks it up immediately. Click to open.

### Via Obsidian Templates
1. Create a new note in `_drafts/` (Cmd/Ctrl+N defaults there per `app.json`).
2. Rename it to your post slug (e.g. `why-x-happened.md`).
3. Cmd/Ctrl+P → `Templates: Insert template` → pick `essay` / `data-update`
   / `release` / `tutorial`.
4. The template fills with `{{title}}` set to the filename and `{{date}}` set
   to today.

The Makefile route adds the date prefix automatically and writes into
`_posts/`. The Obsidian Templates route is good for drafts you haven't named
yet.

## Snippets (in-post markup helpers)

The Templates folder also has snippet templates for common in-post markup:

- `snippet-figure.md` — `<figure>` with image and caption
- `snippet-side-by-side.md` — text + image split layout
- `snippet-pull-quote.md` — accent-bordered pull quote

Insert from the same Templates menu while inside a post.

## Image handling

Per `app.json`:
- Default attachment folder: `assets/blog/`
- Pasting/dragging an image into a post saves it under `assets/blog/`.

For organized blog assets, move the image into `assets/blog/YYYY/MM/`
matching the post's date. The scaffolder pre-fills figure paths with that
convention.

## Previewing your draft

```bash
make draft       # serves localhost:4000 with _drafts/ included
make serve       # serves without _drafts/ (just _posts/)
```

Live-reload picks up your saves immediately.

## Publishing a draft

```bash
make publish-draft SLUG=my-post-slug   # moves _drafts/X.md → _posts/YYYY-MM-DD-X.md
```

Then edit the `date:` front-matter field if you want a different publish
date, run `make preflight` to check, and commit + push.

## Pre-publish check

```bash
make preflight                  # full check across all posts
make preflight POST=my-slug     # just one post
make preflight SKIP_BUILD=1     # fast: skip jekyll build + htmlproofer
```

Reports: codespell typos, alt text coverage, content audit, drafts present,
jekyll build, htmlproofer.

## What's gitignored vs committed

- **Committed**: `.obsidian/app.json`, `core-plugins.json`, `templates.json`,
  and the `templates/` folder. These define the shared vault config.
- **Ignored**: per-user state like `workspace.json`, `workspace-mobile.json`,
  `graph.json`, `hotkeys.json`, plugin state, and the `community-plugins.json`
  list (each developer installs what they want).
