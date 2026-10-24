/* Swarm drawing, the home-page background swarm, the teaser arena, and the Swarm Lab.
   Needs engine.js loaded first. */
(function () {
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let COL = {};
  function readCols() {
    const cs = getComputedStyle(document.documentElement);
    ["arena", "grid", "ink", "muted", "line", "scout", "worker", "box", "surface", "bg"].forEach((k) => (COL[k] = cs.getPropertyValue("--" + k).trim()));
  }
  readCols();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readCols);
  new MutationObserver(readCols).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // cover: fill the whole canvas (background use); otherwise keep the 600x380 arena aspect
  function fit(cv, cover) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth || 600;
    const ch = cover ? (cv.clientHeight || 380) : cw * H / W;
    const px = Math.round(cw * dpr), py = Math.round(ch * dpr);
    if (cv.width !== px || cv.height !== py) { cv.width = px; cv.height = py; }
    const ctx = cv.getContext("2d");
    if (cover) {
      const k = Math.max(px / W, py / H);
      ctx.setTransform(k, 0, 0, k, (px - W * k) / 2, (py - H * k) / 2);
    } else ctx.setTransform(px / W, 0, 0, py / H, 0, 0);
    return { ctx, px, py };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(cv, w, opt = {}) {
    const { ctx, px, py } = fit(cv, opt.cover);
    if (opt.cover) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, py); ctx.restore();
    } else { ctx.fillStyle = COL.arena; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    const ext = opt.cover ? 400 : 0;
    for (let x = 20 - ext; x < W + ext; x += 20) { ctx.moveTo(x, -ext); ctx.lineTo(x, H + ext); }
    for (let y = 20 - ext; y < H + ext; y += 20) { ctx.moveTo(-ext, y); ctx.lineTo(W + ext, y); }
    ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = COL.muted; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(GOAL.x, GOAL.y, GOAL.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.muted; ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("GOAL", GOAL.x, GOAL.y + 4);
    ctx.strokeStyle = COL.scout; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ro of w.robots) if (ro.follow) { ctx.moveTo(ro.x, ro.y); ctx.lineTo(ro.follow.x, ro.follow.y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    const pulse = (w.t % 60) / 60;
    for (const ro of w.robots) if (ro.sig) {
      ctx.strokeStyle = COL.scout; ctx.globalAlpha = 0.5 * (1 - pulse);
      ctx.beginPath(); ctx.arc(ro.x, ro.y, 8 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const b = w.box;
    ctx.fillStyle = COL.box; ctx.globalAlpha = w.pushing ? 1 : 0.85;
    roundRect(ctx, b.x - BR * 0.82, b.y - BR * 0.82, BR * 1.64, BR * 1.64, 4); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = opt.cover ? COL.bg : COL.arena; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.x - BR * 0.82, b.y - BR * 0.82); ctx.lineTo(b.x + BR * 0.82, b.y + BR * 0.82);
    ctx.moveTo(b.x + BR * 0.82, b.y - BR * 0.82); ctx.lineTo(b.x - BR * 0.82, b.y + BR * 0.82); ctx.stroke();
    for (const ro of w.robots) {
      ctx.fillStyle = ro.scout ? COL.scout : COL.worker;
      ctx.beginPath(); ctx.arc(ro.x, ro.y, RR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = opt.cover ? COL.bg : COL.arena; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ro.x, ro.y); ctx.lineTo(ro.x + Math.cos(ro.h) * RR, ro.y + Math.sin(ro.h) * RR); ctx.stroke();
    }
    if (w.done === "goal") {
      ctx.fillStyle = COL.ink; ctx.font = "600 13px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText("DELIVERED", GOAL.x, GOAL.y - GOAL.r - 8);
    }
  }

  /* ---------- ambient loops (home background + teaser) ---------- */
  const loops = [];
  function ambient(cv, g, seed, cover) {
    if (!cv) return;
    const L = { cv, g, seed, w: makeWorld(g, seed), pause: 0, vis: true, cover };
    if (reduce) for (let i = 0; i < 700 && !L.w.done; i++) step(L.w);
    loops.push(L);
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (L.vis = e.isIntersecting))).observe(cv);
    draw(cv, L.w, { cover });
  }
  ambient($("hero-arena"), { s: 4, b: 0.9, n: 0.35 }, 3, false);
  ambient($("teaser"), { s: 3, b: 0.8, n: 0.45 }, 11, false);
  addEventListener("resize", () => loops.forEach((L) => draw(L.cv, L.w, { cover: L.cover })));

  /* ---------- Swarm Lab (research page) ---------- */
  const arenaCv = $("arena");
  let lab = null;
  if (arenaCv) lab = setupLab();

  function setupLab() {
    const SEED = EVAL_SEEDS[0];
    const st = { w: null, running: false, speed: 1, mode: "you", vis: true, bestYou: null };
    const userG = () => ({ s: +$("s-scouts").value, b: $("s-beacon").value / 100, n: $("s-noise").value / 100 });
    function renderMix() {
      const s = +$("s-scouts").value, mix = $("mix"); mix.innerHTML = "";
      for (let i = 0; i < N; i++) { const d = document.createElement("span"); d.style.background = i < s ? "var(--scout)" : "var(--worker)"; mix.appendChild(d); }
      $("o-scouts").textContent = s; $("o-beacon").textContent = $("s-beacon").value + "%"; $("o-noise").textContent = $("s-noise").value + "%";
    }
    function reset() { st.w = makeWorld(userG(), SEED); st.running = false; hud(); draw(arenaCv, st.w); }
    function hud() { $("hud").textContent = "t " + (st.w.t / 60).toFixed(1) + " s · box " + Math.round(progress(st.w) * 100) + "%"; }
    function describe(w) {
      const f = fitness(w);
      return w.done === "goal" ? "Delivered in " + (w.t / 60).toFixed(1) + " s · " + points(f) + " pts" : "Time up. Box moved " + Math.round(progress(w) * 100) + "% · " + points(f) + " pts";
    }
    ["s-scouts", "s-beacon", "s-noise"].forEach((id) => $(id).addEventListener("input", () => { renderMix(); if (st.mode === "you") reset(); $("result").textContent = "Press Run trial."; }));
    $("run").addEventListener("click", () => { setTab("you"); reset(); st.running = true; $("result").textContent = "Running…"; });
    $("reset").addEventListener("click", () => { reset(); $("result").textContent = "Reset. Press Run trial."; });
    $("speed").addEventListener("click", (e) => { st.speed = st.speed === 1 ? 4 : 1; e.currentTarget.textContent = "Speed " + st.speed + "×"; e.currentTarget.setAttribute("aria-pressed", st.speed > 1); });

    function setTab(t) {
      st.mode = t;
      $("tab-you").setAttribute("aria-selected", t === "you"); $("tab-evo").setAttribute("aria-selected", t === "evo");
      $("p-you").hidden = t !== "you"; $("p-evo").hidden = t !== "evo";
      if (t === "you") reset();
      else if (evo.best) { st.w = makeWorld(evo.best.g, SEED); st.running = true; }
      else reset();
    }
    $("tab-you").addEventListener("click", () => setTab("you"));
    $("tab-evo").addEventListener("click", () => setTab("evo"));

    const evo = { running: false, hist: [], best: null, gen: 0, worker: null, local: null };
    const genoText = (g) => g.s + " scouts · " + Math.round(g.b * 100) + "% · " + Math.round(g.n * 100) + "%";
    function onReport(rep) {
      evo.gen = rep.gen; evo.hist.push({ best: rep.best.f, mean: rep.mean });
      if (rep.improved) {
        evo.best = rep.best;
        if (st.mode === "evo") { st.w = makeWorld(evo.best.g, SEED); st.running = true; }
      }
      $("e-gen").textContent = rep.gen + " / " + GENS;
      $("e-best").textContent = points(evo.best.f);
      $("e-geno").textContent = genoText(evo.best.g);
      $("evo-load").disabled = false;
      if (rep.improved) $("b-evo").textContent = points(rep.replay);
      drawChart();
      if (rep.last) stopEvo();
    }
    function startEvo() {
      stopEvo();
      evo.hist = []; evo.best = null; evo.gen = 0; evo.running = true;
      $("evo-start").disabled = true; $("evo-stop").disabled = false; $("evo-start").textContent = "Evolving…";
      $("e-gen").textContent = "0 / " + GENS; $("e-best").textContent = "–"; $("e-geno").textContent = "–"; drawChart();
      try {
        evo.worker = new Worker("assets/engine.js");
        evo.worker.onmessage = (e) => onReport(e.data);
        evo.worker.onerror = (e) => { e.preventDefault && e.preventDefault(); if (evo.worker) { evo.worker.terminate(); evo.worker = null; } evo.local = newEvo(); };
        evo.worker.postMessage("start");
      } catch (err) { evo.worker = null; evo.local = newEvo(); }
    }
    function stopEvo() {
      if (evo.worker) { evo.worker.terminate(); evo.worker = null; }
      evo.local = null; evo.running = false;
      $("evo-start").disabled = false; $("evo-stop").disabled = true; $("evo-start").textContent = evo.gen ? "Evolve again" : "Start evolution";
    }
    function evoTick() {
      const t0 = performance.now();
      while (evo.local && performance.now() - t0 < 12) { const rep = evalNext(evo.local); if (rep) onReport(rep); }
    }
    $("evo-start").addEventListener("click", startEvo);
    $("evo-stop").addEventListener("click", stopEvo);
    $("evo-load").addEventListener("click", () => {
      if (!evo.best) return;
      $("s-scouts").value = evo.best.g.s; $("s-beacon").value = Math.round(evo.best.g.b * 100); $("s-noise").value = Math.round(evo.best.g.n * 100);
      renderMix(); setTab("you"); $("result").textContent = "Evolution's design loaded. Press Run trial.";
    });

    function drawChart() {
      const cv = $("chart"), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = cv.clientWidth || 400, ch = 120;
      cv.width = cw * dpr; cv.height = ch * dpr;
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COL.arena; ctx.fillRect(0, 0, cw, ch);
      const L = 30, R = 8, T = 8, B = 20, pw = cw - L - R, ph = ch - T - B;
      ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.fillStyle = COL.muted; ctx.textAlign = "right";
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      [0, 50, 100].forEach((v) => { const y = T + ph - (v / 100) * ph; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(cw - R, y); ctx.stroke(); ctx.fillText(v, L - 5, y + 3); });
      ctx.textAlign = "center"; ctx.fillText("generation", L + pw / 2, ch - 5);
      const hs = evo.hist; if (!hs.length) return;
      const x = (i) => L + (GENS <= 1 ? 0 : (i / (GENS - 1)) * pw), y = (f) => T + ph - Math.min(1, points(f) / 100) * ph;
      const line = (key, col, wdt) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.beginPath(); hs.forEach((h, i) => (i ? ctx.lineTo(x(i), y(h[key])) : ctx.moveTo(x(i), y(h[key])))); ctx.stroke(); };
      line("mean", COL.worker, 1.5); line("best", COL.scout, 2.2);
      const last = hs.length - 1; ctx.fillStyle = COL.scout; ctx.beginPath(); ctx.arc(x(last), y(hs[last].best), 3.5, 0, Math.PI * 2); ctx.fill();
    }

    if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (st.vis = e.isIntersecting))).observe(arenaCv);
    addEventListener("resize", drawChart);
    renderMix(); reset(); drawChart();

    return {
      tick() {
        if (evo.local) evoTick();
        if (st.running) {
          for (let i = 0; i < st.speed && !st.w.done; i++) step(st.w);
          if (st.w.done) {
            st.running = false;
            if (st.mode === "you") {
              const f = fitness(st.w); $("result").textContent = describe(st.w);
              if (st.bestYou === null || f > st.bestYou) { st.bestYou = f; $("b-you").textContent = points(f); }
            } else if (evo.best) {
              setTimeout(() => { if (st.mode === "evo" && evo.best) { st.w = makeWorld(evo.best.g, SEED); st.running = true; } }, 900);
            }
          }
          hud();
        }
        if (st.vis) draw(arenaCv, st.w);
      }
    };
  }

  /* ---------- main loop ---------- */
  function frame() {
    if (!reduce) for (const L of loops) {
      if (!L.vis) continue;
      if (L.w.done) { if (++L.pause > 90) { L.seed++; L.w = makeWorld(L.g, L.seed); L.pause = 0; } }
      else step(L.w);
      draw(L.cv, L.w, { cover: L.cover });
    }
    if (lab) lab.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
