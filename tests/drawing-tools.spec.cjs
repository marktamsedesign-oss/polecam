/* (beta 7.11, Drawing tools) on the Drawing (the plan as its PDF prints it) every item of the plan can be selected, styled, turned, sized, moved; the poles too
   (on the plan only); a cable label's arrow tip slides along its span. Run: node --test tests/drawing-tools.spec.cjs (or python3 tests/run_all.py --only drawing-tools).
   The owner (beta 7.11): "allow to select all plan elements, includes tower/ODC/OLT, towerdetails, guying, grounding, NAP, closure, loop, span length, and almost
   every detail on the plan"; "Adjust Font size, Style and Color. Also rotate the elements, models and labels as necessary. This will be put as a toolbar that only
   appears when something is selected. Either it will edit all related or just the specific selections"; "Allow the user to move the poles model also on the map";
   "grounding, guying and other pole dependent attachments must be rotated only on that poles"; "foc labels: ... allow users to adjust arrow pointer along its
   cable only"; "Allow the user to hide or unhide the line pointing photo to its pole or pole details to its pole"; the closure's bubble callout as an option.
   The app (a phone, 412 x 915; a computer, 1280 x 900), a made-up As-Plan project of 8 poles (a proposed closure on one, a guying and a grounding on
   another, an existing pole, a NAP) with a made-up photo each and the made-up template on the phone:
   - a tap selects an item of any kind (a photo, a number, a pole's details, a cable label, a pole, a closure and its label, a guying, a grounding, a span
     length…), tapped again on the same spot the next one under it; the toolbar only while something is selected, with the tools the item can take; Select
     more (a phone) and Shift + click (a computer) select several, dragged together; Esc, ✕ and a tap on the empty plan clear it; screenshots of the toolbar;
   - font size, bold, colour reach the job (This one: job.style; All like it: job.styleKind) and the exported DXF; a symbol's size; turned ±15° and by its
     handle; a guying turns about its pole;
   - Existing ↔ Proposed changes the record itself (the plan and the BOQ follow); Undo puts the record back;
   - a pole dragged sets poleAt (the record's GPS stays) and the preview follows (job.poleAt, report.drawnAt); Back to automatic;
   - a cable label's arrow tip slides only along its span (pins[id].tip, 0..1);
   - Plan style › Lines to the pole and Closure labels reach the job (job.leaders, job.cloStyle), and one closure's Bubble from the toolbar (style.callout);
   - all of it kept with the project (another project, a reload), left out of what is shared with the team (shareMeta), counted in the placed-by-hand chip and
     put back by it, each change under Undo; with none of it, the job and the DXF as beta 7.10's. No page errors, no page sideways.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8'); // (the made-up template with the plan's blocks: the guying, grounding, NAP and closure symbols)
const SHOTS = process.env.SHOTS_DIR || null; // (screenshots of the toolbar, for a person to look at: SHOTS_DIR=folder)
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
const angD = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
/** The entities of a DXF by handle: { type, layer, text, h (40), rot (50), col (62), sx (41) }. */
function entsOf(text) {
  const R = text.split(/\r?\n/), out = new Map(); let cur = null;
  for (let i = 0; i + 1 < R.length; i += 2) { const c = +R[i].trim(), v = R[i + 1]; if (c === 0) { cur = { type: v.trim() }; continue; } if (!cur) continue;
    if (c === 5 && !cur.h0) { cur.h0 = v.trim(); out.set(cur.h0, cur); } else if (c === 8 && cur.layer == null) cur.layer = v; else if (c === 1 && cur.text == null) cur.text = v; else if (c === 40 && cur.h == null) cur.h = +v; else if (c === 50 && cur.rot == null) cur.rot = +v; else if (c === 62 && cur.col == null) cur.col = +v; else if (c === 41 && cur.sx == null) cur.sx = +v; else if (c === 7 && cur.style == null) cur.style = v.trim(); }
  return out;
}

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

const NAME = 'DEMO TOOLS TEST', OTHER = 'DEMO TOOLS OTHER', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, LA0 + (i > 4 ? (i - 4) * DD : 0), LO0 + Math.min(i, 4) * DD]);
/** what is on the made-up poles: a proposed closure (s2), a guying and a grounding (s3), an existing pole (s4), a proposed extension arm (s5), a NAP (s6),
 *  a 10-pin alley arm already on the pole (s8) */
const ON = { s2: { closure: true, closureId: 'CL-9001', boq: { owner: 'Electric', clamp: '8-10', clo: '24C', cloSt: 'New' } }, s3: { boq: { owner: 'Electric', clamp: '8-10', guy: 'Down guy', ground: 'Yes' } }, s4: { status: 'Existing' },
  s5: { boq: { owner: 'Electric', clamp: '8-10', arm: 'Extension arm 26"' } }, s6: { nap: true, napId: 'NAP-9001', boq: { owner: 'Electric', clamp: '8-10', napType: 'NAP 1x8', napSt: 'New' } }, s8: { details: [{ item: '10-pin alley arm', qty: 1 }] } };
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' }, ...(ON[id] || {}) }))
  .concat([{ id: 't1', project: NAME, element: 'Site', siteKind: 'Tower', poleId: 'DEMO SITE MIN9001', status: 'Existing', lat: LA0, lon: LO0 - 1.2 * DD, accuracy: 4.2, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }]); // (a made-up existing tower at the cable's start: no CEF plan asked for)
const LINKS = [['t1', 's1', 'F12'], ...POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12'])];
const PO = []; for (let i = 0; i < 3; i++) PO.push([`o${i + 1}`, `CC-${9201 + i}`, 7.1230, 125.6200 + i * DD]);
const RECS_O = PO.map(([id, poleId, lat, lon], i) => ({ ...RECS[0], ...{ closure: undefined }, id, project: OTHER, poleId, lat, lon, created: `2026-11-01T09:0${i}:00.000Z`, boq: { owner: 'Electric', clamp: '8-10' } }));
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * DD + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * DD + 0.00008], [LA0 + 3 * DD + 0.0006, LO0 + 4 * DD + 0.00008]]),
  way(3, 'DEMO RD', 'residential', [[7.1230 - 0.00008, 125.6194], [7.1230 - 0.00008, 125.6200 + 3 * DD]]),
  { type: 'node', id: 9, lat: LA0 + 0.0002, lon: LO0 + 2 * DD, tags: { name: 'MADE-UP CHAPEL', amenity: 'place_of_worship' } }] };
const TOOL_JOB = ['pins', 'poleAt', 'style', 'styleKind', 'leaders', 'cloStyle'];
/** The app with the made-up project (and the other one), the made-up template on the phone; each export's job (its tool fields), report and DXF kept. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 412, height: 915 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.startsWith('https://overpass-api.de/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); return r.abort(); });
  const page = await ctx.newPage(), errors = []; page.__touch = !o.desk; // (a phone: tapped with a finger, the touchscreen)
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, OTHER, USER, LINKS, LO, exp }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME, OTHER], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfMarks: 'both', dxfLabels: 'std', ...exp },
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true }, [OTHER]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LO, cables24: true } } }));
  }, { RECS: RECS.concat(RECS_O), NAME, OTHER, USER, LINKS, LO: PO.slice(1).map((q, i) => [PO[i][0], q[0], 'F12']), exp: o.exp || {} });
  await page.goto(base + 'index.html');
  await boot(page);
  await page.evaluate(async (ids) => { for (const id of ids) { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#7a8796'; g.fillRect(285, 60, 30, 700);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, POLES.map((p) => p[0]));
  await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-blocks.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED_SQ);
  await hook(page);
  return { ctx, page, errors };
}
/** The app started (or started again after a reload): its first screen, the toasts hidden. */
async function boot(page) {
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{display:none!important}' });
}
/** Each export's job (its tool fields and points), report and DXF kept (the builder run on the page, as the export runs it). */
async function hook(page) {
  await page.evaluate(async (KEYS) => {
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = []; // (__w: the export's plan made on the page, where this sees it)
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ job: JSON.parse(JSON.stringify(Object.fromEntries(KEYS.filter((k) => k in job).map((k) => [k, job[k]])))), pts: JSON.parse(JSON.stringify(job.pts.map((p) => ({ id: p.id, status: p.status, closureOld: p.closureOld, E: p.E, N: p.N, ...('cloSize' in p ? { cloSize: p.cloSize } : {}) })))), phPin: JSON.parse(JSON.stringify(job.phPin || {})), cabPin: JSON.parse(JSON.stringify(job.cabPin || {})), movable: JSON.parse(JSON.stringify(out.report.movable)), drawnAt: JSON.parse(JSON.stringify(out.report.drawnAt || {})), bub: JSON.parse(JSON.stringify(((out.report.closureLabels || {}).bubbles) || [])), text: out.text }); return out; };
  }, TOOL_JOB);
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const mvOf = (page) => page.evaluate(() => window.__polecam.drwMv());
const tbOf = (page) => page.evaluate(() => window.__polecam.drwTb());
const kept = (page) => page.evaluate((n) => { const m = JSON.parse(localStorage.getItem('polecam.settings')).meta[n]; return { mvPin: m.mvPin || {}, mvStyle: m.mvStyle || {}, mvKind: m.mvKind || {}, poleAt: m.poleAt || {}, lblPin: m.lblPin || {}, cabPin: m.cabPin || {}, numPin: m.numPin || {}, phPin: m.phPin || {} }; }, NAME);
const recOf = (page, id) => page.evaluate((x) => JSON.parse(JSON.stringify(window.__polecam.points.find((p) => p.id === x))), id);
/** The Drawing opened (Back first to the main screen), looking at the route (mpp metres a pixel), clear of the drawing's tools. */
async function drawing(page, mpp, fy) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(([la, lo, m, y]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width * 0.5, r.height * y); }, [LA0 + 0.0006, LO0 + 0.0012, mpp || 0.4, fy || 0.5]);
}
/** Until the plan is shown and not being made again (when: what else it must show). */
async function shown(page, when) {
  let s = null; for (let i = 0; i < 240; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return pl(page); } }
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
/** The plan made again after a change (n0: the preview shown before it). */
const again = (page, n0) => shown(page, (x) => x.n > n0);
/** Export › Plan drawing (each question answered as a user going on would): the job's tool fields, its points, the report's movable items, the DXF. */
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
const itemOf = async (page, id) => (await mvOf(page)).items.find((m) => m.id === id);
/** An item's place on the screen and what the plan says of it (can, tip, span…). */
const full = (page, id) => page.evaluate((x) => window.__polecam.drwMvItem(x), id);
/** A tap: a finger on a phone, a click on a computer. */
const tap = (page, x, y) => (page.__touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
/** The Drawing moved (not zoomed) so that an item is well on the screen, clear of the toolbar and the round tools; its place then. */
async function see(page, id) {
  let m = await itemOf(page, id); assert.ok(m, `${id} on the plan`);
  const R = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  if (m.x < R.l + 50 || m.x > R.l + R.w - 110 || m.y < R.t + 190 || m.y > R.t + R.h - 230) { await page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [m.box[0], m.box[1]]); await page.waitForTimeout(80); m = await itemOf(page, id); }
  return m;
}
/** Tapped (on its middle, or on its point's centre: pt) until it is the one selected (a tap again on the same spot: the next one under it); how many taps it took. */
async function select(page, id, pt) {
  const m = await see(page, id); const [x, y] = pt ? await page.evaluate((q) => window.__polecam.drwPt(q), pt) : [m.x, m.y];
  for (let k = 1; k <= 6; k++) { await tap(page, x, y); await page.waitForTimeout(360); const s = (await mvOf(page)).sels; if (s.length === 1 && s[0] === id) return k; } // ((beta 7.12) slower than a double-tap, which opens an item's text)
  throw new Error(`${id} not selected at ${x}, ${y}: ${JSON.stringify((await mvOf(page)).sels)}; under it: ${JSON.stringify(await page.evaluate(([X, Y]) => window.__polecam.drwCands(X, Y), [x, y]))}; it: ${JSON.stringify(await itemOf(page, id))}; tb: ${JSON.stringify((await tbOf(page)).rect)}; at: ${await page.evaluate(([X, Y]) => { const e = document.elementFromPoint(X, Y); return e ? `${e.tagName}#${e.id}.${e.className}` : 'none'; }, [x, y])} ask: ${await page.evaluate(() => `${document.getElementById('askTitle').textContent} | ${[...document.querySelectorAll('#askBox .row button')].map((b) => b.textContent).join(' / ')}`)}`);
}
const tbClick = (page, a, v) => page.evaluate(([a0, v0]) => { const g = document.querySelector(`#drawTb [data-a="${a0}"]`); const b = v0 != null ? g.querySelector(`button[data-v="${v0}"]`) : g; if (!b || b.hidden || b.closest('[hidden]')) throw new Error(`${a0} ${v0 || ''}: not on the toolbar`); b.click(); }, [a, v == null ? null : String(v)]);
const shown1 = (T, a) => { const t = T.tools.find((x) => x.a === a); return !!t && !t.hidden; };
/** An item dragged by (dx, dy) page pixels (the mouse; a finger moves the same way). */
async function drag(page, x, y, dx, dy) { await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(x + dx * k / 12, y + dy * k / 12); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(150); }
/** The Drawing looking at E, N (metres) in the middle of its canvas, sc pixels a metre (page). */
const centre = (page, E, N, mpp) => page.evaluate(([X, Y, m]) => { const d = window.devicePixelRatio || 1; window.__polecam.drwView({ cx: X, cy: Y, ...(m ? { sc: d / m } : {}) }); window.__polecam.drwRedraw(); }, [E, N, mpp || 0]);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** Another project, through Projects (as the owner does), and back to the main screen. */
async function openProject(page, name) {
  await closeAll(page); await page.evaluate(() => document.getElementById('projectBtn').click()); await page.waitForTimeout(800);
  await page.evaluate((nm) => document.querySelector(`#taskList .task[data-name="${nm}"]`).click(), name); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.S.project), name); await closeAll(page);
}

test('a phone: a tap selects an item of any kind (tapped again on the same spot: the next under it), the toolbar only while one is selected, with what it can take; Select more; Esc, ✕ and the empty plan clear it', async () => {
  const { ctx, page, errors } = await open();
  await drawing(page); await shown(page, (x) => x.count && x.count.pictures === 8);
  let mv = await mvOf(page); const kinds = new Set(mv.items.map((m) => m.kind));
  for (const k of ['photo', 'number', 'details', 'cable', 'pole', 'site', 'sitedetails', 'closure', 'closurelabel', 'guy', 'ground', 'arm', 'span', 'nap', 'loop', 'landmark', 'road']) assert.ok(kinds.has(k), `${k} on the plan: ${[...kinds]}`);
  assert.equal((await tbOf(page)).hidden, true, 'nothing selected: no toolbar');
  // each kind: selected (the toolbar with its tools), its outline
  const first = (k) => mv.items.find((m) => m.kind === k).id;
  const want = { number: 'num:s3', details: 'lbl:s3', closurelabel: 'clolbl:s2', closure: 'clo:s2', nap: 'nap:s6', span: mv.items.find((m) => m.kind === 'span' && m.id.includes('s3') && m.id.includes('s4')).id, cable: first('cable'), loop: first('loop'), sitedetails: first('sitedetails'), landmark: first('landmark'), road: first('road') };
  for (const [k, id] of Object.entries(want)) {
    const n = await select(page, id), T = await tbOf(page), f = await full(page, id);
    assert.equal(T.hidden, false, `${k}: the toolbar`); assert.ok(n <= 4, `${k}: ${n} taps`);
    assert.equal(shown1(T, 'h+'), !!f.canNow.text, `${k}: font size as it can`); assert.equal(shown1(T, 'color'), !!f.canNow.color, `${k}: colour as it can`); assert.equal(shown1(T, 'rot+'), !!f.canNow.rotate, `${k}: turn as it can`); assert.equal(shown1(T, 's+'), !!f.canNow.scale, `${k}: size as it can`);
    assert.equal(shown1(T, 'callout'), k === 'closurelabel', `${k}: Arrow / Bubble only for a closure label`);
    assert.match((await mvOf(page)).info, /·/, `${k}: said`);
  }
  // a pole: its centre tapped (its record said, as before) selects its symbol; the guying and the grounding on it next, tapped again on the same spot
  await see(page, 'pole:s3'); const p3 = await page.evaluate(() => window.__polecam.drwPt('s3')), got = [];
  for (let k = 0; k < 5; k++) { await tap(page, p3[0], p3[1]); await page.waitForTimeout(360); got.push((await mvOf(page)).sels.join(',')); } // ((beta 7.12) slower than a double-tap)
  assert.equal(got[0], 'pole:s3', `the pole first: ${got}`); assert.match((await mvOf(page)).info || '', /CC-9003|·/);
  assert.ok(got.some((x) => /^guy:s3/.test(x)) || got.some((x) => /^gnd:s3/.test(x)), `then what is under it: ${got}`);
  await select(page, 'pole:s4', 's4');
  let T = await tbOf(page); assert.ok(shown1(T, 'status') && shown1(T, 's+') && shown1(T, 'rot+'), 'a pole: Existing / Proposed, size, turn');
  assert.deepEqual(T.tools.find((x) => x.a === 'status').seg.map((b) => [b.v, b.pressed]), [['existing', 'true'], ['proposed', 'false']], 'the pole as its record says');
  await shot(page, 'tools-phone-pole.png');
  // the toolbar does not cover what is selected
  for (const id of ['lbl:s3', 'clolbl:s2']) { await select(page, id); T = await tbOf(page); const m = await itemOf(page, id); assert.ok(m.y + m.h / 2 < T.rect.top || m.y - m.h / 2 > T.rect.bottom, `${id} not under the toolbar (${T.at}): ${m.y} ${JSON.stringify(T.rect)}`); }
  await shot(page, 'tools-phone-label.png');
  // Select more: each tap adds (again: takes off)
  await select(page, 'num:s3'); await tbClick(page, 'more'); await page.waitForTimeout(150);
  const d3 = await itemOf(page, 'lbl:s3'); await tap(page, d3.x, d3.y); await page.waitForTimeout(200); const n5 = await see(page, 'num:s5'); await tap(page, n5.x, n5.y); await page.waitForTimeout(200);
  mv = await mvOf(page); assert.deepEqual(mv.sels, ['num:s3', 'lbl:s3', 'num:s5'], 'three selected'); assert.match(mv.info, /^3 selected: /);
  await tap(page, n5.x, n5.y); await page.waitForTimeout(200); assert.deepEqual((await mvOf(page)).sels, ['num:s3', 'lbl:s3'], 'tapped again: taken off');
  T = await tbOf(page); assert.equal(T.tools.find((x) => x.a === 'more').pressed, 'true');
  await shot(page, 'tools-phone-more.png');
  // dragged together: both kept, one Undo step
  await see(page, 'num:s3'); const a0 = await itemOf(page, 'num:s3'), b0 = await itemOf(page, 'lbl:s3'); await drag(page, a0.x, a0.y, 0, -50);
  mv = await mvOf(page); const a1 = mv.items.find((m) => m.id === 'num:s3'), b1 = mv.items.find((m) => m.id === 'lbl:s3');
  near(a1.y, a0.y - 50, 1.5, 'the number moved'); near(b1.y, b0.y - 50, 1.5, 'the details with it'); assert.ok(mv.pins.numPin.s3 && mv.pins.lblPin.s3, 'both kept'); assert.deepEqual(mv.undo.slice(-1), ['2 items moved']);
  // ✕, Esc, the empty plan: nothing selected
  await tbClick(page, 'done'); await page.waitForTimeout(150); assert.deepEqual((await mvOf(page)).sels, []); assert.equal((await tbOf(page)).hidden, true);
  await select(page, 'lbl:s3'); await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert.deepEqual((await mvOf(page)).sels, []); assert.equal((await tbOf(page)).hidden, true, 'Esc');
  await select(page, 'lbl:s3'); const cv = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return [r.left + 30, r.top + r.height * 0.75]; });
  await tap(page, cv[0], cv[1]); await page.waitForTimeout(200); assert.deepEqual((await mvOf(page)).sels, [], 'a tap on the empty plan'); assert.equal((await tbOf(page)).hidden, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a computer: font size, bold and colour reach the job and the DXF (This one: job.style; All like it: job.styleKind); a symbol\'s size; turned ±15° and by its handle; a guying turns about its pole; Shift + click', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  const e0 = await exportPlan(page); for (const k of TOOL_JOB) assert.ok(!(k in e0.job), `no ${k} yet`);
  await drawing(page); await shown(page);
  let mv = await mvOf(page); const cab = mv.items.find((m) => m.kind === 'cable').id, E0 = entsOf(e0.text), m0 = (id) => e0.movable.find((m) => m.id === id);
  // the cable label: larger twice, bold, blue (This one)
  await select(page, cab); let n0 = (await pl(page)).n;
  await tbClick(page, 'h+'); await tbClick(page, 'h+'); await tbClick(page, 'bold'); await tbClick(page, 'color'); await page.waitForTimeout(100);
  let T = await tbOf(page); assert.ok(T.pal && T.pal.length === 9, 'the colours'); await shot(page, 'tools-laptop-colours.png');
  await tbClick(page, 'pal', 5); await page.waitForTimeout(200);
  let K = await kept(page); assert.deepEqual(K.mvStyle[cab], { h: 1.3, bold: true, color: 5 }, 'kept: this one');
  T = await tbOf(page); assert.equal(T.tools.find((x) => x.a === 'bold').pressed, 'true'); assert.match(T.sw, /rgb\(0, 0, 255\)/);
  await again(page, n0); assert.deepEqual((await page.evaluate(() => window.__polecam.drwJobTools())).style[cab], { h: 1.3, bold: true, color: 5 }, 'the preview made with it');
  await shot(page, 'tools-laptop-styled.png');
  // All like it: every number larger
  await select(page, 'num:s5'); await tbClick(page, 'scope', 'kind'); await tbClick(page, 'h+'); await page.waitForTimeout(150);
  K = await kept(page); assert.deepEqual(K.mvKind.number, { h: 1.15 }, 'kept: all numbers'); assert.ok(!K.mvStyle['num:s5'], 'not this one\'s own');
  // a symbol's size: the closure larger
  await select(page, 'clo:s2'); assert.equal((await mvOf(page)).all, false, 'another item: This one again'); await tbClick(page, 's+'); await page.waitForTimeout(150);
  K = await kept(page); assert.deepEqual(K.mvStyle['clo:s2'], { scale: 1.25 });
  // a span length turned +15°, then back; the details turned by their handle
  const sp = mv.items.find((m) => m.kind === 'span' && m.id.includes('s3') && m.id.includes('s4')).id, spDeg = (await itemOf(page, sp)).deg;
  await select(page, sp); await tbClick(page, 'rot+'); await page.waitForTimeout(150); K = await kept(page); near(angD(K.mvPin[sp].rot, spDeg + 15), 0, 0.01, 'turned +15°');
  await tbClick(page, 'rot+'); await tbClick(page, 'rot0'); await page.waitForTimeout(150); assert.ok(!(await kept(page)).mvPin[sp], 'turned back');
  await select(page, 'lbl:s5'); let H = (await mvOf(page)).hdl.find((h) => h.kind === 'rot'); assert.ok(H, 'its turn handle'); const L5 = await itemOf(page, 'lbl:s5');
  const r5 = Math.hypot(H.x - L5.x, H.y - L5.y), a5 = Math.atan2(H.y - L5.y, H.x - L5.x); // (a quarter turn anticlockwise on the screen: the handle taken round its middle)
  await page.mouse.move(H.x, H.y); await page.mouse.down(); for (let k = 1; k <= 16; k++) { const a = a5 - (Math.PI / 2) * k / 16; await page.mouse.move(L5.x + r5 * Math.cos(a), L5.y + r5 * Math.sin(a)); await page.waitForTimeout(16); }
  const held = await mvOf(page); assert.ok(held.hDrag && held.hDrag.kind === 'rot', 'turning'); await page.mouse.up(); await page.waitForTimeout(200);
  K = await kept(page); near(angD(K.lblPin.s5[2], L5.deg + 90), 0, 3.01, 'the details turned a quarter, kept as 7.10 keeps them');
  // a guying turns about its pole: its middle stays as far from the pole
  const gid = mv.items.find((m) => m.kind === 'guy').id, g0 = await full(page, gid); assert.ok(g0.canNow.about, 'about its pole'); assert.equal(g0.canNow.move, false, 'not moved on its own');
  n0 = (await pl(page)).n; await select(page, gid); await tbClick(page, 'rot+'); await tbClick(page, 'rot+'); await tbClick(page, 'rot+'); await page.waitForTimeout(150);
  K = await kept(page); near(angD(K.mvPin[gid].rot, g0.box[4] + 45), 0, 0.01, 'turned 45°'); assert.ok(!K.mvPin[gid].at, 'no place of its own');
  await again(page, n0); const g1 = await full(page, gid), ab = g0.canNow.about;
  near(Math.hypot(g1.box[0] - ab[0], g1.box[1] - ab[1]), Math.hypot(g0.box[0] - ab[0], g0.box[1] - ab[1]), 0.3, 'as far from its pole'); near(angD(Math.atan2(g1.box[1] - ab[1], g1.box[0] - ab[0]) * 180 / Math.PI, Math.atan2(g0.box[1] - ab[1], g0.box[0] - ab[0]) * 180 / Math.PI + 45), 0, 1, 'swung 45° round it');
  // Shift + click: two
  const a = await itemOf(page, 'num:s6'), b = await itemOf(page, 'num:s7'); await page.mouse.click(a.x, a.y); await page.waitForTimeout(150); await page.keyboard.down('Shift'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Shift'); await page.waitForTimeout(150);
  assert.deepEqual((await mvOf(page)).sels, ['num:s6', 'num:s7']);
  // the export: the job and the DXF
  const e1 = await exportPlan(page), E1 = entsOf(e1.text), m1 = (id) => e1.movable.find((m) => m.id === id);
  assert.deepEqual(e1.job.style[cab], { h: 1.3, bold: true, color: 5 }); assert.deepEqual(e1.job.styleKind.number, { h: 1.15 }); assert.deepEqual(e1.job.style['clo:s2'], { scale: 1.25 });
  assert.ok(e1.job.pins[gid] && e1.job.pins[gid].rot != null, 'the guying turned');
  const tx0 = E0.get(m0(cab).handles[0]), tx1 = E1.get(m1(cab).handles[0]); near(tx1.h / tx0.h, 1.3, 0.02, 'the cable label 1.3 times as high'); assert.equal(tx1.col, 5, 'blue'); assert.equal(tx1.style, 'G-ESAA ARIAL B', 'bold: the Arial bold style'); assert.notEqual(tx0.style, 'G-ESAA ARIAL B');
  const nt0 = m0('num:s5').handles.map((h) => E0.get(h)).find((x) => x.type === 'TEXT'), nt1 = m1('num:s5').handles.map((h) => E1.get(h)).find((x) => x.type === 'TEXT'); near(nt1.h / nt0.h, 1.15, 0.02, 'every number larger');
  const ci0 = m0('clo:s2').handles.map((h) => E0.get(h)).find((x) => x.type === 'INSERT'), ci1 = m1('clo:s2').handles.map((h) => E1.get(h)).find((x) => x.type === 'INSERT'); if (ci0 && ci1) near((ci1.sx || 1) / (ci0.sx || 1), 1.25, 0.02, 'the closure larger');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Existing ↔ Proposed changes the record itself (the plan follows); Undo puts the record back', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  assert.equal((await recOf(page, 's4')).status, 'Existing');
  await select(page, 'pole:s4', 's4'); let n0 = (await pl(page)).n;
  await tbClick(page, 'status', 'proposed'); await page.waitForTimeout(600);
  assert.equal((await recOf(page, 's4')).status, 'Proposed', 'the record'); assert.deepEqual((await mvOf(page)).sels, ['pole:s4'], 'still selected');
  let T = await tbOf(page); assert.deepEqual(T.tools.find((x) => x.a === 'status').seg.map((b) => b.pressed), ['false', 'true']);
  await again(page, n0); assert.equal((await full(page, 'pole:s4')).canNow.status.now, 'proposed', 'the plan made with it');
  // a closure's label: its closure existing (its record's cloSt)
  await select(page, 'clolbl:s2'); n0 = (await pl(page)).n; await tbClick(page, 'status', 'existing'); await page.waitForTimeout(600);
  assert.equal((await recOf(page, 's2')).boq.cloSt, 'Existing', 'the closure existing'); await again(page, n0);
  // an arm: the proposed extension arm (the record's BOQ arm) on the pole already (what is on the pole), and the alley arm on s8 the other way
  await select(page, 'arm:s5'); assert.equal((await full(page, 'arm:s5')).canNow.status.field, 'armType'); n0 = (await pl(page)).n; await tbClick(page, 'status', 'existing'); await page.waitForTimeout(600);
  let r5 = await recOf(page, 's5'); assert.ok(!r5.boq.arm, 'no new arm in its BOQ'); assert.deepEqual(r5.details, [{ item: 'Extension arm 26"', qty: 1 }], 'on the pole'); await again(page, n0);
  assert.deepEqual((await full(page, 'arm:s5')).canNow.status, { now: 'existing', field: 'armText', point: 's5' }, 'the plan draws it existing');
  await select(page, 'arm:s8'); n0 = (await pl(page)).n; await tbClick(page, 'status', 'proposed'); await page.waitForTimeout(600);
  const r8 = await recOf(page, 's8'); assert.equal(r8.boq.arm, '10-pin alley arm'); assert.deepEqual(r8.details, []); await again(page, n0);
  const e1 = await exportPlan(page); assert.equal(e1.pts.find((p) => p.id === 's4').status, 'Proposed'); assert.equal(e1.pts.find((p) => p.id === 's2').closureOld, true);
  // Undo: the records back, one at a time
  await drawing(page); await shown(page);
  await page.click('#drawUndo'); await page.waitForTimeout(600); assert.deepEqual((await recOf(page, 's8')).details, [{ item: '10-pin alley arm', qty: 1 }]);
  await page.click('#drawUndo'); await page.waitForTimeout(600); r5 = await recOf(page, 's5'); assert.equal(r5.boq.arm, 'Extension arm 26"'); assert.ok(!(r5.details || []).length);
  await page.click('#drawUndo'); await page.waitForTimeout(600); assert.equal((await recOf(page, 's2')).boq.cloSt, 'New');
  await page.click('#drawUndo'); await page.waitForTimeout(600); assert.equal((await recOf(page, 's4')).status, 'Existing');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a pole dragged: poleAt (the record\'s GPS stays), shown where let go, the plan made with it (its spans follow); Back to automatic', async () => { // (s7: a pole with nothing on it but its labels)
  const { ctx, page, errors } = await open();
  const e0s7 = (await exportPlan(page)).pts.find((p) => p.id === 's7');
  await drawing(page); await shown(page);
  await see(page, 'pole:s7'); const r0 = await recOf(page, 's7'), p0 = await page.evaluate(() => window.__polecam.drwPt('s7'));
  // not selected: a drag pans the drawing, the pole stays
  const v0 = await page.evaluate(() => window.__polecam.drawView()); await drag(page, p0[0], p0[1], -40, 0);
  assert.deepEqual((await kept(page)).poleAt, {}, 'a pan'); assert.notEqual((await page.evaluate(() => window.__polecam.drawView())).cx, v0.cx);
  await page.evaluate((v) => { window.__polecam.drwView(v); window.__polecam.drwRedraw(); }, v0);
  // selected, then dragged: moved on the plan
  await select(page, 'pole:s7', 's7'); const n0 = (await pl(page)).n, sc = (await page.evaluate(() => window.__polecam.drwPh().sc)), q0 = await page.evaluate(() => window.__polecam.drwPt('s7')), d0 = (await full(page, 'pole:s7')).box;
  await drag(page, q0[0], q0[1], -40, 0); const K = await kept(page);
  assert.ok(K.poleAt.s7, 'kept'); near(K.poleAt.s7[0], d0[0] - 40 / sc, 0.15, 'where let go (E)'); near(K.poleAt.s7[1], d0[1], 0.15, 'N');
  const p1 = await page.evaluate(() => window.__polecam.drwPt('s7')); near(p1[0], q0[0] - 40, 1.5, 'drawn where let go'); near(p1[1], q0[1], 1.5, 'y');
  const L = (await mvOf(page)).lifted.map((x) => x.id); assert.ok(L.includes('pole:s7') && L.includes('lbl:s7'), `the pole and what is on it shown there until the plan made with it comes: ${L}`);
  const r1 = await recOf(page, 's7'); assert.equal(r1.lat, r0.lat); assert.equal(r1.lon, r0.lon); assert.equal(r1.updated, r0.updated, 'the record as it was');
  await again(page, n0); const e = await exportPlan(page);
  assert.deepEqual(e.job.poleAt, K.poleAt, 'the export\'s job'); near(e.drawnAt.s7[0], K.poleAt.s7[0], 0.01, 'drawn there'); near(e.drawnAt.s7[1], K.poleAt.s7[1], 0.01, 'N');
  assert.equal(e.pts.find((p) => p.id === 's7').E, e0s7.E, 'its record\'s place in the job as surveyed');
  // Back to automatic
  await drawing(page); await shown(page); await select(page, 'pole:s7', 's7'); await tbClick(page, 'auto'); await page.waitForTimeout(200);
  assert.deepEqual((await kept(page)).poleAt, {}, 'back');
  // a tower: its model moved (its pin, from its point as drawn), its point stays where it is surveyed
  await select(page, 'site:t1', 't1'); const t0 = await full(page, 'site:t1'), m0 = await itemOf(page, 'site:t1'), n1 = (await pl(page)).n;
  await drag(page, m0.x, m0.y, 0, 45); const Kt = await kept(page); assert.ok(!Kt.poleAt.t1, 'not its point'); assert.ok(Kt.mvPin['site:t1'] && Kt.mvPin['site:t1'].at, `its model's pin: ${JSON.stringify(Kt.mvPin)}`);
  near(Kt.mvPin['site:t1'].at[1], t0.box[1] - 45 / sc - t0.anchor[1], 0.15, 'its model where let go (N)');
  await again(page, n1); const t1 = await full(page, 'site:t1'); assert.equal(t1.how, 'by hand'); near(t1.box[1], t0.anchor[1] + Kt.mvPin['site:t1'].at[1], 0.3, 'drawn there');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a cable label\'s arrow tip slides only along its span (pins[id].tip, 0..1)', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  let mv = await mvOf(page); const cab = mv.items.find((m) => m.kind === 'cable'); let n0 = (await pl(page)).n;
  await drag(page, cab.x, cab.y, 0, 70); await again(page, n0); // (away from its cable: the plan's arrow)
  let f = await full(page, cab.id); assert.ok(f.tip && f.spanPts && f.spanPts.length >= 2, 'its arrow and its span');
  await select(page, cab.id); const H = (await mvOf(page)).hdl.find((h) => h.kind === 'tip'); assert.ok(H, 'the tip handle');
  // dragged across and along: it stays on the span
  n0 = (await pl(page)).n; await page.mouse.move(H.x, H.y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(H.x + 35 * k / 12, H.y + 60 * k / 12); await page.waitForTimeout(16); }
  const held = (await mvOf(page)).hDrag; assert.ok(held && held.kind === 'tip' && held.t >= 0 && held.t <= 1, JSON.stringify(held));
  const onSpan = (q) => { let best = Infinity; for (let k = 1; k < f.spanPts.length; k++) { const a = f.spanPts[k - 1], b = f.spanPts[k], vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / (vx * vx + vy * vy))); best = Math.min(best, Math.hypot(a[0] + vx * t - q[0], a[1] + vy * t - q[1])); } return best; };
  assert.ok(onSpan(held.at) < 0.01, 'held: on its span'); await page.mouse.up(); await page.waitForTimeout(200);
  const K = await kept(page); near(K.mvPin[cab.id].tip, held.t, 0.001, 'kept'); assert.ok(K.cabPin[cab.id.slice(4)], 'its place kept as 7.10 keeps it');
  await again(page, n0); f = await full(page, cab.id); assert.ok(onSpan(f.tip) < 0.3, `the plan's arrow points on its span: ${onSpan(f.tip)}`);
  const e = await exportPlan(page); near(e.job.pins[cab.id].tip, held.t, 0.001, 'the export'); assert.deepEqual(e.job.pins[cab.id].at, K.cabPin[cab.id.slice(4)].at, 'with its place in it');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Plan style: Lines to the pole off and Closure labels Bubble reach the job; one closure\'s Bubble from the toolbar', async () => {
  const { ctx, page, errors } = await open();
  await drawing(page); await shown(page); let n0 = (await pl(page)).n;
  await page.click('#drawSetBtn'); await page.waitForTimeout(700);
  await page.evaluate(() => { document.getElementById('stPole').open = true; document.getElementById('stCab').open = true; });
  await page.click('#stLead [data-k="photo"]'); await page.click('#stLead [data-k="details"]'); await page.click('#stCloStyle [data-v="bubble"]'); await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => { const P = window.__polecam.style.pl(); return { lead: P.lead, clo: P.clo, num: P.num.leader }; }), { lead: { photo: false, details: false }, clo: { style: 'bubble' }, num: true });
  assert.match(await page.evaluate(() => document.querySelector('#stPole .secsum').textContent), /no lines to the pole from the photos and pole details/);
  await closeAll(page); await drawing(page); await shown(page, (x) => x.n > n0);
  const e = await exportPlan(page); assert.deepEqual(e.job.leaders, { photo: false, details: false, number: true }); assert.equal(e.job.cloStyle, 'bubble');
  assert.equal(e.pts.find((p) => p.id === 's2').cloSize, '24C', 'the closure\'s size from its record'); assert.ok(e.pts.filter((p) => 'cloSize' in p).length === 1, 'only the closure');
  assert.ok(e.text.includes('PROPOSE 24C') && e.text.includes('HYBRID CLOSURE'), 'the bubble says it');
  // back to the defaults: none in the job; one closure in a bubble from the toolbar
  await drawing(page); await shown(page); await page.click('#drawSetBtn'); await page.waitForTimeout(700); await page.evaluate(() => { document.getElementById('stPole').open = true; document.getElementById('stCab').open = true; });
  await page.click('#stLead [data-k="photo"]'); await page.click('#stLead [data-k="details"]'); await page.click('#stCloStyle [data-v="arrow"]'); await page.waitForTimeout(200);
  await drawing(page); await shown(page); await select(page, 'clolbl:s2'); assert.equal(shown1(await tbOf(page), 's+'), false, 'an arrow label: no Size'); let n6 = (await pl(page)).n;
  await tbClick(page, 'callout', 'bubble'); await page.waitForTimeout(150);
  assert.deepEqual((await kept(page)).mvStyle['clolbl:s2'], { callout: 'bubble' });
  // the bubble's size (can.scale in bubble mode): Size on the toolbar resizes its circle and pointer
  await again(page, n6); assert.equal((await full(page, 'clolbl:s2')).canNow.scale, true, 'a bubble: its size'); assert.deepEqual((await mvOf(page)).sels, ['clolbl:s2'], 'still selected');
  assert.equal(shown1(await tbOf(page), 's+'), true, 'Size on the toolbar'); await tbClick(page, 's+'); await page.waitForTimeout(150);
  assert.deepEqual((await kept(page)).mvStyle['clolbl:s2'], { callout: 'bubble', scale: 1.25 });
  await shot(page, 'tools-phone-bubble.png');
  const e2 = await exportPlan(page); assert.ok(!('leaders' in e2.job) && !('cloStyle' in e2.job), 'the defaults: as 7.10'); assert.deepEqual(e2.job.style['clolbl:s2'], { callout: 'bubble', scale: 1.25 });
  const ring = (ex) => { const E = entsOf(ex.text), m = ex.movable.find((x) => x.id === 'clolbl:s2'); return m.handles.map((h) => E.get(h)).filter((x) => x && x.type === 'CIRCLE').map((x) => x.h); }; // (its circle in the DXF)
  assert.ok(e.bub.length === 1 && e2.bub.length === 1, 'a bubble each'); const r1 = ring(e), r2 = ring(e2); assert.ok(r1.length && r2.length, 'its circle'); near(r2[0] / r1[0], 1.25, 0.01, 'the bubble 1.25 times as large');
  assert.equal(e2.pts.find((p) => p.id === 's2').cloSize, '24C', 'its bubble says its size too');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('kept with the project (another project, a reload), left out of what the team gets; counted in the chip and put back by it; Undo for each change; none: the job as 7.10\'s', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  const e0 = await exportPlan(page);
  await drawing(page); await shown(page);
  const mv = await mvOf(page), cab = mv.items.find((m) => m.kind === 'cable').id;
  await select(page, cab); await tbClick(page, 'h+'); await select(page, 'clo:s2'); await tbClick(page, 's+'); await select(page, 'lbl:s5'); await tbClick(page, 'rot+');
  await select(page, 'pole:s7', 's7'); const p7 = await page.evaluate(() => window.__polecam.drwPt('s7')); await drag(page, p7[0], p7[1], 30, 0);
  const K = await kept(page); assert.ok(K.mvStyle[cab] && K.mvStyle['clo:s2'] && K.lblPin.s5 && K.poleAt.s7, JSON.stringify(K));
  await shown(page); assert.equal((await pl(page)).phAll, '4 items changed by hand · Back to automatic', 'styled, turned and moved: changed');
  assert.deepEqual((await mvOf(page)).undo, ['style h+', 'style s+', 'turned +15°', 'pole moved']);
  // shared: none of it
  const sh = await page.evaluate(() => window.__polecam.shareMeta()); for (const k of ['mvPin', 'mvStyle', 'mvKind', 'poleAt', 'lblPin', 'planGrid']) assert.ok(!(k in sh), `shareMeta: no ${k}`);
  // another project and back; a reload: the same
  await openProject(page, OTHER); await openProject(page, NAME); assert.deepEqual(await kept(page), K, 'after another project');
  await page.reload(); await boot(page); await hook(page); assert.deepEqual(await kept(page), K, 'after a reload');
  const e1 = await exportPlan(page); assert.deepEqual(e1.job.poleAt, K.poleAt); assert.deepEqual(e1.job.style, K.mvStyle);
  // Undo: one change at a time
  await drawing(page); await shown(page); await select(page, 'clo:s2'); await tbClick(page, 's+'); assert.equal((await kept(page)).mvStyle['clo:s2'].scale, 1.5);
  await page.click('#drawUndo'); await page.waitForTimeout(200); assert.equal((await kept(page)).mvStyle['clo:s2'].scale, 1.25, 'Undo: the last change');
  // the chip: all back to automatic, asked first
  await page.click('#drawPhAll'); await page.waitForTimeout(300); assert.match(await page.evaluate(() => document.getElementById('askTitle').textContent), /^Back to automatic: 4 items\?$/);
  await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  const K2 = await kept(page); for (const k of Object.keys(K2)) assert.deepEqual(K2[k], {}, `${k}: none left`);
  const e2 = await exportPlan(page); for (const k of TOOL_JOB) assert.ok(!(k in e2.job), `no ${k}`); assert.ok(!e2.pts.some((p) => 'cloSize' in p), 'no bubble: no closure size in the job'); assert.ok(e2.text === e0.text, 'the same DXF as before any change, byte for byte');
  assert.deepEqual(errors, []);
  await ctx.close();
});
