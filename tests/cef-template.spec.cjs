/* beta 7.15 (CEF template) (the owner: "dxf for asplan and cef must be based from a template dxf. Context: client requires a different
   template with a different text font style, drawing style size and thickness. By changing the template dxf, the app can now accomodate plan
   creation from different clients using its template."): the CEF plan's export in the app, on a project's CEF template.
   Run: node --test tests/cef-template.spec.cjs (or python3 tests/run_all.py --only cef-template).
   A made-up As-Plan project with a site pin and its CEF plan (the editor's made-up sample site); the made-up CEF template
   (tests/fixtures/cef-seed-made-up.dxf) handed in by the test stand-in for the project's template (window.__gesaaCefTplTest, read by the app
   when the files are made):
   - the editor's files (the Save ZIP files, planFiles): the DXF on the template, a sheet for each page of the DXF (its Pages of the DXF: the
     cover, contents, legend, isometric and top view), each with the client's frame and its fields filled; the PDF every page on the client's
     sheet (A3 landscape, the client's labels and logo, "n OF N", the project and site); the README says so
   - the editor's buttons: Both (ZIP) says the files are on the client's template; a template the CEF cannot be printed on (no CEF sheet): the
     app's own frame, and the note says why
   - the Drawing export's CEF plans (made out of sight, one plan after the other): on the template too
   - no template: the files as before (the DXF the app's own frame's, as the editor makes it without one)
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
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
const T = require('../dxftpl.js');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'cef-seed-made-up.dxf'), 'utf8');
const PDFTOTEXT = !spawnSync('pdftotext', ['-v']).error;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-ceftpl-'));
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

const NAME = 'DEMO CEF TEMPLATE TEST', T0 = '2026-11-01T08:00:00.000Z', PROJ = 'DEMO RELOC', SERIAL = 'OWO-0000-002';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const RECS = [['s1', 'CC-9001', 7.10465, 125.6010], ['s2', 'CC-9002', 7.10470, 125.6050]].map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' } }))
  .concat([{ id: 'site1', project: NAME, element: 'Site', poleId: 'SITE-0001', status: 'Proposed', lat: 7.10490, lon: 125.6030, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name }]);
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
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
/** The CEF plan of the site pin, opened in its editor with the made-up sample site (not marked sample). pics: with a made-up photo placed
    on it (kept in the app's photo store, as the camera keeps one) and made-up logos. */
async function cef(page, pics) {
  if (pics) await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#5a8cc8'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#f0c828'; g.fillRect(40, 40, 120, 80);
    window.__demoJpg = c.toDataURL('image/jpeg', 0.9); await window.__polecam.cef.keep('cefpDEMO1', await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))); });
  assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { pin: 'site1' })), true);
  let fr = null; for (let i = 0; i < 80 && !fr; i++) { await page.waitForTimeout(300); fr = page.frames().find((f) => /vendor\/cef\/cef\.html/.test(f.url())); }
  await fr.waitForFunction(() => window.CEF && CEF.ready && CEF.ready(), null, { timeout: 30000 });
  const jpg = pics ? await page.evaluate(() => window.__demoJpg) : null;
  await fr.evaluate(async (jpg) => { const s = sampleSite(); s.sample = false;
    if (!jpg) { CEF.test.start(s); CEF.flush(); return; }
    s.photos = [{ id: 'cefpDEMO1', w: 320, h: 240, placed: true, x: 6, y: 5, dir: 30, cap: 'DEMO GATE', at: '2026-11-01T08:00:00.000Z', from: 'camera' }]; CEF.test.load(s, { cefpDEMO1: jpg });
    const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#1e50a0'; g.beginPath(); g.arc(40, 40, 30, 0, 7); g.fill();      /* (a made-up logo: a PNG with a clear background) */
    await CEF.setLogos({ client: c.toDataURL('image/png') }); CEF.flush(); }, jpg);
  await page.waitForTimeout(500);
  return fr;
}
const setTpl = (page, t) => page.evaluate((t) => { window.__gesaaCefTplTest = t; }, t);
/** The editor's files (planFiles), as text (the DXF, the README) or base64 (the PDF). */
const files = (fr) => fr.evaluate(async () => {
  const F = await planFiles(), out = {};
  for (const f of F.files) { if (typeof f.data === 'string') out[f.name] = f.data; else { let bin = ''; const u = f.data; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); out[f.name] = 'b64:' + btoa(bin); } }
  return { tpl: F.tpl, err: F.tplErr, files: out };
});
const pick = (F, re) => F.files[Object.keys(F.files).find((n) => re.test(n))];
const b64 = (s) => Buffer.from(String(s).replace(/^b64:/, ''), 'base64');
/** The PDF's pages: their text (pdftotext; null without it) and size in points. */
function pdfPages(bytes) {
  const f = path.join(TMP, `cef-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`); fs.writeFileSync(f, bytes);
  const n = +String(execFileSync('pdfinfo', [f])).match(/Pages:\s+(\d+)/)[1], size = String(execFileSync('pdfinfo', [f])).match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  return { n, size: size ? [+size[1], +size[2]] : null, text: Array.from({ length: n }, (_, i) => String(execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), '-layout', f, '-'])).replace(/\s+/g, ' ')) };
}
/** The DXF's sheets in their tab order, each with the texts of its paper space (the template's frame and fields). */
function sheetsOf(text) {
  const d = new T.Doc(text), S = T.structure(d), get = (r, c) => { const p = r.find((x, i) => i > 0 && x[0] === c); return p ? p[1] : undefined; };
  const L = S.layouts.filter((q) => q.name !== 'Model').sort((a, b) => +get(a.rec, 71) - +get(b.rec, 71));
  return L.map((q) => { const br = S.br.get(q.brh), bn = get(br, 2), ents = bn === '*Paper_Space' ? S.E.filter((e) => String(get(e, 67) || '0').trim() === '1') : S.blocks.get(bn).ents;
    return { name: q.name, layers: ents.map((e) => get(e, 8)), texts: ents.filter((e) => ['TEXT', 'MTEXT', 'ATTRIB'].includes(e[0][1])).map((e) => String(get(e, 1) || '')) }; });
}

test('the editor\'s files on the project\'s CEF template: the DXF a sheet for each page on the client\'s sheet, its fields filled; the PDF every page so', { skip: !PDFTOTEXT && 'needs pdftotext and pdfinfo (poppler)' }, async () => {
  const { ctx, page, errors } = await open(), fr = await cef(page, true);
  await setTpl(page, { name: 'DEMO CLIENT A3', text: SEED, look: null });
  const F = await files(fr), dxf = pick(F, /_CEF_sheets\.dxf$/), readme = pick(F, /README\.txt$/);
  assert.equal(F.tpl, 'DEMO CLIENT A3'); assert.equal(F.err, '');
  const sh = sheetsOf(dxf), today = await fr.evaluate(() => isoDate());
  assert.deepEqual(sh.map((s) => s.name), ['COVER PAGE', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW'], 'the DXF\'s pages (its Pages of the DXF: no details, no photos)');
  sh.forEach((s, i) => {
    assert.ok(s.layers.includes('DEMO-BORDER') && s.layers.includes('DEMO-TITLE'), `${s.name}: the client's frame and title block`);
    for (const t of [`${i + 1} OF 5`, today, PROJ, SERIAL, 'JUAN DELA CRUZ', 'DEMO CONTRACTOR']) assert.ok(s.texts.some((x) => x.includes(t)), `${s.name}: ${t} in its title block`);
  });
  assert.ok(!/@@\w+@@/.test(dxf), 'no field left');
  assert.ok(/\r\nIMAGEDEF\r\n[\s\S]*?\r\n {2}1\r\nlogos\/client_logo\.png\r\n/.test(dxf), 'the cover\'s logo: a linked picture, as on the app\'s frame (the title block\'s are the client\'s)');
  assert.match(readme, /TEMPLATE\r\n {2}The sheets are on the client's CEF template DEMO CLIENT A3/);
  const P = pdfPages(b64(pick(F, /_CEF\.pdf$/)));
  assert.equal(P.n, 7, 'the PDF: every page (the details and the photos too)');
  assert.ok(Math.abs(P.size[0] - 1190.55) < 1 && Math.abs(P.size[1] - 841.89) < 1, `A3 landscape: ${P.size}`);
  P.text.forEach((t, i) => { for (const w of ['DEMO CLIENT', 'PROJECT', 'COORDINATES (WGS84)', `${i + 1} OF 7`, PROJ]) assert.ok(t.includes(w), `PDF page ${i + 1}: ${w}`); });
  for (const [i, w] of [[0, 'COVER PAGE'], [3, 'ISOMETRIC DETAIL'], [4, 'TOP VIEW'], [5, 'DETAILS'], [6, 'SITE PHOTOS'], [6, 'DEMO GATE']]) assert.ok(P.text[i].includes(w), `PDF page ${i + 1}: ${w}`);
  assert.ok(!P.text.some((t) => /GENERIC FRAME/.test(t)), 'not the app\'s generic frame');
  { const f = path.join(TMP, 'pics.pdf'); fs.writeFileSync(f, b64(pick(F, /_CEF\.pdf$/))); const L = String(execFileSync('pdfimages', ['-list', f])).split('\n').slice(2).filter((x) => x.trim()).map((x) => x.trim().split(/\s+/));
    assert.ok(L.some((x) => x[0] === '1' && x[2] === 'image') && L.some((x) => x[0] === '7' && x[2] === 'image' && x[3] === '320' && x[4] === '240'), `the cover's logo and the photo are printed: ${L.map((x) => x.slice(0, 5).join(' ')).join(' | ')}`); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the editor\'s buttons: Both (ZIP) says the files are on the client\'s template; a template the CEF cannot be printed on: the app\'s frame, and why', async () => {
  const { ctx, page, errors } = await open(), fr = await cef(page);
  const zip = async (kind) => fr.evaluate(async (kind) => { const got = []; dl.save = async (o) => { got.push(o); }; await doExport(kind || 'zip'); return { n: got.length, name: got[0] && got[0].filename, msg: (msg && msg.t) || '' }; }, kind);
  await setTpl(page, { name: 'DEMO CLIENT A3', text: SEED, look: null });
  let r = await zip(); assert.equal(r.n, 1); assert.match(r.msg, /The ZIP is ready: .*_CEF\.zip\. On the client's template DEMO CLIENT A3\./);
  r = await zip('pdf'); assert.match(r.msg, /The PDF is ready: .*_CEF\.pdf\. On the client's template DEMO CLIENT A3\./);
  // the DXF of the older kind (no layouts): on the app's frame, and the note says so; the PDF printer failing: the PDF on the app's frame, and why
  await fr.evaluate(() => { APP.dxf = { old: true }; }); r = await zip(); assert.match(r.msg, /On the client's template DEMO CLIENT A3\. The DXF of the older kind has no layouts: it is on the app's own frame\./);
  await fr.evaluate(() => { APP.dxf = {}; }); await page.evaluate(() => { window.__cefHost.cefPdf0 = window.__cefHost.cefPdf; window.__cefHost.cefPdf = async () => { throw new Error('demo printer failure'); }; });
  r = await zip(); assert.match(r.msg, /The PDF could not be made on the client's template DEMO CLIENT A3 \(demo printer failure\): on the app's own frame\./);
  await page.evaluate(() => { window.__cefHost.cefPdf = window.__cefHost.cefPdf0; });
  await setTpl(page, { name: 'DEMO BROKEN', text: SEED.replace(/\nCEF\r?\n/g, '\nNOT A CEF SHEET\n'), look: null });
  r = await zip(); assert.equal(r.n, 1); assert.match(r.msg, /The client's template could not be used \(the template has no CEF sheet\): the sheets are on the app's own frame\./);
  const F = await files(fr); assert.equal(F.tpl, ''); assert.match(pick(F, /_CEF_sheets\.dxf$/), /G-eSAA CEF DXF R2000/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the Drawing export\'s CEF plans (made out of sight) on the template too; no template: the files as before', async () => {
  const { ctx, page, errors } = await open(); await cef(page);
  await page.evaluate(() => window.__polecam.cef.frame && document.querySelector('#cefSheet') && history.back()); await page.waitForTimeout(800);
  await setTpl(page, { name: 'DEMO CLIENT A3', text: SEED, look: null });
  const job = await page.evaluate(async () => { const F = await window.__polecam.cef.planFiles(); const f = F.find((x) => /_CEF_sheets\.dxf$/.test(x.name)); return { names: F.map((x) => x.name), dxf: f && f.data }; });
  assert.ok(job.dxf && job.names.every((n) => /^CEF_PLAN_/.test(n)), job.names.join(', '));
  assert.deepEqual(sheetsOf(job.dxf).map((s) => s.name), ['COVER PAGE', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW']);
  assert.ok(sheetsOf(job.dxf).every((s) => s.layers.includes('DEMO-BORDER')), 'every sheet on the client\'s frame');
  // no template: the DXF of the app's own frame, as the editor makes it without one
  await setTpl(page, null);
  const fr = await cef(page), F = await files(fr), want = await fr.evaluate(async () => sheetsDXF(dxfSheets(appSketch(ROOT)), { dims: await picDims(appSketch(ROOT)) }));
  assert.equal(F.tpl, ''); assert.ok(pick(F, /_CEF_sheets\.dxf$/) === want, 'the DXF as before, byte for byte'); assert.ok(!/DEMO-BORDER/.test(want));
  assert.ok(!/TEMPLATE\r\n/.test(pick(F, /README\.txt$/)));
  assert.deepEqual(errors, []);
  await ctx.close();
});
