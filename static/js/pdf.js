// Draws one page of a PDF as a fixed image with a real text layer (selectable) and link areas (clickable).
// Nothing inside scrolls, so the mouse wheel and touch scroll the website. Loaded only on pages with a PDF block.
import * as pdfjs from "../vendor/pdfjs/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const docs = new Map();
const load = (src) => {
  if (!docs.has(src)) docs.set(src, pdfjs.getDocument({ url: src }).promise);
  return docs.get(src);
};
const safe = /^(https?:|mailto:)/i;

export async function render(fig) {
  const stage = fig.querySelector(".pdf-stage");
  const doc = await load(fig.dataset.src);
  const page = await doc.getPage(Math.min(doc.numPages, Number(fig.dataset.page) || 1));
  const natural = page.getViewport({ scale: 1 });
  stage.style.aspectRatio = `${natural.width} / ${natural.height}`; // the whole page always fits
  stage.style.height = "";
  const links = (await page.getAnnotations({ intent: "display" })).filter((a) => a.subtype === "Link" && safe.test(a.url || ""));

  let width = 0, token = 0;
  const draw = async () => {
    const w = Math.round(stage.clientWidth);
    if (!w || w === width) return;
    width = w;
    const my = ++token;
    const scale = w / natural.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.setAttribute("aria-hidden", "true");
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
    if (my !== token) return;

    const text = document.createElement("div");
    text.style.setProperty("--total-scale-factor", scale);
    text.style.setProperty("--scale-round-x", "1px");
    text.style.setProperty("--scale-round-y", "1px");
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport }).render();
    if (my !== token) return;

    const layer = document.createElement("div");
    layer.className = "pdf-links";
    for (const a of links) {
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
      const el = document.createElement("a");
      el.href = a.url;
      el.target = "_blank";
      el.rel = "noopener";
      el.setAttribute("aria-label", a.url);
      Object.assign(el.style, { left: Math.min(x1, x2) + "px", top: Math.min(y1, y2) + "px", width: Math.abs(x2 - x1) + "px", height: Math.abs(y2 - y1) + "px" });
      layer.append(el);
    }
    stage.replaceChildren(canvas, text, layer);
    stage.dataset.ready = "";
  };

  await draw();
  let timer;
  new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 150); }).observe(stage);
}
