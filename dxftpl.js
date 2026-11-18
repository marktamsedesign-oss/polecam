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
      this.keepRaster = false; // v2.42.8: clean() keeps the picture settings (RASTERVARIABLES) of a drawing with no picture yet
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
      const put = (p) => { out.push(codeStr(p[0])); out.push(typeof p[1] === 'string' && /[\r\n]/.test(p[1]) ? p[1].replace(/[\r\n]+/g, ' ') : p[1]); }; // v2.42.4: a line break in a value (a sheet cell with Alt+Enter) broke the file
      this.head.forEach(put);
      for (const s of this.secs) {
        put([0, 'SECTION']); put([2, s.name]);
        if (s.raw) s.raw.forEach(put); else for (const r of s.recs) r.forEach(put);
        put([0, 'ENDSEC']);
      }
      this.tail.forEach(put);
      return out.join('\r\n') + '\r\n'; // v2.42.8: CRLF always (AutoCAD's own; the template's line ends were kept before)
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

  /* ---------------- v2.42.8: the cleanup pass ----------------
     The company template was turned into DXF by LibreDWG 0.14, which leaves records AutoCAD refuses ("Invalid symbol table record
     name: *Multiple", "Premature end of object", "GEODATA … DXF read error"); lenient viewers open such a file, AutoCAD discards it.
     This pass repairs them. It runs on the template before it is filled and again on every export, and it is idempotent: run on its
     own output it changes nothing. The rules (the team's fix_dxf.py, tested in AutoCAD for Mac, rules 1-11; 12-13 and the rest new):
      1 one *Active VPORT only (4.7: whole screen)  2 ATTRIB / ATTDEF: the bogus embedded AcDbXrecord tail stripped
      3 GEODATA dropped                             4 REGION / 3DSOLID / BODY dropped when there is no ACDSDATA section
                                                    (and an INSERT of a block left empty)
      5 MULTILEADER dropped                         6, 11 pointers (347 materials, 340, 348, 331, 360…) to missing objects removed
      7 dictionary entries to missing objects removed     8 objects whose owner is missing dropped (repeated)
      9 SORTENTSTABLE: its block record (330) after the subclass marker   10 LibreDWG's styles and settings objects dropped
     12 MTEXT reference width (41) far below its text's width: set to the real width or 0 (no wrapping); over 1000 times its text's
        width (v2.42.10): 0; ^J written as \P
     13 IMAGEDEFs no IMAGE uses dropped (with their dictionary entries; RASTERVARIABLES too when no image is left)
     14 DIMSTYLE colours written as packed true colours (176-178): their colour index
     15 a block drawn more than 1 km from its base point: its drawing moved to the base point, its inserts moved to match (nothing
        drawn moves; the insertion points sit on their symbols)
     16 fonts AutoCAD for Mac may not have (Vineta BT; v2.42.10: Swiss 721 BdCnOul, SimSun, CG Omega, SASB / hand1 / SUPEROS SHX):
        Arial, Arial bold or ROMANS (in the text styles and inside MTEXT)
     17 (v2.42.9, .10) MTEXT: the embedded object LibreDWG wrote with its direction and insertion swapped (AutoCAD turned and moved
        those texts): dropped (one column or none) or written as AutoCAD reads it (several columns)
     18 (v2.42.10) VIEWPORT: frozen layers under 331, not 341 (G-eSAA's own mistake before v2.42.10; AutoCAD froze nothing)
     19 (beta 4.7) the picture classes (IMAGE, IMAGEDEF, IMAGEDEF_REACTOR, RASTERVARIABLES): their instance count (91) the drawing's
     and: header variables pointing to missing objects removed; $HANDSEED above every handle; each table's count its records. */
  // v2.42.10: fonts AutoCAD for Mac may not have, and their stand-ins (16)
  const FONT_TTF = [
    { file: /vinet/i, face: /^\s*Vineta BT\s*$/i, to: 'arial.ttf' }, { file: /swisscbo/i, face: /^\s*Swis721 BdCnOul BT\s*$/i, to: 'arialbd.ttf', bold: true, narrow: 0.78 }, // (condensed: Arial bold narrowed to its width)
    { file: /simsun/i, face: /^\s*SimSun\s*$/i, to: 'arial.ttf' }, { file: /^(?!)$/, face: /^\s*CG Omega\s*$/i, to: 'arial.ttf' },
  ];
  const FONT_SHX = /^(SASB____|hand1|SUPEROS)\.shx$/i;
  const FONT_INLINE = /\\f\s*(Vineta BT|SimSun|CG Omega|Swis721 BdCnOul BT)\|b(\d)\|i(\d)[^;]*;/i;
  const DROP_OBJ = new Set(['GEODATA', 'SUN', 'VISUALSTYLE', 'TABLESTYLE', 'MLEADERSTYLE', 'ACDBSECTIONVIEWSTYLE', 'ACDBDETAILVIEWSTYLE', 'ACDB_DYNAMICBLOCKPURGEPREVENTER_VERSION']);
  const PTR = (c) => (c >= 331 && c <= 369) || c === 390;
  /** An MTEXT's text without its format codes, as lines (to measure it). */
  function mtextLines(s) {
    return String(s).replace(/\\\\/g, '\\').replace(/\\[{}]/g, 'x').replace(/\\p[^;]*;/g, '').replace(/\\[fFcCHhWwAaQqTt][^;]*;/g, '')
      .replace(/\\S([^;]*);/g, (m, a) => a.replace(/[\^#/]/g, ' ')).replace(/\\[LlOoKk]/g, '').replace(/\\[PN]/g, '\n').replace(/\\~/g, ' ')
      .replace(/[{}]/g, '').replace(/\^J/g, '\n').replace(/\^I/g, ' ').split('\n');
  }
  /** About how wide an MTEXT's longest line is (its height × 0.6 per character). */
  function mtextWidth(r) { const h = num(r, 40, 0), L = mtextLines(textOf(r)); return h * 0.6 * Math.max(0, ...L.map((x) => x.trim().length)); }
  /** Index of the first code c of the MTEXT's own part (after 100 AcDbMText, before its embedded object). */
  function mtextIdx(r, c) { const k = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbMText'); for (let i = k + 1; k >= 0 && i < r.length; i++) { if (r[i][0] === 101 || r[i][0] === 100) return -1; if (r[i][0] === c) return i; } return -1; }
  function clean(d) {
    const log = {}, inc = (k, n) => { log[k] = (log[k] || 0) + (n == null ? 1 : n); };
    const T = d.sec('TABLES'), B = d.sec('BLOCKS'), E = d.sec('ENTITIES'), O = d.sec('OBJECTS'), hasAcds = !!d.sec('ACDSDATA');
    const drop = new Set(); // records dropped (by identity)
    // 1. one *Active VPORT; beta 4.7: over the whole screen. The company template's model view was saved as two tiled viewports side
    // by side (two *Active records, the left and the right half): the one kept covered the left half only, so AutoCAD opened the
    // plan in the left half with the right half of the screen blank. Its aspect (41) becomes the whole screen's.
    // beta 4.7: a template with no *Active record (named configurations only): its first VPORT is kept as *Active (the table was
    // left empty, and AutoCAD opened on a view of its own instead of the plan)
    let active = T.recs.find((r) => typ(r) === 'VPORT' && String(get(r, 2, '')).toUpperCase() === '*ACTIVE') || null;
    if (!active) { active = T.recs.find((r) => typ(r) === 'VPORT') || null; if (active) { setFirst(active, 2, '*Active'); inc('VPORT renamed *Active (the template had none)'); } }
    for (const r of T.recs) if (typ(r) === 'VPORT' && r !== active) { drop.add(r); inc(`VPORT ${String(get(r, 2, ''))} dropped`); }
    if (active) {
      const x0 = num(active, 10, 0), y0 = num(active, 20, 0), x1 = num(active, 11, 1), y1 = num(active, 21, 1), a = num(active, 41, 0);
      if (Math.abs(x0) > 1e-9 || Math.abs(y0) > 1e-9 || Math.abs(x1 - 1) > 1e-9 || Math.abs(y1 - 1) > 1e-9) {
        if (a > 0 && x1 - x0 > 0.01 && y1 - y0 > 0.01) setFirst(active, 41, F(a * (y1 - y0) / (x1 - x0)));
        for (const [c, v] of [[10, '0.0'], [20, '0.0'], [11, '1.0'], [21, '1.0']]) setFirst(active, c, v);
        inc('VPORT *Active set to the whole screen (it covered part of it)');
      }
    }
    // 3, 10. LibreDWG's objects; 4, 5. entities AutoCAD cannot read
    for (const r of O.recs) if (DROP_OBJ.has(typ(r))) { drop.add(r); inc(`${typ(r)} dropped`); }
    for (const s of [B, E]) for (const r of s.recs) { const t = typ(r); if (t === 'MULTILEADER' || (!hasAcds && (t === 'REGION' || t === '3DSOLID' || t === 'BODY'))) { drop.add(r); inc(`${t} dropped`); } }
    // 13. IMAGEDEFs no IMAGE uses
    const usedDefs = new Set(); for (const s of [B, E]) for (const r of s.recs) if (typ(r) === 'IMAGE' && !drop.has(r)) { const h = get(r, 340); if (h) usedDefs.add(h); }
    for (const r of O.recs) if (typ(r) === 'IMAGEDEF' && !usedDefs.has(get(r, 5))) { drop.add(r); inc('unused IMAGEDEF dropped'); }
    if (!usedDefs.size) for (const r of O.recs) if (typ(r) === 'RASTERVARIABLES' && d.keepRaster !== true) { drop.add(r); inc('RASTERVARIABLES dropped (no image)'); }
    const sections = d.secs.filter((s) => s.recs);
    const prune = () => { for (const s of sections) if (s.recs.some((r) => drop.has(r))) s.recs = s.recs.filter((r) => !drop.has(r)); };
    prune();
    // 4. an INSERT of a block left with nothing in it (its REGIONs dropped): it drew nothing, and its insertion point is far away
    const empty = new Set([...structure(d).blocks].filter(([n, b]) => !/^\*/.test(n) && !b.ents.length).map(([n]) => n));
    if (empty.size) { for (const s of [B, E]) for (const r of s.recs) if (typ(r) === 'INSERT' && empty.has(get(r, 2))) { drop.add(r); inc('INSERT of an empty block dropped'); } prune(); }
    // 6-8, 11. owners and pointers to missing objects, repeated until nothing changes
    for (let it = 0; it < 20; it++) {
      const live = new Set(); for (const s of sections) for (const r of s.recs) { const h = handleOf(r); if (h) live.add(h); }
      let changed = false;
      for (const s of [O, B, E]) for (const r of s.recs) { // objects (and attributes) whose owner is missing
        const t = typ(r); if (s !== O && !(t === 'ATTRIB' || t === 'SEQEND' || t === 'VERTEX')) continue;
        const ow = owner(r); if (ow && ow !== '0' && !live.has(ow)) { drop.add(r); inc(`${t} dropped (owner missing)`); changed = true; }
        if (t === 'IMAGE' && get(r, 340) && !live.has(get(r, 340))) { drop.add(r); inc('IMAGE dropped (its IMAGEDEF missing)'); changed = true; }
      }
      if (changed) { prune(); continue; }
      for (const s of sections) for (let n = 0; n < s.recs.length; n++) {
        const r = s.recs[n], t = typ(r), isDict = t === 'DICTIONARY' || t === 'ACDBDICTIONARYWDFLT';
        if (!r.some((p, i) => i > 0 && (PTR(p[0]) || p[0] === 330) && p[1] && p[1] !== '0' && !live.has(p[1]))) continue;
        const out = [r[0]]; let grp = null, cut = false;
        for (let i = 1; i < r.length; i++) {
          const [c, v] = r[i];
          if (c === 102) { grp = String(v).startsWith('{') ? v : null; out.push(r[i]); continue; }
          const dead = !!v && v !== '0' && !live.has(String(v).trim());
          if (isDict && c === 3 && r[i + 1] && (r[i + 1][0] === 350 || r[i + 1][0] === 360) && !live.has(String(r[i + 1][1]).trim())) { i++; inc('dictionary entry to a missing object removed'); cut = true; continue; }
          if (t === 'SORTENTSTABLE' && c === 331 && dead) { if (r[i + 1] && r[i + 1][0] === 5) i++; inc('sort entry to a missing entity removed'); cut = true; continue; }
          if (dead && c === 330 && grp === '{ACAD_REACTORS') { inc('reactor to a missing object removed'); cut = true; continue; }
          if (dead && c === 360 && grp === '{ACAD_XDICTIONARY') { inc('extension dictionary pointer removed'); cut = true; continue; }
          if (dead && PTR(c)) { inc(`pointer ${c} to a missing object removed`); cut = true; continue; } // (in a group too: {BLKREFS 331…})
          out.push(r[i]);
        }
        const tidy = []; for (const p of out) { if (p[0] === 102 && p[1] === '}' && tidy.length && tidy[tidy.length - 1][0] === 102 && String(tidy[tidy.length - 1][1]).startsWith('{')) { tidy.pop(); continue; } tidy.push(p); } // empty 102 groups
        if (cut) { s.recs[n] = tidy; changed = true; }
      }
      // header variables pointing to missing objects ($CMATERIAL, $INTERFEREOBJVS, $INTERFEREVPVS, $CMLEADERSTYLE…)
      const H = d.sec('HEADER').raw, keep = [];
      for (let i = 0; i < H.length;) {
        let j = i + 1; while (j < H.length && H[j][0] !== 9) j++;
        const body = H.slice(i + 1, j);
        if (H[i][0] === 9 && body.some(([c, v]) => (PTR(c) || c === 330) && v && String(v).trim() !== '0' && !live.has(String(v).trim()))) { inc(`header ${H[i][1]} removed (points to nothing)`); changed = true; }
        else keep.push(...H.slice(i, j));
        i = j;
      }
      d.sec('HEADER').raw = keep;
      if (!changed) break;
    }
    d.index();
    // 2. the bogus AcDbXrecord tail of ATTRIB / ATTDEF
    for (const s of [B, E]) s.recs = s.recs.map((r) => {
      const t = typ(r); if (t !== 'ATTRIB' && t !== 'ATTDEF') return r;
      const k = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbXrecord'); if (k < 0) return r;
      let j = k; while (j < r.length && r[j][0] < 1000) j++;
      inc(`${t}: AcDbXrecord tail stripped`); return r.slice(0, k).concat(r.slice(j));
    });
    // 9. SORTENTSTABLE: its block record right after the subclass marker
    d.index();
    O.recs = O.recs.filter((r) => {
      if (typ(r) !== 'SORTENTSTABLE') return true;
      const k = r.findIndex((p) => p[0] === 100 && p[1] === 'AcDbSortentsTable'); if (k < 0) return true;
      if (r[k + 1] && r[k + 1][0] === 330) return true;
      const dict = d.byHandle.get(owner(r)), brh = dict ? owner(dict) : null, br = brh ? d.byHandle.get(brh) : null;
      if (br && typ(br) === 'BLOCK_RECORD') { r.splice(k + 1, 0, [330, brh]); inc('SORTENTSTABLE: block record added'); return true; }
      inc('SORTENTSTABLE dropped (no block record)'); return false;
    });
    // 18. (v2.42.10) VIEWPORT: the layers frozen in it under 331 (the DXF reference's code). G-eSAA wrote them under 341 before
    // v2.42.10, which AutoCAD does not read: the layers meant for one sheet only (the keymap's grid, the vicinity map) showed on every sheet
    for (const r of [...E.recs, ...B.recs]) if (typ(r) === 'VIEWPORT') for (const p of r) if (p[0] === 341) { p[0] = 331; inc('viewport frozen layer written under 331 (AutoCAD read none under 341)'); }
    // 14. DIMSTYLE colours written as packed true colours
    for (const r of T.recs) if (typ(r) === 'DIMSTYLE') for (const p of r) if ((p[0] === 176 || p[0] === 177 || p[0] === 178) && /^\s*-?\d+\s*$/.test(p[1])) {
      const n = parseInt(p[1], 10); if (n >= -32768 && n <= 32767) continue;
      const u = n >>> 0, m = u >>> 24; p[1] = I(m === 0xC1 ? 0 : m === 0xC3 ? (u & 0xFF) : 256); inc('DIMSTYLE colour set to a colour index');
    }
    // 16. fonts AutoCAD for Mac may not have (v2.42.8: Vineta BT; v2.42.10: the table of contents' Swiss 721 bold condensed outline,
    // SimSun, CG Omega, and SHX fonts that are not AutoCAD's own): Arial / Arial bold, or ROMANS; AutoCAD drew stand-ins for them
    const narrowed = new Map(); // style name -> width factor (a condensed font: its texts narrowed, once, when the style's font is set)
    for (const r of T.recs) {
      if (typ(r) !== 'STYLE') continue;
      const f3 = String(get(r, 3, '')), faces = all(r, 1000).map(String), hit = FONT_TTF.find((m) => m.file.test(f3) || faces.some((f) => m.face.test(f)));
      if (hit) {
        let ch = false;
        for (let i = 1; i < r.length; i++) {
          const p = r[i];
          if (p[0] === 3 && p[1] !== hit.to) { p[1] = hit.to; ch = true; }
          else if (p[0] === 1000 && FONT_TTF.some((m) => m.face.test(p[1]))) { p[1] = 'Arial'; ch = true; }
          else if (p[0] === 1071) { const n = parseInt(p[1], 10) || 0, m = ((hit.bold ? n | 0x2000000 : n) & ~0xFF00) >>> 0; if (m !== n) { p[1] = I(m); ch = true; } } // (bold; no Chinese character set)
        }
        if (ch) inc('text style font set to Arial (AutoCAD may not have it)');
        if (ch && hit.narrow) { const k = r.findIndex((q) => q[0] === 41), w0 = k >= 0 ? parseFloat(r[k][1]) || 1 : 1; if (k >= 0) r[k][1] = F(w0 * hit.narrow); narrowed.set(get(r, 2), hit.narrow); }
      } else if (FONT_SHX.test(f3.replace(/^.*[\\/]/, ''))) {
        setFirst(r, 3, 'romans.shx'); if (get(r, 4)) setFirst(r, 4, ''); inc('text style SHX font set to ROMANS (not one of AutoCAD\'s)');
      }
    }
    // (16) the texts in a condensed font's style: their width factor (41) narrowed as much (the table of contents ran out of its columns)
    if (narrowed.size) for (const s of [B, E]) for (const r of s.recs) {
      const t = typ(r); if ((t !== 'TEXT' && t !== 'ATTRIB' && t !== 'ATTDEF') || !narrowed.has(get(r, 7))) continue;
      const a = r.findIndex((q) => q[0] === 100 && q[1] === 'AcDbText'); if (a < 0) continue;
      let k = -1, k1 = -1; for (let i = a + 1; i < r.length && !(r[i][0] === 100); i++) { if (r[i][0] === 41) k = i; if (r[i][0] === 1) k1 = i; }
      const fct = narrowed.get(get(r, 7));
      if (k >= 0) r[k][1] = F((parseFloat(r[k][1]) || 1) * fct); else if (k1 >= 0) r.splice(k1 + 1, 0, [41, F(fct)]); else continue;
      inc('text in a condensed font narrowed (Arial bold is wider)');
    }
    // 12. MTEXT: reference width and ^J (16: a font change inside it to a font AutoCAD may not have: Arial)
    for (const s of [B, E]) for (const r of s.recs) {
      if (typ(r) !== 'MTEXT') continue;
      let t0 = textOf(r);
      if (FONT_INLINE.test(t0)) { t0 = t0.replace(new RegExp(FONT_INLINE.source, 'gi'), (m, face, b, i2) => `\\fArial|b${/swis/i.test(face) ? 1 : b}|i${i2}|c0|p34;`); setText(r, t0); inc('MTEXT font set to Arial'); }
      if (/\^J/.test(t0)) { setText(r, t0.replace(/\^J(\\P)?/g, '\\P')); inc('MTEXT ^J written as \\P'); }
      const k = mtextIdx(r, 41), w = k >= 0 ? parseFloat(r[k][1]) : 0, need = mtextWidth(r);
      if (k >= 0 && w > 0 && need > 0 && w < 0.2 * need) {
        const e = r.findIndex((p) => p[0] === 101), ext = e >= 0 ? r.slice(e).find((p) => p[0] === 42) : null, ew = ext ? parseFloat(ext[1]) : 0;
        r[k][1] = F(ew >= 0.2 * need ? ew : 0); inc('MTEXT width fixed');
      }
      else if (k >= 0 && need > 0 && w > 1000 * need) { r[k][1] = '0.0'; inc('MTEXT width far beyond its text set to 0 (no wrapping; it drew the same)'); } // v2.42.10: LibreDWG's stray widths (180 km for "SW 10M")
      // 17. (v2.42.9) its embedded object (101): LibreDWG writes the insertion point where AutoCAD reads the text's direction (10) and the
      // direction where AutoCAD reads the insertion (11), so AutoCAD turned each such text by the angle of its own coordinates
      // and drew it far from its place (the legend's descriptions, the tables' texts and the title blocks went missing or
      // turned). v2.42.10: AutoCAD also lays a text with columns out from the columns' upper left corner, not from its
      // attachment point (a centred title ran from its centre to the right): an object with one column or none is dropped
      // (AutoCAD needs none; every one in the template); several columns: written as AutoCAD reads it (11: the upper left corner).
      const e0 = r.findIndex((p) => p[0] === 101);
      if (e0 >= 0) {
        let e1 = r.length; for (let i = e0 + 1; i < r.length; i++) if (r[i][0] >= 1000) { e1 = i; break; } // (its xdata stays)
        const at = (c) => { for (let i = e0 + 1; i < e1; i++) if (r[i][0] === c) return i; return -1; };
        const cols = at(71) >= 0 ? parseInt(r[at(71)][1], 10) || 0 : 0, count = at(72) >= 0 ? parseInt(r[at(72)][1], 10) || 0 : 0;
        if (!cols || count <= 1) { r.splice(e0, e1 - e0); inc('MTEXT embedded object dropped (AutoCAD read it turned and moved)'); }
        else {
          const own = (c, dd) => { const i = mtextIdx(r, c); return i >= 0 ? parseFloat(r[i][1]) : dd; };
          const ux = own(11, 1), uy = own(21, 0), un = Math.hypot(ux, uy) || 1, u = [ux / un, uy / un], v = [-u[1], u[0]];
          const cw = at(44) >= 0 ? parseFloat(r[at(44)][1]) || own(41, 0) : own(41, 0), gut = at(45) >= 0 ? parseFloat(r[at(45)][1]) || 0 : 0, Wt = cw * count + gut * (count - 1);
          const Ht = own(46, 0) || (at(41) >= 0 ? parseFloat(r[at(41)][1]) || 0 : 0), att = Math.min(9, Math.max(1, own(71, 1))), ci = (att - 1) % 3, ri = Math.floor((att - 1) / 3);
          const x0 = own(10, 0) - u[0] * ci * Wt / 2 + v[0] * ri * Ht / 2, y0 = own(20, 0) - u[1] * ci * Wt / 2 + v[1] * ri * Ht / 2;
          const want = { 10: F(u[0]), 20: F(u[1]), 30: '0.0', 11: F(x0), 21: F(y0), 31: '0.0' };
          let ch = false;
          for (const c of [10, 20, 30, 11, 21, 31]) { const i = at(c); if (i >= 0 && String(r[i][1]).trim() !== want[c]) { r[i][1] = want[c]; ch = true; } }
          if (ch) inc('MTEXT embedded object written as AutoCAD reads it');
        }
      }
    }
    // 15. blocks drawn far from their base point
    rebase(d, inc);
    // 19. (beta 4.7) the picture classes' instance counts: the pictures in the drawing (the template's IMAGEDEF count was left as it was)
    { const n = rasterCounts(d); if (n) inc('picture class instance count set to its records', n); }
    // $HANDSEED above every handle; the VPORT table's count
    let mx = 0; for (const s of sections) for (const r of s.recs) { const h = handleOf(r); if (h) mx = Math.max(mx, parseInt(h, 16) || 0); }
    if (d.next <= mx) d.next = mx + 1;
    // each table's count (70): its records (the VPORT table after rule 1, the block table after old blocks removed)
    for (let i = 0; i < T.recs.length; i++) if (typ(T.recs[i]) === 'TABLE') {
      let n = 0, j = i + 1; for (; j < T.recs.length && typ(T.recs[j]) !== 'ENDTAB'; j++) n++;
      if (get(T.recs[i], 70) != null && parseInt(get(T.recs[i], 70), 10) !== n) { setFirst(T.recs[i], 70, I(n)); inc('table count set to its records'); }
      i = j;
    }
    d.index();
    return log;
  }
  /** v2.42.8 (rule 15): a block whose drawing sits more than 1 km from its base point (the template's NAP and legend blocks: 3 km to
      28,000 km): its drawing is moved to its base point and every insert of it moved to match, so nothing drawn moves and every
      insertion point sits on its symbol. Left as it is: a block with a base point other than 0, 0 (the app places blocks from 0, 0), an
      entity of a kind that cannot be moved point by point (a spline, an ellipse turned over…), or an insert with an extrusion, columns or rows. */
  const FAR_BLOCK = 1000; // metres
  function textPtsBox(ents) {
    const P = ents.filter((e) => ['TEXT', 'MTEXT', 'ATTDEF', 'POINT'].includes(typ(e))).map((e) => [num(e, 10, NaN), num(e, 20, NaN)]).filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
    return P.length ? [Math.min(...P.map((q) => q[0])), Math.min(...P.map((q) => q[1])), Math.max(...P.map((q) => q[0])), Math.max(...P.map((q) => q[1]))] : null;
  }
  function rebase(d, inc) {
    const S = structure(d), refs = new Map();
    for (const s of [d.sec('BLOCKS'), d.sec('ENTITIES')]) for (const r of s.recs) if (typ(r) === 'INSERT') { const n = get(r, 2); (refs.get(n) || refs.set(n, []).get(n)).push(r); }
    centerCache.clear();
    const far = [];
    for (const [name, b] of S.blocks) {
      if (/^\*/.test(name)) continue;
      const box = blockBox(S, name, 0) || textPtsBox(b.ents); if (!box) continue; // (a block of attributes only: where they are)
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, bx = num(b.begin, 10, 0), by = num(b.begin, 20, 0);
      if (Math.hypot(cx - bx, cy - by) < FAR_BLOCK) continue;
      if (Math.abs(bx) > 1e-9 || Math.abs(by) > 1e-9) { inc('far block left (base point not 0, 0)'); continue; }
      const movable = (t) => !!SHIFT_PTS[t] || t === 'HATCH';
      if (b.ents.some((e) => !movable(typ(e)) || (num(e, 230, 1) < 0 && typ(e) !== 'HATCH'))) { inc(`far block left (${[...new Set(b.ents.map(typ).filter((t) => !movable(t)))].join(', ') || 'turned over'})`); continue; }
      const R = refs.get(name) || [];
      if (R.some((r) => Math.abs(num(r, 230, 1) - 1) > 1e-9 || parseInt(get(r, 70, '0'), 10) > 1 || parseInt(get(r, 71, '0'), 10) > 1)) { inc('far block left (an insert with an extrusion or columns)'); continue; }
      far.push({ name, b, R, cx, cy });
    }
    for (const { b, R, cx, cy } of far) {
      for (const e of b.ents) shiftRec(e, -cx, -cy);
      for (const r of R) {
        const sx = num(r, 41, 1), sy = num(r, 42, 1), a = num(r, 50, 0) * Math.PI / 180;
        setFirst(r, 10, F(num(r, 10, 0) + cx * sx * Math.cos(a) - cy * sy * Math.sin(a))); setFirst(r, 20, F(num(r, 20, 0) + cx * sx * Math.sin(a) + cy * sy * Math.cos(a)));
      }
      inc('far block moved to its base point');
    }
    centerCache.clear();
  }

  /** v2.42.8: the template's unused blocks that still carry another project's title block text (copies of the sample title block:
      "NSB PROJECT", "Brgy.LittleBaguio_Malita(Capital)_DavaOccidental", "MARAND_MIN601"): removed, so no old project text is left in
      the file. A block anything inserts or points to is kept (the title block the sheets use holds the fields to fill). */
  const OLD_TEXT = /NSB PROJECT|LITTLE ?BAGUIO|DAVAO ?OCCIDENTAL|MARAND_MIN\d/i;
  function purgeOld(d) {
    const S = structure(d), used = new Set();
    for (const s of ['BLOCKS', 'ENTITIES']) for (const r of d.sec(s).recs) if (typ(r) === 'INSERT' || typ(r) === 'DIMENSION') used.add(get(r, 2));
    const cand = new Map();
    for (const [name, b] of S.blocks) {
      if (/^\*/.test(name) || used.has(name) || !S.brByName.get(name)) continue;
      if (b.ents.some((e) => ['MTEXT', 'TEXT', 'ATTDEF'].includes(typ(e)) && OLD_TEXT.test(textOf(e)) && !/@@\w+@@/.test(textOf(e)))) cand.set(get(S.brByName.get(name), 5), name);
    }
    if (!cand.size) return [];
    const under = (r) => { let h = owner(r); for (let k = 0; h && h !== '0' && k < 12; k++) { if (cand.has(h)) return h; const o = d.byHandle.get(h); h = o ? owner(o) : null; } return null; }; // the block's own records
    for (const sec of ['TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) for (const r of d.sec(sec).recs) { // pointed to from outside itself: kept
      const h = handleOf(r);
      for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (HANDLE_CODES(c) && cand.has(v) && h !== v && under(r) !== v) cand.delete(v); }
      if (!cand.size) return [];
    }
    removeHandles(d, new Set(cand.keys()));
    return [...cand.values()];
  }

  /** v2.42.8: a DXF exported before (or the template itself) repaired for AutoCAD: the cleanup, the old title block copies removed,
      its extents and opening view on the plan (its grid and vicinity map, when it has them). The drawing is not redrawn: its legend
      stays where it was. Returns { text, report }. */
  function repair(text) {
    const d = new Doc(text), rep = { notes: [] };
    rep.cleanup = clean(d); rep.oldBlocks = purgeOld(d); if (rep.oldBlocks.length) rep.cleanup2 = clean(d);
    const S = structure(d); centerCache.clear();
    const boxes = d.sec('ENTITIES').recs.filter((r) => owner(r) === S.modelH && String(get(r, 67, '0')).trim() !== '1' && /^(GRIDS|G-ESAA VICINITY( MAP)?)$/i.test(String(get(r, 8, ''))))
      .map((r) => drawnBox(S, r)).filter(Boolean);
    if (boxes.length) rep.frame = frame(d, S, boxes, rep); else rep.notes.push('no grid in model space: the extents and opening view are left as they were');
    return { text: d.text(), report: rep };
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
  /** beta 6.0: an entity's colour groups: an AutoCAD colour index (1-255, 0 by block, 256 by layer) as group 62; a colour of the user's
      own (Drawing style's colour picker: TC0 + 0xRRGGBB) as its nearest index (62) and the colour itself (420), as AutoCAD writes it. */
  const litCol = (c) => { const n = +c; if (n >= 0x1000000) { const v = n - 0x1000000, r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255; return 0.299 * r + 0.587 * g + 0.114 * b > 150; } return [2, 3, 4].includes(n); }; // (beta 6.5: also a colour of the user's own)
  const TC0 = 0x1000000, colGroups = (c) => { const n = +c; return n >= TC0 ? [[62, I(aciOf(n - TC0))], [420, I(n - TC0)]] : [[62, I(c)]]; };
  class Out {
    constructor(d, S) { this.d = d; this.S = S; this.model = []; this.n = {}; }
    base(t, layer, extra) {
      const r = [[0, t], [5, this.d.newHandle()], [330, this.S.modelH], [100, 'AcDbEntity'], [8, layer]];
      (this.used || (this.used = new Set())).add(layer); // the layers the plan uses (the vicinity map turns them off)
      if (extra && extra.lt) r.push([6, extra.lt]);
      if (extra && extra.color != null) r.push(...colGroups(extra.color)); // (beta 6.0: a colour of the user's own: its nearest AutoCAD colour and the colour itself)
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
      if (o.obl) r.push([51, F(o.obl)]); // v2.42.11: slanted (oblique angle, degrees)
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
      r.push([7, this.style(o.style)]); r.push([73, I(1)], [44, o.ls ? F(o.ls) : '1.0']); // (beta 4.7: o.ls, the line spacing factor)
      if (o.mask) r.push([90, I(1)], [63, I(o.mask)], [45, '1.35']); // v2.36: a background box (readable over a satellite picture)
      else if (o.canvas) r.push([90, I(3)], [63, I(0)], [45, F(o.canvas)]); // beta 3.8: a box in the drawing's background colour (it hides what is under it)
      return this.add(r);
    }
    solid(layer, p, o) { const r = this.base('SOLID', layer, o), q = p.length > 3 ? p[3] : p[2]; r.push([100, 'AcDbTrace'], [10, F(p[0][0])], [20, F(p[0][1])], [30, '0.0'], [11, F(p[1][0])], [21, F(p[1][1])], [31, '0.0'], [12, F(p[2][0])], [22, F(p[2][1])], [32, '0.0'], [13, F(q[0])], [23, F(q[1])], [33, '0.0']); return this.add(r); } // v2.42.24: a filled triangle (a leader's arrow)
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
        if (o.attrColor != null) at.push(...colGroups(o.attrColor)); else if (get(df, 62) != null) at.push([62, get(df, 62)]); // v2.36: a pin's own colour
        const wf = parseFloat(get(df, 41, '1')), wfp = Number.isFinite(wf) && wf > 0 && Math.abs(wf - 1) > 1e-9 ? [[41, F(wf)]] : []; // v2.42.10: its definition's width factor (AutoCAD copies it too)
        if (given) {
          const gha = given.ha || 0, gva = given.va || 0;
          at.push([100, 'AcDbText'], [10, F(given.x)], [20, F(given.y)], [30, '0.0'], [40, F(given.h || h)], [1, v], ...wfp);
          if (given.rot) at.push([50, F(given.rot)]);
          at.push([7, this.style(get(df, 7))]);
          if (gha || gva) at.push([72, I(gha)], [11, F(given.x)], [21, F(given.y)], [31, '0.0']);
          at.push([100, 'AcDbAttribute'], [2, tag], [70, I(v && !given.hidden ? 0 : 1)]); if (gva) at.push([74, I(gva)]);
        } else {
          at.push([100, 'AcDbText'], [10, F(p[0])], [20, F(p[1])], [30, '0.0'], [40, F(h)], [1, v], ...wfp);
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
  /** beta 4.8: a block's box as it is drawn: its polylines' arcs (bulges) and ellipses too (blockBox: their points only). */
  function blockBoxA(S, name, depth) {
    const b = S.blocks.get(name); if (!b || (depth || 0) > 6) return null;
    const xs = [], ys = [], add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } };
    for (const e of b.ents) {
      const t = typ(e);
      if (t === 'LINE') { add(num(e, 10), num(e, 20)); add(num(e, 11), num(e, 21)); }
      else if (t === 'LWPOLYLINE') {
        const V = []; for (let i = 1; i < e.length; i++) { if (e[i][0] === 10) V.push([+e[i][1], 0, 0]); else if (e[i][0] === 20 && V.length) V[V.length - 1][1] = +e[i][1]; else if (e[i][0] === 42 && V.length) V[V.length - 1][2] = +e[i][1]; }
        const cl = (parseInt(get(e, 70, '0'), 10) & 1) === 1;
        V.forEach((v, i) => { add(v[0], v[1]); const w = V[i + 1] || (cl ? V[0] : null); if (!w || !v[2]) return; // (an arc to the next point: its points every 1/8)
          const L = Math.hypot(w[0] - v[0], w[1] - v[1]), m = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2], n = L ? [-(w[1] - v[1]) / L, (w[0] - v[0]) / L] : [0, 0], k = (1 - v[2] * v[2]) / (2 * v[2]) * L / 2, c = [m[0] + n[0] * k, m[1] + n[1] * k], r = Math.hypot(v[0] - c[0], v[1] - c[1]), a0 = Math.atan2(v[1] - c[1], v[0] - c[0]), sw = 4 * Math.atan(v[2]);
          for (let j = 1; j < 8; j++) add(c[0] + r * Math.cos(a0 + sw * j / 8), c[1] + r * Math.sin(a0 + sw * j / 8)); });
      } else if (t === 'CIRCLE' || t === 'ARC') { const x = num(e, 10), y = num(e, 20), r = num(e, 40, 0); add(x - r, y - r); add(x + r, y + r); }
      else if (t === 'ELLIPSE') { const x = num(e, 10), y = num(e, 20), mx = num(e, 11, 0), my = num(e, 21, 0), q = num(e, 40, 1), ex = Math.hypot(mx, q * my), ey = Math.hypot(my, q * mx); add(x - ex, y - ey); add(x + ex, y + ey); }
      else if (t === 'INSERT') {
        const bb = blockBoxA(S, get(e, 2), (depth || 0) + 1); if (!bb) continue;
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
    if (t === 'HATCH') { // v2.42.8: its boundary and seed points, line and spline fit points, pattern base points (not its elevation
      // point, nor an ellipse edge's axis or a spline's tangents, which are relative)
      const k = r.findIndex((q) => q[0] === 100 && q[1] === 'AcDbHatch'); if (k < 0) return false;
      let elev = 2, poly = false, edge = 0;
      for (let i = k + 1; i < r.length; i++) {
        const q = r[i], c = q[0]; if (c >= 1000) break;
        if (elev && (c === 10 || c === 20)) { elev--; continue; }
        if (c === 92) { poly = (parseInt(q[1], 10) & 2) !== 0; edge = 0; } else if (c === 72 && !poly) edge = parseInt(q[1], 10) || 0; else if (c === 75) { poly = false; edge = 0; }
        const xy = c === 10 || c === 43 || ((edge === 1 || edge === 4) && c === 11) ? 1 : c === 20 || c === 44 || ((edge === 1 || edge === 4) && c === 21) ? 2 : 0;
        if (xy === 1) q[1] = F(+q[1] + neg * dx); else if (xy === 2) q[1] = F(+q[1] + dy);
      }
      return true;
    }
    if (t === 'MTEXT') { // v2.42.9: its own point, and the insertion point of its embedded object (11; its 10 is a direction)
      const e0 = r.findIndex((q) => q[0] === 101);
      r.forEach((q, i) => { const emb = e0 >= 0 && i > e0, c = q[0]; if (q[0] >= 1000) return;
        if ((!emb && c === 10) || (emb && c === 11)) q[1] = F(+q[1] + dx); else if ((!emb && c === 20) || (emb && c === 21)) q[1] = F(+q[1] + dy); });
      return true;
    }
    const pts = SHIFT_PTS[t]; if (!pts) return false;
    for (const q of r) { if (pts.includes(q[0])) q[1] = F(+q[1] + neg * dx); else if (pts.includes(q[0] - 10)) q[1] = F(+q[1] + dy); }
    return true;
  }
  /** Turns layers off (frozen) in one viewport of a sheet only. */
  function vpFreeze(vp, handles) {
    if (!vp || !handles.length) return;
    const k = vp.findIndex(([c]) => c === 90); const add = handles.filter((h) => !vp.some(([c, v]) => c === 331 && v === h)).map((h) => [331, h]); // 331 (v2.42.10; was 341, which AutoCAD does not read)
    vp.splice(k >= 0 ? k : vp.length, 0, ...add);
  }
  /** v2.42.8: about where an entity is drawn: [x0, y0, x1, y1] (an INSERT through its block, a text from its height and length), or null. */
  function drawnBox(S, r) {
    const t = typ(r), xs = [], ys = [], add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } };
    const pairs = (cx) => { const X = all(r, cx).map(Number), Y = all(r, cx + 10).map(Number); X.forEach((x, i) => add(x, Y[i])); };
    if (t === 'VIEWPORT' || t === 'SEQEND' || t === 'ATTRIB' && !get(r, 1)) return null;
    if (t === 'LINE') { add(num(r, 10), num(r, 20)); add(num(r, 11), num(r, 21)); }
    else if (t === 'CIRCLE' || t === 'ARC') { const x = num(r, 10), y = num(r, 20), q = num(r, 40, 0); add(x - q, y - q); add(x + q, y + q); }
    else if (t === 'ELLIPSE') { const x = num(r, 10), y = num(r, 20), q = Math.hypot(num(r, 11, 0), num(r, 21, 0)); add(x - q, y - q); add(x + q, y + q); }
    else if (t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB') {
      const x = num(r, 10), y = num(r, 20), h = num(r, 40, 0), L = t === 'MTEXT' ? mtextLines(textOf(r)) : [String(get(r, 1, ''))];
      const w = h * 0.6 * Math.max(1, ...L.map((q) => q.length)), n = h * 1.7 * L.length; add(x - w, y - n); add(x + w, y + n); // round its point: its alignment not known
    }
    else if (t === 'INSERT') {
      const blk = S.blocks.get(get(r, 2)), bb = blockBox(S, get(r, 2), 0), ix = num(r, 10, 0), iy = num(r, 20, 0);
      if (!bb || !blk) add(ix, iy);
      else {
        const bx = num(blk.begin, 10, 0), by = num(blk.begin, 20, 0), sx = num(r, 41, 1), sy = num(r, 42, 1), a = num(r, 50, 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
        for (const [u, v] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]) { const X = (u - bx) * sx, Y = (v - by) * sy; add(ix + X * c - Y * sn, iy + X * sn + Y * c); }
      }
    }
    else if (t === 'IMAGE') {
      const x = num(r, 10), y = num(r, 20), ux = num(r, 11, 0) * num(r, 13, 0), uy = num(r, 21, 0) * num(r, 13, 0), vx = num(r, 12, 0) * num(r, 23, 0), vy = num(r, 22, 0) * num(r, 23, 0);
      add(x, y); add(x + ux, y + uy); add(x + vx, y + vy); add(x + ux + vx, y + uy + vy);
    }
    else if (t === 'HATCH') { const X = all(r, 10).map(Number).slice(1), Y = all(r, 20).map(Number).slice(1); X.forEach((x, i) => add(x, Y[i])); } // (not its elevation point)
    else { pairs(10); if (t === 'SOLID' || t === 'TRACE' || t === '3DFACE') { pairs(11); pairs(12); pairs(13); } }
    return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
  }
  /** v2.42.8: the drawing's extents ($EXTMIN / $EXTMAX) and the view it opens on (the *Active VPORT): what model space draws within
      2 km of the plan's boxes (the grid, the vicinity maps, the tables). Anything further out (none expected: the template's far
      blocks are moved by the cleanup) is named in the report and left out of the extents. */
  function frame(d, S, boxes, rep) {
    const M = 2000, B0 = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    const outOf = (x, y) => x < B0[0] - M || x > B0[2] + M || y < B0[1] - M || y > B0[3] + M;
    let ext = null, far = 0; const farList = [], ins = new Set();
    for (const r of d.sec('ENTITIES').recs) {
      const ow = owner(r);
      if (ow === S.modelH && typ(r) === 'INSERT') ins.add(get(r, 5));
      if (!(ow === S.modelH || (typ(r) === 'ATTRIB' && ins.has(ow))) || String(get(r, 67, '0')).trim() === '1') continue;
      const b = drawnBox(S, r); if (!b) continue;
      if (outOf(b[0], b[1]) || outOf(b[2], b[3]) || (typ(r) === 'INSERT' && outOf(num(r, 10, 0), num(r, 20, 0)))) { far++; if (farList.length < 8) farList.push(`${typ(r)} ${get(r, 5)} (${get(r, 8)})`); continue; }
      ext = ext ? [Math.min(ext[0], b[0]), Math.min(ext[1], b[1]), Math.max(ext[2], b[2]), Math.max(ext[3], b[3])] : b.slice();
    }
    if (!ext) ext = B0;
    if (far) rep.notes.push(`${far} object(s) in model space more than 2 km from the plan, left out of its extents: ${farList.join(', ')}${far > farList.length ? '…' : ''}`);
    const H = d.sec('HEADER').raw, setPt = (name, x, y) => {
      const k = H.findIndex((p) => p[0] === 9 && p[1] === name); if (k < 0) return;
      for (let i = k + 1; i < H.length && H[i][0] !== 9; i++) { if (H[i][0] === 10) H[i] = [10, F(x)]; else if (H[i][0] === 20) H[i] = [20, F(y)]; else if (H[i][0] === 30) H[i] = [30, '0.0']; }
    };
    setPt('$EXTMIN', ext[0], ext[1]); setPt('$EXTMAX', ext[2], ext[3]);
    const vp = d.sec('TABLES').recs.find((r) => typ(r) === 'VPORT' && String(get(r, 2, '')).toUpperCase() === '*ACTIVE');
    if (vp) { // (beta 4.7: an aspect of at most 1.8 : 1, so the whole plan fits a narrower drawing area than the template's own: AutoCAD
      // keeps the view's height and fits the width to the window; most drawing areas are 2 : 1 or wider)
      const asp = num(vp, 41, 0) > 0.05 && num(vp, 41, 0) < 20 ? Math.min(num(vp, 41, 0), 1.8) : 1.6, w = ext[2] - ext[0], h = ext[3] - ext[1];
      const set = (c, v) => { if (get(vp, c) != null) setFirst(vp, c, v); };
      setFirst(vp, 12, F((ext[0] + ext[2]) / 2)); setFirst(vp, 22, F((ext[1] + ext[3]) / 2)); setFirst(vp, 40, F(Math.max(h, w / asp, 1) * 1.05));
      set(16, '0.0'); set(26, '0.0'); set(36, '1.0'); set(17, '0.0'); set(27, '0.0'); set(37, '0.0'); set(51, '0.0'); // looking straight down, no twist
    }
    return { box: ext.map((v) => Math.round(v)), far };
  }
  /** beta 4.7: the instance count (91) of each picture class in CLASSES: how many of its records the drawing has (it was set for IMAGE
      and IMAGEDEF_REACTOR only; the template's IMAGEDEF count stayed, e.g. 118 for 157 pictures). */
  function rasterCounts(d) {
    const cnt = new Map([['IMAGE', 0], ['IMAGEDEF', 0], ['IMAGEDEF_REACTOR', 0], ['RASTERVARIABLES', 0]]), C = d.sec('CLASSES');
    if (!C || !C.raw) return 0;
    for (const nm of ['BLOCKS', 'ENTITIES', 'OBJECTS']) { const s = d.sec(nm); if (s && s.recs) for (const r of s.recs) if (cnt.has(typ(r))) cnt.set(typ(r), cnt.get(typ(r)) + 1); }
    const raw = C.raw; let n = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i][0] !== 1 || !cnt.has(raw[i][1])) continue;
      let j = i + 1; while (j < raw.length && raw[j][0] !== 0 && raw[j][0] !== 91) j++;
      if (j < raw.length && raw[j][0] === 91 && parseInt(raw[j][1], 10) !== cnt.get(raw[i][1])) { raw[j] = [91, I(cnt.get(raw[i][1]))]; n++; }
    }
    return n;
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
    image(o, layer, file, px, py, x, y, w, h, ang) { // (beta 4.8: ang, degrees: turned about (x, y), its lower left corner)
      this.classes();
      let def = this.defs.get(file);
      if (!def) {
        def = { h: this.d.newHandle(), users: [], file, px, py }; this.defs.set(file, def);
        this.dict.push([3, `GESAA_${file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60)}_${this.defs.size}`], [350, def.h]);
      }
      const r = o.base('IMAGE', layer), ih = get(r, 5), rh = this.d.newHandle(); def.users.push(rh);
      const ca = ang ? Math.cos(ang * Math.PI / 180) : 1, sa = ang ? Math.sin(ang * Math.PI / 180) : 0, P12 = (v) => String(v.toPrecision(12));
      r.push([100, 'AcDbRasterImage'], [90, I(0)], [10, F(x)], [20, F(y)], [30, '0.0'], ...(ang ? [[11, P12(w / px * ca)], [21, P12(w / px * sa)], [31, '0.0'], [12, P12(-h / py * sa)], [22, P12(h / py * ca)], [32, '0.0']] : [[11, String((w / px).toPrecision(12))], [21, '0.0'], [31, '0.0'], [12, '0.0'], [22, String((h / py).toPrecision(12))], [32, '0.0']]),
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
      const root = O[0], rv = root.findIndex(([c, v]) => c === 3 && v === 'ACAD_IMAGE_VARS'); // v2.42.8: the picture settings (frame shown, high quality), when the drawing has none
      if (rv < 0 || !this.d.byHandle.get(String(root[rv + 1] && root[rv + 1][1]))) {
        const h = this.d.newHandle(), rh0 = get(root, 5);
        if (rv >= 0) root.splice(rv, 2);
        O.push([[0, 'RASTERVARIABLES'], [5, h], [102, '{ACAD_REACTORS'], [330, rh0], [102, '}'], [330, rh0], [100, 'AcDbRasterVariables'], [90, I(0)], [70, I(1)], [71, I(1)], [72, I(0)]]);
        root.push([3, 'ACAD_IMAGE_VARS'], [350, h]);
      }
      rasterCounts(this.d); // (beta 4.7: each picture class's count, IMAGEDEF and RASTERVARIABLES too)
      this.d.index();
    }
  }
  /** v2.34: writes entities into an existing block (e.g. the company logo into the title block PAGING, so it is on every sheet). */
  function blockOut(d, S, name) {
    const blk = S.blocks.get(name), brec = S.brByName.get(name); if (!blk || !brec || !blk.end) return null;
    const own = get(brec, 5), B = d.sec('BLOCKS').recs;
    return { base(t, layer, extra) { const r = [[0, t], [5, d.newHandle()], [330, own], [100, 'AcDbEntity'], [8, layer]]; if (extra && extra.color != null) r.push(...colGroups(extra.color)); return r; },
      add(r) { B.splice(B.indexOf(blk.end), 0, r); blk.ents.push(r); return r; } };
  }
  /** beta 6.0: writes entities into a layout's paper space (its own block, or the ENTITIES section for *Paper_Space), with Out's helpers. */
  function paperOut(d, S, L, OutC) {
    const brec = S.br.get(L.brh), bn = get(brec, 2), own = get(brec, 5), po = new OutC(d, S);
    if (bn === '*Paper_Space') { const E = d.sec('ENTITIES').recs; po.base = (t, layer, extra) => { const r = [[0, t], [5, d.newHandle()], [330, own], [100, 'AcDbEntity'], [67, I(1)], [8, layer]]; if (extra && extra.color != null) r.push(...colGroups(extra.color)); if (extra && extra.lwt != null) r.push([370, I(extra.lwt)]); return r; }; po.add = (r) => { E.push(r); return r; }; }
    else { const bo = blockOut(d, S, bn); if (!bo) return null; po.base = (t, layer, extra) => { const r = bo.base(t, layer, extra); if (extra && extra.lwt != null) r.push([370, I(extra.lwt)]); return r; }; po.add = bo.add; }
    return po;
  }
  /** beta 6.0: a paper-space entity's box [x0, y0, x1, y1] (lines, polylines, texts by their insertion and Arial width; circles), or null. */
  function entBoxP(r) {
    const t = typ(r), n = (c) => +get(r, c, 0);
    if (t === 'LINE') return [Math.min(n(10), n(11)), Math.min(n(20), n(21)), Math.max(n(10), n(11)), Math.max(n(20), n(21))];
    if (t === 'LWPOLYLINE') { const xs = all(r, 10).map(Number), ys = all(r, 20).map(Number); return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null; }
    if (t === 'CIRCLE') return [n(10) - n(40), n(20) - n(40), n(10) + n(40), n(20) + n(40)];
    if (t === 'TEXT' || t === 'MTEXT' || t === 'ATTDEF') { const h = n(40), s = t === 'MTEXT' ? all(r, 3).join('') + (get(r, 1) || '') : String(get(r, 1) || ''); if (!(h > 0) || !s.trim()) return null; const w = Math.min(arialW(s.replace(/\\[A-Za-z][^;]*;|[{}]/g, ''), h), t === 'MTEXT' && n(41) > 0 ? n(41) : Infinity), x = n(10), y = n(20); return [x - w, y - h * 1.5, x + w, y + h * 1.5]; }
    return null;
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
  /** v2.42.27: with along (a unit vector, the pole's route), the nearest road running within 35° of it is taken first (at a street
      corner the cross street can be nearer than the street the cable runs along: the pole then faced the cross street, its arm along
      the cable); the nearest of any way only where no road runs along the route there. */
  function nearestRoad(rs, p, maxD, along) {
    let best = null, bestA = null;
    rs.forEach((r, ri) => { if (!(r.hw > 0)) return; for (let k = 1; k < r.pts.length; k++) {
      const a = r.pts[k - 1], b = r.pts[k];
      if (Math.min(a[0], b[0]) - maxD - r.hw > p[0] || Math.max(a[0], b[0]) + maxD + r.hw < p[0] || Math.min(a[1], b[1]) - maxD - r.hw > p[1] || Math.max(a[1], b[1]) + maxD + r.hw < p[1]) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      const c = [a[0] + t * dx, a[1] + t * dy], d = dist2(p, c), edge = d - r.hw;
      if (edge > maxD) continue;
      const L = Math.sqrt(L2), dir = [dx / L, dy / L], hit = () => ({ ri, r, c, d, edge, dir, side: (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) >= 0 ? 1 : -1 });
      if (!best || edge < best.edge) best = hit();
      if (along && Math.abs(dir[0] * along[0] + dir[1] * along[1]) >= ALONG_COS && (!bestA || edge < bestA.edge)) bestA = hit();
    } });
    return bestA && bestA.edge <= best.edge + ALONG_MORE ? bestA : best; // (more than 6 m farther: another street; a cable crossing its road at a pole keeps that road)
  }
  const ALONG_COS = Math.cos(35 * Math.PI / 180), ALONG_MORE = 6;
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
  /** v2.41.1: the edge lines as drawn: their rounded corners (bulges) as short straight pieces (about every 10°). */
  function flatEdges(edges) {
    return edges.map((l) => {
      const P = l.pts, n = P.length, out = [], m = l.closed ? n : n - 1;
      if (!n) return out;
      out.push([P[0][0], P[0][1]]);
      for (let i = 0; i < m; i++) {
        const a = P[i], b = P[(i + 1) % n], bu = a[2] || 0;
        if (Math.abs(bu) > 1e-9) {
          const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy);
          if (c > 1e-6) {
            const h = c * (1 - bu * bu) / (4 * bu), C = [(a[0] + b[0]) / 2 - dy / c * h, (a[1] + b[1]) / 2 + dx / c * h], r = Math.hypot(a[0] - C[0], a[1] - C[1]);
            const a0 = Math.atan2(a[1] - C[1], a[0] - C[0]), sw = 4 * Math.atan(bu), k = Math.max(2, Math.ceil(Math.abs(sw) / (10 * Math.PI / 180)));
            for (let j = 1; j < k; j++) out.push([C[0] + r * Math.cos(a0 + sw * j / k), C[1] + r * Math.sin(a0 + sw * j / k)]);
          }
        }
        out.push([b[0], b[1]]);
      }
      return out;
    });
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
      let n = 0; const seen = new Set(), test = (x) => { if (x._k > 0 && !seen.has(x)) { seen.add(x); if (Spots.hit(b, x)) n += x._k * w(x.tag, x); } }; // (beta 4.7: w also sees the box, e.g. how thin it is)
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
  /** v2.42.13: how wide AutoCAD draws a one-line text in Arial (bold: Arial bold), h its height (the capitals' height): the widths of
      the font's letters, not one width for all (a tower's name was placed over the cable: it is wider than the estimate). */
  function arialW(str, h, bold) {
    const em = (ch) => (/[MW]/.test(ch) ? (ch === 'M' ? 0.833 : 0.944) : /[IJ]/.test(ch) ? (ch === 'I' ? 0.278 : 0.556) : /[EFLTZ]/.test(ch) ? 0.611 : /[GOQ]/.test(ch) ? 0.778 : /[PS]/.test(ch) ? 0.667 : /[A-Z]/.test(ch) ? 0.722
      : /[0-9_]/.test(ch) ? 0.556 : /[ijl]/.test(ch) ? 0.278 : /[ft]/.test(ch) ? 0.333 : /[mw]/.test(ch) ? (ch === 'm' ? 0.889 : 0.778) : /[a-z]/.test(ch) ? (bold ? 0.611 : 0.556) : /[ .,]/.test(ch) ? 0.278 : 0.333);
    return [...String(str)].reduce((a, ch) => a + em(ch) * (bold && !/[A-Z]/.test(ch) ? 1.02 : !bold && /[A-Z]/.test(ch) ? 0.93 : 1), 0) * h / 0.716;
  }
  /** The box of a one-line text: anchored at (x, y) by ha (0 left, 1 centre, 2 right) and va (0 base, 2 middle, 3 top). */
  function textBox(x, y, h, s, deg, ha, va) {
    const w = Math.max(1, String(s).length) * h * CHW, a = (deg || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const du = ha === 1 ? 0 : ha === 2 ? -w / 2 : w / 2, dv = va === 2 ? 0 : va === 3 ? -h * 0.6 : h * 0.5;
    return Spots.box(x + ux * du + vx * dv, y + uy * du + vy * dv, w + h * 0.3, h * 1.25, deg);
  }
  /** 2.44.12: textBox as wide as AutoCAD draws the text in Arial (a little more), for the crowded places. */
  const textBoxA = (x, y, h, s, deg, ha, va) => { const b = textBox(x, y, h, s, deg, ha, va), w = arialW(s, h) * 1.08 + h * 0.3, d = (w - 2 * b.hw) / 2 * (ha === 1 ? 0 : ha === 2 ? -1 : 1); return { ...b, cx: b.cx + b.ux * d, cy: b.cy + b.uy * d, hw: Math.max(b.hw, w / 2) }; };
  const GRID_FILL = 1.0, GRID_MAX = 4, GRID_FIX_MAX = 6, OVER_OK = 2; // beta 6.0: Auto picks 1/1 to 1/4; the user may fix 1/1 to 1/6; a grid is good enough with up to 2 pole blocks over a road on a GEO sheet (listed); beta 4.8: Tidy: the first guess of the grid: finer where the poles' blocks need more than the room round them; the finest: a quarter of the template's cell
  const ROADLINE_W = (t) => (t === 'road' ? 0.2 : 1); // v2.39.1: a text across a road edge line is better than over a label
  const POLELBL_W = (t) => (t === 'road' ? 1 : t === 'cable' ? 2.5 : 4); // v2.41: a pole's label: over a road edge line rather than the cable, over the cable rather than another label
  const NUM_W = (t) => (t === 'road' || t === 'cable' ? 0 : 1); // v2.41.1: a number's box (its circle is checked against the road itself)
  const LEAD_W = () => 1, LEAD_W2 = (t) => (t === 'road' || t === 'cable' ? 0 : 1); // v2.41.1: what a number's leader line may not cross
  const LL_W = (t) => (t === 'road' ? 0.15 : t === 'cable' ? 0.5 : 3); // v2.41: the lat/long of a point that is not a pole
  /** v2.41.1: the first free candidate in order of cost (how far from the usual place), else the one covering least (then the cheaper). */
  function pickC(spots, cands, w) { const L = cands.slice().sort((x, y) => x.cost - y.cost); let best = null; for (const c of L) { const n = c.boxes.reduce((t, b) => t + spots.hitsW(b, w), 0); if (!n) return c; if (!best || n < best.n - 1e-9 || (Math.abs(n - best.n) < 1e-9 && c.cost < best.cost)) best = { ...c, n }; } return best; }
  // v2.41.1: the places tried for a pole's label: straight out (a 0), moved sideways along the cable (sh) or further out (ex) first, then turned
  const LBL_VAR = (() => { const v = [];
    for (const ex of [0, 2, 4]) for (const sh of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10]) v.push({ a: 0, ex, sh, cost: ex * 0.5 + Math.abs(sh) * (sh > 0 ? 0.25 : 0.3) }); // (ahead first: the photo or number goes behind)
    for (const ex of [0, 2, 4]) for (const a of [15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150]) v.push({ a, ex, sh: 0, cost: 2 + Math.abs(a) / 15 + ex * 0.5 });
    return v; })();
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
    elec: { b: 'existing electric pole', layer: 'ELECTRIC POLE', sc: 0.647, r: 1.7, x: true }, // x: an X (its corners reach r·√2)
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
  const PH_STEP_MM = { 12: 9, 18: 18, 24: 36, 30: 48 }, PH_MAX_MM = 48; // beta 6.7: Drawing style › Photos, printed on the A3 sheet (Small, Normal, Large, Extra large)
  // beta 6.7: an existing Globe or Bayantel pole (the app's gtbt; an older job: its type GT or BT): a circle filled blue (GT_DISC, a block of one solid fill)
  const gtFill = (p) => p.el === 'Pole' && !(p.status === 'Proposed' || p.status === 'New') && (p.gtbt != null ? !!p.gtbt : ['GT', 'BT'].includes(String(p.mat || '').toUpperCase()));
  const GT_DISC = 'G-ESAA EXISTING GT POLE', GT_DISC_ICON = { w: 2, h: 2, f: [{ c: '#0000FF', l: [[...Array(48)].flatMap((_, i) => { const a = i * Math.PI / 24; return [1 + Math.cos(a), 1 + Math.sin(a)]; })] }] };
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
  /** beta 6.7: a template block in the existing colour: a copy of it with every entity blue (an existing arm, drawn as the new one) */
  function blueBlock(d, S, src) {
    const name = `${src} EXISTING`; if (S.blocks.has(name)) return name; if (!copyBlock(d, S, src, name, () => true)) return null;
    for (const e of (S.blocks.get(name) || { ents: [] }).ents) { for (let i = e.length - 1; i > 0; i--) if (e[i][0] === 420) e.splice(i, 1);
      const k = e.findIndex(([c], i) => i > 0 && c === 62); if (k > 0) e[k][1] = I(5); else { const l8 = e.findIndex(([c], i) => i > 0 && c === 8); e.splice(l8 > 0 ? l8 + 1 : e.length, 0, [62, I(5)]); } }
    return name;
  }
  /** v2.41: a new block made of the given entities (polylines [[x, y]…, closed] and texts), drawn in BYBLOCK colour on layer 0 so the
      insert's layer and colour show (the ODC cabinet). */
  function defineBlock(d, S, name, polys, texts, solids) {
    if (S.blocks.has(name)) return true;
    const T = d.sec('TABLES').recs, B = d.sec('BLOCKS').recs, tb = T.find((r) => typ(r) === 'TABLE' && get(r, 2) === 'BLOCK_RECORD');
    if (!tb) return false;
    const brH = d.newHandle(), head = (t, c) => [[0, t], [5, d.newHandle()], [330, brH], [100, 'AcDbEntity'], [8, '0'], [62, I(c == null ? 0 : c)]]; // (v2.42.1: c, an entity's own colour; else by block)
    const brec = [[0, 'BLOCK_RECORD'], [5, brH], [330, get(tb, 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, '0'], [70, I(0)], [280, I(1)], [281, I(0)]];
    const last = T.reduce((k, r, i) => (typ(r) === 'BLOCK_RECORD' ? i : k), -1); T.splice(last + 1, 0, brec);
    setFirst(tb, 70, I(parseInt(get(tb, 70, '0'), 10) + 1));
    const ents = [];
    (solids || []).forEach(({ pts: q, c }) => { const r = head('SOLID', c); r.push([100, 'AcDbTrace']); [[10, 20, 0], [11, 21, 1], [12, 22, 3], [13, 23, 2]].forEach(([gx, gy, k]) => r.push([gx, F(q[k][0])], [gy, F(q[k][1])], [gx + 20, '0.0'])); ents.push(r); }); // v2.42.2: filled (a quad: its corners in turn), first so the lines and text sit on top
    polys.forEach(({ pts, closed, w, c }) => { const r = head('LWPOLYLINE', c); r.push([100, 'AcDbPolyline'], [90, I(pts.length)], [70, I(closed ? 1 : 0)], [43, F(w || 0)]); pts.forEach(([x, y]) => r.push([10, F(x)], [20, F(y)])); ents.push(r); });
    (texts || []).forEach(({ x, y, h, s: str, rot, obl, style, c }) => { const r = head('TEXT', c); r.push([100, 'AcDbText'], [10, F(x)], [20, F(y)], [30, '0.0'], [40, F(h)], [1, str], [50, F(rot || 0)], [51, F(obl || 0)], [7, style && S.styles.has(style) ? style : 'Standard'], [72, I(1)], [11, F(x)], [21, F(y)], [31, '0.0'], [100, 'AcDbText'], [73, I(2)]); ents.push(r); });
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
  /** v2.42.2: the telco arm seen from above (design H1, approved): the mounting plate on the pole with its two bolts, the steel channel
      filled white with TELCO in bold red on it, the suspension clamp across it where the cable passes (about three quarters along,
      as on the field photo), the channel going on a little past it to its end. Metres at scale 1 from the pole's face (x = 0); the
      clamp at x = 2.7. flip: TELCO turned round (for an arm pointing left or down, so it reads the right way up). */
  function telcoArmTop(flip, bold) {
    const G = 8, W = 255, END = 3.7; // grey lines (seen on black and on white), white fill (stays white when printed)
    const polys = [], rect = (x0, y0, x1, y1, c) => polys.push({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, c });
    const solids = [{ pts: [[0.12, -0.5], [END, -0.5], [END, 0.5], [0.12, 0.5]], c: W }]; // the channel, filled white
    rect(0.12, -0.5, END, 0.5); polys.push({ pts: [[0.12, 0.38], [END, 0.38]], c: G }); polys.push({ pts: [[0.12, -0.38], [END, -0.38]], c: G }); // its outline and lips
    polys.push({ pts: [[END - 0.1, -0.5], [END - 0.1, 0.5]], c: G }); // the end cap
    rect(-0.12, -0.78, 0.12, 0.78); [0.6, -0.6].forEach((y) => polys.push({ pts: [[-0.06, y - 0.06], [0.06, y - 0.06], [0.06, y + 0.06], [-0.06, y + 0.06]], closed: true })); // the plate, its bolts
    rect(2.48, -0.66, 2.92, 0.66, G); polys.push({ pts: [[2.62, 0], [2.78, 0]], c: 1 }); polys.push({ pts: [[2.7, -0.08], [2.7, 0.08]], c: 1 }); // the clamp, its bolt (red: the cable)
    const texts = [{ x: 1.3, y: 0, h: 0.44, s: 'TELCO', rot: flip ? 180 : 0, style: bold || 'arial', c: 1 }]; // bold Arial TELCO is about 4.85 × its height long: 0.44 sits between the pole bracket (0.12) and the clamp (2.48)
    return { polys, texts, solids, clampX: 2.7, end: END };
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
  function vicCircle(xy, size, zoom) {
    const vk = size / 1500, xs = xy.map((q) => q[0]), ys = xy.map((q) => q[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max((zoom ? 330 : 70) * vk, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 45 * vk)]; // (beta 4.1, zoom: never under 22 % of the map, so a single pole's circle still reads)
  }
  /** v2.38: the places of a project, each drawn on its own vicinity map and key map: a point more than `gap` metres (1 km) from
      every other point starts a new place; a span joins its two ends. pts: [{ id, E, N }], spans: [{ ia, ib }]. Returns
      [{ idx: [indexes into pts], box: [x0, y0, x1, y1] }], in the order of their first point. */
  const LOC_GAP = 1000, VIC_MARGIN = 500, VIC_ZOOM_MIN = 300;
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
  /** v2.38: the vicinity map of a place: its points with a 500 m margin round them, at least 1.5 km across: [E, N, size].
      beta 3.4: and big enough for the PROJECT AREA circle and its label to fit inside the map's box. The circle's radius is half the
      points' diagonal + 45 m (per 1.5 km of map), the label sits about 40 m above it: with 25 m to spare, the half-size must be at least
      half the diagonal + 110 m per 1.5 km, i.e. the size at least 1.172 × the diagonal (1.18 here). A long route is zoomed out to fit;
      a short one keeps its 1.5 km. */
  function vicArea(box, zoom) {
    const w = box[2] - box[0], h = box[3] - box[1], dg = Math.hypot(w, h), wide = Math.max(1500, Math.max(w, h) + 2 * VIC_MARGIN, 1.18 * dg);
    // beta 4.1 (zoom): the circle's radius is half the diagonal + 3 % of the map's size, so a map 2.27 × the diagonal gives a circle half as wide as the map
    return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, zoom ? Math.min(wide, Math.max(VIC_ZOOM_MIN, 2.27 * dg)) : wide];
  }
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
  const AE_ = (lw) => ({ layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true, lw }), UG_ = (lw) => ({ layer: 'Proposed foc duct', color: 3, w: 0.7776, aerial: false, lw }); // v2.42.24: lw, the line weight by size (Balanced, 1/100 mm)
  const CABLE_STYLE = { L12: AE_(30), F12: AE_(30), F24: AE_(35), F48: AE_(40), F72: AE_(50), F144: AE_(60), CA12: AE_(30), CA24: AE_(35), CA48: AE_(40), CA72: AE_(50), CA144: AE_(60), U144: UG_(60), U288: UG_(70), CU12: UG_(30), CU24: UG_(35), CU48: UG_(40), CU72: UG_(50), CU144: UG_(60), /* 2.44.7: the conventional AE / UG cables */ '': { layer: 'PROPOSED FOC AERIAL 6 CORE', color: 1, w: 0.7776, aerial: true } };
  const PIN_ACI = { red: 1, navy: 5, green: 3, orange: 30 }; // v2.36: the colours of the app's marks and pins (AutoCAD colour numbers)
  /* v2.41: the user's drawing style (the app's Drawing style screen; these are the defaults). Colours are AutoCAD colour numbers
     (1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta, 7 white); 0 = by layer. Sizes in metres of the drawing (1:1100 on the
     GEO sheets: 1 m = 0.9 mm). */
  const NUM_STYLE = { color: 2, bcolor: 0, h: 3, d: 7, g: 2, leader: true, place: 'auto' }; // the number beside a point: text colour, circle colour (0 = as the text), text height, circle diameter (0 = none), distance from the point, leader line, first free spot / straight out from the road
  const ID_STYLE = { bold: false, color: 0, h: 2.5 }; // the IDs of NAPs, the ODC, handholes… (v2.40 and before: 2.5 m, by layer, not bold)
  const VIC_STYLE = { circle: 2, circleW: 7, route: 0, routeW: 16.5 }; // the vicinity map: the PROJECT AREA circle (yellow) and the route (0: by cable, red new / blue existing); widths per 1.5 km of map
  const TA_BLOCK = 'G-ESAA TELCO ARM'; // v2.42.1: the telco arm on the plan (from above); v2.42.2: and its twin 'G-ESAA TELCO ARM R' (TELCO turned round)
  const ODC_H = 9, ODC_BLOCK = 'G-ESAA ODC'; // v2.41: the ODC cabinet on the plan: its block (an isometric view), 9 m high
  const pinColor = (p) => (p && p.color && PIN_ACI[p.color] != null ? PIN_ACI[p.color] : null);
  /** beta 3.7: the line from a site's point (from its mark's edge) to its tower drawn beside it: to the tower's base or its top,
      whichever is nearer (both on the tower's middle line, where the model is drawn). */
  const towerLead = (p, W) => {
    const A = [W.ax, W.ay], B = [W.ax, W.ay + 48 * W.k], q = Math.hypot(A[0] - p.E, A[1] - p.N) <= Math.hypot(B[0] - p.E, B[1] - p.N) ? A : B;
    const d = Math.hypot(q[0] - p.E, q[1] - p.N), e = d > 1.8 ? 0.9 / d : 0; return [[p.E + (q[0] - p.E) * e, p.N + (q[1] - p.N) * e], q];
  };
    /** beta 3.8: the curved planning arrow from a tower drawn away from its point to the point: from the side of its leg that faces
        the point (10 % up; its foot or top when the point is below or above it), bulging upward, a tapered shaft and a solid head whose
        tip stops 1.1 m short of the point. quads: the shaft as filled pieces (SOLID: 1, 2, 3, 4 = left, right, next left, next right). */
  /** beta 3.8: the site name and ID on the tower (Drawing style: On the tower): their size and the box of their mask. */
  const towerNameBox = (p, W0) => {
    const nm = String(p.siteName || p.poleId || ''); if (!nm) return null;
    const pla = String(p.plaId || ''), K = W0.k, X = 12.4 * K, cy = W0.ay + 48 * K * 0.27, g = W0.nu || 1, h = Math.max(1.5 / g, Math.min(2.6 / g, 2 * X * 0.95 / Math.max(1, arialW(nm, 1, true)))), hp = h * 0.8, two = !!pla; // (beta 4.8: nu: Tidy's finer grid)
    const hw = (Math.max(arialW(nm, h, true), two ? arialW(pla, hp, false) : 0) + h * 0.5) / 2 + 0.4, hh = two ? (h * 1.3 + hp * 1.3 + 0.8) / 2 : h * 0.8;
    return { nm, pla, h, hp, two, cy, yN: two ? cy + hp * 0.7 : cy, yP: cy - h * 0.7, box: [W0.ax - hw, cy - hh, W0.ax + hw, cy + hh] };
  };
  const towerArrow = (p, W0, nb) => {
      const K = W0.k, X = 12.4 * K, f = 0.1, side = p.E < W0.ax ? -1 : 1, beside = Math.abs(p.E - W0.ax) > X;
      let lx = W0.ax + side * (X * (1 - f) + 1.6 * K * f + 0.8); if (nb) lx = side < 0 ? Math.min(lx, nb.box[0] - 0.8) : Math.max(lx, nb.box[2] + 0.8); // (clear of the name on the tower)
      const A = beside ? [lx, W0.ay + 48 * K * f] : p.N < W0.ay ? [W0.ax, W0.ay - 0.8] : [W0.ax, W0.ay + 48 * K + 0.8], B = [p.E, p.N];
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, TB = [W0.ax - X - 0.5, W0.ay - 0.5, W0.ax + X + 0.5, W0.ay + 48 * K + 0.5], inB = (q, b) => !!b && q[0] > b[0] && q[0] < b[2] && q[1] > b[1] && q[1] < b[3];
      const curve = (sg) => { const nx = -dy / L * sg, ny = dx / L * sg, C = [(A[0] + B[0]) / 2 + nx * L * 0.5, (A[1] + B[1]) / 2 + ny * L * 0.5]; const P = []; for (let i = 0; i <= 80; i++) { const t = i / 80; P.push([(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]]); } return { P, ny, n: P.filter((q) => inB(q, TB) || inB(q, nb && nb.box)).length }; };
      const c1 = curve(1), c2 = curve(-1), pickC2 = c2.n < c1.n || (c2.n === c1.n && c2.ny > c1.ny); // (the bulge that keeps off the tower and its name; else upward)
      const N = 80, P = (pickC2 ? c2 : c1).P, cum = [0]; for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const S0 = cum[N], at = (sv) => { let i = 1; while (i < N && cum[i] < sv) i++; const t = (sv - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), tx = P[i][0] - P[i - 1][0], ty = P[i][1] - P[i - 1][1], tl = Math.hypot(tx, ty) || 1; return { x: P[i - 1][0] + tx * t, y: P[i - 1][1] + ty * t, ux: tx / tl, uy: ty / tl }; };
      const hl = Math.min(4, Math.max(2.8, S0 * 0.26)) * Math.max(0.6, Math.min(1, K + 0.25)), hw = hl * 0.6, w0 = 0.3, w1 = hl * 0.42, sTip = S0 - 1.1, sBase = Math.max(0.5, sTip - hl), Lp = [], Rp = [];
      for (let i = 0; i <= 24; i++) { const q = at(sBase * i / 24), w = (w0 + (w1 - w0) * Math.pow(i / 24, 1.4)) / 2; Lp.push([q.x - q.uy * w, q.y + q.ux * w]); Rp.push([q.x + q.uy * w, q.y - q.ux * w]); }
      const b = at(sBase), t = at(sTip), quads = []; for (let i = 0; i < 24; i++) quads.push([Lp[i], Rp[i], Lp[i + 1], Rp[i + 1]]);
      return { quads, head: [[t.x, t.y], [b.x - b.uy * hw, b.y + b.ux * hw], [b.x + b.uy * hw, b.y - b.ux * hw]], mid: P.filter((q, i) => i % 4 === 0 && i <= N * 0.97), from: A };
    };
  const CABLE_LWT = 70; // v2.36: 0.70 mm, about the template's 0.78 m wide cable at 1 : 1200 (v2.42.24: the most; each cable its size's, cabLw)
  const exLw = (c) => (c <= 12 ? 30 : c <= 24 ? 35 : c <= 48 ? 40 : c <= 72 ? 50 : c <= 144 ? 60 : 70); // an existing cable: by its size
  const cabLw = (cable, existing, cores) => (existing ? exLw(+cores || 12) : (CABLE_STYLE[cable] || CABLE_STYLE['']).lw || CABLE_LWT);
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
  /** beta 4.8: Tidy: one grid for the whole plan, finer where the plan needs it: the template's cell, or 1/2, 1/3, 1/4 of it (job._grid),
      every GEO sheet at the same scale. Made at the first guess, then again with the next finer grid while labels find no place at
      1.8 / 1.3 mm or pole blocks sit over a road, kept where it leaves fewer (more sheets rather than a block over the road); and with
      the next coarser one where the first guess leaves none, so the cells are as large as they can be. From a copy of the job each time
      (the build moves some of its points, e.g. an ODF beside its tower). Standard: made once, as before. */
  function build(seedText, job) {
    if (!job || job.labels !== 'tidy' || job._grid) return buildOne(seedText, job);
    const copy = (v) => (v instanceof Date ? new Date(v.getTime()) : Array.isArray(v) ? v.map(copy) : v && typeof v === 'object' && !ArrayBuffer.isView(v) ? Object.keys(v).reduce((o2, k) => { o2[k] = copy(v[k]); return o2; }, {}) : v);
    const j0 = copy(job), at = (n) => { const nj = copy(j0); nj._grid = n; return buildOne(seedText, nj); }, G = (r) => r.report._grid, tried = [];
    /* beta 6.0 (the owner: "allow one or two blocks"): a grid is good enough when every label has a free place (nothing over anything)
       and no GEO sheet has more than 2 pole blocks over a road (they cover nothing else, and are listed under the Drawing checks);
       finer only beyond that. ok: good enough; worse: more labels without a place, or as many and more blocks over a road past the
       2 a sheet may keep. The user's own split (Drawing style › Grid): made once at that split. */
    const fix = Math.round(+((job.gridStyle || {}).split) || 0), ok = (g) => !g.bad && !g.ov && !g.overX && !g.lead, sc = (g) => [g.bad + (g.ov || 0) + (g.lead || 0), g.overX], /* (beta 6.0: a pole's block that needs its line counts as bad, unless lines are allowed) */ worse = (a, b) => { const x = sc(a), y = sc(b); return x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]); };
    const info = (g) => ({ n: g.n, cell: g.cell, sheets: g.sheets, bad: g.bad, over: g.over, overMax: g.overMax, textsOver: g.ov || 0, photosAway: g.phFar || 0, photosAwayMax: g.phFarMax || 0, blocksWithLine: g.leadAll || 0 });
    let r;
    if (fix >= 1) { r = at(Math.min(GRID_FIX_MAX, fix)); tried.push(G(r)); }
    else {
      r = buildOne(seedText, job); tried.push(G(r));
      if (G(r).n > 1 && ok(G(r))) for (let n = G(r).n - 1; n >= 1; n--) { const r2 = at(n); tried.push(G(r2)); if (!ok(G(r2))) break; r = r2; } // (coarser while good enough)
      else for (let n = G(r).n + 1; n <= GRID_MAX && !ok(G(r)); n++) { const r2 = at(n); tried.push(G(r2)); if (worse(G(r), G(r2))) r = r2; } // (finer until one is good enough, keeping the best)
    }
    if (r.report.tidy) r.report.tidy.grid = { ...r.report.tidy.grid, mode: fix >= 1 ? 'fixed' : 'auto', overMax: G(r).overMax, overSheets: G(r).overSheets, tried: tried.map(info) };
    delete r.report._grid; return r;
  }
  function buildOne(seedText, job) {
    centerCache.clear();
    const d = new Doc(seedText);
    d.keepRaster = true; const clean0 = clean(d); d.keepRaster = false; // v2.42.8: the template repaired before it is filled (its picture settings kept for the photos)
    const oldBlocks = purgeOld(d);
    let S = structure(d);
    if (!S.layouts.some((L) => L.name === 'GEO')) throw new Error('This is not the G-eSAA drawing template: it has no GEO sheet');
    if (!/@@\w+@@/.test(seedText)) throw new Error('This drawing template has no @@ fields: load the prepared seed (G-eSAA_seed…dxf), not the original template');
    const cell0 = job.cell || 440, viewH0 = job.viewH || cell0, pts = job.pts || [], spans = job.spans || [], runs = job.runs || [];
    const rep = { sheets: [], cells: [], blanks: [], counts: {}, notes: [] };
    /* beta 4.8: Tidy: the grid's cell, the template's or 1/2, 1/3, 1/4 of it (NU), the same for the whole plan: every GEO sheet shows one cell
       at NU times the template's scale, and the texts, symbols, numbers and photos drawn in metres are NU times smaller, so they print the
       same (the first line of a pole's block 1.8 mm high on the A3 PDF, the other lines 1.3 mm). job._grid: the one to use (see build);
       else a first guess by how crowded the busiest part of the plan is: the area its poles' blocks need against the room round them. */
    const NU = job.labels !== 'tidy' ? 1 : job._grid > 0 ? Math.min(GRID_FIX_MAX, Math.round(job._grid)) : (() => {
      const L0 = S.layouts.find((x) => x.name === 'GEO'), vp0 = L0 ? layoutEnts(d, S, L0).filter((e) => typ(e) === 'VIEWPORT').sort((a, b) => num(b, 40, 0) * num(b, 41, 0) - num(a, 40, 0) * num(a, 41, 0)).find((e) => Math.abs(num(e, 40, 0) - num(e, 41, 0)) < 1) : null;
      let K0 = 0.62; if (vp0 && viewH0 > 0) { const s0 = num(vp0, 41, 0) / viewH0, a0 = num(L0.rec, 44, 420), b0 = num(L0.rec, 45, 297), ww = num(L0.rec, 140, 0) - num(L0.rec, 48, 0), wh = num(L0.rec, 141, 0) - num(L0.rec, 49, 0), k0 = ww > 1 && wh > 1 ? Math.min((ww >= wh ? Math.max(a0, b0) : Math.min(a0, b0)) / ww, (ww >= wh ? Math.min(a0, b0) : Math.max(a0, b0)) / wh) : 1; if (s0 * k0 > 0.05 && s0 * k0 < 20) K0 = s0 * k0; }
      const tt = Array.isArray(job.tidyText) ? job.tidyText : [1.8, 1.3], l1 = tt[0] / K0, sm = tt[1] / K0, hb = l1 * 1.4 + 3.6 * 1.45 * sm, ph = Object.keys(job.photos || {}).length > 0 && job.markMode !== 'num';
      const wB = 2.1 * l1 + 0.5 + Math.max(arialW('0000000 · CC', l1), arialW('000.000000°', sm)) * 1.12 + (ph ? 0.8 + 0.75 * Math.min(hb, 10) : 0), aB = (wB + 2) * (hb + 2); // (a pole's block, its photo beside it, and the room round it)
      const byCell = new Map(); for (const p of pts) if (p.el === 'Pole') { const kk = `${Math.floor(p.E / cell0)},${Math.floor(p.N / cell0)}`; (byCell.get(kk) || byCell.set(kk, []).get(kk)).push(p); }
      let n0 = 1;
      for (const [kk, P] of byCell) {
        if (P.length < 8) continue;
        const [i, j] = kk.split(',').map(Number), x0 = i * cell0, y0 = j * cell0, R2 = 22 * 22, G = new Map(); P.forEach((p) => { const g = `${Math.floor((p.E - x0) / 22)},${Math.floor((p.N - y0) / 22)}`; (G.get(g) || G.set(g, []).get(g)).push(p); });
        let n = 0; for (let x = x0 + 2.5; x < x0 + cell0; x += 5) for (let y = y0 + 2.5; y < y0 + cell0; y += 5) { const gx = Math.floor((x - x0) / 22), gy = Math.floor((y - y0) / 22); let hit = false; for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) for (const q of G.get(`${gx + a},${gy + b}`) || []) if ((q.E - x) * (q.E - x) + (q.N - y) * (q.N - y) < R2) { hit = true; break; } if (hit) n++; }
        const U = n * 25 * 0.7, A1 = P.length * aB; let k = 1; while (k < GRID_MAX && A1 / (k * k) > GRID_FILL * U) k++; // (the area the blocks need, against the room round the poles)
        n0 = Math.max(n0, k);
      }
      return n0;
    })();
    const cell = cell0 / NU, viewH = viewH0 / NU;
    if (!pts.length) throw new Error('Nothing to draw: the project has no records');
    /* 1. the grid: 440 m cells placed so the route uses as few sheets as it can and keeps away from the sheet edges
       (job.gridOrigin [E, N] fixes it instead); the cells the route uses, in route order */
    // v2.38: the project's places (points more than 1 km apart): each has its own vicinity map and key map
    // v2.42.26: an ODF at a tower site (its pin within 45 m of the tower) drawn beside the tower, never over it: job.odfPlace auto (the
    //           side its cable comes from), left, right or below; the cable ends at it (the span lengths stay as surveyed); its label in step 9
    // beta 3.7: each tower where it covers nothing. The tower model is about 25 m wide and 48 m tall (at 1:1100), from its base up.
    //           At its point when that covers no other point (pole, box, site…), no other cable and no other tower; else beside or
    //           below its point, with a thin line to the point and a small mark there; at 3/4 or 1/2 size only when no full-size place
    //           is free. The cable still ends at the point; the tower's name and its ODF follow the tower (job.towerPlace 'site' keeps
    //           every tower at its point, as before).
    const towerAt = new Map(), arrowOf = new Map(); let towerFit = null; // (beta 3.8: placed again inside its point's sheet once the grid is known; the towers' arrows)
    { const TW = 12.4, TH = 48, list = pts.filter((p) => p.el === 'Site' && !/olt/i.test(p.siteKind || '')), done0 = [], keep = job.towerPlace === 'site';
      const segs = spans.filter((sp) => sp.a && sp.b).map((sp) => ({ a: sp.a, b: sp.b, ia: String(sp.ia), ib: String(sp.ib) }));
      const roadsL = (job.roads || []).filter((r) => r && r.pts && r.pts.length > 1);
      const clip = (a, b, x0, y0, x1, y1) => { // the length of segment a-b inside the box (Liang-Barsky)
        const dx = b[0] - a[0], dy = b[1] - a[1]; let t0 = 0, t1 = 1;
        for (const [pp, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
          if (pp === 0) { if (q < 0) return 0; continue; }
          const r = q / pp; if (pp < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; }
        }
        return Math.max(0, t1 - t0) * Math.hypot(dx, dy);
      };
      /** beta 3.8: Wc [x0, y0, x1, y1]: only places inside it (the GEO sheet of the point, 2 m in), a place past it moved inside;
          odfFixed: the tower's ODFs already drawn beside its point (they are then points like the others); done: the other towers. */
      const placeT = (T, Wc, odfFixed, done) => {
        const id = String(T.id), others = pts.filter((q) => q !== T), odfNear = (q) => !odfFixed && q.el === 'ODF' && Math.hypot(q.E - T.E, q.N - T.N) < 45, odfIds = new Set(others.filter(odfNear).map((q) => String(q.id)));
        const inW = (b) => !Wc || (b[0] >= Wc[0] - 1e-6 && b[1] >= Wc[1] - 1e-6 && b[2] <= Wc[2] + 1e-6 && b[3] <= Wc[3] + 1e-6);
        const near = others.filter((q) => Math.abs(q.E - T.E) < 120 && Math.abs(q.N - T.N) < 160), sg = segs.filter((g) => Math.min(g.a[0], g.b[0]) < T.E + 120 && Math.max(g.a[0], g.b[0]) > T.E - 120 && Math.min(g.a[1], g.b[1]) < T.N + 160 && Math.max(g.a[1], g.b[1]) > T.N - 160);
        const cost = (ax, ay, k, atSite) => {
          const x0 = ax - TW * k - 0.6, x1 = ax + TW * k + 0.6, y0 = ay - 0.6, y1 = ay + TH * k + 0.6; let c = 0, hard = 0;
          for (const q of near) { // a point under the tower (3 m round its symbol), or so close its labels have no room (8 m)
            if (atSite && odfNear(q)) continue; // (its ODF is then drawn beside it)
            const dx = Math.max(x0 - q.E, 0, q.E - x1), dy = Math.max(y0 - q.N, 0, q.N - y1), d = Math.hypot(dx, dy);
            if (d < 3) { c += 100; hard++; } else if (d < 8) c += 10;
          }
          for (const g of sg) { const L = clip(g.a, g.b, x0, y0, x1, y1); if (!L) continue; if (atSite && (g.ia === id || g.ib === id || odfIds.has(g.ia) || odfIds.has(g.ib))) continue; c += L * 3; } // (its own cable ends under it at its point; its ODF's cables go with the ODF beside it)
          for (const r of roadsL) for (let i = 1; i < r.pts.length; i++) { const L = clip(r.pts[i - 1], r.pts[i], x0, y0, x1, y1); if (L) c += L * 0.05; }
          for (const b of done) if (!(x1 < b[0] || x0 > b[2] || y1 < b[1] || y0 > b[3])) { c += 300; hard++; }
          return { c, hard, box: [x0, y0, x1, y1] };
        };
        const k1 = 1 / NU; let best = { ax: T.E, ay: T.N, k: k1, moved: false, ...cost(T.E, T.N, k1, true) }; const at0 = best.c; // (beta 4.8: Tidy: on a finer grid, as much smaller)
        if (!inW(best.box)) best = { ...best, c: Infinity };
        if (keep && Wc && best.c === Infinity) for (const [k, kc] of [[0.75 * k1, 25], [0.5 * k1, 60]]) { const r = cost(T.E, T.N, k, true); if (inW(r.box) && r.c + kc < best.c) best = { ax: T.E, ay: T.N, k, moved: false, ...r, c: r.c + kc }; } // (kept at its point: smaller there)
        if (keep && best.c === Infinity) best = { ax: T.E, ay: T.N, k: k1, moved: false, ...cost(T.E, T.N, k1, true) };
        if (!keep && best.c > 0.5) {
          const cands = [];
          for (const [k, kc] of [[k1, 0], [0.75 * k1, 25], [0.5 * k1, 60]]) {
            const w = TW * k, h = TH * k;
            if (k < 1) cands.push([T.E, T.N, k, kc]); // smaller, at its point
            for (const g of [3, 9, 17, 27]) { // beside it (base level with the point, the point at its middle, the top level with it), then below it
              for (const sx of [1, -1]) for (const by of [0, -h / 2, -h]) cands.push([T.E + sx * (w + g), T.N + by, k, kc + g * 0.5 + (by ? 2 : 0)]);
              cands.push([T.E, T.N - h - g, k, kc + g * 0.5 + 3]);
              for (const sx of [1, -1]) cands.push([T.E + sx * (w + g), T.N - h - g, k, kc + g * 0.7 + 4]);
            }
          }
          if (Wc) for (const [ax, ay, k, kc] of cands.slice()) { // beta 3.8: a place past the sheet's edge, moved inside it
            const x0 = ax - TW * k - 0.6, x1 = ax + TW * k + 0.6, y0 = ay - 0.6, y1 = ay + TH * k + 0.6, dx = Math.max(Wc[0] - x0, 0) - Math.max(x1 - Wc[2], 0), dy = Math.max(Wc[1] - y0, 0) - Math.max(y1 - Wc[3], 0);
            if (dx || dy) cands.push([ax + dx, ay + dy, k, kc + 5 + Math.abs(dx) * 0.5 + Math.abs(dy) * 0.5]);
          }
          for (const [ax, ay, k, kc] of cands) {
            const r = cost(ax, ay, k, ax === T.E && ay === T.N), tot = r.c + kc + 8;
            if (!inW(r.box)) continue;
            if (tot < best.c - 1e-9) best = { ax, ay, k, moved: !(ax === T.E && ay === T.N), ...r, c: tot };
          }
        }
        if (best.c === Infinity) best = { ax: T.E, ay: T.N, k: k1, moved: false, ...cost(T.E, T.N, k1, true) }; // (nothing inside: at its point)
        return { best, at0 };
      };
      for (const T of list) {
        const { best, at0 } = placeT(T, null, false, done0);
        done0.push(best.box); towerAt.set(T, best);
        (rep.towers = rep.towers || []).push({ id: String(T.id), at: [+best.ax.toFixed(2), +best.ay.toFixed(2)], scale: best.k, moved: best.moved, covered: +at0.toFixed(1), box: best.box.map((v) => +v.toFixed(2)) });
      }
      /* beta 3.8: once the grid is known, each tower inside the GEO sheet of its point (2 m in): one placed past the sheet's edge (the
         next sheet may not be made, and its name went with it) is placed again inside it; the others stay where they are */
      towerFit = (Wof) => {
        const ins = (T) => { const b = towerAt.get(T).box, W = Wof(T.E, T.N); return b[0] >= W[0] - 1e-6 && b[1] >= W[1] - 1e-6 && b[2] <= W[2] + 1e-6 && b[3] <= W[3] + 1e-6; };
        const out = list.filter((T) => !ins(T)), done = list.filter((T) => !out.includes(T)).map((T) => towerAt.get(T).box);
        for (const T of out) {
          const b0 = towerAt.get(T), { best } = placeT(T, Wof(T.E, T.N), !b0.moved, done);
          done.push(best.box); towerAt.set(T, best);
          const R0 = (rep.towers || []).find((x) => x.id === String(T.id)); if (R0) Object.assign(R0, { at: [+best.ax.toFixed(2), +best.ay.toFixed(2)], scale: best.k, moved: best.moved, box: best.box.map((v) => +v.toFixed(2)), intoSheet: true });
        }
        return out.length;
      };
    }
    const tw = (T) => { const w = towerAt.get(T) || { ax: T.E, ay: T.N, k: 1 / NU, moved: false }; if (NU > 1) w.nu = NU; return w; }; // (beta 4.8: nu: Tidy's finer grid, for the name on the tower)
    const odfMoved = new Map();
    { const byId0 = new Map(pts.map((p) => [String(p.id), p])), towers = pts.filter((p) => p.el === 'Site' && !/olt/i.test(p.siteKind || '')), nAt = new Map();
      for (const od of pts) { if (od.el !== 'ODF') continue;
        let T = null, dT = 45; towers.forEach((t) => { const dd = Math.hypot(t.E - od.E, t.N - od.N); if (dd < dT) { dT = dd; T = t; } }); if (!T) continue;
        if (tw(T).moved) continue; // beta 3.7: the tower is drawn beside its point: the ODF stays where it was surveyed
        let side = ['left', 'right', 'below'].includes(job.odfPlace) ? job.odfPlace : 'auto';
        if (side === 'auto') { const nb = spans.map((sp) => (String(sp.ia) === String(od.id) ? sp.ib : String(sp.ib) === String(od.id) ? sp.ia : null)).filter((x) => x != null).map((x) => byId0.get(String(x))).find((q) => q && q !== T && q.el !== 'Site');
          const tE = tw(T).ax, tN = tw(T).ay; side = !nb ? 'left' : nb.E < tE - 13 ? 'left' : nb.E > tE + 13 ? 'right' : nb.N < tN ? 'below' : nb.E <= tE ? 'left' : 'right'; } // (beta 3.7: from where the tower is drawn)
        const k = nAt.get(T) || 0; nAt.set(T, k + 1);
        const W0 = tw(T), wE = W0.ax, wN = W0.ay, gap = 12.4 * W0.k + 7.6; // beta 3.7: beside the tower where it is drawn (at its size)
        const E = side === 'left' ? wE - gap - 12 * k : side === 'right' ? wE + gap + 12 * k : wE + 12 * k, N = side === 'below' ? wN - 9 : wN + 4;
        odfMoved.set(od, { side, T }); od.E = E; od.N = N;
        spans.forEach((sp) => { if (String(sp.ia) === String(od.id) && sp.a) sp.a = [E, N]; if (String(sp.ib) === String(od.id) && sp.b) sp.b = [E, N]; });
      }
      rep.odfs = [...odfMoved].map(([od, m]) => ({ id: String(od.id), side: m.side, tower: String(m.T.id), at: [+od.E.toFixed(2), +od.N.toFixed(2)] }));
    }
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
    if (towerFit) rep.towersIntoSheet = towerFit((E, N) => { const i = ci(E), j = cj(N); return [gox + i * cell + 2, goy + j * cell + 2, gox + (i + 1) * cell - 2, goy + (j + 1) * cell - 2]; }); // beta 3.8
    const used = new Map(), order = [];
    const visit = (E, N, lk) => { const k = key(ci(E), cj(N)); if (!used.has(k)) { used.set(k, { i: ci(E), j: cj(N), loc: lk }); order.push(k); } };
    samp.forEach((q) => visit(q[0], q[1], q[2]));
    // v2.38: each place's cells with a ring of cells round them (its key map), named within the place: row letters from the top,
    // column numbers from the left (with several places, the place's number first: 1B-3, 2A-1)
    const lr = locs.map((_, k) => { const cs = [...used.values()].filter((c) => c.loc === k); if (!cs.length) return null; const is = cs.map((c) => c.i), js = cs.map((c) => c.j); return { I0: Math.min(...is) - 1, I1: Math.max(...is) + 1, J0: Math.min(...js) - 1, J1: Math.max(...js) + 1 }; });
    const lrs = lr.filter(Boolean), I0 = Math.min(...lrs.map((r) => r.I0)), I1 = Math.max(...lrs.map((r) => r.I1)), J0 = Math.min(...lrs.map((r) => r.J0)), J1 = Math.max(...lrs.map((r) => r.J1));
    const locOfCell = (i, j) => { const c = used.get(key(i, j)); if (c) return c.loc; const k = lr.findIndex((r) => r && i >= r.I0 && i <= r.I1 && j >= r.J0 && j <= r.J1); return k < 0 ? 0 : k; };
    const cellName = (i, j) => { const k = locOfCell(i, j), r = lr[k] || lrs[0]; return `${nL > 1 ? k + 1 : ''}${letters(r.J1 - j)}-${i - r.I0 + 1}`; };
    const geoCells = order.map((k, n) => [used.get(k), n]).sort((a, b) => a[0].loc - b[0].loc || a[1] - b[1]).map((x) => x[0]); // place by place, in route order
    const kAt = () => NU; // (beta 4.8: Tidy: the metres of a size as printed at the template's scale, over this: the grid's NU)
    const N = geoCells.length;
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
    /** v2.42.10: a text's box inside the GEO cell of the point (E, N), 2 m in (the sheet's viewport cuts it off otherwise). */
    const cellHolds = (bx, E, N) => { // (its capitals a little wider than the estimate)
      const ci = Math.floor((E - gox) / cell), cj = Math.floor((N - goy) / cell), W = [gox + ci * cell + 2, goy + cj * cell + 2, gox + (ci + 1) * cell - 2, goy + (cj + 1) * cell - 2];
      return [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, c]) => { const x = bx.cx + bx.ux * bx.hw * 1.3 * a + bx.vx * bx.hh * c, y = bx.cy + bx.uy * bx.hw * 1.3 * a + bx.vy * bx.hh * c; return x >= W[0] && x <= W[2] && y >= W[1] && y <= W[3]; });
    };
    /** beta 3.4: an upright box (centre q, half sizes hw, hh) inside the GEO sheet of the point (E, N), 2 m in from its grid line. */
    const cellHoldsQ = (q, hw, hh, E, N) => {
      const ci = Math.floor((E - gox) / cell), cj = Math.floor((N - goy) / cell);
      return q[0] - hw >= gox + ci * cell + 2 && q[0] + hw <= gox + (ci + 1) * cell - 2 && q[1] - hh >= goy + cj * cell + 2 && q[1] + hh <= goy + (cj + 1) * cell - 2;
    };
    let nInCell = 0; // v2.42.10: site names kept inside their GEO sheet
    // grid
    const cellsI = I1 - I0 + 1, cellsJ = J1 - J0 + 1, gridAll = cellsI * cellsJ <= 900;
    const KMLAY = 'G-ESAA KEYMAP GRID'; if (kmNames.length) addLayer(d, S, KMLAY, 2);
    const printK = (() => { // printed mm per metre of the GEO sheet
      const L = S.layouts.find((x) => x.name === 'GEO'), vp = L ? bigVp(L) : null; if (!vp || !(viewH > 0)) return 0;
      const s = num(vp, 41, 0) / viewH0, a = num(L.rec, 44, 420), b = num(L.rec, 45, 297), pw = Math.max(a, b), ph = Math.min(a, b); // (beta 4.8: at the template's scale; Tidy's finer grid: see NU)
      const ww = num(L.rec, 140, 0) - num(L.rec, 48, 0), wh = num(L.rec, 141, 0) - num(L.rec, 49, 0), k = ww > 1 && wh > 1 ? Math.min((ww >= wh ? pw : ph) / ww, (ww >= wh ? ph : pw) / wh) : 1;
      return s * k > 0.05 && s * k < 20 ? s * k : 0;
    })();
    const gh = cell * 0.1; // v2.39: a tenth of the cell (the template's sample: a fifth, covering the plan; the company's plans: 4 to 12 %)
    /* beta 6.0: Drawing style › Grid (job.gridStyle): the sheets' names in a corner (pos: tr top right, the default; tl, br, bl), their height as
       printed on the A3 PDF (h mm; 0: Auto, a tenth of the sheet as before) and colour (0: by layer). Standard draws them as before unless set. */
    const GS = job.gridStyle || {}, GPOS = { tr: [1, 1, 3], tl: [-1, 1, 1], br: [1, -1, 9], bl: [-1, -1, 7] }, gPos = GPOS[GS.pos] ? GS.pos : 'tr', gCol = +GS.color > 0 ? +GS.color : job.labels === 'tidy' ? TC0 + 0xc8c8c8 : null; // (beta 6.0: Tidy's Auto: light grey, ACI 9 for older CAD; Standard: the template's layer colour)
    const ghS = +GS.h > 0 ? Math.min(cell * 0.2, +GS.h / ((printK || 0.62) * NU)) : gh, gSet = gPos !== 'tr' || +GS.h > 0 || gCol != null;
    for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
      if (!gridAll && ![-1, 0, 1].some((di) => [-1, 0, 1].some((dj) => used.has(key(i + di, j + dj))))) continue;
      const x0 = gox + i * cell, y0 = goy + j * cell;
      o.lwpoly(lay('GRIDS'), [[x0, y0], [x0 + cell, y0], [x0 + cell, y0 + cell], [x0, y0 + cell]], { closed: true, color: 6 });
      if ((job.labels === 'tidy' && used.has(key(i, j))) || gSet) { // beta 6.0: the sheet's name in the corner chosen (top right unless set), its size and colour as set; under the details, nothing keeps off it (see-through: drawn first, the details over it)
        const [sx, sy, att] = GPOS[gPos], mx = cell * 0.04, my = cell * 0.03;
        o.mtext(lay('GRIDNO.', 'GRIDNO'), sx > 0 ? x0 + cell - mx : x0 + mx, sy > 0 ? y0 + cell - my : y0 + my, ghS, cellName(i, j), { att, color: gCol });
      } else o.mtext(lay('GRIDNO.', 'GRIDNO'), x0 + cell - cell * 0.04, y0 + cell - cell * 0.03, gh, cellName(i, j), { att: 3 });
      if (kmNames.length) { // v2.42.10: for the KEYMAP sheet only (its layer frozen on the others): the cell's name large in the cell's
        // centre, yellow over a dark shadow (the small yellow name at the corner could not be read at the keymap's scale)
        const kh = cell * 0.17, sh = kh * 0.07, nm = `{\\fArial|b1|i0|c0|p34;${cellName(i, j)}}`, cx = x0 + cell / 2, cy = y0 + cell / 2;
        o.mtext(KMLAY, cx + sh, cy - sh, kh, nm, { att: 5, style: 'arial', color: 250 }); o.mtext(KMLAY, cx, cy, kh, nm, { att: 5, style: 'arial', color: 2 });
      }
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
    // v2.41.1: with their rounded corners as drawn (the straight line across a corner missed up to a metre of the curve); the same
    //          pieces, by place, keep the pole symbols off the road lines (step 1)
    const EDGE_C = 12, edgeG = new Map();
    { const nearRoute = (m) => pts.some((p) => Math.abs(p.E - m[0]) < 160 && Math.abs(p.N - m[1]) < 160);
      for (const l of flatEdges(R.edges)) for (let k = 1; k < l.length; k++) {
        const a = l[k - 1], b = l[k], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = dist2(a, b);
        if (!(L > 0.05) || !nearRoute(m)) continue;
        spots.add(Spots.box(m[0], m[1], L, 0.25, deg(unit(a, b))), 'road');
        for (let x = Math.floor(Math.min(a[0], b[0]) / EDGE_C); x <= Math.floor(Math.max(a[0], b[0]) / EDGE_C); x++)
          for (let y = Math.floor(Math.min(a[1], b[1]) / EDGE_C); y <= Math.floor(Math.max(a[1], b[1]) / EDGE_C); y++) { const key = `${x},${y}`; (edgeG.get(key) || edgeG.set(key, []).get(key)).push([a, b]); }
      } }
    const edgesNear = (q) => { const gx = Math.floor(q[0] / EDGE_C), gy = Math.floor(q[1] / EDGE_C), s = new Set(); for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const e of edgeG.get(`${x},${y}`) || []) s.add(e); return [...s]; };
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
    const kG = Math.max(0.6, Math.min(1, (nns.length ? nns[Math.floor(nns.length * 0.2)] : 25) / 25)) / NU; // (beta 4.8: Tidy: on a finer grid, as much smaller)
    for (const p of polesOnly) p.k = kG;
    for (const p of pts) {
      p.dp = [p.E, p.N]; p.td = null; p.near = null; p.keep = !!(p.adjusted || p.status === 'Proposed' || p.status === 'New');
      if (p.el === 'Pole') { p.sym = S.blocks.has(symOf(p).b) ? symOf(p) : { ...symOf(p), b: null }; p.rp = p.sym.r * p.k; } else if (INLINE_EL.has(p.el)) p.rp = 0; else continue;
      // v2.42.27: a pole on the route beside the road its cable runs along (its arm square to the cable), not a nearer cross street
      const Q = p.el === 'Pole' ? (nb.get(p) || []) : [], tq = Q.length >= 2 ? unit([Q[0].E, Q[0].N], [Q[1].E, Q[1].N]) : Q.length === 1 ? unit([p.E, p.N], [Q[0].E, Q[0].N]) : null;
      const near = nearestRoad(R.roads, p.dp, 25, tq && Number.isFinite(tq[0]) && (tq[0] || tq[1]) ? tq : null); if (!near) continue;
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
    // v2.41.1: a pole symbol that would touch a road edge line (a rounded street corner, or the corners of the X of an electric pole
    //          beside a slanted road) is moved off it, by as little as needed (3 m at most) and never into a road; the cable stays where
    //          it was. Where that is not possible the pole stays as it was.
    let nCleared = 0;
    for (const p of pts) {
      if (p.el !== 'Pole' || !p.near || p.kept) continue;
      const reach = (v) => p.rp * (p.sym.x && p.sym.b ? Math.abs(v[0]) + Math.abs(v[1]) : 1) + 0.3; // the symbol's reach in direction v, and a little room
      const worst = (q) => { let w = null; for (const [a, b] of edgesNear(q)) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
        const c = [a[0] + t * dx, a[1] + t * dy], d = dist2(q, c), v = d > 1e-6 ? [(q[0] - c[0]) / d, (q[1] - c[1]) / d] : [-p.td[0], -p.td[1]], need = reach(v) - d;
        if (need > 0 && (!w || need > w.need)) w = { need, v };
      } return w; };
      let q = p.dp.slice(), w = worst(q);
      if (!w) continue;
      for (let it = 0; it < 10 && w; it++) { q = add2(q, w.v, w.need + 0.02); w = worst(q); }
      if (w || dist2(q, p.dp) > 3 || R.idx.inside(q, -1, -0.2)) continue; // no room: as it was
      const mv = [q[0] - p.dp[0], q[1] - p.dp[1]];
      if (p.cab) p.cab -= mv[0] * p.td[0] + mv[1] * p.td[1];
      p.dp = q; p.moved = dist2(q, [p.E, p.N]); nCleared++;
    }
    const tangent = (p) => { const Q = nb.get(p) || []; return Q.length >= 2 ? unit(Q[0].dp, Q[1].dp) : Q.length === 1 ? unit(p.dp, Q[0].dp) : [1, 0]; };
    // 2. where the cable meets each pole: on its road side, past its arm when it has one
    for (const p of pts) {
      if (p.el !== 'Pole') { p.A = p.dp; continue; }
      p.arm = armOf(p.armType); if (p.arm && !S.blocks.has(p.arm.b)) p.arm = null;
      { /* beta 6.7 (the owner: "the blocks model must be the same on the new, only that it is colored blue (Existing)"): an extension arm
           26" / 44.5" or a 10-pin alley arm already on the pole (its details, p.armText) is drawn with the template's model of that arm,
           as a new one is, at its length (the cable meets its end), blue; beside a new arm when the pole has one too */
        const exA = p.telcoArm && p.armText && !/TELCO/i.test(p.armText) ? armOf(p.armText) : null;
        if (exA && S.blocks.has(exA.b)) { if (p.arm) p.arm2 = { ...exA, ex: true }; else p.arm = { ...exA, ex: true }; } }
      if (!p.td) { const t = tangent(p), L = [-t[1], t[0]], q = (nb.get(p) || []).find((x) => x.td); let s = 1; if (q) { const tq = tangent(q); s = Math.sign(q.td[0] * -tq[1] + q.td[1] * tq[0]) || 1; } p.td = [L[0] * s, L[1] * s]; p.free = true; }
      // v2.39: beside a road the cable runs along its line inside the road, an arm reaching it; a pole away from the roads keeps the
      // cable close by (past its arm when it has one)
      let reach = p.cab ? p.cab : p.rp + (p.arm ? p.arm.reach : CABLE_OFF);
      // v2.42: an arm is drawn at its own length again (v2.37, and the template's legend: single and double 5 m, extension 6–7 m), the
      //        cable meeting its end (v2.39 to v2.41 drew it only from the pole to the cable's usual line, 2 m or so, too small to read).
      //        On a narrow road the pole is set back from the road (3 m at most) so the cable stays in the road, 1 m from its far side;
      //        only beyond that is the arm drawn shorter.
      if (p.arm && p.cab && p.near) {
        const want = p.rp + p.arm.reach, maxDepth = Math.max(CABLE_IN, 2 * p.near.r.hw - 1.0); let dE = p.cab - CABLE_IN; // pole centre → road edge
        const over = want - dE - maxDepth;
        if (over > 0) { const back = Math.min(3, over); p.dp = add2(p.dp, p.td, -back); dE += back; p.moved = dist2(p.dp, [p.E, p.N]); }
        reach = Math.min(want, dE + maxDepth);
      }
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
      else if (q.el === 'NAP' && !best.nap2 && !best.nap2Id && (q.poleId || '') !== (best.napId || '')) { best.nap2 = true; best.nap2Id = q.poleId || ''; best.nap2Type = q.napType || ''; best.nap2Old = q.status === 'Existing'; q.onPole = best; } // v2.42: its second box
      if (q.el === 'Closure' && !best.closure && !best.closureId) { best.closure = true; best.closureId = q.poleId || q.closureId || ''; q.onPole = best; }
    }
    // v2.37: the blocks that sit ON the cable (NAPs of every kind, the ODC, handholes, manholes, service boxes): turned along the
    // cable (a NAP and an ODC with their input side toward the homing), the cable meeting their two sides, the ID below
    /* beta 4.8: Tidy tidies the whole map, not only the pole labels. W: the street's width where a thing sits (the distance between
       its road's two edge lines, as the roads are drawn), else the usual width of the streets along the route, else none (a drawing
       with no roads: the symbols at today's sizes). The symbols on the cable are made at most 0.7 W across (never larger), numbers at
       most W; every text of the route takes its size from TS, one set tied to W and to the size the GEO sheet prints at (its plot
       window fitted to its paper, as the PDF and a plot to fit print it). The street names stay as the template draws them. */
    const TIDY = job.labels === 'tidy', tidySym = [], tidyBadged = new Set(), tidyCard = new Set(); // (beta 4.8: the poles whose number / photo is in their Tidy label) // (tidySym: the IDs, loop lengths and closure names, level labels placed with the pole labels)
    const wMed = (() => { const ws = polesOnly.filter((p) => p.near && p.near.r.w > 0).map((p) => p.near.r.w).sort((a, b) => a - b); return ws.length ? ws[Math.floor(ws.length / 2)] : 0; })();
    const streetAt = (q) => { // [W, the street's direction or null] (inside a road: the narrowest road there (at a junction, the side street); outside: the nearest road)
      if (!wMed) return [0, null]; let w = 0, dir = null;
      for (const sg of R.idx.at(q)) { const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - sg.a[0]) * dx + (q[1] - sg.a[1]) * dy) / L2)); if (Math.hypot(q[0] - sg.a[0] - t * dx, q[1] - sg.a[1] - t * dy) <= sg.hw + 0.3 && (!w || 2 * sg.hw < w)) { w = 2 * sg.hw; dir = [dx / Math.sqrt(L2), dy / Math.sqrt(L2)]; } }
      if (w) return [w, dir]; const nr = nearestRoad(R.roads, q, 25); return nr && nr.r.w > 0 ? [nr.r.w, nr.dir] : [wMed, null];
    };
    const streetW = (q) => streetAt(q)[0];
    /** beta 4.8: how wide a symbol is across its street: its size along its axis (deg) and across it, turned as the street runs at q */
    const acrossSt = (al, ac, axDeg, q) => { const sd = streetAt(q)[1]; if (!sd) return Math.max(al, ac); const a = axDeg * Math.PI / 180, c = Math.abs(Math.cos(a) * sd[0] + Math.sin(a) * sd[1]), sn = Math.sqrt(Math.max(0, 1 - c * c)); return al * sn + ac * c; };
    const fitW = (across, q) => { const w = TIDY ? streetW(q) : 0; return w > 0 && across > 0.66 * w ? 0.66 * w / across : 1; }; // (the factor that makes a symbol at most 0.7 W across, a little less to be sure; 1: as it is)
    const TS = TIDY ? (() => { // (heights in metres. ladder: the sets tried, as printed (mm), largest first: the Tidy labels take the largest where they have room, see the end of step 8; job.tidyText [mm, mm]: one set, for tests)
      const K = printK || 0.62, w = wMed || 7, sz = ([a, b]) => { const l1 = Math.max(1.5, Math.min(a / K, 3.0)); return { l1, sm: Math.max(1.1, Math.min(b / K, 0.8 * l1)) }; }; // (beta 4.8: as printed (mm on the A3 PDF), not capped by the street: a finer grid makes them smaller in metres)
      const ladder = (Array.isArray(job.tidyText) ? [job.tidyText] : [[1.8, 1.3], [1.5, 1.15], [1.3, 1.0]]).map(sz); // (beta 4.8: 1.8 / 1.3 mm first, a finer grid making the room; smaller only where the finest grid has none)
      return { ...ladder[0], id: ladder[0].l1, ladder, pick(s) { this.l1 = s.l1; this.sm = s.sm; this.id = s.l1; }, span(W, k) { return Math.max(1.3 / K / (k || 1), Math.min(this.sm / (k || 1), 0.3 * (W || w))); }, /* (span lengths, cable labels: inside the street where they fit, 1.3 mm at least) */ ph: Math.max(6, 1.4 * w), mm: K, guys: [] }; // (ph: a photo's longest side)
    })() : null;
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
    const inl = new Map(), cloLate = []; let nCloOff = 0; // (2.44.12: the crowded closures drawn away from their pole)
    /* 2.44.12: a closure in proportion to the drawing: its pentagon about a third of its street's width round (2.2 to 4.35 m, the
       template's size; 7 m streets where the roads are not known), its PROPOSED and ID as large as the other IDs. Where its pole is
       crowded (another point, or the riser's place toward a manhole, within a few metres) it is drawn on its cable a little away from
       the pole, where it covers nothing, else beside it with a line to it (below, with the closures not on the cable). */
    const cloR = (q) => { if (TIDY && q) return 4.35 * fitW(1.9 * 4.35, q) / kAt(q[0], q[1]); /* (beta 4.8: Tidy: 0.7 W at most, the grid's size) */ const nr = R.roads.length && q ? nearestRoad(R.roads, q, 25) : null, W = nr && nr.r.hw > 0 ? 2 * nr.r.hw : 7; return Math.max(2.2, Math.min(4.35, W / 3)); };
    const RISER_B = 'proposed riser', riserR = (() => { const b = blockBox(S, RISER_B, 0); return b ? Math.max(b[2] - b[0], b[3] - b[1]) * 0.7803353843555049 / 2 : 3; })();
    const ugOf = (p) => (nb.get(p) || []).filter((q) => q.A && spans.some((s0) => ((byId.get(String(s0.ia)) === p && byId.get(String(s0.ib)) === q) || (byId.get(String(s0.ib)) === p && byId.get(String(s0.ia)) === q)) && (CABLE_STYLE[s0.cable] || CABLE_STYLE['']).aerial === false));
    const isRiser = (p) => !!p.riser || (ugOf(p).length > 0 && spans.some((s0) => (byId.get(String(s0.ia)) === p || byId.get(String(s0.ib)) === p) && (CABLE_STYLE[s0.cable] || CABLE_STYLE['']).aerial !== false));
    const rOfPt = (q) => (q.el === 'Pole' ? q.rp || 1.2 : INLINE_EL.has(q.el) ? 3.2 : q.el === 'Site' ? 8 : 2);
    const cloCrowd = (p, Rc) => pts.some((q) => q !== p && !q.onPole && [q.A, q.dp].some((a) => a && dist2(a, p.A) < Rc + rOfPt(q) + 1.5))
      || (isRiser(p) && ugOf(p).some((q) => dist2(q.A, p.A) < Rc + 2 * riserR + rOfPt(q) + 1.5)); // (another point too near, or no room for the riser toward the underground)
    const pastPole = (p, u) => add2(p.A, u, Math.max(rOfPt(p), p.riserAt ? (p.riserAt.c[0] - p.A[0]) * u[0] + (p.riserAt.c[1] - p.A[1]) * u[1] + p.riserAt.r : 0) + 0.6); // (2.44.12: along u from its cable point, past its symbol and its riser)
    const crowdAt = (p) => !!p.cloOff || (p.el === 'Pole' && !!p.A && isRiser(p) && ugOf(p).some((q) => dist2(q.A, p.A) < 2 * riserR + rOfPt(q) + (p.rp || 1.2) + 2)); // (a riser pole with a manhole or pole close on its underground side)
    const blkEnd = (it, A, toward) => { if (!it) return A; if (it.radial) return add2(it.at, unit(it.at, toward), it.hl); const e1 = add2(it.at, it.ax, -(it.hlo || it.hl)), e2 = add2(it.at, it.ax, it.hhi || it.hl); return dist2(e1, toward) <= dist2(e2, toward) ? e1 : e2; }; // v2.42.24: where a cable meets a block on it (a closure: from its own direction)
    const W_LBL0 = (t) => (t === 'road' ? 0.2 : 1);
    const odcBlk = odcIso(); // v2.41: the ODC block (made when the plan has an ODC)
    if (pts.some((p) => p.el === 'ODC')) { addLayer(d, S, 'G-ESAA PROPOSED ODC', 1); addLayer(d, S, 'G-ESAA EXISTING ODC', 5); defineBlock(d, S, ODC_BLOCK, odcBlk.polys, odcBlk.texts); }
    const inlineOf = (p, b, layer, sc, faced, flip) => {
      const bb = blockBox(S, b, 0), bt = blockBoxT(S, b); if (!bb || !bt) return null;
      const w = bb[2] - bb[0], h = bb[3] - bb[1]; if (!sc) sc = NAP_W / ((bt[2] - bt[0]) || w || 1); // as wide as the NAP, its texts included
      if (TIDY) { const bA = blockBoxA(S, b, 0) || bb; sc *= fitW(acrossSt(Math.max(w, bt[2] - bt[0], bA[2] - bA[0]) * sc, Math.max(h, bt[3] - bt[1], bA[3] - bA[1]) * sc, deg(downAt(p)), p.A), p.A) / kAt(p.A[0], p.A[1]); } // beta 4.8: Tidy: at most 0.7 W across its street (its arcs too; turned as the cable runs there)
      const cx = ((bb[0] + bb[2]) / 2) * sc; // the block is drawn centred on its lines; its texts may reach further on one side
      const t = downAt(p), rot = faced ? deg(t) + (flip ? 180 : 0) : readable(deg(t)), ax = rotv([1, 0], faced ? deg(t) : rot);
      const lo = bt[0] * sc - cx, hi = bt[2] * sc - cx, hlo = Math.max(-lo, (w * sc) / 2), hhi = Math.max(hi, (w * sc) / 2), mir = faced && flip; // its two sides along the cable
      return { p, at: p.A, b, layer: lay(layer, 'MISC'), sc, rot, ax, hl: Math.max(hlo, hhi), hlo: mir ? hhi : hlo, hhi: mir ? hlo : hhi, hh: Math.max((h * sc) / 2, ((bt[3] - bt[1]) * sc) / 2) };
    };
    for (const p of pts) {
      if (p.onPole) continue;
      const isNew = p.status === 'Proposed' || p.status === 'New';
      if (p.el === 'Pole' && (p.nap || p.napId || p.nap2 || p.nap2Id)) {
        // v2.42: a pole may carry two boxes (e.g. an LCP 1:4 and a NAP 1:16): side by side on the cable, the first toward the homing
        const boxOf = (type, isOld, id) => { const k = NAPK[type || ''] || NAPK[''], old = isOld && k[2] && S.blocks.has(k[2]), b = old ? k[2] : k[0]; if (!S.blocks.has(b)) return null; const x = inlineOf(p, b, old ? k[3] : k[1], 0, true, !!k[4]); if (x) x.label = id || ''; return x; };
        const one = p.nap || p.napId ? boxOf(p.napType, p.napOld, p.napId) : null, two = p.nap2 || p.nap2Id ? boxOf(p.nap2Type, p.nap2Old, p.nap2Id) : null;
        let it = one || two; if (!it) continue;
        if (one && two) {
          const G = 1.2, c1 = add2(p.A, one.ax, -(one.hhi + G / 2)), c2 = add2(p.A, two.ax, two.hlo + G / 2);
          one.at = c1; two.at = c2;
          it = { ...one, at: p.A, parts: [one, two], inner: [[add2(c1, one.ax, one.hhi), add2(c2, two.ax, -two.hlo)]], hlo: one.hlo + one.hhi + G / 2, hhi: two.hlo + two.hhi + G / 2, hh: Math.max(one.hh, two.hh) };
          it.hl = Math.max(it.hlo, it.hhi);
        }
        it.kind = 'nap'; inl.set(p, it);
        // the pole symbol beside the NAP, not under it (v2.42.24: the closure's too, below)
        // v2.39.1: an arm keeps its usual length and ends at the NAP's side (it crossed the NAP); the pole stands that much further out
        const need = it.hh + p.rp + (p.arm ? Math.max(0.8, p.armLen) : 0.8), cur = dist2(p.dp, p.A);
        if (cur < need) p.dp = add2(p.A, p.td, -need);
        if (p.arm) p.armLen = Math.max(0.8, dist2(p.dp, p.A) - p.rp - it.hh);
      } else if (p.el === 'ODC') { // v2.41: the ODC cabinet (the template has no ODC model): G-eSAA's block, an isometric view of the cabinet of the
        // photo marker, upright, on the cable (the cable meets its two sides)
        const t = downAt(p), rot = readable(deg(t)), ax = rotv([1, 0], rot), sc = ODC_H * (TIDY ? fitW(Math.max(odcBlk.w, odcBlk.h) * ODC_H, p.A) / kAt(p.A[0], p.A[1]) : 1), w = odcBlk.w * sc, h = odcBlk.h * sc; // (beta 4.8: Tidy: 0.7 W at most)
        const it = { p, at: p.A, b: ODC_BLOCK, odc: { w, h, isNew, sc }, layer: lay(isNew ? 'G-ESAA PROPOSED ODC' : 'G-ESAA EXISTING ODC'), sc, rot: 0, ax, hl: w / 2, hlo: w / 2, hhi: w / 2, hh: h / 2, lrot: rot };
        it.label = p.poleId || ''; it.kind = 'ODC'; it.col = pinColor(p); inl.set(p, it);
      } else if (p.el === 'Pole' && (p.closure || p.closureId) && S.blocks.has('P-Joint') && !(p.cloOff = cloCrowd(p, cloR(p.A)) ? { R: cloR(p.A) } : null)) {
        // v2.42.24: the closure ON the cable at its pole: the template's P-Joint pentagon (proposed: red filled; existing: a blue outline);
        // each cable meets its side from its own direction (radial), side by side within it; its texts where they cover nothing (2.44.12: in a
        // smaller pentagon the cables still end 0.9 m or more from its middle)
        const R = cloR(p.A), rin = R * Math.cos(Math.PI / 5), old = !!p.closureOld, t = downAt(p);
        const it = { p, at: p.A, b: 'P-Joint', layer: lay('P-JOINT'), sc: R, rot: 0, ax: rotv([1, 0], readable(deg(t))), hl: old ? rin : Math.max(rin * 0.4, 0.9), hh: R, rin, radial: true, kind: 'clo', cid: p.closureId || 'CLOSURE', old };
        it.hlo = it.hl; it.hhi = it.hl; inl.set(p, it);
        const need = R + p.rp + (p.arm ? Math.max(0.8, p.armLen) : 0.8), cur = dist2(p.dp, p.A); if (cur < need) p.dp = add2(p.A, p.td, -need); if (p.arm) p.armLen = Math.max(0.8, dist2(p.dp, p.A) - p.rp - R); // the pole beside it, as beside a NAP
      } else if (INLINE_EL.has(p.el)) {
        const key = p.el, k = BLK[key];
        const old = !isNew && S.blocks.has(k[3]), b = old ? k[3] : k[0]; if (!S.blocks.has(b)) continue;
        let it = inlineOf(p, b, old ? k[4] : k[1], old ? k[5] : k[2], p.el === 'ODC', false); if (!it) continue;
        if ((nb.get(p) || []).some((q) => q.el === 'Pole' && q.A && isRiser(q) && dist2(q.A, p.A) < 12)) { // 2.44.12: a box beside a riser pole: smaller where it would reach another point's symbol
          const hd2 = Math.hypot(it.hl, it.hh), room = Math.min(...pts.filter((q) => q !== p && !q.onPole && (q.A || q.dp)).map((q) => Math.min(...[q.A, q.dp].filter(Boolean).map((a) => dist2(a, p.A))) - rOfPt(q) - 0.6));
          if (room < hd2) { const f = Math.max(0.6, room / hd2), it2 = inlineOf(p, b, old ? k[4] : k[1], (old ? k[5] : k[2]) * f, p.el === 'ODC', false); if (it2) it = it2; } }
        it.label = p.poleId || ''; it.kind = p.el; it.col = pinColor(p); inl.set(p, it);
      }
    }
    /* beta 6.1 (the owner: "follow road contours between HH or MH or SB … Follow road contours as default. Same with aerial"): with
       job.cableRoute 'road' (Drawing style › Cables: follow the road), a cable's line between two points along the same road follows that
       road's centre line between their projections, at the cable's own offset from it (drawn in from one end's offset to the other's);
       a span across a road, round a corner onto another road, far from a road or along a straight road stays straight. The written
       lengths stay the measured ones. 'straight' (or none given): straight from point to point, as before. */
    const WANT_RD = job.cableRoute === 'road', FOLLOW = WANT_RD && R.roads.some((r) => r.hw > 0 && r.pts.length > 2), rpCache = new Map();
    const projR = (r, p) => { let best = null, s0 = 0; for (let k = 1; k < r.pts.length; k++) { const a = r.pts[k - 1], b = r.pts[k], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9, t0 = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L), t = Math.max(0, Math.min(1, t0)), c = [a[0] + t * dx, a[1] + t * dy], d = dist2(p, c);
      if (!best || d < best.d) best = { s: s0 + t * L, d, side: (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) >= 0 ? 1 : -1, past: (k === 1 && t0 < -1e-6) || (k === r.pts.length - 1 && t0 > 1 + 1e-6) }; s0 += L; } return best; }; // (past: beyond the road's end)
    const roadPath = (a, b) => { // the road-following line from a to b, or null (straight)
      if (!FOLLOW) return null; const L0 = dist2(a, b); if (L0 < 8) return null;
      const ck = `${a[0].toFixed(2)},${a[1].toFixed(2)}>${b[0].toFixed(2)},${b[1].toFixed(2)}`; if (rpCache.has(ck)) return rpCache.get(ck);
      let best = null;
      for (const r of R.roads) { if (!(r.hw > 0) || r.pts.length < 3) continue;
        const lo0 = Math.min(a[0], b[0]) - r.hw - 10, hi0 = Math.max(a[0], b[0]) + r.hw + 10, lo1 = Math.min(a[1], b[1]) - r.hw - 10, hi1 = Math.max(a[1], b[1]) + r.hw + 10; if (!r.pts.some((q) => q[0] >= lo0 && q[0] <= hi0 && q[1] >= lo1 && q[1] <= hi1)) continue;
        const pa = projR(r, a), pb = projR(r, b); if (!pa || !pb || pa.past || pb.past || pa.d > r.hw + 8 || pb.d > r.hw + 8) continue; // (a point beside the road, not past its end)
        if (pa.side !== pb.side && Math.min(pa.d, pb.d) > r.hw * 0.3) continue; // (a span across the road: straight)
        if (Math.abs(pb.s - pa.s) < 0.6 * L0) continue; // (not along this road)
        const sc = pa.d + pb.d; if (!best || sc < best.sc) best = { r, pa, pb, sc }; }
      let path = null;
      if (best) { const { r, pa, pb } = best, cum = [0]; for (let k = 1; k < r.pts.length; k++) cum.push(cum[k - 1] + dist2(r.pts[k - 1], r.pts[k]));
        const fw = pb.s >= pa.s, lo = Math.min(pa.s, pb.s), hi = Math.max(pa.s, pb.s), oa = pa.side * pa.d, ob = pb.side * pb.d, pts2 = [];
        const ks = []; for (let k = 1; k < r.pts.length - 1; k++) if (cum[k] > lo + 0.5 && cum[k] < hi - 0.5) ks.push(k); if (!fw) ks.reverse();
        for (const k of ks) { const n1 = unit(r.pts[k - 1], r.pts[k]), n2 = unit(r.pts[k], r.pts[k + 1]), nv = [-(n1[1] + n2[1]), n1[0] + n2[0]], nn = Math.hypot(nv[0], nv[1]) || 1, f = (cum[k] - pa.s) / ((pb.s - pa.s) || 1e-9), off = oa + (ob - oa) * f;
          const mi = Math.max(0.5, (n1[0] * n2[0] + n1[1] * n2[1] + 1) / 2) ** 0.5; pts2.push(add2(r.pts[k], [nv[0] / nn, nv[1] / nn], off / mi)); } // (mitred: the offset kept at a bend)
        if (pts2.length) { const P2 = [a, ...pts2, b], t0 = unit(a, b), dev = Math.max(...pts2.map((q) => Math.abs((q[0] - a[0]) * t0[1] - (q[1] - a[1]) * t0[0]))), Lp = P2.slice(1).reduce((t, q, i) => t + dist2(P2[i], q), 0);
          if (dev > 0.5 && Lp <= 1.6 * L0) path = P2; } }
      rpCache.set(ck, path); return path;
    };
    const bendLine = (line) => { if (!FOLLOW) return line; const out = [line[0]]; for (let i = 1; i < line.length; i++) { const pth = roadPath(line[i - 1], line[i]); if (pth) out.push(...pth.slice(1)); else out.push(line[i]); } return out; };
    const alongP = (pth, d) => { for (let i = 1; i < pth.length; i++) { const L = dist2(pth[i - 1], pth[i]); if (d <= L || i === pth.length - 1) return add2(pth[i - 1], unit(pth[i - 1], pth[i]), Math.min(d, L)); d -= L; } return pth[pth.length - 1]; }; // (the point d metres along a line)
    const spanPath = new Map(), routeLen = { aerial: { straight: 0, road: 0, spans: 0, bent: 0, list: [] }, ug: { straight: 0, road: 0, spans: 0, bent: 0, list: [] } }; // (each span's road-following line, for its labels; the lengths compared)
    // 3. the cable runs, broken where a block sits on the cable (it meets the block's sides)
    const chains = chainsOf(spans), label = new Map((runs || []).map((r) => [r.cable, r.label]));
    if (WANT_RD) for (const s0 of spans) { const P = byId.get(String(s0.ia)), Q = byId.get(String(s0.ib)); if (!P || !Q || !P.A || !Q.A) continue; const pth = roadPath(P.A, Q.A), g = (CABLE_STYLE[s0.cable] || CABLE_STYLE['']).aerial === false ? routeLen.ug : routeLen.aerial, L0 = dist2(P.A, Q.A);
      g.spans++; g.straight += L0; g.road += pth ? pth.slice(1).reduce((t, q, i) => t + dist2(pth[i], q), 0) : L0; if (pth) { g.bent++; g.list.push([String(s0.ia), String(s0.ib), +L0.toFixed(2), +pth.slice(1).reduce((t, q, i) => t + dist2(pth[i], q), 0).toFixed(2)]); spanPath.set(`${s0.ia}|${s0.ib}`, pth); spanPath.set(`${s0.ib}|${s0.ia}`, pth.slice().reverse()); } } // (beta 6.1)
    // v2.42.23: with fibers, each fiber is drawn as one line in its lane (below); the runs on them are not drawn as runs, but their
    // chains still give the runs' labels, the underground (HDD) and the vicinity map
    const spanLblAt = new Map(); // beta 6.0: where each span's length is written (for the BOQ table of each GEO sheet)
    const K2 = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`), FIB = (job.fibs || []).filter((f) => f.path && f.path.length > 1 && f.steps && f.steps.length === f.path.length - 1);
    const nLane = new Map(), fibKeys = new Set(), laneStart = new Map(); // (the spans the new fibers draw; every fiber's spans; each new lane's start at a pole toward the next: the loops)
    FIB.forEach((f) => f.steps.forEach((s) => { if (s.gap) return; fibKeys.add(K2(s.a, s.b)); if (!f.ex) nLane.set(K2(s.a, s.b), Math.max(nLane.get(K2(s.a, s.b)) || 1, s.n || 1)); })); // (a gap is not drawn; a span with only existing fibers keeps its own cable, drawn as before)
    const piecesOf = (ch) => {
      const P = ch.ids.map((id) => byId.get(id)).filter(Boolean); if (P.length < 2) return null;
      const pieces = []; let cur = [];
      P.forEach((p, k) => {
        const it = inl.get(p); if (!it) { cur.push(p.A); return; }
        const e1 = add2(it.at, it.ax, -(it.hlo || it.hl)), e2 = add2(it.at, it.ax, it.hhi || it.hl), near = (q) => (it.radial ? blkEnd(it, it.at, q) : dist2(e1, q) <= dist2(e2, q) ? e1 : e2);
        const prev = k > 0 ? P[k - 1].A : null, next = k < P.length - 1 ? P[k + 1].A : null;
        const ein = prev ? near(prev) : null; let eout = next ? near(next) : null;
        if (ein && eout && ein === eout) eout = ein === e1 ? e2 : e1;
        if (ein) { cur.push(ein); pieces.push(cur); }
        if (it.inner) it.inner.forEach((seg) => pieces.push(seg.slice())); // v2.42: the cable between two boxes on one pole
        cur = eout ? [eout] : [];
      });
      if (cur.length) pieces.push(cur);
      return { P, pieces: pieces.filter((l) => l.length > 1) };
    };
    const cabStyle = (cable, existing, cores) => { const st = CABLE_STYLE[cable] || CABLE_STYLE[''], lt = st.aerial ? ['DASHED', 'AERCA'].find((n) => S.ltypes.has(n)) : 'Continuous'; return { st, lt, color: existing ? 5 : st.color, lts: lt === 'DASHED' ? (existing ? 9 : 7) : 0, lwt: cabLw(cable, existing, cores) }; };
    const drawCable = (line0, cs) => { const line = bendLine(line0); o.lwpoly(lay(cs.st.layer, 'Proposed foc aerial'), line, { lwt: cs.lwt || CABLE_LWT, color: cs.color, lt: cs.lt, lts: cs.lts, gen: true }); spots.line(line, 1.5); spots.list.slice(-line.length + 1).forEach((b) => { b.tag = 'cable'; }); };
    for (const ch of chains) {
      const r = piecesOf(ch); if (!r) continue;
      // v2.32: aerial cable as a broken line (DASHED at linetype scale 7, 9 when existing, as the template's own sample drawing),
      // underground solid; red new, blue existing (v2.37: underground green, as the legend). v2.36: its thickness as a line weight (0.70 mm),
      // not a polyline width: PDF converters other than AutoCAD (the one used to check the plan) drew a wide polyline solid, without its dashes
      const st = CABLE_STYLE[ch.cable] || CABLE_STYLE[''];
      ch.line = r.P.map((p) => p.A); ch.pieces = FOLLOW ? r.pieces.map(bendLine) : r.pieces; ch.ug = !st.aerial; // (beta 6.1: as drawn, for the HDD)
      if (!FIB.length) for (const line of r.pieces) drawCable(line, cabStyle(ch.cable, ch.existing)); // (beta 6.1: drawCable follows the road)
    }
    if (FIB.length) for (const ch of chainsOf(spans.filter((s) => !nLane.has(K2(s.ia, s.ib))))) { const r = piecesOf(ch); if (r) for (const line of r.pieces) drawCable(line, cabStyle(ch.cable, ch.existing)); } // the spans on no fiber
    /* v2.42.23: each fiber one line in its lane. On a span with n fibers the lanes are G apart (2.6 m: on paper at 1 : 1100 the two
       0.70 mm lines are clearly apart), on the road side of the cable (the first on the cable's own line, so none runs over a pole), in
       the order that keeps them from crossing (the app's lanes); at a corner the lanes meet (mitred); where a pole's two spans have
       other lanes the line moves over gently; a fiber starting or ending at a pole comes in to the cable there; at a closure, NAP or other
       block on the cable each lane meets the block's side, side by side within it. */
    const LANE_G = Math.max(1.8, 2.6 * kG);
    if (FIB.length) {
      const G = LANE_G, cross = (u, v) => u[0] * v[1] - u[1] * v[0], dot = (u, v) => u[0] * v[0] + u[1] * v[1], sub = (u, v) => [u[0] - v[0], u[1] - v[1]];
      const roadSg = (P0, Q0, nl) => { const tw = [(P0.td ? P0.td[0] : 0) + (Q0.td ? Q0.td[0] : 0), (P0.td ? P0.td[1] : 0) + (Q0.td ? Q0.td[1] : 0)]; return dot(nl, tw) < -1e-6 ? -1 : 1; };
      const laneVec = (st) => { // the lane's offset on its span (from the cable's line)
        const P0 = byId.get(String(st.a)), Q0 = byId.get(String(st.b)); if (!P0 || !Q0 || !P0.A || !Q0.A) return [0, 0];
        const t = unit(P0.A, Q0.A), nl = [-t[1], t[0]], n = Math.max(1, st.n || 1), sg = roadSg(P0, Q0, nl), off = ((st.k || 0) - (n - 1) / 2) * G + sg * (n - 1) / 2 * G;
        return [nl[0] * off, nl[1] * off];
      };
      const laneOff = (st) => { const P0 = byId.get(String(st.a)), Q0 = byId.get(String(st.b)); if (!P0 || !Q0 || !P0.A || !Q0.A) return 0; const t = unit(P0.A, Q0.A), nl = [-t[1], t[0]], n = Math.max(1, st.n || 1); return ((st.k || 0) - (n - 1) / 2) * G + roadSg(P0, Q0, nl) * (n - 1) / 2 * G; };
      const sideOf = (it, e, st) => { // the lane's point on a block's side: as on its span (the first lane on the cable's line), drawn in to fit within the block
        const P0 = byId.get(String(st.a)), Q0 = byId.get(String(st.b)), n = Math.max(1, st.n || 1);
        if (n < 2 || !P0 || !Q0) return e;
        const t = unit(P0.A, Q0.A), nl = [-t[1], t[0]], pr = it.radial ? nl : [-it.ax[1], it.ax[0]], sg = dot(pr, nl) < 0 ? -1 : 1, all = Array.from({ length: n }, (x, k) => laneOff({ ...st, k })), mx = Math.max(...all.map(Math.abs)), lim = 0.8 * (it.hh || G);
        const off = laneOff(st) * (mx > lim ? lim / mx : 1) * sg;
        if (it.radial) { const dr = unit(it.at, e), rr = it.old ? it.rin : it.hl; return add2(add2(it.at, dr, Math.sqrt(Math.max(0, rr * rr - off * off))), pr, off); } // (an outline: on its edge)
        return add2(e, pr, off);
      };
      for (const f of FIB) {
        const cs = cabStyle(f.cab, f.ex, f.cores);
        // the fiber's points with a cable point; a point missing breaks it
        let runs2 = [], rp = [], rs = [];
        f.path.forEach((id, i) => { const p = byId.get(String(id)); if (i > 0 && f.steps[i - 1].gap) { if (rp.length > 1) runs2.push([rp, rs]); rp = []; rs = []; } // (a gap breaks it)
          if (p && p.A) { if (rp.length) rs.push(f.steps[i - 1]); rp.push(p); } else { if (rp.length > 1) runs2.push([rp, rs]); rp = []; rs = []; } });
        if (rp.length > 1) runs2.push([rp, rs]);
        for (const [P, ST] of runs2) {
          // each span's line runs from its pole's cable point, or from the side of the block on the cable there, to the next one (as the cable)
          const m = P.length - 1, E = P.map((p, i) => { const it = inl.get(p); if (!it) return null;
            const e1 = add2(it.at, it.ax, -(it.hlo || it.hl)), e2 = add2(it.at, it.ax, it.hhi || it.hl), near = (q) => (it.radial ? blkEnd(it, it.at, q) : dist2(e1, q) <= dist2(e2, q) ? e1 : e2);
            const ein = i > 0 ? near(P[i - 1].A) : null; let eout = i < m ? near(P[i + 1].A) : null; if (ein && eout && ein === eout) eout = ein === e1 ? e2 : e1; return { it, ein, eout }; });
          const S0 = P.slice(0, m).map((p, j) => (E[j] ? E[j].eout : p.A)), S1 = P.slice(1).map((p, j) => (E[j + 1] ? E[j + 1].ein : p.A));
          const N = ST.map(laneVec), D = S0.map((a, j) => unit(a, S1[j])), Ls = S0.map((a, j) => dist2(a, S1[j])), Lt = Ls.map((L) => Math.min(3.2 * G, L / 3)); // (the length over which a lane moves over)
          const at = (j, s) => add2(add2(S0[j], D[j], s), N[j], 1); // on span j's lane, s metres from its start
          const offL = (j, q) => Math.abs(cross(D[j], sub(q, at(j, 0)))), off = (j) => Math.hypot(N[j][0], N[j][1]); // how far a point is from span j's lane; the lane from the cable
          if (!f.ex) for (let j = 0; j < m; j++) { const k1 = `${P[j].id}>${P[j + 1].id}`, k2 = `${P[j + 1].id}>${P[j].id}`; (laneStart.get(k1) || laneStart.set(k1, []).get(k1)).push({ s: E[j] && E[j].eout ? sideOf(E[j].it, E[j].eout, ST[j]) : at(j, 0), at0: at(j, 0), d: D[j] }); (laneStart.get(k2) || laneStart.set(k2, []).get(k2)).push({ s: E[j + 1] && E[j + 1].ein ? sideOf(E[j + 1].it, E[j + 1].ein, ST[j]) : at(j, Ls[j]), at0: at(j, Ls[j]), d: [-D[j][0], -D[j][1]] }); } // (where it starts as drawn: on a block's side)
          const pieces = []; let cur = [];
          for (let i = 0; i <= m; i++) {
            const p = P[i], B = E[i];
            if (B) { // a block on the cable: the lane ends at its side and the next one starts at its other side, side by side within it
              if (B.ein) { const Q = sideOf(B.it, B.ein, ST[i - 1]); if (offL(i - 1, Q) > 0.05) cur.push(at(i - 1, Math.max(0, Ls[i - 1] - Lt[i - 1]))); cur.push(Q); pieces.push(cur); cur = []; }
              if (B.it.inner && B.it.inner.length) { const v = sideOf(B.it, [0, 0], ST[i] || ST[i - 1]); B.it.inner.forEach((seg) => pieces.push(seg.map((q) => add2(q, v, 1)))); } // (two boxes on the pole: the cable between them, in the fiber's lane)
              if (B.eout) { const Q = sideOf(B.it, B.eout, ST[i]); cur = [Q]; if (offL(i, Q) > 0.05) cur.push(at(i, Math.min(Ls[i], Lt[i]))); }
              continue;
            }
            if (i === 0) { cur.push(at(0, 0)); continue; } // a start at a pole: its lane starts abreast of the pole
            if (i === m) { cur.push(at(m - 1, Ls[m - 1])); continue; } // an end: abreast of the pole
            const a = D[i - 1], b = D[i], c = cross(a, b);
            if (Math.abs(c) > 0.14) { // a corner: the two lanes meet (mitred; a sharp one bevelled)
              const p1 = at(i - 1, 0), q1 = at(i, 0), tt = cross(sub(q1, p1), b) / c, X = add2(p1, a, tt);
              if (dist2(X, p.A) <= 4 * G + off(i - 1) + off(i)) cur.push(X); else cur.push(at(i - 1, Ls[i - 1]), at(i, 0));
            } else if (dist2(N[i - 1], N[i]) < 0.05) cur.push(at(i, 0)); // straight on, the same lane
            else cur.push(at(i - 1, Ls[i - 1] - Lt[i - 1]), at(i, Lt[i])); // straight on, another lane: moves over gently
          }
          if (cur.length) pieces.push(cur);
          for (const line of pieces) if (line.length > 1) drawCable(line, cs);
        }
      }
    }
    // v2.42.18: a span's other runs (run 2, run 3…): parallel to run 1, about a metre apart, each in its cable's style
    for (const s of spans) {
      const more = s.more || []; if (!more.length || fibKeys.has(K2(s.ia, s.ib))) continue; // (v2.42.23: a fiber span: its fibers are drawn above)
      const P0 = byId.get(String(s.ia)), Q0 = byId.get(String(s.ib)); if (!P0 || !Q0 || !P0.A || !Q0.A) continue;
      const a = P0.A, b = Q0.A, t = unit(a, b), nl = [-t[1], t[0]], r0 = Math.max(P0.rp || 0, 1.5), r1 = Math.max(Q0.rp || 0, 1.5), gap = 1.2 * kG;
      if (dist2(a, b) <= r0 + r1 + 1) continue;
      more.forEach((cab, i) => { // v2.42.20: a fiber in its lane (moreOff, beside the first fiber's line), an existing cable blue
        const st = CABLE_STYLE[cab] || CABLE_STYLE[''], lt = st.aerial ? ['DASHED', 'AERCA'].find((n) => S.ltypes.has(n)) : 'Continuous', off = gap * (s.moreOff ? s.moreOff[i] : i + 1), ex = !!(s.moreEx && s.moreEx[i]);
        const line = bendLine([add2(add2(a, t, r0), nl, off), add2(add2(b, t, -r1), nl, off)]); // (beta 6.1: following the road too)
        o.lwpoly(lay(st.layer, 'Proposed foc aerial'), line, { lwt: cabLw(cab, ex), color: ex ? 5 : st.color, lt, lts: lt === 'DASHED' ? (ex ? 9 : 7) : 0, gen: true }); spots.line(line, 1.0);
      });
    }
    // v2.42.20: an existing cable put on the plan (a fiber marked existing) where no new cable runs: blue, dashed, in its lane
    const exLbl = []; // v2.42.21: their size, labelled with the span lengths
    for (const s of job.exSpans || []) {
      const P0 = byId.get(String(s.ia)), Q0 = byId.get(String(s.ib)); if (!P0 || !Q0 || !P0.A || !Q0.A) continue;
      const a = P0.A, b = Q0.A, t = unit(a, b), nl = [-t[1], t[0]], r0 = Math.max(P0.rp || 0, 1.5), r1 = Math.max(Q0.rp || 0, 1.5), gap = 1.2 * kG;
      if (dist2(a, b) <= r0 + r1 + 1) continue;
      const st = CABLE_STYLE[s.cab] || CABLE_STYLE[''], lt = st.aerial ? ['DASHED', 'AERCA'].find((n) => S.ltypes.has(n)) : 'Continuous', off = gap * (s.off || 0);
      const line = bendLine([add2(add2(a, t, r0), nl, off), add2(add2(b, t, -r1), nl, off)]); // (beta 6.1)
      if (!FIB.length) { o.lwpoly(lay(st.layer, 'Proposed foc aerial'), line, { lwt: cabLw(s.cab, true, s.cores), color: 5, lt, lts: lt === 'DASHED' ? 9 : 0, gen: true }); spots.line(line, 1.0); } // (v2.42.23: with fibers, drawn as a fiber above)
      if (job.cabLabels && s.cabLbl && s.cabLbl.length) exLbl.push({ P0, Q0, lines: s.cabLbl, bw: ((nLane.get(K2(s.ia, s.ib)) || 1) - 1) * LANE_G });
    }
    // 4. poles and the other points: symbols first (they are fixed), then the labels round them
    let nOlt = 0, nInline = 0, nTelco = 0, nExArm = 0, taDef = false; const cloLbl = []; /* (beta 6.7: the proposed closures, labelled at the end) */ const taBlk = telcoArmTop(false), siteLate = [], odfLate = []; // (v2.42.11: towers drawn after the labels, see below)
    for (const p of pts) {
      if (p.onPole) continue;
      const isNew = p.status === 'Proposed' || p.status === 'New';
      if (p.el === 'Pole') {
        p.symBox = spots.add(Spots.box(p.dp[0], p.dp[1], p.rp * 2.2, p.rp * 2.2, 0)); // (beta 4.7: kept, so a Tidy label can sit close to its own pole)
        if (p.arm) { // the arm, from the pole to the cable
          const reach = p.armLen || p.arm.reach, bb = blockBox(S, p.arm.b, 0), along = p.arm.dir[0] ? bb[2] - bb[0] : bb[3] - bb[1], sc = reach / (along || 1), top = topVertex(S, p.arm.b);
          const end = p.arm.dir[0] ? [bb[0], (bb[1] + bb[3]) / 2] : [top ? top[0] : (bb[0] + bb[2]) / 2, bb[3]], rot = deg(p.td) - deg(p.arm.dir), at = add2(p.dp, p.td, p.rp), e = rotv([end[0] * sc, end[1] * sc], rot);
          const exB = (A) => { const nm = blueBlock(d, S, A.b), ly = A.layer.replace(/^PROPOSED/, 'EXISTING'); if (!S.layers.has(ly)) addLayer(d, S, ly, 5); return [ly, nm]; }; // (beta 6.7)
          const [aL, aB] = p.arm.ex ? exB(p.arm) : [lay(p.arm.layer), p.arm.b];
          o.insert(aL, aB || p.arm.b, at[0] - e[0], at[1] - e[1], { scale: sc, rot });
          const m = add2(p.dp, p.td, p.rp + reach / 2); spots.add(Spots.box(m[0], m[1], reach, 4, deg(p.td)));
          if (p.arm2 && S.blocks.has(p.arm2.b)) { // beta 6.7: an existing arm beside the new one, the same way, blue
            const b2 = blockBox(S, p.arm2.b, 0), al2 = p.arm2.dir[0] ? b2[2] - b2[0] : b2[3] - b2[1], sc2 = reach / (al2 || 1), top2 = topVertex(S, p.arm2.b), end2 = p.arm2.dir[0] ? [b2[0], (b2[1] + b2[3]) / 2] : [top2 ? top2[0] : (b2[0] + b2[2]) / 2, b2[3]];
            const rot2 = deg(p.td) - deg(p.arm2.dir), at2 = add2(at, rotv(p.td, 90), 1.2), e2 = rotv([end2[0] * sc2, end2[1] * sc2], rot2), [l2, n2] = exB(p.arm2);
            o.insert(l2, n2 || p.arm2.b, at2[0] - e2[0], at2[1] - e2[1], { scale: sc2, rot: rot2 }); }
          if (p.arm.ex || p.arm2) { // (beta 6.7: its name along it, as before, blue)
            const txt = p.armText, h = 0.8 * Math.min(1, p.k || 1), side = rotv(p.td, 90), rr = readable(deg(p.td)), from = add2(p.dp, p.td, -p.rp), span = p.rp * 2 + reach, cands = [];
            for (const sd of [1, -1]) for (const g of [0, 0.6, 1.4, 2.4]) for (const a of [0, -0.6, 0.6]) { const q = add2(add2(from, p.td, span / 2 + a), side, sd * (p.rp * 1.05 + (p.arm2 ? 1.2 : 0.6) + h / 2 + 0.25 + g)); cands.push({ q, rr, cost: g * 0.6 + Math.abs(a) * 0.3, boxes: [textBox(q[0], q[1], h, txt, rr, 1, 2)] }); }
            const c = pickC(spots, cands, ROADLINE_W), ly = (p.arm2 || p.arm).layer.replace(/^PROPOSED/, 'EXISTING');
            o.text(S.layers.has(ly) ? ly : lay(p.arm.layer), c.q[0], c.q[1], h, txt, { rot: c.rr, ha: 1, va: 2, style: 'arial', color: 5 }); spots.add(c.boxes, 'telco'); nExArm++; }
        }
        if (p.telcoArm && !(p.arm && p.arm.ex) && !p.arm2) { // (beta 6.7: an existing extension / alley arm: its model, above) v2.42.1: the telco arm (from above): from the pole's face to the cable, the clamp where the cable passes; TELCO ARM beside it (v2.42.2: design H1, along the pole and the arm)
          if (!taDef) { addLayer(d, S, 'G-ESAA TELCO ARM', 7); const bs = addBoldStyle(d, S, 'G-ESAA BOLD'); [false, true].forEach((f) => { const B = telcoArmTop(f, bs); defineBlock(d, S, TA_BLOCK + (f ? ' R' : ''), B.polys, B.texts, B.solids); }); taDef = true; }
          const side = rotv(p.td, 90), off = p.arm ? 1.2 : 0, face = add2(add2(p.dp, p.td, p.rp), side, off); // beside a new arm when the pole has one too
          const hhN = inl.has(p) ? inl.get(p).hh : 0, L = Math.max(1.5, dist2(face, add2(p.A, side, off)) - hhN), sc = L / taBlk.clampX, rot = deg(p.td);
          const up = Math.abs(((readable(rot) - rot) % 360 + 360) % 360) < 1; // TELCO reads the right way up
          o.insert(lay('G-ESAA TELCO ARM'), TA_BLOCK + (up ? '' : ' R'), face[0], face[1], { scale: sc, rot }); nTelco++;
          const mid = add2(face, p.td, (taBlk.end * sc) / 2); spots.add(Spots.box(mid[0], mid[1], taBlk.end * sc * 1.05, 1.7 * sc, rot));
          // its name along the pole and the arm (0.8 m high): from the pole's back to the arm's end, clear of the pole symbol
          const txt = p.armText || 'TELCO ARM', h = 0.8 * Math.min(1, p.k || 1), /* (beta 6.3: an extension arm or 10-pin alley arm by its own name) */ cands = [], rr = readable(rot), from = add2(p.dp, p.td, -p.rp), span = p.rp * 2 + taBlk.end * sc;
          for (const sd of [1, -1]) for (const g of [0, 0.6, 1.4]) for (const a of [0, -0.6, 0.6]) {
            const q = add2(add2(from, p.td, span / 2 + a), side, sd * (Math.max(p.rp * 1.05, 0.78 * sc) + h / 2 + 0.25 + g));
            cands.push({ q, rr, cost: (sd < 0 ? 0.4 : 0) + g * 0.6 + Math.abs(a) * 0.3, boxes: [textBox(q[0], q[1], h, txt, rr, 1, 2)] });
          }
          const c = pickC(spots, cands, ROADLINE_W);
          o.text(lay('G-ESAA TELCO ARM'), c.q[0], c.q[1], h, txt, { rot: c.rr, ha: 1, va: 2, style: 'arial' }); spots.add(c.boxes, 'telco');
        }
      } else if (p.el === 'Site' && /olt/i.test(p.siteKind || '')) { // v2.37: an OLT site: the OLT model (yellow when new, blue existing), its name above
        const nb0 = isNew && S.blocks.has('7') ? ['7', 'PORPOSED OLT', 0.0001060994181900193] : ['OLT1', 'EXISTING OLT', 1.749630906627053];
        if (S.blocks.has(nb0[0])) { o.insert(lay(nb0[1], 'X-BTS'), nb0[0], p.E, p.N, { scale: nb0[2], center: true }); spots.add(Spots.box(p.E, p.N, 13, 15, 0)); nOlt++; }
        const nm = p.siteName || p.poleId || ''; if (nm) {
          const all4 = [[0, 10.5], [0, -10.5], [12, 0], [-12, 0], [-12, 10.5], [12, 10.5], [-12, -10.5], [12, -10.5]].map(([dx, dy]) => { const q = [p.E + dx, p.N + dy]; return { q, boxes: [textBox(q[0], q[1], 3, nm, 0, dx > 0 ? 0 : dx < 0 ? 2 : 1, 2)], ha: dx > 0 ? 0 : dx < 0 ? 2 : 1 }; });
          const inC = all4.filter((x) => cellHolds(x.boxes[0], p.E, p.N)), c = pick(spots, inC.length ? inC : all4.slice(0, 4)); // v2.42.10: inside its GEO sheet first
          o.text(lay('X-BTS'), c.q[0], c.q[1], 3, nm, { ha: c.ha, va: 2, style: 'arial', color: pinColor(p) != null ? pinColor(p) : isNew ? 1 : 5 }); spots.add(c.boxes); }
      } else if (p.el === 'Site') { // v2.36: a pin's name in its colour (a pin placed on the map has one). v2.37: a new tower red
        let bn = 'X-BTS';
        if (isNew && copyBlock(d, S, 'X-BTS', 'G-ESAA P-BTS', () => true)) {
          bn = 'G-ESAA P-BTS';
          if (!S.redBts) { S.redBts = true; for (const e of S.blocks.get(bn).ents) { if (typ(e) === 'ATTDEF') continue; const k = e.findIndex((q) => q[0] === 62); if (k >= 0) e[k][1] = I(1); else e.splice(e.findIndex((q) => q[0] === 8) + 1, 0, [62, I(1)]); } }
        }
        { const W0 = tw(p); spots.add(Spots.box(W0.ax, W0.ay + 24 * W0.k, 26 * W0.k, 50 * W0.k, 0)); // the tower's place now; the tower and its name after the span lengths
          if (W0.moved && job.towerArrow) { const AG = towerArrow(p, W0, job.siteName === 'on' ? towerNameBox(p, W0) : null); arrowOf.set(p, AG); spots.line(AG.mid, 1.4); spots.add(Spots.box(p.E, p.N, 3, 3, 0)); } // beta 3.8: the curved arrow's path
          else if (W0.moved) { const L = towerLead(p, W0); spots.line(L, 0.6); spots.add(Spots.box(p.E, p.N, 3, 3, 0)); } } // beta 3.7: its line to the point, and the point's mark
        siteLate.push({ p, bn });
      } else if (p.el === 'ODF') {
        spots.add(Spots.box(p.E, p.N, 10, 10, 0)); odfLate.push({ p, isNew }); // v2.42.26: the block and its label after the towers' names (step 9)
      } else if (p.el === 'NAP') { // a NAP pin away from every pole of the route: where it is
        const fN = TIDY ? fitW(8.5, [p.E, p.N]) / kAt(p.E, p.N) : 1; // (beta 4.8: Tidy: 0.7 W at most, its ID a level label beside it)
        o.insert(isNew ? lay('PROPOSED NAP') : lay('EXISTING NAP'), isNew ? 'proposed NAP' : 'existing NAP', p.E, p.N, { scale: 0.7803353843555049 * fN, center: true }); const nbx = spots.add(Spots.box(p.E, p.N, 20 * fN, 9 * fN, 0));
        if (p.poleId && TIDY) tidySym.push({ kind: 'id', at: [p.E, p.N], r: 10 * fN, box: nbx, ov: [0, -1], lines: [p.poleId], layer: lay('Proposed NAP ID', 'MISC'), style: idStyle, color: IDS.color || null, pole: null });
        else if (p.poleId) { idText(lay('Proposed NAP ID', 'MISC'), p.E, p.N - 7, IDS.h, p.poleId, 0, null); spots.add(textBox(p.E, p.N - 7, IDS.h, p.poleId, 0, 1, 2)); }
      } else if (p.el === 'Closure') {
        { const Rq = cloR([p.E, p.N]), m0 = o.model.length; o.insert(lay('P-JOINT'), 'P-Joint', p.E, p.N, { scale: Rq, attrs: { JT_ID: p.poleId || p.closureId || '', JOINT: 'JT' } }); spots.add(Spots.box(p.E, p.N, 2 * Rq, 2 * Rq, 0)); // (2.44.12: its size)
          if (TIDY) for (const r of o.model.slice(m0)) { if (r[0][1] !== 'ATTRIB') continue; const g = (c, dv) => { const q = r.find((x, i) => i > 0 && x[0] === c); return q ? q[1] : dv; }, h = +g(40, 0), tx = String(g(1, '')); if (!(h > 0) || !tx.trim()) continue; const al = +g(72, 0) || +g(74, 0), x = al ? +g(11, 0) : +g(10, 0), y = al ? +g(21, 0) : +g(20, 0); spots.add(textBox(x, y, h, tx, +g(50, 0), +g(72, 0), +g(74, 0) === 2 ? 2 : +g(74, 0) === 3 ? 3 : 0), 'label'); } } // (beta 6.0: Tidy: its ID and JT where the block puts them: nothing over them)
      } else if (!inl.has(p) && !INLINE_EL.has(p.el)) o.circle(lay('MISC'), p.E, p.N, 2);
    }
    let nOdc = 0;
    for (const it of inl.values()) { // the blocks on the cable, then their IDs below them (above when that place is taken)
      if (it.odc) { // v2.41: the ODC block (isometric cabinet), upright; red when new, blue existing (or the pin's colour)
        const { w, h, isNew, sc } = it.odc, col = it.col != null ? it.col : isNew ? 1 : 5;
        o.insert(it.layer, ODC_BLOCK, it.at[0], it.at[1], { scale: sc, color: col }); it.sbox = spots.add(Spots.box(it.at[0], it.at[1], w, h, 0)); nInline++; nOdc++; continue;
      }
      if (it.kind === 'clo') { it.sbox = spots.add(Spots.box(it.at[0], it.at[1], it.hh * 2, it.hh * 2, 0)); continue; } // v2.42.24: drawn with its texts, below
      for (const x of it.parts || [it]) { o.insert(x.layer, x.b, x.at[0], x.at[1], { scale: x.sc, rot: x.rot, center: true }); x.sbox = spots.add(Spots.box(x.at[0], x.at[1], x.hl * 2, x.hh * 2, x.rot)); nInline++; }
    }
    let nAutoIds = 0; const idLeadOf = new Map(); const placeIds = () => { // (idLeadOf: an ID's text -> its thin line back to its block, beta 4.7: the line follows the ID when Tidy slides it) // (beta 3.8: with Crowded places Auto, after the pole labels: they keep their place first)
    for (const it of [...inl.values()].flatMap((x) => (x.parts ? x.parts.map((y) => ({ ...y, kind: x.kind })) : [x]))) { // (v2.42: each box's own ID)
      if (!it.label || it.kind === 'clo') continue;
      if (TIDY) { const pl = it.p && it.p.el === 'Pole' && it.p.td ? it.p : null; tidySym.push({ kind: 'id', at: it.at, r: Math.max(it.hl || 0, it.hh || 0), box: it.sbox, ov: pl ? pl.td : [0, -1], lines: [it.label], layer: it.kind === 'nap' ? lay('Proposed NAP ID', 'MISC') : it.kind === 'ODC' ? it.layer : lay('MISC'), style: idStyle, color: it.col != null ? it.col : IDS.color || null, pole: pl }); continue; } // beta 4.8: Tidy: a level label beside its block (end of step 8)
      const rr = it.odc ? 0 : readable(it.rot), ux = [Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)], dn = [ux[1], -ux[0]], th0 = IDS.h; // (the ODC's picture is upright: its ID level under it)
      // v2.39.1: on the side away from its pole first (the pole's own label goes on the pole's side), then a little further out or
      // along the cable; crossing a road edge line rather than covering a label or a symbol. v2.41: where every place is taken at the
      // ID's size, a size smaller (twice at most) before covering anything
      const pole = it.p && it.p.el === 'Pole' && it.p.dp ? it.p : null, away = pole ? -(Math.sign((pole.dp[0] - it.at[0]) * dn[0] + (pole.dp[1] - it.at[1]) * dn[1]) || -1) : 1;
      const lc = []; for (const th of [th0, th0 * 0.8, th0 * 0.64]) for (const sd of [away, -away]) for (const ex of [0, 1.5, 3]) for (const a of [0, 4, -4, 8, -8]) { const q = add2(add2(it.at, dn, sd * (it.hh + th * 0.9 + ex)), ux, a); lc.push({ q, th, boxes: [textBox(q[0], q[1], th, it.label, rr, 1, 2)] }); }
      let c = pickW(spots, lc, ROADLINE_W);
      if (job.crowd && c.n > 0) { // beta 3.8: Crowded places Auto: the nearest free place up to job.crowd.move metres away, only then smaller (down to job.crowd.min)
        const Cr = job.crowd, mv = Math.max(4, +Cr.move || 15), mn = Math.min(1, Math.max(0.5, +Cr.min || 0.75)), xs = [];
        for (let k = 1; k >= mn - 1e-9; k -= 0.05) for (const ex of [4.5, 6, 8, 10, 12.5, 15, 18, 22, 26, 30]) { if (ex > mv + 1e-9) break;
          for (let a = 0; a < 16; a++) { const an = a * Math.PI / 8, v = [Math.cos(an), Math.sin(an)], th = th0 * k, q = add2(it.at, v, (it.hl || it.hh) + th * 0.9 + ex); xs.push({ q, th, far: ex, v, boxes: [textBox(q[0], q[1], th, it.label, rr, 1, 2)], cost: ex + (1 - k) * 40 }); } }
        xs.sort((x, y) => x.cost - y.cost);
        const c2 = xs.find((x) => x.boxes.reduce((t, b) => t + spots.hitsW(b, ROADLINE_W), 0) === 0); if (c2) { c = c2; nAutoIds++; }
      }
      const ly = it.kind === 'nap' ? lay('Proposed NAP ID', 'MISC') : it.kind === 'ODC' ? it.layer : lay('MISC');
      const idR = idText(ly, c.q[0], c.q[1], c.th, it.label, rr, it.col); spots.add(c.boxes);
      if (c.far > 3 && job.crowd && job.crowd.leader !== false) { // (a thin line back to its block)
        const b = c.boxes[0], d0 = [c.q[0] - it.at[0], c.q[1] - it.at[1]], dl = Math.hypot(d0[0], d0[1]) || 1, u = [d0[0] / dl, d0[1] / dl], ext = Math.abs(u[0] * b.ux + u[1] * b.uy) * b.hw + Math.abs(u[0] * b.vx + u[1] * b.vy) * b.hh;
        const a = add2(it.at, u, (it.hl || it.hh) + 0.3), e = add2(c.q, u, -(ext + 0.3)); if (dist2(a, e) > 0.8) { idLeadOf.set(idR, o.lwpoly(lay('MISC'), [a, e], { color: 8 })); spots.line([a, e], 0.3); }
      }
    }
    };
    if (!job.crowd) placeIds();
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
      const gk = TIDY ? kAt(p.dp[0], p.dp[1]) : 1, gh = TIDY ? TS.sm / gk : 2.33; // (beta 4.8: Tidy: the size of the small texts, on its sheet)
      const gr = o.text(lay(g.layer), tip[0], tip[1], gh, g.code, { rot: rr, ha: labelMid ? 1 : flip ? 2 : 0, va: 2, style: 'arial', color: 1 }); if (TIDY) TS.guys.push([gr, gk]);
      const m = add2(at, v, (L0 * sc) / 2); spots.add(Spots.box(m[0], m[1], L0 * sc, 4, rot)); spots.add(textBox(tip[0], tip[1], gh, g.code, rr, labelMid ? 1 : flip ? 2 : 0, 2));
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
        let q = p.A; if (inl.has(p)) { const it = inl.get(p), w = ugq ? unit(p.A, ugq.A) : it.ax, sg = (w[0] * it.ax[0] + w[1] * it.ax[1]) >= 0 ? 1 : -1; q = it.radial ? add2(it.at, w, it.hh + 3.0) : add2(it.at, it.ax, sg * (it.hl + 3.5)); } // (v2.42.24: a closure on the cable: on the underground cable, past the pentagon)
        let rs = 0.7803353843555049; const fR = TIDY ? fitW(6, q) / kAt(q[0], q[1]) : 1, rR = riserR * fR; rs *= fR; // (beta 4.8: Tidy: 0.7 W at most) 2.44.12: with no block on the cable there, the riser beside its pole on the underground side, clear of the pole and of what is near (smaller as needed), not over the pole
        if (!inl.has(p) && S.blocks.has(rb)) { const w0 = ugq ? unit(p.A, ugq.A) : p.td ? [-p.td[0], -p.td[1]] : [1, 0], o0 = p.dp || p.A, W_R = (tg) => (tg === 'cable' || tg === 'road' ? 0 : 1); let bestR = null;
          const out0 = p.td ? [-p.td[0], -p.td[1]] : null, outw = (w) => !!out0 && w[0] * out0[0] + w[1] * out0[1] > 0.3, angs = [0, 25, -25, 50, -50, 80, -80, 115, -115, 180].map((a) => rotv(w0, a));
          const tries = []; for (const grp of [angs.filter((w) => !outw(w)), angs.filter(outw)]) for (const f of [1, 0.8, 0.65, 0.5]) for (const w of grp) tries.push([w, f]); // (the underground side first, then the road side, smaller as needed; where its labels go last)
          for (const [w, f] of tries) { const r = rR * f, c = add2(o0, w, (p.rp || 1.2) * 1.1 + r + 0.4), n = spots.hitsW(Spots.box(c[0], c[1], 1.8 * r, 1.8 * r, 0), W_R) + (dist2(c, o0) < r + (p.rp || 1.2) * 1.1 + 0.2 ? 1 : 0);
            if (!bestR || n < bestR.n - 1e-9) bestR = { c, f, n }; if (!n) break; }
          q = bestR.c; rs *= bestR.f; p.riserAt = { c: q, r: rR * bestR.f }; }
        if (S.blocks.has(rb)) { o.insert(lay('PROPOSED RISER', 'MISC'), rb, q[0], q[1], { scale: rs, center: true }); spots.add(Spots.box(q[0], q[1], inl.has(p) ? 6 * fR : 2 * rR * rs / (0.7803353843555049 * fR), inl.has(p) ? 6 * fR : 2 * rR * rs / (0.7803353843555049 * fR), 0)); nRiser++; }
      }
    }
    // v2.37: directional boring (HDD) wherever an underground cable crosses a road, centred on the road, along the cable
    let nHdd = 0; const hddAt = []; const hddB = S.blocks.has('proposed HDD Directional Boring') ? 'proposed HDD Directional Boring' : null;
    { // (beta 6.0: the crossings found even when the template has no HDD block, for the PMI; drawn only with the block)
      const hbb = hddB ? blockBox(S, hddB, 0) : null, hw0 = hbb ? hbb[2] - hbb[0] : 38.69, cross = (a, b, c, e) => { const r = [b[0] - a[0], b[1] - a[1]], s = [e[0] - c[0], e[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null; };
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
              if (!ch.existing) hddAt.push({ x, L }); if (!hddB) continue;
              o.insert(lay(ch.existing ? 'EXISTING HDD' : 'PROPOSED HDD', 'MISC'), ch.existing && S.blocks.has('existing HDD Directional Boring') ? 'existing HDD Directional Boring' : hddB, x[0], x[1], { scale: L / hw0, rot: readable(rot), center: true });
              spots.add(Spots.box(x[0], x[1], L, 5, rot)); nHdd++; // (beta 6.0: each new bore, for the PMI's PROPOSED HDD)
            }
          }
        }
      }
    }
    // 6. loops ON the cable beside their pole (on the span away from the homing), the length text along it, readable; closures on the
    //    cable at their pole (v2.37)
    let nLoop = 0;
    const loopAt = (p, t, rd, napHl) => {
      if (!S.blocks.has('loopp')) return;
      const Q = nb.get(p) || [], Qn = Q.filter((q) => hd(q) > hd(p)).sort((x, y) => hd(x) - hd(y));
      const bb = blockBox(S, 'loopp', 0), fL = TIDY ? fitW(acrossSt(bb ? (bb[2] - bb[0]) * 2.470465709436871 : 9.5, bb ? (bb[3] - bb[1]) * 2.470465709436871 : 7.1, deg(Qn.length ? unit(p.A, Qn[0].A) : Q.length ? unit(p.A, Q[0].A) : t), p.A), p.A) / kAt(p.A[0], p.A[1]) : 1; let sc = 2.470465709436871 * fL, lw = bb ? (bb[2] - bb[0]) * sc : 9.5 * fL, lh = bb ? (bb[3] - bb[1]) * sc : 7.1 * fL; // (beta 4.8: Tidy: at most 0.7 W across its street, turned as its span runs)
      // along the span down the route (at the end, back along its span); v2.41: right in front of its pole (where its arm meets the
      // cable), or just past its NAP: a loop is on the pole, not along the span. The circle hangs on the pole's road side.
      let dir = Qn.length ? unit(p.A, Qn[0].A) : Q.length ? unit(p.A, Q[0].A) : t, side = p.td, Q0 = add2(p.A, dir, napHl ? napHl + 0.6 + lw / 2 : 0);
      const q1 = Qn.length ? Qn[0] : Q.length ? Q[0] : null; // v2.42.23: on the cable as drawn: along its span from the block's side (or the pole); with fibers, on the road-most new lane; the circle on the road side
      if (q1 && q1.A) {
        const endAt = (x, toward) => blkEnd(inl.get(x), x.A, toward);
        let s0 = endAt(p, q1.A), d = unit(s0, endAt(q1, p.A)); const n0 = [-d[1], d[0]], td = p.td || n0, sd = n0[0] * td[0] + n0[1] * td[1] < 0 ? [-n0[0], -n0[1]] : n0;
        const ln = laneStart.get(`${p.id}>${q1.id}`); if (ln && ln.length) { const L = ln.reduce((x, y) => ((y.at0[0] - s0[0]) * sd[0] + (y.at0[1] - s0[1]) * sd[1] > (x.at0[0] - s0[0]) * sd[0] + (x.at0[1] - s0[1]) * sd[1] ? y : x)); s0 = L.s; d = inl.has(p) ? unit(L.s, add2(L.at0, L.d, 0.6 + lw)) : L.d; } // (at a block: from the lane's start on its side to the lane past the loop)
        const it0 = inl.get(p), rx = it0 && it0.radial ? Math.max(0, it0.hh - dist2(s0, it0.at)) : 0; // (v2.42.24: a closure on the cable: the loop past its pentagon, not over it)
        const pthL = FOLLOW ? spanPath.get(`${p.id}|${q1.id}`) : null; if (pthL) { const u0 = unit(p.A, q1.A), u1 = unit(p.A, alongP(pthL, dist2(p.A, s0) + lw)), ca = u0[0] * u1[0] + u0[1] * u1[1], sa = u0[0] * u1[1] - u0[1] * u1[0]; d = [d[0] * ca - d[1] * sa, d[0] * sa + d[1] * ca]; } // (beta 6.1: a span following its road: the loop on its line as drawn)
        const n1 = [-d[1], d[0]]; dir = d; side = n1[0] * sd[0] + n1[1] * sd[1] < 0 ? [-n1[0], -n1[1]] : n1; Q0 = add2(s0, d, inl.has(p) ? rx + 0.6 + lw / 2 : 0);
      }
      if (crowdAt(p) && !inl.has(p)) { // 2.44.12: a crowded pole (a closure or a riser beside a manhole): the loop on one of its spans at the pole, its circle where it covers nothing, smaller as needed
        const W_L = (tg) => (tg === 'cable' ? 0 : tg === 'road' ? 0.1 : 1), o0 = p.A; let bestL = null;
        if (p.cloAt) { const [a, e] = p.cloAt, u = unit(a, e), L = dist2(a, e), nn = [-u[1], u[0]]; // (its closure drawn away from it: the loop on the way to the closure, between them)
          for (const ff of [1, 0.8, 0.65, 0.5, 0.4]) { if (lw * ff > L) continue; for (const k of [0.5, 0.25, 0.75]) for (const sd of [nn, [-nn[0], -nn[1]]]) { const Qx = add2(a, u, lw * ff / 2 + (L - lw * ff) * k), cx = add2(Qx, sd, lh * ff * 0.58), n = spots.hitsW(Spots.box(cx[0], cx[1], lw * ff, lh * ff * 0.84, deg(u)), W_L);
            if (!bestL || n < bestL.n - 1e-9) bestL = { Qx, sd, u, ff, n }; if (!n) break; } if (bestL && !bestL.n) break; } }
        const qs = (nb.get(p) || []).filter((x) => x.A).sort((x, y) => (x === q1 ? -1 : y === q1 ? 1 : 0));
        if (!bestL || bestL.n) for (const ff of [1, 0.8, 0.6, 0.5]) { for (const qq of qs) { const pq = FOLLOW ? spanPath.get(`${p.id}|${qq.id}`) : null, u = pq ? unit(o0, alongP(pq, lw * ff)) : unit(o0, qq.A), L = dist2(o0, qq.A), nn = [-u[1], u[0]], sd0 = nn[0] * side[0] + nn[1] * side[1] < 0 ? [-nn[0], -nn[1]] : nn;
          for (const sv of [lw * ff / 2 + (p.rp || 1.2) + 0.6, lw * ff / 2, lw * ff / 4, 0, -lw * ff / 4, -lw * ff / 2, -(lw * ff / 2 + (p.rp || 1.2) + 0.6)]) { if (sv + lw * ff / 2 > L - rOfPt(qq) - 0.3) continue; // (its line on the cable, short of the next point; or on from the pole, past it)
            for (const sd of [sd0, [-sd0[0], -sd0[1]]]) { const Qx = add2(o0, u, sv), cx = add2(Qx, sd, lh * ff * 0.58), n = spots.hitsW(Spots.box(cx[0], cx[1], lw * ff, lh * ff * 0.84, deg(u)), W_L); // (its circle: no other symbol under it)
              if (!bestL || n < bestL.n - 1e-9 || (n < bestL.n + 1e-9 && ff < bestL.ff)) bestL = { Qx, sd, u, ff, n }; if (!n) break; } if (bestL && !bestL.n) break; } if (bestL && !bestL.n) break; } if (bestL && !bestL.n) break; }
        if (bestL) { Q0 = bestL.Qx; side = bestL.sd; dir = bestL.u; sc *= bestL.ff; lw *= bestL.ff; lh *= bestL.ff; rd = readable(deg(dir)); } // (its length along it)
      }
      const c0 = add2(Q0, side, lh / 2), rot = deg(side) + 90, TB = crowdAt(p) ? textBoxA : textBox; // (2.44.12: a crowded pole: its texts as wide as drawn)
      // the loop's straight line (the cable) laid on the cable, its circle hanging on the road side
      const le = lineEnds(S, 'loopp'), mid = le ? [(le[0][0] + le[1][0]) / 2, (le[0][1] + le[1][1]) / 2] : [0, 0], mo = rotv([mid[0] * sc, mid[1] * sc], rot);
      o.insert(lay('PROPOSED LOOP'), 'loopp', Q0[0] - mo[0], Q0[1] - mo[1], { scale: sc, rot }); const lbx = spots.add(Spots.box(c0[0], c0[1], lw, lh, deg(dir)));
      const mL = Array.isArray(p.mloopL) && p.mloopL.length > 1 ? p.mloopL : null; // v2.42.20: a loop for each fiber there: 10m LOOP x2, or 15m+10m LOOP
      if (TIDY) { // beta 4.8: Tidy: its length a level label beside it, placed with the pole labels (end of step 8)
        const mR2 = mL && Array.isArray(p.mloopR) && p.mloopR.length === mL.length ? p.mloopR : null;
        const rows = mR2 ? mL.map((v, i) => [+mR2[i] || 0, `${+(+v).toFixed(1)}m LOOP (RUN ${mR2[i]})`]).sort((a, b) => a[0] - b[0]).map((r) => r[1])
          : [mL ? (mL.every((v) => +v === +mL[0]) ? `${+(+mL[0]).toFixed(1)}m LOOP x${mL.length}` : `${mL.map((v) => `${+(+v).toFixed(1)}m`).join('+')} LOOP`) : `${+(+(p.mloopM || job.mloopLen || 15)).toFixed(1)}m LOOP`];
        tidySym.push({ kind: 'loop', at: c0, r: Math.max(lw, lh) / 2, box: lbx, ov: side, lines: rows, layer: lay('PROPOSED LOOP'), style: null, color: null, pole: p });
        nLoop++; return;
      }
      const txt = mL ? (mL.every((v) => +v === +mL[0]) ? `${+(+mL[0]).toFixed(1)}m LOOP x${mL.length}` : `${mL.map((v) => `${+(+v).toFixed(1)}m`).join('+')} LOOP`) : `${+(+(p.mloopM || job.mloopLen || 15)).toFixed(1)}m LOOP`, cs = []; // v2.42.18: each loop its own length // v2.39: 15m LOOP (15.0m before), as the company's plans
      for (const j of [lh + 2.2, -2.6, lh + 5.5, -5.5]) for (const k of [0, 4, -4, 9, -9]) { const q = add2(add2(Q0, side, j), dir, k); cs.push({ q, boxes: [TB(q[0], q[1], 2.8125, txt, rd, 1, 2)] }); }
      // v2.42.16: where all those are taken (a span length, a photo, a street name…), a little further out before covering anything
      for (const j of [lh + 9, -9, lh + 13, -13]) for (const k of [0, 5, -5, 10, -10, 16, -16]) { const q = add2(add2(Q0, side, j), dir, k); cs.push({ q, boxes: [TB(q[0], q[1], 2.8125, txt, rd, 1, 2)] }); }
      const mR = mL && Array.isArray(p.mloopR) && p.mloopR.length === mL.length ? p.mloopR : null;
      if (mR) { // v2.42.25: a loop for each cable there: each its own small line with its cable's RUN (15m LOOP (RUN 1), 10m LOOP (RUN 2)), together where they cover nothing
        const th = Math.max(1.0, 1.3 * kG), rows = mL.map((v, i) => [+mR[i] || 0, `${+(+v).toFixed(1)}m LOOP (RUN ${mR[i]})`]).sort((a, b) => a[0] - b[0]).map((r) => r[1]);
        const lh2 = th * 1.45, H = lh2 * rows.length, upv = rotv([0, 1], rd), cs2 = [];
        const at = (q) => rows.map((r, i) => add2(q, upv, ((rows.length - 1) / 2 - i) * lh2));
        for (const j of [lh + 0.9 + H / 2, -(1.2 + H / 2), lh + 3 + H / 2, -(3.5 + H / 2), lh + 6.5 + H / 2, -(7 + H / 2), lh + 11 + H / 2, -(11 + H / 2)]) for (const k of [0, 4, -4, 8, -8, 13, -13]) {
          const q = add2(add2(Q0, side, j), dir, k), Qs = at(q); cs2.push({ q, Qs, boxes: Qs.map((qi, i) => TB(qi[0], qi[1], th, rows[i], rd, 1, 2)) }); }
        const c2 = pick(spots, cs2);
        c2.Qs.forEach((qi, i) => o.text(lay('PROPOSED LOOP'), qi[0], qi[1], th, rows[i], { rot: rd, ha: 1, va: 2 })); spots.add(c2.boxes, 'loop'); nLoop++;
        return;
      }
      const c = pick(spots, cs);
      o.text(lay('PROPOSED LOOP'), c.q[0], c.q[1], 2.8125, txt, { rot: rd, ha: 1, va: 2 }); spots.add(c.boxes, 'loop'); nLoop++;
    };
    for (const p of polesOnly) {
      if (p.onPole) continue;
      const t = downAt(p), rd = readable(deg(t)), napHl = inl.has(p) ? inl.get(p).hl : 0;
      if (p.mloop && !p.cloOff) loopAt(p, t, rd, napHl); // (2.44.12: a crowded closure's after it, below)
      if ((p.closure || p.closureId) && p.cloOff) cloLate.push(p); // 2.44.12: a crowded closure: after the pole labels, below
      else if ((p.closure || p.closureId) && !(inl.get(p) || {}).radial) { // (v2.42.24: one on the cable is drawn with the blocks)
        const Q = nb.get(p) || [], up = Q.length ? Q.slice().sort((x, y) => hd(x) - hd(y))[0] : null, back = up ? unit(p.A, up.A) : [-t[0], -t[1]], base = napHl ? add2(p.A, back, napHl + 5.5) : p.A; // up its span, toward the homing
        const ow = [-p.td[0], -p.td[1]], cid = p.closureId || 'CLOSURE', tw = Math.max(8, cid.length) * IDS.h * CHW, Rq = cloR(p.A); // (2.44.12: its size, its texts as large as the IDs)
        const cands = []; for (const off of [9.5, 14, 19]) for (const k of [0, -6, 6, -12, 12, -18, 18, -24]) for (const side of [1, -1]) { const q = add2(base, back, Math.max(-6, Math.min(6, k))), tq = add2(add2(q, ow, side * off), back, k - Math.max(-6, Math.min(6, k))), lx = tq[0] - tw / 2; // the symbol near its pole, the texts beside it where they cover nothing
          cands.push({ q, lx, ty: tq[1], boxes: [textBox(lx - 1.5, tq[1] + IDS.h * 0.6, IDS.h, 'PROPOSED  ', 0, 0, 2), textBox(lx - 1.5, tq[1] - IDS.h * 0.85, IDS.h, cid + '  ', 0, 0, 2), Spots.box(q[0], q[1], 2 * Rq, 2 * Rq * 0.45, rd)] }); } // (a little room round the texts)
        if (TIDY) { // beta 4.8: Tidy: 0.7 W at most, its texts a level label beside it (end of step 8)
          const fC = fitW(1.9 * 4.35, base) / kAt(base[0], base[1]), c2 = pick(spots, cands.map((x) => ({ ...x, boxes: [Spots.box(x.q[0], x.q[1], 9 * fC, 4 * fC, rd)] }))), sb = spots.add(c2.boxes[0]), v0 = p.closureOld ? 'EXISTING' : 'PROPOSED';
          if (!p.closureOld) { o.insert(lay('P-JOINT'), 'P-Joint', c2.q[0], c2.q[1], { scale: 4.35 * fC, rot: rd, attrs: { JT_ID: '', JOINT: '' } }); cloLbl.push({ at: c2.q, R: 4.35 * fC * 0.9, cid, p }); continue; } // (beta 6.7: its red label and arrow after everything else)
          tidySym.push({ kind: 'clo', at: c2.q, r: 4.35 * fC, box: sb, ov: p.td, lines: [v0, cid], layer: lay('P-JOINT'), style: 'arial', color: null, pole: p,
            write: (P) => o.insert(lay('P-JOINT'), 'P-Joint', c2.q[0], c2.q[1], { scale: 4.35 * fC, rot: rd, attrs: { JT_ID: { v: v0, x: P[0].x, y: P[0].y, h: P[0].h, ha: P[0].ha, va: 3 }, JOINT: { v: cid, x: P[1].x, y: P[1].y, h: P[1].h, ha: P[1].ha, va: 3 } } }) });
          continue;
        }
        if (!p.closureOld) { const c = pick(spots, cands.map((x) => ({ ...x, boxes: x.boxes.slice(2) }))); o.insert(lay('P-JOINT'), 'P-Joint', c.q[0], c.q[1], { scale: Rq, rot: rd, attrs: { JT_ID: '', JOINT: '' } }); spots.add(c.boxes); cloLbl.push({ at: c.q, R: Rq * 0.9, cid, p }); continue; } // (beta 6.7: its red label and arrow after everything else)
        const c = pick(spots, cands);
        const jt = { JT_ID: { v: p.closureOld ? 'EXISTING' : 'PROPOSED', x: c.lx, y: c.ty + IDS.h * 0.6, h: IDS.h, ha: 0, va: 2 }, JOINT: { v: cid, x: c.lx, y: c.ty - IDS.h * 0.85, h: IDS.h, ha: 0, va: 2 } }; // v2.41: an existing hybrid closure says so
        o.insert(lay('P-JOINT'), 'P-Joint', c.q[0], c.q[1], { scale: Rq, rot: rd, attrs: jt }); spots.add(c.boxes);
      }
    }
    let nCloInl = 0;
    for (const it of inl.values()) { // v2.42.24: each closure on the cable: its pentagon at its pole (v2.42.25: its texts after the loops and guys, so they cover none); PROPOSED and its ID (an existing one: its ID) where they cover nothing, smaller as needed
      if (it.kind !== 'clo') continue;
      if (!it.old) { o.insert(it.layer, 'P-Joint', it.at[0], it.at[1], { scale: it.sc, attrs: { JT_ID: '', JOINT: '' } }); cloLbl.push({ at: it.at, R: it.hh, cid: it.cid, p: it.p }); nInline++; nCloInl++; continue; } // (beta 6.7: a proposed one: its red label and arrow after everything else)
      if (TIDY) { // beta 4.8: Tidy: PROPOSED and its ID a level label beside it, placed with the pole labels (end of step 8), and the pentagon then
        const at = it.at, R = it.hh;
        tidySym.push({ kind: 'clo', at, r: R, box: it.sbox, ov: it.p.td || [0, 1], lines: it.old ? [it.cid] : ['PROPOSED', it.cid], layer: it.layer, style: 'arial', color: it.old ? 5 : null, pole: it.p, write: (P) => {
          if (it.old) { const pts = [...Array(5)].map((_, i) => { const a = (90 + i * 72) * Math.PI / 180; return [at[0] + R * Math.cos(a), at[1] + R * Math.sin(a)]; });
            o.lwpoly(it.layer, pts, { closed: true, color: 5, lwt: 35 }); o.text(it.layer, P[0].x, P[0].y, P[0].h, it.cid, { ha: P[0].ha, va: 3, style: 'arial', color: 5 }); }
          else o.insert(it.layer, 'P-Joint', at[0], at[1], { scale: it.sc, attrs: { JT_ID: { v: 'PROPOSED', x: P[0].x, y: P[0].y, h: P[0].h, ha: P[0].ha, va: 3 }, JOINT: { v: it.cid, x: P[1].x, y: P[1].y, h: P[1].h, ha: P[1].ha, va: 3 } } });
        } });
        nInline++; nCloInl++; continue;
      }
      const at = it.at, R = it.hh, lines = it.old ? [it.cid] : ['PROPOSED', it.cid]; let best = null;
      for (const th of [IDS.h, IDS.h * 0.85, IDS.h * 0.7, IDS.h * 0.6]) { const w = Math.max(...lines.map((s) => arialW(s, th, false))); // (2.44.12: as large as the other IDs)
        for (const off of [0.5, 1.6, 3.2]) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const lx = dx > 0 ? at[0] + R + th * off : dx < 0 ? at[0] - R - th * off - w : at[0] - w / 2, yc = at[1] + dy * (R + th * (lines.length === 2 ? 1.5 : 0.9) + (dx ? 0 : th * off * 0.5));
          const ys = lines.length === 2 ? [yc + th * 0.65, yc - th * 0.65] : [yc], boxes = lines.map((s, i) => textBox(lx, ys[i], th, s, 0, 0, 2)), n = boxes.reduce((t2, b) => t2 + spots.hitsW(b, W_LBL0), 0) + (cellHolds(boxes[0], at[0], at[1]) ? 0 : 5);
          if (!best || n < best.n) best = { lx, ys, th, boxes, n }; if (n < 0.45) break; }
        if (best.n < 0.45) break; }
      if (it.old) { const pts = [...Array(5)].map((_, i) => { const a = (90 + i * 72) * Math.PI / 180; return [at[0] + R * Math.cos(a), at[1] + R * Math.sin(a)]; });
        o.lwpoly(it.layer, pts, { closed: true, color: 5, lwt: 35 }); o.text(it.layer, best.lx, best.ys[0], best.th, it.cid, { ha: 0, va: 2, style: 'arial', color: 5 }); }
      else o.insert(it.layer, 'P-Joint', at[0], at[1], { scale: it.sc, attrs: { JT_ID: { v: 'PROPOSED', x: best.lx, y: best.ys[0], h: best.th, ha: 0, va: 2 }, JOINT: { v: it.cid, x: best.lx, y: best.ys[1], h: best.th, ha: 0, va: 2 } } });
      spots.add(best.boxes, 'label'); nInline++; nCloInl++;
    }
    // 8. the pole labels (the template's attributes: proposed pole / height / clamp, material / pole tag), the coordinates and
    //    the pole number in its circle, outward from the road; turned a little where a neighbour's label is in the way
    const poleOrder = []; const seen = new Set();
    const startOf = (ch) => { const a = byId.get(ch.ids[0]), b = byId.get(ch.ids[ch.ids.length - 1]); return (b && b.el !== 'Pole' && !(a && a.el !== 'Pole')) ? ch.ids.slice().reverse() : ch.ids; };
    chains.slice().sort((x, y) => (y.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0) - (x.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0))
      .forEach((ch) => startOf(ch).forEach((id) => { const p = byId.get(id); if (p && p.el === 'Pole' && !seen.has(p)) { seen.add(p); poleOrder.push(p); } }));
    pts.forEach((p) => { if (p.el === 'Pole' && !p.onPole && !seen.has(p)) { seen.add(p); poleOrder.push(p); } });
    // v2.41.1: each pole's frame: fw along the route (away from the homing), on straight out from the cable on the pole's side (away
    //          from the road); the labels, photos and numbers take the same place in it at every pole where there is room
    { const linked = (a, b) => !!a && !!b && (nb.get(a) || []).includes(b);
      poleOrder.forEach((p, i) => {
        const a = poleOrder[i - 1], b = poleOrder[i + 1], okA = linked(p, a), okB = linked(p, b);
        let t = okA && okB ? unit(a.dp, b.dp) : okB ? unit(p.dp, b.dp) : okA ? unit(a.dp, p.dp) : tangent(p);
        if (!(Math.hypot(t[0], t[1]) > 0.5)) t = [1, 0];
        let n = [-t[1], t[0]]; if (p.td && n[0] * p.td[0] + n[1] * p.td[1] > 0) n = [-n[0], -n[1]];
        p.fw = t; p.on = n;
      }); }
    /** v2.42.21: a pole's clamp types (and its 12C hardware) as a tag, or a callout with a leader line, beside it where it covers
        nothing (auto: across the cable from its label first, then along the cable), on its own layer, in the style's colour and height. */
    let clLay = null;
    // beta 4.7: Export the plan › Labels: Tidy (job.labels 'tidy'). The Standard labels are worked out as before and their places kept
    // (so the photos, numbers, span lengths, cable labels, IDs and street names go exactly where Standard puts them), but not written;
    // once everything else is placed, those places are given back and each pole gets one level label instead (see the end of step 12)
    const tidy = job.labels === 'tidy', tidyStd = [], tidyTodo = [], PIDF = ['stack', 'line'].includes((job.poleStyle || {}).idForm) ? job.poleStyle.idForm : 'auto'; // (beta 6.2: the pole's ID in the Tidy block)
    const clTag = (p, L) => {
      const CS = job.clampStyle || {}; if (!clLay) { addLayer(d, S, 'G-ESAA POLE CLAMP', 4); clLay = 'G-ESAA POLE CLAMP'; }
      const h = Math.max(1, (+CS.h || 2) * (p.k || 1)), lh = h * 1.4, w = Math.max(...L.map((t) => arialW(t, h, false))) + h * 0.8, ht = L.length * lh + h * 0.3, far = CS.place === 'callout' ? 6 : 1.2;
      const ov = p.ov || p.on || [0, 1], fw = p.fw || [1, 0], POS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
      const dirs = POS[CS.pos] ? [POS[CS.pos]] : [[-ov[0], -ov[1]], fw, [-fw[0], -fw[1]], rotv([-ov[0], -ov[1]], 40), rotv([-ov[0], -ov[1]], -40), rotv(ov, 50), rotv(ov, -50)];
      const cs = [];
      dirs.forEach((u0, i) => { const n = Math.hypot(u0[0], u0[1]) || 1, u = [u0[0] / n, u0[1] / n], ext = Math.abs(u[0]) * w / 2 + Math.abs(u[1]) * ht / 2;
        [0, 1.6, 3.2].forEach((more, j) => { const dd = p.rp + far + ext + more * h, A = add2(p.dp, u, dd); cs.push({ A, u, ext, boxes: [Spots.box(A[0], A[1], w, ht, 0)], cost: i * 3 + j }); }); });
      const c = pickC(spots, cs, POLELBL_W); spots.add(c.boxes, 'clamp:' + (p.poleId || ''));
      if (tidy) { tidyStd.push(...c.boxes); return; } // (beta 4.7: Tidy: the clamp types are the label's second line)
      const col = +CS.color ? +CS.color : null, [x, y] = c.A;
      L.forEach((t, i) => o.text(clLay, x, y + ((L.length - 1) / 2 - i) * lh, h, t, { ha: 1, va: 2, style: 'arial', color: col }));
      if (CS.box !== false) o.lwpoly(clLay, [[x - w / 2, y - ht / 2], [x + w / 2, y - ht / 2], [x + w / 2, y + ht / 2], [x - w / 2, y + ht / 2]], { closed: true, color: col });
      if (CS.place === 'callout') o.lwpoly(clLay, [add2(p.dp, c.u, p.rp + 0.3), add2(c.A, c.u, -c.ext)], { color: col });
    };
    for (const p of poleOrder) {
      const TBp = crowdAt(p) || (nb.get(p) || []).some((q) => q.el === 'Pole' && crowdAt(q)) ? textBoxA : textBox; // (2.44.12: at or beside a crowded pole: its texts as wide as drawn)
      const PST = job.poleStyle || {}, hI0 = +PST.idH > 0 ? +PST.idH : 2.2, hO0 = +PST.ownH > 0 ? +PST.ownH : hI0, hL0 = +PST.llH > 0 ? +PST.llH : 1.2; // beta 4.3: the heights of the drawing style (none set: 2.2 m and 1.2 m, as before)
      const H = Math.max(1.5 * hI0 / 2.2, hI0 * p.k), HO = Math.max(1.5 * hO0 / 2.2, hO0 * p.k), HL = Math.max(0.9 * hL0 / 1.2, hL0 * p.k), size = p.size || clampText(p); // size: the clamps and their size (the app records no other size of an existing pole)
      const CS = job.clampStyle || {}, clIn = !CS.place || CS.place === 'label', clT = clampText(p), stackCl = clIn ? (clT || p.hw || '') : '', stackSz = clIn ? (size || p.hw || '') : ''; // v2.42.21: in the label (as before), or a tag / callout; a 12C-only pole: its hardware
      // v2.33: the pole tag without its material prefix (material CC + tag CC-0430621 → CC / 0430621), as the template's sample
      const bare = (v) => { const m = String(p.mat || '').trim(), t = String(v || ''); return m && t.toUpperCase().startsWith(m.toUpperCase()) && /^([-_ .][A-Z0-9]|\d)/i.test(t.slice(m.length)) && t.length > m.length ? t.slice(m.length).replace(/^[-_ .]/, '') : t; };
      const tag = bare(p.tag != null && p.tag !== '' ? p.tag : (!p.poleId || /^NPT/i.test(p.poleId) ? 'NPT' : p.poleId));
      const lines = p.sym.r === POLE_SYM.prop.r ? [['GT-POLE', p.label1 || 'PROP.POLE'], ['PHEIGHT', p.height || ''], ['POLE_CLAMP', stackCl]]
        : p.sym.b === 'existing telecom pole' ? [['OC', p.mat || ''], ['GT-001', bare(p.poleId || '')], ['', stackSz]] : [['CC', p.mat || ''], ['NPT', tag], ['B', stackSz]];
      if (p.ownerName && p.sym.r !== POLE_SYM.prop.r && !lines.some(([, v]) => String(v).toUpperCase() === p.ownerName)) lines.push(['', p.ownerName]); // v2.42.18: the pole owner's name (the coop)
      const shown = lines.filter(([, v]) => v);
      const lat = `${p.lat.toFixed(6)}°`, lon = `${p.lon.toFixed(6)}°`;
      const ll = `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`;
      // one stack in the direction of the ID, read from the pole outward: material / tag (/ size), then latitude / longitude
      // smaller under them (v2.33: the coordinates are part of the stack, as in the template's sample)
      const isOwn = ([t, v]) => t === '' && !!p.ownerName && v === p.ownerName, hs = shown.map((x) => (isOwn(x) ? HO : H)), sumH = hs.reduce((s, x) => s + 1.5 * x, 0), topOf = (k) => hs.slice(0, k).reduce((s, x) => s + 1.5 * x, 0); // (beta 4.3: the owner's name may have its own height)
      const n = shown.length, gap = 0.35 * H, llH = HL * (1 + 5 / 3), T = sumH + gap + llH;
      const cands = [];
      // v2.41: also a little further out before covering anything; a road edge line counts least, the cable more, a label most.
      // v2.41.1: every label in the same direction (straight out from the cable, at right angles to it) where there is room: moved a
      //          little sideways or further out before it is turned (the commonest thing in the way, a side guy, points straight out too)
      for (const v of LBL_VAR) {
        const ov = rotv(p.on, v.a), dg = deg(ov), rr = readable(dg), flip = Math.abs(((dg - rr) % 360 + 360) % 360 - 180) < 1, ha = flip ? 2 : 0;
        const up = rotv([Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)], 90);
        const base = add2(add2(p.dp, ov, p.rp + 1.2 + v.ex), p.fw, v.sh), boxes = [], place = [];
        shown.forEach(([t, v], k) => { const q = add2(base, up, T / 2 - topOf(k) - 0.75 * hs[k]); place.push([t, v, q, hs[k]]); boxes.push(TBp(q[0], q[1], hs[k], v, rr, ha, 2)); });
        const llAt = add2(base, up, T / 2 - sumH - gap - llH / 2);
        [[lat, HL * 5 / 6], [lon, -HL * 5 / 6]].forEach(([v, dy]) => { const q = add2(llAt, up, dy); boxes.push(TBp(q[0], q[1], HL, v, rr, ha, 2)); });
        cands.push({ boxes, place, rr, ha, llAt, ov, flip, cost: v.cost, v });
      }
      // beta 3.4: inside the pole's own GEO sheet first (the sheet's viewport cuts off anything past the grid line)
      const inC = cands.filter((x) => x.boxes.every((b) => cellHolds(b, p.E, p.N))), cIn = inC.length ? pickC(spots, inC, POLELBL_W) : null;
      const cAny = cIn && !cIn.n ? cIn : pickC(spots, cands, POLELBL_W), c = cIn && (cIn.n || 0) <= (cAny.n || 0) ? cIn : cAny;
      spots.add(c.boxes, 'label:' + p.poleId); p.lblVar = c.v; if (tidy) tidyStd.push(...c.boxes); // (beta 4.7: Tidy: its place kept until the end)
      // beta 3.4: how far out from the pole the label (ID, details and coordinates) reaches, and its middle along the cable: the photo
      //           goes past it (pole, then its ID and details, then the photo), never beside the pole itself
      { const ov = c.ov, fw = p.fw || [1, 0], pr = (b, d) => (b.cx - p.dp[0]) * d[0] + (b.cy - p.dp[1]) * d[1], ext = (b, d) => b.hw * Math.abs(b.ux * d[0] + b.uy * d[1]) + b.hh * Math.abs(b.vx * d[0] + b.vy * d[1]);
        p.lblFar = Math.max(...c.boxes.map((b) => pr(b, ov) + ext(b, ov)));
        const f0 = Math.min(...c.boxes.map((b) => pr(b, fw) - ext(b, fw))), f1 = Math.max(...c.boxes.map((b) => pr(b, fw) + ext(b, fw))); p.lblMid = (f0 + f1) / 2; p.lblDir = ov; }
      p.lblS = c.v.a === 0 ? [c.v.sh - T / 2 - 0.8, c.v.sh + T / 2 + 0.8] : null; // v2.41.1: where the label is along the cable (its photo goes beside it)
      // the block keeps the values in its attributes (hidden); the labels are plain texts in one direction (the pole blocks
      // of the template are dynamic blocks, and AutoCAD would put some of their attributes back where the block wants them)
      const attrs = {}; lines.forEach(([t, v]) => { if (t) attrs[t] = { v, x: p.dp[0], y: p.dp[1], rot: c.rr, h: H, ha: 0, va: 0, hidden: true }; });
      if (attrs.POLE_CLAMP) attrs.POLE_CLAMP.v = clT; if (attrs.B) attrs.B.v = size; // (v2.42.21: the block keeps the values wherever they are shown)
      /* beta 6.7 (the owner: "For existing Globe pole or bayantel pole, can you let the drawing block to plan a circle + fill blue? so that we
         can easily distinguish it with other telco poles"): an existing Globe (GT) or Bayantel (BT) pole: a circle filled blue, the size of
         the telecom pole's model, its values kept in its (hidden) attributes; other telco poles keep the template's model */
      if (gtFill(p) && fillBlocks(d, S, [{ name: GT_DISC, icon: GT_DISC_ICON }]) >= 0 && S.blocks.has(GT_DISC)) o.insert(lay(p.sym.layer), GT_DISC, p.dp[0], p.dp[1], { scale: 2 * p.rp, attrs });
      else if (p.sym.b) o.insert(lay(p.sym.layer), p.sym.b, p.dp[0], p.dp[1], { scale: p.sym.sc * p.k, center: true, attrs }); else o.circle(lay(p.sym.layer), p.dp[0], p.dp[1], p.rp);
      const look = p.sym.b ? attrLook(S, p.sym.b) : new Map();
      if (!tidy) c.place.forEach(([t, v, q, hq]) => { const lk = look.get(t) || {}, isCl = clIn && v && (t === 'POLE_CLAMP' || t === 'B' || (t === '' && v === stackSz && v !== p.ownerName)), own = isOwn([t, v]), prop = p.sym.r === POLE_SYM.prop.r, sc = prop ? 0 : own ? +PST.ownColor || +PST.idColor || 0 : isCl ? 0 : +PST.idColor || 0; // (beta 4.3: the ID lines and the owner's name in the style's colour; none set, or a proposed pole: the template's)
        o.text(lk.layer && lk.layer !== '0' ? lay(lk.layer) : lay(p.sym.layer), q[0], q[1], hq, v, { rot: c.rr, ha: c.ha, va: 2, style: 'arial', color: isCl && CS.color ? +CS.color : sc ? sc : lk.color != null ? +lk.color : null }); }); // (v2.42.21: the clamp types in the style's colour)
      if (!tidy) o.mtext(lay('LATLONG'), c.llAt[0], c.llAt[1], HL, ll, { style: '样式 1', att: c.flip ? 6 : 4, dir: [Math.cos(c.rr * Math.PI / 180), Math.sin(c.rr * Math.PI / 180)], color: +PST.llColor || null });
      p.ov = c.ov; p._rr = c.rr;
      if (tidy) { // beta 4.7: Tidy: one level label: line 1 tag · type; under it, smaller (one size for all), the attachments, the owner and the lat/long, each in the Standard label's colour and on its layer
        const prop = p.sym.r === POLE_SYM.prop.r, tel = p.sym.b === 'existing telecom pole', [kId, kTy, kCl] = prop ? ['GT-POLE', 'PHEIGHT', 'POLE_CLAMP'] : tel ? ['GT-001', 'OC', ''] : ['NPT', 'CC', 'B'];
        const id = prop ? p.label1 || 'PROP.POLE' : tel ? bare(p.poleId || '') : tag, ty = prop ? p.height || '' : p.mat || '', l2 = String((clIn ? (prop ? stackCl : stackSz) : [clT, p.hw].filter(Boolean).join(' ')) || '').trim();
        const lkOf = (k) => look.get(k) || {}, colOf = (k, isCl) => { const lk = lkOf(k), sc = prop || isCl ? 0 : +PST.idColor || 0; return isCl && CS.color ? +CS.color : sc ? sc : lk.color != null ? +lk.color : null; };
        const layOf = (k) => { const lk = lkOf(k); return lk.layer && lk.layer !== '0' ? lay(lk.layer) : lay(p.sym.layer); }, layT = layOf(kId), c0 = colOf(kId, false), cT = colOf(kTy, false);
        const run = (s, cl) => (cl === c0 ? mtextEsc(s) : `{\\C${cl == null ? 256 : cl >= TC0 ? aciOf(cl - TC0) : cl};${mtextEsc(s)}}`); // (a part in another colour than the label's; beta 6.0: a colour of the user's own: its nearest AutoCAD colour there)
        const l1 = [id, ty].filter((v) => String(v || '').trim()).join(' · ') || 'NPT', sm = [], ownL = shown.find(isOwn), lkO = lkOf('');
        if (l2) sm.push({ s: l2, layer: clIn ? layOf(kCl) : null, color: clIn ? colOf(kCl, true) : +CS.color || null, wrap: true }); // (clamps as a tag or a callout: on their own layer, as Standard's tag: clLay, made by clTag below)
        if (ownL) sm.push({ s: ownL[1], layer: layOf(''), color: +PST.ownColor || +PST.idColor || (lkO.color != null ? +lkO.color : null) });
        const ll2 = job.tidyLL !== 1; // beta 4.8: the latitude above the longitude (a narrower label; job.tidyLL 1: on one line, for tests)
        sm.push({ s: `${lat}, ${lon}`, ll: ll2 ? [lat, lon] : null, mt: ll2 ? `${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D` : `${p.lat.toFixed(6)}%%D, ${p.lon.toFixed(6)}%%D`, layer: lay('LATLONG'), color: +PST.llColor || null });
        /* beta 6.2 (the owner: "CC-123456 instead? Or CC over 123456 as in previous versions … the later as default and CC-123456 if needs room"):
           the pole's ID stacked as Standard draws it (its type over its number, CC over 123456; a proposed pole: PROP.POLE over its height) or on
           one line (CC-123456; a proposed pole: PROP.POLE · 9.14m, as before); Drawing style › Pole details › Pole ID (Tidy): Auto (stacked,
           one line where a stacked block finds no room), stacked, or one line. The block is measured in the form it is drawn (see prep). */
        const sId = String(id || '').trim(), sTy = String(ty || '').trim(), both = !!(sId && sTy), one = prop ? `${sId} · ${sTy}` : `${sTy}-${sId}`;
        const forms = both ? { stack: { lines: prop ? [sId, sTy] : [sTy, sId], text: prop ? `${mtextEsc(sId)}\\P${run(sTy, cT)}` : `${run(sTy, cT)}\\P${mtextEsc(sId)}` }, line: { lines: [one], text: prop ? mtextEsc(sId) + run(` · ${sTy}`, cT) : run(`${sTy}-`, cT) + mtextEsc(sId) } } : null;
        tidyTodo.push({ p, h: TS.l1, hs: TS.sm, l1: both ? one : l1, sm, layer: layT, color: c0, text: id && ty ? mtextEsc(id) + run(` · ${ty}`, cT) : mtextEsc(l1), forms, form: forms ? (PIDF === 'line' ? 'line' : 'stack') : null, pf: !!forms && PIDF === 'auto' }); // (beta 4.8: the sizes of TS)
      }
      if (!clIn && (clT || p.hw)) clTag(p, [clT, p.hw].filter(Boolean)); // v2.42.21
    }
    if (job.crowd) placeIds(); // beta 3.8: Crowded places Auto: the IDs after the pole labels
    // 2.44.12: each crowded closure (see cloCrowd), after the pole labels: on its cable a little away from its pole where it covers
    //           nothing, else beside the pole with a line to it; its loop on the way to it
    for (const p of cloLate) {
      const t = downAt(p), rd = readable(deg(t));
      const Rc = p.cloOff.R, cid = p.closureId || 'CLOSURE', lines = p.closureOld ? [cid] : ['PROPOSED', cid], W_CLO = (tg) => (tg === 'cable' ? 0.05 : tg === 'road' ? 0.2 : 1), W_ON = (tg) => (tg === 'cable' || tg === 'road' ? 0 : 1); // (on its cable, in the street: its edge lines do not count)
      const lb0 = blockBox(S, 'loopp', 0), lwq = p.mloop && lb0 ? (lb0[2] - lb0[0]) * 2.470465709436871 * 0.4 : 0, lhq = p.mloop && lb0 ? (lb0[3] - lb0[1]) * 2.470465709436871 * 0.4 : 0; // (its loop, between the pole and it: room for it at 0.4 of its size at least)
      const clash = (A, B) => A.some((x) => B.some((y) => Spots.hit(x, y))); // (its texts not over its own line or its loop's room)
      const loopRoom = (a, e) => { if (!lwq) return []; const L = dist2(a, e); if (L < lwq + 0.4) return null; const m = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2]; return [Spots.box(m[0], m[1], L, 2 * lhq * 0.84 + 0.4, deg(unit(a, e)))]; };
      const sym = (c) => Spots.box(c[0], c[1], 2 * Rc + 0.6, 2 * Rc + 0.6, 0), txtAt = (c, th) => { if (TIDY) return [{ lx: c[0], ys: [c[1], c[1]], th, tb: [] }]; /* (Tidy: its texts a level label, placed with the pole labels below) */ const w = Math.max(...lines.map((x) => arialW(x, th, false))), out = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1]]) { const lx = dx > 0 ? c[0] + Rc + 0.6 : dx < 0 ? c[0] - Rc - 0.6 - w : c[0] - w / 2, yc = c[1] + dy * (dx ? Rc * 0.6 : Rc + th * (lines.length === 2 ? 1.5 : 0.9)), ys = lines.length === 2 ? [yc + th * 0.65, yc - th * 0.65] : [yc];
          out.push({ lx, ys, th, tb: lines.map((x, i) => textBoxA(lx, ys[i], th, x, 0, 0, 2)) }); } return out; };
      let best = null;
      for (const th of TIDY ? [0] : [IDS.h, IDS.h * 0.85, IDS.h * 0.7]) {
        const cands = [];
        for (const q of (nb.get(p) || []).filter((x) => x.A)) { const u = unit(p.A, q.A), L = dist2(p.A, q.A), ug = ugOf(p).includes(q); // on its cable: along each of its spans, past its pole, before the next point
          for (let sv = Rc + rOfPt(p) + (isRiser(p) && ug ? 2 * riserR + 0.6 : 0) + 1.0 + lwq; sv <= L - Rc - rOfPt(q) - 1.0; sv += 1.0) { const c = add2(p.A, u, sv), lr = loopRoom(pastPole(p, u), add2(c, u, -(Rc + 0.4))); if (!lr) continue; for (const tp of txtAt(c, th)) if (!clash(tp.tb, lr)) cands.push({ c, ...tp, boxes: [sym(c)], room: lr, keep: [sym(c), ...tp.tb], cost: sv + (ug ? 4 : 0) }); } }
        for (const dd of p.mloop ? [8, 11, 15, 20] : [5, 8, 12, 17]) for (let k = 0; k < 16; k++) { /* (its loop drawn after it: room left for it at the pole) */ const v = rotv([1, 0], k * 22.5), c = add2(p.A, v, Rc + dd), e = add2(c, v, -Rc), a = pastPole(p, v), lb = Spots.box((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, Math.max(0.1, dist2(a, e)), 0.5, deg(v)), lr = loopRoom(a, e) || []; // beside it, a line to it (where its loop has no room: last)
          for (const tp of txtAt(c, th)) if (!clash(tp.tb, [lb, ...lr])) cands.push({ c, lead: [a, e], ...tp, boxes: [sym(c), lb], room: lr, keep: [sym(c), ...tp.tb], cost: 100 + dd * 3 + (lwq && !lr.length ? 500 : 0) }); }
        cands.sort((x, y) => x.cost - y.cost);
        let c = null; for (const x of cands) { const n = x.boxes.reduce((t2, b) => t2 + spots.hitsW(b, x.lead ? W_CLO : W_ON), 0) + x.tb.reduce((t2, b) => t2 + spots.hitsW(b, W_CLO), 0) + x.room.reduce((t2, b) => t2 + spots.hitsW(b, W_ON), 0); /* (its loop's room: over a road's edge line or the cable is fine) */ if (n < 0.5) { c = { ...x, n: 0 }; break; } if (!c || n < c.n) c = { ...x, n }; } // (the first that covers nothing: a road's edge line or a cable under it counts little)
        if (c && (!best || c.n < best.n)) best = c; if (best && !best.n) break;
      }
      if (best && !p.closureOld) { // beta 6.7: a proposed one: its pentagon (and its line to the pole) here, its red label and arrow after everything else
        const at = best.c; o.insert(lay('P-JOINT'), 'P-Joint', at[0], at[1], { scale: Rc, attrs: { JT_ID: '', JOINT: '' } }); spots.add(sym(at)); cloLbl.push({ at, R: Rc * 0.9, cid, p });
        if (best.lead) { o.lwpoly(lay('P-JOINT'), best.lead, { color: 8 }); spots.line(best.lead, 0.5); } nCloOff++;
        { const u = unit(p.A, at), a = pastPole(p, u), e = add2(at, u, -(Rc + 0.4)); if (dist2(p.A, e) > dist2(p.A, a)) p.cloAt = [a, e]; }
      } else if (best) {
        const at = best.c;
        if (TIDY) { const sb = spots.add(sym(at)); tidySym.push({ kind: 'clo', at, r: Rc, box: sb, ov: unit(p.A, at), lines, layer: lay('P-JOINT'), style: 'arial', color: p.closureOld ? 5 : null, pole: p, write: (P) => { // (Tidy: its texts a level label beside it)
          if (p.closureOld) { const P5 = [...Array(5)].map((_, i) => { const a5 = (90 + i * 72) * Math.PI / 180; return [at[0] + Rc * Math.cos(a5), at[1] + Rc * Math.sin(a5)]; }); o.lwpoly(lay('P-JOINT'), P5, { closed: true, color: 5, lwt: 35 }); o.text(lay('P-JOINT'), P[0].x, P[0].y, P[0].h, cid, { ha: P[0].ha, va: 3, style: 'arial', color: 5 }); }
          else o.insert(lay('P-JOINT'), 'P-Joint', at[0], at[1], { scale: Rc, attrs: { JT_ID: { v: 'PROPOSED', x: P[0].x, y: P[0].y, h: P[0].h, ha: P[0].ha, va: 3 }, JOINT: { v: cid, x: P[1].x, y: P[1].y, h: P[1].h, ha: P[1].ha, va: 3 } } }); } }); }
        else {
          if (p.closureOld) { const P5 = [...Array(5)].map((_, i) => { const a5 = (90 + i * 72) * Math.PI / 180; return [at[0] + Rc * Math.cos(a5), at[1] + Rc * Math.sin(a5)]; }); o.lwpoly(lay('P-JOINT'), P5, { closed: true, color: 5, lwt: 35 }); o.text(lay('P-JOINT'), best.lx, best.ys[0], best.th, cid, { ha: 0, va: 2, style: 'arial', color: 5 }); }
          else o.insert(lay('P-JOINT'), 'P-Joint', at[0], at[1], { scale: Rc, attrs: { JT_ID: { v: 'PROPOSED', x: best.lx, y: best.ys[0], h: best.th, ha: 0, va: 2 }, JOINT: { v: cid, x: best.lx, y: best.ys[1], h: best.th, ha: 0, va: 2 } } });
        }
        if (best.lead) { o.lwpoly(lay('P-JOINT'), best.lead, { color: 8 }); spots.line(best.lead, 0.5); }
        if (!TIDY) spots.add(best.keep, 'label'); nCloOff++; // (the room kept for its loop: free for the loop, below)
        { const u = unit(p.A, at), a = pastPole(p, u), e = add2(at, u, -(Rc + 0.4)); if (dist2(p.A, e) > dist2(p.A, a)) p.cloAt = [a, e]; } // (its loop between the pole and it, see loopAt)
      }
      if (p.mloop) loopAt(p, t, rd, 0);
    }
    /* beta 4.7, 4.8: Labels: Tidy. Each pole gets one level label (its first line TS.l1 high; under it, TS.sm high, its clamps, owner
       and lat/long), and each ID, loop length and closure name a level label beside its symbol (tidySym). beta 4.8: they are placed
       here, before the span lengths, photos, numbers and street names, which then keep off them (4.7: after everything else, which
       stayed where Standard puts it). The Standard labels' places (worked out as before) are given back first. Places round the pole
       or symbol first (the side its Standard label took first), then further out with a thin line to it; never nearer another pole
       (or symbol) than its own; about 1 m clear of every label, street name, cable, symbol, photo and line (0.5 m, then 0.15 m where
       there is no such room), inside its own GEO sheet, clear of road edge lines where it can be. Where no place is free: the one
       nearest its own pole or symbol covering least, its line kept, listed in the report's notes (and the labels round it tried again
       with it first). */
    const LEAD_OK = (job.gridStyle || {}).leaders === 'allow'; // beta 6.0: Drawing style › Grid › Leader lines: Allowed (else only where there is no other way)
    /* beta 6.4 (the owner: "settings is photo is large but the plan still is small. it does not follow rule"): Tidy draws each pole's photo at
       the size Drawing style › Photos sets, as printed on the A3 sheet at any grid: Small 5 mm, Normal 6.5 mm (about Tidy's size before),
       Large 9 mm, Extra large 13 mm on its long side; your own size in metres at 1:1100 (job.photoStyle.tidyMm from the app, else from
       size). Where it has no free place near its pole at that size: a quarter smaller (listed), else on its own near the pole. */
    /* beta 6.7 (the owner: "the photo small, medium and large is not spaced enough. Also the photo does not have the same size on the plan, we
       want a same size fit all.. if i choose large then large for all ... i tried 300 i think that should be your large"): every photo of a
       plan at exactly the size Drawing style › Photos sets, printed on the A3 sheet: Small 9 mm, Normal 18 mm, Large 36 mm (what an own size
       of 300 gave in beta 6.6), Extra large 48 mm on its long side; your own size in metres at 1:1100 (to 48 mm). Never smaller: where it has
       no room near its pole it goes where there is room, with a thin line to its pole; the pole details and number keep their place. */
    const PHMM = (() => { const P0 = job.photoStyle || {}; if (+P0.tidyMm > 0) return Math.min(PH_MAX_MM, Math.max(4, +P0.tidyMm)); const z = +P0.size > 0 ? +P0.size : 18; return PH_STEP_MM[z] || Math.min(PH_MAX_MM, Math.max(4, z / 1.1)); })();
    const NEAR_PH = Math.max(+(job.photoStyle || {}).nearMm > 0 ? Math.min(40, Math.max(8, +job.photoStyle.nearMm)) : 16, PHMM * 0.8 + 6) / ((printK || 0.62) * NU); // (beta 6.7: at least as far as a photo of its size beside the pole details reaches) // (beta 6.0: Drawing style › Photos › near its pole, 8 to 40 mm) // beta 6.0: a pole's photo is near it within 16 mm on the A3 sheet (its centre): 26 m of the drawing at the template's grid, 13 m at 1/2, 8.7 m at 1/3
    const TX = {}, tidyOwn = new Set(), tidyGrp = new Map(), T7 = { labels: 0, leaders: 0, closer: 0, notFree: 0 }; // (beta 6.0: tidyGrp: the records of one Tidy label, its texts, number and photo, which may touch each other)
    const MOVABLE = new Set(['PROPOSED LOOP', 'Proposed NAP ID', 'MISC', 'Distance Data'].filter((n) => S.layers.has(n))); // (loops, IDs, span lengths, cable names; not a street name, a number (it has its circle) or a cable's label (its arrow); only the template's own layers: none of layer 0, where a template without them puts everything)
    /** every text written so far (IDs, closures' attributes, span lengths, cable labels, loops, street names, landmarks, the grid's
        numbers…), its box as wide as AutoCAD draws it in Arial and a little more (the places' estimate is narrower for capitals) */
    const scanTexts = () => {
      const tx = new Spots(), txG = new Spots(), txR = new Spots(), tRecs = [], all = [], gv = (r, c, dv) => { const q = r.find((x, i) => i > 0 && x[0] === c); return q ? q[1] : dv; }; // (txR: the same texts at their real size, no margin: what really overlaps)
      const mplain = (s) => String(s).replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/%%[dD]/g, '°');
      for (const r of o.model) {
        const t = r[0][1]; if ((t !== 'TEXT' && t !== 'ATTRIB' && t !== 'MTEXT') || [KMLAY, VLAY, VMAP].includes(gv(r, 8, ''))) continue;
        const h0 = +gv(r, 40, 0); if (!(h0 > 0) || (t === 'ATTRIB' && (parseInt(gv(r, 70, '0'), 10) & 1))) continue;
        if (t === 'MTEXT') {
          const L = mplain(r.filter((x, i) => i > 0 && (x[0] === 3 || x[0] === 1)).map((x) => x[1]).join('')).split('\n'), w = Math.max(...L.map((l) => arialW(l, h0))) * 1.12, Hm = h0 + (L.length - 1) * h0 * 5 / 3 * (+gv(r, 44, 1) || 1);
          const at = parseInt(gv(r, 71, '1'), 10) || 1, cl = (at - 1) % 3, rw = Math.floor((at - 1) / 3), a = Math.atan2(+gv(r, 21, 0), +gv(r, 11, 1)), u = [Math.cos(a), Math.sin(a)], du = w * (0.5 - cl * 0.5), dv = Hm * (rw * 0.5 - 0.5);
          (gv(r, 8, '') === lay('GRIDNO.', 'GRIDNO') ? txG : tx).add(Spots.box(+gv(r, 10, 0) + u[0] * du - u[1] * dv, +gv(r, 20, 0) + u[1] * du + u[0] * dv, w + h0 * 0.3, Hm + h0 * 0.3, a * 180 / Math.PI)); // (the sheet's big grid number: covered rather than a label far from its pole)
          if (gv(r, 8, '') !== lay('GRIDNO.', 'GRIDNO')) all.push({ r, b: txR.add(Spots.box(+gv(r, 10, 0) + u[0] * du / 1.12 - u[1] * dv, +gv(r, 20, 0) + u[1] * du / 1.12 + u[0] * dv, w / 1.12, Hm, a * 180 / Math.PI)) });
        } else {
          const w = arialW(gv(r, 1, ''), h0) * 1.12, ha = parseInt(gv(r, 72, '0'), 10) || 0, va = parseInt(gv(r, t === 'ATTRIB' ? 74 : 73, '0'), 10) || 0, a = +gv(r, 50, 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)];
          const x0 = ha || va ? +gv(r, 11, 0) : +gv(r, 10, 0), y0 = ha || va ? +gv(r, 21, 0) : +gv(r, 20, 0), du = ha === 1 || ha === 4 ? 0 : ha === 2 ? -w / 2 : w / 2, dv = va === 2 ? 0 : va === 3 ? -h0 * 0.5 : h0 * 0.5;
          const bx = tx.add(Spots.box(x0 + u[0] * du - u[1] * dv, y0 + u[1] * du + u[0] * dv, w + h0 * 0.3, h0 * 1.25, a * 180 / Math.PI)), rb = txR.add(Spots.box(x0 + u[0] * du / 1.12 - u[1] * dv, y0 + u[1] * du / 1.12 + u[0] * dv, w / 1.12, h0, a * 180 / Math.PI));
          all.push({ r, b: rb }); if (t === 'TEXT' && MOVABLE.has(gv(r, 8, '')) && +gv(r, 62, 0) !== 250 && !tidyOwn.has(r)) tRecs.push({ r, bx, rb, u, x0, y0, h0, a }); // (the texts that may slide: no number, which has its circle; no Tidy label)
        }
      }
      Object.assign(TX, { tx, txG, txR, tRecs, gv, all });
    };
    /** beta 4.8: where a Tidy label's texts go in the place c, in the label's own frame (its middle at 0, 0; x the way its text reads,
        c.u; y up the text): the text's alignment (MTEXT 1 top left, 2 top centre, 3 top right) and point, its number's circle (a column
        on the pole's side), its photo (at the far end), and the rectangles of its lines, circle and photo [left, top, width, height] (its
        line ends at the nearest of them); W(x, y): that point in the drawing. */
    const tidyGeo = (T, c) => {
      const L = -T.Wt / 2, Rr = T.Wt / 2, top = (T.Hc || T.Ht) / 2 - T.ex0, B = T.badge, P = T.u ? null : T.PH; // (beta 4.8: a block turned along its cable: its photo upright beside it, not in it)
      const att = B || P ? (c.dx < 0 ? 3 : 1) : c.dx > 0 ? 1 : c.dx < 0 ? 3 : 2, ax = att === 1 ? L + T.bw : att === 3 ? Rr - T.bw : 0;
      const rects = T.LN.map(([w, t, hh]) => [att === 1 ? ax : att === 3 ? ax - w : ax - w / 2, top - t, w, hh]);
      const circ = B ? [att === 3 ? Rr - B.d / 2 : L + B.d / 2, top - (T.h1 || T.h) / 2, B.d] : null; if (circ) rects.push([circ[0] - B.d / 2, circ[1] + B.d / 2, B.d, B.d]);
      const pho = P ? [att === 3 ? L : Rr - P.w, P.h / 2, P.w, P.h] : null; if (pho) rects.push(pho); // (its photo: [left, top, w, h])
      const u = c.u || [1, 0], W = (x, y) => [c.cx + u[0] * x - u[1] * y, c.cy + u[1] * x + u[0] * y];
      return { att, ax, top, rects, circ, pho, u, W };
    };
    const tidyPlace = () => {
      for (const b of tidyStd) b._k--; // (the Standard labels' places given back)
      scanTexts(); const { tx, txG, txR } = TX;
      const HARD = (t) => (t === 'road' ? 0 : 1), ROADX = (t) => (t === 'road' ? 1 : 0), LEADW = (t) => (t === 'road' ? 0 : t === 'cable' ? 0.01 : 1);
      const D8 = [[1, 1], [1, 0], [1, -1], [-1, 1], [-1, 0], [-1, -1], [0, 1], [0, -1]], D16 = [...Array(16)].map((_, k) => rotv([1, 0], k * 22.5));
      const tPoles = tidyTodo.map((T) => T.p), toCheck = [];
      const TIERS_B = [[1.0, 0], [0.5, 0], [1.0, 1], [0.5, 1], [0.15, 0], [0.15, 1], [0, 0], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]; // (beta 4.8: a pole's block: the clearance and across the cable only; the road comes first, see below; as many as TIERS)
      const TIERS = [[1.0, 0, 0], [0.5, 0, 0], [1.0, 0, 1], [0.5, 0, 1], [1.0, 1, 0], [0.5, 1, 0], [1.0, 1, 1], [0.5, 1, 1], [0.15, 0, 0], [0.15, 0, 1], [0.15, 1, 0], [0.15, 1, 1], [0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]]; // (clearance, across the cable, across a road edge line)
      const LBLW = (t) => (/^label|^street/.test(t || '') ? 1 : 0), COVW = (t, b) => (t === 'road' ? 0 : t === 'cable' || Math.min(b.hw, b.hh) <= 0.25 ? 0.35 : t === 'photo' ? 0.6 : 1), dBox = (q, b) => { const dx = q.dp[0] - b.cx, dy = q.dp[1] - b.cy; return Math.hypot(Math.max(Math.abs(dx * b.ux + dy * b.uy) - b.hw, 0), Math.max(Math.abs(dx * b.vx + dy * b.vy) - b.hh, 0)); }; // (COVW, where no place is free: across a line rather than over a photo, over a photo rather than a text or a symbol; dBox: how far a pole is from a box, level or turned)
      const wOf = (s, hh) => arialW(String(s).replace(/×/g, 'x'), hh) * 1.12 + hh * 0.1; // (× as wide as an x; a little wider than the estimate)
      // beta 4.8: the IDs, loop lengths and closure names: labels like the poles', round their symbol (its middle and half size), after the poles' (theirs have less room to give)
      const symT = tidySym.map((Y) => ({ p: { dp: Y.at, rp: Y.r, symBox: Y.box, ov: Y.ov, E: Y.at[0], N: Y.at[1] }, Y, h: TS.id, hs: TS.id, l1: Y.lines[0], sm: Y.lines.slice(1).map((s) => ({ s })) }));
      const ALL = [...tidyTodo, ...symT], sAnch = symT.map((T) => T.p);
      // beta 4.8: a pole's number (photos with their numbers, numbers only, or a pole with no photo) in its circle at the start of its
      // label, on the pole's side (as numbered below with the photos: the same order and numbers), the circle at most W across
      { const mIds = Array.isArray(job.marks) ? new Set(job.marks.map(String)) : null, mMode = job.markMode || (job.markNum ? 'num' : 'photo'), mPh = mMode === 'num' ? {} : job.photos || {};
        const mk = (p) => !!p && !p.onPole && (mIds ? mIds.has(String(p.id)) : p.el === 'Pole'), mOrd = [], seen = new Set(), take = (p) => { if (mk(p) && !seen.has(p)) { seen.add(p); mOrd.push(p); } };
        chains.slice().sort((x, y) => (y.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0) - (x.ids.some((id) => (byId.get(id) || {}).el === 'Site' || (byId.get(id) || {}).el === 'ODF') ? 1 : 0))
          .forEach((ch) => startOf(ch).forEach((id) => take(byId.get(id))));
        pts.forEach(take);
        const seqT = new Map(); mOrd.forEach((p, i) => { const g = job.seqOf && job.seqOf[String(p.id)]; seqT.set(p, g != null && g !== '' ? g : i + 1); });
        for (const T of tidyTodo) {
          const p = T.p, ph = seqT.has(p) ? mPh[p.id] || mPh[String(p.id)] : null; if (ph && ph.px > 0 && ph.py > 0) { T.photo = ph; tidyCard.add(p); } // (its photo at the end of its label, away from the pole)
          if (!seqT.has(p) || (mMode === 'photo' && ph)) continue;
          T.badge = { sq: String(seqT.get(p)), wl: streetW(p.dp) }; tidyBadged.add(p);
        } }
      // beta 4.8: each pole's block turned along the cable that serves it (the span towards the homing; a pole with no cable: along its
      // road), reading upright; vA: out from the road on the pole's side; e: from the pole to that road's edge; k: its sheet's scale
      for (const T of tidyTodo) {
        const p = T.p, Q = (nb.get(p) || []).filter((q) => q.A || q.dp), up0 = Q.length ? Q.slice().sort((a, b) => hd(a) - hd(b))[0] : null;
        let d0 = up0 ? unit(p.A || p.dp, up0.A || up0.dp) : p.near ? p.near.dir : p.fw || [1, 0]; if (!(Math.hypot(d0[0], d0[1]) > 0.5)) d0 = [1, 0];
        const ang = readable(deg(d0)), u = [Math.cos(ang * Math.PI / 180), Math.sin(ang * Math.PI / 180)], up = [-u[1], u[0]], away = p.td ? [-p.td[0], -p.td[1]] : p.on || up, sv = away[0] * up[0] + away[1] * up[1] >= 0 ? 1 : -1;
        const nr = R.roads.length ? nearestRoad(R.roads, p.dp, 20, u) : null, par = nr && nr.d > 0.05 && Math.abs(nr.dir[0] * u[0] + nr.dir[1] * u[1]) >= ALONG_COS; /* (the road the block runs along: its side and edge) */
        const sA = par ? (((p.dp[0] - nr.c[0]) * up[0] + (p.dp[1] - nr.c[1]) * up[1]) >= 0 ? 1 : -1) : sv;
        Object.assign(T, { u, ang, vA: [up[0] * sA, up[1] * sA], e: nr ? Math.max(0, par ? nr.edge : nearestRoad(R.roads, p.dp, 20).edge) : 0, k: kAt(p.dp[0], p.dp[1]) });
      }
      for (const T of symT) T.k = kAt(T.p.dp[0], T.p.dp[1]);
      const badgeSize = (T) => { const B = T.badge; if (!B) return; let hn = T.h, d = NS.d > 0 ? Math.max(B.sq.length * hn * CHW + hn * 0.6, 2.1 * hn) : B.sq.length * hn * CHW; if (B.wl > 0 && d > B.wl) { hn *= B.wl / d; d = B.wl; } B.hn = hn; B.d = d; }; // (the circle at most W across)
      const prep = (T) => { // each label's size and the places it may take (the same in every round below)
        badgeSize(T); const { p, h, hs } = T, kk = T.k || 1, L1 = T.forms ? T.forms[T.form].lines : [T.l1], W1 = Math.max(...L1.map((l) => wOf(l, h))), h1 = h + (L1.length - 1) * 1.45 * h, x = p.dp[0], y = p.dp[1], r0 = p.rp + 0.6 / kk, ov = p.ov || p.on || [1, 0]; T.h1 = h1; // (beta 6.2: the ID stacked: two lines, 1.45 of their height apart, as the smaller lines)
        for (const m of T.sm) { // the smaller lines: the attachments wrapped (at the spaces) where they would be much wider than the rest of the label
          const wMax = Math.max(W1, ...T.sm.filter((k) => !k.wrap).flatMap((k) => (k.ll || [k.s]).map((l) => wOf(l, hs)))) * 1.1; m.lines = m.ll ? m.ll.slice() : [m.s];
          if (m.wrap && wOf(m.s, hs) > wMax) { m.lines = []; for (const wd of m.s.split(/\s+/)) { const L = m.lines.length ? `${m.lines[m.lines.length - 1]} ${wd}` : wd; if (m.lines.length && wOf(L, hs) <= wMax) m.lines[m.lines.length - 1] = L; else m.lines.push(wd); } }
        }
        const W = Math.max(W1, ...T.sm.flatMap((m) => m.lines.map((l) => wOf(l, hs)))), Hb = h1 + 0.4 * h + T.sm.reduce((t, m) => t + m.lines.length * 1.45 * hs, 0) - 0.45 * hs; // (line 1; then each smaller line, 1.45 of its height apart)
        const LN = L1.map((l, i) => [wOf(l, h), i * 1.45 * h, h]); { let t = h1 - h + 1.4 * h; for (const m of T.sm) for (const l of m.lines) { LN.push([wOf(l, hs), t, hs]); t += 1.45 * hs; } } // (each line: its width, how far down from the top, its height)
        const B = T.badge, bw = B ? B.d + 0.5 : 0, ex0 = B ? Math.max(0, (B.d - h1) / 2 + 0.1) : 0; // (beta 4.8: the number's circle: a column on the pole's side, line 1 at its middle; beta 6.2: the stacked ID's two lines)
        const PH = T.photo ? (() => { const k = PHMM / ((printK || 0.62) * kk) / Math.max(T.photo.px, T.photo.py); return { w: T.photo.px * k, h: T.photo.py * k }; })() : null; // (beta 6.4: its long side as set, printed; was as tall as its texts, at most 1.4 street widths) // (beta 4.8: its photo as tall as its texts, at the far end)
        const PB = PH && !T.u, Wt = W + bw + (PB ? 0.8 + PH.w : 0), Ht = Math.max(Hb + ex0, B ? B.d + 0.2 : 0, PB ? PH.h : 0); // (beta 4.8: a block turned along its cable: its photo upright beside it, see fill)
        T.LN = LN; T.Wt = Wt; T.Ht = Ht; T.ex0 = ex0; T.bw = bw; T.PH = PH; T.Hc = Hb + ex0;
        const ang = (u) => Math.acos(Math.max(-1, Math.min(1, (u[0] * ov[0] + u[1] * ov[1]) / Math.hypot(u[0], u[1])))), byAng = (a, b) => ang(a) - ang(b), cands = [];
        if (T.u) { // beta 4.8: a pole's block turned along its cable, off the road: in the strip just past the road's edge on the pole's side, lined up along the street (beside the pole, or past it), then further out all round with its line
          /* beta 6.0: a block's place and its photo's (ph): beside the block, on its side away from the road (0 nearest the pole, 1 its middle, 2 its
             far end); a block further out with its line: its photo by the pole instead, on the side away from the road (0 straight out, 1 and 2 to
             either side; 3 to 5 a little further), else (6) beside the block, listed. See fill. */
          /* beta 6.4 (the owner, sheet 1D-2: the pole details next to the pole, the photo to the side): the block takes the place nearest its pole
             whatever its photo needs; at that place its photo tries beside the block, then by the pole (0 to 5), then a quarter smaller (phS), then
             beside the block though further (6, listed), else on its own near the pole (7: placed with the photos, see placePhotos); the photo's
             steps cost far less than one step of the block's place, so the photo never moves the block nor gives it a line */
          const phVar = (q, c0) => { cands.push({ cx: q[0], cy: q[1], u: T.u, ang: T.ang, cost: c0, ph: 0 }); if (PH) { [1, 2, 3, 4, 5].forEach((i) => cands.push({ cx: q[0], cy: q[1], u: T.u, ang: T.ang, cost: c0 + 0.01 * i, ph: i })); /* (beta 6.7: never a smaller photo: phS dropped) */ cands.push({ cx: q[0], cy: q[1], u: T.u, ang: T.ang, cost: c0 + 0.2, ph: 6 }, { cx: q[0], cy: q[1], u: T.u, ang: T.ang, cost: c0 + 0.3, ph: 7 }); } };
          const u = T.u, up = [-u[1], u[0]], vA = T.vA, gR = 0.6 / kk, sq = 1.1 * p.rp, eu = sq * (Math.abs(u[0]) + Math.abs(u[1])), ev = sq * (Math.abs(vA[0]) + Math.abs(vA[1])), x0s = Wt / 2 + eu + 0.5 / kk, at = (xc, yc) => [x + u[0] * xc + vA[0] * yc, y + u[1] * xc + vA[1] * yc];
          for (let r = 0; r < 6; r++) {
            const yc = -T.e + gR + Ht / 2 + r * (Ht + 1.2 / kk), clear = yc - Ht / 2 >= ev + 0.4 / kk, /* (eu, ev: its pole's symbol square across u and vA) */ xs = clear ? [[0, 0], [Wt / 4, 1], [-Wt / 4, 1.2], [Wt / 2, 2], [-Wt / 2, 2.2]] : [];
            [0, 1 / 3, 2 / 3, 1, 1.5].forEach((f, n) => { xs.push([x0s + f * Wt, n * 1.5], [-(x0s + f * Wt), n * 1.5 + 0.4]); });
            for (const [xc, cc] of xs) { const q = at(xc, yc); phVar(q, r * 9 + cc * 4); } // (beta 6.0: its photo always beside it on the side away from the road: nearest its pole, else the middle, else the far end; see fill)
          }
          [10, 16, 23, 31, 40].forEach((rr, ring) => D16.forEach((dv) => { const ext = Math.abs(dv[0] * u[0] + dv[1] * u[1]) * Wt / 2 + Math.abs(dv[0] * up[0] + dv[1] * up[1]) * Ht / 2, q = add2(p.dp, dv, rr / kk + ext), c0 = 60 + ring * 12 + (dv[0] * vA[0] + dv[1] * vA[1] < 0 ? 8 : 0); phVar(q, c0); }));
        } else
        [0, 1.25, 2.5, 3.75, 5, 6.5, 8].map((v) => v / kk).forEach((ex) => D8.slice().sort(byAng).forEach(([dx, dy], k) => { const r = r0 + ex, cx = dx && dy ? x + dx * (r * 0.72 + Wt / 2) : dx ? x + dx * (r + Wt / 2) : x, cy = dx && dy ? y + dy * (r * 0.72 + Ht / 2) : dy ? y + dy * (r + Ht / 2) : y;
          cands.push({ cx, cy, dx, cost: ex * 4.8 + k }); // (12 for each 2.5 m further out)
          if (!dx) [-1, 1].forEach((s) => cands.push({ cx: cx + s * Wt / 4, cy, dx, cost: ex * 4.8 + k + 0.5 })); else if (!dy) [-1, 1].forEach((s) => cands.push({ cx, cy: cy + s * Ht / 3, dx, cost: ex * 4.8 + k + 0.5 })); })); // (above or below it a little to one side; beside it a little higher or lower)
        if (!T.u) (T.far ? [6, 10, 15, 20, 26, 33, 41, 50, 60] : [6, 10, 15, 20, 26, 33, 41]).map((v) => v / kk).forEach((r, ring) => D16.slice().sort(byAng).forEach((u, k) => { /* (beta 4.8: 33 and 41 m: a long line rather than a label over another) */ const sx = Math.abs(u[0]) < 0.3 ? 0 : Math.sign(u[0]), sy = Math.abs(u[1]) < 0.3 ? 0 : Math.sign(u[1]);
          cands.push({ cx: x + u[0] * r + sx * Wt / 2, cy: y + u[1] * r + sy * Ht / 2, dx: sx, cost: 50 + ring * 12 + k * 0.5 }); }));
        // a reader takes a label for the pole nearest to it: no place nearer another pole than its own (the label, and its first line); an ID or loop length: no other symbol
        const nR = (T.far ? 95 : 75) + Wt + Ht, nbs = (T.Y ? sAnch : tPoles).filter((q) => q !== p && Math.abs(q.dp[0] - x) < nR && Math.abs(q.dp[1] - y) < nR); // (every pole a place up to 26 m out could be nearer to)
        cands.sort((u, v) => u.cost - v.cost); // (beta 4.8: in order of cost; what each place needs worked out when it is first looked at, see fill)
        Object.assign(T, { W1, W, Hb, cands, fill: (c) => { // its line to the pole, when the label is not right beside it
          if (c.tb) return c;
          const cu = c.u || [1, 0], xl = (x - c.cx) * cu[0] + (y - c.cy) * cu[1], yl = -(x - c.cx) * cu[1] + (y - c.cy) * cu[0]; // (the pole in the label's frame)
          if (c.dx === undefined) c.dx = xl < -0.3 ? 1 : xl > 0.3 ? -1 : 0; // (the side the pole is on: its number there)
          const G = tidyGeo(T, c); let qx = xl, qy = yl, dl = Infinity;
          for (const [x0, yt, w, hh] of G.rects) { const px = Math.min(Math.max(xl, x0), x0 + w), py = Math.min(Math.max(yl, yt - hh), yt), d = Math.hypot(px - xl, py - yl); if (d < dl) { dl = d; qx = px; qy = py; } } // (the nearest point of its lines, not of the box round them)
          if (dl > (T.u ? Math.max(r0, 1.56 * p.rp + 0.6 / kk) : r0) + (LEAD_OK ? 1.3 : 2.5) / kk) { /* (beta 6.0: with leader lines only as the last resort, a block up to 2.5 m (as printed at the template's grid, 1.5 mm) from its pole needs no line: it is beside it) */ const qw = G.W(qx, qy), u = [(qw[0] - x) / dl, (qw[1] - y) / dl], a = add2(p.dp, u, p.rp + 0.3 / kk), e = [qw[0] - u[0] * 0.4 / kk, qw[1] - u[1] * 0.4 / kk]; c.lead = [a, e]; c.lbox = Spots.box((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, dist2(a, e), 0.3 / kk, deg(u)); c.ebox = Spots.box(e[0], e[1], 2.2 / kk, 2.2 / kk, 0); } // (ebox: round its end, where no other label may be: the line would seem to lead to it)
          c.tb = Spots.box(c.cx, c.cy, Wt, Ht, c.ang || 0);
          if (T.u && T.PH) { // beta 4.8: its photo upright (square to the sheet), beside its block; beta 6.0 (the owner: "always on the side away from the road but must be near the pole"): see phVar
            const P2 = c.phS ? { w: T.PH.w * c.phS, h: T.PH.h * c.phS } : T.PH, up = [-cu[1], cu[0]], fe = xl < 0 ? 1 : -1, g = 0.4 / kk, eu = (Math.abs(cu[0]) * P2.w + Math.abs(cu[1]) * P2.h) / 2, ev = (Math.abs(up[0]) * P2.w + Math.abs(up[1]) * P2.h) / 2, sv = (T.vA[0] * up[0] + T.vA[1] * up[1]) >= 0 ? 1 : -1;
            const byBlock = (k) => { const mL = Math.max(0, Wt / 2 - eu), lx = k === 2 ? fe * mL : k === 1 ? 0 : Math.max(-mL, Math.min(mL, xl)), ly = sv * (Ht / 2 + g + ev); return Spots.box(c.cx + cu[0] * lx - cu[1] * ly, c.cy + cu[1] * lx + cu[0] * ly, P2.w, P2.h, 0); };
            const byPole = (k) => { const vA = T.vA, uA = T.u, sq = 1.1 * p.rp, eA = (Math.abs(vA[0]) * P2.w + Math.abs(vA[1]) * P2.h) / 2, eB = (Math.abs(uA[0]) * P2.w + Math.abs(uA[1]) * P2.h) / 2, j = k % 3, far = k >= 3 ? Math.min(P2.w, P2.h) * 0.6 : 0;
              const along = j === 0 ? 0 : (j === 1 ? 1 : -1) * (eB + sq * 0.5 + g), q = add2(add2(p.dp, vA, sq + g + eA + far), uA, along); return Spots.box(q[0], q[1], P2.w, P2.h, 0); }; // (by the pole, on the side away from the road: straight out or to either side; k 3 to 5 a little further)
            const ph = c.ph || 0;
            if (ph === 7) c.phOwn = true; /* (beta 6.4: on its own, near the pole: placed with the photos) */ else if (ph === 6) { c.pb = byBlock(0); c.phFar = dist2([c.pb.cx, c.pb.cy], p.dp) > NEAR_PH; if (c.phFar) c.lost = true; } /* (beta 6.7: far from the pole beside its block: no; on its own with its line (7) instead) */ // (no free place near the pole: beside its block, listed when far)
            else if (!c.lead && ph < 3) { c.pb = byBlock(ph); if (dist2([c.pb.cx, c.pb.cy], p.dp) > NEAR_PH) c.lost = true; } // (beside a block by its pole, when that is near the pole)
            else { c.pb = byPole(c.lead ? ph : ph - 3); c.phPole = true; } // (a block further out with its line, or a long block: the photo by the pole)
            if (c.pb && ((c.lbox && Spots.hit(c.pb, c.lbox)) || (c.ebox && Spots.hit(c.pb, c.ebox)) || Spots.hit(c.pb, c.tb))) c.lost = true; // (not over its block's line, nor its block)
          }
          const BX = c.pb ? [c.tb, c.pb] : [c.tb], hold = (E, N) => BX.every((b) => cellHolds({ ...b, hw: b.hw / 1.3 }, E, N));
          c.own = !!(T.u && p.symBox && BX.some((b) => Spots.hit(b, p.symBox)));
          c.lost = !!c.lost || BX.some((b) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, e2]) => { const qx = b.cx + b.ux * b.hw * a + b.vx * b.hh * e2, qy = b.cy + b.uy * b.hw * a + b.vy * b.hh * e2; return !used.has(key(ci(qx), cj(qy))); })); /* (beta 4.8: partly where no sheet is drawn: cut off) */ c.inC = hold(p.E, p.N); c.xc = 0;
          if (!c.inC && T.u && used.has(key(ci(c.cx), cj(c.cy))) && hold(c.cx, c.cy)) { c.inC = true; c.xc = 40; } // (beta 4.8: wholly on the sheet next to its pole's, rather than cut by the sheet's edge or over the road)
          c.onRoad = T.u && (R.idx.inside([c.cx, c.cy], -1, 0) || (c.pb && R.idx.inside([c.pb.cx, c.pb.cy], -1, 0))) ? 1 : 0; // (beta 4.8: a pole's block or its photo on the road itself)
          const r1 = G.rects[0], hm = G.W(r1[0] + r1[2] / 2, r1[1] - r1[3] / 2), hb = Spots.box(hm[0], hm[1], r1[2], r1[3], c.ang || 0);
          c.mine = [c.tb, hb, ...(c.pb ? [c.pb] : [])].every((b) => { const d0 = dBox(p, b) - 0.01; return nbs.every((q) => dBox(q, b) >= d0); });
          return c;
        } });
      };
      /* beta 6.0 (the owner: "Leader line is only used for worst case"): a label beside its pole or symbol, no line, wherever one is free; a
         place with its thin line only where every place beside it would cover something (Drawing style › Grid › Leader lines: Allowed:
         as before, the line where it costs less). */
      const chooseL = (T, loose) => { if (LEAD_OK) return choose0(T, loose, false); const d1 = choose0(T, loose, true); return d1 || choose0(T, loose, false); };
      const setForm = (T, f) => { if (T.form !== f) { T.form = f; prep(T); } };
      const choose = (T, loose) => { // beta 6.2: Pole ID Auto: stacked where it has a place beside its pole; else on one line where that has one; else stacked (with its line), on one line only where stacked finds no free place at all
        if (!T.pf) return chooseL(T, loose);
        const un = (d) => d.bx.forEach((b) => { b._k--; }), re = (d) => d.bx.forEach((b) => { b._k++; }), fm = (d) => { d.form = T.form; return d; };
        let a = null; setForm(T, 'stack');
        if (!LEAD_OK) { const d = choose0(T, loose, true); if (d) return fm(d); } else { a = choose0(T, loose, false); if (!a.nf && !a.best.lead) return fm(a); un(a); } // (leader lines allowed: a stacked block with its line only where one line has no place beside the pole either)
        setForm(T, 'line'); { const d = choose0(T, loose, true); if (d) return fm(d); }
        setForm(T, 'stack'); if (a) re(a); else a = choose0(T, loose, false); a.form = 'stack'; if (!a.nf) return a;
        un(a); setForm(T, 'line'); const b = choose0(T, loose, false); if (!b.nf) return fm(b);
        un(b); setForm(T, 'stack'); re(a); return a;
      };
      const choose0 = (T, loose, noLead) => { // one label's place, taken at once (its box and its line). loose: also a place nearer another pole, with its line to its own (noLead: only places with no line; null where none is free)
        const { p, Wt: W, Ht: Hb, cands } = T, memo = new Map(), ck = 1 / (T.k || 1); let best = null, nf = false;
        const blocked = (c, clr) => [Spots.box(c.cx, c.cy, W + 2 * clr * ck, Hb + 2 * clr * ck, c.ang || 0), ...(c.pb ? [Spots.box(c.pb.cx, c.pb.cy, 2 * c.pb.hw + 2 * clr * ck, 2 * c.pb.hh + 2 * clr * ck, 0)] : [])].some((b) => spots.hitsW(b, HARD) || tx.hits(b)); // (its box, and its photo's, with the clearance; beta 6.0: a sheet's name is see-through, a label may lie over it)
        if (p.symBox) p.symBox._k--; // (its own pole or symbol is not in the way)
        for (const strict of loose ? [true, false] : [true]) { for (const inCell of [true, false]) { for (const xr of T.Y ? [1] : [0, 1]) { for (const [clr, xCab, rd] of TIERS) { // (beta 4.8: not strict, the last try: a place nearer another pole, with its line to its own pole, rather than over another text) // (a line to the pole across the cable only where nothing nearer is free: the label would sit on the other side; a road edge line through the label only where no place is clear of it; beta 4.8: its line across a road edge line only where no other place is free (an ID's, a loop length's: its symbol is in the street))
          for (const c of cands) { // (beta 4.8: what each place covers is worked out once (memo), not again in every tier: the same in this choice; the places in order of cost: none further on can cost less than the best found)
            if (best && c.cost >= best.tot) break; T.fill(c);
            if ((strict ? !c.mine : !c.mine && !c.lead) || (inCell && !c.inC) || c.own || c.lost || (noLead && c.lead)) continue; /* (beta 4.8: a turned block not over its own pole) */
            let m = memo.get(c); if (!m) { m = { rx: spots.hitsW(c.tb, ROADX) + (c.pb ? spots.hitsW(c.pb, ROADX) : 0) + c.onRoad, lr: c.lbox ? spots.hitsW(c.lbox, ROADX) : 0 }; memo.set(c, m); }
            if ((!rd && m.rx) || (!xr && m.lr)) continue;
            const kk = clr; if (!(kk in m)) m[kk] = blocked(c, clr); if (m[kk]) continue;
            if (m.ln === undefined) { m.ln = c.lbox ? spots.hitsW(c.lbox, LEADW) : 0; m.lt = !!(c.lbox && (tx.hits(c.lbox) || tx.hits(c.ebox) || spots.hitsW(c.ebox, LBLW))); m.g = 0; /* (beta 6.0: a sheet's name is see-through: a label may lie over it) */ }
            if (m.ln >= 1 || (m.ln > 0 && !xCab) || m.lt) continue;
            const tot = c.cost + c.xc + 14 * m.rx + (m.ln > 0 ? 30 : 0) + m.g + (m.lr ? 25 : 0); // (a road edge line through the label: worse than a place one ring further out; beta 4.8: its line across a road edge line: worse than two rings further out)
            if (!best || tot < best.tot) best = { ...c, tot, clr, rx: m.rx };
          }
          break; /* (beta 4.8: the loops take the usual first level only (quick where it is free); the other levels in one pass below) */ } break; } break; } break; }
        if (!best) { // beta 4.8: the other levels in one pass (as the loops above would take them: the first level any place reaches, then the cheapest there)
          let bk = Infinity;
          for (const c of cands) { T.fill(c);
            const sL = c.mine ? 0 : loose && c.lead ? 1 : -1; if (sL < 0 || c.own || c.lost || (noLead && c.lead)) continue;
            let m = memo.get(c); if (!m) { m = { rx: spots.hitsW(c.tb, ROADX) + (c.pb ? spots.hitsW(c.pb, ROADX) : 0) + c.onRoad, lr: c.lbox ? spots.hitsW(c.lbox, ROADX) : 0 }; memo.set(c, m); }
            if (m.ln === undefined) { m.ln = c.lbox ? spots.hitsW(c.lbox, LEADW) : 0; m.lt = !!(c.lbox && (tx.hits(c.lbox) || tx.hits(c.ebox) || spots.hitsW(c.ebox, LBLW))); m.g = 0; /* (beta 6.0: a sheet's name is see-through: a label may lie over it) */ }
            if (m.ln >= 1 || m.lt) continue;
            // (beta 4.8: off the road before anything else (a pole's block: its line across a road edge line before the block over the road), then inside one sheet, then the clearance)
            const base = ((sL * 4 + (m.rx ? 2 : 0) + (m.lr && !T.Y ? 1 : 0)) * 2 + (c.inC ? 0 : 1)) * TIERS.length; if (base >= bk) continue; // (an ID's, a loop length's line crosses the road edge anyway: its symbol is in the street)
            let ti = -1; for (let i = 0; i < TIERS.length && base + i < bk; i++) { const [clr, xCab] = TIERS_B[i]; if (m.ln > 0 && !xCab) continue; if (!(clr in m)) m[clr] = blocked(c, clr); if (!m[clr]) { ti = i; break; } }
            if (ti < 0) continue;
            const key = base + ti, tot = c.cost + c.xc + 14 * m.rx + (m.ln > 0 ? 30 : 0) + m.g + (m.lr ? 25 : 0);
            if (key < bk || (key === bk && tot < best.tot)) { bk = key; best = { ...c, tot, clr: TIERS_B[ti][0], rx: m.rx }; }
          }
        }
        if (!best && noLead) { if (p.symBox) p.symBox._k++; return null; } // (beta 6.0: none free beside it: places with a line next)
        if (!best) { // no free place: the one nearest to its own pole that covers least, its line kept (across a line or a symbol rather than a text); listed in the README to check
          nf = true; best = cands.map(T.fill).map((c) => { const cov = spots.hitsW(c.tb, COVW) + tx.hits(c.tb) + (c.pb ? spots.hitsW(c.pb, COVW) + tx.hits(c.pb) : 0) + (c.own ? 1 : 0) + (c.lost ? 1 : 0), lt = c.lbox ? tx.hits(c.lbox) + spots.hitsW(c.lbox, LBLW) + (tx.hits(c.ebox) || spots.hitsW(c.ebox, LBLW) ? 0.5 : 0) : 0, /* (beta 4.8: its line over a label counts as a label over it) */ lh = c.lbox ? spots.hitsW(c.lbox, LEADW) : 0;
            const rx = spots.hitsW(c.tb, ROADX) + (c.pb ? spots.hitsW(c.pb, ROADX) : 0) + c.onRoad; return { ...c, cov, lt, lh, rx, tot: (c.mine ? 0 : 1e6) + (cov + lt) * 1000 + lh * 50 + (c.inC ? 0 : 300) + 14 * rx + c.cost }; }).sort((a, b) => a.tot - b.tot)[0];
        }
        if (p.symBox) p.symBox._k++;
        const n0 = spots.list.length; spots.add(Spots.box(best.cx, best.cy, W + 0.2 * ck, Hb + 0.2 * ck, best.ang || 0), 'label:tidy'); if (best.pb) spots.add(Spots.box(best.pb.cx, best.pb.cy, 2 * best.pb.hw + 0.2 * ck, 2 * best.pb.hh + 0.2 * ck, 0), 'photo'); const n1 = spots.list.length; if (best.lead) { spots.line(best.lead, 0.3); spots.list.slice(n1).forEach((b) => { b.tag = 'lead'; }); } // (beta 4.8: its line kept as a line: no other line crosses it)
        return { T, best, nf, bad: nf && (best.cov > 0.25 || best.lt > 0 || best.lh >= 1 || !best.mine), bx: spots.list.slice(n0) }; // (bx: the boxes it took)
      };
      // the labels in the order of the poles; where some found no free place, again with those first (the others have more room to give way)
      const nBad = (R0) => R0.filter((d) => d.bad).length;
      const run = (sz, upTo) => { // beta 4.8: one size set (TS: the first lines, IDs, loop lengths and numbers; the smaller lines), every label placed (null: more than upTo found no free place, given up)
        for (const T of symT) { T.h = sz.l1 / T.k; T.hs = T.h; } for (const T of tidyTodo) { T.h = sz.l1 / T.k; T.hs = sz.sm / T.k; } // (beta 4.8: on a finer grid, as much smaller)
        /* beta 6.4 (the owner, sheet 1D-2: "bring the pole details next to the pole", the photo to the side): every block first, without its
           photo, each at the place nearest its pole (an earlier pole's photo no longer takes it); then each photo at its block's place:
           beside the block or by the pole (smaller, or further, as phVar), on its own near the pole only where none of those is free */
        const PHS = ALL.filter((T) => T.photo); PHS.forEach((T) => { T.ph0 = T.photo; T.photo = null; });
        ALL.forEach(prep);
        const now = new Map(); let nb0 = 0;
        let i0 = 0; for (const T of ALL) { const d = choose(T); now.set(T, d); i0++; if (d.bad) { badT.add(T); if (++nb0 > upTo) { PHS.forEach((U) => { U.photo = U.ph0; }); return null; } } } // (given up as soon as clearly too many lack a free place; badT: beta 4.8, the cells to split further)
        for (const T of PHS) { T.photo = T.ph0; prep(T); const d0 = now.get(T), at = (c) => Math.abs(c.cx - d0.best.cx) < 1e-6 && Math.abs(c.cy - d0.best.cy) < 1e-6, all0 = T.cands; d0.bx.forEach((b) => { b._k--; });
          T.cands = all0.filter((c) => at(c) && c.ph !== 7); let d1 = T.cands.length ? choose0(T, false, false) : null;
          if (!d1 || d1.nf) { if (d1) d1.bx.forEach((b) => { b._k--; }); T.cands = all0.filter((c) => at(c) && c.ph === 7); d1 = T.cands.length ? choose0(T, false, false) : null; }
          T.cands = all0; if (d1 && !(d1.bad && !d0.bad)) { d1.form = d0.form; now.set(T, d1); } else { if (d1) d1.bx.forEach((b) => { b._k--; }); d0.bx.forEach((b) => { b._k++; }); d0.best = { ...d0.best, phOwn: true }; } } // (its photo then on its own near the pole)
        for (const T of ALL) { // where one found no free place: it and the labels round it once more, it first (the others have more room to give way); kept where fewer are left without room
          if (!now.get(T).bad) continue;
          const q = T.p.dp, grp = ALL.filter((U) => U === T || (Math.abs(U.p.dp[0] - q[0]) < 45 && Math.abs(U.p.dp[1] - q[1]) < 45)), old = grp.map((U) => now.get(U));
          old.forEach((d) => d.bx.forEach((b) => { b._k--; }));
          const neu = [T, ...grp.filter((U) => U !== T)].map(choose);
          if (nBad(neu) < nBad(old)) neu.forEach((d) => now.set(d.T, d)); else { neu.forEach((d) => d.bx.forEach((b) => { b._k--; })); old.forEach((d) => d.bx.forEach((b) => { b._k++; })); }
        }
        { let nRp = 0; const onR = (d) => (!d.bad && d.T.u && d.best.rx > 0 ? 1 : 0), nRd = (L) => L.reduce((t, d) => t + onR(d), 0);
          for (const T of ALL) { /* (beta 4.8: a pole's block over a road: it and the labels round it once more, it first; kept where fewer are over a road and none more without a place) */
            if (!onR(now.get(T)) || ++nRp > 60) continue;
            const q = T.p.dp, rr = 30 / (T.k || 1) + T.Wt, grp = ALL.filter((U) => U !== T && Math.abs(U.p.dp[0] - q[0]) < rr && Math.abs(U.p.dp[1] - q[1]) < rr), old = [T, ...grp].map((U) => now.get(U));
            old.forEach((d) => d.bx.forEach((b) => { b._k--; }));
            const neu = [T, ...grp].map((U) => choose(U));
            if (nBad(neu) <= nBad(old) && nRd(neu) < nRd(old)) neu.forEach((d) => now.set(d.T, d)); else { neu.forEach((d) => d.bx.forEach((b) => { b._k--; })); old.forEach((d) => d.bx.forEach((b) => { b._k++; })); }
          } }
        for (const T of ALL) { const d0 = now.get(T); if (!d0.bad) continue; d0.bx.forEach((b) => { b._k--; }); const d1 = choose(T, true); if (!d1.bad || (d1.best.cov || 0) + (d1.best.lt || 0) <= (d0.best.cov || 0) + (d0.best.lt || 0)) now.set(T, d1); else { d1.bx.forEach((b) => { b._k--; }); d0.bx.forEach((b) => { b._k++; }); } } // (beta 4.8: those still without a free place: further, nearer another pole, with their line, rather than over a text)
        return now;
      };
      // beta 4.8: the sizes as large as the room allows: the largest set of the ladder where (almost) every label has a free place, else the one leaving fewest without
      const LAD = TS.ladder, allow = 0, mark0 = spots.list.length, tried = [], badT = new Set(); let now = null, lastR = null; // (allow: labels with no free place a size set may leave; beta 4.8: none, 0 texts over texts)
      for (let li = 0; li < LAD.length && !now; li++) {
        const R0 = run(LAD[li], li < LAD.length - 1 ? Math.max(8, Math.round(0.02 * ALL.length)) : Infinity), nb = R0 ? nBad([...R0.values()]) : Infinity; tried.push(R0 ? nb : 'many');
        if (nb <= allow) { now = R0; TS.pick(LAD[li]); break; }
        if (li === LAD.length - 1) lastR = R0; else spots.truncate(mark0); // (the last set stays placed: taken below when it leaves fewest without a place)
      }
      if (!now) { const nums = tried.map((x) => (x === 'many' ? Infinity : x)), k = nums.every((x) => x === Infinity) ? LAD.length - 1 : nums.indexOf(Math.min(...nums)); /* (all given up: the smallest) */ if (k === LAD.length - 1 && lastR) now = lastR; else { spots.truncate(mark0); now = run(LAD[k], Infinity); } TS.pick(LAD[k]); }
      { // beta 4.8: how this grid does, for build: the labels with no free place at 1.8 / 1.3 mm (where the texts had to be made smaller: those that had none at that size), the pole blocks over a road
        let bad = 0, over = 0, phF = 0, lead = 0; const bySh = new Map(), phSh = new Map(); for (const [T, dd] of now) { if (dd.bad || dd.nf) bad++; else { if (!T.Y && dd.best.lead) lead++; /* (beta 6.0: a pole's block with its line) */ const k = cellName(ci(T.p.E), cj(T.p.N)); if (T.u && dd.best.rx > 0) { over++; bySh.set(k, (bySh.get(k) || 0) + 1); } if ((dd.best.phFar || dd.best.phOwn) && T.photo) { phF++; phSh.set(k, (phSh.get(k) || 0) + 1); } } } // (beta 6.0: and the photos with no place near their pole, by GEO sheet) // (nf: placed only where it covers a little; beta 6.0: the blocks over a road, by GEO sheet)
        if (TS.l1 < LAD[0].l1 - 1e-9) bad = Math.max(bad, badT.size, 1);
        const overMax = Math.max(0, ...bySh.values()), overX = [...bySh.values()].reduce((t, v) => t + Math.max(0, v - OVER_OK), 0) + [...phSh.values()].reduce((t, v) => t + Math.max(0, v - OVER_OK), 0); // (up to 2 of each on a sheet)
        rep._grid = { n: NU, cell: +cell.toFixed(1), sheets: N, bad, over, overMax, overX, overSheets: Object.fromEntries([...bySh].sort()), phFar: phF, phFarMax: Math.max(0, ...phSh.values()), lead: LEAD_OK ? 0 : lead, leadAll: lead }; }
      { const k0 = LAD.findIndex((z) => z.l1 === TS.l1 && z.sm === TS.sm), SMALL = [...LAD.slice(k0 + 1), { l1: Math.max(1.1, LAD[LAD.length - 1].l1 * 0.85), sm: Math.max(0.9, LAD[LAD.length - 1].sm * 0.85) }]; // (a label still with no free place: tried again a size or two smaller, alone; listed all the same)
        const nLeft = [...now.values()].filter((dd) => dd.bad).length;
        for (const T of ALL) { let d0 = now.get(T); if (!d0.bad) continue; T.far = nLeft <= 6; // (also 50 and 60 m out; first at its size without its photo (placed on its own near the pole, see the photos), then smaller with it, then smaller without it)
          const tries = [...(T.photo ? [[{ l1: T.h * T.k, sm: T.hs * T.k }, false]] : []), ...SMALL.flatMap((z) => (T.photo ? [[z, true], [z, false]] : [[z, true]]))];
          for (const [z, withPh] of tries) { d0.bx.forEach((b) => { b._k--; }); const h0 = T.h, hs0 = T.hs, ph0 = T.photo; T.h = z.l1 / T.k; T.hs = T.Y ? T.h : z.sm / T.k; if (!withPh) T.photo = null; prep(T); const d1 = choose(T, true);
            if (!d1.bad) { d1.nf = true; d1.smaller = T.h < h0 - 1e-9; if (ph0 && !T.photo) tidyCard.delete(T.p); now.set(T, d1); d0 = d1; break; }
            d1.bx.forEach((b) => { b._k--; }); T.h = h0; T.hs = hs0; T.photo = ph0; prep(T); d0.bx.forEach((b) => { b._k++; }); }
          if (!now.get(T).bad || nLeft > 6) continue; // (still none: the labels round it placed again after it, it the smallest and without its photo; kept where fewer are left without room)
          const q = T.p.dp, grp = ALL.filter((U) => U !== T && Math.abs(U.p.dp[0] - q[0]) < 45 && Math.abs(U.p.dp[1] - q[1]) < 45), old = [T, ...grp].map((U) => now.get(U)), z = SMALL[SMALL.length - 1], h0 = T.h, hs0 = T.hs, ph0 = T.photo;
          old.forEach((dd) => dd.bx.forEach((b) => { b._k--; })); T.h = z.l1 / T.k; T.hs = T.Y ? T.h : z.sm / T.k; T.photo = null; prep(T);
          const neu = [T, ...grp].map((U) => choose(U, true));
          if (nBad(neu) < nBad(old)) { neu[0].nf = true; neu[0].smaller = true; if (ph0) tidyCard.delete(T.p); neu.forEach((dd) => now.set(dd.T, dd)); }
          else { neu.forEach((dd) => dd.bx.forEach((b) => { b._k--; })); old.forEach((dd) => dd.bx.forEach((b) => { b._k++; })); T.h = h0; T.hs = hs0; T.photo = ph0; prep(T); } } }
      for (const [r, gk] of TS.guys) setFirst(r, 40, F(TS.sm / gk)); // (the guys' codes, written before: at the size taken)
      T7.sizes = { l1: +TS.l1.toFixed(2), sm: +TS.sm.toFixed(2), mm: [+(TS.l1 * TS.mm).toFixed(2), +(TS.sm * TS.mm).toFixed(2)], tried }; T7.grid = { n: NU, cell: +cell.toFixed(1) }; T7.sheets = N; // (beta 4.8: the grid (the template's cell / n), and the GEO sheets)
      const smaller = [], overRoad = [], phAway = [], withLine = [], phOwnL = [], phSmall = [];
      let gT = null, g0 = o.model.length; const gFlush = () => { if (gT) for (let k = g0; k < o.model.length; k++) tidyGrp.set(o.model[k], gT); g0 = o.model.length; }; // (beta 6.0: each label's records, see tidyGrp)
      for (const { T, best, nf, bad, smaller: sml, form } of ALL.map((U) => now.get(U))) { // written in the order of the poles
        gFlush(); gT = T; if (T.forms && form && T.form !== form) { T.form = form; prep(T); } // (beta 6.2: in the form its place was found for)
        if (T.forms) { const F = T7.idForm || (T7.idForm = { mode: PIDF, stacked: 0, oneLine: 0, oneLineForRoom: 0 }); if (T.form === 'stack') F.stacked++; else { F.oneLine++; if (T.pf) { F.oneLineForRoom++; (F.which || (F.which = [])).push(T.l1); } } }
        const { p, h, hs, W, W1, Hb, Y } = T; if (sml) smaller.push(T.l1);
        if (nf) { T7.notFree++; (T7.ids || (T7.ids = [])).push(Y ? Y.lines.join(' ') : String(p.poleId || p.id)); } if (bad) toCheck.push(T.l1);
        if (best.clr != null && best.clr < 1) T7.closer++;
        if (best.lead) { o.lwpoly(Y ? Y.layer : T.layer, best.lead, { color: 8 }); T7.leaders++; if (!LEAD_OK) withLine.push(T.l1); }
        if (!Y && best.rx > 0) overRoad.push(T.l1); // (beta 4.8: over a road: listed)
        if (!Y && T.photo && best.phOwn) { tidyCard.delete(p); phOwnL.push(T.l1); } else if (!Y && T.photo && best.pb && best.phS) phSmall.push(T.l1); // (beta 6.4: on its own near the pole, with the photos; a quarter smaller)
        if (!Y && T.photo && best.pb) { if (best.phFar) phAway.push(T.l1); else if (best.phPole) { T7.photosByPole = (T7.photosByPole || 0) + 1; if (best.lead) (T7.photoStays || (T7.photoStays = [])).push(String(p.poleId || p.id)); } } // (beta 6.0: photoStays: a block out with its line, its photo by the pole)
        const G = tidyGeo(T, best), att = G.att, ax = G.ax, an = best.ang || 0, dir = an ? G.u : null; // (top left, right or centre: the text reads away from its pole; beta 4.8: a pole's block turned along its cable)
        const lineBox = (w, top, hh) => { const q = G.W(att === 1 ? ax + w / 2 : att === 3 ? ax - w / 2 : ax, top - hh / 2); txR.add(Spots.box(q[0], q[1], w, hh, an)); }; // (its lines at their size: a loop's length or an ID under one slides off it below)
        let ty = G.top;
        if (Y) { // beta 4.8: an ID, a loop's length, a closure's name: its lines as texts (a closure: its block's attributes), top-aligned
          const P = [{ s: T.l1, x: G.W(ax, ty)[0], y: G.W(ax, ty)[1], h, ha: att - 1 }]; lineBox(W1, ty, h); ty -= 1.4 * h;
          for (const m of T.sm) for (const l of m.lines) { const q = G.W(ax, ty); P.push({ s: l, x: q[0], y: q[1], h: hs, ha: att - 1 }); lineBox(wOf(l, hs), ty, hs); ty -= 1.45 * hs; }
          if (Y.write) Y.write(P); else P.forEach((q) => tidyOwn.add(o.text(Y.layer, q.x, q.y, q.h, q.s, { ha: q.ha, va: 3, style: Y.style, color: Y.color })));
          T7.syms = (T7.syms || 0) + 1; continue;
        }
        if (T.photo && (G.pho || best.pb)) { // beta 4.8: its photo, in its frame (as the photos beside the points)
          const PL = (addLayer(d, S, 'G-ESAA POLE PHOTO', 7), 'G-ESAA POLE PHOTO');
          if (best.pb) { const b = best.pb, x0 = b.cx - b.hw, y0 = b.cy - b.hh, pw = 2 * b.hw, phh = 2 * b.hh; getImgs().image(o, PL, T.photo.file, T.photo.px, T.photo.py, x0, y0, pw, phh); o.lwpoly(PL, [[x0, y0], [x0 + pw, y0], [x0 + pw, y0 + phh], [x0, y0 + phh]], { closed: true, color: 8 }); } // (beta 4.8: upright, square to the sheet, beside its block)
          else { const [px0, pt, pw, phh] = G.pho, ll = G.W(px0, pt - phh); getImgs().image(o, PL, T.photo.file, T.photo.px, T.photo.py, ll[0], ll[1], pw, phh, an); o.lwpoly(PL, [G.W(px0, pt - phh), G.W(px0 + pw, pt - phh), G.W(px0 + pw, pt), G.W(px0, pt)], { closed: true, color: 8 }); }
          T7.photos = (T7.photos || 0) + 1;
        }
        if (T.badge && G.circ) { // beta 4.8: its number in its circle, as the numbers beside the points are drawn (light colours over a dark shadow)
          const B = T.badge, [ccx, ccy] = G.W(G.circ[0], G.circ[1]), dd = G.circ[2], rc = T.p.numCol != null && +T.p.numCol > 0, nCo = rc ? +T.p.numCol : NS.color || null, bCo = rc ? +T.p.numCol : NS.bcolor || NS.color || null, nL = lay('p-pole'), lc = (n) => { const Ly = S.layers.get(n); return Ly ? Math.abs(parseInt(get(Ly, 62, '7'), 10) || 7) : 7; }, lit = (c) => litCol(c), /* (beta 6.5: its RTA/JPA category's colour) */ sN = lit(nCo != null ? +nCo : lc(nL)), sB = lit(bCo != null ? +bCo : lc(nL)), so2 = B.hn * 0.08;
          if (sB && NS.d > 0) o.circle(nL, ccx + so2, ccy - so2, dd / 2, { color: 250 });
          if (sN) o.text(nL, ccx + so2, ccy - so2, B.hn, B.sq, { ha: 1, va: 2, style: 'arial', color: 250, rot: an });
          if (NS.d > 0) o.circle(nL, ccx, ccy, dd / 2, { color: bCo });
          o.text(nL, ccx, ccy, B.hn, B.sq, { ha: 1, va: 2, style: 'arial', color: nCo, rot: an }); txR.add(Spots.box(ccx, ccy, dd, dd, an)); T7.numbers = (T7.numbers || 0) + 1;
        }
        { const q = G.W(ax, ty), F1 = T.forms ? T.forms[T.form] : { lines: [T.l1], text: T.text }; o.mtext(T.layer, q[0], q[1], h, F1.text, { style: 'arial', att, color: T.color, ls: 0.87, dir }); F1.lines.forEach((l, i) => lineBox(wOf(l, h), ty - i * 1.45 * h, h)); ty -= (F1.lines.length - 1) * 1.45 * h; } T7.labels++; ty -= 1.4 * h; // (beta 6.2: the ID stacked or on one line)
        for (const m of T.sm) { const q = G.W(ax, ty); o.mtext(m.layer || clLay || T.layer, q[0], q[1], hs, m.mt || m.lines.map(mtextEsc).join('\\P'), { style: 'arial', att, color: m.color, ls: 0.87, dir }); m.lines.forEach((l, i) => lineBox(wOf(l, hs), ty - i * 1.45 * hs, hs)); ty -= m.lines.length * 1.45 * hs; } // (each smaller line its own text, on its own layer: the PDF draws it at its height)
      }
      gFlush();
      if (toCheck.length) rep.notes.push(`Tidy labels with no free place near their pole (they cover something: check them in CAD): ${toCheck.join(', ')}`);
      if (overRoad.length) rep.notes.push(`Tidy labels over a road (no other free place near their pole): ${overRoad.join(', ')}`); // beta 4.8
      if (withLine.length) rep.notes.push(`Tidy labels with a line to their pole or symbol (every place beside it would cover something): ${withLine.join(', ')}`); // beta 6.0
      if (phAway.length) { rep.notes.push(`Tidy photos away from their pole (no free place near it, beside their label): ${phAway.join(', ')}`); T7.photosAway = phAway.length; } // beta 6.0
      if (phSmall.length) { rep.notes.push(`Tidy photos drawn a quarter smaller (no free place near the pole at their size): ${phSmall.join(', ')}`); T7.photosSmaller = phSmall.length; } // beta 6.4
      if (phOwnL.length) { rep.notes.push(`Tidy photos placed on their own near the pole (no room beside the pole details): ${phOwnL.join(', ')}`); T7.photosOwn = phOwnL.length; } // beta 6.4
      T7.photoMm = PHMM; // beta 6.4
      if (smaller.length) rep.notes.push(`Tidy labels drawn smaller than the others (no free place at the plan's size): ${smaller.join(', ')}`); // beta 4.8
    };
    if (tidy) tidyPlace();
    // 5. span lengths: mid-span, on the road side of the cable (a span over the maximum in red). v2.42.23: the length only (no fibers'
    // tags, no runs); before it, each cable's own label beside its own line, and the length beyond them
    /** v2.42.24: each cable's own label (PROPOSED 24C FIG-8 (RUN 5), EXISTING 48C) beside its own line on the span, parallel to it, on
        its own layer (new in its cable's colour, existing blue): as large as fits without covering anything (another label, an ID, a
        symbol, a cable), smaller as needed down to a readable size; where none fits beside it, level in free space with a leader arrow
        to its own line (as the template's legend: a shoulder, then the arrow); only on a very short, crowded span smaller still beside
        it. One cable: on the pole side (the length on the road side); several: the half nearer the poles on the pole side, the others
        on the road side. The most crowded spans first. The span length the same way, beyond the labels. */
    let cbLay = null;
    const CL_TH = TIDY ? TS.span(wMed) : +job.cabH > 0 ? Math.min(3, Math.max(0.8, +job.cabH)) : Math.max(1.0, 1.3 * kG), CL_LH = CL_TH * 1.35, CL_CLR = 0.85, CL_MIN = TIDY ? CL_TH : Math.min(CL_TH, 0.8), CL_LAST = TIDY ? CL_TH : 0.5; // its height; label to label; from its line's middle; the readable size; the last resort
    const W_IN = (t) => (t === 'road' ? 0.5 : 1), realBox = (b, str, h) => ({ ...b, hw: Math.max(b.hw, arialW(str, h) * 0.56 + h * 0.15) }); // (realBox: as wide as AutoCAD draws it in Arial, capitals included) // beta 4.8: Tidy: a span length or a cable's label inside the street (over a road edge line only where nothing else is free)
    const W_LBL = (t) => (t === 'road' ? 0.2 : 1), W_LEAD = (t) => (t === 'road' ? 0.02 : t === 'cable' ? 0.3 : 1); // a label over a road edge line rather than anything else; a leader may cross a cable
    const sizesDn = (h0, hmin) => { const out = []; for (let h = h0; h > hmin + 1e-9; h *= 0.9) out.push(h); out.push(hmin); return out; };
    const segB = (p, q, w) => Spots.box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, dist2(p, q), w, deg([q[0] - p[0], q[1] - p[1]]));
    const laneInfo = new Map(), spanKeys = new Set(spans.map((s) => K2(s.ia, s.ib))), cabDone = new Set(), cabAt = []; // (the cable types given their own labels; where)
    FIB.forEach((f) => f.steps.forEach((st) => { if (st.gap) return; const k = K2(st.a, st.b); let li = laneInfo.get(k); if (!li) { li = { a: String(st.a), b: String(st.b), n: Math.max(1, st.n || 1), lanes: [] }; laneInfo.set(k, li); } li.lanes[st.k || 0] = { t: f.lbl || '', ex: !!f.ex, cab: f.cab || '', n: f.n }; }));
    const roadSgn = (P, Q, nl) => { const tw = [(P.td ? P.td[0] : 0) + (Q.td ? Q.td[0] : 0), (P.td ? P.td[1] : 0) + (Q.td ? Q.td[1] : 0)]; return (nl[0] * tw[0] + nl[1] * tw[1]) < -1e-6 ? -1 : 1; };
    const linesOf = (s, li) => { // the span's cable lines: [{ r: from the cable's line toward the road, t, ex, cab }]
      if (li && s && !li.lanes[0] && li.lanes.every((x) => !x || x.ex)) { const L2 = li.lanes.slice(); L2[0] = { t: (s.runLbls || [])[0] || '', ex: false, cab: s.cable || '' }; li = { ...li, lanes: L2 }; } // (only existing fibers: the span's own cable on lane 0)
      if (li) { const P0 = byId.get(li.a), Q0 = byId.get(li.b); if (!P0 || !Q0 || !P0.A || !Q0.A) return []; const t0 = unit(P0.A, Q0.A), sg = roadSgn(P0, Q0, [-t0[1], t0[0]]), n = li.n;
        return li.lanes.map((x, k) => (x ? { r: (sg * (k - (n - 1) / 2) + (n - 1) / 2) * LANE_G, ...x } : null)).filter(Boolean); }
      const P = byId.get(String(s.ia)), Q = byId.get(String(s.ib)), t = unit(P.A, Q.A), sg = roadSgn(P, Q, [-t[1], t[0]]), gap = 1.2 * kG, lb = s.runLbls || [];
      return [{ r: 0, t: lb[0] || '', ex: false, cab: s.cable || '' }, ...(s.more || []).map((cab, i) => ({ r: gap * (s.moreOff ? s.moreOff[i] : i + 1) * sg, t: lb[i + 1] || '', ex: !!(s.moreEx && s.moreEx[i]), cab }))];
    };
    const endPt = (p, toward) => blkEnd(inl.get(p), p.A, toward); // where the cable is drawn from: the pole's cable point, or the side of the block on the cable there
    const geoOf = (P, Q) => { const a = endPt(P, Q.A), b = endPt(Q, P.A); let t = unit(a, b), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const pth = FOLLOW ? spanPath.get(`${P.id}|${Q.id}`) : null; if (pth) { const Ls = pth.slice(1).map((q, i) => dist2(pth[i], q)), half = Ls.reduce((x, y) => x + y, 0) / 2; let acc = 0; for (let i = 0; i < Ls.length; i++) { if (acc + Ls[i] >= half) { const f = (half - acc) / (Ls[i] || 1); m = [pth[i][0] + (pth[i + 1][0] - pth[i][0]) * f, pth[i][1] + (pth[i + 1][1] - pth[i][1]) * f]; t = unit(pth[i], pth[i + 1]); break; } acc += Ls[i]; } } // (beta 6.1: a span following its road: its labels at the drawn line's middle, along it there)
      const nl = [-t[1], t[0]]; return { a, b, t, nl, sg: roadSgn(P, Q, nl), rd: readable(deg(t)), m, L: dist2(a, b) }; };
    const leaders = []; let nLeaders = 0, nSmall = 0;
    const cableLabels = (lines, P, Q, ok, S0) => { // (v2.42.25: ok: the lines to label now; S0: the span's state kept between calls) how far the labels beside the cable reach on each side, from the cable's line (toward the road +)
      const { t, nl, sg, rd, m, L } = geoOf(P, Q), kS = TIDY ? kAt(m[0], m[1]) : 1, CTH = CL_TH / kS, CMN = CL_MIN / kS, CLS = CL_LAST / kS; // (beta 4.8: Tidy: on a finer grid, as much smaller)
      const rr = lines.map((x) => x.r), rMin = rr.length ? Math.min(...rr) : 0, rMax = rr.length ? Math.max(...rr) : 0, ext = S0 ? S0.ext : { pole: rMin - 0.75, road: rMax + 0.75 };
      const ls = lines.filter((x) => x.t).sort((x, y) => x.r - y.r); if (!job.cabLabels || !ls.length || L < 4) return ext;
      if (!cbLay) { addLayer(d, S, 'G-ESAA CABLE LABEL', 7); cbLay = 'G-ESAA CABLE LABEL'; }
      const nP = ls.length === 1 ? (TIDY ? 0 : 1) : Math.floor(ls.length / 2), cnt = S0 ? S0.cnt : { '-1': 0, '1': 0 }; // (beta 4.8: Tidy: one cable's label on the road side, inside the street)
      for (const [side, arr] of [[-1, ls.slice(0, nP)], [1, ls.slice(nP).reverse()]]) arr.forEach((x) => {
        if (ok && !ok(x)) return; const j = cnt[side]; // (the labels already on that side of this span)
        const col = x.ex ? 5 : (CABLE_STYLE[x.cab] || CABLE_STYLE['']).color;
        const beside = (hs) => { for (const h of hs) { const w = arialW(x.t, h, false); if (w > 0.96 * L) continue; const fm = (L - w) / 2 / L; // along its line, never past the span's ends
          for (const e of [0, 0.6]) for (const f0 of [0, 0.12, -0.12, 0.25, -0.25, 0.38, -0.38]) { const f = Math.max(-fm, Math.min(fm, f0)), rc = (side < 0 ? ext.pole : ext.road) + side * ((j ? 0.35 * h : CL_CLR - 0.75) + h / 2 + e * h), q = add2(add2(m, t, f * L), nl, rc * sg), bx = TIDY ? realBox(textBox(q[0], q[1], h, x.t, rd, 1, 2), x.t, h) : textBox(q[0], q[1], h, x.t, rd, 1, 2);
            if (spots.hitsW(bx, TIDY ? W_IN : W_LBL) < 0.45) return { q, h, rc, bx }; } } return null; };
        const keep = (c) => { o.text(cbLay, c.q[0], c.q[1], c.h, x.t, { rot: rd, ha: 1, va: 2, style: 'arial', color: col }); spots.add([c.bx], 'label'); if (side < 0) ext.pole = Math.min(ext.pole, c.rc - c.h / 2); else ext.road = Math.max(ext.road, c.rc + c.h / 2); };
        let c = beside(sizesDn(CTH, CMN));
        if (!c) { // a leader: the label level, in free space, a shoulder and an arrow to a point on its own line
          let best = null; const sh = 2.2 * Math.max(0.6, kG);
          for (const h of [CTH, (CTH + CMN) / 2, CMN]) { const w = arialW(x.t, h, false);
            for (const f of [0, -0.2, 0.2, -0.33, 0.33]) { const tip = add2(add2(m, t, f * L), nl, x.r * sg);
              for (const dist of [6, 9, 12.5, 16]) for (const tilt of [0, 30, -30, 60, -60]) for (const sd of [side, -side]) {
                const u = rotv([nl[0] * sg * sd, nl[1] * sg * sd], tilt), kn = add2(tip, u, dist * Math.max(0.6, kG)), dir = kn[0] >= tip[0] ? 1 : -1, L0 = [kn[0] + dir * sh, kn[1]], tx = L0[0] + dir * (TIDY ? w * 0.56 + 0.6 : w / 2 + 0.4);
                const bx = TIDY ? realBox(textBox(tx, L0[1], h, x.t, 0, 1, 2), x.t, h) : textBox(tx, L0[1], h, x.t, 0, 1, 2), s1 = segB(tip, kn, 0.35), s2 = segB(kn, L0, 0.35);
                const cost = spots.hitsW(bx, W_LBL) * 10 + spots.hitsW(s1, W_LEAD) + spots.hitsW(s2, W_LEAD) + (cellHolds(bx, tip[0], tip[1]) ? 0 : 20) + (sd === side ? 0 : 0.3) + (h < CTH - 1e-9 ? 0.2 : 0);
                if (!best || cost < best.cost) best = { cost, tip, kn, L0, q: [tx, L0[1]], h, bx, segs: [s1, s2] }; if (best.cost < 1) break; } }
            if (best && best.cost < 1) break; }
          if (best && best.cost >= 1) c = beside(sizesDn(CMN * 0.9, CLS)); // smaller still beside it, before covering anything
          if (c) nSmall++;
          else if (best && (!TIDY || best.cost < 1)) { // the label, its leader (on the label's layer, thin) and the arrow (a solid) (beta 4.8: Tidy: only where it covers nothing; else the next span)
            o.text(cbLay, best.q[0], best.q[1], best.h, x.t, { ha: 1, va: 2, style: 'arial', color: col }); spots.add([best.bx], 'label'); spots.add(best.segs, 'leader');
            o.lwpoly(cbLay, [best.tip, best.kn, best.L0], { color: col, lwt: 18 }); const u = unit(best.kn, best.tip), aL = 1.4 * Math.max(0.6, kG), aW = 0.5 * Math.max(0.6, kG), base = add2(best.tip, u, -aL);
            o.solid(cbLay, [best.tip, add2(base, [-u[1], u[0]], aW), add2(base, [u[1], -u[0]], aW)], { color: col }); leaders.push(best); nLeaders++;
            cnt[side]++; if (S0) S0.last = best.q; if (!x.ex) { cabDone.add(x.cab || ''); cabAt.push([x.cab || '', best.q]); } return;
          }
        }
        if (c) { keep(c); cnt[side]++; if (S0) S0.last = c.q; if (!x.ex) { cabDone.add(x.cab || ''); cabAt.push([x.cab || '', c.q]); } }
      });
      return ext;
    };
    /* v2.42.25: one label for each cable in each grid (GEO sheet), on its longest span there where the label fits beside its line (well inside the grid first); a
       second only where the cable goes on 500 m or more (along it) inside that grid. Where the best span takes none (no room, no free
       place for a leader), the next best. Each span still has its length. */
    const spSt = new Map(), cands = [], ALG = new Map();
    FIB.forEach((f) => { const M = new Map(); let dd = 0; f.path.forEach((id, i) => { if (!i) return; const p = byId.get(String(id)), q = byId.get(String(f.path[i - 1])), l = p && q && p.A && q.A ? dist2(q.A, p.A) : 0; M.set(K2(f.path[i - 1], id), dd + l / 2); dd += l; }); if (f.lbl && f.n != null) ALG.set(`R${f.n}`, M); else if (f.lbl && !ALG.has(f.lbl)) ALG.set(f.lbl, M); }) // (v2.42.26: by its RUN: two cables with the same words keep their own); // (each span's middle, along its cable)
    const stFor = (key, lines) => { let st = spSt.get(key); if (!st) { const rr = lines.map((x) => x.r); st = { ext: { pole: (rr.length ? Math.min(...rr) : 0) - 0.75, road: (rr.length ? Math.max(...rr) : 0) + 0.75 }, cnt: { '-1': 0, '1': 0 }, last: null }; spSt.set(key, st); } return st; };
    const addC = (key, lines, P, Q, a, b) => { const st = stFor(key, lines), g = geoOf(P, Q);
      const ls = lines.filter((x) => x.t).sort((x, y) => x.r - y.r), nP = ls.length === 1 ? (TIDY ? 0 : 1) : Math.floor(ls.length / 2), ordOf = (x) => { const i = ls.indexOf(x); return i < nP ? i : ls.length - 1 - i; }; // (on one span, the order of before: the outermost line's label nearest the lines)
      lines.forEach((x) => { if (!x.t) return; const A = ALG.get(x.n != null ? `R${x.n}` : x.t), al = A && A.has(K2(a, b)) ? A.get(K2(a, b)) : null;
        const ci = Math.floor((g.m[0] - gox) / cell), cj = Math.floor((g.m[1] - goy) / cell), mg = Math.min(g.m[0] - gox - ci * cell, gox + (ci + 1) * cell - g.m[0], g.m[1] - goy - cj * cell, goy + (cj + 1) * cell - g.m[1]); // (its grid cell)
        cands.push({ lines, P, Q, x, st, a: String(a), b: String(b), ord: ordOf(x), L: g.L, m: g.m, al, cell: `${ci},${cj}`, mg: Math.floor(Math.min(60, mg) / 20), fit: arialW(x.t, CL_TH, false) <= 0.96 * g.L ? 1 : 0 }); }); }; /* (mg: well inside its grid first, away from the sheet's edge) */
    for (const s of spans) { const P = byId.get(String(s.ia)), Q = byId.get(String(s.ib)); if (!P || !Q || !P.A || !Q.A) continue; const key = K2(s.ia, s.ib); addC(key, linesOf(s, laneInfo.get(key)), P, Q, s.ia, s.ib); }
    for (const [k, li] of laneInfo) { if (spanKeys.has(k)) continue; const P = byId.get(li.a), Q = byId.get(li.b); if (P && Q && P.A && Q.A) addC(k, linesOf(null, li), P, Q, li.a, li.b); } // (v2.42.20: existing cables off the new route)
    if (job.cabLabels) {
      const PER = [1, 2, 3].includes(+job.cabPer) ? +job.cabPer : 3, got = new Map(); cands.sort((u, v) => (v.fit - u.fit) || (v.mg - u.mg) || (v.L - u.L) || (u.ord - v.ord));
      const pa = new Map(), fd = (k) => { let r = k; while (pa.has(r)) r = pa.get(r); return r; }; // (a line on no cable: each stretch of spans with that label counts as one cable)
      cands.forEach((c) => { if (c.x.n != null || ALG.has(c.x.t)) return; const x = fd(`${c.x.t}@${c.a}`), y = fd(`${c.x.t}@${c.b}`); if (x !== y) pa.set(x, y); });
      for (const c of cands) {
        const gk = `${c.x.n != null ? `R${c.x.n}` : ALG.has(c.x.t) ? c.x.t : `${c.x.t}#${fd(`${c.x.t}@${c.a}`)}`}|${c.cell}`, G = got.get(gk) || []; if (G.length >= PER) continue; // (v2.42.26: as chosen, 3 by default)
        if (G.some((f0) => (f0.al != null && c.al != null ? Math.abs(c.al - f0.al) : dist2(f0.m, c.m)) < 500)) continue; // (each 500 m or more along the cable from the others)
        c.st.last = null; cableLabels(c.lines, c.P, c.Q, (x) => x === c.x, c.st);
        if (c.st.last) { G.push({ al: c.al, m: c.m }); got.set(gk, G); }
      }
    }
    /* beta 6.6 (the owner: "under drawing style, let the user decide, off by default"): Drawing style › Loops at boxes and ODF entrances
       › Written: each loop the PMI counts at a handhole, manhole, service box or an ODF / site / ODC entrance (pts[].boxLoop, from the
       app) written beside its point ("20m LOOP"), where it covers nothing near it, inside the point's sheet; the written numbers then add
       up to the tables. Off (none given): not written, counted all the same. */
    { const BLp = pts.filter((p) => +p.boxLoop > 0 && Number.isFinite(+p.E) && Number.isFinite(+p.N)); let nBL = 0;
      for (const p of BLp) {
        const at = p.A || [p.E, p.N], txt = `${+(+p.boxLoop).toFixed(1)}m LOOP`, th = TIDY ? TS.id / kAt(at[0], at[1]) : IDS.h, w = arialW(txt, th) * 1.1, r0 = (TIDY ? 4 / kAt(at[0], at[1]) : 5) + th; let best = null;
        for (const rr of [1, 1.5, 2.2, 3, 4]) { for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, ux = Math.cos(a), uy = Math.sin(a), q = [at[0] + ux * (r0 * rr + Math.abs(ux) * w / 2), at[1] + uy * (r0 * rr + Math.abs(uy) * th * 0.65)], bx = Spots.box(q[0], q[1], w + th * 0.3, th * 1.3, 0);
            if (TIDY && !cellHolds(bx, p.E, p.N)) continue; const n = spots.hitsW(bx, W_IN) + rr * 0.001; if (!best || n < best.n) best = { q, bx, n }; if (n < 0.45) break; }
          if (best && best.n < 0.45) break; }
        if (!best) continue; o.text(lay('PROPOSED LOOP'), best.q[0], best.q[1], th, txt, { ha: 1, va: 2, style: 'arial' }); spots.add([best.bx]); nBL++;
      }
      if (BLp.length) rep.boxLoops = { written: nBL, of: BLp.length }; }
    const tight = (s) => { const P = byId.get(String(s.ia)), Q = byId.get(String(s.ib)); if (!P || !Q || !P.A || !Q.A) return 0; const ls = linesOf(s, laneInfo.get(K2(s.ia, s.ib))).filter((x) => x.t); return ls.reduce((t, x) => t + arialW(x.t, CL_TH, false), 0) / Math.max(4, geoOf(P, Q).L); };
    for (const s of spans.slice().sort((x, y) => tight(y) - tight(x))) { // the most crowded spans first
      const P = byId.get(String(s.ia)), Q = byId.get(String(s.ib)); if (!P || !Q || !P.A || !Q.A) continue;
      const { t, nl, sg: sgn, rd, m, L } = geoOf(P, Q);
      const ext = TIDY ? (() => { const rr = linesOf(s, laneInfo.get(K2(s.ia, s.ib))).map((x) => x.r); return { pole: (rr.length ? Math.min(...rr) : 0) - 0.75, road: (rr.length ? Math.max(...rr) : 0) + 0.75 }; })() : stFor(K2(s.ia, s.ib), linesOf(s, laneInfo.get(K2(s.ia, s.ib)))).ext; // (v2.42.25: the labels are placed above; the length beyond them. beta 4.8: Tidy: beside the cable, elsewhere along the span than its label)
      const txt = `${Math.round(s.len)}m${s.long ? ` (OVER ${job.maxSpan || 200}m)` : ''}`; // v2.39: whole metres, as the company's plans (v2.42.23: the length only)
      // v2.34: one size and style for every span length of the drawing, along the cable, where it covers nothing (v2.42.24: smaller as needed)
      const SST = job.spanStyle || {}, th0 = TIDY ? TS.span(streetW(m), kAt(m[0], m[1])) : +SST.h > 0 ? +SST.h : Math.max(1.4, 2.0 * kG); let c = null, best = null; // (beta 4.3: the height of the drawing style; none set: as before)
      /* beta 6.4 (the owner: "span length on the dxf is shown but pdf do not have"): Tidy: a span's length is written inside the GEO sheet
         that holds the middle of its span (its own sheet, whose BOQ counts it), clear of the sheet's edge: a length across a sheet line was
         cut in two on both sheets' pages, and one beside a pole just over the line stood on the neighbour's page, away from most of its
         span. In another sheet only where its own has no free place, and never across a sheet line. */
      const ownC = TIDY ? (() => { for (const q of [m, P.A, Q.A]) { const k = key(ci(q[0]), cj(q[1])); if (used.has(k)) return [ci(q[0]), cj(q[1])]; } return [ci(m[0]), cj(m[1])]; })() : null;
      const inCellB = (bx, i, j, mg) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b2]) => { const x = bx.cx + bx.ux * bx.hw * a + bx.vx * bx.hh * b2, y = bx.cy + bx.uy * bx.hw * a + bx.vy * bx.hh * b2; return x >= gox + i * cell + mg && x <= gox + (i + 1) * cell - mg && y >= goy + j * cell + mg && y <= goy + (j + 1) * cell - mg; });
      const sheetW = (bx, th) => { if (!ownC) return 0; const mg = th * 0.4; if (inCellB(bx, ownC[0], ownC[1], mg)) return 0; const i = ci(bx.cx), j = cj(bx.cy); return used.has(key(i, j)) && inCellB(bx, i, j, mg) ? 0.5 : 50; }; // (another sheet: never "free"; across a sheet line: the last resort)
      for (const es of [[0, 1.0, 2.0], [3.2, 4.6, 6.5], ...(crowdAt(P) || crowdAt(Q) ? [[8.5, 11, 14]] : [])]) { /* (v2.42.25: further out where none near the cable is free: a span with no label of its own no longer pushes it out; 2.44.12: at a crowded pole, further still) */
        for (const th of sizesDn(th0, Math.min(th0, TIDY ? th0 : 1.0))) { for (const e of es) for (const [f, side] of [[0, 1], [0, -1], [0.2, 1], [-0.2, 1], [0.2, -1], [-0.2, -1], [0.35, 1], [-0.35, 1], [0.35, -1], [-0.35, -1]]) {
            const rc = side > 0 ? ext.road + 0.6 + th / 2 + e : ext.pole - 0.6 - th / 2 - e, q = add2(add2(m, t, f * L), nl, rc * sgn), bx = (crowdAt(P) || crowdAt(Q) ? textBoxA : textBox)(q[0], q[1], th, txt, rd, 1, 2), n = spots.hitsW(bx, TIDY ? W_IN : W_LBL) + (e > 2 ? 0.01 : 0) + sheetW(bx, th);
            if (!best || n < best.n) best = { q, th, bx, n }; if (n < 0.45) { c = best; break; } }
          if (c) break; }
        if (c) break; }
      c = c || best; if (ownC) { const w = sheetW(c.bx, c.th), SL = rep.spanLabels || (rep.spanLabels = { ownSheet: 0, otherSheet: 0, acrossLine: 0 }); SL[w === 0 ? 'ownSheet' : w < 1 ? 'otherSheet' : 'acrossLine']++; } // (beta 6.4)
      o.text(lay('Distance Data'), c.q[0], c.q[1], c.th, txt, { rot: rd, ha: 1, va: 2, style: 'arial', color: s.long ? 1 : +SST.color || null }); spots.add([c.bx]); spanLblAt.set(K2(s.ia, s.ib), c.q);
    }
    // v2.42.11: each tower, its name beside the tower where it covers nothing (the cable, the road lines, the poles, their labels,
    // the span lengths), inside the tower's GEO sheet. v2.42.13: its box as wide as AutoCAD draws it (Arial bold at the attribute's
    // width factor; it was narrower, so a name was put over the cable and the road), more places round the tower (beside it at every
    // height, above and below it ending at its middle or its sides, further out), and smaller where none is free (3, 2.4, 2, 1.6 m);
    // the place covering least only when no size has a free one
    const SITE_W = (t) => (t === 'road' ? 0.5 : t === 'cable' ? 3 : 4);
    const attW = (bn, tag) => { const b = S.blocks.get(bn), df = b && b.ents.find((e) => typ(e) === 'ATTDEF' && get(e, 2) === tag); const w = df ? parseFloat(get(df, 41, '1')) : 1; return Number.isFinite(w) && w > 0 ? w : 1; };
    const inCellBox = (b, E, N) => { // the box's corners inside the GEO cell of the point (2 m in)
      const ci = Math.floor((E - gox) / cell), cj = Math.floor((N - goy) / cell), W = [gox + ci * cell + 2, goy + cj * cell + 2, gox + (ci + 1) * cell - 2, goy + (cj + 1) * cell - 2];
      return [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, c]) => { const x = b.cx + b.ux * b.hw * a + b.vx * b.hh * c, y = b.cy + b.uy * b.hw * a + b.vy * b.hh * c; return x >= W[0] && x <= W[2] && y >= W[1] && y <= W[3]; });
    };
    for (const { p: p0, bn } of siteLate) {
      const W0 = tw(p0), K = W0.k, p = { ...p0, E: W0.ax, N: W0.ay }; // beta 3.7: the tower where it is drawn (its name round it)
      const nm = String(p.siteName || p.poleId || ''), pla = String(p.plaId || ''); let attrs = /** @type {any} */ ({ BTS_NAME: '', PLA_ID: '' }), onTower = null;
      if (nm && job.siteName === 'on') { // beta 3.8: on the tower's lower body, on a mask (the drawing's background in CAD, white on the PDF), as wide as the tower allows; the block's attributes keep them, hidden
        const nb = towerNameBox(p0, W0), { h, hp, two, cy, yN, yP } = nb, col = pinColor(p), op = { style: 'arial', att: 5, canvas: 1.25, ...(col != null ? { color: col } : {}) };
        onTower = () => { o.mtext(lay('X-BTS'), p.E, yN, h, `{\\fArial|b1|i0|c0|p34;${mtextEsc(nm)}}`, op); if (two) o.mtext(lay('X-BTS'), p.E, yP, hp, mtextEsc(pla), op); }; // (drawn after the tower: its mask hides the tower's lines under it)
        spots.add(Spots.box((nb.box[0] + nb.box[2]) / 2, (nb.box[1] + nb.box[3]) / 2, nb.box[2] - nb.box[0], nb.box[3] - nb.box[1], 0), 'label:site');
        attrs = { BTS_NAME: { v: nm, x: p.E, y: yN, h, ha: 1, va: 2, hidden: true }, PLA_ID: { v: pla, x: p.E, y: yP, h: hp, ha: 1, va: 2, hidden: true } };
        nInCell++; (rep.siteOnTower = rep.siteOnTower || []).push({ id: String(p0.id), h: +h.toFixed(2), at: [+p.E.toFixed(2), +cy.toFixed(2)] });
      } else if (nm) {
        const wfN = attW(bn, 'BTS_NAME'), wfP = attW(bn, 'PLA_ID'), two = !!pla, bySize = [];
        const boxAt = (x, y, w, h, ha) => Spots.box(x + (ha === 0 ? w / 2 : ha === 2 ? -w / 2 : 0), y, w, h, 0);
        for (const h of [3.0, 2.4, 2.0, 1.6].map((v) => v / NU)) { // (beta 4.8: Tidy: on a finer grid, the name and its room as much smaller)
          const wN = arialW(nm, h, true) * wfN + h * 0.5, hp = h * 0.8, wP = two ? arialW(pla, hp, false) * wfP + hp * 0.5 : 0, sub = h * 1.6, g = h * 0.4 + 0.6 / NU;
          const tallUp = h * 0.65 + 0.3 / NU, tallDn = two ? sub + hp * 0.65 + 0.3 / NU : tallUp; // the name's middle to the top of its box, to the bottom of the PLA ID
          const at = []; // [x, y, ha] of the name's middle-left / -centre / -right; nearest first
          const X = 12.4 * K, Y = 48 * K; // (beta 3.7: the tower at its size)
          for (const dy of [30, 22, 38, 14, 44, 6]) { at.push([-X - g, dy * K, 2]); at.push([X + g, dy * K, 0]); }
          for (const [x, ha] of [[0, 1], [X, 2], [-X, 0], [3 / NU, 2], [-3 / NU, 0]]) { at.push([x, Y + g + tallDn, ha]); at.push([x, -g - tallUp, ha]); }
          for (const dx of [6, 12, 20].map((v) => v / NU)) for (const dy of [30, 14, 44, 2]) { at.push([-X - g - dx, dy * K, 2]); at.push([X + g + dx, dy * K, 0]); }
          // v2.42.26: the place chosen in Drawing style (top: above the tower; bottom: below it, below its ODF too; side: beside it), the side
          //           away from the tower's ODF first; Auto as before (beside, then above or below)
          const oSide = [...odfMoved.values()].filter((m) => m.T === p0).map((m) => m.side), fam = ([, dy]) => (dy > Y - 2 ? 'top' : dy < 0 ? 'bottom' : 'side');
          for (const ex of [5, 10].map((v) => v / NU)) for (const [x, ha] of [[0, 1], [X, 2], [-X, 0]]) { at.push([x, Y + g + tallDn + ex, ha]); at.push([x, -g - tallUp - ex - (oSide.includes('below') ? 8 / NU : 0), ha]); }
          if (oSide.includes('below')) for (const [x, ha] of [[0, 1], [X, 2], [-X, 0]]) at.push([x, -g - tallUp - 9 / NU, ha]);
          const SN = ['top', 'side', 'bottom'].includes(job.siteName) ? job.siteName : 'auto', away = (a) => (oSide.includes('left') ? (a[0] < 0 ? 1 : 0) : oSide.includes('right') ? (a[0] > 0 ? 1 : 0) : 0);
          const at2 = SN === 'auto' ? at.slice() : at.filter((a) => fam(a) === SN), sIdx = at2.map((a, i) => (fam(a) === 'side' ? i : -1)).filter((i) => i >= 0), sides = sIdx.map((i) => at2[i]).map((a, i) => [a, i]).sort((x, y) => away(x[0]) - away(y[0]) || x[1] - y[1]).map((x) => x[0]);
          sIdx.forEach((i, k) => { at2[i] = sides[k]; }); // (the side slots away from the ODF first; the others keep their places)
          at.length = 0; at.push(...at2);
          const cs = at.map(([dx, dy, ha], k) => {
            const q = [p.E + dx, p.N + dy], boxes = [boxAt(q[0], q[1], wN, h * 1.3, ha)]; if (two) boxes.push(boxAt(q[0], q[1] - sub, wP, hp * 1.3, ha));
            return { q, h, ha, sub, cost: k, boxes };
          }), csIn = cs.filter((c) => c.boxes.every((b) => inCellBox(b, p.E, p.N)));
          bySize.push(csIn.length || SN === 'auto' ? csIn : cs); // (v2.42.26: Top, Side or Bottom chosen: there, even past the sheet's edge)
        }
        let c = null;
        for (const cs of bySize) { c = cs.find((x) => x.boxes.reduce((t, b) => t + spots.hitsW(b, SITE_W), 0) === 0); if (c) break; } // the largest size with a free place
        if (!c) { const all = bySize.flat(); if (all.length) c = pickC(spots, all.map((x) => ({ ...x, cost: x.cost + (3 - x.h * NU) * 40 })), SITE_W); } // none free: the place covering least (bigger first)
        if (!c) { const h = 2.0 / NU, q = [p.E - 12.4 * K - 1.4 / NU, p.N + 30 * K]; c = { q, h, ha: 2, sub: h * 1.6, boxes: [boxAt(q[0], q[1], arialW(nm, h, true) * wfN, h * 1.3, 2)] }; } // (no place inside the sheet: at its left)
        else nInCell++;
        spots.add(c.boxes, 'label:site');
        attrs = { BTS_NAME: { v: nm, x: c.q[0], y: c.q[1], h: c.h, ha: c.ha, va: 2 }, PLA_ID: { v: pla, x: c.q[0], y: c.q[1] - c.sub, h: c.h * 0.8, ha: c.ha, va: 2 } };
      }
      o.insert(lay('X-BTS'), bn, p.E, p.N, { scale: 2.4 * K, attrs, attrColor: pinColor(p) }); if (onTower) onTower(); // (beta 3.8: the name on it, after it)
      if (W0.moved) { // beta 3.7: a thin line from the site's point to its tower, and a small mark at the point (in the tower's colour)
        const col = pinColor(p0) != null ? pinColor(p0) : (p0.status === 'Proposed' || p0.status === 'New') ? 1 : 5, AG = arrowOf.get(p0);
        if (AG) { const ac = job.towerArrowColor === 0 ? col : Number.isInteger(job.towerArrowColor) && job.towerArrowColor > 0 && (job.towerArrowColor < 256 || job.towerArrowColor >= TC0) ? job.towerArrowColor : 7; // beta 3.8: the curved arrow, filled (7: white in CAD, black on the PDF)
          AG.quads.forEach((q) => o.solid(lay('X-BTS'), q, { color: ac })); o.solid(lay('X-BTS'), AG.head, { color: ac }); (rep.towerArrows = rep.towerArrows || []).push({ id: String(p0.id), color: ac, pieces: AG.quads.length + 1, from: AG.from.map((v) => +v.toFixed(2)) }); }
        else o.lwpoly(lay('X-BTS'), towerLead(p0, W0), { color: 8 });
        o.circle(lay('X-BTS'), p0.E, p0.N, 0.9, { color: col });
      }
    }
    // v2.42.26: each ODF, its label beside it (outside the tower) where it covers nothing: its ID, with its size (job.odfLbl 'size', the
    //           default) and connector ('conn'); 'id': the ID only
    for (const { p, isNew } of odfLate) {
      const mv = odfMoved.get(p), id = String(p.poleId || ''), sz = job.odfLbl === 'id' ? '' : [p.odfSz ? `${p.odfSz} ODF` : '', job.odfLbl === 'conn' ? p.odfConn || '' : ''].filter(Boolean).join(' ');
      const th = Math.min(2.4, Math.max(1.4, IDS.h * 0.8)), r = 5.6, out = mv ? (mv.side === 'left' ? -1 : mv.side === 'right' ? 1 : 0) : 0, cand = [];
      const add = (x, y, ha, cost) => { const boxes = [textBox(x, y, th, id || ' ', 0, ha, 2)]; if (sz) boxes.push(textBox(x, y - th * 1.5, th, sz, 0, ha, 2)); cand.push({ q: [x, y], ha, boxes, cost }); };
      if (out) add(p.E + out * (r + 0.8), p.N + (sz ? th * 0.75 : 0), out > 0 ? 0 : 2, 0);
      add(p.E, p.N - r - 0.8 - th * 0.6, 1, 1); add(p.E, p.N + r + 0.8 + (sz ? th * 2.1 : th * 0.6), 1, 2); add(p.E + (out || 1) * -1 * (r + 0.8), p.N + (sz ? th * 0.75 : 0), (out || 1) < 0 ? 0 : 2, 3);
      for (const dd of [4, 8]) { add(p.E, p.N - r - 0.8 - th * 0.6 - dd, 1, 4 + dd); if (out) add(p.E + out * (r + 0.8 + dd), p.N + (sz ? th * 0.75 : 0), out > 0 ? 0 : 2, 4 + dd); }
      const c = id || sz ? pickC(spots, cand, SITE_W) : null; if (c) spots.add(c.boxes, 'label:odf');
      const attrs = c ? { HST_NAM: { v: id, x: c.q[0], y: c.q[1], h: th, ha: c.ha, va: 2 }, HST_COD: { v: sz, x: c.q[0], y: c.q[1] - th * 1.5, h: th, ha: c.ha, va: 2 }, HST_LET: 'H' } : { HST_NAM: id, HST_COD: '', HST_LET: 'H' };
      o.insert(isNew ? lay('P-HOST') : lay('X-HOST'), isNew ? 'P-HOST' : 'X-HOST', p.E, p.N, { scale: 0.28, attrs, attrColor: pinColor(p) });
      if (job.debug) (rep.odfLabels = rep.odfLabels || []).push({ id, sz, at: c ? c.q : null, boxes: c ? c.boxes.map((b) => [b.cx, b.cy, b.hw, b.hh]) : [] });
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
    markOrder.forEach((p, i) => { const g = job.seqOf && job.seqOf[String(p.id)]; p.seq = g != null && g !== '' ? g : i + 1; }); // v2.42.18: the app's pole numbers (as in its CSV)
    const rOf = (p) => (p.el === 'Pole' ? p.rp : inl.has(p) ? Math.max(inl.get(p).hl, inl.get(p).hh) : p.el === 'Site' ? 8 : 4);
    const anchors = [...new Set([...poleOrder, ...markOrder])]; // a photo nearer its own point than any pole or other marked point
    // v2.41: job.markMode 'photo' (a point without a photo shows its number), 'num' (numbers only) or 'both' (beta 4.1: each point's number
    // beside it as for numbers only, and its photo as for photos only); the number in the user's style (NS: colour, size, circle, distance, leader line, where)
    const markMode = job.markMode || (job.markNum ? 'num' : 'photo');
    const photos = markMode === 'num' ? {} : job.photos || {}, havePhotos = Object.keys(photos).length > 0, photoLayer = havePhotos ? (addLayer(d, S, 'G-ESAA POLE PHOTO', 7), 'G-ESAA POLE PHOTO') : null;
    const ANG = []; for (let a = -165; a <= 180; a += 15) ANG.push(a);
    ANG.sort((x, y) => Math.abs(Math.abs(x) - 80) - Math.abs(Math.abs(y) - 80)); // beside the label first, not over it or the road
    const ANG_OUT = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180]; // straight out from the road first
    const numD = (p) => Math.max(NS.d, String(p.seq).length * NS.h * CHW + NS.h * 0.6); // the number's circle (wider for a long number)
    const numF = (p) => (TIDY ? Math.min(TS.l1 / NS.h / kAt(p.dp[0], p.dp[1]), (p.el === 'Pole' ? streetW(p.dp) : Math.min(streetW(p.dp), 0.85 * wMed)) / numD(p) || 1) : 1); // (beta 4.8: as a pole's number in its label, at most as wide as the street) // (and on a finer grid, as much smaller) // beta 4.8: Tidy: the circle at most as wide as the street, its number as much smaller
    const RING = []; for (let a = 0; a < 360; a += 30) RING.push([Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]); RING.push([0, 0]);
    // Drawing style › Photos (job.photoStyle.size): the long side of every photo in metres where the poles stand 25 m apart or more
    // (none set: 18 m, as before); where they stand closer, smaller as before (to two thirds), and smaller again where too many find no room
    const PH_STEPS = [0.85, 0.7, 0.58, 0.48, 0.4, 0.33, 0.27, 0.22, 0.18, 0.15, 0.12, 0.1]; // beta 6.7: a photo with no room at its size anywhere near its pole: these steps smaller, the first that fits
    const MARK_USUAL = 3.5; // v2.41.1: how far (in cost) from its usual place a photo or number may go in the first round
    const MARK_PHI = 70, NUM_PHI = 80; // v2.41.1: a pole's photo 70° round from straight out toward the homing (beside its label), a number 80° (its leader line under the label)
    let nNoRoom = 0; // v2.42.26: photos with no room anywhere, shown as their number
    const placePhotos = (Lp) => {
      const mark = spots.list.length, out = [], left = [], shrunk = []; let miss = 0, drop = 0; nNoRoom = 0; /* (beta 6.7: shrunk, the photos drawn smaller) */ // (beta 4.1: drop = photos left out in photo + number; beta 4.8: left, Tidy's photos with no free place)
      const setup = (p, noPh) => {
        const ph = noPh ? null : photos[p.id] || photos[String(p.id)], nd = ph ? 0 : numD(p) * numF(p);
        const LpK = TIDY ? Lp / kAt(p.dp[0], p.dp[1]) : Lp, w = ph ? (ph.px >= ph.py ? LpK : LpK * ph.px / ph.py) : nd, h = ph ? (ph.px >= ph.py ? LpK * ph.py / ph.px : LpK) : nd; // (beta 4.8: Tidy: on a finer grid, as much smaller)
        const out1 = !ph && NS.place === 'out' && p.td, base = out1 ? [-p.td[0], -p.td[1]] : p.ov || [1, 0], angs = out1 ? ANG_OUT : ANG;
        const gaps = ph ? [0.8, 2.5, 5, 8, 12, 17] : [NS.g, NS.g + 1.5, NS.g + 3.5, NS.g + 6, NS.g + 10, NS.g + 15].map((g) => Math.max(0.3, g));
        // v2.41.1: a pole's photo or number in the same place at every pole where there is room: in the pole's frame (see step 8), on the
        //          side away from the road, beside its label toward the homing (or straight out, as chosen); a little further out before
        //          it is turned, turned before it goes to the label's other side, never across the road unless nothing else is free
        const tries = [];
        if (p.on) {
          const phi0 = !ph && NS.place === 'out' ? 0 : ph ? -MARK_PHI : -NUM_PHI, g0 = gaps[0];
          for (const gap of gaps) for (let k = -11; k <= 12; k++) { const f = ((phi0 + k * 15 + 540) % 360) - 180;
            const dv = (x) => Math.abs(((f - x + 540) % 360) - 180), ang = phi0 ? Math.min(dv(phi0) / 15 * 1.5, 4 + dv(-phi0) / 15 * 1.5) : dv(0) / 15 * 1.5 + (f > 0 ? 0.4 : 0); // (straight out: turned toward the homing rather than away)
            const r = f * Math.PI / 180; tries.push({ u: [p.on[0] * Math.cos(r) + p.fw[0] * Math.sin(r), p.on[1] * Math.cos(r) + p.fw[1] * Math.sin(r)], gap, cost: ang + (gap - g0) * 0.3 + (Math.abs(f) > 100 ? 5 : 0) });
          }
          if (ph && p.lblDir) { // beta 3.4: a photo past its label: the pole, then its ID and details, then the photo (never beside the pole)
            tries.length = 0;
            const ov = p.lblDir, eo = (w * Math.abs(ov[0]) + h * Math.abs(ov[1])) / 2;
            for (const gap of [0.8, 2, 3.5, 5.5, 8, 11]) for (const ds of [0, 2, -2, 4, -4, 7, -7]) {
              const q = add2(add2(p.dp, ov, p.lblFar + gap + eo), p.fw, p.lblMid + ds); tries.push({ q, u: unit(p.dp, q), gap, cost: gap * 0.3 + Math.abs(ds) * 0.3 });
            }
          } else if (ph) { // (a pole with no label: as before, beside where its label would be)
            tries.forEach((x) => { x.cost += 6; });
            const ext = (d) => (w * Math.abs(d[0]) + h * Math.abs(d[1])) / 2, es = ext(p.fw), eo = ext(p.on), L0 = p.lblS ? p.lblS[0] : -6, L1 = p.lblS ? p.lblS[1] : 6, o0 = eo - 0.2;
            for (const [side, sb] of [[-1, L0 - 1 - es], [1, L1 + 1 + es]]) for (const ds of [0, 2, 4, 7, 10]) for (const dO of [0, 1, 2.5, 4, 6, 9]) {
              const q = add2(add2(p.dp, p.fw, sb + side * ds), p.on, o0 + dO); tries.push({ q, u: unit(p.dp, q), gap: ds + dO, cost: (side > 0 ? 4 : 0) + (ds + dO) * 0.3 });
            }
          }
          tries.sort((x, y) => x.cost - y.cost);
        } else for (const gap of gaps) for (const a of angs) tries.push({ u: rotv(base, a), gap, cost: 0 });
        return { p, ph, nd, w, h, tries };
      };
      const search = ({ p, ph, nd, w, h, tries }, maxCost, LW = LEAD_W) => {
        const rest = [];
        for (const tr of tries) {
          if (tr.cost > maxCost) break;
          const { u, gap } = tr, t = ph ? Math.min(Math.abs(u[0]) > 1e-9 ? (w / 2) / Math.abs(u[0]) : 1e9, Math.abs(u[1]) > 1e-9 ? (h / 2) / Math.abs(u[1]) : 1e9) : nd / 2;
          const q = tr.q || add2(p.dp, u, rOf(p) + gap + t);
          if (ph ? [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => R.idx.inside([q[0] + sx * w / 2, q[1] + sy * h / 2], -1, -2))
            : RING.some(([cx, cy]) => R.idx.inside([q[0] + cx * nd / 2, q[1] + cy * nd / 2], -1, -0.6))) continue; // off the roads (v2.41.1: a number by its circle, 0.6 m from the edge)
          if (!(ph ? cellHoldsQ(q, w / 2, h / 2, p.E, p.N) : cellHoldsQ(q, nd / 2, nd / 2, p.E, p.N))) continue; // beta 3.4: inside its own sheet, never cut by the grid line
          const mine = !anchors.some((x) => x !== p && dist2(x.dp, q) < dist2(p.dp, q) - 1); // nearer its own point than any other
          const c = { q, u, gap, boxes: [Spots.box(q[0], q[1], w + (ph ? 1.0 : 0.6), h + (ph ? 1.0 : 0.6), 0)] };
          // v2.41.1: a number's leader line must not cross a label, a symbol or a road edge line either
          let lead = null; if (!ph && NS.leader) { const la = add2(p.dp, u, rOf(p) * 1.6 + 0.3), lb = add2(q, u, -nd / 2 - 0.2), L = dist2(la, lb); if (L > 0.5 && (la[0] - p.dp[0]) * (lb[0] - la[0]) + (la[1] - p.dp[1]) * (lb[1] - la[1]) > 0) { const m = [(la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2]; lead = Spots.box(m[0], m[1], L, 0.4, deg(u)); } }
          // (a number's circle is kept off the road by RING above: the road lines and the cable inside the road do not count for its box)
          if (lead) { const la = add2(p.dp, u, rOf(p) + 0.2), L = dist2(la, q) - nd / 2; let thru = false; for (let k = 1; k * 1.0 < L; k++) if (R.idx.inside(add2(la, u, k * 1.0), -1, 0.3)) { thru = true; break; } if (thru) continue; } // (never through a road)
          if (mine && !(ph ? spots.hits(c.boxes[0]) : spots.hitsW(c.boxes[0], NUM_W)) && !(lead && spots.hitsW(lead, LW))) return { free: c, rest };
          if (mine) { c.lead = lead; c.cost = tr.cost || 0; rest.push(c); }
        }
        return { free: null, rest };
      };
      const commit = ({ p, ph, nd, w, h }, cn, how) => {
        spots.add(cn.boxes, ph ? 'photo' : 'num'); const n1 = spots.list.length;
        if (!ph && NS.leader) { const la = add2(p.dp, cn.u, rOf(p) + 0.2), lb = add2(cn.q, cn.u, -nd / 2); if (dist2(la, lb) > 0.5) spots.line([la, lb], 0.4); } // its leader line
        if (ph && cn.lead) spots.line(cn.lead, 0.3); // (v2.42.26: a photo further out: its line to its pole)
        if (TIDY) spots.list.slice(n1).forEach((b) => { b.tag = 'lead'; }); // (beta 4.8: Tidy: kept as lines: no other line crosses them)
        out.push({ p, ph, w: cn.w || w, h: cn.h || h, q: cn.q, u: cn.u, how, lead: ph ? cn.lead || null : null });
      };
      // v2.42.26: a photo never goes over another photo or a text: where no place beside its pole is free, further out (all round, away
      //           from the road first) with a thin line to its pole that crosses no photo or text (beta 6.7: never smaller)
      const PH_FAR = (t) => (t === 'road' || t === 'cable' ? 0.05 : 1), LD_FAR = (t) => (t === 'photo' ? 1 : 0), LD_TXT = (t) => (t === 'road' || t === 'cable' || t === 'photo' ? 0 : 1); // (its line never across a photo; across a label only where nothing else is free)
      // beta 3.4: (relax) where no place past its label is free in its own sheet: anywhere in its own sheet, a little further and smaller
      //           (to 50 %) — still never over a photo or a text, and never cut by the grid line; (relax 2) a pole close to its sheet's
      //           edge with no room left in its sheet: wholly inside the next sheet, with its line to its pole
      const farPlace = (S0, relax) => {
        const { p } = S0, base = p.on || p.ov || [0, 1]; let best = null;
        for (const k of [1]) { const w = S0.w * k, h = S0.h * k; // (beta 6.7: at its size only, further out instead)
          for (const dd of relax ? [3, 6, 10, 15, 21, 28, 36, 45, 55, 68, 82] : [3, 6, 10, 15, 21, 28, 36, 46, 58]) for (let a = 0; a <= 180; a += 20) for (const sg of a && a < 180 ? [1, -1] : [1]) {
            const u = rotv(base, sg * a), t = Math.min(Math.abs(u[0]) > 1e-9 ? (w / 2) / Math.abs(u[0]) : 1e9, Math.abs(u[1]) > 1e-9 ? (h / 2) / Math.abs(u[1]) : 1e9), q = add2(p.dp, u, rOf(p) + dd + t);
            if ([[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => R.idx.inside([q[0] + sx * w / 2, q[1] + sy * h / 2], -1, -2))) continue; // off the roads
            if (!(relax === 2 ? cellHoldsQ(q, w / 2, h / 2, q[0], q[1]) : cellHoldsQ(q, w / 2, h / 2, p.E, p.N))) continue; // beta 3.4: inside its own sheet (relax 2: inside one sheet)
            if (!relax && p.lblDir && Math.hypot(q[0] - p.dp[0], q[1] - p.dp[1]) - Math.hypot(w, h) / 2 < p.lblFar - 1) continue; // beta 3.4: past its label, not beside the pole
            const box = Spots.box(q[0], q[1], w + 1.0, h + 1.0, 0), hb = spots.hitsW(box, PH_FAR); if (hb >= 0.5) continue; // (a photo, a text or a symbol: never)
            const la = add2(p.dp, u, rOf(p) + 0.3), lb = add2(q, u, -t), L = dist2(la, lb), lead = L > 1.2 ? Spots.box((la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2, L, 0.3, deg(u)) : null;
            if (lead && spots.hitsW(lead, LD_FAR) > 0) continue;
            if (TIDY && lead && relax !== 2 && spots.hitsW(lead, LD_TXT) > 0) continue; // (beta 6.7: Tidy: its line across no text, symbol or other line, but in the last round)
            const cost = dd + a / 20 * 1.5 + (1 - k) * 40 + hb * 5 + (lead ? spots.hitsW(lead, LD_TXT) * 12 : 0);
            if (!best || cost < best.cost) best = { q, u, gap: dd, boxes: [box], w, h, lead: lead ? [la, lb] : null, cost };
          }
          if (best) break; }
        return best;
      };
      /* beta 6.7: the last resort for a photo already at the smallest step: round its pole (3 to 60 m out), inside its own sheet, off the
         roads where it can be, the place covering least (a photo or a text counts most), with its line */
      const anyPlace = (S0) => { const { p, w, h } = S0; let best = null;
        for (const dd of [3, 6, 10, 15, 21, 28, 36, 46, 60]) for (let a = 0; a < 360; a += 20) { const u = rotv([1, 0], a), t = Math.min(Math.abs(u[0]) > 1e-9 ? (w / 2) / Math.abs(u[0]) : 1e9, Math.abs(u[1]) > 1e-9 ? (h / 2) / Math.abs(u[1]) : 1e9), q = add2(p.dp, u, rOf(p) + dd + t);
          if (!cellHoldsQ(q, w / 2, h / 2, p.E, p.N)) continue; const box = Spots.box(q[0], q[1], w + 1.0, h + 1.0, 0), la = add2(p.dp, u, rOf(p) + 0.3), lb = add2(q, u, -t), L = dist2(la, lb), lead = L > 1.2 ? Spots.box((la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2, L, 0.3, deg(u)) : null;
          const cost = spots.hits(box) * 10 + (R.idx.inside(q, -1, 0) ? 3 : 0) + (lead ? spots.hitsW(lead, LD_TXT) * 2 : 0) + dd * 0.05; if (!best || cost < best.cost) best = { q, u, gap: dd, boxes: [box], w, h, lead: lead ? [la, lb] : null, cost }; }
        return best; };
      /* beta 4.8: Tidy: a photo near its pole, on the pole's side of the street (in the block, 2 m off the roads), covering nothing; its
         thin line to the pole short, crossing no other line, text, symbol or cable, nor a road edge line while any other place is free;
         its line may then cross a road edge line (beta 6.7: never smaller; then further, see farPlace). None free: left out (its number is on the plan) and listed. */
      const tidyPh = (S0) => {
        const { p } = S0, on = p.on || p.ov || [0, 1], fw = p.fw || [on[1], -on[0]], rp = rOf(p), LDR = (t) => (t === 'road' ? 0 : 1);
        for (const [k, LW] of [[1, null], [1, LDR]]) { // (beta 6.7: at its size only, further out with its line instead of smaller)
          const w = S0.w * k, h = S0.h * k, eo = (w * Math.abs(on[0]) + h * Math.abs(on[1])) / 2, es = (w * Math.abs(fw[0]) + h * Math.abs(fw[1])) / 2, cs = [];
          for (const a of [0, eo + rp + 0.5, eo + rp + 2, eo + rp + 4, eo + rp + 6.5, eo + rp + 9.5, eo + rp + 13, eo + rp + 17, eo + rp + 22, eo + rp + 29, eo + rp + 37, eo + rp + 47, eo + rp + 59]) for (const b of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
            const f = b ? Math.sign(b) * ((Math.abs(b) - 1) * (2 * es + 1.5) + es + rp + 0.5) : 0; if (!a && !b) continue;
            const q = add2(add2(p.dp, on, a), fw, f), ex = Math.min(Math.max(p.dp[0], q[0] - w / 2), q[0] + w / 2), ey = Math.min(Math.max(p.dp[1], q[1] - h / 2), q[1] + h / 2);
            cs.push({ q, e: [ex, ey], cost: Math.hypot(ex - p.dp[0], ey - p.dp[1]) + Math.abs(f) * 0.15 });
          }
          cs.sort((x, y) => x.cost - y.cost);
          for (const c of cs) {
            const { q, e } = c;
            if ([[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => R.idx.inside([q[0] + sx * w / 2, q[1] + sy * h / 2], -1, -2))) continue; // off the roads
            if (!cellHoldsQ(q, w / 2, h / 2, p.E, p.N)) continue; // inside its sheet
            const box = Spots.box(q[0], q[1], w + 1.0, h + 1.0, 0); if (spots.hits(box)) continue;
            const d0 = dist2(p.dp, e); let lead = null;
            if (d0 <= rp + 1.2 && anchors.some((x) => x !== p && dist2(x.dp, q) < dist2(p.dp, q) - 1)) continue; // (with no line: nearer its own pole than any other)
            if (d0 > rp + 1.2) { // (its line checked from a little past the pole, where every line of the pole starts)
              const u = unit(p.dp, e), la = add2(p.dp, u, rp + 0.3), lc = add2(p.dp, u, rp * 1.6 + 0.5), lb = Spots.box((lc[0] + e[0]) / 2, (lc[1] + e[1]) / 2, Math.max(0.1, dist2(lc, e)), 0.3, deg(u));
              if (p.symBox) p.symBox._k--; const nh = LW ? spots.hitsW(lb, LW) : spots.hits(lb); if (p.symBox) p.symBox._k++; if (nh) continue; lead = [la, e]; }
            return { q, u: unit(p.dp, q), gap: d0, boxes: [box], w, h, lead };
          }
        }
        return null;
      };
      // v2.41.1: first every pole in its usual place (or a little further), so a pole that has no room there does not take its neighbour's
      //          place (one pole on the other side used to send the next ones over too); then the poles left over and the other points
      const ORDER = [...markOrder.filter((x) => x.el === 'Pole'), ...markOrder.filter((x) => x.el !== 'Pole')]; // v2.40: the poles' first
      // beta 4.1 (MarkT): photo + number = two rounds: every number first, beside its pole as for numbers only; then every photo, as for photos only
      for (const round of markMode === 'both' ? (TIDY ? ['photo', 'num'] : ['num', 'photo']) : ['one']) { // (beta 4.8: Tidy: the photos first, each beside its pole; then the numbers, small, in the room left beside the pole)
      const later = [];
      for (const p of ORDER) {
        const S0 = setup(p, round === 'num'); if (round === 'photo' && !S0.ph) continue; // (a point without a photo has its number already)
        if (TIDY && (S0.ph ? tidyCard.has(p) : tidyBadged.has(p))) continue; // (beta 4.8: Tidy: its photo or number is in its label)
        if (TIDY && S0.ph) { const f = tidyPh(S0); if (f) commit(S0, f, 'near its pole'); else later.push(S0); continue; } // beta 4.8
        if (p.on) { const r = search(S0, MARK_USUAL); if (r.free) { commit(S0, r.free, 'usual'); continue; } }
        later.push(S0);
      }
      for (let S0 of later) { // (beta 6.7: S0 may become the photo drawn smaller, below)
        const { p, w, h } = S0; let r = TIDY && S0.ph ? { free: null, rest: [] } : search(S0, Infinity), how = 'other'; if (!r.free && !S0.ph && NS.leader) { r = search(S0, Infinity, LEAD_W2); how = 'leader over a road line'; } let cn = r.free; // (last: its leader across a road line)
        if (!cn && S0.ph) { const f = farPlace(S0) || farPlace(S0, 1) || farPlace(S0, 2); if (f) { cn = f; how = 'further, with a line'; } } // v2.42.26 (beta 3.4: then relaxed) (beta 6.7: Tidy too, rather than leave a photo out: at its size, further, with its line)
        /* beta 6.7 (the owner: "if there are no choice then shrink them but not leave them out.. important hierarchy: pole location, pole
           details and last the photo"): with no place at its size, near its pole or further out with its line, that photo only is drawn
           smaller, a step at a time, as little as it needs, near its pole with its line (the pole and its details keep their places);
           at the smallest step, the place covering least. Listed with its size. Never left out. */
        if (!cn && S0.ph) {
          for (const k of PH_STEPS) { const S1 = { ...S0, w: S0.w * k, h: S0.h * k }, f = (TIDY ? tidyPh(S1) : search(S1, Infinity).free) || farPlace(S1) || farPlace(S1, 1) || farPlace(S1, 2); if (f) { cn = f; S0 = S1; how = `smaller (${Math.round(k * 100)} %), with a line`; shrunk.push({ p, k }); break; } }
          if (!cn) { const k = PH_STEPS[PH_STEPS.length - 1], S1 = { ...S0, w: S0.w * k, h: S0.h * k }, f = anyPlace(S1); if (f) { cn = f; S0 = S1; how = 'smallest, where it covers least'; shrunk.push({ p, k, over: true }); } }
        }
        if (!cn && S0.ph && TIDY) left.push(p); // (beta 4.8: Tidy: no free place near its pole: listed in the README)
        if (!cn && S0.ph && round === 'photo') { nNoRoom++; drop++; if (!TIDY) left.push(p); continue; } // beta 4.1: photo + number: no free place for the photo anywhere: it is left out (its number is on the plan)
        if (!cn && S0.ph) { const S1 = setup(p, true), r1 = search(S1, Infinity); if (r1.free) { commit(S1, r1.free, 'number: no room for its photo'); nNoRoom++; continue; } } // (v2.42.26: no room for its photo anywhere: its number)
        if (!cn && S0.ph && TIDY) { nNoRoom++; drop++; continue; } // (beta 6.0: Tidy: not over anything either: left out, listed in the README, as the note says)
        // nothing free: the place covering least (v2.41.1: a number's circle over something counts more than its leader line across it)
        const bad = (x) => (S0.ph ? spots.hits(x.boxes[0]) : spots.hitsW(x.boxes[0], NUM_W)) * 10 + (x.lead ? Math.min(1, spots.hitsW(x.lead, LEAD_W2)) * 3 + spots.hitsW(x.lead, LEAD_W2) * 0.2 : 0) + (p.on ? x.cost * 0.5 : x.gap);
        if (!cn) { how = 'not free'; miss++; cn = r.rest.reduce((b, x) => (!b || bad(x) < bad(b) ? x : b), null) || { q: add2(p.dp, p.ov || [1, 0], rOf(p) + 2 + Math.hypot(w, h) / 2), u: p.ov || [1, 0], boxes: [] }; }
        commit(S0, cn, how);
      }
      }
      return { out, miss, mark, drop, left, shrunk };
    };
    /* beta 6.7 (the owner: "Closures sized to the street: put a red proposed closure label + arrow"): each proposed closure's PROPOSED
       CLOSURE and its ID in red, two lines as large as the IDs, after the pole labels, IDs and span lengths, before the photos, numbers, street and landmark names (which then keep off it), the
       nearest free place round the pentagon a little out from it, with a red arrow (a line and a filled head) to the pentagon's edge */
    { let nCL = 0, nFar = 0, nOver = 0; const W_CL = (t) => (t === 'road' || t === 'cable' ? 0.15 : 1), W_AR = (t) => (t === 'road' || t === 'cable' ? 0 : t === 'lead' ? 0.4 : !t ? 0.15 : 1), CLY = lay('P-JOINT');
      for (const { at, R: Rp, cid } of cloLbl) { // (Rp: the pentagon's reach)
        const th = TIDY ? TS.id / kAt(at[0], at[1]) : IDS.h, L2 = ['PROPOSED CLOSURE', cid], w = Math.max(...L2.map((x) => arialW(x, th))) * 1.08, h = th * 2.6; let best = null;
        for (const g of [2.2, 3.5, 5, 7, 10, 14, 19, 25]) { for (let k = 0; k < 16; k++) { const v = rotv([1, 0], k * 22.5 + (g > 5 ? 11.25 : 0)), ex = Math.abs(v[0]) * w / 2 + Math.abs(v[1]) * h / 2, c = add2(at, v, Rp + g * th + ex), bx = Spots.box(c[0], c[1], w + th * 0.4, h + th * 0.3, 0);
            if (!cellHolds(bx, at[0], at[1])) continue; // (inside the closure's own sheet)
            const a0 = add2(c, v, -(ex + 0.25 * th)), a1 = add2(at, v, Rp + 0.15 * th), La = dist2(a0, a1), ab = La > 0.2 ? Spots.box((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, La, 0.25 * th, deg(v)) : null;
            const nb = spots.hitsW(bx, W_CL), na = ab ? spots.hitsW(ab, W_AR) : 0, n = nb * 10 + na * 3, cost = n + g * 0.35 + k * 0.001 + (R.idx.inside(c, -1, 0) ? 1.5 : 0);
            const ok = nb < 0.35 && na < 0.5; /* (free: over a road or cable line at most, its arrow across no text or photo) */ if (!best || (ok && !best.ok) || (ok === best.ok && cost < best.cost)) best = { c, v, bx, a0, a1, ab, n, nb, na, g, cost, ok }; }
          if (best && best.ok) break; }
        if (!best) continue;
        const { c, v, a0, a1 } = best, ah = 0.9 * th, aw = 0.38 * th, pv = [-v[1], v[0]], b0 = add2(a1, v, ah);
        L2.forEach((x, i) => o.text(CLY, c[0], c[1] + (i ? -0.65 : 0.65) * th, th, x, { ha: 1, va: 2, style: 'arial', color: 1 }));
        if (dist2(a0, a1) > ah * 1.05) o.lwpoly(CLY, [a0, b0], { color: 1 });
        o.solid(CLY, [a1, add2(b0, pv, aw), add2(b0, pv, -aw)], { color: 1 });
        spots.add([best.bx], 'label'); if (best.ab) spots.line([a0, a1], 0.3); if (!best.ok) nOver++; nCL++; (rep._cloL || (rep._cloL = [])).push({ cid, g: best.g, box: +best.nb.toFixed(2), arrow: +best.na.toFixed(2) }); if (best.g > 7) nFar++;
      }
      if (cloLbl.length) { rep.closureLabels = { proposed: cloLbl.length, labelled: nCL, further: nFar, notFree: nOver, each: rep._cloL || [] }; delete rep._cloL; if (nOver) rep.notes.push(`PROPOSED CLOSURE labels with no free place (placed where they cover least): ${nOver}`); } }
    let Lp = TIDY ? PHMM / (printK || 0.62) : PHMM * 1.1, photoPl = placePhotos(Lp); /* (beta 6.7: Standard too: the size set, in metres at 1:1100; no longer smaller where the poles stand close, nor again below) */ // (beta 6.4: Tidy: the photo size as set, printed) // (beta 4.8: Tidy: about 1.4 times the street's width, at most; 2.44.10: Drawing style's photo size)
    // (beta 6.7: no second and third round at 0.8 and 0.64 of the size: a photo with no room near its pole goes further with its line)
    const nCol = NS.color || null, bCol = NS.bcolor || NS.color || null, nLay = lay('p-pole');
    // v2.42.13: a number in a light colour (yellow, the default; green or cyan) over a dark shadow, its circle and leader line too: on
    // white paper the yellow could not be read
    const layCol = (n) => { const L = S.layers.get(n); return L ? Math.abs(parseInt(get(L, 62, '7'), 10) || 7) : 7; };
    const lightCol = (c) => [2, 3, 4].includes(c), shN = lightCol(nCol != null ? +nCol : layCol(nLay)), shB = lightCol(bCol != null ? +bCol : layCol(nLay)), SH = 250, so = NS.h * 0.08;
    { const P1 = photoPl.out.filter((x) => x.ph); rep.photos = { mm: +PHMM.toFixed(1), inLabels: TIDY ? tidyCard.size : 0, onTheirOwn: P1.length, withLine: P1.filter((x) => x.lead).length, shrunk: photoPl.shrunk.length, smallestMm: photoPl.shrunk.length ? +(PHMM * Math.min(...photoPl.shrunk.map((x) => x.k))).toFixed(1) : null, coveringLeast: photoPl.shrunk.filter((x) => x.over).length, leftOut: nNoRoom }; } // beta 6.7: every photo at its size: where they went
    for (const { p, ph, w, h, q, u, lead } of photoPl.out) {
      if (ph && havePhotos && lead) o.lwpoly(lay(photoLayer), lead, { color: 8 }); // v2.42.26: a photo further out: a thin line to its pole
      if (ph && havePhotos) {
        getImgs().image(o, lay(photoLayer), ph.file, ph.px, ph.py, q[0] - w / 2, q[1] - h / 2, w, h);
        o.lwpoly(lay(photoLayer), [[q[0] - w / 2, q[1] - h / 2], [q[0] + w / 2, q[1] - h / 2], [q[0] + w / 2, q[1] + h / 2], [q[0] - w / 2, q[1] + h / 2]], { closed: true, color: 8 }); // its frame
        // (beta 4.1: with photo + number the number is no longer written on the photo: it has its own place beside the pole, drawn below)
      } else {
        const nF = numF(p), D = NS.d > 0 ? numD(p) * nF : 0;
        const la = NS.leader ? add2(p.dp, u, rOf(p) + 0.2) : null, lb = NS.leader ? add2(q, u, -(D || NS.h * nF) / 2 - 0.2) : null, lead = la && dist2(la, lb) > 0.5;
        const rc = p.numCol != null && +p.numCol > 0, nC = rc ? +p.numCol : nCol, bC = rc ? +p.numCol : bCol, sN1 = rc ? litCol(nC) : shN, sB1 = rc ? litCol(bC) : shB; // (beta 6.5: its RTA/JPA category's colour, number and circle)
        if (sB1) { if (D) o.circle(nLay, q[0] + so, q[1] - so, D / 2, { color: SH }); if (lead) o.lwpoly(nLay, [[la[0] + so, la[1] - so], [lb[0] + so, lb[1] - so]], { color: SH }); } // the shadows first (drawn under)
        if (sN1) o.text(nLay, q[0] + so, q[1] - so, NS.h * nF, String(p.seq), { ha: 1, va: 2, style: 'arial', color: SH });
        if (D) o.circle(nLay, q[0], q[1], D / 2, { color: bC });
        o.text(nLay, q[0], q[1], NS.h * nF, String(p.seq), { ha: 1, va: 2, style: 'arial', color: nC });
        if (lead) o.lwpoly(nLay, [la, lb], { color: bC });
      }
    }
    if (job.debug) rep.layout = { grid: { gox, goy, cell }, poles: poleOrder.map((p) => ({ id: String(p.id), E: p.E, N: p.N, dp: p.dp, td: p.td, ov: p.ov, rr: p._rr, lblFar: p.lblFar, lblDir: p.lblDir })), labels: spots.list.filter((b) => /^label/.test(b.tag || '') && b.tag !== 'label:site').map((b) => [b.cx, b.cy, b.hw, b.hh, b.ux, b.uy, b.vx, b.vy]), marks: photoPl.out.map(({ p, ph, w, h, q, u, how, lead }) => ({ lead: lead || null, id: String(p.id), pid: p.poleId, el: p.el, dp: p.dp, td: p.td, q, u, ph: !!ph, w, h, r: rOf(p), how })) };
    if (photoPl.shrunk.length) { const sz = (x) => `${x.p.poleId || x.p.id} ${+(PHMM * x.k).toFixed(1)} mm${x.over ? ' (covering least)' : ''}`; rep.notes.push(`Photos drawn smaller: no place at their size (${+PHMM.toFixed(1)} mm) near their pole, nor further out with a line; the pole first, then its details, then its photo (${photoPl.shrunk.length}): ${photoPl.shrunk.slice(0, 20).map(sz).join(', ')}${photoPl.shrunk.length > 20 ? '…' : ''}`); } // beta 6.7
    if (!TIDY && photoPl.left.length) rep.notes.push(`Photos left out (no place even at their smallest step; the point's number is on the plan; its photo is in the folder): ${photoPl.left.length}: ${photoPl.left.slice(0, 12).map((p) => p.poleId || p.id).join(', ')}${photoPl.left.length > 12 ? '…' : ''}`); // (beta 6.7: never, as far as the measures go)
    if (TIDY && photoPl.left.length) rep.notes.push(`Photos with no free place near their pole (left out: the point's number is on the plan; its photo is in the folder): ${photoPl.left.map((p) => p.poleId || p.id).join(', ')}`); // beta 4.8
    rep.photoSize = +Lp.toFixed(1); rep.photosNotFree = photoPl.miss; rep.photosAsNumber = nNoRoom; rep.markMode = markMode;
    const withPh = new Set([...photoPl.out.filter((x) => x.ph).map((x) => String(x.p.id)), ...[...tidyCard].map((p) => String(p.id))]); /* (beta 4.8: with Tidy's photos in their labels) */ /* (v2.42.26: no room for its photo: its number; beta 4.1: by the photos placed) */ rep.marks = markOrder.map((p) => [p.seq, String(p.id), withPh.has(String(p.id)) ? (markMode === 'both' ? 'photo+number' : 'photo') : 'number']); // v2.40: the numbers on the plan
    // 11. coordinates of the points that are not poles
    // v2.37: smaller, where they cover nothing (none for a NAP or closure drawn on its pole)
    for (const p of pts) {
      if (p.el === 'Pole' || p.onPole) continue;
      const q0 = inl.has(p) ? inl.get(p).at : [p.E, p.N], ext = inl.has(p) ? Math.max(inl.get(p).hl, inl.get(p).hh) : 3, hL = TIDY ? TS.sm / kAt(q0[0], q0[1]) : +(job.poleStyle || {}).llH > 0 ? +job.poleStyle.llH : 1.2, w = 10 * hL * CHW, h = 2 * 1.67 * hL; // (beta 4.3: the lat/long height of the drawing style)
      // v2.41: where every place is taken, over a road edge line or the cable rather than over an ID, a number or a photo
      const kq = TIDY ? kAt(q0[0], q0[1]) : 1, cs = []; for (const r of [ext + 1.5 / kq, ext + 5 / kq, ext + 9 / kq, ext + 13 / kq, ext + 18 / kq]) for (const a of [-45, 45, -135, 135, -90, 90, 0, 180]) { /* (beta 4.8: on a finer grid, as much nearer) */ const u = rotv([1, 0], a), c = add2(q0, u, r + w / 2 * Math.abs(u[0]) + h / 2 * Math.abs(u[1])); cs.push({ q: [c[0] - w / 2, c[1] + h / 2], boxes: [Spots.box(c[0], c[1], w * 1.1, h, 0)] }); }
      const csIn = TIDY ? [...cs.filter((x) => inCellBox(x.boxes[0], q0[0], q0[1])), ...cs.filter((x) => !inCellBox(x.boxes[0], q0[0], q0[1]))] : cs, c = pickW(spots, csIn, LL_W); spots.add(c.boxes); // (beta 4.8: Tidy: a free place wholly on its sheet first)
      o.mtext(lay('LATLONG'), c.q[0], c.q[1], hL, `{\\fSimSun|b0|i0|c134|p2;${p.lat.toFixed(6)}%%D\\P${p.lon.toFixed(6)}%%D}`, { style: '样式 1', color: +(job.poleStyle || {}).llColor || null });
    }
    // 12. v2.34: the name of every named road on every GEO sheet it crosses (once per sheet), on the road where it covers no label;
    //     then buildings and places nearby (named in OpenStreetMap), turned along their road, wholly inside a sheet
    const wins = geoCells.map((c) => [gox + c.i * cell, goy + c.j * cell, gox + (c.i + 1) * cell, goy + (c.j + 1) * cell, ...(NU > 1 ? [NU] : [])]); // (beta 4.8: Tidy: with the grid's NU, for the sizes)
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
        const slide = job.crowd && job.crowd.streets !== 'fixed', FS = slide ? [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9, 0.06, 0.94] : [0.5, 0.3, 0.7, 0.15, 0.85]; // (beta 3.8: Auto: slid along its road to a free place)
        look: for (const h of (TIDY ? (() => { const L = [3.2, 2.6, 2.0, 1.6].filter((v) => v * TS.mm >= 1.3 - 1e-6); return (L.length ? L : [3.2]).map((v) => v / (W[4] > 1 ? W[4] : 1)); })() : [3.2, 2.6, 2.0, 1.6])) for (const sg of segs.slice(0, slide ? 16 : 8)) { // (beta 4.8: on a finer grid, as much smaller)
          const u = unit(sg.a, sg.b), rd = readable(deg(u)), nv = [-u[1], u[0]];
          for (const f of FS) for (const dd of [0, 0.4, -0.4, 0.6, -0.6]) {
            const q = add2(add2(sg.a, u, f * sg.L), nv, dd * sg.hw), b0 = textBox(q[0], q[1], h, txt, rd, 1, 2), b = { ...b0, hw: b0.hw + h * 1.2, hh: b0.hh + 0.35 }; // room at its ends and sides
            if (!inside(b0, W, 1) || spots.hits(b)) continue;
            o.text(lay('STREET NAME'), q[0], q[1], h, txt, { rot: rd, ha: 1, va: 2, style: 'arial', color: 7, obl: 15 }); spots.add(b, 'street'); nStreets++; done = true; break look; // v2.42.11: black, slanted 15° (the yellow could not be read on paper)
          }
        }
      }
    }
    for (const p of polesOnly) if (p.near && !p.near.r.name) unnamedNear++;
    rep.streetNames = nStreets; rep.polesOnUnnamedRoads = unnamedNear;
    // 10. (v2.39.1: after the street names, which come first) the cable's name along each run, where there is room: v2.37 the size of the span lengths, close along the cable. v2.39: on
    //     every GEO sheet the run crosses (where 40 m of it are on the sheet), as the company's plans repeat it; else once
    const sheetWins = geoCells.map((c) => [gox + c.i * cell, goy + c.j * cell, gox + (c.i + 1) * cell, goy + (c.j + 1) * cell, ...(NU > 1 ? [NU] : [])]); // (beta 4.8: Tidy: with the grid's NU, for the sizes)
    const boxIn = (b, W, m) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([u, v]) => { const x = b.cx + b.ux * b.hw * u + b.vx * b.hh * v, y = b.cy + b.uy * b.hw * u + b.vy * b.hh * v; return x >= W[0] + m && x <= W[2] - m && y >= W[1] + m && y <= W[3] - m; });
    let nCableNames = 0;
    for (const ch of chains) {
      const txt = label.get(ch.cable); if (!txt || !ch.pieces || !ch.pieces.length) continue;
      const own = (W) => job.cabLabels && cabAt.some(([k, q]) => k === (ch.cable || '') && q[0] >= W[0] && q[0] <= W[2] && q[1] >= W[1] && q[1] <= W[3]); // v2.42.23: the cable's own labels on that sheet: no second tag
      const th = TIDY ? TS.span(wMed) : Math.max(1.4, 2.0 * kG), off = th * 0.75 + 0.6; // (beta 4.8: Tidy: as the span lengths)
      const place = (W, relaxed) => { const thW = th / ((W && W[4]) || 1); // (beta 4.8: Tidy: on a finer grid, as much smaller) v2.42.10 relaxed: a sheet with no free room still gets the name, where it covers least, smaller first
        const segs = [], cands = []; let total = 0;
        for (const line of ch.pieces) for (const piece of W ? clipLine(line, [W[0] + 4, W[1] + 4, W[2] - 4, W[3] - 4]) : [line]) for (let k = 1; k < piece.length; k++) { const L = dist2(piece[k - 1], piece[k]); total += L; if (L > 1) segs.push({ L, a: piece[k - 1], b: piece[k] }); }
        if (!segs.length || (W && total < (relaxed ? 25 : 40))) return false;
        segs.sort((x, y) => y.L - x.L);
        const ks = W && !relaxed ? [1, -1, 1.7, -1.7, 2.5, -2.5] : [1, -1, 1.7, -1.7, 2.5, -2.5, 3.5, -3.5]; // v2.39.1: the one fallback looks a little further out
        // v2.40: the one fallback, crowded (a short underground run between handholes), also a size smaller
        // v2.41: the name never runs past the line it names: on a short piece of cable it is made smaller to fit (down to 0.9 m)
        const tw1 = txt.length * CHW; // its width for a height of 1 m
        for (const h0 of W && !relaxed ? [thW] : [thW, thW * 0.8]) for (const sg of segs.slice(0, 12)) {
          const h = Math.min(h0, (sg.L * 0.92) / tw1); if (h < 0.9) continue;
          const o2 = h * 0.75 + 0.6, t = unit(sg.a, sg.b), rd = readable(deg(t)), nl = [-t[1], t[0]], fs = h * tw1 > sg.L * 0.6 ? [0.5] : [0.5, 0.3, 0.7, 0.15, 0.85];
          for (const k of ks) for (const f of fs) { const q = add2(add2(sg.a, t, sg.L * f), nl, k * o2), bx = textBox(q[0], q[1], h, txt, rd, 1, 2); if (!W || boxIn(bx, W, 1)) cands.push({ q, rd, h, k: Math.abs(k), boxes: [bx] }); }
        }
        if (!cands.length) return false;
        cands.sort((x, y) => (x.h < thW - 1e-9) - (y.h < thW - 1e-9) || ((!W || relaxed) && ((x.k > 2.5) - (y.k > 2.5)))); // full size first (close to the cable first, then further out), then smaller
        // on a sheet: only where it covers nothing; the one fallback: where it covers least, never over a street name if it can help it
        const wf = (t) => (t === 'street' ? 6 : t === 'road' ? 0.2 : 1), nOf = (x) => (x && x.n) || 0;
        const full = cands.filter((x) => x.h >= thW - 1e-9), small = cands.filter((x) => x.h < thW - 1e-9);
        let c = W && !relaxed ? pick(spots, cands) : full.length ? pickW(spots, full, wf) : pickW(spots, small, wf); if (W && !relaxed && c.n > 0) return false;
        if ((!W || relaxed) && nOf(c) >= 1 && small.length && full.length) { const s2 = pickW(spots, small, wf); if (s2 && nOf(s2) < nOf(c)) c = s2; } // smaller only when the full size would cover a label
        o.text(lay('MISC'), c.q[0], c.q[1], c.h || thW, txt, { rot: c.rd, ha: 1, va: 2, style: 'arial', color: (CABLE_STYLE[ch.cable] || {}).color || null }); spots.add(c.boxes); nCableNames++;
        return true;
      };
      let n = 0; for (const W of sheetWins) if (own(W) || place(W) || place(W, true)) n++; // v2.42.10: on every GEO sheet the run crosses (v2.42.23: where it has no label of its own)
      if (!n && !(job.cabLabels && cabDone.has(ch.cable || ''))) place(null);
    }
    let nPois = 0, nIcons = 0; const placed = [], poiSkip = { outside: 0, dup: 0, noRoom: 0 }; // v2.39.1: why a place was not written
    // v2.35.6: the landmark's icon (OpenStreetMap Carto / Maki, CC0) as a block of solid fills, on its own layer
    const LMB = Array.isArray(job.lmBlocks) ? job.lmBlocks : null, lmRefs = job.lmRefs || [], ICON = 4 / (TIDY ? NU : 1), LMLAY = 'G-ESAA LANDMARK'; // (beta 6.0: Tidy: its icon as printed at the template's grid)
    /* beta 6.0 (the owner: "have the landmarks text labels shrink to accommodate the pole details but landmarks must be readable"): Tidy
       places the landmark names after the pole blocks, so a block never makes way for one; a name takes the room left: 1.6 mm high on the
       A3 sheet, a little further, then smaller to 1.3 mm at the least; where none is free at 1.3 mm its name is left out (its icon kept
       where it fits) and counted in the README. Standard: as before (2 m, then 1.6 m). */
    const LM_MM = TIDY ? (v) => v / ((printK || 0.62) * NU) : null, LS = TIDY ? 1 / NU : 1, lmStat = { shrunk: 0, moved: 0, minMm: null, wrapped: 0, abbreviated: 0, abbrWrapped: 0 };
    const iconName = (i) => 'GESAA_LM_' + String(lmRefs[i] || i).replace(/^[cm]:/, '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
    const wantIcons = LMB && job.lmIcons !== false ? [...new Set((job.pois || []).map((q) => q.icon).filter((i) => Number.isInteger(i) && i >= 0 && LMB[i]))] : [];
    if (wantIcons.length) { addLayer(d, S, LMLAY, 7); fillBlocks(d, S, wantIcons.map((i) => ({ name: iconName(i), icon: LMB[i] }))); }
    // beta 6.1: the name on one or two lines as before (22 letters a line); wrapped onto k lines as evenly as it goes; the standard abbreviations
    const lmWrap0 = (nm) => { const L = []; for (const w of nm.split(/\s+/)) { const l = L.length - 1; if (l >= 0 && (L[l] + ' ' + w).length <= 22) L[l] += ' ' + w; else L.push(w); } if (L.length > 2) { L.length = 2; L[1] = L[1].slice(0, 20) + '...'; } return L; }; // two lines at most
    const lmWrapN = (nm, k) => { const w = nm.split(/\s+/); if (w.length < k) return null; let best = null; const go = (i, acc) => { if (acc.length === k - 1) { const L = [...acc, w.slice(i).join(' ')], m = Math.max(...L.map((x) => x.length)); if (!best || m < best.m) best = { L, m }; return; } for (let e = i + 1; e <= w.length - (k - 1 - acc.length); e++) go(e, [...acc, w.slice(i, e).join(' ')]); }; go(0, []); return best && best.m <= 30 ? best.L : null; };
    const LM_AB_W = [['ELEMENTARY', 'ELEM.'], ['SCHOOL', 'SCH.'], ['NATIONAL', "NAT'L"], ['BARANGAY', 'BRGY.'], ['STREET', 'ST.'], ['AVENUE', 'AVE.'], ['CHURCH', 'CH.'], ['HOSPITAL', 'HOSP.'], ['MARKET', 'MKT.'], ['BUILDING', 'BLDG.'], ['CENTER', 'CTR.'], ['CENTRE', 'CTR.'], ['SUBDIVISION', 'SUBD.'], ['UNIVERSITY', 'UNIV.'], ['MEMORIAL', 'MEM.'], ['STATION', 'STA.'], ['CORPORATION', 'CORP.'], ['INCORPORATED', 'INC.']];
    const LM_AB_P = [['NATIONAL HIGH SCHOOL', 'NHS'], ['ELEMENTARY SCHOOL', 'ES'], ['HIGH SCHOOL', 'HS']];
    const abCase = (src, ab, acro) => (acro || src === src.toUpperCase() ? ab : src === src.toLowerCase() ? ab.toLowerCase() : ab.charAt(0) + ab.slice(1).toLowerCase()); // case kept
    const abSub = (nm, list, acro) => list.reduce((t, [w, ab]) => t.replace(new RegExp('(^|[^A-Za-z0-9])(' + w.replace(/ /g, '\\s+') + ')(?=$|[^A-Za-z0-9])', 'gi'), (m0, pre, src) => pre + abCase(src, ab, acro)), nm);
    const lmAbbr = (nm) => { const a = abSub(nm, LM_AB_W, false), b = abSub(abSub(nm, LM_AB_P, true), LM_AB_W, false); return [...new Set([a, b])].filter((x) => x !== nm); }; // the words, then the school names as letters too
    const lmMode = ['always', 'hide'].includes(job.lmMode) ? job.lmMode : 'room'; poiSkip.hidden = 0; let poisAlways = 0; // beta 3.8: landmark names (Drawing style → Crowded places)
    for (const poi of job.pois || []) {
      const name = String(poi.name || '').trim().toUpperCase(); if (!name || !Number.isFinite(poi.E) || !Number.isFinite(poi.N)) continue;
      const q0 = [poi.E, poi.N], W = wins.find((w) => q0[0] >= w[0] && q0[0] <= w[2] && q0[1] >= w[1] && q0[1] <= w[3]);
      if (!W) { poiSkip.outside++; continue; } if (placed.some((x) => x.name === name && dist2(x.q, q0) < 60)) { poiSkip.dup++; continue; }
      const ic = job.lmIcons !== false && Number.isInteger(poi.icon) && poi.icon >= 0 && S.blocks.has(iconName(poi.icon)) ? iconName(poi.icon) : null; // (beta 6.7: Drawing style › Landmarks › Icons: Off, none)
      const ib = ic ? Spots.box(q0[0], q0[1], ICON * 1.1, ICON * 1.1, 0) : null, useIcon = !!(ib && !spots.hits(ib) && !R.idx.inside(q0, -1, -1));
      if (lmMode === 'hide') { if (useIcon) { o.insert(LMLAY, ic, q0[0], q0[1], { scale: ICON }); spots.add(ib); nIcons++; } poiSkip.hidden++; placed.push({ name, q: q0 }); continue; } // (beta 3.8: hidden names: their icons only)
      // beta 6.1 (the owner: "wrap the text so that we can squeeze even more space or we can shorten the name example from elementary to
      // elem only"): Tidy: a name with no room even at 1.3 mm is tried again wrapped onto two, then three lines, then shortened with
      // standard abbreviations (whole words), then both, each from 1.6 mm down to 1.3 mm; the least change that fits wins and a name is
      // left out only when none fits (Standard: as before)
      const lmVars = [{ lines: lmWrap0(name), kind: '' }];
      if (TIDY) { const seen = new Set([lmVars[0].lines.join('\n')]), addV = (L, kind) => { if (L && !seen.has(L.join('\n'))) { seen.add(L.join('\n')); lmVars.push({ lines: L, kind }); } };
        for (const [nm, ab] of [[name, false], ...lmAbbr(name).map((x) => [x, true])]) { if (ab) addV(lmWrap0(nm), 'abbr'); for (const k of [2, 3]) addV(lmWrapN(nm, k), ab ? 'abbr+wrap' : 'wrap'); } }
      const nr = nearestRoad(R.roads, q0, 45), u = nr ? nr.dir : [1, 0], rd = readable(deg(u)), ru = [Math.cos(rd * Math.PI / 180), Math.sin(rd * Math.PI / 180)], rv = [-ru[1], ru[0]];
      const cands = [];
      // v2.39.1: the whole text off the roads; when nothing is free close by, a little further (to 20 m), then smaller (2.0)
      // v2.42.10: a size smaller (2 m, else 1.6 m: they crowded the plan), and their boxes as wide as AutoCAD draws the capitals, two
      // lines as tall as AutoCAD spaces them (the names overlapped one another in AutoCAD)
      let c = null, used = lmVars[0]; const allC = []; // (beta 3.8: every place tried, for Always)
      const B1 = [0, 4, -4, 8, -8, 12, -12], A1 = [0, 5, -5, 10, -10], B2 = [16, -16, 20, -20], A2 = [0, 5, -5, 10, -10, 15, -15], B3 = [0, 3.5, -3.5, 7, -7, 10.5, -10.5, 14, -14, 17.5, -17.5], A3 = [0, 4, -4, 8, -8, 12, -12], sv = (L) => L.map((v) => v * LS);
      const B4 = [0, 5, -5, 10, -10, 15, -15, 20, -20, 25, -25], A4 = [0, 6, -6, 12, -12, 18, -18]; // (beta 6.0: Tidy: the smallest sizes a little further too)
      const LAD = TIDY ? [[LM_MM(1.6), sv(B1), sv(A1)], [LM_MM(1.6), sv(B2), sv(A2)], [LM_MM(1.6), sv(B3), sv(A3)], [LM_MM(1.45), sv(B4), sv(A4)], [LM_MM(1.3), sv(B4), sv(A4)]] : [[2.0, B1, A1], [2.0, B2, A2], [1.6, B3, A3]];
      for (const [vi, vr] of lmVars.entries()) {
        const wide = vr.lines.reduce((a, b) => (b.length > a.length ? b : a), ''), tall = vr.lines.length;
        for (const [li, [th, B, A]] of LAD.entries()) {
          const bs = useIcon && li === 0 ? [ICON * 0.55 + th * (1 + (5 / 3) * (tall - 1)) * 0.65 + 0.4 * LS, -(ICON * 0.55 + th * (1 + (5 / 3) * (tall - 1)) * 0.65 + 0.4 * LS), ...B] : B;
          for (const b of bs) for (const a of A) { const q = add2(add2(q0, ru, a), rv, b), bx = textBox(q[0], q[1], th, wide, rd, 1, 2); bx.hw *= 1.3; bx.hh = th * (1 + (5 / 3) * (tall - 1)) * 0.65; if (!R.idx.inside(q, -1, -1) && !corners(bx).some((cq) => R.idx.inside(cq, -1, -1)) && inside(bx, W, 1)) cands.push({ q, th, boxes: [bx] }); }
          c = cands.find((x) => !x.boxes.some((bb) => spots.hits(bb) || (useIcon && Spots.hit(bb, ib)))); if (c) { if (TIDY) { if (th < LAD[0][0] - 1e-9) lmStat.shrunk++; else if (li > 0 || dist2(c.q, q0) > 13 * LS) lmStat.moved++; const mm = th * (printK || 0.62) * NU; lmStat.minMm = lmStat.minMm == null ? mm : Math.min(lmStat.minMm, mm); } break; } if (vi === 0) allC.push(...cands); cands.length = 0;
        }
        if (c) { used = vr; if (vr.kind) lmStat[vr.kind === 'wrap' ? 'wrapped' : vr.kind === 'abbr' ? 'abbreviated' : 'abbrWrapped']++; break; }
      }
      if (!c && lmMode === 'always' && allC.length) { c = allC.map((x) => ({ ...x, n: x.boxes.reduce((t, bb) => t + spots.hits(bb), 0) + (x.th < 2 ? 0.1 : 0) })).sort((a, b) => a.n - b.n)[0]; poisAlways++; } // (beta 3.8: Always: where it covers least)
      if (!c) { poiSkip.noRoom++; if (TIDY && useIcon) { o.insert(LMLAY, ic, q0[0], q0[1], { scale: ICON }); spots.add(ib); nIcons++; } continue; } // (beta 6.0: Tidy: its icon kept where it fits)
      if (useIcon) { o.insert(LMLAY, ic, q0[0], q0[1], { scale: ICON }); spots.add(ib); nIcons++; }
      o.mtext(lay('House Number', 'MISC'), c.q[0], c.q[1], c.th, used.lines.map(mtextEsc).join('\\P'), { style: 'PDF Arial', att: 5, color: 7, dir: ru }); spots.add(c.boxes); placed.push({ name, q: q0 }); nPois++;
    }
    /* beta 4.7: Tidy: a loop's length, an ID or a span length the steps before left over another text (their place was worked out
       narrower than AutoCAD draws capitals, e.g. a loop's length over a dummy NAP's ID): slid a little along its line or out from it
       (8 m at most), where it covers nothing (Standard keeps them as they are). beta 4.8: the texts as they are now (the Tidy labels
       are placed before the span lengths and the rest: see the end of step 8); a Tidy label itself is not moved. */
    if (tidy) {
      scanTexts(); const { tx, txR, tRecs, gv } = TX;
      const NUDGE_W = (t) => (t === 'road' ? 0 : 1);
      for (const M of tRecs.slice().reverse()) { // (the later first: the one placed last moves)
        M.rb._k--; const over = txR.hits(M.rb); M.rb._k++; if (!over) continue; // (only a text that really overlaps another: its real size, not the margin)
        M.bx._k--;
        const own = spots.list.filter((b) => b._k > 0 && Math.hypot(b.cx - M.bx.cx, b.cy - M.bx.cy) < M.h0 * 0.5 && Math.abs(b.ux * M.u[1] - b.uy * M.u[0]) < 0.05 && Math.abs(b.hh - M.bx.hh) < M.h0 * 0.35 && b.hw < M.bx.hw * 1.6 + M.h0); // (its own place, kept by the step that wrote it: a text's box, not the cable beside it)
        own.forEach((b) => { b._k--; });
        const v = [-M.u[1], M.u[0]], tries = []; for (const sa of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 8, -8]) for (const sv of [0, 1, -1, 2, -2, 3.5, -3.5, 5, -5, 7, -7]) if ((sa || sv) && Math.hypot(sa, sv) <= 8) tries.push([sa, sv]); // (8 m at most)
        tries.sort((x, y) => Math.abs(x[0]) + 1.5 * Math.abs(x[1]) - Math.abs(y[0]) - 1.5 * Math.abs(y[1]));
        const ok = tries.find(([sa, sv]) => { const d0 = [M.u[0] * sa + v[0] * sv, M.u[1] * sa + v[1] * sv], nb2 = { ...M.bx, cx: M.bx.cx + d0[0], cy: M.bx.cy + d0[1] }; return !tx.hits(nb2) && !spots.hitsW(nb2, NUDGE_W) && cellHolds({ ...nb2, hw: nb2.hw / 1.3 }, M.x0, M.y0); });
        if (!ok) { own.forEach((b) => { b._k++; }); M.bx._k++; continue; }
        const d0 = [M.u[0] * ok[0] + v[0] * ok[1], M.u[1] * ok[0] + v[1] * ok[1]], mv = (c, dd) => setFirst(M.r, c, F(+gv(M.r, c, 0) + dd));
        mv(10, d0[0]); mv(20, d0[1]); if (gv(M.r, 11, null) != null) { mv(11, d0[0]); mv(21, d0[1]); }
        { const r = idLeadOf.get(M.r); if (r) { const k = r.map((x, i) => (x[0] === 10 ? i : 0)).filter(Boolean)[1]; if (r[k + 1][0] === 20) { r[k] = [10, F(+r[k][1] + d0[0])]; r[k + 1] = [20, F(+r[k + 1][1] + d0[1])]; } } } // (an ID's own thin line back to its block: its end follows the ID)
        M.bx = tx.add(Spots.box(M.bx.cx + d0[0], M.bx.cy + d0[1], M.bx.hw * 2, M.bx.hh * 2, M.a * 180 / Math.PI)); M.x0 += d0[0]; M.y0 += d0[1]; M.rb._k--; M.rb = txR.add(Spots.box(M.rb.cx + d0[0], M.rb.cy + d0[1], M.rb.hw * 2, M.rb.hh * 2, M.a * 180 / Math.PI));
        spots.add(Spots.box(M.bx.cx, M.bx.cy, M.bx.hw * 2, M.bx.hh * 2, M.a * 180 / Math.PI), 'label'); (T7.moved || (T7.moved = [])).push(`${gv(M.r, 1, '')} ${ok.join(',')}`);
      }
      { // beta 6.0: the pairs of texts still over each other at their real size (not two of one Tidy label, not a number's shadow), for build's choice of grid
        scanTexts(); const A = TX.all.filter((x) => +TX.gv(x.r, 62, 0) !== 250), cs = 25, cel = new Map(), seen = new Set(); let nOv = 0;
        A.forEach((x, i) => { const R0 = Math.hypot(x.b.hw, x.b.hh); for (let a = Math.floor((x.b.cx - R0) / cs); a <= Math.floor((x.b.cx + R0) / cs); a++) for (let c = Math.floor((x.b.cy - R0) / cs); c <= Math.floor((x.b.cy + R0) / cs); c++) { const k = a + ',' + c; (cel.get(k) || cel.set(k, []).get(k)).push(i); } });
        for (const L of cel.values()) for (let p = 0; p < L.length; p++) for (let q = p + 1; q < L.length; q++) { const i = L[p], j = L[q], k = i < j ? i * 1e6 + j : j * 1e6 + i; if (seen.has(k)) continue; seen.add(k);
          const gi = tidyGrp.get(A[i].r), gj = tidyGrp.get(A[j].r); if (gi && gi === gj) continue; if (Spots.hit(A[i].b, A[j].b)) nOv++; }
        T7.textsOver = nOv; if (rep._grid) rep._grid.ov = nOv; }
      rep.tidy = T7;
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
      // v2.42.10: aerial a red broken line, underground a solid red line (existing: blue); the dashes about three times the line's
      // width on the sheet (the sheets scale line types to paper, PSLTSCALE 1: the dash was 30 times the map's line before)
      const vL = S.layouts.find((x) => x.name === vicNames[lk]), vvp = vL && bigVp(vL), kv = (vvp ? num(vvp, 41, 400) : 400) / (vic[2] || 1500);
      const dash0 = (() => { const lt = S.T.find((r) => typ(r) === 'LTYPE' && get(r, 2) === vlt), d0 = lt ? Math.abs(num(lt, 49, 0.5)) : 0.5; return d0 > 0 ? d0 : 0.5; })();
      const vlts = Math.max(0.5, (3 * rw * kv) / dash0);
      for (const ch of lch) if (ch.line && ch.line.length > 1) o.lwpoly(VLAY, ch.line.map(vsh), { w: rw, color: VS.route || (ch.existing ? 5 : 1), lt: ch.ug ? null : vlt, lts: vlt && !ch.ug ? vlts : 0, gen: true });
      if (!lch.some((ch) => ch.line && ch.line.length > 1)) { // a place with no cable route (points not linked yet): a dot at each point, as before
        const vDot = (q, r, col) => o.lwpoly(VLAY, [[q[0] - r / 2, q[1], 1], [q[0] + r / 2, q[1], 1]], { closed: true, w: r, ...col }); // a filled disc of radius r
        for (const p of lpts) { if (p.el === 'NAP' || p.el === 'Closure') continue; const q = vsh(p.dp || [p.E, p.N]); vDot(q, 14 * vk, WHITE); vDot(q, 9.5 * vk, { color: 1 }); } }
      { const dps = lpts.map((p) => p.dp || [p.E, p.N]), xs = dps.map((q) => q[0]), ys = dps.map((q) => q[1]);
        const vc = Array.isArray(v.circle) && v.circle.length === 3 ? v.circle : null;
        const c = vsh(vc ? [vc[0], vc[1]] : [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
        // v2.41: the circle yellow again on every map (v2.40: red over a street map), its colour and width as the user set them
        const rad = vc ? vc[2] : Math.max(70 * vk, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 45 * vk), col = VS.circle || 2;
        const area = VS.area !== false, lbl = String(VS.label == null ? 'PROJECT AREA' : VS.label).replace(/\s+/g, ' ').trim().slice(0, 40); // beta 3.9: the project area shown or not; its label (blank: none) and height
        if (area) o.lwpoly(VLAY, [[c[0] - rad, c[1], 1], [c[0] + rad, c[1], 1]], { closed: true, w: VS.circleW * vk, color: col });
        if (area && lbl) { const lh = Math.max(8, Math.min(40, +VS.lh || 18)) * vk, lw = lbl.length * lh * 0.74, ly = c[1] + rad + 8 * vk + lh * 0.9; // the label on a dark box, framed
          o.lwpoly(VLAY, [[c[0] - lw / 2 - lh * 0.6, ly - lh * 0.9], [c[0] + lw / 2 + lh * 0.6, ly - lh * 0.9], [c[0] + lw / 2 + lh * 0.6, ly + lh * 0.9], [c[0] - lw / 2 - lh * 0.6, ly + lh * 0.9]], { closed: true, w: 2 * vk, color: 2 });
          o.mtext(VLAY, c[0], ly, lh, mtextEsc(lbl), { att: 5, style: 'arial', color: 2, mask: 250 }); }
        if (!lk && area) rep.vicinityMark = { r: rad, label: lbl };
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
      // v2.42.10: the keymap's own cell names on the keymap only; there, not the small corner names
      if (kmNames.includes(L.name)) vpFreeze(vp, [layerH(lay('GRIDNO.', 'GRIDNO'))].filter(Boolean)); else if (layerH(KMLAY)) vpFreeze(vp, [layerH(KMLAY)]);
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
    const idx = (nm, di, dj) => { const k = geoNames(N).indexOf(nm); if (k < 0) return '';
      const c = geoCells[k], kk = key(c.i + di, c.j + dj); return sheetOf.has(kk) ? cellName(c.i + di, c.j + dj) : ''; };
    const auto = {
      SHEET_NO: (sh) => { const k = geoNames(N).indexOf(sh); return k >= 0 ? `${k + 1} OF ${N}` : '1 OF 1'; },
      DATE: () => dateText(job.date || new Date()),
      SCALE: (sh) => (geoNames(N).includes(sh) ? `1 : ${(NU > 1 ? Math.round(viewH / 400 * 1000) : viewH / 400 * 1000).toLocaleString('en-US')} METERS` : kmNames.includes(sh) ? `1 : ${(Math.round(kmH[kmNames.indexOf(sh)] / 400 * 1000 / 100) * 100).toLocaleString('en-US')} METERS` : vicNames.includes(sh) ? `1 : ${(Math.round(vics[vicNames.indexOf(sh)].area[2] / 400 * 1000 / 100) * 100).toLocaleString('en-US')} METERS` : ''),
      IDX_TL: (sh) => idx(sh, -1, 1), IDX_T: (sh) => idx(sh, 0, 1), IDX_TR: (sh) => idx(sh, 1, 1), IDX_L: (sh) => idx(sh, -1, 0), IDX_C: (sh) => idx(sh, 0, 0), IDX_R: (sh) => idx(sh, 1, 0), IDX_BL: (sh) => idx(sh, -1, -1), IDX_B: (sh) => idx(sh, 0, -1), IDX_BR: (sh) => idx(sh, 1, -1),
      TOC_GEO: () => String(N), TOC_LEGEND: () => String(sheetNames.filter((n) => /^LEGENDS?( \(\d+\))?$/.test(n)).length), TOC_TOTAL: () => String(sheetNames.filter((n) => n !== 'Model').length),
    };
    const blanks = new Set(), filled = new Set(), rowCells = [], idxTexts = new Set(), filledM = new Set(), locTexts = new Set(), sigTexts = new Set();
    const fill = (r, sheet, inBlockText) => {
      const t = typ(r); if (t !== 'TEXT' && t !== 'MTEXT') return;
      const txt = (t === 'MTEXT' ? all(r, 3).join('') : '') + (get(r, 1) || ''); if (txt.indexOf('@@') < 0) return;
      const ctx = sheet || (inBlockText ? 'PAGING' : 'MODEL');
      const val = (k) => { const v = V[k]; return v && typeof v === 'object' && !Array.isArray(v) ? (v[ctx] != null ? v[ctx] : v['*']) : v; };
      const none = (v) => v == null || v === '' || (Array.isArray(v) && !v.filter((x) => x != null && String(x) !== '').length);
      // v2.42.12: on the title sheet, the line of the location (given for the title blocks only) is left out when it is blank there:
      // the site's name moves one line up (an empty line sat between the project type and it)
      const src0 = t === 'MTEXT' && sheet === 'TITLE' ? txt.replace(/@@LOCATION@@\\P/g, (m) => (none(val('LOCATION')) ? '' : m)) : txt;
      if (t === 'MTEXT' && ctx === 'PAGING' && src0.includes('@@LOCATION@@')) locTexts.add(r); // v2.42.12: fitted to its box below
      if (t === 'MTEXT' && /@@SIG_\w+@@/.test(src0)) sigTexts.add(r); // v2.42.12: a name fitted to its cell below
      // v2.34: a value given as lines (an array) is written one per line, without the template's brackets round the field
      const nt = src0.replace(/\((@@(\w+)@@)\)/g, (m, tok, k) => (Array.isArray(val(k)) && t === 'MTEXT' ? tok : m)).replace(/@@(\w+)@@/g, (m, k) => {
        const plain = !(V[k] && typeof V[k] === 'object'); let v = val(k);
        if (Array.isArray(v)) v = v.filter((x) => x != null && String(x) !== '').map(String);
        if ((v == null || v === '' || (Array.isArray(v) && !v.length)) && auto[k]) v = auto[k](sheet);
        if (v == null) v = '';
        if (Array.isArray(v) ? v.length : v !== '') filled.add(k); else blanks.add(k);
        if (t === 'TEXT' && /^IDX_/.test(k)) idxTexts.add(r); // v2.42.9: fitted to its cell below
        if (Array.isArray(v)) return t === 'MTEXT' ? v.map(mtextEsc).join('\\P') : v.join(' / ');
        v = String(v);
        if (t === 'MTEXT' && /^ROW_(BARANGAY|MUNICIPALITY)_\d$/.test(k) && v) rowCells.push([r, v]); // v2.35: fitted to its cell below
        if (t === 'MTEXT') { v = mtextEsc(v); if (plain && k === 'LOCATION' && inBlockText && v.includes('_')) { const q = v.lastIndexOf('_'); v = `${v.slice(0, q + 1)}\\P${v.slice(q + 1)}`; } }
        return v;
      });
      if (t === 'MTEXT') filledM.add(r);
      if (t === 'MTEXT') { // the text is the 3 chunks then the 1: replaced in place
        const first = r.findIndex((p, i) => i > 0 && (p[0] === 3 || p[0] === 1)), one = r.findIndex((p, i) => i > 0 && p[0] === 1);
        const chunks = []; for (let i = 0; i < nt.length; i += 250) chunks.push(nt.slice(i, i + 250)); if (!chunks.length) chunks.push('');
        r.splice(first, one - first + 1, ...chunks.slice(0, -1).map((c) => [3, c]), [1, chunks[chunks.length - 1]]);
      } else setFirst(r, 1, nt);
    };
    // v2.42.9: the Exported by line (put by the seed tool at 6478, -6209.5 on each sheet) starts after the sheet's CONFIDENTIAL line,
    // which AutoCAD draws wider than the seed tool reckoned (ROMANS): the two overlapped
    for (const L of S.layouts) { if (L.name === 'Model') continue; for (const r of layoutEnts(d, S, L)) if (typ(r) === 'MTEXT' && textOf(r).includes('@@EXPORTED_BY@@') && Math.abs(num(r, 10, 0) - 6478) < 0.5 && Math.abs(num(r, 20, 0) + 6209.5) < 0.5) setFirst(r, 10, F(6508)); }
    for (const L of S.layouts) { if (L.name === 'Model') continue; for (const r of layoutEnts(d, S, L)) fill(r, L.name, L.name === 'TITLE'); }
    if (paging) for (const r of S.blocks.get('PAGING').ents) fill(r, null, true);
    { // 2.44.8: the role under the third signature line of the title block reads PROJECT MANAGER (the template says Head-Cable Engineering), on every sheet
      const roleFix = (r) => { const t = typ(r); if ((t === 'TEXT' || t === 'MTEXT') && /^\s*head\s*[-\u2013]?\s*cable\s+engineering\s*$/i.test(textOf(r))) setText(r, /[a-z]/.test(textOf(r)) ? 'Project Manager' : 'PROJECT MANAGER'); };
      if (paging) for (const r of S.blocks.get('PAGING').ents) roleFix(r);
      for (const L of S.layouts) { if (L.name !== 'Model') for (const r of layoutEnts(d, S, L)) roleFix(r); }
    }
    // v2.34: the plan's title on the title sheet: the template's AFI PLAN, or AS-BUILT PLAN for an As-Built
    if (job.planTitle) { const tl = S.layouts.find((L) => L.name === 'TITLE'); if (tl) for (const r of layoutEnts(d, S, tl)) { const t = typ(r); if ((t === 'MTEXT' || t === 'TEXT') && textOf(r).includes('AFI PLAN')) setText(r, textOf(r).replace(/AFI PLAN/g, t === 'MTEXT' ? mtextEsc(job.planTitle) : job.planTitle)); } }
    for (const r of d.sec('ENTITIES').recs) { const ow = owner(r); if (ow === S.modelH && String(get(r, 67, '0')).trim() !== '1') fill(r, null, false); }
    // v2.42.9: a field's text box (MTEXT width 41) at least as wide as its one line of text: the template's box fits its sample
    // text (DATE: "1 OF 25"), so AutoCAD broke a longer value ("NOVEMBER 4, 2026") over two lines. (The ROW cells: below.)
    { const inRow = new Set(rowCells.map(([r]) => r)), wOf = (str, h) => h * [...str].reduce((a, ch) => a + (/[A-Z]/.test(ch) ? 0.98 : /[0-9]/.test(ch) ? 0.78 : /[a-z]/.test(ch) ? 0.72 : ch === ' ' ? 0.39 : 0.45), 0);
      for (const r of filledM) {
        if (inRow.has(r)) continue; const L = mtextLines(textOf(r)).filter((x) => x.trim()); if (L.length !== 1) continue;
        const k = mtextIdx(r, 41), w = k >= 0 ? parseFloat(r[k][1]) : 0, h = num(r, 40, 0), need = wOf(L[0].trim(), h) * 1.1;
        if (k >= 0 && w > 0 && w < 15 * h && need > w) r[k][1] = F(need); // v2.42.10: a small cell's box only (the cover's cable list wraps in its wide box)
      } }
    // v2.42.9: a sheet's index keys (the 3 x 3 cells of the title block) fitted to their cell: a key such as Q-12 written at the
    // template's height ran into the next cell
    if (idxTexts.size) {
      const byOwner = new Map(); for (const r of idxTexts) { const ow = owner(r) || ''; (byOwner.get(ow) || byOwner.set(ow, []).get(ow)).push(r); }
      const em = (str) => [...String(str)].reduce((a, ch) => a + (/[MW]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.72 : /[0-9]/.test(ch) ? 0.56 : ch === '-' ? 0.34 : 0.5), 0);
      for (const R2 of byOwner.values()) {
        const xs = [...new Set(R2.map((r) => Math.round(num(r, 10, 0) * 100) / 100))].sort((a, b) => a - b), gaps = xs.slice(1).map((x, i) => x - xs[i]).filter((g) => g > 1);
        const pitch = gaps.length ? Math.min(...gaps) : 12.2;
        for (const r of R2) { const w = em(get(r, 1, '')), h = num(r, 40, 0); if (w > 0 && h > 0) { const fit = pitch * 0.9 * 0.716 / w; if (fit < h) setFirst(r, 40, F(fit)); } }
      }
    }
    // v2.42.12: the site's details in the title block (SITENAME_PLAID, then the serial number) fitted to their box: a long name ran
    // past the sheet's frame. Smaller first (to 60 %), then broken after its last "_" and fitted again. The names of the title
    // block's signatures (Design Engineer…) likewise fitted to their cell.
    { const EM = (ch, b) => (/[MW]/.test(ch) ? (ch === 'M' ? 0.833 : 0.944) : /[IJ]/.test(ch) ? (ch === 'I' ? 0.278 : 0.556) : /[EFLTZ]/.test(ch) ? 0.611 : /[GOQ]/.test(ch) ? 0.778 : /[PS]/.test(ch) ? 0.667 : /[A-Z]/.test(ch) ? 0.722
        : /[0-9_]/.test(ch) ? 0.556 : /[ijl]/.test(ch) ? 0.278 : /[ft]/.test(ch) ? 0.333 : /[mw]/.test(ch) ? (ch === 'm' ? 0.889 : 0.778) : /[a-z]/.test(ch) ? (b ? 0.611 : 0.556) : /[ .,]/.test(ch) ? 0.278 : 0.333) * (b && /[A-Z]/.test(ch) ? 1 : b ? 1.02 : 0.93);
      const wOfL = (str, h, b) => [...String(str)].reduce((a, ch) => a + EM(ch, b), 0) * h / 0.716; // (h: the capitals' height)
      for (const r of locTexts) {
        const h = num(r, 40, 0), k = mtextIdx(r, 41), w = k >= 0 ? parseFloat(r[k][1]) || 0 : 0; if (!(h > 0 && w > 0)) continue;
        // the room: the text is centred on its box (41), so twice the distance from the box's middle to the nearer side of its cell
        const att = parseInt(get(r, 71, '1'), 10) || 1, ci = (att - 1) % 3, cx = num(r, 10, 0) + (ci === 0 ? w / 2 : ci === 2 ? -w / 2 : 0), cy = num(r, 20, 0) - (att <= 3 ? h * 0.6 : att >= 7 ? -h * 0.6 : 0);
        const pgE = S.blocks.get('PAGING'), cb = pgE && owner(r) === get(S.brByName.get('PAGING') || [], 5) ? cellOf(pgE.ents, cx, cy) : null;
        const avail = (cb && cb.x1 - cb.x0 < w * 1.5 ? Math.min(w, 2 * Math.min(cx - cb.x0, cb.x1 - cx)) : w) * 0.96, bold = /\\f[^;|]*\|b1/i.test(textOf(r)), need = () => Math.max(0, ...mtextLines(textOf(r)).map((x) => wOfL(x.trim(), h, bold)));
        let n = need();
        if (n > avail / 0.6) { // too long even at 60 %: broken after its last "_" (the name, then the PLA ID)
          const L0 = mtextLines(textOf(r)).map((x) => x.trim()).filter(Boolean), long = L0.reduce((a, b) => (wOfL(b, h, bold) > wOfL(a, h, bold) ? b : a), ''), q = long.lastIndexOf('_');
          if (q > 0 && q < long.length - 1) { const raw = textOf(r), i = raw.indexOf(long); if (i >= 0) { setText(r, raw.slice(0, i + q + 1) + '\\P' + raw.slice(i + q + 1)); n = need(); } }
        }
        if (n > avail) setFirst(r, 40, F(Math.max(h * 0.45, h * avail / n)));
      }
      const ownerEnts = new Map(); for (const L of S.layouts) { if (L.name !== 'Model') ownerEnts.set(L.brh, () => layoutEnts(d, S, L)); }
      const sigAll = [...sigTexts];
      for (const r of sigTexts) {
        const h = num(r, 40, 0), L = mtextLines(textOf(r)).map((x) => x.trim()).filter(Boolean); if (!(h > 0) || !L.length) continue;
        const ents = ownerEnts.get(owner(r)), x = num(r, 10, 0), y = num(r, 20, 0), box = ents ? cellOf(ents(), x, y + h * 0.6) : null;
        // the room: up to the next signature of its row (their names are centred on their lines), within the title block's panel
        const dxs = sigAll.filter((o) => o !== r && owner(o) === owner(r) && Math.abs(num(o, 20, 0) - y) < 1).map((o) => Math.abs(num(o, 10, 0) - x)).filter((v) => v > 1);
        const edge = box ? 2 * Math.min(x - box.x0, box.x1 - x) : Infinity, avail = Math.min(dxs.length ? Math.min(...dxs) : Infinity, edge, 200) * 0.92, n = Math.max(...L.map((s1) => wOfL(s1, h, false)));
        if (n > avail) setFirst(r, 40, F(Math.max(h * 0.45, h * avail / n)));
      } }
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
    let tablesBox = null;
    /* 6. v2.36: the template's tables in model space (legend, ROW table, project management table) moved right beside the plan,
       in a row below the key map grid and the vicinity map, instead of where the template has them (about 1,100 km from the
       plan's UTM coordinates); the sheets that show them follow. The plan itself stays at its true UTM coordinates. */
    {
      const vps = (L) => layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').slice(1).filter((e) => parseInt(get(e, 69, '0'), 10) !== 1 && num(e, 40, 0) > 0 && num(e, 45, 0) > 0); // the first is the sheet itself
      const win = (vp) => { const cx = num(vp, 17, 0) + num(vp, 12, 0), cy = num(vp, 27, 0) + num(vp, 22, 0), h = num(vp, 45, 0), w = h * num(vp, 40, 1) / (num(vp, 41, 1) || 1); return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; };
      const groups = /** @type {any[]} */ ([]);
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
      // below the grid, the vicinity maps and what the keymap sheets show; v2.42.8: and below whatever of the plan reaches lower (a
      // label, a photo), the row ending at the grid's right edge (a row wider than the grid starts at its left edge)
      const GAP = 60, inGroup = new Set(away.flatMap((g) => g.recs));
      let low = Math.min(gy0, ...vics.map((v) => v.sb[1]), ...kmBox.map((b, k) => (b[1] + b[3]) / 2 - kmH[k] / 2));
      for (const r of model) { if (inGroup.has(r)) continue; const b = drawnBox(S, r); if (b && b[1] < low && b[3] >= planBox[1] && b[1] <= planBox[3] && b[2] >= planBox[0] && b[0] <= planBox[2]) low = b[1]; }
      const rowW = away.reduce((a, g) => a + g.ext[2] - g.ext[0], 0) + GAP * Math.max(0, away.length - 1);
      const top = low - GAP; let x = rowW <= gx1 - gx0 ? gx1 - rowW : gx0, moved = 0;
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
        const b = [g.ext[0] + dx, g.ext[1] + dy, g.ext[2] + dx, g.ext[3] + dy];
        tablesBox = tablesBox ? [Math.min(tablesBox[0], b[0]), Math.min(tablesBox[1], b[1]), Math.max(tablesBox[2], b[2]), Math.max(tablesBox[3], b[3])] : b;
        x += g.ext[2] - g.ext[0] + GAP;
      }
      rep.tablesMoved = { groups: away.map((g) => [...g.names].join(' / ')), entities: moved, box: tablesBox };
    }
    { const lw = d.headerVar('$LWDISPLAY'); if (lw) lw[1] = I(1); } // v2.36: line weights shown on screen (the cable's thickness)
    rep.blanks = [...blanks].filter((k) => !filled.has(k) && !/^IDX_/.test(k)).sort(); // an empty index key = no sheet on that side, not a missing field
    rep.partly = [...blanks].filter((k) => filled.has(k)).sort();
    if (job.debug) rep.pts = pts.map((p) => ({ id: p.id, poleId: p.poleId, el: p.el, dp: p.dp, A: p.A, kept: !!p.kept, moved: p.moved || 0, onPole: p.onPole ? p.onPole.id : null }));
    if (job.debug) rep.inline = [...inl.values()].map((it) => ({ b: it.b, at: it.at, hl: it.hl, hlo: it.hlo, hhi: it.hhi, hh: it.hh, sc: it.sc, rot: it.rot, box: blockBox(S, it.b, 0), boxT: blockBoxT(S, it.b), c: blockCenter(S, it.b) }));
    if (TIDY) rep.landmarks = { placed: nPois, shrunk: lmStat.shrunk, moved: lmStat.moved, namesLeftOut: poiSkip.noRoom, wrapped: lmStat.wrapped, abbreviated: lmStat.abbreviated, abbreviatedAndWrapped: lmStat.abbrWrapped, smallestMm: lmStat.minMm == null ? null : +lmStat.minMm.toFixed(2) }; // beta 6.0
    if (WANT_RD) rep.cableRoute = { roads: R.roads.filter((r) => r.hw > 0).length, ...Object.fromEntries(Object.entries(routeLen).map(([k, g]) => [k, { spans: g.spans, following: g.bent, straightM: +g.straight.toFixed(1), drawnM: +g.road.toFixed(1), longerM: +(g.road - g.straight).toFixed(1), longerPct: g.straight ? +(100 * (g.road - g.straight) / g.straight).toFixed(2) : 0, followingSpans: g.list }])) }; // beta 6.1: the drawn lines against the straight ones (the written lengths are the measured ones)
    rep.counts = { ...o.n, ...(nExArm ? { existingArms: nExArm } : {}), /* beta 6.7 */ cableLeaders: nLeaders, cableLabelsSmall: nSmall, closuresOnCable: nCloInl, ...(nCloOff ? { closuresAway: nCloOff } : {}), namesInCell: nInCell, roads: nRoads, roadEdges: R.edges.length, pois: nPois, poisGiven: (job.pois || []).length, poisOutside: poiSkip.outside, poisDuplicate: poiSkip.dup, poisNoRoom: poiSkip.noRoom, poisHidden: poiSkip.hidden || 0, poisAlways: typeof poisAlways === 'number' ? poisAlways : 0, idsMovedAuto: nAutoIds, /* beta 3.8 */ landmarkIcons: nIcons, geoSheets: N, gridCells: cellsI * cellsJ, polesMoved: pts.filter((p) => p.moved > 0.05).length, polesOffRoadLine: nCleared, polesKept: pts.filter((p) => p.kept).length, inlineBlocks: nInline, odc: nOdc, olt: nOlt, poleToPole: nP2P, grounding: nGround, risers: nRiser, loops: nLoop, hdd: nHdd, cableNames: nCableNames, napsOnPoles: pts.filter((p) => p.el === 'NAP' && p.onPole).length, telcoArms: nTelco };
    /* beta 6.0 (the owner: "the bill of quantities on each grid … a slice per grid of the PMI as the total … only add the span length of
       each foc wherever the span length falls per grid"): on every GEO sheet a BILL OF QUANTITIES table with the PMI table's rows, each
       counting what lies on that sheet's grid cell: a span whole on the sheet where its length is written (else where its middle is), a
       loop, a pole, a new ODF's fibers or a new closure where its point is (job.pmiItems, from the app, by the PMI's own rules). The
       lengths rounded so the sheets add up to the PMI's figure; rows the PMI leaves blank stay blank. In the sheet's right-hand box
       above the title block's fields. */
    /* beta 6.0 (the owner: "count them also and populate the table"): the six PMI rows the survey left blank, from the plan itself:
       PROPOSED HDD: the new bores where a new underground cable crosses a road (as drawn: the road's width and 3 m each side), metres;
       PROPOSED OPEN TRENCH: the conventional UG cable's route (each span once) less its bores; PROPOSED MICRO TRENCH: the air-blown UG
       cable's (microducts), likewise; MAXCELL INNER DUCT: the conventional UG cable's route, bores included; PROPOSED MANHOLE / SERVICE BOX:
       the new ones. Written into the template's PMI table (its empty quantity cells) and, sliced by grid, into each sheet's table. */
    /* beta 6.7 (the owner: "allow a selection by the user … hdd is machine drill by default and airblown fiber is used by default but for
       non airblown, it should be Trench (open, shallow w/ concrete or w/out)"): each UG span is laid as its cable says (span.ug.m, from the
       app: the first new UG cable on it): 'hdd' (the default for air-blown fiber): the whole span in PROPOSED HDD, its road crossings with
       it; 'open' (conventional UG's default), 'shc' / 'sh' (shallow trench with / without concrete) or 'micro': that trench, less the
       road crossings, which stay PROPOSED HDD bores as before. MAXCELL INNER DUCT: the conventional UG cable's route, as before. The
       shallow trenches have no row in the template's PMI: a row of their own is added (as the RTA rows are) when there is any.
       The conduit (span.ug.cd mm, span.ug.cr runs): a PROPOSED CONDUIT row for each size and runs used, its route metres (added as
       the shallow trenches are), and rep.ugConduit for the README. A span's own way (span.ug.own: set on the span) counts as its RUN's. */
    const UGV = { PMI_HDD: 0, PMI_OPEN_TRENCH: 0, PMI_MICRO_TRENCH: 0, PMI_SHALLOW_TRENCH_C: 0, PMI_SHALLOW_TRENCH: 0, PMI_MAXCELL_INNER_DUCT: 0, PMI_MANHOLE: 0, PMI_SERVICE_BOX: 0 }, ugPI = { spans: [], points: [] }, ugCd = {}, ugBy = {};
    { const segD = (q, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L2)) : 0; return Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); };
      const UGM = { hdd: 'PMI_HDD', open: 'PMI_OPEN_TRENCH', micro: 'PMI_MICRO_TRENCH', shc: 'PMI_SHALLOW_TRENCH_C', sh: 'PMI_SHALLOW_TRENCH' };
      const ugSp = spans.map((s0) => { const P = byId.get(String(s0.ia)), Q = byId.get(String(s0.ib)), ug = [s0.cable, ...(s0.more || [])].filter((k) => k != null && (CABLE_STYLE[k] || CABLE_STYLE['']).aerial === false), conv = ug.some((k) => /^CU/.test(k)), u0 = s0.ug || {};
        return P && Q && ug.length ? { s0, P, Q, conv, hdd: 0, bores: [], m: UGM[u0.m] ? u0.m : conv ? 'open' : 'hdd', cd: ['32', '50', '114.3'].includes(String(u0.cd)) ? String(u0.cd) : '114.3', cr: +u0.cr === 1 ? 1 : 2 } : null; }).filter(Boolean);
      for (const h of hddAt) { let bS = null, bd = Infinity; for (const u of ugSp) { const d0 = segD(h.x, u.P.A || [u.P.E, u.P.N], u.Q.A || [u.Q.E, u.Q.N]); if (d0 < bd) { bd = d0; bS = u; } }
        if (bS && bd < 15) { bS.hdd += h.L; bS.bores.push(h); if (bS.m === 'hdd') continue; } // (a drilled span counts whole below, its crossings with it)
        UGV.PMI_HDD += h.L; ugPI.points.push({ at: h.x, v: { PMI_HDD: h.L } }); }
      for (const u of ugSp) { const Lw = Math.round(+u.s0.len || 0), K = UGM[u.m], v = u.m === 'hdd' ? { PMI_HDD: Lw } : { [K]: Math.max(0, Lw - u.hdd) }; /* (beta 6.4: the span as its length is written on the plan) */
        if (u.conv) v.PMI_MAXCELL_INNER_DUCT = Lw;
        const ck = `${u.cr}x${u.cd}`, cdK = `PMI_CONDUIT_${ck.replace('.', '_')}`; v[cdK] = Lw; // (beta 6.7: the owner: "PMI rows, not just the README": the conduit's route metres by size and runs)
        for (const [k, x] of Object.entries(v)) UGV[k] = (UGV[k] || 0) + x; ugPI.spans.push({ ia: u.s0.ia, ib: u.s0.ib, v });
        ugCd[ck] = (ugCd[ck] || 0) + Lw; ugBy[u.m] = (ugBy[u.m] || 0) + Lw; }
      rep.ugConduit = Object.fromEntries(Object.entries(ugCd).map(([k, v]) => [k, Math.round(v * 10) / 10])); rep.ugLaid = { ...ugBy }; // beta 6.7: the README's conduit by size and runs, and each method's span lengths
      for (const p of pts) if ((p.status === 'Proposed' || p.status === 'New') && (p.el === 'Manhole' || p.el === 'Service box')) { const k = p.el === 'Manhole' ? 'PMI_MANHOLE' : 'PMI_SERVICE_BOX'; UGV[k]++; ugPI.points.push({ id: p.id, v: { [k]: 1 } }); } }
    // beta 6.6 (the owner: "PMI must should add automatically the poles RTA"): an RTA row for each other pole owner (job.pmiExtraRows [label, key], from the app)
    const PMI_UGX = [['PROPOSED SHALLOW TRENCH W/ CONCRETE', 'PMI_SHALLOW_TRENCH_C', 'm'], ['PROPOSED SHALLOW TRENCH W/O CONCRETE', 'PMI_SHALLOW_TRENCH', 'm']].filter(([, k]) => UGV[k] > 0); // beta 6.7: added when used
    // beta 6.7: a row for each conduit used (size and runs), its route metres (the pipe metres, route × runs, are in the README); the largest first
    const PMI_CDX = Object.keys(ugCd).sort((x, y) => parseFloat(y.split('x')[1]) - parseFloat(x.split('x')[1]) || +y.split('x')[0] - +x.split('x')[0]).map((ck) => { const [r, c] = ck.split('x'); return [`PROPOSED CONDUIT ${c}MM X ${r} RUN${+r > 1 ? 'S' : ''}`, `PMI_CONDUIT_${ck.replace('.', '_')}`, 'm']; });
    const PMI_XRTA = (Array.isArray(job.pmiExtraRows) ? job.pmiExtraRows : []).filter((x) => Array.isArray(x) && x[0] && x[1]).slice(0, 8).map(([lb, k]) => [String(lb).toUpperCase().slice(0, 40), String(k)]);
    const PMI_XROWS = PMI_XRTA.concat(PMI_UGX.map(([lb, k]) => [lb, k]), PMI_CDX.map(([lb, k]) => [lb, k])); // (the rows added at the foot of the template's PMI table: the RTA rows, then the shallow trenches and the conduits)
    const ugVals = Object.fromEntries(Object.entries(UGV).map(([k, v]) => [k, /MANHOLE|SERVICE_BOX/.test(k) ? String(v) : `${(Math.round(v * 10) / 10).toFixed(1)}m`]));
    { // the template's PMI table (model space): each of these rows' quantity cell, where the template has it empty
      const ENT = d.sec('ENTITIES').recs, norm = (x) => String(x).replace(/\\[A-Za-z][^;]*;|[{}]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      const tx0 = ENT.filter((r) => (typ(r) === 'MTEXT' || typ(r) === 'TEXT') && get(r, 330) === S.modelH && String(get(r, 67, '0')).trim() !== '1');
      const lab = (want) => tx0.find((r) => norm(textOf(r)) === want), xOf = (r) => num(r, 10, 0), yOf = (r) => num(r, 20, 0), hOf = (r) => num(r, 40, 1);
      const qh = lab('QUANTITY'), ref = lab('TOTAL CABLE LENGTH'), pmiFill = []; let refV = null;
      if (ref && qh) refV = tx0.filter((r) => r !== ref && Math.abs(yOf(r) - yOf(ref)) < 0.6 * hOf(ref) && xOf(r) > xOf(ref)).sort((a2, b2) => Math.abs(xOf(a2) - xOf(qh)) - Math.abs(xOf(b2) - xOf(qh)))[0] || null;
      if (refV) for (const [want, k] of [['PROPOSED HDD', 'PMI_HDD'], ['PROPOSED OPEN TRENCH', 'PMI_OPEN_TRENCH'], ['PROPOSED MICRO TRENCH', 'PMI_MICRO_TRENCH'], ['MAXCELL INNER DUCT', 'PMI_MAXCELL_INNER_DUCT'], ['PROPOSED MANHOLE', 'PMI_MANHOLE'], ['PROPOSED SERVICE BOX', 'PMI_SERVICE_BOX']]) {
        const L0 = lab(want); if (!L0) continue; const cellR = tx0.find((r) => r !== L0 && Math.abs(yOf(r) - yOf(L0)) < 0.6 * hOf(L0) && Math.abs(xOf(r) - xOf(refV)) < 0.6 * hOf(refV));
        if (cellR && !norm(textOf(cellR))) { setText(cellR, ugVals[k]); pmiFill.push(want); } }
      rep.pmiFilled = pmiFill;
      /* beta 6.6: the extra RTA rows (PMI_XROWS) added at the foot of the template's PMI table: the same row height, its lines and column
         dividers, the label and quantity cells copied from its last row (a frame polyline drawn down to the new foot) */
      if (PMI_XROWS.length && refV) {
        const PMI_ROWS0 = ['TOTAL CABLE LENGTH', 'AERIAL CABLE LENGTH', 'EXISTING GT POLE', 'PROPOSED POLE', 'RTA CONVERGE', 'RTA LOCAL COOP', 'RTA OTHER (PLDT POLE)', 'UNDERGROUND CABLE LENGTH', 'PROPOSED HDD', 'PROPOSED OPEN TRENCH', 'PROPOSED MICRO TRENCH', 'MAXCELL INNER DUCT', 'PROPOSED MANHOLE', 'PROPOSED SERVICE BOX', 'FIBER TERMINATION', 'PROPOSED HYBRID CLOSURE'], V0x = { ...(job.values || {}), ...ugVals };
        const rowLabs = PMI_ROWS0.map((lb) => lab(lb)).filter(Boolean).sort((a2, b2) => yOf(a2) - yOf(b2)), last = rowLabs[0], prev = rowLabs[1];
        const lastV = last && tx0.find((r) => r !== last && Math.abs(yOf(r) - yOf(last)) < 0.6 * hOf(last) && Math.abs(xOf(r) - xOf(refV)) < 0.6 * hOf(refV));
        const pitch = last && prev ? yOf(prev) - yOf(last) : 0, mdl = ENT.filter((r) => get(r, 330) === S.modelH && String(get(r, 67, '0')).trim() !== '1');
        const hz = mdl.filter((r) => typ(r) === 'LINE' && Math.abs(num(r, 20, 0) - num(r, 21, 0)) < 1e-6 && Math.min(num(r, 10, 0), num(r, 11, 0)) <= xOf(last) && Math.max(num(r, 10, 0), num(r, 11, 0)) >= xOf(refV));
        const below = hz.filter((r) => num(r, 20, 0) < yOf(last)).sort((a2, b2) => num(b2, 20, 0) - num(a2, 20, 0)), above = hz.filter((r) => num(r, 20, 0) > yOf(last) - 0.2 * hOf(last)).sort((a2, b2) => num(a2, 20, 0) - num(b2, 20, 0));
        const fr = mdl.filter((r) => typ(r) === 'LWPOLYLINE' && (parseInt(get(r, 70, '0'), 10) & 1)).map((r) => { const X = all(r, 10).map(Number), Y = all(r, 20).map(Number); return { r, b: [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)] }; }).find((f) => last && f.b[0] <= xOf(last) && f.b[2] >= xOf(refV) && f.b[1] < yOf(last) && f.b[3] > yOf(refV));
        const top = above.length ? num(above[0], 20, 0) : null, bot = below.length ? num(below[0], 20, 0) : fr ? fr.b[1] : null;
        if (last && lastV && pitch > 0 && top != null && bot != null && top > bot) {
          const vt = mdl.filter((r) => typ(r) === 'LINE' && Math.abs(num(r, 10, 0) - num(r, 11, 0)) < 1e-6 && Math.min(num(r, 20, 0), num(r, 21, 0)) <= bot + 1e-6 && Math.max(num(r, 20, 0), num(r, 21, 0)) >= top - 1e-6);
          const cl = (r) => { const c = r.map((x) => [x[0], x[1]]), k5 = c.findIndex((x) => x[0] === 5); if (k5 >= 0) c[k5][1] = d.newHandle(); ENT.push(c); return c; };
          const hl = below[0] || above[0], H0 = top - bot;
          PMI_XROWS.forEach(([lb, k2], i) => { const dy = -(i + 1) * H0, nb = bot - (i + 1) * H0; // (each new row as tall as the last)
            const L1 = cl(last); shiftRec(L1, 0, dy); setText(L1, lb); const V1 = cl(lastV); shiftRec(V1, 0, dy); setText(V1, String(V0x[k2] != null ? V0x[k2] : '0'));
            const h1 = cl(hl); setFirst(h1, 20, F(nb)); setFirst(h1, 21, F(nb));
            for (const v of vt) { const c = cl(v); setFirst(c, 20, F(nb + H0)); setFirst(c, 21, F(nb)); } }); // (its column dividers and edges)
          if (fr) { const nb = bot - PMI_XROWS.length * H0; fr.r.forEach((q) => { if (q[0] === 20 && Math.abs(+q[1] - fr.b[1]) < 1e-6) q[1] = F(nb); }); }
          // the PMI sheet shows them where its window reaches
          const pv = S.layouts.filter((L) => /^PMI/.test(L.name)).flatMap((L) => layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').slice(1)), wn = (vp) => { const cx = num(vp, 17, 0) + num(vp, 12, 0), cy = num(vp, 27, 0) + num(vp, 22, 0), h = num(vp, 45, 0), w = h * num(vp, 40, 1) / (num(vp, 41, 1) || 1); return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; };
          const xa = Math.min(xOf(last), xOf(refV)), xb = Math.max(xOf(last), xOf(refV)), W1 = pv.map(wn).find((w) => Math.max(xa, w[0]) <= Math.min(xb, w[2]) && yOf(last) >= w[1] && yOf(last) <= w[3]), foot = bot - PMI_XROWS.length * H0; // (the window the table is seen through)
          rep.pmiRowsAdded = { rows: PMI_XROWS.map(([lb]) => lb), shown: !W1 || foot >= W1[1] };
          if (W1 && foot < W1[1]) rep.notes.push(`PMI table: the added rows (${PMI_XROWS.map(([lb]) => lb).join(', ')}) reach below the PMI sheet's window: widen its viewport in AutoCAD`);
        } else rep.notes.push(`PMI table: the rows ${PMI_XROWS.map(([lb]) => lb).join(', ')} not added (its last row not found)`);
      } }
    /** beta 6.0 (beta 6.5: a function, for the BOQ table and the RTA/JPA legend): a GEO sheet's right-hand box (paper units), free of the
        title block's fields: { R0: [x0, y0, x1, y1], uMm: paper units in a millimetre }, or null */
    const rightBoxOf = (L) => {
      const vp = bigVp(L); if (!vp) return null;
      const vx1 = num(vp, 10, 0) + num(vp, 40, 0) / 2, boxes = [];
      for (const r of layoutEnts(d, S, L)) { const t = typ(r); if (t === 'VIEWPORT') continue;
        if (t === 'INSERT') { const b = S.blocks.get(get(r, 2)); if (!b) continue; const ix = num(r, 10, 0), iy = num(r, 20, 0), sx = num(r, 41, 1) || 1, sy = num(r, 42, sx) || 1, bx = num(b.begin, 10, 0), by = num(b.begin, 20, 0);
          for (const e of b.ents) { const q = entBoxP(e); if (q) boxes.push([ix + (q[0] - bx) * sx, iy + (q[1] - by) * sy, ix + (q[2] - bx) * sx, iy + (q[3] - by) * sy]); } }
        else { const q = entBoxP(r); if (q) boxes.push(q); } }
      if (!boxes.length) return null;
      const pg = [Math.min(...boxes.map((q) => q[0])), Math.min(...boxes.map((q) => q[1])), Math.max(...boxes.map((q) => q[2])), Math.max(...boxes.map((q) => q[3]))], pH = pg[3] - pg[1];
      const fr = boxes.filter((q) => q[3] - q[1] > 0.6 * pH && q[0] >= vx1 - 1 && q[2] <= pg[2] + 1).sort((a2, b2) => (b2[2] - b2[0]) - (a2[2] - a2[0]))[0]; // (the right-hand box's frame, when the title block has one)
      const cx0 = fr ? fr[0] : vx1, cx1 = fr ? fr[2] : pg[2], ctop = fr ? fr[3] : pg[3];
      const inCol = boxes.filter((q) => q !== fr && q[3] - q[1] <= 0.6 * pH && q[2] > cx0 + 0.5 && q[0] < cx1 - 0.5 && q[1] < ctop - 0.5); // (the title block's fields and anything else in that column)
      const ftop = inCol.length ? Math.max(...inCol.map((q) => q[3])) : pg[1], m = 0.04 * (cx1 - cx0), R0 = [cx0 + m, ftop + m, cx1 - m, ctop - m];
      return { R0, uMm: (pg[2] - pg[0]) / Math.max(num(L.rec, 44, 420), num(L.rec, 45, 297), 1) || 1 }; // (paper units in a millimetre)
    };
    const boqBot = new Map(), RBC = new Map(), rightBox = (L) => { if (!RBC.has(L.name)) RBC.set(L.name, rightBoxOf(L)); return RBC.get(L.name); }; // (beta 6.5: where each sheet's BOQ table ends, for the legend under it; each box found once, before anything is drawn in it)
    if (job.pmiItems && N > 0) {
      const PMI_ROWS = [['TOTAL CABLE LENGTH', 'PMI_TOTAL_CABLE_LENGTH', 'm'], ['AERIAL CABLE LENGTH', 'PMI_AERIAL_CABLE_LENGTH', 'm'], ['EXISTING GT POLE', 'PMI_EXISTING_GT_POLE'], ['PROPOSED POLE', 'PMI_PROPOSED_POLE'],
        ['RTA CONVERGE', 'PMI_RTA_CONVERGE'], ['RTA LOCAL COOP', 'PMI_RTA_LOCAL_COOP'], ['RTA OTHER (PLDT POLE)', 'PMI_RTA_OTHER_PLDT'], ...PMI_XRTA, ['UNDERGROUND CABLE LENGTH', 'PMI_UG_CABLE_LENGTH', 'm'], ['PROPOSED HDD', 'PMI_HDD', 'm'],
        ['PROPOSED OPEN TRENCH', 'PMI_OPEN_TRENCH', 'm'], ...PMI_UGX, ['PROPOSED MICRO TRENCH', 'PMI_MICRO_TRENCH', 'm'], ['MAXCELL INNER DUCT', 'PMI_MAXCELL_INNER_DUCT', 'm'], ...PMI_CDX, ['PROPOSED MANHOLE', 'PMI_MANHOLE'], ['PROPOSED SERVICE BOX', 'PMI_SERVICE_BOX'], ['FIBER TERMINATION', 'PMI_FIBER_TERMINATION'], ['PROPOSED HYBRID CLOSURE', 'PMI_HYBRID_CLOSURE']];
      const V0 = { ...(job.values || {}), ...ugVals }, PI = { spans: [...(job.pmiItems.spans || []), ...ugPI.spans], points: [...(job.pmiItems.points || []), ...ugPI.points] }, names = geoNames(N), per = new Map(names.map((nm) => [nm, {}])), lost = [];
      const shAt = (x, y) => sheetOf.get(key(ci(x), cj(y))) || null, numOf = (v) => { const m = /-?\d+(?:\.\d+)?/.exec(String(v == null ? '' : v)); return m ? +m[0] : null; };
      const addTo = (nm, v, what) => { if (!nm) { lost.push(what); return; } const o2 = per.get(nm); for (const [k, x] of Object.entries(v || {})) o2[k] = (o2[k] || 0) + (+x || 0); };
      for (const it of PI.spans || []) { const P = byId.get(String(it.ia)), Q = byId.get(String(it.ib)); if (!P || !Q) { lost.push(`span ${it.ia}-${it.ib}`); continue; } const at = spanLblAt.get(K2(it.ia, it.ib)); addTo((at && shAt(at[0], at[1])) || shAt((P.E + Q.E) / 2, (P.N + Q.N) / 2), it.v, `span ${P.poleId || P.id}-${Q.poleId || Q.id}`); }
      for (const it of PI.points || []) { if (it.at) { addTo(shAt(it.at[0], it.at[1]), it.v, 'a bore'); continue; } const p = byId.get(String(it.id)); if (!p) { lost.push(`point ${it.id}`); continue; } addTo(shAt(p.E, p.N), it.v, String(p.poleId || p.id)); }
      const cellsTxt = new Map(names.map((nm) => [nm, {}])), check = [];
      for (const [label, k, unit] of PMI_ROWS) {
        if (!k || V0[k] == null || String(V0[k]).trim() === '') { check.push({ row: label, pmi: '', sum: '', ok: true }); continue; }
        const tot = numOf(V0[k]);
        if (unit === 'm') { // (decimetres: each sheet rounded down, the rest of the PMI's figure to the sheets with the largest remainders)
          const T10 = Math.round((tot || 0) * 10), raw = names.map((nm) => (per.get(nm)[k] || 0) * 10), fl = raw.map(Math.floor); let rest = T10 - fl.reduce((t, v) => t + v, 0);
          const ok = rest >= 0 && rest <= names.length; if (ok) raw.map((v, i) => [v - fl[i], i]).sort((x, y) => y[0] - x[0]).slice(0, rest).forEach(([, i]) => { fl[i]++; }); else names.forEach((nm, i) => { fl[i] = Math.round(raw[i]); });
          names.forEach((nm, i) => { cellsTxt.get(nm)[k] = `${(fl[i] / 10).toFixed(1)}m`; });
          const sum = fl.reduce((t, v) => t + v, 0) / 10; check.push({ row: label, pmi: String(V0[k]), sum: `${sum.toFixed(1)}m`, ok: ok && Math.abs(sum - (tot || 0)) < 0.05, raw: +(raw.reduce((t, v) => t + v, 0) / 10).toFixed(2) });
        } else {
          const vs = names.map((nm) => Math.round(per.get(nm)[k] || 0)); names.forEach((nm, i) => { cellsTxt.get(nm)[k] = String(vs[i]); });
          const sum = vs.reduce((t, v) => t + v, 0); check.push({ row: label, pmi: String(V0[k]), sum: String(sum), ok: sum === tot });
        }
      }
      rep.boqGrid = { check, lost, sheets: Object.fromEntries(names.map((nm, i) => [nm, { grid: cellName(geoCells[i].i, geoCells[i].j), ...cellsTxt.get(nm) }])) };
      const bad = check.filter((c) => !c.ok); if (bad.length || lost.length) rep.notes.push(`BOQ tables of the GEO sheets: ${bad.length ? `${bad.map((c) => `${c.row} (sheets ${c.sum}, PMI ${c.pmi})`).join(', ')} do not add up to the PMI` : ''}${bad.length && lost.length ? '; ' : ''}${lost.length ? `not on any GEO sheet: ${lost.slice(0, 8).join(', ')}` : ''}`);
      // the table in each GEO sheet's right-hand box
      S = structure(d); const BL = 'G-ESAA BOQ GRID'; addLayer(d, S, BL, 7); S = structure(d);
      const stl = S.styles.has('Standard') ? 'Standard' : null; let nTab = 0;
      names.forEach((nm, k) => {
        const L = S.layouts.find((x) => x.name === nm), RB = L && rightBox(L); if (!RB) return; // (beta 6.5: its right-hand box, see rightBoxOf)
        const { R0, uMm } = RB, W = R0[2] - R0[0], H = R0[3] - R0[1];
        const rows = PMI_ROWS.map(([lb, k2]) => [lb, k2 ? (cellsTxt.get(nm)[k2] != null ? cellsTxt.get(nm)[k2] : '') : '']), title = `BILL OF QUANTITIES · GRID ${cellName(geoCells[k].i, geoCells[k].j)}`;
        const BOQ_K = 2 / 3, LEG_K = 2 / 3; /* beta 6.7 (the owner: "can you make the table covering the 2/3 of the box? so that there are room for other details"; "make it smaller. 2/3 of its size now") */
        const LEGN = Array.isArray(job.rtaLegend) && job.rtaLegend.length && job.rtaLegendAt === 'boq' ? Math.min(12, job.rtaLegend.length) + 1.5 : 0; // (beta 6.5: room kept under the table for the RTA/JPA legend: its rows and a gap)
        let rh = Math.min(7 * uMm, H * BOQ_K / (rows.length + 2), H / (rows.length + 2 + LEGN * LEG_K)), th = Math.min(2.5 * uMm, rh * 0.5); const pad = 1.5 * uMm; // (beta 6.7: the table at most 2/3 of the box's height, the rest free)
        const need = (h2) => Math.max(...rows.map(([lb]) => arialW(lb, h2))) * 1.08 + Math.max(arialW('QUANTITY', h2), ...rows.map(([, v]) => arialW(v, h2))) * 1.08 + 4 * pad;
        if (need(th) > W) th *= W / need(th);
        if (!(W > 30 * uMm && H > (rows.length + 2) * 2.4 * uMm && th >= 1.2 * uMm)) { rep.notes.push(`BOQ table not drawn on ${nm}: its right-hand box has no room`); return; }
        const po = paperOut(d, S, L, Out); if (!po) return;
        const x0 = R0[0], x1 = R0[2], top = R0[3], qw = Math.max(arialW('QUANTITY', th), ...rows.map(([, v]) => arialW(v, th))) * 1.08 + 2 * pad, xd = x1 - qw, nR = rows.length + 2, yB = top - nR * rh;
        const tH = Math.min(th * 1.2, th * W / Math.max(1e-6, arialW(title, th) * 1.08 + 2 * pad));
        po.lwpoly(BL, [[x0, yB], [x1, yB], [x1, top], [x0, top]], { closed: true }); boqBot.set(nm, yB);
        for (let i = 1; i < nR; i++) po.lwpoly(BL, [[x0, top - i * rh], [x1, top - i * rh]], {});
        po.lwpoly(BL, [[xd, top - rh], [xd, yB]], {});
        po.text(BL, (x0 + x1) / 2, top - rh / 2, tH, title, { ha: 1, va: 2, style: stl });
        po.text(BL, x0 + pad, top - 1.5 * rh, th, 'DESCRIPTION', { ha: 0, va: 2, style: stl }); po.text(BL, x1 - pad, top - 1.5 * rh, th, 'QUANTITY', { ha: 2, va: 2, style: stl });
        rows.forEach(([lb, v], i) => { const y = top - (i + 2.5) * rh; po.text(BL, x0 + pad, y, th, lb, { ha: 0, va: 2, style: stl }); if (v !== '') po.text(BL, x1 - pad, y, th, v, { ha: 2, va: 2, style: stl }); });
        nTab++;
      });
      rep.boqGrid.tables = nTab;
    }
    /* beta 6.5 (the owner's standard "RTA/JPA LEGEND"): on each GEO sheet, in its right-hand box under the BOQ table (at its top without
       one), a title bar and a row for each RTA/JPA category on the plan (job.rtaLegend, from Drawing style › Numbers): its number "1" in
       its circle, both in its colour (a dark shadow under a light one, as the numbers), and its text. Layer G-ESAA RTA LEGEND. */
    if (Array.isArray(job.rtaLegend) && job.rtaLegend.length && N > 0 && job.rtaLegendAt === 'boq') { // (beta 6.6: only where Drawing style puts it: under the BOQ table)
      const LG = 'G-ESAA RTA LEGEND', LEGK = 2 / 3; addLayer(d, S, LG, 7); S = structure(d); const stl = S.styles.has('Standard') ? 'Standard' : null; let nLeg = 0; // (beta 6.7: LEGK, 2/3 of the size it had)
      const cats = job.rtaLegend.filter((x) => x && x.text).slice(0, 12), title = 'RTA/JPA LEGEND';
      geoNames(N).forEach((nm) => {
        const L = S.layouts.find((x) => x.name === nm), RB = L && rightBox(L); if (!RB) return;
        const { R0, uMm } = RB, top = boqBot.has(nm) ? boqBot.get(nm) - Math.min(3 * uMm, 0.4 * (boqBot.get(nm) - R0[1]) / (cats.length + 1.5)) : R0[3], W = R0[2] - R0[0], room = top - R0[1], pad = 1.5 * uMm * LEGK;
        let rh = Math.min(7 * uMm * LEGK, room / (cats.length + 1)), th = Math.min(2.5 * uMm * LEGK, rh * 0.5); // (beta 6.7: 2/3 of its size before)
        const need = (h2) => Math.max(arialW(title, h2 * 1.1), ...cats.map((x) => arialW(x.text, h2) + 1.6 * h2 * 2)) * 1.08 + 3 * pad;
        if (need(th) > W) th *= W / need(th);
        if (!(room > (cats.length + 1) * 2.4 * uMm * LEGK && th >= 1.2 * uMm * LEGK)) { rep.notes.push(`RTA/JPA legend not drawn on ${nm}: its right-hand box has no room left`); return; }
        const po = paperOut(d, S, L, Out); if (!po) return;
        const x0 = R0[0], w = Math.min(W, need(th)), x1 = x0 + w, nR = cats.length + 1, yB = top - nR * rh, rr = Math.min(rh * 0.36, th * 0.95), so = th * 0.08;
        po.lwpoly(LG, [[x0, yB], [x1, yB], [x1, top], [x0, top]], { closed: true }); po.lwpoly(LG, [[x0, top - rh], [x1, top - rh]], {});
        po.text(LG, (x0 + x1) / 2, top - rh / 2, th * 1.1, title, { ha: 1, va: 2, style: stl });
        cats.forEach((x, i) => { const y = top - (i + 1.5) * rh, cx = x0 + pad + rr, col = +x.color > 0 ? +x.color : null;
          if (col != null && litCol(col)) { po.circle(LG, cx + so, y - so, rr, { color: 250 }); po.text(LG, cx + so, y - so, th, '1', { ha: 1, va: 2, style: stl, color: 250 }); }
          po.circle(LG, cx, y, rr, { color: col }); po.text(LG, cx, y, th, '1', { ha: 1, va: 2, style: stl, color: col });
          po.text(LG, cx + rr + pad, y, th, x.text, { ha: 0, va: 2, style: stl }); });
        nLeg++;
      });
      rep.rtaLegend = { sheets: nLeg, rows: cats.map((x) => `${x.text} (${x.n || 0})`) };
    }
    /* beta 6.6 (the owner: "let the user adjust where to put it"): Drawing style › Numbers › Legend › On the LEGENDS sheet: the same box in
       model space, in the window the template's LEGENDS sheet shows (its square map viewport), in the first free place from its bottom
       right corner, printed the size of the BOQ table's rows; when the LEGENDS sheet is full, in the KEYMAP sheet's window the same way.
       Its layer is frozen in every other viewport (the GEO sheets do not show it). No room on either: listed, not drawn. */
    if (Array.isArray(job.rtaLegend) && job.rtaLegend.length && job.rtaLegendAt === 'sheet') {
      const cats = job.rtaLegend.filter((x) => x && x.text).slice(0, 12), title = 'RTA/JPA LEGEND', LG = 'G-ESAA RTA LEGEND'; addLayer(d, S, LG, 7); S = structure(d);
      const wn = (vp) => { const cx = num(vp, 17, 0) + num(vp, 12, 0), cy = num(vp, 27, 0) + num(vp, 22, 0), h = num(vp, 45, 0), w = h * num(vp, 40, 1) / (num(vp, 41, 1) || 1); return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; };
      const segBoxes = (r) => { const t = typ(r); if (t === 'LINE') return [[Math.min(num(r, 10, 0), num(r, 11, 0)), Math.min(num(r, 20, 0), num(r, 21, 0)), Math.max(num(r, 10, 0), num(r, 11, 0)), Math.max(num(r, 20, 0), num(r, 21, 0))]];
        if (t === 'LWPOLYLINE') { const X = all(r, 10).map(Number), Y = all(r, 20).map(Number), n = X.length, cl = parseInt(get(r, 70, '0'), 10) & 1, o2 = []; for (let i = 0; i + 1 < n + (cl ? 1 : 0); i++) { const j = (i + 1) % n; o2.push([Math.min(X[i], X[j]), Math.min(Y[i], Y[j]), Math.max(X[i], X[j]), Math.max(Y[i], Y[j])]); } return o2; }
        const b0 = drawnBox(S, r); return b0 ? [b0] : []; }; // (a frame round the legend area is its four sides, not a block of it)
      const occAll = d.sec('ENTITIES').recs.filter((r) => owner(r) === S.modelH && String(get(r, 67, '0')).trim() !== '1').flatMap(segBoxes);
      const tried = [], cands = [S.layouts.find((L) => /^LEGENDS?$/.test(L.name)), S.layouts.find((L) => L.name === 'KEYMAP')].filter(Boolean);
      let done = null, LL = null, VP = null;
      for (const L of cands) { if (done) break;
        const vp = bigVp(L) || layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').slice(1).sort((a2, b2) => num(b2, 40, 0) * num(b2, 41, 0) - num(a2, 40, 0) * num(a2, 41, 0))[0]; tried.push(L.name);
        if (!vp || !(num(vp, 45, 0) > 0)) continue;
        const w0 = wn(vp), mPerMm = num(vp, 45, 0) / Math.max(1e-9, num(vp, 41, 1)) * ((rightBox(L) || {}).uMm || 1), rh = 4 * mPerMm, th = 2.5 * 2 / 3 * mPerMm, pad = 1 * mPerMm; // (beta 6.7: 2/3 of 6 mm rows, 2.5 mm text)
        const W = Math.max(arialW(title, th * 1.1), ...cats.map((x) => arialW(x.text, th) + 3.2 * th)) * 1.08 + 3 * pad, H = (cats.length + 1) * rh, mg = 3 * mPerMm;
        const occ = occAll.filter((b) => !(b[2] < w0[0] || b[0] > w0[2] || b[3] < w0[1] || b[1] > w0[3]));
        const free = (x0, y0) => !occ.some((b) => !(b[2] < x0 - mg || b[0] > x0 + W + mg || b[3] < y0 - mg || b[1] > y0 + H + mg));
        const nX = 60, nY = 60, stx = (w0[2] - w0[0] - W - 2 * mg) / nX, sty = (w0[3] - w0[1] - H - 2 * mg) / nY;
        if (!(stx > 0 && sty > 0)) continue;
        for (let jy = 0; !done && jy <= nY; jy++) for (let ix = 0; !done && ix <= nX; ix++) { const x0 = w0[2] - mg - W - ix * stx, y0 = w0[1] + mg + jy * sty; if (free(x0, y0)) done = { at: [x0, y0], W, H, rh, th, pad }; } // (from the bottom right corner)
        if (done) { LL = L; VP = vp; }
      }
      if (done) { const { at: [x0, y0], W, H, rh, th, pad } = done, x1 = x0 + W, top = y0 + H, rr = Math.min(rh * 0.36, th * 0.95), so = th * 0.08, m0 = o.model.length; // (model space: written out here, the plan's own already is)
        o.lwpoly(LG, [[x0, y0], [x1, y0], [x1, top], [x0, top]], { closed: true }); o.lwpoly(LG, [[x0, top - rh], [x1, top - rh]], {});
        o.text(LG, (x0 + x1) / 2, top - rh / 2, th * 1.1, title, { ha: 1, va: 2, style: 'arial' });
        cats.forEach((x, i) => { const y = top - (i + 1.5) * rh, cx = x0 + pad + rr, col = +x.color > 0 ? +x.color : null;
          if (col != null && litCol(col)) { o.circle(LG, cx + so, y - so, rr, { color: 250 }); o.text(LG, cx + so, y - so, th, '1', { ha: 1, va: 2, style: 'arial', color: 250 }); }
          o.circle(LG, cx, y, rr, { color: col }); o.text(LG, cx, y, th, '1', { ha: 1, va: 2, style: 'arial', color: col }); o.text(LG, cx + rr + pad, y, th, x.text, { ha: 0, va: 2, style: 'arial' }); });
        d.sec('ENTITIES').recs.push(...o.model.slice(m0));
        const hL = layerH(LG); if (hL) for (const L of S.layouts) for (const v of layoutEnts(d, S, L).filter((e) => typ(e) === 'VIEWPORT').slice(1)) if (v !== VP) vpFreeze(v, [hL]); } // (on that sheet only)
      if (!done) rep.notes.push(`RTA/JPA legend not drawn: ${tried.length ? `no free room for it on the ${tried.join(' or the ')} sheet` : 'the template has no LEGENDS or KEYMAP sheet'} (Drawing style › Numbers › Legend: under the BOQ table instead)`);
      rep.rtaLegend = { at: 'sheet', sheet: done ? LL.name : null, tried, rows: cats.map((x) => `${x.text} (${x.n || 0})`) };
    }
    rep.grid = { cell, cols: cellsI, rows: cellsJ, origin: [gx0, gy0], geo: [gox, goy] }; // (v2.42.25: + the GEO cells' origin)
    // v2.42.8: the cleanup again on the whole drawing, then its extents and opening view
    rep.cleanup = { template: clean0, final: clean(d), oldBlocks };
    S = structure(d); centerCache.clear();
    rep.frame = frame(d, S, [[gx0, gy0, gx1, gy1], ...vics.map((v) => v.sb), ...(tablesBox ? [tablesBox] : [])], rep);
    return { text: d.text(), report: rep };
  }
  return { build, clean, repair, mtextWidth, mtextLines, blockBox, drawnBox, Doc, structure, clipLine, roadWidth, layoutRoads, vicCircle, locations, vicArea, markOrder, NUM_STYLE, ID_STYLE, VIC_STYLE, version: '2.42.17' };
}));
