/* Swarm engine: simulation + evolution. Loaded by pages and as a Web Worker for evolution. */
const W = 600, H = 380, N = 18, BR = 20, RR = 5, MAXT = 1200;
const GOAL = { x: 532, y: 190, r: 44 };
const SCOUT = { speed: 1.9, sense: 120 }, WORKER = { speed: 1.4, sense: 20, power: 1.0 };
const COMM = 120, THRESH = 4.4, HOLD = 24;

function rng(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeWorld(g, seed) {
  const rnd = rng(seed);
  const box = { x: 130 + rnd() * 60, y: 70 + rnd() * 240 };
  const robots = [];
  for (let i = 0; i < N; i++) {
    let x, y;
    do { x = 20 + rnd() * 420; y = 15 + rnd() * (H - 30); } while (Math.hypot(x - box.x, y - box.y) < BR + 40);
    robots.push({ x, y, h: rnd() * Math.PI * 2, scout: i < g.s, sig: false, follow: null });
  }
  return { g, rnd, box, robots, t: 0, done: false, d0: Math.hypot(GOAL.x - box.x, GOAL.y - box.y) };
}

function turnTo(ro, ang, max) {
  let d = ang - ro.h;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  ro.h += Math.max(-max, Math.min(max, d));
}

function step(w) {
  if (w.done) return;
  const { box, robots, rnd, g } = w;
  let gx = GOAL.x - box.x, gy = GOAL.y - box.y;
  const gd = Math.hypot(gx, gy) || 1; const ux = gx / gd, uy = gy / gd;
  const signals = [];
  for (const ro of robots) if (ro.scout && ro.sig) signals.push(ro);
  let fx = 0, fy = 0;
  for (const ro of robots) {
    const T = ro.scout ? SCOUT : WORKER;
    const dx = box.x - ro.x, dy = box.y - ro.y, d = Math.hypot(dx, dy) || 1;
    ro.follow = null;
    if (d < T.sense + BR) {
      const off = ro.scout ? BR + HOLD : BR + RR + 2;
      const bx = box.x - ux * off, by = box.y - uy * off;
      const rel = (-dx) * ux + (-dy) * uy; // robot position along box->goal axis
      let tx, ty;
      if (rel > -BR * 0.6) {
        // goal side: go around the box
        let px = -(-dy) / d, py = (-dx) / d;
        if (px * (bx - ro.x) + py * (by - ro.y) < 0) { px = -px; py = -py; }
        const out = d < BR + RR + 10 ? 0.8 : 0;
        tx = px + (-dx / d) * out + (bx - ro.x) * 0.004; ty = py + (-dy / d) * out + (by - ro.y) * 0.004;
      } else if (ro.scout) {
        tx = bx - ro.x; ty = by - ro.y;
      } else {
        const db = Math.hypot(bx - ro.x, by - ro.y);
        if (db > 10 && d > BR + RR + 8) { tx = bx - ro.x; ty = by - ro.y; } else { tx = dx + ux * 12; ty = dy + uy * 12; }
      }
      ro.sig = ro.scout;
      if (ro.scout && Math.hypot(bx - ro.x, by - ro.y) < 6) { ro.hold = true; } else ro.hold = false;
      turnTo(ro, Math.atan2(ty, tx), 0.2);
    } else {
      ro.sig = false; ro.hold = false;
      let target = null;
      if (!ro.scout && g.b > 0.02 && signals.length) {
        let best = COMM;
        for (const s of signals) { const ds = Math.hypot(s.x - ro.x, s.y - ro.y); if (ds < best) { best = ds; target = s; } }
      }
      ro.h += (rnd() - 0.5) * g.n * 1.1;
      if (target && rnd() < g.b) { ro.follow = target; turnTo(ro, Math.atan2(target.y - ro.y, target.x - ro.x), 0.25 * g.b + 0.05); }
    }
    const sp = ro.hold ? 0 : T.speed;
    ro.x += Math.cos(ro.h) * sp; ro.y += Math.sin(ro.h) * sp;
    if (ro.x < RR) { ro.x = RR; ro.h = Math.PI - ro.h; } else if (ro.x > W - RR) { ro.x = W - RR; ro.h = Math.PI - ro.h; }
    if (ro.y < RR) { ro.y = RR; ro.h = -ro.h; } else if (ro.y > H - RR) { ro.y = H - RR; ro.h = -ro.h; }
    const ex = box.x - ro.x, ey = box.y - ro.y, e = Math.hypot(ex, ey) || 1;
    if (e < BR + RR) {
      ro.x = box.x - (ex / e) * (BR + RR); ro.y = box.y - (ey / e) * (BR + RR);
      if (!ro.scout && Math.cos(ro.h) * ex / e + Math.sin(ro.h) * ey / e > 0.4) {
        // pushes along its line of contact; a worker behind the box pushes it toward the goal
        const along = (ex / e) * ux + (ey / e) * uy;
        const px = along > 0.5 ? ux : ex / e, py = along > 0.5 ? uy : ey / e;
        fx += WORKER.power * px; fy += WORKER.power * py;
      }
    }
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = robots[i], b = robots[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < RR * 2) { const p = (RR * 2 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
  }
  const m = Math.hypot(fx, fy);
  if (m > THRESH) {
    const k = Math.min((m - THRESH) * 0.8 + 0.25, 1.3);
    box.x += fx / m * k; box.y += fy / m * k;
    box.x = Math.max(BR, Math.min(W - BR, box.x)); box.y = Math.max(BR, Math.min(H - BR, box.y));
  }
  w.pushing = m > THRESH;
  w.t++;
  if (Math.hypot(GOAL.x - box.x, GOAL.y - box.y) < GOAL.r - 10) w.done = "goal";
  else if (w.t >= MAXT) w.done = "time";
}

function progress(w) { return Math.max(0, Math.min(1, 1 - Math.hypot(GOAL.x - w.box.x, GOAL.y - w.box.y) / w.d0)); }
function fitness(w) { return w.done === "goal" ? 1 + (1 - w.t / MAXT) : progress(w) * 0.95; }
function points(f) { return Math.round(f * 50); }
function simulate(g, seed) { const w = makeWorld(g, seed); while (!w.done) step(w); return fitness(w); }


/* ---------- evolution core ---------- */
const POP = 12, GENS = 20, EVAL_SEEDS = [7, 21];
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function randG() { return { s: Math.floor(Math.random() * (N + 1)), b: Math.random(), n: Math.random() }; }
function mutate(g) {
  const c = { s: g.s, b: g.b, n: g.n };
  if (Math.random() < 0.6) c.s = Math.max(0, Math.min(N, c.s + Math.round(gauss() * 2)));
  if (Math.random() < 0.6) c.b = clamp01(c.b + gauss() * 0.15);
  if (Math.random() < 0.6) c.n = clamp01(c.n + gauss() * 0.15);
  return c;
}
function newEvo() { return { pop: Array.from({ length: POP }, randG), fits: new Array(POP), idx: 0, gen: 0, best: null }; }
function breed(ev) {
  const tour = () => { let k = -1; for (let i = 0; i < 3; i++) { const j = Math.floor(Math.random() * POP); if (k < 0 || ev.fits[j] > ev.fits[k]) k = j; } return ev.pop[k]; };
  const order = ev.pop.map((g, i) => i).sort((a, b) => ev.fits[b] - ev.fits[a]);
  const next = [ev.pop[order[0]], ev.pop[order[1]]];
  while (next.length < POP) {
    const a = tour(), b = tour();
    next.push(mutate({ s: Math.random() < 0.5 ? a.s : b.s, b: Math.random() < 0.5 ? a.b : b.b, n: Math.random() < 0.5 ? a.n : b.n }));
  }
  ev.pop = next; ev.fits = new Array(POP); ev.idx = 0;
}
// Evaluates one design; returns a generation report when a generation completes.
function evalNext(ev) {
  const g = ev.pop[ev.idx];
  ev.fits[ev.idx] = EVAL_SEEDS.reduce((sum, sd) => sum + simulate(g, sd), 0) / EVAL_SEEDS.length;
  ev.idx++;
  if (ev.idx < POP) return null;
  let bi = 0, mean = 0;
  for (let i = 0; i < POP; i++) { mean += ev.fits[i]; if (ev.fits[i] > ev.fits[bi]) bi = i; }
  mean /= POP;
  const improved = !ev.best || ev.fits[bi] > ev.best.f;
  if (improved) ev.best = { g: { s: ev.pop[bi].s, b: ev.pop[bi].b, n: ev.pop[bi].n }, f: ev.fits[bi] };
  ev.gen++;
  const rep = { gen: ev.gen, genBest: ev.fits[bi], mean, best: ev.best, improved, replay: simulate(ev.best.g, EVAL_SEEDS[0]), last: ev.gen >= GENS };
  if (!rep.last) breed(ev);
  return rep;
}
if (typeof window === "undefined" && typeof self !== "undefined") {
  self.onmessage = (e) => {
    if (e.data !== "start") return;
    const ev = newEvo();
    let rep;
    do { rep = evalNext(ev); if (rep) self.postMessage(rep); } while (!rep || !rep.last);
  };
}
