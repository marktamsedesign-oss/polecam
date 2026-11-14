/* ---------- isometric view (30 degree axes): one 3D scene, hidden lines removed ---------- */
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
/* a flat bar on a tower face, drawn as its two edges */
function bar(sc, a, b, nrm, w, lay) { const o = v3.mul(v3.unit(v3.cross(v3.sub(b, a), nrm)), w / 2); sc.line(v3.add(a, o), v3.add(b, o), lay); sc.line(v3.sub(a, o), v3.sub(b, o), lay); }
/* points and outlines on the side of a box-shaped element: F front (its own -y), B back, R right (+x), L left */
function onFace(el, side, u, z) { const e = 0.004, q = side === 'F' ? loc(el, u, -el.d / 2 - e) : side === 'B' ? loc(el, -u, el.d / 2 + e) : side === 'R' ? loc(el, el.w / 2 + e, u) : loc(el, -el.w / 2 - e, -u); return [q[0], q[1], z]; }
function faceRect(sc, el, side, u0, u1, z0, z1, lay) { if (u1 - u0 > 0.02 && z1 - z0 > 0.02) sc.poly([onFace(el, side, u0, z0), onFace(el, side, u1, z0), onFace(el, side, u1, z1), onFace(el, side, u0, z1)], lay, 1); }
function faceLine(sc, el, side, u0, z0, u1, z1, lay) { sc.line(onFace(el, side, u0, z0), onFace(el, side, u1, z1), lay); }
function faceRing(sc, el, side, u, z, r, lay) { const P = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; P.push(onFace(el, side, u + r * Math.cos(a), z + r * Math.sin(a))); } sc.poly(P, lay, 1); }
function towerHull(el) {
  if (el.t === 't4') { const h = el.w / 2; return [[-h, -h], [h, -h], [h, h], [-h, h]].map(q => loc(el, q[0], q[1])); }
  if (el.t === 't3' || el.t === 'rtt' || el.t === 'guy') { const r = el.w / Math.sqrt(3); return [90, 210, 330].map(a => loc(el, r * Math.cos(a * D2R), r * Math.sin(a * D2R))); }
  return null;
}
/* ---------- towers: drawn at true size, from the ground up to the height the site asks for (towerShown) ---------- */
function towerShape(S, el) {
  const hr = Math.max(1, num(el.th, 10)), hd = towerShown(S, el), w = Math.max(el.w, 0.1);
  let topW = w, bend = 1;
  if (el.t === 't3') { topW = Math.min(1.2, w); bend = 0.8; } else if (el.t === 't4') { topW = Math.min(1.5, w); bend = 0.8; } else if (el.t === 'rtt') topW = Math.min(0.5, w);
  return { hr, hd, cut: hd < hr - 0.01, k: 1, ka: 1, topW, bend, f: zr => zr >= bend * hr ? topW / w : 1 + (topW / w - 1) * zr / (bend * hr) };
}
/* sector antennas on pipe mounts around a tower; s scales the whole set */
function antennas(sc, c, zTop, rad, rot, lay, n, ph, s) {
  s = s || 1;
  for (let i = 0; i < n; i++) {
    const az = rot + 30 + i * 360 / n, ux = Math.cos(az * D2R), uy = Math.sin(az * D2R), m = [c[0] + ux * (rad + 0.3 * s), c[1] + uy * (rad + 0.3 * s)], p = [c[0] + ux * (rad + 0.47 * s), c[1] + uy * (rad + 0.47 * s)], zc = zTop - ph / 2;
    tube(sc, [m[0], m[1], zc - ph / 2 - 0.1 * s], [m[0], m[1], zc + ph / 2 + 0.1 * s], Math.max(0.018, 0.035 * s), Math.max(0.018, 0.035 * s), lay, 6);
    for (const dz of [-ph * 0.3, ph * 0.3]) sc.line([c[0] + ux * rad * 0.85, c[1] + uy * rad * 0.85, zc + dz], [m[0], m[1], zc + dz], lay);
    prism(sc, rectAt(p, 0.14 * s, 0.3 * s, az), zc - ph / 2, zc + ph / 2, lay);
  }
}
/* the mark that says a member carries on above where the drawing stops: a small zigzag across it */
function breakMark(sc, p, u, s, lay) { sc.poly([[p[0] - u[0] * s, p[1] - u[1] * s, p[2]], [p[0] - u[0] * s * 0.25, p[1] - u[1] * s * 0.25, p[2] + s * 0.5], [p[0] + u[0] * s * 0.25, p[1] + u[1] * s * 0.25, p[2] - s * 0.5], [p[0] + u[0] * s, p[1] + u[1] * s, p[2]]], lay); }
/* steel lattice: round legs with flanged joints, a horizontal and cross bracing in every panel, flat bars drawn with both edges.
   It is drawn up to T.hd; members that pass that height are cut there. Returns where a leg is at any height. */
function lattice(sc, el, z0, legs, T, o) {
  const n = legs.length, lay = o.lay, zc = T.hd, at = (i, zr) => { const k = T.f(zr); return [el.x + (legs[i][0] - el.x) * k, el.y + (legs[i][1] - el.y) * k, z0 + zr]; };
  const zb = T.bend * T.hr, legR = o.legR, barW = o.barW; let z = o.foot || 0; const lv = [z];
  const fill = (to, hp) => { for (let g = 0; g < 90; g++) { const s = hp(z); if (z + s * 1.4 >= to) break; z += s; lv.push(z); } z = to; lv.push(to); };
  if (T.bend < 1) { fill(zb, q => clamp(el.w * T.f(q) * (o.x ? 1 : 1.5), o.minP || 2, 6)); fill(T.hr, () => clamp(T.topW * 1.5, o.minP || 1.5, 3.2)); }
  else fill(T.hr, q => clamp(el.w * T.f(q) * (o.x ? 1 : 1.5), o.minP || 1.2, 6));
  const mem = (a, b, nrm) => {
    if (a[2] > b[2]) { const t = a; a = b; b = t; } if (a[2] >= z0 + zc - 1e-6) return;
    if (b[2] > z0 + zc + 1e-6) b = v3.lerp(a, b, (z0 + zc - a[2]) / (b[2] - a[2]));
    if (barW > 0.045) bar(sc, a, b, nrm, barW, lay); else sc.line(a, b, lay);
  };
  const H = sc.hdir();
  for (let i = 0; i < n; i++) {
    if (T.bend < 1 && zb < zc - 0.01) { tube(sc, at(i, 0), at(i, zb), legR, legR, lay, 8); tube(sc, at(i, zb), at(i, zc), legR * 0.9, legR * 0.9, lay, 8); } else tube(sc, at(i, 0), at(i, zc), legR, legR, lay, 8);
    if (o.flange) for (let q = o.flange; q < zc - 0.4; q += o.flange) tube(sc, at(i, q - 0.06), at(i, q + 0.06), legR * 1.7, legR * 1.7, lay, 8);
    if (T.cut) { const p = at(i, zc); breakMark(sc, [p[0], p[1], p[2] + 0.22], H, Math.max(0.28, legR * 3), lay); }
  }
  for (let k = 0; k < lv.length && lv[k] <= zc + 1e-6; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = at(i, lv[k]), b = at(j, lv[k]), nrm = v3.unit([(legs[i][0] + legs[j][0]) / 2 - el.x, (legs[i][1] + legs[j][1]) / 2 - el.y, 0]);
    if (k && !(T.cut && lv[k] > zc - 1e-6)) { if (barW > 0.045) bar(sc, a, b, nrm, barW, lay); else sc.line(a, b, lay); }
    if (k + 1 < lv.length && lv[k] < zc - 1e-6) {
      const a2 = at(i, lv[k + 1]), b2 = at(j, lv[k + 1]);
      if (o.x) { mem(a, b2, nrm); mem(b, a2, nrm); } else if ((k + i) % 2) mem(a, b2, nrm); else mem(b, a2, nrm);
    }
  }
  return at;
}
/* work platform with handrail around a lattice tower, and the climbing ladder up one face */
function platform(sc, el, at, n, zr, T, lay) {
  const ring = dz => { const P = []; for (let i = 0; i < n; i++) { const p = at(i, zr), dx = p[0] - el.x, dy = p[1] - el.y, l = Math.hypot(dx, dy) || 1; P.push([p[0] + dx / l * 0.75, p[1] + dy / l * 0.75, p[2] + dz]); } return P; };
  const A = ring(0), B = ring(0.95), M = ring(0.5);
  sc.poly(A, lay, 1); sc.poly(B, lay, 1); sc.poly(M, 'dt', 1);
  for (let i = 0; i < n; i++) { sc.line(A[i], B[i], lay); sc.line(at(i, zr), A[i], lay); const j = (i + 1) % n; for (const t of [1 / 3, 2 / 3]) sc.line(v3.lerp(A[i], A[j], t), v3.lerp(B[i], B[j], t), 'dt'); }
}
function climbLadder(sc, at, i, j, z0r, z1r, lay, t) {
  if (z1r - z0r < 0.6) return;
  const hw = 0.2, rail = (zr, s) => { const a = at(i, zr), b = at(j, zr), u = v3.unit(v3.sub(b, a)), m = v3.lerp(a, b, t == null ? 0.5 : t); return [m[0] + u[0] * hw * s, m[1] + u[1] * hw * s, m[2]]; };
  const N = Math.max(2, Math.round((z1r - z0r) / 0.35));
  for (let k = 0; k <= N; k++) { const zr = z0r + (z1r - z0r) * k / N; sc.line(rail(zr, -1), rail(zr, 1), lay); if (k < N) { const z2 = z0r + (z1r - z0r) * (k + 1) / N; sc.line(rail(zr, -1), rail(z2, -1), lay); sc.line(rail(zr, 1), rail(z2, 1), lay); } }
}
/* ---------- ground, fence, gates. O collects what labels must keep clear of, as outlines in space ---------- */
function isoGround(S, sc, A, O) {
  const si = S.site, L = si.L, W = si.W, R = [[0, 0], [L, 0], [L, W], [0, W]];
  if (si.kind === 'room') { roomShell(S, sc, A, O); return; }
  if (si.kind === 'unfenced') { sc.poly(R.map(p => [p[0], p[1], 0]), 'lot', 1); for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4]; O.push([[a[0], a[1], -0.1], [b[0], b[1], -0.1], [b[0], b[1], 0.1], [a[0], a[1], 0.1]]); } return; }
  if (si.kind === 'rooftop') {
    const bh = roofZ(S), t = 0.2;
    if (bh > 0.01) {
      sc.solid(prismFaces(R, 0, bh), 'bl');                       /* the building, then a low parapet on each side */
      for (const q of [[0, 0, L, t], [0, W - t, L, W], [0, t, t, W - t], [L - t, t, L, W - t]]) prism(sc, [[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]]], bh, bh + 0.3, 'bl');
      for (let z = 3.2; z < bh - 0.5; z += 3.2) sc.poly([[-0.004, W + 0.004, z], [-0.004, -0.004, z], [L + 0.004, -0.004, z], [L + 0.004, W + 0.004, z]], 'dt', 1);
      for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4]; O.push({ wall: [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], bh + 0.3], [a[0], a[1], bh + 0.3]], n: [b[1] - a[1], a[0] - b[0]] }, [[a[0], a[1], bh - 0.05], [b[0], b[1], bh - 0.05], [b[0], b[1], bh + 0.4], [a[0], a[1], bh + 0.4]]); }
    }
    else { sc.poly(R.map(p => [p[0], p[1], 0]), 'bl', 1); for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4]; O.push([[a[0], a[1], -0.1], [b[0], b[1], -0.1], [b[0], b[1], 0.1], [a[0], a[1], 0.1]]); } }
    return;
  }
  const fh = Math.max(0.5, num(si.fh, 2.4)), sp = Math.max(1, num(si.post, 3)), kind = si.fence, wire = num(si.wire, 0) && kind !== 'barb', done = new Set();
  /* The two sides nearest the viewer are left out, so that the conduit, the trench and the cable behind them show: only their line on the ground is drawn. The sides at the back go first: a corner post they share stays whole. */
  const sides = 'SENW'.split('').map(sd => ({ sd, low: si.cut !== 'none' && facing(sc, sideG(S, sd).n) > 0 })).sort((p, q) => p.low - q.low);
  for (const { sd, low } of sides) {
    const { g, spans, gates } = sideSpans(S, sd), pt = (t, z, off) => [g.a[0] + g.u[0] * t + g.n[0] * (off || 0), g.a[1] + g.u[1] * t + g.n[1] * (off || 0), z], H = low ? Math.min(0.3, fh) : fh;
    const post = t => { const p = pt(t, 0), key = k3(p); O.push([pt(t - 0.16, 0), pt(t + 0.16, 0), pt(t + 0.16, H), pt(t - 0.16, H)]); if (done.has(key)) return; done.add(key); if (kind === 'chb') prism(sc, sqr(p, 0.13, 0), 0, H + (low ? 0 : 0.12), 'bl'); else if (kind === 'barb') prism(sc, sqr(p, 0.06, 0), 0, H, 'bl'); else frustum(sc, p, 0, H, 0.04, 0.04, 'bl', 6); };
    for (const [s0, s1] of spans) {
      if (low) { sc.line(pt(s0, 0), pt(s1, 0), 'bl'); O.push([pt(s0, -0.1), pt(s1, -0.1), pt(s1, 0.1), pt(s0, 0.1)]); continue; }      /* no wall, no posts, no footing */
      const ps = [s0, s1]; for (let t = Math.ceil(s0 / sp + 1e-6) * sp; t < s1 - 1e-6; t += sp) ps.push(t);
      for (const t of ps) post(t);
      O.push([pt(s0, -0.12), pt(s1, -0.12), pt(s1, 0.12), pt(s0, 0.12)], [pt(s0, fh - 0.12), pt(s1, fh - 0.12), pt(s1, fh + (wire ? 0.75 : 0.15)), pt(s0, fh + (wire ? 0.75 : 0.15))]);
      if (kind === 'chb') { sc.line(pt(s0, 0), pt(s1, 0), 'bl'); sc.line(pt(s0, fh), pt(s1, fh), 'bl'); }
      else if (kind === 'cyc') {
        sc.line(pt(s0, 0.05), pt(s1, 0.05), 'bl'); sc.line(pt(s0, fh), pt(s1, fh), 'bl'); O.push([pt(s0, 0), pt(s1, 0), pt(s1, fh), pt(s0, fh)]);
        for (let u = Math.floor((s0 - fh) / 0.6) * 0.6; u < s1; u += 0.6) {          /* chain-link mesh, drawn light */
          const a = Math.max(u, s0), b = Math.min(u + fh, s1); if (b - a > 0.05) { sc.line(pt(a, a - u), pt(b, b - u), 'dt'); sc.line(pt(a, fh - (a - u)), pt(b, fh - (b - u)), 'dt'); }
        }
      }
      else { for (let k = 1; k <= 5; k++) sc.line(pt(s0, fh * k / 5.2), pt(s1, fh * k / 5.2), 'bl'); O.push([pt(s0, 0), pt(s1, 0), pt(s1, fh), pt(s0, fh)]); }
      if (wire) { const top = kind === 'chb' ? fh + 0.12 : fh; for (const t of ps) sc.poly([pt(t, top), pt(t, top + 0.15), pt(t, top + 0.45, 0.28)], 'bl'); for (let k = 0; k < 3; k++) sc.line(pt(s0, top + 0.19 + 0.12 * k, 0.04 + 0.11 * k), pt(s1, top + 0.19 + 0.12 * k, 0.04 + 0.11 * k), 'bl'); }
    }
    for (const [g0, g1] of gates) {
      const w = g1 - g0, gh = Math.max(1, fh - 0.25), gi = gates.findIndex(q => q[0] === g0), leaf = (a, b) => { sc.poly([pt(a, 0.1), pt(b, 0.1), pt(b, gh), pt(a, gh)], 'bl', 1); for (const f of [1 / 3, 2 / 3]) sc.line(pt(a, 0.1 + (gh - 0.1) * f), pt(b, 0.1 + (gh - 0.1) * f), 'bl'); for (let t = a + 0.25; t < b - 0.1; t += 0.25) sc.line(pt(t, 0.1), pt(t, gh), 'dt'); };
      if (low) sc.line(pt(g0, 0), pt(g1, 0), 'dt');               /* a gate in a side that is cut: the opening only */
      else { if (w > 1.6) { leaf(g0 + 0.04, (g0 + g1) / 2 - 0.02); leaf((g0 + g1) / 2 + 0.02, g1 - 0.04); } else leaf(g0 + 0.04, g1 - 0.04); O.push([pt(g0, 0), pt(g1, 0), pt(g1, gh), pt(g0, gh)]); }
      A.push({ k: 'seg', grp: 'gate', key: 'gate' + sd + gi, p: pt((g0 + g1) / 2, low ? 0 : gh), s: labText(S, 'gate' + sd + gi, 'GATE'), st: 'E', a: pt(g0, 0), b: pt(g1, 0), out: g.n, gap: 0.5 });
    }
  }
}

/* ---------- one element ---------- */
function hcyl(sc, el, x0, x1, zc, r, lay) { const a = loc(el, x0, 0), b = loc(el, x1, 0); tube(sc, [a[0], a[1], zc], [b[0], b[1], zc], r, r, lay, 14); }
/* the two pipes of a conduit, one on top of the other, that go down into the ground at p and bend to run along u. dp: how deep the middle of the lower pipe lies.
   Three lines, in the below-ground line: under the lower pipe, where the two touch, over the upper one. */
function elbow2(sc, p, zg, dp, R, u, lay, tail) {
  const cz = zg - dp + R, h = STD.hdpe, E = [];
  for (const o of [h / 2, -h / 2, -1.5 * h]) {
    const rr = Math.max(0.01, R + o), Q = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 16, x = R + rr * Math.cos(a); Q.push([p[0] + u[0] * x, p[1] + u[1] * x, cz + rr * Math.sin(a)]); }
    if (zg - Q[0][2] > 0.01) sc.line([Q[0][0], Q[0][1], zg], Q[0], lay);
    sc.poly(Q, lay); E.push(Q[8]);
    if (tail) sc.line(Q[8], [Q[8][0] + u[0] * tail, Q[8][1] + u[1] * tail, Q[8][2]], lay);
  }
  if (tail) sc.line([E[0][0] + u[0] * tail, E[0][1] + u[1] * tail, E[0][2]], [E[2][0] + u[0] * tail, E[2][1] + u[1] * tail, E[2][2]], lay);
}
/* where a buried conduit comes out of the ground: a concrete block (poly) with the two 114.3 mm pipes in it.
   p: the pipe the cable is in; the spare one stands next to it along u, the way the buried conduit runs, and is closed with a blank duct plug. Below ground the two bend to run along u. */
const exitMid = (p, u) => [p[0] + u[0] * STD.hdpe / 2, p[1] + u[1] * STD.hdpe / 2];      /* the middle of the block, between the two pipes */
function exitStub(sc, p, z0, h, poly, lay, hid, u, dp, R, tail) {
  const s0 = sc.sid, zt = z0 + h, r = STD.hdpe / 2, sp = [p[0] + u[0] * STD.hdpe, p[1] + u[1] * STD.hdpe];
  prism(sc, poly, z0, zt, lay);
  frustum(sc, p, zt, zt + 0.07, r, r, lay, 8);                     /* the pipe the cable comes up in */
  frustum(sc, sp, zt, zt + 0.03, r, r, lay, 8);                    /* the spare pipe, closed with a blank duct plug: a cross on its top */
  for (const a of [0, 90]) { const c = Math.cos(a * D2R) * r, sn = Math.sin(a * D2R) * r; sc.line([sp[0] - c, sp[1] - sn, zt + 0.032], [sp[0] + c, sp[1] + sn, zt + 0.032], lay); }
  for (let i = s0 + 1; i <= sc.sid; i++) sc.thru.add(i);
  if (FLAT) return;
  const d = Math.max(0.3, dp || UGD), Rb = R > 0.05 ? R : bendR(d); elbow2(sc, p, z0, d, Rb, u, hid, tail == null ? 0 : tail);
}
/* a dome closure, upright: its cables go in at the bottom, at zb */
function domeClosure(sc, c, zb, lay) {
  const r = STD.cloR, H = STD.cloH, s0 = sc.sid;
  frustum(sc, c, zb, zb + 0.05, r * 0.55, r * 0.55, lay, 8); frustum(sc, c, zb + 0.05, zb + 0.1, r * 1.12, r * 1.12, lay, 12);
  frustum(sc, c, zb + 0.1, zb + H - 0.07, r, r, lay, 12); frustum(sc, c, zb + H - 0.07, zb + H, r, r * 0.5, lay, 12);
  for (let i = s0 + 1; i <= sc.sid; i++) sc.thru.add(i);
}
const cloPts = (c, zb) => { const q = sqr(c, STD.cloR, 0); return q.map(t => [t[0], t[1], zb]).concat(q.map(t => [t[0], t[1], zb + STD.cloH])); };
/* a bar between two outlines of the same shape at two heights: it may lean */
function loft(sc, P0, z0, P1, z1, lay) { const n = P0.length, B = P0.map(q => [q[0], q[1], z0]), T = P1.map(q => [q[0], q[1], z1]), F = [T, B]; for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([B[i], B[j], T[j], T[i]]); } if (z1 - z0 > 1e-4) sc.solid(F, lay); }
/* The riser on a pole as the standard has it: the G.I. pipe, and above it the U-guard, both lying against the pole with no gap and held to it by stainless straps.
   The pole tapers, so the pipe leans with it. pc: the middle of the pole, u: the side the pipe is on, g: the ground there, zc: the height of the aerial cable, pr(z): the radius of the pole at a height */
function riserKit(sc, pc, u, g, zc, pr, lay) {
  const K = riserParts(g, zc), ang = Math.atan2(u[1], u[0]) / D2R, gw = 0.125, gt = 0.12, at = (z, o) => { const d = pr(z) + o; return [pc[0] + u[0] * d, pc[1] + u[1] * d]; };
  const band = z => { const Q = [], r = pr(z) + 0.006, gd = z > K.giTop - 1e-6 && K.ugTop - K.giTop > 0.05; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; Q.push([pc[0] + r * Math.cos(a), pc[1] + r * Math.sin(a)]); } for (const q of rectAt(at(z, gd ? gw / 2 : GIR), (gd ? gw : 2 * GIR) + 0.012, (gd ? gt : 2 * GIR) + 0.012, ang)) Q.push(q); prism(sc, hull(Q), z - 0.015, z + 0.015, 'dt'); };
  const a0 = at(g, GIR), a1 = at(K.giTop, GIR); tube(sc, [a0[0], a0[1], g], [a1[0], a1[1], K.giTop], GIR, GIR, lay, 8);
  loft(sc, rectAt(at(K.giTop, gw / 2), gw, gt, ang), K.giTop, rectAt(at(K.ugTop, gw / 2), gw, gt, ang), K.ugTop, lay);
  for (const z of K.gi.concat(K.ug)) band(z);
  return K;
}
/* does a wall or a face look at the viewer? n: its outward direction on the plan. More than 0: it does. */
const facing = (sc, n) => { const r = sc.R([sc.cx + n[0], sc.cy + n[1], 0]); return (r[0] - sc.cx) - (r[1] - sc.cy); };
const faceN = (el, side) => rot2(side === 'R' ? 1 : side === 'L' ? -1 : 0, side === 'F' ? -1 : side === 'B' ? 1 : 0, el.rot || 0);
/* the turn of the view that shows the front of a cabinet best, with its right side: so an open door does not stand in front of the rack. turn: the other way round */
function detailK(el, turn) {
  const n = faceN(el, 'F'), ex = faceN(el, 'R'), v = [];
  for (let k = 0; k < 4; k++) { const sc = new Scene(k, 0, 0), a = facing(sc, n), b = facing(sc, ex); v.push({ k, v: Math.min(a, b) + 0.01 * a }); }
  v.sort((p, q) => q.v - p.v); return v[turn ? 1 : 0].k;
}
/* a porthole: the plate in a cabin wall, with the holes the cables go through. Gives back where along the wall it was put. */
function portPlate(sc, el, side, u, z, lay) {
  const len = side === 'F' || side === 'B' ? el.w : el.d, hw = Math.max(0.05, Math.min(0.25, len / 2 - 0.02)); u = clamp(u, -len / 2 + hw + 0.02, len / 2 - hw - 0.02);
  faceRect(sc, el, side, u - hw, u + hw, z - 0.18, z + 0.18, lay);
  for (let i = -1; i <= 1; i++) for (const j of [-1, 1]) faceRing(sc, el, side, u + i * hw * 0.6, z + j * 0.08, 0.045, 'dt');
  return u;
}
/* the front of a rack, as it shows in an outdoor cabinet with its door open and on a rack in a cabin: the two rails, the rack units, and each item at its own units.
   X.detail: an enlarged drawing, where every unit is marked and every fifth one numbered */
function rackFace(S, sc, host, z0, A, X) {
  const K = rackOf(host), lay = elLayer(host), zb = z0 + K.zb, zt = zb + K.n * RU, hw = K.hw, det = !!(X && X.detail), seen = facing(sc, faceN(host, 'F')) > 0.05;
  const hol = !!(X && X.hollow) && host.t === 'odc', yf = -host.d / 2, bxh = (x0, x1, y0, y1, za, zc, ly) => prism(sc, [loc(host, x0, y0), loc(host, x1, y0), loc(host, x1, y1), loc(host, x0, y1)], za, zc, ly);      /* beta 4.2 */
  if (hol) { const dr = Math.min(host.d - 0.12, 0.6); for (const sg of [-1, 1]) for (const y0 of dr > 0.3 ? [0.004, dr] : [0.004]) bxh(Math.min(sg * hw, sg * (hw - 0.03)), Math.max(sg * hw, sg * (hw - 0.03)), yf + y0, yf + y0 + 0.03, zb, zt, lay); }      /* the four posts of the rack */
  else { for (const sg of [-1, 1]) for (const q of [hw, hw - 0.03]) faceLine(sc, host, 'F', sg * q, zb, sg * q, zt, lay);
    faceLine(sc, host, 'F', -hw, zb, hw, zb, lay); faceLine(sc, host, 'F', -hw, zt, hw, zt, lay); }
  if (det) {
    for (let u = 1; u < K.n; u++) for (const sg of [-1, 1]) faceLine(sc, host, 'F', sg * hw, zb + u * RU, sg * (hw - (u % 5 ? 0.015 : 0.03)), zb + u * RU, 'dt');
    if (seen) for (let u = 5; u <= K.n; u += 5) A.push({ k: 'mark', el: host, u: -(hw + 0.04), z: zb + (u - 0.5) * RU, s: String(u), h: 0.026 });
  }
  for (const q of rackSlots(S, host)) {
    const e = q.e, il = e.st === 'P' ? 'pp' : 'eq', a = zb + (q.u - 1) * RU + 0.003, b = zb + (q.u - 1 + q.ru) * RU - 0.003, x = hw - 0.002, xi = hw - 0.034;
    faceRect(sc, host, 'F', -x, x, a, b, il);
    if (hol) bxh(-(hw - 0.034), hw - 0.034, yf + 0.034, yf + Math.max(0.12, Math.min(host.d - 0.1, e.t === 'odf' ? 0.25 : 0.38)), a, b, il);      /* its body, behind the front plate */
    if (e.t === 'odf') {                                             /* a patch panel: one row of adapters for each unit */
      for (let i = 1; i < q.ru; i++) faceLine(sc, host, 'F', -xi, a + (b - a) * i / q.ru, xi, a + (b - a) * i / q.ru, il);
      if (det) { for (let i = 0; i < q.ru; i++) for (let j = 0; j < 12; j++) faceRing(sc, host, 'F', -xi + (j + 0.5) * 2 * xi / 12, a + (b - a) * (i + 0.5) / q.ru, 0.008, il); }
      else { faceLine(sc, host, 'F', -xi, a, xi, b, il); faceLine(sc, host, 'F', -xi, b, xi, a, il); }
    }
    else if (det) { for (let i = 1; i <= 3; i++) faceLine(sc, host, 'F', -xi + 0.02, a + (b - a) * i / 4, -xi + 0.12, a + (b - a) * i / 4, il); faceRing(sc, host, 'F', xi - 0.04, (a + b) / 2, 0.01, il); }
    const pts = [onFace(host, 'F', -x, a), onFace(host, 'F', x, a), onFace(host, 'F', x, b), onFace(host, 'F', -x, b)], nm = elLabel(S, e);
    A.push({ k: 'el', id: e.id, key: e.id, kind: 'lead', p: onFace(host, 'F', x, (a + b) / 2), s: det ? nm + (e.t === 'odf' && e.size && !e.name && e.st !== 'P' ? ' ' + e.size : '') + ', ' + uText(q) : e.t === 'odf' ? nm : '', st: e.st, fp: elPoly(host), z: z0, pts, edit: seen ? 'u' : null, hp: onFace(host, 'F', 0, b), item: 1, host });
  }
}
/* the shell of a cabin seen from inside: the floor, the two walls at the back at full height, and the two walls at the front cut down to a low kerb, so that the room shows */
function roomShell(S, sc, A, O) {
  const si = S.site, L = si.L, W = si.W, fh = Math.max(1.5, num(si.fh, 2.8)), t = 0.1, dh = Math.min(2.1, fh - 0.2);
  sc.poly([[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]], 'bl', 1);
  for (const sd of 'SENW') {
    const { g, spans, gates } = sideSpans(S, sd), back = facing(sc, g.n) < 0, ext = sd === 'S' || sd === 'N' ? t : 0;
    const p2 = (q, off) => [g.a[0] + g.u[0] * q + g.n[0] * off, g.a[1] + g.u[1] * q + g.n[1] * off], p3 = (q, z) => [g.a[0] + g.u[0] * q, g.a[1] + g.u[1] * q, z];
    const slab = (s0, s1, z0, z1) => prism(sc, [p2(s0, 0), p2(s1, 0), p2(s1, t), p2(s0, t)], z0, z1, 'bl');
    for (const [s0, s1] of spans) {
      const e0 = s0 < 1e-6 ? -ext : s0, e1 = s1 > g.len - 1e-6 ? g.len + ext : s1, c3 = (q, off, z) => { const p = p2(q, off); return [p[0], p[1], z]; };
      slab(e0, e1, 0, back ? fh : 0.12);
      /* names keep off the edges of a wall, and off a kerb */
      if (back) for (const off of [0, t]) { O.push({ post: [c3(e0, off, fh), c3(e1, off, fh)], w: 0.05 }); for (const q of [e0, e1]) O.push({ post: [c3(q, off, 0), c3(q, off, fh)], w: 0.05 }); }
      else O.push([c3(e0, 0, 0), c3(e1, 0, 0), c3(e1, t, 0), c3(e0, t, 0), c3(e0, 0, 0.12), c3(e1, 0, 0.12), c3(e1, t, 0.12), c3(e0, t, 0.12)]);
    }
    gates.forEach(([g0, g1], gi) => {
      const key = 'gate' + sd + gi; if (back) slab(g0, g1, dh, fh);
      A.push({ k: 'seg', key, p: p3((g0 + g1) / 2, 0), s: labText(S, key, 'DOOR'), st: 'E', a: p3(g0, 0), b: p3(g1, 0), out: back ? [-g.n[0], -g.n[1]] : g.n, gap: 0.2 });
    });
  }
}
/* beta 4.2 (19:25): what makes an outdoor cabinet look like one, on a cabinet of full size.
   A door leaf: its frame, a louvre panel at the top (a second one at the foot of a back door; in front the cooling unit is there) and the nameplate. */
function doorDress(sc, el, side, u0, u1, O, H, lay) {
  const m = 0.022; if (u1 - u0 < 0.25 || H < 0.6) return;
  faceRect(sc, el, side, u0 + m, u1 - m, O.zb + m, O.zu - m, lay);
  const lv = (za, zb, n) => { const a = u0 + 0.07, b = u1 - 0.07; faceRect(sc, el, side, a, b, za, zb, 'dt'); for (let i = 1; i <= n; i++) faceLine(sc, el, side, a + 0.012, za + (zb - za) * i / (n + 1), b - 0.012, za + (zb - za) * i / (n + 1), 'dt'); };
  const hl = Math.min(0.2, H * 0.14); lv(O.zu - 0.06 - hl, O.zu - 0.06, 6);
  if (side !== 'F') lv(O.zb + 0.07, O.zb + 0.07 + hl, 6);
  else { const c = (u0 + u1) / 2; faceRect(sc, el, side, c - 0.06, c + 0.06, O.zu - 0.06 - hl - 0.075, O.zu - 0.06 - hl - 0.03, lay); }
}
/* The body: the panel and the low vent of each side, the cover of the base, the four lifting eyes on the roof. Opened, in its detail (o.hol): on the inside of each side wall the cable tray and,
   at the foot, the earth bar; the gland plates round the holes of the floor. (The back wall of a cabinet seen from a corner is hidden by its side wall.) */
function odcDress(sc, el, z0, O, o) {
  const w = el.w, d = el.d, h = Math.max(0.02, num(el.h, 0.02)), H = O.zu - O.zb, lay = o.lay, P = (x, y, z) => { const q = loc(el, x, y); return [q[0], q[1], z]; }, R4 = (a, b, c, e, ly) => sc.poly([a, b, c, e], ly, 1);
  if (d >= 0.4) for (const sd of ['L', 'R']) { const hd = d / 2, v = Math.min(0.15, hd - 0.1), za = O.zb + 0.08, zb = za + Math.min(0.1, H * 0.08);
    faceRect(sc, el, sd, -hd + 0.035, hd - 0.035, O.zb + 0.02, O.zu - 0.02, lay); faceRect(sc, el, sd, -v, v, za, zb, 'dt'); for (let i = 1; i <= 3; i++) faceLine(sc, el, sd, -v + 0.01, za + (zb - za) * i / 4, v - 0.01, za + (zb - za) * i / 4, 'dt'); }
  { const y = -(d / 2 - o.ins) - 0.004, x = w / 2 - o.ins - 0.05; if (x > 0.1 && o.pl > 0.05) R4(P(-x, y, z0 + 0.015), P(x, y, z0 + 0.015), P(x, y, z0 + o.pl - 0.015), P(-x, y, z0 + o.pl - 0.015), lay); }
  { const y0 = -d / 2 - 0.12, y1 = d / 2 + 0.05, zf = z0 + h - o.rf * 0.45, zk = z0 + h, r = 0.022;      /* the eyes stand on the roof, which slopes to the front */
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const x = sx * (w / 2 - 0.05), y = sy * (d / 2 - 0.06), zc = zf + (zk - zf) * (y - y0) / (y1 - y0) + r, Q = []; for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; Q.push(P(x + r * Math.cos(an), y, zc + r * Math.sin(an))); } sc.poly(Q, lay, 1); } }
  if (!o.hol) return;
  for (const sg of [-1, 1]) { const x = sg < 0 ? O.u0 + 0.004 : O.u1 - 0.004, yt = Math.min(0.14, d / 2 - 0.12), za = O.zb + 0.1, y0 = -Math.min(0.26, d / 2 - 0.1), y1 = y0 + 0.2;      /* inside, on each side wall (the one that faces the eye shows): the cable tray, and the earth bar at the foot */
    for (const dy of [-0.035, 0.035]) sc.line(P(x, yt + dy, O.zb), P(x, yt + dy, O.zu), 'dt');
    for (let z = O.zb + 0.15; z < O.zu - 0.05; z += 0.2) sc.line(P(x, yt - 0.035, z), P(x, yt + 0.035, z), 'dt');
    R4(P(x, y0, za), P(x, y1, za), P(x, y1, za + 0.03), P(x, y0, za + 0.03), lay);
    for (let i = 0; i < 4; i++) { const cy = y0 + (i + 0.5) * 0.05, Q = []; for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; Q.push(P(x, cy + 0.007 * Math.cos(an), za + 0.015 + 0.007 * Math.sin(an))); } sc.poly(Q, lay, 1); } }
  { const Hs = cabHoles(el); for (const sg of [-1, 1]) { const L = Hs.filter(q => q.x * sg > 0); if (!L.length) continue; const x0 = Math.min(...L.map(q => q.x - q.r)) - 0.02, x1 = Math.max(...L.map(q => q.x + q.r)) + 0.02, y0 = Math.min(...L.map(q => q.y - q.r)) - 0.02, y1 = Math.max(...L.map(q => q.y + q.r)) + 0.02, z = O.zb + 0.002; R4(P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z), 'dt'); } }      /* the gland plates round the holes of the floor */
  /* beta 4.2 (22:24): more of how it is built. The screws of the side panels; the brackets and bolts that hold the base frame on the pad; inside, on each side
     wall, the breaker box with its row of breakers and, above it, the thermostat of the cooling unit. */
  if (d >= 0.4) for (const sd of ['L', 'R']) { const hd = d / 2; for (const u of [-hd + 0.06, hd - 0.06]) for (const kz of [0.05, 0.5, 0.95]) faceRing(sc, el, sd, u, O.zb + 0.02 + (H - 0.04) * kz, 0.008, lay); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const x = sx * (w / 2 - o.ins + 0.03), y = sy * (d / 2 - o.ins - 0.09);
    prism(sc, [P(x - 0.03, y - 0.035, 0), P(x + 0.03, y - 0.035, 0), P(x + 0.03, y + 0.035, 0), P(x - 0.03, y + 0.035, 0)], z0, z0 + 0.008, lay); const c2 = P(x + sx * 0.01, y, 0); tube(sc, [c2[0], c2[1], z0 + 0.008], [c2[0], c2[1], z0 + 0.032], 0.01, 0.01, lay, 6); }
  if (H >= 0.9 && d >= 0.45) for (const sg of [-1, 1]) { const x = sg < 0 ? O.u0 + 0.004 : O.u1 - 0.004, y0 = -Math.min(0.3, d / 2 - 0.06), y1 = y0 + 0.2, zb = O.zu - 0.5, zt = zb + 0.22;
    R4(P(x, y0, zb), P(x, y1, zb), P(x, y1, zt), P(x, y0, zt), lay); R4(P(x, y0 + 0.015, zb + 0.015), P(x, y1 - 0.015, zb + 0.015), P(x, y1 - 0.015, zt - 0.015), P(x, y0 + 0.015, zt - 0.015), 'dt');
    for (let i = 0; i < 6; i++) { const a = y0 + 0.03 + i * 0.024; R4(P(x, a, zb + 0.08), P(x, a + 0.017, zb + 0.08), P(x, a + 0.017, zb + 0.14), P(x, a, zb + 0.14), lay); }
    const ta = zt + 0.05, tc = y0 + 0.1, Q = []; R4(P(x, tc - 0.04, ta), P(x, tc + 0.04, ta), P(x, tc + 0.04, ta + 0.08), P(x, tc - 0.04, ta + 0.08), lay); for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; Q.push(P(x, tc + 0.02 * Math.cos(an), ta + 0.04 + 0.02 * Math.sin(an))); } sc.poly(Q, lay, 1); }
}
/* the opening of a cabinet whose door stands open */
function odcOpening(el, z0) { const h = Math.max(0.02, num(el.h, 0.02)), pl = Math.min(0.1, h * 0.1), rf = Math.min(0.07, h * 0.08), zb = z0 + pl + 0.06, zu = z0 + h - rf - 0.06; return { zb, zu, u0: -el.w / 2 + 0.05, u1: el.w / 2 - 0.05, m0: zb + (zu - zb) * 0.38, m1: zb + (zu - zb) * 0.72 }; }
/* beta 4.1: in the detail of an open cabinet, the cable that comes up inside it to each ODF (the proposed ones, or all when none is proposed). It comes in at the foot,
   runs up beside the rack on the side the user chose (el.cab: { side: 'L' or 'R', off: metres from that edge of the opening }) and turns in to the ODF. */
/* beta 4.2: the cable holes in the floor of a cabinet: a row along each side wall, from front to back. Places as the cabinet has them: x across and y from
   front to back, from its middle. */
function cabHoles(el) {
  const w = el.w, d = el.d, n = d >= 0.65 ? 4 : d >= 0.4 ? 3 : 2, r = clamp(Math.min(w, d) * 0.03, 0.012, 0.022), xs = Math.max(0.02, w / 2 - 0.05 - Math.max(2.2 * r, 0.045)), y0 = -d / 2 + 0.1, y1 = d / 2 - 0.1, out = [];
  for (const sg of [-1, 1]) for (let i = 0; i < n; i++) out.push({ x: sg * xs, y: y0 + (y1 - y0) * i / (n - 1), r, side: sg < 0 ? 'L' : 'R', i });
  return out;
}
/* the cable inside an opened cabinet, as lines in space, one for each ODF (the proposed ones, or all when none is proposed): from where it comes in (a hole in the
   floor, the roof, a wall) to the front of the rack, along the side of the rack to the height of the ODF, and in. el.cab.path: the corners the user drew on the front
   of the rack, each [across from the middle, height above the foot of the cabinet]; they lead the cable to the first ODF. out.meta: where it starts and ends there. */
function cabInside(S, el, pt) {
  const z0 = pt.z0, O = odcOpening(el, z0), K = rackOf(el), zb = z0 + K.zb, odfs = rackSlots(S, el).filter(q => q.e.t === 'odf'), Pp = odfs.filter(q => q.e.st === 'P'), L = Pp.length ? Pp : odfs, out = []; if (!L.length) return out;
  const cb = el.cab || {}, w = el.w, d = el.d, F = (u, z) => { const q = loc(el, u, -d / 2 - 0.004); return [q[0], q[1], z]; }, W3 = (x, y, z) => { const q = loc(el, x, y); return [q[0], q[1], z]; };
  const half = (O.u1 - O.u0) / 2, gap = Math.max(0.012, half - K.hw), sd = cb.side === 'R' ? 1 : -1;      /* (beta 4.2: up the left of the rack unless the user moves it) */
  const offD = (pt.f === 'B' || pt.f === 'T') && sd * pt.lx > K.hw - 0.005 && sd * pt.lx < half - 0.008 ? half - Math.abs(pt.lx) : Math.min(0.03, gap / 2);
  const off = clamp(cb.off != null && cb.off !== '' ? num(cb.off, offD) : offD, 0.008, Math.max(0.01, half - 0.02)), col = sd < 0 ? O.u0 + off : O.u1 - off, cu = v => clamp(v, O.u0 + 0.008, O.u1 - 0.008), cz = v => clamp(v, O.zb + 0.008, O.zu - 0.008);
  const path = Array.isArray(cb.path) ? cb.path.filter(q => q && isFinite(q[0]) && isFinite(q[1])).map(q => [cu(+q[0]), cz(z0 + +q[1])]) : [];
  L.forEach((q, i) => {
    const z = zb + (q.u - 1 + q.ru / 2) * RU, uu = col - sd * 0.012 * i, ue = sd * (K.hw - 0.03), P = []; let us, zs;
    if (pt.f === 'T') { zs = O.zu - 0.02 - 0.012 * i; us = cu(pt.lx); P.push(W3(pt.lx, pt.ly, z0 + pt.h), W3(pt.lx, pt.ly, zs), F(us, zs)); }
    else if (pt.f === 'B') { zs = O.zb + 0.006; us = cu(pt.lx); P.push(W3(pt.lx, pt.ly, zs), F(us, zs)); }
    else if (pt.f === 'K') { zs = cz(z0 + pt.iz); us = cu(pt.lx); P.push(W3(pt.lx, d / 2, zs), F(us, zs)); }
    else { zs = cz(z0 + pt.iz); us = pt.f === 'L' ? O.u0 + 0.008 : O.u1 - 0.008; P.push(W3(pt.f === 'L' ? -w / 2 : w / 2, pt.ly, zs), W3(us, pt.ly, zs), F(us, zs)); }
    if (i === 0) out.meta = { us, zs, z, ue, z0, uu, auto: !path.length };
    if (path.length && i === 0) { for (const k of path) P.push(F(k[0], k[1])); const l = path[path.length - 1]; if (Math.abs(l[1] - z) > 0.004) P.push(F(l[0], z)); }
    else { if (Math.abs(us - uu) > 0.004) { const zj = pt.f === 'B' ? O.zb + 0.02 + 0.012 * i : zs; if (Math.abs(zj - zs) > 1e-4) P.push(F(us, zj)); P.push(F(uu, zj)); } P.push(F(uu, z)); }
    P.push(F(ue, z)); out.push(P);
  });
  return out;
}
function cabPort(S, el, rg) { if (!el || el.t !== 'odc') return null; return (rg && rg.ports && rg.ports[el.id]) || odcPort(S, el, null); }      /* (19:25: one rule, odcPort; the plan's cable is led to it by routeGeom) */
/* in the detail of an open cabinet: the cable inside it, from where it comes in to each ODF (the proposed ones, or all when none is proposed). It runs to the side of
   the rack the user chose (el.cab.side, el.cab.off), along it to the height of the ODF, and turns in. */
function cabCable(S, sc, el, z0, O, port) {
  const K = rackOf(el), zb = z0 + K.zb, odfs = rackSlots(S, el).filter(q => q.e.t === 'odf'), P = odfs.filter(q => q.e.st === 'P'), L = P.length ? P : odfs; if (!L.length) return;
  const cb = el.cab || {}, pt = port || cabPort(S, el, null), sd = cb.side === 'R' ? 1 : cb.side === 'L' ? -1 : (pt.f !== 'B' && pt.lx > 0.02) || pt.f === 'R' ? 1 : -1;
  const off = clamp(num(cb.off, 0.03), 0.01, Math.max(0.01, (O.u1 - O.u0) / 2 - 0.02)), u = sd < 0 ? O.u0 + off : O.u1 - off, cu = v => clamp(v, O.u0 + 0.01, O.u1 - 0.01);
  L.forEach((q, i) => {
    const z = zb + (q.u - 1 + q.ru / 2) * RU, uu = u - sd * 0.012 * i, ue = sd * (K.hw - 0.03), ln = (a, b, c, e) => { if (Math.abs(a - c) + Math.abs(b - e) > 1e-4) faceLine(sc, el, 'F', a, b, c, e, 'ug'); };
    if (pt.f === 'T') { const us = cu(pt.lx), zs = O.zu - 0.02 - 0.012 * i; ln(us, O.zu, us, zs); ln(us, zs, uu, zs); ln(uu, zs, uu, z); }
    else if (pt.f === 'B') { const us = pt.auto && !pt.X ? uu : cu(pt.lx), zs = O.zb + 0.02 + 0.012 * i; if (Math.abs(us - uu) < 0.005) ln(uu, z0, uu, z); else { ln(us, z0, us, zs); ln(us, zs, uu, zs); ln(uu, zs, uu, z); } }
    else { const us = pt.f === 'L' ? O.u0 : pt.f === 'R' ? O.u1 : cu(pt.lx), zs = clamp(z0 + pt.iz, O.zb + 0.02, O.zu - 0.02); ln(us, zs, uu, zs); ln(uu, zs, uu, z); }
    ln(uu, z, ue, z);
  });
}
/* the plan's cable round a cabinet whose detail is drawn: cut where it goes in, with the piece from there to the gland */
function cabEntry(S, el, rg) {
  const pt = cabPort(S, el, rg); if (!pt) return null; const P = elPoly(el), ins = p => inPoly(p, P);
  return { port: pt, inside: ins, hop: !!(rg && rg.ports && rg.ports[el.id]),
    cut: (a, b) => { const ia = ins(a), ib = ins(b); if (ia && ib) return null; if (!ia && !ib) return [a, b]; let t0 = 0, t1 = 1; const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; for (let k = 0; k < 30; k++) { const m = (t0 + t1) / 2; if (ins(at(m)) === ia) t0 = m; else t1 = m; } const x = at(t0); return ia ? [x, b] : [a, x]; },
    /* from where the plan's cable meets the cabinet to the gland, kept outside the cabinet: over the roof, under the base, or down the outside of a wall */
    tail: () => { if (!pt.X) return null; const c = pt.X.p, g = pt.p, f = pt.f, zt = pt.z0 + pt.h + 0.15, zl = pt.z0 - 0.1, hi = c[2] >= pt.z0 + pt.h - 0.03, lo = c[2] <= pt.z0 + 0.25;
      if (f === 'T') return hi ? [c, [g[0], g[1], c[2]], g] : [c, [c[0], c[1], zt], [g[0], g[1], zt], g];
      if (f === 'B') return c[2] <= pt.z0 ? [c, [g[0], g[1], c[2]], g] : [c, [c[0], c[1], zl]];      /* from above to the base: down the outside; under the base it is not drawn */
      if (pt.X.from === f && !hi && !lo) return [c, [c[0], c[1], g[2]], g];
      const o = f === 'L' ? loc(el, -el.w / 2 - 0.12, pt.ly) : f === 'R' ? loc(el, el.w / 2 + 0.12, pt.ly) : loc(el, pt.lx, el.d / 2 + 0.12), zv = hi ? c[2] : lo ? Math.min(c[2], zl) : zt;
      return [c, [c[0], c[1], zv], [o[0], o[1], zv], [o[0], o[1], g[2]], g]; } };
}
function isoEl(S, el, sc, A, rg, X) {
  const T = TYPES[el.t], lay = X && X.ref ? 'dt' : elLayer(el), c = [el.x, el.y], lp = (x, y) => loc(el, x, y), w = el.w, d = el.d, rot = el.rot || 0;      /* beta 4.1: X.ref = drawn in thin grey, round the detail of a cabinet */
  const zg = baseZ(S, el), z0 = zg + (el.z != null ? Math.max(0, num(el.z, 0)) : 0), h = Math.max(0.02, num(el.h, 0.02)), hid = X && X.ref ? 'dt' : el.st === 'P' ? 'hp' : 'hd', H = sc.hdir();
  const sid0 = sc.sid, isT = T.g === 'tower', TS = isT ? towerShape(S, el) : null, hr = isT ? TS.hr : 0, hd = isT ? TS.hd : 0, full = isT && !TS.cut, zt = z0 + hd;
  const tri = r => [90, 210, 330].map(a => lp(r * Math.cos(a * D2R), r * Math.sin(a * D2R))), rod = (p, len) => sc.line([p[0], p[1], zt], [p[0], p[1], zt + len], lay);
  const extra = [], ringX = (r, zs) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; for (const z of zs) extra.push([el.x + r * Math.cos(a), el.y + r * Math.sin(a), z]); } };
  let az = z0 + (isT ? Math.min(hd * 0.25, 5) : h), fp = elPoly(el), top = isT ? zt : z0 + h, edit = isT ? null : 'h', hp = [el.x, el.y, z0 + h], flat = el.t === 'pad', bx = null, ladP = null;
  switch (el.t) {
    case 't3': case 't4': {
      const four = el.t === 't4', hw = w / 2, lg = four ? [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]].map(q => lp(q[0], q[1])) : tri(w / Math.sqrt(3)), n = lg.length, ps = clamp(w / 9, 0.3, 0.5), ft = 0.66, tr = TS.topW / (four ? Math.SQRT2 : Math.sqrt(3)), ph = 2;
      for (const q of lg) { prism(sc, sqr(q, ps, rot), z0, z0 + 0.6, lay); prism(sc, sqr(q, ps * 0.6, rot), z0 + 0.6, z0 + ft, lay); }       /* concrete pedestal and base plate */
      const at = lattice(sc, el, z0, lg, TS, { legR: clamp(w * 0.022, 0.06, 0.13), barW: 0.09, x: true, foot: ft, flange: 6, lay });
      const TL = towerLad(S, el); if (TL) { climbLadder(sc, at, TL.i, (TL.i + 1) % n, 1, Math.min(hr * 0.97, hd), 'dt', TL.t); ladP = v3.lerp(at(TL.i, 1), at((TL.i + 1) % n, 1), TL.t); }
      if (full) {
        if (hd > 5) platform(sc, el, at, n, hr - (ph * 2 + 0.9), TS, lay);
        antennas(sc, c, zt - 0.1, tr, rot, lay, 3, ph, 1); if (hd > 7) antennas(sc, c, zt - 0.1 - ph - 0.35, tr, rot + 60, lay, 3, ph * 0.8, 1);
        prism(sc, sqr(c, 0.1, rot), zt, zt + 0.12, lay); rod(c, 2.2); top = zt + 2.2; ringX(tr + 1.1, [zt - 4.6]); ringX((tr + 1.1) * 0.4, [top]);
      }
      for (let i = 0; i < n; i++) extra.push(at(i, hd));
      fp = hull([].concat.apply([], lg.map(q => sqr(q, ps, 0)))); break;
    }
    case 'rtt': { const tr = TS.topW / Math.sqrt(3); lattice(sc, el, z0, tri(w / Math.sqrt(3)), TS, { legR: 0.035, barW: 0, x: true, minP: 0.9, lay }); antennas(sc, c, zt - 0.1, tr, rot, lay, 3, 1.4, 1); rod(c, 1); top = zt + 1; ringX(tr + 0.9, [zt - 1.6]); extra.push([el.x, el.y, top]); break; }
    case 'guy': {
      const r = w / Math.sqrt(3); lattice(sc, el, z0, tri(r), TS, { legR: 0.03, barW: 0, x: false, minP: 3, lay });
      for (const q of tri(Math.max(1, num(el.ar, 8)))) {
        const zq = groundZ(S, q), a = [q[0], q[1], zq + 0.3]; prism(sc, sqr(q, 0.4, rot), zq, zq + 0.3, lay);
        for (const f of [0.3, 0.55, 0.78, 0.97]) { let b = [el.x, el.y, z0 + hr * f]; if (b[2] > zt && zt > a[2]) b = v3.lerp(a, b, (zt - a[2]) / (b[2] - a[2])); sc.line(a, b, lay); }
      }
      if (full) { antennas(sc, c, zt - 0.1, r, rot, lay, 3, 1.7, 1); rod(c, 1.6); top = zt + 1.6; ringX(r + 0.9, [zt - 1.9]); }
      extra.push([el.x, el.y, top]); fp = sqr(c, Math.max(0.4, r), 0); break;
    }
    case 'mono': {
      const R = zr => w / 2 * (1 - 0.6 * zr / hr), ph = 2;
      prism(sc, sqr(c, w / 2 + 0.4, rot), z0, z0 + 0.25, lay); frustum(sc, c, z0 + 0.25, z0 + 0.33, w / 2 + 0.15, w / 2 + 0.15, lay, 16);
      frustum(sc, c, z0, zt, R(0), R(hd), lay, 16); for (let zr = 10; zr < hd - 1; zr += 10) frustum(sc, c, z0 + zr - 0.05, z0 + zr + 0.05, R(zr) + 0.05, R(zr) + 0.05, lay, 16);
      if (full) { antennas(sc, c, zt - 0.15, R(hr), rot, lay, 3, ph, 1); if (hd > 7) antennas(sc, c, zt - 0.15 - ph - 0.4, R(hr) * 1.1, rot + 60, lay, 3, ph * 0.8, 1); rod(c, 1.8); top = zt + 1.8; ringX(R(hr) + 0.9, [zt - 4.6]); }
      else { breakMark(sc, [el.x, el.y, zt + 0.3], H, R(hd) * 1.7, lay); top = zt + 0.5; }
      extra.push([el.x, el.y, top], [el.x - H[0] * R(hd), el.y - H[1] * R(hd), zt], [el.x + H[0] * R(hd), el.y + H[1] * R(hd), zt]); fp = sqr(c, w / 2 + 0.4, rot); break;
    }
    case 'tad': {      /* beta 4.2 (22:24): a tadpole: a slim pole, and at its top a wider cylinder that holds the antennas */
      const r = Math.max(w / 2, 0.08), rt = r * 0.75, hc = Math.min(Math.max(2.4, hr * 0.16), hr * 0.3), rc = Math.max(r * 1.9, r + 0.18), zc = z0 + hr - hc;
      prism(sc, sqr(c, r + 0.3, rot), z0, z0 + 0.2, lay); frustum(sc, c, z0 + 0.2, z0 + 0.26, r + 0.12, r + 0.12, lay, 12);
      if (full) { frustum(sc, c, z0, zc, r, rt, lay, 12); frustum(sc, c, zc, zc + 0.15, rt, rc, lay, 12); frustum(sc, c, zc + 0.15, zt, rc, rc, lay, 16); rod(c, 1); top = zt + 1; ringX(rc + 0.3, [zc, zt]); }
      else { frustum(sc, c, z0, zt, r, r - (r - rt) * hd / hr, lay, 12); breakMark(sc, [el.x, el.y, zt + 0.3], H, r * 1.7, lay); top = zt + 0.5; }
      extra.push([el.x, el.y, top], [el.x - H[0] * r, el.y - H[1] * r, zt], [el.x + H[0] * r, el.y + H[1] * r, zt]); fp = sqr(c, r + 0.3, rot); break;
    }
    case 'palm': {
      const R = zr => w / 2 * (1 - 0.36 * zr / hr), cr = 3.5; frustum(sc, c, z0, zt, R(0), R(hd), lay, 12);
      for (let zd = 0.9; zd < hd - 0.4; zd += 0.9) { const r = R(zd) + 0.006, P = []; for (let i = 0; i < 12; i++) P.push([el.x + r * Math.cos(i * Math.PI / 6), el.y + r * Math.sin(i * Math.PI / 6), z0 + zd]); sc.poly(P, 'dt', 1); }   /* trunk rings */
      if (full) {
        antennas(sc, c, zt - 0.5, R(hr), rot, lay, 3, 1.5, 1);
        for (let i = 0; i < 11; i++) {                               /* fronds with leaflets */
          const a = (i * 360 / 11 + rot) * D2R, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], up = i % 2 ? 0.7 : 1.15, P = [];
          for (let q = 0; q <= 6; q++) { const s = q / 6; P.push([el.x + u[0] * cr * s, el.y + u[1] * cr * s, zt + up * Math.sin(Math.PI * s * 0.85) - 1.7 * s * s]); }
          sc.poly(P, lay);
          for (let q = 1; q <= 6; q++) for (const sg of [-1, 1]) sc.line(P[q], [P[q][0] + v[0] * 0.42 * sg + u[0] * 0.1, P[q][1] + v[1] * 0.42 * sg + u[1] * 0.1, P[q][2] - 0.3], 'dt');
        }
        top = zt + 1.2; ringX(cr, [zt - 1.9]); ringX(cr * 0.4, [top]);
      } else { breakMark(sc, [el.x, el.y, zt + 0.3], H, R(hd) * 1.7, lay); top = zt + 0.5; extra.push([el.x, el.y, top], [el.x - H[0] * R(hd), el.y - H[1] * R(hd), zt], [el.x + H[0] * R(hd), el.y + H[1] * R(hd), zt]); }
      fp = sqr(c, Math.max(0.3, R(0)), 0); break;
    }
    case 'ezm': {
      const r = Math.max(w / 2, 0.1), cq = lp(r + 0.19, 0), cab = { x: cq[0], y: cq[1], w: 0.5, d: 0.34, rot: rot + 90 };
      prism(sc, sqr(c, r + 0.2, rot), z0, z0 + 0.05, lay); frustum(sc, c, z0, zt, r, r * 0.8, lay, 10);
      prism(sc, rectAt(cq, cab.w, cab.d, cab.rot), z0 + 0.9, z0 + 1.9, lay); faceRect(sc, cab, 'F', -0.2, 0.2, z0 + 0.96, z0 + 1.84, lay);
      prism(sc, rectAt(lp(-r - 0.11, 0), 0.2, 0.3, rot), z0 + Math.min(4, hd * 0.45), z0 + Math.min(4, hd * 0.45) + 0.5, lay);
      frustum(sc, c, zt - Math.min(1.8, hd * 0.2), zt, r + 0.12, r + 0.12, lay, 12); rod(c, 0.5); top = zt + 0.5; fp = sqr(c, r + 0.45, rot); extra.push([el.x, el.y, top]); ringX(0.6, [zt - 1]); break;
    }
    case 'rtp': {
      const r = Math.max(w / 2, 0.05); prism(sc, sqr(c, 0.25, rot), z0, z0 + 0.04, lay); frustum(sc, c, z0, zt, r, r, lay, 8);
      for (const q of tri(1.2)) { const zq = groundZ(S, q); sc.line([q[0], q[1], zq], [el.x, el.y, z0 + hd * 0.5], lay); prism(sc, sqr(q, 0.1, rot), zq, zq + 0.04, lay); }
      prism(sc, rectAt(lp(r + 0.14, 0), 0.14, 0.3, rot), zt - Math.min(1.6, hd * 0.4), zt - 0.15, lay); prism(sc, rectAt(lp(-r - 0.11, 0), 0.18, 0.28, rot), zt - Math.min(2.3, hd * 0.55), zt - Math.min(1.8, hd * 0.45), lay); rod(c, 0.6); top = zt + 0.6; fp = sqr(c, 0.7, 0); extra.push([el.x, el.y, top]); ringX(0.6, [zt - 1]); break;
    }
    case 'cow': {
      const sl = Math.min(3.2, d * 0.55), sq = lp(0, -d / 2 + sl / 2 + 0.1), sh = { x: sq[0], y: sq[1], w: w - 0.1, d: sl, rot }, m = lp(0, d / 2 - 0.7), hitch = lp(0, d / 2 + 1.3), zc = z0 + 0.6;
      prism(sc, elPoly(el), zc, zc + 0.18, lay);
      for (const sx of [-1, 1]) for (const yy of [-0.5, 0.45]) { const a = lp(sx * (w / 2 - 0.3), yy), b = lp(sx * (w / 2 + 0.02), yy); tube(sc, [a[0], a[1], z0 + 0.38], [b[0], b[1], z0 + 0.38], 0.38, 0.38, lay, 12); }
      for (const sx of [-1, 1]) { const a = lp(sx * w * 0.4, d / 2); sc.line([a[0], a[1], zc + 0.05], [hitch[0], hitch[1], zc + 0.05], lay); }
      sc.line([hitch[0], hitch[1], zc + 0.05], [hitch[0], hitch[1], z0], lay);
      for (const q of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const a = lp(q[0] * w / 2, q[1] * (d / 2 - 0.15)), b = lp(q[0] * (w / 2 + 0.7), q[1] * (d / 2 - 0.15)); sc.poly([[a[0], a[1], zc], [b[0], b[1], zc], [b[0], b[1], z0]], lay); if (hd > 5) sc.line([b[0], b[1], z0], [m[0], m[1], z0 + hd * 0.8], 'dt'); }
      prism(sc, rectAt(sq, sh.w, sh.d, rot), zc + 0.18, zc + 2.4, lay); faceRect(sc, sh, 'R', -0.4, 0.4, zc + 0.24, zc + 2.2, lay); faceLine(sc, sh, 'R', 0.28, zc + 1.15, 0.28, zc + 1.35, lay);
      prism(sc, rectAt(lp(0, -d / 2 + 0.02), 0.9, 0.3, rot), zc + 1.5, zc + 2.1, lay);
      for (let q = 0; q < 3; q++) { const a = Math.max(zc + 0.18, z0 + hd * q / 3), b = z0 + hd * (q + 1) / 3; frustum(sc, m, a, b, 0.17 - 0.035 * q, 0.17 - 0.035 * q, lay, 10); }
      antennas(sc, m, zt - 0.2, 0.09, rot, lay, 3, 1.5, 1); sc.line([m[0], m[1], zt], [m[0], m[1], zt + 0.8], lay); az = zc + 2.4; top = zt + 0.8; extra.push([m[0], m[1], top]); for (const q of fp) extra.push([q[0], q[1], zc + 2.4]); break;
    }
    case 'pad': prism(sc, elPoly(el), z0, z0 + h, lay);
      for (const K of padSteps(el)) for (let i = 1; i <= K.n; i++) prism(sc, [faceXY(el, K.face, K.u - K.w / 2, -(i - 1) * K.tread), faceXY(el, K.face, K.u + K.w / 2, -(i - 1) * K.tread), faceXY(el, K.face, K.u + K.w / 2, -i * K.tread), faceXY(el, K.face, K.u - K.w / 2, -i * K.tread)], z0, z0 + h - i * K.rise, lay);      /* beta 4.2: its stairs, each step a block down to the ground */
      bx = { w, d, z0, z1: z0 + h, top: 1, sides: '' }; break;
    case 'odc': {
      const pl = Math.min(0.1, h * 0.1), rf = Math.min(0.07, h * 0.08), n = w >= 1.1 ? 2 : 1, O = odcOpening(el, z0), open = h > 0.8 && !(X && X.ref) && (!!(X && X.only) || rackItems(S, el).length > 0);
      const big = h > 1 && w > 0.4 && d > 0.3, ins = big ? 0.03 : -0.03, P3w = (x, y, z) => { const q = lp(x, y); return [q[0], q[1], z]; };
      prism(sc, rectAt(c, w - 2 * ins, d - 2 * ins, rot), z0, z0 + pl, lay);                                  /* the base frame, set back under the body */
      const hol = open && !!(X && X.only) && w > 0.3 && d > 0.25;      /* beta 4.2: the opened cabinet of a detail is hollow, so that its inside shows */
      if (hol) { const bxl = (x0, x1, y0, y1, za, zc) => prism(sc, [lp(x0, y0), lp(x1, y0), lp(x1, y1), lp(x0, y1)], za, zc, lay), zb0 = z0 + pl, zt0 = z0 + h - rf, tb = 0.03; X.hollow = 1;
        bxl(-w / 2, O.u0, -d / 2, d / 2, zb0, zt0); bxl(O.u1, w / 2, -d / 2, d / 2, zb0, zt0); bxl(O.u0, O.u1, d / 2 - tb, d / 2, zb0, zt0);      /* the two side walls and the back */
        bxl(O.u0, O.u1, -d / 2, d / 2 - tb, zb0, O.zb); bxl(O.u0, O.u1, -d / 2, d / 2 - tb, O.zu, zt0);                                          /* the floor and the top */
        for (const q of cabHoles(el)) { const P = []; for (let i = 0; i < 10; i++) { const an = i * Math.PI / 5, t = lp(q.x + q.r * Math.cos(an), q.y + q.r * Math.sin(an)); P.push([t[0], t[1], O.zb + 0.003]); } sc.poly(P, 'dt', 1); }      /* the cable holes in the floor */
      }
      else prism(sc, elPoly(el), z0 + pl, z0 + h - rf, lay);                                                       /* the body */
      { const ow = 0.05, of = big ? 0.12 : 0.05, zb2 = z0 + h - rf, zf = big ? z0 + h - rf * 0.45 : z0 + h, zk = z0 + h, x0 = -w / 2 - ow, x1 = w / 2 + ow, y0 = -d / 2 - of, y1 = d / 2 + ow;
        const b = [P3w(x0, y0, zb2), P3w(x1, y0, zb2), P3w(x1, y1, zb2), P3w(x0, y1, zb2)], t = [P3w(x0, y0, zf), P3w(x1, y0, zf), P3w(x1, y1, zk), P3w(x0, y1, zk)];
        sc.solid([t, b, [b[0], b[1], t[1], t[0]], [b[1], b[2], t[2], t[1]], [b[2], b[3], t[3], t[2]], [b[3], b[0], t[0], t[3]]], lay); }      /* the roof: it overhangs the door and slopes to the front */
      const H = O.zu - O.zb, unit = (pa, pb, nx, ny, za, zb2) => {            /* the cooling unit on a door: a shallow box standing out of it, with its grille */
        const t = 0.05, q = [[pa[0], pa[1]], [pb[0], pb[1]], [pb[0] + nx * t, pb[1] + ny * t], [pa[0] + nx * t, pa[1] + ny * t]]; prism(sc, q.map(k => lp(k[0], k[1])), za, zb2, lay);
        const e = 0.004, a2 = [pa[0] + nx * (t + e), pa[1] + ny * (t + e)], b2 = [pb[0] + nx * (t + e), pb[1] + ny * (t + e)], m = k => [a2[0] + (b2[0] - a2[0]) * k, a2[1] + (b2[1] - a2[1]) * k];
        { const zg = za + (zb2 - za) * 0.7, c3 = (k, z) => { const q = m(k); return P3w(q[0], q[1], z); }; sc.poly([c3(0.1, za + 0.02), c3(0.9, za + 0.02), c3(0.9, zg), c3(0.1, zg)], 'dt', 1);      /* (19:25) its grille in a frame, and above it the small cover of its controller */
          for (let i = 1; i <= 7; i++) { const z = za + 0.02 + (zg - za - 0.02) * i / 8; sc.line(c3(0.14, z), c3(0.86, z), 'dt'); }
          sc.poly([c3(0.58, zg + (zb2 - zg) * 0.3), c3(0.88, zg + (zb2 - zg) * 0.3), c3(0.88, zg + (zb2 - zg) * 0.75), c3(0.58, zg + (zb2 - zg) * 0.75)], 'dt', 1); } };
      for (const side of ['F', 'B']) {
        if (side === 'F' && open) {                                  /* the door stands open and the rack shows, with what is mounted in it */
          const a = (X && X.only ? 150 : 105) * D2R;
          if (!hol) faceRect(sc, el, 'F', O.u0, O.u1, O.zb, O.zu, lay); rackFace(S, sc, el, z0, A, X); if (X && X.only && !hol) cabCable(S, sc, el, z0, O, X.port);      /* (beta 4.2: in a hollow cabinet the cable inside is drawn after everything else, so that what hides it is known) */
          const leaf = (uh, dir, len) => { const p0 = [uh, -d / 2], p1 = [uh + dir * len * Math.cos(a), -d / 2 - len * Math.sin(a)], t = 0.03, nx = -(p1[1] - p0[1]) / len, ny = (p1[0] - p0[0]) / len, sg = dir > 0 ? 1 : -1;
            prism(sc, [lp(p0[0], p0[1]), lp(p1[0], p1[1]), lp(p1[0] + sg * nx * t, p1[1] + sg * ny * t), lp(p0[0] + sg * nx * t, p0[1] + sg * ny * t)], O.zb, O.zu, lay);
            if (big && len > 0.3) { const k = q => [p0[0] + (p1[0] - p0[0]) * q + sg * nx * t, p0[1] + (p1[1] - p0[1]) * q + sg * ny * t]; unit(k(0.16), k(0.84), sg * nx, sg * ny, O.zb + H * 0.07, O.zb + H * 0.42);
              if (hol) { const e2 = 0.004, c3 = (q, z) => { const t2 = k(q); return P3w(t2[0] + sg * nx * e2, t2[1] + sg * ny * e2, z); }, fr = (q0, q1, za, zb, ly) => sc.poly([c3(q0, za), c3(q1, za), c3(q1, zb), c3(q0, zb)], ly, 1);      /* (19:25) inside the door: its frame, and the pocket for the documents */
                fr(0.05, 0.95, O.zb + H * 0.03, O.zu - H * 0.03, lay); fr(0.3, 0.7, O.zb + H * 0.62, O.zb + H * 0.8, lay); sc.line(c3(0.3, O.zb + H * 0.76), c3(0.7, O.zb + H * 0.76), 'dt');
                /* beta 4.2 (22:24), more of how it is built: the gasket; the rod of the lock with its case and two guides; the three hinges; the stay that holds the door open */
                fr(0.085, 0.915, O.zb + H * 0.055, O.zu - H * 0.055, 'dt');
                { const zm = O.zb + H * 0.52; sc.line(c3(0.935, O.zb + H * 0.045), c3(0.935, O.zu - H * 0.045), lay); fr(0.9, 0.97, zm - 0.06, zm + 0.06, lay); for (const kz of [0.2, 0.82]) fr(0.92, 0.95, O.zb + H * kz - 0.012, O.zb + H * kz + 0.012, lay); }
                for (const kz of [0.12, 0.5, 0.88]) { const hq = lp(p0[0], p0[1] - 0.014); tube(sc, [hq[0], hq[1], O.zb + H * kz - 0.04], [hq[0], hq[1], O.zb + H * kz + 0.04], 0.012, 0.012, lay, 6); }
                { const s0 = lp(uh + dir * Math.min(0.22, len * 0.4), -d / 2 - 0.004), s1 = k(0.34); sc.line([s0[0], s0[1], O.zu - 0.012], P3w(s1[0], s1[1], O.zu - 0.012), lay); } } } };      /* its cooling unit, seen from the inside */
          if (n === 1) leaf(O.u0, 1, O.u1 - O.u0); else { leaf(O.u0, 1, (O.u1 - O.u0) / 2); leaf(O.u1, -1, (O.u1 - O.u0) / 2); }
          continue;
        }
        for (let q = 0; q < n; q++) {
          const u0 = -w / 2 + 0.05 + q * (w - 0.1) / n, u1 = u0 + (w - 0.1) / n - (n > 1 ? 0.02 : 0); faceRect(sc, el, side, u0, u1, O.zb, O.zu, lay);
          if (h > 1) {
            const hs = n > 1 && q === 1 ? -1 : 1, uh = hs > 0 ? u1 - 0.07 : u0 + 0.07, uj = hs > 0 ? u0 + 0.014 : u1 - 0.014;
            if (big && side === 'F') { faceRect(sc, el, side, uh - 0.016, uh + 0.016, O.zb + H * 0.46, O.zb + H * 0.6, lay); for (const k of [0.12, 0.5, 0.88]) faceLine(sc, el, side, uj, O.zb + H * k - 0.035, uj, O.zb + H * k + 0.035, lay); }      /* the lock handle; the hinges */
            else faceLine(sc, el, side, uh, O.zb + H * 0.45, uh, O.zb + H * 0.58, lay);
            if (big) doorDress(sc, el, side, u0, u1, O, H, lay); else for (let i = 1; i <= 3; i++) faceLine(sc, el, side, u0 + 0.08, O.zu - 0.07 * i - 0.04, u1 - 0.08, O.zu - 0.07 * i - 0.04, 'dt');      /* louvres (19:25: on a cabinet of full size, the whole door) */
            if (big && side === 'F' && u1 - u0 > 0.3) unit([u0 + (u1 - u0) * 0.16, -d / 2], [u0 + (u1 - u0) * 0.84, -d / 2], 0, -1, O.zb + H * 0.07, O.zb + H * 0.42);
          }
        }
      }
      if (big && !(X && X.ref)) odcDress(sc, el, z0, O, { lay, hol, ins, pl, rf });      /* (19:25) */
      { const pt = X && X.port && X.only ? X.port : !(X && X.ref) && ((el.cab && el.cab.in && el.cab.in !== 'A') || rackItems(S, el).some(e => e.t === 'odf')) ? cabPort(S, el, rg) : null;      /* the gland where the cable goes in */
        if (pt && (pt.X || !pt.auto || hol)) { const g = 0.035, il = 'pp';
          if (pt.f === 'T') prism(sc, rectAt(lp(pt.lx, pt.ly), 2 * g, 2 * g, rot), z0 + h - rf * 0.3, z0 + h + 0.05, il);
          else if (pt.f === 'B' && hol) { const P = [], rr = 0.03, zf = O.zb + 0.004, c3 = (x, y) => { const t = lp(x, y); return [t[0], t[1], zf]; }; for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6; P.push(c3(pt.lx + rr * Math.cos(an), pt.ly + rr * Math.sin(an))); } sc.poly(P, il, 1);      /* the hole the cable goes through: a ring on the floor */
            sc.line(c3(pt.lx - rr * 0.7, pt.ly - rr * 0.7), c3(pt.lx + rr * 0.7, pt.ly + rr * 0.7), il); sc.line(c3(pt.lx - rr * 0.7, pt.ly + rr * 0.7), c3(pt.lx + rr * 0.7, pt.ly - rr * 0.7), il); }
          else if (pt.f === 'B') faceRect(sc, el, Math.abs(pt.ly) > d / 2 - 0.12 && pt.ly > 0 ? 'B' : 'F', (pt.ly > 0 && Math.abs(pt.ly) > d / 2 - 0.12 ? -1 : 1) * pt.lx - g, (pt.ly > 0 && Math.abs(pt.ly) > d / 2 - 0.12 ? -1 : 1) * pt.lx + g, z0 + 0.012, z0 + pl - 0.012, il);
          else { const sd = pt.f === 'K' ? 'B' : pt.f, u = pt.f === 'K' ? -pt.lx : pt.f === 'R' ? pt.ly : -pt.ly; faceRect(sc, el, sd, u - g, u + g, z0 + pt.iz - g, z0 + pt.iz + g, il); faceLine(sc, el, sd, u - g, z0 + pt.iz - g, u + g, z0 + pt.iz + g, il); faceLine(sc, el, sd, u - g, z0 + pt.iz + g, u + g, z0 + pt.iz - g, il); } 
          if (hol && (pt.f === 'L' || pt.f === 'R')) { const xi = pt.f === 'L' ? O.u0 + 0.003 : O.u1 - 0.003, zc = z0 + pt.iz, c3 = (y, z) => { const t = lp(xi, y); return [t[0], t[1], z]; }; sc.poly([c3(pt.ly - g, zc - g), c3(pt.ly + g, zc - g), c3(pt.ly + g, zc + g), c3(pt.ly - g, zc + g)], il, 1); }      /* the same place seen from inside */
          if (hol && rackItems(S, el).some(e => e.t === 'odf')) { const key = 'gl' + el.id; A.push({ k: 'el', key, kind: 'lead', p: [pt.p[0], pt.p[1], pt.f === 'B' ? O.zb : pt.p[2]], s: labText(S, key, 'FOC ENTRY'), st: 'P', fp: elPoly(el), z: z0, pts: null }); }
        } }
      bx = { w, d, z0: z0 + pl, z1: z0 + h - rf, top: 1, zt: z0 + h, tw: w + 0.1, td: d + 0.1, sides: open ? 'RBL' : 'FRBL' }; break;
    }
    case 'cabin': {
      const dh = Math.min(2.1, h - 0.2); prism(sc, elPoly(el), z0, z0 + h, lay); prism(sc, rectAt(c, w + 0.3, d + 0.3, rot), z0 + h, z0 + h + 0.12, lay);
      if (dh > 0.5) for (const D of cabinDoors(el)) {                /* each door, with its handle and a step in front of it */
        const hz = D.face === 'F' || D.face === 'B', c = faceXY(el, D.face, D.u, -0.3);
        faceRect(sc, el, D.face, D.u - D.w / 2, D.u + D.w / 2, z0 + 0.02, z0 + dh, lay); faceLine(sc, el, D.face, D.u + D.w / 2 - 0.13, z0 + dh * 0.48, D.u + D.w / 2 - 0.13, z0 + dh * 0.58, lay); prism(sc, rectAt(c, hz ? D.w + 0.2 : 0.5, hz ? 0.5 : D.w + 0.2, rot), z0, z0 + 0.12, lay);
      }
      cabinPorts(el).forEach((q, i) => {                              /* the portholes, where the sketch of the inside has them */
        const key = 'port' + el.id + '_' + i, u = portPlate(sc, el, q.face, q.u, z0 + q.z, q.st === 'P' ? 'pp' : lay);
        const len = q.face === 'F' || q.face === 'B' ? w : d, hw2 = Math.max(0.05, Math.min(0.25, len / 2 - 0.02)), zc = z0 + q.z, seen = facing(sc, faceN(el, q.face)) > 0.05;
        if (!seen) {                                        /* on a wall that faces away: drawn dashed, as seen through the cabin */
          const hl = q.st === 'P' ? 'hp' : 'hd', ring = (uu, zz, rr) => { const o = []; for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; o.push(onFace(el, q.face, uu + rr * Math.cos(an), zz + rr * Math.sin(an))); } return o; };
          A.push({ k: 'ghost', lay: hl, pts: [onFace(el, q.face, u - hw2, zc - 0.18), onFace(el, q.face, u + hw2, zc - 0.18), onFace(el, q.face, u + hw2, zc + 0.18), onFace(el, q.face, u - hw2, zc + 0.18)] });
          for (let i = -1; i <= 1; i++) for (const j of [-1, 1]) A.push({ k: 'ghost', lay: hl, pts: ring(u + i * hw2 * 0.6, zc + j * 0.08, 0.045) });
        }
        A.push({ k: 'el', grp: 'port', key, kind: 'lead', p: onFace(el, q.face, u, zc - (seen ? 0.18 : 0)), s: labText(S, key, 'PORTHOLE'), st: q.st, fp: elPoly(el), z: z0, pts: null });
      });
      for (const q of cabinAcs(el)) prism(sc, rectAt(q.at, q.hz ? q.w : q.d, q.hz ? q.d : q.w, rot), z0 + q.z, z0 + q.z + q.h, q.st === 'P' ? 'pp' : lay);          /* the aircon units, outside their walls */
      top = z0 + h + 0.12; bx = { w, d, z0, z1: z0 + h, top: 1, zt: top, tw: w + 0.3, td: d + 0.3, sides: 'FRBL' }; break;
    }
    case 'gen': {
      const sk = Math.min(0.12, h * 0.12); prism(sc, rectAt(c, w + 0.1, d + 0.1, rot), z0, z0 + sk, lay); prism(sc, elPoly(el), z0 + sk, z0 + h, lay);
      frustum(sc, lp(w * 0.32, 0), z0 + h, z0 + h + 0.35, 0.07, 0.07, lay, 8); prism(sc, rectAt(lp(-w * 0.1, 0), w * 0.35, d * 0.45, rot), z0 + h, z0 + h + 0.06, lay);
      for (const side of ['F', 'B']) for (const q of [0, 1]) { const u0 = q ? 0.04 : -w / 2 + 0.1, u1 = q ? w / 2 - 0.1 : -0.04; faceRect(sc, el, side, u0, u1, z0 + sk + 0.08, z0 + h - 0.1, lay); faceLine(sc, el, side, q ? u0 + 0.1 : u1 - 0.1, z0 + h * 0.5, q ? u0 + 0.1 : u1 - 0.1, z0 + h * 0.62, lay); }
      for (const side of ['R', 'L']) for (let z = z0 + sk + 0.18; z < z0 + h - 0.15; z += 0.11) faceLine(sc, el, side, -d / 2 + 0.12, z, d / 2 - 0.12, z, 'dt');
      top = z0 + h + 0.35; bx = { w, d, z0: z0 + sk, z1: z0 + h, top: 1, sides: 'FRBL' }; break;
    }
    case 'tank': {
      const r = Math.max(0.1, Math.min(d, h) / 2), zc = z0 + h - r;
      hcyl(sc, el, -w / 2, w / 2, zc, r, lay); for (const sx of [-w * 0.3, w * 0.3]) { hcyl(sc, el, sx - 0.035, sx + 0.035, zc, r + 0.02, lay); if (zc - r - z0 > 0.05) prism(sc, rectAt(lp(sx, 0), 0.16, d * 0.85, rot), z0, zc - r * 0.55, lay); }
      frustum(sc, lp(0, 0), zc + r - 0.02, zc + r + 0.14, 0.07, 0.07, lay, 8); bx = { w, d: 2 * r, z0: zc - r * 0.66, z1: zc + r * 0.66, sides: 'FB' }; break;
    }
    case 'hh': case 'sbox': {                                        /* a pit: the frame at ground level and the box below ground */
      const dp = Math.max(0.1, num(el.dp, T.dp || 0.6)), t = Math.min(0.1, w * 0.15, d * 0.15), out = elPoly(el), inn = rectAt(c, w - 2 * t, d - 2 * t, rot), zc = z0 + h;
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; prism(sc, [out[i], out[j], inn[j], inn[i]], z0, zc, lay); }
      if (!FLAT) sc.pit(inn.map(q => [q[0], q[1], zc]), dp + h, lay, hid);
      else for (const k of [0.25, 0.5, 0.75]) { const m = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, zc]; sc.line(m(inn[0], inn[1]), m(inn[0], inn[3]), lay); sc.line(m(inn[2], inn[3]), m(inn[2], inn[1]), lay); }      /* drawn flat, as on the hand-made plans: a hatched slab at ground level */
      if (!FLAT) { edit = 'dp'; hp = [el.x, el.y, zc - dp - h]; } flat = true; break;      /* drawn flat, its depth has no handle to drag: it is typed in the panel */
    }
    case 'exit': { const x = rg.exits.find(q => q.el === el.id); const er = x ? null : exitRun(S, el), at = x ? x.at : c, uu = x ? x.u : er ? er.u : rot2(1, 0, rot); fp = rectAt(exitMid(at, uu), w, d, rot); exitStub(sc, at, z0, h, fp, lay, hid, uu, x ? x.dp : er ? er.dp : depthAt(S, c) - STD.hdpe / 2, x ? x.R : 0, x || er ? 0 : 0.35); break; }
    case 'epole': case 'rpole': {
      const r = Math.max(w / 2, 0.1), pr = z => poleR(el, z - z0), onG = z0 < 0.01;
      if (el.t === 'rpole') {
        const EP = sqr(c, Math.max(STD.encW, w + 0.16) / 2, rot);
        prism(sc, EP, z0, z0 + STD.encUp, lay);                    /* the concrete encasement: 0.406 m above the ground and 1.32 m below it */
        if (onG && !FLAT) { const zb = z0 - STD.encDn; sc.poly(EP.map(q => [q[0], q[1], zb]), hid, 1); for (const q of EP) sc.line([q[0], q[1], z0], [q[0], q[1], zb], hid); }
        if (!rg.risers.some(q => q.pole === el)) riserKit(sc, c, pipeSide(S, el), z0, z0 + Math.max(1.5, num(S.route.aerialH, STD.msg)), pr, lay);
        if (onG && !FLAT) { const zb = z0 - STD.poleIn, e = k => [c[0] + H[0] * k * r, c[1] + H[1] * k * r]; for (const k of [-1, 1]) sc.line([e(k)[0], e(k)[1], z0 - STD.encDn], [e(k)[0], e(k)[1], zb], hid); sc.line([e(-1)[0], e(-1)[1], zb], [e(1)[0], e(1)[1], zb], hid); }      /* the pole stands 1.5 m in the ground: its foot shows under the encasement */
        fp = EP;
      }
      frustum(sc, c, z0, z0 + h, r, r * 0.7, lay, 10); az = z0 + Math.min(h * 0.45, 4); break;
    }
    case 'ac': { if (!S.room) { prism(sc, elPoly(el), z0, z0 + h, lay); break; } const k = wallOf(S.site.L, S.site.W, el.x, el.y), hz = k.side === 'S' || k.side === 'N', q = [k.x + k.n[0] * (0.1 + d / 2), k.y + k.n[1] * (0.1 + d / 2)]; fp = rectAt(q, hz ? w : d, hz ? d : w, 0); prism(sc, fp, z0, z0 + h, lay); hp = [q[0], q[1], z0 + h];
      if (facing(sc, k.n) < 0) for (const z of [z0, z0 + h]) A.push({ k: 'ghost', lay: hid, pts: fp.map(p => [p[0], p[1], z]) });      /* behind a wall at the back: drawn dashed, as seen through it */
      break; }
    case 'rack': prism(sc, elPoly(el), z0, z0 + h, lay); rackFace(S, sc, el, z0, A, X); bx = { w, d, z0, z1: z0 + h, top: 1, sides: 'RBL' }; break;
    case 'port': {
      if (!S.room) { prism(sc, elPoly(el), z0, z0 + h, lay); bx = { w, d, z0, z1: z0 + h, top: 1, sides: 'FRBL' }; break; }
      const k = wallOf(S.site.L, S.site.W, el.x, el.y), tg = [Math.abs(k.n[1]), Math.abs(k.n[0])], hw2 = Math.max(0.1, w / 2), hh = Math.max(0.08, h / 2);
      const P = (q, z) => [k.x - k.n[0] * 0.006 + tg[0] * q, k.y - k.n[1] * 0.006 + tg[1] * q, z], ring = (q, z, r) => { const o = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; o.push(P(q + r * Math.cos(a), z + r * Math.sin(a))); } return o; };
      const pts = [P(-hw2, z0 - hh), P(hw2, z0 - hh), P(hw2, z0 + hh), P(-hw2, z0 + hh)];
      sc.poly(pts, lay, 1); for (let i = -1; i <= 1; i++) for (const j of [-1, 1]) sc.poly(ring(i * hw2 * 0.6, z0 + j * hh * 0.45, Math.min(0.045, hh * 0.3)), 'dt', 1);
      if (facing(sc, k.n) > 0) sc.line(P(0, z0 - hh), P(0, 0.12), hid);          /* its wall is cut away in this view: a dashed line shows where on the wall it is */
      A.push({ k: 'el', id: el.id, key: el.id, kind: 'lead', p: P(0, z0 - hh), s: elLabel(S, el), st: el.st, fp: sqr([k.x - k.n[0] * 0.1, k.y - k.n[1] * 0.1], 0.1, 0), z: 0, pts, edit: 'z', hp: P(0, z0 + hh) }); return;
    }
    case 'odf': case 'runit': {
      const rh = rackHost(S, el); if (rh && (rh.t === 'rack' || num(rh.h, 0) > 0.8)) return;                     /* drawn with its rack or cabinet, at its own rack units */
      const host = hostOf(S, c, el);
      if (host) { const zh = baseZ(S, host) + num(host.h, 0) + 0.004, P = elPoly(el).map(q => [q[0], q[1], zh]); sc.poly(P, lay, 1); sc.line(P[0], P[2], lay); sc.line(P[1], P[3], lay); A.push({ k: 'el', id: el.id, key: el.id, kind: 'lead', p: [el.x, el.y, zh], s: elLabel(S, el), st: el.st, fp: elPoly(host), z: baseZ(S, host), pts: null }); return; }
      prism(sc, elPoly(el), z0, z0 + h, lay); faceRect(sc, el, 'F', -w / 2 + 0.04, w / 2 - 0.04, z0 + 0.04, z0 + h - 0.04, lay); bx = { w, d, z0, z1: z0 + h, top: 1, sides: 'RBL' }; break;
    }
    case 'clo': {
      const r = Math.max(0.06, Math.min(d, h) / 2), m = cloMount(S, rg, el);
      if (m) {                                                       /* on its pole: upright on the side of the pole, above the loop in its holder */
        domeClosure(sc, m.c, m.z, lay); if (X.cm) X.cm.push({ c: m.c, z: m.z, at: [m.pole.x, m.pole.y] });
        A.push({ k: 'el', id: el.id, key: el.id, kind: 'lead', p: [m.c[0], m.c[1], m.z + STD.cloH * 0.6], s: elLabel(S, el), st: el.st, fp: sqr(m.c, 0.15, 0), z: m.z, pts: cloPts(m.c, m.z) }); return;
      }
      const pit = pitAt(S, c);
      if (pit) {                                                     /* in a hand hole or service box: on its floor, below ground */
        const zf = baseZ(S, pit) - Math.max(0.1, num(pit.dp, UGD)) + r + 0.05, ring = sx => { const P = []; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, q = lp(sx, r * Math.cos(a)); P.push([q[0], q[1], zf + r * Math.sin(a)]); } return P; }, A0 = ring(-w / 2), A1 = ring(w / 2);
        sc.poly(A0, hid, 1); sc.poly(A1, hid, 1); for (const i of [0, 5]) sc.line(A0[i], A1[i], hid); for (const i of [2, 7]) sc.line(A0[i], A1[i], hid);
        A.push({ k: 'el', id: el.id, key: el.id, kind: 'lead', p: [el.x, el.y, zf], s: elLabel(S, el), st: el.st, fp: elPoly(el), z: zf - r, pts: A0.concat(A1) }); return;
      }
      hcyl(sc, el, -w / 2, w / 2, z0 + r, r, lay); hcyl(sc, el, -w / 2 - 0.05, -w / 2, z0 + r, r * 0.55, lay); hcyl(sc, el, w / 2, w / 2 + 0.05, z0 + r, r * 0.55, lay); az = z0 + 2 * r; top = az; edit = 'z'; hp = [el.x, el.y, z0 + 2 * r]; break;
    }
    case 'enc': { const P = rectAt(c, w * 0.7, d * 0.7, rot).map(q => [q[0], q[1], z0 + h + 0.004]); prism(sc, elPoly(el), z0, z0 + h, lay); sc.poly(P, lay, 1); bx = { w, d, z0, z1: z0 + h, top: 1, sides: 'FRBL' }; break; }
    default: prism(sc, elPoly(el), z0, z0 + h, lay); bx = { w, d, z0, z1: z0 + h, top: 1, sides: 'FRBL' };
  }
  /* what the label needs: where the element stands, and the space it fills */
  const pts = fp.map(q => [q[0], q[1], z0]).concat(extra.length ? extra : fp.map(q => [q[0], q[1], top]));
  if (isPole(el) && (rg.risers.some(q => q.pole === el) || rg.loops.some(q => Math.hypot(q.at[0] - el.x, q.at[1] - el.y) < 0.45))) for (let i = sid0 + 1; i <= sc.sid; i++) sc.thru.add(i);
  const axis = el.t === 'epole' || el.t === 'rpole' ? [[el.x, el.y, z0 + 0.4], [el.x, el.y, z0 + h]] : null;
  A.push({ k: 'el', grp: nameGrp(el), title: titleTower(S) === el && !el.name, id: el.id, key: el.id, kind: bx ? 'box' : axis ? 'axis' : flat || isT ? 'ground' : 'lead', box: bx, ladP, cx: el.x, cy: el.y, rot, p: [el.x, el.y, az], s: elLabel(S, el), st: el.st, fp, z: el.t === 'clo' ? zg : z0, pts, flat, axis, r: el.t === 'rpole' ? 0.5 : Math.max(el.w, 0.2) * 0.75, edit, hp });
}

/* ---------- drawn runs: cable ladder, conduit pipe, concrete-encased conduit, open trench ---------- */
/* an open trench is an excavation: its two edges at ground level, and its depth below, dashed where the ground covers it */
function trenchIso(S, r, sc, lay, wd) {
  const dp = runDepthD(r), hid = r.st === 'P' ? 'hp' : 'hd';
  for (const P of outsidePits(S, r.pts)) {                 /* not inside a hand hole or a service box: the trench stops at its wall and starts again behind it */
    const n = P.length, A1 = offsetPath(P, wd / 2), A2 = offsetPath(P, -wd / 2);
    const T1 = A1.map((q, i) => [q[0], q[1], groundZ(S, P[i]) + 0.004]), T2 = A2.map((q, i) => [q[0], q[1], groundZ(S, P[i]) + 0.004]);
    sc.poly(T1, lay); sc.poly(T2, lay); sc.line(T1[0], T2[0], lay); sc.line(T1[n - 1], T2[n - 1], lay);
    if (!FLAT) for (let i = 0; i + 1 < n; i++) sc.pit([T1[i], T1[i + 1], T2[i + 1], T2[i]], dp, lay, hid, { open: [0, i + 2 < n, 0, i > 0], noV: [i > 0, 0, 0, i > 0] });
  }
}
/* beta 4.2: how high the top of a base pad stands above the ground at a point; 0 where there is none */
function padH(S, p) { for (const q of S.els) if (q.t === 'pad' && inPoly(p, elPoly(q))) return Math.max(0, num(q.h, 0)); return 0; }
function isoRun(S, r, sc, A, O, rg) {
  const P = r.pts, K = RUNS[r.kind] || RUNS.ladder, lay = runLayer(r), wd = Math.max(0.05, num(r.w, K.w)), hw = wd / 2, ug = buried(r), dpR = runDepthD(r), hid = r.st === 'P' ? 'hp' : 'hd', zo = ug ? 0 : Math.max(0, num(r.z, K.z)) + ladBase(S, r); if (!P || P.length < 2) return;      /* (19:25: a ladder stands on the base pad it runs over) */
  const hulls = S.els.map(e => ({ e, h: towerHull(e) })).filter(q => q.h), inTower = q => hulls.find(t => inPoly(q, t.h));
  let zl = 0, ln = [0, 1], best = 0, bi = 0;
  if (r.kind === 'trench') trenchIso(S, r, sc, lay, wd);
  if (r.kind === 'ladder') {                              /* two rails and the rungs between them, round each bend in one piece; then what holds it up */
    const ST = ladPath(r), Wk = ladWalk(ST, hw), zs = ST.map(q => groundZ(S, q.p) + zo), zAt = q => zs[q.i] + (zs[q.i + 1] - zs[q.i]) * q.t;
    for (const sg of [-1, 1]) for (const dz of [0, -0.07]) sc.poly(ST.map((q, i) => [q.p[0] + q.n[0] * q.k * hw * sg, q.p[1] + q.n[1] * q.k * hw * sg, zs[i] + dz]), lay);
    if (!S.room && zo > 0.25 && nameOn(S, 'shade')) {     /* beta 4.2: where a raised ladder passes over a base pad, its outline on the pad. On the isometric a raised ladder shows away from what it stands over. */
      const pads = S.els.filter(e => e.t === 'pad').map(e => { const P = elPoly(e).map(q => [q[0], q[1]]); let ar = 0; for (let j = 0; j < P.length; j++) { const a = P[j], b = P[(j + 1) % P.length]; ar += a[0] * b[1] - b[0] * a[1]; } if (ar < 0) P.reverse(); return { P, z: groundZ(S, [e.x, e.y]) + Math.max(0, num(e.h, 0)) + 0.004 }; });
      const on = (a, b) => { for (const pd of pads) { const c = clipConvex(a, b[0] - a[0], b[1] - a[1], pd.P); if (c && (c[1] - c[0]) * Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.02) sc.line([a[0] + (b[0] - a[0]) * c[0], a[1] + (b[1] - a[1]) * c[0], pd.z], [a[0] + (b[0] - a[0]) * c[1], a[1] + (b[1] - a[1]) * c[1], pd.z], 'dt'); } };
      if (pads.length) { const E = [-1, 1].map(sg => ST.map(q => [q.p[0] + q.n[0] * q.k * hw * sg, q.p[1] + q.n[1] * q.k * hw * sg])); for (const L2 of E) for (let i = 0; i + 1 < L2.length; i++) on(L2[i], L2[i + 1]); on(E[0][0], E[1][0]); on(E[0][E[0].length - 1], E[1][E[1].length - 1]);
        const nr = Math.max(1, Math.round(Wk.tot / 0.4)); for (let k = 1; k < nr; k++) { const q = Wk.at(k * Wk.tot / nr); on([q.p[0] + q.v[0], q.p[1] + q.v[1]], [q.p[0] - q.v[0], q.p[1] - q.v[1]]); } }
    }
    const nr = Math.max(1, Math.round(Wk.tot / 0.4)); for (let k = 0; k <= nr; k++) { const q = Wk.at(k * Wk.tot / nr), z = zAt(q); sc.line([q.p[0] + q.v[0], q.p[1] + q.v[1], z], [q.p[0] - q.v[0], q.p[1] - q.v[1], z], lay); }
    /* supports at both ends and at the middle of each corner, and between those no further apart than 3 m (2 m for the rods of a ladder indoors) */
    const B = [0]; ST.forEach((q, i) => { if (q.c) B.push(Wk.D[i]); }); B.push(Wk.tot);
    const hold = q => {
      const zz = zAt(q), gz = groundZ(S, q.p) + (S.room ? 0 : padH(S, q.p));      /* (beta 4.2: on a base pad the support stands on the pad) */
      if (S.room) { const zc = Math.max(zz + 0.15, num(S.site.fh, 2.8)); for (const sg of [-1, 1]) sc.line([q.p[0] + q.v[0] * sg, q.p[1] + q.v[1] * sg, zz], [q.p[0] + q.v[0] * sg, q.p[1] + q.v[1] * sg, zc], 'dt'); }
      else if (!inTower(q.p) && zz - gz > 0.3) { if (O) O.push({ post: [[q.p[0], q.p[1], gz], [q.p[0], q.p[1], zz]] }); tube(sc, [q.p[0], q.p[1], gz], [q.p[0], q.p[1], zz - 0.07], 0.035, 0.035, lay, 6); sc.line([q.p[0] + q.v[0], q.p[1] + q.v[1], zz - 0.07], [q.p[0] - q.v[0], q.p[1] - q.v[1], zz - 0.07], lay); sc.poly(sqr(q.p, 0.12, 0).map(t => [t[0], t[1], gz + 0.004]), lay, 1); }
    };
    for (let j = 0; j + 1 < B.length; j++) { const span = B[j + 1] - B[j], m = Math.max(1, Math.ceil(span / (S.room ? 2 : 3) - 1e-6)); for (let k = j ? 1 : 0; k <= m; k++) hold(Wk.at(B[j] + span * k / m)); }
  }
  else if (ug && r.kind === 'conduit') {                  /* buried: two pipes, one on top of the other. Three lines: under the lower pipe, where the two touch, over the upper one */
    const g0 = groundZ(S, P[0]), zb = g0 - dpR, Q = P.map(q => [q[0], q[1]]);
    /* where the cable leaves it round a bend (up a riser pole, out at an exit conduit) the bend is drawn with the cable: the straight pipe stops where the bend begins */
    for (const end of [0, 1]) {
      const i0 = end ? Q.length - 1 : 0, i1 = end ? Q.length - 2 : 1, E = Q[i0], N = Q[i1], len = Math.hypot(N[0] - E[0], N[1] - E[1]); if (!rg || len < 0.1) continue;
      const d = [(N[0] - E[0]) / len, (N[1] - E[1]) / len], v = rg.verts.find(q => q.R > 0.05 && q.u && q.u[0] * d[0] + q.u[1] * d[1] > 0.95 && Math.hypot(q.at[0] - E[0], q.at[1] - E[1]) < 0.7 && q.z0 < g0 - 0.2);
      const xe = v ? null : S.els.find(e => e.t === 'exit' && Math.hypot(e.x - E[0], e.y - E[1]) < 0.5 && !rg.exits.some(q => q.el === e.id));      /* an exit conduit that no cable uses yet has its bend too */
      const cut = v ? (v.at[0] - E[0]) * d[0] + (v.at[1] - E[1]) * d[1] + v.R : xe ? (xe.x - E[0]) * d[0] + (xe.y - E[1]) * d[1] + bendR(dpR - STD.hdpe / 2) : 0; if (cut > 0 && cut < len - 0.02) Q[i0] = [E[0] + d[0] * cut, E[1] + d[1] * cut];
    }
    for (const Q2 of outsidePits(S, Q)) {                 /* it stops at the wall of a hand hole or service box */
      for (const k of runN(r) === 1 ? [0, 1] : [0, 1, 2]) sc.poly(Q2.map(q => [q[0], q[1], zb + k * wd]), hid);      /* (19:25: one run, one pipe) */
      for (const q of [Q2[0], Q2[Q2.length - 1]]) sc.line([q[0], q[1], zb], [q[0], q[1], zb + (runN(r) === 1 ? 1 : 2) * wd], hid);
    }
  }
  else if (ug && r.kind !== 'trench') {                   /* a buried pipe: its two edges, joined round the corners */
    const g0 = groundZ(S, P[0]), zt = g0 - dpR + wd, E = [offsetPath(P, hw), offsetPath(P, -hw)];
    for (const e of E) { sc.poly(e.map(q => [q[0], q[1], zt]), hid); if (r.kind === 'encase') sc.poly(e.map(q => [q[0], q[1], g0 - dpR]), hid); }
    sc.line([E[0][0][0], E[0][0][1], zt], [E[1][0][0], E[1][0][1], zt], hid); sc.line([E[0][E[0].length - 1][0], E[0][E[0].length - 1][1], zt], [E[1][E[1].length - 1][0], E[1][E[1].length - 1][1], zt], hid);
  }
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue; if (len > best) { best = len; bi = i; }
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy * hw, ny = ux * hw, g = groundZ(S, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), zz = g + zo;
    if (r.kind === 'ladder' || (ug && r.kind !== 'trench')) { /* drawn above, in one piece */ }
    else if (r.kind === 'conduit') {
      const rr = Math.max(0.02, hw), zc = zz + 3 * rr; for (const k of runN(r) === 1 ? [1] : [1, 3]) tube(sc, [a[0], a[1], zz + k * rr], [b[0], b[1], zz + k * rr], rr, rr, lay, 8);      /* two pipes, one on top of the other */
      if (zo > 0.3) { const m = Math.max(1, Math.ceil(len / 2.5)); for (let k = 0; k <= m; k++) { const t = k * len / m; if (O) O.push({ post: [[a[0] + ux * t, a[1] + uy * t, g], [a[0] + ux * t, a[1] + uy * t, zc]] }); sc.line([a[0] + ux * t, a[1] + uy * t, g], [a[0] + ux * t, a[1] + uy * t, zc - rr], lay); } }
    }
    else if (r.kind === 'encase') prism(sc, [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], zz, zz + 0.12, lay);
    else if (r.kind === 'part') {                          /* a partition wall, floor to ceiling, drawn as its outline: it hides nothing behind it */
      const fh = Math.max(1.5, num(S.site.fh, 2.8));
      for (const sg of [-1, 1]) { const A2 = [a[0] + nx * sg, a[1] + ny * sg], B2 = [b[0] + nx * sg, b[1] + ny * sg]; sc.line([A2[0], A2[1], 0.004], [B2[0], B2[1], 0.004], lay); sc.line([A2[0], A2[1], fh], [B2[0], B2[1], fh], lay); for (const q of [A2, B2]) sc.line([q[0], q[1], 0], [q[0], q[1], fh], lay); }
      for (const q of [a, b]) sc.line([q[0] + nx, q[1] + ny, fh], [q[0] - nx, q[1] - ny, fh], lay);
      if (O) O.push({ post: [[a[0], a[1], fh], [b[0], b[1], fh]], w: 0.1 });
    }
    zl = zz; ln = [nx, ny];
  }
  /* a ladder that reaches a lattice tower joins the tower's own ladder, which stands where it arrives (towerLad) */
  const a = P[bi], b = P[bi + 1], below = ug && r.kind !== 'trench', g = groundZ(S, a) + (below ? (r.kind === 'conduit' ? 2 * wd : wd) - dpR : zo + (r.kind === 'conduit' ? 2 * wd : 0)), dp = runDepth(r);
  A.push({ k: 'seg', grp: r.kind === 'ladder' ? 'ladder' : null, id: r.id, key: r.id, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, g], s: runName(S, r), st: r.st, a: [a[0], a[1], g], b: [b[0], b[1], g], gap: wd / 2 + 0.25, run: r, edit: ug ? (FLAT ? null : 'dp') : 'z', hp: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r.kind === 'trench' ? groundZ(S, a) - dp : g] });
}

/* ---------- the isometric drawing, with its labels ---------- */
/* places on the ground around a footprint, text running along the 30 degree axes */
function isoCands(sc, fp, z, gap, zt) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of fp) { const r = sc.R([q[0], q[1], z]); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); }
  const P = (x, y) => proj([x, y, z]), Q = (x, y) => proj([x, y, zt == null ? z : zt]);
  /* the four sides of the footprint, nearest the viewer first: text runs along the side, just outside it */
  const E = [[P(x0, y0), P(x1, y0), [-0.5, -C30]], [P(x1, y0), P(x1, y1), [0.5, -C30]], [P(x0, y1), P(x1, y1), [0.5, C30]], [P(x0, y0), P(x0, y1), [-0.5, C30]]];
  const E2 = [[Q(x0, y0), Q(x1, y0), [-0.5, -C30]], [Q(x1, y0), Q(x1, y1), [0.5, -C30]], [Q(x0, y1), Q(x1, y1), [0.5, C30]], [Q(x0, y0), Q(x0, y1), [-0.5, C30]]];
  return (w, h) => {
    const o = [];
    for (let j = 0; j < 3; j++) for (const e of E) { const d = gap + h / 2 + j * h * 0.9, a = readable(Math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0]) / D2R); for (const t of j ? [0.5] : [0.5, 0.2, 0.8]) o.push({ p: [e[0][0] + (e[1][0] - e[0][0]) * t + e[2][0] * d, e[0][1] + (e[1][1] - e[0][1]) * t + e[2][1] * d], a }); }
    /* or on the thing itself, along an edge, where nothing stands on it */
    for (const e of E2) { const d = -(gap + 0.1 + h / 2), a = readable(Math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0]) / D2R), l = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]); if (w < l * 0.92) for (const t of [0.5, 0.25, 0.75]) { const tt = clamp(t, w / 2 / l + 0.04, 1 - w / 2 / l - 0.04); o.push({ p: [e[0][0] + (e[1][0] - e[0][0]) * tt + e[2][0] * d, e[0][1] + (e[1][1] - e[0][1]) * tt + e[2][1] * d], a }); } }
    return o;
  };
}
const ISO_ANG = [60, 120, -60, -120, 45, 135, -45, -135, 75, 105, -75, -105, 15, 165, -15, -165];
/* the faces of a box-shaped item that a name can be written on, like a sticker: the sides that look at the viewer, widest first, then the top */
function faceFrames(sc, a) {
  const bx = a.box, el = { x: a.cx, y: a.cy, w: bx.w, d: bx.d, rot: a.rot || 0 }, out = [];
  const front = n => { const r = sc.R([sc.cx + n[0], sc.cy + n[1], 0]); return (r[0] - sc.cx) - (r[1] - sc.cy); };
  for (const side of bx.sides || '') {
    const n = rot2(side === 'R' ? 1 : side === 'L' ? -1 : 0, side === 'F' ? -1 : side === 'B' ? 1 : 0, el.rot), f = front(n); if (f < 0.05) continue;
    out.push({ len: side === 'F' || side === 'B' ? bx.w : bx.d, ht: bx.z1 - bx.z0, f, pt: (s, t) => onFace(el, side, s, (bx.z0 + bx.z1) / 2 + t) });
  }
  out.sort((p, q) => q.len * (0.6 + 0.4 * q.f) - p.len * (0.6 + 0.4 * p.f));
  if (bx.top) {
    const zt = (bx.zt != null ? bx.zt : bx.z1) + 0.004, tw = bx.tw || bx.w, td = bx.td || bx.d;
    const T = [{ len: tw, ht: td, top: 1, pt: (s, t) => { const q = loc(el, s, t); return [q[0], q[1], zt]; } }, { len: td, ht: tw, top: 1, pt: (s, t) => { const q = loc(el, -t, s); return [q[0], q[1], zt]; } }];
    T.sort((p, q) => q.len - p.len); out.push(T[0], T[1]);
  }
  return out;
}
/* how a face lies on the drawing: U along the text, V up from it, and whether its own directions had to be turned for the text to read left to right */
function frameBasis(sc, fr) {
  const c = sc.P(fr.pt(0, 0)), u1 = sc.P(fr.pt(1, 0)), v1 = sc.P(fr.pt(0, 1)); let ss = 1, ts = 1, U = [u1[0] - c[0], u1[1] - c[1]], V = [v1[0] - c[0], v1[1] - c[1]];
  if (U[0] < -1e-9 || (Math.abs(U[0]) < 1e-9 && U[1] < 0)) { ss = -1; U = [-U[0], -U[1]]; }
  if (U[0] * V[1] - U[1] * V[0] < 0) { ts = -1; V = [-V[0], -V[1]]; }
  return { U, V, ss, ts };
}
/* take away the parts of drawn lines that lie under a sticker */
function clipOut(prims, quads) {
  if (!quads.length) return prims;
  const Q = quads.map(q => { let ar = 0; for (let j = 0; j < q.length; j++) { const a = q[j], b = q[(j + 1) % q.length]; ar += a[0] * b[1] - b[0] * a[1]; } return { q: ar < 0 ? q.slice().reverse() : q, b: polyBox(q) }; }), out = [];
  for (const p of prims) {
    if (p.k !== 'pl' || p.pts.length !== 2) { out.push(p); continue; }
    let segs = [p.pts], cut = false;
    for (const c of Q) {
      const nx = [];
      for (const sg of segs) {
        const A = sg[0], B = sg[1];
        if (Math.max(A[0], B[0]) < c.b[0] || Math.min(A[0], B[0]) > c.b[2] || Math.max(A[1], B[1]) < c.b[1] || Math.min(A[1], B[1]) > c.b[3]) { nx.push(sg); continue; }
        const dx = B[0] - A[0], dy = B[1] - A[1], t = clipConvex(A, dx, dy, c.q); if (!t) { nx.push(sg); continue; }
        cut = true; if (t[0] > 1e-6) nx.push([A, [A[0] + dx * t[0], A[1] + dy * t[0]]]); if (t[1] < 1 - 1e-6) nx.push([[A[0] + dx * t[1], A[1] + dy * t[1]], B]);
      }
      segs = nx;
    }
    if (!cut) out.push(p); else for (const sg of segs) { const pr = { k: 'pl', pts: sg, lay: p.lay, close: false }; if (p.g) pr.g = p.g; out.push(pr); }
  }
  return out;
}
/* keep only the parts of drawn lines that lie inside a box [x0, y0, x1, y1] */
function clipIn(prims, B) {
  const out = [];
  for (const p of prims) {
    if (p.k !== 'pl' || p.pts.length !== 2) continue;
    const A = p.pts[0], dx = p.pts[1][0] - A[0], dy = p.pts[1][1] - A[1]; let t0 = 0, t1 = 1, ok = true;
    for (const [pp, qq] of [[-dx, A[0] - B[0]], [dx, B[2] - A[0]], [-dy, A[1] - B[1]], [dy, B[3] - A[1]]]) { if (Math.abs(pp) < 1e-12) { if (qq < 0) { ok = false; break; } } else { const r = qq / pp; if (pp < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } } }
    if (ok && t1 - t0 > 1e-6) out.push({ k: 'pl', pts: [[A[0] + dx * t0, A[1] + dy * t0], [A[0] + dx * t1, A[1] + dy * t1]], lay: p.lay, close: false });
  }
  return out;
}
/* o.labels: false leaves the names out. o.short: a small screen, where a note that finds no room close to its item is left out.
   o.box: [width, height] the drawing and its labels may take. o.rect: the part of the drawing that is in view.
   Labels are dynamic: each belongs to its item and finds its place again whenever the item moves.
     box-shaped items   the name is written on the body, like a sticker, on a face that can be seen
     lines and poles    the name runs along the item, right beside it
     pits, towers       the name lies on the ground beside the item, in the isometric angle
     small items        a short leader
   A label the user dragged stays where it was put, measured from its item. */
/* What is buried is drawn at ground level, as on the hand-made plans, unless the site asks for its depth (FLAT, see runDepthD). */
function buildIso(S, o) { const was = FLAT; FLAT = flatOn(S); try { return buildIso0(S, o); } finally { FLAT = was; } }
function buildIso0(S, o) {
  o = o || {}; const si = S.site, L = si.L, W = si.W, one = o.only ? S.els.find(e => e.id === o.only) || null : null, X = { detail: !!(S.room || one), only: one, cm: [] };
  const sc = new Scene(one ? detailK(one, o.turn) : (S.iso || 0), L / 2, W / 2), A3 = [], O3 = [];
  const th = (o.th || (one ? 0.05 : clamp(Math.max(L, W) / 50, S.room ? 0.06 : 0.25, 1.6))) * txK(S), lab = o.labels !== false, VK = 'i' + sc.k, P3 = p => sc.P(p), tl = s => s === 'P' ? 'tp' : s === 'L' ? 'ln' : 'tx';
  const rg = one ? routeGeom({ site: si, gates: [], els: [], runs: [], route: {} }) : routeGeom(S);
  const rgT = one || !FLAT ? rg : (() => { FLAT = false; try { return routeGeom(S); } finally { FLAT = true; } })();      /* the lengths written on the drawing are the real ones, depth and all */
  const rgC = one && !S.room ? routeGeom(S) : null; if (one) X.port = cabPort(S, one, o.around === false ? null : rgC);
  const BN = blockNames(S), gq = ++GSEQ, gk = k => (k || 'ITEM') + '|' + gq;      /* (19:25) the lines of every item carry the name of its block */
  if (one) { sc.own = gk(BN[one.id]); isoEl(S, one, sc, A3, rg, X); sc.own = null; }          /* one cabinet alone, enlarged, its door open */
  if (one) { /* beta 4.2: what stands round it is drawn below, from the whole plan */ }
  else {
  sc.own = gk('SITE'); isoGround(S, sc, A3, O3);
  for (const el of S.els) if (el.t === 'pad' && !hidEl(S, el)) { sc.own = gk(BN[el.id]); isoEl(S, el, sc, A3, rg, X); }      /* (14 Nov) what the user has hidden is not drawn */
  for (const el of S.els) if (el.t !== 'pad' && !hidEl(S, el)) { sc.own = gk(BN[el.id]); isoEl(S, el, sc, A3, rg, X); }
  for (const r of S.runs) if (!r.hid) { sc.own = gk(BN[r.id]); isoRun(S, r, sc, A3, O3, rg); }
  sc.own = null;
  /* a buried piece of the UG cable with no conduit drawn under it still lies in one: two pipes, one on top of the other, drawn as for a drawn conduit. In an open trench they lie in the open, so in full lines. */
  if (!FLAT) for (const k of ownConduit(rg)) { const zb = k.l.za - STD.hdpe / 2, lay = k.st === 'E' ? (k.open ? 'ex' : 'hd') : k.open ? 'pp' : 'hp'; for (const Q of outsidePits(S, [k.a, k.b])) for (const j of [0, 1, 2]) sc.line([Q[0][0], Q[0][1], zb + j * STD.hdpe], [Q[Q.length - 1][0], Q[Q.length - 1][1], zb + j * STD.hdpe], lay); }
  /* what the app adds for the UG fiber: exit conduits, the riser pipe on the pole with its bend, the closure where AE and UG meet */
  rg.exits.forEach((x, i) => {
    if (x.el) return; const key = 'exit' + i, q = rectAt(exitMid(x.at, x.u), STD.exitW, STD.exitW, Math.atan2(x.u[1], x.u[0]) / D2R);
    exitStub(sc, x.at, x.g, x.h, q, x.st === 'P' ? 'pp' : 'ex', x.st === 'P' ? 'hp' : 'hd', x.u, x.dp, x.R);
    A3.push({ k: 'el', key, kind: 'lead', p: [x.at[0], x.at[1], x.g + x.h], s: labText(S, key, x.st === 'P' ? 'PROPOSED RISER PIPE' : 'EXIT CONDUIT'), st: x.st, fp: q, z: x.g, pts: q.map(t => [t[0], t[1], x.g]).concat(q.map(t => [t[0], t[1], x.g + x.h])) });
  });
  for (const r of rg.risers) {
    const s0 = sc.sid, pl = r.pole, zp = baseZ(S, pl);
    r.K = riserKit(sc, [pl.x, pl.y], r.s || r.u, r.g, r.z1 - CLOZ, z => poleR(pl, z - zp), 'pp');
    if (r.dp > 0.2 && r.R > 0.05) elbow2(sc, r.at, r.g, r.dp, r.R, r.u, 'hp', 0);
    for (let i = s0 + 1; i <= sc.sid; i++) sc.thru.add(i);
  }
  for (const j of rg.joins) if (j.auto) {
    const ck = 'clo' + (j.ck || ''); domeClosure(sc, j.c, j.z, 'pp'); X.cm.push({ c: j.c, z: j.z, at: [j.pole.x, j.pole.y] });
    A3.push({ k: 'el', key: ck, kind: 'lead', p: [j.c[0], j.c[1], j.z + STD.cloH * 0.6], s: labText(S, ck, 'PROPOSED CLOSURE'), st: 'P', fp: sqr(j.c, 0.15, 0), z: j.z, pts: cloPts(j.c, j.z) });
  }
  }
  const R0 = sc.render(), GT = new Gfx(), LB = new Labeler(GT), FB = [], fibP = [], fibH = [], legs2 = [], far = [], quads = []; let skipped = 0, strict = 0;
  let CTX = [], fb = null;
  if (one) { const pts = []; for (const p of R0) if (p.k === 'pl') for (const q of p.pts) pts.push(q); if (pts.length > 2) fb = polyBox(pts);
    if (fb && !S.room && o.around !== false) {
      const sc2 = new Scene(sc.k, L / 2, W / 2), T = [], hq = [hull(pts)], DASH = { hd: 1, hp: 1, nd: 1, np: 1, fh: 1 };
      isoGround(S, sc2, T, T);
      for (const el of S.els) if (el !== one && el.t === 'pad' && !el.hid) isoEl(S, el, sc2, [], rgC, { ref: 1, cm: [] });
      for (const el of S.els) if (el !== one && el.t !== 'pad' && !el.hid && !(inRack(el) && rackHost(S, el))) isoEl(S, el, sc2, [], rgC, { ref: 1, cm: [] });
      for (const r of S.runs) if (!r.hid) isoRun(S, r, sc2, T, T, rgC);
      CTX = clipOut(sc2.render().filter(p => p.k === 'pl' && p.pts.length === 2 && !DASH[p.lay]).map(p => ({ k: 'pl', pts: p.pts, lay: 'dt', close: false })), hq);
      const cab = cabEntry(S, one, rgC), fl = [];            /* the cable of the plan, in its colour, up to where it goes into this cabinet; what the cabinet hides of it is dashed, as on the plan of the whole site */
      const put3 = (a, b, lay, hid) => { const p = P3(a), q = P3(b), dx = q[0] - p[0], dy = q[1] - p[1]; if (Math.abs(dx) + Math.abs(dy) < 1e-6) return; let t = 0; const at = k => [p[0] + dx * k, p[1] + dy * k], pc = (k0, k1, ly) => { if (k1 - k0 > 1e-5 && ly) fl.push({ k: 'pl', pts: [at(k0), at(k1)], lay: ly, close: false }); };
        for (const v of sc.shown(sc.R(a), sc.R(b), 0, sc.thru)) { pc(t, v[0], hid); pc(v[0], v[1], lay); t = v[1]; } pc(t, 1, hid); };      /* hid: the layer of the pieces that the cabinet hides; none: they are left out */
      /* beta 4.2 (22:24): only the cable of this cabinet is drawn here: the way to its entry (the pieces the route made for it) and, before that, a short piece
         that shows where it comes from. The rest of the plan's cable is left out: round an opened cabinet it only crossed the picture. Inside, the cabinet draws it. */
      if (cab && cab.hop) {
        const own = rgC.legs.filter(l => l.hop === one.id && !l.inside), i0 = own.length ? rgC.legs.indexOf(own[0]) : -1, pv = i0 > 0 ? rgC.legs[i0 - 1] : null;
        if (pv && !pv.inside && !pv.hop && pv.len > 0.05) { const k = Math.max(0, 1 - 0.6 / pv.len), a = [pv.a[0] + (pv.b[0] - pv.a[0]) * k, pv.a[1] + (pv.b[1] - pv.a[1]) * k, pv.za + (pv.zb - pv.za) * k]; put3(a, [pv.b[0], pv.b[1], pv.zb], LEG[pv.type].lay, null); }
        for (const l of own) put3([l.a[0], l.a[1], l.za], [l.b[0], l.b[1], l.zb], LEG[l.type].lay, null);
        for (const v of rgC.verts) { const zr = cab.port.z0 + cab.port.h, ly = LEG[v.type] ? LEG[v.type].lay : 'ug';
          if (v.inside || cab.inside(v.at)) { if (!v.inside && v.z1 > zr + 0.01) put3([v.at[0], v.at[1], Math.max(v.z0, zr)], [v.at[0], v.at[1], v.z1], ly, null); }      /* over the cabinet: only what is above the roof */
          else if (v.hop === one.id) put3([v.at[0], v.at[1], v.z0], [v.at[0], v.at[1], v.z1], ly, null); }
      }
      CTX = CTX.concat(cab && cab.cut ? fl : clipOut(fl, hq));
      if (o.clip) {                                        /* on a sheet. (beta 4.2: the plan round the cabinet fills the whole place of the detail, up to its edges; only a band at the top is left for the title) */
        const cx = (fb[0] + fb[2]) / 2, cy = (fb[1] + fb[3]) / 2, m = Math.max(fb[2] - fb[0], fb[3] - fb[1]) * 0.45, bw = o.box && o.box[0] > 0 ? o.box[0] * 0.97 : 0, bh = o.box && o.box[1] > 0 ? o.box[1] * 0.97 : 0;
        CTX = clipIn(CTX, bw && bh ? [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2 - bh * 0.09] : [fb[0] - m, fb[1] - m * 0.5, fb[2] + m, fb[3] + m * 0.35]); }
    }
  }
  const pics = []; if (!one && !S.room && o.pics !== false) (S.photos || []).forEach((ph, i) => { const q = ph.ci; if (!q || !isFinite(q.tx) || !isFinite(q.ty)) return; const t2 = P3([num(q.tx, 0), num(q.ty, 0), num(q.tz, 0)]); picOn(LB, ph, i, [t2[0] + num(q.ox, 0), t2[1] + num(q.oy, 0)], t2, picW(S, q), th, pics); });      /* beta 4.1: the photos set on the isometric */
  for (const a of A3) if (a.k === 'ghost') FB.push({ k: 'pl', pts: a.pts.map(P3), lay: a.lay, close: true });      /* something on a far wall, shown through what stands in front */
  for (const a of A3) if (a.k === 'mark') {                 /* small figures written on a face: the numbers of the rack units */
    const fr = { pt: (q, t) => onFace(a.el, 'F', a.u + q, a.z + t) }; if (!sc.seen(fr.pt(0, 0))) continue;
    const B = frameBasis(sc, fr), ul = Math.hypot(B.U[0], B.U[1]) || 1, bb = (-B.V[0] * B.U[1] + B.V[1] * B.U[0]) / ul, c = sc.P(fr.pt(0, 0));
    GT.tx([c[0] - B.V[0] * a.h / 2, c[1] - B.V[1] * a.h / 2], a.s, a.h, 'dm', 'c', 0, false, [B.U[0] / ul * bb, B.U[1] / ul * bb, B.V[0], B.V[1]]);
  }
  /* What stands inside a cabin shows through its walls, dashed: each rack and the ODF at its rack units as a box (the edges a solid box would show), and the cable from the porthole to the ODF. */
  const inLab = [];
  if (!S.room && !one) for (const el of S.els) if (el.t === 'cabin' && !el.hid) {
    const C = cabinInside(S, el); if (!C) continue;
    const box = (poly, z0, z1, lay) => {
      const n = poly.length, B = poly.map(q => P3([q[0], q[1], z0])), T = poly.map(q => P3([q[0], q[1], z1])), c = [0, 0], up = new Set(); for (const q of poly) { c[0] += q[0] / n; c[1] += q[1] / n; }
      FB.push({ k: 'pl', pts: T, lay, close: true });
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, m = [(poly[i][0] + poly[j][0]) / 2 - c[0], (poly[i][1] + poly[j][1]) / 2 - c[1]]; if (facing(sc, m) > 0) { FB.push({ k: 'pl', pts: [B[i], B[j]], lay, close: false }); up.add(i); up.add(j); } }
      for (const i of up) FB.push({ k: 'pl', pts: [B[i], T[i]], lay, close: false });
    };
    for (const r of C.racks) box(r.poly, r.z0, r.z1, r.st === 'P' ? 'np' : 'nd');
    for (const q of C.odfs) { box(q.poly, q.z0, q.z1, q.st === 'P' ? 'np' : 'nd'); const m = [(q.poly[0][0] + q.poly[2][0]) / 2, (q.poly[0][1] + q.poly[2][1]) / 2]; inLab.push({ q, ap: P3([m[0], m[1], (q.z0 + q.z1) / 2]) }); }
    for (const q of C.walls) for (const sd of q.sides) { FB.push({ k: 'pl', pts: sd.map(p => P3([p[0], p[1], q.z1])), lay: 'nd', close: false }); for (const p of [sd[0], sd[sd.length - 1]]) FB.push({ k: 'pl', pts: [P3([p[0], p[1], q.z0]), P3([p[0], p[1], q.z1])], lay: 'nd', close: false }); }      /* partition walls: their top and their ends */
    for (const l of C.legs) FB.push({ k: 'pl', pts: [P3(l.a), P3(l.b)], lay: 'fh', close: false });
  }
  /* the fibers go on last and are never hidden: the plan must show all of them */
  let fgrp = null;      /* (19:25) the cable that is being drawn: the name of its block */
  const seg3 = (a, b, lay, hid) => {
    const p = P3(a), q = P3(b), dx = q[0] - p[0], dy = q[1] - p[1]; if (Math.abs(dx) + Math.abs(dy) < 1e-6) return [p, q];
    let t = 0; const at = k => [p[0] + dx * k, p[1] + dy * k], put = (k0, k1, ly, see) => { if (k1 - k0 < 1e-5) return; const u = at(k0), v = at(k1), pr = { k: 'pl', pts: [u, v], lay: ly, close: false }; if (fgrp) pr.g = fgrp; FB.push(pr); const tk = thick(u, v, 0.6 * th); LB.block(tk, see); if (see) fibP.push(tk); else fibH.push(tk); };
    for (const v of hid ? [] : sc.shown(sc.R(a), sc.R(b), 0, sc.thru)) { put(t, v[0], 'fh', 0); put(v[0], v[1], lay, 1); t = v[1]; }
    put(t, 1, 'fh', 0); return [p, q];
  };
  for (const l of rg.legs) {
    fgrp = gk(l.f === 'ae' ? 'FOC_AE' : 'FOC_UG');
    const d = l.plan || 1, ux = (l.b[0] - l.a[0]) / d, uy = (l.b[1] - l.a[1]) / d; if (l.plan - l.ta - l.tb < 0.02) continue;
    const pq = seg3([l.a[0] + ux * l.ta, l.a[1] + uy * l.ta, l.za], [l.b[0] - ux * l.tb, l.b[1] - uy * l.tb, l.zb], LEG[l.type].lay, l.inside); legs2.push({ l, a: pq[0], b: pq[1] });
  }
  const risers = [];
  for (const v of rg.verts) {
    const zb = v.z0 + (v.R || 0), t2 = v.at2 || v.at, gz = Math.max(zb, Math.min(v.g, v.z1)); if (v.z1 - gz > 0.01) seg3([t2[0], t2[1], v.z1], [v.at[0], v.at[1], gz], 'ug', v.inside); if (gz - zb > 0.01) seg3([v.at[0], v.at[1], gz], [v.at[0], v.at[1], zb], 'ug', v.inside);      /* on a pole the cable leans with the pipe, down to the ground */
    if (v.R) { let prev = [v.at[0], v.at[1], zb]; for (let i = 1; i <= 6; i++) { const a = Math.PI + i * Math.PI / 12, q = [v.at[0] + v.u[0] * v.R * (1 + Math.cos(a)), v.at[1] + v.u[1] * v.R * (1 + Math.cos(a)), zb + v.R * Math.sin(a)]; seg3(prev, q, 'ug'); prev = q; } }
    if (v.kind === 'riser' && v.z1 - v.g > 1.5) { const K = riserParts(v.g, v.z1 - CLOZ), t2 = v.at2 || v.at, q = z => { const f = clamp((z - v.g) / Math.max(0.1, v.z1 - v.g), 0, 1); return P3([v.at[0] + (t2[0] - v.at[0]) * f, v.at[1] + (t2[1] - v.at[1]) * f, z]); }; risers.push({ v, a: q(K.e), b: q(K.giTop), c: q(K.giTop), d: q(K.ugTop), ug: K.ugTop - K.giTop > 0.6 }); }
  }
  for (const k of rg.links) seg3(k.a, k.b, 'ug');
  /* the loop in its X-shaped holder, on the side of the pole above the cable: 0.4 m across, 0.1 m above the wire. The cable goes round it and on up to the closure. */
  const loops = [], RL = STD.loopD / 2, fl = (a, b) => FB.push({ k: 'pl', pts: [P3(a), P3(b)], lay: 'pp', close: false });
  for (const lp of rg.loops) {
    const c3 = [lp.c[0], lp.c[1], lp.z], q3 = (r, a) => [c3[0] + lp.u[0] * r * Math.cos(a), c3[1] + lp.u[1] * r * Math.cos(a), c3[2] + r * Math.sin(a)], pt = (r, a) => P3(q3(r, a));
    const ring = r => { const Q = []; for (let i = 0; i <= 24; i++) Q.push(pt(r, i * 15 * D2R)); return Q; };
    FB.push({ k: 'pl', pts: ring(RL), lay: 'pp', close: false }, { k: 'pl', pts: ring(RL - 0.03), lay: 'pp', close: false }); for (const a of [45, 135]) FB.push({ k: 'pl', pts: [pt(RL + 0.05, a * D2R), pt(RL + 0.05, (a + 180) * D2R)], lay: 'dt', close: false });
    for (const l of rg.legs) if (l.type === 'aerial' && l.plan > 0.7) for (const e of [0, 1]) {                 /* from the wire into the loop, crossing under it as the standard draws it */
      const E = e ? l.b : l.a, F = e ? l.a : l.b; if (Math.hypot(E[0] - lp.at[0], E[1] - lp.at[1]) > 0.45) continue;
      const d = [(F[0] - E[0]) / l.plan, (F[1] - E[1]) / l.plan], sd = d[0] * lp.u[0] + d[1] * lp.u[1] >= 0 ? 1 : -1; fl([E[0] + d[0] * 0.32, E[1] + d[1] * 0.32, lp.zw], q3(RL, (sd > 0 ? -120 : -60) * D2R));
    }
    const cm = X.cm.find(q => Math.hypot(q.at[0] - lp.at[0], q.at[1] - lp.at[1]) < 0.45);
    if (cm) { cm.fed = 1; for (const k of [-1, 1]) fl(q3(RL, (90 + k * 20) * D2R), [cm.c[0] + lp.u[0] * k * 0.03, cm.c[1] + lp.u[1] * k * 0.03, cm.z]); }
    const hl = hull(ring(RL + 0.08)); LB.block(hl); fibP.push(hl); loops.push({ lp, c: pt(RL, Math.PI) });
  }
  for (const cm of X.cm) if (!cm.fed) { const ae = aerialAt(rg, cm.at); if (ae) fl([cm.at[0], cm.at[1], ae.z], [cm.c[0], cm.c[1], cm.z]); }      /* a closure with no loop under it: the cable goes straight up to it */
  /* the AE cable carries on outside the site: an arrow at its first point */
  const lead = legs2.find(q => q.l.f === 'ae' && q.l.i === 0) || null;
  if (lead) { const q = lead, dl = Math.hypot(q.a[0] - q.b[0], q.a[1] - q.b[1]) || 1, u = [(q.a[0] - q.b[0]) / dl, (q.a[1] - q.b[1]) / dl], s = 1.3 * th, tip = [q.a[0] + u[0] * s, q.a[1] + u[1] * s]; FB.push({ k: 'fl', pts: [tip, [q.a[0] - u[1] * s * 0.36, q.a[1] + u[0] * s * 0.36], [q.a[0] + u[1] * s * 0.36, q.a[1] - u[0] * s * 0.36]], lay: 'pp' }); const t = thick(q.a, tip, s); LB.block(t); fibP.push(t); }
  const cs = [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]].map(p => sc.R(p)), X0 = Math.min(...cs.map(p => p[0])), X1 = Math.max(...cs.map(p => p[0])), Y0 = Math.min(...cs.map(p => p[1])), Y1 = Math.max(...cs.map(p => p[1]));
  if (o.dims !== false && !one) {
    /* the two sizes of the site are written beside its two near edges. Where an item, a run or a cable is drawn there, the figure moves along the edge, or further out. */
    const busy = fibP.slice(); for (const a of A3) { if (a.k === 'el' && a.pts) busy.push(hull(a.pts.concat(a.hp ? [a.hp] : []).map(P3))); if (a.k === 'seg' && a.run) for (let i = 0; i + 1 < a.run.pts.length; i++) { const u = a.run.pts[i], v = a.run.pts[i + 1], dz = a.run.kind === 'trench' ? runDepthD(a.run) : 0; busy.push(thick(P3([u[0], u[1], a.a[2]]), P3([v[0], v[1], a.a[2]]), 0.5)); if (dz) busy.push(thick(P3([u[0], u[1], a.a[2] - dz]), P3([v[0], v[1], a.a[2] - dz]), 0.5)); } }
    const dim = (txt, at, dx, ang, bx) => {
      let best = null;
      for (const k of [3, 4.6, 6.4, 8.5]) { for (const t of [0.5, 0.36, 0.64, 0.22, 0.78]) { const m = at(t), p = [m[0] + dx * k * th, m[1] - C30 * k * th], box = obb([p[0] + bx * th, p[1] + 0.43 * th], textW(txt, th) + th, th * 1.6, ang); if (!best) best = { p, box }; if (!busy.some(q => polysHit(box, q))) { best = { p, box }; k0 = 1; break; } } if (k0) break; }
      GT.tx(best.p, txt, th, 'dm', 'c', ang); LB.block(best.box);
    };
    let k0 = 0; dim(f1(X1 - X0) + ' m', t => proj([X0 + (X1 - X0) * t, Y0, 0]), -0.5, -30, 0.25); k0 = 0; dim(f1(Y1 - Y0) + ' m', t => proj([X1, Y0 + (Y1 - Y0) * t, 0]), 0.5, 30, -0.25);
  }
  if (o.north !== false && !one && !S.room) {
    const b = num(si.bearing, 0) * D2R, p0 = sc.P([L / 2, W / 2, 0]), p1 = sc.P([L / 2 - Math.sin(b), W / 2 + Math.cos(b), 0]), cn = proj([X1, Y0, 0]), lf = proj([X0, Y0, 0]), base = [lf[0] + 3 * th, cn[1] + 3 * th], dv = [p1[0] - p0[0], p1[1] - p0[1]], dl = Math.hypot(dv[0], dv[1]) || 1;   /* in the empty corner below the left edge */
    northArrow(GT, [base[0] - dv[0] / dl * 1.6 * th, base[1] - dv[1] / dl * 1.6 * th], dv, th); LB.block(obb(base, 6.5 * th, 6.5 * th, 0));
  }
  if (lab) {
    const h = th * 0.9, gap = 0.3 * th, ctr = one ? P3([one.x, one.y, baseZ(S, one) + num(one.h, 1) / 2]) : proj([(X0 + X1) / 2, (Y0 + Y1) / 2, 0]), call = [], len2 = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]), at = (q, f) => [q.a[0] + (q.b[0] - q.a[0]) * f, q.a[1] + (q.b[1] - q.a[1]) * f], angOf = (p, q) => readable(Math.atan2(q[1] - p[1], q[0] - p[0]) / D2R);
    LB.fit(primBox(R0.concat(FB, GT.p)), o.box, o.rect); if (!o.tiny && !one && !S.room) LB.ink(R0.concat(FB, GT.p), h);
    /* everything a label must keep clear of */
    for (const q of O3) { if (q.post) LB.block(thick(P3(q.post[0]), P3(q.post[1]), q.w || 0.3)); else if (q.wall) { const n = sc.R([sc.cx + q.n[0], sc.cy + q.n[1], 0]); if (n[0] - sc.cx - (n[1] - sc.cy) > 0) LB.block(hull(q.wall.map(P3))); } else LB.block(hull(q.map(P3))); }
    for (const a of A3) {
      if (a.k === 'el' && a.pts) { if (a.flat && a.edit === 'dp') LB.block(hull(a.pts.concat([a.hp]).map(P3)), 1, a.key); else if (a.flat) { const T2 = a.fp.map(q => P3([q[0], q[1], a.pts[a.pts.length - 1][2]])); for (let i = 0; i < T2.length; i++) LB.block(thick(T2[i], T2[(i + 1) % T2.length], 0.12), 0, a.key); } else LB.block(hull(a.pts.map(P3)), 1, a.key); }
      if (a.k === 'seg' && a.run) for (let i = 0; i + 1 < a.run.pts.length; i++) {
        const u = a.run.pts[i], v = a.run.pts[i + 1], z = a.a[2], dp = a.run.kind === 'trench' ? runDepthD(a.run) : 0; LB.block(thick(P3([u[0], u[1], z]), P3([v[0], v[1], z]), Math.max(0.3, num(a.run.w, 0.4)) + 0.1), 0, a.key);
        if (dp) LB.block(thick(P3([u[0], u[1], z - dp]), P3([v[0], v[1], z - dp]), Math.max(0.3, num(a.run.w, 0.4)) + 0.15), 0, a.key);
      }
    }
    /* the list of labels: what each says, what it belongs to, and how it likes to sit */
    const jobs = [];
    for (const a of A3) {
      if (a.k === 'mark' || a.k === 'ghost' || !a.s || (a.grp && !nameOn(S, a.grp)) || (a.title && !nameOn(S, 'th'))) continue;      /* the tower named by the site title keeps a name of its own only for its height */      /* a name of a group that the user left out */
      const ap = P3(a.p);
      if (a.k === 'seg') {
        let out = null; if (a.out) { const c0 = sc.P([0, 0, 0]), c1 = sc.P([a.out[0], a.out[1], 0]); out = [c1[0] - c0[0], c1[1] - c0[1]]; }
        /* a run may carry its name on any of its longer pieces */
        const pcs = a.run ? a.run.pts.slice(0, -1).map((u, i) => [P3([u[0], u[1], a.a[2]]), P3([a.run.pts[i + 1][0], a.run.pts[i + 1][1], a.a[2]])]).sort((x, y) => len2(y[0], y[1]) - len2(x[0], x[1])).slice(0, 3) : [[P3(a.a), P3(a.b)]];
        const dpT = a.run && a.run.kind === 'trench' ? runDepthD(a.run) : 0, inn = dpT ? a.run.pts.slice(0, -1).map((u, i) => [P3([u[0], u[1], a.a[2] - dpT / 2]), P3([a.run.pts[i + 1][0], a.run.pts[i + 1][1], a.a[2] - dpT / 2])]).sort((x, y) => len2(y[0], y[1]) - len2(x[0], x[1])).slice(0, 2) : null;
        jobs.push({ o: 2, key: a.key, s: a.s, st: a.st, ap, kind: 'along', pcs, out, gap: (a.gap || 0.3) * 0.9 + gap, fit: a.run ? 1.1 : 0, inn, innH: dpT - 0.45 });
        if (dimRun(a.run) && nameOn(S, 'dim')) a.run.pts.slice(0, -1).forEach((u, i) => { const v = a.run.pts[i + 1], len = Math.hypot(v[0] - u[0], v[1] - u[1]), t = f1(len) + 'm'; if (len < 0.3 || lenDup(S, rgT, a.run, u, v, t)) return; const pa = P3([u[0], u[1], a.a[2]]), pb = P3([v[0], v[1], a.a[2]]);      /* beta 4.1: the length of each straight piece of a proposed conduit or trench */
          jobs.push({ o: 2.8, key: 'lenr' + a.run.id + '_' + i, s: t, st: 'L', opt: len < 1 ? 1 : 0, ap: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], kind: 'along', pcs: [[pa, pb]], gap, fit: 1.05, ts: [0.5, 0.35, 0.65, 0.2, 0.8] }); });
      }
      else if (a.kind === 'axis') jobs.push({ o: 3, key: a.key, s: a.s, st: a.st, ap, kind: 'along', near: polyBox([P3(a.axis[0]), P3(a.axis[1])]), pcs: [[P3(a.axis[0]), P3(a.axis[1])]], gap: a.r + gap, ts: [0.5, 0.6, 0.7, 0.78, 0.4, 0.3], fit: 1 });
      else if (a.kind === 'box') jobs.push({ o: 1, key: a.key, s: a.s, st: a.st, ap, kind: 'box', a });
      else if (a.kind === 'ground') jobs.push({ o: 4, key: a.key, s: a.s, st: a.st, ap, kind: 'ground', a });
      else jobs.push({ o: 5, key: a.key, s: a.s, st: a.st, ap, kind: 'lead', bb: a.pts && a.pts.length > 2 && !a.item ? polyBox(a.pts.map(P3)) : null, item: a.item && a.pts ? { zc: (a.pts[0][2] + a.pts[2][2]) / 2, zh: a.pts[2][2] - a.pts[0][2] } : null,
        alt: a.item && a.host && a.pts && !one ? ['R', 'L', 'B'].filter(sd => facing(sc, faceN(a.host, sd)) > 0.05).map(sd => onFace(a.host, sd, 0, (a.pts[0][2] + a.pts[2][2]) / 2)).filter(q => sc.seen(q)).map(P3) : null });
    }
    for (const f of ['ae', 'ug']) for (let cn = 0; cn < rgT.parts.length; cn++) {      /* (14 Nov) the name of each fiber of each cable */
      const own = legs2.filter(q => q.l.f === f && (q.l.cn || 0) === cn).sort((x, y) => len2(y.a, y.b) - len2(x.a, x.b)).slice(0, 3); if (!own.length) continue; const fk = f + (own[0].l.ck || '');
      const tr = own.filter(q => q.l.run && q.l.run.kind === 'trench' && q.l.za < q.l.g - 0.6), inn = tr.length ? tr.map(q => { const l = q.l, z = (l.g + l.za) / 2; return [P3([l.a[0], l.a[1], z]), P3([l.b[0], l.b[1], z])]; }) : null;
      jobs.push({ o: 2.5, key: fk, s: labText(S, fk, o.short ? 'FOC ' + f.toUpperCase() + (rgT.parts.filter(p => p.sum.total > 0.05).length > 1 ? ' ' + (cn + 1) : '') : focName(S, rgT, f, cn)), st: 'P', ap: at(own[0], 0.4), kind: 'along', pcs: own.map(q => [q.a, q.b]), gap, fit: 1.05, ts: [0.4, 0.6, 0.5, 0.25, 0.75], inn, innH: tr.length ? tr[0].l.g - tr[0].l.za - 0.4 : 0, its: [0.22, 0.78, 0.5] });
    }
    { /* the length of each leg of a cable, in green beside it, as on the hand-made plans. Left out where there is no room: the tables have every length. */
      const grp = {}, real = {}, kk = l => l.f + l.i + (l.ck || ''); for (const l of rgT.legs) real[kk(l)] = (real[kk(l)] || 0) + l.len;
      for (const q of legs2) { const k = kk(q.l), c = grp[k]; if (!c || len2(q.a, q.b) > len2(c.a, c.b)) grp[k] = q; }
      const same = rgT.legs.length === rg.legs.length && rg.legs.every((l, i) => l.f === rgT.legs[i].f && l.i === rgT.legs[i].i && (l.cn || 0) === (rgT.legs[i].cn || 0));
      if (nameOn(S, 'dim') && same) { const LK = lenKeys(rg.legs); for (const q of legs2) { if (!q.l.f || q.l.f === 'ae' || q.l.inside) continue; const len = rgT.legs[rg.legs.indexOf(q.l)].len; if (!(len >= 0.3)) continue;      /* beta 4.1: the length of each straight piece of a cable (its real length, depth and all) */
        jobs.push({ o: 2.7, key: LK.get(q.l), s: f1(len) + 'm', st: 'L', opt: len >= 1 ? 0 : 1, ap: at(q, 0.5), kind: 'along', pcs: [[q.a, q.b]], gap, fit: 1.05, ts: [0.5, 0.35, 0.65, 0.2, 0.8] }); } }
      else for (const k in grp) { const q = grp[k]; if (q.l.f !== 'ae' && real[k] > 0.25) jobs.push({ o: 2.7, key: 'len' + k, s: f1(real[k]) + 'm', st: 'L', opt: 1, ap: at(q, 0.5), kind: 'along', pcs: [[q.a, q.b]], gap, fit: 1.05, ts: [0.5, 0.35, 0.65, 0.2, 0.8] }); }
    }
    for (const ld of legs2.filter(q => q.l.f === 'ae' && q.l.i === 0)) { const nk = 'note' + (ld.l.ck || ''), note = labText(S, nk, String((cables(S)[ld.l.cn || 0] || {}).note || '').trim().toUpperCase());      /* (14 Nov) the note at the outside end of each aerial cable */
      if (note) jobs.push({ o: 2, key: nk, s: note, st: 'P', ap: at(ld, 0.2), kind: 'along', pcs: [[ld.a, ld.b]], gap, wrap: 30, ts: [0.25, 0.4, 0.55] }); }
    if (!one && !FLAT && !S.room) for (const r of S.runs) if (r.kind === 'trench' && r.st === 'P' && !r.hid && r.pts && r.pts.length > 1) {      /* beta 4.2: an open trench says how deep it is, at the middle of its longest piece */
      let bi = 0, bl = 0; for (let i = 0; i + 1 < r.pts.length; i++) { const l = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]); if (l > bl) { bl = l; bi = i; } }
      const a = r.pts[bi], b = r.pts[bi + 1], m = [a[0] + (b[0] - a[0]) * 0.72, a[1] + (b[1] - a[1]) * 0.72], dp = runDepth(r), key = 'dep' + r.id;
      jobs.push({ o: 3.2, key, s: labText(S, key, 'TRENCH ' + f1(dp) + ' m DEEP'), st: 'P', ap: P3([m[0], m[1], groundZ(S, m) - dp * 0.6]), alt: [0.5, 0.3, 0.12].map(t => { const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; return P3([q[0], q[1], groundZ(S, q) - dp * 0.6]); }), kind: 'lead', opt: 0 });
    }
    risers.forEach((q, i) => { jobs.push({ o: 3, key: 'riser' + i, s: labText(S, 'riser' + i, 'PROPOSED G.I. RISER PIPE'), st: 'P', ap: at(q, 0.5), kind: 'along', near: polyBox([q.a, q.b]), pcs: [[q.a, q.b]], gap: gap + 0.5, fit: 1.15, ts: [0.5, 0.35, 0.65, 0.2] }); if (q.ug) jobs.push({ o: 3, key: 'ugd' + i, s: labText(S, 'ugd' + i, 'PROPOSED U-GUARD'), st: 'P', ap: [q.c[0] + (q.d[0] - q.c[0]) * 0.5, q.c[1] + (q.d[1] - q.c[1]) * 0.5], kind: 'along', near: polyBox([q.c, q.d]), pcs: [[q.c, q.d]], gap: gap + 0.5, fit: 1.15, ts: [0.5, 0.35, 0.65, 0.2] }); });
    for (const k of inLab) jobs.push({ o: 4, key: k.q.key, s: labText(S, k.q.key, k.q.s), st: k.q.st, ap: k.ap, kind: 'lead' });
    for (const q of loops) jobs.push({ o: 5, key: 'loop' + q.lp.i + (q.lp.ck || ''), s: labText(S, 'loop' + q.lp.i + (q.lp.ck || ''), 'LOOP HOLDER W/ ' + f2(q.lp.len) + 'm LOOP'), st: 'P', ap: q.c, kind: 'lead' });
    /* When the size is automatic, a name that finds no room is tried again smaller, down to what is still easy to read (1.8 mm on the sheet). Only then does it get a leader. */
    const HS = txAuto(S) ? TXS.map(k => h * k) : [h], KMIN = txAuto(S) ? TXS[TXS.length - 1] : (o.screen ? 0.4 : 0.55), KFACE = Math.min(KMIN, 0.68);      /* beta 4.1: on its own face a name may be as small as 1.5 mm on the sheet */
    const free2 = quad => { for (const b of LB.labs) if (polysHit(quad, b)) return false; for (const b of fibP) if (polysHit(quad, b)) return false; if (strict) for (const b of fibH) if (polysHit(quad, b)) return false; return true; };
    /* a sticker: the name in the plane of a face, a thin frame round it, and the lines of the model under it taken away */
    /* the letters are drawn the way isometric lettering is drawn by hand and in CAD: turned to the face, slanted with it, and not stretched.
       In DXF that is plain TEXT with a rotation and an oblique angle. tb: how much narrower that makes a line of text than its true projection. */
    const tb = (U, V) => { const ul = Math.hypot(U[0], U[1]) || 1; return { ul, u: [U[0] / ul, U[1] / ul], b: (-V[0] * U[1] + V[1] * U[0]) / ul }; };
    const half = (s, H, U, V) => { const Q = tb(U, V); return textW(s, H) * Q.b / (2 * Q.ul) + 0.35 * H; };
    const sticker = (jb, c, U, V, H, fixed) => {
      const Q = tb(U, V), hw = half(jb.s, H, U, V), hh = 0.85 * H, q = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(k => [c[0] + U[0] * k[0] + V[0] * k[1], c[1] + U[1] * k[0] + V[1] * k[1]]), lay = tl(jb.st);
      GT.tx([c[0] - V[0] * H / 2, c[1] - V[1] * H / 2], jb.s, H, lay, 'c', 0, false, [Q.u[0] * Q.b, Q.u[1] * Q.b, V[0], V[1]]); GT.pl(q, lay, 1); quads.push(q);
      if (fixed && !inPoly(jb.ap, q) && len2(jb.ap, c) > hw + 2 * H) { const e = edgeOut(c, jb.ap, q); LB.arrow(e, jb.ap, h, lay); LB.leads.push([jb.ap, e]); }
      LB.keep(jb.key, q, c, jb.ap, fixed ? { moved: 1 } : null);
    };
    const boxAuto = jb => {
      for (const fr of faceFrames(sc, jb.a)) {
        const B = frameBasis(sc, fr), need1 = 2 * half(jb.s, 1, B.U, B.V), k0 = Math.min(1, (fr.len - 0.08) / (need1 * h), (fr.ht - 0.08) / (1.7 * h));      /* the standard size, made smaller only to fit the face */
        for (const H of k0 < KFACE ? [] : [h * k0]) {
        const hw = half(jb.s, H, B.U, B.V), hh = 0.85 * H, ms = Math.max(0, fr.len / 2 - hw - 0.04), mt = Math.max(0, fr.ht / 2 - hh - 0.04), P = (s, t) => fr.pt(B.ss * s, B.ts * t);
        let ts = fr.top ? [-mt, mt, 0] : [0.12 * fr.ht, 0, -0.25 * fr.ht, 0.3 * fr.ht].map(t => clamp(t, -mt, mt));
        if (fr.top) ts.sort((p, q) => sc.P(P(0, p))[1] - sc.P(P(0, q))[1]);          /* on a top face, the strip nearest the viewer first: it is the one most often clear */
        for (const t of ts) for (const s of [0, 0.7 * ms, -0.7 * ms]) {
          let ok = true; for (const k2 of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if (!sc.seen(P(s + k2[0] * hw, t + k2[1] * hh))) { ok = false; break; }
          if (!ok) continue;
          const c = sc.P(P(s, t)), q = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(k2 => [c[0] + B.U[0] * k2[0] + B.V[0] * k2[1], c[1] + B.U[1] * k2[0] + B.V[1] * k2[1]]);
          if (!free2(q)) continue;
          sticker(jb, c, B.U, B.V, H); return true;
        }
        }
      }
      return false;
    };
    const alongAuto = (jb, h) => {
      const one = [jb.s], two = jb.wrap ? wrap(jb.s, jb.wrap) : wrap(jb.s, 22);
      /* in an open trench the names are written on the wall of the excavation, between the ground line and the bottom */
      if (jb.inn) for (const sg of jb.inn) { const ln = len2(sg[0], sg[1]), a = angOf(sg[0], sg[1]); if (LB.place(one, h, tl(jb.st), (w, hh) => w <= ln * 0.9 && hh <= jb.innH ? (jb.its || [0.5, 0.3, 0.7]).map(t => ({ p: [sg[0][0] + (sg[1][0] - sg[0][0]) * t, sg[0][1] + (sg[1][1] - sg[0][1]) * t], a })) : [], false, jb.key, jb.ap)) return true; }
      for (const lines of two.length > 1 ? (jb.wrap ? [two] : [one, two]) : [one]) for (const sg of jb.pcs) {
        const bs = besideSeg(sg[0], sg[1], jb.out || null, jb.gap, 3, jb.ts), ln = len2(sg[0], sg[1]);
        if (LB.place(lines, h, tl(jb.st), (w, hh) => !jb.fit || w <= ln * jb.fit ? bs(w, hh) : [], false, jb.key, jb.ap)) return true;
      }
      return false;
    };
    /* 1. labels the user moved */
    for (const jb of jobs) {
      const off = labOff(S, jb.key, VK); if (!off) continue; const c = [jb.ap[0] + off[0], jb.ap[1] + off[1]]; jb.done = 1;
      if (jb.kind === 'box') { const fr = faceFrames(sc, jb.a)[0]; if (fr) { const B = frameBasis(sc, fr); sticker(jb, c, B.U, B.V, h, 1); continue; } }
      LB.fixed(jb.key, jb.wrap ? wrap(jb.s, jb.wrap) : [jb.s], h, tl(jb.st), c, jb.kind === 'along' ? angOf(jb.pcs[0][0], jb.pcs[0][1]) : jb.kind === 'ground' ? -30 : 0, jb.ap);
    }
    /* the site name and ID: beside the top of the tower, bold, larger than the other names. Level with the top, on the right, then the left, then above, then lower down the sides. */
    const tw = one ? null : titleTower(S), ta = tw && A3.find(q => q.k === 'el' && q.id === tw.id && q.pts);
    if (ta) {
      const lines = titleLines(S), T2 = lines.join(' '), Q = ta.pts.map(P3), b = polyBox(Q), zt = Math.max.apply(null, ta.pts.map(q => q[2])), tp = Q.filter((q, i) => ta.pts[i][2] > zt - 0.6), bt = polyBox(tp.length ? tp : Q), ap = [(bt[0] + bt[2]) / 2, bt[3]], ks = txAuto(S) ? TITLE_K : TITLE_K.slice(0, 1);
      const cands = (w, hh) => { const o = []; for (let j = 0; j < 5; j++) { const d = gap * 1.5 + j * hh * 0.7; o.push({ p: [bt[2] + d + w / 2, bt[3] - hh / 2], a: 0 }, { p: [bt[0] - d - w / 2, bt[3] - hh / 2], a: 0 }); } o.push({ p: [ap[0], bt[3] + gap + hh / 2], a: 0 }); for (let k = 1; k <= 8; k++) { const y = b[3] - hh / 2 - k * hh * 1.3; if (y < b[1]) break; const xr = Math.max.apply(null, Q.filter(q => Math.abs(q[1] - y) < hh * 2).map(q => q[0]).concat([bt[2]])), xl = Math.min.apply(null, Q.filter(q => Math.abs(q[1] - y) < hh * 2).map(q => q[0]).concat([bt[0]])); o.push({ p: [xr + gap * 1.5 + w / 2, y], a: 0 }, { p: [xl - gap * 1.5 - w / 2, y], a: 0 }); } return o; };
      const off = labOff(S, 'tid', VK);
      if (off) LB.fixed('tid', lines, h * ks[0], 'tx', [ap[0] + off[0], ap[1] + off[1]], 0, ap, { bold: 1 });
      else if (!ks.some(k => LB.place(lines, h * k, 'tx', cands, true, 'tid', ap))) call.push({ key: 'tid', p: ap, bb: bt, lines, bold: 1, s: T2, st: 'E', w: 22 });
    }
    for (let i = jobs.length - 1; i >= 0; i--) if ((labRec(S, jobs[i].key) || {}).off) jobs.splice(i, 1);      /* beta 4.1: a name the user hid */
    jobs.sort((p, q) => p.o - q.o);
    /* (beta 4.2, 22:24: in the detail of one cabinet the name of a rack item is no longer written on the side wall, slanted and in a box: it is level text with an arrow, like every other note) */
    /* 2. stickers on the bodies */
    for (const jb of jobs) if (!jb.done && jb.kind === 'box') { strict = 1; let ok = boxAuto(jb); strict = 0; if (ok || boxAuto(jb)) jb.done = 1; }      /* (beta 4.2: first where no hidden part of the cable runs under the name) */
    /* level text right beside a small thing: on its four sides and at its corners */
    const beside = jb => (w, hh) => { const b = jb.bb || [jb.ap[0] - 0.12, jb.ap[1] - 0.12, jb.ap[0] + 0.12, jb.ap[1] + 0.12], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, g2 = gap * 0.8; return [{ p: [b[2] + g2 + w / 2, cy], a: 0 }, { p: [b[0] - g2 - w / 2, cy], a: 0 }, { p: [cx, b[3] + g2 + hh / 2], a: 0 }, { p: [cx, b[1] - g2 - hh / 2], a: 0 }, { p: [b[2] + g2 + w / 2, b[3]], a: 0 }, { p: [b[0] - g2 - w / 2, b[3]], a: 0 }, { p: [b[2] + g2 + w / 2, b[1]], a: 0 }, { p: [b[0] - g2 - w / 2, b[1]], a: 0 }]; };
    /* 3. text along lines: gates, ladders and pipes, the two fibers, poles and the riser pipe */
    /* beta 4.2: the rules for the names (see the top view). keepOld: a small screen, a room and the detail of one cabinet keep the rules they had. */
    const keepOld = !!(o.tiny || one || S.room);
    for (const jb of jobs) if (!jb.done && jb.kind === 'along') {
      const isLen = jb.st === 'L' || jb.key === 'note', keep = keepOld || isLen || jb.st === 'E';
      if (keep && HS.some(hh => alongAuto(jb, hh))) { jb.done = 1; continue; }
      if (isLen && !keepOld && !jb.opt) {                      /* no free place along its line: it is written there all the same, at the smallest size */
        const hh = HS[HS.length - 1]; if (alongAuto(Object.assign({}, jb, { fit: 0, inn: null }), hh)) { jb.done = 1; continue; }
        if (HS.some(h2 => jb.pcs.some(sg => LB.along(jb.wrap ? wrap(jb.s, jb.wrap) : [jb.s], h2, tl(jb.st), sg[0], sg[1], jb.key, jb.ap, { gap: jb.gap || gap })))) { jb.done = 1; continue; }      /* (beta 4.2: to the nearest clear place, still parallel, with a thin leader) */
        if (jb.pcs.some(sg => LB.along(jb.wrap ? wrap(jb.s, jb.wrap) : [jb.s], hh, tl(jb.st), sg[0], sg[1], jb.key, jb.ap, { gap: jb.gap || gap, wide: 1 }))) { jb.done = 1; continue; }      /* (19:25: every name always shows: further away, …) */
        const sg = jb.pcs[0], L = len2(sg[0], sg[1]) || 1, nx = -(sg[1][1] - sg[0][1]) / L, ny = (sg[1][0] - sg[0][0]) / L, d = (jb.gap || gap) + hh * 0.7;      /* … and beside its piece all the same when there is no clear place at all */
        LB.fixed(jb.key, jb.wrap ? wrap(jb.s, jb.wrap) : [jb.s], hh, tl(jb.st), [(sg[0][0] + sg[1][0]) / 2 + nx * d, (sg[0][1] + sg[1][1]) / 2 + ny * d], angOf(sg[0], sg[1]), jb.ap); jb.done = 1; continue; }
      if (keep && jb.near && !one && txAuto(S) && HS.some(hh => LB.place([jb.s], hh, tl(jb.st), beside({ bb: jb.near, ap: jb.ap }), false, jb.key, jb.ap))) jb.done = 1; else if (jb.opt) jb.done = 1;
      else call.push({ key: jb.key, p: jb.ap, bb: jb.near || polyBox(jb.pcs[0]), alt: keep ? jb.pcs.slice(1).map(sg => [(sg[0][0] + sg[1][0]) / 2, (sg[0][1] + sg[1][1]) / 2]) : [].concat(...jb.pcs.map(sg => (len2(sg[0], sg[1]) > 8 * h ? [0.5, 0.25, 0.75] : [0.5]).map(t => [sg[0][0] + (sg[1][0] - sg[0][0]) * t, sg[0][1] + (sg[1][1] - sg[0][1]) * t]))).filter(q => len2(q, jb.ap) > 0.5 * h), s: jb.s, st: jb.st, w: 20, arrow: !keep });      /* (beta 4.2: the arrow of the name of a line may land on any part of it) */
    }
    /* 4. on the ground beside the item, in the isometric angle: pits, towers, and a box whose faces had no room */
    for (const jb of jobs.filter(q => !q.done && (q.kind === 'ground' || q.kind === 'box')).sort((p, q) => polyBoxArea(p.a.fp) - polyBoxArea(q.a.fp))) {
      const a = jb.a, zt = a.pts ? a.pts[a.pts.length - 1][2] : a.z;
      const direct = !keepOld && jb.st === 'E' && jb.kind === 'box';      /* (beta 4.2: an existing item whose name has no room on its body: level, with a leader) */
      if (!direct && HS.some(hh => LB.place([jb.s], hh, tl(jb.st), isoCands(sc, a.fp, a.z, gap, a.flat ? zt : null), false, jb.key, jb.ap))) { jb.done = 1; continue; }
      if (!direct && !one && txAuto(S) && a.pts && HS.some(hh => LB.place([jb.s], hh, tl(jb.st), beside({ bb: polyBox(a.pts.map(P3)), ap: jb.ap }), false, jb.key, jb.ap))) { jb.done = 1; continue; }      /* level text right beside it */
      const cx = a.p[0], cy = a.p[1], cn = a.flat ? a.fp.map(q => P3([cx + (q[0] - cx) * 0.8, cy + (q[1] - cy) * 0.8, zt])) : [jb.ap]; call.push({ key: jb.key, p: cn[0], bb: a.pts ? polyBox(a.pts.map(P3)) : null, alt: cn.slice(1).concat(direct && a.box ? faceFrames(sc, a).map(fr => fr.pt(0, 0)).filter(q => sc.seen(q)).map(P3) : []), s: jb.s, st: jb.st, w: 18, arrow: direct });
    }
    /* 5. the small things: the name right beside the thing when there is room for it there, else a short leader and level text */
    for (const jb of jobs) if (!jb.done && jb.kind === 'lead') { if (!one && !jb.item && txAuto(S) && HS.some(hh => LB.place([jb.s], hh, tl(jb.st), beside(jb), false, jb.key, jb.ap))) { jb.done = 1; continue; } call.push({ key: jb.key, p: jb.ap, alt: jb.alt || null, bb: jb.bb, s: jb.s, st: jb.st, w: 18 }); }
    /* on a small screen a name that finds no room close to its item is left out until the user zooms in: long leaders across a small drawing hide more than they tell */
    /* Before a leader: level text right beside the item, even where it crosses a line of the drawing. The lines under it are taken away so the name reads clearly. It keeps clear of other names and of the fibers. */
    const call2 = [];
    /* a long name, as the hand-made plans write for a conduit, is not laid across the drawing: it goes to clear space in a few lines, with a leader and an arrowhead */
    if (!one) for (const c of call) { if (c.arrow || !o.tiny) { call2.push(c); continue; }      /* (beta 4.2: a name is not laid over the lines of another item; it gets a leader to clear space) */ if (!c.lines && String(c.s).length > LONGNAME) { c.w = 30; call2.push(c); continue; } const bb = c.bb || [c.p[0] - 0.12, c.p[1] - 0.12, c.p[0] + 0.12, c.p[1] + 0.12], ln = c.lines || [c.s]; let bx = null; for (const hh of HS) { bx = LB.placeLoose(ln, hh, tl(c.st), beside({ bb, ap: c.p }), !!c.bold, c.key, c.p, fibP); if (bx) break; } if (bx) quads.push(bx); else call2.push(c); }
    const left = LB.callouts(one ? call : call2, h, { ctr, ang: ISO_ANG, max: o.tiny ? 4 : 0, hs: HS, lastX: !!(o.tiny || one), quick: !!o.quick }); skipped += left.length;
    for (const a of left) far.push(a);      /* (beta 4.2, 19:25: on a screen too) */
    skipped -= left.length;
  }
  const sand = [];
  for (const r of S.runs) if (!one && !FLAT && r.kind === 'trench' && !r.hid && r.pts.length > 1) for (const TP of outsidePits(S, r.pts)) {
    const hw = Math.max(0.05, num(r.w, RUNS.trench.w)) / 2;
    for (let i = 0; i + 1 < TP.length; i++) { const a = TP[i], b = TP[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue; const nx = -(b[1] - a[1]) / len * hw, ny = (b[0] - a[0]) / len * hw, g = groundZ(S, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) + 0.004;
      sandDots([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], q => { const p = [q[0], q[1], g]; if (sc.seen(p)) sand.push({ k: 'ci', c: P3(p), r: SAND_R, lay: 'dt', g: gk(BN[r.id]) }); }); }      /* (19:25) the dust of a trench goes with its trench */
  }
  const INS = [];                                      /* beta 4.2: the cable inside a hollow cabinet; where something hides it, dashed */
  if (one && X.hollow && X.port) for (const P of cabInside(S, one, X.port)) for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], p = P3(a), q = P3(b), dx = q[0] - p[0], dy = q[1] - p[1]; if (Math.abs(dx) + Math.abs(dy) < 1e-6) continue;
    let t = 0; const at = k => [p[0] + dx * k, p[1] + dy * k], pc = (k0, k1, ly) => { if (k1 - k0 > 1e-5) INS.push({ k: 'pl', pts: [at(k0), at(k1)], lay: ly, close: false }); };
    for (const v of sc.shown(sc.R(a), sc.R(b), 0, sc.thru)) { pc(t, v[0], 'fh'); pc(v[0], v[1], 'ug'); t = v[1]; } pc(t, 1, 'fh');
  }
  const C0 = clipOut(CTX, quads), G = new Gfx(); G.p = C0.concat(clipOut(R0.concat(INS), quads), sand, (o.ctx3 || []).map(l => ({ k: 'pl', pts: [P3(l.a), P3(l.b)], lay: 'gh' })), [].concat(...FB.map(q => q.lay === 'fh' && q.k === 'pl' ? clipOut([q], quads) : [q])), GT.p);
  let lost = 0; if (far.length) lost = addCallouts(G, far, primBox(C0.length ? G.p.slice(C0.length) : G.p), th, LB);      /* (beta 4.2: the notes of an opened cabinet stay by the cabinet, not round the whole plan drawn behind it) */
  const hits = [];
  for (const a of A3) {
    if (a.k === 'el' && a.id) hits.push({ k: 'el', id: a.id, poly: a.pts ? hull(a.pts.map(P3)) : obb(P3(a.p), 0.5, 0.45, 0), hp: a.edit ? P3(a.hp) : null, f: a.edit || null, lp: a.ladP ? P3(a.ladP) : null, item: a.item || 0 });
    if (a.k === 'seg' && a.run) hits.push({ k: 'run', id: a.id, line: a.run.pts.map(q => P3([q[0], q[1], a.a[2]])), hp: a.edit ? P3(a.hp) : null, f: a.edit });
  }
  const le = legs2.filter(q => q.l.f === 'ae').pop(); if (le) hits.push({ k: 'aer', hp: le.b, f: 'aerialH' });
  if (one && X.port && rackItems(S, one).some(e => e.t === 'odf')) hits.push({ k: 'gland', id: one.id, hp: P3(X.port.p), f: X.port.f });
  if (!one && !S.room) for (const id in rg.ports) hits.push({ k: 'gland', id, hp: P3(rg.ports[id].p), f: rg.ports[id].f });      /* (19:25) on the whole site too */      /* beta 4.2: where the cable goes in: a handle to drag */
  let CABI = null;                                     /* beta 4.2: the front of the rack on the drawing (a tap there is a place across and up), the holes to tap, the corners to drag */
  if (one && X.hollow && X.port) { const z0c = X.port.z0, Oc = odcOpening(one, z0c), Fp = (u, z) => { const q = loc(one, u, -one.d / 2 - 0.004); return P3([q[0], q[1], z]); }, p0 = Fp(0, z0c), pu = Fp(1, z0c), pv = Fp(0, z0c + 1), odf = rackItems(S, one).some(e => e.t === 'odf'), M = odf ? cabInside(S, one, X.port).meta : null;
    CABI = { id: one.id, p0, U: [pu[0] - p0[0], pu[1] - p0[1]], V: [pv[0] - p0[0], pv[1] - p0[1]], u0: Oc.u0, u1: Oc.u1, z0: Oc.zb - z0c, z1: Oc.zu - z0c, seen: facing(sc, faceN(one, 'F')) > 0.05, st: M ? [M.us, M.zs - z0c] : null, en: M ? [M.ue, M.z - z0c] : null, ru: M && M.auto ? M.uu : null };
    if (M && M.auto) hits.push({ k: 'crise', id: one.id, hp: Fp(M.uu, (Math.max(Math.min(M.zs, M.z), Oc.zb) + Math.max(M.zs, M.z)) / 2) });      /* the upright part of the cable: a handle to slide it across */
    if (odf && X.port.f === 'B') { const g = hits.find(q => q.k === 'gland'), t = loc(one, X.port.lx, X.port.ly); if (g) g.hp = P3([t[0], t[1], Oc.zb + 0.004]); }      /* through the base, the handle sits on the hole in the floor */
    if (odf) { for (const q of cabHoles(one)) { const t = loc(one, q.x, q.y), p = [t[0], t[1], Oc.zb + 0.003]; if (sc.seen(p)) hits.push({ k: 'hole', id: one.id, hp: P3(p), x: q.x, y: q.y }); }
      (one.cab && Array.isArray(one.cab.path) ? one.cab.path : []).forEach((q, i) => { if (q && isFinite(q[0]) && isFinite(q[1])) hits.push({ k: 'cpt', id: one.id, i, hp: Fp(clamp(+q[0], Oc.u0 + 0.008, Oc.u1 - 0.008), clamp(z0c + +q[1], Oc.zb + 0.008, Oc.zu - 0.008)) }); }); } }
  return { prims: G.p, th, G, far: far.length - lost, hits, sc, labs: LB.out, leads: LB.leads, skipped: far.length ? lost : skipped, one, pics, fb, nctx: C0.length, cab: CABI };
}
