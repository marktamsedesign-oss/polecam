/* (templates, Digester) and (templates, Round trip) in the browser. The owner: "the digester learning from clients' finished plans. Learning means
   copying the template but replacing the details necessary to the project. Example: the plan itself, the project details, sheets to print details.
   Geo add sheet, vicinity, pmi and so on" and "downloading a template, editing it and loading it back; yes for admin".
   (stage 11, templates) The owner: "for the Asplan/Asbuilt and CEF templates, do not put it on drawing settings but rather put it on the admin settings
   only": the digester and the round trip are the admin's, in Administration › Plan templates, on the admin phone of a made-up company list
   (tests/tpl-admin.cjs, the online sheet v2.43.7 on its stand-in); what they make is the testing template:
   - a computer (1280x900): As-plan / as-built › Testing › Make from a client's file… with a made-up FINISHED plan (tests/fixtures/client-d-made-up-plan.dxf:
     14 poles, a cover, legend, location map with its picture, key plan, two plan sheets, PMI and ROW tables): the review says it is a finished plan
     (ticked), each sheet's role (cover, legend, vicinity map, key map, plan, plan, PMI, ROW), what it learned of each kind (pole IDs on D-POLE-ID in
     D-LABELS 2.2 m…), its two tables, the cover's fields found by their values; Make and check (no problem), Save as testing; Use the testing templates
     on: the project's plan made on it: TITLE (the cover, the project's name on it), LEGENDS, VICINITY MAP, ROW AREA COVERAGE, KEYMAP, GEO, PMI, every
     field filled, the PMI's figures and the ROW's places the app's, the learned look kept (G-ESAA_LOOK.kinds); unticking makes it a template again;
   - the admin's round trip on the slots: Download (published: the company template, tagged company), edited, Load it back… (tidied, checked, the
     testing template); again: asked to replace it; Download (testing: a client's finished plan made into a template, its learned look kept), edited,
     loaded back; a file that is not a G-eSAA template: refused by Load it back… and by Load a DXF…, saying why;
   - who: the admin phone (Administration, the admin PIN); a user of the list (Team admin and Client templates allowed included) has no Plan
     templates, sets nothing, and a testing template on that phone is never used.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
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
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-square.dxf'), 'utf8');
const SH = H.sheet(path.join(__dirname, 'regression', 'v243', 'sheet', 'PoleCam-online-sheet_v2.43.7.gs')); // (stage 11, templates) the admin phone's list
let server, browser, base, ADMIN = null;
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
  ADMIN = await H.makeAdmin(browser, base, SH); // ((stage 11, templates) Plan templates is the admin's)
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

const NAME = 'DEMO FINISHED PLAN PROJECT', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, 7.10465 + (i > 4 ? (i - 4) * 0.00036 : 0), 125.6010 + Math.min(i, 4) * 0.00036]);
const recs = (proj) => POLES.map(([id, poleId, lat, lon], i) => ({ id, project: proj, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, photos: [] }));
const LINKS = POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12']);
/** A company list a user phone keeps (made up; its structure as the app checks it), with its permissions. */
const team = (perms) => ({ t: 'polecam-team', id: 'demo-team-1', name: 'DEMO CONTRACTOR TEAM', rev: 2, admins: [{ n: 'DEMO ADMIN', k: 'demo-admin-public-key' }], co: ['DEMO CONTRACTOR'], ...(perms ? { perms } : {}) });

/** The app with the made-up project open, the made-up company template on this phone, the builder on the page (its plans kept): (stage 11, templates) the
    admin phone of the list (o.team: a user's phone of that list instead, its permissions as given). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: true });
  await SH.route(ctx); await ctx.route('**/*', (r) => { const u = r.request().url(); return u === `${base}org.json` ? r.fulfill({ status: 404, body: '' }) : u.startsWith(base) ? r.continue() : u.startsWith(SH.url) ? r.fallback() : r.abort(); }); // (the test's own list: no org.json)
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ R, NAME, USER, LINKS, SEED, TEAM, ADMIN }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction(['points', 'packs'], 'readwrite'), st = tx.objectStore('points'); st.clear(); R.forEach((x) => st.put(x)); tx.objectStore('packs').put({ k: '~dxfseed', text: SEED }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ ...(TEAM ? { user: USER, team: TEAM } : ADMIN), projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off',
      dxfSeed: { name: 'plan-seed-made-up-square.dxf', size: SEED.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' },
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files' }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { R: recs(NAME), NAME, USER, LINKS, SEED: SEED_SQ, TEAM: o.team ? { ...ADMIN.team, ...(o.team.perms ? { perms: o.team.perms } : {}) } : null, ADMIN });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.evaluate(async () => { // the builder on the page for the exports: each plan kept
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = []; // (the page's builder, not the worker's)
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ text: out.text, sheets: out.report.sheets.slice(), values: JSON.parse(JSON.stringify(job.values)) }); return out; };
  });
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(400); } };
/** (stage 11, templates) Administration › Plan templates (the admin PIN). */
const planTemplates = (page) => H.admin(page);
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(800);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made'); return e[0];
}
async function until(page, fn, arg, s) { for (let i = 0; i < (s || 30) * 5; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(200); } throw new Error(`not so after ${s || 30} s: ${fn}`); }
const askText = (page) => page.evaluate(() => ({ title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, buttons: [...document.querySelectorAll('#askBox .row button')].map((b) => b.textContent) }));
async function answer(page, label) {
  await until(page, () => !document.getElementById('askBox').hidden, null, 60);
  const a = await askText(page);
  await page.evaluate(([l, a]) => { const b = [...document.querySelectorAll('#askBox .row button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error(`no button ${l}: ${JSON.stringify(a)}`); b.click(); }, [label, a]); await page.waitForTimeout(300);
  return a;
}
const T = require(path.join(root, 'dxftpl.js')), G = require(path.join(root, 'vendor', 'synth', 'dxfsynth.js'));
const layoutsOf = (text) => { const S = T.structure(new T.Doc(text)); return S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => +((a.rec.find((p, i) => i > 0 && p[0] === 71) || [])[1] || 0) - +((b.rec.find((p, i) => i > 0 && p[0] === 71) || [])[1] || 0)).map((L) => L.name); };
const inkOf = (page, id) => page.evaluate((id) => { const c = document.getElementById(id), g = c.getContext('2d'), D = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < D.length; i += 4) if (D[i] < 200 || D[i + 1] < 200 || D[i + 2] < 200) n++; return n; }, id);

test('a computer: a client\'s finished plan learned (its sheets\' roles, the look of each kind, its tables), checked, saved as the testing template; the project\'s plan made on it', async () => {
  const { ctx, page, errors } = await open();
  try {
    await planTemplates(page);
    await page.setInputFiles('#admTplGeoMakeFile', path.join(FX, 'client-d-made-up-plan.dxf'));
    await page.waitForFunction(() => !document.getElementById('tplReview').hidden, null, { timeout: 30000 }); await page.waitForTimeout(800);
    const map = await page.evaluate(() => window.__polecam.tpl.review());
    assert.equal(map.finished, true, 'a finished plan');
    assert.deepEqual(map.roles, { COVER: 'cover', LEGEND: 'legend', 'LOCATION MAP': 'vicinity', 'KEY PLAN': 'keymap', 'PLAN-1': 'plan', 'PLAN-2': 'plan', PMI: 'pmi', ROW: 'row' });
    assert.equal(map.plan, 'PLAN-1'); assert.equal(map.keymap, 'KEY PLAN'); assert.equal(map.cef, '', 'its CEF on the company\'s CEF template');
    assert.equal(map.name, 'DEMO CLIENT D TELECOM'); assert.equal(map.symbols['P-POLE'], 'DEMO-POLE-NEW'); assert.equal(map.symbols['existing telecom pole'], 'DEMO-POLE-EXIST'); assert.equal(map.symbols['P-Joint'], 'DEMO-CLOSURE');
    assert.equal(map.look.font, 'D-LABELS'); assert.deepEqual(map.look.layers, { cable: 'D-FOC-PROPOSED', pole: 'D-POLES', symbol: 'D-LOOP', text: 'D-POLE-ID', road: 'D-ROAD', grid: 'D-GRID', photo: '' });
    assert.equal(map.look.lw.cable, 50); assert.equal(map.look.cableEx, 'D-FOC-EXISTING'); assert.equal(map.look.kinds.poleId.style, 'D-LABELS'); assert.equal(map.look.kinds.latLong.h, 1.2);
    assert.equal(Object.values(map.tables).filter((t) => /^PMI_/.test(t)).length, 6); assert.equal(Object.values(map.tables).filter((t) => /^ROW_/.test(t)).length, 10);
    const ui = await page.evaluate(() => ({
      fin: !document.getElementById('tplFinRow').hidden && document.getElementById('tplFin').checked, sum: document.getElementById('tplFinSum').textContent,
      roles: [...document.querySelectorAll('#tplRoles select')].map((s) => [s.dataset.role, s.value]), sel: document.getElementById('tplSheetSel').hidden, kinds: [...document.querySelectorAll('#tplKinds > div')].map((d) => d.innerText.replace(/\s+/g, ' ')),
      tables: [...document.querySelectorAll('#tplTables input')].map((c) => [c.dataset.tab, c.checked]), tabs: !document.getElementById('tprTables').hidden,
      fields: [...document.querySelectorAll('#tplFields .tprf')].filter((r) => r.dataset.sheet === 'COVER').map((r) => [r.querySelector('small').textContent, r.querySelector('select').value]) }));
    assert.equal(ui.fin, true); assert.match(ui.sum, /Found 14 poles along 700 m of cable, a PMI table .*1:1,200/);
    assert.equal(ui.roles.length, 8); assert.equal(ui.sel, true, 'the three sheets\' choices: by the roles instead');
    assert.ok(ui.kinds.some((k) => /^Pole IDs and details .*layer D-POLE-ID · D-LABELS \(arialn\.ttf\) · 2\.2 m high, 1\.83 mm printed/.test(k)), ui.kinds.join(' | '));
    assert.ok(ui.kinds.some((k) => /^Cables \(existing\) .*layer D-FOC-EXISTING .*dashed · 0\.35 mm thick/.test(k)), ui.kinds.join(' | '));
    assert.ok(ui.kinds.some((k) => /^Poles .*blocks DEMO-POLE-NEW ×11, DEMO-POLE-EXIST ×3/.test(k)), ui.kinds.join(' | '));
    // (the style kit: the entry each kind fills)
    for (const re of [/^Pole IDs and details .*→ PLAN POLE DETAILS, PLAN ID$/, /^Span lengths .*D-SMALL \(romans\.shx, width 0\.8\).*→ PLAN SPAN LENGTH$/, /^Cables \(proposed\) .*→ PLAN CABLE AE$/,
      /^Poles .*→ P-POLE, existing telecom pole$/, /^Closures, loops, boxes .*→ P-Joint, loopp$/, /^Circles round the pole numbers .*→ no kit entry: the template's look$/]) assert.ok(ui.kinds.some((k) => re.test(k)), `${re}: ${ui.kinds.join(' | ')}`);
    assert.deepEqual(ui.tables, [['pmi', true], ['row', true]]); assert.equal(ui.tabs, true);
    assert.deepEqual(ui.fields.map((f) => f[1]), ['project', 'location', 'client', 'date'], JSON.stringify(ui.fields));
    assert.ok(ui.fields.some(([t]) => /PREPARED FOR “DEMO CLIENT D TELECOM” · the same as a title block's/.test(t)), JSON.stringify(ui.fields));
    // Make and check
    await page.evaluate(() => document.getElementById('tplMake').click());
    await page.waitForFunction(() => !document.getElementById('tprCheck').hidden, null, { timeout: 120000 }); await page.waitForTimeout(400);
    const res = await page.evaluate(() => document.getElementById('tplCheckRes').innerText);
    assert.match(res, /no problem found/); assert.match(res, /Sheets left out: PLAN-2/); assert.match(res, /vicinity map's picture removed/); assert.match(res, /Tables: 16 value/); assert.match(res, /No CEF sheet in their plan/);
    assert.match(res, /Style kit: 14 entries as their plan draws them \(PLAN POLE DETAILS ← pole ids and details, /);
    assert.ok(await inkOf(page, 'tplCheckPic') > 1000, 'the made-up plan\'s picture');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'client-plan-template-review.png'), fullPage: false });
    await page.evaluate(() => document.getElementById('tplSave').click()); // (no CEF sheet in their plan: nothing asked)
    await page.waitForFunction(() => document.getElementById('tplReview').hidden, null, { timeout: 20000 }); await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ test: window.__polecam.tpl.test(), item: document.getElementById('admTplGeoTestSum').textContent }));
    assert.equal(st.test.geo.name, 'DEMO CLIENT D TELECOM.dxf'); assert.equal(st.test.geo.look.from.finished, true); assert.equal(st.test.cef, undefined); assert.match(st.item, /^DEMO CLIENT D TELECOM\.dxf · \d+ KB · /);
    await page.check('#admTplTest'); await page.waitForTimeout(300); // (Use the testing templates on this phone)
    // the project's plan on their sheets
    const out = await exportPlan(page), L = layoutsOf(out.text);
    assert.deepEqual(L, ['TITLE', 'LEGENDS', 'VICINITY MAP', 'ROW AREA COVERAGE', 'KEYMAP', 'GEO', 'PMI'], L.join(', '));
    assert.equal((out.text.match(/@@\w+@@/g) || []).length, 0, 'every field filled or blank');
    assert.ok(out.text.includes(NAME), 'the project\'s name (the cover and the title blocks)'); assert.ok(out.text.includes('PREPARED FOR '), 'the cover\'s own words kept');
    assert.ok(!out.text.includes('DEMO FIBER ROUTE 2026') && !out.text.includes('DEMO BRGY 3') && !out.text.includes('CC-9013'), 'none of their project\'s details: its name, its places, its poles');
    assert.ok(!out.text.includes('DEMO_VICINITY.jpg'), 'their vicinity map\'s picture gone (the app makes its own)');
    assert.equal(out.values.PMI_PROPOSED_POLE, '8'); assert.ok(out.text.includes('FIBER OPTIC CABLE AS-PLAN'), 'the cover\'s title kept');
    const look = G.lookOf(out.text); assert.equal(look.kinds.poleId.layer, 'D-POLE-ID'); assert.equal(look.from.finished, true); assert.equal(look.from.scale, 1200);
    const kit = Object.fromEntries(T.kitOf(out.text).text.map((e) => [e.name, e])); // (the plan's own text styles: the kit as their plan taught it)
    assert.deepEqual([kit['PLAN POLE DETAILS'].font, kit['PLAN POLE DETAILS'].h, kit['PLAN SPAN LENGTH'].font, kit['PLAN SPAN LENGTH'].wf, kit['PLAN SPAN LENGTH'].h], ['arialn.ttf', 1.83, 'romans.shx', 0.8, 1.5]);
    assert.deepEqual(G.structCheck(out.text), [], 'its structure');
    // unticked: a template with a sample drawing (the three sheets' choices back)
    await planTemplates(page);
    await page.evaluate(() => { document.getElementById('admTplGeoMakeFile').value = ''; }); // (the same file again)
    await page.setInputFiles('#admTplGeoMakeFile', path.join(FX, 'client-d-made-up-plan.dxf'));
    await page.waitForFunction(() => !document.getElementById('tplReview').hidden, null, { timeout: 30000 }); await page.waitForTimeout(600);
    await page.evaluate(() => { const c = document.getElementById('tplFin'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(600);
    const m2 = await page.evaluate(() => ({ map: window.__polecam.tpl.review(), sel: document.getElementById('tplSheetSel').hidden, roles: document.getElementById('tplRoles').hidden, kinds: document.getElementById('tplKindsBox').hidden }));
    assert.equal(m2.map.finished, false); assert.equal(m2.sel, false); assert.equal(m2.roles, true); assert.equal(m2.kinds, true); assert.ok(m2.map.plan && !m2.map.roles);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the admin\'s round trip on the slots: Download (published, testing), edited, Load it back… (checked) into the testing slot; asked to replace; a file that is not a G-eSAA template refused', async () => {
  const { ctx, page, errors } = await open();
  try {
    await planTemplates(page);
    // the published one (the company template): downloaded (a file: its tag and name), edited, loaded back as the testing template
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.evaluate(() => document.getElementById('admTplGeoPubDown').click())]);
    assert.equal(dl.suggestedFilename(), 'plan-seed-made-up-square_template.dxf');
    const got = await fsp.readFile(await dl.path(), 'utf8'), tag = G.templateTag(got);
    assert.equal(tag.kind, 'company'); assert.equal(tag.name, 'plan-seed-made-up-square.dxf'); assert.ok(G.seedOk(got)); assert.ok(got.includes('STYLE KEY'), 'its style kit and STYLE KEY sheet');
    const edited = got.replace(/\n@@DRAWN@@\r?\n/, '\nDRAWN: @@DRAWN@@ (EDITED IN AUTOCAD)\r\n'); // (a text of its title block changed, as in AutoCAD)
    assert.notEqual(edited, got);
    await page.setInputFiles('#admTplGeoBackFile', { name: 'company_edited.dxf', mimeType: 'application/dxf', buffer: Buffer.from(edited) });
    let a = await answer(page, 'OK');
    assert.equal(a.title, 'Testing template ready'); assert.match(a.text, /^company_edited\.dxf: a made-up plan was drawn on it, no problem found\. Its style kit: \d+ of \d+ text styles/);
    assert.equal(await page.evaluate(() => window.__polecam.tpl.testText('geo')), G.tidy(edited).text, 'the testing template: the edited one (tidied as a client\'s DXF is)');
    assert.equal(await page.evaluate((n) => window.__polecam.tpl.seedText(n), NAME), SEED_SQ, 'the plans on the published one until Use the testing templates is on');
    assert.equal((await page.evaluate(() => window.__polecam.tpl.test())).geo.from, 'back');
    // a client's finished plan made into the testing template (asked to replace the one there), downloaded: its learned look kept
    await page.setInputFiles('#admTplGeoMakeFile', path.join(FX, 'client-d-made-up-plan.dxf'));
    await page.waitForFunction(() => !document.getElementById('tplReview').hidden, null, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('tplMake').click());
    await page.waitForFunction(() => !document.getElementById('tplSave').disabled, null, { timeout: 120000 });
    await page.evaluate(() => document.getElementById('tplSave').click());
    await page.waitForFunction(() => document.getElementById('tplReview').hidden, null, { timeout: 20000 }); await page.waitForTimeout(500);
    const dc = await page.evaluate(() => window.__polecam.tpl.down('geo', 'test'));
    assert.equal(dc.name, 'DEMO_CLIENT_D_TELECOM_template.dxf'); assert.deepEqual([G.templateTag(dc.text).kind, G.templateTag(dc.text).name], ['company', 'DEMO CLIENT D TELECOM.dxf']);
    assert.ok(G.lookOf(dc.text).kinds, 'the learned look kept in it');
    const ed2 = dc.text.replace(/FIBER OPTIC CABLE AS-PLAN/g, 'FIBRE OPTIC CABLE AS-PLAN (EDITED)');
    await planTemplates(page);
    await page.setInputFiles('#admTplGeoBackFile', { name: 'client_d_edited.dxf', mimeType: 'application/dxf', buffer: Buffer.from(ed2) });
    a = await answer(page, 'Replace'); assert.equal(a.title, 'Replace the testing as-plan / as-built template?'); assert.equal(a.text, 'client_d_edited.dxf replaces DEMO CLIENT D TELECOM.dxf (the testing template on this phone).');
    await answer(page, 'OK');
    assert.equal(await page.evaluate(() => window.__polecam.tpl.testText('geo')), G.tidy(ed2).text, 'the testing template: the edited one');
    assert.ok((await page.evaluate(() => window.__polecam.tpl.test())).geo.look.kinds, 'its look read from it');
    // not a G-eSAA template (the client's plan itself): refused, saying why; nothing changed
    await page.setInputFiles('#admTplGeoBackFile', { name: 'their_plan.dxf', mimeType: 'application/dxf', buffer: fs.readFileSync(path.join(FX, 'client-d-made-up-plan.dxf')) });
    a = await answer(page, 'OK'); assert.equal(a.title, 'This template cannot be used'); assert.match(a.text, /not one the app takes .*GEO sheet/);
    await page.setInputFiles('#admTplGeoLoadFile', { name: 'their_plan.dxf', mimeType: 'application/dxf', buffer: fs.readFileSync(path.join(FX, 'client-d-made-up-plan.dxf')) });
    a = await answer(page, 'OK'); assert.equal(a.title, 'This is not a G-eSAA plan template'); assert.match(a.text, /Make from a client's file/);
    assert.equal(await page.evaluate(() => window.__polecam.tpl.testText('geo')), G.tidy(ed2).text, 'nothing changed');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('who: the admin phone sets the templates; a user of the list (Team admin and Client templates allowed included) has no Plan templates, sets nothing, and a testing template there is never used', async () => {
  const cases = [['permissions off, a user of the list', team(null)], ['permissions on, Team admin and Client templates', team({ on: true, u: { [USER.email]: 'PAT' } })]];
  for (const [what, tm] of cases) {
    const { ctx, page, errors } = await open({ team: tm });
    try {
      assert.equal(await page.evaluate(() => window.__polecam.tpl.admin()), false, `${what}: not the admin`);
      await page.evaluate(() => { const P = window.__polecam; P.S.tplTest = { geo: { name: 'x.dxf', size: 1, at: '2026-11-01T08:00:00.000Z', by: 'x', from: 'file' } }; P.persist(); P.tpl.use(true); });
      assert.equal(await page.evaluate(() => window.__polecam.tpl.testFor('geo')), false, `${what}: a testing template not used`);
      assert.equal(await page.evaluate((n) => window.__polecam.tpl.seedText(n), NAME), SEED_SQ);
      // Settings → Administration: the list's policies, not Administration
      await closeAll(page); await page.evaluate(() => document.getElementById('settingsBtn').click()); await page.waitForTimeout(300);
      await page.evaluate(() => document.getElementById('goAdmin').click()); await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.getElementById('admin').hidden), true, `${what}: Administration not opened`);
      await page.evaluate(() => { const b = document.querySelector('#askBox:not([hidden]) .row button'); if (b) b.click(); });
      // a load by any way in: refused before reading
      await page.setInputFiles('#admTplGeoBackFile', { name: 'x.dxf', mimeType: 'application/dxf', buffer: Buffer.from(SEED_SQ) }); await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.getElementById('askBox').hidden), true, `${what}: refused before reading`);
      assert.equal(await page.evaluate(() => window.__polecam.tpl.test().geo.name), 'x.dxf', 'nothing set');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});
