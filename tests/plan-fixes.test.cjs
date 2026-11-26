/* (beta 7.15, Fixes) the plan builder (dxftpl.js, in Node, as the app's worker runs it) and the Drawing's display list (dxfpdf.js) for the owner's
   "some users unable to export files due to : Export failed: Cannot read properties of null (reading 'id')" and "Making plan preview error" (the
   released main 2.45.16 / beta 7.14).
   Run: node --test tests/plan-fixes.test.cjs (or python3 tests/run_all.py --only plan-fixes).
   - Plan style › 20 m loops at boxes: Written (pts[].boxLoop): each box's "20m LOOP" an item of its box (loop:<id>, its point the box's, no pole); the
     plan built (since beta 7.11 the end of the build read the id of the loop's pole, a box has none: no export, no plan preview) for every kind of box
     (handhole, manhole, service box, ODC, ODF, an OLT site, a tower), Standard and Tidy, placed by hand too; the Drawing's display list made.
   - (beta 7.16, Fixes) the owner's "can you put the latlong coordinates directly below the element? as you can see here, the MH-0003 and latlong is on different side or
     away from each other": a handhole's, manhole's, service box's, ODC's, ODF's, OLT site's, a NAP's and a closure's (on its own) lat / long right
     under its ID (as a pole's details: turned with it; Tidy: its label's smaller lines), its place found with the ID's; one item, its lines the ID
     then lat and long (an OLT site's: its name's item); placed by hand, both move. Crowded places Auto: the ID's thin line to the block's edge.
   - (beta 7.16, Fixes) byte for byte: a plan without them (poles, a tower, a pull-off and a cross-over, a NAP and a closure on a pole, a closure with a bubble callout,
     boxes the template has no symbol for, a NAP and an ODC with no ID) as beta 7.14 made it (its SHA-256).
   Every name, number and place is made up; tests/fixtures/plan-seed-made-up-blocks.dxf is the made-up template with plain made-up symbols (its
   handhole's block renamed here to stand for a manhole's or a service box's). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED = fs.readFileSync(path.join(FX, 'plan-seed-made-up.dxf'), 'utf8');
const SEED_BL = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));
/** the made-up template with its handhole's block standing for another box's (a manhole's, a service box's: the template's names for them) */
const SEEDS = { blocks: SEED_BL, manhole: SEED_BL.split('proposed Handhole').join('PROPOSED MAN HOLE'), 'service box': SEED_BL.split('proposed Handhole').join('proposed service box'), plain: SEED };

/** 12 made-up poles 36 m apart along a made-up street that turns a corner at s6 (an L), each with a photo and a number (as drawing-snap.test.cjs's). */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
const E0 = 787300, N0 = 786100, ll = (E, N) => ({ lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 });
/** the made-up route with a branch off s3 (a handhole, a manhole, a service box, an ODC and an ODF, 32 m apart) and one off s9 (an OLT site, a
    tower), each with the loop the PMI counts there (pts[].boxLoop, as the app sends it with Plan style › 20 m loops at boxes: Written) */
function boxJob(over, loops = true) {
  const j = madeUpJob(over), add = (p, from) => { const a = j.pts.find((q) => q.id === from); j.pts.push(p); j.spans.push({ ia: from, ib: p.id, a: [a.E, a.N], b: [p.E, p.N], len: 32, lenW: 32, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] }); };
  let prev = 's3'; [['h1', 'Handhole', 'HH-0001'], ['m1', 'Manhole', 'MH-0003'], ['b1', 'Service box', 'SB-0007'], ['c1', 'ODC', 'ODC-0002'], ['f1', 'ODF', 'ODF-0001']].forEach(([id, el, pid], i) => {
    const E = E0 + 72, N = N0 - 32 * (i + 1); add({ id, poleId: pid, el, status: 'Proposed', E, N, ...ll(E, N), ...(loops ? { boxLoop: 20 } : {}) }, prev); prev = id; });
  add({ id: 'l1', poleId: 'OLT-0001', el: 'Site', siteKind: 'OLT', siteName: 'MADE-UP OLT', status: 'Existing', E: E0 + 230, N: N0 + 108, ...ll(E0 + 230, N0 + 108), ...(loops ? { boxLoop: 20 } : {}) }, 's9');
  add({ id: 't1', poleId: 'TWR-0001', el: 'Site', siteName: 'MADE-UP TOWER', plaId: 'PLA-0001', status: 'Existing', E: E0 + 225, N: N0 + 180, ...ll(E0 + 225, N0 + 180), ...(loops ? { boxLoop: 20 } : {}) }, 's11');
  return j;
}
const by = (M, id) => M.find((m) => m.id === id);
/** The entity types of a DXF's ENTITIES by handle. */
function typesOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let inE = false, t = null;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1].trim(); if (c === 0 && v === 'SECTION') inE = (R[i + 3] || '').trim() === 'ENTITIES'; if (!inE) continue; if (c === 0) t = v; else if (c === 5 && t) { out.set(v, t); t = null; } }
  return out;
}
const BOXES = ['h1', 'm1', 'b1', 'c1', 'f1', 'l1', 't1'];
/** The records of a DXF's ENTITIES by handle, in the order written: [code, value] pairs, type, layer, text. */
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null, inE = false;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0 && v.trim() === 'SECTION') inE = (R[i + 3] || '').trim() === 'ENTITIES'; if (!inE) continue;
    if (c === 0) { cur = v.trim() === 'ENDSEC' ? null : { type: v.trim(), g: [] }; continue; } if (!cur) continue; cur.g.push([c, v]); if (c === 5 && !cur.h) { cur.h = v.trim(); out.set(cur.h, cur); } else if (c === 8 && cur.layer == null) cur.layer = v; else if (c === 1 && cur.text == null) cur.text = v; }
  return out;
}
const g1 = (e, c, dv) => { const q = e.g.find((x) => x[0] === c); return q ? q[1] : dv; };
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
/** boxJob with no loops, a NAP (n1) and a closure (k1) on their own, an ODF with its size (f1) */
function llJob(over) {
  const j = boxJob(over, false); j.pts.find((p) => p.id === 'f1').odfSz = '48';
  j.pts.push({ id: 'n1', poleId: 'NAP-0009', el: 'NAP', status: 'Proposed', E: E0 + 300, N: N0 + 40, ...ll(E0 + 300, N0 + 40) }, { id: 'k1', poleId: 'CL-0009', el: 'Closure', status: 'Proposed', E: E0 + 300, N: N0 - 40, ...ll(E0 + 300, N0 - 40) });
  return j;
}
const LLS = (p) => [`${(+p.lat).toFixed(6)}°`, `${(+p.lon).toFixed(6)}°`];
/** each kind's item: [its point, its item, its seed, its lines before the lat / long] */
const LLK = [['h1', 'pole:h1', 'blocks', ['HH-0001']], ['m1', 'pole:m1', 'manhole', ['MH-0003']], ['b1', 'pole:b1', 'service box', ['SB-0007']], ['c1', 'sitelbl:c1', 'blocks', ['ODC-0002']], ['f1', 'sitelbl:f1', 'blocks', ['ODF-0001', '48 ODF']],
  ['l1', 'sitename:l1', 'blocks', ['MADE-UP OLT']], ['n1', 'nap:n1', 'blocks', ['NAP-0009']], ['k1', 'clolbl:k1', 'blocks', ['CL-0009', 'JT']]];
/** an item's ID (its first text, or the block's ID attribute) and its lat / long (the MTEXT with its degrees): the lat / long's top in the ID's frame
    (x along the ID, y up it, from the ID's middle), the ID's height and half width, both turned alike */
function llPlace(out, m) {
  const E = entsOf(out.text), es = m.handles.map((h) => E.get(h)), mt = es.find((e) => e.type === 'MTEXT' && /%%D/.test(es.length && (g1(e, 3, '') + g1(e, 1, ''))));
  const id = es.find((e) => (e.type === 'TEXT' || e.type === 'ATTRIB') && String(e.text || '').trim()), h = +g1(id, 40), a = +g1(id, 50, 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
  const al = +g1(id, 72, 0), va = +g1(id, id.type === 'ATTRIB' ? 74 : 73, 0), q = al || va ? [+g1(id, 11), +g1(id, 21)] : [+g1(id, 10), +g1(id, 20)], w = String(id.text).length * h * 0.6;
  const mid = [q[0] + u[0] * (al === 1 || al === 4 ? 0 : al === 2 ? -w / 2 : w / 2) + v[0] * (va === 2 ? 0 : va === 3 ? -h / 2 : h / 2), q[1] + u[1] * (al === 1 || al === 4 ? 0 : al === 2 ? -w / 2 : w / 2) + v[1] * (va === 2 ? 0 : va === 3 ? -h / 2 : h / 2)];
  const t = [+g1(mt, 10), +g1(mt, 20)], d = [t[0] - mid[0], t[1] - mid[1]], dir = g1(mt, 11) != null ? Math.atan2(+g1(mt, 21), +g1(mt, 11)) : 0;
  const fr = (z) => [(z[0] - mid[0]) * u[0] + (z[1] - mid[1]) * u[1], (z[0] - mid[0]) * v[0] + (z[1] - mid[1]) * v[1]];
  return { x: d[0] * u[0] + d[1] * u[1], y: d[0] * v[0] + d[1] * v[1], h, w, turn: Math.abs(Math.atan2(Math.sin(dir - a), Math.cos(dir - a))) * 180 / Math.PI, att: +g1(mt, 71), mt, id, fr };
}

test('a loop written at every kind of box (Plan style › 20 m loops at boxes: Written): the plan built, Standard and Tidy; each loop its box\'s item; the display list made', () => {
  for (const [sn, seed] of Object.entries(SEEDS)) for (const v of [{}, { labels: 'tidy' }, { crowd: { move: 15, min: 0.75 } }]) {
    const tag = `${sn} ${JSON.stringify(v)}`; let r;
    assert.doesNotThrow(() => { r = T.build(seed, boxJob(v)); }, `${tag}: built (was "Cannot read properties of null (reading 'id')")`);
    const M = r.report.movable;
    assert.deepEqual(r.report.boxLoops, { written: BOXES.length, of: BOXES.length }, `${tag}: every loop written`);
    for (const id of BOXES) {
      const m = by(M, `loop:${id}`); assert.ok(m, `${tag}: loop:${id} an item`);
      assert.equal(m.kind, 'loop'); assert.equal(m.point, id, `${tag}: loop:${id} its box's`); assert.equal(m.pole, undefined, `${tag}: loop:${id} on no pole`);
      assert.deepEqual(m.text, ['20m LOOP']); assert.equal(m.can.lead, true);
    }
    if (sn === 'blocks') assert.ok(!(by(M, 'pole:h1').with || []).length, 'a box carries nothing by its with (its loop goes with it by its point)');
    const pl = PDF.planList(r.text, r.report); assert.ok(pl && pl.items && pl.items.length > 0, `${tag}: the Drawing's display list made (the plan preview)`);
  }
});

test('a box\'s loop placed by hand, turned, sized, edited, hidden; its box moved by hand: the plan built, the loop where it was put with its thin line', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, boxJob(v)), m0 = by(r0.report.movable, 'loop:m1');
    const r1 = T.build(SEED_BL, boxJob({ ...v, pins: { 'loop:m1': { at: [9, -14], rot: 30 }, 'loop:h1': { at: [-12, 6] } }, style: { 'loop:c1': { h: 1.6, color: 3 } }, text: { 'loop:f1': ['20m LOOP', 'AT THE ODF'] }, hide: ['loop:b1'], poleAt: { m1: [E0 + 76, N0 - 66] } }));
    const M = r1.report.movable, m1 = by(M, 'loop:m1'), b1 = by(M, 'loop:b1'), f1 = by(M, 'loop:f1');
    assert.equal(m1.how, 'by hand'); assert.ok(Math.hypot(m1.box[0] - m0.box[0], m1.box[1] - m0.box[1]) > 5, `${JSON.stringify(v)}: moved`); assert.ok(Math.abs(m1.box[4] - 30) < 0.01, 'turned');
    const ty = typesOf(r1.text); assert.deepEqual(m1.handles.map((h) => ty.get(h)), ['TEXT', 'LWPOLYLINE'], 'its text and its thin line to its box');
    assert.equal(b1.hidden, true); assert.deepEqual(f1.text, ['20m LOOP', 'AT THE ODF']);
    assert.ok(PDF.planList(r1.text, r1.report), 'the display list made');
  }
});

test('the lat / long right under the ID, as one block, one item (the ID, then lat and long): every kind of point that is not a pole, Standard, Tidy and Crowded places Auto', () => {
  const S = { blocks: SEED_BL, manhole: SEEDS.manhole, 'service box': SEEDS['service box'] };
  for (const v of [{}, { labels: 'tidy' }, { crowd: { move: 15, min: 0.75 } }, { poleStyle: { llH: 2, llColor: 3 } }]) for (const [sn, seed] of Object.entries(S)) {
    const j = llJob(v), r = T.build(seed, j), M = r.report.movable;
    for (const [pid, id, s0, lines] of LLK) {
      if (s0 !== sn) continue; const tag = `${JSON.stringify(v)} ${id}`, m = by(M, id), p = j.pts.find((x) => x.id === pid);
      assert.ok(m, `${tag}: an item`); assert.deepEqual(m.text, [...lines, ...LLS(p)], `${tag}: its lines, the ID then lat and long`);
      assert.equal(M.filter((x) => x.point === pid && (x.text || []).includes(LLS(p)[0])).length, 1, `${tag}: the lat / long in one item only`);
      const P = llPlace(r, m);
      assert.ok(P.turn < 0.01, `${tag}: turned as its ID (${P.turn})`);
      assert.ok(P.y < -0.5 * P.h && P.y > -(0.5 + 0.4 + (v.labels ? 0.2 : 0.05)) * P.h - 0.6 * lines.length * P.h * 1.5, `${tag}: right under the ID (${P.y.toFixed(2)}, its height ${P.h.toFixed(2)})`);
      assert.ok(Math.abs(P.x) <= P.w / 2 + 0.6 * P.h, `${tag}: under it, not beside it (${P.x.toFixed(2)})`);
      if (v.poleStyle) { near(+g1(P.mt, 40), 2, 1e-9, `${tag}: Plan style's lat / long height`); assert.equal(g1(P.mt, 62, '').trim(), '3', `${tag}: and colour`); }
    }
    assert.ok(!by(M, 'sitelbl:l1'), 'an OLT site\'s lat / long its name\'s item');
    assert.ok(by(M, 'sitelbl:t1'), 'a tower\'s in its group, as before');
    assert.ok(PDF.planList(r.text, r.report), 'the display list made');
  }
});

test('the ID and its lat / long placed by hand: both move, together; a manhole\'s ID out with its thin line (Crowded places Auto): to the block\'s edge', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, llJob(v)), pins = { 'sitelbl:c1': { at: [14, -9] }, 'sitename:l1': { at: [-6, 18] }, 'clolbl:k1': { at: [8, 7] }, 'sitelbl:f1': { at: [12, 3] } }, r1 = T.build(SEED_BL, llJob({ ...v, pins }));
    for (const id of Object.keys(pins)) {
      const a = llPlace(r0, by(r0.report.movable, id)), b = llPlace(r1, by(r1.report.movable, id)), mv = (e0, e1) => [+g1(e1, 10) - +g1(e0, 10), +g1(e1, 20) - +g1(e0, 20)], dI = mv(a.id, b.id), dL = mv(a.mt, b.mt);
      assert.equal(by(r1.report.movable, id).how, 'by hand'); assert.ok(Math.hypot(dI[0], dI[1]) > 3, `${JSON.stringify(v)} ${id}: moved`);
      near(dI[0], dL[0], 1e-6, `${id}: its lat / long with it (E)`); near(dI[1], dL[1], 1e-6, `${id}: (N)`);
    }
  }
  // a manhole in the route between two poles with their labels round it, at a cross street: its ID and lat / long further out, its thin line to the block's edge
  for (const f of [0.4, 0.5, 0.6]) {
    const at = [E0 + 72 + 36 * f, N0], j = (() => { const x = madeUpJob({ crowd: { move: 15, min: 0.75 } }), k = x.spans.findIndex((q) => q.ia === 's3' && q.ib === 's4'), q = x.spans[k]; x.pts.push({ id: 'm2', poleId: 'MH-0003', el: 'Manhole', status: 'Proposed', E: at[0], N: at[1], ...ll(at[0], at[1]) });
      x.spans.splice(k, 1, { ...q, ib: 'm2', b: at, len: 18, lenW: 18 }, { ...q, ia: 'm2', a: at, len: 18, lenW: 18 }); x.pts.find((p) => p.id === 's3').guy = 'side guy'; Object.assign(x.pts.find((p) => p.id === 's4'), { nap: true, napId: 'NAP-01' });
      x.roads.push({ cls: 'minor', hw: 'residential', name: 'SAMPLE AVE', pts: [[E0 + 90, N0 - 120], [E0 + 90, N0 + 200]] }); return x; })();
    const r = T.build(SEEDS.manhole, j), m = by(r.report.movable, 'pole:m2'), E = entsOf(r.text), es = m.handles.map((h) => E.get(h)), ln = es.find((e) => e.type === 'LWPOLYLINE');
    assert.deepEqual(m.text, ['MH-0003', ...LLS(j.pts.find((p) => p.id === 'm2'))]); assert.ok(ln, `${f}: its thin line`);
    const P = llPlace(r, m), hl = +g1(P.mt, 40), X = ln.g.filter((x) => x[0] === 10).map((x) => +x[1]), Y = ln.g.filter((x) => x[0] === 20).map((x) => +x[1]), a = P.fr([X[0], Y[0]]), e = P.fr([X[X.length - 1], Y[Y.length - 1]]);
    const W = Math.max(('MH-0003'.length * 0.72 + 0.3) * P.h, 10 * 0.72 * 1.1 * hl) / 2, top = 0.625 * P.h, bot = P.y - 2 * 1.67 * hl, dx = Math.max(0, Math.abs(e[0]) - W), dy = Math.max(0, e[1] - top, bot - e[1]); // (the block as the plan measures it: the ID over its lat / long, in the ID's frame)
    const c = [0, (top + bot) / 2], L0 = Math.hypot(e[0] - a[0], e[1] - a[1]), off = Math.abs((e[0] - a[0]) * (c[1] - a[1]) - (e[1] - a[1]) * (c[0] - a[0])) / L0; // (how far the block's middle is from the line, carried on)
    assert.ok(Math.abs(P.x) < 1e-6, `${f}: the lat / long in the middle under the ID`); assert.ok(dx > 0.2 || dy > 0.2, `${f}: the line ends outside the block, its lat / long too (${e.map((x) => x.toFixed(2))})`);
    assert.ok(off < 0.05, `${f}: toward the block's middle (${off.toFixed(3)})`); assert.ok(Math.hypot(e[0] - c[0], e[1] - c[1]) < W + (top - bot) / 2 + 0.31, `${f}: at its edge`);
  }
});

test('byte for byte: a plan with no point whose lat / long goes under its ID as beta 7.14 made it', () => {
  const none = (over) => { const j = madeUpJob({ cloStyle: 'arrow', ...over }), set = (id, o) => Object.assign(j.pts.find((p) => p.id === id), o);
    set('s2', { closure: true, closureId: 'CL-01', mloop: true, mloopM: 15 }); set('s4', { nap: true, napId: 'NAP-01' });
    j.pts.push({ id: 't1', poleId: 'TWR-0001', el: 'Site', siteName: 'MADE-UP TOWER', plaId: 'PLA-0001', status: 'Existing', E: E0 - 60, N: N0 + 30, ...ll(E0 - 60, N0 + 30) }); j.spans.unshift({ ia: 't1', ib: 's1', a: [E0 - 60, N0 + 30], b: [E0, N0], len: 67, lenW: 67, cable: 'F12', runLbls: [] });
    j.pts.push({ id: 'j1', poleId: 'PO-1', el: 'Pull-off', status: 'Proposed', E: E0 + 90, N: N0 - 40, att: ['s3', 's4'], ...ll(E0 + 90, N0 - 40) }, { id: 'x1', poleId: 'CO-1', el: 'Cross-over', status: 'Proposed', E: E0 + 150, N: N0 + 40, att: ['s5', 's6'], ...ll(E0 + 150, N0 + 40) });
    j.pts.push({ id: 'n2', poleId: 'NAP-0010', el: 'NAP', status: 'Proposed', E: E0 + 144 + 3, N: N0 + 4, ...ll(E0 + 147, N0 + 4) }, { id: 'k1', poleId: 'CL-0009', el: 'Closure', status: 'Proposed', E: E0 + 300, N: N0 - 40, ...ll(E0 + 300, N0 - 40) }, { id: 'n9', poleId: '', el: 'NAP', status: 'Proposed', E: E0 + 300, N: N0 + 60, ...ll(E0 + 300, N0 + 60) });
    let prev = 's9'; [['m1', 'Manhole', 'MH-0003'], ['b1', 'Service box', 'SB-0007'], ['c1', 'ODC', '']].forEach(([id, el, pid], i) => { const E = E0 + 210 + 30 * i, N = N0 + 108; j.pts.push({ id, poleId: pid, el, status: 'Proposed', E, N, ...ll(E, N) }); const a = j.pts.find((p) => p.id === prev); j.spans.push({ ia: prev, ib: id, a: [a.E, a.N], b: [E, N], len: 30, lenW: 30, cable: 'F12', runLbls: [] }); prev = id; });
    return { ...j, style: { 'clolbl:k1': { callout: 'bubble' } } }; };
  const WANT = { std: 'a5a85ac5ce62c4e4', tidy: '9a20f2eacf9b0094', crowd: 'd67b47d85d5f14ad' }, got = {}; // (48ab05a's)
  for (const [k, v] of Object.entries({ std: {}, tidy: { labels: 'tidy' }, crowd: { crowd: { move: 15, min: 0.75 } } })) got[k] = sha(T.build(SEED_BL, none(v)).text);
  assert.deepEqual(got, WANT, 'as beta 7.14 made them');
});
