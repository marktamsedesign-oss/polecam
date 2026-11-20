/* beta 7.6 / 2.45.8 (the owner: "PROJECT NAME is missing on the cover page (check side title pages as well) vs project details"):
   Project details' Project Name (Site details) on the plan's cover and every title block, and on the CEF plan's cover and every sheet's
   title strip, with the serial number. Run: node --test tests/project-name-title.spec.cjs (or python3 tests/run_all.py --only project-name).
   A made-up As-Plan project (4 poles, a site pin with its CEF plan), Project details: Project Name SAMPLE RELOC, Serial Number
   OWO-0000-001, PLA ID TBD, Site name SAMPLE_Reloc.
   - The plan: what the template's fields are filled with (the builder's input, read as the export hands it over): PROJECT_TYPE (the
     cover and the title block's DETAILED DRAWING DESIGN line) is the Project Name; the cover's site lines and every title block's
     serial number. No Project Name: no PROJECT_TYPE, as before.
     With the company template (GESAA_PRIVATE/template/seed.dxf, or tests/private/template/seed.dxf; skipped without): the plan DXF has
     the Project Name where the template had its field, no @@ field left; every page of the plan PDF that shows the serial number shows
     the Project Name too (with pdftotext).
   - The CEF plan whose own Project text is OLD PROJECT (made in another project): Project details' Project Name wins on the cover and
     every sheet's title strip, in the PDF and the DXF; the editor shows it filled and greyed, with a hint that it comes from Project
     details. The serial number on the cover and in every strip, the strip's lines inside it and apart, the cover's lines apart.
   - No Project Name and no serial number in Project details: the CEF plan's own text, editable, and the sheets as before (no serial line).
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

const root = path.resolve(__dirname, '..');
const PRIV = process.env.GESAA_PRIVATE || path.join(__dirname, 'private'), SEED = path.join(PRIV, 'template', 'seed.dxf'), HAVE_SEED = fs.existsSync(SEED);
const PDFTOTEXT = !spawnSync('pdftotext', ['-v']).error;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-projname-'));
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

const NAME = 'DEMO RELOC TEST', T0 = '2026-11-01T08:00:00.000Z', PROJ = 'SAMPLE RELOC', SERIAL = 'OWO-0000-001';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = [['s1', 'CC-9001', 7.10465, 125.6010], ['s2', 'CC-9002', 7.10470, 125.6050], ['s3', 'CC-9003', 7.10478, 125.6100], ['s4', 'CC-9004', 7.11000, 125.6050]];
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' } }))
  .concat([{ id: 'site1', project: NAME, element: 'Site', poleId: 'SITE-0001', status: 'Proposed', lat: 7.10490, lon: 125.6030, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name }]);
/** The app with the made-up project; o.proj / o.serial: Project details' Project Name and Serial Number ('' : none). */
async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  const SF = [['Project Name', o.proj == null ? PROJ : o.proj], ['Serial Number', o.serial == null ? SERIAL : o.serial], ['PLA ID', 'TBD'], ['Site name', 'SAMPLE_Reloc']];
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
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };

/* ---- the plan ---- */
/** Exports the plan (Export › Plan drawing, also a PDF), reading what the template's fields are filled with. tpl: the template's text
    (none: a stand-in that the builder refuses after its input is read). Returns { values, file } (file: the ZIP, when made). */
async function planExport(page, tpl) {
  await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; Object.assign(S.exp, { dxfMode: 'tpl', dxfPdf: true, dxfCef: false, planOut: 'files' }); S.dxfSeed = { name: 'seed.dxf', size: text.length, at: new Date().toISOString(), from: 'file', id: '' }; window.__polecam.persist();
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; window.__vals = []; T.__w = true; // (the builder on the page: its input read as it is handed over)
    T.build = function (seed, job) { window.__vals.push(JSON.parse(JSON.stringify(job.values || {}))); return real.call(this, seed, job); };
  }, tpl || '  0\nSECTION\n  2\nENTITIES\n  0\nTEXT\n  1\n@@STAND_IN@@\n  0\nENDSEC\n  0\nEOF\n');
  await closeAll(page); await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  let done = false;
  for (let i = 0; i < 400 && !done; i++) {
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden, busy: !document.getElementById('busy').hidden, n: window.__vals.length }));
    if (s.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    done = s.res || (!tpl && s.n > 0 && !s.busy);
  }
  const values = await page.evaluate(() => window.__vals[0] || null);
  let file = null;
  if (tpl && await page.evaluate(() => !document.getElementById('resultBox').hidden)) {
    const dl = page.waitForEvent('download', { timeout: 60000 }); await page.click('#resSave'); const d = await dl; file = path.join(TMP, `${Date.now()}-${d.suggestedFilename()}`); await d.saveAs(file);
  }
  return { values, file };
}
test('the plan: Project details\' Project Name is the cover\'s and every title block\'s PROJECT_TYPE; the serial number with the site', async () => {
  const { ctx, page, errors } = await open();
  const { values: V } = await planExport(page);
  assert.ok(V, 'the template was filled');
  assert.equal(V.PROJECT_TYPE, PROJ, 'PROJECT_TYPE: the cover and the DETAILED DRAWING DESIGN line of every title block');
  assert.deepEqual(V.SITE_NAME, { TITLE: ['SAMPLE_Reloc', 'TBD', SERIAL] }, 'the cover: site name, PLA ID, serial number');
  assert.deepEqual([V.LOCATION, V.SITE_ID], [{ PAGING: 'SAMPLE_Reloc_TBD' }, { PAGING: SERIAL }], 'every title block: SITENAME_PLAID, then the serial number');
  assert.deepEqual(errors.filter((e) => !/STAND_IN|not the G-eSAA drawing template|no GEO sheet/.test(e)), []);
  await ctx.close();
});
test('the plan with no Project Name in Project details: no PROJECT_TYPE, as before', async () => {
  const { ctx, page } = await open({ proj: '' });
  const { values: V } = await planExport(page);
  assert.ok(V, 'the template was filled');
  assert.equal('PROJECT_TYPE' in V, false);
  assert.deepEqual(V.SITE_ID, { PAGING: SERIAL });
  await ctx.close();
});
test('the plan on the company template: the Project Name where its field was, on the cover and in the title blocks (PDF: each page with the serial number)', { skip: HAVE_SEED ? false : `needs the company plan template (${SEED})` }, async () => {
  const seed = fs.readFileSync(SEED, 'utf8'), fields = (seed.match(/@@PROJECT_TYPE@@/g) || []).length;
  const { ctx, page, errors } = await open();
  const { values: V, file } = await planExport(page, seed);
  assert.equal(V.PROJECT_TYPE, PROJ); assert.ok(file, 'the plan ZIP was made');
  const dir = path.join(TMP, 'plan'); fs.mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
  const names = fs.readdirSync(dir), dxf = fs.readFileSync(path.join(dir, names.find((n) => /_PLAN_UTM\d+N\.dxf$/i.test(n))), 'utf8');
  assert.ok(fields >= 1, 'the template has the Project Name field (@@PROJECT_TYPE@@)');
  assert.ok((dxf.match(new RegExp(PROJ, 'g')) || []).length >= fields, `${PROJ} written ${fields} times at least (the template's fields: the cover, the title block)`);
  assert.equal(/@@PROJECT_TYPE@@/.test(dxf), false, 'no field left');
  if (PDFTOTEXT) {
    const pdf = path.join(dir, names.find((n) => /\.pdf$/i.test(n))), n = +String(execFileSync('pdfinfo', [pdf])).match(/Pages:\s+(\d+)/)[1], bad = [];
    for (let p = 1; p <= n; p++) { const t = String(execFileSync('pdftotext', ['-f', String(p), '-l', String(p), pdf, '-'])).replace(/\s+/g, ' '); if (t.includes(SERIAL) && !t.includes(PROJ)) bad.push(p); }
    assert.ok(String(execFileSync('pdftotext', ['-f', '1', '-l', '1', pdf, '-'])).replace(/\s+/g, ' ').includes(PROJ), 'the cover (page 1) shows the Project Name');
    assert.deepEqual(bad, [], 'pages with the serial number but no Project Name');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---- the CEF plan ---- */
/** The CEF plan of the site pin, its own Project text `link` (the editor's made-up sample site, not marked sample); what its sheets and
    its export files say, and the editor's Project field. */
async function cef(page, link) {
  assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { pin: 'site1' })), true);
  let fr = null; for (let i = 0; i < 80 && !fr; i++) { await page.waitForTimeout(300); fr = page.frames().find((f) => /vendor\/cef\/cef\.html/.test(f.url())); }
  await fr.waitForFunction(() => window.CEF && CEF.ready && CEF.ready(), null, { timeout: 30000 });
  await fr.evaluate((link) => { const s = sampleSite(); s.sample = false; s.site.link = link; CEF.test.start(s); CEF.flush(); }, link);
  await page.waitForTimeout(500);
  return fr.evaluate(async () => {
    const X = appSketch(ROOT), sheets = appSheets(X), txt = (sh) => sh.prims.filter((p) => p.k === 'tx').map((p) => ({ s: p.s, x: p.p[0], y: p.p[1], h: p.h, b: p.b, al: p.al, w: textW(p.s, p.h) * (p.b ? 1.08 : 1) }));
    const F = await planFiles(), data = (re) => F.files.find((f) => re.test(f.name)).data, pdf = data(/_CEF\.pdf$/);
    let bin = ''; for (let i = 0; i < pdf.length; i += 0x8000) bin += String.fromCharCode.apply(null, pdf.subarray(i, i + 0x8000));
    const el = document.getElementById(fid('site.link')), hint = [...document.querySelectorAll('.hint')].map((x) => x.textContent).find((t) => /comes from Project details|\(Project details\) goes on the cover/.test(t)) || '';
    return { pages: sheets.map((s) => ({ name: s.name, t: txt(s) })), strip: { x0: FR.sx0, x1: FR.sx1, w: SH.SW }, dxf: data(/_CEF_sheets\.dxf$/), pdf: btoa(bin), field: el ? { value: el.value, disabled: el.disabled } : null, hint };
  });
}
/** The texts of a sheet's title strip (the box of the project, site, title, sheet and plan kind), top to bottom. */
const stripOf = (pg, S) => pg.t.filter((t) => t.al === 'c' && Math.abs(t.x - (S.x0 + S.x1) / 2) < 1 && t.y > 24 && t.y < 66).sort((a, b) => b.y - a.y); // (its 42 mm box, 24 to 66 mm up the sheet)
const pdfPages = (b64) => { if (!PDFTOTEXT) return null; const f = path.join(TMP, `cef-${Date.now()}.pdf`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); const n = +String(execFileSync('pdfinfo', [f])).match(/Pages:\s+(\d+)/)[1]; return Array.from({ length: n }, (_, i) => String(execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), f, '-'])).replace(/\s+/g, ' ')); };
test('the CEF plan: Project details\' Project Name wins over the plan\'s own text, on the cover and every title strip; the serial number too', async () => {
  const { ctx, page, errors } = await open(), r = await cef(page, 'OLD PROJECT');
  assert.deepEqual(r.field, { value: PROJ, disabled: true }, 'the editor: the Project field filled from Project details, greyed');
  assert.match(r.hint, /comes from Project details in the app \(Site details › Project Name\)/);
  assert.match(r.hint, new RegExp(`serial number ${SERIAL} \\(Project details\\)`));
  const cover = r.pages[0].t.map((t) => t.s);
  assert.ok(cover.includes(PROJ) && cover.includes(SERIAL) && !cover.includes('OLD PROJECT'), `the cover: ${cover.join(' | ')}`);
  const framed = r.pages.slice(1), bad = []; // (every sheet but the cover has the title strip)
  for (const pg of framed) {
    const L = stripOf(pg, r.strip), s = L.map((t) => t.s);
    if (s[0] !== PROJ || s[1] !== 'TBD SAMPLE_RELOC' || s[2] !== SERIAL || s[3] !== 'CABLE ENTRANCE FACILITY' || s.length !== 6) bad.push(`${pg.name}: ${s.join(' | ')}`);
    L.forEach((t, i) => { if (t.w > r.strip.w - 6 + 1e-6) bad.push(`${pg.name}: ${t.s} wider than the strip`); if (i && L[i - 1].y - t.y < Math.max(L[i - 1].h, t.h) * 1.3) bad.push(`${pg.name}: ${L[i - 1].s} and ${t.s} too close`); });
  }
  assert.ok(framed.length >= 3); assert.deepEqual(bad, []);
  // the cover's lines apart: the site, the serial number, AS-PLAN (each from its baseline to its cap height)
  const C = r.pages[0].t.filter((t) => t.al === 'c' && t.h >= 9).sort((a, b) => b.y - a.y), i = C.findIndex((t) => t.s === SERIAL);
  assert.ok(i > 0 && i < C.length - 1, C.map((t) => t.s).join(' | '));
  assert.ok(C[i - 1].y - (C[i].y + C[i].h) >= 3 && C[i].y - (C[i + 1].y + C[i + 1].h) >= 3, `${C[i - 1].s} / ${C[i].s} / ${C[i + 1].s}`);
  assert.ok(!r.dxf.includes('OLD PROJECT') && (r.dxf.match(new RegExp(PROJ, 'g')) || []).length >= 3 && (r.dxf.match(new RegExp(SERIAL, 'g')) || []).length >= 3, 'the DXF: the cover and the title strips');
  const P = pdfPages(r.pdf);
  if (P) assert.deepEqual(P.map((t, k) => (t.includes(PROJ) && t.includes(SERIAL) && !t.includes('OLD PROJECT') ? 0 : k + 1)).filter(Boolean), [], 'PDF pages without the Project Name and serial number');
  assert.deepEqual(errors, []);
  await ctx.close();
});
test('the CEF plan with no Project Name and no serial number in Project details: its own text, editable, and the sheets as before', async () => {
  const { ctx, page, errors } = await open({ proj: '', serial: '' }), r = await cef(page, 'OLD PROJECT');
  assert.deepEqual(r.field, { value: 'OLD PROJECT', disabled: false });
  assert.equal(r.hint, '');
  for (const pg of r.pages.slice(1)) assert.deepEqual(stripOf(pg, r.strip).map((t) => t.s).slice(0, 3), ['OLD PROJECT', 'TBD SAMPLE_RELOC', 'CABLE ENTRANCE FACILITY'], pg.name);
  assert.ok(r.pages[0].t.some((t) => t.s === 'OLD PROJECT') && !r.pages.some((pg) => pg.t.some((t) => t.s === '')));
  assert.equal(r.pages[0].t.find((t) => t.s === 'AS-PLAN').y, 70, 'AS-PLAN where it was');
  assert.deepEqual(errors, []);
  await ctx.close();
});
