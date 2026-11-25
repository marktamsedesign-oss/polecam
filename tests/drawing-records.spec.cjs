/* (beta 7.12, Drawing edit) the Drawing's edits that reach the project's records, so that the KMZ and the other exports follow, and the keys. Run: node --test
   tests/drawing-records.spec.cjs (or python3 tests/run_all.py --only drawing-records). The owner (after beta 7.11): "Closure and loop does not follow cable
   orientation. Cable is where that loop and closure should snap in to. Loop cannot be selected and do some editing.. this should not be.. double check every plan
   element and ensure that it can be edit, delete or update(text, colors and etc) as user requires. after edit or update or delete. the kmz and other erelated docs
   must be updated as well. allow also a cntrl+z or cmd+z to trigger undo and cmd+Y to redo"; "photo add pin: can you remove the text add pin?".
   The app (a computer, 1280 x 900; a phone, 412 x 915), the made-up As-Plan project of drawing-tools.spec.cjs and the made-up template with the plan's blocks:
   - Ctrl + Z / Cmd + Z undo and Ctrl + Y / Cmd + Y / Ctrl + Shift + Z redo every change on the Drawing (a style, a pole moved: its record, Existing / Proposed: its
     record), one step at a time; the Redo icon beside Undo; not while typing in a field;
   - a pole dragged on the Drawing moves its record: the KMZ's placemark, the plan's lat / long; Existing / Proposed: the KMZ's status; Undo and Redo the same;
   - a closure and a loop on the cable slide along it only (job.pins[id].along; the DXF: still on the cable);
   - Delete for each item as the plan says (a field of its record, the whole point, or the item left off the plan only), Undo and Redo, the KMZ following;
     Edit text: the lines that come from the record written into it (the KMZ follows), the others on the plan only;
   - Add Pin: its pin alone on the map and the Drawing, its name and tip kept.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SEED_SQ = fs.readFileSync(path.join(FX, 'plan-seed-made-up-blocks.dxf'), 'utf8'); // (the made-up template with the plan's blocks)
const SHOTS = process.env.SHOTS_DIR || null; // (screenshots for a person to look at: SHOTS_DIR=folder)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-records-'));
const near = (x, y, eps, msg) => assert.ok(Math.abs(x - y) <= eps, `${msg}: ${x} vs ${y}`);
/** The entities of a DXF by handle, in the order written (o): { type, layer, text (1), h (40), rot (50), col (62), pts: [[x, y], …] (10/20 and 11/21) }; and the image
 *  definitions' files (IMAGEDEF 1) by handle. */
function dxfOf(text) {
  const R = text.split(/\r?\n/), ents = new Map(), defs = new Map(); let cur = null, o = 0, sec = '';
  for (let i = 0; i + 1 < R.length; i += 2) {
    const c = +R[i].trim(), v = R[i + 1];
    if (c === 0) { cur = { type: v.trim(), pts: [] }; continue; } if (c === 2 && cur && cur.type === 'SECTION') { sec = v.trim(); continue; } if (!cur) continue;
    if (c === 5 && !cur.h0) { cur.h0 = v.trim(); cur.sec = sec; cur.o = o++; ents.set(cur.h0, cur); } else if (c === 8 && cur.layer == null) cur.layer = v;
    else if (c === 1 && cur.text == null) { cur.text = v; if (cur.type === 'IMAGEDEF') defs.set(cur.h0, v.trim()); } else if (c === 40 && cur.h == null) cur.h = +v; else if (c === 50 && cur.rot == null) cur.rot = +v; else if (c === 62 && cur.col == null) cur.col = +v;
    else if (c === 10 || c === 11) cur.pts.push([+v, NaN]); else if ((c === 20 || c === 21) && cur.pts.length) cur.pts[cur.pts.length - 1][1] = +v; else if (c === 340 && cur.def == null) cur.def = v.trim();
  }
  return { ents, defs };
}
/** The files of a ZIP the app made (stored, not compressed): name -> bytes. */
function zipFiles(buf) {
  const out = new Map(); let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) { const m = buf.readUInt16LE(i + 8), n = buf.readUInt32LE(i + 18), ln = buf.readUInt16LE(i + 26), lx = buf.readUInt16LE(i + 28), nm = buf.toString('utf8', i + 30, i + 30 + ln), d = i + 30 + ln + lx; out.set(nm, m === 0 ? buf.subarray(d, d + n) : null); i = d + n; }
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
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); fs.rmSync(TMP, { recursive: true, force: true }); });

const NAME = 'DEMO RECORDS TEST', OTHER = 'DEMO RECORDS OTHER', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, LA0 + (i > 4 ? (i - 4) * DD : 0), LO0 + Math.min(i, 4) * DD]);
const ON = { s2: { closure: true, closureId: 'CL-9001', boq: { owner: 'Electric', clamp: '8-10', clo: '24C', cloSt: 'New' } }, s3: { boq: { owner: 'Electric', clamp: '8-10', guy: 'Down guy', ground: 'Yes' } }, s4: { status: 'Existing' },
  s6: { nap: true, napId: 'NAP-9001', boq: { owner: 'Electric', clamp: '8-10', napType: 'NAP 1x8', napSt: 'New' } } };
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' }, ...(ON[id] || {}) }))
  .concat([{ id: 't1', project: NAME, element: 'Site', siteKind: 'Tower', poleId: 'DEMO SITE MIN9001', status: 'Existing', lat: LA0, lon: LO0 - 1.2 * DD, accuracy: 4.2, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }]);
const LINKS = [['t1', 's1', 'F12'], ...POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12'])];
const PO = []; for (let i = 0; i < 3; i++) PO.push([`o${i + 1}`, `CC-${9201 + i}`, 7.1230, 125.6200 + i * DD]);
const RECS_O = PO.map(([id, poleId, lat, lon], i) => ({ ...RECS[0], ...{ closure: undefined }, id, project: OTHER, poleId, lat, lon, created: `2026-11-01T09:0${i}:00.000Z`, boq: { owner: 'Electric', clamp: '8-10' } }));
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * DD + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * DD + 0.00008], [LA0 + 3 * DD + 0.0006, LO0 + 4 * DD + 0.00008]]),
  way(3, 'DEMO RD', 'residential', [[7.1230 - 0.00008, 125.6194], [7.1230 - 0.00008, 125.6200 + 3 * DD]]),
  { type: 'node', id: 9, lat: LA0 + 0.0002, lon: LO0 + 2 * DD, tags: { name: 'MADE-UP CHAPEL', amenity: 'place_of_worship' } }] };
const NEW_JOB = ['text', 'notes', 'order', 'leaders', 'style', 'styleKind', 'pins', 'hide'];
/** The app with the made-up project (and the other one), the made-up template on the phone (o.desk: a computer; o.exp: Export settings; o.meta: the project's kept
 *  fields; o.pl: Plan style); each export's job (its new fields), report, DXF and the PDF's report kept. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 412, height: 915 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.startsWith('https://overpass-api.de/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); return r.abort(); });
  const page = await ctx.newPage(), errors = []; page.__touch = !o.desk;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, OTHER, USER, LINKS, LO, exp, meta, pl }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME, OTHER], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: true, dxfCef: false, planOut: 'files', dxfMarks: 'both', dxfLabels: 'std', ...exp }, ...(pl ? { plStyle: pl } : {}),
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, cables24: true, ...meta }, [OTHER]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LO, cables24: true } } }));
  }, { RECS: RECS.concat(RECS_O), NAME, OTHER, USER, LINKS, LO: PO.slice(1).map((q, i) => [PO[i][0], q[0], 'F12']), exp: o.exp || {}, meta: o.meta || {}, pl: o.pl || null });
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
async function boot(page) {
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{display:none!important}' });
}
/** Each export's job (the new fields), its report and DXF, and its PDF's report (the builder and the PDF run on the page, as the export runs them). */
async function hook(page) {
  await page.evaluate(async (KEYS) => {
    const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    if (!window.GeDxfTpl) await load('dxftpl.js'); if (!window.GeDxfPdf) await load('dxfpdf.js');
    const T = window.GeDxfTpl, real = T.build; T.__w = true; window.__exp = []; window.__pdf = [];
    T.build = function (seed, job) { const out = real.call(this, seed, job); window.__exp.push({ job: JSON.parse(JSON.stringify(Object.fromEntries(KEYS.filter((k) => k in job).map((k) => [k, job[k]])))), photos: JSON.parse(JSON.stringify(job.photos || {})), movable: JSON.parse(JSON.stringify(out.report.movable)), photoAt: JSON.parse(JSON.stringify(out.report.photoAt || {})), text: out.text, list: window.GeDxfPdf.planList ? (() => { try { const L = window.GeDxfPdf.planList(out.text, out.report); return L ? { texts: L.texts.map((t) => t.s), images: L.images.map((im) => im.name) } : null; } catch (e) { return { err: String(e) }; } })() : null }); return out; };
    const P = window.GeDxfPdf, realPdf = P.toPdf; P.toPdf = async function (text, opt) { const pdf = await realPdf.call(this, text, opt); window.__pdf.push({ pictures: pdf.report.pictures, missing: (pdf.report.missing || []).slice(), images: Object.keys((opt && opt.images) || {}) }); return pdf; };
  }, NEW_JOB);
}
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(500); } };
const pl = (page) => page.evaluate(() => window.__polecam.drwPlan());
const mvOf = (page) => page.evaluate(() => window.__polecam.drwMv());
const tbOf = (page) => page.evaluate(() => window.__polecam.drwTb());
const icoOf = (page) => page.evaluate(() => window.__polecam.drwIco());
const txtOf = (page) => page.evaluate(() => window.__polecam.drwTxt());
const notesOf = (page) => page.evaluate(() => window.__polecam.drwNotes());
const kept = (page, n) => page.evaluate((x) => { const m = JSON.parse(localStorage.getItem('polecam.settings')).meta[x]; return { mvText: m.mvText || {}, mvOrder: m.mvOrder || [], notes: m.notes || [], mvStyle: m.mvStyle || {}, mvKind: m.mvKind || {}, mvPin: m.mvPin || {}, phPin: m.phPin || {} }; }, n || NAME);
async function drawing(page, mpp, fy) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(700);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(([la, lo, m, y]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m, r.width * 0.5, r.height * y); }, [LA0 + 0.0006, LO0 + 0.0012, mpp || 0.4, fy || 0.5]);
}
async function shown(page, when) {
  let s = null; for (let i = 0; i < 240; i++) { await page.waitForTimeout(250); s = await pl(page); if (s && s.on && !s.busy && (!when || when(s))) { await page.waitForTimeout(300); return pl(page); } }
  throw new Error(`no plan shown: ${JSON.stringify(s)}`);
}
const again = (page, n0) => shown(page, (x) => x.n > n0);
/** Export › Plan drawing (also its PDF): the job's new fields, the report, the DXF, the PDF's report, the ZIP's files (o.zip: saved and read). */
async function exportPlan(page, o) {
  await closeAll(page); await page.evaluate(() => { window.__exp = []; window.__pdf = []; document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doDxf').click(); });
  for (let i = 0; i < 320; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ ask: !document.getElementById('askBox').hidden, res: !document.getElementById('resultBox').hidden }));
    if (st.ask) { await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => /Export (without|as it is)|Export as they are/i.test(b.textContent)) || document.querySelector('#askBox .row button.primary') || B.pop()).click(); }); continue; }
    if (st.res) break;
  }
  const e = await page.evaluate(() => window.__exp); assert.equal(e.length, 1, 'one plan made'); const out = { ...e[0], pdf: (await page.evaluate(() => window.__pdf))[0] || null };
  if (o && o.zip) { const dl = page.waitForEvent('download', { timeout: 60000 }); await page.click('#resSave'); const d = await dl, f = path.join(TMP, `${Date.now()}-${d.suggestedFilename()}`); await d.saveAs(f); out.zip = zipFiles(fs.readFileSync(f)); }
  return out;
}
const itemOf = async (page, id) => (await mvOf(page)).items.find((m) => m.id === id);
const full = (page, id) => page.evaluate((x) => window.__polecam.drwMvItem(x), id);
const tap = (page, x, y) => (page.__touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
async function see(page, id) {
  let m = await itemOf(page, id); assert.ok(m, `${id} on the plan`);
  const R = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  if (m.x < R.l + 50 || m.x > R.l + R.w - 110 || m.y < R.t + 190 || m.y > R.t + R.h - 230) { await page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [m.box[0], m.box[1]]); await page.waitForTimeout(80); m = await itemOf(page, id); }
  return m;
}
/** Tapped (slower than a double-tap) until it is the one selected. */
async function select(page, id) {
  const m = await see(page, id);
  for (let k = 1; k <= 6; k++) { await tap(page, m.x, m.y); await page.waitForTimeout(360); const s = (await mvOf(page)).sels; if (s.length === 1 && s[0] === id) return k; }
  throw new Error(`${id} not selected: ${JSON.stringify((await mvOf(page)).sels)}; under it: ${JSON.stringify(await page.evaluate(([X, Y]) => window.__polecam.drwCands(X, Y), [m.x, m.y]))}`);
}
const tbClick = (page, a, v) => page.evaluate(([a0, v0]) => { const g = document.querySelector(`#drawTb [data-a="${a0}"]`); const b = v0 != null ? g.querySelector(`button[data-v="${v0}"]`) : g; if (!b || b.hidden || b.closest('[hidden]')) throw new Error(`${a0} ${v0 || ''}: not on the toolbar`); b.click(); }, [a, v == null ? null : String(v)]);
const rowClick = (page, a) => page.click(`#drawIcons [data-a="${a}"]`);
async function drag(page, x, y, dx, dy) { await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(x + dx * k / 12, y + dy * k / 12); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(150); }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** The editor's Save, Add or Cancel (a person takes more than its first half second: a tap that opened it is not taken as a press). */
async function txtSave(page, text, id) { await page.waitForTimeout(500); if (text != null) await page.fill('#drawTxtArea', text); await page.click(`#${id || 'drawTxtYes'}`); await page.waitForTimeout(300); }
/** A made-up JPEG (a yellow card with a blue square), made by the browser, as a file for the gallery's input. */
async function jpegFile(page) {
  const b64 = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = '#ffd43b'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#1c7ed6'; g.fillRect(60, 60, 300, 200); g.fillStyle = '#000'; g.font = 'bold 60px sans-serif'; g.fillText('DEMO NOTE', 60, 400);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)), a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); });
  const f = path.join(TMP, `demo-note-${Date.now()}.jpg`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
/** A place on the screen clear of the plan's items (a lat-long north of the route), and what the plan calls it (E, N). */
const freeAt = (page, dLat, dLon) => page.evaluate(([la, lo]) => window.__polecam.drwLL(la, lo), [LA0 + dLat, LO0 + dLon]);
async function openProject(page, name) {
  await closeAll(page); await page.evaluate(() => document.getElementById('projectBtn').click()); await page.waitForTimeout(800);
  await page.evaluate((nm) => document.querySelector(`#taskList .task[data-name="${nm}"]`).click(), name); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.S.project), name); await closeAll(page);
}
/** A note item's entities in a DXF (the report's handles). */
const handlesOf = (ex, id) => { const m = ex.movable.find((x) => x.id === id); return m ? m.handles : []; };

const recOf = (page, id) => page.evaluate((x) => { const p = window.__polecam.points.find((q) => q.id === x); return p ? JSON.parse(JSON.stringify(p)) : null; }, id);
const keptAll = (page, n) => page.evaluate((x) => JSON.parse(JSON.stringify(JSON.parse(localStorage.getItem('polecam.settings')).meta[x])), n || NAME);
/** A point tapped on its centre until its item (pole:… / site:…) is the one selected. */
async function selectPt(page, id, pid) {
  await see(page, id); const p = await page.evaluate((q) => window.__polecam.drwPt(q), pid);
  for (let k = 1; k <= 6; k++) { await tap(page, p[0], p[1]); await page.waitForTimeout(360); const s = (await mvOf(page)).sels; if (s.length === 1 && s[0] === id) return p; }
  throw new Error(`${id} not selected: ${JSON.stringify((await mvOf(page)).sels)}`);
}
/** Until a record is as wanted (the Drawing saves it after a drop). */
async function recWait(page, id, ok) { let r = null; for (let k = 0; k < 60; k++) { r = await recOf(page, id); if (ok(r)) return r; await page.waitForTimeout(100); } throw new Error(`${id}: ${JSON.stringify(r)}`); }
/** Export › Google Earth (KMZ), as a person does it: its KML's placemarks by name: { lon, lat, data: { status, … } }. */
async function exportKml(page) {
  await closeAll(page); await page.evaluate(() => { document.getElementById('exportBtn').click(); }); await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('resultBox').hidden = true; document.getElementById('doKmz').click(); });
  for (let i = 0; i < 200; i++) { await page.waitForTimeout(150); if (await page.evaluate(() => !document.getElementById('resultBox').hidden)) break; }
  const dl = page.waitForEvent('download', { timeout: 60000 }); await page.click('#resSave'); const d = await dl, f = path.join(TMP, `${Date.now()}-${d.suggestedFilename()}`); await d.saveAs(f);
  const kml = zipFiles(fs.readFileSync(f)).get('doc.kml').toString('utf8'), out = {};
  for (const pm of kml.split('<Placemark>').slice(1)) {
    const nm = (pm.match(/<name>([^<]*)<\/name>/) || [])[1], c = (pm.match(/<coordinates>([^<]*)<\/coordinates>/) || [])[1]; if (!nm || !c || !/<Point>/.test(pm)) continue;
    const [lon, lat] = c.trim().split(/[\s,]+/).map(Number), data = {}; for (const m of pm.matchAll(/<Data name="([^"]+)"><value>([^<]*)<\/value><\/Data>/g)) data[m[1]] = m[2];
    out[nm] = { lon, lat, data };
  }
  await closeAll(page); return out;
}

test('keys and Redo: Ctrl + Z / Cmd + Z undo, Ctrl + Y / Cmd + Y / Ctrl + Shift + Z redo every change (a style, a pole moved, Existing / Proposed), one at a time; not while typing', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  let I = await icoOf(page); assert.deepEqual(I.tools.map((t) => t.a), ['sel', 'addtext', 'addphoto', 'undo', 'redo', 'more'], 'Redo beside Undo'); assert.equal(I.tools.find((t) => t.a === 'redo').disabled, true, 'nothing to redo');
  // three changes: a label larger (plan only), a pole moved (its record), a pole existing → proposed (its record)
  await select(page, 'lbl:s3'); await tbClick(page, 'h+'); await page.waitForTimeout(150);
  const r7 = await recOf(page, 's7'), p7 = await selectPt(page, 'pole:s7', 's7'); await drag(page, p7[0], p7[1], 0, -30); const r7b = await recWait(page, 's7', (r) => r.lat !== r7.lat);
  await shown(page); await selectPt(page, 'pole:s4', 's4'); await tbClick(page, 'status', 'proposed'); await recWait(page, 's4', (r) => r.status === 'Proposed');
  await shown(page); assert.deepEqual((await mvOf(page)).undo, ['style h+', 'pole moved', 'proposed (its record)']);
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); }); // (the focus on the page, not in a field)
  // Ctrl + Z three times: each change back, the records too
  await page.keyboard.press('Control+z'); await recWait(page, 's4', (r) => r.status === 'Existing'); assert.deepEqual((await mvOf(page)).redo, ['proposed (its record)']);
  await page.keyboard.press('Control+z'); await recWait(page, 's7', (r) => r.lat === r7.lat && r.lon === r7.lon);
  await page.keyboard.press('Meta+z'); for (let k = 0; k < 20 && (await kept(page)).mvStyle['lbl:s3']; k++) await page.waitForTimeout(100); assert.ok(!(await kept(page)).mvStyle['lbl:s3'], 'Cmd + Z too');
  I = await icoOf(page); assert.equal(I.tools.find((t) => t.a === 'undo').disabled, true); assert.equal(I.tools.find((t) => t.a === 'redo').disabled, false, 'Redo offered');
  // redone: Ctrl + Y, Cmd + Y, Ctrl + Shift + Z
  await page.keyboard.press('Control+y'); for (let k = 0; k < 20 && !(await kept(page)).mvStyle['lbl:s3']; k++) await page.waitForTimeout(100); assert.deepEqual((await kept(page)).mvStyle['lbl:s3'], { h: 1.15 }, 'Ctrl + Y');
  await page.keyboard.press('Meta+y'); await recWait(page, 's7', (r) => r.lat === r7b.lat && r.lon === r7b.lon);
  await page.keyboard.press('Control+Shift+z'); await recWait(page, 's4', (r) => r.status === 'Proposed');
  assert.deepEqual((await mvOf(page)).redo, [], 'all made again'); assert.deepEqual((await mvOf(page)).undo, ['style h+', 'pole moved', 'proposed (its record)']);
  // a new change drops what there was to redo
  await page.click('#drawUndo'); await recWait(page, 's4', (r) => r.status === 'Existing'); assert.deepEqual((await mvOf(page)).redo, ['proposed (its record)']);
  await select(page, 'lbl:s5'); await tbClick(page, 'h+'); await page.waitForTimeout(150); assert.deepEqual((await mvOf(page)).redo, [], 'a new change: nothing to redo');
  // typing in the text editor: Ctrl + Z is the field's own
  await tbClick(page, 'text'); await page.waitForTimeout(500); await page.focus('#drawTxtArea'); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  assert.deepEqual((await kept(page)).mvStyle['lbl:s5'], { h: 1.15 }, 'not undone while typing'); await txtSave(page, null, 'drawTxtNo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a pole moved on the Drawing moves its record: the KMZ\'s placemark and the plan\'s lat / long follow; Existing / Proposed: the KMZ\'s status; Undo and Redo the same', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  const k0 = await exportKml(page); assert.ok(k0['CC-9007'] && k0['CC-9004'], `the KMZ's placemarks: ${Object.keys(k0)}`); assert.equal(k0['CC-9004'].data.status, 'Existing');
  await drawing(page); await shown(page); const r0 = await recOf(page, 's7'), p7 = await selectPt(page, 'pole:s7', 's7'), sc = (await page.evaluate(() => window.__polecam.drwPh().sc));
  await drag(page, p7[0], p7[1], 50, 0); const r1 = await recWait(page, 's7', (r) => r.lon !== r0.lon); assert.equal(r1.adjusted, true); assert.equal(r1.updatedBy && typeof r1.updatedBy, 'string', 'updated by this user');
  const k1 = await exportKml(page); near(k1['CC-9007'].lon, r1.lon, 1e-7, 'the KMZ: its new place (lon)'); near(k1['CC-9007'].lat, r1.lat, 1e-7, 'lat'); near((k1['CC-9007'].lon - k0['CC-9007'].lon) * 111320 * Math.cos(r0.lat * Math.PI / 180), 50 / sc, 0.3, 'as far east as it was dragged');
  const e1 = await exportPlan(page); assert.ok(e1.text.includes(`${(+r1.lon).toFixed(6)}`), 'the plan writes its new lat / long'); // (its old longitude is three other poles' too)
  // Existing / Proposed: its record, the KMZ's status
  await drawing(page); await shown(page); await selectPt(page, 'pole:s4', 's4'); await tbClick(page, 'status', 'proposed'); await recWait(page, 's4', (r) => r.status === 'Proposed');
  const k2 = await exportKml(page); assert.equal(k2['CC-9004'].data.status, 'Proposed', 'the KMZ follows');
  // Undo, Undo: both back, in the KMZ too; Redo: moved again
  await drawing(page); await shown(page); await page.click('#drawUndo'); await recWait(page, 's4', (r) => r.status === 'Existing'); await page.click('#drawUndo'); await recWait(page, 's7', (r) => r.lon === r0.lon);
  const k3 = await exportKml(page); assert.equal(k3['CC-9004'].data.status, 'Existing'); near(k3['CC-9007'].lon, k0['CC-9007'].lon, 1e-8, 'its place as surveyed');
  await drawing(page); await shown(page); await page.click('#drawRedo'); await recWait(page, 's7', (r) => r.lon === r1.lon);
  const k4 = await exportKml(page); near(k4['CC-9007'].lon, r1.lon, 1e-7, 'Redo: moved again in the KMZ');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a closure and a loop on the cable slide along it only (job.pins along); the plan keeps them on their cable', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  for (const id of ['clo:s2', 'loopsym:s6']) {
    const f0 = await full(page, id); assert.ok(f0 && Array.isArray(f0.path) && f0.path.length > 1 && Number.isFinite(f0.along), `${id}: on its cable (path, along)`);
    await select(page, id); const m = await itemOf(page, id), n0 = (await pl(page)).n;
    // dragged across the cable and along it: it goes along it only
    await page.mouse.move(m.x, m.y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(m.x + 24 * k / 12, m.y - 45 * k / 12); await page.waitForTimeout(16); }
    const on = (q) => { let b = Infinity; for (let k = 1; k < f0.path.length; k++) { const a = f0.path[k - 1], e = f0.path[k], vx = e[0] - a[0], vy = e[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / (vx * vx + vy * vy))); b = Math.min(b, Math.hypot(a[0] + vx * t - q[0], a[1] + vy * t - q[1])); } return b; };
    const held = await full(page, id); assert.ok(on(held.boxNow) <= on(f0.box) + 0.6, `${id} held: still on its cable (${on(held.boxNow)} m off it)`);
    await page.mouse.up(); await page.waitForTimeout(250);
    const t = (await keptAll(page)).mvPin[id]; assert.ok(t && Number.isFinite(t.along) && !t.at, `${id}: kept as its place along the cable: ${JSON.stringify(t)}`); assert.ok(Math.abs(t.along - f0.along) > 1, 'it went along');
    await again(page, n0); const f1 = await full(page, id); near(f1.along, t.along, 0.05, `${id}: the plan puts it there`); assert.equal(f1.how, 'by hand');
    assert.ok(on(f1.box) <= on(f0.box) + 0.6, `${id}: on its cable as before (${on(f1.box)} m from it; ${on(f0.box)} before: a loop's circle beside it)`); await shot(page, `records-laptop-${id.split(':')[0]}.png`);
  }
  const e = await exportPlan(page); assert.ok(e.job.pins['clo:s2'].along != null && e.job.pins['loopsym:s6'].along != null, 'the export\'s job');
  await drawing(page); await shown(page); await select(page, 'clo:s2'); await tbClick(page, 'auto'); await page.waitForTimeout(200); assert.ok(!(await keptAll(page)).mvPin || !(await keptAll(page)).mvPin['clo:s2'], 'Back to automatic');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('every element can be selected and styled: a span\'s cable (its colour and weight: Thinner / Thicker), the loops on the cable an element of their own; the DXF follows', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  const mv = await mvOf(page), kinds = new Set(mv.items.map((m) => m.kind));
  for (const k of ['cableline', 'loopsym']) assert.ok(kinds.has(k), `${k} on the plan: ${[...kinds]}`);
  const cl = mv.items.find((m) => m.id === 'cableline:s3|s4') || mv.items.find((m) => m.kind === 'cableline');
  await select(page, cl.id); const T = (await icoOf(page)).tb.filter((t) => !t.hidden).map((t) => t.a);
  for (const a of ['color', 'lw-', 'lw+']) assert.ok(T.includes(a), `a cable: ${a}`); for (const a of ['h+', 'rot+', 's+', 'text']) assert.ok(!T.includes(a), `a cable: no ${a}`);
  assert.match((await mvOf(page)).info, /^Cable /, 'said');
  await tbClick(page, 'lw+'); await tbClick(page, 'color'); await tbClick(page, 'pal', 5); await page.waitForTimeout(150);
  assert.deepEqual((await keptAll(page)).mvStyle[cl.id], { lw: 100, color: 5 }, 'thicker (0.70 → 1.00 mm) and blue'); await shot(page, 'records-laptop-cable.png');
  const e = await exportPlan(page), D = dxfOf(e.text), H = handlesOf(e, cl.id).map((h) => D.ents.get(h)).filter(Boolean);
  assert.ok(H.length && H.some((x) => x.col === 5), `the DXF: its line blue: ${JSON.stringify(H.map((x) => [x.type, x.col]))}`);
  const raw = e.text.split(/\r?\n/), lw = H.map((x) => { for (let i = 0; i + 1 < raw.length; i += 2) if (raw[i].trim() === '5' && raw[i + 1].trim() === x.h0) { for (let j = i + 2; j + 1 < raw.length && raw[j].trim() !== '0'; j += 2) if (raw[j].trim() === '370') return +raw[j + 1]; } return null; });
  assert.ok(lw.includes(100), `its line weight 100: ${lw}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** The askBox's question and its buttons (a point's Delete asks first). */
const askOf = (page) => page.evaluate(() => { const b = document.getElementById('askBox'); return b.hidden ? null : { text: b.textContent.replace(/\s+/g, ' '), buttons: [...b.querySelectorAll('.row button')].map((x) => x.textContent.trim()) }; });
const askClick = (page, label) => page.evaluate((l) => { const B = [...document.querySelectorAll('#askBox .row button')]; const b = B.find((x) => x.textContent.trim() === l); if (!b) throw new Error(`${l}: not asked`); b.click(); }, label);
const delTip = async (page) => { const t = (await icoOf(page)).tb.find((x) => x.a === 'del'); return t && !t.hidden ? t.title : null; };

test('Delete, each as the plan says: a field of its record (a grounding, a guy), the point itself (asked first, naming it), from the plan only (a pole\'s details: job.hide, More › Hidden, Show); a loop the plan puts there by its own rule; Undo and Redo; the KMZ follows', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  const k0 = await exportKml(page), d3 = k0['CC-9003'].data; assert.equal(d3.grounding, 'Yes', JSON.stringify(d3)); assert.equal(d3.guying, 'Down guy'); assert.ok(k0['CC-9008'], 'CC-9008 in the KMZ');
  await drawing(page); await shown(page);
  // a field: the grounding (its form's No grounding), then the guy (the pole's only one)
  await select(page, 'gnd:s3'); assert.match(await delTip(page), /off in its record/, 'Delete says what it does');
  let n0 = (await pl(page)).n; await tbClick(page, 'del'); const r1 = await recWait(page, 's3', (r) => r && r.boq.ground === 'No'); assert.equal(typeof r1.updatedBy, 'string', 'updated by this user');
  await again(page, n0); assert.ok(!(await itemOf(page, 'gnd:s3')), 'the plan without the grounding');
  await select(page, 'guy:s3'); n0 = (await pl(page)).n; await tbClick(page, 'del'); await recWait(page, 's3', (r) => r && !r.boq.guy); await again(page, n0); assert.ok(!(await itemOf(page, 'guy:s3')), 'the plan without the guy');
  assert.equal((await recOf(page, 's3')).boq.ground, 'No', 'its grounding still off');
  const k1 = await exportKml(page); assert.equal(k1['CC-9003'].data.grounding, 'No', 'the KMZ: no grounding'); assert.ok(!k1['CC-9003'].data.guying, `the KMZ: no guy (${k1['CC-9003'].data.guying})`);
  // Undo, Undo: both back (the KMZ too); Redo: the grounding off again, the guy kept
  await drawing(page); await shown(page); await page.click('#drawUndo'); await recWait(page, 's3', (r) => r.boq.guy === 'Down guy'); await page.click('#drawUndo'); await recWait(page, 's3', (r) => r.boq.ground === 'Yes');
  const k2 = await exportKml(page); assert.equal(k2['CC-9003'].data.grounding, 'Yes'); assert.equal(k2['CC-9003'].data.guying, 'Down guy');
  await drawing(page); await shown(page); await page.click('#drawRedo'); await recWait(page, 's3', (r) => r.boq.ground === 'No' && r.boq.guy === 'Down guy');
  // the point: asked first, naming it; Cancel keeps it; Delete: its record gone (its spans with it), the KMZ without it; Undo brings it back, Redo takes it again
  await selectPt(page, 'pole:s8', 's8'); assert.match(await delTip(page), /Delete the point/);
  await tbClick(page, 'del'); await page.waitForTimeout(300); let q = await askOf(page); assert.ok(q && /Delete CC-9008\?/.test(q.text) && q.buttons.includes('Cancel'), `asked: ${JSON.stringify(q)}`);
  await askClick(page, 'Cancel'); await page.waitForTimeout(300); assert.ok(await recOf(page, 's8'), 'Cancel: kept');
  await tbClick(page, 'del'); await page.waitForTimeout(300); await askClick(page, 'Delete'); await recWait(page, 's8', (r) => !r);
  assert.ok(!(await keptAll(page)).links.some((l) => l[0] === 's8' || l[1] === 's8'), 'off its span');
  const k3 = await exportKml(page); assert.ok(!k3['CC-9008'], 'the KMZ without it'); assert.ok(k3['CC-9007']);
  await drawing(page); await shown(page); await page.click('#drawUndo'); const r8 = await recWait(page, 's8', (r) => !!r); assert.equal(r8.poleId, 'CC-9008');
  assert.ok((await keptAll(page)).links.some((l) => (l[0] === 's7' && l[1] === 's8') || (l[0] === 's8' && l[1] === 's7')), 'its span back');
  const k4 = await exportKml(page); assert.ok(k4['CC-9008'], 'Undo: in the KMZ again');
  await drawing(page); await shown(page); await page.click('#drawRedo'); await recWait(page, 's8', (r) => !r); await page.click('#drawUndo'); await recWait(page, 's8', (r) => !!r);
  // from the plan only: a pole's details (job.hide; the DXF without it); More › Hidden lists it; Show brings it back
  await shown(page); await select(page, 'lbl:s5'); assert.match(await delTip(page), /from the plan only/); n0 = (await pl(page)).n; await tbClick(page, 'del');
  assert.deepEqual(Object.keys((await keptAll(page)).mvHide || {}), ['lbl:s5'], 'kept as deleted from the plan'); assert.equal((await recOf(page, 's5')).poleId, 'CC-9005', 'its record as it was');
  await again(page, n0); assert.equal((await full(page, 'lbl:s5')).hidden, true, 'the plan leaves it off');
  await rowClick(page, 'more'); await page.waitForTimeout(150); await page.click('#drawIcoPop [data-a="hidden"]'); await page.waitForTimeout(150);
  assert.match(await page.textContent('#drawIcoPop'), /Deleted from the plan \(1\)/); await shot(page, 'records-laptop-hidden.png');
  const e1 = await exportPlan(page); assert.deepEqual(e1.job.hide, ['lbl:s5'], 'the export\'s job'); assert.ok(!e1.text.includes('PROP.POLE CC-9005'), 'the DXF without it'); assert.ok(e1.text.includes('PROP.POLE CC-9006'), 'the others kept');
  await drawing(page); await shown(page); n0 = (await pl(page)).n; await rowClick(page, 'more'); await page.waitForTimeout(150); await page.click('#drawIcoPop [data-a="hidden"]'); await page.waitForTimeout(150);
  await page.click('#drawIcoPop [data-a="unhide"][data-id="lbl:s5"]'); await page.waitForTimeout(150); assert.deepEqual(Object.keys((await keptAll(page)).mvHide || {}), [], 'shown again');
  await again(page, n0); assert.ok(!(await full(page, 'lbl:s5')).hidden, 'on the plan again');
  // a loop with its NAP (its own loop: the record has no No loop for it): left off the plan only, its record as it was
  const r6 = await recOf(page, 's6'); await select(page, 'loopsym:s6'); n0 = (await pl(page)).n; await tbClick(page, 'del'); await page.waitForTimeout(300);
  assert.ok((await keptAll(page)).mvHide['loopsym:s6'], 'left off the plan'); assert.deepEqual(await recOf(page, 's6'), r6, 'its record as it was');
  await again(page, n0); assert.equal((await full(page, 'loopsym:s6')).hidden, true);
  await page.click('#drawUndo'); await page.waitForTimeout(200); assert.ok(!((await keptAll(page)).mvHide || {})['loopsym:s6'], 'Undo: back');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Edit text writes the lines that show a record\'s field into the record (a pole\'s ID in its details, a NAP\'s ID, a loop\'s length); the KMZ follows; a line in no record\'s form stays the plan\'s; Undo and Redo', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  const t3 = (await full(page, 'lbl:s3')).text; assert.equal(t3[0], 'PROP.POLE CC-9003');
  await select(page, 'lbl:s3'); await tbClick(page, 'text'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#drawTxtSub'), /Line 1 \(its ID\) is from its record/, 'the editor says which line changes the record'); await shot(page, 'records-laptop-text.png');
  let n0 = (await pl(page)).n; await txtSave(page, ['PROP.POLE CC-9103', t3[1], 'BESIDE MADE-UP ST', t3[3]].join('\n'));
  const r3 = await recWait(page, 's3', (r) => r.poleId === 'CC-9103'); assert.equal(typeof r3.updatedBy, 'string');
  assert.deepEqual((await keptAll(page)).mvText['lbl:s3'], ['PROP.POLE CC-9103', t3[1], 'BESIDE MADE-UP ST', t3[3]], 'the line from no record: the plan\'s (job.text)');
  await again(page, n0); assert.deepEqual((await full(page, 'lbl:s3')).text, ['PROP.POLE CC-9103', t3[1], 'BESIDE MADE-UP ST', t3[3]], 'the plan shows it');
  // a NAP's ID (typed small: in capitals, as its form writes it); a loop's length ('{v}m LOOP'): its record's
  await select(page, 'nap:s6'); await tbClick(page, 'text'); n0 = (await pl(page)).n; await txtSave(page, 'nap-9002'); await recWait(page, 's6', (r) => r.napId === 'NAP-9002');
  await again(page, n0); await select(page, 'loop:s6'); await tbClick(page, 'text'); n0 = (await pl(page)).n; await txtSave(page, '20m LOOP'); await recWait(page, 's6', (r) => r.boq.mloopM === '20');
  await again(page, n0); assert.deepEqual((await full(page, 'loop:s6')).text, ['20m LOOP'], 'the plan writes the record\'s length');
  assert.ok(!((await keptAll(page)).mvText || {})['loop:s6'] && !((await keptAll(page)).mvText || {})['nap:s6'], 'nothing kept for the plan: the record says it');
  // not in its form: the plan's only, its record as it was
  const r2 = await recOf(page, 's2'); await select(page, 'loop:s2'); await tbClick(page, 'text'); await txtSave(page, 'MAINTENANCE LOOP'); await page.waitForTimeout(300);
  assert.deepEqual((await keptAll(page)).mvText['loop:s2'], ['MAINTENANCE LOOP']); assert.deepEqual(await recOf(page, 's2'), r2, 'its record as it was');
  const k1 = await exportKml(page); assert.ok(k1['CC-9103'] && !k1['CC-9003'], `the KMZ: its new ID (${Object.keys(k1)})`); assert.equal(k1['CC-9006'].data.nap_id, 'NAP-9002', JSON.stringify(k1['CC-9006'].data)); assert.equal(k1['CC-9006'].data.mloop_length_m, '20');
  const e1 = await exportPlan(page); assert.ok(e1.text.includes('NAP-9002') && e1.text.includes('CC-9103'), 'the DXF follows');
  // Undo four times: each back; the KMZ as it was; Redo: the ID again
  await drawing(page); await shown(page); for (let k = 0; k < 4; k++) { await page.click('#drawUndo'); await page.waitForTimeout(250); }
  const r3b = await recWait(page, 's3', (r) => r.poleId === 'CC-9003'); assert.ok(r3b); assert.equal((await recOf(page, 's6')).napId, 'NAP-9001'); assert.ok(!(await recOf(page, 's6')).boq.mloopM, 'the loop as before');
  assert.ok(!((await keptAll(page)).mvText || {})['lbl:s3'], 'the plan\'s own text again');
  const k2 = await exportKml(page); assert.ok(k2['CC-9003'] && !k2['CC-9103']); assert.equal(k2['CC-9006'].data.nap_id, 'NAP-9001');
  await drawing(page); await shown(page); await page.click('#drawRedo'); await recWait(page, 's3', (r) => r.poleId === 'CC-9103');
  assert.deepEqual(errors, []);
  await ctx.close();
});
