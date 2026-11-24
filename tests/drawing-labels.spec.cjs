/* (Drawing labels) on the Drawing (the plan as its PDF prints it) the cable labels, pole numbers and pole details can be dragged, and the export puts
   them where they were dragged. Run: node --test tests/drawing-labels.spec.cjs (or python3 tests/run_all.py --only drawing-labels).
   - The builder (dxftpl.js, in Node, as the app's worker runs it): report.movable lists every cable label, number, pole's details and photo the plan
     writes (its box, what its pin is measured from, placed by hand or by the plan, the DXF entities that draw it). job.numPin / lblPin / cabPin put
     the item where it was put (its box's middle = its anchor + the pin), first: an automatic item on that place moves aside; a cable label away
     from its cable gets the plan's arrow (shoulder, line, solid arrowhead), a number or pole details away from the pole a thin line; a cable label
     placed by hand is that cable's label there (no other beside it). Tidy: at every grid the same place; a pole's number is in its block and moves
     with it (no number of its own to move; a numPin of a pole left out). (Plan kept) a cell holding an item placed by hand (its box, its line
     or arrow) that no sheet prints becomes a printed GEO sheet; one across a sheet's edge says the sheets it is cut on (cut), and the notes.
   - Byte for byte: with no pin (none, empty, pins that name nothing) the DXF and its PDF as beta 7.9 made them (their SHA-256): a made-up job of
     12 poles with photos, numbers and its cable labelled, Standard, Tidy and numbers only, on both made-up templates; 300 poles.
   - The PDF's own drawing code (dxfpdf.js planList): each item of the display list says which of report.movable it draws (own), the photos too.
   - The app (a phone, 390 x 844; a computer, 1280 x 900), a made-up As-Plan project of 8 poles with a made-up photo each and the made-up template
     on the phone: a cable label, a number and a pole's details tapped say what they are; dragged, each is kept (pmeta numPin / lblPin / cabPin),
     drawn where it was let go and still there when the new preview comes, and the export's plan has it there by hand with its arrow or line;
     Undo (↶) takes the changes back one at a time; Back to automatic for one, and for all of them (asked first, Cancel keeps them); without pins
     the export's DXF is the same as before any was made. Tidy (on a computer): a pole's block is dragged with its number and its photo. In Edit
     route nothing is dragged. (Plan kept) a cable label dragged into a cell with no sheet: that sheet prints and the Drawing boxes it; pole details
     across a sheet's edge: outlined orange and said when tapped, as a photo is; the grid kept from the first item placed by hand of any kind
     and let go when none is left (Back to automatic for one or all, Undo); the owner's sequence (a number, pole details and a cable label
     placed by hand; exported, AutoCAD files and PDF; another project; back): the same preview, its sheets, names and display list, and the
     export is the preview, the roads got once; Tidy keeps its grid (without it, the same job's plan would find 220 m sheets for its 440 m).
     No page errors, no page sideways.
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
  // a pin across the sheet's edge, into a cell with no sheet: that cell prints too ((Plan kept), as a photo's), the item says the two sheets it is cut on, and the notes
  const G = r0.report.grid, s = G.sheets[0].box, d1 = by(M0, 'lbl:s1'), r3 = T.build(SEED_SQ, madeUpJob({ lblPin: { s1: [s[0] - d1.anchor[0], 0, 0] } })), L3 = by(r3.report.movable, 'lbl:s1'), S3 = r3.report.grid.sheets;
  assert.equal(S3.length, G.sheets.length + 1, 'a sheet added'); const added = S3.find((x) => x.forPhoto); assert.ok(added && added.box[2] === s[0], `the cell west of it: ${JSON.stringify(S3)}`);
  assert.deepEqual(L3.cut, [G.sheets[0].name, added.name].sort(), 'cut on both, as a photo\'s photoAt[id].cut');
  assert.ok(r3.report.notes.some((t) => /^Labels, numbers or pole details placed by hand across a sheet's edge .*: CC-9001 details$/.test(t)), JSON.stringify(r3.report.notes));
  assert.ok(r3.report.notes.some((t) => /^GEO sheets added so that every photo and pole drawn prints .*: /.test(t)), JSON.stringify(r3.report.notes));
  // a cable label placed by hand in a cell with no sheet (its arrow over the cells between): those cells print
  const tgt = [s[2] + G.cell / 2, (s[1] + s[3]) / 2], r4 = T.build(SEED_SQ, madeUpJob({ cabPin: { [cab.key]: { at: [tgt[0] - cab.anchor[0], tgt[1] - cab.anchor[1]], rot: 0 } } })), C4 = by(r4.report.movable, cab.id), S4 = r4.report.grid.sheets;
  assert.equal(C4.how, 'by hand'); assert.equal(C4.lead, true); assert.ok(S4.some((x) => x.forPhoto && x.box[0] <= tgt[0] && tgt[0] <= x.box[2] && x.box[1] <= tgt[1] && tgt[1] <= x.box[3]), `its sheet added: ${JSON.stringify(S4)}`);
  assert.ok(!C4.cut, 'inside its sheet');
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
// ((Plan kept)) another made-up project 2 km away (4 poles), and OpenStreetMap as Overpass answers it, made up (as plan-keep.spec.cjs's): a street 9 m
// south of the first poles, an avenue 9 m east of the others, a chapel; a road along the other project
const OTHER = 'DEMO DRAW OTHER', LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const PO = []; for (let i = 0; i < 4; i++) PO.push([`o${i + 1}`, `CC-${9201 + i}`, 7.1230, 125.6200 + i * DD]);
const RECS_O = PO.map(([id, poleId, lat, lon], i) => ({ ...RECS[i], id, project: OTHER, poleId, lat, lon }));
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * DD + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * DD + 0.00008], [LA0 + 3 * DD + 0.0006, LO0 + 4 * DD + 0.00008]]),
  way(3, 'DEMO RD', 'residential', [[7.1230 - 0.00008, 125.6194], [7.1230 - 0.00008, 125.6200 + 4 * DD]]),
  { type: 'node', id: 9, lat: LA0 + 0.0002, lon: LO0 + 2 * DD, tags: { name: 'MADE-UP CHAPEL', amenity: 'place_of_worship' } }] };
/** The app with the made-up project (photos and numbers on the plan: exp), the made-up template on the phone; each export's job pins, report and DXF kept.
 *  o.other: the other made-up project too; o.roads: OpenStreetMap answers (made up; calls: each download's area), else offline. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  const calls = [];
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    if (o.roads && u.startsWith('https://overpass-api.de/')) { const q = decodeURIComponent(String(r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')), m = /way\["highway"\]\(([^)]*)\)/.exec(q); calls.push(m ? m[1] : q.slice(0, 80));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); }
    return r.abort(); });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, exp, other }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: other ? [NAME, other.name] : [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', ...exp }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true }, ...(other ? { [other.name]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: other.links, cables24: true } } : {}) } }));
  }, { RECS: o.other ? RECS.concat(RECS_O) : RECS, NAME, USER, LINKS, exp: o.exp || {}, other: o.other ? { name: OTHER, links: PO.slice(1).map((q, i) => [PO[i][0], q[0], 'F12']) } : null });
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
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = []; window.__outs = [];
    T.build = function (seed, job) { // ((Plan kept)) and its grid kept, its roads, its sheets; with window.__alt, the same job without its grid kept (the grid the plan would find)
      const alt = window.__alt && job.gridKeep ? (() => { const j = structuredClone(job); delete j.gridKeep; const G = real.call(this, seed, j).report.grid || {}; return { cell: G.cell, n: G.n, names: (G.sheets || []).map((x) => x.name) }; })() : null;
      const out = real.call(this, seed, job), G = out.report.grid || {}; window.__outs.push(out);
      window.__exp.push({ pins: JSON.parse(JSON.stringify({ phPin: job.phPin, numPin: job.numPin, lblPin: job.lblPin, cabPin: job.cabPin })), movable: JSON.parse(JSON.stringify(out.report.movable)), notes: out.report.notes.slice(), text: out.text,
        gridKeep: job.gridKeep || null, roads: (job.roads || []).length, sheets: out.report.sheets.slice(), grid: { cell: G.cell, n: G.n, kept: !!G.kept, sheets: JSON.parse(JSON.stringify(G.sheets || [])) }, alt });
      return out; };
  });
  return { ctx, page, errors, calls };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const mvOf = (page) => page.evaluate(() => window.__polecam.drwMv());
/** The Drawing, opened (Back first to the main screen), looking at the route (mpp: 0.45 m a pixel), clear of the drawing's tools. */
async function drawing(page, mpp) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await look(page, 7.10465 + 0.0006, 125.6010 + 0.0012, mpp || 0.45, 0.5, 0.45);
}
/** The Drawing looking at lat, lon (mpp metres a pixel) at fx, fy of its canvas. */
const look = (page, lat, lon, mpp, fx, fy) => page.evaluate(([la, lo, m, x, y]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width * x, r.height * y); }, [lat, lon, mpp, fx, fy]);
/** ((Plan kept)) The Drawing looking at E, N (metres), drawn. */
const centre = (page, E, N) => page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [E, N]);
/** Until the plan is shown and not being made again (when: what else it must show). */
async function shown(page, when) {
  let s = null; for (let i = 0; i < 200; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return pl(page); } }
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
/** Export › Plan drawing (each question answered as a user going on would): the job's pins, the report's movable items, the DXF. */
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; window.__outs = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made');
  e[0].hash = await page.evaluate(async () => { // ((Plan kept)) its display list's hash, as the Drawing's (dxfpdf.js's planList of the DXF and its report)
    if (!window.GeDxfPdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxfpdf.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const o = window.__outs[0]; return window.__polecam.planListHash(o.text, o.report); });
  return e[0];
}
/** An item dragged by (dx, dy) page pixels; at, while it is held: what the Drawing says. */
async function drag(page, x, y, dx, dy, at) {
  await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(x + dx * k / 12, y + dy * k / 12); await page.waitForTimeout(16); }
  const held = at ? await mvOf(page) : null; await page.mouse.up(); return held;
}
/** ((Plan kept)) The plan shown (shown's), its display list's hash, its movable items, the grid and roads kept with the project. */
const snap = async (page, s) => ({ ...(s || (await pl(page))), hash: await page.evaluate(() => window.__polecam.drwPlanHash()), mv: await mvOf(page), kept: await page.evaluate(() => window.__polecam.planKept()) });
const names = (s) => s.sheets.map((x) => `${x.sheet}: ${x.name}`);
const round = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'number' ? +v.toFixed(6) : v)));
const handPlaced = (M) => round(M.filter((m) => m.how === 'by hand').map((m) => ({ id: m.id, box: m.box, cut: m.cut || null })));
/** ((Plan kept)) Another project, through Projects (as the owner does), and back to the main screen. */
async function openProject(page, name) {
  await closeAll(page); await page.evaluate(() => document.getElementById('projectBtn').click()); await page.waitForTimeout(800);
  await page.evaluate((nm) => document.querySelector(`#taskList .task[data-name="${nm}"]`).click(), name); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.S.project), name); await closeAll(page);
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
  assert.match(await page.evaluate(() => document.getElementById('askText').textContent), /^The 1 pole's details and 1 cable label placed by hand go back where the plan puts them, and the plan's sheets are worked out again \(kept as they were while things were placed by hand\)\. The next export has them there too\. Undo \(↶\) brings them back\.$/);
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

// ((Plan kept)) the pins and the fix's mechanisms: cells holding an item placed by hand print, the grid kept from the first pin of any kind, one edge warning
const inSheet = (S, E, N) => S.sheets.some((x) => E >= x.box[0] && E <= x.box[2] && N >= x.box[1] && N <= x.box[3]);
const made = async (page) => { const s = await pl(page); return s ? s.made : 0; };
const keptNow = (page) => page.evaluate(() => window.__polecam.planKept());

test('a computer: a cable label dragged into a cell with no sheet: that sheet prints and the Drawing boxes it; a pole\'s details across a sheet\'s edge: outlined, said, cut on both; Back to automatic for all lets the grid go', async () => {
  const { ctx, page, errors } = await open({ desk: true, exp: { dxfMarks: 'both', dxfLabels: 'std' } });
  await drawing(page, 0.5); const s0 = await snap(page, await shown(page, (x) => x.count && x.count.pictures === 8));
  assert.equal(s0.kept.grid, null, 'no grid kept before anything is placed by hand');
  // the cable label taken past the nearest edge of its sheet (the whole label, 15 m clear), into a cell no sheet prints
  const cab = s0.mv.items.find((m) => m.kind === 'cable'), [E, N] = cab.box, r = Math.hypot(cab.box[2], cab.box[3]) / 2 + 15;
  const sh = s0.sheets.find((x) => E >= x.box[0] && E <= x.box[2] && N >= x.box[1] && N <= x.box[3]); assert.ok(sh, 'the cable label on a sheet');
  const to = [[sh.box[2] + r, N], [sh.box[0] - r, N], [E, sh.box[3] + r], [E, sh.box[1] - r]].filter(([x, y]) => !inSheet(s0, x, y)).sort((a, b) => Math.hypot(a[0] - E, a[1] - N) - Math.hypot(b[0] - E, b[1] - N))[0];
  assert.ok(to && Math.hypot(to[0] - E, to[1] - N) < 300, JSON.stringify({ to, sheets: s0.sheets }));
  await centre(page, (E + to[0]) / 2, (N + to[1]) / 2); await page.waitForTimeout(300);
  let c = (await mvOf(page)).items.find((m) => m.id === cab.id), n0 = (await pl(page)).n;
  await drag(page, c.x, c.y, (to[0] - E) / 0.5, -(to[1] - N) / 0.5);
  assert.ok((await mvOf(page)).pins.cabPin[cab.id.slice(4)], 'kept');
  const k1 = (await keptNow(page)).grid; assert.ok(k1 && Array.isArray(k1.geo) && k1.n === 1 && k1.lab === 'std', `the grid kept at the first label placed by hand: ${JSON.stringify(k1)}`);
  const s1 = await snap(page, await shown(page, (x) => x.n > n0)), c1 = s1.mv.items.find((m) => m.id === cab.id), add = s1.sheets.filter((x) => x.forPhoto);
  assert.equal(c1.how, 'by hand'); near(c1.box[0], to[0], 0.05, 'there E'); near(c1.box[1], to[1], 0.05, 'there N'); assert.equal(c1.cut, null, 'not across an edge');
  assert.equal(add.length, 1, `one sheet added: ${names(s1)}`); const X = add[0];
  assert.ok(c1.box[0] - r + 15 >= X.box[0] && c1.box[0] + r - 15 <= X.box[2] && c1.box[1] - r + 15 >= X.box[1] && c1.box[1] + r - 15 <= X.box[3], 'the label inside it');
  assert.ok(s0.sheets.every((x) => s1.sheets.some((y) => y.name === x.name && y.box.every((v, i) => Math.abs(v - x.box[i]) < 1e-6))), 'the others as they were');
  await centre(page, (X.box[0] + X.box[2]) / 2, (X.box[1] + X.box[3]) / 2); await page.waitForTimeout(400);
  assert.ok((await pl(page)).gridDrawn.some((g) => g.name === X.name), `the Drawing boxes ${X.name}: ${JSON.stringify((await pl(page)).gridDrawn)}`);
  const e1 = await exportPlan(page);
  assert.deepEqual(e1.sheets, names(s1), 'the export prints it'); assert.ok(e1.grid.sheets.some((x) => x.name === X.name && x.forPhoto));
  assert.deepEqual(e1.gridKeep, { origin: k1.geo, n: 1 }, 'the grid kept'); assert.equal(e1.hash, s1.hash, 'the export is the preview');
  // a pole's details dragged onto the nearest edge of its sheet: outlined orange on the Drawing, said when tapped, cut on two printed sheets (as a photo)
  await drawing(page, 0.5); let s2 = await snap(page, await shown(page));
  const det = s2.mv.items.filter((m) => m.kind === 'details' && m.how === 'auto').map((m) => { const S = s2.sheets.find((x) => m.box[0] >= x.box[0] && m.box[0] <= x.box[2] && m.box[1] >= x.box[1] && m.box[1] <= x.box[3]);
    const ds = [[m.box[0] - S.box[0], S.box[0], m.box[1]], [S.box[2] - m.box[0], S.box[2], m.box[1]], [m.box[1] - S.box[1], m.box[0], S.box[1]], [S.box[3] - m.box[1], m.box[0], S.box[3]]].sort((u, v) => u[0] - v[0])[0]; return { m, d: ds[0], to: [ds[1], ds[2]] }; }).sort((u, v) => u.d - v.d)[0];
  assert.ok(det && det.d < 300, JSON.stringify(det));
  await centre(page, (det.m.box[0] + det.to[0]) / 2, (det.m.box[1] + det.to[1]) / 2); await page.waitForTimeout(300);
  c = (await mvOf(page)).items.find((m) => m.id === det.m.id); n0 = (await pl(page)).n;
  await drag(page, c.x, c.y, (det.to[0] - det.m.box[0]) / 0.5, -(det.to[1] - det.m.box[1]) / 0.5);
  s2 = await snap(page, await shown(page, (x) => x.n > n0)); const D2 = s2.mv.items.find((m) => m.id === det.m.id);
  assert.equal(D2.how, 'by hand'); assert.ok(Array.isArray(D2.cut) && D2.cut.length === 2 && D2.cut.every((nm) => s2.sheets.some((x) => x.name === nm)), `cut on two printed sheets: ${JSON.stringify(D2.cut)} / ${names(s2)}`);
  assert.deepEqual(s2.mv.items.filter((m) => m.cut).map((m) => m.id), [det.m.id], 'only that one outlined');
  await page.mouse.click(D2.x, D2.y); await page.waitForTimeout(300);
  assert.match((await mvOf(page)).info, new RegExp(`^Pole details of CC-\\d+ · placed by hand on the plan · across the edge of sheets ${D2.cut[0]} and ${D2.cut[1]}: it prints cut on both, drag it inside oneBack to automatic$`));
  assert.match(await page.evaluate(() => document.getElementById('drawLegendBody').textContent), /A photo across a sheet’s edge \(orange\): it prints cut on both sheets \(a label, number or pole’s details too\); drag it inside one/);
  const e2 = await exportPlan(page), M2 = by(e2.movable, det.m.id);
  assert.deepEqual(M2.cut, D2.cut, 'the export: cut on the same two'); assert.ok(e2.notes.some((t) => /^Labels, numbers or pole details placed by hand across a sheet's edge /.test(t)), JSON.stringify(e2.notes));
  assert.equal(e2.hash, s2.hash, 'the export is the preview');
  // Back to automatic for all: asked, then no pin, no grid kept, the plan as before the edits
  await drawing(page, 0.5); await shown(page);
  for (let i = 0; i < 40 && !(await pl(page)).phAll; i++) await page.waitForTimeout(250);
  const n1 = (await pl(page)).n; await page.click('#drawPhAll'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('askTitle').textContent), 'Back to automatic: 2 items?');
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  assert.deepEqual(await pinsKept(page), NO_PINS); assert.equal((await keptNow(page)).grid, null, 'the grid kept let go');
  const s3 = await snap(page, await shown(page, (x) => x.n > n1)); assert.deepEqual(names(s3), names(s0), 'the sheets as the plan finds them'); assert.equal(s3.hash, s0.hash, 'the plan as before the edits');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the owner\'s sequence with a number, a pole\'s details and a cable label placed by hand: exported (AutoCAD files and PDF), another project, back: the same preview (sheets, names, display list); the export is the preview; the roads got once', async () => {
  const { ctx, page, errors, calls } = await open({ desk: true, other: true, roads: true, exp: { dxfMarks: 'both', dxfLabels: 'std', dxfPdf: true } });
  await drawing(page); const s0 = await snap(page, await shown(page, (x) => x.count && x.count.pictures === 8));
  assert.ok(s0.kept.roads && s0.kept.roads.length === 1 && s0.kept.roads[0].src === 'osm' && s0.kept.roads[0].roads >= 2, `the roads got and kept: ${JSON.stringify(s0.kept)}`);
  const bb = (k) => k.roads[0].bb.map((v) => v.toFixed(6)).join(','), got = (k) => calls.filter((c) => c === bb(k)).length; // (the downloads of a project's roads for its plan)
  assert.equal(got(s0.kept), 1, `downloaded once: ${JSON.stringify(calls)}`); assert.equal(s0.kept.grid, null, 'no grid kept before an edit');
  const cab = s0.mv.items.find((m) => m.kind === 'cable' && onScreen(m, 880));
  for (const [id, dx, dy] of [['num:s3', 40, -45], ['lbl:s3', -30, -70], [cab && cab.id, -60, 70]]) {
    const m = (await mvOf(page)).items.find((x) => x.id === id); assert.ok(m && onScreen(m, 880), `${id} on the screen: ${JSON.stringify(m)}`);
    const n0 = (await pl(page)).n; await drag(page, m.x, m.y, dx, dy); await shown(page, (x) => x.n > n0);
    for (let i = 0; i < 3 && (await mvOf(page)).items.find((x) => x.id === id).how !== 'by hand'; i++) { const n1 = (await pl(page)).n; await shown(page, (x) => x.n > n1); }
    assert.equal((await mvOf(page)).items.find((x) => x.id === id).how, 'by hand', id);
    if (id === 'num:s3') assert.ok((await keptNow(page)).grid, 'the grid kept at the first item placed by hand (a number)');
  }
  const s1 = await snap(page), k1 = s1.kept.grid, pins1 = await pinsKept(page);
  assert.ok(k1 && k1.n === 1 && k1.lab === 'std', JSON.stringify(k1)); assert.deepEqual(names(s1), names(s0), 'the same sheets and names after the edit');
  // the export (AutoCAD files and their PDF): the same job's inputs (the roads kept, the pins, the grid kept); its sheets, items and display list the preview's
  const e = await exportPlan(page);
  assert.deepEqual(e.pins, pins1, 'the pins'); assert.deepEqual(e.gridKeep, { origin: k1.geo, n: 1 }, 'the grid kept'); assert.equal(e.roads, s0.kept.roads[0].roads, 'the roads kept');
  assert.deepEqual(e.sheets, names(s1), 'the export\'s sheets: the Drawing\'s boxes'); assert.deepEqual(handPlaced(e.movable), handPlaced(s1.mv.items), 'each where the Drawing shows it');
  assert.equal(e.hash, s1.hash, 'the export\'s plan drawn as the preview\'s, item for item');
  assert.ok(await page.evaluate(() => !!window.GeDxfPdf), 'its PDF made'); assert.equal(got(s0.kept), 1, 'the export used the roads kept (no download for the plan)');
  // another project, its Drawing; then back
  await openProject(page, OTHER); let n0 = await made(page); await drawing(page); const so = await snap(page, await shown(page, (x) => x.made > n0));
  assert.ok(so.hash && so.hash !== s1.hash, 'the other project\'s own plan'); assert.ok(so.kept.roads && bb(so.kept) !== bb(s0.kept), 'its own roads');
  await openProject(page, NAME); n0 = await made(page); await drawing(page); const s2 = await snap(page, await shown(page, (x) => x.made > n0));
  assert.deepEqual(names(s2), names(s1), 'the same sheets and names'); assert.equal(s2.hash, s1.hash, 'the same plan, item for item');
  assert.deepEqual(handPlaced(s2.mv.items), handPlaced(s1.mv.items)); assert.deepEqual(s2.mv.pins, s1.mv.pins); assert.deepEqual(s2.kept.grid, k1, 'the grid kept');
  assert.equal(got(s0.kept), 1, 'no download again');
  // exported again: the same
  const e2 = await exportPlan(page); assert.equal(e2.hash, s1.hash); assert.deepEqual(e2.sheets, e.sheets); assert.deepEqual(round(e2.movable), round(e.movable));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a computer, Tidy: with pole details and a cable label placed by hand the plan keeps its grid (without it, found again: 440 m sheets to 220 m); Undo to none and Back to automatic for the last one let it go', async (t) => {
  const { ctx, page, errors } = await open({ desk: true, exp: { dxfMarks: 'both', dxfLabels: 'tidy' } });
  await page.addStyleTag({ content: '#drawHint{display:none!important}' });
  await drawing(page); const s0 = await snap(page, await shown(page, (x) => x.count && x.count.pictures === 8)), cell0 = s0.sheets[0].box[2] - s0.sheets[0].box[0];
  const LOOK = { s3: [LA0 + 0.00002, LO0 + 0.00078], cab: [LA0 + 0.0011, LO0 + 0.00139] }; // (where the owner's case was: s3's block up, the cable label of s7-s8 aside)
  const view = async (L) => { await drawing(page); await shown(page); await look(page, L[0], L[1], 0.16, 0.42, 0.45); await page.waitForTimeout(300); };
  const item = async (id) => (await mvOf(page)).items.find((x) => (id === 'cable' ? x.kind === 'cable' : x.id === id));
  const place = async (L, id, dd) => { await view(L); const m = await item(id); assert.ok(m, id); const n0 = (await pl(page)).n; await drag(page, m.x, m.y, dd[0], dd[1]); return snap(page, await shown(page, (x) => x.n > n0)); };
  // s3's block placed by hand: the grid kept; Undo: none placed by hand, the grid let go; placed again: kept again
  let s1 = await place(LOOK.s3, 'lbl:s3', [30, -140]);
  assert.ok(s1.kept.grid && s1.kept.grid.lab === 'tidy' && s1.kept.grid.cell === cell0, `kept: ${JSON.stringify(s1.kept.grid)}`);
  await page.click('#drawUndo'); await page.waitForTimeout(300);
  assert.deepEqual(await pinsKept(page), NO_PINS); assert.equal((await keptNow(page)).grid, null, 'Undo to none: the grid let go');
  s1 = await place(LOOK.s3, 'lbl:s3', [30, -140]); assert.ok(s1.kept.grid, 'kept again');
  // the cable label placed by hand too: the same grid, sheets and names
  const s2 = await place(LOOK.cab, 'cable', [-90, 60]), it = s2.mv.items.find((x) => x.kind === 'cable' && x.how === 'by hand');
  assert.ok(it, 'the cable label by hand'); assert.deepEqual(names(s2), names(s0), 'the same sheets and names'); assert.equal(s2.sheets[0].box[2] - s2.sheets[0].box[0], cell0, 'the same size');
  assert.deepEqual(s2.kept.grid, s1.kept.grid, 'the grid kept as it was');
  // the export: with the grid kept; the same job without it: the plan finds another grid (what Tidy did before)
  await page.evaluate(() => { window.__alt = true; });
  const e = await exportPlan(page);
  assert.deepEqual(e.gridKeep, { origin: s1.kept.grid.geo, n: s1.kept.grid.n }); assert.equal(e.grid.cell, cell0); assert.deepEqual(e.sheets, names(s0)); assert.equal(e.hash, s2.hash, 'the export is the preview');
  assert.ok(e.alt && e.alt.cell < cell0, `without the grid kept, another grid: ${JSON.stringify(e.alt)} (kept: ${cell0} m)`);
  t.diagnostic(`Tidy, a block and a cable label placed by hand: the grid kept, ${cell0} m sheets ${e.sheets.join(', ')}; without it ${e.alt.cell} m sheets ${e.alt.names.join(', ')}`);
  // Back to automatic for each: the last one lets the grid go
  for (const [L, id] of [[LOOK.cab, it.id], [LOOK.s3, 'lbl:s3']]) {
    await view(L); const m = await item(id); await page.mouse.click(m.x, m.y); await page.waitForTimeout(250); assert.equal((await mvOf(page)).sel, id);
    await page.click('#drawMvAuto'); await page.waitForTimeout(300);
    assert.equal(!!(await keptNow(page)).grid, id === it.id, id === it.id ? 'one left: kept' : 'none left: let go');
  }
  assert.deepEqual(await pinsKept(page), NO_PINS);
  assert.deepEqual(errors, []);
  await ctx.close();
});
