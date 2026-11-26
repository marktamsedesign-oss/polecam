/* (beta 7.12, Drawing edit) the plan builder (dxftpl.js, in Node, as the app's worker runs it) for the Drawing's edits. Run: node --test tests/drawing-notes.test.cjs
   (or python3 tests/run_all.py --only drawing-notes).
   - Photos' lines to their pole (the owner: "images on the plan that has a line pointing to its pole. i want to remove that if the users does not want
     it"): with Lines to the pole › Photos off (job.leaders.photo false, or a photo's own Line: style lead false) no line is left from any photo to its
     pole, in every mode (Standard and Tidy; near, further out with a line, smaller, where it covers least, placed by hand; the photos with the geotag
     stamp), in the DXF, report.photoAt (line null) and the PDF's display list. A closure's bubble label the plan places reads level (only a pin's rot turns it).
   - Edited text (job.text { id: [lines] }; the owner: "allow also the user to edit the text if needed"): report.movable[i].text, an item's lines as they
     read; a TEXT's, an MTEXT's (its codes kept round the new words) and an attribute's words replaced; more lines below the last with its look, fewer
     left off, [] none; a line's dark shadow follows it; the box the edited one; styles and pins on top.
   - Notes (job.notes; the owner: "let the user also add a text or photo no related with the capture on plans as needed"): a text (MTEXT on G-ESAA NOTES)
     or a photo (IMAGE and its frame, the app's NOTE_<id>.jpg) at their place, turned, sized; listed in report.movable (note:<id>, kind note / notephoto,
     can delete); a note where no sheet prints gets its GEO sheet.
   - Draw order (job.order; the owner: "allow order on the selected item, say, sent to back, backward, sent to front or forward"): front, back, forward,
     backward move an item's entities in the model space (its draw order); report.movable[i].z; the PDF's display list in that order.
   - Byte for byte: without job.text, job.notes and job.order (or them empty) the DXF as beta 7.11 made it (its SHA-256, with 7.11's own fields too).
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

/** n made-up poles gap metres apart along a made-up street (an L), each with a photo and a number, its cable's label (as drawing-tools.test.cjs's, n and gap free). */
function madeUpJob(over, n = 12, gap = 36) {
  const E0 = 787300, N0 = 786100, P = [], h = Math.ceil(n / 2); for (let i = 0; i < n; i++) P.push(i < h ? [E0 + i * gap, N0] : [E0 + (h - 1) * gap, N0 + (i - h + 1) * gap]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: gap, lenW: gap, cable: 'F12', runLbls: ['PROPOSED 12C FIG-8 AE'] })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + (h - 1) * gap + 7, N0 - 7], [E0 + (h - 1) * gap + 7, N0 + (n + 2) * gap]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'both', cabLabels: true, cabPer: 3, cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
/** The made-up route with its attachments (as drawing-tools.test.cjs's): a tower, a proposed and an existing closure, guys, a NAP, arms, an ODC, an OLT, a landmark. */
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
/** a made-up job turned deg about its first pole (its streets diagonal) */
function turnJob(j, deg) {
  const c = [787300, 786100], a = deg * Math.PI / 180, R = ([x, y]) => [c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a), c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)];
  for (const p of j.pts) { const q = R([p.E, p.N]); p.E = q[0]; p.N = q[1]; }
  for (const s of j.spans) { s.a = R(s.a); s.b = R(s.b); }
  for (const r of j.runs) r.pts = r.pts.map(R);
  for (const r of j.roads) r.pts = r.pts.map(R);
  for (const q of j.pois || []) { const z = R([q.E, q.N]); q.E = z[0]; q.N = z[1]; }
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
const g1 = (e, c) => { const q = e.g.find((x) => x[0] === c); return q ? q[1] : null; }, gAll = (e, c) => e.g.filter((x) => x[0] === c).map((x) => x[1]);
const mtOf = (e) => gAll(e, 3).join('') + (g1(e, 1) || '');
/** the distance from q to a photo's frame { x, y, w, h, rot } (0 inside) */
const dBox = (q, a) => { const t = -(+a.rot || 0) * Math.PI / 180, dx = q[0] - a.x, dy = q[1] - a.y, u = dx * Math.cos(t) - dy * Math.sin(t), v = dx * Math.sin(t) + dy * Math.cos(t); return Math.hypot(Math.max(0, Math.abs(u) - a.w / 2), Math.max(0, Math.abs(v) - a.h / 2)); };
/** every open LINE / LWPOLYLINE of the model space from a photo (one end within 1 m of its frame) to its pole (the other within 6 m of it), whatever its layer */
function photoLines(out) {
  const L = []; for (const e of entsOf(out.text).values()) { if (e.type === 'LINE') L.push([[+g1(e, 10), +g1(e, 20)], [+g1(e, 11), +g1(e, 21)]]); else if (e.type === 'LWPOLYLINE' && !(+g1(e, 70) & 1)) { const X = gAll(e, 10).map(Number), Y = gAll(e, 20).map(Number); L.push(X.map((x, i) => [x, Y[i]])); } }
  const res = []; for (const [pid, a] of Object.entries(out.report.photoAt || {})) for (const P of L) { const e0 = P[0], e1 = P[P.length - 1]; for (const [x, y] of [[e0, e1], [e1, e0]]) if (dBox(x, a) < 1 && Math.hypot(y[0] - a.dp[0], y[1] - a.dp[1]) < 6 && dBox(y, a) > 0.5) { res.push(pid); break; } }
  return res;
}
/** the open lines of the PDF's display list (dxfpdf.js planList, what the Drawing draws) that belong to a photo */
function listPhotoLines(out) {
  const pl = PDF.planList(out.text, out.report), M = out.report.movable; let n = 0;
  for (let k = 0; k < pl.own.length; k++) { const ow = pl.own[k]; if (ow < 0 || M[ow].kind !== 'photo' || pl.items[4 * k] !== 0) continue; for (let q = pl.items[4 * k + 2]; q < pl.items[4 * k + 2] + pl.items[4 * k + 3]; q++) if (!pl.subs[3 * q + 2]) n++; }
  return n;
}

test('photos: no line from any photo to its pole with Lines to the pole › Photos off, in every mode, the stamped photos too; a photo\'s own Line', () => {
  const stamp = (j) => { j.photoStyle = { ...(j.photoStyle || {}), stamp: 'addr' }; for (const ph of Object.values(j.photos)) { ph.file = ph.file.replace(/\.jpg$/, '_STAMPED.jpg'); ph.py = Math.round(ph.py * 1.18); } return j; }; // (the app burns the geotag band into the JPEG: its size; the builder only names the file)
  // [mode, its job, which: s Standard, t Tidy (a crowded Tidy plan is slow: Standard only; the stamped one is crowded too), k: Line off by kind too, o: one photo's own Line]
  const modes = [['near and further out', (v) => madeUpJob({ ...v }), 'st'], ['crowded: further, smaller', (v) => madeUpJob({ ...v, photoStyle: { size: 30 } }, 24, 12), 'sko'],
    ['very crowded: where it covers least', (v) => madeUpJob({ ...v, photoStyle: { size: 30 }, markMode: 'photo' }, 30, 5), 's'], ['placed by hand', (v) => madeUpJob({ ...v, phPin: { s3: [-40, 15] }, pins: { 'ph:s8': { at: [20, 20], rot: 20 } } }), 'st'],
    ['stamped photos, by hand too', (v) => stamp(madeUpJob({ ...v, photoStyle: { size: 30 }, phPin: { s5: [-30, 45] } }, 16, 14)), 'sto'], ['the rich route', (v) => richJob({ ...v, photoStyle: { size: 30 } }), 'st']];
  for (const v of [{}, { labels: 'tidy' }]) { let all = 0; for (const [nm, mk, w] of modes) {
    if (!w.includes(v.labels ? 't' : 's')) continue;
    const seed = nm === 'the rich route' ? SEED_BL : SEED_SQ, on = T.build(seed, mk(v)), off = T.build(seed, { ...mk(v), leaders: { photo: false } }), kind = w.includes('k') && !v.labels ? T.build(seed, { ...mk(v), styleKind: { photo: { lead: false } } }) : null;
    const n0 = photoLines(on).length; all += n0; if (nm !== 'near and further out') assert.ok(n0 > 0, `${JSON.stringify(v)} ${nm}: photos with a line to their pole (${n0})`); // (Tidy: the photos of the first in their labels, no line)
    for (const [how, out] of [['leaders.photo false', off], ['styleKind.photo.lead false', kind]]) {
      if (!out) continue;
      assert.deepEqual(photoLines(out), [], `${JSON.stringify(v)} ${nm}, ${how}: no line from a photo to its pole`);
      assert.ok(Object.values(out.report.photoAt).every((a) => a.line == null), `${JSON.stringify(v)} ${nm}, ${how}: photoAt line null`);
      assert.equal(listPhotoLines(out), 0, `${JSON.stringify(v)} ${nm}, ${how}: none on the Drawing (the display list)`);
      assert.ok(out.report.movable.filter((m) => m.kind === 'photo').every((m) => m.handles.every((h) => { const e = entsOf(out.text).get(h); return !(e.type === 'LWPOLYLINE' && !(+g1(e, 70) & 1)); })), 'its entities: no open line');
    }
    // one photo's own Line off: its line only
    const withLine = Object.entries(on.report.photoAt).filter(([, a]) => a.line).map(([id]) => id), id = withLine[0]; if (!id || !w.includes('o')) continue;
    const one = T.build(seed, { ...mk(v), style: { [`ph:${id}`]: { lead: false } } });
    assert.equal(one.report.photoAt[id].line, null, `${nm}: ${id}'s own line off`); assert.ok(!photoLines(one).includes(id)); assert.equal(photoLines(one).length, n0 - photoLines(on).filter((x) => x === id).length, 'the others keep theirs');
  } assert.ok(all > 5, `${JSON.stringify(v)}: lines to check (${all})`); }
});

test('a closure\'s bubble label the plan places reads level on any street (only a pin\'s rot turns it)', () => {
  for (const deg of [0, 35, 60, -50, 120]) for (const v of [{}, { labels: 'tidy' }]) for (const pins of [null, { 'clolbl:s2': { at: [8, -20] }, 'clolbl:s8': { at: [-30, 12] } }]) {
    if (v.labels && (deg === 0 || deg === 60 || (deg === -50) !== !!pins)) continue; // (Tidy, slower: 35° and 120° by the plan, -50° placed by hand)
    const r = T.build(SEED_BL, turnJob(richJob({ ...v, cloStyle: 'bubble', ...(pins ? { pins } : {}) }), deg)), E = entsOf(r.text);
    for (const id of ['clolbl:s2', 'clolbl:s8']) { const m = by(r.report.movable, id); assert.equal(m.box[4], 0, `${deg}° ${JSON.stringify(v)} ${id}: level`); assert.ok(m.handles.map((h) => E.get(h)).filter((e) => e.type === 'TEXT').every((e) => !(+g1(e, 50))), `${deg}° ${id}: its texts level`); }
  }
  const r = T.build(SEED_BL, turnJob(richJob({ cloStyle: 'bubble', pins: { 'clolbl:s2': { at: [8, -20], rot: 30 } } }), 35)), m = by(r.report.movable, 'clolbl:s2');
  near(m.box[4], 30, 1e-6, 'turned by its pin'); assert.ok(m.handles.map((h) => entsOf(r.text).get(h)).filter((e) => e.type === 'TEXT').every((e) => Math.abs(+g1(e, 50) - 30) < 1e-6), 'its texts at 30°');
});

test('edited text: report.movable text; TEXT, MTEXT and attribute lines replaced, more and fewer lines, [] none; shadows follow; the box; styles and pins on top', () => {
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, richJob({ ...v, cloStyle: 'bubble' })), M0 = r0.report.movable;
    for (const m of M0) { if (m.can.text) assert.ok(Array.isArray(m.text) && m.text.length && m.text.every((s) => typeof s === 'string' && !/\\[A-Za-z]|%%[dD]|[{}]/.test(s)), `${m.id}: its lines as they read ${JSON.stringify(m.text)}`); else assert.equal(m.text, undefined, m.id); }
    assert.deepEqual(by(M0, 'lbl:s3').text, ['PROP.POLE CC-9003', '8-10', '7.100000°', '125.600652°'], 'a pole\'s details: its stack, then its lat / long');
    assert.deepEqual(by(M0, 'sitelbl:t1').text, ['DEMOSITE MIN9001', 'PLA-9001', '7.100271°', '125.599457°'], 'a tower\'s attributes, then its lat / long');
    assert.deepEqual(by(M0, 'clolbl:s2').text, ['PROPOSE 12C', 'HYBRID CLOSURE', 'FACING DEMOSITE MIN9001', '7.100000°, 125.600326°'], 'a bubble\'s lines (not their shadows)');
    assert.deepEqual(by(M0, 'num:s3').text, ['3']); assert.deepEqual(by(M0, 'span:s1|s2').text, ['36m']);
    const TX = { 'lbl:s3': ['CC-9003 EDITED', '8-10', '7.1°', '125.6°', 'ADDED {1}'], 'sitelbl:t1': ['NEW SITE NAME'], 'clolbl:s2': ['PROPOSE 24C', 'HYBRID CLOSURE', 'FACING X', '7.1°, 125.6°', 'ADDED LINE'], 'num:s3': ['3A'], 'span:s1|s2': [], 'nap:s4': ['NAP-01 EDIT'] };
    const r1 = T.build(SEED_BL, richJob({ ...v, cloStyle: 'bubble', text: TX })), M = r1.report.movable, E = entsOf(r1.text), es = (id) => by(M, id).handles.map((h) => E.get(h)), E0 = entsOf(r0.text), es0 = (id) => by(M0, id).handles.map((h) => E0.get(h));
    for (const [id, L] of Object.entries(TX)) assert.deepEqual(by(M, id).text, L, `${JSON.stringify(v)} ${id}: as written`);
    // details: line k keeps line k's look; the lat / long MTEXT keeps its codes round the new words, the line added in its look
    const d0 = es0('lbl:s3'), d1 = es('lbl:s3'), mt0 = d0.find((e) => e.type === 'MTEXT' && /%%D/.test(mtOf(e))), mt1 = d1.filter((e) => e.type === 'MTEXT').pop();
    assert.ok(/7\.1%%d\\P125\.6%%d\\PADDED \\\{1\\\}/.test(mtOf(mt1)), `its lat / long and the line added: ${mtOf(mt1)}`);
    if (/^\{\\f/.test(mtOf(mt0))) assert.ok(mtOf(mt1).startsWith(mtOf(mt0).slice(0, mtOf(mt0).indexOf(';') + 1)) && mtOf(mt1).endsWith('}'), 'its font codes kept round the new words');
    assert.equal(g1(mt1, 8), g1(mt0, 8)); assert.equal(g1(mt1, 40), g1(mt0, 40)); assert.equal(g1(mt1, 7), g1(mt0, 7));
    const t0 = d0.filter((e) => e.type === 'TEXT' || (e.type === 'MTEXT' && e !== mt0)), t1 = d1.filter((e) => e.type === 'TEXT' || (e.type === 'MTEXT' && e !== mt1));
    assert.equal(t1.length, t0.length, 'as many stack lines'); t1.forEach((e, i) => { for (const c of [8, 40, 7, 62, 10, 20, 50]) assert.equal(g1(e, c), g1(t0[i], c), `stack line ${i}: group ${c}`); });
    // attributes: the first replaced, the other emptied and hidden; the MTEXT left off
    const s1 = es('sitelbl:t1'); assert.deepEqual(s1.filter((e) => e.type === 'ATTRIB').map((e) => [e.text || '', +g1(e, 70) & 1]), [['NEW SITE NAME', 0], ['', 1]]); assert.ok(!s1.some((e) => e.type === 'MTEXT'), 'its lat / long left off');
    // the bubble: its shadows follow their line; the line added below in the last line's look (green, its shadow)
    const b1 = es('clolbl:s2').filter((e) => e.type === 'TEXT'), main = b1.filter((e) => g1(e, 62) !== '   250'), shad = b1.filter((e) => g1(e, 62) === '   250');
    assert.deepEqual(main.map((e) => e.text), ['PROPOSE 24C', 'HYBRID CLOSURE', 'FACING X', '7.1%%d, 125.6%%d', 'ADDED LINE']); assert.deepEqual(main.map((e) => +g1(e, 62)), [1, 1, 3, 3, 3]);
    assert.deepEqual(shad.map((e) => e.text), ['FACING X', '7.1%%d, 125.6%%d', 'ADDED LINE'], 'the shadows with their lines');
    near(+g1(main[3], 21) - +g1(main[4], 21), +g1(main[2], 21) - +g1(main[3], 21), 1e-6, 'the line added: the spacing of the last two'); assert.equal(g1(main[4], 11), g1(main[3], 11));
    assert.deepEqual(r1.report.closureLabels.bubbles.find((b) => b.cid === 'CL-01').lines, TX['clolbl:s2'], 'report.closureLabels: its lines as written');
    { const sol = es('clolbl:s2').find((e) => e.type === 'SOLID'), circ = es('clolbl:s2').find((e) => e.type === 'CIRCLE'), tip = [+g1(sol, 10), +g1(sol, 20)], c0 = [+g1(circ, 10), +g1(circ, 20)], v = [tip[0] - c0[0], tip[1] - c0[1]], th = +g1(main[0], 40), side = Math.abs(v[0]) >= 0.5 * Math.hypot(v[0], v[1]);
      if (side) near(+g1(main[0], 21), tip[1], 1e-6, 'beside its pointer: its first line level with the tip'); else if (v[1] > 0) near(+g1(main[4], 21) - th / 2, tip[1] + 0.8 * th, 1e-6, 'above its pointer: its last line just above the tip'); else near(+g1(main[0], 21) + th / 2, tip[1] - 0.8 * th, 1e-6, 'below: its first line just below the tip'); } // (laid out again as the plan lays a bubble's lines)
    // the number and its shadow; the span's length left off (nothing of it drawn: its box kept)
    assert.deepEqual(es('num:s3').filter((e) => e.type === 'TEXT').map((e) => e.text), ['3A', '3A']);
    const sp = by(M, 'span:s1|s2'); assert.deepEqual(sp.handles, []); assert.equal(sp.empty, true); assert.deepEqual(sp.box, by(M0, 'span:s1|s2').box, 'its box where it was'); assert.equal(sp.can.text, true, 'it can be written again');
    // the box: the edited one (a longer first line: wider)
    assert.ok(by(M, 'nap:s4').box[2] > by(M0, 'nap:s4').box[2], 'the NAP\'s box as written');
    // the rest of the plan as before
    const rest = (out) => { const mine = new Set(out.report.movable.filter((m) => TX[m.id]).flatMap((m) => m.handles)); return [...entsOf(out.text).values()].filter((e) => !mine.has(e.h)).map((e) => `${e.type}|${e.text || ''}|${g1(e, 10)}|${g1(e, 20)}`).sort(); };
    assert.deepEqual(rest(r1), rest(r0), `${JSON.stringify(v)}: the other entities as they were`);
  }
  // placed by hand: its box's middle stays where it was put; styles (h, bold) on top
  for (const v of [{}, { labels: 'tidy' }]) {
    const base = { ...v, lblPin: { s3: [10, -25, 0] } }, a = T.build(SEED_SQ, madeUpJob(base)), b = T.build(SEED_SQ, madeUpJob({ ...base, text: { 'lbl:s3': ['A MUCH LONGER FIRST LINE HERE', 'X'] } }));
    const ma = by(a.report.movable, 'lbl:s3'), mb = by(b.report.movable, 'lbl:s3'); near(mb.box[0], ma.box[0], 1e-6, `${JSON.stringify(v)}: by hand, its middle E`); near(mb.box[1], ma.box[1], 1e-6, 'N'); assert.ok(mb.box[2] > ma.box[2], 'wider');
    if (v.labels) { const na = by(a.report.movable, 'num:s3'), nb = by(b.report.movable, 'num:s3'); near(nb.box[0] - (mb.box[0] - mb.box[2] / 2), na.box[0] - (ma.box[0] - ma.box[2] / 2), 0.05, 'a Tidy block\'s number with its edited text'); }
    const ln = (out) => { const E = entsOf(out.text), m = by(out.report.movable, 'lbl:s3'), e = m.handles.map((h) => E.get(h)).find((x) => x.type === 'LWPOLYLINE' && !(+g1(x, 70) & 1)); return e ? gAll(e, 10).map((x, i) => [+x, +gAll(e, 20)[i]]) : null; };
    const la = ln(a), lb = ln(b); if (la && lb) { const d = (P, B) => Math.min(...[P[0], P[P.length - 1]].map((q) => Math.hypot(Math.max(0, Math.abs(q[0] - B[0]) - B[2] / 2), Math.max(0, Math.abs(q[1] - B[1]) - B[3] / 2)))); near(d(lb, mb.box), d(la, ma.box), 0.05, 'its line to its pole still at its edge'); }
    const c = T.build(SEED_SQ, madeUpJob({ ...base, text: { 'lbl:s3': ['EDITED'] }, style: { 'lbl:s3': { h: 1.5, bold: true } } })), mc = by(c.report.movable, 'lbl:s3'), Ec = entsOf(c.text), tx = mc.handles.map((h) => Ec.get(h)).filter((e) => e.type === 'TEXT' || e.type === 'MTEXT');
    assert.deepEqual(mc.text, ['EDITED']); assert.equal(tx.length, 1); near(mc.box[0], ma.box[0], 1e-6, 'still there'); assert.ok(v.labels ? /\|b1/.test(mtOf(tx[0])) : g1(tx[0], 7) === 'G-ESAA ARIAL B', 'bold on top');
  }
  // a cable label placed by hand away from its cable: its arrow's shoulder from the end of its edited text
  { const r0 = T.build(SEED_SQ, madeUpJob({})), cab = r0.report.movable.find((m) => m.kind === 'cable'), job = (x) => madeUpJob({ pins: { [cab.id]: { at: [-15, 25], rot: 0, tip: 0.4 } }, ...x });
    const a = T.build(SEED_SQ, job({})), b = T.build(SEED_SQ, job({ text: { [cab.id]: ['PROPOSED 12C FIG-8 AE (2 RUNS)'] } })), sh = (out) => { const m = by(out.report.movable, cab.id), E = entsOf(out.text), e = m.handles.map((h) => E.get(h)).find((x) => x.type === 'LWPOLYLINE'), X = gAll(e, 10).map(Number); return [X[X.length - 1] - (m.box[0] + m.box[2] / 2), m.box]; };
    const [ga, ba] = sh(a), [gb, bb] = sh(b); assert.ok(bb[2] > ba[2] + 5, 'the label wider'); near(gb, ga, 1e-3, 'its arrow from just past its text, as before'); }
  // a pin on an edited element: its edited box's middle at anchor + at; a line added after an attribute: a TEXT after the block's attributes
  const E0 = 787300, N0 = 786100, more = (j) => { j.pts.push({ id: 'c1', poleId: 'CL-PIN', el: 'Closure', status: 'Proposed', E: E0 + 90, N: N0 - 70, lat: 7.1 - 70 / 110574, lon: 125.6 + 90 / 110400 }); return j; };
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, more(richJob({ ...v }))), m0 = by(r0.report.movable, 'clolbl:c1'); assert.ok(m0.text.includes('CL-PIN'), JSON.stringify(m0.text));
    const L = [...m0.text, 'ADDED 1'], r1 = T.build(SEED_BL, more(richJob({ ...v, text: { 'clolbl:c1': L }, pins: { 'clolbl:c1': { at: [6, -9] } } }))), m1 = by(r1.report.movable, 'clolbl:c1'), all = [...entsOf(r1.text).values()];
    assert.deepEqual(m1.text, L); near(m1.box[0] - m1.anchor[0], 6, 1e-6, 'pinned: E'); near(m1.box[1] - m1.anchor[1], -9, 1e-6, 'N');
    all.forEach((e, i) => { if (e.type === 'ATTRIB' || e.type === 'SEQEND') assert.ok(['INSERT', 'ATTRIB'].includes(all[i - 1].type), `${e.type} ${e.h} after its INSERT (${all[i - 1].type})`); });
  }
});

test('notes: a text and a photo of the user\'s at their place, turned, sized; report.movable note:<id>; a sheet for a note where none prints; styles and pins', () => {
  const notes = [{ id: 'n1', kind: 'text', at: [787340, 786140], lines: ['DEMO NOTE', 'SECOND {LINE}'], rot: 15, bold: true, color: 6, lead: [787336, 786100] },
    { id: 'n2', kind: 'photo', at: [787420, 786060], photo: { file: 'NOTE_n2.jpg', px: 800, py: 600 }, size: 20, rot: -10 }, { id: 'n3', kind: 'text', at: [788500, 786100], lines: ['FAR NOTE'] },
    { id: 'n4', kind: 'photo', at: [787250, 786150], photo: { file: 'NOTE_n4.jpg', px: 600, py: 800 } }, { id: 'bad1', kind: 'photo', at: [787250, 786150] }, { id: 'bad2', kind: 'text', at: [1, 2], lines: [' '] }, { id: 'bad3', lines: ['NO PLACE'] }];
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, richJob({ ...v })), r = T.build(SEED_BL, richJob({ ...v, notes })), M = r.report.movable, E = entsOf(r.text), es = (id) => by(M, id).handles.map((h) => E.get(h));
    assert.deepEqual(M.filter((m) => /^note:/.test(m.id)).map((m) => [m.id, m.kind]), [['note:n1', 'note'], ['note:n2', 'notephoto'], ['note:n3', 'note'], ['note:n4', 'notephoto']], 'the notes, the ones with nothing to draw left out');
    for (const m of M.filter((x) => /^note:/.test(x.id))) {
      assert.equal(m.how, 'by hand'); assert.deepEqual(m.anchor, notes.find((n) => `note:${n.id}` === m.id).at); assert.equal(m.can.delete, true); assert.equal(m.can.move && m.can.rotate && m.can.scale, true); assert.equal(m.can.text, m.kind === 'note'); assert.equal(m.can.color, m.kind === 'note');
      assert.ok(es(m.id).every((e) => e.layer === 'G-ESAA NOTES'), `${m.id}: on the notes' layer`); assert.ok(Number.isInteger(m.z));
    }
    // the text: an MTEXT in the middle of its box (its middle at `at`), turned, bold in its codes, its colour; a thin line to its point
    const t1 = es('note:n1'), mt = t1.find((e) => e.type === 'MTEXT'), ld = t1.find((e) => e.type === 'LWPOLYLINE'), n1 = by(M, 'note:n1');
    assert.equal(+g1(mt, 71), 5); near(+g1(mt, 10), 787340, 1e-6, 'its middle E'); near(+g1(mt, 20), 786140, 1e-6, 'N'); near(n1.box[0], 787340, 1e-6, 'box'); near(n1.box[4], 15, 1e-6, 'turned');
    near(Math.atan2(+g1(mt, 21), +g1(mt, 11)) * 180 / Math.PI, 15, 1e-4, 'its direction'); assert.equal(mtOf(mt), '{\\fArial|b1|i0|c0|p34;DEMO NOTE\\PSECOND \\{LINE\\}}'); assert.equal(+g1(mt, 62), 6);
    const hDet = v.labels ? null : 2.2; if (hDet) near(+g1(mt, 40), hDet, 1e-6, 'as high as the pole details'); assert.deepEqual(n1.text, ['DEMO NOTE', 'SECOND {LINE}']); assert.equal(n1.can.lead, true);
    assert.equal(g1(ld, 62), '     8'); near(+gAll(ld, 10)[0], 787336, 1e-6, 'its line to its point'); near(+gAll(ld, 20)[0], 786100, 1e-6, 'its line to its point');
    // the photo: its picture (the file the app gives) and its frame, its middle at `at`, size metres wide, turned
    const p2 = es('note:n2'), im = p2.find((e) => e.type === 'IMAGE'), fr = p2.find((e) => e.type === 'LWPOLYLINE'), n2 = by(M, 'note:n2');
    assert.match(r.text, /\n  1\r?\nNOTE_n2\.jpg\r?\n/, 'its IMAGEDEF names the file'); near(n2.box[0], 787420, 1e-6, 'its middle'); near(n2.box[1], 786060, 1e-6, 'its middle'); near(n2.box[2], 20, 1e-6, '20 m wide'); near(n2.box[3], 15, 1e-6, 'as its picture'); near(n2.box[4], -10, 1e-6, 'turned');
    near(Math.hypot(+g1(im, 11), +g1(im, 21)) * 800, 20, 1e-6, 'its picture 20 m wide'); near(Math.atan2(+g1(im, 21), +g1(im, 11)) * 180 / Math.PI, -10, 1e-6, 'turned'); assert.equal(+g1(fr, 70) & 1, 1, 'its frame');
    const n4 = by(M, 'note:n4'), ph = by(M, 'ph:s1'); near(Math.max(n4.box[2], n4.box[3]), Math.max(ph.box[2], ph.box[3]), 1e-6, 'no size: as large as the plan\'s photos');
    // drawn over the plan: its entities the last of the model space
    const all = [...E.values()].filter((e) => g1(e, 330) === g1(E.get(by(M, 'note:n1').handles[0]), 330) && !['ATTRIB', 'SEQEND'].includes(e.type)), mine = new Set(M.filter((m) => /^note:/.test(m.id)).flatMap((m) => m.handles));
    const lastPlan = all.map((e, i) => [e, i]).filter(([e]) => e.layer !== 'G-ESAA RTA LEGEND').pop()[1]; assert.ok([...mine].every((h) => all.findIndex((e) => e.h === h) > lastPlan - mine.size), 'drawn last');
    // the far one: its sheet added; the others' sheets as before
    const sh0 = r0.report.grid.sheets.map((s) => s.name), sh = r.report.grid.sheets.map((s) => s.name); assert.ok(sh.length > sh0.length, `a sheet for the far note: ${sh0} → ${sh}`);
    const inCell = (G, q) => G.report.grid.sheets.find((s) => s.box[0] <= q[0] && s.box[2] >= q[0] && s.box[1] <= q[1] && s.box[3] >= q[1]); assert.ok(!inCell(r0, [788500, 786100]) && inCell(r, [788500, 786100]), 'the far note\'s cell: a GEO sheet');
    // the PDF's display list: the notes' picture places and texts
    const pl = PDF.planList(r.text, r.report); assert.ok(pl.images.some((x) => x.name === 'NOTE_n2.jpg') && pl.images.some((x) => x.name === 'NOTE_n4.jpg'), 'its pictures on the Drawing');
    assert.ok(pl.texts.some((t) => t.s === 'FAR NOTE'), 'its text');
  }
  // styles and pins on a note; the note's own size and height; lead false
  const n5 = [{ id: 'n5', kind: 'text', at: [787340, 786140], lines: ['STYLED'], h: 2, lead: [787336, 786100] }, { id: 'n6', kind: 'photo', at: [787420, 786060], photo: { file: 'NOTE_n6.jpg', px: 800, py: 600 }, size: 10 }];
  const a = T.build(SEED_BL, richJob({ notes: n5 })), b = T.build(SEED_BL, richJob({ notes: n5, style: { 'note:n5': { h: 1.5, italic: true, lead: false }, 'note:n6': { scale: 2 } }, pins: { 'note:n5': { at: [5, -3], rot: 30 }, 'note:n6': { at: [0, 0], rot: 90 } } }));
  const Ea = entsOf(a.text), Eb = entsOf(b.text), ma = by(a.report.movable, 'note:n5'), mb = by(b.report.movable, 'note:n5'), mta = ma.handles.map((h) => Ea.get(h)).find((e) => e.type === 'MTEXT'), mtb = mb.handles.map((h) => Eb.get(h)).find((e) => e.type === 'MTEXT');
  near(+g1(mta, 40), 4.4, 1e-6, 'h 2: twice the details\' height'); near(+g1(mtb, 40), 6.6, 1e-6, 'style h 1.5 on top'); assert.match(mtOf(mtb), /\|i1/); near(mb.box[0], 787345, 1e-6, 'pinned'); near(mb.box[1], 786137, 1e-6, 'pinned'); near(mb.box[4], 30, 1e-6, 'turned');
  assert.ok(!mb.handles.some((h) => Eb.get(h).type === 'LWPOLYLINE'), 'lead false: no line'); assert.ok(ma.handles.some((h) => Ea.get(h).type === 'LWPOLYLINE'));
  const pa = by(a.report.movable, 'note:n6'), pb = by(b.report.movable, 'note:n6'); near(pb.box[2], 20, 1e-6, 'scale 2'); near(pb.box[4], 90, 1e-6, 'turned'); near(pa.box[2], 10, 1e-6, 'size 10 m');
});

test('draw order: front, back, forward, backward move an item\'s entities; z; the display list in that order', () => {
  const notes = [{ id: 'n1', kind: 'photo', at: [787336, 786100], photo: { file: 'NOTE_n1.jpg', px: 800, py: 600 }, size: 16 }];
  const posOf = (out) => { const E = [...entsOf(out.text).values()], ix = new Map(E.map((e, i) => [e.h, i])); return (id) => { const I = by(out.report.movable, id).handles.map((h) => ix.get(h)); return [Math.min(...I), Math.max(...I)]; }; };
  const hit = (A, B) => { const ax = (b) => { const a = b[4] * Math.PI / 180; return [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]]; }, ext = (b, u) => { const [e1, e2] = ax(b); return Math.abs(e1[0] * u[0] + e1[1] * u[1]) * b[2] / 2 + Math.abs(e2[0] * u[0] + e2[1] * u[1]) * b[3] / 2; }; return [...ax(A), ...ax(B)].every((u) => Math.abs((B[0] - A[0]) * u[0] + (B[1] - A[1]) * u[1]) <= ext(A, u) + ext(B, u) + 1e-9); };
  for (const v of [{}, { labels: 'tidy' }]) {
    const r0 = T.build(SEED_BL, richJob({ ...v, notes })), M0 = r0.report.movable, P0 = posOf(r0), n = M0.length;
    // z: each item's place in the draw order (0 first), the order of their first entities
    const zs = M0.filter((m) => m.z != null).map((m) => m.z).sort((a, b) => a - b); assert.deepEqual(zs, [...Array(zs.length).keys()], 'z: 0, 1, 2 …');
    const byZ = M0.filter((m) => m.z != null).sort((a, b) => a.z - b.z); for (let i = 1; i < byZ.length; i++) assert.ok(P0(byZ[i].id)[0] > P0(byZ[i - 1].id)[0], `z follows the entities' order: ${byZ[i - 1].id}, ${byZ[i].id}`);
    assert.equal(by(M0, 'note:n1').z, zs.length - 1, 'a note: drawn last');
    const run = (order) => { const r = T.build(SEED_BL, richJob({ ...v, notes, order })); const all = [...entsOf(r.text).values()]; all.forEach((e, i) => { if (e.type === 'ATTRIB' || e.type === 'SEQEND') assert.ok(['INSERT', 'ATTRIB'].includes(all[i - 1].type), `${JSON.stringify(order)}: ${e.type} after its INSERT`); }); return r; };
    // back: first (under everything), its z 0; front: last
    const rb = run([{ id: 'note:n1', op: 'back' }]); assert.equal(by(rb.report.movable, 'note:n1').z, 0); const first = [...entsOf(rb.text).values()].findIndex((e) => g1(e, 330) === g1(entsOf(rb.text).get(by(rb.report.movable, 'note:n1').handles[0]), 330));
    assert.equal(posOf(rb)('note:n1')[0], first, 'its entities the first of the model space');
    const rf = run([{ id: 'pole:s2', op: 'front' }]), Mf = rf.report.movable; assert.equal(by(Mf, 'pole:s2').z, Mf.filter((m) => m.z != null).length - 1, 'front: drawn last'); assert.ok(posOf(rf)('pole:s2')[0] > posOf(rf)('note:n1')[1], 'over the note');
    // backward: just under the previous item drawn before it whose box overlaps; forward: just over the next one
    const nb = by(M0, 'note:n1'), prev = M0.filter((m) => m !== nb && m.z != null && m.z < nb.z && hit(m.box, nb.box)).sort((a, b) => b.z - a.z)[0];
    const rw = run([{ id: 'note:n1', op: 'backward' }]), Pw = posOf(rw); assert.equal(Pw('note:n1')[1] + 1, Pw(prev.id)[0], `backward: just under ${prev.id}`); assert.equal(by(rw.report.movable, 'note:n1').z + 1, by(rw.report.movable, prev.id).z);
    const pole = by(M0, 'pole:s2'), next = M0.filter((m) => m !== pole && m.z != null && m.z > pole.z && hit(m.box, pole.box)).sort((a, b) => a.z - b.z)[0];
    const rx = run([{ id: 'pole:s2', op: 'forward' }]), Px = posOf(rx); assert.equal(Px('pole:s2')[0], Px(next.id)[1] + 1, `forward: just over ${next.id}`); assert.equal(by(rx.report.movable, 'pole:s2').z, by(rx.report.movable, next.id).z + 1);
    // ops in their order; none for an item that is not there or a forward with nothing over it
    const rs = run([{ id: 'note:n1', op: 'back' }, { id: 'note:n1', op: 'front' }, { id: 'nothing:x', op: 'front' }, { id: 'note:n1', op: 'forward' }, { id: 'pole:s2', op: 'sideways' }]); assert.ok(rs.text === r0.text, 'back then front, the rest nothing: as before');
    // the Drawing's display list (dxfpdf.js planList) and the PDF draw in that order
    for (const r of [r0, rb, rf, rw, rx]) {
      const pl = PDF.planList(r.text, r.report), M = r.report.movable, firstK = new Map(); for (let k = 0; k < pl.own.length; k++) if (pl.own[k] >= 0 && !firstK.has(pl.own[k])) firstK.set(pl.own[k], k);
      const dl = [...firstK.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => M[i].id), zo = M.filter((m, i) => m.z != null && firstK.has(i)).sort((a, b) => a.z - b.z).map((m) => m.id);
      assert.deepEqual(dl, zo, 'the display list in the draw order');
    }
  }
  // a template with a SORTENTSTABLE for its model space (AutoCAD draws by its sort handles): the plan's entities given sort handles in the new order
  { const R = SEED_BL.split(/\r?\n/), nl = SEED_BL.includes('\r\n') ? '\r\n' : '\n'; let i = 0;
    for (; i < R.length - 1; i += 2) if (R[i].trim() === '0' && R[i + 1].trim() === 'BLOCK_RECORD') { let j = i + 2, isM = false; for (; R[j].trim() !== '0'; j += 2) if (R[j].trim() === '2' && R[j + 1].trim() === '*Model_Space') isM = true; if (isM) break; }
    const h = R.findIndex((x, k) => k > i && x.trim() === '5'), br = R[h + 1].trim(); R.splice(h + 2, 0, '102', '{ACAD_XDICTIONARY', '360', '9F1', '102', '}');
    const o0 = R.findIndex((x, k) => x.trim() === 'OBJECTS' && R[k - 1].trim() === '2'); let e = o0; while (!(R[e].trim() === 'ENDSEC' && R[e - 1].trim() === '0')) e++;
    R.splice(e - 1, 0, '0', 'DICTIONARY', '5', '9F1', '330', br, '100', 'AcDbDictionary', '280', '0', '281', '1', '3', 'ACAD_SORTENTS', '360', '9F2', '0', 'SORTENTSTABLE', '5', '9F2', '102', '{ACAD_REACTORS', '330', '9F1', '102', '}', '330', '9F1', '100', 'AcDbSortentsTable', '330', br);
    const hs = R.findIndex((x) => x.trim() === '$HANDSEED'); R[hs + 2] = '9F3'; const seedS = R.join(nl);
    const r = T.build(seedS, richJob({ notes, order: [{ id: 'note:n1', op: 'back' }, { id: 'pole:s2', op: 'front' }] })), X = r.text.split(/\r?\n/), k = X.findIndex((x, j) => x.trim() === 'SORTENTSTABLE' && X[j - 1].trim() === '0'), sh = new Map();
    for (let j = k + 1; j < X.length - 3 && X[j].trim() !== '0'; j += 2) if (X[j].trim() === '331' && X[j + 2].trim() === '5') sh.set(X[j + 1].trim(), X[j + 3].trim());
    assert.ok(r.report.sortents && sh.size > 0, 'sort handles written');
    const model = [...entsOf(r.text).values()].filter((x) => !['ATTRIB', 'SEQEND'].includes(x.type) && (g1(x, 330) || '').trim() === br && (g1(x, 67) || '0').trim() !== '1');
    assert.deepEqual(model.slice().sort((a, b) => parseInt(sh.get(a.h) || a.h, 16) - parseInt(sh.get(b.h) || b.h, 16)).map((x) => x.h), model.map((x) => x.h), 'AutoCAD\'s order (by sort handle) the entities\' order');
    assert.ok(T.build(seedS, richJob({ notes })).report.sortents == null, 'no order: the table as it was'); }
});

test('byte for byte: without job.text, job.notes and job.order (or them empty), the DXF as beta 7.11 made it (with 7.11\'s own fields too)', () => {
  // [template, labels, beta 7.11's fields, SHA-256 (first 16) of beta 7.11's DXF (dxftpl.js of 72bd50f)] ((beta 7.13, Drawing fixes) Tidy with 'tools': its number placed by
  // hand (num:s3) now keeps its block's size and its shadow under it (the owner: "Pole Numbering when moved generates a shadow and sometimes automaticall reduce"): only that
  // number's own entities differ from 7.11's (and 7.12's: e16a139826e3e705, 906e8693334ff396), so these two are as 7.13 makes them)
  // ((beta 7.15, Fixes) the made-up route has an ODC and an OLT site: their lat / long now right under their ID (plan-fixes.test.cjs), so every one is as 7.15
  // makes it; with that left out, each is 7.11's (7.14's, in this order: 6fb978e0b69800ce, 72d7af12b1eff23f, c6233c476caf5915, fc5729e8d29e8a2d, 028e88fc640c1438,
  // 4193fe5e5825a3c9, a99c1ee1162c0618, bbb3f85dbe141f35, c6690bb804ba961a, 892b706506278590, 231a48cd949a26f6, 4ac241e93d6272ef))
  const WANT = [['blocks', 'std', 'tools', 'e29ee12a0a60d295'], ['blocks', 'std', 'lines', '6ba130f837f4d87a'], ['blocks', 'std', 'bubble', '266baf68df817eee'], ['blocks', 'tidy', 'tools', 'a445c4f1d5bc552d'],
    ['blocks', 'tidy', 'lines', '5a0964d8a9148ed4'], ['blocks', 'tidy', 'bubble', '8212f238d4aeba30'], ['square', 'std', 'tools', '1339b3c9d9d62a81'], ['square', 'std', 'lines', 'b5846ea035ea5f7a'],
    ['square', 'std', 'bubble', 'b4fa0228fb7291bf'], ['square', 'tidy', 'tools', 'f88093d37d64c85d'], ['square', 'tidy', 'lines', '74f4e8134448d065'], ['square', 'tidy', 'bubble', '947607d8db2db233']];
  const X = { tools: { pins: { 'span:s1|s2': { at: [0, -14] }, 'clolbl:s2': { at: [-10, -22] }, 'nap:s4': { rot: 30 }, 'num:s3': { at: [12, 14] }, 'ph:s7': { at: [-40, 15] } }, style: { 'lbl:s3': { h: 1.5, bold: true, color: 3 }, 'span:s3|s4': { italic: true } }, styleKind: { loop: { color: 4 } }, poleAt: { s5: [787446, 786113] } },
    lines: { leaders: { photo: false, details: false, number: false }, lblPin: { s5: [12, -22, 0] }, phPin: { s9: [-30, 20] } }, bubble: { cloStyle: 'bubble', pins: { 'clolbl:s8': { at: [-52, -14] } }, style: { 'clolbl:s2': { scale: 0.7 } } } };
  const S = { blocks: SEED_BL, square: SEED_SQ }, got = [];
  for (const [sn, lab, xn] of WANT) {
    const mk = (o) => richJob({ ...(lab === 'tidy' ? { labels: 'tidy' } : {}), ...JSON.parse(JSON.stringify(X[xn])), ...o }), out = T.build(S[sn], mk({}));
    const x = got.length % 2 ? { text: {}, notes: [], order: [] } : { text: { 'nothing:x': ['A'] }, notes: [{ id: 'x', kind: 'photo', at: [1, 2] }, null, { at: [3, 4] }], order: [{ id: 'nothing:x', op: 'front' }, { op: 'back' }] }; // (empty, or naming nothing: in turn)
    assert.ok(T.build(S[sn], mk(x)).text === out.text, `${sn} ${lab} ${xn}: the same with ${JSON.stringify(x)}`);
    got.push([sn, lab, xn, sha(out.text)]);
  }
  assert.deepEqual(got, WANT, 'as beta 7.11 made them');
  // an item's text as it is (the same words): the same DXF
  const r0 = T.build(SEED_BL, richJob({ cloStyle: 'bubble' })), same = Object.fromEntries(r0.report.movable.filter((m) => m.text).map((m) => [m.id, m.text]));
  assert.ok(T.build(SEED_BL, richJob({ cloStyle: 'bubble', text: same })).text === r0.text, 'every item\'s own lines: nothing changes');
});
