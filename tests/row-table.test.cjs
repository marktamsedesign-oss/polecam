/* (beta 7.11, ROW table) The ROW AREA COVERAGE table drawn to fit its places. The owner: "davao city takes 2 rows, it must be one davao
   CITY only and the Barangay rows should adjust based on the number of brgy within the city or town."
   Run: node --test tests/row-table.test.cjs (or python3 tests/run_all.py --only row-table).
   - The app's rowCoverage (core.js): the places along the route, grouped by city / municipality in route order, names in capitals; one city
     is written once (cell 1, its barangays down all seven rows, cell 2 empty), several as before; values.ROW_TABLE, the groups as JSON.
   - The plan builder as the app's worker runs it (dxf-worker.js: importScripts('dxftpl.js'), GeDxfTpl.build, the job passed as postMessage
     passes it), on two made-up templates whose ROW table is shaped like the owner's (tests/fixtures/mkseed.py --row: LINEs;
     --row-cells: a closed LWPOLYLINE round each cell): one cell for each city / municipality, as tall as its barangays' rows; a row for each
     barangay, the body's height shared evenly; the lines across the body only where the rows are (the city column only between cities),
     as the template's (layer, colour, line weight); the frame, the column line and the TOTAL row where the template has them; each text in
     its row, no taller than the template's, a city in the middle of its cell; past what fits readably (texts not under 45 % of the
     template's), the last row says "+n MORE". A template drawn otherwise (texts anchored otherwise, row lines past the frame, the column
     line in two pieces, lines with no colour of their own): drawn to fit as well. A template whose table is not drawn as expected: filled
     in its own rows, no city written twice, and the notes say so. Its PDF (dxfpdf.js) prints each name once, a long one on one line.
   Every name and place here is made up. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const C = require(path.join(root, 'core.js'));
const FX = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const SEEDS = { lines: FX('row-table-made-up.dxf'), cells: FX('row-table-made-up-cells.dxf') };
// the made-up table (tests/fixtures/mkseed.py): its sides and column line, its rows' tops and feet, its texts' places
const X0 = 14000, XC = 14340, X1 = 14680, YT = 16600, YTI = 16564, TOP = 16533, RH0 = 15, BOT = TOP - 7 * RH0, YF = BOT - RH0, H0 = 9, BX = XC + 122, TITLE = [(X0 + X1) / 2, (YT + YTI) / 2];

/** The plan builder as the app's worker runs it: dxf-worker.js in a sandbox (its importScripts, its postMessage), the job cloned as postMessage clones it. */
function worker() {
  const sb = { self: {}, console, Math, Date, JSON, Array, Object, Map, Set, Uint8Array, Float32Array, Float64Array, Int32Array, ArrayBuffer, TextEncoder, TextDecoder, Number, String, RegExp, Error, isFinite, isNaN, parseInt, parseFloat };
  let got = null;
  vm.createContext(sb);
  sb.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }));
  sb.self.postMessage = (m) => { got = m; };
  vm.runInContext(fs.readFileSync(path.join(root, 'dxf-worker.js'), 'utf8'), sb, { filename: 'dxf-worker.js' });
  return {
    T: sb.self.GeDxfTpl,
    build(seed, job) { got = null; sb.self.onmessage({ data: structuredClone({ id: 7, seed, job }) }); assert.ok(got && got.ok, got && got.err); return { text: got.out.text, report: JSON.parse(JSON.stringify(got.out.report)) }; },
  };
}
const W = worker();
/** A made-up plan: 4 poles along a made-up street near Davao; values: the template's fields. */
function job(values) {
  const E0 = 787300, N0 = 786100, P = [0, 1, 2, 3].map((i) => [E0 + i * 36, N0]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1, lon: 125.6 + i * 0.0003 }));
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12' })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [], photos: {}, marks: pts.map((p) => p.id), markMode: 'num', cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), values };
}
/** The points along a route in these places ([city, [barangays]]; a city with none: one point in it only), in route order. */
const hitsOf = (spec) => spec.flatMap(([muni, brgys]) => (brgys.length ? brgys.flatMap((b) => [{ muni, brgy: b, prov: 'DEMO PROVINCE' }, { muni, brgy: b, prov: 'DEMO PROVINCE' }]) : [{ muni, brgy: '', prov: 'DEMO PROVINCE' }]));
const brgys = (p, n) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
const rowsOf = (v) => [1, 2, 3, 4, 5, 6, 7].map((k) => v[`ROW_BARANGAY_${k}`]);

/** What the output DXF draws of the table, in the template's place (it moved beside the plan: its title says by how much). */
function tableOf(text) {
  const d = new W.T.Doc(text), S = W.T.structure(d), E = d.sec('ENTITIES').recs, g = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };
  const model = E.filter((r) => g(r, 330) === S.modelH), plainT = (r) => (r.filter((p, i) => i > 0 && p[0] === 3).map((p) => p[1]).join('') + (g(r, 1) || '')).replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
  const title = model.find((r) => r[0][1] === 'MTEXT' && plainT(r) === 'RIGHT OF WAY AREA COVERAGE'); assert.ok(title, 'the table\'s title');
  const dx = +g(title, 10) - TITLE[0], dy = +g(title, 20) - TITLE[1], inT = (x, y) => x > X0 - 12 && x < X1 + 12 && y > YF - 2 && y < YT + 2;
  const segs = [], texts = [];
  for (const r of model) {
    const t = r[0][1], look = { layer: g(r, 8), color: g(r, 62), lw: g(r, 370), type: t, closed: t === 'LWPOLYLINE' && (parseInt(g(r, 70), 10) & 1) === 1 };
    if (t === 'LINE') { const a = [+g(r, 10) - dx, +g(r, 20) - dy], b = [+g(r, 11) - dx, +g(r, 21) - dy]; if (inT(...a) && inT(...b)) segs.push({ a, b, ...look }); }
    if (t === 'LWPOLYLINE') {
      const xs = r.filter((p) => p[0] === 10).map((p) => +p[1] - dx), ys = r.filter((p) => p[0] === 20).map((p) => +p[1] - dy), V = xs.map((x, i) => [x, ys[i]]);
      if (!V.every((p) => inT(...p))) continue; if (look.closed) V.push(V[0]);
      for (let i = 1; i < V.length; i++) segs.push({ a: V[i - 1], b: V[i], ...look });
    }
    if (t === 'MTEXT') { const x = +g(r, 10) - dx, y = +g(r, 20) - dy; if (inT(x, y)) texts.push({ s: plainT(r), x, y, h: +g(r, 40), att: parseInt(g(r, 71) || '1', 10), w: +g(r, 41), layer: g(r, 8), r }); }
  }
  return { segs, texts, all: model.filter((r) => r[0][1] === 'MTEXT').map(plainT) };
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
/** The parts of [a, b] the intervals cover (merged), as a length. */
const coverLen = (iv, a, b) => { let y = a, L = 0; for (const [p, q] of iv.slice().sort((u, v) => u[0] - v[0])) { const s = Math.max(p, y), e = Math.min(q, b); if (e > s) { L += e - s; y = e; } } return L; };
const hAt = (segs, y) => segs.filter((s) => near(s.a[1], y) && near(s.b[1], y)).map((s) => [Math.min(s.a[0], s.b[0]), Math.max(s.a[0], s.b[0])]);
const vAt = (segs, x) => segs.filter((s) => near(s.a[0], x) && near(s.b[0], x)).map((s) => [Math.min(s.a[1], s.b[1]), Math.max(s.a[1], s.b[1])]);

/** Checks a table drawn to fit: cities [[name, rows]], barangay rows (names, top to bottom); look: the template's lines' colour and line
    weight (undefined: none of their own), its barangays' attachment. */
function checkDrawn(tag, out, cities, names, look = { color: '7', lw: '35', att: 1 }) {
  const n = names.length, rowH = (TOP - BOT) / n, rt = out.report.rowTable, { segs, texts, all } = tableOf(out.text);
  assert.equal(rt && rt.redrawn, true, `${tag}: drawn to fit (${JSON.stringify(rt)})`);
  assert.equal(rt.rows, n, `${tag}: a row for each barangay`);
  assert.deepEqual(rt.cities.map((c) => [c.name, c.rows]), cities, `${tag}: a cell for each city / municipality over its own rows`);
  // the lines across the body: the barangay column at every row, the city column between two cities only, nothing else
  const ys = [...new Set(segs.filter((s) => near(s.a[1], s.b[1]) && s.a[1] > BOT + 0.01 && s.a[1] < TOP - 0.01).map((s) => +s.a[1].toFixed(3)))].sort((a, b) => b - a);
  const want = Array.from({ length: n - 1 }, (_, i) => +(TOP - (i + 1) * rowH).toFixed(3)), bounds = new Set(); let k = 0;
  cities.forEach(([, c]) => { k += c; if (k < n) bounds.add(+(TOP - k * rowH).toFixed(3)); });
  assert.deepEqual(ys, want, `${tag}: a line between each two rows and none elsewhere in the body`);
  for (const y of want) {
    const iv = hAt(segs, y);
    assert.ok(near(coverLen(iv, XC, X1), X1 - XC, 0.01), `${tag}: the barangay column's line at ${y}`);
    if (bounds.has(y)) assert.ok(near(coverLen(iv, X0, XC), XC - X0, 0.01), `${tag}: the city column's line between two cities at ${y}`);
    else assert.ok(coverLen(iv, X0 + 0.5, XC - 0.5) < 1e-6, `${tag}: no line across a city's cell at ${y}`);
  }
  for (const s of segs.filter((s2) => near(s2.a[1], s2.b[1]) && s2.a[1] > BOT + 0.01 && s2.a[1] < TOP - 0.01)) { // as the template's lines
    assert.equal(s.layer, 'ROW LINES', `${tag}: layer`); assert.equal(s.color && String(s.color).trim(), look.color, `${tag}: colour`); assert.equal(s.lw && String(s.lw).trim(), look.lw, `${tag}: line weight`);
  }
  // the frame, the column line, the header and the TOTAL row as the template has them
  for (const x of [X0, XC, X1]) assert.ok(near(coverLen(vAt(segs, x), BOT, TOP), TOP - BOT, 0.01), `${tag}: the upright line at ${x} down the body`);
  for (const y of [YT, YTI, TOP, BOT, YF]) assert.ok(near(coverLen(hAt(segs, y), X0, X1), X1 - X0, 0.01), `${tag}: the line across the table at ${y}`);
  assert.ok(near(coverLen(vAt(segs, XC), YF, YTI), YTI - YF, 0.01), `${tag}: the column line from the header to the foot`);
  assert.ok(!segs.some((s) => s.closed && !(s.a[1] <= BOT + 0.01 && s.b[1] <= BOT + 0.01) && !(s.a[1] >= TOP - 0.01 && s.b[1] >= TOP - 0.01) && near(s.a[1], s.b[1])), `${tag}: no closed cell left across the body`);
  // the barangays: one in each row, in route order, as the template's (its place in the row, no taller than its height)
  const bt = texts.filter((t) => near(t.x, BX, 0.01) && t.y < TOP + 0.01 && t.y > BOT).sort((a, b) => b.y - a.y);
  assert.deepEqual(bt.map((t) => t.s), names, `${tag}: the barangays, a row each, in order`);
  bt.forEach((t, i) => {
    const r1 = TOP - i * rowH, r0 = r1 - rowH, c = t.y - (t.att <= 3 ? t.h / 2 : t.att <= 6 ? 0 : -t.h / 2); // (its middle as drawn)
    assert.equal(t.att, look.att, `${tag}: anchored as the template's`);
    assert.ok(c + t.h / 2 <= r1 + 1e-6 && c - t.h / 2 >= r0 - 1e-6 && near(c, (r0 + r1) / 2, 0.05 * rowH), `${tag}: ${t.s} in its row (${t.y}, ${t.h}, row ${r0}–${r1})`);
    assert.ok(t.h <= H0 + 1e-9 && t.h >= H0 * 0.45 - 1e-9, `${tag}: ${t.s}: no taller than the template's, not under 45 % of it (${t.h})`);
    if (t.s.length <= 20) assert.ok(near(t.h, Math.min(H0, H0 * rowH / RH0), 1e-3), `${tag}: ${t.s}: as tall as the template's for its row (${t.h})`);
  });
  // the cities: one text each, in the middle of its cell
  const mt = texts.filter((t) => t.x < XC && t.y < TOP + 0.01 && t.y > BOT).sort((a, b) => b.y - a.y); let i0 = 0;
  assert.deepEqual(mt.map((t) => t.s), cities.map(([c]) => c), `${tag}: one text for each city / municipality`);
  mt.forEach((t, j) => { const c = cities[j][1], yc = TOP - (i0 + c / 2) * rowH; i0 += c; assert.ok(t.att === 5 && near(t.x, (X0 + XC) / 2) && near(t.y, yc), `${tag}: ${t.s} in the middle of its cell (${t.x}, ${t.y}; ${yc})`); assert.ok(t.h <= H0 + 1e-9, `${tag}: ${t.s} no taller than the template's`); });
  for (const [c] of cities) if (c && !/MORE/.test(c)) assert.equal(all.filter((s) => s === c).length, 1, `${tag}: ${c} written once`);
  // the totals as before
  assert.ok(all.includes(`TOTAL - ${out.values.ROW_MUNICIPALITIES}`) && all.includes(`TOTAL - ${out.values.ROW_BARANGAYS}`), `${tag}: the totals`);
  return { segs, texts };
}
/** Builds the table of these places on a made-up template (lines or cells, or a template's text given). */
function built(spec, seed) {
  const rc = C.rowCoverage(hitsOf(spec)), out = W.build(SEEDS[seed] || seed, job(rc.values));
  return { ...out, values: rc.values, groups: rc.groups };
}

test('rowCoverage: the places along the route, grouped by city / municipality; one city written once; values.ROW_TABLE', () => {
  const one = (n) => C.rowCoverage(hitsOf([['Demo City', brgys('Demo Brgy', n)]])).values;
  for (const n of [1, 4, 5, 7]) {
    const v = one(n);
    assert.equal(v.ROW_MUNICIPALITY_1, 'DEMO CITY', `1 × ${n}: the city in cell 1, in capitals`);
    assert.equal(v.ROW_MUNICIPALITY_2, '', `1 × ${n}: cell 2 empty (the owner's "davao city takes 2 rows")`);
    assert.deepEqual(rowsOf(v), [...brgys('DEMO BRGY', n), ...Array(7 - n).fill('')], `1 × ${n}: its barangays down the seven rows`);
    assert.equal(v.ROW_MUNICIPALITIES, '1'); assert.equal(v.ROW_BARANGAYS, String(n));
    assert.deepEqual(JSON.parse(v.ROW_TABLE), [{ muni: 'DEMO CITY', brgys: brgys('DEMO BRGY', n) }], `1 × ${n}: ROW_TABLE`);
  }
  const v12 = one(12);
  assert.equal(v12.ROW_MUNICIPALITY_2, '', '1 × 12: cell 2 empty');
  assert.deepEqual(rowsOf(v12), [...brgys('DEMO BRGY', 6), '+6 MORE'], '1 × 12: six barangays and +6 MORE in the template\'s rows');
  assert.equal(v12.ROW_BARANGAYS, '12'); assert.equal(JSON.parse(v12.ROW_TABLE)[0].brgys.length, 12, '1 × 12: all twelve in ROW_TABLE');
  const v2 = C.rowCoverage(hitsOf([['Demo City', brgys('Demo Brgy', 3)], ['Demo Town', brgys('Demo Town Brgy', 2)]])).values;
  assert.deepEqual([v2.ROW_MUNICIPALITY_1, v2.ROW_MUNICIPALITY_2], ['DEMO CITY', 'DEMO TOWN'], '2 cities: one in each cell (as before)');
  assert.deepEqual(rowsOf(v2), ['DEMO BRGY 1', 'DEMO BRGY 2', 'DEMO BRGY 3', '', 'DEMO TOWN BRGY 1', 'DEMO TOWN BRGY 2', ''], '2 cities: each its rows (as before)');
  assert.equal(v2.ROW_MUNICIPALITIES, '2'); assert.equal(v2.ROW_BARANGAYS, '5');
  assert.deepEqual(JSON.parse(v2.ROW_TABLE), [{ muni: 'DEMO CITY', brgys: brgys('DEMO BRGY', 3) }, { muni: 'DEMO TOWN', brgys: brgys('DEMO TOWN BRGY', 2) }]);
  const v3 = C.rowCoverage(hitsOf([['Demo City', brgys('Demo Brgy', 5)], ['Demo Town', brgys('Demo Town Brgy', 2)], ['Demo Village', brgys('Demo Village Brgy', 2)]])).values;
  assert.deepEqual([v3.ROW_MUNICIPALITY_1, v3.ROW_MUNICIPALITY_2], ['DEMO CITY', 'DEMO TOWN +1 MORE'], '3 cities: the third as +1 MORE (as before)');
  assert.deepEqual(rowsOf(v3), ['DEMO BRGY 1', 'DEMO BRGY 2', 'DEMO BRGY 3', '+2 MORE', 'DEMO TOWN BRGY 1', 'DEMO TOWN BRGY 2', '+2 MORE'], '3 cities: as before');
  assert.equal(JSON.parse(v3.ROW_TABLE).length, 3, '3 cities: all three in ROW_TABLE');
  // points in no barangay (and in none at all), a barangay with no city, a barangay passed twice: grouped as before
  const g = C.rowCoverage([{ muni: 'Demo City', brgy: '' }, { muni: '', brgy: '' }, { muni: 'Demo City', brgy: 'Demo Brgy 1' }, { muni: '', brgy: 'Demo Lone Brgy' }, { muni: 'Demo City', brgy: 'Demo Brgy 1' }, { muni: 'Demo City', brgy: 'Demo Brgy 2' }]);
  assert.deepEqual(g.groups.map((x) => [x.muni, x.brgys]), [['Demo City', ['Demo Brgy 1', 'Demo Brgy 2']], ['', ['Demo Lone Brgy']]], 'a point in no barangay adds none; one in nothing is left out');
  assert.deepEqual(JSON.parse(g.values.ROW_TABLE), [{ muni: 'DEMO CITY', brgys: ['DEMO BRGY 1', 'DEMO BRGY 2'] }, { muni: '', brgys: ['DEMO LONE BRGY'] }]);
  assert.equal(g.values.ROW_MUNICIPALITIES, '1', 'a barangay with no city counts no city'); assert.equal(g.values.ROW_BARANGAYS, '3');
  const g0 = C.rowCoverage([{ muni: 'Demo City', brgy: '' }]).values;
  assert.deepEqual([g0.ROW_MUNICIPALITY_1, g0.ROW_MUNICIPALITY_2, ...rowsOf(g0)], ['DEMO CITY', '', '', '', '', '', '', '', ''], 'a city with no barangay known: in cell 1 only');
  assert.deepEqual(JSON.parse(g0.ROW_TABLE), [{ muni: 'DEMO CITY', brgys: [] }]);
  const none = C.rowCoverage([{ muni: '', brgy: '' }]).values;
  assert.equal(none.ROW_TABLE, undefined, 'no place: no ROW_TABLE'); assert.ok(Object.entries(none).every(([, x]) => x === ''), 'no place: every cell empty');
});

for (const seed of ['lines', 'cells']) {
  test(`the table drawn to fit its places (${seed === 'lines' ? 'drawn with LINEs' : 'drawn as closed LWPOLYLINE cells'}), through the app's worker`, () => {
    // the owner's case: one city, five barangays: one cell over five rows
    const own = built([['Demo City', ['Demo Brgy 1 (Pob.)', 'Demo Brgy 2', 'Demo Brgy 3', 'Demo Brgy 14-B (Pob.)', 'Demo Brgy Long Made-Up Name Sr.']]], seed);
    checkDrawn(`${seed} 1 × 5`, own, [['DEMO CITY', 5]], ['DEMO BRGY 1 (POB.)', 'DEMO BRGY 2', 'DEMO BRGY 3', 'DEMO BRGY 14-B (POB.)', 'DEMO BRGY LONG MADE-UP NAME SR.']);
    assert.deepEqual(own.report.blanks.filter((k) => /^ROW_/.test(k)), [], 'the README lists no cell of the table as left blank');
    assert.ok(!own.report.notes.some((x) => /ROW AREA/.test(x)), 'no note');
    for (const n of [1, 4, 7]) checkDrawn(`${seed} 1 × ${n}`, built([['Demo City', brgys('Demo Brgy', n)]], seed), [['DEMO CITY', n]], brgys('DEMO BRGY', n));
    const t12 = checkDrawn(`${seed} 1 × 12`, built([['Demo City', brgys('Demo Brgy', 12)]], seed), [['DEMO CITY', 12]], brgys('DEMO BRGY', 12));
    assert.ok(t12.texts.filter((t) => near(t.x, BX, 0.01)).every((t) => near(t.h, H0 * 105 / 12 / RH0, 1e-3)), '1 × 12: the texts as much smaller as the rows');
    checkDrawn(`${seed} 2 cities`, built([['Demo City', brgys('Demo Brgy', 3)], ['Demo Town', brgys('Demo Town Brgy', 2)]], seed), [['DEMO CITY', 3], ['DEMO TOWN', 2]], [...brgys('DEMO BRGY', 3), ...brgys('DEMO TOWN BRGY', 2)]);
    // three cities, one with no barangay known (a row of its own, empty), one with a long name
    checkDrawn(`${seed} 3 cities`, built([['Demo City', brgys('Demo Brgy', 2)], ['Demo Town', []], ['Island Garden Demo City of Made-Up Place', brgys('Demo Island Brgy', 4)]], seed),
      [['DEMO CITY', 2], ['DEMO TOWN', 1], ['ISLAND GARDEN DEMO CITY OF MADE-UP PLACE', 4]], [...brgys('DEMO BRGY', 2), '', ...brgys('DEMO ISLAND BRGY', 4)]); // (its empty row's text there to fill in CAD)
  });
  test(`more barangays than fit readably: the last row says +n MORE (${seed})`, () => {
    // 15 rows at most (the texts not under 45 % of the template's): 20 barangays of one city: 14 and "+6 MORE"
    const o20 = built([['Demo City', brgys('Demo Brgy', 20)]], seed);
    checkDrawn(`${seed} 1 × 20`, o20, [['DEMO CITY', 15]], [...brgys('DEMO BRGY', 14), '+6 MORE']);
    assert.equal(o20.report.rowTable.more, 6); assert.equal(o20.values.ROW_BARANGAYS, '20', 'the total counts them all');
    // four cities, 21 barangays: the 15th row the third city's, with the fourth as +1 MORE, and its barangays and the fourth's as +7 MORE
    const o4 = built([['Demo City', brgys('Demo Brgy', 8)], ['Demo Town', brgys('Demo Town Brgy', 6)], ['Demo Village', brgys('Demo Village Brgy', 5)], ['Demo Hamlet', brgys('Demo Hamlet Brgy', 2)]], seed);
    checkDrawn(`${seed} 4 cities`, o4, [['DEMO CITY', 8], ['DEMO TOWN', 6], ['DEMO VILLAGE +1 MORE', 1]], [...brgys('DEMO BRGY', 8), ...brgys('DEMO TOWN BRGY', 6), '+7 MORE']);
    assert.equal(o4.values.ROW_MUNICIPALITIES, '4'); assert.equal(o4.values.ROW_BARANGAYS, '21');
  });
}

test('a template drawn otherwise: texts anchored otherwise, row lines past the frame, the column line in two pieces, lines with no colour of their own', () => {
  const d = new W.T.Doc(SEEDS.lines), E = d.sec('ENTITIES').recs, g = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; }, set = (r, c, v) => { const p = r.find((q, i) => i > 0 && q[0] === c); p[1] = String(v); };
  const txt = (r) => r.filter((p, i) => i > 0 && (p[0] === 1 || p[0] === 3)).map((p) => p[1]).join('');
  for (const r of E) {
    if (r[0][1] === 'MTEXT' && /ROW_BARANGAY_\d/.test(txt(r))) { set(r, 71, 4); set(r, 20, +g(r, 20) - H0 / 2); } // a barangay: middle left, in its row's middle
    if (r[0][1] === 'MTEXT' && /ROW_MUNICIPALITY_\d/.test(txt(r))) { set(r, 71, 2); set(r, 10, (X0 + XC) / 2); r.forEach((p) => { if (p[0] === 1) p[1] = p[1].replace('\\pxqc;', ''); }); } // a city: top centre
    if (r[0][1] === 'LINE' && +g(r, 20) === +g(r, 21) && +g(r, 20) < TOP && +g(r, 20) > BOT) { set(r, 10, Math.min(+g(r, 10), +g(r, 11)) - 5); set(r, 11, Math.max(+g(r, 10), +g(r, 11)) + 5); } // 5 past the frame
  }
  const col = E.find((r) => r[0][1] === 'LINE' && +g(r, 10) === XC && +g(r, 11) === XC), c2 = col.map((p) => [p[0], p[1]]); c2.find((p) => p[0] === 5)[1] = d.newHandle(); set(col, 21, TOP); set(c2, 20, TOP); E.push(c2);
  for (const r of E) if (r[0][1] === 'LINE') for (let i = r.length - 1; i > 0; i--) if (r[i][0] === 62 || r[i][0] === 370) r.splice(i, 1);
  const seed = d.text(), look = { color: undefined, lw: undefined, att: 4 };
  checkDrawn('otherwise 1 × 5', built([['Demo City', brgys('Demo Brgy', 5)]], seed), [['DEMO CITY', 5]], brgys('DEMO BRGY', 5), look);
  checkDrawn('otherwise 2 cities', built([['Demo City', brgys('Demo Brgy', 2)], ['Demo Town', brgys('Demo Town Brgy', 4)]], seed), [['DEMO CITY', 2], ['DEMO TOWN', 4]], [...brgys('DEMO BRGY', 2), ...brgys('DEMO TOWN BRGY', 4)], look);
  checkDrawn('otherwise 1 × 12', built([['Demo City', brgys('Demo Brgy', 12)]], seed), [['DEMO CITY', 12]], brgys('DEMO BRGY', 12), look);
});

test('a template whose table is not drawn as expected: filled in its own rows, no city written twice, said in the notes', () => {
  // another template: the made-up table without its column line (its two columns cannot be told apart), or with a slanted line across it
  const d = new W.T.Doc(SEEDS.lines), E = d.sec('ENTITIES').recs, g = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };
  const k = E.findIndex((r) => r[0][1] === 'LINE' && +g(r, 10) === XC && +g(r, 11) === XC); assert.ok(k >= 0, 'the column line'); E.splice(k, 1);
  const nl = SEEDS.lines.includes('\r\n') ? '\r\n' : '\n', mH = W.T.structure(new W.T.Doc(SEEDS.lines)).modelH;
  const slant = [0, 'LINE', 5, 'FFFF0', 330, mH, 100, 'AcDbEntity', 8, 'ROW LINES', 100, 'AcDbLine', 10, XC, 20, BOT, 30, 0, 11, X1, 21, TOP, 31, 0].map((v, i) => (i % 2 ? String(v) : String(v).padStart(3))).join(nl);
  const noColumn = d.text(), slanted = SEEDS.lines.replace(/\r?\n  0\r?\nENDSEC\r?\n  0\r?\nSECTION\r?\n  2\r?\nOBJECTS/, (m) => `${nl}${slant}${m}`);
  assert.notEqual(slanted, SEEDS.lines, 'the slanted line added');
  for (const [tag, seed] of [['no column line', noColumn], ['a slanted line', slanted]]) {
    for (const [what, spec, cells, rows] of [
      ['1 × 5', [['Demo City', brgys('Demo Brgy', 5)]], ['DEMO CITY', ''], [...brgys('DEMO BRGY', 5), '', '']],
      ['1 × 12', [['Demo City', brgys('Demo Brgy', 12)]], ['DEMO CITY', ''], [...brgys('DEMO BRGY', 6), '+6 MORE']],
      ['2 cities', [['Demo City', brgys('Demo Brgy', 2)], ['Demo Town', brgys('Demo Town Brgy', 1)]], ['DEMO CITY', 'DEMO TOWN'], ['DEMO BRGY 1', 'DEMO BRGY 2', '', '', 'DEMO TOWN BRGY 1', '', '']],
    ]) {
      const o = built(spec, seed), { texts, all, segs } = tableOf(o.text);
      assert.equal(o.report.rowTable && o.report.rowTable.redrawn, false, `${tag}, ${what}: not drawn to fit`);
      assert.ok(o.report.notes.some((x) => /^ROW AREA COVERAGE: filled in the template's own rows, not drawn to fit/.test(x)), `${tag}, ${what}: the notes say so (${o.report.notes})`);
      for (const c of cells.filter(Boolean)) assert.equal(all.filter((s) => s === c).length, 1, `${tag}, ${what}: ${c} written once`);
      const at = (y) => (texts.find((t) => near(t.x, BX, 0.01) && near(t.y, y)) || {}).s;
      assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => at(TOP - i * RH0 - 3)), rows, `${tag}, ${what}: the barangays down the template's rows`);
      const ys = [...new Set(segs.filter((s) => near(s.a[1], s.b[1]) && s.a[1] > BOT + 0.01 && s.a[1] < TOP - 0.01).map((s) => +s.a[1].toFixed(3)))].sort((a, b) => b - a);
      assert.deepEqual(ys, [1, 2, 3, 4, 5, 6].map((i) => TOP - i * RH0), `${tag}, ${what}: the template's rows kept`);
    }
  }
});

test('no barangay known, no places, or none given: the template\'s rows as they are', () => {
  const o0 = built([['Demo City', []]], 'lines'), t0 = tableOf(o0.text);
  assert.equal(o0.report.rowTable.redrawn, false, 'a city with no barangay known: the template\'s seven rows kept to fill in');
  assert.ok(!o0.report.notes.some((x) => /ROW AREA/.test(x)), 'no note (nothing went wrong)');
  assert.equal(t0.all.filter((s) => s === 'DEMO CITY').length, 1, 'the city written once');
  assert.ok(!o0.report.blanks.includes('ROW_MUNICIPALITY_2') && o0.report.blanks.includes('ROW_BARANGAY_1'), 'the README: the barangays left blank (not known), not the second city cell');
  const base = W.build(SEEDS.lines, job({})), old = W.build(SEEDS.lines, job({ ROW_MUNICIPALITY_1: 'DEMO CITY', ROW_BARANGAY_1: 'DEMO BRGY 1', ROW_MUNICIPALITIES: '1', ROW_BARANGAYS: '1' }));
  for (const [tag, o] of [['no places', base], ['values without ROW_TABLE (as before)', old]]) {
    assert.equal(o.report.rowTable, undefined, `${tag}: nothing drawn to fit`);
    const ys = [...new Set(tableOf(o.text).segs.filter((s) => near(s.a[1], s.b[1]) && s.a[1] > BOT + 0.01 && s.a[1] < TOP - 0.01).map((s) => +s.a[1].toFixed(3)))].sort((a, b) => b - a);
    assert.deepEqual(ys, [1, 2, 3, 4, 5, 6].map((i) => TOP - i * RH0), `${tag}: the template's rows`);
  }
  assert.ok(base.report.blanks.includes('ROW_MUNICIPALITY_1') && base.report.blanks.includes('ROW_BARANGAY_7'), 'no places: the README lists the table\'s cells as left blank, as before');
  // the made-up plan template with no ROW table: ROW_TABLE given changes nothing
  const plain = FX('plan-seed-made-up.dxf'), a = W.build(plain, job({})), b = W.build(plain, job(C.rowCoverage(hitsOf([['Demo City', brgys('Demo Brgy', 5)]])).values));
  assert.equal(b.report.rowTable, undefined); assert.ok(!b.report.notes.some((x) => /ROW AREA/.test(x)), 'no ROW table: no note');
  assert.equal(a.text, b.text, 'no ROW table: the same DXF');
});

test('the PDF of the sheets (dxfpdf.js) prints the table: each name once and on one line, on the ROW AREA COVERAGE sheet', async () => {
  const P = require(path.join(root, 'dxfpdf.js')), d = new W.T.Doc(SEEDS.lines), E = d.sec('ENTITIES').recs, g = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };
  E.splice(E.findIndex((r) => r[0][1] === 'LINE' && +g(r, 10) === XC && +g(r, 11) === XC), 1); // (no column line: filled in the template's rows)
  const long = 'DEMO BARANGAY LONG MADE-UP NAME SR.';
  for (const seed of ['lines', 'cells', d.text()]) {
    const o = built([['Demo City', ['Demo Brgy 1 (Pob.)', 'Demo Brgy 2', 'Demo Brgy 3', 'Demo Brgy 4', 'Demo Barangay Long Made-Up Name Sr.']]], seed), pdf = await P.toPdf(o.text, { images: {}, title: 'ROW' }), tag = SEEDS[seed] ? seed : 'not drawn to fit';
    assert.equal(o.report.rowTable.redrawn, !!SEEDS[seed], `${tag}: drawn to fit or not`); assert.ok(pdf.report.sheets.includes('ROW AREA COVERAGE'), `${tag}: the sheet printed`);
    const s = Buffer.from(pdf).toString('latin1'), count = (w) => s.split(`(${w.replace(/[()]/g, (m) => `\\${m}`)})`).length - 1;
    assert.equal(count('DEMO CITY'), 1, `${tag}: DEMO CITY printed once`);
    for (const b of ['DEMO BRGY 1 (POB.)', 'DEMO BRGY 2', 'DEMO BRGY 3', 'DEMO BRGY 4', long, 'TOTAL - 1', 'TOTAL - 5']) assert.equal(count(b), 1, `${tag}: ${b} printed once, on one line`);
  }
});
