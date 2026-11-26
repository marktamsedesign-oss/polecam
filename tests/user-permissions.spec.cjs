/* (beta 7.16, Permissions) The owner: "functionality limit per user": "Per user, the admin allows or blocks features: e.g. which exports, the CEF plan,
   Drawing editing, client templates, team admin. allow also to be edit or update via the googlesheet. By default, they are only allow to do the survey
   and kmz export (includes project share and team mailbox)". Run: node --test tests/user-permissions.spec.cjs (or python3 tests/run_all.py --only
   user-permissions).
   The online sheet is the real sheet script (tests/regression/v243/sheet/PoleCam-online-sheet_v2.43.5.gs) on the in-memory spreadsheet of
   regression/v243/e2e/sheet_env.js, answering the app's requests to its web-app address (routed here). Every name, email and place is made up.
   - A solo phone (no company list): every feature, as before (no lock, Edit on the Drawing, no "Your features").
   - The admin makes the company list (Set up a new organisation, the sheet's companies, its Admin key) without touching permissions: a user of the
     list keeps every feature (the update locks nobody out), the sheet answers "off" and lists nobody.
   - Administration → User permissions (a phone, 390 x 844): Limit what users may do, users added by email (a wrong one refused), a chip per feature;
     Save: the list carries them (signed, version 2), the sheet's tab gets the rows (Yes / No, Updated), its Settings → User permissions = Yes.
   - A user not listed (the default): Survey and KMZ export only: Export's tiles locked (🔒 Ask your admin to allow …), not in Everything nor the quick
     picks; a tap and a click() of a locked row's button refused, said, nothing made; the Drawing's Edit
     (the switch, the E key, a test's hook), ✎ Edit route, Undo refused, View stays; the CEF plan's editor, the splicing details, Invite a coworker
     refused; KMZ export and project share allowed; Settings → Your features. The list version came from the sheet, the row too (kept).
   - A user allowed Plan drawing (by the admin's editor): its tiles open; Several at once picked, then blocked by a sync: refused before it starts
     (nothing made half); the plan made; an export under way keeps what was allowed when it started (a sync that blocks it meanwhile: the plan
     still made, blocked after).
   - The sheet edited by hand (a Yes typed in the tab): the phone follows at its next sync (the sheet wins); offline (the app reopened): the row kept.
   - The admin phone and the admin company's users have everything.
   No page errors, no page sideways. Uses isolated browser contexts and a local HTTP server on a free port. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
process.env.GS_FILE = path.join(__dirname, 'regression', 'v243', 'sheet', 'PoleCam-online-sheet_v2.43.5.gs');
const env = require('./regression/v243/e2e/sheet_env.js');
const SEED_SQ = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-square.dxf'), 'utf8');
const SHEET = 'https://script.google.com/macros/s/DEMO-PERMISSIONS-SHEET-0001/exec';
const ADMIN = { name: 'Ana Reyes', mobile: '09170000009', email: 'ana@demo-telco.example' };
const JUAN = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const PEDRO = { name: 'Pedro Santos', mobile: '09170000002', email: 'pedro@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const MARIA = { name: 'Maria Garcia', mobile: '09170000003', email: 'maria@demo-telco.example', company: 'DEMO TELCO' };
const A = 'DEMO PLAN A', LA0 = 7.10465, LO0 = 125.6010, D = 0.00036;
const PA = []; for (let i = 0; i < 6; i++) PA.push([`a${i + 1}`, `CC-${9101 + i}`, LA0, LO0 + i * D]);
const RECS = PA.map(([id, poleId, lat, lon], i) => ({ id, project: A, element: 'Pole', poleId, poleType: 'Concrete', status: i % 3 ? 'Proposed' : 'Existing', lat, lon, accuracy: 4.2,
  created: `2026-11-01T08:0${i}:00.000Z`, updated: `2026-11-01T08:0${i}:00.000Z`, by: 'Juan Dela Cruz · DEMO CONTRACTOR', photos: [] }));
const LINKS = PA.slice(1).map((p, i) => [PA[i][0], p[0], 'F12']);
const FEATS = ['kmz', 'plan', 'exp', 'cef', 'edit', 'tpl', 'admin'];

/* the online sheet: the real script on its stand-in; the phones' requests to SHEET answered by it */
const gs = env.load(env.NEW_GS);
const tab = (n) => env.world.ss.getSheetByName(n);
const header = (n) => tab(n).getRange(1, 1, 1, tab(n).getLastColumn()).getValues()[0];
const rowsOf = (n) => { const sh = tab(n); if (!sh || sh.getLastRow() < 2) return []; const h = header(n); return sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues().map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const permRow = (e) => rowsOf('User permissions').find((r) => String(r.Email).toLowerCase() === e) || null;
const setting = (k) => { const st = tab('Settings'), r = st.getRange(1, 1, st.getLastRow(), 2).getValues().find((x) => x[0] === k); return r ? r[1] : undefined; };
function cell(e, head, v) { const sh = tab('User permissions'), h = header('User permissions'), L = sh.getRange(1, 1, sh.getLastRow(), h.length).getValues(), r = L.findIndex((x, i) => i && String(x[h.indexOf('Email')]).toLowerCase() === e); assert.ok(r > 0, `${e} in the tab`); sh.getRange(r + 1, h.indexOf(head) + 1).setValue(v); }
const sheetLog = [];

let server, browser, base, adminTeam = null, team1 = null, admin = null; // (the admin phone stays open from one test to the next: it holds the list's key)
before(async () => {
  gs.setup();
  tab('Companies').getRange(1, 1, 3, 2).setValues([['Company', 'Authorization'], ['DEMO TELCO', 'ADMIN'], ['DEMO CONTRACTOR', 'USER']]);
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
after(async () => { if (admin) await admin.ctx.close().catch(() => {}); if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

/** A phone (o.desk: a computer, 1280 x 900; else 390 x 844, touch). o.state: what the app keeps (null: a new phone); o.records: the made-up
 *  survey and the made-up template on it. The online sheet answered by the stand-in (net.down: no answer, as offline); every other host refused. */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const net = { down: false, noPerms: false };
  await ctx.route('**/*', async (r) => {
    const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    if (u.startsWith(SHEET)) {
      if (net.down) return r.abort();
      const q = Object.fromEntries(new URL(u).searchParams), post = r.request().method() === 'POST', b = post ? r.request().postData() || '' : '';
      if (post && net.noPerms && /"action":"setPerms"/.test(b)) return r.abort(); // (the sheet not answering the admin's permissions)
      const out = post ? gs.doPost({ postData: { contents: b } }) : gs.doGet({ parameter: q });
      sheetLog.push(post ? { post: (() => { try { return JSON.parse(b).action; } catch (e) { return '?'; } })() } : { get: q.email || '', pv: q.pv || '', v: q.v || '' });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out.getContent() });
    }
    return r.abort();
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (o.state !== null) {
    await page.goto(base + 'manifest.json');
    await page.evaluate(async ({ RECS, state, recs }) => {
      await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'); if (recs) RECS.forEach((x) => tx.objectStore('points').put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      localStorage.setItem('polecam.settings', JSON.stringify(state));
    }, { RECS, state: o.state, recs: o.records !== false });
  }
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!window.__polecam.perm && !!document.getElementById('exportBtn'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(() => {
    window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true });
    try { const g = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine').get; Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get() { return window.__offline ? false : g.call(this); } }); } catch (e) { /* as it is */ }
  });
  if (o.state !== null && o.records !== false) {
    await page.evaluate(async (text) => { // the made-up template on the phone (the Drawing's View | Edit and the plan's export need it), the builder watched
      await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-square.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
      if (!window.GeDxfTpl) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'dxftpl.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const Tp = window.GeDxfTpl, real = Tp.build; Tp.__w = true; window.__builds = [];
      Tp.build = function (seed, job) { const w = window.__duringBuild; if (w) { window.__duringBuild = null; w(); } window.__builds.push({ at: Date.now(), perm: window.__polecam.perm() }); return real.call(this, seed, job); };
    }, SEED_SQ);
  }
  return { ctx, page, errors, net };
}
/** What a phone of the list keeps: its user, the admin's list (as it joined), the made-up survey. */
const userState = (u, team) => ({ projects: [A], project: A, sampleDone: true, saveCheck: false, zone: 51, user: u, team, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
  drawMapKind: 'off', exp: { dxfMode: 'tpl', dxfPdf: false, dxfCef: false, planOut: 'files', dxfLabels: 'std', dxfRoads: false }, meta: { [A]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, linksAt: '2026-11-01T08:00:00.000Z', cables24: true } } });
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
const perm = (page) => page.evaluate(() => window.__polecam.perm());
/** What was refused (the App log's perm.refused: the feature and what asked), from the n-th on. */
const refused = (page, n) => page.evaluate((k) => window.__polecam.LOG.all().filter((x) => x.e === 'perm.refused').slice(k || 0).map((x) => `${x.d.k}:${x.d.how}`), n || 0);
const nRefused = async (page) => (await refused(page)).length;
/** Export's tiles picked as want (tapped on or off as needed); the tiles picked then. */
async function pickTiles(page, want) {
  for (let i = 0; i < 6; i++) {
    const now = await page.evaluate(() => [...document.querySelectorAll('#export .xtile[aria-pressed=true]')].map((b) => b.dataset.xt).filter((k) => k !== '*all'));
    const tap = now.find((k) => !want.includes(k)) || want.find((k) => !now.includes(k)); if (!tap) return now.sort();
    await page.click(`#export [data-xt="${tap}"]`); await page.waitForTimeout(150);
  }
  throw new Error('tiles not picked');
}
async function until(page, fn, arg, s) { for (let i = 0; i < (s || 30) * 5; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(200); } throw new Error(`not so after ${s || 30} s: ${fn}`); }
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(400); } };
async function answer(page, label) {
  await until(page, () => !document.getElementById('askBox').hidden, null, 15);
  await page.evaluate((l) => { const b = [...document.querySelectorAll('#askBox .row button')].find((x) => x.textContent.trim() === l) || document.querySelector('#askBox .row button.primary'); b.click(); }, label); await page.waitForTimeout(300);
}
/** Export opened: its tiles ({ key: { locked, small } }) and what Everything and the quick picks hold. */
async function exportTiles(page) {
  await closeAll(page); await page.evaluate(() => document.getElementById('exportBtn').click()); await page.waitForTimeout(800);
  await page.evaluate(() => { const d = document.querySelector('#askBox:not([hidden])'); if (d) { const b = [...d.querySelectorAll('.row button')].find((x) => /as they are/i.test(x.textContent)); if (b) b.click(); } }); await page.waitForTimeout(300);
  return page.evaluate(() => ({ tiles: Object.fromEntries([...document.querySelectorAll('#export [data-xt]')].map((b) => [b.dataset.xt, { locked: b.classList.contains('permlock'), perm: b.dataset.perm || '', small: (b.querySelector('small') || {}).textContent || '' }])),
    picks: [...document.querySelectorAll('#xPicks [data-xp]')].map((b) => b.dataset.xp), sel: [...document.querySelectorAll('#export .xtile[aria-pressed=true]')].map((b) => b.dataset.xt), sideways: document.scrollingElement.scrollWidth > innerWidth + 1 }));
}
/** The Drawing opened (the made-up template: the View | Edit switch shown). */
async function drawing(page) {
  await closeAll(page); await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(900);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await until(page, () => { const m = window.__polecam.drwMode(); return m && m.on; }, null, 40);
}

test('a solo phone (no company list): every feature, as before', async () => {
  const { ctx, page, errors } = await open({ state: { ...userState(JUAN, null) } });
  try {
    const p = await perm(page);
    assert.equal(p.state.why, 'solo'); assert.deepEqual(FEATS.filter((k) => !p.ok[k]), [], 'every feature allowed');
    const X = await exportTiles(page);
    assert.deepEqual(Object.entries(X.tiles).filter(([, t]) => t.locked).map(([k]) => k), [], 'no tile locked');
    assert.ok(X.picks.length >= 2, 'the quick picks as before'); assert.ok(X.tiles.doDxf && X.tiles.doBoq && X.tiles.doKmz);
    await drawing(page);
    assert.equal((await page.evaluate(() => window.__polecam.drwMode('edit'))).mode, 'edit', 'Edit on the Drawing');
    assert.equal(await page.evaluate(() => document.getElementById('drawModeEdit').classList.contains('permlock')), false);
    await closeAll(page); await page.evaluate(() => document.getElementById('settingsBtn').click()); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.getElementById('permMe').hidden), true, 'no "Your features"');
    assert.ok(!(await toasts(page)).some((t) => /Ask your admin/.test(t)));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the admin makes the list (permissions untouched): its users keep every feature; the sheet says off', async () => {
  admin = await open({ state: null });
  const { page, errors } = admin;
  await page.fill('#pfName', ADMIN.name); await page.fill('#pfMobile', ADMIN.mobile); await page.fill('#pfEmail', ADMIN.email);
  await page.click('#pfCreateBox summary'); await page.click('#pfCreate'); await page.waitForTimeout(400);
  await page.fill('#admPin', '1234'); await page.fill('#admPin2', '1234'); await page.click('#admUnlock'); await page.waitForTimeout(700);
  await page.fill('#admName', 'DEMO TELCO list');
  await page.evaluate(({ url, rk, ak }) => { document.getElementById('admUrl').value = url; document.getElementById('admReadKey').value = rk; document.getElementById('admWriteKey').value = ak; document.getElementById('admCoRefresh').click(); },
    { url: SHEET, rk: gs.settings_()['Read key'], ak: gs.settings_()['Admin key'] });
  await until(page, () => document.querySelectorAll('#admCos span').length >= 2, null, 20);
  await page.selectOption('#admOwner', 'DEMO TELCO');
  assert.equal(await page.evaluate(() => document.getElementById('admPermOn').checked), false, 'User permissions off at first');
  await page.evaluate(() => document.getElementById('admSave').click());
  await answer(page, 'OK');
  await page.selectOption('#pfCompany', 'DEMO TELCO'); await page.click('#pfSave'); await page.waitForTimeout(1200);
  await until(page, () => { const t = window.__polecam.S.team; return !!(t && t.rev === 1 && window.__polecam.S.user && window.__polecam.S.user.company === 'DEMO TELCO'); }, null, 20);
  team1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__polecam.S.team)));
  assert.equal(team1.perms, undefined, 'permissions never used: the list as before (no perms)');
  const p = await perm(page); assert.equal(p.admin, true); assert.equal(p.state.why, 'admin');
  assert.equal(setting('User permissions'), 'No'); assert.equal(rowsOf('User permissions').length, 0, 'nobody listed');
  assert.deepEqual(errors, []);
  // a user of the list: every feature (the sheet answers off; nobody is added to the tab while off)
  const u = await open({ state: userState(PEDRO, team1) });
  try {
    await u.page.evaluate(() => window.__polecam.cloudSync(true)); await u.page.waitForTimeout(500);
    const q = await perm(u.page);
    assert.equal(q.state.why, 'sheet'); assert.equal(q.state.on, false); assert.deepEqual(FEATS.filter((k) => !q.ok[k]), []);
    assert.ok(sheetLog.some((x) => x.get === PEDRO.email && x.pv === '1'), 'the phone asks with pv=1');
    assert.equal(permRow(PEDRO.email), null, 'not added while off');
    const X = await exportTiles(u.page); assert.deepEqual(Object.entries(X.tiles).filter(([, t]) => t.locked).map(([k]) => k), []);
    assert.deepEqual(u.errors, []);
  } finally { await u.ctx.close(); }
});

test('Administration → User permissions (a phone): on, users by email, a chip per feature; Save: the list (version 2) and the sheet\'s tab', async () => {
  assert.ok(admin && team1, 'the list made');
  const { page: pg, errors } = admin;
  await closeAll(pg); await pg.evaluate(() => document.getElementById('settingsBtn').click()); await pg.waitForTimeout(400);
  await pg.evaluate(() => document.getElementById('goAdmin').click()); await pg.waitForTimeout(400);
  await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await until(pg, () => !document.getElementById('admMain').hidden, null, 20); await pg.waitForTimeout(600);
  // User permissions: its section opened (the sections fold), on, two users
  await pg.evaluate(() => { const h = document.querySelector('#admPermBox > h3'); if (document.getElementById('admPermBox').classList.contains('shut')) h.click(); });
  assert.equal(await pg.evaluate(() => document.getElementById('admPermOn').checked), false, 'off, as the sheet says');
  await pg.check('#admPermOn');
  await pg.fill('#admPermEmail', 'not an email'); await pg.click('#admPermAdd'); await pg.waitForTimeout(200);
  assert.ok((await toasts(pg)).some((t) => /Type the user.s email/.test(t)), 'a wrong email refused');
  for (const e of [JUAN.email, PEDRO.email.toUpperCase()]) { await pg.fill('#admPermEmail', e); await pg.click('#admPermAdd'); await pg.waitForTimeout(150); }
  const cards = await pg.evaluate(() => [...document.querySelectorAll('#admPermList [data-e]')].map((c) => ({ e: c.dataset.e, on: [...c.querySelectorAll('[data-pf]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.pf), chips: c.querySelectorAll('[data-pf]').length })));
  assert.deepEqual(cards, [{ e: JUAN.email, on: ['kmz'], chips: 7 }, { e: PEDRO.email, on: ['kmz'], chips: 7 }], 'a new user: what a user not listed has (KMZ export), a chip for each of the 7 features');
  await pg.click(`#admPermList [data-e="${JUAN.email}"] [data-pf="plan"]`); await pg.click(`#admPermList [data-e="${JUAN.email}"] [data-pf="admin"]`);
  const d = await pg.evaluate(() => window.__polecam.permDraft());
  assert.equal(d.on, true); assert.deepEqual(d.users[JUAN.email].f, { kmz: true, plan: true, exp: false, cef: false, edit: false, tpl: false, admin: true }); assert.deepEqual(d.chg.sort(), [JUAN.email, PEDRO.email].sort());
  // a phone's width: the cards wrap, nothing sideways
  const box = await pg.evaluate(() => { const b = document.getElementById('admPermBox').getBoundingClientRect(), L = [...document.querySelectorAll('#admPermList .chip')].map((c) => c.getBoundingClientRect()); return { chipsIn: L.every((r) => r.right <= b.right + 1 && r.left >= b.left - 1), sideways: document.scrollingElement.scrollWidth > innerWidth + 1 }; });
  assert.ok(box.chipsIn && !box.sideways, JSON.stringify(box));
  await pg.evaluate(() => document.getElementById('admPermBox').scrollIntoView({ block: 'start' })); await pg.waitForTimeout(200);
  if (process.env.SHOTS) await pg.screenshot({ path: path.join(process.env.SHOTS, 'user-permissions-admin-phone.png') });
  await pg.evaluate(() => document.getElementById('admSave').click());
  await answer(pg, 'OK'); await pg.waitForTimeout(800);
  await until(pg, () => { const t = window.__polecam.S.team; return !!(t && t.rev === 2 && t.perms); }, null, 20);
  adminTeam = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__polecam.S.team)));
  assert.deepEqual(adminTeam.perms.u, { [JUAN.email]: 'PA' }, 'the list: Juan with Plan drawing and Team admin (Pedro as a user not listed: not carried)');
  assert.equal(adminTeam.perms.on, true);
  assert.equal(setting('User permissions'), 'Yes', 'the sheet\'s Settings → User permissions = Yes');
  const J = permRow(JUAN.email), P = permRow(PEDRO.email);
  assert.ok(J && P, 'both rows written to the tab');
  assert.deepEqual([J['KMZ export'], J['Plan drawing'], J['Other exports'], J['CEF plan'], J['Drawing editing'], J['Client templates'], J['Team admin']], ['Yes', 'Yes', 'No', 'No', 'No', 'No', 'Yes']);
  assert.deepEqual([P['KMZ export'], P['Plan drawing'], P['Team admin']], ['Yes', 'No', 'No']);
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(J.Updated) && /Set in G-eSAA by ana@demo-telco\.example/.test(J.Notes), JSON.stringify(J));
  const iPerm = sheetLog.findIndex((x) => x.post === 'setPerms'), iList = sheetLog.findIndex((x, i) => i > iPerm && x.post === 'setList');
  assert.ok(iPerm >= 0 && iList > iPerm, 'setPerms, then the list (version 2), sent to the sheet');
  const p = await perm(pg); assert.equal(p.pend, null, 'nothing waiting to be sent'); assert.equal(p.admin, true, 'the admin phone: everything');
  // the admin opens it again: the sheet's tab read back (both users, the switch on)
  await closeAll(pg); await pg.evaluate(() => document.getElementById('settingsBtn').click()); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.getElementById('goAdmin').click()); await pg.waitForTimeout(300);
  await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await until(pg, () => !document.getElementById('admMain').hidden, null, 20); await pg.waitForTimeout(1500);
  const d2 = await pg.evaluate(() => window.__polecam.permDraft());
  assert.equal(d2.on, true); assert.equal(d2.sheet, true); assert.deepEqual(Object.keys(d2.users).sort(), [JUAN.email, PEDRO.email].sort()); assert.deepEqual(d2.chg, []);
  await closeAll(pg);
  assert.deepEqual(errors, []);
});

test('a user not listed (the default): Survey and KMZ export only; locked, refused and said everywhere; the list and the row from the sheet', async () => {
  assert.ok(adminTeam && adminTeam.perms, 'the admin saved permissions');
  const { ctx, page, errors } = await open({ state: userState({ ...PEDRO, email: 'rosa@demo-contractor.example', name: 'Rosa Cruz' }, team1) }); // (joined at version 1)
  try {
    await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(600);
    await until(page, () => window.__polecam.S.team.rev === 2, null, 20); // (version 2 came from the sheet, checked against the list's key)
    const p = await perm(page);
    assert.deepEqual(p.list, { ...adminTeam.perms }, 'the list version 2 with its permissions');
    assert.equal(p.state.why, 'sheet'); assert.equal(p.state.on, true);
    assert.deepEqual(Object.entries(p.ok).filter(([, v]) => v).map(([k]) => k), ['survey', 'kmz'], 'Survey and KMZ export only');
    assert.ok(permRow('rosa@demo-contractor.example'), 'a user not listed is added to the tab at the first sync (the admin then sees everyone)');
    const X = await exportTiles(page);
    assert.deepEqual(Object.entries(X.tiles).filter(([, t]) => !t.locked).map(([k]) => k).sort(), ['doBackup', 'doKmz'], 'only KMZ (and the backup: Survey) open');
    assert.equal(X.tiles.doDxf.small, '🔒 Ask your admin to allow Plan drawing'); assert.equal(X.tiles.doBoq.small, '🔒 Ask your admin to allow Other exports');
    assert.ok(!('*all' in X.tiles) && X.picks.length === 0, 'Everything and the quick picks hold no locked tile');
    assert.deepEqual(X.sel, ['doKmz'], 'the first tile allowed picked');
    assert.ok(!X.sideways);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'user-permissions-export-phone.png') });
    // a tap on a locked tile; a click() of its row's own button; Several at once with a locked one: refused, said, nothing made
    const t0 = (await toasts(page)).length, r0 = await nRefused(page);
    await page.click('#export [data-xt="doDxf"]', { force: true }); await page.waitForTimeout(200); // (aria-disabled: a tap still says what to do)
    await page.evaluate(() => { document.getElementById('doDxf').click(); document.getElementById('doBoq').click(); document.getElementById('doCsv').click(); }); await page.waitForTimeout(400);
    assert.deepEqual(await refused(page, r0), ['plan:doDxf', 'plan:doDxf', 'exp:doBoq', 'exp:doCsv'], 'the tile tapped, its row\'s button and two others clicked: each refused');
    const said = (await toasts(page)).slice(t0);
    assert.ok(said.includes('Ask your admin to allow Plan drawing') && said.includes('Ask your admin to allow Other exports'), JSON.stringify(said));
    assert.equal(await page.evaluate(() => window.__builds.length), 0, 'no plan built');
    assert.equal(await page.evaluate(() => document.getElementById('resultBox').hidden), true, 'no file made');
    // the rows of a locked feature, when shown: 🔒 and what to do
    assert.equal(await page.evaluate(() => { const c = document.getElementById('dxfCard'); return c.classList.contains('permlock') && c.querySelector('.permline').textContent; }), '🔒 Ask your admin to allow Plan drawing');
    // the Drawing: Edit refused (the switch, E, the hook), ✎ Edit route and Undo refused; View stays
    await drawing(page);
    assert.equal(await page.evaluate(() => document.getElementById('drawModeEdit').classList.contains('permlock')), true, 'Edit shown locked');
    assert.equal(await page.evaluate(() => document.getElementById('drawDxf').classList.contains('permlock')), true, 'Export plan shown locked');
    const t1 = (await toasts(page)).length, r1 = await nRefused(page);
    await page.click('#drawModeEdit', { force: true }); await page.waitForTimeout(200);
    await page.keyboard.press('e'); await page.waitForTimeout(200);
    const m = await page.evaluate(() => window.__polecam.drwMode('edit'));
    assert.equal(m.mode, 'view', 'View stays');
    await page.evaluate(() => window.__polecam.drwEdit(true)); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__polecam.drwEd().on), false, '✎ Edit route refused');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200); // (Undo's button is greyed with nothing to undo; Ctrl + Z still asks)
    await page.click('#drawDxf', { force: true }); await page.waitForTimeout(300);
    assert.deepEqual(await refused(page, r1), ['edit:drawModeEdit', 'edit:key', 'edit:test', 'edit:route', 'edit:undo', 'plan:drawDxf'], 'Edit (its button, E, a hook), ✎ Edit route, Undo, Export plan: each refused');
    const said2 = (await toasts(page)).slice(t1);
    assert.ok(said2.includes('Ask your admin to allow Drawing editing') && said2.includes('Ask your admin to allow Plan drawing'), JSON.stringify(said2));
    assert.equal(await page.evaluate(() => document.getElementById('export').hidden), true, 'Export plan did not open Export');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'user-permissions-drawing-phone.png') });
    // the CEF plan, the splicing details, Invite a coworker: refused; project share (KMZ export): allowed
    await closeAll(page);
    const t2 = (await toasts(page)).length, r2 = await nRefused(page);
    assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { tab: 'export' })), false, 'the CEF editor not opened');
    assert.equal(await page.evaluate(async () => !!(await window.__polecam.splice.open())), false, 'the splicing details not opened');
    await page.evaluate(() => document.getElementById('settingsBtn').click()); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.getElementById('inviteBtn').classList.contains('permlock')), true);
    await page.click('#inviteBtn', { force: true }); await page.waitForTimeout(300);
    assert.deepEqual(await refused(page, r2), ['cef:open', 'plan:splice', 'admin:inviteBtn'], 'the CEF plan, the splicing details, Invite a coworker: each refused');
    const said3 = (await toasts(page)).slice(t2);
    assert.ok(said3.includes('Ask your admin to allow Team admin'), JSON.stringify(said3));
    assert.equal(await page.evaluate(() => document.getElementById('permMe').textContent), 'Your features: Survey, KMZ export. 🔒 Plan drawing, Other exports, CEF plan, Drawing editing, Client templates, Team admin: ask your admin.');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'user-permissions-settings-phone.png') });
    await closeAll(page);
    const t3 = (await toasts(page)).length;
    await page.evaluate(() => { window.__polecam.shareProject('DEMO PLAN A'); }); await page.waitForTimeout(500);
    assert.ok(!(await toasts(page)).slice(t3).some((t) => /^Ask your admin/.test(t)), 'project share allowed (KMZ export)');
    await page.evaluate(() => { const d = document.querySelector('#askBox:not([hidden]) .row button'); if (d) d.click(); }); await page.waitForTimeout(300);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a user allowed Plan drawing: the plan made; an export under way keeps what was allowed when it started; the list version and the row from the sheet', async () => {
  const { ctx, page, errors } = await open({ state: userState(JUAN, team1), desk: true });
  try {
    await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(600);
    await until(page, () => window.__polecam.S.team.rev === 2, null, 20);
    let p = await perm(page);
    assert.equal(p.state.why, 'sheet'); assert.deepEqual(Object.entries(p.ok).filter(([, v]) => v).map(([k]) => k), ['survey', 'kmz', 'plan', 'admin']);
    assert.deepEqual(p.sheet.row, { kmz: true, plan: true, exp: false, cef: false, edit: false, tpl: false, admin: true });
    const X = await exportTiles(page);
    assert.equal(X.tiles.doDxf.locked, false); assert.equal(X.tiles.xOnePdf.locked, false); assert.equal(X.tiles.doBoq.locked, true);
    // Several at once picked (the plan and the KMZ), then the sheet blocks Plan drawing (a sync while Export is open): the ZIP is refused before it
    // starts (nothing made half), the plan's tile locked and unpicked
    assert.deepEqual(await pickTiles(page, ['doDxf', 'doKmz']), ['doDxf', 'doKmz']);
    cell(JUAN.email, 'Plan drawing', 'No'); await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.querySelector('#export [data-xt="doDxf"]').classList.contains('permlock')), true, 'the tile locked at once');
    const r0 = await nRefused(page), b0 = await page.evaluate(() => window.__builds.length);
    await page.evaluate(() => document.getElementById('xMultiGo').click()); await page.waitForTimeout(500);
    assert.deepEqual(await refused(page, r0), ['plan:several']); assert.equal(await page.evaluate(() => window.__builds.length), b0, 'no plan built');
    assert.equal(await page.evaluate(() => document.getElementById('resultBox').hidden), true, 'no ZIP');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#export .xtile[aria-pressed=true]')].map((b) => b.dataset.xt)), ['doKmz'], 'what is allowed stays picked');
    cell(JUAN.email, 'Plan drawing', 'Yes'); await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(600);
    assert.equal((await perm(page)).ok.plan, true);
    assert.deepEqual(await pickTiles(page, ['doDxf']), ['doDxf']); // (the plan alone again)
    // the plan made while a sync blocks Plan drawing (in the middle of the export): it is made whole; blocked after
    const tx = (await toasts(page)).length, rx = await nRefused(page);
    await page.evaluate(() => { window.__duringBuild = () => { const S = window.__polecam.S; S.permSheet = { ...S.permSheet, row: { ...S.permSheet.row, plan: false } }; window.__midPerm = window.__polecam.perm(); }; });
    await page.evaluate(() => document.getElementById('doDxf').click());
    await until(page, () => window.__builds.length > 0 && document.getElementById('busy').hidden, null, 120);
    await page.waitForTimeout(800);
    const mid = await page.evaluate(() => window.__midPerm);
    assert.equal(mid.hold, true, 'held while the export ran'); assert.equal(mid.ok.plan, true, 'what was allowed when it started');
    assert.ok(await page.evaluate(() => !document.getElementById('resultBox').hidden && /\.zip · /.test(document.getElementById('resultName').textContent)), 'the plan made (Your file is ready)');
    p = await perm(page); assert.equal(p.hold, false); assert.equal(p.ok.plan, false, 'blocked once the export ended');
    assert.ok(!(await toasts(page)).slice(tx).some((t) => /^Ask your admin/.test(t)) && (await nRefused(page)) === rx, 'nothing refused meanwhile');
    // Team admin allowed: Invite a coworker not locked
    await closeAll(page); await page.evaluate(() => document.getElementById('settingsBtn').click()); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.getElementById('inviteBtn').classList.contains('permlock')), false);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the sheet edited by hand reaches the phone at its next sync (the sheet wins); offline, the app reopened: the row kept', async () => {
  const ctxState = userState(PEDRO, adminTeam);
  let { ctx, page, errors } = await open({ state: ctxState });
  try {
    await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(500);
    assert.equal((await perm(page)).ok.cef, false);
    cell(PEDRO.email, 'CEF plan', 'Yes'); cell(PEDRO.email, 'Other exports', true); cell(PEDRO.email, 'KMZ export', 'No'); // (typed in the tab; a ticked box)
    await closeAll(page); await page.evaluate(() => document.getElementById('settingsBtn').click()); await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('cloudSyncBtn').click()); await page.waitForTimeout(900);
    let p = await perm(page);
    assert.deepEqual(Object.entries(p.ok).filter(([, v]) => v).map(([k]) => k), ['survey', 'exp', 'cef'], 'the sheet\'s row as typed: KMZ blocked, Other exports and CEF plan allowed');
    assert.equal(p.list.u[PEDRO.email], undefined, 'the list says nothing of Pedro: the sheet wins');
    const X = await exportTiles(page);
    assert.equal(X.tiles.doKmz.locked, true); assert.equal(X.tiles.doBoq.locked, false);
    const t0 = (await toasts(page)).length;
    await page.evaluate(() => { window.__polecam.shareProject('DEMO PLAN A'); }); await page.waitForTimeout(300);
    assert.ok((await toasts(page)).slice(t0).includes('Ask your admin to allow KMZ export'), 'project share goes with KMZ export');
    // offline: the app closed and opened again, the sheet not answering: what it last read is kept
    await page.evaluate(() => { window.__offline = true; });
    const state = await page.evaluate(() => localStorage.getItem('polecam.settings'));
    await ctx.close();
    ({ ctx, page, errors } = await open({ state: JSON.parse(state) }));
    await page.evaluate(() => { window.__offline = true; });
    cell(PEDRO.email, 'CEF plan', 'No'); // (changed in the sheet meanwhile: not read without signal)
    p = await perm(page);
    assert.equal(p.state.why, 'sheet'); assert.deepEqual(Object.entries(p.ok).filter(([, v]) => v).map(([k]) => k), ['survey', 'exp', 'cef'], 'kept for use without signal');
    const Y = await exportTiles(page); assert.equal(Y.tiles.doKmz.locked, true); assert.equal(Y.tiles.doBoq.locked, false);
    // back online: the next sync follows the sheet
    await page.evaluate(() => { window.__offline = false; }); await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(500);
    assert.equal((await perm(page)).ok.cef, false);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the admin phone and the admin company\'s users have everything', async () => {
  const { ctx, page, errors } = await open({ state: userState(MARIA, adminTeam) }); // (the admin company, no admin users listed: anyone of it with the PIN)
  try {
    await page.evaluate(() => window.__polecam.cloudSync(true)); await page.waitForTimeout(400);
    const p = await perm(page);
    assert.equal(p.admin, true); assert.equal(p.state.why, 'admin'); assert.deepEqual(FEATS.filter((k) => !p.ok[k]), []);
    assert.equal(permRow(MARIA.email), null, 'the admin company is not added to the tab');
    const X = await exportTiles(page); assert.deepEqual(Object.entries(X.tiles).filter(([, t]) => t.locked).map(([k]) => k), []);
    await drawing(page); assert.equal((await page.evaluate(() => window.__polecam.drwMode('edit'))).mode, 'edit');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the admin puts a user back (×) and turns permissions off; not written at once: sent at the next sync; the phones follow', async () => {
  assert.ok(admin, 'the admin phone');
  const { page: pg, errors, net } = admin;
  await closeAll(pg); await pg.evaluate(() => document.getElementById('settingsBtn').click()); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.getElementById('goAdmin').click()); await pg.waitForTimeout(300);
  await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await until(pg, () => !document.getElementById('admMain').hidden, null, 20); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { const h = document.querySelector('#admPermBox > h3'); if (document.getElementById('admPermBox').classList.contains('shut')) h.click(); });
  const d0 = await pg.evaluate(() => window.__polecam.permDraft());
  assert.deepEqual(d0.users[PEDRO.email].f, { kmz: false, plan: false, exp: true, cef: false, edit: false, tpl: false, admin: false }, 'Pedro\'s row as the sheet has it (typed by hand)');
  await pg.click(`#admPermList [data-e="${PEDRO.email}"] [data-pa="del"]`); await pg.uncheck('#admPermOn');
  net.noPerms = true; const t0 = (await toasts(pg)).length;
  await pg.evaluate(() => document.getElementById('admSave').click()); await answer(pg, 'OK'); await pg.waitForTimeout(800);
  await until(pg, () => window.__polecam.S.team.rev === 3, null, 20);
  const T3 = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__polecam.S.team)));
  assert.deepEqual(T3.perms, { on: false, at: T3.perms.at, u: { [JUAN.email]: 'PA' } }, 'the list: off, Juan kept');
  assert.ok((await toasts(pg)).slice(t0).some((x) => /^User permissions not written to the online sheet/.test(x)), 'said');
  let p = await perm(pg); assert.deepEqual(p.pend && { users: p.pend.users, gone: p.pend.gone, on: p.pend.on }, { users: [], gone: [PEDRO.email], on: false }, 'kept to be sent again');
  assert.equal(setting('User permissions'), 'Yes', 'not written yet'); assert.equal(permRow(PEDRO.email)['Other exports'], true);
  // the next sync sends it
  net.noPerms = false; await pg.evaluate(() => window.__polecam.cloudSync(true)); await pg.waitForTimeout(800);
  await until(pg, () => !window.__polecam.perm().pend, null, 20);
  assert.equal(setting('User permissions'), 'No', 'Settings → User permissions = No');
  const P = permRow(PEDRO.email); assert.deepEqual(['KMZ export', 'Plan drawing', 'Other exports', 'CEF plan'].map((h) => P[h]), ['', '', '', ''], 'Pedro\'s feature cells cleared (what a user not listed has)');
  assert.ok(/^Back to what a user not listed has, in G-eSAA by ana@demo-telco\.example$/.test(P.Notes), P.Notes);
  assert.deepEqual(errors, []);
  // Pedro's phone (joined at version 1): off: every feature again
  const u = await open({ state: userState(PEDRO, team1) });
  try {
    await u.page.evaluate(() => window.__polecam.cloudSync(true)); await u.page.waitForTimeout(600);
    await until(u.page, () => window.__polecam.S.team.rev === 3, null, 20);
    p = await perm(u.page); assert.equal(p.state.on, false); assert.deepEqual(FEATS.filter((k) => !p.ok[k]), [], 'off: every user has every feature');
    assert.equal(await u.page.evaluate(() => document.getElementById('permMe').hidden), true);
    assert.deepEqual(u.errors, []);
  } finally { await u.ctx.close(); }
});
