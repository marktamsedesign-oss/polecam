/* (beta 7.14, Text format) the plan builder (dxftpl.js, in Node, as the app's worker runs it) and the plan's PDF and the Drawing's display list (dxfpdf.js)
   for the text editor (the owner: "add text editor (center line, left, or right , wrap text and so on) . Add also a font style selection").
   Run: node --test tests/text-format.test.cjs (or python3 tests/run_all.py --only text-format).
   - report.fonts: the template's text styles (one per font file) then the app's; report.movable[i].fmt: each text item's format as drawn.
   - align (job.style[id] / styleKind[kind] / a note's own): a TEXT's 72 and alignment point 11, an MTEXT's attachment column (71); the item's lines with
     their left edges / middles / right edges in line, the middle of its box where it was.
   - wrap: lines broken at spaces as the plan measures texts (GeDxfTpl.wrapLine), as TEXT copies or an MTEXT's \P; report text the lines as written.
   - spacing: an MTEXT's 44, a label's rows further apart. font: a style made once per font (G-ESAA TIMES NEW ROMAN …), the template's own as it is,
     an MTEXT's codes; an SHX font not bold. underline: %%u, \L … \l.
   - the PDF (Times and Courier only when used, underlines) and the display list (ff, the underlines, the aligned lines' ends).
   - Byte for byte: without the new fields (or with them as drawn, or not valid) the DXF as beta 7.13 made it (its SHA-256).
   Every name, number and place is made up; tests/fixtures/plan-seed-made-up-blocks.dxf is the made-up template with plain made-up symbols. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const SEED_BL = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));

/** 12 made-up poles 36 m apart along a made-up street that turns a corner at s6 (an L), each with a photo and a number (as drawing-snap.test.cjs's). */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
/** the route with a tower, closures and their loops, clamp tags with a callout, a pull-off and a cross-over with their messenger arms, the cable's name */
function fullJob(over) {
  const j = madeUpJob({ clampStyle: { place: 'callout' }, cabLabels: false, ...over }), E0 = 787300, N0 = 786100, ll = (E, N) => ({ lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }), set = (id, o) => Object.assign(j.pts.find((p) => p.id === id), o);
  set('s2', { closure: true, closureId: 'CL-01', mloop: true, mloopM: 15 }); set('s6', { closure: true, closureId: 'CL-06', mloop: true, mloopM: 20 }); set('s8', { closure: true, closureOld: true, closureId: 'CL-08', mloop: true, mloopM: 10 });
  j.pts.push({ id: 'j1', poleId: 'PO-1', el: 'Pull-off', status: 'Proposed', E: E0 + 90, N: N0 - 40, att: ['s3', 's4'], ...ll(E0 + 90, N0 - 40) });
  j.spans.push({ ia: 'j1', ib: 's3', a: [E0 + 90, N0 - 40], b: [E0 + 72, N0], len: 44, lenW: 44, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] });
  j.pts.push({ id: 'x1', poleId: 'CO-1', el: 'Cross-over', status: 'Proposed', E: E0 + 150, N: N0 + 40, att: ['s5', 's6'], ...ll(E0 + 150, N0 + 40) });
  j.pts.unshift({ id: 't1', poleId: 'DEMO-TWR', el: 'Site', status: 'Existing', siteName: 'DEMOSITE MIN9001', plaId: 'PLA-9001', E: E0 - 60, N: N0 + 30, ...ll(E0 - 60, N0 + 30) });
  j.spans.unshift({ ia: 't1', ib: 's1', a: [E0 - 60, N0 + 30], b: [E0, N0], len: 67, lenW: 67, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] }); j.runs[0].pts = [[E0 - 60, N0 + 30], ...j.runs[0].pts];
  j.pois = [{ name: 'MADE-UP CHAPEL OF THE DEMO PARISH', E: E0 + 100, N: N0 + 60, kind: 'place_of_worship', icon: 0 }];
  j.lmBlocks = [{ w: 10, h: 10, f: [{ c: '#2050C0', l: [[0, 0, 10, 0, 10, 10, 0, 10]] }, { c: '#FFFFFF', l: [[4, 2, 6, 2, 6, 8, 4, 8]] }] }]; j.lmRefs = ['m:demo-place'];
  j.notes = [{ id: 'n1', kind: 'text', at: [787350, 786180], lines: ['HELLO NOTE THAT IS QUITE LONG', 'SECOND LINE'] }, { id: 'n2', kind: 'text', at: [787250, 786200], lines: ['BOLD NOTE'], bold: true }, ...(over && over.notes ? over.notes : [])];
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
/** The STYLE records of a DXF: [{ name, g: [[code, value]…] }] */
function stylesOf(text) {
  const R = text.split(/\r?\n/), out = []; for (let i = 0; i + 1 < R.length; i += 2) { if (R[i].trim() !== '0' || R[i + 1].trim() !== 'STYLE') continue; const g = []; for (let j = i + 2; j + 1 < R.length && R[j].trim() !== '0'; j += 2) g.push([+R[j].trim(), R[j + 1]]); out.push({ name: (g.find((x) => x[0] === 2) || [])[1], g }); }
  return out;
}
const g1 = (e, c) => { const q = e.g.find((x) => x[0] === c); return q ? q[1].trim() : null; }, gAll = (e, c) => e.g.filter((x) => x[0] === c).map((x) => x[1]);
const mtOf = (e) => gAll(e, 3).join('') + (e.g.find((x) => x[0] === 1) || [0, ''])[1];
const mtLinesOf = (e) => mtOf(e).replace(/\\[LlOoKk]/g, '').replace(/\\[fFCcHhWwQqTtAp][^;]*;/g, '').replace(/[{}]/g, '').split('\\P');
const textsOf = (out, id) => { const E = entsOf(out.text), m = by(out.report.movable, id); return m.handles.map((h) => E.get(h)).filter((e) => e && /TEXT|ATTRIB/.test(e.type)); };
/** a point along a direction (deg): its distance on it */
const along = (q, deg) => q[0] * Math.cos(deg * Math.PI / 180) + q[1] * Math.sin(deg * Math.PI / 180);
const pt = (e, c) => [+g1(e, c), +g1(e, c + 10)];

test('report.fonts: the template\'s text styles, one per font file, then the app\'s; fmt of every text item as drawn', () => {
  const r = T.build(SEED_BL, fullJob({ cloStyle: 'bubble' })), F = r.report.fonts, M = r.report.movable;
  assert.equal(F[0].name, 'Standard'); assert.equal(F[0].kind, 'shx'); assert.equal(F[0].from, 'template');
  assert.equal(new Set(F.map((f) => f.file.toLowerCase())).size, F.length, 'one per font file'); assert.equal(new Set(F.map((f) => f.name)).size, F.length);
  const app = F.filter((f) => f.from === 'app'); assert.deepEqual(app.map((f) => f.name), ['Arial', 'Arial Narrow', 'Times New Roman', 'Courier New', 'Romans', 'Simplex', 'ISOCP']);
  assert.deepEqual(app.map((f) => f.kind), ['ttf', 'ttf', 'ttf', 'ttf', 'shx', 'shx', 'shx']); assert.ok(F.indexOf(app[0]) > F.findIndex((f) => f.name === 'LiberationMono'), 'the template\'s first');
  assert.deepEqual(T.APP_FONTS.map((f) => f.name), app.map((f) => f.name));
  for (const m of M) { if (!m.can || !m.can.text) { assert.equal(m.fmt, undefined, `${m.id}: no fmt`); continue; } assert.deepEqual(Object.keys(m.fmt).sort(), ['align', 'bold', 'font', 'italic', 'spacing', 'underline', 'wrap'], m.id); assert.equal(m.fmt.spacing, 1); assert.equal(m.fmt.wrap, 0); assert.equal(m.fmt.underline, false); assert.ok(F.some((f) => f.name === m.fmt.font), `${m.id}: its font ${m.fmt.font} listed`); }
  const E = entsOf(r.text);
  for (const id of ['lbl:s1', 'lbl:s3', 'lbl:s5', 'lbl:s8']) { const t = textsOf(r, id).find((e) => e.type === 'TEXT'), ha = +(g1(t, 72) || 0); assert.equal(by(M, id).fmt.align, ha === 2 ? 'right' : ha === 1 ? 'center' : 'left', `${id}: as its first line`); }
  assert.ok(['left', 'right'].every((a) => M.some((m) => m.kind === 'details' && m.fmt.align === a)), 'a label beside its pole on the right left-aligned, on the left right-aligned');
  assert.equal(by(M, 'span:s1|s2').fmt.align, 'center'); assert.equal(by(M, 'note:n1').fmt.align, 'center'); assert.equal(by(M, 'span:s1|s2').fmt.font, 'Standard', 'a TEXT in the template\'s Standard');
  assert.equal(by(M, 'note:n2').fmt.bold, true, 'a bold note'); assert.equal(by(M, 'note:n1').fmt.bold, false); assert.equal(by(M, 'sitelbl:t1').fmt.font, 'Standard');
  assert.equal(by(M, 'note:n2').fmt.font, 'Arial', 'an MTEXT\'s \\fArial code: the app\'s Arial (the template has no arial.ttf)');
  for (const id of ['clolbl:s2', 'clolbl:s8']) { const t = textsOf(r, id).find((e) => e.type === 'TEXT'); assert.equal(by(M, id).fmt.align, +g1(t, 72) === 2 ? 'right' : 'left', `${id}: a bubble's lines`); }
  assert.ok(E.size > 0);
  // a template with arial.ttf and romans.shx: its own styles listed, the app's of those files not; the app's names find them
  const R0 = SEED_BL.split(/\r?\n/), nl = SEED_BL.includes('\r\n') ? '\r\n' : '\n', k = R0.findIndex((x, i) => x.trim() === 'STYLE' && R0[i - 1].trim() === '0' && R0.slice(i, i + 12).some((y) => y.trim() === 'Standard'));
  let e = k + 1; while (!(R0[e].trim() === '0')) e += 2; const st = (h, nm, file, fam) => ['0', 'STYLE', '5', h, '330', R0[k + 4], '100', 'AcDbSymbolTableRecord', '100', 'AcDbTextStyleTableRecord', '2', nm, '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', file, '4', '', ...(fam ? ['1001', 'ACAD', '1000', fam, '1071', '34'] : [])];
  R0.splice(e, 0, ...st('9E1', 'arial', 'arial.ttf', 'Arial'), ...st('9E2', 'ROMANS', 'romans.shx', null)); const hs = R0.findIndex((x) => x.trim() === '$HANDSEED'); R0[hs + 2] = '9E3';
  const tb = R0.findIndex((x, i) => x.trim() === 'STYLE' && R0[i - 2] && R0[i - 2].trim() === '2' && R0[i - 3].trim() === 'TABLE'); const c70 = R0.findIndex((x, i) => i > tb && x.trim() === '70'); R0[c70 + 1] = String(+R0[c70 + 1] + 2);
  const seed2 = R0.join(nl), r2 = T.build(seed2, fullJob({ style: { 'span:s1|s2': { font: 'Arial' }, 'span:s2|s3': { font: 'Romans' }, 'span:s3|s4': { font: 'Times New Roman' } } })), F2 = r2.report.fonts;
  assert.ok(F2.some((f) => f.name === 'arial' && f.from === 'template' && f.family === 'Arial') && F2.some((f) => f.name === 'ROMANS' && f.kind === 'shx'), 'the template\'s arial and ROMANS');
  assert.ok(!F2.some((f) => f.name === 'Arial' || f.name === 'Romans'), 'not the app\'s of the same files');
  const t1 = textsOf(r2, 'span:s1|s2')[0], t2 = textsOf(r2, 'span:s2|s3')[0], t3 = textsOf(r2, 'span:s3|s4')[0];
  assert.equal(g1(t1, 7), 'arial'); assert.equal(g1(t2, 7), 'ROMANS', 'the app\'s name finds the template\'s style'); assert.equal(g1(t3, 7), 'G-ESAA TIMES NEW ROMAN');
  assert.equal(by(r2.report.movable, 'span:s2|s3').fmt.font, 'ROMANS'); assert.ok(!stylesOf(r2.text).some((s) => /^G-ESAA (ARIAL|ROMANS)$/.test(s.name)), 'no style made for them');
});

test('align: TEXT 72 and its point, MTEXT attachment column, the lines\' ends in line, the box\'s middle where it was; Standard and Tidy', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const style = { 'lbl:s3': { align: 'right' }, 'lbl:s5': { align: 'center' }, 'span:s1|s2': { align: 'left' }, 'note:n1': { align: 'right' }, 'clolbl:s2': { align: 'center' }, 'lm:MADE-UP CHAPEL OF THE DEMO PARISH@787400,786160': { align: 'left' } };
    const r0 = T.build(SEED_BL, fullJob({ ...v, cloStyle: 'bubble' })), r = T.build(SEED_BL, fullJob({ ...v, cloStyle: 'bubble', style, styleKind: { sitedetails: { align: 'left' } } })), M0 = r0.report.movable, M = r.report.movable;
    for (const [id, a] of [...Object.entries(style).map(([k, x]) => [k, x.align]), ['sitelbl:t1', 'left']]) {
      const m = by(M, id), m0 = by(M0, id); assert.ok(m, `${JSON.stringify(v)} ${id}`); assert.equal(m.fmt.align, a, `${id}: fmt`); assert.deepEqual(m.text, m0.text, `${id}: its words`);
      if (id !== 'clolbl:s2') { near(m.box[0], m0.box[0], 1e-6, `${JSON.stringify(v)} ${id}: its middle (E)`); near(m.box[1], m0.box[1], 1e-6, `${id}: its middle (N)`); } // (a bubble: beside its pointer's tip, as the plan lays it out)
      const T1 = textsOf(r, id), ha = { left: 0, center: 1, right: 2 }[a], deg = m.box[4];
      const ends = T1.filter((e) => +(g1(e, 62) || 0) !== 250).map((e) => { // (each line's end on its aligned side, along the item's own way)
        if (e.type === 'MTEXT') { const att = +g1(e, 71); assert.equal((att - 1) % 3, ha, `${id}: an MTEXT's attachment column`); return along(pt(e, 10), deg); }
        assert.equal(+(g1(e, 72) || 0), ha, `${id}: a TEXT's 72`); return along(pt(e, ha || +(g1(e, 73) || 0) || +(g1(e, 74) || 0) ? 11 : 10), deg); });
      if (ends.length > 1) for (const x of ends) near(x, ends[0], 1e-6, `${JSON.stringify(v)} ${id}: the lines' ${a} ends in line`);
    }
    // a bubble centred: its lines centred on one point, their shadows with them
    const bt = textsOf(r, 'clolbl:s2'), sh = bt.filter((e) => +(g1(e, 62) || 0) === 250); assert.ok(sh.length > 0 && sh.every((e) => +g1(e, 72) === 1), 'the shadows centred too');
    // Tidy: a block's number beside its first line still
    if (v.labels) { const n = by(M, 'num:s3'), n0 = by(M0, 'num:s3'); assert.ok(Math.hypot(n.box[0] - n0.box[0], n.box[1] - n0.box[1]) < 3, 'its number with the block'); }
  }
});

test('wrap: lines broken at spaces as the plan measures them (TEXT copies, MTEXT \\P), fewer the wider, a long word whole; report text as written; spacing', () => {
  const words = (L) => L.join(' ').split(/\s+/).filter(Boolean);
  // a note (an MTEXT): its lines as GeDxfTpl.wrapLine breaks them, at its height times h; more lines the narrower; a word wider than the width whole
  const n1 = ['HELLO NOTE THAT IS QUITE LONG', 'SECOND LINE'], h0 = 2.2; let prev = Infinity;
  for (const W of [4, 12, 20, 40, 200]) for (const hh of [1, 2]) {
    const r = T.build(SEED_BL, fullJob({ style: { 'note:n1': { wrap: W, ...(hh !== 1 ? { h: hh } : {}) } } })), m = by(r.report.movable, 'note:n1'), e = textsOf(r, 'note:n1')[0], L = mtLinesOf(e);
    assert.deepEqual(L, n1.flatMap((s) => T.wrapLine(s, W / hh, h0, false)), `wrap ${W} m, h ${hh}: the lines as wrapLine makes them`);
    assert.deepEqual(words(L), words(n1), 'its words, in order'); assert.deepEqual(m.text, n1, 'report text: as written'); assert.equal(m.fmt.wrap, W);
    for (const s of L) assert.ok(T.textWidth(s, h0 * hh) <= W + 1e-9 || !s.includes(' '), `"${s}": no wider than ${W} m, else one word`);
    if (hh === 1) { assert.ok(L.length <= prev, 'fewer lines the wider'); prev = L.length; }
    if (W === 200) assert.deepEqual(L, n1, 'wide enough: as written');
  }
  for (const v of [{}, { labels: 'tidy' }]) {
    // a Standard label (a TEXT and an MTEXT) and a Tidy block (MTEXTs): the long line broken, its look kept; a bubble's lines; a cable's name (a TEXT)
    const r0 = T.build(SEED_BL, fullJob({ ...v, cloStyle: 'bubble' })), r = T.build(SEED_BL, fullJob({ ...v, cloStyle: 'bubble', style: { 'lbl:s3': { wrap: 8 }, 'clolbl:s2': { wrap: 9 }, 'cabname:t1|s3#1': { wrap: 14 } } })), M = r.report.movable;
    for (const id of ['lbl:s3', 'clolbl:s2', 'cabname:t1|s3#1']) {
      const m = by(M, id), m0 = by(r0.report.movable, id); assert.deepEqual(m.text, m0.text, `${JSON.stringify(v)} ${id}: report text as written`);
      const T0 = textsOf(r0, id), T1 = textsOf(r, id), n = (L) => L.reduce((s, e) => s + (e.type === 'MTEXT' ? mtLinesOf(e).length : +(g1(e, 62) || 0) === 250 ? 0 : 1), 0);
      assert.ok(n(T1) > n(T0), `${JSON.stringify(v)} ${id}: more lines (${n(T0)} → ${n(T1)})`);
      const rd = (L) => L.filter((e) => +(g1(e, 62) || 0) !== 250).flatMap((e) => (e.type === 'MTEXT' ? mtLinesOf(e) : [e.text])).map((s) => s.replace(/%%d/gi, '°'));
      assert.deepEqual(words(rd(T1)).sort(), words(m0.text).sort(), `${id}: its words`);
      const tx = T1.filter((e) => e.type === 'TEXT'); for (const e of tx) { const e0 = T0.find((x) => x.type === 'TEXT' && x.layer === e.layer && g1(x, 7) === g1(e, 7) && g1(x, 40) === g1(e, 40)); assert.ok(e0, `${id}: a piece in its line's look (layer, style, height)`); }
    }
    const bs = textsOf(r, 'clolbl:s2'), green = bs.filter((e) => +(g1(e, 62) || 0) === 3), shad = bs.filter((e) => +(g1(e, 62) || 0) === 250); assert.equal(shad.length, green.length, 'a bubble\'s green pieces each with its shadow');
    const bub = r.report.closureLabels.bubbles.find((b) => b.cid === 'CL-01'); assert.ok(bub.lines.length > 4, 'report.closureLabels: the lines as written now');
  }
  // spacing: an MTEXT's 44; a label's rows further apart, its middle where it was
  const r0 = T.build(SEED_BL, fullJob({})), r = T.build(SEED_BL, fullJob({ style: { 'note:n1': { spacing: 2 }, 'lbl:s4': { spacing: 2 } } }));
  assert.equal(+g1(textsOf(r, 'note:n1')[0], 44), 2); assert.equal(+g1(textsOf(r0, 'note:n1')[0], 44), 1);
  const gap = (out) => { // (the label's rows: its first line's top (a TEXT centred on its point) to its lat / long's (an MTEXT: its top from its attachment's row))
    const L = textsOf(out, 'lbl:s4'), d = by(out.report.movable, 'lbl:s4').box[4] + 90, t = L.find((e) => e.type === 'TEXT'), mt = L.find((e) => e.type === 'MTEXT'), h = +g1(mt, 40), H = h + (mtLinesOf(mt).length - 1) * h * 5 / 3 * +g1(mt, 44), rw = Math.floor((+g1(mt, 71) - 1) / 3);
    assert.equal(+g1(t, 73), 2); return along(pt(t, 11), d) + +g1(t, 40) / 2 - (along(pt(mt, 10), d) + rw / 2 * H); };
  near(gap(r), 2 * gap(r0), 1e-6, 'the rows twice as far apart');
  for (const id of ['note:n1', 'lbl:s4']) { const a = by(r.report.movable, id), b = by(r0.report.movable, id); near(a.box[0], b.box[0], 1e-6, `${id}: its middle`); near(a.box[1], b.box[1], 1e-6, `${id}: its middle`); assert.equal(a.fmt.spacing, 2); }
  // a clamp tag wrapped: its frame round its lines, taller and narrower; its callout to the frame's edge
  const jc = (st) => { const j = fullJob({ style: st }); Object.assign(j.pts.find((p) => p.id === 's3'), { clampType: 'DEG GCA' }); return j; };
  const fr = (out) => { const E = entsOf(out.text), es = by(out.report.movable, 'clamp:s3').handles.map((h) => E.get(h)), bx = es.find((e) => e.type === 'LWPOLYLINE' && (+g1(e, 70) & 1)), ld = es.find((e) => e.type === 'LWPOLYLINE' && !(+g1(e, 70) & 1)), X = gAll(bx, 10).map(Number), Y = gAll(bx, 20).map(Number), tx = es.filter((e) => e.type === 'TEXT');
    return { n: tx.length, ys: tx.map((e) => +g1(e, 21)), x0: Math.min(...X), x1: Math.max(...X), y0: Math.min(...Y), y1: Math.max(...Y), lead: gAll(ld, 10).map(Number).concat(gAll(ld, 20).map(Number)) }; };
  const c0 = fr(T.build(SEED_BL, jc({}))), c1 = fr(T.build(SEED_BL, jc({ 'clamp:s3': { wrap: 5 } })));
  assert.equal(c0.n, 1); assert.equal(c1.n, 3, 'DEG / GCA / 8-10'); assert.ok(c1.ys.every((y) => y > c1.y0 && y < c1.y1), 'its lines inside its frame'); assert.ok(c1.y1 - c1.y0 > c0.y1 - c0.y0 && c1.x1 - c1.x0 < c0.x1 - c0.x0, 'its frame taller and narrower');
  const ed = (c) => Math.min(...[c.lead[0], c.lead[1]].map((x) => Math.min(Math.abs(x - c.x0), Math.abs(x - c.x1)))); near(ed(c1), ed(c0), 1e-3, 'its callout ends at the frame, as before');
});

test('font and underline: a style made once per font (bold, italic: its files and flags), the template\'s own as it is, MTEXT codes; an SHX font not bold; %%u, \\L … \\l', () => {
  const style = { 'lbl:s2': { font: 'Times New Roman', underline: true }, 'lbl:s3': { font: 'Courier New', bold: true }, 'lbl:s4': { font: 'arial narrow', italic: true }, 'span:s1|s2': { font: 'Romans', bold: true }, 'span:s2|s3': { underline: false },
    'note:n1': { font: 'Times New Roman', underline: true }, 'note:n2': { font: 'Simplex' }, 'lbl:s6': { font: 'LiberationSerif' }, 'num:s5': { font: 'Courier New', underline: true } };
  for (const v of [{}, { labels: 'tidy' }]) {
    const r = T.build(SEED_BL, fullJob({ ...v, cloStyle: 'bubble', style, styleKind: { span: { font: 'Times New Roman', underline: true }, closurelabel: { font: 'Times New Roman' } } })), M = r.report.movable, ST = stylesOf(r.text), sn = (nm) => ST.filter((s) => s.name === nm);
    const xd = (s) => { const k = s.g.findIndex((x) => x[0] === 1001 && x[1].trim() === 'ACAD'); return k < 0 ? null : { fam: (s.g.slice(k).find((x) => x[0] === 1000) || [])[1], fl: +(s.g.slice(k).find((x) => x[0] === 1071) || [0, 0])[1] }; }, gs = (s, c) => (s.g.find((x) => x[0] === c) || [])[1];
    // the styles: one each, their files, family and flags (bold 0x2000000, italic 0x1000000); an SHX one without
    assert.equal(sn('G-ESAA TIMES NEW ROMAN').length, 1, 'Times: one style for all its texts'); assert.equal(gs(sn('G-ESAA TIMES NEW ROMAN')[0], 3), 'times.ttf'); assert.deepEqual(xd(sn('G-ESAA TIMES NEW ROMAN')[0]), { fam: 'Times New Roman', fl: 18 });
    if (!v.labels) { const cb = sn('G-ESAA COURIER NEW B'); assert.equal(cb.length, 1); assert.equal(gs(cb[0], 3), 'courbd.ttf'); assert.equal(xd(cb[0]).fl, 49 + 0x2000000, 'Courier New bold'); const ni = sn('G-ESAA ARIAL NARROW I'); assert.equal(ni.length, 1); assert.equal(gs(ni[0], 3), 'arialni.ttf'); assert.equal(xd(ni[0]).fl, 34 + 0x1000000); }
    const ro = sn('G-ESAA ROMANS'); assert.equal(ro.length, 1); assert.equal(gs(ro[0], 3), 'romans.shx'); assert.equal(xd(ro[0]), null, 'an SHX font: no TrueType data'); assert.ok(!ST.some((s) => /^G-ESAA ROMANS B/.test(s.name)), 'no bold SHX style');
    assert.ok(!ST.some((s) => /^G-ESAA LIBERATIONSERIF/.test(s.name)), 'the template\'s own font: its style, none made'); assert.ok(!ST.some((s) => /^G-ESAA ARIAL B$/.test(s.name)), 'no Arial bold left over for a text in Courier bold');
    for (const s of ST.filter((x) => /^G-ESAA /.test(x.name))) { assert.equal(gs(s, 330), gs(ST[0], 330), `${s.name}: owned by the STYLE table`); assert.ok(/^[0-9A-F]+$/.test(gs(s, 5).trim()), `${s.name}: a handle`); }
    // the texts: TEXT / ATTRIB group 7, %%u; MTEXT codes, \L … \l
    const tx = (id) => textsOf(r, id), main = (L) => L.filter((e) => +(g1(e, 62) || 0) !== 250);
    for (const e of tx('lbl:s2')) { if (e.type === 'TEXT') { assert.equal(g1(e, 7), 'G-ESAA TIMES NEW ROMAN'); assert.ok(/^%%u/.test(e.text), 'underlined'); } else { assert.ok(mtOf(e).includes('\\fTimes New Roman|b0|i0|c0|p18;'), mtOf(e)); assert.ok(/^\\L.*\\l$/.test(mtOf(e)), 'underlined'); } }
    if (!v.labels) { for (const e of tx('lbl:s3')) assert.ok(e.type === 'TEXT' ? g1(e, 7) === 'G-ESAA COURIER NEW B' : mtOf(e).includes('\\fCourier New|b1|i0|c0|p49;'), 'Courier New bold'); assert.equal(by(M, 'lbl:s3').fmt.bold, true); }
    for (const e of tx('span:s1|s2')) assert.equal(g1(e, 7), 'G-ESAA ROMANS'); assert.equal(by(M, 'span:s1|s2').fmt.bold, false, 'an SHX font: not bold'); assert.equal(by(M, 'span:s1|s2').fmt.font, 'Romans');
    assert.ok(!/%%u/i.test(tx('span:s2|s3')[0].text) && /^%%u/.test(tx('span:s3|s4')[0].text), 'the kind\'s underline, one span\'s own off'); assert.equal(g1(tx('span:s2|s3')[0], 7), 'G-ESAA TIMES NEW ROMAN', 'the kind\'s font');
    const n1 = tx('note:n1')[0]; assert.ok(/^\\L\{\\fTimes New Roman\|b0\|i0\|c0\|p18;HELLO NOTE THAT IS QUITE LONG\\PSECOND LINE\}\\l$/.test(mtOf(n1)), mtOf(n1));
    const n2 = tx('note:n2')[0]; assert.ok(mtOf(n2).includes('\\Fsimplex.shx;') && !/\\f/.test(mtOf(n2)), `a bold note in Simplex: ${mtOf(n2)}`); assert.equal(by(M, 'note:n2').fmt.bold, false);
    for (const e of tx('lbl:s6')) assert.equal(g1(e, 7), 'LiberationSerif', 'the template\'s style'); assert.ok(tx('lbl:s6').filter((e) => e.type === 'MTEXT').every((e) => !/\\[fF]/.test(mtOf(e))), 'an MTEXT in it: its codes out (no family known)');
    const nm = main(tx('num:s5')), sh = tx('num:s5').filter((e) => +(g1(e, 62) || 0) === 250); assert.ok(nm.every((e) => /^%%u/.test(e.text) && g1(e, 7) === 'G-ESAA COURIER NEW') && sh.every((e) => /^%%u/.test(e.text) && g1(e, 7) === 'G-ESAA COURIER NEW'), 'a number and its shadow alike');
    for (const id of ['lbl:s2', 'note:n1', 'num:s5']) { assert.equal(by(M, id).fmt.underline, true, id); assert.deepEqual(by(M, id).text, by(T.build(SEED_BL, fullJob({ ...v, cloStyle: 'bubble' })).report.movable, id).text, `${id}: report text without the codes`); }
    assert.equal(by(M, 'lbl:s4').fmt.font, 'Arial Narrow', 'the name in any case'); assert.equal(by(M, 'lbl:s6').fmt.font, 'LiberationSerif');
    assert.ok(main(tx('clolbl:s2')).every((e) => g1(e, 7) === 'G-ESAA TIMES NEW ROMAN') && tx('clolbl:s2').filter((e) => +(g1(e, 62) || 0) === 250).every((e) => g1(e, 7) === 'G-ESAA TIMES NEW ROMAN'), 'a bubble\'s lines and shadows');
  }
});

test('the PDF and the Drawing: Times and Courier (only when used), narrow, underlines; the display list\'s families and aligned lines', async () => {
  const deflate = async (b) => new Uint8Array(require('node:zlib').deflateSync(Buffer.from(b)));
  const style = { 'lbl:s2': { font: 'Times New Roman', underline: true }, 'lbl:s3': { font: 'Courier New', bold: true, align: 'right', wrap: 8 }, 'lbl:s4': { font: 'Arial Narrow' }, 'note:n1': { underline: true, align: 'right' } };
  const r0 = T.build(SEED_BL, fullJob({})), r = T.build(SEED_BL, fullJob({ style })), M = r.report.movable;
  const p0 = Buffer.from(await PDF.toPdf(r0.text, { title: 'MADE-UP', deflate })).toString('latin1'), p = Buffer.from(await PDF.toPdf(r.text, { title: 'MADE-UP', deflate })).toString('latin1');
  for (const f of ['Times-Roman', 'Courier-Bold']) { assert.ok(p.includes(`/BaseFont /${f} `), `the PDF has ${f}`); assert.ok(!p0.includes(`/BaseFont /${f} `), `a PDF without it: no ${f}`); }
  assert.ok(!p.includes('/BaseFont /Times-Bold '), 'only the fonts used'); assert.ok(/\/F5 \d+ 0 R/.test(p) && /\/F10 \d+ 0 R/.test(p), 'in each page\'s resources');
  const L0 = PDF.planList(r0.text, r0.report), L = PDF.planList(r.text, r.report), ix = (id) => M.findIndex((m) => m.id === id), owned = (pl, i, kind) => { const out = []; for (let k = 0; k < pl.own.length; k++) if (pl.own[k] === i && pl.items[4 * k] === kind) out.push(pl.items[4 * k + 1]); return out; };
  const ix0 = (id) => r0.report.movable.findIndex((m) => m.id === id);
  assert.ok(owned(L, ix('lbl:s2'), 3).every((k) => L.texts[k].ff === 1), 'Times: ff 1'); assert.ok(owned(L, ix('lbl:s3'), 3).every((k) => L.texts[k].ff === 2 && L.texts[k].f === 1), 'Courier bold: ff 2, f 1');
  assert.ok(owned(L, ix('lbl:s4'), 3).every((k) => !L.texts[k].ff), 'narrow: Helvetica (ff none)');
  const nw = (pl, id, i0) => owned(pl, i0, 3).map((k) => pl.texts[k].w * Math.hypot(pl.texts[k].m[0], pl.texts[k].m[1])).reduce((a, b) => a + b, 0); assert.ok(nw(L, 'lbl:s4', ix('lbl:s4')) < 0.86 * nw(L0, 'lbl:s4', ix0('lbl:s4')), 'narrow: its lines narrowed');
  assert.ok(owned(L, ix('lbl:s2'), 0).length >= owned(L0, ix0('lbl:s2'), 0).length + 3, 'its 3 lines underlined: line items of its own'); assert.ok(owned(L, ix('note:n1'), 0).length >= 2, 'a note\'s 2 lines underlined');
  // the right-aligned label's lines (its TEXTs and its MTEXT's lines) end at one place, as printed
  const deg = by(M, 'lbl:s3').box[4] * Math.PI / 180, ends = owned(L, ix('lbl:s3'), 3).map((k) => { const t = L.texts[k], m = t.m, x = m[0] * t.w + m[4], y = m[1] * t.w + m[5]; return x * Math.cos(deg) + y * Math.sin(deg); });
  assert.ok(ends.length >= 4, 'its lines, wrapped'); for (const x of ends) near(x, ends[0], 0.02, 'right ends in line (the display list; its numbers to 1/100 pt)');
  const ne = owned(L, ix('note:n1'), 3).map((k) => { const t = L.texts[k]; return t.m[0] * t.w + t.m[4]; }); for (const x of ne) near(x, ne[0], 0.02, 'a note\'s right ends in line');
});

test('byte for byte: without the format fields (or with them as drawn, or not valid) the DXF as beta 7.13 made it', () => {
  // [template, labels, job, SHA-256 (first 16) of beta 7.13's DXF (dxftpl.js of 933ad3b)]: the route with every kind, bubbles; and with 7.10–7.13's own fields
  const WANT = [['blocks', 'std', 'full', 'f679f27a398bc726'], ['blocks', 'tidy', 'full', 'a562638a1d590959'], ['blocks', 'std', 'edit', 'a9d088b7212db52c'], ['blocks', 'tidy', 'edit', 'ce8ae8c017f0e2fe'],
    ['square', 'std', 'edit', '1ccceede8ab8c306'], ['square', 'tidy', 'full', 'cdf21e72d9b08ac9']];
  const X = { full: { cloStyle: 'bubble' },
    edit: { text: { 'lbl:s3': ['EDITED', 'TWO', 'THREE'], 'span:s1|s2': ['40m'], 'clolbl:s2': ['A', 'B'] }, hide: ['lbl:s4', 'road:MADE-UP ST#1'], order: [{ id: 'note:n1', op: 'back' }, { id: 'lbl:s3', op: 'front' }], style: { 'lbl:s5': { h: 1.4, bold: true, color: 3 }, 'note:n2': { italic: true, scale: 1.3 }, 'span:s5|s6': { italic: true } }, styleKind: { loop: { color: 4 } }, pins: { 'span:s1|s2': { at: [0, -14] }, 'clo:s6': { along: 8 }, 'num:s3': { at: [12, 14] } } } };
  const NOOP = { style: { 'span:s2|s3': { align: 'center', font: 'Standard', spacing: 1, wrap: 0, underline: false }, 'lbl:s7': { align: 'middle', wrap: -2, spacing: 'abc', font: 'NO SUCH FONT', underline: 'yes' } }, styleKind: { road: { wrap: 0, spacing: 0 } } }; // (as drawn: a centred span in its font; not valid: none)
  const merge = (a, b) => { const o = JSON.parse(JSON.stringify(a)); for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(o[k] || {}), ...v } : v; return o; };
  const S = { blocks: SEED_BL, square: SEED_SQ }, got = [];
  for (const [sn, lab, xn] of WANT) {
    const x = { ...(lab === 'tidy' ? { labels: 'tidy' } : {}), ...JSON.parse(JSON.stringify(X[xn])) }, out = T.build(S[sn], fullJob(x));
    if (got.length % 2 === 0) assert.ok(T.build(S[sn], fullJob(merge(x, NOOP))).text === out.text, `${sn} ${lab} ${xn}: the same with the format as drawn or not valid`); // (every other one: a Tidy plan is slow)
    got.push([sn, lab, xn, sha(out.text)]);
  }
  assert.deepEqual(got, WANT, 'as beta 7.13 made them');
});
