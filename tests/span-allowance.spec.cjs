/* (beta 7.16, Span allowance) the owner: "Span length allowance: per span allowance in terms of % or meters", in the browser.
   Run: node --test tests/span-allowance.spec.cjs (or python3 tests/run_all.py --only span-allowance).
   A made-up As-Plan project: 6 made-up poles 37–42 m apart on a 12C figure 8 cable (the second span with a second run, 24C), a made-up handhole
   after them on a UG cable (its civil rows); the made-up template on the phone.
   - Plan style › Cables › Span length allowance in % (10 %, as before) or in metres a span (3 m); spans with their own (20 %, 5 m, 0 m; on the
     span with two runs too): each span's length on the plan (the job's lenW and its UG civil length lenC, the DXF's span texts, Standard and
     Tidy) is its measured length in whole metres + its allowance; the PMI's cable lengths and the Excel BOQ's DE (the spans with their
     allowance, each run), each sheet's BOQ table (it adds up to the PMI), the Route and spans Excel (Allowance, Cable, Length on the plan, the
     route on the plan) and the UG civil row (PROPOSED HDD) all take the same figures.
   - A span's own in its details on the route map (THIS SPAN · LENGTH ALLOWANCE): in % or metres, its length on the plan said; the map's span
     label and the pole's span list show it; Undo takes it back, step by step; kept in the project's links (their fifth field: what Share
     sends and the backup writes); Plan style: % or m a span (each keeps its own value), the card's summary with the spans with their own.
   - Byte for byte: in % with no span of its own, the plan as before; a span's own equal to the project's: the same plan.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-blocks.dxf'), 'utf8'); // (the made-up template with the plan's blocks)
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

const NAME = 'DEMO SPAN ALLOW', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LON = [125.6010, 125.60137, 125.60174, 125.60212, 125.60248, 125.60286, 125.60321]; // (spans of 37–42 m: their whole metres and allowances differ)
const POLES = LON.slice(0, 6).map((lon, i) => [`p${i + 1}`, `CC-${9301 + i}`, 7.10465, lon]);
const RECS = [...POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } })),
  { id: 'h1', project: NAME, element: 'Handhole', poleId: 'HH-9301', status: 'Proposed', lat: 7.10465, lon: LON[6], accuracy: 4.2, created: '2026-11-01T08:07:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }];
const LINKS = [['p1', 'p2', 'F12'], ['p2', 'p3', 'F12', ['F24']], ['p3', 'p4', 'F12'], ['p4', 'p5', 'F12'], ['p5', 'p6', 'F12'], ['p6', 'h1', 'U144']];
const K = (a, b) => [a, b].sort().join('|');

/** The app with the made-up project and the made-up template on the phone; each plan built kept (its job and its output), each Excel's sheets kept. */
async function open(exp) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, exp }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off',
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfPhotos: false, ...exp }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { RECS, NAME, USER, LINKS, exp: exp || {} });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-blocks.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ job: JSON.parse(JSON.stringify({ spans: job.spans, values: job.values, pmiItems: job.pmiItems })), text: out.text, report: JSON.parse(JSON.stringify({ movable: out.report.movable, boqGrid: out.report.boqGrid || null })) }); return out; };
    const PR = window.PoleReports, xl = PR.buildXlsxParts; window.__xl = []; PR.buildXlsxParts = function (sheets) { window.__xl.push(JSON.parse(JSON.stringify(sheets))); return xl.apply(this, arguments); };
  }, SEED);
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
/** The project's allowance (mode 'pct' | 'm', pct, m) and spans' own ({ 'a|b': { p } | { m } }), as kept: S.exp and its links' fifth field. */
const setAl = (page, o) => page.evaluate(({ o, NAME, LINKS }) => { const P = window.__polecam, S = P.S; S.exp.focPct = o.pct != null ? o.pct : 10; if (o.mode === 'm') { S.exp.focMode = 'm'; S.exp.focM = o.m; } else { delete S.exp.focMode; delete S.exp.focM; }
  S.meta[NAME].links = LINKS.map((q) => { const own = (o.own || {})[[q[0], q[1]].sort().join('|')]; return own ? [q[0], q[1], q[2] || '', Array.isArray(q[3]) ? q[3] : [], own] : q.slice(); });
  P.persist(); }, { o, NAME, LINKS });
const PID = Object.fromEntries(RECS.map((r) => [r.id, r.poleId]));
/** Export › Plan drawing: the job's spans, PMI values and items, the DXF, its movable items and its sheets' BOQ check. */
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made'); return e[0];
}
/** Export › Route and spans (Excel): its sheets (name, rows). */
async function routeXlsx(page) { await page.evaluate(() => { window.__xl = []; document.getElementById('doRouteXlsx').click(); }); for (let i = 0; i < 40 && !(await page.evaluate(() => window.__xl.length)); i++) await page.waitForTimeout(250); return (await page.evaluate(() => window.__xl))[0]; }
const cellV = (c) => (c && typeof c === 'object' ? c.v : c);
const numOf = (v) => +String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');

/** Every figure a span's allowance reaches, against what it should be: want(span) its allowance in whole metres (span: { ia, ib, len, runs }). */
async function check(page, tag, want) {
  const R = await page.evaluate(() => window.__polecam.route()), sp = R.spans.map((s) => ({ ...s, from: PID[s.ia], to: PID[s.ib], k: [s.ia, s.ib].sort().join('|'), w: Math.round(s.len) }));
  sp.forEach((s) => { s.al = want(s); s.lenW = s.w + s.al; });
  const e = await exportPlan(page), by = new Map(e.job.spans.map((s) => [[s.ia, s.ib].sort().join('|'), s]));
  for (const s of sp) {
    const j = by.get(s.k); assert.ok(j, `${tag} ${s.k}: in the job`);
    assert.equal(j.lenW, s.lenW, `${tag} ${s.k}: its length on the plan (${s.w} m + ${s.al} m)`); assert.equal(j.lenC, s.lenW, `${tag} ${s.k}: its UG civil length (with its allowance)`);
    const m = e.report.movable.find((x) => x.kind === 'span' && [...x.span].sort().join('|') === s.k); assert.ok(m, `${tag} ${s.k}: its length on the plan`); assert.deepEqual(m.text, [`${s.lenW}m`], `${tag} ${s.k}: written ${s.lenW}m`);
  }
  // the PMI: the spans with their allowance, each run (its cable rows), each sheet's BOQ adding up to it; the UG span's civil row
  const cab = sp.reduce((t, s) => t + s.lenW * s.runs.length, 0), ae = sp.filter((s) => !/^U/.test(s.runs[0])).reduce((t, s) => t + s.lenW * s.runs.length, 0), ug = sp.filter((s) => /^U/.test(s.runs[0])).reduce((t, s) => t + s.lenW, 0);
  const items = e.job.pmiItems.spans.reduce((t, x) => t + (x.v.PMI_AERIAL_CABLE_LENGTH || 0), 0); assert.equal(items, ae, `${tag}: the PMI items, the aerial spans as written, each run`);
  assert.equal(e.job.pmiItems.spans.reduce((t, x) => t + (x.v.PMI_UG_CABLE_LENGTH || 0), 0), ug, `${tag}: the UG span as written`);
  assert.ok(numOf(e.job.values.PMI_AERIAL_CABLE_LENGTH) >= ae, `${tag}: the PMI's aerial cable: its spans as written (${ae}) and its loops`);
  assert.ok(e.report.boqGrid && e.report.boqGrid.check.every((c) => c.ok), `${tag}: each sheet's BOQ adds up to the PMI: ${JSON.stringify(e.report.boqGrid && e.report.boqGrid.check.filter((c) => !c.ok))}`);
  const hdd = e.report.boqGrid.check.find((c) => c.row === 'PROPOSED HDD'); assert.ok(hdd && numOf(hdd.pmi) === sp.find((s) => s.k === K('p6', 'h1')).lenW, `${tag}: the UG span's HDD as written: ${JSON.stringify(hdd)}`);
  // the Excel BOQ's survey quantities: DE (the spans with their allowance, each run), ALLOW_TOTAL
  const Q = Object.fromEntries((await page.evaluate(() => window.__polecam.surveyQty(window.__polecam.points.filter((p) => p.project === window.__polecam.S.project)).rows)).map(([c, q]) => [c, q]));
  assert.equal(Q.DE, cab, `${tag}: DE, the cable with its allowance (each run)`); assert.equal(Q.ALLOW_TOTAL || 0, sp.reduce((t, s) => t + s.al * s.runs.length, 0), `${tag}: ALLOW_TOTAL`);
  // the Route and spans Excel: each span's allowance, its cable and its length on the plan; the route on the plan
  const X = await routeXlsx(page), spans = X.find((x) => x.name === 'Spans'), H = spans.rows[0].map(cellV), col = (n) => H.indexOf(n);
  assert.ok(col('Length on the plan (m)') > 0, `${tag}: Spans › Length on the plan: ${H}`);
  for (const r of spans.rows.slice(1)) { const s = sp.find((x) => (x.from === cellV(r[1]) && x.to === cellV(r[2])) || (x.from === cellV(r[2]) && x.to === cellV(r[1]))); assert.ok(s, `${tag}: a span's row ${JSON.stringify(r.map(cellV))}`);
    assert.equal(cellV(r[col('Length on the plan (m)')]), s.lenW, `${tag} ${s.k}: on the plan`); assert.equal(cellV(r[col('Cable (m)')]), s.lenW, `${tag} ${s.k}: its cable`); assert.equal(cellV(r[H.findIndex((h) => /^Allowance .*\(m\)$/.test(h))]), s.al, `${tag} ${s.k}: its allowance`); }
  const sum = X[0].rows.map((r) => r.map(cellV)), onPlan = sum.find((r) => r[0] === 'Route length on the plan (m)');
  assert.ok(onPlan && onPlan[1] === sp.reduce((t, s) => t + s.lenW, 0), `${tag}: the route on the plan ${JSON.stringify(onPlan)}`);
  return { e, sp, Q, X, H };
}

test('% or metres a span, spans with their own (% or metres): the plan (Standard, Tidy), the PMI, each sheet\'s BOQ, the Excel BOQ, the Route and spans Excel and the UG civil row agree', async () => {
  for (const lab of ['std', 'tidy']) {
    const { ctx, page, errors } = await open({ dxfLabels: lab });
    try {
      const own = { [K('p2', 'p3')]: { p: 20 }, [K('p4', 'p5')]: { m: 5 } };
      const pct = (p) => (s) => Math.round(s.w * p / 100);
      // % as before (10 %), then metres a span, then each with spans of their own (the span with two runs among them)
      const A = await check(page, `${lab} 10 %`, pct(10));
      assert.ok(A.H.includes('Allowance 10 % (m)') && !A.H.includes('Allowance set'), `${lab}: in % with none of its own, the columns as before: ${A.H}`);
      assert.equal(A.Q.ALLOW_PCT, 10); assert.equal(A.Q.ALLOW_OWN, undefined); assert.equal(A.Q.ALLOW_M, undefined);
      await setAl(page, { mode: 'm', m: 3 });
      const B = await check(page, `${lab} 3 m`, () => 3); assert.equal(B.Q.ALLOW_M, 3); assert.equal(B.Q.ALLOW_PCT, undefined);
      assert.ok(B.H.includes('Allowance each span (m)') && B.H.includes('Allowance set'), `${lab}: m: ${B.H}`);
      await setAl(page, { own });
      const C = await check(page, `${lab} 10 % + own`, (s) => (s.k === K('p2', 'p3') ? Math.round(s.w * 20 / 100) : s.k === K('p4', 'p5') ? 5 : Math.round(s.w * 10 / 100)));
      assert.equal(C.Q.ALLOW_OWN, 2, 'the spans with their own');
      const set = C.X.find((x) => x.name === 'Spans').rows.slice(1).map((r) => [cellV(r[1]), cellV(r[2]), cellV(r[C.H.indexOf('Allowance set')])]);
      assert.deepEqual([...new Set(set.map((x) => x[2]))].sort(), ['10 %', '20 % (this span)', '5 m (this span)'], `${lab}: each span's allowance as set: ${JSON.stringify(set)}`);
      await setAl(page, { mode: 'm', m: 3, own: { ...own, [K('p5', 'p6')]: { m: 0 } } });
      await check(page, `${lab} 3 m + own`, (s) => (s.k === K('p2', 'p3') ? Math.round(s.w * 20 / 100) : s.k === K('p4', 'p5') ? 5 : s.k === K('p5', 'p6') ? 0 : 3));
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('byte for byte: in % with no span of its own the plan as before; a span\'s own equal to the project\'s, the same plan; 0 %: none written', async () => {
  const { ctx, page, errors } = await open({});
  try {
    const strip = (t) => t.replace(/Exported by[^\n]*/g, ''); // (the export's own line: the time)
    const a = await exportPlan(page);
    await setAl(page, { own: { [K('p2', 'p3')]: { p: 10 }, [K('p4', 'p5')]: { p: 10 } } }); const b = await exportPlan(page);
    assert.ok(strip(b.text) === strip(a.text), 'a span\'s own as the project\'s: the same plan');
    await setAl(page, {}); const c = await exportPlan(page); assert.ok(strip(c.text) === strip(a.text), 'none of their own again: the same plan');
    await setAl(page, { pct: 0 }); const d = await exportPlan(page), R = await page.evaluate(() => window.__polecam.route());
    for (const s of R.spans) assert.equal(d.job.spans.find((x) => x.ia === s.ia && x.ib === s.ib).lenW, Math.round(s.len), '0 %: each span as measured, in whole metres');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a span\'s own in its details on the route map: in % or metres, its length on the plan said; the map and the pole\'s spans show it; Undo; kept in the project\'s links (Share sends them); Plan style: % or m a span', async () => {
  const { ctx, page, errors } = await open({});
  try {
    await closeAll(page); await page.click('#routeBtn'); await page.waitForTimeout(900);
    assert.ok(await page.evaluate(() => window.__polecam.spanTap('p2', 'p3')), 'the span tapped on the route map'); await page.waitForTimeout(500);
    const R = await page.evaluate(() => window.__polecam.route()), s = R.spans.find((x) => [x.ia, x.ib].sort().join('|') === K('p2', 'p3')), w = Math.round(s.len);
    let panel = await page.evaluate(() => document.getElementById('rbSpan').innerText);
    assert.match(panel, /THIS SPAN · LENGTH ALLOWANCE/); assert.ok(panel.includes(`On the plan: ${w + Math.round(w / 10)} m (${w} m + ${Math.round(w / 10)} m)`), `as the project's: ${panel}`);
    // its own, in metres: 4 m
    await page.selectOption('#rbSpan select[data-rs="alk"]', 'm'); await page.waitForTimeout(400);
    await page.fill('#rbSpan input[data-rs="alv"]', '4'); await page.locator('#rbSpan input[data-rs="alv"]').blur(); await page.waitForTimeout(500);
    panel = await page.evaluate(() => document.getElementById('rbSpan').innerText);
    assert.ok(panel.includes(`On the plan: ${w + 4} m (${w} m + 4 m, its own)`), `its own: ${panel}`);
    const link = await page.evaluate((n) => window.__polecam.S.meta[n].links.find((q) => [q[0], q[1]].sort().join('|') === 'p2|p3'), NAME);
    assert.deepEqual(link, ['p2', 'p3', 'F12', ['F24'], { m: 4 }], 'kept in its link (its runs as they were)');
    const lbl = await page.evaluate(() => [...document.querySelectorAll('.span-label')].map((x) => x.textContent));
    assert.ok(lbl.some((t) => / m \+4 m/.test(t)), `the map's label: ${lbl}`);
    assert.deepEqual((await page.evaluate(() => window.__polecam.shareMeta())).links.find((q) => [q[0], q[1]].sort().join('|') === 'p2|p3'), link, 'Share sends it');
    // in %: 15 %
    await page.selectOption('#rbSpan select[data-rs="alk"]', 'p'); await page.waitForTimeout(400);
    await page.fill('#rbSpan input[data-rs="alv"]', '15'); await page.locator('#rbSpan input[data-rs="alv"]').blur(); await page.waitForTimeout(500);
    panel = await page.evaluate(() => document.getElementById('rbSpan').innerText);
    assert.ok(panel.includes(`On the plan: ${w + Math.round(w * 0.15)} m (${w} m + ${Math.round(w * 0.15)} m, its own)`), `its own %: ${panel}`);
    // Undo, step by step: 10 % (its own in %: the project's to start from), 4 m, the project's
    const lk = () => page.evaluate((n) => window.__polecam.S.meta[n].links.find((q) => [q[0], q[1]].sort().join('|') === 'p2|p3'), NAME), undo = async () => { await page.evaluate(() => document.getElementById('rbUndo').click()); await page.waitForTimeout(400); };
    await undo(); assert.deepEqual((await lk())[4], { p: 10 }, 'Undo: its own 10 %');
    await undo(); assert.deepEqual((await lk())[4], { m: 4 }, 'Undo: its own 4 m');
    await undo(); assert.deepEqual(await lk(), ['p2', 'p3', 'F12', ['F24']], 'Undo: as the project again');
    // set again (its own, in metres: what it had, to change)
    await page.evaluate(() => window.__polecam.spanTap('p2', 'p3')); await page.waitForTimeout(400);
    await page.selectOption('#rbSpan select[data-rs="alk"]', 'm'); await page.waitForTimeout(400);
    assert.deepEqual((await page.evaluate((n) => window.__polecam.S.meta[n].links.find((q) => [q[0], q[1]].sort().join('|') === 'p2|p3'), NAME))[4], { m: Math.round(w / 10) }, 'its own: in metres what it had');
    await page.evaluate(() => { window.__polecam.routeTools(false, true); window.__polecam.routeTap('p2'); }); await page.waitForTimeout(500); // (a pole tapped: its spans)
    const at = await page.evaluate(() => [...document.querySelectorAll('#rbSpans button')].map((b) => b.textContent));
    assert.ok(at.some((t) => t.includes('CC-9303') && t.endsWith(`allowance ${Math.round(w / 10)} m (this span)`)) && at.some((t) => t.includes('CC-9301') && !/allowance/.test(t)), `the pole's spans: ${JSON.stringify(at)}`);
    // Plan style: m a span; its summary; the spans with their own; % again, its own value kept
    await closeAll(page); await page.evaluate(() => window.__polecam.openStyle(null, 'stRoute')); await page.waitForTimeout(900); // (More settings › Cables, open)
    await page.evaluate(() => document.querySelector('#stAllowUnit .chip[data-v="m"]').click()); await page.waitForTimeout(400);
    let st = await page.evaluate(() => ({ unit: document.getElementById('focUnit').textContent, v: document.getElementById('focPct').value, out: document.getElementById('focPctO').textContent, sum: document.querySelector('#stRoute .secsum').textContent, S: [window.__polecam.S.exp.focMode, window.__polecam.S.exp.focM] }));
    assert.deepEqual([st.unit, st.v, st.S], ['m', '3', ['m', 3]], JSON.stringify(st)); assert.match(st.out, /^3 m on each span · 1 span with its own$/); assert.match(st.sum, /allowance 3 m a span; 1 span its own$/);
    await page.fill('#focPct', '6'); await page.locator('#focPct').blur(); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [window.__polecam.S.exp.focM, window.__polecam.S.exp.focPct]), [6, 10], 'metres kept apart from the %');
    await page.evaluate(() => document.querySelector('#stAllowUnit .chip[data-v="pct"]').click()); await page.waitForTimeout(400);
    st = await page.evaluate(() => ({ unit: document.getElementById('focUnit').textContent, v: document.getElementById('focPct').value, sum: document.querySelector('#stRoute .secsum').textContent }));
    assert.deepEqual(st, { unit: '%', v: '10', sum: 'Follows the road · allowance 10 %; 1 span its own' });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
