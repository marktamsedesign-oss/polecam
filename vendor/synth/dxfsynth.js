/* G-eSAA (beta 7.15, Client templates): the DXF synthesizer. The owner: "dxf for asplan and cef must be based from a template dxf. Context:
   client requires a different template with a different text font style, drawing style size and thickness. By changing the template dxf,
   the app can now accomodate plan creation from different clients using its template." and "add a dxf synthesizer that accepts and digest
   a dxf from other clients. The app will process it that it will be use by the app effectively and accurately."
   A client's own drawing template (an AutoCAD DXF, 2000 or later, ASCII) is read on the phone (nothing is uploaded), cleaned with the app's
   own DXF cleanup (dxftpl.js clean, the pass every export runs), digested (its sheets, the title block's fields with how sure each is, its
   text styles and fonts, text heights, layers, blocks and what its model space holds) and, from the choices of the review screen, made into
   the two "seeds" the app draws on: the as-plan seed (dxftpl.js fills it as it fills the company's: GEO and KEYMAP sheets, @@TOKEN@@ fields,
   the plan sheet's map viewport square and at 1:1100 on its paper, the sample drawing removed, the client's symbols under the plan's block
   names or the app's own plain ones, every layer the plan writes, the look) and the CEF seed (one sheet 'CEF', its fields as tokens, its
   largest viewport the drawing area, model space empty). The look is written into both: the XRECORD 'G-ESAA_LOOK' in the root dictionary
   (its group 1 strings joined are a JSON) and the text style 'G-ESAA TEXT' (the client's main font; 'G-ESAA TEXT BOLD' when it has a bold
   one). make() checks what it made: the seed is one the app takes, the builder makes a made-up plan on it, every field is placed and filled,
   and the structure (tools/dxf-seed/check_dxf.py's checks, here in JS) is sound.
   Works in the browser (window.GeDxfSynth; it uses window.GeDxfTpl, which the app loads first) and in Node (require; tests).
   This file is vendor/synth/dxfsynth.js, as the app's own Ask & Draw page is under vendor/splice: the APK workflows copy vendor/ whole, so they
   name no new file and stay the same on beta and main (the repository's rule; beta 7.15 is on beta only). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../dxftpl.js'));
  else root.GeDxfSynth = factory(null);
}(typeof self !== 'undefined' ? self : this, function (T0) {
  'use strict';
  const TPL = () => { const T = T0 || (typeof self !== 'undefined' ? self.GeDxfTpl : null); if (!T) throw new Error('dxftpl.js is not loaded'); return T; };

  /* ---------------- records ([[code, value], …], the first [0, TYPE]: dxftpl.js's Doc) ---------------- */
  const typ = (r) => r[0][1];
  const get = (r, c, d) => { for (let i = 1; i < r.length; i++) if (r[i][0] === c) return r[i][1]; return d; };
  const all = (r, c) => r.filter((p, i) => i > 0 && p[0] === c).map((p) => p[1]);
  const num = (r, c, d) => { const v = get(r, c); if (v == null) return d; const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const int = (r, c, d) => { const v = get(r, c); if (v == null) return d; const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  function owner(r) { let g = 0; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 102) { g = String(v).startsWith('{') ? 1 : 0; continue; } if (c === 330 && !g) return v; } return null; }
  const handleOf = (r) => get(r, typ(r) === 'DIMSTYLE' ? 105 : 5, null);
  const setFirst = (r, c, v) => { for (let i = 1; i < r.length; i++) if (r[i][0] === c) { r[i][1] = v; return true; } return false; };
  const I = (v) => String(Math.round(v)).padStart(6);
  const F = (v) => { const n = Number(v); if (!Number.isFinite(n)) return '0.0'; const s = String(Math.round(n * 1e6) / 1e6); return /[.eE]/.test(s) ? s : `${s}.0`; };
  const HANDLE_CODES = (c) => (c >= 320 && c <= 369) || c === 390;
  /** The index of code c in the subclass sub (after [100, sub], before the next 100), or -1. */
  function subIdx(r, sub, c) { const k = r.findIndex((p) => p[0] === 100 && p[1] === sub); if (k < 0) return -1; for (let i = k + 1; i < r.length; i++) { if (r[i][0] === 100) return -1; if (r[i][0] === c) return i; } return -1; }
  function setSub(r, sub, c, v) { const i = subIdx(r, sub, c); if (i >= 0) { r[i][1] = v; return true; } return false; }
  const paperFlag = (r) => String(get(r, 67, '0')).trim() === '1';
  const textOf = (r) => (typ(r) === 'MTEXT' ? all(r, 3).join('') : '') + (get(r, 1) || '');
  /** A text's words without its format codes (MTEXT \f…; {…}, %%d…), on one line. */
  function plainText(r) {
    const T = TPL(), s = textOf(r);
    const raw = typ(r) === 'MTEXT' ? T.mtextLines(s).join(' ') : s;
    return String(raw).replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%[uUoOkK]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* ---------------- reading ---------------- */
  const VERSIONS = { AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' };
  const HOW = 'In AutoCAD (or your CAD program): File › Save As › "AutoCAD 2018 DXF (*.dxf)" (any DXF from 2000 on), not binary; then add that file.';
  /** The client's file as text, or why it cannot be read: a binary DXF, a DWG, a DXB, R12 or older, not a drawing. bytes: Uint8Array /
      ArrayBuffer (decoded here: UTF-8 from AutoCAD 2007 on, the code page before) or a string. → { ok, text, version, release } | { ok: false, error } */
  function read(src) {
    let text = typeof src === 'string' ? src.replace(/^\ufeff/, '') : null; // (a byte order mark: not part of the drawing)
    if (text == null) {
      const u = src instanceof Uint8Array ? src : new Uint8Array(src || []);
      const head = String.fromCharCode(...u.subarray(0, 64));
      if (/^AutoCAD Binary DXF/.test(head)) return { ok: false, error: `This DXF is saved in binary form. ${HOW}` };
      if (/^AC10\d\d/.test(head)) return { ok: false, error: `This is a DWG drawing, not a DXF. ${HOW}` };
      if (/^AutoCAD DXB/i.test(head)) return { ok: false, error: `This is a DXB file, not a DXF. ${HOW}` };
      const probe = new TextDecoder('latin1').decode(u.subarray(0, Math.min(u.length, 16384)));
      const v = (/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(probe) || [])[1] || '';
      const utf8 = !v || v >= 'AC1021';
      try { text = new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(u); } catch (e) { text = new TextDecoder('utf-8').decode(u); }
    }
    if (/^AutoCAD Binary DXF/.test(text.slice(0, 22))) return { ok: false, error: `This DXF is saved in binary form. ${HOW}` };
    if (/^AC10\d\d/.test(text.slice(0, 6))) return { ok: false, error: `This is a DWG drawing, not a DXF. ${HOW}` };
    if (/^AutoCAD DXB/i.test(text.slice(0, 12))) return { ok: false, error: `This is a DXB file, not a DXF. ${HOW}` };
    if (!/^\s*0\s*\r?\n\s*SECTION\s*\r?\n/.test(text.slice(0, 200)) && !/^\s*999\s*\r?\n/.test(text.slice(0, 20))) return { ok: false, error: `This file is not a DXF drawing. ${HOW}` };
    const v = (/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(text.slice(0, 16384)) || [])[1] || '';
    if (!v || v < 'AC1015') return { ok: false, error: `This DXF is from AutoCAD ${VERSIONS[v] || 'R12'} or older: it has no sheets (layouts). ${HOW}` };
    if (!/\bENTITIES\b/.test(text) || !/\$HANDSEED/.test(text.slice(0, 200000))) return { ok: false, error: `This DXF is not complete (no entities or no handles). ${HOW}` };
    return { ok: true, text, version: v, release: VERSIONS[v] || v };
  }
  /** The drawing parsed and cleaned by the app's own cleanup (the pass every export runs). */
  function load(text) {
    const T = TPL(); let d;
    try { d = new T.Doc(text); } catch (e) { throw new Error(`This DXF could not be read: ${e.message}`); }
    for (const n of ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) if (!d.sec(n)) throw new Error(`This DXF has no ${n} section. ${HOW}`);
    const log = T.clean(d);
    d.secs = d.secs.filter((s) => s.name !== 'THUMBNAILIMAGE'); // (its preview shows the client's sample)
    // an INSERT's attributes and SEQEND, a POLYLINE's vertices: owned by it (some programs write the sheet as their owner; AutoCAD wants the insert)
    let n = 0;
    for (const s of ['BLOCKS', 'ENTITIES']) { let head = null; for (const r of d.sec(s).recs) { const t = typ(r); if (t === 'INSERT' || t === 'POLYLINE') { head = handleOf(r); continue; } if (/^(ATTRIB|VERTEX|SEQEND)$/.test(t) && head) { const k = r.findIndex((p, i) => i > 0 && p[0] === 330); if (k > 0 && r[k][1] !== head) { r[k][1] = head; n++; } else if (k < 0) { r.splice(2, 0, [330, head]); n++; } if (t === 'SEQEND') head = null; continue; } head = null; } }
    if (n) { log['attribute or vertex owner set to its insert'] = n; d.index(); }
    // a layer an entity names that the drawing does not have: added (as layer 0 is), as AutoCAD would make it
    const T2 = d.sec('TABLES').recs, have = new Set(T2.filter((r) => typ(r) === 'LAYER').map((r) => String(get(r, 2)))), want = new Set();
    for (const s of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(s).recs) { const l = get(r, 8); if (l != null && !have.has(String(l))) want.add(String(l)); }
    const src0 = T2.find((r) => typ(r) === 'LAYER' && get(r, 2) === '0'), tbl = T2.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'LAYER');
    if (want.size && src0 && tbl) {
      for (const name of want) { const r = src0.filter(([c]) => c < 1000 && c !== 102).map(([c, v]) => [c, c === 5 ? d.newHandle() : c === 2 ? name : v]).filter((p, i, a) => !(p[0] === 330 && a.slice(0, i).some((q) => q[0] === 330))); const last = T2.reduce((k, x, i) => (typ(x) === 'LAYER' ? i : k), -1); T2.splice(last + 1, 0, r); }
      log['missing layer added'] = want.size; d.index();
    }
    return { d, log };
  }

  /* ---------------- units ---------------- */
  const UNIT_M = { 1: 0.0254, 2: 0.3048, 3: 1609.344, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 2.54e-8, 9: 2.54e-5, 10: 0.9144, 11: 1e-10, 12: 1e-9, 13: 1e-6, 14: 0.1, 15: 10, 16: 100, 17: 1e9, 18: 1.495978707e11, 19: 9.4607e15, 20: 3.0857e16, 21: 0.3048006096 };
  const UNIT_NAME = { 0: 'no units', 1: 'inches', 2: 'feet', 3: 'miles', 4: 'millimetres', 5: 'centimetres', 6: 'metres', 7: 'kilometres', 10: 'yards', 14: 'decimetres', 21: 'US survey feet' };
  const hdr = (d, name, c) => { const H = d.sec('HEADER').raw, k = H.findIndex((p) => p[0] === 9 && p[1] === name); if (k < 0) return null; for (let i = k + 1; i < H.length && H[i][0] !== 9; i++) if (c == null || H[i][0] === c) return H[i][1]; return null; };
  function setHdr(d, name, c, v) {
    const H = d.sec('HEADER').raw, k = H.findIndex((p) => p[0] === 9 && p[1] === name);
    if (k >= 0) { for (let i = k + 1; i < H.length && H[i][0] !== 9; i++) if (H[i][0] === c) { H[i][1] = v; return; } H.splice(k + 1, 0, [c, v]); return; }
    const h = H.findIndex((p) => p[0] === 9 && p[1] === '$HANDSEED'); H.splice(h >= 0 ? h : H.length, 0, [9, name], [c, v]);
  }

  /* ---------------- geometry ---------------- */
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const ap = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const ID = [1, 0, 0, 1, 0, 0];
  /** An INSERT's matrix: its block's base point to the insertion point, scaled and turned (an extrusion turned over: x mirrored). */
  function insMatrix(S, r) {
    const b = S.blocks.get(get(r, 2)), bx = b ? num(b.begin, 10, 0) : 0, by = b ? num(b.begin, 20, 0) : 0;
    const sx = num(r, 41, 1) * (num(r, 230, 1) < 0 ? -1 : 1), sy = num(r, 42, 1), a = num(r, 50, 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const ix = num(r, 10, 0) * (num(r, 230, 1) < 0 ? -1 : 1), iy = num(r, 20, 0);
    return mul([c * sx, s * sx, -s * sy, c * sy, ix, iy], [1, 0, 0, 1, -bx, -by]);
  }
  const mScale = (M) => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
  const mAngle = (M) => Math.atan2(M[1], M[0]) * 180 / Math.PI;
  const boxU = (a, b) => (!a ? b && b.slice() : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const boxHit = (a, b, m) => !(a[2] + (m || 0) < b[0] || b[2] + (m || 0) < a[0] || a[3] + (m || 0) < b[1] || b[3] + (m || 0) < a[1]);
  const boxArea = (b) => (b ? Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]) : 0);
  /** A text's box (TEXT, ATTRIB, ATTDEF, MTEXT) in its own space: [x0, y0, x1, y1], its height, its left-baseline point, its angle. */
  function textBox(r, s) {
    const t = typ(r), h = num(r, 40, 0) || 1, wf = num(r, 41, 1) || 1;
    if (t === 'MTEXT') {
      const L = TPL().mtextLines(textOf(r)).map((q) => q.trim()), n = Math.max(1, L.length), w0 = Math.max(1, ...L.map((q) => q.length)) * h * 0.62, w = num(r, 41, 0) > 0 ? Math.min(num(r, 41, 0), w0 * 1.05) || w0 : w0;
      const att = Math.min(9, Math.max(1, int(r, 71, 1))), ci = (att - 1) % 3, ri = Math.floor((att - 1) / 3), H = h * (1 + 1.67 * (n - 1));
      const x0 = num(r, 10, 0) - (ci === 1 ? w / 2 : ci === 2 ? w : 0), y1 = num(r, 20, 0) + (ri === 1 ? H / 2 : ri === 2 ? H : 0);
      const dx = num(r, 11, 1), dy = num(r, 21, 0), ang = get(r, 11) != null ? Math.atan2(dy, dx) * 180 / Math.PI : num(r, 50, 0) * (Math.abs(num(r, 50, 0)) < 6.3 ? 180 / Math.PI : 1);
      return { box: [x0, y1 - H, x0 + w, y1], h, x: x0, y: y1 - h, ang, lines: n };
    }
    const str = s != null ? s : String(get(r, 1, '')), w = Math.max(1, str.length) * h * 0.62 * wf;
    const ha = int(r, 72, 0), va = t === 'TEXT' ? int(r, 73, 0) : int(r, 74, 0), al = ha || va ? [num(r, 11, num(r, 10, 0)), num(r, 21, num(r, 20, 0))] : [num(r, 10, 0), num(r, 20, 0)];
    const x0 = ha === 1 || ha === 4 ? al[0] - w / 2 : ha === 2 ? al[0] - w : ha === 3 || ha === 5 ? num(r, 10, 0) : al[0];
    const y0 = va === 3 ? al[1] - h : va === 2 ? al[1] - h / 2 : va === 1 ? al[1] + h * 0.2 : al[1];
    return { box: [x0, y0 - h * 0.25, x0 + w, y0 + h], h, x: x0, y: y0, ang: num(r, 50, 0), lines: 1 };
  }

  /* ---------------- the drawing's parts ---------------- */
  /** A sheet's entities in draw order (an INSERT's attributes and SEQEND after it, a POLYLINE's vertices), the active sheet's from ENTITIES. */
  function sheetEnts(d, S, L) {
    const br = S.br.get(L.brh), bn = br ? get(br, 2) : '';
    if (bn !== '*Paper_Space') return (S.blocks.get(bn) || { ents: [] }).ents;
    const out = []; let seq = false; // (an INSERT's attributes and a POLYLINE's vertices follow it, whoever they name as owner)
    for (const r of S.E) { const t = typ(r), sub = t === 'ATTRIB' || t === 'SEQEND' || t === 'VERTEX'; if (sub) { if (seq) out.push(r); if (t === 'SEQEND') seq = false; continue; } seq = false; if (paperFlag(r) && owner(r) === L.brh) { out.push(r); seq = t === 'INSERT' || t === 'POLYLINE'; } }
    return out;
  }
  const modelEnts = (S) => S.E.filter((r) => owner(r) === S.modelH && !paperFlag(r));
  const isActive = (S, L) => { const br = S.br.get(L.brh); return !!br && get(br, 2) === '*Paper_Space'; };
  /** Every segment and text a sheet shows (its blocks' too, through their inserts), in paper units. */
  function sheetScan(d, S, L) {
    const segs = [], texts = [], ins = [], vps = [];
    const seg = (M, a, b) => { const p = ap(M, a[0], a[1]), q = ap(M, b[0], b[1]); segs.push([p[0], p[1], q[0], q[1]]); };
    const visit = (recs, M, depth, top) => {
      let cur = null;
      for (const r of recs) {
        const t = typ(r);
        if (t === 'INSERT') { cur = r; const b = S.blocks.get(get(r, 2)); const M2 = mul(M, insMatrix(S, r)); if (depth === 0) ins.push({ r, M: M2, name: get(r, 2) }); if (b && depth < 3) visit(b.ents, M2, depth + 1, top || r); continue; }
        if (t === 'ATTRIB') { if (cur && depth === 0) texts.push({ r, M, depth, kind: 'attrib', ins: cur, top: cur }); continue; }
        if (t === 'SEQEND') { cur = null; continue; }
        if (t === 'VIEWPORT') { if (depth === 0 && int(r, 69, 0) !== 1) vps.push(r); continue; }
        if (t === 'TEXT' || t === 'MTEXT') { texts.push({ r, M, depth, kind: depth ? 'btext' : 'text', ins: top || null, top }); continue; }
        if (t === 'LINE') seg(M, [num(r, 10, 0), num(r, 20, 0)], [num(r, 11, 0), num(r, 21, 0)]);
        else if (t === 'LWPOLYLINE') {
          const X = all(r, 10).map(Number), Y = all(r, 20).map(Number), cl = (int(r, 70, 0) & 1) === 1;
          for (let i = 1; i < X.length; i++) seg(M, [X[i - 1], Y[i - 1]], [X[i], Y[i]]);
          if (cl && X.length > 2) seg(M, [X[X.length - 1], Y[Y.length - 1]], [X[0], Y[0]]);
        }
      }
    };
    visit(sheetEnts(d, S, L), ID, 0, null);
    return { segs, texts, ins, vps };
  }
  /** A viewport's window in model space [x0, y0, x1, y1] (as dxftpl reads it), its box on the sheet, its size. */
  function vpInfo(vp) {
    const cx = num(vp, 17, 0) + num(vp, 12, 0), cy = num(vp, 27, 0) + num(vp, 22, 0), mh = num(vp, 45, 0), w = num(vp, 40, 0), h = num(vp, 41, 0), mw = mh * w / (h || 1);
    return { handle: handleOf(vp), box: [num(vp, 10, 0) - w / 2, num(vp, 20, 0) - h / 2, num(vp, 10, 0) + w / 2, num(vp, 20, 0) + h / 2], w, h, win: [cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2], scale: mh > 0 ? h / mh : 0 };
  }
  /** A sheet: its paper (units, size), frame, viewports (main: the largest), title block inserts. */
  function sheetOf(d, S, L, scan) {
    const rec = L.rec, units = int(rec, 72, 1) === 0 ? 'in' : 'mm', mmU = units === 'in' ? 25.4 : 1;
    const pw = num(rec, 44, 0), ph = num(rec, 45, 0), rot = int(rec, 73, 0) % 2 === 1;
    const lim = [num(rec, 10, NaN), num(rec, 20, NaN), num(rec, 11, NaN), num(rec, 21, NaN)];
    const paper = pw > 1 && ph > 1 ? (rot ? [ph, pw] : [pw, ph]).map((v) => v / mmU) : (lim.every(Number.isFinite) && lim[2] > lim[0] ? [lim[2] - lim[0], lim[3] - lim[1]] : [420 / mmU, 297 / mmU]);
    let frame = null, best = 0;
    const rects = []; for (const s of scan.segs) rects.push(s);
    const ents = sheetEnts(d, S, L);
    for (const r of ents) {
      if (typ(r) !== 'LWPOLYLINE' || !((int(r, 70, 0) & 1) === 1 || all(r, 10).length === 5)) continue;
      const X = all(r, 10).map(Number), Y = all(r, 20).map(Number), b = [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)], a = boxArea(b);
      if (a > best) { best = a; frame = b; }
    }
    let ext = null; for (const s of scan.segs) ext = boxU(ext, [Math.min(s[0], s[2]), Math.min(s[1], s[3]), Math.max(s[0], s[2]), Math.max(s[1], s[3])]);
    for (const t of scan.texts) { const tb = textBox(t.r); const p = [ap(t.M, tb.box[0], tb.box[1]), ap(t.M, tb.box[2], tb.box[3])]; ext = boxU(ext, [Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1]), Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1])]); }
    if (!frame || boxArea(frame) < 0.5 * boxArea(ext)) frame = ext ? ext.map((v) => +v.toFixed(4)) : [0, 0, paper[0], paper[1]];
    const vps = scan.vps.map(vpInfo).filter((v) => v.w > 0 && v.h > 0).sort((a, b) => b.w * b.h - a.w * a.h);
    return { name: L.name, tab: int(rec, 71, 0), active: isActive(S, L), units, mm: mmU, paper: paper.map((v) => +v.toFixed(4)), frame: frame.map((v) => +v.toFixed(4)), vps, main: vps[0] ? vps[0].handle : null,
      inserts: scan.ins.map((x) => x.name), n: ents.length };
  }

  /* ---------------- the app's fields (what the review maps each field of the client's title block to) ---------------- */
  /** key: the review's choice; token: the @@TOKEN@@ written (plan and CEF seeds; cef: the CEF seed's own name when it differs); re: the
      label's words (upper case, '.' ':' '#' as spaces); tag: an attribute tag's words. */
  const FIELDS = [
    { key: 'project', token: 'PROJECT_TYPE', cef: 'LINK', label: 'Project name', re: /^(PROJECT( NAME| TITLE| DESCRIPTION)?|JOB( NAME| TITLE)?|NAME OF PROJECT|TITLE OF PROJECT|PROJ( NAME)?)$/ },
    { key: 'title', token: 'SHEET_TITLE', label: 'Sheet title', re: /^(DRAWING TITLE|SHEET TITLE|DWG TITLE|DRG TITLE|TITLE)$/ },
    { key: 'location', token: 'LOCATION', label: 'Location', re: /^(LOCATION|ADDRESS|SITE LOCATION|PROJECT LOCATION|AREA|LOCALITY|MUNICIPALITY|CITY|BARANGAY|ROUTE)$/ },
    { key: 'site', token: 'SITE_NAME', label: 'Site name', re: /^(SITE( NAME)?|SITE NAME AND ID|STATION( NAME)?)$/ },
    { key: 'siteId', token: 'SITE_ID', label: 'Site ID (PLA ID)', re: /^(SITE (ID|CODE|NO|NUMBER)|PLA ?ID|STATION (ID|CODE))$/ },
    { key: 'serial', token: 'SERIAL', label: 'Serial number', re: /^(SERIAL( NO| NUMBER)?|S N)$/ },
    { key: 'code', token: 'PROJECT_CODE', label: 'Project code', re: /^(PROJECT (CODE|NO|NUMBER|ID)|JOB (NO|NUMBER|CODE)|NETWORK CODE|WORK ORDER( NO)?|WO( NO)?)$/ },
    { key: 'dwgNo', token: 'DWG_NO', label: 'Drawing number', re: /^((DWG|DRG|DRAWING) ?(NO|NUMBER|NUM)?|DWG|DOC(UMENT)? (NO|NUMBER))$/ },
    { key: 'sheetNo', token: 'SHEET_NO', label: 'Sheet number (n OF N)', re: /^(SHEET( NO| NUMBER| OF)?|SHT( NO)?|PAGE( NO)?)$/ },
    { key: 'date', token: 'DATE', label: 'Date', re: /^(DATE( ISSUED| OF ISSUE| DRAWN)?|ISSUE DATE|DATED)$/ },
    { key: 'scale', token: 'SCALE', label: 'Scale', re: /^(SCALE( AT A[0-4])?|SCALES?)$/ },
    { key: 'rev', token: 'ISSUE_NO', label: 'Revision / issue', re: /^(REV(ISION)?( NO)?|ISSUE( NO)?|VERSION|VER)$/ },
    { key: 'drawn', token: 'PREPARED_BY', label: 'Drawn / prepared by', re: /^(DRAWN( BY)?|PREPARED( BY)?|DESIGNED( BY)?|DRAFTED( BY)?|DRAWN AND DESIGNED BY|DESIGN(ER)?|DRAFTSMAN|DRAFTER|DRN( BY)?)$/ },
    { key: 'checked', token: 'CHECKED_BY', label: 'Checked by', re: /^(CHECKED( BY)?|REVIEWED( BY)?|VERIFIED( BY)?|CHK( BY)?|CHKD( BY)?)$/ },
    { key: 'approved', token: 'APPROVED_BY', label: 'Approved by', re: /^(APPROVED( BY)?|ENDORSED( BY)?|NOTED( BY)?|APP( BY)?|APPD( BY)?)$/ },
    { key: 'client', token: 'CLIENT', label: 'Client', re: /^(CLIENT( NAME)?|CUSTOMER|OWNER)$/ },
    { key: 'company', token: 'COMPANY_NAME', label: 'Contractor / company', re: /^(CONTRACTOR|COMPANY( NAME)?|VENDOR|CONSULTANT|SUBCONTRACTOR|SUB CONTRACTOR)$/ },
    { key: 'kind', token: 'PLAN_KIND', label: 'Plan kind (AFI / as-built)', re: /^(PLAN (TYPE|KIND)|DRAWING (TYPE|STATUS)|STATUS|PURPOSE)$/, weak: true },
    { key: 'coords', token: 'COORDINATES', label: 'Coordinates', re: /^(COORDINATES( WGS84)?|COORDS|LAT( ?\/ ?LONG)?|LATITUDE ?\/ ?LONGITUDE|GPS|GEO ?LOCATION)$/ },
    { key: 'cable', token: 'TITLE_CABLE', label: 'Cable (title)', re: /^(CABLE( TYPE| SIZE)?|FOC( TYPE)?|FIBER( TYPE)?)$/, plan: true },
    { key: 'network', token: 'NETWORK', label: 'Network', re: /^(NETWORK)$/, plan: true },
    { key: 'exported', token: 'EXPORTED_BY', label: 'Exported by (name, app, date)', re: /^(EXPORTED BY)$/ },
  ];
  const FIELD = new Map(FIELDS.map((f) => [f.key, f]));
  /** The token a field writes in a seed ('plan' or 'cef'). */
  const tokenOf = (key, kind) => { const f = FIELD.get(key); return f ? (kind === 'cef' && f.cef ? f.cef : f.token) : null; };
  const words = (s) => String(s || '').toUpperCase().replace(/[._:#=\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
  const fieldOfWords = (w) => { for (const f of FIELDS) if (f.re.test(w)) return f; return null; };
  const PLACEHOLDER = /^(X+[\s\-]*X*|[\-–_.]+|N\s?\/?\s?A|TBA|TBD|SAMPLE\b.*|DD\s?\/\s?MM\s?\/\s?YY(YY)?|MM\s?\/\s?DD\s?\/\s?YY(YY)?|0+|#+|\?+|1\s?:\s?X+|XX\s?-\s?\d+|.*XXX.*)$/i;
  /** A text that names a field and holds its value too: "DRAWN: JD", "DATE: 01/01/26", "SHEET 1 OF 2". */
  function inlineOf(s) {
    const t = String(s).trim();
    let m = /^((?:SHEET|SHT|PAGE)\s*(?:NO\.?)?\s*[:.]?\s*)(\d+\s*(?:OF|\/)\s*\d+)$/i.exec(t);
    if (m) return { f: FIELD.get('sheetNo'), prefix: m[1].trimEnd() + ' ', value: m[2] };
    m = /^([A-Za-z][A-Za-z .\/&]{0,30}?)\s*[:=]\s*(\S.*)$/.exec(t);
    if (m) { const f = fieldOfWords(words(m[1])); if (f) return { f, prefix: `${m[1].trim()}: `, value: m[2] }; }
    return null;
  }

  /** Every field of a sheet: the attributes of its title block (by tag, or by the label beside them), the labels and their value texts (the
      value to the right on the same line, else under it in the same cell), a label with no value (a value text is added in its cell), a
      label and its value in one text. Each with what it most likely is (key) and how sure (0 … 1). */
  function sheetFields(d, S, L, scan) {
    const items = [];
    for (const t of scan.texts) {
      const r = t.r; if (typ(r) === 'ATTRIB' && (int(r, 70, 0) & 1)) continue; // (an invisible attribute: not a field on the sheet)
      const s = typ(r) === 'ATTRIB' ? String(get(r, 1, '')) : plainText(r);
      const tb = textBox(r, s), p0 = ap(t.M, tb.box[0], tb.box[1]), p1 = ap(t.M, tb.box[2], tb.box[3]), k = mScale(t.M), ang = tb.ang + mAngle(t.M);
      items.push({ t, r, s, h: tb.h * k, box: [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])], ang, level: Math.abs(Math.sin(ang * Math.PI / 180)) < 0.09,
        kind: t.kind, tag: typ(r) === 'ATTRIB' ? String(get(r, 2, '')) : '', handle: handleOf(r), id: `${L.name}|${t.kind === 'btext' ? `${handleOf(t.top)}/` : ''}${handleOf(r)}` });
    }
    for (const it of items) {
      it.w = words(it.s);
      if (it.kind !== 'attrib') { const f = it.w.length <= 40 ? fieldOfWords(it.w) : null; if (f && /[A-Za-z]/.test(it.s)) it.label = f; else { const q = inlineOf(it.s); if (q) it.inline = q; } }
    }
    const segs = scan.segs, crossV = (x0, x1, y, y0b, y1b) => segs.some((g) => Math.abs(g[0] - g[2]) < 1e-6 * (1 + Math.abs(g[0])) + 1e-9 && g[0] > Math.min(x0, x1) && g[0] < Math.max(x0, x1) && Math.min(g[1], g[3]) <= Math.max(y, y0b) && Math.max(g[1], g[3]) >= Math.min(y, y1b));
    const crossH = (y0, y1, x, x0b, x1b) => segs.some((g) => Math.abs(g[1] - g[3]) < 1e-6 * (1 + Math.abs(g[1])) + 1e-9 && g[1] > Math.min(y0, y1) && g[1] < Math.max(y0, y1) && Math.min(g[0], g[2]) <= Math.max(x, x0b) && Math.max(g[0], g[2]) >= Math.min(x, x1b));
    const taken = new Set(), out = [];
    const isValue = (v) => !v.label && !v.inline && !taken.has(v) && v.level && v.s.length <= 120;
    const labels = items.filter((x) => x.label && x.level).sort((a, b) => b.box[3] - a.box[3] || a.box[0] - b.box[0]);
    for (const lb of labels) {
      const h = lb.h, y = lb.box[1], cands = [];
      for (const v of items) {
        if (v === lb || !isValue(v)) continue;
        const hh = Math.max(h, v.h);
        // right of it, on its line, in its cell
        if (Math.abs(v.box[1] - y) < 0.7 * hh && v.box[0] >= lb.box[2] - 0.6 * h && v.box[0] - lb.box[2] < 40 * h && !crossV(lb.box[2], v.box[0] + 0.01 * h, y + 0.4 * h, y, y + h)) cands.push({ v, d: v.box[0] - lb.box[2], how: 'right' });
        // under it, in its cell
        else if (v.box[3] <= lb.box[1] + 0.35 * h && lb.box[1] - v.box[3] < 3.2 * hh && v.box[0] > lb.box[0] - 6 * h && v.box[0] < lb.box[2] + 20 * h && !crossH(lb.box[1], v.box[3], (v.box[0] + lb.box[0]) / 2, v.box[0], lb.box[2])
          && !crossV(lb.box[0] + 0.01 * h, v.box[0] + 0.01 * h, (v.box[1] + v.box[3]) / 2, v.box[1], v.box[3])) cands.push({ v, d: (lb.box[1] - v.box[3]) * 1.5 + Math.abs(v.box[0] - lb.box[0]) * 0.3 + 2 * h, how: 'under' });
      }
      cands.sort((a, b) => a.d - b.d);
      const c = cands[0];
      if (c) {
        taken.add(c.v); taken.add(lb);
        const tagF = c.v.kind === 'attrib' ? fieldOfWords(words(c.v.tag)) : null;
        out.push({ ...fld(L, c.v, lb.label, tagF === lb.label ? 0.95 : lb.label.weak ? 0.45 : 0.85, lb.s, c.how), lbox: lb.box.map((q) => +q.toFixed(4)) });
      }
    }
    for (const lb of labels) if (!taken.has(lb)) {
      taken.add(lb); const f = labelOnly(L, lb, segs);
      // its value in line with the values of the labels above and below it (the same column of labels, their values to the right)
      const col = out.filter((q) => q.how === 'right' && q.lbox && Math.abs(q.lbox[0] - lb.box[0]) < 0.6 * lb.h).map((q) => q.box[0]).sort((a, b) => a - b);
      if (col.length && f.at) { const x = col[Math.floor(col.length / 2)]; if (x > lb.box[0] + 0.3 * lb.h) { f.at = { ...f.at, x: +x.toFixed(4), y: +(lb.box[1] + 0.25 * lb.h).toFixed(4), w: +Math.max(lb.h, f.at.w - (x - f.at.x)).toFixed(4) }; } }
      f.lbox = lb.box.map((q) => +q.toFixed(4)); out.push(f);
    }
    for (const it of items) {
      if (taken.has(it)) continue;
      if (it.inline) { taken.add(it); out.push({ ...fld(L, it, it.inline.f, it.inline.f.weak ? 0.45 : 0.8, it.inline.prefix.trim(), 'inline'), value: it.inline.value, prefix: it.inline.prefix }); continue; }
      if (it.kind === 'attrib') { const f = fieldOfWords(words(it.tag)) || fieldOfWords(words(get(it.r, 3, ''))); taken.add(it); out.push(fld(L, it, f, f ? (f.weak ? 0.45 : 0.9) : 0, it.tag, 'tag')); }
    }
    const res = out.sort((a, b) => b.box[3] - a.box[3] || a.box[0] - b.box[0]);
    // ((templates, Digester) the sheet's other texts on a line, for crossFields: a value of the title block seen again, e.g. on a cover page)
    Object.defineProperty(res, 'rest', { value: items.filter((it) => !taken.has(it) && it.kind !== 'attrib' && !it.label && !it.inline && it.level), enumerable: false, configurable: true });
    return res;
  }
  function fld(L, v, f, sure, label, how) {
    return { id: v.id, sheet: L.name, kind: v.kind === 'attrib' ? 'attrib' : v.kind === 'btext' ? 'btext' : 'text', how, label: String(label || '').trim(), value: v.s, tag: v.tag || '',
      key: f && sure >= 0.5 ? f.key : '', guess: f ? f.key : '', sure: +sure.toFixed(2), box: v.box.map((q) => +q.toFixed(4)), h: +v.h.toFixed(4), handle: v.handle, placeholder: PLACEHOLDER.test(String(v.s).trim()),
      ...(v.kind === 'btext' ? { M: v.t.M.slice(), top: handleOf(v.t.top) } : {}) };
  }
  /** The sheet's texts that read as a name (not a field, a label, a note or a number), the largest first: the client's name, usually. */
  function titleTexts(scan, fields) {
    const ids = new Set(fields.map((f) => f.handle)), out = [];
    for (const t of scan.texts) {
      if (t.kind === 'attrib' || ids.has(handleOf(t.r))) continue;
      const s = plainText(t.r), w = words(s); if (s.length < 4 || s.length > 60 || !/[A-Za-z]{3}/.test(s) || fieldOfWords(w) || inlineOf(s) || /^\d|^NOTES?\b|:$/i.test(s)) continue;
      const h = (num(t.r, 40, 0) || 0) * mScale(t.M); out.push({ s, k: h * Math.min(2.5, 1 + s.length / 12) });
    }
    return out.sort((a, b) => b.k - a.k).slice(0, 5).map((x) => x.s);
  }
  /** A label with no value text: where its value goes (right of it in its cell when there is room, else under it). */
  function labelOnly(L, lb, segs) {
    const h = lb.h, y = lb.box[1] + 0.25 * h, mid = y + 0.4 * h; // (its baseline: its box goes 0.25 h under it)
    let right = Infinity, below = -Infinity;
    for (const g of segs) {
      const vert = Math.abs(g[0] - g[2]) < 1e-6 * (1 + Math.abs(g[0])) + 1e-9, hor = Math.abs(g[1] - g[3]) < 1e-6 * (1 + Math.abs(g[1])) + 1e-9;
      if (vert && g[0] > lb.box[2] && Math.min(g[1], g[3]) <= mid && Math.max(g[1], g[3]) >= mid) right = Math.min(right, g[0]);
      if (hor && g[1] < y && Math.min(g[0], g[2]) <= lb.box[0] + h && Math.max(g[0], g[2]) >= lb.box[0] + h) below = Math.max(below, g[1]);
    }
    if (!Number.isFinite(right)) right = lb.box[2] + 30 * h;
    const vh = +(h * 1.1).toFixed(4), room = right - lb.box[2];
    const at = room >= 6 * h ? { x: lb.box[2] + Math.max(1.2 * h, Math.min(3 * h, room * 0.08)), y, w: right - lb.box[2] - 1.6 * h }
      : { x: lb.box[0], y: Math.max(Number.isFinite(below) ? below + 0.6 * vh : y - 1.7 * vh, y - 1.9 * vh), w: right - lb.box[0] - 0.5 * h };
    return { ...fld(L, lb, lb.label, lb.label.weak ? 0.45 : 0.8, lb.s, 'add'), id: `${lb.id}+`, kind: 'label', value: '', at: { x: +at.x.toFixed(4), y: +at.y.toFixed(4), h: vh, w: +Math.max(h, at.w).toFixed(4) } };
  }

  /* ---------------- styles, layers, blocks, model space ---------------- */
  function stylesOf(d, S) {
    const uses = new Map(), add = (r) => { const s = String(get(r, 7, 'Standard')); uses.set(s.toUpperCase(), (uses.get(s.toUpperCase()) || 0) + 1); };
    for (const r of S.E) if (/^(TEXT|MTEXT|ATTRIB)$/.test(typ(r))) add(r);
    for (const r of S.B) if (/^(TEXT|MTEXT|ATTDEF|ATTRIB)$/.test(typ(r))) add(r);
    const out = [];
    for (const r of S.T) {
      if (typ(r) !== 'STYLE') continue;
      const name = String(get(r, 2, '')); if (!name || (int(r, 70, 0) & 1)) continue; // (a shape file, not a text style)
      const k = r.findIndex((p) => p[0] === 1001 && p[1] === 'ACAD'), face = k >= 0 ? String((r.slice(k + 1).find((p) => p[0] === 1000) || [])[1] || '') : '';
      const fl = k >= 0 ? parseInt((r.slice(k + 1).find((p) => p[0] === 1071) || [])[1] || '0', 10) || 0 : 0, font = String(get(r, 3, '')), big = String(get(r, 4, ''));
      const bold = (fl & 0x2000000) !== 0 || /bold|black|heavy|\bbd\b/i.test(name) || /(bd|bold|black|blk)[^/\\]*\.ttf$/i.test(font) || /^(romand|romant|romanc|complex|italict)\.shx$/i.test(font.replace(/^.*[\\/]/, ''));
      out.push({ name, font, bigfont: big, face, bold, italic: (fl & 0x1000000) !== 0 || /italic|oblique/i.test(name), wf: +num(r, 41, 1).toFixed(3), fixedH: +num(r, 40, 0).toFixed(3), uses: uses.get(name.toUpperCase()) || 0, handle: handleOf(r),
        kind: /\.shx$/i.test(font) ? 'SHX' : /\.(ttf|otf|ttc)$/i.test(font) || face ? 'TrueType' : font ? 'font' : '' });
    }
    return out;
  }
  function layersOf(d, S) {
    const uses = new Map(); for (const s of [S.E, S.B]) for (const r of s) { const l = get(r, 8); if (l != null && typ(r) !== 'BLOCK' && typ(r) !== 'ENDBLK') uses.set(l, (uses.get(l) || 0) + 1); }
    return S.T.filter((r) => typ(r) === 'LAYER').map((r) => {
      const c = int(r, 62, 7), name = String(get(r, 2, ''));
      return { name, color: Math.abs(c) || 7, on: c >= 0, frozen: (int(r, 70, 0) & 1) === 1, ltype: String(get(r, 6, 'Continuous')), lw: int(r, 370, -3), plot: String(get(r, 290, '1')).trim() !== '0' && !/^defpoints$/i.test(name), uses: uses.get(name) || 0, tc: get(r, 420) != null ? int(r, 420, 0) : null };
    });
  }
  /** A block's box (lines, polylines, circles, arcs, ellipses, solids, hatches, points, texts roughly, nested blocks) in its own units. */
  function symBox(S, name, depth) {
    const b = S.blocks.get(name); if (!b || (depth || 0) > 5) return null;
    let bb = null; const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) bb = boxU(bb, [x, y, x, y]); };
    for (const e of b.ents) {
      const t = typ(e);
      if (t === 'LINE') { add(num(e, 10), num(e, 20)); add(num(e, 11), num(e, 21)); }
      else if (t === 'LWPOLYLINE' || t === 'POINT' || t === 'VERTEX') { const X = all(e, 10).map(Number), Y = all(e, 20).map(Number); X.forEach((x, i) => add(x, Y[i])); }
      else if (t === 'CIRCLE' || t === 'ARC') { const x = num(e, 10), y = num(e, 20), r = num(e, 40, 0); add(x - r, y - r); add(x + r, y + r); }
      else if (t === 'ELLIPSE') { const x = num(e, 10), y = num(e, 20), q = Math.hypot(num(e, 11, 0), num(e, 21, 0)); add(x - q, y - q); add(x + q, y + q); }
      else if (t === 'SOLID' || t === 'TRACE' || t === '3DFACE') for (const c of [10, 11, 12, 13]) add(num(e, c), num(e, c + 10));
      else if (t === 'HATCH') { const X = all(e, 10).map(Number).slice(1), Y = all(e, 20).map(Number).slice(1); X.forEach((x, i) => add(x, Y[i])); }
      else if (t === 'TEXT' || t === 'MTEXT') { const tb = textBox(e); add(tb.box[0], tb.box[1]); add(tb.box[2], tb.box[3]); }
      else if (t === 'INSERT') { const q = symBox(S, get(e, 2), (depth || 0) + 1); if (q) { const M = insMatrix(S, e); for (const [u, v] of [[q[0], q[1]], [q[2], q[1]], [q[0], q[3]], [q[2], q[3]]]) { const p = ap(M, u, v); add(p[0], p[1]); } } }
    }
    return bb;
  }
  function blocksOf(d, S) {
    const uses = new Map(), bump = (n, k) => { const u = uses.get(n) || { model: 0, paper: 0, blocks: 0 }; u[k]++; uses.set(n, u); };
    for (const r of S.E) if (typ(r) === 'INSERT') bump(get(r, 2), owner(r) === S.modelH && !paperFlag(r) ? 'model' : 'paper');
    for (const [n, b] of S.blocks) if (!/^\*(Model|Paper)_Space/i.test(n)) for (const r of b.ents) if (typ(r) === 'INSERT') bump(get(r, 2), 'blocks');
    for (const [n, b] of S.blocks) if (/^\*Paper_Space\d+$/i.test(n)) for (const r of b.ents) if (typ(r) === 'INSERT') bump(get(r, 2), 'paper');
    const out = [];
    for (const [name, b] of S.blocks) {
      if (/^\*/.test(name) || !S.brByName.get(name)) continue;
      const tags = b.ents.filter((e) => typ(e) === 'ATTDEF').map((e) => String(get(e, 2, ''))), bx = symBox(S, name, 0), texts = b.ents.filter((e) => /^(TEXT|MTEXT)$/.test(typ(e))).length;
      const sz = bx ? Math.max(bx[2] - bx[0], bx[3] - bx[1]) : 0, u = uses.get(name) || { model: 0, paper: 0, blocks: 0 };
      const kind = tags.length >= 4 || (texts >= 6 && u.paper > 0) ? 'title' : u.paper > 0 && !u.model ? 'sheet' : 'symbol';
      out.push({ name, n: b.ents.length, tags, texts, box: bx ? bx.map((v) => +v.toFixed(4)) : null, size: +sz.toFixed(4), base: [num(b.begin, 10, 0), num(b.begin, 20, 0)], uses: u, kind });
    }
    return out;
  }
  /** Model space in groups of things drawn near one another (the client's sample route, its legend, a table…): each with its box, what it holds and
      which sheets show it (the plan sheet's main viewport: the sample drawing; another viewport: a legend or table kept on a sheet). */
  function modelGroups(d, S, sheets, mU) {
    const T = TPL(), ents = modelEnts(S).filter((r) => !/^(ATTRIB|SEQEND|VERTEX|VIEWPORT)$/.test(typ(r)));
    const boxes = ents.map((r) => { try { return T.drawnBox(S, r); } catch (e) { return null; } });
    let ext = null; boxes.forEach((b) => { if (b) ext = boxU(ext, b); });
    if (!ext) return { box: null, n: ents.length, groups: [] };
    const diag = Math.hypot(ext[2] - ext[0], ext[3] - ext[1]), gap = Math.max(diag * 0.02, 1e-6);
    const par = ents.map((_, i) => i), find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    const cell = new Map(), key = (i, j) => `${i},${j}`;
    boxes.forEach((b, n) => {
      if (!b) return; const i0 = Math.floor((b[0] - ext[0]) / gap), i1 = Math.floor((b[2] - ext[0]) / gap), j0 = Math.floor((b[1] - ext[1]) / gap), j1 = Math.floor((b[3] - ext[1]) / gap);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4000) return; // (a huge thing, e.g. a border round everything: joins nothing by itself)
      for (let i = i0 - 1; i <= i1 + 1; i++) for (let j = j0 - 1; j <= j1 + 1; j++) { const k = key(i, j), c = cell.get(k); if (c != null) { if (i >= i0 && i <= i1 && j >= j0 && j <= j1) join(c, n); else if (boxHit(boxes[c], b, gap)) join(c, n); } }
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!cell.has(k)) cell.set(k, n); }
    });
    const G = new Map();
    ents.forEach((r, n) => { const g = find(n); const o = G.get(g) || { recs: [], box: null }; o.recs.push(r); if (boxes[n]) o.box = boxU(o.box, boxes[n]); G.set(g, o); });
    const groups = [];
    for (const o of G.values()) {
      if (!o.box) continue;
      const kinds = {}; o.recs.forEach((r) => { kinds[typ(r)] = (kinds[typ(r)] || 0) + 1; });
      const txt = o.recs.filter((r) => /^(TEXT|MTEXT)$/.test(typ(r))).map((r) => plainText(r)).filter(Boolean);
      const lines = (kinds.LINE || 0) + (kinds.LWPOLYLINE || 0), legend = txt.some((s) => /\b(LEGEND|SYMBOLS?|KEY TO)\b/i.test(s));
      const kind = legend ? 'legend' : lines >= 6 && txt.length >= 4 && (kinds.INSERT || 0) <= txt.length ? 'table' : 'drawing';
      const shown = [];
      for (const sh of sheets) sh.vps.forEach((v, k) => { if (boxHit(v.win, o.box, 0)) shown.push({ sheet: sh.name, main: k === 0 }); });
      const g = { id: `g${handleOf(o.recs[0])}`, box: o.box.map((v) => +v.toFixed(3)), n: o.recs.length, kinds, words: txt.slice(0, 6).join(' · ').slice(0, 120), kind, shown, size: +(Math.max(o.box[2] - o.box[0], o.box[3] - o.box[1]) * mU).toFixed(2) };
      Object.defineProperty(g, 'recs', { value: o.recs, enumerable: false }); groups.push(g);
    }
    groups.sort((a, b) => b.n - a.n);
    return { box: ext.map((v) => +v.toFixed(3)), n: ents.length, groups };
  }

  /* ---------------- (templates, Digester) a client's FINISHED plan ----------------
     The owner: "the digester learning from clients' finished plans. Learning means copying the template but replacing the details necessary to
     the project. Example: the plan itself, the project details, sheets to print details. Geo add sheet, vicinity, pmi and so on". A finished
     plan has its route drawn in model space: symbols (its poles) along lines (its cable) and their labels; its sheets show parts of it (the plan
     sheets), all of it (the key map), a picture of the place (the vicinity map), its tables (PMI, ROW), its legend. planOf() finds them, and the
     look of each kind of thing it drew (layer, text style, height, colour, line weight, block): what the client's template draws the app's plans
     with. The user corrects it in the review; make() then copies their plan with the plan itself removed (see makePlan). */
  /** The kinds whose look is learned from the client's drawing (the review's list). appH: the app's own height of that text (metres, on the GEO
      sheet at 1:1,100), to say how much larger or smaller the client's is. */
  const KINDS = [
    { k: 'poleId', label: 'Pole IDs and details', text: true, appH: 2.2 }, { k: 'poleNo', label: 'Pole numbers', text: true, appH: 3 }, { k: 'poleNoCircle', label: 'Circles round the pole numbers' },
    { k: 'latLong', label: 'Lat / long', text: true, appH: 1.2 }, { k: 'spanLen', label: 'Span lengths', text: true, appH: 2 }, { k: 'cableLabel', label: 'Cable names', text: true, appH: 2 },
    { k: 'loopText', label: 'Loop texts', text: true, appH: 2 }, { k: 'closureLabel', label: 'Closure labels', text: true, appH: 2.5 }, { k: 'siteName', label: 'Site names', text: true, appH: 3 },
    { k: 'streetName', label: 'Street names', text: true, appH: 3.2 }, { k: 'gridLabel', label: 'Sheet grid names', text: true }, { k: 'note', label: 'Other texts on the plan', text: true, appH: 2.2 },
    { k: 'cable', label: 'Cables (proposed)' }, { k: 'cableExisting', label: 'Cables (existing)' }, { k: 'pole', label: 'Poles' }, { k: 'symbol', label: 'Closures, loops, boxes' },
    { k: 'road', label: 'Roads' }, { k: 'grid', label: 'Sheet grid' },
  ];
  const TXT_RE = {
    latLong: /^[-+]?\d{1,3}\.\d{4,}\s*°?\s*[NSEW]?$|^\d{1,3}\s*°\s*\d{1,2}\s*'\s*\d{1,2}(\.\d+)?\s*"\s*[NSEW]$/, spanLen: /^\d{1,4}(\.\d+)?\s*(M|MTRS?|METERS?|METRES?)\.?$/i, poleNo: /^\d{1,3}$/,
    loopText: /\bLOOP\b|\bSLACK\b|\bRESERVE\b|\bCOIL\b/i, closureLabel: /CLOSURE|SPLICE|\bJOINT\b|\bFOSC\b|\bJC\b/i, gridLabel: /^[A-Z]{1,2}\s?-\s?\d{1,2}$/,
    cableLabel: /\bFOC\b|FIB(ER|RE)|\bCABLE\b|\b\d+\s?C\b|\bADSS\b|FIG(URE)?[- ]?8|\bAERIAL\b|UNDERGROUND/i, siteName: /\bSITE\b|\bPLA\b|\bTOWER\b|\bBTS\b|\bMIN\d|\bOLT\b/i,
    streetName: /\b(ST|STREET|RD|ROAD|AVE|AVENUE|HWY|HIGHWAY|BLVD|BOULEVARD|DRIVE|DR|LANE|LN|EXT|EXTENSION|HIWAY|CIRCLE|CIR|PUROK|SITIO)\b\.?/i,
    poleId: /^[A-Z]{1,5}[- ]?\d{2,}[A-Z]?$|^(P|PL|POLE|PP|NPT)[- ]?\d+$|^(PROP(OSED)?|EXIST(ING)?|NEW)\.?\s*(POLE|GT|PLDT|TELCO)\.?\s*[A-Z]{0,5}[- ]?\d{2,}[A-Z]?$/i,
  };
  /** The PMI table's rows the app fills, by their label's words: token, the label, and how (token: the app's value as a field; empty: the
      cell emptied, the builder fills it where the label reads as the company's, PROPOSED HDD…). */
  const PMI_LABELS = [
    ['PMI_TOTAL_CABLE_LENGTH', /^TOTAL( FOC| FIB(ER|RE)( OPTIC)?)?( CABLE)? LENGTH$/, 'token'], ['PMI_AERIAL_CABLE_LENGTH', /^(AERIAL|AE)( FOC| FIB(ER|RE)( OPTIC)?)?( CABLE)? LENGTH$/, 'token'],
    ['PMI_UG_CABLE_LENGTH', /^(UNDERGROUND|UG)( FOC| FIB(ER|RE)( OPTIC)?)?( CABLE)? LENGTH$/, 'token'], ['PMI_PROPOSED_POLE', /^(PROPOSED|NEW|PROP) POLES?$/, 'token'],
    ['PMI_EXISTING_GT_POLE', /^(EXISTING|EXIST) (GT |GLOBE |TELCO )?POLES?$/, 'token'], ['PMI_RTA_CONVERGE', /^RTA CONVERGE$/, 'token'], ['PMI_RTA_LOCAL_COOP', /^RTA( LOCAL)? COOP$/, 'token'],
    ['PMI_RTA_OTHER_PLDT', /^RTA OTHER/, 'token'], ['PMI_FIBER_TERMINATION', /^FIB(ER|RE) TERMINATIONS?$/, 'token'], ['PMI_HYBRID_CLOSURE', /^(PROPOSED |NEW )?(HYBRID |SPLICE )?CLOSURES?$/, 'token'],
    ['PMI_HDD', /^(PROPOSED )?HDD$/, 'empty'], ['PMI_OPEN_TRENCH', /^(PROPOSED )?OPEN TRENCH$/, 'empty'], ['PMI_MICRO_TRENCH', /^(PROPOSED )?MICRO TRENCH$/, 'empty'],
    ['PMI_MAXCELL_INNER_DUCT', /^MAXCELL( INNER DUCT)?$/, 'empty'], ['PMI_MANHOLE', /^(PROPOSED )?MAN ?HOLES?$/, 'empty'], ['PMI_SERVICE_BOX', /^(PROPOSED )?SERVICE BOX(ES)?$/, 'empty'],
  ];
  /** A sheet's role in the client's template (the review's choice per sheet) and the builder's name for it (makePlan). */
  const ROLES = [['cover', 'Cover page', 'TITLE'], ['toc', 'Contents', 'TOC'], ['legend', 'Legend', 'LEGENDS'], ['vicinity', 'Vicinity map', 'VICINITY MAP'],
    ['row', 'ROW table', 'ROW AREA COVERAGE'], ['keymap', 'Key map', 'KEYMAP'], ['plan', 'Plan sheet', 'GEO'], ['pmi', 'PMI table', 'PMI'],
    ['cef', 'CEF sheet (their CEF template)', ''], ['other', 'Other: kept as it is', ''], ['out', 'Left out', '']];
  const ROLE = new Map(ROLES.map(([k, label, name]) => [k, { k, label, name }]));
  /** The look most of a kind's samples share: { layer, style, h (metres), color, lw, lt, block, n }. */
  function lookMode(samples) {
    if (!samples.length) return null;
    const key = (s) => [s.layer, s.style || '', s.h != null ? +s.h.toFixed(2) : '', s.color, s.block || ''].join('|'), cnt = new Map();
    for (const s of samples) cnt.set(key(s), (cnt.get(key(s)) || 0) + 1);
    const best = [...cnt].sort((a, b) => b[1] - a[1])[0][0], s = samples.find((x) => key(x) === best), o = { ...s, n: samples.length };
    if (o.h != null) o.h = +o.h.toFixed(3); else delete o.h;
    return o;
  }
  /** The model space's polylines of the old kind (POLYLINE and its VERTEXes): their points. */
  function polyPts(S) {
    const out = new Map(); let cur = null;
    for (const r of S.E) { const t = typ(r); if (t === 'POLYLINE') { cur = (int(r, 70, 0) & (16 | 64)) ? null : r; if (cur) out.set(r, []); continue; } if (t === 'VERTEX') { if (cur) out.get(cur).push([num(r, 10, 0), num(r, 20, 0)]); continue; } cur = null; }
    return out;
  }
  function planOf(d, S, sheets, mU, model) {
    const U = (v) => v / mU, M = modelEnts(S).filter((r) => !/^(ATTRIB|SEQEND|VERTEX|VIEWPORT)$/.test(typ(r)));
    const LY = new Map(S.T.filter((r) => typ(r) === 'LAYER').map((r) => [String(get(r, 2, '')), r])), lyOf = (r) => LY.get(String(get(r, 8, '0')));
    const lwOfR = (r) => { const w = int(r, 370, -1); if (w >= 0) return w; const L = lyOf(r), lw = L ? int(L, 370, -3) : -3; return lw >= 0 ? lw : null; };
    const colOf = (r) => { if (get(r, 62) != null) { const c = int(r, 62, 256); if (c > 0 && c < 256) return c; } const L = lyOf(r); return L ? Math.abs(int(L, 62, 7)) || 7 : 7; };
    const ltOf = (r) => { const t = get(r, 6); if (t && !/^BY(LAYER|BLOCK)$/i.test(t)) return String(t); const L = lyOf(r); return L ? String(get(L, 6, 'Continuous')) : 'Continuous'; };
    const grpOf = new Map(); for (const g of (model && model.groups) || []) for (const r of g.recs) grpOf.set(r, g);
    const legendR = (r) => (grpOf.get(r) || {}).kind === 'legend';
    // the lines (segments in a coarse grid, to find what is near a point quickly)
    const segs = [], cell = U(25), grid = new Map(), gk = (i, j) => `${i},${j}`, PP = polyPts(S);
    const addSeg = (a, b, r) => { const g = [a[0], a[1], b[0], b[1], r, String(get(r, 8, '0'))]; segs.push(g); const i0 = Math.floor(Math.min(a[0], b[0]) / cell), i1 = Math.floor(Math.max(a[0], b[0]) / cell), j0 = Math.floor(Math.min(a[1], b[1]) / cell), j1 = Math.floor(Math.max(a[1], b[1]) / cell); if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = gk(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(g); } };
    const ptsOf = (r) => { const t = typ(r); if (t === 'LWPOLYLINE') { const X = all(r, 10).map(Number), Y = all(r, 20).map(Number); return X.map((x, i) => [x, Y[i]]); } if (t === 'POLYLINE') return PP.get(r) || []; return null; };
    for (const r of M) {
      if (legendR(r)) continue; const t = typ(r);
      if (t === 'LINE') addSeg([num(r, 10, 0), num(r, 20, 0)], [num(r, 11, 0), num(r, 21, 0)], r);
      else if (t === 'LWPOLYLINE' || t === 'POLYLINE') { const P = ptsOf(r); for (let i = 1; i < P.length; i++) addSeg(P[i - 1], P[i], r); if ((int(r, 70, 0) & 1) && P.length > 2) addSeg(P[P.length - 1], P[0], r); }
    }
    const dSeg = (x, y, g) => { const dx = g[2] - g[0], dy = g[3] - g[1], L2 = dx * dx + dy * dy; let t = L2 ? ((x - g[0]) * dx + (y - g[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - (g[0] + t * dx), y - (g[1] + t * dy)); };
    const near = (x, y, tol) => { const out = [], seen = new Set(); for (let i = Math.floor((x - tol) / cell); i <= Math.floor((x + tol) / cell); i++) for (let j = Math.floor((y - tol) / cell); j <= Math.floor((y + tol) / cell); j++) for (const g of grid.get(gk(i, j)) || []) { if (seen.has(g)) continue; seen.add(g); if (dSeg(x, y, g) <= tol) out.push(g); } return out; };
    const roadName = /ROAD|STREET|\bRD\b|PAVE|CURB|KERB|CARRIAGE|\bST\b|BASEMAP|OSM/i, gridName = /GRID|MATCH ?LINE|SHEET ?(INDEX|LIMIT)|KEY ?PLAN/i, cableName = /(\bFO\b|FOC|FIB(ER|RE)|CABLE|OSP|ROUTE|ADSS|STRAND)/i;
    const ins = M.filter((r) => typ(r) === 'INSERT' && !legendR(r)).map((r) => ({ r, name: String(get(r, 2, '')), x: num(r, 10, 0), y: num(r, 20, 0), layer: String(get(r, 8, '0')) }));
    // the cables: the layers whose lines pass through (or 3 m from) many symbols; the poles: the blocks so placed, three times or more
    const onBy = new Map(), tol = U(3);
    for (const p of ins) for (const lay of new Set(near(p.x, p.y, tol).map((g) => g[5]))) { if (roadName.test(lay) || gridName.test(lay)) continue; (onBy.get(lay) || onBy.set(lay, new Set()).get(lay)).add(p); }
    const nonPole = SYMBOLS.filter((s) => !/POLE/i.test(s.name));
    const cand = [...onBy].filter(([lay, P]) => P.size >= 3 || (cableName.test(lay) && P.size >= 1)).map(([lay]) => lay);
    const byName = new Map(); for (const lay of cand) for (const p of onBy.get(lay)) { if (!/POLE/i.test(p.name) && nonPole.some((s) => s.re.test(p.name))) continue; (byName.get(p.name) || byName.set(p.name, new Set()).get(p.name)).add(p); }
    const poleBlocks = [...byName].filter(([n, P]) => P.size >= 3 || /POLE/i.test(n)).map(([n, P]) => ({ name: n, n: P.size })).sort((a, b) => b.n - a.n);
    poleBlocks.forEach((b, i) => { b.kind = /EXIST|OLD|\bEX\b/i.test(b.name) ? 'existing' : /NEW|PROP/i.test(b.name) ? 'new' : i === 0 ? 'new' : 'existing'; });
    const isPole = new Set(poleBlocks.map((b) => b.name)), poleIns = ins.filter((p) => isPole.has(p.name));
    // the route: the groups of model space that hold its poles (a legend's samples are not the route)
    const pg = new Map(); for (const p of poleIns) { const g = grpOf.get(p.r); if (g) pg.set(g, (pg.get(g) || 0) + 1); }
    const routeG = [...pg].filter(([g, n]) => n >= 2 || pg.size === 1).map(([g]) => g), inRouteG = (r) => routeG.includes(grpOf.get(r)) || !grpOf.size;
    const poles = poleIns.filter((p) => inRouteG(p.r));
    for (const b of poleBlocks) b.n = poles.filter((p) => p.name === b.name).length;
    const cableSegs = segs.filter((g) => cand.includes(g[5]) && inRouteG(g[4])), lenOf = (lay) => cableSegs.filter((g) => g[5] === lay).reduce((a, g) => a + Math.hypot(g[2] - g[0], g[3] - g[1]), 0) * mU;
    const cableLayers = cand.map((lay) => ({ layer: lay, hits: [...onBy.get(lay)].filter((p) => poles.includes(p)).length, m: Math.round(lenOf(lay)) })).filter((c) => c.m >= 20 && c.hits >= 1).sort((a, b) => b.hits - a.hits || b.m - a.m);
    const cableSet = new Set(cableLayers.map((c) => c.layer)), cableM = cableLayers.reduce((a, c) => a + c.m, 0), drawn = poles.length >= 4 && cableM >= 30;
    let route = null; for (const p of poles) route = boxU(route, [p.x, p.y, p.x, p.y]);
    for (const g of cableSegs) if (cableSet.has(g[5])) route = boxU(route, [Math.min(g[0], g[2]), Math.min(g[1], g[3]), Math.max(g[0], g[2]), Math.max(g[1], g[3])]);
    const nearRoute = (x, y, m) => poles.some((p) => Math.hypot(p.x - x, p.y - y) <= U(m)) || near(x, y, U(m)).some((g) => cableSet.has(g[5]) && inRouteG(g[4]));
    // the tables the app fills: the PMI (its rows by their labels, the value right of each) and the ROW (its cities / municipalities and barangays);
    // in model space or drawn on a sheet
    const items = [], itemOf = (r, space) => { const tb = textBox(r); return { r, s: plainText(r), x: num(r, 10, 0), y: num(r, 20, 0), h: num(r, 40, 0) || 1, cx: (tb.box[0] + tb.box[2]) / 2, cy: (tb.box[1] + tb.box[3]) / 2, box: tb.box, space }; };
    for (const r of M) if (/^(TEXT|MTEXT)$/.test(typ(r)) && !legendR(r)) items.push(itemOf(r, ''));
    for (const L of S.layouts) if (L.name !== 'Model') for (const r of sheetEnts(d, S, L)) if (/^(TEXT|MTEXT)$/.test(typ(r))) items.push(itemOf(r, L.name));
    const wds = (s) => words(s).replace(/\s*\([^)]*\)\s*$/, '').trim(), qty = /\d|^[-–—]$/;
    let pmi = null; const tabH = new Set();
    for (const t of items) {
      const w = wds(t.s), hit = PMI_LABELS.find(([, re]) => re.test(w)); if (!hit) continue;
      if (pmi && (pmi.space !== t.space || pmi.rows.some((p) => p.token === hit[0]))) continue;
      const v = items.filter((u) => u !== t && u.space === t.space && Math.abs(u.cy - t.cy) < 0.7 * Math.max(t.h, u.h) && u.box[0] > t.box[2] - 0.5 * t.h && u.box[0] - t.box[2] < 60 * t.h && u.s.length <= 24 && qty.test(u.s) && !PMI_LABELS.some(([, re]) => re.test(wds(u.s)))).sort((a, b) => a.box[0] - b.box[0])[0];
      if (!v) continue;
      pmi = pmi || { space: t.space, rows: [], box: null };
      pmi.rows.push({ token: hit[0], how: hit[2], label: t.s, value: v.s, handle: handleOf(v.r) }); pmi.box = boxU(boxU(pmi.box, t.box), v.box); tabH.add(t.r); tabH.add(v.r);
    }
    if (pmi && pmi.rows.length < 2) pmi = null;
    let row = null;
    for (const hm of items.filter((t) => /^(CITY ?\/ ?)?(MUNICIPALIT(Y|IES)|CIT(Y|IES)|TOWNS?)( ?\/ ?CITY)?$/.test(wds(t.s)))) {
      const hb = items.find((t) => t.space === hm.space && /^(BARANGG?AYS?|BRGYS?)$/.test(wds(t.s)) && Math.abs(t.cy - hm.cy) < 1.5 * Math.max(t.h, hm.h) && t.cx > hm.cx); if (!hb) continue;
      const W = hb.cx - hm.cx, h = Math.max(hm.h, hb.h), mid = (hm.cx + hb.cx) / 2;
      const below = items.filter((t) => t.space === hm.space && t !== hm && t !== hb && t.cy < hm.cy - 0.6 * h && hm.cy - t.cy < 40 * h && t.cx > hm.cx - 1.5 * W && t.cx < hb.cx + 1.5 * W && t.s && !/^(NO\.?|#)$/i.test(t.s)).sort((a, b) => b.cy - a.cy);
      const tot = below.filter((t) => /^TOTAL\s*[-:=]?\s*\d+$/i.test(t.s)), floor = tot.length ? Math.max(...tot.map((t) => t.cy)) + 0.4 * h : -Infinity;
      let body = below.filter((t) => !tot.includes(t) && t.cy > floor);
      if (!tot.length) { const keep = []; let last = hm.cy; for (const t of body) { if (last - t.cy > 6 * h) break; keep.push(t); last = t.cy; } body = keep; }
      const muni = body.filter((t) => t.cx < mid), brgy = body.filter((t) => t.cx >= mid);
      row = { space: hm.space, header: [hm.s, hb.s], box: [hm.cx - 1.5 * W, (tot[0] || body[body.length - 1] || hm).cy - h, hb.cx + 1.5 * W, hm.cy + h],
        munis: muni.map((t, i) => ({ token: i < 2 ? `ROW_MUNICIPALITY_${i + 1}` : '', value: t.s, handle: handleOf(t.r) })),
        brgys: brgy.map((t, i) => ({ token: i < 7 ? `ROW_BARANGAY_${i + 1}` : '', value: t.s, handle: handleOf(t.r) })),
        totals: tot.map((t) => ({ token: t.cx < mid ? 'ROW_MUNICIPALITIES' : 'ROW_BARANGAYS', value: t.s, handle: handleOf(t.r) })) };
      for (const t of [hm, hb, ...tot, ...body]) tabH.add(t.r);
      break;
    }
    // the vicinity map's picture: IMAGEs and OLE pictures, in model space (with what is drawn round it) or on a sheet
    const pics = [], vicG = new Set();
    for (const r of M) if (/^(IMAGE|OLE2FRAME)$/.test(typ(r))) { pics.push({ handle: handleOf(r), sheet: '', box: (() => { try { return TPL().drawnBox(S, r); } catch (e) { return null; } })() }); const g = grpOf.get(r); if (g && !routeG.includes(g)) vicG.add(g); }
    for (const L of S.layouts) if (L.name !== 'Model') for (const r of sheetEnts(d, S, L)) if (/^(IMAGE|OLE2FRAME)$/.test(typ(r))) pics.push({ handle: handleOf(r), sheet: L.name, box: null });
    // the look of each kind of thing the plan draws
    const samples = Object.fromEntries(KINDS.map((x) => [x.k, []])), kinds = {};
    if (drawn) {
      for (const c of cableLayers) { const r = cableSegs.find((g) => g[5] === c.layer)[4], s = { layer: c.layer, color: colOf(r), lw: lwOfR(r), lt: ltOf(r) }; const ex = /EXIST|OLD/i.test(c.layer) || (!/PROP|NEW/i.test(c.layer) && c !== cableLayers[0] && (s.color === 5 || /DASH|HIDDEN/i.test(s.lt))); samples[ex ? 'cableExisting' : 'cable'].push({ ...s, m: c.m }); }
      for (const p of poles) samples.pole.push({ layer: p.layer, color: colOf(p.r), lw: lwOfR(p.r), block: p.name });
      for (const p of ins) if (!isPole.has(p.name) && inRouteG(p.r) && nearRoute(p.x, p.y, 10) && nonPole.some((s) => s.re.test(p.name))) samples.symbol.push({ layer: p.layer, color: colOf(p.r), lw: lwOfR(p.r), block: p.name });
      for (const g of segs) {
        if (cableSet.has(g[5]) || !inRouteG(g[4])) continue; const r = g[4], P = ptsOf(r);
        const sq = P && (int(r, 70, 0) & 1) && P.length === 4 && Math.abs(Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) - Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1])) < U(1) && Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) * mU >= 100;
        if (gridName.test(g[5]) || sq) samples.grid.push({ layer: g[5], color: colOf(r), lw: lwOfR(r), lt: ltOf(r) });
        else if (roadName.test(g[5]) || nearRoute((g[0] + g[2]) / 2, (g[1] + g[3]) / 2, 60)) { if (!/BORDER|FRAME|TITLE|VPORT|VIEWPORT|DEFPOINTS/i.test(g[5])) samples.road.push({ layer: g[5], color: colOf(r), lw: lwOfR(r), lt: ltOf(r) }); }
      }
      const circles = M.filter((e) => typ(e) === 'CIRCLE' && inRouteG(e));
      for (const t of items) {
        if (t.space !== '' || tabH.has(t.r) || !inRouteG(t.r)) continue;
        const s = t.s, h = t.h * mU, big = TXT_RE.gridLabel.test(s) && h >= 8; if (!s || (!big && !nearRoute(t.cx, t.cy, 40))) continue;
        const smp = { layer: String(get(t.r, 8, '0')), style: String(get(t.r, 7, 'Standard')), h, color: colOf(t.r) };
        const nearP = (m) => poles.some((p) => Math.hypot(p.x - t.cx, p.y - t.cy) <= U(m));
        let k = 'note';
        if (TXT_RE.latLong.test(s)) k = 'latLong'; else if (TXT_RE.spanLen.test(s)) k = 'spanLen'; else if (big) k = 'gridLabel';
        else if (TXT_RE.poleNo.test(s) && nearP(14)) k = 'poleNo'; else if (TXT_RE.loopText.test(s)) k = 'loopText'; else if (TXT_RE.closureLabel.test(s)) k = 'closureLabel';
        else if (TXT_RE.cableLabel.test(s)) k = 'cableLabel'; else if (TXT_RE.poleId.test(s) && nearP(16)) k = 'poleId';
        else if (TXT_RE.siteName.test(s)) k = 'siteName'; else if (TXT_RE.streetName.test(s) || roadName.test(smp.layer)) k = 'streetName';
        samples[k].push(smp);
        if (k === 'poleNo') { const c = circles.find((e) => Math.hypot(num(e, 10, 0) - t.cx, num(e, 20, 0) - t.cy) <= num(e, 40, 0) * 0.6 + 0.3 * t.h); if (c) samples.poleNoCircle.push({ layer: String(get(c, 8, '0')), color: colOf(c), lw: lwOfR(c), h: 2 * num(c, 40, 0) * mU }); }
      }
      for (const x of KINDS) { const m = lookMode(samples[x.k]); if (m) kinds[x.k] = m; }
      if (kinds.pole) kinds.pole.blocks = poleBlocks.filter((b) => b.n > 0).map((b) => ({ name: b.name, kind: b.kind, n: b.n }));
      if (kinds.symbol) { const bn = new Map(); samples.symbol.forEach((s) => bn.set(s.block, (bn.get(s.block) || 0) + 1)); kinds.symbol.blocks = [...bn].map(([name, n]) => ({ name, n })); }
    }
    // each sheet's role: by its name, else by what its main viewport shows
    const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]), ov = (a, b) => (a && b ? area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]) : 0);
    const roles = {}, scale = {};
    const plans = sheets.filter((s) => s.vps[0] && route && ov(s.vps[0].win, route) > 0).map((s) => ({ s, a: area(s.vps[0].win), cover: ov(s.vps[0].win, route) / (area(route) || 1) }));
    const aMin = plans.length ? Math.min(...plans.map((p) => p.a)) : 0;
    const shows = (s, t) => !!t && (t.space ? t.space === s.name : s.vps.some((v) => t.box && boxHit(v.win, t.box, 0)));
    for (const s of sheets) {
      const nm = s.name.toUpperCase(), v = s.vps[0];
      let r = /\bTOC\b|CONTENTS|SHEET ?INDEX|INDEX OF (SHEETS|DRAWINGS)|DRAWING (INDEX|LIST)/.test(nm) ? 'toc' : /COVER|^TITLE|FRONT/.test(nm) ? 'cover' : /\bCEF\b|CABLE ENTRANCE/.test(nm) ? 'cef' : /LEGEND/.test(nm) ? 'legend'
        : /VICINITY|LOCATION|LOC\.? ?MAP|LOCALITY/.test(nm) ? 'vicinity' : /KEY|INDEX|OVERVIEW/.test(nm) ? 'keymap' : /\bPMI\b|PROJECT MANAGEMENT|SUMMARY|QUANTIT/.test(nm) ? 'pmi' : /\bROW\b|RIGHT OF WAY|R\.O\.W/.test(nm) ? 'row' : '';
      if (!r) {
        if (pics.some((p) => p.sheet === s.name || (p.box && v && boxHit(v.win, p.box, 0)))) r = 'vicinity';
        else if (shows(s, pmi)) r = 'pmi'; else if (shows(s, row)) r = 'row';
        else { const p = plans.find((q) => q.s === s); if (p) r = p.cover > 0.8 && p.a > 1.8 * aMin && plans.length > 1 ? 'keymap' : 'plan'; else if (!v) r = s.n > 1 ? 'cover' : 'out'; else r = /PLAN|GEO|SHEET|ROUTE|DWG|LAYOUT/.test(nm) ? 'plan' : 'other'; }
      }
      roles[s.name] = r;
      if (v && v.h > 0) scale[s.name] = Math.round((v.win[3] - v.win[1]) * mU * 1000 / (v.h * s.mm));
    }
    const ps = sheets.filter((s) => roles[s.name] === 'plan' && scale[s.name] > 0).map((s) => scale[s.name]).sort((a, b) => a - b), planScale = ps.length ? ps[Math.floor(ps.length / 2)] : null;
    // a finished plan, not a template with a sample drawing (7.15's): its route drawn, and two signs of a plan made for a project
    const nOf = (r) => Object.values(roles).filter((x) => x === r).length;
    const signs = [pmi ? 'a PMI table with its figures' : '', row ? 'a ROW table with its places' : '', pics.length || nOf('vicinity') ? 'a vicinity map' : '', nOf('plan') > 1 ? `${nOf('plan')} plan sheets` : '',
      nOf('keymap') ? 'a key map' : '', nOf('cover') ? 'a cover page' : '', (kinds.poleNo || kinds.latLong) && kinds.poleId ? 'pole numbers or lat / long by the IDs' : ''].filter(Boolean);
    const finished = drawn && signs.length >= 2;
    for (const x of KINDS) if (kinds[x.k] && kinds[x.k].h != null) { const o = kinds[x.k]; o.mm = planScale ? +(o.h * 1000 / planScale).toFixed(2) : null; o.k = planScale && x.appH ? +((o.h / planScale) / (x.appH / 1100)).toFixed(2) : null; }
    return { finished, drawn, signs, poles: poles.length, cableM, route: route ? route.map((q) => +q.toFixed(3)) : null, cables: cableLayers, poleBlocks: poleBlocks.filter((b) => b.n > 0), kinds, pmi, row, pics, roles, scale, planScale,
      routeGroups: routeG.map((g) => g.id), vicGroups: [...vicG].map((g) => g.id), kindList: KINDS.map((x) => ({ k: x.k, label: x.label, text: !!x.text, appH: x.appH || null })), roleList: ROLES.map(([k, label, name]) => ({ k, label, name })) };
  }
  /** The project's values seen in the title blocks (project, location, client…) and again in another text of a sheet (a cover page's
      "DEMO FIBER ROUTE 2026", "PREPARED FOR DEMO CLIENT"): that text the same field, its words before the value kept (how 'same'). */
  /** Where in raw its last letters and digits as many as v's begin (raw's words before a value: "PREPARED FOR " of "PREPARED FOR DEMO CLIENT"). */
  const tailAt = (raw, v) => { const n = v.replace(/[^A-Za-z0-9]/g, '').length; let k = raw.trimEnd().length, c = 0; while (k > 0 && c < n) { k--; if (/[A-Za-z0-9]/.test(raw[k])) c++; } return k; };
  const CROSS_KEYS = ['project', 'location', 'client', 'site', 'siteId', 'code', 'company', 'date', 'network', 'serial', 'dwgNo'];
  function crossFields(sheets) {
    const byVal = new Map();
    for (const sh of sheets) for (const f of sh.fields) if (f.key && CROSS_KEYS.includes(f.key) && !f.placeholder && f.value && String(f.value).trim().length >= 4 && /[A-Za-z0-9]{3}/.test(f.value)) { const v = words(f.value), o = byVal.get(v) || {}; o[f.key] = (o[f.key] || 0) + 1; byVal.set(v, o); }
    const keyOf = (v) => { const o = byVal.get(v); return o ? Object.entries(o).sort((a, b) => b[1] - a[1])[0][0] : null; };
    const vals = [...byVal.keys()].sort((a, b) => b.length - a.length);
    for (const sh of sheets) {
      const rest = sh.fields.rest || [];
      for (const it of rest) {
        const w = words(it.s); if (!w || w.length > 90) continue;
        let key = keyOf(w), prefix = '';
        if (!key) { const v = vals.find((x) => w.length > x.length && w.endsWith(` ${x}`) && w.length - x.length <= 30); if (v) { key = keyOf(v); prefix = String(it.s).slice(0, tailAt(String(it.s), v)); } }
        if (!key) continue;
        const f = fld({ name: sh.name }, it, FIELD.get(key), 0.7, prefix ? prefix.trim() : `same as the title block's ${FIELD.get(key).label.toLowerCase()}`, prefix ? 'inline' : 'same');
        if (prefix) { f.prefix = prefix; f.value = String(it.s).slice(prefix.length); }
        f.cross = true; sh.fields.push(f);
      }
      delete sh.fields.rest;
    }
  }

  /* ---------------- digest ---------------- */
  /** What the client's drawing holds, for the review: { file, version, units, sheets (each with its fields), styles, font, heights, layers,
      blocks, model, symbols (the plan's), planLayers }. JSON (kept with nothing of the drawing itself). */
  function digest(text, name) {
    const T = TPL(), rd = read(text); if (!rd.ok) throw new Error(rd.error);
    const { d, log } = load(rd.text), S = T.structure(d);
    const insunits = parseInt(hdr(d, '$INSUNITS', 70) || '0', 10) || 0, mU = UNIT_M[insunits] || 1;
    const sheets = S.layouts.filter((L) => L.name !== 'Model').map((L) => { const scan = sheetScan(d, S, L), sh = sheetOf(d, S, L, scan); sh.fields = sheetFields(d, S, L, scan); sh.names = titleTexts(scan, sh.fields); return sh; }).sort((a, b) => a.tab - b.tab);
    const styles = stylesOf(d, S), layers = layersOf(d, S), blocks = blocksOf(d, S), model = modelGroups(d, S, sheets, mU), plan = planOf(d, S, sheets, mU, model);
    crossFields(sheets); // ((templates, Digester) a title block's value seen again on another text of a sheet: that field too)
    // the usual text heights: on the sheets (paper units), in model space (metres)
    const hist = (arr) => { const m = new Map(); arr.forEach((h) => { const k = +h.toFixed(2); if (k > 0) m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h, n]) => ({ h, n })); };
    const mt = modelEnts(S).filter((r) => /^(TEXT|MTEXT)$/.test(typ(r))).map((r) => num(r, 40, 0) * mU).filter((h) => h > 0).sort((a, b) => a - b);
    const pt = []; for (const sh of sheets) for (const f of sh.fields) pt.push(f.h);
    const heights = { paper: hist(pt), model: hist(mt), modelMedian: mt.length ? +mt[Math.floor(mt.length / 2)].toFixed(3) : null };
    // the main font: the one most texts of the plan sheet's title block use (else the most used), and a bold one beside it
    const plan0 = proposeSheets(sheets).plan, pS = sheets.find((s) => s.name === plan0), useOn = new Map();
    if (pS) { const L = S.layouts.find((x) => x.name === pS.name), scan = sheetScan(d, S, L); for (const t of scan.texts) { const s = String(get(t.r, 7, 'Standard')).toUpperCase(); useOn.set(s, (useOn.get(s) || 0) + 1); } }
    const rank = (s) => (useOn.get(s.name.toUpperCase()) || 0) * 10 + s.uses;
    const cand = styles.filter((s) => !s.bold && (s.uses || useOn.get(s.name.toUpperCase()))).sort((a, b) => rank(b) - rank(a));
    const main = cand.find((s) => !/^standard$/i.test(s.name) || cand.length === 1) || styles.find((s) => /^standard$/i.test(s.name)) || styles[0] || null;
    const bold = styles.filter((s) => s.bold && s !== main).sort((a, b) => rank(b) - rank(a))[0] || null;
    return { v: 1, file: String(name || 'client.dxf'), size: rd.text.length, version: rd.version, release: rd.release, insunits, units: UNIT_NAME[insunits] || `units ${insunits}`, mU,
      sheets, styles, font: { main: main ? main.name : '', bold: bold ? bold.name : '' }, heights, layers, blocks, model, plan, cleanup: log,
      symbols: SYMBOLS.map((s) => ({ name: s.name, label: s.label, more: !!s.more, attrs: s.attrs || [] })), layerClasses: LAYER_CLASSES.map((c) => ({ k: c.k, label: c.label, layers: c.layers.slice(), lw: c.lw || '' })), fields: FIELDS.map((f) => ({ key: f.key, label: f.label, token: f.token, cef: f.cef || f.token, plan: !!f.plan })) };
  }
  /** The sheets' likely roles: the plan sheet (the largest map viewport, a title block, its name), the key map, the CEF sheet, the ones to keep. */
  function proposeSheets(sheets) {
    const score = (s) => { const pa = s.paper[0] * s.paper[1] || 1, v = s.vps[0], nm = s.name.toUpperCase();
      return (v ? 3 * Math.min(1, (v.w * v.h) / pa) : -3) + (s.fields && s.fields.length ? 1 : 0) + (/PLAN|ROUTE|LAYOUT|SHEET|GEO|MAP|DRAWING|DWG/.test(nm) && !/KEY/.test(nm) ? 0.5 : 0) - (/KEY|LEGEND|COVER|TITLE|INDEX|DETAIL|NOTES?|SCHEDULE|CEF/.test(nm) ? 2 : 0); };
    const by = sheets.slice().sort((a, b) => score(b) - score(a)), plan = by[0] ? by[0].name : '';
    const km = sheets.find((s) => s.name !== plan && /KEY|INDEX|OVERVIEW|LOCATION/i.test(s.name) && s.vps.length) || null;
    const cef = sheets.find((s) => /\bCEF\b|CABLE ENTRANCE|ENTRANCE FACILITY/i.test(s.name)) || null;
    const keep = sheets.filter((s) => s.name !== plan && (!km || s.name !== km.name) && (!cef || s.name !== cef.name) && s.n > 1 && /LEGEND|COVER|TITLE|NOTES?/i.test(s.name)).map((s) => s.name);
    return { plan, keymap: km ? km.name : '', cef: cef ? cef.name : plan, keep };
  }

  /* ---------------- the plan's symbols: the builder's block names, the client's block for each, or the app's own ----------------
     g: the app's own plain shape (drawn here, in the sizes the builder places them at: as the company's): c circle [x, y, r], l line,
     p polyline [points, closed], t text, a attribute [tag, x, y, h]. re: a client block's name that is likely it. centre: a point-like
     symbol (its drawing centred on its base point). */
  const rectP = (x0, y0, x1, y1) => ['p', [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true];
  const guyG = [['l', 0, 0, 4, 0], ['c', 4.4, 0, 0.4]], armG = [['p', [[0, 0], [0, -5]], false], ['l', -0.6, -5, 0.6, -5]], extG = [['p', [[0, 0], [6, 0]], false], ['l', 6, -0.6, 6, 0.6]];
  const SYMBOLS = [
    { name: 'P-POLE', label: 'Proposed pole', centre: true, re: /POLE.*(NEW|PROP)|(NEW|PROP).*POLE|^P-?POLE$/i, g: [['c', 0, 0, 1.5], ['l', -1.5, 0, 1.5, 0], ['l', 0, -1.5, 0, 1.5]] },
    { name: 'existing telecom pole', label: 'Existing pole (telco)', centre: true, re: /POLE.*(EXIST|OLD)|(EXIST|OLD).*POLE|TEL(E)?CO.*POLE/i, g: [['c', 0, 0, 1.2]] },
    { name: 'existing electric pole', label: 'Existing electric pole', centre: true, re: /(ELEC|POWER|MERALCO|COOP).*POLE|POLE.*(ELEC|POWER)/i, re2: /POLE.*(EXIST|OLD)|(EXIST|OLD).*POLE/i, g: [['l', -2.6, -2.6, 2.6, 2.6], ['l', -2.6, 2.6, 2.6, -2.6]] },
    { name: 'P-Joint', label: 'Splice closure', centre: true, re: /SPLICE|CLOSURE|JOINT|FOSC|\bJC\b/i, attrs: ['JT_ID', 'JOINT'],
      g: [['p', [0, 1, 2, 3, 4].map((i) => [+Math.cos((90 + 72 * i) * Math.PI / 180).toFixed(4), +Math.sin((90 + 72 * i) * Math.PI / 180).toFixed(4)]), true], ['a', 'JT_ID', 1.3, 0.3, 0.5], ['a', 'JOINT', 1.3, -0.5, 0.5]] },
    { name: 'loopp', label: 'Cable loop (slack)', re: /LOOP|SLACK|COIL|RESERVE/i, g: [['l', -1.9, 0, 1.9, 0], ['c', 0, -1.4, 1.4]] },
    { name: 'proposed NAP', label: 'NAP (new)', centre: true, re: /^(?!.*EXIST).*(\bNAP|SPLITTER|\bFDP\b|\bFAT\b)/i, g: [rectP(-5, -2, 5, 2), ['t', -1.5, -0.7, 1.5, 'NAP']] },
    { name: 'existing NAP', label: 'NAP (existing)', centre: true, re: /(NAP|SPLITTER|FDP|FAT).*EXIST|EXIST.*(NAP|SPLITTER|FDP|FAT)/i, g: [rectP(-5, -2, 5, 2), ['t', -1.5, -0.7, 1.5, 'NAP']] },
    { name: 'proposed Handhole', label: 'Handhole', centre: true, re: /HAND ?HOLE|\bHH\b|\bPIT\b|VAULT/i, g: [rectP(-2, -1.5, 2, 1.5), ['l', -2, -1.5, 2, 1.5]] },
    { name: 'proposed riser', label: 'Riser', centre: true, re: /RISER/i, g: [['c', 0, 0, 2], ['l', 0, -2, 0, 2]] },
    { name: 'proposed grounding', label: 'Grounding', re: /GROUND|EARTH/i, g: [['l', 0, 0, 8, 0], ['l', 8, -2, 8, 2], ['l', 8.6, -1.3, 8.6, 1.3], ['l', 9.2, -0.6, 9.2, 0.6]] },
    { name: 'X-BTS', label: 'Tower (site)', re: /TOWER|\bBTS\b|CELL ?SITE|MONOPOLE/i, attrs: ['BTS_NAME', 'PLA_ID'], g: [['p', [[-5, 0], [0, 20], [5, 0]], false], ['l', -3, 8, 3, 8], ['l', -1.5, 14, 1.5, 14], ['a', 'BTS_NAME', 0, -2, 1], ['a', 'PLA_ID', 0, -3.5, 0.8]] },
    { name: 'OLT1', label: 'OLT', centre: true, re: /\bOLT\b/i, g: [rectP(-3.7, -3.7, 3.7, 3.7), ['l', -3.7, -3.7, 3.7, 3.7]] },
    { name: 'SG', label: 'Side guy', more: true, re: /SIDE ?GUY|^SG$/i, g: guyG },
    { name: 'HG', label: 'Head guy', more: true, re: /HEAD ?GUY|DOWN ?GUY|^HG$|ANCHOR/i, g: guyG },
    { name: 'SW', label: 'Sidewalk guy', more: true, re: /SIDEWALK(?!.*HEAD)|^SW$/i, g: guyG },
    { name: 'SWH', label: 'Sidewalk head guy', more: true, re: /SIDEWALK.*HEAD|^SWH$/i, g: guyG },
    { name: 'proposed pole to pole guy', label: 'Pole-to-pole guy', more: true, re: /P2P|POLE ?TO ?POLE/i, g: guyG },
    { name: 'proposed single arm', label: 'Single arm', more: true, re: /SINGLE ?ARM|CROSS ?ARM/i, g: armG },
    { name: 'double arm', label: 'Double arm', more: true, re: /DOUBLE ?ARM/i, g: armG },
    { name: '10 pin', label: '10-pin alley arm', more: true, re: /10 ?PIN|ALLEY/i, g: extG },
    { name: 'extension 44 arm', label: 'Extension arm 44', more: true, re: /EXT.*44/i, g: extG },
    { name: 'extension arm 26', label: 'Extension arm 26', more: true, re: /EXT.*2[46]/i, g: extG },
    { name: 'P-HOST', label: 'Host (new)', more: true, centre: true, re: /^(?!.*EXIST).*HOST/i, attrs: ['HST_NAM', 'HST_COD', 'HST_LET'], g: [rectP(-20, -20, 20, 20), ['a', 'HST_NAM', 22, 4, 4], ['a', 'HST_COD', 22, -2, 4], ['a', 'HST_LET', -4, -2, 6]] },
    { name: 'X-HOST', label: 'Host (existing)', more: true, centre: true, re: /HOST.*EXIST|EXIST.*HOST/i, attrs: ['HST_NAM', 'HST_COD', 'HST_LET'], g: [rectP(-20, -20, 20, 20), ['a', 'HST_NAM', 22, 4, 4], ['a', 'HST_COD', 22, -2, 4], ['a', 'HST_LET', -4, -2, 6]] },
  ];
  const SYM = new Map(SYMBOLS.map((s) => [s.name, s]));
  const gBox = (g) => { let b = null; for (const q of g) { if (q[0] === 'c') b = boxU(b, [q[1] - q[3], q[2] - q[3], q[1] + q[3], q[2] + q[3]]); else if (q[0] === 'l') b = boxU(b, [Math.min(q[1], q[3]), Math.min(q[2], q[4]), Math.max(q[1], q[3]), Math.max(q[2], q[4])]); else if (q[0] === 'p') for (const [x, y] of q[1]) b = boxU(b, [x, y, x, y]); } return b; };
  SYMBOLS.forEach((s) => { const b = gBox(s.g); s.size = b ? Math.max(b[2] - b[0], b[3] - b[1]) : 1; });
  /** A plan tag's likely client tag (an id / name / type / letter by its words, else by its place in the list). */
  const TAG_WORDS = { JOINT: /ID|NO|NUM|NAME|LABEL|TAG|CODE/i, JT_ID: /TYPE|KIND|STAT|SIZE|CORE|FIB|DESC/i, BTS_NAME: /NAME|SITE/i, PLA_ID: /ID|CODE|NO/i, HST_NAM: /NAME/i, HST_COD: /CODE|ID|NO/i, HST_LET: /LET|CHAR|ABB/i };
  function tagsFor(s, clientTags) {
    const out = {}, used = new Set();
    for (const t of s.attrs || []) { const c = clientTags.find((x) => !used.has(x) && x.toUpperCase() === t) || clientTags.find((x) => !used.has(x) && TAG_WORDS[t] && TAG_WORDS[t].test(x)); if (c) { out[t] = c; used.add(c); } }
    for (const t of s.attrs || []) if (!out[t]) { const c = clientTags.find((x) => !used.has(x)); if (c) { out[t] = c; used.add(c); } }
    return out;
  }

  /* ---------------- the layers the plan writes (dxftpl.js), by kind; the review maps each kind to a client layer ---------------- */
  const LAYER_CLASSES = [
    { k: 'cable', label: 'Cables', lw: 'cable', color: 1, re: /(\bFO\b|FOC|FIB(ER|RE)|CABLE|OSP).*(PROP|NEW)|(PROP|NEW).*(\bFO\b|FOC|FIB(ER|RE)|CABLE)|^[A-Z]?-?(FOC|FIB(ER|RE)|CABLE|OSP)S?$|^FO[-_ ]/i, avoid: /EXIST|OLD/i,
      layers: ['PROPOSED FOC AERIAL 6 CORE', 'Proposed foc aerial', 'Proposed foc duct', 'MESSENGER'] },
    { k: 'pole', label: 'Poles', lw: 'pole', color: 7, re: /POLE/i, layers: ['P-GPOLE', 'ELECTRIC POLE', 'GT-POLE', 'p-pole'] },
    { k: 'symbol', label: 'Closures, NAPs, boxes and sites', lw: 'symbol', color: 7, re: /SYMB|EQUIP|DEVICE|CLOSURE|\bNAP\b|SPLICE/i,
      layers: ['P-JOINT', 'PROPOSED LOOP', 'PROPOSED NAP', 'EXISTING NAP', 'PROPOSED DOUBLE NAP', 'EXISTING DOUBLE NAP', 'PROPOSED LCP', 'EXISTING LCP', 'PROPOSED DOUBLE LCP', 'EXISTING DOUBLE LCP', 'PROPOSED HH', 'EXISTING HH', 'PROPOSED MH', 'EXISTING MH',
        'PROPOSED SERVICE BOX', 'EXISTING SERVICE BOX', 'PROPOSED RISER', 'PROPOSED GROUNDING', 'PROPOSED HDD', 'EXISTING HDD', 'X-BTS', 'EXISTING OLT', 'PORPOSED OLT', 'P-HOST', 'X-HOST', 'G-ESAA PROPOSED ODC', 'G-ESAA EXISTING ODC',
        'G-ESAA TELCO ARM', 'PROPOSED SINGLE ARM', 'PROPOSED DOUBLE ARM', 'PROPOSED 10 PIN ALLEY ARM', 'PROPOSED EXTENSION ARM 26', 'PROPOSED EXTENSION ARM 44.5', 'PROPOSED SIDE GUY', 'PROPOSED HEAD GUY', 'PROPOSED SW GUY', 'PROPOSED SWH GUY', 'PROPOSED P2P GUY',
        'G-ESAA CROSS-OVER', 'G-ESAA PULL-OFF'] },
    { k: 'text', label: 'Labels and texts', lw: 'leader', color: 7, re: /^(TEXT|TEXTS|ANNO|ANNOTATION|LABELS?|NOTES?)$|[-_ ](TEXT|ANNO|LABEL)S?$|^(TEXT|ANNO|LABEL)[-_ ]/i,
      layers: ['Distance Data', 'LATLONG', 'Proposed NAP ID', 'House Number', 'G-ESAA CABLE LABEL', 'G-ESAA POLE CLAMP', 'G-ESAA NOTES', 'G-ESAA LANDMARK', 'MISC', 'STREET NAME'] },
    { k: 'road', label: 'Roads', lw: 'road', color: 8, re: /ROAD|STREET|PAVE|CURB|KERB|CARRIAGE/i, layers: ['ROAD PAVEMENT', 'BRIDGE', 'BASEMAP'] },
    { k: 'grid', label: 'Sheet grid and key map', color: 8, re: /GRID|MATCH ?LINE|KEY ?PLAN/i, layers: ['GRIDS', 'GRIDNO', 'GRIDNO.', 'G-ESAA KEYMAP GRID', 'G-ESAA BOQ GRID'] },
    { k: 'photo', label: 'Photos and the location map', color: 7, re: /PHOTO|PICTURE|IMAGE|VICINITY/i, layers: ['G-ESAA POLE PHOTO', 'G-ESAA VICINITY', 'G-ESAA VICINITY MAP', 'G-ESAA RTA LEGEND'] },
  ];
  const LW_KEYS = ['cable', 'cableExisting', 'pole', 'symbol', 'leader', 'road'];
  const LWS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

  /** The review's choices made for the user (they only correct): see make(). o.finished: true / false to make it as a finished plan or not
      ((templates, Digester): the digest's own call, dg.plan.finished, when not given). */
  function proposal(dg, o) {
    const P = dg.plan, fin = o && o.finished != null ? !!o.finished && !!(P && P.drawn) : !!(P && P.finished), p = proposal715(dg);
    return fin ? planProposal(dg, p) : { ...p, finished: false };
  }
  /** (templates, Digester) A finished plan's choices: each sheet's role, the fields (a sheet's own title and scale kept on the sheets that are not
      the plan's), the symbols its poles are drawn with, the look learned from its drawing, the legend and the tables kept in model space, the
      tables' values as the app's fields; its CEF on the company's CEF template unless it has a CEF sheet. */
  function planProposal(dg, p) {
    const P = dg.plan, roles = { ...P.roles }, byTab = dg.sheets.slice().sort((a, b) => a.tab - b.tab).map((s) => s.name);
    const plan = byTab.find((n) => roles[n] === 'plan') || p.plan, keymap = byTab.find((n) => roles[n] === 'keymap') || '', cef = byTab.find((n) => roles[n] === 'cef') || '';
    if (!byTab.some((n) => roles[n] === 'plan') && plan) roles[plan] = 'plan';
    const fields = {};
    for (const sh of dg.sheets) {
      const r = roles[sh.name];
      for (const f of sh.fields) {
        let k = f.key || (f.placeholder ? '-' : '');
        if (sh.name !== plan && (f.key === 'title' || (f.key === 'scale' && ((r !== 'keymap' && r !== 'vicinity') || NTS.test(String(f.value).trim()))))) k = ''; // (a legend's "LEGEND", its "NTS": the client's words kept)
        fields[f.id] = k;
      }
    }
    const K = P.kinds, symbols = { ...p.symbols }, tags = { ...p.tags };
    const nb = P.poleBlocks.find((b) => b.kind === 'new'), eb = P.poleBlocks.find((b) => b.kind === 'existing');
    if (nb) symbols['P-POLE'] = nb.name;
    if (eb) symbols[/ELEC|POWER|MERALCO|COOP/i.test(eb.name) ? 'existing electric pole' : 'existing telecom pole'] = eb.name;
    for (const [k, v] of Object.entries(symbols)) if (v && ((nb && v === nb.name && k !== 'P-POLE') || (eb && v === eb.name && !/pole$/.test(k)) || (eb && v === eb.name && /pole$/.test(k) && k !== 'P-POLE' && symbols[k] !== undefined && k !== (/ELEC|POWER|MERALCO|COOP/i.test(eb.name) ? 'existing electric pole' : 'existing telecom pole')))) symbols[k] = null; // (a pole's block is that pole's only)
    const lw = {}, put = (k, x) => { if (x && x.lw != null && x.lw >= 0) lw[k] = x.lw; };
    put('cable', K.cable); put('cableExisting', K.cableExisting); put('pole', K.pole); put('symbol', K.symbol); put('road', K.road); if (p.look.lw.leader != null) lw.leader = p.look.lw.leader;
    const lay = (x) => (x && x.layer && x.layer !== '0' ? x.layer : '');
    const layers = { cable: lay(K.cable) || p.look.layers.cable, pole: lay(K.pole) || p.look.layers.pole, symbol: lay(K.symbol) || p.look.layers.symbol, text: lay(K.poleId) || lay(K.note) || p.look.layers.text,
      road: lay(K.road) || p.look.layers.road, grid: lay(K.grid) || p.look.layers.grid, photo: '' };
    const font = K.poleId && dg.styles.some((x) => x.name === K.poleId.style) ? K.poleId.style : p.look.font;
    const scale = K.poleId && K.poleId.k ? Math.min(2, Math.max(0.5, Math.round(K.poleId.k * 20) / 20)) : p.look.scale;
    const kinds = {}; for (const [k, x] of Object.entries(K)) { kinds[k] = {}; for (const q of ['layer', 'style', 'h', 'mm', 'k', 'color', 'lw', 'lt', 'block']) if (x[q] != null) kinds[k][q] = x[q]; }
    // model space: what the kept sheets show (the legend, the PMI and ROW tables), not the plan (the route and what is drawn round it) nor the vicinity picture
    const keptRoles = new Set(['legend', 'pmi', 'row', 'cover', 'toc', 'other']), gone = new Set([...P.routeGroups, ...P.vicGroups]);
    const keepG = dg.model.groups.filter((g) => !gone.has(g.id) && g.shown.some((x) => keptRoles.has(roles[x.sheet]))).map((g) => g.id);
    const tables = {};
    if (P.pmi) for (const q of P.pmi.rows) tables[q.handle] = q.how === 'token' ? q.token : '';
    if (P.row) for (const q of [...P.row.munis, ...P.row.brgys, ...P.row.totals]) tables[q.handle] = q.token || '';
    const cover = dg.sheets.find((s) => roles[s.name] === 'cover'), clientF = dg.sheets.flatMap((s) => s.fields).find((f) => f.key === 'client' && f.value && !f.placeholder);
    let name = p.name; if (clientF) name = String(clientF.value).trim(); else if (cover && cover.names && cover.names.length) name = cover.names[0];
    return { ...p, name: name.slice(0, 60), plan, keymap, cef, keep: byTab.filter((n) => n !== plan && n !== keymap && !['plan', 'out', 'cef'].includes(roles[n])), roles, fields, symbols, tags,
      look: { ...p.look, font, scale, lw, layers, cableEx: lay(K.cableExisting) || p.look.cableEx, kinds, planScale: P.planScale }, model: { keep: keepG }, tables, finished: true };
  }
  const NTS = /^(N\.?\s?T\.?\s?S\.?|NOT TO SCALE|NONE|AS SHOWN)$/i;
  function proposal715(dg) {
    const sp = proposeSheets(dg.sheets), keepSheets = new Set([sp.plan, sp.keymap, ...sp.keep].filter(Boolean));
    const fields = {}; for (const sh of dg.sheets) for (const f of sh.fields) fields[f.id] = f.key || (f.placeholder ? '-' : '');
    // the template's name: the largest text of the plan sheet's title block that is not a field (the client's name, usually)
    const plan = dg.sheets.find((s) => s.name === sp.plan);
    let name = String(dg.file || '').replace(/\.dxf$/i, '').replace(/[_]+/g, ' ').trim();
    if (plan && plan.names && plan.names.length) name = plan.names[0];
    const clientF = dg.sheets.flatMap((s) => s.fields).find((f) => f.key === 'client' && f.value && !f.placeholder);
    // symbols: a client block by its name (not a title block), else the app's own
    const cands = dg.blocks.filter((b) => b.kind === 'symbol' && b.size > 0);
    const symbols = {}, tags = {};
    for (const s of SYMBOLS) {
      const b = cands.find((x) => s.re.test(x.name) && !(s.name === 'proposed NAP' && SYM.get('existing NAP').re.test(x.name))) || (s.re2 ? cands.find((x) => s.re2.test(x.name)) : null);
      symbols[s.name] = b ? b.name : null;
      if (b && s.attrs) tags[s.name] = tagsFor(s, b.tags);
    }
    // the look: the client's font, its text size against the plan's (its sample drawing's usual text height), its layers' line weights
    const layers = {}, lyr = dg.layers.filter((l) => l.name !== '0' && l.plot && !/^defpoints$/i.test(l.name) && !/V-?PORT|VIEWPORT|TITLE|BORDER|FRAME|TTLB|TB-|SHEET/i.test(l.name));
    for (const c of LAYER_CLASSES) { const hit = lyr.filter((l) => c.re.test(l.name) && !(c.avoid && c.avoid.test(l.name))).sort((a, b) => b.uses - a.uses)[0]; layers[c.k] = hit ? hit.name : ''; }
    const ex = lyr.find((l) => /(\bFO\b|FOC|FIB(ER|RE)|CABLE).*(EXIST|OLD)|(EXIST|OLD).*(\bFO\b|FOC|FIB(ER|RE)|CABLE)/i.test(l.name));
    const lwOf = (n) => { const l = dg.layers.find((x) => x.name === n); return l && l.lw > 0 ? l.lw : null; };
    const lw = {}; for (const c of LAYER_CLASSES) if (c.lw && layers[c.k] && lwOf(layers[c.k])) lw[c.lw] = lwOf(layers[c.k]);
    if (ex && lwOf(ex.name)) lw.cableExisting = lwOf(ex.name);
    const med = dg.heights.modelMedian, scale = med ? Math.min(1.25, Math.max(0.8, Math.round(med / 2.5 * 20) / 20)) : 1; // (gently: a sample may be drawn at another scale; the review says its size)
    const keepG = dg.model.groups.filter((g) => g.kind !== 'drawing' && g.shown.some((x) => keepSheets.has(x.sheet) && !(x.main && x.sheet === sp.plan))).map((g) => g.id);
    return { v: 1, name: name.slice(0, 60), client: clientF ? clientF.value.slice(0, 60) : name.slice(0, 60), plan: sp.plan, keymap: sp.keymap, cef: sp.cef, keep: sp.keep, fields, symbols, tags,
      look: { font: dg.font.main, bold: dg.font.bold, scale, lw, layers, cableEx: ex ? ex.name : '' }, model: { keep: keepG }, exported: true };
  }

  /* ---------------- editing the drawing ---------------- */
  /** Records whose handle is in gone, what they own, and every pointer to them (dictionary entries, draw order, groups, reactors). */
  function removeHandles(d, gone) {
    let changed = true;
    while (changed) { changed = false; for (const s of ['BLOCKS', 'ENTITIES', 'OBJECTS']) for (const r of d.sec(s).recs) { const h = get(r, 5); if (h && !gone.has(h) && gone.has(owner(r))) { gone.add(h); changed = true; } } }
    for (const s of ['TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) {
      const sec = d.sec(s);
      sec.recs = sec.recs.filter((r) => !gone.has(handleOf(r))).map((r) => {
        if (!r.some((p, i) => i > 0 && HANDLE_CODES(p[0]) && gone.has(p[1]))) return r;
        const t = typ(r), out = [r[0]]; let grp = null;
        for (let i = 1; i < r.length; i++) {
          const [c, v] = r[i];
          if (c === 102) grp = String(v).startsWith('{') ? v : null;
          const dead = HANDLE_CODES(c) && gone.has(v);
          if ((t === 'DICTIONARY' || t === 'ACDBDICTIONARYWDFLT') && c === 3 && r[i + 1] && (r[i + 1][0] === 350 || r[i + 1][0] === 360) && gone.has(r[i + 1][1])) { i++; continue; }
          if (t === 'SORTENTSTABLE' && c === 331 && dead) { if (r[i + 1] && r[i + 1][0] === 5) i++; continue; }
          if (dead && (t === 'GROUP' || (t === 'BLOCK_RECORD' && c === 331) || grp === '{ACAD_REACTORS')) continue;
          out.push([c, v]);
        }
        return out;
      });
    }
    d.index();
  }
  /** An INSERT left with no attribute: no SEQEND, its attributes-follow flag off. */
  function fixSeqends(d) {
    const gone = new Set();
    for (const s of ['BLOCKS', 'ENTITIES']) {
      const R = d.sec(s).recs;
      for (let i = 0; i < R.length; i++) if (typ(R[i]) === 'INSERT' && int(R[i], 66, 0) === 1 && (!R[i + 1] || typ(R[i + 1]) !== 'ATTRIB')) {
        setFirst(R[i], 66, I(0)); if (R[i + 1] && typ(R[i + 1]) === 'SEQEND' && owner(R[i + 1]) === handleOf(R[i])) gone.add(handleOf(R[i + 1]));
      }
    }
    if (gone.size) removeHandles(d, gone);
  }
  /** A new entity: its common part (owner, paper space, layer, colour) then body. */
  function ent(d, type, ownerH, paper, layer, body, color) {
    return [[0, type], [5, d.newHandle()], [330, ownerH], [100, 'AcDbEntity'], ...(paper ? [[67, I(1)]] : []), [8, layer || '0'], ...(color != null ? [[62, I(color)]] : []), ...body];
  }
  function textRec(d, ownerH, paper, o) {
    const al = (o.ha || o.va) ? [[72, I(o.ha || 0)], [11, F(o.x)], [21, F(o.y)], [31, '0.0']] : [];
    return ent(d, 'TEXT', ownerH, paper, o.layer, [[100, 'AcDbText'], [10, F(o.x)], [20, F(o.y)], [30, '0.0'], [40, F(o.h)], [1, o.s], ...(o.rot ? [[50, F(o.rot)]] : []), ...(o.wf && Math.abs(o.wf - 1) > 1e-9 ? [[41, F(o.wf)]] : []),
      [7, o.style || 'Standard'], ...al, [100, 'AcDbText'], ...(o.va ? [[73, I(o.va)]] : [])], o.color);
  }
  /** Entities added to a sheet: before its block's ENDBLK, or (the active sheet) at the end of ENTITIES. */
  function addToSheet(d, S, L, recs) {
    const br = S.br.get(L.brh), bn = get(br, 2);
    if (bn === '*Paper_Space') d.sec('ENTITIES').recs.push(...recs);
    else { const B = d.sec('BLOCKS').recs, end = S.blocks.get(bn).end, k = B.indexOf(end); B.splice(k < 0 ? B.length : k, 0, ...recs); }
    d.index();
  }
  /** A TEXT's, an attribute's or an MTEXT's words set (an MTEXT keeps its leading format codes). */
  function setWords(r, s) {
    if (typ(r) !== 'MTEXT') { if (!setFirst(r, 1, s)) r.push([1, s]); return; }
    setMText(r, withCodes(textOf(r), s));
  }
  /** s with the leading format codes of raw (an MTEXT's {\\fArial|b1;…}) round it. */
  const withCodes = (raw, s) => { const m = /^((?:\\[A-Za-z][^;\\{}]*;|\{)*)/.exec(raw), pre = m ? m[1] : ''; return pre + s + '}'.repeat((pre.match(/\{/g) || []).length); };
  function setMText(r, v) {
    const first = r.findIndex((p, i) => i > 0 && (p[0] === 3 || p[0] === 1)), one = r.findIndex((p, i) => i > 0 && p[0] === 1);
    const chunks = []; for (let i = 0; i < v.length; i += 250) chunks.push(v.slice(i, i + 250)); if (!chunks.length) chunks.push('');
    if (first < 0 || one < 0) { const k = r.findIndex((p) => p[0] === 7); r.splice(k > 0 ? k : r.length, 0, ...chunks.slice(0, -1).map((c) => [3, c]), [1, chunks[chunks.length - 1]]); return; }
    r.splice(first, one - first + 1, ...chunks.slice(0, -1).map((c) => [3, c]), [1, chunks[chunks.length - 1]]);
  }
  /** An attribute of the title block written as a text of the sheet (where it was, as it looked). */
  function textFromAttrib(d, L, a, s) {
    const g = (c) => get(a, c), ha = int(a, 72, 0), va = int(a, 74, 0), col = g(62) != null ? int(a, 62, 256) : null;
    const al = ha || va ? [[72, I(ha)], [11, F(num(a, 11, num(a, 10, 0)))], [21, F(num(a, 21, num(a, 20, 0)))], [31, '0.0']] : (g(72) != null ? [[72, I(0)]] : []);
    return [[0, 'TEXT'], [5, d.newHandle()], [330, L.brh], [100, 'AcDbEntity'], [67, I(1)], [8, String(g(8) || '0')], ...(col != null ? [[62, I(col)]] : []), ...(g(370) != null ? [[370, g(370)]] : []), ...(g(420) != null ? [[420, g(420)]] : []),
      [100, 'AcDbText'], [10, F(num(a, 10, 0))], [20, F(num(a, 20, 0))], [30, '0.0'], [40, F(num(a, 40, 2.5))], [1, s], ...(num(a, 50, 0) ? [[50, F(num(a, 50, 0))]] : []), ...(g(41) != null ? [[41, F(num(a, 41, 1))]] : []),
      ...(num(a, 51, 0) ? [[51, F(num(a, 51, 0))]] : []), [7, String(g(7) || 'Standard')], ...(int(a, 71, 0) ? [[71, I(int(a, 71, 0))]] : []), ...al, [100, 'AcDbText'], ...(va ? [[73, I(va)]] : [])];
  }
  /** A text of a block (the title block's) written on the sheet where its insert shows it. ins: the insert on the sheet (its layer for layer 0). */
  function textFromBlock(d, L, r, M, s, ins) {
    const k = mScale(M), ang = mAngle(M), lay = String(get(r, 8, '0')) === '0' && ins ? String(get(ins, 8, '0')) : String(get(r, 8, '0'));
    const col = get(r, 62) != null ? (int(r, 62, 256) === 0 && ins && get(ins, 62) != null ? int(ins, 62, 256) : int(r, 62, 256)) : null;
    if (typ(r) === 'MTEXT') {
      const p = ap(M, num(r, 10, 0), num(r, 20, 0)), dir = get(r, 11) != null ? Math.atan2(num(r, 21, 0), num(r, 11, 1)) : num(r, 50, 0), a = dir + ang * Math.PI / 180;
      const out = [[0, 'MTEXT'], [5, d.newHandle()], [330, L.brh], [100, 'AcDbEntity'], [67, I(1)], [8, lay], ...(col != null ? [[62, I(col)]] : []), [100, 'AcDbMText'], [10, F(p[0])], [20, F(p[1])], [30, '0.0'],
        [40, F(num(r, 40, 2.5) * k)], [41, F(num(r, 41, 0) * k)], [71, I(int(r, 71, 1))], [72, I(int(r, 72, 1))], [1, ''], [7, String(get(r, 7, 'Standard'))], ...(Math.abs(a) > 1e-9 ? [[11, F(Math.cos(a))], [21, F(Math.sin(a))], [31, '0.0']] : []), [73, I(1)], [44, F(num(r, 44, 1))]];
      const raw = textOf(r); setMText(out, s === raw ? raw : withCodes(raw, s)); // (its format codes kept)
      return out;
    }
    const p = ap(M, num(r, 10, 0), num(r, 20, 0)), ha = int(r, 72, 0), va = int(r, 73, 0), q = ha || va ? ap(M, num(r, 11, num(r, 10, 0)), num(r, 21, num(r, 20, 0))) : null;
    return textRec(d, L.brh, true, { x: q && (ha || va) ? q[0] : p[0], y: q && (ha || va) ? q[1] : p[1], h: num(r, 40, 2.5) * k, s, rot: num(r, 50, 0) + ang, wf: num(r, 41, 1), style: String(get(r, 7, 'Standard')), ha, va, layer: lay, color: col });
  }
  /** The fields of one sheet written as the review chose: a token (@@NAME@@), blank, or the client's text as it is. Attributes of the title block and
      the title block's own value texts become texts of the sheet (dxftpl.js fills a sheet's texts); a label with no value gets its value text. */
  function applyFields(d, L, list, choose, kind, lift) {
    let S = TPL().structure(d); L = S.layouts.find((x) => x.name === L.name);
    const adds = [], goneA = new Set();
    const insOf = (h) => d.byHandle.get(h) || null;
    for (const f of list) {
      const c = choose(f), tokKey = c && c !== '-' ? tokenOf(c, kind) : null;
      const v = c === '-' ? '' : tokKey ? `@@${tokKey}@@` : null; // (null: the client's text kept)
      const r = f.kind === 'label' ? null : d.byHandle.get(f.handle);
      const words0 = (s) => (f.how === 'inline' ? (s ? f.prefix + s : String(f.prefix || '').trim()) : s);
      if (f.kind === 'attrib') { if (!r || v == null) continue; if (v === '') { setWords(r, ''); continue; } adds.push(textFromAttrib(d, L, r, words0(v))); goneA.add(f.handle); }
      else if (f.kind === 'text') { if (!r || v == null) continue; setWords(r, words0(v)); }
      else if (f.kind === 'btext') { if (!r || !lift.has(f.handle)) continue; adds.push(textFromBlock(d, L, r, f.M, v == null ? textOf(r) : words0(v), insOf(f.top))); }
      else if (f.kind === 'label') {
        if (!v) continue; const lb = d.byHandle.get(f.handle), M = f.M || ID, k = mScale(M);
        adds.push(textRec(d, L.brh, true, { x: f.at.x, y: f.at.y, h: f.at.h, s: v, style: lb ? String(get(lb, 7, 'Standard')) : 'Standard', layer: lb ? (String(get(lb, 8, '0')) === '0' && f.top && insOf(f.top) ? String(get(insOf(f.top), 8, '0')) : String(get(lb, 8, '0'))) : '0', wf: lb ? num(lb, 41, 1) : 1, color: lb && get(lb, 62) != null && int(lb, 62, 256) ? int(lb, 62, 256) : null }));
        void k;
      }
    }
    // a text that holds an AutoCAD field (its value worked out by AutoCAD: a date, the sheet's name…): its field dropped where a token or a blank
    // took its place, or AutoCAD would write its own value over the app's (make_seed.py warns of them)
    const fdict = new Set();
    for (const f of list) {
      const c = choose(f); if ((!c && !(f.kind === 'btext' && lift.has(f.handle))) || f.kind === 'label') continue; const r = d.byHandle.get(f.handle); if (!r) continue; // (a title block's own text lifted: emptied in its block)
      let g = false; for (const [cc, v] of r) { if (cc === 102) { g = String(v) === '{ACAD_XDICTIONARY'; continue; } if (g && cc === 360) { const x = d.byHandle.get(v); if (x && typ(x) === 'DICTIONARY' && all(x, 3).includes('ACAD_FIELD')) fdict.add(v); } }
    }
    if (fdict.size) { for (const h of fdict) goneA.add(h); }
    if (goneA.size) { removeHandles(d, goneA); fixSeqends(d); }
    if (adds.length) { S = TPL().structure(d); addToSheet(d, S, S.layouts.find((x) => x.name === L.name), adds); }
  }
  /** The "Exported by" line (the app's backtracking line) under the sheet's frame at its lower right, small, as the company's sheets have it. */
  function addExported(d, L, sh, style) {
    const h = sh.units === 'in' ? 0.07 : 1.8, fr = sh.frame, lim = [0, 0];
    let x = fr[2], y = fr[1] - 1.6 * h, ha = 2;
    if (fr[1] - lim[1] < 2.2 * h) { y = fr[3] + 0.6 * h; if (y + h > sh.paper[1]) { x = fr[0] + h; y = fr[1] + 0.6 * h; ha = 0; } }
    const S = TPL().structure(d), L2 = S.layouts.find((q) => q.name === L.name);
    addToSheet(d, S, L2, [textRec(d, L2.brh, true, { x, y, h, s: '@@EXPORTED_BY@@', style, ha, layer: '0' })]);
  }
  /** The sheet's main viewport made square (the plan's sheets show square cells: dxftpl aims a square one) at 1:1100 on its paper (cell: metres). */
  function squareVp(d, handle, mmU, plan) {
    const vp = d.byHandle.get(handle); if (!vp) return null;
    const w = num(vp, 40, 0), h = num(vp, 41, 0), side = Math.min(w, h); if (!(side > 0)) return null;
    setFirst(vp, 40, F(side)); setFirst(vp, 41, F(side));
    const cell = +(side * mmU * 1.1).toFixed(4);
    if (plan) setFirst(vp, 45, F(cell));
    else setFirst(vp, 45, F(num(vp, 45, side) * side / (h || side)));
    const fl = int(vp, 90, 0); if (fl & 65536) { setFirst(vp, 90, I(fl & ~65536)); const k = vp.findIndex((p) => p[0] === 340); if (k > 0) vp.splice(k, 1); } // (a clipped viewport: its clipping off)
    const cx = num(vp, 10, 0), cy = num(vp, 20, 0);
    return { side: +side.toFixed(4), cell, box: [cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2].map((v) => +v.toFixed(4)) };
  }
  function renameLayout(d, L, name) {
    setSub(L.rec, 'AcDbLayout', 1, name);
    for (const r of d.sec('OBJECTS').recs) if (typ(r) === 'DICTIONARY') for (let i = 1; i < r.length - 1; i++) if (r[i][0] === 3 && r[i + 1][0] === 350 && r[i + 1][1] === handleOf(L.rec)) r[i][1] = name;
  }
  /** Removes a sheet (not the active one: makeActive another first). */
  function removeLayout(d, S, L) {
    const br = S.br.get(L.brh), b = S.blocks.get(get(br, 2));
    removeHandles(d, new Set([handleOf(L.rec), L.brh, handleOf(b.begin), handleOf(b.end), ...b.ents.map(handleOf)].filter(Boolean)));
  }
  /** Makes a sheet the drawing's active one (*Paper_Space, its entities in ENTITIES): the two block records swap names, the entities move. */
  function makeActive(d, name) {
    let S = TPL().structure(d); const L = S.layouts.find((x) => x.name === name), A = S.layouts.find((x) => x.name !== 'Model' && isActive(S, x));
    if (!L || !A || L === A) return;
    const brA = S.br.get(A.brh), brL = S.br.get(L.brh), nL = get(brL, 2), bA = S.blocks.get('*Paper_Space'), bL = S.blocks.get(nL);
    const aEnts = sheetEnts(d, S, A), lEnts = bL.ents.slice(), aSet = new Set(aEnts), lSet = new Set(lEnts);
    const E = d.sec('ENTITIES'), B = d.sec('BLOCKS');
    E.recs = E.recs.filter((r) => !aSet.has(r)); B.recs = B.recs.filter((r) => !lSet.has(r));
    for (const r of lEnts) if (!paperFlag(r) && !/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r))) { const k = r.findIndex((p) => p[0] === 8); r.splice(k > 0 ? k : 4, 0, [67, I(1)]); }
    E.recs.push(...lEnts);
    B.recs.splice(B.recs.indexOf(bA.end), 0, ...aEnts);
    setSub(brA, 'AcDbBlockTableRecord', 2, nL); setSub(brL, 'AcDbBlockTableRecord', 2, '*Paper_Space');
    for (const [r, n] of [[bA.begin, nL], [bA.end, null], [bL.begin, '*Paper_Space'], [bL.end, null]]) if (n) { setSub(r, 'AcDbBlockBegin', 2, n); setSub(r, 'AcDbBlockBegin', 3, n); }
    // their draw-order tables (for the other block now): dropped
    const sort = new Set(); for (const r of d.sec('OBJECTS').recs) if (typ(r) === 'SORTENTSTABLE') { const k = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbSortentsTable'), br = k >= 0 && r[k + 1] && r[k + 1][0] === 330 ? r[k + 1][1] : null; if (br === A.brh || br === L.brh) sort.add(handleOf(r)); }
    if (sort.size) removeHandles(d, sort); else d.index();
  }
  /** A copy of a sheet (the key map from the plan sheet), as a sheet of its own block (*Paper_SpaceN), after the last one. */
  function cloneSheet(d, name, newName) {
    const S = TPL().structure(d), L = S.layouts.find((x) => x.name === name), br = S.br.get(L.brh), b = S.blocks.get(get(br, 2)), ents = sheetEnts(d, S, L);
    const src = [L.rec, br, b.begin, ...ents, b.end], map = new Map(); src.forEach((r) => { const h = handleOf(r); if (h) map.set(h, d.newHandle()); });
    const nums = [...S.brByName.keys()].map((n) => (/^\*Paper_Space(\d+)$/.exec(n) || [])[1]).filter(Boolean).map(Number), bname = `*Paper_Space${nums.length ? Math.max(...nums) + 1 : 0}`;
    const strip = (r) => { const out = []; let skip = false; for (const p of r) { if (p[0] === 102 && String(p[1]).startsWith('{')) { skip = true; continue; } if (skip) { if (p[0] === 102) skip = false; continue; } out.push(p); } return out; };
    const copy = (r) => strip(r).map(([c, v]) => [c, (c === 5 || HANDLE_CODES(c)) && map.has(v) ? map.get(v) : v]);
    const nL = copy(L.rec), nBR = copy(br), nB = copy(b.begin), nE = ents.map(copy), nEnd = copy(b.end);
    setSub(nBR, 'AcDbBlockTableRecord', 2, bname); setSub(nB, 'AcDbBlockBegin', 2, bname); setSub(nB, 'AcDbBlockBegin', 3, bname); setSub(nL, 'AcDbLayout', 1, newName);
    for (const r of nE) if (!paperFlag(r) && !/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r))) { const k = r.findIndex((p) => p[0] === 8); r.splice(k > 0 ? k : 4, 0, [67, I(1)]); }
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, O = d.sec('OBJECTS').recs;
    T.splice(T.lastIndexOf(T.filter((r) => typ(r) === 'BLOCK_RECORD').pop()) + 1, 0, nBR);
    B.push(nB, ...nE, nEnd);
    O.splice(O.indexOf(L.rec) + 1, 0, nL);
    const dict = O.find((r) => typ(r) === 'DICTIONARY' && all(r, 350).includes(handleOf(L.rec))); if (dict) dict.push([3, newName], [350, get(nL, 5)]);
    setSub(nL, 'AcDbLayout', 71, I(S.layouts.length));
    d.index();
  }
  /** Blocks nothing uses (the CEF seed: the client's symbols, its sample's blocks). */
  function purgeBlocks(d) {
    for (let it = 0; it < 6; it++) {
      const S = TPL().structure(d), used = new Set(), ptr = new Set();
      for (const r of S.E) if (typ(r) === 'INSERT' || typ(r) === 'DIMENSION') used.add(get(r, 2));
      for (const [n, b] of S.blocks) for (const r of b.ents) if (typ(r) === 'INSERT' || typ(r) === 'DIMENSION') used.add(get(r, 2));
      for (const s of ['HEADER']) for (const p of d.sec(s).raw) if (typeof p[1] === 'string') ptr.add(p[1].trim());
      for (const s of ['TABLES', 'OBJECTS']) for (const r of d.sec(s).recs) if (typ(r) !== 'BLOCK_RECORD') for (const p of r) if (HANDLE_CODES(p[0])) ptr.add(p[1]);
      const gone = new Set();
      for (const [n, b] of S.blocks) {
        if (/^\*/.test(n) || used.has(n) || ptr.has(n)) continue; const br = S.brByName.get(n); if (!br || ptr.has(get(br, 5))) continue; // (one the header names, e.g. $DIMBLK: kept)
        [get(br, 5), handleOf(b.begin), handleOf(b.end), ...b.ents.map(handleOf)].filter(Boolean).forEach((h) => gone.add(h));
      }
      if (!gone.size) return; removeHandles(d, gone);
    }
  }
  /** A new block (the app's own symbol): its record, BLOCK, entities, ENDBLK. g: the shape (see SYMBOLS). */
  function addBlock(d, name, g, style) {
    const T = d.sec('TABLES').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD'), brH = d.newHandle();
    T.splice(T.lastIndexOf(T.filter((r) => typ(r) === 'BLOCK_RECORD').pop()) + 1, 0, [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]]);
    const hasA = g.some((q) => q[0] === 'a'), ents = [];
    for (const q of g) {
      if (q[0] === 'c') ents.push(ent(d, 'CIRCLE', brH, false, '0', [[100, 'AcDbCircle'], [10, F(q[1])], [20, F(q[2])], [30, '0.0'], [40, F(q[3])]], 0));
      else if (q[0] === 'l') ents.push(ent(d, 'LINE', brH, false, '0', [[100, 'AcDbLine'], [10, F(q[1])], [20, F(q[2])], [30, '0.0'], [11, F(q[3])], [21, F(q[4])], [31, '0.0']], 0));
      else if (q[0] === 'p') ents.push(ent(d, 'LWPOLYLINE', brH, false, '0', [[100, 'AcDbPolyline'], [90, I(q[1].length)], [70, I(q[2] ? 1 : 0)], [43, '0.0'], ...q[1].flatMap(([x, y]) => [[10, F(x)], [20, F(y)]])], 0));
      else if (q[0] === 't') ents.push(textRec(d, brH, false, { x: q[1], y: q[2], h: q[3], s: q[4], style, layer: '0', color: 0 }));
      else if (q[0] === 'a') ents.push(ent(d, 'ATTDEF', brH, false, '0', [[100, 'AcDbText'], [10, F(q[2])], [20, F(q[3])], [30, '0.0'], [40, F(q[4])], [1, ''], [7, style], [100, 'AcDbAttributeDefinition'], [280, I(0)], [3, q[1]], [2, q[1]], [70, I(0)]], 0));
    }
    const begin = [[0, 'BLOCK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'], [2, name], [70, I(hasA ? 2 : 0)], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, name], [1, '']];
    const end = [[0, 'ENDBLK'], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']];
    d.sec('BLOCKS').recs.push(begin, ...ents, end);
    d.index();
  }
  /** Renames a block: its record, BLOCK and every insert of it. */
  function renameBlock(d, from, to) {
    const S = TPL().structure(d), br = S.brByName.get(from), b = S.blocks.get(from); if (!br || !b) return false;
    setSub(br, 'AcDbBlockTableRecord', 2, to); setSub(b.begin, 'AcDbBlockBegin', 2, to); setSub(b.begin, 'AcDbBlockBegin', 3, to);
    for (const s of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(s).recs) if (typ(r) === 'INSERT' && get(r, 2) === from) setSub(r, 'AcDbBlockReference', 2, to);
    return true;
  }
  /** A copy of a block's definition under another name (one client symbol for two of the plan's). */
  function copyBlockDef(d, from, to) {
    const S = TPL().structure(d), b = S.blocks.get(from); if (!b) return false;
    const T = d.sec('TABLES').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD'), brH = d.newHandle();
    T.splice(T.lastIndexOf(T.filter((r) => typ(r) === 'BLOCK_RECORD').pop()) + 1, 0, [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, to], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]]);
    const map = new Map([[get(S.brByName.get(from), 5), brH]]); b.ents.forEach((e) => { const h = handleOf(e); if (h) map.set(h, d.newHandle()); });
    const strip = (r) => { const out = []; let skip = false; for (const p of r) { if (p[0] === 102 && String(p[1]).startsWith('{')) { skip = true; continue; } if (skip) { if (p[0] === 102) skip = false; continue; } if (p[0] >= 1000) continue; out.push(p); } return out; };
    const cp = (r) => { let q = strip(r).map(([c, v]) => [c, (c === 5 || HANDLE_CODES(c)) && map.has(v) ? map.get(v) : v]);
      if (typ(q) === 'HATCH') { const o = []; for (let i = 0; i < q.length; i++) { const [c, v] = q[i]; if (c === 97) { const n = parseInt(v, 10) || 0; o.push([97, I(0)]); i += n; continue; } if (c === 71 && q.slice(0, i).some((p) => p[0] === 100 && p[1] === 'AcDbHatch')) { o.push([71, I(0)]); continue; } o.push([c, v]); } q = o; } // (no links to the source block's boundary objects)
      return q; };
    const begin = cp(b.begin); begin[1] = [5, d.newHandle()]; setSub(begin, 'AcDbBlockBegin', 2, to); setSub(begin, 'AcDbBlockBegin', 3, to);
    const end = cp(b.end); end[1] = [5, d.newHandle()];
    d.sec('BLOCKS').recs.push(begin, ...b.ents.map(cp), end);
    d.index(); return true;
  }
  /** A record scaled by k about 0, 0 (a block's drawing to the size the plan places it at). False for a kind it cannot scale. */
  function scaleRec(r, k) {
    const t = typ(r), sc = (i) => { r[i][1] = F(+r[i][1] * k); };
    const pts = { LINE: [10, 20, 11, 21], CIRCLE: [10, 20, 40], ARC: [10, 20, 40], POINT: [10, 20], LWPOLYLINE: [10, 20, 43, 40, 41], POLYLINE: [10, 20, 40, 41], VERTEX: [10, 20, 40, 41], TEXT: [10, 20, 11, 21, 40], ATTDEF: [10, 20, 11, 21, 40], ATTRIB: [10, 20, 11, 21, 40],
      SOLID: [10, 20, 11, 21, 12, 22, 13, 23], TRACE: [10, 20, 11, 21, 12, 22, 13, 23], '3DFACE': [10, 20, 11, 21, 12, 22, 13, 23], ELLIPSE: [10, 20, 11, 21], INSERT: [10, 20, 41, 42, 43, 44, 45], SPLINE: [10, 20, 11, 21], SEQEND: [] };
    if (t === 'MTEXT') { const e0 = r.findIndex((p) => p[0] === 101); r.forEach((p, i) => { if ((e0 < 0 || i < e0) && [10, 20, 40, 41, 46].includes(p[0])) sc(i); }); return true; }
    if (t === 'HATCH') {
      const s0 = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbHatch'); if (s0 < 0) return false;
      let elev = 2, poly = false, edge = 0, pat = false, seeds = false;
      for (let i = s0 + 1; i < r.length; i++) {
        const c = r[i][0]; if (c >= 1000) break;
        if (elev && (c === 10 || c === 20)) { elev--; continue; }
        if (c === 92) { poly = (parseInt(r[i][1], 10) & 2) !== 0; edge = 0; } else if (c === 72 && !poly) edge = parseInt(r[i][1], 10) || 0; else if (c === 75) { poly = false; edge = 0; } else if (c === 78) pat = true; else if (c === 98) { seeds = true; pat = false; }
        if (c === 10 || c === 20 || ((edge === 1 || edge === 3 || edge === 4) && (c === 11 || c === 21)) || (c === 40 && !poly && edge === 2 && !pat) || (c === 41 && edge === 0 && !seeds) || (pat && (c === 43 || c === 44 || c === 45 || c === 46 || c === 49))) sc(i);
      }
      return true;
    }
    const P = pts[t]; if (!P) return false;
    const sub = t === 'INSERT' ? r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbBlockReference') : 0;
    r.forEach((p, i) => { if (i > sub && P.includes(p[0]) && !(t === 'LWPOLYLINE' && p[0] === 40 && false)) sc(i); });
    return true;
  }
  /** A block's drawing moved by (dx, dy) (its base point to the plan's 0, 0). */
  function moveRec(r, dx, dy) {
    const t = typ(r), mv = (i, v) => { r[i][1] = F(+r[i][1] + v); };
    const P = { LINE: [10, 11], CIRCLE: [10], ARC: [10], POINT: [10], LWPOLYLINE: [10], POLYLINE: [], VERTEX: [10], TEXT: [10, 11], ATTDEF: [10, 11], ATTRIB: [10, 11], MTEXT: [10], SOLID: [10, 11, 12, 13], TRACE: [10, 11, 12, 13], '3DFACE': [10, 11, 12, 13], ELLIPSE: [10], INSERT: [10], SPLINE: [10, 11], SEQEND: [] }[t];
    if (t === 'HATCH') { const s0 = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbHatch'); let elev = 2, poly = false, edge = 0, pat = false; for (let i = s0 + 1; i < r.length; i++) { const c = r[i][0]; if (c >= 1000) break; if (elev && (c === 10 || c === 20)) { elev--; continue; } if (c === 92) { poly = (parseInt(r[i][1], 10) & 2) !== 0; edge = 0; } else if (c === 72 && !poly) edge = parseInt(r[i][1], 10) || 0; else if (c === 75) { poly = false; edge = 0; } else if (c === 78) pat = true; if (c === 10 || ((edge === 1 || edge === 4) && c === 11)) mv(i, dx); else if (c === 20 || ((edge === 1 || edge === 4) && c === 21)) mv(i, dy); else if (pat && c === 43) mv(i, dx); else if (pat && c === 44) mv(i, dy); } return true; }
    if (!P) return false;
    const e0 = t === 'MTEXT' ? r.findIndex((p) => p[0] === 101) : -1;
    r.forEach((p, i) => { if (e0 >= 0 && i > e0) return; if (P.includes(p[0])) mv(i, dx); else if (P.includes(p[0] - 10)) mv(i, dy); });
    return true;
  }

  /* ---------------- the client's symbols as the plan's ---------------- */
  /** The plan's symbols in the seed: the client's block chosen for each, renamed to the plan's block name (its inserts and attribute tags with it),
      its drawing on its base point and at the size the plan places its own at; or the app's own plain shape. → look.blocks */
  /** Block names dxftpl.js uses as the company template's own (other kinds of NAP, LCP, manhole, service box, OLT, HDD, the title block PAGING, its own
      G-ESAA blocks): a client block of such a name would be drawn as one of them at the company's scale, or filled as the company's title block. */
  const BUILDER_NAMES = /^(1_16NAP|dummy nap|AUGMENT NAP 1X16|proposed Double NAP|existing Double NAP|proposed LCP|existing LCP|LCP 2|HANDHOLE|PROPOSED MAN HOLE|MH|proposed service box|SB|7|proposed HDD Directional Boring|existing HDD Directional Boring|PAGING|G-ESAA .*)$/;
  function applySymbols(d, map, style, notes) {
    const T = TPL(), done = new Map(), rec = {};
    const exists = (n) => T.structure(d).blocks.has(n);
    const syms = { ...(map.symbols || {}) }, want0 = new Set(Object.values(syms).filter(Boolean)); // (a copy: the review's choices stay as they were)
    for (const n of [...T.structure(d).blocks.keys()]) if (!/^\*/.test(n) && BUILDER_NAMES.test(n) && !SYM.has(n)) { // (one the review chose is renamed to the plan's name below)
      let k = 1; while (exists(`${n} (CLIENT${k > 1 ? ` ${k}` : ''})`)) k++; const to = `${n} (CLIENT${k > 1 ? ` ${k}` : ''})`; renameBlock(d, n, to);
      if (want0.has(n)) for (const s0 of Object.keys(syms)) if (syms[s0] === n) syms[s0] = to;
      notes.push(`The client's block ${n} renamed ${to}: the plan uses that name for its own`);
    }
    for (const s of SYMBOLS) {
      let want = syms[s.name] || null; if (want && !exists(want) && !done.has(want)) want = null;
      if (exists(s.name) && want !== s.name) { let k = 1; while (exists(`${s.name} (CLIENT${k > 1 ? ` ${k}` : ''})`)) k++; renameBlock(d, s.name, `${s.name} (CLIENT${k > 1 ? ` ${k}` : ''})`); } // (a client block of that name that is not it)
      if (!want) { addBlock(d, s.name, s.g, style); rec[s.name] = { name: null, tags: {} }; continue; }
      if (done.has(want)) copyBlockDef(d, done.get(want), s.name); else if (want !== s.name) { renameBlock(d, want, s.name); done.set(want, s.name); } else done.set(want, s.name);
      fitBlock(d, s, notes);
      const tags = retag(d, s, (map.tags && map.tags[s.name]) || {}, style);
      rec[s.name] = { name: want, tags };
    }
    return rec;
  }
  /** A renamed client block: its drawing moved to the base point 0, 0 (and centred there for a point-like symbol), sized as the plan's own;
      its other inserts (a kept legend) scaled back, so they look as before. */
  function fitBlock(d, s, notes) {
    let S = TPL().structure(d); const b = S.blocks.get(s.name); if (!b) return;
    const bx = num(b.begin, 10, 0), by = num(b.begin, 20, 0), bb0 = symBox(S, s.name, 0); if (!bb0) return;
    let dx = -bx, dy = -by;
    const cx = (bb0[0] + bb0[2]) / 2 - bx, cy = (bb0[1] + bb0[3]) / 2 - by, size = Math.max(bb0[2] - bb0[0], bb0[3] - bb0[1]);
    if (s.centre && Math.hypot(cx, cy) > 0.2 * size) { dx -= cx; dy -= cy; }
    const bad = b.ents.filter((e) => !/^(ATTRIB|SEQEND)$/.test(typ(e)) && !moveRec(e, 0, 0)).map(typ);
    if (bad.length) { notes.push(`Symbol ${s.label}: kept as the client drew it (it has ${[...new Set(bad)].join(', ')})`); return; }
    if (dx || dy) for (const e of b.ents) moveRec(e, dx, dy);
    const shift = [dx + bx, dy + by]; // (an insert of it elsewhere moves its insertion point by -shift to stay where it was)
    setFirst(b.begin, 10, '0.0'); setFirst(b.begin, 20, '0.0');
    const k = size > 0 ? s.size / size : 1, scale = k < 0.87 || k > 1.15;
    if (scale) for (const e of b.ents) scaleRec(e, k);
    for (const sec of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(sec).recs) {
      if (typ(r) !== 'INSERT' || get(r, 2) !== s.name) continue;
      // P' = P - R S (base + move): what it drew stays where it was; its scale / k: as large as it was
      const sx = num(r, 41, 1), sy = num(r, 42, 1), a = num(r, 50, 0) * Math.PI / 180, ux = shift[0] * sx, uy = shift[1] * sy;
      setFirst(r, 10, F(num(r, 10, 0) - (ux * Math.cos(a) - uy * Math.sin(a)))); setFirst(r, 20, F(num(r, 20, 0) - (ux * Math.sin(a) + uy * Math.cos(a))));
      if (scale) { const sub = r.findIndex((q) => q[0] === 100 && q[1] === 'AcDbBlockReference'); for (const c of [41, 42, 43]) { const i = r.findIndex((q, j) => j > sub && q[0] === c); if (i > 0) r[i][1] = F(+r[i][1] / k); else { let z = -1; r.forEach((q, j) => { if (j > sub && [30, 41, 42].includes(q[0]) && q[0] < c) z = j; }); r.splice(z > 0 ? z + 1 : r.length, 0, [c, F(1 / k)]); } } }
    }
    if (scale) notes.push(`Symbol ${s.label}: the client's block drawn ×${+k.toPrecision(3)} (the size the plan places its symbols at)`);
    d.index();
  }
  /** The symbol's attribute tags: the client's renamed to the plan's (in the block and in its inserts); a plan tag the client has none for added. */
  function retag(d, s, want, style) {
    if (!s.attrs) return {};
    const S = TPL().structure(d), b = S.blocks.get(s.name), defs = b.ents.filter((e) => typ(e) === 'ATTDEF'), have = defs.map((e) => String(get(e, 2, '')));
    const m = Object.keys(want).length ? want : tagsFor(s, have), back = new Map(Object.entries(m).filter(([p, c]) => c && have.includes(c)).map(([p, c]) => [c, p]));
    for (const e of defs) { const c = String(get(e, 2, '')); if (back.has(c)) { setSub(e, 'AcDbAttributeDefinition', 2, back.get(c)); } }
    const insH = new Set(); for (const sec of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(sec).recs) if (typ(r) === 'INSERT' && get(r, 2) === s.name) insH.add(handleOf(r));
    for (const sec of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(sec).recs) if (typ(r) === 'ATTRIB' && insH.has(owner(r))) { const c = String(get(r, 2, '')); if (back.has(c)) setSub(r, 'AcDbAttribute', 2, back.get(c)); }
    const now = new Set(TPL().structure(d).blocks.get(s.name).ents.filter((e) => typ(e) === 'ATTDEF').map((e) => String(get(e, 2, ''))));
    const add = s.g.filter((q) => q[0] === 'a' && !now.has(q[1]));
    if (add.length) {
      const B = d.sec('BLOCKS').recs, S2 = TPL().structure(d), bl = S2.blocks.get(s.name), brH = get(S2.brByName.get(s.name), 5), k = B.indexOf(bl.end);
      B.splice(k, 0, ...add.map((q) => ent(d, 'ATTDEF', brH, false, '0', [[100, 'AcDbText'], [10, F(q[2])], [20, F(q[3])], [30, '0.0'], [40, F(q[4])], [1, ''], [7, style], [100, 'AcDbAttributeDefinition'], [280, I(0)], [3, q[1]], [2, q[1]], [70, I(0)]], 0)));
      setFirst(bl.begin, 70, I(int(bl.begin, 70, 0) | 2)); d.index();
    }
    const out = {}; for (const [c, p] of back) out[p] = c; return out;
  }

  /* ---------------- layers, text styles, the look ---------------- */
  /** Every layer the plan writes, in the seed: as the client's layer chosen for its kind looks (colour, line type, weight), else plain. */
  function applyLayers(d, map) {
    const T = d.sec('TABLES').recs, S = TPL().structure(d), out = {}, src0 = S.layers.get('0') || [...S.layers.values()][0];
    const ltOk = (n) => S.ltypes.has(n) || /^(continuous|bylayer|byblock)$/i.test(n);
    for (const c of LAYER_CLASSES) {
      const cl = map.look && map.look.layers ? map.look.layers[c.k] : '', from = cl ? S.layers.get(cl) : null;
      for (const name of c.layers) {
        if (from) out[name] = cl;
        if (S.layers.has(name)) continue;
        const h = d.newHandle(), base = (from || src0).filter(([k]) => k < 1000).map(([k, v]) => [k, v]);
        const r = []; let grp = false; for (const p of base) { if (p[0] === 102) { grp = String(p[1]).startsWith('{'); continue; } if (grp) continue; r.push(p); }
        const setc = (k, v) => { const i = r.findIndex((p) => p[0] === k); if (i >= 0) r[i][1] = v; else r.splice(r.findIndex((p) => p[0] === 70) + 1, 0, [k, v]); };
        r[r.findIndex((p) => p[0] === 5)][1] = h; r[r.findIndex((p) => p[0] === 2)][1] = name; setc(70, I(0));
        if (!from) { setc(62, I(c.color)); setc(6, 'Continuous'); setc(370, I(-3)); const t = r.findIndex((p) => p[0] === 420); if (t >= 0) r.splice(t, 1); }
        else { const c62 = Math.abs(int(from, 62, 7)) || 7; setc(62, I(c62)); if (!ltOk(String(get(from, 6, 'Continuous')))) setc(6, 'Continuous'); }
        const p290 = r.findIndex((p) => p[0] === 290); if (p290 >= 0) r[p290][1] = I(1);
        const own = r.findIndex((p) => p[0] === 330), tb = T.find((x) => typ(x) === 'TABLE' && get(x, 2) === 'LAYER'); if (own >= 0 && tb) r[own][1] = get(tb, 5);
        const last = T.reduce((k, x, i) => (typ(x) === 'LAYER' ? i : k), -1); T.splice(last + 1, 0, r); S.layers.set(name, r);
      }
    }
    d.index(); return out;
  }
  /** The text style 'G-ESAA TEXT' (a copy of the client's main style: its font, width) and 'G-ESAA TEXT BOLD' (its bold one, when it has one). */
  function applyStyles(d, map) {
    const T = d.sec('TABLES').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'STYLE'), find = (n) => T.find((r) => typ(r) === 'STYLE' && n && String(get(r, 2, '')).toUpperCase() === String(n).toUpperCase());
    const put = (name, src) => {
      const old = find(name); if (old) T.splice(T.indexOf(old), 1);
      const base = src || find('Standard') || T.find((r) => typ(r) === 'STYLE'); if (!base) return null;
      const r = []; let grp = false; for (const p of base) { if (p[0] === 102) { grp = String(p[1]).startsWith('{'); continue; } if (grp) continue; r.push([p[0], p[1]]); }
      r[r.findIndex((p) => p[0] === 5)][1] = d.newHandle(); r[r.findIndex((p) => p[0] === 2)][1] = name; setFirst(r, 70, I(0)); setFirst(r, 40, '0.0');
      const own = r.findIndex((p) => p[0] === 330); if (own >= 0 && tb) r[own][1] = get(tb, 5);
      const last = T.reduce((k, x, i) => (typ(x) === 'STYLE' ? i : k), -1); T.splice(last + 1, 0, r);
      return { font: String(get(r, 3, '')), face: (() => { const k = r.findIndex((p) => p[0] === 1001 && p[1] === 'ACAD'); return k >= 0 ? String((r.slice(k + 1).find((p) => p[0] === 1000) || [])[1] || '') : ''; })() };
    };
    const main = put('G-ESAA TEXT', find(map.look && map.look.font)), bold = map.look && map.look.bold && find(map.look.bold) ? put('G-ESAA TEXT BOLD', find(map.look.bold)) : null;
    d.index();
    return { main, bold };
  }
  /** The look as the XRECORD 'G-ESAA_LOOK' in the root dictionary: its JSON in group 1 strings of at most 250 characters. */
  function putLook(d, look) { putJson(d, 'G-ESAA_LOOK', look); }
  /** A JSON value as an XRECORD of the root dictionary under key (replacing the one there): the look, (templates, Round trip) the template's tag. */
  function putJson(d, key, val) {
    const root = d.sec('OBJECTS').recs.find((r) => typ(r) === 'DICTIONARY'); if (!root) throw new Error('This DXF has no root dictionary');
    const rh = handleOf(root);
    for (let i = 1; i < root.length - 1; i++) if (root[i][0] === 3 && root[i][1] === key) { const h = root[i + 1][1]; removeHandles(d, new Set([h])); break; }
    const js = Array.from(JSON.stringify(val)), chunks = []; for (let i = 0; i < js.length; i += 250) chunks.push(js.slice(i, i + 250).join(''));
    const h = d.newHandle(), x = [[0, 'XRECORD'], [5, h], [102, '{ACAD_REACTORS'], [330, rh], [102, '}'], [330, rh], [100, 'AcDbXrecord'], [280, I(1)], ...chunks.map((c) => [1, c])];
    const O = d.sec('OBJECTS').recs, r2 = O.find((r) => typ(r) === 'DICTIONARY'); r2.push([3, key], [350, h]); // (the section's records read again: a removal makes a new list)
    O.splice(O.indexOf(r2) + 1, 0, x); d.index();
  }
  /** The JSON value a DXF keeps under key in its root dictionary, or null. */
  function jsonOf(text, key) {
    if (typeof text !== 'string' || text.indexOf(key) < 0) return null;
    try {
      const d = new (TPL().Doc)(text), O = d.sec('OBJECTS').recs, root = O.find((r) => typ(r) === 'DICTIONARY'); if (!root) return null;
      let h = null; for (let i = 1; i < root.length - 1; i++) if (root[i][0] === 3 && root[i][1] === key) h = root[i + 1][1];
      const x = h && d.byHandle.get(h); if (!x) return null;
      return JSON.parse(all(x, 1).join(''));
    } catch (e) { return null; }
  }
  /** The look a seed carries (its 'G-ESAA_LOOK'), or null. */
  function lookOf(text) { return jsonOf(text, 'G-ESAA_LOOK'); }
  /* (templates, Round trip) A template downloaded to be edited in AutoCAD carries where it came from (the XRECORD 'G-ESAA_TEMPLATE': { v: 1, kind:
     'company' | 'client', id (a client template's), name, at }), so that loading it back knows which template it replaces. AutoCAD keeps a root
     dictionary's XRECORDs when it saves the DXF. */
  function tagTemplate(text, info) {
    const T = TPL(), d = new T.Doc(text), o = info || {};
    putJson(d, 'G-ESAA_TEMPLATE', { v: 1, kind: o.kind === 'client' ? 'client' : 'company', id: o.kind === 'client' ? String(o.id || '') : '', name: String(o.name || '').slice(0, 80), at: o.at || new Date().toISOString() });
    return d.text();
  }
  /** (templates, Round trip) A template loaded back from AutoCAD tidied as a client's DXF is (dxftpl's clean, an insert's attributes owned by it, a
      layer an entity names added): → { text, log } */
  function tidy(text) { const { d, log } = load(text); return { text: d.text(), log }; }
  function templateTag(text) { const t = jsonOf(text, 'G-ESAA_TEMPLATE'); return t && typeof t === 'object' && !Array.isArray(t) && (t.kind === 'company' || t.kind === 'client') ? t : null; }

  /* ---------------- make ---------------- */
  const sheetByName = (d, n) => TPL().structure(d).layouts.find((L) => L.name === n) || null;
  /** The fields of one sheet as they are now (the same ids as the digest's: the same handles). */
  function fieldsNow(d, name) { const S = TPL().structure(d), L = S.layouts.find((x) => x.name === name); if (!L) return []; return sheetFields(d, S, L, sheetScan(d, S, L)); }
  function sheetNow(d, name) { const S = TPL().structure(d), L = S.layouts.find((x) => x.name === name); return L ? sheetOf(d, S, L, sheetScan(d, S, L)) : null; }
  /** The as-plan seed and the CEF seed from the client's DXF and the review's choices (map: see proposal()). → { plan, cef, look, notes } */
  function make(text, map, dg) {
    const rd = read(text); if (!rd.ok) throw new Error(rd.error);
    dg = dg || digest(rd.text, map && map.file);
    map = { ...proposal(dg), ...(map || {}) };
    const notes = [], made = new Date().toISOString();
    const plan = map.finished ? makeFromPlan(rd.text, map, dg, notes, made) : makePlan(rd.text, map, dg, notes, made);
    const cef = map.cef ? makeCef(rd.text, map, dg, notes, made) : null;
    return { plan: plan.text, cef: cef ? cef.text : null, look: plan.look, cefLook: cef ? cef.look : null, notes };
  }
  const lookBase = (map, dg, made) => {
    const lw = {}; for (const k of LW_KEYS) { const v = map.look && map.look.lw ? +map.look.lw[k] : NaN; if (Number.isFinite(v) && v >= 0 && v <= 211) lw[k] = LWS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 0); }
    const sc = +(map.look && map.look.scale); return { v: 1, name: String(map.name || dg.file || 'Client template').slice(0, 80), made, from: dg.file, text: { style: 'G-ESAA TEXT', scale: Number.isFinite(sc) && sc > 0.2 && sc < 5 ? +sc.toFixed(2) : 1 }, lw };
  };
  function makePlan(text, map, dg, notes, made) {
    const T = TPL(), { d } = load(text); let S = T.structure(d);
    const planName = map.plan, kmName = map.keymap && map.keymap !== map.plan ? map.keymap : '', keep = (map.keep || []).filter((n) => n !== planName && n !== kmName && S.layouts.some((L) => L.name === n));
    if (!planName || !S.layouts.some((L) => L.name === planName)) throw new Error('Choose the plan sheet of the template');
    const kept = [planName, ...(kmName ? [kmName] : []), ...keep];
    // 1. model space: the sample drawing removed (what the review keeps stays: a legend, a table)
    const mU = UNIT_M[parseInt(hdr(d, '$INSUNITS', 70) || '0', 10)] || 1, keepG = new Set((map.model && map.model.keep) || []);
    const groups = modelGroups(d, S, [], mU).groups, keepRecs = new Set(groups.filter((g) => keepG.has(g.id)).flatMap((g) => g.recs));
    const gone = new Set(modelEnts(S).filter((r) => !keepRecs.has(r) && !/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r))).map(handleOf).filter(Boolean));
    if (gone.size) removeHandles(d, gone);
    // 2. the fields of every sheet kept (the plan sheet's before its key map copy is made, so the copy has them)
    const choose = (f) => (map.fields && Object.prototype.hasOwnProperty.call(map.fields, f.id) ? map.fields[f.id] : f.key || (f.placeholder ? '-' : ''));
    const lists = kept.map((n) => ({ n, list: fieldsNow(d, n) })), lift = new Set();
    for (const { list } of lists) for (const f of list) if (f.kind === 'btext' && choose(f) !== '') lift.add(f.handle);
    for (const { n, list } of lists) applyFields(d, sheetByName(d, n), list, choose, 'plan', lift);
    for (const h of lift) { const r = d.byHandle.get(h); if (r) setWords(r, ''); } // (the title block's own value text: now on each sheet)
    const style = 'G-ESAA TEXT';
    for (const n of [planName, ...(kmName ? [kmName] : [])]) { const sh = sheetNow(d, n); if (map.exported !== false && sh) addExported(d, sheetByName(d, n), sh, style); }
    // 3. the plan sheet's map viewport square and at 1:1100 on its paper; the key map's square
    const shP = sheetNow(d, planName); if (!shP || !shP.main) throw new Error(`The sheet ${planName} has no viewport for the map: choose another plan sheet`);
    const vp = squareVp(d, shP.main, shP.mm, true);
    if (kmName) { const shK = sheetNow(d, kmName); if (shK && shK.main) squareVp(d, shK.main, shK.mm, false); else notes.push(`The key map sheet ${kmName} has no viewport: the plan sheet is copied for it`); }
    // 4. the sheets: the others removed, the plan sheet GEO, the key map KEYMAP (a copy of GEO when none), the active sheet not GEO when another can be
    S = T.structure(d);
    const names = new Set(kept), others = S.layouts.filter((L) => L.name !== 'Model' && !names.has(L.name));
    if (others.some((L) => isActive(S, L))) makeActive(d, kept.find((n) => n !== planName) || planName);
    for (const L of T.structure(d).layouts.filter((x) => x.name !== 'Model' && !names.has(x.name))) removeLayout(d, T.structure(d), L);
    const taken = (n) => T.structure(d).layouts.some((L) => L.name.toUpperCase() === n.toUpperCase());
    // (a kept sheet of a name the builder fills or moves the tables of as the company's: renamed, so the client's sheet stays as the client made it)
    for (const n of keep) if (/^(GEO( \(\d+\))?|KEYMAP( \(\d+\))?|LEGENDS?( \(\d+\))?|PMI|ROW AREA COVERAGE)$/i.test(n)) { let k = 1; while (taken(`${n} (CLIENT${k > 1 ? ` ${k}` : ''})`)) k++; renameLayout(d, sheetByName(d, n), `${n} (CLIENT${k > 1 ? ` ${k}` : ''})`); }
    if (planName !== 'GEO') { if (taken('GEO')) renameLayout(d, sheetByName(d, 'GEO'), 'GEO (CLIENT)'); renameLayout(d, sheetByName(d, planName), 'GEO'); }
    if (kmName) { if (kmName !== 'KEYMAP') { if (taken('KEYMAP')) renameLayout(d, sheetByName(d, 'KEYMAP'), 'KEYMAP (CLIENT)'); renameLayout(d, sheetByName(d, kmName), 'KEYMAP'); } }
    else { if (taken('KEYMAP')) renameLayout(d, sheetByName(d, 'KEYMAP'), 'KEYMAP (CLIENT)'); cloneSheet(d, 'GEO', 'KEYMAP'); }
    S = T.structure(d);
    if (isActive(S, S.layouts.find((L) => L.name === 'GEO'))) { const alt = S.layouts.find((L) => L.name !== 'Model' && L.name !== 'GEO' && L.name !== 'KEYMAP') || S.layouts.find((L) => L.name === 'KEYMAP'); if (alt) makeActive(d, alt.name); }
    S = T.structure(d); S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => (a.name === 'GEO' ? -2 : a.name === 'KEYMAP' ? -1 : int(a.rec, 71, 0)) - (b.name === 'GEO' ? -2 : b.name === 'KEYMAP' ? -1 : int(b.rec, 71, 0))).forEach((L, k) => setSub(L.rec, 'AcDbLayout', 71, I(k + 1)));
    // 5. the look: styles, symbols, layers, the XRECORD; model space in metres
    const st = applyStyles(d, map), look = lookBase(map, dg, made);
    if (st.bold) look.text.bold = 'G-ESAA TEXT BOLD';
    if (st.main) look.text.font = st.main.face || st.main.font;
    look.blocks = applySymbols(d, map, style, notes);
    look.layers = applyLayers(d, map);
    const shG = sheetNow(d, 'GEO');
    look.sheet = { name: 'GEO', unit: shG.units, mm: shG.mm, paper: shG.paper, frame: shG.frame, vp: vp.box, side: vp.side, cell: vp.cell, scale: 1100 };
    putLook(d, look);
    setHdr(d, '$INSUNITS', 70, I(6)); setHdr(d, '$MEASUREMENT', 70, I(1));
    T.clean(d);
    return { text: d.text(), look };
  }
  /** (templates, Digester) Pictures (IMAGE) no longer drawn: their IMAGEDEF objects (and so the dictionary's entries) removed. */
  function dropImageDefs(d) {
    const used = new Set(); for (const s of ['ENTITIES', 'BLOCKS']) for (const r of d.sec(s).recs) if (typ(r) === 'IMAGE') used.add(get(r, 340));
    const gone = new Set(d.sec('OBJECTS').recs.filter((r) => typ(r) === 'IMAGEDEF' && !used.has(handleOf(r))).map(handleOf).filter(Boolean));
    if (gone.size) removeHandles(d, gone);
    return gone.size;
  }
  /** (templates, Digester) The as-plan template from a client's finished plan: their drawing copied with the plan itself removed (the app draws its
      own), each kept sheet under the builder's name for its role (the first plan sheet GEO, the one the app copies for each part of the route; the
      others left out; the key map KEYMAP; the vicinity map VICINITY MAP, its picture removed; the legend LEGENDS; the PMI and ROW tables' sheets
      PMI and ROW AREA COVERAGE, their values the app's fields; the cover TITLE; the contents TOC; any other kept as it is), the project's
      details as fields on every sheet kept, the look learned from their drawing. */
  function makeFromPlan(text, map, dg, notes, made) {
    const T = TPL(), { d } = load(text); let S = T.structure(d);
    const P = dg.plan || {}, roles = { ...(P.roles || {}), ...(map.roles || {}) }, have = new Set(S.layouts.filter((L) => L.name !== 'Model').map((L) => L.name));
    const byTab = dg.sheets.slice().sort((a, b) => a.tab - b.tab).map((s) => s.name).filter((n) => have.has(n));
    const planName = map.plan && roles[map.plan] === 'plan' && have.has(map.plan) ? map.plan : byTab.find((n) => roles[n] === 'plan');
    if (!planName) throw new Error('Choose the plan sheet of the template (a sheet whose role is "Plan sheet")');
    // which sheet becomes which (the first of each role takes the builder's name; another plan sheet is left out: the app adds its own)
    const to = new Map(), used = new Set(), own = new Set();
    for (const n of byTab) {
      const r = roles[n] || 'other'; if (r === 'out' || r === 'cef' || (r === 'plan' && n !== planName)) continue;
      const nm = r === 'plan' ? 'GEO' : (ROLE.get(r) || {}).name || '';
      if (nm && !used.has(nm)) { to.set(n, nm); used.add(nm); } else { to.set(n, n); own.add(n); }
    }
    const kept = [...to.keys()], left = byTab.filter((n) => !to.has(n));
    if (left.length) notes.push(`Sheets left out: ${left.join(', ')}${left.some((n) => roles[n] === 'plan') ? ' (the app adds a plan sheet for each part of the route, copied from GEO)' : ''}`);
    // 1. model space: the plan removed (its route, what is drawn round it, the vicinity map's picture); what the kept sheets show stays (legend, tables)
    const mU = UNIT_M[parseInt(hdr(d, '$INSUNITS', 70) || '0', 10)] || 1, keepG = new Set((map.model && map.model.keep) || []);
    const groups = modelGroups(d, S, [], mU).groups, keepRecs = new Set(groups.filter((g) => keepG.has(g.id)).flatMap((g) => g.recs));
    const tBoxes = [P.pmi && !P.pmi.space ? P.pmi.box : null, P.row && !P.row.space ? P.row.box : null].filter(Boolean); // (a table drawn close to the route, in its group: kept by its box)
    if (tBoxes.length) for (const g of groups) if (!keepG.has(g.id)) for (const r of g.recs) { let b = null; try { b = T.drawnBox(S, r); } catch (e) { b = null; } if (b && tBoxes.some((q) => b[0] >= q[0] && b[2] <= q[2] && b[1] >= q[1] && b[3] <= q[3])) keepRecs.add(r); }
    const gone = new Set(modelEnts(S).filter((r) => !keepRecs.has(r) && !/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r))).map(handleOf).filter(Boolean));
    const vicPics = (P.pics || []).filter((q) => q.sheet && roles[q.sheet] === 'vicinity' && to.has(q.sheet)).map((q) => q.handle);
    for (const h of vicPics) gone.add(h);
    if (gone.size) removeHandles(d, gone);
    const nDefs = dropImageDefs(d);
    if ((P.pics || []).length) notes.push(`The vicinity map's picture removed (${(P.pics || []).filter((q) => !q.sheet).length + vicPics.length} picture(s)${nDefs ? `, ${nDefs} image file link(s)` : ''}): the app draws its own vicinity map`);
    // 2. the tables the app fills: their values as the app's fields (a value cell emptied where the builder fills it: PROPOSED HDD…)
    let nTok = 0;
    for (const [h, tok] of Object.entries(map.tables || {})) {
      const r = d.byHandle.get(h); if (!r || tok === '-' || !/^(TEXT|MTEXT)$/.test(typ(r))) continue;
      if (!tok) { setWords(r, ''); continue; }
      const m = /^(.*\D)?\s*\d[\d.,]*\s*$/.exec(plainText(r)), pre = /^ROW_(MUNICIPALITIES|BARANGAYS)$/.test(tok) && m && m[1] ? m[1] : '';
      setWords(r, `${pre}@@${tok}@@`); nTok++;
    }
    if (nTok) notes.push(`Tables: ${nTok} value(s) the app fills (PMI, ROW)`);
    // 3. the fields of every sheet kept (the plan sheet's before its key map copy is made, so a copy has them); the cross fields of the digest
    const choose = (f) => (map.fields && Object.prototype.hasOwnProperty.call(map.fields, f.id) ? map.fields[f.id] : f.key || (f.placeholder ? '-' : ''));
    const crossOf = (n) => ((dg.sheets.find((s) => s.name === n) || { fields: [] }).fields || []).filter((f) => f.cross);
    const lists = kept.map((n) => ({ n, list: [...fieldsNow(d, n), ...crossOf(n)] })), lift = new Set();
    for (const { list } of lists) for (const f of list) if (f.kind === 'btext' && choose(f) !== '') lift.add(f.handle);
    for (const { n, list } of lists) applyFields(d, sheetByName(d, n), list, choose, 'plan', lift);
    for (const h of lift) { const r = d.byHandle.get(h); if (r) setWords(r, ''); }
    const style = 'G-ESAA TEXT', kmName = [...to].find(([, v]) => v === 'KEYMAP'), vicName = [...to].find(([, v]) => v === 'VICINITY MAP');
    for (const n of [planName, ...(kmName ? [kmName[0]] : [])]) { const sh = sheetNow(d, n); if (map.exported !== false && sh) addExported(d, sheetByName(d, n), sh, style); }
    // 4. the viewports the builder aims: the plan sheet's square at 1:1,100 on its paper; the key map's and the vicinity map's square
    const shP = sheetNow(d, planName); if (!shP || !shP.main) throw new Error(`The sheet ${planName} has no viewport for the map: choose another plan sheet`);
    const vp = squareVp(d, shP.main, shP.mm, true);
    for (const x of [kmName, vicName]) if (x) { const sh = sheetNow(d, x[0]); if (sh && sh.main) squareVp(d, sh.main, sh.mm, false); else notes.push(`The sheet ${x[0]} has no viewport: the app's ${x[1] === 'KEYMAP' ? 'key map' : 'vicinity map'} cannot be shown on it`); }
    if (shP.vps.length > 1) notes.push(`The plan sheet's other viewport(s) (${shP.vps.length - 1}) show model space where the client's route was: now empty (change them in AutoCAD if needed)`);
    { const S0 = T.structure(d), L0 = S0.layouts.find((x) => x.name === planName); if (L0 && sheetEnts(d, S0, L0).some((r) => /^(TEXT|MTEXT)$/.test(typ(r)) && /BILL OF QUANTIT|\bB\.?O\.?Q\b/i.test(plainText(r)))) notes.push(`The plan sheet ${planName} has a BOQ table of its own (their project's figures): the app adds its own on each GEO sheet; take theirs off in AutoCAD (Download this template, Load it back)`); }
    // 5. the sheets: the others removed; each kept one renamed (through a name of its own first: two sheets may swap names); the cover the active one
    S = T.structure(d);
    const keepSet = new Set(kept), act = S.layouts.find((L) => L.name !== 'Model' && isActive(S, L));
    if (!act || !keepSet.has(act.name) || act.name === planName) { const alt = kept.find((n) => to.get(n) === 'TITLE') || kept.find((n) => n !== planName) || planName; makeActive(d, alt); }
    for (const L of T.structure(d).layouts.filter((x) => x.name !== 'Model' && !keepSet.has(x.name))) removeLayout(d, T.structure(d), L);
    kept.forEach((n, i) => renameLayout(d, sheetByName(d, n), `~G-ESAA ${i}`));
    const BUILT = /^(GEO|KEYMAP|VICINITY MAP|LEGENDS?|PMI|ROW AREA COVERAGE|TITLE|TOC)( \(\d+\))?$/i, final = new Set();
    kept.forEach((n, i) => { let nm = to.get(n); if (own.has(n) && BUILT.test(n)) { let k = 1; while (final.has(`${n} (CLIENT${k > 1 ? ` ${k}` : ''})`.toUpperCase())) k++; nm = `${n} (CLIENT${k > 1 ? ` ${k}` : ''})`; notes.push(`The sheet ${n} kept as ${nm} (the plan uses its name for its own)`); } final.add(nm.toUpperCase()); renameLayout(d, sheetByName(d, `~G-ESAA ${i}`), nm); });
    if (!kmName) { cloneSheet(d, 'GEO', 'KEYMAP'); const shK = sheetNow(d, 'KEYMAP'); if (shK && shK.main) squareVp(d, shK.main, shK.mm, false); notes.push('No key map sheet: the plan sheet is copied for it'); }
    S = T.structure(d);
    if (isActive(S, S.layouts.find((L) => L.name === 'GEO'))) { const alt = S.layouts.find((L) => L.name !== 'Model' && L.name !== 'GEO'); if (alt) makeActive(d, alt.name); }
    // the tab order the plan will have (TITLE, TOC, LEGENDS, VICINITY MAP, ROW AREA COVERAGE, KEYMAP, GEO, PMI), then the client's other sheets
    const WANT = ['TITLE', 'TOC', 'LEGENDS', 'VICINITY MAP', 'ROW AREA COVERAGE', 'KEYMAP', 'GEO', 'PMI'], rank = (L) => (WANT.includes(L.name) ? WANT.indexOf(L.name) : 100 + int(L.rec, 71, 0));
    S = T.structure(d); S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => rank(a) - rank(b)).forEach((L, k) => setSub(L.rec, 'AcDbLayout', 71, I(k + 1)));
    // 6. the look: styles, symbols, layers, the XRECORD (with each kind's look learned from the drawing); model space in metres
    const st = applyStyles(d, map), look = lookBase(map, dg, made);
    if (st.bold) look.text.bold = 'G-ESAA TEXT BOLD';
    if (st.main) look.text.font = st.main.face || st.main.font;
    look.blocks = applySymbols(d, map, style, notes);
    look.layers = applyLayers(d, map);
    const shG = sheetNow(d, 'GEO');
    look.sheet = { name: 'GEO', unit: shG.units, mm: shG.mm, paper: shG.paper, frame: shG.frame, vp: vp.box, side: vp.side, cell: vp.cell, scale: 1100 };
    look.from = { finished: true, scale: P.planScale || null, sheets: Object.fromEntries([...to].map(([a, b]) => [b, a])) };
    if (map.look && map.look.kinds) look.kinds = map.look.kinds;
    putLook(d, look);
    setHdr(d, '$INSUNITS', 70, I(6)); setHdr(d, '$MEASUREMENT', 70, I(1));
    T.clean(d);
    return { text: d.text(), look };
  }
  function makeCef(text, map, dg, notes, made) {
    const T = TPL(), { d } = load(text); let S = T.structure(d), name = map.cef;
    if (!S.layouts.some((L) => L.name === name)) throw new Error(`The CEF sheet ${name} is not in the template`);
    // model space empty; the sheet's fields (the CEF's tokens); the Exported by line
    const gone = new Set(modelEnts(S).filter((r) => !/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r))).map(handleOf).filter(Boolean)); if (gone.size) removeHandles(d, gone);
    const choose = (f) => (map.fields && Object.prototype.hasOwnProperty.call(map.fields, f.id) ? map.fields[f.id] : f.key || (f.placeholder ? '-' : ''));
    const list = fieldsNow(d, name), lift = new Set(list.filter((f) => f.kind === 'btext' && choose(f) !== '').map((f) => f.handle));
    applyFields(d, sheetByName(d, name), list, choose, 'cef', lift);
    for (const h of lift) { const r = d.byHandle.get(h); if (r) setWords(r, ''); }
    const sh0 = sheetNow(d, name); if (!sh0 || !sh0.main) throw new Error(`The CEF sheet ${name} has no viewport for the drawing`);
    if (map.exported !== false) addExported(d, sheetByName(d, name), sh0, 'G-ESAA TEXT');
    // its other viewports removed (model space is empty); the only sheet, the active one, named CEF
    const sh = sheetNow(d, name), others = sh.vps.slice(1).map((v) => v.handle).filter(Boolean); if (others.length) removeHandles(d, new Set(others));
    makeActive(d, name);
    for (const L of T.structure(d).layouts.filter((x) => x.name !== 'Model' && x.name !== name)) removeLayout(d, T.structure(d), L);
    if (name !== 'CEF') renameLayout(d, sheetByName(d, name), 'CEF');
    setSub(sheetByName(d, 'CEF').rec, 'AcDbLayout', 71, I(1));
    purgeBlocks(d);
    const st = applyStyles(d, map), look = lookBase(map, dg, made);
    if (st.bold) look.text.bold = 'G-ESAA TEXT BOLD';
    if (st.main) look.text.font = st.main.face || st.main.font;
    const shC = sheetNow(d, 'CEF'), v = shC.vps[0];
    look.sheet = { name: 'CEF', unit: shC.units, mm: shC.mm, paper: shC.paper, frame: shC.frame, vp: v.box.map((q) => +q.toFixed(4)) };
    putLook(d, look);
    T.clean(d);
    return { text: d.text(), look };
  }

  /* ---------------- checks ---------------- */
  /** tools/dxf-seed/check_dxf.py's structural check, in JS: sections, unique handles, $HANDSEED above every handle, owners, entities in their
      space, layers / styles / line types / blocks that exist, pointers that resolve, attribute sequences, block entities' owners. → [[kind, what]] */
  function structCheck(text) {
    const T = TPL(), out = []; let d;
    try { d = new T.Doc(text); } catch (e) { return [['not readable', e.message]]; }
    for (const n of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) if (!d.sec(n)) out.push(['section missing', n]);
    if (!d.tail.some((p) => p[0] === 0 && p[1] === 'EOF')) out.push(['no EOF', '']);
    const S = T.structure(d), seen = new Map(), by = new Map();
    for (const s of d.secs) if (s.recs) for (const r of s.recs) { const h = handleOf(r); if (h) { seen.set(h, (seen.get(h) || 0) + 1); by.set(h, r); } }
    for (const [h, k] of seen) if (k > 1) out.push(['duplicate handle', h]);
    const hs = d.headerVar('$HANDSEED'), mx = Math.max(0, ...[...seen.keys()].map((h) => parseInt(h, 16) || 0));
    if (!hs || parseInt(hs[1], 16) <= mx) out.push(['$HANDSEED not above the largest handle', `${hs ? hs[1] : '-'} <= ${mx.toString(16).toUpperCase()}`]);
    const tables = { LAYER: new Set(), STYLE: new Set(), LTYPE: new Set() };
    for (const r of S.T) if (tables[typ(r)]) tables[typ(r)].add(String(get(r, 2)));
    const ltU = new Set([...tables.LTYPE].map((x) => x.toUpperCase())), model = S.brByName.get('*Model_Space'), paper = S.brByName.get('*Paper_Space');
    for (const n of ['BLOCKS', 'ENTITIES', 'OBJECTS']) for (const r of d.sec(n).recs) {
      const t = typ(r), o = owner(r); if (t === 'BLOCK' || t === 'ENDBLK') continue;
      if (o && o !== '0' && !by.has(o)) out.push(['owner missing', `${t} ${get(r, 5)} -> ${o}`]);
      if (n === 'ENTITIES' && !/^(ATTRIB|SEQEND|VERTEX)$/.test(t)) { const want = paperFlag(r) ? get(paper, 5) : get(model, 5); if (o !== want) out.push(['entity owner is not its space', `${t} ${get(r, 5)} owner ${o}`]); }
      if (n !== 'OBJECTS') {
        const L = get(r, 8); if (L != null && !tables.LAYER.has(String(L))) out.push(['layer missing', `${t} ${get(r, 5)} ${L}`]);
        if (/^(TEXT|MTEXT|ATTRIB|ATTDEF)$/.test(t)) { const s = get(r, 7); if (s && !tables.STYLE.has(String(s))) out.push(['text style missing', `${t} ${get(r, 5)} ${s}`]); }
        const lt = get(r, 6); if (lt && !ltU.has(String(lt).toUpperCase()) && !/^(BYLAYER|BYBLOCK|CONTINUOUS)$/i.test(lt)) out.push(['line type missing', `${t} ${get(r, 5)} ${lt}`]);
        if (t === 'INSERT' && !S.blocks.has(get(r, 2))) out.push(['block missing', `${get(r, 5)} ${get(r, 2)}`]);
      }
      for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (HANDLE_CODES(c) && v !== '0' && v !== '' && !by.has(v)) out.push(['pointer to nothing', `${t} ${get(r, 5)} code ${c} -> ${v}`]); }
    }
    for (const n of ['BLOCKS', 'ENTITIES']) {
      const R = d.sec(n).recs;
      R.forEach((r, k) => {
        if (typ(r) === 'INSERT' && int(r, 66, 0) === 1) { let j = k + 1; while (j < R.length && typ(R[j]) === 'ATTRIB') { if (owner(R[j]) !== get(r, 5)) out.push(['attribute not owned by its insert', get(R[j], 5)]); j++; } if (j >= R.length || typ(R[j]) !== 'SEQEND') out.push(['attributes not closed by SEQEND', get(r, 5)]); }
        if (typ(r) === 'ATTRIB' && (k === 0 || !/^(INSERT|ATTRIB)$/.test(typ(R[k - 1])))) out.push(['stray ATTRIB', get(r, 5)]);
      });
    }
    for (const [name, b] of S.blocks) {
      if (!b.end) out.push(['block without ENDBLK', name]);
      const own = S.brByName.get(name); for (const r of b.ents) if (!/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r)) && owner(r) !== (own ? get(own, 5) : null)) out.push(['block entity owner wrong', `${name} ${typ(r)} ${get(r, 5)}`]);
    }
    return out;
  }
  /** The app's test for a plan template (app.js seedOk): @@ fields and a GEO sheet. */
  const seedOk = (text) => typeof text === 'string' && /\bSECTION\b/.test(text.slice(0, 4000)) && /@@\w+@@/.test(text) && /\nGEO\r?\n/.test(text);
  /** The CEF seed's sheet, for the CEF's printer: its paper, frame, the drawing area (its main viewport), its tokens, the look. */
  function cefSheet(text) {
    const T = TPL(), d = new T.Doc(text), S = T.structure(d), L = S.layouts.find((x) => x.name === 'CEF'); if (!L) return null;
    const scan = sheetScan(d, S, L), sh = sheetOf(d, S, L, scan), tokens = [];
    for (const r of sheetEnts(d, S, L)) if (/^(TEXT|MTEXT)$/.test(typ(r))) for (const m of textOf(r).match(/@@\w+@@/g) || []) tokens.push({ token: m.slice(2, -2), handle: handleOf(r), type: typ(r), x: num(r, 10, 0), y: num(r, 20, 0), h: num(r, 40, 0) });
    const v = sh.vps[0];
    return { paper: sh.paper, unit: sh.units, mm: sh.mm, frame: sh.frame, vp: v ? v.box.map((q) => +q.toFixed(4)) : null, vpHandle: v ? v.handle : null, tokens, look: lookOf(text) };
  }
  /** Made-up values for every token (the check's plan, and the tests): DEMO names, nothing real. */
  function madeUpValues(look) {
    const v = { PROJECT_TYPE: 'DEMO FIBER PROJECT', LINK: 'DEMO FIBER PROJECT', LOCATION: 'DEMO CITY', SITE_NAME: 'DEMOSITE MIN9001', SITE_ID: 'PLA-9001', SERIAL: 'SN-9001', PROJECT_CODE: 'DEMO-CODE-01', DWG_NO: 'DWG-9001', ISSUE_NO: '0', REV: '0',
      PREPARED_BY: 'DEMO DRAFTER', DRAWN_BY: 'DEMO DRAFTER', CHECKED_BY: 'DEMO CHECKER', APPROVED_BY: 'DEMO APPROVER', CLIENT: 'DEMO CLIENT', COMPANY_NAME: 'DEMO CONTRACTOR', SHEET_TITLE: { KEYMAP: 'KEY MAP', '*': 'ROUTE PLAN' }, PLAN_KIND: 'AFI PLAN',
      COORDINATES: '7%%d06\'00.00"N 125%%d36\'00.00"E', EXPORTED_BY: 'Exported by DEMO USER · G-eSAA', TITLE_CABLE: 'PROPOSED 12C FIG-8 FOC', NETWORK: '' };
    if (look && look.sheet && look.sheet.cell) v.SCALE = { '*': '1 : 1,100 METERS', KEYMAP: '', 'VICINITY MAP': '' };
    // ((templates, Digester) the tables a finished plan's template fills: its PMI and ROW figures, made up)
    Object.assign(v, { PMI_TOTAL_CABLE_LENGTH: '463.0m', PMI_AERIAL_CABLE_LENGTH: '463.0m', PMI_UG_CABLE_LENGTH: '0.0m', PMI_PROPOSED_POLE: '10', PMI_EXISTING_GT_POLE: '2', PMI_RTA_CONVERGE: '0',
      PMI_RTA_LOCAL_COOP: '0', PMI_RTA_OTHER_PLDT: '0', PMI_FIBER_TERMINATION: '0', PMI_HYBRID_CLOSURE: '2', ROW_MUNICIPALITY_1: 'DEMO MADE-UP CITY', ROW_MUNICIPALITY_2: '', ROW_BARANGAY_1: 'DEMO BRGY NORTH',
      ROW_BARANGAY_2: 'DEMO BRGY SOUTH', ROW_BARANGAY_3: '', ROW_BARANGAY_4: '', ROW_BARANGAY_5: '', ROW_BARANGAY_6: '', ROW_BARANGAY_7: '', ROW_MUNICIPALITIES: '1', ROW_BARANGAYS: '2' });
    return v;
  }
  /** A made-up plan (12 poles along a made-up street near Davao, a tower, a closure and its loop, guys, a grounding, a NAP, arms, an existing pole, an
      ODC, an OLT): the check's plan, drawn on the seed by dxftpl.js as the app would draw a real one. */
  function madeUpJob(look) {
    const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
    const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
    const set = (id, o) => Object.assign(pts.find((p) => p.id === id), o);
    set('s2', { closure: true, closureId: 'CL-01', mloop: true, mloopM: 15 }); set('s3', { guy: 'side guy', ground: true }); set('s4', { nap: true, napId: 'NAP-01', napType: 'NAP 1x8' });
    set('s6', { armType: 'single arm', guy: 'side guy + head guy' }); set('s8', { closure: true, closureOld: true, closureId: 'CL-02', mloop: true, mloopM: 10 }); set('s9', { status: 'Existing', label1: '', telco: true }); set('s10', { status: 'Existing', label1: '', mat: 'CC' });
    const site = { id: 't1', poleId: 'DEMO-TWR', el: 'Site', status: 'Existing', siteName: 'DEMOSITE MIN9001', plaId: 'PLA-9001', E: E0 - 60, N: N0 + 30, lat: 7.1 + 30 / 110574, lon: 125.6 - 60 / 110400 };
    const olt = { id: 'l1', poleId: 'DEMO-OLT', el: 'Site', siteKind: 'OLT', status: 'Existing', siteName: 'DEMO OLT MIN9002', E: E0 + 120, N: N0 + 150, lat: 7.1 + 150 / 110574, lon: 125.6 + 120 / 110400 };
    const hh = { id: 'h1', poleId: 'HH-01', el: 'Handhole', status: 'Proposed', E: E0 + 5 * 36 + 20, N: N0 + 7 * 36, lat: 7.1 + 7 * 36 / 110574, lon: 125.6 + (5 * 36 + 20) / 110400 };
    const all2 = [site, ...pts, olt, hh], spans = [{ ia: 't1', ib: 's1', a: [site.E, site.N], b: P[0], len: 67, lenW: 67, cable: 'F12' }, ...P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12' }))];
    const cell = look && look.sheet && look.sheet.cell ? look.sheet.cell : 440;
    return { pts: all2, spans, runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: [[site.E, site.N], ...P] }],
      roads: [{ cls: 'minor', hw: 'residential', name: 'DEMO STREET', pts: [[E0 - 80, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 8 * 36]] }],
      photos: {}, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'num', markNum: true, cabLabels: true, cabPer: 3, cell, viewH: cell, values: madeUpValues(look), date: new Date('2026-11-20T08:00:00Z') };
  }
  /** What make() made, checked: the app takes the seed, the builder draws a made-up plan on it, every field is placed and filled, the structure is
      sound, the CEF seed has its sheet, tokens and drawing area. → { ok, problems: [plain words], notes, tokens, built: { text, report } } */
  function check(made, map, o) {
    const T = TPL(), problems = [], notes = [], add = (s) => problems.push(s);
    const plan = made.plan, look = made.look;
    if (!seedOk(plan)) add('The plan template is not one the app takes (no GEO sheet or no fields).');
    const tokens = [...new Set((plan.match(/@@\w+@@/g) || []).map((m) => m.slice(2, -2)))];
    const want = new Set(); for (const [id, c] of Object.entries((map && map.fields) || {})) if (c && c !== '-' && FIELD.has(c)) want.add(tokenOf(c, 'plan'));
    const missing = [...want].filter((t) => !tokens.includes(t)); if (missing.length) add(`Fields not placed on the plan sheet: ${missing.join(', ')}.`);
    let built = null;
    try { built = T.build(plan, madeUpJob(look)); } catch (e) { add(`The plan could not be drawn on this template: ${e.message}`); }
    if (built) {
      const left = (built.text.match(/@@\w+@@/g) || []); if (left.length) add(`Fields left unfilled in the made-up plan: ${[...new Set(left)].join(', ')}.`);
      const V = madeUpValues(look), filled = tokens.filter((t) => typeof V[t] === 'string' && V[t] && built.text.includes(V[t]));
      notes.push(`Made-up plan: ${built.report.sheets.length} GEO sheet(s), fields filled: ${filled.length ? filled.join(', ') : 'none'}`);
      let sp = structCheck(built.text);
      // ((templates, Round trip) o.softLayers: a template loaded back from AutoCAD may lack a layer the plan writes on (AutoCAD adds it when it opens the plan): said, not a problem)
      if (o && o.softLayers) { const lm = sp.filter(([k]) => k === 'layer missing'); if (lm.length) notes.push(`The plan writes on layers the template does not have (${[...new Set(lm.map((x) => String(x[1]).split(' ').pop()))].slice(0, 6).join(', ')}): AutoCAD adds them when it opens the plan.`); sp = sp.filter(([k]) => k !== 'layer missing'); }
      if (sp.length) add(`The made-up plan's DXF has ${sp.length} structure problem(s): ${sp.slice(0, 3).map((x) => x.join(' ')).join('; ')}.`);
      const S = T.structure(new T.Doc(built.text)), on0 = S.E.filter((r) => owner(r) === S.modelH && !paperFlag(r) && String(get(r, 8, '0')) === '0' && !/^(ATTRIB|SEQEND|VERTEX)$/.test(typ(r))).length;
      if (on0 > 3) notes.push(`${on0} things of the made-up plan on layer 0`);
    }
    const sp = structCheck(plan); if (sp.length) add(`The plan template has ${sp.length} structure problem(s): ${sp.slice(0, 3).map((x) => x.join(' ')).join('; ')}.`);
    let cef = null;
    if (made.cef) {
      const sc = structCheck(made.cef); if (sc.length) add(`The CEF template has ${sc.length} structure problem(s): ${sc.slice(0, 3).map((x) => x.join(' ')).join('; ')}.`);
      cef = cefSheet(made.cef);
      if (!cef) add('The CEF template has no CEF sheet.');
      else { if (!cef.vp) add('The CEF sheet has no drawing area (viewport).'); if (!cef.tokens.length) add('The CEF sheet has no fields.'); }
    }
    return { ok: !problems.length, problems, notes: [...(made.notes || []), ...notes], tokens, cef: cef ? { tokens: [...new Set(cef.tokens.map((t) => t.token))], vp: cef.vp, paper: cef.paper, unit: cef.unit } : null, built };
  }

  /* ---------------- the review's pictures: a sheet drawn by dxfpdf.js (its page operators) on a canvas ---------------- */
  /** Draws a page of GeDxfPdf.layoutPages (its PDF operators: paths, fills, texts in Helvetica, clips) on a 2D canvas context, fitted to w x h px.
      marks: [{ box: [x0, y0, x1, y1] (paper units of the sheet), n, color }] drawn on it (the fields found); paper: the sheet's window [x0, y0, x1, y1]
      and pt per paper unit, to place them (sheetWindow()). */
  function paint(ctx, page, w, h, o) {
    o = o || {};
    // the sheet's paper (its window, o.win) as dxfpdf.js fits it to its page; o.zoom: a part of it only (e.g. the title block), in paper units
    const W = o.win, pk = W ? Math.min(page.w / (W[2] - W[0]), page.h / (W[3] - W[1])) : 0, pox = W ? (page.w - (W[2] - W[0]) * pk) / 2 : 0, poy = W ? (page.h - (W[3] - W[1]) * pk) / 2 : 0;
    const toPt = (x, y) => [pox + (x - W[0]) * pk, poy + (y - W[1]) * pk];
    let vb = [0, 0, page.w, page.h];
    if (o.zoom && W) { const a = toPt(o.zoom[0], o.zoom[1]), b = toPt(o.zoom[2], o.zoom[3]); vb = [Math.max(0, Math.min(a[0], b[0])), Math.max(0, Math.min(a[1], b[1])), Math.min(page.w, Math.max(a[0], b[0])), Math.min(page.h, Math.max(a[1], b[1]))]; if (!(vb[2] - vb[0] > 1 && vb[3] - vb[1] > 1)) vb = [0, 0, page.w, page.h]; }
    const k = Math.min(w / (vb[2] - vb[0]), h / (vb[3] - vb[1])), ox = (w - (vb[2] - vb[0]) * k) / 2 - vb[0] * k, oy = (h - (vb[3] - vb[1]) * k) / 2;
    const cx = (x) => ox + x * k, cy = (y) => oy + (vb[3] - y) * k; // (page pt to canvas px)
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.setTransform(k, 0, 0, -k, ox, oy + vb[3] * k); // (PDF: y up)
    const st = [], g0 = () => ({ S: '#000', F: '#000', w: 1, d: null }); let g = g0(), path = null, tm = null, font = 'Helvetica', clipNext = false;
    const rgb = (a) => `rgb(${a.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
    for (const op of page.ops) {
      const toks = op.match(/\((?:\\.|[^\\)])*\)|\[[^\]]*\]|\/[^\s/\[\]()]+|[^\s()[\]/]+/g) || [], A = [];
      for (const t of toks) {
        if (/^[-+.\d]/.test(t) && !isNaN(+t)) { A.push(+t); continue; }
        if (t[0] === '(') { A.push(t.slice(1, -1).replace(/\\(.)/g, '$1')); continue; }
        if (t[0] === '[') { A.push(t.slice(1, -1).trim().split(/\s+/).filter(Boolean).map(Number)); continue; }
        if (t[0] === '/') { A.push(t.slice(1)); continue; }
        switch (t) {
          case 'q': ctx.save(); st.push({ ...g }); break;
          case 'Q': ctx.restore(); g = st.pop() || g0(); break;
          case 'RG': g.S = rgb(A.slice(-3)); break;
          case 'rg': g.F = rgb(A.slice(-3)); break;
          case 'w': g.w = A[A.length - 1]; break;
          case 'd': g.d = Array.isArray(A[0]) && A[0].length ? A[0] : null; break;
          case 'm': if (!path) path = new Path2DLike(); path.m(A[A.length - 2], A[A.length - 1]); break;
          case 'l': if (!path) path = new Path2DLike(); path.l(A[A.length - 2], A[A.length - 1]); break;
          case 'c': if (path) path.c(...A.slice(-6)); break;
          case 'h': if (path) path.h(); break;
          case 're': if (!path) path = new Path2DLike(); path.re(...A.slice(-4)); break;
          case 'W': case 'W*': clipNext = true; break;
          case 'n': if (path && clipNext) { ctx.beginPath(); path.draw(ctx); ctx.clip(); } path = null; clipNext = false; break;
          case 'S': if (path) { ctx.beginPath(); path.draw(ctx); ctx.strokeStyle = g.S; ctx.lineWidth = Math.max(g.w, 0.35 / k); ctx.setLineDash(g.d || []); ctx.stroke(); } path = null; break;
          case 'f': case 'F': case 'f*': if (path) { ctx.beginPath(); path.draw(ctx); ctx.fillStyle = g.F; ctx.fill(t === 'f*' ? 'evenodd' : 'nonzero'); } path = null; break;
          case 'BT': tm = [1, 0, 0, 1, 0, 0]; break;
          case 'Tf': font = { F1: 'Helvetica', F2: 'bold Helvetica', F3: 'italic Helvetica', F4: 'bold italic Helvetica' }[A[0]] || 'Helvetica'; break;
          case 'Tm': tm = A.slice(-6); break;
          case 'Tj': { const s = String(A[A.length - 1] || ''), m = tm || [1, 0, 0, 1, 0, 0]; ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); ctx.scale(1, -1); ctx.fillStyle = g.F; ctx.font = `${/bold/.test(font) ? 'bold ' : ''}${/italic/.test(font) ? 'italic ' : ''}1px Helvetica, Arial, sans-serif`; ctx.fillText(s, 0, 0); ctx.restore(); break; }
          default: break; // (ET, cm, Do: the pictures are left out)
        }
        A.length = 0;
      }
    }
    ctx.restore();
    if (o.marks && W) { // the fields found, numbered
      ctx.save();
      for (const mk of o.marks) {
        const a = toPt(mk.box[0], mk.box[3]), b = toPt(mk.box[2], mk.box[1]), x0 = cx(a[0]), y0 = cy(a[1]), x1 = cx(b[0]), y1 = cy(b[1]);
        ctx.strokeStyle = mk.color || '#d32f2f'; ctx.lineWidth = mk.on ? 3 : 1.5; ctx.strokeRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
        if (mk.n != null) { const fs = o.fs || 11; ctx.fillStyle = mk.color || '#d32f2f'; ctx.font = `bold ${fs}px sans-serif`; const t = String(mk.n); ctx.fillRect(x0 - 2, y0 - fs * 1.35, ctx.measureText(t).width + fs * 0.55, fs * 1.2); ctx.fillStyle = '#fff'; ctx.fillText(t, x0 + fs * 0.1, y0 - fs * 0.35); } // (o.fs: the number's size in canvas pixels)
      }
      ctx.restore();
    }
  }
  /** A path kept as its parts (the canvas's Path2D is not in every WebView), drawn when stroked, filled or clipped. */
  function Path2DLike() { this.p = []; }
  Path2DLike.prototype.m = function (x, y) { this.p.push(['m', x, y]); };
  Path2DLike.prototype.l = function (x, y) { this.p.push(['l', x, y]); };
  Path2DLike.prototype.c = function (a, b, c, d, e, f) { this.p.push(['c', a, b, c, d, e, f]); };
  Path2DLike.prototype.h = function () { this.p.push(['h']); };
  Path2DLike.prototype.re = function (x, y, w, h) { this.p.push(['m', x, y], ['l', x + w, y], ['l', x + w, y + h], ['l', x, y + h], ['h']); };
  Path2DLike.prototype.draw = function (ctx) { for (const q of this.p) { if (q[0] === 'm') ctx.moveTo(q[1], q[2]); else if (q[0] === 'l') ctx.lineTo(q[1], q[2]); else if (q[0] === 'c') ctx.bezierCurveTo(q[1], q[2], q[3], q[4], q[5], q[6]); else ctx.closePath(); } };
  /** The window of a sheet as dxfpdf.js fits it to its page (the layout's plot window, else what the sheet holds): to place marks on its picture. */
  function sheetWindow(text, name) {
    const T = TPL(), d = new T.Doc(text), S = T.structure(d), L = S.layouts.find((x) => x.name === name); if (!L) return null;
    const win = [num(L.rec, 48, 0), num(L.rec, 49, 0), num(L.rec, 140, 0), num(L.rec, 141, 0)];
    if (win[2] - win[0] > 1 && win[3] - win[1] > 1) return win;
    let b = null; for (const e of sheetEnts(d, S, L)) { if (typ(e) === 'VIEWPORT') continue; const q = T.drawnBox(S, e); if (q) b = boxU(b, q); }
    return b;
  }

  return { read, digest, proposal, make, check, structCheck, seedOk, lookOf, cefSheet, madeUpJob, madeUpValues, paint, sheetWindow, tokenOf, tagTemplate, templateTag, tidy,
    KINDS: KINDS.map((x) => ({ k: x.k, label: x.label, text: !!x.text, appH: x.appH || null })), ROLES: ROLES.map(([k, label, name]) => ({ k, label, name })),
    FIELDS, SYMBOLS: SYMBOLS.map((s) => ({ name: s.name, label: s.label, more: !!s.more, attrs: s.attrs || [], size: s.size })), LAYER_CLASSES: LAYER_CLASSES.map((c) => ({ k: c.k, label: c.label, lw: c.lw || '', layers: c.layers.slice() })), LW_KEYS, version: '7.15' };
}));
