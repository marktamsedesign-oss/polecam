/* (templates, Digester) the DXF synthesizer (vendor/synth/dxfsynth.js, in Node) on a client's FINISHED plan. The owner: "the digester learning from
   clients' finished plans. Learning means copying the template but replacing the details necessary to the project. Example: the plan itself, the
   project details, sheets to print details. Geo add sheet, vicinity, pmi and so on". The made-up finished plan tests/fixtures/client-d-made-up-plan.dxf
   (tests/fixtures/mkclient.py d: metres, 14 poles along a proposed and an existing cable, their IDs, numbers in circles, lat / long, span lengths, a
   cable name, a loop and a closure, roads, street names, a sheet grid; a vicinity picture; PMI and ROW tables; a legend; sheets COVER, LEGEND,
   LOCATION MAP, KEY PLAN, PLAN-1, PLAN-2, PMI, ROW, each with a title block of plain texts, the plan sheets at 1:1,200). Run: node --test tests/dxf-digest-plan.test.cjs
   - digest(): a finished plan (its route drawn and the signs of a plan made for a project), not the 7.15 templates with a sample drawing (a, b, c);
     each sheet's role; the look of each kind of thing it draws (layer, text style, height and printed size, colour, line weight, block); the PMI and
     ROW tables' values; the vicinity picture; the cover's texts that repeat a title block's value as fields (PREPARED FOR + the client);
   - proposal(): the roles, the fields (a sheet's own title and NTS kept on the sheets that are not the plan's), the pole blocks as the plan's poles,
     the look from the kinds, the legend and the tables kept in model space, the tables' values as the app's fields, no CEF sheet (the company's);
   - make(): their plan copied without the plan itself: TITLE, LEGENDS, VICINITY MAP, ROW AREA COVERAGE, KEYMAP, GEO, PMI (PLAN-2 left out), the
     vicinity picture and its image link gone, the PMI and ROW values as fields, the cover's fields, the square viewports, the look with its kinds; a
     made-up plan drawn on it (check) with every field filled, the ROW table redrawn for its places; the user's corrections followed (a sheet left
     out or kept as it is, a table kept as the client's);
   - (templates, Round trip): a template's tag (G-ESAA_TEMPLATE) written, read, replaced, kept by tidy(); a loaded-back template's missing layers a note.
   Every name, number and drawing is made up. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'), FX = path.join(__dirname, 'fixtures');
const T = require(path.join(root, 'dxftpl.js')), G = require(path.join(root, 'vendor', 'synth', 'dxfsynth.js'));
const SRC = fs.readFileSync(path.join(FX, 'client-d-made-up-plan.dxf'), 'utf8');
const DG = G.digest(SRC, 'client-d-made-up-plan.dxf'), P = DG.plan, MAP = G.proposal(DG);
let MADE = null; const made = () => MADE || (MADE = G.make(SRC, MAP, DG));
const get = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };
const typ = (r) => r[0][1];
const info = (text) => { const d = new T.Doc(text), S = T.structure(d); const tab = (L) => +(get(L.rec, 71) || 0); return { d, S, layouts: S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => tab(a) - tab(b)).map((L) => L.name) }; };

test('digest: a finished plan, its route, the look of each kind it draws', () => {
  assert.equal(P.finished, true); assert.equal(P.drawn, true);
  assert.deepEqual(P.signs, ['a PMI table with its figures', 'a ROW table with its places', 'a vicinity map', '2 plan sheets', 'a key map', 'a cover page', 'pole numbers or lat / long by the IDs']);
  assert.equal(P.poles, 14, 'the route\'s poles (not the legend\'s samples)'); assert.equal(P.planScale, 1200);
  assert.deepEqual(P.cables.map((c) => c.layer), ['D-FOC-PROPOSED', 'D-FOC-EXISTING']);
  assert.deepEqual(P.poleBlocks, [{ name: 'DEMO-POLE-NEW', n: 11, kind: 'new' }, { name: 'DEMO-POLE-EXIST', n: 3, kind: 'existing' }]);
  const K = P.kinds, pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
  assert.deepEqual(pick(K.poleId, ['layer', 'style', 'h', 'mm', 'k', 'color', 'n']), { layer: 'D-POLE-ID', style: 'D-LABELS', h: 2.2, mm: 1.83, k: 0.92, color: 2, n: 14 });
  assert.deepEqual(pick(K.poleNo, ['layer', 'h', 'color', 'n']), { layer: 'D-POLE-NO', h: 2.5, color: 1, n: 14 }); assert.equal(K.poleNoCircle.h, 4.4, 'the circles round them: 4.4 m across');
  assert.deepEqual(pick(K.latLong, ['layer', 'style', 'h', 'n']), { layer: 'D-LATLONG', style: 'D-SMALL', h: 1.2, n: 28 });
  assert.deepEqual(pick(K.spanLen, ['layer', 'style', 'h', 'n']), { layer: 'D-SPAN', style: 'D-SMALL', h: 1.8, n: 13 });
  assert.deepEqual(pick(K.cableLabel, ['layer', 'h', 'n']), { layer: 'D-CABLE-LABEL', h: 2.5, n: 1 });
  assert.equal(K.loopText.layer, 'D-LOOP'); assert.equal(K.closureLabel.layer, 'D-CLOSURE'); assert.equal(K.streetName.layer, 'D-STREET'); assert.equal(K.gridLabel.h, 20);
  assert.equal(K.note, undefined, 'every text of the plan read as one of its kinds');
  assert.deepEqual(pick(K.cable, ['layer', 'color', 'lw', 'lt']), { layer: 'D-FOC-PROPOSED', color: 1, lw: 50, lt: 'Continuous' });
  assert.deepEqual(pick(K.cableExisting, ['layer', 'color', 'lw', 'lt']), { layer: 'D-FOC-EXISTING', color: 5, lw: 35, lt: 'DASHED' });
  assert.deepEqual(pick(K.pole, ['layer', 'color', 'lw', 'block']), { layer: 'D-POLES', color: 3, lw: 35, block: 'DEMO-POLE-NEW' });
  assert.deepEqual(K.symbol.blocks, [{ name: 'DEMO-LOOP', n: 1 }, { name: 'DEMO-CLOSURE', n: 1 }]);
  assert.deepEqual(pick(K.road, ['layer', 'lw']), { layer: 'D-ROAD', lw: 18 }); assert.equal(K.grid.layer, 'D-GRID');
});

test('digest: each sheet\'s role, the tables the app fills, the vicinity picture, a cover\'s values as fields', () => {
  assert.deepEqual(P.roles, { COVER: 'cover', LEGEND: 'legend', 'LOCATION MAP': 'vicinity', 'KEY PLAN': 'keymap', 'PLAN-1': 'plan', 'PLAN-2': 'plan', PMI: 'pmi', ROW: 'row' });
  assert.deepEqual(P.scale, { LEGEND: 920, 'LOCATION MAP': 4000, 'KEY PLAN': 3000, 'PLAN-1': 1200, 'PLAN-2': 1200, PMI: 1320, ROW: 2800 });
  assert.equal(P.pmi.space, '', 'the PMI table in model space');
  assert.deepEqual(P.pmi.rows.map((q) => [q.token, q.how, q.value]), [['PMI_TOTAL_CABLE_LENGTH', 'token', '552.0m'], ['PMI_AERIAL_CABLE_LENGTH', 'token', '552.0m'], ['PMI_UG_CABLE_LENGTH', 'token', '0.0m'],
    ['PMI_PROPOSED_POLE', 'token', '11'], ['PMI_EXISTING_GT_POLE', 'token', '3'], ['PMI_HYBRID_CLOSURE', 'token', '1']]);
  assert.deepEqual(P.row.munis.map((q) => [q.token, q.value]), [['ROW_MUNICIPALITY_1', 'DEMO CITY'], ['ROW_MUNICIPALITY_2', 'DEMO TOWN']]);
  assert.deepEqual(P.row.brgys.map((q) => q.token), [1, 2, 3, 4, 5, 6].map((k) => `ROW_BARANGAY_${k}`)); assert.deepEqual(P.row.totals.map((q) => [q.token, q.value]), [['ROW_MUNICIPALITIES', 'TOTAL - 2'], ['ROW_BARANGAYS', 'TOTAL - 6']]);
  assert.equal(P.pics.length, 1); assert.equal(P.pics[0].sheet, '', 'the picture in model space'); assert.equal(P.vicGroups.length, 1); assert.equal(P.routeGroups.length, 1);
  const cover = DG.sheets.find((s) => s.name === 'COVER').fields;
  assert.deepEqual(cover.map((f) => [f.key, f.how, f.prefix || '', f.value, !!f.cross]), [['project', 'same', '', 'DEMO FIBER ROUTE 2026', true], ['location', 'same', '', 'DEMO CITY', true],
    ['client', 'inline', 'PREPARED FOR ', 'DEMO CLIENT D TELECOM', true], ['date', 'same', '', '12 NOV 2026', true]]);
  assert.deepEqual(DG.sheets.find((s) => s.name === 'PLAN-1').fields.map((f) => f.key), ['project', 'location', 'client', 'title', 'sheetNo', 'scale', 'date', 'drawn', 'checked']);
});

test('the 7.15 templates (a sample drawing, or none) are not finished plans: made as before', () => {
  for (const [k, drawn] of [['a', true], ['b', false], ['c', false]]) {
    const src = fs.readFileSync(path.join(FX, `client-${k}-made-up.dxf`), 'utf8'), dg = G.digest(src, `client-${k}.dxf`), p = G.proposal(dg);
    assert.equal(dg.plan.finished, false, k); assert.equal(dg.plan.drawn, drawn, k); assert.equal(p.finished, false); assert.equal(p.roles, undefined);
    assert.equal(dg.sheets.flatMap((s) => s.fields).filter((f) => f.cross).length, 0, `${k}: no field found again elsewhere`);
  }
  // client a's sample drawing taken as a finished plan when the user says so: its roles, its kinds
  const src = fs.readFileSync(path.join(FX, 'client-a-made-up.dxf'), 'utf8'), dg = G.digest(src, 'client-a.dxf'), p = G.proposal(dg, { finished: true });
  assert.equal(p.finished, true); assert.deepEqual(p.roles, { PLAN: 'plan', LEGEND: 'legend' }); assert.equal(p.look.kinds.poleId.layer, 'TEXT');
  const m = G.make(src, p, dg), I = info(m.plan); assert.deepEqual(I.layouts, ['LEGENDS', 'KEYMAP', 'GEO']); assert.equal(G.check(m, p).ok, true);
  assert.equal(G.proposal(DG, { finished: false }).finished, false, 'client d as a template: the 7.15 choices');
});

test('proposal: roles, fields, the poles\' blocks, the look learned, model space, the tables, no CEF sheet', () => {
  assert.equal(MAP.finished, true); assert.equal(MAP.plan, 'PLAN-1'); assert.equal(MAP.keymap, 'KEY PLAN'); assert.equal(MAP.cef, ''); assert.equal(MAP.name, 'DEMO CLIENT D TELECOM');
  assert.deepEqual(MAP.keep, ['COVER', 'LEGEND', 'LOCATION MAP', 'PMI', 'ROW']);
  const f = (sheet) => Object.fromEntries(DG.sheets.find((s) => s.name === sheet).fields.map((x) => [x.key, MAP.fields[x.id]]));
  assert.deepEqual(f('PLAN-1'), { project: 'project', location: 'location', client: 'client', title: 'title', sheetNo: 'sheetNo', scale: 'scale', date: 'date', drawn: 'drawn', checked: 'checked' });
  assert.deepEqual(f('LEGEND'), { project: 'project', location: 'location', client: 'client', title: '', sheetNo: 'sheetNo', scale: '', date: 'date', drawn: 'drawn', checked: 'checked' }, 'its title and NTS: the client\'s words');
  assert.equal(f('KEY PLAN').scale, 'scale', 'the key map\'s scale: the app\'s'); assert.equal(f('LOCATION MAP').scale, '', 'NTS kept'); assert.equal(f('KEY PLAN').title, '');
  assert.deepEqual([MAP.symbols['P-POLE'], MAP.symbols['existing telecom pole'], MAP.symbols['existing electric pole'], MAP.symbols['P-Joint'], MAP.symbols.loopp], ['DEMO-POLE-NEW', 'DEMO-POLE-EXIST', null, 'DEMO-CLOSURE', 'DEMO-LOOP']);
  assert.deepEqual(MAP.tags['P-Joint'], { JOINT: 'CL_ID' });
  assert.equal(MAP.look.font, 'D-LABELS'); assert.equal(MAP.look.bold, 'D-TITLE'); assert.equal(MAP.look.scale, 0.9, 'their pole IDs printed 1.83 mm: ×0.92 the app\'s, by twentieths');
  assert.deepEqual(MAP.look.lw, { cable: 50, cableExisting: 35, pole: 35, symbol: 25, road: 18, leader: 18 });
  assert.deepEqual(MAP.look.layers, { cable: 'D-FOC-PROPOSED', pole: 'D-POLES', symbol: 'D-LOOP', text: 'D-POLE-ID', road: 'D-ROAD', grid: 'D-GRID', photo: '' }); assert.equal(MAP.look.cableEx, 'D-FOC-EXISTING');
  assert.deepEqual(MAP.look.kinds.spanLen, { layer: 'D-SPAN', style: 'D-SMALL', h: 1.8, mm: 1.5, k: 0.83, color: 7 }); assert.equal(MAP.look.planScale, 1200);
  const kept = DG.model.groups.filter((g) => MAP.model.keep.includes(g.id)).map((g) => g.kind).sort(); assert.deepEqual(kept, ['legend', 'table', 'table'], 'the legend, the PMI and ROW tables');
  assert.equal(Object.keys(MAP.tables).length, 16); assert.ok(Object.values(MAP.tables).every((t) => /^(PMI|ROW)_/.test(t)));
});

test('make: their plan without the plan itself, its sheets as the app makes them, the tables and the cover\'s fields; a made-up plan drawn on it', () => {
  const m = made(), I = info(m.plan);
  assert.equal(m.cef, null, 'the CEF on the company\'s CEF template');
  assert.deepEqual(I.layouts, ['TITLE', 'LEGENDS', 'VICINITY MAP', 'ROW AREA COVERAGE', 'KEYMAP', 'GEO', 'PMI']);
  assert.ok(G.seedOk(m.plan)); assert.deepEqual(G.structCheck(m.plan), []);
  assert.ok(m.notes.some((t) => /^Sheets left out: PLAN-2/.test(t)) && m.notes.some((t) => /vicinity map's picture removed \(1 picture\(s\), 1 image file link/.test(t)) && m.notes.some((t) => /^Tables: 16 value/.test(t)), m.notes.join(' | '));
  // model space: the route gone (no pole of it, no lat / long, no cable), the picture and its link gone, the legend and the tables kept
  const model = I.S.E.filter((r) => get(r, 330) === I.S.modelH && String(get(r, 67) || '0').trim() !== '1');
  assert.ok(!model.some((r) => typ(r) === 'IMAGE') && !I.d.sec('OBJECTS').recs.some((r) => typ(r) === 'IMAGEDEF') && !m.plan.includes('DEMO_VICINITY.jpg'));
  assert.ok(!m.plan.includes('CC-9001') && !m.plan.includes('7.100000') && !model.some((r) => get(r, 8) === 'D-FOC-EXISTING' || get(r, 8) === 'D-LATLONG'), 'none of their route');
  assert.equal(model.filter((r) => typ(r) === 'INSERT').length, 3, 'the legend\'s three samples');
  const all = m.plan;
  for (const t of ['@@PMI_TOTAL_CABLE_LENGTH@@', '@@PMI_PROPOSED_POLE@@', '@@PMI_HYBRID_CLOSURE@@', '@@ROW_MUNICIPALITY_1@@', '@@ROW_BARANGAY_6@@', 'TOTAL - @@ROW_MUNICIPALITIES@@', 'TOTAL - @@ROW_BARANGAYS@@', 'PREPARED FOR @@CLIENT@@']) assert.ok(all.includes(t), t);
  assert.ok(!all.includes('552.0m') && !all.includes('DEMO BRGY 4') && !all.includes('DEMO FIBER ROUTE 2026'), 'their figures, places and project name gone');
  assert.ok(all.includes('FIBER OPTIC CABLE AS-PLAN') && all.includes('PROJECT MANAGEMENT INFORMATION') && all.includes('RIGHT OF WAY AREA COVERAGE'), 'their own words kept');
  // the viewports the builder aims: square (GEO at 1:1,100 on its paper)
  const vp = (name) => { const L = I.S.layouts.find((x) => x.name === name), br = I.S.br.get(L.brh), bn = get(br, 2), ents = bn === '*Paper_Space' ? I.S.E.filter((r) => get(r, 330) === L.brh) : I.S.blocks.get(bn).ents; return ents.filter((r) => typ(r) === 'VIEWPORT' && +get(r, 69) !== 1).sort((a, b) => +get(b, 40) * +get(b, 41) - +get(a, 40) * +get(a, 41))[0]; };
  for (const n of ['GEO', 'KEYMAP', 'VICINITY MAP']) { const v = vp(n); assert.ok(Math.abs(+get(v, 40) - +get(v, 41)) < 1, `${n}: square`); }
  assert.equal(+get(vp('GEO'), 45), 275, 'GEO: 250 mm at 1:1,100 = 275 m');
  const look = G.lookOf(m.plan); assert.equal(look.kinds.poleId.style, 'D-LABELS'); assert.deepEqual(look.from, { finished: true, scale: 1200, sheets: { TITLE: 'COVER', LEGENDS: 'LEGEND', 'VICINITY MAP': 'LOCATION MAP', KEYMAP: 'KEY PLAN', GEO: 'PLAN-1', PMI: 'PMI', 'ROW AREA COVERAGE': 'ROW' } });
  assert.equal(look.text.font, 'arialn.ttf'); assert.equal(look.text.scale, 0.9); assert.equal(look.sheet.cell, 275);
  // the check: a made-up plan drawn on it, every field filled, the PMI's figures, the ROW table redrawn for its places
  const ck = G.check(m, MAP); assert.equal(ck.ok, true, ck.problems.join(' | '));
  const B = ck.built.text; assert.equal((B.match(/@@\w+@@/g) || []).length, 0, 'every field filled or blank');
  for (const t of ['DEMO FIBER PROJECT', 'PREPARED FOR DEMO CLIENT', '463.0m', 'DEMO MADE-UP CITY', 'DEMO BRGY NORTH', 'TOTAL - 2']) assert.ok(B.includes(t), t);
  assert.deepEqual(G.structCheck(B), []);
  assert.deepEqual(info(B).layouts, ['TITLE', 'LEGENDS', 'VICINITY MAP', 'ROW AREA COVERAGE', 'KEYMAP', 'GEO', 'PMI']);
});

test('make: the user\'s corrections (a sheet left out, one kept as it is, a table kept as the client\'s)', () => {
  const map = JSON.parse(JSON.stringify(MAP));
  map.roles = { ...map.roles, LEGEND: 'other', ROW: 'out' };
  for (const q of P.pmi.rows) map.tables[q.handle] = '-';
  const m = G.make(SRC, map, DG), I = info(m.plan);
  assert.deepEqual(I.layouts, ['TITLE', 'VICINITY MAP', 'KEYMAP', 'GEO', 'PMI', 'LEGEND (CLIENT)'], 'the legend kept as it is, after the app\'s sheets (renamed: the builder reads a LEGEND sheet as its own); ROW left out');
  assert.ok(m.plan.includes('552.0m') && !m.plan.includes('@@PMI_TOTAL_CABLE_LENGTH@@'), 'the PMI as the client\'s');
  assert.ok(m.notes.some((t) => /^Sheets left out: PLAN-2, ROW/.test(t)), m.notes.join(' | '));
  assert.equal(G.check(m, map).ok, true);
  // a sheet kept under a name the plan uses for its own: renamed
  const map2 = JSON.parse(JSON.stringify(MAP)); map2.roles = { ...map2.roles, PMI: 'other' };
  const m2 = G.make(SRC, map2, DG); assert.ok(info(m2.plan).layouts.includes('PMI (CLIENT)')); assert.ok(m2.notes.some((t) => /The sheet PMI kept as PMI \(CLIENT\)/.test(t)));
});

test('(templates, Round trip) the template\'s tag: written, read, replaced, kept by tidy; a loaded-back template\'s missing layers a note', () => {
  const seed = made().plan;
  assert.equal(G.templateTag(seed), null);
  const a = G.tagTemplate(seed, { kind: 'client', id: 'tpl-1', name: 'DEMO CLIENT D TELECOM', at: '2026-11-20T00:00:00.000Z' });
  assert.deepEqual(G.templateTag(a), { v: 1, kind: 'client', id: 'tpl-1', name: 'DEMO CLIENT D TELECOM', at: '2026-11-20T00:00:00.000Z' });
  const b = G.tagTemplate(a, { kind: 'company', name: 'Company template', at: '2026-11-21T00:00:00.000Z' });
  assert.deepEqual(G.templateTag(b), { v: 1, kind: 'company', id: '', name: 'Company template', at: '2026-11-21T00:00:00.000Z' }); assert.equal((b.match(/G-ESAA_TEMPLATE/g) || []).length, 1, 'one tag');
  assert.deepEqual(G.structCheck(b), []); assert.ok(G.lookOf(b).kinds, 'the look kept');
  const t = G.tidy(b); assert.deepEqual(G.templateTag(t.text), G.templateTag(b)); assert.equal(G.tidy(b).text, t.text, 'the same every time');
  // the company-like made-up seed (no GRIDNO layer): its made-up plan writes on layers it lacks: a problem for a client's template, a note for one loaded back
  const sq = G.tidy(fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8')).text;
  const strict = G.check({ plan: sq, look: null, cef: null }, {}), soft = G.check({ plan: sq, look: null, cef: null }, {}, { softLayers: true });
  assert.equal(strict.ok, false); assert.equal(soft.ok, true); assert.ok(soft.notes.some((n) => /^The plan writes on layers the template does not have \(.*GRIDNO/.test(n)), soft.notes.join(' | '));
});
