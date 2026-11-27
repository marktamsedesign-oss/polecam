/* (stage 11, riser detail) the riser detail in the app: the user chooses per riser (the owner: "User chooses per riser"). In the browser.
   Run: node --test tests/riser-detail.spec.cjs (or python3 tests/run_all.py --only riser-detail).
   A made-up As-Plan project: a made-up tower, four made-up poles on a 12C figure 8 cable (the last one existing), a made-up handhole after it on a UG cable
   (the last pole: a riser, found from the cables); the made-up template with the plan's blocks on the phone.
   - The pole's form (AE to UG, under Riser): RISER DETAIL ON THE PLAN, Own sheet (the default for an existing pole, shown chosen) / On the plan / None, and
     its sizes (blank: the standard's, the CEF editor's, as the field's hint); on a riser pole only. Saved in the record (riserDet: only what was set); the
     plan's job carries it; the plan draws it there (Export › Plan drawing: on the plan near its pole; its own sheet; none).
   - The Drawing (a computer): the riser pole selected, its tools Own sheet / On the plan / No detail (the one in its record pressed), also in its right-click
     menu; a choice changes its record, the plan made again shows it (the inset on the plan); Undo takes it back; a pole that is not a riser: no such tools.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { editOn } = require('./drawing-edit.cjs');

const root = path.resolve(__dirname, '..'), SHOTS = process.env.GESAA_SHOTS || '';
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-blocks.dxf'), 'utf8');
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

const NAME = 'DEMO RISER DETAIL', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const POLES = [1, 2, 3, 4].map((i) => [`s${i}`, `CC-${9400 + i}`, LA0, LO0 + (i - 1) * DD]);
const RECS = [...POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: i === 3 ? 'Existing' : 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } })),
  { id: 't1', project: NAME, element: 'Site', siteKind: 'Tower', poleId: 'DEMO SITE MIN9001', status: 'Existing', lat: LA0, lon: LO0 - 1.2 * DD, accuracy: 4.2, created: '2026-11-01T08:08:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} },
  { id: 'h1', project: NAME, element: 'Handhole', poleId: 'HH-9401', status: 'Proposed', lat: LA0 - 0.00025, lon: LO0 + 3 * DD + 0.0001, accuracy: 4.2, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }];
const LINKS = [['t1', 's1', 'F12'], ['s1', 's2', 'F12'], ['s2', 's3', 'F12'], ['s3', 's4', 'F12'], ['s4', 'h1', 'U144']];

/** The app with the made-up project and the made-up template on the phone (o.desk: a computer); each plan built kept (its points' riser details, its report's). */
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
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off',
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfPhotos: false, dxfLabels: 'std' }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { RECS, NAME, USER, LINKS });
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
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ pts: job.pts.filter((p) => p.riserDet || p.riser).map((p) => ({ id: p.id, riser: p.riser, riserDet: p.riserDet || null })), riserDetails: out.report.riserDetails || null, sheets: (out.text.match(/\nAcDbLayout\r?\n  1\r?\n[^\r\n]+/g) || []).map((x) => x.split(/\r?\n/).pop()), inset: (out.text.match(/\nPLAN DETAIL PROPOSED\r?\n/g) || []).length }); return out; };
  }, SEED);
  return { ctx, page, errors };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const recOf = (page, id) => page.evaluate((x) => JSON.parse(JSON.stringify(window.__polecam.points.find((p) => p.id === x))), id);
/** Export › Plan drawing (each question answered as a user going on would): what the builder was given and made. */
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
/** A record's form opened, its AE to UG part shown (where the riser is): its riser detail as the form shows it (null: none there) */
async function form(page, id) {
  await closeAll(page); await page.evaluate((x) => window.__polecam.openEditorFor(x), id); await page.waitForSelector('#editor:not([hidden])'); await page.waitForTimeout(700);
  await page.evaluate(() => window.__polecam.edShow('#boqRowsUg'));
  return page.evaluate(() => { const b = document.querySelector('#editor .riserdet'); if (!b) return null; return { label: b.querySelector('.lbl').textContent, chips: [...b.querySelectorAll('.chips button')].map((c) => [c.textContent, c.getAttribute('aria-pressed')]), sizes: [...b.querySelectorAll('input')].map((i) => [i.dataset.k, i.placeholder, i.value]), shown: !!b.offsetParent }; });
}

test('the pole\'s form: a riser pole\'s detail (Own sheet by default for an existing pole, On the plan, None) and its sizes, saved in its record; the plan draws it where chosen', async () => {
  const { ctx, page, errors } = await open();
  assert.deepEqual(await page.evaluate(() => window.__polecam.risers()), ['s4'], 'the riser found from the cables');
  assert.equal(await form(page, 's3'), null, 'a pole that is not a riser: none');
  let f = await form(page, 's4'); assert.ok(f && f.shown, 'the riser pole: under Riser');
  assert.equal(f.label, 'RISER DETAIL ON THE PLAN'); assert.deepEqual(f.chips, [['Own sheet', 'true'], ['On the plan', 'false'], ['None', 'false']], 'its default: its own sheet (an existing pole)');
  assert.deepEqual(f.sizes.map((x) => [x[0], x[1]]), [['pipeD', '114.3'], ['pipeL', '2.7'], ['guardL', '1.9'], ['encW', '0.47'], ['encH', '1.73'], ['cdD', 'the span’s'], ['cdR', 'the span’s'], ['cdL', 'the plan’s']], 'blank: the standard\'s as its hint');
  const std = await page.evaluate(() => window.GeDxfTpl.riserStd()); for (const k of ['pipeD', 'pipeL', 'guardL', 'encW', 'encH']) assert.equal(f.sizes.find((x) => x[0] === k)[1], String(std[k]), `${k}: the builder's standard`);
  if (SHOTS) { await page.evaluate(() => { const b = document.querySelector('#editor .riserdet'); b.querySelector('details').open = true; b.scrollIntoView({ block: 'end' }); }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'riser-form.png') }); await page.evaluate(() => { document.querySelector('#editor .riserdet details').open = false; }); }
  // nothing set and saved: the record has none (the plan: its own sheet)
  let e = await exportPlan(page); assert.deepEqual(e.pts.map((p) => [p.id, p.riser, p.riserDet]), [['s4', true, null]]); assert.deepEqual(e.riserDetails.map((x) => [x.id, x.show, x.sheet]), [['s4', 'page', 'RISER DETAIL']]); assert.ok(e.sheets.includes('RISER DETAIL'));
  // On the plan, the riser pipe 3 m and the conduit 25 m typed: saved in the record, carried by the job, the plan draws it near its pole
  await form(page, 's4');
  await page.evaluate(() => { [...document.querySelectorAll('#editor .riserdet .chips button')].find((b) => b.textContent === 'On the plan').click(); });
  await page.waitForTimeout(200); f = await page.evaluate(() => [...document.querySelectorAll('#editor .riserdet .chips button')].map((c) => [c.textContent, c.getAttribute('aria-pressed')]));
  assert.deepEqual(f, [['Own sheet', 'false'], ['On the plan', 'true'], ['None', 'false']]);
  await page.evaluate(() => { const d = document.querySelector('#editor .riserdet details'); d.open = true; for (const [k, v] of [['pipeL', '3'], ['cdL', '25']]) { const i = document.querySelector(`#editor .riserdet input[data-k="${k}"]`); i.value = v; i.dispatchEvent(new Event('change')); } });
  await page.evaluate(() => document.getElementById('edSave').click()); await page.waitForTimeout(1500);
  assert.deepEqual((await recOf(page, 's4')).riserDet, { show: 'plan', pipeL: 3, cdL: 25 }, 'in its record: only what was set');
  e = await exportPlan(page);
  assert.deepEqual(e.pts.map((p) => [p.id, p.riserDet]), [['s4', { show: 'plan', pipeL: 3, cdL: 25 }]], 'the job carries it');
  const x = e.riserDetails[0]; assert.deepEqual([x.show, x.sizes.pipeL, x.sizes.cdL, x.sizes.cdFrom, x.to.id, x.texts.pipe], ['plan', 3, 25, 'typed', 'HH-9401', 'PROPOSED %%c114.3mm G.I. RISER PIPE, 3m']);
  assert.ok(x.plan && x.plan.w > 0, 'on the plan'); assert.ok(!e.sheets.includes('RISER DETAIL'), 'no sheet of its own');
  // None: no detail
  await form(page, 's4'); await page.evaluate(() => { [...document.querySelectorAll('#editor .riserdet .chips button')].find((b) => b.textContent === 'None').click(); });
  await page.waitForTimeout(200); assert.equal(await page.evaluate(() => !!document.querySelector('#editor .riserdet details')), false, 'None: no sizes');
  await page.evaluate(() => document.getElementById('edSave').click()); await page.waitForTimeout(1500);
  assert.equal((await recOf(page, 's4')).riserDet.show, 'none'); e = await exportPlan(page); assert.deepEqual([e.riserDetails[0].show, e.inset, e.sheets.includes('RISER DETAIL')], ['none', 0, false]);
  assert.deepEqual(errors, []); await ctx.close();
});

test('the Drawing: a riser pole\'s tools Own sheet / On the plan / No detail (and in its right-click menu) change its record; the plan made again shows it; Undo takes it back', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  const pl = () => page.evaluate(() => window.__polecam.drwPlan()), mv = () => page.evaluate(() => window.__polecam.drwMv()), tb = () => page.evaluate(() => window.__polecam.drwTb());
  const shown = async (when) => { let s = null; for (let i = 0; i < 240; i++) { await page.waitForTimeout(250); s = await pl(); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return s; } } throw new Error(`no plan shown: ${JSON.stringify(s)}`); };
  let s = await shown(); await editOn(page);
  const sel = async (id) => { let m = (await mv()).items.find((q) => q.id === id); assert.ok(m, `${id} on the plan`); await page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [m.box[0], m.box[1]]); await page.waitForTimeout(100); m = (await mv()).items.find((q) => q.id === id);
    for (let k = 0; k < 6; k++) { await page.mouse.click(m.x, m.y); await page.waitForTimeout(380); const S0 = (await mv()).sels; if (S0 && S0.length === 1 && S0[0] === id) return; } throw new Error(`${id} not selected`); };
  const seg = async () => (await tb()).tools.find((t) => t.a === 'riserdet');
  await sel('pole:s3'); assert.equal((await seg()).hidden, true, 'not a riser: no such tools');
  await sel('pole:s4'); let R = await seg(); assert.equal(R.hidden, false, 'the riser pole: its detail\'s tools');
  assert.deepEqual(R.seg.map((b) => [b.v, b.pressed]), [['page', 'true'], ['plan', 'false'], ['none', 'false']], 'as its record has it (none set: its own sheet)');
  // the right-click menu: the same three
  const m4 = (await mv()).items.find((q) => q.id === 'pole:s4'); await page.mouse.click(m4.x, m4.y, { button: 'right' }); await page.waitForTimeout(300);
  const C = await page.evaluate(() => window.__polecam.drwCtx()); assert.ok(C.open); assert.deepEqual(C.items.filter((i) => i.a === 'riserdet').map((i) => [i.v, i.cap]), [['page', 'Own sheet'], ['plan', 'On the plan'], ['none', 'No detail']]);
  const n0 = s.n; await page.evaluate(() => [...document.querySelectorAll('#drawCtx button')].find((b) => b.dataset.a === 'riserdet' && b.dataset.v === 'plan').click()); await page.waitForTimeout(600);
  assert.deepEqual((await recOf(page, 's4')).riserDet, { show: 'plan' }, 'in its record');
  s = await shown((x) => x.n > n0); if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'riser-drawing.png') });
  R = await seg(); assert.deepEqual(R.seg.map((b) => b.pressed), ['false', 'true', 'false'], 'the pole still selected, On the plan pressed');
  // the toolbar: No detail; Undo: back to On the plan, then to none set
  await page.evaluate(() => document.querySelector('#drawTb [data-a="riserdet"] button[data-v="none"]').click()); await page.waitForTimeout(600);
  assert.equal((await recOf(page, 's4')).riserDet.show, 'none');
  await page.click('#drawUndo'); await page.waitForTimeout(700); assert.deepEqual((await recOf(page, 's4')).riserDet, { show: 'plan' }, 'Undo: back');
  await page.click('#drawUndo'); await page.waitForTimeout(700); assert.equal((await recOf(page, 's4')).riserDet, undefined, 'Undo: as it was');
  assert.deepEqual(errors, []); await ctx.close();
});
