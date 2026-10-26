/* Swarm Lab engine v3: a team of different robots maps an unknown building and delivers three packages.
   Units: 1 = 1 cm, 1 step = 0.1 s (10 Hz control loop). Runs on the page and inside a Web Worker (evolution).
   - Nobody starts with a map. Scouts build a shared occupancy grid with a 360° LiDAR; workers only have short-range IR.
   - Map data and task messages travel over a multi-hop radio mesh that must connect back to the base station.
     A robot that is out of the network keeps its data and delivers it when it reconnects.
   - Each package needs at least 3 workers pushing together (static and sliding friction).
   - Every robot runs on a battery and has to return to the charging bay before it runs flat. */
const SIM = { W: 900, H: 540, MAXT: 3600, CELL: 10 };
const GW = SIM.W / SIM.CELL, GH = SIM.H / SIM.CELL, NC = GW * GH;
const BUDGET = 120, COST = { scout: 12, worker: 5 };
const RR = 8;                                                                    // 16 cm robots
const SCOUT = { v: 2.6, turn: 0.26, lidar: 250, rays: 24, cam: 250, fov: 1.05 }; // 26 cm/s, LiDAR 2.5 m, camera ±60°
const WORKER = { v: 1.8, vSlow: 0.9, turn: 0.22, ir: 25, power: 1 };            // 18 cm/s on mapped floor, 9 cm/s in unknown space
const BOX = { half: 26, R: 36, muS: 2.6, muK: 1.8, k: 0.55, vmax: 1.3 };        // 52 cm package: 3 pushers to break static friction
const NPKG = 3;
const BAT = { scout: 1 / 3200, worker: 1 / 4500, sense: 1 / 8000, push: 1 / 7000, idle: 1 / 30000, radio: 1 / 14000, charge: 1 / 150,
  low: 0.22, full: 0.97, capS: 36, capW: 54 };                                   // drain per step; capacity in kJ
const LIMITS = { s: [0, 9], c: [100, 400], k: [3, 6], p: [0, 1] };

const SCENARIOS = {
  warehouse: {
    label: "Warehouse", dockLabel: "LOADING DOCK", baseLabel: "CHARGING BAY", boxLabel: "PACKAGE",
    shelves: [
      { x: 230, y: 40, w: 30, h: 160 }, { x: 230, y: 340, w: 30, h: 160 },
      { x: 430, y: 40, w: 30, h: 90 }, { x: 430, y: 240, w: 30, h: 60 }, { x: 430, y: 410, w: 30, h: 90 },
      { x: 630, y: 40, w: 30, h: 130 }, { x: 630, y: 270, w: 30, h: 80 }, { x: 630, y: 450, w: 30, h: 50 }
    ],
    base: { x: 14, y: 170, w: 110, h: 200 },
    dock: { x: 820, y: 185, w: 80, h: 170 },
    spots: [[335, 110], [335, 430], [545, 430], [545, 110], [745, 440], [745, 100], [335, 270], [545, 190]]
  },
  rubble: {
    label: "Disaster site", dockLabel: "SAFE ZONE", baseLabel: "RESPONSE BASE", boxLabel: "SUPPLY CRATE",
    shelves: [
      { x: 205, y: 50, w: 60, h: 55 }, { x: 190, y: 330, w: 75, h: 60 }, { x: 330, y: 190, w: 50, h: 95 },
      { x: 300, y: 440, w: 85, h: 50 }, { x: 470, y: 40, w: 70, h: 65 }, { x: 495, y: 300, w: 60, h: 75 },
      { x: 640, y: 150, w: 50, h: 60 }, { x: 650, y: 400, w: 70, h: 60 }, { x: 735, y: 40, w: 45, h: 55 }
    ],
    base: { x: 14, y: 175, w: 110, h: 190 },
    dock: { x: 820, y: 200, w: 80, h: 150 },
    spots: [[415, 120], [420, 380], [590, 450], [610, 100], [290, 230], [580, 240], [740, 300]]
  },
  hall: {
    label: "Open hall", dockLabel: "DOCK", baseLabel: "BASE", boxLabel: "PACKAGE",
    shelves: [],
    base: { x: 14, y: 170, w: 110, h: 200 },
    dock: { x: 820, y: 185, w: 80, h: 170 },
    spots: [[380, 110], [400, 430], [560, 115], [560, 430], [300, 280], [700, 270], [700, 110]]
  }
};

function rng(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function workersFor(s) { return Math.floor((BUDGET - s * COST.scout) / COST.worker); }

/* ---------- geometry ---------- */
function rectDist(px, py, r) { const cx = clamp(px, r.x, r.x + r.w), cy = clamp(py, r.y, r.y + r.h); return hyp(px - cx, py - cy); }
function pushOutRect(o, rad, r) {
  if (o.x < r.x - rad || o.x > r.x + r.w + rad || o.y < r.y - rad || o.y > r.y + r.h + rad) return false;
  const cx = clamp(o.x, r.x, r.x + r.w), cy = clamp(o.y, r.y, r.y + r.h);
  const dx = o.x - cx, dy = o.y - cy, d = hyp(dx, dy);
  if (d >= rad) return false;
  if (d === 0) {
    const l = o.x - r.x, rt = r.x + r.w - o.x, t = o.y - r.y, b = r.y + r.h - o.y, m = Math.min(l, rt, t, b);
    if (m === l) o.x = r.x - rad; else if (m === rt) o.x = r.x + r.w + rad; else if (m === t) o.y = r.y - rad; else o.y = r.y + r.h + rad;
    return true;
  }
  o.x = cx + dx / d * rad; o.y = cy + dy / d * rad; return true;
}
function walls(o, rad) {
  let hit = false;
  if (o.x < rad) { o.x = rad; hit = true; } else if (o.x > SIM.W - rad) { o.x = SIM.W - rad; hit = true; }
  if (o.y < rad) { o.y = rad; hit = true; } else if (o.y > SIM.H - rad) { o.y = SIM.H - rad; hit = true; }
  return hit;
}
function segHitsRect(x1, y1, x2, y2, r) { // Liang-Barsky
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}
function lineOfSight(shelves, x1, y1, x2, y2) { for (const r of shelves) if (segHitsRect(x1, y1, x2, y2, r)) return false; return true; }
function boxLocal(b, x, y) { const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = x - b.x, dy = y - b.y; return [dx * c - dy * s, dx * s + dy * c]; }
function boxSurface(b, x, y) {
  const [lx, ly] = boxLocal(b, x, y), h = BOX.half;
  const cx = clamp(lx, -h, h), cy = clamp(ly, -h, h), c = Math.cos(b.a), s = Math.sin(b.a);
  return { d: hyp(lx - cx, ly - cy), px: b.x + cx * c - cy * s, py: b.y + cx * s + cy * c, inside: Math.abs(lx) < h && Math.abs(ly) < h };
}
function inRect(x, y, r, m) { return x > r.x + m && x < r.x + r.w - m && y > r.y + m && y < r.y + r.h - m; }
function cellOf(x, y) { return clamp((y / SIM.CELL) | 0, 0, GH - 1) * GW + clamp((x / SIM.CELL) | 0, 0, GW - 1); }
const cx = (c) => (c % GW + 0.5) * SIM.CELL, cy = (c) => (((c / GW) | 0) + 0.5) * SIM.CELL;

/* ---------- path planning: Dijkstra on the 10 cm grid (unknown cells cost more) ---------- */
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const HEAP_K = new Float64Array(NC * 9), HEAP_V = new Int32Array(NC * 9);
const NBI = new Int32Array([1, -1, 0, 0, 1, 1, -1, -1]), NBJ = new Int32Array([0, 0, 1, -1, 1, -1, 1, -1]);
const NBC = new Float64Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);
function dijkstra(blocked, seeds, cost) {
  const d = new Float64Array(NC).fill(Infinity), K = HEAP_K, V = HEAP_V;
  let n = 0;
  for (const c of seeds) if (!blocked[c] && d[c] !== 0) { d[c] = 0; K[n] = 0; V[n] = c; n++; }
  while (n > 0) {
    const k = K[0], c = V[0];
    n--;
    if (n > 0) { // pop: move last to root and sift down
      const lk = K[n], lv = V[n]; let i = 0;
      for (;;) { const l = 2 * i + 1; if (l >= n) break; let m = l; if (l + 1 < n && K[l + 1] < K[l]) m = l + 1; if (K[m] >= lk) break; K[i] = K[m]; V[i] = V[m]; i = m; }
      K[i] = lk; V[i] = lv;
    }
    if (k > d[c]) continue;
    const ci = c % GW, cj = (c - ci) / GW;
    for (let q = 0; q < 8; q++) {
      const ni = ci + NBI[q], nj = cj + NBJ[q];
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const nn = nj * GW + ni; if (blocked[nn]) continue;
      if (q > 3 && (blocked[cj * GW + ni] || blocked[nj * GW + ci])) continue;
      const nd = k + NBC[q] * (cost ? cost[nn] : 1);
      if (nd < d[nn]) { // push
        d[nn] = nd; let i = n++;
        while (i > 0) { const pp = (i - 1) >> 1; if (K[pp] <= nd) break; K[i] = K[pp]; V[i] = V[pp]; i = pp; }
        K[i] = nd; V[i] = nn;
      }
    }
  }
  return d;
}
function descend(f, c) {
  const ci = c % GW, cj = (c / GW) | 0; let best = f[c], bi = -1;
  for (const [di, dj] of NB) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue; const n = nj * GW + ni; if (f[n] < best) { best = f[n]; bi = n; } }
  return bi;
}
function nearestFinite(f, x, y) {
  const c = cellOf(x, y); if (f[c] < Infinity) return c;
  const ci = c % GW, cj = (c / GW) | 0; let best = Infinity, bi = -1;
  for (let r = 1; r <= 6 && bi < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
    const n = nj * GW + ni; if (f[n] < best) { best = f[n]; bi = n; }
  }
  return bi;
}
function fieldDir(f, x, y, look) {
  if (!f) return null;
  const c = nearestFinite(f, x, y); if (c < 0) return null;
  let t = c; for (let i = 0; i < look; i++) { const n = descend(f, t); if (n < 0) break; t = n; }
  const dx = cx(t) - x, dy = cy(t) - y, m = hyp(dx, dy);
  return m < 1e-6 ? null : [dx / m, dy / m];
}
function fieldAt(f, x, y) { if (!f) return Infinity; const c = nearestFinite(f, x, y); return c < 0 ? Infinity : f[c]; }
function offsets(r) { const o = []; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r) o.push([i, j]); return o; }
const OFF_R = offsets(1), OFF_B = offsets(4);
function borderGrid(rad) { const g = new Uint8Array(NC); for (let c = 0; c < NC; c++) { const x = cx(c), y = cy(c); if (x < rad || y < rad || x > SIM.W - rad || y > SIM.H - rad) g[c] = 1; } return g; }

/* ---------- per-scenario ground truth (used for sensing, physics and scoring only) ---------- */
const PREP = {};
function prep(key) {
  if (PREP[key]) return PREP[key];
  const scen = SCENARIOS[key];
  const occ0 = new Uint8Array(NC), trueB = borderGrid(BOX.R + 3), trueR = borderGrid(RR + 3);
  let nFree = 0;
  for (let c = 0; c < NC; c++) {
    const x = cx(c), y = cy(c);
    for (const r of scen.shelves) {
      const d = rectDist(x, y, r);
      if (d < 1) occ0[c] = 1;
      if (d < BOX.R + 3) trueB[c] = 1;
      if (d < RR + 3) trueR[c] = 1;
    }
    if (!trueR[c]) nFree++;
  }
  const dockSeeds = [];
  for (let c = 0; c < NC; c++) if (inRect(cx(c), cy(c), scen.dock, 12)) dockSeeds.push(c);
  return (PREP[key] = { scen, occ0, trueB, trueR, nFree, dockSeeds, bordR: borderGrid(RR + 3), bordB: borderGrid(BOX.R + 3), boxTrue: dijkstra(trueB, dockSeeds) });
}

/* ---------- world ---------- */
function makeWorld(g, seed, key, opt) {
  key = key || "warehouse"; opt = opt || {};
  const P = prep(key), scen = P.scen, rnd = rng(seed * 7919 + 13);
  const nS = clamp(Math.round(g.s), LIMITS.s[0], LIMITS.s[1]), nW = workersFor(nS);
  const G = { s: nS, c: clamp(g.c, LIMITS.c[0], LIMITS.c[1]), k: clamp(Math.round(g.k || 4), LIMITS.k[0], LIMITS.k[1]), p: clamp(g.p == null ? 0.8 : g.p, 0, 1) };
  // three packages at separate reachable spots
  const spots = scen.spots.filter(([x, y]) => fieldAt(P.boxTrue, x, y) < Infinity).slice();
  const pk = [];
  while (pk.length < NPKG && spots.length) {
    const [x, y] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
    if (pk.some((q) => hyp(q.x - x, q.y - y) < 150)) continue;
    const b = { id: pk.length, x: x + (rnd() - 0.5) * 16, y: y + (rnd() - 0.5) * 16, a: (rnd() - 0.5) * 0.6, vx: 0, vy: 0, w: 0,
      posted: false, delivered: false, tDone: 0, field: null, fieldAt: [0, 0], fieldT: -99, trail: [], stuck: 0, last: [0, 0], fx: 0, fy: 0, tq: 0, n: 0 };
    b.d0 = fieldAt(P.boxTrue, b.x, b.y); b.last = [b.x, b.y];
    pk.push(b);
  }
  const robots = [], bs = scen.base;
  for (let i = 0; i < nS + nW; i++) {
    let x, y, ok, tries = 0;
    do { x = bs.x + RR + rnd() * (bs.w - 2 * RR); y = bs.y + RR + rnd() * (bs.h - 2 * RR); ok = robots.every((r) => hyp(r.x - x, r.y - y) > 2 * RR + 2); } while (!ok && ++tries < 80);
    const scout = i < nS;
    robots.push({ id: i, x, y, h: (rnd() - 0.5) * 1.2, v: 0, dh: 0, scout, st: "explore", bat: 0.9 + rnd() * 0.1, used: 0,
      online: true, hops: 0, par: -1, buf: [], mem: [], task: -1, push: false, contact: false, slotOff: 0, slotRow: 0,
      frontier: rnd() < G.p, modeT: Math.floor(rnd() * 60), scan: scout ? new Float32Array(SCOUT.rays).fill(SCOUT.lidar) : null, ir: WORKER.ir, sees: 0 });
  }
  const w = { key, g: G, P, rnd, pk, robots, t: 0, done: false, map: new Uint8Array(NC), mapVer: 1, occList: [], nKnown: 0,
    dirty: opt.render ? [] : null, links: [], fields: {}, nOnline: robots.length, delivered: 0, energy: 0, base: [bs.x + bs.w / 2, bs.y + bs.h / 2] };
  // the team knows where its base and the dock are
  for (let c = 0; c < NC; c++) if (inRect(cx(c), cy(c), bs, 0) || inRect(cx(c), cy(c), scen.dock, 0)) setMap(w, c, 1);
  network(w);
  for (const ro of robots) if (ro.scout) lidar(w, ro);
  return w;
}

/* ---------- shared occupancy map ---------- */
function setMap(w, c, v) {
  const cur = w.map[c]; if (cur === 2 || cur === v) return;
  if (cur === 0 && !w.P.trueR[c]) w.nKnown++;
  w.map[c] = v; w.mapVer++;
  if (v === 2) w.occList.push(c);
  if (w.dirty && w.dirty.length < 20000) w.dirty.push(c);
}
function observe(w, ro, c, v) {
  const cur = w.map[c]; if (cur === 2 || cur === v) return;
  if (ro.online) setMap(w, c, v); else if (ro.buf.length < 8000) ro.buf.push(c * 4 + v);
}
function knownGrids(w) { // known obstacles inflated for robots and for packages; unknown cells cost more
  if (w.kgVer === w.mapVer) return w.kg;
  const P = w.P, bR = P.bordR.slice(), bB = P.bordB.slice(), cost = new Float32Array(NC);
  for (const c of w.occList) {
    const ci = c % GW, cj = (c / GW) | 0;
    for (const [i, j] of OFF_R) { const ni = ci + i, nj = cj + j; if (ni >= 0 && nj >= 0 && ni < GW && nj < GH) bR[nj * GW + ni] = 1; }
    for (const [i, j] of OFF_B) { const ni = ci + i, nj = cj + j; if (ni >= 0 && nj >= 0 && ni < GW && nj < GH) bB[nj * GW + ni] = 1; }
  }
  for (let c = 0; c < NC; c++) cost[c] = w.map[c] === 0 ? 1.6 : 1;
  w.kgVer = w.mapVer;
  return (w.kg = { bR, bB, cost });
}
function field(w, name, every, seedsFn, forBox) {
  const F = w.fields[name] || (w.fields[name] = { f: null, t: -999, ver: -1 });
  if (F.t > -999 && (w.t - F.t < every || F.ver === w.mapVer)) return F.f;
  const kg = knownGrids(w), seeds = seedsFn();
  F.f = seeds.length ? dijkstra(forBox ? kg.bB : kg.bR, seeds, kg.cost) : null; F.t = w.t; F.ver = w.mapVer;
  return F.f;
}
function baseField(w) { const b = w.P.scen.base; return field(w, "base", 30, () => { const s = []; for (let c = 0; c < NC; c++) if (inRect(cx(c), cy(c), b, 14)) s.push(c); return s; }); }
function boxField(w) { return field(w, "box", 20, () => w.P.dockSeeds, true); }
function frontierField(w) {
  return field(w, "front", 15, () => {
    const s = [], m = w.map, kg = knownGrids(w);
    for (let c = 0; c < NC; c++) {
      if (m[c] !== 1 || kg.bR[c]) continue;
      const i = c % GW, j = (c / GW) | 0;
      if ((i > 0 && m[c - 1] === 0) || (i < GW - 1 && m[c + 1] === 0) || (j > 0 && m[c - GW] === 0) || (j < GH - 1 && m[c + GW] === 0)) s.push(c);
    }
    return s;
  });
}
function packageField(w, b) { // route for robots to reach package b
  const moved = hyp(b.x - b.fieldAt[0], b.y - b.fieldAt[1]) > 25;
  if (b.field && !moved && (w.t - b.fieldT < 40 || b.fieldVer === w.mapVer)) return b.field;
  const kg = knownGrids(w), seeds = [], c0 = cellOf(b.x, b.y), ci = c0 % GW, cj = (c0 / GW) | 0, rr = Math.ceil((BOX.R + 16) / SIM.CELL);
  for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const ni = ci + di, nj = cj + dj; if (ni >= 0 && nj >= 0 && ni < GW && nj < GH) seeds.push(nj * GW + ni); }
  b.field = dijkstra(kg.bR, seeds, kg.cost); b.fieldAt = [b.x, b.y]; b.fieldT = w.t; b.fieldVer = w.mapVer;
  return b.field;
}

/* ---------- radio mesh: who can reach the base station, directly or through other robots ---------- */
function network(w) {
  const R = w.g.c, rob = w.robots, n = rob.length, sh = w.P.scen.shelves;
  const link = (x1, y1, x2, y2) => { const d = hyp(x2 - x1, y2 - y1); return d <= R * 0.5 || (d <= R && lineOfSight(sh, x1, y1, x2, y2)); };
  const seen = new Int8Array(n), q = [];
  w.links = [];
  for (let i = 0; i < n; i++) { rob[i].hops = -1; rob[i].par = -2; }
  for (let i = 0; i < n; i++) if (rob[i].st !== "dead" && link(w.base[0], w.base[1], rob[i].x, rob[i].y)) { seen[i] = 1; rob[i].hops = 1; rob[i].par = -1; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const a = rob[q[qi]];
    for (let j = 0; j < n; j++) if (!seen[j] && rob[j].st !== "dead") {
      const b = rob[j];
      if (Math.abs(b.x - a.x) > R || Math.abs(b.y - a.y) > R) continue;
      if (link(a.x, a.y, b.x, b.y)) { seen[j] = 1; b.hops = a.hops + 1; b.par = q[qi]; q.push(j); }
    }
  }
  let on = 0;
  for (let i = 0; i < n; i++) {
    const ro = rob[i], was = ro.online;
    ro.online = !!seen[i];
    if (ro.online) {
      on++;
      w.links.push([i, ro.par]);
      if (!was || ro.buf.length) { for (const e of ro.buf) setMap(w, e >> 2, e & 3); ro.buf.length = 0; }
      if (ro.mem.length) { for (const id of ro.mem) w.pk[id].posted = true; ro.mem.length = 0; }
    }
  }
  w.nOnline = on;
}

/* ---------- sensing ---------- */
function lidar(w, ro) {
  const occ = w.P.occ0, n = SCOUT.rays;
  let minD = SCOUT.lidar;
  for (let i = 0; i < n; i++) {
    const a = ro.h + i * 2 * Math.PI / n, dx = Math.cos(a), dy = Math.sin(a);
    let last = -1, hit = SCOUT.lidar;
    for (let d = 6; d <= SCOUT.lidar; d += 7) {
      const x = ro.x + dx * d, y = ro.y + dy * d;
      if (x < 0 || y < 0 || x >= SIM.W || y >= SIM.H) { hit = d; break; }
      const c = cellOf(x, y); if (c === last) continue; last = c;
      if (occ[c]) { observe(w, ro, c, 2); hit = d; break; }
      observe(w, ro, c, 1);
    }
    ro.scan[i] = hit; if (hit < minD) minD = hit;
  }
  ro.lidMin = minD;
}
function irRing(w, ro) {
  const occ = w.P.occ0; let minD = WORKER.ir;
  for (let i = 0; i < 8; i++) {
    const a = ro.h + i * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a);
    for (let d = RR; d <= RR + WORKER.ir; d += 6) {
      const x = ro.x + dx * d, y = ro.y + dy * d; if (x < 0 || y < 0 || x >= SIM.W || y >= SIM.H) { minD = Math.min(minD, d - RR); break; }
      const c = cellOf(x, y); if (occ[c]) { observe(w, ro, c, 2); minD = Math.min(minD, d - RR); break; }
      observe(w, ro, c, 1);
    }
  }
  ro.ir = minD;
}
function camera(w, ro) {
  let n = 0;
  for (const b of w.pk) {
    if (b.delivered) continue;
    const dx = b.x - ro.x, dy = b.y - ro.y, d = hyp(dx, dy);
    if (d > SCOUT.cam + BOX.half || Math.abs(wrap(Math.atan2(dy, dx) - ro.h)) > SCOUT.fov) continue;
    if (!lineOfSight(w.P.scen.shelves, ro.x, ro.y, b.x, b.y)) continue;
    n++;
    if (!b.posted) { if (ro.online) b.posted = true; else if (!ro.mem.includes(b.id)) ro.mem.push(b.id); }
  }
  ro.sees = n;
}

/* ---------- behaviour ---------- */
function turnTo(ro, ang, max) { const d = clamp(wrap(ang - ro.h), -max, max); ro.h += d; ro.dh = d; }
function blockedAhead(w, ro, look) {
  const x = ro.x + Math.cos(ro.h) * look, y = ro.y + Math.sin(ro.h) * look;
  if (x < 6 || y < 6 || x > SIM.W - 6 || y > SIM.H - 6) return true;
  for (const r of w.P.scen.shelves) if (rectDist(x, y, r) < 4) return true;
  for (const b of w.pk) if (!b.delivered && boxSurface(b, x, y).d < 4) return true;
  return false;
}
function wander(w, ro, v, noise) {
  const r = w.rnd;
  ro.h += (r() - 0.5) * noise; ro.dh = 0;
  if (r() < 0.004) ro.h += (r() - 0.5) * 3;
  if (blockedAhead(w, ro, RR + 12)) ro.h += (r() < 0.5 ? -1 : 1) * (0.7 + r() * 1.4);
  ro.v = v;
}
function follow(w, ro, f, T, vmax) {
  const d = fieldDir(f, ro.x, ro.y, 3);
  if (!d) return false;
  turnTo(ro, Math.atan2(d[1], d[0]), T.turn);
  if (blockedAhead(w, ro, RR + 8)) { ro.h += (w.rnd() < 0.5 ? -1 : 1) * 0.5; }
  ro.v = vmax; return true;
}
function reserveFor(w, ro) { // battery needed to drive home along the planned route, +35 % and a 4 % floor
  const T = ro.scout ? SCOUT : WORKER;
  let d = fieldAt(baseField(w), ro.x, ro.y) * SIM.CELL;
  if (!isFinite(d)) d = hyp(ro.x - w.base[0], ro.y - w.base[1]) * 1.5;
  const v = ro.scout ? T.v : (WORKER.v + WORKER.vSlow) / 2;
  const drain = BAT.idle + BAT.radio * (w.g.c / 250) ** 2 + (ro.scout ? BAT.scout + BAT.sense : BAT.worker);
  return 0.06 + 1.7 * d / v * drain;
}
function relayTargets(w) { // spread relay scouts along the line from the base station to the active packages
  if (w.relayT != null && w.t - w.relayT < 50) return;
  w.relayT = w.t;
  const rel = w.robots.filter((r) => (r.scout && r.st === "relay") || (!r.scout && r.st === "wait"));
  if (!rel.length) return;
  const open = w.pk.filter((b) => b.posted && !b.delivered), k = w.P.scen.dock;
  let tx = k.x + k.w / 2, ty = k.y + k.h / 2;
  if (open.length) { tx = 0; ty = 0; for (const b of open) { tx += b.x; ty += b.y; } tx /= open.length; ty /= open.length; }
  const [bx, by] = w.base, dx = tx - bx, dy = ty - by, D = hyp(dx, dy) || 1, n = rel.length;
  const sp = Math.min(0.75 * w.g.c, D / (n + 0.6)), kg = knownGrids(w);
  rel.sort((a, b) => hyp(a.x - bx, a.y - by) - hyp(b.x - bx, b.y - by));
  rel.forEach((r, i) => {
    const px = bx + dx / D * sp * (i + 1), py = by + dy / D * sp * (i + 1), c0 = cellOf(px, py), ci = c0 % GW, cj = (c0 / GW) | 0;
    let best = -1, bd = Infinity;
    for (let rr = 0; rr <= 10 && best < 0; rr++) for (let j = -rr; j <= rr; j++) for (let i2 = -rr; i2 <= rr; i2++) {
      const ni = ci + i2, nj = cj + j; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const c = nj * GW + ni; if (w.map[c] !== 1 || kg.bR[c]) continue;
      const d = i2 * i2 + j * j; if (d < bd) { bd = d; best = c; }
    }
    r.rt = best;
  });
}
function holdRelay(w, ro, T) {
  if (ro.rt == null || ro.rt < 0) { ro.v = 0; return; }
  const tx = cx(ro.rt), ty = cy(ro.rt);
  if (hyp(tx - ro.x, ty - ro.y) < 12) { ro.v = 0; return; }
  if (lineOfSight(w.P.scen.shelves, ro.x, ro.y, tx, ty)) { // clear line: drive straight there
    turnTo(ro, Math.atan2(ty - ro.y, tx - ro.x), T.turn);
    if (blockedAhead(w, ro, RR + 8)) ro.h += (w.rnd() < 0.5 ? -1 : 1) * 0.5;
    ro.v = T.v * 0.8; return;
  }
  if (!ro.rf || ro.rfC !== ro.rt || w.t - ro.rfT > 120) { const kg = knownGrids(w); ro.rf = dijkstra(kg.bR, [ro.rt], kg.cost); ro.rfC = ro.rt; ro.rfT = w.t; }
  if (!follow(w, ro, ro.rf, T, T.v * 0.8)) ro.v = 0;
}
function workerSpeed(w, ro) { // cautious in space nobody has mapped yet
  const c = cellOf(ro.x + Math.cos(ro.h) * 18, ro.y + Math.sin(ro.h) * 18);
  return w.map[c] === 1 ? WORKER.v : WORKER.vSlow;
}

function step(w) {
  if (w.done) return;
  const { robots, rnd, pk, P } = w, g = w.g, scen = P.scen;
  if (w.t % 5 === 0) network(w);
  // task allocation over the network: idle workers that are online join the package with the smallest crew
  if (w.t % 10 === 0) {
    const open = pk.filter((b) => b.posted && !b.delivered);
    if (open.length) {
      const crew = {}; for (const b of open) crew[b.id] = 0;
      for (const ro of robots) if (!ro.scout && ro.task >= 0 && crew[ro.task] != null && (ro.st === "go" || ro.st === "push")) crew[ro.task]++;
      const free = robots.filter((ro) => !ro.scout && ro.online && ro.task < 0 && (ro.st === "explore" || ro.st === "wait" || (ro.st === "charge" && ro.bat > 0.7)) && ro.bat > (ro.reserve || BAT.low) + 0.15);
      open.sort((a, b) => crew[a.id] - crew[b.id]);
      for (const b of open) {
        let need = g.k - crew[b.id];
        if (need <= 0 || !free.length) continue;
        free.sort((p, q) => hyp(p.x - b.x, p.y - b.y) - hyp(q.x - b.x, q.y - b.y));
        while (need-- > 0 && free.length) { const ro = free.shift(); ro.task = b.id; ro.st = "go"; }
      }
    }
  }
  relayTargets(w);
  const bf = boxField(w);
  // push faces and slots for each package
  for (const b of pk) {
    b.fx = 0; b.fy = 0; b.tq = 0; b.n = 0;
    if (b.delivered) continue;
    if (b.esc && w.t < b.esc.until) b.dir = b.esc.d; // un-stick manoeuvre
    else { b.esc = null; b.dir = fieldDir(bf, b.x, b.y, 4) || [1, 0]; }
    let nfx = 0, nfy = 0, best = -2;
    for (let k = 0; k < 4; k++) { const a = b.a + k * Math.PI / 2, nx = Math.cos(a), ny = Math.sin(a), dt = -(nx * b.dir[0] + ny * b.dir[1]); if (dt > best) { best = dt; nfx = nx; nfy = ny; } }
    b.face = [nfx, nfy];
    // traffic rule: a package right behind another one on its route waits (the one further along goes first)
    b.yield = false;
    for (const o of pk) {
      if (o === b || o.delivered) continue;
      const dx = o.x - b.x, dy = o.y - b.y, along = dx * b.dir[0] + dy * b.dir[1], side = Math.abs(-dx * b.dir[1] + dy * b.dir[0]);
      if (along > 0 && along < 110 && side < 75 && (o.n >= 3 || hyp(o.vx, o.vy) > 0.1)) { const pb = pkProgress(w, b), po = pkProgress(w, o); if (po > pb || (po === pb && o.id < b.id)) b.yield = true; }
    }
    const tfx = -nfy, tfy = nfx, bkx = b.x + nfx * BOX.half, bky = b.y + nfy * BOX.half;
    const ps = robots.filter((ro) => ro.task === b.id && ro.st === "push");
    b.crewN = ps.length;
    ps.sort((p, q) => ((p.x - bkx) ** 2 + (p.y - bky) ** 2) - ((q.x - bkx) ** 2 + (q.y - bky) ** 2));
    const front = ps.slice(0, 4).sort((p, q) => ((p.x - b.x) * tfx + (p.y - b.y) * tfy) - ((q.x - b.x) * tfx + (q.y - b.y) * tfy));
    front.forEach((ro, i) => { ro.slotOff = (i - (front.length - 1) / 2) * 17; ro.slotRow = 0; });
    ps.slice(4).forEach((ro) => { ro.slotRow = 1; });
  }

  for (const ro of robots) {
    ro.push = false; ro.dh = 0;
    if (ro.st === "dead") { ro.v = 0; continue; }
    const T = ro.scout ? SCOUT : WORKER;
    // sensing
    if (ro.scout) { if ((w.t + ro.id) % 2 === 0) lidar(w, ro); camera(w, ro); }
    else {
      if ((w.t + ro.id) % 3 === 0) irRing(w, ro);
      for (const b of pk) if (!b.delivered && !b.posted && boxSurface(b, ro.x, ro.y).d < WORKER.ir + RR) { if (ro.online) b.posted = true; else if (!ro.mem.includes(b.id)) ro.mem.push(b.id); }
    }
    observe(w, ro, cellOf(ro.x, ro.y), 1);
    // battery: head home while the charge left still covers the route back, with a safety margin
    if ((w.t + ro.id) % 10 === 0 && ro.st !== "return" && ro.st !== "charge") {
      ro.reserve = reserveFor(w, ro);
      if (ro.bat < ro.reserve || ((ro.st === "wait" || ro.st === "relay") && ro.bat < 0.45 && !inRect(ro.x, ro.y, scen.base, -RR))) { ro.st = "return"; ro.task = -1; }
    }
    if (ro.scout) {
      if (ro.st === "explore") {
        if (ro.mem.length && !ro.online) ro.st = "report";
        else {
          if (--ro.modeT <= 0) { ro.frontier = rnd() < g.p; ro.modeT = 60; }
          const ffAll = frontierField(w);
          if (!ffAll || coverage(w) > 0.985) { ro.st = "relay"; ro.v = 0; }
          const ff = ro.frontier ? ffAll : null;
          let moved = false;
          if (ff) {
            const d = fieldDir(ff, ro.x, ro.y, 4);
            if (d) {
              let vx = d[0], vy = d[1];
              for (const o of robots) if (o !== ro && o.scout && o.st === "explore") { const dx = ro.x - o.x, dy = ro.y - o.y, dd = hyp(dx, dy); if (dd > 1 && dd < 140) { vx += dx / dd * (140 - dd) / 90; vy += dy / dd * (140 - dd) / 90; } }
              turnTo(ro, Math.atan2(vy, vx), T.turn);
              if (blockedAhead(w, ro, RR + 10)) ro.h += (rnd() < 0.5 ? -1 : 1) * 0.6;
              ro.v = T.v; moved = true;
            }
          }
          if (!moved && ro.st === "explore") wander(w, ro, T.v, 0.5);
        }
      }
      if (ro.st === "relay") { // hold a spot on the chain between the base and the packages
        if (ro.mem.length && !ro.online) ro.st = "report"; else holdRelay(w, ro, T);
      }
      if (ro.st === "report") { // carry the news back until the mesh reaches the base
        if (ro.online || !ro.mem.length) ro.st = "explore";
        else if (!follow(w, ro, baseField(w), T, T.v)) wander(w, ro, T.v, 0.3);
      }
    } else {
      if (ro.st === "explore") { if (w.pk.every((b) => b.posted)) { ro.st = "wait"; ro.v = 0; } else wander(w, ro, workerSpeed(w, ro), 0.6); }
      if (ro.st === "wait") holdRelay(w, ro, T);
      if (ro.st === "go") {
        const b = pk[ro.task];
        if (!b || b.delivered) { ro.st = "explore"; ro.task = -1; }
        else if (hyp(b.x - ro.x, b.y - ro.y) < BOX.R + 45) ro.st = "push";
        else if (!follow(w, ro, packageField(w, b), T, workerSpeed(w, ro))) wander(w, ro, workerSpeed(w, ro), 0.4);
      }
      if (ro.st === "push") {
        const b = pk[ro.task];
        if (!b || b.delivered) { ro.st = "explore"; ro.task = -1; }
        else {
          const bx = b.x - ro.x, by = b.y - ro.y, bd = hyp(bx, by), [nfx, nfy] = b.face, tfx = -nfy, tfy = nfx;
          if (bd > BOX.R + 130) ro.st = "go";
          else {
            const back = BOX.half + RR + 2, sx = b.x + nfx * back + tfx * ro.slotOff, sy = b.y + nfy * back + tfy * ro.slotOff;
            const rel = -bx * nfx - by * nfy, sd = hyp(sx - ro.x, sy - ro.y);
            if (ro.slotRow) { if (bd < BOX.R + 55) { turnTo(ro, Math.atan2(-by, -bx), T.turn); ro.v = T.v * 0.6; } else { turnTo(ro, Math.atan2(by, bx), T.turn); ro.v = 0; } }
            else if (rel < BOX.half * 0.8 && bd < BOX.R + 34) {
              let tx = by, ty = -bx; if (tx * (sx - ro.x) + ty * (sy - ro.y) < 0) { tx = -tx; ty = -ty; }
              const m = hyp(tx, ty) || 1;
              turnTo(ro, Math.atan2(ty / m - by / bd * 0.6, tx / m - bx / bd * 0.6), T.turn); ro.v = T.v;
            } else if (sd > 10) { turnTo(ro, Math.atan2(sy - ro.y, sx - ro.x), T.turn); ro.v = T.v * Math.min(1, sd / 25 + 0.3); }
            else { turnTo(ro, Math.atan2(-nfy, -nfx), T.turn); ro.v = T.v * 0.8; ro.push = true; }
          }
        }
      }
    }
    if (ro.st === "return") {
      if (inRect(ro.x, ro.y, scen.base, -RR)) { ro.st = "charge"; ro.v = 0; }
      else if (!follow(w, ro, baseField(w), T, ro.scout ? T.v : workerSpeed(w, ro))) wander(w, ro, T.v * 0.7, 0.3);
    }
    if (ro.st === "charge") {
      ro.v = 0; ro.bat = Math.min(1, ro.bat + BAT.charge);
      if (ro.bat >= BAT.full) {
        if (!ro.scout && ro.task >= 0 && pk[ro.task] && !pk[ro.task].delivered) ro.st = "go";
        else { ro.task = -1; ro.st = ro.scout ? (frontierField(w) ? "explore" : "relay") : (w.pk.every((b) => b.posted) ? "wait" : "explore"); }
      }
    }
    // drive and collide
    ro.x += Math.cos(ro.h) * ro.v; ro.y += Math.sin(ro.h) * ro.v;
    walls(ro, RR);
    for (const r of scen.shelves) pushOutRect(ro, RR, r);
    ro.contact = false;
    for (const b of pk) {
      if (b.delivered) continue;
      const s = boxSurface(b, ro.x, ro.y);
      if (!(s.inside || s.d < RR)) continue;
      const bx = b.x - ro.x, by = b.y - ro.y, bd = hyp(bx, by) || 1;
      const nx = s.inside ? -bx / bd : (ro.x - s.px) / (s.d || 1), ny = s.inside ? -by / bd : (ro.y - s.py) / (s.d || 1);
      ro.x = s.px + nx * RR; ro.y = s.py + ny * RR;
      const hx = Math.cos(ro.h), hy = Math.sin(ro.h);
      if (!ro.scout && ro.push && ro.task === b.id && !b.yield && (hx * -nx + hy * -ny) > 0.5) {
        b.fx += hx * WORKER.power; b.fy += hy * WORKER.power; b.n++;
        b.tq += (s.px - b.x) * hy - (s.py - b.y) * hx; ro.contact = true;
      }
    }
    // energy
    const moving = Math.abs(ro.v) > 0.1;
    let use = BAT.idle + BAT.radio * (g.c / 250) ** 2;
    if (moving) use += ro.scout ? BAT.scout : BAT.worker;
    if (ro.scout) use += BAT.sense;
    if (ro.contact) use += BAT.push;
    if (ro.st !== "charge") { ro.bat -= use; ro.used += use; w.energy += use * (ro.scout ? BAT.capS : BAT.capW); }
    if (ro.bat <= 0) { ro.bat = 0; ro.st = "dead"; ro.v = 0; ro.task = -1; }
  }
  // robot-robot collisions
  for (let i = 0; i < robots.length; i++) for (let j = i + 1; j < robots.length; j++) {
    const a = robots[i], b = robots[j], dx = b.x - a.x, dy = b.y - a.y;
    if (dx > 2 * RR || dx < -2 * RR || dy > 2 * RR || dy < -2 * RR) continue;
    const d = hyp(dx, dy);
    if (d > 0 && d < RR * 2) { const p = (RR * 2 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
  }
  // packages cannot overlap
  for (let i = 0; i < pk.length; i++) for (let j = i + 1; j < pk.length; j++) {
    const a = pk[i], b = pk[j]; if (a.delivered || b.delivered) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), m = 2 * (BOX.R - 4);
    if (d > 0 && d < m) { const q = (m - d) / 2; a.x -= dx / d * q; a.y -= dy / d * q; b.x += dx / d * q; b.y += dy / d * q; }
  }
  // package dynamics: static friction, then sliding; off-centre pushes turn it
  for (const b of pk) {
    if (b.delivered) continue;
    const m = hyp(b.fx, b.fy);
    if (m > BOX.muS || (m > BOX.muK && hyp(b.vx, b.vy) > 0.05)) {
      const sp = Math.min(BOX.vmax, (m - BOX.muK) * BOX.k);
      const mx = b.fx / m * 0.55 + b.dir[0] * 0.45, my = b.fy / m * 0.55 + b.dir[1] * 0.45, mm = hyp(mx, my) || 1;
      b.vx = mx / mm * sp; b.vy = my / mm * sp;
      const turn = wrap(Math.atan2(b.dir[1], b.dir[0]) - Math.atan2(-b.face[1], -b.face[0]));
      b.w = clamp(turn * 0.04 + b.tq * 0.00005, -0.015, 0.015);
    } else { b.vx *= 0.5; b.vy *= 0.5; b.w *= 0.5; }
    b.x += b.vx; b.y += b.vy; b.a += b.w;
    walls(b, BOX.R - 6);
    for (const r of scen.shelves) pushOutRect(b, BOX.R - 6, r);
    b.pushing = m > BOX.muS;
    // stuck against an obstacle with a crew on it: push it away from the obstacle first, then back onto the route
    if (!b.yield && !b.esc && b.crewN >= 3 && hyp(b.vx, b.vy) < 0.05) b.stall = (b.stall || 0) + 1; else b.stall = Math.max(0, (b.stall || 0) - 2);
    if (b.stall > 80) {
      let px = b.x, py = b.y, best = 90;
      for (const r of scen.shelves) { const d = rectDist(b.x, b.y, r); if (d < best) { best = d; px = clamp(b.x, r.x, r.x + r.w); py = clamp(b.y, r.y, r.y + r.h); } }
      for (const [qx, qy] of [[0, b.y], [SIM.W, b.y], [b.x, 0], [b.x, SIM.H]]) { const d = hyp(b.x - qx, b.y - qy); if (d < best) { best = d; px = qx; py = qy; } }
      let ex = b.x - px, ey = b.y - py, em = hyp(ex, ey);
      if (em < 1) { const a = Math.atan2(b.dir[1], b.dir[0]) + (rnd() < 0.5 ? 1 : -1) * 1.1; ex = Math.cos(a); ey = Math.sin(a); em = 1; }
      ex = ex / em * 0.85 + b.dir[0] * 0.35; ey = ey / em * 0.85 + b.dir[1] * 0.35; em = hyp(ex, ey) || 1;
      b.esc = { d: [ex / em, ey / em], until: w.t + 45 }; b.stall = 0;
    }
    // pushers feel the package stop: whatever blocks it goes on the map
    if (w.t % 30 === 0) {
      if (b.pushing && hyp(b.x - b.last[0], b.y - b.last[1]) < 4) {
        const c0 = cellOf(b.x, b.y), ci = c0 % GW, cj = (c0 / GW) | 0;
        for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) { const ni = ci + di, nj = cj + dj; if (ni >= 0 && nj >= 0 && ni < GW && nj < GH && P.occ0[nj * GW + ni]) setMap(w, nj * GW + ni, 2); }
      }
      b.last = [b.x, b.y];
    }
    if (w.t % 15 === 0 && (b.vx || b.vy)) { b.trail.push([b.x, b.y]); if (b.trail.length > 300) b.trail.shift(); }
    if (inRect(b.x, b.y, scen.dock, 10)) {
      b.delivered = true; b.tDone = w.t; w.delivered++;
      const k = scen.dock; b.x = k.x + k.w / 2; b.y = k.y + 34 + (w.delivered - 1) * ((k.h - 68) / Math.max(1, NPKG - 1)); b.a = 0;
      for (const ro of robots) if (ro.task === b.id) { ro.task = -1; if (ro.st === "go" || ro.st === "push") ro.st = "explore"; }
    }
  }
  w.t++;
  if (w.delivered === pk.length) w.done = "goal";
  else if (w.t >= SIM.MAXT) w.done = "time";
}

/* ---------- scoring ---------- */
function pkProgress(w, b) { if (b.delivered) return 1; const d = fieldAt(w.P.boxTrue, b.x, b.y); return isFinite(d) && isFinite(b.d0) && b.d0 > 0 ? clamp(1 - d / b.d0, 0, 1) : 0; }
function progress(w) { let s = 0; for (const b of w.pk) s += pkProgress(w, b); return s / w.pk.length; }
function fitness(w) {
  let s = 0; for (const b of w.pk) s += b.delivered ? 1 : 0.5 * pkProgress(w, b);
  s /= w.pk.length;
  return w.done === "goal" ? s + (1 - w.t / SIM.MAXT) : s;
}
function points(f) { return Math.round(f * 50); }
function coverage(w) { return clamp(w.nKnown / w.P.nFree, 0, 1); }
function counts(w) {
  const c = { explore: 0, report: 0, relay: 0, go: 0, push: 0, wait: 0, return: 0, charge: 0, dead: 0 };
  for (const r of w.robots) c[r.st]++;
  return c;
}
function simulate(g, seed, key) { const w = makeWorld(g, seed, key); while (!w.done) step(w); return { f: fitness(w), t: w.t, e: w.energy, done: w.done, delivered: w.delivered, cov: coverage(w) }; }

/* ---------- evolution: genes = scouts (workers fill the budget), radio range, crew size, exploration ---------- */
const POP = 8, GENS = 10, EVAL_SEEDS = [3, 11];
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function randG(r) { return { s: Math.floor(r() * 10), c: 100 + r() * 300, k: 3 + Math.floor(r() * 4), p: r() }; }
function mutate(g, r) {
  const c = { s: g.s, c: g.c, k: g.k, p: g.p };
  if (r() < 0.5) c.s = clamp(c.s + Math.round(gauss(r) * 1.5), 0, 9);
  if (r() < 0.5) c.c = clamp(c.c + gauss(r) * 60, 100, 400);
  if (r() < 0.3) c.k = clamp(c.k + (r() < 0.5 ? -1 : 1), 3, 6);
  if (r() < 0.5) c.p = clamp(c.p + gauss(r) * 0.2, 0, 1);
  return c;
}
function newEvo(key, seed) { const r = rng(seed || ((Math.random() * 1e9) | 0)); return { key, r, pop: Array.from({ length: POP }, () => randG(r)), fits: new Array(POP), idx: 0, gen: 0, best: null }; }
function breed(ev) {
  const r = ev.r;
  const tour = () => { let k = -1; for (let i = 0; i < 3; i++) { const j = Math.floor(r() * POP); if (k < 0 || ev.fits[j] > ev.fits[k]) k = j; } return ev.pop[k]; };
  const order = ev.pop.map((g, i) => i).sort((a, b) => ev.fits[b] - ev.fits[a]);
  const next = [ev.pop[order[0]], ev.pop[order[1]]];
  while (next.length < POP) { const a = tour(), b = tour(); next.push(mutate({ s: r() < 0.5 ? a.s : b.s, c: r() < 0.5 ? a.c : b.c, k: r() < 0.5 ? a.k : b.k, p: r() < 0.5 ? a.p : b.p }, r)); }
  ev.pop = next; ev.fits = new Array(POP); ev.idx = 0;
}
function evalNext(ev) {
  const g = ev.pop[ev.idx];
  ev.fits[ev.idx] = EVAL_SEEDS.reduce((sum, sd) => sum + simulate(g, sd, ev.key).f, 0) / EVAL_SEEDS.length;
  ev.idx++;
  if (ev.idx < POP) return null;
  let bi = 0, mean = 0;
  for (let i = 0; i < POP; i++) { mean += ev.fits[i]; if (ev.fits[i] > ev.fits[bi]) bi = i; }
  mean /= POP;
  const improved = !ev.best || ev.fits[bi] > ev.best.f;
  if (improved) ev.best = { g: { s: ev.pop[bi].s, c: ev.pop[bi].c, k: ev.pop[bi].k, p: ev.pop[bi].p }, f: ev.fits[bi] };
  ev.gen++;
  const rep = { gen: ev.gen, genBest: ev.fits[bi], mean, best: ev.best, improved, replay: simulate(ev.best.g, EVAL_SEEDS[0], ev.key).f, last: ev.gen >= GENS };
  if (!rep.last) breed(ev);
  return rep;
}
if (typeof window === "undefined" && typeof self !== "undefined") {
  self.onmessage = (e) => {
    const msg = e.data || {}; if (msg.cmd !== "start") return;
    const ev = newEvo(msg.key || "warehouse");
    let rep;
    do { rep = evalNext(ev); if (rep) self.postMessage(rep); } while (!rep || !rep.last);
  };
}
