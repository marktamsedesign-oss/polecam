/* beta 7.6 / 2.45.8 (the owner: "geotag settings on the photo stamp is being used on the plan"): Export › Photos with their locations ›
   Same stamp on the plan's photos (off at first). Run: node --test tests/geotag-plan-stamp.spec.cjs (or python3 tests/run_all.py --only geotag).
   A made-up As-Plan project, 4 poles with a made-up photo each (600 x 800, light, colour in its upper half).
   - The tick: off by default and for settings kept before it existed; kept when ticked (the card and Settings › Exports and files show
     it); greyed with "Only with Stamp on the photo files" while that is off.
   - Off: the plan's photos get Plan style's lat, long band as before (planStamp's lines), none of the geotag band's lines.
   - On: the plan's photos get the geotag band exactly as the photo ZIP draws it (the same lines, as many times; the band as tall, dark
     at the photo's foot), not the lat, long band; the photo ZIP's own photos unchanged (byte for byte, but for the export time in their
     EXIF). Plan style › Stamp on the plan's photos says the geotag stamp is used, and its Change › opens the tick in Export.
   - Find a setting (Plan style) finds the Stamp row for "same stamp on the plan's photos"; the Tutorial's search finds the step.
   The plan is exported on a stand-in template that the builder refuses once the photos are made (their stamps are read as they are
   drawn), or on the company template when there is one (GESAA_PRIVATE/template/seed.dxf, or tests/private/template/seed.dxf).
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const PRIV = process.env.GESAA_PRIVATE || path.join(__dirname, 'private'), SEED = path.join(PRIV, 'template', 'seed.dxf'), HAVE_SEED = fs.existsSync(SEED);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-geostamp-'));
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
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); fs.rmSync(TMP, { recursive: true, force: true }); });

const NAME = 'DEMO STAMP TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = [['s1', 'CC-9001', 7.10465, 125.6010], ['s2', 'CC-9002', 7.10470, 125.6050], ['s3', 'CC-9003', 7.10478, 125.6100], ['s4', 'CC-9004', 7.11000, 125.6050]];
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' } }));
/* in the page: each text drawn on a canvas (__ft), and each 600 x 800 photo canvas made into a file: its light at the foot and in the middle,
   and how far up from its foot the dark band reaches (__cv) */
function spy() {
  const f = CanvasRenderingContext2D.prototype.fillText; window.__ft = [];
  CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { try { window.__ft.push(String(t)); } catch (e) { /* */ } return f.call(this, t, ...a); };
  const tb = HTMLCanvasElement.prototype.toBlob; window.__cv = [];
  HTMLCanvasElement.prototype.toBlob = function (...a) {
    try { if (this.width === 600 && this.height === 800) { const d = this.getContext('2d').getImageData(0, 0, 600, 800).data, row = (y) => { let s = 0; for (let x = 0; x < 600; x += 4) { const i = (y * 600 + x) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; } return s / 150; };
      const mean = (y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) s += row(y); return s / (y1 - y0); }; let top = 800; for (let y = 799; y >= 360 && row(y) < 140; y--) top = y;
      window.__cv.push({ foot: Math.round(mean(752, 800)), mid: Math.round(mean(440, 480)), band: 800 - top }); } } catch (e) { /* */ }
    return tb.apply(this, a);
  };
}
async function open(extra = {}, init = true) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(spy);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (init) {
    await page.goto(base + 'manifest.json');
    await page.evaluate(async ({ RECS, NAME, USER, extra }) => {
      await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
        meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: [], cables24: true } }, ...extra }));
    }, { RECS, NAME, USER, extra });
  }
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  return { ctx, page, errors };
}
/** The made-up photos (light, colour only in the upper half), kept as the camera keeps them. */
const photos = (page) => page.evaluate(async (ids) => { for (const id of ids) { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800);
  for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${i * 47 % 360},55%,55%)`; g.fillRect((i * 97) % 560, (i * 53) % 330, 36, 36); } g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
  const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)); await window.__polecam.cef.keep(id, b); } }, POLES.map((p) => p[0]));
const set = (page, o) => page.evaluate((o) => { Object.assign(window.__polecam.S.exp, o); window.__polecam.persist(); }, o);
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
/** Runs an Export row's button; questions answered as a user going on would. Returns { ft, cv, file } (file: what was made). made: when it is done. */
async function exportRow(page, id, made) {
  await closeAll(page); await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(900);
  await page.evaluate((id) => { window.__ft = []; window.__cv = []; document.getElementById('resultBox').hidden = true; document.getElementById(id).click(); }, id);
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden, busy: !document.getElementById('busy').hidden }));
    if (s.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (s.res || (made && !s.busy && await page.evaluate(made))) break;
  }
  const out = await page.evaluate(() => ({ ft: window.__ft.slice(), cv: window.__cv.slice() }));
  if (await page.evaluate(() => !document.getElementById('resultBox').hidden)) { const dl = page.waitForEvent('download', { timeout: 60000 }); await page.click('#resSave'); const d = await dl; out.file = path.join(TMP, `${Date.now()}-${d.suggestedFilename()}`); await d.saveAs(out.file); }
  return out;
}
/** The plan (Export › Plan drawing) on the company template when there is one, else on a stand-in the builder refuses once the photos are made. */
async function plan(page) {
  const tpl = HAVE_SEED ? fs.readFileSync(SEED, 'utf8') : '  0\nSECTION\n  2\nENTITIES\n  0\nTEXT\n  1\n@@STAND_IN@@\n  0\nENDSEC\n  0\nEOF\n';
  await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; Object.assign(S.exp, { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files' }); S.dxfSeed = { name: 'seed.dxf', size: text.length, at: new Date().toISOString(), from: 'file', id: '' }; window.__polecam.persist();
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl; if (!T.__spy) { const real = T.build; T.__w = true; T.__spy = true; T.build = function (seed, job) { window.__built = (window.__built || 0) + 1; return real.call(this, seed, job); }; } // (on the page: its photos drawn here)
    window.__built = 0;
  }, tpl);
  return exportRow(page, 'doDxf', () => window.__built > 0);
}
const LL = (p) => `${p[2].toFixed(6)}, ${p[3].toFixed(6)}`;
const count = (L) => L.reduce((o, t) => { o[t] = (o[t] || 0) + 1; return o; }, {});
/** The ZIP's JPEGs, their export time in the EXIF (Exported by … · the date and time) taken out. */
function zipJpegs(file) {
  const dir = path.join(TMP, `z${Date.now()}`); fs.mkdirSync(dir); execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
  return Object.fromEntries(fs.readdirSync(dir).filter((n) => /\.jpg$/i.test(n)).sort().map((n) => [n, fs.readFileSync(path.join(dir, n)).toString('latin1').replace(/\w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2}( [AP]M)?/g, 'TIME')]));
}

test('Same stamp on the plan\'s photos: off by default and for settings from before it; kept when ticked; greyed with the stamp off', async () => {
  let { ctx, page, errors } = await open({ exp: { maxPx: 2048, stamp: true, stampFields: ['id', 'coords', 'addr', 'utm', 'time', 'by', 'project'] } }); // (an older phone's export settings: no stampOnPlan)
  const ui = () => page.evaluate(() => ({ v: window.__polecam.S.exp.stampOnPlan, card: document.getElementById('setStampPlan').checked, settings: document.getElementById('setStampPlan2').checked, dis: document.getElementById('setStampPlan').disabled, sub: document.getElementById('setStampPlanSub').textContent }));
  assert.deepEqual(await ui(), { v: false, card: false, settings: false, dis: false, sub: 'The plan’s photos get this caption band (the fields under More options) instead of lat, long and address' });
  await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(900);
  await page.evaluate(() => { const c = [...document.querySelectorAll('#export .xcard')].find((x) => x.querySelector('#doPhotos')); if (!c.classList.contains('xopen')) c.querySelector(':scope > .head').click(); });
  await page.waitForTimeout(500);
  await page.locator('#setStampPlan').scrollIntoViewIfNeeded(); await page.locator('#setStampPlan').tap(); await page.waitForTimeout(300);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('polecam.settings'))).exp.stampOnPlan, true, 'kept');
  await ctx.close();
  // a fresh page with the same profile is a new context here: the setting as kept is given to it
  ({ ctx, page, errors } = await open({ exp: { stamp: true, stampOnPlan: true } }));
  assert.deepEqual(await ui(), { v: true, card: true, settings: true, dis: false, sub: 'The plan’s photos get this caption band (the fields under More options) instead of lat, long and address' });
  await page.evaluate(() => { const el = document.getElementById('setStamp2'); el.checked = false; el.dispatchEvent(new Event('change')); });
  const off = await ui(); assert.equal(off.dis, true); assert.equal(off.sub, 'Only with Stamp on the photo files');
  assert.equal(await page.evaluate(() => document.getElementById('setStampPlan2').disabled), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('off: the plan\'s photos as before (Plan style\'s lat, long band); on: the photo ZIP\'s geotag band instead, the ZIP unchanged', async () => {
  const { ctx, page, errors } = await open();
  await photos(page);
  const z0 = await exportRow(page, 'doPhotos'), p0 = await plan(page);
  // off: the lat, long of each pole (planStamp), none of the geotag lines
  assert.ok(POLES.every((p) => p0.ft.includes(LL(p))), `planStamp's lines: ${p0.ft.filter((t) => /^\d+\.\d+, /.test(t)).join(' | ')}`);
  assert.ok(z0.ft.length >= 4 * 3 && !z0.ft.some((t) => p0.ft.includes(t)), 'no geotag line on the plan\'s photos');
  assert.equal(p0.cv.length, 4, 'the 4 plan photos made');
  await set(page, { stampOnPlan: true });
  const z1 = await exportRow(page, 'doPhotos'), p1 = await plan(page);
  // on: the ZIP's lines on the plan's photos, as many times; no lat, long band
  const zc = count(z1.ft), pc = count(p1.ft);
  assert.deepEqual(Object.keys(zc).filter((t) => (pc[t] || 0) !== zc[t]), [], 'each geotag line drawn as many times on the plan\'s photos as on the ZIP\'s');
  assert.ok(z1.ft.includes('CC-9001  ·  Concrete') && z1.ft.some((t) => /^7\.1046500, 125\.6010000 {3}±4\.2 m$/.test(t)) && z1.ft.some((t) => /^UTM 51N/.test(t)), z1.ft.slice(0, 5).join(' | '));
  assert.ok(!p1.ft.some((t) => /^\d+\.\d{6}, \d+\.\d{6}$/.test(t)), 'no lat, long band');
  // the band: the same height on the plan's photos as on the ZIP's (both 600 x 800 here), dark at the foot, the photo light above it
  assert.equal(p1.cv.length, 4); assert.equal(z1.cv.length, 4);
  p1.cv.forEach((c, i) => { assert.ok(c.foot < 140 && c.mid > 180 && Math.abs(c.band - z1.cv[i].band) <= 2 && c.band > 60 && c.band < 240, JSON.stringify({ plan: c, zip: z1.cv[i], off: p0.cv[i] })); });
  assert.notDeepEqual(p1.cv.map((c) => c.band), p0.cv.map((c) => c.band), 'another band than Plan style\'s');
  // the photo ZIP itself: the same files on and off
  const J0 = zipJpegs(z0.file), J1 = zipJpegs(z1.file);
  assert.deepEqual(Object.keys(J1), ['CC-9001.jpg', 'CC-9002.jpg', 'CC-9003.jpg', 'CC-9004.jpg']);
  assert.ok(Object.keys(J0).every((n) => J0[n] === J1[n]), 'the photo ZIP unchanged');
  if (HAVE_SEED && p1.file) { // the plan's README says which stamp
    const dir = path.join(TMP, 'plan'); fs.mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-o', '-q', p1.file, '-d', dir]);
    assert.match(fs.readFileSync(path.join(dir, 'README.txt'), 'utf8'), /each stamped at its foot with the geotag photo stamp \(Export › Photos with their locations: ID and type, lat \/ long, address, UTM, date and time, taken by, project\)/);
  }
  assert.deepEqual(errors.filter((e) => !/STAND_IN|not the G-eSAA drawing template|no GEO sheet/.test(e)), []);
  await ctx.close();
});

test('Plan style › Stamp on the plan\'s photos says the geotag stamp is used; Change › opens the tick; Find a setting and the Tutorial find it', async () => {
  const { ctx, page, errors } = await open({ exp: { dxfMode: 'tpl', stamp: true, stampOnPlan: true } });
  const style = async () => { await closeAll(page); await page.evaluate(() => window.__polecam.openPlanSet()); await page.waitForTimeout(700); };
  await style();
  const note = await page.evaluate(() => { const n = document.getElementById('stPhStampGeo'); return { shown: !n.hidden && n.getClientRects().length > 0, t: n.textContent, sum: document.getElementById('stSum') ? document.getElementById('stSum').textContent : '' }; });
  assert.ok(note.shown && /Using the geotag photo stamp instead \(Export › Photos with their locations › Same stamp on the plan's photos\)/.test(note.t), JSON.stringify(note));
  await page.locator('#stPhStampGeoGo').scrollIntoViewIfNeeded(); await page.locator('#stPhStampGeoGo').tap(); await page.waitForTimeout(1200);
  const there = await page.evaluate(() => { const el = document.getElementById('setStampPlan'), c = el.closest('.xcard'), r = el.getBoundingClientRect(); return { export: !document.getElementById('export').hidden, open: c.classList.contains('xopen'), inView: r.top >= 0 && r.bottom <= innerHeight && r.height > 0 }; });
  assert.deepEqual(there, { export: true, open: true, inView: true });
  // Find a setting
  await style();
  await page.evaluate(() => { document.querySelector('#drwStyle .dsbody').scrollTop = 0; }); await page.fill('#plFindQ', 'same stamp on the plan\'s photos'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => { const r = document.querySelector('#plFindRes .plfr b'); return r && r.textContent; }), 'Stamp on the plan\'s photos');
  // off: no note
  await set(page, { stampOnPlan: false }); await style();
  assert.equal(await page.evaluate(() => document.getElementById('stPhStampGeo').hidden), true);
  // the Tutorial's search
  await closeAll(page); await page.evaluate(() => document.getElementById('tutorialBtn').click()); await page.waitForTimeout(600);
  await page.fill('#tutQ', 'same stamp on the plan\'s photos'); await page.waitForTimeout(500);
  assert.match(await page.evaluate(() => document.getElementById('tutList').textContent), /Same stamp on the plan's photos/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
