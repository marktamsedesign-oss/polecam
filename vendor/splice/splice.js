/* G-eSAA · Splicing details (demo engine).
   Draws the splicing of a project's fiber as A3 sheets, from its points, cables and links:
     Access OSP   · single line diagram: homing to homing, through closures and dummy NAPs (new red, existing blue)
                  · detailed: drawn like the ODN's: the homing ODF, every cable a bundle of fibers through its closures (splices inside),
                    the far ODF or dummy NAP (pole-mounted small cell)
     Broadband    · single line diagram: OLT ODF, feeder, mains, 6F drop cables, lines (LCP) and NAPs, with the counts
       (OLT/ODN)  · detailed: one drawing: the ODF, the feeder closure, each main up to its closure, then each 6F drop through its NAPs (1:4, 1:8)
   Fibers are given out by the engine: a link (leg) takes the lowest free run of fibers on each cable it uses, so a straight splice keeps its
   numbers (F1-6 to F1-6) and an existing cable gives its first vacant fibers (F13-18 when 1-12 are in use); `rules.tube = 'fresh'` keeps
   it out of any tube with a live fiber. A leg is tested end to end, spliced only (test later) or future (a second cable, xx-xx); the
   As-Plan draws planned connections, the As-Built the testing words. Splice.assign(model) gives the fibers without drawing.
   Every splice of the work is a red dot (layer SPLICE_NEW). A detailed drawing too big to read on one sheet becomes a key map and one sheet
   per grid cell (A-01, B-01 …), like a map book; see "the grid" below.
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
    HILITE: [2, '#ffe100', 0.1], TABLE: [7, '#111111', 0.2], LEGEND: [7, '#111111', 0.2], GRID: [9, '#c9cdd3', 0.18, 1],
    FOC_FUTURE: [8, '#8a8f98', 0.3, 1], FIBER_RESERVED: [1, '#d71920', 0.32, 1],
    /* a splice made by this work (filled; hollow for a leg spliced only), and the match line of a grid sheet */
    SPLICE_NEW: [1, '#d71920', 0.2], MATCH: [7, '#3b4250', 0.35, 1]
  };
  const layerRGB = l => (LAYERS[l] || LAYERS.TEXT)[1];

  /* ---------- text widths (Helvetica; h is the capital height, as in a DXF) ---------- */
  const HV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const HVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const CAP = 0.718; /* Helvetica's capital height, of the font size */
  function textW(s, h, bold) { const T = bold ? HVB : HV; let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? T[c - 32] : 556; } return w / 1000 * h / CAP; }
  /* a label cut to a width, ending in ... */
  function fitTx(s, h, width, bold) { s = String(s); if (textW(s, h, bold) <= width) return s; let k = s.length - 1; while (k > 1 && textW(s.slice(0, k) + '...', h, bold) > width) k--; return s.slice(0, k) + '...'; }
  function wrap(s, h, width, bold) {
    const words = String(s).split(' '), out = []; let cur = '';
    for (let w of words) {
      const t = cur ? cur + ' ' + w : w; if (cur && textW(t, h, bold) > width) { out.push(cur); cur = w; } else cur = t;
      /* a word wider than the cell: cut it */
      while (textW(cur, h, bold) > width && cur.length > 1) { let k = cur.length - 1; while (k > 1 && textW(cur.slice(0, k), h, bold) > width) k--; out.push(cur.slice(0, k)); cur = cur.slice(k); }
    }
    out.push(cur); return out;
  }

  /* ---------- the drawing: primitives ----------
     G.ref (optional): a tap target ('pt:<id>', 'cab:<key>', 'leg:<id>') carried by the primitives drawn while it is set; toSVG groups them.
     For the grid sheets: G.g, the lines of one label (txs sets it: they go on a sheet together); G.u, a unit (a closure, a NAP, an ODF:
     its shape and its texts), and a text's nm, the unit's name (shown again on a grid sheet that shows the unit but not its name) */
  let GID = 0;
  class Gfx {
    constructor() { this.p = []; this.ref = null; this.g = null; this.u = null; this.ow = null; this.pt = null; }
    /* (ow: whose a primitive is, 'n:<point>' or 'c:<cable>', and pt: a symbol and the words drawn in it, for the single line diagram's room check) */
    put(o) { if (this.ref) o.ref = this.ref; if (this.g) o.g = this.g; if (this.u) o.u = this.u; if (this.ow) o.ow = this.ow; if (this.pt) o.pt = this.pt; this.p.push(o); return this; }
    /* the texts drawn in f() are one label */
    group(f) { const g0 = this.g; if (!g0) this.g = 'g' + ++GID; f(); this.g = g0; return this; }
    pl(pts, lay, o) { o = o || {}; if (pts.length > 1) this.put({ k: 'pl', pts: pts.map(q => [q[0], q[1]]), close: !!o.close, lay, col: o.col || null, lw: o.lw || 0 }); return this; }
    ln(x1, y1, x2, y2, lay, o) { return this.pl([[x1, y1], [x2, y2]], lay, o); }
    rect(x, y, w, h, lay, o) { return this.pl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], lay, Object.assign({}, o, { close: true })); }
    fl(pts, lay, o) { o = o || {}; return this.put({ k: 'fl', pts: pts.map(q => [q[0], q[1]]), lay, col: o.col || null }); }
    frect(x, y, w, h, lay, o) { return this.fl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], lay, o); }
    ci(x, y, r, lay, o) { o = o || {}; return this.put({ k: 'ci', c: [x, y], r, lay, col: o.col || null, fill: !!o.fill, lw: o.lw || 0 }); }
    /* x, y: where the text sits; al l/c/r; va b (baseline), m (middle), t (top); rot in degrees */
    tx(x, y, s, h, lay, o) {
      o = o || {}; s = String(s == null ? '' : s); if (!s.trim()) return this;
      const r = (o.rot || 0) * Math.PI / 180, d = o.va === 'm' ? -0.5 * h : o.va === 't' ? -h : 0;
      const t = { k: 'tx', p: [x - Math.sin(r) * d, y + Math.cos(r) * d], s, h, lay, al: o.al || 'l', rot: o.rot || 0, bold: !!o.bold, col: o.col || null }; if (o.nm) t.nm = 1;
      return this.put(t);
    }
    /* lines of text going down from y; returns the y under the last line */
    txs(x, y, lines, h, lay, o) { const g = (o && o.gap) || 1.55; this.group(() => lines.forEach((ln, i) => { const L = typeof ln === 'string' ? { s: ln } : ln; this.tx(x, y - i * h * g, L.s, L.h || h, L.lay || lay, Object.assign({}, o, L.o)); })); return y - lines.length * h * g; }
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
    return list.map((sh, i) => {
      const G = new Gfx(); frame(G, title || {}, sh.head, i + 1, N); const n = G.p.length, out = { name: sh.head + ' ' + (i + 1), head: sh.head, prims: G.p.concat(sh.prims) };
      /* label: a short name for a list of sheets; cells: tap targets ({name, box} in sheet mm) that open the sheet of that grid cell;
         the key map and a grid sheet (cell: its name) also have area (the drawing area), view (model to sheet: x * k + dx, y * k + dy)
         and body (where its drawing is in prims, [from, to)) */
      if (sh.label) out.label = sh.label; if (sh.cells) out.cells = sh.cells; if (sh.keymap) out.keymap = true; if (sh.cell) out.cell = sh.cell;
      if (sh.body) Object.assign(out, { area: sh.area, view: sh.view, body: [sh.body[0] + n, sh.body[1] + n] });
      return out;
    });
  }

  /* small table: cols [{t, w, al}], rows of strings (long text wraps inside its cell; a row's .ref makes it a tap target); returns the y under it */
  function table(G, x, y, cols, rows, o) {
    o = o || {}; const th = o.th || 1.9, pd = 1.2, W = cols.reduce((a, c) => a + c.w, 0);
    const lineH = th * 1.6, head = cols.map(c => wrap(c.t, th, c.w - 2 * pd, true));
    const hh = Math.max(...head.map(l => l.length)) * lineH + 2 * pd;
    G.frect(x, y - hh, W, hh, 'HILITE', { col: { rgb: '#eef1f4', aci: 9 } });
    let cx = x; cols.forEach((c, i) => { head[i].forEach((ln, k) => G.tx(c.al === 'c' ? cx + c.w / 2 : cx + pd, y - pd - th - k * lineH, ln, th, 'TABLE', { bold: true, al: c.al === 'c' ? 'c' : 'l' })); cx += c.w; });
    let yy = y - hh;
    for (const r of rows) {
      const pr = G.ref; if (r.ref) G.ref = r.ref;
      const cells = cols.map((c, i) => { const v = r[i]; const s = v && typeof v === 'object' ? v.s : v; return { lines: wrap(String(s == null ? '' : s), th, c.w - 2 * pd, v && v.bold), o: v && typeof v === 'object' ? v : {} }; });
      const rh = Math.max(...cells.map(c => c.lines.length)) * lineH + 2 * pd;
      cx = x; cells.forEach((c, i) => { const col = cols[i]; c.lines.forEach((ln, k) => G.tx(col.al === 'c' ? cx + col.w / 2 : cx + pd, yy - pd - th - k * lineH, ln, th, c.o.lay || 'TABLE', { al: col.al === 'c' ? 'c' : 'l', bold: c.o.bold, col: c.o.col })); cx += col.w; });
      G.ln(x, yy - rh, x + W, yy - rh, 'TABLE'); yy -= rh; G.ref = pr;
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
  function dnapIcon(G, x, y, lay, k) { k = k || 1; G.frect(x - 6 * k, y - 4 * k, 12 * k, 8 * k, 'HILITE', { col: { rgb: '#ffffff', aci: 7 } }); G.rect(x - 6 * k, y - 4 * k, 12 * k, 8 * k, lay, { lw: 0.5 }); G.tx(x, y, 'DNAP', 2 * Math.min(1, k * 1.1), lay, { al: 'c', va: 'm', bold: true }); }
  function ellipse(G, cx, cy, rx, ry, lay, o) { G.pl(seq(0, 40).map(i => [cx + rx * Math.cos(i * Math.PI / 20), cy + ry * Math.sin(i * Math.PI / 20)]), lay, Object.assign({}, o, { close: true })); }
  const cap = (G, x, y) => G.ln(x, y - 0.45, x, y + 0.45, 'FIBER');
  /* a fiber's number, just above its line where the line meets an enclosure, a NAP or a dummy NAP */
  const fnum = (G, x, y, s, al, lay) => G.tx(x, y + 0.2, String(s), 0.62, lay || 'TEXT', { al: al || 'l' });
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
     model: { points: [{id, type: site|closure|dnap, name, code, status: new|existing, fdu, ports, active, termFrom, split, coords}],
              cables: [{id, name, from, to, size, status, length, used, leg, fid, fpt}],
              links: [{id, a, b, fibers, state: tested|spliced|future|tbc, test: {date, loss, otdr}, fix: {<cable id or name>: first fiber (moved by hand) or 'F7-12' (locked at export)}, via: [closure ids], cable}],
              fpt, stage: plan|built, rules: {tube: lowest|fresh, future: cable|blank, split: half|need} }
     An existing FDU's `active` ports and an existing cable's `used` fibers are what was live BEFORE the work (`active: '?'` = not sure yet).
     A link is a leg: tested end to end, spliced only (test later), or future (not built yet: a second cable into the new FDU, fibers xx-xx).
     The As-Plan draws every leg as a planned connection (a future one aside); the As-Built adds the testing words and line styles.
     A cable without a name prints TBF (its ID follows later); the plan's words then name it by its ends ('the new 72F cable C1 – C2').
     A locked run keeps its fibers when another leg grows; a leg that grows past its own locked run is moved, with a warning on that leg.
     plan.legs[i] also has short ({have, need} when a cable gives fewer fibers than the leg needs), confirm (homings whose live ports are not sure)
     and status (the CONNECTIONS words: state, NOT ENOUGH FREE FIBERS (k OF n), LIVE PORTS TBC); each fiber has tbc, limit (the FDU window), locked, hand, moved.
     ====================================================================================================== */
  const RULES = { tube: 'lowest', future: 'cable', split: 'half' };
  const rulesOf = m => { const r = Object.assign({}, RULES, m && m.rules); return { tube: r.tube === 'fresh' ? 'fresh' : 'lowest', future: r.future === 'blank' ? 'blank' : 'cable', split: r.split === 'need' ? 'need' : 'half' }; };
  /* 'tbc': the As-Built has not been told yet whether the leg is tested now (it takes its fibers like a tested leg, and prints TEST STATUS TO BE CONFIRMED) */
  const STATES = ['tested', 'spliced', 'future', 'tbc'];
  const isTbc = v => /^\s*(\?|TBC|TO BE CONFIRMED|NOT SURE( YET)?)\s*$/i.test(String(v == null ? '' : v));
  const dateTxt = d => { const s = String(d == null ? '' : d).trim(), m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); return m ? pad(+m[3], 2) + '-' + pad(+m[2], 2) + '-' + m[1] : s; };
  const lossTxt = v => { const s = String(v == null ? '' : v).trim(); return !s ? '' : /db$/i.test(s) ? s.replace(/\s*db$/i, ' dB') : s + ' dB'; };
  const up = s => String(s == null ? '' : s).toUpperCase();
  const stem = s => String(s || '').replace(/-L\d+$/i, '');
  const hasFid = c => c.fid != null && String(c.fid) !== '';
  /* two pieces of one physical existing cable, cut at a closure: the same fid (RUN), or without fids the same ID before its -L<n> */
  const samePhys = (a, b) => a !== b && a.status === 'existing' && b.status === 'existing' && a.size === b.size &&
    (hasFid(a) || hasFid(b) ? String(a.fid) === String(b.fid) : a.named && stem(a.name) !== a.name && stem(a.name) === stem(b.name));
  /* how a leg is drawn: plain (As-Plan), tested or spliced (As-Built), future (both) */
  const lookOf = (st, stage) => st === 'future' ? 'future' : stage === 'built' ? st : 'plain';
  /* a leg's words: [main, details] */
  function legWords(leg, stage) {
    if (leg.state === 'future') return [stage === 'built' ? 'NOT YET BUILT' : 'LATER (SECOND CABLE)', ''];
    if (stage !== 'built') return ['PLANNED', ''];
    if (leg.state === 'spliced') return ['SPLICED ONLY', 'FOR FUTURE TESTING'];
    if (leg.state === 'tbc') return ['TEST STATUS', 'TO BE CONFIRMED'];
    const t = leg.test || {}; return ['TESTED END TO END', [dateTxt(t.date), lossTxt(t.loss), t.otdr ? 'OTDR' : ''].filter(Boolean).join(' · ')];
  }

  function accessPlan(m) {
    const warn = [], rules = rulesOf(m), stage = m.stage === 'built' ? 'built' : 'plan', fpt = Math.max(1, +m.fpt || 12);
    const pts = (m.points || []).filter(p => p && p.id), byId = new Map(pts.map(p => [p.id, p]));
    const label = id => { const p = byId.get(id); return p ? String(p.name || p.code || id) : String(id); };
    const typ = id => (byId.get(id) || {}).type, isEnd = id => typ(id) === 'site' || typ(id) === 'dnap', isNew = id => byId.has(id) && byId.get(id).status !== 'existing';
    const cables = [];
    (m.cables || []).forEach((c, i) => {
      if (!c) return;
      if (!byId.has(c.from) || !byId.has(c.to) || c.from === c.to) { warn.push('Cable ' + (c.name || i + 1) + ': choose two different points for its ends.'); return; }
      const size = Math.max(1, Math.round(+c.size) || 12), cf = Math.max(1, Math.round(+c.fpt) || fpt), live = parseRanges(c.used).filter(f => f <= size), name = String(c.name == null ? '' : c.name).trim();
      cables.push(Object.assign({}, c, { k: cables.length, key: String(c.id != null && String(c.id) !== '' ? c.id : name || '#' + (i + 1)), name: name || 'TBF', named: !!name, size, fpt: cf, status: c.status === 'existing' ? 'existing' : 'new',
        live, liveTubes: new Set(live.map(f => Math.ceil(f / cf))), taken: new Set(live), avoid: new Set(), links: [], tbcAt: new Set(), win: [], owner: new Map() }));
    });
    /* a cable in plain words: its ID, or (ID to follow) what it is and where it runs */
    const cdesc = c => c.named ? c.name : 'the ' + (c.status === 'existing' ? 'existing ' : 'new ') + c.size + 'F cable ' + label(c.from) + ' – ' + label(c.to);
    const cwho = c => c.named ? 'cable ' + c.name : cdesc(c);
    const adj = new Map(pts.map(p => [p.id, []]));
    cables.forEach(c => { adj.get(c.from).push({ c, o: c.to }); adj.get(c.to).push({ c, o: c.from }); });

    /* the legs */
    const legs = [];
    (m.links || []).forEach((L, li) => {
      if (!L) return;
      legs.push({ li, L, id: String(L.id != null && String(L.id) !== '' ? L.id : li + 1), a: L.a, b: L.b, n: Math.max(1, Math.round(+L.fibers) || 1), state: STATES.indexOf(L.state) >= 0 ? L.state : 'tested',
        test: L.test || null, path: null, warn: [], what: 'Leg ' + (li + 1) + ' (' + label(L.a) + ' to ' + label(L.b) + ')' });
    });
    const say = (leg, s) => { leg.warn.push(s); warn.push(leg.what + ': ' + s); };

    /* the way: through closures only, never through another site or dummy NAP; `via` names the closures of a chosen way, in order */
    const bfsPath = (a, b, block) => {
      const prev = new Map([[a, null]]), q = [a];
      while (q.length) {
        const u = q.shift(); if (u === b) break;
        if (u !== a && typ(u) !== 'closure') continue;
        for (const e of adj.get(u).slice().sort((x, y) => x.c.k - y.c.k)) if (!prev.has(e.o) && !(block && block.has(e.o))) { prev.set(e.o, { u, c: e.c }); q.push(e.o); }
      }
      if (!prev.has(b)) return null; const out = []; let v = b; while (prev.get(v)) { const s = prev.get(v); out.unshift({ c: s.c, from: s.u, to: v }); v = s.u; } return out;
    };
    const routeOf = leg => {
      const via = [].concat(leg.L.via || []).filter(v => v !== leg.a && v !== leg.b);
      if (!via.length) return bfsPath(leg.a, leg.b);
      if (via.some(v => typ(v) !== 'closure')) { say(leg, 'its chosen way names a point that is not a closure, so it goes the shortest way.'); return bfsPath(leg.a, leg.b); }
      const way = [leg.a].concat(via, [leg.b]), seen = new Set([leg.a]); let path = [];
      for (let w = 0; w + 1 < way.length && path; w++) {
        const pp = bfsPath(way[w], way[w + 1], new Set([...seen].filter(x => x !== way[w]).concat(way.slice(w + 2))));
        if (!pp) path = null; else { pp.forEach(s => seen.add(s.to)); path = path.concat(pp); }
      }
      if (path) return path;
      say(leg, 'no cable goes the chosen way (through ' + via.map(label).join(', ') + '), so it goes the shortest way.');
      return bfsPath(leg.a, leg.b);
    };
    legs.forEach(leg => {
      if (!byId.has(leg.a) || !byId.has(leg.b) || leg.a === leg.b) { leg.bad = true; say(leg, 'choose two different end points.'); return; }
      if (leg.state === 'future') return;
      leg.path = routeOf(leg);
      if (!leg.path) say(leg, 'no cable connects them yet.');
    });
    const routed = legs.filter(l => l.path);

    /* each end's ports, one window per cable, so two cables never claim the same port:
       an existing FDU is already terminated: its existing cables keep their ports (one cable: port = fiber up to the capacity; more: equal parts),
       and a new cable gets vacant ports only (unterminated ports first, then the lowest vacant run), never a live one;
       a new FDU terminates from fiber termFrom, in the order of the legs: half and half, or only what each cable's legs use (point.split or rules.split) */
    const U = new Map(), use = (id, c, leg) => { if (!U.has(id)) U.set(id, new Map()); const M = U.get(id), u = M.get(c) || { n: 0, first: Infinity, ns: [] }; u.n += leg.n; u.ns.push(leg.n); u.first = Math.min(u.first, leg.li); M.set(c, u); };
    routed.forEach(leg => { use(leg.a, leg.path[0].c, leg); use(leg.b, leg.path[leg.path.length - 1].c, leg); });
    const capOf = p => { const inc = adj.get(p.id); return Math.max(1, +p.ports || (inc[0] ? inc[0].c.size : 12)); };
    /* a window lined up with the buffers: the fibers the legs of one cable take, buffer first (the same rule as below, on the cable alone, from fiber t0),
       so a window of just what the legs use still gives each leg its own buffer (6 + 12 -> F1-6 and F13-24, a window of 24); null when they do not fit */
    const packNeed = (c, t0, ns) => {
      const used = new Set(), B = c.fpt, okRun = (s, n) => { if (s < t0 || s + n - 1 > c.size) return false; for (let f = s; f < s + n; f++) if (used.has(f)) return false; return true; };
      let top = t0 - 1;
      for (const n of ns) {
        let s0 = 0;
        if (n <= B) { for (let s = t0; s + n - 1 <= c.size && !s0; s++) if (Math.ceil(s / B) === Math.ceil((s + n - 1) / B) && okRun(s, n)) s0 = s; }
        else for (let s = 1; s + n - 1 <= c.size && !s0; s += B) if (okRun(s, n)) s0 = s;
        for (let s = t0; s + n - 1 <= c.size && !s0; s++) if (okRun(s, n)) s0 = s;
        if (!s0) return null;
        for (let f = s0; f < s0 + n; f++) used.add(f); top = Math.max(top, s0 + n - 1);
      }
      return top - t0 + 1;
    };
    /* half and half in whole buffers when every cable can have at least one (48 ports, three cables: 24 + 12 + 12, not 16 each); else as before */
    const halfParts = (order, cap) => {
      const parts = []; let R = cap;
      for (let i = 0; i < order.length; i++) {
        const c = order[i], k = order.length - i, rest = order.slice(i + 1).reduce((a, x) => a + x.fpt, 0);
        if (R < c.fpt + rest) return null;
        const a = i === order.length - 1 ? R : Math.min(Math.ceil(R / k / c.fpt) * c.fpt, R - rest);
        parts.push(a); R -= a;
      }
      return parts;
    };
    const term = new Map();
    pts.forEach(p => {
      if (!isEnd(p.id)) return;
      const ex = p.status === 'existing', cap = capOf(p), M = U.get(p.id) || new Map(), t0 = ex ? 1 : Math.max(1, Math.round(+p.termFrom) || 1);
      const first = c => (M.get(c) || { first: Infinity }).first, T = [];
      const tbc = ex && isTbc(p.active), live = new Set(ex && !tbc ? parseRanges(p.active) : []);
      if (ex) {
        const inc = adj.get(p.id).map(e => e.c), old = inc.filter(c => c.status === 'existing').sort((x, y) => x.k - y.k);
        const nu = inc.filter(c => c.status !== 'existing').sort((x, y) => (first(x) - first(y)) || x.k - y.k);
        let port = 1;
        old.forEach((c, i) => { const part = Math.floor(cap / old.length) + (i < cap % old.length ? 1 : 0), n = Math.max(0, Math.min(c.size, part, cap - port + 1)); T.push({ c, ports: seq(port, n), fibers: seq(1, n) }); port += n; });
        nu.forEach((c, ni) => {
          const u = M.get(c) || { n: 0, ns: [] }, plain = Math.min(c.size, u.n), al = packNeed(c, 1, u.ns), got = [];
          /* lined up with the buffers when the FDU has the room (vacant ports past the existing cables' own, for this cable and the new ones after it) */
          let want = plain;
          if (al && al > plain) {
            let room = 0; for (let q = port; q <= cap; q++) if (!live.has(q)) room++;
            const after = nu.slice(ni + 1).reduce((a, x) => a + Math.min(x.size, (M.get(x) || { n: 0 }).n), 0);
            if (room >= al + after) want = al;
          }
          for (let q = port; q <= cap && got.length < want; q++) if (!live.has(q)) got.push(q);
          if (got.length) port = got[got.length - 1] + 1;
          if (got.length < want) {
            /* the lowest run of vacant ports on the existing cables' windows; the existing fibers there are no longer on the FDU */
            const k = want - got.length, vac = [];
            T.forEach(t => { if (t.c.status === 'existing') t.ports.forEach(q => { if (!live.has(q)) vac.push(q); }); });
            vac.sort((x, y) => x - y);
            let pick = null;
            for (let i = 0; i + k - 1 < vac.length && !pick; i++) if (vac[i + k - 1] - vac[i] === k - 1) pick = vac.slice(i, i + k);
            if (!pick) pick = vac.slice(0, k);
            pick.forEach(q => { const t = T.find(x => x.c.status === 'existing' && x.ports.indexOf(q) >= 0), i = t.ports.indexOf(q); t.ports.splice(i, 1); t.fibers.splice(i, 1); got.push(q); });
            if (got.length < want) warn.push(label(p.id) + ': its FDU has only ' + got.length + ' vacant port' + (got.length === 1 ? '' : 's') + ' for ' + cdesc(c) + ', which needs ' + want + '.');
          }
          got.sort((x, y) => x - y); T.push({ c, ports: got, fibers: seq(1, got.length) });
        });
        T.forEach(t => { const on = new Set(t.fibers); for (let f = 1; f <= t.c.size; f++) if (!on.has(f)) t.c.avoid.add(f); });
      } else {
        /* a dummy NAP is the end of the job: it terminates only the cable its legs come in on; a cable that goes on beyond it is not spliced here */
        const order = adj.get(p.id).map(e => e.c).filter(c => p.type !== 'dnap' || (M.size ? M.has(c) : !c.onward)).sort((x, y) => (first(x) - first(y)) || x.k - y.k);
        const split = p.split === 'need' || p.split === 'half' ? p.split : rules.split, need = order.length > 1 && split === 'need';
        let port = 1;
        const halves = need ? null : halfParts(order, cap), plainOf = x => Math.min((M.get(x) || { n: 0 }).n, x.size - t0 + 1);
        order.forEach((c, i) => {
          let want = need ? (M.get(c) || { n: 0 }).n : halves ? halves[i] : Math.floor(cap / order.length) + (i < cap % order.length ? 1 : 0);
          if (need) {
            /* only what each leg uses, lined up with the buffers when the FDU has the room for it and for the cables after it */
            const al = packNeed(c, t0, (M.get(c) || { ns: [] }).ns), after = order.slice(i + 1).reduce((a, x) => a + plainOf(x), 0);
            if (al && al > want && port - 1 + al + after <= cap) want = al;
          }
          const n = Math.max(0, Math.min(want, cap - port + 1, c.size - t0 + 1)), fibers = seq(t0, n);
          for (let f = 1; f <= c.size; f++) if (f < t0 || f >= t0 + n) c.avoid.add(f);
          T.push({ c, ports: seq(port, n), fibers }); port += n;
        });
        term.set(p.id, { T, split: order.length > 1 ? split : '' });
      }
      if (ex) term.set(p.id, { T, split: '' });
      /* a window narrower than the cable: the FDU, not the cable, limits what can be used */
      T.forEach(t => { if (t.fibers.length < t.c.size) t.c.win.push({ id: p.id, cap, n: t.fibers.length, fib: t.fibers.slice() }); });
      /* the live ports before the work: their fibers are in use on the existing cable that holds them; not sure yet: noted on its cables */
      live.forEach(q => { const t = T.find(x => x.c.status === 'existing' && x.ports.indexOf(q) >= 0); if (t) { const f = t.fibers[t.ports.indexOf(q)]; t.c.taken.add(f); t.c.liveTubes.add(Math.ceil(f / t.c.fpt)); } });
      if (tbc) T.forEach(t => t.c.tbcAt.add(p.id)); /* its fibers (an existing cable) or its ports (a new cable) assume nothing is live there */
    });
    /* the pieces of one physical existing cable, cut at closures: a fiber live at either end is live along the whole cable */
    const phys = [];
    cables.forEach(c => { if (c.status !== 'existing') return; const g = phys.find(x => samePhys(x[0], c)); if (g) g.push(c); else phys.push([c]); });
    const physOf = c => phys.find(g => g.indexOf(c) >= 0) || [c];
    phys.forEach(g => {
      if (g.length < 2) return;
      const tk = new Set(), lt = new Set(), tb = new Set();
      g.forEach(c => { c.taken.forEach(f => tk.add(f)); c.liveTubes.forEach(t => lt.add(t)); c.tbcAt.forEach(id => tb.add(id)); });
      g.forEach(c => { tk.forEach(f => { if (f <= c.size) c.taken.add(f); }); lt.forEach(t => c.liveTubes.add(t)); tb.forEach(id => c.tbcAt.add(id)); });
    });

    /* the fibers: a hand-moved run (fix) first, where it is free; then every leg takes, on each cable, buffer first (the cable's fpt fibers per buffer):
       1. n <= fpt: the lowest run of n free fibers in a row inside ONE buffer; 2. n > fpt: the lowest run of n free fibers in a row from a buffer's first fiber;
       3. n <= fpt: n free fibers inside one buffer, not in a row (said in a warning); 4. last: the lowest n free fibers in a row across buffers
       (said, naming the buffers); then anything free. rules.tube 'fresh' tries 1-2 inside buffers with no live fiber first. */
    const tubeOf = (c, f) => Math.ceil(f / c.fpt), free = (c, f) => !c.taken.has(f) && !c.avoid.has(f);
    const bufName = t => FIBER[(t - 1) % 12].name.toLowerCase() + (t > 12 ? ' ' + t : '');
    const bufWords = (c, r) => { const ts = [...new Set(r.map(f => tubeOf(c, f)))].sort((x, y) => x - y).map(bufName); return 'the ' + (ts.length < 2 ? ts[0] + ' buffer' : ts.slice(0, -1).join(', ') + ' and ' + ts[ts.length - 1] + ' buffers'); };
    const rowOk = (c, s, n, ok) => { if (s < 1 || s + n - 1 > c.size) return false; for (let f = s; f < s + n; f++) if (!ok(f)) return false; return true; };
    const grab = (c, r, leg) => { r.forEach(f => { c.taken.add(f); if (leg) c.owner.set(f, leg); }); return r; };
    const freeCount = c => { let k = 0; for (let f = 1; f <= c.size; f++) if (free(c, f)) k++; return k; };
    /* not enough fibers: say whether the FDU's window or the cable itself is the limit */
    const shortWhy = (c, n, k) => {
      let all = 0; for (let f = 1; f <= c.size; f++) if (!c.taken.has(f)) all++;
      const w = all >= n && c.win.length ? c.win.slice().sort((x, y) => x.n - y.n)[0] : null;
      return { fdu: w, text: w ? 'the ' + w.cap + '-port FDU at ' + label(w.id) + ' ends only ' + w.n + ' fibers of ' + cdesc(c) + ', so only ' + k + ' of the ' + n + ' fibers are free.'
        : cwho(c) + ' has only ' + k + ' of the ' + n + ' fibers free.' };
    };
    /* rules 1-2: a run of n free fibers in a row inside one buffer (n <= fpt), or starting at a buffer's first fiber (n > fpt) */
    const inBuffer = (c, n, ok) => {
      if (n <= c.fpt) { for (let s = 1; s + n - 1 <= c.size; s++) if (tubeOf(c, s) === tubeOf(c, s + n - 1) && rowOk(c, s, n, ok)) return seq(s, n); }
      else for (let s = 1; s + n - 1 <= c.size; s += c.fpt) if (rowOk(c, s, n, ok)) return seq(s, n);
      return null;
    };
    /* rule 3: n free fibers inside one buffer, not in a row */
    const inOneBuffer = (c, n, ok) => {
      if (n > c.fpt) return null;
      for (let f0 = 1; f0 <= c.size; f0 += c.fpt) { const r = []; for (let f = f0; f < f0 + c.fpt && f <= c.size && r.length < n; f++) if (ok(f)) r.push(f); if (r.length === n) return r; }
      return null;
    };
    /* the FDU's ports, not the cable, are why no buffer fits: the cable has such a run, but part of it is not terminated on the FDU */
    const winWhy = (c, n) => {
      if (!c.win.length) return '';
      const r = inBuffer(c, n, f => !c.taken.has(f)); if (!r) return '';
      const w = c.win.find(x => r.some(f => x.fib.indexOf(f) < 0)) || c.win[0];
      return 'the ' + w.cap + '-port FDU at ' + label(w.id) + ' ends only ' + fmtRanges(w.fib, 'F') + ' of ' + cdesc(c);
    };
    const takeBlock = (c, n, leg) => {
      const any = f => free(c, f); let r;
      if (rules.tube === 'fresh' && c.liveTubes.size) {
        const fresh = f => free(c, f) && !c.liveTubes.has(tubeOf(c, f));
        if ((r = inBuffer(c, n, fresh))) return grab(c, r, leg);
        if ((r = inBuffer(c, n, any))) { say(leg, cwho(c) + ' has no unused buffer with ' + n + ' free fibers, so ' + fmtRanges(r, 'F') + ' opens ' + bufWords(c, r) + ', which has live fibers.'); return grab(c, r, leg); }
      } else if ((r = inBuffer(c, n, any))) return grab(c, r, leg);
      const ww = winWhy(c, n);
      if ((r = inOneBuffer(c, n, any))) { say(leg, (ww || 'no buffer of ' + cdesc(c) + ' has ' + n + ' free fibers in a row') + ', so ' + fmtRanges(r, 'F') + ' are taken from ' + bufWords(c, r) + ', not in a row.'); return grab(c, r, leg); }
      for (let s = 1; s + n - 1 <= c.size; s++) if (rowOk(c, s, n, any)) {
        r = seq(s, n);
        say(leg, (ww || (n <= c.fpt ? 'no buffer of ' + cdesc(c) + ' has ' + n + ' free fibers' : 'no ' + n + ' free fibers in a row start at a buffer of ' + cdesc(c))) + ', so ' + fmtRanges(r, 'F') + ' uses ' + bufWords(c, r) + '.');
        return grab(c, r, leg);
      }
      r = []; for (let f = 1; f <= c.size && r.length < n; f++) if (free(c, f)) r.push(f);
      const sh = r.length < n ? shortWhy(c, n, r.length) : null;
      say(leg, sh ? sh.text : (ww ? ww + ', so it uses ' : cwho(c) + ' has no ' + n + ' free fibers in a row; it uses ') + fmtRanges(r, 'F') + ' in ' + bufWords(c, r) + ', not in a row.');
      if (sh) r.lim = sh.fdu;
      return grab(c, r, leg);
    };
    /* a fixed run: a number is a run moved by hand (its first fiber); a range ('F7-12') is a run locked when the drawing was issued (exported) */
    const fixAt = (leg, c) => {
      const fx = leg.L.fix; if (!fx || typeof fx !== 'object') return null;
      let v = fx[c.key]; if ((v == null || v === '') && c.named) v = fx[c.name]; if (v == null || v === '') return null;
      if (typeof v === 'number') return v >= 1 ? { start: Math.round(v), hand: true } : null;
      const list = parseRanges(v).filter(f => f >= 1); if (!list.length) return null;
      return /[-,]/.test(String(v)) ? { start: list[0], list, hand: false } : { start: list[0], hand: true };
    };
    /* fibers that are free on the cable but not terminated on an FDU at its end (a smaller FDU, a narrower window): past that FDU, not taken */
    const pastWin = (c, fs) => { if (!fs.length || fs.some(f => c.taken.has(f))) return ''; const w = c.win.find(x => fs.some(f => x.fib.indexOf(f) < 0)); return w ? 'past the ' + w.cap + '-port FDU at ' + label(w.id) + ' (it ends only ' + fmtRanges(w.fib, 'F') + ')' : ''; };
    const owner = (c, r) => { const ls = []; r.forEach(f => { const o = c.owner.get(f); if (o && ls.indexOf(o) < 0) ls.push(o); }); return ls.length ? ' (' + ls.map(o => 'Leg ' + (o.li + 1)).join(', ') + ')' : ''; };
    /* first every fixed run holds its own fibers (a locked run at the size it was issued, a hand-moved run its first fiber), so a leg that grows
       never pushes another leg off fibers already issued to it; then each grows to its size where the next fibers are free, or is moved */
    routed.forEach(leg => leg.path.forEach(s => {
      const fx = fixAt(leg, s.c); if (!fx) return;
      const want = seq(fx.start, leg.n), core = fx.list ? fx.list.slice(0, leg.n) : [fx.start];
      if (fx.start + (fx.list ? 0 : leg.n - 1) > s.c.size || core.some(f => f > s.c.size)) { say(leg, fmtRanges(want, 'F') + ' on ' + cdesc(s.c) + ' runs past the end of the cable, so the app chose other fibers.'); return; }
      if (!core.every(f => free(s.c, f))) { const pw = pastWin(s.c, core.filter(f => !free(s.c, f))); say(leg, fmtRanges(fx.list ? core : want, 'F') + ' on ' + cdesc(s.c) + (fx.hand ? '' : ' (locked at export)') + (pw ? ' is ' + pw : ' is not free' + owner(s.c, core)) + ', so the app chose other fibers.'); return; }
      s.fx = fx; s.free = freeCount(s.c); s.f = grab(s.c, core, leg);
    }));
    routed.forEach(leg => leg.path.forEach(s => {
      if (!s.fx) return;
      const need = leg.n - s.f.length, next = need > 0 ? seq(Math.max.apply(null, s.f) + 1, need) : [];
      if (next.every(f => f <= s.c.size && free(s.c, f))) { s.f = s.f.concat(grab(s.c, next, leg)); s.fixed = true; s.locked = !s.fx.hand; }
      else {
        const was = s.fx.hand ? seq(s.fx.start, leg.n) : s.f.slice(), by = owner(s.c, next.filter(f => f <= s.c.size));
        s.f.forEach(f => { s.c.taken.delete(f); s.c.owner.delete(f); }); s.f = null; s.moved = was;
        const pw = next.some(f => f > s.c.size) ? '' : pastWin(s.c, next.filter(f => !free(s.c, f)));
        s.why = s.fx.hand ? fmtRanges(was, 'F') + ' on ' + cdesc(s.c) + ' is ' + (pw || 'not free' + by) + ', so the app chose other fibers.'
          : 'it now has ' + leg.n + ' fibers, but ' + fmtRanges(next, 'F') + ' next to its locked ' + fmtRanges(was, 'F') + ' on ' + cdesc(s.c) + (next.some(f => f > s.c.size) ? ' run past the end of the cable' : pw ? ' are ' + pw : ' are taken' + by) + ', so the app moved this leg';
      }
    }));
    routed.forEach(leg => leg.path.forEach(s => {
      if (s.f) return;
      s.free = freeCount(s.c); s.f = takeBlock(s.c, leg.n, leg); s.lim = s.f.lim || null;
      if (s.why) say(leg, s.fx.hand ? s.why : s.why + ' to ' + (fmtRanges(s.f, 'F') || 'no fibers') + '.');
    }));
    routed.forEach(leg => leg.path.forEach(s => { if (s.fixed && rules.tube === 'fresh' && s.f.some(f => s.c.liveTubes.has(tubeOf(s.c, f)))) say(leg, fmtRanges(s.f, 'F') + ' on ' + cdesc(s.c) + ' opens a buffer with live fibers.'); }));

    const nodeSp = new Map(), ends = new Map(), paths = [], push = (M, k, v) => { if (!M.has(k)) M.set(k, []); M.get(k).push(v); };
    routed.forEach(leg => {
      const segs = leg.path, li = leg.li, st = leg.state, id = leg.id, z = segs.length - 1;
      segs.forEach(s => s.c.links.push({ li, f: s.f, st, id }));
      for (let i = 0; i < z; i++) push(nodeSp, segs[i].to, { a: { c: segs[i].c, f: segs[i].f }, b: { c: segs[i + 1].c, f: segs[i + 1].f }, li, st, id, leg });
      push(ends, leg.a, { c: segs[0].c, f: segs[0].f, li, other: leg.b, st, id }); push(ends, leg.b, { c: segs[z].c, f: segs[z].f, li, other: leg.a, st, id });
      paths.push({ li, a: leg.a, b: leg.b, n: leg.n, segs, st, id });
    });
    /* a dummy NAP is the end of the job (the owner, 16 Nov): the cables that go on from it with no leg on them are not spliced in this work,
       and what they reach (a site, an ODF, the end of the map) is drawn plainly, by its name, not as a homing. A new cable no leg uses is not
       spliced either (spare: NOT SPLICED · FOR FUTURE), once the work has a leg. */
    const legPts = new Set(), beyond = new Set(), onward = new Set();
    routed.forEach(leg => leg.path.forEach(s => { legPts.add(s.from); legPts.add(s.to); }));
    legs.forEach(leg => { if (leg.state === 'future' && !leg.bad) { legPts.add(leg.a); legPts.add(leg.b); } });
    /* (before the work has a leg, the cables the model marks as going on from a dummy NAP, c.onward, and what they reach) */
    pts.forEach(d => {
      if (d.type !== 'dnap') return; const led = (ends.get(d.id) || []).length;
      if (!led && !adj.get(d.id).some(e => e.c.onward)) return;
      const q = [d.id];
      while (q.length) { const u = q.shift(); adj.get(u).forEach(e => { if (e.c.links.length || onward.has(e.c) || (!led && !e.c.onward)) return; onward.add(e.c); if (e.o !== d.id && !legPts.has(e.o) && !beyond.has(e.o) && typ(e.o) !== 'dnap') { beyond.add(e.o); q.push(e.o); } }); }
    });
    const spare = new Set(routed.length ? cables.filter(c => c.status !== 'existing' && !c.links.length) : [...onward].filter(c => c.status !== 'existing'));

    /* future legs: a second cable into the new FDU, later. It takes no fibers or ports; the new FDU lists it as xx-xx (<its cable>-LX) */
    const futures = [];
    legs.forEach(leg => {
      if (leg.state !== 'future' || leg.bad) return;
      const from = isNew(leg.a) || !isNew(leg.b) ? leg.a : leg.b, to = from === leg.a ? leg.b : leg.a;
      let name = '';
      if (rules.future === 'cable') {
        if (leg.L.cable) name = String(leg.L.cable);
        else {
          const inc = adj.get(from).map(e => e.c), base = inc.filter(c => c.status !== 'existing' && c.named)[0] || inc.filter(c => c.named)[0];
          name = base ? stem(base.name) + '-LX' : 'TBF';
          if (base) { const n0 = name; let k = 2; while (futures.some(x => x.name === name)) name = n0 + k++; }
        }
      }
      leg.future = { from, to, name }; futures.push({ id: leg.id, li: leg.li, from, to, name, n: leg.n });
    });

    /* each end's FDU block: an existing one as it was before the work; a new one with its windows */
    const sites = new Map();
    pts.forEach(p => {
      if (!isEnd(p.id)) return;
      const W = term.get(p.id) || { T: [], split: '' }, T = W.T, E = ends.get(p.id) || [], cap = capOf(p);
      const portOf = (c, f) => { const t = T.find(x => x.c === c), i = t ? t.fibers.indexOf(f) : -1; return i >= 0 ? t.ports[i] : null; };
      const es = E.map(e => Object.assign({}, e, { ports: e.f.map(f => portOf(e.c, f)) }));
      const portsOf = st => es.filter(e => e.st === st).reduce((a, e) => a.concat(e.ports.filter(x => x != null)), []).sort((x, y) => x - y);
      const working = portsOf('tested'), reserved = portsOf('spliced');
      if (p.status === 'existing') {
        const tbc = isTbc(p.active), before = tbc ? [] : parseRanges(p.active).filter(q => q <= cap), after = new Set(before.concat(working, reserved));
        sites.set(p.id, { cap, existing: true, tbc, before, active: before, vacant: tbc ? [] : seq(1, cap).filter(q => before.indexOf(q) < 0), spare: seq(1, cap).filter(q => !after.has(q)), term: T, split: '', working, reserved, ends: es, future: [] });
        /* only where this work cuts or ends: a leg ends here, or a leg uses the physical cable that ends here */
        const asks = E.length > 0 || adj.get(p.id).some(e => e.c.status === 'existing' && physOf(e.c).some(x => x.links.length));
        sites.get(p.id).asks = asks;
        if (tbc && asks) warn.push(label(p.id) + ': its live ports are not confirmed yet. Check them on site before cutting.');
      } else sites.set(p.id, { cap, existing: false, term: T, split: W.split, termPorts: T.reduce((a, t) => a.concat(t.ports), []), working, reserved, ends: es, future: futures.filter(x => x.from === p.id || x.to === p.id).map(x => x.name) });
    });
    const futEnd = new Set(); futures.forEach(x => { futEnd.add(x.from); futEnd.add(x.to); });
    pts.forEach(p => { if (!adj.get(p.id).length && !futEnd.has(p.id)) warn.push(label(p.id) + ' has no cable yet.'); });
    if (stage === 'built') legs.forEach(leg => {
      const t = leg.test || {}; if (leg.state === 'tested' && leg.path && !t.date && (t.loss == null || t.loss === '')) say(leg, 'add its test date and loss for the As-Built (Mark tested).');
      if (leg.state === 'tbc' && leg.path) say(leg, 'its test status is to be confirmed: tested end to end now, or spliced only.');
    });

    const P = { m, warn, rules, stage, pts, byId, label, cables, adj, paths, nodeSp, ends, sites, fpt, futures, beyond, onward, spare };
    /* for a page: the legs, the closures, the FDUs and the cables in plain data */
    P.legs = legs.map(leg => {
      const path = leg.path || [], w = legWords(leg, stage), via = path.slice(0, -1).map(s => s.to);
      const ports = id => { const s = sites.get(id); return s ? s.ends.filter(e => e.li === leg.li).reduce((a, e) => a.concat(e.ports.filter(x => x != null)), []).sort((x, y) => x - y) : []; };
      const pA = ports(leg.a), pB = ports(leg.b);
      const fibers = path.map(s => {
        const ok = s.f.length >= leg.n, r = fmtRanges(s.f, 'F'), tb = [...s.c.tbcAt], lim = !ok && s.lim ? s.lim : null;
        return { cable: s.c.name, key: s.c.key, desc: cdesc(s.c), from: s.f.length ? Math.min.apply(null, s.f) : null, to: s.f.length ? Math.max.apply(null, s.f) : null, list: s.f.slice(), text: r, ends: [s.from, s.to],
          existing: s.c.status === 'existing', fpt: s.c.fpt, buffers: [...new Set(s.f.map(f => tubeOf(s.c, f)))].sort((x, y) => x - y), fixed: !!s.fixed, locked: !!s.locked, hand: !!(s.fixed && s.fx && s.fx.hand), moved: s.moved ? fmtRanges(s.moved, 'F') : '', free: s.free, ok,
          tbc: tb, tbcNames: tb.map(label), limit: lim ? { id: lim.id, name: label(lim.id), cap: lim.cap, n: lim.n } : null,
          say: ok ? (tb.length ? 'Not confirmed: ' + r + ' assumes nothing is live at ' + tb.map(label).join(' and ') : 'Enough free fibers: ' + r)
            : lim ? 'Not enough free fibers: the ' + lim.cap + '-port FDU at ' + label(lim.id) + ' ends only ' + lim.n + ' fibers of ' + cdesc(s.c) : 'Not enough free fibers on ' + cdesc(s.c) + ': only ' + s.free + ' free' };
      });
      const live = !leg.bad && leg.state !== 'future' && !!leg.path, short = live && fibers.some(f => !f.ok) ? { have: Math.min.apply(null, fibers.map(f => f.list.length)), need: leg.n } : null;
      const confirm = []; fibers.forEach(f => f.tbcNames.forEach(x => { if (confirm.indexOf(x) < 0) confirm.push(x); }));
      const status = (leg.state === 'future' ? w[0] + (w[1] ? ' · ' + w[1] : '') : w[0] + (w[1] ? ' · ' + w[1] : '') + (short ? ' · NOT ENOUGH FREE FIBERS (' + short.have + ' OF ' + short.need + ')' : '') + (confirm.length ? ' · LIVE PORTS TBC' : ''));
      return { short, confirm, status, id: leg.id, index: leg.li, label: 'LEG ' + (leg.li + 1), a: leg.a, b: leg.b, aName: label(leg.a), bName: label(leg.b), n: leg.n, state: leg.state, look: lookOf(leg.state, stage),
        home: leg.future ? leg.future.to : isNew(leg.b) && !isNew(leg.a) ? leg.a : leg.b, routed: !!leg.path, bad: !!leg.bad, ok: !leg.bad && (leg.state === 'future' || !!leg.path && fibers.every(f => f.ok)),
        fibers, portA: fmtRanges(pA), portB: fmtRanges(pB), portsA: pA, portsB: pB, via, viaNames: via.map(label), words: w[0] + (w[1] ? ' · ' + w[1] : ''), tag: w,
        test: leg.test, futureCable: leg.future ? leg.future.name : null, warnings: leg.warn.slice() };
    });
    P.closures = pts.filter(p => p.type === 'closure').map(p => ({
      id: p.id, name: label(p.id), status: p.status === 'existing' ? 'existing' : 'new', coords: String(p.coords || '').trim(), kind: adj.get(p.id).length ? spliceKind(P, p.id) : '',
      splices: (nodeSp.get(p.id) || []).map(s => ({ leg: s.id, state: s.st, a: { cable: s.a.c.name, fibers: fmtRanges(s.a.f, 'F') }, b: { cable: s.b.c.name, fibers: fmtRanges(s.b.f, 'F') },
        words: (fmtRanges(s.a.f, 'F') || 'no fibers') + ' of ' + s.a.c.name + ' → ' + (fmtRanges(s.b.f, 'F') || 'no fibers') + ' of ' + s.b.c.name + ', toward ' + up(label(s.leg.b)) })),
      through: passThrough(P, p.id).map(x => ({ cables: [x.A.name, x.B.name], fibers: x.fibers, text: fmtRanges(x.fibers, 'F') }))
    }));
    P.fdus = pts.filter(p => isEnd(p.id)).map(p => {
      const s = sites.get(p.id);
      return { id: p.id, name: label(p.id), type: p.type, existing: s.existing, cap: s.cap, tbc: !!s.tbc, asks: !!s.asks, active: s.existing ? s.before.slice() : [], split: s.split, future: s.future.slice(), beyond: beyond.has(p.id),
        windows: s.term.map(t => ({ cable: t.c.name, key: t.c.key, ports: t.ports.slice(), fibers: t.fibers.slice() })),
        legs: s.ends.map(e => ({ leg: e.id, state: e.st, cable: e.c.name, key: e.c.key, ports: e.ports.filter(x => x != null), fibers: e.f.slice() })) };
    });
    P.cableInfo = cables.map(c => ({ key: c.key, name: c.name, named: c.named, from: c.from, to: c.to, size: c.size, fpt: c.fpt, status: c.status, fid: hasFid(c) ? String(c.fid) : '',
      live: c.live.slice(), liveAtFdu: [...c.taken].filter(f => c.live.indexOf(f) < 0 && !c.links.some(l => l.f.indexOf(f) >= 0)).sort((x, y) => x - y),
      outside: [...c.avoid].sort((x, y) => x - y), legs: c.links.map(l => ({ leg: l.id, state: l.st, fibers: l.f.slice() })), free: freeCount(c), spare: spare.has(c), onward: onward.has(c) }));
    P.warnings = [...new Set(warn)];
    return P;
  }
  /* the fibers a cable uses at a point: its side of the splices there, or its link ends */
  function fibersAt(P, id, c) {
    const out = []; (P.nodeSp.get(id) || []).forEach(s => { if (s.a.c === c) out.push(...s.a.f); if (s.b.c === c) out.push(...s.b.f); });
    (P.ends.get(id) || []).forEach(e => { if (e.c === c) out.push(...e.f); }); return out;
  }
  /* a cable's fibers at a closure, one group per direction (the leg's end beyond the closure) and per look */
  function labelsAt(P, id, c) {
    const L = [], out = [];
    (P.nodeSp.get(id) || []).forEach(s => { if (s.a.c === c) L.push({ f: s.a.f, dir: s.leg.b, st: s.st, id: s.id }); if (s.b.c === c) L.push({ f: s.b.f, dir: s.leg.a, st: s.st, id: s.id }); });
    (P.ends.get(id) || []).forEach(e => { if (e.c === c) L.push({ f: e.f, dir: e.other, st: e.st, id: e.id }); });
    L.forEach(x => { const lk = lookOf(x.st, P.stage), g = out.find(y => y.dir === x.dir && y.look === lk); if (g) g.f = g.f.concat(x.f); else out.push({ f: x.f.slice(), dir: x.dir, look: lk, id: x.id }); });
    return out.sort((x, y) => Math.min.apply(null, x.f) - Math.min.apply(null, y.f));
  }
  /* pieces of one physical existing cable at a closure: the fibers not cut there pass straight through */
  function passThrough(P, id) {
    const inc = (P.adj.get(id) || []).map(e => e.c), out = [], used = new Set();
    if ((P.byId.get(id) || {}).type !== 'closure') return out;
    for (let i = 0; i < inc.length; i++) for (let j = i + 1; j < inc.length; j++) {
      const A = inc[i], B = inc[j]; if (used.has(A) || used.has(B) || !samePhys(A, B)) continue;
      used.add(A); used.add(B); const cut = new Set(fibersAt(P, id, A).concat(fibersAt(P, id, B)));
      out.push({ A, B, fibers: seq(1, A.size).filter(f => !cut.has(f)) });
    }
    return out;
  }
  const spliceKind = (P, id) => { const cs = new Set(); (P.nodeSp.get(id) || []).forEach(s => { cs.add(s.a.c); cs.add(s.b.c); }); return Math.max(cs.size, P.adj.get(id).length) > 2 ? 'BRANCH SPLICING' : 'STRAIGHT SPLICING'; };
  function siteLines(P, p) {
    const s = P.sites.get(p.id); if (!s) return [];
    const L = [p.type === 'dnap' ? (p.fdu || p.name || 'DUMMY NAP') + ' (DUMMY NAP)' : (p.fdu || ((p.code || p.name || 'SITE') + '_FDU_001')), 'Capacity: ' + s.cap + ' Ports'];
    /* an existing FDU as it was before the work; the new legs show in the fiber labels, the leg tags and the CONNECTIONS box */
    if (s.existing) { L.push('Active: ' + (s.tbc ? 'TO BE CONFIRMED' : fmtRanges(s.active) || 'none')); L.push('Vacant: ' + (s.tbc ? 'TO BE CONFIRMED' : fmtRanges(s.vacant) || 'none')); }
    else {
      L.push('Terminated Ports: ' + (fmtRanges(s.termPorts) || 'none')); L.push('Terminated Fibers:');
      s.term.forEach(t => L.push('     ' + (fmtRanges(t.fibers) || '-') + ' (' + t.c.name + ')'));
      s.future.forEach(nm => L.push('     xx-xx' + (nm ? ' (' + nm + ')' : '')));
    }
    return L;
  }
  /* a box around a rotated label (its middle at x, y) */
  function rotBox(G, cx, cy, w, h, a, lay) {
    const r = a * Math.PI / 180, ex = Math.cos(r), ey = Math.sin(r), nx = -ey, ny = ex, P = (u, v) => [cx + ex * u + nx * v, cy + ey * u + ny * v];
    G.pl([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], lay, { close: true });
  }
  /* a leg's tag at its homing end (As-Built): a solid outline when tested, dashed when spliced only; returns its height */
  function tagBox(G, x, y, l, down) {
    const h = 1.6, gap = 1.5, L = [l.tag[0]].concat(l.tag[1] ? [l.tag[1]] : []), w = Math.max.apply(null, L.map(s => textW(s, h, true))) + 2.6, H = (L.length - 1) * h * gap + h + 2.4, y0 = down ? y - H : y, pr = G.ref;
    G.ref = 'leg:' + l.id;
    G.frect(x - w / 2, y0, w, H, 'HILITE', { col: WHITE }); G.rect(x - w / 2, y0, w, H, l.look === 'spliced' ? 'FIBER_RESERVED' : 'FIBER_USED', { lw: 0.3 });
    G.txs(x, y0 + H - 1.2 - h, L, h, 'FIBER_USED', { al: 'c', bold: true, gap });
    G.ref = pr; return H;
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
  /* ---------- room for every word: what a primitive covers, and what meets what ---------- */
  /* a text's box as four corners (primBox's box); sh shrinks it on every side (mm); core: its capitals only, inside its ends (a line through
     the core crosses the words) */
  function txQuad(p, sh, core) {
    const w = textW(p.s, p.h, p.bold), r = p.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), a = p.al === 'c' ? -w / 2 : p.al === 'r' ? -w : 0, d = sh || 0;
    const u0 = core ? a + Math.min(0.25, w / 5) : a + d, u1 = core ? a + w - Math.min(0.25, w / 5) : a + w - d, v0 = core ? 0.1 * p.h : -0.25 * p.h + d, v1 = core ? 0.9 * p.h : 1.05 * p.h - d;
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(q => [p.p[0] + q[0] * c - q[1] * s, p.p[1] + q[0] * s + q[1] * c]);
  }
  const bbOf = Q => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of Q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return [x0, y0, x1, y1]; };
  /* two convex shapes (a segment is one) overlap by more than a touch: no axis separates them */
  function overlaps(A, B) {
    for (const S of [A, B]) for (let i = 0; i < S.length; i++) {
      const p = S[i], q = S[(i + 1) % S.length], nx = q[1] - p[1], ny = p[0] - q[0], L = Math.hypot(nx, ny); if (L < 1e-9) continue;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const t = (v[0] * nx + v[1] * ny) / L; if (t < a0) a0 = t; if (t > a1) a1 = t; }
      for (const v of B) { const t = (v[0] * nx + v[1] * ny) / L; if (t < b0) b0 = t; if (t > b1) b1 = t; }
      if (a1 + 0.25 <= b0 || b1 + 0.25 <= a0) return false; /* (closer than a quarter of a millimetre counts as meeting) */
    }
    return true;
  }
  /* what meets what: a text over a text, a text over a symbol or a box that is not its own (pt: a symbol and its words), a line through a
     text's letters, two symbols over each other. A white background (HILITE) does not count; a line meeting a symbol ends there. */
  /* outline: a closed shape counts as its outline (the detailed drawing: words sit inside its boxes and ellipses), a fill as a background */
  function clashItems(prims, outline) {
    const items = [];
    prims.forEach(p => {
      if (p.k === 'tx') { if (!String(p.s).trim()) return; const Q = txQuad(p, 0.06); items.push({ t: 2, P: Q, b: bbOf(Q), C: txQuad(p, 0, true), p }); }
      else if (p.k === 'ci' || (!outline && (p.k === 'fl' || (p.k === 'pl' && p.close)))) {
        if (p.lay === 'HILITE') return;
        const Q = p.k === 'ci' ? [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r], [p.c[0] - p.r, p.c[1] + p.r]] : p.pts; items.push({ t: 1, P: Q, b: bbOf(Q), p });
      } else if (p.k === 'pl') { const Q = p.close ? p.pts.concat([p.pts[0]]) : p.pts; for (let j = 1; j < Q.length; j++) { const S = [Q[j - 1], Q[j]]; items.push({ t: 0, P: S, b: bbOf(S), p }); } }
    });
    return items;
  }
  /* the rule for two items: [lower, higher] when they meet, else null */
  function clashOf(a, b) {
    if (b.b[0] >= a.b[2] + 0.25 || b.b[2] + 0.25 <= a.b[0] || b.b[1] >= a.b[3] + 0.25 || b.b[3] + 0.25 <= a.b[1] || a.p === b.p || (!a.t && !b.t)) return null; /* (the same quarter millimetre as overlaps) */
    const lo = a.t <= b.t ? a : b, hi = lo === a ? b : a;
    if (lo.t === 0 && hi.t === 1) return null;
    if (lo.t === 1 && lo.p.pt && lo.p.pt === hi.p.pt) return null;
    return (lo.t === 0 ? overlaps(lo.P, hi.C) : overlaps(lo.P, hi.P)) ? [lo, hi] : null;
  }
  function clashes(prims, outline) {
    const items = clashItems(prims, outline).sort((a, b) => a.b[0] - b.b[0]), out = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length && items[j].b[0] < items[i].b[2] + 0.25; j++) { const c = clashOf(items[i], items[j]); if (c) out.push({ a: c[0], b: c[1] }); }
    return out;
  }
  /* words put where they meet nothing drawn yet: put(cands, set) draws each candidate (a function of a scratch Gfx that has set's ref, ow, u)
     and keeps the first that meets nothing, else the one that meets least (a meeting with words of the same owner counts most: moving the
     points apart cannot undo it). What is drawn is kept in a grid of 8 mm cells, so a look is quick. */
  function placer(G, outline) {
    const cells = new Map(), C = 8, key = (i, j) => i + ',' + j;
    const add = Q => clashItems(Q, outline).forEach(it => { for (let i = Math.floor(it.b[0] / C); i <= Math.floor(it.b[2] / C); i++) for (let j = Math.floor(it.b[1] / C); j <= Math.floor(it.b[3] / C); j++) { const k = key(i, j); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(it); } });
    const meets = Q => {
      let n = 0; const seen = new Set();
      clashItems(Q, outline).forEach(c => { seen.clear(); for (let i = Math.floor(c.b[0] / C); i <= Math.floor(c.b[2] / C); i++) for (let j = Math.floor(c.b[1] / C); j <= Math.floor(c.b[3] / C); j++) (cells.get(key(i, j)) || []).forEach(o => { if (seen.has(o)) return; seen.add(o); if (clashOf(c, o)) n += c.p.ow && c.p.ow === o.p.ow ? 100 : 1; }); });
      return n;
    };
    add(G.p);
    return {
      put: (cands, set) => {
        let pick = null, best = Infinity;
        for (const f of cands) { const T = new Gfx(); Object.assign(T, set); f(T); const k = meets(T.p); if (k < best) { best = k; pick = T.p; } if (!k) break; }
        if (pick) { G.p.push(...pick); add(pick); }
        return pick;
      }
    };
  }
  /* coordinates as "lat, lon" with 6 decimals (the owner); anything else as it came */
  const coordTxt = v => { const s = String(v == null ? '' : v).trim(), m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s); return m ? (+m[1]).toFixed(6) + ', ' + (+m[2]).toFixed(6) : s; };

  /* the single line diagram. The main route (trunk) runs left to right; what hangs off it hangs below, each point's children in a row under
     it. Every word has a place of its own: a closure's words above it (on the trunk) or above at its right (off it), a site's name and FDU
     block beside, above or below it, a cable's words under it (beside an upright one), its fibers at a closure over its end. Two or more
     cables between the same two points run side by side, each with its own words. The drawing is laid out, then every word is checked
     against every other word, symbol and line; where two meet, the points move apart (a trunk gap grows, a branch hangs lower or further
     right) and it is drawn again, until nothing meets. P.sldClash: what still meets (0). */
  function accessSLD(P) {
    const T = trunkOf(P);
    if (!T.length) { const G = new Gfx(); G.tx(0, 0, 'ADD THE POINTS AND THE CABLES TO DRAW THE SINGLE LINE DIAGRAM.', 3, 'NOTE'); return block(G); }
    const n = T.length, col = new Map(), par = new Map(), kids = new Map();
    T.forEach((id, i) => { col.set(id, i); kids.set(id, []); });
    const q0 = T.slice();
    while (q0.length) {
      const u = q0.shift();
      P.adj.get(u).slice().sort((a, b) => a.c.k - b.c.k).forEach(e => { if (col.has(e.o)) return; col.set(e.o, col.get(u)); par.set(e.o, u); kids.get(u).push(e.o); kids.set(e.o, []); q0.push(e.o); });
    }
    P.pts.forEach(p => { if (P.adj.get(p.id).length && !col.has(p.id)) P.warn.push(P.label(p.id) + ' is not joined to the main route, so it is left off the diagram.'); });
    /* the cables between the same two points, drawn side by side */
    const pairs = [], pairOf = new Map();
    P.cables.forEach(c => {
      if (!col.has(c.from) || !col.has(c.to)) return;
      let g = pairs.find(x => (x.a === c.from && x.b === c.to) || (x.a === c.to && x.b === c.from));
      if (!g) { g = { a: c.from, b: c.to, cs: [] }; pairs.push(g); }
      pairOf.set(c, g); g.cs.push(c);
    });
    const beyond = id => !!(P.beyond && P.beyond.has(id)), plainEnd = id => beyond(id) && P.byId.get(id).type === 'site', spare = c => !!(P.spare && P.spare.has(c));
    const half = id => { const p = P.byId.get(id); return plainEnd(id) ? [7, 4.5] : p.type === 'site' ? [11, 6.5] : p.type === 'dnap' ? [6, 4] : [2.8, 2.8]; };
    const trim = (id, ux, uy) => { const [hw, hh] = half(id); return Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : 1e9) + 0.6; };
    const angOf = (ux, uy) => { let a = Math.atan2(uy, ux) * 180 / Math.PI; if (a > 90.01) a -= 180; if (a <= -89.99) a += 180; return a; };
    /* a cable's words, under it: its ID (TBF until given), EXISTING or its length (green box) and size, its leg, NOT SPLICED for a spare */
    const cableRows = c => {
      const tl = c.status === 'existing' ? 'SITE_EXIST' : 'SITE_NEW', perBuf = c.fpt && c.fpt !== 12 ? ' · ' + c.fpt + 'F/BUFFER' : '', R = [{ d: 3, s: c.name, h: 1.7, lay: tl }];
      if (c.status === 'existing') R.push({ d: 6, s: 'EXISTING ' + c.size + ' FOC' + perBuf, h: 1.7, lay: tl });
      else { const t = lenTxt(c.length); if (t) R.push({ d: 6.4, s: t, h: 1.8, lay: 'TEXT', box: true }); R.push({ d: 10, s: c.size + 'C FOC' + perBuf, h: 1.6, lay: 'NOTE' }); }
      if (c.leg) R.push({ d: c.status === 'existing' ? 9.5 : 13.5, s: up(c.leg), h: 1.8, lay: tl });
      if (spare(c)) R.push({ d: R[R.length - 1].d + 3.4, s: 'NOT SPLICED · FOR FUTURE', h: 1.6, lay: 'NOTE', bold: true });
      return R;
    };
    /* its fibers at a closure end (one label per direction at a branch, F1-6 → BALIWAG; a dashed box for a leg spliced only); the cable
       going on from a dummy NAP: its fibers capped there */
    const endLabels = (c, id) => {
      const p = P.byId.get(id);
      if (spare(c)) return p.type === 'dnap' && P.onward && P.onward.has(c) ? [{ s: fmtRanges(seq(1, c.size), 'F') + ' CAPPED', lay: 'NOTE' }] : [];
      if (p.type !== 'closure') return [];
      const gs = labelsAt(P, id, c);
      return gs.map(g => ({ s: (g.f.length ? fmtRanges(g.f, 'F') : 'NO FREE FIBERS') + (gs.length > 1 ? ' → ' + up(P.label(g.dir)) : ''), lay: 'FIBER_USED', boxed: g.look === 'spliced', ref: 'leg:' + g.id }));
    };
    const cloLines = p => {
      const isNew = p.status !== 'existing', nm = up(p.name), coord = coordTxt(p.coords), L = [isNew ? 'PROPOSED CLOSURE' : 'EXISTING CLOSURE'];
      if (nm && !/^C\d*$/.test(nm)) L.push(nm);
      if (beyond(p.id)) L.push('NOT SPLICED'); else if (isNew) L.push(spliceKind(P, p.id));
      if (coord) L.push('Coordinates:', coord); else L.push({ s: 'Coordinates: "TBF"', o: { bold: true }, lay: 'FIBER_USED' });
      return L;
    };
    /* the As-Built tags at the legs' homing ends (the As-Plan carries no testing words) */
    const tags = new Map();
    if (P.stage === 'built') P.legs.forEach(l => { if (l.bad || !l.routed || l.state === 'future') return; if (!tags.has(l.home)) tags.set(l.home, []); tags.get(l.home).push(l); });

    /* the layout: the trunk's gaps, how low each point's children hang (dy), how far right a child sits after its left sibling (sx), how far
       apart the cables of a pair run (lens): grown where words meet */
    const stackHalf = new Map();
    T.forEach((id, i) => {
      const p = P.byId.get(id);
      if (p.type === 'closure') stackHalf.set(id, Math.max(...cloLines(p).map(t => textW(typeof t === 'string' ? t : t.s, 1.9, typeof t !== 'string'))) / 2);
      else if (n === 1 || (i > 0 && i < n - 1)) { const nm = up(p.name), L = [nm || 'SITE'].concat(p.code ? ['(' + up(p.code) + ')'] : []).map(t => textW(t, 2.4, true)).concat((plainEnd(id) ? [] : siteLines(P, p)).map(t => textW(t, 1.9))); stackHalf.set(id, Math.max(...L) / 2); }
      else stackHalf.set(id, half(id)[0]);
    });
    const DX0 = n > 1 ? Math.max(36, Math.min(92, 300 / (n - 1))) : 0, DY0 = 60, KX = 40;
    const gap = T.slice(1).map(() => DX0), dy = new Map(), sx = new Map(), lens = new Map();
    const place = () => {
      const pos = new Map(); let x = 0;
      T.forEach((id, i) => { if (i) x += gap[i - 1]; pos.set(id, { x, y: 0, trunk: true, i }); });
      const q = T.slice();
      while (q.length) {
        const u = q.shift(), pu = pos.get(u); let x0 = pu.x;
        kids.get(u).forEach((v, j) => { x0 += (j ? KX : 0) + (sx.get(v) || 0); pos.set(v, { x: x0, y: pu.y - (dy.get(u) || DY0), trunk: false }); q.push(v); });
      }
      return pos;
    };
    const draw = pos => {
      const G = new Gfx(), fibTop = new Map(), geo = [];
      /* 1. the cables' lines, a pair at a time: the first straight, the next ones beside it, under the words of the one before. A pair on the
         trunk whose end has a cable hanging below it runs above the trunk instead, leaving along the trunk until clear of the words over its ends */
      for (const g of pairs) {
        let A = pos.get(g.a), B = pos.get(g.b), a = g.a, b = g.b;
        if (A.x > B.x + 1e-6 || (Math.abs(A.x - B.x) < 1e-6 && A.y < B.y)) { const t = A; A = B; B = t; a = g.b; b = g.a; }
        const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, ta = trim(a, ux, uy), tb = trim(b, -ux, -uy);
        const ang = angOf(ux, uy), r = ang * Math.PI / 180, vert = Math.abs(ux) < 1e-6, level = Math.abs(uy) < 1e-6;
        /* the words' side: under the line, left of an upright one. The fibers at its ends: over a level line, on the words' side of any other
           (clear of the line it hangs from), at the ends where the words are in the middle */
        const s = vert ? [-1, 0] : [Math.sin(r), -Math.cos(r)], fs = level ? -1 : 1;
        /* upw: the pair runs on the other side: on the trunk when a cable hangs below an end; a slanting pair (a branch beside its siblings) away from them */
        const hangs = id => P.adj.get(id).some(e => pos.has(e.o) && !pos.get(e.o).trunk), upw = g.cs.length > 1 && (level ? A.trunk && B.trunk && (hangs(a) || hangs(b)) : !vert);
        /* (clear of the words over its end, and of the straight cable's fibers there) */
        const labEnd = id => Math.max(0, ...g.cs.map(c => Math.max(0, ...endLabels(c, id).map(x => { const w = textW(x.s, 1.9); return Math.max(9, half(id)[0] + 1.6 + w / 2) + w / 2; }))));
        const clrA = upw && level ? Math.max(0, Math.max(stackHalf.get(a) || 0, labEnd(a)) + 1.5 - ta) : 0, clrB = upw && level ? Math.max(0, Math.max(stackHalf.get(b) || 0, labEnd(b)) + 1.5 - tb) : 0;
        const nLab = g.cs.map(c => Math.max(endLabels(c, a).length, endLabels(c, b).length)), lab = k => 2.4 + nLab[k] * 3.6;
        /* a cable that would run through another point's symbol (one that comes back to the route, a loop) runs beside it instead, clear of it */
        const sg0 = upw ? -1 : 1, blocked = o0 => { let need = 0; for (const [id, q] of pos) { if (id === a || id === b) continue;
          const [hw, hh] = half(id), t = (q.x - A.x) * ux + (q.y - A.y) * uy, eL = hw * Math.abs(ux) + hh * Math.abs(uy), e = hw * Math.abs(s[0]) + hh * Math.abs(s[1]) + 2.5, ds = ((q.x - A.x) * s[0] + (q.y - A.y) * s[1]) * sg0;
          if (t + eL > ta && t - eL < L - tb && Math.abs(ds - o0) < e) need = Math.max(need, ds + e + 3); } return need; };
        let byp = 0; for (let k = 0; k < 4; k++) { const nb = blocked(byp); if (nb <= byp + 1e-6) break; byp = nb; }
        let off = byp;
        g.cs.forEach((c, j) => {
          const rows = cableRows(c), last = rows[rows.length - 1], depth = last.d + last.h * 0.75, sg = upw ? -1 : 1, o = sg * off;
          const J = j || byp ? Math.min(3 + off * 0.3, Math.max(1.5, (L - ta - tb - clrA - clrB) / 2 - 3)) : 0, cA = j ? clrA : 0, cB = j ? clrB : 0;
          const pts = [[A.x + ux * ta, A.y + uy * ta]];
          if (cA > 0.01) pts.push([A.x + ux * (ta + cA), A.y + uy * (ta + cA)]);
          const P1 = [A.x + ux * (ta + cA + J) + s[0] * o, A.y + uy * (ta + cA + J) + s[1] * o], P2 = [B.x - ux * (tb + cB + J) + s[0] * o, B.y - uy * (tb + cB + J) + s[1] * o];
          if (j || byp) pts.push(P1, P2);
          if (cB > 0.01) pts.push([B.x - ux * (tb + cB), B.y - uy * (tb + cB)]);
          pts.push([B.x - ux * tb, B.y - uy * tb]);
          G.ref = 'cab:' + c.key; G.ow = 'c:' + c.k;
          G.pl(pts, c.status === 'existing' ? 'FOC_EXIST' : 'FOC_NEW');
          /* ws: the side its words go (+1 the words' side, -1 the other); fsj: its fibers' side */
          geo.push({ c, g, j, a, b, A, B, ux, uy, ta: ta + cA, tb: tb + cB, ang, s, ws: j && upw ? -1 : 1, fsj: j && upw ? (level ? 1 : -1) : fs, off: o, J, rows, L, lens: g.cs.length > 1, upw,
            flat: Math.hypot(P2[0] - P1[0], P2[1] - P1[1]), mx: (P1[0] + P2[0]) / 2, my: (P1[1] + P2[1]) / 2 });
          if (upw && level) off += (j ? Math.max(depth + 3, j + 1 < g.cs.length ? lab(j + 1) + 1.2 : 0) : lab(0) + (g.cs.length > 1 ? lab(1) : 0) + 1.2) + (lens.get(g) || 0);
          else if (upw) off += (j ? Math.max(depth, lab(j)) + 3 : 4.5) + (lens.get(g) || 0); /* (line 0's words and fibers are on its far side) */
          else off += Math.max(depth + 3, j + 1 < g.cs.length ? lab(j + 1) + 1.2 : 0) + (lens.get(g) || 0);
          G.ref = null; G.ow = null;
        });
      }
      /* 2. the symbols */
      for (const [id, ps] of pos) {
        const p = P.byId.get(id), isNew = p.status !== 'existing', lay = p.type === 'dnap' ? (isNew ? 'DNAP_NEW' : 'DNAP_EXIST') : (isNew ? 'SITE_NEW' : 'SITE_EXIST'), [hw, hh] = half(id);
        G.ref = 'pt:' + id; G.ow = 'n:' + id; G.pt = 'pt:' + id;
        if (p.type === 'closure') pentagon(G, ps.x, ps.y, 2.8, isNew ? 'CLOSURE_NEW' : 'CLOSURE_EXIST');
        else if (plainEnd(id)) fduIcon(G, ps.x, ps.y, lay, 2 * hw, 2 * hh); else if (p.type === 'dnap') dnapIcon(G, ps.x, ps.y, lay); else fduIcon(G, ps.x, ps.y, lay);
        G.ref = null; G.ow = null; G.pt = null;
      }
      /* then the words, each in the first of its places that meets nothing drawn so far (in the order of preference), else the first */
      const put = placer(G, false).put;
      /* 3. each cable's words: under it (beside an upright one) in its middle; else over it, or a little along it */
      geo.forEach(q => {
        const { c, s, ang } = q, r = ang * Math.PI / 180, ex = Math.cos(r), ey = Math.sin(r);
        const rowsAt = (T, sd, along) => q.rows.forEach(rw => {
          const x = q.mx + ex * along + sd * s[0] * rw.d, y = q.my + ey * along + sd * s[1] * rw.d;
          if (rw.box) {
            const w = textW(rw.s, 1.8) + 2, h = 3.2;
            T.pt = 'len:' + c.k; T.fl([[x - ex * w / 2 - s[0] * h / 2, y - ey * w / 2 - s[1] * h / 2], [x + ex * w / 2 - s[0] * h / 2, y + ey * w / 2 - s[1] * h / 2], [x + ex * w / 2 + s[0] * h / 2, y + ey * w / 2 + s[1] * h / 2], [x - ex * w / 2 + s[0] * h / 2, y - ey * w / 2 + s[1] * h / 2]], 'LENGTH');
            T.tx(x, y, rw.s, 1.8, 'TEXT', { al: 'c', va: 'm', rot: ang }); T.pt = null;
          } else T.tx(x, y, rw.s, rw.h, rw.lay, { al: 'c', va: 'm', rot: ang, bold: rw.bold });
        });
        const sh = Math.max(0, q.flat / 2 - 14), w = q.ws, cands = [T => rowsAt(T, w, 0)], other = !q.lens || (q.upw ? q.j === 0 : q.j === q.g.cs.length - 1);
        if (sh > 4) [0.5, -0.5, 1, -1, 0.25, -0.25, 0.75, -0.75].forEach(f => cands.push(T => rowsAt(T, w, f * sh)));
        if (other) [0].concat(sh > 4 ? [0.5, -0.5, 1, -1] : []).forEach(f => cands.push(T => rowsAt(T, -w, f * sh)));
        put(cands, { ref: 'cab:' + c.key, ow: 'c:' + c.k });
      });
      /* 4. its fibers at a closure (and a dummy NAP's capped cable): over its end, else further along it, else on its other side */
      geo.forEach(q => {
        const { c, A, B, ux, uy, s, fsj, off, J, ang } = q;
        [[q.a, 1, q.ta], [q.b, -1, q.tb]].forEach(([id, sg, t0]) => {
          const list = endLabels(c, id), hw = half(id)[0]; if (!list.length) return;
          const at = (T, sd, more, gp) => list.forEach((x, k) => {
            const w = textW(x.s, 1.9), d = Math.max(9, hw + 1.6 + w / 2, q.j ? t0 + J + 1.2 + w / 2 : 0) + more, o = 2.4 + (gp || 0) + k * 3.6;
            const x0 = (sg > 0 ? A.x + ux * d : B.x - ux * d) + s[0] * (off + sd * o), y0 = (sg > 0 ? A.y + uy * d : B.y - uy * d) + s[1] * (off + sd * o);
            T.ref = x.ref || 'cab:' + c.key; T.pt = x.boxed ? 'fb:' + c.k + ':' + id + ':' + k : null;
            T.tx(x0, y0, x.s, 1.9, x.lay, { al: 'c', va: 'm', rot: ang });
            if (x.boxed) rotBox(T, x0, y0, w + 1.6, 3.4, ang, 'FIBER_RESERVED');
            T.pt = null;
          });
          const cands = [];
          [0, 7, 14, 22, 32].forEach(more => { cands.push(T => at(T, fsj, more)); if (!q.lens) cands.push(T => at(T, -fsj, more)); });
          /* (else a little further from the line, or on the other side of a cable that runs beside another) */
          [0, 7, 14, 22, 32].forEach(more => { if (q.lens) cands.push(T => at(T, -fsj, more)); [2.5, 5].forEach(gp => { cands.push(T => at(T, fsj, more, gp)); if (!q.lens) cands.push(T => at(T, -fsj, more, gp)); }); });
          const pick = put(cands, { ow: 'e:' + c.k + ':' + id });
          if (pick && pos.get(id).trunk) pick.forEach(t => { const bx = primBox([t]), top = bx[3] - pos.get(id).y, hs = (stackHalf.get(id) || 0) + 1; if (top > 0 && top < 24 && bx[2] > pos.get(id).x - hs && bx[0] < pos.get(id).x + hs) fibTop.set(id, Math.max(fibTop.get(id) || 0, top)); });
        });
      });
      /* 5. the points' words */
      for (const [id, ps] of pos) {
        const p = P.byId.get(id), nm = up(p.name), [hw, hh] = half(id), set = { ref: 'pt:' + id, ow: 'n:' + id };
        if (p.type === 'closure') {
          const L = cloLines(p), h = 1.9, step = h * 1.5, N = L.length, wL = Math.max(...L.map(t => textW(typeof t === 'string' ? t : t.s, h, typeof t !== 'string')));
          if (ps.trunk) put([T => T.txs(ps.x, ps.y + Math.max(6, (fibTop.get(id) || 0) + 0.8) + (N - 1) * step, L, h, 'TEXT', { al: 'c', gap: 1.5 })], set);
          else {
            const cl = [];
            [0, 9, 18].forEach(r => cl.push(T => T.txs(ps.x + 5 + r, ps.y + 3.6 + r * 0.4 + (N - 1) * step, L, h, 'TEXT', { gap: 1.5 }), T => T.txs(ps.x - 5 - r, ps.y + 3.6 + r * 0.4 + (N - 1) * step, L, h, 'TEXT', { gap: 1.5, al: 'r' }),
              T => T.txs(ps.x + 5 + r, ps.y - 3.6 - r * 0.4 - h, L, h, 'TEXT', { gap: 1.5 }), T => T.txs(ps.x - 5 - r, ps.y - 3.6 - r * 0.4 - h, L, h, 'TEXT', { gap: 1.5, al: 'r' }),
              T => T.txs(ps.x - wL / 2, ps.y + 4.2 + r + (N - 1) * step, L, h, 'TEXT', { gap: 1.5 }), T => T.txs(ps.x - wL / 2, ps.y - 4.2 - r - h, L, h, 'TEXT', { gap: 1.5 })));
            put(cl, set);
          }
          continue;
        }
        const plain = plainEnd(id), lay = p.type === 'dnap' ? (p.status !== 'existing' ? 'DNAP_NEW' : 'DNAP_EXIST') : (p.status !== 'existing' ? 'SITE_NEW' : 'SITE_EXIST');
        /* a point past a dummy NAP is not a homing of this work: its name (and its FDU's ID when it has one), nothing else */
        const name = [nm || 'SITE'].concat(p.code ? ['(' + up(p.code) + ')'] : []), fdu = up(p.fdu || '');
        const info = plain ? (fdu && fdu !== nm && !/TBF/.test(fdu) ? [fdu] : []) : siteLines(P, p);
        const hN = 2.4, sN = hN * 1.55, hI = 1.9, sI = hI * 1.5, wI = info.length ? Math.max(...info.map(t => textW(t, hI))) : 0, wN = Math.max(...name.map(t => textW(t, hN, true))), wB = Math.max(wN, wI);
        const hBlk = (name.length - 1) * sN + 1.05 * hN + (info.length ? 0.25 * hN + 1.2 + 1.05 * hI + (info.length - 1) * sI : 0) + 0.25 * hI;
        /* a block of name then FDU lines, its top left corner at x, yTop */
        const blk = (T, x, yTop, al) => { const yN = yTop - 1.05 * hN, ax = al === 'r' ? x + wB : x; T.txs(ax, yN, name, hN, 'TEXT', { bold: true, al: al || 'l' }); if (info.length) T.txs(ax, yN - (name.length - 1) * sN - 0.25 * hN - 1.2 - 1.05 * hI, info, hI, lay, { gap: 1.5, al: al || 'l' }); };
        const tg = tags.get(id) || [];
        if (ps.trunk && n > 1 && (ps.i === 0 || ps.i === n - 1)) {
          /* an end of the trunk: the name beside it, outside; the FDU block under it (kept out of the trunk's gap), or above it */
          const lft = ps.i === 0;
          put([T => T.txs(lft ? ps.x - hw - 3 : ps.x + hw + 3, ps.y + 1.6, name, hN, 'TEXT', { al: lft ? 'r' : 'l', bold: true }), T => T.txs(ps.x, ps.y + hh + 2.6 + 0.25 * hN + (name.length - 1) * sN, name, hN, 'TEXT', { al: 'c', bold: true })], set);
          const ib = (T, x, yTop) => T.txs(x, yTop - 1.05 * hI, info, hI, lay, { gap: 1.5 }), hInf = 1.05 * hI + (info.length - 1) * sI + 0.25 * hI;
          if (info.length) put([T => ib(T, lft ? Math.min(ps.x - hw, ps.x + hw - wI) : ps.x - hw, ps.y - hh - 2.6), T => ib(T, ps.x - wI / 2, ps.y + hh + 2.6 + hInf), T => ib(T, lft ? ps.x - hw - 3 - wI : ps.x + hw + 3, ps.y - 2.6 - 2.4 * 1.55)], set);
        } else if (ps.trunk) put([T => blk(T, ps.x - wB / 2, ps.y + hh + 2.6 + hBlk), T => blk(T, ps.x - wB / 2, ps.y - hh - 2.6)], set);
        else put([T => blk(T, ps.x + hw + 3, ps.y + hh), T => blk(T, ps.x - hw - 3 - wB, ps.y + hh, 'r'), T => blk(T, ps.x - wB / 2, ps.y - hh - 2.6), T => blk(T, ps.x - wB / 2, ps.y + hh + 2.6 + hBlk),
          T => blk(T, ps.x + hw + 3, ps.y + hh + hBlk), T => blk(T, ps.x + hw + 3, ps.y - hh + 2), T => blk(T, ps.x + hw + 14, ps.y + hh), T => blk(T, ps.x - hw - 14 - wB, ps.y + hh, 'r'),
          T => blk(T, ps.x - wB / 2, ps.y - hh - 12), T => blk(T, ps.x - wB / 2, ps.y + hh + 12 + hBlk)], set);
        /* the As-Built tags at a homing: above or below it, where they are free */
        if (tg.length) {
          const tH = tg.length * 8, tagsAt = (T, y, down) => { let yy = y; tg.forEach((l, k) => { T.pt = 'tag:' + id + ':' + k; const H = tagBox(T, ps.x, yy, l, down); T.pt = null; yy += down ? -(H + 1.5) : H + 1.5; }); };
          put([T => tagsAt(T, ps.y + hh + 2.5, false), T => tagsAt(T, ps.y - hh - 2.5, true), T => tagsAt(T, ps.y + hh + 2.5 + hBlk + 2, false), T => tagsAt(T, ps.y - hh - 4 - hBlk, true), T => tagsAt(T, ps.y + hh + 6 + tH + hBlk, false)], set);
        }
      }
      /* 6. future legs: a short thin grey dashed stub from the new FDU (no length box, fibers xx-xx), the homing named at its tip, where it
         meets nothing: up and out at an end of the trunk, down and left elsewhere, then other ways */
      const stubs = new Map();
      for (const x of P.futures) {
        const A = pos.get(x.from); if (!A) continue;
        const [hwA, hhA] = half(x.from), words = P.stage === 'built' ? 'NOT YET BUILT' : 'LATER (SECOND CABLE)', k = stubs.get(x.from) || 0; stubs.set(x.from, k + 1);
        const lft = A.trunk && n > 1 && A.i === 0, rgt = A.trunk && n > 1 && A.i === n - 1, L = ['xx-xx' + (x.name ? ' (' + x.name + ')' : ''), 'FUTURE FOC → ' + up(P.label(x.to)), words];
        const stub = (T, deg, len) => {
          const ux = Math.cos(deg * Math.PI / 180), uy = Math.sin(deg * Math.PI / 180), a0 = [A.x + Math.sign(Math.round(ux * 100)) * hwA * 0.8, A.y + Math.sign(Math.round(uy * 100)) * hhA], tip = [a0[0] + ux * len, a0[1] + uy * len];
          T.ln(a0[0], a0[1], tip[0], tip[1], 'FOC_FUTURE');
          if (uy > 0) T.txs(tip[0], tip[1] + 1.4 + 2 * 1.7 * 1.5, L, 1.7, 'NOTE', { al: 'c', gap: 1.5 }); else T.txs(tip[0], tip[1] - 3.2, L, 1.7, 'NOTE', { al: 'c', gap: 1.5 });
        };
        const pref = (lft ? [128, 154, 232, 206] : rgt ? [52, 26, 308, 334] : [236, 210, 304, 330, 124, 56]).map(d => d + (k ? (lft || rgt ? 13 : -13) : 0)), cands = [];
        const degs = pref.concat(seq(0, 12).map(i => i * 30).filter(d => pref.indexOf(d) < 0));
        [26 + k * 16, 42 + k * 16, 60 + k * 16, 80 + k * 16].forEach(len => degs.forEach(d => cands.push(T => stub(T, d, len))));
        put(cands, { ref: 'leg:' + x.id, ow: 'n:' + x.from });
      }
      return G;
    };

    /* where a primitive belongs: t, its place along the trunk (a column i, or i + 0.5 for a trunk cable's words), and the point it hangs from */
    const cabK = new Map(P.cables.map(c => [c.k, c])), depthOf = id => { let d = 0; while (par.has(id)) { id = par.get(id); d++; } return d; };
    const whereOf = ow => {
      if (!ow) return null;
      if (ow[0] === 'n') { const id = ow.slice(2); return col.has(id) ? { t: col.get(id), node: id } : null; }
      if (ow[0] === 'e') { /* a cable's fibers at one end: at that point, moving with the far end when it hangs from there */
        const i = ow.indexOf(':', 2), c = cabK.get(+ow.slice(2, i)), id = ow.slice(i + 1); if (!c || !col.has(id)) return null;
        const o = c.from === id ? c.to : c.from; return { t: col.get(id), node: par.get(o) === id ? o : id, c, end: id };
      }
      const c = cabK.get(+ow.slice(2)); if (!c) return null; const ca = col.get(c.from), cb = col.get(c.to);
      return ca !== cb ? { t: (ca + cb) / 2, node: null, c } : { t: ca, node: depthOf(c.from) >= depthOf(c.to) ? c.from : c.to, c };
    };
    const chain = id => { const L = [id]; while (par.has(id)) { id = par.get(id); L.push(id); } return L; };
    let pos = null, G = null, left = [];
    const tries = new Map(), sig = x => x.p.k + '|' + (x.p.k === 'tx' ? x.p.s : x.p.lay) + '|' + (x.p.ow || '');
    for (let it = 0; it < 40; it++) {
      pos = place(); G = draw(pos); left = clashes(G.p);
      if (!left.length) break;
      const G2 = new Map(), DY2 = new Map(), SX2 = new Map(), LS2 = new Map(), bump = (M, k, v) => { if (v > (M.get(k) || 0)) M.set(k, v); };
      const seen = new Set();
      left.forEach(({ a, b }) => {
        const key = sig(a) + '#' + sig(b); if (!seen.has(key)) { seen.add(key); tries.set(key, (tries.get(key) || 0) + 1); } if (tries.get(key) > 16) return;
        const wa = whereOf(a.p.ow), wb = whereOf(b.p.ow); if (!wa || !wb) return;
        const ox = Math.min(a.b[2], b.b[2]) - Math.max(a.b[0], b.b[0]) + 1.2, oy = Math.min(a.b[3], b.b[3]) - Math.max(a.b[1], b.b[1]) + 1.2;
        if (wa.t !== wb.t) {
          /* in different places along the trunk: the gaps between them grow (a trunk cable's words move half as much as its far end) */
          const lo = Math.min(wa.t, wb.t), hi = Math.max(wa.t, wb.t), gs = [];
          for (let k = 0; k < n - 1; k++) { const f = Math.min(hi, k + 1) - Math.max(lo, k); if (f > 1e-9) gs.push([k, f]); }
          const tot = gs.reduce((s, x) => s + x[1], 0); gs.forEach(([k]) => bump(G2, k, ox / tot)); return;
        }
        if (wa.c && wb.c && wa.c !== wb.c && pairOf.get(wa.c) === pairOf.get(wb.c)) {
          /* two cables of one pair: words over words, they run further apart; a line through the other's words, the pair runs longer */
          const pr = pairOf.get(wa.c);
          if (a.t && b.t) { bump(LS2, pr, oy); return; }
          if (par.get(pr.b) === pr.a || par.get(pr.a) === pr.b) { bump(DY2, par.get(pr.b) === pr.a ? pr.a : pr.b, 2 * oy + 2); return; }
          const ka = col.get(pr.a), kb = col.get(pr.b); for (let k = Math.min(ka, kb); k < Math.max(ka, kb); k++) bump(G2, k, 2 * ox + 2); return;
        }
        if (wa.node == null || wb.node == null) { const k = Math.floor(wa.t); if (k < n - 1) bump(G2, k, ox); if (k > 0) bump(G2, k - 1, ox); return; }
        const na = wa.node, nb = wb.node;
        if (na === nb) { if ((wa.c || wb.c) && par.has(na)) bump(DY2, par.get(na), 2 * oy); return; }
        const ca = chain(na), cb = chain(nb);
        if (ca.indexOf(nb) >= 0) { bump(DY2, nb, oy); return; }
        if (cb.indexOf(na) >= 0) { bump(DY2, na, oy); return; }
        const lca = ca.find(x => cb.indexOf(x) >= 0); if (lca == null) return;
        const kA = ca[ca.indexOf(lca) - 1], kB = cb[cb.indexOf(lca) - 1], K = kids.get(lca);
        bump(SX2, K.indexOf(kA) > K.indexOf(kB) ? kA : kB, ox);
      });
      if (!G2.size && !DY2.size && !SX2.size && !LS2.size) break;
      G2.forEach((v, k) => { gap[k] += v; }); DY2.forEach((v, k) => dy.set(k, (dy.get(k) || DY0) + v)); SX2.forEach((v, k) => sx.set(k, (sx.get(k) || 0) + v)); LS2.forEach((v, k) => lens.set(k, (lens.get(k) || 0) + v));
      if (typeof process !== "undefined" && process.env && process.env.SLD_DEBUG) console.log("sld it", it, left.length, JSON.stringify([...G2]), JSON.stringify([...DY2]), JSON.stringify([...SX2].map(x => [x[0], x[1]])), [...LS2.values()]);
      if (gap.reduce((s, v) => s + v, 0) > 6000) break;
    }
    P.sldClash = left.length;
    return block(G, 'SINGLE LINE DIAGRAM');
  }
  /* rows: lay the items in columns of that many rows (beside the CONNECTIONS box); without, one row as before */
  function accessLegend(P, rows) {
    const G = new Gfx(), has = t => P.pts.some(p => p.type === t), look = k => P.legs.some(l => !l.bad && l.look === k && (k === 'future' || l.routed));
    const items = [['pc', 'PROPOSED CLOSURE'], ['ec', 'EXISTING CLOSURE'], ['nf', 'NEW FOC'], ['ef', 'EXISTING FOC'], ['nd', 'NEW FDU PANEL'], ['ed', 'EXISTING FDU PANEL']].concat(has('dnap') ? [['dn', 'DUMMY NAP']] : [])
      .concat(look('spliced') ? [['sp', 'SPLICED ONLY, FOR FUTURE TESTING']] : []).concat(look('future') ? [['fu', 'FUTURE FOC (' + (P.stage === 'built' ? 'NOT YET BUILT' : 'SECOND CABLE, LATER') + ')']] : []);
    G.tx(0, 6, 'LEGEND:', 2.2, 'LEGEND', { bold: true });
    const txOf = k => k === 'pc' || k === 'ec' ? 9 : 15, cw = [];
    if (rows) items.forEach(([k, t], i) => { const ci = Math.floor(i / rows); cw[ci] = Math.max(cw[ci] || 0, txOf(k) + textW(t, 2) + 7); });
    items.forEach(([k, t], i) => {
      const x = rows ? cw.slice(0, Math.floor(i / rows)).reduce((s, v) => s + v, 0) : i * 54, y = rows ? -(i % rows) * 6 : 0, tx = txOf(k);
      G.pt = 'leg:' + k;
      if (k === 'pc' || k === 'ec') pentagon(G, x + 4, y, 2.4, k === 'pc' ? 'CLOSURE_NEW' : 'CLOSURE_EXIST');
      else if (k === 'nf' || k === 'ef') G.ln(x, y, x + 12, y, k === 'nf' ? 'FOC_NEW' : 'FOC_EXIST');
      else if (k === 'dn') dnapIcon(G, x + 6, y, 'DNAP_NEW', 0.66);
      else if (k === 'sp') { G.rect(x, y - 1.7, 12, 3.4, 'FIBER_RESERVED'); G.tx(x + 6, y, 'F7-12', 1.5, 'FIBER_USED', { al: 'c', va: 'm' }); }
      else if (k === 'fu') G.ln(x, y, x + 12, y, 'FOC_FUTURE');
      else fduIcon(G, x + 6, y, k === 'nd' ? 'SITE_NEW' : 'SITE_EXIST', 12, 5.2);
      G.pt = null; G.tx(x + tx, y, t, 2, 'LEGEND', { va: 'm' });
    });
    return block(G);
  }
  /* the CONNECTIONS box: one row per leg, W wide */
  function accessConnections(P, W) {
    const legs = P.legs.filter(l => !l.bad); if (!legs.length) return null;
    const G = new Gfx(); G.tx(0, 6, 'CONNECTIONS:', 2.2, 'LEGEND', { bold: true });
    const fr = [0.04, 0.17, 0.17, 0.22, 0.12, 0.28], heads = ['#', 'FROM', 'TO', 'FIBERS', 'VIA', 'STATUS'];
    const rows = legs.map(l => {
      const fib = l.n + 'F · ' + (l.state === 'future' ? 'xx-xx' + (l.futureCable ? ' (' + l.futureCable + ')' : '') : l.fibers.length ? l.fibers.map(f => f.text || '-').join(' > ') : 'NO CABLE YET');
      const r = [String(l.index + 1), up(l.aName) + (l.portA ? ' P' + l.portA : ''), up(l.bName) + (l.portB ? ' P' + l.portB : ''), fib, l.viaNames.map(up).join(', ') || '-', l.status || l.words];
      r.ref = 'leg:' + l.id; return r;
    });
    table(G, 0, 3, fr.map((f, i) => ({ t: heads[i], w: W * f, al: i ? 'l' : 'c' })), rows, { th: 1.6 });
    return block(G);
  }

  /* detailed, drawn like the ODN's: the homing ODF at the left, every cable a bundle of fibers (working red, spare black), every closure an ellipse
     with its splices inside, and the far ends at the right on rows of their own: an ODF (FDU panel) or a dummy NAP (pole-mounted small cell).
     As-Built: a leg spliced only is dashed (layer FIBER_RESERVED) with hollow splice dots. A future leg is a grey stub, xx-xx, no splices.
     The pieces of one existing cable at a closure: the fibers not cut there pass straight through (NOT CUT). */
  function accessDetailed(P) {
    const GAP = 1.1, T = trunkOf(P), BW = P.legs.some(l => l.look === 'spliced' && l.routed) ? 26 : 18;
    if (!T.length) { const G = new Gfx(); G.tx(0, 0, 'ADD THE POINTS AND THE CABLES TO DRAW THE SPLICING DETAILS.', 3, 'NOTE'); return [block(G)]; }
    const root = T[0], typ = id => P.byId.get(id).type, isEnd = id => typ(id) === 'site' || typ(id) === 'dnap';
    const par = new Map([[root, null]]), kids = new Map(), depth = new Map([[root, 0]]), q = [root], treeC = new Set();
    while (q.length) { const u = q.shift(); kids.set(u, []); for (const e of P.adj.get(u).slice().sort((a, b) => a.c.k - b.c.k)) if (!par.has(e.o)) { par.set(e.o, { u, c: e.c }); depth.set(e.o, depth.get(u) + 1); treeC.add(e.c); kids.get(u).push({ id: e.o, c: e.c }); q.push(e.o); } }
    P.pts.forEach(p => { if (P.adj.get(p.id).length && !par.has(p.id)) P.warn.push(P.label(p.id) + ' is not joined to the main route, so it is left off the diagram.'); });
    const nodes = [...par.keys()], Dmax = Math.max(...nodes.map(id => depth.get(id))), K = (id, c) => id + '|' + c.k;
    /* a point past a dummy NAP (the end of the job): drawn plainly, its name only; a new cable no leg uses: NOT SPLICED · FOR FUTURE */
    const plain = id => !!(P.beyond && P.beyond.has(id)) && typ(id) === 'site', spare = c => !!(P.spare && P.spare.has(c));
    /* the fibers drawn for a cable: those its links use, one by one, then two lines for the rest of the cable */
    const W = new Map(P.cables.map(c => [c, [...new Set(c.links.flatMap(l => l.f))].sort((a, b) => a - b)]));
    const LK = new Map(P.cables.map(c => { const M = new Map(); c.links.forEach(l => l.f.forEach(f => M.set(f, lookOf(l.st, P.stage)))); return [c, M]; }));
    const lkOf = (c, f) => LK.get(c).get(f) || 'plain', FL = lk => lk === 'spliced' ? 'FIBER_RESERVED' : 'FIBER_USED';
    const lines = c => { const w = W.get(c), L = w.map(f => ({ f })); if (c.size > w.length) L.push({ rest: 1 }, { rest: 2 }); return L; };
    const bw = c => (lines(c).length - 1) * GAP, restTxt = c => c.size > W.get(c).length ? fmtRanges(seq(1, c.size).filter(f => !W.get(c).includes(f)), 'F') : '';
    /* an end's rows: the working ports of each of its cables, then the other ports in a row or two */
    const groups = id => { const s = P.sites.get(id) || { ends: [] }; return P.adj.get(id).map(e => ({ c: e.c, o: e.o, rows: s.ends.filter(x => x.c === e.c).flatMap(x => x.f.map((f, i) => ({ f, port: x.ports[i] != null ? x.ports[i] : f, lk: lookOf(x.st, P.stage) }))).sort((a, b) => a.port - b.port) })); };
    const extra = id => {
      const s = P.sites.get(id); if (!s || plain(id)) return [];
      if (s.existing) return s.tbc ? ['ACTIVE TBC'] : [s.before.length ? 'ACTIVE ' + fmtRanges(s.before) : '', s.spare.length ? 'SPARE ' + fmtRanges(s.spare) : ''].filter(Boolean);
      const sp = s.termPorts.filter(p => s.working.indexOf(p) < 0 && s.reserved.indexOf(p) < 0); return sp.length ? ['SPARE ' + fmtRanges(sp)] : [];
    };
    /* (each cable has a slot of its own on the box, as tall as its bundle: its working fibers' rows, then its other fibers capped) */
    const slot = (id, g) => Math.max(g.rows.length, lines(g.c).length, 1);
    /* (between two cables' slots on a box: as many rows as the gap between bundles at a closure, room for a label) */
    let GR = 1;
    const nRows = id => groups(id).reduce((a, g) => a + slot(id, g), 0) + extra(id).length + GR * Math.max(0, groups(id).length - 1);
    const boxH = id => Math.max(14, nRows(id) * GAP + 8);
    /* which way each cable runs: from its parent, or from the point further left (the positions come from the layout below) */
    const nameOf = (id, pt) => {
      if (plain(id)) { const nm = up(pt.name), f = up(pt.fdu || ''); return [{ s: nm + (pt.code ? ' (' + up(pt.code) + ')' : ''), o: { bold: true, nm: true } }].concat(f && f !== nm && !/TBF/.test(f) ? [f] : []); }
      return [{ s: up(pt.name) + (pt.code ? ' (' + up(pt.code) + ')' : ''), o: { bold: true, nm: true } }].concat(typ(id) === 'dnap' ? ['POLE-MOUNTED SMALL CELL'] : []).concat(siteLines(P, pt));
    };

    /* the drawing for a column width DX and a gap between rows LEAF: the lines, the boxes and the fiber numbers first; then every label in
       the first of its places that meets nothing drawn; DX and LEAF grow while words still meet a line, a box or other words */
    const drawAll = (DX, LEAF, SG) => {
      const G = new Gfx(), labels = []; GR = Math.ceil(SG / GAP);
      const xOf = id => isEnd(id) && id !== root && !kids.get(id).length ? Dmax * DX : depth.get(id) * DX;
      const pos = new Map(); let yc = 0;
      const place = id => {
        const ks = kids.get(id);
        if (!ks.length) { const h = isEnd(id) ? boxH(id) : 20, y = yc - h / 2; yc -= h + LEAF; pos.set(id, { x: xOf(id), y }); return y; }
        const ys = ks.map(k => place(k.id)), y = (Math.max(...ys) + Math.min(...ys)) / 2; pos.set(id, { x: xOf(id), y }); return y;
      };
      place(root);
      const dirs = P.cables.filter(c => pos.has(c.from) && pos.has(c.to)).map(c => {
        if (treeC.has(c)) { const ch = par.get(c.to) && par.get(c.to).c === c ? c.to : c.from; return { c, a: par.get(ch).u, b: ch }; }
        const xa = pos.get(c.from).x, xb = pos.get(c.to).x; return xa <= xb ? { c, a: c.from, b: c.to } : { c, a: c.to, b: c.from };
      });
      const outOf = id => dirs.filter(d => d.a === id).sort((m, n) => pos.get(n.b).y - pos.get(m.b).y || m.c.k - n.c.k);
      const inTo = id => dirs.filter(d => d.b === id).sort((m, n) => pos.get(n.a).y - pos.get(m.a).y || m.c.k - n.c.k);
      /* pieces of one existing cable meeting at a closure, both with spare fibers drawn: those pass straight through */
      const pass = new Map();
      nodes.forEach(id => passThrough(P, id).forEach(pr => { if (!pr.fibers.length || pr.A.size <= W.get(pr.A).length || pr.B.size <= W.get(pr.B).length) return; pass.set(K(id, pr.A), pr); pass.set(K(id, pr.B), pr); }));
      /* where each cable leaves or reaches a point: a stack beside a closure, its own rows on an end's box */
      const at = new Map(), rowsAt = new Map(), boxes = new Map();
      nodes.forEach(id => {
        const p = pos.get(id), O = outOf(id), I = inTo(id);
        if (isEnd(id)) {
          const h = boxH(id), top = p.y + h / 2, x0 = p.x; let r = 0; const gs = groups(id), order = I.map(d => d.c).concat(O.map(d => d.c));
          boxes.set(id, { x0, top, h }); const rows = [];
          order.forEach((c, gi) => {
            const g = gs.find(x => x.c === c) || { c, rows: [] }; if (gi) r += GR; const r0 = r, n = slot(id, g);
            g.rows.forEach((row, k) => rows.push(Object.assign({ y: top - 4 - (r0 + k) * GAP, c }, row)));
            at.set(K(id, c), { y: top - 4 - (r0 + (n - 1) / 2) * GAP, side: I.some(d => d.c === c) ? 'L' : 'R' }); r = r0 + n;
          });
          extra(id).forEach(t => { rows.push({ y: top - 4 - r * GAP, t }); r++; });
          rowsAt.set(id, rows);
        } else {
          /* (SG, 6 mm at first, between two bundles: room for a cable's two-line label) */
          const stack = (L, side) => { const H = L.reduce((a, d) => a + bw(d.c), 0) + SG * Math.max(0, L.length - 1); let y = p.y + H / 2; L.forEach(d => { const w = bw(d.c); at.set(K(id, d.c), { y: y - w / 2, side }); y -= w + SG; }); return H; };
          /* (tall enough that the bundles at the top and the foot of a tall stack, and their fiber numbers, stay inside the ellipse) */
          const h = Math.max(stack(I, 'L'), stack(O, 'R')); boxes.set(id, { ry: Math.max(h / 2 + 7, h / 2 / 0.8 + 1) });
        }
      });
      /* the cables, as bundles of fibers */
      const endPt = new Map();
      nodes.forEach(id => {
        const O = outOf(id); if (!O.length) return; const p = pos.get(id), xs = isEnd(id) ? p.x + BW + 7 : p.x + 6;
        /* the bundles turn after the range of their capped fibers (written just outside a closure's ellipse) */
        const xa0 = isEnd(id) ? xs + 3.4 : Math.max(xs + 3.4, p.x + 15), pre = Math.max(0, ...O.map(d => pass.has(K(id, d.c)) ? 0 : textW(restTxt(d.c), 0.62))), base = Math.max(xs + 9, xa0 + pre + 1.4);
        const ups = O.filter(d => pos.get(d.b) && at.get(K(d.b, d.c)).y > at.get(K(id, d.c)).y + 0.01), downs = O.filter(d => !ups.includes(d)).reverse();
        const turn = new Map(); let acc = 0; ups.forEach(d => { const w = bw(d.c); turn.set(d, base + acc + w / 2); acc += w + 5; }); acc = 0; downs.forEach(d => { const w = bw(d.c); turn.set(d, base + acc + w / 2); acc += w + 5; });
        O.forEach(d => {
          G.u = 'cab:' + d.c.k;
          const c = d.c, ys = at.get(K(id, c)).y, B = pos.get(d.b), yt = at.get(K(d.b, c)).y, xt = isEnd(d.b) ? B.x - 7 : B.x - 6, xT = turn.get(d), L = lines(c), N = L.length, w = bw(c);
          const pts = Math.abs(yt - ys) < 0.01 ? [[xs, ys], [xt, yt]] : [[xs, ys], [xT, ys], [xT, yt], [xt, yt]];
          let restW = 0;
          L.forEach((ln, j) => {
            const pp = offsetPath(pts, ((N - 1) / 2 - j) * GAP);
            if (ln.rest) {
              const z = pp.length - 1, pa = pass.has(K(id, c)), pb = pass.has(K(d.b, c));
              if (!pa) pp[0] = [pp[0][0] + 3, pp[0][1]]; if (!pb) pp[z] = [pp[z][0] - 3, pp[z][1]];
              G.pl(pp, 'FIBER');
              if (pa) endPt.set(K(id, c) + '|r' + ln.rest, pp[0]); else cap(G, pp[0][0], pp[0][1]);
              if (pb) endPt.set(K(d.b, c) + '|r' + ln.rest, pp[z]); else cap(G, pp[z][0], pp[z][1]);
              if (ln.rest === 1) {
                const r = restTxt(c), xa = isEnd(id) ? pp[0][0] + 0.4 : Math.max(pp[0][0] + 0.4, p.x + 15), xb = isEnd(d.b) ? pp[z][0] - 0.4 : Math.min(pp[z][0] - 0.4, B.x - 15);
                if (!pa) fnum(G, xa, pp[0][1], r); if (!pb) fnum(G, xb, pp[z][1], r, 'r'); restW = textW(r, 0.62) + 0.4 + (pp[z][0] - 0.4 - xb);
              }
              return;
            }
            G.pl(pp, FL(lkOf(c, ln.f))); endPt.set(K(id, c) + '|' + ln.f, pp[0]); endPt.set(K(d.b, c) + '|' + ln.f, pp[pp.length - 1]);
          });
          ellipse(G, Math.min(xt - 18, xt - 3 - restW - 2.6), yt, 1.1, w / 2 + 1.5, c.status === 'existing' ? 'SITE_EXIST' : 'SITE_NEW'); G.u = null;
          /* its label (two lines: what it is; what its fibers do), placed later: over the end of the bundle after the turn, else along it or under it */
          const tl = c.status === 'existing' ? 'SITE_EXIST' : 'SITE_NEW', before = parseRanges(c.used);
          const wk = W.get(c).filter(f => lkOf(c, f) !== 'spliced'), rs = W.get(c).filter(f => lkOf(c, f) === 'spliced');
          const t1 = c.name + ' · ' + c.size + 'C ' + (c.status === 'existing' ? 'EXISTING' : 'NEW') + (c.fpt !== 12 ? ' · ' + c.fpt + 'F PER BUFFER' : '') + (lenTxt(c.length) && c.status !== 'existing' ? ' · ' + lenTxt(c.length) : '') + (c.leg ? ' · ' + String(c.leg).toUpperCase() : '');
          const t2 = (W.get(c).length ? [wk.length ? 'WORKING ' + fmtRanges(wk, 'F') : '', rs.length ? 'FOR FUTURE TESTING ' + fmtRanges(rs, 'F') : ''].filter(Boolean).join(' · ') : spare(c) ? 'NOT SPLICED · FOR FUTURE' : 'NO LINK USES IT') + (before.length ? ' · IN USE BEFORE ' + fmtRanges(before, 'F') : '');
          const lw = Math.max(textW(t1, 1.15, true), textW(t2, 1.0)), lab = (T, x, y, al) => T.group(() => { T.tx(x, y + 2, t1, 1.15, tl, { bold: true, nm: true, al }); T.tx(x, y, t2, 1.0, 'FIBER_USED', { al }); });
          const x0 = pts.length > 2 ? xT + w / 2 + 2 : isEnd(id) ? xs + 4 : p.x + 16, xe = xt - 20, up1 = yt + w / 2 + 1.6, dn1 = yt - w / 2 - 1.6 - 3.2, cands = [];
          const xsAlong = [x0]; for (let k = 1; k <= 6; k++) { const x = x0 + k * Math.max(6, (xe - lw - x0) / 6); if (x + lw <= xe + 0.01) xsAlong.push(x); }
          xsAlong.forEach(x => cands.push(T => lab(T, x, up1)));
          xsAlong.forEach(x => cands.push(T => lab(T, x, dn1)));
          if (pts.length > 2) { const sx0 = isEnd(id) ? xs + 4 : p.x + 16, yu = ys + w / 2 + 1.6, yd = ys - w / 2 - 1.6 - 3.2; if (xT - w / 2 - 2 - lw > sx0) { cands.push(T => lab(T, xT - w / 2 - 2, yu, 'r'), T => lab(T, xT - w / 2 - 2, yd, 'r')); } }
          /* (else a little further from its bundle, or ending where the bundle reaches the far end, rather than over a line) */
          [3.5, 7, 10.5].forEach(dd => xsAlong.slice(0, 3).forEach(x => cands.push(T => lab(T, x, up1 + dd), T => lab(T, x, dn1 - dd))));
          [0, 3.5, 7].forEach(dd => cands.push(T => lab(T, xt - 3, up1 + dd, 'r'), T => lab(T, xt - 3, dn1 - dd, 'r')));
          labels.push({ cands, set: { u: 'cab:' + c.k, ow: 'c:' + c.k } });
        });
      });
      /* the points */
      nodes.forEach(id => {
        const p = pos.get(id), pt = P.byId.get(id), isNew = pt.status !== 'existing', lay = typ(id) === 'dnap' ? (isNew ? 'DNAP_NEW' : 'DNAP_EXIST') : (isNew ? 'SITE_NEW' : 'SITE_EXIST');
        if (!isEnd(id)) {
          const rx = 14, ry = Math.max(8, boxes.get(id).ry); G.u = 'pt:' + id; ellipse(G, p.x, p.y, rx, ry, lay, { lw: 0.35 }); G.u = null;
          const L = [{ s: (isNew ? 'PROPOSED CLOSURE ' : 'EXISTING CLOSURE ') + String(pt.name || '').toUpperCase(), o: { bold: true, nm: true } }, P.beyond && P.beyond.has(id) ? 'NOT SPLICED' : spliceKind(P, id), 'COORDINATES: ' + (coordTxt(pt.coords) || 'TBF')];
          const wL = Math.max(...L.map(t => textW(typeof t === 'string' ? t : t.s, 1.25, typeof t !== 'string'))), st = 1.25 * 1.5;
          labels.push({ set: { u: 'pt:' + id, ow: 'n:' + id }, cands: [0, 5, 10, 16].map(dd => T => T.txs(p.x, p.y + ry + 2 + dd + 2 * st, L, 1.25, lay, { al: 'c', gap: 1.5 })).concat([0, 5, 10, 16].map(dd => T => T.txs(p.x, p.y - ry - 2.6 - dd, L, 1.25, lay, { al: 'c', gap: 1.5 })))
            .concat([T => T.txs(p.x + rx + 3, p.y + ry + 2 + 2 * st, L, 1.25, lay, { gap: 1.5 }), T => T.txs(p.x - rx - 3 - wL, p.y + ry + 2 + 2 * st, L, 1.25, lay, { gap: 1.5 })]) });
          const spl = P.nodeSp.get(id) || [], side = { L: 0, R: 0 }, nSide = { L: 0, R: 0 };
          spl.forEach(s => s.a.f.forEach((fa, i) => { const A = endPt.get(K(id, s.a.c) + '|' + fa), B = endPt.get(K(id, s.b.c) + '|' + s.b.f[i]); if (A && B && (A[0] < p.x) === (B[0] < p.x)) nSide[A[0] < p.x ? 'L' : 'R']++; }));
          spl.forEach(s => {
            const lk = lookOf(s.st, P.stage), fl = FL(lk), fill = lk !== 'spliced';
            s.a.f.forEach((fa, i) => {
              const fb = s.b.f[i], A = endPt.get(K(id, s.a.c) + '|' + fa), B = endPt.get(K(id, s.b.c) + '|' + fb); if (!A || !B) return;
              const la = A[0] < p.x, lb = B[0] < p.x;
              if (la !== lb) { const [L1, R1] = la ? [A, B] : [B, A]; G.pl([L1, [L1[0] + 3, L1[1]], [R1[0] - 3, R1[1]], R1], fl); G.ci(p.x, (L1[1] + R1[1]) / 2, 0.3, 'SPLICE_NEW', { fill }); }
              else { const sd = la ? 'L' : 'R', k = side[sd]++, stp = nSide[sd] > 1 ? Math.min(0.6, 3 / (nSide[sd] - 1)) : 0, xi = la ? p.x - 1.5 - k * stp : p.x + 1.5 + k * stp, top = Math.max(A[1], B[1]);
                G.pl([A, [xi, A[1]], [xi, B[1]], B], fl); G.ci(xi, top - Math.min(0.8, Math.abs(A[1] - B[1]) / 2), 0.3, 'SPLICE_NEW', { fill }); }
              for (const [Q, f] of [[A, fa], [B, fb]]) fnum(G, Q[0] + (Q[0] < p.x ? -0.4 : 0.4), Q[1], 'F' + f, Q[0] < p.x ? 'r' : 'l');
            });
          });
          /* the fibers not cut here pass straight through; their numbers in the clear band at the foot of the ellipse */
          const done = new Set();
          P.adj.get(id).forEach(e => {
            const pr = pass.get(K(id, e.c)); if (!pr || done.has(pr)) return; done.add(pr); const ys = [], k = done.size - 1;
            [1, 2].forEach(r => {
              const A = endPt.get(K(id, pr.A) + '|r' + r), B = endPt.get(K(id, pr.B) + '|r' + r); if (!A || !B) return; ys.push(A[1], B[1]);
              if ((A[0] < p.x) !== (B[0] < p.x)) { const [L1, R1] = A[0] < p.x ? [A, B] : [B, A]; G.pl([L1, [L1[0] + 3, L1[1]], [R1[0] - 3, R1[1]], R1], 'FIBER'); }
              else { const xi = A[0] < p.x ? p.x - 1.5 : p.x + 1.5; G.pl([A, [xi, A[1]], [xi, B[1]], B], 'FIBER'); }
            });
            /* (high enough in the foot of the ellipse that the words fit inside it) */
            if (ys.length) { const s = fmtRanges(pr.fibers, 'F') + ' NOT CUT', q = Math.min(0.999, (textW(s, 0.7) / 2 + 0.6) / rx); G.tx(p.x, p.y - ry + Math.max(2.6, ry * (1 - Math.sqrt(1 - q * q)) + 0.5) + k * 1.3, s, 0.7, 'TEXT', { al: 'c', va: 'm' }); }
          });
          return;
        }
        const b = boxes.get(id), x0 = p.x, I = inTo(id), O = outOf(id), left = id === root || kids.get(id).length > 0 && !I.length;
        G.u = 'pt:' + id; G.frect(x0, b.top - b.h, BW, b.h, 'HILITE', { col: WHITE }); G.rect(x0, b.top - b.h, BW, b.h, lay, { lw: 0.5 });
        /* its title, upright: beside the side its rows come in on, else where no row's words are (rows on both sides, or long ones) */
        const ttl = typ(id) === 'dnap' ? 'DUMMY NAP' : (isNew ? 'PROP. ODF' : 'EXIST. ODF'), tw = textW(ttl, 1.5, true), rws = rowsAt.get(id) || [];
        const rowL = r => (r.c ? I.some(d => d.c === r.c) : !left), rowTx = r => r.t || 'P' + r.port + ' F' + r.f + (r.lk === 'spliced' ? ' FOR FUTURE TESTING' : '');
        const ext = rws.map(r => { const w = textW(rowTx(r), 0.7); return rowL(r) ? [x0 + 0.6, x0 + 0.6 + w, r.y] : [x0 + BW - 0.6 - w, x0 + BW - 0.6, r.y]; });
        const tFree = (tx, ty) => ext.every(e => e[1] < tx - 1.1 || e[0] > tx + 1.1 || Math.abs(e[2] - ty) > tw / 2 + 0.7);
        const tx0 = left ? x0 + 5 : x0 + BW - 5, txs = [tx0].concat(seq(0, Math.floor((BW - 4) / 0.5)).map(i => x0 + 2 + i * 0.5).sort((m, n) => Math.abs(m - tx0) - Math.abs(n - tx0)));
        const ylo = b.top - b.h + tw / 2 + 1, yhi = b.top - tw / 2 - 1, tys = [p.y].concat(yhi > ylo ? seq(0, Math.floor((yhi - ylo) / 0.5)).map(i => ylo + i * 0.5).sort((m, n) => Math.abs(m - p.y) - Math.abs(n - p.y)) : []);
        let tP = null; for (const ty of tys) { for (const tx of txs) if (tFree(tx, ty)) { tP = [tx, ty]; break; } if (tP) break; }
        if (!tP) tP = [tx0, p.y];
        G.tx(tP[0], tP[1], ttl, 1.5, lay, { al: 'c', va: 'm', rot: 90, bold: true }); G.u = null;
        rws.forEach(r => {
          const fromLeft = rowL(r), xe = fromLeft ? x0 : x0 + BW;
          if (r.t) { G.tx(fromLeft ? x0 + 0.6 : x0 + BW - 0.6, r.y, r.t, 0.7, 'TEXT', { al: fromLeft ? 'l' : 'r', va: 'm' }); const xs2 = fromLeft ? xe - 4 : xe + 4; G.ln(xe, r.y, xs2, r.y, 'FIBER'); cap(G, xs2, r.y); return; }
          G.tx(fromLeft ? x0 + 0.6 : x0 + BW - 0.6, r.y, rowTx(r), 0.7, 'FIBER_USED', { al: fromLeft ? 'l' : 'r', va: 'm' });
          const e = endPt.get(K(id, r.c) + '|' + r.f); if (!e) return;
          G.pl(fromLeft ? [e, [e[0] + 2, e[1]], [xe - 2, r.y], [xe, r.y]] : [[xe, r.y], [xe + 2, r.y], [e[0] - 2, e[1]], e], FL(r.lk));
        });
        /* its name and FDU block: above the box at the start of the work; beside it at a far end; above or under it where a cable goes on
           from it (a dummy NAP the route goes on from), never over that cable */
        const name = nameOf(id, pt), st = 1.25 * 1.5, hB = (name.length - 1) * st, wN = Math.max(...name.map(t => textW(typeof t === 'string' ? t : t.s, 1.25, typeof t !== 'string')));
        const above = (T, dd) => T.txs(x0, b.top + 2 + dd + hB, name, 1.25, lay, { gap: 1.5 }), below = (T, dd) => T.txs(x0, b.top - b.h - 2.6 - dd, name, 1.25, lay, { gap: 1.5 });
        const right = T => T.txs(x0 + BW + 3, b.top - 1.2, name, 1.25, lay, { gap: 1.5 }), leftOf = T => T.txs(x0 - 3 - wN, b.top - 1.2, name, 1.25, lay, { gap: 1.5 });
        const cands = left ? [T => above(T, 0), T => below(T, 0), T => above(T, 6), T => below(T, 6), leftOf] : O.length ? [T => above(T, 0), T => below(T, 0), T => above(T, 6), T => below(T, 6), T => above(T, 14), T => below(T, 14)] : [right, T => above(T, 0), T => below(T, 0), T => above(T, 6), T => below(T, 6)];
        labels.push({ set: { u: 'pt:' + id, ow: 'n:' + id }, cands });
      });
      /* future legs: a short grey bundle from the new FDU, xx-xx, no splices */
      P.futures.forEach(x => {
        const id = x.from; if (!pos.has(id) || !isEnd(id)) return;
        const b = boxes.get(id), k = P.futures.filter(y => y.from === id).indexOf(x), xs = pos.get(id).x + BW / 2 - GAP + k * 7, yb = b.top - b.h, L = 9 + k * 4;
        for (let j = 0; j < 3; j++) G.ln(xs + j * GAP, yb, xs + j * GAP, yb - L, 'FOC_FUTURE');
        const t = ['xx-xx · FUTURE FOC' + (x.name ? ' ' + x.name : '') + ' → ' + up(P.label(x.to)), (P.stage === 'built' ? 'NOT YET BUILT' : 'SECOND CABLE, LATER') + ' · NO SPLICES'];
        labels.push({ set: { ow: 'n:' + id }, cands: [0, 4, 8, 14].map(dd => T => T.txs(xs + 3 * GAP + 1, yb - L + 1.4 - dd, t, 1.0, 'NOTE', { gap: 1.5 })).concat([T => T.txs(xs - 1, yb - L - 1.6, t, 1.0, 'NOTE', { gap: 1.5, al: 'r' })]) });
      });
      /* the labels, each where it meets nothing drawn so far */
      const pl = placer(G, true);
      labels.forEach(l => pl.put(l.cands, l.set));
      return G;
    };
    let G = null, left = [];
    for (let it = 0; it < 6; it++) { G = drawAll(96 * (1 + 0.2 * it), 18 + 12 * it, 6 + 2.5 * it); left = clashes(G.p, true); if (!left.length) break; }
    P.detClash = left.length;
    return [block(G, 'SPLICING DETAILS')];
  }
  /* a legend in rows: each item a 12 mm symbol and its words; a row ends before maxW (mm). Returns a block with .rows */
  function flowLegend(items, maxW) {
    const G = new Gfx(); G.tx(0, 6, 'LEGEND:', 2.2, 'LEGEND', { bold: true });
    let x = 0, row = 0;
    items.forEach(([draw, t]) => {
      const w = 15 + textW(t, 2); if (x > 0 && x + w > maxW) { x = 0; row++; }
      const y = -row * 6; draw(G, x, y); G.tx(x + 15, y, t, 2, 'LEGEND', { va: 'm' }); x += w + 9;
    });
    const b = block(G); b.rows = row + 1; return b;
  }
  /* a splice made by this work: a red dot (hollow for a leg spliced only) */
  const newSplice = (G, x, y) => G.ci(x + 6, y, 0.7, 'SPLICE_NEW', { fill: true });
  function accessDetLegend(P, maxW) {
    const has = t => P.pts.some(p => p.type === t), look = k => P.legs.some(l => !l.bad && l.look === k && (k === 'future' || l.routed));
    const spliced = [...P.nodeSp.values()].some(a => a.length);
    const sym = {
      wf: (G, x, y) => G.ln(x, y, x + 12, y, 'FIBER_USED'), sf: (G, x, y) => G.ln(x, y, x + 12, y, 'FIBER'), ns: newSplice,
      rf: (G, x, y) => { G.ln(x, y, x + 12, y, 'FIBER_RESERVED'); G.ci(x + 6, y, 0.7, 'SPLICE_NEW'); }, fu: (G, x, y) => G.ln(x, y, x + 12, y, 'FOC_FUTURE'),
      pc: (G, x, y) => ellipse(G, x + 6, y, 5, 2.6, 'SITE_NEW'), ec: (G, x, y) => ellipse(G, x + 6, y, 5, 2.6, 'SITE_EXIST'),
      no: (G, x, y) => G.rect(x + 3, y - 2.6, 6, 5.2, 'SITE_NEW', { lw: 0.5 }), eo: (G, x, y) => G.rect(x + 3, y - 2.6, 6, 5.2, 'SITE_EXIST', { lw: 0.5 }), dn: (G, x, y) => G.rect(x + 3, y - 2.6, 6, 5.2, 'DNAP_NEW', { lw: 0.5 })
    };
    const items = [['wf', 'WORKING FIBER'], ['sf', 'SPARE FIBER']].concat(spliced ? [['ns', 'NEW SPLICE']] : []).concat(look('spliced') ? [['rf', 'SPLICED ONLY, FOR FUTURE TESTING']] : [])
      .concat([['pc', 'PROPOSED CLOSURE'], ['ec', 'EXISTING CLOSURE'], ['no', 'NEW ODF (FDU PANEL)'], ['eo', 'EXISTING ODF']]).concat(has('dnap') ? [['dn', 'DUMMY NAP (SMALL CELL)']] : [])
      .concat(look('future') ? [['fu', P.stage === 'built' ? 'FUTURE FOC (NOT BUILT)' : 'FUTURE FOC (LATER)']] : []);
    return flowLegend(items.map(([k, t]) => [sym[k], t]), maxW || AREA.x1 - AREA.x0);
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
     All the mains are in the one drawing; build() splits it into a key map and grid sheets when its text would print too small. */
  function bbDetailed(B) {
    const mains = B.mains.filter(mn => mn.lines.length);
    if (!mains.length) { const G = new Gfx(); G.tx(0, 0, 'ADD NAPS TO DRAW THE SPLICING DETAILS.', 3, 'NOTE'); return [block(G)]; }
    return [junaBlock(B, mains, mains, null)];
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
      const k = key(p); if (k === null) { const a = assigned.get(p); orows.push({ p, a, t: 'P' + p + ' F' + (fd.use ? p : a.mn.distUsed[a.j]) }); p++; continue; }
      let q = p; while (q + 1 <= top && key(q + 1) === k) q++; const o = k === 'spare' ? null : assigned.get(p).mn;
      orows.push({ p, q, other: o, t: 'P' + (p === q ? p : p + '-' + q) + (o ? ' > ' + o.name : ' SPARE') }); p = q + 1;
    }
    const lineN = mn => 6 * mn.drops.length + (fd.use ? 2 : 0), widths = sub.map(mn => (lineN(mn) - 1) * GAP), stackH = widths.reduce((a, w) => a + w, 0) + 4 * (sub.length - 1);
    const odfH = orows.length * GAP + 6, xc = 66, rx = 18, ry = Math.max(orows.length * GAP, stackH) / 2 + 7, yc = lowY - 16 - Math.max(odfH, 2 * ry) / 2;
    orows.forEach((r, i) => { r.y = yc + odfH / 2 - 3 - i * GAP; r.live = r.a ? working(r.a.mn.drops[Math.floor(r.a.j / 6)], r.a.j % 6 + 1) : !!r.other; });
    const yOfPort = new Map(orows.filter(r => r.a).map(r => [r.p, r.y]));
    G.u = 'odf'; G.frect(0, yc - odfH / 2, 16, odfH, 'HILITE', { col: WHITE }); G.rect(0, yc - odfH / 2, 16, odfH, 'NAP', { lw: 0.45 });
    G.tx(5, yc, 'PROP. ODF', 1.5, 'TEXT', { al: 'c', va: 'm', rot: 90, bold: true });
    G.txs(8, yc + odfH / 2 + 4, [{ s: B.olt.name.toUpperCase(), o: { bold: true, nm: true } }, String(B.olt.odf).toUpperCase() + ' · ' + top + ' PORTS'], 1.3, 'TEXT', { al: 'c' }); G.u = null;
    orows.forEach(r => G.tx(15.4, r.y, r.t, 0.7, r.live ? 'FIBER_USED' : 'TEXT', { al: 'r', va: 'm' }));
    const elsewhere = groups && groups.length > 1 ? groups.filter(g => g !== sub).flat() : [];
    if (fd.use) {
      orows.forEach(r => { const end = r.a && inSub.has(r.a.mn) ? xc - 6 : xc - 10; G.ln(16, r.y, end, r.y, r.live ? 'FIBER_USED' : 'FIBER'); if (end !== xc - 6) { cap(G, end, r.y); fnum(G, end - 0.4, r.y, 'F' + (r.p === r.q || r.q == null ? r.p : r.p + '-' + r.q), 'r'); } });
      ellipse(G, 31, yc, 1.3, orows.length * GAP / 2 + 2, 'NAP');
      G.txs(31, yc - orows.length * GAP / 2 - 4.5, [{ s: String(fd.name).toUpperCase() + ' · ' + fd.size + 'C', o: { bold: true } }, 'FEEDER DISTRIBUTION CABLE'], 1.1, 'TEXT', { al: 'c' });
      G.u = 'fc'; ellipse(G, xc, yc, rx, ry, 'NAP', { lw: 0.35 });
      G.txs(xc, yc - ry - 2.6, [{ s: String(fd.closure).toUpperCase(), o: { bold: true, nm: true } }].concat(elsewhere.length ? ['ALSO ' + elsewhere.map(m => m.name).join(', ') + ': OTHER SHEET'] : []), 1.3, 'TEXT', { al: 'c' }); G.u = null;
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
        const restF = rest && j === 6 * mn.drops.length ? fmtRanges(seq(1, mn.size).filter(f => !mn.distUsed.includes(f)), 'F') : '';
        if (rest) { pp[0] = [fd.use ? xc + 9 : 20, pp[0][1]]; cap(G, pp[0][0], pp[0][1]); if (restF) fnum(G, pp[0][0] + 0.4, pp[0][1], restF); }
        G.u = 'cab:' + mn.id; G.pl(pp, lay); G.u = null;
        if (fd.use && !rest) { const yo = yOfPort.get(mn.feedF[j]); if (yo != null) { G.pl([[xc - 6, yo], [xc - 3, yo], [xc + 3, pp[0][1]], [xs, pp[0][1]]], lay); G.ci(xc, (yo + pp[0][1]) / 2, 0.3, 'SPLICE_NEW', { fill: true }); fnum(G, xc - 6.4, yo, 'F' + mn.feedF[j], 'r'); fnum(G, xs + 0.4, pp[0][1], 'F' + mn.distUsed[j]); } }
        const ye = pp[pp.length - 1][1];
        if (rest) { G.ln(xD, ye, xD + 3, ye, 'FIBER'); cap(G, xD + 3, ye); if (restF) fnum(G, xD - 0.4, ye, restF, 'r'); continue; }
        const yx = byDrop.get(mn.drops[di]).y - (pos - 1) * GAP;
        G.pl([[xD, ye], [xD + 6, ye], [xD + wD - 6, yx], [xD + wD, yx]], lay); G.ci(xD + wD / 2, (ye + yx) / 2, 0.3, 'SPLICE_NEW', { fill: true });
        fnum(G, xD + 0.4, ye, 'F' + mn.distUsed[j], 'l', lay); fnum(G, xD + wD - 0.4, yx, 'F' + pos, 'r', lay);
      }
      const xl = p.xTurn + p.w / 2 + 2, yl = yEn + p.w / 2 + 1.5;
      G.u = 'cab:' + mn.id;
      G.group(() => {
        G.tx(xl, yl + 2, mn.name + ' · ' + mn.size + 'C DISTRIBUTION CABLE', 1.15, 'TEXT', { bold: true, nm: true });
        G.tx(xl, yl, 'FIBER SPLICING ASSIGNMENT: ' + (fd.use ? fmtRanges(mn.feedF) + ' (' + fd.size + 'C)' : 'ODF ' + fmtRanges(mn.odfP)) + ' > ' + fmtRanges(mn.distUsed) + ' (' + mn.size + 'C)', 1.0, 'TEXT');
      });
      ellipse(G, xD - 14, yEn, 1.1, p.w / 2 + 1.5, 'NAP'); G.u = null;
      const bt = Math.max(rk[0].y + 5, yEn + p.w / 2 + 3), bb = Math.min(rk[rk.length - 1].y - 5 * GAP - 5, yEn - p.w / 2 - 3);
      G.u = 'mc:' + mn.id; G.rect(xD, bb, wD, bt - bb, 'CLOSURE_BOX'); G.tx(xD, bt + 1.2, mn.closure, 1.2, 'TEXT', { bold: true, nm: true }); G.u = null;
    });
    /* each drop: its fibers through the line's N01, the line's next NAPs on a branch below */
    rows.forEach(r => {
      const dr = r.dr, y0 = r.y, fy = k => y0 - (k - 1) * GAP, st = seq(1, 6).map(() => 'spare'), x0 = xD + wD;
      dr.lines.forEach(ln => { st[ln.fDrop - 1] = 'feed'; });
      G.group(() => { G.tx(x0 + 1.5, y0 + 1.5, String(dropNo.get(dr)), 3.2, 'TEXT'); G.tx(x0 + 5.2, y0 + 0.5, 'DROP 6F', 0.85, 'TEXT'); });
      const seg = (x1, x2) => { for (let k = 1; k <= 6; k++) G.ln(x1, fy(k), x2, fy(k), st[k - 1] === 'feed' ? 'FIBER_USED' : 'FIBER'); };
      let prev = x0, x = x0 + 13;
      dr.lines.forEach(ln => {
        seg(prev, x); const nap = ln.naps[0], k0 = ln.fDrop, yo = o => y0 - 10 - (o - 1) * 2;
        napFrame(G, x, y0, nap, BW);
        G.frect(x + 0.15, fy(k0) - 0.5, 1.1, 1, 'HILITE');
        for (let k = 1; k <= 6; k++) { G.tx(x + 0.7, fy(k), String(k), 0.7, 'TEXT', { al: 'c', va: 'm' }); G.tx(x + BW - 0.7, fy(k), String(k), 0.7, 'TEXT', { al: 'c', va: 'm' }); if (k !== k0) G.ln(x + 1.4, fy(k), x + BW - 1.4, fy(k), st[k - 1] === 'feed' ? 'FIBER_USED' : 'FIBER'); }
        G.pl([[x + 1.4, fy(k0)], [x + 2.6, fy(k0)], [x + 2.6, y0 - 13], [x + 5, y0 - 13]], 'FIBER_USED'); G.ci(x + 3.8, y0 - 13, 0.3, 'SPLICE_NEW', { fill: true });
        G.tx(x + 3.2, y0 - 7.6, 'F' + k0 + ' (6F) = F' + ln.fDist + ' (' + r.mn.size + 'C)', 0.65, 'FIBER_USED');
        G.rect(x + 5, y0 - 17, 2.6, 8, 'SPLITTER'); G.tx(x + 6.3, y0 - 13, '1:4', 1, 'SPLITTER', { al: 'c', va: 'm', rot: 90 });
        for (let o = 1; o <= 4; o++) G.tx(x + 8, yo(o) + 0.45, String(o), 0.6, 'TEXT');
        const c8 = j => x + 14.1 + j * 6; split8(G, nap, c8, y0);
        nap.outs.forEach((o, j) => G.pl([[x + 7.6, yo(o)], [c8(j), yo(o)], [c8(j), y0 - 17.5]], 'FIBER_USED'));
        ln.spare.forEach(o => { G.ln(x + 7.6, yo(o), x + 9, yo(o), 'FIBER'); cap(G, x + 9, yo(o)); });
        st[k0 - 1] = 'dead';
        const down = ln.naps.slice(1);
        if (down.length) {
          const ys = y0 - SUBDY, sfy = f => ys - (f - 1) * GAP, live = seq(1, ln.subFibers).map(() => true); let i = 0;
          down.forEach(nn => nn.outs.forEach((o, t) => { const lane = x + 9.6 + i * 0.8, f = nn.via[t]; G.pl([[x + 7.6, yo(o)], [lane, yo(o)], [lane, sfy(f)], [x + 14, sfy(f)]], 'FIBER_USED'); G.ci(lane, sfy(f), 0.3, 'SPLICE_NEW', { fill: true }); i++; }));
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
            nn.via.forEach((f, t) => { const lane = xs2 + 2.6 + t * 0.8, yy = ys - 14.6 - t * 0.8; G.pl([[xs2 + 1.4, sfy(f)], [lane, sfy(f)], [lane, yy], [c82(t), yy], [c82(t), ys - 17.5]], 'FIBER_USED'); G.ci(lane, (sfy(f) + yy) / 2, 0.3, 'SPLICE_NEW', { fill: true }); live[f - 1] = false; });
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
    const bt = y0 + 3.5, bb = y0 - 23.5; G.u = 'nap:' + nap.no + ':' + nap.id;
    G.frect(x, bb, BW, bt - bb, 'HILITE', { col: WHITE }); G.rect(x, bb, BW, bt - bb, 'NAP', { lw: 0.3 });
    G.tx(x, bt + 0.9, nap.id + ' (' + nap.ports + 'P)', 1.15, 'TEXT', { bold: true, nm: true });
    G.tx(x + BW / 2, bb - 1.5, '(' + nap.no + ') ' + (nap.pole || 'NO POLE ID') + (nap.poleType ? ' · ' + nap.poleType : ''), 0.95, 'TEXT', { al: 'c' }); G.u = null;
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

  /* ---------- the grid: a key map, then one sheet per grid cell (a map book: key map + geo grids) ----------
     The detailed drawing is laid under a grid of cells shaped like a sheet's drawing area, small enough that its smallest text (the fiber
     numbers) prints at about model.grid.text mm (1.8). Sheet 1, the KEY MAP, is the whole drawing with the cells that hold something, named
     A-01, B-01 … (columns left to right, rows top to bottom, counted from the first that has a sheet); then one sheet per such cell, in
     reading order: the cell and a small overlap, enlarged to fill the drawing area, a dashed match line where a neighbour has a sheet
     (MATCH LINE · SEE C-01) and a locator in the legend band. The cutting is done here on the primitives, so the SVG, the PDF and the DXF
     show the same: lines are cut at the edge of the cell and its overlap, fills are cut to it, a circle partly out becomes cut lines, and a
     label (its lines together) is kept whole where most of it is (its middle inside the cell and its overlap, its box inside the sheet's
     view) or left off, never cut. A long label across an edge widens that sheet's view a little, so it stays whole on its own cell's sheet.
     Of a few placements of the grid the one with the fewest sheets wins, then the one that cuts the fewest closures and NAPs and leaves
     the fewest sheets without a word on them. A closure, NAP or ODF that a sheet shows without its name gets its name again on that sheet;
     a line that leaves a sheet where no neighbour has a sheet says where it goes on (CONTINUES ON D-01). A drawing that reads at that size
     on one sheet is not split. model.grid = false draws one sheet, as before. */
  const GRID = { text: 1.8, overlap: 0.04, absorb: 0.9 };
  const MAXCELLS = 400;
  const colName = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + i % 26);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const inBox = (q, R) => q[0] >= R[0] && q[0] <= R[2] && q[1] >= R[1] && q[1] <= R[3];
  const boxIn = (b, R, e) => b[0] >= R[0] - e && b[2] <= R[2] + e && b[1] >= R[1] - e && b[3] <= R[3] + e;
  const meet = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const areaOf = r => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const cut2 = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  const pathLen = pts => pts.reduce((a, q, i) => i ? a + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);
  /* the part of the segment a-b inside the box R = [x0, y0, x1, y1], as [t0, t1] (Liang-Barsky), or null */
  function clipT(a, b, R) {
    const dx = b[0] - a[0], dy = b[1] - a[1], P = [-dx, dx, -dy, dy], Q = [a[0] - R[0], R[2] - a[0], a[1] - R[1], R[3] - a[1]]; let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(P[i]) < 1e-12) { if (Q[i] < 0) return null; continue; }
      const r = Q[i] / P[i]; if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t0 <= t1 ? [t0, t1] : null;
  }
  /* does a line (pl) cross the box r */
  const crosses = (p, r) => { const P = p.close ? p.pts.concat([p.pts[0]]) : p.pts; for (let i = 1; i < P.length; i++) { const t = clipT(P[i - 1], P[i], r); if (t && t[1] - t[0] > 1e-9) return true; } return false; };
  /* a polyline cut at R: the pieces inside, in order (one that leaves and comes back gives several; a closed one is cut like an open one).
     exits (optional) collects where a piece meets the edge of R and the line goes on outside: [the point, a point just outside] */
  function clipPath(pts, close, R, exits) {
    const P = close ? pts.concat([pts[0]]) : pts, out = [], ex = []; let cur = null;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], t = clipT(a, b, R);
      if (!t) { if (cur) { out.push(cur); cur = null; } continue; }
      const p = t[0] > 0 ? lerp(a, b, t[0]) : a, q = t[1] < 1 ? lerp(a, b, t[1]) : b, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (cur && t[0] > 0) { out.push(cur); cur = null; }
      if (!cur) cur = [p]; cur.push(q);
      if (exits && t[1] - t[0] > 1e-9) { if (t[0] > 0) ex.push([p, lerp(a, b, Math.max(0, t[0] - 0.4 / L))]); if (t[1] < 1) ex.push([q, lerp(a, b, Math.min(1, t[1] + 0.4 / L))]); }
      if (t[1] < 1) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    /* a closed shape cut open: its last piece runs on into its first */
    if (close && out.length > 1 && out[0][0] === P[0] && out[out.length - 1][out[out.length - 1].length - 1] === P[P.length - 1]) out[0] = out.pop().concat(out[0].slice(1));
    if (exits) exits.push(...ex);
    return out.filter(q => pathLen(q) > 1e-6);
  }
  /* a filled polygon cut to R (Sutherland-Hodgman), or null */
  function clipPoly(pts, R) {
    let poly = pts;
    for (let e = 0; e < 4 && poly.length; e++) {
      const ax = e < 2 ? 0 : 1, lim = [R[0], R[2], R[1], R[3]][e], keep = q => e % 2 ? q[ax] <= lim : q[ax] >= lim, out = [];
      poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], ka = keep(a), kb = keep(b); if (ka) out.push(a); if (ka !== kb) out.push(lerp(a, b, (lim - a[ax]) / (b[ax] - a[ax]))); });
      poly = out;
    }
    const area = poly.reduce((a, q, i) => { const r = poly[(i + 1) % poly.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
    return poly.length >= 3 && Math.abs(area) > 1e-9 ? poly : null;
  }
  const circlePts = (c, r) => seq(0, 32).map(i => [c[0] + r * Math.cos(i * Math.PI / 16), c[1] + r * Math.sin(i * Math.PI / 16)]);
  /* the primitives seen through the window W (cell and overlap); a label (gOf: a text's label, with its box b and middle c) is kept when
     its middle is in W and its box in the view V, or when it is one of the cell's own (home: the texts whose sheet this is, inside V) */
  function clipPrims(prims, W, V, home, gOf, exits) {
    const out = [], inV = b => boxIn(b, V, 1e-6);
    for (const p of prims) {
      if (p.k === 'tx') {
        if (home && home.has(p)) { out.push(p); continue; }
        const t = gOf && gOf.get(p), b = t ? t.b : primBox([p]), c = t ? t.c : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        if (inBox(c, W) && inV(b)) out.push(p); continue;
      }
      if (p.k === 'ci') {
        const [x, y] = p.c, r = p.r;
        if (x - r >= W[0] && x + r <= W[2] && y - r >= W[1] && y + r <= W[3]) { out.push(p); continue; }
        if (x + r < W[0] || x - r > W[2] || y + r < W[1] || y - r > W[3]) continue;
        const base = { lay: p.lay, col: p.col }; if (p.ref) base.ref = p.ref;
        if (p.fill) { const q = clipPoly(circlePts(p.c, r), W); if (q) out.push(Object.assign({ k: 'fl', pts: q }, base)); }
        else clipPath(circlePts(p.c, r), true, W).forEach(q => out.push(Object.assign({ k: 'pl', pts: q, close: false, lw: p.lw }, base)));
        continue;
      }
      if (p.pts.every(q => inBox(q, W))) { out.push(p); continue; }
      if (p.k === 'fl') { const q = clipPoly(p.pts, W); if (q) out.push(Object.assign({}, p, { pts: q })); }
      else clipPath(p.pts, p.close, W, exits).forEach(q => out.push(Object.assign({}, p, { pts: q, close: false })));
    }
    return out;
  }
  /* the drawing's labels (the lines of one label go together: its box b and middle c) and its units (a closure, a NAP, an ODF: the box of
     its shape cb, its name and the name's box nb, the box of the whole wb) */
  function gridParts(prims) {
    const groups = [], gOf = new Map(), byG = new Map(), U = new Map();
    prims.forEach(p => {
      if (p.k === 'tx') { let t = p.g != null ? byG.get(p.g) : null; if (!t) { t = { ps: [] }; groups.push(t); if (p.g != null) byG.set(p.g, t); } t.ps.push(p); gOf.set(p, t); }
      if (p.u != null) { let u = U.get(p.u); if (!u) U.set(p.u, u = { id: p.u, core: [], texts: [], name: null }); if (p.k === 'tx') { u.texts.push(p); if (p.nm && !u.name) u.name = p; } else u.core.push(p); }
    });
    groups.forEach(t => { t.b = primBox(t.ps); t.c = [(t.b[0] + t.b[2]) / 2, (t.b[1] + t.b[3]) / 2]; });
    /* a cable's name is shown again with the other line of its label (its working fibers); a closure's, a NAP's or an ODF's alone */
    const units = [...U.values()].filter(u => u.core.length && u.name).map(u => {
      const cable = /^cab:/.test(u.id), says = cable ? gOf.get(u.name).ps : [u.name];
      return Object.assign(u, { cable, says, cb: primBox(u.core), nb: primBox(says), wb: primBox(u.core.concat(u.texts)) });
    });
    return { groups, gOf, units };
  }
  /* what of the marks lies in the box R, as lists of points (a line's pieces, a fill cut to R, a circle's box): enough to tell whether a
     cell holds something and whether its neighbours' windows show it */
  function cellBits(marks, R) {
    const out = [];
    for (const p of marks) {
      if (p.k === 'ci') { const [x, y] = p.c, r = p.r; if (x + r >= R[0] && x - r <= R[2] && y + r >= R[1] && y - r <= R[3]) out.push([[x - r, y - r], [x + r, y + r]]); continue; }
      if (p.pts.every(q => inBox(q, R))) { out.push(p.pts); continue; }
      if (p.k === 'fl') { const q = clipPoly(p.pts, R); if (q) out.push(q); } else out.push(...clipPath(p.pts, p.close, R));
    }
    return out;
  }
  /* the cells of a grid laid at (x0, y1) (its top left corner): which hold something, where each label belongs (the cell of its middle),
     and how far a sheet's view must reach past the window for its labels to stay whole (mu, of the window) */
  function layGrid(L, cw, ch, cols, rows, x0, y1, ov) {
    const cells = [], idx = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows ? cells[j * cols + i] : null;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const box = [x0 + i * cw, y1 - (j + 1) * ch, x0 + (i + 1) * cw, y1 - j * ch], W = [box[0] - ov * cw, box[1] - ov * ch, box[2] + ov * cw, box[3] + ov * ch];
      cells.push({ i, j, box, W, texts: [], near: [] });
    }
    /* each mark goes to the cells its box meets, then is cut to each */
    const span = (v0, v1, s, n) => [Math.max(0, Math.floor(v0 / s - 1e-9)), Math.min(n - 1, Math.floor(v1 / s + 1e-9))];
    L.marks.forEach(m => { const [i0, i1] = span(m.b[0] - x0, m.b[2] - x0, cw, cols), [j0, j1] = span(y1 - m.b[3], y1 - m.b[1], ch, rows); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * cols + i].near.push(m.p); });
    cells.forEach(c => { c.bits = c.near.length ? cellBits(c.near, c.box) : []; delete c.near; });
    const cl = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v)));
    L.groups.forEach(t => idx(cl((t.c[0] - x0) / cw, cols), cl((y1 - t.c[1]) / ch, rows)).texts.push(t));
    cells.forEach(c => { c.keep = c.texts.length > 0 || c.bits.length > 0; });
    /* how far past its window a cell's view must reach to show a label whole (a fraction of the window), and how far it may (its smallest
       text still prints at 95 % of the target or more). A label wider than 70 % of the window (a very long name) is let widen its own sheet's
       view as far as it needs: the grid is not made finer for it */
    const reach = (c, b) => { const W = c.W, ww = W[2] - W[0], wh = W[3] - W[1]; return Math.max(0, (W[0] - b[0]) / ww, (b[2] - W[2]) / ww, (W[1] - b[1]) / wh, (b[3] - W[3]) / wh); };
    const big = (c, b) => b[2] - b[0] > 0.7 * (c.W[2] - c.W[0]) || b[3] - b[1] > 0.7 * (c.W[3] - c.W[1]);
    cells.forEach(c => {
      c.mu = 0; c.muA = 0; c.texts.forEach(t => { const r = reach(c, t.b); c.mu = Math.max(c.mu, r); if (!big(c, t.b)) c.muA = Math.max(c.muA, r); });
      c.may = Math.max(0, (L.aw * L.minH / ((c.W[2] - c.W[0]) * 0.95 * L.target) - 1) / 2);
    });
    /* a cell whose lines its neighbours' overlaps already show, and whose labels a neighbour can show whole, gets no sheet: its labels go
       to that neighbour (the smallest cells first; a neighbour relied on keeps its sheet) */
    cells.filter(c => c.keep).sort((m, n) => m.bits.length + m.texts.length - n.bits.length - n.texts.length).forEach(c => {
      if (c.pinned) return;
      const nb = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const n = (di || dj) && idx(c.i + di, c.j + dj); if (n && n.keep) nb.push(n); }
      const used = new Set(), moves = [], mu = new Map(nb.map(n => [n, [n.mu, n.muA]]));
      for (const q of c.bits) { const n = nb.find(x => q.every(r => inBox(r, x.W))); if (!n) return; used.add(n); }
      for (const t of c.texts) {
        let pick = null, pm = Infinity; nb.forEach(n => { const r = reach(n, t.b), m = Math.max(mu.get(n)[1], r); if (r <= n.may + 1e-9 && m < pm) { pick = n; pm = m; } });
        if (!pick) return; const r = reach(pick, t.b), o = mu.get(pick); mu.set(pick, [Math.max(o[0], r), Math.max(o[1], r)]); used.add(pick); moves.push([pick, t]);
      }
      c.keep = false; c.to = [...used]; moves.forEach(([n, t]) => n.texts.push(t)); mu.forEach((m, n) => { n.mu = m[0]; n.muA = m[1]; }); used.forEach(n => { n.pinned = true; });
    });
    /* a cell whose drawing lies in a strip along a neighbour's edge (a sliver of a line, a closure's name above it) goes onto that
       neighbour's sheet: the neighbour's window grows to take it in, as long as its smallest text still prints at 85 % of the target or
       more (a sheet of its own for so little would be almost blank) */
    const union = bs => bs.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const tbox = c => union(c.texts.map(t => t.b));
    const fit = N => { const w = N[2] - N[0], h = N[3] - N[1], W2 = Math.max(w, h / L.ar), H2 = W2 * L.ar, cx = (N[0] + N[2]) / 2, cy = (N[1] + N[3]) / 2; return [cx - W2 / 2, cy - H2 / 2, cx + W2 / 2, cy + H2 / 2]; };
    cells.filter(c => c.keep && !c.pinned).sort((m, n) => m.bits.length + m.texts.length - n.bits.length - n.texts.length).forEach(c => {
      if (!c.keep || c.pinned || c.host) return;
      const ct = tbox(c), cb = ct.slice(); let pick = null;
      for (const q of c.bits) for (const r of q) { if (r[0] < cb[0]) cb[0] = r[0]; if (r[1] < cb[1]) cb[1] = r[1]; if (r[0] > cb[2]) cb[2] = r[0]; if (r[1] > cb[3]) cb[3] = r[1]; }
      /* only a strip along one edge can go: a drawing that reaches across the cell cannot */
      const bw = c.box[2] - c.box[0], bh = c.box[3] - c.box[1];
      if (cb[2] - cb[0] > 0.45 * bw && cb[3] - cb[1] > 0.45 * bh) return;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([di, dj]) => {
        const n = idx(c.i + di, c.j + dj); if (!n || !n.keep || n.absorbed) return;
        const W2 = union([n.W, cb]), V = fit(union([W2, tbox(n), ct])), pr = L.minH * L.aw / (V[2] - V[0]);
        if (pr >= L.absorb * L.target - 1e-9 && (!pick || pr > pick.pr)) pick = { n, W2, V, pr };
      });
      if (!pick) return;
      const n = pick.n; c.keep = false; c.absorbed = true; c.to = [n]; n.texts.push(...c.texts); n.W = pick.W2; n.Vfix = pick.V; n.host = true; n.pinned = true;
    });
    cells.forEach(c => { delete c.bits; });
    /* the cells are counted from the first column and row that have a sheet */
    const kept = cells.filter(c => c.keep), i0 = Math.min(...kept.map(c => c.i)), j0 = Math.min(...kept.map(c => c.j));
    const nc = Math.max(...kept.map(c => c.i)) - i0 + 1, nr = Math.max(...kept.map(c => c.j)) - j0 + 1;
    cells.forEach(c => { c.i -= i0; c.j -= j0; });
    kept.forEach(c => {
      const W = c.W, ww = W[2] - W[0], wh = W[3] - W[1], mu = c.mu; c.name = colName(c.i) + '-' + pad(c.j + 1, 2);
      c.V = c.Vfix || [W[0] - mu * ww, W[1] - mu * wh, W[2] + mu * ww, W[3] + mu * wh];
    });
    const g = { cols: nc, rows: nr, cw, ch, x0: x0 + i0 * cw, y1: y1 - j0 * ch, ov, cells, kept, at: (i, j) => idx(i + i0, j + j0) };
    /* how it reads: the smallest text printed (but for very long labels), the closures and NAPs not whole on any sheet, the sheets
       without a word on them */
    const plain = kept.filter(c => !c.host);
    g.print = L.minH * Math.min(...(plain.length ? plain : kept).map(c => L.aw / (c.host ? c.V[2] - c.V[0] : (c.W[2] - c.W[0]) * (1 + 2 * c.muA))));
    g.cuts = L.units.filter(u => !u.cable && !kept.some(c => boxIn(u.wb, c.W, 1e-9))).length;
    g.bare = kept.filter(c => !c.texts.length).length; g.hosts = kept.length - plain.length;
    return g;
  }
  /* the grid over a block (its top left corner at 0, 0) for the drawing area A, or null when the drawing reads on one sheet (its smallest
     text at 95 % of the target or more, enlarged to fit). Cells as large as the target text allows; of placements fitted to the drawing
     or shifted in the room left over, the one with the fewest sheets wins, then the one that cuts the fewest units and leaves the fewest
     bare sheets, then the one whose smallest printed text is largest. Bounded: at most MAXCELLS cells (a larger target text is brought
     down to fit) and a few passes. */
  function gridPlan(b, A, opt, parts, probe) {
    const aw = A.x1 - A.x0, ah = A.y1 - A.y0, ar = ah / aw, ov = opt.overlap, txt = b.prims.filter(p => p.k === 'tx');
    const minH = txt.length ? Math.min(...txt.map(p => p.h)) : 0; let target = +opt.text;
    const one = () => minH * Math.min(aw / b.w, ah / b.h) >= 0.95 * target - 1e-9;
    if (!(target > 0) || !(minH > 0) || one()) return null;
    if (probe) { const cw = aw * minH / target / (1 + 2 * ov); return { cols: Math.max(1, Math.ceil(b.w / cw - 1e-6)), rows: Math.max(1, Math.ceil(b.h / (cw * ar) - 1e-6)) }; }
    const sizeAt = (t, q) => { const cw = aw * minH / t / (1 + 2 * ov) * q, ch = cw * ar; return { cw, ch, cols: Math.max(1, Math.ceil(b.w / cw - 1e-6)), rows: Math.max(1, Math.ceil(b.h / ch - 1e-6)) }; };
    for (let s = sizeAt(target, 1), n = 0; s.cols * s.rows > MAXCELLS && n < 40; s = sizeAt(target, 1), n++) target *= 0.95 * Math.sqrt(MAXCELLS / (s.cols * s.rows));
    if (one()) return null;
    const L = { aw, ar, minH, target, absorb: opt.absorb > 0 ? Math.min(1, +opt.absorb) : 2, groups: parts.groups, units: parts.units,
      /* what makes a cell worth a sheet: anything drawn but a white backing */
      marks: b.prims.filter(p => p.k !== 'tx' && !(p.k === 'fl' && p.col && p.col.rgb === '#ffffff')).map(p => ({ p, b: primBox([p]) })) };
    const better = (g, t) => g.kept.length - t.kept.length || g.cuts + g.bare - t.cuts - t.bare || g.hosts - t.hosts || t.print - g.print;
    /* the shifts tried: finer for a few cells, coarser for many (each placement lays the whole grid) */
    const steps = (room, n) => room > 1e-6 ? seq(0, n + 1).map(i => i / n) : [0.5];
    let q = 1, best = null, last = null, prev = 0;
    for (let it = 0; it < 6 && !best; it++) {
      const { cw, ch, cols, rows } = sizeAt(target, q); if (cols * rows > MAXCELLS) break;
      const f = Math.max(b.w / (cols * cw), b.h / (rows * ch)), fine = cols * rows <= 24 ? 8 : cols * rows <= 60 ? 4 : 2; let top = null, most = 0;
      for (const s of f < 1 - 1e-6 ? [1, f] : [1]) {
        const w = cw * s, h = ch * s;
        for (const px of steps(cols * w - b.w, fine)) for (const py of steps(rows * h - b.h, fine)) {
          const g = layGrid(L, w, h, cols, rows, (b.w - cols * w) * px, (rows * h - b.h) * (1 - py), ov); most = Math.max(most, g.print);
          if (!last || g.print > last.print + 1e-9) last = g;
          if (g.print >= 0.95 * target - 1e-6 && (!top || better(g, top) < 0)) top = g;
        }
      }
      if (top) best = top;
      else { if (most <= prev * 1.002) break; prev = most; q *= Math.max(0.8, Math.min(0.97, most / target)); }
    }
    const g = best || last; g.minH = minH; g.target = target; return g;
  }
  /* the locator's size: cells shaped like the drawing area, in the legend band (ex: how much the band must grow for it) */
  function locSize(g, A) {
    const ar = (A.x1 - A.x0) / (A.y1 - A.y0), ex = Math.max(0, Math.ceil(g.rows * 3.4 - 14)), H = 14 + ex;
    let ch = Math.min(7, H / g.rows), cw = ch * ar; if (cw * g.cols > 90) { cw = 90 / g.cols; ch = cw / ar; }
    return { cw, ch, w: cw * g.cols + 26, ex };
  }
  /* the locator: the grid's cells as boxes, this one filled; each a tap target */
  function locator(G, g, cur, L, x1, yMid, cells) {
    const X0 = x1 - g.cols * L.cw, Y1 = yMid + g.rows * L.ch / 2;
    G.txs(X0 - 3, yMid + 1.6, [{ s: 'KEY MAP', o: { bold: true } }, 'THIS SHEET ' + cur.name], 1.8, 'LEGEND', { al: 'r', gap: 1.6 });
    g.kept.forEach(c => {
      const x = X0 + c.i * L.cw, y = Y1 - (c.j + 1) * L.ch, on = c === cur;
      if (on) G.frect(x, y, L.cw, L.ch, 'HILITE');
      G.rect(x, y, L.cw, L.ch, 'LEGEND', { lw: on ? 0.35 : 0.15 });
      const h = Math.min(0.42 * L.ch, (L.cw - 0.8) / textW(c.name, 1, on)); if (h >= 0.9) G.tx(x + L.cw / 2, y + L.ch / 2, c.name, h, 'LEGEND', { al: 'c', va: 'm', bold: on });
      if (!on) cells.push({ name: c.name, box: [x, y, x + L.cw, y + L.ch] });
    });
  }
  /* what covering a box costs on a sheet (obst: its primitives and their boxes): a text most, then a splice dot, a line crossed, a fill */
  function costIn(obst) {
    return r => {
      let s = 0;
      for (const o of obst) {
        if (!meet(o.b, r)) continue; const p = o.p;
        if (p.k === 'tx') s += 1000 + 100 * areaOf(cut2(o.b, r)); else if (p.k === 'ci') s += 300; else if (p.k === 'fl') s += p.col && p.col.rgb === '#ffffff' ? 0 : 3; else if (crosses(p, r)) s += 40;
      }
      return s;
    };
  }
  /* a mark beside a cell edge, in the overlap band (what is there is on the neighbour's sheet too), with an arrow out: MATCH LINE · SEE C-01,
     or CONTINUES ON D-01 (forms: the long words first). Along the edge where it covers the least (cost), near u (from the edge's middle).
     Its tap target fills the band (band: its width) a finger's breadth along the edge each side, so a phone can open that sheet */
  function edgeMark(G, side, X, Y, len, forms, name, cells, cost, u, obst, band) {
    const h = 2, v = side === 'L' || side === 'R', out = side === 'R' || side === 'T' ? 1 : -1, mid = 1.4 + 0.5 * h + 0.6; u = u || 0;
    let best = null;
    forms.forEach((s, fi) => {
      const L = textW(s, h, true); if (L + 12 > len && fi < forms.length - 1) return;
      const ua = L / 2 + 0.6, room = Math.max(0, len / 2 - L / 2 - 6), room2 = Math.max(room, len / 2 - L / 2 - 2.5);
      const boxAt = u0 => { const P = (a, w) => v ? [X + out * w, Y + u0 + a] : [X + u0 + a, Y + out * w], c1 = P(-2 - L / 2 - 0.8, 0.9), c2 = P(ua + 2.2, mid + 2.6); return [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1])]; };
      const us = [u].concat(seq(1, 16).flatMap(k => [u - k * room / 8, u + k * room / 8])).filter(x => Math.abs(x) <= room + 1e-9);
      if (!us.length) us.push(Math.max(-room, Math.min(room, u)));
      /* nearer the corners only when every place along the middle covers a text */
      if (room2 > room + 1e-9) seq(0, 4).forEach(k => { const x = room + (room2 - room) * (k + 1) / 4; us.push(-x, x); });
      us.forEach(u0 => { const c = cost(boxAt(u0)) + fi * 1.5 + Math.abs(u0 - u) * 0.004 + (Math.abs(u0) > room + 1e-9 ? 50 : 0); if (!best || c < best.c) best = { c, s, L, ua, u0, box: boxAt(u0) }; });
    });
    const { s, ua, u0, box } = best, P = (a, w) => v ? [X + out * w, Y + u0 + a] : [X + u0 + a, Y + out * w];
    G.frect(box[0], box[1], box[2] - box[0], box[3] - box[1], 'HILITE', { col: WHITE });
    const c = P(-2, mid); G.tx(c[0], c[1], s, h, 'MATCH', { al: 'c', va: 'm', bold: true, rot: v ? 90 : 0 });
    G.fl([P(ua - 1.3, mid - 1.1), P(ua, mid + 2.2), P(ua + 1.3, mid - 1.1)], 'MATCH');
    const lo = (v ? Y : X) - len / 2, hi = (v ? Y : X) + len / 2, a0 = Math.max(lo, (v ? box[1] : box[0]) - 12), a1 = Math.min(hi, (v ? box[3] : box[2]) + 12), e = v ? X : Y, f = e + out * Math.max(band || 0, mid + 2.6);
    cells.push({ name, box: v ? [Math.min(e, f), a0, Math.max(e, f), a1] : [a0, Math.min(e, f), a1, Math.max(e, f)] });
    if (obst) obst.push({ p: { k: 'tx' }, b: box });
  }
  /* a dashed match line from a to b (along x or y), broken where it would run through a text (boxes) */
  function matchLine(G, a, b, boxes) {
    const v = Math.abs(a[0] - b[0]) < 1e-9, k = v ? 1 : 0, o = v ? 0 : 1, at = a[o], lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]), gaps = [];
    boxes.forEach(r => { if (r[o] - 0.5 < at && r[o + 2] + 0.5 > at && r[k + 2] > lo && r[k] < hi) gaps.push([r[k] - 0.8, r[k + 2] + 0.8]); });
    gaps.sort((m, n) => m[0] - n[0]); let s = lo;
    const seg = (p, q) => { if (q - p > 0.3) G.ln(v ? at : p, v ? p : at, v ? at : q, v ? q : at, 'MATCH'); };
    gaps.forEach(([p, q]) => { seg(s, Math.min(p, hi)); s = Math.max(s, q); }); seg(s, hi);
  }
  /* a closure, NAP or ODF that this sheet shows (its middle, or a fifth of its shape or more) but whose name is not on it: its name again;
     a cable that runs a good way across this sheet (a third of the cell or more) without its label: its label again (its name and its
     working fibers). Where it covers the least inside the window, on a white backing (raw: what the sheet shows; shown: its texts) */
  function namesAgain(raw, units, c, shown) {
    const W = c.W, out = [], m = 0.3, obst = raw.map(p => ({ p, b: primBox([p]) })), cost = costIn(obst), cw = c.box[2] - c.box[0];
    units.forEach(u => {
      if (shown.has(u.name)) return;
      const cb = u.cb, mid = [(cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2], pieces = [];
      if (u.cable) {
        u.core.forEach(p => { if (p.k === 'pl') pieces.push(...clipPath(p.pts, p.close, W)); });
        if (!pieces.some(q => pathLen(q.map(r => [Math.min(c.box[2], Math.max(c.box[0], r[0])), Math.min(c.box[3], Math.max(c.box[1], r[1]))])) >= cw / 3)) return;
      } else if (!inBox(mid, c.box) && areaOf(cut2(cb, c.box)) < 0.2 * areaOf(cb)) return;
      /* the words as drawn, and turned to read up along a run that goes up or down (each about its first line's anchor) */
      const o = u.says[0].p, up = u.says.map(q => Object.assign({}, q, { p: [o[0] - (q.p[1] - o[1]), o[1] + (q.p[0] - o[0])], rot: 90 }));
      const tpl = [{ ps: u.says, b: u.nb }, { ps: up, b: primBox(up) }], at = [];
      if (u.cable) {
        /* above or below a straight run of the cable, at its start, middle or end; along a run that goes up or down, on either side */
        const [w, h] = [u.nb[2] - u.nb[0], u.nb[3] - u.nb[1]], [wv, hv] = [tpl[1].b[2] - tpl[1].b[0], tpl[1].b[3] - tpl[1].b[1]];
        pieces.forEach(q => q.forEach((r, i) => {
          const a = q[i - 1]; if (!a) return;
          if (Math.abs(a[1] - r[1]) < 1e-6 && Math.abs(r[0] - a[0]) >= w + 2) { const x0 = Math.min(a[0], r[0]), x1 = Math.max(a[0], r[0]); [x0 + 1, (x0 + x1 - w) / 2, x1 - w - 1].forEach(x => at.push([0, x, r[1] + 0.5], [0, x, r[1] - 0.5 - h])); }
          if (Math.abs(a[0] - r[0]) < 1e-6 && Math.abs(r[1] - a[1]) >= hv + 2) { const y0 = Math.min(a[1], r[1]), y1 = Math.max(a[1], r[1]); [y0 + 1, (y0 + y1 - hv) / 2, y1 - hv - 1].forEach(y => at.push([1, r[0] + 0.5, y], [1, r[0] - 0.5 - wv, y])); }
          /* beside a shorter run, the words as drawn (less good: they read across it) */
          if (Math.abs(a[0] - r[0]) < 1e-6 && Math.abs(r[1] - a[1]) >= h + 2) { const y0 = Math.min(a[1], r[1]), y1 = Math.max(a[1], r[1]); [y0 + 1, (y0 + y1 - h) / 2, y1 - h - 1].forEach(y => at.push([0, r[0] + 0.6, y, 3], [0, r[0] - 0.6 - w, y, 3], [0, c.box[0] + 0.4, y, 8], [0, c.box[2] - w - 0.4, y, 8])); }
        }));
      } else {
        const nb = u.nb, w = nb[2] - nb[0], h = nb[3] - nb[1], vis = cut2(cb, W);
        [nb[0], vis[0] + 0.4, vis[2] - w - 0.4, (vis[0] + vis[2] - w) / 2].forEach(x => [nb[1], vis[3] + 0.5, vis[3] - h - 0.6, vis[1] - h - 0.5, vis[1] + 0.6].forEach(y => at.push([0, x, y])));
      }
      let best = null;
      at.forEach(([t, x, y, pen]) => {
        const B = tpl[t].b, w = B[2] - B[0], h = B[3] - B[1]; if (w > W[2] - W[0] - 2 * m || h > W[3] - W[1] - 2 * m) return;
        const r = [Math.min(W[2] - m - w, Math.max(W[0] + m, x)), Math.min(W[3] - m - h, Math.max(W[1] + m, y))]; r.push(r[0] + w, r[1] + h);
        const s = cost([r[0] - 0.2, r[1] - 0.2, r[2] + 0.2, r[3] + 0.2]) + 0.05 * Math.hypot(r[0] - u.nb[0], r[1] - u.nb[1]) + (boxIn(r, c.box, 1e-9) ? 0 : 5) + t * 0.5 + (pen || 0); if (!best || s < best.s) best = { s, r, t };
      });
      /* a label again only where it hides no text and no line */
      if (!best || best.s >= 40) return;
      const r = best.r, T = tpl[best.t], pd = 0.15, d = [r[0] - T.b[0], r[1] - T.b[1]];
      out.push({ k: 'fl', pts: [[r[0] - pd, r[1] - pd], [r[2] + pd, r[1] - pd], [r[2] + pd, r[3] + pd], [r[0] - pd, r[3] + pd]], lay: 'HILITE', col: WHITE });
      T.ps.forEach(q => { const t = Object.assign({}, q, { p: [q.p[0] + d[0], q.p[1] + d[1]], again: 1 }); delete t.g; delete t.u; delete t.nm; out.push(t); });
      obst.push({ p: { k: 'tx' }, b: r });
    });
    return out;
  }
  /* the detailed sheets of one block: one sheet as before, or the key map and a sheet per grid cell */
  function detailedSheets(b, head, legOf, opt) {
    const FW = AREA.x1 - AREA.x0, areaOf2 = ex => ({ x0: AREA.x0, y0: AREA.y0 + 16 + ex, x1: AREA.x1, y1: AREA.y1 }), parts = gridParts(b.prims);
    let leg = legOf(FW), ex = 6 * (leg.rows - 1), A = areaOf2(ex), g = gridPlan(b, A, opt, parts, true);
    /* a grid: the legend leaves room for the locator (its size guessed first, so the grid is mostly laid once) */
    if (g) { const L0 = locSize(g, A); leg = legOf(FW - L0.w - 8); ex = Math.max(6 * (leg.rows - 1), L0.ex); A = areaOf2(ex); g = gridPlan(b, A, opt, parts); }
    /* one sheet: the drawing as large as the target text needs (1.6 times at least, as before), or as fits */
    const single = () => {
      const t = +opt.text, mh = Math.min(...b.prims.filter(p => p.k === 'tx').map(p => p.h)), grow = t > 0 && mh > 0 ? Math.max(1.6, t / mh) : 1.6;
      leg = legOf(FW); ex = 6 * (leg.rows - 1); A = areaOf2(ex);
      const pages = paginate([b], { area: A, center: true, grow, band: 2 });
      return { sheets: sheetsOf(pages, head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7 + ex)).map((sh, i) => Object.assign(sh, { prims: refGrid(A, 3, 2).concat(sh.prims), label: 'Splicing details' + (pages.length > 1 ? ' ' + (i + 1) : '') })) };
    };
    if (!g || g.kept.length < 2) return single();
    /* the legend leaves room for the locator; a taller legend or locator pushes the drawing up, and the grid is laid again */
    let L = null;
    for (let t = 0; t < 4; t++) {
      L = locSize(g, A); leg = legOf(FW - L.w - 8);
      const ex2 = Math.max(6 * (leg.rows - 1), L.ex); if (ex2 === ex) break;
      ex = ex2; A = areaOf2(ex); g = gridPlan(b, A, opt, parts) || g;
    }
    if (g.kept.length < 2) return single();
    L = locSize(g, A);
    const aw = A.x1 - A.x0, ah = A.y1 - A.y0, legPrims = () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7 + 6 * (leg.rows - 1)), sheets = [];
    /* the key map: the whole drawing and its grid fitted to the drawing area */
    {
      const GE = [Math.min(g.x0, 0), Math.min(g.y1 - g.rows * g.ch, -b.h), Math.max(g.x0 + g.cols * g.cw, b.w), Math.max(g.y1, 0)], k = Math.min(aw / (GE[2] - GE[0]), ah / (GE[3] - GE[1]));
      const dx = A.x0 + (aw - (GE[2] - GE[0]) * k) / 2 - GE[0] * k, dy = A.y0 + (ah - (GE[3] - GE[1]) * k) / 2 - GE[1] * k, M = (x, y) => [x * k + dx, y * k + dy];
      const G = new Gfx(), light = { rgb: '#c4c9cf', aci: 9 }, cells = [], seen = new Set(), cwP = g.cw * k, chP = g.ch * k;
      /* drawn small, its lines thinner so a bundle of fibers stays a bundle */
      const all = xf(b.prims, k, dx, dy).map(p => k >= 0.8 || p.k === 'tx' || p.k === 'fl' ? p : Object.assign(p, { lw: Math.max(0.1, lwOf(p) * k * 1.25) }));
      /* each cell's name, large and light, where the drawing hides it least: a white box (a NAP, an ODF) most, then texts, then lines
         across it; smaller where the cell is full */
      const kb = all.map(p => ({ p, b: primBox([p]) })), cost = (r, near) => {
        let s = 0, n = 0; for (const o of near) { if (!meet(o.b, r)) continue; const p = o.p, a = areaOf(cut2(o.b, r)); if (p.k === 'fl') s += p.col && p.col.rgb === '#ffffff' ? 10 * a : a; else if (p.k === 'tx') s += a; else if (p.k === 'pl' && crosses(p, r)) n++; }
        return s / areaOf(r) + 0.02 * n;
      };
      g.kept.forEach(c => {
        const [x0, y0] = M(c.box[0], c.box[1]), [x1, y1] = M(c.box[2], c.box[3]), H = Math.min(13, 0.32 * chP, 0.7 * cwP / textW(c.name, 1)), near = kb.filter(o => meet(o.b, [x0, y0, x1, y1]));
        let best = null;
        [1, 0.75, 0.55].forEach((f, z) => { const h = H * f, w = textW(c.name, h); [0.5, 0.25, 0.75, 0.1, 0.9].forEach((fy, a) => [0.5, 0.3, 0.7, 0.15, 0.85].forEach((fx, e) => {
          const cx = x0 + (x1 - x0) * fx, cy = y0 + (y1 - y0) * fy, r = [cx - w / 2, cy - 0.55 * h, cx + w / 2, cy + 0.55 * h];
          if (r[0] < x0 || r[2] > x1 || r[1] < y0 || r[3] > y1) return;
          const s = cost(r, near) + 0.25 * z + 0.03 * (a + e); if (!best || s < best.s) best = { s, cx, cy, h };
        })); });
        if (!best) best = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: H };
        G.tx(best.cx, best.cy, c.name, best.h, 'GRID', { al: 'c', va: 'm', col: light });
        cells.push({ name: c.name, box: [x0, y0, x1, y1] });
      });
      /* a cell with a little drawing but no sheet of its own (its drawing is on a neighbour's sheet): its outline and SEE B-02 */
      const others = g.cells.filter(c => c.absorbed && c.to[0].keep);
      others.forEach(c => {
        const [x0, y0] = M(c.box[0], c.box[1]), [x1, y1] = M(c.box[2], c.box[3]), to = c.to.find(n => n.keep) || c.to[0], s = 'SEE ' + to.name, h = Math.min(4, 0.18 * chP, 0.6 * cwP / textW(s, 1));
        G.tx((x0 + x1) / 2, y1 - 1.5 * h, s, h, 'GRID', { al: 'c', va: 'm', col: light });
        cells.push({ name: to.name, box: [x0, y0, x1, y1] });
      });
      g.kept.concat(others).forEach(c => {
        const [x0, y0] = M(c.box[0], c.box[1]), [x1, y1] = M(c.box[2], c.box[3]);
        [['v', c.i, c.j, x0, y0, x0, y1], ['v', c.i + 1, c.j, x1, y0, x1, y1], ['h', c.i, c.j, x0, y1, x1, y1], ['h', c.i, c.j + 1, x0, y0, x1, y0]].forEach(([t, i, j, a, bq, cq, d]) => {
          const key = t + i + ':' + j; if (seen.has(key)) return; seen.add(key); G.ln(a, bq, cq, d, 'GRID');
        });
      });
      sheets.push({ head: head + ' · KEY MAP', label: 'Key map', prims: G.p.concat(all, legPrims()), body: [0, G.p.length + all.length], cells, keymap: true, area: [A.x0, A.y0, A.x1, A.y1], view: { k, dx, dy } });
    }
    /* a sheet per cell: the cell and its overlap (and the view's margin for long labels) enlarged to fill the drawing area */
    g.kept.forEach(c => {
      const V = c.V, k = aw / (V[2] - V[0]), dx = A.x0 - V[0] * k, dy = A.y0 - V[1] * k, M = (x, y) => [x * k + dx, y * k + dy];
      const exits = [], raw = clipPrims(b.prims, c.W, V, new Set(c.texts.flatMap(t => t.ps)), parts.gOf, exits), shown = new Set(raw.filter(p => p.k === 'tx'));
      const body = xf(raw.concat(namesAgain(raw, parts.units, c, shown)), k, dx, dy), G = new Gfx(), cells = [];
      const [wx0, wy0] = M(c.W[0], c.W[1]), [wx1, wy1] = M(c.W[2], c.W[3]), [cx0, cy0] = M(c.box[0], c.box[1]), [cx1, cy1] = M(c.box[2], c.box[3]);
      const nb = { L: g.at(c.i - 1, c.j), R: g.at(c.i + 1, c.j), T: g.at(c.i, c.j - 1), B: g.at(c.i, c.j + 1) }, obst = body.map(p => ({ p, b: primBox([p]) })), cost = costIn(obst);
      const txb = obst.filter(o => o.p.k === 'tx').map(o => o.b), band = { L: cx0 - wx0, R: wx1 - cx1, B: cy0 - wy0, T: wy1 - cy1 };
      Object.keys(nb).forEach(sd => {
        const n = nb[sd]; if (!n || !n.keep) return;
        if (sd === 'L' || sd === 'R') { const X = sd === 'L' ? cx0 : cx1; matchLine(G, [X, wy0], [X, wy1], txb); edgeMark(G, sd, X, (cy0 + cy1) / 2, cy1 - cy0, ['MATCH LINE · SEE ' + n.name, 'SEE ' + n.name], n.name, cells, cost, 0, obst, band[sd]); }
        else { const Y = sd === 'B' ? cy0 : cy1; matchLine(G, [wx0, Y], [wx1, Y], txb); edgeMark(G, sd, (cx0 + cx1) / 2, Y, cx1 - cx0, ['MATCH LINE · SEE ' + n.name, 'SEE ' + n.name], n.name, cells, cost, 0, obst, band[sd]); }
      });
      /* lines that leave the window where no neighbour has a sheet (that cell's drawing is on another sheet): where they go on */
      const e = 1e-6, sideOf = q => Math.abs(q[0] - c.W[0]) < e ? 'L' : Math.abs(q[0] - c.W[2]) < e ? 'R' : Math.abs(q[1] - c.W[1]) < e ? 'B' : Math.abs(q[1] - c.W[3]) < e ? 'T' : null, on = new Map();
      exits.forEach(([q, nx]) => {
        const sd = sideOf(q); if (!sd || nb[sd] && nb[sd].keep) return;
        const to = g.kept.filter(x => x !== c && inBox(nx, x.box)).concat(g.kept.filter(x => x !== c && inBox(nx, x.W)))[0]; if (!to) return;
        const key = sd + to.name; if (!on.has(key)) on.set(key, { sd, to, at: [] }); on.get(key).at.push(sd === 'L' || sd === 'R' ? q[1] : q[0]);
      });
      on.forEach(({ sd, to, at }) => {
        const v = sd === 'L' || sd === 'R', u = at.reduce((a, x) => a + x, 0) / at.length;
        if (v) { const X = sd === 'L' ? cx0 : cx1, Y = (cy0 + cy1) / 2; edgeMark(G, sd, X, Y, cy1 - cy0, ['CONTINUES ON ' + to.name, 'CONT. ON ' + to.name], to.name, cells, cost, u * k + dy - Y, obst, band[sd]); }
        else { const Y = sd === 'B' ? cy0 : cy1, X = (cx0 + cx1) / 2; edgeMark(G, sd, X, Y, cx1 - cx0, ['CONTINUES ON ' + to.name, 'CONT. ON ' + to.name], to.name, cells, cost, u * k + dx - X, obst, band[sd]); }
      });
      locator(G, g, c, L, AREA.x1, A.y0 - 2 - (14 + L.ex) / 2, cells);
      sheets.push({ head: head + ' · GRID ' + c.name, label: c.name, prims: body.concat(G.p, legPrims()), body: [0, body.length], cells, cell: c.name, area: [A.x0, A.y0, A.x1, A.y1], view: { k, dx, dy } });
    });
    return { sheets, grid: { cols: g.cols, rows: g.rows, cw: g.cw, ch: g.ch, x0: g.x0, y1: g.y1, overlap: g.ov, minText: g.minH, prims: b.prims,
      cells: g.kept.map(c => ({ name: c.name, i: c.i, j: c.j, box: c.box, win: c.W, view: c.V, margin: c.mu })) } };
  }

  /* the broadband detailed legend: the SLD's items and the red splice dot, in rows */
  function bbDetLegend(maxW) {
    return flowLegend([
      [(G, x, y) => G.ln(x, y, x + 12, y, 'CABLE'), 'DISTRIBUTION / 6F DROP CABLE'], [(G, x, y) => G.rect(x + 3, y - 3, 6, 6, 'CLOSURE_BOX'), 'CLOSURE'],
      [(G, x, y) => { G.ci(x + 6, y, 2.3, 'NAP_SYM'); G.tx(x + 6, y, '1:4', 1.3, 'NAP_SYM', { al: 'c', va: 'm', bold: true }); }, 'LINE SPLITTER (LCP) IN N01'],
      [(G, x, y) => G.pl([[x + 4, y - 2], [x + 7.6, y], [x + 4, y + 2]], 'NAP_SYM', { close: true }), '1:8 SPLITTER (8 PORTS)'],
      [(G, x, y) => G.ln(x, y, x + 12, y, 'FIBER_USED'), 'WORKING FIBER'], [(G, x, y) => G.ln(x, y, x + 12, y, 'FIBER'), 'SPARE FIBER'], [newSplice, 'NEW SPLICE']
    ], maxW || AREA.x1 - AREA.x0);
  }

  /* ---------- build: the sheets of a drawing ---------- */
  const HEADS = { access: { sld: 'SINGLE LINE DIAGRAM', detailed: 'SPLICING DETAILS' }, broadband: { sld: 'SPLICING SINGLE LINE DIAGRAM', detailed: 'SPLICING DETAILS' } };
  function build(model, views) {
    views = [].concat(views || 'sld'); const kind = model.kind === 'broadband' ? 'broadband' : 'access', list = [], grids = [];
    const gopt = Object.assign({}, GRID, model.grid === false ? { text: 0 } : model.grid);
    const plan = kind === 'access' ? accessPlan(model) : bbPlan(model);
    for (const v of views) {
      const head = HEADS[kind][v === 'detailed' ? 'detailed' : 'sld'];
      if (kind === 'access') {
        if (v === 'detailed') {
          const r = detailedSheets(accessDetailed(plan)[0], head, w => accessDetLegend(plan, w), gopt);
          if (r.grid) grids.push(Object.assign(r.grid, { first: list.length })); list.push(...r.sheets);
        } else {
          /* the legend in columns at the left, the CONNECTIONS box (one row per leg) at the right, the diagram above them */
          const any = plan.legs.some(l => !l.bad), leg = accessLegend(plan, any ? 3 : 0), con = any ? accessConnections(plan, Math.max(150, Math.min(250, AREA.x1 - AREA.x0 - leg.w - 14))) : null;
          if (!con) list.push(...sheetsOf(paginate([accessSLD(plan)], { area: { x0: AREA.x0, y0: AREA.y0 + 20, x1: AREA.x1, y1: AREA.y1 }, center: true, grow: 1.45 }), head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 13)));
          else { const top = AREA.y0 + 1 + Math.max(leg.h, con.h); list.push(...sheetsOf(paginate([accessSLD(plan)], { area: { x0: AREA.x0, y0: top + 7, x1: AREA.x1, y1: AREA.y1 }, center: true, grow: 1.45 }), head, () => xf(leg.prims, 1, AREA.x0, top).concat(xf(con.prims, 1, AREA.x1 - con.w, top)))); }
        }
      } else {
        const leg = bbLegend();
        if (v === 'detailed') { const r = detailedSheets(bbDetailed(plan)[0], head, bbDetLegend, gopt); if (r.grid) grids.push(Object.assign(r.grid, { first: list.length })); list.push(...r.sheets); }
        else list.push(...sheetsOf(paginate([bbSLD(plan)], { area: { x0: AREA.x0, y0: AREA.y0 + 16, x1: AREA.x1, y1: AREA.y1 }, center: true, grow: 1.45 }), head, () => xf(leg.prims, 1, AREA.x0, AREA.y0 + 7)));
      }
    }
    plan.warnings = [...new Set(plan.warn)];
    /* the SLD sheets' names for a sheet list (the detailed ones are named where they are made) */
    const nSld = list.filter(sh => !sh.label).length; let k = 0;
    list.forEach(sh => { if (!sh.label) sh.label = 'Single line' + (nSld > 1 ? ' ' + ++k : ''); });
    return { sheets: finishSheets(list, model.title), plan, warnings: plan.warnings, grids };
  }
  /* the assignment alone, without drawing (fast: for live answers such as "This gives F25-30"): plan.legs, plan.fdus, plan.cableInfo, plan.warnings */
  function assign(model) { model = model || {}; return model.kind === 'broadband' ? bbPlan(model) : accessPlan(model); }

  /* ---------- writers ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rgbOf = p => (p.col && p.col.rgb) || layerRGB(p.lay);
  const lwOf = p => p.lw || (LAYERS[p.lay] || LAYERS.TEXT)[2];
  const dashOf = p => !!(LAYERS[p.lay] || [])[3];
  /* opts.hit (mm): under each tap target, invisible lines that wide and boxes behind its words, so a finger finds it */
  function toSVG(sheet, opts) {
    const H = SH.H, f = v => Math.round(v * 100) / 100, o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SH.W} ${H}" font-family="Helvetica, Arial, sans-serif"><rect width="${SH.W}" height="${H}" fill="#ffffff"/>`];
    const hit = Math.max(0, +(opts && opts.hit) || 0); let cur = null;
    for (const p of sheet.prims) {
      const c = rgbOf(p), ref = p.ref || null;
      if (ref !== cur) { if (cur) o.push('</g>'); if (ref) o.push(`<g data-ref="${esc(ref)}">`); cur = ref; }
      if (hit && ref) {
        if (p.k === 'pl') o.push(`<${p.close ? 'polygon' : 'polyline'} points="${p.pts.map(q => f(q[0]) + ',' + f(H - q[1])).join(' ')}" fill="none" stroke="transparent" stroke-width="${f(hit)}" stroke-linejoin="round" stroke-linecap="round"/>`);
        else if (p.k === 'tx') { const b = primBox([p]); o.push(`<rect x="${f(b[0] - 0.5)}" y="${f(H - b[3] - 0.5)}" width="${f(b[2] - b[0] + 1)}" height="${f(b[3] - b[1] + 1)}" fill="transparent"/>`); }
      }
      if (p.k === 'pl') o.push(`<${p.close ? 'polygon' : 'polyline'} points="${p.pts.map(q => f(q[0]) + ',' + f(H - q[1])).join(' ')}" fill="none" stroke="${c}" stroke-width="${f(Math.max(0.12, lwOf(p)))}"${dashOf(p) ? ' stroke-dasharray="2.6 1.3"' : ''} stroke-linejoin="round"/>`);
      else if (p.k === 'fl') o.push(`<polygon points="${p.pts.map(q => f(q[0]) + ',' + f(H - q[1])).join(' ')}" fill="${c}"/>`);
      else if (p.k === 'ci') o.push(`<circle cx="${f(p.c[0])}" cy="${f(H - p.c[1])}" r="${f(p.r)}" fill="${p.fill ? c : 'none'}" stroke="${c}" stroke-width="${f(Math.max(0.12, lwOf(p)))}"/>`);
      else if (p.k === 'tx') { const x = f(p.p[0]), y = f(H - p.p[1]); o.push(`<text x="${x}" y="${y}" font-size="${f(p.h / CAP)}"${p.bold ? ' font-weight="bold"' : ''} fill="${c === '#ffffff' ? '#111111' : c}" text-anchor="${p.al === 'c' ? 'middle' : p.al === 'r' ? 'end' : 'start'}"${p.rot ? ` transform="rotate(${f(-p.rot)} ${x} ${y})"` : ''}>${esc(p.s)}</text>`); }
    }
    if (cur) o.push('</g>');
    /* the grid cells (key map, locator, match lines): see-through tap targets on top */
    (sheet.cells || []).forEach(c => o.push(`<rect data-ref="grid:${esc(c.name)}" x="${f(c.box[0])}" y="${f(H - c.box[3])}" width="${f(c.box[2] - c.box[0])}" height="${f(c.box[3] - c.box[1])}" fill="transparent" style="cursor:pointer"/>`));
    o.push('</svg>'); return o.join('');
  }
  const plain = s => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/→/g, '->').replace(/›/g, '>');
  const ascii = s => plain(s).replace(/[^\x20-\x7e]/g, '?');
  /* PDF (WinAnsi): a Latin-1 letter such as Ñ is written as its own byte; DXF R12 (ASCII): as \U+00D1, which CAD programs read back */
  const winAnsi = s => plain(s).replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  const dxfTxt = s => plain(s).replace(/[^\x20-\x7e]/g, ch => { const c = ch.charCodeAt(0); return c >= 0xa0 && c <= 0xffff && !(c >= 0xd800 && c <= 0xdfff) ? '\\U+' + c.toString(16).toUpperCase().padStart(4, '0') : '?'; });
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
          const s = winAnsi(p.s), w = textW(s, p.h, p.bold), r = p.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), a = p.al === 'c' ? -w / 2 : p.al === 'r' ? -w : 0;
          const x = p.p[0] + a * cs, y = p.p[1] + a * sn, t = s.replace(/[\\()]/g, m => '\\' + m);
          c.push(`BT /${p.bold ? 'F2' : 'F1'} ${n(p.h / CAP)} Tf ${rgb(col === '#ffffff' ? '#111111' : col)} rg ${n(cs)} ${n(sn)} ${n(-sn)} ${n(cs)} ${n(x)} ${n(y)} Tm (${t}) Tj ET`);
        }
      }
      const body = c.join('\n'), cs = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(SH.W * K)} ${n(SH.H * K)}] /Resources << /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R >> >> /Contents ${cs} 0 R >>`));
    }
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>'; objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const pstr = s => '(' + winAnsi(s).replace(/[\\()]/g, m => '\\' + m) + ')', info = add(`<< /Title ${pstr((meta && meta.title) || 'Splicing details')} /Creator ${pstr((meta && meta.creator) || 'G-eSAA splicing details')} /Producer ${pstr('G-eSAA')} >>`);
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
    /* the layers added for the leg states are declared only when a drawing uses them */
    const bb = primBox(all), later = ['FOC_FUTURE', 'FIBER_RESERVED', 'SPLICE_NEW', 'MATCH'], names = Object.keys(LAYERS).filter(k => later.indexOf(k) < 0 || all.some(p => p.lay === k));
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
        const s = dxfTxt(p.s); if (!s.trim()) continue;
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
  /* the Ask & Draw samples: cables with an id and the RUN they come from (fid); legs with an id and a state */
  const run = (id, fid, name, from, to, size, status, length, used) => ({ id, fid, name, from, to, size, status, length, used: used || '' });
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
    ask1: { label: 'Ask 1 · One homing, one route', model: { kind: 'access', fpt: 12, stage: 'plan', title: Object.assign({}, T0, { site: 'MABINI TO SAN ROQUE', dwgNo: 'SPL-A01' }),
      points: [site('a', 'MABINI', 'DMO180', 'new', 48), clo('c1', 'C1', 'new'), clo('c2', 'C2', 'new'), clo('c3', 'CL-0103', 'existing', '6.8512, 125.1630'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-2, 19-24' })],
      cables: [run('k1', 'r1', '72N-0114-L1', 'a', 'c1', 72, 'new', 30), run('k2', 'r2', '12N-0115-L1', 'c1', 'c2', 12, 'new', 2000), run('k3', 'r2', '12N-0115-L2', 'c2', 'c3', 12, 'new', 1200), run('k4', 'r3', '72E-0410-L1', 'c3', 'b', 72, 'existing', 0, '1-12')],
      links: [{ id: 'g1', a: 'a', b: 'b', fibers: 6, state: 'tested' }] } },
    ask2: { label: 'Ask 2 · Two legs, one new build', model: { kind: 'access', fpt: 12, stage: 'plan', title: Object.assign({}, T0, { site: 'MABINI BRANCH', dwgNo: 'SPL-A02' }),
      points: [site('l', 'BALIWAG', 'DMO784', 'new', 12), clo('c1', 'C1', 'new'), clo('c2', 'C2', 'new'), clo('c3', 'CL-0103', 'existing', '6.8512, 125.1630'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-2, 19-24' }), site('k', 'MABINI', 'DMO180', 'new', 48)],
      cables: [run('k1', 'r1', '72N-0111-L1', 'l', 'c1', 72, 'new', 30), run('k2', 'r2', '12N-0112-L1', 'c1', 'c2', 12, 'new', 2000), run('k3', 'r2', '12N-0112-L2', 'c2', 'c3', 12, 'new', 1200), run('k4', 'r3', '72E-0410-L1', 'c3', 'b', 72, 'existing', 0, '1-12'), run('k5', 'r4', '72N-0113-L1', 'c2', 'k', 72, 'new', 500)],
      links: [{ id: 'g1', a: 'k', b: 'l', fibers: 6, state: 'tested' }, { id: 'g2', a: 'k', b: 'b', fibers: 6, state: 'tested' }] } },
    ask3: { label: 'Ask 3 · Branch from an existing cable, one leg for later testing', model: { kind: 'access', fpt: 12, stage: 'plan', title: Object.assign({}, T0, { site: 'MABINI TAP', dwgNo: 'SPL-A03' }),
      points: [site('l', 'BALIWAG', 'DMO784', 'existing', 72, { active: '1-2, 13-24' }), clo('c', 'CL-0207', 'existing', '6.8512, 125.1630'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-2, 13-24' }), site('k', 'MABINI', 'DMO180', 'new', 48)],
      cables: [run('k1', 'r1', '72E-0220-L1', 'l', 'c', 72, 'existing', 0, '1-24'), run('k2', 'r1', '72E-0220-L2', 'c', 'b', 72, 'existing', 0, '1-24'), run('k3', 'r2', '72N-0115-L1', 'c', 'k', 72, 'new', 300)],
      links: [{ id: 'g1', a: 'k', b: 'l', fibers: 6, state: 'tested' }, { id: 'g2', a: 'k', b: 'b', fibers: 6, state: 'spliced' }] } },
    ask4: { label: 'Ask 4 · Two new routes to two homings', model: { kind: 'access', fpt: 12, stage: 'plan', title: Object.assign({}, T0, { site: 'MABINI TWO LEGS', dwgNo: 'SPL-A04' }),
      points: [site('l', 'BALIWAG', 'DMO784', 'existing', 72, { active: '1-2, 13-24' }), clo('c1', 'CL-0207', 'existing', '6.8512, 125.1630'), clo('c2', 'CL-0208', 'existing', '6.8530, 125.1702'), site('b', 'SAN ROQUE', 'DMO820', 'existing', 72, { active: '1-2, 13-24' }), site('k', 'MABINI', 'DMO180', 'new', 48, { split: 'half' })],
      cables: [run('k1', 'r1', '72E-0220-L1', 'l', 'c1', 72, 'existing', 0, '1-24'), run('k2', 'r1', '72E-0220-L2', 'c1', 'c2', 72, 'existing', 0, '1-24'), run('k3', 'r1', '72E-0220-L3', 'c2', 'b', 72, 'existing', 0, '1-24'), run('k4', 'r2', '72N-0116-L1', 'c1', 'k', 72, 'new', 500), run('k5', 'r3', '72N-0116-L2', 'c2', 'k', 72, 'new', 650)],
      links: [{ id: 'g1', a: 'k', b: 'l', fibers: 6, state: 'tested' }, { id: 'g2', a: 'k', b: 'b', fibers: 6, state: 'tested' }] } },
    ask5: { label: 'Ask 5 · Small cell on a dummy NAP (cable ID to follow)', model: { kind: 'access', fpt: 12, stage: 'plan', title: Object.assign({}, T0, { site: 'SMALL CELL SC-01', dwgNo: 'SPL-A05' }),
      points: [site('h', 'POBLACION', 'DMO300', 'existing', 72, { active: '1-12' }), clo('c1', 'C1', 'new'), Object.assign(clo('d', 'SC-01 DNAP', 'new'), { type: 'dnap', fdu: 'SC01_DNAP', ports: 12 })],
      cables: [run('k1', 'r1', '72E-0300-L1', 'h', 'c1', 72, 'existing', 0, '1-12'), run('k2', 'r2', '', 'c1', 'd', 12, 'new', 180)],
      links: [{ id: 'g1', a: 'd', b: 'h', fibers: 2, state: 'tested' }] } },
    broadband: { label: 'OLT · feeder, 2 mains, 11 lines', model: { kind: 'broadband', title: Object.assign({}, T0, { project: 'DEMO FTTH', site: 'DEMO OLT 1', dwgNo: 'SPL-OLT-01' }), demand: 280,
      olt: { name: 'DEMO OLT 1', code: 'DMO1680', odf: 'ODF-01', odfSize: 144 }, feeder: { use: true, name: 'FEEDER 1', size: 144, closure: '144C CLOSURE', first: 13 },
      mains: [{ id: 'm1', name: 'MAIN 1', size: 72, closure: '72C CLOSURE 1', first: 1 }, { id: 'm2', name: 'MAIN 2', size: 72, closure: '72C CLOSURE 2', first: 1 }],
      naps: [['m1', 'L001', 16, 'CC-0101', 'CC'], ['m1', 'L002', 8, 'GT-0102', 'OC'], ['m1', 'L002', 16, 'CC-0103', 'CC'], ['m1', 'L003', 16, 'CC-0104', 'CC'], ['m1', 'L004', 16, 'WP-0105', 'WP'], ['m1', 'L004', 16, 'CC-0106', 'CC'], ['m1', 'L005', 8, 'CC-0107', 'CC'],
        ['m1', 'L006', 16, 'CC-0108', 'CC'], ['m1', 'L006', 8, 'BT-0109', 'OC'], ['m1', 'L007', 16, 'CC-0110', 'CC'],
        ['m2', 'L008', 16, 'CC-0201', 'CC'], ['m2', 'L009', 16, 'CC-0202', 'CC'], ['m2', 'L009', 16, 'CC-0203', 'CC'], ['m2', 'L010', 8, 'GT-0204', 'OC'], ['m2', 'L011', 16, 'CC-0205', 'CC']]
        .map(([main, line, ports, pole, poleType]) => ({ main, line, ports, pole, poleType })) } }
  };

  root.Splice = { build, assign, toSVG, toPDF, toDXF, zip, parseRanges, fmtRanges, fiberColor, FIBER, samples, SHEET: SH, RULES, LAYERS, GRID, clashes, version: 'demo-4' };
})(typeof window !== 'undefined' ? window : globalThis);
