/* G-eSAA v2.30: the plan drawing (DXF) on the company's drawing template.
   The template is prepared once into a "seed" (tools/dxf-seed/make_seed.py): its sample route removed and every field the app
   fills marked @@TOKEN@@. This module fills a copy of the seed with a survey: the sheet grid (440 m cells at 1:1100), one GEO
   sheet per cell the route uses (GEO sheets are copied or removed to match), the viewports of the GEO sheets, KEYMAP and
   VICINITY MAP, the route (cable runs, span lengths, poles with their material and ID, loops, closures, NAPs, handholes, the
   site, ODF / ODC), the coordinates of every pole, OpenStreetMap roads with their names, the title blocks, the table of
   contents and the PMI table. Only the seed's own layers, blocks and text styles are used, plus one block made from the
   template's "existing electric pole" so that proposed poles can be drawn red. A field the app does not know stays blank.
   The output is plain AutoCAD 2018 DXF text; nothing here touches the network or the phone. Works in the browser
   (window.GeDxfTpl) and in Node (require) for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GeDxfTpl = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HANDLE_CODES = (c) => (c >= 320 && c <= 369) || c === 390;
  const I = (v) => String(Math.round(v)).padStart(6);
  const F = (v) => { const n = Number(v); if (!Number.isFinite(n)) return '0.0'; const s = String(Math.round(n * 1e6) / 1e6); return /[.eE]/.test(s) ? s : `${s}.0`; };
  const codeStr = (c) => (c < 1000 ? String(c).padStart(3) : String(c));

  /* ---------------- the document ---------------- */
  class Doc {
    constructor(text) {
      const nl = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n', lines = text.split(nl);
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      if (lines.length % 2) throw new Error('The drawing template is not a text DXF');
      const pairs = new Array(lines.length / 2);
      for (let i = 0, j = 0; i < lines.length; i += 2, j++) pairs[j] = [parseInt(lines[i], 10), lines[i + 1]];
      this.nl = nl; this.head = []; this.secs = []; this.tail = [];
      let i = 0;
      while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1] === 'SECTION')) this.head.push(pairs[i++]);
      while (i < pairs.length) {
        if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION') {
          const name = pairs[i + 1][1]; let j = i + 2; const body = [];
          while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1] === 'ENDSEC')) body.push(pairs[j++]);
          const sec = { name, raw: null, recs: null };
          if (name === 'HEADER' || name === 'CLASSES' || name === 'THUMBNAILIMAGE') sec.raw = body;
          else { sec.recs = []; let cur = null; for (const p of body) { if (p[0] === 0) { cur = [p]; sec.recs.push(cur); } else if (cur) cur.push(p); } }
          this.secs.push(sec); i = j + 1;
        } else this.tail.push(pairs[i++]);
      }
      this.index();
      const hs = this.headerVar('$HANDSEED'); this.next = parseInt(hs[1], 16);
    }
    sec(name) { return this.secs.find((s) => s.name === name); }
    headerVar(name) { const r = this.sec('HEADER').raw; const k = r.findIndex((p) => p[0] === 9 && p[1] === name); return k >= 0 ? r[k + 1] : null; }
    index() {
      this.byHandle = new Map();
      for (const s of this.secs) if (s.recs) for (const r of s.recs) { const h = handleOf(r); if (h) this.byHandle.set(h, r); }
    }
    newHandle() { const h = this.next.toString(16).toUpperCase(); this.next++; return h; }
    text() {
      const hs = this.headerVar('$HANDSEED'); hs[1] = this.next.toString(16).toUpperCase();
      const out = [];
      const put = (p) => { out.push(codeStr(p[0])); out.push(p[1]); };
      this.head.forEach(put);
      for (const s of this.secs) {
        put([0, 'SECTION']); put([2, s.name]);
        if (s.raw) s.raw.forEach(put); else for (const r of s.recs) r.forEach(put);
        put([0, 'ENDSEC']);
      }
      this.tail.forEach(put);
      return out.join(this.nl) + this.nl;
    }
  }
  const typ = (r) => r[0][1];
  function handleOf(r) { const c = typ(r) === 'DIMSTYLE' ? 105 : 5; const p = r.find((x) => x[0] === c); return p ? p[1] : null; }
  const get = (r, c, d) => { for (let i = 1; i < r.length; i++) if (r[i][0] === c) return r[i][1]; return d; };
  const all = (r, c) => r.filter((p, i) => i > 0 && p[0] === c).map((p) => p[1]);
  const num = (r, c, d) => { const v = get(r, c); return v == null ? d : parseFloat(v); };
  function owner(r) { let g = 0; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 102) { g = v.startsWith('{') ? 1 : 0; continue; } if (c === 330 && !g) return v; } return null; }
  function setFirst(r, c, v) { for (let i = 1; i < r.length; i++) if (r[i][0] === c) { r[i][1] = v; return true; } return false; }
  /** Sets code c after the subclass marker 100 = sub (the first one there). */
  function setIn(r, sub, c, v) { const k = r.findIndex((p) => p[0] === 100 && p[1] === sub); for (let i = k + 1; k >= 0 && i < r.length; i++) { if (r[i][0] === 100) break; if (r[i][0] === c) { r[i][1] = v; return true; } } return false; }
  const stripGroups = (r, which) => { const out = []; let skip = false; for (const p of r) { if (p[0] === 102 && p[1].startsWith('{')) { if (!which || which.includes(p[1])) { skip = true; continue; } } if (p[0] === 102 && p[1] === '}' && skip) { skip = false; continue; } if (!skip) out.push(p); } return out; };

  /* ---------------- template structure ---------------- */
  function structure(d) {
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, O = d.sec('OBJECTS').recs, E = d.sec('ENTITIES').recs;
    const br = new Map(), brByName = new Map();
    T.forEach((r) => { if (typ(r) === 'BLOCK_RECORD') { br.set(get(r, 5), r); brByName.set(get(r, 2), r); } });
    const layouts = [];
    O.forEach((r) => { if (typ(r) === 'LAYOUT') layouts.push({ rec: r, name: all(r, 1).slice(-1)[0], brh: all(r, 330).slice(-1)[0] }); });
    const blocks = new Map(); let cur = null;
    B.forEach((r) => { const t = typ(r); if (t === 'BLOCK') { cur = { name: get(r, 2), begin: r, ents: [], end: null }; blocks.set(cur.name, cur); } else if (t === 'ENDBLK') { if (cur) cur.end = r; cur = null; } else if (cur) cur.ents.push(r); });
    const layers = new Map(); T.forEach((r) => { if (typ(r) === 'LAYER') layers.set(get(r, 2), r); });
    const styles = new Set(); T.forEach((r) => { if (typ(r) === 'STYLE') styles.add(get(r, 2)); });
    const model = brByName.get('*Model_Space'), paper = brByName.get('*Paper_Space');
    return { T, B, O, E, br, brByName, layouts, blocks, layers, styles, modelH: get(model, 5), paperH: get(paper, 5) };
  }
  function layoutEnts(d, S, L) {
    const r = S.br.get(L.brh), bn = get(r, 2);
    if (bn === '*Paper_Space') return S.E.filter((e) => String(get(e, 67, '0')).trim() === '1');
    return S.blocks.get(bn).ents;
  }

  /* ---------------- removing records (a GEO sheet not needed) ---------------- */
  function removeHandles(d, gone) {
    const recsOf = (s) => d.sec(s).recs;
    let changed = true;
    while (changed) { // whatever they owned goes too
      changed = false;
      for (const s of ['BLOCKS', 'ENTITIES', 'OBJECTS']) for (const r of recsOf(s)) { const h = get(r, 5); if (h && !gone.has(h) && gone.has(owner(r))) { gone.add(h); changed = true; } }
    }
    for (const s of ['TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) {
      const sec = d.sec(s);
      sec.recs = sec.recs.filter((r) => !gone.has(handleOf(r)));
      sec.recs = sec.recs.map((r) => {
        if (!r.some((p, i) => i > 0 && HANDLE_CODES(p[0]) && gone.has(p[1]))) return r;
        const t = typ(r), out = [r[0]]; let grp = null;
        for (let i = 1; i < r.length; i++) {
          const [c, v] = r[i];
          if (c === 102) grp = v.startsWith('{') ? v : null;
          const dead = HANDLE_CODES(c) && gone.has(v);
          if (t === 'DICTIONARY' && c === 3 && r[i + 1] && (r[i + 1][0] === 350 || r[i + 1][0] === 360) && gone.has(r[i + 1][1])) { i++; continue; }
          if (t === 'SORTENTSTABLE' && c === 331 && dead) { if (r[i + 1] && r[i + 1][0] === 5) i++; continue; }
          if (dead && (t === 'GROUP' || (t === 'BLOCK_RECORD' && c === 331) || grp === '{ACAD_REACTORS')) continue;
          out.push([c, v]);
        }
        return out;
      });
    }
    d.index();
  }
  function removeLayout(d, S, L) {
    const brec = S.br.get(L.brh), bn = get(brec, 2), b = S.blocks.get(bn), gone = new Set([get(L.rec, 5), L.brh, get(b.begin, 5), get(b.end, 5), ...b.ents.map((e) => get(e, 5))]);
    removeHandles(d, gone);
    const tb = d.sec('TABLES').recs.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD'); if (tb) setFirst(tb, 70, I(Math.max(0, parseInt(get(tb, 70, '1'), 10) - 1)));
  }
  /* ---------------- copying a sheet (more GEO sheets than the template has) ---------------- */
  function cloneLayout(d, S, L, newName) {
    const brec = S.br.get(L.brh), b = S.blocks.get(get(brec, 2));
    const src = [L.rec, brec, b.begin, ...b.ents, b.end], map = new Map();
    src.forEach((r) => { const h = get(r, 5); if (h) map.set(h, d.newHandle()); });
    const nums = [...S.brByName.keys()].map((n) => (/^\*Paper_Space(\d+)$/.exec(n) || [])[1]).filter(Boolean).map(Number);
    const bname = `*Paper_Space${Math.max(0, ...nums) + 1}`;
    const copy = (r) => stripGroups(r, ['{ACAD_XDICTIONARY']).map(([c, v]) => [c, (c === 5 || HANDLE_CODES(c)) && map.has(v) ? map.get(v) : v]);
    const nL = copy(L.rec), nBR = copy(brec), nB = copy(b.begin), nE = b.ents.map(copy), nEnd = copy(b.end);
    setIn(nBR, 'AcDbBlockTableRecord', 2, bname); setIn(nB, 'AcDbBlockBegin', 2, bname); setIn(nB, 'AcDbBlockBegin', 3, bname);
    setIn(nL, 'AcDbLayout', 1, newName);
    // place the copies after their originals
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, O = d.sec('OBJECTS').recs;
    T.splice(T.indexOf(brec) + 1, 0, nBR);
    B.splice(B.indexOf(b.end) + 1, 0, nB, ...nE, nEnd);
    O.splice(O.indexOf(L.rec) + 1, 0, nL);
    const dict = O.find((r) => typ(r) === 'DICTIONARY' && all(r, 350).includes(get(L.rec, 5)));
    if (dict) dict.push([3, newName], [350, get(nL, 5)]);
    const tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD'); if (tb) setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    d.index();
  }

  /* ---------------- new entities ---------------- */
  class Out {
    constructor(d, S) { this.d = d; this.S = S; this.model = []; this.n = {}; }
    base(t, layer, extra) {
      const r = [[0, t], [5, this.d.newHandle()], [330, this.S.modelH], [100, 'AcDbEntity'], [8, layer]];
      if (extra && extra.color != null) r.push([62, I(extra.color)]);
      if (extra && extra.lt) r.push([6, extra.lt]);
      this.n[t] = (this.n[t] || 0) + 1;
      return r;
    }
    add(r) { this.model.push(r); return r; }
    lwpoly(layer, pts, o) {
      const r = this.base('LWPOLYLINE', layer, o); r.push([100, 'AcDbPolyline'], [90, I(pts.length)], [70, I(o && o.closed ? 1 : 0)], [43, F(o && o.w ? o.w : 0)]);
      pts.forEach(([x, y]) => r.push([10, F(x)], [20, F(y)]));
      return this.add(r);
    }
    text(layer, x, y, h, s, o) {
      o = o || {}; const r = this.base('TEXT', layer, o), ha = o.ha || 0, va = o.va || 0;
      r.push([100, 'AcDbText'], [10, F(x)], [20, F(y)], [30, '0.0'], [40, F(h)], [1, s]);
      if (o.rot) r.push([50, F(o.rot)]);
      r.push([7, this.style(o.style)]);
      if (ha || va) r.push([72, I(ha)], [11, F(x)], [21, F(y)], [31, '0.0']);
      r.push([100, 'AcDbText']); if (va) r.push([73, I(va)]);
      return this.add(r);
    }
    mtext(layer, x, y, h, s, o) {
      o = o || {}; const r = this.base('MTEXT', layer, o);
      r.push([100, 'AcDbMText'], [10, F(x)], [20, F(y)], [30, '0.0'], [40, F(h)], [41, '0.0'], [71, I(o.att || 1)], [72, I(1)]);
      const chunks = []; for (let i = 0; i < s.length; i += 250) chunks.push(s.slice(i, i + 250)); if (!chunks.length) chunks.push('');
      chunks.slice(0, -1).forEach((c) => r.push([3, c])); r.push([1, chunks[chunks.length - 1]]);
      r.push([7, this.style(o.style)]); if (o.rot) r.push([50, F(o.rot)]); r.push([73, I(1)], [44, '1.0']);
      return this.add(r);
    }
    circle(layer, x, y, rad, o) { const r = this.base('CIRCLE', layer, o); r.push([100, 'AcDbCircle'], [10, F(x)], [20, F(y)], [30, '0.0'], [40, F(rad)]); return this.add(r); }
    style(s) { return s && this.S.styles.has(s) ? s : 'Standard'; }
    /** An INSERT of a seed block, placed so the drawn symbol's centre is at (x, y), with attributes by tag. */
    insert(layer, name, x, y, o) {
      o = o || {}; const blk = this.S.blocks.get(name); if (!blk) return null;
      const sc = o.scale || 1, rot = o.rot || 0, c = o.center ? blockCenter(this.S, name) : [0, 0], a = rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      const ix = x - (c[0] * sc * cs - c[1] * sc * sn), iy = y - (c[0] * sc * sn + c[1] * sc * cs);
      const defs = blk.ents.filter((e) => typ(e) === 'ATTDEF'), vals = o.attrs || {};
      const r = this.base('INSERT', layer, o); r.push([100, 'AcDbBlockReference']); if (defs.length) r.push([66, I(1)]);
      r.push([2, name], [10, F(ix)], [20, F(iy)], [30, '0.0'], [41, F(sc)], [42, F(sc)], [43, F(sc)]); if (rot) r.push([50, F(rot)]);
      this.add(r);
      if (!defs.length) return r;
      const H = get(r, 5), T = (px, py) => [ix + (px * cs - py * sn) * sc, iy + (px * sn + py * cs) * sc];
      for (const df of defs) {
        const tag = get(df, 2), ha = parseInt(get(df, 72, '0'), 10) || 0, va = parseInt(get(df, 74, '0'), 10) || 0;
        const p = T(num(df, 10, 0), num(df, 20, 0)), q = T(num(df, 11, 0), num(df, 21, 0)), h = num(df, 40, 2.5) * sc;
        const v = vals[tag] != null ? String(vals[tag]) : (o.keepDefaults ? get(df, 1, '') : '');
        const dl = get(df, 8, '0'), at = [[0, 'ATTRIB'], [5, this.d.newHandle()], [330, H], [100, 'AcDbEntity'], [8, dl === '0' ? layer : dl]]; // an attribute of layer 0 follows the insert's layer
        const col = get(df, 62); if (col != null) at.push([62, col]);
        at.push([100, 'AcDbText'], [10, F(p[0])], [20, F(p[1])], [30, '0.0'], [40, F(h)], [1, v]);
        if (rot) at.push([50, F(rot)]);
        at.push([7, this.style(get(df, 7))]);
        if (ha || va) at.push([72, I(ha)], [11, F(q[0])], [21, F(q[1])], [31, '0.0']);
        at.push([100, 'AcDbAttribute'], [2, tag], [70, I(vals[tag] != null || o.keepDefaults ? 0 : 1)]); if (va) at.push([74, I(va)]);
        at.push([280, I(0)]);
        this.add(at); this.n.ATTRIB = (this.n.ATTRIB || 0) + 1;
      }
      this.add([[0, 'SEQEND'], [5, this.d.newHandle()], [330, H], [100, 'AcDbEntity'], [8, layer]]);
      return r;
    }
  }
  /** Centre of what a block draws, in its own units (inserts of other blocks followed; attribute definitions left out). */
  const centerCache = new Map();
  function blockCenter(S, name, depth) {
    const key = name; if (centerCache.has(key)) return centerCache.get(key);
    const bb = blockBox(S, name, depth || 0), c = bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : [0, 0];
    centerCache.set(key, c); return c;
  }
  function blockBox(S, name, depth) {
    const b = S.blocks.get(name); if (!b || depth > 6) return null;
    const xs = [], ys = [], add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } };
    for (const e of b.ents) {
      const t = typ(e);
      if (t === 'LINE') { add(num(e, 10), num(e, 20)); add(num(e, 11), num(e, 21)); }
      else if (t === 'LWPOLYLINE') { const X = all(e, 10).map(Number), Y = all(e, 20).map(Number); X.forEach((x, i) => add(x, Y[i])); }
      else if (t === 'CIRCLE' || t === 'ARC') { const x = num(e, 10), y = num(e, 20), r = num(e, 40, 0); add(x - r, y - r); add(x + r, y + r); }
      else if (t === 'INSERT') {
        const bb = blockBox(S, get(e, 2), depth + 1); if (!bb) continue;
        const sx = num(e, 41, 1), sy = num(e, 42, 1), a = num(e, 50, 0) * Math.PI / 180, ix = num(e, 10, 0), iy = num(e, 20, 0);
        [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].forEach(([x, y]) => add(ix + (x * sx) * Math.cos(a) - (y * sy) * Math.sin(a), iy + (x * sx) * Math.sin(a) + (y * sy) * Math.cos(a)));
      }
    }
    return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
  }
  /** One block made from the template's "existing electric pole" (an X, B / CC / NPT attributes) with its centre at the base
      point and its lines BYLAYER, so the pole takes the colour of its layer: red for proposed, the template's green for existing. */
  const POLE_BLOCK = 'G-ESAA POLE';
  function addPoleBlock(d, S) {
    if (S.blocks.has(POLE_BLOCK)) return true;
    const src = S.blocks.get('existing electric pole'); if (!src) return false;
    const defs = src.ents.filter((e) => typ(e) === 'ATTDEF'), c = blockCenter(S, 'existing electric pole'), bb = blockBox(S, 'existing electric pole', 0), hs = bb ? Math.min(bb[2] - bb[0], bb[3] - bb[1]) / 2 : 2.6;
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD');
    const brH = d.newHandle(), bH = d.newHandle();
    const brec = [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, POLE_BLOCK], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]];
    const last = T.reduce((k, r, i) => (typ(r) === 'BLOCK_RECORD' ? i : k), -1); T.splice(last + 1, 0, brec);
    setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    const ents = [
      [[0, 'BLOCK'], [5, bH], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'], [2, POLE_BLOCK], [70, I(2)], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, POLE_BLOCK], [1, '']],
      ...[[-hs, hs, hs, -hs], [-hs, -hs, hs, hs]].map(([x1, y1, x2, y2]) => [[0, 'LINE'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbLine'], [10, F(x1)], [20, F(y1)], [30, '0.0'], [11, F(x2)], [21, F(y2)], [31, '0.0']]),
      ...defs.map((df) => stripGroups(df).filter(([cd]) => cd !== 1001 && cd < 1000).map(([cd, v]) => [cd, cd === 5 ? d.newHandle() : cd === 330 ? brH : cd === 10 ? F(parseFloat(v) - c[0]) : cd === 20 ? F(parseFloat(v) - c[1]) : cd === 11 ? F(parseFloat(v) - c[0]) : cd === 21 ? F(parseFloat(v) - c[1]) : v])),
      [[0, 'ENDBLK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']],
    ];
    const pos = B.findIndex((r) => typ(r) === 'BLOCK' && get(r, 2) === 'existing electric pole');
    B.splice(pos >= 0 ? pos : B.length, 0, ...ents);
    d.index(); Object.assign(S, structure(d));
    return true;
  }

  /* ---------------- geometry helpers ---------------- */
  const letters = (k) => { let s = ''; k += 1; while (k > 0) { const m = (k - 1) % 26; s = String.fromCharCode(65 + m) + s; k = Math.floor((k - 1) / 26); } return s; };
  const angDeg = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const readable = (deg) => { let d = ((deg % 360) + 360) % 360; if (d > 90 && d <= 270) d -= 180; return d; };
  /** Offset of a polyline to one side (mitre at the corners, kept short at sharp turns). */
  function offsetLine(pts, dist) {
    const n = pts.length, out = []; if (n < 2) return out;
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L]; };
    for (let i = 0; i < n; i++) {
      let nx, ny;
      if (i === 0) [nx, ny] = nrm(pts[0], pts[1]);
      else if (i === n - 1) [nx, ny] = nrm(pts[n - 2], pts[n - 1]);
      else { const a = nrm(pts[i - 1], pts[i]), b = nrm(pts[i], pts[i + 1]), sx = a[0] + b[0], sy = a[1] + b[1], L = Math.hypot(sx, sy); if (L < 1e-6) { [nx, ny] = a; } else { const m = Math.min(3, 1 / Math.max(0.33, (sx / L) * a[0] + (sy / L) * a[1])); nx = sx / L * m; ny = sy / L * m; } }
      out.push([pts[i][0] + nx * dist, pts[i][1] + ny * dist]);
    }
    return out;
  }
  /** The part of a polyline inside a box (each piece separately). */
  function clipLine(pts, b) {
    const inside = (p) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
    const out = []; let cur = [];
    const cut = (p, q) => { // Liang-Barsky
      let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
      for (const [pp, qq] of [[-dx, p[0] - b[0]], [dx, b[2] - p[0]], [-dy, p[1] - b[1]], [dy, b[3] - p[1]]]) {
        if (pp === 0) { if (qq < 0) return null; continue; }
        const r = qq / pp; if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
      return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy], t0, t1];
    };
    for (let i = 1; i < pts.length; i++) {
      const c = cut(pts[i - 1], pts[i]); if (!c) { if (cur.length > 1) out.push(cur); cur = []; continue; }
      if (!cur.length || c[2] > 0) { if (cur.length > 1) out.push(cur); cur = [c[0]]; }
      cur.push(c[1]); if (c[3] < 1) { out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
    return out;
  }

  /* ---------------- the build ---------------- */
  const ROAD = { major: { half: 5, name: true }, minor: { half: 3, name: true }, path: { half: 0, name: false } };
  const CABLE_STYLE = { F72: { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776 }, L12: { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 6, w: 0.7776 }, U144: { layer: 'Proposed foc duct', color: null, w: 0.7776 }, '': { layer: 'PROPOSED FOC AERIAL 6 CORE', color: null, w: 0.7776 } };
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const dateText = (d) => `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const mtextEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');

  /**
   * job: { pts: [{ id, poleId, el, status, mat, E, N, lat, lon, mloop, closureId, napId, nap, closure, siteName, plaId }],
   *        runs: [{ cable, pts: [[E, N], ...], ids: [...] }], spans: [{ a: [E, N], b: [E, N], len, cable, long }],
   *        roads: [{ cls: 'major' | 'minor' | 'path', name, pts: [[E, N], ...] }], roadsNote,
   *        values: { TOKEN: text | { sheet: text } }, maxSpan, mloopLen, cell (m, 440), date (Date) }
   * returns { text, report }
   */
  function build(seedText, job) {
    centerCache.clear();
    const d = new Doc(seedText); let S = structure(d);
    if (!S.layouts.some((L) => L.name === 'GEO')) throw new Error('This is not the G-eSAA drawing template: it has no GEO sheet');
    if (!/@@\w+@@/.test(seedText)) throw new Error('This drawing template has no @@ fields: load the prepared seed (G-eSAA_seed…dxf), not the original template');
    const cell = job.cell || 440, viewH = job.viewH || cell, pts = job.pts || [], spans = job.spans || [], runs = job.runs || [];
    const rep = { sheets: [], cells: [], blanks: [], counts: {}, notes: [] };
    if (!pts.length) throw new Error('Nothing to draw: the project has no records');
    /* 1. the grid: 440 m cells placed so the route uses as few sheets as it can and keeps away from the sheet edges
       (job.gridOrigin [E, N] fixes it instead); the cells the route uses, in route order */
    const samp = [];
    runs.forEach((r) => { for (let k = 1; k < r.pts.length; k++) { const a = r.pts[k - 1], b = r.pts[k], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (let s = 0; s <= n; s++) samp.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); } });
    pts.forEach((p) => samp.push([p.E, p.N]));
    let gox = 0, goy = 0;
    if (job.gridOrigin) { gox = +job.gridOrigin[0] || 0; goy = +job.gridOrigin[1] || 0; } else {
      const steps = 22, st = cell / steps, every = Math.max(1, Math.ceil(samp.length / 6000)); let best = null;
      for (let a = 0; a < steps; a++) for (let b = 0; b < steps; b++) {
        const ox = a * st, oy = b * st, seen = new Set(); let m = 0;
        for (let q = 0; q < samp.length; q += every) { const u = (samp[q][0] - ox) / cell, v = (samp[q][1] - oy) / cell, fi = Math.floor(u), fj = Math.floor(v), fu = u - fi, fv = v - fj; seen.add(fi * 1e6 + fj); m += Math.min(fu, 1 - fu, fv, 1 - fv); }
        if (!best || seen.size < best.n || (seen.size === best.n && m > best.m + 1e-9)) best = { ox, oy, n: seen.size, m };
      }
      gox = best.ox; goy = best.oy;
    }
    const ci = (E) => Math.floor((E - gox) / cell), cj = (N) => Math.floor((N - goy) / cell), key = (i, j) => `${i},${j}`;
    const used = new Map(), order = [];
    const visit = (E, N) => { const k = key(ci(E), cj(N)); if (!used.has(k)) { used.set(k, { i: ci(E), j: cj(N) }); order.push(k); } };
    samp.forEach((q) => visit(q[0], q[1]));
    const I0 = Math.min(...[...used.values()].map((c) => c.i)) - 1, I1 = Math.max(...[...used.values()].map((c) => c.i)) + 1;
    const J0 = Math.min(...[...used.values()].map((c) => c.j)) - 1, J1 = Math.max(...[...used.values()].map((c) => c.j)) + 1;
    const cellName = (i, j) => `${letters(J1 - j)}-${i - I0 + 1}`;
    const geoCells = order.map((k) => used.get(k)), N = geoCells.length;
    /* 2. the GEO sheets: as many as the cells used (copied from GEO, or the extra ones removed) */
    const geoNames = (n) => Array.from({ length: n }, (_, k) => (k ? `GEO (${k + 1})` : 'GEO'));
    let have = S.layouts.filter((L) => /^GEO( \(\d+\))?$/.test(L.name));
    for (const L of have) if (!geoNames(N).includes(L.name)) { removeLayout(d, S, L); S = structure(d); }
    for (const nm of geoNames(N)) if (!S.layouts.some((L) => L.name === nm)) { cloneLayout(d, S, S.layouts.find((L) => L.name === 'GEO'), nm); S = structure(d); }
    // tab order: TITLE, TOC, LEGENDS, VICINITY MAP, ROW AREA COVERAGE, KEYMAP, GEO…, PMI, then anything else
    const want = ['TITLE', 'TOC', 'LEGENDS', 'VICINITY MAP', 'ROW AREA COVERAGE', 'KEYMAP', ...geoNames(N), 'PMI'];
    const rank = (n) => (n === 'Model' ? -1 : want.includes(n) ? want.indexOf(n) : 100);
    S.layouts.slice().sort((a, b) => rank(a.name) - rank(b.name)).forEach((L, k) => { if (L.name !== 'Model') setIn(L.rec, 'AcDbLayout', 71, I(k)); });
    /* 3. viewports */
    const bigVp = (L) => layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').sort((a, b) => num(b, 40, 0) * num(b, 41, 0) - num(a, 40, 0) * num(a, 41, 0)).find((e) => Math.abs(num(e, 40, 0) - num(e, 41, 0)) < 1); // the square map viewport
    const aim = (vp, cx, cy, h) => { if (!vp) return; setFirst(vp, 12, F(cx)); setFirst(vp, 22, F(cy)); setFirst(vp, 17, '0.0'); setFirst(vp, 27, '0.0'); setFirst(vp, 37, '0.0'); setFirst(vp, 45, F(h)); setFirst(vp, 51, '0.0'); };
    const sheetOf = new Map();
    geoCells.forEach((c, k) => { const nm = geoNames(N)[k], L = S.layouts.find((x) => x.name === nm); aim(bigVp(L), gox + (c.i + 0.5) * cell, goy + (c.j + 0.5) * cell, viewH); sheetOf.set(key(c.i, c.j), nm); rep.sheets.push(`${nm}: ${cellName(c.i, c.j)}`); rep.cells.push(cellName(c.i, c.j)); });
    const gx0 = gox + I0 * cell, gy0 = goy + J0 * cell, gx1 = gox + (I1 + 1) * cell, gy1 = goy + (J1 + 1) * cell;
    const km = S.layouts.find((L) => L.name === 'KEYMAP'), kmH = Math.max(gx1 - gx0, gy1 - gy0) * 1.02;
    if (km) aim(bigVp(km), (gx0 + gx1) / 2, (gy0 + gy1) / 2, kmH);
    const xs = pts.map((p) => p.E), ys = pts.map((p) => p.N), rx0 = Math.min(...xs), rx1 = Math.max(...xs), ry0 = Math.min(...ys), ry1 = Math.max(...ys);
    const vic = job.vicinity || [ (rx0 + rx1) / 2, (ry0 + ry1) / 2, Math.max(1500, Math.max(rx1 - rx0, ry1 - ry0) * 3) ];
    const vm = S.layouts.find((L) => L.name === 'VICINITY MAP'); if (vm) aim(bigVp(vm), vic[0], vic[1], vic[2]);
    /* 4. model space */
    const o = new Out(d, S);
    const lay = (n, fallback) => (S.layers.has(n) ? n : fallback || '0');
    // grid
    const cellsI = I1 - I0 + 1, cellsJ = J1 - J0 + 1, gridAll = cellsI * cellsJ <= 900;
    const gh = 96.127 * cell / 479.12;
    for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
      if (!gridAll && ![-1, 0, 1].some((di) => [-1, 0, 1].some((dj) => used.has(key(i + di, j + dj))))) continue;
      const x0 = gox + i * cell, y0 = goy + j * cell;
      o.lwpoly(lay('GRIDS'), [[x0, y0], [x0 + cell, y0], [x0 + cell, y0 + cell], [x0, y0 + cell]], { closed: true, color: 6 });
      o.mtext(lay('GRIDNO.', 'GRIDNO'), x0 + cell - cell * 0.04, y0 + cell - cell * 0.03, gh, cellName(i, j), { att: 3 });
    }
    // roads (OpenStreetMap), clipped to the vicinity
    const vb = [vic[0] - vic[2] / 2, vic[1] - vic[2] / 2, vic[0] + vic[2] / 2, vic[1] + vic[2] / 2];
    let nRoads = 0; const named = new Map();
    for (const rd of job.roads || []) {
      const cls = ROAD[rd.cls] || ROAD.minor;
      for (const piece of clipLine(rd.pts, vb)) {
        if (piece.length < 2) continue; nRoads++;
        if (cls.half) { o.lwpoly(lay('ROAD PAVEMENT'), offsetLine(piece, cls.half)); o.lwpoly(lay('ROAD PAVEMENT'), offsetLine(piece, -cls.half)); }
        else o.lwpoly(lay('ROAD PAVEMENT'), piece, { color: 8 }); // a path or track: its centre line
        if (cls.name && rd.name) { let best = null; for (let k = 1; k < piece.length; k++) { const L = Math.hypot(piece[k][0] - piece[k - 1][0], piece[k][1] - piece[k - 1][1]); if (!best || L > best.L) best = { L, a: piece[k - 1], b: piece[k] }; } const nm = named.get(rd.name) || { L: 0 }; if (best && best.L > nm.L) named.set(rd.name, { ...best, half: cls.half }); }
      }
    }
    for (const [name, b] of named) { if (b.L < 25) continue; const ang = readable(angDeg(b.a, b.b)); o.text(lay('STREET NAME'), (b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2, 3.5, name.toUpperCase(), { rot: ang, ha: 1, va: 2, style: 'arial' }); }
    if (nRoads) o.text(lay('BASEMAP'), gx0 + 5, gy0 - 12, 4, `ROADS: (c) OPENSTREETMAP CONTRIBUTORS (ODbL)${job.roadsNote ? ` · ${String(job.roadsNote).toUpperCase()}` : ''}`, { style: 'arial' });
    // cable runs
    for (const r of runs) { const st = CABLE_STYLE[r.cable] || CABLE_STYLE['']; if (r.pts.length > 1) o.lwpoly(lay(st.layer, 'Proposed foc aerial'), r.pts, { w: st.w, color: st.color }); }
    // span lengths (long spans flagged red)
    for (const s of spans) {
      const m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], ang = angDeg(s.a, s.b), rd = readable(ang) * Math.PI / 180, off = 4;
      o.text(lay('Distance Data'), m[0] - Math.sin(rd) * off, m[1] + Math.cos(rd) * off, 4.0, `${s.len.toFixed(1)}m${s.long ? ` (OVER ${job.maxSpan || 200}m)` : ''}`, { rot: readable(ang), ha: 1, va: 2, style: 'arial', color: s.long ? 1 : null });
    }
    // run labels (which cable)
    for (const r of runs) {
      if (r.pts.length < 2 || !r.label) continue; let best = null;
      for (let k = 1; k < r.pts.length; k++) { const L = Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]); if (!best || L > best.L) best = { L, a: r.pts[k - 1], b: r.pts[k] }; }
      const rd = readable(angDeg(best.a, best.b)) * Math.PI / 180, m = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2];
      o.text(lay('MISC'), m[0] - Math.sin(rd) * 12, m[1] + Math.cos(rd) * 12, 3.0, r.label, { rot: rd * 180 / Math.PI, ha: 1, va: 2, style: 'arial', color: (CABLE_STYLE[r.cable] || {}).color || null });
    }
    // points
    const poleBlock = addPoleBlock(d, S); S = structure(d); o.S = S;
    const dirAt = new Map(); spans.forEach((s) => { const a = angDeg(s.a, s.b); [s.ia, s.ib].forEach((id) => { if (id != null && !dirAt.has(id)) dirAt.set(id, a); }); });
    let seq = 0;
    for (const p of pts) {
      const isNew = p.status === 'Proposed' || p.status === 'New', ang = dirAt.has(p.id) ? dirAt.get(p.id) : 0, rr = readable(ang) * Math.PI / 180;
      const Lx = -Math.sin(rr), Ly = Math.cos(rr); // left of the route, as read (the span lengths sit on this side, mid-span)
      if (p.el === 'Pole') {
        if (poleBlock) o.insert(isNew ? lay('P-GPOLE') : lay('ELECTRIC POLE'), POLE_BLOCK, p.E, p.N, { scale: 0.99, attrs: { B: p.size || '', CC: p.mat || '', NPT: p.poleId || '' } });
        else o.circle(isNew ? lay('P-GPOLE') : lay('ELECTRIC POLE'), p.E, p.N, 2.5);
        seq++; const cx = p.E - Lx * 30, cy = p.N - Ly * 30; // the pole's number, right of the route (past the closure label)
        o.circle(lay('p-pole'), cx, cy, 9); o.text(lay('p-pole'), cx, cy, 7, String(seq), { ha: 1, va: 2, style: 'arial' });
        if (p.mloop) { o.insert(lay('PROPOSED LOOP'), 'loopp', p.E, p.N, { scale: 2.470465709436871, rot: ang + 180, center: true }); o.text(lay('PROPOSED LOOP'), p.E - Lx * 8, p.N - Ly * 8, 2.8125, `${(job.mloopLen || 15).toFixed(1)}m LOOP`, { rot: readable(ang), ha: 1, va: 2 }); }
        if (p.closure || p.closureId) o.insert(lay('P-JOINT'), 'P-Joint', p.E + Lx * 9, p.N + Ly * 9, { scale: 4.35, rot: readable(ang), attrs: { JT_ID: p.closureId || '', JOINT: 'JT' } });
        if (p.nap || p.napId) { const nx = p.E + Lx * 19, ny = p.N + Ly * 19; o.insert(lay('PROPOSED NAP'), 'proposed NAP', nx, ny, { scale: 0.7803353843555049, center: true }); if (p.napId) o.text(lay('Proposed NAP ID', 'MISC'), nx, ny - 7, 2.5, p.napId, { ha: 1, va: 2, style: 'arial' }); }
      } else if (p.el === 'Site') {
        o.insert(lay('X-BTS'), 'X-BTS', p.E, p.N, { scale: 2.4, attrs: { BTS_NAME: p.siteName || p.poleId || '', PLA_ID: p.plaId || '' } });
      } else if (p.el === 'ODF') {
        o.insert(isNew ? lay('P-HOST') : lay('X-HOST'), isNew ? 'P-HOST' : 'X-HOST', p.E, p.N, { scale: 0.28, attrs: { HST_NAM: p.poleId || '', HST_COD: '', HST_LET: 'H' } });
      } else if (p.el === 'ODC') {
        o.insert(isNew ? lay('PROPOSED LCP') : lay('EXISTING LCP'), isNew ? 'proposed LCP' : 'existing LCP', p.E, p.N, { scale: 0.7803353843555049, center: true });
        o.text(lay('Proposed LCP ID', 'MISC'), p.E, p.N - 8, 2.5, p.poleId || '', { ha: 1, va: 2, style: 'arial' });
      } else if (p.el === 'NAP') {
        o.insert(isNew ? lay('PROPOSED NAP') : lay('EXISTING NAP'), isNew ? 'proposed NAP' : 'existing NAP', p.E, p.N, { scale: 0.7803353843555049, center: true });
        o.text(lay('Proposed NAP ID', 'MISC'), p.E, p.N - 7, 2.5, p.poleId || '', { ha: 1, va: 2, style: 'arial' });
      } else if (p.el === 'Closure') {
        o.insert(lay('P-JOINT'), 'P-Joint', p.E, p.N, { scale: 4.35, attrs: { JT_ID: p.poleId || p.closureId || '', JOINT: 'JT' } });
      } else if (p.el === 'Handhole') {
        o.insert(isNew ? lay('PROPOSED HH') : lay('EXISTING HH'), isNew ? 'proposed Handhole' : 'HANDHOLE', p.E, p.N, { scale: 0.7803353843555049, center: true });
        o.text(lay('MISC'), p.E, p.N - 7, 2.5, p.poleId || '', { ha: 1, va: 2, style: 'arial' });
      } else o.circle(lay('MISC'), p.E, p.N, 2);
      o.mtext(lay('LATLONG'), p.E + 4, p.N - 5, 1.5, `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`, { style: '样式 1' });
    }
    const ents = d.sec('ENTITIES').recs; ents.push(...o.model);
    d.index();
    /* 5. the fields */
    const V = job.values || {}, sheetNames = S.layouts.map((L) => L.name);
    const paging = S.brByName.get('PAGING');
    const idx = (nm, di, dj) => { const k = geoNames(N).indexOf(nm); if (k < 0) return ''; const c = geoCells[k], kk = key(c.i + di, c.j + dj); return sheetOf.has(kk) ? cellName(c.i + di, c.j + dj) : ''; };
    const auto = {
      SHEET_NO: (sh) => { const k = geoNames(N).indexOf(sh); return k >= 0 ? `${k + 1} OF ${N}` : '1 OF 1'; },
      DATE: () => dateText(job.date || new Date()),
      SCALE: (sh) => (geoNames(N).includes(sh) ? `1 : ${(viewH / 400 * 1000).toLocaleString('en-US')} METERS` : sh === 'KEYMAP' ? `1 : ${(Math.round(kmH / 400 * 1000 / 100) * 100).toLocaleString('en-US')} METERS` : sh === 'VICINITY MAP' ? `1 : ${(Math.round(vic[2] / 400 * 1000 / 100) * 100).toLocaleString('en-US')} METERS` : ''),
      IDX_TL: (sh) => idx(sh, -1, 1), IDX_T: (sh) => idx(sh, 0, 1), IDX_TR: (sh) => idx(sh, 1, 1), IDX_L: (sh) => idx(sh, -1, 0), IDX_C: (sh) => idx(sh, 0, 0), IDX_R: (sh) => idx(sh, 1, 0), IDX_BL: (sh) => idx(sh, -1, -1), IDX_B: (sh) => idx(sh, 0, -1), IDX_BR: (sh) => idx(sh, 1, -1),
      TOC_GEO: () => String(N), TOC_LEGEND: () => String(sheetNames.filter((n) => /^LEGENDS?( \(\d+\))?$/.test(n)).length), TOC_TOTAL: () => String(sheetNames.filter((n) => n !== 'Model').length),
    };
    const blanks = new Set(), filled = new Set();
    const fill = (r, sheet, inBlockText) => {
      const t = typ(r); if (t !== 'TEXT' && t !== 'MTEXT') return;
      const txt = (t === 'MTEXT' ? all(r, 3).join('') : '') + (get(r, 1) || ''); if (txt.indexOf('@@') < 0) return;
      const nt = txt.replace(/@@(\w+)@@/g, (m, k) => {
        let v = V[k]; if (v && typeof v === 'object') v = v[sheet];
        if ((v == null || v === '') && auto[k]) v = auto[k](sheet);
        v = v == null ? '' : String(v);
        if (v) filled.add(k); else blanks.add(k);
        if (t === 'MTEXT') { v = mtextEsc(v); if (k === 'LOCATION' && inBlockText && v.includes('_')) { const q = v.lastIndexOf('_'); v = `${v.slice(0, q + 1)}\\P${v.slice(q + 1)}`; } }
        return v;
      });
      if (t === 'MTEXT') { // the text is the 3 chunks then the 1: replaced in place
        const first = r.findIndex((p, i) => i > 0 && (p[0] === 3 || p[0] === 1)), one = r.findIndex((p, i) => i > 0 && p[0] === 1);
        const chunks = []; for (let i = 0; i < nt.length; i += 250) chunks.push(nt.slice(i, i + 250)); if (!chunks.length) chunks.push('');
        r.splice(first, one - first + 1, ...chunks.slice(0, -1).map((c) => [3, c]), [1, chunks[chunks.length - 1]]);
      } else setFirst(r, 1, nt);
    };
    for (const L of S.layouts) { if (L.name === 'Model') continue; for (const r of layoutEnts(d, S, L)) fill(r, L.name, L.name === 'TITLE'); }
    if (paging) for (const r of S.blocks.get('PAGING').ents) fill(r, null, true);
    for (const r of d.sec('ENTITIES').recs) { const ow = owner(r); if (ow === S.modelH && String(get(r, 67, '0')).trim() !== '1') fill(r, null, false); }
    rep.blanks = [...blanks].filter((k) => !filled.has(k) && !/^IDX_/.test(k)).sort(); // an empty index key = no sheet on that side, not a missing field
    rep.partly = [...blanks].filter((k) => filled.has(k)).sort();
    rep.counts = { ...o.n, roads: nRoads, streetNames: named.size, geoSheets: N, gridCells: cellsI * cellsJ };
    rep.grid = { cell, cols: cellsI, rows: cellsJ, origin: [gx0, gy0] };
    return { text: d.text(), report: rep };
  }
  return { build, Doc, structure, version: '2.30' };
}));
