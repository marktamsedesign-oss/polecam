/* (beta 7.13, Drawing fixes) the owner, after testing beta 7.12 on a computer and a phone: "allow right click to open options tool for that element" and "Pole
   Numbering when moved generates a shadow and sometimes automaticall reduce. this should not be". Run: node --test tests/drawing-menu.spec.cjs (or python3
   tests/run_all.py --only drawing-menu). The app (a computer, 1280 x 900; a phone, 412 x 915), the made-up As-Plan project of drawing-records.spec.cjs and the
   made-up template with the plan's blocks:
   - a right-click on an item of the plan selects it (what a tap there selects; on an item already selected: the selection as it is) and opens its tools as a
     menu at the pointer, inside the window: the toolbar's tools it can take, with their icons and words, in its order; each does what its toolbar button does
     (one Undo step); Colour shows its colours in the menu; the keys go through it; Esc or a click elsewhere closes it; on the empty plan: Add text here. The
     browser's own menu does not open over the plan (it still does elsewhere in the app); a phone's long press: as before (no menu);
   - a pole's number dragged on the Drawing (Standard and Tidy, green numbers over their dark shadow): nothing of it left where it was while it is dragged and
     once it is let go; when the plan is made again with it there: drawn once, as large as before, its shadow under it as far off as its size makes it
     (beta 7.12, Tidy: a larger or smaller circle, and its shadow a dark copy beside it).
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { editOn, chgOf, allAutomatic } = require('./drawing-edit.cjs'); // ((beta 7.14, View / Edit) the Drawing opens in View: Edit on to change the plan)

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-blocks.dxf'), 'utf8'); // (the made-up template with the plan's blocks)
const SHOTS = process.env.SHOTS_DIR || null; // (screenshots for a person to look at: SHOTS_DIR=folder)
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);

/* ---------- the app, in a browser ---------- */
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

const NAME = 'DEMO MENU TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, LA0 + (i > 4 ? (i - 4) * DD : 0), LO0 + Math.min(i, 4) * DD]);
const ON = { s2: { closure: true, closureId: 'CL-9001', boq: { owner: 'Electric', clamp: '8-10', clo: '24C', cloSt: 'New' } }, s3: { boq: { owner: 'Electric', clamp: '8-10', guy: 'Down guy', ground: 'Yes' } }, s4: { status: 'Existing' },
  s6: { nap: true, napId: 'NAP-9001', boq: { owner: 'Electric', clamp: '8-10', napType: 'NAP 1x8', napSt: 'New' } } };
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' }, ...(ON[id] || {}) }))
  .concat([{ id: 't1', project: NAME, element: 'Site', siteKind: 'Tower', poleId: 'DEMO SITE MIN9001', status: 'Existing', lat: LA0, lon: LO0 - 1.2 * DD, accuracy: 4.2, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }]);
const LINKS = [['t1', 's1', 'F12'], ...POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12'])];
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * DD + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * DD + 0.00008], [LA0 + 3 * DD + 0.0006, LO0 + 4 * DD + 0.00008]]),
  { type: 'node', id: 9, lat: LA0 + 0.0002, lon: LO0 + 2 * DD, tags: { name: 'MADE-UP CHAPEL', amenity: 'place_of_worship' } }] };
/** The app with the made-up project, the made-up template on the phone (o.desk: a computer; o.exp: Export settings; o.pl: Plan style). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 412, height: 915 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.startsWith('https://overpass-api.de/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); return r.abort(); });
  const page = await ctx.newPage(), errors = []; page.__touch = !o.desk;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, exp, pl }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: true, dxfCef: false, planOut: 'files', dxfMarks: 'both', dxfLabels: 'std', ...exp }, ...(pl ? { plStyle: pl } : {}),
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { RECS, NAME, USER, LINKS, exp: o.exp || {}, pl: o.pl || null });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.evaluate(async (ids) => { for (const id of ids) { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, POLES.map((p) => p[0]));
  await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-blocks.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED);
  return { ctx, page, errors };
}
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const mvOf = (page) => page.evaluate(() => window.__polecam.drwMv());
const tbOf = (page) => page.evaluate(() => window.__polecam.drwTb());
const ctxOf = (page) => page.evaluate(() => window.__polecam.drwCtx());
const styles = (page) => page.evaluate((x) => JSON.parse(localStorage.getItem('polecam.settings')).meta[x].mvStyle || {}, NAME);
async function drawing(page, mpp) {
  await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(([la, lo, m]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width * 0.5, r.height * 0.5); }, [LA0 + 0.0006, LO0 + 0.0012, mpp || 0.4]);
}
async function shown(page, when) {
  let s = null; for (let i = 0; i < 240; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); await editOn(page); return pl(page); } } // ((beta 7.14, View / Edit) shown: Edit on, to change it)
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
const itemOf = async (page, id) => (await mvOf(page)).items.find((m) => m.id === id);
/** An item on the screen (the view moved to it when near an edge): where it is drawn, in page pixels. */
async function see(page, id) {
  let m = await itemOf(page, id); for (let k = 0; k < 150 && !m; k++) { await page.waitForTimeout(100); m = await itemOf(page, id); } assert.ok(m, `${id} on the plan`);
  const R = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  if (m.x < R.l + 50 || m.x > R.l + R.w - 110 || m.y < R.t + 190 || m.y > R.t + R.h - 230) { await page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [m.box[0], m.box[1]]); await page.waitForTimeout(80); m = await itemOf(page, id); }
  return m;
}
const tap = (page, x, y) => (page.__touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
/** Tapped (slower than a double-tap) until it is the one selected. */
async function select(page, id) {
  const m = await see(page, id);
  for (let k = 1; k <= 6; k++) { await tap(page, m.x, m.y); await page.waitForTimeout(360); const s = (await mvOf(page)).sels; if (s.length === 1 && s[0] === id) return m; }
  throw new Error(`${id} not selected: ${JSON.stringify((await mvOf(page)).sels)}`);
}
const tbClick = (page, a, v) => page.evaluate(([a0, v0]) => { const g = document.querySelector(`#drawTb [data-a="${a0}"]`); const b = v0 != null ? g.querySelector(`button[data-v="${v0}"]`) : g; if (!b || b.hidden || b.closest('[hidden]')) throw new Error(`${a0} ${v0 || ''}: not on the toolbar`); b.click(); }, [a, v == null ? null : String(v)]);
/** A right-click there (the mouse's right button), then the menu as it is. */
async function rightClick(page, x, y) { await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); return ctxOf(page); }
/** A tool of the menu chosen with the mouse (v: a choice: Existing / Proposed, a colour). */
async function ctxClick(page, a, v) {
  const C = await ctxOf(page), it = C.items.find((x) => x.a === a && (v == null || x.v === String(v))); assert.ok(it, `${a} ${v || ''}: in the menu (${C.items.map((x) => x.a).join(', ')})`); assert.ok(!it.disabled, `${a}: not greyed`);
  await page.mouse.click(it.x, it.y); await page.waitForTimeout(250);
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** The toolbar's tools shown (as the menu lists them: a choice as its tool:its value), each one's words and icon. */
const tbTools = (page) => page.evaluate(() => [...document.getElementById('drawTb').children].filter((el) => el.dataset.a && !el.hidden && !el.classList.contains('drwtbsep') && !['done', 'more', 'xtra', 'scope', 'pal'].includes(el.dataset.a))
  .flatMap((el) => (el.classList.contains('drwtbseg') ? [...el.querySelectorAll('button')] : [el]).map((b) => ({ k: b.dataset.v ? `${el.dataset.a}:${b.dataset.v}` : el.dataset.a, cap: (b.querySelector('span:last-child') || {}).textContent, icon: b.querySelector('svg use') ? b.querySelector('svg use').getAttribute('href') : b.querySelector('.sw') ? 'swatch' : null }))));
const keyOf = (x) => (x.v ? `${x.a}:${x.v}` : x.a);

test('a right-click on the plan: the tools of what is under the pointer as a menu there, each doing what its toolbar button does; Esc or a click elsewhere closes it; no browser menu over the plan', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  await page.evaluate(() => { window.__cm = []; window.addEventListener('contextmenu', (e) => window.__cm.push({ on: e.target.id || e.target.tagName, prevented: e.defaultPrevented })); }); // (after the app's own: whether the browser's menu opens)
  // a pole's details: selected as a tap selects it, its menu at the pointer: the toolbar's tools it can take, their icons and words, in its order, inside the window
  let m = await see(page, 'lbl:s3'), C = await rightClick(page, m.x, m.y);
  assert.deepEqual((await mvOf(page)).sels, ['lbl:s3'], 'what a tap there selects');
  assert.ok(C.open, 'its menu'); assert.ok(!(await tbOf(page)).hidden, 'and the toolbar, as for a tap');
  const T = await tbTools(page); assert.deepEqual(C.items.map(keyOf), T.map((t) => t.k), 'the toolbar\'s tools it can take, in its order');
  for (const k of ['h-', 'h+', 'bold', 'italic', 'color', 'text', 'rot+', 'rot-', 'lead', 'front', 'forward', 'backward', 'back', 'auto', 'del']) assert.ok(C.items.some((x) => keyOf(x) === k), `${k}: in the menu`);
  for (const x of C.items) { const t = T.find((y) => y.k === keyOf(x)); assert.equal(x.cap, t.cap, `${keyOf(x)}: its words`); assert.equal(x.icon, t.icon, `${keyOf(x)}: its icon`); assert.ok(x.icon, `${keyOf(x)}: an icon`); }
  assert.equal(C.items.find((x) => x.a === 'lead').checked, 'true', 'Line: on, ticked'); assert.equal(C.items.find((x) => x.a === 'bold').checked, 'false', 'Bold: off');
  assert.equal(C.items.find((x) => x.a === 'auto').disabled, true, 'Automatic greyed: where the plan puts it');
  assert.ok(C.rect.left >= 0 && C.rect.top >= 0 && C.rect.right <= 1280 && C.rect.bottom <= 900, `inside the window: ${JSON.stringify(C.rect)}`);
  assert.ok(Math.abs(C.rect.left - m.x) <= 4 || Math.abs(C.rect.right - m.x) <= 4, 'at the pointer'); assert.equal(C.focus, 'h-', 'its first tool ready for the keys');
  await shot(page, 'menu-computer.png');
  let cm = await page.evaluate(() => window.__cm); assert.equal(cm.length, 1); assert.equal(cm[0].on, 'drawCanvas'); assert.equal(cm[0].prevented, true, 'over the plan: not the browser\'s menu');
  // Text + in the menu: as the toolbar's Text + does (one Undo step), the menu put away
  const u0 = (await mvOf(page)).undo.length; await ctxClick(page, 'h+');
  assert.ok(!(await ctxOf(page)).open, 'put away once chosen'); let St = await styles(page); const h3 = (St['lbl:s3'] || {}).h; assert.ok(h3 > 1, `larger: ${JSON.stringify(St)}`);
  assert.equal((await mvOf(page)).undo.length, u0 + 1, 'one Undo step'); assert.deepEqual((await mvOf(page)).sels, ['lbl:s3'], 'still selected');
  await select(page, 'lbl:s5'); await tbClick(page, 'h+'); await page.waitForTimeout(150); St = await styles(page); assert.equal(St['lbl:s5'].h, h3, 'the toolbar\'s Text + the same');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  St = await styles(page); assert.ok(!St['lbl:s3'] && !St['lbl:s5'], `Undo took both back: ${JSON.stringify(St)}`);
  // Bold, Colour (its colours in the menu, the one now ticked), Turn: each as its button
  m = await see(page, 'lbl:s3'); C = await rightClick(page, m.x, m.y); assert.deepEqual((await mvOf(page)).sels, ['lbl:s3']); await ctxClick(page, 'bold');
  St = await styles(page); assert.equal(St['lbl:s3'].bold, true, 'Bold');
  C = await rightClick(page, m.x, m.y); assert.equal(C.items.find((x) => x.a === 'bold').checked, 'true', 'Bold: ticked now');
  await ctxClick(page, 'color'); C = await ctxOf(page); assert.ok(C.open, 'Colour: the menu stays, its colours shown');
  const pal = C.items.filter((x) => x.a === 'pal'); assert.equal(pal.length, 9, 'the toolbar\'s colours'); assert.equal(pal.find((x) => x.checked === 'true').v, '0', 'as the plan, ticked');
  assert.ok(C.rect.bottom <= 900 && C.rect.right <= 1280, 'still inside the window'); await shot(page, 'menu-colours.png');
  await ctxClick(page, 'pal', 1); assert.ok(!(await ctxOf(page)).open); St = await styles(page); assert.equal(St['lbl:s3'].color, 1, 'red');
  const a0 = (await page.evaluate(() => window.__polecam.drwMvItem('lbl:s3'))).boxNow[4]; C = await rightClick(page, m.x, m.y); await ctxClick(page, 'rot+');
  near((((await mvOf(page)).pins.lblPin.s3[2] - a0 + 540) % 360) - 180, 15, 0.05, 'Turn ↺: 15° anticlockwise, as the toolbar turns it');
  // the keys: ↓ to the next, Enter chooses it; Esc puts it away, the selection kept
  C = await rightClick(page, m.x, m.y); await page.keyboard.press('ArrowDown'); assert.equal((await ctxOf(page)).focus, 'h+'); const hb = (await styles(page))['lbl:s3'].h || 1;
  await page.keyboard.press('Enter'); await page.waitForTimeout(200); assert.ok(!(await ctxOf(page)).open); assert.ok((await styles(page))['lbl:s3'].h > hb, 'Enter: Text +');
  C = await rightClick(page, m.x, m.y); assert.ok(C.open); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  assert.ok(!(await ctxOf(page)).open, 'Esc: put away'); assert.deepEqual((await mvOf(page)).sels, ['lbl:s3'], 'the selection kept');
  // a click elsewhere (the app's header) puts it away
  C = await rightClick(page, m.x, m.y); assert.ok(C.open); const hd = await page.evaluate(() => { const r = document.getElementById('drawTitle').getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; });
  await page.mouse.click(hd[0], hd[1]); await page.waitForTimeout(150); assert.ok(!(await ctxOf(page)).open, 'a click elsewhere: put away');
  // several selected (Shift + click): a right-click on one of them keeps them all; Edit text (one item only) not offered
  await page.keyboard.down('Shift'); const m5 = await see(page, 'lbl:s5'); await page.mouse.click(m5.x, m5.y); await page.keyboard.up('Shift'); await page.waitForTimeout(300);
  assert.deepEqual((await mvOf(page)).sels.slice().sort(), ['lbl:s3', 'lbl:s5']);
  C = await rightClick(page, m5.x, m5.y); assert.deepEqual((await mvOf(page)).sels.slice().sort(), ['lbl:s3', 'lbl:s5'], 'on one selected: the selection as it is');
  assert.ok(C.items.some((x) => x.a === 'h+') && !C.items.some((x) => x.a === 'text'), 'the tools for both'); await page.keyboard.press('Escape');
  // a pole: its own tools (Existing / Proposed: its record, ticked as it is; its size), what a tap on its centre selects
  const p6 = await page.evaluate(() => window.__polecam.drwPt('s6')); C = await rightClick(page, p6[0], p6[1]);
  assert.deepEqual((await mvOf(page)).sels, ['pole:s6'], 'the pole'); assert.ok(C.items.some((x) => x.a === 's+') && C.items.some((x) => x.a === 'del'), 'its size, Delete');
  assert.equal(C.items.find((x) => x.a === 'status' && x.v === 'proposed').checked, 'true'); assert.equal(C.items.find((x) => x.a === 'status' && x.v === 'existing').role, 'menuitemradio');
  await shot(page, 'menu-pole.png'); await page.keyboard.press('Escape');
  // the empty plan: Add text here (the row's Text), its editor opened for a text there
  const fr = await page.evaluate(([la, lo]) => window.__polecam.drwLL(la, lo), [LA0 + 0.0009, LO0 + 0.0004]); assert.equal((await page.evaluate(([X, Y]) => window.__polecam.drwCands(X, Y, true), fr)).length, 0, 'nothing there');
  C = await rightClick(page, fr[0], fr[1]); assert.deepEqual(C.items.map((x) => [x.a, x.cap]), [['addtext', 'Add text here']]); assert.equal(C.items[0].icon, '#ce-addtxt', 'the row\'s Text icon');
  await ctxClick(page, 'addtext'); const tx = await page.evaluate(() => window.__polecam.drwTxt()); assert.ok(tx.open, 'the text editor'); assert.equal(tx.title, 'Add text');
  await page.waitForTimeout(500); await page.click('#drawTxtNo'); await page.waitForTimeout(200);
  // elsewhere in the app the browser's own menu is left alone
  await page.evaluate(() => { window.__cm = []; }); const hr = await page.evaluate(() => { const r = document.getElementById('drawTitle').getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; });
  await page.mouse.click(hr[0], hr[1], { button: 'right' }); await page.waitForTimeout(150); cm = await page.evaluate(() => window.__cm); assert.equal(cm.length, 1); assert.equal(cm[0].prevented, false, 'elsewhere: the browser\'s menu');
  assert.ok(!(await ctxOf(page)).open);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a phone: a long press is not a right-click (no menu, nothing selected by it, the browser left alone)', async () => {
  const { ctx, page, errors } = await open({});
  await drawing(page); await shown(page);
  const m = await see(page, 'lbl:s3');
  const r = await page.evaluate(([x, y]) => { const e = new PointerEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }); return { prevented: !document.getElementById('drawCanvas').dispatchEvent(e) }; }, [m.x, m.y]);
  assert.equal(r.prevented, false); assert.ok(!(await ctxOf(page)).open, 'no menu'); assert.deepEqual((await mvOf(page)).sels, [], 'nothing selected by it');
  await select(page, 'lbl:s3'); assert.ok(!(await tbOf(page)).hidden, 'a tap: its toolbar, as before'); assert.ok(!(await ctxOf(page)).open);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** The number's circles as the Drawing draws them (its own lines of the display list with more than 8 points): each one's middle and size, metres; the shadow first. */
const circles = (own) => own.lines.filter((L) => L.length > 8).map((L) => { const xs = L.map((q) => q[0]), ys = L.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return { c: [(x0 + x1) / 2, (y0 + y1) / 2], d: x1 - x0 }; });
/** How many green pixels (a number's, Plan style's green) the canvas has within r page pixels of (x, y). */
const greenAt = (page, x, y, r) => page.evaluate(([X, Y, R]) => { const cv = document.getElementById('drawCanvas'), b = cv.getBoundingClientRect(), k = cv.width / b.width, x0 = Math.max(0, Math.round((X - R - b.left) * k)), y0 = Math.max(0, Math.round((Y - R - b.top) * k)), w = Math.round(2 * R * k), h = w;
  const D = cv.getContext('2d').getImageData(x0, y0, w, h).data; let n = 0; for (let i = 0; i < D.length; i += 4) if (D[i + 1] > 150 && D[i] < 120 && D[i + 2] < 120) n++; return n; }, [x, y, r]);

test('a pole\'s number dragged on the Drawing (Standard, Tidy): nothing left where it was; with the plan made again, drawn once, as large as before, its shadow under it', async () => {
  for (const lab of ['std', 'tidy']) {
    const { ctx, page, errors } = await open({ desk: true, exp: { dxfLabels: lab }, pl: { num: { color: 3, rta: { on: false } } } }); // (green numbers over their dark shadow, as the owner's)
    await drawing(page, lab === 'tidy' ? 0.03 : 0.06); await shown(page);
    const id = 'num:s3', m = await see(page, id), it0 = await page.evaluate((x) => window.__polecam.drwMvItem(x), id), C0 = circles(await page.evaluate((x) => window.__polecam.drwOwn(x), id)), r = m.w / 2;
    assert.equal(C0.length, 2, `${lab}: its circle over its shadow`); assert.equal(it0.how, 'auto'); if (lab === 'tidy') assert.ok(it0.block, 'in its block');
    const g0 = await greenAt(page, m.x, m.y, r); assert.ok(g0 > 30, `${lab}: green where it is: ${g0}`); await shot(page, `number-${lab}-0-before.png`);
    // dragged: nothing of it where it was, it under the mouse (drawn once there)
    const n0 = (await pl(page)).n, dx = 110, dy = -70; await page.mouse.move(m.x, m.y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(m.x + dx * k / 12, m.y + dy * k / 12); await page.waitForTimeout(16); }
    let gOld = await greenAt(page, m.x, m.y, r * 0.9), gNew = await greenAt(page, m.x + dx, m.y + dy, r); assert.ok(gOld <= 0.02 * g0, `${lab}: dragged, nothing left where it was: ${gOld} of ${g0}`); assert.ok(gNew > 0.7 * g0 && gNew < 1.3 * g0, `${lab}: there, once: ${gNew} vs ${g0}`);
    await shot(page, `number-${lab}-1-dragged.png`);
    await page.mouse.up(); await page.waitForTimeout(80);
    gOld = await greenAt(page, m.x, m.y, r * 0.9); assert.ok(gOld <= 0.02 * g0, `${lab}: let go, nothing left where it was: ${gOld}`); assert.deepEqual((await mvOf(page)).lifted.map((x) => x.id), [id], 'only it drawn apart from the plan');
    await shot(page, `number-${lab}-2-let-go.png`);
    // the plan made again with it placed by hand: drawn once, there; its circle as large as before, its shadow under it in proportion
    await shown(page, (s) => s.n > n0); const it1 = await page.evaluate((x) => window.__polecam.drwMvItem(x), id), C1 = circles(await page.evaluate((x) => window.__polecam.drwOwn(x), id));
    assert.equal(it1.how, 'by hand'); assert.equal((await mvOf(page)).lifted.length, 0, 'nothing drawn apart from the plan any more');
    near(it1.box[0], it0.box[0] + dx * (it0.box[2] / m.w), 0.05 * it0.box[2], `${lab}: E where it was let go`); near(it1.box[1], it0.box[1] - dy * (it0.box[2] / m.w), 0.05 * it0.box[2], `${lab}: N`);
    near(it1.box[2], it0.box[2], 1e-6, `${lab}: as large as before`); assert.equal(C1.length, 2, `${lab}: its circle and its shadow, once`);
    near(C1[1].d, C0[1].d, 0.01 * C0[1].d, `${lab}: its circle as drawn before`); near(C1[0].d, C1[1].d, 0.01 * C1[1].d, `${lab}: its shadow as large`);
    const o = [C1[0].c[0] - C1[1].c[0], C1[0].c[1] - C1[1].c[1]], o0 = [C0[0].c[0] - C0[1].c[0], C0[0].c[1] - C0[1].c[1]];
    assert.ok(o[0] > 0 && o[1] < 0 && Math.abs(o[0]) < 0.045 * C1[1].d && Math.abs(o[1]) < 0.045 * C1[1].d, `${lab}: its shadow just under it (right, down): ${o} for ${C1[1].d}`);
    near(o[0], o0[0], 0.004 * C0[1].d, `${lab}: as far off as before`); near(o[1], o0[1], 0.004 * C0[1].d, `${lab}: as far off as before`);
    const m1 = await see(page, id); assert.ok(await greenAt(page, m1.x, m1.y, r) > 0.7 * g0, `${lab}: there`); await shot(page, `number-${lab}-3-made-again.png`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
