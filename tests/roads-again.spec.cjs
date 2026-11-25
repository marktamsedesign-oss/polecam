/* (beta 7.14, Roads again) The owner (beta 7.13): "the 'Get the roads again' button for a project's plan." Since beta 7.10 a plan keeps the roads it first
   got (a road pack on the phone, else OpenStreetMap), so its preview and every export are the same; they never change by themselves. Run:
   node --test tests/roads-again.spec.cjs (or python3 tests/run_all.py --only roads-again).
   The app (a computer, 1280 x 900; a small phone, 360 x 740), OpenStreetMap (Overpass) answered by made-up road lists: set A (3 roads and a chapel),
   then set B (2 roads: a street renamed and moved, an avenue moved; no chapel), or no answer, an error, an answer cut short (its remark), or offline.
   - Get the roads again, on the Drawing beside Regenerate plan preview, asks first (what is kept now and since when; the plan may change once; the
     changes made by hand stay); Cancel gets nothing. Yes: the busy screen while OpenStreetMap is asked (the button off meanwhile); the kept part got
     again for its own area (the same area) holds B; said ("Roads got again: 2 roads from OpenStreetMap (before: …)"); the preview made again with B,
     a photo placed by hand still where it was put; the export is the preview (its roads B, its display list). Undo puts A back (the parts as they
     were, the preview as before); Redo B.
   - No answer, an error, an answer cut short, offline: A kept as it was, why said, no Undo step, the preview not made again.
   - No roads kept yet (the first preview's quiet try failed; Regenerate within 3 minutes does not try again): Get the roads gets them and keeps
     them (said), the preview with them, no Undo step for them.
   - Busy: pressed while the preview is being made, the preview shown is made with B; a second press while it runs does nothing (no question,
     one download); another project opened while it runs: the roads of the project it was pressed for are got (said with its name), the other
     project's roads and plan untouched.
   - A small phone: the button beside Regenerate (its top, to its left, on the drawing), what Regenerate says left of both; not in Edit route,
     nor with the roads off (Plan style). Export's checks with the plan picked: "Roads kept with this project since …" with Get again ›: asked,
     got (B kept).
   - Two places 2 km apart (project C): each place's kept part asked for its own area; one not answered: neither replaced, said; both answered:
     both replaced (the same areas), the roads counted as the plan joins them.
   No page errors, no page sideways. Uses an isolated browser profile and a local HTTP server on a free port; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const SEED_SQ = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-square.dxf'), 'utf8');

const A = 'DEMO PLAN A', B = 'DEMO PLAN B', C = 'DEMO PLAN C', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, D = 0.00036; // project A: 12 poles about 40 m apart, 5 east then 7 north (an L); B: 5 poles 2 km away
const PA = []; for (let i = 0; i < 12; i++) PA.push([`a${i + 1}`, `CC-${9101 + i}`, LA0 + (i > 4 ? (i - 4) * D : 0), LO0 + Math.min(i, 4) * D]);
const PB = []; for (let i = 0; i < 5; i++) PB.push([`b${i + 1}`, `CC-${9301 + i}`, 7.1230, 125.6200 + i * D]);
const rec = (proj) => ([id, poleId, lat, lon], i) => ({ id, project: proj, element: 'Pole', poleId, poleType: 'Concrete', status: i % 5 === 2 ? 'Existing' : 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:${String(i).padStart(2, '0')}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } });
const PC = PA.concat(PB).map(([, poleId, lat, lon], i) => [`c${i + 1}`, poleId.replace('CC-9', 'CC-8'), lat, lon]); // C: A's poles and B's, two places 2 km apart
const RECS = PA.map(rec(A)).concat(PB.map(rec(B)), PC.map(rec(C)));
const linksOf = (P) => P.slice(1).map((p, i) => [P[i][0], p[0], 'F12']);
const LC = linksOf(PC.slice(0, 12)).concat(linksOf(PC.slice(12)));
// OpenStreetMap as Overpass answers it, made up. A: a street 9 m south of A's first poles, an avenue 9 m east of its others, a road along B, a chapel.
// B: the street renamed and 7 m further south, the avenue 6 m further east, no chapel (and no road at B's poles).
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const SET_A = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * D + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * D + 0.00008], [LA0 + 7 * D + 0.0006, LO0 + 4 * D + 0.00008]]),
  way(3, 'DEMO RD', 'residential', [[7.1230 - 0.00008, 125.6194], [7.1230 - 0.00008, 125.6200 + 5 * D]]),
  { type: 'node', id: 9, lat: LA0 + 0.0002, lon: LO0 + 2 * D, tags: { name: 'MADE-UP CHAPEL', amenity: 'place_of_worship' } }] };
const SET_B = { version: 0.6, elements: [way(11, 'MADE-UP STREET', 'residential', [[LA0 - 0.00014, LO0 - 0.0006], [LA0 - 0.00014, LO0 + 4 * D + 0.00014]]),
  way(12, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00014, LO0 + 4 * D + 0.00014], [LA0 + 7 * D + 0.0006, LO0 + 4 * D + 0.00014]])] };
const NAMES_A = ['MADE-UP ST', 'SAMPLE AVE', 'DEMO RD'], NAMES_B = ['MADE-UP STREET', 'SAMPLE AVE'];

let server, browser, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if (rel === '/org.json') { res.writeHead(404).end(); return; } // (the tests make their own company list, as run_all.py's server)
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

/** OpenStreetMap held: its answers wait until released. */
const hold = (net) => { const h = {}; h.p = new Promise((r) => { h.go = r; }); net.hold = h; return () => { net.hold = null; h.go(); }; };
/** A new phone (o.phone: 360 x 740, else a computer, 1280 x 900) with projects A and B, a made-up photo for every pole, the made-up template.
 *  Overpass answered as net.mode says ('A', 'B', 'down': no answer, 'error': 504, 'part': B cut short by Overpass), each query's area kept in
 *  net.calls (net.seq: the next answers' modes, one each, before net.mode); net.hold: the answers wait. The toasts said are kept (window.__toasts); the builder on the page for the exports: each export's job kept. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.phone ? { width: 360, height: 740 } : { width: 1280, height: 900 }, isMobile: !!o.phone, hasTouch: !!o.phone, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  const net = { mode: o.mode || 'A', hold: null, calls: [] };
  await ctx.route('**/*', async (r) => {
    const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://overpass-api.de/')) {
      const q = decodeURIComponent(String(r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')), m = /way\["highway"\]\(([^)]*)\)/.exec(q); net.calls.push(m ? m[1] : q.slice(0, 80));
      const h = net.hold; if (h) await h.p;
      const md = net.seq && net.seq.length ? net.seq.shift() : net.mode;
      if (md === 'down') return r.abort();
      if (md === 'error') return r.fulfill({ status: 504, contentType: 'text/plain', body: 'Gateway Timeout' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(md === 'part' ? { ...SET_B, remark: 'runtime error: Query timed out in "query" at line 1 after 91 seconds.' } : md === 'B' ? SET_B : SET_A) });
    }
    return r.abort();
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, A, B, C, USER, LA, LB, LC, open }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const meta = (l) => ({ mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: l, linksAt: '2026-11-01T08:00:00.000Z', cables24: true });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [A, B, C], project: open, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: true, dxfCef: false, planOut: 'files', dxfLabels: 'std' }, meta: { [A]: meta(LA), [B]: meta(LB), [C]: meta(LC) } }));
  }, { RECS, A, B, C, USER, LA: linksOf(PA), LB: linksOf(PB), LC, open: o.open || A });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{display:none!important}' }); // (the map's "no internet" note: not over the drawing; what is said is kept below)
  await page.evaluate(async () => {
    window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true });
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const Tp = window.GeDxfTpl, real = Tp.build; Tp.__w = true; window.__exp = [];
    Tp.build = function (seed, job) { const j = JSON.parse(JSON.stringify(job)), out = real.call(this, seed, job); window.__exp.push({ job: { phPin: j.phPin, roads: j.roads.map((r) => r.name), pois: j.pois.length, roadsNote: j.roadsNote }, out }); return out; };
    // (offline, as the phone says it: navigator.onLine)
    try { const g = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine').get; Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get() { return window.__offline ? false : g.call(this); } }); } catch (e) { /* as it is */ }
  });
  await page.evaluate(async (ids) => { for (const [id, k] of ids) { const c = document.createElement('canvas'); c.width = k % 4 === 3 ? 800 : 600; c.height = k % 4 === 3 ? 600 : 800; const g = c.getContext('2d'); g.fillStyle = '#d8e4ee'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#7a8796'; g.fillRect(c.width / 2 - 15, 60, 30, c.height - 100);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await window.__polecam.cef.keep(id, b); } }, PA.concat(PB, PC).map((p, k) => [p[0], k]));
  await page.evaluate(async (text) => { // the made-up template on the phone, as a loaded template file is kept
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-square.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED_SQ);
  return { ctx, page, errors, net };
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const ph = (page) => page.evaluate(() => window.__polecam.drwPh());
const kept = (page, n) => page.evaluate((nm) => window.__polecam.planKept(nm), n || null);
const undoList = (page) => page.evaluate(() => { const m = window.__polecam.drwMv(); return m ? { undo: m.undo, redo: m.redo } : null; });
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
/** Until fn (in the page) is true, at most s seconds. */
async function until(page, fn, arg, s) { for (let i = 0; i < (s || 30) * 5; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(200); } throw new Error(`not so after ${s || 30} s: ${fn}`); }
/** The Drawing of the project open, looking at A's poles (mpp metres a pixel). */
async function drawing(page, mpp) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(([la, lo, m]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width / 2, r.height / 2); }, [LA0 + 0.0008, LO0 + 2 * D, mpp || 0.5]);
}
/** Until a new preview (n: more made than) is shown and not being made again; then what it is: the plan, its photos, its display list's hash. */
async function shown(page, n, waitS) {
  let s = null; for (let i = 0; i < (waitS || 60) * 4; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && s.made > (n == null ? -1 : n)) break; s = null; }
  if (!s) throw new Error(`no plan shown: ${JSON.stringify(await pl(page))}`);
  await page.waitForTimeout(400);
  return { ...(await pl(page)), ph: await ph(page), hash: await page.evaluate(() => window.__polecam.drwPlanHash()) };
}
const made = async (page) => { const s = await pl(page); return s ? s.made : 0; };
/** The question asked (its title and words); then the button named label pressed. */
async function answer(page, label) {
  await until(page, () => !document.getElementById('askBox').hidden, null, 10);
  const q = await page.evaluate(() => ({ title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, buttons: [...document.querySelectorAll('#askBox .row button')].map((b) => b.textContent) }));
  await page.evaluate((l) => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === l).click(), label); await page.waitForTimeout(200);
  return q;
}
/** Get the roads again pressed on the Drawing and Yes; the toast it says (after n toasts said). */
async function getAgain(page, label) {
  const t0 = (await toasts(page)).length; await page.click('#drawRoads'); const q = await answer(page, label || 'Get the roads again');
  await until(page, (k) => window.__toasts.slice(k).some((t) => /^(DEMO PLAN [AB]: )?Roads (got|not got)/.test(t)), t0, 60);
  return { q, said: (await toasts(page)).slice(t0).find((t) => /^(DEMO PLAN [AB]: )?Roads (got|not got)/.test(t)) };
}
/** Drag a photo by (dx, dy) page pixels and wait for the preview with it placed by hand. */
async function dragPhoto(page, id, dx, dy) {
  const F = (await ph(page)).frames.find((f) => f.id === id); assert.ok(F, `${id}'s frame on the Drawing`);
  const n = await made(page); await page.mouse.move(F.x, F.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(F.x + dx * k / 10, F.y + dy * k / 10); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(300);
  assert.ok(Array.isArray((await ph(page)).pins[id]), `${id} kept`);
  for (let i = 0; i < 3; i++) { const s = await shown(page, n); if (s.ph.at[id] && s.ph.at[id].how === 'by hand') return s; }
  throw new Error(`${id}: not by hand`);
}
/** Export › Plan drawing (the AutoCAD files and their PDF; each question answered as a user going on would): its job and display list's hash. */
async function exportPlan(page) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B2 = [...document.querySelectorAll('#askBox .row button')]; (B2.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B2.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => { const x = window.__exp; if (x.length !== 1) return { n: x.length }; const { job, out } = x[0]; return { n: 1, job, hash: window.GeDxfPdf ? window.__polecam.planListHash(out.text, out.report) : null }; });
  assert.equal(e.n, 1, 'one plan made'); return e;
}
/** Another project, through Projects (as the owner does), and back to the main screen. */
async function openProject(page, name) {
  await closeAll(page); await page.evaluate(() => document.getElementById('projectBtn').click()); await page.waitForTimeout(800);
  await page.evaluate((nm) => document.querySelector(`#taskList .task[data-name="${nm}"]`).click(), name); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.S.project), name); await closeAll(page);
}
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const plainParts = (k) => k.roads.map(({ bb, nb, zone, src, at, roads, pois, names }) => ({ bb, nb, zone, src, at, roads, pois, names }));

test('Get the roads again: asked first; the kept part got again for its own area (the busy screen) holds B, the preview and the export use it, a photo placed by hand stays; Undo puts A back, Redo B', async () => {
  const { ctx, page, errors, net } = await open();
  await drawing(page); await shown(page);
  const k0 = await kept(page, A); assert.ok(k0.roads && k0.roads.length === 1 && k0.roads[0].src === 'osm', JSON.stringify(k0));
  assert.deepEqual(k0.roads[0].names, NAMES_A); assert.equal(k0.roads[0].pois, 1);
  const bbA = k0.roads[0].bb.map((v) => v.toFixed(6)).join(','), aCalls = () => net.calls.filter((c) => c === bbA).length; // (the export's vicinity map asks for its own area)
  assert.equal(aCalls(), 1, 'got once, by the first preview');
  const s1 = await dragPhoto(page, 'a2', 70, -50); // (a change made by hand: it stays)
  // the button: on the drawing, beside Regenerate plan preview (its top, to its left)
  const g = await page.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }; const x = document.getElementById('drawRoads');
    return { hidden: x.hidden, title: x.title, label: x.getAttribute('aria-label'), a: r('drawRoads'), g: r('drawRegen'), c: r('drawCanvas') }; });
  assert.equal(g.hidden, false); assert.equal(g.title, 'Get the roads again'); assert.match(g.label, /^Get the roads again: /);
  assert.ok(Math.abs(g.a.t - g.g.t) < 1 && g.a.r <= g.g.l - 8 && g.a.l >= g.c.l && g.a.t >= g.c.t, `beside Regenerate: ${JSON.stringify(g)}`);
  // asked first; Cancel gets nothing
  net.mode = 'B'; const c0 = net.calls.length;
  await page.click('#drawRoads'); const q = await answer(page, 'Cancel');
  assert.equal(q.title, 'Get the roads again?'); assert.deepEqual(q.buttons, ['Cancel', 'Get the roads again']);
  assert.match(q.text, /^The roads of this project's plan are got again: from a road pack on this phone, else from OpenStreetMap \(internet\)\./);
  assert.match(q.text, /\nKept now: 3 roads and 1 named place from OpenStreetMap, since \w+/);
  assert.match(q.text, /The plan may change once: poles on a road that moved follow it\. The changes made by hand stay\./);
  assert.match(q.text, /Undo \(↶\) on the Drawing puts the roads back as they were\.$/);
  await page.waitForTimeout(600); assert.equal(net.calls.length, c0, 'Cancel: nothing got'); assert.deepEqual((await kept(page, A)).roads, k0.roads);
  // Yes: the busy screen while OpenStreetMap is asked, the button off meanwhile
  const go = hold(net), n0 = await made(page), t0 = (await toasts(page)).length;
  await page.click('#drawRoads'); await answer(page, 'Get the roads again');
  await until(page, () => !document.getElementById('busy').hidden && /OpenStreetMap|roads again/.test(document.getElementById('busyText').textContent), null, 10);
  assert.match(await page.evaluate(() => document.getElementById('busyText').textContent), /^(Downloading the roads and places from OpenStreetMap…|Getting the roads again…)$/);
  assert.deepEqual(await page.evaluate(() => ({ d: document.getElementById('drawRoads').disabled, b: document.getElementById('drawRoads').getAttribute('aria-busy') })), { d: true, b: 'true' });
  go();
  await until(page, (k) => window.__toasts.slice(k).some((t) => /^Roads got again/.test(t)), t0);
  const said = (await toasts(page)).slice(t0).find((t) => /^Roads got again/.test(t));
  assert.equal(said, 'Roads got again: 2 roads from OpenStreetMap (before: 3 roads and 1 named place).');
  assert.equal(await page.evaluate(() => document.getElementById('busy').hidden), true, 'the busy screen gone');
  const k1 = await kept(page, A), [p0] = k0.roads, [p1] = k1.roads;
  assert.equal(k1.roads.length, 1); assert.deepEqual([p1.bb, p1.nb, p1.zone, p1.src], [p0.bb, p0.nb, p0.zone, 'osm'], 'the same area');
  assert.deepEqual(p1.names, NAMES_B); assert.equal(p1.pois, 0); assert.ok(p1.at > p0.at, 'got now'); assert.equal(k1.id, k0.id);
  assert.deepEqual(net.calls.slice(c0), [bbA], 'one download, for its own area');
  // the preview made again with B; the photo placed by hand where it was put
  const s2 = await shown(page, n0);
  assert.notEqual(s2.hash, s1.hash, 'the plan with the roads got again');
  assert.deepEqual(s2.ph.pins, s1.ph.pins); assert.equal(s2.ph.at.a2.how, 'by hand');
  assert.equal(s2.regen.disabled, false); assert.equal(await page.evaluate(() => document.getElementById('drawRoads').disabled), false);
  assert.deepEqual((await undoList(page)).undo.slice(-1), ['roads got again'], 'one Undo step');
  // the export is the preview: its roads B
  const e = await exportPlan(page);
  assert.deepEqual(e.job.roads, NAMES_B); assert.equal(e.job.pois, 0); assert.match(e.job.roadsNote, /^2 roads and 0 named places from OpenStreetMap \(Overpass\)$/);
  assert.equal(e.hash, s2.hash, 'the export drawn as the preview');
  // Undo: A back (the part as it was), the preview as before
  await drawing(page); await shown(page); let n = await made(page);
  await page.click('#drawUndo');
  await until(page, () => window.__polecam.planKept().then((k) => k.roads && k.roads[0].names[0] === 'MADE-UP ST'));
  assert.deepEqual(plainParts(await kept(page, A)), plainParts(k0), 'the roads as they were');
  const s3 = await shown(page, n); assert.equal(s3.hash, s1.hash, 'the plan as before');
  assert.ok((await toasts(page)).includes('Undo: the roads before are back'));
  assert.deepEqual((await undoList(page)).redo, ['roads got again']);
  // Redo: B again
  n = await made(page); await page.click('#drawRedo');
  await until(page, () => window.__polecam.planKept().then((k) => k.roads && k.roads[0].names[0] === 'MADE-UP STREET'));
  assert.deepEqual(plainParts(await kept(page, A)), plainParts(k1));
  const s4 = await shown(page, n); assert.equal(s4.hash, s2.hash, 'the plan with B again');
  assert.equal(aCalls(), 2, 'no other download of its roads');
  assert.equal(await sideways(page), false, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('not got: no answer, an error, an answer cut short, offline: the roads kept stay as they were, why said, no Undo step, the preview not made again', async () => {
  const { ctx, page, errors, net } = await open();
  await drawing(page); const s0 = await shown(page); const k0 = await kept(page, A);
  const WHY = [['down', 1, /^Roads not got again: OpenStreetMap did not answer, and no road pack on this phone covers the area\. The plan keeps the roads it has\.$/],
    ['error', 1, /^Roads not got again: OpenStreetMap did not answer, and no road pack on this phone covers the area\. The plan keeps the roads it has\.$/],
    ['part', 1, /^Roads not got again: OpenStreetMap was busy and sent only part of them \(try again later\)\. The plan keeps the roads it has\.$/],
    ['offline', 0, /^Roads not got again: this phone is offline, and no road pack on it covers the area\. The plan keeps the roads it has\.$/]];
  for (const [mode, nCalls, why] of WHY) {
    if (mode === 'offline') await page.evaluate(() => { window.__offline = true; }); else net.mode = mode;
    const c0 = net.calls.length, n = await made(page);
    const { said } = await getAgain(page);
    assert.match(said, why, mode); assert.equal(net.calls.length - c0, nCalls, `${mode}: ${nCalls} download tried`);
    assert.deepEqual(await kept(page, A), k0, `${mode}: the roads kept as they were`);
    await page.waitForTimeout(1000); assert.equal(await made(page), n, `${mode}: the preview not made again`);
    assert.equal(await page.evaluate(() => window.__polecam.drwPlanHash()), s0.hash, 'the plan as it was');
    assert.deepEqual(await page.evaluate(() => ({ busy: document.getElementById('busy').hidden, d: document.getElementById('drawRoads').disabled })), { busy: true, d: false });
    if (mode === 'offline') await page.evaluate(() => { window.__offline = false; });
  }
  assert.ok(!((await undoList(page)).undo || []).includes('roads got again'), 'no Undo step');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('no roads kept yet (the first quiet try failed; Regenerate within 3 minutes does not try again): Get the roads gets them and keeps them, the preview with them', async () => {
  const { ctx, page, errors, net } = await open({ mode: 'down' });
  await drawing(page); const s0 = await shown(page);
  assert.equal((await kept(page, A)).roads, null, 'nothing kept'); assert.equal(net.calls.length, 1, 'tried once, quietly');
  let n = await made(page); await page.click('#drawRegen'); await shown(page, n);
  assert.equal(net.calls.length, 1, 'Regenerate within 3 minutes: not tried again');
  net.mode = 'A'; n = await made(page);
  const { q, said } = await getAgain(page, 'Get the roads');
  assert.equal(q.title, 'Get the roads?'); assert.deepEqual(q.buttons, ['Cancel', 'Get the roads']);
  assert.match(q.text, /^This project's plan has no roads kept yet: they are got now, from a road pack on this phone, else from OpenStreetMap \(internet\), and kept with the project\./);
  assert.equal(said, 'Roads got: 3 roads and 1 named place from OpenStreetMap, kept with this project.');
  const k = await kept(page, A); assert.ok(k.roads && k.roads.length === 1 && k.roads[0].src === 'osm', JSON.stringify(k)); assert.deepEqual(k.roads[0].names, NAMES_A);
  const bbA = k.roads[0].bb.map((v) => v.toFixed(6)).join(','); assert.deepEqual(net.calls, [bbA, bbA], 'the quiet try, then got');
  const s1 = await shown(page, n); assert.notEqual(s1.hash, s0.hash, 'the plan with its roads');
  assert.ok(!((await undoList(page)).undo || []).includes('roads got again'), 'no Undo step (no roads before)');
  // the export uses them (no download)
  const e = await exportPlan(page); assert.deepEqual(e.job.roads, NAMES_A); assert.equal(e.hash, s1.hash); assert.equal(net.calls.filter((c) => c === bbA).length, 2, 'the export: the roads kept');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('busy: pressed while the preview is being made (the preview shown is B\'s); a second press while it runs does nothing; another project opened while it runs: the roads of the project it was pressed for got and said with its name, the other untouched', async () => {
  const { ctx, page, errors, net } = await open();
  await drawing(page); const sA = await shown(page); const kA = await kept(page, A);
  await openProject(page, B); await drawing(page); const sB = await shown(page); const kB = await kept(page, B);
  await openProject(page, A); let n = await made(page); await drawing(page); await shown(page, n);
  // Regenerate, then at once Get the roads again, held; a second press meanwhile
  net.mode = 'B'; let go = hold(net); const t0 = (await toasts(page)).length, c0 = net.calls.length;
  const busy0 = await page.evaluate(() => { document.getElementById('drawRegen').click(); const b = window.__polecam.drwPlan().busy; document.getElementById('drawRoads').click(); return b; });
  assert.equal(busy0, true, 'pressed while the preview is being made');
  await answer(page, 'Get the roads again');
  await until(page, () => !document.getElementById('busy').hidden, null, 10);
  await page.evaluate(() => { const b = document.getElementById('drawRoads'); b.disabled = false; b.click(); }); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.getElementById('askBox').hidden), true, 'a second press: no question');
  go();
  await until(page, (k) => window.__toasts.slice(k).some((t) => /^Roads got again/.test(t)), t0);
  assert.equal(net.calls.length - c0, 1, 'one download');
  const s1 = await shown(page); assert.deepEqual((await kept(page, A)).roads[0].names, NAMES_B);
  n = await made(page); await page.click('#drawRegen'); const s2 = await shown(page, n);
  assert.equal(s1.hash, s2.hash, 'the preview shown made with the roads got again'); assert.notEqual(s1.hash, sA.hash);
  // another project opened while it runs (A's roads got again: set A once more)
  net.mode = 'A'; go = hold(net); const t1 = (await toasts(page)).length;
  await page.click('#drawRoads'); await answer(page, 'Get the roads again'); await until(page, () => !document.getElementById('busy').hidden, null, 10);
  await openProject(page, B);
  go();
  await until(page, (k) => window.__toasts.slice(k).some((t) => /^DEMO PLAN A: Roads got again/.test(t)), t1);
  assert.equal((await toasts(page)).slice(t1).find((t) => /Roads got again/.test(t)), 'DEMO PLAN A: Roads got again: 3 roads and 1 named place from OpenStreetMap (before: 2 roads).');
  assert.deepEqual((await kept(page, A)).roads[0].names, NAMES_A, 'A\'s roads got');
  assert.deepEqual(await kept(page, B), kB, 'B\'s roads untouched');
  await drawing(page); const sB2 = await shown(page); assert.equal(sB2.hash, sB.hash, 'B\'s plan as it was');
  assert.ok(!((await undoList(page)).undo || []).includes('roads got again'), 'B: no Undo step');
  await openProject(page, A); n = await made(page); await drawing(page); const sA2 = await shown(page, n);
  assert.deepEqual((await undoList(page)).undo.filter((x) => x === 'roads got again').length, 2, 'A: its two Undo steps');
  assert.equal(sA2.hash, sA.hash, 'A\'s plan with set A again');
  assert.deepEqual((await kept(page, A)).roads.map((x) => [x.bb, x.nb]), kA.roads.map((x) => [x.bb, x.nb]), 'the same area');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a small phone (360 x 740): beside Regenerate plan preview, what it says left of both; not in Edit route nor with the roads off; Export\'s checks: the roads kept, Get again ›', async () => {
  const { ctx, page, errors, net } = await open({ phone: true });
  await drawing(page, 1); await shown(page);
  const R = () => page.evaluate(() => { const r = (id) => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, on: e.getClientRects().length > 0 }; };
    return { a: r('drawRoads'), g: r('drawRegen'), w: r('drawWrap'), say: r('drawRegenT'), icons: r('drawIcons'), vw: window.innerWidth }; });
  let g = await R();
  assert.ok(g.a.on && Math.abs(g.a.t - g.g.t) < 1 && g.a.r <= g.g.l - 8 && g.a.l >= 8 && g.a.t >= g.w.t && g.a.b <= g.icons.t, `beside it, on the drawing: ${JSON.stringify(g)}`);
  assert.ok(g.a.r - g.a.l >= 44, 'a finger\'s width');
  // what Regenerate says: left of both
  await page.evaluate(() => document.getElementById('drawRegen').click()); await page.waitForTimeout(80); g = await R();
  assert.ok(g.say.on && g.say.r <= g.a.l - 4 && g.say.l >= 0, `said left of both: ${JSON.stringify(g)}`);
  await shown(page);
  // not in Edit route
  await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(600);
  assert.equal((await R()).a.on, false, 'not in Edit route');
  await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(600); await shown(page);
  assert.equal((await R()).a.on, true);
  // the roads off (Plan style): not there; on: there
  for (const on of [false, true]) {
    await page.evaluate((v) => { const c = document.getElementById('dxfRoads'); c.checked = v; c.dispatchEvent(new Event('change', { bubbles: true })); }, on);
    const n = await made(page); await page.click('#drawRegen'); await shown(page, n);
    assert.equal((await R()).a.on, on, `roads ${on ? 'on' : 'off'}`);
  }
  assert.equal(await sideways(page), false, 'no page sideways');
  // Export's checks (the plan picked): the roads kept, Get again ›
  await closeAll(page); await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(1200);
  const chk = () => page.evaluate(() => [...document.querySelectorAll('#xChecks .xchk')].map((x) => [x.querySelector('span').textContent, (x.querySelector('button') || {}).textContent || '']));
  let L = (await chk()).find(([t]) => /^Roads kept/.test(t));
  assert.ok(L, JSON.stringify(await chk())); assert.match(L[0], /^Roads kept with this project since .+ \(OpenStreetMap\)$/); assert.equal(L[1], 'Get again ›');
  net.mode = 'B'; const t0 = (await toasts(page)).length;
  await page.evaluate(() => [...document.querySelectorAll('#xChecks .xchk')].find((x) => /^Roads kept/.test(x.querySelector('span').textContent)).querySelector('button').click());
  const q = await answer(page, 'Get the roads again'); assert.equal(q.title, 'Get the roads again?');
  await until(page, (k) => window.__toasts.slice(k).some((t) => /^Roads got again/.test(t)), t0);
  assert.deepEqual((await kept(page, A)).roads[0].names, NAMES_B);
  L = (await chk()).find(([t]) => /^Roads kept/.test(t)); assert.ok(L, 'still said');
  assert.equal(await sideways(page), false, 'no page sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('two places 2 km apart: every kept part got again, kept only when every one came back; one not answered: none kept, said', async () => {
  const { ctx, page, errors, net } = await open({ open: C });
  await drawing(page); await shown(page);
  const k0 = await kept(page, C); assert.equal(k0.roads.length, 2, `a part for each place: ${JSON.stringify(k0.roads.map((x) => x.bb))}`);
  // the first place answered, the second not: neither part replaced
  net.seq = ['B', 'down']; let c0 = net.calls.length, n = await made(page);
  const r1 = await getAgain(page);
  assert.equal(r1.said, 'Roads not got again: OpenStreetMap did not answer, and no road pack on this phone covers the area. The plan keeps the roads it has.');
  assert.deepEqual(net.calls.slice(c0), k0.roads.map((x) => x.bb.map((v) => v.toFixed(6)).join(',')), 'each place asked, for its own area');
  assert.deepEqual((await kept(page, C)).roads, k0.roads, 'neither part replaced');
  await page.waitForTimeout(800); assert.equal(await made(page), n, 'the preview not made again');
  // both answered: both kept, each for its own area; the plan made again with them
  net.seq = ['B', 'B']; c0 = net.calls.length; n = await made(page);
  const r2 = await getAgain(page);
  assert.equal(r2.said, 'Roads got again: 2 roads from OpenStreetMap (before: 3 roads and 1 named place).', 'the roads counted as the plan joins them');
  assert.equal(net.calls.length - c0, 2);
  const k1 = await kept(page, C);
  assert.deepEqual(k1.roads.map((x) => [x.bb, x.nb, x.zone]), k0.roads.map((x) => [x.bb, x.nb, x.zone]), 'the same areas');
  assert.ok(k1.roads.every((x) => x.src === 'osm' && x.names.join() === NAMES_B.join()), JSON.stringify(k1.roads));
  const s1 = await shown(page, n); assert.ok(s1.on);
  assert.deepEqual((await undoList(page)).undo, ['roads got again']);
  assert.deepEqual(errors, []);
  await ctx.close();
});
