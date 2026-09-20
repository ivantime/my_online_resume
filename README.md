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

### Tags become filters
Every tag becomes a filter button on the Projects page, and a link to it: `/projects/?tag=software-engineering`,
`/projects/?tag=data-engineering`. Give a link like that to a recruiter to show only the projects for their role.
The tag chips on a project page and the "Browse by focus" cards on the home page link the same way. Projects are
listed newest first by the `date:` header, and `featured: true` only controls the home page's featured list.
Optional title and blurb per tag go in `site.config.json` under `tracks`.

### Typing terminal + output image
    ```python terminal file="fit.py" img="/img/my-project/out.png" alt="Result" caption="What it shows"
    print("code here")
    ```
The code types itself when scrolled into view (with Skip / Replay / Copy buttons), then the image
beside it appears. With reduced-motion enabled, or without JS, everything is shown at once.

Add `layout="stack"` to the fence to put the picture under the code instead of beside it (good for wide
tables). With no `img`, the terminal is full width.

### Other blocks
- PDF page: ` ```pdf src="/files/report.pdf" page="3" width="80%" ratio="210/297" caption="..." `
- Live page behind a button: ` ```embed src="https://..." button="Try it" width="90%" ratio="16/9" `
- Equations: write MathML in a `<div class="eq"><math display="block">...</math></div>` block (no library needed).

## Blog and pages
- `content/blog/*.md` are posts (`title`, `date`, `summary`).
- `content/pages/about.md` and `contact.md` are the plain pages. Any other `.md` file added to `content/pages/` becomes a page at `/<name>/`; add it to the `NAV` list in `build.mjs` to get a tab.
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
