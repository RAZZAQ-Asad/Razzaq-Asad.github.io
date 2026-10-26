/* Swarm Lab v3 view: draws the building, the team's shared occupancy map, LiDAR scans, the radio mesh and the robots;
   runs the home-page swarms and the interactive lab. Needs engine.js loaded first. */
(function () {
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const AR = SIM.H / SIM.W;

  let COL = {}, DARK = false, themeVer = 0;
  function readCols() {
    const cs = getComputedStyle(document.documentElement);
    ["arena", "grid", "ink", "muted", "line", "scout", "worker", "box", "surface", "bg", "accent"].forEach((k) => (COL[k] = cs.getPropertyValue("--" + k).trim()));
    DARK = cs.getPropertyValue("color-scheme").trim() === "dark";
    COL.card = DARK ? "#B4844E" : "#C99A60"; COL.cardEdge = DARK ? "#7E5A31" : "#9C7442"; COL.tape = DARK ? "#D9C29A" : "#EAD6AE";
    COL.hazard = "#E5A93C"; COL.wheel = DARK ? "#0B1216" : "#1E2A31"; COL.ok = DARK ? "#6CCB8A" : "#2E8B57"; COL.bad = DARK ? "#F07A6A" : "#C2412D";
    COL.fog = DARK ? [6, 11, 14, 150] : [52, 66, 74, 70]; COL.occ = DARK ? [205, 220, 226, 235] : [21, 33, 42, 225];
    themeVer++;
  }
  readCols();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readCols);
  new MutationObserver(readCols).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth || 600;
    const px = Math.round(cw * dpr), py = Math.round(cw * AR * dpr);
    if (cv.width !== px || cv.height !== py) { cv.width = px; cv.height = py; }
    const ctx = cv.getContext("2d"), k = px / SIM.W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    return { ctx, k };
  }
  const alpha = (hex, a) => {
    if (hex.startsWith("#")) { const n = parseInt(hex.slice(1).length === 3 ? hex.slice(1).replace(/./g, "$&$&") : hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
    return hex.replace(/rgba?\(([^)]+)\)/, (m, v) => `rgba(${v.split(",").slice(0, 3).join(",")},${a})`);
  };
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- shared occupancy map as a 90 x 54 pixel image, updated cell by cell ---------- */
  function mapLayer(w) {
    let L = w._layer;
    if (!L || L.theme !== themeVer) {
      const cv = L ? L.cv : document.createElement("canvas"); cv.width = GW; cv.height = GH;
      const ctx = cv.getContext("2d"), img = ctx.createImageData(GW, GH);
      L = w._layer = { cv, ctx, img, theme: themeVer };
      for (let c = 0; c < NC; c++) paintCell(L, c, w.map[c]);
      if (w.dirty) w.dirty.length = 0;
      ctx.putImageData(img, 0, 0);
      return L;
    }
    if (w.dirty && w.dirty.length) { for (const c of w.dirty) paintCell(L, c, w.map[c]); w.dirty.length = 0; L.ctx.putImageData(L.img, 0, 0); }
    return L;
  }
  function paintCell(L, c, v) {
    const d = L.img.data, i = c * 4, col = v === 0 ? COL.fog : v === 2 ? COL.occ : null;
    if (col) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3]; } else d[i + 3] = 0;
  }

  function drawFloor(ctx, w, opt) {
    const sc = w.P.scen;
    ctx.fillStyle = COL.arena; ctx.fillRect(0, 0, SIM.W, SIM.H);
    ctx.lineWidth = 1; ctx.strokeStyle = COL.grid; ctx.beginPath();
    for (let x = 50; x < SIM.W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, SIM.H); }
    for (let y = 50; y < SIM.H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(SIM.W, y); }
    ctx.stroke();
    const b = sc.base;
    ctx.fillStyle = alpha(COL.scout, 0.08); ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = alpha(COL.scout, 0.6); ctx.lineWidth = 1.5; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
    ctx.fillStyle = alpha(COL.muted, 0.4);
    for (let y = b.y + 14; y < b.y + b.h - 6; y += 24) ctx.fillRect(b.x - 10, y, 6, 12); // chargers on the wall
    const k = sc.dock;
    ctx.fillStyle = alpha(COL.hazard, 0.13); ctx.fillRect(k.x, k.y, k.w, k.h);
    ctx.save(); ctx.beginPath(); ctx.rect(k.x, k.y, k.w, k.h); ctx.rect(k.x + 7, k.y + 7, k.w - 14, k.h - 14); ctx.clip("evenodd");
    ctx.fillStyle = COL.hazard; ctx.fillRect(k.x, k.y, k.w, k.h);
    ctx.strokeStyle = COL.wheel; ctx.lineWidth = 5; ctx.beginPath();
    for (let t = -k.h; t < k.w + k.h; t += 14) { ctx.moveTo(k.x + t, k.y); ctx.lineTo(k.x + t - k.h, k.y + k.h); }
    ctx.stroke(); ctx.restore();
    // the real building (the viewer sees it; the robots only know what they have mapped)
    sc.shelves.forEach((r, i) => {
      ctx.globalAlpha = 0.55;
      if (w.key === "rubble") {
        ctx.fillStyle = COL.box; rrect(ctx, r.x, r.y, r.w, r.h, 7); ctx.fill();
        ctx.strokeStyle = alpha(COL.arena, 0.4); ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(r.x + 6, r.y + r.h * 0.35); ctx.lineTo(r.x + r.w * 0.55, r.y + 6 + (i % 3) * 4);
        ctx.moveTo(r.x + r.w * 0.3, r.y + r.h - 6); ctx.lineTo(r.x + r.w - 6, r.y + r.h * 0.5); ctx.stroke();
      } else {
        ctx.fillStyle = COL.box; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = alpha(COL.arena, 0.45); ctx.lineWidth = 1.5; ctx.beginPath();
        for (let y = r.y + 15; y < r.y + r.h - 5; y += 22) { ctx.moveTo(r.x + 4, y); ctx.lineTo(r.x + r.w - 4, y); }
        ctx.moveTo(r.x + r.w / 2, r.y + 4); ctx.lineTo(r.x + r.w / 2, r.y + r.h - 4); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    // fog of war + mapped obstacles
    const L = mapLayer(w);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(L.cv, 0, 0, SIM.W, SIM.H); ctx.imageSmoothingEnabled = true;
    // base station antenna
    const [ax, ay] = w.base;
    ctx.strokeStyle = COL.scout; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay + 10); ctx.lineTo(ax, ay - 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay - 8, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.beginPath(); ctx.arc(ax, ay - 8, 11, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    if (opt.labels) {
      ctx.font = "600 13px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = alpha(COL.muted, 0.95);
      ctx.save(); ctx.translate(k.x + k.w / 2, k.y + k.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(sc.dockLabel, 0, 5); ctx.restore();
      ctx.fillText(sc.baseLabel, b.x + b.w / 2, b.y + b.h + 18);
    }
  }

  function drawRoute(ctx, w, b) {
    const f = w.fields.box && w.fields.box.f; if (!f) return;
    let c = nearestFinite(f, b.x, b.y); if (c < 0) return;
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    for (let i = 0; i < 160; i++) { const n = descend(f, c); if (n < 0) break; c = n; if (i % 2) ctx.lineTo((c % GW + 0.5) * SIM.CELL, (((c / GW) | 0) + 0.5) * SIM.CELL); }
    ctx.stroke();
  }

  function drawPackage(ctx, w, b, opt) {
    const h = BOX.half, known = b.posted || b.delivered;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.globalAlpha = known ? 1 : 0.45;
    ctx.fillStyle = alpha("#000000", 0.12); ctx.fillRect(-h + 3, -h + 4, 2 * h, 2 * h);
    ctx.fillStyle = COL.card; ctx.fillRect(-h, -h, 2 * h, 2 * h);
    if (!known) ctx.setLineDash([5, 4]);
    ctx.strokeStyle = COL.cardEdge; ctx.lineWidth = 2; ctx.strokeRect(-h, -h, 2 * h, 2 * h); ctx.setLineDash([]);
    ctx.fillStyle = COL.tape; ctx.fillRect(-4, -h, 8, 2 * h); ctx.fillRect(-h, -4, 2 * h, 8);
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.font = "700 13px 'IBM Plex Mono', monospace"; ctx.fillStyle = COL.wheel;
    ctx.fillText(known ? "P" + (b.id + 1) : "?", b.x, b.y + 5);
    if (opt.labels && b.posted && !b.delivered) {
      let crew = 0; for (const r of w.robots) if (r.task === b.id && (r.st === "push" || r.st === "go")) crew++;
      ctx.font = "600 11px 'IBM Plex Mono', monospace"; ctx.fillStyle = COL.ink;
      ctx.fillText(b.yield ? "waiting" : b.n + " pushing" + (crew > b.n ? " · " + (crew - b.n) + " coming" : ""), b.x, b.y - h - 8);
    }
    if (b.delivered) { ctx.strokeStyle = COL.ok; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x - 9, b.y + 15); ctx.lineTo(b.x - 2, b.y + 22); ctx.lineTo(b.x + 11, b.y + 9); ctx.stroke(); }
  }

  function drawRobot(ctx, ro, opt) {
    const c = Math.cos(ro.h), s = Math.sin(ro.h), dead = ro.st === "dead";
    ctx.save(); ctx.translate(ro.x, ro.y); ctx.rotate(ro.h);
    ctx.fillStyle = COL.wheel; ctx.fillRect(-4.5, -RR - 1.6, 9, 3.2); ctx.fillRect(-4.5, RR - 1.6, 9, 3.2);
    ctx.beginPath(); ctx.arc(0, 0, RR, 0, Math.PI * 2); ctx.fillStyle = dead ? COL.muted : ro.scout ? COL.scout : COL.worker; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = alpha(COL.wheel, 0.55); ctx.stroke();
    ctx.fillStyle = COL.arena;
    if (ro.scout) { ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(RR - 4.5, -2.5, 3, 5); } // LiDAR dome + camera
    else { ctx.beginPath(); ctx.arc(RR - 3.5, 0, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (ro.contact) {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(ro.x - c * 2 - s * 4, ro.y - s * 2 + c * 4); ctx.lineTo(ro.x + c * 3, ro.y + s * 3); ctx.lineTo(ro.x - c * 2 + s * 4, ro.y - s * 2 - c * 4); ctx.stroke();
    }
    if (opt.battery) { // battery gauge
      const bw = 14, x = ro.x - bw / 2, y = ro.y - RR - 7;
      ctx.fillStyle = alpha(COL.wheel, 0.35); ctx.fillRect(x, y, bw, 3);
      ctx.fillStyle = ro.bat < 0.25 ? COL.bad : ro.st === "charge" ? COL.ok : COL.ink; ctx.fillRect(x, y, bw * ro.bat, 3);
    }
    if (!ro.online && !dead) { ctx.strokeStyle = COL.bad; ctx.lineWidth = 1.3; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(ro.x, ro.y, RR + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (ro.st === "charge") { ctx.fillStyle = COL.ok; ctx.font = "700 10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillText("+", ro.x + RR + 4, ro.y - RR); }
  }

  function draw(cv, w, opt = {}) {
    const { ctx } = fit(cv);
    drawFloor(ctx, w, opt);
    // planned routes for known packages
    ctx.setLineDash([3, 7]); ctx.strokeStyle = alpha(COL.accent, 0.7); ctx.lineWidth = 2.2;
    for (const b of w.pk) if (b.posted && !b.delivered) drawRoute(ctx, w, b);
    ctx.setLineDash([]);
    ctx.fillStyle = alpha(COL.card, 0.5);
    for (const b of w.pk) for (const [x, y] of b.trail) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
    // radio mesh (links back to the base station)
    if (opt.radio !== false) {
      ctx.strokeStyle = alpha(COL.scout, 0.35); ctx.lineWidth = 1.2; ctx.beginPath();
      for (const [i, p] of w.links) { const a = w.robots[i], b = p >= 0 ? w.robots[p] : { x: w.base[0], y: w.base[1] - 8 }; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    // sensors: LiDAR scans and camera field of view
    const sel = opt.sel != null ? w.robots[opt.sel] : null;
    for (const ro of w.robots) {
      if (!ro.scout || ro.st === "dead" || ro.st === "charge") continue;
      if (ro !== sel && (!opt.sensors || (ro.st !== "explore" && ro.st !== "report"))) continue;
      ctx.fillStyle = alpha(COL.scout, ro === sel ? 0.16 : 0.08); ctx.beginPath();
      const n = ro.scan.length;
      for (let i = 0; i <= n; i++) { const a = ro.h + (i % n) * 2 * Math.PI / n, d = ro.scan[i % n]; const x = ro.x + Math.cos(a) * d, y = ro.y + Math.sin(a) * d; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = alpha(COL.scout, 0.55);
      for (let i = 0; i < n; i++) if (ro.scan[i] < SCOUT.lidar - 1) { const a = ro.h + i * 2 * Math.PI / n; ctx.fillRect(ro.x + Math.cos(a) * ro.scan[i] - 1.5, ro.y + Math.sin(a) * ro.scan[i] - 1.5, 3, 3); }
      if (ro.sees || ro === sel) { ctx.strokeStyle = alpha(COL.accent, ro.sees ? 0.7 : 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ro.x, ro.y); ctx.arc(ro.x, ro.y, SCOUT.cam, ro.h - SCOUT.fov, ro.h + SCOUT.fov); ctx.closePath(); ctx.stroke(); }
    }
    for (const b of w.pk) drawPackage(ctx, w, b, opt);
    for (const ro of w.robots) drawRobot(ctx, ro, opt);
    if (sel) { ctx.setLineDash([3, 3]); ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sel.x, sel.y, RR + 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (w.done && opt.labels) {
      ctx.fillStyle = COL.ink; ctx.font = "700 20px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText(w.done === "goal" ? "MISSION COMPLETE" : "TIME UP", SIM.W / 2, 30);
    }
  }

  const fmtT = (steps) => { const s = Math.round(steps / 10); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const kJ = (e) => e.toFixed(1) + " kJ";

  /* ---------- ambient swarms (home page) ---------- */
  const loops = [];
  function ambient(cv, key, g, seed, opt) {
    if (!cv) return;
    const L = { cv, key, g, seed, w: makeWorld(g, seed, key, { render: true }), pause: 0, vis: true, opt, spf: opt.spf || 2 };
    if (reduce) for (let i = 0; i < 900 && !L.w.done; i++) step(L.w);
    loops.push(L);
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (L.vis = e.isIntersecting))).observe(cv);
    draw(cv, L.w, opt);
  }
  ambient($("hero-arena"), "warehouse", { s: 4, c: 250, k: 4, p: 0.85 }, 2, { sensors: true, labels: false, battery: false, spf: 3 });
  ambient($("teaser"), "warehouse", { s: 4, c: 250, k: 4, p: 0.85 }, 5, { sensors: true, labels: true, battery: true, spf: 2 });
  addEventListener("resize", () => loops.forEach((L) => draw(L.cv, L.w, L.opt)));

  /* ---------- Swarm Lab ---------- */
  const arenaCv = $("arena");
  const lab = arenaCv ? setupLab() : null;

  function setupLab() {
    const SEED = EVAL_SEEDS[0];
    const st = { key: "warehouse", w: null, running: false, speed: 1, mode: "you", vis: true, sensors: true, best: {}, sel: null };
    const bestOf = () => (st.best[st.key] = st.best[st.key] || { you: null, evo: null });
    const vopt = () => ({ sensors: st.sensors, labels: true, battery: true, sel: st.sel });

    /* robot inspector */
    function pickAt(ev) {
      const r = arenaCv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * SIM.W, y = (ev.clientY - r.top) / r.height * SIM.H;
      let best = -1, bd = 24;
      st.w.robots.forEach((ro, i) => { const d = Math.hypot(ro.x - x, ro.y - y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { st.sel = best; inspect(true); draw(arenaCv, st.w, vopt()); }
    }
    arenaCv.addEventListener("click", pickAt);
    arenaCv.style.cursor = "crosshair";
    $("pick").addEventListener("click", () => { st.sel = Math.floor(Math.random() * st.w.robots.length); inspect(true); draw(arenaCv, st.w, vopt()); });
    const bar = (v, signed) => {
      v = Math.max(-1, Math.min(1, v));
      if (!signed) return `left:0;width:${(Math.max(0, v) * 100).toFixed(1)}%;background:var(--scout)`;
      return v >= 0 ? `left:50%;width:${(v * 50).toFixed(1)}%;background:var(--scout)` : `left:${(50 + v * 50).toFixed(1)}%;width:${(-v * 50).toFixed(1)}%;background:var(--worker)`;
    };
    const row = (label, v, txt, signed) => `<div class="irow"><span>${label}</span><i><b style="${bar(v, signed)}"></b></i><output>${txt}</output></div>`;
    let inspTick = 0;
    function inspect(force) {
      if (st.sel == null) return;
      if (!force && ++inspTick % 5) return;
      const w = st.w, ro = w.robots[st.sel]; if (!ro) return;
      $("insp-empty").hidden = true; $("insp-body").hidden = false;
      const AXLE = 12, vl = (ro.v - ro.dh * AXLE / 2) * 10, vr = (ro.v + ro.dh * AXLE / 2) * 10;
      const type = ro.scout ? "Scout · 360° LiDAR 2.5 m · camera ±60° · radio " + (w.g.c / 100).toFixed(1) + " m · cannot push"
        : "Worker · IR ring 25 cm · radio " + (w.g.c / 100).toFixed(1) + " m · pushes";
      $("insp-title").textContent = "Robot " + (ro.id + 1) + " · " + type;
      let rows = "";
      const radio = ro.online ? "online · " + ro.hops + (ro.hops === 1 ? " hop" : " hops") : (ro.st === "dead" ? "off" : "out of range");
      if (ro.scout) {
        const lm = ro.lidMin == null ? SCOUT.lidar : ro.lidMin;
        rows += row("LiDAR: nearest obstacle", 1 - lm / SCOUT.lidar, (lm / 100).toFixed(2) + " m");
        rows += row("camera: packages in view", Math.min(1, ro.sees / 2), String(ro.sees));
        rows += row("team map explored", coverage(w), Math.round(coverage(w) * 100) + "%");
        rows += row("map data waiting to send", Math.min(1, ro.buf.length / 800), ro.buf.length + " cells");
      } else {
        const b = ro.task >= 0 ? w.pk[ro.task] : null, dm = b ? Math.max(0, Math.hypot(b.x - ro.x, b.y - ro.y) - BOX.R) / 100 : null;
        rows += row("IR: nearest obstacle", 1 - ro.ir / WORKER.ir, ro.ir >= WORKER.ir ? "clear" : ro.ir.toFixed(0) + " cm");
        rows += row("task", b ? 1 : 0, b ? "package P" + (b.id + 1) : "none");
        rows += row("distance to package", b ? 1 - Math.min(1, dm / 6) : 0, b ? dm.toFixed(2) + " m" : "–");
        rows += row("pushing", ro.contact ? 1 : 0, ro.contact ? "yes" : "no");
      }
      rows += row("radio mesh", ro.online ? 1 : 0, radio);
      rows += row("battery", ro.bat, Math.round(ro.bat * 100) + "%");
      $("insp-rows").innerHTML = rows;
      $("insp-wheels").innerHTML = row("left wheel", vl / 30, vl.toFixed(1) + " cm/s", true) + row("right wheel", vr / 30, vr.toFixed(1) + " cm/s", true);
      const states = ro.scout
        ? [["explore", "Explore"], ["report", "Carry news home"], ["relay", "Hold as relay"], ["return", "Return"], ["charge", "Charge"]]
        : [["explore", "Search"], ["go", "To package"], ["push", ro.slotRow ? "Wait in line" : "Push"], ["wait", "Standby"], ["return", "Return"], ["charge", "Charge"]];
      $("insp-fsm").innerHTML = states.map(([k, l]) => `<span class="${ro.st === k ? "on" : ""}">${l}</span>`).join('<i aria-hidden="true">→</i>') + (ro.st === "dead" ? ' <span class="on" style="background:var(--muted);border-color:var(--muted)">Battery empty</span>' : "");
      const notes = {
        explore: ro.scout ? (ro.frontier ? "Driving to the nearest edge of the known map (frontier exploration) and scanning with LiDAR and camera." : "Random walk with obstacle avoidance, scanning with LiDAR and camera.")
          : "No task yet. Searching slowly: without LiDAR it creeps through unmapped space and only feels obstacles and packages with its IR ring.",
        report: "Saw a package while out of radio range. Driving back toward the base until the mesh can carry the message.",
        relay: "The map is complete. Holding a spot on the chain between the base station and the packages, so messages can hop back to base.",
        go: "Assigned to a package over the radio. Following a route planned on the shared map; unmapped cells are treated as risky.",
        push: ro.slotRow ? "Four robots are already pushing, so it waits nearby as a spare." : (ro.contact ? "Lined up on the back face and pushing the package along its route to the dock." : "Moving to its slot on the back face of the package."),
        wait: "Every package has been found and has a crew. Standing by to save battery.",
        return: "Battery low for the trip back. Driving home on the planned route.",
        charge: "Charging at the bay (" + Math.round(ro.bat * 100) + "%).",
        dead: "Ran out of battery before reaching the charging bay."
      };
      $("insp-note").textContent = notes[ro.st] || "";
    }

    const userG = () => ({ s: +$("s-scouts").value, c: +$("s-radio").value, k: +$("s-crew").value, p: $("s-explore").value / 100 });
    function renderDesign() {
      const s = +$("s-scouts").value, wk = workersFor(s), used = s * COST.scout + wk * COST.worker;
      $("o-scouts").textContent = s + " scouts · " + wk + " workers";
      $("o-radio").textContent = (+$("s-radio").value / 100).toFixed(1) + " m";
      $("o-crew").textContent = $("s-crew").value + " workers";
      $("o-explore").textContent = $("s-explore").value + "% frontier";
      $("bud-s").style.width = (s * COST.scout / BUDGET * 100) + "%"; $("bud-w").style.width = (wk * COST.worker / BUDGET * 100) + "%";
      $("bud-txt").textContent = s * COST.scout + " + " + wk * COST.worker + " = " + used + " / " + BUDGET + " credits";
      const mix = $("mix"); mix.innerHTML = "";
      for (let i = 0; i < s + wk; i++) { const d = document.createElement("span"); d.style.background = i < s ? "var(--scout)" : "var(--worker)"; mix.appendChild(d); }
    }
    function reset(g) { st.w = makeWorld(g || userG(), SEED, st.key, { render: true }); st.running = false; if (st.sel != null && st.sel >= st.w.robots.length) st.sel = null; hud(); inspect(true); draw(arenaCv, st.w, vopt()); }
    function hud() {
      const w = st.w, c = counts(w);
      $("hud").textContent = "t " + fmtT(w.t) + " · delivered " + w.delivered + "/" + w.pk.length + " · map " + Math.round(coverage(w) * 100) + "% · online " + w.nOnline + "/" + w.robots.length;
      const parts = [];
      if (c.explore) parts.push(c.explore + " exploring"); if (c.report) parts.push(c.report + " reporting"); if (c.relay) parts.push(c.relay + " relaying");
      if (c.go) parts.push(c.go + " heading to a package"); if (c.push) parts.push(c.push + " at a package"); if (c.wait) parts.push(c.wait + " standing by");
      if (c.return) parts.push(c.return + " returning"); if (c.charge) parts.push(c.charge + " charging"); if (c.dead) parts.push(c.dead + " battery empty");
      $("hud2").textContent = parts.join(" · ") + " · energy " + kJ(w.energy);
    }
    function describe(w) {
      const f = fitness(w);
      return w.done === "goal" ? "All 3 delivered in " + fmtT(w.t) + " · " + points(f) + " pts · " + kJ(w.energy)
        : "Time up (6:00). Delivered " + w.delivered + " of 3 · " + points(f) + " pts";
    }
    function board() { const b = bestOf(); $("b-you").textContent = b.you == null ? "–" : points(b.you); $("b-evo").textContent = b.evo == null ? "–" : points(b.evo); }
    ["s-scouts", "s-radio", "s-crew", "s-explore"].forEach((id) => $(id).addEventListener("input", () => { renderDesign(); if (st.mode === "you") reset(); $("result").textContent = "Press Run mission."; }));
    $("run").addEventListener("click", () => { setTab("you"); reset(); st.running = true; $("result").textContent = "Running…"; });
    $("reset").addEventListener("click", () => { reset(); $("result").textContent = "Reset. Press Run mission."; });
    $("speed").addEventListener("click", (e) => { st.speed = st.speed === 1 ? 4 : st.speed === 4 ? 10 : 1; e.currentTarget.textContent = "Speed " + st.speed + "×"; e.currentTarget.setAttribute("aria-pressed", st.speed > 1); });
    $("sensors").addEventListener("click", (e) => { st.sensors = !st.sensors; e.currentTarget.setAttribute("aria-pressed", st.sensors); draw(arenaCv, st.w, vopt()); });
    $("scen").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      document.querySelectorAll("#scen .chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
      st.key = b.dataset.key; stopEvo(); evo.best = null; evo.hist = []; evo.gen = 0;
      $("e-gen").textContent = "0 / " + GENS; $("e-best").textContent = "–"; $("e-geno").textContent = "–"; $("evo-load").disabled = true; drawChart();
      setTab("you"); board(); $("result").textContent = SCENARIOS[st.key].label + ". Press Run mission.";
    });

    function setTab(t) {
      st.mode = t;
      $("tab-you").setAttribute("aria-selected", t === "you"); $("tab-evo").setAttribute("aria-selected", t === "evo");
      $("p-you").hidden = t !== "you"; $("p-evo").hidden = t !== "evo";
      if (t === "you") reset();
      else if (evo.best) { reset(evo.best.g); st.running = true; }
      else reset();
    }
    $("tab-you").addEventListener("click", () => setTab("you"));
    $("tab-evo").addEventListener("click", () => setTab("evo"));

    const evo = { running: false, hist: [], best: null, gen: 0, worker: null, local: null };
    const genoText = (g) => g.s + " scouts · " + workersFor(g.s) + " workers · radio " + (g.c / 100).toFixed(1) + " m · crew " + g.k + " · " + Math.round(g.p * 100) + "% frontier";
    function onReport(rep) {
      evo.gen = rep.gen; evo.hist.push({ best: rep.best.f, mean: rep.mean });
      if (rep.improved) { evo.best = rep.best; if (st.mode === "evo") { reset(evo.best.g); st.running = true; } }
      $("e-gen").textContent = rep.gen + " / " + GENS;
      $("e-best").textContent = points(evo.best.f);
      $("e-geno").textContent = genoText(evo.best.g);
      $("evo-load").disabled = false;
      if (rep.improved) { const b = bestOf(); if (b.evo == null || rep.replay > b.evo) b.evo = rep.replay; board(); }
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
        evo.worker.onerror = (e) => { if (e.preventDefault) e.preventDefault(); if (evo.worker) { evo.worker.terminate(); evo.worker = null; } evo.local = newEvo(st.key); };
        evo.worker.postMessage({ cmd: "start", key: st.key });
      } catch (err) { evo.worker = null; evo.local = newEvo(st.key); }
    }
    function stopEvo() {
      if (evo.worker) { evo.worker.terminate(); evo.worker = null; }
      evo.local = null; evo.running = false;
      $("evo-start").disabled = false; $("evo-stop").disabled = true; $("evo-start").textContent = evo.gen ? "Evolve again" : "Start evolution";
    }
    function evoTick() { const t0 = performance.now(); while (evo.local && performance.now() - t0 < 14) { const rep = evalNext(evo.local); if (rep) onReport(rep); } }
    $("evo-start").addEventListener("click", startEvo);
    $("evo-stop").addEventListener("click", stopEvo);
    $("evo-load").addEventListener("click", () => {
      if (!evo.best) return;
      const g = evo.best.g;
      $("s-scouts").value = g.s; $("s-radio").value = Math.round(g.c / 10) * 10; $("s-crew").value = g.k; $("s-explore").value = Math.round(g.p * 100);
      renderDesign(); setTab("you"); $("result").textContent = "Evolution's design loaded. Press Run mission.";
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
    addEventListener("resize", () => { drawChart(); draw(arenaCv, st.w, vopt()); });
    renderDesign(); reset(); drawChart(); board();

    return {
      tick() {
        if (evo.local) evoTick();
        if (st.running) {
          for (let i = 0; i < st.speed && !st.w.done; i++) step(st.w);
          if (st.w.done) {
            st.running = false;
            if (st.mode === "you") {
              const f = fitness(st.w); $("result").textContent = describe(st.w);
              const b = bestOf(); if (b.you == null || f > b.you) { b.you = f; board(); }
            } else if (evo.best) {
              setTimeout(() => { if (st.mode === "evo" && evo.best) { reset(evo.best.g); st.running = true; } }, 1500);
            }
          }
          hud();
        }
        if (st.vis) { draw(arenaCv, st.w, vopt()); if (st.running) inspect(false); }
      }
    };
  }

  /* ---------- main loop ---------- */
  function frame() {
    if (!reduce) for (const L of loops) {
      if (!L.vis) continue;
      if (L.w.done) { if (++L.pause > 150) { L.seed++; L.w = makeWorld(L.g, L.seed, L.key, { render: true }); L.pause = 0; } }
      else for (let i = 0; i < L.spf && !L.w.done; i++) step(L.w);
      draw(L.cv, L.w, L.opt);
    }
    if (lab) lab.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
