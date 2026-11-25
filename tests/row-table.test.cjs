/* (beta 7.11, ROW table) The ROW AREA COVERAGE table drawn to fit its places. The owner: "davao city takes 2 rows, it must be one davao
   CITY only and the Barangay rows should adjust based on the number of brgy within the city or town", then "number of rows of city and
   barangay must adjust based on the number of city and barangay dynamically".
   Run: node --test tests/row-table.test.cjs (or python3 tests/run_all.py --only row-table).
   - The app's rowCoverage (core.js): the places along the route, grouped by city / municipality in route order, names in capitals; one city
     is written once (cell 1, its barangays down all seven rows, cell 2 empty), several as before; values.ROW_TABLE, the groups as JSON.
   - The plan builder as the app's worker runs it (dxf-worker.js: importScripts('dxftpl.js'), GeDxfTpl.build, the job passed as postMessage
     passes it), on two made-up templates whose ROW table is shaped like the owner's (tests/fixtures/mkseed.py --row: LINEs;
     --row-cells: a closed LWPOLYLINE round each cell), a made-up legend beside it on its own sheet: a row for each barangay (a city with
     none: one row), each as tall as the template's rows, one cell for each city / municipality over its own rows; the lines across the
     body only where the rows are (the city column only between cities), as the template's (layer, colour, line weight); the table
     stretched at the body's foot (the TOTAL row and the frame's foot moved, the frame's sides and the column line drawn on down to it,
     nothing left under it); each text in its row at the template's height, a city in the middle of its cell; only past 60 rows does the
     last row say "+n MORE". The ROW sheet's window shows the whole table with a margin (widened down from its top when the table no
     longer fits), and the tables moved beside the plan do not overlap (the legend not in the ROW sheet's window). A template drawn
     otherwise (texts anchored otherwise, row lines past the frame, the column line in two pieces, lines with no colour of their own):
     drawn to fit as well. A template whose table is not drawn as expected: filled in its own rows, no city written twice, and the notes
     say so. Its PDF (dxfpdf.js) prints each name once, a long one on one line, the legend on its own sheet only.
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
const WIN0 = [TITLE[0] - 480 * 400 / 270 / 2, 16504 - 240, TITLE[0] + 480 * 400 / 270 / 2, 16504 + 240]; // (the ROW sheet's window in the template: 480 high, its viewport 400 x 270 mm)

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
const g = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };

/** What the output DXF draws of the table, in the template's place (it moved beside the plan: its title says by how much), and of its
    sheet: the ROW AREA COVERAGE sheet's window (rowWin, in the template's place; rowWinOut, as drawn) and the legend's (legendWinOut,
    legendOut: the legend's texts as drawn). */
function tableOf(text) {
  const d = new W.T.Doc(text), S = W.T.structure(d), E = d.sec('ENTITIES').recs;
  const model = E.filter((r) => g(r, 330) === S.modelH), plainT = (r) => (r.filter((p, i) => i > 0 && p[0] === 3).map((p) => p[1]).join('') + (g(r, 1) || '')).replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
  const title = model.find((r) => r[0][1] === 'MTEXT' && plainT(r) === 'RIGHT OF WAY AREA COVERAGE'); assert.ok(title, 'the table\'s title');
  const dx = +g(title, 10) - TITLE[0], dy = +g(title, 20) - TITLE[1], inT = (x, y) => x > X0 - 12 && x < X1 + 12 && y > YF - 1000 && y < YT + 2;
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
  const winOf = (name) => {
    const L = S.layouts.find((x) => x.name === name), bn = g(S.br.get(L.brh), 2), ents = bn === '*Paper_Space' ? S.E.filter((e) => String(g(e, 67) || '0').trim() === '1') : S.blocks.get(bn).ents;
    const vp = ents.filter((e) => e[0][1] === 'VIEWPORT').slice(1)[0], cx = +g(vp, 17) + +g(vp, 12), cy = +g(vp, 27) + +g(vp, 22), h = +g(vp, 45), w = h * +g(vp, 40) / +g(vp, 41);
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  };
  const rowWinOut = winOf('ROW AREA COVERAGE'), legendWinOut = winOf('LEGENDS');
  const legendOut = model.filter((r) => r[0][1] === 'MTEXT' && /^DEMO (LEGEND|SAMPLE)/.test(plainT(r))).map((r) => [+g(r, 10), +g(r, 20)]);
  return { segs, texts, all: model.filter((r) => r[0][1] === 'MTEXT').map(plainT), rowWin: [rowWinOut[0] - dx, rowWinOut[1] - dy, rowWinOut[2] - dx, rowWinOut[3] - dy], rowWinOut, legendWinOut, legendOut };
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
/** The parts of [a, b] the intervals cover (merged), as a length. */
const coverLen = (iv, a, b) => { let y = a, L = 0; for (const [p, q] of iv.slice().sort((u, v) => u[0] - v[0])) { const s = Math.max(p, y), e = Math.min(q, b); if (e > s) { L += e - s; y = e; } } return L; };
const hAt = (segs, y) => segs.filter((s) => near(s.a[1], y) && near(s.b[1], y)).map((s) => [Math.min(s.a[0], s.b[0]), Math.max(s.a[0], s.b[0])]);
const vAt = (segs, x) => segs.filter((s) => near(s.a[0], x) && near(s.b[0], x)).map((s) => [Math.min(s.a[1], s.b[1]), Math.max(s.a[1], s.b[1])]);
const inBox = (w, p) => p[0] >= w[0] && p[0] <= w[2] && p[1] >= w[1] && p[1] <= w[3];

/** Checks a table drawn to fit: cities [[name, rows]], barangay rows (names, top to bottom); o.look: the template's lines' colour and
    line weight (undefined: none of their own), its barangays' attachment; o.more: the barangays left out past the limit. */
function checkDrawn(tag, out, cities, names, o = {}) {
  const look = o.look || { color: '7', lw: '35', att: 1 }, n = names.length, rowH = RH0, nbot = TOP - n * RH0, dy = nbot - BOT, yf = YF + dy, rt = out.report.rowTable;
  const { segs, texts, all, rowWin, rowWinOut, legendWinOut, legendOut } = tableOf(out.text);
  assert.equal(rt && rt.redrawn, true, `${tag}: drawn to fit (${JSON.stringify(rt)})`);
  assert.equal(rt.rows, n, `${tag}: a row for each barangay`);
  assert.equal(rt.more, o.more || 0, `${tag}: +n MORE only past the limit`);
  if (!o.more) assert.ok(!all.some((s) => /MORE/.test(s)), `${tag}: no +n MORE`);
  assert.deepEqual(rt.cities.map((c) => [c.name, c.rows]), cities, `${tag}: a cell for each city / municipality over its own rows`);
  // the lines across the body: a row the template's height, the barangay column at every row, the city column between two cities only
  const ys = [...new Set(segs.filter((s) => near(s.a[1], s.b[1]) && s.a[1] > nbot + 0.01 && s.a[1] < TOP - 0.01).map((s) => +s.a[1].toFixed(3)))].sort((a, b) => b - a);
  const want = Array.from({ length: n - 1 }, (_, i) => +(TOP - (i + 1) * rowH).toFixed(3)), bounds = new Set(); let k = 0;
  cities.forEach(([, c]) => { k += c; if (k < n) bounds.add(+(TOP - k * rowH).toFixed(3)); });
  assert.deepEqual(ys, want, `${tag}: a line between each two rows, a row as tall as the template's, and none elsewhere in the body`);
  for (const y of want) {
    const iv = hAt(segs, y);
    assert.ok(near(coverLen(iv, XC, X1), X1 - XC, 0.01), `${tag}: the barangay column's line at ${y}`);
    if (bounds.has(y)) assert.ok(near(coverLen(iv, X0, XC), XC - X0, 0.01), `${tag}: the city column's line between two cities at ${y}`);
    else assert.ok(coverLen(iv, X0 + 0.5, XC - 0.5) < 1e-6, `${tag}: no line across a city's cell at ${y}`);
  }
  for (const s of segs.filter((s2) => near(s2.a[1], s2.b[1]) && s2.a[1] > nbot + 0.01 && s2.a[1] < TOP - 0.01)) { // as the template's lines
    assert.equal(s.layer, 'ROW LINES', `${tag}: layer`); assert.equal(s.color && String(s.color).trim(), look.color, `${tag}: colour`); assert.equal(s.lw && String(s.lw).trim(), look.lw, `${tag}: line weight`);
  }
  // the table stretched at the body's foot: its sides and the column line down to its new foot, the TOTAL row there, nothing left under it
  for (const x of [X0, X1]) assert.ok(near(coverLen(vAt(segs, x), yf, YT), YT - yf, 0.01), `${tag}: the frame's side at ${x} from its foot (${yf}) to its top`);
  assert.ok(near(coverLen(vAt(segs, XC), yf, YTI), YTI - yf, 0.01), `${tag}: the column line from the header to the new foot`);
  for (const y of [YT, YTI, TOP, nbot, yf]) assert.ok(near(coverLen(hAt(segs, y), X0, X1), X1 - X0, 0.01), `${tag}: the line across the table at ${y}`);
  assert.ok(!segs.some((s) => near(s.a[1], s.b[1]) && s.a[1] > yf + 0.01 && s.a[1] < nbot - 0.01), `${tag}: nothing across the TOTAL row`);
  assert.ok(segs.every((s) => Math.min(s.a[1], s.b[1]) >= yf - 0.01), `${tag}: nothing of the table left under its foot`);
  assert.ok(!segs.some((s) => s.closed && !(s.a[1] <= nbot + 0.01 && s.b[1] <= nbot + 0.01) && !(s.a[1] >= TOP - 0.01 && s.b[1] >= TOP - 0.01) && near(s.a[1], s.b[1])), `${tag}: no closed cell left across the body`);
  for (const [x, v] of [[X0 + 140, out.values.ROW_MUNICIPALITIES], [XC + 126, out.values.ROW_BARANGAYS]]) {
    const t = texts.find((q) => q.s === `TOTAL - ${v}` && near(q.x, x, 0.01)); assert.ok(t && near(t.y, BOT - 3 + dy), `${tag}: TOTAL - ${v} moved with its row (${t && t.y}, ${BOT - 3 + dy})`);
  }
  // the barangays: one in each row, in route order, as the template's (its place in the row, its height; a long name smaller)
  const bt = texts.filter((t) => near(t.x, BX, 0.01) && t.y < TOP + 0.01 && t.y > nbot).sort((a, b) => b.y - a.y);
  assert.deepEqual(bt.map((t) => t.s), names, `${tag}: the barangays, a row each, in order`);
  bt.forEach((t, i) => {
    const r1 = TOP - i * rowH, r0 = r1 - rowH, c = t.y - (t.att <= 3 ? t.h / 2 : t.att <= 6 ? 0 : -t.h / 2); // (its middle as drawn)
    assert.equal(t.att, look.att, `${tag}: anchored as the template's`);
    assert.ok(c + t.h / 2 <= r1 + 1e-6 && c - t.h / 2 >= r0 - 1e-6 && near(c, (r0 + r1) / 2, 0.05 * rowH), `${tag}: ${t.s} in its row (${t.y}, ${t.h}, row ${r0}–${r1})`);
    assert.ok(t.h <= H0 + 1e-9 && t.h >= H0 * 0.45 - 1e-9, `${tag}: ${t.s}: no taller than the template's, not under 45 % of it (${t.h})`);
    if (t.s.length <= 20) assert.ok(near(t.h, H0, 1e-6), `${tag}: ${t.s}: as tall as the template's (${t.h})`);
  });
  // the cities: one text each, in the middle of its cell
  const mt = texts.filter((t) => t.x < XC && t.y < TOP + 0.01 && t.y > nbot).sort((a, b) => b.y - a.y); let i0 = 0;
  assert.deepEqual(mt.map((t) => t.s), cities.map(([c]) => c), `${tag}: one text for each city / municipality`);
  mt.forEach((t, j) => { const c = cities[j][1], yc = TOP - (i0 + c / 2) * rowH; i0 += c; assert.ok(t.att === 5 && near(t.x, (X0 + XC) / 2) && near(t.y, yc), `${tag}: ${t.s} in the middle of its cell (${t.x}, ${t.y}; ${yc})`); assert.ok(t.h <= H0 + 1e-9, `${tag}: ${t.s} no taller than the template's`); });
  for (const [c] of cities) if (c && !/MORE/.test(c)) assert.equal(all.filter((s) => s === c).length, 1, `${tag}: ${c} written once`);
  // the ROW sheet shows the whole table with a margin under it (its window widened when the table no longer fits the template's), the
  // legend beside it on its own sheet only, the two not over each other
  const wh = rowWin[3] - rowWin[1], zoom = rt.views.find((v) => v.sheet === 'ROW AREA COVERAGE').zoom;
  assert.ok(rowWin[0] <= X0 && rowWin[2] >= X1 && rowWin[3] >= YT && rowWin[1] <= yf - (zoom > 1 ? 0.049 * wh : 0), `${tag}: the ROW sheet's window ${rowWin.map((v) => v.toFixed(1))} shows the whole table (foot ${yf}, zoom ${zoom})`);
  if (yf >= WIN0[1] + 0.05 * (WIN0[3] - WIN0[1])) assert.ok(zoom === 1 && near(rowWin[1], WIN0[1]) && near(rowWin[3], WIN0[3]), `${tag}: the template's window when the table fits it`); else assert.ok(zoom > 1 && near(rowWin[3], WIN0[3]), `${tag}: widened down from its top when it no longer fits`);
  assert.ok(legendOut.length === 6 && !legendOut.some((p) => inBox(rowWinOut, p)) && legendOut.every((p) => inBox(legendWinOut, p)), `${tag}: the legend on its own sheet, not on the ROW sheet`);
  assert.ok(rowWinOut[2] < legendWinOut[0] || legendWinOut[2] < rowWinOut[0], `${tag}: the two sheets' windows side by side, not over each other`);
  // the totals as before
  assert.ok(all.includes(`TOTAL - ${out.values.ROW_MUNICIPALITIES}`) && all.includes(`TOTAL - ${out.values.ROW_BARANGAYS}`), `${tag}: the totals`);
  return { segs, texts, zoom };
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
  const gr = C.rowCoverage([{ muni: 'Demo City', brgy: '' }, { muni: '', brgy: '' }, { muni: 'Demo City', brgy: 'Demo Brgy 1' }, { muni: '', brgy: 'Demo Lone Brgy' }, { muni: 'Demo City', brgy: 'Demo Brgy 1' }, { muni: 'Demo City', brgy: 'Demo Brgy 2' }]);
  assert.deepEqual(gr.groups.map((x) => [x.muni, x.brgys]), [['Demo City', ['Demo Brgy 1', 'Demo Brgy 2']], ['', ['Demo Lone Brgy']]], 'a point in no barangay adds none; one in nothing is left out');
  assert.deepEqual(JSON.parse(gr.values.ROW_TABLE), [{ muni: 'DEMO CITY', brgys: ['DEMO BRGY 1', 'DEMO BRGY 2'] }, { muni: '', brgys: ['DEMO LONE BRGY'] }]);
  assert.equal(gr.values.ROW_MUNICIPALITIES, '1', 'a barangay with no city counts no city'); assert.equal(gr.values.ROW_BARANGAYS, '3');
  const g0 = C.rowCoverage([{ muni: 'Demo City', brgy: '' }]).values;
  assert.deepEqual([g0.ROW_MUNICIPALITY_1, g0.ROW_MUNICIPALITY_2, ...rowsOf(g0)], ['DEMO CITY', '', '', '', '', '', '', '', ''], 'a city with no barangay known: in cell 1 only');
  assert.deepEqual(JSON.parse(g0.ROW_TABLE), [{ muni: 'DEMO CITY', brgys: [] }]);
  const none = C.rowCoverage([{ muni: '', brgy: '' }]).values;
  assert.equal(none.ROW_TABLE, undefined, 'no place: no ROW_TABLE'); assert.ok(Object.entries(none).every(([, x]) => x === ''), 'no place: every cell empty');
});

for (const seed of ['lines', 'cells']) {
  test(`the table drawn to fit its places, a row the template's height each (${seed === 'lines' ? 'drawn with LINEs' : 'drawn as closed LWPOLYLINE cells'}), through the app's worker`, () => {
    // the owner's case: one city, five barangays: one cell over five rows, the table two rows shorter
    const own = built([['Demo City', ['Demo Brgy 1 (Pob.)', 'Demo Brgy 2', 'Demo Brgy 3', 'Demo Brgy 14-B (Pob.)', 'Demo Brgy Long Made-Up Name Sr.']]], seed);
    checkDrawn(`${seed} 1 × 5`, own, [['DEMO CITY', 5]], ['DEMO BRGY 1 (POB.)', 'DEMO BRGY 2', 'DEMO BRGY 3', 'DEMO BRGY 14-B (POB.)', 'DEMO BRGY LONG MADE-UP NAME SR.']);
    assert.equal(own.report.rowTable.grown, -2 * RH0, 'two rows shorter');
    assert.deepEqual(own.report.blanks.filter((k) => /^ROW_/.test(k)), [], 'the README lists no cell of the table as left blank');
    assert.ok(!own.report.notes.some((x) => /ROW AREA/.test(x)), 'no note');
    for (const n of [1, 4, 7]) checkDrawn(`${seed} 1 × ${n}`, built([['Demo City', brgys('Demo Brgy', n)]], seed), [['DEMO CITY', n]], brgys('DEMO BRGY', n));
    checkDrawn(`${seed} 1 × 12`, built([['Demo City', brgys('Demo Brgy', 12)]], seed), [['DEMO CITY', 12]], brgys('DEMO BRGY', 12));
    checkDrawn(`${seed} 2 cities`, built([['Demo City', brgys('Demo Brgy', 3)], ['Demo Town', brgys('Demo Town Brgy', 2)]], seed), [['DEMO CITY', 3], ['DEMO TOWN', 2]], [...brgys('DEMO BRGY', 3), ...brgys('DEMO TOWN BRGY', 2)]);
    // three cities, one with no barangay known (a row of its own, empty: its text there to fill in CAD), one with a long name
    checkDrawn(`${seed} 3 cities`, built([['Demo City', brgys('Demo Brgy', 2)], ['Demo Town', []], ['Island Garden Demo City of Made-Up Place', brgys('Demo Island Brgy', 4)]], seed),
      [['DEMO CITY', 2], ['DEMO TOWN', 1], ['ISLAND GARDEN DEMO CITY OF MADE-UP PLACE', 4]], [...brgys('DEMO BRGY', 2), '', ...brgys('DEMO ISLAND BRGY', 4)]);
  });
  test(`many barangays: as many rows, the table taller and its sheet's window widened to show it all (${seed})`, () => {
    // four cities, 21 barangays: 21 rows (no +n MORE), the table 14 rows taller, the ROW sheet zoomed out, the legend not under it
    const o4 = built([['Demo City', brgys('Demo Brgy', 8)], ['Demo Town', brgys('Demo Town Brgy', 6)], ['Demo Village', brgys('Demo Village Brgy', 5)], ['Demo Hamlet', brgys('Demo Hamlet Brgy', 2)]], seed);
    const c4 = checkDrawn(`${seed} 4 cities`, o4, [['DEMO CITY', 8], ['DEMO TOWN', 6], ['DEMO VILLAGE', 5], ['DEMO HAMLET', 2]], [...brgys('DEMO BRGY', 8), ...brgys('DEMO TOWN BRGY', 6), ...brgys('DEMO VILLAGE BRGY', 5), ...brgys('DEMO HAMLET BRGY', 2)]);
    assert.equal(o4.report.rowTable.grown, 14 * RH0, '14 rows taller'); assert.ok(c4.zoom > 1.1 && c4.zoom < 1.3, `zoomed out a little (${c4.zoom})`);
    assert.equal(o4.values.ROW_MUNICIPALITIES, '4'); assert.equal(o4.values.ROW_BARANGAYS, '21');
    const o40 = built([['Demo City', brgys('Demo Brgy', 40)]], seed), c40 = checkDrawn(`${seed} 1 × 40`, o40, [['DEMO CITY', 40]], brgys('DEMO BRGY', 40));
    assert.ok(c40.zoom > c4.zoom, `1 × 40: zoomed out more (${c40.zoom})`);
    // past the far safety limit (60 rows): the 60th says +n MORE
    const o70 = built([['Demo City', brgys('Demo Brgy', 70)]], seed);
    checkDrawn(`${seed} 1 × 70`, o70, [['DEMO CITY', 60]], [...brgys('DEMO BRGY', 59), '+11 MORE'], { more: 11 });
    assert.equal(o70.values.ROW_BARANGAYS, '70', 'the total counts them all');
  });
}

test('a template drawn otherwise: texts anchored otherwise, row lines past the frame, the column line in two pieces, lines with no colour of their own', () => {
  const d = new W.T.Doc(SEEDS.lines), E = d.sec('ENTITIES').recs, set = (r, c, v) => { const p = r.find((q, i) => i > 0 && q[0] === c); p[1] = String(v); };
  const txt = (r) => r.filter((p, i) => i > 0 && (p[0] === 1 || p[0] === 3)).map((p) => p[1]).join('');
  for (const r of E) {
    if (r[0][1] === 'MTEXT' && /ROW_BARANGAY_\d/.test(txt(r))) { set(r, 71, 4); set(r, 20, +g(r, 20) - H0 / 2); } // a barangay: middle left, in its row's middle
    if (r[0][1] === 'MTEXT' && /ROW_MUNICIPALITY_\d/.test(txt(r))) { set(r, 71, 2); set(r, 10, (X0 + XC) / 2); r.forEach((p) => { if (p[0] === 1) p[1] = p[1].replace('\\pxqc;', ''); }); } // a city: top centre
    if (r[0][1] === 'LINE' && +g(r, 20) === +g(r, 21) && +g(r, 20) < TOP && +g(r, 20) > BOT) { set(r, 10, Math.min(+g(r, 10), +g(r, 11)) - 5); set(r, 11, Math.max(+g(r, 10), +g(r, 11)) + 5); } // 5 past the frame
  }
  const col = E.find((r) => r[0][1] === 'LINE' && +g(r, 10) === XC && +g(r, 11) === XC), c2 = col.map((p) => [p[0], p[1]]); c2.find((p) => p[0] === 5)[1] = d.newHandle(); set(col, 21, TOP); set(c2, 20, TOP); E.push(c2);
  for (const r of E) if (r[0][1] === 'LINE' && g(r, 8) === 'ROW LINES') for (let i = r.length - 1; i > 0; i--) if (r[i][0] === 62 || r[i][0] === 370) r.splice(i, 1);
  const seed = d.text(), look = { color: undefined, lw: undefined, att: 4 };
  checkDrawn('otherwise 1 × 5', built([['Demo City', brgys('Demo Brgy', 5)]], seed), [['DEMO CITY', 5]], brgys('DEMO BRGY', 5), { look });
  checkDrawn('otherwise 2 cities', built([['Demo City', brgys('Demo Brgy', 2)], ['Demo Town', brgys('Demo Town Brgy', 4)]], seed), [['DEMO CITY', 2], ['DEMO TOWN', 4]], [...brgys('DEMO BRGY', 2), ...brgys('DEMO TOWN BRGY', 4)], { look });
  checkDrawn('otherwise 1 × 25', built([['Demo City', brgys('Demo Brgy', 25)]], seed), [['DEMO CITY', 25]], brgys('DEMO BRGY', 25), { look });
});

test('a template whose table is not drawn as expected: filled in its own rows, no city written twice, said in the notes', () => {
  // another template: the made-up table without its column line (its two columns cannot be told apart), or with a slanted line across it
  const d = new W.T.Doc(SEEDS.lines), E = d.sec('ENTITIES').recs;
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
      assert.ok(near(coverLen(hAt(segs, YF), X0, X1), X1 - X0, 0.01) && texts.some((t) => /^TOTAL - /.test(t.s) && near(t.y, BOT - 3)), `${tag}, ${what}: the TOTAL row where the template has it`);
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

test('the PDF of the sheets (dxfpdf.js) prints the table: each name once and on one line, the legend on its own sheet only', async () => {
  const P = require(path.join(root, 'dxfpdf.js')), d = new W.T.Doc(SEEDS.lines), E = d.sec('ENTITIES').recs;
  E.splice(E.findIndex((r) => r[0][1] === 'LINE' && +g(r, 10) === XC && +g(r, 11) === XC), 1); // (no column line: filled in the template's rows)
  const long = 'DEMO BARANGAY LONG MADE-UP NAME SR.', five = [['Demo City', ['Demo Brgy 1 (Pob.)', 'Demo Brgy 2', 'Demo Brgy 3', 'Demo Brgy 4', 'Demo Barangay Long Made-Up Name Sr.']]];
  for (const [tag, seed, spec, names] of [['lines', 'lines', five], ['cells', 'cells', five], ['not drawn to fit', d.text(), five], ['lines 1 × 40', 'lines', [['Demo City', brgys('Demo Brgy', 40)]], brgys('DEMO BRGY', 40)], ['cells 1 × 40', 'cells', [['Demo City', brgys('Demo Brgy', 40)]], brgys('DEMO BRGY', 40)]]) {
    const o = built(spec, seed), pdf = await P.toPdf(o.text, { images: {}, title: 'ROW' });
    assert.equal(o.report.rowTable.redrawn, tag !== 'not drawn to fit', `${tag}: drawn to fit or not`); assert.ok(pdf.report.sheets.includes('ROW AREA COVERAGE') && pdf.report.sheets.includes('LEGENDS'), `${tag}: the sheets printed`);
    const s = Buffer.from(pdf).toString('latin1'), count = (w) => s.split(`(${w.replace(/[()]/g, (m) => `\\${m}`)})`).length - 1;
    assert.equal(count('DEMO CITY'), 1, `${tag}: DEMO CITY printed once`);
    assert.equal(count('DEMO LEGEND'), 1, `${tag}: the legend printed on its own sheet only`);
    for (const b of names || ['DEMO BRGY 1 (POB.)', 'DEMO BRGY 2', 'DEMO BRGY 3', 'DEMO BRGY 4', long]) assert.equal(count(b), 1, `${tag}: ${b} printed once, on one line`);
    for (const b of [`TOTAL - ${o.values.ROW_MUNICIPALITIES}`, `TOTAL - ${o.values.ROW_BARANGAYS}`]) assert.equal(count(b), 1, `${tag}: ${b} printed once`);
  }
});
