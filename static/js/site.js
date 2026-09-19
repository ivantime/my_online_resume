(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  // ---- move to top: quick eased scroll (about half a second), instant with reduced motion ----
  const toTop = document.querySelector(".to-top");
  if (toTop) {
    toTop.addEventListener("click", (e) => {
      e.preventDefault();
      const from = scrollY;
      const main = document.getElementById("main");
      const done = () => main && main.focus({ preventScroll: true });
      if (!from || reduce) { scrollTo({ top: 0, behavior: "instant" }); return done(); }
      const dur = Math.min(650, 380 + from * 0.03);
      const t0 = performance.now();
      let raf = 0;
      const stop = () => { cancelAnimationFrame(raf); ["wheel", "touchstart", "keydown"].forEach((ev) => removeEventListener(ev, stop)); };
      ["wheel", "touchstart", "keydown"].forEach((ev) => addEventListener(ev, stop, { passive: true })); // the user takes over
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // ease in-out cubic
        scrollTo({ top: from * (1 - eased), behavior: "instant" }); // "instant" overrides the CSS smooth scroll each frame
        if (p < 1) raf = requestAnimationFrame(step); else { stop(); done(); }
      };
      raf = requestAnimationFrame(step);
    });
  }

  // ---- theme toggle (button is hidden until JS runs) ----
  const tb = document.getElementById("theme");
  if (tb) {
    tb.hidden = false;
    tb.onclick = () => {
      const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    };
  }

  // ---- project filter (all projects stay visible without JS) ----
  const filter = document.querySelector("[data-filter]");
  if (filter) {
    filter.hidden = false;
    const items = [...document.querySelectorAll("[data-filter-list] .work")];
    const apply = (tag) => {
      items.forEach((li) => (li.hidden = !!tag && !li.dataset.tags.split(" ").includes(tag)));
      filter.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.tag === tag)));
    };
    filter.addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      apply(c.dataset.tag);
      history.replaceState(null, "", c.dataset.tag ? "?tag=" + c.dataset.tag : location.pathname);
    });
    apply(new URLSearchParams(location.search).get("tag") || "");
  }

  // ---- tabs on /for/<tag>/ (both lists stay visible without JS) ----
  const tabs = document.querySelector("[data-tabs]");
  if (tabs) {
    tabs.hidden = false;
    const btns = [...tabs.querySelectorAll("[role=tab]")];
    const show = (b, focus) => {
      btns.forEach((x) => {
        const on = x === b;
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) b.focus();
      history.replaceState(null, "", b.id === "tab-all" ? "#all" : location.pathname);
    };
    btns.forEach((b, i) => {
      b.onclick = () => show(b);
      b.onkeydown = (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (d) { e.preventDefault(); show(btns[(i + d + btns.length) % btns.length], true); }
      };
    });
    show(location.hash === "#all" ? btns[1] : btns[0]);
  }

  // ---- step rail: highlight current step, fill progress line ----
  const rail = document.querySelector(".rail");
  if (rail) {
    const links = [...rail.querySelectorAll("a")];
    const heads = links.map((a) => document.getElementById(a.hash.slice(1)));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.removeAttribute("aria-current"));
        links[heads.indexOf(en.target)]?.setAttribute("aria-current", "location");
      });
    }, { rootMargin: "-15% 0px -75% 0px" });
    heads.forEach((h) => h && io.observe(h));
    const body = document.querySelector(".doc-body");
    const ol = rail.querySelector("ol");
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = body.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.4 - r.top) / r.height));
      ol.style.setProperty("--p", p.toFixed(3));
    };
    addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  // ---- PDF pages: loaded (with pdf.js) only when near the viewport ----
  const pdfs = document.querySelectorAll("[data-pdf]");
  if (pdfs.length) {
    const pdfModule = new URL("pdf.js", document.currentScript ? document.currentScript.src : location.href).href;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        import(pdfModule).then((m) => m.render(en.target)).catch((err) => {
          console.error("PDF preview failed:", err);
          en.target.querySelector(".pdf-stage").textContent = "The PDF preview could not load. Use the link below to open it.";
        });
      });
    }, { rootMargin: "400px 0px" });
    pdfs.forEach((f) => io.observe(f));
  }

  // ---- interactive preview: the button swaps itself for the live page, sized to fit one screen ----
  document.querySelectorAll("[data-embed]").forEach((fig) => {
    const stage = fig.querySelector(".embed-stage");
    const fs = fig.querySelector(".embed-fs");
    stage.querySelector(".embed-btn").addEventListener("click", (e) => {
      e.preventDefault();
      const frame = document.createElement("iframe");
      frame.src = fig.dataset.src;
      frame.title = fig.dataset.title;
      frame.allow = "fullscreen";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-forms");
      frame.referrerPolicy = "no-referrer";
      frame.setAttribute("scrolling", "no"); // no scrollbar on the frame; wheel and touch scroll this page instead
      stage.style.width = stage.style.aspectRatio = ""; // the open state (CSS) takes over: full width, one screen tall
      fig.classList.add("is-open");
      stage.replaceChildren(frame);
      fig.scrollIntoView({ block: "start" });
      frame.focus({ preventScroll: true });
      if (fs && stage.requestFullscreen) {
        fs.hidden = false;
        fs.onclick = () => stage.requestFullscreen();
      }
    });
  });

  // ---- terminal blocks: type the code, then reveal the output image ----
  document.querySelectorAll("[data-terminal]").forEach((fig) => {
    const code = fig.querySelector("code");
    const pre = code.parentElement;
    const copy = fig.querySelector("[data-term-copy]");
    const run = fig.querySelector("[data-term-run]");
    const full = code.textContent;

    copy.hidden = false;
    copy.onclick = () => {
      navigator.clipboard?.writeText(full).then(() => {
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      });
    };
    if (reduce) return; // reduced motion: code and image are shown complete

    const start = () => {
      // Text nodes of the highlighted code; we reveal them left to right so colours are kept.
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let n; (n = walker.nextNode()); ) nodes.push({ n, t: n.data });

      // Reserve the final height so typing never shifts the layout.
      pre.style.minHeight = pre.offsetHeight + "px";
      // Screen readers get the full code up front; the animated copy is hidden from them.
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = full;
      pre.prepend(sr);
      code.setAttribute("aria-hidden", "true");

      // Cost per character: newlines pause a little, spaces are quick.
      const cum = [];
      let sum = 0;
      for (const ch of full) { sum += ch === "\n" ? 7 : ch === " " ? 0.6 : 1; cum.push(sum); }
      const dur = Math.min(7000, Math.max(2200, full.length * 26));

      const caret = document.createElement("span");
      caret.className = "caret blink";
      caret.setAttribute("aria-hidden", "true");

      const draw = (count) => {
        let left = count, last = null;
        for (const o of nodes) {
          const take = Math.max(0, Math.min(o.t.length, left));
          o.n.data = o.t.slice(0, take);
          if (take > 0) last = o.n;
          left -= o.t.length;
        }
        if (last) last.after(caret); else code.prepend(caret);
      };

      let raf = 0;
      const finish = () => {
        cancelAnimationFrame(raf);
        draw(full.length);
        fig.dataset.state = "done";
        caret.classList.add("blink");
        run.textContent = "Replay";
      };
      const play = () => {
        cancelAnimationFrame(raf);
        fig.dataset.state = "typing";
        caret.classList.remove("blink");
        run.textContent = "Skip";
        const t0 = performance.now();
        let i = 0;
        const tick = (now) => {
          const target = ((now - t0) / dur) * sum;
          while (i < cum.length && cum[i] <= target) i++;
          draw(i);
          if (i >= cum.length) finish(); else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      };
      run.hidden = false;
      run.onclick = () => (fig.dataset.state === "typing" ? finish() : play());

      fig.dataset.state = "ready";
      draw(0);
      caret.classList.add("blink");
      if (!("IntersectionObserver" in window)) return play();
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { io.disconnect(); play(); }
      }, { threshold: 0.6 });
      io.observe(fig);
    };
    (document.fonts?.ready || Promise.resolve()).then(start);
  });
})();
