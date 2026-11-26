/* G-eSAA (templates, CEF template kit): the company CEF template, checked and completed. The owner: "yes i want the CEF to be a dxf
   template same as the asplan", "Iwant this to be the standard for all my clients" and (templates, stage B) "downloading a template,
   editing it and loading it back; yes for admin". Plan style › Template (app.js) uses it:
   - check(text, T, generic, synth): can the CEF plan be printed on this DXF (a sheet CEF with a drawing area large enough, as the CEF's
     printer, vendor/cef/50_export.js CefTpl.seed, reads it) and what of the CEF's style kit it has; plain words for what is wrong.
   - complete(text, generic, T): the template with its kit completed, for its Download: the text styles, layers, line type and symbol of
     the CEF's style kit it lacks, as the generic CEF template (vendor/cef/cef-template-generic.dxf, tools/cef-template) has them (the
     look the app prints a missing one with), and the STYLE KEY sheet when it has none; the STYLE KEY's heights and samples written anew
     from the template's own styles.
   T is the plan builder's DXF reader (dxftpl.js: T.Doc, T.structure, T.clean). Nothing is read from or sent anywhere. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GeCefKit = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const typ = (r) => r[0][1];
  const get = (r, c, d) => { for (let i = 1; i < r.length; i++) if (r[i][0] === c) return r[i][1]; return d; };
  const all = (r, c) => r.filter((p, i) => i > 0 && p[0] === c).map((p) => p[1]);
  const fnum = (r, c, d) => { const v = parseFloat(get(r, c)); return isFinite(v) ? v : d; };
  const inum = (r, c, d) => { const v = parseInt(get(r, c), 10); return isFinite(v) ? v : d; };
  const up = (s) => String(s == null ? '' : s).trim().toUpperCase();
  const hOf = (r) => { const c = typ(r) === 'DIMSTYLE' ? 105 : 5; const p = r.find((x, i) => i > 0 && x[0] === c); return p ? String(p[1]).trim() : null; };
  const owner = (r) => { let g = 0; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 102) { g = String(v).startsWith('{') ? 1 : 0; continue; } if (c === 330 && !g) return String(v).trim(); } return null; };
  const isPtr = (c) => c === 330 || (c >= 331 && c <= 369) || c === 390 || c === 1005;
  const I = (v) => String(Math.round(v)).padStart(6);
  const mmTxt = (v) => String(Math.round(v * 100) / 100);
  const TOK = /@@(\w+)@@/g, textOf = (r) => (typ(r) === 'MTEXT' ? all(r, 3).join('') : '') + String(get(r, 1, ''));
  const OWN = /^CEF-(VP-|LOGO-|STYLE-KEY$)/i;      /* the template's own layers (viewports, logo boxes, the STYLE KEY), not the CEF's drawing layers */

  /** mm for one unit of a sheet's paper (as the CEF's printer reads it): its limits against its page, else its page setup's units. */
  function unitsOf(rec) {
    const k = rec.findIndex((p) => p[0] === 100 && p[1] === 'AcDbLayout'), sub = k >= 0 ? rec.slice(k) : [[0, '']], lw = fnum(sub, 11, 0) - fnum(sub, 10, 0), big = Math.max(fnum(rec, 44, 0), fnum(rec, 45, 0));
    if (lw > 0 && big > 0) { if (Math.abs(lw - big) < 0.15 * big) return 1; if (Math.abs(lw * 25.4 - big) < 0.15 * big) return 25.4; }
    return inum(rec, 72, 1) === 0 ? 25.4 : 1;
  }
  /** A sheet's own records (its block's, or the paper space's in ENTITIES). */
  function sheetRecs(d, S, L) {
    const br = S.br.get(L.brh); if (!br) return [];
    const bn = get(br, 2); if (bn !== '*Paper_Space') { const b = S.blocks.get(bn); return b ? b.ents : []; }
    const out = [], mine = new Set([L.brh]);
    for (const r of d.sec('ENTITIES').recs) if (mine.has(owner(r))) { out.push(r); const h = hOf(r); if (h) mine.add(h); }
    return out;
  }
  /** The fields (@@NAME@@) of a sheet's texts and of the blocks it inserts. */
  function fieldsIn(S, recs, seen) {
    const out = new Set(); seen = seen || new Set();
    for (const r of recs) {
      if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(typ(r))) for (const m of textOf(r).matchAll(TOK)) out.add(m[1]);
      if (typ(r) === 'INSERT') { const nm = get(r, 2), b = S.blocks.get(nm); if (b && !seen.has(nm)) { seen.add(nm); for (const k of fieldsIn(S, b.ents, seen)) out.add(k); } }
    }
    return out;
  }
  const sheetOf = (S, name) => S.layouts.find((q) => up(q.name) === name) || null;
  /** The CEF's style kit, as the generic CEF template has it: its text styles (CEF …), the CEF's layers, the template's own layers, its line
      type and its symbol. */
  function kitOf(G) {
    const styles = [], layers = [], own = [];
    for (const r of G.T) {
      if (typ(r) === 'STYLE' && /^CEF /i.test(String(get(r, 2, '')))) styles.push(String(get(r, 2)));
      if (typ(r) === 'LAYER') { const nm = String(get(r, 2, '')); if (/^(0|DEFPOINTS)$/i.test(nm)) continue; (OWN.test(nm) ? own : layers).push(nm); }
    }
    return { styles, layers, own, ltypes: ['CEF-DASHED'], blocks: ['CEF NORTH ARROW'] };
  }

  /** Can the CEF plan be printed on this DXF, and what of the kit it has: { ok, problems (plain words), notes, sheet: { paper, unit, drawing,
      tables, cover, fields }, kit: { styles, layers, dashed, north, key, missing } }. synth: the DXF synthesizer (its structure check), when
      the app has it. */
  function check(text, T, generic, synth) {
    const problems = [], notes = [], add = (s) => problems.push(s);
    let d = null, S = null;
    try { d = new T.Doc(String(text || '')); T.clean(d); S = T.structure(d); } catch (e) { return { ok: false, problems: ['It is not a text DXF the app can read (in AutoCAD: Save As → AutoCAD DXF, 2000 or later).'], notes, sheet: null, kit: null }; }
    const L = sheetOf(S, 'CEF'); let sheet = null;
    if (!L) add('It has no sheet (layout) named CEF: the app copies that sheet for every page of a CEF plan.');
    else {
      const recs = sheetRecs(d, S, L), u = unitsOf(L.rec), paper = fnum(L.rec, 44, 0) * fnum(L.rec, 45, 0) / u / u, V = recs.filter((r) => typ(r) === 'VIEWPORT');
      const ok = (r) => inum(r, 69, 0) !== 1 && !(inum(r, 90, 0) & 131072) && fnum(r, 40, 0) > 0 && fnum(r, 41, 0) > 0, page = !!V[0] && (inum(V[0], 69, 0) === 1 || !(paper > 0) || fnum(V[0], 40, 0) * fnum(V[0], 41, 0) >= 0.9 * paper);
      const onL = (nm) => (r) => up(get(r, 8, '')) === nm, mine = (page ? V.slice(1) : V).filter(ok), tv = mine.find(onL('CEF-VP-TABLES')) || null;
      const vp = mine.find(onL('CEF-VP-DRAWING')) || mine.filter((r) => r !== tv).sort((a, b) => fnum(b, 40, 0) * fnum(b, 41, 0) - fnum(a, 40, 0) * fnum(a, 41, 0))[0];
      const Lc = sheetOf(S, 'CEF COVER'), has = fieldsIn(S, recs); if (Lc) for (const k of fieldsIn(S, sheetRecs(d, S, Lc))) has.add(k);
      sheet = { paper: [Math.round(fnum(L.rec, 44, 0)), Math.round(fnum(L.rec, 45, 0))], unit: u === 1 ? 'mm' : 'in', drawing: null, tables: !!tv, cover: !!Lc, fields: [...has].sort() };
      if (!vp) add('Its CEF sheet has no drawing area (a viewport): put one on layer CEF-VP-DRAWING.');
      else {
        const W = fnum(vp, 40, 0) * u, H = fnum(vp, 41, 0) * u; sheet.drawing = [Math.round(W), Math.round(H)];
        if (W < (tv ? 120 : 200) || H < 120) add(`Its drawing area (${Math.round(W)} x ${Math.round(H)} mm) is too small for the CEF sheets (at least ${tv ? 120 : 200} x 120 mm${tv ? '' : ', or 120 x 120 mm with the tables in a viewport of their own on layer CEF-VP-TABLES'}).`);
        if (!onL('CEF-VP-DRAWING')(vp)) notes.push('The drawing area is its largest viewport (none is on layer CEF-VP-DRAWING).');
      }
      if (!has.size) add('Its CEF sheet has no fields (@@NAME@@): the title block would print empty.');
      if (!Lc) notes.push('No CEF COVER sheet: the cover is drawn on sheet CEF.');
    }
    if (synth && synth.structCheck && !problems.length) { try {      /* (its structure: AutoCAD's rules, as the synthesizer checks a seed; said only when nothing else is wrong) */ const sp = synth.structCheck(String(text)); if (sp.length) add(`It has ${sp.length} structure problem(s): ${sp.slice(0, 3).map((x) => [].concat(x).join(' ')).join('; ')}.`); } catch (e) { notes.push('Its structure could not be checked.'); } }
    let kit = null;
    if (generic) {
      try {
        const g = new T.Doc(String(generic)), K = kitOf(T.structure(g)), st = new Set([...S.styles].map(up)), ly = new Set([...S.layers.keys()].map(up)), lt = new Set([...S.ltypes].map(up)), bl = new Set([...S.blocks.keys()].map(up));
        const ms = K.styles.filter((x) => !st.has(up(x))), ml = K.layers.filter((x) => !ly.has(up(x)));
        kit = { styles: [K.styles.length - ms.length, K.styles.length], layers: [K.layers.length - ml.length, K.layers.length], dashed: lt.has('CEF-DASHED'), north: bl.has('CEF NORTH ARROW'), key: !!sheetOf(S, 'STYLE KEY'), missing: { styles: ms, layers: ml } };
        if (ms.length || ml.length) notes.push(`Of the CEF's style kit it lacks ${[ms.length ? `${ms.length} text style${ms.length === 1 ? '' : 's'}` : '', ml.length ? `${ml.length} layer${ml.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}: those print as the app's own look (Download adds them).`);
      } catch (e) { notes.push('Its kit could not be compared with the generic template.'); }
    }
    return { ok: !problems.length, problems, notes, sheet, kit };
  }

  /** The template with the CEF's style kit completed and a STYLE KEY sheet, for its Download: { text, added: { styles, layers, ltypes, blocks,
      appids, key, values } }. What it has is kept as it is (its own look); what it lacks comes from the generic template. */
  function complete(text, generic, T) {
    const d = new T.Doc(String(text)), g = new T.Doc(String(generic)); T.clean(d);
    const S = T.structure(d), G = T.structure(g), K = kitOf(G), added = { styles: [], layers: [], ltypes: [], blocks: [], appids: [], key: false, values: 0 };
    const TD = () => d.sec('TABLES').recs, tableOf = (recs, nm) => recs.find((r) => typ(r) === 'TABLE' && get(r, 2) === nm);
    const toTable = (nm, rec) => { const A = TD(); let j = A.indexOf(tableOf(A, nm)) + 1; if (j <= 0) return false; while (j < A.length && typ(A[j]) !== 'ENDTAB') j++; A.splice(j, 0, rec); return true; };
    const map = new Map(), H = () => d.newHandle();
    /* what the copies point to: the tables, the sheets' dictionary, the plot style and material of layer 0 */
    for (const nm of ['STYLE', 'LAYER', 'LTYPE', 'BLOCK_RECORD', 'APPID']) { const a = tableOf(G.T, nm), b = tableOf(TD(), nm); if (a && b) map.set(hOf(a), hOf(b)); }
    const dictOf = (doc, name) => { const root = doc.sec('OBJECTS').recs[0], k = root ? root.findIndex((p) => p[0] === 3 && p[1] === name) : -1; return k > 0 && root[k + 1] ? doc.byHandle.get(String(root[k + 1][1]).trim()) || null : null; };
    const ldG = dictOf(g, 'ACAD_LAYOUT'), ldD = dictOf(d, 'ACAD_LAYOUT'); if (ldG && ldD) map.set(hOf(ldG), hOf(ldD));
    const z0 = G.layers.get('0'), z1 = S.layers.get('0'); if (z0 && z1) for (const c of [390, 347]) { const a = get(z0, c), b = get(z1, c); if (a && b) map.set(String(a).trim(), String(b).trim()); }
    /* a record copied: a new handle, its pointers to what was copied with it (or to the tables above); reactors kept so, extension
       dictionaries and block references left out */
    const copy = (r) => {
      const out = []; let grp = null;
      for (let i = 0; i < r.length; i++) {
        const [c, v] = r[i];
        if (c === 102) { if (String(v).startsWith('{')) { grp = String(v); if (grp === '{ACAD_REACTORS') out.push([c, v]); continue; } if (grp === '{ACAD_REACTORS') out.push([c, v]); grp = null; continue; }
        if (grp && grp !== '{ACAD_REACTORS') continue;
        if (i > 0 && (c === 5 || c === 105)) { out.push([c, map.get(String(v).trim()) || H()]); continue; }
        if (isPtr(c)) { const t = String(v).trim(); if (!t || t === '0') out.push([c, v]); else if (map.has(t)) out.push([c, map.get(t)]); continue; }
        out.push([c, v]);
      }
      const tidy = []; for (const p of out) { if (p[0] === 102 && p[1] === '}' && tidy.length && tidy[tidy.length - 1][0] === 102) { tidy.pop(); continue; } tidy.push(p); } // (an empty reactors group)
      return tidy;
    };
    const take = (recs) => { for (const r of recs) { const h = hOf(r); if (h && !map.has(h)) map.set(h, H()); } return recs; };
    /* the text styles, line type and layers it lacks */
    const st = new Set([...S.styles].map(up)), lt = new Set([...S.ltypes].map(up)), ly = new Set([...S.layers.keys()].map(up));
    const gT = (t, nm) => G.T.find((r) => typ(r) === t && up(get(r, 2, '')) === up(nm));
    const want = []; // [table, record]
    for (const nm of K.ltypes) if (!lt.has(up(nm)) && gT('LTYPE', nm)) { want.push(['LTYPE', gT('LTYPE', nm)]); added.ltypes.push(nm); }
    for (const nm of K.styles) if (!st.has(up(nm)) && gT('STYLE', nm)) { want.push(['STYLE', gT('STYLE', nm)]); added.styles.push(nm); }
    for (const nm of K.layers.concat(K.own)) if (!ly.has(up(nm)) && gT('LAYER', nm)) { want.push(['LAYER', gT('LAYER', nm)]); added.layers.push(nm); }
    /* the symbol, and the STYLE KEY sheet (a paper space block of its own, its layout) */
    const blk = []; const bU = new Set([...S.blocks.keys()].map(up));
    for (const nm of K.blocks) { const b = G.blocks.get(nm), br = G.brByName.get(nm); if (!bU.has(up(nm)) && b && br) { blk.push({ name: nm, br, b }); added.blocks.push(nm); } }
    const keyG = sheetOf(G, 'STYLE KEY'); let keyL = null;
    if (keyG && !sheetOf(S, 'STYLE KEY')) {
      const br = G.br.get(keyG.brh), b = br ? G.blocks.get(get(br, 2)) : null;
      if (br && b) { let k = 0; const used = new Set([...S.brByName.keys()].map(up)); do k++; while (used.has(`*PAPER_SPACE${k}`)); keyL = { br, b, rec: keyG.rec, name: `*Paper_Space${k}` }; added.key = true; }
    }
    take(want.map((w) => w[1])); for (const x of blk) take([x.br, x.b.begin, ...x.b.ents, x.b.end]); if (keyL) take([keyL.br, keyL.b.begin, ...keyL.b.ents, keyL.b.end, keyL.rec]);
    /* the applications their extended data names (AcadAnnotative, GESAA_KEY…) */
    const apps = new Set(); const seen = (r) => { for (const p of r) if (p[0] === 1001) apps.add(String(p[1])); };
    want.forEach((w) => seen(w[1])); blk.forEach((x) => [x.br, x.b.begin, ...x.b.ents, x.b.end].forEach(seen)); if (keyL) [keyL.br, keyL.b.begin, ...keyL.b.ents, keyL.b.end, keyL.rec].forEach(seen);
    const ap = new Set(TD().filter((r) => typ(r) === 'APPID').map((r) => up(get(r, 2)))), apT = tableOf(TD(), 'APPID');
    for (const a of apps) if (!ap.has(up(a)) && apT) { toTable('APPID', [[0, 'APPID'], [5, H()], [330, hOf(apT)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbRegAppTableRecord'], [2, a], [70, I(0)]]); added.appids.push(a); }
    for (const [t, r] of want) toTable(t, copy(r));
    const BS = d.sec('BLOCKS').recs;
    for (const x of blk) { toTable('BLOCK_RECORD', copy(x.br)); BS.push(copy(x.b.begin), ...x.b.ents.map(copy), copy(x.b.end)); }
    if (keyL) {
      const ren = (r) => r.map(([c, v]) => [c, (c === 2 || c === 3) && up(v) === up(get(keyL.br, 2)) ? keyL.name : v]);
      toTable('BLOCK_RECORD', ren(copy(keyL.br))); BS.push(ren(copy(keyL.b.begin)), ...keyL.b.ents.map(copy), copy(keyL.b.end));
      const lay = copy(keyL.rec), tabs = Math.max(0, ...S.layouts.map((q) => { const k = q.rec.findIndex((p) => p[0] === 100 && p[1] === 'AcDbLayout'); return k >= 0 ? inum(q.rec.slice(k), 71, 0) : 0; }));
      { const k = lay.findIndex((p) => p[0] === 100 && p[1] === 'AcDbLayout'); for (let i = k + 1; k >= 0 && i < lay.length; i++) if (lay[i][0] === 71) { lay[i] = [71, I(tabs + 1)]; break; } }
      d.sec('OBJECTS').recs.push(lay);
      if (ldD) ldD.push([3, 'STYLE KEY'], [350, map.get(hOf(keyL.rec))]);
    }
    d.index(); T.clean(d);
    /* the sheets' tabs numbered 1, 2, 3… in their order (a gap left by a sheet deleted closed, as AutoCAD numbers them) */
    { const tabOf = (q) => { const k = q.rec.findIndex((p) => p[0] === 100 && p[1] === 'AcDbLayout'); for (let i = k + 1; k >= 0 && i < q.rec.length; i++) if (q.rec[i][0] === 71) return i; return -1; };
      const L = T.structure(d).layouts.filter((q) => up(q.name) !== 'MODEL' && tabOf(q) > 0).sort((a, b) => inum([[0], a.rec[tabOf(a)]], 71, 0) - inum([[0], b.rec[tabOf(b)]], 71, 0));
      L.forEach((q, i) => { q.rec[tabOf(q)] = [71, I(i + 1)]; }); }
    /* the STYLE KEY's heights and samples: from the template's own styles (mm on its CEF sheet's paper) */
    const S2 = T.structure(d), L = sheetOf(S2, 'CEF'), u = L ? unitsOf(L.rec) : 1, sh = new Map();
    for (const r of S2.T) if (typ(r) === 'STYLE') sh.set(up(get(r, 2)), Math.max(0, fnum(r, 40, 0)) * u);
    for (const sec of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(sec).recs) {
      if (typ(r) !== 'TEXT') continue; const k = r.findIndex((p) => p[0] === 1001 && p[1] === 'GESAA_KEY'); if (k < 0 || !r[k + 2]) continue;
      const what = r[k + 1][1], nm = up(r[k + 2][1]); if (!sh.has(nm)) continue; const mm = sh.get(nm);
      const set = (c, v) => { for (let i = 1; i < k; i++) if (r[i][0] === c) { r[i][1] = v; return; } };
      if (what === 'height') { set(1, mm > 0 ? `${mmTxt(mm)} mm` : '0: the app\'s own'); added.values++; }
      else if (what === 'sample' && mm > 0) set(40, String(Math.min(mm, 5)));
    }
    return { text: d.text(), added };
  }
  return { check, complete, kitOf: (generic, T) => kitOf(T.structure(new T.Doc(String(generic)))), version: 1 };
});
