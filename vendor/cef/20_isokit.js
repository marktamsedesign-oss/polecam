/* (beta 7.19, riser detail) The CEF editor's isometric model, shared. The owner (27 Nov, on beta 7.18): "Can you use the riser cable model of the CEF?
   it much more ok than this.. also check other model of the CEF that can be reuse on this riser detail." The As-plan's riser detail (dxftpl.js riserDraw)
   draws with the CEF editor's own model: its 3D scene with the hidden lines taken out (Scene), its building blocks (prism, tube, frustum, loft), the riser
   kit on a pole (riserKit: the G.I. pipe, the U-guard and their straps), the bend of the conduit under a riser (elbow2), the dome closure, the break mark,
   the standard's sizes (STD, riserParts) and the plan geometry they use. Moved here unchanged from 30_core.js and 40_iso.js (riserKit takes the heights of
   its parts as an 8th argument; none: as before), so that the plan builder can load them where the CEF's own files cannot go: the plan's worker
   (dxf-worker.js), the app's page (loaded before dxftpl.js) and Node (dxftpl.js requires it). The CEF's page loads this file first and 30_core.js /
   40_iso.js take these names from here (GeCefIso): the CEF's drawings are byte for byte as before (tests/cef-drawing.test.cjs, cef-template.test.cjs). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GeCefIso = factory(); }(typeof self !== 'undefined' ? self : this, function () {
'use strict';
/* ---------- basics (30_core.js) ---------- */
const D2R = Math.PI / 180, C30 = Math.cos(Math.PI / 6);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
/* Dimensions read from the OSP standard drawings, in metres.
   Closure on a pole: the messenger wire is 5.5 m above ground on a 9.14 m pole that stands 1.5 m in the ground. The loop, 0.4 m across at most, sits in its holder 0.1 m above the wire; the closure, 0.45 m high, stands 0.1 m above the loop.
   Riser: concrete encasement 0.406 m above ground and 1.32 m below, 100 mm of concrete on each side of the 270 mm pole; G.I. pipe held by stainless straps 0.585, 0.838 and 0.838 m apart; above it a U-guard with a strap pipe every 0.6 m; the bend below ground has a 1 m radius.
   Conduit, as on the hand-made CEF plans (2022 to 2026): two runs of 114.3 mm PVC, concrete encased, each with four 32 mm HDPE sub-ducts; the G.I. riser pipe is 114.3 mm too.
   Where the conduit comes out of the ground: a concrete block with the pipe the cable is in and the spare pipe, which is closed with a blank duct plug. */
const STD = { msg: 5.5, poleUp: 7.64, poleIn: 1.5, loopD: 0.4, gap: 0.1, cloH: 0.45, cloR: 0.095, encUp: 0.406, encDn: 1.32, encW: 0.47, gi: [0.585, 0.838, 0.838], ugd: [0.6, 0.6, 0.6, 0.6], bendR: 1, hdpe: 0.1143, sub: 0.032, sleeve: 0.114, exitW: 0.42 };
const LOOPZ = STD.gap + STD.loopD / 2, CLOZ = 2 * STD.gap + STD.loopD, bendR = d => Math.min(STD.bendR, Math.max(0.05, d - 0.03));      /* the bend below a riser or an exit conduit: 1 m radius where the depth allows it */      /* above the wire: the middle of the loop, and the bottom of the closure */
const PED = { w: 0.36, d: 0.3, h: 1 };
/* the riser on a pole whose cable is zc above the datum and whose ground is at g: where the encasement ends, where the G.I. pipe ends and the U-guard ends, and the heights of their straps */
function riserParts(g, zc, ped) {
  if (ped) { const giTop = g + PED.h, R = riserParts(g, zc), ugTop = Math.max(giTop + 0.3, R.ugTop), ug = []; for (let t = giTop + 0.3; t < ugTop - 0.04; t += 0.6) ug.push(t); return { e: g, giTop, ugTop, gi: [], ug, ped: 1 }; }      /* (fix 47) a pedestal box at the foot: no encasement of its own and no G.I. pipe; the U-guard goes from the top of the box to where it ends on a riser */
  const e = g + STD.encUp, gi = [], ug = []; let z = e; for (const q of STD.gi) { z += q; gi.push(z); }
  const giTop = Math.max(e + 0.2, Math.min(z, zc - 1)); let t = giTop; for (const q of STD.ugd) { t += q; ug.push(t); }
  const ugTop = Math.max(giTop, Math.min(t + 0.1, zc - 0.3));
  return { e, giTop, ugTop, gi: gi.filter(q => q <= giTop + 1e-6), ug: ug.filter(q => q <= ugTop - 0.04) };
}
const rot2 = (x, y, a) => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [x * c - y * s, x * s + y * c]; };
function rectAt(c, w, d, rot) { return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(p => { const q = rot2(p[0], p[1], rot || 0); return [c[0] + q[0], c[1] + q[1]]; }); }
const sqr = (c, half, rot) => rectAt(c, half * 2, half * 2, rot);
function polyBox(P) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return [x0, y0, x1, y1]; }
/* a pole tapers to 0.7 of its foot at the top: its radius dz above its foot. What is fastened to it lies against it at that height. */
const poleR = (pole, dz) => Math.max(pole.w / 2, 0.1) * (1 - 0.3 * clamp(dz / Math.max(0.02, num(pole.h, 0.02)), 0, 1));
const GIR = 0.057;                                  /* half the width of the G.I. riser pipe */
function hull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}

/* ---------- isometric view (30 degree axes): one 3D scene, hidden lines removed (40_iso.js) ---------- */
const VD = [1, -1, 1];                       /* direction towards the viewer */
const proj = p => [(p[0] + p[1]) * C30, (p[1] - p[0]) * 0.5 + p[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const k3 = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4);
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  unit: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
};
function newell(F) { let x = 0, y = 0, z = 0; for (let i = 0; i < F.length; i++) { const a = F[i], b = F[(i + 1) % F.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return [x, y, z]; }

function Scene(k, cx, cy) { this.k = ((k | 0) % 4 + 4) % 4; this.cx = cx; this.cy = cy; this.faces = []; this.segs = []; this.masks = []; this.sid = 0; this.thru = new Set(); }
/* turn the model about the site centre in quarter turns, so the site can be seen from each corner */
Scene.prototype.R = function (p) { let x = p[0] - this.cx, y = p[1] - this.cy; for (let i = 0; i < this.k; i++) { const t = x; x = -y; y = t; } return [x + this.cx, y + this.cy, p[2] || 0]; };
Scene.prototype.P = function (p) { return proj(this.R(p)); };
/* the direction on the ground that runs level across the drawing, whichever way the model is turned */
Scene.prototype.hdir = function () { let x = Math.SQRT1_2, y = Math.SQRT1_2; for (let i = 0; i < this.k; i++) { const t = x; x = y; y = -t; } return [x, y]; };
/* a movement on the drawing (right, up) as a movement on the ground, for dragging things in this view */
Scene.prototype.ground = function (dX, dY) { let x = (dX / C30 - 2 * dY) / 2, y = (dX / C30 + 2 * dY) / 2; for (let i = 0; i < this.k; i++) { const t = x; x = y; y = -t; } return [x, y]; };
/* the part of the line A + t (dx, dy), t from 0 to 1, that lies inside a convex outline given anticlockwise */
function clipConvex(A, dx, dy, q) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length], ex = r[0] - p[0], ey = r[1] - p[1], f0 = ex * (A[1] - p[1]) - ey * (A[0] - p[0]), df = ex * dy - ey * dx;
    if (Math.abs(df) < 1e-9) { if (f0 < 0) return null; } else { const t = -f0 / df; if (df > 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t; if (t0 >= t1) return null; }
  }
  return [t0, t1];
}
/* a hole in the ground with a convex opening (top, at ground level). What lies below ground is drawn in full lines where it can be seen
   through the opening, and dashed (layer hid) where the ground covers it. open[i]: no bottom line under edge i; noV[i]: no upright at corner i. */
Scene.prototype.pit = function (top, depth, lay, hid, o) {
  o = o || {}; const n = top.length, T = top.map(p => this.R(p)), m = this.masks.length; let q = T.map(proj), ar = 0;
  for (let j = 0; j < n; j++) { const a = q[j], b = q[(j + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; } if (ar < 0) q = q.slice().reverse();
  this.masks.push(q);
  const under = (a, b) => { this.segs.push({ a, b, lay, id: 0, mask: m, inv: 0, g: this.own }); if (hid) this.segs.push({ a, b, lay: hid, id: 0, mask: m, inv: 1, g: this.own }); };      /* (19:25) own: the item these lines belong to */
  const B = T.map(p => [p[0], p[1], p[2] - depth]);
  for (let i = 0; i < n; i++) { if (!(o.open && o.open[i])) under(B[i], B[(i + 1) % n]); if (!(o.noV && o.noV[i])) under(T[i], B[i]); }
};
/* a closed convex solid: its faces hide what is behind them; curved[i] marks faces of a round surface */
Scene.prototype.solid = function (faces, lay, curved) {
  const id = ++this.sid, F = faces.map(f => f.map(p => this.R(p))), c = [0, 0, 0]; let n = 0;
  for (const f of F) for (const p of f) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; }
  c[0] /= n; c[1] /= n; c[2] /= n;
  const E = new Map(), info = [];
  F.forEach((f, i) => {
    let nm = newell(f); const m = [0, 0, 0]; for (const p of f) { m[0] += p[0] / f.length; m[1] += p[1] / f.length; m[2] += p[2] / f.length; }
    if (dot3(nm, [m[0] - c[0], m[1] - c[1], m[2] - c[2]]) < 0) { f.reverse(); nm = [-nm[0], -nm[1], -nm[2]]; }
    const len = Math.hypot(nm[0], nm[1], nm[2]) || 1; nm = [nm[0] / len, nm[1] / len, nm[2] / len];
    const nd = dot3(nm, VD), front = nd > 1e-6;
    info.push({ front, curved: !!(curved && curved[i]) });
    if (front) { let q = f.map(proj), ar = 0; for (let j = 0; j < q.length; j++) { const a = q[j], b = q[(j + 1) % q.length]; ar += a[0] * b[1] - b[0] * a[1]; } if (ar < 0) q = q.slice().reverse(); this.faces.push({ id, q, n: nm, c: dot3(nm, f[0]), nd, bb: polyBox(q) }); }
    for (let j = 0; j < f.length; j++) { const a = f[j], b = f[(j + 1) % f.length], ka = k3(a), kb = k3(b); if (ka === kb) continue; const kk = ka < kb ? ka + '|' + kb : kb + '|' + ka; let e = E.get(kk); if (!e) { e = { a, b, f: [] }; E.set(kk, e); } e.f.push(i); }
  });
  for (const e of E.values()) {
    const A = info[e.f[0]], B = e.f.length > 1 ? info[e.f[1]] : { front: false, curved: false };
    if (A.front !== B.front || (A.front && B.front && !(A.curved && B.curved))) this.segs.push({ a: e.a, b: e.b, lay, id, g: this.own });
  }
};
/* loose lines (fence, bracing, ladders): they can be hidden, but hide nothing */
Scene.prototype.line = function (a, b, lay) { this.segs.push({ a: this.R(a), b: this.R(b), lay, id: 0, g: this.own }); };
Scene.prototype.poly = function (pts, lay, close) { for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i], pts[i + 1], lay); if (close && pts.length > 2) this.line(pts[pts.length - 1], pts[0], lay); };
/* the parts of a line (ends already turned with R) that no face hides, as pieces [t0, t1]. id: its own solid. thru: solids that do not count */
Scene.prototype.shown = function (sa, sb, id, thru) {
  const A = proj(sa), B = proj(sb), dx = B[0] - A[0], dy = B[1] - A[1], EPS = 1e-3;
  const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]), hid = [];
  for (const f of this.faces) {
    if (f.id === id || (thru && thru.has(f.id)) || f.bb[0] > x1 || f.bb[2] < x0 || f.bb[1] > y1 || f.bb[3] < y0) continue;
    let t0 = 0, t1 = 1, ok = true; const q = f.q;
    for (let i = 0; i < q.length && ok; i++) {
      const p = q[i], r = q[(i + 1) % q.length], ex = r[0] - p[0], ey = r[1] - p[1];
      const f0 = ex * (A[1] - p[1]) - ey * (A[0] - p[0]) - 1e-7, df = ex * dy - ey * dx;
      if (Math.abs(df) < 1e-9) { if (f0 <= 0) ok = false; }
      else { const t = -f0 / df; if (df > 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t; if (t0 >= t1) ok = false; }
    }
    if (!ok || t1 - t0 < 1e-6) continue;
    const tau = t => (f.c - (f.n[0] * (sa[0] + (sb[0] - sa[0]) * t) + f.n[1] * (sa[1] + (sb[1] - sa[1]) * t) + f.n[2] * (sa[2] + (sb[2] - sa[2]) * t))) / f.nd;
    const u0 = tau(t0), u1 = tau(t1);
    if (u0 <= EPS && u1 <= EPS) continue;
    if (u0 <= EPS || u1 <= EPS) { const tc = t0 + (t1 - t0) * (EPS - u0) / (u1 - u0); if (u0 <= EPS) t0 = tc; else t1 = tc; }
    if (t1 - t0 > 1e-6) hid.push([t0, t1]);
  }
  hid.sort((a, b) => a[0] - b[0]); let t = 0; const vis = [];
  for (const h of hid) { if (h[0] > t + 1e-6) vis.push([t, h[0]]); if (h[1] > t) t = h[1]; }
  if (t < 1 - 1e-6) vis.push([t, 1]);
  return vis;
};
Scene.prototype.render = function () {
  const out = [];
  for (const s of this.segs) {
    const A = proj(s.a), B = proj(s.b), dx = B[0] - A[0], dy = B[1] - A[1];
    if (Math.abs(dx) + Math.abs(dy) < 1e-6) continue;
    let vis = this.shown(s.a, s.b, s.id);
    if (s.mask != null) {                                  /* below ground: in the opening, or outside it */
      const c = clipConvex(A, dx, dy, this.masks[s.mask]), o2 = [];
      for (const v of vis) { if (!s.inv) { if (c) { const a = Math.max(v[0], c[0]), b = Math.min(v[1], c[1]); if (b - a > 1e-6) o2.push([a, b]); } } else if (!c) o2.push(v); else { if (c[0] - v[0] > 1e-6) o2.push([v[0], Math.min(v[1], c[0])]); if (v[1] - c[1] > 1e-6) o2.push([Math.max(v[0], c[1]), v[1]]); } }
      vis = o2;
    }
    for (const v of vis) { const pr = { k: 'pl', pts: [[A[0] + dx * v[0], A[1] + dy * v[0]], [A[0] + dx * v[1], A[1] + dy * v[1]]], lay: s.lay, close: false }; if (s.g) pr.g = s.g; out.push(pr); }
  }
  return out;
};
/* can a point of the model be seen, or does a face stand in front of it? */
Scene.prototype.seen = function (p) {
  const r = this.R(p), q = proj(r);
  for (const f of this.faces) {
    if (q[0] < f.bb[0] || q[0] > f.bb[2] || q[1] < f.bb[1] || q[1] > f.bb[3]) continue;
    let ins = true; const P = f.q; for (let i = 0; i < P.length && ins; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 1e-7) ins = false; }
    if (ins && (f.c - dot3(f.n, r)) / f.nd > 2e-3) return false;
  }
  return true;
};

/* ---------- building blocks ---------- */
function prismFaces(poly, z0, z1) { const n = poly.length, F = [poly.map(p => [p[0], p[1], z1]), poly.map(p => [p[0], p[1], z0])]; for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; F.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]); } return F; }
function prism(sc, poly, z0, z1, lay) { if (z1 - z0 > 1e-4) sc.solid(prismFaces(poly, z0, z1), lay); }
/* a round bar, straight or tapered, between any two points */
function tube(sc, a, b, r0, r1, lay, n) {
  n = n || 8; if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-4) return;
  const w = v3.unit(v3.sub(b, a)), u = v3.unit(v3.cross(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), v = v3.cross(w, u);
  const ring = (c, r) => { const o = []; for (let i = 0; i < n; i++) { const t = (i + 0.5) * 2 * Math.PI / n, cs = Math.cos(t) * r, sn = Math.sin(t) * r; o.push([c[0] + u[0] * cs + v[0] * sn, c[1] + u[1] * cs + v[1] * sn, c[2] + u[2] * cs + v[2] * sn]); } return o; };
  const A = ring(a, r0), B = ring(b, r1 == null ? r0 : r1), F = [A, B], cv = [false, false];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([A[i], A[j], B[j], B[i]]); cv.push(true); }
  sc.solid(F, lay, cv);
}
const frustum = (sc, c, z0, z1, r0, r1, lay, n) => { if (z1 - z0 > 1e-4) tube(sc, [c[0], c[1], z0], [c[0], c[1], z1], r0, r1, lay, n || 14); };
/* the mark that says a member carries on above where the drawing stops: a small zigzag across it */
function breakMark(sc, p, u, s, lay) { sc.poly([[p[0] - u[0] * s, p[1] - u[1] * s, p[2]], [p[0] - u[0] * s * 0.25, p[1] - u[1] * s * 0.25, p[2] + s * 0.5], [p[0] + u[0] * s * 0.25, p[1] + u[1] * s * 0.25, p[2] - s * 0.5], [p[0] + u[0] * s, p[1] + u[1] * s, p[2]]], lay); }
/* the two pipes of a conduit, one on top of the other, that go down into the ground at p and bend to run along u. dp: how deep the middle of the lower pipe lies.
   Three lines, in the below-ground line: under the lower pipe, where the two touch, over the upper one. */
function elbow2(sc, p, zg, dp, R, u, lay, tail, one) {      /* (14 Nov 17:00) one: a single pipe */
  const cz = zg - dp + R, h = STD.hdpe, E = [];
  for (const o of one ? [h / 2, -h / 2] : [h / 2, -h / 2, -1.5 * h]) {
    const rr = Math.max(0.01, R + o), Q = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 16, x = R + rr * Math.cos(a); Q.push([p[0] + u[0] * x, p[1] + u[1] * x, cz + rr * Math.sin(a)]); }
    if (zg - Q[0][2] > 0.01) sc.line([Q[0][0], Q[0][1], zg], Q[0], lay);
    sc.poly(Q, lay); E.push(Q[8]);
    if (tail) sc.line(Q[8], [Q[8][0] + u[0] * tail, Q[8][1] + u[1] * tail, Q[8][2]], lay);
  }
  if (tail) { const Z = E[E.length - 1]; sc.line([E[0][0] + u[0] * tail, E[0][1] + u[1] * tail, E[0][2]], [Z[0] + u[0] * tail, Z[1] + u[1] * tail, Z[2]], lay); }
}
/* a dome closure, upright: its cables go in at the bottom, at zb */
/* beta 7.3 / 2.45.5 (the company's drawing): its cable entry glands at the bottom (drawn with the loop, buildIso0), its base, a wider collar with a clamp ring,
   the ribbed body (its ribs drawn there too) and the domed top. CLO: the heights of its parts from the bottom of the glands. */
const CLO = { gland: 0.035, base: 0.055, body: 0.11, dome: 0.07 };
function domeClosure(sc, c, zb, lay) {
  const r = STD.cloR, H = STD.cloH, s0 = sc.sid;
  frustum(sc, c, zb + CLO.gland, zb + CLO.base, r * 0.8, r * 0.8, lay, 12); frustum(sc, c, zb + CLO.base, zb + CLO.body, r * 1.16, r * 1.16, lay, 16);
  frustum(sc, c, zb + CLO.body, zb + H - CLO.dome, r, r, lay, 16); frustum(sc, c, zb + H - CLO.dome, zb + H - CLO.dome * 0.45, r, r * 0.8, lay, 16); frustum(sc, c, zb + H - CLO.dome * 0.45, zb + H, r * 0.8, r * 0.4, lay, 16);
  for (let i = s0 + 1; i <= sc.sid; i++) sc.thru.add(i);
}
/* a bar between two outlines of the same shape at two heights: it may lean */
function loft(sc, P0, z0, P1, z1, lay) { const n = P0.length, B = P0.map(q => [q[0], q[1], z0]), T = P1.map(q => [q[0], q[1], z1]), F = [T, B]; for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([B[i], B[j], T[j], T[i]]); } if (z1 - z0 > 1e-4) sc.solid(F, lay); }
/* The riser on a pole as the standard has it: the G.I. pipe, and above it the U-guard, both lying against the pole with no gap and held to it by stainless straps.
   The pole tapers, so the pipe leans with it. pc: the middle of the pole, u: the side the pipe is on, g: the ground there, zc: the height of the aerial cable, pr(z): the radius of the pole at a height */
function riserKit(sc, pc, u, g, zc, pr, lay, K0) {      /* (beta 7.19, riser detail) K0: the heights of its parts as given (the plan's riser detail: its sizes); none: the standard's, as before */
  const K = K0 || riserParts(g, zc), ang = Math.atan2(u[1], u[0]) / D2R, gw = 0.125, gt = 0.12, at = (z, o) => { const d = pr(z) + o; return [pc[0] + u[0] * d, pc[1] + u[1] * d]; };
  const band = z => { const Q = [], r = pr(z) + 0.006, gd = z > K.giTop - 1e-6 && K.ugTop - K.giTop > 0.05; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; Q.push([pc[0] + r * Math.cos(a), pc[1] + r * Math.sin(a)]); } for (const q of rectAt(at(z, gd ? gw / 2 : GIR), (gd ? gw : 2 * GIR) + 0.012, (gd ? gt : 2 * GIR) + 0.012, ang)) Q.push(q); prism(sc, hull(Q), z - 0.015, z + 0.015, 'dt'); };
  const a0 = at(g, GIR), a1 = at(K.giTop, GIR); tube(sc, [a0[0], a0[1], g], [a1[0], a1[1], K.giTop], GIR, GIR, lay, 8);
  loft(sc, rectAt(at(K.giTop, gw / 2), gw, gt, ang), K.giTop, rectAt(at(K.ugTop, gw / 2), gw, gt, ang), K.ugTop, lay);
  for (const z of K.gi.concat(K.ug)) band(z);
  return K;
}
return { D2R, C30, clamp, num, STD, LOOPZ, CLOZ, bendR, PED, riserParts, rot2, rectAt, sqr, polyBox, hull, poleR, GIR,
  VD, proj, dot3, k3, v3, newell, Scene, clipConvex, prismFaces, prism, tube, frustum, breakMark, elbow2, CLO, domeClosure, loft, riserKit };
}));
