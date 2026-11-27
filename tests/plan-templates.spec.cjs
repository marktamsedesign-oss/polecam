/* (stage 11, templates) Administration › Plan templates. The owner: "for the Asplan/Asbuilt and CEF templates, do not put it on drawing settings but
   rather put it on the admin settings only (globe in this case) to be adjusted as needed. this should make that template sync in on each user to be
   use by them. allow admin user to use a new template for testing and calibration without making an erroneous plan because of new template. there
   will be 4 dxf template. 2 for testing (Geo and CEF) to be use by admin user only and 2 for published template to be use by all user (Geo and CEF)."
   Run: node --test tests/plan-templates.spec.cjs (or python3 tests/run_all.py --only plan-templates).
   The online sheet is the real sheet script v2.43.7 (tests/regression/v243/sheet/PoleCam-online-sheet_v2.43.7.gs) on the in-memory spreadsheet and
   Google Drive of regression/v243/e2e/sheet_env.js; the admin phone makes the company list in the app (tests/tpl-admin.cjs). Made-up templates:
   tests/fixtures/plan-seed-made-up-square.dxf (the company's, published), plan-seed-made-up-kit.dxf (a new one to test), cef-company-made-up.dxf.
   - A user's phone: Plan style has no Template card (its cards from Pole numbers on); a project that chose a client template in 7.17 is made on the
     company template; a testing template and Use testing on a phone that is not the admin's: not used; User permissions' Client templates not
     shown (Your features).
   - The admin phone (a phone, 390 x 844): Administration › Plan templates: the four slots (name, size, date, who); Load a DXF… into Geo testing (a
     file that is not a plan template refused, saying why), the CEF one into CEF testing (checked); Use the testing templates off: the plans on the
     published template, nothing said, file names as before; on: Plan style, the Drawing and Export say "Testing template: not published", the plan
     made on the testing template with _TEST in every file name (ZIP, DXF), the CEF plans' template the testing one (its files _TEST); Download /
     Clear; nothing sideways.
   - Publish (Geo, CEF): asked first (what changes for everyone); the sheet keeps it in the Drive folder "G-eSAA templates", Settings → Plan template
     its link; the admin's published slot is it (by the admin); the company list saved with its link (version 2); a user's phone gets it by itself
     (dxfseed=1, its seedId the published one) and makes its plan on it (the same template text as the admin's testing one); an older app's request
     (v=2.45.18) gets it too. Publish without the sheet's Admin key: said, nothing sent.
   No page errors. Uses isolated browser contexts and a local HTTP server on a free port; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const H = require('./tpl-admin.cjs');

const root = path.resolve(__dirname, '..'), FX = path.join(__dirname, 'fixtures');
const GS = path.join(__dirname, 'regression', 'v243', 'sheet', 'PoleCam-online-sheet_v2.43.7.gs');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8'), SEED_KIT = fs.readFileSync(path.join(FX, 'plan-seed-made-up-kit.dxf'), 'utf8');
const CEF_CO = fs.readFileSync(path.join(FX, 'cef-company-made-up.dxf'), 'utf8');
const SHOTS = process.env.SHOTS || '';
const NAME = 'DEMO TEMPLATE PROJECT', T0 = '2026-11-01T08:00:00.000Z';
const JUAN = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, 7.10465 + (i > 4 ? (i - 4) * 0.00036 : 0), 125.6010 + Math.min(i, 4) * 0.00036]);
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, photos: [] }));
const LINKS = POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12']);
const PROJ = { projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off',
  exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfLabels: 'std', dxfRoads: false }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, linksAt: T0, cables24: true } } };
const SEED_INFO = { name: 'plan-seed-made-up-square.dxf', size: SEED_SQ.length, at: T0, from: 'file', id: '' };
const SEED_USER = { ...SEED_INFO, from: 'drive', id: '1DemoOldPlanTemplate000000000001' }; // (a user's phone: the template got from the admin before)

const SH = H.sheet(GS);
let server, browser, base, ADMIN = null, adm = null, published = null;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if (rel === '/org.json') { res.writeHead(404).end(); return; } // (the test makes its own company list)
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.dxf': 'application/dxf' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fsp.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  ADMIN = await H.makeAdmin(browser, base, SH);
});
after(async () => { if (adm) await adm.ctx.close().catch(() => {}); if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

/** The builder on the page, each plan kept (its template, its job's values). */
const watchBuilds = (page) => page.evaluate(async () => {
  if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const T = window.GeDxfTpl, real = T.__real || T.build; T.__real = real; T.__w = true; window.__exp = []; // (wrapped once, however often asked)
  T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ seed, cell: job.cell, client: job.values && job.values.CLIENT }); return out; };
});
/** Export › Plan drawing (each question answered as a user going on would): the plan made, and the file offered. */
async function exportPlan(page) {
  await H.closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(800);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => ({ builds: window.__exp, file: document.getElementById('resultName').textContent.replace(/ · .*$/, '') }));
  assert.equal(e.builds.length, 1, 'one plan made'); return { seed: e.builds[0].seed, file: e.file };
}
/** Plan style (from the Drawing): its cards and banners. */
async function planStyle(page) {
  await H.closeAll(page);
  await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(800);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  const draw = await page.evaluate(() => ({ ban: !document.getElementById('drawTestBan').hidden, text: document.getElementById('drawTestBan').textContent }));
  await page.evaluate(() => document.getElementById('drawSetBtn').click()); await page.waitForTimeout(700);
  return { draw, ...(await page.evaluate(() => ({ cards: [...document.querySelectorAll('#plCards > details.plcard')].map((d) => d.id), tpl: !!document.getElementById('stTpl') || !!document.getElementById('tplSel') || !!document.getElementById('tplAdd'),
    ban: !document.getElementById('plBanTest').hidden, banText: document.getElementById('plBanTest').textContent, noTpl: !document.getElementById('plBanTpl').hidden }))) };
}
const adminState = () => ({ ...JSON.parse(JSON.stringify(ADMIN)), ...PROJ, dxfSeed: SEED_INFO });

test('a user\'s phone: no template choices: no Template card, a 7.17 client template choice ignored, testing templates not used, Client templates not a feature', async () => {
  assert.ok(ADMIN && ADMIN.team, 'the admin made the list');
  const st = { ...PROJ, user: JUAN, team: ADMIN.team, dxfSeed: SEED_INFO, tpls: [{ id: 'tplOld1', name: 'DEMO CLIENT OLD', at: T0, from: { file: 'client-old.dxf', size: SEED_KIT.length }, client: 'DEMO CLIENT', look: null, ok: true, cef: false }],
    tplTest: { geo: { name: 'smuggled.dxf', size: SEED_KIT.length, at: T0, by: 'x', from: 'file' } }, tplTestUse: true };
  st.meta = { [NAME]: { ...PROJ.meta[NAME], tpl: 'tplOld1' } };
  const { ctx, page, errors } = await H.open(browser, base, { state: st, records: RECS, seed: SEED_SQ, sheet: SH, packs: [{ k: '~tpl:tplOld1', id: 'tplOld1', name: 'DEMO CLIENT OLD', plan: SEED_KIT, cef: null, look: null }, { k: '~tpltest:geo', text: SEED_KIT }] });
  try {
    const ps = await planStyle(page);
    assert.equal(ps.tpl, false, 'no Template card, no template choice');
    assert.deepEqual(ps.cards, ['stNum', 'stPole', 'stCab', 'stPh', 'stLm', 'stVic', 'stGrid'], 'Plan style\'s cards from Pole numbers on');
    assert.equal(ps.ban, false, 'no testing banner'); assert.equal(ps.noTpl, false, 'the company template on the phone');
    const t = await page.evaluate((n) => Promise.all([window.__polecam.tpl.seedText(n), window.__polecam.tpl.admin(), window.__polecam.tpl.testFor('geo'), window.__polecam.cefTpl.now(n)]), NAME);
    assert.equal(t[0], SEED_SQ, 'the plan on the company template (the 7.17 choice of a client template ignored; a testing one not used)');
    assert.equal(t[1], false, 'not an admin'); assert.equal(t[2], false); assert.equal(t[3].kind, 'generic');
    await watchBuilds(page);
    const x = await exportPlan(page);
    assert.equal(x.seed, SEED_SQ); assert.doesNotMatch(x.file, /_TEST/);
    // User permissions' Client templates: not a feature any more (the list still carries it)
    assert.ok(!(await page.evaluate(() => window.__polecam.S.team.perms ? JSON.stringify(window.__polecam.S.team.perms) : '')).includes('Client'), 'nothing of it said');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the admin phone: Plan templates (four slots); a testing template loaded; Use the testing templates: off as before, on: said everywhere, the plan on it, _TEST in every file name', async () => {
  adm = await H.open(browser, base, { state: adminState(), records: RECS, seed: SEED_SQ, sheet: SH });
  const { page, errors } = adm;
  await H.admin(page);
  let s = await H.slots(page);
  assert.match(s.geo.pub, /^plan-seed-made-up-square\.dxf · 58 KB · 2026-11-01 · loaded on this phone$/, s.geo.pub);
  assert.match(s.geo.test, /^None/); assert.deepEqual(s.geo.testBtns, [], 'Download, Load it back, Clear, Publish: none to act on');
  assert.match(s.cef.pub, /generic CEF template/); assert.match(s.cef.test, /^None/);
  assert.equal(await page.evaluate(() => document.getElementById('admTplTest').checked), false, 'Use the testing templates: off at first');
  assert.equal(await page.evaluate(() => document.getElementById('admDxfSeed').closest('#admTplBox') !== null && document.getElementById('admCefSeed').closest('#admTplBox') !== null), true, 'the Drive link fields are the Published slots\' fallback');
  assert.equal(await page.evaluate(() => !!document.getElementById('admUserTpl')), false, 'Users may load a plan template file of their own: gone');
  // a file that is not a plan template: refused, saying why
  await page.setInputFiles('#admTplGeoLoadFile', { name: 'cef.dxf', mimeType: 'application/dxf', buffer: Buffer.from(CEF_CO) });
  assert.match(await H.answer(page, 'OK'), /no @@ fields or no GEO sheet.*Make from a client.s file/);
  assert.equal((await H.slots(page)).geo.test.startsWith('None'), true);
  // the new one: the testing template
  await page.setInputFiles('#admTplGeoLoadFile', { name: 'DEMO plan template v2.dxf', mimeType: 'application/dxf', buffer: Buffer.from(SEED_KIT) });
  assert.match(await H.answer(page, 'OK'), /DEMO plan template v2\.dxf[\s\S]*Tick Use the testing templates on this phone/);
  s = await H.slots(page);
  assert.match(s.geo.test, /^DEMO plan template v2\.dxf · \d+ KB · \d{4}-\d\d-\d\d · by Ana Reyes · ana@demo-telco\.example$/, s.geo.test);
  assert.deepEqual(s.geo.testBtns, ['Down', 'Back', 'Clear', 'Publish']);
  assert.equal(await page.evaluate(() => window.__polecam.tpl.testText('geo')), SEED_KIT, 'kept on this phone as given');
  // the CEF one: checked (a plan template refused), then kept
  await page.setInputFiles('#admTplCefLoadFile', { name: 'plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(SEED_SQ) });
  await H.until(page, () => !document.getElementById('askBox').hidden || [...(window.__toasts || [])].some((t) => /CEF template cannot be used/.test(t)), null, 30);
  if (await page.evaluate(() => !document.getElementById('askBox').hidden)) await H.answer(page, 'OK');
  assert.ok((await H.toasts(page)).some((t) => /This CEF template cannot be used/.test(t)), 'a plan template refused as the CEF one');
  await page.setInputFiles('#admTplCefLoadFile', { name: 'DEMO TELCO CEF template v2.dxf', mimeType: 'application/dxf', buffer: Buffer.from(CEF_CO) });
  assert.match(await H.answer(page, 'OK'), /Its style kit: \d+ of \d+ text styles/);
  s = await H.slots(page); assert.match(s.cef.test, /^DEMO TELCO CEF template v2\.dxf · /);
  // a phone's width: nothing sideways
  const wide = await page.evaluate(() => { const b = document.getElementById('admTplBox').getBoundingClientRect(); return { btns: [...document.querySelectorAll('#admTplBox button')].filter((x) => x.offsetParent).every((x) => { const r = x.getBoundingClientRect(); return r.right <= b.right + 1 && r.left >= b.left - 1; }), sideways: document.scrollingElement.scrollWidth > innerWidth + 1 }; });
  assert.ok(wide.btns && !wide.sideways, JSON.stringify(wide));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'plan-templates-admin.png') });
  // Use the testing templates: off: the plans as before
  await watchBuilds(page);
  let x = await exportPlan(page);
  assert.equal(x.seed, SEED_SQ, 'off: the plan on the published template'); assert.doesNotMatch(x.file, /_TEST/); assert.match(x.file, /_PLAN_UTM51N_DXF\.zip$/);
  let ps = await planStyle(page); assert.equal(ps.ban, false); assert.equal(ps.draw.ban, false);
  assert.equal((await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME)).kind, 'generic');
  // on
  await H.admin(page); await page.check('#admTplTest'); await page.waitForTimeout(300);
  s = await H.slots(page); assert.match(s.geo.test, /this phone's plans use it now$/);
  ps = await planStyle(page);
  assert.equal(ps.ban, true); assert.match(ps.banText, /^Testing template: not published \(DEMO plan template v2\.dxf\): this phone's plans say TEST\.$/);
  assert.equal(ps.draw.ban, true, 'the Drawing says it'); assert.equal(ps.draw.text, 'Testing template: not published');
  if (SHOTS) { await H.closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(900); await page.screenshot({ path: path.join(SHOTS, 'plan-templates-drawing-test.png') }); }
  x = await exportPlan(page);
  assert.equal(x.seed, SEED_KIT, 'on: the plan on the testing template'); assert.match(x.file, /_PLAN_UTM51N_TEST_DXF\.zip$/, x.file);
  const card = await page.evaluate(() => document.getElementById('dxfTplInfo').textContent);
  assert.match(card, /^Testing template: not published: this phone's plans are made on DEMO plan template v2\.dxf and say TEST/);
  const c = await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME);
  assert.deepEqual(c, { kind: 'company', name: 'DEMO TELCO CEF template v2.dxf (testing)', size: CEF_CO.length, note: 'Testing template: not published.', test: true }, 'the CEF plans on the testing CEF template');
  assert.equal(await page.evaluate(() => window.__cefHost.tplTest()), 'Testing template: not published', 'the CEF editor\'s Export says it');
  // Download the testing one: its kit and STYLE KEY, tagged
  const d = await page.evaluate(() => window.__polecam.tpl.down('geo', 'test'));
  assert.match(d.name, /^DEMO_plan_template_v2_template\.dxf$/); assert.ok(d.text.includes('STYLE KEY') && d.text.includes('G-ESAA_TEMPLATE'));
  assert.deepEqual(errors, []);
});

test('Publish: asked; the sheet keeps it in its Drive folder, its Settings row names it; the list saved with its link; a user\'s phone gets it and plans on it; an older app too', async () => {
  assert.ok(adm, 'the admin phone open');
  const { page, errors } = adm;
  await H.admin(page);
  // without the sheet's Admin key: said, nothing sent
  const key = await page.evaluate(() => { const k = window.__polecam.S.onlineAdminKey; window.__polecam.S.onlineAdminKey = ''; return k; });
  const n0 = SH.log.length;
  await page.click('#admTplGeoPublish');
  assert.match(await H.answer(page, 'OK'), /Publish needs the online sheet[\s\S]*|online Google Sheet .*v2\.43\.7/);
  assert.equal(SH.log.slice(n0).filter((x) => x.post === 'publishTemplate').length, 0, 'nothing sent');
  await page.evaluate((k) => { window.__polecam.S.onlineAdminKey = k; }, key);
  // Publish: asked, naming what changes for everyone
  await page.click('#admTplGeoPublish');
  const q = await H.answer(page, 'Publish');
  assert.match(q, /DEMO plan template v2\.dxf becomes the as-plan \/ as-built template of every phone of DEMO TELCO list/);
  assert.match(q, /The one published now \(plan-seed-made-up-square\.dxf\) is kept in the Google Drive folder "G-eSAA templates"/);
  assert.match(q, /The company list is then saved and shared with its link/);
  await H.answer(page, 'OK'); // (Version 2 saved)
  await H.until(page, () => { const t = window.__polecam.S.team; return !!(t && t.rev === 2); }, null, 30);
  const P = SH.log.filter((x) => x.post === 'publishTemplate');
  assert.equal(P.length, 1); assert.deepEqual([P[0].kind, P[0].size, P[0].name, P[0].by], ['geo', SEED_KIT.length, 'DEMO plan template v2.dxf', 'Ana Reyes · ana@demo-telco.example']);
  const files = Object.entries(SH.world.drive.files).map(([id, f]) => ({ id, name: f.name, folder: SH.world.drive.folders[f.folder].name, same: f.text === SEED_KIT }));
  assert.equal(files.length, 1); assert.deepEqual([files[0].name, files[0].folder, files[0].same], ['DEMO plan template v2.dxf', 'G-eSAA templates', true]);
  published = files[0].id;
  assert.equal(SH.setting('Plan template'), `https://drive.google.com/file/d/${published}/view`, 'Settings → Plan template: its link');
  const me = await page.evaluate(() => ({ pub: window.__polecam.tpl.pub().geo, team: window.__polecam.S.team.pol.dxfSeed, id: window.__polecam.tpl.seedId() }));
  assert.equal(me.pub.id, published); assert.equal(me.pub.from, 'drive'); assert.equal(me.pub.by, 'Ana Reyes · ana@demo-telco.example'); assert.ok(/^\d{4}-/.test(me.pub.pub));
  assert.equal(me.team, `https://drive.google.com/file/d/${published}/view`, 'the company list (version 2) carries its link'); assert.equal(me.id, published);
  assert.ok(SH.log.some((x) => x.post === 'setList'), 'the list sent to the sheet');
  await H.admin(page);
  const s = await H.slots(page); assert.match(s.geo.pub, /^DEMO plan template v2\.dxf · \d+ KB · \d{4}-\d\d-\d\d · by Ana Reyes · ana@demo-telco\.example$/, s.geo.pub); assert.equal(s.geo.get, false);
  // the CEF one too
  await page.click('#admTplCefPublish');
  assert.match(await H.answer(page, 'Publish'), /becomes the CEF plan template of every phone/);
  await H.answer(page, 'OK');
  await H.until(page, () => window.__polecam.S.team.rev === 3, null, 30);
  assert.equal(Object.keys(SH.world.drive.files).length, 2); assert.match(SH.setting('CEF template'), /^https:\/\/drive\.google\.com\/file\/d\/.+\/view$/);
  assert.deepEqual(errors, []);
  // a user's phone of the list: gets both by itself and makes its plans on them
  const team = await page.evaluate(() => JSON.parse(JSON.stringify(window.__polecam.S.team)));
  const u = await H.open(browser, base, { state: { ...PROJ, user: JUAN, team, dxfSeed: SEED_USER }, records: RECS, seed: SEED_SQ, sheet: SH });
  try {
    await u.page.evaluate(() => window.__polecam.cloudSync(true)); await u.page.waitForTimeout(500);
    await u.page.evaluate(() => window.__polecam.tpl.seedId());
    await H.until(u.page, (id) => { const p = window.__polecam.tpl.pub(); return !!(p.geo && p.geo.id === id && p.cef && p.cef.from === 'drive'); }, published, 40);
    const pu = await u.page.evaluate(() => window.__polecam.tpl.pub());
    assert.equal(pu.geo.by, 'Ana Reyes · ana@demo-telco.example'); assert.equal(pu.geo.name, 'DEMO plan template v2.dxf');
    assert.ok(SH.log.some((x) => x.get === 'dxfseed') && SH.log.some((x) => x.get === 'cefseed'), 'through the sheet (dxfseed=1, cefseed=1)');
    await watchBuilds(u.page);
    const x = await exportPlan(u.page);
    assert.equal(x.seed, SEED_KIT, 'the user\'s plan on the published template: the very one the admin tested'); assert.doesNotMatch(x.file, /_TEST/);
    assert.equal((await u.page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME)).name, 'DEMO TELCO CEF template v2.dxf');
    assert.deepEqual(u.errors, []);
  } finally { await u.ctx.close(); }
  // an older app (2.45.18) asks as it does today: the published plan template
  const old = JSON.parse(SH.gs.doGet({ parameter: { dxfseed: '1', key: SH.keys().read, v: '2.45.18', company: '' } }).getContent());
  assert.equal(old.ok, true); assert.equal(old.id, published); assert.equal(old.text, SEED_KIT);
});

test('the admin clears a testing template: its plans back on the published one; Use the testing templates off: nothing said', async () => {
  assert.ok(adm, 'the admin phone open');
  const { page, errors } = adm;
  await H.admin(page);
  await page.click('#admTplCefClear');
  assert.match(await H.answer(page, 'Clear'), /is deleted from this phone\. This phone's CEF plans go back to the published template\./);
  assert.equal((await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME)).test, undefined);
  await page.uncheck('#admTplTest'); await page.waitForTimeout(200);
  const ps = await planStyle(page); assert.equal(ps.ban, false); assert.equal(ps.draw.ban, false);
  await watchBuilds(page);
  const x = await exportPlan(page); assert.doesNotMatch(x.file, /_TEST/);
  assert.deepEqual(errors, []);
});
