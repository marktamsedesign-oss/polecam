/* (beta 7.9, Drawing preview) the Drawing shows the plan exactly as the PDF export prints it (its model space), with the plan's sheet grid, Regenerate
   plan preview, and the photos dragged on top. Run: node --test tests/drawing-preview.spec.cjs (or python3 tests/run_all.py --only drawing-preview).
   - The PDF's own drawing code (dxfpdf.js, in Node): planList draws the plan's model space as the GEO sheets print it (the same draw() as
     toPdf, read back from its PDF operators): its lines, the red dashed cable, its texts (each text the GEO sheet's PDF prints is in it), a
     place for each photo; the grid's own lines and names left out. A made-up job of 12 poles along a made-up street, on the made-up
     templates (tests/fixtures/plan-seed-made-up-square.dxf: the map viewport square, as the company template's, so the PDF prints the plan;
     made by tests/fixtures/mkseed.py --square).
   - The report: report.grid.sheets (each GEO sheet's tab, its name as the plan writes it and its square in metres) say what report.sheets
     says; report.grid.ents are the grid's lines and names; report.drawnAt says where each point is drawn.
   - Byte for byte: the DXF and its PDF of that job, without and with a photo placed by hand, Standard and Tidy, on both made-up templates,
     as beta 7.8 made them (their SHA-256). A change meant to change the plan updates these.
   - The app (a phone, 390 x 844): a made-up As-Plan project of 8 poles with a made-up photo each and the made-up template on the phone. The
     Drawing draws the preview's plan (its display list's counts; a pixel on the plan's cable has its red, none of the Drawing's own navy);
     the GEO sheets as boxes with their names, the names those of the export's report.sheets; Sheet grid (in the legend) hides and shows
     them. Regenerate plan preview: busy at once (disabled, said beside it), a new preview, then said made. A photo dragged keeps its pin
     and the next export has it; with two placed by hand, the chip says so, asks first (Cancel keeps them), then Back to automatic takes both
     back and the export has none. On a computer (1280 x 900) the plan too; in Edit route the Drawing as before (live), the plan after it;
     without the template on the phone, the Drawing as before and no Regenerate. No page errors, no page sideways.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
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
const T = require(path.join(root, 'dxftpl.js')), PDF = require(path.join(root, 'dxfpdf.js'));
/** A made-up photo (12 x 16, light blue with a grey pole), the same bytes every run. */
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0DVLmW3+x+U+3zbpI34BypzkVerN1r/lw/wCv2P8ArWlWxif/2Q==', 'base64');
/** 12 made-up poles 36 m apart along a made-up street (an L), each with a photo (every 4th one landscape). (As drawing-photos.spec.cjs's.) */
function madeUpJob(over) {
  const E0 = 787300, N0 = 786100, P = []; for (let i = 0; i < 12; i++) P.push(i < 6 ? [E0 + i * 36, N0] : [E0 + 5 * 36, N0 + (i - 5) * 36]);
  const pts = P.map(([E, N], i) => ({ id: `s${i + 1}`, poleId: `CC-${9001 + i}`, el: 'Pole', status: 'Proposed', mat: 'CC', tag: `CC-${9001 + i}`, label1: `PROP.POLE CC-${9001 + i}`, clamp: '8-10', E, N, lat: 7.1 + (N - N0) / 110574, lon: 125.6 + (E - E0) / 110400 }));
  const photos = {}; pts.forEach((p, i) => { photos[p.id] = { file: `${p.poleId}.jpg`, px: i % 4 === 3 ? 800 : 600, py: i % 4 === 3 ? 600 : 800 }; });
  return { pts, spans: P.slice(1).map((b, i) => ({ ia: `s${i + 1}`, ib: `s${i + 2}`, a: P[i], b, len: 36, lenW: 36, cable: 'F12' })), runs: [{ cable: 'F12', label: 'PROPOSED 12C FIGURE 8 FOC', pts: P }],
    roads: [{ cls: 'minor', hw: 'residential', name: 'MADE-UP ST', pts: [[E0 - 40, N0 - 7], [E0 + 5 * 36 + 7, N0 - 7], [E0 + 5 * 36 + 7, N0 + 7 * 36]] }],
    photos, marks: pts.map((p) => p.id), seqOf: Object.fromEntries(pts.map((p, i) => [p.id, i + 1])), markMode: 'photo', cell: 440, viewH: 440, date: new Date('2026-11-20T08:00:00Z'), ...over };
}
const IMAGES = Object.fromEntries(madeUpJob().pts.map((p) => [`${p.poleId}.jpg`, new Uint8Array(JPG)]));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
/** The texts a PDF page's drawing shows (its Tj strings, read back). */
const pageTexts = (ops) => { const out = []; for (const op of ops) for (const m of op.matchAll(/\(((?:[^\\)]|\\.)*)\) Tj/g)) out.push(m[1].replace(/\\(.)/g, '$1')); return out; };

/* ---------- the plan's drawing and report, in Node ---------- */
test('planList: the plan\'s model space drawn by the PDF\'s own code (its lines, cable, texts, photo places), the grid\'s own left out', () => {
  const out = T.build(SEED_SQ, madeUpJob()), G = out.report.grid, L = PDF.planList(out.text, out.report);
  assert.ok(L && L.items.length > 0 && L.pts.length > 0, 'a display list');
  const kinds = [0, 0, 0, 0, 0]; for (let k = 0; k < L.items.length; k += 4) kinds[L.items[k]]++;
  assert.ok(kinds[0] > 20, `lines: ${kinds[0]}`); assert.ok(kinds[3] > 30, `texts: ${kinds[3]}`); assert.equal(kinds[4], 12, 'a place for each photo');
  assert.equal(L.sheet, 'GEO'); assert.deepEqual(L.origin, G.origin);
  const scale = 72 / 25.4 * 1000 / L.K; assert.ok(scale > 1000 && scale < 3000, `printed at 1:${Math.round(scale)}`); // (the GEO sheet's: 260 mm for its 440 m cell, on A3)
  assert.deepEqual(L.images.map((im) => im.name).sort(), Object.values(madeUpJob().photos).map((x) => x.file).sort(), 'each photo where the plan prints it');
  const red = L.styles.filter((s) => s.c === '#ff0000' && s.dash && s.dash.length === 2); assert.ok(red.length >= 1, `the cable red, dashed: ${JSON.stringify(L.styles)}`);
  const TX = L.texts.map((t) => t.s);
  assert.ok(TX.includes('PROP.POLE CC-9001') && TX.includes('36m') && TX.includes('MADE-UP ST'), `the labels, span lengths, street name: ${TX.slice(0, 12)}`);
  for (const s of G.sheets) assert.ok(!TX.includes(s.name), `the grid's name ${s.name} left out (the Drawing draws the sheets)`);
  // each text of the GEO sheet's PDF that is in the plan's model space is in the display list (the same drawing)
  const pages = PDF.layoutPages(out.text, { images: IMAGES }).pages, geo = pages.find((pg) => pg.name === 'GEO'), onGeo = new Set(pageTexts(geo.ops));
  const modelTexts = TX.filter((s) => /^(PROP\.POLE|CA |2A |\d+m$|MADE-UP|\d+\.\d+°$)/.test(s));
  assert.ok(modelTexts.length > 20, `the plan's texts: ${modelTexts.length}`);
  assert.deepEqual(modelTexts.filter((s) => !onGeo.has(s)), [], 'each one printed on the GEO sheet too');
  // the coordinates: a text's place in metres (the first pole's label beside the first pole as the plan draws it)
  const t1 = L.texts.find((t) => t.s === 'PROP.POLE CC-9001'), at = [t1.m[4] + L.origin[0], t1.m[5] + L.origin[1]], dp = out.report.drawnAt.s1;
  assert.ok(Math.hypot(at[0] - dp[0], at[1] - dp[1]) < 30, `its label by the pole: ${at} / ${dp}`);
});

test('the report: report.grid.sheets (each GEO sheet\'s name and square in metres) say what report.sheets says; the grid\'s handles; where each point is drawn', () => {
  for (const job of [madeUpJob(), madeUpJob({ labels: 'tidy' }), madeUpJob({ cell: 160, viewH: 160 })]) {
    const out = T.build(SEED_SQ, job), G = out.report.grid;
    assert.deepEqual(G.sheets.map((s) => `${s.sheet}: ${s.name}`), out.report.sheets, 'the same sheets, names and order');
    for (const s of G.sheets) {
      near(s.box[2] - s.box[0], G.cell, 1e-6, `${s.name}: a cell wide`); near(s.box[3] - s.box[1], G.cell, 1e-6, `${s.name}: a cell high`);
      const k = (s.box[0] - G.geo[0]) / G.cell, j = (s.box[1] - G.geo[1]) / G.cell; near(k, Math.round(k), 1e-6, 'on the grid'); near(j, Math.round(j), 1e-6, 'on the grid');
    }
    for (const [id, p] of Object.entries(out.report.drawnAt)) assert.ok(G.sheets.some((s) => p[0] >= s.box[0] && p[0] <= s.box[2] && p[1] >= s.box[1] && p[1] <= s.box[3]), `${id} on a sheet`);
    assert.deepEqual(Object.keys(out.report.drawnAt).sort(), job.pts.map((p) => p.id).sort(), 'every point said');
    const H = new Set(G.ents); let lines = 0, names = 0;
    for (const m of out.text.matchAll(/\n *0\r?\n(LWPOLYLINE|MTEXT)\r?\n *5\r?\n([0-9A-F]+)\r?\n/g)) if (H.has(m[2])) { if (m[1] === 'LWPOLYLINE') lines++; else names++; }
    assert.ok(lines >= G.sheets.length && names >= G.sheets.length, `the grid's lines ${lines} and names ${names}`);
  }
});

test('byte for byte: the DXF and its PDF as beta 7.8 made them (without and with a photo placed by hand, Standard and Tidy, both templates)', async () => {
  // [template, job, DXF, PDF]: the SHA-256 (first 16) beta 7.8's dxftpl.js and dxfpdf.js make of them (the PDF with the made-up photos, uncompressed)
  const WANT = [['square', 'no pins', '8887512a8534ff52', 'aa141102f4a0d44b'], ['square', 'pins', '7c55489c3c84d998', '0a502d06f2c51a2f'], ['square', 'tidy', '83d1cca347eff0c5', '6c20870ffbe6b439'],
    ['made-up', 'no pins', '66c9f91d94788f1c', '75e7db14dd22da59'], ['made-up', 'pins', '253d992a0ccbc27d', '75e7db14dd22da59'], ['made-up', 'tidy', 'fcac780ce81102fe', '0c1fd5fdc37cbe09']];
  const V = { 'no pins': {}, pins: { phPin: { s3: [20, 25] } }, tidy: { labels: 'tidy' } }, got = [];
  for (const [sn, vn] of WANT) { const out = T.build(sn === 'square' ? SEED_SQ : SEED, madeUpJob(V[vn])), pdf = await PDF.toPdf(out.text, { images: IMAGES, title: 'MADE-UP PLAN' }); got.push([sn, vn, sha(out.text), sha(Buffer.from(pdf))]); }
  assert.deepEqual(got, WANT, 'the DXF and the PDF as beta 7.8 made them');
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
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
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
  await page.addStyleTag({ content: '#toast{display:none!important}' }); // (the map's "no internet" note: not over the drawing's pixels)
  // a made-up photo for every pole (600 x 800), kept as the camera keeps them
  await page.evaluate(async (ids) => { for (const id of ids) { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, POLES.map((p) => p[0]));
  if (o.seed !== false) await page.evaluate(async (text) => { // the made-up template on the phone, as a loaded template file is kept
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-square.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED_SQ);
  // the builder on the page for the exports (the Drawing's preview has a worker of its own): each export's job pins and report kept
  await page.evaluate(async () => {
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ phPin: JSON.parse(JSON.stringify(job.phPin)), at: JSON.parse(JSON.stringify(out.report.photoAt)), sheets: out.report.sheets.slice() }); return out; };
  });
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const ph = (page) => page.evaluate(() => window.__polecam.drwPh());
/** The Drawing, opened (Back first to the main screen), looking at the first four poles and their photos. */
async function drawing(page) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(7.10465 - 0.00016, 125.60154, 0.4, r.width / 2, r.height * 0.45); });
}
/** Until the plan is shown and not being made again (when: what else it must show). */
async function shown(page, when) {
  let s = null; for (let i = 0; i < 160; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); await editOn(page); return pl(page); } } // ((beta 7.14, View / Edit) shown: Edit on, to change it)
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
/** Export › Plan drawing (each question answered as a user going on would): the job's pins, the report's photo places and sheets. */
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
/** The canvas's pixels along a segment (page pixels a → b), n of them. */
const pixels = (page, a, b, n) => page.evaluate(([a, b, n]) => { const cv = document.getElementById('drawCanvas'), r = cv.getBoundingClientRect(), d = cv.width / r.width, g = cv.getContext('2d'), out = [];
  for (let k = 0; k <= n; k++) { const x = (a[0] + (b[0] - a[0]) * k / n - r.left) * d, y = (a[1] + (b[1] - a[1]) * k / n - r.top) * d; out.push([...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3)); } return out; }, [a, b, n]);
const isRed = ([r, g, b]) => r > 190 && g < 110 && b < 110, isNavy = ([r, g, b]) => Math.abs(r - 28) < 30 && Math.abs(g - 63) < 30 && Math.abs(b - 148) < 30, isMag = ([r, g, b]) => r > 140 && g < 110 && b > 160;
/** Drag a photo's frame by (dx, dy) page pixels. */
async function drag(page, F, dx, dy) { await page.mouse.move(F.x, F.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(F.x + dx * k / 10, F.y + dy * k / 10); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(300); }

test('the Drawing draws the plan as its PDF prints it, with its sheets as boxes and names (those of report.sheets); Sheet grid hides them', async () => {
  const { ctx, page, errors } = await open();
  await drawing(page);
  const s = await shown(page, (x) => x.count && x.count.pictures === 8);
  assert.equal(s.sheet, 'GEO'); assert.ok(s.count.lines > 10 && s.count.texts > 20 && s.count.points > 100, JSON.stringify(s.count));
  assert.ok(s.drawn && s.drawn.paths > 0 && s.drawn.texts > 0, `drawn: ${JSON.stringify(s.drawn)}`);
  // a pixel on the plan's cable has its red (the plan's line, not the Drawing's own navy)
  const C = await page.evaluate(() => window.__polecam.drwPlanProbe('#ff0000')); assert.ok(C, 'the plan has its red cable');
  const px = await pixels(page, C.a, C.b, 24); assert.ok(px.filter(isRed).length >= 6, `red along the cable: ${JSON.stringify(px)}`); assert.equal(px.filter(isNavy).length, 0, 'none of the Drawing\'s own cable');
  // the hint and the legend say what it is
  assert.match(await page.evaluate(() => document.getElementById('drawHint').textContent), /^The plan as its PDF prints it \(UTM 51N metres\): 8 poles, 7 spans, 1 sheet \(B-2\)\..* Photos sit where the plan puts them: drag one to place it by hand\.$/);
  assert.match(await page.evaluate(() => document.getElementById('drawLegendBody').textContent), /The plan as its PDF prints it/);
  // the sheets: boxes with their names, the export's (report.sheets)
  await page.evaluate(() => document.getElementById('drawFit').click()); await page.waitForTimeout(300);
  const g1 = await pl(page); assert.ok(g1.gridOn && g1.gridDrawn.length === g1.sheets.length && g1.sheets.length >= 1, JSON.stringify(g1.gridDrawn));
  const L1 = g1.gridDrawn[0], lab = await pixels(page, [L1.x - 10, L1.y - 8], [L1.x + 10, L1.y - 8], 10); assert.ok(lab.filter(isMag).length >= 8, `its name on its colour: ${JSON.stringify(lab)}`); // (above its letters)
  // Sheet grid (in the legend): off, no box nor name; on again
  await page.evaluate(() => { document.getElementById('drawLegend').open = true; }); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => !document.getElementById('drawGridRow').hidden && document.getElementById('drawGrid').checked), true, 'Sheet grid in the legend, ticked');
  await page.click('#drawGrid'); await page.waitForTimeout(250);
  const g2 = await pl(page); assert.equal(g2.gridOn, false); assert.deepEqual(g2.gridDrawn, []);
  assert.equal((await pixels(page, [L1.x - 10, L1.y - 8], [L1.x + 10, L1.y - 8], 10)).filter(isMag).length, 0, 'no name drawn');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('polecam.settings')).drawGrid), false, 'kept');
  await page.click('#drawGrid'); await page.waitForTimeout(250); assert.equal((await pl(page)).gridDrawn.length, g1.sheets.length, 'shown again');
  const e = await exportPlan(page);
  assert.deepEqual(g1.sheets.map((x) => `${x.sheet}: ${x.name}`), e.sheets, 'the names of the export\'s sheets');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Regenerate plan preview (busy at once, then made); a photo dragged is kept and the export has it; Back to automatic for every photo placed by hand, asked first', async () => {
  const { ctx, page, errors } = await open();
  await drawing(page); const s0 = await shown(page);
  // Regenerate: at once disabled and said, then a new preview, said made
  const now = await page.evaluate(() => { document.getElementById('drawRegen').click(); return window.__polecam.drwPlan(); });
  assert.ok(now.busy && now.regen.disabled && /^Making the plan preview/.test(now.regen.say), JSON.stringify(now.regen));
  const s1 = await shown(page, (x) => x.n > s0.n);
  assert.equal(s1.regen.disabled, false); assert.match(s1.regen.say, /^Plan preview made \(\d+\.\d s\)$/); assert.equal(s1.made, s0.made + 1, 'one more preview made');
  assert.deepEqual(s1.count.items, s0.count.items, 'the same plan');
  // drag s2's photo 60 px right and 40 px up: kept, by hand on the plan, the frame where the plan puts it
  let F = (await ph(page)).frames.find((f) => f.id === 's2'); assert.ok(F, 'its frame'); const A = (await ph(page)).at.s2, sc = (await ph(page)).sc;
  await drag(page, F, 60, -40);
  const pin = (await ph(page)).pins.s2; assert.ok(Array.isArray(pin), 'kept'); near(pin[0], A.x - A.dp[0] + 60 / sc, 0.02, 'pin E'); near(pin[1], A.y - A.dp[1] + 40 / sc, 0.02, 'pin N');
  await shown(page, () => true); for (let i = 0; i < 80 && (await ph(page)).at.s2.how !== 'by hand'; i++) await page.waitForTimeout(250);
  const p2 = await ph(page); assert.equal(p2.at.s2.how, 'by hand');
  const f2 = p2.frames.find((f) => f.id === 's2'), w2 = await page.evaluate((a) => window.__polecam.drwPx(a.x, a.y), p2.at.s2); near(f2.x, w2[0], 0.6, 'frame x where the plan puts it'); near(f2.y, w2[1], 0.6, 'frame y');
  const e1 = await exportPlan(page); assert.deepEqual(e1.phPin, { s2: pin }); assert.equal(e1.at.s2.how, 'by hand');
  // a second one by hand: the chip says two; asked first (Cancel keeps them); Back to automatic takes both back
  await drawing(page); await shown(page); F = (await ph(page)).frames.find((f) => f.id === 's3'); await drag(page, F, -30, 60); // (s3's: clear of the round tools)
  assert.equal(Object.keys((await ph(page)).pins).length, 2, JSON.stringify({ F, pins: (await ph(page)).pins }));
  for (let i = 0; i < 40 && (await chgOf(page)).moved !== 2; i++) await page.waitForTimeout(250);
  { const C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 2], 'the chip ((beta 7.14, Changed by hand)): 2 moved'); assert.deepEqual(C.rows.map((r) => r.name).sort(), ['Photo of CC-9002', 'Photo of CC-9003']); }
  await allAutomatic(page); // ((beta 7.14) More › All automatic: the question the chip of 7.9-7.13 asked)
  assert.match(await page.evaluate(() => document.getElementById('askTitle').textContent), /^Back to automatic: 2 photos\?$/);
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Cancel').click()); await page.waitForTimeout(250);
  assert.equal(Object.keys((await ph(page)).pins).length, 2, 'Cancel: kept');
  await allAutomatic(page);
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  assert.deepEqual((await ph(page)).pins, {}); { const C = await chgOf(page); assert.deepEqual([C.moved, C.all], [0, 0], 'the chip: nothing changed by hand'); }
  assert.equal(await page.evaluate(() => 'phPin' in JSON.parse(localStorage.getItem('polecam.settings')).meta['DEMO DRAW TEST']), false, 'no pin kept');
  const s3 = await shown(page, () => true); for (let i = 0; i < 80 && Object.values((await ph(page)).at).some((a) => a.how === 'by hand'); i++) await page.waitForTimeout(250);
  assert.ok(Object.values((await ph(page)).at).every((a) => a.how === 'auto'), 'all back where the plan puts them'); void s3;
  const e2 = await exportPlan(page); assert.deepEqual(e2.phPin, {}); assert.ok(Object.values(e2.at).every((a) => a.how === 'auto'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a computer (1280 x 900): the plan beside Drawings; in Edit route the Drawing as before (live), the plan after; without the template, as before', async () => {
  let { ctx, page, errors } = await open({ desk: true });
  await drawing(page); const s = await shown(page);
  assert.equal(s.regen.hidden, false, 'Regenerate plan preview on the Drawing');
  assert.equal(await page.evaluate(() => { const r = document.getElementById('drawRegen').getBoundingClientRect(), c = document.getElementById('drawCanvas').getBoundingClientRect(); return r.width >= 44 && r.right <= c.right && r.top >= c.top; }), true, 'on the drawing');
  await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.drwEd().on), true, 'Edit route on');
  const e = await pl(page); assert.equal(e.on, false, 'in Edit route: the Drawing as before'); assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('drawRegen')).display), 'none');
  await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(400);
  assert.equal((await pl(page)).on, true, 'the plan again');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
  ({ ctx, page, errors } = await open({ desk: true, seed: false }));
  await drawing(page); await page.waitForTimeout(2500);
  const n = await pl(page); assert.equal(n.on, false); assert.equal(n.want, false); assert.equal(n.regen.hidden, true, 'no Regenerate without the template');
  assert.equal((await ph(page)).at, null, 'no plan places');
  assert.deepEqual(errors, []);
  await ctx.close();
});
