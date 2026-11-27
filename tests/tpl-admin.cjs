/* (stage 11, templates) Helpers of the template tests (not a test file itself): Administration › Plan templates needs an admin phone of a company list,
   so the browser specs of the templates (plan-templates, client-templates, client-plan-template, cef-company, cef-template) make one here:
   - sheet(gsFile): the real online sheet script on the in-memory spreadsheet and Google Drive of regression/v243/e2e/sheet_env.js (its companies
     made up: DEMO TELCO the admin company, DEMO CONTRACTOR a user's), with route(ctx) answering the app's requests to its web-app address;
   - makeAdmin(browser, base, sh): a new phone makes the company list in the app (Set up a new organisation, the admin PIN 1234, the sheet's
     companies and keys, Save and share the list), then picks DEMO TELCO: returns what it keeps (localStorage), to open again as the admin phone;
   - open(browser, base, o): a phone (o.desk: 1280 x 900, else 390 x 844), with o.state (what the app keeps), o.records (points), o.seed (the
     company plan template on it) and o.sheet (the online sheet answered);
   - admin(page): Administration opened with the PIN, Plan templates unfolded; until, answer, closeAll, toasts.
   Every name, email and place is made up. */
'use strict';
const path = require('node:path');
const assert = require('node:assert/strict');

const SHEET = 'https://script.google.com/macros/s/DEMO-TEMPLATES-SHEET-0001/exec';
const ADMIN = { name: 'Ana Reyes', mobile: '09170000009', email: 'ana@demo-telco.example' };
const PIN = '1234';

/** The online sheet: the real script (gsFile) on the stand-ins; log: what the phones asked; net.down: no answer. */
function sheet(gsFile) {
  process.env.GS_FILE = gsFile;
  const env = require('./regression/v243/e2e/sheet_env.js'), gs = env.load(gsFile);
  gs.setup();
  const tab = (n) => env.world.ss.getSheetByName(n);
  tab('Companies').getRange(1, 1, 3, 2).setValues([['Company', 'Authorization'], ['DEMO TELCO', 'ADMIN'], ['DEMO CONTRACTOR', 'USER']]);
  const log = [], net = { down: false };
  const setting = (k) => { const st = tab('Settings'), r = st.getRange(1, 1, st.getLastRow(), 2).getValues().find((x) => x[0] === k); return r ? r[1] : undefined; };
  const setSetting = (k, v) => { const st = tab('Settings'), L = st.getRange(1, 1, st.getLastRow(), 2).getValues(), i = L.findIndex((x) => x[0] === k); if (i >= 0) st.getRange(i + 1, 2).setValue(v); else st.appendRow([k, v, '']); };
  async function route(ctx) {
    await ctx.route(`${SHEET}**`, async (r) => {
      if (net.down) return r.abort();
      const u = r.request().url(), q = Object.fromEntries(new URL(u).searchParams), post = r.request().method() === 'POST', b = post ? r.request().postData() || '' : '';
      const out = post ? gs.doPost({ postData: { contents: b } }) : gs.doGet({ parameter: q });
      let body = {}; try { body = post ? JSON.parse(b) : {}; } catch (e) { body = {}; }
      log.push(post ? { post: body.action || '?', kind: body.kind || '', size: (body.text || '').length, name: body.name || '', by: body.by || '', client: body.client || '' } : { get: q.dxfseed ? 'dxfseed' : q.cefseed ? 'cefseed' : 'read', v: q.v || '' });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out.getContent() });
    });
  }
  return { env, gs, world: env.world, tab, setting, setSetting, log, net, route, url: SHEET, keys: () => ({ read: gs.settings_()['Read key'], admin: gs.settings_()['Admin key'] }) };
}

async function until(page, fn, arg, s) { for (let i = 0; i < (s || 30) * 5; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(200); } throw new Error(`not so after ${s || 30} s: ${fn}`); }
const closeAll = async (page) => { for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => document.querySelectorAll('section.sheet:not([hidden])').length))) return; await page.goBack(); await page.waitForTimeout(400); } };
/** The open question answered with the button labelled so (else its primary one). */
async function answer(page, label) {
  await until(page, () => !document.getElementById('askBox').hidden, null, 20);
  const txt = await page.evaluate(() => document.getElementById('askText').textContent);
  await page.evaluate((l) => { const b = [...document.querySelectorAll('#askBox .row button')].find((x) => x.textContent.trim() === l) || document.querySelector('#askBox .row button.primary'); b.click(); }, label); await page.waitForTimeout(300);
  return txt;
}
const toasts = (page) => page.evaluate(() => (window.__toasts || []).slice());

/** A phone. o.state: what the app keeps (null: a new phone); o.records / o.seed: put on it; o.sheet: its requests to the online sheet answered. */
async function open(browser, base, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: true });
  if (o.sheet) await o.sheet.route(ctx);
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u === `${base}org.json`) return r.fulfill({ status: 404, body: '' }); if (u.startsWith(base)) return r.continue(); if (o.sheet && u.startsWith(o.sheet.url)) return r.fallback(); return r.abort(); }); // (no org.json: the tests make their own company list)
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (o.state !== null) {
    await page.goto(base + 'manifest.json');
    await page.evaluate(async ({ R, state, seed, extra }) => {
      await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => { const d = r.result, tx = d.transaction(['points', 'packs'], 'readwrite'); (R || []).forEach((x) => tx.objectStore('points').put(x)); if (seed) tx.objectStore('packs').put({ k: '~dxfseed', text: seed }); (extra || []).forEach((x) => tx.objectStore('packs').put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      localStorage.setItem('polecam.settings', JSON.stringify(state));
    }, { R: o.records || [], state: o.state || {}, seed: o.seed || null, extra: o.packs || [] });
  }
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await page.evaluate(() => { window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true }); });
  return { ctx, page, errors };
}

/** A new phone makes the company list (the sheet's companies, its keys), the admin of DEMO TELCO: what it keeps, to open again. */
async function makeAdmin(browser, base, sh) {
  const { ctx, page, errors } = await open(browser, base, { state: null, sheet: sh });
  try {
    await page.fill('#pfName', ADMIN.name); await page.fill('#pfMobile', ADMIN.mobile); await page.fill('#pfEmail', ADMIN.email);
    await page.click('#pfCreateBox summary'); await page.click('#pfCreate'); await page.waitForTimeout(400);
    await page.fill('#admPin', PIN); await page.fill('#admPin2', PIN); await page.click('#admUnlock'); await page.waitForTimeout(700);
    await page.fill('#admName', 'DEMO TELCO list');
    const k = sh.keys();
    await page.evaluate(({ url, rk, ak }) => { document.getElementById('admUrl').value = url; document.getElementById('admReadKey').value = rk; document.getElementById('admWriteKey').value = ak; document.getElementById('admCoRefresh').click(); }, { url: sh.url, rk: k.read, ak: k.admin });
    await until(page, () => document.querySelectorAll('#admCos span').length >= 2, null, 20);
    await page.selectOption('#admOwner', 'DEMO TELCO');
    await page.evaluate(() => document.getElementById('admSave').click());
    await answer(page, 'OK');
    await page.selectOption('#pfCompany', 'DEMO TELCO'); await page.click('#pfSave'); await page.waitForTimeout(1200);
    await until(page, () => { const t = window.__polecam.S.team; return !!(t && t.rev === 1 && window.__polecam.S.user && window.__polecam.S.user.company === 'DEMO TELCO'); }, null, 20);
    assert.deepEqual(errors, [], 'no page error while the list is made');
    return await page.evaluate(() => JSON.parse(localStorage.getItem('polecam.settings')));
  } finally { await ctx.close(); }
}

/** Administration opened (the admin PIN), Plan templates unfolded and shown. */
async function admin(page) {
  await closeAll(page); await page.evaluate(() => document.getElementById('settingsBtn').click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('goAdmin').click()); await page.waitForTimeout(400);
  await page.fill('#admPin', PIN); await page.click('#admUnlock'); await until(page, () => !document.getElementById('admMain').hidden, null, 20); await page.waitForTimeout(500);
  await page.evaluate(() => { const g = document.getElementById('admTplBox'); if (g.classList.contains('shut')) g.querySelector(':scope > h3').click(); g.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200);
}
/** The four slots as Plan templates shows them. */
const slots = (page) => page.evaluate(() => Object.fromEntries(['Geo', 'Cef'].map((k) => [k.toLowerCase(), { pub: document.getElementById(`admTpl${k}PubSum`).textContent, test: document.getElementById(`admTpl${k}TestSum`).textContent,
  get: !document.getElementById(`admTpl${k}PubGet`).hidden, testBtns: ['Down', 'Back', 'Clear', 'Publish'].filter((b) => !document.getElementById(`admTpl${k}${b}`).disabled) }])));

module.exports = { SHEET, ADMIN, PIN, sheet, open, makeAdmin, admin, slots, until, answer, closeAll, toasts };
