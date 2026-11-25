/* (beta 7.15, Template look) the as-plan builder (dxftpl.js, in Node, as the app's worker runs it) on a client template's seed: the look the synthesizer
   writes into it (the XRECORD 'G-ESAA_LOOK', stage7 §3; the owner: "client requires a different template with a different text font style, drawing style
   size and thickness"). Run: node --test tests/template-look.test.cjs (or python3 tests/run_all.py --only template-look).
   - A made-up look put into the made-up template here (styles 'G-ESAA TEXT' romans.shx and 'G-ESAA TEXT BOLD' romand.shx, the client's layers, line
     weights, a text size, its sheet): every text the plan writes in its style (TEXT, attributes, MTEXT font codes, notes; bold ones in its bold style),
     an item's own font (beta 7.14) still its own; the plan's items' texts × its size; line weights by class (cables, poles, symbols, leaders, roads);
     the plan's entities on the client's layers (the vicinity map's and the key map's own kept); the SCALE text from the real viewport; the PDF made.
   - The synthesizer's made-up clients (tests/fixtures/client-{a,b,c}-made-up.dxf made into seeds by dxfsynth.js): the same on them. Skipped, saying
     so, where dxfsynth.js is not there (the builder's branch alone).
   - Byte for byte: no look (the made-up templates), or one that does not read, or one naming nothing the seed has: the DXF as beta 7.14 made it
     (its SHA-256).
   Every name, number and place is made up. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED_BL = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));
const SYNTH = path.join(root, 'dxfsynth.js'), HAS_SYNTH = fs.existsSync(SYNTH) && ['a', 'b', 'c'].every((c) => fs.existsSync(path.join(FX, `client-${c}-made-up.dxf`)));

/** 12 made-up poles 36 m apart along a made-up street that turns a corner at s6 (an L), each with a photo and a number (as drawing-snap.test.cjs's). */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
/** the route with a tower, closures and their loops, guys, a NAP, clamp tags, a pull-off and its messenger arms, an existing cable, a landmark and two notes */
function lookJob(over) {
  const j = madeUpJob({ clampStyle: { place: 'callout' }, ...over }), E0 = 787300, N0 = 786100, ll = (E, N) => ({ lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }), set = (id, o) => Object.assign(j.pts.find((p) => p.id === id), o);
  set('s2', { closure: true, closureId: 'CL-01', mloop: true, mloopM: 15 }); set('s3', { guy: 'side guy', ground: true }); set('s4', { nap: true, napId: 'NAP-01', napType: 'NAP 1x8' }); set('s8', { closure: true, closureOld: true, closureId: 'CL-08' });
  j.pts.push({ id: 'j1', poleId: 'PO-1', el: 'Pull-off', status: 'Proposed', E: E0 + 90, N: N0 - 40, att: ['s3', 's4'], ...ll(E0 + 90, N0 - 40) });
  j.spans.push({ ia: 'j1', ib: 's3', a: [E0 + 90, N0 - 40], b: [E0 + 72, N0], len: 44, lenW: 44, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] });
  j.pts.unshift({ id: 't1', poleId: 'DEMO-TWR', el: 'Site', status: 'Existing', siteName: 'DEMOSITE MIN9001', plaId: 'PLA-9001', E: E0 - 60, N: N0 + 30, ...ll(E0 - 60, N0 + 30) });
  j.spans.unshift({ ia: 't1', ib: 's1', a: [E0 - 60, N0 + 30], b: [E0, N0], len: 67, lenW: 67, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] }); j.runs[0].pts = [[E0 - 60, N0 + 30], ...j.runs[0].pts];
  j.pts.push({ id: 'e1', poleId: 'CC-9101', el: 'Pole', status: 'Existing', mat: 'CC', E: E0 + 60, N: N0 + 90, ...ll(E0 + 60, N0 + 90) }); j.exSpans = [{ ia: 's2', ib: 'e1', cab: 'F12', cores: 24 }]; // (an existing cable)
  j.pois = [{ name: 'MADE-UP CHAPEL', E: E0 + 100, N: N0 + 60, kind: 'place_of_worship', icon: 0 }]; j.lmBlocks = [{ w: 10, h: 10, f: [{ c: '#2050C0', l: [[0, 0, 10, 0, 10, 10, 0, 10]] }] }]; j.lmRefs = ['m:demo-place'];
  j.notes = [{ id: 'n1', kind: 'text', at: [787350, 786180], lines: ['HELLO NOTE', 'SECOND LINE'] }, { id: 'n2', kind: 'text', at: [787250, 786200], lines: ['BOLD NOTE'], bold: true }];
  j.marks = j.pts.filter((p) => p.el === 'Pole' && p.status === 'Proposed').map((p) => p.id);
  return j;
}
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
const by = (M, id) => M.find((m) => m.id === id);
/** The records of a DXF's ENTITIES by handle, in the order written: [code, value] pairs, type, layer, text. */
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null, inE = false;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0 && v.trim() === 'SECTION') inE = (R[i + 3] || '').trim() === 'ENTITIES'; if (!inE) continue;
    if (c === 0) { cur = v.trim() === 'ENDSEC' ? null : { type: v.trim(), g: [] }; continue; } if (!cur) continue; cur.g.push([c, v]); if (c === 5 && !cur.h) { cur.h = v.trim(); out.set(cur.h, cur); } else if (c === 8 && cur.layer == null) cur.layer = v; else if (c === 1 && cur.text == null) cur.text = v; }
  return out;
}
const g1 = (e, c) => { const q = e.g.find((x) => x[0] === c); return q ? q[1].trim() : null; }, gAll = (e, c) => e.g.filter((x) => x[0] === c).map((x) => x[1]);
const mtOf = (e) => gAll(e, 3).join('') + (e.g.find((x) => x[0] === 1) || [0, ''])[1];
const hOf = (e) => (e.type === 'MTEXT' ? +g1(e, 40) : +g1(e, 40));
/** the made-up template with a look put in: a text style 'G-ESAA TEXT' (romans.shx) and 'G-ESAA TEXT BOLD' (romand.shx), the client's layers, a SCALE field on
 *  each sheet, the XRECORD 'G-ESAA_LOOK' in the root dictionary (its JSON in group 1 strings of at most 250 letters; raw: the XRECORD's text as given) */
function lookSeed(look, raw) {
  const d = new T.Doc(SEED_BL), Tb = d.sec('TABLES').recs, O = d.sec('OBJECTS').recs, I = (v) => String(v).padStart(6), get = (r, c) => (r.find((q, i) => i > 0 && q[0] === c) || [])[1];
  const table = (n) => Tb.find((r) => r[0][1] === 'TABLE' && get(r, 2) === n), last = (t) => Tb.reduce((k, r, i) => (r[0][1] === t ? i : k), -1), bump = (tb) => { const q = tb.find((x, i) => i > 0 && x[0] === 70); q[1] = I(+q[1] + 1); };
  const style = (name, file) => { const s0 = Tb.find((r) => r[0][1] === 'STYLE' && get(r, 2) === 'Standard'), r = s0.map(([c, v]) => [c, c === 5 ? d.newHandle() : c === 2 ? name : c === 3 ? file : v]); Tb.splice(last('STYLE') + 1, 0, r); bump(table('STYLE')); };
  const layer = (name, color, lw) => { const l0 = Tb.find((r) => r[0][1] === 'LAYER' && get(r, 2) === '0'), r = l0.map(([c, v]) => [c, c === 5 ? d.newHandle() : c === 2 ? name : c === 62 ? I(color) : c === 370 ? I(lw) : v]); if (!r.some((q) => q[0] === 370)) r.splice(r.findIndex((q) => q[0] === 62) + 1, 0, [370, I(lw)]); Tb.splice(last('LAYER') + 1, 0, r); bump(table('LAYER')); };
  if (look) { style('G-ESAA TEXT', 'romans.shx'); style('G-ESAA TEXT BOLD', 'romand.shx'); for (const [n, c, w] of [['CL-FIBRE', 1, 50], ['CL-POLE', 3, 30], ['CL-ANNO', 4, 13], ['CL-ROAD', 8, 9], ['CL-SYMBOL', 5, 25]]) layer(n, c, w);
    for (const n of Object.keys(look.layers || {})) if (n !== 'NO SUCH LAYER' && !Tb.some((r) => r[0][1] === 'LAYER' && get(r, 2) === n)) layer(n, 7, -3); } // (the plan's layers, as the synthesizer makes them)
  for (const sec of ['ENTITIES', 'BLOCKS']) { const R = d.sec(sec).recs; for (let i = R.length - 1; i >= 0; i--) if (R[i][0][1] === 'TEXT' && get(R[i], 1) === '@@SHEET@@') { const c = R[i].map(([k, v]) => [k, k === 5 ? d.newHandle() : k === 1 ? '@@SCALE@@' : k === 20 ? String(+v - 12) : v]); R.splice(i + 1, 0, c); } } // (a scale field under each sheet's number)
  if (look || raw) {
    const rt = O.find((r) => r[0][1] === 'DICTIONARY'), rh = get(rt, 5), h = d.newHandle(), js = raw != null ? raw : JSON.stringify(look), ch = []; for (let i = 0; i < js.length; i += 250) ch.push(js.slice(i, i + 250));
    rt.push([3, 'G-ESAA_LOOK'], [350, h]); O.splice(O.indexOf(rt) + 1, 0, [[0, 'XRECORD'], [5, h], [102, '{ACAD_REACTORS'], [330, rh], [102, '}'], [330, rh], [100, 'AcDbXrecord'], [280, I(1)], ...ch.map((c) => [1, c])]);
  }
  d.index(); return d.text();
}
const LOOK = { v: 1, name: 'DEMO LOOK', made: '2026-11-20T08:00:00.000Z', from: 'demo-client.dxf', text: { style: 'G-ESAA TEXT', bold: 'G-ESAA TEXT BOLD', scale: 0.8, font: 'romans.shx' },
  lw: { cable: 50, cableExisting: 35, pole: 30, symbol: 25, leader: 13, road: 9 },
  layers: { 'PROPOSED FOC AERIAL 6 CORE': 'CL-FIBRE', 'Proposed foc aerial': 'CL-FIBRE', 'Proposed foc duct': 'CL-FIBRE', 'P-GPOLE': 'CL-POLE', 'p-pole': 'CL-POLE', 'GT-POLE': 'CL-POLE', 'Distance Data': 'CL-ANNO', LATLONG: 'CL-ANNO', 'G-ESAA NOTES': 'CL-ANNO', 'G-ESAA POLE CLAMP': 'CL-ANNO', 'ROAD PAVEMENT': 'CL-ROAD', BASEMAP: 'CL-ROAD', 'P-JOINT': 'CL-SYMBOL', 'G-ESAA VICINITY': 'CL-ANNO', 'G-ESAA KEYMAP GRID': 'CL-ANNO', 'NO SUCH LAYER': 'CL-ANNO' },
  sheet: { name: 'GEO', unit: 'mm', mm: 1, paper: [420, 297], side: 260, cell: 286, scale: 1100 } };
/** the plan's own entities of a DXF (not the seed's): by handle */
const planEnts = (text, seed) => { const S0 = new Set(entsOf(seed).keys()); return [...entsOf(text).values()].filter((e) => !S0.has(e.h)); };
const isLine = (e) => ['LWPOLYLINE', 'LINE', 'CIRCLE', 'INSERT'].includes(e.type), open = (e) => e.type === 'LINE' || (e.type === 'LWPOLYLINE' && !(+(g1(e, 70) || 0) & 1));
/** the scales written on the sheets (their texts, in paper space's blocks too) */
const scalesOf = (text) => text.split(/\r?\n/).map((x) => (/1 : [\d,]+ METERS/.exec(x) || [])[0]).filter(Boolean);

test('a look in the seed: the plan\'s texts in its style (bold ones in its bold), its size, its line weights by class, its layers, its sheet\'s scale', async () => {
  const seed = lookSeed(LOOK), seed0 = lookSeed(null);
  for (const v of [{}, { labels: 'tidy' }]) {
    const job = (o) => lookJob({ ...v, cell: 286, viewH: 286, idStyle: { bold: true }, ...o });
    const r0 = T.build(seed0, job({})), r = T.build(seed, job({ style: { 'lbl:s5': { bold: true }, 'span:s2|s3': { italic: true }, 'lbl:s6': { font: 'Times New Roman' } } })), M = r.report.movable, E = entsOf(r.text), P = planEnts(r.text, seed);
    // its styles: every text the plan wrote (model space) in G-ESAA TEXT or its bold; an item's own font its own
    const own = new Set(by(M, 'lbl:s6').handles), txt = P.filter((e) => /^(TEXT|MTEXT|ATTRIB)$/.test(e.type) && g1(e, 67) !== '1');
    assert.ok(txt.length > 40, `${JSON.stringify(v)}: the plan's texts (${txt.length})`);
    for (const e of txt) { if (own.has(e.h)) { if (e.type === 'MTEXT') assert.ok(/^\{\\fTimes New Roman\|/.test(mtOf(e)), `an item's own font wins: ${mtOf(e)}`); else assert.equal(g1(e, 7), 'G-ESAA TIMES NEW ROMAN', 'an item\'s own font wins'); continue; } assert.ok(['G-ESAA TEXT', 'G-ESAA TEXT BOLD'].includes(g1(e, 7)), `${e.type} "${e.text}" in ${g1(e, 7)}`); }
    for (const e of txt.filter((x) => x.type === 'MTEXT' && !own.has(x.h))) { const s = mtOf(e); assert.ok(!/\\f(Arial|SimSun)/i.test(s), `no Arial / SimSun code left: ${s}`); for (const c of s.match(/\\[fF][^;]*;/g) || []) assert.ok(c === '\\Fromans.shx;' || c === '\\Fromand.shx;', `a code of the look's: ${c}`); }
    const bold = (id) => by(M, id).handles.map((h) => E.get(h)).filter((e) => /TEXT/.test(e.type));
    assert.ok(bold('lbl:s5').every((e) => (e.type === 'TEXT' ? g1(e, 7) === 'G-ESAA TEXT BOLD' : mtOf(e).includes('\\Fromand.shx;'))), 'a bold label in the bold style');
    assert.ok(bold('note:n2').every((e) => mtOf(e).includes('\\Fromand.shx;')), 'a bold note: the bold font'); assert.equal(by(M, 'note:n2').fmt.bold, true); assert.equal(by(M, 'span:s2|s3').fmt.italic, false, 'an SHX font: not italic');
    assert.ok(txt.some((e) => e.type === 'TEXT' && g1(e, 7) === 'G-ESAA TEXT BOLD' && /^NAP-01$/.test(e.text)), 'the bold IDs in the bold style');
    assert.ok(!/\n\s*2\r?\nG-ESAA BOLD\r?\n/.test(r.text) && !/\n\s*2\r?\nG-ESAA ARIAL/.test(r.text), 'no Arial bold style made');
    assert.equal(by(M, 'span:s1|s2').fmt.font, 'Romans', 'fmt: the font of its file (the app\'s Romans: the template lists none of romans.shx)');
    // its size: the plan's items' texts × 0.8 (not the sheet's own texts)
    for (const id of ['lbl:s3', 'span:s1|s2', 'note:n1', 'num:s4', 'road:MADE-UP ST#1']) { const a = by(r0.report.movable, id), b = by(M, id); if (!a || !b) continue; near(b.fmt.height, a.fmt.height * 0.8, 1e-3, `${JSON.stringify(v)} ${id}: its height × 0.8`); }
    const ttl = (out) => [...entsOf(out.text).values()].filter((e) => e.type === 'TEXT' && g1(e, 67) === '1' && /NOVEMBER/.test(e.text)).map(hOf); assert.deepEqual(ttl(r), ttl(r0), 'the sheet\'s own texts as they were');
    // its line weights by class; its layers
    const lw = (e) => +(g1(e, 370) || -99), cab = P.filter((e) => e.type === 'LWPOLYLINE' && e.layer === 'CL-FIBRE');
    assert.ok(cab.length > 0 && cab.filter((e) => g1(e, 62) !== '5').every((e) => lw(e) === 50), 'cables 0.50 mm'); assert.ok(cab.some((e) => g1(e, 62) === '5' && lw(e) === 35), 'the existing cable 0.35 mm');
    const pole = by(M, 'pole:s3').handles.map((h) => E.get(h)).filter(isLine); assert.ok(pole.length && pole.every((e) => lw(e) === 30 && e.layer === 'CL-POLE'), 'a pole\'s symbol 0.30 mm, on the client\'s pole layer');
    for (const id of ['clo:s2', 'guy:s3', 'nap:s4']) { const s = by(M, id).handles.map((h) => E.get(h)).filter(isLine); assert.ok(s.length && s.every((e) => lw(e) === 25), `${id}: 0.25 mm`); }
    const ph = by(M, 'ph:s3'); if (ph && ph.handles.some((h) => open(E.get(h)))) assert.ok(ph.handles.map((h) => E.get(h)).filter(open).every((e) => lw(e) === 13), 'a photo\'s line 0.13 mm');
    const rd = P.filter((e) => e.layer === 'CL-ROAD' && e.type === 'LWPOLYLINE'); assert.ok(rd.length && rd.every((e) => lw(e) === 9), 'roads 0.09 mm, on the client\'s road layer');
    for (const [from, to] of Object.entries(LOOK.layers)) { if (/VICINITY|KEYMAP|NO SUCH/.test(from)) continue; assert.ok(!P.some((e) => e.layer === from), `nothing left on ${from} (now ${to})`); }
    assert.ok(P.some((e) => e.layer === 'G-ESAA KEYMAP GRID'), 'the key map\'s names keep their own layer (its sheets turn it on and off)');
    assert.ok(by(M, 'span:s1|s2').handles.every((h) => E.get(h).layer === 'CL-ANNO'), 'a span\'s length on the client\'s text layer');
    assert.equal(r.report.lookLayers['P-GPOLE'], 'CL-POLE');
    // its sheet's scale, from the real viewport: GEO 1 : 1,100 (Tidy's finer grid 1 : 1,100 / n); the key map's to the hundred
    const scales = scalesOf(r.text), n = r.report.grid.n || 1;
    assert.ok(scales.includes(`1 : ${Math.round(1100 / n).toLocaleString('en-US')} METERS`), `${JSON.stringify(v)}: GEO's scale (${scales})`);
    assert.ok(scales.length >= 2 && !scales.some((x) => / : 715 /.test(x)), 'GEO\'s and the key map\'s (not the company template\'s 400 units: 1 : 715)');
    assert.ok(scalesOf(r0.text).length >= 2 && scalesOf(r0.text).every((x) => !/ : 1,100 /.test(x) || n > 1), 'the same plan without the look: the company template\'s 400 units');
    // the PDF made, Romans as an SHX
    const pdf = await PDF.toPdf(r.text, { title: 'MADE-UP' }); assert.ok(pdf.length > 1000 && pdf.report.sheets.includes('GEO'));
    assert.ok(PDF.planList(r.text, r.report).items.length > 0, 'the Drawing\'s display list');
  }
});

test('the synthesizer\'s made-up clients: their seeds\' look on the plan (texts, size, weights, layers, scale), the PDF made', { skip: HAS_SYNTH ? false : 'dxfsynth.js and its made-up clients are not on this branch (the synthesizer\'s): run on a branch with both' }, async () => {
  const G = require(SYNTH);
  for (const c of ['a', 'b', 'c']) {
    const src = fs.readFileSync(path.join(FX, `client-${c}-made-up.dxf`), 'utf8'), made = G.make(src, G.proposal(G.digest(src, `client-${c}.dxf`))), seed = made.plan, L = G.lookOf(seed);
    assert.ok(L && L.text && L.text.style === 'G-ESAA TEXT' && L.sheet && L.sheet.cell > 0, `${c}: a look`);
    for (const v of c === 'b' ? [{}, { labels: 'tidy' }] : [{}]) {
      const job = lookJob({ ...v, cell: L.sheet.cell, viewH: L.sheet.cell, idStyle: { bold: true } }), r = T.build(seed, job), M = r.report.movable, E = entsOf(r.text), P = planEnts(r.text, seed);
      const st = new Set(P.filter((e) => /^(TEXT|MTEXT|ATTRIB)$/.test(e.type) && g1(e, 67) !== '1').map((e) => g1(e, 7))), want = new Set(['G-ESAA TEXT', ...(L.text.bold ? [L.text.bold] : []), 'G-ESAA TEXT B', 'G-ESAA TEXT I', 'G-ESAA TEXT BI']);
      assert.ok([...st].every((s) => want.has(s)), `${c} ${JSON.stringify(v)}: the plan's texts in the look's styles (${[...st]})`);
      const sc = L.text.scale || 1, r0 = T.build(SEED_BL, lookJob({ ...v, cell: L.sheet.cell, viewH: L.sheet.cell }));
      if (!v.labels) for (const id of ['span:s1|s2', 'note:n1']) near(by(M, id).fmt.height, by(r0.report.movable, id).fmt.height * sc, 1e-3, `${c} ${id}: its height × ${sc}`);
      const lw = (e) => +(g1(e, 370) || -99);
      for (const [k, w] of Object.entries(L.lw || {})) {
        if (k === 'cable') assert.ok(P.filter((e) => e.type === 'LWPOLYLINE' && g1(e, 6) && g1(e, 62) !== '5' && (L.layers['Proposed foc aerial'] ? e.layer === L.layers['Proposed foc aerial'] : true)).some((e) => lw(e) === w), `${c}: cables ${w}`);
        if (k === 'pole') assert.ok(by(M, 'pole:s3').handles.map((h) => E.get(h)).filter(isLine).every((e) => lw(e) === w), `${c}: poles ${w}`);
        if (k === 'leader') assert.ok(M.filter((m) => m.kind === 'photo').flatMap((m) => m.handles.map((h) => E.get(h))).filter(open).every((e) => lw(e) === w), `${c}: leaders ${w}`);
        if (k === 'road') assert.ok(P.filter((e) => e.type === 'LWPOLYLINE' && (e.layer === (L.layers['ROAD PAVEMENT'] || 'ROAD PAVEMENT'))).every((e) => lw(e) === w), `${c}: roads ${w}`);
      }
      for (const [from] of Object.entries(L.layers || {})) if (!/^G-ESAA (VICINITY|KEYMAP GRID|RTA LEGEND)|^GRIDNO/.test(from)) assert.ok(!P.some((e) => e.layer === from), `${c}: nothing left on ${from}`);
      if (/@@SCALE@@/.test(seed)) { const n = r.report.grid.n || 1, s = scalesOf(r.text); assert.ok(s.includes(`1 : ${Math.round(1100 / n).toLocaleString('en-US')} METERS`), `${c} ${JSON.stringify(v)}: GEO's scale (${s})`); }
      const pdf = await PDF.toPdf(r.text, { title: 'MADE-UP' }); assert.ok(pdf.length > 1000, `${c}: the PDF`);
    }
  }
});

test('byte for byte: no look, a look that does not read, a look naming nothing the seed has: the DXF as beta 7.14 made it', () => {
  // [seed, labels, SHA-256 (first 16) of beta 7.14's DXF (dxftpl.js of 1e154d4) for that seed and lookJob; its 7.14 fields: a format, a font]
  const WANT = [['none', 'std', '464ebb979f50ec4a'], ['none', 'tidy', 'd7af723fa4f8aa9e'], ['broken', 'std', 'b5dc47252259fab0'], ['empty', 'std', 'f775610691fd9926'], ['empty', 'tidy', '5dcaa27ce6e80565']];
  const seeds = { none: lookSeed(null), broken: lookSeed(null, '{"v":1,"text":{"style":"G-ESAA TEXT"'), empty: lookSeed(null, JSON.stringify({ v: 1, text: { style: 'NO SUCH STYLE', scale: 1 }, lw: { cable: 'thick' }, layers: { 'P-GPOLE': 'NO SUCH LAYER' } })) };
  const got = []; for (const [sn, lab] of WANT) got.push([sn, lab, sha(T.build(seeds[sn], lookJob({ ...(lab === 'tidy' ? { labels: 'tidy' } : {}), style: { 'lbl:s3': { wrap: 8, align: 'right' }, 'lbl:s4': { font: 'Times New Roman', underline: true } } })).text)]);
  assert.deepEqual(got, WANT, 'as beta 7.14 made them');
  assert.equal(T.build(SEED_BL, lookJob({})).text, T.build(SEED_BL, lookJob({})).text);
});
