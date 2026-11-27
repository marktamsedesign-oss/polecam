/* (templates, As-plan kit) the as-plan style kit (stage10 B2; stage8's Principles 1-2, the CEF's kit its model): the plan template's own text styles,
   layers and blocks, found by name, give each kind of text, line and symbol of the as-plan its look (dxftpl.js PLAN_KIT); GeDxfTpl.withKit(seed) is the
   starting kit (the admin's Download: every kit entry the template lacks added with today's look, and a STYLE KEY sheet); GeDxfTpl.kitOf(seed) what a
   template has of it. Run: node --test tests/plan-kit.test.cjs (or python3 tests/run_all.py --only plan-kit).
   - the kit's names: every kind once (PLAN_KIT); kitOf reads a template's (its names in any case) and, for what it lacks, today's look; the starting kit
     takes what a client's finished plan taught (G-ESAA_LOOK.kinds, stage10 B4) where it taught it;
   - a kit change changes the plan: a text style's font (a bold part in its bold one), height (annotative: printed mm, the kind's sizes in proportion; else
     metres), width factor and slant; the sheets' names and the BOQ table in theirs; a layer's colour, line type and weight (its lines BYLAYER; a Default
     weight: each cable its size's); a symbol (the template's own G-ESAA PULL-OFF; its own new tower not made red); the kit over a client template's look;
   - no kit: the plans on the made-up templates as before, byte for byte (their SHA-256, as the template line's Step 0, efe778f, made them);
   - withKit's output: a seed the app takes (the synthesizer's checks: seedOk, the structure check, a made-up plan drawn on it; check_dxf.py), one STYLE KEY
     sheet (the last tab, a sample of every entry), made again when run again, none with { key: false }; a plan on it looks as on its template, entity
     by entity (colour, line type and weight through the layers, fonts through the styles); its STYLE KEY left out of the plans, the active one too (a
     drafter saved the template with it open).
   Every name, number and drawing is made up (tests/fixtures/plan-seed-made-up-kit.dxf: mkseed.py --square --blocks --kit; the synthesizer's made-up
   client templates, tests/fixtures/client-*-made-up.dxf). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'), FX = path.join(__dirname, 'fixtures');
const T = require(path.join(root, 'dxftpl.js')), G = require(path.join(root, 'vendor', 'synth', 'dxfsynth.js'));
const SEED = fs.readFileSync(path.join(FX, 'plan-seed-made-up.dxf'), 'utf8'), SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const SEED_BL = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8'), KS = fs.readFileSync(path.join(FX, 'plan-seed-made-up-kit.dxf'), 'utf8');
const MADE = {}; /** a made-up client template the synthesizer makes (its plan seed with its look; the look's time made a fixed one): { plan, look } */
const client = (k) => { if (!MADE[k]) { const src = fs.readFileSync(path.join(FX, `client-${k}-made-up.dxf`), 'utf8'), dg = G.digest(src, `client-${k}-made-up.dxf`), m = G.make(src, G.proposal(dg), dg);
  MADE[k] = { ...m, plan: m.plan.replace(/"made":"[^"]{24}"/, '"made":"2026-11-20T08:00:00.000Z"') }; } return MADE[k]; };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const g = (r, c, d) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : d; };
const typ = (r) => r[0][1];
const E0 = 787300, N0 = 786100, ll = (E, N) => ({ lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 });

/** the synthesizer's made-up plan (12 poles, a tower, an OLT, closures, guys, a grounding, a NAP, arms, existing poles, a handhole), with more: a pull-off and
    a cross-over (their messengers), a new tower, a bold note with its thin line, the BOQ tables and the RTA / JPA legend (o: more of the job) */
function job(o) {
  const j = G.madeUpJob(); const at = (E, N) => ({ E, N, ...ll(E, N) });
  j.pts.push({ id: 'j1', poleId: 'PO-1', el: 'Pull-off', status: 'Proposed', ...at(E0 + 90, N0 - 40), att: ['s3', 's4'] }, { id: 'x1', poleId: 'CO-1', el: 'Cross-over', status: 'Proposed', ...at(E0 + 150, N0 + 40), att: ['s5', 's6'] });
  j.pts.push({ id: 't2', poleId: 'DEMO-NEW', el: 'Site', status: 'Proposed', siteName: 'DEMO NEW MIN9003', plaId: 'PLA-9003', ...at(E0 + 60, N0 + 120) });
  j.notes = [{ id: 'n1', kind: 'text', at: [E0 + 50, N0 + 80], lines: ['DEMO NOTE', 'SECOND LINE'], bold: true, lead: [E0 + 36, N0] }];
  return { ...j, pmiItems: { spans: [], points: [] }, rtaLegend: [{ text: 'DEMO RTA', color: 1, n: 2 }, { text: 'DEMO JPA', color: 3, n: 1 }], rtaLegendAt: 'boq', ...(o || {}) };
}
/** a DXF changed as a drafter changes it in AutoCAD (fn(d, X): d its Doc, X the helpers below) */
function edit(text, fn) {
  const d = new T.Doc(text), TB = d.sec('TABLES').recs;
  const X = {
    style: (nm) => TB.find((r) => typ(r) === 'STYLE' && String(g(r, 2)).toUpperCase() === nm.toUpperCase()),
    layer: (nm) => TB.find((r) => typ(r) === 'LAYER' && String(g(r, 2)).toUpperCase() === nm.toUpperCase()),
    set: (r, c, v) => { const k = r.findIndex((p, i) => i > 0 && p[0] === c); if (k > 0) r[k][1] = String(v); else { const x = r.findIndex((p) => p[0] >= 1000); r.splice(x > 0 ? x : r.length, 0, [c, String(v)]); } },
    dropX: (r, app) => { const k = r.findIndex((p) => p[0] === 1001 && String(p[1]).trim() === app); if (k < 0) return; let e = k + 1; while (e < r.length && r[e][0] !== 1001) e++; r.splice(k, e - k); },
    /** a text style's font: its file, and its TrueType family and flags (none: an SHX font) */
    font: (r, file, family, flags) => { X.set(r, 3, file); X.dropX(r, 'ACAD'); if (family) { const x = r.findIndex((p) => p[0] >= 1000); r.splice(x > 0 ? x : r.length, 0, [1001, 'ACAD'], [1000, family], [1071, String(flags)]); } },
    block: (nm) => d.sec('BLOCKS').recs.slice(d.sec('BLOCKS').recs.findIndex((r) => typ(r) === 'BLOCK' && g(r, 2) === nm) + 1).filter((r, i, a) => a.slice(0, i + 1).every((q) => typ(q) !== 'ENDBLK')),
  };
  fn(d, X); return d.text();
}
/** a built plan read: its records by handle, its kinds' records (report.movable), its style table */
function read(built) {
  const d = new T.Doc(built.text), S = T.structure(d), byH = new Map();
  for (const sec of ['ENTITIES', 'BLOCKS']) for (const r of d.sec(sec).recs) { const h = g(r, 5); if (h) byH.set(h, r); }
  const kind = (k) => (built.report.movable || []).filter((m) => m.kind === k).flatMap((m) => m.handles.map((h) => byH.get(h)).filter(Boolean));
  const style = (nm) => d.sec('TABLES').recs.find((r) => typ(r) === 'STYLE' && String(g(r, 2)).toUpperCase() === String(nm).toUpperCase());
  const layer = (nm) => d.sec('TABLES').recs.find((r) => typ(r) === 'LAYER' && g(r, 2) === nm);
  const model = d.sec('ENTITIES').recs.filter((r) => g(r, 330) === S.modelH && String(g(r, 67, '0')).trim() !== '1');
  return { d, S, kind, style, layer, model, layouts: S.layouts.map((L) => L.name).filter((n) => n !== 'Model') };
}
const mtOf = (r) => r.filter((p, i) => i > 0 && (p[0] === 3 || p[0] === 1)).map((p) => p[1]).join('');
/** a plan's look, entity by entity, as AutoCAD shows it: each entity of model and paper space, in order, its colour, line type and weight resolved through its
    layer (BYLAYER), a text's font through its style (file, family, flags, width factor, slant), its geometry and text; handles, owners, layer and style
    names left out */
function lookOf(text) {
  const d = new T.Doc(text), S = T.structure(d), TB = d.sec('TABLES').recs;
  const LY = new Map(TB.filter((r) => typ(r) === 'LAYER').map((r) => [String(g(r, 2)), r])), ST = new Map(TB.filter((r) => typ(r) === 'STYLE').map((r) => [String(g(r, 2)).toUpperCase(), r]));
  const fontOf = (nm) => { const r = ST.get(String(nm || 'Standard').toUpperCase()); if (!r) return 'none'; const k = r.findIndex((p) => p[0] === 1001 && String(p[1]).trim() === 'ACAD'); let fam = '', fl = ''; if (k > 0) for (let i = k + 1; i < r.length && r[i][0] !== 1001; i++) { if (r[i][0] === 1000) fam = r[i][1]; if (r[i][0] === 1071) fl = String(+r[i][1]); } return `${String(g(r, 3, '')).toLowerCase()}|${fam}|${fl}|w${+g(r, 41, 1)}|o${+g(r, 50, 0)}`; };
  const SKIP = new Set([5, 330, 360, 340, 8, 62, 6, 370, 7, 102, 1001, 1000, 1002, 1070, 1071, 1040, 1010, 1020, 1030, 420]);
  const ent = (r) => { const ly = LY.get(String(g(r, 8, '0'))), c = g(r, 62), lt = g(r, 6), lw = g(r, 370);
    const col = c == null || +c === 256 ? (ly ? Math.abs(+g(ly, 62, 7)) : '?') : +c, ltR = lt == null || /^bylayer$/i.test(lt) ? (ly ? g(ly, 6, 'Continuous') : '?') : lt, lwR = lw == null || +lw === -1 ? (ly ? +g(ly, 370, -3) : '?') : +lw;
    const geo = r.slice(1).filter((p) => !SKIP.has(p[0]) && !(p[0] >= 330 && p[0] <= 369)).map((p) => `${p[0]}=${p[1]}`).join(';');
    return `${typ(r)} ${col} ${ltR} ${lwR} ${['TEXT', 'MTEXT', 'ATTRIB'].includes(typ(r)) ? fontOf(g(r, 7)) : ''} ${geo}`; };
  const out = d.sec('ENTITIES').recs.map((r) => `E ${ent(r)}`);
  for (const L of S.layouts) { const bn = S.br.get(L.brh) && g(S.br.get(L.brh), 2); if (!bn || bn === '*Paper_Space' || bn === '*Model_Space') continue; for (const r of (S.blocks.get(bn) || { ents: [] }).ents) out.push(`${L.name} ${ent(r)}`); }
  return out;
}
/** tools/dxf-seed/check_dxf.py on a DXF: its last line ("… new problems: 0 {}") */
function checkDxf(text, name) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-kit-')), name); fs.writeFileSync(f, text);
  const r = spawnSync('python3', ['-I', path.join(root, 'tools', 'dxf-seed', 'check_dxf.py'), f], { encoding: 'utf8' }); return `${r.stdout}${r.stderr}`.trim().split('\n').pop();
}

const KIT = T.withKit(KS); // the starting kit of the made-up company-like template

test('the kit\'s names: every kind once; kitOf reads a template\'s (in any case) and today\'s look for what it lacks', () => {
  const P = T.PLAN_KIT;
  assert.equal(P.text.length, 19); assert.equal(P.layers.length, 11); assert.equal(P.sym.length, 41); // ((stage 11, riser detail) + PLAN DETAIL, its three layers)
  for (const L of [P.text, P.layers, P.sym]) { assert.equal(new Set(L.map((x) => x.name.toUpperCase())).size, L.length, 'each name once'); L.forEach((x) => assert.ok(x.what && x.what.length >= 7, `${x.name}: what it is`)); }
  [...P.text, ...P.layers].forEach((x) => assert.match(x.name, /^PLAN [A-Z ]+$/, 'a drafter-readable name'));
  ['PLAN POLE DETAILS', 'PLAN POLE NUMBER', 'PLAN LAT LONG', 'PLAN ID', 'PLAN SPAN LENGTH', 'PLAN CABLE LABEL', 'PLAN LOOP', 'PLAN CLOSURE', 'PLAN SITE', 'PLAN ATTACHMENT', 'PLAN STREET', 'PLAN LANDMARK', 'PLAN NOTE', 'PLAN TABLE', 'PLAN LEGEND', 'PLAN SHEET NAME', 'PLAN KEY MAP NAME', 'PLAN VICINITY MAP', 'PLAN DETAIL']
    .forEach((n, i) => assert.equal(P.text[i].name, n));
  assert.deepEqual(P.layers.map((x) => [x.name, x.color, x.lw]), [['PLAN CABLE AE', 1, -3], ['PLAN CABLE UG', 3, -3], ['PLAN CABLE AE EXISTING', 5, -3], ['PLAN CABLE UG EXISTING', 5, -3], ['PLAN MESSENGER', 1, 18], ['PLAN LEADER', 8, -3], ['PLAN ROAD', 7, -3], ['PLAN GRID', 6, -3], ['PLAN DETAIL', 7, 18], ['PLAN DETAIL PROPOSED', 1, 35], ['PLAN DETAIL EXISTING', 5, 25]]);
  // a template without the kit: none of it; today's look (its arial style's font, its Standard's, its 样式 1's; its road layer; its DASHED)
  const k0 = T.kitOf(KS), t0 = Object.fromEntries(k0.text.map((x) => [x.name, x])), l0 = Object.fromEntries(k0.layers.map((x) => [x.name, x])), s0 = Object.fromEntries(k0.sym.map((x) => [x.name, x]));
  assert.ok([...k0.text, ...k0.layers].every((x) => !x.has));
  assert.equal(t0['PLAN POLE DETAILS'].font, 'arial.ttf'); assert.equal(t0['PLAN LOOP'].font, 'txt'); assert.equal(t0['PLAN TABLE'].font, 'txt'); assert.equal(t0['PLAN LAT LONG'].font, 'arial.ttf'); assert.equal(t0['PLAN KEY MAP NAME'].font, 'arial.ttf');
  assert.deepEqual([l0['PLAN ROAD'].color, l0['PLAN ROAD'].lw, l0['PLAN CABLE AE'].lt, l0['PLAN CABLE UG'].lt, l0['PLAN MESSENGER'].lw, l0['PLAN LEADER'].color], [8, 18, 'DASHED', 'Continuous', 18, 8]);
  assert.equal(s0['P-POLE'].has, true); assert.equal(s0['G-ESAA ODC'].has, false); assert.equal(s0['G-ESAA P-BTS'].has, false);
  // the starting kit: all of it, as today's (height 0: the app's sizes; annotative)
  const k1 = T.kitOf(KIT);
  k1.text.forEach((x, i) => { assert.equal(x.has, true, x.name); assert.equal(x.name, P.text[i].name); assert.deepEqual([x.h, x.annotative, x.wf, x.obl, x.font], [0, true, 1, 0, k0.text[i].font], x.name); });
  k1.layers.forEach((x, i) => { assert.equal(x.has, true, x.name); assert.deepEqual([x.color, x.lt, x.lw], [k0.layers[i].color, k0.layers[i].lt, k0.layers[i].lw], x.name); });
  for (const nm of ['G-ESAA EXISTING GT POLE', 'G-ESAA PULL-OFF', 'G-ESAA CROSS-OVER', 'G-ESAA ODC', 'G-ESAA TELCO ARM', 'G-ESAA TELCO ARM R', 'G-ESAA P-BTS', 'P-POLE', 'X-BTS']) assert.equal(k1.sym.find((x) => x.name === nm).has, true, nm);
  // a drafter's kit, its names in other cases: read as given
  const W = edit(KIT, (d, X) => { X.set(X.style('PLAN STREET'), 2, 'plan street'); const s = X.style('PLAN SPAN LENGTH'); X.font(s, 'romans.shx'); X.set(s, 40, 2.5); X.set(s, 41, 0.8); X.set(s, 50, 15);
    const l = X.layer('PLAN CABLE AE'); X.set(l, 2, 'Plan Cable AE'); X.set(l, 62, 6); X.set(l, 370, 50); X.set(l, 6, 'Continuous'); });
  const k2 = T.kitOf(W), sp = k2.text.find((x) => x.name === 'PLAN SPAN LENGTH');
  assert.equal(k2.text[10].name, 'plan street'); assert.equal(k2.text[10].has, true);
  assert.deepEqual([sp.font, sp.h, sp.annotative, sp.wf, sp.obl], ['romans.shx', 2.5, true, 0.8, 15]);
  assert.deepEqual(k2.layers[0], { name: 'Plan Cable AE', has: true, color: 6, lt: 'Continuous', lw: 50, what: P.layers[0].what });
  // a client template's look: its fonts today (ROMANS; its bold style's ROMAND for a bold part), and so in its starting kit
  const ka = T.kitOf(client('a').plan), kb = T.kitOf(T.withKit(client('a').plan));
  assert.ok(ka.text.every((x) => !x.has && x.font === 'romans.shx' && x.bold === 'romand.shx'), 'the look\'s fonts');
  assert.ok(kb.text.every((x) => x.has && x.font === 'romans.shx' && x.bold === 'romand.shx'), 'the starting kit: each style\'s bold one too');
});

test('a kit change changes the plan: a text style\'s font (a bold part too), height, width factor and slant', () => {
  const J = () => job({ style: { 'span:s1|s2': { bold: true } } });
  const P0 = read(T.build(KIT, J())), sp0 = P0.kind('span').filter((r) => typ(r) === 'TEXT');
  assert.ok(sp0.length >= 10 && sp0.every((r) => /^PLAN SPAN LENGTH( B)?$/.test(g(r, 7))), 'the spans\' lengths in their kit style (the bold one in its bold style)');
  assert.ok(P0.kind('number').some((r) => g(r, 7) === 'PLAN POLE NUMBER') && P0.kind('details').some((r) => g(r, 7) === 'PLAN POLE DETAILS'), 'each kind in its own');
  assert.ok(P0.kind('details').filter((r) => g(r, 8) === 'LATLONG').every((r) => g(r, 7) === 'PLAN LAT LONG'), 'the lat / long in PLAN LAT LONG');
  const H0 = sp0.map((r) => +g(r, 40)), M0 = Math.max(...H0);
  // a font, a width factor and a slant, a height in metres (not annotative)
  const W1 = edit(KIT, (d, X) => { const s = X.style('PLAN SPAN LENGTH'); X.font(s, 'times.ttf', 'Times New Roman', 18); X.set(s, 41, 0.8); X.set(s, 50, 15); X.set(s, 40, 3.5); X.dropX(s, 'AcadAnnotative');
    X.font(X.style('PLAN NOTE'), 'cour.ttf', 'Courier New', 49); });
  const P1 = read(T.build(W1, J())), sp1 = P1.kind('span').filter((r) => typ(r) === 'TEXT'), H1 = sp1.map((r) => +g(r, 40)), M1 = Math.max(...H1);
  assert.equal(sp1.length, sp0.length);
  assert.ok(Math.abs(M1 - 3.5) < 1e-6, `its largest 3.5 m (${M1})`); H1.forEach((h, i) => assert.ok(Math.abs(h / M1 - H0[i] / M0) < 1e-4, 'the others in proportion'));
  assert.ok(sp1.every((r) => Math.abs(+g(r, 41) - 0.8) < 1e-9 && Math.abs(+g(r, 51) - 15) < 1e-9), 'its width factor and slant');
  assert.equal(g(P1.style('PLAN SPAN LENGTH'), 3), 'times.ttf');
  const bold = sp1.find((r) => g(r, 7) !== 'PLAN SPAN LENGTH'); assert.ok(bold, 'the bold one'); assert.equal(g(P1.style(g(bold, 7)), 3), 'timesbd.ttf', 'bold in the kit\'s font');
  const note = P1.kind('note').find((r) => typ(r) === 'MTEXT'); assert.match(mtOf(note), /\\fCourier New\|b1\|i0\|c0\|p49;/, 'a bold note: bold in the kit\'s font');
  assert.match(mtOf(P0.kind('note').find((r) => typ(r) === 'MTEXT')), /\\fArial\|b1/, 'as before on the starting kit');
  // annotative: the printed height in mm on the GEO sheets (twice the mm, twice the size); an SHX font: its file in the codes
  const ann = (h) => read(T.build(edit(KIT, (d, X) => { X.set(X.style('PLAN SPAN LENGTH'), 40, h); X.font(X.style('PLAN SITE'), 'romans.shx'); }), J()));
  const A2 = ann(2), A4 = ann(4), m2 = Math.max(...A2.kind('span').filter((r) => typ(r) === 'TEXT').map((r) => +g(r, 40))), m4 = Math.max(...A4.kind('span').filter((r) => typ(r) === 'TEXT').map((r) => +g(r, 40)));
  assert.ok(Math.abs(m4 / m2 - 2) < 1e-6 && Math.abs(m2 - 2 / (260 / 440)) < 1e-3, `2 mm and 4 mm printed (${m2}, ${m4}: the made-up GEO sheet prints 440 m on its 260 mm map)`);
  assert.equal(g(A2.style('PLAN SITE'), 3), 'romans.shx');
  // the sheets' names and the BOQ table in theirs (a sheet name's height in metres)
  const W3 = edit(KIT, (d, X) => { const s = X.style('PLAN SHEET NAME'); X.set(s, 40, 12); X.dropX(s, 'AcadAnnotative'); X.font(X.style('PLAN TABLE'), 'romans.shx'); });
  const B3 = T.build(W3, J()), P3 = read(B3), grid = P3.model.filter((r) => typ(r) === 'MTEXT' && g(r, 8) === 'GRIDNO');
  assert.ok(grid.length > 3 && grid.every((r) => g(r, 7) === 'PLAN SHEET NAME' && Math.abs(+g(r, 40) - 12) < 1e-9), 'the sheets\' names');
  assert.ok(B3.report.boqGrid.tables >= 1); const boq = P3.d.sec('BLOCKS').recs.concat(P3.d.sec('ENTITIES').recs).filter((r) => typ(r) === 'TEXT' && g(r, 8) === 'G-ESAA BOQ GRID');
  assert.ok(boq.length > 10 && boq.every((r) => g(r, 7) === 'PLAN TABLE'), 'the BOQ table');
});

test('a kit change changes the plan: a layer\'s colour, line type and weight (BYLAYER), a symbol, the kit over a client\'s look', () => {
  const J = () => job({ labels: 'tidy' });
  const P0 = read(T.build(KIT, J())), cab0 = P0.model.filter((r) => typ(r) === 'LWPOLYLINE' && g(r, 8) === 'PLAN CABLE AE');
  assert.ok(cab0.length > 3 && cab0.every((r) => g(r, 62) == null && g(r, 6) == null && +g(r, 370) > 0), 'the starting kit: BYLAYER, each cable its own weight (the layer\'s Default)');
  const W = edit(KIT, (d, X) => { const c = X.layer('PLAN CABLE AE'); X.set(c, 62, 6); X.set(c, 370, 50); X.set(c, 6, 'Continuous'); X.set(X.layer('PLAN LEADER'), 62, 4); X.set(X.layer('PLAN ROAD'), 62, 2); const m = X.layer('PLAN MESSENGER'); X.set(m, 62, 3); X.set(m, 370, 35); X.set(X.layer('PLAN GRID'), 62, 30);
    const po = X.block('G-ESAA PULL-OFF').find((r) => typ(r) === 'LWPOLYLINE'); const k = po.findIndex((p) => p[0] === 90); po.splice(k, po.length - k, [90, '3'], [70, '1'], [43, '0.14'], [10, '-0.5'], [20, '-0.5'], [10, '0.5'], [20, '-0.5'], [10, '0.0'], [20, '0.5']);
    for (const r of X.block('G-ESAA P-BTS')) if (typ(r) !== 'ATTDEF' && g(r, 62) != null) X.set(r, 62, 3); });
  const P1 = read(T.build(W, J())), L = (nm) => P1.layer(nm), res = (r) => [g(r, 62) == null ? +g(L(g(r, 8)), 62) : +g(r, 62), g(r, 6) == null ? g(L(g(r, 8)), 6) : g(r, 6), g(r, 370) == null ? +g(L(g(r, 8)), 370, -3) : +g(r, 370)];
  const cab = P1.model.filter((r) => typ(r) === 'LWPOLYLINE' && g(r, 8) === 'PLAN CABLE AE');
  assert.equal(cab.length, cab0.length); cab.forEach((r) => assert.deepEqual(res(r), [6, 'Continuous', 50], 'a cable: the layer\'s colour, line type and weight'));
  const lead = P1.model.filter((r) => g(r, 8) === 'PLAN LEADER'); assert.ok(lead.length > 0 && lead.every((r) => res(r)[0] === 4), 'the thin lines');
  const road = P1.model.filter((r) => g(r, 8) === 'PLAN ROAD'); assert.ok(road.some((r) => res(r)[0] === 2) && road.filter((r) => g(r, 62) != null).every((r) => [8, 5].includes(+g(r, 62))), 'the roads\' edges (footpaths grey, bridges blue)');
  const msg = P1.model.filter((r) => g(r, 8) === 'PLAN MESSENGER'); assert.ok(msg.length >= 4 && msg.every((r) => res(r)[0] === 3 && res(r)[2] === 35), 'the messengers');
  const grid = P1.model.filter((r) => g(r, 8) === 'PLAN GRID'); assert.ok(grid.length >= 4 && grid.every((r) => typ(r) === 'LWPOLYLINE' && res(r)[0] === 30), 'the sheets\' grid');
  // the symbols: the template's own pull-off; its own new tower kept as it is (made red only when the app makes it)
  const blk = (P, nm) => { const B = P.S.blocks.get(nm); return B ? B.ents : null; };
  assert.equal(+g(blk(P1, 'G-ESAA PULL-OFF').find((r) => typ(r) === 'LWPOLYLINE'), 90), 3, 'the template\'s pull-off');
  assert.ok(P1.model.some((r) => typ(r) === 'INSERT' && g(r, 2) === 'G-ESAA PULL-OFF') && P1.model.some((r) => typ(r) === 'INSERT' && g(r, 2) === 'G-ESAA P-BTS'));
  assert.ok(blk(P1, 'G-ESAA P-BTS').filter((r) => typ(r) !== 'ATTDEF' && g(r, 62) != null).every((r) => +g(r, 62) === 3), 'the template\'s new tower');
  const PS = read(T.build(KS, J())); assert.ok(blk(PS, 'G-ESAA P-BTS').filter((r) => typ(r) !== 'ATTDEF').every((r) => +g(r, 62) === 1), 'no kit: made red, as before');
  // the kit over a client's look: a kit style the template has wins; a kind without one: the look's style, as 7.15
  const ca = client('a'), WA = edit(T.withKit(ca.plan), (d, X) => { X.font(X.style('PLAN SPAN LENGTH'), 'times.ttf', 'Times New Roman', 18); const s = X.style('PLAN STREET'); const T0 = d.sec('TABLES').recs; T0.splice(T0.indexOf(s), 1); });
  const PA = read(T.build(WA, G.madeUpJob(ca.look))), look = ca.look.text.style;
  assert.ok(PA.kind('span').filter((r) => typ(r) === 'TEXT').every((r) => g(r, 7) === 'PLAN SPAN LENGTH') && g(PA.style('PLAN SPAN LENGTH'), 3) === 'times.ttf', 'the kit\'s');
  const st = PA.kind('road').filter((r) => typ(r) === 'TEXT'); assert.ok(st.length > 0 && st.every((r) => g(r, 7) === look), `the look's (${look})`);
});

test('the starting kit takes what a client\'s finished plan taught (G-ESAA_LOOK.kinds, stage10 B4), else today\'s', () => {
  const kinds = { spanLen: { style: 'DEMO ROMANS', mm: 2.2, color: 4 }, poleId: { style: 'DEMO ROMANS', mm: 1.8 }, streetName: { style: 'NO SUCH STYLE', mm: 3 },
    cable: { color: 6, lt: 'Continuous', lw: 50 }, cableExisting: { color: 140, lt: 'NO SUCH LINE TYPE', lw: 33 }, road: { color: 9, lw: 13 } };
  const seed = edit(KS, (d) => { // (a client's style, and the look a finished plan of theirs gave: its kinds)
    const TB = d.sec('TABLES').recs, O = d.sec('OBJECTS').recs, st = TB.find((r) => typ(r) === 'STYLE' && g(r, 2) === 'Standard'), tb = TB.find((r) => typ(r) === 'TABLE' && g(r, 2) === 'STYLE');
    TB.splice(TB.indexOf(st) + 1, 0, st.map(([c, v]) => [c, c === 5 ? d.newHandle() : c === 2 ? 'DEMO ROMANS' : c === 3 ? 'romans.shx' : v])); tb.find((q, i) => i > 0 && q[0] === 70)[1] = String(+g(tb, 70) + 1);
    const rt = O.find((r) => typ(r) === 'DICTIONARY'), rh = g(rt, 5), h = d.newHandle(), js = JSON.stringify({ v: 1, name: 'DEMO FINISHED PLAN', text: { style: 'arial' }, kinds }), ch = [];
    for (let i = 0; i < js.length; i += 250) ch.push(js.slice(i, i + 250));
    rt.push([3, 'G-ESAA_LOOK'], [350, h]); O.splice(O.indexOf(rt) + 1, 0, [[0, 'XRECORD'], [5, h], [102, '{ACAD_REACTORS'], [330, rh], [102, '}'], [330, rh], [100, 'AcDbXrecord'], [280, '1'], ...ch.map((c) => [1, c])]); d.index(); });
  const by = (k) => Object.fromEntries([...k.text, ...k.layers].map((x) => [x.name, x])), k0 = by(T.kitOf(seed)), W = T.withKit(seed), k1 = by(T.kitOf(W));
  for (const k of [k0, k1]) { // (kitOf: what the starting kit gives for what the template lacks; then what it has)
    assert.deepEqual([k['PLAN SPAN LENGTH'].font, k['PLAN SPAN LENGTH'].h, k['PLAN POLE DETAILS'].font, k['PLAN POLE DETAILS'].h, k['PLAN ID'].h], ['romans.shx', 2.2, 'romans.shx', 1.8, 1.8], 'the taught style and printed height');
    assert.deepEqual([k['PLAN STREET'].font, k['PLAN STREET'].h, k['PLAN LOOP'].font, k['PLAN LOOP'].h], ['arial.ttf', 3, 'arial.ttf', 0], 'a style the template has not: the look\'s font; nothing taught: as today');
    assert.deepEqual([k['PLAN CABLE AE'].color, k['PLAN CABLE AE'].lt, k['PLAN CABLE AE'].lw], [6, 'Continuous', 50]);
    assert.deepEqual([k['PLAN CABLE AE EXISTING'].color, k['PLAN CABLE AE EXISTING'].lt, k['PLAN CABLE AE EXISTING'].lw], [140, 'DASHED', 35], 'a line type it has not: today\'s; the weight AutoCAD\'s nearest');
    assert.deepEqual([k['PLAN ROAD'].color, k['PLAN ROAD'].lw, k['PLAN CABLE UG'].color, k['PLAN CABLE UG'].lw], [9, 13, 3, -3]);
  }
  assert.ok(Object.values(k1).every((x) => x.has) && k1['PLAN SPAN LENGTH'].annotative);
  const P = read(T.build(W, job())), P0 = read(T.build(seed, job())), top = (R) => Math.max(...R.kind('span').filter((r) => typ(r) === 'TEXT').map((r) => +g(r, 40)));
  assert.ok(P.kind('span').filter((r) => typ(r) === 'TEXT').every((r) => g(r, 7) === 'PLAN SPAN LENGTH') && Math.abs(top(P) - top(P0)) > 1e-3, 'the plan on it: its spans as taught');
});

/* PINNED-CASES */
const CASES = {
  plainRich: { seed: () => SEED, job: () => job() },
  squareTidy: { seed: () => SEED_SQ, job: () => job({ labels: 'tidy', rtaLegendAt: 'sheet' }) },
  blocksStd: { seed: () => SEED_BL, job: () => job({ markMode: 'num', markNum: true, gridStyle: { pos: 'bl', h: 4, color: 3 } }) },
  blocksTidy: { seed: () => SEED_BL, job: () => job({ labels: 'tidy', cloStyle: 'bubble', style: { 'span:s1|s2': { bold: true, h: 1.4 } } }) },
  clientA: { seed: () => client('a').plan, job: () => ({ ...G.madeUpJob(client('a').look), labels: 'tidy' }) },
  clientC: { seed: () => client('c').plan, job: () => job() },
};
/* END-PINNED-CASES */
const PINNED = { // (efe778f's builder made the same)
  plainRich: '69bcc71fc26d981e063989e70e1116d08d37406047d6948f09cb1bccb5bdfc9f',
  squareTidy: '1fcf75c124dbcf02564da6e348816c825f536cedce9305b74aa36e8d49826af1',
  blocksStd: '8f2251c92436622ecd4e51380e3c45b539e53d0b32c22e3c8ec8ddc827bbd7e1',
  blocksTidy: 'da70e0e19ab045b66afb940f6fe6bb3c680ddaab8487c001dbb1a2cf9b6586df',
  clientA: '628d503693a7756c821a35d64e9ab22563e0da70684dedbe7aef0419cb79a2ab',
  clientC: 'db8602462bd4cb6c1de210f16472dbb149862d5c081927203f0f8512b7810342',
};
test('no kit: the plans on the made-up templates as before, byte for byte', () => {
  for (const [nm, c] of Object.entries(CASES)) assert.equal(sha(T.build(c.seed(), c.job()).text), PINNED[nm], nm);
});

test('withKit: a seed the app takes, one STYLE KEY with every entry, run again: the same; a plan on it looks as on its template', () => {
  const seeds = { plain: SEED, square: SEED_SQ, blocks: SEED_BL, kit: KS, clientA: client('a').plan, clientB: client('b').plan, clientC: client('c').plan };
  for (const [nm, seed] of Object.entries(seeds)) {
    const W = nm === 'kit' ? KIT : T.withKit(seed), look = /^client/.test(nm) ? client(nm.slice(-1).toLowerCase()).look : null;
    assert.ok(G.seedOk(W), `${nm}: a seed the app takes`);
    assert.ok(G.structCheck(W).length <= G.structCheck(seed).length, `${nm}: no structure problem of its own (${JSON.stringify(G.structCheck(W).slice(0, 2))})`);
    const B = T.build(W, G.madeUpJob(look)), B0 = T.build(seed, G.madeUpJob(look));
    assert.ok(G.structCheck(B.text).length <= G.structCheck(B0.text).length, `${nm}: the plan on it, no structure problem of its own`);
    const R = read({ text: W, report: {} }), SK = R.S.layouts.filter((L) => L.name === 'STYLE KEY');
    assert.equal(SK.length, 1, `${nm}: one STYLE KEY`); assert.notEqual(g(R.S.br.get(SK[0].brh), 2), '*Paper_Space', 'not the active sheet');
    assert.equal(+g(SK[0].rec, 71), Math.max(...R.S.layouts.map((L) => +g(L.rec, 71, 0))), 'the last tab');
    assert.ok(!read(B).layouts.includes('STYLE KEY'), `${nm}: left out of the plan`);
    assert.deepEqual(T.kitOf(T.withKit(W)), T.kitOf(W), `${nm}: run again, the same kit`);
    const dc = new T.Doc(W); T.clean(dc); assert.deepEqual(T.kitOf(dc.text()), T.kitOf(W), `${nm}: the cleanup (a template loaded back) keeps it`);
  }
  // the STYLE KEY: each style's name and a sample in it, each layer's name and a line on it, each symbol's name and (the template has it) a sample of it
  const R = read({ text: KIT, report: {} }), SK = R.S.layouts.find((L) => L.name === 'STYLE KEY'), E = R.S.blocks.get(g(R.S.br.get(SK.brh), 2)).ents, words = E.filter((r) => typ(r) === 'TEXT').map((r) => g(r, 1));
  for (const x of [...T.PLAN_KIT.text, ...T.PLAN_KIT.layers, ...T.PLAN_KIT.sym]) assert.ok(words.includes(x.name), `the key names ${x.name}`);
  for (const x of T.PLAN_KIT.text) assert.ok(E.some((r) => typ(r) === 'TEXT' && g(r, 7) === x.name), `a sample in ${x.name}`);
  for (const x of T.PLAN_KIT.layers) assert.ok(E.some((r) => typ(r) === 'LWPOLYLINE' && g(r, 8) === x.name && g(r, 62) == null), `a line on ${x.name}`);
  for (const x of T.kitOf(KIT).sym.filter((s) => s.has)) assert.ok(E.some((r) => typ(r) === 'INSERT' && g(r, 2) === x.name), `a sample of ${x.name}`);
  assert.ok(!T.withKit(KS, { key: false }).includes('STYLE KEY'), 'key: false, none');
  assert.equal(T.structure(new T.Doc(T.withKit(KIT))).layouts.filter((L) => L.name === 'STYLE KEY').length, 1, 'made again, one');
  // check_dxf.py: the starting kit and a plan on it
  assert.match(checkDxf(KIT, 'kit.dxf'), /new problems: 0/); assert.match(checkDxf(T.build(KIT, job()).text, 'kit-plan.dxf'), /new problems: 0/);
  // a plan on the starting kit looks as on its template: entity by entity
  for (const [nm, seed, W, J] of [['kit', KS, KIT, () => job()], ['kit tidy', KS, KIT, () => job({ labels: 'tidy', rtaLegendAt: 'sheet', gridStyle: { pos: 'tl', h: 5 } })],
    ['kit tools', KS, KIT, () => job({ style: { 'lbl:s3': { h: 1.5, bold: true, color: 3 }, 'span:s3|s4': { italic: true } }, cloStyle: 'bubble' })],
    ['client a', client('a').plan, T.withKit(client('a').plan), () => ({ ...G.madeUpJob(client('a').look), labels: 'tidy' })], ['client b', client('b').plan, T.withKit(client('b').plan), () => job()]]) {
    const a = lookOf(T.build(seed, J()).text), b = lookOf(T.build(W, J()).text);
    assert.equal(b.length, a.length, `${nm}: as many entities`); const k = a.findIndex((x, i) => x !== b[i]); assert.equal(k, -1, `${nm}: the same look\n  ${a[k]}\n  ${b[k]}`);
  }
});

test('a template\'s STYLE KEY is left out of its plans, the active one too; withKit refuses what is not a seed', () => {
  const R0 = read({ text: KS, report: {} }); assert.equal(g(R0.S.br.get(R0.S.layouts.find((L) => L.name === 'STYLE KEY').brh), 2), '*Paper_Space', 'the made-up template: its STYLE KEY the active sheet');
  const B = T.build(KS, job()), R = read(B);
  assert.ok(!R.layouts.includes('STYLE KEY')); assert.deepEqual(G.structCheck(B.text), []);
  assert.equal(g(R.S.br.get(R.S.layouts.find((L) => L.name === 'Layout1').brh), 2), '*Paper_Space', 'the first other sheet the active one now');
  assert.ok(!R.model.some((r) => /DRAFTER/.test(String(g(r, 1, '')))) && !B.text.includes('A DRAFTER\'S OWN NOTES'), 'nothing of it left');
  const RK = read({ text: KIT, report: {} }); assert.notEqual(g(RK.S.br.get(RK.S.layouts.find((L) => L.name === 'STYLE KEY').brh), 2), '*Paper_Space', 'the starting kit\'s STYLE KEY: not the active one');
  assert.throws(() => T.withKit(SEED.replace(/@@\w+@@/g, 'X')), /no @@ fields/); assert.throws(() => T.withKit(SEED.split('\nGEO\n').join('\nGEX\n')), /no GEO sheet/);
});
