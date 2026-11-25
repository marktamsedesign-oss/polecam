/* (beta 7.11, Drawing tools) the plan builder (dxftpl.js, in Node, as the app's worker runs it) for the Drawing's tools: every element of the plan may be
   selected, moved, turned and styled. Run: node --test tests/drawing-tools.test.cjs (or python3 tests/run_all.py --only drawing-tools).
   - report.movable lists every element of every kind of the contract (pole, site, sitedetails, sitename, nap, closure, closurelabel, loop, span, guy,
     ground, arm, landmark, road, and beta 7.10's photo, number, details, cable), each with what the Drawing may do to it (can), its ids the same build
     after build, each DXF entity one item's only; the display list of the PDF's own code (dxfpdf.js planList) says which item each drawn thing is.
   - job.pins { id: { at, rot, tip } }: an element's box middle at its anchor + at, turned to rot; guys, groundings and arms swing round their pole
     (their distance to it kept); a span's length moved away keeps a thin line, a closure's label its arrow (drawn again); a cable label's arrow
     points tip of the way along its line. job.poleAt: the pole drawn there, its spans and cable with it (report.drawnAt), the job given unchanged.
   - Tidy: a pole's number is an item of its own in its block; placed by hand, drawn on its own there and its block made without it.
   - job.style / styleKind: h, bold, italic, color, scale written into the DXF (an Arial bold / italic style, an MTEXT's own codes, a block's copy in
     the colour); job.leaders and an item's own lead: no line to the pole; job.cloStyle 'bubble': the owner's closure callout (dashed circle,
     pointer, its lines, proposed and existing), its pointer facing its label placed by hand.
   - Byte for byte: with none of the new fields (or them empty, or at their defaults) the DXF as beta 7.10 made it (its SHA-256, Standard and Tidy,
     the made-up templates).
   Every name, number and place is made up; tests/fixtures/plan-seed-made-up-blocks.dxf is the made-up template with plain made-up symbols under the
   template's block names (fixtures/mkseed.py --square --blocks), so guys, groundings, arms, loops, closures and NAPs are drawn. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED = fs.readFileSync(path.join(FX, 'plan-seed-made-up.dxf'), 'utf8');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const SEED_BL = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));

/** 12 made-up poles 36 m apart along a made-up street (an L), each with a photo and a number, its cable's label (as drawing-labels.spec.cjs's). */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
/** The made-up route with its attachments: a tower at its start (DEMOSITE MIN9001), a proposed closure and its loop, guys, groundings, a NAP, a telco arm,
 *  an arm, an existing closure and its loop, an existing pole, an ODC at its end, an OLT beside it, a landmark with a made-up icon, two named streets. */
function richJob(over) {
  const j = madeUpJob(over), E0 = 787300, N0 = 786100;
  const set = (id, o) => Object.assign(j.pts.find((p) => p.id === id), o);
  set('s2', { closure: true, closureId: 'CL-01', mloop: true, mloopM: 15 });
  set('s3', { guy: 'side guy', ground: true });
  set('s4', { nap: true, napId: 'NAP-01', napType: 'NAP 1x8' });
  set('s5', { telcoArm: true, armText: 'TELCO ARM', guy: 'head guy' });
  set('s6', { armType: 'single arm', guy: 'side guy + head guy' });
  set('s8', { closure: true, closureOld: true, closureId: 'CL-02', mloop: true, mloopM: 10 });
  set('s9', { status: 'Existing', label1: '' });
  set('s10', { ground: true });
  const site = { id: 't1', poleId: 'DEMO-TWR', el: 'Site', status: 'Existing', siteName: 'DEMOSITE MIN9001', plaId: 'PLA-9001', E: E0 - 60, N: N0 + 30, lat: 7.1 + 30 / 110574, lon: 125.6 - 60 / 110400 };
  const odc = { id: 'o1', poleId: 'ODC-DEMO', el: 'ODC', status: 'Proposed', E: E0 + 5 * 36 + 2, N: N0 + 7 * 36 + 30, lat: 7.1 + (7 * 36 + 30) / 110574, lon: 125.6 + (5 * 36 + 2) / 110400 };
  const olt = { id: 'l1', poleId: 'DEMO-OLT', el: 'Site', siteKind: 'OLT', status: 'Existing', siteName: 'DEMO OLT MIN9002', E: E0 + 120, N: N0 + 150, lat: 7.1 + 150 / 110574, lon: 125.6 + 120 / 110400 };
  j.pts.unshift(site); j.pts.push(odc, olt);
  j.spans.unshift({ ia: 't1', ib: 's1', a: [site.E, site.N], b: [E0, N0], len: 67, lenW: 67, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] });
  j.spans.push({ ia: 's12', ib: 'o1', a: [E0 + 5 * 36, N0 + 6 * 36], b: [odc.E, odc.N], len: 66, lenW: 66, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] });
  j.runs[0].pts = [[site.E, site.N], ...j.runs[0].pts, [odc.E, odc.N]];
  j.roads.push({ cls: 'minor', hw: 'residential', name: 'SAMPLE AVE', pts: [[E0 + 2 * 36 + 18, N0 - 120], [E0 + 2 * 36 + 18, N0 + 200]] });
  j.pois = [{ name: 'MADE-UP CHAPEL', E: E0 + 100, N: N0 + 60, kind: 'place_of_worship', icon: 0 }];
  j.lmBlocks = [{ w: 10, h: 10, f: [{ c: '#2050C0', l: [[0, 0, 10, 0, 10, 10, 0, 10]] }, { c: '#FFFFFF', l: [[4, 2, 6, 2, 6, 8, 4, 8]] }] }]; j.lmRefs = ['m:demo-place'];
  j.marks = j.pts.filter((p) => p.el === 'Pole').map((p) => p.id);
  return j;
}
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
const by = (M, id) => M.find((m) => m.id === id);
const angle = (a) => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return x; };
/** The records of a DXF's ENTITIES by handle: [code, value] pairs, type, layer, text. */
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null, inE = false;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0 && v.trim() === 'SECTION') inE = (R[i + 3] || '').trim() === 'ENTITIES'; if (!inE) continue;
    if (c === 0) { cur = { type: v.trim(), g: [] }; continue; } if (!cur) continue; cur.g.push([c, v]); if (c === 5 && !cur.h) { cur.h = v.trim(); out.set(cur.h, cur); } else if (c === 8 && cur.layer == null) cur.layer = v; else if (c === 1 && cur.text == null) cur.text = v; }
  return out;
}
const g1 = (e, c) => { const q = e.g.find((x) => x[0] === c); return q ? q[1] : null; }, gAll = (e, c) => e.g.filter((x) => x[0] === c).map((x) => x[1]);
const KINDS = ['pole', 'site', 'sitedetails', 'sitename', 'nap', 'closure', 'closurelabel', 'loop', 'span', 'guy', 'ground', 'arm', 'landmark', 'road', 'photo', 'number', 'details', 'cable'];

test('report.movable: every kind of the contract, each with what the Drawing may do to it; its ids the same build after build; each entity one item\'s only', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const a = T.build(SEED_BL, richJob(v)), b = T.build(SEED_BL, richJob(v)), M = a.report.movable, E = entsOf(a.text), seen = new Map();
    const kinds = new Set(M.map((m) => m.kind)); for (const k of KINDS) assert.ok(kinds.has(k), `${JSON.stringify(v)}: a ${k} (${[...kinds]})`);
    assert.deepEqual(b.report.movable.map((m) => [m.id, m.handles]), M.map((m) => [m.id, m.handles]), 'the same ids and entities, build after build');
    assert.equal(new Set(M.map((m) => m.id)).size, M.length, 'each id once');
    for (const m of M) {
      assert.ok(m.handles.length > 0 && m.box.length === 5 && m.box.every(Number.isFinite) && m.anchor.length === 2, JSON.stringify(m));
      for (const h of m.handles) { assert.ok(E.has(h), `${m.id}: ${h} in the DXF`); assert.ok(!seen.has(h), `${h}: ${m.id} and ${seen.get(h)}`); seen.set(h, m.id); }
      const c = m.can; assert.ok(c && ['move', 'rotate', 'scale', 'text', 'color'].every((k) => typeof c[k] === 'boolean'), `${m.id}: can ${JSON.stringify(c)}`);
      if (['guy', 'ground', 'arm'].includes(m.kind)) { assert.equal(c.move, false); assert.deepEqual(c.about, a.report.drawnAt[m.pole], `${m.id}: turned about its pole as drawn`); }
      if (['pole', 'site', 'nap', 'closure', 'guy', 'ground', 'arm', 'landmark'].includes(m.kind)) assert.equal(c.scale, true, `${m.id}: a symbol`);
      if (m.kind === 'closurelabel') assert.equal(c.callout, true);
    }
    // the ids as the contract writes them, and what each one is
    for (const id of ['pole:s1', 'site:t1', 'site:o1', 'site:l1', 'sitelbl:t1', 'sitelbl:o1', 'sitename:l1', 'nap:s4', 'clo:s2', 'clolbl:s2', 'clo:s8', 'clolbl:s8', 'loop:s2', 'loop:s8', 'span:s1|s2', 'span:s1|t1', 'guy:s3', 'guy:s6', 'guy:s6:2', 'gnd:s3', 'arm:s5', 'arm:s6', 'lm:MADE-UP CHAPEL@787400,786160', 'num:s3', 'lbl:s3', 'ph:s3']) assert.ok(by(M, id), `${JSON.stringify(v)}: ${id}`);
    for (const nm of ['MADE-UP ST', 'SAMPLE AVE']) assert.ok(M.some((m) => new RegExp(`^road:${nm}#\\d+$`).test(m.id)), `${nm}: road:<its name>#<its GEO sheet's number>`); // (Tidy: a finer grid, more sheets)
    const t = (id) => by(M, id).handles.map((h) => E.get(h).type).join(' ');
    assert.match(t('guy:s3'), /^INSERT TEXT$/, 'a guy: its symbol and its code'); assert.equal(E.get(by(M, 'guy:s3').handles[1]).text, 'SG');
    assert.match(t('arm:s5'), /^INSERT TEXT$/, 'the telco arm and its name'); assert.equal(E.get(by(M, 'arm:s5').handles[1]).text, 'TELCO ARM');
    assert.match(t('span:s1|s2'), /^TEXT$/); assert.equal(E.get(by(M, 'span:s1|s2').handles[0]).text, '36m'); assert.deepEqual(by(M, 'span:s1|s2').span, ['s1', 's2']);
    assert.ok(by(M, 'loop:s2').handles.every((h) => /LOOP/.test(E.get(h).text || '')), 'the loop text only');
    assert.ok(by(M, 'sitelbl:t1').handles.some((h) => E.get(h).text === 'DEMOSITE MIN9001'), 'the tower\'s name beside it is its details');
    assert.ok(by(M, 'nap:s4').handles.some((h) => E.get(h).text === 'NAP-01'), 'a NAP and its ID');
    // what hangs on a pole, its status
    assert.equal(by(M, 'guy:s6:2').pole, 's6'); assert.ok(by(M, 'pole:s6').with.includes('guy:s6:2') && by(M, 'pole:s6').with.includes('lbl:s6'), 'a pole carries what hangs on it');
    assert.deepEqual(by(M, 'pole:s9').can.status, { now: 'existing', field: 'status', point: 's9' }); assert.deepEqual(by(M, 'clo:s8').can.status, { now: 'existing', field: 'closureOld', point: 's8' });
    assert.deepEqual(by(M, 'nap:s4').can.status, { now: 'proposed', field: 'napOld', point: 's4' }); assert.deepEqual(by(M, 'arm:s6').can.status, { now: 'proposed', field: 'armType', point: 's6' });
    // the PDF's own display list knows each item (own)
    const L = PDF.planList(a.text, a.report), n = new Map(); for (let k = 0; k < L.own.length; k++) if (L.own[k] >= 0) n.set(L.own[k], (n.get(L.own[k]) || 0) + 1);
    M.forEach((m, i) => assert.ok(n.get(i) > 0, `${m.id}: drawn in the display list`));
  }
  // the made-up templates without symbols: their elements too
  for (const seed of [SEED, SEED_SQ]) { const M = T.build(seed, richJob({})).report.movable, kinds = new Set(M.map((m) => m.kind)); for (const k of ['pole', 'site', 'sitedetails', 'sitename', 'closurelabel', 'span', 'road', 'landmark', 'arm']) assert.ok(kinds.has(k), k); }
});

test('pins: the box\'s middle at anchor + at and turned to rot; guys, groundings and arms swing round their pole; lines and arrows to what they name', () => {
  const r0 = T.build(SEED_BL, richJob({})), M0 = r0.report.movable, E0 = entsOf(r0.text);
  const P = { 'span:s1|s2': { at: [0, -14] }, 'loop:s2': { at: [-15, -12], rot: 20 }, 'clolbl:s2': { at: [-10, -22] }, 'nap:s4': { at: [2, -16], rot: 30 }, 'clo:s8': { rot: 36 }, 'road:MADE-UP ST#1': { at: [70, 120], rot: 0 },
    'lm:MADE-UP CHAPEL@787400,786160': { at: [0, 25], rot: 0 }, 'sitelbl:o1': { at: [-30, 4] }, 'sitename:l1': { at: [0, -20], rot: 15 }, 'guy:s3': { rot: 45 }, 'gnd:s8': { rot: 0 }, 'arm:s6': { rot: -60 }, 'num:s3': { rot: 30 }, 'ph:s1': { rot: 20 } };
  const r1 = T.build(SEED_BL, richJob({ pins: P })), M1 = r1.report.movable, E = entsOf(r1.text);
  for (const [id, pin] of Object.entries(P)) {
    const m = by(M1, id), m0 = by(M0, id); assert.equal(m.how, 'by hand', id);
    if (pin.at) { near(m.box[0] - m.anchor[0], pin.at[0], 1e-6, `${id}: E`); near(m.box[1] - m.anchor[1], pin.at[1], 1e-6, `${id}: N`); }
    if (pin.rot != null) near(angle(m.box[4] - pin.rot), 0, 1e-6, `${id}: turned`);
    if (['guy', 'ground', 'arm'].includes(m.kind)) { // (round its pole: as far from it, pointing rot degrees)
      assert.deepEqual(m.anchor, m0.anchor); near(Math.hypot(m.box[0] - m.can.about[0], m.box[1] - m.can.about[1]), Math.hypot(m0.box[0] - m0.can.about[0], m0.box[1] - m0.can.about[1]), 1e-3, `${id}: as far from its pole`);
      near(angle(Math.atan2(m.box[1] - m.can.about[1], m.box[0] - m.can.about[0]) * 180 / Math.PI - pin.rot), 0, 1e-3, `${id}: pointing ${pin.rot}`);
      const ins = E.get(m.handles[0]); near(angle(+g1(ins, 50) - (+g1(E0.get(m0.handles[0]), 50) || 0) - (pin.rot - m0.box[4])), 0, 1e-3, `${id}: its block turned as much`);
    }
  }
  // the span's length moved away: a thin line to its cable; the loop's text: to its loop; the closure label: its arrow from it to the closure
  const sp = by(M1, 'span:s1|s2'), spT = sp.handles.map((h) => E.get(h).type); assert.deepEqual(spT, ['TEXT', 'LWPOLYLINE'], 'the span length and its line');
  const ln = E.get(sp.handles[1]), xs = gAll(ln, 10).map(Number), ys = gAll(ln, 20).map(Number); near(ys[0], by(M0, 'span:s1|s2').anchor[1], 0.6, 'its line from the cable');
  assert.ok(xs.length === 2 && ys[1] < ys[0], 'down to the length');
  assert.deepEqual(by(M1, 'loop:s2').handles.map((h) => E.get(h).type), ['TEXT', 'LWPOLYLINE'], 'the loop text and its line');
  const cl = by(M1, 'clolbl:s2'), clT = cl.handles.map((h) => E.get(h)); assert.deepEqual(clT.map((e) => e.type), ['TEXT', 'LWPOLYLINE', 'SOLID']);
  const head = clT[2], tip = [+g1(head, 10), +g1(head, 20)], cAt = by(M0, 'clolbl:s2').anchor, Rp = Math.hypot(tip[0] - cAt[0], tip[1] - cAt[1]);
  assert.ok(Rp > 1 && Rp < 6, `the arrow's point at the closure's edge: ${Rp}`); const dirL = Math.atan2(cl.box[1] - cAt[1], cl.box[0] - cAt[0]), dirT = Math.atan2(tip[1] - cAt[1], tip[0] - cAt[0]); near(angle((dirL - dirT) * 180 / Math.PI), 0, 1e-3, 'toward its label');
  // the photo turned: photoAt says so
  near(r1.report.photoAt.s1.rot, 20, 1e-6, 'photoAt rot'); assert.equal(r1.report.photoAt.s1.how, 'by hand');
  // a pin naming nothing changes nothing
  assert.ok(T.build(SEED_BL, richJob({ pins: { 'span:x1|x2': { at: [3, 3] }, 'guy:x9': { rot: 10 }, nothing: {} } })).text === r0.text, 'pins of nothing: the same DXF');
});

test('poleAt (and a pole\'s pin): the point drawn exactly there, its spans and cable with it; report.drawnAt says so; the job given unchanged', () => {
  const r0 = T.build(SEED_BL, richJob({})), job = richJob({}), s5 = job.pts.find((p) => p.id === 's5'), rec = [s5.E, s5.N], at = [787446, 786113];
  const r1 = T.build(SEED_BL, Object.assign(job, { poleAt: { s5: at } })), M = r1.report.movable, M0 = r0.report.movable;
  assert.deepEqual(r1.report.drawnAt.s5, at, 'drawn there'); assert.deepEqual([s5.E, s5.N], rec, 'the job given unchanged');
  const pl = by(M, 'pole:s5'); near(pl.box[0], at[0], 1e-6, 'its symbol there'); near(pl.box[1], at[1], 1e-6, 'its symbol there'); assert.equal(pl.how, 'by hand'); assert.deepEqual(pl.anchor, rec, 'measured from its surveyed place');
  for (const id of ['span:s4|s5', 'span:s5|s6']) assert.ok(Math.hypot(by(M, id).anchor[0] - by(M0, id).anchor[0], by(M, id).anchor[1] - by(M0, id).anchor[1]) > 4, `${id}: its cable moved with it`);
  for (const id of ['lbl:s5', 'num:s5', 'guy:s5', 'arm:s5']) assert.deepEqual(by(M, id).anchor, at, `${id}: with it`);
  assert.equal(by(M, 'span:s4|s5').handles.length, 1, 'the lengths written stay (36m)'); assert.equal(entsOf(r1.text).get(by(M, 'span:s4|s5').handles[0]).text, '36m');
  // the cable passes it: a cable vertex within 6 m of where it is drawn
  const E = entsOf(r1.text), cab = [...E.values()].filter((e) => e.type === 'LWPOLYLINE' && g1(e, 6) === 'DASHED'); let dMin = Infinity;
  for (const e of cab) { const X = gAll(e, 10).map(Number), Y = gAll(e, 20).map(Number); X.forEach((x, i) => { dMin = Math.min(dMin, Math.hypot(x - at[0], Y[i] - at[1])); }); }
  assert.ok(dMin < 6, `the cable by it: ${dMin}`);
  // a pole's pin: the same as poleAt from its surveyed place
  const r2 = T.build(SEED_BL, richJob({ pins: { 'pole:s5': { at: [at[0] - rec[0], at[1] - rec[1]] } } })); assert.ok(r2.text === r1.text, 'pins[pole:s5].at = poleAt');
  // a tower's pin: its model there, its point kept, a line to it
  const t0 = by(M0, 'site:t1'), r3 = T.build(SEED_BL, richJob({ pins: { 'site:t1': { at: [-12, 8] } } })), t1 = by(r3.report.movable, 'site:t1');
  near(t1.box[0] - t1.anchor[0], -12, 0.05, 'the tower\'s middle E'); near(t1.box[1] - t1.anchor[1], 8, 0.05, 'N'); assert.deepEqual(t1.anchor, t0.anchor, 'its point kept'); assert.deepEqual(r3.report.drawnAt.t1, r0.report.drawnAt.t1);
  assert.ok(t1.handles.length > t0.handles.length, 'with its line or arrow to its point');
});

test('Tidy: a pole\'s number is an item of its own in its block; placed by hand, drawn on its own there, its block without it', () => {
  const a = T.build(SEED_SQ, madeUpJob({ labels: 'tidy' })), M = a.report.movable, E = entsOf(a.text);
  for (const n of M.filter((m) => m.kind === 'number')) { assert.ok(n.block, n.id); const L = by(M, `lbl:${n.point}`); assert.ok(L.with.includes(n.id) && L.number, `${n.id}: in its block`); assert.ok(n.handles.every((h) => !L.handles.includes(h)), 'its own entities'); assert.ok(n.handles.some((h) => E.get(h).text === n.seq)); }
  for (const pin of [{ numPin: { s3: [9, 12] } }, { pins: { 'num:s3': { at: [9, 12] } } }]) {
    const b = T.build(SEED_SQ, madeUpJob({ labels: 'tidy', ...pin })), N = by(b.report.movable, 'num:s3'), L = by(b.report.movable, 'lbl:s3');
    assert.equal(N.how, 'by hand'); assert.ok(!N.block, 'on its own'); near(N.box[0] - N.anchor[0], 9, 1e-6, 'E'); near(N.box[1] - N.anchor[1], 12, 1e-6, 'N');
    assert.equal(L.number, false, 'its block without it'); assert.ok(!L.with.includes('num:s3'));
  }
});

test('a cable label\'s arrow points where tip puts it along its line (spanPts, span[0] → span[1])', () => {
  const r0 = T.build(SEED_SQ, madeUpJob({})), cab = r0.report.movable.find((m) => m.kind === 'cable');
  assert.ok(cab.spanPts && cab.spanPts.length >= 2 && !cab.tip, 'its line on its span; no arrow');
  for (const t of [0.1, 0.25, 0.5, 0.85]) {
    const r = T.build(SEED_SQ, madeUpJob({ pins: { [cab.id]: { at: [-15, 25], rot: 0, tip: t } } })), C = by(r.report.movable, cab.id), E = entsOf(r.text);
    const L = C.spanPts, want = [L[0][0] + (L[1][0] - L[0][0]) * t, L[0][1] + (L[1][1] - L[0][1]) * t];
    assert.equal(C.lead, true); near(C.tip[0], want[0], 1e-6, `${t}: tip E`); near(C.tip[1], want[1], 1e-6, `${t}: tip N`);
    const types = C.handles.map((h) => E.get(h).type); assert.deepEqual(types, ['TEXT', 'LWPOLYLINE', 'SOLID']);
    const ln = E.get(C.handles[1]), hd = E.get(C.handles[2]); near(+gAll(ln, 10)[0], want[0], 1e-5, 'its line from there'); near(+gAll(ln, 20)[0], want[1], 1e-5, 'its line from there'); near(+g1(hd, 10), want[0], 1e-5, 'its head there'); near(+g1(hd, 20), want[1], 1e-5, 'its head there');
  }
});

test('styles: h, bold, italic, color, scale written into the DXF; by kind, an item\'s own first; guys and arms scaled from their pole', () => {
  const r0 = T.build(SEED_BL, richJob({})), M0 = r0.report.movable, E0 = entsOf(r0.text);
  const st = { 'span:s3|s4': { h: 1.8, italic: true, color: 6 }, 'lbl:s3': { h: 1.5, bold: true, color: 3 }, 'nap:s4': { scale: 1.4, color: 30 }, 'guy:s6:2': { scale: 2 }, 'num:s7': { h: 1.5, color: 1 }, 'sitelbl:t1': { bold: false, italic: true } };
  const r1 = T.build(SEED_BL, richJob({ style: st, styleKind: { loop: { color: 4, bold: true }, span: { color: 2 } } })), M = r1.report.movable, E = entsOf(r1.text);
  const recs = (MM, EE, id) => by(MM, id).handles.map((h) => EE.get(h));
  // h: a span's length 1.8 times as high, its box too
  near(+g1(recs(M, E, 'span:s3|s4')[0], 40), +g1(recs(M0, E0, 'span:s3|s4')[0], 40) * 1.8, 1e-5, 'h'); near(by(M, 'span:s3|s4').box[3], by(M0, 'span:s3|s4').box[3] * 1.8, 1e-3, 'its box');
  near(+g1(recs(M, E, 'num:s7').find((e) => e.type === 'TEXT' && g1(e, 62) !== '   250'), 40), +g1(recs(M0, E0, 'num:s7').find((e) => e.type === 'TEXT' && g1(e, 62) !== '   250'), 40) * 1.5, 1e-5, 'a number\'s h');
  // italic, bold: Arial styles made for them (AutoCAD: their TrueType files; the PDF: their font flags); an MTEXT's own codes
  assert.equal(g1(recs(M, E, 'span:s3|s4')[0], 7), 'G-ESAA ARIAL I'); assert.ok(recs(M, E, 'lbl:s3').filter((e) => e.type === 'TEXT').every((e) => g1(e, 7) === 'G-ESAA ARIAL B'), 'the details bold');
  assert.match(r1.text, /\n  2\r?\nG-ESAA ARIAL I\r?\n[^]*?\n  3\r?\nariali\.ttf\r?\n/, 'the italic style: ariali.ttf'); assert.match(r1.text, /\n  2\r?\nG-ESAA ARIAL B\r?\n[^]*?\n  3\r?\narialbd\.ttf\r?\n/, 'the bold style: arialbd.ttf');
  const mt = recs(M, E, 'lbl:s3').find((e) => e.type === 'MTEXT'); assert.match(gAll(mt, 3).join('') + g1(mt, 1), /\\f[^;]*\|b1/, 'its lat / long bold in its codes');
  const tw = recs(M, E, 'sitelbl:t1'); assert.ok(tw.some((e) => e.type === 'ATTRIB' && g1(e, 7) === 'G-ESAA ARIAL I' && e.text === 'DEMOSITE MIN9001'), 'the tower\'s name italic, no longer bold');
  // color: every entity of it (a dark shadow kept); a block drawn in a copy in that colour; by kind, an item's own first
  assert.ok(recs(M, E, 'span:s3|s4').every((e) => g1(e, 62) === '     6'), 'its own colour (6) over its kind\'s (2)'); assert.ok(recs(M, E, 'span:s1|s2').every((e) => g1(e, 62) === '     2'), 'its kind\'s colour');
  assert.ok(recs(M, E, 'loop:s2').every((e) => g1(e, 62) === '     4' && g1(e, 7) === 'G-ESAA ARIAL B'), 'every loop cyan and bold (by kind)');
  const nap = recs(M, E, 'nap:s4'), ins = nap.find((e) => e.type === 'INSERT'); assert.equal(g1(ins, 2), 'proposed NAP C30', 'its block in colour 30'); assert.match(r1.text, /\n  2\r?\nproposed NAP C30\r?\n/, 'the block copy');
  assert.ok(nap.every((e) => e.type === 'SEQEND' || g1(e, 62) === '    30'));
  // scale: a NAP 1.4 times as large about its middle; a guy twice as long from its pole
  near(+g1(ins, 41), +g1(recs(M0, E0, 'nap:s4').find((e) => e.type === 'INSERT'), 41) * 1.4, 1e-5, 'scale'); near(by(M, 'nap:s4').box[0], by(M0, 'nap:s4').box[0], 1e-3, 'about its middle');
  const g0 = by(M0, 'guy:s6:2'), gg = by(M, 'guy:s6:2'), gi0 = recs(M0, E0, 'guy:s6:2')[0], gi = recs(M, E, 'guy:s6:2')[0];
  near(+g1(gi, 41), +g1(gi0, 41) * 2, 1e-5, 'twice as large'); near(+g1(gi, 10), +g1(gi0, 10), 1e-5, 'from where it meets its pole'); near(+g1(gi, 20), +g1(gi0, 20), 1e-5, 'from where it meets its pole');
  assert.ok(Math.hypot(gg.box[0] - gg.can.about[0], gg.box[1] - gg.can.about[1]) > Math.hypot(g0.box[0] - g0.can.about[0], g0.box[1] - g0.can.about[1]) + 2, 'growing out from its pole');
  near(+g1(gi, 50), +g1(gi0, 50), 1e-6, 'pointing as before');
});

test('leaders: none from photos, pole details and numbers to their pole (Plan style), or from one item (its own lead)', () => {
  const pins = { numPin: { s3: [12, 14] }, lblPin: { s5: [12, -22, 0] }, phPin: { s7: [-40, 15] } };
  const lines = (out, kinds) => { const E = entsOf(out.text); return out.report.movable.filter((m) => kinds.includes(m.kind)).flatMap((m) => m.handles.map((h) => E.get(h))).filter((e) => e.type === 'LWPOLYLINE' && !(+g1(e, 70) & 1)).length; };
  for (const v of [{}, { labels: 'tidy' }]) {
    const a = T.build(SEED_SQ, madeUpJob({ ...v, ...pins })), b = T.build(SEED_SQ, madeUpJob({ ...v, ...pins, leaders: { photo: false, details: false, number: false } }));
    for (const k of ['photo', 'details', 'number']) { assert.ok(lines(a, [k]) > 0, `${JSON.stringify(v)} ${k}: lines`); assert.equal(lines(b, [k]), 0, `${JSON.stringify(v)} ${k}: none`); }
    assert.ok(Object.values(b.report.photoAt).every((x) => x.line == null), 'photoAt: no line');
    const c = T.build(SEED_SQ, madeUpJob({ ...v, ...pins, style: { 'num:s3': { lead: false } } })), E = entsOf(c.text);
    assert.ok(by(c.report.movable, 'num:s3').handles.every((h) => E.get(h).type !== 'LWPOLYLINE'), 'its own lead off'); assert.equal(lines(c, ['photo']), lines(a, ['photo']), 'the others as they were');
  }
  // a span's length moved away, lead off: no line
  const d = T.build(SEED_BL, richJob({ pins: { 'span:s1|s2': { at: [0, -14] } }, style: { 'span:s1|s2': { lead: false } } }));
  assert.deepEqual(by(d.report.movable, 'span:s1|s2').handles.map((h) => entsOf(d.text).get(h).type), ['TEXT']);
});

test('the closure bubble callout (job.cloStyle bubble): dashed circle, pointer, its lines; proposed and existing; placed by hand, its pointer faces it', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const r = T.build(SEED_BL, richJob({ ...v, cloStyle: 'bubble' })), M = r.report.movable, E = entsOf(r.text);
    const want = { s2: ['PROPOSE 12C', 'HYBRID CLOSURE', 'FACING DEMOSITE MIN9001', '7.100000%%d, 125.600326%%d'], s8: ['PROPOSE INSERTION', '@EXISTING CLOSURE', 'FACING DEMOSITE MIN9001', '7.100651%%d, 125.601630%%d'] };
    for (const [pid, lines] of Object.entries(want)) {
      const m = by(M, `clolbl:${pid}`), es = m.handles.map((h) => E.get(h)), circ = es.filter((e) => e.type === 'CIRCLE'), sol = es.filter((e) => e.type === 'SOLID'), tx = es.filter((e) => e.type === 'TEXT' && g1(e, 62) !== '   250');
      assert.equal(circ.length, 2, `${pid}: its circle (and its dark edge)`); assert.ok(circ.every((e) => g1(e, 6) === 'DASHED'), 'dashed'); assert.deepEqual(circ.map((e) => +g1(e, 62)), [250, 60], 'yellow-green over a dark edge');
      const c0 = [+g1(circ[0], 10), +g1(circ[0], 20)], rb = +g1(circ[0], 40), cl = by(M, `clo:${pid}`); near(Math.hypot(c0[0] - cl.box[0], c0[1] - cl.box[1]), 0, 0.3, `${pid}: round the closure`);
      // as the owner's drawing measures: the circle 6 times the text's height round (or round the pentagon), the pointer's tip 1.24 times the radius out,
      // its corners on the circle 27° each side (a chord 0.91 of the radius), its inner side the circle's
      const th = +g1(tx[0], 40); assert.ok(rb >= 6 * th - 1e-6, `${pid}: its circle ${rb} round, 6 times its text (${th})`);
      assert.equal(sol.length, 8, 'the pointer: solid pieces'); const tip = [+g1(sol[0], 10), +g1(sol[0], 20)]; assert.ok(sol.every((e) => +g1(e, 10) === tip[0] && +g1(e, 62) === 60), 'from one tip');
      near(Math.hypot(tip[0] - c0[0], tip[1] - c0[1]), 1.24 * rb, 1e-3, 'its tip 0.24 of the radius out from the circle');
      for (const e of sol) for (const cx of [11, 12]) near(Math.hypot(+g1(e, cx) - c0[0], +g1(e, cx + 10) - c0[1]), rb, 1e-3, 'its inner side on the circle');
      const k0 = [+g1(sol[0], 11) - c0[0], +g1(sol[0], 21) - c0[1]], k8 = [+g1(sol[7], 12) - c0[0], +g1(sol[7], 22) - c0[1]], tv = [tip[0] - c0[0], tip[1] - c0[1]];
      near(Math.abs(angle((Math.atan2(k8[1], k8[0]) - Math.atan2(k0[1], k0[0])) * 180 / Math.PI)), 54, 1e-3, 'its corners 27° each side'); near(angle((Math.atan2(k0[1], k0[0]) + Math.atan2(k8[1], k8[0]) - 2 * Math.atan2(tv[1], tv[0])) * 90 / Math.PI), 0, 1e-3, 'about its tip');
      assert.deepEqual(tx.map((e) => e.text), lines, `${pid}: its lines`); assert.deepEqual(tx.map((e) => +g1(e, 62)), pid === 's2' ? [1, 1, 3, 3] : [1, 3, 3, 3], 'red, then green');
      const right = tip[0] >= c0[0], side = Math.abs(tv[0]) >= 0.5 * Math.hypot(tv[0], tv[1]); assert.ok(tx.every((e) => +g1(e, 72) === (side && !right ? 2 : 0) && Math.abs(+g1(e, 11) - +g1(tx[0], 11)) < 1e-6), 'aligned beside the tip (to its left: their mirror)');
      if (side) { near(+g1(tx[0], 21), tip[1], 1e-6, 'its first line level with the tip'); near(Math.abs(+g1(tx[0], 11) - tip[0]), 0.8 * th, 1e-6, 'starting just past the tip'); }
      assert.equal(es.filter((e) => e.type === 'TEXT' && g1(e, 62) === '   250').length, tx.filter((e) => +g1(e, 62) === 3).length, 'the green lines with a dark shadow');
      assert.equal(m.can.scale, true, 'its size can be changed');
    }
    assert.deepEqual(r.report.closureLabels.bubbles.map((b) => [b.cid, b.old]), [['CL-01', false], ['CL-02', true]]);
    assert.ok(![...E.values()].some((e) => e.type === 'TEXT' && /^PROPOSED CLOSURE/.test(e.text || '')), 'no arrow label');
  }
  // placed by hand: the texts there, the circle kept, the pointer facing the label
  const r0 = T.build(SEED_BL, richJob({ cloStyle: 'bubble' })), m0 = by(r0.report.movable, 'clolbl:s8'), r1 = T.build(SEED_BL, richJob({ cloStyle: 'bubble', pins: { 'clolbl:s8': { at: [-52, -14] } } })), m1 = by(r1.report.movable, 'clolbl:s8'), E = entsOf(r1.text);
  near(m1.box[0] - m1.anchor[0], -52, 1e-6, 'there'); near(m1.box[1] - m1.anchor[1], -14, 1e-6, 'there');
  const es = m1.handles.map((h) => E.get(h)), circ = es.find((e) => e.type === 'CIRCLE'), c0 = [+g1(circ, 10), +g1(circ, 20)], tip = es.filter((e) => e.type === 'SOLID').map((e) => [+g1(e, 10), +g1(e, 20)])[0];
  near(Math.hypot(c0[0] - m0.anchor[0], c0[1] - m0.anchor[1]), 0, 0.3, 'its circle round the closure still');
  near(angle((Math.atan2(tip[1] - c0[1], tip[0] - c0[0]) - Math.atan2(m1.box[1] - c0[1], m1.box[0] - c0[0])) * 180 / Math.PI), 0, 1e-3, 'its pointer toward the label');
  // its size (scale): the circle and the pointer half as large, its lines beside the tip still; its texts (h) grow from the tip's side
  const r4 = T.build(SEED_BL, richJob({ cloStyle: 'bubble', style: { 'clolbl:s8': { scale: 0.5, h: 1.25 } } })), E4 = entsOf(r4.text), m4 = by(r4.report.movable, 'clolbl:s8'), e4 = m4.handles.map((h) => E4.get(h)), es0 = m0.handles.map((h) => entsOf(r0.text).get(h));
  const rad = (es) => +g1(es.find((e) => e.type === 'CIRCLE'), 40), tip4 = (() => { const sd = e4.find((e) => e.type === 'SOLID'); return [+g1(sd, 10), +g1(sd, 20)]; })(), c4 = [+g1(e4.find((e) => e.type === 'CIRCLE'), 10), +g1(e4.find((e) => e.type === 'CIRCLE'), 20)];
  near(rad(e4), rad(es0) / 2, 1e-5, 'half as large'); near(Math.hypot(tip4[0] - c4[0], tip4[1] - c4[1]), 1.24 * rad(e4), 1e-3, 'its pointer with it');
  const t40 = es0.filter((e) => e.type === 'TEXT' && g1(e, 62) !== '   250'), t4 = e4.filter((e) => e.type === 'TEXT' && g1(e, 62) !== '   250');
  near(+g1(t4[0], 40), +g1(t40[0], 40) * 1.25, 1e-5, 'h: its texts'); near(+g1(t4[0], 21), tip4[1], 1e-5, 'its first line level with its tip'); near(Math.abs(+g1(t4[0], 11) - tip4[0]), 0.8 * +g1(t40[0], 40), 1e-5, 'just past it');
  assert.equal(by(T.build(SEED_BL, richJob({})).report.movable, 'clolbl:s2').can.scale, false, 'an arrow label: no size of its own');
  // one closure's own callout: the arrow for it, the bubble for the other
  const r2 = T.build(SEED_BL, richJob({ cloStyle: 'bubble', style: { 'clolbl:s2': { callout: 'arrow' } } })); assert.deepEqual(r2.report.closureLabels.bubbles.map((b) => b.cid), ['CL-02']);
  assert.ok([...entsOf(r2.text).values()].some((e) => e.type === 'TEXT' && /^PROPOSED CLOSURE · CL-01$/.test(e.text || '')), 'its arrow label');
});

test('byte for byte: with none of the new fields, empty, or at their defaults, the DXF as beta 7.10 made it', () => {
  // [template, job, labels, SHA-256 (first 16) of beta 7.10's DXF]
  const WANT = [['blocks', 'rich', 'std', 'e56c60919689af6f'], ['blocks', 'rich', 'tidy', '3a862dc17942f1df'], ['square', 'rich', 'std', '7cf94958c75fe3e5'], ['square', 'rich', 'tidy', '0be0b37d1b765109'],
    ['made-up', 'rich', 'std', '704628b71c2b5f19'], ['blocks', '12', 'std', 'cf81b00c70b2b16b'], ['blocks', '12', 'num', 'bc344468f5120a2c']];
  const V = { std: {}, tidy: { labels: 'tidy' }, num: { markMode: 'num', markNum: true } }, S = { blocks: SEED_BL, square: SEED_SQ, 'made-up': SEED };
  const empty = { pins: {}, poleAt: {}, style: {}, styleKind: {}, leaders: { photo: true, details: true, number: true }, cloStyle: 'arrow' }, ghost = { pins: { 'pole:x1': { at: [1, 1] }, 'span:x1|x2': { rot: 5 } }, poleAt: { x9: [1, 2] }, style: { 'guy:x1': { color: 3 } } };
  const got = [];
  for (const [sn, jn, vn] of WANT) {
    const mk = (o) => (jn === 'rich' ? richJob({ ...V[vn], ...o }) : madeUpJob({ ...V[vn], ...o })), out = T.build(S[sn], mk({}));
    for (const x of [empty, ghost]) assert.ok(T.build(S[sn], mk(x)).text === out.text, `${sn} ${jn} ${vn}: the same with ${JSON.stringify(x)}`);
    got.push([sn, jn, vn, sha(out.text)]);
  }
  assert.deepEqual(got, WANT, 'as beta 7.10 made them');
});
