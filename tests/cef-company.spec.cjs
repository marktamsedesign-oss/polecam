/* (templates, company CEF template) The owner: "yes i want the CEF to be a dxf template same as the asplan", "replace the generic one but give me
   first a generic dxf as a starting point. Iwant this to be the standard for all my clients" and "downloading a template, editing it and loading
   it back; yes for admin". Run: node --test tests/cef-company.spec.cjs (or python3 tests/run_all.py --only cef-company).
   The online sheet is the real sheet script v2.43.6 (tests/regression/v243/sheet/PoleCam-online-sheet_v2.43.6.gs) on the in-memory spreadsheet of
   regression/v243/e2e/sheet_env.js, Google Drive a stand-in for it (made-up company CEF templates, tests/fixtures/cef-company-made-up.dxf, under
   made-up ids). Every name, email and place is made up.
   (stage 11, templates) The templates are the admin's (Administration › Plan templates), on the admin phone of a made-up company list (tests/tpl-admin.cjs;
   the online sheet is now v2.43.7, which serves a public Drive link as v2.43.6 did):
   - Plan templates › CEF plan: Published, the app's generic one at first (CEF plans printed on it); Testing › Load a DXF…: a plan template refused, saying
     why; the made-up company one checked (its kit counted) and kept; Use the testing templates on: every CEF plan printed on it (the DXF a copy of it on
     every sheet, the PDF printed so, the README and the export's note say so, "Testing template: not published", _TEST in the files' names); Download
     (testing): its style kit completed (the STYLE KEY sheet, the text style, the layer and the north arrow it lacked; the STYLE KEY's heights its own
     styles'); a 7.17 client template with a CEF sheet: Use as testing makes its CEF sheet the testing CEF template.
   - The admin shares one by its Drive link (Plan templates › CEF plan › or paste a Google Drive link): it goes with the company list and to the
     sheet; a user's phone gets it by itself through the sheet (cefseed=1) and prints its CEF plans on it; a newer one shared: got by itself.
   No page errors. Uses isolated browser contexts and a local HTTP server on a free port. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const T = require('../dxftpl.js');

const root = path.resolve(__dirname, '..');
const H = require('./tpl-admin.cjs');
const SH = H.sheet(path.join(__dirname, 'regression', 'v243', 'sheet', 'PoleCam-online-sheet_v2.43.7.gs')), env = SH.env; // ((stage 11, templates) the admin's list on v2.43.7)
const COMPANY = fs.readFileSync(path.join(__dirname, 'fixtures', 'cef-company-made-up.dxf'), 'utf8');
const COMPANY2 = COMPANY.replace(/DEMO TELCO STANDARD/g, 'DEMO TELCO STANDARD V2');
const CLIENT = fs.readFileSync(path.join(__dirname, 'fixtures', 'cef-seed-made-up.dxf'), 'utf8');
const SEED_SQ = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-square.dxf'), 'utf8');
const PDFTOTEXT = !spawnSync('pdftotext', ['-v']).error;
const SHEET = SH.url;
const ID1 = '1DemoCompanyCefTemplate000000001', ID2 = '1DemoCompanyCefTemplate000000002';
const ADMIN = { name: 'Ana Reyes', mobile: '09170000009', email: 'ana@demo-telco.example' };
const JUAN = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const NAME = 'DEMO CEF COMPANY TEST', T0 = '2026-11-01T08:00:00.000Z';
const RECS = [['s1', 'CC-9001', 7.10465, 125.6010], ['s2', 'CC-9002', 7.10470, 125.6050]].map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: JUAN.name, photos: [] }))
  .concat([{ id: 'site1', project: NAME, element: 'Site', poleId: 'SITE-0001', status: 'Proposed', lat: 7.10490, lon: 125.6030, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: JUAN.name, photos: [] }]);

/* the online sheet: the real script on its stand-in; Google Drive: the made-up company CEF templates by their ids (public links) */
const gs = SH.gs;
const tab = (n) => env.world.ss.getSheetByName(n);
const DRIVE = { [ID1]: { text: COMPANY, name: 'DEMO TELCO CEF template.dxf' }, [ID2]: { text: COMPANY2, name: 'DEMO TELCO CEF template v2.dxf' } };
env.world.urlFetch = (u) => {
  const id = (/[?&]id=([A-Za-z0-9_-]+)/.exec(u) || [])[1], f = DRIVE[id], resp = (code, text, head) => ({ getResponseCode: () => code, getContentText: () => text, getHeaders: () => head || {} });
  return f ? resp(200, f.text, { 'Content-Disposition': `attachment; filename="${f.name}"` }) : resp(404, 'Not Found');
};
const sheetLog = [];
let server, browser, base, team1 = null, ADMIN_ST = null;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if (rel === '/org.json') { res.writeHead(404).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fsp.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  ADMIN_ST = await H.makeAdmin(browser, base, SH); // ((stage 11, templates) Plan templates is the admin's)
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

/** A computer (1280 x 860). o.state: what the app keeps (null: a new phone). The online sheet answered by its stand-in; every other host refused. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', async (r) => {
    const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    if (u.startsWith(SHEET)) {
      const q = Object.fromEntries(new URL(u).searchParams), post = r.request().method() === 'POST', b = post ? r.request().postData() || '' : '';
      const out = post ? gs.doPost({ postData: { contents: b } }) : gs.doGet({ parameter: q });
      sheetLog.push(post ? { post: (() => { try { return JSON.parse(b).action; } catch (e) { return '?'; } })() } : { get: q.email || '', cefseed: q.cefseed || '' });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out.getContent() });
    }
    return r.abort();
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (o.state !== null) {
    await page.goto(base + 'manifest.json');
    await page.evaluate(async ({ RECS, state }) => {
      await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'); RECS.forEach((x) => tx.objectStore('points').put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      localStorage.setItem('polecam.settings', JSON.stringify(state));
    }, { RECS, state: o.state });
  }
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!window.__polecam.cefTpl && !!document.getElementById('exportBtn'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(() => { window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true }); });
  return { ctx, page, errors };
}
const state = (u, team) => ({ ...(u === null ? ADMIN_ST : {}), projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, ...(u ? { user: u } : {}), ...(team ? { team } : {}), v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
  meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: [], cables24: true, siteFields: [['Project Name', 'DEMO RELOC'], ['Serial Number', 'OWO-0000-002'], ['PLA ID', 'DEMO-0002'], ['Site name', 'DEMO_SITE']] } } });
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
async function until(page, fn, arg, s) { for (let i = 0; i < (s || 30) * 5; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(200); } throw new Error(`not so after ${s || 30} s: ${fn}`); }
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(400); } };
async function answer(page, label) {
  await until(page, () => !document.getElementById('askBox').hidden, null, 30);
  await page.evaluate((l) => { const b = [...document.querySelectorAll('#askBox .row button')].find((x) => x.textContent.trim() === l) || document.querySelector('#askBox .row button.primary'); b.click(); }, label); await page.waitForTimeout(300);
}
/** (stage 11, templates) Administration › Plan templates, and the CEF plan's two slots as it shows them. */
const planTemplates = (page) => H.admin(page);
const cefSlots = (page) => page.evaluate(() => ({ pub: document.getElementById('admTplCefPubSum').textContent, test: document.getElementById('admTplCefTestSum').textContent, down: document.getElementById('admTplCefPubDown').textContent }));
/** The CEF plan of the site pin, opened in its editor with the made-up sample site (not marked sample). */
async function cef(page) {
  assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { pin: 'site1' })), true);
  let fr = null; for (let i = 0; i < 80 && !fr; i++) { await page.waitForTimeout(300); fr = page.frames().find((f) => /vendor\/cef\/cef\.html/.test(f.url())); }
  await fr.waitForFunction(() => window.CEF && CEF.ready && CEF.ready(), null, { timeout: 30000 });
  await fr.evaluate(() => { const s = sampleSite(); s.sample = false; CEF.test.start(s); CEF.flush(); });
  await page.waitForTimeout(500);
  return fr;
}
/** The editor's files (planFiles): text, or base64 for the PDF. */
const files = (fr) => fr.evaluate(async () => {
  const F = await planFiles(), out = {};
  for (const f of F.files) { if (typeof f.data === 'string') out[f.name] = f.data; else { let bin = ''; const u = f.data; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); out[f.name] = 'b64:' + btoa(bin); } }
  return { tpl: F.tpl, err: F.tplErr, files: out };
});
const pick = (F, re) => F.files[Object.keys(F.files).find((n) => re.test(n))];
/** The DXF's sheets in their tab order, each with the texts of its paper space. */
function sheetsOf(text) {
  const d = new T.Doc(text), S = T.structure(d), get = (r, c) => { const p = r.find((x, i) => i > 0 && x[0] === c); return p ? p[1] : undefined; };
  const L = S.layouts.filter((q) => q.name !== 'Model').sort((a, b) => +get(a.rec, 71) - +get(b.rec, 71));
  return L.map((q) => { const br = S.br.get(q.brh), bn = get(br, 2), ents = bn === '*Paper_Space' ? S.E.filter((e) => String(get(e, 67) || '0').trim() === '1') : S.blocks.get(bn).ents;
    return { name: q.name, texts: ents.filter((e) => ['TEXT', 'MTEXT', 'ATTRIB'].includes(e[0][1])).map((e) => String(get(e, 1) || '')) }; });
}
/** A text style's record of a DXF ({ font, height }), or null. */
function styleOf(text, name) { const d = new T.Doc(text), r = d.sec('TABLES').recs.find((x) => x[0][1] === 'STYLE' && (x.find((p) => p[0] === 2) || [])[1] === name); if (!r) return null; const g = (c) => (r.find((p) => p[0] === c) || [])[1]; return { font: g(3), height: +g(40) }; }
/** The PDF's text, page by page (pdftotext). */
function pdfText(b64) {
  const f = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gesaa-cefco-')), 'x.pdf'); fs.writeFileSync(f, Buffer.from(String(b64).replace(/^b64:/, ''), 'base64'));
  const n = +String(execFileSync('pdfinfo', [f])).match(/Pages:\s+(\d+)/)[1];
  return Array.from({ length: n }, (_, i) => String(execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), '-layout', f, '-'])).replace(/\s+/g, ' '));
}

test('the admin phone: Plan templates › CEF plan: the generic one; Testing › Load a DXF… (checked); Use testing on: every CEF plan printed on it, _TEST, said; Download: its style kit completed; a 7.17 client template\'s CEF sheet as testing', async () => {
  const { ctx, page, errors } = await open({ state: state(null, null) });
  try {
    await planTemplates(page);
    assert.deepEqual(await cefSlots(page), { pub: 'None: CEF plans are printed on the app\'s generic CEF template.', test: 'None: Load a DXF, or make one from a client\'s file.', down: 'Download the generic one' });
    assert.deepEqual(await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME), { kind: 'generic', name: 'G-eSAA generic CEF template', size: fs.statSync(path.join(root, 'vendor', 'cef', 'cef-template-generic.dxf')).size, note: '' });
    // a plan template is not a CEF template: refused, said why, nothing kept
    await page.setInputFiles('#admTplCefLoadFile', { name: 'plan-seed-made-up-square.dxf', mimeType: 'application/dxf', buffer: Buffer.from(SEED_SQ) });
    await until(page, () => window.__toasts.some((t) => /^Template not loaded/.test(t)), null, 30);
    assert.ok((await toasts(page)).some((t) => /This CEF template cannot be used: It has no sheet \(layout\) named CEF/.test(t)), JSON.stringify(await toasts(page)));
    assert.deepEqual(await page.evaluate(() => window.__polecam.tpl.test()), {});
    // the made-up company one: checked, its kit counted, kept as the testing CEF template
    await page.setInputFiles('#admTplCefLoadFile', { name: 'DEMO TELCO CEF template.dxf', mimeType: 'application/dxf', buffer: Buffer.from(COMPANY) });
    await until(page, () => !document.getElementById('askBox').hidden, null, 30);
    const said = await page.evaluate(() => document.getElementById('askBox').textContent);
    assert.match(said, /Testing template ready/); assert.match(said, /DEMO TELCO CEF template\.dxf\. Its style kit: 16 of 17 text styles, 21 of 22 layers\./);
    assert.match(said, /lacks 1 text style and 1 layer: those print as the app's own look \(Download adds them\)/); assert.match(said, /Tick Use the testing templates on this phone/);
    await answer(page, 'OK');
    const info = await page.evaluate(() => window.__polecam.tpl.test().cef);
    assert.equal(info.name, 'DEMO TELCO CEF template.dxf'); assert.equal(info.from, 'file'); assert.deepEqual(info.kit, { styles: [16, 17], layers: [21, 22], north: false, key: false });
    assert.ok((await page.evaluate(() => window.__polecam.tpl.testText('cef'))).includes('DEMO TELCO STANDARD'), 'kept on the phone');
    assert.match((await cefSlots(page)).test, /^DEMO TELCO CEF template\.dxf · \d+ KB · \d{4}-\d\d-\d\d · by Ana Reyes · ana@demo-telco\.example$/);
    assert.equal((await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME)).kind, 'generic', 'Use the testing templates off: not used');
    await page.check('#admTplTest'); await page.waitForTimeout(300);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'cef-company-template-row.png') });
    // every CEF plan printed on it
    const fr = await cef(page), F = await files(fr), dxf = pick(F, /_CEF_sheets\.dxf$/), sh = sheetsOf(dxf);
    assert.equal(F.tpl, 'DEMO TELCO CEF template.dxf (testing)'); assert.equal(F.err, '');
    assert.ok(Object.keys(F.files).filter((n) => /\.(dxf|pdf|kml|json)$/.test(n)).every((n) => /_TEST_CEF/.test(n)), `_TEST in the files' names: ${Object.keys(F.files).join(', ')}`);
    assert.deepEqual(sh.map((s) => s.name), ['COVER PAGE', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW']);
    assert.ok(sh.slice(1).every((s) => s.texts.includes('DEMO TELCO STANDARD')), 'every sheet a copy of the company\'s sheet CEF');
    assert.deepEqual(styleOf(dxf, 'CEF BODY'), { font: 'romans.shx', height: 3 }, 'its own text styles');
    assert.match(pick(F, /README\.txt$/), /TEMPLATE\r\n {2}The sheets are on the company CEF template DEMO TELCO CEF template\.dxf \(testing\): its frame/);
    if (PDFTOTEXT) { const P = pdfText(pick(F, /_CEF\.pdf$/)); assert.ok(P.length >= 5 && P[1].includes('DEMO TELCO STANDARD') && P[0].includes('CABLE ENTRANCE FACILITY'), 'the PDF printed on it'); }
    const pop = await fr.evaluate(() => { expOpen = true; drawStrip(); const t = document.getElementById('tbpop').textContent; expOpen = false; drawStrip(); return t; });
    assert.match(pop, /Testing template: not published: the files say _TEST\./, 'the editor\'s Export says it before anything is made');
    const note = await fr.evaluate(async () => { dl.save = async () => {}; await doExport('zip'); return (msg && msg.t) || ''; });
    assert.match(note, /The ZIP is ready: .*_TEST_CEF\.zip\. On the company CEF template DEMO TELCO CEF template\.dxf \(testing\)\. Testing template: not published\.$/);
    // Download (testing): its kit completed
    await closeAll(page); await planTemplates(page);
    const dlP = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#admTplCefDown');
    const dl = await dlP, got = fs.readFileSync(await dl.path(), 'utf8');
    assert.equal(dl.suggestedFilename(), 'DEMO TELCO CEF template.dxf');
    const S2 = T.structure(new T.Doc(got));
    assert.ok(S2.layouts.some((q) => q.name === 'STYLE KEY') && S2.styles.has('CEF NOTICE') && S2.layers.has('CEF-PHOTO') && S2.blocks.has('CEF NORTH ARROW'), 'the STYLE KEY, the style, the layer and the north arrow back');
    assert.ok(S2.layouts.some((q) => q.name === 'CEF') && got.includes('DEMO TELCO STANDARD'), 'the company\'s own sheet kept');
    assert.deepEqual(styleOf(got, 'CEF BODY'), { font: 'romans.shx', height: 3 }, 'its own styles kept');
    assert.ok(/GESAA_KEY\r?\n1000\r?\nheight\r?\n1000\r?\nCEF BODY/.test(got) && /\r?\n3 mm\r?\n/.test(got), 'the STYLE KEY says its CEF BODY is 3 mm');
    assert.ok((await toasts(page)).some((t) => t === 'Its style kit completed: 1 text style, 1 layer, the north arrow, the STYLE KEY sheet added as the app prints them'), JSON.stringify(await toasts(page)));
    // a 7.17 client template with a CEF sheet (kept on this phone): Use as testing: its CEF sheet the testing CEF template
    await page.evaluate(async ({ text, plan }) => {
      const P = window.__polecam, S = P.S;
      await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~tpl:tplA', id: 'tplA', name: 'DEMO CLIENT A3', client: 'DEMO CLIENT', plan, cef: text, look: null }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      S.tpls = [{ id: 'tplA', name: 'DEMO CLIENT A3', at: '2026-11-01T08:00:00.000Z', from: { file: 'demo-client-a3.dxf', size: 1000 }, client: 'DEMO CLIENT', look: null, ok: true, cef: true }]; P.persist();
    }, { text: CLIENT, plan: SEED_SQ });
    await closeAll(page); await planTemplates(page);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#admTplOldList .tplit')].map((d) => [d.querySelector('b').textContent, [...d.querySelectorAll('button')].map((b) => b.textContent)])), [['DEMO CLIENT A3', ['Use as testing', 'Remove']]]);
    await page.click('#admTplOldList .tplit button.primary');
    assert.match(await H.answer(page, 'Use as testing'), /Its as-plan and its CEF sheet become the testing templates on this phone, in place of the testing ones there now/);
    await page.waitForTimeout(400);
    const c2 = await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME);
    assert.equal(c2.name, 'DEMO CLIENT A3 (testing)'); assert.equal(c2.test, true);
    await closeAll(page);
    { const F2 = await files(await cef(page)); assert.equal(F2.tpl, 'DEMO CLIENT A3 (testing)'); assert.ok(sheetsOf(pick(F2, /_TEST_CEF_sheets\.dxf$/)).slice(1).every((s) => !s.texts.includes('DEMO TELCO STANDARD')), 'on the client\'s sheet'); }
    await closeAll(page); await planTemplates(page); await page.uncheck('#admTplTest'); await page.waitForTimeout(200);
    assert.equal((await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME)).kind, 'generic', 'off: the published one (the generic one)');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the admin shares a company CEF template by its Drive link (Plan templates › CEF plan › or paste a Google Drive link): a user\'s phone gets it through the online sheet and prints on it; a newer one shared: got by itself', async () => {
  const admin = await open({ state: state(null, null) }), { page } = admin;
  try {
    await planTemplates(page);
    await page.fill('#admCefSeed', `https://drive.google.com/file/d/${ID1}/view?usp=sharing`);
    await page.evaluate(() => document.getElementById('admSave').click());
    await answer(page, 'OK');
    await until(page, () => { const t = window.__polecam.S.team; return !!(t && t.rev === 2 && t.pol && t.pol.cefSeed); }, null, 20);
    team1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__polecam.S.team)));
    assert.equal(team1.pol.cefSeed, `https://drive.google.com/file/d/${ID1}/view?usp=sharing`, 'the link goes with the company list');
    assert.equal(env.world.props['cefseed.id'], ID1, 'and to the sheet (setList: cefSeed)');
    assert.equal(SH.setting('CEF template'), `https://drive.google.com/file/d/${ID1}/view`, '(sheet v2.43.7) its Settings row follows the newest link');
    assert.deepEqual(admin.errors, []);
  } finally { await admin.ctx.close(); }
  // a user of the list: the CEF template comes by itself, through the sheet
  const u = await open({ state: state(JUAN, team1) });
  try {
    const p = u.page;
    await p.evaluate(() => window.__polecam.cloudSync(true)); await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => window.__polecam.cefTpl.id()), ID1, 'the phone knows the admin shares one');
    const r = await p.evaluate((n) => window.__polecam.cefTpl.now(n), NAME);
    assert.deepEqual(r, { kind: 'company', name: 'DEMO TELCO CEF template.dxf', size: r.size, note: '' }, 'got when a CEF plan wants it');
    assert.ok(sheetLog.some((x) => x.cefseed === '1'), 'through the sheet (cefseed=1)');
    const info = await p.evaluate(() => window.__polecam.cefTpl.info()); assert.equal(info.from, 'drive'); assert.equal(info.id, ID1);
    const fr = await cef(p), F = await files(fr);
    assert.equal(F.tpl, 'DEMO TELCO CEF template.dxf'); assert.ok(sheetsOf(pick(F, /_CEF_sheets\.dxf$/)).slice(1).every((s) => s.texts.includes('DEMO TELCO STANDARD')));
    assert.ok(Object.keys(F.files).every((n) => !/_TEST/.test(n)), 'a user\'s files: no _TEST');
    // a newer one shared (the sheet's Settings): got by itself at the next sync
    SH.setSetting('CEF template', `https://drive.google.com/file/d/${ID2}/view`);
    await p.evaluate(() => window.__polecam.cloudSync(true)); await p.waitForTimeout(500);
    await until(p, () => window.__polecam.cefTpl.id() === '1DemoCompanyCefTemplate000000002', null, 20);
    await until(p, () => { const i = window.__polecam.cefTpl.info(); return !!i && i.id === '1DemoCompanyCefTemplate000000002'; }, null, 30);
    assert.equal((await p.evaluate(() => window.__polecam.cefTpl.info())).name, 'DEMO TELCO CEF template v2.dxf');
    assert.deepEqual(u.errors, []);
  } finally { await u.ctx.close(); }
});
