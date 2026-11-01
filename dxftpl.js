/* G-eSAA v2.30–2.35: the plan drawing (DXF) on the company's drawing template.
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
   v2.35: the company logo on the title sheet too; the vicinity route 3 × wider; the ROW table's cities / municipalities and
   barangays (from the app's road pack boundaries) each on one line of its cell.
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
      if (extra && extra.tc != null) r.push([420, I(extra.tc)]); // v2.36: a true colour (e.g. pure white)
      if (extra && extra.lwt != null) r.push([370, I(extra.lwt)]); // v2.36: line weight (1/100 mm)
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
      if (o.mask) r.push([90, I(1)], [63, I(o.mask)], [45, '1.35']); // v2.36: a background box (readable over a satellite picture)
      return this.add(r);
    }
    circle(layer, x, y, rad, o) { const r = this.base('CIRCLE', layer, o); r.push([100, 'AcDbCircle'], [10, F(x)], [20, F(y)], [30, '0.0'], [40, F(rad)]); return this.add(r); }
    style(s) { return s && this.S.styles.has(s) ? s : 'Standard'; }
    /** An INSERT of a seed block, placed so the drawn symbol's centre is at (x, y), with attributes by tag. */
    insert(layer, name, x, y, o) {
      o = o || {}; const blk = this.S.blocks.get(name); if (!blk) return null;
      // v2.37: the scale and angle as written (6 decimals): some template blocks are drawn millions of metres from their base point,
      // where the rounding of the written scale alone moved them metres
      const sc = +F(o.scale || 1), rot = +F(o.rot || 0), c = o.center ? blockCenter(this.S, name) : [0, 0], a = rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
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
        const col = o.attrColor != null ? I(o.attrColor) : get(df, 62); if (col != null) at.push([62, col]); // v2.36: a pin's own colour
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
  /** v2.37: a block's box with its texts (TEXT and MTEXT, approximately), for the blocks drawn on the cable. */
  function blockBoxT(S, name, depth) {
    const bb = blockBox(S, name, 0), b = S.blocks.get(name); if (!b || (depth || 0) > 4) return bb;
    let [x0, y0, x1, y1] = bb || [Infinity, Infinity, -Infinity, -Infinity];
    for (const e of b.ents) {
      const t = typ(e);
      if (t === 'INSERT') { // the texts of a block inside the block
        const nbb = blockBoxT(S, get(e, 2), (depth || 0) + 1); if (!nbb) continue;
        const sx = num(e, 41, 1), sy = num(e, 42, 1), a = num(e, 50, 0) * Math.PI / 180, ix = num(e, 10, 0), iy = num(e, 20, 0);
        [[nbb[0], nbb[1]], [nbb[2], nbb[1]], [nbb[0], nbb[3]], [nbb[2], nbb[3]]].forEach(([x, y]) => { const X = ix + (x * sx) * Math.cos(a) - (y * sy) * Math.sin(a), Y = iy + (x * sx) * Math.sin(a) + (y * sy) * Math.cos(a); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); });
        continue;
      }
      if (t !== 'TEXT' && t !== 'MTEXT') continue;
      const h = num(e, 40, 0); if (!(h > 0)) continue;
      const s = t === 'MTEXT' ? textOf(e).replace(/\\[A-Za-z][^;]*;|[{}]/g, '') : (get(e, 1) || ''), w = Math.max(1, s.length) * h * 0.72;
      const ha = t === 'TEXT' ? parseInt(get(e, 72, '0'), 10) || 0 : 0, al = t === 'TEXT' && (ha || parseInt(get(e, 73, '0'), 10)) ? [num(e, 11, 0), num(e, 21, 0)] : [num(e, 10, 0), num(e, 20, 0)];
      const lx = ha === 1 || ha === 4 ? al[0] - w / 2 : ha === 2 ? al[0] - w : al[0];
      x0 = Math.min(x0, lx); x1 = Math.max(x1, lx + w); y0 = Math.min(y0, al[1] - h * 0.5); y1 = Math.max(y1, al[1] + h);
    }
    return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
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
  /** v2.41: a bold Arial text style (a copy of the template's arial style with the bold Arial font), for the IDs when the user wants
      them bold: a plain TEXT, the same in AutoCAD and in PDF converters. */
  function addBoldStyle(d, S, name) {
    if (S.styles.has(name)) return name;
    const T = d.sec('TABLES').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'STYLE'), src = T.find((r) => typ(r) === 'STYLE' && /^arial$/i.test(get(r, 2) || '')) || T.find((r) => typ(r) === 'STYLE');
    if (!tb || !src) return null;
    const h = d.newHandle(), r = src.map(([c, v]) => [c, c === 5 ? h : c === 2 ? name : c === 3 ? 'arialbd.ttf' : c === 1071 ? I(33554466) : c === 70 ? I(0) : v]); // 1071: Arial, bold (0x2000000) + pitch and family 34
    const last = T.reduce((k, x, i) => (typ(x) === 'STYLE' ? i : k), -1); T.splice(last + 1, 0, r);
    setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    d.index(); S.styles.add(name);
    return name;
  }
  /** v2.36: moves a model-space entity by (dx, dy): every point of it (a direction or a size stays); false for a kind not handled. */
  const SHIFT_PTS = { LINE: [10, 11], LWPOLYLINE: [10], CIRCLE: [10], ARC: [10], ELLIPSE: [10], POINT: [10], TEXT: [10, 11], ATTRIB: [10, 11], ATTDEF: [10, 11], MTEXT: [10], INSERT: [10], SOLID: [10, 11, 12, 13], TRACE: [10, 11, 12, 13], SEQEND: [] };
  function shiftRec(r, dx, dy) {
    const t = typ(r), neg = num(r, 230, 1) < 0 && !['LINE', 'MTEXT', 'POINT'].includes(t) ? -1 : 1; // an object space turned over: its x runs the other way
    if (t === 'MULTILEADER') { // the points of its context data only (a 10 after it is the block's scale)
      let inCtx = false; const out = [];
      for (const q of r) {
        if (q[0] === 300 && q[1] === 'CONTEXT_DATA{') inCtx = true;
        if (inCtx && [10, 12, 110].includes(q[0])) q[1] = F(+q[1] + dx); else if (inCtx && [20, 22, 120].includes(q[0])) q[1] = F(+q[1] + dy);
        if (q[0] === 301 && q[1] === '}') inCtx = false;
        if (q[0] === 310 || q[0] === 160) continue; // its picture for other programs (proxy graphics): stale once moved
        out.push(q);
      }
      r.length = 0; r.push(...out); return true;
    }
    const pts = SHIFT_PTS[t]; if (!pts) return false;
    for (const q of r) { if (pts.includes(q[0])) q[1] = F(+q[1] + neg * dx); else if (pts.includes(q[0] - 10)) q[1] = F(+q[1] + dy); }
    return true;
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
  function layoutRoads(list, box, keep) {
    const M = 60, big = [box[0] - M, box[1] - M, box[2] + M, box[3] + M];
    let rs = [];
    // v2.38: keep(x, y): only the roads on the plan's sheets (and a margin), not the whole area
    for (const r of list || []) { const w = roadWidth(r); for (const p0 of clipLine(r.pts, big)) for (const piece of keep ? keepPieces(p0, keep, 15) : [p0]) if (piece.length > 1) rs.push({ pts: piece.map((p) => [+p[0], +p[1]]), w, hw: w / 2, name: String(r.name || '').trim(), bridge: !!r.bridge }); }
    rs = mergeRoads(rs);
    // v2.38: the road ends by place (a grid of 2 m cells), so a corner is found among the few ends there, not among every road
    const endsAt = new Map(), EK = (p) => `${Math.floor(p[0] / 2)},${Math.floor(p[1] / 2)}`;
    rs.forEach((o2, oj) => { if (!(o2.hw > 0) || o2.pts.length < 2) return; [o2.pts[0], o2.pts[o2.pts.length - 1]].forEach((p) => { const k = EK(p); (endsAt.get(k) || endsAt.set(k, []).get(k)).push(oj); }); });
    const endsNear = (p) => { const gx = Math.floor(p[0] / 2), gy = Math.floor(p[1] / 2), s = new Set(); for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const j of endsAt.get(`${x},${y}`) || []) s.add(j); return s; };
    // an end that meets another road is carried on into it (by the narrower half width), so outer corners close
    rs.forEach((r, ri) => {
      r.ext = r.pts.slice();
      if (!(r.hw > 0) || r.pts.length < 2) return;
      [0, 1].forEach((e) => {
        const p = e ? r.pts[r.pts.length - 1] : r.pts[0], q = e ? r.pts[r.pts.length - 2] : r.pts[1];
        let other = 0; // the narrowest road whose end is here too (a corner); a road met in its middle (a T) needs nothing
        endsNear(p).forEach((oj) => { const o2 = rs[oj]; if (oj === ri || !(o2.hw > 0)) return; if (dist2(o2.pts[0], p) < 1.0 || dist2(o2.pts[o2.pts.length - 1], p) < 1.0) other = other ? Math.min(other, o2.hw) : o2.hw; });
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
    // v2.38: the boxes indexed by place (16 m cells), so a test looks only at the boxes nearby (a 10 km route has tens of thousands)
    cellsOf(b, f) {
      const C = 16, ex = Math.abs(b.ux) * b.hw + Math.abs(b.vx) * b.hh, ey = Math.abs(b.uy) * b.hw + Math.abs(b.vy) * b.hh;
      const x0 = Math.floor((b.cx - ex) / C), x1 = Math.floor((b.cx + ex) / C), y0 = Math.floor((b.cy - ey) / C), y1 = Math.floor((b.cy + ey) / C);
      if (!Number.isFinite(x0 + x1 + y0 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 2500) return false; // too big to index: always tested
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) f(`${x},${y}`);
      return true;
    }
    hits(b) {
      if (!this.g) return 0;
      let n = 0; const seen = new Set(), test = (x) => { if (x._k > 0 && !seen.has(x)) { seen.add(x); if (Spots.hit(b, x)) n += x._k; } };
      this.big.forEach(test);
      if (!this.cellsOf(b, (k) => { const a = this.g.get(k); if (a) a.forEach(test); })) this.list.forEach(test);
      return n;
    }
    put(x) {
      this.list.push(x); x._k = (x._k || 0) + 1; if (x._k > 1 || x._in) return;
      x._in = true; if (!this.g) { this.g = new Map(); this.big = []; }
      if (!this.cellsOf(x, (k) => { (this.g.get(k) || this.g.set(k, []).get(k)).push(x); })) this.big.push(x);
    }
    /** v2.39.1: the overlaps weighted by what is covered (w(tag)): crossing a road edge line counts little, a label or symbol fully. */
    hitsW(b, w) {
      if (!this.g) return 0;
      let n = 0; const seen = new Set(), test = (x) => { if (x._k > 0 && !seen.has(x)) { seen.add(x); if (Spots.hit(b, x)) n += x._k * w(x.tag); } };
      this.big.forEach(test);
      if (!this.cellsOf(b, (k) => { const a = this.g.get(k); if (a) a.forEach(test); })) this.list.forEach(test);
      return n;
    }
    add(b, tag) { if (Array.isArray(b)) b.forEach((x) => { if (tag) x.tag = tag; this.put(x); }); else { if (tag) b.tag = tag; this.put(b); } return b; }
    /** Takes back the boxes added after the first n. */
    truncate(n) { for (const x of this.list.slice(n)) x._k--; this.list.length = n; }
    line(pts, w) { for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], L = dist2(a, b); if (L > 0.01) this.add(Spots.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L, w, Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI)); } }
  }
  const CHW = 0.72; // width of a character / text height (Arial capitals and digits, a little generous)
  /** The box of a one-line text: anchored at (x, y) by ha (0 left, 1 centre, 2 right) and va (0 base, 2 middle, 3 top). */
  function textBox(x, y, h, s, deg, ha, va) {
    const w = Math.max(1, String(s).length) * h * CHW, a = (deg || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const du = ha === 1 ? 0 : ha === 2 ? -w / 2 : w / 2, dv = va === 2 ? 0 : va === 3 ? -h * 0.6 : h * 0.5;
    return Spots.box(x + ux * du + vx * dv, y + uy * du + vy * dv, w + h * 0.3, h * 1.25, deg);
  }
  const ROADLINE_W = (t) => (t === 'road' ? 0.2 : 1); // v2.39.1: a text across a road edge line is better than over a label
  const POLELBL_W = (t) => (t === 'road' ? 1 : t === 'cable' ? 2.5 : 4); // v2.41: a pole's label: over a road edge line rather than the cable, over the cable rather than another label
  const LL_W = (t) => (t === 'road' ? 0.15 : t === 'cable' ? 0.5 : 3); // v2.41: the lat/long of a point that is not a pole
  /** v2.39.1: first candidate that is free, else the one covering least (weighted). */
  function pickW(spots, cands, w) { let best = null; for (const c of cands) { const n = c.boxes.reduce((t, b) => t + spots.hitsW(b, w), 0); if (!n) return c; if (!best || n < best.n) best = { ...c, n }; } return best; }
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
  /** v2.41: a new block made of the given entities (polylines [[x, y]…, closed] and texts), drawn in BYBLOCK colour on layer 0 so the
      insert's layer and colour show (the ODC cabinet). */
  function defineBlock(d, S, name, polys, texts) {
    if (S.blocks.has(name)) return true;
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD');
    if (!tb) return false;
    const brH = d.newHandle(), head = (t) => [[0, t], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [62, I(0)]];
    const brec = [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]];
    const last = T.reduce((k, r, i) => (typ(r) === 'BLOCK_RECORD' ? i : k), -1); T.splice(last + 1, 0, brec);
    setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    const ents = [];
    polys.forEach(({ pts, closed, w }) => { const r = head('LWPOLYLINE'); r.push([100, 'AcDbPolyline'], [90, I(pts.length)], [70, I(closed ? 1 : 0)], [43, F(w || 0)]); pts.forEach(([x, y]) => r.push([10, F(x)], [20, F(y)])); ents.push(r); });
    (texts || []).forEach(({ x, y, h, s: str, rot, obl, style }) => { const r = head('TEXT'); r.push([100, 'AcDbText'], [10, F(x)], [20, F(y)], [30, '0.0'], [40, F(h)], [1, str], [50, F(rot || 0)], [51, F(obl || 0)], [7, style && S.styles.has(style) ? style : 'Standard'], [72, I(1)], [11, F(x)], [21, F(y)], [31, '0.0'], [100, 'AcDbText'], [73, I(2)]); ents.push(r); });
    B.push([[0, 'BLOCK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'], [2, name], [70, I(0)], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, name], [1, '']], ...ents,
      [[0, 'ENDBLK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']]);
    d.index(); Object.assign(S, structure(d));
    return true;
  }
  /** v2.41: the ODC cabinet as on the photo marker (plinth, body with two doors and their handles, cap), in an isometric view: 1 unit
      high, its front (doors) on the right face. Centred on its picture. */
  function odcIso() {
    const c30 = Math.cos(Math.PI / 6), s30 = 0.5, H = 1, W = 0.55, Dp = 0.36, cap = 0.06, pl = 0.08, e1 = 0.03, e2 = 0.025;
    const P = (x, y, z) => [(x - y) * c30, (x + y) * s30 + z]; // x: along the front (right and up), y: the depth (left and up), z: up
    const polys = [], box = (x0, x1, y0, y1, z0, z1, top) => {
      polys.push({ pts: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], closed: true }); // the front (y = y0)
      polys.push({ pts: [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], closed: true }); // the side (x = x0)
      if (top) polys.push({ pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], closed: true });
    };
    box(-e1, W + e1, -e1, Dp + e1, 0, pl, false); // plinth
    box(0, W, 0, Dp, pl, H - cap, false); // body
    box(-e2, W + e2, -e2, Dp + e2, H - cap, H, true); // cap
    polys.push({ pts: [P(0, 0, 0.7), P(W, 0, 0.7)] }); // the top panel over the doors
    polys.push({ pts: [P(W / 2, 0, pl), P(W / 2, 0, 0.7)] }); // two doors
    [W / 2 - 0.05, W / 2 + 0.05].forEach((x) => polys.push({ pts: [P(x, 0, 0.42), P(x, 0, 0.55)], w: 0.012 })); // their handles
    polys.push({ pts: [P(0.06, 0, 0.74), P(W - 0.06, 0, 0.74), P(W - 0.06, 0, 0.88), P(0.06, 0, 0.88)], closed: true }); // the label plate
    const all = polys.flatMap((q) => q.pts), cx = (Math.min(...all.map((q) => q[0])) + Math.max(...all.map((q) => q[0]))) / 2, cy = (Math.min(...all.map((q) => q[1])) + Math.max(...all.map((q) => q[1]))) / 2;
    polys.forEach((q) => { q.pts = q.pts.map(([x, y]) => [x - cx, y - cy]); });
    const t = P(W / 2, 0, 0.81); // ODC on the plate, in the plane of the front (turned 30°, slanted 30°)
    return { polys, texts: [{ x: t[0] - cx, y: t[1] - cy, h: 0.1, s: 'ODC', rot: 30, obl: 30, style: 'arial' }], w: Math.max(...all.map((q) => q[0])) - Math.min(...all.map((q) => q[0])), h: Math.max(...all.map((q) => q[1])) - Math.min(...all.map((q) => q[1])) };
  }
  /** v2.35.6: the nearest AutoCAD colour index of an RGB colour (the hatches also carry the colour itself, group 420). */
  const ACI = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [8, 128, 128, 128], [9, 192, 192, 192],
    [32, 204, 102, 0], [34, 153, 76, 0], [36, 127, 63, 0], [94, 0, 153, 0], [96, 0, 127, 0], [140, 0, 191, 255], [150, 0, 127, 255], [151, 127, 191, 255],
    [212, 204, 0, 204], [214, 153, 0, 153], [254, 212, 212, 212]];
  function aciOf(rgb) {
    const r = rgb >> 16, g = (rgb >> 8) & 255, b = rgb & 255;
    if (Math.max(r, g, b) < 60) return 7; // black: AutoCAD's black / white
    let best = 7, bd = Infinity; for (const [c, R, G, B] of ACI) { const dd = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (dd < bd) { bd = dd; best = c; } }
    return best;
  }
  /** v2.35.6: new blocks made of solid fills (the landmark icons). list: [{ name, icon: { w, h, f: [{ c: '#RRGGBB', l: [[x, y, …], …] }] } }],
      icon units with y down; each block is drawn 1 unit wide, centred on its base point. Each fill is one HATCH: its first loop the
      outline, the next ones its holes (filled odd-even). */
  function fillBlocks(d, S, list) {
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD');
    if (!tb) return 0; let n = 0;
    for (const { name, icon } of list) {
      if (S.blocks.has(name) || !icon || !Array.isArray(icon.f)) continue;
      const brH = d.newHandle(), k = 1 / Math.max(icon.w || 1, icon.h || 1), cx = (icon.w || 0) / 2, cy = (icon.h || 0) / 2;
      const brec = [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]];
      const last = T.reduce((q, r, i) => (typ(r) === 'BLOCK_RECORD' ? i : q), -1); T.splice(last + 1, 0, brec);
      setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
      const ents = icon.f.filter((f) => f.l && f.l.length && f.l[0].length >= 6).map((f) => {
        const rgb = parseInt(String(f.c || '#000000').slice(1), 16) || 0;
        const r = [[0, 'HATCH'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [62, I(aciOf(rgb))], [420, I(rgb)], [100, 'AcDbHatch'],
          [10, '0.0'], [20, '0.0'], [30, '0.0'], [210, '0.0'], [220, '0.0'], [230, '1.0'], [2, 'SOLID'], [70, I(1)], [71, I(0)], [91, I(f.l.length)]];
        f.l.forEach((L, j) => {
          const m = Math.floor(L.length / 2); r.push([92, I(j ? 6 : 7)], [72, I(0)], [73, I(1)], [93, I(m)]);
          for (let i = 0; i < m; i++) r.push([10, F((L[2 * i] - cx) * k)], [20, F((cy - L[2 * i + 1]) * k)]);
          r.push([97, I(0)]);
        });
        r.push([75, I(0)], [76, I(1)], [47, '0.001'], [98, I(1)], [10, '0.0'], [20, '0.0']);
        return r;
      });
      B.push([[0, 'BLOCK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'], [2, name], [70, I(0)], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, name], [1, '']],
        ...ents, [[0, 'ENDBLK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']]);
      n++;
    }
    if (n) { d.index(); Object.assign(S, structure(d)); }
    return n;
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

  /** v2.41: the order the plan numbers its marked points in (ids as strings): along each cable run from the homing (runs that
      reach a site or an ODF first), then the rest. The Drawing screen shows the same numbers as the DXF. */
  function markOrder(pts, spans, marks) {
    const byId = new Map(pts.map((p) => [String(p.id), p])), set = new Set((marks || []).map(String)), out = [], seen = new Set();
    const take = (p) => { if (p && !p.onPole && set.has(String(p.id)) && !seen.has(p)) { seen.add(p); out.push(String(p.id)); } };
    const home = (ch) => (ch.ids.some((id) => { const q = byId.get(String(id)) || {}; return q.el === 'Site' || q.el === 'ODF'; }) ? 1 : 0);
    const startOf = (ch) => { const a = byId.get(String(ch.ids[0])), b = byId.get(String(ch.ids[ch.ids.length - 1])); return (b && b.el !== 'Pole' && !(a && a.el !== 'Pole')) ? ch.ids.slice().reverse() : ch.ids; };
    chainsOf(spans).sort((x, y) => home(y) - home(x)).forEach((ch) => startOf(ch).forEach((id) => take(byId.get(String(id)))));
    pts.forEach(take);
    return out;
  }
  /** v2.37: the PROJECT AREA circle of the vicinity map (E, N, radius) for points [[E, N], ...] and the map size (m): the app darkens
      the picture outside it, the drawing draws it. */
  function vicCircle(xy, size) {
    const vk = size / 1500, xs = xy.map((q) => q[0]), ys = xy.map((q) => q[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(70 * vk, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 45 * vk)];
  }
  /** v2.38: the places of a project, each drawn on its own vicinity map and key map: a point more than `gap` metres (1 km) from
      every other point starts a new place; a span joins its two ends. pts: [{ id, E, N }], spans: [{ ia, ib }]. Returns
      [{ idx: [indexes into pts], box: [x0, y0, x1, y1] }], in the order of their first point. */
  const LOC_GAP = 1000, VIC_MARGIN = 500;
  function locations(pts, spans, gap) {
    const G = gap || LOC_GAP, par = pts.map((_, i) => i);
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[Math.max(a, b)] = Math.min(a, b); };
    const g = new Map(), K = (x, y) => `${x},${y}`; // gap-sized cells: only neighbouring cells are compared
    pts.forEach((p, i) => { const k = K(Math.floor(p.E / G), Math.floor(p.N / G)); (g.get(k) || g.set(k, []).get(k)).push(i); });
    pts.forEach((p, i) => { const gx = Math.floor(p.E / G), gy = Math.floor(p.N / G); for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const j of g.get(K(x, y)) || []) if (j > i && Math.hypot(pts[j].E - p.E, pts[j].N - p.N) <= G) join(i, j); });
    const at = new Map(pts.map((p, i) => [String(p.id), i]));
    (spans || []).forEach((s) => { const a = at.get(String(s.ia)), b = at.get(String(s.ib)); if (a != null && b != null) join(a, b); });
    const groups = new Map(); pts.forEach((p, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); });
    return [...groups.values()].sort((a, b) => a[0] - b[0]).map((idx) => { const xs = idx.map((i) => pts[i].E), ys = idx.map((i) => pts[i].N); return { idx, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
  }
  /** v2.38: the vicinity map of a place: its points with a 500 m margin round them, at least 1.5 km across: [E, N, size]. */
  function vicArea(box) { return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, Math.max(1500, Math.max(box[2] - box[0], box[3] - box[1]) + 2 * VIC_MARGIN)]; }
  /** v2.38: the parts of a line inside keep(x, y) (the plan's sheets and a margin), tested every `step` metres; a vertex is added
      only where the line goes in or out. */
  function keepPieces(line, keep, step) {
    const out = []; let cur = null;
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1], b = line[k], n = Math.max(1, Math.ceil(dist2(a, b) / step)), at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let s = 0; s < n; s++) {
        const m = at((s + 0.5) / n);
        if (keep(m[0], m[1])) { if (!cur) { cur = [at(s / n)]; out.push(cur); } if (s === n - 1) cur.push(b); }
        else if (cur) { cur.push(at(s / n)); cur = null; }
      }
    }
    return out.filter((l) => l.length > 1);
  }
  /** v2.39: a pole's clamp label: its clamp types (the app's, picked from the route when the record left them blank) and its clamp
      size, e.g. "DEG+GCA 8-9" (v2.38 and before wrote CA for every pole: CA is only one of the types). */
  const clampText = (p) => [p.clampType, p.clamp].filter(Boolean).join(' ');
  /* ---------------- the build ---------------- */
  // v2.32: new fiber red, existing fiber blue (the drafting rule); aerial dashed, underground solid
  const CABLE_STYLE = { F72: { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true }, L12: { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true }, U144: { layer: 'Proposed foc duct', color: 3, w: 0.7776, aerial: false }, '': { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true } };
  const PIN_ACI = { red: 1, navy: 5, green: 3, orange: 30 }; // v2.36: the colours of the app's marks and pins (AutoCAD colour numbers)
  /* v2.41: the user's drawing style (the app's Drawing style screen; these are the defaults). Colours are AutoCAD colour numbers
     (1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta, 7 white); 0 = by layer. Sizes in metres of the drawing (1:1100 on the
     GEO sheets: 1 m = 0.9 mm). */
  const NUM_STYLE = { color: 2, bcolor: 0, h: 3, d: 7, g: 2, leader: true, place: 'auto' }; // the number beside a point: text colour, circle colour (0 = as the text), text height, circle diameter (0 = none), distance from the point, leader line, first free spot / straight out from the road
  const ID_STYLE = { bold: false, color: 0, h: 2.5 }; // the IDs of NAPs, the ODC, handholes… (v2.40 and before: 2.5 m, by layer, not bold)
  const VIC_STYLE = { circle: 2, circleW: 7, route: 0, routeW: 16.5 }; // the vicinity map: the PROJECT AREA circle (yellow) and the route (0: by cable, red new / blue existing); widths per 1.5 km of map
  const ODC_H = 9, ODC_BLOCK = 'G-ESAA ODC'; // v2.41: the ODC cabinet on the plan: its block (an isometric view), 9 m high
  const pinColor = (p) => (p && p.color && PIN_ACI[p.color] != null ? PIN_ACI[p.color] : null);
  const CABLE_LWT = 70; // v2.36: 0.70 mm, about the template's 0.78 m wide cable at 1 : 1200
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
    // v2.38: the project's places (points more than 1 km apart): each has its own vicinity map and key map
    const locs = locations(pts, spans, job.locGap), nL = locs.length, locOfPt = new Map();
    locs.forEach((L, k) => L.idx.forEach((i) => locOfPt.set(pts[i], k)));
    const ptById = new Map(pts.map((p) => [String(p.id), p])), locOfId = (id) => { const p = ptById.get(String(id)); return p ? locOfPt.get(p) || 0 : 0; };
    const samp = [];
    spans.forEach((sp) => { const a = sp.a, b = sp.b; if (!a || !b) return; const lk = locOfId(sp.ia), n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (let s = 0; s <= n; s++) samp.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n, lk]); });
    pts.forEach((p) => samp.push([p.E, p.N, locOfPt.get(p) || 0]));
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
    const visit = (E, N, lk) => { const k = key(ci(E), cj(N)); if (!used.has(k)) { used.set(k, { i: ci(E), j: cj(N), loc: lk }); order.push(k); } };
    samp.forEach((q) => visit(q[0], q[1], q[2]));
    // v2.38: each place's cells with a ring of cells round them (its key map), named within the place: row letters from the top,
    // column numbers from the left (with several places, the place's number first: 1B-3, 2A-1)
    const lr = locs.map((_, k) => { const cs = [...used.values()].filter((c) => c.loc === k); if (!cs.length) return null; const is = cs.map((c) => c.i), js = cs.map((c) => c.j); return { I0: Math.min(...is) - 1, I1: Math.max(...is) + 1, J0: Math.min(...js) - 1, J1: Math.max(...js) + 1 }; });
    const lrs = lr.filter(Boolean), I0 = Math.min(...lrs.map((r) => r.I0)), I1 = Math.max(...lrs.map((r) => r.I1)), J0 = Math.min(...lrs.map((r) => r.J0)), J1 = Math.max(...lrs.map((r) => r.J1));
    const locOfCell = (i, j) => { const c = used.get(key(i, j)); if (c) return c.loc; const k = lr.findIndex((r) => r && i >= r.I0 && i <= r.I1 && j >= r.J0 && j <= r.J1); return k < 0 ? 0 : k; };
    const cellName = (i, j) => { const k = locOfCell(i, j), r = lr[k] || lrs[0]; return `${nL > 1 ? k + 1 : ''}${letters(r.J1 - j)}-${i - r.I0 + 1}`; };
    const geoCells = order.map((k, n) => [used.get(k), n]).sort((a, b) => a[0].loc - b[0].loc || a[1] - b[1]).map((x) => x[0]), N = geoCells.length; // place by place, in route order
    /* 2. the GEO sheets: as many as the cells used (copied from GEO, or the extra ones removed) */
    const geoNames = (n) => Array.from({ length: n }, (_, k) => (k ? `GEO (${k + 1})` : 'GEO'));
    let have = S.layouts.filter((L) => /^GEO( \(\d+\))?$/.test(L.name));
    for (const L of have) if (!geoNames(N).includes(L.name)) { removeLayout(d, S, L); S = structure(d); }
    for (const nm of geoNames(N)) if (!S.layouts.some((L) => L.name === nm)) { cloneLayout(d, S, S.layouts.find((L) => L.name === 'GEO'), nm); S = structure(d); }
    // v2.38: a VICINITY MAP and a KEYMAP sheet for each place (copied from the template's own)
    const many = (base, n) => Array.from({ length: n }, (_, k) => (k ? `${base} (${k + 1})` : base));
    const vicNames = many('VICINITY MAP', nL), kmNames = many('KEYMAP', nL);
    for (const [base, names] of [['VICINITY MAP', vicNames], ['KEYMAP', kmNames]]) {
      if (!S.layouts.some((L) => L.name === base)) continue;
      for (const L of S.layouts.filter((x) => x.name.startsWith(`${base} (`) && !names.includes(x.name))) { removeLayout(d, S, L); S = structure(d); }
      for (const nm of names) if (!S.layouts.some((L) => L.name === nm)) { cloneLayout(d, S, S.layouts.find((L) => L.name === base), nm); S = structure(d); }
    }
    // tab order: TITLE, TOC, LEGENDS, VICINITY MAP(s), ROW AREA COVERAGE, KEYMAP(s), GEO…, PMI, then anything else
    const want = ['TITLE', 'TOC', 'LEGENDS', ...vicNames, 'ROW AREA COVERAGE', ...kmNames, ...geoNames(N), 'PMI'];
    const rank = (n) => (n === 'Model' ? -1 : want.includes(n) ? want.indexOf(n) : 100);
    S.layouts.slice().sort((a, b) => rank(a.name) - rank(b.name)).forEach((L, k) => { if (L.name !== 'Model') setIn(L.rec, 'AcDbLayout', 71, I(k)); });
    /* 3. viewports */
    const bigVp = (L) => layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').sort((a, b) => num(b, 40, 0) * num(b, 41, 0) - num(a, 40, 0) * num(a, 41, 0)).find((e) => Math.abs(num(e, 40, 0) - num(e, 41, 0)) < 1); // the square map viewport
    const aim = (vp, cx, cy, h) => { if (!vp) return; setFirst(vp, 12, F(cx)); setFirst(vp, 22, F(cy)); setFirst(vp, 17, '0.0'); setFirst(vp, 27, '0.0'); setFirst(vp, 37, '0.0'); setFirst(vp, 45, F(h)); setFirst(vp, 51, '0.0'); };
    const sheetOf = new Map();
    geoCells.forEach((c, k) => { const nm = geoNames(N)[k], L = S.layouts.find((x) => x.name === nm); aim(bigVp(L), gox + (c.i + 0.5) * cell, goy + (c.j + 0.5) * cell, viewH); sheetOf.set(key(c.i, c.j), nm); rep.sheets.push(`${nm}: ${cellName(c.i, c.j)}`); rep.cells.push(cellName(c.i, c.j)); });
    const gx0 = gox + I0 * cell, gy0 = goy + J0 * cell, gx1 = gox + (I1 + 1) * cell, gy1 = goy + (J1 + 1) * cell;
    // v2.38: each place's key map shows its own cells (a place far away no longer shrinks it)
    const kmBox = lr.map((r) => (r ? [gox + r.I0 * cell, goy + r.J0 * cell, gox + (r.I1 + 1) * cell, goy + (r.J1 + 1) * cell] : [gx0, gy0, gx1, gy1]));
    const kmH = kmBox.map((b) => Math.max(b[2] - b[0], b[3] - b[1]) * 1.02);
    kmNames.forEach((nm, k) => { const L = S.layouts.find((x) => x.name === nm); if (L) aim(bigVp(L), (kmBox[k][0] + kmBox[k][2]) / 2, (kmBox[k][1] + kmBox[k][3]) / 2, kmH[k]); });
    // v2.38: each place's vicinity map: the app's (job.vicinities[k]: { c: [E, N], size, image, circle }), else its points with a
    // 500 m margin (job.vicinity / vicImage / vicCircle: the one place of an older caller)
    const JV = Array.isArray(job.vicinities) ? job.vicinities : null;
    const vics = locs.map((L, k) => {
      const jv = JV && JV[k], one = !JV && nL === 1;
      const area = jv && jv.c ? [+jv.c[0], +jv.c[1], +jv.size] : one && job.vicinity ? job.vicinity : vicArea(L.box);
      return { area, image: jv ? jv.image || null : one ? job.vicImage || null : null, circle: jv ? jv.circle || null : one ? job.vicCircle || null : null };
    });
    // v2.32: the vicinity map is drawn beside the plan in model space (east of it), so it never covers the plan there; v2.38: further
    // east when that spot is taken (by another place or its vicinity map)
    const ovl = (a, b, m) => !(a[2] + m < b[0] || b[2] + m < a[0] || a[3] + m < b[1] || b[3] + m < a[1]), vplaced = [];
    vics.forEach((v) => {
      const [cx, cy, sz] = v.area; let dx = sz * 1.5, box = null;
      for (let t = 0; t < 400; t++) { box = [cx - sz / 2 + dx, cy - sz / 2, cx + sz / 2 + dx, cy + sz / 2]; if (!kmBox.some((b) => ovl(box, b, 100)) && !vplaced.some((b) => ovl(box, b, 100))) break; dx += sz * 0.5; }
      vplaced.push(box); v.dx = dx; v.vb = [cx - sz / 2, cy - sz / 2, cx + sz / 2, cy + sz / 2]; v.sb = box; v.sh = (q) => [q[0] + dx, q[1], q[2] || 0];
    });
    vicNames.forEach((nm, k) => { const L = S.layouts.find((x) => x.name === nm), v = vics[k]; if (L) aim(bigVp(L), v.area[0] + v.dx, v.area[1], v.area[2]); });
    /* 4. model space */
    const o = new Out(d, S);
    const lay = (n, fallback) => (S.layers.has(n) ? n : fallback || '0');
    // grid
    const cellsI = I1 - I0 + 1, cellsJ = J1 - J0 + 1, gridAll = cellsI * cellsJ <= 900;
    const gh = cell * 0.1; // v2.39: a tenth of the cell (the template's sample: a fifth, covering the plan; the company's plans: 4 to 12 %)
    for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
      if (!gridAll && ![-1, 0, 1].some((di) => [-1, 0, 1].some((dj) => used.has(key(i + di, j + dj))))) continue;
      const x0 = gox + i * cell, y0 = goy + j * cell;
      o.lwpoly(lay('GRIDS'), [[x0, y0], [x0 + cell, y0], [x0 + cell, y0 + cell], [x0, y0 + cell]], { closed: true, color: 6 });
      o.mtext(lay('GRIDNO.', 'GRIDNO'), x0 + cell - cell * 0.04, y0 + cell - cell * 0.03, gh, cellName(i, j), { att: 3 });
    }
    // v2.32: the vicinity map: a street map picture of the area (when the phone could get one), under everything else
    let imgs = null; const getImgs = () => imgs || (imgs = new Images(d, S));
    const VLAY = 'G-ESAA VICINITY', VMAP = 'G-ESAA VICINITY MAP';
    for (const v of vics) if (v.image && v.image.file) { addLayer(d, S, VMAP, 7); getImgs().image(o, VMAP, v.image.file, v.image.px, v.image.py, v.vb[0] + v.dx, v.vb[1], v.area[2], v.area[2]); }
    // roads (OpenStreetMap): pavement edges by class, one outline where roads meet; paths as grey centre lines; bridges.
    // v2.38: only on the plan's sheets (the cells the route uses) and 60 m round them, not the whole vicinity area
    const RM = 60, cells = [...used.values()];
    const keepAt = (x, y) => { const i = ci(x), j = cj(y); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (!used.has(key(i + a, j + b))) continue; const x0 = gox + (i + a) * cell, y0 = goy + (j + b) * cell; if (x >= x0 - RM && x <= x0 + cell + RM && y >= y0 - RM && y <= y0 + cell + RM) return true; } return false; };
    const rbox = [gox + Math.min(...cells.map((c) => c.i)) * cell - RM, goy + Math.min(...cells.map((c) => c.j)) * cell - RM, gox + (Math.max(...cells.map((c) => c.i)) + 1) * cell + RM, goy + (Math.max(...cells.map((c) => c.j)) + 1) * cell + RM];
    const R = layoutRoads(job.roads || [], rbox, keepAt);
    R.edges.forEach((l) => o.lwpoly(lay('ROAD PAVEMENT'), l.pts, { closed: l.closed }));
    R.paths.forEach((l) => o.lwpoly(lay('ROAD PAVEMENT'), l, { color: 8 }));
    R.bridges.forEach((l) => o.lwpoly(lay('BRIDGE', 'ROAD PAVEMENT'), l, { color: 5 }));
    const nRoads = R.roads.length;
    if (nRoads) kmBox.forEach((b) => o.text(lay('BASEMAP'), b[0] + 5, b[1] - 12, 4, `ROADS: (c) OPENSTREETMAP CONTRIBUTORS (ODbL)${job.roadsNote ? ` · ${String(job.roadsNote).toUpperCase()}` : ''}`, { style: 'arial' }));

    /* the route: poles beside their road, the cable on the road side of the poles, every label where it does not overlap */
    const spots = new Spots(), byId = new Map(pts.map((p) => [String(p.id), p])), nb = new Map();
    // v2.41: the user's style for the numbers, the IDs of the points on the cable and the vicinity map (the app's Drawing style)
    const NS = { ...NUM_STYLE, ...(job.numStyle || {}) }, IDS = { ...ID_STYLE, ...(job.idStyle || {}) }, VS = { ...VIC_STYLE, ...(job.vicStyle || {}) };
    const idStyle = IDS.bold ? addBoldStyle(d, S, 'G-ESAA BOLD') || 'arial' : 'arial';
    const idText = (ly, x, y, h, txt, rr, col) => o.text(ly, x, y, h, txt, { rot: rr, ha: 1, va: 2, style: idStyle, color: col != null ? col : IDS.color || null }); // an ID, bold or not, in its colour (a pin's own colour first)
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
    // v2.39: as the company's own plans (measured on two of them): the pole's centre 2.5 m outside the road edge, the cable 1.4 m inside
    // the road along that edge (v2.34 to v2.38: 2 m outside the edge); a point the cable runs through (ODC, handhole…) on the cable
    const POLE_OUT = 2.5, CABLE_IN = 1.4, CABLE_OFF = 1.0; // CABLE_OFF: a pole off the road (kept at its pin): the cable this far past its edge
    // v2.37: a pin placed or moved by hand (and a proposed pole) within KEEP_EDGE of the road edge is tidied beside the road like the
    // others; farther from the road (inside a property, to reach a site) it stays where it was put
    const KEEP_EDGE = 6;
    // v2.37: the points the cable runs through that are not poles stand on the cable line beside the road, the cable meeting their sides
    const INLINE_EL = new Set(['ODC', 'Handhole', 'Manhole', 'Service box']);
    const polesOnly = pts.filter((p) => p.el === 'Pole');
    const nns = polesOnly.map((p) => { let nn = 1e9; for (const q of polesOnly) if (q !== p) nn = Math.min(nn, Math.hypot(q.E - p.E, q.N - p.N)); return nn; }).filter((v) => v < 1e8).sort((a, b) => a - b);
    const kG = Math.max(0.6, Math.min(1, (nns.length ? nns[Math.floor(nns.length * 0.2)] : 25) / 25));
    for (const p of polesOnly) p.k = kG;
    for (const p of pts) {
      p.dp = [p.E, p.N]; p.td = null; p.near = null; p.keep = !!(p.adjusted || p.status === 'Proposed' || p.status === 'New');
      if (p.el === 'Pole') { p.sym = S.blocks.has(symOf(p).b) ? symOf(p) : { ...symOf(p), b: null }; p.rp = p.sym.r * p.k; } else if (INLINE_EL.has(p.el)) p.rp = 0; else continue;
      const near = nearestRoad(R.roads, p.dp, 25); if (!near) continue;
      p.near = near; p.side = near.d < 0.4 ? 0 : near.side;
    }
    for (const p of pts) if (p.near && !p.side) { const q = (nb.get(p) || []).find((x) => x.near && x.side && x.near.ri === p.near.ri); p.side = q ? q.side : 1; }
    for (const p of pts) {
      if (!p.near) continue;
      const out = (nr, side) => [-nr.dir[1] * side, nr.dir[0] * side], n = out(p.near, p.side);
      // an ODC is always set in line with the road (v2.37); the others keep a hand-placed pin that is well off the road
      if (p.keep && p.near.edge > KEEP_EDGE && p.el !== 'ODC') { p.td = [-n[0], -n[1]]; p.moved = 0; p.kept = true; continue; }
      const off = p.el === 'Pole' ? Math.max(POLE_OUT, p.rp + 0.6) : -CABLE_IN; // a pole beside the road, the cable's line inside it; the others on that line
      let q = add2(p.near.c, n, p.near.r.hw + off);
      if (off > 0) for (let it = 0; it < 4; it++) { const o2 = nearestRoad(R.roads, q, off - 0.1); if (!o2) break; q = add2(o2.c, out(o2, o2.side), o2.r.hw + off); } // a corner: out of the other road too
      p.dp = q; p.td = [-n[0], -n[1]]; p.moved = dist2(q, [p.E, p.N]); if (p.el === 'Pole') p.cab = off + CABLE_IN; // from the pole's centre to the cable
    }
    const tangent = (p) => { const Q = nb.get(p) || []; return Q.length >= 2 ? unit(Q[0].dp, Q[1].dp) : Q.length === 1 ? unit(p.dp, Q[0].dp) : [1, 0]; };
    // 2. where the cable meets each pole: on its road side, past its arm when it has one
    for (const p of pts) {
      if (p.el !== 'Pole') { p.A = p.dp; continue; }
      p.arm = armOf(p.armType); if (p.arm && !S.blocks.has(p.arm.b)) p.arm = null;
      if (!p.td) { const t = tangent(p), L = [-t[1], t[0]], q = (nb.get(p) || []).find((x) => x.td); let s = 1; if (q) { const tq = tangent(q); s = Math.sign(q.td[0] * -tq[1] + q.td[1] * tq[0]) || 1; } p.td = [L[0] * s, L[1] * s]; p.free = true; }
      // v2.39: beside a road the cable runs along its line inside the road, an arm reaching it; a pole away from the roads keeps the
      // cable close by (past its arm when it has one)
      const reach = p.cab ? p.cab : p.rp + (p.arm ? p.arm.reach : CABLE_OFF);
      p.armLen = p.arm ? Math.max(1, reach - p.rp) : 0;
      p.A = add2(p.dp, p.td, reach);
    }
    // v2.37: how far each point is from the homing (a site or an ODF on the route) along the route: a NAP or an ODC faces it
    const homeD = new Map();
    { const start = pts.filter((p) => (p.el === 'Site' || p.el === 'ODF') && nb.has(p));
      if (!start.length && spans.length) { const s0 = byId.get(String(spans[0].ia)); if (s0) start.push(s0); }
      start.forEach((p) => homeD.set(p, 0));
      for (let it = 0, ch = true; ch && it < pts.length + 2; it++) { ch = false; for (const [p, Q] of nb) { const dp0 = homeD.get(p); if (dp0 == null) continue; for (const q of Q) { const v = dp0 + dist2(p.dp, q.dp); if (!(homeD.get(q) <= v)) { homeD.set(q, v); ch = true; } } } } }
    const hd = (p) => (homeD.has(p) ? homeD.get(p) : 1e12);
    /** The way along the cable at a point, pointing away from the homing. */
    const downAt = (p) => {
      const Q = nb.get(p) || []; if (!Q.length) return p.near ? p.near.dir : [1, 0];
      if (Q.length === 1) return hd(Q[0]) <= hd(p) ? unit(Q[0].A, p.A) : unit(p.A, Q[0].A);
      const up = Q.slice().sort((a, b) => hd(a) - hd(b))[0], dn = Q.find((x) => x !== up);
      return unit(up.A, dn.A);
    };
    // v2.37: a NAP or a closure recorded as its own pin stands on its pole (the nearest pole of the route, within 30 m)
    for (const q of pts) {
      if (q.el !== 'NAP' && q.el !== 'Closure') continue;
      let best = null, bd = 30; for (const p of polesOnly) { if (!nb.has(p)) continue; const dd = Math.hypot(p.E - q.E, p.N - q.N); if (dd < bd) { bd = dd; best = p; } }
      if (!best) continue;
      if (q.el === 'NAP' && !best.nap && !best.napId) { best.nap = true; best.napId = q.poleId || ''; best.napType = best.napType || q.napType || ''; best.napOld = q.status === 'Existing'; q.onPole = best; }
      if (q.el === 'Closure' && !best.closure && !best.closureId) { best.closure = true; best.closureId = q.poleId || q.closureId || ''; q.onPole = best; }
    }
    // v2.37: the blocks that sit ON the cable (NAPs of every kind, the ODC, handholes, manholes, service boxes): turned along the
    // cable (a NAP and an ODC with their input side toward the homing), the cable meeting their two sides, the ID below
    const NAP_W = 25.2 * 0.7803353843555049;
    const NAPK = {
      '': ['proposed NAP', 'PROPOSED NAP', 'existing NAP', 'EXISTING NAP'], 'NAP 1x8': ['proposed NAP', 'PROPOSED NAP', 'existing NAP', 'EXISTING NAP'],
      'NAP 1x16': ['1_16NAP', 'PROPOSED NAP'], 'Dummy NAP': ['dummy nap', 'PROPOSED NAP'], 'NAP changed to 1:16': ['AUGMENT NAP 1X16', 'PROPOSED NAP', null, null, true],
      'Double NAP': ['proposed Double NAP', 'PROPOSED DOUBLE NAP', 'existing Double NAP', 'EXISTING DOUBLE NAP'],
      // v2.41: the LCP (local convergence point, a box on the pole for broadband: L4 = a 1:4 splitter) is a kind of NAP, on its pole
      'LCP 1x4': ['proposed LCP', 'PROPOSED LCP', 'existing LCP', 'EXISTING LCP'], 'Double LCP 2x1:8': ['LCP 2', 'PROPOSED DOUBLE LCP', 'EXISTING DOUBLE LCP', 'EXISTING DOUBLE LCP'] };
    const BLK = { // element: [new block, layer, scale, existing block, layer, scale]. v2.41: the ODC is not an LCP (it has its own cabinet below)
      Handhole: ['proposed Handhole', 'PROPOSED HH', 0.7803353843555049, 'HANDHOLE', 'EXISTING HH', 0.7803353843555049],
      Manhole: ['PROPOSED MAN HOLE', 'PROPOSED MH', 0.7803353843555049, 'MH', 'EXISTING MH', 1.749630906627053],
      'Service box': ['proposed service box', 'PROPOSED SERVICE BOX', 0.7803353843555049, 'SB', 'EXISTING SERVICE BOX', 1.749630906627053] };
    const inl = new Map();
    const odcBlk = odcIso(); // v2.41: the ODC block (made when the plan has an ODC)
    if (pts.some((p) => p.el === 'ODC')) { addLayer(d, S, 'G-ESAA PROPOSED ODC', 1); addLayer(d, S, 'G-ESAA EXISTING ODC', 5); defineBlock(d, S, ODC_BLOCK, odcBlk.polys, odcBlk.texts); }
    const inlineOf = (p, b, layer, sc, faced, flip) => {
      const bb = blockBox(S, b, 0), bt = blockBoxT(S, b); if (!bb || !bt) return null;
      const w = bb[2] - bb[0], h = bb[3] - bb[1]; if (!sc) sc = NAP_W / ((bt[2] - bt[0]) || w || 1); // as wide as the NAP, its texts included
      const cx = ((bb[0] + bb[2]) / 2) * sc; // the block is drawn centred on its lines; its texts may reach further on one side
      const t = downAt(p), rot = faced ? deg(t) + (flip ? 180 : 0) : readable(deg(t)), ax = rotv([1, 0], faced ? deg(t) : rot);
      const lo = bt[0] * sc - cx, hi = bt[2] * sc - cx, hlo = Math.max(-lo, (w * sc) / 2), hhi = Math.max(hi, (w * sc) / 2), mir = faced && flip; // its two sides along the cable
      return { p, at: p.A, b, layer: lay(layer, 'MISC'), sc, rot, ax, hl: Math.max(hlo, hhi), hlo: mir ? hhi : hlo, hhi: mir ? hlo : hhi, hh: Math.max((h * sc) / 2, ((bt[3] - bt[1]) * sc) / 2) };
    };
    for (const p of pts) {
      if (p.onPole) continue;
      const isNew = p.status === 'Proposed' || p.status === 'New';
      if (p.el === 'Pole' && (p.nap || p.napId)) {
        const k = NAPK[p.napType || ''] || NAPK[''], old = p.napOld && k[2] && S.blocks.has(k[2]), b = old ? k[2] : k[0];
        if (!S.blocks.has(b)) continue;
        const it = inlineOf(p, b, old ? k[3] : k[1], 0, true, !!k[4]); if (!it) continue;
        it.label = p.napId || ''; it.kind = 'nap'; inl.set(p, it);
        // the pole symbol beside the NAP, not under it
        // v2.39.1: an arm keeps its usual length and ends at the NAP's side (it crossed the NAP); the pole stands that much further out
        const need = it.hh + p.rp + (p.arm ? Math.max(0.8, p.armLen) : 0.8), cur = dist2(p.dp, p.A);
        if (cur < need) p.dp = add2(p.A, p.td, -need);
        if (p.arm) p.armLen = Math.max(0.8, dist2(p.dp, p.A) - p.rp - it.hh);
      } else if (p.el === 'ODC') { // v2.41: the ODC cabinet (the template has no ODC model): G-eSAA's block, an isometric view of the cabinet of the
        // photo marker, upright, on the cable (the cable meets its two sides)
        const t = downAt(p), rot = readable(deg(t)), ax = rotv([1, 0], rot), sc = ODC_H, w = odcBlk.w * sc, h = odcBlk.h * sc;
        const it = { p, at: p.A, b: ODC_BLOCK, odc: { w, h, isNew, sc }, layer: lay(isNew ? 'G-ESAA PROPOSED ODC' : 'G-ESAA EXISTING ODC'), sc, rot: 0, ax, hl: w / 2, hlo: w / 2, hhi: w / 2, hh: h / 2, lrot: rot };
        it.label = p.poleId || ''; it.kind = 'ODC'; it.col = pinColor(p); inl.set(p, it);
      } else if (INLINE_EL.has(p.el)) {
        const key = p.el, k = BLK[key];
        const old = !isNew && S.blocks.has(k[3]), b = old ? k[3] : k[0]; if (!S.blocks.has(b)) continue;
        const it = inlineOf(p, b, old ? k[4] : k[1], old ? k[5] : k[2], p.el === 'ODC', false); if (!it) continue;
        it.label = p.poleId || ''; it.kind = p.el; it.col = pinColor(p); inl.set(p, it);
      }
    }
    // 3. the cable runs, broken where a block sits on the cable (it meets the block's sides)
    const chains = chainsOf(spans), label = new Map((runs || []).map((r) => [r.cable, r.label]));
    for (const ch of chains) {
      const P = ch.ids.map((id) => byId.get(id)).filter(Boolean); if (P.length < 2) continue;
      const pieces = []; let cur = [];
      P.forEach((p, k) => {
        const it = inl.get(p); if (!it) { cur.push(p.A); return; }
        const e1 = add2(it.at, it.ax, -(it.hlo || it.hl)), e2 = add2(it.at, it.ax, it.hhi || it.hl), near = (q) => (dist2(e1, q) <= dist2(e2, q) ? e1 : e2);
        const prev = k > 0 ? P[k - 1].A : null, next = k < P.length - 1 ? P[k + 1].A : null;
        const ein = prev ? near(prev) : null; let eout = next ? near(next) : null;
        if (ein && eout && ein === eout) eout = ein === e1 ? e2 : e1;
        if (ein) { cur.push(ein); pieces.push(cur); }
        cur = eout ? [eout] : [];
      });
      if (cur.length) pieces.push(cur);
      // v2.32: aerial cable as a broken line (DASHED at linetype scale 7, 9 when existing, as the template's own sample drawing),
      // underground solid; red new, blue existing (v2.37: underground green, as the legend)
      const st = CABLE_STYLE[ch.cable] || CABLE_STYLE[''], lt = st.aerial ? ['DASHED', 'AERCA'].find((n) => S.ltypes.has(n)) : 'Continuous';
      ch.line = P.map((p) => p.A); ch.pieces = pieces.filter((l) => l.length > 1); ch.ug = !st.aerial;
      // v2.36: its thickness as a line weight (0.70 mm), not a polyline width: PDF converters other than AutoCAD (the one used to
      // check the plan) drew a wide polyline solid, without its dashes
      for (const line of ch.pieces) { o.lwpoly(lay(st.layer, 'Proposed foc aerial'), line, { lwt: CABLE_LWT, color: ch.existing ? 5 : st.color, lt, lts: lt === 'DASHED' ? (ch.existing ? 9 : 7) : 0, gen: true }); spots.line(line, 1.5); spots.list.slice(-line.length + 1).forEach((b) => { b.tag = 'cable'; }); }
    }
    // 4. poles and the other points: symbols first (they are fixed), then the labels round them
    let nOlt = 0, nInline = 0;
    for (const p of pts) {
      if (p.onPole) continue;
      const isNew = p.status === 'Proposed' || p.status === 'New';
      if (p.el === 'Pole') {
        spots.add(Spots.box(p.dp[0], p.dp[1], p.rp * 2.2, p.rp * 2.2, 0));
        if (p.arm) { // the arm, from the pole to the cable
          const reach = p.armLen || p.arm.reach, bb = blockBox(S, p.arm.b, 0), along = p.arm.dir[0] ? bb[2] - bb[0] : bb[3] - bb[1], sc = reach / (along || 1), top = topVertex(S, p.arm.b);
          const end = p.arm.dir[0] ? [bb[0], (bb[1] + bb[3]) / 2] : [top ? top[0] : (bb[0] + bb[2]) / 2, bb[3]], rot = deg(p.td) - deg(p.arm.dir), at = add2(p.dp, p.td, p.rp), e = rotv([end[0] * sc, end[1] * sc], rot);
          o.insert(lay(p.arm.layer), p.arm.b, at[0] - e[0], at[1] - e[1], { scale: sc, rot });
          const m = add2(p.dp, p.td, p.rp + reach / 2); spots.add(Spots.box(m[0], m[1], reach, 4, deg(p.td)));
        }
      } else if (p.el === 'Site' && /olt/i.test(p.siteKind || '')) { // v2.37: an OLT site: the OLT model (yellow when new, blue existing), its name above
        const nb0 = isNew && S.blocks.has('7') ? ['7', 'PORPOSED OLT', 0.0001060994181900193] : ['OLT1', 'EXISTING OLT', 1.749630906627053];
        if (S.blocks.has(nb0[0])) { o.insert(lay(nb0[1], 'X-BTS'), nb0[0], p.E, p.N, { scale: nb0[2], center: true }); spots.add(Spots.box(p.E, p.N, 13, 15, 0)); nOlt++; }
        const nm = p.siteName || p.poleId || ''; if (nm) { const c = pick(spots, [[0, 10.5], [0, -10.5], [12, 0], [-12, 0]].map(([dx, dy]) => { const q = [p.E + dx, p.N + dy]; return { q, boxes: [textBox(q[0], q[1], 3, nm, 0, dx > 0 ? 0 : dx < 0 ? 2 : 1, 2)], ha: dx > 0 ? 0 : dx < 0 ? 2 : 1 }; }));
          o.text(lay('X-BTS'), c.q[0], c.q[1], 3, nm, { ha: c.ha, va: 2, style: 'arial', color: pinColor(p) != null ? pinColor(p) : isNew ? 1 : 5 }); spots.add(c.boxes); }
      } else if (p.el === 'Site') { // v2.36: a pin's name in its colour (a pin placed on the map has one). v2.37: a new tower red
        let bn = 'X-BTS';
        if (isNew && copyBlock(d, S, 'X-BTS', 'G-ESAA P-BTS', () => true)) {
          bn = 'G-ESAA P-BTS';
          if (!S.redBts) { S.redBts = true; for (const e of S.blocks.get(bn).ents) { if (typ(e) === 'ATTDEF') continue; const k = e.findIndex((q) => q[0] === 62); if (k >= 0) e[k][1] = I(1); else e.splice(e.findIndex((q) => q[0] === 8) + 1, 0, [62, I(1)]); } }
        }
        o.insert(lay('X-BTS'), bn, p.E, p.N, { scale: 2.4, attrs: { BTS_NAME: p.siteName || p.poleId || '', PLA_ID: p.plaId || '' }, attrColor: pinColor(p) }); spots.add(Spots.box(p.E, p.N + 24, 26, 50, 0));
      } else if (p.el === 'ODF') {
        o.insert(isNew ? lay('P-HOST') : lay('X-HOST'), isNew ? 'P-HOST' : 'X-HOST', p.E, p.N, { scale: 0.28, attrs: { HST_NAM: p.poleId || '', HST_COD: '', HST_LET: 'H' }, attrColor: pinColor(p) }); spots.add(Spots.box(p.E, p.N, 10, 10, 0));
      } else if (p.el === 'NAP') { // a NAP pin away from every pole of the route: where it is
        o.insert(isNew ? lay('PROPOSED NAP') : lay('EXISTING NAP'), isNew ? 'proposed NAP' : 'existing NAP', p.E, p.N, { scale: 0.7803353843555049, center: true }); spots.add(Spots.box(p.E, p.N, 20, 9, 0));
        if (p.poleId) { idText(lay('Proposed NAP ID', 'MISC'), p.E, p.N - 7, IDS.h, p.poleId, 0, null); spots.add(textBox(p.E, p.N - 7, IDS.h, p.poleId, 0, 1, 2)); }
      } else if (p.el === 'Closure') {
        o.insert(lay('P-JOINT'), 'P-Joint', p.E, p.N, { scale: 4.35, attrs: { JT_ID: p.poleId || p.closureId || '', JOINT: 'JT' } }); spots.add(Spots.box(p.E, p.N, 9, 9, 0));
      } else if (!inl.has(p) && !INLINE_EL.has(p.el)) o.circle(lay('MISC'), p.E, p.N, 2);
    }
    let nOdc = 0;
    for (const it of inl.values()) { // the blocks on the cable, then their IDs below them (above when that place is taken)
      if (it.odc) { // v2.41: the ODC block (isometric cabinet), upright; red when new, blue existing (or the pin's colour)
        const { w, h, isNew, sc } = it.odc, col = it.col != null ? it.col : isNew ? 1 : 5;
        o.insert(it.layer, ODC_BLOCK, it.at[0], it.at[1], { scale: sc, color: col }); spots.add(Spots.box(it.at[0], it.at[1], w, h, 0)); nInline++; nOdc++; continue;
      }
      o.insert(it.layer, it.b, it.at[0], it.at[1], { scale: it.sc, rot: it.rot, center: true }); spots.add(Spots.box(it.at[0], it.at[1], it.hl * 2, it.hh * 2, it.rot)); nInline++;
    }
    for (const it of inl.values()) {
      if (!it.label) continue;
      const rr = it.odc ? 0 : readable(it.rot), ux = [Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)], dn = [ux[1], -ux[0]], th0 = IDS.h; // (the ODC's picture is upright: its ID level under it)
      // v2.39.1: on the side away from its pole first (the pole's own label goes on the pole's side), then a little further out or
      // along the cable; crossing a road edge line rather than covering a label or a symbol. v2.41: where every place is taken at the
      // ID's size, a size smaller (twice at most) before covering anything
      const pole = it.p && it.p.el === 'Pole' && it.p.dp ? it.p : null, away = pole ? -(Math.sign((pole.dp[0] - it.at[0]) * dn[0] + (pole.dp[1] - it.at[1]) * dn[1]) || -1) : 1;
      const lc = []; for (const th of [th0, th0 * 0.8, th0 * 0.64]) for (const sd of [away, -away]) for (const ex of [0, 1.5, 3]) for (const a of [0, 4, -4, 8, -8]) { const q = add2(add2(it.at, dn, sd * (it.hh + th * 0.9 + ex)), ux, a); lc.push({ q, th, boxes: [textBox(q[0], q[1], th, it.label, rr, 1, 2)] }); }
      const c = pickW(spots, lc, ROADLINE_W);
      const ly = it.kind === 'nap' ? lay('Proposed NAP ID', 'MISC') : it.kind === 'ODC' ? it.layer : lay('MISC');
      idText(ly, c.q[0], c.q[1], c.th, it.label, rr, it.col); spots.add(c.boxes);
    }
    // 7. guys: against the pull of the cable (a head guy in line with it), drawn with the template's guy symbols. v2.37: a side guy
    //    that would point into the road is turned round; a head guy on a pole with spans both ways leans away from the longer
    //    one; a pole-to-pole guy goes to the pole chosen for it, with a head guy there
    const dirsOf = new Map(), byRec = new Map(pts.map((p) => [String(p.id), p]));
    const guyAt = (p, g, v, len, labelMid) => {
      const name = `G-ESAA ${g.code === 'DG' ? 'HG' : g.code}`;
      if (!copyBlock(d, S, g.b, name, (e) => typ(e) !== 'MTEXT' && typ(e) !== 'TEXT')) return false;
      const ends = lineEnds(S, name); if (!ends) return false;
      const L0 = ends[1][0] - ends[0][0], sc = len ? len / L0 : g.len ? g.len / L0 : g.sc, rot = deg(v), at = add2(p.dp, v, p.rp), e = rotv([ends[0][0] * sc, ends[0][1] * sc], rot);
      o.insert(lay(g.layer), name, at[0] - e[0], at[1] - e[1], { scale: sc, rot });
      const rr = readable(rot), flip = Math.abs(((rot - rr) % 360 + 360) % 360 - 180) < 1, nl = rotv([Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)], 90);
      const tip = labelMid ? add2(add2(at, v, (L0 * sc) / 2), nl, 2.2) : add2(at, v, L0 * sc + 1.2);
      o.text(lay(g.layer), tip[0], tip[1], 2.33, g.code, { rot: rr, ha: labelMid ? 1 : flip ? 2 : 0, va: 2, style: 'arial', color: 1 });
      const m = add2(at, v, (L0 * sc) / 2); spots.add(Spots.box(m[0], m[1], L0 * sc, 4, rot)); spots.add(textBox(tip[0], tip[1], 2.33, g.code, rr, labelMid ? 1 : flip ? 2 : 0, 2));
      (dirsOf.get(p) || dirsOf.set(p, []).get(p)).push(v);
      return true;
    };
    const free = (p, v) => {
      const dirs = dirsOf.get(p) || [], taken = (w) => dirs.some((x) => x[0] * w[0] + x[1] * w[1] > Math.cos(20 * Math.PI / 180)), road = (w) => !!(p.near && !p.free && p.td && w[0] * p.td[0] + w[1] * p.td[1] > 0.2);
      if (!taken(v)) return v;
      for (const a of [35, -35, 70, -70, 105, -105, 140, -140]) { const w = rotv(v, a); if (!taken(w) && !road(w)) return w; }
      for (const a of [35, -35, 70, -70, 105, -105, 140, -140]) { const w = rotv(v, a); if (!taken(w)) return w; }
      return v;
    };
    let nP2P = 0;
    for (const p of pts) {
      const list = p.el === 'Pole' && !p.onPole ? guysOf(p.guy) : []; if (!list.length) continue;
      const Q = nb.get(p) || [], us = Q.map((q) => unit(p.A, q.A)), sum = us.reduce((t, u) => [t[0] + u[0], t[1] + u[1]], [0, 0]), sl = Math.hypot(sum[0], sum[1]); // v2.37: the pull of the cable, where the cable runs
      const outw = [-p.td[0], -p.td[1]];
      for (const g of list) {
        const to = g.code === 'P2P' && p.p2pTo != null ? byRec.get(String(p.p2pTo)) : null;
        if (to && to !== p && to.el === 'Pole') { // to the chosen pole, and a head guy there in line with it
          const v = unit(p.dp, to.dp), len = dist2(p.dp, to.dp) - p.rp - (to.rp || 0) - 0.4;
          if (len > 2 && guyAt(p, g, v, len, true)) { nP2P++; const hg = GUYS.find((x) => x.code === 'HG'); guyAt(to, hg, free(to, v)); }
          continue;
        }
        let v;
        if (g.head) {
          if (us.length === 1) v = [-us[0][0], -us[0][1]];
          else if (sl > 0.3) v = [-sum[0] / sl, -sum[1] / sl];
          else if (us.length) { const far = Q.reduce((b, q) => (dist2(p.A, q.A) > dist2(p.A, b.A) ? q : b), Q[0]); const u = unit(p.A, far.A); v = [-u[0], -u[1]]; } else v = outw;
        } else {
          v = sl > 0.3 ? [-sum[0] / sl, -sum[1] / sl] : outw;
          if (g.code === 'SG' && p.near && !p.free && v[0] * p.td[0] + v[1] * p.td[1] > 0.2) v = [-v[0], -v[1]]; // never into the road
        }
        guyAt(p, g, free(p, v));
      }
    }
    // v2.37: grounding at every pole with a maintenance loop and every pole marked for it (half the legend's size), pointing away
    // from the road like a guy; a riser where the cable goes from aerial to underground (or a pole marked for it)
    const methodAt = new Map(); spans.forEach((s) => { const ug = (CABLE_STYLE[s.cable] || CABLE_STYLE['']).aerial === false; [s.ia, s.ib].forEach((id) => { const p = byId.get(String(id)); if (p) (methodAt.get(p) || methodAt.set(p, new Set()).get(p)).add(ug ? 'UG' : 'AE'); }); });
    let nGround = 0, nRiser = 0;
    const gb = S.blocks.has('proposed grounding') ? 'proposed grounding' : null;
    for (const p of polesOnly) {
      if (p.onPole) continue;
      if (gb && (p.ground || p.mloop)) {
        const ends = lineEnds(S, gb);
        if (ends) {
          const sc = 0.7803353843555049 / 2, v = free(p, [-p.td[0], -p.td[1]]), rot = deg(v), at = add2(p.dp, v, p.rp), e = rotv([ends[0][0] * sc, ends[0][1] * sc], rot), L = (ends[1][0] - ends[0][0]) * sc;
          o.insert(lay('PROPOSED GROUNDING', 'MISC'), gb, at[0] - e[0], at[1] - e[1], { scale: sc, rot }); const m = add2(at, v, L / 2); spots.add(Spots.box(m[0], m[1], L, 3, rot)); (dirsOf.get(p) || dirsOf.set(p, []).get(p)).push(v); nGround++;
        }
      }
      const ms = methodAt.get(p);
      if (p.riser || (ms && ms.has('UG') && ms.has('AE'))) {
        const rb = 'proposed riser';
        // on the cable: past the block on the cable when the pole has one, on the side of the underground span
        const ugq = (nb.get(p) || []).find((q) => { const s0 = spans.find((s) => (byId.get(String(s.ia)) === p && byId.get(String(s.ib)) === q) || (byId.get(String(s.ib)) === p && byId.get(String(s.ia)) === q)); return s0 && (CABLE_STYLE[s0.cable] || CABLE_STYLE['']).aerial === false; });
        let q = p.A; if (inl.has(p)) { const it = inl.get(p), w = ugq ? unit(p.A, ugq.A) : it.ax, sg = (w[0] * it.ax[0] + w[1] * it.ax[1]) >= 0 ? 1 : -1; q = add2(it.at, it.ax, sg * (it.hl + 3.5)); }
        if (S.blocks.has(rb)) { o.insert(lay('PROPOSED RISER', 'MISC'), rb, q[0], q[1], { scale: 0.7803353843555049, center: true }); spots.add(Spots.box(q[0], q[1], 6, 6, 0)); nRiser++; }
      }
    }
    // v2.37: directional boring (HDD) wherever an underground cable crosses a road, centred on the road, along the cable
    let nHdd = 0; const hddB = S.blocks.has('proposed HDD Directional Boring') ? 'proposed HDD Directional Boring' : null;
    if (hddB) {
      const hbb = blockBox(S, hddB, 0), hw0 = hbb ? hbb[2] - hbb[0] : 38.69, cross = (a, b, c, e) => { const r = [b[0] - a[0], b[1] - a[1]], s = [e[0] - c[0], e[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null; };
      const done = [];
      for (const ch of chains) {
        if (!ch.ug || !ch.pieces) continue;
        for (const line of ch.pieces) for (let k = 1; k < line.length; k++) {
          const a = line[k - 1], b = line[k];
          for (const r of R.roads) {
            if (!(r.hw > 0)) continue;
            for (let j = 1; j < r.pts.length; j++) {
              const x = cross(a, b, r.pts[j - 1], r.pts[j]); if (!x || done.some((q) => q.r === r && dist2(q.x, x) < r.hw + 4)) continue; // once per crossing of each road
              const L = 2 * r.hw + 6, rot = deg(unit(a, b)); done.push({ r, x });
              o.insert(lay(ch.existing ? 'EXISTING HDD' : 'PROPOSED HDD', 'MISC'), ch.existing && S.blocks.has('existing HDD Directional Boring') ? 'existing HDD Directional Boring' : hddB, x[0], x[1], { scale: L / hw0, rot: readable(rot), center: true });
              spots.add(Spots.box(x[0], x[1], L, 5, rot)); nHdd++;
            }
          }
        }
      }
    }
    // 6. loops ON the cable beside their pole (on the span away from the homing), the length text along it, readable; closures on the
    //    cable at their pole (v2.37)
    for (const p of polesOnly) {
      if (p.onPole) continue;
      const t = downAt(p), rd = readable(deg(t)), napHl = inl.has(p) ? inl.get(p).hl : 0;
      if (p.mloop && S.blocks.has('loopp')) {
        const bb = blockBox(S, 'loopp', 0), sc = 2.470465709436871, lw = bb ? (bb[2] - bb[0]) * sc : 9.5, lh = bb ? (bb[3] - bb[1]) * sc : 7.1;
        const Q = nb.get(p) || [], Qn = Q.filter((q) => hd(q) > hd(p)).sort((x, y) => hd(x) - hd(y)), dir = Qn.length ? unit(p.A, Qn[0].A) : Q.length ? unit(p.A, Q[0].A) : t; // along the span down the route (at the end, back along its span)
        // v2.41: right in front of its pole (where its arm meets the cable), or just past its NAP: a loop is on the pole, not along the span
        const s = napHl ? napHl + 0.6 + lw / 2 : 0, Q0 = add2(p.A, dir, s), c0 = add2(Q0, p.td, lh / 2), rot = deg(p.td) + 90;
        // the loop's straight line (the cable) laid on the cable, its circle hanging on the road side
        const le = lineEnds(S, 'loopp'), mid = le ? [(le[0][0] + le[1][0]) / 2, (le[0][1] + le[1][1]) / 2] : [0, 0], mo = rotv([mid[0] * sc, mid[1] * sc], rot);
        o.insert(lay('PROPOSED LOOP'), 'loopp', Q0[0] - mo[0], Q0[1] - mo[1], { scale: sc, rot }); spots.add(Spots.box(c0[0], c0[1], lw, lh, deg(dir)));
        const txt = `${+(+(job.mloopLen || 15)).toFixed(1)}m LOOP`, cs = []; // v2.39: 15m LOOP (15.0m before), as the company's plans
        for (const j of [lh + 2.2, -2.6, lh + 5.5, -5.5]) for (const k of [0, 4, -4, 9, -9]) { const q = add2(add2(Q0, p.td, j), dir, k); cs.push({ q, boxes: [textBox(q[0], q[1], 2.8125, txt, rd, 1, 2)] }); }
        const c = pick(spots, cs);
        o.text(lay('PROPOSED LOOP'), c.q[0], c.q[1], 2.8125, txt, { rot: rd, ha: 1, va: 2 }); spots.add(c.boxes, 'loop');
      }
      if (p.closure || p.closureId) {
        const Q = nb.get(p) || [], up = Q.length ? Q.slice().sort((x, y) => hd(x) - hd(y))[0] : null, back = up ? unit(p.A, up.A) : [-t[0], -t[1]], base = napHl ? add2(p.A, back, napHl + 5.5) : p.A; // up its span, toward the homing
        const ow = [-p.td[0], -p.td[1]], cid = p.closureId || 'CLOSURE', tw = Math.max(8, cid.length) * 3 * CHW;
        const cands = []; for (const off of [9.5, 14, 19]) for (const k of [0, -6, 6, -12, 12, -18, 18, -24]) for (const side of [1, -1]) { const q = add2(base, back, Math.max(-6, Math.min(6, k))), tq = add2(add2(q, ow, side * off), back, k - Math.max(-6, Math.min(6, k))), lx = tq[0] - tw / 2; // the symbol near its pole, the texts beside it where they cover nothing
          cands.push({ q, lx, ty: tq[1], boxes: [textBox(lx - 1.5, tq[1] + 1.8, 3, 'PROPOSED  ', 0, 0, 2), textBox(lx - 1.5, tq[1] - 2.6, 3, cid + '  ', 0, 0, 2), Spots.box(q[0], q[1], 9, 4, rd)] }); } // (a little room round the texts)
        const c = pick(spots, cands);
        const jt = { JT_ID: { v: p.closureOld ? 'EXISTING' : 'PROPOSED', x: c.lx, y: c.ty + 1.8, h: 3.0, ha: 0, va: 2 }, JOINT: { v: cid, x: c.lx, y: c.ty - 2.6, h: 3.0, ha: 0, va: 2 } }; // v2.41: an existing hybrid closure says so
        o.insert(lay('P-JOINT'), 'P-Joint', c.q[0], c.q[1], { scale: 4.35, rot: rd, attrs: jt }); spots.add(c.boxes);
      }
    }
    // 8. the pole labels (the template's attributes: proposed pole / height / clamp, material / pole tag), the coordinates and
    //    the pole number in its circle, outward from the road; turned a little where a neighbour's label is in the way
    const poleOrder = []; const seen = new Set();
    const startOf = (ch) => { const a = byId.get(ch.ids[0]), b = byId.get(ch.ids[ch.ids.length - 1]); return (b && b.el !== 'Pole' && !(a && a.el !== 'Pole')) ? ch.ids.slice().reverse() : ch.ids; };
    chains.slice().sort((x, y) => (y.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0) - (x.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0))
      .forEach((ch) => startOf(ch).forEach((id) => { const p = byId.get(id); if (p && p.el === 'Pole' && !seen.has(p)) { seen.add(p); poleOrder.push(p); } }));
    pts.forEach((p) => { if (p.el === 'Pole' && !p.onPole && !seen.has(p)) { seen.add(p); poleOrder.push(p); } });
    for (const p of poleOrder) {
      const H = Math.max(1.5, 2.2 * p.k), HL = Math.max(0.9, 1.2 * p.k), size = p.size || clampText(p); // size: the clamps and their size (the app records no other size of an existing pole)
      // v2.33: the pole tag without its material prefix (material CC + tag CC-0430621 → CC / 0430621), as the template's sample
      const bare = (v) => { const m = String(p.mat || '').trim(), t = String(v || ''); return m && t.toUpperCase().startsWith(m.toUpperCase()) && /^([-_ .][A-Z0-9]|\d)/i.test(t.slice(m.length)) && t.length > m.length ? t.slice(m.length).replace(/^[-_ .]/, '') : t; };
      const tag = bare(p.tag != null && p.tag !== '' ? p.tag : (!p.poleId || /^NPT/i.test(p.poleId) ? 'NPT' : p.poleId));
      const lines = p.sym.r === POLE_SYM.prop.r ? [['GT-POLE', p.label1 || 'PROP.POLE'], ['PHEIGHT', p.height || ''], ['POLE_CLAMP', clampText(p)]]
        : p.sym.b === 'existing telecom pole' ? [['OC', p.mat || ''], ['GT-001', bare(p.poleId || '')], ['', size]] : [['CC', p.mat || ''], ['NPT', tag], ['B', size]];
      const shown = lines.filter(([, v]) => v);
      const lat = `${p.lat.toFixed(6)}°`, lon = `${p.lon.toFixed(6)}°`;
      const ll = `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`;
      // one stack in the direction of the ID, read from the pole outward: material / tag (/ size), then latitude / longitude
      // smaller under them (v2.33: the coordinates are part of the stack, as in the template's sample)
      const n = shown.length, gap = 0.35 * H, llH = HL * (1 + 5 / 3), T = n * 1.5 * H + gap + llH;
      const cands = [];
      // v2.41: also a little further out (2.5 m, 5 m) before covering anything; a road edge line counts least, the cable more, a label most
      for (const ex of [0, 2.5, 5]) for (const a of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150]) {
        const ov = rotv([-p.td[0], -p.td[1]], a), dg = deg(ov), rr = readable(dg), flip = Math.abs(((dg - rr) % 360 + 360) % 360 - 180) < 1, ha = flip ? 2 : 0;
        const up = rotv([Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)], 90);
        const base = add2(p.dp, ov, p.rp + 1.2 + ex), boxes = [], place = [];
        shown.forEach(([t, v], k) => { const q = add2(base, up, T / 2 - (k + 0.5) * 1.5 * H); place.push([t, v, q]); boxes.push(textBox(q[0], q[1], H, v, rr, ha, 2)); });
        const llAt = add2(base, up, T / 2 - n * 1.5 * H - gap - llH / 2);
        [[lat, HL * 5 / 6], [lon, -HL * 5 / 6]].forEach(([v, dy]) => { const q = add2(llAt, up, dy); boxes.push(textBox(q[0], q[1], HL, v, rr, ha, 2)); });
        cands.push({ boxes, place, rr, ha, llAt, ov, flip });
      }
      const c = pickW(spots, cands, POLELBL_W); spots.add(c.boxes, 'label:' + p.poleId);
      // the block keeps the values in its attributes (hidden); the labels are plain texts in one direction (the pole blocks
      // of the template are dynamic blocks, and AutoCAD would put some of their attributes back where the block wants them)
      const attrs = {}; lines.forEach(([t, v]) => { if (t) attrs[t] = { v, x: p.dp[0], y: p.dp[1], rot: c.rr, h: H, ha: 0, va: 0, hidden: true }; });
      if (p.sym.b) o.insert(lay(p.sym.layer), p.sym.b, p.dp[0], p.dp[1], { scale: p.sym.sc * p.k, center: true, attrs }); else o.circle(lay(p.sym.layer), p.dp[0], p.dp[1], p.rp);
      const look = p.sym.b ? attrLook(S, p.sym.b) : new Map();
      c.place.forEach(([t, v, q]) => { const lk = look.get(t) || {}; o.text(lk.layer && lk.layer !== '0' ? lay(lk.layer) : lay(p.sym.layer), q[0], q[1], H, v, { rot: c.rr, ha: c.ha, va: 2, style: 'arial', color: lk.color != null ? +lk.color : null }); });
      o.mtext(lay('LATLONG'), c.llAt[0], c.llAt[1], HL, ll, { style: '样式 1', att: c.flip ? 6 : 4, dir: [Math.cos(c.rr * Math.PI / 180), Math.sin(c.rr * Math.PI / 180)] });
      p.ov = c.ov;
    }
    // 5. span lengths: mid-span, on the road side of the cable (a span over the maximum in red)
    for (const s of spans) {
      const P = byId.get(String(s.ia)), Q = byId.get(String(s.ib)); if (!P || !Q) continue;
      const a = P.A, b = Q.A, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t = unit(a, b), rd = readable(deg(t)), nl = [-t[1], t[0]];
      const toward = [(P.td ? P.td[0] : 0) + (Q.td ? Q.td[0] : 0), (P.td ? P.td[1] : 0) + (Q.td ? Q.td[1] : 0)], sgn = (nl[0] * toward[0] + nl[1] * toward[1]) < 0 ? -1 : 1;
      const txt = `${Math.round(s.len)}m${s.long ? ` (OVER ${job.maxSpan || 200}m)` : ''}`; // v2.39: whole metres, as the company's plans
      // v2.34: one size and style for every span length of the drawing, along the cable, where it covers neither the cable nor a road line
      const L = dist2(a, b), cs = [], th = Math.max(1.4, 2.0 * kG), off = th * 0.75 + 0.6;
      for (const [f, k] of [[0, 1], [0, -1], [0.2, 1], [-0.2, 1], [0.2, -1], [-0.2, -1], [0, 1.7], [0, -1.7], [0.35, 1], [-0.35, 1], [0.35, -1], [-0.35, -1], [0.2, 1.7], [-0.2, 1.7], [0.2, -1.7], [-0.2, -1.7], [0, 2.5], [0, -2.5], [0, 3.4], [0, -3.4]]) { const q = add2(add2(m, t, f * L), nl, k * off * sgn); cs.push({ q, boxes: [textBox(q[0], q[1], th, txt, rd, 1, 2)] }); }
      const c = pick(spots, cs);
      o.text(lay('Distance Data'), c.q[0], c.q[1], th, txt, { rot: rd, ha: 1, va: 2, style: 'arial', color: s.long ? 1 : null }); spots.add(c.boxes);
    }
    // 10. the cable's name: after the street names (v2.39.1), see below
    // the photo of each pole right beside it, upright (v2.32: instead of the pole number). v2.34: every photo one size, no line
    // to the pole, covering nothing (labels, cable, road lines, symbols, other photos); when too many find no free place, all the
    // photos are made smaller (twice at most). A pole without a photo keeps its number in a circle.
    // v2.40: which points get a photo or a number (job.marks: the app's choice, e.g. only the PLDT poles for an RTA application, or the
    //        poles and the other points: handholes, the ODC…); numbered along the route, counting only those. Without job.marks: every pole.
    const markIds = Array.isArray(job.marks) ? new Set(job.marks.map(String)) : null;
    const markable = (p) => !!p && !p.onPole && (markIds ? markIds.has(String(p.id)) : p.el === 'Pole');
    const markOrder = []; { const seenM = new Set(), take = (p) => { if (markable(p) && !seenM.has(p)) { seenM.add(p); markOrder.push(p); } };
      chains.slice().sort((x, y) => (y.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0) - (x.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0))
        .forEach((ch) => startOf(ch).forEach((id) => take(byId.get(id))));
      pts.forEach(take); }
    markOrder.forEach((p, i) => { p.seq = i + 1; });
    const rOf = (p) => (p.el === 'Pole' ? p.rp : inl.has(p) ? Math.max(inl.get(p).hl, inl.get(p).hh) : p.el === 'Site' ? 8 : 4);
    const anchors = [...new Set([...poleOrder, ...markOrder])]; // a photo nearer its own point than any pole or other marked point
    // v2.41: job.markMode 'photo' (a point without a photo shows its number), 'num' (numbers only) or 'both' (each photo with its number
    // at its upper left); the number in the user's style (NS: colour, size, circle, distance, leader line, where)
    const markMode = job.markMode || (job.markNum ? 'num' : 'photo');
    const photos = markMode === 'num' ? {} : job.photos || {}, havePhotos = Object.keys(photos).length > 0, photoLayer = havePhotos ? (addLayer(d, S, 'G-ESAA POLE PHOTO', 7), 'G-ESAA POLE PHOTO') : null;
    const ANG = []; for (let a = -165; a <= 180; a += 15) ANG.push(a);
    ANG.sort((x, y) => Math.abs(Math.abs(x) - 80) - Math.abs(Math.abs(y) - 80)); // beside the label first, not over it or the road
    const ANG_OUT = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180]; // straight out from the road first
    const numD = (p) => Math.max(NS.d, String(p.seq).length * NS.h * CHW + NS.h * 0.6); // the number's circle (wider for a long number)
    const placePhotos = (Lp) => {
      const mark = spots.list.length, out = []; let miss = 0;
      for (const p of [...markOrder.filter((x) => x.el === 'Pole'), ...markOrder.filter((x) => x.el !== 'Pole')]) { // v2.40: the poles' first
        const ph = photos[p.id] || photos[String(p.id)], nd = ph ? 0 : numD(p);
        const w = ph ? (ph.px >= ph.py ? Lp : Lp * ph.px / ph.py) : nd, h = ph ? (ph.px >= ph.py ? Lp * ph.py / ph.px : Lp) : nd;
        const out1 = !ph && NS.place === 'out' && p.td, base = out1 ? [-p.td[0], -p.td[1]] : p.ov || [1, 0], angs = out1 ? ANG_OUT : ANG;
        const gaps = ph ? [0.8, 2.5, 5, 8, 12, 17] : [NS.g, NS.g + 1.5, NS.g + 3.5, NS.g + 6, NS.g + 10, NS.g + 15].map((g) => Math.max(0.3, g));
        const free = [], rest = [];
        look: for (const gap of gaps) for (const a of angs) {
          const u = rotv(base, a), t = ph ? Math.min(Math.abs(u[0]) > 1e-9 ? (w / 2) / Math.abs(u[0]) : 1e9, Math.abs(u[1]) > 1e-9 ? (h / 2) / Math.abs(u[1]) : 1e9) : nd / 2;
          const q = add2(p.dp, u, rOf(p) + gap + t);
          if ([[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => R.idx.inside([q[0] + sx * w / 2, q[1] + sy * h / 2], -1, -2))) continue; // off the roads
          const mine = !anchors.some((x) => x !== p && dist2(x.dp, q) < dist2(p.dp, q) - 1); // nearer its own point than any other
          const c = { q, u, gap, boxes: [Spots.box(q[0], q[1], w + 1.0, h + 1.0, 0)] };
          if (mine && !spots.hits(c.boxes[0])) { free.push(c); break look; }
          if (mine) rest.push(c);
        }
        let cn = free[0];
        if (!cn) { miss++; cn = rest.reduce((b, x) => (!b || spots.hits(x.boxes[0]) * 10 + x.gap < spots.hits(b.boxes[0]) * 10 + b.gap ? x : b), null) || { q: add2(p.dp, p.ov || [1, 0], rOf(p) + 2 + Math.hypot(w, h) / 2), u: p.ov || [1, 0], boxes: [] }; }
        spots.add(cn.boxes, ph ? 'photo' : 'num');
        if (!ph && NS.leader) { const la = add2(p.dp, cn.u, rOf(p) + 0.2), lb = add2(cn.q, cn.u, -nd / 2); if (dist2(la, lb) > 0.5) spots.line([la, lb], 0.4); } // its leader line
        out.push({ p, ph, w, h, q: cn.q, u: cn.u });
      }
      return { out, miss, mark };
    };
    let Lp = Math.max(12, 18 * kG), photoPl = placePhotos(Lp);
    for (let tries = 0; tries < 2 && photoPl.miss > Math.max(1, markOrder.length / 4); tries++) { spots.truncate(photoPl.mark); Lp *= 0.8; photoPl = placePhotos(Lp); }
    const nCol = NS.color || null, bCol = NS.bcolor || NS.color || null, nLay = lay('p-pole');
    for (const { p, ph, w, h, q, u } of photoPl.out) {
      if (ph && havePhotos) {
        getImgs().image(o, lay(photoLayer), ph.file, ph.px, ph.py, q[0] - w / 2, q[1] - h / 2, w, h);
        o.lwpoly(lay(photoLayer), [[q[0] - w / 2, q[1] - h / 2], [q[0] + w / 2, q[1] - h / 2], [q[0] + w / 2, q[1] + h / 2], [q[0] - w / 2, q[1] + h / 2]], { closed: true, color: 8 }); // its frame
        if (markMode === 'both') { // v2.41: its number at the photo's upper left, on a dark box (it reads on any photo)
          const th = Math.max(1.2, Math.min(NS.h, h * 0.3)), D = NS.d > 0 ? Math.max(th * 1.7, String(p.seq).length * th * CHW + th * 0.6) : 0, r0 = (D || th * 1.6) / 2;
          const c = [q[0] - w / 2 + r0 + 0.4, q[1] + h / 2 - r0 - 0.4];
          if (D) o.circle(nLay, c[0], c[1], D / 2, { color: bCol });
          o.mtext(nLay, c[0], c[1], th, String(p.seq), { att: 5, style: 'arial', color: nCol, mask: 250 });
        }
      } else {
        const D = NS.d > 0 ? numD(p) : 0;
        if (D) o.circle(nLay, q[0], q[1], D / 2, { color: bCol });
        o.text(nLay, q[0], q[1], NS.h, String(p.seq), { ha: 1, va: 2, style: 'arial', color: nCol });
        if (NS.leader) { const la = add2(p.dp, u, rOf(p) + 0.2), lb = add2(q, u, -(D || NS.h) / 2 - 0.2); if (dist2(la, lb) > 0.5) o.lwpoly(nLay, [la, lb], { color: bCol }); }
      }
    }
    rep.photoSize = +Lp.toFixed(1); rep.photosNotFree = photoPl.miss; rep.markMode = markMode;
    rep.marks = markOrder.map((p) => [p.seq, String(p.id), photos[p.id] || photos[String(p.id)] ? (markMode === 'both' ? 'photo+number' : 'photo') : 'number']); // v2.40: the numbers on the plan
    // 11. coordinates of the points that are not poles
    // v2.37: smaller, where they cover nothing (none for a NAP or closure drawn on its pole)
    for (const p of pts) {
      if (p.el === 'Pole' || p.onPole) continue;
      const q0 = inl.has(p) ? inl.get(p).at : [p.E, p.N], ext = inl.has(p) ? Math.max(inl.get(p).hl, inl.get(p).hh) : 3, hL = 1.2, w = 10 * hL * CHW, h = 2 * 1.67 * hL;
      // v2.41: where every place is taken, over a road edge line or the cable rather than over an ID, a number or a photo
      const cs = []; for (const r of [ext + 1.5, ext + 5, ext + 9, ext + 13, ext + 18]) for (const a of [-45, 45, -135, 135, -90, 90, 0, 180]) { const u = rotv([1, 0], a), c = add2(q0, u, r + w / 2 * Math.abs(u[0]) + h / 2 * Math.abs(u[1])); cs.push({ q: [c[0] - w / 2, c[1] + h / 2], boxes: [Spots.box(c[0], c[1], w * 1.1, h, 0)] }); }
      const c = pickW(spots, cs, LL_W); spots.add(c.boxes);
      o.mtext(lay('LATLONG'), c.q[0], c.q[1], hL, `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`, { style: '样式 1' });
    }
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
        for (const r of list) for (const piece of clipLine(r.pts, [W[0] + 3, W[1] + 3, W[2] - 3, W[3] - 3])) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); if (L >= 8) segs.push({ a: piece[k - 1], b: piece[k], L, hw: r.hw || 3 }); }
        if (!segs.length) continue;
        segs.sort((x, y) => y.L - x.L);
        let done = false;
        // v2.39.1: on the middle of the road, else across it from the cable (the cable runs inside the road), smaller on a narrow road
        // v2.41: a size smaller again (2 m, 1.6 m) before giving up, and a little more room round it so it does not run into a span
        //        length or a label beside it
        look: for (const h of [3.2, 2.6, 2.0, 1.6]) for (const sg of segs.slice(0, 8)) {
          const u = unit(sg.a, sg.b), rd = readable(deg(u)), nv = [-u[1], u[0]];
          for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const dd of [0, 0.4, -0.4, 0.6, -0.6]) {
            const q = add2(add2(sg.a, u, f * sg.L), nv, dd * sg.hw), b0 = textBox(q[0], q[1], h, txt, rd, 1, 2), b = { ...b0, hw: b0.hw + h * 1.2, hh: b0.hh + 0.35 }; // room at its ends and sides
            if (!inside(b0, W, 1) || spots.hits(b)) continue;
            o.text(lay('STREET NAME'), q[0], q[1], h, txt, { rot: rd, ha: 1, va: 2, style: 'arial' }); spots.add(b, 'street'); nStreets++; done = true; break look;
          }
        }
      }
    }
    for (const p of polesOnly) if (p.near && !p.near.r.name) unnamedNear++;
    rep.streetNames = nStreets; rep.polesOnUnnamedRoads = unnamedNear;
    // 10. (v2.39.1: after the street names, which come first) the cable's name along each run, where there is room: v2.37 the size of the span lengths, close along the cable. v2.39: on
    //     every GEO sheet the run crosses (where 40 m of it are on the sheet), as the company's plans repeat it; else once
    const sheetWins = geoCells.map((c) => [gox + c.i * cell, goy + c.j * cell, gox + (c.i + 1) * cell, goy + (c.j + 1) * cell]);
    const boxIn = (b, W, m) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([u, v]) => { const x = b.cx + b.ux * b.hw * u + b.vx * b.hh * v, y = b.cy + b.uy * b.hw * u + b.vy * b.hh * v; return x >= W[0] + m && x <= W[2] - m && y >= W[1] + m && y <= W[3] - m; });
    let nCableNames = 0;
    for (const ch of chains) {
      const txt = label.get(ch.cable); if (!txt || !ch.pieces || !ch.pieces.length) continue;
      const th = Math.max(1.4, 2.0 * kG), off = th * 0.75 + 0.6;
      const place = (W) => {
        const segs = [], cands = []; let total = 0;
        for (const line of ch.pieces) for (const piece of W ? clipLine(line, [W[0] + 4, W[1] + 4, W[2] - 4, W[3] - 4]) : [line]) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); total += L; if (L > 1) segs.push({ L, a: piece[k - 1], b: piece[k] }); }
        if (!segs.length || (W && total < 40)) return false;
        segs.sort((x, y) => y.L - x.L);
        const ks = W ? [1, -1, 1.7, -1.7, 2.5, -2.5] : [1, -1, 1.7, -1.7, 2.5, -2.5, 3.5, -3.5]; // v2.39.1: the one fallback looks a little further out
        // v2.40: the one fallback, crowded (a short underground run between handholes), also a size smaller
        // v2.41: the name never runs past the line it names: on a short piece of cable it is made smaller to fit (down to 0.9 m)
        const tw1 = txt.length * CHW; // its width for a height of 1 m
        for (const h0 of W ? [th] : [th, th * 0.8]) for (const sg of segs.slice(0, 12)) {
          const h = Math.min(h0, (sg.L * 0.92) / tw1); if (h < 0.9) continue;
          const o2 = h * 0.75 + 0.6, t = unit(sg.a, sg.b), rd = readable(deg(t)), nl = [-t[1], t[0]], fs = h * tw1 > sg.L * 0.6 ? [0.5] : [0.5, 0.3, 0.7, 0.15, 0.85];
          for (const k of ks) for (const f of fs) { const q = add2(add2(sg.a, t, sg.L * f), nl, k * o2), bx = textBox(q[0], q[1], h, txt, rd, 1, 2); if (!W || boxIn(bx, W, 1)) cands.push({ q, rd, h, k: Math.abs(k), boxes: [bx] }); }
        }
        if (!cands.length) return false;
        cands.sort((x, y) => (x.h < th - 1e-9) - (y.h < th - 1e-9) || (!W && ((x.k > 2.5) - (y.k > 2.5)))); // full size first (close to the cable first, then further out), then smaller
        // on a sheet: only where it covers nothing; the one fallback: where it covers least, never over a street name if it can help it
        const wf = (t) => (t === 'street' ? 6 : t === 'road' ? 0.2 : 1), nOf = (x) => (x && x.n) || 0;
        const full = cands.filter((x) => x.h >= th - 1e-9), small = cands.filter((x) => x.h < th - 1e-9);
        let c = W ? pick(spots, cands) : full.length ? pickW(spots, full, wf) : pickW(spots, small, wf); if (W && c.n > 0) return false;
        if (!W && nOf(c) >= 1 && small.length && full.length) { const s2 = pickW(spots, small, wf); if (s2 && nOf(s2) < nOf(c)) c = s2; } // smaller only when the full size would cover a label
        o.text(lay('MISC'), c.q[0], c.q[1], c.h || th, txt, { rot: c.rd, ha: 1, va: 2, style: 'arial', color: (CABLE_STYLE[ch.cable] || {}).color || null }); spots.add(c.boxes); nCableNames++;
        return true;
      };
      let n = 0; for (const W of sheetWins) if (place(W)) n++;
      if (!n) place(null);
    }
    let nPois = 0, nIcons = 0; const placed = [], poiSkip = { outside: 0, dup: 0, noRoom: 0 }; // v2.39.1: why a place was not written
    // v2.35.6: the landmark's icon (OpenStreetMap Carto / Maki, CC0) as a block of solid fills, on its own layer
    const LMB = Array.isArray(job.lmBlocks) ? job.lmBlocks : null, lmRefs = job.lmRefs || [], ICON = 4, LMLAY = 'G-ESAA LANDMARK';
    const iconName = (i) => 'GESAA_LM_' + String(lmRefs[i] || i).replace(/^[cm]:/, '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
    const wantIcons = LMB ? [...new Set((job.pois || []).map((q) => q.icon).filter((i) => Number.isInteger(i) && i >= 0 && LMB[i]))] : [];
    if (wantIcons.length) { addLayer(d, S, LMLAY, 7); fillBlocks(d, S, wantIcons.map((i) => ({ name: iconName(i), icon: LMB[i] }))); }
    for (const poi of job.pois || []) {
      const name = String(poi.name || '').trim().toUpperCase(); if (!name || !Number.isFinite(poi.E) || !Number.isFinite(poi.N)) continue;
      const q0 = [poi.E, poi.N], W = wins.find((w) => q0[0] >= w[0] && q0[0] <= w[2] && q0[1] >= w[1] && q0[1] <= w[3]);
      if (!W) { poiSkip.outside++; continue; } if (placed.some((x) => x.name === name && dist2(x.q, q0) < 60)) { poiSkip.dup++; continue; }
      const ic = Number.isInteger(poi.icon) && poi.icon >= 0 && S.blocks.has(iconName(poi.icon)) ? iconName(poi.icon) : null;
      const ib = ic ? Spots.box(q0[0], q0[1], ICON * 1.1, ICON * 1.1, 0) : null, useIcon = !!(ib && !spots.hits(ib) && !R.idx.inside(q0, -1, -1));
      const lines = []; for (const w of name.split(/\s+/)) { const l = lines.length - 1; if (l >= 0 && (lines[l] + ' ' + w).length <= 22) lines[l] += ' ' + w; else lines.push(w); } // two lines at most
      if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, 20) + '...'; }
      const wide = lines.reduce((a, b) => (b.length > a.length ? b : a), ''), tall = lines.length;
      const nr = nearestRoad(R.roads, q0, 45), u = nr ? nr.dir : [1, 0], rd = readable(deg(u)), ru = [Math.cos(rd * Math.PI / 180), Math.sin(rd * Math.PI / 180)], rv = [-ru[1], ru[0]];
      const cands = [];
      const bi = ICON * 0.55 + 1.25 * tall * 1.25 / 2 + 0.4; // with an icon: right beside it first
      // v2.39.1: the whole text off the roads; when nothing is free close by, a little further (to 20 m), then smaller (2.0)
      let c = null;
      for (const [th, B, A] of [[2.5, [0, 5, -5, 9, -9, 14, -14], [0, 6, -6, 12, -12]], [2.5, [19, -19, 24, -24], [0, 6, -6, 12, -12, 18, -18]], [2.0, [0, 4, -4, 8, -8, 12, -12, 16, -16, 20, -20], [0, 5, -5, 10, -10, 15, -15]]]) {
        const bs = useIcon && th === 2.5 && B[0] === 0 ? [bi, -bi, ...B] : B;
        for (const b of bs) for (const a of A) { const q = add2(add2(q0, ru, a), rv, b), bx = textBox(q[0], q[1], th, wide, rd, 1, 2); bx.hh *= tall; if (!R.idx.inside(q, -1, -1) && !corners(bx).some((cq) => R.idx.inside(cq, -1, -1)) && inside(bx, W, 1)) cands.push({ q, th, boxes: [bx] }); }
        c = cands.find((x) => !x.boxes.some((bb) => spots.hits(bb) || (useIcon && Spots.hit(bb, ib)))); if (c) break; cands.length = 0;
      }
      if (!c) { poiSkip.noRoom++; continue; }
      if (useIcon) { o.insert(LMLAY, ic, q0[0], q0[1], { scale: ICON }); spots.add(ib); nIcons++; }
      o.mtext(lay('House Number', 'MISC'), c.q[0], c.q[1], c.th, lines.map(mtextEsc).join('\\P'), { style: 'PDF Arial', att: 5, color: 7, dir: ru }); spots.add(c.boxes); placed.push({ name, q: q0 }); nPois++;
    }
    /* the vicinity map, beside the plan: the route as a bold red broken line over the street map (or a copy of the roads), the
       names of the main streets large enough at that scale (v2.34: no label, no start mark: just the route). Its viewport shows
       only that; the GEO sheets and the keymap do not. */
    const vlayH = addLayer(d, S, VLAY, 1);
    const vlt = S.ltypes.has('DASHED') ? 'DASHED' : null, WHITE = { color: 255, tc: 0xFFFFFF };
    rep.vicinities = [];
    vics.forEach((v, lk) => { // v2.38: one vicinity map for each place: its route, its points, its circle
      const vic = v.area, vb = v.vb, VDX = v.dx, vsh = v.sh, vk = vic[2] / 1500, img = v.image;
      const inLoc = (p) => (locOfPt.get(p) || 0) === lk, lpts = pts.filter(inLoc);
      if (!img) { // no picture: the roads, thin
        R.edges.forEach((l) => { for (const c of clipLine(l.pts.concat(l.closed ? [l.pts[0]] : []), vb)) if (c.length > 1) o.lwpoly(VLAY, c.map(vsh), { color: 7 }); });
        R.paths.forEach((l) => { for (const c of clipLine(l, vb)) if (c.length > 1) o.lwpoly(VLAY, c.map(vsh), { color: 8 }); });
      }
      // v2.36: the route stands out on any picture: a white band under the red broken line (v2.40: no dot at each pole any more),
      // and a circle round the area marked PROJECT AREA (yellow over a satellite picture, red over a street map).
      // v2.37: bolder (the band, the line, the dots and the circle), the label in yellow on a dark box with a yellow frame; the app
      // darkens and greys the picture outside the circle (the same circle)
      // v2.40: the cable route only (no dot at each pole: on a long route they hid the line), its width set by the map's size (vk: the
      //        map's width / 1500 m) so it reads the same on a 1.5 km or an 8 km map: the red line 1.1 % of the map's width, on a white band
      //        twice as wide
      const lch = chains.filter((ch) => ch.ids && ch.ids.length && locOfId(ch.ids[0]) === lk);
      // v2.41: its colour and width as the user set them (Drawing style; by default red / blue / green by cable, 16.5 m per 1.5 km)
      const rw = VS.routeW * vk;
      for (const ch of lch) if (ch.line && ch.line.length > 1) o.lwpoly(VLAY, ch.line.map(vsh), { w: rw * 2, ...WHITE, gen: true });
      for (const ch of lch) if (ch.line && ch.line.length > 1) o.lwpoly(VLAY, ch.line.map(vsh), { w: rw, color: VS.route || (ch.existing ? 5 : ch.ug ? 3 : 1), lt: ch.ug ? null : vlt, lts: vlt && !ch.ug ? rw * 26 / 16.5 : 0, gen: true });
      if (!lch.some((ch) => ch.line && ch.line.length > 1)) { // a place with no cable route (points not linked yet): a dot at each point, as before
        const vDot = (q, r, col) => o.lwpoly(VLAY, [[q[0] - r / 2, q[1], 1], [q[0] + r / 2, q[1], 1]], { closed: true, w: r, ...col }); // a filled disc of radius r
        for (const p of lpts) { if (p.el === 'NAP' || p.el === 'Closure') continue; const q = vsh(p.dp || [p.E, p.N]); vDot(q, 14 * vk, WHITE); vDot(q, 9.5 * vk, { color: 1 }); } }
      { const dps = lpts.map((p) => p.dp || [p.E, p.N]), xs = dps.map((q) => q[0]), ys = dps.map((q) => q[1]);
        const vc = Array.isArray(v.circle) && v.circle.length === 3 ? v.circle : null;
        const c = vsh(vc ? [vc[0], vc[1]] : [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
        // v2.41: the circle yellow again on every map (v2.40: red over a street map), its colour and width as the user set them
        const rad = vc ? vc[2] : Math.max(70 * vk, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 45 * vk), col = VS.circle || 2;
        o.lwpoly(VLAY, [[c[0] - rad, c[1], 1], [c[0] + rad, c[1], 1]], { closed: true, w: VS.circleW * vk, color: col });
        const lh = 18 * vk, lw = 'PROJECT AREA'.length * lh * 0.74, ly = c[1] + rad + 8 * vk + lh * 0.9; // the label on a dark box, framed
        o.lwpoly(VLAY, [[c[0] - lw / 2 - lh * 0.6, ly - lh * 0.9], [c[0] + lw / 2 + lh * 0.6, ly - lh * 0.9], [c[0] + lw / 2 + lh * 0.6, ly + lh * 0.9], [c[0] - lw / 2 - lh * 0.6, ly + lh * 0.9]], { closed: true, w: 2 * vk, color: 2 });
        o.mtext(VLAY, c[0], ly, lh, 'PROJECT AREA', { att: 5, style: 'arial', color: 2, mask: 250 });
        if (!lk) rep.vicinityMark = { r: rad };
        rep.vicinities.push({ sheet: vicNames[lk], area: vic.slice(), dx: VDX, points: lpts.length, circle: [c[0] - VDX, c[1], rad], picture: img ? img.file : null }); }
      if (!img) { // no picture: the names of the roads written large
        const done = new Set();
        for (const r of R.roads.slice().sort((a, b) => b.hw - a.hw)) {
          if (!(r.hw > 0) || !r.name || done.has(r.name)) continue; let best = null;
          for (const piece of clipLine(r.pts, vb)) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); if (L > 80 * vk && (!best || L > best.L)) best = { L, a: piece[k - 1], b: piece[k] }; }
          if (!best) continue; done.add(r.name); if (done.size > 25) break;
          o.text(VLAY, (best.a[0] + best.b[0]) / 2 + VDX, (best.a[1] + best.b[1]) / 2, 8 * vk, r.name.toUpperCase(), { rot: readable(deg(unit(best.a, best.b))), ha: 1, va: 2, style: 'arial', color: 8 });
        }
      } else o.mtext(VLAY, vb[0] + VDX + 8 * vk, vb[1] + 14 * vk, 6 * vk, mtextEsc(String(img.credit || '© OpenStreetMap contributors').toUpperCase()), { att: 7, style: 'arial', color: 7, mask: 255 }); // v2.36: on a white box (readable on a satellite picture)
    });
    const layerH = (n) => (S.layers.has(n) ? get(S.layers.get(n), 5) : null);
    const vicOnly = [layerH(VLAY), layerH(VMAP)].filter(Boolean);
    const keepInVic = new Set([VLAY, VMAP]);
    const offInVic = [...(o.used || [])].filter((n) => !keepInVic.has(n)).map(layerH).filter(Boolean);
    for (const L of S.layouts) {
      const vp = bigVp(L); if (!vp) continue;
      if (vicNames.includes(L.name)) vpFreeze(vp, offInVic); else if (/^GEO( \(\d+\))?$/.test(L.name) || kmNames.includes(L.name)) vpFreeze(vp, vicOnly); // v2.38: every place's sheets
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
      SCALE: (sh) => (geoNames(N).includes(sh) ? `1 : ${(viewH / 400 * 1000).toLocaleString('en-US')} METERS` : kmNames.includes(sh) ? `1 : ${(Math.round(kmH[kmNames.indexOf(sh)] / 400 * 1000 / 100) * 100).toLocaleString('en-US')} METERS` : vicNames.includes(sh) ? `1 : ${(Math.round(vics[vicNames.indexOf(sh)].area[2] / 400 * 1000 / 100) * 100).toLocaleString('en-US')} METERS` : ''),
      IDX_TL: (sh) => idx(sh, -1, 1), IDX_T: (sh) => idx(sh, 0, 1), IDX_TR: (sh) => idx(sh, 1, 1), IDX_L: (sh) => idx(sh, -1, 0), IDX_C: (sh) => idx(sh, 0, 0), IDX_R: (sh) => idx(sh, 1, 0), IDX_BL: (sh) => idx(sh, -1, -1), IDX_B: (sh) => idx(sh, 0, -1), IDX_BR: (sh) => idx(sh, 1, -1),
      TOC_GEO: () => String(N), TOC_LEGEND: () => String(sheetNames.filter((n) => /^LEGENDS?( \(\d+\))?$/.test(n)).length), TOC_TOTAL: () => String(sheetNames.filter((n) => n !== 'Model').length),
    };
    const blanks = new Set(), filled = new Set(), rowCells = [];
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
        if (t === 'MTEXT' && /^ROW_(BARANGAY|MUNICIPALITY)_\d$/.test(k) && v) rowCells.push([r, v]); // v2.35: fitted to its cell below
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
    // v2.35: a city / municipality or barangay of the ROW table on one line of its cell: the text box as wide as the cell, and a
    // long name made smaller (the rows are one line tall)
    if (rowCells.length) {
      const mod = d.sec('ENTITIES').recs.filter((r) => owner(r) === S.modelH && (typ(r) === 'LINE' || typ(r) === 'LWPOLYLINE'));
      for (const [r, v] of rowCells) {
        const h = +get(r, 40) || 9, x = +get(r, 10), y = +get(r, 20), box = cellOf(mod, x + 1, y - h / 2);
        const avail = box ? box.x1 - x - h * 0.3 : (+get(r, 41) || 20 * h), need = v.length * h * 0.7;
        setFirst(r, 41, F(Math.max(+get(r, 41) || 0, avail)));
        if (need > avail) setFirst(r, 40, F(Math.max(h * 0.45, h * avail / need)));
      }
    }
    /* 6. v2.36: the template's tables in model space (legend, ROW table, project management table) moved right beside the plan,
       in a row below the key map grid and the vicinity map, instead of where the template has them (about 1,100 km from the
       plan's UTM coordinates); the sheets that show them follow. The plan itself stays at its true UTM coordinates. */
    {
      const vps = (L) => layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').slice(1).filter((e) => parseInt(get(e, 69, '0'), 10) !== 1 && num(e, 40, 0) > 0 && num(e, 45, 0) > 0); // the first is the sheet itself
      const win = (vp) => { const cx = num(vp, 17, 0) + num(vp, 12, 0), cy = num(vp, 27, 0) + num(vp, 22, 0), h = num(vp, 45, 0), w = h * num(vp, 40, 1) / (num(vp, 41, 1) || 1); return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; };
      const groups = [];
      for (const L of S.layouts) {
        if (!/^(LEGENDS?( \(\d+\))?|ROW AREA COVERAGE|PMI)$/.test(L.name)) continue;
        for (const vp of vps(L)) {
          const w = win(vp), g = groups.find((x) => !(w[2] < x.w[0] || w[0] > x.w[2] || w[3] < x.w[1] || w[1] > x.w[3]));
          if (g) { g.vps.push(vp); g.w = [Math.min(g.w[0], w[0]), Math.min(g.w[1], w[1]), Math.max(g.w[2], w[2]), Math.max(g.w[3], w[3])]; g.names.add(L.name); }
          else groups.push({ w, vps: [vp], names: new Set([L.name]) });
        }
      }
      // only what lies away from the plan (a window over the plan, e.g. a sheet of the plan itself, stays)
      const planBox = [gx0 - cell, Math.min(gy0, ...vics.map((v) => v.sb[1])) - cell, Math.max(gx1, ...vics.map((v) => v.sb[2])) + cell, Math.max(gy1, ...vics.map((v) => v.sb[3])) + cell]; // v2.38: every place and vicinity map
      const away = groups.filter((g) => g.w[2] < planBox[0] || g.w[0] > planBox[2] || g.w[3] < planBox[1] || g.w[1] > planBox[3]).sort((a, b) => a.w[0] - b.w[0]);
      const ents = d.sec('ENTITIES').recs, kids = new Map(); // an INSERT's attributes (and SEQEND) follow it
      for (const r of ents) { const ow = owner(r); if (ow && ow !== S.modelH) (kids.get(ow) || kids.set(ow, []).get(ow)).push(r); }
      const model = ents.filter((r) => owner(r) === S.modelH && String(get(r, 67, '0')).trim() !== '1');
      // each entity away from the plan goes with the nearest table (the template keeps notes and samples beside its tables too)
      const dWin = (q, w) => Math.hypot(Math.max(w[0] - q[0], 0, q[0] - w[2]), Math.max(w[1] - q[1], 0, q[1] - w[3]));
      for (const g of away) { g.recs = []; g.ext = g.w.slice(); }
      const refOf = (r) => { // where an entity shows (an INSERT's block may be drawn far from its base point)
        const q = [num(r, 10, NaN), num(r, 20, NaN)]; if (typ(r) !== 'INSERT') return q;
        const bb = blockBox(S, get(r, 2)), at = (kids.get(get(r, 5)) || []).find((k) => typ(k) === 'ATTRIB'); if (!bb) return at ? [num(at, 10, q[0]), num(at, 20, q[1])] : q; // a block of fills only: its attributes show where
        const sx = num(r, 41, 1), sy = num(r, 42, 1), a = num(r, 50, 0) * Math.PI / 180, x = (bb[0] + bb[2]) / 2 * sx, y = (bb[1] + bb[3]) / 2 * sy;
        return [q[0] + x * Math.cos(a) - y * Math.sin(a), q[1] + x * Math.sin(a) + y * Math.cos(a)];
      };
      for (const r of model) {
        const q = refOf(r); if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
        if (!(q[0] < planBox[0] || q[0] > planBox[2] || q[1] < planBox[1] || q[1] > planBox[3])) continue;
        let best = null; for (const g of away) { const dd = dWin(q, g.w); if (dd < 1000 && (!best || dd < best.dd)) best = { g, dd }; }
        if (!best) continue;
        const g = best.g; g.recs.push(r);
        const X = all(r, 10).map(Number).concat(all(r, 11).map(Number)), Y = all(r, 20).map(Number).concat(all(r, 21).map(Number)); // its extent, roughly (text width not counted)
        if (typ(r) === 'INSERT') { g.ext[0] = Math.min(g.ext[0], q[0]); g.ext[2] = Math.max(g.ext[2], q[0]); g.ext[1] = Math.min(g.ext[1], q[1]); g.ext[3] = Math.max(g.ext[3], q[1]); }
        else if (typ(r) !== 'MTEXT' && typ(r) !== 'MULTILEADER') { X.forEach((v) => { g.ext[0] = Math.min(g.ext[0], v); g.ext[2] = Math.max(g.ext[2], v); }); Y.forEach((v) => { g.ext[1] = Math.min(g.ext[1], v); g.ext[3] = Math.max(g.ext[3], v); }); }
        else { g.ext[0] = Math.min(g.ext[0], q[0]); g.ext[2] = Math.max(g.ext[2], q[0] + num(r, 41, 0)); g.ext[1] = Math.min(g.ext[1], q[1] - num(r, 40, 0)); g.ext[3] = Math.max(g.ext[3], q[1]); }
      }
      const GAP = 60, top = Math.min(gy0, ...vics.map((v) => v.sb[1]), ...kmBox.map((b, k) => (b[1] + b[3]) / 2 - kmH[k] / 2)) - GAP; let x = gx0, moved = 0; // below the grid, the vicinity maps and what the keymap sheets show
      for (const g of away) {
        const dx = x - g.ext[0], dy = top - g.ext[3];
        for (const r of g.recs) {
          if (shiftRec(r, dx, dy)) { moved++; (kids.get(get(r, 5)) || []).forEach((k) => shiftRec(k, dx, dy)); } else rep.notes.push(`${typ(r)} in ${[...g.names].join(' / ')} not moved`);
          if (typ(r) === 'LWPOLYLINE' && all(r, 43).some((v) => +v > 0) && ['DASHED', 'AERCA', 'AERCAB'].includes(get(r, 6, ''))) { // the legend's cable samples as the plan's cable
            r.forEach((q) => { if (q[0] === 43) q[1] = F(0); }); // (the template writes its width twice)
            if (get(r, 370) == null) { let k = -1; r.forEach((q, i) => { if ([8, 6, 62, 420].includes(q[0]) && (k < 0 || i > k) && !r.slice(1, i).some((x) => x[0] === 100 && x[1] !== 'AcDbEntity' && r.slice(1, i).some((y) => y[0] === 100 && y[1] === 'AcDbEntity'))) k = i; }); r.splice(k + 1, 0, [370, I(CABLE_LWT)]); }
          }
        }
        for (const vp of g.vps) { setFirst(vp, 17, F(num(vp, 17, 0) + dx)); setFirst(vp, 27, F(num(vp, 27, 0) + dy)); }
        x += g.ext[2] - g.ext[0] + GAP;
      }
      rep.tablesMoved = { groups: away.map((g) => [...g.names].join(' / ')), entities: moved };
    }
    { const lw = d.headerVar('$LWDISPLAY'); if (lw) lw[1] = I(1); } // v2.36: line weights shown on screen (the cable's thickness)
    rep.blanks = [...blanks].filter((k) => !filled.has(k) && !/^IDX_/.test(k)).sort(); // an empty index key = no sheet on that side, not a missing field
    rep.partly = [...blanks].filter((k) => filled.has(k)).sort();
    if (job.debug) rep.pts = pts.map((p) => ({ id: p.id, poleId: p.poleId, el: p.el, dp: p.dp, A: p.A, kept: !!p.kept, moved: p.moved || 0, onPole: p.onPole ? p.onPole.id : null }));
    if (job.debug) rep.inline = [...inl.values()].map((it) => ({ b: it.b, at: it.at, hl: it.hl, hlo: it.hlo, hhi: it.hhi, hh: it.hh, sc: it.sc, rot: it.rot, box: blockBox(S, it.b, 0), boxT: blockBoxT(S, it.b), c: blockCenter(S, it.b) }));
    rep.counts = { ...o.n, roads: nRoads, roadEdges: R.edges.length, pois: nPois, poisGiven: (job.pois || []).length, poisOutside: poiSkip.outside, poisDuplicate: poiSkip.dup, poisNoRoom: poiSkip.noRoom, landmarkIcons: nIcons, geoSheets: N, gridCells: cellsI * cellsJ, polesMoved: pts.filter((p) => p.moved > 0.05).length, polesKept: pts.filter((p) => p.kept).length, inlineBlocks: nInline, odc: nOdc, olt: nOlt, poleToPole: nP2P, grounding: nGround, risers: nRiser, hdd: nHdd, cableNames: nCableNames, napsOnPoles: pts.filter((p) => p.el === 'NAP' && p.onPole).length };
    rep.grid = { cell, cols: cellsI, rows: cellsJ, origin: [gx0, gy0] };
    return { text: d.text(), report: rep };
  }
  return { build, Doc, structure, clipLine, roadWidth, layoutRoads, vicCircle, locations, vicArea, markOrder, NUM_STYLE, ID_STYLE, VIC_STYLE, version: '2.41.0' };
}));
