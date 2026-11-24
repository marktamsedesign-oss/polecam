/* G-eSAA v2.42.9: the plan's sheets as a PDF, drawn from the plan DXF the app made (no CAD program needed): every sheet (layout) of
   the template in its tab order, on its paper size, its title block and texts, and what each of its viewports shows of model space
   (the plan, the legend, the tables, the vicinity map), with the pictures (pole photos, vicinity map, logo) the export has.
   A stand-in for printing from AutoCAD: lines, polylines (widths, arcs), circles, arcs, ellipses, splines, solids and solid
   hatches, texts (Helvetica: the template's fonts are not embedded), blocks and their attributes, dimensions, pictures; colours
   (ACI and true colour), line weights, line types (dashes) and the layers frozen or off (also per viewport) as the DXF has them.
   Pattern hatches are left out. Everything runs on the phone: nothing is uploaded.
   beta 7.4 / 2.45.6: printed as AutoCAD prints it: the colours by AutoCAD's rules (BYLAYER, BYBLOCK, layer 0 in a block, an
   attribute in its block reference's, an MTEXT's own colours in it), the text styles' bold and italic (Helvetica-Bold, -Oblique),
   an SHX font's look (its widths, its strokes as thick as the line weight), a text's own width factor, and the default line
   weight 0.25 mm.
     GeDxfPdf.toPdf(dxfText, { images: { 'VICINITY_MAP.jpg': Uint8Array (JPEG), … }, title, deflate: async (bytes) => bytes })
     → Promise<Uint8Array> (the PDF), with .report = { sheets, pictures, missing }
   (Drawing preview) GeDxfPdf.planList(dxfText, report) → the plan's model space as its GEO sheets print it, drawn by the same draw(), as a
     display list in model metres for the Drawing screen (modelList); toPdf's output is the same as before, byte for byte. */
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
  /** beta 4.7: an MTEXT's text as lines of runs [{ s, c }] (c: the colour number a \C code set, null: the entity's colour), read as plain() reads it.
   *  beta 7.4 / 2.45.6: each run with its look as the codes set it, from base (the style's): { s, c (\C: 0 BYBLOCK, 256 BYLAYER),
   *  tc (\c: a true colour, written blue-green-red), b, i (\f…|b1|i1: bold, italic), x (an SHX font: \F…shx), w (\W: width factor),
   *  q (\Q: oblique) }; specials (%%d …) read in each run. */
  function colourRuns(raw, base) {
    const out = [[]], stack = []; let cur = { c: null, tc: null, ...base }, buf = '';
    const flush = () => { if (buf) { out[out.length - 1].push({ ...cur, s: buf }); buf = ''; } };
    const font = (n, a) => { const [nm, ...fl] = a.split('|'), shx = /\.shx\s*$/i.test(nm) || (n === 'F' && !fl.length && !/\.\w+\s*$/.test(nm)); return shx ? { x: true, b: false, i: false } : { x: false, b: fl.includes('b1') || /bold|black|heavy/i.test(nm), i: fl.includes('i1') || /italic|oblique/i.test(nm) }; };
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i], n = raw[i + 1];
      if (ch === '\\' && n !== undefined) {
        if ('CcFfWQ'.includes(n)) {
          const j = raw.indexOf(';', i);
          if (j > i) {
            flush(); const a = raw.slice(i + 2, j), v = parseFloat(a);
            if (n === 'C') { if (Number.isFinite(v)) cur = { ...cur, c: Math.round(v), tc: null }; }
            else if (n === 'c') { if (Number.isFinite(v)) cur = { ...cur, tc: [v & 255, (v >> 8) & 255, (v >> 16) & 255] }; } // (AutoCAD writes it blue-green-red)
            else if (n === 'W') { if (v > 0) cur = { ...cur, w: /x\s*$/i.test(a) ? (cur.w || 1) * v : v }; }
            else if (n === 'Q') { if (Number.isFinite(v)) cur = { ...cur, q: v }; }
            else cur = { ...cur, ...font(n, a) };
            i = j; continue;
          }
        }
        if (n === 'P' || n === 'N') { flush(); out.push([]); i++; continue; }
        if (n === '\\' || n === '{' || n === '}') { buf += n; i++; continue; }
        if (n === '~') { buf += ' '; i++; continue; }
        if ('LlOoKk'.includes(n)) { i++; continue; }
        if ('AFfHhQqTtWwp'.includes(n)) { const j = raw.indexOf(';', i); if (j > i) { i = j; continue; } }
        if (n === 'S') { const j = raw.indexOf(';', i); if (j > i) { buf += raw.slice(i + 2, j).replace(/[\^#]/g, '/'); i = j; continue; } }
        if (n === 'U' && raw[i + 2] === '+') { buf += String.fromCharCode(parseInt(raw.slice(i + 3, i + 7), 16)); i += 6; continue; }
      }
      if (ch === '{') { flush(); stack.push(cur); continue; }
      if (ch === '}') { flush(); cur = stack.length ? stack.pop() : { c: null, tc: null, ...base }; continue; }
      if (ch === '^' && (n === 'J' || n === 'I')) { if (n === 'J') { flush(); out.push([]); } else buf += ' '; i++; continue; }
      buf += ch;
    }
    flush(); return out.map((L) => L.map((x) => ({ ...x, s: special(x.s) })));
  }
  const special = (s) => String(s).replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%');
  const CAP = 0.718; // Helvetica's capital height (AutoCAD's text height is the capitals' height)
  /* beta 7.4 / 2.45.6: a text's font: { b: bold, i: italic, x: an SHX font (AutoCAD's stroke fonts: simplex, romans, txt …) }.
     Bold and italic: Helvetica-Bold, -Oblique, -BoldOblique. An SHX font: Helvetica at the SHX font's widths (those of simplex and
     romans, the Hershey simplex roman's: SHXW for ASCII 32-126, in 21sts of the capitals' height), its outline thickened to the
     line weight AutoCAD draws its strokes with. */
  const SHXW = [16, 10, 16, 21, 20, 24, 26, 10, 14, 14, 16, 26, 10, 26, 10, 22, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 10, 10, 24, 26, 24, 18, 27,
    18, 21, 21, 21, 19, 18, 21, 22, 8, 16, 21, 17, 24, 22, 22, 21, 22, 21, 20, 16, 22, 18, 24, 20, 18, 20, 14, 14, 14, 16, 16, 10,
    19, 19, 18, 19, 18, 12, 19, 19, 8, 10, 17, 8, 30, 19, 19, 19, 19, 13, 17, 12, 19, 16, 22, 17, 16, 17, 14, 8, 14, 24];
  const shxEm = (ch) => { const c = ch.charCodeAt(0); return c >= 32 && c < 127 ? SHXW[c - 32] * CAP / 21 : R.textWidth(ch, 1, false) * 1.15; };
  const widthEm = (s, f) => { if (f && f.x) { let w = 0; for (const ch of String(s)) w += shxEm(ch); return w; } return R.textWidth(s, 1, !!(f && f.b)); }; // in em (font size 1)
  const fontRes = (f) => (f && !f.x && f.b ? (f.i ? 'F4' : 'F2') : f && !f.x && f.i ? 'F3' : 'F1');
  const LW0 = 0.25; // beta 7.4 / 2.45.6: the line weight "Default" prints with (mm; AutoCAD's LWDEFAULT; 0.18 before)
  /** beta 7.4 / 2.45.6: a STYLE's look: { wf, obl, f }. Bold, italic: the flags of its font (the ACAD xdata: 1000 the font's family,
   *  1071 bit 0x2000000 bold, 0x1000000 italic: an arial.ttf style can be bold so), else its font file's name (arialbd.ttf, …Bold.ttf). An SHX
   *  font: a .shx file, or a file with no extension ("txt"), with no TrueType family. */
  function styleLook(r) {
    const file = String(get(r, 3, '')).trim(), k = r.findIndex((p) => p[0] === 1001 && String(p[1]).trim() === 'ACAD'); let fam = '', fl = 0;
    if (k > 0) for (let i = k + 1; i < r.length && r[i][0] !== 1001; i++) { if (r[i][0] === 1000 && !fam) fam = String(r[i][1]).trim(); else if (r[i][0] === 1071) fl = parseInt(r[i][1], 10) || 0; }
    const win = /^(arial|times|cour|verdana|georgia|calibri|cambria|consola|segoeui|trebuc|tahoma)(bd|bi|b|i|it|z)\.ttf$/i.exec(file), suf = win ? win[2].toLowerCase() : '';
    const x = !fam && (/\.shx$/i.test(file) || (!!file && !/\.\w+$/.test(file)));
    const b = !x && (!!(fl & 0x2000000) || /bd|bold|black|heavy/i.test(`${file} ${fam}`) || /^(bd|bi|b|z)$/.test(suf));
    const i = !x && (!!(fl & 0x1000000) || /italic|oblique/i.test(`${file} ${fam}`) || /^(bi|i|it|z)$/.test(suf));
    return { wf: num(r, 41, 1) || 1, obl: num(r, 50, 0), f: { b, i, x } };
  }

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
      else if (t === 'STYLE') ST.set(String(get(r, 2, '')).toUpperCase(), styleLook(r)); // (beta 7.4 / 2.45.6: its fonts' flags; a style's name is read in any case, as AutoCAD reads it)
    }
    const DEFST = { wf: 1, obl: 0, f: { b: false, i: false, x: false } }, styleOf = (nm) => ST.get(String(nm == null ? 'Standard' : nm).toUpperCase()) || DEFST;
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
      else if (o.model) im = { idx: images.size, file }; // ((Drawing preview) its place only: the Drawing draws its picture there)
      if (!im) rep.missing.add(file);
      images.set(file, im); return im;
    };

    /* beta 7.4 / 2.45.6: colours, line weights and line types by AutoCAD's rules. inh: what a block's entities take from the block
       reference they are drawn in (none outside a block): { color (its colour, resolved), layer (its layer: layer 0 in a block is the
       reference's, in turn), lw, lt }. A true colour (420) wins; BYBLOCK (0): the reference's colour (black outside a block); BYLAYER
       (256, or none): the colour of the entity's layer (of the reference's when it is on layer 0 in a block; not the reference's own
       colour, as before); colour 7 prints black on the white paper. An attribute is drawn in its block reference's (draw()). */
    const tcRGB = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const effLayer = (r, inh) => { const l = get(r, 8, '0'); return l === '0' && inh && inh.layer ? inh.layer : l; };
    const layerRGB = (nm) => { const L = LAY.get(nm) || LAY.get('0'); if (L && L.tc != null) return tcRGB(L.tc); return ACI[L ? L.color : 7] || [0, 0, 0]; };
    const aciRGB = (c, r, inh) => (c === 0 ? (inh && inh.color) || ACI[7] : c > 0 && c < 256 ? ACI[c] : layerRGB(effLayer(r, inh)));
    function colorOf(r, inh) {
      const tc = get(r, 420); if (tc != null) return tcRGB(parseInt(tc, 10));
      return aciRGB(int(r, 62, 256), r, inh);
    }
    const lwOf = (r, inh) => { let w = int(r, 370, -1); if (w === -2) return inh.lw; if (w === -1) { const L = LAY.get(effLayer(r, inh)); w = L ? L.lw : -3; } return w >= 0 ? w : -3; };
    const ltOf = (r, inh) => { let n = String(get(r, 6, 'BYLAYER')).toUpperCase(); if (n === 'BYBLOCK') return inh.lt; if (n === 'BYLAYER') { const L = LAY.get(effLayer(r, inh)); n = String(L ? L.lt : 'CONTINUOUS').toUpperCase(); } return LT.get(n) || null; };
    /** What the entities of a block reference r (an INSERT, a DIMENSION; and its attributes) take from it. */
    const blockInh = (r, inh) => ({ color: colorOf(r, inh), layer: effLayer(r, inh), lw: lwOf(r, inh), lt: ltOf(r, inh) });

    /** Draws records with M (to page pt); ctx: { ops, k (pt per paper unit), frozen, inh, depth, page box for culling } */
    function draw(recs, M, ctx) {
      const { ops } = ctx;
      let ins = null, insInh = null; // beta 7.4 / 2.45.6: the block reference the attributes after it belong to
      for (let n = 0; n < recs.length; n++) {
        const r = recs[n], t = typ(r), lay = get(r, 8, '0');
        if (t === 'INSERT') { ins = r; insInh = null; } else if (t !== 'ATTRIB') ins = null;
        if (t === 'SEQEND' || t === 'ATTDEF' || t === 'VIEWPORT' || t === 'VERTEX') continue;
        const L = LAY.get(lay); if ((L && L.off) || ctx.frozen.has(lay) || int(r, 60, 0) === 1) { if (t === 'POLYLINE') while (n + 1 < recs.length && typ(recs[n + 1]) === 'VERTEX') n++; continue; }
        if (ctx.cull && t !== 'ATTRIB') { const b = boxOf(r); if (b && (b[2] < ctx.cull[0] || b[0] > ctx.cull[2] || b[3] < ctx.cull[1] || b[1] > ctx.cull[3])) { if (t === 'POLYLINE') while (n + 1 < recs.length && typ(recs[n + 1]) === 'VERTEX') n++; continue; } }
        const inh = t === 'ATTRIB' && ins ? insInh || (insInh = blockInh(ins, ctx.inh)) : ctx.inh; // (beta 7.4 / 2.45.6: an attribute: its BYBLOCK, its layer 0 are its block reference's, as AutoCAD draws it)
        const col = colorOf(r, inh), lwv = lwOf(r, inh), pat = ltOf(r, inh), ocs = num(r, 230, 1) < 0 && !['LINE', 'MTEXT', 'POINT', 'IMAGE'].includes(t) ? mul(M, SC(-1, 1)) : M;
        const lwPt = (lwv >= 0 ? Math.max(0.05, lwv / 100) : LW0) * 72 / 25.4;
        const rgb = (c) => `${f4(c[0] / 255)} ${f4(c[1] / 255)} ${f4(c[2] / 255)}`;
        const dash = (sc) => { if (!pat) return ''; const L2 = pat.map((x) => Math.max(Math.abs(x) * LTS * num(r, 48, 1) * sc, x === 0 ? 0.5 : 0.01)); return L2.reduce((a, b) => a + b, 0) < 1.5 ? '' : `[${L2.map(f2).join(' ')}] 0 d `; };
        const stroke = (P, closed, w, cap) => {
          if (P.length < 2) return;
          const Q = P.map(([x, y]) => ap(ocs, x, y));
          ops.push(`q ${rgb(col)} RG ${f2(w != null ? w : lwPt)} w ${cap || '1 J 1 j'} ${dash(ctx.ltk || ctx.k)}${f2(Q[0][0])} ${f2(Q[0][1])} m ${Q.slice(1).map((q) => `${f2(q[0])} ${f2(q[1])} l`).join(' ')}${closed ? ' h' : ''} S Q`);
        };
        const fill = (loops) => {
          const parts = loops.filter((P) => P.length > 2).map((P) => { const Q = P.map(([x, y]) => ap(ocs, x, y)); return `${f2(Q[0][0])} ${f2(Q[0][1])} m ${Q.slice(1).map((q) => `${f2(q[0])} ${f2(q[1])} l`).join(' ')} h`; });
          if (parts.length) ops.push(`q ${rgb(col)} rg ${parts.join(' ')} f* Q`);
        };
        if (t === 'LINE') stroke([[num(r, 10, 0), num(r, 20, 0)], [num(r, 11, 0), num(r, 21, 0)]]);
        else if (t === 'LWPOLYLINE') {
          const V = []; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 10) V.push([+v, 0, 0]); else if (c === 20 && V.length) V[V.length - 1][1] = +v; else if (c === 42 && V.length) V[V.length - 1][2] = +v; }
          const closed = (int(r, 70, 0) & 1) === 1, w = num(r, 43, 0), ww = w > 0 ? w * scaleOf(ocs) : 0;
          stroke(bulgePts(V, closed), closed, w > 0 ? Math.max(lwPt, ww) : null, ww >= lwPt ? '0 J 0 j' : null); // (beta 7.4 / 2.45.6: a wide one square-ended and mitred, as AutoCAD draws it: the scale bar's steps)
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
        else if (t === 'TEXT' || t === 'ATTRIB') { if (t === 'ATTRIB' && (int(r, 70, 0) & 1)) continue; textOps(r, ocs, col, ops, lwPt); }
        else if (t === 'MTEXT') mtextOps(r, M, col, ops, inh, lwPt);
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
          const bi = { color: col, layer: effLayer(r, inh), lw: lwv, lt: pat }; // (beta 7.4 / 2.45.6: blockInh(); its layer for its entities on layer 0)
          draw(b.ents, BM, { ...ctx, inh: bi, depth: ctx.depth + 1, cull: null, ltk: (ctx.ltk || ctx.k) });
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
    /** A line of text from (x, y) (its baseline's left end, in the entity's space). beta 7.4 / 2.45.6: f, its font ({ b, i, x }:
     *  Helvetica, -Bold, -Oblique, -BoldOblique; an SHX font as AutoCAD draws it); obl: slant (degrees); lwPt: its line weight (pt). */
    function textLine(ops, M, col, s, x, y, ang, h, wf, f, obl, lwPt) {
      if (!s || !(h > 0)) return;
      const shx = !!(f && f.x); let kx = 1, tw = 0;
      if (shx) { // an SHX font's widths: its letters stretched as one to them, its spaces as wide as its (word spacing)
        let a = 0, b = 0; for (const ch of s) if (ch !== ' ') { a += shxEm(ch); b += R.textWidth(ch, 1, false); }
        if (a > 0 && b > 0) kx = a / b;
        if (s.includes(' ')) tw = shxEm(' ') / kx - R.textWidth(' ', 1, false);
      }
      const fs = h / CAP, c = Math.cos(ang), sn = Math.sin(ang), k = obl ? Math.tan(obl * Math.PI / 180) : 0, o0 = ap(M, x, y), u = lin(M, c * fs * wf * kx, sn * fs * wf * kx), v = lin(M, (-sn + c * k) * fs, (c + sn * k) * fs);
      if (Math.hypot(v[0], v[1]) < 0.4) return; // under 0.4 pt: not readable
      const rgb = `${f4(col[0] / 255)} ${f4(col[1] / 255)} ${f4(col[2] / 255)}`, tm = `${f4(u[0])} ${f4(u[1])} ${f4(v[0])} ${f4(v[1])} ${f2(o0[0])} ${f2(o0[1])} Tm (${enc(s)}) Tj`;
      if (!shx) { ops.push(`BT ${rgb} rg /${fontRes(f)} 1 Tf ${tm} ET`); return; }
      // its strokes as thick as the line weight AutoCAD draws them with: Helvetica's stems (0.088 em) thickened by their outline
      const sw = (lwPt > 0 ? lwPt : LW0 * 72 / 25.4) - 0.088 * Math.hypot(v[0], v[1]);
      ops.push(`q BT ${sw >= 0.05 ? `2 Tr ${f2(sw)} w 1 j ${rgb} RG ` : ''}${rgb} rg /F1 1 Tf ${tw ? `${f4(tw)} Tw ` : ''}${tm} ET Q`);
    }
    function textOps(r, M, col, ops, lwPt) {
      const s = special(get(r, 1, '')); if (!s.trim()) return;
      const h = num(r, 40, 2.5), st = styleOf(get(r, 7)), f = st.f, wf = num(r, 41, 1) || 1; // (beta 7.4 / 2.45.6: its own width factor, 1 when it has none, as AutoCAD reads it; the style's is what a new text starts with, not this one's)
      const ha = int(r, 72, 0), va = typ(r) === 'ATTRIB' ? int(r, 74, 0) : int(r, 73, 0), ang = num(r, 50, 0) * Math.PI / 180, fs = h / CAP;
      const w = widthEm(s, f) * fs * wf;
      let ax = num(r, 10, 0), ay = num(r, 20, 0), dx = 0, dy = 0, wfx = wf;
      if (ha || va) { ax = num(r, 11, ax); ay = num(r, 21, ay); }
      if (ha === 3 || ha === 5) { const x0 = num(r, 10, 0), y0 = num(r, 20, 0), L = Math.hypot(ax - x0, ay - y0); if (L > 0 && w > 0) wfx = wf * L / w; ax = x0; ay = y0; }
      else dx = ha === 1 || ha === 4 ? -w / 2 : ha === 2 ? -w : 0;
      dy = ha === 4 ? -h / 2 : va === 1 ? 0.29 * h : va === 2 ? -h / 2 : va === 3 ? -h : 0;
      const c = Math.cos(ang), sn = Math.sin(ang);
      textLine(ops, M, col, s, ax + dx * c - dy * sn, ay + dx * sn + dy * c, ang, h, wfx, f, num(r, 51, 0), lwPt); // (51: v2.42.11, the street names slanted)
    }
    function mtextOps(r, M, col, ops, inh, lwPt) {
      const raw = all(r, 3).join('') + get(r, 1, ''), s = special(plain(raw)); if (!s.trim()) return;
      const h = num(r, 40, 2.5), st = styleOf(get(r, 7)), base = { ...st.f, w: st.wf, q: st.obl };
      // beta 7.4 / 2.45.6: its parts as its codes make them (colour, font, bold, italic, width, slant), each line a list of them; always
      // (a Tidy label's only before, and only unwrapped: the title block's values {\C256;…} printed in their red, not by their layer)
      let paras = colourRuns(raw, base); const want = s.split('\n');
      if (paras.length !== want.length || paras.some((p, i) => p.map((x) => x.s).join('') !== want[i])) paras = want.map((t) => [{ c: null, tc: null, ...base, s: t }]); // (read otherwise than plain() reads it: as one part, as before)
      const fs = h / CAP, pitch = h * 5 / 3 * num(r, 44, 1), att = Math.min(9, Math.max(1, int(r, 71, 1))), ci = (att - 1) % 3, ri = Math.floor((att - 1) / 3), refW = num(r, 41, 0);
      const key = (x) => `${x.b ? 1 : 0}${x.i ? 1 : 0}${x.x ? 1 : 0}|${x.w}|${x.q}`, txt = (L) => L.map((x) => x.s).join('');
      const wOf = (L) => { let w = 0, i = 0; while (i < L.length) { let j = i, t = ''; while (j < L.length && key(L[j]) === key(L[i])) t += L[j++].s; w += widthEm(t, L[i]) * fs * L[i].w; i = j; } return w; };
      const trimEnd = (L) => { const q = L.slice(); while (q.length) { const z = q[q.length - 1], t = z.s.trimEnd(); if (t) { q[q.length - 1] = { ...z, s: t }; break; } q.pop(); } return q; };
      const trimStart = (L) => { const q = L.slice(); while (q.length) { const t = q[0].s.trimStart(); if (t) { q[0] = { ...q[0], s: t }; break; } q.shift(); } return q; };
      const lines = [];
      for (const para of paras) { // wrapped at its box's width, as AutoCAD does
        if (!(refW > 0) || wOf(para) <= refW * 1.02) { lines.push(para); continue; }
        const words = []; let wd = []; for (const x of para) for (const piece of x.s.split(/(?<=\s)/)) { if (!piece) continue; wd.push({ ...x, s: piece }); if (/\s$/.test(piece)) { words.push(wd); wd = []; } } if (wd.length) words.push(wd);
        let cur = []; for (const w of words) { if (txt(cur) && wOf(trimEnd(cur.concat(w))) > refW * 1.02) { lines.push(trimEnd(cur)); cur = trimStart(w); } else cur = cur.concat(w); } lines.push(trimEnd(cur));
      }
      const lw = lines.map(wOf), maxW = Math.max(0, ...lw), colW = refW > maxW * 0.5 ? refW : maxW;
      const Hh = h + pitch * (lines.length - 1), top = ri === 0 ? 0 : ri === 1 ? Hh / 2 : Hh, left = -(ci === 0 ? 0 : ci === 1 ? colW / 2 : colW);
      const al = /\\p[^;]*q?c[;,]|\\pxqc|\\pqc/.test(raw) ? 'c' : /\\pxqr|\\pqr/.test(raw) ? 'r' : /\\pxql|\\pql/.test(raw) ? 'l' : 'lcr'[ci];
      let dir = [num(r, 11, 1), num(r, 21, 0)]; const k50 = r.findIndex((p) => p[0] === 50), k101 = r.findIndex((p) => p[0] === 101);
      if (k50 > 0 && (k101 < 0 || k50 < k101) && get(r, 11) == null) dir = [Math.cos(num(r, 50, 0)), Math.sin(num(r, 50, 0))];
      const ang = Math.atan2(dir[1], dir[0]), c = Math.cos(ang), sn = Math.sin(ang), ax = num(r, 10, 0), ay = num(r, 20, 0);
      const bg = int(r, 90, 0); if (bg & 3) { // beta 3.8: its background mask (the drawing's background: white on paper; or its colour)
        const m = Math.max(0, num(r, 45, 1.5) - 1) * h * 0.5, x0 = left - m, x1 = left + colW + m, y0 = top - Hh - m, y1 = top + m, W2 = (x, y) => ap(M, ax + x * c - y * sn, ay + x * sn + y * c);
        const fc = bg & 2 ? [255, 255, 255] : (ACI[int(r, 63, 7)] || [255, 255, 255]), Q = [W2(x0, y0), W2(x1, y0), W2(x1, y1), W2(x0, y1)];
        ops.push(`q ${f4(fc[0] / 255)} ${f4(fc[1] / 255)} ${f4(fc[2] / 255)} rg ${Q.map((q, i) => `${f2(q[0])} ${f2(q[1])} ${i ? 'l' : 'm'}`).join(' ')} h f Q`);
      }
      // a part's colour: \c a true colour; \C0 its block reference's (BYBLOCK), \C256 its layer's (BYLAYER), \Cn that colour; none: the MTEXT's
      const partCol = (x) => (x.tc ? x.tc : x.c == null ? col : aciRGB(x.c, r, inh)), sameCol = (a, b) => a === b || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
      lines.forEach((L, i) => {
        if (!txt(L).trim()) return;
        const dx = left + (al === 'c' ? (colW - lw[i]) / 2 : al === 'r' ? colW - lw[i] : 0), dy = top - h - i * pitch;
        let x = dx; for (let j = 0; j < L.length;) { // the line's parts, those of one look and colour as one
          const z = L[j], cz = partCol(z); let t = '', e = j; while (e < L.length && key(L[e]) === key(z) && sameCol(partCol(L[e]), cz)) t += L[e++].s;
          if (t.trim()) textLine(ops, M, cz, t, ax + x * c - dy * sn, ay + x * sn + dy * c, ang, h, z.w, z, z.q, lwPt);
          x += widthEm(t, z) * fs * z.w; j = e;
        }
      });
    }

    // the sheets in their tab order
    const layouts = S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => int(a.rec, 71, 0) - int(b.rec, 71, 0));
    const MODEL = S.E.filter((r) => owner(r) === S.modelH && String(get(r, 67, '0')).trim() !== '1');
    const modelIns = new Set(MODEL.filter((r) => typ(r) === 'INSERT').map((r) => get(r, 5)));
    const model = []; for (const r of S.E) { const ow = owner(r); if ((ow === S.modelH && String(get(r, 67, '0')).trim() !== '1') || (typ(r) === 'ATTRIB' && modelIns.has(ow)) || (typ(r) === 'SEQEND' && modelIns.has(ow))) model.push(r); }
    /** A sheet's paper: what is on its sheet, its page (W, H: pt), pt per paper unit (k) and the matrix from the paper to the page; null:
     *  nothing to print. */
    function paperOf(L) {
      const br = S.br.get(L.brh), bn = get(br, 2), ents = bn === '*Paper_Space' ? S.E.filter((e) => String(get(e, 67, '0')).trim() === '1') : (S.blocks.get(bn) || { ents: [] }).ents;
      // the paper: the layout's plot window, else what its sheet holds
      let win = [num(L.rec, 48, 0), num(L.rec, 49, 0), num(L.rec, 140, 0), num(L.rec, 141, 0)];
      if (!(win[2] - win[0] > 1 && win[3] - win[1] > 1)) {
        const B = ents.filter((e) => typ(e) !== 'VIEWPORT').map((e) => boxOf(e)).filter(Boolean);
        if (!B.length) return null;
        win = [Math.min(...B.map((b) => b[0])), Math.min(...B.map((b) => b[1])), Math.max(...B.map((b) => b[2])), Math.max(...B.map((b) => b[3]))];
      }
      const pw = Math.max(num(L.rec, 44, 420), num(L.rec, 45, 297)) * 72 / 25.4, ph = Math.min(num(L.rec, 44, 420), num(L.rec, 45, 297)) * 72 / 25.4;
      const land = win[2] - win[0] >= win[3] - win[1], W = land ? pw : ph, H = land ? ph : pw;
      const k = Math.min(W / (win[2] - win[0]), H / (win[3] - win[1])), ox = (W - (win[2] - win[0]) * k) / 2, oy = (H - (win[3] - win[1]) * k) / 2;
      return { ents, W, H, k, PM: [k, 0, 0, k, ox - win[0] * k, oy - win[1] * k] };
    }
    /* (Drawing preview) The plan's model space as its sheets print it, for the Drawing screen: draw() as the map viewport of the plan's
       sheet (mo.sheet, else GEO) draws it, with its frozen layers and at its scale (the line weights, line types and texts as printed),
       from mo.origin (model units); what is outside mo.cull ([x0, y0, x1, y1]) and the entities of mo.skip (handles) left out. Its PDF
       operators, in pt from the origin; K: pt per model unit on that sheet. The pages (toPdf) are not made. */
    function modelOps(mo) {
      const L = layouts.find((x) => x.name === (mo.sheet || 'GEO')) || layouts.find((x) => /^GEO\b/.test(x.name)), pp = L ? paperOf(L) : null; if (!pp) return null;
      const vps = pp.ents.filter((e) => typ(e) === 'VIEWPORT').slice(1).filter((v) => int(v, 69, 0) !== 1 && !(int(v, 90, 0) & 131072) && num(v, 40, 0) > 0 && num(v, 41, 0) > 0 && num(v, 45, 0) > 0)
        .sort((a, b) => num(b, 40, 0) * num(b, 41, 0) - num(a, 40, 0) * num(a, 41, 0));
      const vp = vps.find((v) => Math.abs(num(v, 40, 0) - num(v, 41, 0)) < 1) || vps[0]; if (!vp) return null; // (its map: the square one the plan aims, else the largest)
      const K = pp.k * num(vp, 41, 0) / num(vp, 45, 0), ox = +((mo.origin || [])[0]) || 0, oy = +((mo.origin || [])[1]) || 0, skip = new Set(mo.skip || []), ops = [];
      const frozen = new Set([...all(vp, 331), ...all(vp, 341)].map((h2) => LH.get(h2)).filter(Boolean));
      draw(skip.size ? model.filter((r) => !skip.has(get(r, 5))) : model, [K, 0, 0, K, -ox * K, -oy * K], { ops, k: K, ltk: pp.k, frozen, inh: { color: [0, 0, 0], lw: -3, lt: null }, depth: 0, cull: mo.cull || null });
      return { ops, K, sheet: L.name, origin: [ox, oy], frozen: [...frozen].sort(), files: Object.fromEntries([...images.values()].filter(Boolean).map((im) => [`Im${im.idx}`, im.file])) };
    }
    if (o.model) return modelOps(o.model);
    const pages = [];
    for (const L of layouts) {
      if (o.only && !o.only.includes(L.name)) continue;
      const pp = paperOf(L); if (!pp) continue;
      const { ents, W, H, k, PM } = pp, ops = [];
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
    const firstImg = 7, firstPage = firstImg + images.length, info = firstPage + pages.length * 2;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`));
    obj(3, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    obj(4, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    obj(5, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>')); // (beta 7.4 / 2.45.6: the italic styles)
    obj(6, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>'));
    images.forEach((im, i) => obj(firstImg + i, () => {
      const cs = im.comps === 1 ? '/DeviceGray' : im.comps === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
      push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream');
    }));
    const xo = images.map((im, i) => `/Im${im.idx} ${firstImg + i} 0 R`).join(' ');
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i], pn = firstPage + i * 2, raw = latin1(pg.ops.join('\n'));
      let data = raw, filter = '';
      if (o && o.deflate) { try { data = await o.deflate(raw); filter = ' /Filter /FlateDecode'; } catch (e) { data = raw; filter = ''; } }
      obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(pg.w)} ${f2(pg.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${pn + 1} 0 R >>`));
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

  /* (Drawing preview) The plan's model space as the plan's sheets print it, for a canvas (the Drawing screen): modelOps' PDF operators
     read back as a PDF reader reads them, so what the canvas draws is what the PDF prints (the same lines, colours, line weights, line
     types, texts and symbols). o: { origin: [x, y], cull: [x0, y0, x1, y1], skip: [handle…], sheet } (model units). Returns null without
     a plan sheet, else { K: pt per model unit printed, sheet, origin, frozen, pts: Float32Array (x, y in model units from the origin),
     subs: Int32Array ([first point, points, closed] each subpath), items: Int32Array ([kind, index, first subpath, subpaths] each, in the
     order printed; kind 0: a line (index: styles), 1: a fill, 2: an even-odd fill, 3: a text (index: texts), 4: a picture (index: images)),
     boxes: Float32Array ([x0, y0, x1, y1] each item), styles: [{ c: '#rrggbb', w, cap, join, dash }], texts: [{ s, f: 0 Helvetica, 1 bold,
     2 oblique, 3 bold oblique, c, m: [a, b, c, d, e, f] (1 em to model units), w: its Helvetica width (em), sc, lw: an SHX font's
     strokes, their colour and width (em) }], images: [{ name: its file, m: [a, b, c, d, e, f] (its unit square to model units) }]: each
     picture's place in the order printed (the pictures are not read), ops: the operators read }. Widths, dashes in model units. */
  const W1252 = [0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0, 0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178];
  function modelList(text, o) {
    const r = layoutPages(text, { model: o || {} }); if (!r) return null;
    return { ...listOf(r.ops, r.K, r.files), K: r.K, sheet: r.sheet, origin: r.origin, frozen: r.frozen, ops: r.ops.length };
  }
  /** (Drawing preview) The plan's model space for the Drawing, from the plan made (dxftpl.js: its text and report): what is on its GEO sheets
   *  and a quarter of a sheet round them, from the grid's origin, the grid's own lines and names left out (report.grid: the Drawing draws the
   *  sheets itself). As modelList; null without a grid. */
  function planList(text, report) {
    const G = (report && report.grid) || {}, B = (G.sheets || []).map((x) => x.box), m = (+G.cell || 440) * 0.25; if (!B.length) return null;
    const cull = [Math.min(...B.map((b) => b[0])) - m, Math.min(...B.map((b) => b[1])) - m, Math.max(...B.map((b) => b[2])) + m, Math.max(...B.map((b) => b[3])) + m];
    return modelList(text, { origin: G.origin || [0, 0], cull, skip: G.ents || [] });
  }
  function listOf(ops, K, files) {
    const P = [], SUB = [], IT = [], BX = [], styles = [], sIdx = new Map(), texts = [], images = [], stack = [], A = [];
    let g = { S: '#000000', F: '#000000', w: 1, J: 0, j: 0, d: null, f: 0, tr: 0, tw: 0, cm: null }, tm = null, sub0 = 0, cur = -1, b = null;
    const hex = (x, y, z) => `#${[x, y, z].map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('')}`;
    const styleIx = (key, mk) => { let i = sIdx.get(key); if (i == null) { i = styles.length; styles.push(mk()); sIdx.set(key, i); } return i; };
    const grow = (x, y) => { if (!b) b = [x, y, x, y]; else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } };
    const pt = (x, y) => { const X = x / K, Y = y / K; P.push(X, Y); grow(X, Y); if (cur >= 0) SUB[cur + 1]++; };
    const move = (x, y) => { cur = SUB.length; SUB.push(P.length / 2, 0, 0); pt(x, y); };
    const paint = (kind, style) => { const n = SUB.length / 3 - sub0; if (n > 0 && b) { IT.push(kind, style, sub0, n); BX.push(b[0], b[1], b[2], b[3]); } sub0 = SUB.length / 3; cur = -1; b = null; };
    const boxOf = (m, x0, y0, x1, y1) => { let q = null; for (const [u, v] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const x = m[0] * u + m[2] * v + m[4], y = m[1] * u + m[3] * v + m[5]; if (!q) q = [x, y, x, y]; else { q[0] = Math.min(q[0], x); q[1] = Math.min(q[1], y); q[2] = Math.max(q[2], x); q[3] = Math.max(q[3], y); } } return q; };
    const str = (s) => { let o2 = ''; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o2 += c >= 0x80 && c < 0xA0 ? String.fromCharCode(W1252[c - 0x80] || 63) : s[i]; } return o2; };
    for (const op of ops) {
      const n = op.length; let i = 0;
      while (i < n) {
        const ch = op.charCodeAt(i);
        if (ch === 32 || ch === 10 || ch === 13 || ch === 9) { i++; continue; }
        if ((ch >= 48 && ch <= 57) || ch === 45 || ch === 46 || ch === 43) { let j = i + 1; while (j < n) { const c = op.charCodeAt(j); if ((c >= 48 && c <= 57) || c === 46 || c === 101 || c === 69 || c === 45) j++; else break; } A.push(+op.slice(i, j)); i = j; continue; }
        if (ch === 47) { let j = i + 1; while (j < n && !/[\s/\[\]()]/.test(op[j])) j++; A.push(op.slice(i + 1, j)); i = j; continue; } // a name
        if (ch === 40) { let j = i + 1, s = ''; while (j < n && op[j] !== ')') { if (op[j] === '\\' && j + 1 < n) { s += op[j + 1]; j += 2; } else s += op[j++]; } A.push({ s }); i = j + 1; continue; } // a string (pdfEsc: \( \) \\)
        if (ch === 91) { const j = op.indexOf(']', i); A.push(op.slice(i + 1, j < 0 ? n : j).trim().split(/\s+/).filter(Boolean).map(Number)); i = j < 0 ? n : j + 1; continue; } // an array of numbers
        let j = i + 1; while (j < n) { const c = op.charCodeAt(j); if (c === 32 || c === 10 || c === 13 || c === 9) break; j++; }
        const w = op.slice(i, j); i = j;
        switch (w) {
          case 'q': stack.push({ ...g }); break;
          case 'Q': g = stack.pop() || g; break;
          case 'RG': g.S = hex(A[0], A[1], A[2]); break;
          case 'rg': g.F = hex(A[0], A[1], A[2]); break;
          case 'w': g.w = A[0]; break;
          case 'J': g.J = A[0]; break;
          case 'j': g.j = A[0]; break;
          case 'd': g.d = Array.isArray(A[0]) && A[0].length ? A[0] : null; break;
          case 'm': move(A[0], A[1]); break;
          case 'l': if (cur < 0) move(A[0], A[1]); else pt(A[0], A[1]); break;
          case 'h': if (cur >= 0) SUB[cur + 2] = 1; break;
          case 're': move(A[0], A[1]); pt(A[0] + A[2], A[1]); pt(A[0] + A[2], A[1] + A[3]); pt(A[0], A[1] + A[3]); SUB[cur + 2] = 1; break;
          case 'S': { const c = g.S, lw = g.w / K, J = g.J, jn = g.j, d = g.d ? g.d.map((x) => x / K) : null;
            paint(0, styleIx(`S${c}|${lw}|${J}|${jn}|${d}`, () => ({ c, w: lw, cap: J === 1 ? 'round' : J === 2 ? 'square' : 'butt', join: jn === 1 ? 'round' : jn === 2 ? 'bevel' : 'miter', dash: d }))); break; }
          case 'f': case 'F': case 'f*': { const c = g.F; paint(w === 'f*' ? 2 : 1, styleIx(`F${c}`, () => ({ c }))); break; }
          case 'n': SUB.length = sub0 * 3; cur = -1; b = null; break; // (a clip's path: nothing drawn)
          case 'BT': tm = [1, 0, 0, 1, 0, 0]; break;
          case 'Tf': g.f = { F1: 0, F2: 1, F3: 2, F4: 3 }[A[0]] || 0; break;
          case 'Tm': tm = A.slice(0, 6); break;
          case 'Tr': g.tr = A[0]; break;
          case 'Tw': g.tw = A[0]; break;
          case 'Tj': { const s = str((A[0] && A[0].s) || ''), m = tm || [1, 0, 0, 1, 0, 0], sp = (s.match(/ /g) || []).length, wE = R.textWidth(s, 1, g.f === 1 || g.f === 3) + (g.tw || 0) * sp, mm = m.map((v) => v / K);
            texts.push({ s, f: g.f, c: g.F, m: mm, w: wE, sc: g.tr === 2 ? g.S : null, lw: g.tr === 2 ? g.w / (Math.hypot(m[2], m[3]) || 1) : 0 });
            IT.push(3, texts.length - 1, 0, 0); BX.push(...boxOf(mm, 0, -0.25, wE, 1)); break; }
          case 'cm': g.cm = A.slice(0, 6); break;
          case 'Do': { const m = (g.cm || [1, 0, 0, 1, 0, 0]).map((v) => v / K); images.push({ name: (files && files[A[0]]) || A[0], m }); IT.push(4, images.length - 1, 0, 0); BX.push(...boxOf(m, 0, 0, 1, 1)); break; }
          default: break; // (ET, W, W*: nothing to draw)
        }
        A.length = 0;
      }
    }
    return { pts: new Float32Array(P), subs: new Int32Array(SUB), items: new Int32Array(IT), boxes: new Float32Array(BX), styles, texts, images };
  }

  async function toPdf(text, o) {
    const L = layoutPages(text, o || {}), pdf = await writePdf(L.pages, L.images, o || {});
    /** @type {any} */ (pdf).report = L.report;
    return pdf;
  }
  return { toPdf, layoutPages, writePdf, modelList, planList, ACI, plain };
}));
