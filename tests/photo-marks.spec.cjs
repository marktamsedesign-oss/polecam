/* (beta 7.16, Photo marks) the owner: "photo4: multiple images cannot draw on other photos inside": a record's marks (boxes, models, FOC routes, texts drawn on
   a photo) worked on its main photo only. Every photo of a record is marked the same way now: a tap on a photo opens it full size with ✎ Box · FOC · Text and
   ⊥ Model, the same marking screen; each photo keeps its own marks (photos[i].marks), its unmarked copy kept beside it (photos[i].origPid, <pid>_o, as the
   main photo's) so the marks can be changed later, and the marked photo in its place: what the exports, the reports, a backup and a team share carry. The
   record's line says which photo has how many; Make main waits until the marks are off; an older record (marks on its main photo) is as it was.
   Run: node --test tests/photo-marks.spec.cjs (or python3 tests/run_all.py --only photo-marks). A made-up survey project; every name, number and place made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
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

const NAME = 'DEMO MARKS TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010;
const rec = (id, poleId, k, o) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat: LA0, lon: LO0 + k * 0.0004, accuracy: 4.2, created: T0, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' }, ...(o || {}) });
const RECS = [
  rec('s1', 'CC-9001', 0, { photos: [{ pid: 's1', label: 'Overview', at: T0 }, { pid: 'p2', label: 'Pole tag', at: T0 }, { pid: 'p3', label: 'Detail', at: T0 }] }),
  rec('s2', 'CC-9002', 1, { marks: [{ k: 'box', x: 0.2, y: 0.2, w: 0.4, h: 0.4 }], origPid: 's2_o', boxes: 1 }), // (an older record: a mark on its main photo)
];
/** The made-up photos: each a plain colour (s2: its main photo marked with a red box, its unmarked copy s2_o). */
const PHOTOS = { s1: '#a5d8ff', p2: '#b2f2bb', p3: '#ffec99', s2: '#dee2e6', s2_o: '#dee2e6' };

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR' } } }));
  }, { RECS, NAME, USER });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.addStyleTag({ content: '#toast{opacity:.0001!important}' });
  await page.evaluate(async (P) => { for (const [id, col] of Object.entries(P)) { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 800, 600);
    if (id === 's2') { g.strokeStyle = '#e03131'; g.lineWidth = 8; g.strokeRect(160, 120, 320, 240); } const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)); await window.__polecam.cef.keep(id, b); } }, PHOTOS);
  return { ctx, page, errors };
}
const marks = (page) => page.evaluate(() => window.__polecam.edPhMarks());
const recOf = (page, id) => page.evaluate((x) => JSON.parse(JSON.stringify(window.__polecam.points.find((p) => p.id === x) || null)), id);
/** How red a stored photo is: its pixels clearly red (a mark's colour), of all. */
const redOf = (page, pid) => page.evaluate(async (id) => {
  const r = await new Promise((res, rej) => { const q = indexedDB.open('polecam'); q.onsuccess = () => { const d = q.result, g = d.transaction('photos').objectStore('photos').get(id); g.onsuccess = () => { d.close(); res(g.result || null); }; g.onerror = () => rej(g.error); }; q.onerror = () => rej(q.error); });
  if (!r || !r.clean) return null; const cl = r.clean instanceof Blob ? r.clean : new Blob([r.clean.__ab], { type: r.clean.type }), bm = await createImageBitmap(cl), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
  const D = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < D.length; i += 4) if (D[i] > 170 && D[i + 1] < 110 && D[i + 2] < 110) n++; return n / (D.length / 4);
}, pid);
async function editor(page, id) {
  await page.evaluate((x) => window.__polecam.openEditorFor(x), id); await page.waitForSelector('#editor:not([hidden])'); await page.waitForTimeout(900);
  await page.evaluate(() => { window.__polecam.edShow('#accPhotos'); const g = document.getElementById('accPhotos'); if (g) g.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(300); // (the record's Photo tab)
}
/** Photo k (1: the main one) of the record open, full size. */
async function photo(page, k) { await page.click(`#accPhotos > div.ph:nth-of-type(${k}) .phwrap img`); await page.waitForSelector('#photoView:not([hidden])'); await page.waitForTimeout(250); }
/** Its marks: ✎ (Box), then boxes dragged on the marking screen (each [x0, y0, x1, y1] of the canvas, 0..1), or Clear; Done. */
async function markIt(page, boxes, clear) {
  await page.click('#pvBox'); await page.waitForSelector('#boxer:not([hidden])'); await page.waitForTimeout(400);
  if (clear) await page.click('#boxClear');
  const cb = await page.locator('#boxCanvas').boundingBox();
  for (const [x0, y0, x1, y1] of boxes || []) {
    await page.mouse.move(cb.x + cb.width * x0, cb.y + cb.height * y0); await page.mouse.down();
    for (let t = 1; t <= 8; t++) await page.mouse.move(cb.x + cb.width * (x0 + (x1 - x0) * t / 8), cb.y + cb.height * (y0 + (y1 - y0) * t / 8));
    await page.mouse.up(); await page.waitForTimeout(150);
  }
  await page.click('#boxDone'); await page.waitForSelector('#boxer', { state: 'hidden' }); await page.waitForTimeout(500);
}
async function save(page) { await page.click('#edSave'); await page.waitForSelector('#editor', { state: 'hidden', timeout: 30000 }); await page.waitForTimeout(800); }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

test('every photo of a record marked as the main one: each its own marks and its unmarked copy, the marked photo in its place (exports, reports, backups, team shares); the line says which photo has how many; Make main waits; marks taken off; an older record as it was', async () => {
  const { ctx, page, errors } = await open();
  const s2a = await recOf(page, 's2');
  await editor(page, 's1'); let M = await marks(page);
  assert.deepEqual(M.photos.map((x) => [x.pid, x.n]), [['p2', 0], ['p3', 0]], 'no marks yet');
  // photo 3: full size with the marking tools (no Read ID: the main photo's), one box
  await photo(page, 3);
  assert.deepEqual(await page.evaluate(() => ({ tools: !document.getElementById('pvTools').hidden, read: !document.getElementById('pvRead').hidden, box: document.getElementById('pvBox').textContent })), { tools: true, read: false, box: '✎ Box · FOC · Text' }, 'photo 3: the marking tools');
  await shot(page, 'marks-photo3-view.png');
  await markIt(page, [[0.2, 0.2, 0.6, 0.6]]); M = await marks(page);
  assert.deepEqual(M.photos.map((x) => [x.pid, x.n]), [['p2', 0], ['p3', 1]], 'photo 3: one mark'); assert.equal(M.main, 0, 'the main photo: none');
  assert.equal(M.info, '▭ Photo 3: 1 mark · tap a photo to change them');
  // photo 2: two boxes
  await photo(page, 2); await markIt(page, [[0.1, 0.1, 0.4, 0.4], [0.5, 0.5, 0.85, 0.85]]); M = await marks(page);
  assert.deepEqual(M.photos.map((x) => [x.pid, x.n]), [['p2', 2], ['p3', 1]]); assert.equal(M.info, '▭ Photo 2: 2 marks · photo 3: 1 mark · tap a photo to change them', 'which photo has how many');
  await shot(page, 'marks-editor-two-photos.png');
  // Make main waits until photo 2's marks are off
  await page.evaluate(() => [...document.querySelectorAll('#accPhotos .phmk')][0].click()); await page.waitForTimeout(400);
  assert.match(await page.evaluate(() => document.getElementById('toast').textContent), /^Photo 2 has marks: remove them first/); assert.equal((await marks(page)).photos[0].pid, 'p2', 'not made main');
  // the main photo's marks: as before (its own line when only it has marks)
  await photo(page, 1); assert.equal(await page.evaluate(() => document.getElementById('pvRead').hidden), false, 'the main photo: Read ID too'); await markIt(page, [[0.3, 0.3, 0.7, 0.7]]);
  assert.equal((await marks(page)).info, '▭ Photo 1: 1 mark · photo 2: 2 marks · photo 3: 1 mark · tap a photo to change them');
  await save(page);
  let R = await recOf(page, 's1');
  assert.equal(R.marks.length, 1, 'the main photo\'s marks where they were (the record)'); assert.equal(R.origPid, 's1_o');
  assert.deepEqual(R.photos.map((x) => [x.pid, (x.marks || []).length, x.origPid || '']), [['s1', 0, ''], ['p2', 2, 'p2_o'], ['p3', 1, 'p3_o']], 'each photo its own marks and unmarked copy');
  assert.ok(R.photos[1].marks.every((m) => m.k === 'box' && m.x > 0 && m.w > 0 && m.x + m.w <= 1), JSON.stringify(R.photos[1].marks));
  // the marked photos in their place (what every export and report reads), the unmarked copies beside them
  for (const pid of ['s1', 'p2', 'p3']) { assert.ok((await redOf(page, pid)) > 0.004, `${pid}: marked`); assert.equal(await redOf(page, `${pid}_o`), 0, `${pid}_o: unmarked`); }
  const A = await page.evaluate(() => window.__polecam.allPidsOf('s1')); for (const pid of ['s1', 'p2', 'p3', 's1_o', 'p2_o', 'p3_o']) assert.ok(A.includes(pid), `a team share and a backup carry ${pid}`);
  const B = await page.evaluate(() => window.__polecam.backupNames()); for (const pid of ['p2', 'p2_o', 'p3', 'p3_o']) assert.ok(B.includes(`photos/${pid}.jpg`), `the backup: ${pid}`);
  // opened again: the marks to change; photo 3's taken off: its photo back as it was, its copy gone
  await editor(page, 's1'); M = await marks(page); assert.deepEqual(M.photos.map((x) => [x.n, x.origPid]), [[2, 'p2_o'], [1, 'p3_o']]);
  await photo(page, 3); assert.equal(await page.evaluate(() => document.getElementById('pvBox').textContent), '✎ Edit the marks');
  await markIt(page, [], true); assert.equal((await marks(page)).info, '▭ Photo 1: 1 mark · photo 2: 2 marks · tap a photo to change them');
  await photo(page, 2); await markIt(page, [[0.6, 0.1, 0.9, 0.3]]); assert.equal((await marks(page)).photos[0].n, 3, 'photo 2: a third mark on its unmarked copy');
  await save(page); R = await recOf(page, 's1');
  assert.deepEqual(R.photos.map((x) => [x.pid, (x.marks || []).length, x.origPid || '']), [['s1', 0, ''], ['p2', 3, 'p2_o'], ['p3', 0, '']]);
  assert.equal(await redOf(page, 'p3'), 0, 'photo 3 as it was taken'); for (let i = 0; i < 40 && (await page.evaluate(() => window.__polecam.cef.has('p3_o'))); i++) await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__polecam.cef.has('p3_o')), false, 'its unmarked copy let go'); assert.ok((await redOf(page, 'p2')) > 0.004);
  // photo 2's marks taken off, then drawn again in the same edit: its unmarked copy kept after all
  await editor(page, 's1'); await photo(page, 2); await markIt(page, [], true); assert.equal((await marks(page)).photos[0].n, 0);
  await photo(page, 2); await markIt(page, [[0.3, 0.3, 0.5, 0.5]]); await save(page); R = await recOf(page, 's1');
  assert.deepEqual([R.photos[1].marks.length, R.photos[1].origPid], [1, 'p2_o']); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__polecam.cef.has('p2_o')), true, 'p2_o kept'); assert.equal(await redOf(page, 'p2_o'), 0); assert.ok((await redOf(page, 'p2')) > 0.002);
  // an older record: its main photo's marks where they were
  await editor(page, 's2'); M = await marks(page); assert.equal(M.info, '▭ 1 mark on the photo · tap the photo to change them', 'the line as before'); assert.equal(M.main, 1);
  await page.click('#edClose'); await page.waitForTimeout(500); assert.deepEqual(await recOf(page, 's2'), s2a, 'unchanged');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a photo marked and not saved yet: after the app closed, the unsaved record opens again with that photo\'s marks, and Save keeps its unmarked copy', async () => {
  const { ctx, page, errors } = await open();
  await editor(page, 's1'); await photo(page, 3); await markIt(page, [[0.25, 0.25, 0.65, 0.65]]);
  assert.equal((await marks(page)).photos[1].n, 1); await page.waitForTimeout(1600); // (the draft kept, 700 ms after a change)
  await page.reload(); await page.waitForFunction(() => !!window.__polecam && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('askBox').hidden && /Unsaved record/.test(document.getElementById('askTitle').textContent), null, { timeout: 20000 });
  await page.evaluate(() => { const B = [...document.querySelectorAll('#askBox .row button')]; B.find((b) => b.textContent === 'Open it').click(); });
  await page.waitForSelector('#editor:not([hidden])'); await page.waitForTimeout(1200);
  const M = await marks(page); assert.deepEqual(M.photos.map((x) => [x.pid, x.n]), [['p2', 0], ['p3', 1]], 'photo 3\'s marks back'); assert.equal(M.info, '▭ Photo 3: 1 mark · tap a photo to change them');
  await page.evaluate(() => window.__polecam.edShow('#accPhotos')); await save(page);
  const R = await recOf(page, 's1'); assert.deepEqual(R.photos.map((x) => [x.pid, (x.marks || []).length, x.origPid || '']), [['s1', 0, ''], ['p2', 0, ''], ['p3', 1, 'p3_o']]);
  assert.ok((await redOf(page, 'p3')) > 0.004, 'photo 3 marked'); assert.equal(await redOf(page, 'p3_o'), 0, 'its unmarked copy (kept in the draft)');
  assert.deepEqual(errors, []);
  await ctx.close();
});
