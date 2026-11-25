/* (beta 7.12, Drawing edit) on the Drawing (the plan as its PDF prints it): its tools as icons like the CEF plan editor's, an item's text edited, texts and photos
   added on the plan (notes), the draw order of what is selected, and the photos' lines to their pole off. Run: node --test tests/drawing-notes.spec.cjs (or python3
   tests/run_all.py --only drawing-notes). The owner (beta 7.11): "photo1 shows images on the plan that has a line pointing to its pole. i want to remove that if the
   users does not want it"; "allow also the user to edit the text if needed. just to make everything correct before exporting"; "let the user also add a text or photo
   no related with the capture on plans as needed. Use editing icons the as what you have done on the CEF plan drawing and edit"; "allow order on the selected item,
   say, sent to back, backward, sent to front or forward".
   The app (a phone, 412 x 915; a computer, 1280 x 900), the made-up As-Plan project of drawing-tools.spec.cjs (8 poles, a closure, a guying, a NAP, a tower, a made-up
   photo each) and the made-up template with the plan's blocks on the phone:
   - the row of tools (Select, Text, Photo, Undo, More) and the toolbar of what is selected as icons with a caption, a name and a tip each; on a phone the ones used
     less under More; screenshots of both sizes (SHOTS_DIR=folder);
   - Edit text (the toolbar, a double-tap, a double-click): the editor shows the item's text as the plan writes it; Save reaches job.text and the exported DXF and its
     PDF's drawing; Automatic puts the plan's own back (the DXF as before, byte for byte); Undo; the chip;
   - Text and Photo (a made-up JPEG made here, set on the gallery's file input): each a note where the plan is tapped, in the preview and in the export (job.notes,
     the DXF's MTEXT on G-ESAA NOTES and its IMAGE, the ZIP's NOTE_<id>.jpg, the PDF draws the picture); moved, turned, sized, styled, edited, deleted, each under Undo;
     kept after another project and a reload; left out of shareMeta; all back to automatic keeps the notes and puts the texts back;
   - the draw order (To back, To front, Forward, Backward): job.order, the list kept short, the DXF's entity order, Undo;
   - Plan style › Photos › Line to its pole off (the same as Lines to the pole › Photos): no line from any photo on the Drawing (report.photoAt, the display list) and
     in the DXF, with the plan's stamp and with the geotag stamp on the plan's photos; the toolbar's Line with All like it the same for every photo.
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-notes-'));
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

const NAME = 'DEMO NOTES TEST', OTHER = 'DEMO NOTES OTHER', T0 = '2026-11-01T08:00:00.000Z';
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
const NEW_JOB = ['text', 'notes', 'order', 'leaders', 'style', 'styleKind', 'pins'];
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

test('the icon tools, as the CEF plan editor draws its tools: the row over the plan and the toolbar of what is selected, each with a caption, a name and a tip; a phone keeps the ones used less under More; screenshots', async () => {
  for (const desk of [false, true]) {
    const { ctx, page, errors } = await open({ desk }), sz = desk ? 'laptop' : 'phone';
    await drawing(page); await shown(page, (x) => x.count && x.count.pictures === 8);
    let I = await icoOf(page); assert.equal(I.hidden, false, `${sz}: the row`);
    assert.deepEqual(I.tools.map((t) => t.a), ['sel', 'addtext', 'addphoto', 'undo', 'more'], 'Select, Text, Photo, Undo, More');
    for (const t of I.tools) { assert.ok(t.label && t.title && t.cap && t.icon, `${sz} ${t.a}: a name, a tip, a caption, an icon: ${JSON.stringify(t)}`); assert.ok(t.w >= 44 && t.h >= 44, `${sz} ${t.a}: finger-sized ${t.w}x${t.h}`); }
    assert.equal(I.tools.find((t) => t.a === 'sel').pressed, 'true', 'Select pressed'); assert.equal(I.tools.find((t) => t.a === 'undo').disabled, true, 'Undo greyed: nothing to take back');
    const cv = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    if (desk) assert.ok(I.rect.bottom <= cv.top + 1, `a computer: above the plan ${JSON.stringify(I.rect)} ${JSON.stringify(cv)}`); else assert.ok(I.rect.top >= cv.bottom - 1, `a phone: under the plan, by the thumb ${JSON.stringify(I.rect)} ${JSON.stringify(cv)}`);
    await shot(page, `notes-${sz}-row.png`);
    // the toolbar of a pole's details: icons with captions; a phone: Bold, Italic, the line, the draw order, This one / All like it, Automatic, Several under More
    await select(page, 'lbl:s3'); const vis = async () => (await icoOf(page)).tb.filter((t) => !t.hidden);
    let T = await vis(); for (const t of T) assert.ok((t.label || t.title) && t.cap && t.icon, `${sz} toolbar ${t.a} ${t.v || ''}: a name, a caption, an icon: ${JSON.stringify(t)}`);
    for (const a of ['h-', 'h+', 'color', 'text', 'rot+', 'rot-', 'done']) assert.ok(T.some((t) => t.a === a), `${sz}: ${a} shown`);
    const LO = ['bold', 'italic', 'lead', 'front', 'forward', 'backward', 'back', 'auto', 'more'];
    if (!desk) {
      for (const a of LO) assert.ok(!T.some((t) => t.a === a), `a phone: ${a} under More`); assert.ok(T.some((t) => t.a === 'xtra'), 'More');
      const tb0 = (await tbOf(page)).rect; assert.ok(tb0.h < 80, `one row on a phone: ${tb0.h}`); await shot(page, 'notes-phone-toolbar.png');
      await tbClick(page, 'xtra'); await page.waitForTimeout(150); T = await vis(); for (const a of LO) assert.ok(T.some((t) => t.a === a), `a phone, More: ${a}`); assert.equal((await icoOf(page)).xopen, true);
      await shot(page, 'notes-phone-toolbar-more.png'); await tbClick(page, 'xtra');
    } else { for (const a of LO) assert.ok(T.some((t) => t.a === a), `a computer: ${a} shown`); assert.ok(!T.some((t) => t.a === 'xtra'), 'no More on a computer'); await shot(page, 'notes-laptop-toolbar.png'); }
    // More (the row): its tray, Several, Photo lines, All automatic
    await page.keyboard.press('Escape'); await rowClick(page, 'more'); await page.waitForTimeout(150); I = await icoOf(page);
    assert.deepEqual(I.pop.tools.map((t) => t.a), ['several', 'phlines', 'autoall']); for (const t of I.pop.tools) assert.ok(t.label && t.cap && t.icon, `More › ${t.a}`);
    assert.equal(I.pop.tools.find((t) => t.a === 'phlines').pressed, 'true', 'the photos\' lines on'); assert.equal(I.pop.tools.find((t) => t.a === 'autoall').disabled, true, 'nothing changed by hand');
    await page.keyboard.press('Escape'); await page.waitForTimeout(100); assert.equal((await icoOf(page)).pop, null, 'Esc: put away');
    if (!desk) { // a double-tap (a finger) on a pole's details: its text editor
      const m = await see(page, 'lbl:s5'); await select(page, 'lbl:s5'); await page.waitForTimeout(400); await page.touchscreen.tap(m.x, m.y); await page.waitForTimeout(90); await page.touchscreen.tap(m.x, m.y); await page.waitForTimeout(300);
      const X = await txtOf(page); assert.ok(X.open, 'a double-tap: the editor'); assert.match(X.title, /CC-9005/); assert.deepEqual((await mvOf(page)).sels, ['lbl:s5'], 'still the one selected');
      await shot(page, 'notes-phone-editor.png'); await txtSave(page, null, 'drawTxtNo'); assert.equal((await txtOf(page)).open, false);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no page sideways');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Edit text: the item\'s text as the plan writes it; Save reaches job.text, the DXF and its PDF\'s drawing (the record unchanged); Automatic puts the plan\'s own back; a double-click; Undo; the chip', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  const e0 = await exportPlan(page); assert.ok(!('text' in e0.job), 'no texts edited yet'); const rec0 = await page.evaluate(() => JSON.stringify(window.__polecam.points.find((p) => p.id === 's3')));
  await drawing(page); await shown(page);
  await select(page, 'lbl:s3'); const f = await full(page, 'lbl:s3'); assert.ok(f.canNow.text, 'it has texts');
  await tbClick(page, 'text'); let X = await txtOf(page); assert.ok(X.open, 'Edit text: the editor'); assert.equal(X.auto, false, 'no Automatic yet');
  const own = Array.isArray(f.text) ? f.text : X.text.split('\n'); assert.equal(X.text, own.join('\n'), 'its text as the plan writes it, one line per line'); assert.ok(own.length >= 2, `its lines: ${own}`);
  const L = ['DEMO EDITED POLE', ...own.slice(1), 'DEMO EXTRA LINE']; let n0 = (await pl(page)).n;
  await txtSave(page, L.join('\n')); assert.deepEqual((await kept(page)).mvText, { 'lbl:s3': L }, 'kept: the plan only');
  assert.equal((await pl(page)).phAll, '1 text changed by hand · Back to automatic', 'the chip counts it'); assert.deepEqual((await mvOf(page)).undo.slice(-1), ['text edited']);
  await again(page, n0); assert.deepEqual((await page.evaluate(() => window.__polecam.drwJobTools())).text, { 'lbl:s3': L }, 'the preview made with it');
  const f1 = await full(page, 'lbl:s3'); if (Array.isArray(f1.text)) assert.deepEqual(f1.text, L, 'the plan writes it so');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__polecam.points.find((p) => p.id === 's3'))), rec0, 'the record as it was');
  // the export: job.text, the DXF's texts of the item, the PDF's drawing
  const e1 = await exportPlan(page); assert.deepEqual(e1.job.text, { 'lbl:s3': L });
  const D1 = dxfOf(e1.text), tx = handlesOf(e1, 'lbl:s3').map((h) => D1.ents.get(h)).filter((x) => x && /TEXT/.test(x.type)).map((x) => x.text).join('\n');
  assert.match(tx, /DEMO EDITED POLE/, 'the DXF: its first line'); assert.match(tx, /DEMO EXTRA LINE/, 'the DXF: the line added'); assert.ok(!tx.includes(own[0]), `its old first line gone: ${tx}`);
  assert.ok(e1.list && e1.list.texts.some((t) => /DEMO EDITED POLE/.test(t)) && e1.list.texts.some((t) => /DEMO EXTRA LINE/.test(t)), 'the PDF draws it (its drawing code: planList)');
  // a double-click on another item with texts: its editor; Cancel keeps it
  await drawing(page); await shown(page); await select(page, 'lbl:s5'); const m5 = await itemOf(page, 'lbl:s5'); await page.mouse.dblclick(m5.x, m5.y); await page.waitForTimeout(300);
  X = await txtOf(page); assert.ok(X.open, 'a double-click: the editor'); assert.match(X.title, /CC-9005/); await txtSave(page, null, 'drawTxtNo'); assert.ok(!(await kept(page)).mvText['lbl:s5']);
  // Automatic: the plan's own text again; the DXF as before, byte for byte
  await select(page, 'lbl:s3'); await tbClick(page, 'text'); X = await txtOf(page); assert.equal(X.auto, true, 'Automatic offered'); assert.equal(X.text, L.join('\n'), 'the text as edited');
  await txtSave(page, null, 'drawTxtAuto'); assert.deepEqual((await kept(page)).mvText, {}, 'back to the plan\'s own'); assert.deepEqual((await mvOf(page)).undo.slice(-2), ['text edited', 'text back to automatic']);
  await page.click('#drawUndo'); await page.waitForTimeout(200); assert.deepEqual((await kept(page)).mvText, { 'lbl:s3': L }, 'Undo: the edit back');
  await select(page, 'lbl:s3'); await tbClick(page, 'auto'); await page.waitForTimeout(200); assert.deepEqual((await kept(page)).mvText, {}, 'the toolbar\'s Automatic: its text too');
  const e2 = await exportPlan(page); assert.ok(!('text' in e2.job)); assert.ok(e2.text === e0.text, 'the DXF as before any change, byte for byte');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Text and Photo: a note where the plan is tapped, in the preview and the export (job.notes, the DXF, the ZIP\'s NOTE_<id>.jpg, the PDF draws it); moved, turned, sized, styled, edited, deleted with Undo; kept; left out of shareMeta; all back to automatic keeps the notes', async () => {
  const { ctx, page, errors } = await open({ desk: true }), jpg = await jpegFile(page);
  const e0 = await exportPlan(page); assert.ok(!('notes' in e0.job), 'no notes yet');
  await drawing(page); await shown(page);
  // Text: tap the plan, type it, Add
  await rowClick(page, 'addtext'); let I = await icoOf(page); assert.equal(I.adding, 'text'); assert.equal(I.tools.find((t) => t.a === 'addtext').pressed, 'true'); assert.equal(I.tools.find((t) => t.a === 'sel').pressed, 'false'); assert.match(I.say, /Tap the plan where the text goes/);
  const P1 = await freeAt(page, 0.0011, 0.8 * DD);
  let n0 = (await pl(page)).n; await tap(page, P1[0], P1[1]); await page.waitForTimeout(200);
  let X = await txtOf(page); assert.ok(X.open, 'the editor'); assert.equal(X.title, 'Add text'); assert.equal(X.saveOff, true, 'nothing to add yet');
  await txtSave(page, 'DEMO NOTE ONE\nSECOND LINE'); let N = (await notesOf(page)).notes; assert.equal(N.length, 1); const t1 = N[0];
  assert.equal(t1.kind, 'text'); assert.deepEqual(t1.lines, ['DEMO NOTE ONE', 'SECOND LINE']); assert.equal((await icoOf(page)).adding, null, 'adding ended');
  const pt = await page.evaluate(([E, N0]) => window.__polecam.drwPx(E, N0), t1.at); near(pt[0], P1[0], 1.5, 'where tapped (x)'); near(pt[1], P1[1], 1.5, 'y');
  await again(page, n0); assert.deepEqual((await mvOf(page)).sels, [`note:${t1.id}`], 'selected once the plan has it'); let f = await full(page, `note:${t1.id}`); assert.equal(f.kind, 'note'); assert.ok(f.canNow.delete && f.canNow.text, 'a text note: delete, text');
  await shot(page, 'notes-laptop-note.png');
  // moved, turned, sized, bold, coloured, its text edited: the note itself
  const m1 = await itemOf(page, `note:${t1.id}`), sc = await page.evaluate(() => window.__polecam.drwPh().sc); n0 = (await pl(page)).n;
  await drag(page, m1.x, m1.y, 60, -40); N = (await notesOf(page)).notes; near(N[0].at[0], t1.at[0] + 60 / sc, 0.15, 'moved (E)'); near(N[0].at[1], t1.at[1] + 40 / sc, 0.15, 'N');
  await tbClick(page, 'rot+'); await tbClick(page, 'h+'); await tbClick(page, 'bold'); await tbClick(page, 'color'); await tbClick(page, 'pal', 1); await page.waitForTimeout(150);
  N = (await notesOf(page)).notes; assert.equal(N[0].rot, 15); assert.equal(N[0].h, 1.15); assert.equal(N[0].bold, true); assert.equal(N[0].color, 1);
  await tbClick(page, 'text'); X = await txtOf(page); assert.equal(X.title, 'Edit the note'); assert.equal(X.text, 'DEMO NOTE ONE\nSECOND LINE'); await txtSave(page, 'DEMO NOTE ONE EDITED');
  assert.deepEqual((await notesOf(page)).notes[0].lines, ['DEMO NOTE ONE EDITED']);
  assert.deepEqual((await mvOf(page)).undo, ['text added', 'note moved', 'turned +15°', 'style h+', 'style bold', 'style color', 'note edited']);
  // Photo: the gallery (a made-up JPEG), then a tap on the plan
  await rowClick(page, 'addphoto'); I = await icoOf(page); assert.deepEqual(I.pop.tools.map((t) => [t.a, t.cap]), [['cam', 'Camera'], ['gal', 'Gallery']]);
  assert.equal(await page.evaluate(() => document.getElementById('drawNoteCam').getAttribute('capture')), 'environment', 'Camera: the phone\'s camera'); await shot(page, 'notes-laptop-phototray.png');
  await page.setInputFiles('#drawNotePick', jpg); for (let i = 0; i < 40 && (await icoOf(page)).adding !== 'photo'; i++) await page.waitForTimeout(150);
  I = await icoOf(page); assert.equal(I.adding, 'photo', 'the photo kept: a tap places it'); assert.match(I.say, /Tap the plan where the photo goes/);
  const P2 = await freeAt(page, 0.0011, 2.6 * DD); n0 = (await pl(page)).n; await tap(page, P2[0], P2[1]); await page.waitForTimeout(300);
  N = (await notesOf(page)).notes; assert.equal(N.length, 2); const p1 = N[1]; assert.equal(p1.kind, 'photo'); assert.ok(p1.photo.pid && p1.photo.px === 640 && p1.photo.py === 480, JSON.stringify(p1));
  assert.ok(await page.evaluate((id) => window.__polecam.cef.has(id), p1.photo.pid), 'its photo in the photo store');
  await again(page, n0); f = await full(page, `note:${p1.id}`); assert.equal(f.kind, 'notephoto'); assert.deepEqual((await mvOf(page)).sels, [`note:${p1.id}`]);
  await tbClick(page, 's+'); await page.waitForTimeout(150); const w0 = f.box[2]; near((await notesOf(page)).notes[1].size, w0 * 1.25, 0.05, 'a photo larger: its width');
  await shot(page, 'notes-laptop-notes.png');
  // the export: job.notes, the DXF (MTEXT on G-ESAA NOTES, the IMAGE of NOTE_<id>.jpg), the ZIP's file, the PDF's picture
  const e1 = await exportPlan(page, { zip: true }), J = e1.job.notes; assert.equal(J.length, 2);
  assert.deepEqual(J[0], { id: t1.id, kind: 'text', at: (await kept(page)).notes[0].at, rot: 15, lines: ['DEMO NOTE ONE EDITED'], h: 1.15, bold: true, color: 1 });
  assert.deepEqual(J[1].photo, { file: `NOTE_${p1.id}.jpg`, px: 640, py: 480 }); assert.equal(J[1].kind, 'photo'); near(J[1].size, w0 * 1.25, 0.05, 'its size');
  const D1 = dxfOf(e1.text), mt = handlesOf(e1, `note:${t1.id}`).map((h) => D1.ents.get(h)).filter(Boolean);
  assert.ok(mt.some((x) => x.type === 'MTEXT' && /DEMO NOTE ONE EDITED/.test(x.text) && x.layer === 'G-ESAA NOTES'), `the text note: an MTEXT on G-ESAA NOTES: ${JSON.stringify(mt.map((x) => [x.type, x.layer, x.text]))}`);
  const im = handlesOf(e1, `note:${p1.id}`).map((h) => D1.ents.get(h)).filter((x) => x && x.type === 'IMAGE'); assert.equal(im.length, 1, 'the photo note: an IMAGE');
  assert.equal(D1.defs.get(im[0].def), `NOTE_${p1.id}.jpg`, 'its file');
  const z = e1.zip.get(`NOTE_${p1.id}.jpg`); assert.ok(z && z[0] === 0xff && z[1] === 0xd8, 'the ZIP: NOTE_<id>.jpg, a JPEG');
  assert.ok(e1.pdf && e1.pdf.images.includes(`NOTE_${p1.id}.jpg`) && !e1.pdf.missing.some((x) => /NOTE_/.test(x)), `the PDF has its picture: ${JSON.stringify(e1.pdf)}`); assert.equal(e1.pdf.pictures, e0.pdf.pictures + 1, 'one picture more');
  assert.ok(e1.list && e1.list.images.includes(`NOTE_${p1.id}.jpg`) && e1.list.texts.some((t) => /DEMO NOTE ONE EDITED/.test(t)), 'the PDF\'s drawing code draws both');
  // deleted, and back with Undo
  await drawing(page); await shown(page); await select(page, `note:${p1.id}`); const T = await icoOf(page); assert.ok(T.tb.some((t) => t.a === 'del' && !t.hidden), 'Delete for a note'); assert.ok(!T.tb.some((t) => t.a === 'auto' && !t.hidden), 'no Automatic for a note');
  await tbClick(page, 'del'); await page.waitForTimeout(200); assert.equal((await notesOf(page)).notes.length, 1, 'deleted'); assert.deepEqual((await mvOf(page)).sels, []);
  await page.click('#drawUndo'); await page.waitForTimeout(200); assert.equal((await notesOf(page)).notes.length, 2, 'Undo: back');
  // kept with the project (another project, a reload); not shared; all back to automatic keeps the notes, puts the texts back
  await select(page, 'lbl:s3'); await tbClick(page, 'text'); await txtSave(page, 'DEMO KEPT TEXT'); const K = await kept(page); assert.equal(K.notes.length, 2); assert.ok(K.mvText['lbl:s3']);
  await openProject(page, OTHER); await openProject(page, NAME); assert.deepEqual(await kept(page), K, 'after another project');
  await page.reload(); await boot(page); await hook(page); assert.deepEqual(await kept(page), K, 'after a reload');
  const sh = await page.evaluate(() => window.__polecam.shareMeta()); for (const k of ['notes', 'mvText', 'mvOrder']) assert.ok(!(k in sh), `shareMeta: no ${k}`);
  await drawing(page); await shown(page); assert.equal((await pl(page)).phAll, '1 text changed by hand · Back to automatic', 'the notes are not counted');
  await page.click('#drawPhAll'); await page.waitForTimeout(300); await page.evaluate(() => [...document.querySelectorAll('#askBox .row button')].find((b) => b.textContent === 'Back to automatic').click()); await page.waitForTimeout(300);
  const K2 = await kept(page); assert.deepEqual(K2.mvText, {}, 'the text back'); assert.deepEqual(K2.notes, K.notes, 'the notes stay');
  await page.evaluate(() => window.__polecam.drwNotesSweep()); assert.ok(await page.evaluate((id) => window.__polecam.cef.has(id), p1.photo.pid), 'a note\'s photo kept while the note is');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the draw order: To back, To front, Forward, Backward reach job.order (the list kept short) and the DXF\'s entity order; Undo', async () => {
  const { ctx, page, errors } = await open({ desk: true });
  await drawing(page); await shown(page);
  const id = (await mvOf(page)).items.find((m) => m.kind === 'landmark').id;
  await select(page, id); let n0 = (await pl(page)).n; await tbClick(page, 'back'); await page.waitForTimeout(150);
  assert.deepEqual((await kept(page)).mvOrder, [{ id, op: 'back' }]); assert.deepEqual((await mvOf(page)).undo.slice(-1), ['sent to back']);
  await again(page, n0); assert.deepEqual((await page.evaluate(() => window.__polecam.drwJobTools())).order, [{ id, op: 'back' }], 'the preview made with it');
  const ord = (ex) => { const D = dxfOf(ex.text), H = new Set(handlesOf(ex, id)), mine = [], others = []; for (const m of ex.movable) for (const h of m.handles) { const x = D.ents.get(h); if (x && x.sec === 'ENTITIES') (H.has(h) ? mine : others).push(x.o); } return { mine, others }; };
  let e = await exportPlan(page); assert.deepEqual(e.job.order, [{ id, op: 'back' }]); let O = ord(e);
  assert.ok(O.mine.length && Math.max(...O.mine) < Math.min(...O.others), 'To back: its entities drawn first');
  const z = e.movable.find((m) => m.id === id).z; if (z != null) assert.equal(z, 0, 'report z: drawn first');
  await drawing(page); await shown(page); await select(page, id); await tbClick(page, 'front'); await page.waitForTimeout(150);
  assert.deepEqual((await kept(page)).mvOrder, [{ id, op: 'front' }], 'To front drops its To back'); e = await exportPlan(page); O = ord(e);
  assert.ok(Math.min(...O.mine) > Math.max(...O.others), 'To front: its entities drawn last');
  await drawing(page); await shown(page); await select(page, id); await tbClick(page, 'backward'); await tbClick(page, 'forward'); await page.waitForTimeout(150);
  assert.deepEqual((await kept(page)).mvOrder, [{ id, op: 'front' }, { id, op: 'backward' }, { id, op: 'forward' }]);
  await page.click('#drawUndo'); await page.waitForTimeout(150); await page.click('#drawUndo'); await page.waitForTimeout(150); assert.deepEqual((await kept(page)).mvOrder, [{ id, op: 'front' }], 'Undo, one at a time');
  e = await exportPlan(page); assert.deepEqual(e.job.order, [{ id, op: 'front' }]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Plan style › Photos › Line to its pole off (the same as Lines to the pole › Photos): no line from any photo on the Drawing and in the DXF, with the plan\'s stamp and the geotag stamp; Line with All like it the same', async () => {
  const PIN = { s1: [2, 46], s3: [-24, 52], s5: [26, 44] }; // (three photos placed far from their pole: each with its line)
  for (const how of ['plan stamp', 'geotag stamp']) {
    const desk = how === 'plan stamp', { ctx, page, errors } = await open({ desk, meta: { phPin: PIN }, ...(desk ? { pl: { photo: { stamp: 'll' } } } : { exp: { stamp: true, stampOnPlan: true } }) });
    await drawing(page, 0.5); let P = await shown(page, (x) => x.count && x.count.pictures === 8);
    const lines = (at) => Object.keys(PIN).filter((k) => at[k] && at[k].line); let ph = await page.evaluate(() => window.__polecam.drwPh());
    assert.deepEqual(lines(ph.at), Object.keys(PIN), `${how}: the photos placed far away have their line`);
    // Plan style › Photos › Line to its pole: Off; Lines to the pole › Photos says the same
    let n0 = P.n; await page.click('#drawSetBtn'); await page.waitForTimeout(700); await page.evaluate(() => { document.getElementById('stPh').open = true; }); await page.waitForTimeout(200);
    await page.click('#stPhLead [data-v="0"]'); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__polecam.style.pl().lead.photo), false); assert.equal(await page.evaluate(() => document.querySelector('#stLead [data-k="photo"]').getAttribute('aria-pressed')), 'false', 'Lines to the pole › Photos: off too');
    assert.match(await page.evaluate(() => document.querySelector('#stPh .secsum').textContent), /no line to the pole/);
    await closeAll(page); await drawing(page, 0.5); P = await again(page, n0); ph = await page.evaluate(() => window.__polecam.drwPh());
    assert.deepEqual(lines(ph.at), [], `${how}: no line on the Drawing (report.photoAt)`);
    const e = await exportPlan(page); assert.equal(e.job.leaders.photo, false);
    assert.deepEqual(Object.keys(e.photoAt).filter((k) => e.photoAt[k].line), [], `${how}: none in the export's report`);
    const D = dxfOf(e.text), out = [];
    for (const m of e.movable.filter((x) => x.kind === 'photo')) { const [cx, cy, w, h] = m.box, r = Math.hypot(w, h) / 2 + 0.5; for (const hd of m.handles) { const x = D.ents.get(hd); if (x && /LINE/.test(x.type) && x.pts.some((q) => Math.hypot(q[0] - cx, q[1] - cy) > r)) out.push(`${m.id} ${x.type}`); } }
    assert.deepEqual(out, [], `${how}: no line from a photo in the DXF`);
    if (desk) { // the toolbar: a photo selected, All like it, Line: every photo
      await drawing(page, 0.5); await shown(page); await page.click('#drawSetBtn'); await page.waitForTimeout(700); await page.evaluate(() => { document.getElementById('stPh').open = true; }); await page.click('#stPhLead [data-v="1"]'); await page.waitForTimeout(200);
      await closeAll(page); await drawing(page, 0.5); await shown(page); const fr = (await page.evaluate(() => window.__polecam.drwPh())).frames.find((x) => x.id === 's3');
      await page.mouse.click(fr.x, fr.y); await page.waitForTimeout(300); assert.deepEqual((await mvOf(page)).sels, ['ph:s3']); await tbClick(page, 'scope', 'kind'); await tbClick(page, 'lead'); await page.waitForTimeout(150);
      assert.deepEqual((await kept(page)).mvKind.photo, { lead: false }, 'All like it: every photo');
      const e2 = await exportPlan(page); assert.deepEqual(e2.job.styleKind.photo, { lead: false }); assert.deepEqual(Object.keys(e2.photoAt).filter((k) => e2.photoAt[k].line), [], 'no line from any photo');
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
