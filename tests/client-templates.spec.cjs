/* (beta 7.15, Client templates) the owner: "dxf for asplan and cef must be based from a template dxf. Context: client requires a different template with a
   different text font style, drawing style size and thickness" and "add a dxf synthesizer that accepts and digest a dxf from other clients". (stage 11,
   templates) "for the Asplan/Asbuilt and CEF templates, do not put it on drawing settings but rather put it on the admin settings only": the digester is in
   Administration › Plan templates (Make from a client's file…) and what it makes is the admin's TESTING template. In the browser, on the admin phone of a
   made-up company list (tests/tpl-admin.cjs, the online sheet v2.43.7 on its stand-in):
   - a computer (1280x900): Plan templates › As-plan / as-built › Testing › Make from a client's file… with a made-up client's DXF (tests/fixtures/
     client-a-made-up.dxf: A1, its title block a block with attributes, ROMANS) opens the review with its choices made (the plan sheet, the CEF sheet, its
     fields, its symbols, its font), the sheet's picture drawn; Make and check draws a made-up plan on it (no problem, its picture); Save as testing (the
     as-plan and the CEF sheet) keeps both testing templates;
   - with Use the testing templates on: Export › the plan: the DXF on the client's sheet (GEO and KEYMAP from its PLAN sheet, its title block, its legend
     sheet), its fields filled from what the app knows (the project's name, the exporter's name), the look written (G-ESAA_LOOK, the text style G-ESAA TEXT
     on ROMANS), the map viewport square at 1:1100 on its paper; the CEF plans' template the testing CEF one (its CEF sheet); off: every plan on the company
     template (a made-up one), byte for byte the plan it made before;
   - a phone (390x844): a DWG refused, saying how to save a DXF; the review of another made-up client (client-b: A3, plain texts, Arial Narrow) fits the
     screen (nothing sideways), Make and check, Save as testing; Clear (asked).
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

const NAME = 'DEMO CLIENT PROJECT', OTHER = 'DEMO COMPANY PROJECT', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' }; // (who took the records; the admin, Ana Reyes, exports)
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, 7.10465 + (i > 4 ? (i - 4) * 0.00036 : 0), 125.6010 + Math.min(i, 4) * 0.00036]);
const recs = (proj, pre) => POLES.map(([id, poleId, lat, lon], i) => ({ id: `${pre}${id}`, project: proj, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } }));
const links = (pre) => POLES.slice(1).map((p, i) => [`${pre}${POLES[i][0]}`, `${pre}${p[0]}`, 'F12']);

/** The admin phone with the two made-up projects (the client's project open), the made-up company template on this phone, the builder on the page (its plans kept). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: !!o.phone, hasTouch: !!o.phone, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await SH.route(ctx); await ctx.route('**/*', (r) => { const u = r.request().url(); return u === `${base}org.json` ? r.fulfill({ status: 404, body: '' }) : u.startsWith(base) ? r.continue() : u.startsWith(SH.url) ? r.fallback() : r.abort(); }); // (the test's own company list: no org.json)
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ R, NAME, OTHER, ADMIN, L1, L2, SEED }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction(['points', 'packs'], 'readwrite'), st = tx.objectStore('points'); st.clear(); R.forEach((x) => st.put(x)); tx.objectStore('packs').put({ k: '~dxfseed', text: SEED }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ ...ADMIN, projects: [NAME, OTHER], project: NAME, sampleDone: true, saveCheck: false, zone: 51, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off',
      dxfSeed: { name: 'plan-seed-made-up-square.dxf', size: SEED.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' },
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files' }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: L1, cables24: true }, [OTHER]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: L2, cables24: true } } }));
  }, { R: [...recs(NAME, ''), ...recs(OTHER, 'o')], NAME, OTHER, ADMIN, L1: links(''), L2: links('o'), SEED: SEED_SQ });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.evaluate(async () => { // the builder on the page for the exports: each plan kept
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ text: out.text, sheets: out.report.sheets.slice(), cell: job.cell, values: JSON.parse(JSON.stringify(job.values)) }); return out; };
  });
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(400); } };
/** (stage 11, templates) Administration › Plan templates (the admin PIN). */
const planTemplates = (page) => H.admin(page);
/** Export › Plan drawing (each question answered as a user going on would): the plan made. */
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
/** A sheet's layout names, the root dictionary's look, a style's font (the DXF text, read as the builder reads it). */
const T = require(path.join(root, 'dxftpl.js')), G = require(path.join(root, 'vendor', 'synth', 'dxfsynth.js'));
function dxfInfo(text) {
  const d = new T.Doc(text), S = T.structure(d), get = (r, c) => { const p = r.find((q, i) => i > 0 && q[0] === c); return p ? p[1] : undefined; };
  const style = (n) => { const r = S.T.find((x) => x[0][1] === 'STYLE' && get(x, 2) === n); return r ? get(r, 3) : null; };
  return { layouts: S.layouts.map((L) => L.name).filter((n) => n !== 'Model'), look: G.lookOf(text), style, blocks: [...S.blocks.keys()], S, d };
}
const inkOf = (page, id) => page.evaluate((id) => { const c = document.getElementById(id), g = c.getContext('2d'), D = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < D.length; i += 4) if (D[i] < 200 || D[i + 1] < 200 || D[i + 2] < 200) n++; return n; }, id);

test('a computer: a client\'s template made (Plan templates › Make from a client\'s file…), reviewed, checked, saved as the testing template; Use testing on: the plan on the client\'s sheet; off: on the company template as before', async () => {
  const { ctx, page, errors } = await open();
  try {
    // the other project's plan before any client template (the company template, made-up)
    await page.evaluate((n) => { window.__polecam.S.project = n; window.__polecam.persist(); }, OTHER);
    const before0 = await exportPlan(page);
    assert.equal(dxfInfo(before0.text).look, null, 'the company template: no look');
    await page.evaluate((n) => { window.__polecam.S.project = n; window.__polecam.persist(); }, NAME);
    // Administration › Plan templates: no testing template yet; make one from the client's file
    await planTemplates(page);
    assert.match(await page.evaluate(() => document.getElementById('admTplGeoTestSum').textContent), /^None/);
    await page.setInputFiles('#admTplGeoMakeFile', path.join(FX, 'client-a-made-up.dxf'));
    await page.waitForFunction(() => !document.getElementById('tplReview').hidden, null, { timeout: 30000 }); await page.waitForTimeout(600);
    const map = await page.evaluate(() => window.__polecam.tpl.review());
    assert.equal(map.plan, 'PLAN'); assert.equal(map.cef, 'PLAN'); assert.equal(map.keymap, ''); assert.deepEqual(map.keep, ['LEGEND']);
    assert.equal(map.look.font, 'CLIENT ROMANS'); assert.equal(map.look.bold, 'CLIENT ROMANS BOLD'); assert.equal(map.symbols['P-POLE'], 'POLE-NEW'); assert.equal(map.symbols['P-Joint'], 'SPLICE-CLOSURE'); assert.equal(map.symbols.loopp, null);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#tplFields .tprf')].map((r) => [r.querySelector('b').textContent, r.querySelector('select').value]));
    assert.ok(rows.length >= 9, JSON.stringify(rows));
    for (const [lab, key] of [['PROJECT', 'project'], ['DRAWN BY', 'drawn'], ['CHECKED BY', 'checked'], ['APPROVED BY', 'approved'], ['DWG NO.', 'dwgNo'], ['SHEET', 'sheetNo'], ['DATE', 'date'], ['SCALE', 'scale'], ['REV', 'rev']]) assert.ok(rows.some(([l, k]) => l === lab && k === key), `${lab} → ${key}: ${JSON.stringify(rows)}`);
    assert.ok(rows.some(([l, k]) => l === 'STATUS' && k === ''), 'STATUS: the template\'s text kept (not known to the app)');
    assert.ok(await inkOf(page, 'tplPic') > 500, 'the sheet\'s picture is drawn');
    assert.equal(await page.evaluate(() => document.getElementById('tplSave').disabled), true, 'Save after the check only');
    // Make and check: a made-up plan on the client's sheet, no problem
    await page.evaluate(() => document.getElementById('tplMake').click());
    await page.waitForFunction(() => !document.getElementById('tprCheck').hidden, null, { timeout: 90000 }); await page.waitForTimeout(400);
    const res = await page.evaluate(() => document.getElementById('tplCheckRes').innerText);
    assert.match(res, /no problem found/); assert.match(res, /PROJECT_TYPE/);
    assert.ok(await inkOf(page, 'tplCheckPic') > 1000, 'the made-up plan\'s picture is drawn');
    await page.screenshot({ path: path.join(process.env.SHOTS || require('os').tmpdir(), 'client-templates-check.png') }).catch(() => {});
    await page.evaluate(() => document.getElementById('tplSave').click());
    const q = await H.answer(page, 'As-plan and CEF'); // (its CEF sheet: the testing CEF template too)
    assert.match(q, /^DEMO CLIENT A - TELECOM DIVISION: its as-plan becomes the testing as-plan template\. Its CEF sheet \(PLAN\) can be the testing CEF template too\.$/);
    await page.waitForFunction(() => document.getElementById('tplReview').hidden, null, { timeout: 20000 }); await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ test: window.__polecam.tpl.test(), list: window.__polecam.tpl.list(), geo: document.getElementById('admTplGeoTestSum').textContent, cef: document.getElementById('admTplCefTestSum').textContent, use: window.__polecam.tpl.testFor('geo') }));
    assert.equal(st.test.geo.name, 'DEMO CLIENT A - TELECOM DIVISION.dxf'); assert.equal(st.test.geo.from, 'made'); assert.equal(st.test.geo.client, 'DEMO CLIENT A - TELECOM DIVISION'); assert.equal(st.test.geo.look.sheet.cell, 620.4);
    assert.equal(st.test.cef.name, 'DEMO CLIENT A - TELECOM DIVISION.dxf'); assert.equal(st.test.cef.look.sheet.name, 'CEF');
    assert.deepEqual(st.list, [], 'no client template per project any more'); assert.match(st.geo, /^DEMO CLIENT A - TELECOM DIVISION\.dxf · \d+ KB · \d{4}-\d\d-\d\d · by Ana Reyes/); assert.match(st.cef, /^DEMO CLIENT A - TELECOM DIVISION\.dxf · /);
    assert.equal(st.use, false, 'not used until Use the testing templates is on');
    await page.check('#admTplTest'); await page.waitForTimeout(300);
    // the export: the plan on the client's sheet, its fields filled, the look written
    const out = await exportPlan(page), I = dxfInfo(out.text);
    assert.deepEqual(I.layouts.slice().sort(), ['GEO', 'KEYMAP', 'LEGEND (CLIENT)'], I.layouts.join(', '));
    assert.equal(I.look && I.look.name, 'DEMO CLIENT A - TELECOM DIVISION'); assert.equal(I.look.text.style, 'G-ESAA TEXT'); assert.equal(I.style('G-ESAA TEXT'), 'romans.shx'); assert.equal(I.style('G-ESAA TEXT BOLD'), 'romand.shx');
    assert.equal(I.look.sheet.unit, 'mm'); assert.equal(I.look.sheet.side, 564); assert.equal(out.cell, I.look.sheet.cell); assert.equal(out.cell, 620.4); // (the 564 mm square viewport at 1:1100)
    assert.ok(I.blocks.includes('DEMO-TB-A1') && I.blocks.includes('P-POLE') && I.blocks.includes('P-Joint'), 'the client\'s title block and the plan\'s symbols');
    assert.ok(out.text.includes('DEMO CLIENT A - TELECOM DIVISION'), 'the client\'s own texts');
    assert.ok(out.text.includes(NAME), 'PROJECT: the project\'s name'); assert.ok(out.text.includes('Ana Reyes'), 'DRAWN BY: the exporter');
    assert.ok(/1 : 1,100 METERS/.test(out.text), 'the scale'); assert.equal((out.text.match(/@@\w+@@/g) || []).length, 0, 'every field filled or blank');
    assert.deepEqual(G.structCheck(out.text), [], 'its structure');
    // the CEF plans' template: the testing CEF one (its CEF sheet)
    const cef = await page.evaluate((n) => Promise.all([window.__polecam.cefTpl.now(n), window.__polecam.tpl.testText('cef')]), NAME);
    assert.equal(cef[0].kind, 'company'); assert.equal(cef[0].test, true); assert.equal(cef[0].name, 'DEMO CLIENT A - TELECOM DIVISION.dxf (testing)');
    const cs = G.cefSheet(cef[1]); assert.ok(cs.vp && cs.tokens.some((t) => t.token === 'LINK') && cs.tokens.some((t) => t.token === 'EXPORTED_BY'), JSON.stringify(cs.tokens));
    // Use the testing templates off: every plan on the company template, as before (byte for byte)
    await planTemplates(page); await page.uncheck('#admTplTest'); await page.waitForTimeout(300);
    await page.evaluate((n) => { window.__polecam.S.project = n; window.__polecam.persist(); }, OTHER);
    const after0 = await exportPlan(page);
    assert.equal(after0.cell, 440); assert.equal(after0.text, before0.text, 'the company template\'s plan as before');
    assert.equal((await page.evaluate((n) => window.__polecam.cefTpl.now(n), NAME)).kind, 'generic', 'the CEF plans on the generic CEF template again');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a phone: a DWG refused; the review fits the screen; Make and check, Save as testing; Clear (asked)', async () => {
  const { ctx, page, errors } = await open({ phone: true });
  try {
    await planTemplates(page);
    // a DWG (its first bytes): refused, saying how to save a DXF
    await page.setInputFiles('#admTplGeoMakeFile', { name: 'client.dwg', mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from('AC1032'), Buffer.alloc(200, 7)]) });
    await page.waitForFunction(() => !document.getElementById('askBox').hidden, null, { timeout: 20000 });
    assert.match(await page.evaluate(() => document.getElementById('askText').textContent), /DWG drawing, not a DXF.*Save As.*DXF/);
    await page.evaluate(() => document.querySelector('#askBox .row button').click()); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.getElementById('tplReview').hidden), true);
    // client B: A3, plain texts
    await page.setInputFiles('#admTplGeoMakeFile', path.join(FX, 'client-b-made-up.dxf'));
    await page.waitForFunction(() => !document.getElementById('tplReview').hidden, null, { timeout: 30000 }); await page.waitForTimeout(600);
    const wide = await page.evaluate(() => { const b = document.querySelector('#tplReview .body'); return { sw: b.scrollWidth, cw: b.clientWidth, doc: document.documentElement.scrollWidth, w: innerWidth }; });
    assert.ok(wide.sw <= wide.cw + 1 && wide.doc <= wide.w + 1, `nothing sideways: ${JSON.stringify(wide)}`);
    const map = await page.evaluate(() => window.__polecam.tpl.review());
    assert.equal(map.plan, 'A3 SHEET'); assert.equal(map.look.font, 'NARROW'); assert.equal(map.symbols['proposed NAP'], 'NAP-BOX'); assert.equal(map.client, 'DEMO CLIENT B');
    await page.screenshot({ path: path.join(process.env.SHOTS || require('os').tmpdir(), 'client-templates-phone-review.png') }).catch(() => {});
    await page.evaluate(() => document.getElementById('tplMake').click());
    await page.waitForFunction(() => !document.getElementById('tprCheck').hidden, null, { timeout: 90000 }); await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => document.getElementById('tplCheckRes').innerText), /no problem found/);
    await page.evaluate(() => document.getElementById('tplSave').click());
    if (map.cef) await H.answer(page, 'As-plan only'); // (its CEF sheet left out)
    await page.waitForFunction(() => document.getElementById('tplReview').hidden, null, { timeout: 20000 }); await page.waitForTimeout(400);
    const t = await page.evaluate(() => window.__polecam.tpl.test());
    assert.equal(t.geo.name, 'DEMO CLIENT B ENGINEERING.dxf'); assert.equal(t.geo.client, 'DEMO CLIENT B'); assert.equal(t.cef, undefined, 'the CEF one not set');
    assert.match(await page.evaluate(() => document.getElementById('admTplGeoTestSum').textContent), /^DEMO CLIENT B ENGINEERING\.dxf · /);
    // Clear (asked)
    await page.click('#admTplGeoClear');
    assert.match(await H.answer(page, 'Clear'), /^DEMO CLIENT B ENGINEERING\.dxf is deleted from this phone\.$/);
    assert.deepEqual(await page.evaluate(() => window.__polecam.tpl.test()), {}); assert.equal(await page.evaluate(() => window.__polecam.tpl.testText('geo')), null);
    assert.match(await page.evaluate(() => document.getElementById('admTplGeoTestSum').textContent), /^None/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
