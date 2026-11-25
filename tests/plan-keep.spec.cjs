/* (beta 7.10, Plan kept) The plan edited on the Drawing stays as edited, the Drawing is the plan the export makes, and nothing drawn on it is left off the
   printed sheets (the owner, beta 7.9: "the edited drawing of the project was not saved… if i go back to the first project i edit… it regenerate
   the preview with photos and grid and others not the same"; "some photos has no grid box"). Run: node --test tests/plan-keep.spec.cjs (or
   python3 tests/run_all.py --only plan-keep).
   - The builder (dxftpl.js, in Node): job.gridKeep { origin, n } (the grid kept with a plan edited on the Drawing) makes the DXF the grid found
     makes, byte for byte; as the route grows, the sheets kept keep their places and names. A photo placed by hand in a cell no sheet prints:
     that cell becomes a GEO sheet (report.grid.sheets, forPhoto; a GEO layout in the DXF); one across a sheet's edge: report.photoAt[id].cut
     names both sheets, both print. Poles crowded along a sheet's edge (beta 7.9 put some photos wholly in the cell beyond, which no sheet
     printed) and a 300-pole made-up project (Standard and Tidy): every photo and every pole drawn is on a printed sheet. Without photos placed
     by hand, byte for byte as beta 7.9 made them (SHA-256 of beta 7.9's DXF of made-up jobs).
   - The app (a computer, 1280 x 900), OpenStreetMap (Overpass) answered by a made-up road list: the owner's sequence (edit the plan on the
     Drawing, Export the plan: the AutoCAD files and their PDF, another project, back) leaves the preview as it was (its sheets and names, the
     photos' places, its display list's hash), and the export is the preview (its job's roads, pins and kept grid; its sheets; the photos'
     places; the display list of its DXF). The roads are downloaded once, quietly, by the preview, and kept with the project. The pins, the
     kept grid and the roads survive a reload (no download again) and a teammate's update (Sync: the same merge as the team mailbox's). A
     photo dragged into a cell with no sheet makes that sheet print and the Drawing boxes it; one dragged across a sheet's edge is outlined
     and both sheets print; Back to automatic for all takes back the pins and the kept grid. Offline with nothing kept: the preview and the
     export the same (no roads), nothing kept; online again, the roads are got and kept. No page errors.
   Uses an isolated browser profile and a local HTTP server on a free port; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { editOn, chgOf, allAutomatic } = require('./drawing-edit.cjs'); // ((beta 7.14, View / Edit) the Drawing opens in View: Edit on to change the plan)

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED = fs.readFileSync(path.join(FX, 'plan-seed-made-up.dxf'), 'utf8');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const T = require(path.join(root, 'dxftpl.js'));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);

/* ---------- made-up jobs for the builder ---------- */
/** n made-up poles along made-up streets (streets every 120 m east-west, every 180 m north-south), the route snaking along them, a pole
 *  every 28-40 m (o.gap), 6 m off the street; a photo each (every 4th landscape), every 7th pole existing; the same every run. */
function townJob(n, o) {
  o = o || {}; let sd = 7 + n; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const E0 = 787000, N0 = 786000, P = [], roads = [];
  for (let k = 0; k < 9; k++) { roads.push({ cls: 'minor', hw: 'residential', name: `MADE-UP ST ${k + 1}`, pts: [[E0 - 60, N0 + k * 120], [E0 + 1500, N0 + k * 120]] }); roads.push({ cls: k % 3 ? 'minor' : 'major', hw: k % 3 ? 'residential' : 'secondary', name: `SAMPLE AVE ${k + 1}`, pts: [[E0 + k * 180, N0 - 60], [E0 + k * 180, N0 + 1000]] }); }
  let row = 0, x = E0, dir = 1;
  while (P.length < n) { const y = N0 + row * 120 + (rnd() < 0.5 ? 6 : -6); P.push([x, y + (rnd() - 0.5) * 2]); x += dir * ((o.gap || 28) + rnd() * 12); if (x > E0 + 1400 || x < E0) { dir = -dir; x += dir * 30; row++; if (row > 8) row = 0; } }
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: i % 7 === 3 ? 'Existing' : 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => { const L = Math.hypot(b[0] - P[i][0], b[1] - P[i][1]); return { ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: L, lenW: Math.round(L), cable: 'F12' }; }), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads, photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: o.mode || 'photo', cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...(o.tidy ? { labels: 'tidy' } : {}) };
}
/** The first n poles of a job (its spans, marks and photos), as the route was before it grew. */
const firstOf = (j, n) => { const ids = new Set(j.pts.slice(0, n).map((p) => p.id)); return { ...j, pts: j.pts.slice(0, n), spans: j.spans.filter((s) => ids.has(s.ia) && ids.has(s.ib)), marks: j.marks.filter((x) => ids.has(x)), photos: Object.fromEntries(Object.entries(j.photos).filter(([k]) => ids.has(k))), seqOf: Object.fromEntries(Object.entries(j.seqOf).filter(([k]) => ids.has(k))), runs: [{ ...j.runs[0], pts: j.runs[0].pts.slice(0, n) }] }; };
/** 24 made-up poles 8 m apart, 10 m under the top edge of a sheet (the grid set: job.gridOrigin), a 6-lane highway 8 m under them, photos at 48 mm:
 *  the photos have no room left in their own sheet (beta 7.9 put some wholly in the cell above, which no sheet printed). */
function edgeJob() {
  const gox = 786800, goy = 785800, cell = 440, N = goy + cell - 10, E0 = gox + 60, P = [];
  for (let i = 0; i < 24; i++) P.push([E0 + i * 8, N + (i % 2 ? 1.5 : -1.5)]);
  const pts = P.map(([E, N2], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N: N2, lat: 7.1, lon: 125.6 + i * 1e-5 }));
  const photos = {}; pts.forEach((p) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: 600, py: 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 8, lenW: 8, cable: 'F12' })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'major', hw: 'primary', lanes: '6', name: 'MADE-UP HIGHWAY', pts: [[gox - 100, N - 8], [gox + 2 * cell, N - 8]] }], photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'photo', cell, viewH: cell,
    date: new Date('2026-11-20T08:00:00Z'), gridOrigin: [gox, goy], photoStyle: { size: 48 } };
}
/** A photo's frame (photoAt, upright or turned) as [x0, y0, x1, y1]. */
const frameOf = (a) => { const t = (+a.rot || 0) * Math.PI / 180, ex = (Math.abs(Math.cos(t)) * a.w + Math.abs(Math.sin(t)) * a.h) / 2, ey = (Math.abs(Math.sin(t)) * a.w + Math.abs(Math.cos(t)) * a.h) / 2; return [a.x - ex, a.y - ey, a.x + ex, a.y + ey]; };
/** Every part of the box [x0, y0, x1, y1] on a printed sheet (its corners and middle, 5 cm in, each in a sheet's square). */
const onSheets = (b, S) => { const e = 0.05, at = (x, y) => S.some((s) => x >= s.box[0] && x <= s.box[2] && y >= s.box[1] && y <= s.box[3]);
  return [[b[0] + e, b[1] + e], [b[2] - e, b[1] + e], [b[2] - e, b[3] - e], [b[0] + e, b[3] - e], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]].every(([x, y]) => at(x, y)); };
/** Every photo and every pole drawn of a plan on its printed sheets (what is not, said). */
function allOnSheets(out) {
  const S = out.report.grid.sheets, bad = [];
  for (const [id, a] of Object.entries(out.report.photoAt)) if (!onSheets(frameOf(a), S)) bad.push(`photo ${id} (${a.how})`);
  for (const [id, p] of Object.entries(out.report.drawnAt)) if (!onSheets([p[0], p[1], p[0], p[1]], S)) bad.push(`point ${id}`);
  return bad;
}

test('the grid kept (job.gridKeep): the DXF of the grid found, byte for byte; as the route grows, the sheets kept keep their places and names', () => {
  for (const tidy of [0, 1]) {
    const j0 = firstOf(townJob(120, { tidy }), 60), a = T.build(SEED_SQ, j0), G = a.report.grid;
    assert.equal(G.n, tidy ? a.report.tidy.grid.n : 1, 'the split said (1 in Standard)');
    const k = T.build(SEED_SQ, { ...firstOf(townJob(120, { tidy }), 60), gridKeep: { origin: G.geo, n: G.n } });
    assert.ok(k.text === a.text, `${tidy ? 'Tidy' : 'Standard'}: kept, the same DXF`); assert.equal(k.report.grid.kept, true); if (tidy) assert.equal(k.report.tidy.grid.mode, 'kept');
    // the route grows (15 poles more): found again, the grid moves and the sheets' names change; kept, the first sheets stay as they were
    const grown = firstOf(townJob(120, { tidy }), 75), f = T.build(SEED_SQ, grown), g = T.build(SEED_SQ, { ...firstOf(townJob(120, { tidy }), 75), gridKeep: { origin: G.geo, n: G.n } });
    const same = (S1, S2) => S1.every((s) => S2.some((x) => x.name === s.name && x.box.every((v, i) => Math.abs(v - s.box[i]) < 1e-6)));
    assert.equal(same(G.sheets, f.report.grid.sheets), false, 'found again: other sheets');
    assert.deepEqual(g.report.grid.geo, G.geo, 'the grid kept'); assert.equal(g.report.grid.n, G.n, 'at its split');
    assert.ok(same(G.sheets, g.report.grid.sheets), `${tidy ? 'Tidy' : 'Standard'}: every sheet kept, in its place, with its name: ${G.sheets.map((s) => s.name)} / ${g.report.grid.sheets.map((s) => s.name)}`);
  }
});

test('a photo placed by hand in a cell no sheet prints: that cell is a GEO sheet (named, in report.grid.sheets and the DXF); across a sheet\'s edge: cut on both sheets, said', () => {
  for (const tidy of [0, 1]) {
    const j = () => firstOf(townJob(120, { tidy }), 30), a = T.build(SEED_SQ, j()), S0 = a.report.grid.sheets, A = a.report.photoAt.s3;
    // 600 m south of its pole: in no sheet of the plan
    const r = T.build(SEED_SQ, { ...j(), phPin: { s3: [0, -600] } }), S = r.report.grid.sheets, P = r.report.photoAt.s3;
    assert.equal(P.how, 'by hand'); assert.ok(Math.abs(P.y - (P.dp[1] - 600)) < 1e-6, 'where it was put');
    assert.ok(!onSheets(frameOf(P), S0), 'in no sheet of the plan before');
    const add = S.filter((s) => s.forPhoto); assert.ok(add.length >= 1, `a sheet added: ${S.map((s) => s.name)}`);
    assert.ok(onSheets(frameOf(P), S), 'its frame on a printed sheet');
    assert.ok(P.line && P.line.every((q) => onSheets([q[0], q[1], q[0], q[1]], S)), 'its line too');
    assert.deepEqual(S.map((s) => `${s.sheet}: ${s.name}`), r.report.sheets, 'the sheets said as report.sheets');
    assert.ok(S.length > S0.length && S0.every((s) => S.some((x) => x.name === s.name)), 'the others kept, with their names');
    assert.ok(new RegExp(`\\n  2\\n${add[0].sheet.replace(/[()]/g, '\\$&')}\\r?\\n`).test(r.text) || r.text.includes(add[0].sheet), 'its GEO layout in the DXF');
    assert.ok(r.report.notes.some((t) => /^GEO sheets added so that every photo and pole drawn prints .*: /.test(t)), JSON.stringify(r.report.notes));
    assert.deepEqual(allOnSheets(r), [], 'everything drawn on a printed sheet');
    // across the next grid line east of its pole: on two sheets, both printed, said
    const G = a.report.grid, xg = G.geo[0] + G.cell * Math.ceil((A.dp[0] - G.geo[0]) / G.cell), c = T.build(SEED_SQ, { ...j(), phPin: { s3: [+(xg - A.dp[0]).toFixed(2), 0] } }), C = c.report.photoAt.s3;
    assert.ok(Array.isArray(C.cut) && C.cut.length === 2, `cut on two sheets: ${JSON.stringify(C.cut)}`);
    for (const nm of C.cut) assert.ok(c.report.grid.sheets.some((s) => s.name === nm), `${nm} prints`);
    assert.ok(c.report.notes.some((t) => /^Photos placed by hand across a sheet's edge/.test(t)), JSON.stringify(c.report.notes));
    assert.equal(T.build(SEED_SQ, j()).report.photoAt.s3.cut, undefined, 'none cut without the pin');
  }
});

test('no automatic photo off the printed sheets: poles crowded along a sheet\'s edge (beta 7.9: photos in the cell beyond, on no sheet), a 300-pole made-up project (Standard, Tidy)', () => {
  const e = T.build(SEED_SQ, edgeJob());
  assert.deepEqual(allOnSheets(e), [], 'every photo and pole on a printed sheet');
  assert.ok(e.report.grid.sheets.length === 2 && e.report.grid.sheets[1].forPhoto, `the cell above printed: ${e.report.sheets}`);
  assert.equal(sha(e.text) === '58684b9d03e8e5c5', false, 'not as beta 7.9 (its photos on no sheet)');
  for (const tidy of [0, 1]) {
    const out = T.build(SEED_SQ, townJob(300, { tidy }));
    assert.equal(Object.keys(out.report.photoAt).length, 300, 'every photo placed');
    assert.deepEqual(allOnSheets(out), [], `${tidy ? 'Tidy' : 'Standard'}: every photo and pole on a printed sheet`);
  }
});

test('without photos placed by hand: byte for byte as beta 7.9 (made-up plans of 120 and 300 poles, Standard, Tidy, numbers, both)', () => {
  // [template, plan, SHA-256 (first 16) of beta 7.9's DXF]: dxftpl.js of beta 7.9 made them
  const WANT = [['square', 'town 120', 'bec6326e264b5da2'], ['square', 'town 120 tidy', '1eee39a0a67e2191'], ['made-up', 'town 120 numbers', '7c12c234566e4bb8'],
    ['made-up', 'town 120 both, tidy', '18dbbbe54957e013'], ['square', 'town 300', 'ce81c07cfff0f9da']];
  const J = { 'town 120': () => townJob(120), 'town 120 tidy': () => townJob(120, { tidy: 1 }), 'town 120 numbers': () => townJob(120, { mode: 'num' }), 'town 120 both, tidy': () => townJob(120, { mode: 'both', tidy: 1 }), 'town 300': () => townJob(300) };
  const got = WANT.map(([sn, vn]) => [sn, vn, sha(T.build(sn === 'square' ? SEED_SQ : SEED, J[vn]()).text)]);
  assert.deepEqual(got, WANT);
});

/* ---------- the app, in a browser ---------- */
const A = 'DEMO PLAN A', B = 'DEMO PLAN B', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, D = 0.00036; // project A: 12 poles about 40 m apart, 5 east then 7 north (an L); B: 5 poles 2 km away
const PA = []; for (let i = 0; i < 12; i++) PA.push([`a${i + 1}`, `CC-${9101 + i}`, LA0 + (i > 4 ? (i - 4) * D : 0), LO0 + Math.min(i, 4) * D]);
const PB = []; for (let i = 0; i < 5; i++) PB.push([`b${i + 1}`, `CC-${9301 + i}`, 7.1230, 125.6200 + i * D]);
const rec = (proj) => ([id, poleId, lat, lon], i) => ({ id, project: proj, element: 'Pole', poleId, poleType: 'Concrete', status: i % 5 === 2 ? 'Existing' : 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:${String(i).padStart(2, '0')}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } });
const RECS = PA.map(rec(A)).concat(PB.map(rec(B)));
const linksOf = (P) => P.slice(1).map((p, i) => [P[i][0], p[0], 'F12']);
// OpenStreetMap as Overpass answers it, made up: a street 9 m south of A's first poles, an avenue 9 m east of its others, a chapel; a road along B
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * D + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * D + 0.00008], [LA0 + 7 * D + 0.0006, LO0 + 4 * D + 0.00008]]),
  way(3, 'DEMO RD', 'residential', [[7.1230 - 0.00008, 125.6194], [7.1230 - 0.00008, 125.6200 + 5 * D]]),
  { type: 'node', id: 9, lat: LA0 + 0.0002, lon: LO0 + 2 * D, tags: { name: 'MADE-UP CHAPEL', amenity: 'place_of_worship' } }] };

let server, browser, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if (rel === '/org.json') { res.writeHead(404).end(); return; } // (the tests make their own company list, as run_all.py's server)
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fsp.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

/** A new phone (a computer, 1280 x 900) with projects A and B, a made-up photo for every pole, the made-up template; Overpass answered by
 *  OVERPASS (each query's area kept in calls; o.net() false: no answer). The builder on the page for the exports: each export's job and out kept. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  const calls = [], answer = JSON.stringify(o.overpass || OVERPASS);
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://overpass-api.de/')) { const q = decodeURIComponent(String(r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')), m = /way\["highway"\]\(([^)]*)\)/.exec(q); calls.push(m ? m[1] : q.slice(0, 80));
      if (o.net && !o.net()) return r.abort(); return r.fulfill({ status: 200, contentType: 'application/json', body: answer }); }
    return r.abort(); });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  const recs = o.recs || RECS;
  await page.evaluate(async ({ RECS, A, B, USER, LA, LB, lab, pdf }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const meta = (l) => ({ mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: l, linksAt: '2026-11-01T08:00:00.000Z', cables24: true });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [A, B], project: A, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: pdf, dxfCef: false, planOut: 'files', dxfLabels: lab }, meta: { [A]: meta(LA), [B]: meta(LB) } }));
  }, { RECS: recs, A, B, USER, LA: o.links || linksOf(PA), LB: linksOf(PB), lab: o.tidy ? 'tidy' : 'std', pdf: o.pdf !== false });
  const ready = async () => {
    await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
    await page.addStyleTag({ content: '#toast{display:none!important}' }); // (the map's "no internet" note: not over the drawing)
    await page.evaluate(async () => { // the builder on the page for the exports (the Drawing's preview has a worker of its own): each export's job and plan kept
      if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const Tp = window.GeDxfTpl, real = Tp.build; Tp.__w = true; window.__exp = [];
      Tp.build = function (seed, job) { const j = JSON.parse(JSON.stringify(job)), out = real.call(this, seed, job); window.__exp.push({ job: { phPin: j.phPin, gridKeep: j.gridKeep || null, roads: j.roads.length, pois: j.pois.length, roadsNote: j.roadsNote }, out }); return out; };
      // (offline, as the phone says it: navigator.onLine)
      try { const g = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine').get; Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get() { return window.__offline ? false : g.call(this); } }); } catch (e) { /* as it is */ }
    });
  };
  await page.goto(base + 'index.html'); await ready();
  if (o.recs) await page.evaluate(async (ids) => { // (many poles: one made-up photo kept for each, straight into the photo store)
    const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('photos', 'readwrite'), st = tx.objectStore('photos'); ids.forEach((id) => st.put({ id, clean: b, thumb: b })); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
  }, recs.map((x) => x.id));
  else await page.evaluate(async (ids) => { for (const [id, k] of ids) { const c = document.createElement('canvas'); c.width = k % 4 === 3 ? 800 : 600; c.height = k % 4 === 3 ? 600 : 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#7a8796'; g.fillRect(c.width / 2 - 15, 60, 30, c.height - 100);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, PA.concat(PB).map((p, k) => [p[0], k]));
  await page.evaluate(async (text) => { // the made-up template on the phone, as a loaded template file is kept
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-square.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED_SQ);
  return { ctx, page, errors, calls, reload: async () => { await page.reload(); await ready(); } };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const ph = (page) => page.evaluate(() => window.__polecam.drwPh());
const kept = (page, n) => page.evaluate((nm) => window.__polecam.planKept(nm), n || null);
/** The Drawing of the project open, looking at A's poles (mpp metres a pixel). */
async function drawing(page, mpp) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await look(page, LA0 + 0.0008, LO0 + 2 * D, mpp || 0.5);
}
const look = (page, lat, lon, mpp) => page.evaluate(([la, lo, m]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width / 2, r.height / 2); }, [lat, lon, mpp]);
/** Until a new preview (n: more made than) is shown and not being made again; then what it is: the plan, its photos, its display list's hash. */
async function shown(page, n, waitS) {
  let s = null; for (let i = 0; i < (waitS || 60) * 4; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && s.made > (n == null ? -1 : n)) break; s = null; }
  if (!s) throw new Error(`no plan shown: ${JSON.stringify(await pl(page))}`);
  await page.waitForTimeout(400); await editOn(page); // ((beta 7.14, View / Edit) shown: Edit on, to change it)
  return { ...(await pl(page)), ph: await ph(page), hash: await page.evaluate(() => window.__polecam.drwPlanHash()) };
}
const made = async (page) => { const s = await pl(page); return s ? s.made : 0; };
const round = (at) => JSON.parse(JSON.stringify(at, (k, v) => (typeof v === 'number' ? +v.toFixed(6) : v)));
const names = (s) => s.sheets.map((x) => `${x.sheet}: ${x.name}`);
/** Export › Plan drawing (the AutoCAD files and their PDF; each question answered as a user going on would): its job, report and display list's hash. */
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B2 = [...document.querySelectorAll('#askBox .row button')]; (B2.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B2.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => { const x = window.__exp; if (x.length !== 1) return { n: x.length }; const { job, out } = x[0];
    return { n: 1, job, sheets: out.report.sheets.slice(), gridSheets: out.report.grid.sheets, at: out.report.photoAt, pdf: !!window.GeDxfPdf, hash: window.GeDxfPdf ? window.__polecam.planListHash(out.text, out.report) : null }; });
  assert.equal(e.n, 1, 'one plan made'); assert.ok(e.pdf, 'its PDF made (or its drawing code loaded)'); return e;
}
/** Drag a photo's frame by (dx, dy) page pixels. */
async function drag(page, F, dx, dy) { await page.mouse.move(F.x, F.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(F.x + dx * k / 10, F.y + dy * k / 10); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(300); }
/** Drag a photo by (dx, dy) and wait for the preview with it placed by hand. */
async function dragPhoto(page, id, dx, dy) {
  const F = (await ph(page)).frames.find((f) => f.id === id); assert.ok(F, `${id}'s frame on the Drawing`);
  const n = await made(page); await drag(page, F, dx, dy); assert.ok(Array.isArray((await ph(page)).pins[id]), `${id} kept`);
  for (let i = 0; i < 3; i++) { const s = await shown(page, n); if (s.ph.at[id] && s.ph.at[id].how === 'by hand') return s; }
  throw new Error(`${id}: not by hand`);
}
/** Another project, through Projects (as the owner does), and back to the main screen. */
async function openProject(page, name) {
  await closeAll(page); await page.evaluate(() => document.getElementById('projectBtn').click()); await page.waitForTimeout(800);
  await page.evaluate((nm) => document.querySelector(`#taskList .task[data-name="${nm}"]`).click(), name); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.S.project), name); await closeAll(page);
}
const plainOf = (s) => ({ sheets: names(s), at: round(s.ph.at), hash: s.hash });

test('the owner\'s sequence: edit the plan on the Drawing, export it (AutoCAD files and PDF), another project, back: the same plan; the export is the preview; the roads got once and kept', async () => {
  const { ctx, page, errors, calls } = await open();
  await drawing(page); const s0 = await shown(page);
  // the preview got the roads itself (quietly) and kept them with the project
  const k0 = await kept(page, A); assert.ok(k0.roads && k0.roads.length === 1 && k0.roads[0].src === 'osm' && k0.roads[0].roads === 3 && k0.roads[0].pois === 1, JSON.stringify(k0));
  const aCalls = () => calls.filter((c) => c === k0.roads[0].bb.map((v) => v.toFixed(6)).join(',')).length;
  assert.equal(aCalls(), 1, 'downloaded once'); assert.equal(k0.grid, null, 'no grid kept before an edit');
  assert.ok(s0.sheets.length >= 1 && s0.count.texts > 20, JSON.stringify(s0.sheets));
  // edit: three photos placed by hand; the plan keeps the grid it showed
  await dragPhoto(page, 'a2', 70, -50); await dragPhoto(page, 'a6', -60, 40); const s1 = await dragPhoto(page, 'a10', 80, 30);
  const k1 = await kept(page, A); assert.ok(k1.grid && Array.isArray(k1.grid.geo) && k1.grid.n === 1 && k1.grid.lab === 'std', JSON.stringify(k1.grid));
  assert.deepEqual(names(s1), names(s0), 'the same sheets and names after the edit');
  assert.deepEqual(Object.keys(s1.ph.pins).sort(), ['a10', 'a2', 'a6']);
  // the export: the same job's inputs (roads kept, pins, grid kept), its sheets, photos and display list those of the preview
  const e = await exportPlan(page);
  assert.equal(e.job.roads, 3); assert.equal(e.job.pois, 1); assert.match(e.job.roadsNote, /^3 roads and 1 named places from OpenStreetMap \(Overpass\)$/);
  assert.deepEqual(e.job.phPin, s1.ph.pins, 'the pins'); assert.deepEqual(e.job.gridKeep, { origin: k1.grid.geo, n: 1 }, 'the grid kept');
  assert.deepEqual(e.sheets, names(s1), 'the export\'s sheets: the Drawing\'s boxes');
  assert.deepEqual(round(e.at), round(s1.ph.at), 'each photo where the Drawing shows it');
  assert.equal(e.hash, s1.hash, 'the export\'s plan drawn as the preview\'s, item for item');
  assert.equal(aCalls(), 1, 'the export used the roads kept (no download for the plan)');
  // another project, its Drawing; then back to A
  await openProject(page, B); await drawing(page); const sb = await shown(page);
  assert.ok(sb.sheets.length >= 1 && sb.hash !== s1.hash, 'B\'s own plan');
  await openProject(page, A); const n0 = await made(page); await drawing(page); const s2 = await shown(page, n0);
  assert.deepEqual(plainOf(s2), plainOf(s1), 'the preview as it was edited: its sheets and names, the photos\' places, its drawing');
  assert.deepEqual(s2.ph.pins, s1.ph.pins); assert.deepEqual((await kept(page, A)).grid, k1.grid);
  assert.equal(aCalls(), 1, 'no download again');
  // exported again: the same
  const e2 = await exportPlan(page); assert.equal(e2.hash, s1.hash); assert.deepEqual(e2.sheets, e.sheets);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the pins, the grid kept and the roads survive a reload and a teammate\'s update (Sync: the team mailbox\'s merge)', async () => {
  const { ctx, page, errors, calls, reload } = await open();
  await drawing(page); await shown(page);
  await dragPhoto(page, 'a3', 60, -60); const s1 = await dragPhoto(page, 'a8', -70, 30);
  const k1 = await kept(page, A), nCalls = calls.length;
  // a reload: the same plan, from what the phone kept (no download)
  await reload(); await drawing(page); const s2 = await shown(page);
  assert.deepEqual(plainOf(s2), plainOf(s1), 'after a reload, the plan as edited');
  assert.deepEqual(await kept(page, A), k1, 'the grid and the roads kept'); assert.equal(calls.length, nCalls, 'no download');
  // a teammate's update of A (Pedro Santos changed CC-9105's height), opened as Sync opens it: the same merge (restoreMeta, an update)
  await closeAll(page);
  const zip = await page.evaluate(({ A, LA }) => {
    const C = window.PoleCore, r0 = window.__polecam.points.find((p) => p.project === A && p.poleId === 'CC-9105'), now = new Date().toISOString();
    const upd = { ...r0, boq: { ...(r0.boq || {}), height: '9' }, updated: now, updatedBy: 'Pedro Santos · DEMO CONTRACTOR' };
    const from = { name: 'Pedro Santos', company: 'DEMO CONTRACTOR', email: 'pedro@demo-contractor.example', mobile: '09170000002' };
    const files = [{ name: 'bundle.json', data: JSON.stringify({ app: 'G-eSAA', kind: 'bundle', v: 1, exported: now, by: 'Pedro Santos · DEMO CONTRACTOR', exportedBy: from, team: '', projects: [{ name: A, file: 'p1/points.json', kind: 'survey', records: 1 }], update: { n: 1, full: false, sender: 'pedro@demo-contractor.example' } }) },
      { name: 'p1/points.json', data: JSON.stringify({ app: 'PoleCam', version: 2, project: A, meta: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LA, linksAt: '2026-11-01T08:00:00.000Z' }, exported: now, by: 'Pedro Santos · DEMO CONTRACTOR', exportedBy: from, points: [upd], update: { n: 1, full: false, since: '' } }) }];
    const u8 = new Uint8Array(C.makeZip(files)); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s);
  }, { A, LA: linksOf(PA) });
  await page.setInputFiles('#sharedInput', { name: 'DEMO_PLAN_A_update_1.zip', mimeType: 'application/zip', buffer: Buffer.from(zip, 'base64') });
  for (let i = 0; i < 40 && (await page.evaluate(() => document.getElementById('askBox').hidden)); i++) await page.waitForTimeout(250);
  assert.match(await page.evaluate(() => document.getElementById('askTitle').textContent), /^Changes from Pedro Santos$/);
  await page.evaluate(() => document.querySelector('#askBox .row button.primary').click());
  for (let i = 0; i < 40 && (await page.evaluate((A) => (window.__polecam.points.find((p) => p.project === A && p.poleId === 'CC-9105').boq || {}).height !== '9', A)); i++) await page.waitForTimeout(250);
  assert.equal(await page.evaluate((A) => window.__polecam.points.find((p) => p.project === A && p.poleId === 'CC-9105').boq.height, A), '9', 'the update applied');
  assert.deepEqual(await kept(page, A), k1, 'the grid and the roads kept after the update');
  assert.deepEqual(await page.evaluate((A) => window.__polecam.S.meta[A].phPin, A), s1.ph.pins, 'the pins kept');
  const n0 = await made(page); await drawing(page); const s3 = await shown(page, n0);
  assert.deepEqual(names(s3), names(s1), 'the same sheets and names'); assert.deepEqual(round(s3.ph.at.a3), round(s1.ph.at.a3), 'a photo placed by hand where it was');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a photo dragged into a cell with no sheet: that sheet prints and the Drawing boxes it; across a sheet\'s edge: outlined, both print; Back to automatic for all takes the pins and the grid back', async () => {
  const { ctx, page, errors } = await open();
  const centre = (x, y) => page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [x, y]); // (the Drawing looking at E, N metres)
  await drawing(page, 2); const s0 = await shown(page);
  // a1's photo 560 m south (280 px at 2 m a pixel): in no sheet of the plan
  const A0 = s0.ph.at.a1; assert.ok(A0, 'a1\'s photo'); await centre(A0.x, A0.y + 120); await page.waitForTimeout(300);
  const s1 = await dragPhoto(page, 'a1', 0, 280), P = s1.ph.at.a1, add = s1.sheets.filter((x) => x.forPhoto);
  assert.ok(!s0.sheets.some((x) => P.x >= x.box[0] && P.x <= x.box[2] && P.y >= x.box[1] && P.y <= x.box[3]), 'in no sheet before');
  assert.equal(add.length, 1, `one sheet added: ${names(s1)}`); const X = add[0];
  assert.ok(P.x - P.w / 2 >= X.box[0] && P.x + P.w / 2 <= X.box[2] && P.y - P.h / 2 >= X.box[1] && P.y + P.h / 2 <= X.box[3], 'the photo inside it');
  assert.ok(s0.sheets.every((x) => s1.sheets.some((y) => y.name === x.name && y.box.every((v, i) => Math.abs(v - x.box[i]) < 1e-6))), 'the others as they were');
  await centre((X.box[0] + X.box[2]) / 2, (X.box[1] + X.box[3]) / 2); await page.waitForTimeout(400);
  assert.ok((await pl(page)).gridDrawn.some((g) => g.name === X.name), `the Drawing boxes ${X.name}: ${JSON.stringify((await pl(page)).gridDrawn)}`);
  const e = await exportPlan(page); assert.deepEqual(e.sheets, names(s1), 'the export prints it'); assert.ok(e.gridSheets.some((x) => x.name === X.name && x.forPhoto));
  // the photo nearest a sheet's edge, dragged onto that edge: outlined on the Drawing (warned), said when tapped, cut on two printed sheets
  await drawing(page, 0.5); let s2 = await shown(page);
  const near = Object.entries(s2.ph.at).filter(([id, a]) => id !== 'a1' && a.how === 'auto').map(([id, a]) => { const sh = s2.sheets.find((x) => a.x >= x.box[0] && a.x <= x.box[2] && a.y >= x.box[1] && a.y <= x.box[3]);
    const ds = [[a.x - sh.box[0], sh.box[0], a.y], [sh.box[2] - a.x, sh.box[2], a.y], [a.y - sh.box[1], a.x, sh.box[1]], [sh.box[3] - a.y, a.x, sh.box[3]]].sort((u, v) => u[0] - v[0])[0]; return { id, a, d: ds[0], to: [ds[1], ds[2]] }; }).sort((u, v) => u.d - v.d)[0];
  assert.ok(near && near.d < 200, JSON.stringify(near));
  await centre(near.a.x, near.a.y); await page.waitForTimeout(300);
  s2 = await dragPhoto(page, near.id, (near.to[0] - near.a.x) / 0.5, -(near.to[1] - near.a.y) / 0.5); const C = s2.ph.at[near.id];
  assert.ok(Array.isArray(C.cut) && C.cut.length === 2 && C.cut.every((nm) => s2.sheets.some((x) => x.name === nm)), `cut on two printed sheets: ${JSON.stringify(C.cut)} / ${names(s2)}`);
  await centre(C.x, C.y); await page.waitForTimeout(300);
  const F = (await ph(page)).frames.find((f) => f.id === near.id); assert.ok(F && F.warn, `outlined: ${JSON.stringify(F)}`);
  assert.ok((await ph(page)).frames.filter((f) => f.warn).every((f) => f.id === near.id), 'only that one');
  await page.mouse.click(F.x, F.y); await page.waitForTimeout(300);
  assert.match(await page.evaluate(() => document.getElementById('drawInfo').textContent), new RegExp(`placed by hand on the plan · across the edge of sheets ${C.cut[0]} and ${C.cut[1]}: it prints cut on both, drag it inside one`));
  assert.match(await page.evaluate(() => document.getElementById('drawLegendBody').textContent), /A photo across a sheet’s edge \(orange\): it prints cut on both sheets/);
  // Back to automatic for all: asked (the sheets worked out again), then no pin, no grid kept, the plan as before the edits
  for (let i = 0; i < 40 && !(await chgOf(page)).all; i++) await page.waitForTimeout(250);
  const n1 = await made(page); await allAutomatic(page); // ((beta 7.14) More › All automatic: the question the chip of 7.9-7.13 asked)
  assert.match(await page.evaluate(() => document.getElementById('askTitle').textContent), /^Back to automatic: 2 photos\?$/);
  assert.match(await page.evaluate(() => document.getElementById('askText').textContent), /the plan's sheets are worked out again/);
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  assert.deepEqual((await ph(page)).pins, {}); assert.equal((await kept(page, A)).grid, null, 'the grid kept let go');
  const s3 = await shown(page, n1); assert.deepEqual(names(s3), names(s0), 'the sheets as the plan finds them'); assert.equal(s3.hash, s0.hash, 'the plan as before the edits');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('offline with nothing kept: the preview and the export the same (no roads), nothing kept; online again, the roads are got and kept', async () => {
  let online = false; const { ctx, page, errors, calls } = await open({ net: () => online });
  await page.evaluate(() => { window.__offline = true; });
  await drawing(page); const s0 = await shown(page);
  assert.equal((await kept(page, A)).roads, null, 'nothing kept'); assert.equal(calls.length, 0, 'no download tried offline');
  const e = await exportPlan(page); assert.equal(e.job.roads, 0); assert.match(e.job.roadsNote, /^no roads: offline/); assert.equal(e.hash, s0.hash, 'the export as the preview');
  // online again: the preview gets the roads and keeps them; the export uses them
  online = true; await page.evaluate(() => { window.__offline = false; });
  const n0 = await made(page); await drawing(page); await page.click('#drawRegen'); const s1 = await shown(page, n0);
  const k = await kept(page, A); assert.ok(k.roads && k.roads.length === 1 && k.roads[0].roads === 3, JSON.stringify(k));
  assert.notEqual(s1.hash, s0.hash, 'the plan with its roads');
  const e1 = await exportPlan(page); assert.equal(e1.job.roads, 3); assert.equal(e1.hash, s1.hash);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** A made-up town of n poles for the app: the route along its streets (townJob's), its records (project A), spans and streets as Overpass answers them. */
function townApp(n) {
  const J = townJob(n), E0 = 787000, N0 = 786000, ll = (E, N) => [LA0 + (N - N0) / 110574, LO0 + (E - E0) / 110460];
  const recs = J.pts.map((p, i) => { const [lat, lon] = ll(p.E, p.N); return { id: `t${i + 1}`, project: A, element: 'Pole', poleId: `CC-${7001 + i}`, poleType: 'Concrete', status: p.status, lat, lon, accuracy: 4.2, created: new Date(Date.parse(T0) + i * 60000).toISOString(), updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } }; });
  const links = recs.slice(1).map((r, i) => [recs[i].id, r.id, 'F12']);
  const overpass = { version: 0.6, elements: J.roads.map((r, k) => way(100 + k, r.name, r.hw, r.pts.map(([E, N]) => ll(E, N)))) };
  return { recs: recs.concat(PB.map(rec(B))), links, overpass };
}

test('a 300-pole made-up project (Tidy labels, the company standard): every photo and pole on the Drawing on a printed sheet, its sheets the export\'s', async () => {
  const town = townApp(300), { ctx, page, errors } = await open({ ...town, tidy: true, pdf: false });
  await drawing(page, 2); const s = await shown(page, -1, 180);
  const at = s.ph.at, drawnAt = await page.evaluate(() => window.__polecam.drw.ph.drawnAt);
  assert.equal(Object.keys(at).length, 300, 'every photo placed');
  const bad = Object.entries(at).filter(([, a]) => !onSheets(frameOf(a), s.sheets)).map(([id, a]) => `${id} (${a.how})`).concat(Object.entries(drawnAt).filter(([, p]) => !onSheets([p[0], p[1], p[0], p[1]], s.sheets)).map(([id]) => `point ${id}`));
  assert.deepEqual(bad, [], `on ${s.sheets.length} sheets`);
  await page.evaluate(async () => { if (!window.GeDxfPdf) await new Promise((res, rej) => { const x = document.createElement('script'); x.src = 'dxfpdf.js'; x.onload = res; x.onerror = rej; document.head.appendChild(x); }); }); // (no PDF asked: its drawing code for the hash)
  const e = await exportPlan(page);
  assert.deepEqual(e.sheets, names(s), 'the export\'s sheets: the Drawing\'s boxes'); assert.equal(e.hash, s.hash, 'the export\'s plan drawn as the preview\'s');
  assert.deepEqual(errors, []);
  await ctx.close();
});
