/* (stage 11, riser detail) the owner (27 Nov): "a detailed drawing of Riser pole (not CEF) using an existing pole but the Uguard, concrete encase+conduit are
   all proposed(Red). this is usually going to site, HH/MH/SB. this may be a detailed isometric view being added on the plan as attachent (more like photo that
   is to be put to the plan or another page specific to this one as part of asplan if drawn in asplan." Decided: the user chooses per riser.
   Run: node --test tests/riser-detail.test.cjs (or python3 tests/run_all.py --only riser-detail).
   - The sizes are the CEF editor's own for a riser on an existing pole (vendor/cef 30_core.js riserParts, STD, PVC_MM, run as the editor's page runs it):
     the G.I. riser pipe 114.3 mm, 2.7 m; the U-guard 1.9 m; the encasement 0.47 x 0.47 x 1.73 m; the conduit 2 x 114.3 mm (GeDxfTpl.riserStd, and the
     app's form shows the same).
   - Byte for byte: a plan with no riser pole, with a proposed riser pole (its default: none), or with every detail set to none is what beta 7.17 made
     (SHA-256 of beta 7.17's builder on the same made-up plans and templates).
   - Its own sheet (the default for an existing riser pole): RISER DETAIL sheets made from the GEO sheet's frame and title block (its map taken off), after
     the GEO sheets, numbered within their kind (1 OF 2), NOT TO SCALE in the scale field, several details to a sheet in route order; the detail: the pole
     existing, the riser pipe, U-guard, encasement and conduit proposed, the end point with its own symbol, every part named with a leader, the title and
     NOT TO SCALE; nothing else of the plan changes (each sheet's entities, handles left out; the PDF's other pages the same).
   - On the plan ('plan'): in a frame near its pole like a photo, inside its GEO sheet, covering no label, symbol or photo, its thin line to the pole; the
     plan's other sheets the same, its model space the same but for the detail (and a text placed after it kept clear of it); not on the key map.
   - The sizes typed for a riser (each one), the conduit's from its span (size, runs, the plan's length) unless typed; the ends: handhole, manhole, service
     box, site, pole, none.
   - The kit: PLAN DETAIL (text style), PLAN DETAIL / PLAN DETAIL PROPOSED / PLAN DETAIL EXISTING (layers): withKit adds them (the STYLE KEY lists them); the
     detail's lines BYLAYER on them and its texts in the style; a drafter's change restyles it (a layer's colour, the style's height in printed mm); a
     template without them: the layers added with the kit's look, only when a detail is drawn.
   Every name, number and place is made up (the made-up templates of tests/fixtures; the synthesizer's made-up plan). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..'), FX = path.join(__dirname, 'fixtures');
const T = require(path.join(root, 'dxftpl.js')), P = require(path.join(root, 'dxfpdf.js')), G = require(path.join(root, 'vendor', 'synth', 'dxfsynth.js'));
const SEED = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8'), KS = fs.readFileSync(path.join(FX, 'plan-seed-made-up-kit.dxf'), 'utf8');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const g = (r, c, d) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : d; };
const typ = (r) => r[0][1];
const E0 = 787300, N0 = 786100, ll = (E, N) => ({ lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 });

/** the synthesizer's made-up plan with two existing riser poles: CC-9012 (to the handhole HH-01, 2 runs of 114.3 mm, 21 m as the plan writes it) and
    CC-9009 (to an existing manhole MH-0003, 1 run, 31 m); o.det { pointId: riserDet }, o.job: more of the job */
function riserJob(o) {
  o = o || {}; const j = G.madeUpJob();
  const s12 = j.pts.find((p) => p.id === 's12'), s9 = j.pts.find((p) => p.id === 's9'), h1 = j.pts.find((p) => p.id === 'h1');
  Object.assign(s12, { status: 'Existing', label1: '', telco: false });
  j.spans.push({ ia: 's12', ib: 'h1', a: [s12.E, s12.N], b: [h1.E, h1.N], len: 20.1, lenW: 21, lenC: 21, cable: 'U144', ug: { m: 'hdd', cd: '114.3', cr: 2 } });
  const m1 = { id: 'm1', poleId: 'MH-0003', el: 'Manhole', status: 'Existing', E: s9.E + 30, N: s9.N - 4, ...ll(s9.E + 30, s9.N - 4) }; j.pts.push(m1);
  j.spans.push({ ia: 's9', ib: 'm1', a: [s9.E, s9.N], b: [m1.E, m1.N], len: 30.3, lenW: 31, lenC: 31, cable: 'U144', ug: { m: 'open', cd: '114.3', cr: 1 } });
  j.runs.push({ cable: 'U144', label: 'PROPOSED 144C UG FOC', pts: [[s12.E, s12.N], [h1.E, h1.N]] }, { cable: 'U144', label: 'PROPOSED 144C UG FOC', pts: [[s9.E, s9.N], [m1.E, m1.N]] });
  for (const [id, v] of Object.entries(o.det || {})) j.pts.find((p) => p.id === id).riserDet = v;
  return { ...j, pmiItems: { spans: [], points: [] }, ...(o.job || {}) };
}
/** more risers: CC-9002 to a proposed service box, CC-9004 to an existing pole CC-9099, CC-9006 to the site, CC-9010 a riser by hand with no
    underground span (each existing), with CC-9009 and CC-9012: six details */
function sixJob(o) {
  const j = riserJob(o), add = (id, el, st, E, N, x) => { const q = { id, el, status: st, E, N, ...ll(E, N), ...x }; j.pts.push(q); return q; }, at = (id) => j.pts.find((p) => p.id === id);
  const ug = (a, b) => { const A = at(a), B = at(b), L = Math.hypot(A.E - B.E, A.N - B.N); j.spans.push({ ia: a, ib: b, a: [A.E, A.N], b: [B.E, B.N], len: L, lenW: Math.round(L) + 1, lenC: Math.round(L) + 1, cable: 'U144', ug: { m: 'hdd', cd: '50', cr: 1 } }); };
  for (const id of ['s2', 's4', 's6', 's10']) Object.assign(at(id), { status: 'Existing', label1: '' });
  add('sb1', 'Service box', 'Proposed', at('s2').E, at('s2').N - 25, { poleId: 'SB-0007' }); ug('s2', 'sb1');
  add('p99', 'Pole', 'Existing', at('s4').E + 3, at('s4').N - 40, { poleId: 'CC-9099', mat: 'CC' }); ug('s4', 'p99');
  ug('s6', 't1'); at('s10').riser = true;
  return j;
}
/** the made-up template with its fields as the company's seed names them: the sheet's number (SHEET_NO) and scale (SCALE) */
const SEED_F = SEED.replace(/@@SHEET@@/g, '@@SHEET_NO@@').replace(/@@DRAWN@@/g, '@@SCALE@@');
/** a built plan read: its sheets in tab order, each sheet's entities (its block's, or the active sheet's in ENTITIES), the model space, the tables */
function read(text) {
  const d = new T.Doc(text), S = T.structure(d), TB = d.sec('TABLES').recs;
  const entsOf = (L) => { const bn = g(S.br.get(L.brh), 2); return L.name === 'Model' ? d.sec('ENTITIES').recs.filter((r) => g(r, 330) === S.modelH && String(g(r, 67, '0')).trim() !== '1') : bn === '*Paper_Space' ? d.sec('ENTITIES').recs.filter((r) => String(g(r, 67, '0')).trim() === '1') : ((S.blocks.get(bn) || {}).ents || []); };
  const sheets = S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => +g(a.rec, 71, 0) - +g(b.rec, 71, 0)).map((L) => L.name);
  return { d, S, sheets, ents: (nm) => entsOf(S.layouts.find((L) => L.name === nm)), layer: (nm) => TB.find((r) => typ(r) === 'LAYER' && g(r, 2) === nm), style: (nm) => TB.find((r) => typ(r) === 'STYLE' && String(g(r, 2)).toUpperCase() === nm.toUpperCase()) };
}
const HC = (c) => c === 5 || c === 105 || (c >= 320 && c <= 369) || c === 390 || c === 102;
const key = (r) => r.filter((p) => !HC(p[0])).map((p) => `${p[0]}=${p[1]}`).join('|');
/** what is in b and not in a, sheet by sheet (each entity as written, handles and owners left out): { sheet: { a, b, gone, added: [keys] } } */
function diff(a, b) {
  const A = read(a), B = read(b), out = {};
  for (const nm of new Set(['Model', ...A.sheets, ...B.sheets])) {
    const x = A.sheets.includes(nm) || nm === 'Model' ? A.ents(nm).map(key) : [], y = B.sheets.includes(nm) || nm === 'Model' ? B.ents(nm).map(key) : [], n = new Map();
    x.forEach((k) => n.set(k, (n.get(k) || 0) + 1)); const added = []; for (const k of y) { if (n.get(k) > 0) n.set(k, n.get(k) - 1); else added.push(k); }
    out[nm] = { a: x.length, b: y.length, gone: [...n.values()].reduce((t, v) => t + v, 0), added };
  }
  return out;
}
const texts = (ents) => ents.filter((r) => typ(r) === 'TEXT').map((r) => String(g(r, 1, '')));

test('the sizes are the CEF editor\'s own for a riser on an existing pole (its engine, as its page runs it), and the app\'s form shows the same', () => {
  const ctx = vm.createContext({ console, Math, Date }); ctx.self = ctx; ctx.window = ctx;
  vm.runInContext(`${fs.readFileSync(path.join(root, 'vendor', 'cef', '30_core.js'), 'utf8')};this.__R = { riserParts, STD, CLOZ, PVC_MM, encName };`, ctx, { filename: '30_core.js' });
  const R = ctx.__R, K = R.riserParts(0, R.STD.msg - R.CLOZ), s = T.riserStd(), f1 = (v) => +(+v).toFixed(1);
  assert.equal(s.pipeL, f1(K.giTop), 'the G.I. riser pipe: from the ground to its top'); assert.equal(s.guardL, f1(K.ugTop - K.giTop), 'the U-guard: from there to its top');
  assert.deepEqual([s.pipeL, s.guardL, s.encW, s.encH, s.pipeD, s.cdD, s.cdR], [2.7, 1.9, 0.47, 1.73, '114.3', '114.3', 2]);
  assert.equal(s.encW, R.STD.encW); assert.equal(s.encH, +(R.STD.encUp + R.STD.encDn).toFixed(2)); assert.equal(s.pipeD, R.PVC_MM); assert.equal(s.cdD, R.PVC_MM); assert.equal(R.encName, 'PROPOSED CONCRETE ENCASEMENT');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8'), line = /const RISER_SZ = (\[[^\n]*?\]\]);/.exec(app); assert.ok(line, 'the form\'s sizes');
  const SZ = Object.fromEntries(JSON.parse(line[1].replace(/'/g, '"').replace(/\\u00d8/g, 'Ø')).map(([k, , v]) => [k, v]));
  for (const k of ['pipeD', 'pipeL', 'guardL', 'encW', 'encH']) assert.equal(String(SZ[k]), String(s[k]), `the form's ${k}`);
});

test('byte for byte: no riser pole, a proposed riser pole (none by default), every detail set to none: the plan as beta 7.17 made it', () => {
  const W = { // (SHA-256 of beta 7.17's builder (d801b5f) on the same made-up plans and templates)
    'blocks.none': '5fc69b531332b0e06ec4f77c0b4f52141a3cab1344c94686d259510dd3096ffe', 'blocks.none.tidy': 'd045285bf63ee2cdd0cffe17bcf50b4e3e374736ca8d9a784fd6abc77ac6c41d',
    'blocks.proposed': 'cc7e5be6acd8488c4eb50229a35b70d46bb7c1a8496d469ad19881d46c756751', 'blocks.proposed.tidy': 'a54bab2fd80549e6503b406c43c1952d7668ec6e94153353620ef42879dad16a',
    'blocks.noRiser': '16b8f55baeee004fc2eea61b6820d25b0ca2c72ec55405657223fa7c07ee7df7', 'kit.none': 'aa05906377e13d7b0410cc316182990ecfce77646ff74dbba8a4946887fdc921',
    'kit.proposed': '6f0f752db9acc76083cb3f6c2fe186a3962476e49fa1d9c45a34f2420587c811', 'kit.noRiser': '5b069c0c4df9a4c84922da99739ab1f620e06723a783c9c84ebbf1357269e087',
  };
  const jobs = { none: () => riserJob({ det: { s9: { show: 'none' }, s12: { show: 'none', pipeL: 3 } } }), proposed: () => { const j = riserJob({ det: { s9: { show: 'none' } } }); Object.assign(j.pts.find((q) => q.id === 's12'), { status: 'Proposed', label1: 'PROP.POLE CC-9012' }); return j; }, noRiser: () => G.madeUpJob() };
  for (const [k, want] of Object.entries(W)) {
    const [sn, jn, tidy] = k.split('.'), j = jobs[jn](); if (tidy) j.labels = 'tidy';
    const r = T.build(sn === 'kit' ? KS : SEED, j); assert.equal(sha(r.text), want, k);
    if (jn !== 'noRiser') assert.ok(r.report.riserDetails.every((x) => x.show === 'none'), `${k}: listed, none drawn`); else assert.equal(r.report.riserDetails, undefined, `${k}: no riser, nothing in the report`);
  }
});

test('its own sheet: RISER DETAIL from the GEO sheet\'s frame and title block, after the GEO sheets, numbered within its kind, NOT TO SCALE; the detail drawn and named; nothing else changes', async () => {
  const none = T.build(SEED_F, riserJob({ det: { s9: { show: 'none' }, s12: { show: 'none' } } })), one = T.build(SEED_F, riserJob());
  const A = read(none.text), B = read(one.text);
  assert.deepEqual(B.sheets, [...A.sheets.filter((n) => n !== 'KEYMAP'), 'RISER DETAIL', 'KEYMAP'].filter((n, i, L) => L.indexOf(n) === i).sort((x, y) => B.sheets.indexOf(x) - B.sheets.indexOf(y)));
  assert.ok(B.sheets.indexOf('RISER DETAIL') === B.sheets.indexOf('GEO') + 1, `after the GEO sheet: ${B.sheets}`);
  const pg = B.ents('RISER DETAIL'), T1 = texts(pg), geo = B.ents('GEO');
  assert.equal(pg.filter((r) => typ(r) === 'VIEWPORT').length, 1, 'the map\'s viewport taken off (the sheet\'s own kept)');
  assert.equal(geo.filter((r) => typ(r) === 'LWPOLYLINE' && g(r, 8) === '0').length, pg.filter((r) => typ(r) === 'LWPOLYLINE' && g(r, 8) === '0').length, 'the GEO sheet\'s frame');
  assert.ok(T1.includes('1 OF 1') && T1.includes('NOT TO SCALE') && T1.includes('NOVEMBER 20, 2026'), `its number within its kind, NOT TO SCALE, the date: ${T1.filter((t) => /OF|SCALE|2026/.test(t))}`);
  assert.ok(texts(geo).includes('1 OF 1') && !texts(geo).includes('NOT TO SCALE'), 'the GEO sheet as before');
  for (const want of ['%%uRISER DETAIL – POLE CC-9009', '%%uRISER DETAIL – POLE CC-9012', 'EXISTING POLE CC-9012', 'PROPOSED U-GUARD, 1.9m', 'PROPOSED CONCRETE', 'EXISTING MANHOLE', 'PROPOSED HANDHOLE', 'GROUND LINE'])
    assert.ok(T1.includes(want), `${want}: ${T1.join(' / ')}`);
  const all = T1.join(' ');
  for (const want of ['PROPOSED %%c114.3mm G.I. RISER PIPE, 2.7m', 'ENCASEMENT, 0.47 x 0.47 x 1.73m', 'PROPOSED 2 x %%c114.3mm PVC CONDUIT, 21m TO HH-01', 'PROPOSED %%c114.3mm PVC CONDUIT, 31m TO MH-0003']) assert.ok(all.includes(want.split(' ').slice(0, 3).join(' ')) && all.replace(/\s+/g, ' ').includes(want.replace(/\s+/g, ' ').slice(-12)), `${want}: ${all}`);
  assert.equal(T1.filter((t) => t === 'NOT TO SCALE').length, 3, 'under each title, and in the scale field');
  // the parts: the pole existing (its layer), the riser's parts proposed (red), the end point its own symbol, the leaders' arrows
  const lay = (k) => pg.filter((r) => g(r, 8) === k), L = B.layer('PLAN DETAIL PROPOSED'), LE = B.layer('PLAN DETAIL EXISTING'), LD = B.layer('PLAN DETAIL');
  assert.deepEqual([g(L, 62), g(L, 370), g(LE, 62), g(LD, 62)].map((v) => +v), [1, 35, 5, 7], 'the kit\'s look: proposed red, existing blue');
  assert.ok(lay('PLAN DETAIL PROPOSED').length > 30 && lay('PLAN DETAIL EXISTING').length >= 8 && lay('PLAN DETAIL').filter((r) => typ(r) === 'SOLID').length >= 12, 'drawn on its layers, its leaders with arrows');
  assert.ok(pg.filter((r) => [...['PLAN DETAIL', 'PLAN DETAIL PROPOSED', 'PLAN DETAIL EXISTING']].includes(g(r, 8))).every((r) => g(r, 62) == null), 'BYLAYER');
  assert.ok(pg.some((r) => typ(r) === 'INSERT' && g(r, 2) === 'proposed Handhole'), 'the handhole\'s own symbol beside its name');
  // nothing else changes: each sheet and the model space entity by entity; the tables but for the three layers
  const D = diff(none.text, one.text);
  for (const [nm, x] of Object.entries(D)) if (nm !== 'RISER DETAIL') assert.deepEqual([x.gone, x.added.length, x.a], [0, 0, x.b], `${nm}: the same`);
  assert.equal(D['RISER DETAIL'].a, 0); assert.ok(D['RISER DETAIL'].b > 150);
  const lays = (t) => read(t).d.sec('TABLES').recs.filter((r) => typ(r) === 'LAYER').map((r) => g(r, 2));
  assert.deepEqual(lays(one.text).filter((n) => !lays(none.text).includes(n)), ['PLAN DETAIL', 'PLAN DETAIL PROPOSED', 'PLAN DETAIL EXISTING']);
  // the PDF: the detail's page after the GEO sheet's, the others as before
  const pa = P.layoutPages(none.text).pages, pb = P.layoutPages(one.text).pages, ops = (p) => p.ops.join('\n');
  assert.deepEqual(pb.map((p) => p.name), ['KEYMAP', 'GEO', 'RISER DETAIL']); for (const p of pa) assert.equal(ops(pb.find((q) => q.name === p.name)), ops(p), `${p.name}: the same page`);
  const pd = ops(pb[2]); assert.ok(pd.includes('RISER DETAIL') && pd.includes('NOT TO SCALE') && /1 0 0 RG/.test(pd), 'printed: its texts, its red lines');
  assert.match(one.report.notes.join(' / '), /Riser details: 2 on a sheet of their own \(RISER DETAIL\)/);
  assert.deepEqual(one.report.riserDetails.map((x) => [x.pole, x.show, x.sheet, x.to.id, x.sizes.cdL, x.sizes.cdFrom]), [['CC-9009', 'page', 'RISER DETAIL', 'MH-0003', 31, 'plan'], ['CC-9012', 'page', 'RISER DETAIL', 'HH-01', 21, 'plan']]);
  // six of them: two sheets (four to a sheet, in route order), each numbered in its kind
  const six = T.build(SEED_F, sixJob()), C = read(six.text);
  assert.deepEqual(C.sheets.filter((n) => /RISER/.test(n)), ['RISER DETAIL', 'RISER DETAIL (2)']);
  assert.deepEqual(six.report.riserDetails.map((x) => `${x.pole} ${x.sheet}`), ['CC-9002 RISER DETAIL', 'CC-9004 RISER DETAIL', 'CC-9006 RISER DETAIL', 'CC-9009 RISER DETAIL', 'CC-9010 RISER DETAIL (2)', 'CC-9012 RISER DETAIL (2)']);
  assert.ok(texts(C.ents('RISER DETAIL')).includes('1 OF 2') && texts(C.ents('RISER DETAIL (2)')).includes('2 OF 2'), 'numbered within their kind');
  assert.equal(texts(C.ents('RISER DETAIL')).filter((t) => /^%%uRISER DETAIL/.test(t)).length, 4);
});

test('on the plan: in a frame near its pole like a photo, inside its GEO sheet, covering nothing, with its line; the other sheets as before; not on the key map', () => {
  const none = T.build(SEED, riserJob({ det: { s9: { show: 'none' }, s12: { show: 'none' } } })), on = T.build(SEED, riserJob({ det: { s9: { show: 'plan' }, s12: { show: 'none' } } }));
  const x = on.report.riserDetails.find((q) => q.id === 's9'); assert.equal(x.show, 'plan'); assert.ok(x.plan && x.plan.free && x.plan.line, JSON.stringify(x.plan));
  const s9 = riserJob().pts.find((p) => p.id === 's9'), cell = on.report.grid.cell, gx = on.report.grid.geo;
  const ci = (E) => Math.floor((E - gx[0]) / cell), cj = (N) => Math.floor((N - gx[1]) / cell);
  assert.ok(Math.hypot(x.plan.at[0] - s9.E, x.plan.at[1] - s9.N) < x.plan.w + 40, 'near its pole');
  for (const [sx, sy] of [[-1, -1], [1, 1]]) assert.deepEqual([ci(x.plan.at[0] + sx * x.plan.w / 2), cj(x.plan.at[1] + sy * x.plan.h / 2)], [ci(s9.E), cj(s9.N)], 'inside its pole\'s GEO sheet');
  assert.ok(x.plan.w > 90 && x.plan.w < 130, `printed at 0.65 of its page size (65 mm): ${x.plan.w} m`);
  const D = diff(none.text, on.text);
  for (const nm of ['GEO', 'KEYMAP']) assert.deepEqual([D[nm].gone, D[nm].added.length], [0, 0], `${nm}: its paper the same`);
  const mine = D.Model.added.filter((k) => /\|8=PLAN DETAIL/.test(k));
  assert.ok(mine.length > 90, `the detail in the model space: ${mine.length}`); assert.ok(D.Model.gone <= 2 && D.Model.added.length - mine.length <= D.Model.gone + 1, `the plan's own as before, a text placed after it kept clear of it: ${D.Model.gone}`);
  assert.ok(D.Model.added.some((k) => /^0=TEXT\|.*\|1=%%uRISER DETAIL – POLE CC-9009\|/.test(k)), 'its title');
  // the PDF: printed on the GEO sheet, not on the key map
  const pg = P.layoutPages(on.text).pages, ops = (n) => pg.find((p) => p.name === n).ops.join('\n');
  assert.ok(ops('GEO').includes('RISER DETAIL') && !ops('KEYMAP').includes('RISER DETAIL'), 'on the GEO sheet only');
  assert.equal(read(on.text).sheets.includes('RISER DETAIL'), false, 'no sheet of its own');
  // Tidy (a finer grid): the same printed size, so fewer metres
  const tj = riserJob({ det: { s9: { show: 'plan' }, s12: { show: 'none' } }, job: { labels: 'tidy', _grid: 2 } }), td = T.build(SEED, tj).report.riserDetails.find((q) => q.id === 's9');
  assert.ok(Math.abs(td.plan.w * 2 - x.plan.w) < 0.5, `Tidy 1/2: half the metres (${td.plan.w} m)`);
});

test('the sizes typed for a riser, the conduit\'s from its span unless typed; the ends: a service box, a pole, the site, none', () => {
  const t = T.build(SEED, riserJob({ det: { s12: { show: 'page', pipeD: 100, pipeL: 3, guardL: 2.4, encW: 0.5, encH: 1.8, cdD: 50, cdR: 1, cdL: 18.5 } } })), x = t.report.riserDetails.find((q) => q.id === 's12');
  assert.deepEqual(x.sizes, { pipeD: '100', pipeL: 3, guardL: 2.4, encW: 0.5, encH: 1.8, cdD: '50', cdR: 1, cdL: 18.5, cdFrom: 'typed' });
  assert.deepEqual([x.texts.pipe, x.texts.guard, x.texts.enc, x.texts.cd], ['PROPOSED %%c100mm G.I. RISER PIPE, 3m', 'PROPOSED U-GUARD, 2.4m', 'PROPOSED CONCRETE ENCASEMENT, 0.5 x 0.5 x 1.8m', 'PROPOSED %%c50mm PVC CONDUIT, 18.5m TO HH-01']);
  const bad = T.build(SEED, riserJob({ det: { s12: { pipeL: -1, guardL: 'x', cdR: 9 } } })).report.riserDetails.find((q) => q.id === 's12');
  assert.deepEqual([bad.show, bad.sizes.pipeL, bad.sizes.guardL, bad.sizes.cdR], ['page', 2.7, 1.9, 2], 'not a size: the standard\'s (the span\'s runs)');
  const six = T.build(SEED, sixJob()).report.riserDetails, by = Object.fromEntries(six.map((q) => [q.pole, q]));
  assert.deepEqual([by['CC-9002'].to.kind, by['CC-9002'].texts.to, by['CC-9002'].texts.cd], ['sb', 'PROPOSED SERVICE BOX SB-0007', 'PROPOSED %%c50mm PVC CONDUIT, 26m TO SB-0007']);
  assert.deepEqual([by['CC-9004'].to.kind, by['CC-9004'].texts.to], ['pole', 'EXISTING POLE CC-9099']);
  assert.deepEqual([by['CC-9006'].to.kind, by['CC-9006'].texts.to], ['site', 'EXISTING SITE DEMOSITE MIN9001']);
  assert.deepEqual([by['CC-9010'].to, by['CC-9010'].texts.cd, by['CC-9010'].sizes.cdL], [null, 'PROPOSED 2 x %%c114.3mm PVC CONDUIT', null], 'a riser by hand with no underground span: its conduit with no end');
  assert.equal(by['CC-9012'].texts.title, 'RISER DETAIL – POLE CC-9012');
});

test('the kit: PLAN DETAIL and its layers in the starting kit and the STYLE KEY; the detail drawn in them; a drafter\'s change restyles it', () => {
  const KIT = T.withKit(KS), k = T.kitOf(KIT), kt = k.text.find((x) => x.name === 'PLAN DETAIL');
  assert.ok(kt && kt.has && kt.font === 'arial.ttf' && kt.annotative, JSON.stringify(kt));
  assert.deepEqual(k.layers.filter((x) => /^PLAN DETAIL/.test(x.name)).map((x) => [x.name, x.has, x.color, x.lw]), [['PLAN DETAIL', true, 7, 18], ['PLAN DETAIL PROPOSED', true, 1, 35], ['PLAN DETAIL EXISTING', true, 5, 25]]);
  const KEY = read(KIT).ents('STYLE KEY'); for (const n of ['PLAN DETAIL', 'PLAN DETAIL PROPOSED', 'PLAN DETAIL EXISTING', 'RISER DETAIL']) assert.ok(texts(KEY).includes(n), `the STYLE KEY: ${n}`);
  const pl = read(T.build(KIT, riserJob()).text), pg = pl.ents('RISER DETAIL');
  assert.ok(pg.filter((r) => typ(r) === 'TEXT' && /RISER DETAIL|PROPOSED|EXISTING|GROUND/.test(g(r, 1, ''))).every((r) => g(r, 7) === 'PLAN DETAIL'), 'its texts in PLAN DETAIL');
  // a drafter's kit: the proposed parts magenta, the texts 4 mm printed (annotative: the title that high, the labels in proportion)
  const d = new T.Doc(KIT), TB = d.sec('TABLES').recs, set = (r, c, v) => { const i = r.findIndex((q, j) => j > 0 && q[0] === c); if (i > 0) r[i][1] = String(v); };
  set(TB.find((r) => typ(r) === 'LAYER' && g(r, 2) === 'PLAN DETAIL PROPOSED'), 62, '     6'); set(TB.find((r) => typ(r) === 'STYLE' && g(r, 2) === 'PLAN DETAIL'), 40, '4.0');
  const B2 = T.build(d.text(), riserJob()), p2 = read(B2.text), pg2 = p2.ents('RISER DETAIL'), title = (E) => E.find((r) => typ(r) === 'TEXT' && /^%%uRISER DETAIL/.test(g(r, 1, ''))), lbl = (E) => E.find((r) => typ(r) === 'TEXT' && g(r, 1) === 'GROUND LINE');
  assert.equal(+g(p2.layer('PLAN DETAIL PROPOSED'), 62), 6); assert.ok(pg2.filter((r) => g(r, 8) === 'PLAN DETAIL PROPOSED').every((r) => g(r, 62) == null), 'BYLAYER: magenta');
  const r0 = +g(title(pg), 40) / +g(lbl(pg), 40), r1 = +g(title(pg2), 40) / +g(lbl(pg2), 40);
  assert.ok(Math.abs(r0 - r1) < 1e-5, 'the other texts in proportion'); assert.ok(+g(title(pg2), 40) > +g(title(pg), 40) * 1.12, `the title larger: ${g(title(pg), 40)} → ${g(title(pg2), 40)}`);
  assert.ok(texts(pg2).includes('PROPOSED U-GUARD,') && texts(pg2).includes('1.9m'), 'a label wider than its room: on two lines');
  // without the kit (the made-up template): its layers added with the kit's look, only when a detail is drawn
  const t0 = read(T.build(SEED, riserJob({ det: { s9: { show: 'none' }, s12: { show: 'none' } } })).text);
  assert.equal(t0.layer('PLAN DETAIL'), undefined, 'none drawn: no layer added');
});
