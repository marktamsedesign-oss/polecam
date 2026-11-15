/* G-eSAA · Splicing details (demo engine).
   Draws the splicing of a project's fiber as A3 sheets, from its points, cables and links:
     Access OSP   · single line diagram: homing to homing, through closures and dummy NAPs (new red, existing blue)
                  · detailed: drawn like the ODN's: the homing ODF, every cable a bundle of fibers through its closures (splices inside),
                    the far ODF or dummy NAP (pole-mounted small cell)
     Broadband    · single line diagram: OLT ODF, feeder, mains, 6F drop cables, lines (LCP) and NAPs, with the counts
       (OLT/ODN)  · detailed: one drawing: the ODF, the feeder closure, each main up to its closure, then each 6F drop through its NAPs (1:4, 1:8)
   Fibers are given out by the engine: a link takes the lowest free run of fibers on each cable it uses, so a straight splice keeps its
   numbers (F1-6 to F1-6) and an existing cable gives its first vacant fibers (F13-18 when 1-12 are in use).
   Sheets are millimetres, y up, A3 landscape. Each sheet is a list of primitives: the writers make the SVG preview, the PDF and the DXF (R12). */
(function (root) {
  'use strict';

  /* ---------- fiber ranges ---------- */
  function parseRanges(s) {
    const out = new Set();
    String(s == null ? '' : s).toUpperCase().replace(/[FP]/g, '').replace(/\s*-\s*/g, '-').split(/[^0-9-]+/).forEach(part => {
      const m = /^(\d+)(?:-(\d+))?$/.exec(part); if (!m) return;
      let a = +m[1], b = m[2] ? +m[2] : a; if (b < a) { const t = a; a = b; b = t; }
      for (let i = Math.max(1, a); i <= b && i <= 9999; i++) out.add(i);
    });
    return [...out].sort((x, y) => x - y);
  }
  function runs(arr) { const a = [...new Set(arr)].sort((x, y) => x - y), r = []; for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; r.push([a[i], a[j]]); i = j + 1; } return r; }
  function fmtRanges(arr, pre) { pre = pre || ''; return runs(arr).map(([a, b]) => pre + (a === b ? a : a + '-' + b)).join(', '); }
  const seq = (a, n) => Array.from({ length: Math.max(0, n) }, (_, i) => a + i);
  const pad = (n, w) => String(n).padStart(w, '0');
  const lenTxt = m => { m = +m; if (!(m > 0)) return ''; return m < 1000 ? Math.round(m) + 'm' : (Math.round(m / 100) / 10) + 'km'; };

  /* ---------- colours (TIA-598 fiber and tube order) ---------- */
  const FIBER = [['BL', 'BLUE', '#1f5fd6', 5], ['OR', 'ORANGE', '#f28c28', 30], ['GR', 'GREEN', '#159947', 3], ['BR', 'BROWN', '#8b5a2b', 34], ['SL', 'SLATE', '#7a8691', 8], ['WH', 'WHITE', '#ffffff', 7],
    ['RD', 'RED', '#d71920', 1], ['BK', 'BLACK', '#1a1a1a', 250], ['YL', 'YELLOW', '#f2c500', 2], ['VL', 'VIOLET', '#7b3fbf', 200], ['RS', 'ROSE', '#f08fb0', 221], ['AQ', 'AQUA', '#19c3c9', 4]]
    .map(([ab, name, rgb, aci]) => ({ ab, name, rgb, aci }));
  function fiberColor(f, fpt) { fpt = fpt > 0 ? fpt : 12; const i = (f - 1) % fpt, t = Math.floor((f - 1) / fpt); return { fiber: FIBER[i % 12], tube: FIBER[t % 12], t: t + 1, i: i + 1 }; }

  /* layer: [DXF colour (ACI), screen and PDF colour, line weight mm, dashed] */
  const LAYERS = {
    FRAME: [7, '#111111', 0.5], TITLE: [7, '#111111', 0.25], TEXT: [7, '#111111', 0.2], NOTE: [8, '#6b6f76', 0.18],
    FOC_NEW: [1, '#d71920', 0.45, 1], FOC_EXIST: [5, '#1f5fd6', 0.45, 1], SITE_NEW: [1, '#d71920', 0.55], SITE_EXIST: [5, '#1f5fd6', 0.55],
    CLOSURE_NEW: [1, '#d71920', 0.25], CLOSURE_EXIST: [5, '#6f9bd8', 0.25], DNAP_NEW: [1, '#d71920', 0.4], DNAP_EXIST: [5, '#1f5fd6', 0.4],
    LENGTH: [3, '#3ddc5f', 0.1], FIBER: [7, '#111111', 0.2], FIBER_USED: [1, '#d71920', 0.32], SPLICE: [7, '#111111', 0.2],
    SPLITTER: [7, '#111111', 0.28], NAP: [7, '#111111', 0.3], NAP_SYM: [3, '#16a34a', 0.3], CABLE: [4, '#0aa5c8', 0.45], CLOSURE_BOX: [4, '#0aa5c8', 0.25, 1],
    HILITE: [2, '#ffe100', 0.1], TABLE: [7, '#111111', 0.2], LEGEND: [7, '#111111', 0.2], GRID: [9, '#c9cdd3', 0.18, 1]
  };
  const layerRGB = l => (LAYERS[l] || LAYERS.TEXT)[1];

  /* ---------- text widths (Helvetica; h is the capital height, as in a DXF) ---------- */
  const HV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const HVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const CAP = 0.718; /* Helvetica's capital height, of the font size */
  function textW(s, h, bold) { const T = bold ? HVB : HV; let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? T[c - 32] : 556; } return w / 1000 * h / CAP; }
  function wrap(s, h, width, bold) {
    const words = String(s).split(' '), out = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && textW(t, h, bold) > width) { out.push(cur); cur = w; } else cur = t; }
    out.push(cur); return out;
  }

  /* ---------- the drawing: primitives ---------- */
  class Gfx {
    constructor() { this.p = []; }
    pl(pts, lay, o) { o = o || {}; if (pts.length > 1) this.p.push({ k: 'pl', pts: pts.map(q => [q[0], q[1]]), close: !!o.close, lay, col: o.col || null, lw: o.lw || 0 }); return this; }
    ln(x1, y1, x2, y2, lay, o) { return this.pl([[x1, y1], [x2, y2]], lay, o); }
    rect(x, y, w, h, lay, o) { return this.pl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], lay, Object.assign({}, o, { close: true })); }
    fl(pts, lay, o) { o = o || {}; this.p.push({ k: 'fl', pts: pts.map(q => [q[0], q[1]]), lay, col: o.col || null }); return this; }
    frect(x, y, w, h, lay, o) { return this.fl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], lay, o); }
    ci(x, y, r, lay, o) { o = o || {}; this.p.push({ k: 'ci', c: [x, y], r, lay, col: o.col || null, fill: !!o.fill, lw: o.lw || 0 }); return this; }
    /* x, y: where the text sits; al l/c/r; va b (baseline), m (middle), t (top); rot in degrees */
    tx(x, y, s, h, lay, o) {
      o = o || {}; s = String(s == null ? '' : s); if (!s.trim()) return this;
      const r = (o.rot || 0) * Math.PI / 180, d = o.va === 'm' ? -0.5 * h : o.va === 't' ? -h : 0;
      this.p.push({ k: 'tx', p: [x - Math.sin(r) * d, y + Math.cos(r) * d], s, h, lay, al: o.al || 'l', rot: o.rot || 0, bold: !!o.bold, col: o.col || null });
      return this;
    }
    /* lines of text going down from y; returns the y under the last line */
    txs(x, y, lines, h, lay, o) { const g = (o && o.gap) || 1.55; lines.forEach((ln, i) => { const L = typeof ln === 'string' ? { s: ln } : ln; this.tx(x, y - i * h * g, L.s, L.h || h, L.lay || lay, Object.assign({}, o, L.o)); }); return y - lines.length * h * g; }
  }
  function primBox(prims) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const add = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
    for (const p of prims) {
      if (p.k === 'pl' || p.k === 'fl') p.pts.forEach(q => add(q[0], q[1]));
      else if (p.k === 'ci') { add(p.c[0] - p.r, p.c[1] - p.r); add(p.c[0] + p.r, p.c[1] + p.r); }
      else if (p.k === 'tx') {
        const w = textW(p.s, p.h, p.bold), r = p.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), a = p.al === 'c' ? -w / 2 : p.al === 'r' ? -w : 0;
        for (const [u, v] of [[a, -0.25 * p.h], [a + w, -0.25 * p.h], [a, 1.05 * p.h], [a + w, 1.05 * p.h]]) add(p.p[0] + u * c - v * s, p.p[1] + u * s + v * c);
      }
    }
    return [x0, y0, x1, y1];
  }
  function xf(prims, k, dx, dy) {
    const P = q => [q[0] * k + dx, q[1] * k + dy];
    return prims.map(p => {
      const o = Object.assign({}, p);
      if (p.pts) o.pts = p.pts.map(P); if (p.c) { o.c = P(p.c); o.r = p.r * k; } if (p.k === 'tx') { o.p = P(p.p); o.h = p.h * k; }
      if (p.lw) o.lw = Math.max(0.1, p.lw * Math.min(1, k * 1.25));
      return o;
    });
  }
  /* a block: its primitives moved so that its top left corner is at 0, 0 (it reaches down to -h) */
  function block(G, title) { const b = primBox(G.p); if (!isFinite(b[0])) return null; return { w: b[2] - b[0], h: b[3] - b[1], prims: xf(G.p, 1, -b[0], -b[3]), title }; }

  /* ---------- sheets: A3 landscape, frame, heading and title block ---------- */
  const SH = { W: 420, H: 297, M: 10, TB: 36 };
  const AREA = { x0: 16, y0: SH.M + SH.TB + 6, x1: SH.W - 16, y1: SH.H - SH.M - 14 };
  const projLine = t => [t.project, t.planId, t.site].map(s => String(s || '').trim()).filter(Boolean).join('_').toUpperCase() || 'PROJECT NAME_PLAN ID_SITENAME';
  function frame(G, t, head, n, N) {
    const { W, H, M, TB } = SH, y0 = M, y1 = M + TB;
    G.rect(M, M, W - 2 * M, H - 2 * M, 'FRAME');
    G.tx(M + 6, H - M - 9, head, 5.2, 'TITLE', { bold: true });
    G.tx(W - M - 6, H - M - 9, 'SHEET ' + n + ' OF ' + N, 2.6, 'TITLE', { al: 'r' });
    G.ln(M, y1, W - M, y1, 'FRAME'); G.ln(M, y0 + 6, W - M, y0 + 6, 'TITLE');
    G.tx(M + 3, y0 + 2.2, String(t.note || 'THIS DRAWING IS FOR THE PROJECT TEAM ONLY. DO NOT SHARE OUTSIDE THE PROJECT.').toUpperCase(), 2, 'TITLE');
    const xL = M + 56; G.ln(xL, y0 + 6, xL, y1, 'TITLE');
    G.tx((M + xL) / 2, y0 + 6 + 15, t.company ? String(t.company).toUpperCase() : '[COMPANY LOGO]', 3, t.company ? 'TITLE' : 'NOTE', { al: 'c', va: 'm', bold: true });
    const xT = xL + 182, cx = (xL + xT) / 2; G.ln(xT, y0 + 6, xT, y1, 'TITLE');
    G.tx(cx, y1 - 7, head, 4, 'TITLE', { al: 'c', bold: true });
    G.tx(cx, y1 - 12.6, projLine(t), 2.8, 'TITLE', { al: 'c', bold: true });
    const yF = y0 + 6 + 12; G.ln(xL, yF, xT, yF, 'TITLE');
    const F = [['EXCHANGE', t.exchange], ['DWG. NO.', t.dwgNo], ['SCALE', 'NTS'], ['SHEET NO.', n + ' / ' + N], ['ISSUE DATE', t.date]], fw = 182 / F.length;
    F.forEach(([lab, v], i) => { const x = xL + i * fw; if (i) G.ln(x, y0 + 6, x, yF, 'TITLE'); G.tx(x + 1.5, yF - 2.6, lab, 1.7, 'TITLE'); G.tx(x + fw / 2, y0 + 8.2, String(v || '').toUpperCase(), 2.4, 'TITLE', { al: 'c' }); });
    const S = (t.sign && t.sign.length ? t.sign : [{}, {}, {}]).slice(0, 3), sw = (W - M - xT) / 3;
    for (let j = 0; j < 3; j++) {
      const x = xT + j * sw, sg = S[j] || {}; if (j) G.ln(x, y0 + 6, x, y1, 'TITLE');
      G.ln(x + 5, y0 + 6 + 12, x + sw - 5, y0 + 6 + 12, 'TITLE');
      G.tx(x + sw / 2, y0 + 6 + 14, String(sg.name || '').toUpperCase(), 2.4, 'TITLE', { al: 'c', bold: true });
      wrap(String(sg.role || '').toUpperCase(), 1.8, sw - 6).slice(0, 2).forEach((ln, k) => G.tx(x + sw / 2, y0 + 6 + 8.6 - k * 2.9, ln, 1.8, 'TITLE', { al: 'c' }));
    }
  }
  /* blocks onto sheets: left to right, then down; a block too big for one sheet is made smaller to fit */
  function paginate(blocks, opt) {
    opt = opt || {}; const A = opt.area || AREA, gap = opt.gap || 9, aw = A.x1 - A.x0, ah = A.y1 - A.y0, pages = [];
    let cur = null, x = 0, yTop = 0, rowH = 0;
    const newPage = () => { cur = []; pages.push(cur); x = A.x0; yTop = A.y1; rowH = 0; };
    newPage();
    for (const b of blocks.filter(Boolean)) {
      const s = Math.min(opt.grow || 1, aw / b.w, ah / b.h), w = b.w * s, h = b.h * s;
      if (x > A.x0 && x + w > A.x1 + 0.01) { x = A.x0; yTop -= rowH + gap; rowH = 0; }
      if (yTop - h < A.y0 - 0.01 && cur.length) newPage();
      /* band: a drawing low enough for the top row of the reference grid goes in the middle of that row, clear of the grid's line */
      const band = opt.band && h <= 0.8 * ah / opt.band, px = opt.center ? A.x0 + (aw - w) / 2 : x, py = band ? A.y1 - (ah / opt.band - h) / 2 : opt.center ? A.y1 - (ah - h) / 2 : yTop;
      cur.push(...xf(b.prims, s, px, py)); x += w + gap; rowH = Math.max(rowH, h);
    }
    return pages;
  }
  function sheetsOf(pages, head, extra) { return pages.map(prims => ({ head, prims: prims.concat(extra ? extra() : []) })); }
  function finishSheets(list, title) {
    const N = list.length;
    return list.map((sh, i) => { const G = new Gfx(); frame(G, title || {}, sh.head, i + 1, N); return { name: sh.head + ' ' + (i + 1), head: sh.head, prims: G.p.concat(sh.prims) }; });
  }

  /* small table: cols [{t, w, al}], rows of strings (long text wraps inside its cell); returns the y under it */
  function table(G, x, y, cols, rows, o) {
    o = o || {}; const th = o.th || 1.9, pd = 1.2, W = cols.reduce((a, c) => a + c.w, 0);
    const lineH = th * 1.6, head = cols.map(c => wrap(c.t, th, c.w - 2 * pd, true));
    const hh = Math.max(...head.map(l => l.length)) * lineH + 2 * pd;
    G.frect(x, y - hh, W, hh, 'HILITE', { col: { rgb: '#eef1f4', aci: 9 } });
    let cx = x; cols.forEach((c, i) => { head[i].forEach((ln, k) => G.tx(c.al === 'c' ? cx + c.w / 2 : cx + pd, y - pd - th - k * lineH, ln, th, 'TABLE', { bold: true, al: c.al === 'c' ? 'c' : 'l' })); cx += c.w; });
    let yy = y - hh;
    for (const r of rows) {
      const cells = cols.map((c, i) => { const v = r[i]; const s = v && typeof v === 'object' ? v.s : v; return { lines: wrap(String(s == null ? '' : s), th, c.w - 2 * pd, v && v.bold), o: v && typeof v === 'object' ? v : {} }; });
      const rh = Math.max(...cells.map(c => c.lines.length)) * lineH + 2 * pd;
      cx = x; cells.forEach((c, i) => { const col = cols[i]; c.lines.forEach((ln, k) => G.tx(col.al === 'c' ? cx + col.w / 2 : cx + pd, yy - pd - th - k * lineH, ln, th, c.o.lay || 'TABLE', { al: col.al === 'c' ? 'c' : 'l', bold: c.o.bold, col: c.o.col })); cx += col.w; });
      G.ln(x, yy - rh, x + W, yy - rh, 'TABLE'); yy -= rh;
    }
    G.rect(x, yy, W, y - yy, 'TABLE'); G.ln(x, y - hh, x + W, y - hh, 'TABLE');
    cx = x; cols.slice(0, -1).forEach(c => { cx += c.w; G.ln(cx, y, cx, yy, 'TABLE'); });
    return yy;
  }

  /* ---------- symbols ---------- */
  function pentagon(G, x, y, r, lay) { const pts = []; for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } G.fl(pts, lay); G.pl(pts, 'TEXT', { close: true, lw: 0.15 }); }
  function fduIcon(G, x, y, lay, w, h) {
    w = w || 22; h = h || 13; G.frect(x - w / 2, y - h / 2, w, h, 'HILITE', { col: { rgb: '#ffffff', aci: 7 } }); G.rect(x - w / 2, y - h / 2, w, h, lay, { lw: 0.6 });
    G.rect(x - w / 2 + 1.6, y - h / 2 + 1.6, w - 3.2, h - 3.2, 'NOTE');
    const cols = Math.max(4, Math.round((w - 5) / 2.2)), rows = Math.max(2, Math.round((h - 4.5) / 2.9)), dx = (w - 5) / cols, dy = (h - 4.5) / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) G.rect(x - w / 2 + 2.5 + k * dx + dx * 0.15, y - h / 2 + 2.3 + r * dy + dy * 0.2, dx * 0.6, dy * 0.55, 'NOTE');
  }
  function dnapIcon(G, x, y, lay) { G.frect(x - 6, y - 4, 12, 8, 'HILITE', { col: { rgb: '#ffffff', aci: 7 } }); G.rect(x - 6, y - 4, 12, 8, lay, { lw: 0.5 }); G.tx(x, y, 'DNAP', 2, lay, { al: 'c', va: 'm', bold: true }); }
  function ellipse(G, cx, cy, rx, ry, lay, o) { G.pl(seq(0, 40).map(i => [cx + rx * Math.cos(i * Math.PI / 20), cy + ry * Math.sin(i * Math.PI / 20)]), lay, Object.assign({}, o, { close: true })); }
  const cap = (G, x, y) => G.ln(x, y - 0.45, x, y + 0.45, 'FIBER');
  /* a line parallel to an orthogonal path, d to its left (mitred corners, so a bundle of fibers turns as one) */
  function offsetPath(pts, d) {
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L]; };
    return pts.map((p, i) => {
      const n1 = i > 0 ? nrm(pts[i - 1], p) : null, n2 = i < pts.length - 1 ? nrm(p, pts[i + 1]) : null;
      if (!n1 || !n2) { const n = n1 || n2; return [p[0] + n[0] * d, p[1] + n[1] * d]; }
      const mx = n1[0] + n2[0], my = n1[1] + n2[1], ml = Math.hypot(mx, my) || 1, ux = mx / ml, uy = my / ml, k = d / ((ux * n1[0] + uy * n1[1]) || 1);
      return [p[0] + ux * k, p[1] + uy * k];
    });
  }
  function fiberLine(G, x1, y1, x2, y2, f, fpt, lw) {
    const c = fiberColor(f, fpt).fiber; lw = lw || 0.7;
    if (c.rgb === '#ffffff') { G.ln(x1, y1, x2, y2, 'FIBER', { lw: lw + 0.45 }); G.ln(x1, y1, x2, y2, 'FIBER', { col: c, lw: Math.max(0.2, lw - 0.15) }); }
    else G.ln(x1, y1, x2, y2, 'FIBER', { col: c, lw });
  }
  function swatch(G, x, y, w, h, c) { G.frect(x, y, w, h, 'FIBER', { col: c }); G.rect(x, y, w, h, 'FIBER', { lw: 0.12 }); }

  /* ======================================================================================================
     ACCESS OSP
     model: { points: [{id, type: site|closure|dnap, name, code, status: new|existing, fdu, ports, active, termFrom, coords}],
              cables: [{id, name, from, to, size, status, length, used, leg}], links: [{a, b, fibers}], fpt }
     ====================================================================================================== */
  function accessPlan(m) {
    const warn = [], pts = (m.points || []).filter(p => p && p.id), byId = new Map(pts.map(p => [p.id, p]));
    const label = id => { const p = byId.get(id); return p ? String(p.name || p.code || id) : String(id); };
    const cables = [];
    (m.cables || []).forEach((c, i) => {
      if (!c) return;
      if (!byId.has(c.from) || !byId.has(c.to) || c.from === c.to) { warn.push('Cable ' + (c.name || i + 1) + ': choose two different points for its ends.'); return; }
      cables.push(Object.assign({}, c, { k: cables.length, name: String(c.name || 'CABLE ' + (i + 1)), size: Math.max(1, Math.round(+c.size) || 12), status: c.status === 'existing' ? 'existing' : 'new', taken: new Set(), avoid: new Set(), links: [] }));
    });
    const adj = new Map(pts.map(p => [p.id, []]));
    cables.forEach(c => { adj.get(c.from).push({ c, o: c.to }); adj.get(c.to).push({ c, o: c.from }); });
    cables.forEach(c => parseRanges(c.used).forEach(f => { if (f <= c.size) c.taken.add(f); }));
    /* the ends: an existing FDU's active ports are in use on its cable; a new FDU terminates ports 1.. on fibers from termFrom */
    const term = new Map();
    pts.forEach(p => {
      if (p.type !== 'site' && p.type !== 'dnap') return;
      const inc = adj.get(p.id).map(e => e.c);
      if (p.status === 'existing') { inc.forEach(c => parseRanges(p.active).forEach(f => { if (f <= c.size) c.taken.add(f); })); return; }
      const cap = Math.max(1, +p.ports || (inc[0] ? inc[0].size : 12)), t0 = Math.max(1, Math.round(+p.termFrom) || 1); let port = 1; const T = [];
      /* two or more cables share the panel: each gets an equal part of its ports */
      inc.forEach((c, i) => {
        const share = Math.floor(cap / inc.length) + (i < cap % inc.length ? 1 : 0), n = Math.max(0, Math.min(share, cap - port + 1, c.size - t0 + 1)), fibers = seq(t0, n);
        for (let f = 1; f <= c.size; f++) if (f < t0 || f >= t0 + n) c.avoid.add(f);
        T.push({ c, ports: seq(port, n), fibers }); port += n;
      });
      term.set(p.id, T);
    });
    const bfsPath = (a, b) => {
      const prev = new Map([[a, null]]), q = [a];
      while (q.length) { const u = q.shift(); if (u === b) break; for (const e of adj.get(u).slice().sort((x, y) => x.c.k - y.c.k)) if (!prev.has(e.o)) { prev.set(e.o, { u, c: e.c }); q.push(e.o); } }
      if (!prev.has(b)) return null; const out = []; let v = b; while (prev.get(v)) { const s = prev.get(v); out.unshift({ c: s.c, from: s.u, to: v }); v = s.u; } return out;
    };
    const takeBlock = (c, n, what) => {
      const free = f => !c.taken.has(f) && !c.avoid.has(f);
      for (let s = 1; s + n - 1 <= c.size; s++) { let ok = true; for (let f = s; f < s + n; f++) if (!free(f)) { ok = false; s = f; break; } if (ok) { const r = seq(s, n); r.forEach(f => c.taken.add(f)); return r; } }
      const r = []; for (let f = 1; f <= c.size && r.length < n; f++) if (free(f)) r.push(f);
      warn.push(r.length < n ? what + ': cable ' + c.name + ' has only ' + r.length + ' of the ' + n + ' fibers free.' : what + ': cable ' + c.name + ' has no ' + n + ' free fibers in a row; it uses ' + fmtRanges(r, 'F') + '.');
      r.forEach(f => c.taken.add(f)); return r;
    };
    const nodeSp = new Map(), ends = new Map(), paths = [], push = (M, k, v) => { if (!M.has(k)) M.set(k, []); M.get(k).push(v); };
    (m.links || []).forEach((L, li) => {
      if (!L) return; const n = Math.max(1, Math.round(+L.fibers) || 1), what = 'Link ' + label(L.a) + ' to ' + label(L.b);
      if (!byId.has(L.a) || !byId.has(L.b) || L.a === L.b) { warn.push('Link ' + (li + 1) + ': choose two different end points.'); return; }
      const path = bfsPath(L.a, L.b); if (!path) { warn.push(what + ': no cable connects them yet.'); return; }
      const segs = path.map(s => Object.assign(s, { f: takeBlock(s.c, n, what) }));
      segs.forEach(s => s.c.links.push({ li, f: s.f }));
      for (let i = 0; i + 1 < segs.length; i++) push(nodeSp, segs[i].to, { a: { c: segs[i].c, f: segs[i].f }, b: { c: segs[i + 1].c, f: segs[i + 1].f }, li });
      push(ends, L.a, { c: segs[0].c, f: segs[0].f, li, other: L.b }); push(ends, L.b, { c: segs[segs.length - 1].c, f: segs[segs.length - 1].f, li, other: L.a });
      paths.push({ li, a: L.a, b: L.b, n, segs });
    });
    /* each end's ports */
    const sites = new Map();
    pts.forEach(p => {
      if (p.type !== 'site' && p.type !== 'dnap') return;
      const inc = adj.get(p.id).map(e => e.c), E = ends.get(p.id) || [], cap = Math.max(1, +p.ports || (inc[0] ? inc[0].size : 12));
      if (p.status === 'existing') {
        const before = parseRanges(p.active).filter(f => f <= cap), active = new Set(before);
        E.forEach(e => e.f.forEach(f => { if (f <= cap) active.add(f); }));
        sites.set(p.id, { cap, existing: true, before, active: [...active].sort((a, b) => a - b), vacant: seq(1, cap).filter(f => !active.has(f)), ends: E.map(e => Object.assign({}, e, { ports: e.f.slice() })) });
      } else {
        const T = term.get(p.id) || [], portOf = (c, f) => { const t = T.find(x => x.c === c); const i = t ? t.fibers.indexOf(f) : -1; return i >= 0 ? t.ports[i] : null; };
        const es = E.map(e => Object.assign({}, e, { ports: e.f.map(f => portOf(e.c, f)).filter(x => x != null) }));
        sites.set(p.id, { cap, existing: false, term: T, termPorts: T.flatMap(t => t.ports), working: es.flatMap(e => e.ports), ends: es });
      }
    });
    pts.forEach(p => { if (!adj.get(p.id).length) warn.push(label(p.id) + ' has no cable yet.'); });
    return { m, warn, pts, byId, label, cables, adj, paths, nodeSp, ends, sites, fpt: Math.max(1, +m.fpt || 12) };
  }
  /* the fibers a cable uses at a point: its side of the splices there, or its link ends */
  function fibersAt(P, id, c) {
    const out = []; (P.nodeSp.get(id) || []).forEach(s => { if (s.a.c === c) out.push(...s.a.f); if (s.b.c === c) out.push(...s.b.f); });
    (P.ends.get(id) || []).forEach(e => { if (e.c === c) out.push(...e.f); }); return out;
  }
  const spliceKind = (P, id) => { const cs = new Set(); (P.nodeSp.get(id) || []).forEach(s => { cs.add(s.a.c); cs.add(s.b.c); }); return Math.max(cs.size, P.adj.get(id).length) > 2 ? 'BRANCH SPLICING' : 'STRAIGHT SPLICING'; };
  function siteLines(P, p) {
    const s = P.sites.get(p.id); if (!s) return [];
    const L = [p.type === 'dnap' ? (p.fdu || p.name || 'DUMMY NAP') + ' (DUMMY NAP)' : (p.fdu || ((p.code || p.name || 'SITE') + '_FDU_001')), 'Capacity: ' + s.cap + ' Ports'];
    if (s.existing) { L.push('Active: ' + (fmtRanges(s.active) || 'none')); L.push('Vacant: ' + (fmtRanges(s.vacant) || 'none')); }
    else {
      L.push('Terminated Ports: ' + (fmtRanges(s.termPorts) || 'none')); L.push('Terminated Fibers:');
      s.term.forEach(t => L.push('     ' + (fmtRanges(t.fibers) || '-') + ' (' + t.c.name + ')'));
      if (s.working.length) L.push('Working Ports: ' + fmtRanges(s.working));
    }
    return L;
  }

  /* the main route, as the single line diagram draws it: the two ends furthest apart, the one listed first at the left */
  function trunkOf(P) {
    const linked = P.pts.filter(p => P.adj.get(p.id).length), ends = linked.filter(p => p.type === 'site' || p.type === 'dnap');
    if (!linked.length) return [];
    const bfs = src => { const d = new Map([[src, 0]]), pr = new Map(), q = [src]; while (q.length) { const u = q.shift(); for (const e of P.adj.get(u).slice().sort((x, y) => x.c.k - y.c.k)) if (!d.has(e.o)) { d.set(e.o, d.get(u) + 1); pr.set(e.o, { u, c: e.c }); q.push(e.o); } } return { d, pr }; };
    const cand = ends.length >= 2 ? ends : linked; let best = null;
    for (let i = 0; i < cand.length; i++) { const r = bfs(cand[i].id); for (let j = i + 1; j < cand.length; j++) { const dd = r.d.get(cand[j].id); if (dd != null && (!best || dd > best.dd)) best = { u: cand[i].id, v: cand[j].id, dd, pr: r.pr }; } }
    const T = [], TC = new Set();
    if (best) { let v = best.v; T.unshift(v); while (v !== best.u) { const s = best.pr.get(v); TC.add(s.c); v = s.u; T.unshift(v); } } else T.push(cand[0].id);
    return T;
  }
  function accessSLD(P) {
    const G = new Gfx(), T = trunkOf(P);
    if (!T.length) { G.tx(0, 0, 'ADD THE POINTS AND THE CABLES TO DRAW THE SINGLE LINE DIAGRAM.', 3, 'NOTE'); return block(G); }
    const n = T.length, DX = n > 1 ? Math.max(36, Math.min(92, 300 / (n - 1))) : 0, DY = 60, pos = new Map();
    T.forEach((id, i) => pos.set(id, { x: i * DX, y: 0, trunk: true, i }));
    const q = T.slice(), near = (x, y) => [...pos.values()].some(p => Math.abs(p.x - x) < 24 && Math.abs(p.y - y) < 20);
    while (q.length) {
      const u = q.shift(), pu = pos.get(u);
      P.adj.get(u).filter(e => !pos.has(e.o)).sort((a, b) => a.c.k - b.c.k).forEach((e, j) => {
        let x = pu.trunk ? pu.x + j * 34 : pu.x + j * 46, y = pu.trunk ? -DY : pu.y - DY; while (near(x, y)) x += 30;
        pos.set(e.o, { x, y, trunk: false, parent: u, dir: pu.trunk || j === 0 ? 'down' : 'right' }); q.push(e.o);
      });
    }
    P.pts.forEach(p => { if (P.adj.get(p.id).length && !pos.has(p.id)) P.warn.push(P.label(p.id) + ' is not joined to the main route, so it is left off the diagram.'); });
    const half = id => { const p = P.byId.get(id); return p.type === 'site' ? [11, 6.5] : p.type === 'dnap' ? [6, 4] : [2.8, 2.8]; };
    const trim = (id, ux, uy) => { const [hw, hh] = half(id); return Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : 1e9) + 0.6; };
    const angOf = (ux, uy) => { let a = Math.atan2(uy, ux) * 180 / Math.PI; if (a > 90.01) a -= 180; if (a <= -89.99) a += 180; return a; };
    /* cables */
    for (const c of P.cables) {
      const A = pos.get(c.from), B = pos.get(c.to); if (!A || !B) continue;
      const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, ta = trim(c.from, ux, uy), tb = trim(c.to, -ux, -uy);
      const lay = c.status === 'existing' ? 'FOC_EXIST' : 'FOC_NEW', tl = c.status === 'existing' ? 'SITE_EXIST' : 'SITE_NEW';
      G.ln(A.x + ux * ta, A.y + uy * ta, B.x - ux * tb, B.y - uy * tb, lay);
      const a = angOf(ux, uy), r = a * Math.PI / 180, nx = -Math.sin(r), ny = Math.cos(r), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const at = (d, s, h, o) => G.tx(mx - nx * d, my - ny * d, s, h, (o && o.lay) || tl, Object.assign({ al: 'c', va: 'm', rot: a }, o));
      at(3, c.name, 1.7);
      if (c.status === 'existing') at(6, 'EXISTING ' + c.size + ' FOC', 1.7);
      else { const t = lenTxt(c.length); if (t) { const w = textW(t, 1.8) + 2, h = 3.2, cx = mx - nx * 6.4, cy = my - ny * 6.4, ex = Math.cos(r), ey = Math.sin(r); G.fl([[cx - ex * w / 2 - nx * h / 2, cy - ey * w / 2 - ny * h / 2], [cx + ex * w / 2 - nx * h / 2, cy + ey * w / 2 - ny * h / 2], [cx + ex * w / 2 + nx * h / 2, cy + ey * w / 2 + ny * h / 2], [cx - ex * w / 2 + nx * h / 2, cy - ey * w / 2 + ny * h / 2]], 'LENGTH'); G.tx(cx, cy, t, 1.8, 'TEXT', { al: 'c', va: 'm', rot: a }); } at(10, c.size + 'C FOC', 1.6, { lay: 'NOTE' }); }
      if (c.leg) at(c.status === 'existing' ? 9.5 : 13.5, String(c.leg).toUpperCase(), 1.8, { lay: tl });
      /* the fibers of this cable at each closure end */
      for (const [id, P0, sgn] of [[c.from, A, 1], [c.to, B, -1]]) {
        const p = P.byId.get(id); if (p.type !== 'closure') continue;
        const f = fibersAt(P, id, c); if (!f.length) continue;
        const d = (p.type === 'closure' ? 9 : 16), x = P0.x + ux * sgn * d + nx * 2.4, y = P0.y + uy * sgn * d + ny * 2.4;
        G.tx(x, y, fmtRanges(f, 'F'), 1.9, 'FIBER_USED', { al: 'c', va: 'm', rot: a });
      }
    }
    /* points */
    for (const [id, ps] of pos) {
      const p = P.byId.get(id), isNew = p.status !== 'existing', nm = String(p.name || '').toUpperCase();
      if (p.type === 'closure') {
        pentagon(G, ps.x, ps.y, 2.8, isNew ? 'CLOSURE_NEW' : 'CLOSURE_EXIST');
        const L = [isNew ? 'PROPOSED CLOSURE' : 'EXISTING CLOSURE'];
        if (nm && !/^C\d*$/.test(nm)) L.push(nm);
        if (isNew) L.push(spliceKind(P, id));
        const coord = String(p.coords || '').trim();
        if (isNew) L.push({ s: 'Coordinates: "' + (coord || 'TBF') + '"', o: { bold: true }, lay: 'FIBER_USED' }); else if (coord) L.push(coord);
        if (ps.trunk) { const top = ps.y + 6 + (L.length - 1) * 1.9 * 1.5; G.txs(ps.x, top, L, 1.9, 'TEXT', { al: 'c', gap: 1.5 }); }
        else G.txs(ps.x + 5, ps.y + 4, L, 1.9, 'TEXT', { gap: 1.5 });
        continue;
      }
      const lay = p.type === 'dnap' ? (isNew ? 'DNAP_NEW' : 'DNAP_EXIST') : (isNew ? 'SITE_NEW' : 'SITE_EXIST');
      if (p.type === 'dnap') dnapIcon(G, ps.x, ps.y, lay); else fduIcon(G, ps.x, ps.y, lay);
      const name = [nm || 'SITE'].concat(p.code ? ['(' + String(p.code).toUpperCase() + ')'] : []), info = siteLines(P, p), [hw, hh] = half(id);
      if (ps.trunk && ps.i === 0 && n > 1) { G.txs(ps.x - hw - 3, ps.y + 1.6, name, 2.4, 'TEXT', { al: 'r', bold: true }); G.txs(ps.x - hw, ps.y - hh - 4, info, 1.9, lay, { gap: 1.5 }); }
      else if (ps.trunk && ps.i === n - 1 && n > 1) { G.txs(ps.x + hw + 3, ps.y + 1.6, name, 2.4, 'TEXT', { bold: true }); G.txs(ps.x - hw, ps.y - hh - 4, info, 1.9, lay, { gap: 1.5 }); }
      else if (ps.trunk) { G.txs(ps.x, ps.y + hh + 3 + 2.4 * 1.55 * (name.length - 1), name, 2.4, 'TEXT', { al: 'c', bold: true }); G.txs(ps.x - hw, ps.y - hh - 4, info, 1.9, lay, { gap: 1.5 }); }
      else { G.txs(ps.x, ps.y - hh - 4, name, 2.4, 'TEXT', { al: 'c', bold: true }); G.txs(ps.x + hw + 4, ps.y + hh - 1, info, 1.9, lay, { gap: 1.5 }); }
    }
    return block(G, 'SINGLE LINE DIAGRAM');
  }
  function accessLegend(P) {
    const G = new Gfx(), has = t => P.pts.some(p => p.type === t);
    const items = [['pc', 'PROPOSED CLOSURE'], ['ec', 'EXISTING CLOSURE'], ['nf', 'NEW FOC'], ['ef', 'EXISTING FOC'], ['nd', 'NEW FDU PANEL'], ['ed', 'EXISTING FDU PANEL']].concat(has('dnap') ? [['dn', 'DUMMY NAP']] : []);
    G.tx(0, 6, 'LEGEND:', 2.2, 'LEGEND', { bold: true });
    items.forEach(([k, t], i) => {
      const x = i * 54, y = 0, tx = k === 'pc' || k === 'ec' ? 9 : 15;
      if (k === 'pc' || k === 'ec') pentagon(G, x + 4, y, 2.4, k === 'pc' ? 'CLOSURE_NEW' : 'CLOSURE_EXIST');
      else if (k === 'nf' || k === 'ef') G.ln(x, y, x + 12, y, k === 'nf' ? 'FOC_NEW' : 'FOC_EXIST');
      else if (k === 'dn') dnapIcon(G, x + 6, y, 'DNAP_NEW');
      else fduIcon(G, x + 6, y, k === 'nd' ? 'SITE_NEW' : 'SITE_EXIST', 12, 7.5);
      G.tx(x + tx, y, t, 2, 'LEGEND', { va: 'm' });
    });
    return block(G);
  }

  /* detailed, drawn like the ODN's: the homing ODF at the left, every cable a bundle of fibers (working red, spare black), every closure an ellipse
     with its splices inside, and the far ends at the right on rows of their own: an ODF (FDU panel) or a dummy NAP (pole-mounted small cell). */
  function accessDetailed(P) {
    const G = new Gfx(), GAP = 1.1, DX = 96, BW = 18, T = trunkOf(P);
    if (!T.length) { G.tx(0, 0, 'ADD THE POINTS AND THE CABLES TO DRAW THE SPLICING DETAILS.', 3, 'NOTE'); return [block(G)]; }
    const root = T[0], typ = id => P.byId.get(id).type, isEnd = id => typ(id) === 'site' || typ(id) === 'dnap';
    const par = new Map([[root, null]]), kids = new Map(), depth = new Map([[root, 0]]), q = [root], treeC = new Set();
    while (q.length) { const u = q.shift(); kids.set(u, []); for (const e of P.adj.get(u).slice().sort((a, b) => a.c.k - b.c.k)) if (!par.has(e.o)) { par.set(e.o, { u, c: e.c }); depth.set(e.o, depth.get(u) + 1); treeC.add(e.c); kids.get(u).push({ id: e.o, c: e.c }); q.push(e.o); } }
    P.pts.forEach(p => { if (P.adj.get(p.id).length && !par.has(p.id)) P.warn.push(P.label(p.id) + ' is not joined to the main route, so it is left off the diagram.'); });
    const nodes = [...par.keys()], Dmax = Math.max(...nodes.map(id => depth.get(id)));
    /* the fibers drawn for a cable: those its links use, one by one, then two lines for the rest of the cable */
    const W = new Map(P.cables.map(c => [c, [...new Set(c.links.flatMap(l => l.f))].sort((a, b) => a - b)]));
    const lines = c => { const w = W.get(c), L = w.map(f => ({ f })); if (c.size > w.length) L.push({ rest: 1 }, { rest: 2 }); return L; };
    const bw = c => (lines(c).length - 1) * GAP;
    /* an end's rows: the working ports of each of its cables, then the other ports in a row or two */
    const groups = id => { const s = P.sites.get(id) || { ends: [] }; return P.adj.get(id).map(e => ({ c: e.c, o: e.o, rows: s.ends.filter(x => x.c === e.c).flatMap(x => x.f.map((f, i) => ({ f, port: x.ports[i] != null ? x.ports[i] : f }))).sort((a, b) => a.port - b.port) })); };
    const extra = id => {
      const s = P.sites.get(id); if (!s) return [];
      if (s.existing) return [s.before.length ? 'ACTIVE ' + fmtRanges(s.before) : '', s.vacant.length ? 'VACANT ' + fmtRanges(s.vacant) : ''].filter(Boolean);
      const sp = s.termPorts.filter(p => !s.working.includes(p)); return sp.length ? ['SPARE ' + fmtRanges(sp)] : [];
    };
    const nRows = id => groups(id).reduce((a, g) => a + g.rows.length, 0) + extra(id).length + Math.max(0, groups(id).length - 1);
    const boxH = id => Math.max(14, nRows(id) * GAP + 8);
    const xOf = id => isEnd(id) && id !== root && !kids.get(id).length ? Dmax * DX : depth.get(id) * DX;
    const pos = new Map(); let yc = 0;
    const place = id => {
      const ks = kids.get(id);
      if (!ks.length) { const h = isEnd(id) ? boxH(id) : 20, y = yc - h / 2; yc -= h + 18; pos.set(id, { x: xOf(id), y }); return y; }
      const ys = ks.map(k => place(k.id)), y = (Math.max(...ys) + Math.min(...ys)) / 2; pos.set(id, { x: xOf(id), y }); return y;
    };
    place(root);
    /* which way each cable runs: from the point further left, or from its parent */
    const dirs = P.cables.filter(c => pos.has(c.from) && pos.has(c.to)).map(c => {
      if (treeC.has(c)) { const ch = par.get(c.to) && par.get(c.to).c === c ? c.to : c.from; return { c, a: par.get(ch).u, b: ch }; }
      const xa = pos.get(c.from).x, xb = pos.get(c.to).x; return xa <= xb ? { c, a: c.from, b: c.to } : { c, a: c.to, b: c.from };
    });
    const outOf = id => dirs.filter(d => d.a === id).sort((m, n) => pos.get(n.b).y - pos.get(m.b).y || m.c.k - n.c.k);
    const inTo = id => dirs.filter(d => d.b === id).sort((m, n) => pos.get(n.a).y - pos.get(m.a).y || m.c.k - n.c.k);
    /* where each cable leaves or reaches a point: a stack beside a closure, its own rows on an end's box */
    const at = new Map(), K = (id, c) => id + '|' + c.k, rowsAt = new Map(), boxes = new Map();
    nodes.forEach(id => {
      const p = pos.get(id), O = outOf(id), I = inTo(id);
      if (isEnd(id)) {
        const h = boxH(id), top = p.y + h / 2, x0 = id === root || kids.get(id).length ? p.x : p.x; let r = 0; const gs = groups(id), order = I.map(d => d.c).concat(O.map(d => d.c));
        boxes.set(id, { x0, top, h }); const rows = [];
        order.forEach((c, gi) => { const g = gs.find(x => x.c === c); if (gi) r++; const ys = []; (g ? g.rows : []).forEach(row => { const y = top - 4 - r * GAP; rows.push(Object.assign({ y, c }, row)); ys.push(y); r++; }); const yy = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : top - 4 - r * GAP; at.set(K(id, c), { y: yy, side: I.some(d => d.c === c) ? 'L' : 'R' }); if (!ys.length) r++; });
        extra(id).forEach(t => { rows.push({ y: top - 4 - r * GAP, t }); r++; });
        rowsAt.set(id, rows);
      } else {
        const stack = (L, side) => { const H = L.reduce((a, d) => a + bw(d.c), 0) + 4 * Math.max(0, L.length - 1); let y = p.y + H / 2; L.forEach(d => { const w = bw(d.c); at.set(K(id, d.c), { y: y - w / 2, side }); y -= w + 4; }); return H; };
        const h = Math.max(stack(I, 'L'), stack(O, 'R')); boxes.set(id, { ry: h / 2 + 7 });
      }
    });
    /* the cables, as bundles of fibers */
    const endPt = new Map(), live = new Set();
    nodes.forEach(id => {
      const O = outOf(id); if (!O.length) return; const p = pos.get(id), xs = isEnd(id) ? p.x + BW + 7 : p.x + 6;
      const ups = O.filter(d => pos.get(d.b) && at.get(K(d.b, d.c)).y > at.get(K(id, d.c)).y + 0.01), downs = O.filter(d => !ups.includes(d)).reverse();
      const turn = new Map(); let acc = 0; ups.forEach(d => { const w = bw(d.c); turn.set(d, xs + 9 + acc + w / 2); acc += w + 5; }); acc = 0; downs.forEach(d => { const w = bw(d.c); turn.set(d, xs + 9 + acc + w / 2); acc += w + 5; });
      O.forEach(d => {
        const c = d.c, ys = at.get(K(id, c)).y, B = pos.get(d.b), yt = at.get(K(d.b, c)).y, xt = isEnd(d.b) ? B.x - 7 : B.x - 6, xT = turn.get(d), L = lines(c), N = L.length, w = bw(c);
        const pts = Math.abs(yt - ys) < 0.01 ? [[xs, ys], [xt, yt]] : [[xs, ys], [xT, ys], [xT, yt], [xt, yt]];
        L.forEach((ln, j) => {
          const pp = offsetPath(pts, ((N - 1) / 2 - j) * GAP);
          if (ln.rest) { pp[0] = [pp[0][0] + 3, pp[0][1]]; pp[pp.length - 1] = [pp[pp.length - 1][0] - 3, pp[pp.length - 1][1]]; G.pl(pp, 'FIBER'); cap(G, pp[0][0], pp[0][1]); cap(G, pp[pp.length - 1][0], pp[pp.length - 1][1]); return; }
          G.pl(pp, 'FIBER_USED'); endPt.set(K(id, c) + '|' + ln.f, pp[0]); endPt.set(K(d.b, c) + '|' + ln.f, pp[pp.length - 1]);
        });
        const tl = c.status === 'existing' ? 'SITE_EXIST' : 'SITE_NEW', xl = pts.length > 2 ? xT + w / 2 + 2 : xs + 4, yl = yt + w / 2 + 1.6, before = parseRanges(c.used);
        G.tx(xl, yl + 2, c.name + ' · ' + c.size + 'C ' + (c.status === 'existing' ? 'EXISTING' : 'NEW') + (lenTxt(c.length) && c.status !== 'existing' ? ' · ' + lenTxt(c.length) : '') + (c.leg ? ' · ' + String(c.leg).toUpperCase() : ''), 1.15, tl, { bold: true });
        G.tx(xl, yl, (W.get(c).length ? 'WORKING ' + fmtRanges(W.get(c), 'F') : 'NO LINK USES IT') + (before.length ? ' · IN USE BEFORE ' + fmtRanges(before, 'F') : ''), 1.0, 'FIBER_USED');
        ellipse(G, xt - 8, yt, 1.1, w / 2 + 1.5, tl);
      });
    });
    /* the points */
    nodes.forEach(id => {
      const p = pos.get(id), pt = P.byId.get(id), isNew = pt.status !== 'existing', lay = typ(id) === 'dnap' ? (isNew ? 'DNAP_NEW' : 'DNAP_EXIST') : (isNew ? 'SITE_NEW' : 'SITE_EXIST');
      if (!isEnd(id)) {
        const rx = 14, ry = Math.max(8, boxes.get(id).ry); ellipse(G, p.x, p.y, rx, ry, lay, { lw: 0.35 });
        const L = [{ s: (isNew ? 'PROPOSED CLOSURE ' : 'EXISTING CLOSURE ') + String(pt.name || '').toUpperCase(), o: { bold: true } }, spliceKind(P, id), 'COORDINATES: ' + (String(pt.coords || '').trim() || 'TBF')];
        G.txs(p.x, p.y + ry + 2 + 2 * 1.25 * 1.5, L, 1.25, lay, { al: 'c', gap: 1.5 });
        (P.nodeSp.get(id) || []).forEach(s => s.a.f.forEach((fa, i) => {
          const fb = s.b.f[i], A = endPt.get(K(id, s.a.c) + '|' + fa), B = endPt.get(K(id, s.b.c) + '|' + fb); if (!A || !B) return;
          const la = A[0] < p.x, lb = B[0] < p.x;
          if (la !== lb) { const [L1, R1] = la ? [A, B] : [B, A]; G.pl([L1, [L1[0] + 3, L1[1]], [R1[0] - 3, R1[1]], R1], 'FIBER_USED'); G.ci(p.x, (L1[1] + R1[1]) / 2, 0.3, 'SPLICE', { fill: true }); }
          else { const xi = la ? p.x - 1.5 : p.x + 1.5; G.pl([A, [xi, A[1]], [xi, B[1]], B], 'FIBER_USED'); G.ci(xi, (A[1] + B[1]) / 2, 0.3, 'SPLICE', { fill: true }); }
          for (const [Q, f] of [[A, fa], [B, fb]]) G.tx(Q[0] + (Q[0] < p.x ? -0.4 : 0.4), Q[1] + 0.25, String(f), 0.55, 'TEXT', { al: Q[0] < p.x ? 'r' : 'l' });
        }));
        return;
      }
      const b = boxes.get(id), x0 = p.x, left = id === root || kids.get(id).length > 0 && !inTo(id).length;
      G.frect(x0, b.top - b.h, BW, b.h, 'HILITE', { col: WHITE }); G.rect(x0, b.top - b.h, BW, b.h, lay, { lw: 0.5 });
      G.tx(left ? x0 + 5 : x0 + BW - 5, p.y, typ(id) === 'dnap' ? 'DUMMY NAP' : (isNew ? 'PROP. ODF' : 'EXIST. ODF'), 1.5, lay, { al: 'c', va: 'm', rot: 90, bold: true });
      const I = inTo(id);
      (rowsAt.get(id) || []).forEach(r => {
        const fromLeft = r.c ? I.some(d => d.c === r.c) : !left, xe = fromLeft ? x0 : x0 + BW;
        if (r.t) { G.tx(fromLeft ? x0 + 0.6 : x0 + BW - 0.6, r.y, r.t, 0.7, 'TEXT', { al: fromLeft ? 'l' : 'r', va: 'm' }); const xs2 = fromLeft ? xe - 4 : xe + 4; G.ln(xe, r.y, xs2, r.y, 'FIBER'); cap(G, xs2, r.y); return; }
        G.tx(fromLeft ? x0 + 0.6 : x0 + BW - 0.6, r.y, String(r.port), 0.7, 'FIBER_USED', { al: fromLeft ? 'l' : 'r', va: 'm' });
        const e = endPt.get(K(id, r.c) + '|' + r.f); if (!e) return;
        G.pl(fromLeft ? [e, [e[0] + 2, e[1]], [xe - 2, r.y], [xe, r.y]] : [[xe, r.y], [xe + 2, r.y], [e[0] - 2, e[1]], e], 'FIBER_USED');
      });
      const name = [{ s: String(pt.name || '').toUpperCase() + (pt.code ? ' (' + String(pt.code).toUpperCase() + ')' : ''), o: { bold: true } }].concat(typ(id) === 'dnap' ? ['POLE-MOUNTED SMALL CELL'] : []).concat(siteLines(P, pt));
      if (left) G.txs(x0, b.top + 2 + (name.length - 1) * 1.25 * 1.5, name, 1.25, lay, { gap: 1.5 });
      else G.txs(x0 + BW + 3, b.top - 1.2, name, 1.25, lay, { gap: 1.5 });
    });
    return [block(G, 'SPLICING DETAILS')];
  }
  function accessDetLegend(P) {
    const G = new Gfx(), has = t => P.pts.some(p => p.type === t); G.tx(0, 6, 'LEGEND:', 2.2, 'LEGEND', { bold: true });
    const items = [['wf', 'WORKING FIBER'], ['sf', 'SPARE FIBER'], ['pc', 'PROPOSED CLOSURE'], ['ec', 'EXISTING CLOSURE'], ['no', 'NEW ODF (FDU PANEL)'], ['eo', 'EXISTING ODF']].concat(has('dnap') ? [['dn', 'DUMMY NAP (SMALL CELL)']] : []);
    items.forEach(([k, t], i) => {
      const x = i * 54;
      if (k === 'wf' || k === 'sf') G.ln(x, 0, x + 12, 0, k === 'wf' ? 'FIBER_USED' : 'FIBER');
      else if (k === 'pc' || k === 'ec') ellipse(G, x + 6, 0, 5, 2.6, k === 'pc' ? 'SITE_NEW' : 'SITE_EXIST');
      else G.rect(x + 3, -2.6, 6, 5.2, k === 'no' ? 'SITE_NEW' : k === 'eo' ? 'SITE_EXIST' : 'DNAP_NEW', { lw: 0.5 });
      G.tx(x + 15, 0, t, 2, 'LEGEND', { va: 'm' });
    });
    return block(G);
  }

  /* ======================================================================================================
     BROADBAND (OLT / ODN)
     model: { olt: {name, code, odf, odfSize}, feeder: {use, name, size, closure, first},
              mains: [{id, name, size, closure, first}], naps: [{main, line, ports: 8|16, pole, poleType}], demand }
     A main is a distribution cable to a closure; from the closure 6F drop cables carry up to five lines each (fibers 2 to 6, fiber 1 spare).
     A line is one fiber of the main: a 1:4 splitter in its first NAP (N01), a 1:8 for every 8 ports. Outputs 3 (and 4) feed N01's own 1:8s,
     outputs 1, 2 (then 4) go on along the drop to the line's next NAPs.
     ====================================================================================================== */
  function bbPlan(m) {
    const warn = [], olt = Object.assign({ name: 'OLT', odf: 'ODF-01', odfSize: 72 }, m.olt), fd = Object.assign({ use: false, name: 'FEEDER 1', size: 144, closure: 'FEEDER CLOSURE', first: 1 }, m.feeder);
    fd.use = !!fd.use; fd.size = Math.max(6, +fd.size || 144); fd.first = Math.max(1, +fd.first || 1);
    const mains = (m.mains || []).map((x, i) => ({ id: x.id || 'm' + i, name: String(x.name || 'MAIN ' + (i + 1)).toUpperCase(), size: Math.max(6, +x.size || 72), closure: String(x.closure || 'CLOSURE ' + (i + 1)).toUpperCase(), first: Math.max(1, +x.first || 1), lines: [], lineMap: new Map() }));
    const byId = new Map(mains.map(x => [x.id, x])), taken = new Set();
    (m.naps || []).forEach((r, k) => {
      if (!r) return; const mn = byId.get(r.main) || mains[0]; if (!mn) return;
      const lab = String(r.line || '').trim().toUpperCase(); let ln = lab ? mn.lineMap.get(lab) : null;
      if (!ln) { ln = { id: lab || null, naps: [], main: mn }; mn.lines.push(ln); if (lab) { mn.lineMap.set(lab, ln); taken.add(lab); } }
      ln.naps.push({ ports: +r.ports === 8 ? 8 : 16, pole: String(r.pole || '').toUpperCase(), poleType: String(r.poleType || '').toUpperCase(), status: r.status || 'new' });
    });
    let auto = 0; mains.forEach(mn => mn.lines.forEach(ln => { if (!ln.id) { do { auto++; } while (taken.has('L' + pad(auto, 3))); ln.id = 'L' + pad(auto, 3); } }));
    let poleNo = 0, fStart = fd.first, odfNext = 1;
    mains.forEach(mn => {
      mn.drops = []; for (let d = 0; d * 5 < mn.lines.length; d++) mn.drops.push({ d, main: mn, lines: mn.lines.slice(d * 5, d * 5 + 5), distF: seq(mn.first + 6 * d, 6) });
      mn.drops.forEach(dr => dr.lines.forEach((ln, i) => { ln.drop = dr; ln.fDrop = i + 2; ln.fDist = mn.first + 6 * dr.d + 1 + i; }));
      const count = 6 * mn.drops.length; mn.distUsed = seq(mn.first, count);
      if (mn.first + count - 1 > mn.size) warn.push(mn.name + ': its ' + mn.lines.length + ' lines need fibers ' + fmtRanges(mn.distUsed) + ' but the cable has ' + mn.size + '.');
      if (fd.use) { mn.feedF = seq(fStart, count); fStart += count; mn.odfP = mn.feedF.slice(); } else { mn.odfP = seq(odfNext, count); odfNext += count; }
      mn.lines.forEach(ln => {
        ln.naps.forEach((nap, j) => { nap.id = ln.id + '_N' + pad(j + 1, 2); nap.no = ++poleNo; nap.line = ln; nap.j = j; });
        const n01 = ln.naps[0]; n01.outs = n01.ports === 16 ? [3, 4] : [3];
        const avail = [1, 2, 3, 4].filter(o => !n01.outs.includes(o));
        ln.naps.slice(1).forEach(nap => { const need = nap.ports === 16 ? 2 : 1; nap.outs = avail.splice(0, need); if (nap.outs.length < need) warn.push(nap.id + ': the line\'s 1:4 has no output left (a line serves at most 32 ports); give it its own line.'); });
        ln.spare = avail;
      });
    });
    if (fd.use && fStart - 1 > fd.size) warn.push(fd.name + ': the mains need fibers up to ' + (fStart - 1) + ' but the feeder has ' + fd.size + '.');
    const odfTop = Math.max(0, ...mains.map(mn => Math.max(0, ...mn.odfP)));
    if (odfTop > (+olt.odfSize || 0)) warn.push('ODF ' + olt.odf + ': ports up to ' + odfTop + ' are needed but it has ' + (+olt.odfSize || 0) + '.');
    /* a line's next NAPs are fed on a 6F branch from its N01: the branch's fibers 1, 2, 3 carry the 1:4's outputs in order */
    mains.forEach(mn => mn.lines.forEach(ln => { let sf = 0; ln.naps.forEach((nap, j) => { nap.via = j ? nap.outs.map(() => ++sf) : []; }); ln.subFibers = sf; }));
    const all = mains.flatMap(mn => mn.lines.flatMap(ln => ln.naps)), sum = {
      lines: mains.reduce((a, mn) => a + mn.lines.length, 0), snap: all.filter(n => n.ports === 8).length, dnap: all.filter(n => n.ports === 16).length,
      ports: all.reduce((a, n) => a + n.ports, 0), demand: +m.demand || 0
    };
    return { m, warn, olt, fd, mains, sum };
  }
  const bbSummary = (B) => [B.olt.name.toUpperCase() + (B.olt.code ? ' (' + String(B.olt.code).toUpperCase() + ')' : '') + ':', '1. NO. OF LINES (LCP, 1:4): ' + B.sum.lines, '2. NO. OF SINGLE NAP (8 PORTS): ' + B.sum.snap, '3. NO. OF DOUBLE NAP (16 PORTS): ' + B.sum.dnap, '4. DESIGNED LINES: ' + B.sum.ports, '5. DEMAND LINES: ' + (B.sum.demand || '-')];
  function splitterSym(G, x, y, kind, n) { /* the SLD's NAP symbol: a 1:4 circle, then a 1:8 triangle per 8 ports */
    let cx = x; if (kind) { G.ci(cx + 2.4, y, 2.3, 'NAP_SYM'); G.tx(cx + 2.4, y, '1:4', 1.3, 'NAP_SYM', { al: 'c', va: 'm', bold: true }); cx += 5.4; }
    for (let i = 0; i < n; i++) { G.pl([[cx, y - 2], [cx + 3.6, y], [cx, y + 2]], 'NAP_SYM', { close: true }); G.tx(cx + 1.3, y, '1:8', 0.9, 'NAP_SYM', { va: 'm' }); cx += 4.2; }
  }
  function bbSLD(B) {
    const G = new Gfx(), RH = 40, BW = 19, PITCH = 30, mains = B.mains.filter(mn => mn.lines.length);
    G.txs(0, 30, bbSummary(B).map((s, i) => i ? s : { s, o: { bold: true } }), 2.2, 'TEXT', { gap: 1.55 });
    const rows = mains.reduce((a, mn) => a + mn.drops.length, 0), top = 0, odfH = Math.max(28, mains.length * 7 + 10);
    G.tx(0, top + 3, 'ODF ' + String(B.olt.odf).toUpperCase() + ' · ' + B.olt.odfSize + 'C', 2.2, 'TEXT', { bold: true });
    G.rect(0, top - odfH, 16, odfH, 'NAP', { lw: 0.4 });
    mains.forEach((mn, i) => G.tx(8, top - 6 - i * 7, 'P' + fmtRanges(mn.odfP), 1.5, 'TEXT', { al: 'c', va: 'm' }));
    let xT, yOut = top - odfH / 2;
    if (B.fd.use) {
      G.ln(16, yOut, 50, yOut, 'CABLE', { lw: 0.7 }); G.tx(33, yOut + 2, B.fd.name.toUpperCase() + ' · ' + B.fd.size + 'C', 1.7, 'CABLE', { al: 'c' });
      G.rect(50, yOut - 8, 12, 16, 'CLOSURE_BOX'); G.tx(56, yOut + 10, String(B.fd.closure).toUpperCase(), 1.8, 'TEXT', { al: 'c', bold: true });
      mains.forEach((mn, i) => G.tx(56, yOut + 5 - i * 2.6, fmtRanges(mn.feedF) + '>' + fmtRanges(mn.distUsed), 1.05, 'TEXT', { al: 'c', va: 'm' }));
      G.ln(62, yOut, 74, yOut, 'CABLE'); xT = 74;
    } else { G.ln(16, yOut, 30, yOut, 'CABLE'); xT = 30; }
    let y = top - 4, firstY = null, lastY = yOut;
    mains.forEach(mn => {
      const yDC = y - 10; if (firstY == null) firstY = yDC;
      G.tx(xT + 2, yDC + 9, mn.name + ' · ' + mn.size + 'C · F' + fmtRanges(mn.distUsed), 2, 'CABLE', { bold: true });
      G.ln(xT, yDC, xT + 8, yDC, 'CABLE'); G.rect(xT + 8, yDC - 4, 8, 8, 'CLOSURE_BOX'); G.tx(xT + 12, yDC, String(mn.closure).replace(/CLOSURE/i, 'CL').slice(0, 9), 1.1, 'TEXT', { al: 'c', va: 'm' });
      G.tx(xT + 12, yDC - 6, mn.closure, 1.4, 'NOTE', { al: 'c' }); lastY = yDC;
      mn.drops.forEach((dr, di) => {
        const yr = yDC - di * RH; let x = xT + 46, prevEnd = di ? xT + 18 : xT + 16;
        if (di) G.ln(xT + 18, yDC - 4, xT + 18, yr, 'CABLE');
        G.tx(xT + 20, yr + 6.6, 'DROP ' + (dr.d + 1), 1.7, 'CABLE', { bold: true });
        dr.lines.forEach((ln, li) => {
          const rest = dr.lines.slice(li); G.ln(prevEnd, yr, x, yr, 'CABLE');
          G.tx((prevEnd + x) / 2, yr + 1.6, '[6FOC ' + rest[0].id + (rest.length > 1 ? '-' + rest[rest.length - 1].id : '') + ' / F' + rest[0].fDrop + (rest.length > 1 ? '-F' + rest[rest.length - 1].fDrop : '') + ']', 1.1, 'CABLE', { al: 'c' });
          ln.naps.forEach((nap, j) => {
            if (j) { G.ln(x - PITCH + BW, yr, x, yr, 'CABLE'); G.tx(x - (PITCH - BW) / 2, yr + 1.6, nap.via.length ? 'F' + nap.via.join('-F') : '', 1.2, 'FIBER_USED', { al: 'c' }); }
            G.frect(x, yr - 15, BW, 24, 'HILITE', { col: { rgb: '#ffffff', aci: 7 } }); G.rect(x, yr - 15, BW, 24, 'NAP', { lw: 0.3 });
            if (!j) { G.tx(x + 1.2, yr + 6.5, ln.id, 1.8, 'FIBER_USED', { bold: true }); G.tx(x + 1.2, yr + 4.4, 'F' + ln.fDist + '-' + mn.size + 'C', 1.25, 'FIBER_USED'); G.tx(x + 1.2, yr + 2.6, 'F' + ln.fDrop + '-6C', 1.25, 'FIBER_USED'); }
            splitterSym(G, x + 1.6, yr - 0.6, !j, nap.ports / 8);
            G.txs(x + BW / 2, yr - 5.6, [{ s: nap.id, lay: 'FIBER_USED', o: { bold: true } }, nap.ports + ' ports', '(' + nap.no + ') ' + (nap.pole || 'NO POLE ID'), nap.poleType || ''], 1.3, 'TEXT', { al: 'c', gap: 1.55 });
            prevEnd = x + BW; x += PITCH;
          });
          x += 16;
        });
      });
      y = yDC - (mn.drops.length - 1) * RH - RH + 6;
    });
    if (firstY != null) G.ln(xT, yOut, xT, lastY, 'CABLE');
    if (!mains.length) G.tx(0, -10, 'ADD NAPS TO DRAW THE LINES.', 3, 'NOTE');
    return block(G, 'SPLICING SINGLE LINE DIAGRAM');
  }
  /* the detailed drawing, as one picture (like the reference): the ODF at the lower left, the feeder into its closure, each main as a bundle
     of fibers up to its own closure, and from there each 6F drop, numbered, through its NAPs. A line's next NAPs hang below its N01 on a 6F branch.
     Too many mains for one sheet: they go on as many sheets as needed, each drawn at 55 % or more. */
  function bbDetailed(B) {
    const mains = B.mains.filter(mn => mn.lines.length);
    if (!mains.length) { const G = new Gfx(); G.tx(0, 0, 'ADD NAPS TO DRAW THE SPLICING DETAILS.', 3, 'NOTE'); return [block(G)]; }
    const aw = AREA.x1 - AREA.x0, ah = AREA.y1 - AREA.y0 - 16, groups = []; let cur = [];
    for (const mn of mains) { const test = cur.concat([mn]), b = junaBlock(B, test, mains), s = Math.min(1, aw / b.w, ah / b.h); if (cur.length && s < 0.55) { groups.push(cur); cur = [mn]; } else cur = test; }
    groups.push(cur);
    return groups.map(g => junaBlock(B, g, mains, groups));
  }
  const WHITE = { rgb: '#ffffff', aci: 7 };
  function junaBlock(B, sub, all, groups) {
    const G = new Gfx(), GAP = 1.1, BW = 24, PITCH = 31, SUBDY = 34, fd = B.fd, inSub = new Set(sub);
    const dropNo = new Map(); let no = 0; all.forEach(mn => mn.drops.forEach(dr => dropNo.set(dr, ++no)));
    const working = (dr, pos) => !!dr && pos >= 2 && pos <= dr.lines.length + 1;
    /* the rows: one per 6F drop, top to bottom; y is the drop's fiber 1 */
    const rows = []; let y = 0;
    sub.forEach(mn => mn.drops.forEach(dr => { const s2 = dr.lines.some(l => l.naps.length > 1); rows.push({ mn, dr, y, sub: s2 }); y -= 27 + (s2 ? SUBDY : 0) + 11; }));
    const byDrop = new Map(rows.map(r => [r.dr, r])), lowY = Math.min(...rows.map(r => r.y - 25 - (r.sub ? SUBDY : 0)));
    /* the ODF: the assigned ports one by one, the others grouped */
    const assigned = new Map(); all.forEach(mn => (fd.use ? mn.feedF : mn.odfP).forEach((p, j) => assigned.set(p, { mn, j })));
    const top = Math.max(+B.olt.odfSize || 0, ...assigned.keys(), 1), orows = [];
    /* the ports of the mains on this sheet one by one; another sheet's main and the spare ports, one row each */
    const key = p => { const a = assigned.get(p); return !a ? 'spare' : inSub.has(a.mn) ? null : a.mn.id; };
    for (let p = 1; p <= top;) {
      const k = key(p); if (k === null) { orows.push({ p, a: assigned.get(p), t: String(p) }); p++; continue; }
      let q = p; while (q + 1 <= top && key(q + 1) === k) q++; const o = k === 'spare' ? null : assigned.get(p).mn;
      orows.push({ p, other: o, t: (p === q ? String(p) : p + '-' + q) + (o ? ' > ' + o.name : '') }); p = q + 1;
    }
    const lineN = mn => 6 * mn.drops.length + (fd.use ? 2 : 0), widths = sub.map(mn => (lineN(mn) - 1) * GAP), stackH = widths.reduce((a, w) => a + w, 0) + 4 * (sub.length - 1);
    const odfH = orows.length * GAP + 6, xc = 66, rx = 18, ry = Math.max(orows.length * GAP, stackH) / 2 + 7, yc = lowY - 16 - Math.max(odfH, 2 * ry) / 2;
    orows.forEach((r, i) => { r.y = yc + odfH / 2 - 3 - i * GAP; r.live = r.a ? working(r.a.mn.drops[Math.floor(r.a.j / 6)], r.a.j % 6 + 1) : !!r.other; });
    const yOfPort = new Map(orows.filter(r => r.a).map(r => [r.p, r.y]));
    G.frect(0, yc - odfH / 2, 16, odfH, 'HILITE', { col: WHITE }); G.rect(0, yc - odfH / 2, 16, odfH, 'NAP', { lw: 0.45 });
    G.tx(5, yc, 'PROP. ODF', 1.5, 'TEXT', { al: 'c', va: 'm', rot: 90, bold: true });
    G.txs(8, yc + odfH / 2 + 4, [{ s: B.olt.name.toUpperCase(), o: { bold: true } }, String(B.olt.odf).toUpperCase() + ' · ' + top + ' PORTS'], 1.3, 'TEXT', { al: 'c' });
    orows.forEach(r => G.tx(15.4, r.y, r.t, 0.7, r.live ? 'FIBER_USED' : 'TEXT', { al: 'r', va: 'm' }));
    const elsewhere = groups && groups.length > 1 ? groups.filter(g => g !== sub).flat() : [];
    if (fd.use) {
      orows.forEach(r => { const end = r.a && inSub.has(r.a.mn) ? xc - 6 : xc - 10; G.ln(16, r.y, end, r.y, r.live ? 'FIBER_USED' : 'FIBER'); if (end !== xc - 6) cap(G, end, r.y); });
      ellipse(G, 31, yc, 1.3, orows.length * GAP / 2 + 2, 'NAP');
      G.txs(31, yc - orows.length * GAP / 2 - 4.5, [{ s: String(fd.name).toUpperCase() + ' · ' + fd.size + 'C', o: { bold: true } }, 'FEEDER DISTRIBUTION CABLE'], 1.1, 'TEXT', { al: 'c' });
      ellipse(G, xc, yc, rx, ry, 'NAP', { lw: 0.35 });
      G.txs(xc, yc - ry - 2.6, [{ s: String(fd.closure).toUpperCase(), o: { bold: true } }].concat(elsewhere.length ? ['ALSO ' + elsewhere.map(m => m.name).join(', ') + ': OTHER SHEET'] : []), 1.3, 'TEXT', { al: 'c' });
    } else orows.forEach(r => { if (!r.a || !inSub.has(r.a.mn)) { G.ln(16, r.y, 21, r.y, r.live ? 'FIBER_USED' : 'FIBER'); cap(G, 21, r.y); } });
    /* each main: from the closure (or its ODF ports) to its own closure */
    let yS = yc + stackH / 2, xt = fd.use ? xc + 30 : 32; const P = [];
    sub.forEach((mn, k) => {
      const w = widths[k], yE = yS - w / 2; yS -= w + 4;
      const y0 = fd.use ? yE : (yOfPort.get(mn.odfP[0]) + yOfPort.get(mn.odfP[mn.odfP.length - 1])) / 2;
      P.push({ mn, w, N: lineN(mn), y0, xTurn: xt + w / 2 }); xt += w + 5;
    });
    const xD = Math.max(...P.map(p => p.xTurn + p.w / 2)) + 50, wD = 26, xs = fd.use ? xc + 6 : 16;
    P.forEach(p => {
      const mn = p.mn, rk = rows.filter(r => r.mn === mn), yEn = (rk[0].y + rk[rk.length - 1].y - 5 * GAP) / 2;
      const pts = Math.abs(yEn - p.y0) < 0.01 ? [[xs, p.y0], [xD, p.y0]] : [[xs, p.y0], [p.xTurn, p.y0], [p.xTurn, yEn], [xD, yEn]];
      for (let j = 0; j < p.N; j++) {
        const rest = j >= 6 * mn.drops.length, di = Math.floor(j / 6), pos = j % 6 + 1, live = !rest && working(mn.drops[di], pos), lay = live ? 'FIBER_USED' : 'FIBER';
        const pp = offsetPath(pts, ((p.N - 1) / 2 - j) * GAP);
        if (rest) { pp[0] = [fd.use ? xc + 9 : 20, pp[0][1]]; cap(G, pp[0][0], pp[0][1]); }
        G.pl(pp, lay);
        if (fd.use && !rest) { const yo = yOfPort.get(mn.feedF[j]); if (yo != null) { G.pl([[xc - 6, yo], [xc - 3, yo], [xc + 3, pp[0][1]], [xs, pp[0][1]]], lay); G.ci(xc, (yo + pp[0][1]) / 2, 0.3, 'SPLICE', { fill: true }); } }
        const ye = pp[pp.length - 1][1];
        if (rest) { G.ln(xD, ye, xD + 3, ye, 'FIBER'); cap(G, xD + 3, ye); continue; }
        const yx = byDrop.get(mn.drops[di]).y - (pos - 1) * GAP;
        G.pl([[xD, ye], [xD + 6, ye], [xD + wD - 6, yx], [xD + wD, yx]], lay);
      }
      const xl = p.xTurn + p.w / 2 + 2, yl = yEn + p.w / 2 + 1.5;
      G.tx(xl, yl + 2, mn.name + ' · ' + mn.size + 'C DISTRIBUTION CABLE', 1.15, 'TEXT', { bold: true });
      G.tx(xl, yl, 'FIBER SPLICING ASSIGNMENT: ' + (fd.use ? fmtRanges(mn.feedF) + ' (' + fd.size + 'C)' : 'ODF ' + fmtRanges(mn.odfP)) + ' > ' + fmtRanges(mn.distUsed) + ' (' + mn.size + 'C)', 1.0, 'TEXT');
      ellipse(G, xD - 7, yEn, 1.1, p.w / 2 + 1.5, 'NAP');
      const bt = Math.max(rk[0].y + 5, yEn + p.w / 2 + 3), bb = Math.min(rk[rk.length - 1].y - 5 * GAP - 5, yEn - p.w / 2 - 3);
      G.rect(xD, bb, wD, bt - bb, 'CLOSURE_BOX'); G.tx(xD, bt + 1.2, mn.closure, 1.2, 'TEXT', { bold: true });
    });
    /* each drop: its fibers through the line's N01, the line's next NAPs on a branch below */
    rows.forEach(r => {
      const dr = r.dr, y0 = r.y, fy = k => y0 - (k - 1) * GAP, st = seq(1, 6).map(() => 'spare'), x0 = xD + wD;
      dr.lines.forEach(ln => { st[ln.fDrop - 1] = 'feed'; });
      G.tx(x0 + 1.5, y0 + 1.5, String(dropNo.get(dr)), 3.2, 'TEXT'); G.tx(x0 + 5.2, y0 + 0.5, 'DROP 6F', 0.85, 'TEXT');
      const seg = (x1, x2) => { for (let k = 1; k <= 6; k++) G.ln(x1, fy(k), x2, fy(k), st[k - 1] === 'feed' ? 'FIBER_USED' : 'FIBER'); };
      let prev = x0, x = x0 + 13;
      dr.lines.forEach(ln => {
        seg(prev, x); const nap = ln.naps[0], k0 = ln.fDrop, yo = o => y0 - 10 - (o - 1) * 2;
        napFrame(G, x, y0, nap, BW);
        G.frect(x + 0.15, fy(k0) - 0.5, 1.1, 1, 'HILITE');
        for (let k = 1; k <= 6; k++) { G.tx(x + 0.7, fy(k), String(k), 0.7, 'TEXT', { al: 'c', va: 'm' }); G.tx(x + BW - 0.7, fy(k), String(k), 0.7, 'TEXT', { al: 'c', va: 'm' }); if (k !== k0) G.ln(x + 1.4, fy(k), x + BW - 1.4, fy(k), st[k - 1] === 'feed' ? 'FIBER_USED' : 'FIBER'); }
        G.pl([[x + 1.4, fy(k0)], [x + 2.6, fy(k0)], [x + 2.6, y0 - 13], [x + 5, y0 - 13]], 'FIBER_USED');
        G.rect(x + 5, y0 - 17, 2.6, 8, 'SPLITTER'); G.tx(x + 6.3, y0 - 13, '1:4', 1, 'SPLITTER', { al: 'c', va: 'm', rot: 90 });
        for (let o = 1; o <= 4; o++) G.tx(x + 8, yo(o) + 0.45, String(o), 0.6, 'TEXT');
        const c8 = j => x + 14.1 + j * 6; split8(G, nap, c8, y0);
        nap.outs.forEach((o, j) => G.pl([[x + 7.6, yo(o)], [c8(j), yo(o)], [c8(j), y0 - 17.5]], 'FIBER_USED'));
        ln.spare.forEach(o => { G.ln(x + 7.6, yo(o), x + 9, yo(o), 'FIBER'); cap(G, x + 9, yo(o)); });
        st[k0 - 1] = 'dead';
        const down = ln.naps.slice(1);
        if (down.length) {
          const ys = y0 - SUBDY, sfy = f => ys - (f - 1) * GAP, live = seq(1, ln.subFibers).map(() => true); let i = 0;
          down.forEach(nn => nn.outs.forEach((o, t) => { const lane = x + 9.6 + i * 0.8, f = nn.via[t]; G.pl([[x + 7.6, yo(o)], [lane, yo(o)], [lane, sfy(f)], [x + 14, sfy(f)]], 'FIBER_USED'); i++; }));
          down.forEach((nn, j) => {
            const xs2 = x + 14 + j * PITCH, c82 = t => xs2 + 14.1 + t * 6;
            if (j) for (let f = 1; f <= ln.subFibers; f++) G.ln(xs2 - PITCH + BW, sfy(f), xs2, sfy(f), live[f - 1] ? 'FIBER_USED' : 'FIBER');
            napFrame(G, xs2, ys, nn, BW);
            nn.via.forEach(f => G.frect(xs2 + 0.15, sfy(f) - 0.5, 1.1, 1, 'HILITE'));
            for (let f = 1; f <= ln.subFibers; f++) {
              G.tx(xs2 + 0.7, sfy(f), String(f), 0.7, 'TEXT', { al: 'c', va: 'm' }); G.tx(xs2 + BW - 0.7, sfy(f), String(f), 0.7, 'TEXT', { al: 'c', va: 'm' });
              if (!nn.via.includes(f)) G.ln(xs2 + 1.4, sfy(f), xs2 + BW - 1.4, sfy(f), live[f - 1] ? 'FIBER_USED' : 'FIBER');
            }
            split8(G, nn, c82, ys);
            nn.via.forEach((f, t) => { const lane = xs2 + 2.6 + t * 0.8, yy = ys - 14.6 - t * 0.8; G.pl([[xs2 + 1.4, sfy(f)], [lane, sfy(f)], [lane, yy], [c82(t), yy], [c82(t), ys - 17.5]], 'FIBER_USED'); live[f - 1] = false; });
            if (j === down.length - 1) for (let f = 1; f <= ln.subFibers; f++) { G.ln(xs2 + BW, sfy(f), xs2 + BW + 3, sfy(f), 'FIBER'); cap(G, xs2 + BW + 3, sfy(f)); }
          });
        }
        prev = x + BW; x += PITCH * Math.max(1, down.length);
      });
      seg(prev, prev + 5); for (let k = 1; k <= 6; k++) cap(G, prev + 5, fy(k));
    });
    return block(G, 'SPLICING DETAILS');
  }
  function napFrame(G, x, y0, nap, BW) {
    const bt = y0 + 3.5, bb = y0 - 23.5;
    G.frect(x, bb, BW, bt - bb, 'HILITE', { col: WHITE }); G.rect(x, bb, BW, bt - bb, 'NAP', { lw: 0.3 });
    G.tx(x, bt + 0.9, nap.id + ' (' + nap.ports + 'P)', 1.15, 'TEXT', { bold: true });
    G.tx(x + BW / 2, bb - 1.5, '(' + nap.no + ') ' + (nap.pole || 'NO POLE ID') + (nap.poleType ? ' · ' + nap.poleType : ''), 0.95, 'TEXT', { al: 'c' });
  }
  function split8(G, nap, c8, y0) {
    const b8 = nap.ports / 8;
    for (let j = 0; j < b8; j++) { G.rect(c8(j) - 2.6, y0 - 20.5, 5.2, 3, 'SPLITTER'); G.tx(c8(j), y0 - 19, '1:8', 0.95, 'SPLITTER', { al: 'c', va: 'm' }); }
    G.tx((c8(0) + c8(b8 - 1)) / 2, y0 - 22.4, b8 === 2 ? 'DNAP' : 'SNAP', 0.85, 'TEXT', { al: 'c', bold: true });
  }
  /* the reference grid over the drawing area: A-01, B-01 … */
  function refGrid(A, cols, rows) {
    const G = new Gfx(), cw = (A.x1 - A.x0) / cols, rh = (A.y1 - A.y0) / rows, light = { rgb: '#c4c9cf', aci: 9 };
    for (let i = 0; i <= cols; i++) G.ln(A.x0 + i * cw, A.y0, A.x0 + i * cw, A.y1, 'GRID');
    for (let j = 0; j <= rows; j++) G.ln(A.x0, A.y0 + j * rh, A.x1, A.y0 + j * rh, 'GRID');
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) G.tx(A.x0 + (i + 0.5) * cw, A.y1 - (j + 1) * rh + 6, String.fromCharCode(65 + i) + '-' + pad(j + 1, 2), 13, 'GRID', { al: 'c', col: light });
    return G.p;
  }
  function bbLegend() {
    const G = new Gfx(); G.tx(0, 6, 'LEGEND:', 2.2, 'LEGEND', { bold: true });
    G.ln(0, 0, 12, 0, 'CABLE'); G.tx(15, 0, 'DISTRIBUTION / 6F DROP CABLE', 2, 'LEGEND', { va: 'm' });
    G.rect(80, -3, 6, 6, 'CLOSURE_BOX'); G.tx(89, 0, 'CLOSURE', 2, 'LEGEND', { va: 'm' });
    G.ci(115, 0, 2.3, 'NAP_SYM'); G.tx(115, 0, '1:4', 1.3, 'NAP_SYM', { al: 'c', va: 'm', bold: true }); G.tx(119, 0, 'LINE SPLITTER (LCP) IN N01', 2, 'LEGEND', { va: 'm' });
    G.pl([[185, -2], [188.6, 0], [185, 2]], 'NAP_SYM', { close: true }); G.tx(191, 0, '1:8 SPLITTER (8 PORTS)', 2, 'LEGEND', { va: 'm' });
    G.ln(240, 0, 252, 0, 'FIBER_USED'); G.tx(255, 0, 'WORKING FIBER', 2, 'LEGEND', { va: 'm' });
    G.ln(290, 0, 302, 0, 'FIBER'); G.tx(305, 0, 'SPARE FIBER', 2, 'LEGEND', { va: 'm' });
    return block(G);
  }

  /* ---------- build: the sheets of a drawing ---------- */
  const HEADS = { access: { sld: 'SINGLE LINE DIAGRAM', detailed: 'SPLICING DETAILS' }, broadband: { sld: 'SPLICING SINGLE LINE DIAGRAM', detailed: 'SPLICING DETAILS' } };
  function build(model, views) {
    views = [].concat(views || 'sld'); const kind = model.kind === 'broadband' ? 'broadband' : 'access', list = [];
    const plan = kind === 'access' ? accessPlan(model) : bbPlan(model);
    for (const v of views) {
      const head = HEADS[kind][v === 'detailed' ? 'detailed' : 'sld'];
      if (kind === 'access') {
        if (v === 'detailed') { const A = { x0: AREA.x0, y0: AREA.y0 + 16, x1: AREA.x1, y1: AREA.y1 }, leg = accessDetLegend(plan); accessDetailed(plan).forEach(b => list.push(...sheetsOf(paginate([b], { area: A, center: true, grow: 1.6, band: 2 }), head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7)).map(sh => Object.assign(sh, { prims: refGrid(A, 3, 2).concat(sh.prims) })))); }
        else { const leg = accessLegend(plan); list.push(...sheetsOf(paginate([accessSLD(plan)], { area: { x0: AREA.x0, y0: AREA.y0 + 20, x1: AREA.x1, y1: AREA.y1 }, center: true, grow: 1.45 }), head, () => leg ? xf(leg.prims, 1, AREA.x0, AREA.y0 + 13) : [])); }
      } else {
        const leg = bbLegend();
        if (v === 'detailed') { const A = { x0: AREA.x0, y0: AREA.y0 + 16, x1: AREA.x1, y1: AREA.y1 }; bbDetailed(plan).forEach(b => list.push(...sheetsOf(paginate([b], { area: A, center: true, grow: 1.6, band: 2 }), head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7)).map(sh => Object.assign(sh, { prims: refGrid(A, 3, 2).concat(sh.prims) })))); }
        else list.push(...sheetsOf(paginate([bbSLD(plan)], { area: { x0: AREA.x0, y0: AREA.y0 + 16, x1: AREA.x1, y1: AREA.y1 }, center: true, grow: 1.45 }), head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7)));
      }
    }
    return { sheets: finishSheets(list, model.title), plan, warnings: [...new Set(plan.warn)] };
  }

  /* ---------- writers ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rgbOf = p => (p.col && p.col.rgb) || layerRGB(p.lay);
  const lwOf = p => p.lw || (LAYERS[p.lay] || LAYERS.TEXT)[2];
  const dashOf = p => !!(LAYERS[p.lay] || [])[3];
  function toSVG(sheet) {
    const H = SH.H, f = v => Math.round(v * 100) / 100, o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SH.W} ${H}" font-family="Helvetica, Arial, sans-serif"><rect width="${SH.W}" height="${H}" fill="#ffffff"/>`];
    for (const p of sheet.prims) {
      const c = rgbOf(p);
      if (p.k === 'pl') o.push(`<${p.close ? 'polygon' : 'polyline'} points="${p.pts.map(q => f(q[0]) + ',' + f(H - q[1])).join(' ')}" fill="none" stroke="${c}" stroke-width="${f(Math.max(0.12, lwOf(p)))}"${dashOf(p) ? ' stroke-dasharray="2.6 1.3"' : ''} stroke-linejoin="round"/>`);
      else if (p.k === 'fl') o.push(`<polygon points="${p.pts.map(q => f(q[0]) + ',' + f(H - q[1])).join(' ')}" fill="${c}"/>`);
      else if (p.k === 'ci') o.push(`<circle cx="${f(p.c[0])}" cy="${f(H - p.c[1])}" r="${f(p.r)}" fill="${p.fill ? c : 'none'}" stroke="${c}" stroke-width="${f(Math.max(0.12, lwOf(p)))}"/>`);
      else if (p.k === 'tx') { const x = f(p.p[0]), y = f(H - p.p[1]); o.push(`<text x="${x}" y="${y}" font-size="${f(p.h / CAP)}"${p.bold ? ' font-weight="bold"' : ''} fill="${c === '#ffffff' ? '#111111' : c}" text-anchor="${p.al === 'c' ? 'middle' : p.al === 'r' ? 'end' : 'start'}"${p.rot ? ` transform="rotate(${f(-p.rot)} ${x} ${y})"` : ''}>${esc(p.s)}</text>`); }
    }
    o.push('</svg>'); return o.join('');
  }
  const ascii = s => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[^\x20-\x7e]/g, '?');
  function toPDF(sheets, meta) {
    const K = 72 / 25.4, objs = [null, null], add = s => { objs.push(s); return objs.length; }, n = v => (Math.round(v * 1000) / 1000).toString();
    const rgb = h => { const v = parseInt(h.slice(1), 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map(x => n(x)).join(' '); };
    const fR = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), fB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const sh of sheets) {
      const c = [`${n(K)} 0 0 ${n(K)} 0 0 cm 1 J 1 j`];
      for (const p of sh.prims) {
        const col = rgbOf(p);
        if (p.k === 'pl') { c.push(`${rgb(col)} RG ${n(Math.max(0.1, lwOf(p)))} w ${dashOf(p) ? '[2.6 1.3] 0 d' : '[] 0 d'} ${p.pts.map((q, i) => n(q[0]) + ' ' + n(q[1]) + (i ? ' l' : ' m')).join(' ')} ${p.close ? 's' : 'S'}`); }
        else if (p.k === 'fl') c.push(`${rgb(col)} rg ${p.pts.map((q, i) => n(q[0]) + ' ' + n(q[1]) + (i ? ' l' : ' m')).join(' ')} h f`);
        else if (p.k === 'ci') { const [x, y] = p.c, r = p.r, k = 0.5523 * r; c.push(`${rgb(col)} ${p.fill ? 'rg' : 'RG'} ${n(Math.max(0.1, lwOf(p)))} w [] 0 d ${n(x + r)} ${n(y)} m ${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c ${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c ${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c ${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c ${p.fill ? 'f' : 'S'}`); }
        else if (p.k === 'tx') {
          const s = ascii(p.s), w = textW(s, p.h, p.bold), r = p.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), a = p.al === 'c' ? -w / 2 : p.al === 'r' ? -w : 0;
          const x = p.p[0] + a * cs, y = p.p[1] + a * sn, t = s.replace(/[\\()]/g, m => '\\' + m);
          c.push(`BT /${p.bold ? 'F2' : 'F1'} ${n(p.h / CAP)} Tf ${rgb(col === '#ffffff' ? '#111111' : col)} rg ${n(cs)} ${n(sn)} ${n(-sn)} ${n(cs)} ${n(x)} ${n(y)} Tm (${t}) Tj ET`);
        }
      }
      const body = c.join('\n'), cs = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(SH.W * K)} ${n(SH.H * K)}] /Resources << /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R >> >> /Contents ${cs} 0 R >>`));
    }
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>'; objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const pstr = s => '(' + ascii(s).replace(/[\\()]/g, m => '\\' + m) + ')', info = add(`<< /Title ${pstr((meta && meta.title) || 'Splicing details')} /Creator ${pstr((meta && meta.creator) || 'G-eSAA splicing details')} /Producer ${pstr('G-eSAA')} >>`);
    let out = '%PDF-1.4\n%âãÏÓ\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xr = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xr + '\n%%EOF\n';
    const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255; return b;
  }
  /* DXF R12: opens in every CAD program. The sheets sit side by side in model space, 1 unit = 1 mm. */
  function toDXF(sheets) {
    const o = [], w = (...a) => { for (let i = 0; i < a.length; i += 2) o.push(String(a[i]).padStart(3, ' '), String(a[i + 1])); }, n = v => { const r = Math.round(v * 1e4) / 1e4; return Number.isInteger(r) ? r + '.0' : String(r); };
    const GAP = 30, all = []; sheets.forEach((sh, i) => all.push(...xf(sh.prims, 1, i * (SH.W + GAP), 0)));
    const bb = primBox(all), names = Object.keys(LAYERS);
    w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0', 9, '$EXTMIN', 10, n(bb[0]), 20, n(bb[1]), 30, '0.0', 9, '$EXTMAX', 10, n(bb[2]), 20, n(bb[3]), 30, '0.0', 9, '$LTSCALE', 40, '1.0', 0, 'ENDSEC');
    w(0, 'SECTION', 2, 'TABLES');
    w(0, 'TABLE', 2, 'LTYPE', 70, 2, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0', 0, 'LTYPE', 2, 'DASHED', 70, 0, 3, 'Dashed __ __ __', 72, 65, 73, 2, 40, '3.9', 49, '2.6', 49, '-1.3', 0, 'ENDTAB');
    w(0, 'TABLE', 2, 'LAYER', 70, names.length + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
    for (const k of names) w(0, 'LAYER', 2, 'SPL_' + k, 70, 0, 62, LAYERS[k][0], 6, LAYERS[k][3] ? 'DASHED' : 'CONTINUOUS');
    w(0, 'ENDTAB', 0, 'TABLE', 2, 'STYLE', 70, 2, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'arial.ttf', 4, '', 0, 'STYLE', 2, 'BOLD', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'arialbd.ttf', 4, '', 0, 'ENDTAB', 0, 'ENDSEC');
    w(0, 'SECTION', 2, 'ENTITIES');
    for (const p of all) {
      const L = 'SPL_' + (LAYERS[p.lay] ? p.lay : 'TEXT'), C = p.col && p.col.aci != null && p.col.rgb !== layerRGB(p.lay) ? [62, p.col.aci] : [];
      if (p.k === 'pl') {
        if (p.pts.length === 2 && !p.close) w(0, 'LINE', 8, L, ...C, 10, n(p.pts[0][0]), 20, n(p.pts[0][1]), 30, '0.0', 11, n(p.pts[1][0]), 21, n(p.pts[1][1]), 31, '0.0');
        else { w(0, 'POLYLINE', 8, L, ...C, 66, 1, 10, '0.0', 20, '0.0', 30, '0.0', 70, p.close ? 1 : 0); for (const q of p.pts) w(0, 'VERTEX', 8, L, 10, n(q[0]), 20, n(q[1]), 30, '0.0'); w(0, 'SEQEND', 8, L); }
      } else if (p.k === 'fl' || (p.k === 'ci' && p.fill)) {
        if (p.col && p.col.rgb === '#ffffff') continue;
        const pts = p.k === 'fl' ? p.pts : seq(0, 16).map(i => [p.c[0] + p.r * Math.cos(i * Math.PI / 8), p.c[1] + p.r * Math.sin(i * Math.PI / 8)]);
        for (let i = 1; i + 1 < pts.length; i++) { const a = pts[0], b = pts[i], c = pts[i + 1]; w(0, 'SOLID', 8, L, ...C, 10, n(a[0]), 20, n(a[1]), 30, '0.0', 11, n(b[0]), 21, n(b[1]), 31, '0.0', 12, n(c[0]), 22, n(c[1]), 32, '0.0', 13, n(c[0]), 23, n(c[1]), 33, '0.0'); }
      } else if (p.k === 'ci') w(0, 'CIRCLE', 8, L, ...C, 10, n(p.c[0]), 20, n(p.c[1]), 30, '0.0', 40, n(p.r));
      else if (p.k === 'tx') {
        const s = ascii(p.s); if (!s.trim()) continue;
        w(0, 'TEXT', 8, L, ...C, 10, n(p.p[0]), 20, n(p.p[1]), 30, '0.0', 40, n(p.h), 1, s); if (p.rot) w(50, n((p.rot % 360 + 360) % 360)); w(7, p.bold ? 'BOLD' : 'STANDARD');
        if (p.al !== 'l') w(72, p.al === 'c' ? 1 : 2, 11, n(p.p[0]), 21, n(p.p[1]), 31, '0.0');
      }
    }
    w(0, 'ENDSEC', 0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }
  /* ZIP, stored (no compression) */
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0; const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(new Uint8Array(h.buffer), name, data); cen.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    }
    const csize = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    const all = parts.concat(cen, [new Uint8Array(e.buffer)]), out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const b of all) { out.set(b, p); p += b.length; } return out;
  }

  /* ---------- made-up samples (no real sites, cables or people) ---------- */
  const T0 = { company: '', project: 'DEMO FIBER LINK', planId: 'PLAN-0001', site: 'SAMPLE SITE', exchange: 'DEMO EXCH', dwgNo: 'SPL-001', date: '', note: '', sign: [{ name: 'JUAN DELA CRUZ', role: 'OSP ENGINEERING' }, { name: 'MARIA GARCIA', role: 'OPERATIONS' }, { name: 'PEDRO SANTOS', role: 'OSP CONTRACTOR' }] };
  const site = (id, name, code, status, ports, extra) => Object.assign({ id, type: 'site', name, code, status, fdu: code + '_FDU_001', ports }, extra);
  const clo = (id, name, status, coords) => ({ id, type: 'closure', name, status, coords: coords || '' });
  const cab = (name, from, to, size, status, length, used, leg) => ({ name, from, to, size, status, length, used: used || '', leg: leg || '' });
  const samples = {
    access1: { label: '1 · New link through two closures', model: { kind: 'access', fpt: 12, title: Object.assign({}, T0, { site: 'MABINI TO SAN ROQUE' }),
      points: [site('a', 'MABINI', 'DMO180', 'new', 48), clo('c1', 'C1', 'new'), clo('c2', 'C2', 'new'), clo('c3', 'CL-0103', 'existing', '6.8512, 125.1630'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-2, 19-24' })],
      cables: [cab('72N-0001-L1', 'a', 'c1', 72, 'new', 30), cab('12N-0001-L1', 'c1', 'c2', 12, 'new', 2000), cab('12N-0001-L2', 'c2', 'c3', 12, 'new', 1200), cab('72E-0410-L1', 'c3', 'b', 72, 'existing', 0, '1-12')],
      links: [{ a: 'a', b: 'b', fibers: 6 }] } },
    access2: { label: '2 · New site on a branch', model: { kind: 'access', fpt: 12, title: Object.assign({}, T0, { site: 'MABINI BRANCH' }),
      points: [site('l', 'BALIWAG', 'DMO784', 'new', 12), clo('c1', 'C1', 'new'), clo('c2', 'C2', 'new'), clo('c3', 'CL-0103', 'existing', '6.8512, 125.1630'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-2, 19-24' }), site('k', 'MABINI', 'DMO180', 'new', 48)],
      cables: [cab('72N-0111-L1', 'l', 'c1', 72, 'new', 30), cab('12N-0111-L1', 'c1', 'c2', 12, 'new', 2000), cab('12N-0111-L2', 'c2', 'c3', 12, 'new', 1200), cab('72E-0410-L1', 'c3', 'b', 72, 'existing', 0, '1-12'), cab('72N-0111-L3', 'c2', 'k', 72, 'new', 500)],
      links: [{ a: 'k', b: 'l', fibers: 6 }, { a: 'k', b: 'b', fibers: 6 }] } },
    access3: { label: '3 · Branch from an existing cable', model: { kind: 'access', fpt: 12, title: Object.assign({}, T0, { site: 'MABINI TAP' }),
      points: [site('l', 'BALIWAG', 'DMO784', 'existing', 72, { active: '1-24' }), clo('c', 'CL-0207', 'existing', '6.8512, 125.1630'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-24' }), site('k', 'MABINI', 'DMO180', 'new', 48)],
      cables: [cab('72E-0220-L1', 'l', 'c', 72, 'existing', 0, '1-24'), cab('72E-0220-L2', 'c', 'b', 72, 'existing', 0, '1-24'), cab('72N-0115-L1', 'c', 'k', 72, 'new', 500)],
      links: [{ a: 'k', b: 'l', fibers: 6 }, { a: 'k', b: 'b', fibers: 6 }] } },
    access4: { label: '4 · Two legs to one site', model: { kind: 'access', fpt: 12, title: Object.assign({}, T0, { site: 'MABINI TWO LEGS' }),
      points: [site('l', 'BALIWAG', 'DMO784', 'existing', 72, { active: '1-24' }), clo('c1', 'CL-0207', 'existing', '6.8512, 125.1630'), clo('c2', 'CL-0208', 'existing', '6.8530, 125.1702'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-24' }), site('k', 'MABINI', 'DMO180', 'new', 48)],
      cables: [cab('72E-0220-L1', 'l', 'c1', 72, 'existing', 0, '1-24'), cab('72E-0220-L2', 'c1', 'c2', 72, 'existing', 0, '1-24'), cab('72E-0220-L3', 'c2', 'b', 72, 'existing', 0, '1-24'), cab('72N-0116-L1', 'c1', 'k', 72, 'new', 500, '', 'LEG 2'), cab('72N-0116-L2', 'c2', 'k', 72, 'new', 650, '', 'LEG 1')],
      links: [{ a: 'k', b: 'l', fibers: 6 }, { a: 'k', b: 'b', fibers: 6 }] } },
    access5: { label: '5 · Small cell on a dummy NAP', model: { kind: 'access', fpt: 12, title: Object.assign({}, T0, { site: 'SMALL CELL SC-01' }),
      points: [site('h', 'POBLACION', 'DMO300', 'existing', 72, { active: '1-12' }), clo('c1', 'C1', 'new'), Object.assign(clo('d', 'SC-01 DNAP', 'new'), { type: 'dnap', fdu: 'SC01_DNAP', ports: 12 })],
      cables: [cab('72E-0300-L1', 'h', 'c1', 72, 'existing', 0, '1-12'), cab('12N-0301-L1', 'c1', 'd', 12, 'new', 180)],
      links: [{ a: 'd', b: 'h', fibers: 2 }] } },
    broadband: { label: 'OLT · feeder, 2 mains, 11 lines', model: { kind: 'broadband', title: Object.assign({}, T0, { project: 'DEMO FTTH', site: 'DEMO OLT 1', dwgNo: 'SPL-OLT-01' }), demand: 280,
      olt: { name: 'DEMO OLT 1', code: 'DMO1680', odf: 'ODF-01', odfSize: 144 }, feeder: { use: true, name: 'FEEDER 1', size: 144, closure: '144C CLOSURE', first: 13 },
      mains: [{ id: 'm1', name: 'MAIN 1', size: 72, closure: '72C CLOSURE 1', first: 1 }, { id: 'm2', name: 'MAIN 2', size: 72, closure: '72C CLOSURE 2', first: 1 }],
      naps: [['m1', 'L001', 16, 'CC-0101', 'CC'], ['m1', 'L002', 8, 'GT-0102', 'OC'], ['m1', 'L002', 16, 'CC-0103', 'CC'], ['m1', 'L003', 16, 'CC-0104', 'CC'], ['m1', 'L004', 16, 'WP-0105', 'WP'], ['m1', 'L004', 16, 'CC-0106', 'CC'], ['m1', 'L005', 8, 'CC-0107', 'CC'],
        ['m1', 'L006', 16, 'CC-0108', 'CC'], ['m1', 'L006', 8, 'BT-0109', 'OC'], ['m1', 'L007', 16, 'CC-0110', 'CC'],
        ['m2', 'L008', 16, 'CC-0201', 'CC'], ['m2', 'L009', 16, 'CC-0202', 'CC'], ['m2', 'L009', 16, 'CC-0203', 'CC'], ['m2', 'L010', 8, 'GT-0204', 'OC'], ['m2', 'L011', 16, 'CC-0205', 'CC']]
        .map(([main, line, ports, pole, poleType]) => ({ main, line, ports, pole, poleType })) } }
  };

  root.Splice = { build, toSVG, toPDF, toDXF, zip, parseRanges, fmtRanges, fiberColor, FIBER, samples, SHEET: SH, version: 'demo-1' };
})(typeof window !== 'undefined' ? window : globalThis);
