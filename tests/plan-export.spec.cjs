/* (Plan style cards, Export picks): the two screens the owner asked to be simple, intuitive and easy for new users (the approved demo,
   plan-export-v3), in the browser. Run: node --test tests/plan-export.spec.cjs (or python3 tests/run_all.py --only plan-export).
   A made-up As-Plan project, 4 poles (no cable, no company template on this phone), on a phone (390x844) and a computer (1280x900).
   Plan style:
   - the seven cards (Pole numbers, Pole details and span lengths, Cable labels (FOC), Photos, Landmarks, Location map, Map sheets),
     each saying in one line what it is set to; More settings under them, folded; no tabs;
   - one card open at a time: a card opened closes the other; the preview shows its part of the plan (Photos: the photos; Location
     map: the location map; Map sheets: the sheets), and the street again once none is open;
   - a summary follows its setting (Photos on the plan: Large; Pole labels: Standard);
   - Reset to recommended (asked first): the photos Normal and Tidy labels again, the summaries say so.
   Export:
   - the checks before export, the quick picks and the tiles; a quick pick picks its tiles (For the client: Plan to print and
     Material list; For the drafter: Plan for AutoCAD, Google Earth map, Photos with their locations), What you get lists their rows,
     one button at the foot (Export 3 files (one ZIP)); one tile: the button says what it makes, and presses that row's own button;
   - a tile's Change › opens its row's choices; the button at the foot makes the file as its row's button does (the pole list: a CSV),
     two files in one ZIP (the pole list and the backup); a check's Fix (No company template on this phone · Get it ›)
     opens Plan style on More settings › Plan file; the tiles picked are picked again next time;
   - no page sideways on a phone, no page errors.
   The tutorial (phone): every Show me of Plan style's and Export's topics (planstyle, whichexport, surveyexport) rings its control on
   the screen it opens, or says when it shows (its "when" note), as tests/regression/v225/tutall.py asks of every topic.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let server, browser, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

const NAME = 'DEMO PLAN EXPORT', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = [['p1', 'CC-9101', 7.10465, 125.6010], ['p2', 'CC-9102', 7.10470, 125.6050], ['p3', 'CC-9103', 7.10478, 125.6100], ['p4', 'CC-9104', 7.11000, 125.6050]];
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' } }));
const SIZES = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desk: { viewport: { width: 1280, height: 900 } } };

/** The app with the made-up project open (the company plan, no template on this phone). */
async function open(size) {
  const ctx = await browser.newContext({ ...SIZES[size], serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: [], cables24: true } }, exp: { dxfMode: 'tpl', dxfLabels: 'tidy' } }));
  }, { RECS, NAME, USER });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  return { ctx, page, errors };
}
const closeAll = async (page) => { await page.evaluate(() => { document.querySelectorAll('section.sheet').forEach((s) => { if (!s.hidden) { const c = s.querySelector('[data-close]'); if (c) c.click(); } }); }); await page.waitForTimeout(500); };
const tap = (page, sel) => (page.__desk ? page.click(sel) : page.tap(sel));
/** Plan style's cards: [id, open, its one line]; More settings open; which scene the preview shows. */
const cards = (page) => page.evaluate(() => ({ cards: [...document.querySelectorAll('#plCards > details.stsec')].map((d) => [d.id, d.open, d.querySelector(':scope > summary .secsum').textContent]),
  more: document.getElementById('plMore').open, scene: window.__polecam.style.sceneNow(), tabs: !!document.querySelector('#drwStyle [role="tab"]') }));
const sideways = (page) => page.evaluate(() => [...document.querySelectorAll('section.sheet:not([hidden]) .body')].some((b) => b.scrollWidth > b.clientWidth + 1) || document.documentElement.scrollWidth > innerWidth);

for (const size of ['phone', 'desk']) {
  test(`${size}: Plan style: seven cards, one open at a time, each in one line; the preview follows; a summary follows its setting; Reset to recommended`, async () => {
    const { ctx, page, errors } = await open(size); page.__desk = size === 'desk';
    try {
      await page.evaluate(() => document.getElementById('goPlanStyle').click()); await page.waitForTimeout(900);
      let c = await cards(page);
      assert.deepEqual(c.cards.map(([id]) => id), ['stNum', 'stPole', 'stCab', 'stPh', 'stLm', 'stVic', 'stGrid']);
      assert.ok(c.cards.every(([, o, sum]) => !o && sum.trim().length > 3), `every card closed, each with its line: ${JSON.stringify(c.cards)}`);
      assert.equal(c.more, false, 'More settings folded'); assert.equal(c.tabs, false, 'no Basic / Advanced tabs');
      assert.equal(c.scene, 'street');
      const sum = (id) => c.cards.find((x) => x[0] === id)[2];
      assert.match(sum('stPh'), /^Normal \(18 mm\) · stamped lat-long \+ address$/);
      assert.match(sum('stPole'), /^Tidy labels · clamp types on · pole ID Auto$/);
      assert.match(sum('stCab'), /^Along each cable: PROPOSED 72C FIG-8 AE \(RUN 1\)$/);
      // one at a time; the preview goes to the card's part of the plan
      for (const [id, scene] of [['stPh', 'photo'], ['stVic', 'vic'], ['stGrid', 'grid'], ['stNum', 'street']]) {
        await tap(page, `#${id} > summary`); await page.waitForTimeout(600);
        c = await cards(page);
        assert.deepEqual(c.cards.filter(([, o]) => o).map(([x]) => x), [id], `${id}: the only card open`);
        assert.equal(c.scene, scene, `${id}: its part of the plan`);
        const top = await page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(), b = document.querySelector('#drwStyle .dsbody').getBoundingClientRect(); return r.top >= b.top - 1 && r.top < b.bottom - 60; }, id);
        assert.ok(top, `${id}: on the screen`);
      }
      await tap(page, '#stNum > summary'); await page.waitForTimeout(600); // (closed: none open, the street)
      c = await cards(page); assert.deepEqual(c.cards.filter(([, o]) => o), []); assert.equal(c.scene, 'street');
      // a summary follows its setting
      await tap(page, '#stPh > summary'); await page.waitForTimeout(500);
      await tap(page, '#stPhSize .chip[data-v="24"]'); await page.waitForTimeout(400);
      await tap(page, '#stPole > summary'); await page.waitForTimeout(500);
      await tap(page, '#dxfLbl .chip[data-v="std"]'); await page.waitForTimeout(400);
      c = await cards(page);
      assert.match(c.cards.find((x) => x[0] === 'stPh')[2], /^Large \(36 mm\) · /);
      assert.match(c.cards.find((x) => x[0] === 'stPole')[2], /^Standard labels · /);
      assert.deepEqual(await page.evaluate(() => [window.__polecam.style.pl().photo.size, window.__polecam.S.exp.dxfLabels]), [24, 'std']);
      // Reset to recommended: asked first, then the company standard and the defaults
      assert.equal(await page.textContent('#stReset'), 'Reset to recommended');
      await tap(page, '#stReset'); await page.waitForTimeout(500);
      assert.equal(await page.textContent('#askTitle'), 'Reset to recommended?');
      await page.locator('#askBox button.primary').first().click(); await page.waitForTimeout(600);
      c = await cards(page);
      assert.match(c.cards.find((x) => x[0] === 'stPh')[2], /^Normal \(18 mm\) · /);
      assert.match(c.cards.find((x) => x[0] === 'stPole')[2], /^Tidy labels · /);
      // More settings: its sections, each in one line; Find a setting opens it on its section
      await tap(page, '#plMore > summary'); await page.waitForTimeout(400);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#plMore details.stsec')].map((d) => d.id)), ['stId', 'stCl', 'stRoute', 'stCrowd', 'stSite', 'stFile']);
      assert.equal(await sideways(page), false, 'nothing sideways');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });

  test(`${size}: Export: checks, quick picks and tiles; a pick picks its tiles; What you get with Change ›; one button; a check's Fix opens Plan style`, async () => {
    const { ctx, page, errors } = await open(size); page.__desk = size === 'desk';
    try {
      await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(900);
      const st = () => page.evaluate(() => ({ tiles: [...document.querySelectorAll('#xTiles .xtile')].map((t) => [t.dataset.xt, t.getAttribute('aria-pressed') === 'true']),
        more: [...document.querySelectorAll('#xTiles2 .xtile')].map((t) => t.dataset.xt), picks: [...document.querySelectorAll('#xPicks .xpk')].map((t) => [t.querySelector('b').textContent, t.getAttribute('aria-pressed') === 'true']),
        get: [...document.querySelectorAll('#export .xcard.xsel')].map((c) => c.querySelector('.head b').textContent), go: document.getElementById('xGoBox').hidden ? '' : document.getElementById('xMultiGo').textContent,
        checks: [...document.querySelectorAll('#xChecks .xchk')].map((x) => x.querySelector('span').textContent), ask: document.getElementById('xAskT').textContent }));
      let s = await st();
      assert.equal(s.ask, 'What do you need?');
      assert.deepEqual(s.tiles.map(([k]) => k), ['xOnePdf', 'doDxf', 'doKmz', 'doBoq', 'doPhotos', '*all']);
      assert.deepEqual(s.more, ['doCsv', 'doRouteXlsx', 'doPhotoReport', 'doCompletion', 'doBackup', 'doDataset']);
      assert.deepEqual(s.picks.map(([n]) => n), ['For the client', 'For the drafter', 'Everything']);
      assert.deepEqual(s.tiles.filter(([, on]) => on).map(([k]) => k), ['xOnePdf'], 'the first tile, at first');
      // For the client: the plan to print and the material list
      await tap(page, '#xPicks [data-xp="client"]'); await page.waitForTimeout(500); s = await st();
      assert.deepEqual(s.tiles.filter(([, on]) => on).map(([k]) => k), ['xOnePdf', 'doBoq']);
      assert.deepEqual(s.picks.filter(([, on]) => on).map(([n]) => n), ['For the client']);
      assert.deepEqual(s.get, ['Plan drawing', 'Material list (BOQ / BOM)']);
      assert.equal(s.go, 'Export 2 files (one ZIP)');
      assert.ok(s.checks.includes('No company template on this phone'), JSON.stringify(s.checks));
      // For the drafter: AutoCAD, Google Earth and the photos
      await tap(page, '#xPicks [data-xp="drafter"]'); await page.waitForTimeout(500); s = await st();
      assert.deepEqual(s.tiles.filter(([, on]) => on).map(([k]) => k), ['doDxf', 'doKmz', 'doPhotos']);
      assert.deepEqual(s.get, ['Plan drawing', 'Google Earth map', 'Photos with their locations']);
      assert.equal(s.go, 'Export 3 files (one ZIP)');
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#xMultiList input:checked')].map((c) => c.value)), ['doDxf', 'doKmz', 'doPhotos'], 'the ticks follow (Several at once)');
      assert.deepEqual(await page.evaluate(() => ['doDxf', 'doKmz', 'doPhotos'].map((id) => document.getElementById(id).getClientRects().length > 0)), [false, false, false], 'their own buttons hidden');
      // Everything: every main tile
      await tap(page, '#xPicks [data-xp="every"]'); await page.waitForTimeout(500); s = await st();
      assert.deepEqual(s.tiles.filter(([, on]) => on).map(([k]) => k), ['xOnePdf', 'doDxf', 'doKmz', 'doBoq', 'doPhotos', '*all']);
      assert.equal(s.go, 'Export 5 files (one ZIP)');
      // one tile: the button at the foot says what it makes; Change › opens its choices and shows its own button there
      await tap(page, '#xTiles [data-xt="*all"]'); await page.waitForTimeout(400); s = await st();
      assert.deepEqual(s.tiles.filter(([, on]) => on), []); assert.equal(s.go, 'Pick what you need');
      assert.equal(await page.evaluate(() => document.getElementById('xMultiGo').disabled), true);
      await tap(page, '#xTiles [data-xt="doKmz"]'); await page.waitForTimeout(400); s = await st();
      assert.deepEqual(s.get, ['Google Earth map']); assert.equal(s.go, 'Make the Google Earth map');
      const kmz = '#export .xcard.xsel > .head';
      assert.equal(await page.evaluate(() => document.getElementById('kmzRoute').getClientRects().length), 0, 'its choices folded');
      await page.locator(kmz).scrollIntoViewIfNeeded(); await tap(page, kmz); await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(() => ({ open: document.querySelector('#export .xcard.xsel').classList.contains('xopen'), more: document.getElementById('kmzRoute').closest('details').getClientRects().length > 0, own: document.getElementById('doKmz').getClientRects().length > 0, foot: !document.getElementById('xGoBox').hidden, label: document.querySelector('#export .xcard.xsel .xchgl').textContent })),
        { open: true, more: true, own: true, foot: false, label: 'Close' });
      // the button at the foot makes the file as the row's own button does: one file (the pole list), then two in one ZIP
      await tap(page, '#xTiles [data-xt="doKmz"]'); await page.waitForTimeout(300);
      await tap(page, '#xMoreT > summary'); await page.waitForTimeout(300);
      await page.locator('#xTiles2 [data-xt="doCsv"]').scrollIntoViewIfNeeded(); await tap(page, '#xTiles2 [data-xt="doCsv"]'); await page.waitForTimeout(400);
      assert.equal((await st()).go, 'Make the pole list');
      await tap(page, '#xMultiGo'); await page.waitForSelector('#resultBox:not([hidden])', { timeout: 30000 });
      assert.match(await page.textContent('#resultName'), /\.csv · /);
      await page.evaluate(() => { document.getElementById('resultBox').hidden = true; });
      await page.locator('#xTiles2 [data-xt="doBackup"]').scrollIntoViewIfNeeded(); await tap(page, '#xTiles2 [data-xt="doBackup"]'); await page.waitForTimeout(400);
      assert.equal((await st()).go, 'Export 2 files (one ZIP)');
      await tap(page, '#xMultiGo'); await page.waitForSelector('#resultBox:not([hidden])', { timeout: 60000 });
      assert.match(await page.textContent('#resultName'), /_exports_[\d_]+\.zip · /, 'one ZIP');
      assert.doesNotMatch(await page.evaluate(() => document.getElementById('toast').textContent || ''), /Not made|No file was made/, 'both made');
      await page.evaluate(() => { document.getElementById('resultBox').hidden = true; });
      await tap(page, '#xTiles2 [data-xt="doCsv"]'); await tap(page, '#xTiles2 [data-xt="doBackup"]'); await page.waitForTimeout(300);
      // a check's Fix: no template: Plan style on More settings › Plan file
      await tap(page, '#xTiles [data-xt="doDxf"]'); await page.waitForTimeout(500);
      const fix = page.locator('#xChecks .xchk').filter({ hasText: 'No company template on this phone' }).locator('button');
      assert.equal(await fix.textContent(), 'Get it ›');
      await fix.scrollIntoViewIfNeeded(); await fix.click(); await page.waitForTimeout(900);
      assert.deepEqual(await page.evaluate(() => ({ style: !document.getElementById('drwStyle').hidden, more: document.getElementById('plMore').open, file: document.getElementById('stFile').open })), { style: true, more: true, file: true });
      await closeAll(page);
      // the tiles picked are kept for next time
      await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(900); s = await st();
      assert.deepEqual(s.tiles.filter(([, on]) => on).map(([k]) => k), ['doDxf']);
      assert.equal(await sideways(page), false, 'nothing sideways');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('phone: the tutorial: every Show me of Plan style\'s and Export\'s topics rings its control or says when it shows', async () => {
  const { ctx, page, errors } = await open('phone');
  try {
    const topics = await page.evaluate(() => GESAA_TUTORIAL.topics.filter((t) => ['planstyle', 'whichexport', 'surveyexport'].includes(t.id)).map((t) => ({ id: t.id, n: t.steps.filter((s) => s.go || s.hl).length })));
    assert.equal(topics.length, 3);
    const bad = [];
    for (const t of topics) {
      for (let k = 0; k < t.n; k++) {
        await closeAll(page);
        await page.evaluate(() => document.getElementById('tutorialBtn').click()); await page.waitForTimeout(300);
        await page.evaluate((id) => document.querySelector(`#tutList .tuttopic[data-topic="${id}"]`).click(), t.id); await page.waitForTimeout(300);
        await page.evaluate((k) => document.querySelectorAll('#tutSteps .show')[k].click(), k); await page.waitForTimeout(1500);
        const st = await page.evaluate(() => { const tip = document.getElementById('tutTip'), spot = document.getElementById('tutSpot'), w = tip && tip.querySelector('p.tutwhen');
          return { tip: !!tip, spot: !!spot && spot.style.display !== 'none', when: !!w && !w.hidden, top: [...document.querySelectorAll('section.sheet:not([hidden])')].map((x) => x.id).pop() || '' }; });
        if (!st.tip || !(st.spot || st.when)) bad.push(`${t.id} ${k}: ${JSON.stringify(st)}`);
        await page.evaluate(() => { const b = [...document.querySelectorAll('#tutTip button')].find((x) => /Back to the tutorial/.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(300);
      }
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
