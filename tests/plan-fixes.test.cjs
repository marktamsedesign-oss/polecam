/* (beta 7.15, Fixes) the plan builder (dxftpl.js, in Node, as the app's worker runs it) and the Drawing's display list (dxfpdf.js) for the owner's
   "some users unable to export files due to : Export failed: Cannot read properties of null (reading 'id')" and "Making plan preview error" (the
   released main 2.45.16 / beta 7.14).
   Run: node --test tests/plan-fixes.test.cjs (or python3 tests/run_all.py --only plan-fixes).
   - Plan style › 20 m loops at boxes: Written (pts[].boxLoop): each box's "20m LOOP" an item of its box (loop:<id>, its point the box's, no pole); the
     plan built (since beta 7.11 the end of the build read the id of the loop's pole, a box has none: no export, no plan preview) for every kind of box
     (handhole, manhole, service box, ODC, ODF, an OLT site, a tower), Standard and Tidy, placed by hand too; the Drawing's display list made.
   Every name, number and place is made up; tests/fixtures/plan-seed-made-up-blocks.dxf is the made-up template with plain made-up symbols (its
   handhole's block renamed here to stand for a manhole's or a service box's). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
