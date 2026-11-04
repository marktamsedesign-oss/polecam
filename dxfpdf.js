/* G-eSAA v2.42.9: the plan's sheets as a PDF, drawn from the plan DXF the app made (no CAD program needed): every sheet (layout) of
   the template in its tab order, on its paper size, its title block and texts, and what each of its viewports shows of model space
   (the plan, the legend, the tables, the vicinity map), with the pictures (pole photos, vicinity map, logo) the export has.
   A stand-in for printing from AutoCAD: lines, polylines (widths, arcs), circles, arcs, ellipses, splines, solids and solid
   hatches, texts (Helvetica: the template's fonts are not embedded), blocks and their attributes, dimensions, pictures; colours
   (ACI and true colour), line weights, line types (dashes) and the layers frozen or off (also per viewport) as the DXF has them.
   Pattern hatches are left out. Everything runs on the phone: nothing is uploaded.
     GeDxfPdf.toPdf(dxfText, { images: { 'VICINITY_MAP.jpg': Uint8Array (JPEG), … }, title, deflate: async (bytes) => bytes })
     → Promise<Uint8Array> (the PDF), with .report = { sheets, pictures, missing } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxftpl.js'), require('./reports.js'));
  else root.GeDxfPdf = factory(root.GeDxfTpl, root.PoleReports);
}(typeof self !== 'undefined' ? self : this, function (T, R) {
  'use strict';
  const typ = (r) => r[0][1];
  const get = (r, c, d) => { for (let i = 1; i < r.length; i++) if (r[i][0] === c) return r[i][1]; return d; };
  const all = (r, c) => r.filter((p, i) => i > 0 && p[0] === c).map((p) => p[1]);
  const num = (r, c, d) => { const v = get(r, c); if (v == null) return d; const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const int = (r, c, d) => { const v = get(r, c); if (v == null) return d; const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  function owner(r) { let g = 0; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 102) { g = String(v).startsWith('{') ? 1 : 0; continue; } if (c === 330 && !g) return v; } return null; }
  const f2 = (n) => { const v = Math.round(n * 100) / 100; return Object.is(v, -0) ? '0' : String(v); };
  const f4 = (n) => { const v = Math.round(n * 10000) / 10000; return Object.is(v, -0) ? '0' : String(v); };

  /* ---- colours: the AutoCAD colour index (7 is black on paper) ---- */
  const ACI = (() => {
    const t = [[0, 0, 0], [255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [0, 0, 0], [128, 128, 128], [192, 192, 192]];
    const hsv = (h, s, v) => { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r + m, g + m, b + m].map((q) => Math.round(q * 255)); };
    const V = [1, 0.65, 0.5, 0.3, 0.15];
    for (let i = 10; i < 250; i++) { const s = i % 10; t[i] = hsv(Math.floor((i - 10) / 10) * 15, s % 2 ? 0.5 : 1, V[s >> 1]); }
    [51, 80, 105, 130, 190, 255].forEach((g, k) => { t[250 + k] = [g, g, g]; });
    return t;
  })();

  /* ---- matrices [a b c d e f]: (x, y) -> (a x + c y + e, b x + d y + f) ---- */
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const ap = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const lin = (M, x, y) => [M[0] * x + M[2] * y, M[1] * x + M[3] * y];
  const scaleOf = (M) => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
  const TR = (x, y) => [1, 0, 0, 1, x, y], SC = (x, y) => [x, 0, 0, y, 0, 0], RO = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };

  /* ---- MTEXT and TEXT strings ---- */
  function plain(s) {
    return String(s).replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\u0001').replace(/\\[{}]/g, (m) => m[1])
      .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '').replace(/\\p[^;]*;/g, '').replace(/\\S([^;]*);/g, (m, a) => a.replace(/[\^#]/g, '/'))
      .replace(/\\[LlOoKk]/g, '').replace(/\\[PN]/g, '\n').replace(/\\~/g, ' ').replace(/[{}]/g, '').replace(/\^J/g, '\n').replace(/\^I/g, ' ').replace(/\u0001/g, '\\');
  }
  const special = (s) => String(s).replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%');
  const CAP = 0.718; // Helvetica's capital height (AutoCAD's text height is the capitals' height)

  /** The DXF's sheets as page drawings: [{ name, w, h (pt), ops: [] }] and the pictures they use. */
  function layoutPages(text, o) {
    o = o || {};
    const d = new T.Doc(text), S = T.structure(d), rep = { sheets: [], pictures: 0, missing: new Set() };
    // tables
    const LAY = new Map(), LH = new Map(), LT = new Map(), ST = new Map();
    for (const r of S.T) {
      const t = typ(r);
      if (t === 'LAYER') { const nm = get(r, 2), fl = int(r, 70, 0), c = int(r, 62, 7); LAY.set(nm, { color: Math.abs(c) || 7, tc: get(r, 420) != null ? int(r, 420, 0) : null, off: c < 0 || (fl & 1) === 1 || get(r, 290) === '0' || /^\s*0\s*$/.test(String(get(r, 290, '1'))) || /^defpoints$/i.test(nm), lt: get(r, 6, 'Continuous'), lw: int(r, 370, -3) }); LH.set(get(r, 5), nm); }
      else if (t === 'LTYPE') { const pat = all(r, 49).map(Number).filter(Number.isFinite); if (pat.some((x) => x < 0)) LT.set(String(get(r, 2)).toUpperCase(), pat); }
      else if (t === 'STYLE') ST.set(get(r, 2), { wf: num(r, 41, 1) || 1, bold: /bd|bold|black|heavy/i.test(`${get(r, 3, '')} ${get(r, 1000, '')}`) });
    }
    const LTS = (() => { const v = d.headerVar('$LTSCALE'); const n = v ? parseFloat(v[1]) : 1; return Number.isFinite(n) && n > 0 ? n : 1; })();
    const IMGDEF = new Map(); for (const r of S.O) if (typ(r) === 'IMAGEDEF') IMGDEF.set(get(r, 5), String(get(r, 1, '')).replace(/^.*[\\/]/, ''));
    // block boxes (once each), for culling what a viewport does not show
    const bbMemo = new Map(), bbox = (name) => { if (!bbMemo.has(name)) bbMemo.set(name, T.blockBox(S, name, 0)); return bbMemo.get(name); };
    const boxMemo = new WeakMap(), boxOf = (r) => { if (!boxMemo.has(r)) boxMemo.set(r, boxOf0(r)); return boxMemo.get(r); };
    const boxOf0 = (r) => {
      if (typ(r) !== 'INSERT') return T.drawnBox(S, r);
      const b = S.blocks.get(get(r, 2)), bb = bbox(get(r, 2)), ix = num(r, 10, 0), iy = num(r, 20, 0);
      if (!b || !bb) return [ix, iy, ix, iy];
      const bx = num(b.begin, 10, 0), by = num(b.begin, 20, 0), sx = num(r, 41, 1), sy = num(r, 42, 1), a = num(r, 50, 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const P = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([u, v]) => { const X = (u - bx) * sx, Y = (v - by) * sy; return [ix + X * c - Y * s, iy + X * s + Y * c]; });
      return [Math.min(...P.map((q) => q[0])), Math.min(...P.map((q) => q[1])), Math.max(...P.map((q) => q[0])), Math.max(...P.map((q) => q[1]))];
    };
    const images = new Map(); // file -> { idx, w, h }
    const imageOf = (file) => {
      if (!file) return null;
      if (images.has(file)) return images.get(file);
      const src = o.images && (o.images[file] || o.images[file.toLowerCase()]); let im = null;
      if (src) { try { const bytes = src.bytes || src, info = R.jpegInfo(bytes); im = { idx: images.size, bytes, ...info }; } catch (e) { im = null; } }
      if (!im) rep.missing.add(file);
      images.set(file, im); return im;
    };

    function colorOf(r, inh) {
      const tc = get(r, 420); if (tc != null) { const n = parseInt(tc, 10); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      const c = int(r, 62, 256);
      if (c === 0) return inh.color;
      if (c !== 256 && c > 0 && c < 256) return ACI[c];
      const L = LAY.get(get(r, 8)) || LAY.get('0');
      if (get(r, 8) === '0' && inh.layer0) return inh.color; // in a block, layer 0 takes the insert's colour
      if (L && L.tc != null) return [(L.tc >> 16) & 255, (L.tc >> 8) & 255, L.tc & 255];
      return ACI[L ? L.color : 7] || [0, 0, 0];
    }
    const lwOf = (r, inh) => { let w = int(r, 370, -1); if (w === -2) return inh.lw; if (w === -1) { const L = LAY.get(get(r, 8)); w = L ? L.lw : -3; } return w >= 0 ? w : -3; };
    const ltOf = (r, inh) => { let n = String(get(r, 6, 'BYLAYER')).toUpperCase(); if (n === 'BYBLOCK') return inh.lt; if (n === 'BYLAYER') { const L = LAY.get(get(r, 8)); n = String(L ? L.lt : 'CONTINUOUS').toUpperCase(); } return LT.get(n) || null; };

    /** Draws records with M (to page pt); ctx: { ops, k (pt per paper unit), frozen, inh, depth, page box for culling } */
    function draw(recs, M, ctx) {
      const { ops } = ctx;
      for (let n = 0; n < recs.length; n++) {
        const r = recs[n], t = typ(r), lay = get(r, 8, '0');
        if (t === 'SEQEND' || t === 'ATTDEF' || t === 'VIEWPORT' || t === 'VERTEX') continue;
        const L = LAY.get(lay); if ((L && L.off) || ctx.frozen.has(lay) || int(r, 60, 0) === 1) { if (t === 'POLYLINE') while (n + 1 < recs.length && typ(recs[n + 1]) === 'VERTEX') n++; continue; }
        if (ctx.cull && t !== 'ATTRIB') { const b = boxOf(r); if (b && (b[2] < ctx.cull[0] || b[0] > ctx.cull[2] || b[3] < ctx.cull[1] || b[1] > ctx.cull[3])) { if (t === 'POLYLINE') while (n + 1 < recs.length && typ(recs[n + 1]) === 'VERTEX') n++; continue; } }
        const col = colorOf(r, ctx.inh), lwv = lwOf(r, ctx.inh), pat = ltOf(r, ctx.inh), ocs = num(r, 230, 1) < 0 && !['LINE', 'MTEXT', 'POINT', 'IMAGE'].includes(t) ? mul(M, SC(-1, 1)) : M;
        const lwPt = (lwv >= 0 ? Math.max(0.05, lwv / 100) : 0.18) * 72 / 25.4;
        const rgb = (c) => `${f4(c[0] / 255)} ${f4(c[1] / 255)} ${f4(c[2] / 255)}`;
        const dash = (sc) => { if (!pat) return ''; const L2 = pat.map((x) => Math.max(Math.abs(x) * LTS * num(r, 48, 1) * sc, x === 0 ? 0.5 : 0.01)); return L2.reduce((a, b) => a + b, 0) < 1.5 ? '' : `[${L2.map(f2).join(' ')}] 0 d `; };
        const stroke = (P, closed, w) => {
          if (P.length < 2) return;
          const Q = P.map(([x, y]) => ap(ocs, x, y));
          ops.push(`q ${rgb(col)} RG ${f2(w != null ? w : lwPt)} w 1 J 1 j ${dash(ctx.ltk || ctx.k)}${f2(Q[0][0])} ${f2(Q[0][1])} m ${Q.slice(1).map((q) => `${f2(q[0])} ${f2(q[1])} l`).join(' ')}${closed ? ' h' : ''} S Q`);
        };
        const fill = (loops) => {
          const parts = loops.filter((P) => P.length > 2).map((P) => { const Q = P.map(([x, y]) => ap(ocs, x, y)); return `${f2(Q[0][0])} ${f2(Q[0][1])} m ${Q.slice(1).map((q) => `${f2(q[0])} ${f2(q[1])} l`).join(' ')} h`; });
          if (parts.length) ops.push(`q ${rgb(col)} rg ${parts.join(' ')} f* Q`);
        };
        if (t === 'LINE') stroke([[num(r, 10, 0), num(r, 20, 0)], [num(r, 11, 0), num(r, 21, 0)]]);
        else if (t === 'LWPOLYLINE') {
          const V = []; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 10) V.push([+v, 0, 0]); else if (c === 20 && V.length) V[V.length - 1][1] = +v; else if (c === 42 && V.length) V[V.length - 1][2] = +v; }
          const closed = (int(r, 70, 0) & 1) === 1, w = num(r, 43, 0);
          stroke(bulgePts(V, closed), closed, w > 0 ? Math.max(lwPt, w * scaleOf(ocs)) : null);
        } else if (t === 'POLYLINE') {
          const V = []; while (n + 1 < recs.length && typ(recs[n + 1]) === 'VERTEX') { const v = recs[++n]; V.push([num(v, 10, 0), num(v, 20, 0), num(v, 42, 0)]); }
          const closed = (int(r, 70, 0) & 1) === 1; stroke(bulgePts(V, closed), closed);
        } else if (t === 'CIRCLE' || t === 'ARC') {
          const cx = num(r, 10, 0), cy = num(r, 20, 0), q = num(r, 40, 0); let a0 = t === 'ARC' ? num(r, 50, 0) : 0, a1 = t === 'ARC' ? num(r, 51, 360) : 360; if (a1 <= a0) a1 += 360;
          const N = Math.max(12, Math.ceil((a1 - a0) / 6)), P = []; for (let i = 0; i <= N; i++) { const a = (a0 + (a1 - a0) * i / N) * Math.PI / 180; P.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]); }
          stroke(P, t === 'CIRCLE');
        } else if (t === 'ELLIPSE') {
          const cx = num(r, 10, 0), cy = num(r, 20, 0), mx = num(r, 11, 1), my = num(r, 21, 0), k = num(r, 40, 1); let p0 = num(r, 41, 0), p1 = num(r, 42, 2 * Math.PI); if (p1 <= p0) p1 += 2 * Math.PI;
          const N = Math.max(16, Math.ceil((p1 - p0) / 0.1)), P = []; for (let i = 0; i <= N; i++) { const p = p0 + (p1 - p0) * i / N, c = Math.cos(p), s = Math.sin(p); P.push([cx + mx * c - my * k * s, cy + my * c + mx * k * s]); }
          stroke(P, false);
        } else if (t === 'SPLINE') stroke(splinePts(r), (int(r, 70, 0) & 1) === 1);
        else if (t === 'SOLID' || t === 'TRACE' || t === '3DFACE') {
          const P = [[num(r, 10, 0), num(r, 20, 0)], [num(r, 11, 0), num(r, 21, 0)], [num(r, 13, num(r, 12, 0)), num(r, 23, num(r, 22, 0))], [num(r, 12, 0), num(r, 22, 0)]];
          if (t === '3DFACE') stroke([P[0], P[1], [num(r, 12, 0), num(r, 22, 0)], [num(r, 13, 0), num(r, 23, 0)]], true); else fill([P]);
        } else if (t === 'HATCH') { const H = hatchLoops(r); if (H.solid) fill(H.loops); }
        else if (t === 'LEADER') { const X = all(r, 10).map(Number), Y = all(r, 20).map(Number); stroke(X.map((x, i) => [x, Y[i]])); }
        else if (t === 'TEXT' || t === 'ATTRIB') { if (t === 'ATTRIB' && (int(r, 70, 0) & 1)) continue; textOps(r, ocs, col, ops); }
        else if (t === 'MTEXT') mtextOps(r, M, col, ops);
        else if (t === 'IMAGE') {
          const file = IMGDEF.get(get(r, 340)), im = imageOf(file), x = num(r, 10, 0), y = num(r, 20, 0), U = [num(r, 11, 0) * num(r, 13, 0), num(r, 21, 0) * num(r, 13, 0)], V = [num(r, 12, 0) * num(r, 23, 0), num(r, 22, 0) * num(r, 23, 0)];
          const o0 = ap(M, x, y), u = lin(M, U[0], U[1]), v = lin(M, V[0], V[1]);
          if (im) { ops.push(`q ${f4(u[0])} ${f4(u[1])} ${f4(v[0])} ${f4(v[1])} ${f2(o0[0])} ${f2(o0[1])} cm /Im${im.idx} Do Q`); rep.pictures++; }
          else ops.push(`q 0.6 0.6 0.6 RG 0.3 w ${f2(o0[0])} ${f2(o0[1])} m ${f2(o0[0] + u[0])} ${f2(o0[1] + u[1])} l ${f2(o0[0] + u[0] + v[0])} ${f2(o0[1] + u[1] + v[1])} l ${f2(o0[0] + v[0])} ${f2(o0[1] + v[1])} l h S Q`);
        } else if (t === 'INSERT' || t === 'DIMENSION') {
          if (ctx.depth > 8) continue;
          const b = S.blocks.get(get(r, 2)); if (!b) continue;
          let BM = M;
          if (t === 'INSERT') { const bx = num(b.begin, 10, 0), by = num(b.begin, 20, 0); BM = mul(mul(mul(mul(ocs, TR(num(r, 10, 0), num(r, 20, 0))), RO(num(r, 50, 0) * Math.PI / 180)), SC(num(r, 41, 1), num(r, 42, 1))), TR(-bx, -by)); }
          const inh = { color: col, layer0: true, lw: lwv >= 0 ? lwv : ctx.inh.lw, lt: pat };
          draw(b.ents, BM, { ...ctx, inh, depth: ctx.depth + 1, cull: null, ltk: (ctx.ltk || ctx.k) });
        }
      }
    }
    function bulgePts(V, closed) {
      const loop = closed && V.length ? V.concat([V[0]]) : V, P = [];
      for (let i = 0; i < loop.length; i++) {
        const [x, y, b] = loop[i]; P.push([x, y]);
        if (b && i + 1 < loop.length) {
          const [x2, y2] = loop[i + 1], th = 4 * Math.atan(b), ch = Math.hypot(x2 - x, y2 - y); if (!(ch > 0)) continue;
          const rad = ch / (2 * Math.sin(th / 2)), mx = (x + x2) / 2, my = (y + y2) / 2, nx = -(y2 - y) / ch, ny = (x2 - x) / ch, dd = rad * Math.cos(th / 2), cx = mx + nx * dd, cy = my + ny * dd, a0 = Math.atan2(y - cy, x - cx), R0 = Math.abs(rad);
          const N = Math.max(4, Math.ceil(Math.abs(th) / 0.15)); for (let k = 1; k < N; k++) { const a = a0 + th * k / N; P.push([cx + R0 * Math.cos(a), cy + R0 * Math.sin(a)]); }
        }
      }
      return P;
    }
    function splinePts(r) {
      const fx = all(r, 11).map(Number), fy = all(r, 21).map(Number); if (fx.length > 1) return fx.map((x, i) => [x, fy[i]]);
      const cx = all(r, 10).map(Number), cy = all(r, 20).map(Number), K = all(r, 40).map(Number), W = all(r, 41).map(Number), p = int(r, 71, 3), C = cx.map((x, i) => [x, cy[i]]);
      if (C.length < 2 || K.length !== C.length + p + 1) return C;
      const out = [], t0 = K[p], t1 = K[C.length], N = Math.max(16, C.length * 8);
      for (let s = 0; s <= N; s++) {
        const u = Math.min(t0 + (t1 - t0) * s / N, t1 - 1e-12); let k = p; while (k < C.length - 1 && u >= K[k + 1]) k++;
        const D = []; for (let j = 0; j <= p; j++) { const w = W.length ? W[k - p + j] || 1 : 1, q = C[k - p + j]; D.push([q[0] * w, q[1] * w, w]); }
        for (let rr = 1; rr <= p; rr++) for (let j = p; j >= rr; j--) { const i = k - p + j, den = K[i + p - rr + 1] - K[i], a = den ? (u - K[i]) / den : 0; D[j] = [0, 1, 2].map((q) => (1 - a) * D[j - 1][q] + a * D[j][q]); }
        out.push([D[p][0] / D[p][2], D[p][1] / D[p][2]]);
      }
      return out;
    }
    function hatchLoops(r) {
      const k0 = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbHatch'), loops = []; if (k0 < 0) return { solid: false, loops };
      let i = k0 + 1; const next = () => r[i++] || [0, ''], val = (c) => { while (i < r.length && r[i][0] !== c) i++; return i < r.length ? r[i++][1] : null; };
      let solid = false, np = 0;
      // the header: elevation point, extrusion, pattern name, solid fill flag, associativity, number of paths
      while (i < r.length) { const [c, v] = next(); if (c === 70) solid = parseInt(v, 10) === 1; if (c === 91) { np = parseInt(v, 10) || 0; break; } }
      for (let pth = 0; pth < np && i < r.length; pth++) {
        const flags = parseInt(val(92), 10) || 0, P = [];
        if (flags & 2) {
          const hasB = parseInt(val(72), 10) || 0; val(73); const nv = parseInt(val(93), 10) || 0, V = [];
          for (let q = 0; q < nv; q++) { const x = +val(10), y = +val(20); let b = 0; if (hasB && r[i] && r[i][0] === 42) b = +next()[1]; V.push([x, y, b]); }
          P.push(...bulgePts(V, true));
        } else {
          const ne = parseInt(val(93), 10) || 0;
          for (let e = 0; e < ne; e++) {
            const et = parseInt(val(72), 10) || 0;
            if (et === 1) { const a = [+val(10), +val(20)], b = [+val(11), +val(21)]; if (!P.length) P.push(a); P.push(b); }
            else if (et === 2 || et === 3) {
              const cx = +val(10), cy = +val(20); let mx = 0, my = 0; if (et === 3) { mx = +val(11); my = +val(21); }
              const rr = +val(40), a0 = +val(50), a1 = +val(51), ccw = (parseInt(val(73), 10) || 0) !== 0;
              let s0 = a0 * Math.PI / 180, s1 = a1 * Math.PI / 180; if (!ccw) { s0 = -s0; s1 = -s1; } if (s1 < s0) s1 += 2 * Math.PI;
              const N = Math.max(8, Math.ceil((s1 - s0) / 0.12));
              for (let q = 0; q <= N; q++) { const a = s0 + (s1 - s0) * q / N; if (et === 2) P.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); else { const c = Math.cos(a), s = Math.sin(a); P.push([cx + mx * c - my * rr * s, cy + my * c + mx * rr * s]); } }
            } else if (et === 4) { // a spline edge: its control points
              val(94); val(73); val(74); const nk = parseInt(val(95), 10) || 0, nc = parseInt(val(96), 10) || 0; for (let q = 0; q < nk; q++) val(40);
              for (let q = 0; q < nc; q++) P.push([+val(10), +val(20)]);
            }
          }
        }
        const ns = r[i] && r[i][0] === 97 ? parseInt(next()[1], 10) || 0 : 0; for (let q = 0; q < ns; q++) if (r[i] && r[i][0] === 330) i++;
        if (P.length > 2) loops.push(P);
      }
      return { solid, loops };
    }
    const enc = (s) => (R.pdfEsc ? R.pdfEsc(s) : String(s).replace(/[()\\]/g, (m) => `\\${m}`));
    const widthEm = (s, bold) => R.textWidth(s, 1, bold); // in em (font size 1)
    function textLine(ops, M, col, s, x, y, ang, h, wf, bold) { // (x, y): the baseline's left end, in the entity's space
      if (!s || !(h > 0)) return;
      const fs = h / CAP, c = Math.cos(ang), sn = Math.sin(ang), o0 = ap(M, x, y), u = lin(M, c * fs * wf, sn * fs * wf), v = lin(M, -sn * fs, c * fs);
      if (Math.hypot(v[0], v[1]) < 0.4) return; // under 0.4 pt: not readable
      ops.push(`BT ${f4(col[0] / 255)} ${f4(col[1] / 255)} ${f4(col[2] / 255)} rg /${bold ? 'F2' : 'F1'} 1 Tf ${f4(u[0])} ${f4(u[1])} ${f4(v[0])} ${f4(v[1])} ${f2(o0[0])} ${f2(o0[1])} Tm (${enc(s)}) Tj ET`);
    }
    function textOps(r, M, col, ops) {
      const s = special(get(r, 1, '')); if (!s.trim()) return;
      const h = num(r, 40, 2.5), st = ST.get(get(r, 7, 'Standard')) || { wf: 1, bold: false }, wf = get(r, 41) != null ? num(r, 41, 1) || 1 : st.wf, bold = st.bold;
      const ha = int(r, 72, 0), va = typ(r) === 'ATTRIB' ? int(r, 74, 0) : int(r, 73, 0), ang = num(r, 50, 0) * Math.PI / 180, fs = h / CAP;
      const w = widthEm(s, bold) * fs * wf;
      let ax = num(r, 10, 0), ay = num(r, 20, 0), dx = 0, dy = 0, wfx = wf;
      if (ha || va) { ax = num(r, 11, ax); ay = num(r, 21, ay); }
      if (ha === 3 || ha === 5) { const x0 = num(r, 10, 0), y0 = num(r, 20, 0), L = Math.hypot(ax - x0, ay - y0); if (L > 0 && w > 0) wfx = wf * L / w; ax = x0; ay = y0; }
      else dx = ha === 1 || ha === 4 ? -w / 2 : ha === 2 ? -w : 0;
      dy = ha === 4 ? -h / 2 : va === 1 ? 0.29 * h : va === 2 ? -h / 2 : va === 3 ? -h : 0;
      const c = Math.cos(ang), sn = Math.sin(ang);
      textLine(ops, M, col, s, ax + dx * c - dy * sn, ay + dx * sn + dy * c, ang, h, wfx, bold);
    }
    function mtextOps(r, M, col, ops) {
      const raw = all(r, 3).join('') + get(r, 1, ''), s = special(plain(raw)); if (!s.trim()) return;
      const h = num(r, 40, 2.5), st = ST.get(get(r, 7, 'Standard')) || { wf: 1, bold: false }, bold = st.bold || /\\f[^;|]*\|b1/i.test(raw), wf = st.wf;
      const fs = h / CAP, pitch = h * 5 / 3 * num(r, 44, 1), att = Math.min(9, Math.max(1, int(r, 71, 1))), ci = (att - 1) % 3, ri = Math.floor((att - 1) / 3), refW = num(r, 41, 0);
      const wOf = (l) => widthEm(l, bold) * fs * wf, lines = [];
      for (const para of s.split('\n')) { // wrapped at its box's width, as AutoCAD does
        if (!(refW > 0) || wOf(para) <= refW * 1.02) { lines.push(para); continue; }
        let cur = ''; for (const w of para.split(/(?<=\s)/)) { if (cur && wOf((cur + w).trimEnd()) > refW * 1.02) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur += w; } lines.push(cur.trimEnd());
      }
      const lw = lines.map(wOf), maxW = Math.max(0, ...lw), colW = refW > maxW * 0.5 ? refW : maxW;
      const Hh = h + pitch * (lines.length - 1), top = ri === 0 ? 0 : ri === 1 ? Hh / 2 : Hh, left = -(ci === 0 ? 0 : ci === 1 ? colW / 2 : colW);
      const al = /\\p[^;]*q?c[;,]|\\pxqc|\\pqc/.test(raw) ? 'c' : /\\pxqr|\\pqr/.test(raw) ? 'r' : /\\pxql|\\pql/.test(raw) ? 'l' : 'lcr'[ci];
      let dir = [num(r, 11, 1), num(r, 21, 0)]; const k50 = r.findIndex((p) => p[0] === 50), k101 = r.findIndex((p) => p[0] === 101);
      if (k50 > 0 && (k101 < 0 || k50 < k101) && get(r, 11) == null) dir = [Math.cos(num(r, 50, 0)), Math.sin(num(r, 50, 0))];
      const ang = Math.atan2(dir[1], dir[0]), c = Math.cos(ang), sn = Math.sin(ang), ax = num(r, 10, 0), ay = num(r, 20, 0);
      lines.forEach((l, i) => {
        if (!l.trim()) return;
        const dx = left + (al === 'c' ? (colW - lw[i]) / 2 : al === 'r' ? colW - lw[i] : 0), dy = top - h - i * pitch;
        textLine(ops, M, col, l, ax + dx * c - dy * sn, ay + dx * sn + dy * c, ang, h, wf, bold);
      });
    }

    // the sheets in their tab order
    const layouts = S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => int(a.rec, 71, 0) - int(b.rec, 71, 0));
    const MODEL = S.E.filter((r) => owner(r) === S.modelH && String(get(r, 67, '0')).trim() !== '1');
    const modelIns = new Set(MODEL.filter((r) => typ(r) === 'INSERT').map((r) => get(r, 5)));
    const model = []; for (const r of S.E) { const ow = owner(r); if ((ow === S.modelH && String(get(r, 67, '0')).trim() !== '1') || (typ(r) === 'ATTRIB' && modelIns.has(ow)) || (typ(r) === 'SEQEND' && modelIns.has(ow))) model.push(r); }
    const pages = [];
    for (const L of layouts) {
      if (o.only && !o.only.includes(L.name)) continue;
      const br = S.br.get(L.brh), bn = get(br, 2), ents = bn === '*Paper_Space' ? S.E.filter((e) => String(get(e, 67, '0')).trim() === '1') : (S.blocks.get(bn) || { ents: [] }).ents;
      // the paper: the layout's plot window, else what its sheet holds
      let win = [num(L.rec, 48, 0), num(L.rec, 49, 0), num(L.rec, 140, 0), num(L.rec, 141, 0)];
      if (!(win[2] - win[0] > 1 && win[3] - win[1] > 1)) {
        const B = ents.filter((e) => typ(e) !== 'VIEWPORT').map((e) => boxOf(e)).filter(Boolean);
        if (!B.length) continue;
        win = [Math.min(...B.map((b) => b[0])), Math.min(...B.map((b) => b[1])), Math.max(...B.map((b) => b[2])), Math.max(...B.map((b) => b[3]))];
      }
      const pw = Math.max(num(L.rec, 44, 420), num(L.rec, 45, 297)) * 72 / 25.4, ph = Math.min(num(L.rec, 44, 420), num(L.rec, 45, 297)) * 72 / 25.4;
      const land = win[2] - win[0] >= win[3] - win[1], W = land ? pw : ph, H = land ? ph : pw;
      const k = Math.min(W / (win[2] - win[0]), H / (win[3] - win[1])), ox = (W - (win[2] - win[0]) * k) / 2, oy = (H - (win[3] - win[1]) * k) / 2;
      const PM = [k, 0, 0, k, ox - win[0] * k, oy - win[1] * k], ops = [];
      // the viewports: what each shows of model space, clipped to it
      for (const vp of ents.filter((e) => typ(e) === 'VIEWPORT').slice(1)) { // (the first is the sheet itself; 68 / 69 are 0 on a sheet not open)
        if (int(vp, 69, 0) === 1 || (int(vp, 90, 0) & 131072)) continue; // the sheet's own, or turned off
        const vw = num(vp, 40, 0), vh = num(vp, 41, 0), mh = num(vp, 45, 0); if (!(vw > 0 && vh > 0 && mh > 0)) continue;
        const pcx = num(vp, 10, 0), pcy = num(vp, 20, 0), s = vh / mh, tw = num(vp, 51, 0) * Math.PI / 180;
        const tx = num(vp, 17, 0), ty = num(vp, 27, 0), vcx = num(vp, 12, 0), vcy = num(vp, 22, 0);
        // model -> paper: (x, y) - target, turned by -twist, - view centre, scaled, + the viewport's centre
        const VM = mul(mul(mul(TR(pcx, pcy), SC(s, s)), TR(-vcx, -vcy)), mul(RO(-tw), TR(-tx, -ty)));
        const frozen = new Set([...all(vp, 331), ...all(vp, 341)].map((h2) => LH.get(h2)).filter(Boolean)); // 331 (341: G-eSAA before v2.42.10)
        const half = Math.hypot(vw, vh) / 2 / s, mc = ap(mul(RO(tw), TR(0, 0)), vcx, vcy), cull = [mc[0] + tx - half, mc[1] + ty - half, mc[0] + tx + half, mc[1] + ty + half];
        const a = ap(PM, pcx - vw / 2, pcy - vh / 2), b = ap(PM, pcx + vw / 2, pcy + vh / 2);
        ops.push(`q ${f2(a[0])} ${f2(a[1])} ${f2(b[0] - a[0])} ${f2(b[1] - a[1])} re W n`);
        draw(model, mul(PM, VM), { ops, k: k * s, ltk: k, frozen, inh: { color: [0, 0, 0], lw: -3, lt: null }, depth: 0, cull });
        ops.push('Q');
      }
      draw(ents, PM, { ops, k, ltk: k, frozen: new Set(), inh: { color: [0, 0, 0], lw: -3, lt: null }, depth: 0, cull: null });
      pages.push({ name: L.name, w: W, h: H, ops });
      rep.sheets.push(L.name);
    }
    return { pages, images: [...images.values()].filter(Boolean), report: { sheets: rep.sheets, pictures: rep.pictures, missing: [...rep.missing] } };
  }

  /** A PDF of the pages (Helvetica, JPEG pictures; each page's drawing compressed when deflate is given). */
  async function writePdf(pages, images, o) {
    const parts = []; let pos = 0; const offsets = [];
    const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const push = (x) => { const u = typeof x === 'string' ? latin1(x) : x; parts.push(u); pos += u.length; };
    const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    const firstImg = 5, firstPage = firstImg + images.length, info = firstPage + pages.length * 2;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`));
    obj(3, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    obj(4, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    images.forEach((im, i) => obj(firstImg + i, () => {
      const cs = im.comps === 1 ? '/DeviceGray' : im.comps === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
      push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream');
    }));
    const xo = images.map((im, i) => `/Im${im.idx} ${firstImg + i} 0 R`).join(' ');
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i], pn = firstPage + i * 2, raw = latin1(pg.ops.join('\n'));
      let data = raw, filter = '';
      if (o && o.deflate) { try { data = await o.deflate(raw); filter = ' /Filter /FlateDecode'; } catch (e) { data = raw; filter = ''; } }
      obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(pg.w)} ${f2(pg.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${pn + 1} 0 R >>`));
      obj(pn + 1, () => { push(`<< /Length ${data.length}${filter} >>\nstream\n`); push(data); push('\nendstream'); });
    }
    const esc = (s) => String(s || '').replace(/[()\\]/g, (m) => `\\${m}`).replace(/[^\x20-\x7e]/g, '?');
    obj(info, () => push(`<< /Title (${esc(o && o.title)}) /Producer (G-eSAA) /Creator (G-eSAA plan sheets from the DXF) >>`));
    const xref = pos;
    push(`xref\n0 ${info + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= info; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  async function toPdf(text, o) {
    const L = layoutPages(text, o || {}), pdf = await writePdf(L.pages, L.images, o || {});
    /** @type {any} */ (pdf).report = L.report;
    return pdf;
  }
  return { toPdf, layoutPages, writePdf, ACI, plain };
}));
