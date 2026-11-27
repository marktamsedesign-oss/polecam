/* beta 7.16 (CEF drawing): the CEF plan editor (vendor/cef/cef.html, the real page) in a browser, framed by a stand-in for the app (it hands the
   editor a made-up plan and keeps what it saves), for the owner's items on the CEF plan's drawing.
   Run: node --test tests/cef-drawing.spec.cjs (or python3 tests/run_all.py --only cef-drawing). SHOTS_DIR=folder keeps screenshots.
   - (2) An exit conduit's form has **Exit conduit: Concrete encasement | Conduits only, no concrete**: the choice reaches the plan (el.conc false,
     back to none), its hint and its name say so, the drawing follows, Undo takes it back; a phone (412 x 915) and a computer (1280 x 900).
   - (6) The FOC tool on a made-up plan of two cabins (the owner's chain: Riser > Conduit > Exit Conduit > Porthole > Ladder > Porthole > Ladder >
     Porthole > Ladder > Rack > ODF), tapped on the top view a little off each element, as a finger does (a phone by touch, a computer by mouse):
     each tap snaps to its element, in the chain's order (the exit conduit before the porthole at its foot; a ladder inside a cabin where it is tapped,
     also near its bend), and the cable is laid through both cabins, nothing to check. Two taps (riser pole, ODF) and one stroke dragged along the way
     lay the same chain. The inside of the first cabin shows the cable from one porthole to the other.
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
for (const f of ['20_isokit.js', '30_core.js']) vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'cef', f), 'utf8'), E, { filename: f });
const plan = (code) => JSON.parse(vm.runInContext(`JSON.stringify((() => { ${code} })())`, E));
const NAMED = `const S = sampleSite(); S.sample = false; Object.assign(S.site, { name: 'DEMO SITE', id: 'DEMO-0001', link: 'DEMO PROJECT' }); return S;`;
/* a stand-in for the app: what cef.html asks of window.parent.__cefHost */
const HOST = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CEF test host</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>
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
  SK = sk; const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, serviceWorkers: 'block', hasTouch: !!vp.touch, isMobile: !!vp.touch }), page = await ctx.newPage(), errors = [];
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

/* (6) the made-up plan of two cabins, no cable drawn yet; its points (each tapped a little off) */
const TWO = `const S = blank(); S.sample = false; Object.assign(S.site, { name: 'DEMO SITE', id: 'DEMO-0001', link: 'DEMO PROJECT', L: 24, W: 18, lat: 7.072, lon: 125.612 });
  const add = (t, x, y, o) => { const e = Object.assign(newEl(t, x, y), o || {}); S.els.push(e); return e; }; add('t3', 19, 14, { w: 5, th: 40 });
  const A = add('cabin', 7, 9, { w: 3, d: 4, h: 2.8 }), IA = A.inside = newRoom(A), pa = IA.els.find((q) => q.t === 'port'); pa.x = 0; pa.y = 0.6; pa.rot = 90; IA.els.push(Object.assign(newEl('port', 3, 3.4), { z: 2.3, rot: 90 }));
  IA.runs.push(Object.assign(newRun('ladder', [[0.15, 0.6], [0.15, 3.4], [2.85, 3.4]]), { z: 2.2 }));
  const B = add('cabin', 12, 9, { w: 3, d: 4, h: 2.8 }), IB = B.inside = newRoom(B), pb = IB.els.find((q) => q.t === 'port'); pb.x = 0; pb.y = 3.4; pb.rot = 90;
  const rk = newEl('rack2', 2, 1.6); IB.els.push(rk); const od = Object.assign(newEl('odf', rk.x, rk.y), { st: 'P' }); IB.els.push(od); IB.runs.push(Object.assign(newRun('ladder', [[0.15, 3.4], [2, 3.4], [2, 1.6]]), { z: 2.2 }));
  add('rpole', 2, 1.5); add('exit', 5.3, 7.6, { st: 'P' }); S.runs.push(newRun('trench', [[2, 1.5], [2, 7.6], [5.3, 7.6]])); S.runs.push(Object.assign(newRun('ladder', [fromRoom(A, [3, 3.4]), fromRoom(B, [0, 3.4])]), { z: 2.2 }));
  return S;`;
const PTS = { POLE: [2, 1.5], EX: [5.3, 7.6], A1: [5.5, 7.6], LA: [7.0, 10.4], A2: [8.5, 10.4], LO: [9.5, 10.4], B1: [10.5, 10.4], LB: [11.7, 10.4], ODF: [12.5, 8.6] };
const off = (p, k) => [p[0] + (k % 2 ? 0.08 : -0.06), p[1] + (k % 3 ? 0.07 : -0.05)];
/** where a point of the site is on the screen, in the top view */
const screen = async (page, fr, p) => { const box = await (await page.$('#f')).boundingBox(), q = await fr.evaluate((p) => { const m = SVG.top.getScreenCTM(), d = new DOMPoint(p[0], -p[1]).matrixTransform(m); return [d.x, d.y]; }, p); return [box.x + q[0], box.y + q[1]]; };
const drawn = (fr) => fr.evaluate(() => { const g = routeGeom(ROOT), R = ROOT.route, v = g.parts[0].via, [A, B] = ROOT.els.filter((e) => e.t === 'cabin'); return { ug: R.ug.pts.map((p) => [p.x, p.y]), notes: g.notes, via: v ? [v.cab === B.id, (v.thru || []).map((w) => w.cab === A.id)] : null, inA: R.ug.pts.some((p) => inCabin(A, [p.x, p.y], 0.03)), ladder: g.sum.ladder, ug2: g.sum.ug }; });
for (const [dev, vp] of [['phone', { width: 412, height: 915, touch: 1 }], ['computer', { width: 1280, height: 900 }]]) {
  test(`(6) ${dev}: the FOC tapped through two cabins snaps to each element of the chain in its order and is laid through both cabins; two taps, and a stroke, lay the same`, async () => {
    const SK2 = plan(TWO), { ctx, page, fr, errors } = await open(SK2, vp);
    const tapAt = async (p) => { const q = await screen(page, fr, p); if (vp.touch) await page.touchscreen.tap(q[0], q[1]); else await page.mouse.click(q[0], q[1]); await page.waitForTimeout(250); return fr.evaluate(() => sayNow); };
    const start = async () => { await fr.evaluate(() => { setView('top'); }); await page.waitForTimeout(300); await fr.click('button[data-a="tool-foc"]'); await page.waitForTimeout(300); assert.equal(await fr.evaluate(() => mode + (pen ? ' pen' : '')), 'route pen'); };
    await start(); const said = []; let k = 0;
    for (const nm of ['POLE', 'EX', 'A1', 'LA', 'A2', 'LO', 'B1', 'LB', 'ODF']) said.push([nm, await tapAt(off(PTS[nm], k++))]);
    const want = { EX: /^On the exit conduit/, A1: /^On the porthole/, LA: /^On the cable ladder/, A2: /^On the porthole/, LO: /^On the cable ladder/, B1: /^On the porthole/, LB: /^On the cable ladder/, ODF: /^On the ODF in the rack/ };
    for (const [nm, t] of said) if (want[nm]) assert.match(t, want[nm], `${nm}: ${t}`);
    const r = await drawn(fr);
    for (const nm of ['EX', 'A1', 'A2', 'B1', 'ODF']) assert.ok(r.ug.some((p) => Math.hypot(p[0] - PTS[nm][0], p[1] - PTS[nm][1]) < 0.011), `${nm} is a point of the cable`);
    assert.ok(r.ug.filter((p) => Math.abs(p[1] - 10.4) < 1e-6).length >= 4, 'the taps on the ladders are on their lines');
    assert.deepEqual(r.notes, []); assert.deepEqual(r.via, [true, [true]], 'into cabin B through cabin A'); assert.equal(r.ug2, 9.4); assert.ok(r.inA);
    await shot(page, `cef-chain-tapped-${dev}`);
    /* two taps: the riser pole and the ODF; and (computer) one stroke along the way */
    await fr.evaluate(() => { action('route-new'); }); await page.waitForTimeout(200); if (await fr.evaluate(() => mode) !== 'route') await start();
    await tapAt(off(PTS.POLE, 1)); assert.match(await tapAt(off(PTS.ODF, 2)), /into the cabin 1 by .*, then into the cabin 2 by/);
    const r2 = await drawn(fr); assert.deepEqual(r2.notes, []); assert.deepEqual(r2.via, [true, [true]]); assert.ok(r2.inA);
    if (!vp.touch) {
      await fr.evaluate(() => { action('route-new'); }); await page.waitForTimeout(200); if (await fr.evaluate(() => mode) !== 'route') await start();
      const way = [PTS.POLE, [2, 7.6], PTS.EX, [5.7, 7.6], [5.7, 10.4], PTS.A2, PTS.B1, [12.5, 10.4], PTS.ODF], pts = [];
      for (let i = 0; i + 1 < way.length; i++) for (let t = 0; t < 1; t += 0.1) pts.push([way[i][0] + (way[i + 1][0] - way[i][0]) * t + 0.05 * Math.sin(i * 7 + t * 9), way[i][1] + (way[i + 1][1] - way[i][1]) * t + 0.05 * Math.cos(i * 5 + t * 11)]);
      pts.push(PTS.ODF); let q = await screen(page, fr, pts[0]); await page.mouse.move(q[0], q[1]); await page.mouse.down(); for (const p of pts.slice(1)) { q = await screen(page, fr, p); await page.mouse.move(q[0], q[1], { steps: 2 }); } await page.mouse.up(); await page.waitForTimeout(400);
      const r3 = await drawn(fr); assert.deepEqual(r3.notes, [], 'the stroke: nothing to check'); assert.deepEqual(r3.via, [true, [true]], 'the stroke: through both cabins'); assert.equal(r3.ladder, 1.7);
    }
    /* the inside of the first cabin: the cable from one porthole to the other */
    await fr.click('button[data-a="tool-foc"]').catch(() => {}); await fr.evaluate(() => { mode = 'select'; const A = ROOT.els.find((e) => e.t === 'cabin'); sel = { k: 'el', id: A.id }; action('room-in'); setView('iso'); refresh(true); }); await page.waitForTimeout(500);
    const inside = await fr.evaluate(() => { const D = drawS(); return { room: !!S.room, n: D.route.ug.pts.length, z: [D.route.startZ, D.route.endZ], say: viaHere() ? viaSay(viaHere()) : '' }; });
    assert.ok(inside.room && inside.n > 3 && inside.z[0] > 2 && inside.z[1] > 2, JSON.stringify(inside)); assert.match(inside.say, /its other porthole/);
    await shot(page, `cef-chain-inside-${dev}`);
    assert.deepEqual(errors, []); await ctx.close();
  });
}
