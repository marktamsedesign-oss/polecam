/* (stage 11, small) The owner: "remove the PIN requirement for deletion of completed sites. allow each user to delete as they needed."
   Run: node --test tests/delete-completed.spec.cjs (or python3 tests/run_all.py --only delete-completed).
   A user's phone of a made-up company list (an approval key in its policies; not the admin's phone), with completed projects:
   - Delete on a completed survey's card (Projects › Completed): the usual question at once ("… This can't be undone."), no request code and
     no admin PIN asked; Delete project removes it and its records. Keep keeps it.
   - Delete this project… in Project details of the open completed PAT: the usual confirmation, then deleted; no approval asked.
   - Undo complete of a completed survey still needs an admin's approval (not asked to change): the request code, its text names
     Administration › Approve a request; a wrong code: not reopened; the admin's 6-digit code (worked out here as the admin's phone does):
     Undo complete? › Undo reopens it.
   - Administration's tool reads "Approve a request" and says what it serves (the reopen; an older phone's delete); the Tutorial's Delete a project
     no longer asks for a code.
   No page errors. Uses an isolated browser profile and a local HTTP server on a free port; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let server, browser, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if (rel === '/org.json') { res.writeHead(404).end(); return; }
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

const OTP = 'DemoApprovalKey_0000000000000000'; // (the list's approval key, made up)
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const TEAM = { t: 'polecam-team', id: 'DEMOLIST0001', name: 'DEMO TELCO list', rev: 1, admins: [], key: 'BDemoListPublicKeyMadeUp0000000000000000000000000000000000000000000000000000000000000000', co: ['DEMO TELCO', 'DEMO CONTRACTOR'], pol: { owner: 'DEMO TELCO', otp: OTP } };
const A = 'DEMO DONE SURVEY', B = 'DEMO DONE REOPEN', P = 'DEMO DONE PAT', T0 = '2026-11-01T08:00:00.000Z', DONE = '2026-11-02T08:00:00.000Z';
const rec = (id, project, poleId, lat, lon, extra) => ({ id, project, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, created: T0, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric' }, ...(extra || {}) });
const RECS = [rec('a1', A, 'CC-9001', 7.10465, 125.6010), rec('a2', A, 'CC-9002', 7.10470, 125.6050), rec('b1', B, 'CC-9011', 7.10565, 125.6110),
  rec('p1', P, 'CC-9021', 7.10665, 125.6210, { defs: [{ id: 'd1', k: 'Leaning pole', stage: 'PAT', st: 'found' }] })];

/** The approval code the admin's phone gives for a request code (app.js approvalCode: HMAC-SHA-256 with the list's approval key). */
function approvalCode(req) {
  const h = crypto.createHmac('sha256', Buffer.from(OTP, 'base64url')).update(`polecam-delete|${String(req).toUpperCase().replace(/[^A-Z0-9]/g, '')}`).digest();
  return String((((h[0] & 0x7f) << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) % 1000000).padStart(6, '0');
}
async function until(page, fn, arg, s) { for (let i = 0; i < (s || 20) * 5; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(200); } throw new Error(`not so after ${s || 20} s: ${fn}`); }

async function open(project) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, USER, TEAM, A, B, P, DONE, project }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const sv = { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: [], completedAt: DONE };
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [A, B, P], project, sampleDone: true, saveCheck: false, zone: 51, user: USER, team: TEAM, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true,
      meta: { [A]: { ...sv }, [B]: { ...sv }, [P]: { mode: 'acceptance', stage: 'PAT', contractor: 'DEMO CONTRACTOR', site: 'DEMO SITE', completedAt: DONE } } }));
  }, { RECS, USER, TEAM, A, B, P, DONE, project });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close();
    window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true });
    window.__pinAsked = []; const pb = document.getElementById('pinBox'); new MutationObserver(() => { if (!pb.hidden) window.__pinAsked.push(document.getElementById('pinTitle').textContent); }).observe(pb, { attributes: true, attributeFilter: ['hidden'] }); });
  assert.equal(await page.evaluate(() => !!window.__polecam.S.team && window.__polecam.S.team.id), 'DEMOLIST0001', 'the phone has the made-up company list');
  return { ctx, page, errors };
}
const projects = (page) => page.evaluate(() => window.__polecam.S.projects.slice());
const askShown = (page) => page.evaluate(() => (document.getElementById('askBox').hidden ? null : { title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, btns: [...document.querySelectorAll('#askBox .row button')].map((b) => b.textContent.trim()) }));
async function answer(page, label) {
  await until(page, () => !document.getElementById('askBox').hidden, null, 15);
  await page.evaluate((l) => { const b = [...document.querySelectorAll('#askBox .row button')].find((x) => x.textContent.trim() === l); b.click(); }, label); await page.waitForTimeout(400);
}
async function openProjects(page) { await page.evaluate(() => document.getElementById('projectBtn').click()); await page.waitForTimeout(600); }
async function showAll(page) { await page.evaluate(() => { const c = [...document.querySelectorAll('#tmFilter *')].find((x) => /^All ·/.test(x.textContent.trim()) && !x.children.length); if (c) c.click(); }); await page.waitForTimeout(400); }

test('a completed project is deleted from its card with the usual question only: no request code, no admin PIN', async () => {
  const { ctx, page, errors } = await open(P);
  try {
    await openProjects(page); await showAll(page);
    const del = `button.tmtool.del[aria-label="Delete ${A}"]`;
    assert.equal(await page.locator(del).count(), 1, 'the completed project\'s card has Delete');
    await page.click(del); await until(page, () => !document.getElementById('askBox').hidden, null, 10);
    let q = await askShown(page);
    assert.equal(q.title, `Delete “${A}”?`); assert.match(q.text, /Its 2 records, photos and offline maps are removed from this phone\. .*This can't be undone\./);
    assert.deepEqual(q.btns, ['Keep', 'Delete project']);
    assert.deepEqual(await page.evaluate(() => window.__pinAsked), [], 'no admin approval asked');
    await answer(page, 'Keep');
    assert.ok((await projects(page)).includes(A), 'Keep: kept');
    await page.click(del); await answer(page, 'Delete project'); await page.waitForTimeout(600);
    assert.ok(!(await projects(page)).includes(A), 'deleted');
    assert.equal(await page.evaluate((A) => window.__polecam.points.filter((p) => p.project === A).length, A), 0, 'its records too');
    assert.deepEqual(await page.evaluate(() => window.__pinAsked), [], 'no admin approval asked');
    assert.ok(!(await page.evaluate(() => window.__toasts)).some((t) => /Not approved/.test(t)));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Delete this project… of the open completed PAT (Project details): the usual confirmation, then deleted; no approval', async () => {
  const { ctx, page, errors } = await open(P);
  try {
    await openProjects(page);
    assert.equal(await page.evaluate(() => window.__polecam.S.project), P);
    await page.evaluate(() => document.getElementById('delProject').click()); await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => window.__pinAsked), [], 'no admin approval asked');
    assert.equal(await page.evaluate(() => document.getElementById('delProjConfirm').hidden), false, 'the confirmation shows at once');
    assert.match(await page.evaluate(() => document.getElementById('delProjText').textContent), new RegExp(`^Delete "${P}" with its 1 element, photos and offline maps\\? .*This can't be undone\\.$`));
    await page.evaluate(() => document.getElementById('delProjYes').click()); await page.waitForTimeout(800);
    assert.ok(!(await projects(page)).includes(P), 'deleted');
    assert.equal(await page.evaluate((P) => window.__polecam.points.filter((p) => p.project === P).length, P), 0, 'its records too');
    assert.deepEqual(await page.evaluate(() => window.__pinAsked), []);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Undo complete still needs the admin\'s approval: the request code names Approve a request; a wrong code refused, the admin\'s code reopens it', async () => {
  const { ctx, page, errors } = await open(B);
  try {
    await openProjects(page);
    const undo = async () => { await page.evaluate(() => document.getElementById('doneBtn').click()); await until(page, () => !document.getElementById('pinBox').hidden, null, 10); };
    await undo();
    const P1 = await page.evaluate(() => ({ title: document.getElementById('pinTitle').textContent, text: document.getElementById('pinText').textContent, code: document.getElementById('pinCode').textContent }));
    assert.equal(P1.title, 'Admin approval needed');
    assert.match(P1.text, new RegExp(`^Reopening the completed project “${B}” needs an admin's approval\\. Send this request code to an admin \\(Settings → Administration → Approve a request\\)`));
    assert.match(P1.code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    await page.fill('#pinInput', approvalCode(P1.code) === '000000' ? '111111' : '000000'); await page.evaluate(() => document.getElementById('pinYes').click()); await page.waitForTimeout(500);
    assert.ok((await page.evaluate(() => window.__toasts)).some((t) => /^Not approved: wrong code or PIN/.test(t)), 'a wrong code: not approved');
    assert.ok(await page.evaluate((B) => !!window.__polecam.S.meta[B].completedAt, B), 'still complete');
    await undo();
    const code = await page.evaluate(() => document.getElementById('pinCode').textContent);
    await page.fill('#pinInput', approvalCode(code)); await page.evaluate(() => document.getElementById('pinYes').click());
    await until(page, () => !document.getElementById('askBox').hidden, null, 10);
    assert.equal((await askShown(page)).title, 'Undo complete?');
    await answer(page, 'Undo');
    assert.equal(await page.evaluate((B) => window.__polecam.S.meta[B].completedAt, B), undefined, 'reopened');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Administration\'s tool is Approve a request (the reopen); the Tutorial\'s Delete a project asks for no code', async () => {
  const { ctx, page, errors } = await open(A);
  try {
    const g = await page.evaluate(() => { const box = document.getElementById('admReq').closest('.group'); return { h: box.querySelector('h3').textContent, hint: box.querySelector('.hint').textContent }; });
    assert.equal(g.h, 'Approve a request');
    assert.match(g.hint, /^A user reopening a completed project \(Undo complete\) gets a request code\./);
    assert.match(g.hint, /Deleting a completed project needs no approval any more/);
    const T = await page.evaluate(() => { const t = (window.GESAA_TUTORIAL || self.GESAA_TUTORIAL).topics; const f = (id) => t.find((x) => x.id === id); return { del: f('delete').steps.map((s) => s.t).join(' '), adm: { title: f('adm-approve').title, steps: f('adm-approve').steps.map((s) => s.t).join(' ') } }; });
    assert.doesNotMatch(T.del, /request code|approval code|admin PIN/, 'Delete a project: no code');
    assert.match(T.del, /A \*\*completed\*\* project is deleted the same way: no admin's approval is needed\./);
    assert.equal(T.adm.title, 'Approve a request');
    assert.match(T.adm.steps, /reopens a completed project \(\*\*Undo complete\*\*\)/);
    assert.match(T.adm.steps, /Administration → \*\*Approve a request\*\*/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
