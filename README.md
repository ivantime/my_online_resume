# Portfolio

Markdown in, static HTML out, deployed to GitHub Pages.

## Run locally
    npm install
    npm run dev        # http://localhost:8000, rebuilds when you save

`npm run build` writes the site to `dist/`.

## Add a project
Create `content/projects/<slug>.md`:

    ---
    title: My project
    date: 2026-09-19
    summary: One sentence.
    tags: [software-engineering, data-engineering]
    featured: true            # shows on the home page
    role: Solo
    tools: [Python, Docker]
    cover: /img/my-project/cover.webp
    coverAlt: What the cover shows
    links:
      - Source | https://github.com/you/repo
    ---
    Intro paragraph.

    ## Step heading      <- each ## becomes a numbered step in the side rail

Put images in `content/images/` and reference them as `/images/x.png` (or `../images/x.png`, which
also works from a project file). `static/img/` still works for site assets, referenced as `/img/...`.

### Tags become pages
Every tag creates a page at `/for/<tag>/` listing the projects with that tag,
for example `/for/software-engineering/` and `/for/design/`. Give a link to a recruiter
that matches the role. Each page has two tabs: **Showcase** (projects with `featured: true`) and
**All projects**, both ordered newest first by the `date:` header. The home page's featured list and
the Projects tab use the same ordering. Optional title and blurb per tag go in `site.config.json` under `tracks`.

### Typing terminal + output image
    ```python terminal file="fit.py" img="/img/my-project/out.png" alt="Result" caption="What it shows"
    print("code here")
    ```
The code types itself when scrolled into view (with Skip / Replay / Copy buttons), then the image
beside it appears. With reduced-motion enabled, or without JS, everything is shown at once.

## Blog and pages
- `content/blog/*.md` are posts (`title`, `date`, `summary`).
- `content/pages/about.md`, `resume.md`, `contact.md` are the plain pages.
- Add `draft: true` to hide any file.

## Deploy
1. Push to a GitHub repo, then Settings > Pages > Source: GitHub Actions.
2. For a project site at `user.github.io/repo/`, set `"base": "/repo/"` in `site.config.json`.
   Set `"siteUrl"` to enable canonical URLs, a sitemap and robots.txt.

## Responsive layout (Bootstrap)
The Bootstrap 5 grid (`container`, `row`, `col-*`, `d-*` helpers) is bundled into the site's single stylesheet at
build time, so pages resize for phone, laptop and desktop. Only its grid is used (not its global resets), so the
site's own typography stays. Breakpoints: 576 / 768 / 992 / 1200 px. Use the same classes in raw HTML inside
Markdown, for example `<div class="row"><div class="col-md-6">...</div></div>`.

## Performance
No framework, ~4 KB of JS, two self-hosted variable fonts (latin subset), lazy images with
width/height set from the files (no layout shift), and no animation library.
