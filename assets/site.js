/* Shared page wiring: theme, links, files, logos, gallery, counters, reveal. */
(function () {
  const S = window.SITE || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const get = (path) => path.split(".").reduce((o, k) => (o ? o[k] : ""), S) || "";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- theme toggle (remembered per browser when storage works) ---- */
  const root = document.documentElement;
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") root.dataset.theme = t; } catch (e) {}
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  $$(".theme-btn").forEach((b) => {
    const paint = () => { b.innerHTML = isDark() ? sun : moon; b.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme"); };
    paint();
    b.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
      paint();
    });
  });

  /* ---- photos ---- */
  $$("[data-photo]").forEach((img) => { const p = get(img.dataset.photo); if (p) img.src = p; else img.closest("[data-photo-wrap]")?.setAttribute("hidden", ""); });

  /* ---- profile links ---- */
  $$("[data-link]").forEach((a) => {
    const u = (S.links || {})[a.dataset.link];
    if (u) { a.href = u; a.hidden = false; if (!a.target) { a.target = "_blank"; a.rel = "noopener"; } } else a.hidden = true;
  });
  $$("[data-email]").forEach((el) => { el.textContent = S.email; if (el.tagName === "A") el.href = "mailto:" + S.email; });

  /* ---- institution logos ---- */
  $$("[data-logo]").forEach((box) => {
    const p = (S.logos || {})[box.dataset.logo];
    if (!p) return;
    const img = new Image(); img.src = p; img.alt = ""; img.loading = "lazy";
    box.innerHTML = ""; box.appendChild(img);
  });

  /* ---- PDFs open in a viewer ---- */
  const viewer = $("#viewer"), frame = $("#viewer-frame");
  $$("[data-file]").forEach((a) => {
    const src = get(a.dataset.file);
    if (!src) { a.hidden = true; return; }
    a.href = src; a.hidden = false;
    a.addEventListener("click", (e) => {
      if (!viewer || !viewer.showModal || matchMedia("(max-width: 620px)").matches) return; // phones: open the PDF directly
      e.preventDefault();
      frame.src = src;
      $("#viewer-open").href = src;
      $("#viewer-title").textContent = a.dataset.title || a.textContent.trim();
      viewer.showModal();
    });
  });
  $$("[data-show-if]").forEach((el) => { el.hidden = !get(el.dataset.showIf); });
  $$("[data-hide-if]").forEach((el) => { el.hidden = !!get(el.dataset.hideIf); });
  if (viewer) {
    $("#viewer-close").addEventListener("click", () => viewer.close());
    viewer.addEventListener("close", () => { frame.src = "about:blank"; });
  }

  /* ---- copy buttons ---- */
  async function copy(text, btn) {
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch (e) { btn.textContent = "Select and copy"; }
    setTimeout(() => (btn.textContent = old), 1600);
  }
  $$("[data-copy-email]").forEach((b) => b.addEventListener("click", () => copy(S.email, b)));
  $$(".cite-btn").forEach((b) => b.addEventListener("click", () => {
    const t = b.closest(".pub-body").querySelector(".cite").innerText.replace(/\s+/g, " ").trim();
    copy(t + (b.dataset.doi ? " doi:" + b.dataset.doi : ""), b);
  }));

  /* ---- gallery ---- */
  const CATS = {
    japan: { title: "Life in Japan", text: "Toyama's mountains, Kyoto's seasons and everyday life in Japan since 2022." },
    events: { title: "Events & Conferences", text: "Talks, posters and research visits: SWARM, SICE FES, AROB, ANTS, and IRIDIA in Brussels." },
    moments: { title: "Life Moments", text: "Lab days, graduation, and the people who made the journey." }
  };
  const items = (S.gallery || []).filter((g) => g && g.src);
  const lb = $("#lightbox");
  let lbList = [], lbIdx = 0;
  function openLb(list, i) {
    if (!lb || !lb.showModal) { window.open(list[i].src, "_blank"); return; }
    lbList = list; lbIdx = i; showLb(); lb.showModal();
  }
  function showLb() {
    const it = lbList[lbIdx];
    $("#lb-img").src = it.src; $("#lb-img").alt = it.caption || "";
    $("#lb-cap").textContent = it.caption || "";
    $("#lb-count").textContent = (lbIdx + 1) + " / " + lbList.length;
    $("#lb-prev").disabled = $("#lb-next").disabled = lbList.length < 2;
  }
  if (lb) {
    const move = (d) => { lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); };
    $("#lb-prev").addEventListener("click", () => move(-1));
    $("#lb-next").addEventListener("click", () => move(1));
    $("#lb-close").addEventListener("click", () => lb.close());
    lb.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") move(-1); if (e.key === "ArrowRight") move(1); });
    lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  }
  const galRoot = $("#gallery-root");
  if (galRoot) {
    const chips = $("#gal-chips");
    const render = (only) => {
      galRoot.innerHTML = "";
      Object.keys(CATS).forEach((key) => {
        if (only && only !== key) return;
        const list = items.filter((g) => (g.category || "moments") === key);
        const sec = document.createElement("section"); sec.className = "gal-cat"; sec.id = key;
        sec.innerHTML = '<div class="gal-cat-head"><h2>' + CATS[key].title + '</h2><p>' + CATS[key].text + "</p></div>";
        if (!list.length) {
          const e = document.createElement("p"); e.className = "gal-empty"; e.textContent = "Photos for this part of the journey are on their way.";
          sec.appendChild(e);
        } else {
          const grid = document.createElement("div"); grid.className = "gal-grid";
          list.forEach((it, i) => {
            const f = document.createElement("figure");
            const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "Open photo: " + (it.caption || "photo"));
            const im = new Image(); im.src = it.src; im.alt = it.caption || ""; im.loading = "lazy"; im.decoding = "async";
            b.appendChild(im); b.addEventListener("click", () => openLb(list, i));
            const c = document.createElement("figcaption"); c.textContent = it.caption || "";
            f.append(b, c); grid.appendChild(f);
          });
          sec.appendChild(grid);
        }
        galRoot.appendChild(sec);
      });
      const vids = S.videos || [];
      if (vids.length && (!only || only === "events")) {
        const sec = document.createElement("section"); sec.className = "gal-cat";
        sec.innerHTML = '<div class="gal-cat-head"><h2>Videos</h2></div>';
        const ul = document.createElement("ul"); ul.className = "plain";
        vids.forEach((v) => { const li = document.createElement("li"); const a = document.createElement("a"); a.href = v.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "▶ " + v.title; li.appendChild(a); ul.appendChild(li); });
        sec.appendChild(ul); galRoot.appendChild(sec);
      }
    };
    if (chips) chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", c === b));
      render(b.dataset.cat || "");
    });
    const start = (location.hash || "").slice(1);
    if (CATS[start] && chips) { $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", c.dataset.cat === start)); render(start); }
    else render("");
  }
  const teaser = $("#gal-teaser");
  if (teaser) {
    const pick = items.slice(0, 4);
    if (!pick.length) teaser.closest("section").hidden = true;
    pick.forEach((it, i) => {
      const a = document.createElement("a"); a.href = "gallery.html#" + (it.category || "moments");
      a.setAttribute("aria-label", it.caption || "Gallery photo");
      const im = new Image(); im.src = it.src; im.alt = it.caption || ""; im.loading = "lazy";
      a.appendChild(im); teaser.appendChild(a);
    });
    // fewer than 4 photos: fill the row with links to the three albums
    Object.keys(CATS).slice(0, Math.max(0, 4 - pick.length)).forEach((key) => {
      const a = document.createElement("a"); a.href = "gallery.html#" + key; a.className = "cat";
      const n = items.filter((g) => (g.category || "moments") === key).length;
      a.innerHTML = '<span class="eyebrow">' + (n ? n + (n === 1 ? " photo" : " photos") : "Album") + "</span><h3>" + CATS[key].title + '</h3><span class="arrow">Open</span>';
      teaser.appendChild(a);
    });
    const n = $("#gal-count"); if (n && items.length >= 4) n.textContent = items.length + " photos";
  }

  /* ---- publication filters ---- */
  const pf = $("#pub-chips");
  if (pf) pf.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    $$(".chip", pf).forEach((c) => c.setAttribute("aria-pressed", c === b));
    $$(".pubgroup").forEach((g) => { g.hidden = !!b.dataset.type && g.dataset.type !== b.dataset.type; });
  });

  /* ---- counters + reveal ---- */
  root.classList.add("js");
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el);
    el.classList.add("in");
    if (el.dataset.count && !reduce) {
      const end = +el.dataset.count, t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  }), { rootMargin: "0px 0px -8% 0px" }) : null;
  $$(".reveal, [data-count]").forEach((el) => { if (io) io.observe(el); else el.classList.add("in"); });

  /* ---- footer year ---- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  $$("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
})();
