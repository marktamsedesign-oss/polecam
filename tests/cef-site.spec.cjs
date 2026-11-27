/* (stage 11, small) The owner (the CEF editor's Site tab, Site name and Site ID greyed): "the CEF plan shows the site details (name and ID) for
   the CEF project details.. CEF details can be the same as the project but can also be different so allow user to edit this details and adjust
   the drawing details export to pdf or plan. Soon this CEF will be the homing details required for the splicing details."
   Run: node --test tests/cef-site.spec.cjs (or python3 tests/run_all.py --only cef-site).
   A made-up As-Plan project (Project details: Site name DEMO_SITE, PLA ID DEMO-0002) with a site pin and its CEF plan (the editor's made-up
   sample site, not marked sample):
   - Site details: Site name and Site ID are the project's and can be changed (no longer greyed); the coordinates stay the pin's (greyed); no
     Same as the project while they are the project's; a plan never edited keeps no site.own.
   - Typed: the plan's own (site.own), Same as the project shows with the project's values; every output prints the plan's: the DXF on the
     generic CEF template and on a client's (their title blocks and cover), the older kind of DXF, the PDF (pdftotext), the KML, the README and
     the files' names, the Drawing export's CEF files (its folder); none prints the project's. The app reads them from one place
     (__polecam.cef.site, cefSiteOf in app.js).
   - Opened again: kept; the project's site name changed: the plan keeps its own, the hint names the project's new one. Same as the project: the
     project's again (no site.own). Only the ID typed: the name follows the project, the ID stays; the project's ID typed back: no longer own.
   Uses an isolated browser profile and a local HTTP server on a free port; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'cef-seed-made-up.dxf'), 'utf8');
const PDFTOTEXT = !spawnSync('pdftotext', ['-v']).error;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-cefsite-'));
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

const NAME = 'DEMO CEF SITE TEST', T0 = '2026-11-01T08:00:00.000Z', PROJ = 'DEMO RELOC', SERIAL = 'OWO-0000-002';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const RECS = [['s1', 'CC-9001', 7.10465, 125.6010], ['s2', 'CC-9002', 7.10470, 125.6050]].map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' } }))
  .concat([{ id: 'site1', project: NAME, element: 'Site', poleId: 'SITE-0001', status: 'Proposed', lat: 7.10490, lon: 125.6030, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name }]);
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  const SF = [['Project Name', PROJ], ['Serial Number', SERIAL], ['PLA ID', 'DEMO-0002'], ['Site name', 'DEMO_SITE']];
  await page.evaluate(async ({ RECS, NAME, USER, SF }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: [], cables24: true, siteFields: SF } } }));
  }, { RECS, NAME, USER, SF });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  return { ctx, page, errors };
}
/** The CEF plan of the site pin opened in its editor (start: with the made-up sample site, not marked sample), on its Site tab. */
async function cef(page, start) {
  assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { pin: 'site1' })), true);
  let fr = null;
  for (let i = 0; i < 80; i++) { await page.waitForTimeout(300); fr = page.frames().find((f) => /vendor\/cef\/cef\.html/.test(f.url())); if (fr && await fr.evaluate(() => !!(window.CEF && CEF.ready && CEF.ready())).catch(() => false)) break; fr = null; }
  assert.ok(fr, 'the editor is ready');
  if (start) await fr.evaluate(() => { const s = sampleSite(); s.sample = false; CEF.test.start(s); CEF.flush(); });
  await fr.evaluate(() => { openTab = 'site'; tab = tabSync = 'site'; sel = null; refresh(true); });
  await page.waitForTimeout(300);
  return fr;
}
const close = async (page) => { await page.evaluate(() => window.__cefHost.close()); await page.waitForTimeout(600); };
/** Types in a field of the Site tab as a user does (each key an input event, then the change when it is left). */
async function type(fr, k, v) {
  const sel = `#f_${k.replace(/\W/g, '_')}`;
  await fr.fill(sel, v); await fr.evaluate((s) => document.querySelector(s).dispatchEvent(new Event('change', { bubbles: true })), sel); await fr.waitForTimeout(250);
}
const form = (fr) => fr.evaluate(() => { const g = (k) => document.getElementById('f_' + k.replace(/\W/g, '_')), b = document.querySelector('[data-a="site-same"]');
  return { name: g('site.name').value, id: g('site.id').value, nameOff: g('site.name').disabled, idOff: g('site.id').disabled, latOff: g('site.lat').disabled, lonOff: g('site.lon').disabled, lat: g('site.lat').value, lon: g('site.lon').value,
    same: !!b, sameHint: b ? b.parentElement.querySelector('.sitesame').textContent : '', hints: [...document.querySelectorAll('.hint')].map((h) => h.textContent).join(' | '), who: document.getElementById('who').textContent }; });
const stored = (page) => page.evaluate(() => { const p = window.__polecam.cef.plans()[0]; return { id: p.id, site: p.sk.site }; });
const siteOf = (page, id) => page.evaluate(({ id }) => window.__polecam.cef.site(null, id), { id });
const setTpl = (page, t) => page.evaluate((t) => { window.__gesaaCefTplTest = t; }, t);
/** The editor's files (planFiles), as text (the DXF, the README, the KML) or base64 (the PDF). */
const files = (fr) => fr.evaluate(async () => {
  const F = await planFiles(), out = {};
  for (const f of F.files) { if (typeof f.data === 'string') out[f.name] = f.data; else { let bin = ''; const u = f.data; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); out[f.name] = 'b64:' + btoa(bin); } }
  return { tpl: F.tpl, files: out };
});
const pick = (F, re) => F.files[Object.keys(F.files).find((n) => re.test(n))];
const b64 = (s) => Buffer.from(String(s).replace(/^b64:/, ''), 'base64');
function pdfText(bytes) { const f = path.join(TMP, `cef-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`); fs.writeFileSync(f, bytes); return String(execFileSync('pdftotext', ['-layout', f, '-'])).replace(/\s+/g, ' '); }
/** Every text of a DXF (its group code 1 and 3 values: texts, attributes, MTEXT, in every space and block), either kind of DXF. */
function dxfTexts(text) { const L = String(text).split(/\r?\n/), out = []; for (let i = 0; i + 1 < L.length; i += 2) if (/^\s*[13]$/.test(L[i])) out.push(L[i + 1]); return out.join('\n'); }

test('Site details: the site name and ID are the project\'s and can be changed; the coordinates stay the pin\'s; a plan never edited keeps no site.own', async () => {
  const { ctx, page, errors } = await open();
  try {
    const fr = await cef(page, true), f = await form(fr);
    assert.equal(f.name, 'DEMO_SITE'); assert.equal(f.id, 'DEMO-0002');
    assert.equal(f.nameOff, false, 'Site name editable'); assert.equal(f.idOff, false, 'Site ID editable');
    assert.equal(f.latOff, true); assert.equal(f.lonOff, true, 'the coordinates locked to the pin');
    assert.equal(+f.lat, 7.1049); assert.equal(+f.lon, 125.603);
    assert.equal(f.same, false, 'no Same as the project while they are the project\'s');
    assert.match(f.hints, /The site name and ID are the project's to start with: change them here for this CEF plan only\. The coordinates come from the site pin of the project\./);
    const st = await stored(page);
    assert.equal(st.site.name, 'DEMO_SITE'); assert.equal(st.site.id, 'DEMO-0002'); assert.equal(st.site.own, undefined, 'never edited: no site.own');
    assert.deepEqual(await siteOf(page, st.id), { name: 'DEMO_SITE', id: 'DEMO-0002', own: [] });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('typed in Site details: the plan\'s own site name and ID, printed by every output (the template\'s DXF, the older DXF, the PDF, the KML, the names); Same as the project shows', async () => {
  const { ctx, page, errors } = await open();
  try {
    const fr = await cef(page, true);
    await type(fr, 'site.name', 'DEMO CEF SITE'); await type(fr, 'site.id', 'DEMO-CEF-01');
    const f = await form(fr);
    assert.equal(f.same, true, 'Same as the project shows');
    assert.equal(f.sameHint, 'The project\'s name and ID: DEMO_SITE · DEMO-0002');
    assert.equal(f.who, 'DEMO CEF SITE · DEMO-CEF-01');
    await fr.evaluate(() => CEF.flush());
    const st = await stored(page);
    assert.deepEqual([st.site.name, st.site.id, st.site.own], ['DEMO CEF SITE', 'DEMO-CEF-01', { name: 1, id: 1 }], 'kept in the plan (saved)');
    assert.deepEqual([st.site.lat, st.site.lon], [7.1049, 125.603], 'the coordinates the pin\'s');
    assert.deepEqual(await siteOf(page, st.id), { name: 'DEMO CEF SITE', id: 'DEMO-CEF-01', own: ['name', 'id'] }, 'read from one place');
    const no = (t, what) => { assert.ok(!t.includes('DEMO_SITE'), `${what}: not the project's site name`); assert.ok(!t.includes('DEMO-0002'), `${what}: not the project's PLA ID`); };
    // the DXF on the generic CEF template (its title blocks and cover), the PDF, the KML, the README, the names
    let F = await files(fr);
    assert.equal(F.tpl, 'G-eSAA generic CEF template');
    assert.ok(Object.keys(F.files).filter((n) => /\.(pdf|dxf|kml|json)$/.test(n)).every((n) => n.startsWith('DEMO-CEF-01_')), `the files named by the plan's ID: ${Object.keys(F.files).join(', ')}`);
    { const t = dxfTexts(pick(F, /_CEF_sheets\.dxf$/)); assert.ok(t.includes('DEMO CEF SITE') && t.includes('DEMO-CEF-01'), 'the DXF on the template: the plan\'s name and ID'); no(t, 'the DXF on the template'); }
    { const k = pick(F, /\.kml$/); assert.ok(k, 'a KML'); assert.match(k, /<name>DEMO CEF SITE DEMO-CEF-01<\/name>/); no(k, 'the KML'); }
    assert.match(pick(F, /README\.txt$/), /Site: DEMO CEF SITE {2}ID: DEMO-CEF-01/);
    if (PDFTOTEXT) { const t = pdfText(b64(pick(F, /_CEF\.pdf$/))); assert.ok(t.includes('DEMO CEF SITE') && t.includes('DEMO-CEF-01'), 'the PDF'); no(t, 'the PDF'); }
    // on a client's CEF template
    await setTpl(page, { name: 'DEMO CLIENT A3', text: SEED, look: null });
    F = await files(fr); assert.equal(F.tpl, 'DEMO CLIENT A3');
    { const t = dxfTexts(pick(F, /_CEF_sheets\.dxf$/)); assert.ok(t.includes('DEMO CEF SITE') && t.includes('DEMO-CEF-01'), 'the DXF on the client\'s template'); no(t, 'the DXF on the client\'s template'); }
    if (PDFTOTEXT) { const t = pdfText(b64(pick(F, /_CEF\.pdf$/))); assert.ok(t.includes('DEMO CEF SITE') && t.includes('DEMO-CEF-01'), 'the PDF on the client\'s template'); no(t, 'the PDF on the client\'s template'); }
    await setTpl(page, null);
    // the older kind of DXF (no layout tabs, the app's own frame)
    await fr.evaluate(() => { APP.dxf = { old: true }; });
    F = await files(fr);
    { const d = pick(F, /_CEF_sheets\.dxf$/); assert.ok(!/\nCEF-VP-DRAWING\r?\n/.test(d), 'the older kind'); const t = dxfTexts(d); assert.ok(t.includes('DEMO CEF SITE') && t.includes('DEMO-CEF-01'), 'the older DXF'); no(t, 'the older DXF'); }
    await fr.evaluate(() => { APP.dxf = {}; });
    // the Drawing export's CEF plans (made out of sight)
    await close(page);
    const job = await page.evaluate(async () => { const F = await window.__polecam.cef.planFiles(); const f = F.find((x) => /_CEF_sheets\.dxf$/.test(x.name)); return { names: F.map((x) => x.name), dxf: f && f.data }; });
    assert.ok(job.names.length && job.names.every((n) => n.startsWith('CEF_PLAN_DEMO-CEF-01/')), job.names.join(', '));
    { const t = dxfTexts(job.dxf); assert.ok(t.includes('DEMO CEF SITE') && t.includes('DEMO-CEF-01'), 'the Drawing export\'s CEF DXF'); no(t, 'the Drawing export\'s CEF DXF'); }
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('opened again: kept; the project renamed: the plan keeps its own; Same as the project; only the ID its own: the name follows the project', async () => {
  const { ctx, page, errors } = await open();
  try {
    let fr = await cef(page, true);
    await type(fr, 'site.name', 'DEMO CEF SITE'); await type(fr, 'site.id', 'DEMO-CEF-01');
    await close(page);
    await page.evaluate((N) => { const S = window.__polecam.S; S.meta[N] = { ...S.meta[N], siteFields: S.meta[N].siteFields.map(([k, v]) => [k, k === 'Site name' ? 'DEMO_SITE_NEW' : v]) }; window.__polecam.persist(); }, NAME);
    fr = await cef(page);
    let f = await form(fr);
    assert.deepEqual([f.name, f.id], ['DEMO CEF SITE', 'DEMO-CEF-01'], 'the plan keeps its own');
    assert.equal(f.sameHint, 'The project\'s name and ID: DEMO_SITE_NEW · DEMO-0002');
    await fr.click('[data-a="site-same"]'); await fr.waitForTimeout(300);
    f = await form(fr);
    assert.deepEqual([f.name, f.id, f.same, f.who], ['DEMO_SITE_NEW', 'DEMO-0002', false, 'DEMO_SITE_NEW · DEMO-0002'], 'Same as the project: the project\'s again');
    await fr.evaluate(() => CEF.flush());
    let st = await stored(page); assert.equal(st.site.own, undefined, 'no site.own');
    await fr.evaluate(() => document.getElementById('bUndo').click()); await fr.waitForTimeout(300);
    assert.deepEqual([(await form(fr)).name, (await form(fr)).id], ['DEMO CEF SITE', 'DEMO-CEF-01'], 'Undo brings the plan\'s own back');
    await fr.click('[data-a="site-same"]'); await fr.waitForTimeout(300);
    // only the ID its own: the name follows the project
    await type(fr, 'site.id', 'DEMO-CEF-02');
    f = await form(fr); assert.equal(f.sameHint, 'The project\'s ID: DEMO-0002');
    await close(page);
    await page.evaluate((N) => { const S = window.__polecam.S; S.meta[N] = { ...S.meta[N], siteFields: S.meta[N].siteFields.map(([k, v]) => [k, k === 'Site name' ? 'DEMO_SITE_3' : v]) }; window.__polecam.persist(); }, NAME);
    st = await stored(page);
    assert.deepEqual(await siteOf(page, st.id), { name: 'DEMO_SITE_3', id: 'DEMO-CEF-02', own: ['id'] }, 'one place: the project\'s name (as the editor will take it), the plan\'s ID');
    fr = await cef(page);
    f = await form(fr); assert.deepEqual([f.name, f.id], ['DEMO_SITE_3', 'DEMO-CEF-02'], 'the name follows the project, the ID stays the plan\'s');
    // the project's ID typed back: no longer the plan's own
    await type(fr, 'site.id', 'DEMO-0002'); await fr.evaluate(() => CEF.flush());
    f = await form(fr); assert.equal(f.same, false);
    st = await stored(page); assert.equal(st.site.own, undefined);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
