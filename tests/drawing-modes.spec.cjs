/* (beta 7.14, View / Edit; Changed by hand; Text editor) the owner, after beta 7.13: "add view and edit button on drawing. The user need to click edit mode before going
   to select and do some editing. This is so that the user cannot accidentally move or edit the element while dragging"; "under edit, the # if edit items changed by
   hand . If possible an icon with number of move items"; "add text editor (center line, left, or right , wrap text and so on) . Add also a font style selection".
   Run: node --test tests/drawing-modes.spec.cjs (or python3 tests/run_all.py --only drawing-modes). The app (a phone 393 x 852 and 360 x 740, a computer 1280 x 900),
   a made-up As-Plan project and the made-up template with the plan's blocks:
   - View | Edit: the Drawing opens in View every time (another visit); in View a drag (a finger, a mouse) pans and moves nothing (an element's place and its pins
     unchanged), a tap selects nothing (no toolbar) and says once a visit "Tap Edit to change the plan"; Undo and Redo stay (the buttons, Ctrl + Z); E and V; a
     right-click in View: one item, "Edit this" (Edit on, it selected); a double-click: no editor. In Edit the same drag moves it; leaving Edit drops the selection.
     The row of tools, the header and the bar under the plan neither wrap nor overflow at 360 and 393 px (View and Edit).
   - Changed by hand: in Edit a chip with a move icon, how many moved and how many changed in all, following moves, styles, a text, a turn (not a move), All like
     it, a note added, a record changed (Existing / Proposed), Undo; its list: each element, what was done, Show (selected, in view), Put back (one Undo step), a
     note's Remove, Put all back (asked first; the notes and the records stay; one Undo step).
   - The text editor's format: Align, Wrap and its width, Line spacing, Font (the template's first, then the app's), B / I / U, size, colour, This one / All like
     it; Save reaches pmeta (mvStyle / mvKind; a note's own fields) and the job the plan is made with (the preview's and the export's) in one Undo step; Automatic
     takes text and format back; with the plan builder that writes them (report.fonts), the plan's DXF has them (its texts right-aligned, in the font's style,
     underlined). Without, that part is said and left out.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { modeOf, editOn, viewOn, chgOf, putAllBack } = require('./drawing-edit.cjs');

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

const NAME = 'DEMO MODES TEST', T0 = '2026-11-01T08:00:00.000Z';
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
/** The app with the made-up project, the made-up template on the phone (o.desk: a computer; o.vp: the window's size). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.vp || (o.desk ? { width: 1280, height: 900 } : { width: 393, height: 852 }), isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.startsWith('https://overpass-api.de/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); return r.abort(); });
  const page = await ctx.newPage(), errors = []; page.__touch = !o.desk;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfMarks: 'both', dxfLabels: 'std' }, meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true } } }));
  }, { RECS, NAME, USER, LINKS });
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
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const mvOf = (page) => page.evaluate(() => window.__polecam.drwMv());
const tbOf = (page) => page.evaluate(() => window.__polecam.drwTb());
const ctxOf = (page) => page.evaluate(() => window.__polecam.drwCtx());
const txtOf = (page) => page.evaluate(() => window.__polecam.drwTxt());
const icoOf = (page) => page.evaluate(() => window.__polecam.drwIco());
const full = (page, id) => page.evaluate((x) => window.__polecam.drwMvItem(x), id);
const kept = (page) => page.evaluate((n) => { const m = JSON.parse(localStorage.getItem('polecam.settings')).meta[n]; const o = {}; for (const k of ['phPin', 'numPin', 'lblPin', 'cabPin', 'mvPin', 'mvStyle', 'mvKind', 'poleAt', 'mvText', 'mvOrder', 'drwNotes', 'mvHide', 'mvTurn', 'mvRec']) o[k] = m[k] || (k === 'drwNotes' || k === 'mvOrder' ? [] : {}); return o; }, NAME); // ((beta 7.16, Fixes) the Drawing's notes: drwNotes)
/** Where the Drawing looks: { cx, cy (metres), sc (canvas pixels a metre) }. */
const viewOf = (page) => page.evaluate(() => ({ ...window.__polecam.drw.view }));
const recOf = (page, id) => page.evaluate((x) => JSON.parse(JSON.stringify(window.__polecam.points.find((p) => p.id === x) || null)), id);
/** The Drawing, opened (Back first to the main screen), looking at the route (mpp metres a pixel). In View, as it opens. */
async function drawing(page, mpp) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(([la, lo, m]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width * 0.5, r.height * 0.45); }, [LA0 + 0.0006, LO0 + 0.0012, mpp || 0.4]);
}
/** Until the plan is shown and not being made again (when: what else it must show). Nothing turned on here: the Drawing as it opens. */
async function planShown(page, when) {
  let s = null; for (let i = 0; i < 240; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return pl(page); } }
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
const again = (page, n0) => planShown(page, (x) => x.n > n0);
const itemOf = async (page, id) => (await mvOf(page)).items.find((m) => m.id === id);
/** An item on the screen (the view moved to it when near an edge): where it is drawn, in page pixels. */
async function see(page, id) {
  let m = await itemOf(page, id); for (let k = 0; k < 150 && !m; k++) { await page.waitForTimeout(100); m = await itemOf(page, id); } assert.ok(m, `${id} on the plan`);
  const R = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  if (m.x < R.l + 60 || m.x > R.l + R.w - 110 || m.y < R.t + 190 || m.y > R.t + R.h - 230) { await page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [m.box[0], m.box[1]]); await page.waitForTimeout(80); m = await itemOf(page, id); }
  return m;
}
const tap = (page, x, y) => (page.__touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
/** Tapped (slower than a double-tap) until it is the one selected (Edit on). */
async function select(page, id) {
  const m = await see(page, id);
  for (let k = 1; k <= 6; k++) { await tap(page, m.x, m.y); await page.waitForTimeout(360); const s = (await mvOf(page)).sels; if (s.length === 1 && s[0] === id) return m; }
  throw new Error(`${id} not selected: ${JSON.stringify((await mvOf(page)).sels)}`);
}
const tbClick = (page, a, v) => page.evaluate(([a0, v0]) => { const g = document.querySelector(`#drawTb [data-a="${a0}"]`); const b = v0 != null ? g.querySelector(`button[data-v="${v0}"]`) : g; if (!b || b.hidden || b.closest('[hidden]')) throw new Error(`${a0} ${v0 || ''}: not on the toolbar`); b.click(); }, [a, v == null ? null : String(v)]);
/** A finger dragged (the phone's touch events, as a person's finger: the browser makes them pointer events of a touch). */
async function fingerDrag(page, x, y, dx, dy) {
  const c = await page.context().newCDPSession(page);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let k = 1; k <= 12; k++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * k / 12, y: y + dy * k / 12 }] }); await page.waitForTimeout(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await c.detach(); await page.waitForTimeout(150);
}
async function mouseDrag(page, x, y, dx, dy) { await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(x + dx * k / 12, y + dy * k / 12); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(150); }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** The editor's Save or Cancel (a person takes more than its first half second). */
async function txtSave(page, id) { await page.waitForTimeout(500); await page.click(`#${id || 'drawTxtYes'}`); await page.waitForTimeout(300); }
/** Each export's job (the fields the Drawing's tools fill), its report (movable, fonts) and DXF (the builder runs on the page, as the export runs it when wrapped). */
async function hook(page) {
  await page.evaluate(async () => {
    const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    if (!window.GeDxfTpl) await load('dxftpl.js'); const T = window.GeDxfTpl; if (T.__modes) return; T.__modes = true; const real = T.build; T.__w = true; window.__exp = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ job: JSON.parse(JSON.stringify({ style: job.style || null, styleKind: job.styleKind || null, notes: job.notes || null, text: job.text || null })), movable: JSON.parse(JSON.stringify(out.report.movable || [])), fonts: out.report.fonts ? JSON.parse(JSON.stringify(out.report.fonts)) : null, text: out.text }); return out; };
  });
}
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 320; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made'); return e[0];
}
/** A DXF's entities by handle: { type, g: { code: [values] } }. */
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0) { cur = { type: v.trim(), g: {} }; continue; } if (!cur) continue; (cur.g[c] = cur.g[c] || []).push(v); if (c === 5 && !cur.h) { cur.h = v.trim(); out.set(cur.h, cur); } }
  return out;
}
/** Whether the Drawing's bars fit: the row of tools, the header and the bar under the plan neither wrap (one line of controls) nor overflow (nothing cut, no sideways scroll). */
const barsFit = (page) => page.evaluate(() => {
  const out = {}, vis = (c) => !!(c.offsetWidth && c.offsetHeight), parts = { row: document.getElementById('drawIcons'), head: document.querySelector('#drawing > header'), bar: document.querySelector('#drawing .drwbar') };
  for (const [k, el] of Object.entries(parts)) {
    if (!el || el.hidden || !vis(el)) { out[k] = null; continue; } const r = el.getBoundingClientRect(), C = [...el.querySelectorAll('button, select, .drwmode')].filter((c) => vis(c) && !c.parentElement.closest('.drwmode')); // (the switch as one)
    const mids = new Set(C.map((c) => { const b = c.getBoundingClientRect(); return Math.round((b.top + b.bottom) / 2 / 12); })), cut = C.filter((c) => { const b = c.getBoundingClientRect(); return b.left < r.left - 0.5 || b.right > r.right + 0.5; }).map((c) => c.id || c.dataset.a || c.className);
    out[k] = { w: r.width, scroll: el.scrollWidth > el.clientWidth + 1, lines: mids.size, cut, n: C.length };
  }
  out.page = document.documentElement.scrollWidth > window.innerWidth; return out;
});

test('View | Edit on a phone: the Drawing opens in View; a finger\'s drag pans and moves nothing, a tap selects nothing (once a visit: "Tap Edit to change the plan"); Edit: the same drag moves it; View again drops the selection; another visit: View', async () => {
  const { ctx, page, errors } = await open({});
  await drawing(page); await planShown(page);
  let M = await modeOf(page); assert.equal(M.on, true, 'the switch'); assert.equal(M.mode, 'view', 'in View as it opens'); assert.deepEqual(M.pressed, { view: 'true', edit: 'false' }); assert.equal(M.frame, false, 'no Edit frame');
  assert.ok(M.view.w >= 44 && M.edit.w >= 44 && M.edit.h >= 44, `finger-sized: ${JSON.stringify(M)}`);
  let I = await icoOf(page), vis = (a) => { const t = I.tools.find((x) => x.a === a); return !!t && !t.hidden; };
  for (const a of ['addtext', 'addphoto', 'more']) assert.equal(vis(a), false, `View: ${a} put away`); for (const a of ['undo', 'redo']) assert.equal(vis(a), true, `View: ${a} stays`);
  const cv = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }); assert.ok(M.view.top >= cv.bottom - 1, 'a phone: under the plan, by the thumb');
  await shot(page, 'modes-phone-view.png');
  // a finger's drag on a pole's details: the plan pans, nothing moves (no pin, its place on the plan the same)
  const m0 = await see(page, 'lbl:s3'), f0 = await full(page, 'lbl:s3'), v0 = await viewOf(page);
  await fingerDrag(page, m0.x, m0.y, 60, -40);
  const v1 = await viewOf(page), f1 = await full(page, 'lbl:s3'), m1 = await itemOf(page, 'lbl:s3');
  const K0 = await kept(page); assert.deepEqual(K0.lblPin, {}, 'View: no pin'); assert.deepEqual(K0.mvPin, {});
  assert.deepEqual(f1.box, f0.box, 'View: its place on the plan the same'); assert.equal(f1.lifted, null, 'not lifted off the plan');
  near((v0.cx - v1.cx) * v0.sc, 60, 1.5, 'the plan panned with the finger (E)'); near((v0.cy - v1.cy) * v0.sc, 40, 1.5, 'N'); near(m1.x - m0.x, 60, 1.5, 'drawn where the pan puts it'); assert.equal((await mvOf(page)).drag, null);
  // a finger's drag on a photo frame: no photo moved
  const CR = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }), F = (await page.evaluate(() => window.__polecam.drwPh())).frames.find((x) => x.x > CR.l + 40 && x.x < CR.r - 90 && x.y > CR.t + 120 && x.y < CR.b - 160);
  assert.ok(F, 'a photo on the screen'); await fingerDrag(page, F.x, F.y, -30, 30); assert.deepEqual((await kept(page)).phPin, {}, 'View: no photo moved');
  // a tap on an element: nothing selected, no toolbar; said once (a moment), the Edit half nudged
  const m5 = await see(page, 'lbl:s5'); await page.touchscreen.tap(m5.x, m5.y); await page.waitForTimeout(250);
  assert.deepEqual((await mvOf(page)).sels, [], 'View: nothing selected'); assert.equal((await tbOf(page)).hidden, true, 'no toolbar'); assert.equal((await mvOf(page)).hdl.length, 0, 'no handles');
  M = await modeOf(page); assert.equal(M.said, 'Tap Edit to change the plan', 'said by the switch'); await shot(page, 'modes-phone-view-tap.png');
  const say = await page.evaluate(() => { const b = document.getElementById('drawModeSay').getBoundingClientRect(), e = document.getElementById('drawModeEdit').getBoundingClientRect(), I2 = document.getElementById('drawInfo'), H = document.getElementById('drawHint'), o = [I2, H].find((x) => !x.hidden && x.offsetHeight); return { b: [b.left, b.top, b.right, b.bottom], e: [e.left, e.top], over: o ? (() => { const r = o.getBoundingClientRect(); return b.bottom > r.top + 1 && b.top < r.bottom - 1; })() : false }; });
  assert.ok(say.b[3] <= say.e[1] && say.b[0] < say.e[0] + 60, `by the switch, above it: ${JSON.stringify(say)}`); assert.equal(say.over, false, 'not over the information line');
  await page.waitForTimeout(2800); assert.equal((await modeOf(page)).said, null, 'a moment');
  await page.touchscreen.tap(m5.x, m5.y); await page.waitForTimeout(250); assert.equal((await modeOf(page)).said, null, 'once a visit'); assert.deepEqual((await mvOf(page)).sels, []);
  // a point tapped in View still says what it is (looking, not changing): its record's line, nothing of the plan selected
  const p6 = await page.evaluate(() => window.__polecam.drwPt('s6')); await page.touchscreen.tap(p6[0], p6[1]); await page.waitForTimeout(250);
  assert.match((await mvOf(page)).info || '', /CC-9006/, 'the point said'); assert.deepEqual((await mvOf(page)).sels, [], 'its pole not selected'); assert.equal((await tbOf(page)).hidden, true);
  // Edit: the same drag moves it (kept), the frame, the tools back
  M = await editOn(page); assert.equal(M.frame, true, 'Edit: the frame round the plan'); I = await icoOf(page); for (const a of ['addtext', 'addphoto', 'more', 'undo', 'redo']) assert.ok(I.tools.find((x) => x.a === a && !x.hidden), `Edit: ${a}`);
  const e0 = await see(page, 'lbl:s3'), g0 = await full(page, 'lbl:s3'); await fingerDrag(page, e0.x, e0.y, 60, -40); await page.waitForTimeout(200);
  const K1 = await kept(page); assert.ok(Array.isArray(K1.lblPin.s3), `Edit: kept where it was let go ${JSON.stringify(K1.lblPin)}`); const g1 = await full(page, 'lbl:s3');
  near(g1.boxNow[0] - g0.box[0], 60 * (g0.box[2] / e0.w), 0.05 * g0.box[2], 'Edit: moved E'); near(g1.boxNow[1] - g0.box[1], 40 * (g0.box[2] / e0.w), 0.05 * g0.box[2], 'N');
  await shot(page, 'modes-phone-edit.png');
  // selected, then View: the selection dropped, no toolbar; Undo stays in View (the move taken back)
  await select(page, 'lbl:s5'); assert.equal((await tbOf(page)).hidden, false); await viewOn(page);
  assert.deepEqual((await mvOf(page)).sels, [], 'View: the selection dropped'); assert.equal((await tbOf(page)).hidden, true); assert.equal((await modeOf(page)).frame, false);
  assert.equal((await mvOf(page)).undoBtn.hidden, false, 'Undo in View'); await page.click('#drawUndo'); await page.waitForTimeout(300); assert.deepEqual((await kept(page)).lblPin, {}, 'Undo in View took the move back');
  await page.click('#drawRedo'); await page.waitForTimeout(300); assert.ok((await kept(page)).lblPin.s3, 'Redo in View');
  // Edit, then another visit: View again (and said again once)
  await editOn(page); await drawing(page); await planShown(page); M = await modeOf(page); assert.equal(M.mode, 'view', 'another visit: View again'); assert.equal(M.saidVisit, false, 'said again in this visit, once');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('View | Edit on a computer: a mouse drag pans, nothing moves; E and V (not while typing); Ctrl + Z in View; a right-click in View: "Edit this" (Edit on, it selected); a double-click in View: no editor; leaving Edit stops adding a text', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await planShown(page);
  let M = await modeOf(page); assert.equal(M.mode, 'view'); const cv = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { top: r.top }; }); assert.ok(M.view.bottom <= cv.top + 1, 'a computer: over the plan');
  const I = await icoOf(page); assert.match(I.say, /^View: nothing on the plan moves/, 'the row says so'); await shot(page, 'modes-laptop-view.png');
  // a mouse drag on a number: pans, nothing moves
  const n0 = await see(page, 'num:s3'), f0 = await full(page, 'num:s3'); await mouseDrag(page, n0.x, n0.y, 50, 30);
  assert.deepEqual((await kept(page)).numPin, {}, 'View: no pin'); assert.deepEqual((await full(page, 'num:s3')).box, f0.box, 'its place the same'); near((await itemOf(page, 'num:s3')).x - n0.x, 50, 1.5, 'panned');
  // a double-click on a label: no editor
  const l3 = await see(page, 'lbl:s3'); await page.mouse.dblclick(l3.x, l3.y); await page.waitForTimeout(300); assert.equal((await txtOf(page)).open, false, 'View: no editor'); assert.deepEqual((await mvOf(page)).sels, []);
  // E: Edit; V: View; the keys left alone while typing
  await page.keyboard.press('e'); await page.waitForTimeout(150); assert.equal((await modeOf(page)).mode, 'edit', 'E: Edit');
  await page.keyboard.press('v'); await page.waitForTimeout(150); assert.equal((await modeOf(page)).mode, 'view', 'V: View');
  const vz = (await viewOf(page)).sc; await page.keyboard.press('e'); await page.waitForTimeout(150); near((await viewOf(page)).sc, vz, 1e-9, 'E no longer zooms on the Drawing');
  await page.keyboard.press('+'); await page.waitForTimeout(150); assert.ok((await viewOf(page)).sc > vz * 1.2, '+ still zooms in');
  await select(page, 'lbl:s3'); await tbClick(page, 'text'); await page.waitForTimeout(600); assert.equal((await txtOf(page)).open, true);
  await page.focus('#drawTxtArea'); await page.keyboard.press('End'); await page.keyboard.type(' v'); assert.equal((await modeOf(page)).mode, 'edit', 'typing v: still Edit'); await txtSave(page, 'drawTxtNo');
  // Undo and Redo in View (the keys too): a style taken back and made again
  await tbClick(page, 'h+'); await page.waitForTimeout(150); assert.ok(((await kept(page)).mvStyle['lbl:s3'] || {}).h > 1); await page.keyboard.press('v'); await page.waitForTimeout(150);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300); assert.ok(!(await kept(page)).mvStyle['lbl:s3'], 'Ctrl + Z in View'); await page.keyboard.press('Control+y'); await page.waitForTimeout(300); assert.ok((await kept(page)).mvStyle['lbl:s3'], 'Ctrl + Y in View');
  // a right-click on an element in View: one item, Edit this: Edit on, it selected (what a tap there selects), its toolbar
  const l5 = await see(page, 'lbl:s5'); await page.mouse.click(l5.x, l5.y, { button: 'right' }); await page.waitForTimeout(250); let C = await ctxOf(page);
  assert.deepEqual(C.items.map((x) => [x.a, x.cap]), [['edit', 'Edit this']], 'View: a menu of one'); assert.equal(C.items[0].icon, '#ce-ptr', 'Edit\'s icon'); assert.equal((await modeOf(page)).mode, 'view', 'still View until chosen');
  await shot(page, 'modes-laptop-view-menu.png'); await page.mouse.click(C.items[0].x, C.items[0].y); await page.waitForTimeout(250);
  assert.equal((await modeOf(page)).mode, 'edit', 'Edit on'); assert.deepEqual((await mvOf(page)).sels, ['lbl:s5'], 'it selected'); assert.equal((await tbOf(page)).hidden, false, 'its toolbar'); assert.equal((await ctxOf(page)).open, false);
  // on the empty plan in View: Edit
  await viewOn(page); const fr = await page.evaluate(([la, lo]) => window.__polecam.drwLL(la, lo), [LA0 + 0.0009, LO0 + 0.0004]); assert.equal((await page.evaluate(([X, Y]) => window.__polecam.drwCands(X, Y, true), fr)).length, 0, 'nothing there');
  await page.mouse.click(fr[0], fr[1], { button: 'right' }); await page.waitForTimeout(250); C = await ctxOf(page); assert.deepEqual(C.items.map((x) => [x.a, x.cap]), [['edit', 'Edit']]);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert.equal((await ctxOf(page)).open, false);
  // adding a text, then View: adding stops; Edit pressed while adding: back to selecting
  await editOn(page); await page.click('#drawIcons [data-a="addtext"]'); await page.waitForTimeout(150); assert.equal((await icoOf(page)).adding, 'text');
  await page.click('#drawModeEdit'); await page.waitForTimeout(150); assert.equal((await icoOf(page)).adding, null, 'Edit again: back to selecting (Select\'s job)'); assert.equal((await modeOf(page)).mode, 'edit');
  await page.click('#drawIcons [data-a="addtext"]'); await page.waitForTimeout(150); await viewOn(page); assert.equal((await icoOf(page)).adding, null, 'View: adding stopped');
  // ✎ Edit route from View: an editing tool, Edit on first; the switch away while it is on
  await page.click('#drawEdit'); await page.waitForTimeout(600); assert.equal(await page.evaluate(() => window.__polecam.drwEd().on), true); M = await modeOf(page); assert.equal(M.on, false, 'Edit route: its own bar, the switch away'); assert.equal(M.mode, 'edit');
  await page.click('#drawEdit'); await page.waitForTimeout(500); M = await modeOf(page); assert.equal(M.on, true); assert.equal(M.mode, 'edit', 'after Edit route: Edit');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** The toolbar of what is selected: how many lines its tools take, which are shown. */
const tbLines = (page) => page.evaluate(() => { const tb = document.getElementById('drawTb'), B = [...tb.children].filter((c) => c.offsetWidth && c.offsetHeight && !c.classList.contains('drwtbsep') && c.id !== 'drawTbPal'), r = tb.getBoundingClientRect();
  return { lines: new Set(B.map((b) => Math.round(b.offsetTop / 8))).size, shown: B.map((b) => b.dataset.a), right: r.right, left: r.left }; });

test('the phone\'s bars at 360 and 393 px (and a laptop): the row of tools, the header and the bar under the plan neither wrap nor overflow, in View and in Edit (with something changed by hand); the toolbar of what is selected on one line (what does not fit under More); screenshots', async () => {
  for (const [sz, vp, desk] of [['360', { width: 360, height: 740 }, false], ['393', { width: 393, height: 852 }, false], ['laptop', { width: 1366, height: 768 }, true]]) {
    const { ctx, page, errors } = await open({ vp, desk });
    await drawing(page); await planShown(page);
    let B = await barsFit(page); for (const k of ['row', 'head', 'bar']) { assert.ok(B[k], `${sz} ${k}`); assert.equal(B[k].scroll, false, `${sz} View ${k}: no sideways scroll ${JSON.stringify(B[k])}`); assert.deepEqual(B[k].cut, [], `${sz} View ${k}: nothing cut`); } assert.equal(B.row.lines, 1, `${sz} View: the row on one line`); assert.equal(B.page, false);
    await shot(page, `modes-${sz}-view.png`);
    await editOn(page); await select(page, 'lbl:s3'); await tbClick(page, 'h+'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    B = await barsFit(page); for (const k of ['row', 'head', 'bar']) { assert.equal(B[k].scroll, false, `${sz} Edit ${k}: no sideways scroll ${JSON.stringify(B[k])}`); assert.deepEqual(B[k].cut, [], `${sz} Edit ${k}: nothing cut`); } assert.equal(B.row.lines, 1, `${sz} Edit: the row on one line ${JSON.stringify(B.row)}`); assert.equal(B.page, false);
    for (const id of ['lbl:s3', 'pole:s4']) { // (the toolbar of a label and of a pole: one line; More shows the rest)
      await select(page, id); let T = await tbLines(page); if (!desk) assert.equal(T.lines, 1, `${sz} ${id}: the toolbar on one line ${JSON.stringify(T)}`); assert.ok(T.left >= 0 && T.right <= vp.width, `${sz} ${id}: on the screen`); // (a laptop: as 7.11, it wraps when the plan is narrower than its tools)
      for (const a of ['color', 'done']) assert.ok(T.shown.includes(a), `${sz} ${id}: ${a}`); if (!desk) { assert.ok(T.shown.includes('xtra'), `${sz} ${id}: More`); await tbClick(page, 'xtra'); await page.waitForTimeout(150); const T2 = await tbLines(page); for (const a of ['rot+', 'rot-']) assert.ok(T2.shown.includes(a), `${sz} ${id}: More shows ${a}`); await tbClick(page, 'xtra'); }
      if (id === 'lbl:s3') await shot(page, `modes-${sz}-toolbar.png`); await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
    const C = await chgOf(page); assert.ok(C.shown && C.rect.right <= vp.width && C.rect.left >= 0, `${sz}: the chip on the screen ${JSON.stringify(C.rect)}`);
    const tools = await page.evaluate(() => { const r = [...document.querySelectorAll('.drwtools .round')].filter((b) => b.offsetWidth).map((b) => b.getBoundingClientRect()); return r.map((b) => [b.left, b.top, b.right, b.bottom]); });
    assert.ok(tools.every((t) => C.rect.right <= t[0] || C.rect.bottom <= t[1] || C.rect.top >= t[3]), `${sz}: the chip clear of the round tools`);
    await shot(page, `modes-${sz}-edit.png`);
    await page.click('#drawChg'); await page.waitForTimeout(250); const L = await page.evaluate(() => { const b = document.getElementById('drawChgBox').getBoundingClientRect(); return [b.left, b.right, b.top, b.bottom]; });
    assert.ok(L[0] >= 0 && L[1] <= vp.width && L[3] <= vp.height, `${sz}: its list on the screen ${L}`); await shot(page, `modes-${sz}-list.png`); await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Changed by hand: the chip\'s numbers follow moves, styles, a text, a turn, All like it, a note, a record\'s change, Undo; its list: Show, Put back (one Undo step), Remove, Put all back (asked; the notes and the records stay)', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await planShown(page);
  assert.equal((await chgOf(page)).shown, false, 'View: no chip'); await editOn(page);
  let C = await chgOf(page); assert.deepEqual([C.shown, C.moved, C.all, C.none], [true, 0, 0, true], 'Edit: the chip, nothing yet'); assert.match(C.label, /^Changed by hand on this plan: 0 moved, 0 changed in all/);
  const num = (await see(page, 'num:s3')); await mouseDrag(page, num.x, num.y, 40, 25);
  C = await chgOf(page); assert.deepEqual([C.moved, C.all, C.n], [1, 1, '1'], 'a number moved'); assert.match(C.text, /^1\s*moved · 1 changed$/);
  await select(page, 'lbl:s5'); await tbClick(page, 'h+'); await page.waitForTimeout(150); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [1, 2], 'a style: changed, not moved');
  await select(page, 'lbl:s6'); await tbClick(page, 'rot+'); await page.waitForTimeout(150); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [1, 3], 'turned where the plan put it: changed, not moved');
  assert.equal(C.rows.find((r) => r.id === 'lbl:s6').what, 'Turned');
  const d6 = await see(page, 'lbl:s6'); await mouseDrag(page, d6.x, d6.y, 30, -25); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 3], 'then dragged: moved too'); assert.equal(C.rows.find((r) => r.id === 'lbl:s6').what, 'Moved, Turned');
  await select(page, 'lbl:s4'); await tbClick(page, 'text'); await page.waitForTimeout(600); await page.fill('#drawTxtArea', `${(await txtOf(page)).text}\nDEMO EXTRA LINE`); await txtSave(page); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 4], 'a text edited (the plan only)');
  await select(page, 'lbl:s7'); await page.evaluate(() => document.querySelector('#drawTb [data-a="scope"] button[data-v="kind"]').click()); await tbClick(page, 'italic'); await page.waitForTimeout(150);
  C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 5], 'All like it: one row of its own'); assert.deepEqual(C.rows.slice(-1).map((r) => [r.id, r.name, r.what]), [['kind:details', 'All poles\' details', 'Size and style']]);
  await page.keyboard.press('Escape');
  // a note of yours: added
  await page.click('#drawIcons [data-a="addtext"]'); const fr = await page.evaluate(([la, lo]) => window.__polecam.drwLL(la, lo), [LA0 + 0.0009, LO0 + 0.0004]); await page.mouse.click(fr[0], fr[1]); await page.waitForTimeout(600); await page.fill('#drawTxtArea', 'DEMO NOTE'); await txtSave(page);
  C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 6], 'a text added'); assert.equal(C.rows.find((r) => r.kind === 'note').what, 'Added');
  // a record changed on the Drawing (Existing / Proposed): counted, listed "in the record", no Put back
  const n1 = (await pl(page)).n; await select(page, 'pole:s4'); await tbClick(page, 'status', 'proposed'); for (let i = 0; i < 40 && (await recOf(page, 's4')).status !== 'Proposed'; i++) await page.waitForTimeout(200);
  await again(page, n1); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 7], 'Existing / Proposed: changed (in the record)'); assert.equal(C.rows.find((r) => r.id === 'pole:s4').what, 'Existing / Proposed (in the record)');
  // the list
  await page.click('#drawChg'); await page.waitForTimeout(250); C = await chgOf(page); assert.equal(C.open, true); assert.equal(C.allBack, true, 'Put all back');
  const row = (id) => C.list.find((x) => x.id === id);
  assert.deepEqual(row('num:s3'), { id: 'num:s3', name: (await itemOf(page, 'num:s3')).name, what: 'Moved', show: true, back: 'Put back' }); assert.match(row('num:s3').name, /^Pole number \d+$/, 'by its name on the plan'); assert.equal(row('lbl:s5').what, 'Size and style'); assert.equal(row('lbl:s4').what, 'Text');
  assert.equal(row('pole:s4').back, null, 'in the record: no Put back'); assert.equal(C.list.find((x) => /^note:/.test(x.id)).back, 'Remove'); assert.equal(row('kind:details').back, 'Put back');
  await shot(page, 'modes-laptop-list.png');
  // Show: selected and brought into view
  await page.evaluate(() => window.__polecam.drwView({ cx: 0, cy: 0 })); await page.click('#drawChgBox [data-c="show"][data-id="lbl:s5"]'); await page.waitForTimeout(250);
  assert.deepEqual((await mvOf(page)).sels, ['lbl:s5'], 'Show: selected'); assert.equal((await chgOf(page)).open, false, 'the list put away');
  const it5 = await itemOf(page, 'lbl:s5'), R = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); near(it5.x, R[0], 2, 'in the middle of the view'); near(it5.y, R[1], 2, 'y');
  // Put back: one Undo step; the count follows; Undo brings it back
  const u0 = (await mvOf(page)).undo.length; await page.click('#drawChg'); await page.waitForTimeout(200); await page.click('#drawChgBox [data-c="back"][data-id="lbl:s5"]'); await page.waitForTimeout(250);
  assert.ok(!(await kept(page)).mvStyle['lbl:s5'], 'put back'); assert.equal((await mvOf(page)).undo.length, u0 + 1, 'one Undo step'); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 6]); assert.ok(C.open && !C.list.some((x) => x.id === 'lbl:s5'), 'the list as it is now');
  await page.click('#drawUndo'); await page.waitForTimeout(250); assert.ok((await kept(page)).mvStyle['lbl:s5'], 'Undo: back'); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 7], 'the chip follows Undo');
  await page.click('#drawRedo'); await page.waitForTimeout(250); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 6], 'and Redo');
  // a note: Remove (Undo brings it back)
  const nid = C.rows.find((r) => r.kind === 'note').id; if (!(await chgOf(page)).open) await page.click('#drawChg'); await page.waitForTimeout(200); await page.click(`#drawChgBox [data-c="back"][data-id="${nid}"]`); await page.waitForTimeout(250);
  assert.equal((await kept(page)).drwNotes.length, 0, 'Remove: the note taken off'); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 5]); await page.click('#drawUndo'); await page.waitForTimeout(250); assert.equal((await kept(page)).drwNotes.length, 1, 'Undo: the note back'); assert.deepEqual([(await chgOf(page)).moved, (await chgOf(page)).all], [2, 6]);
  // Put all back: asked (Cancel keeps all); then every plan-only change back, the note and the record's change stay; one Undo step
  if (!(await chgOf(page)).open) { await page.click('#drawChg'); await page.waitForTimeout(200); }
  const title = await putAllBack(page, false); assert.equal(title, 'Put all back: 4 elements?'); // (a number, two poles' details, the style of all of them) assert.match(await page.evaluate(() => document.getElementById('askText').textContent), /Your text or photo added stays \(Remove takes one off\)\. What the Drawing changed in a record stays/);
  C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 6], 'Cancel: kept');
  const u1 = (await mvOf(page)).undo.length; await putAllBack(page, true); const K = await kept(page);
  for (const k of ['numPin', 'lblPin', 'mvStyle', 'mvKind', 'mvText', 'mvTurn']) assert.deepEqual(K[k], {}, `${k}: none left`); assert.equal(K.drwNotes.length, 1, 'the note stays'); assert.ok(K.mvRec['pole:s4'], 'the record\'s change stays listed');
  assert.equal((await recOf(page, 's4')).status, 'Proposed', 'the record as it is'); assert.equal((await mvOf(page)).undo.length, u1 + 1, 'one Undo step');
  C = await chgOf(page); assert.deepEqual([C.moved, C.all], [0, 2], 'the note and the record\'s change'); assert.deepEqual(C.rows.map((r) => r.what).sort(), ['Added', 'Existing / Proposed (in the record)']);
  await page.click('#drawUndo'); await page.waitForTimeout(300); C = await chgOf(page); assert.deepEqual([C.moved, C.all], [2, 6], 'Undo: all of it back');
  // kept with the project, left out of what the team gets
  const sh = await page.evaluate(() => window.__polecam.shareMeta()); for (const k of ['mvTurn', 'mvRec', 'mvStyle', 'mvKind', 'drwNotes']) assert.ok(!(k in sh), `shareMeta: no ${k}`);
  // Undo of the record's change: its row goes
  await page.keyboard.press('Escape'); for (let k = 0; k < 8 && (await recOf(page, 's4')).status === 'Proposed'; k++) { await page.click('#drawUndo'); await page.waitForTimeout(500); }
  assert.equal((await recOf(page, 's4')).status, 'Existing', 'Undo: the record back'); assert.ok(!(await chgOf(page)).rows.some((r) => r.id === 'pole:s4'), 'its row gone with it');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the text editor\'s format: Align, Wrap, Line spacing, Font, B / I / U, size, colour, This one / All like it reach pmeta and the plan\'s job in one Undo step; a note\'s own; Automatic; with a builder that writes them, the DXF', async (t) => {
  const { ctx, page, errors } = await open({ desk: true });
  await hook(page); await drawing(page); await planShown(page); await editOn(page);
  // the bar as the item is drawn now; the fonts: the template's first (report.fonts), else the app's
  await select(page, 'lbl:s3'); await tbClick(page, 'text'); await page.waitForTimeout(600); let X = await txtOf(page);
  assert.ok(X.open && X.fmt && X.fmt.shown, 'the format bar'); assert.equal(X.fmt.scopeOk, true, 'This one / All like it'); assert.equal(X.fmt.scope, 'one');
  assert.deepEqual(Object.keys(X.fmt.btn).sort(), ['align:center', 'align:left', 'align:right', 'bold', 'color', 'h+', 'h-', 'italic', 'scope:kind', 'scope:one', 'spc+', 'spc-', 'underline', 'wrap'].sort(), 'its tools');
  const F = X.fmt.fonts, app = ['Arial', 'Arial Narrow', 'Times New Roman', 'Courier New', 'Romans', 'Simplex', 'ISOCP'];
  assert.equal(F[0].v, '', 'As the plan first'); const tpl = F.filter((f) => f.g === 'In the template'), own = F.filter((f) => f.g === 'The app\'s').map((f) => f.v);
  assert.ok(own.length >= 1 && own.every((v) => app.includes(v)), `the app's fonts ${JSON.stringify(own)}`); if (tpl.length) assert.ok(F.indexOf(tpl[0]) < F.findIndex((f) => f.g === 'The app\'s'), 'the template\'s first');
  assert.deepEqual([X.fmt.v.wrap, X.fmt.v.spacing, X.fmt.v.underline, X.fmt.v.h, X.fmt.v.color], [0, 1, false, 1, 0], 'as the plan draws it'); assert.equal(X.fmt.look.ws, 'pre', 'no wrap: its lines as written');
  await shot(page, 'modes-laptop-editor.png');
  // Align right, Wrap at 12 m, spacing 1.5, Times New Roman, underline, size +, red
  await page.click('#drawTxtFmt [data-f="align"][data-v="right"]'); await page.click('#drawTxtFmt [data-f="wrap"]'); await page.fill('#drawTxtWrapM', '12'); await page.click('#drawTxtFmt [data-f="spc+"]'); await page.click('#drawTxtFmt [data-f="spc+"]');
  await page.selectOption('#drawTxtFont', 'Times New Roman'); await page.click('#drawTxtFmt [data-f="underline"]'); await page.click('#drawTxtFmt [data-f="h+"]'); await page.click('#drawTxtFmt [data-f="color"]'); await page.click('#drawTxtPal [data-v="1"]');
  X = await txtOf(page); assert.deepEqual(X.fmt.v, { align: 'right', wrap: 12, spacing: 1.5, font: 'Times New Roman', underline: true, bold: false, italic: false, h: 1.15, color: 1 });
  assert.match(X.fmt.look.family, /Times New Roman/, 'the box: its font'); assert.equal(X.fmt.look.align, 'right'); assert.equal(X.fmt.look.deco, 'underline'); assert.equal(X.fmt.look.color, 'rgb(224, 49, 49)', 'red as the plan prints it readable');
  const WL = await page.evaluate(([L, W, h]) => (window.GeDxfTpl && window.GeDxfTpl.wrapLine ? L.flatMap((x) => window.GeDxfTpl.wrapLine(x, W, h, false)) : null), [X.text.split('\n'), 12, ((await full(page, 'lbl:s3')).fmt || {}).height * 1.15 || 0]);
  if (WL && (await full(page, 'lbl:s3')).fmt) { assert.deepEqual(X.fmt.wrapPrev, WL, 'the plan\'s own breaks shown under the text (GeDxfTpl.wrapLine)'); assert.ok(WL.length > X.text.split('\n').length, `wrapped at 12 m: ${JSON.stringify(WL)}`); assert.equal(X.fmt.look.ws, 'pre', 'the text as written'); }
  else { assert.equal(X.fmt.wrapPrev, null); assert.equal(X.fmt.look.ws, 'pre-wrap', 'wrapped in the box (as near as the browser can)'); }
  await shot(page, 'modes-laptop-editor-format.png');
  // an SHX font: no bold or italic (AutoCAD cannot)
  await page.selectOption('#drawTxtFont', 'Romans'); X = await txtOf(page); assert.deepEqual([X.fmt.btn.bold.disabled, X.fmt.btn.italic.disabled], [true, true], 'SHX: B and I greyed'); await page.selectOption('#drawTxtFont', 'Times New Roman');
  const u0 = (await mvOf(page)).undo.length, n0 = (await pl(page)).n; await txtSave(page);
  const want = { align: 'right', wrap: 12, spacing: 1.5, font: 'Times New Roman', underline: true, h: 1.15, color: 1 };
  assert.deepEqual((await kept(page)).mvStyle['lbl:s3'], want, 'pmeta: job.style of this one'); assert.deepEqual((await mvOf(page)).undo.slice(u0), ['format edited'], 'one Undo step');
  await again(page, n0); assert.deepEqual((await page.evaluate(() => window.__polecam.drwJobTools())).style['lbl:s3'], want, 'the preview made with it');
  // All like it: the format of every pole's details (its text this one's)
  await select(page, 'lbl:s5'); await tbClick(page, 'text'); await page.waitForTimeout(600); await page.click('#drawTxtFmt [data-f="scope"][data-v="kind"]'); await page.click('#drawTxtFmt [data-f="align"][data-v="left"]'); await page.click('#drawTxtFmt [data-f="bold"]');
  await page.fill('#drawTxtArea', 'DEMO KIND TEXT'); await txtSave(page); let K = await kept(page);
  assert.deepEqual(K.mvKind.details, { align: 'left', bold: true }, 'job.styleKind'); assert.deepEqual(K.mvText['lbl:s5'], ['DEMO KIND TEXT'], 'the text: this one'); assert.ok(!K.mvStyle['lbl:s5'], 'no style of its own'); assert.deepEqual((await mvOf(page)).undo.slice(-1), ['text and format edited']);
  // Automatic: this one's text and format back, one step
  await select(page, 'lbl:s3'); await tbClick(page, 'text'); await page.waitForTimeout(600); assert.equal((await txtOf(page)).auto, true, 'Automatic offered (its format)'); await txtSave(page, 'drawTxtAuto');
  assert.ok(!(await kept(page)).mvStyle['lbl:s3'], 'Automatic: its format back'); assert.deepEqual((await mvOf(page)).undo.slice(-1), ['format back to automatic']); await page.click('#drawUndo'); await page.waitForTimeout(250); assert.deepEqual((await kept(page)).mvStyle['lbl:s3'], want, 'Undo');
  // a text added with its format; a note's own fields; edited again
  await page.keyboard.press('Escape'); await page.click('#drawIcons [data-a="addtext"]'); const fr = await page.evaluate(([la, lo]) => window.__polecam.drwLL(la, lo), [LA0 + 0.0009, LO0 + 0.0004]); await page.mouse.click(fr[0], fr[1]); await page.waitForTimeout(600);
  X = await txtOf(page); assert.equal(X.title, 'Add text'); assert.equal(X.fmt.v.align, 'center', 'a note: centred as the plan draws one'); assert.equal(X.fmt.scopeOk, false, 'a note: its own format');
  await page.fill('#drawTxtArea', 'DEMO NOTE LINE ONE\nTWO'); await page.click('#drawTxtFmt [data-f="align"][data-v="left"]'); await page.selectOption('#drawTxtFont', 'Courier New'); await page.click('#drawTxtFmt [data-f="italic"]'); const n2 = (await pl(page)).n; await txtSave(page);
  let N = (await kept(page)).drwNotes; assert.equal(N.length, 1); assert.deepEqual([N[0].align, N[0].font, N[0].italic, 'wrap' in N[0], 'bold' in N[0]], ['left', 'Courier New', true, false, false], 'the note\'s own fields, only those set');
  await again(page, n2); const sel = `note:${N[0].id}`; await select(page, sel); await tbClick(page, 'text'); await page.waitForTimeout(600); X = await txtOf(page);
  assert.deepEqual([X.fmt.v.align, X.fmt.v.font, X.fmt.v.italic], ['left', 'Courier New', true], 'opened as kept'); await page.click('#drawTxtFmt [data-f="italic"]'); await page.click('#drawTxtFmt [data-f="spc+"]'); await txtSave(page);
  N = (await kept(page)).drwNotes; assert.deepEqual([N[0].italic, N[0].spacing], [undefined, 1.25], 'italic off: taken off the note; spacing kept'); assert.deepEqual((await mvOf(page)).undo.slice(-1), ['note edited']);
  // the export: the job the builder gets
  const e = await exportPlan(page); assert.deepEqual(e.job.style['lbl:s3'], want, 'job.style'); assert.deepEqual(e.job.styleKind.details, { align: 'left', bold: true }, 'job.styleKind');
  const jn = e.job.notes.find((n) => n.id === N[0].id); assert.deepEqual([jn.align, jn.font, jn.spacing, 'italic' in jn], ['left', 'Courier New', 1.25, false], 'job.notes: the note\'s format');
  // with a builder that writes the format (report.fonts): the DXF
  if (!e.fonts) { t.diagnostic('this plan builder does not say report.fonts yet (beta 7.14 §1): the DXF part is left out; merge the builder\'s branch to run it'); }
  else {
    const E = entsOf(e.text), m3 = e.movable.find((m) => m.id === 'lbl:s3'), T = m3.handles.map((h) => E.get(h)).filter((x) => x && (x.type === 'TEXT' || x.type === 'MTEXT')); assert.ok(T.length >= 2, `its texts ${m3.handles.length}`);
    assert.ok(m3.fmt && m3.fmt.align === 'right' && /times/i.test(m3.fmt.font), `report fmt as drawn: ${JSON.stringify(m3.fmt)}`);
    for (const x of T.filter((q) => q.type === 'TEXT')) { assert.equal(((x.g[72] || ['0'])[0]).trim(), '2', `TEXT right-aligned: ${x.g[1]}`); assert.match((x.g[7] || [''])[0], /TIMES/i, `in a Times style: ${x.g[7]}`); }
    assert.ok(T.some((x) => /^%%u/i.test((x.g[1] || [''])[0]) || /\\L/.test((x.g[1] || [''])[0])), 'underlined');
    const n0m = e.movable.find((m) => m.id === `note:${N[0].id}`), NT = n0m.handles.map((h) => E.get(h)).filter((x) => x && x.type === 'MTEXT'); assert.ok(NT.length, 'the note\'s MTEXT'); assert.match(NT[0].g[1].join(''), /cour|Courier/i, 'the note in Courier');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
