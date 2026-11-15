/* G-eSAA · Splicing details (demo engine).
   Draws the splicing of a project's fiber as A3 sheets, from its points, cables and links:
     Access OSP   · single line diagram: homing to homing, through closures and dummy NAPs (new red, existing blue)
                  · detailed: every closure fiber by fiber (tube and fiber colours), every FDU's working ports, each link's whole path
     Broadband    · single line diagram: OLT ODF, feeder, mains, 6F drop cables, lines (LCP) and NAPs, with the counts
       (OLT/ODN)  · detailed: the feeder's fiber assignment, then each 6F drop cable through its NAPs with the 1:4 and 1:8 splitters
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
    HILITE: [2, '#ffe100', 0.1], TABLE: [7, '#111111', 0.2], LEGEND: [7, '#111111', 0.2]
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
      const px = opt.center ? A.x0 + (aw - w) / 2 : x, py = opt.center ? A.y1 - (ah - h) / 2 : yTop;
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

  function accessSLD(P) {
    const G = new Gfx(), M = P.m;
    const linked = P.pts.filter(p => P.adj.get(p.id).length), ends = linked.filter(p => p.type === 'site' || p.type === 'dnap');
    if (!linked.length) { G.tx(0, 0, 'ADD THE POINTS AND THE CABLES TO DRAW THE SINGLE LINE DIAGRAM.', 3, 'NOTE'); return block(G); }
    const bfs = src => { const d = new Map([[src, 0]]), pr = new Map(), q = [src]; while (q.length) { const u = q.shift(); for (const e of P.adj.get(u).slice().sort((x, y) => x.c.k - y.c.k)) if (!d.has(e.o)) { d.set(e.o, d.get(u) + 1); pr.set(e.o, { u, c: e.c }); q.push(e.o); } } return { d, pr }; };
    const cand = ends.length >= 2 ? ends : linked; let best = null;
    for (let i = 0; i < cand.length; i++) { const r = bfs(cand[i].id); for (let j = i + 1; j < cand.length; j++) { const dd = r.d.get(cand[j].id); if (dd != null && (!best || dd > best.dd)) best = { u: cand[i].id, v: cand[j].id, dd, pr: r.pr }; } }
    const T = [], TC = new Set();
    if (best) { let v = best.v; T.unshift(v); while (v !== best.u) { const s = best.pr.get(v); TC.add(s.c); v = s.u; T.unshift(v); } } else T.push(cand[0].id);
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

  /* detailed: the links end to end, every closure fiber by fiber, every end's ports */
  function accessDetailed(P) {
    const B = [], fpt = P.fpt, fc = f => fiberColor(f, fpt), FCN = f => { const c = fc(f); return 'T' + c.t + ' ' + c.tube.ab + ' / ' + c.fiber.name; };
    { /* the links */
      const G = new Gfx(); G.tx(0, 0, 'FIBER PATHS, END TO END', 3, 'TEXT', { bold: true });
      G.tx(0, -4.4, 'Each link takes the lowest free run of fibers on every cable it uses. P = FDU port, F = cable fiber.', 1.9, 'NOTE');
      const rows = P.paths.map(pa => {
        const sa = P.sites.get(pa.a), sb = P.sites.get(pa.b), ea = sa && sa.ends.find(e => e.li === pa.li), eb = sb && sb.ends.find(e => e.li === pa.li);
        const steps = [P.label(pa.a).toUpperCase() + (ea && ea.ports.length ? ' P' + fmtRanges(ea.ports) : '')];
        pa.segs.forEach((s, i) => { steps.push(s.c.name + ' ' + fmtRanges(s.f, 'F')); if (i < pa.segs.length - 1) steps.push(P.label(s.to).toUpperCase()); });
        steps.push(P.label(pa.b).toUpperCase() + (eb && eb.ports.length ? ' P' + fmtRanges(eb.ports) : ''));
        return [String(pa.li + 1), P.label(pa.a).toUpperCase(), P.label(pa.b).toUpperCase(), String(pa.n), steps.join(' > ')];
      });
      table(G, 0, -7.5, [{ t: 'LINK', w: 12, al: 'c' }, { t: 'FROM', w: 34 }, { t: 'TO', w: 34 }, { t: 'FIBERS', w: 16, al: 'c' }, { t: 'PATH (CABLES, FIBERS AND CLOSURES IN ORDER)', w: 290 }], rows.length ? rows : [['', 'No links yet', '', '', 'Add a link between two sites to give out the fibers.']], { th: 2 });
      B.push(block(G));
    }
    /* each closure */
    P.pts.filter(p => p.type === 'closure' && (P.nodeSp.get(p.id) || []).length).forEach(p => {
      const G = new Gfx(), sp = P.nodeSp.get(p.id), isNew = p.status !== 'existing', W = 180;
      G.tx(0, 0, (isNew ? 'PROPOSED CLOSURE ' : 'EXISTING CLOSURE ') + String(p.name || '').toUpperCase() + ' · ' + spliceKind(P, p.id), 2.8, isNew ? 'SITE_NEW' : 'SITE_EXIST', { bold: true });
      G.tx(0, -4, 'Coordinates: ' + (String(p.coords || '').trim() || 'TBF') + ' · ' + sp.reduce((a, s) => a + s.a.f.length, 0) + ' splices · fibers per tube: ' + fpt, 1.9, 'NOTE');
      /* each cable on a side so that every splice goes across (two colours of the splice graph) */
      const side = new Map(), order = []; let clash = false;
      sp.forEach(s => [s.a.c, s.b.c].forEach(c => { if (!order.includes(c)) order.push(c); }));
      for (const c0 of order) { if (side.has(c0)) continue; side.set(c0, 0); const q = [c0]; while (q.length) { const c = q.shift(); sp.forEach(s => { const o = s.a.c === c ? s.b.c : s.b.c === c ? s.a.c : null; if (!o) return; if (!side.has(o)) { side.set(o, 1 - side.get(c)); q.push(o); } else if (side.get(o) === side.get(c)) clash = true; }); } }
      const pairs = []; sp.forEach(s => { const flip = side.get(s.a.c) === 1; const L = flip ? s.b : s.a, R = flip ? s.a : s.b; for (let i = 0; i < Math.min(L.f.length, R.f.length); i++) pairs.push({ lc: L.c, lf: L.f[i], rc: R.c, rf: R.f[i] }); });
      const other = c => P.label(c.from === p.id ? c.to : c.from).toUpperCase(), rowY = new Map(), RH = 3.4;
      const column = (s, x0, right) => {
        let y = -9; order.filter(c => side.get(c) === s).forEach(c => {
          const tl = c.status === 'existing' ? 'SITE_EXIST' : 'SITE_NEW';
          G.tx(right ? x0 + 72 : x0, y - 2.2, c.name + ' · ' + c.size + 'C · ' + (c.status === 'existing' ? 'EXISTING' : 'NEW'), 2, tl, { bold: true, al: right ? 'r' : 'l' });
          G.tx(right ? x0 + 72 : x0, y - 5, 'to ' + other(c), 1.7, 'NOTE', { al: right ? 'r' : 'l' }); y -= 8;
          const fs = [...new Set(pairs.filter(q => (right ? q.rc : q.lc) === c).map(q => right ? q.rf : q.lf))].sort((a, b) => a - b);
          fs.forEach(f => {
            const cc = fc(f), yy = y - RH / 2; rowY.set(c.k + ':' + f, yy);
            if (!right) { swatch(G, x0, yy - 1.1, 3.4, 2.2, cc.tube); G.tx(x0 + 4.6, yy, 'F' + f, 1.9, 'TEXT', { va: 'm', bold: true }); G.tx(x0 + 12.5, yy, 'T' + cc.t + ' ' + cc.tube.ab + '/' + cc.fiber.ab, 1.5, 'NOTE', { va: 'm' }); fiberLine(G, x0 + 26, yy, x0 + 72, yy, f, fpt); }
            else { fiberLine(G, x0, yy, x0 + 46, yy, f, fpt); G.tx(x0 + 47.5, yy, 'T' + cc.t + ' ' + cc.tube.ab + '/' + cc.fiber.ab, 1.5, 'NOTE', { va: 'm' }); G.tx(x0 + 67.6, yy, 'F' + f, 1.9, 'TEXT', { va: 'm', bold: true, al: 'r' }); swatch(G, x0 + 68.6, yy - 1.1, 3.4, 2.2, cc.tube); }
            y -= RH;
          });
          const rest = seq(1, c.size).filter(f => !fs.includes(f));
          if (rest.length) { G.tx(right ? x0 + 72 : x0, y - 2.4, fmtRanges(rest, 'F') + ': not spliced here', 1.7, 'NOTE', { al: right ? 'r' : 'l' }); y -= 4; }
          y -= 3;
        });
        return y;
      };
      const yl = column(0, 0, false), yr = column(1, W - 72, true);
      pairs.forEach(q => {
        const y1 = rowY.get(q.lc.k + ':' + q.lf), y2 = rowY.get(q.rc.k + ':' + q.rf); if (y1 == null || y2 == null) return;
        const x1 = 72, x2 = W - 72, xm = (x1 + x2) / 2;
        G.pl([[x1, y1], [x1 + 8, y1], [x2 - 8, y2], [x2, y2]], 'FIBER_USED'); G.ci(xm, (y1 + y2) / 2, 0.7, 'SPLICE', { fill: true });
      });
      G.tx(W / 2, -9, 'SPLICES', 1.8, 'NOTE', { al: 'c', bold: true });
      if (clash) P.warn.push('Closure ' + P.label(p.id) + ': some splices join cables on the same side; check them on the detailed sheet.');
      const yb = Math.min(yl, yr) - 1; G.rect(-3, yb, W + 6, 6.5 - yb, isNew ? 'SITE_NEW' : 'SITE_EXIST', { lw: 0.3 });
      B.push(block(G));
    });
    /* each end: its ports */
    P.pts.filter(p => (p.type === 'site' || p.type === 'dnap') && P.sites.get(p.id)).forEach(p => {
      const s = P.sites.get(p.id); if (!s.ends.length && !(s.term && s.term.length)) return;
      const G = new Gfx(), lay = s.existing ? 'SITE_EXIST' : 'SITE_NEW';
      G.tx(0, 0, (p.type === 'dnap' ? 'DUMMY NAP ' : 'FDU ') + (p.fdu || p.name || '') + ' · ' + String(p.name || '').toUpperCase() + (p.code ? ' (' + String(p.code).toUpperCase() + ')' : ''), 2.8, lay, { bold: true });
      G.tx(0, -4, (s.existing ? 'EXISTING' : 'NEW') + (p.type === 'dnap' ? ' DUMMY NAP · ' : ' FDU PANEL · ') + 'capacity ' + s.cap + ' ports', 1.9, 'NOTE');
      const rows = [];
      s.ends.forEach(e => e.f.forEach((f, i) => rows.push([e.ports[i] != null ? String(e.ports[i]) : '-', e.c.name, 'F' + f, FCN(f), P.label(e.other).toUpperCase() + ' (LINK ' + (e.li + 1) + ')'])));
      if (!s.existing) s.term.forEach(t => { const spare = t.ports.filter(pt => !s.working.includes(pt)); if (spare.length) rows.push([fmtRanges(spare), t.c.name, fmtRanges(t.fibers.filter((f, i) => spare.includes(t.ports[i])), 'F'), '', { s: 'terminated, spare', lay: 'NOTE' }]); });
      else { if (s.before.length) rows.push([fmtRanges(s.before), '', '', '', { s: 'active before this project', lay: 'NOTE' }]); if (s.vacant.length) rows.push([fmtRanges(s.vacant), '', '', '', { s: 'vacant', lay: 'NOTE' }]); }
      table(G, 0, -6.5, [{ t: 'PORT', w: 18, al: 'c' }, { t: 'CABLE', w: 42 }, { t: 'FIBER', w: 22, al: 'c' }, { t: 'TUBE / COLOUR', w: 36 }, { t: 'GOES TO', w: 68 }], rows, { th: 1.9 });
      B.push(block(G));
    });
    return B;
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
    /* each drop cable, NAP by NAP: which of its 6 fibers carries what */
    mains.forEach(mn => mn.drops.forEach(dr => {
      const st = seq(1, 6).map(() => ({ kind: 'spare' })); dr.lines.forEach(ln => { st[ln.fDrop - 1] = { kind: 'feed', ln }; });
      dr.start = st.map(s => Object.assign({}, s)); dr.boxes = [];
      dr.lines.forEach(ln => ln.naps.forEach(nap => {
        const before = st.map(s => Object.assign({}, s)), taps = [], placed = [];
        if (nap.j === 0) {
          taps.push(ln.fDrop); st[ln.fDrop - 1] = { kind: 'dead' };
          ln.naps.slice(1).forEach(nn => nn.outs.forEach(o => { const k = st.findIndex(s => s.kind === 'spare' || s.kind === 'dead'); if (k < 0) { warn.push(nn.id + ': the drop cable has no free fiber left to reach it.'); return; } st[k] = { kind: 'out', ln, out: o, nap: nn }; placed.push({ o, k: k + 1, nap: nn }); }));
        } else nap.outs.forEach(o => { const k = st.findIndex(s => s.kind === 'out' && s.ln === ln && s.out === o); if (k >= 0) { taps.push(k + 1); st[k] = { kind: 'dead' }; } });
        nap.via = []; if (nap.j > 0) nap.via = nap.outs.map(o => { const p = (dr.boxes.find(b => b.nap === ln.naps[0]) || { placed: [] }).placed.find(x => x.o === o); return p ? p.k : null; }).filter(Boolean);
        dr.boxes.push({ nap, ln, before, after: st.map(s => Object.assign({}, s)), taps, placed });
      }));
      dr.end = st.map(s => Object.assign({}, s));
    }));
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
  function bbDetailed(B) {
    const out = [];
    { /* the feeder and the assignment of its fibers */
      const G = new Gfx(), mains = B.mains.filter(mn => mn.lines.length);
      G.tx(0, 0, 'FEEDER AND FIBER SPLICING ASSIGNMENT', 3, 'TEXT', { bold: true });
      G.tx(0, -4.2, B.olt.name.toUpperCase() + ' · ODF ' + String(B.olt.odf).toUpperCase() + ' (' + B.olt.odfSize + ' PORTS)' + (B.fd.use ? ' · ' + B.fd.name.toUpperCase() + ' ' + B.fd.size + 'C TO ' + String(B.fd.closure).toUpperCase() : ' · MAINS STRAIGHT FROM THE ODF'), 1.9, 'NOTE');
      const used = mains.flatMap(mn => mn.odfP), size = Math.max(+B.olt.odfSize || 0, ...used, 1), spare = seq(1, size).filter(f => !used.includes(f));
      const rows = mains.map(mn => ({ t: 'P' + fmtRanges(mn.odfP), mn })).concat(runs(spare).map(([a, b]) => ({ t: 'P' + (a === b ? a : a + '-' + b) + ' SPARE' })));
      rows.sort((a, b) => parseInt(a.t.slice(1)) - parseInt(b.t.slice(1)));
      const RH = 5, y0 = -10, odfH = rows.length * RH + 4;
      G.rect(0, y0 - odfH, 24, odfH, 'NAP', { lw: 0.45 }); G.tx(12, y0 + 1.5, 'ODF', 2.2, 'TEXT', { al: 'c', bold: true });
      const xF = B.fd.use ? 120 : 60, xD = B.fd.use ? 210 : 150;
      rows.forEach((r, i) => {
        const y = y0 - 4 - i * RH; G.tx(2, y, r.t, 1.7, r.mn ? 'FIBER_USED' : 'TEXT', { va: 'm', bold: !!r.mn });
        G.ln(24, y, r.mn ? (B.fd.use ? xF : xD) : 40, y, r.mn ? 'FIBER_USED' : 'FIBER'); if (!r.mn) G.ln(40, y - 1, 40, y + 1, 'FIBER');
        r.y = y;
      });
      if (B.fd.use) {
        const fy = rows.filter(r => r.mn).map(r => r.y), yt = Math.max(...fy, y0 - 4) + 5, yb = Math.min(...fy, y0 - 4) - 5;
        G.tx(72, yt + 1, B.fd.name.toUpperCase() + ' · ' + B.fd.size + 'C FOC', 2, 'CABLE', { al: 'c', bold: true });
        G.rect(xF, yb - 3, 60, yt - yb + 6, 'CLOSURE_BOX'); G.tx(xF + 30, yt + 4.6, String(B.fd.closure).toUpperCase(), 2.2, 'TEXT', { al: 'c', bold: true });
        G.tx(xF + 2, yt, 'FIBER SPLICING ASSIGNMENT', 1.7, 'TEXT', { bold: true });
        rows.filter(r => r.mn).forEach(r => { G.tx(xF + 2, r.y, fmtRanges(r.mn.feedF) + ' (' + B.fd.size + 'C) > ' + fmtRanges(r.mn.distUsed) + ' (' + r.mn.size + 'C)', 1.6, 'TEXT', { va: 'm' }); G.ln(xF + 60, r.y, xD, r.y, 'FIBER_USED'); });
      }
      rows.filter(r => r.mn).forEach(r => {
        const mn = r.mn; G.rect(xD, r.y - 2.6, 68, 5.2, 'CLOSURE_BOX');
        G.tx(xD + 2, r.y, mn.name + ' ' + mn.size + 'C F' + fmtRanges(mn.distUsed) + ' > ' + mn.closure + ' · ' + mn.drops.length + ' DROP' + (mn.drops.length > 1 ? 'S' : '') + ', ' + mn.lines.length + ' LINES', 1.55, 'TEXT', { va: 'm' });
      });
      const ys = Math.min(y0 - odfH, ...rows.map(r => r.y)) - 8;
      table(G, 0, ys, [{ t: 'MAIN', w: 26 }, { t: 'CLOSURE', w: 34 }, { t: 'DROP', w: 14, al: 'c' }, { t: 'LINES', w: 40 }, { t: 'MAIN FIBERS', w: 24, al: 'c' }, { t: '6F DROP FIBERS', w: 26, al: 'c' }, { t: 'NAPS', w: 70 }, { t: 'PORTS', w: 16, al: 'c' }],
        mains.flatMap(mn => mn.drops.map(dr => [mn.name, mn.closure, String(dr.d + 1), dr.lines.map(l => l.id).join(', '), 'F' + fmtRanges(dr.lines.map(l => l.fDist)), 'F' + fmtRanges(dr.lines.map(l => l.fDrop)), dr.lines.flatMap(l => l.naps.map(n => n.id.replace(/^L/, '') + (n.ports === 8 ? '(8)' : '(16)'))).join(' '), String(dr.lines.reduce((a, l) => a + l.naps.reduce((b, n) => b + n.ports, 0), 0))])), { th: 1.7 });
      G.txs(292, 0, bbSummary(B).map((s, i) => i ? s : { s, o: { bold: true } }), 2, 'TEXT', { gap: 1.6 });
      out.push(block(G));
    }
    B.mains.forEach(mn => mn.drops.forEach(dr => out.push(dropBlock(B, mn, dr))));
    return out;
  }
  /* one 6F drop cable from its closure through its NAPs: the fibers, the 1:4 and the 1:8 splitters */
  function dropBlock(B, mn, dr) {
    const G = new Gfx(), P = 56, BW = 42, X0 = 26, fy = k => -12 - (k - 1) * 3, live = s => s.kind === 'feed' || s.kind === 'out';
    const L0 = dr.lines[0], L1 = dr.lines[dr.lines.length - 1];
    G.tx(0, 4, mn.name + ' · ' + mn.closure + ' > DROP ' + (dr.d + 1) + ' (6F) · ' + L0.id + (L1 !== L0 ? '-' + L1.id : '') + ' · MAIN FIBERS F' + fmtRanges(dr.lines.map(l => l.fDist)), 2.4, 'TEXT', { bold: true });
    G.rect(0, fy(6) - 4, 8, fy(1) - fy(6) + 8, 'CLOSURE_BOX'); G.tx(4, fy(1) + 6, mn.closure, 1.5, 'TEXT', { al: 'c', bold: true });
    for (let k = 1; k <= 6; k++) { const s = dr.start[k - 1]; G.tx(10, fy(k), String(k), 1.6, 'TEXT', { va: 'm' }); if (s.kind === 'feed') G.tx(13, fy(k) + 1.2, s.ln.id + ' F' + s.ln.fDist + '-' + mn.size + 'C', 1.1, 'FIBER_USED'); }
    G.tx(13, fy(1) + 1.2, 'DROP 6F', 1.2, 'TEXT');
    let prevX = 8; const seg = (x1, x2, st) => { for (let k = 1; k <= 6; k++) G.ln(x1, fy(k), x2, fy(k), live(st[k - 1]) ? 'FIBER_USED' : 'FIBER'); };
    dr.boxes.forEach((bx, i) => {
      const x = X0 + i * P, nap = bx.nap, first = nap.j === 0;
      seg(prevX === 8 ? 12 : prevX, x, bx.before);
      G.rect(x, -64, BW, 58, 'NAP', { lw: 0.35 }); G.tx(x, -4.6, nap.id + ' (' + nap.ports + 'P)', 1.9, 'TEXT', { bold: true });
      for (let k = 1; k <= 6; k++) {
        const tapped = bx.taps.includes(k), gets = bx.placed.find(p => p.k === k);
        if (tapped) G.frect(x + 0.6, fy(k) - 1.15, 2.6, 2.3, 'HILITE');
        G.tx(x + 1.9, fy(k), String(k), 1.4, 'TEXT', { al: 'c', va: 'm' }); G.tx(x + BW - 1.4, fy(k), String(k), 1.4, 'TEXT', { al: 'c', va: 'm' });
        if (tapped || gets) { G.ln(x + 3.4, fy(k), x + 4.6, fy(k), live(bx.before[k - 1]) ? 'FIBER_USED' : 'FIBER'); if (!tapped) G.ln(x + 4.6, fy(k) - 0.9, x + 4.6, fy(k) + 0.9, 'FIBER'); }
        else G.ln(x + 3.4, fy(k), x + BW - 2.8, fy(k), live(bx.before[k - 1]) ? 'FIBER_USED' : 'FIBER');
      }
      const b8 = nap.ports / 8, c8 = j => x + 24 + j * 9.4, y8 = -55;
      for (let j = 0; j < b8; j++) { G.rect(c8(j) - 4, y8, 8, 5, 'SPLITTER'); G.tx(c8(j), y8 + 2.5, '1:8', 1.7, 'SPLITTER', { al: 'c', va: 'm' }); }
      G.tx(x + 24 + (b8 - 1) * 4.7, -61.6, nap.ports === 16 ? 'DNAP' : 'SNAP', 1.5, 'TEXT', { al: 'c', bold: true });
      if (first) {
        const sx = x + 11, yo = o => -33 - (o - 1) * 3.4, yin = -39.2;
        G.rect(sx, -47.5, 5, 16.5, 'SPLITTER'); G.tx(sx + 2.5, -39.2, '1:4', 1.8, 'SPLITTER', { al: 'c', va: 'm', rot: 90 });
        const k = bx.taps[0], lx = x + 5.6; G.pl([[x + 4.6, fy(k)], [lx, fy(k)], [lx, yin], [sx, yin]], 'FIBER_USED');
        for (let o = 1; o <= 4; o++) G.tx(sx + 6, yo(o) + 0.6, String(o), 1.2, 'TEXT');
        nap.outs.forEach((o, j) => G.pl([[sx + 5, yo(o)], [c8(j), yo(o)], [c8(j), y8 + 5]], 'FIBER_USED'));
        bx.placed.forEach((p, j) => { const xr = x + 19 + j * 1.7; G.pl([[sx + 5, yo(p.o)], [xr, yo(p.o)], [xr, fy(p.k)], [x + BW - 2.8, fy(p.k)]], 'FIBER_USED'); });
        bx.ln.spare.forEach(o => { G.ln(sx + 5, yo(o), sx + 8.4, yo(o), 'FIBER'); G.ln(sx + 8.4, yo(o) - 0.9, sx + 8.4, yo(o) + 0.9, 'FIBER'); });
      } else {
        bx.taps.forEach((k, j) => { const lx = x + 5.6 + j * 1.6; G.pl([[x + 4.6, fy(k)], [lx, fy(k)], [lx, -46 - j * 1.6], [c8(j), -46 - j * 1.6], [c8(j), y8 + 5]], 'FIBER_USED'); });
      }
      G.tx(x + BW / 2, -67.5, '(' + nap.no + ') ' + (nap.pole || 'NO POLE ID') + (nap.poleType ? ' · ' + nap.poleType : ''), 1.6, 'TEXT', { al: 'c' });
      prevX = x + BW;
    });
    const xe = prevX + 7; seg(prevX, xe, dr.end); for (let k = 1; k <= 6; k++) G.ln(xe, fy(k) - 0.9, xe, fy(k) + 0.9, 'FIBER');
    G.tx(xe + 1.5, fy(1) + 1.2, 'END', 1.3, 'NOTE');
    return block(G);
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
        if (v === 'detailed') list.push(...sheetsOf(paginate(accessDetailed(plan)), head));
        else { const leg = accessLegend(plan); list.push(...sheetsOf(paginate([accessSLD(plan)], { area: { x0: AREA.x0, y0: AREA.y0 + 20, x1: AREA.x1, y1: AREA.y1 }, center: true, grow: 1.45 }), head, () => leg ? xf(leg.prims, 1, AREA.x0, AREA.y0 + 13) : [])); }
      } else {
        const leg = bbLegend();
        if (v === 'detailed') list.push(...sheetsOf(paginate(bbDetailed(plan), { area: { x0: AREA.x0, y0: AREA.y0 + 16, x1: AREA.x1, y1: AREA.y1 } }), head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7)));
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
