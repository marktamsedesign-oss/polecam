/* (stage 11, existing cable) The owner (27 Nov): "on the AsPlan or asbuilt, can you allow a drawing of cable route without a requirement of poles snapping, just a
   fiber drawn in parallel only to its road that is being taken. allow right or left side route ... or do a traverse. If the user has the pole it will attach ...
   it can left hanging with a info text where it will go. It can also be terminated to the ODF on the site it will home to ... this will be use for reference only
   during implementation. in terms of Grid, ask the user if it wants to include these existing fiber drawing on the plan. default it will not be part but let
   the user choose. This existing cable will be treated also as the new cable, a closure in between, a new pole to add in between ..." Run:
   node --test tests/existing-cable.spec.cjs (or python3 tests/run_all.py --only existing-cable).
   The app (a phone, 360 x 740, touch; a computer, 1280 x 900), a made-up project (6 poles along a made-up street, a tower and its ODF), OpenStreetMap (Overpass)
   answered by made-up roads (the street, an avenue north from its east end, a lane), the made-up plan template.
   - Route › ＋ Existing (a phone): its bar fits (no page sideways, its buttons a thumb's size); each tap along the road follows the road at 4 m from its centre
     line on the left of the way it runs (the street east: its north side; the avenue north: its west side); a tap near a pole is on the pole; ⇄ Cross here:
     the right side from there (a traverse); ↶ takes back the last tap; ⋯: underground (dotted), snap off; ✓ Finish: its ends (its end hanging, "TO " to
     complete, the default; its start at the ODF); Save: kept with the project, drawn dashed blue with its note; reference only: the route, its spans and
     cables, the survey quantities (BOQ) the same as before it.
   - A cable tapped (a computer): its card; Edit: a tap dragged is drawn along the road again, Right: every stretch on the right, ✕ leaves the changes out;
     Its ends: the note changed; Delete asks, then it goes (kept as deleted for Share). The list of cables (Route › Cables) lists it.
   - Add Pin near the cable: a pole and a closure placed by hand go on its line, the record remembers it (xcOn); a new cable (RUN) starts from the pole.
   - The plan: the first preview of a project with one asks once (No: not on the plan, not asked again); Plan style › Cables › On the plan: the export's
     job has it (job.xcab), the DXF draws it with its note, the sheets cover it (a sheet more), its PMI's cable rows the same; Not on the plan: the export
     byte for byte the one made before the cable was drawn.
   - Share: the whole project carries it; only the changes: it goes only when changed since; an update merges each cable whole (the newer wins, a deletion
     carries over); a backup restores it; the KMZ has its folder "Existing cables (reference)", its route folder as before.
   - (beta 7.19, existing cable) The owner (27 Nov): "allow user to cross the road by a traversing its route clicked and allow the app to detect which side it
     click first. allow also right click or ctrl+z to undo the clicked or action." The phone: the cable's side from the first tap (the street's south side: the
     right; Left / Right shows the side it is on), a tap on the other side (on pole 3) crosses the road there by itself, a tap on the same side goes on along it,
     a crossing made by hand (⇄) kept by the taps after it. The computer: a tap dragged across the street in Edit crosses it there; Ctrl+Z, Ctrl+Y and a
     right-click on the map undo / redo it; Ctrl+Z in the end's note is the note's own; drawing one, a right-click and Ctrl+Z take back the last tap,
     Ctrl+Shift+Z puts it back; the browser's menu kept off only while drawing.
   No page errors. Every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-kit.dxf'), 'utf8');
const A = 'DEMO EXCABLE A', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, D = 0.00036, MLAT = 110574, MLON = 110400 * Math.cos(LA0 * Math.PI / 180); // (metres a degree here)
const PA = []; for (let i = 0; i < 6; i++) PA.push([`a${i + 1}`, `CC-${9101 + i}`, LA0 + 0.00005, LO0 + i * D]); // 6 poles 5.5 m north of the street's centre line, 40 m apart
const rec = ([id, poleId, lat, lon], i) => ({ id, project: A, element: 'Pole', poleId, poleType: 'Concrete', status: i % 3 === 1 ? 'Existing' : 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:${String(i).padStart(2, '0')}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } });
const RECS = PA.map(rec).concat([
  { id: 's1', project: A, element: 'Site', siteKind: 'Tower', poleId: 'DEMO TOWER', status: 'Existing', lat: LA0 + 0.0006, lon: LO0 - 0.0004, created: T0, updated: T0, takenAt: T0, by: USER.name },
  { id: 'o1', project: A, element: 'ODF', poleId: 'ODF-9001', status: 'Existing', lat: LA0 + 0.00062, lon: LO0 - 0.00036, created: T0, updated: T0, takenAt: T0, by: USER.name },
]);
const LINKS = PA.slice(1).map((p, i) => [PA[i][0], p[0], 'F12']);
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const AVE = LO0 + 5 * D + 0.0012; // (the avenue's centre line, north from the street's east end)
const ROADS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0, LO0 - 0.0010], [LA0, AVE]]), way(2, 'SAMPLE AVE', 'tertiary', [[LA0, AVE], [LA0 + 0.0065, AVE]]), way(3, 'DEMO LANE', 'residential', [[LA0, LO0 - 0.0010], [LA0 + 0.0030, LO0 - 0.0010]])] };

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

/** A phone (o.phone: 360 x 740, touch) or a computer (1280 x 900) with the made-up project and template; Overpass answered with the made-up roads (net.calls
    counted); the builder on the page for the exports: each export's job (its xcab and PMI values), its DXF and report kept (window.__exp). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.phone ? { width: 360, height: 740 } : { width: 1280, height: 900 }, isMobile: !!o.phone, hasTouch: !!o.phone, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  const net = { calls: 0 };
  await ctx.route('**/*', async (r) => {
    const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://overpass-api.de/')) { net.calls++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROADS) }); }
    return r.abort();
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, A, USER, LINKS }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [A], project: A, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfLabels: 'std' }, meta: { [A]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, linksAt: '2026-11-01T08:00:00.000Z', cables24: true } } }));
  }, { RECS, A, USER, LINKS });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{visibility:hidden!important}' }); // (the map's "no internet" note: not over the bar; what is said is kept below)
  await page.evaluate(async (text) => {
    window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true });
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-kit.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
    if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const Tp = window.GeDxfTpl, real = Tp.build; Tp.__w = true; window.__exp = [];
    Tp.build = function (seed, job) { const j = JSON.parse(JSON.stringify({ xcab: job.xcab || null, values: job.values })), out = real.call(this, seed, job); window.__exp.push({ job: j, text: out.text, rep: { xcab: out.report.xcab || 0, sheets: out.report.sheets.slice() } }); return out; };
  }, SEED);
  return { ctx, page, errors, net };
}
const xc = (page, fn, arg) => page.evaluate(([f, a]) => window.__polecam.xc[f](...(a || [])), [fn, arg]);
/** Until the cable being drawn has its roads (its stretches worked out). */
async function idle(page) { for (let i = 0; i < 150; i++) { const n = await xc(page, 'now'); if (!n || !n.busy) return n; await page.waitForTimeout(200); } throw new Error('the roads never came'); }
/** A finger (or the mouse) on the map at lat, lon; then the roads waited for. */
async function tapAt(page, la, lo, phone) { const [x, y] = await xc(page, 'px', [la, lo]); if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(250); return idle(page); }
const press = async (page, sel, phone) => { if (phone) await page.tap(sel); else await page.click(sel); await page.waitForTimeout(250); };
/** The question asked (its title, words and buttons); then the button named label pressed. */
async function answer(page, label) {
  for (let i = 0; i < 80 && await page.evaluate(() => document.getElementById('askBox').hidden); i++) await page.waitForTimeout(200);
  const q = await page.evaluate(() => ({ title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, buttons: [...document.querySelectorAll('#askBox .row button')].map((b) => b.textContent) }));
  await page.evaluate((l) => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === l).click(), label); await page.waitForTimeout(250);
  return q;
}
/** A line's points as metres from the street's centre line (north +) and along it (east +), from the first pole's longitude. */
const mOf = (P) => P.map(([la, lo]) => [(lo - LO0) * MLON, (la - LA0) * MLAT]);
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
/** Draw a cable programmatically (as taps; snap as set), finish, its end's note, its start at the ODF when odf; saved: the cable. */
async function drawOne(page, taps, o) {
  o = o || {}; await xc(page, 'start'); await page.waitForTimeout(200);
  for (const [la, lo] of taps) { await xc(page, 'tap', [la, lo]); await idle(page); }
  await page.evaluate(() => document.getElementById('xcFinishBtn').click()); await page.waitForTimeout(200);
  await page.fill('#xcBar .xc-in[data-w="end"]', o.end || 'TO DEMO SITE 2');
  if (o.odf) { await page.evaluate(() => document.querySelector('#xcBar [data-xc="eat"][data-w="start"][data-v="odf"]').click()); await page.waitForTimeout(150); }
  await page.evaluate(() => document.getElementById('xcSaveBtn').click()); await page.waitForTimeout(300);
  const L = await xc(page, 'list'); return L[L.length - 1];
}
/** Export › Plan drawing (each question answered as a user going on would); its build kept. */
async function exportPlan(page) {
  for (let i = 0; i < 8 && await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length); i++) { await page.goBack(); await page.waitForTimeout(500); }
  await page.evaluate(() => { window.__exp = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B2 = [...document.querySelectorAll('#askBox .row button')]; (B2.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B2.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp.slice()); assert.equal(e.length, 1, 'one plan made'); await page.evaluate(() => { document.getElementById('resultBox').hidden = true; });
  for (let i = 0; i < 8 && await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length); i++) { await page.goBack(); await page.waitForTimeout(500); }
  return e[0];
}

test('a phone: Route › ＋ Existing; the taps follow the road 4 m from its centre line on the side of the first tap (the right); a tap on the other side (on pole 3) crosses the road by itself; ⇄ Cross here; ↶; ⋯ underground, snap off; ✓ Finish: its ends; saved, drawn, reference only (the route and its quantities as before)', async () => {
  const { ctx, page, errors } = await open({ phone: true });
  const c0 = await xc(page, 'counts');
  await xc(page, 'look', [LA0 + 0.0001, LO0 + 0.0011, 18]); await page.waitForTimeout(400);
  await press(page, '#routeBtn', true); await page.waitForTimeout(400);
  // ＋ Existing in the Route bar, beside New cable and Cables, the bar on the screen
  const rb = await page.evaluate(() => { const b = document.getElementById('rtXcNew'), r = b.getBoundingClientRect(), bar = document.getElementById('rtBar').getBoundingClientRect(); return { text: b.textContent, label: b.getAttribute('aria-label'), r: [r.left, r.top, r.right, r.bottom], bar: [bar.left, bar.right], h: r.height }; });
  assert.equal(rb.text, '＋ Existing'); assert.match(rb.label, /^Draw an existing cable along the road/); assert.ok(rb.r[0] >= rb.bar[0] && rb.r[2] <= rb.bar[1] && rb.h >= 38, JSON.stringify(rb));
  await press(page, '#rtXcNew', true);
  let bar = await page.evaluate(() => { const b = document.getElementById('xcBar'), r = b.getBoundingClientRect(); return { on: !b.hidden, h: r.height, w: r.width, live: document.getElementById('xcLive').textContent, draw: document.body.classList.contains('xcdraw'), route: document.body.classList.contains('routing'),
    btns: [...b.querySelectorAll('button')].map((x) => { const q = x.getBoundingClientRect(); return [x.textContent.trim(), Math.round(q.width), Math.round(q.height), q.right <= window.innerWidth]; }) }; });
  assert.ok(bar.on && bar.draw && !bar.route, 'the bar in place of Route');
  assert.match(bar.live, /Tap along the road where the cable runs/);
  assert.ok(bar.h < 740 * 0.25, `a small bar: ${bar.h}`); for (const [t, w, h, inside] of bar.btns) assert.ok(w >= 38 && h >= 34 && inside, `a thumb's button: ${t} ${w}x${h}`);
  assert.deepEqual(bar.btns.map((x) => x[0]), ['Left', 'Right', '⇄ Cross here', '⋯', '↶', '✕', '✓ Finish']);
  // (beta 7.19, existing cable) the side from the taps: two taps on the street's south side (no Left / Right chosen: Left, as always, before them): the
  // cable's side found from the first, the right of the way east, 4 m from the centre line
  const sideOn = () => page.evaluate(() => [...document.querySelectorAll('#xcBar [data-xc="side"]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent).join());
  let n = await tapAt(page, LA0 - 0.00004, LO0 + 0.5 * D, true); assert.equal(n.c.taps.length, 1); assert.ok(!n.c.taps[0].pole, 'not near a pole: where tapped'); assert.equal(await sideOn(), 'Left');
  n = await tapAt(page, LA0 - 0.00004, LO0 + 1.4 * D, true); assert.equal(n.c.side, 'R', 'the first tap\'s side');
  assert.equal(await sideOn(), 'Right'); assert.match(await page.evaluate(() => document.getElementById('xcLive').textContent), /^Existing cable · 2 taps · \d+ m$/);
  let P = mOf(await xc(page, 'll', [n.c.id])); assert.ok(P.length >= 2 && P.every(([, y]) => Math.abs(y + 4) < 0.35), `on the street's south side: ${JSON.stringify(P)}`);
  // a tap near pole 3, on the other side of the street: on the pole, the road crossed there by itself (⇄ shows it); a tap on along the north side: no crossing
  n = await tapAt(page, LA0 + 0.00004, LO0 + 2 * D + 0.00003, true); assert.equal(n.c.taps[2].pole, 'a3', 'near pole 3: on it'); assert.equal(n.c.taps[2].x, 1, 'the road crossed at pole 3 by itself');
  assert.equal(await page.evaluate(() => document.querySelector('#xcBar [data-xc="cross"]').getAttribute('aria-pressed')), 'true');
  n = await tapAt(page, LA0 + 0.00004, LO0 + 3.5 * D, true); assert.equal(n.c.taps.length, 4); assert.equal(n.c.taps[3].x, undefined, 'the same side: on along it');
  P = mOf(await xc(page, 'll', [n.c.id]));
  const x2 = 2 * D * MLON, pole3 = ([x, y]) => Math.abs(x - x2) < 0.3 && Math.abs(y - 5.53) < 0.3;
  assert.ok(P.filter(([x]) => x < x2 - 1).every(([, y]) => Math.abs(y + 4) < 0.35) && P.filter(([x]) => x > x2 + 1).every(([, y]) => Math.abs(y - 4) < 0.35), `south side, then through pole 3 to the north side: ${JSON.stringify(P)}`);
  assert.equal(P.filter(pole3).length, 1, 'through pole 3');
  assert.equal(await sideOn(), 'Left', 'Left / Right: the side it is on now');
  assert.ok((await page.evaluate(() => window.__toasts.slice())).some((t) => t === 'The road is crossed at tap 3: the left side from there on (↶ takes it back)'));
  // ⇄ Cross here by hand at the last tap: the road crossed there; a tap on the south side after it goes on along it (the crossing made by hand kept)
  await press(page, '#xcBar [data-xc="cross"]', true); await idle(page);
  assert.equal(await page.evaluate(() => document.querySelector('#xcBar [data-xc="cross"]').getAttribute('aria-pressed')), 'true');
  n = await tapAt(page, LA0 - 0.00004, LO0 + 4.6 * D, true); assert.equal(n.c.taps.length, 5); assert.equal(n.c.taps[3].x, 1); assert.equal(n.c.taps[4].x, undefined);
  P = mOf(await xc(page, 'll', [n.c.id]));
  const x3 = 3.5 * D * MLON, after1 = P.filter(([x]) => x > x3 + 1);
  assert.ok(after1.length >= 1 && after1.every(([, y]) => Math.abs(y + 4) < 0.35), `after the crossing: the south side: ${JSON.stringify(P)}`);
  assert.ok(P.some(([x, y], i) => i && Math.abs(x - x3) < 0.5 && Math.abs(P[i - 1][0] - x3) < 0.5 && Math.sign(y) !== Math.sign(P[i - 1][1])), 'the road crossed at tap 4');
  // ↶: the last tap taken back
  await press(page, '#xcBar [data-xc="undo"]', true); n = await idle(page); assert.equal(n.c.taps.length, 4);
  n = await tapAt(page, LA0 - 0.00004, LO0 + 4.6 * D, true); assert.equal(n.c.taps.length, 5); assert.equal(n.c.taps[4].x, undefined);
  // ⋯: underground (dotted on the map), snap to poles off (kept for next time), the distance from the road
  await press(page, '#xcBar [data-xc="more"]', true);
  const more = await page.evaluate(() => [...document.querySelectorAll('#xcBar .xc-more .lbl')].map((x) => x.textContent));
  assert.deepEqual(more, ['IT IS', 'SNAP TO POLES', 'FROM THE ROAD’S CENTRE LINE']);
  await press(page, '#xcBar [data-xc="kind"][data-v="ug"]', true); await press(page, '#xcBar [data-xc="snap"][data-v="0"]', true);
  assert.ok((await xc(page, 'lines')).some((l) => l.dash === '2 7'), 'underground: dotted');
  await press(page, '#xcBar [data-xc="kind"][data-v="ae"]', true); await press(page, '#xcBar [data-xc="more"]', true);
  assert.equal(await page.evaluate(() => window.__polecam.S.xcPref.snap), false);
  await xc(page, 'look', [LA0 + 0.0001, LO0 + 0.0016, 18]); await page.waitForTimeout(300); // (the map moved on, as a thumb does)
  n = await tapAt(page, LA0 + 0.00005, LO0 + 5 * D + 0.00003, true); assert.equal(n.c.taps.length, 6); assert.ok(!n.c.taps[5].pole, 'snap off: not on pole 6, 3 m away'); assert.equal(n.c.taps[5].x, 1, 'on the north side: the road crossed there');
  assert.equal(await sideways(page), false);
  // ✓ Finish: its ends
  await press(page, '#xcFinishBtn', true);
  const ends = await page.evaluate(() => ({ lbl: [...document.querySelectorAll('#xcBar .xc-endbox .lbl')].map((x) => x.textContent), end: document.querySelector('#xcBar .xc-in[data-w="end"]').value,
    pressed: [...document.querySelectorAll('#xcBar [data-xc="eat"][aria-pressed="true"]')].map((b) => `${b.dataset.w}:${b.dataset.v}`), btns: [...document.querySelectorAll('#xcBar button')].map((b) => b.textContent.trim()), h: document.getElementById('xcBar').getBoundingClientRect().height }));
  assert.deepEqual(ends.lbl, ['ITS END', 'ITS START']); assert.equal(ends.end, 'TO '); assert.deepEqual(ends.pressed, ['end:hang', 'start:hang']);
  assert.deepEqual(ends.btns, ['Hanging, with a note', 'At an ODF or site', 'Hanging', 'At an ODF or site', '‹ Back', '✕', 'Save']); assert.ok(ends.h < 740 * 0.62, `its ends fit: ${ends.h}`);
  await page.tap('#xcBar .xc-in[data-w="end"]'); await page.fill('#xcBar .xc-in[data-w="end"]', 'TO DEMO SITE 2');
  await press(page, '#xcBar [data-xc="eat"][data-w="start"][data-v="odf"]', true);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#xcBar [data-xc="eodf"]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])), [['ODF-9001 · ODF', 'true'], ['DEMO TOWER · site', 'false']], 'the nearest ODF or site picked');
  await press(page, '#xcSaveBtn', true);
  const L = await xc(page, 'list'); assert.equal(L.length, 1); const c = L[0];
  assert.deepEqual([c.n, c.kind, c.side, c.off, c.taps.length, c.end, c.start, c.o], [1, 'ae', 'R', 4, 6, { at: 'hang', text: 'TO DEMO SITE 2' }, { at: 'odf', text: '', odf: 'o1' }, USER.email]);
  assert.ok(!('hand' in c) && c.taps.every((t) => !('chk' in t)), 'the drawing\'s own marks not kept');
  assert.ok(c.taps.slice(0, -1).every((t) => Array.isArray(t.g) && t.g.length > 1 && t.gs), 'each stretch kept as drawn');
  assert.ok((await page.evaluate(() => window.__toasts.slice())).some((t) => /^Existing cable 1 saved: \d+ m, for reference only \(not in the BOQ, the PMI or the cable lengths\)$/.test(t)));
  const ll = await xc(page, 'll', [c.id]), odf = RECS.find((r) => r.id === 'o1'); assert.deepEqual(ll[0], [odf.lat, odf.lon], 'its start drawn on to the ODF');
  const lines = await xc(page, 'lines'); assert.equal(lines.length, 1); assert.equal(lines[0].dash, '9 7'); assert.equal(lines[0].ll.length, ll.length);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.xc-tag')].some((t) => t.textContent === 'TO DEMO SITE 2')), 'its note on the map');
  assert.equal(await page.evaluate(() => document.getElementById('xcBar').hidden), true); assert.equal(await page.evaluate(() => document.body.classList.contains('routing')), true, 'back to Route');
  // reference only: the route, its spans and cables, the survey quantities as before it
  assert.deepEqual(await xc(page, 'counts'), c0);
  await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'excable-phone.png') }).catch(() => {});
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a computer: a cable tapped, its card; Edit: a tap dragged follows the road again, dragged across it crosses it; Ctrl+Z, Ctrl+Y, a right-click; Right: every stretch on the right, ✕ leaves the changes; Its ends; Delete; the list of cables; drawing: a right-click and Ctrl+Z take back the last tap', async () => {
  const { ctx, page, errors } = await open();
  await xc(page, 'look', [LA0 + 0.0008, LO0 + 0.0016, 18]); await page.waitForTimeout(400);
  await page.evaluate(() => { window.__cm = []; window.addEventListener('contextmenu', (e) => window.__cm.push(e.defaultPrevented)); }); // ((beta 7.19, existing cable) the browser's menu kept off only while drawing)
  const c = await drawOne(page, [[LA0 + 0.00004, LO0 + 0.5 * D], [LA0 + 0.00004, LO0 + 3.5 * D], [LA0 + 0.0011, AVE - 0.00004]]); // (the street's north side, the avenue's west side: the left)
  let P = mOf(await xc(page, 'll', [c.id]));
  const aveX = (AVE - LO0) * MLON, up = P.filter(([x]) => x > aveX - 20);
  assert.ok(up.length >= 2 && up.every(([x]) => Math.abs(x - (aveX - 4)) < 0.4), `up the avenue on its west side (the left going north): ${JSON.stringify(P)}`);
  assert.ok(P.some(([x, y]) => Math.abs(x - (aveX - 4)) < 0.4 && Math.abs(y - 4) < 0.4), 'the corner mitred (4 m from both roads)');
  // tapped: its card
  const [mx, my] = await xc(page, 'px', [LA0 + 0.0005, LO0 + 0 + (AVE - LO0) - 4 / MLON]); await page.mouse.click(mx, my); await page.waitForTimeout(300);
  assert.equal(await xc(page, 'view'), c.id);
  const card = await page.evaluate(() => ({ text: document.getElementById('xcBar').textContent, btns: [...document.querySelectorAll('#xcBar button')].map((b) => b.textContent) }));
  assert.match(card.text, /Existing cable 1 · Aerial · \d+ m/); assert.match(card.text, /From hanging → TO DEMO SITE 2/); assert.deepEqual(card.btns, ['✕', 'Edit', 'Its ends', 'Delete']);
  // Edit: tap 2 dragged onto the avenue's west side further north... (a handle dragged with the mouse): its stretches drawn along the road again
  await press(page, '#xcBar [data-xc="vedit"]');
  let n = await xc(page, 'now'); assert.equal(n.was, true); assert.equal(n.step, 'draw');
  const drag = async (la0, lo0, la1, lo1) => { const [hx, hy] = await xc(page, 'px', [la0, lo0]), [tx, ty] = await xc(page, 'px', [la1, lo1]);
    await page.mouse.move(hx, hy); await page.mouse.down(); for (let k = 1; k <= 8; k++) { await page.mouse.move(hx + (tx - hx) * k / 8, hy + (ty - hy) * k / 8); await page.waitForTimeout(20); } await page.mouse.up(); await page.waitForTimeout(300); return idle(page); };
  n = await drag(n.c.taps[1].lat, n.c.taps[1].lon, LA0 + 0.00004, LO0 + 2.5 * D); assert.ok(Math.abs((n.c.taps[1].lon - LO0) * MLON - 2.5 * D * MLON) < 1.5, 'tap 2 moved');
  P = mOf(n.c.taps[0].g.concat(n.c.taps[1].g)); assert.ok(P.filter(([, y]) => y < 20).every(([, y]) => Math.abs(y - 4) < 0.4), 'along the street again'); assert.equal(n.c.taps[1].x, undefined);
  // (beta 7.19, existing cable) tap 2 dragged across the street: the road crossed there by itself, on along the south side and up the avenue's east side
  n = await drag(n.c.taps[1].lat, n.c.taps[1].lon, LA0 - 0.00004, LO0 + 2.5 * D); assert.equal(n.c.taps[1].x, 1, 'dragged across: crossed there');
  P = mOf(n.c.taps[1].g); assert.ok(P.filter(([, y]) => y < 20).every(([, y]) => Math.abs(y + 4) < 0.4) && P.filter(([x]) => x > aveX - 20).every(([x]) => Math.abs(x - (aveX + 4)) < 0.4), `after it the right: ${JSON.stringify(P)}`);
  // Ctrl+Z: the drag taken back (tap 2 on the north side, not crossed); Ctrl+Y: done again; a right-click on the map: taken back again
  const u0 = n.undo; await page.keyboard.press('Control+z'); n = await idle(page);
  assert.ok(Math.abs((n.c.taps[1].lat - LA0) * MLAT - 4.4) < 1 && n.c.taps[1].x === undefined && n.undo === u0 - 1 && n.redo === 1, `Ctrl+Z: ${JSON.stringify([n.c.taps[1], n.undo, n.redo])}`);
  await page.keyboard.press('Control+y'); n = await idle(page); assert.equal(n.c.taps[1].x, 1, 'Ctrl+Y: done again'); assert.equal(n.redo, 0);
  const [ex, ey] = await xc(page, 'px', [LA0 + 0.0004, LO0 + 1.5 * D]); await page.mouse.click(ex, ey, { button: 'right' }); await page.waitForTimeout(250); n = await idle(page);
  assert.equal(n.c.taps[1].x, undefined, 'a right-click: taken back'); assert.equal(n.c.taps.length, 3); assert.equal(n.step, 'draw');
  // Right: every stretch on the right
  await press(page, '#xcBar [data-xc="side"][data-v="R"]'); n = await idle(page);
  P = mOf(await xc(page, 'll', [n.c.id])); const st = P.filter(([x, y]) => y < 20 && x > 25 && x < aveX - 10), av = P.filter(([x]) => x > aveX - 20);
  assert.ok(st.length >= 1 && av.length >= 2 && st.every(([, y]) => Math.abs(y + 4) < 0.4) && av.every(([x]) => Math.abs(x - (aveX + 4)) < 0.4), `the right: the street's south side, the avenue's east side: ${JSON.stringify(P)}`);
  // ✕: the changes left out (asked)
  await press(page, '#xcBar [data-xc="cancel"]'); const q = await answer(page, 'Leave the changes'); assert.equal(q.title, 'Stop editing Existing cable 1?');
  assert.deepEqual(await page.evaluate(() => window.__cm.splice(0)), [true], 'the browser\'s menu kept off while editing');
  assert.deepEqual((await xc(page, 'list'))[0], c, 'as it was');
  // Its ends: the note changed
  await xc(page, 'start', [c.id, 'end']); await page.waitForTimeout(200);
  await page.fill('#xcBar .xc-in[data-w="end"]', 'TO DEMO OLT 9'); await page.focus('#xcBar .xc-in[data-w="end"]'); await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  n = await xc(page, 'now'); assert.equal(n.step, 'end', 'Ctrl+Z in its note: the note\'s own'); assert.deepEqual(n.c.taps, c.taps);
  await page.fill('#xcBar .xc-in[data-w="end"]', 'TO DEMO OLT 9'); await press(page, '#xcSaveBtn');
  let L = await xc(page, 'list'); assert.equal(L[0].end.text, 'TO DEMO OLT 9'); assert.deepEqual(L[0].taps, c.taps); assert.ok(L[0].t > c.t);
  // the list of cables (Route › Cables): listed, with Edit, Its ends, Delete
  await press(page, '#routeBtn'); await press(page, '#rtCables');
  const lst = await page.evaluate(() => ({ head: document.querySelector('#rbFibers .xc-lh .lbl').textContent, card: document.querySelector('#rbFibers [data-xcid]').textContent, btns: [...document.querySelectorAll('#rbFibers [data-xcid] button')].map((b) => b.textContent) }));
  assert.equal(lst.head, 'EXISTING CABLES (REFERENCE) · 1'); assert.match(lst.card, /Existing cable 1Aerial · existing\d+ m · from hanging → TO DEMO OLT 9/); assert.deepEqual(lst.btns, ['Edit', 'Its ends', 'Delete']);
  await press(page, '#rbDone');
  // Delete: asked, then gone; kept as deleted (Share)
  await page.mouse.click(mx, my); await page.waitForTimeout(300); await press(page, '#xcBar [data-xc="vdel"]');
  const qd = await answer(page, 'Delete'); assert.equal(qd.title, 'Delete Existing cable 1?'); assert.deepEqual(qd.buttons, ['Keep', 'Delete']);
  assert.deepEqual(await xc(page, 'list'), []); const m = await page.evaluate((a) => window.__polecam.S.meta[a], A);
  assert.ok(m.xcgone[c.id] && m.xcgone[c.id].by === USER.email && m.xcAt >= m.xcgone[c.id].t);
  assert.deepEqual(await xc(page, 'lines'), []);
  // (beta 7.19, existing cable) drawing one: a right-click on the map takes back the last tap, Ctrl+Z the one before; Ctrl+Shift+Z puts one back; outside it the
  // right-click as before (the browser's own)
  await page.mouse.click(ex, ey, { button: 'right' }); await page.waitForTimeout(150); assert.deepEqual(await page.evaluate(() => window.__cm.splice(0)), [false], 'not drawing: as before');
  await xc(page, 'start'); await page.waitForTimeout(200);
  await tapAt(page, LA0 + 0.00004, LO0 + 0.5 * D); n = await tapAt(page, LA0 + 0.00004, LO0 + 1.5 * D); assert.equal(n.c.taps.length, 2);
  await page.mouse.click(ex, ey, { button: 'right' }); await page.waitForTimeout(250); n = await idle(page); assert.equal(n.c.taps.length, 1, 'a right-click: the last tap taken back');
  await page.keyboard.press('Control+z'); n = await idle(page); assert.equal(n.c.taps.length, 0, 'Ctrl+Z: the one before');
  await page.keyboard.press('Control+Shift+z'); n = await idle(page); assert.equal(n.c.taps.length, 1, 'Ctrl+Shift+Z: put back'); assert.equal(n.redo, 1);
  assert.equal(await page.evaluate(() => document.querySelector('#xcBar [data-xc="undo"]').title), 'Undo the last tap or change (Ctrl+Z, or a right-click on the map)');
  await press(page, '#xcBar [data-xc="cancel"]'); await answer(page, 'Leave it'); assert.equal(await xc(page, 'now'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Add Pin on the cable: a pole and a closure placed by hand go on its line and remember it; a new cable (RUN) starts from the pole', async () => {
  const { ctx, page, errors } = await open();
  await xc(page, 'look', [LA0 + 0.0005, LO0 + 0.0016, 18]); await page.waitForTimeout(300);
  const c = await drawOne(page, [[LA0 + 0.00004, LO0 + 5 * D + 0.0002], [LA0 + 0.0011, AVE - 0.00004]]); // (east of the poles, then up the avenue; on the north / west side: the left)
  const aveX = (AVE - LO0) * MLON;
  const addPin = async (k, la, lo) => {
    await page.click('#pinAddBtn'); await page.waitForTimeout(400); await page.click(`#askBox .ptile[data-kind="${k}"]`); await page.waitForSelector('#editor:not([hidden])'); await page.waitForTimeout(600);
    await page.evaluate(([a, b]) => window.__polecam.pinMap.setView([a, b], 19, { animate: false }), [la, lo]); await page.waitForTimeout(400);
    const say = await page.evaluate(() => { const e = document.getElementById('pinXc'); return e && !e.hidden ? e.textContent : ''; });
    await page.click('#edSave'); await page.waitForTimeout(1200);
    const q = await page.evaluate(() => (document.getElementById('askBox').hidden ? null : [document.getElementById('askTitle').textContent, [...document.querySelectorAll('#askBox .row button')].map((b) => b.textContent)]));
    if (q) { assert.match(q[0], /^Put P-\d+ on the cable\?$/); await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Not on a cable').click()); await page.waitForTimeout(400); } // (a new pole near a new cable's span: asked as always; left off it)
    const P = await page.evaluate(() => window.__polecam.points); return { say, r: P[P.length - 1], q };
  };
  // a new pole 1.5 m off the cable's line on the avenue (its line 4 m west of the centre line): put on the line
  const p1 = await addPin('pole', LA0 + 0.0006, AVE - 5.5 / MLON);
  assert.equal(p1.say, 'On Existing cable 1 (existing): put on its line at Save');
  assert.equal(p1.r.xcOn, c.id); assert.ok(Math.abs((p1.r.lon - LO0) * MLON - (aveX - 4)) < 0.15, `on the line: ${(p1.r.lon - LO0) * MLON - aveX}`); assert.equal(p1.r.element, 'Pole');
  // a closure further up: on the line too; a pin far from it: as placed, no cable
  const p2 = await addPin('cl', LA0 + 0.0009, AVE - 3 / MLON); assert.equal(p2.r.xcOn, c.id); assert.equal(p2.r.element, 'Closure');
  const p3 = await addPin('hh', LA0 + 0.0009, AVE - 30 / MLON); assert.equal(p3.say, ''); assert.equal(p3.r.xcOn, undefined); assert.ok(Math.abs((p3.r.lon - LO0) * MLON - (aveX - 30)) < 0.2);
  // counted as usual: the new pole is a proposed pole of the project; a new cable starts from it
  await page.click('#routeBtn'); await page.waitForTimeout(300);
  await page.click('#rtNewCab'); await page.waitForTimeout(300); await page.click('#rtSheetStart'); await page.waitForTimeout(300);
  for (const id of [p1.r.id, 'a6']) { const [x, y] = await page.evaluate((i) => { const p = window.__polecam.points.find((q) => q.id === i); return window.__polecam.xc.px(p.lat, p.lon); }, id); await page.mouse.click(x, y); await page.waitForTimeout(400); }
  await page.click('#rtFinish'); await page.waitForTimeout(400);
  const F = await page.evaluate((a) => window.__polecam.S.meta[a].fibers || [], A);
  assert.ok(F.some((f) => f.path[0] === p1.r.id && f.path.includes('a6')), `a RUN from the new pole: ${JSON.stringify(F.map((f) => f.path))}`);
  await page.click('#rtDone'); await page.waitForTimeout(300);
  // Export's poles on no cable: a pole on the existing cable is on a cable; one placed away from it is not
  const p4 = await addPin('pole', LA0 + 0.00045, AVE - 4.5 / MLON), p5 = await addPin('pole', LA0 + 0.00045, AVE - 40 / MLON);
  assert.equal(p4.r.xcOn, c.id); assert.equal(p5.r.xcOn, undefined);
  const loose = await xc(page, 'loose'); assert.ok(loose.includes(p5.r.id) && !loose.includes(p4.r.id), `on no cable: ${JSON.stringify(loose)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the plan: asked once at the first preview (No: not on it); Plan style › On the plan: the export draws it (its note, the sheets cover it, the PMI the same); Not on the plan: byte for byte the export before it', async () => {
  const { ctx, page, errors } = await open();
  const e0 = await exportPlan(page); assert.equal(e0.job.xcab, null); // (no existing cable: as before; not asked)
  await xc(page, 'look', [LA0 + 0.0008, LO0 + 0.0016, 18]); await page.waitForTimeout(300);
  const c = await drawOne(page, [[LA0 - 0.00001, LO0 + 0.5 * D], [LA0 - 0.00001, LO0 + 4.5 * D], [LA0 + 0.0060, AVE + 0.00001]], { odf: true });
  // the first preview asks; No: not on the plan, not asked again
  await page.click('#drawBtn'); const q = await answer(page, 'No');
  assert.equal(q.title, 'Existing cables on the plan?'); assert.match(q.text, /^Include the existing cable you drew \(1\) on the plan\? .*sheets cover them\. For reference only: never in the BOQ, the PMI or the cable lengths\.\nPlan style › Cables changes it later\.$/s); assert.deepEqual(q.buttons, ['No', 'Yes']);
  assert.equal(await page.evaluate((a) => window.__polecam.S.meta[a].xcPlan, A), false);
  for (let i = 0; i < 120; i++) { const s = await page.evaluate(() => window.__polecam.drwPlan()); if (s && s.on && !s.busy && s.made) break; await page.waitForTimeout(250); }
  const eOff = await exportPlan(page); assert.equal(eOff.job.xcab, null);
  assert.equal(eOff.text.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T'), e0.text.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T'), 'not on the plan: byte for byte the plan before the cable');
  // Plan style › Cables › Existing cables you drew: On the plan
  const row = await page.evaluate(() => { const r = document.getElementById('stXcRow'); return { lbl: r.querySelector('.lbl').textContent, chips: [...r.querySelectorAll('.chip')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]), hint: document.getElementById('stXcHint').textContent, sec: r.closest('details').id }; });
  assert.deepEqual(row.chips, [['On the plan', 'false'], ['Not on the plan', 'true']]); assert.equal(row.sec, 'stRoute'); assert.equal(row.lbl, 'Existing cables you drew');
  assert.match(row.hint, /^This project has 1 existing cable drawn along the road/);
  await page.evaluate(() => document.querySelector('#stXc [data-v="1"]').click()); await page.waitForTimeout(200);
  assert.equal(await page.evaluate((a) => window.__polecam.S.meta[a].xcPlan, A), true);
  const eOn = await exportPlan(page);
  assert.equal(eOn.job.xcab.length, 1); assert.deepEqual([eOn.job.xcab[0].start, eOn.job.xcab[0].end, eOn.job.xcab[0].ug], [{ text: '', odf: 'o1' }, { text: 'TO DEMO SITE 2' }, false]);
  assert.equal(eOn.rep.xcab, 1); assert.ok(eOn.text.includes('TO DEMO SITE 2'), 'its note on the plan');
  assert.ok(eOn.rep.sheets.length > e0.rep.sheets.length, `the sheets cover it (${e0.rep.sheets.length} → ${eOn.rep.sheets.length})`);
  for (const k of Object.keys(e0.job.values).filter((x) => /^PMI_/.test(x))) assert.equal(eOn.job.values[k], e0.job.values[k], `${k} as before`);
  // its line: on the template's cable layer, blue (existing), dashed (aerial)
  const ents = eOn.text.split(/\r?\n/), lw = []; for (let i = 0; i < ents.length - 1; i++) if (ents[i].trim() === '0' && ents[i + 1].trim() === 'LWPOLYLINE') { const r = []; for (let k = i + 2; k < ents.length - 1 && ents[k].trim() !== '0'; k += 2) r.push([+ents[k].trim(), ents[k + 1].trim()]); lw.push(r); }
  const mine = lw.filter((r) => r.some(([g, v]) => g === 62 && v === '5') && r.filter(([g]) => g === 10).length === c.taps.reduce((t, x, i) => t + (i < c.taps.length - 1 ? x.g.length - (i ? 1 : 0) : 0), 0) + 1);
  assert.ok(mine.length === 1 && mine[0].some(([g, v]) => g === 6 && /DASHED|AERCA/.test(v)), `one blue dashed line: ${mine.length}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Share and backups: the whole project carries them; only the changes: when changed since; an update merges each cable whole (the newer wins, a deletion carries over); a backup restores them; the KMZ folder', async () => {
  const { ctx, page, errors } = await open();
  await xc(page, 'look', [LA0 + 0.0008, LO0 + 0.0016, 18]); await page.waitForTimeout(300);
  const k0 = await xc(page, 'kmz');
  const c = await drawOne(page, [[LA0 - 0.00001, LO0 + 0.5 * D], [LA0 - 0.00001, LO0 + 4.5 * D]]);
  const sm = await page.evaluate(() => window.__polecam.shareMeta());
  assert.deepEqual(sm.excab, [c]); assert.ok(sm.xcAt);
  const at = sm.xcAt, older = await xc(page, 'shareDelta', [at]), newer = await xc(page, 'shareDelta', ['2026-01-01T00:00:00.000Z']);
  assert.equal(older.excab, undefined, 'unchanged since: not sent'); assert.deepEqual(newer.excab, [c], 'changed since: sent');
  // an update: their newer copy of it wins; a cable of theirs added; one they deleted (newer than ours) goes
  const theirs = { ...c, end: { at: 'hang', text: 'TO DEMO HUB' }, t: '2099-01-01T00:00:00.000Z' }, other = { ...c, id: 'xcTHEIRS', n: 1, t: '2026-11-02T00:00:00.000Z' };
  assert.equal(await xc(page, 'merge', [{ excab: [theirs, other] }]), 2);
  let L = await xc(page, 'list'); assert.deepEqual(L.map((x) => [x.id, x.n, x.end.text]), [[c.id, 1, 'TO DEMO HUB'], ['xcTHEIRS', 2, 'TO DEMO SITE 2']]);
  assert.equal(await xc(page, 'merge', [{ excab: [{ ...c, t: '2026-01-01T00:00:00.000Z' }] }]), 0, 'an older copy: ours stays');
  assert.equal(await xc(page, 'merge', [{ excab: [], xcgone: { xcTHEIRS: { o: 'x@demo.example', by: 'x@demo.example', t: '2099-02-01T00:00:00.000Z' } } }]), 1);
  L = await xc(page, 'list'); assert.deepEqual(L.map((x) => x.id), [c.id]);
  // a backup restores them (a phone that lost them)
  assert.ok(await xc(page, 'backup') > 0);
  await page.evaluate((a) => { const S = window.__polecam.S; S.meta[a] = { ...S.meta[a], excab: [] }; window.__polecam.persist(); }, A);
  assert.equal(await xc(page, 'restore'), true);
  L = await xc(page, 'list'); assert.deepEqual(L.map((x) => [x.id, x.end.text]), [[c.id, 'TO DEMO HUB']]);
  // the KMZ: the route as before, and a folder of their own
  const k1 = await xc(page, 'kmz'), fo = /<Folder><name>Existing cables \(reference\)<\/name>\n(<Placemark>.*?<\/Placemark>)\n<\/Folder>/s.exec(k1);
  assert.ok(fo, 'its folder'); assert.match(fo[1], /<name>Existing cable 1: hanging → TO DEMO HUB · \d+ m · aerial<\/name>/); assert.match(fo[1], /<Data name="reference_only"><value>yes<\/value><\/Data>/);
  const tm = (k) => k.replace(/ · [A-Z][a-z]{2} \d+, \d{4}, [\d:]+ [AP]M · /g, ' · (when) · '); // (the time it was made)
  assert.equal(tm(k1.replace(/<Folder><name>Existing cables \(reference\)<\/name>.*?<\/Folder>\n/s, '').replace('<Style id="excable"><LineStyle><color>ffab6418</color><width>2.5</width></LineStyle></Style>\n', '')), tm(k0), 'the rest of the KMZ as before');
  assert.deepEqual(errors, []);
  await ctx.close();
});
