// Builds the static site: content/*.md + static/ -> dist/
//   node build.mjs           one-off build
//   node build.mjs --serve   build, serve on :8000, rebuild on change
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, watch } from "node:fs";
import { join, dirname } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import hljs from "highlight.js/lib/common";
import * as imageSize from "image-size";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");
const cfg = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
const sizeOf = imageSize.imageSize ?? imageSize.default;

// ---------- helpers ----------
const BASE = ("/" + (cfg.base || "/").replace(/^\/+|\/+$/g, "") + "/").replace(/\/{2,}/g, "/");
const u = (p = "") => BASE + String(p).replace(/^\/+/, "");
const external = (s) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(s);
const fix = (s) => { s = norm(s); return external(s) ? s : s.startsWith("/") ? u(s) : s; };
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slugify = (s) => String(s).toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-") || "section";
const titleCase = (s) => s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en", { year: "numeric", month: "short", timeZone: "UTC" }) : "");
const warn = (m) => console.warn("  ! " + m);

// content/images/ is served at /images/. Relative paths such as ../images/a.png or images/a.png map there too.
// Same for content/files/ (PDFs and downloads), served at /files/.
const norm = (s) => {
  s = String(s).replace(/^(\.{1,2}\/)*(images|files)\//, "/$2/");
  // A file dropped in content/images/ is found however it is written: /img/a.gif, a.gif or ../images/a.gif.
  const name = s.startsWith("/img/") ? s.slice(5) : /^[^/:.][^/:]*\.\w+$/.test(s) ? s : "";
  if (name && !existsSync(join(ROOT, "static", "img", name)) && existsSync(join(ROOT, "content", "images", name))) return "/images/" + name;
  return s;
};
function dims(src) {
  src = norm(src);
  if (!src || !src.startsWith("/") || src.startsWith("//")) return {};
  const file = src.startsWith("/images/") ? join(ROOT, "content", src) : join(ROOT, "static", src);
  if (!existsSync(file)) { warn(`missing image ${src}`); return {}; }
  try { const { width, height } = sizeOf(readFileSync(file)); return { width, height }; } catch { return {}; }
}
function img(src, alt = "", { eager = false, title } = {}) {
  const { width, height } = dims(src);
  const wh = width ? ` width="${width}" height="${height}"` : "";
  return `<img src="${esc(fix(src))}" alt="${esc(alt)}"${wh}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${title ? ` title="${esc(title)}"` : ""}>`;
}

// Front matter: key: value, key: [a, b], or key: followed by "- item" lines.
function parseFM(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  let key = null;
  const unq = (s) => s.trim().replace(/^["']|["']$/g, "");
  for (const line of m[1].split(/\r?\n/)) {
    let x;
    if ((x = line.match(/^\s+-\s+(.*)$/)) && key) (Array.isArray(data[key]) ? data[key] : (data[key] = [])).push(unq(x[1]));
    else if ((x = line.match(/^([\w-]+):\s*(.*)$/))) {
      key = x[1];
      const v = x[2].trim();
      if (v === "") data[key] = [];
      else if (v.startsWith("[")) data[key] = v.slice(1, v.lastIndexOf("]")).split(",").map(unq).filter(Boolean);
      else if (v === "true" || v === "false") data[key] = v === "true";
      else data[key] = unq(v);
    }
  }
  return { data, body: m[2] };
}

// ---------- markdown ----------
function hl(code, lang) {
  try { if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch {}
  return esc(code);
}
const figure = (src, alt, caption) =>
  `<figure class="wide">${img(src, alt)}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;

function renderMd(body) {
  const headings = [];
  const seen = new Set();
  const md = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const plain = tokens.map((t) => t.text ?? t.raw ?? "").join("");
        let id = slugify(plain), n = 2;
        while (seen.has(id)) id = `${slugify(plain)}-${n++}`;
        seen.add(id);
        headings.push({ depth, id, text: plain });
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      paragraph({ tokens }) {
        // Images become block figures, so split a paragraph around them (a figure can't sit inside <p>).
        let html = "", run = [];
        const flush = () => { if (run.some((t) => (t.raw ?? "").trim())) html += `<p>${this.parser.parseInline(run).trim()}</p>\n`; run = []; };
        for (const t of tokens) {
          if (t.type === "image") { flush(); html += this.image(t) + "\n"; } else run.push(t);
        }
        flush();
        return html;
      },
      image({ href, title, text }) { return figure(href, text, title); },
      link({ href, title, tokens }) {
        const ext = /^https?:/i.test(href);
        return `<a href="${esc(fix(href))}"${title ? ` title="${esc(title)}"` : ""}${ext ? ' rel="noopener"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        const info = (lang || "").trim();
        const [language, ...rest] = info.split(/\s+/);
        const attrs = Object.fromEntries([...info.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
        if (language === "embed") {
          // ```embed src="https://..." button="Click For Interactive Preview" width="90%" ratio="16/9" title="..." caption="..."
          // A button that loads the page in a frame only when clicked (nothing is fetched until then).
          if (!/^https:\/\//i.test(attrs.src || "")) { warn("embed block needs an https src"); return ""; }
          const w = Math.min(100, Math.max(30, parseInt(attrs.width, 10) || 90));
          const ratio = /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(attrs.ratio || "") ? attrs.ratio.replace(/\s/g, "") : "16/9";
          const label = attrs.button || "Click For Interactive Preview";
          const title = attrs.title || "Interactive preview";
          // Without JS the button is a normal link that opens the page in a new tab.
          return `<figure class="wide embed" data-embed data-src="${esc(attrs.src)}" data-title="${esc(title)}"><div class="embed-stage" style="width:${w}%;aspect-ratio:${ratio}"><a class="btn embed-btn" href="${esc(attrs.src)}" target="_blank" rel="noopener">${esc(label)}</a></div>
<figcaption>${attrs.caption ? esc(attrs.caption) + " " : ""}<a href="${esc(attrs.src)}" target="_blank" rel="noopener">Open in a new tab</a> <button type="button" class="embed-fs" hidden>Full screen</button></figcaption></figure>
`;
        }
        if (language === "pdf") {
          // ```pdf src="/files/report.pdf" page="3" height="700" title="Report" caption="..."
          if (!attrs.src) { warn("pdf block without src"); return ""; }
          const page = Math.max(1, parseInt(attrs.page, 10) || 1);
          const h = Math.min(1600, Math.max(300, parseInt(attrs.height, 10) || 700));
          const title = attrs.title || "PDF document";
          const file = fix(attrs.src);
          // width="90%" centres the slide at that width. ratio="16/9" reserves its shape while it loads;
          // once loaded, the page's real shape is used, so the whole page always shows.
          const w = Math.min(100, Math.max(30, parseInt(attrs.width, 10) || 100));
          const ratio = /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(attrs.ratio || "") ? attrs.ratio.replace(/\s/g, "") : "";
          const style = `width:${w}%;${ratio ? `aspect-ratio:${ratio}` : `height:${h}px`}`;
          // js/pdf.js draws the page (canvas + selectable text + clickable links). No JS: a locked viewer.
          return `<figure class="wide pdf" data-pdf data-src="${esc(file)}" data-page="${page}"><div class="pdf-stage" style="${style}"><noscript><iframe src="${esc(file)}#page=${page}&amp;view=Fit&amp;toolbar=0&amp;navpanes=0&amp;scrollbar=0" title="${esc(title)}" inert></iframe></noscript></div>
<figcaption>${attrs.caption ? esc(attrs.caption) + " " : ""}<a href="${esc(file)}#page=${page}" rel="noopener">Open the PDF${page > 1 ? ` at page ${page}` : ""}</a></figcaption></figure>
`;
        }
        const inner = `<code class="hljs${language ? ` language-${esc(language)}` : ""}">${hl(text, language)}</code>`;
        if (!rest.includes("terminal")) return `<pre class="code">${inner}</pre>\n`;
        // Terminal block: code types itself, then the output image beside it is revealed.
        const out = attrs.img
          ? `<div class="term-out">${img(attrs.img, attrs.alt || "")}${attrs.caption ? `<figcaption>${esc(attrs.caption)}</figcaption>` : ""}</div>`
          : "";
        return `<div class="term-split wide row g-3 align-items-start" data-terminal>
<div class="col-12 col-lg-7"><div class="term">
<div class="term-bar"><span class="term-file">${esc(attrs.file || language || "terminal")}</span><span class="term-actions"><button type="button" data-term-copy hidden>Copy</button><button type="button" data-term-run hidden>Skip</button></span></div>
<pre>${inner}</pre>
</div></div>
${out ? `<div class="col-12 col-lg-5">${out}</div>` : ""}
</div>\n`;
      }
    }
  });
  return { html: md.parse(body), headings };
}

// ---------- content ----------
function load(dir) {
  const d = join(ROOT, "content", dir);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".md") && !f.startsWith("_")).map((f) => {
    const { data, body } = parseFM(readFileSync(join(d, f), "utf8"));
    if (data.draft) return null;
    const slug = data.slug || f.replace(/\.md$/, "");
    const { html, headings } = renderMd(body);
    const tags = [].concat(data.tags || []).map((t) => slugify(t));
    const words = body.split(/\s+/).length;
    return { ...data, slug, tags, html, headings, minutes: Math.max(1, Math.round(words / 200)) };
  }).filter(Boolean).sort(byDate);
}
// Newest first by the `date:` header; undated items last, ties broken by title.
function byDate(a, b) {
  const da = Date.parse(a.date) || 0, db = Date.parse(b.date) || 0;
  return db - da || String(a.title).localeCompare(String(b.title));
}

// ---------- templates ----------
const NAV = [["projects", "Projects"], ["blog", "Blog"], ["about", "About Me"], ["resume", "Resume"], ["contact", "Contact"]];
const themeIcon = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor"/></svg>`;

function head({ title, desc, path, image }) {
  const full = title === cfg.name ? title : `${title} | ${cfg.name}`;
  const url = cfg.siteUrl ? cfg.siteUrl.replace(/\/$/, "") + u(path) : "";
  const ogImg = image && cfg.siteUrl ? cfg.siteUrl.replace(/\/$/, "") + fix(image) : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || cfg.description)}">
<meta name="color-scheme" content="light dark">
${url ? `<link rel="canonical" href="${url}">` : ""}
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc || cfg.description)}">
<meta property="og:type" content="website">
${url ? `<meta property="og:url" content="${url}">` : ""}${ogImg ? `\n<meta property="og:image" content="${ogImg}">` : ""}
<link rel="icon" href="${u("favicon.svg")}" type="image/svg+xml">
<link rel="preload" href="${u("fonts/source-serif-4.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${u("css/site.css")}">
<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="${u("js/site.js")}" defer></script>
</head>`;
}

function shell({ title, desc, path, image, current, main }) {
  return `${head({ title, desc, path, image })}
<body id="top">
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
<div class="container bar-in">
<a class="brand" href="${u()}">${esc(cfg.name)}</a>
<nav aria-label="Main">${NAV.map(([k, l]) => `<a href="${u(k + "/")}"${current === k ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
<button id="theme" class="icon" type="button" aria-label="Switch colour theme" hidden>${themeIcon}</button>
</div>
</header>
<main id="main" class="container" tabindex="-1">
${main}
</main>
<div class="to-top-wrap"><a class="to-top" href="#top">Move to Top</a></div>
<footer class="container foot">
<p>${esc(cfg.name)}</p>
<p class="foot-links">${cfg.links.map((l) => `<a href="${esc(l.url)}"${/^https?:/.test(l.url) ? ' rel="noopener"' : ""}>${esc(l.label)}</a>`).join("")}</p>
</footer>
</body>
</html>
`;
}

const tagLinks = (tags) => tags.length ? `<ul class="tags">${tags.map((t) => `<li><a href="${u(`for/${t}/`)}">${esc(trackTitle(t))}</a></li>`).join("")}</ul>` : "";
const trackTitle = (t) => cfg.tracks?.[t]?.title || titleCase(t);

function workList(items, { filter = false } = {}) {
  return `<ul class="works"${filter ? " data-filter-list" : ""}>${items.map((p) => `<li class="work" data-tags="${esc(p.tags.join(" "))}"><a class="work-link" href="${u(`projects/${p.slug}/`)}"><div class="row g-3 g-md-4 align-items-start">
<div class="col-12 col-md-5 col-lg-4">${p.cover ? img(p.cover, p.coverAlt || "") : ""}</div>
<div class="col-12 col-md-7 col-lg-8 work-text"><h3>${esc(p.title)}</h3><p>${esc(p.summary || "")}</p><p class="work-meta"><span>${esc(fmtDate(p.date))}</span>${p.tags.map((t) => `<span>${esc(trackTitle(t))}</span>`).join("")}</p></div>
</div></a></li>`).join("")}</ul>`;
}

const postList = (posts) => `<ul class="posts">${posts.map((p) => `<li><a href="${u(`blog/${p.slug}/`)}"><h3>${esc(p.title)}</h3><p>${esc(p.summary || "")}</p><p class="work-meta"><span>${esc(fmtDate(p.date))}</span><span>${p.minutes} min read</span></p></a></li>`).join("")}</ul>`;

function home(projects, posts, tags) {
  const featured = projects.filter((p) => p.featured); // already newest first
  const shown = featured.length ? featured : projects.slice(0, 3);
  return `<section class="hero">
<h1>${esc(cfg.name)}</h1>
<p class="lead">${esc(cfg.tagline)}</p>
<p class="hero-links"><a class="btn" href="${u("projects/")}">See projects</a><a class="btn alt" href="${u("about/")}">About me</a></p>
</section>
<section>
<h2>Featured projects</h2>
${workList(shown)}
</section>
${tags.length ? `<section>
<h2>Browse by focus</h2>
<ul class="focus row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-0">${tags.map(([t, n]) => `<li class="col"><a href="${u(`for/${t}/`)}"><strong>${esc(trackTitle(t))}</strong><span>${esc(cfg.tracks?.[t]?.blurb || "")}</span><span class="count">${n} project${n > 1 ? "s" : ""}</span></a></li>`).join("")}</ul>
</section>` : ""}
${posts.length ? `<section>
<h2>Latest writing</h2>
${postList(posts.slice(0, 3))}
</section>` : ""}`;
}

function projectsIndex(projects, tags) {
  return `<h1>Projects</h1>
<p class="lead">Each one explains the process as well as the result.</p>
<div class="filters" role="group" aria-label="Filter by focus" data-filter hidden>
<button type="button" class="chip" data-tag="" aria-pressed="true">All</button>
${tags.map(([t]) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(trackTitle(t))}</button>`).join("")}
</div>
${workList(projects, { filter: true })}`;
}

function article(kind, it) {
  const steps = it.headings.filter((h) => h.depth === 2);
  const rail = steps.length >= 3;
  const meta = [["Date", fmtDate(it.date)], ["Role", it.role], ["Tools", [].concat(it.tools || []).join(", ")], ["Reading time", kind === "post" ? `${it.minutes} min` : ""]].filter(([, v]) => v);
  const links = [].concat(it.links || []).map((l) => l.split("|").map((s) => s.trim())).filter((l) => l[1]);
  return `<article class="doc ${kind}">
<header class="doc-head">
<a class="back" href="${u(kind === "post" ? "blog/" : "projects/")}">${kind === "post" ? "All posts" : "All projects"}</a>
<h1>${esc(it.title)}</h1>
${it.summary ? `<p class="lead">${esc(it.summary)}</p>` : ""}
${meta.length ? `<dl class="meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
${tagLinks(it.tags)}
</header>
${it.cover ? `<figure class="hero-img"${it.coverScale ? ` style="width:max(${Math.min(100, Math.max(10, parseInt(it.coverScale, 10) || 100))}%,min(100%,320px));margin-inline:auto"` : ""}>${img(it.cover, it.coverAlt || "", { eager: true })}</figure>` : ""}
<div class="doc-body${rail ? " has-rail row" : ""}${it.steps === false || kind === "post" ? "" : " steps"}">
${rail ? `<nav class="rail col-lg-3 d-none d-lg-block" aria-label="Steps in this write-up"><ol>${steps.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}</ol></nav>` : ""}
<div class="prose${rail ? " col-12 col-lg-9" : ""}">
${it.html}
${links.length ? `<p class="links">${links.map(([l, url], i) => `<a class="btn${i ? " alt" : ""}" href="${esc(url)}" rel="noopener">${esc(l)}</a>`).join("")}</p>` : ""}
</div>
</div>
</article>`;
}

// ---------- write ----------
function write(path, html) {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}
function copyFonts() {
  const fonts = [
    ["@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2", "source-serif-4.woff2"],
    ["@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2", "source-serif-4-italic.woff2"],
    ["@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "jetbrains-mono.woff2"]
  ];
  mkdirSync(join(OUT, "fonts"), { recursive: true });
  for (const [src, name] of fonts) {
    const from = join(ROOT, "node_modules", src);
    if (existsSync(from)) cpSync(from, join(OUT, "fonts", name));
    else warn(`font not found: ${src} (run npm install)`);
  }
}

// One stylesheet: Bootstrap's grid (containers, rows, columns, display/flex helpers) + the site's own CSS.
// Only the grid part of Bootstrap is used, so its global resets don't override the site's typography.
function bundleCss() {
  const grid = join(ROOT, "node_modules", "bootstrap", "dist", "css", "bootstrap-grid.min.css");
  if (!existsSync(grid)) return warn("bootstrap not found (run npm install)");
  const css = readFileSync(grid, "utf8").replace(/\/\*# sourceMappingURL=.*?\*\//, "");
  writeFileSync(join(OUT, "css", "site.css"), css + "\n" + readFileSync(join(ROOT, "static", "css", "site.css"), "utf8"));
}

// pdf.js is only fetched by pages that contain a ```pdf block (see js/pdf.js).
function copyPdfjs() {
  const dir = join(ROOT, "node_modules", "pdfjs-dist", "build");
  if (!existsSync(dir)) return warn("pdfjs-dist not found (run npm install)");
  mkdirSync(join(OUT, "vendor", "pdfjs"), { recursive: true });
  for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) cpSync(join(dir, f), join(OUT, "vendor", "pdfjs", f));
}

function build() {
  const t0 = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(join(ROOT, "static"), OUT, { recursive: true });
  if (existsSync(join(ROOT, "content", "images"))) cpSync(join(ROOT, "content", "images"), join(OUT, "images"), { recursive: true });
  if (existsSync(join(ROOT, "content", "files"))) cpSync(join(ROOT, "content", "files"), join(OUT, "files"), { recursive: true });
  bundleCss();
  copyFonts();
  copyPdfjs();

  const projects = load("projects");
  const posts = load("blog");
  const pages = load("pages");
  const counts = {};
  projects.forEach((p) => p.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const urls = [""];

  write("index.html", shell({ title: cfg.name, desc: cfg.description, path: "", main: home(projects, posts, tags) }));

  write("projects/index.html", shell({ title: "Projects", desc: "Project write-ups with process notes and results.", path: "projects/", current: "projects", main: projectsIndex(projects, tags) }));
  urls.push("projects/");
  for (const p of projects) {
    const path = `projects/${p.slug}/`;
    write(path + "index.html", shell({ title: p.title, desc: p.summary, path, image: p.cover, current: "projects", main: article("project", p) }));
    urls.push(path);
  }

  write("blog/index.html", shell({ title: "Blog", desc: "Notes and posts.", path: "blog/", current: "blog", main: `<h1>Blog</h1><p class="lead">Notes on what I'm building and learning.</p>${posts.length ? postList(posts) : "<p>No posts yet.</p>"}` }));
  urls.push("blog/");
  for (const p of posts) {
    const path = `blog/${p.slug}/`;
    write(path + "index.html", shell({ title: p.title, desc: p.summary, path, current: "blog", main: article("post", p) }));
    urls.push(path);
  }

  // One page per tag: /for/<tag>/ lists every project carrying that tag.
  for (const [t] of tags) {
    const path = `for/${t}/`;
    const info = cfg.tracks?.[t] || {};
    const all = projects.filter((p) => p.tags.includes(t)).sort(byDate);
    const showcase = all.filter((p) => p.featured);
    // Showcase tab = featured projects with this tag; All projects tab = every project with it. Both newest first.
    const panels = showcase.length
      ? `<div class="tabs" role="tablist" aria-label="${esc(trackTitle(t))} projects" data-tabs hidden>
<button type="button" role="tab" id="tab-showcase" aria-controls="panel-showcase" aria-selected="true">Showcase <span>${showcase.length}</span></button>
<button type="button" role="tab" id="tab-all" aria-controls="panel-all" aria-selected="false" tabindex="-1">All projects <span>${all.length}</span></button>
</div>
<section id="panel-showcase" role="tabpanel" aria-labelledby="tab-showcase" data-panel><h2>Showcase</h2>${workList(showcase)}</section>
<section id="panel-all" role="tabpanel" aria-labelledby="tab-all" data-panel><h2>All projects</h2>${workList(all)}</section>`
      : workList(all);
    write(path + "index.html", shell({
      title: `${trackTitle(t)} projects`, desc: info.blurb, path,
      main: `<h1>${esc(trackTitle(t))}</h1>${info.blurb ? `<p class="lead">${esc(info.blurb)}</p>` : ""}${panels}<p class="more">More about me: <a href="${u("about/")}">About</a>, <a href="${u("resume/")}">Resume</a>, <a href="${u("contact/")}">Contact</a>.</p>`
    }));
    urls.push(path);
  }

  for (const pg of pages) {
    const path = `${pg.slug}/`;
    write(path + "index.html", shell({ title: pg.title, desc: pg.description, path, current: pg.slug, main: `<h1>${esc(pg.title)}</h1><div class="prose page">${pg.html}</div>` }));
    urls.push(path);
  }

  write("404.html", shell({ title: "Page not found", path: "404.html", main: `<h1>Page not found</h1><p class="lead">That address doesn't exist. Try the <a href="${u("projects/")}">projects</a> list.</p>` }));

  if (cfg.siteUrl) {
    const site = cfg.siteUrl.replace(/\/$/, "");
    write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `<url><loc>${site}${u(p)}</loc></url>`).join("\n")}\n</urlset>\n`);
    write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${site}${u("sitemap.xml")}\n`);
  }
  console.log(`Built ${urls.length} pages (${projects.length} projects, ${posts.length} posts, ${tags.length} tags) in ${Date.now() - t0}ms`);
}

// ---------- dev server ----------
const PORT = Number(process.env.PORT) || 8000;
if (process.argv.includes("--serve")) {
  const types = { html: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp", avif: "image/avif", woff2: "font/woff2", json: "application/json", xml: "application/xml", txt: "text/plain", pdf: "application/pdf" };
  const run = () => { try { build(); } catch (e) { console.error(e); } };
  run();
  let timer;
  for (const dir of ["content", "static"]) watch(join(ROOT, dir), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(run, 150); });
  watch(join(ROOT, "build.mjs"), () => console.log("build.mjs changed: restart the dev server to apply."));
  createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.startsWith(BASE)) p = "/" + p.slice(BASE.length);
    if (p.endsWith("/")) p += "index.html";
    const file = join(OUT, p);
    if (!file.startsWith(OUT) || !existsSync(file)) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end(existsSync(join(OUT, "404.html")) ? readFileSync(join(OUT, "404.html")) : "Not found");
    }
    res.writeHead(200, { "content-type": types[file.split(".").pop()] || "application/octet-stream" });
    res.end(readFileSync(file));
  }).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}`));
} else build();
