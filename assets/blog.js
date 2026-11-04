/* Asad Razzaq: interactive demos for the blog.
   Each <figure class="demo" data-demo="..."> is built when it scrolls into view.
   All models are deliberately simple toy versions, written for this blog. */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const TAU = Math.PI * 2;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- shared helpers ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(TAU * r()); }
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
function colors() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  return { ink: g("--ink"), muted: g("--muted"), line: g("--line"), grid: g("--grid"), arena: g("--arena"), surface: g("--surface"),
    scout: g("--scout"), worker: g("--worker"), obj: g("--obj"), goal: g("--goal"), accent: g("--accent"), box: g("--box") };
}
function rgb(hex) { const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === "text") e.textContent = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
let uid = 0;
function slider(label, min, max, step, value, fmt, onInput, hint) {
  const id = "d" + (++uid), out = el("output", { for: id, text: fmt(value) });
  const inp = el("input", { type: "range", id, min, max, step, value });
  inp.addEventListener("input", () => { out.textContent = fmt(+inp.value); onInput(+inp.value); });
  return { root: el("div", { class: "ctl" }, el("div", { class: "ctl-top" }, el("label", { for: id, text: label }), out), inp, hint ? el("small", { text: hint }) : null), input: inp, set(v) { inp.value = v; out.textContent = fmt(v); } };
}
function seg(label, options, value, onChange) {
  const name = "s" + (++uid);
  const box = el("div", { class: "seg", role: "radiogroup", "aria-label": label });
  for (const [v, text] of options) {
    const inp = el("input", { type: "radio", name, value: v });
    if (String(v) === String(value)) inp.checked = true;
    inp.addEventListener("change", () => inp.checked && onChange(v));
    box.append(el("label", {}, inp, text));
  }
  return el("div", { class: "ctl" }, el("div", { class: "ctl-top" }, el("span", { text: label })), box);
}
function toggle(label, checked, onChange) {
  const inp = el("input", { type: "checkbox" }); inp.checked = checked;
  inp.addEventListener("change", () => onChange(inp.checked));
  return el("label", { class: "demo-toggle" }, inp, label);
}
const button = (text, onClick, primary) => el("button", { class: "btn small" + (primary ? " primary" : ""), type: "button", text, on: { click: onClick } });
function stats(names) {
  const box = el("div", { class: "stats" }), cells = {};
  for (const [k, label] of names) { const b = el("b", { text: "–" }); cells[k] = b; box.append(el("div", {}, el("span", { class: "muted", text: label }), b)); }
  return { root: box, set: (k, v) => { cells[k].textContent = v; } };
}

/* Canvas that keeps its aspect ratio and pixel density. */
function stage(fig, aspect, label) {
  const cv = el("canvas", { role: "img", "aria-label": label });
  const frame = el("div", { class: "demo-stage" }, cv);
  fig.prepend(frame);
  const ctx = cv.getContext("2d");
  const s = { cv, ctx, frame, w: 0, h: 0, dpr: 1, onResize: null };
  const fit = () => {
    const w = frame.clientWidth || 600, h = Math.round(w / aspect), dpr = Math.min(2, devicePixelRatio || 1);
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); Object.assign(s, { w, h, dpr });
    s.onResize && s.onResize();
  };
  fit(); new ResizeObserver(fit).observe(frame);
  return s;
}

/* Runs fn every animation frame while the demo is visible and playing. */
function animator(fig, fn) {
  let visible = false, playing = !reduce, raf = 0;
  const tick = () => { raf = 0; if (!visible || !playing || document.hidden) return; fn(); raf = requestAnimationFrame(tick); };
  const kick = () => { if (!raf && visible && playing && !document.hidden) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { rootMargin: "100px" }).observe(fig);
  document.addEventListener("visibilitychange", kick);
  const api = {
    get playing() { return playing; },
    set(p) { playing = p; api.btn && (api.btn.textContent = p ? "Pause" : "Play"); kick(); },
    btn: null,
    button() { api.btn = button(playing ? "Pause" : "Play", () => api.set(!playing)); return api.btn; },
  };
  return api;
}
function themeWatch(fn) {
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fn);
}
/* Run a long computation in slices so the page stays responsive. */
function chunked(jobs, perSlice, onDone, onProgress) {
  let i = 0;
  const slice = () => { const end = Math.min(jobs.length, i + perSlice); for (; i < end; i++) jobs[i](); onProgress && onProgress(i / jobs.length); if (i < jobs.length) setTimeout(slice, 0); else onDone(); };
  setTimeout(slice, 0);
}
function lineChart(ctx, x, y, w, h, series, c, opts = {}) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  let max = opts.max ?? Math.max(1e-6, ...series.flatMap(s => s.data)), min = opts.min ?? 0;
  const n = Math.max(2, opts.n ?? Math.max(...series.map(s => s.data.length)));
  for (const s of series) {
    if (!s.data.length) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.6; ctx.setLineDash(s.dash || []); ctx.beginPath();
    s.data.forEach((v, i) => { const px = 4 + (w - 8) * i / (n - 1), py = h - 4 - (h - 8) * (v - min) / (max - min || 1); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (opts.label) { ctx.fillStyle = c.muted; ctx.font = "11px " + getComputedStyle(document.body).getPropertyValue("--f-mono"); ctx.fillText(opts.label, 6, 14); }
  ctx.restore();
}
const MONO = () => getComputedStyle(document.documentElement).getPropertyValue("--f-mono") || "monospace";

/* =====================================================================
   1. Ants: foraging with pheromone trails (stigmergy)
   ===================================================================== */
function ants(fig) {
  const GW = 160, GH = 100, SA = 0.6, SD = 4, SPEED = 0.9;
  const st = stage(fig, GW / GH, "Ant colony simulation: ants leave the nest, find food and lay pheromone trails");
  let c = colors(), r = rng(7), w;
  const opt = { n: 250, evap: 0.985, follow: true, show: true };
  const off = el("canvas", { width: GW, height: GH }), octx = off.getContext("2d"), img = octx.createImageData(GW, GH);
  function reset() {
    r = rng((Math.random() * 1e9) | 0);
    w = { t: 0, home: new Float32Array(GW * GH), food: new Float32Array(GW * GH), nest: { x: 24, y: 50 }, foods: [], ants: [], delivered: 0 };
    w.foods.push({ x: 80, y: 22, amt: 400, max: 400, r: 5 }, { x: 135, y: 72, amt: 400, max: 400, r: 5 });
    setCount(opt.n);
  }
  function setCount(n) {
    while (w.ants.length < n) w.ants.push({ x: w.nest.x, y: w.nest.y, a: r() * TAU, carry: false, steps: 0 });
    w.ants.length = n;
  }
  const sample = (f, x, y) => { const i = x | 0, j = y | 0; return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : f[j * GW + i]; };
  function step() {
    w.t++;
    for (const a of w.ants) {
      if (opt.follow) {
        const f = a.carry ? w.home : w.food;
        const s0 = sample(f, a.x + Math.cos(a.a - SA) * SD, a.y + Math.sin(a.a - SA) * SD),
              s1 = sample(f, a.x + Math.cos(a.a) * SD, a.y + Math.sin(a.a) * SD),
              s2 = sample(f, a.x + Math.cos(a.a + SA) * SD, a.y + Math.sin(a.a + SA) * SD);
        const m = Math.max(s0, s1, s2);
        if (m > 0.01) a.a += (m === s0 ? -1 : m === s2 ? 1 : 0) * SA * 0.5;
      }
      a.a += (r() - 0.5) * 0.5;
      if (a.carry) { const dx = w.nest.x - a.x, dy = w.nest.y - a.y; if (dx * dx + dy * dy < 64) a.a = Math.atan2(dy, dx); }
      else for (const f of w.foods) { if (f.amt <= 0) continue; const dx = f.x - a.x, dy = f.y - a.y; if (dx * dx + dy * dy < (f.r + 6) ** 2) a.a = Math.atan2(dy, dx); }
      a.x += Math.cos(a.a) * SPEED; a.y += Math.sin(a.a) * SPEED;
      if (a.x < 1 || a.x > GW - 1) { a.a = Math.PI - a.a; a.x = Math.max(1, Math.min(GW - 1, a.x)); }
      if (a.y < 1 || a.y > GH - 1) { a.a = -a.a; a.y = Math.max(1, Math.min(GH - 1, a.y)); }
      a.steps++;
      const dep = Math.max(0, 1 - a.steps / 400) * 0.25, idx = (a.y | 0) * GW + (a.x | 0);
      if (a.carry) w.food[idx] = Math.min(1, w.food[idx] + dep); else w.home[idx] = Math.min(1, w.home[idx] + dep);
      if (!a.carry) { for (const f of w.foods) if (f.amt > 0 && (f.x - a.x) ** 2 + (f.y - a.y) ** 2 < f.r * f.r) { a.carry = true; f.amt--; a.steps = 0; a.a += Math.PI; break; } }
      else if ((w.nest.x - a.x) ** 2 + (w.nest.y - a.y) ** 2 < 16) { a.carry = false; w.delivered++; a.steps = 0; a.a += Math.PI; }
    }
    const e = opt.follow ? opt.evap : 0;
    for (let i = 0; i < w.home.length; i++) { w.home[i] *= e; w.food[i] *= e; }
  }
  function draw() {
    const { ctx, w: W, h: H } = st, k = W / GW;
    ctx.fillStyle = c.arena; ctx.fillRect(0, 0, W, H);
    if (opt.show) {
      const fc = rgb(c.worker), hc = rgb(c.scout), d = img.data;
      for (let i = 0; i < GW * GH; i++) {
        const a = Math.min(1, w.food[i] * 1.6), b = Math.min(1, w.home[i] * 1.6) * 0.55, s = a + b;
        if (s < 0.01) { d[i * 4 + 3] = 0; continue; }
        d[i * 4] = (fc[0] * a + hc[0] * b) / s; d[i * 4 + 1] = (fc[1] * a + hc[1] * b) / s; d[i * 4 + 2] = (fc[2] * a + hc[2] * b) / s;
        d[i * 4 + 3] = Math.min(255, 255 * Math.max(a, b));
      }
      octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
    }
    for (const f of w.foods) {
      if (f.amt <= 0) { ctx.strokeStyle = c.line; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(f.x * k, f.y * k, f.r * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]); continue; }
      ctx.fillStyle = c.obj; ctx.beginPath(); ctx.arc(f.x * k, f.y * k, Math.max(2, f.r * k * Math.sqrt(f.amt / f.max)), 0, TAU); ctx.fill();
    }
    ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(w.nest.x * k, w.nest.y * k, 4.2 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = c.arena; ctx.font = `600 ${Math.max(9, 2.6 * k)}px ${MONO()}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("nest", w.nest.x * k, w.nest.y * k);
    const sz = Math.max(1.4, k * 0.55);
    ctx.fillStyle = c.ink; for (const a of w.ants) if (!a.carry) ctx.fillRect(a.x * k - sz / 2, a.y * k - sz / 2, sz, sz);
    ctx.fillStyle = c.worker; for (const a of w.ants) if (a.carry) ctx.fillRect(a.x * k - sz, a.y * k - sz, sz * 2, sz * 2);
    S.set("food", w.delivered); S.set("t", w.t); S.set("src", w.foods.filter(f => f.amt > 0).length);
  }
  st.cv.addEventListener("click", ev => {
    const b = st.cv.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * GW, y = (ev.clientY - b.top) / b.height * GH;
    if (Math.hypot(x - w.nest.x, y - w.nest.y) < 12) return;
    w.foods = w.foods.filter(f => f.amt > 0).slice(-5); w.foods.push({ x, y, amt: 300, max: 300, r: 5 }); draw();
  });
  const S = stats([["food", "Food home"], ["src", "Food piles left"], ["t", "Time steps"]]);
  const anim = animator(fig, () => { step(); step(); draw(); });
  const ui = $(".demo-ui", fig);
  ui.append(
    el("div", { class: "demo-row" }, anim.button(), button("Reset", () => { reset(); draw(); }), el("span", { class: "demo-hint", text: "Tap the arena to drop food." })),
    slider("Ants", 50, 400, 10, opt.n, v => v, v => { opt.n = v; setCount(v); }).root,
    seg("Trail memory (evaporation)", [[0.95, "Short"], [0.985, "Medium"], [0.996, "Long"]], opt.evap, v => { opt.evap = +v; }),
    el("div", { class: "demo-row" }, toggle("Ants follow trails", true, v => { opt.follow = v; }), toggle("Show trails", true, v => { opt.show = v; draw(); })),
    S.root);
  st.onResize = () => w && draw();
  themeWatch(() => { c = colors(); draw(); });
  reset(); draw();
}

/* =====================================================================
   2. Team composition: scouts vs carriers
   ===================================================================== */
function team(fig) {
  const N = 10, ITEMS = 10, TMAX = 6000, P = { vs: 0.008, vc: 0.0045, rs: 0.13, rc: 0.035, turn: 0.35 };
  const st = stage(fig, 1.6, "Robot team simulation: scouts find items, carriers bring them to base");
  let c = colors(), w, seed = 1;
  const opt = { k: 3, size: 1.0, clustered: false };
  function world(o, sd) {
    const r = rng(sd * 9973 + 17), W = o.size, H = o.size * 0.625, items = [], bots = [];
    for (let i = 0; i < ITEMS; i++) {
      let x, y;
      do {
        if (o.clustered) { const q = i % 3; x = [0.18, 0.82, 0.5][q] * W + (r() - 0.5) * 0.18 * W; y = [0.25, 0.3, 0.85][q] * H + (r() - 0.5) * 0.18 * H; }
        else { x = r() * W; y = r() * H; }
      } while (Math.hypot(x - W / 2, y - H / 2) < 0.12 * W || x < 0 || y < 0 || x > W || y > H);
      items.push({ x, y, known: false, taken: false, claim: -1, done: false });
    }
    for (let i = 0; i < N; i++) bots.push({ x: W / 2 + (r() - 0.5) * 0.02, y: H / 2 + (r() - 0.5) * 0.02, a: r() * TAU, scout: i < o.k, carry: -1, target: -1 });
    return { W, H, items, bots, r, t: 0, delivered: 0 };
  }
  function step(w) {
    const { W, H, items, bots, r } = w, bx = W / 2, by = H / 2;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i], v = b.scout ? P.vs : P.vc, R = b.scout ? P.rs : P.rc;
      for (const it of items) if (!it.taken && !it.known && Math.hypot(it.x - b.x, it.y - b.y) < R) it.known = true;
      let tx = null, ty = null;
      if (!b.scout) {
        if (b.carry >= 0) { tx = bx; ty = by; if (Math.hypot(bx - b.x, by - b.y) < 0.02) { items[b.carry].done = true; w.delivered++; b.carry = -1; b.target = -1; tx = null; } }
        else {
          if (b.target >= 0 && items[b.target].taken) b.target = -1;
          if (b.target < 0) { let best = -1, bd = 1e9; items.forEach((it, j) => { if (it.known && !it.taken && (it.claim < 0 || it.claim === i)) { const d = Math.hypot(it.x - b.x, it.y - b.y); if (d < bd) { bd = d; best = j; } } }); if (best >= 0) { b.target = best; items[best].claim = i; } }
          if (b.target >= 0) { const it = items[b.target]; tx = it.x; ty = it.y; if (Math.hypot(it.x - b.x, it.y - b.y) < 0.012) { it.taken = true; b.carry = b.target; b.target = -1; } }
        }
      }
      if (tx !== null) { const da = wrapAngle(Math.atan2(ty - b.y, tx - b.x) - b.a); b.a += Math.max(-0.4, Math.min(0.4, da)); }
      else b.a += (r() - 0.5) * 2 * P.turn;
      b.x += Math.cos(b.a) * v; b.y += Math.sin(b.a) * v;
      if (b.x < 0) { b.x = 0; b.a = Math.PI - b.a; } if (b.x > W) { b.x = W; b.a = Math.PI - b.a; }
      if (b.y < 0) { b.y = 0; b.a = -b.a; } if (b.y > H) { b.y = H; b.a = -b.a; }
    }
    w.t++;
  }
  const finished = w => w.delivered >= ITEMS || w.t >= TMAX;
  function run(o, sd) { const x = world(o, sd); while (!finished(x)) step(x); return x.delivered < ITEMS ? null : x.t; }
  function restart() { seed++; w = world(opt, seed); draw(); }
  function draw() {
    const { ctx, w: Wpx, h: Hpx } = st, k = Wpx / w.W;
    ctx.fillStyle = c.arena; ctx.fillRect(0, 0, Wpx, Hpx);
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
    const g = 0.1 * k; for (let x = g; x < Wpx; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Hpx); ctx.stroke(); } for (let y = g; y < Hpx; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Wpx, y); ctx.stroke(); }
    const bx = w.W / 2 * k, by = w.H / 2 * k;
    ctx.fillStyle = alpha(c.goal, 0.25); ctx.strokeStyle = c.goal; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 0.035 * k, 0, TAU); ctx.fill(); ctx.stroke();
    for (const b of w.bots) if (b.scout) { ctx.fillStyle = alpha(c.scout, 0.07); ctx.beginPath(); ctx.arc(b.x * k, b.y * k, P.rs * k, 0, TAU); ctx.fill(); }
    for (const it of w.items) {
      if (it.done) continue;
      const ix = it.x * k, iy = it.y * k, s = Math.max(4, 0.016 * k);
      ctx.fillStyle = it.known ? c.obj : alpha(c.box, 0.35); ctx.fillRect(ix - s / 2, iy - s / 2, s, s);
      if (it.known && !it.taken) { ctx.strokeStyle = c.obj; ctx.lineWidth = 1.2; ctx.strokeRect(ix - s, iy - s, 2 * s, 2 * s); }
    }
    const rr = Math.max(3.5, 0.012 * k);
    for (const b of w.bots) {
      const x = b.x * k, y = b.y * k;
      ctx.fillStyle = b.scout ? c.scout : c.worker; ctx.beginPath();
      ctx.moveTo(x + Math.cos(b.a) * rr * 1.5, y + Math.sin(b.a) * rr * 1.5); ctx.lineTo(x + Math.cos(b.a + 2.4) * rr, y + Math.sin(b.a + 2.4) * rr); ctx.lineTo(x + Math.cos(b.a - 2.4) * rr, y + Math.sin(b.a - 2.4) * rr); ctx.fill();
      if (b.carry >= 0) { ctx.fillStyle = c.obj; ctx.fillRect(x - rr * 0.6, y - rr * 0.6, rr * 1.2, rr * 1.2); }
    }
    S.set("home", `${w.delivered} / ${ITEMS}`); S.set("t", w.t >= TMAX && w.delivered < ITEMS ? "gave up" : w.t);
    S.set("mix", `${opt.k} + ${N - opt.k}`);
  }
  const anim = animator(fig, () => { if (finished(w)) return draw(); for (let i = 0; i < 2 && !finished(w); i++) step(w); draw(); });
  const S = stats([["mix", "Scouts + carriers"], ["home", "Items home"], ["t", "Time steps"]]);
  const chartCv = el("canvas", { class: "demo-chart", role: "img", "aria-label": "Bar chart: average time for each line-up" });
  const chartNote = el("p", { class: "demo-hint", text: "Press “Test every line-up” to run 16 missions for each possible team." });
  let sweep = null, busy = false;
  function drawChart(progress) {
    const dpr = Math.min(2, devicePixelRatio || 1), Wc = chartCv.clientWidth || 600, Hc = 150;
    chartCv.width = Wc * dpr; chartCv.height = Hc * dpr; chartCv.style.height = Hc + "px";
    const ctx = chartCv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, Wc, Hc);
    ctx.font = `11px ${MONO()}`; ctx.textAlign = "center";
    const bw = (Wc - 20) / (N + 1);
    const vals = sweep ? sweep.map(s => s.done ? s.mean : null) : [];
    const max = Math.max(1, ...vals.filter(v => v != null && isFinite(v)));
    const finite = vals.filter(v => v != null && isFinite(v)), best = finite.length ? Math.min(...finite) : null;
    for (let k = 0; k <= N; k++) {
      const x = 10 + k * bw, v = vals[k];
      ctx.fillStyle = c.muted; ctx.fillText(k, x + bw / 2, Hc - 4);
      if (v == null) continue;
      if (!isFinite(v)) { ctx.fillStyle = c.muted; ctx.fillText("✕", x + bw / 2, Hc - 26); continue; }
      const h = (Hc - 34) * v / max;
      ctx.fillStyle = v === best ? c.accent : alpha(c.box, 0.45); ctx.fillRect(x + 3, Hc - 18 - h, bw - 6, h);
      if (v === best) { ctx.fillStyle = c.ink; ctx.fillText("best", x + bw / 2, Hc - 22 - h); }
    }
    ctx.textAlign = "left"; ctx.fillStyle = c.muted; ctx.fillText(progress != null && progress < 1 ? `running… ${Math.round(progress * 100)}%` : "time to finish, by number of scouts", 10, 12);
  }
  function testAll() {
    if (busy) return; busy = true;
    const SEEDS = 16, o = { ...opt };
    sweep = Array.from({ length: N + 1 }, () => ({ times: [], fails: 0, done: false, mean: null }));
    const jobs = [];
    for (let k = 0; k <= N; k++) for (let s = 1; s <= SEEDS; s++) jobs.push(() => {
      const r = k === N ? null : run({ ...o, k }, 1000 + s), e = sweep[k];
      if (r == null) e.fails++; else e.times.push(r);
      if (e.times.length + e.fails === SEEDS) { e.done = true; e.mean = e.fails > SEEDS / 2 ? Infinity : (e.times.reduce((a, b) => a + b, 0) + e.fails * TMAX) / SEEDS; }
    });
    chunked(jobs, 6, () => {
      busy = false; drawChart(1);
      const bestK = sweep.reduce((b, e, k) => e.mean < sweep[b].mean ? k : b, 0);
      chartNote.textContent = `Best line-up for this arena: ${bestK} scouts and ${N - bestK} carriers. A team of 10 scouts never brings anything home.`;
    }, p => drawChart(p));
  }
  const kSlider = slider("Scouts (the rest carry)", 0, 10, 1, opt.k, v => `${v} + ${N - v}`, v => { opt.k = v; restart(); });
  const ui = $(".demo-ui", fig);
  ui.append(
    el("div", { class: "demo-row" }, anim.button(), button("New mission", restart), button("Test every line-up", testAll, true)),
    kSlider.root,
    seg("Arena", [[0.6, "Small"], [1.0, "Medium"], [1.5, "Large"]], opt.size, v => { opt.size = +v; sweep = null; drawChart(); chartNote.textContent = "Arena changed. Test again to see the new best line-up."; restart(); }),
    seg("Items", [["0", "Scattered"], ["1", "Clustered"]], "0", v => { opt.clustered = v === "1"; sweep = null; drawChart(); chartNote.textContent = "Layout changed. Test again to see the new best line-up."; restart(); }),
    S.root, el("div", { class: "demo-chart-wrap" }, chartCv), chartNote);
  st.onResize = () => { w && draw(); drawChart(); };
  themeWatch(() => { c = colors(); draw(); drawChart(); });
  w = world(opt, seed); draw(); drawChart();
}

/* =====================================================================
   3. Genetic algorithm: evolving neural controllers
   ===================================================================== */
function ga(fig) {
  const NI = 6, NH = 6, NO = 2, NW = NI * NH + NH + NH * NO + NO, POP = 40, V = 0.006, RAYMAX = 0.25;
  const AW = 1, AH = 0.7, START = { x: 0.5, y: 0.62 };
  const LAYOUTS = {
    wall: { steps: 300, segs: [[0.25, 0.38, 0.75, 0.38]], target: { x: 0.5, y: 0.1 } },
    corner: { steps: 300, segs: [[0, 0.38, 0.62, 0.38]], target: { x: 0.2, y: 0.1 } },
    trap: { steps: 480, segs: [[0.3, 0.46, 1, 0.46], [0, 0.26, 0.7, 0.26]], target: { x: 0.5, y: 0.1 } },
  };
  const BORDER = [[0, 0, AW, 0], [AW, 0, AW, AH], [AW, AH, 0, AH], [0, AH, 0, 0]];
  const st = stage(fig, AW / AH, "Evolution simulation: a population of robots learns to drive around a wall to a target");
  let c = colors(), r = rng(3), layout = "wall", L, segs, target, pop, bots, gen, tstep, hist, mut = 0.15;
  const chart = el("canvas", { class: "demo-chart", role: "img", "aria-label": "Fitness per generation" });
  function newRun() {
    L = LAYOUTS[layout]; segs = BORDER.concat(L.segs); target = { ...L.target };
    r = rng((Math.random() * 1e9) | 0);
    pop = Array.from({ length: POP }, () => Array.from({ length: NW }, () => gauss(r) * 0.8));
    gen = 0; hist = { best: [], mean: [], reached: [] }; spawn();
  }
  function spawn() { tstep = 0; bots = pop.map(g => ({ g, x: START.x, y: START.y, a: -Math.PI / 2, alive: true, reached: -1, minD: 9, path: [] })); }
  function ray(x, y, a) {
    let best = RAYMAX; const dx = Math.cos(a), dy = Math.sin(a);
    for (const [x1, y1, x2, y2] of segs) { const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - x) * ey - (y1 - y) * ex) / den, u = ((x1 - x) * dy - (y1 - y) * dx) / den; if (t > 0 && u >= 0 && u <= 1 && t < best) best = t; }
    return best;
  }
  const segDist = (px, py, [x1, y1, x2, y2]) => { const ex = x2 - x1, ey = y2 - y1; let t = ((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey); t = Math.max(0, Math.min(1, t)); return Math.hypot(px - x1 - t * ex, py - y1 - t * ey); };
  function act(g, inp) {
    const h = new Array(NH);
    for (let j = 0; j < NH; j++) { let s = g[NI * NH + j]; for (let i = 0; i < NI; i++) s += g[j * NI + i] * inp[i]; h[j] = Math.tanh(s); }
    const base = NI * NH + NH, out = [0, 0];
    for (let k = 0; k < NO; k++) { let s = g[base + NH * NO + k]; for (let j = 0; j < NH; j++) s += g[base + k * NH + j] * h[j]; out[k] = Math.tanh(s); }
    return out;
  }
  function move(b) {
    if (!b.alive || b.reached >= 0) return;
    const bt = Math.atan2(target.y - b.y, target.x - b.x) - b.a, d = Math.hypot(target.x - b.x, target.y - b.y);
    const [l, rr] = act(b.g, [Math.sin(bt), Math.cos(bt), 1 - ray(b.x, b.y, b.a - 0.6) / RAYMAX, 1 - ray(b.x, b.y, b.a) / RAYMAX, 1 - ray(b.x, b.y, b.a + 0.6) / RAYMAX, Math.min(1, d)]);
    b.a += (rr - l) * 0.12; b.x += Math.cos(b.a) * (l + rr) / 2 * V; b.y += Math.sin(b.a) * (l + rr) / 2 * V;
    for (const s of segs) if (segDist(b.x, b.y, s) < 0.012) { b.alive = false; break; }
    const d2 = Math.hypot(target.x - b.x, target.y - b.y); b.minD = Math.min(b.minD, d2); if (d2 < 0.03) b.reached = tstep;
  }
  const fit = b => b.reached >= 0 ? 2 - b.reached / L.steps : (1 / (1 + 8 * b.minD)) * (b.alive ? 1 : 0.6);
  function evolve() {
    const f = bots.map(fit), idx = [...f.keys()].sort((a, b) => f[b] - f[a]);
    hist.best.push(f[idx[0]]); hist.mean.push(f.reduce((a, b) => a + b, 0) / POP); hist.reached.push(f.filter(v => v > 1).length);
    const elite = idx.slice(0, 4).map(i => pop[i]);
    const tour = () => { let b = -1; for (let k = 0; k < 3; k++) { const q = (r() * POP) | 0; if (b < 0 || f[q] > f[b]) b = q; } return pop[b]; };
    const next = elite.map(g => g.slice());
    while (next.length < POP) { const a = tour(), b = tour(); next.push(a.map((wt, i) => (r() < 0.5 ? wt : b[i]) + (r() < mut ? gauss(r) * 0.5 : 0))); }
    pop = next; gen++; spawn();
  }
  const genDone = () => tstep >= L.steps || bots.every(b => !b.alive || b.reached >= 0);
  function simStep() { for (const b of bots) { move(b); if (tstep % 6 === 0) b.path.push(b.x, b.y); } tstep++; }
  function skip(n) { for (let i = 0; i < n; i++) { while (!genDone()) { for (const b of bots) move(b); tstep++; } evolve(); } draw(); }
  function draw() {
    const { ctx, w: W, h: H } = st, k = W / AW;
    ctx.fillStyle = c.arena; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = c.box; ctx.lineWidth = Math.max(3, 0.012 * k); ctx.lineCap = "round";
    for (const [x1, y1, x2, y2] of L.segs) { ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.stroke(); }
    ctx.lineCap = "butt";
    ctx.fillStyle = alpha(c.goal, 0.3); ctx.strokeStyle = c.goal; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(target.x * k, target.y * k, 0.03 * k, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = c.line; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(START.x * k, START.y * k, 0.025 * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 1;
    for (const b of bots) {
      if (b.path.length < 4) continue;
      ctx.strokeStyle = b.reached >= 0 ? alpha(c.scout, 0.35) : alpha(c.muted, 0.12); ctx.beginPath(); ctx.moveTo(b.path[0] * k, b.path[1] * k);
      for (let i = 2; i < b.path.length; i += 2) ctx.lineTo(b.path[i] * k, b.path[i + 1] * k); ctx.stroke();
    }
    const rr = Math.max(3, 0.011 * k);
    for (const b of bots) {
      const x = b.x * k, y = b.y * k;
      ctx.fillStyle = b.reached >= 0 ? c.scout : b.alive ? c.worker : alpha(c.muted, 0.5);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(b.a) * rr * 1.5, y + Math.sin(b.a) * rr * 1.5); ctx.lineTo(x + Math.cos(b.a + 2.4) * rr, y + Math.sin(b.a + 2.4) * rr); ctx.lineTo(x + Math.cos(b.a - 2.4) * rr, y + Math.sin(b.a - 2.4) * rr); ctx.fill();
    }
    S.set("gen", gen); S.set("best", hist.best.length ? hist.best[hist.best.length - 1].toFixed(2) : "–");
    S.set("reached", `${bots.filter(b => b.reached >= 0).length} / ${POP}`);
    drawChart();
  }
  function drawChart() {
    const dpr = Math.min(2, devicePixelRatio || 1), Wc = chart.clientWidth || 600, Hc = 110;
    chart.width = Wc * dpr; chart.height = Hc * dpr; chart.style.height = Hc + "px";
    const ctx = chart.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, Wc, Hc);
    lineChart(ctx, 0, 0, Wc, Hc, [{ data: hist.mean, color: c.worker }, { data: hist.best, color: c.scout, width: 2 }], c,
      { min: 0, max: 2, n: Math.max(20, hist.best.length), label: "fitness: best (teal), average (amber); above 1 = reached" });
  }
  st.cv.addEventListener("click", ev => {
    const b = st.cv.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * AW, y = (ev.clientY - b.top) / b.height * AH;
    if (x < 0.03 || y < 0.03 || x > AW - 0.03 || y > AH - 0.03) return;
    target = { x, y }; draw();
  });
  const S = stats([["gen", "Generation"], ["reached", "Reached target"], ["best", "Best fitness"]]);
  const anim = animator(fig, () => { for (let i = 0; i < 4; i++) { if (genDone()) { evolve(); break; } simStep(); } draw(); });
  const ui = $(".demo-ui", fig);
  ui.append(
    el("div", { class: "demo-row" }, anim.button(), button("Skip 10 generations", () => skip(10), true), button("Start over", () => { newRun(); draw(); }), el("span", { class: "demo-hint", text: "Tap to move the target." })),
    seg("Course", [["wall", "Wall"], ["corner", "Corner"], ["trap", "Trap"]], layout, v => { layout = v; newRun(); draw(); }),
    slider("Mutation rate", 0.02, 0.5, 0.01, mut, v => `${Math.round(v * 100)}% of weights`, v => { mut = v; }).root,
    S.root, el("div", { class: "demo-chart-wrap" }, chart));
  st.onResize = () => L && draw();
  themeWatch(() => { c = colors(); draw(); });
  newRun(); draw();
}

/* =====================================================================
   4. Robot olfaction: finding an odour source in a turbulent plume
   ===================================================================== */
function smell(fig) {
  const W = 1, H = 0.6, TH = 0.25, V = 0.0032, LIMIT = 4000;
  const st = stage(fig, W / H, "Odour plume simulation: a robot searches for the source of a smell carried by the wind");
  let c = colors(), w, seed = 1;
  const opt = { strategy: "surgecast", turb: 1 };
  function world(sd, turb) {
    const r = rng(sd * 7919 + 3);
    const x = { r, t: 0, src: { x: 0.12, y: 0.18 + r() * 0.24 }, puffs: [], wind: 0, windU: 0.0045, turb,
      bot: { x: 0.86, y: 0.08 + r() * 0.44, a: Math.PI, mode: "search", lastHit: -1e9, castDir: 1, castT: 0, castLen: 40, found: false, path: [], hits: [] } };
    for (let i = 0; i < 300; i++) stepAir(x);
    x.t0 = x.t; return x;
  }
  function stepAir(w) {
    const { r } = w; w.t++;
    w.wind = 0.35 * Math.sin(w.t * 0.0045 + w.src.y * 9) * w.turb + 0.15 * Math.sin(w.t * 0.013) * w.turb;
    if (w.t % 2 === 0) w.puffs.push({ x: w.src.x, y: w.src.y, age: 0 });
    const ux = Math.cos(w.wind) * w.windU, uy = Math.sin(w.wind) * w.windU, D = 0.0016 * w.turb + 0.0004;
    for (const p of w.puffs) { p.x += ux + gauss(r) * D; p.y += uy + gauss(r) * D; p.age++; }
    w.puffs = w.puffs.filter(p => p.x < W + 0.05 && p.x > -0.05 && p.y > -0.05 && p.y < H + 0.05 && p.age < 600);
  }
  function conc(w, x, y) {
    let s = 0;
    for (const p of w.puffs) { const rr = 0.008 + p.age * 0.00012, d2 = (p.x - x) ** 2 + (p.y - y) ** 2; if (d2 < 9 * rr * rr) s += Math.exp(-d2 / (2 * rr * rr)) * Math.min(1, (0.012 / rr) ** 2); }
    return s;
  }
  function stepBot(w, strategy) {
    const b = w.bot, r = w.r; if (b.found) return;
    const cc = conc(w, b.x, b.y) * (1 + gauss(r) * 0.1), hit = cc > TH;
    if (hit) { b.lastHit = w.t; b.hits.push(b.x, b.y); }
    const upwind = w.wind + Math.PI; let want = b.a;
    if (strategy === "random") { want = b.a + (r() - 0.5) * 0.9; b.mode = "wandering"; }
    else if (strategy === "gradient") {
      const Lc = conc(w, b.x + Math.cos(b.a + 0.6) * 0.025, b.y + Math.sin(b.a + 0.6) * 0.025), Rc = conc(w, b.x + Math.cos(b.a - 0.6) * 0.025, b.y + Math.sin(b.a - 0.6) * 0.025);
      if (Lc + Rc > 0.02) { want = b.a + (Lc > Rc ? 0.35 : -0.35); b.mode = "climbing"; } else { want = b.a + (r() - 0.5) * 0.9; b.mode = "lost, wandering"; }
    } else {
      const since = w.t - b.lastHit;
      if (since < 25) { want = upwind; b.castT = 0; b.castLen = 30; b.mode = "surge upwind"; }
      else if (b.lastHit > -1e8) {
        b.mode = "casting"; b.castT++; if (b.castT > b.castLen) { b.castT = 0; b.castDir *= -1; b.castLen *= 1.35; }
        want = w.wind + b.castDir * Math.PI / 2; if (b.castLen > 500) b.lastHit = -1e9;
      } else { b.mode = "sweeping"; b.castT++; if (b.castT > 70) { b.castT = 0; b.castDir *= -1; } want = w.wind + b.castDir * Math.PI / 2 + (r() - 0.5) * 0.2; }
    }
    b.a += Math.max(-0.3, Math.min(0.3, wrapAngle(want - b.a)));
    b.x += Math.cos(b.a) * V; b.y += Math.sin(b.a) * V;
    if (b.x < 0.01) { b.x = 0.01; b.a = Math.PI - b.a; } if (b.x > W - 0.01) { b.x = W - 0.01; b.a = Math.PI - b.a; }
    if (b.y < 0.01) { b.y = 0.01; b.a = -b.a; } if (b.y > H - 0.01) { b.y = H - 0.01; b.a = -b.a; }
    if (Math.hypot(b.x - w.src.x, b.y - w.src.y) < 0.035) { b.found = true; b.mode = "found it"; }
  }
  const elapsed = w => w.t - w.t0;
  const over = w => w.bot.found || elapsed(w) >= LIMIT;
  function restart() { seed++; w = world(seed, opt.turb); draw(); }
  function draw() {
    const { ctx, w: Wp, h: Hp } = st, k = Wp / W;
    ctx.fillStyle = c.arena; ctx.fillRect(0, 0, Wp, Hp);
    for (const p of w.puffs) {
      const rr = (0.008 + p.age * 0.00012) * k * 1.6, a = Math.min(0.5, 0.5 * (0.012 / (0.008 + p.age * 0.00012)) ** 2);
      ctx.fillStyle = alpha(c.scout, a * 0.55); ctx.beginPath(); ctx.arc(p.x * k, p.y * k, rr, 0, TAU); ctx.fill();
    }
    const b = w.bot;
    ctx.strokeStyle = alpha(c.ink, 0.35); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < b.path.length; i += 2) i ? ctx.lineTo(b.path[i] * k, b.path[i + 1] * k) : ctx.moveTo(b.path[0] * k, b.path[1] * k); ctx.stroke();
    ctx.fillStyle = c.worker; for (let i = 0; i < b.hits.length; i += 2) ctx.fillRect(b.hits[i] * k - 1.5, b.hits[i + 1] * k - 1.5, 3, 3);
    ctx.fillStyle = c.obj; ctx.strokeStyle = c.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.src.x * k, w.src.y * k, 0.018 * k, 0, TAU); ctx.fill(); ctx.stroke();
    const rr = Math.max(5, 0.016 * k), x = b.x * k, y = b.y * k;
    ctx.fillStyle = b.found ? c.accent : c.ink; ctx.beginPath(); ctx.moveTo(x + Math.cos(b.a) * rr * 1.5, y + Math.sin(b.a) * rr * 1.5); ctx.lineTo(x + Math.cos(b.a + 2.4) * rr, y + Math.sin(b.a + 2.4) * rr); ctx.lineTo(x + Math.cos(b.a - 2.4) * rr, y + Math.sin(b.a - 2.4) * rr); ctx.fill();
    // wind arrow
    const ax = Wp - 70, ay = 26, L = 26; ctx.strokeStyle = c.muted; ctx.fillStyle = c.muted; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax - Math.cos(w.wind) * L / 2, ay - Math.sin(w.wind) * L / 2); ctx.lineTo(ax + Math.cos(w.wind) * L / 2, ay + Math.sin(w.wind) * L / 2); ctx.stroke();
    ctx.beginPath(); const hx = ax + Math.cos(w.wind) * L / 2, hy = ay + Math.sin(w.wind) * L / 2;
    ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(w.wind - 0.5) * 8, hy - Math.sin(w.wind - 0.5) * 8); ctx.lineTo(hx - Math.cos(w.wind + 0.5) * 8, hy - Math.sin(w.wind + 0.5) * 8); ctx.fill();
    ctx.font = `11px ${MONO()}`; ctx.textAlign = "left"; ctx.fillText("wind", ax + 18, ay + 4);
    S.set("t", elapsed(w)); S.set("mode", b.found ? "found it" : elapsed(w) >= LIMIT ? "gave up" : b.mode); S.set("hits", b.hits.length / 2);
  }
  const anim = animator(fig, () => { for (let i = 0; i < 3 && !over(w); i++) { stepAir(w); stepBot(w, opt.strategy); if (w.t % 3 === 0) w.bot.path.push(w.bot.x, w.bot.y); } if (over(w)) stepAir(w); draw(); });
  const S = stats([["mode", "Robot is"], ["hits", "Whiffs of smell"], ["t", "Time steps"]]);
  const table = el("table", { class: "demo-table" });
  let busy = false;
  function race() {
    if (busy) return; busy = true;
    const T = 20, strategies = [["random", "Random walk"], ["gradient", "Follow the gradient"], ["surgecast", "Surge and cast"]], res = {};
    const jobs = [];
    for (const [s] of strategies) { res[s] = { ok: 0, t: 0, n: 0 }; for (let i = 1; i <= T; i++) jobs.push(() => { const x = world(500 + i, opt.turb); while (!over(x)) { stepAir(x); stepBot(x, s); } res[s].n++; if (x.bot.found) { res[s].ok++; res[s].t += elapsed(x); } }); }
    const render = p => {
      table.innerHTML = `<caption>${p < 1 ? `Racing… ${Math.round(p * 100)}%` : `20 searches per strategy in ${opt.turb < 0.5 ? "calm" : opt.turb < 1.3 ? "breezy" : "gusty"} air`}</caption><thead><tr><th scope="col">Strategy</th><th scope="col">Found the source</th><th scope="col">Average time</th></tr></thead>`;
      const tb = el("tbody");
      for (const [s, name] of strategies) { const e = res[s]; tb.append(el("tr", {}, el("th", { scope: "row", text: name }), el("td", { text: e.n ? `${e.ok} / ${e.n}` : "…" }), el("td", { text: e.ok ? Math.round(e.t / e.ok) + " steps" : e.n ? "–" : "…" }))); }
      table.append(tb);
    };
    chunked(jobs, 2, () => { busy = false; render(1); }, render);
  }
  const ui = $(".demo-ui", fig);
  ui.append(
    el("div", { class: "demo-row" }, anim.button(), button("New search", restart), button("Race 20 searches", race, true)),
    seg("Strategy", [["random", "Random walk"], ["gradient", "Follow gradient"], ["surgecast", "Surge & cast"]], opt.strategy, v => { opt.strategy = v; restart(); }),
    seg("Air", [["0.3", "Calm"], ["1", "Breezy"], ["1.6", "Gusty"]], "1", v => { opt.turb = +v; table.innerHTML = ""; restart(); }),
    S.root, table);
  st.onResize = () => w && draw();
  themeWatch(() => { c = colors(); draw(); });
  w = world(seed, opt.turb); draw();
}

/* =====================================================================
   5. Knowledge distillation: one student network imitates three teachers
   ===================================================================== */
function distill(fig) {
  const TEACH = [
    { name: "Go to goal", color: "scout", f: x => Math.tanh(2.5 * x) },
    { name: "Avoid obstacle", color: "obj", f: x => -Math.tanh(4 * x) * Math.exp(-2 * x * x) },
    { name: "Stay together", color: "worker", f: x => 0.85 * Math.sin(Math.PI * x / 1.25) * Math.exp(-0.4 * x * x) },
  ];
  const st = stage(fig, 1.9, "Plot: three teacher behaviours (dashed) and the student network learning to copy them (solid)");
  let c = colors(), r, net, H = 8, steps = 0, loss = [], adam;
  const lr = 0.01;
  function init() {
    r = rng((Math.random() * 1e9) | 0); steps = 0; loss = [];
    const n = 4 * H + H + H + 1; // inputs: x + 3 task flags
    net = Float64Array.from({ length: n }, (_, i) => i < 5 * H ? gauss(r) * 0.7 : i < 6 * H ? 0 : gauss(r) * 0.5);
    adam = { m: new Float64Array(n), v: new Float64Array(n), t: 0 };
  }
  // layout: W1[H][4], b1[H], W2[H], b2
  function forward(x, task, keep) {
    const h = new Float64Array(H);
    for (let j = 0; j < H; j++) { const s = net[j * 4] * x + net[j * 4 + 1 + task] + net[4 * H + j]; h[j] = Math.tanh(s); }
    let o = net[6 * H]; for (let j = 0; j < H; j++) o += net[5 * H + j] * h[j];
    const y = Math.tanh(o); if (keep) keep.h = h; return y;
  }
  function train(n) {
    for (let it = 0; it < n; it++) {
      const g = new Float64Array(net.length); let L = 0; const B = 24;
      for (let b = 0; b < B; b++) {
        const task = b % 3, x = r() * 2 - 1, k = {}, y = forward(x, task, k), tgt = TEACH[task].f(x), e = y - tgt; L += e * e;
        const dO = 2 * e * (1 - y * y) / B; g[6 * H] += dO;
        for (let j = 0; j < H; j++) {
          g[5 * H + j] += dO * k.h[j];
          const dh = dO * net[5 * H + j] * (1 - k.h[j] * k.h[j]);
          g[j * 4] += dh * x; g[j * 4 + 1 + task] += dh; g[4 * H + j] += dh;
        }
      }
      adam.t++;
      for (let i = 0; i < net.length; i++) {
        adam.m[i] = 0.9 * adam.m[i] + 0.1 * g[i]; adam.v[i] = 0.999 * adam.v[i] + 0.001 * g[i] * g[i];
        const mh = adam.m[i] / (1 - 0.9 ** adam.t), vh = adam.v[i] / (1 - 0.999 ** adam.t);
        net[i] -= lr * mh / (Math.sqrt(vh) + 1e-8);
      }
      steps++; if (steps % 10 === 0) loss.push(L / B);
    }
  }
  function draw() {
    const { ctx, w: W, h: Hp } = st, pad = 30, pw = W - pad - 12, ph = Hp - pad - 16;
    const X = x => pad + (x + 1) / 2 * pw, Y = y => 10 + (1 - (y + 1) / 2) * ph;
    ctx.fillStyle = c.arena; ctx.fillRect(0, 0, W, Hp);
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
    for (const v of [-1, -0.5, 0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(X(v), Y(-1)); ctx.lineTo(X(v), Y(1)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(-1), Y(v)); ctx.lineTo(X(1), Y(v)); ctx.stroke(); }
    ctx.fillStyle = c.muted; ctx.font = `11px ${MONO()}`; ctx.textAlign = "center";
    ctx.fillText("sensor reading: where the goal, obstacle or neighbours are (left ← → right)", X(0), Hp - 4);
    ctx.save(); ctx.translate(11, Y(0)); ctx.rotate(-Math.PI / 2); ctx.fillText("steering (left ↔ right)", 0, 0); ctx.restore();
    TEACH.forEach((T, task) => {
      ctx.strokeStyle = c[T.color]; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.globalAlpha = 0.55; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const x = -1 + i / 60; i ? ctx.lineTo(X(x), Y(T.f(x))) : ctx.moveTo(X(x), Y(T.f(x))); } ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 2.6; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const x = -1 + i / 60, y = forward(x, task); i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); } ctx.stroke();
    });
    const last = loss.length ? loss[loss.length - 1] : null;
    S.set("steps", steps); S.set("loss", last == null ? "–" : last < 0.001 ? last.toExponential(1) : last.toFixed(3)); S.set("params", 6 * H + 1);
    const dpr = Math.min(2, devicePixelRatio || 1), Wc = chart.clientWidth || 600, Hc = 90;
    chart.width = Wc * dpr; chart.height = Hc * dpr; chart.style.height = Hc + "px";
    const cx = chart.getContext("2d"); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, Wc, Hc);
    const lg = loss.map(v => Math.log10(Math.max(1e-5, v)));
    lineChart(cx, 0, 0, Wc, Hc, [{ data: lg, color: c.accent, width: 2 }], c, { min: -4, max: 0, n: Math.max(60, lg.length), label: "imitation error, log scale (lower is better)" });
  }
  const chart = el("canvas", { class: "demo-chart", role: "img", "aria-label": "Imitation error over training" });
  const S = stats([["params", "Student weights"], ["steps", "Training steps"], ["loss", "Imitation error"]]);
  const legend = el("div", { class: "demo-legend" }, ...TEACH.map(T => el("span", {}, el("i", { style: `background:var(--${T.color})` }), T.name)), el("span", { class: "muted", text: "dashed = teacher · solid = student" }));
  const anim = animator(fig, () => { if (steps < 6000) train(4); draw(); });
  const ui = $(".demo-ui", fig);
  ui.append(
    el("div", { class: "demo-row" }, anim.button(), button("Restart training", () => { init(); draw(); })),
    seg("Student size (hidden neurons)", [[1, "1"], [2, "2"], [4, "4"], [8, "8"], [16, "16"]], H, v => { H = +v; init(); draw(); }),
    legend, S.root, el("div", { class: "demo-chart-wrap" }, chart));
  st.onResize = () => net && draw();
  themeWatch(() => { c = colors(); draw(); });
  init(); draw();
}

/* =====================================================================
   6. Checklist (PhD in Japan post): remembered in this browser only
   ===================================================================== */
function checklist(fig) {
  const key = "checklist:" + (fig.id || location.pathname);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { saved = {}; }
  const boxes = [...fig.querySelectorAll("input[type=checkbox]")], bar = $(".demo-progress i", fig), txt = $(".demo-progress span", fig);
  const update = () => {
    const done = boxes.filter(b => b.checked).length;
    if (bar) bar.style.width = (100 * done / boxes.length) + "%";
    if (txt) txt.textContent = `${done} of ${boxes.length} done`;
  };
  boxes.forEach((b, i) => {
    b.checked = !!saved[i];
    b.addEventListener("change", () => { saved[i] = b.checked; try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {} update(); });
  });
  update();
}

const DEMOS = { ants, team, ga, smell, distill, checklist };
const start = fig => { const fn = DEMOS[fig.dataset.demo]; if (!fn || fig.dataset.ready) return; fig.dataset.ready = "1"; try { fn(fig); } catch (e) { console.error(e); } };
const figs = document.querySelectorAll("[data-demo]");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } }), { rootMargin: "300px" });
  figs.forEach(f => io.observe(f));
} else figs.forEach(start);
})();
