/* (Drawing photos) the pole photos on the Drawing where the plan puts them, dragged to a place of the user's own, and the plan drawn with
   them there. Run: node --test tests/drawing-photos.spec.cjs (or python3 tests/run_all.py --only drawing-photos).
   - The builder (dxftpl.js, run here in Node as the app's worker runs it): a made-up job of 12 poles along a made-up street, on the made-up
     plan template (tests/fixtures/plan-seed-made-up.dxf, made by tests/fixtures/mkseed.py). report.photoAt says where each photo went (its
     centre, size, its pole as drawn, its line, by hand or auto). job.phPin puts a photo at its pole's drawn place (dp) + the offset, at its
     size, never in a Tidy pole block, with a thin line to its pole when it stands away from it; the other photos and the pole labels keep
     off it (Standard; Tidy at the grids it tries). With no pin (none, {}, a pin of a point with no photo on that drawing) the DXF is the
     same, byte for byte. A photo placed across a sheet's edge is said in the notes.
   - The app (a browser, 390 x 844): a made-up As-Plan project of 8 poles with a made-up photo each, the made-up template on the phone. The
     Drawing draws each photo's frame where the plan's report puts it (from its pole as the Drawing draws it), at its size, and those are the
     places of the export's own plan (Export › Plan drawing, its report). A frame dragged keeps pmeta().phPin, the next export's job carries
     it and the plan has the photo there, by hand; a tap on it says placed by hand, and Back to automatic takes the pin away (the export's job
     has none, the photo back where it was). In Edit route a drag moves no photo. Without the template on the phone, no plan places (the
     Drawing as before). No page errors.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up.dxf'), 'utf8');

/* ---------- the builder, in Node ---------- */
function loadTpl() {
  const sb = { self: {}, console, Math, Date, JSON, Array, Object, Map, Set, Uint8Array, Float64Array, ArrayBuffer, TextEncoder, TextDecoder, Number, String, RegExp, Error, isFinite, isNaN, parseInt, parseFloat };
  sb.window = sb.self; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(root, 'dxftpl.js'), 'utf8'), sb, { filename: 'dxftpl.js' });
  return sb.self.GeDxfTpl;
}
/** 12 made-up poles 36 m apart along a made-up street (an L), each with a photo (every 4th one landscape). */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12' })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'photo', cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
const box = (a) => [a.x - a.w / 2, a.y - a.h / 2, a.x + a.w / 2, a.y + a.h / 2];
const overlap = (a, b) => { const A = box(a), B = box(b); return A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]; };
/** A label's box from report.layout.labels ([cx, cy, hw, hh, ux, uy, vx, vy], turned) over a photo's (upright): the separating axes. */
function labelOver(L, a) {
  const [cx, cy, hw, hh, ux, uy, vx, vy] = L, ax = [[1, 0], [0, 1], [ux, uy], [vx, vy]], dx = a.x - cx, dy = a.y - cy;
  return ax.every(([x, y]) => Math.abs(dx * x + dy * y) < hw * Math.abs(ux * x + uy * y) + hh * Math.abs(vx * x + vy * y) + (a.w / 2) * Math.abs(x) + (a.h / 2) * Math.abs(y) - 1e-6);
}
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);

test('the builder: every photo said in report.photoAt; one placed by hand goes where it was put, with its line, and the other photos and the labels keep off it', () => {
  const T = loadTpl(), r0 = T.build(SEED, madeUpJob({ debug: true })), A0 = r0.report.photoAt, ids = madeUpJob().pts.map((p) => p.id);
  assert.deepEqual(Object.keys(A0).sort(), ids.slice().sort(), 'every photo placed and said');
  for (const id of ids) { const a = A0[id]; assert.equal(a.how, 'auto'); assert.ok(a.w > 1 && a.h > 1 && Array.isArray(a.dp) && a.dp.length === 2 && (a.line === null || a.line.length === 2), JSON.stringify(a)); }
  assert.equal(JSON.stringify(r0.report.layout.marks.filter((m) => m.ph).map((m) => [m.id, +m.q[0].toFixed(6), +m.q[1].toFixed(6)]).sort()), JSON.stringify(ids.map((id) => [id, +A0[id].x.toFixed(6), +A0[id].y.toFixed(6)]).sort()), 'the same places as the layout (debug)'); // (as text: the builder's arrays are of its own context)
  // s3's photo put on the place s4's photo has without it: s4's moves aside
  const d3 = A0.s3.dp, pin = [+(A0.s4.x - d3[0]).toFixed(2), +(A0.s4.y - d3[1]).toFixed(2)];
  const r1 = T.build(SEED, madeUpJob({ debug: true, phPin: { s3: pin } })), A1 = r1.report.photoAt, a3 = A1.s3;
  assert.equal(a3.how, 'by hand'); assert.equal(r1.report.photos.byHand, 1);
  near(a3.x, a3.dp[0] + pin[0], 1e-6, 'x = dp + offset'); near(a3.y, a3.dp[1] + pin[1], 1e-6, 'y = dp + offset');
  near(a3.w, A0.s3.w, 1e-9, 'its usual size'); near(a3.h, A0.s3.h, 1e-9, 'its usual size');
  // its line: from just past its pole's symbol to the photo's edge, toward its centre
  assert.ok(a3.line && a3.line.length === 2, 'a line to its pole');
  const [la, lb] = a3.line, dpd = Math.hypot(la[0] - a3.dp[0], la[1] - a3.dp[1]); assert.ok(dpd > 0.3 && dpd < 4, `starts by its pole (${dpd})`);
  const onEdge = Math.abs(Math.abs(lb[0] - a3.x) - a3.w / 2) < 1e-6 || Math.abs(Math.abs(lb[1] - a3.y) - a3.h / 2) < 1e-6; assert.ok(onEdge, 'ends on the photo\'s edge');
  for (const id of ids) if (id !== 's3') assert.ok(!overlap(A1[id], a3), `${id}'s photo keeps off it`);
  assert.ok(Math.hypot(A1.s4.x - A0.s4.x, A1.s4.y - A0.s4.y) > 1, 's4\'s photo moved aside');
  assert.ok(r1.report.layout.labels.length > 10 && r1.report.layout.labels.every((L) => !labelOver(L, a3)), 'no label over it');
  assert.ok(r1.text.includes('CC-9003.jpg') && !r1.report.notes.some((t) => /placed by hand/.test(t)), 'drawn; not across a sheet edge');
});

test('the builder, Tidy: a photo placed by hand is not put in its pole block; it is where it was put at every grid, the labels and photos off it', () => {
  const T = loadTpl(), r0 = T.build(SEED, madeUpJob({ labels: 'tidy' })), A0 = r0.report.photoAt;
  assert.equal(Object.keys(A0).length, 12); assert.ok(r0.report.photos.inLabels > 0, 'Tidy puts photos in the pole blocks');
  for (const split of [0, 1, 2, 3]) {
    const r = T.build(SEED, madeUpJob({ labels: 'tidy', debug: true, gridStyle: { split }, phPin: { s3: [20, 25] } })), A = r.report.photoAt, a = A.s3;
    assert.equal(a.how, 'by hand', `grid ${split}`); assert.ok(!a.rot, 'upright, not in a block');
    near(a.x, a.dp[0] + 20, 1e-6, `grid ${split}: x`); near(a.y, a.dp[1] + 25, 1e-6, `grid ${split}: y`);
    assert.ok(a.line, `grid ${split}: its line`);
    for (const id of Object.keys(A)) if (id !== 's3') assert.ok(!overlap(A[id], a), `grid ${split}: ${id}'s photo keeps off it`);
    assert.ok(r.report.layout.labels.length > 10 && r.report.layout.labels.every((L) => !labelOver(L, a)), `grid ${split}: no label over it`);
    const n = T.build(SEED, madeUpJob({ labels: 'tidy', gridStyle: { split } })).report.photos.inLabels; assert.ok(r.report.photos.inLabels <= n, 'not in a block');
  }
});

test('the builder: with no pin the DXF is the same, byte for byte; a photo across a sheet edge is said', () => {
  const T = loadTpl(), b = (o) => T.build(SEED, madeUpJob(o));
  const same = [[{}, { phPin: {} }], [{}, { phPin: { x99: [5, 5] } }], [{ markMode: 'num', markNum: true }, { markMode: 'num', markNum: true, phPin: { s3: [5, 5] } }],
    [{ marks: ['s1', 's2', 's4'] }, { marks: ['s1', 's2', 's4'], phPin: { s3: [5, 5] } }], [{ labels: 'tidy' }, { labels: 'tidy', phPin: {} }], [{ markMode: 'both' }, { markMode: 'both', phPin: {} }]];
  for (const [x, y] of same) { const a = b(x), c = b(y); assert.ok(a.text === c.text, `the same DXF: ${JSON.stringify(y)}`); }
  assert.equal(Object.keys(b({ markMode: 'num', markNum: true }).report.photoAt).length, 0, 'numbers only: no photo');
  // across the next grid line east of s1
  const r0 = b({ debug: true }), G = r0.report.layout.grid, dp = r0.report.photoAt.s1.dp, xg = G.gox + G.cell * Math.ceil((dp[0] - G.gox) / G.cell);
  const r = b({ phPin: { s1: [+(xg - dp[0]).toFixed(2), 0] } });
  assert.ok(r.report.notes.some((t) => /^Photos placed by hand across a sheet's edge .*: CC-9001$/.test(t)), JSON.stringify(r.report.notes));
});

/* ---------- the app, in a browser ---------- */
let server, browser, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
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

const NAME = 'DEMO DRAW TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, 7.10465 + (i > 4 ? (i - 4) * 0.00036 : 0), 125.6010 + Math.min(i, 4) * 0.00036]);
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } }));
const LINKS = POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12']);
async function open(withTemplate) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files' }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { RECS, NAME, USER, LINKS });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  // a made-up photo for every pole (600 x 800), kept as the camera keeps them
  await page.evaluate(async (ids) => { for (const id of ids) { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, POLES.map((p) => p[0]));
  if (withTemplate) await page.evaluate(async (text) => { // the made-up template on the phone, as a loaded template file is kept
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED);
  // the builder on the page for the exports (the Drawing's preview has a worker of its own): each export's job and report kept
  await page.evaluate(async () => {
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ phPin: JSON.parse(JSON.stringify(job.phPin)), at: JSON.parse(JSON.stringify(out.report.photoAt)) }); return out; };
  });
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const ph = (page) => page.evaluate(() => window.__polecam.drwPh());
/** The Drawing, opened (Back first to the main screen), looking at the first four poles and their photos. */
async function drawing(page) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(7.10465 - 0.00016, 125.60154, 0.4, r.width / 2, r.height * 0.45); });
}
/** Until the preview is made and not being made again (when: what else it must show). */
async function settled(page, when) {
  let s = null; for (let i = 0; i < 120; i++) { await page.waitForTimeout(250); s = await ph(page); if (s && s.at && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return ph(page); } }
  throw new Error(`no preview: ${JSON.stringify(s && { busy: s.busy, at: !!s.at })}`);
}
/** Export › Plan drawing (each question answered as a user going on would): the job's pins and the report's photo places. */
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made'); return e[0];
}
/** Each frame drawn where the preview's report puts its photo: from its pole as the Drawing draws it, at its size. */
async function framesAtPlan(page, s) {
  const F = s.frames.filter((f) => s.at[f.id]); assert.ok(F.length >= 4, `frames drawn: ${F.length}`);
  for (const f of F) { const A = s.at[f.id], P = await page.evaluate((id) => window.__polecam.drwPt(id), f.id);
    near(f.x, P[0] + (A.x - A.dp[0]) * s.sc, 0.6, `${f.id} x`); near(f.y, P[1] - (A.y - A.dp[1]) * s.sc, 0.6, `${f.id} y`);
    near(f.w, Math.max(8, A.w * s.sc), 0.6, `${f.id} w`); near(f.h, Math.max(8, A.h * s.sc), 0.6, `${f.id} h`); }
  return F;
}
const round = (at) => JSON.parse(JSON.stringify(at, (k, v) => (typeof v === 'number' ? +v.toFixed(6) : v)));

test('the Drawing: each photo where the plan puts it (the export\'s places); dragged, kept, in the next export, by hand; Back to automatic', async () => {
  const { ctx, page, errors } = await open(true);
  await drawing(page);
  const s0 = await settled(page);
  assert.equal(Object.keys(s0.at).length, 8, 'every photo placed by the plan');
  assert.match(await page.evaluate(() => document.getElementById('drawHint').textContent), /Photos sit where the plan puts them: drag one to place it by hand\.$/);
  await framesAtPlan(page, s0);
  // the export's own plan has the photos at the same places
  const e0 = await exportPlan(page); assert.deepEqual(e0.phPin, {}); assert.deepEqual(round(e0.at), round(s0.at), 'the Drawing shows the export\'s places');
  // drag s2's photo 60 px right and 40 px up
  await drawing(page); const s1 = await settled(page), F = s1.frames.find((f) => f.id === 's2'), A = s1.at.s2;
  await page.mouse.move(F.x, F.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(F.x + 6 * k, F.y - 4 * k); await page.waitForTimeout(16); } await page.mouse.up();
  await page.waitForTimeout(300);
  const pin = (await ph(page)).pins.s2; assert.ok(Array.isArray(pin), 'kept');
  near(pin[0], A.x - A.dp[0] + 60 / s1.sc, 0.02, 'pin E'); near(pin[1], A.y - A.dp[1] + 40 / s1.sc, 0.02, 'pin N');
  assert.equal(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('polecam.settings')).meta['DEMO DRAW TEST'].phPin)), JSON.stringify({ s2: pin }), 'saved');
  const info = await page.evaluate(() => ({ t: document.getElementById('drawInfo').textContent, shown: !document.getElementById('drawInfo').hidden, b: !!document.getElementById('drawPhAuto') }));
  assert.ok(info.shown && /^Photo of CC-9002 \(No\. 2\) · placed by hand on the plan/.test(info.t) && info.b, JSON.stringify(info));
  const s2 = await settled(page, (s) => s.at.s2.how === 'by hand' && !!s.at.s2.line);
  near(s2.at.s2.x, s2.at.s2.dp[0] + pin[0], 1e-6, 'by hand: x'); near(s2.at.s2.y, s2.at.s2.dp[1] + pin[1], 1e-6, 'by hand: y');
  for (const id of Object.keys(s2.at)) if (id !== 's2') assert.ok(!overlap(s2.at[id], s2.at.s2), `${id}'s photo keeps off it`);
  await framesAtPlan(page, s2);
  // the next export carries it, and its plan has the photo there, by hand
  const e1 = await exportPlan(page); assert.deepEqual(e1.phPin, { s2: pin }); assert.equal(e1.at.s2.how, 'by hand'); assert.deepEqual(round(e1.at), round(s2.at), 'the same places');
  // a tap on it: placed by hand; Back to automatic
  await drawing(page); const s3 = await settled(page), G = s3.frames.find((f) => f.id === 's2');
  await page.mouse.click(G.x, G.y); await page.waitForTimeout(300);
  assert.match(await page.evaluate(() => document.getElementById('drawInfo').textContent), /placed by hand on the plan/);
  assert.equal((await ph(page)).sel, 's2');
  await page.click('#drawPhAuto'); await page.waitForTimeout(300);
  assert.deepEqual((await ph(page)).pins, {}); assert.match(await page.evaluate(() => document.getElementById('drawInfo').textContent), /where the plan puts it: drag it to place it by hand/);
  assert.equal(await page.evaluate(() => 'phPin' in JSON.parse(localStorage.getItem('polecam.settings')).meta['DEMO DRAW TEST']), false, 'no pin kept');
  const s4 = await settled(page, (s) => s.at.s2.how === 'auto'); assert.deepEqual(round(s4.at), round(s0.at), 'back where the plan put it');
  const e2 = await exportPlan(page); assert.deepEqual(e2.phPin, {}); assert.deepEqual(round(e2.at), round(s0.at));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the Drawing: in Edit route a drag moves no photo; without the template on the phone, no plan places (as before)', async () => {
  let { ctx, page, errors } = await open(true);
  await drawing(page); const s0 = await settled(page), F = s0.frames.find((f) => f.id === 's3');
  await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.drwEd().on), true, 'Edit route on');
  await page.mouse.move(F.x, F.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(F.x + 5 * k, F.y + 3 * k); await page.waitForTimeout(16); } await page.mouse.up();
  await page.waitForTimeout(400);
  assert.deepEqual((await ph(page)).pins, {}, 'no photo moved in Edit route');
  await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(400);
  assert.deepEqual(errors, []);
  await ctx.close();
  ({ ctx, page, errors } = await open(false));
  await drawing(page); await page.waitForTimeout(2500);
  const s = await ph(page); assert.equal(s.at, null, 'no preview'); assert.deepEqual(s.frames, [], 'no plan frames');
  assert.doesNotMatch(await page.evaluate(() => document.getElementById('drawHint').textContent), /drag one/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
