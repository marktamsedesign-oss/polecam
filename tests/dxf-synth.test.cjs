/* (beta 7.15, Client templates) the DXF synthesizer (dxfsynth.js, in Node) on three made-up "DEMO CLIENT" templates (tests/fixtures/mkclient.py):
   (a) A1 in mm, a title block BLOCK with attributes, ROMANS, layers with line weights, client symbols, a sample route and a legend in model space;
   (b) A3 in mm, a title block of plain TEXT labels and value texts (some labels with none), Arial Narrow, one symbol drawn in millimetres;
   (c) inches, two sheets (PLAN, KEY PLAN), no symbols, labels and values in one text. Run: node --test tests/dxf-synth.test.cjs
   - read(): a binary DXF, a DWG, a DXB, an R12 DXF refused, saying how to save a DXF; the bytes of a DXF read;
   - digest() + proposal(): the sheets, the fields with what they are (attributes by tag, labels and their value texts, labels with none, a label and
     its value in one text), the font, the symbols, the layers and their line weights, the model space (the sample removed, the legend kept);
   - make(): the as-plan seed is one the app takes (seedOk), dxftpl.js draws a made-up plan on it, every field placed and filled by the export's values,
     the look XRECORD parses, the structure check (check_dxf.py's, in JS) is clean, the map viewport square at 1:1100 on the client's paper, every
     layer the plan writes there, the client's symbols under the plan's block names (its attribute tags with them), the app's own for the others; the
     CEF seed has its one sheet 'CEF' (the active one), its tokens, its drawing area (main viewport), an empty model space;
   - the company-like made-up seeds (tests/fixtures/plan-seed-made-up*.dxf, no look) are drawn as beta 7.13 drew them (a pinned SHA-256, a key map
     copied for a second place); a client seed's key map copied for a second place keeps its sheet (dxftpl.js: the active sheet copied with its
     entities). Every name, number and drawing is made up. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..'), FX = path.join(__dirname, 'fixtures');
const T = require(path.join(root, 'dxftpl.js')), G = require(path.join(root, 'dxfsynth.js'));
const SRC = Object.fromEntries(['a', 'b', 'c'].map((k) => [k, fs.readFileSync(path.join(FX, `client-${k}-made-up.dxf`), 'utf8')]));
const DG = {}, MADE = {}, MAP = {};
const dg = (k) => DG[k] || (DG[k] = G.digest(SRC[k], `client-${k}-made-up.dxf`));
const made = (k) => { if (!MADE[k]) { MAP[k] = G.proposal(dg(k)); MADE[k] = G.make(SRC[k], MAP[k], dg(k)); } return MADE[k]; };
const get = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };
const info = (text) => { const d = new T.Doc(text), S = T.structure(d); return { d, S, layouts: S.layouts.map((L) => L.name).filter((n) => n !== 'Model') }; };
const fieldsOf = (k, sheet) => dg(k).sheets.find((s) => s.name === sheet).fields;
const keyOf = (k, sheet, label) => { const f = fieldsOf(k, sheet).find((x) => x.label === label); return f ? f.key : undefined; };

test('read(): a binary DXF, a DWG, a DXB, an R12 DXF refused, saying how to save a DXF; a DXF\'s bytes read', () => {
  const bin = G.read(new Uint8Array([...Buffer.from('AutoCAD Binary DXF\r\n\x1a\x00'), 0, 1, 2]));
  assert.equal(bin.ok, false); assert.match(bin.error, /binary form.*Save As.*DXF/);
  const dwg = G.read(new Uint8Array([...Buffer.from('AC1032'), 0, 0, 0, 7, 9]));
  assert.equal(dwg.ok, false); assert.match(dwg.error, /DWG drawing, not a DXF.*Save As/);
  assert.equal(G.read(Buffer.from('AutoCAD DXB 1.0\r\n')).ok, false);
  const r12 = G.read('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n  0\nEOF\n');
  assert.equal(r12.ok, false); assert.match(r12.error, /R12 or older.*no sheets/);
  assert.equal(G.read('hello').ok, false);
  const ok = G.read(new Uint8Array(Buffer.from(SRC.a, 'utf8'))); assert.equal(ok.ok, true); assert.equal(ok.release, '2018'); assert.equal(ok.text, SRC.a);
});

test('digest (a): A1 in mm, the title block\'s attributes by tag and label, ROMANS and its bold, the symbols, the layers, the sample removed and the legend kept', () => {
  const D = dg('a'), P = G.proposal(D);
  assert.deepEqual(D.sheets.map((s) => [s.name, s.active, s.units, s.paper.join('x'), s.vps.length]), [['PLAN', true, 'mm', '841x594', 2], ['LEGEND', false, 'mm', '420x297', 1]]);
  assert.equal(D.units, 'metres'); assert.deepEqual(D.font, { main: 'CLIENT ROMANS', bold: 'CLIENT ROMANS BOLD' });
  const F = fieldsOf('a', 'PLAN');
  for (const [label, key] of [['PROJECT', 'project'], ['DRAWN BY', 'drawn'], ['CHECKED BY', 'checked'], ['APPROVED BY', 'approved'], ['DWG NO.', 'dwgNo'], ['SHEET', 'sheetNo'], ['DATE', 'date'], ['SCALE', 'scale'], ['REV', 'rev']]) {
    const f = F.find((x) => x.label === label); assert.ok(f, label); assert.equal(f.key, key, label); assert.equal(f.kind, 'attrib', label); assert.ok(f.sure >= 0.9, `${label}: sure ${f.sure}`);
  }
  const st = F.find((x) => x.label === 'STATUS'); assert.equal(st.key, '', 'STATUS: not known to the app'); assert.equal(st.guess, 'kind'); assert.equal(st.kind, 'btext');
  assert.equal(P.plan, 'PLAN'); assert.equal(P.keymap, ''); assert.equal(P.cef, 'PLAN'); assert.deepEqual(P.keep, ['LEGEND']);
  assert.equal(P.name, 'DEMO CLIENT A - TELECOM DIVISION');
  assert.equal(P.symbols['P-POLE'], 'POLE-NEW'); assert.equal(P.symbols['existing telecom pole'], 'POLE-EXIST'); assert.equal(P.symbols['existing electric pole'], 'POLE-EXIST');
  assert.equal(P.symbols['P-Joint'], 'SPLICE-CLOSURE'); assert.deepEqual(P.tags['P-Joint'], { JT_ID: 'CL_TYPE', JOINT: 'CL_ID' }); assert.equal(P.symbols['proposed Handhole'], 'HANDHOLE');
  assert.equal(P.symbols.loopp, null); assert.equal(P.symbols['X-BTS'], null);
  assert.deepEqual(P.look.layers, { cable: 'FO-CABLE-PROP', pole: 'POLE', symbol: '', text: 'TEXT', road: 'ROAD', grid: '', photo: '' });
  assert.deepEqual(P.look.lw, { cable: 50, cableExisting: 35, pole: 35, leader: 18, road: 13 }); assert.equal(P.look.scale, 0.8); // (its sample texts 1.8 m high: smaller, gently)
  assert.equal(D.model.groups.length, 2);
  const legend = D.model.groups.find((g) => g.kind === 'legend'), sample = D.model.groups.find((g) => g.kind === 'drawing');
  assert.deepEqual(P.model.keep, [legend.id]); assert.ok(sample.shown.some((x) => x.sheet === 'PLAN' && x.main));
  assert.ok(JSON.stringify(D).length < 200000, 'the digest is small (JSON)');
});

test('digest (b): A3, plain texts: labels and values, labels with none (a value added in its column), placeholders blanked or filled, Arial Narrow, a symbol in mm', () => {
  const D = dg('b'), P = G.proposal(D), F = fieldsOf('b', 'A3 SHEET');
  assert.deepEqual(D.sheets.map((s) => [s.name, s.active, s.units]), [['A3 SHEET', true, 'mm']]);
  for (const [label, key] of [['PROJECT:', 'project'], ['LOCATION:', 'location'], ['DWG NO:', 'dwgNo'], ['SHEET:', 'sheetNo'], ['DATE:', 'date'], ['SCALE:', 'scale'], ['REV:', 'rev'], ['CLIENT:', 'client']]) assert.equal(keyOf('b', 'A3 SHEET', label), key, label);
  for (const label of ['PREPARED BY:', 'CHECKED BY:', 'APPROVED BY:']) { const f = F.find((x) => x.label === label); assert.equal(f.kind, 'label', label); assert.equal(f.at.x, 322, `${label}: in the values' column`); }
  assert.equal(F.find((x) => x.label === 'PROJECT:').placeholder, true); assert.equal(F.find((x) => x.label === 'CLIENT:').placeholder, false);
  assert.deepEqual(D.font, { main: 'NARROW', bold: '' }); assert.equal(D.styles.find((s) => s.name === 'NARROW').font, 'arialn.ttf');
  assert.equal(P.symbols['proposed NAP'], 'NAP-BOX'); assert.equal(P.client, 'DEMO CLIENT B'); assert.equal(P.look.scale, 1);
  assert.deepEqual(P.model.keep, [], 'the sample drawing removed');
});

test('digest (c): inches, two sheets (the key plan its own), a label with its value under it, labels and values in one text, no symbols', () => {
  const D = dg('c'), P = G.proposal(D);
  assert.deepEqual(D.sheets.map((s) => [s.name, s.active, s.units, s.paper.join('x')]), [['KEY PLAN', true, 'in', '17x11'], ['PLAN', false, 'in', '34x22']]);
  assert.equal(D.units, 'feet'); assert.equal(P.plan, 'PLAN'); assert.equal(P.keymap, 'KEY PLAN'); assert.equal(P.cef, 'PLAN');
  const F = fieldsOf('c', 'PLAN'), by = (l) => F.find((x) => x.label === l);
  assert.equal(by('PROJECT TITLE').key, 'project'); assert.equal(by('PROJECT TITLE').how, 'under');
  assert.equal(by('DWG. NO.').key, 'dwgNo'); assert.equal(by('DWG. NO.').value, 'C-100');
  assert.equal(by('DRAWN:').key, 'drawn'); assert.equal(by('DRAWN:').how, 'inline'); assert.equal(by('DRAWN:').value, 'JD');
  assert.equal(by('DATE:').key, 'date'); assert.equal(by('SHEET').key, 'sheetNo'); assert.equal(by('SHEET').value, '1 OF 2');
  assert.equal(D.blocks.length, 0); assert.ok(Object.values(P.symbols).every((v) => v === null), 'the app\'s own symbols');
});

for (const k of ['a', 'b', 'c']) {
  test(`make (${k}): the seed is taken, a made-up plan drawn on it, every field filled, the look written, the structure sound; the CEF seed`, () => {
    const m = made(k), map = MAP[k], ck = G.check(m, map);
    assert.equal(ck.ok, true, ck.problems.join(' | '));
    assert.equal(G.seedOk(m.plan), true);
    // the look, as written in the seed
    const L = G.lookOf(m.plan);
    assert.equal(L.v, 1); assert.equal(L.name, map.name); assert.equal(L.from, `client-${k}-made-up.dxf`); assert.equal(L.text.style, 'G-ESAA TEXT'); assert.equal(L.text.scale, map.look.scale);
    assert.deepEqual(L, m.look);
    assert.equal(L.sheet.name, 'GEO'); assert.equal(L.sheet.scale, 1100); assert.ok(Math.abs(L.sheet.cell - L.sheet.side * L.sheet.mm * 1.1) < 1e-6, 'the cell: 1:1100 on its paper');
    const I = info(m.plan);
    const vps = I.S.layouts.find((x) => x.name === 'GEO'), ents = T.structure(I.d);
    void ents; void vps;
    assert.ok(I.layouts.includes('GEO') && I.layouts.includes('KEYMAP'), I.layouts.join(', '));
    // the style G-ESAA TEXT: the client's font
    const font = { a: 'romans.shx', b: 'arialn.ttf', c: 'simplex.shx' }[k], sty = I.S.T.find((r) => r[0][1] === 'STYLE' && get(r, 2) === 'G-ESAA TEXT');
    assert.equal(get(sty, 3), font); assert.equal(!!I.S.T.find((r) => r[0][1] === 'STYLE' && get(r, 2) === 'G-ESAA TEXT BOLD'), k === 'a');
    // the GEO sheet's map viewport: square, at 1:1100 on its paper
    const geo = I.S.layouts.find((x) => x.name === 'GEO'), br = I.S.br.get(geo.brh), gents = get(br, 2) === '*Paper_Space' ? I.S.E.filter((r) => String(get(r, 67) || '').trim() === '1') : I.S.blocks.get(get(br, 2)).ents;
    const vp = gents.filter((r) => r[0][1] === 'VIEWPORT' && +get(r, 69) !== 1).sort((x, y) => +get(y, 40) * +get(y, 41) - +get(x, 40) * +get(x, 41))[0];
    assert.equal(+get(vp, 40), +get(vp, 41), 'square'); assert.ok(Math.abs(+get(vp, 45) - L.sheet.cell) < 1e-6, '1:1100');
    // model space in metres; the client's sample drawing gone
    assert.equal(I.d.headerVar('$INSUNITS')[1].trim(), '6');
    // every plan symbol and every layer the plan writes
    for (const s of G.SYMBOLS) assert.ok(I.S.blocks.has(s.name), `symbol ${s.name}`);
    for (const c of G.LAYER_CLASSES) for (const l of c.layers) assert.ok(I.S.layers.has(l), `layer ${l}`);
    // the structure: clean (the seed, the CEF seed, the made-up plan)
    assert.deepEqual(G.structCheck(m.plan), []); assert.deepEqual(G.structCheck(m.cef), []); assert.deepEqual(G.structCheck(ck.built.text), []);
    // the made-up plan: its fields filled by the export's values (none left), its sheets
    assert.equal((ck.built.text.match(/@@\w+@@/g) || []).length, 0);
    for (const t of ck.tokens) { const v = G.madeUpValues(L)[t]; if (typeof v === 'string' && v) assert.ok(ck.built.text.includes(v), `${t}: ${v}`); }
    assert.ok(ck.built.text.includes('NOVEMBER 20, 2026'), 'the date'); if (ck.tokens.includes('SCALE')) assert.ok(ck.built.text.includes('1 : 1,100 METERS'), 'the scale'); // ((c) has no SCALE field)
    // the CEF seed: one sheet CEF, the active one; its tokens; its drawing area; model space empty
    const C = info(m.cef);
    assert.deepEqual(C.layouts, ['CEF']); assert.equal(get(C.S.br.get(C.S.layouts.find((x) => x.name === 'CEF').brh), 2), '*Paper_Space');
    assert.equal(C.S.E.filter((r) => get(r, 330) === C.S.modelH && String(get(r, 67) || '0').trim() !== '1').length, 0, 'model space empty');
    const cs = G.cefSheet(m.cef);
    assert.ok(cs.vp && cs.vp[2] > cs.vp[0] && cs.vp[3] > cs.vp[1]); assert.equal(cs.unit, k === 'c' ? 'in' : 'mm'); assert.equal(cs.look.sheet.name, 'CEF');
    const toks = new Set(cs.tokens.map((t) => t.token));
    assert.ok(toks.has('LINK') && !toks.has('PROJECT_TYPE'), 'the project\'s name: LINK in the CEF seed'); assert.ok(toks.has('EXPORTED_BY') && toks.has('SHEET_NO') && toks.has('DATE'));
    assert.ok([...toks].every((t) => /^(DWG_NO|SHEET_NO|DATE|ISSUE_NO|SCALE|LINK|SITE_ID|SITE_NAME|SERIAL|SHEET_TITLE|PLAN_KIND|COORDINATES|PREPARED_BY|CHECKED_BY|APPROVED_BY|COMPANY_NAME|PROJECT_TYPE|LOCATION|EXPORTED_BY|CLIENT|PROJECT_CODE)$/.test(t)), [...toks].join(', '));
  });
}

test('make (a): the client\'s symbols under the plan\'s names, their attribute tags with them, sized as the plan\'s; its legend (kept) still drawn as it was', () => {
  const m = made('a'), I = info(m.plan), S = I.S;
  assert.ok(!S.blocks.has('POLE-NEW') && !S.blocks.has('SPLICE-CLOSURE'), 'renamed (not copied)');
  assert.deepEqual(m.look.blocks['P-POLE'], { name: 'POLE-NEW', tags: {} }); assert.deepEqual(m.look.blocks['P-Joint'], { name: 'SPLICE-CLOSURE', tags: { JT_ID: 'CL_TYPE', JOINT: 'CL_ID' } });
  assert.deepEqual(m.look.blocks.loopp, { name: null, tags: {} });
  const tags = S.blocks.get('P-Joint').ents.filter((e) => e[0][1] === 'ATTDEF').map((e) => get(e, 2)).sort(); assert.deepEqual(tags, ['JOINT', 'JT_ID']);
  const bb = T.blockBox(S, 'P-POLE', 0); assert.ok(Math.abs((bb[2] - bb[0]) - 3) < 1e-6, `P-POLE 3 m across: ${bb}`); // (the plan's own size; the client's was 1.8)
  // the legend's inserts of the renamed symbols: as large as before (their scale against the symbol's)
  const leg = S.E.filter((r) => r[0][1] === 'INSERT' && get(r, 2) === 'P-POLE' && get(r, 8) === 'LEGEND')[0]; assert.ok(leg, 'the legend\'s proposed pole');
  assert.ok(Math.abs(+get(leg, 41) * 3 - 3 * 1.8) < 1e-6, `drawn as large as before: scale ${get(leg, 41)}`);
  // its legend sheet kept, renamed so dxftpl.js leaves its tables where they are
  assert.ok(I.layouts.includes('LEGEND (CLIENT)'), I.layouts.join(', '));
  // the title block's attributes: texts of the sheet now; the block keeps no attribute shown
  const geo = S.layouts.find((x) => x.name === 'GEO'), ents = S.blocks.get(get(S.br.get(geo.brh), 2)).ents;
  assert.ok(ents.some((r) => r[0][1] === 'TEXT' && get(r, 1) === '@@PROJECT_TYPE@@'), 'PROJECT on the sheet');
  assert.equal(ents.filter((r) => r[0][1] === 'ATTRIB').length, 0);
});

test('make (b): a value added beside each label that had none; the client\'s NAP drawn in millimetres sized to the plan\'s metres', () => {
  const m = made('b'), I = info(m.plan), S = I.S, geo = S.layouts.find((x) => x.name === 'GEO'), ents = S.blocks.get(get(S.br.get(geo.brh), 2)).ents;
  for (const t of ['@@PREPARED_BY@@', '@@CHECKED_BY@@', '@@APPROVED_BY@@']) { const r = ents.find((e) => e[0][1] === 'TEXT' && get(e, 1) === t); assert.ok(r, t); assert.equal(+get(r, 10), 322); assert.equal(get(r, 7), 'NARROW'); }
  assert.ok(ents.some((e) => e[0][1] === 'TEXT' && get(e, 1) === '@@CLIENT@@'));
  const bb = T.blockBox(S, 'proposed NAP', 0); assert.ok(Math.abs((bb[2] - bb[0]) - 10) < 1e-6, `the NAP 10 m wide: ${bb}`);
});

test('a client block named as one of the builder\'s own (SB, PAGING): renamed "… (CLIENT)", so the plan does not draw it as the company\'s', () => {
  const src = SRC.a.replace(/\nNORTH-A\r?\n/g, '\nSB\n').replace(/\nDEMO-LOGO-A\r?\n/g, '\nPAGING\n'), D = G.digest(src, 'a2.dxf'), m = G.make(src, G.proposal(D), D), I = info(m.plan);
  assert.ok(!I.S.blocks.has('SB') && !I.S.blocks.has('PAGING'), 'not under the builder\'s names'); assert.ok(I.S.blocks.has('SB (CLIENT)') && I.S.blocks.has('PAGING (CLIENT)'));
  assert.ok(m.notes.some((t) => /SB renamed SB \(CLIENT\)/.test(t)), m.notes.join(' | ')); assert.deepEqual(G.structCheck(m.plan), []);
  assert.equal(G.check(m, G.proposal(D)).ok, true);
});
test('a key map copied for a second place keeps the client\'s sheet (its sheet the active one, dxftpl.js copies it with its entities)', () => {
  for (const k of ['b', 'c']) {
    const m = made(k), j = G.madeUpJob(m.look);
    const far = j.pts.filter((p) => p.el === 'Pole').slice(0, 3).map((p, i) => ({ ...p, id: `f${i}`, poleId: `CC-${9100 + i}`, E: p.E + 3000, N: p.N + 500 }));
    j.pts.push(...far); j.spans.push({ ia: 'f0', ib: 'f1', a: [far[0].E, far[0].N], b: [far[1].E, far[1].N], len: 36, cable: 'F12' }, { ia: 'f1', ib: 'f2', a: [far[1].E, far[1].N], b: [far[2].E, far[2].N], len: 36, cable: 'F12' });
    const out = T.build(m.plan, j), I = info(out.text);
    const n = (name) => { const L = I.S.layouts.find((x) => x.name === name), bn = get(I.S.br.get(L.brh), 2); return bn === '*Paper_Space' ? I.S.E.filter((r) => String(get(r, 67) || '').trim() === '1').length : I.S.blocks.get(bn).ents.length; };
    assert.ok(I.layouts.includes('KEYMAP (2)'), `${k}: ${I.layouts.join(', ')}`); assert.equal(n('KEYMAP (2)'), n('KEYMAP'), `${k}: the copy has the sheet`);
    assert.deepEqual(G.structCheck(out.text), []);
  }
});

const PIN_TWO = 'e92f56dfe68f1114017f0ebf5dadceaa3031e7fea45409de219950a0f2f50f43'; // (made with dxftpl.js of beta 7.13, 933ad3b)
/** A made-up plan of two places (a second one 3 km away: a second key map), as the company-like made-up seeds were drawn before (beta 7.13). */
function twoPlaces() {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 6; i++) P.push([E0 + i * 36, N0]);
  const Q = P.slice(0, 3).map(([E, N]) => [E + 3000, N + 500]), mk = (pre, L) => L.map(([E, N], i) => ({ id: `${pre}${i}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const span = (pre, L) => L.slice(1).map((b, i) => ({ ia: `${pre}${i}`, ib: `${pre}${i + 1}`, a: L[i], b, len: 36, lenW: 36, cable: 'F12' }));
  return { pts: [...mk('p', P), ...mk('q', Q)], spans: [...span('p', P), ...span('q', Q)], runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }, { cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: Q }], roads: [], photos: {}, cell: 440, viewH: 440, values: { EXPORTED_BY: 'Exported by DEMO' }, date: new Date('2026-11-20T08:00:00Z') };
}
test('the company-like made-up seeds (no look): drawn as beta 7.13 drew them; the synthesizer finds no look in them', () => {
  for (const f of ['plan-seed-made-up.dxf', 'plan-seed-made-up-square.dxf', 'plan-seed-made-up-blocks.dxf', 'row-table-made-up.dxf']) assert.equal(G.lookOf(fs.readFileSync(path.join(FX, f), 'utf8')), null, f);
  const seed = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8'), out = T.build(seed, twoPlaces());
  assert.ok(out.report.sheets.length >= 2 && /KEYMAP \(2\)/.test(out.text), 'two places: two key maps');
  assert.equal(crypto.createHash('sha256').update(out.text).digest('hex'), PIN_TWO, 'byte for byte as beta 7.13 (dxftpl.js of 933ad3b)');
});

test('every layer dxftpl.js asks a seed for (a made-up plan, Standard and Tidy) is one the synthesizer puts in the seed (LAYER_CLASSES)', () => {
  const m = made('b'), seen = new Set(), has0 = Map.prototype.has;
  Map.prototype.has = function (k) { if (typeof k === 'string' && this.size) { const v = this.values().next().value; if (Array.isArray(v) && Array.isArray(v[0]) && v[0][1] === 'LAYER') seen.add(k); } return has0.call(this, k); }; // (the builder's S.layers.has: which layers it looks for)
  try { for (const over of [{}, { labels: 'tidy' }]) T.build(m.plan, { ...G.madeUpJob(m.look), ...over }); } finally { Map.prototype.has = has0; }
  const mine = new Set(G.LAYER_CLASSES.flatMap((c) => c.layers));
  assert.ok(seen.size > 20, `${seen.size} layers asked for`); assert.deepEqual([...seen].filter((n) => n !== '0' && !mine.has(n)), []);
  const out = T.build(m.plan, G.madeUpJob(m.look)), I = info(out.text), on0 = I.S.E.filter((r) => get(r, 330) === I.S.modelH && String(get(r, 67) || '0').trim() !== '1' && get(r, 8) === '0' && !/^(ATTRIB|SEQEND|VERTEX)$/.test(r[0][1]));
  assert.equal(on0.length, 0, 'nothing of the plan on layer 0');
});
test('paint(): a sheet drawn by dxfpdf.js\'s page operators on a canvas (a stand-in context), its fields marked', () => {
  const PDF = require(path.join(root, 'dxfpdf.js')), page = PDF.layoutPages(SRC.b, { only: ['A3 SHEET'] }).pages[0], calls = { stroke: 0, fill: 0, text: 0, rect: 0 };
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : (...a) => { if (k === 'stroke') calls.stroke++; if (k === 'fill') calls.fill++; if (k === 'fillText') calls.text++; if (k === 'strokeRect') calls.rect++; }), set: (o, k, v) => { o[k] = v; return true; } });
  const sh = dg('b').sheets[0];
  G.paint(ctx, page, 900, 640, { win: G.sheetWindow(SRC.b, 'A3 SHEET'), marks: sh.fields.map((f, i) => ({ box: f.box, n: i + 1 })), zoom: [280, 0, 420, 150] });
  assert.ok(calls.stroke > 20 && calls.text > 10, JSON.stringify(calls)); assert.equal(calls.rect, sh.fields.length);
});
