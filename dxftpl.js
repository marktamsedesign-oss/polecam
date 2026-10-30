/* G-eSAA v2.30–2.34: the plan drawing (DXF) on the company's drawing template.
   The template is prepared once into a "seed" (tools/dxf-seed/make_seed.py): its sample route removed and every field the app
   fills marked @@TOKEN@@. This module fills a copy of the seed with a survey: the sheet grid (440 m cells at 1:1100), one GEO
   sheet per cell the route uses (GEO sheets are copied or removed to match), the viewports of the GEO sheets, KEYMAP and
   VICINITY MAP, the title blocks, the table of contents and the PMI table.
   v2.31, drawn like the template's sample: OpenStreetMap roads by class (width from the class, or the way's width / lanes) with
   one outline where roads meet; each pole beside its road on the side of its pin, the cable on the road side of the poles (past
   an arm when the pole has one); the template's own models with their attributes (proposed pole, electric pole, telco pole,
   arms, guys, loop, closure, NAP, site, ODF); labels placed where they do not overlap; named buildings and places nearby.
   v2.32: rounded road corners (arcs); cables red (new) / blue (existing), aerial as a broken line (the template's DASHED at
   linetype scale 7, as its sample), underground solid; pole symbols and labels smaller where poles stand close, the labels as
   text in the ID's direction (the template's attributes kept, hidden); the photo of each pole beside it (IMAGE, the JPEG next to
   the DXF); span lengths along the cable, sized to the span; the vicinity map: a street map picture (when the phone has one),
   the route in bold, and only that in its viewport (layers frozen per viewport). A layer the seed does not have is added
   (copied from layer 0) only for the photos and the vicinity map.
   v2.34 (your review of 2.33): one size for every pole, label, photo and span length of a drawing; photos right beside their
   pole with no line, covering nothing; the cable 2 m outside the road edge, close to the poles; road lines are obstacles for
   labels; every named road named on every GEO sheet; places turned along their road and kept inside a sheet; the vicinity
   route a broken line with no label; the company logo (or its name, centred) in every title block; the title sheet's
   AFI PLAN / AS-BUILT PLAN; field values that differ by place (title sheet, title block).
   v2.33: each pole label one stack as the template's sample: material / tag without the material / (size) / latitude /
   longitude; a photo's line to its pole crosses no label and no road.
   Only the seed's own layers, blocks and text styles are used (the guy symbols are copied without their fixed "SG 6M" text,
   so the app writes a readable one). A field the app does not know stays blank.
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
    const ltypes = new Set(); T.forEach((r) => { if (typ(r) === 'LTYPE') ltypes.add(get(r, 2)); });
    const model = brByName.get('*Model_Space'), paper = brByName.get('*Paper_Space');
    return { T, B, O, E, br, brByName, layouts, blocks, layers, styles, ltypes, modelH: get(model, 5), paperH: get(paper, 5) };
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
      (this.used || (this.used = new Set())).add(layer); // the layers the plan uses (the vicinity map turns them off)
      if (extra && extra.lt) r.push([6, extra.lt]);
      if (extra && extra.color != null) r.push([62, I(extra.color)]);
      if (extra && extra.lts) r.push([48, F(extra.lts)]); // linetype scale
      this.n[t] = (this.n[t] || 0) + 1;
      return r;
    }
    add(r) { this.model.push(r); return r; }
    lwpoly(layer, pts, o) {
      const r = this.base('LWPOLYLINE', layer, o); r.push([100, 'AcDbPolyline'], [90, I(pts.length)], [70, I((o && o.closed ? 1 : 0) | (o && o.gen ? 128 : 0))], [43, F(o && o.w ? o.w : 0)]);
      pts.forEach(([x, y, b]) => { r.push([10, F(x)], [20, F(y)]); if (b) r.push([42, F(b)]); }); // b: bulge of the arc to the next point
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
      if (o.dir) r.push([11, F(o.dir[0])], [21, F(o.dir[1])], [31, '0.0']); // turned: its x axis
      const chunks = []; for (let i = 0; i < s.length; i += 250) chunks.push(s.slice(i, i + 250)); if (!chunks.length) chunks.push('');
      chunks.slice(0, -1).forEach((c) => r.push([3, c])); r.push([1, chunks[chunks.length - 1]]);
      r.push([7, this.style(o.style)]); r.push([73, I(1)], [44, '1.0']);
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
        const given = vals[tag] != null && typeof vals[tag] === 'object' ? vals[tag] : null; // v2.31: { v, x, y, rot, h, ha, va } placed by the caller
        const v = given ? String(given.v || '') : vals[tag] != null ? String(vals[tag]) : (o.keepDefaults ? get(df, 1, '') : '');
        const dl = get(df, 8, '0'), at = [[0, 'ATTRIB'], [5, this.d.newHandle()], [330, H], [100, 'AcDbEntity'], [8, dl === '0' ? layer : dl]]; // an attribute of layer 0 follows the insert's layer
        const col = get(df, 62); if (col != null) at.push([62, col]);
        if (given) {
          const gha = given.ha || 0, gva = given.va || 0;
          at.push([100, 'AcDbText'], [10, F(given.x)], [20, F(given.y)], [30, '0.0'], [40, F(given.h || h)], [1, v]);
          if (given.rot) at.push([50, F(given.rot)]);
          at.push([7, this.style(get(df, 7))]);
          if (gha || gva) at.push([72, I(gha)], [11, F(given.x)], [21, F(given.y)], [31, '0.0']);
          at.push([100, 'AcDbAttribute'], [2, tag], [70, I(v && !given.hidden ? 0 : 1)]); if (gva) at.push([74, I(gva)]);
        } else {
          at.push([100, 'AcDbText'], [10, F(p[0])], [20, F(p[1])], [30, '0.0'], [40, F(h)], [1, v]);
          if (rot) at.push([50, F(rot)]);
          at.push([7, this.style(get(df, 7))]);
          if (ha || va) at.push([72, I(ha)], [11, F(q[0])], [21, F(q[1])], [31, '0.0']);
          at.push([100, 'AcDbAttribute'], [2, tag], [70, I(vals[tag] != null || o.keepDefaults ? 0 : 1)]); if (va) at.push([74, I(va)]);
        }
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
  /* ---------------- v2.32: layers, raster images (pole photos, the vicinity map), layers off in some viewports ---------------- */
  /** A layer the template does not have (a copy of an existing one's record), e.g. for the pole photos. Returns its handle. */
  function addLayer(d, S, name, color) {
    if (S.layers.has(name)) return get(S.layers.get(name), 5);
    const T = d.sec('TABLES').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'LAYER'), src = S.layers.get('0') || [...S.layers.values()][0];
    const h = d.newHandle(), r = stripGroups(src).filter(([c]) => c < 1000).map(([c, v]) => [c, c === 5 ? h : c === 2 ? name : c === 62 ? I(color) : c === 70 ? I(0) : c === 6 ? 'Continuous' : v]);
    if (!r.some(([c]) => c === 62)) r.splice(r.findIndex(([c]) => c === 70) + 1, 0, [62, I(color)]);
    const last = T.reduce((k, x, i) => (typ(x) === 'LAYER' ? i : k), -1); T.splice(last + 1, 0, r);
    setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    d.index(); S.layers.set(name, r);
    return h;
  }
  /** Turns layers off (frozen) in one viewport of a sheet only. */
  function vpFreeze(vp, handles) {
    if (!vp || !handles.length) return;
    const k = vp.findIndex(([c]) => c === 90); const add = handles.filter((h) => !vp.some(([c, v]) => c === 341 && v === h)).map((h) => [341, h]);
    vp.splice(k >= 0 ? k : vp.length, 0, ...add);
  }
  /** Raster images: the classes AutoCAD needs, the image dictionary, one IMAGEDEF per file and an IMAGE (with its reactor). */
  class Images {
    constructor(d, S) {
      this.d = d; this.S = S; this.defs = new Map(); this.n = 0;
      const O = d.sec('OBJECTS').recs, root = O[0], k = root.findIndex(([c, v]) => c === 3 && v === 'ACAD_IMAGE_DICT');
      this.dict = k >= 0 ? d.byHandle.get(root[k + 1][1]) : null;
      if (!this.dict) { // a drawing without images yet: the dictionary
        const h = d.newHandle(); this.dict = [[0, 'DICTIONARY'], [5, h], [102, '{ACAD_REACTORS'], [330, get(root, 5)], [102, '}'], [330, get(root, 5)], [100, 'AcDbDictionary'], [281, I(1)]];
        O.push(this.dict); root.push([3, 'ACAD_IMAGE_DICT'], [350, h]); d.index();
      }
    }
    classes() { // IMAGE and IMAGEDEF_REACTOR are classes of their own in the DXF (the template has IMAGEDEF only)
      const raw = this.d.sec('CLASSES').raw, have = new Set(raw.filter(([c]) => c === 1).map(([, v]) => v));
      const add = (n, cpp, flags, ent) => { if (!have.has(n)) raw.push([0, 'CLASS'], [1, n], [2, cpp], [3, 'ISM'], [90, I(flags)], [91, I(0)], [280, I(0)], [281, I(ent ? 1 : 0)]); };
      add('IMAGE', 'AcDbRasterImage', 2175, true); add('IMAGEDEF', 'AcDbRasterImageDef', 0, false); add('IMAGEDEF_REACTOR', 'AcDbRasterImageDefReactor', 1, false); add('RASTERVARIABLES', 'AcDbRasterVariables', 0, false);
    }
    /** An IMAGE in model space: lower left corner (x, y), w × h metres, of a file of px × py pixels next to the drawing. */
    image(o, layer, file, px, py, x, y, w, h) {
      this.classes();
      let def = this.defs.get(file);
      if (!def) {
        def = { h: this.d.newHandle(), users: [], file, px, py }; this.defs.set(file, def);
        this.dict.push([3, `GESAA_${file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60)}_${this.defs.size}`], [350, def.h]);
      }
      const r = o.base('IMAGE', layer), ih = get(r, 5), rh = this.d.newHandle(); def.users.push(rh);
      r.push([100, 'AcDbRasterImage'], [90, I(0)], [10, F(x)], [20, F(y)], [30, '0.0'], [11, String((w / px).toPrecision(12))], [21, '0.0'], [31, '0.0'], [12, '0.0'], [22, String((h / py).toPrecision(12))], [32, '0.0'],
        [13, F(px)], [23, F(py)], [340, def.h], [70, I(7)], [280, I(0)], [281, I(50)], [282, I(50)], [283, I(0)], [360, rh], [71, I(1)], [91, I(2)], [14, '-0.5'], [24, '-0.5'], [14, F(px - 0.5)], [24, F(py - 0.5)], [290, I(0)]);
      o.add(r); this.reactors = (this.reactors || []).concat([[rh, ih]]); this.n++;
      return r;
    }
    /** The objects: written once, after the entities. */
    finish() {
      if (!this.defs.size) return;
      const O = this.d.sec('OBJECTS').recs, dh = get(this.dict, 5);
      for (const def of this.defs.values()) O.push([[0, 'IMAGEDEF'], [5, def.h], [102, '{ACAD_REACTORS'], [330, dh], ...def.users.map((u) => [330, u]), [102, '}'], [330, dh], [100, 'AcDbRasterImageDef'], [90, I(0)], [1, def.file], [10, F(def.px)], [20, F(def.py)], [11, '0.01'], [21, '0.01'], [280, I(1)], [281, I(0)]]);
      for (const [rh, ih] of this.reactors || []) O.push([[0, 'IMAGEDEF_REACTOR'], [5, rh], [330, ih], [100, 'AcDbRasterImageDefReactor'], [90, I(2)], [330, ih]]);
      const raw = this.d.sec('CLASSES').raw; for (let i = 0; i < raw.length; i++) if (raw[i][0] === 1 && (raw[i][1] === 'IMAGE' || raw[i][1] === 'IMAGEDEF_REACTOR')) { const j = raw.findIndex((p, k) => k > i && p[0] === 91); if (j > 0) raw[j] = [91, I(this.n)]; }
      this.d.index();
    }
  }
  /** v2.34: writes entities into an existing block (e.g. the company logo into the title block PAGING, so it is on every sheet). */
  function blockOut(d, S, name) {
    const blk = S.blocks.get(name), brec = S.brByName.get(name); if (!blk || !brec || !blk.end) return null;
    const own = get(brec, 5), B = d.sec('BLOCKS').recs;
    return { base(t, layer, extra) { const r = [[0, t], [5, d.newHandle()], [330, own], [100, 'AcDbEntity'], [8, layer]]; if (extra && extra.color != null) r.push([62, I(extra.color)]); return r; },
      add(r) { B.splice(B.indexOf(blk.end), 0, r); blk.ents.push(r); return r; } };
  }
  /** v2.34: the box of the title block cell round a point of a block (its nearest lines above, below, left and right), or null. */
  function cellOf(ents, px, py) {
    const hs = [], vs = [];
    for (const r of ents) {
      const t = typ(r); let P = null;
      if (t === 'LINE') P = [[+get(r, 10), +get(r, 20)], [+get(r, 11), +get(r, 21)]];
      else if (t === 'LWPOLYLINE') { const xs = all(r, 10).map(Number), ys = all(r, 20).map(Number); P = xs.map((x, i) => [x, ys[i]]); if ((+get(r, 70) || 0) & 1) P.push(P[0]); }
      if (!P) continue;
      for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i];
        if (Math.abs(a[1] - b[1]) < 0.01) hs.push([Math.min(a[0], b[0]), Math.max(a[0], b[0]), a[1]]);
        else if (Math.abs(a[0] - b[0]) < 0.01) vs.push([Math.min(a[1], b[1]), Math.max(a[1], b[1]), a[0]]); }
    }
    const top = Math.min(...hs.filter(([l, r, y]) => l <= px && r >= px && y > py).map((h) => h[2])), bot = Math.max(...hs.filter(([l, r, y]) => l <= px && r >= px && y < py).map((h) => h[2]));
    const left = Math.max(...vs.filter(([b, t, x]) => b <= py && t >= py && x < px).map((v) => v[2])), right = Math.min(...vs.filter(([b, t, x]) => b <= py && t >= py && x > px).map((v) => v[2]));
    return [top, bot, left, right].every(Number.isFinite) ? { x0: left, y0: bot, x1: right, y1: top } : null;
  }
  /** Replaces the whole text of a TEXT or MTEXT (an MTEXT keeps its text in 250-character pieces). */
  function setText(r, nt) {
    if (typ(r) === 'MTEXT') {
      const first = r.findIndex((p, i) => i > 0 && (p[0] === 3 || p[0] === 1)), one = r.findIndex((p, i) => i > 0 && p[0] === 1);
      const chunks = []; for (let i = 0; i < nt.length; i += 250) chunks.push(nt.slice(i, i + 250)); if (!chunks.length) chunks.push('');
      r.splice(first, one - first + 1, ...chunks.slice(0, -1).map((c) => [3, c]), [1, chunks[chunks.length - 1]]);
    } else setFirst(r, 1, nt);
  }
  const textOf = (r) => (typ(r) === 'MTEXT' ? all(r, 3).join('') : '') + (get(r, 1) || '');
  /** The colour and layer of each attribute of a block (for the labels written beside it). */
  function attrLook(S, name) { const out = new Map(); const b = S.blocks.get(name); if (b) for (const e of b.ents) if (typ(e) === 'ATTDEF') out.set(get(e, 2), { color: get(e, 62), layer: get(e, 8, '0') }); return out; }

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

  /* ---------------- roads: width by class, one outline where roads meet (v2.31) ----------------
     Each road is a corridor of its width around its centre line. The drawn pavement edges are the outline of all corridors
     together: an edge is kept only where it is not inside another road, so junctions open cleanly with no lines across them.
     OpenStreetMap ways that continue one another are joined first (the same width), so bends have no gaps. */
  const ROAD_W = { motorway: 14, trunk: 12, primary: 12, secondary: 9, tertiary: 7.5, unclassified: 6, residential: 6, road: 6, busway: 6,
    living_street: 5, pedestrian: 4, service: 4, track: 3.5, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 6 };
  const PATH_RE = /^(path|footway|cycleway|steps|bridleway|corridor|sidewalk|crossing|elevator|platform|via_ferrata|proposed|construction|abandoned|disused|raceway)$/;
  /** Pavement width (m) of a road: its OSM width tag, else its lanes × 3.3 m, else the default of its class; 0 = a path. */
  function roadWidth(r) {
    const hw = String(r.hw || '').toLowerCase();
    if (hw && PATH_RE.test(hw)) return 0;
    if (!hw && r.cls === 'path') return 0;
    const w = parseFloat(r.width); if (w >= 2.5 && w <= 40) return w;
    const ln = parseInt(r.lanes, 10); if (ln >= 1 && ln <= 10) return Math.max(3.5, ln * 3.3);
    if (ROAD_W[hw]) return ROAD_W[hw];
    return r.cls === 'major' ? 9 : 6;
  }
  const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const unit = (a, b) => { const L = dist2(a, b) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  /** Joins road pieces that continue one another (a shared end, the same width): fewer, longer roads with no gaps at bends. */
  function mergeRoads(rs) {
    const TOL = 1.0;
    for (let pass = 0; pass < 60; pass++) {
      const grid = new Map(), ends = [];
      rs.forEach((r, i) => { if (!r.dead) [0, 1].forEach((e) => { const p = e ? r.pts[r.pts.length - 1] : r.pts[0]; ends.push({ i, e, p }); const k = `${Math.floor(p[0] / TOL)},${Math.floor(p[1] / TOL)}`; (grid.get(k) || grid.set(k, []).get(k)).push(ends.length - 1); }); });
      const near = (p) => { const gx = Math.floor(p[0] / TOL), gy = Math.floor(p[1] / TOL), out = []; for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const k of grid.get(`${x},${y}`) || []) if (dist2(ends[k].p, p) <= TOL) out.push(k); return out; };
      const used = new Set(); let merged = 0;
      ends.forEach((A, ka) => {
        if (used.has(A.i)) return;
        const here = near(A.p).filter((k) => ends[k].i !== A.i);
        const deg = here.length + 1;
        let best = null;
        for (const kb of here) {
          const B = ends[kb], ra = rs[A.i], rb = rs[B.i]; if (used.has(B.i) || Math.abs(ra.w - rb.w) > 0.01 || !!ra.bridge !== !!rb.bridge) continue;
          const da = A.e ? unit(ra.pts[ra.pts.length - 2], ra.pts[ra.pts.length - 1]) : unit(ra.pts[1], ra.pts[0]); // pointing out of A at its end
          const db = B.e ? unit(rb.pts[rb.pts.length - 1], rb.pts[rb.pts.length - 2]) : unit(rb.pts[0], rb.pts[1]); // pointing into B from its end
          const turn = Math.acos(Math.max(-1, Math.min(1, da[0] * db[0] + da[1] * db[1]))) * 180 / Math.PI;
          if (deg > 2 && turn > 50) continue;
          const score = turn - (ra.name && ra.name === rb.name ? 30 : 0);
          if (!best || score < best.score) best = { kb, score };
        }
        if (!best) return;
        const B = ends[best.kb], ra = rs[A.i], rb = rs[B.i];
        const pa = A.e ? ra.pts : ra.pts.slice().reverse(), pb = B.e ? rb.pts.slice().reverse() : rb.pts;
        ra.pts = pa.concat(pb.slice(1)); ra.name = ra.name || rb.name; rb.dead = true; used.add(A.i); used.add(B.i); merged++;
      });
      rs = rs.filter((r) => !r.dead);
      if (!merged) break;
    }
    return rs;
  }
  /** A grid of road centre-line segments, to ask "is this point inside another road" and "which road is nearest". */
  class SegIndex {
    constructor(rs, cell) {
      this.c = cell || 40; this.g = new Map();
      rs.forEach((r, ri) => { if (!(r.hw > 0)) return; for (let k = 1; k < r.ext.length; k++) {
        const a = r.ext[k - 1], b = r.ext[k], s = { ri, a, b, hw: r.hw, first: k === 1, last: k === r.ext.length - 1 }, m = r.hw + 1;
        for (let x = Math.floor((Math.min(a[0], b[0]) - m) / this.c); x <= Math.floor((Math.max(a[0], b[0]) + m) / this.c); x++)
          for (let y = Math.floor((Math.min(a[1], b[1]) - m) / this.c); y <= Math.floor((Math.max(a[1], b[1]) + m) / this.c); y++) { const key = `${x},${y}`; (this.g.get(key) || this.g.set(key, []).get(key)).push(s); }
      } });
    }
    at(p) { return this.g.get(`${Math.floor(p[0] / this.c)},${Math.floor(p[1] / this.c)}`) || []; }
    /** Inside a road other than `self` (its corridor, square at its two ends). */
    inside(p, self, tol) {
      for (const s of this.at(p)) {
        if (s.ri === self) continue;
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy || 1e-9, t = ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2;
        if ((t < 0 && s.first) || (t > 1 && s.last)) continue;
        const u = Math.max(0, Math.min(1, t)), d = Math.hypot(p[0] - s.a[0] - u * dx, p[1] - s.a[1] - u * dy);
        if (d < s.hw - (tol == null ? 0.02 : tol)) return true;
      }
      return false;
    }
  }
  /** The nearest road centre line to p within maxD (searching a few grid cells around). */
  function nearestRoad(rs, p, maxD) {
    let best = null;
    rs.forEach((r, ri) => { if (!(r.hw > 0)) return; for (let k = 1; k < r.pts.length; k++) {
      const a = r.pts[k - 1], b = r.pts[k];
      if (Math.min(a[0], b[0]) - maxD - r.hw > p[0] || Math.max(a[0], b[0]) + maxD + r.hw < p[0] || Math.min(a[1], b[1]) - maxD - r.hw > p[1] || Math.max(a[1], b[1]) + maxD + r.hw < p[1]) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      const c = [a[0] + t * dx, a[1] + t * dy], d = dist2(p, c), edge = d - r.hw;
      if (edge <= maxD && (!best || edge < best.edge)) { const L = Math.sqrt(L2); best = { ri, r, c, d, edge, dir: [dx / L, dy / L], side: (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) >= 0 ? 1 : -1 }; }
    } });
    return best;
  }
  /** The parts of a line that are not inside another road (cut points found to about 1 cm). */
  function keepOutside(line, idx, self) {
    const out = []; let cur = null;
    const st = (p) => !idx.inside(p, self);
    const cut = (p, q, sp) => { let a = p, b = q; for (let i = 0; i < 12; i++) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (st(m) === sp) a = m; else b = m; } return sp ? a : b; };
    let prev = line[0], ps = st(prev);
    if (ps) cur = [prev];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], n = Math.max(1, Math.ceil(dist2(a, b) / 1.0));
      for (let k = 1; k <= n; k++) {
        const p = k === n ? b : [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], s = st(p);
        if (s !== ps) { const q = cut(prev, p, ps); if (s) cur = [q]; else { if (cur) { cur.push(q); out.push(cur); } cur = null; } }
        prev = p; ps = s;
      }
      if (ps && cur) cur.push(b);
    }
    if (cur && cur.length > 1) out.push(cur);
    return out.map((l) => l.filter((p, i) => !i || dist2(p, l[i - 1]) > 0.005)).filter((l) => l.length > 1 && l.reduce((t, p, i) => t + (i ? dist2(p, l[i - 1]) : 0), 0) > 0.3);
  }
  /**
   * Roads ready to draw: clipped to `box` (+ a margin, so no road ends inside it), joined, given a width, extended at the ends
   * that meet another road (so corners close). Returns { roads, idx, edges, paths, bridges } with lines clipped to `box`.
   */
  function layoutRoads(list, box) {
    const M = 60, big = [box[0] - M, box[1] - M, box[2] + M, box[3] + M];
    let rs = [];
    for (const r of list || []) { const w = roadWidth(r); for (const piece of clipLine(r.pts, big)) if (piece.length > 1) rs.push({ pts: piece.map((p) => [+p[0], +p[1]]), w, hw: w / 2, name: String(r.name || '').trim(), bridge: !!r.bridge }); }
    rs = mergeRoads(rs);
    // an end that meets another road is carried on into it (by the narrower half width), so outer corners close
    rs.forEach((r, ri) => {
      r.ext = r.pts.slice();
      if (!(r.hw > 0) || r.pts.length < 2) return;
      [0, 1].forEach((e) => {
        const p = e ? r.pts[r.pts.length - 1] : r.pts[0], q = e ? r.pts[r.pts.length - 2] : r.pts[1];
        let other = 0; // the narrowest road whose end is here too (a corner); a road met in its middle (a T) needs nothing
        rs.forEach((o2, oj) => { if (oj === ri || !(o2.hw > 0)) return; if (dist2(o2.pts[0], p) < 1.0 || dist2(o2.pts[o2.pts.length - 1], p) < 1.0) other = other ? Math.min(other, o2.hw) : o2.hw; });
        if (!other) return;
        const u = unit(q, p), ext = Math.min(r.hw, other) - 0.1, np = [p[0] + u[0] * ext, p[1] + u[1] * ext];
        if (e) r.ext.push(np); else r.ext.unshift(np);
      });
    });
    const idx = new SegIndex(rs, 40), raw = [], paths = [], bridges = [];
    rs.forEach((r, ri) => {
      if (r.hw > 0) {
        for (const side of [1, -1]) for (const part of keepOutside(offsetLine(r.ext, side * r.hw), idx, ri)) for (const c of clipLine(part, box)) raw.push(c);
        if (r.bridge) for (const side of [1, -1]) { // a bridge: a line each side, its ends turned out
          const L = offsetLine(r.pts, side * (r.hw + 1.5)); if (L.length < 2) continue;
          const f0 = unit(L[0], L[1]), fe = unit(L[L.length - 2], L[L.length - 1]), n = L.length - 1;
          const s0 = [L[0][0] - f0[0] * 1.6 - side * f0[1] * 1.6, L[0][1] - f0[1] * 1.6 + side * f0[0] * 1.6], s1 = [L[n][0] + fe[0] * 1.6 - side * fe[1] * 1.6, L[n][1] + fe[1] * 1.6 + side * fe[0] * 1.6];
          for (const c of clipLine([s0, ...L, s1], box)) bridges.push(c);
        }
      } else for (const part of keepOutside(r.pts, idx, -1)) for (const c of clipLine(part, box)) paths.push(c);
    });
    const edges = joinLines(raw, 0.05).map((l) => roundCorners(l.pts, l.closed, 4));
    return { roads: rs, idx, edges, paths, bridges };
  }
  /** Joins lines that meet end to end (an edge cut at a junction continues as the other road's edge). */
  function joinLines(lines, tol) {
    const cell = tol * 4, K = (x, y) => `${x},${y}`, ends = new Map(), used = new Array(lines.length).fill(false);
    lines.forEach((l, i) => [0, 1].forEach((e) => { const p = e ? l[l.length - 1] : l[0], k = K(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); (ends.get(k) || ends.set(k, []).get(k)).push([i, e, p]); }));
    const next = (p) => { // an unused line with an end within tol × 2 of p (the cut points of two roads are found separately, to about 1 cm)
      const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell);
      for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const c of ends.get(K(x, y)) || []) if (!used[c[0]] && dist2(c[2], p) <= tol * 2) return c;
      return null;
    };
    const out = [];
    lines.forEach((l, i) => {
      if (used[i]) return; used[i] = true; let pts = l.slice();
      for (let n = 0; n < lines.length; n++) { const c = next(pts[pts.length - 1]); if (!c) break; used[c[0]] = true; const q = c[1] ? lines[c[0]].slice().reverse() : lines[c[0]]; pts = pts.concat(q.slice(1)); }
      for (let n = 0; n < lines.length; n++) { const c = next(pts[0]); if (!c) break; used[c[0]] = true; const q = c[1] ? lines[c[0]] : lines[c[0]].slice().reverse(); pts = q.slice(0, -1).concat(pts); }
      const closed = pts.length > 3 && dist2(pts[0], pts[pts.length - 1]) < tol * 2; if (closed) pts.pop();
      out.push({ pts, closed });
    });
    return out;
  }
  /** Corners turned into arcs (radius up to R, smaller where the sides are short): [x, y, bulge] points. */
  function roundCorners(pts, closed, R) {
    const n = pts.length; if (n < 3) return { pts: pts.map((p) => [p[0], p[1], 0]), closed };
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], p = pts[i], nx = pts[(i + 1) % n];
      if (!closed && (i === 0 || i === n - 1)) { out.push([p[0], p[1], 0]); continue; }
      const d1 = unit(prev, p), d2 = unit(p, nx), dot = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])), th = Math.acos(dot);
      if (th < 12 * Math.PI / 180 || th > 170 * Math.PI / 180) { out.push([p[0], p[1], 0]); continue; }
      const tmax = 0.45 * Math.min(dist2(prev, p), dist2(p, nx)), t = Math.min(R * Math.tan(th / 2), tmax);
      if (t < 0.2) { out.push([p[0], p[1], 0]); continue; }
      const cross = d1[0] * d2[1] - d1[1] * d2[0], b = Math.tan(th / 4) * (cross > 0 ? 1 : -1);
      out.push([p[0] - d1[0] * t, p[1] - d1[1] * t, b], [p[0] + d2[0] * t, p[1] + d2[1] * t, 0]);
    }
    return { pts: out, closed };
  }
  /** Where to write each street name: on its longest straight pieces, at most one per ~350 m, away from the route. */
  function streetNames(rs, avoid, box) {
    const byName = new Map();
    rs.forEach((r) => { if (r.hw > 0 && r.name) (byName.get(r.name) || byName.set(r.name, []).get(r.name)).push(r); });
    const out = [];
    for (const [name, list] of byName) {
      const segs = [];
      for (const r of list) for (const piece of clipLine(r.pts, box)) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); if (L >= 25) segs.push({ a: piece[k - 1], b: piece[k], L, hw: r.hw, m: [(piece[k - 1][0] + piece[k][0]) / 2, (piece[k - 1][1] + piece[k][1]) / 2] }); }
      const clear = (s) => !avoid.some((q) => dist2(q, s.m) < 40);
      segs.sort((x, y) => (clear(y) - clear(x)) || y.L - x.L);
      const chosen = [];
      for (const s of segs) { if (chosen.some((c) => dist2(c.m, s.m) < 350)) continue; chosen.push(s); }
      chosen.forEach((s) => out.push({ name, ...s }));
    }
    return out;
  }

  /* ---------------- free space for labels (v2.31): boxes already used, turned boxes compared exactly ---------------- */
  class Spots {
    constructor() { this.list = []; }
    static box(cx, cy, w, h, deg) { const a = (deg || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a); return { cx, cy, hw: w / 2, hh: h / 2, ux, uy, vx: -uy, vy: ux }; }
    static hit(A, B) {
      const dx = B.cx - A.cx, dy = B.cy - A.cy;
      for (const [x, y] of [[A.ux, A.uy], [A.vx, A.vy], [B.ux, B.uy], [B.vx, B.vy]]) {
        const ra = A.hw * Math.abs(A.ux * x + A.uy * y) + A.hh * Math.abs(A.vx * x + A.vy * y), rb = B.hw * Math.abs(B.ux * x + B.uy * y) + B.hh * Math.abs(B.vx * x + B.vy * y);
        if (Math.abs(dx * x + dy * y) > ra + rb) return false;
      }
      return true;
    }
    hits(b) { let n = 0; for (const x of this.list) if (Spots.hit(b, x)) n++; return n; }
    add(b, tag) { if (Array.isArray(b)) b.forEach((x) => { if (tag) x.tag = tag; this.list.push(x); }); else { if (tag) b.tag = tag; this.list.push(b); } return b; }
    line(pts, w) { for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], L = dist2(a, b); if (L > 0.01) this.add(Spots.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L, w, Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI)); } }
  }
  const CHW = 0.72; // width of a character / text height (Arial capitals and digits, a little generous)
  /** The box of a one-line text: anchored at (x, y) by ha (0 left, 1 centre, 2 right) and va (0 base, 2 middle, 3 top). */
  function textBox(x, y, h, s, deg, ha, va) {
    const w = Math.max(1, String(s).length) * h * CHW, a = (deg || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const du = ha === 1 ? 0 : ha === 2 ? -w / 2 : w / 2, dv = va === 2 ? 0 : va === 3 ? -h * 0.6 : h * 0.5;
    return Spots.box(x + ux * du + vx * dv, y + uy * du + vy * dv, w + h * 0.3, h * 1.25, deg);
  }
  /** First candidate that is free (else the one with the fewest overlaps). */
  function pick(spots, cands) { let best = null; for (const c of cands) { const n = c.boxes.reduce((t, b) => t + spots.hits(b), 0); if (!n) return c; if (!best || n < best.n) best = { ...c, n }; } return best; }
  const deg = (v) => Math.atan2(v[1], v[0]) * 180 / Math.PI;
  const rotv = (v, a) => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
  const add2 = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];

  /* ---------------- the template's models for poles, arms and guys ---------------- */
  const POLE_SYM = { // v2.32: about two thirds of the legend's size, smaller again where poles stand close together
    prop: { b: 'P-POLE', layer: 'P-GPOLE', sc: 1.4667, r: 2.2 },
    elec: { b: 'existing electric pole', layer: 'ELECTRIC POLE', sc: 0.647, r: 1.7 },
    tel: { b: 'existing telecom pole', layer: 'GT-POLE', sc: 1.87, r: 2.3 },
  };
  // an arm: its block, the way from the pole to the cable in the block, how far it reaches (m), its layer
  const ARMS = [
    { re: /pin|alley/i, b: '10 pin', dir: [1, 0], reach: 6, layer: 'PROPOSED 10 PIN ALLEY ARM' },
    { re: /44/, b: 'extension 44 arm', dir: [1, 0], reach: 7, layer: 'PROPOSED EXTENSION ARM 44.5' },
    { re: /26|24/, b: 'extension arm 26', dir: [1, 0], reach: 6, layer: 'PROPOSED EXTENSION ARM 26' },
    { re: /double/i, b: 'double arm', dir: [0, -1], reach: 5, layer: 'PROPOSED DOUBLE ARM' },
    { re: /single|arm/i, b: 'proposed single arm', dir: [0, -1], reach: 5, layer: 'PROPOSED SINGLE ARM' },
  ];
  const armOf = (s) => (s ? ARMS.find((a) => a.re.test(String(s))) : null);
  // a guy: its code, the template block it is drawn from, its layer, how it stands (head: in line with the cable; side: against the pull)
  const GUYS = [
    { re: /pole.?to.?pole|p2p/i, code: 'P2P', b: 'proposed pole to pole guy', layer: 'PROPOSED P2P GUY', head: false, len: 22 },
    { re: /sidewalk\s*head|swh/i, code: 'SWH', b: 'SWH', layer: 'PROPOSED SWH GUY', head: true, sc: 1.749630906627053 },
    { re: /sidewalk|\bsw\b/i, code: 'SW', b: 'SW', layer: 'PROPOSED SW GUY', head: false, sc: 1.749630906627053 },
    { re: /down/i, code: 'DG', b: 'HG', layer: 'PROPOSED HEAD GUY', head: true, sc: 1.749630906627053 },
    { re: /head/i, code: 'HG', b: 'HG', layer: 'PROPOSED HEAD GUY', head: true, sc: 1.749630906627053 },
    { re: /side|guy/i, code: 'SG', b: 'SG', layer: 'PROPOSED SIDE GUY', head: false, sc: 1.749630906627053 },
  ];
  const guysOf = (s) => String(s || '').split(/\s*\+\s*/).filter(Boolean).map((x) => GUYS.find((g) => g.re.test(x))).filter(Boolean);
  /** A copy of a template block without its texts (the guy symbols carry a fixed "SG 6M"; the app writes its own, readable). */
  function copyBlock(d, S, src, name, keep) {
    if (S.blocks.has(name)) return true;
    const b = S.blocks.get(src); if (!b) return false;
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD');
    const brH = d.newHandle(), map = new Map(), ents = b.ents.filter(keep);
    ents.forEach((e) => map.set(get(e, 5), d.newHandle()));
    const brec = [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]];
    const last = T.reduce((k, r, i) => (typ(r) === 'BLOCK_RECORD' ? i : k), -1); T.splice(last + 1, 0, brec);
    setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    const copy = (e) => {
      let r = stripGroups(e).filter(([c]) => c < 1000);
      if (typ(r) === 'HATCH') { // no links back to the source block's boundary objects
        const o = []; for (let i = 0; i < r.length; i++) { const [c, v] = r[i]; if (c === 97) { const n = parseInt(v, 10) || 0; o.push([97, I(0)]); i += n; continue; } if (c === 71 && i > 0 && r.slice(0, i).some((p) => p[0] === 100 && p[1] === 'AcDbHatch')) { o.push([71, I(0)]); continue; } o.push([c, v]); } r = o;
      }
      let ownerSet = false;
      return r.map(([c, v]) => { if (c === 5) return [5, map.get(v) || d.newHandle()]; if (c === 330 && !ownerSet) { ownerSet = true; return [330, brH]; } return [c, v]; });
    };
    const bb = get(b.begin, 10, '0.0'), bb2 = get(b.begin, 20, '0.0');
    const out = [[[0, 'BLOCK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'], [2, name], [70, I(0)], [10, bb], [20, bb2], [30, '0.0'], [3, name], [1, '']], ...ents.map(copy),
      [[0, 'ENDBLK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']]];
    const pos = B.indexOf(b.end); B.splice(pos >= 0 ? pos + 1 : B.length, 0, ...out);
    d.index(); Object.assign(S, structure(d));
    return true;
  }
  /** Ends of a block's drawn lines along its x axis: [the leftmost vertex, the rightmost vertex]. */
  function lineEnds(S, name) {
    const b = S.blocks.get(name); if (!b) return null; let lo = null, hi = null;
    const see = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; if (!lo || x < lo[0]) lo = [x, y]; if (!hi || x > hi[0]) hi = [x, y]; };
    for (const e of b.ents) { const t = typ(e); if (t === 'LINE') { see(num(e, 10), num(e, 20)); see(num(e, 11), num(e, 21)); } else if (t === 'LWPOLYLINE') { const X = all(e, 10).map(Number), Y = all(e, 20).map(Number); X.forEach((x, i) => see(x, Y[i])); } }
    return lo && hi ? [lo, hi] : null;
  }
  /** The highest vertex of a block's lines (the pole end of an arm drawn upright). */
  function topVertex(S, name) {
    const b = S.blocks.get(name); if (!b) return null; let top = null;
    for (const e of b.ents) { const t = typ(e); const pts = t === 'LINE' ? [[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]] : t === 'LWPOLYLINE' ? all(e, 10).map((x, i) => [Number(x), Number(all(e, 20)[i])]) : []; pts.forEach((q) => { if (!top || q[1] > top[1]) top = q; }); }
    return top;
  }
  /** Chains of spans with the same cable (ids in order), like the app's route runs. */
  function chainsOf(spans) {
    const adj = new Map(), used = new Array(spans.length).fill(false), K = (v) => String(v), kind = (s) => `${s.cable || ''}|${s.existing ? 1 : 0}`; // a run: one cable type, new or existing
    spans.forEach((s, i) => { [s.ia, s.ib].forEach((id) => (adj.get(K(id)) || adj.set(K(id), []).get(K(id))).push(i)); });
    const ends = (id) => { const a = adj.get(id); return a.length !== 2 || kind(spans[a[0]]) !== kind(spans[a[1]]); };
    const walk = (start, first) => {
      const ids = [start]; let cur = start, e = first;
      for (;;) {
        used[e] = true; const s = spans[e], nx = K(s.ia) === cur ? K(s.ib) : K(s.ia); ids.push(nx); cur = nx;
        if (cur === start || adj.get(cur).length !== 2) break;
        const ne = adj.get(cur).find((k) => !used[k] && kind(spans[k]) === kind(s)); if (ne == null) break; e = ne;
      }
      return { ids, cable: spans[first].cable || '', existing: !!spans[first].existing };
    };
    const out = [];
    [...adj.keys()].filter(ends).forEach((id) => adj.get(id).forEach((e) => { if (!used[e]) out.push(walk(id, e)); }));
    spans.forEach((s, e) => { if (!used[e]) out.push(walk(K(s.ia), e)); });
    return out;
  }

  /* ---------------- the build ---------------- */
  // v2.32: new fiber red, existing fiber blue (the drafting rule); aerial dashed, underground solid
  const CABLE_STYLE = { F72: { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true }, L12: { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true }, U144: { layer: 'Proposed foc duct', color: 1, w: 0.7776, aerial: false }, '': { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true } };
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
    spans.forEach((sp) => { const a = sp.a, b = sp.b; if (!a || !b) return; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (let s = 0; s <= n; s++) samp.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); });
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
    // v2.32: the vicinity map is drawn beside the plan in model space (east of it), so it never covers the plan there
    const VDX = vic[2] * 1.5, vsh = (q) => [q[0] + VDX, q[1], q[2] || 0];
    const vm = S.layouts.find((L) => L.name === 'VICINITY MAP'); if (vm) aim(bigVp(vm), vic[0] + VDX, vic[1], vic[2]);
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
    // roads (OpenStreetMap): pavement edges by class, one outline where roads meet; paths as grey centre lines; bridges
    const vb = [vic[0] - vic[2] / 2, vic[1] - vic[2] / 2, vic[0] + vic[2] / 2, vic[1] + vic[2] / 2];
    // v2.32: the vicinity map: a street map picture of the area (when the phone could get one), under everything else
    let imgs = null; const getImgs = () => imgs || (imgs = new Images(d, S));
    const VLAY = 'G-ESAA VICINITY', VMAP = 'G-ESAA VICINITY MAP';
    if (job.vicImage && job.vicImage.file) { addLayer(d, S, VMAP, 7); getImgs().image(o, VMAP, job.vicImage.file, job.vicImage.px, job.vicImage.py, vb[0] + VDX, vb[1], vic[2], vic[2]); }
    const R = layoutRoads(job.roads || [], vb);
    R.edges.forEach((l) => o.lwpoly(lay('ROAD PAVEMENT'), l.pts, { closed: l.closed }));
    R.paths.forEach((l) => o.lwpoly(lay('ROAD PAVEMENT'), l, { color: 8 }));
    R.bridges.forEach((l) => o.lwpoly(lay('BRIDGE', 'ROAD PAVEMENT'), l, { color: 5 }));
    const nRoads = R.roads.length;
    if (nRoads) o.text(lay('BASEMAP'), gx0 + 5, gy0 - 12, 4, `ROADS: (c) OPENSTREETMAP CONTRIBUTORS (ODbL)${job.roadsNote ? ` · ${String(job.roadsNote).toUpperCase()}` : ''}`, { style: 'arial' });

    /* the route: poles beside their road, the cable on the road side of the poles, every label where it does not overlap */
    const spots = new Spots(), byId = new Map(pts.map((p) => [String(p.id), p])), nb = new Map();
    spans.forEach((s) => [[s.ia, s.ib], [s.ib, s.ia]].forEach(([x, y]) => { const P = byId.get(String(x)), Q = byId.get(String(y)); if (P && Q && P !== Q) (nb.get(P) || nb.set(P, []).get(P)).push(Q); }));
    const symOf = (p) => (p.status === 'Proposed' || p.status === 'New' ? POLE_SYM.prop : p.telco ? POLE_SYM.tel : POLE_SYM.elec);
    // v2.34: the road edges near the route are obstacles too: labels, span lengths and photos keep off the road lines
    { const nearRoute = (m) => pts.some((p) => Math.abs(p.E - m[0]) < 160 && Math.abs(p.N - m[1]) < 160);
      for (const l of R.edges) for (let k = 1; k < l.pts.length + (l.closed ? 1 : 0); k++) {
        const a = l.pts[k - 1], b = l.pts[k % l.pts.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = dist2(a, b);
        if (L > 0.05 && nearRoute(m)) spots.add(Spots.box(m[0], m[1], L, 0.25, deg(unit(a, b))), 'road');
      } }
    // 1. each pole beside the nearest road (within 25 m of its edge), on the side of its pin. v2.34: one size for every pole,
    //    label and photo of the drawing, smaller when poles stand close (k: 1 when most poles are 25 m apart or more, down to
    //    0.6; set by the closest fifth of the poles, so one close pair does not shrink everything)
    const POLE_GAP = 3.0, CABLE_OFF = 1.0; // pole centre = road edge + its radius + POLE_GAP; cable = pole edge + CABLE_OFF (2 m outside the road edge)
    const polesOnly = pts.filter((p) => p.el === 'Pole');
    const nns = polesOnly.map((p) => { let nn = 1e9; for (const q of polesOnly) if (q !== p) nn = Math.min(nn, Math.hypot(q.E - p.E, q.N - p.N)); return nn; }).filter((v) => v < 1e8).sort((a, b) => a - b);
    const kG = Math.max(0.6, Math.min(1, (nns.length ? nns[Math.floor(nns.length * 0.2)] : 25) / 25));
    for (const p of polesOnly) p.k = kG;
    for (const p of pts) {
      p.dp = [p.E, p.N]; p.td = null; p.near = null;
      if (p.el !== 'Pole') continue;
      p.sym = S.blocks.has(symOf(p).b) ? symOf(p) : { ...symOf(p), b: null }; p.rp = p.sym.r * p.k;
      const near = nearestRoad(R.roads, p.dp, 25); if (!near) continue;
      p.near = near; p.side = near.d < 0.4 ? 0 : near.side;
    }
    for (const p of pts) if (p.near && !p.side) { const q = (nb.get(p) || []).find((x) => x.near && x.side && x.near.ri === p.near.ri); p.side = q ? q.side : 1; }
    for (const p of pts) {
      if (!p.near) continue;
      const out = (nr, side) => [-nr.dir[1] * side, nr.dir[0] * side], n = out(p.near, p.side);
      // v2.34: the pole POLE_GAP from the road edge, so the cable runs between the edge and the pole, outside the pavement lines
      let q = add2(p.near.c, n, p.near.r.hw + p.rp + POLE_GAP);
      for (let it = 0; it < 4; it++) { const o2 = nearestRoad(R.roads, q, p.rp + POLE_GAP - 0.1); if (!o2) break; q = add2(o2.c, out(o2, o2.side), o2.r.hw + p.rp + POLE_GAP); } // a corner pole: out of the other road too
      p.dp = q; p.td = [-n[0], -n[1]]; p.moved = dist2(q, [p.E, p.N]);
    }
    const tangent = (p) => { const Q = nb.get(p) || []; return Q.length >= 2 ? unit(Q[0].dp, Q[1].dp) : Q.length === 1 ? unit(p.dp, Q[0].dp) : [1, 0]; };
    // 2. where the cable meets each pole: on its road side, past its arm when it has one
    for (const p of pts) {
      if (p.el !== 'Pole') { p.A = p.dp; continue; }
      p.arm = armOf(p.armType); if (p.arm && !S.blocks.has(p.arm.b)) p.arm = null;
      if (!p.td) { const t = tangent(p), L = [-t[1], t[0]], q = (nb.get(p) || []).find((x) => x.td); let s = 1; if (q) { const tq = tangent(q); s = Math.sign(q.td[0] * -tq[1] + q.td[1] * tq[0]) || 1; } p.td = [L[0] * s, L[1] * s]; p.free = true; }
      p.A = add2(p.dp, p.td, p.rp + (p.arm ? p.arm.reach : CABLE_OFF)); // v2.34: close to the pole (was 3 m), outside the road edge
    }
    // 3. the cable runs
    const chains = chainsOf(spans), label = new Map((runs || []).map((r) => [r.cable, r.label]));
    for (const ch of chains) {
      const line = ch.ids.map((id) => byId.get(id)).filter(Boolean).map((p) => p.A); if (line.length < 2) continue;
      // v2.32: aerial cable as a broken line (DASHED at linetype scale 7, 9 when existing, as the template's own sample drawing),
      // underground solid; red new, blue existing
      const st = CABLE_STYLE[ch.cable] || CABLE_STYLE[''], lt = st.aerial ? ['DASHED', 'AERCA'].find((n) => S.ltypes.has(n)) : 'Continuous';
      o.lwpoly(lay(st.layer, 'Proposed foc aerial'), line, { w: st.w, color: ch.existing ? 5 : st.color, lt, lts: lt === 'DASHED' ? (ch.existing ? 9 : 7) : 0, gen: true }); spots.line(line, 1.5); spots.list.slice(-line.length + 1).forEach((b) => { b.tag = 'cable'; });
      ch.line = line;
    }
    // 4. poles and the other points: symbols first (they are fixed), then the labels round them
    for (const p of pts) {
      const isNew = p.status === 'Proposed' || p.status === 'New';
      if (p.el === 'Pole') {
        spots.add(Spots.box(p.dp[0], p.dp[1], p.rp * 2.2, p.rp * 2.2, 0));
        if (p.arm) { // the arm, from the pole to the cable
          const bb = blockBox(S, p.arm.b, 0), along = p.arm.dir[0] ? bb[2] - bb[0] : bb[3] - bb[1], sc = p.arm.reach / (along || 1), top = topVertex(S, p.arm.b);
          const end = p.arm.dir[0] ? [bb[0], (bb[1] + bb[3]) / 2] : [top ? top[0] : (bb[0] + bb[2]) / 2, bb[3]], rot = deg(p.td) - deg(p.arm.dir), at = add2(p.dp, p.td, p.rp), e = rotv([end[0] * sc, end[1] * sc], rot);
          o.insert(lay(p.arm.layer), p.arm.b, at[0] - e[0], at[1] - e[1], { scale: sc, rot });
          const m = add2(p.dp, p.td, p.rp + p.arm.reach / 2); spots.add(Spots.box(m[0], m[1], p.arm.reach, 4, deg(p.td)));
        }
      } else if (p.el === 'Site') {
        o.insert(lay('X-BTS'), 'X-BTS', p.E, p.N, { scale: 2.4, attrs: { BTS_NAME: p.siteName || p.poleId || '', PLA_ID: p.plaId || '' } }); spots.add(Spots.box(p.E, p.N + 24, 26, 50, 0));
      } else if (p.el === 'ODF') {
        o.insert(isNew ? lay('P-HOST') : lay('X-HOST'), isNew ? 'P-HOST' : 'X-HOST', p.E, p.N, { scale: 0.28, attrs: { HST_NAM: p.poleId || '', HST_COD: '', HST_LET: 'H' } }); spots.add(Spots.box(p.E, p.N, 10, 10, 0));
      } else if (p.el === 'ODC') {
        o.insert(isNew ? lay('PROPOSED LCP') : lay('EXISTING LCP'), isNew ? 'proposed LCP' : 'existing LCP', p.E, p.N, { scale: 0.7803353843555049, center: true }); spots.add(Spots.box(p.E, p.N, 20, 9, 0));
        if (p.poleId) { o.text(lay('Proposed LCP ID', 'MISC'), p.E, p.N - 8, 2.5, p.poleId, { ha: 1, va: 2, style: 'arial' }); spots.add(textBox(p.E, p.N - 8, 2.5, p.poleId, 0, 1, 2)); }
      } else if (p.el === 'NAP') {
        o.insert(isNew ? lay('PROPOSED NAP') : lay('EXISTING NAP'), isNew ? 'proposed NAP' : 'existing NAP', p.E, p.N, { scale: 0.7803353843555049, center: true }); spots.add(Spots.box(p.E, p.N, 20, 9, 0));
        if (p.poleId) { o.text(lay('Proposed NAP ID', 'MISC'), p.E, p.N - 7, 2.5, p.poleId, { ha: 1, va: 2, style: 'arial' }); spots.add(textBox(p.E, p.N - 7, 2.5, p.poleId, 0, 1, 2)); }
      } else if (p.el === 'Closure') {
        o.insert(lay('P-JOINT'), 'P-Joint', p.E, p.N, { scale: 4.35, attrs: { JT_ID: p.poleId || p.closureId || '', JOINT: 'JT' } }); spots.add(Spots.box(p.E, p.N, 9, 9, 0));
      } else if (p.el === 'Handhole') {
        o.insert(isNew ? lay('PROPOSED HH') : lay('EXISTING HH'), isNew ? 'proposed Handhole' : 'HANDHOLE', p.E, p.N, { scale: 0.7803353843555049, center: true }); spots.add(Spots.box(p.E, p.N, 7, 7, 0));
        if (p.poleId) o.text(lay('MISC'), p.E, p.N - 7, 2.5, p.poleId, { ha: 1, va: 2, style: 'arial' });
      } else o.circle(lay('MISC'), p.E, p.N, 2);
    }
    // 7. guys: against the pull of the cable (a head guy in line with it), drawn with the template's guy symbols
    for (const p of pts) {
      const list = p.el === 'Pole' ? guysOf(p.guy) : []; if (!list.length) continue;
      const Q = nb.get(p) || [], us = Q.map((q) => unit(p.dp, q.dp)), sum = us.reduce((t, u) => [t[0] + u[0], t[1] + u[1]], [0, 0]), sl = Math.hypot(sum[0], sum[1]);
      const outw = [-p.td[0], -p.td[1]], dirs = [];
      for (const g of list) {
        let v = g.head ? (us.length === 1 ? [-us[0][0], -us[0][1]] : sl > 0.3 ? [-sum[0] / sl, -sum[1] / sl] : us.length ? [-us[0][0], -us[0][1]] : outw) : (sl > 0.3 ? [-sum[0] / sl, -sum[1] / sl] : outw);
        for (let k = 0; k < 6 && dirs.some((w) => w[0] * v[0] + w[1] * v[1] > Math.cos(20 * Math.PI / 180)); k++) v = rotv(v, 35);
        dirs.push(v);
        const name = `G-ESAA ${g.code === 'DG' ? 'HG' : g.code}`;
        if (!copyBlock(d, S, g.b, name, (e) => typ(e) !== 'MTEXT' && typ(e) !== 'TEXT')) continue;
        const ends = lineEnds(S, name); if (!ends) continue;
        const L0 = ends[1][0] - ends[0][0], sc = g.len ? g.len / L0 : g.sc, rot = deg(v), at = add2(p.dp, v, p.rp), e = rotv([ends[0][0] * sc, ends[0][1] * sc], rot);
        o.insert(lay(g.layer), name, at[0] - e[0], at[1] - e[1], { scale: sc, rot });
        const tip = add2(at, v, L0 * sc + 1.2), rr = readable(rot), flip = Math.abs(((rot - rr) % 360 + 360) % 360 - 180) < 1;
        o.text(lay(g.layer), tip[0], tip[1], 2.33, g.code, { rot: rr, ha: flip ? 2 : 0, va: 2, style: 'arial', color: 1 });
        const m = add2(at, v, (L0 * sc) / 2); spots.add(Spots.box(m[0], m[1], L0 * sc, 4, rot)); spots.add(textBox(tip[0], tip[1], 2.33, g.code, rr, flip ? 2 : 0, 2));
      }
    }
    // 9. NAPs on poles: beside the pole, outward, where there is room
    for (const p of pts) {
      if (p.el !== 'Pole' || !(p.nap || p.napId)) continue;
      const t = tangent(p), ow = [-p.td[0], -p.td[1]];
      const c = pick(spots, [[16, 10], [-16, 10], [28, 6], [-28, 6], [0, 30], [16, -14], [-16, -14]].map(([k, j]) => { const q = add2(add2(p.dp, t, k), ow, j); return { q, boxes: [Spots.box(q[0] + 1, q[1] - 1, 24, 13, 0), textBox(q[0], q[1] + 7.5, 2.5, p.napId || 'NAP', 0, 1, 2)] }; }));
      o.insert(lay('PROPOSED NAP'), 'proposed NAP', c.q[0], c.q[1], { scale: 0.7803353843555049, center: true }); spots.add(c.boxes);
      if (p.napId) o.text(lay('Proposed NAP ID', 'MISC'), c.q[0], c.q[1] + 7.5, 2.5, p.napId, { ha: 1, va: 2, style: 'arial' });
    }
    // 8. the pole labels (the template's attributes: proposed pole / height / clamp, material / pole tag), the coordinates and
    //    the pole number in its circle, outward from the road; turned a little where a neighbour's label is in the way
    const poleOrder = []; const seen = new Set();
    const startOf = (ch) => { const a = byId.get(ch.ids[0]), b = byId.get(ch.ids[ch.ids.length - 1]); return (b && b.el !== 'Pole' && !(a && a.el !== 'Pole')) ? ch.ids.slice().reverse() : ch.ids; };
    chains.slice().sort((x, y) => (y.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0) - (x.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0))
      .forEach((ch) => startOf(ch).forEach((id) => { const p = byId.get(id); if (p && p.el === 'Pole' && !seen.has(p)) { seen.add(p); poleOrder.push(p); } }));
    pts.forEach((p) => { if (p.el === 'Pole' && !seen.has(p)) { seen.add(p); poleOrder.push(p); } });
    let seq = 0;
    for (const p of poleOrder) {
      seq++;
      const H = Math.max(1.5, 2.2 * p.k), HL = Math.max(0.9, 1.2 * p.k), size = p.size || (p.clamp ? `CA ${p.clamp}` : ''); // size: the clamp size (the app records no other size of an existing pole)
      // v2.33: the pole tag without its material prefix (material CC + tag CC-0430621 → CC / 0430621), as the template's sample
      const bare = (v) => { const m = String(p.mat || '').trim(), t = String(v || ''); return m && t.toUpperCase().startsWith(m.toUpperCase()) && /^([-_ .][A-Z0-9]|\d)/i.test(t.slice(m.length)) && t.length > m.length ? t.slice(m.length).replace(/^[-_ .]/, '') : t; };
      const tag = bare(p.tag != null && p.tag !== '' ? p.tag : (!p.poleId || /^NPT/i.test(p.poleId) ? 'NPT' : p.poleId));
      const lines = p.sym.r === POLE_SYM.prop.r ? [['GT-POLE', p.label1 || 'PROP.POLE'], ['PHEIGHT', p.height || ''], ['POLE_CLAMP', p.clamp ? `CA ${p.clamp}` : '']]
        : p.sym.b === 'existing telecom pole' ? [['OC', p.mat || ''], ['GT-001', bare(p.poleId || '')], ['', size]] : [['CC', p.mat || ''], ['NPT', tag], ['B', size]];
      const shown = lines.filter(([, v]) => v);
      const lat = `${p.lat.toFixed(6)}°`, lon = `${p.lon.toFixed(6)}°`;
      const ll = `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`;
      // one stack in the direction of the ID, read from the pole outward: material / tag (/ size), then latitude / longitude
      // smaller under them (v2.33: the coordinates are part of the stack, as in the template's sample)
      const n = shown.length, gap = 0.35 * H, llH = HL * (1 + 5 / 3), T = n * 1.5 * H + gap + llH;
      const cands = [];
      for (const a of [0, 30, -30, 60, -60, 90, -90, 120, -120]) {
        const ov = rotv([-p.td[0], -p.td[1]], a), dg = deg(ov), rr = readable(dg), flip = Math.abs(((dg - rr) % 360 + 360) % 360 - 180) < 1, ha = flip ? 2 : 0;
        const up = rotv([Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)], 90);
        const base = add2(p.dp, ov, p.rp + 1.2), boxes = [], place = [];
        shown.forEach(([t, v], k) => { const q = add2(base, up, T / 2 - (k + 0.5) * 1.5 * H); place.push([t, v, q]); boxes.push(textBox(q[0], q[1], H, v, rr, ha, 2)); });
        const llAt = add2(base, up, T / 2 - n * 1.5 * H - gap - llH / 2);
        [[lat, HL * 5 / 6], [lon, -HL * 5 / 6]].forEach(([v, dy]) => { const q = add2(llAt, up, dy); boxes.push(textBox(q[0], q[1], HL, v, rr, ha, 2)); });
        cands.push({ boxes, place, rr, ha, llAt, ov, flip });
      }
      const c = pick(spots, cands); spots.add(c.boxes, 'label:' + p.poleId);
      // the block keeps the values in its attributes (hidden); the labels are plain texts in one direction (the pole blocks
      // of the template are dynamic blocks, and AutoCAD would put some of their attributes back where the block wants them)
      const attrs = {}; lines.forEach(([t, v]) => { if (t) attrs[t] = { v, x: p.dp[0], y: p.dp[1], rot: c.rr, h: H, ha: 0, va: 0, hidden: true }; });
      if (p.sym.b) o.insert(lay(p.sym.layer), p.sym.b, p.dp[0], p.dp[1], { scale: p.sym.sc * p.k, center: true, attrs }); else o.circle(lay(p.sym.layer), p.dp[0], p.dp[1], p.rp);
      const look = p.sym.b ? attrLook(S, p.sym.b) : new Map();
      c.place.forEach(([t, v, q]) => { const lk = look.get(t) || {}; o.text(lk.layer && lk.layer !== '0' ? lay(lk.layer) : lay(p.sym.layer), q[0], q[1], H, v, { rot: c.rr, ha: c.ha, va: 2, style: 'arial', color: lk.color != null ? +lk.color : null }); });
      o.mtext(lay('LATLONG'), c.llAt[0], c.llAt[1], HL, ll, { style: '样式 1', att: c.flip ? 6 : 4, dir: [Math.cos(c.rr * Math.PI / 180), Math.sin(c.rr * Math.PI / 180)] });
      p.seq = seq; p.ov = c.ov;
    }
    // 5. span lengths: mid-span, on the road side of the cable (a span over the maximum in red)
    for (const s of spans) {
      const P = byId.get(String(s.ia)), Q = byId.get(String(s.ib)); if (!P || !Q) continue;
      const a = P.A, b = Q.A, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t = unit(a, b), rd = readable(deg(t)), nl = [-t[1], t[0]];
      const toward = [(P.td ? P.td[0] : 0) + (Q.td ? Q.td[0] : 0), (P.td ? P.td[1] : 0) + (Q.td ? Q.td[1] : 0)], sgn = (nl[0] * toward[0] + nl[1] * toward[1]) < 0 ? -1 : 1;
      const txt = `${s.len.toFixed(1)}m${s.long ? ` (OVER ${job.maxSpan || 200}m)` : ''}`;
      // v2.34: one size and style for every span length of the drawing, along the cable, where it covers neither the cable nor a road line
      const L = dist2(a, b), cs = [], th = Math.max(1.4, 2.0 * kG), off = th * 0.75 + 0.6;
      for (const [f, k] of [[0, 1], [0, -1], [0.2, 1], [-0.2, 1], [0.2, -1], [-0.2, -1], [0, 1.7], [0, -1.7], [0.35, 1], [-0.35, 1], [0.35, -1], [-0.35, -1], [0.2, 1.7], [-0.2, 1.7], [0.2, -1.7], [-0.2, -1.7], [0, 2.5], [0, -2.5], [0, 3.4], [0, -3.4]]) { const q = add2(add2(m, t, f * L), nl, k * off * sgn); cs.push({ q, boxes: [textBox(q[0], q[1], th, txt, rd, 1, 2)] }); }
      const c = pick(spots, cs);
      o.text(lay('Distance Data'), c.q[0], c.q[1], th, txt, { rot: rd, ha: 1, va: 2, style: 'arial', color: s.long ? 1 : null }); spots.add(c.boxes);
    }
    // 6. loops (on the cable) and closures (beside it), at the poles that have them
    for (const p of pts) {
      if (p.el !== 'Pole') continue;
      const t = tangent(p), rd = readable(deg(t));
      if (p.mloop) {
        o.insert(lay('PROPOSED LOOP'), 'loopp', p.A[0], p.A[1], { scale: 2.470465709436871, rot: deg(t) + 180, center: true }); spots.add(Spots.box(p.A[0], p.A[1], 10, 7, deg(t)));
        const txt = `${(job.mloopLen || 15).toFixed(1)}m LOOP`;
        const cs = []; for (const j of [4.5, 8, 11.5, -2]) for (const k of [0, 6, -6, 12, -12, 18, -18]) { const q = add2(add2(p.A, t, k), p.td, j); cs.push({ q, boxes: [textBox(q[0], q[1], 2.8125, txt, rd, 1, 2)] }); }
        const c = pick(spots, cs);
        o.text(lay('PROPOSED LOOP'), c.q[0], c.q[1], 2.8125, txt, { rot: rd, ha: 1, va: 2 }); spots.add(c.boxes, 'loop');
      }
      if (p.closure || p.closureId) {
        const c = pick(spots, [[6, 4.5], [-6, 4.5], [0, 9], [12, 6], [-12, 6], [10, -4], [-10, -4], [18, 4], [-18, 4]].map(([k, j]) => { const q = add2(add2(p.A, t, k), p.td, j); return { q, boxes: [Spots.box(q[0], q[1], 9, 9, rd), textBox(q[0] + 5, q[1] + 1.8, 3, 'PROPOSED', 0, 0, 2), textBox(q[0] + 5, q[1] - 2.6, 3, p.closureId || 'CLOSURE', 0, 0, 2)] }; }));
        const jt = { JT_ID: { v: 'PROPOSED', x: c.q[0] + 5, y: c.q[1] + 1.8, h: 3.0, ha: 0, va: 2 }, JOINT: { v: p.closureId || 'CLOSURE', x: c.q[0] + 5, y: c.q[1] - 2.6, h: 3.0, ha: 0, va: 2 } };
        o.insert(lay('P-JOINT'), 'P-Joint', c.q[0], c.q[1], { scale: 4.35, rot: rd, attrs: jt }); spots.add(c.boxes);
      }
    }
    // 10. the cable's name along each run, where there is room
    for (const ch of chains) {
      const txt = label.get(ch.cable); if (!txt || !ch.line) continue;
      let best = null; for (let k = 1; k < ch.line.length; k++) { const L = dist2(ch.line[k - 1], ch.line[k]); if (!best || L > best.L) best = { L, a: ch.line[k - 1], b: ch.line[k] }; }
      const t = unit(best.a, best.b), rd = readable(deg(t)), nl = [-t[1], t[0]], cands = [];
      for (const f of [0.3, 0.7, 0.5, 0.15, 0.85]) for (const k of [7.5, -7.5, 11, -11]) { const q = add2(add2(best.a, t, best.L * f), nl, k); cands.push({ q, boxes: [textBox(q[0], q[1], 3, txt, rd, 1, 2)] }); }
      const c = pick(spots, cands); o.text(lay('MISC'), c.q[0], c.q[1], 3.0, txt, { rot: rd, ha: 1, va: 2, style: 'arial', color: (CABLE_STYLE[ch.cable] || {}).color || null }); spots.add(c.boxes);
    }
    // the photo of each pole right beside it, upright (v2.32: instead of the pole number). v2.34: every photo one size, no line
    // to the pole, covering nothing (labels, cable, road lines, symbols, other photos); when too many find no free place, all the
    // photos are made smaller (twice at most). A pole without a photo keeps its number in a circle.
    const photos = job.photos || {}, havePhotos = Object.keys(photos).length > 0, photoLayer = havePhotos ? (addLayer(d, S, 'G-ESAA POLE PHOTO', 7), 'G-ESAA POLE PHOTO') : null;
    const ANG = []; for (let a = -165; a <= 180; a += 15) ANG.push(a);
    ANG.sort((x, y) => Math.abs(Math.abs(x) - 80) - Math.abs(Math.abs(y) - 80)); // beside the label first, not over it or the road
    const placePhotos = (Lp) => {
      const mark = spots.list.length, out = []; let miss = 0;
      for (const p of poleOrder) {
        const ph = photos[p.id] || photos[String(p.id)];
        const w = ph ? (ph.px >= ph.py ? Lp : Lp * ph.px / ph.py) : 19, h = ph ? (ph.px >= ph.py ? Lp * ph.py / ph.px : Lp) : 19;
        const free = [], rest = [];
        look: for (const gap of [0.8, 2.5, 5, 8, 12, 17]) for (const a of ANG) {
          const u = rotv(p.ov || [1, 0], a), t = Math.min(Math.abs(u[0]) > 1e-9 ? (w / 2) / Math.abs(u[0]) : 1e9, Math.abs(u[1]) > 1e-9 ? (h / 2) / Math.abs(u[1]) : 1e9);
          const q = add2(p.dp, u, p.rp + gap + t);
          if ([[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => R.idx.inside([q[0] + sx * w / 2, q[1] + sy * h / 2], -1, -2))) continue; // off the roads
          const mine = !poleOrder.some((x) => x !== p && dist2(x.dp, q) < dist2(p.dp, q) - 1); // nearer its own pole than any other
          const c = { q, gap, boxes: [Spots.box(q[0], q[1], w + 1.0, h + 1.0, 0)] };
          if (mine && !spots.hits(c.boxes[0])) { free.push(c); break look; }
          if (mine) rest.push(c);
        }
        let cn = free[0];
        if (!cn) { miss++; cn = rest.reduce((b, x) => (!b || spots.hits(x.boxes[0]) * 10 + x.gap < spots.hits(b.boxes[0]) * 10 + b.gap ? x : b), null) || { q: add2(p.dp, p.ov || [1, 0], p.rp + 2 + Math.hypot(w, h) / 2), boxes: [] }; }
        spots.add(cn.boxes, ph ? 'photo' : 'num'); out.push({ p, ph, w, h, q: cn.q });
      }
      return { out, miss, mark };
    };
    let Lp = Math.max(12, 18 * kG), photoPl = placePhotos(Lp);
    for (let tries = 0; tries < 2 && photoPl.miss > Math.max(1, poleOrder.length / 4); tries++) { spots.list.length = photoPl.mark; Lp *= 0.8; photoPl = placePhotos(Lp); }
    for (const { p, ph, w, h, q } of photoPl.out) {
      if (ph && havePhotos) {
        getImgs().image(o, lay(photoLayer), ph.file, ph.px, ph.py, q[0] - w / 2, q[1] - h / 2, w, h);
        o.lwpoly(lay(photoLayer), [[q[0] - w / 2, q[1] - h / 2], [q[0] + w / 2, q[1] - h / 2], [q[0] + w / 2, q[1] + h / 2], [q[0] - w / 2, q[1] + h / 2]], { closed: true, color: 8 }); // its frame
      } else { o.circle(lay('p-pole'), q[0], q[1], 9); o.text(lay('p-pole'), q[0], q[1], 7, String(p.seq), { ha: 1, va: 2, style: 'arial' }); }
    }
    rep.photoSize = +Lp.toFixed(1); rep.photosNotFree = photoPl.miss;
    // 11. coordinates of the points that are not poles
    for (const p of pts) if (p.el !== 'Pole') o.mtext(lay('LATLONG'), p.E + 4, p.N - 5, 1.5, `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`, { style: '样式 1' });
    // 12. v2.34: the name of every named road on every GEO sheet it crosses (once per sheet), on the road where it covers no label;
    //     then buildings and places nearby (named in OpenStreetMap), turned along their road, wholly inside a sheet
    const wins = geoCells.map((c) => [gox + c.i * cell, goy + c.j * cell, gox + (c.i + 1) * cell, goy + (c.j + 1) * cell]);
    const corners = (b) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, c]) => [b.cx + b.ux * b.hw * a + b.vx * b.hh * c, b.cy + b.uy * b.hw * a + b.vy * b.hh * c]);
    const inside = (b, W, m) => corners(b).every(([x, y]) => x >= W[0] + m && x <= W[2] - m && y >= W[1] + m && y <= W[3] - m);
    const byName = new Map(); R.roads.forEach((r) => { if (r.hw > 0 && r.name) (byName.get(r.name) || byName.set(r.name, []).get(r.name)).push(r); });
    let nStreets = 0, unnamedNear = 0;
    for (const W of wins) {
      for (const [name, list] of byName) {
        const txt = name.toUpperCase(), segs = [];
        for (const r of list) for (const piece of clipLine(r.pts, [W[0] + 3, W[1] + 3, W[2] - 3, W[3] - 3])) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); if (L >= 8) segs.push({ a: piece[k - 1], b: piece[k], L }); }
        if (!segs.length) continue;
        segs.sort((x, y) => y.L - x.L);
        let done = false;
        for (const sg of segs.slice(0, 8)) {
          const u = unit(sg.a, sg.b), rd = readable(deg(u));
          for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
            const q = add2(sg.a, u, f * sg.L), b = textBox(q[0], q[1], 3.5, txt, rd, 1, 2);
            if (!inside(b, W, 1) || spots.hits(b)) continue;
            o.text(lay('STREET NAME'), q[0], q[1], 3.5, txt, { rot: rd, ha: 1, va: 2, style: 'arial' }); spots.add(b, 'street'); nStreets++; done = true; break;
          }
          if (done) break;
        }
      }
    }
    for (const p of polesOnly) if (p.near && !p.near.r.name) unnamedNear++;
    rep.streetNames = nStreets; rep.polesOnUnnamedRoads = unnamedNear;
    let nPois = 0; const placed = [];
    for (const poi of job.pois || []) {
      const name = String(poi.name || '').trim().toUpperCase(); if (!name || !Number.isFinite(poi.E) || !Number.isFinite(poi.N)) continue;
      const q0 = [poi.E, poi.N], W = wins.find((w) => q0[0] >= w[0] && q0[0] <= w[2] && q0[1] >= w[1] && q0[1] <= w[3]);
      if (!W || placed.some((x) => x.name === name && dist2(x.q, q0) < 60)) continue;
      const lines = []; for (const w of name.split(/\s+/)) { const l = lines.length - 1; if (l >= 0 && (lines[l] + ' ' + w).length <= 22) lines[l] += ' ' + w; else lines.push(w); } // two lines at most
      if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, 20) + '...'; }
      const wide = lines.reduce((a, b) => (b.length > a.length ? b : a), ''), tall = lines.length;
      const nr = nearestRoad(R.roads, q0, 45), u = nr ? nr.dir : [1, 0], rd = readable(deg(u)), ru = [Math.cos(rd * Math.PI / 180), Math.sin(rd * Math.PI / 180)], rv = [-ru[1], ru[0]];
      const cands = [];
      for (const b of [0, 5, -5, 9, -9, 14, -14]) for (const a of [0, 6, -6, 12, -12]) { const q = add2(add2(q0, ru, a), rv, b), bx = textBox(q[0], q[1], 2.5, wide, rd, 1, 2); bx.hh *= tall; if (!R.idx.inside(q, -1, -1) && inside(bx, W, 1)) cands.push({ q, boxes: [bx] }); }
      const c = cands.find((x) => !x.boxes.some((bb) => spots.hits(bb))); if (!c) continue;
      o.mtext(lay('House Number', 'MISC'), c.q[0], c.q[1], 2.5, lines.map(mtextEsc).join('\\P'), { style: 'PDF Arial', att: 5, color: 7, dir: ru }); spots.add(c.boxes); placed.push({ name, q: q0 }); nPois++;
    }
    /* the vicinity map, beside the plan: the route as a bold red broken line over the street map (or a copy of the roads), the
       names of the main streets large enough at that scale (v2.34: no label, no start mark: just the route). Its viewport shows
       only that; the GEO sheets and the keymap do not. */
    const vlayH = addLayer(d, S, VLAY, 1), vk = vic[2] / 1500;
    if (!job.vicImage) { // no picture: the roads, thin
      R.edges.forEach((l) => o.lwpoly(VLAY, l.pts.map(vsh), { closed: l.closed, color: 7 }));
      R.paths.forEach((l) => o.lwpoly(VLAY, l.map(vsh), { color: 8 }));
    }
    const vlt = S.ltypes.has('DASHED') ? 'DASHED' : null;
    for (const ch of chains) if (ch.line && ch.line.length > 1) o.lwpoly(VLAY, ch.line.map(vsh), { w: 4 * vk, color: ch.existing ? 5 : 1, lt: vlt, lts: vlt ? 7 : 0, gen: true });
    if (!job.vicImage) { // no picture: the names of the roads written large
      const done = new Set();
      for (const r of R.roads.slice().sort((a, b) => b.hw - a.hw)) {
        if (!(r.hw > 0) || !r.name || done.has(r.name)) continue; let best = null;
        for (const piece of clipLine(r.pts, vb)) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); if (L > 80 * vk && (!best || L > best.L)) best = { L, a: piece[k - 1], b: piece[k] }; }
        if (!best) continue; done.add(r.name); if (done.size > 25) break;
        o.text(VLAY, (best.a[0] + best.b[0]) / 2 + VDX, (best.a[1] + best.b[1]) / 2, 8 * vk, r.name.toUpperCase(), { rot: readable(deg(unit(best.a, best.b))), ha: 1, va: 2, style: 'arial', color: 8 });
      }
    } else o.text(VLAY, vb[0] + VDX + 8 * vk, vb[1] + 8 * vk, 6 * vk, String(job.vicImage.credit || '© OpenStreetMap contributors').toUpperCase(), { style: 'arial', color: 8 });
    const layerH = (n) => (S.layers.has(n) ? get(S.layers.get(n), 5) : null);
    const vicOnly = [layerH(VLAY), layerH(VMAP)].filter(Boolean);
    const keepInVic = new Set([VLAY, VMAP]);
    const offInVic = [...(o.used || [])].filter((n) => !keepInVic.has(n)).map(layerH).filter(Boolean);
    for (const L of S.layouts) {
      const vp = bigVp(L); if (!vp) continue;
      if (L.name === 'VICINITY MAP') vpFreeze(vp, offInVic); else if (/^GEO( \(\d+\))?$/.test(L.name) || L.name === 'KEYMAP') vpFreeze(vp, vicOnly);
    }
    const ents = d.sec('ENTITIES').recs; ents.push(...o.model);
    d.index();
    // v2.34: the vendor's company in the title block (PAGING, on every sheet): its logo when the app has one, else its name centred
    // in the box
    const pg = S.blocks.get('PAGING'), cnm = pg && pg.ents.find((r) => (typ(r) === 'MTEXT' || typ(r) === 'TEXT') && textOf(r).includes('@@COMPANY_NAME@@'));
    if (cnm) {
      const hh = +get(cnm, 40) || 3, box = cellOf(pg.ents, +get(cnm, 10) + 1, +get(cnm, 20) - hh / 2);
      if (box) {
        const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, bw = box.x1 - box.x0, bh = box.y1 - box.y0, lg = job.logo, bo = lg && lg.file && blockOut(d, S, 'PAGING');
        if (bo && lg.px > 0 && lg.py > 0) {
          const m = 0.1 * Math.min(bw, bh), sc = Math.min((bw - 2 * m) / lg.px, (bh - 2 * m) / lg.py), w = lg.px * sc, h = lg.py * sc;
          getImgs().image(bo, '0', lg.file, lg.px, lg.py, cx - w / 2, cy - h / 2, w, h); setText(cnm, ''); rep.logo = true;
        } else if (typ(cnm) === 'MTEXT') { setFirst(cnm, 71, I(5)); setFirst(cnm, 10, F(cx)); setFirst(cnm, 20, F(cy)); setFirst(cnm, 41, F(bw - 4)); }
      }
    }
    // v2.34: the title sheet names the vendor at the top right (opposite the client's logo): its logo there too, when the app has one
    const tl0 = job.logo && job.logo.file && S.layouts.find((L) => L.name === 'TITLE'), tbn = tl0 && get(S.br.get(tl0.brh), 2);
    if (tbn && tbn !== '*Paper_Space' && job.logo.px > 0 && job.logo.py > 0) {
      const tnm = (S.blocks.get(tbn) || { ents: [] }).ents.find((r) => (typ(r) === 'MTEXT' || typ(r) === 'TEXT') && textOf(r).includes('@@COMPANY_NAME@@')), bo = tnm && blockOut(d, S, tbn);
      if (bo) {
        const lg = job.logo, th = +get(tnm, 40) || 100, att = typ(tnm) === 'MTEXT' ? (+get(tnm, 71) || 1) : 1, cw = (typ(tnm) === 'MTEXT' && +get(tnm, 41)) || 20 * th;
        const col = (att - 1) % 3, row = Math.floor((att - 1) / 3), x0 = +get(tnm, 10), y0 = +get(tnm, 20);
        const cx = typ(tnm) === 'MTEXT' ? x0 + (1 - col) * cw / 2 : x0 + cw / 2, cy = typ(tnm) === 'MTEXT' ? y0 + (row - 1) * th / 2 : y0 + th / 2;
        const sc = Math.min(cw / lg.px, 5 * th / lg.py), w = lg.px * sc, h = lg.py * sc;
        getImgs().image(bo, '0', lg.file, lg.px, lg.py, cx - w / 2, cy - h / 2, w, h); setText(tnm, ''); rep.logoTitle = true;
      }
    }
    if (imgs) imgs.finish(); // the pictures' objects, once every picture is in (the photos, the vicinity map, the logo)
    /* 5. the fields (v2.34: a value may differ by place: { TITLE: …, PAGING: … (the title block of every sheet), '*': … }) */
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
      const ctx = sheet || (inBlockText ? 'PAGING' : 'MODEL');
      const val = (k) => { const v = V[k]; return v && typeof v === 'object' && !Array.isArray(v) ? (v[ctx] != null ? v[ctx] : v['*']) : v; };
      // v2.34: a value given as lines (an array) is written one per line, without the template's brackets round the field
      const nt = txt.replace(/\((@@(\w+)@@)\)/g, (m, tok, k) => (Array.isArray(val(k)) && t === 'MTEXT' ? tok : m)).replace(/@@(\w+)@@/g, (m, k) => {
        const plain = !(V[k] && typeof V[k] === 'object'); let v = val(k);
        if (Array.isArray(v)) v = v.filter((x) => x != null && String(x) !== '').map(String);
        if ((v == null || v === '' || (Array.isArray(v) && !v.length)) && auto[k]) v = auto[k](sheet);
        if (v == null) v = '';
        if (Array.isArray(v) ? v.length : v !== '') filled.add(k); else blanks.add(k);
        if (Array.isArray(v)) return t === 'MTEXT' ? v.map(mtextEsc).join('\\P') : v.join(' / ');
        v = String(v);
        if (t === 'MTEXT') { v = mtextEsc(v); if (plain && k === 'LOCATION' && inBlockText && v.includes('_')) { const q = v.lastIndexOf('_'); v = `${v.slice(0, q + 1)}\\P${v.slice(q + 1)}`; } }
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
    // v2.34: the plan's title on the title sheet: the template's AFI PLAN, or AS-BUILT PLAN for an As-Built
    if (job.planTitle) { const tl = S.layouts.find((L) => L.name === 'TITLE'); if (tl) for (const r of layoutEnts(d, S, tl)) { const t = typ(r); if ((t === 'MTEXT' || t === 'TEXT') && textOf(r).includes('AFI PLAN')) setText(r, textOf(r).replace(/AFI PLAN/g, t === 'MTEXT' ? mtextEsc(job.planTitle) : job.planTitle)); } }
    for (const r of d.sec('ENTITIES').recs) { const ow = owner(r); if (ow === S.modelH && String(get(r, 67, '0')).trim() !== '1') fill(r, null, false); }
    rep.blanks = [...blanks].filter((k) => !filled.has(k) && !/^IDX_/.test(k)).sort(); // an empty index key = no sheet on that side, not a missing field
    rep.partly = [...blanks].filter((k) => filled.has(k)).sort();
    rep.counts = { ...o.n, roads: nRoads, roadEdges: R.edges.length, pois: nPois, geoSheets: N, gridCells: cellsI * cellsJ, polesMoved: pts.filter((p) => p.moved > 0.05).length };
    rep.grid = { cell, cols: cellsI, rows: cellsJ, origin: [gx0, gy0] };
    return { text: d.text(), report: rep };
  }
  return { build, Doc, structure, clipLine, roadWidth, layoutRoads, version: '2.34' };
}));
