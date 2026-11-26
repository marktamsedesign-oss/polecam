/* beta 7.16 (CEF drawing): the CEF plan editor (vendor/cef/cef.html, the real page) in a browser, framed by a stand-in for the app (it hands the
   editor a made-up plan and keeps what it saves), for the owner's items on the CEF plan's drawing.
   Run: node --test tests/cef-drawing.spec.cjs (or python3 tests/run_all.py --only cef-drawing). SHOTS_DIR=folder keeps screenshots.
   - (2) An exit conduit's form has **Exit conduit: Concrete encasement | Conduits only, no concrete**: the choice reaches the plan (el.conc false,
     back to none), its hint and its name say so, the drawing follows, Undo takes it back; a phone (412 x 915) and a computer (1280 x 900).
   The plans are made by the engine in Node (vendor/cef 30_core.js); every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..'), SHOTS = process.env.SHOTS_DIR || '';
/* the made-up plans, made by the engine in Node */
const E = vm.createContext({ console, Math: Object.create(Math), JSON }); E.self = E; E.window = E;
{ let seed = 11; E.Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
for (const f of ['30_core.js']) vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'cef', f), 'utf8'), E, { filename: f });
const plan = (code) => JSON.parse(vm.runInContext(`JSON.stringify((() => { ${code} })())`, E));
const NAMED = `const S = sampleSite(); S.sample = false; Object.assign(S.site, { name: 'DEMO SITE', id: 'DEMO-0001', link: 'DEMO PROJECT' }); return S;`;
/* a stand-in for the app: what cef.html asks of window.parent.__cefHost */
const HOST = `<!doctype html><html><head><meta charset="utf-8"><title>CEF test host</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>
<script>window.SAVED = []; window.__cefHost = { init: async () => ({ app: { by: 'Juan Dela Cruz', checkedBy: 'Maria Santos', org: 'DEMO CONTRACTOR', link: 'DEMO PROJECT', guide: false, focPct: 10 }, sketch: JSON.stringify(window.SKETCH), photos: {}, logos: {} }),
  save: (s) => { window.SAVED.push(s); }, pref: () => {}, setSign: () => {}, jobDone: () => {}, photoDims: () => null };</script></head>
<body><iframe id="f"></iframe><script>fetch('/__sk.json').then((r) => r.json()).then((o) => { window.SKETCH = o; document.getElementById('f').src = '/vendor/cef/cef.html'; });</script></body></html>`;
let server, browser, base, SK = null;
before(async () => {
  server = http.createServer((req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (rel === '/__host.html') { res.setHeader('Content-Type', 'text/html'); res.end(HOST); return; }
      if (rel === '/__sk.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(SK)); return; }
      const file = path.resolve(root, '.' + rel); if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });
/** the editor with the plan sk, at a size: { ctx, page, fr (the editor's frame), errors } */
async function open(sk, vp) {
  SK = sk; const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '__host.html');
  let fr = null; for (let i = 0; i < 100 && !fr; i++) { await page.waitForTimeout(100); fr = page.frames().find((f) => /vendor\/cef\/cef\.html/.test(f.url())); }
  await fr.waitForFunction(() => window.CEF && CEF.ready && CEF.ready(), null, { timeout: 30000 });
  return { ctx, page, fr, errors };
}
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

for (const [dev, vp] of [['phone', { width: 412, height: 915 }], ['computer', { width: 1280, height: 900 }]]) {
  test(`(2) ${dev}: an exit conduit's form offers its conduits only, with no concrete; the plan, its name, its hint and its drawing follow; Undo takes it back`, async () => {
    const { ctx, page, fr, errors } = await open(plan(NAMED), vp);
    const id = await fr.evaluate(() => { const e = ROOT.els.find((q) => q.t === 'exit' && q.st === 'P'); sel = { k: 'el', id: e.id }; tab = 'home'; refresh(true); return e.id; });
    const opts = await fr.$$eval('select[data-k="el.conc"] option', (o) => o.map((q) => [q.value, q.textContent, q.selected]));
    assert.deepEqual(opts, [['1', 'Concrete encasement', true], ['0', 'Conduits only, no concrete', false]], 'the choice, concrete as before');
    assert.match(await fr.evaluate(() => document.querySelector('.insp').textContent), /A concrete block with the two 114\.3 mm pipes/);
    await fr.selectOption('select[data-k="el.conc"]', '0'); await page.waitForTimeout(300);
    const after1 = await fr.evaluate((id) => { const e = ROOT.els.find((q) => q.id === id); return { conc: e.conc, name: elLabel(ROOT, e), hint: document.querySelector('.insp').textContent, ph: document.getElementById(fid('el.name')).placeholder, saved: JSON.parse(CEF.sketch()).els.find((q) => q.id === id).conc }; }, id);
    assert.equal(after1.conc, false); assert.equal(after1.saved, false, 'kept with the plan');
    assert.equal(after1.name, 'PROPOSED EXIT CONDUIT, NO CONCRETE'); assert.equal(after1.ph, 'PROPOSED EXIT CONDUIT, NO CONCRETE');
    assert.match(after1.hint, /The two 114\.3 mm conduits only, no concrete/);
    await fr.evaluate(() => setView('iso')); await page.waitForTimeout(400); await shot(page, `cef-exit-bare-${dev}`);
    assert.ok(await fr.evaluate(() => document.getElementById('svgIso').innerHTML.length > 20000), 'the isometric is drawn');
    await fr.evaluate(() => undo()); await page.waitForTimeout(200);
    assert.equal(await fr.evaluate((id) => ROOT.els.find((q) => q.id === id).conc, id), undefined, 'Undo: with its concrete again');
    await fr.evaluate((id) => { sel = { k: 'el', id }; refresh(true); }, id);
    await fr.selectOption('select[data-k="el.conc"]', '0'); await page.waitForTimeout(200); await fr.selectOption('select[data-k="el.conc"]', '1'); await page.waitForTimeout(200);
    assert.equal(await fr.evaluate((id) => 'conc' in ROOT.els.find((q) => q.id === id), id), false, 'Concrete encasement: nothing kept, as a plan before');
    assert.deepEqual(errors, []); await ctx.close();
  });
}
