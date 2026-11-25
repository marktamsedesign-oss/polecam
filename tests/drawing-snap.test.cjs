/* (beta 7.12, Drawing edit) the plan builder (dxftpl.js, in Node) for the owner's "Closure and loop does not follow cable orientation. Cable is where that loop
   and closure should snap in to. Loop cannot be selected and do some editing.. double check every plan element and ensure that it can be edit, delete or
   update(text, colors and etc) as user requires". Run: node --test tests/drawing-snap.test.cjs (or python3 tests/run_all.py --only drawing-snap).
   - A closure (clo:<pid>) and a loop's symbol (loopsym:<pid>) sit on the cable: report.movable gives each its path (the cable through its pole as drawn)
     and along (its place on it, metres from the pole); job.pins[id].along (or a pin's at, taken to the nearest point of the path) slides it along the
     cable, turned as the cable runs there; its label (a closure's) or length (a loop's) goes with it; a closure taken off the pole joins the cable there.
   Every name, number and place is made up; tests/fixtures/plan-seed-made-up-blocks.dxf is the made-up template with plain made-up symbols. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED_BL = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));

/** 12 made-up poles 36 m apart along a made-up street that turns a corner at s6 (an L), each with a photo and a number. */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
/** the made-up route with a proposed closure and a loop at s2 (on a straight), at the corner pole s6, and an existing closure and its loop at s8 */
function snapJob(over) {
  const j = madeUpJob(over), set = (id, o) => Object.assign(j.pts.find((p) => p.id === id), o);
  set('s2', { closure: true, closureId: 'CL-01', mloop: true, mloopM: 15 }); set('s6', { closure: true, closureId: 'CL-06', mloop: true, mloopM: 20 }); set('s8', { closure: true, closureOld: true, closureId: 'CL-08', mloop: true, mloopM: 10 });
  return j;
}
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
const by = (M, id) => M.find((m) => m.id === id);
const angle = (a) => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return x; };
const readable = (d) => { let x = ((d % 360) + 360) % 360; if (x > 90 && x <= 270) x -= 180; return x; };
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null, inE = false;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0 && v.trim() === 'SECTION') inE = (R[i + 3] || '').trim() === 'ENTITIES'; if (!inE) continue;
    if (c === 0) { cur = v.trim() === 'ENDSEC' ? null : { type: v.trim(), g: [] }; continue; } if (!cur) continue; cur.g.push([c, v]); if (c === 5 && !cur.h) { cur.h = v.trim(); out.set(cur.h, cur); } else if (c === 8 && cur.layer == null) cur.layer = v; else if (c === 1 && cur.text == null) cur.text = v; }
  return out;
}
const g1 = (e, c) => { const q = e.g.find((x) => x[0] === c); return q ? q[1] : null; }, gAll = (e, c) => e.g.filter((x) => x[0] === c).map((x) => x[1]);
/** a path's length to its point nearest q, and how far q is from it */
const onPath = (P, q) => { let b = null, s = 0; for (let i = 1; i < P.length; i++) { const a = P[i - 1], e = P[i], dx = e[0] - a[0], dy = e[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-9) continue; const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (L * L))), d = Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]); if (!b || d < b.d) b = { d, s: s + t * L, u: [dx / L, dy / L] }; s += L; } return b; };
/** a closure's point: its block's insertion, or its outline's middle */
const cloAt = (E, m) => { const es = m.handles.map((h) => E.get(h)), ins = es.find((e) => e.type === 'INSERT'); if (ins) return [+g1(ins, 10), +g1(ins, 20), +(g1(ins, 50) || 0)]; const pl = es.find((e) => e.type === 'LWPOLYLINE' && (+g1(e, 70) & 1)), X = gAll(pl, 10).map(Number), Y = gAll(pl, 20).map(Number); return [X.reduce((t, x) => t + x, 0) / X.length, Y.reduce((t, y) => t + y, 0) / Y.length, null]; };

test('a closure and a loop on the cable: their path and place; slid along it (along, or a pin\'s at), turned as the cable runs, their label and length with them', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, snapJob(v)), M0 = r0.report.movable, E0 = entsOf(r0.text);
    for (const pid of ['s2', 's6', 's8']) for (const k of ['clo', 'loopsym']) {
      const m = by(M0, `${k}:${pid}`); assert.ok(m, `${JSON.stringify(v)} ${k}:${pid}: an item`); assert.equal(m.kind, k === 'clo' ? 'closure' : 'loopsym');
      assert.ok(Array.isArray(m.path) && m.path.length >= 3 && Number.isFinite(m.along), `${k}:${pid}: its path and along`); assert.equal(m.pole, pid);
      const sp = onPath(m.path, r0.report.drawnAt[pid]); assert.ok(sp.d < 8, `${k}:${pid}: its path by its pole`);
    }
    assert.ok(by(M0, 'pole:s6').with.includes('loopsym:s6'), 'a pole carries its loop\'s symbol'); near(by(M0, 'clo:s2').along, 0, 1e-6, 'a closure on the cable at its pole: along 0');
    for (const [pins, want] of [[{ 'clo:s6': { along: -8 }, 'loopsym:s6': { along: 9 } }, { 'clo:s6': -8, 'loopsym:s6': 9 }], [{ 'clo:s6': { along: 12 }, 'loopsym:s6': { along: -10 }, 'clo:s2': { at: [-8, 5] }, 'clo:s8': { along: 6 } }, { 'clo:s6': 12, 'loopsym:s6': -10, 'clo:s8': 6 }]]) {
      const r = T.build(SEED_BL, snapJob({ ...v, pins })), M = r.report.movable, E = entsOf(r.text);
      for (const [id, a] of Object.entries(want)) {
        const m = by(M, id), m0 = by(M0, id); near(m.along, a, 1e-6, `${JSON.stringify(v)} ${id}: along`); assert.equal(m.how, 'by hand'); assert.deepEqual(m.path, m0.path, 'the same path');
        if (id.startsWith('clo:')) { const c = cloAt(E, m), o = onPath(m.path, c); assert.ok(o.d < 1e-4, `${id}: on its cable (${o.d})`); const c0 = cloAt(E0, m0), o0 = onPath(m0.path, c0); near(o.s - o0.s, a - m0.along, 1e-4, `${id}: as far along as asked`);
          if (c[2] != null) near(angle(c[2] - readable(Math.atan2(o.u[1], o.u[0]) * 180 / Math.PI)), 0, 1e-3, `${id}: turned as the cable runs there`);
          const lb = by(M, `clolbl:${id.split(':')[1]}`), lb0 = by(M0, `clolbl:${id.split(':')[1]}`); near(lb.box[0] - lb0.box[0], c[0] - c0[0], 1e-4, `${id}: its label with it (E)`); near(lb.box[1] - lb0.box[1], c[1] - c0[1], 1e-4, `${id}: its label with it (N)`); near(lb.anchor[0] - lb0.anchor[0], c[0] - c0[0], 1e-4, 'its label measured from where the closure now is (E)'); near(lb.anchor[1] - lb0.anchor[1], c[1] - c0[1], 1e-4, '(N)');
        } else { const ins = m.handles.map((h) => E.get(h)).find((e) => e.type === 'INSERT');
          const o = onPath(m.path, [m.box[0], m.box[1]]), o0 = onPath(m0.path, [m0.box[0], m0.box[1]]); near(o.d, o0.d, 0.05, `${id}: its circle as far from the cable`); assert.ok(o.d > 0.1, 'beside the cable');
          const cr = (mm, oo) => { const P = mm.path; let best = null; for (let i = 1; i < P.length; i++) { const A = P[i - 1], B = P[i], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((mm.box[0] - A[0]) * dx + (mm.box[1] - A[1]) * dy) / L2)), d = Math.hypot(A[0] + t * dx - mm.box[0], A[1] + t * dy - mm.box[1]); if (!best || d < best.d) best = { d, c: dx * (mm.box[1] - A[1]) - dy * (mm.box[0] - A[0]) }; } return Math.sign(best.c); };
          assert.equal(cr(m), cr(m0), `${id}: its circle on the same side of the cable`); near(angle(+(g1(ins, 50) || 0) - Math.atan2(o.u[1], o.u[0]) * 180 / Math.PI) % 180, 0, 1e-3, `${id}: its line along the cable`);
          const lt = by(M, `loop:${id.split(':')[1]}`), lt0 = by(M0, `loop:${id.split(':')[1]}`); near(lt.box[0] - lt0.box[0], m.box[0] - m0.box[0], 0.6, `${id}: its length with it (E)`); near(lt.box[1] - lt0.box[1], m.box[1] - m0.box[1], 0.6, `${id}: its length with it (N)`);
        }
      }
      // the closure taken off its pole: the cable joined there (a cable line through where it was)
      const at6 = cloAt(E0, by(M0, 'clo:s6')), cab = [...E.values()].filter((e) => e.type === 'LWPOLYLINE' && g1(e, 6) === 'DASHED');
      const dMin = Math.min(...cab.map((e) => { const X = gAll(e, 10).map(Number), Y = gAll(e, 20).map(Number); return Math.min(...X.map((x, i) => Math.hypot(x - at6[0], Y[i] - at6[1]))); })); assert.ok(dMin < 0.05, `the cable joined at the pole (${dMin})`);
      const cab0 = [...E0.values()].filter((e) => e.type === 'LWPOLYLINE' && g1(e, 6) === 'DASHED'), d0 = Math.min(...cab0.map((e) => { const X = gAll(e, 10).map(Number), Y = gAll(e, 20).map(Number); return Math.min(...X.map((x, i) => Math.hypot(x - at6[0], Y[i] - at6[1]))); })); assert.ok(d0 > 0.5, 'not slid: broken round the closure, as before');
      // the PDF's display list draws it
      assert.ok(PDF.planList(r.text, r.report).items.length > 0);
    }
    // a pin's at on the clo kinds: taken to the nearest point of the path; a pin's rot still turns it on top
    const r2 = T.build(SEED_BL, snapJob({ ...v, pins: { 'clo:s2': { at: [-8, 15] } } })), m2 = by(r2.report.movable, 'clo:s2'), c2 = cloAt(entsOf(r2.text), m2); assert.ok(onPath(m2.path, c2).d < 1e-4, 'snapped onto its cable'); near(m2.along, -8, 0.05, 'the nearest point: 8 m back along its straight cable');
  }
});

/** the route with every kind of thing the plan can draw: clamp tags with a callout, a pull-off and a cross-over with their messenger arms (with and
 *  without the FOC), the cable's name along its run (no cable labels) */
function fullJob(over) {
  const j = snapJob({ clampStyle: { place: 'callout' }, cabLabels: false, ...over }), E0 = 787300, N0 = 786100, ll = (E, N) => ({ lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 });
  j.pts.push({ id: 'j1', poleId: 'PO-1', el: 'Pull-off', status: 'Proposed', E: E0 + 90, N: N0 - 40, att: ['s3', 's4'], ...ll(E0 + 90, N0 - 40) });
  j.spans.push({ ia: 'j1', ib: 's3', a: [E0 + 90, N0 - 40], b: [E0 + 72, N0], len: 44, lenW: 44, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] });
  j.pts.push({ id: 'x1', poleId: 'CO-1', el: 'Cross-over', status: 'Proposed', E: E0 + 150, N: N0 + 40, att: ['s5', 's6'], ...ll(E0 + 150, N0 + 40) });
  j.pts.unshift({ id: 't1', poleId: 'DEMO-TWR', el: 'Site', status: 'Existing', siteName: 'DEMOSITE MIN9001', plaId: 'PLA-9001', E: E0 - 60, N: N0 + 30, ...ll(E0 - 60, N0 + 30) }); // (a tower, its name and PLA ID its block's attributes)
  j.spans.unshift({ ia: 't1', ib: 's1', a: [E0 - 60, N0 + 30], b: [E0, N0], len: 67, lenW: 67, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] }); j.runs[0].pts = [[E0 - 60, N0 + 30], ...j.runs[0].pts];
  return j;
}
/** the model space's entities no item has (in its handles or, a span's cable, its lines), but the grid's: [type | layer | text] */
function leftover(out) {
  const E = [...entsOf(out.text).values()], own = new Set(out.report.movable.flatMap((m) => [...m.handles, ...(m.lines || [])])), grid = new Set(out.report.grid.ents || []), ow = new Map();
  for (const e of E) { const o2 = (g1(e, 330) || '').trim(); ow.set(o2, (ow.get(o2) || 0) + 1); } const modelH = [...ow.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return E.filter((e) => !own.has(e.h) && !grid.has(e.h) && (g1(e, 330) || '').trim() === modelH && (g1(e, 67) || '0').trim() !== '1').map((e) => `${e.type}|${e.layer}|${e.text || ''}`);
}

test('every element of the plan selectable: the loop\'s symbol, clamp tags, messenger arms and their EXTENDED MESSENGER, the cable\'s name, each span\'s cable; nothing left but roads and the vicinity map', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const r = T.build(SEED_BL, fullJob(v)), M = r.report.movable, E = entsOf(r.text), kinds = new Set(M.map((m) => m.kind));
    for (const k of ['loopsym', 'messenger', 'msgtext', 'cablename', 'cableline', ...(v.labels ? [] : ['clamp'])]) assert.ok(kinds.has(k), `${JSON.stringify(v)}: a ${k}`);
    for (const id of ['loopsym:s2', 'msg:j1:s3', 'msg:j1:s4', 'msgtext:j1:s4', 'cableline:s1|s2', 'cableline:j1|s3', ...(v.labels ? [] : ['clamp:s3'])]) assert.ok(by(M, id), `${JSON.stringify(v)}: ${id}`);
    assert.ok(M.some((m) => /^cabname:.+#1$/.test(m.id)), 'the cable\'s name along its run');
    const seen = new Map(); for (const m of M) for (const h of m.handles) { assert.ok(!seen.has(h), `${h}: ${m.id} and ${seen.get(h)}`); seen.set(h, m.id); } // (each entity one item's only)
    for (const sp of r.report.movable.filter((m) => m.kind === 'cableline')) { assert.ok(sp.handles.length + sp.lines.length > 0, `${sp.id}: drawn`); assert.deepEqual(sp.can, { move: false, rotate: false, scale: false, text: false, color: true, lw: true }); assert.ok(sp.path.length >= 2); }
    assert.equal(M.filter((m) => m.kind === 'cableline').length, fullJob(v).spans.length, 'one for each span');
    if (!v.labels) { const c = by(M, 'clamp:s3'), es = c.handles.map((h) => E.get(h)); assert.ok(es.some((e) => e.type === 'TEXT' && e.text === '8-10') && es.filter((e) => e.type === 'LWPOLYLINE').length === 2, 'the tag: its text, box and callout line'); assert.equal(c.pole, 's3'); assert.ok(by(M, 'pole:s3').with.includes('clamp:s3')); }
    assert.equal(E.get(by(M, 'msgtext:j1:s4').handles[0]).text, 'EXTENDED MESSENGER');
    // what no item has: the roads (and their source's line), the vicinity map's own
    const left = leftover(r).filter((x) => !/^(LWPOLYLINE\|(0|ROAD PAVEMENT)\||TEXT\|0\|ROADS: )/.test(x) && !/VICINITY/.test(x)); assert.deepEqual(left, [], `${JSON.stringify(v)}: owned by no item`);
  }
  // a span's cable in its own colour and line weight: its run's line cut at its poles, the rest as it was
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, fullJob(v)), r = T.build(SEED_BL, fullJob({ ...v, style: { 'cableline:s4|s5': { color: 3, lw: 100 } }, styleKind: { messenger: { color: 4, lw: 35 } } })), M = r.report.movable, E = entsOf(r.text);
    const m0 = by(r0.report.movable, 'cableline:s4|s5'), m = by(M, 'cableline:s4|s5'); assert.ok(m0.lines.length > 0 && !m0.handles.length, 'drawn with its run'); assert.equal(m.handles.length, 1, 'now its own line');
    const e = E.get(m.handles[0]); assert.equal(+g1(e, 62), 3); assert.equal(+g1(e, 370), 100); const X = gAll(e, 10).map(Number), Y = gAll(e, 20).map(Number);
    const A = r.report.drawnAt.s4, B = r.report.drawnAt.s5; assert.ok(Math.abs(X[0] - X[X.length - 1]) > 20 && Math.abs(X[0] - X[X.length - 1]) < 40, 'from pole to pole'); assert.ok(Math.min(...X) >= Math.min(A[0], B[0]) - 6 && Math.max(...X) <= Math.max(A[0], B[0]) + 6);
    const len = (out) => [...entsOf(out.text).values()].filter((x) => x.type === 'LWPOLYLINE' && g1(x, 6) === 'DASHED').reduce((t, x) => { const P = gAll(x, 10).map(Number), Q = gAll(x, 20).map(Number); let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i] - P[i - 1], Q[i] - Q[i - 1]); return t + s; }, 0);
    near(len(r), len(r0), 1e-3, 'the cable as long as before'); const t1 = by(M, 'cableline:s3|s4'); assert.ok([...t1.handles, ...t1.lines].every((h) => +g1(E.get(h), 62) !== 3), 'the rest of its run as it was');
    for (const id of ['msg:j1:s3', 'msg:x1:s5']) { const x = E.get(by(M, id).handles[0]); assert.equal(+g1(x, 62), 4); assert.equal(+g1(x, 370), 35); }
  }
});

test('delete: report.movable[i].del for each kind (a field of its pole\'s record, the record, a note, left off the plan); job.hide leaves items off, still listed', () => {
  const r = T.build(SEED_BL, fullJob({})), M = r.report.movable, D = (id) => by(M, id).del;
  assert.deepEqual(D('clo:s2'), { how: 'field', point: 's2', field: 'closure', off: false, also: { closureId: '' } });
  assert.deepEqual(D('loopsym:s2'), { how: 'field', point: 's2', field: 'mloop', off: false });
  assert.deepEqual(D('pole:s1'), { how: 'point', point: 's1' }); assert.deepEqual(D('pole:j1'), { how: 'point', point: 'j1' });
  assert.deepEqual(D('msg:j1:s3'), { how: 'field', point: 'j1', field: 'att', off: ['s4'] });
  for (const id of ['lbl:s3', 'num:s3', 'ph:s3', 'span:s3|s4', 'clolbl:s2', 'loop:s2', 'clamp:s3', 'msgtext:j1:s4', 'road:MADE-UP ST#1']) assert.deepEqual(D(id), { how: 'hide' }, id);
  assert.equal(D('cableline:s1|s2'), undefined, 'a span\'s cable: not deleted here');
  // guys, groundings, arms, NAPs (the made-up route with its attachments)
  const j = fullJob({}), set = (id, o) => Object.assign(j.pts.find((p) => p.id === id), o); set('s3', { guy: 'side guy + head guy', ground: true }); set('s4', { nap: true, napId: 'NAP-01', napType: 'NAP 1x8' }); set('s5', { telcoArm: true, armText: 'TELCO ARM' }); set('s7', { armType: 'single arm' });
  const r2 = T.build(SEED_BL, j), D2 = (id) => by(r2.report.movable, id).del;
  assert.deepEqual(D2('guy:s3'), { how: 'field', point: 's3', field: 'guy', off: 'head guy' }); assert.deepEqual(D2('guy:s3:2'), { how: 'field', point: 's3', field: 'guy', off: 'side guy' });
  assert.deepEqual(D2('gnd:s3'), { how: 'field', point: 's3', field: 'ground', off: false }); assert.equal(D2('nap:s4').field, 'nap');
  assert.deepEqual(D2('arm:s5'), { how: 'field', point: 's5', field: 'telcoArm', off: false }); assert.deepEqual(D2('arm:s7'), { how: 'field', point: 's7', field: 'armType', off: '' });
  // job.hide: left off (their lines and arrows too), still listed, hidden, their box kept; a block's attribute hidden in it; a span's cable stays
  for (const v of [{}, { labels: 'tidy' }]) {
    const ids = ['lbl:s3', 'clolbl:s2', 'loopsym:s2', 'pole:s1', 'ph:s5', 'span:s4|s5', 'msg:j1:s3', 'cableline:s2|s3'], r0 = T.build(SEED_BL, fullJob(v)), r1 = T.build(SEED_BL, fullJob({ ...v, hide: ids })), E = entsOf(r1.text);
    for (const id of ids) { const m = by(r1.report.movable, id), m0 = by(r0.report.movable, id); assert.deepEqual(m.box, m0.box, `${id}: its box kept`);
      if (id.startsWith('cableline:')) { assert.ok(!m.hidden && m.handles.length + m.lines.length > 0, 'a span\'s cable stays'); continue; }
      assert.equal(m.hidden, true, id); assert.deepEqual(m.handles, [], `${id}: nothing of it drawn`); assert.equal(m.z, null); for (const h of m0.handles) assert.ok(!E.has(h), `${id}: ${h} left off`); }
    assert.equal(r1.report.photoAt.s5.hidden, true); const all = [...E.values()]; all.forEach((e, i) => { if (e.type === 'ATTRIB' || e.type === 'SEQEND') assert.ok(['INSERT', 'ATTRIB'].includes(all[i - 1].type)); });
    const r2b = T.build(SEED_BL, fullJob({ ...v, hide: ['sitelbl:t1'] })), t = by(r2b.report.movable, 'sitelbl:t1'), E2 = entsOf(r2b.text); assert.equal(t.hidden, true); assert.ok(t.handles.map((h) => E2.get(h)).every((e) => e.type === 'ATTRIB' && (+g1(e, 70) & 1)), 'the tower\'s attributes hidden in its block');
    assert.ok(by(r2b.report.movable, 'site:t1').handles.length > 0, 'the tower stays');
  }
});
