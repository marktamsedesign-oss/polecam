/* (Drawing labels) on the Drawing (the plan as its PDF prints it) the cable labels, pole numbers and pole details can be dragged, and the export puts
   them where they were dragged. Run: node --test tests/drawing-labels.spec.cjs (or python3 tests/run_all.py --only drawing-labels).
   - The builder (dxftpl.js, in Node, as the app's worker runs it): report.movable lists every cable label, number, pole's details and photo the plan
     writes (its box, what its pin is measured from, placed by hand or by the plan, the DXF entities that draw it). job.numPin / lblPin / cabPin put
     the item where it was put (its box's middle = its anchor + the pin), first: an automatic item on that place moves aside; a cable label away
     from its cable gets the plan's arrow (shoulder, line, solid arrowhead), a number or pole details away from the pole a thin line; a cable label
     placed by hand is that cable's label there (no other beside it). Tidy: at every grid the same place; a pole's number is in its block and moves
     with it (no number of its own to move; a numPin of a pole left out). Across a sheet's edge: said in the notes and on the item.
   - Byte for byte: with no pin (none, empty, pins that name nothing) the DXF and its PDF as beta 7.9 made them (their SHA-256): a made-up job of
     12 poles with photos, numbers and its cable labelled, Standard, Tidy and numbers only, on both made-up templates; 300 poles.
   - The PDF's own drawing code (dxfpdf.js planList): each item of the display list says which of report.movable it draws (own), the photos too.
   - The app (a phone, 390 x 844; a computer, 1280 x 900), a made-up As-Plan project of 8 poles with a made-up photo each and the made-up template
     on the phone: a cable label, a number and a pole's details tapped say what they are; dragged, each is kept (pmeta numPin / lblPin / cabPin),
     drawn where it was let go and still there when the new preview comes, and the export's plan has it there by hand with its arrow or line;
     Undo (↶) takes the changes back one at a time; Back to automatic for one, and for all of them (asked first, Cancel keeps them); without pins
     the export's DXF is the same as before any was made. Tidy (on a computer): a pole's block is dragged with its number and its photo. In Edit
     route nothing is dragged. No page errors, no page sideways.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED = fs.readFileSync(path.join(FX, 'plan-seed-made-up.dxf'), 'utf8');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));
/** A made-up photo (12 x 16, light blue with a grey pole), the same bytes every run (as drawing-preview.spec.cjs's). */
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0DVLmW3+x+U+3zbpI34BypzkVerN1r/lw/wCv2P8ArWlWxif/2Q==', 'base64');
/** 12 made-up poles 36 m apart along a made-up street (an L), each with a photo and a number, its cable's label on each span. */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
/** n made-up poles in legs of 20 (east, north, east…), 36 m apart, a made-up street beside each leg; a photo and a number each, the cable labelled. */
function bigJob(n, over) {
  const E0 = 787300, N0 = 786100, P = []; let x = E0, y = N0; for (let i = 0; i < n; i++) { P.push([x, y]); if (Math.floor(i / 20) % 2 === 0) x += 36; else y += 36; }
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: i % 4 === 3 ? 'Existing' : 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const roads = []; for (let k = 0; k * 20 < n; k++) { const L = P.slice(k * 20, Math.min(n, k * 20 + 21)); if (L.length > 1) roads.push({ cls: 'minor', hw: 'residential', name: `MADE-UP ST ${k + 1}`, pts: L.map(([E, N]) => (k % 2 === 0 ? [E, N - 7] : [E + 7, N])) }); }
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }], roads,
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
const by = (M, id) => M.find((m) => m.id === id);
/** The entities of a DXF by handle: { type, layer, text }. */
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0) { cur = { type: v.trim() }; continue; } if (!cur) continue; if (c === 5 && !cur.h) { cur.h = v.trim(); out.set(cur.h, cur); } else if (c === 8 && cur.layer == null) cur.layer = v; else if (c === 1 && cur.text == null) cur.text = v; }
  return out;
}
/** Boxes [cx, cy, w, h, deg] over each other (separating axes). */
function over(a, b) {
  const ax = (q) => { const r = q[4] * Math.PI / 180; return [[Math.cos(r), Math.sin(r)], [-Math.sin(r), Math.cos(r)]]; }, A = ax(a), B = ax(b), dx = b[0] - a[0], dy = b[1] - a[1];
  const ext = (q, Q, x, y) => q[2] / 2 * Math.abs(Q[0][0] * x + Q[0][1] * y) + q[3] / 2 * Math.abs(Q[1][0] * x + Q[1][1] * y);
  return [...A, ...B].every(([x, y]) => Math.abs(dx * x + dy * y) < ext(a, A, x, y) + ext(b, B, x, y) - 1e-6);
}
const partsOf = (m) => (m.parts && m.parts.length ? m.parts : [m.box]);

/* ---------- the builder, in Node ---------- */
test('report.movable: every cable label, number, pole\'s details and photo the plan writes, its box, its anchor and its own entities (Standard and Tidy)', () => {
  for (const [v, kinds] of [[{}, { details: 12, number: 12, photo: 12, cable: 1 }], [{ labels: 'tidy' }, { details: 12, photo: 12 }]]) {
    const out = T.build(SEED_SQ, madeUpJob(v)), M = out.report.movable, E = entsOf(out.text), seen = new Set();
    const n = {}; M.forEach((m) => { n[m.kind] = (n[m.kind] || 0) + 1; });
    for (const [k, c] of Object.entries(kinds)) assert.equal(n[k], c, `${JSON.stringify(v)}: ${k}s ${JSON.stringify(n)}`);
    if (v.labels) { assert.ok(!n.number, 'Tidy: a pole\'s number is in its block'); assert.ok(n.cable >= 1); assert.ok(M.filter((m) => m.kind === 'details').every((m) => m.number && m.seq), 'each block with its number'); }
    for (const m of M) {
      assert.match(m.id, /^(num|lbl|ph):s\d+$|^cab:PROPOSED 12C FIG-8 AE\|s\d+\|s\d+$/, m.id); assert.equal(m.how, 'auto');
      assert.ok(m.box.length === 5 && m.box[2] > 0.5 && m.box[3] > 0.5 && m.handles.length > 0, JSON.stringify(m));
      for (const h of m.handles) { assert.ok(E.has(h), `${m.id}: ${h} in the DXF`); assert.ok(!seen.has(h), `${h} drawn by one item only`); seen.add(h); }
      if (m.kind !== 'cable') assert.deepEqual(m.anchor, out.report.drawnAt[m.point], `${m.id}: measured from its pole as drawn`);
      const types = m.handles.map((h) => E.get(h).type);
      if (m.kind === 'number') assert.ok(types.includes('CIRCLE') && types.includes('TEXT') && E.get(m.handles[types.lastIndexOf('TEXT')]).text === m.seq, `${m.id}: ${types}`);
      if (m.kind === 'details') assert.ok(m.handles.some((h) => /CC-90\d\d/.test(E.get(h).text || '')), `${m.id}: its ID`);
      if (m.kind === 'cable') { assert.equal(E.get(m.handles[0]).text, 'PROPOSED 12C FIG-8 AE'); assert.equal(E.get(m.handles[0]).layer, 'G-ESAA CABLE LABEL'); }
      if (m.kind === 'photo') assert.ok(types.includes('IMAGE'), `${m.id}: ${types}`);
    }
  }
});

test('the builder: a number, a pole\'s details and a cable label placed by hand go where they were put, first (what was there moves aside), with the plan\'s arrow or a thin line', () => {
  const r0 = T.build(SEED_SQ, madeUpJob({ debug: true })), M0 = r0.report.movable;
  const n3 = by(M0, 'num:s3'), n4 = by(M0, 'num:s4'), l2 = by(M0, 'lbl:s2'), l3 = by(M0, 'lbl:s3'), l9 = by(M0, 'lbl:s9'), cab = M0.find((m) => m.kind === 'cable');
  assert.ok(n3 && n4 && l2 && l3 && l9 && cab, 'the items');
  // s3's number on s4's number's place; s2's details on s3's details' place; the cable's label on s9's details' place (away from its cable)
  const pins = { numPin: { s3: [n4.box[0] - n3.anchor[0], n4.box[1] - n3.anchor[1]] }, lblPin: { s2: [l3.box[0] - l2.anchor[0], l3.box[1] - l2.anchor[1], l3.box[4]] }, cabPin: { [cab.key]: { at: [l9.box[0] - cab.anchor[0], l9.box[1] - cab.anchor[1]], rot: 0 } } };
  const r1 = T.build(SEED_SQ, madeUpJob({ debug: true, ...pins })), M1 = r1.report.movable, E = entsOf(r1.text);
  const N = by(M1, 'num:s3'), L = by(M1, 'lbl:s2'), C = by(M1, cab.id);
  for (const [m, pin] of [[N, pins.numPin.s3], [L, pins.lblPin.s2], [C, pins.cabPin[cab.key].at]]) {
    assert.equal(m.how, 'by hand', m.id); near(m.box[0] - m.anchor[0], pin[0], 1e-6, `${m.id}: E`); near(m.box[1] - m.anchor[1], pin[1], 1e-6, `${m.id}: N`);
    // what the plan put there before moved aside: no automatic item over it
    const hits = M1.filter((x) => x.how === 'auto' && partsOf(x).some((a) => partsOf(m).some((b) => over(a, b)))).map((x) => x.id);
    assert.deepEqual(hits, [], `${m.id}: nothing over it`);
  }
  near(L.box[4], l3.box[4], 1e-6, 'the details at the angle they had');
  assert.ok(Math.hypot(by(M1, 'num:s4').box[0] - n4.box[0], by(M1, 'num:s4').box[1] - n4.box[1]) > 5, 's4\'s number moved aside');
  assert.ok(Math.hypot(by(M1, 'lbl:s3').box[0] - l3.box[0], by(M1, 'lbl:s3').box[1] - l3.box[1]) > 5, 's3\'s details moved aside');
  // the cable label away from its cable: the plan's arrow (text, polyline tip-knee-shoulder, solid arrowhead), the tip on its span
  assert.equal(C.lead, true); assert.deepEqual(C.handles.map((h) => E.get(h).type), ['TEXT', 'LWPOLYLINE', 'SOLID']); assert.equal(C.box[4], 0, 'at the angle it was let go');
  // the number away from its pole: its thin line; the details far from their pole: a thin line
  assert.ok(N.handles.map((h) => E.get(h).type).filter((t) => t === 'LWPOLYLINE').length >= 1, 'the number\'s line');
  assert.ok(L.handles.map((h) => E.get(h).type).includes('LWPOLYLINE'), 'the details\' line to their pole');
  // the cable label placed by hand is that cable's label there: no other one for the cable on its sheet
  assert.deepEqual(M1.filter((x) => x.kind === 'cable').map((x) => x.id), [cab.id], 'one cable label, the one placed by hand');
  // where it touches its cable (beside it, 4 m along it): no arrow
  const ua = [Math.cos(cab.box[4] * Math.PI / 180), Math.sin(cab.box[4] * Math.PI / 180)];
  const r2 = T.build(SEED_SQ, madeUpJob({ cabPin: { [cab.key]: { at: [cab.box[0] - cab.anchor[0] + 4 * ua[0], cab.box[1] - cab.anchor[1] + 4 * ua[1]], rot: cab.box[4] } } })), C2 = by(r2.report.movable, cab.id);
  assert.equal(C2.how, 'by hand'); assert.equal(C2.lead, false); assert.equal(C2.handles.length, 1, 'beside its cable: the text only'); near(C2.box[4], cab.box[4], 1e-6, 'along its cable');
  assert.deepEqual(r1.report.notes, [], 'nothing across a sheet\'s edge');
  // a pin across the sheet's edge: said, and flagged on the item
  const G = r0.report.grid, s = G.sheets[0].box, d1 = by(M0, 'lbl:s1'), r3 = T.build(SEED_SQ, madeUpJob({ lblPin: { s1: [s[0] - d1.anchor[0], 0, 0] } }));
  assert.equal(by(r3.report.movable, 'lbl:s1').edge, 'cut'); assert.ok(r3.report.notes.some((t) => /^Labels, numbers or pole details placed by hand across a sheet's edge .*: CC-9001 details$/.test(t)), JSON.stringify(r3.report.notes));
});

test('the builder, Tidy: a pole\'s block placed by hand (its number in it) is where it was put at every grid; a number of a pole is not moved on its own', () => {
  const r0 = T.build(SEED_SQ, madeUpJob({ labels: 'tidy' })), M0 = r0.report.movable, l3 = by(M0, 'lbl:s3'), cab = M0.find((m) => m.kind === 'cable');
  const pin = [l3.box[0] - l3.anchor[0] + 25, l3.box[1] - l3.anchor[1] + 30];
  for (const split of [1, 2, 3, 4]) {
    const r = T.build(SEED_SQ, madeUpJob({ labels: 'tidy', gridStyle: { split }, lblPin: { s3: pin }, cabPin: { [cab.key]: { at: [-20, 25], rot: 0 } } })), M = r.report.movable, L = by(M, 'lbl:s3'), C = by(M, cab.id), E = entsOf(r.text);
    assert.equal(r.report.tidy.grid.n, split, 'the grid asked');
    assert.equal(L.how, 'by hand', `grid ${split}`); near(L.box[0] - L.anchor[0], pin[0], 1e-6, `grid ${split}: E`); near(L.box[1] - L.anchor[1], pin[1], 1e-6, `grid ${split}: N`);
    assert.equal(L.number, true, 'its number in it'); assert.ok(L.handles.some((h) => E.get(h).type === 'CIRCLE' && E.get(h).layer === 'p-pole') || L.handles.some((h) => E.get(h).text === '3'), 'its number drawn with it');
    assert.ok(L.handles.some((h) => E.get(h).type === 'LWPOLYLINE'), 'its line to the pole');
    assert.equal(C.how, 'by hand'); near(C.box[0] - C.anchor[0], -20, 1e-6, 'the cable label'); near(C.box[1] - C.anchor[1], 25, 1e-6, 'the cable label');
    const hits = M.filter((x) => x.how === 'auto' && (over(x.box, L.box) || over(x.box, C.box))).map((x) => x.id); assert.deepEqual(hits, [], `grid ${split}: nothing over them`);
  }
  // Tidy: a pole's number moves with its block: a numPin of a pole changes nothing
  const a = T.build(SEED_SQ, madeUpJob({ labels: 'tidy', gridStyle: { split: 2 } })), b = T.build(SEED_SQ, madeUpJob({ labels: 'tidy', gridStyle: { split: 2 }, numPin: { s3: [10, 10] } }));
  assert.ok(a.text === b.text, 'the same DXF');
});

test('byte for byte: with no pin (none, empty, naming nothing) the DXF and its PDF as beta 7.9 made them', async () => {
  // [template, job, labels, DXF, PDF]: the SHA-256 (first 16) beta 7.9's dxftpl.js and dxfpdf.js make of them (the PDF with the made-up photos, uncompressed)
  const WANT = [['square', '12', 'std', '07bed5380e87197d', 'c66935f9d81efa72'], ['square', '12', 'tidy', 'ca30217c6527a840', 'aae4869f0aacdbbc'], ['square', '12', 'num', '6c8ed89f2968ec0b', 'ed5d7d16292c2479'],
    ['square', '300', 'std', '606e2a5b5aa26080', '03f64afd55ae8cd4'], ['made-up', '12', 'std', '83bc0df6defcc599', '75e7db14dd22da59'], ['made-up', '12', 'tidy', '05dcfe064f85d327', '0c1fd5fdc37cbe09'], ['made-up', '12', 'num', '3b1dd35e0e5ad30e', '75e7db14dd22da59']];
  const V = { std: {}, tidy: { labels: 'tidy' }, num: { markMode: 'num', markNum: true } }, none = { numPin: {}, lblPin: {}, cabPin: {} }, ghost = { numPin: { x99: [5, 5] }, lblPin: { x98: [3, 4, 0] }, cabPin: { 'NOTHING|x1|x2': { at: [1, 1], rot: 0 } } };
  const got = [];
  for (const [sn, jn, vn] of WANT) {
    const mk = (o) => (jn === '300' ? bigJob(300, { ...V[vn], ...o }) : madeUpJob({ ...V[vn], ...o })), seed = sn === 'square' ? SEED_SQ : SEED, job = mk({});
    const images = Object.fromEntries(job.pts.map((p) => [`${p.poleId}.jpg`, new Uint8Array(JPG)]));
    const out = T.build(seed, job), pdf = await PDF.toPdf(out.text, { images, title: 'MADE-UP PLAN' });
    for (const x of jn === '300' ? [none] : [none, ghost]) assert.ok(T.build(seed, mk(x)).text === out.text, `${sn} ${jn} ${vn}: the same with ${JSON.stringify(x)}`);
    got.push([sn, jn, vn, sha(out.text), sha(Buffer.from(pdf))]);
  }
  assert.deepEqual(got, WANT, 'the DXF and the PDF as beta 7.9 made them');
});

test('planList: each item of the plan\'s display list says which item of report.movable it draws (own)', () => {
  const out = T.build(SEED_SQ, madeUpJob({ cabPin: { 'PROPOSED 12C FIG-8 AE|s6|s7': { at: [-20, 25], rot: 0 } } })), M = out.report.movable, L = PDF.planList(out.text, out.report);
  assert.equal(L.own.length, L.items.length / 4, 'one for each item');
  const n = new Map(); for (let k = 0; k < L.own.length; k++) if (L.own[k] >= 0) n.set(L.own[k], (n.get(L.own[k]) || 0) + 1);
  M.forEach((m, i) => assert.ok(n.get(i) > 0, `${m.id}: drawn`));
  const C = M.findIndex((m) => m.kind === 'cable'), kinds = []; for (let k = 0; k < L.own.length; k++) if (L.own[k] === C) kinds.push(L.items[4 * k]);
  assert.deepEqual(kinds.sort(), [0, 2, 3], 'the cable label: its line, its arrowhead (a fill) and its text');
  const ph = M.findIndex((m) => m.id === 'ph:s3'), pics = []; for (let k = 0; k < L.own.length; k++) if (L.own[k] === ph) pics.push(L.items[4 * k]);
  assert.ok(pics.includes(4), 'the photo\'s picture');
  const free = []; for (let k = 0; k < L.own.length; k++) if (L.own[k] < 0) free.push(L.items[4 * k]); assert.ok(free.includes(0), 'the cable and the poles: no item\'s');
});

/* ---------- the app, in a browser ---------- */
let server, browser, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fsp.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

const NAME = 'DEMO DRAW TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, 7.10465 + (i > 4 ? (i - 4) * 0.00036 : 0), 125.6010 + Math.min(i, 4) * 0.00036]);
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } }));
const LINKS = POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12']);
const NO_PINS = { phPin: {}, numPin: {}, lblPin: {}, cabPin: {} };
/** The app with the made-up project (photos and numbers on the plan: exp), the made-up template on the phone; each export's job pins, report and DXF kept. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, exp }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', ...exp }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { RECS, NAME, USER, LINKS, exp: o.exp || {} });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.evaluate(async (ids) => { for (const id of ids) { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, POLES.map((p) => p[0]));
  await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-square.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED_SQ);
  await page.evaluate(async () => {
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ pins: JSON.parse(JSON.stringify({ phPin: job.phPin, numPin: job.numPin, lblPin: job.lblPin, cabPin: job.cabPin })), movable: JSON.parse(JSON.stringify(out.report.movable)), notes: out.report.notes.slice(), text: out.text }); return out; };
  });
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const mvOf = (page) => page.evaluate(() => window.__polecam.drwMv());
/** The Drawing, opened (Back first to the main screen), looking at the route (0.45 m a pixel), clear of the drawing's tools. */
async function drawing(page) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(7.10465 + 0.0006, 125.6010 + 0.0012, 0.45, r.width / 2, r.height * 0.45); });
}
/** Until the plan is shown and not being made again (when: what else it must show). */
async function shown(page, when) {
  let s = null; for (let i = 0; i < 200; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return pl(page); } }
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
/** Export › Plan drawing (each question answered as a user going on would): the job's pins, the report's movable items, the DXF. */
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made'); return e[0];
}
/** An item dragged by (dx, dy) page pixels; at, while it is held: what the Drawing says. */
async function drag(page, x, y, dx, dy, at) {
  await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(x + dx * k / 12, y + dy * k / 12); await page.waitForTimeout(16); }
  const held = at ? await mvOf(page) : null; await page.mouse.up(); return held;
}
const pinsKept = (page) => page.evaluate(() => { const m = JSON.parse(localStorage.getItem('polecam.settings')).meta['DEMO DRAW TEST']; return { phPin: m.phPin || {}, numPin: m.numPin || {}, lblPin: m.lblPin || {}, cabPin: m.cabPin || {} }; });
const onScreen = (m, vw) => m.x > 24 && m.x < vw - 100 && m.y > 130 && m.y < 640;

test('a phone: a number, a pole\'s details and a cable label tapped and dragged; kept, drawn where let go, by hand in the export with their line or arrow; Undo; Back to automatic, one and all', async () => {
  const { ctx, page, errors } = await open({ exp: { dxfMarks: 'both', dxfLabels: 'std' } });
  const e0 = await exportPlan(page); assert.deepEqual(e0.pins, NO_PINS, 'no pin yet'); assert.ok(e0.movable.every((m) => m.how === 'auto'));
  await drawing(page); await shown(page, (x) => x.count && x.count.pictures === 8);
  let mv = await mvOf(page); const vw = 390;
  assert.ok(mv.own > 0, 'the plan\'s items know their owners');
  const items = { number: mv.items.find((m) => m.id === 'num:s3'), details: mv.items.find((m) => m.id === 'lbl:s3'), cable: mv.items.find((m) => m.kind === 'cable') };
  for (const [k, m] of Object.entries(items)) assert.ok(m && onScreen(m, vw), `${k} on the screen: ${JSON.stringify(m)}`);
  assert.match(await page.evaluate(() => document.getElementById('drawHint').textContent), /Drag a cable label, a pole number or a pole's details to place it by hand; ↶ undoes\./);
  // a tap says what it is
  const SAY = { number: /^Pole number 3 · where the plan puts it: drag it to place it by hand$/, details: /^Pole details of CC-9003 · where the plan puts it: drag it to place it by hand$/, cable: /^Cable label PROPOSED 12C FIG-8 AE · where the plan puts it: drag it to place it by hand$/ };
  for (const [k, m] of Object.entries(items)) { await page.mouse.click(m.x, m.y); await page.waitForTimeout(250); const t = await mvOf(page); assert.equal(t.sel, m.id, `${k}: tapped`); assert.match(t.info, SAY[k]); }
  // each dragged: held, it is lifted off the plan and follows the finger; let go, kept (its middle from its anchor, metres) and drawn there, then by hand in the new preview
  const D = { number: [40, -45], details: [-30, -70], cable: [-60, 70] }, sc = 1 / 0.45;
  for (const [k, m] of Object.entries(items)) {
    const n0 = (await pl(page)).n, [dx, dy] = D[k], held = await drag(page, m.x, m.y, dx, dy, true);
    assert.equal(held.drag && held.drag.id, m.id, `${k}: dragged`); assert.ok(held.lifted.some((L) => L.id === m.id), `${k}: lifted off the plan while it is dragged`);
    const h1 = held.items.find((x) => x.id === m.id); near(h1.x, m.x + dx, 1.5, `${k}: under the finger x`); near(h1.y, m.y + dy, 1.5, `${k}: under the finger y`);
    let now = await mvOf(page), it = now.items.find((x) => x.id === m.id); near(it.x, m.x + dx, 1, `${k}: where let go x`); near(it.y, m.y + dy, 1, `${k}: where let go y`); // (no jump back)
    const key = { number: 'numPin', details: 'lblPin', cable: 'cabPin' }[k], pk = k === 'cable' ? m.id.slice(4) : 's3', pin = now.pins[key][pk];
    assert.ok(pin, `${k}: kept`); const at = k === 'cable' ? pin.at : pin; near(at[0], m.box[0] + dx / sc - m.anchor[0], 0.02, `${k}: pin E`); near(at[1], m.box[1] - dy / sc - m.anchor[1], 0.02, `${k}: pin N`);
    if (k !== 'number') near(k === 'cable' ? pin.rot : pin[2], m.deg, 0.01, `${k}: its angle kept`);
    assert.match(now.info, new RegExp(`${SAY[k].source.slice(1, SAY[k].source.indexOf(' · '))} · placed by hand on the planBack to automatic$`));
    await shown(page, (x) => x.n > n0); now = await mvOf(page); it = now.items.find((x) => x.id === m.id);
    assert.equal(it.how, 'by hand', `${k}: by hand in the new preview`); near(it.x, m.x + dx, 1, `${k}: the new preview has it there x`); near(it.y, m.y + dy, 1, `${k}: y`);
    assert.ok(!now.lifted.some((L) => L.id === m.id), `${k}: drawn by the plan itself now`);
  }
  assert.deepEqual(await pinsKept(page), (await mvOf(page)).pins, 'kept in the project (pmeta)');
  assert.equal((await pl(page)).phAll, '3 items placed by hand · Back to automatic');
  assert.deepEqual((await mvOf(page)).undo, ['number moved', 'details moved', 'cable moved']); assert.equal((await mvOf(page)).undoBtn.hidden, false, 'Undo shown');
  // the export: each where it was put, by hand, with its line or arrow; nothing of the plan over it
  const pins1 = await pinsKept(page), e1 = await exportPlan(page), E = entsOf(e1.text);
  assert.deepEqual(e1.pins, pins1, 'the export\'s job carries them');
  for (const [k, id] of [['number', 'num:s3'], ['details', 'lbl:s3'], ['cable', items.cable.id]]) {
    const m = by(e1.movable, id), pin = k === 'number' ? pins1.numPin.s3 : k === 'details' ? pins1.lblPin.s3 : pins1.cabPin[id.slice(4)].at;
    assert.equal(m.how, 'by hand', id); near(m.box[0] - m.anchor[0], pin[0], 1e-6, `${id}: E`); near(m.box[1] - m.anchor[1], pin[1], 1e-6, `${id}: N`);
    const types = m.handles.map((h) => E.get(h).type);
    if (k === 'cable') assert.deepEqual(types, ['TEXT', 'LWPOLYLINE', 'SOLID'], 'the cable label: its arrow to its span');
    if (k === 'number') assert.ok(types.includes('LWPOLYLINE'), `the number: its line to the pole (${types})`);
    if (k !== 'details') assert.deepEqual(e1.movable.filter((x) => x.how === 'auto' && x.kind !== 'details' && over(x.box, m.box)).map((x) => x.id), [], `${id}: nothing over it`);
  }
  // Undo: the cable label, then the details, then the number back where they were
  await drawing(page); await shown(page);
  for (const [left, gone] of [[['number moved', 'details moved'], 'cabPin'], [['number moved'], 'lblPin'], [[], 'numPin']]) {
    await page.click('#drawUndo'); await page.waitForTimeout(250); const u = await mvOf(page);
    assert.deepEqual(u.undo, left); assert.deepEqual(u.pins[gone], {}, `${gone}: taken back`);
  }
  assert.deepEqual(await pinsKept(page), NO_PINS, 'none left'); await shown(page); assert.equal((await mvOf(page)).undoBtn.hidden, true, 'nothing to undo: Undo hidden');
  for (let i = 0; i < 40 && (await mvOf(page)).items.some((m) => m.how === 'by hand'); i++) await page.waitForTimeout(250);
  assert.ok((await mvOf(page)).items.every((m) => m.how === 'auto'), 'all where the plan puts them again');
  // Back to automatic, one: the number dragged again, tapped, Back to automatic
  mv = await mvOf(page); let m = mv.items.find((x) => x.id === 'num:s3'); await drag(page, m.x, m.y, 30, 30);
  assert.ok((await mvOf(page)).pins.numPin.s3, 'kept'); await page.mouse.click(m.x + 30, m.y + 30); await page.waitForTimeout(250);
  await page.click('#drawMvAuto'); await page.waitForTimeout(250);
  let t = await mvOf(page); assert.deepEqual(t.pins.numPin, {}, 'back to automatic'); assert.match(t.info, /^Pole number 3 · where the plan puts it: drag it to place it by hand$/);
  // Back to automatic for all of them (asked first; Cancel keeps them); Undo brings them back
  for (const id of ['lbl:s3', items.cable.id]) { await shown(page); mv = await mvOf(page); m = mv.items.find((x) => x.id === id); assert.ok(onScreen(m, vw), `${id} on the screen`); await drag(page, m.x, m.y, 25, -40); await page.waitForTimeout(200); }
  for (let i = 0; i < 40 && !(await pl(page)).phAll; i++) await page.waitForTimeout(250);
  assert.equal((await pl(page)).phAll, '2 items placed by hand · Back to automatic');
  await page.click('#drawPhAll'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('askTitle').textContent), 'Back to automatic: 2 items?');
  assert.match(await page.evaluate(() => document.getElementById('askText').textContent), /^The 1 pole's details and 1 cable label placed by hand go back where the plan puts them\. The next export has them there too\. Undo \(↶\) brings them back\.$/);
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Cancel').click()); await page.waitForTimeout(250);
  assert.equal(Object.keys((await pinsKept(page)).lblPin).length + Object.keys((await pinsKept(page)).cabPin).length, 2, 'Cancel: kept');
  await page.click('#drawPhAll'); await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  assert.deepEqual(await pinsKept(page), NO_PINS, 'all back'); assert.equal((await pl(page)).phAll, null, 'the chip gone');
  await page.click('#drawUndo'); await page.waitForTimeout(250); t = await pinsKept(page);
  assert.ok(Object.keys(t.lblPin).length === 1 && Object.keys(t.cabPin).length === 1, `Undo: both back ${JSON.stringify(t)}`);
  await page.click('#drawPhAll'); await page.waitForTimeout(300); await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  // no pin: the export's DXF as before any was made
  const e2 = await exportPlan(page); assert.deepEqual(e2.pins, NO_PINS); assert.ok(e2.text === e0.text, 'the same DXF, byte for byte');
  assert.equal(await page.evaluate(() => 'numPin' in JSON.parse(localStorage.getItem('polecam.settings')).meta['DEMO DRAW TEST']), false, 'no pin kept');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a computer, Tidy: a pole\'s block dragged with its number and its photo; by hand in the export; in Edit route nothing is dragged', async () => {
  const { ctx, page, errors } = await open({ desk: true, exp: { dxfMarks: 'both', dxfLabels: 'tidy' } });
  await drawing(page); await shown(page, (x) => x.count && x.count.pictures === 8);
  let mv = await mvOf(page); const vw = await page.evaluate(() => document.getElementById('drawCanvas').getBoundingClientRect().right);
  assert.ok(!mv.items.some((m) => /^num:/.test(m.id)), 'Tidy: no number on its own (each in its block)');
  const b = mv.items.find((m) => m.kind === 'details' && m.with.length && m.x > 60 && m.x < vw - 160 && m.y > 140 && m.y < 700);
  assert.ok(b, `a block with its photo beside it, on the screen: ${JSON.stringify(mv.items.filter((m) => m.kind === 'details').map((m) => [m.id, Math.round(m.x), Math.round(m.y), m.with]))}`);
  await page.mouse.click(b.x, b.y); await page.waitForTimeout(250);
  assert.match((await mvOf(page)).info, new RegExp(`^Pole details of CC-900${b.id.slice(5)} \\(its number ${b.id.slice(5)} with them\\) · where the plan puts it: drag it to place it by hand$`));
  const n0 = (await pl(page)).n, held = await drag(page, b.x, b.y, 90, -60, true);
  assert.ok(held.lifted.some((L) => L.id === b.id), 'the block lifted');
  for (const w of b.with) assert.ok(held.lifted.some((L) => L.id === w), `${w}: its photo moves with it`);
  const pin = (await mvOf(page)).pins.lblPin[b.id.slice(4)]; assert.ok(pin, 'kept');
  await shown(page, (x) => x.n > n0); mv = await mvOf(page); const it = mv.items.find((m) => m.id === b.id);
  assert.equal(it.how, 'by hand'); near(it.x, b.x + 90, 1, 'there x'); near(it.y, b.y - 60, 1, 'there y');
  const e = await exportPlan(page), m = by(e.movable, b.id), E = entsOf(e.text);
  assert.equal(m.how, 'by hand'); near(m.box[0] - m.anchor[0], pin[0], 1e-6, 'E'); near(m.box[1] - m.anchor[1], pin[1], 1e-6, 'N');
  assert.equal(m.number, true); assert.ok(m.handles.some((h) => E.get(h).text === b.id.slice(5)), 'its number written with it');
  assert.ok(!e.movable.some((x) => x.id === `num:${b.id.slice(4)}`), 'no number of its own');
  // Edit route: a drag on a block moves nothing
  await drawing(page); await shown(page); await page.evaluate(() => window.__polecam.drwEdit(true)); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__polecam.drwEd().on), true, 'Edit route on');
  const before = await pinsKept(page), b2 = (await mvOf(page)).items.find((x) => x.kind === 'details' && x.id !== b.id && x.x > 60 && x.x < vw - 160 && x.y > 140 && x.y < 700);
  assert.ok(b2, 'another block on the screen'); const h = await drag(page, b2.x, b2.y, 50, 50, true); assert.equal(h.drag, null, 'not dragged');
  assert.deepEqual(await pinsKept(page), before, 'Edit route: no pin changed');
  await page.evaluate(() => window.__polecam.drwEdit(false)); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});
