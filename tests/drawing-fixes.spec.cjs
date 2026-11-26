/* (beta 7.15, Fixes) the owner, on beta 7.14 / main 2.45.16 ("push to beta and main after all fix pass - very urgent"):
   - "Stamp on the plan's photos: enabled but not shown on preview": the Drawing's plan preview shows each photo as the export makes it for the plan: the geotag
     band with Export › Photos with their locations › Same stamp on the plan's photos (its fields), else Plan style › Photos › Stamp on the photos (lat, long), plain
     when neither is on; drawn again when the tick, the band's fields or Plan style's stamp change; each stamped picture made once (kept per photo and stamp).
   - his second video: Regenerate plan preview, "Making the plan preview…", then nothing: when the preview cannot be made, the Drawing says so where Regenerate says
     what it does ("The plan preview could not be made: <reason>. Try Regenerate; if it fails again, export to see the reason.") and logs it (draw.plan.fail): the
     plan's worker answering that it failed, the worker crashing, the worker not answering, the plan made but its drawing not ("could not be drawn": the Drawing
     as before, the photos placed), an error in the app's own preview code. Made again: said no more.
   - the export's "Cannot read properties of null (reading 'id')": a project whose kept Drawing edits hold leftovers (a null note, a note without a place, an order
     op for an item that is gone, a turn and a style for a point deleted since, null pins) previews, counts what was changed by hand and exports, the plan's job
     holding none of them.
   Run: node --test tests/drawing-fixes.spec.cjs (or python3 tests/run_all.py --only drawing-fixes). A made-up As-Plan project and the made-up template with the
   plan's blocks; a stand-in for the plan's worker (dxf-worker.js) where it must fail. Every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { editOn, chgOf } = require('./drawing-edit.cjs');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-blocks.dxf'), 'utf8'); // (the made-up template with the plan's blocks)
const SHOTS = process.env.SHOTS_DIR || null;

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

const NAME = 'DEMO FIXES TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, LA0 + (i > 4 ? (i - 4) * DD : 0), LO0 + Math.min(i, 4) * DD]);
const ON = { s2: { closure: true, closureId: 'CL-9001', boq: { owner: 'Electric', clamp: '8-10', clo: '24C', cloSt: 'New' } }, s3: { boq: { owner: 'Electric', clamp: '8-10', guy: 'Down guy', ground: 'Yes' } }, s4: { status: 'Existing' } };
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' }, ...(ON[id] || {}) }))
  .concat([{ id: 't1', project: NAME, element: 'Site', siteKind: 'Tower', poleId: 'DEMO SITE MIN9001', status: 'Existing', lat: LA0, lon: LO0 - 1.2 * DD, accuracy: 4.2, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }]);
const LINKS = [['t1', 's1', 'F12'], ...POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12'])];
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * DD + 0.00008]]), way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * DD + 0.00008], [LA0 + 3 * DD + 0.0006, LO0 + 4 * DD + 0.00008]])] };
/** Stand-ins for the plan's worker: one that says the plan failed, one that crashes, one that never answers, one whose plan's drawing (dxfpdf.js) fails. */
const WORKERS = {
  fail: "self.onmessage = (e) => { self.postMessage({ id: e.data && e.data.id, ok: false, err: 'DEMO WORKER FAILURE: the plan builder stopped' }); };",
  crash: "self.onmessage = () => { throw new Error('DEMO WORKER CRASH'); };",
  silent: 'self.onmessage = () => {};',
  draw: "self.GeDxfPdf = { planList: () => { throw new Error('DEMO DRAW FAILURE'); } };\n" + fs.readFileSync(path.join(root, 'dxf-worker.js'), 'utf8'), // (the plan made, its drawing not: the worker answers with perr)
};
/** The app with the made-up project and template (o.pl: Plan style; o.exp: export settings; o.meta: the project's kept Drawing edits; o.worker: a stand-in). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk === false ? { width: 393, height: 852 } : { width: 1280, height: 900 }, isMobile: o.desk === false, hasTouch: o.desk === false, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (o.worker && /\/dxf-worker\.js(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: WORKERS[o.worker] }); if (u.startsWith(base)) return r.continue(); if (u.startsWith('https://overpass-api.de/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); return r.abort(); });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, pl, exp, meta }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfMarks: 'both', dxfLabels: 'std', stamp: true, stampOnPlan: false, ...(exp || {}) }, ...(pl ? { plStyle: pl } : {}),
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true, ...(meta || {}) } } }));
  }, { RECS, NAME, USER, LINKS, pl: o.pl || null, exp: o.exp || null, meta: o.meta || null });
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
const stampOf = (page) => page.evaluate(() => window.__polecam.drwStamp());
const fails = (page) => page.evaluate(() => window.__polecam.LOG.all().filter((x) => x.e === 'draw.plan.fail').map((x) => ({ msg: x.d && x.d.msg, how: x.d && x.d.how })));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** The Drawing, opened, looking at the first poles closely (mpp metres a pixel). */
async function drawing(page, mpp) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(([la, lo, m]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width * 0.5, r.height * 0.5); }, [LA0 + 0.0002, LO0 + 1.2 * DD, mpp || 0.12]);
}
async function shown(page, when) {
  let s = null; for (let i = 0; i < 240; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return pl(page); } }
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
/** Until the Regenerate bubble says something matching re (or the preview stops being made with nothing said). */
async function said(page, re, ms) { let s = null; for (let i = 0; i < (ms || 30000) / 250; i++) { await page.waitForTimeout(250); s = await page.evaluate(() => ({ t: document.getElementById('drawRegenT').textContent, fail: document.getElementById('drawRegenT').classList.contains('fail'), busy: window.__polecam.drwPlan().busy, shown: !document.getElementById('drawRegen').hidden })); if (re.test(s.t)) return s; } throw new Error(`not said: ${JSON.stringify(s)}`); }
/** A photo's frame on the screen (the biggest one in view) and how dark the bottom tenth of it is against its upper part (0: as light, 1: black). */
async function photoBand(page) {
  const P = await page.evaluate(() => window.__polecam.drwPh()), r = await page.evaluate(() => { const b = document.getElementById('drawCanvas').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
  const F = P.frames.filter((f) => f.x - f.w / 2 > r[0] + 4 && f.x + f.w / 2 < r[2] - 70 && f.y - f.h / 2 > r[1] + 4 && f.y + f.h / 2 < r[3] - 4 && Math.abs(f.rot) < 0.02).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  assert.ok(F && F.h > 60, `a photo big on the screen: ${JSON.stringify(P.frames.map((f) => [f.id, Math.round(f.w), Math.round(f.h)]))}`);
  return page.evaluate((f) => { const cv = document.getElementById('drawCanvas'), b = cv.getBoundingClientRect(), k = cv.width / b.width, g = cv.getContext('2d');
    const lum = (x0, y0, w, h) => { const D = g.getImageData(Math.round((x0 - b.left) * k), Math.round((y0 - b.top) * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))).data; let s = 0, n = 0; for (let i = 0; i < D.length; i += 4) { s += 0.299 * D[i] + 0.587 * D[i + 1] + 0.114 * D[i + 2]; n++; } return s / n; };
    const x0 = f.x - f.w * 0.42, w = f.w * 0.84, top = lum(x0, f.y - f.h * 0.4, w, f.h * 0.2), bot = lum(x0, f.y + f.h * 0.4, w, f.h * 0.08); // (beside the grey bar too: the band covers the whole width)
    let rows = 0; for (let y = f.y + f.h * 0.48; y > f.y; y -= 1) { if (lum(x0, y, w, 1) < top * 0.75) rows++; else break; } // (how high the dark band is, from the foot)
    return { id: f.id, w: f.w, h: f.h, top, bot, dark: 1 - bot / top, band: rows / f.h }; }, F);
}
async function untilStamped(page, n) { for (let i = 0; i < 120; i++) { const s = await stampOf(page); if (!s.busy && !s.queue && s.made.filter((x) => x.ok).length >= (n || 1)) { await page.waitForTimeout(250); return s; } await page.waitForTimeout(250); } throw new Error(`not stamped: ${JSON.stringify(await stampOf(page))}`); }

test('the stamp on the plan\'s photos in the preview: plain with no stamp; the geotag band with Same stamp on the plan\'s photos (its fields); Plan style\'s lat, long band; plain again; each made once', async () => {
  const { ctx, page, errors } = await open({ pl: { photo: { stamp: 'off', size: 18 } } });
  await drawing(page); await shown(page, (x) => x.count && x.count.pictures === 8); await page.waitForTimeout(800);
  let S = await stampOf(page); assert.equal(S.now, null, 'no stamp: Plan style\'s off, the tick off'); let B = await photoBand(page);
  assert.ok(B.dark < 0.08, `plain: the photo's foot as light as the rest ${JSON.stringify(B)}`); assert.equal(S.made.length, 0, 'nothing stamped'); await shot(page, 'fixes-stamp-0-plain.png');
  // the tick on (Settings › Exports and files, as a person ticks it): the geotag band, its fields (all seven)
  await page.evaluate(() => { const el = document.getElementById('setStampPlan'); el.checked = true; el.dispatchEvent(new Event('change')); }); assert.equal(await page.evaluate(() => window.__polecam.S.exp.stampOnPlan), true);
  S = await stampOf(page); assert.equal(S.now.geo, true, 'the geotag band'); await untilStamped(page); B = await photoBand(page);
  assert.ok(B.dark > 0.25 && B.band > 0.12, `stamped: a dark band at the photo's foot ${JSON.stringify(B)}`); const band7 = B.band; await shot(page, 'fixes-stamp-1-geotag.png');
  S = await stampOf(page); const made1 = S.made.length; assert.ok(made1 >= 1 && S.made.every((x) => x.ok && Math.max(x.w, x.h) <= 320), `kept small: ${JSON.stringify(S.made)}`);
  // drawn again (a pan, a redraw): nothing made again
  await page.evaluate(() => { window.__polecam.drwRedraw(); window.__polecam.drwRedraw(); }); await page.waitForTimeout(400); assert.equal((await stampOf(page)).made.length, made1, 'kept: not made again');
  // fewer fields (ID and lat / long only): stamped anew, a lower band
  await page.evaluate(() => { for (const v of ['addr', 'utm', 'time', 'by', 'project']) document.querySelector(`#stampFields .chip[data-v="${v}"]`).click(); }); assert.deepEqual(await page.evaluate(() => window.__polecam.S.exp.stampFields), ['id', 'coords']);
  await untilStamped(page, made1 + 1); B = await photoBand(page); assert.ok(B.dark > 0.15 && B.band < band7 * 0.75, `two lines: a lower band ${JSON.stringify(B)} vs ${band7}`); await shot(page, 'fixes-stamp-2-two-fields.png');
  // the tick off, Plan style's stamp (its default: lat, long and the address; no road pack here: lat, long): its band, as the export burns it then
  await page.evaluate(() => { const el = document.getElementById('setStampPlan'); el.checked = false; el.dispatchEvent(new Event('change')); });
  const n2 = (await stampOf(page)).made.length;
  await page.evaluate(() => { const S0 = window.__polecam.S; S0.plStyle = { ...(S0.plStyle || {}), photo: { ...((S0.plStyle || {}).photo || {}), stamp: 'addr', size: 18 } }; window.__polecam.persist(); window.__polecam.drwRedraw(); });
  S = await stampOf(page); assert.deepEqual([S.now.geo, S.now.pst], [false, 'addr'], 'Plan style\'s stamp'); await untilStamped(page, n2 + 1); B = await photoBand(page);
  assert.ok(B.dark > 0.12, `Plan style's band at the foot ${JSON.stringify(B)}`); assert.ok(B.band < band7 * 0.75, `one line: lower than the geotag band's seven ${JSON.stringify(B)}`);
  assert.ok((await stampOf(page)).addr, 'the addresses worked out (quietly, once)'); assert.equal(await page.evaluate(() => document.getElementById('busy').hidden), true, 'no busy screen'); await shot(page, 'fixes-stamp-3-plan-style.png');
  // lat, long only: stamped anew
  await page.evaluate(() => { const S0 = window.__polecam.S; S0.plStyle.photo.stamp = 'll'; window.__polecam.persist(); window.__polecam.drwRedraw(); });
  const n3 = (await stampOf(page)).made.length; assert.deepEqual((await stampOf(page)).now.pst, 'll'); await untilStamped(page, n3 + 1); B = await photoBand(page); assert.ok(B.dark > 0.12, `lat, long ${JSON.stringify(B)}`);
  // neither: plain again
  await page.evaluate(() => { const S0 = window.__polecam.S; S0.plStyle.photo.stamp = 'off'; window.__polecam.persist(); window.__polecam.drwRedraw(); }); await page.waitForTimeout(300);
  assert.equal((await stampOf(page)).now, null); B = await photoBand(page); assert.ok(B.dark < 0.08, `plain again ${JSON.stringify(B)}`);
  // the Drawing closed: the stamped pictures let go
  await closeAll(page); assert.equal((await stampOf(page)).made.length, 0, 'let go with the Drawing');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a road pack on the phone: the geotag band\'s address in the preview is looked for quietly (no busy screen over the Drawing)', async () => {
  // (the geotag band's own lookup, the export's, shows "Reading the roads from …" and leaves it to the export to put away: never from the preview)
  const { ctx, page, errors } = await open({ exp: { stampOnPlan: true } });
  await page.evaluate(() => { const S0 = window.__polecam.S; S0.packs = { ...(S0.packs || {}), 'demo-roads': { id: 'demo-roads', kind: 'roads', done: true, name: 'DEMO ROADS', region: 'DEMO REGION', date: '2026-10-01', bbox: [125.5, 7.0, 125.7, 7.2], size: 1000 } }; window.__polecam.persist(); }); // (made up: its data not on the phone)
  assert.equal((await page.evaluate(() => window.__polecam.S.exp.stampFields)).length, 7, 'all seven fields: the address too');
  await drawing(page); let sawBusy = false, S5 = null;
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => !document.getElementById('busy').hidden)) sawBusy = true; S5 = await stampOf(page); if (!S5.busy && !S5.queue && S5.made.some((x) => x.ok)) break; await page.waitForTimeout(100); }
  assert.ok(S5.made.some((x) => x.ok), `stamped ${JSON.stringify(S5)}`); await page.waitForTimeout(400);
  const B = await photoBand(page); assert.ok(B.dark > 0.25 && B.band > 0.12, `the geotag band ${JSON.stringify(B)}`);
  assert.equal(sawBusy || (await page.evaluate(() => !document.getElementById('busy').hidden)), false, 'no busy screen over the Drawing');
  assert.ok(!/could not be made/.test(await page.evaluate(() => document.getElementById('drawRegenT').textContent)), 'the plan made');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the stamped photos kept are bounded: more photos on the screen than are kept, the others plain and none made over and over; looked at closer, those on the screen stamped', async () => {
  const { ctx, page, errors } = await open({ exp: { stampOnPlan: true } });
  await page.evaluate(() => window.__polecam.drwStampCap(3)); // (60 in the app: 3 here, 8 photos on the screen)
  await drawing(page, 0.5); await shown(page, (x) => x.count && x.count.pictures === 8);
  let S = null; for (let i = 0; i < 150; i++) { await page.waitForTimeout(200); S = await stampOf(page); if (!S.busy && !S.queue && S.made.filter((x) => x.ok).length >= 3) break; }
  assert.equal(S.made.length, 3, `3 kept: ${JSON.stringify(S)}`); assert.ok(S.made.every((x) => x.ok));
  const keys = S.made.map((x) => x.key).sort(), n0 = S.n;
  for (let k = 0; k < 6; k++) { await page.evaluate(() => window.__polecam.drwRedraw()); await page.waitForTimeout(150); }
  S = await stampOf(page); assert.equal(S.n, n0, 'none made again (the 3 kept are on the screen)'); assert.deepEqual(S.made.map((x) => x.key).sort(), keys, 'the same 3'); assert.equal(S.queue, 0);
  // closer: the photos on the screen now stamped (the others let go in turn)
  await page.evaluate(([la, lo]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, 0.12, r.width * 0.5, r.height * 0.5); }, [LA0 + 0.0002, LO0 + 3.2 * DD]);
  for (let i = 0; i < 150; i++) { await page.waitForTimeout(200); S = await stampOf(page); if (!S.busy && !S.queue) break; }
  await page.waitForTimeout(300); assert.ok(S.made.length <= 3, `still 3 at most ${JSON.stringify(S.made)}`);
  const B = await photoBand(page); assert.ok(B.dark > 0.25 && B.band > 0.12, `the photo on the screen stamped ${JSON.stringify(B)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the preview that cannot be made says so where Regenerate says what it does, and logs it: the worker says it failed, the worker crashes, the worker does not answer, the plan\'s drawing fails, the app\'s own preview code stops', async () => {
  for (const [kind, re] of [['fail', /DEMO WORKER FAILURE/], ['crash', /DEMO WORKER CRASH/], ['silent', /no answer in 2 s/], ['draw', /DEMO DRAW FAILURE/]]) {
    const how = kind === 'draw' ? 'drawn' : 'made', head = new RegExp(`^The plan preview could not be ${how}: `);
    const phone = kind === 'fail', vw = phone ? 393 : 1280, { ctx, page, errors } = await open({ worker: kind, desk: !phone }); // (the first on a phone: the message on a few lines, on the screen)
    if (kind === 'silent') await page.evaluate(() => window.__polecam.drwPreviewWait(2000));
    await drawing(page);
    const s = await said(page, head, 30000);
    assert.match(s.t, re, `${kind}: the reason`); assert.match(s.t, /\. Try Regenerate; if it fails again, export to see the reason\.$/, `${kind}: what to do`); assert.ok(s.fail && s.shown && !s.busy, `${kind}: by Regenerate, not busy ${JSON.stringify(s)}`);
    assert.ok((await fails(page)).some((x) => re.test(x.msg || '')), `${kind}: logged (draw.plan.fail)`); await shot(page, `fixes-fail-${kind}.png`);
    const bub = await page.evaluate(() => { const b = document.getElementById('drawRegenT').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }); assert.ok(bub[0] >= 0 && bub[2] <= vw && bub[3] - bub[1] > 20, `${kind}: on the screen, on a few lines ${bub}`);
    // Regenerate again: Making… in its place, then said again (never a silent stop)
    if (kind === 'draw') assert.equal((await page.evaluate(() => window.__polecam.drwPh())).frames.length > 0, true, 'draw: the photos placed (the plan made)');
    await page.click('#drawRegen'); const s2 = await said(page, head, 30000); assert.match(s2.t, re);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // the app's own preview code stops (an error before the plan is built): said; fixed, Regenerate makes it and the failure is said no more
  const { ctx, page, errors } = await open({});
  await page.evaluate(async () => { if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); const T = window.GeDxfTpl; T.__loc = T.locations; T.locations = () => { throw new Error('DEMO APP FAILURE'); }; });
  await drawing(page); const s = await said(page, /^The plan preview could not be made: DEMO APP FAILURE\. Try Regenerate/, 30000); assert.ok(s.fail);
  assert.ok((await fails(page)).some((x) => /DEMO APP FAILURE/.test(x.msg || '')), 'logged');
  await page.evaluate(() => { const T = window.GeDxfTpl; T.locations = T.__loc; }); await page.click('#drawRegen');
  await shown(page); const t = await page.evaluate(() => ({ t: document.getElementById('drawRegenT').textContent, fail: document.getElementById('drawRegenT').classList.contains('fail') }));
  assert.ok(!t.fail && !/could not be made/.test(t.t), `made: said no more ${JSON.stringify(t)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a project whose kept Drawing edits hold leftovers (a null note, a note without a place, ops for items that are gone, a turn and a style for a deleted point, null pins): previewed, counted, exported; the plan\'s job holds none of them', async () => {
  const meta = {
    notes: [null, { id: 'n1', kind: 'text', at: [787300, 785990], lines: ['DEMO NOTE'] }, { id: 'n2', kind: 'text', lines: ['NO PLACE'] }, { kind: 'text', at: [1, 2] }, 'junk'],
    mvOrder: [null, { id: 'lbl:s99', op: 'front' }, { id: 'lbl:s3' }, { op: 'back' }, { id: 'lbl:s5', op: 'back' }],
    mvTurn: { 'lbl:s99': [1, 2], 'lbl:s3': null }, mvRec: { 'pole:s99': { p: ['s99'], w: ['moved'] }, 'pole:s4': null, 'nap:s6': { p: null, w: 'status' } },
    mvPin: { 'lbl:s99': null, 'clo:s2': 'junk', 'guy:s3': { rot: 30 } }, mvStyle: { 'lbl:s99': null, 'lbl:s5': { h: 1.5 }, 'lbl:s6': [] }, mvKind: { details: null }, mvText: { 'lbl:s99': null, 'lbl:s7': ['DEMO', null] },
    mvHide: { 'lbl:s99': true }, phPin: { s99: null, s3: [1, 2], s4: [1] }, numPin: { s5: null }, lblPin: { s99: null, s8: 'junk' }, cabPin: { x: null }, poleAt: { s99: null, s7: [1, 'x'] },
  };
  const { ctx, page, errors } = await open({ meta });
  await page.evaluate(async () => { if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__jobs = []; T.build = function (seed, job) { const o = {}; for (const k of ['style', 'styleKind', 'pins', 'poleAt', 'text', 'notes', 'order', 'hide', 'phPin', 'numPin', 'lblPin', 'cabPin']) if (job[k] !== undefined) o[k] = job[k]; window.__jobs.push(JSON.parse(JSON.stringify(o))); return real.call(this, seed, job); }; });
  // the preview: made (no failure said), the job it was made with whole
  await drawing(page, 0.4); await shown(page); const T = await page.evaluate(() => window.__polecam.drwJobTools());
  assert.ok(!/could not be made/.test(await page.evaluate(() => document.getElementById('drawRegenT').textContent)), 'made, no failure');
  assert.deepEqual(T.notes.map((n) => n.id), ['n1'], 'the whole note only'); assert.deepEqual(T.order, [{ id: 'lbl:s99', op: 'front' }, { id: 'lbl:s5', op: 'back' }], 'whole ops only (one for an item that is gone: the builder leaves it out)');
  assert.deepEqual(T.style, { 'lbl:s5': { h: 1.5 } }); assert.equal(T.styleKind, null); assert.deepEqual(T.pins, { 'guy:s3': { rot: 30 } }); assert.equal(T.poleAt, null); assert.deepEqual(T.text, { 'lbl:s7': ['DEMO', ''] }); assert.deepEqual(T.hide, ['lbl:s99']);
  // Edit: the chip and its list, the leftovers not counted
  await editOn(page); let C = await chgOf(page); assert.ok(C.shown, 'the chip');
  assert.deepEqual(C.rows.map((r) => r.id).sort(), ['guy:s3', 'lbl:s5', 'lbl:s7', 'note:n1', 'ph:s3'].sort(), `only whole entries of points still there ${JSON.stringify(C.rows.map((r) => [r.id, r.what]))}`);
  await page.click('#drawChg'); await page.waitForTimeout(250); C = await chgOf(page); assert.equal(C.list.length, 5, 'listed'); await shot(page, 'fixes-leftovers-list.png'); await page.keyboard.press('Escape');
  // the export: made (no error), its job whole
  await closeAll(page); await page.evaluate(() => { window.__jobs = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  let res = null; for (let i = 0; i < 320; i++) { await page.waitForTimeout(250); const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) { res = await page.evaluate(() => document.getElementById('resultBox').textContent); break; } }
  assert.ok(res, 'the export finished'); assert.deepEqual(await page.evaluate(() => window.__polecam.LOG.all().filter((x) => x.e === 'task.fail').map((x) => x.d)), [], 'no export error');
  const J = await page.evaluate(() => window.__jobs); assert.equal(J.length, 1, 'one plan made'); const j = J[0];
  assert.deepEqual(j.phPin, { s3: [1, 2] }, 'whole photo pins only'); for (const k of ['numPin', 'lblPin', 'cabPin']) assert.deepEqual(j[k], {}, `${k}: none whole`); assert.deepEqual(j.notes.map((n) => n.id), ['n1']);
  assert.ok(!JSON.stringify(j).includes('null'), `nothing null in the plan's job: ${JSON.stringify(j).slice(0, 300)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
