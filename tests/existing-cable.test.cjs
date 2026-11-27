/* (stage 11, existing cable) The existing cable drawn along the road, without the app: its line (core.js PoleCore.xc: the roads followed at a distance from their
   centre line on the Left / Right of the way it runs, a traverse, a pole tapped, straight where there is no road or the roads go a long way round; (beta 7.19,
   existing cable) the side of the road a tap is on, C.xc.sides: the cable's side from the first tap, the road crossed where a tap is on the other side), the plan
   (dxftpl.js job.xcab: its line on the kit's PLAN CABLE AE / UG EXISTING layer, else the cable layer in blue, its end at an ODF drawn on to the ODF where the
   plan draws it, a hanging end's note with its leader, the sheets covering it; without job.xcab the plan as before, byte for byte) and the KMZ (core.js buildKml
   opts.excab: a folder "Existing cables (reference)"; without it, as before). Run: node --test tests/existing-cable.test.cjs (or python3 tests/run_all.py
   --only existing-cable). Every name, number and drawing is made up (the synthesizer's made-up plan, tests/fixtures/plan-seed-made-up*.dxf). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'), FX = path.join(__dirname, 'fixtures');
const C = require(path.join(root, 'core.js')), T = require(path.join(root, 'dxftpl.js')), G = require(path.join(root, 'vendor', 'synth', 'dxfsynth.js'));
const KS = fs.readFileSync(path.join(FX, 'plan-seed-made-up-kit.dxf'), 'utf8'), SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= (tol || 0.01) && Math.abs(a[1] - b[1]) <= (tol || 0.01);
// an L of roads (metres): a street along y = 0 from x = -100 to 300, an avenue from (300, 0) north to (300, 400); a footpath; a road far away
const ROADS = [{ cls: 'minor', pts: [[-100, 0], [0, 0], [100, 0], [300, 0]] }, { cls: 'major', pts: [[300, 0], [300, 150], [300, 400]] }, { cls: 'path', pts: [[50, 1], [50, 300]] }, { cls: 'minor', pts: [[2000, 0], [2000, 400]] }];

test('a stretch follows the roads at its distance on the Left or the Right of the way it runs; round a corner mitred', () => {
  const L = C.xc.segment(ROADS, { E: 10, N: 2 }, { E: 290, N: 200 }, { off: 3, side: 'L' });
  assert.equal(L.road, true); assert.deepEqual(L.pts, [[10, 3], [100, 3], [297, 3], [297, 150], [297, 200]]); // (east: its north side; north: its west side; the corner 3 m from both)
  const R = C.xc.segment(ROADS, { E: 10, N: 2 }, { E: 290, N: 200 }, { off: 3, side: 'R' });
  assert.deepEqual(R.pts, [[10, -3], [100, -3], [303, -3], [303, 150], [303, 200]]);
  const back = C.xc.segment(ROADS, { E: 290, N: 200 }, { E: 10, N: 2 }, { off: 4, side: 'L' }); // (the other way: its left is the east side, then the south side)
  assert.deepEqual(back.pts, [[304, 200], [304, 150], [304, -4], [100, -4], [10, -4]]);
  assert.deepEqual(C.xc.segment(ROADS, { E: 10, N: 2 }, { E: 60, N: -1 }).pts, [[10, 3], [60, 3]], 'the default: 3 m on the left; the footpath not a road');
});

test('a pole tapped: the line from it (and to it), the part behind it left out; no road under a tap, or a long way round: straight', () => {
  const P = C.xc.segment(ROADS, { E: 10, N: 4.5, pole: true }, { E: 200, N: -1 }, { off: 3, side: 'L' });
  assert.deepEqual(P.pts, [[10, 4.5], [100, 3], [200, 3]]);
  const Q = C.xc.segment(ROADS, { E: 20, N: 1 }, { E: 150, N: 5.5, pole: true }, { off: 3, side: 'L' });
  assert.deepEqual(Q.pts, [[20, 3], [100, 3], [150, 5.5]]);
  const free = C.xc.segment(ROADS, { E: 10, N: 2 }, { E: 150, N: 300 }, { off: 3, side: 'L' });
  assert.equal(free.road, false); assert.deepEqual(free.pts, [[10, 3], [150, 300]], 'off the roads at its end: straight (its start beside its road)');
  const far = C.xc.segment(ROADS, { E: 2000, N: 300 }, { E: 290, N: 300 }, { off: 3, side: 'L' });
  assert.equal(far.road, false, 'two roads not joined: straight');
  const round = C.xc.segment([{ cls: 'minor', pts: [[0, 0], [0, 500], [30, 500], [30, 0]] }], { E: 0, N: 10 }, { E: 30, N: 10 }, { off: 3, side: 'R' });
  assert.equal(round.road, false, 'a 1 km way round between two taps 30 m apart: straight');
  assert.deepEqual(C.xc.segment([], { E: 1, N: 2 }, { E: 5, N: 6 }).pts, [[1, 2], [5, 6]], 'no roads at all: straight');
});

test('the whole line: a traverse at a tap (the other side from it on), each stretch kept apart', () => {
  const W = C.xc.line(ROADS, [{ E: 10, N: 2 }, { E: 200, N: 1, x: true }, { E: 302, N: 300 }], { off: 3, side: 'L' });
  assert.deepEqual(W.segs, [[[10, 3], [100, 3], [200, 3]], [[200, -3], [303, -3], [303, 150], [303, 300]]]);
  assert.deepEqual(W.pts, [[10, 3], [100, 3], [200, 3], [200, -3], [303, -3], [303, 150], [303, 300]], 'the road crossed at the tap');
  assert.deepEqual(W.road, [true, true]);
  const W2 = C.xc.line(ROADS, [{ E: 10, N: 2 }, { E: 200, N: 1, x: true }, { E: 250, N: 1, x: true }], { off: 3, side: 'R' });
  assert.deepEqual(W2.pts, [[10, -3], [100, -3], [200, -3], [200, 3], [250, 3]], 'the first stretch on the right; a crossing at its last tap does nothing yet');
});

test('(beta 7.19, existing cable) the side of the road a tap is on, as the cable runs: the cable\'s side from the first tap, the road crossed where a tap is on the other side', () => {
  const sd = (a, b, o) => { const r = C.xc.sides(ROADS, { E: a[0], N: a[1] }, { E: b[0], N: b[1] }, o); return [r.a, r.b]; };
  assert.equal(C.xc.MID, 1, 'about a metre');
  assert.deepEqual(sd([10, 4], [200, 4]), ['L', 'L'], 'going east: the north side is the left');
  assert.deepEqual(sd([10, -4], [200, -4]), ['R', 'R'], 'the south side: the right');
  assert.deepEqual(sd([200, 4], [10, 4]), ['R', 'R'], 'going west: the north side is the right');
  assert.deepEqual(sd([10, 4], [200, -4]), ['L', 'R'], 'the second on the other side');
  assert.deepEqual(sd([10, 4], [296, 200]), ['L', 'L'], 'round the corner: the avenue going north, its west side the left');
  assert.deepEqual(sd([10, 4], [304, 200]), ['L', 'R'], 'its east side the right');
  assert.deepEqual(sd([10, 0.6], [200, -1.4]), [null, 'R'], 'within a metre of the centre line: neither side');
  assert.deepEqual(sd([10, 100], [200, 4]), [null, 'L'], 'no road within reach: neither');
  assert.deepEqual(sd([60, 40], [200, 4]), [null, 'L'], 'a footpath is not a road');
  assert.deepEqual(sd([100, 4], [100, -4]), [null, null], 'straight across the road: the way it runs not known');
  assert.deepEqual(sd([100, 4], [100, -4], { dir: [1, 0] }), ['L', 'R'], 'straight across, having come from the west');
  assert.deepEqual(sd([100, 4], [100, -4], { dir: [-1, 0] }), ['R', 'L'], 'straight across, having come from the east');
  const s = C.xc.sides(ROADS, { E: 10, N: 4 }, { E: 200, N: -2.5 }); assert.equal(s.da, 4); assert.equal(s.db, 2.5);
  // the line as the app then draws it: the side of the first tap (the right); a tap on the other side crosses the road there (x)
  const W = C.xc.line(ROADS, [{ E: 10, N: -4 }, { E: 150, N: -4 }, { E: 250, N: 4, x: true }, { E: 302, N: 200 }], { off: 4, side: sd([10, -4], [150, -4])[0] });
  assert.deepEqual(W.pts, [[10, -4], [100, -4], [150, -4], [250, -4], [250, 4], [296, 4], [296, 150], [296, 200]], 'the south side, crossed at the third tap, on along the north side and up the avenue\'s west side');
});

/** the synthesizer's made-up plan (o: more of the job) */
const job = (o) => ({ ...G.madeUpJob(), pmiItems: { spans: [], points: [] }, date: new Date('2026-11-27T08:00:00Z'), ...(o || {}) });
const ents = (text) => { const L = text.split(/\r?\n/), out = []; for (let i = 0; i < L.length - 1; i += 2) { if (L[i].trim() !== '0') continue; const r = { t: L[i + 1].trim(), g: [] }; for (let k = i + 2; k < L.length - 1 && L[k].trim() !== '0'; k += 2) r.g.push([+L[k].trim(), L[k + 1].trim()]); out.push(r); } return out; };
const gv = (r, c) => { const p = r.g.find((q) => q[0] === c); return p ? p[1] : undefined; };
const XC = (J) => { const s = J.pts.find((p) => p.el === 'Pole'), o = J.pts.find((p) => p.el === 'Site'); return [
  { id: 'x1', n: 1, ug: false, pts: [[s.E - 5, s.N + 6], [s.E + 80, s.N + 6], [s.E + 160, s.N + 40], [s.E + 300, s.N + 600]], start: { text: '', odf: o.id }, end: { text: 'to demo site 2' } },
  { id: 'x2', n: 2, ug: true, pts: [[s.E - 20, s.N - 10], [s.E - 140, s.N - 10]], start: { text: 'FROM DEMO HH-9' }, end: { text: '' } }]; };

test('the plan: without job.xcab (or an empty one) as before, byte for byte; with it: its lines, its notes, the sheets cover it', () => {
  for (const seed of [KS, SQ, T.withKit(KS)]) {
    const a = T.build(seed, job()), b = T.build(seed, job({ xcab: [] })), c = T.build(seed, job({ xcab: [{ pts: [[1, 2]] }, null, { pts: 'x' }] }));
    assert.equal(b.text, a.text, 'an empty list: as before'); assert.equal(c.text, a.text, 'nothing whole to draw: as before'); assert.equal(a.report.xcab, undefined);
  }
  const J = job(), base = T.build(T.withKit(KS), job()), on = T.build(T.withKit(KS), job({ xcab: XC(J) }));
  assert.equal(on.report.xcab, 2);
  assert.ok(on.report.sheets.length > base.report.sheets.length, `the sheets cover it: ${base.report.sheets.length} → ${on.report.sheets.length}`);
  const E = ents(on.text), lay = (r) => gv(r, 8);
  const lines = E.filter((r) => r.t === 'LWPOLYLINE' && /^PLAN CABLE (AE|UG) EXISTING$/.test(lay(r)));
  assert.deepEqual(lines.map(lay), ['PLAN CABLE AE EXISTING', 'PLAN CABLE UG EXISTING'], 'on the kit\'s existing cable layers');
  const site = J.pts.find((p) => p.el === 'Site'), xy = (r) => { const X = r.g.filter((q) => q[0] === 10).map((q) => +q[1]), Y = r.g.filter((q) => q[0] === 20).map((q) => +q[1]); return X.map((x, i) => [x, Y[i]]); };
  const P = xy(lines[0]); assert.equal(P.length, 5, 'its points, and on to the site at its start');
  assert.ok(near(P[1], XC(J)[0].pts[0]) && near(P[4], XC(J)[0].pts[3]), 'its points as drawn');
  assert.ok(Math.hypot(P[0][0] - site.E, P[0][1] - site.N) < 60, `its start at the site: ${P[0]} / ${site.E},${site.N}`);
  const texts = E.filter((r) => r.t === 'TEXT' && /EXISTING/.test(lay(r))).map((r) => gv(r, 1));
  assert.deepEqual(texts.sort(), ['FROM DEMO HH-9', 'TO DEMO SITE 2'], 'the hanging ends\' notes (in capitals); an end at an ODF or with none: no note');
  const leads = E.filter((r) => r.t === 'LWPOLYLINE' && lay(r) === 'PLAN LEADER').length - ents(base.text).filter((r) => r.t === 'LWPOLYLINE' && gv(r, 8) === 'PLAN LEADER').length;
  assert.ok(leads >= 2, `a leader to each note: ${leads}`);
  // no kit: the cable's own layer, blue (existing), dashed when aerial at the existing cables' scale
  const sq = ents(T.build(SQ, job({ xcab: XC(J) })).text).filter((r) => r.t === 'LWPOLYLINE' && gv(r, 62) === '5' && r.g.filter((q) => q[0] === 10).length >= 2);
  const ae = sq.find((r) => gv(r, 6) === 'DASHED' && gv(r, 48) === '9.0'), ug = sq.find((r) => gv(r, 6) === 'Continuous');
  assert.ok(ae && ug, 'an aerial one dashed, an underground one solid'); assert.equal(gv(ae, 8), 'Proposed foc aerial'); assert.equal(gv(ug, 8), 'Proposed foc aerial'); // (the template's cable layer, as the existing RUNs' (this made-up template has no duct layer))
});

test('the KMZ: a folder "Existing cables (reference)" with each cable; without them, as before', () => {
  const pts = [{ id: 'a', poleId: 'CC-9001', lat: 7.1, lon: 125.6, element: 'Pole', status: 'Existing', takenAt: '2026-11-01T08:00:00.000Z' }];
  const k0 = C.buildKml(pts, { project: 'DEMO' }), k1 = C.buildKml(pts, { project: 'DEMO', excab: [] });
  assert.equal(k1, k0);
  const k2 = C.buildKml(pts, { project: 'DEMO', excab: [{ name: 'Existing cable 1', kind: 'Aerial', len: 123.4, from: 'hanging', to: 'TO DEMO SITE <2>', side: 'left', pts: [{ lat: 7.1, lon: 125.6 }, { lat: 7.101, lon: 125.601 }] }] });
  const f = /<Folder><name>Existing cables \(reference\)<\/name>\n(.*?)\n<\/Folder>/s.exec(k2);
  assert.ok(f); assert.match(f[1], /^<Placemark><name>Existing cable 1: hanging → TO DEMO SITE &lt;2&gt; · 123 m · aerial<\/name><styleUrl>#excable<\/styleUrl>/);
  assert.match(f[1], /<coordinates>125\.60000000,7\.10000000,0 125\.60100000,7\.10100000,0<\/coordinates>/);
  assert.match(f[1], /<Data name="status"><value>Existing<\/value><\/Data><Data name="reference_only"><value>yes<\/value><\/Data>/);
  assert.equal(k2.replace(/<Folder><name>Existing cables \(reference\)<\/name>.*?<\/Folder>\n/s, '').replace('<Style id="excable"><LineStyle><color>ffab6418</color><width>2.5</width></LineStyle></Style>\n', ''), k0);
});
