/* (Add Pin; Plan style wide) the owner: "add pin: remove proposed pole name. Just put "Add Pin" and then the user will select which pin
   it is, either new Pole, HH, SB, MH and so on"; "NAP dummy box it should be.. allow other pin to add soon like LCP etc. may be this button
   can be add on the drawing side"; "MAP add Pin is not found"; and "Allow the plan style to expand on browser mode giving users room for
   navigation and ease of view on the settings. side bar on a laptop browser is very small".
   Run: node --test tests/add-pin.spec.cjs (or python3 tests/run_all.py --only add-pin).
   A made-up As-Plan project (6 poles along a made-up street, one proposed 12C cable, RUN 1), in the browser:
   - Add Pin on the map, on a phone (390x844) and a computer (1440x900): (beta 7.12, the owner: "can you remove the text add pin?") its pin
     alone, round like the other buttons, its name and tip kept; on the screen, not covered, at the top of the round buttons and lined up
     with them, and the map beside the buttons is still the map;
   - "Add Pin: what is it?": the approved demo's groups (Poles and corners, On the cable, Boxes underground, Sites), each kind with its
     symbol, NEW on the kinds the map had no pin for (until one is picked); each kind places a record of its element, status and kind
     (a pole Proposed and a Globe pole, with no PP- number: the generic P-0001; on the cable's span it goes onto RUN 1 when asked; a pull-off
     and a cross-over Proposed; a closure, a dummy NAP box and an LCP (NAP pins of the kinds Dummy NAP and LCP 1x4), a handhole, a manhole
     and a service box Proposed; a tower and an OLT site, an ODC); the camera's own status choices are not changed by them;
   - an As-Built's pole is New; an Audit lists no pole, corner, dummy NAP box or LCP, and its closure is Existing; Esc closes the list;
   - the Drawing's Add Pin (✎; its pin alone) opens the same list, and a handhole tapped there is a handhole record;
   - a computer (1280x800, 1440x900, 1920x1080, light and dark): Plan style and Export beside the Drawing are wide (Plan style: its preview
     beside the cards), at the window's right, the Drawing still there (its chip beside its open legend); no page sideways, nothing cut
     off; Narrower gives 400 px back, kept on this computer (a reload), Wider the room again;
   - a phone: Plan style and Export as before (the whole screen, no Narrower or Wider); no page errors.
   Uses an isolated browser profile and a local HTTP server; every name, number and place is made up. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
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
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

const NAME = 'DEMO ADD PIN', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const POLES = []; for (let i = 0; i < 6; i++) POLES.push([`p${i + 1}`, `CC-${9101 + i}`, 7.10465, 125.6010 + i * 0.0004]); // (about 44 m apart)
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Existing', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' } }));
const LINKS = POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12']);
const FIBERS = [{ n: 1, path: POLES.map((p) => p[0]), cab: 'F12' }];
const SIZES = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desk: { viewport: { width: 1440, height: 900 } },
  d1280: { viewport: { width: 1280, height: 800 } }, d1920: { viewport: { width: 1920, height: 1080 } } };
const KINDS = ['pole', 'po', 'co', 'cl', 'dnap', 'lcp', 'hh', 'mh', 'sb', 'tower', 'odc', 'olt'];
const GROUPS = ['Poles and corners', 'On the cable', 'Boxes underground', 'Sites'];

/** The app with the made-up project open (purpose: As-plan unless said; dark: the dark theme). */
async function open(size, o = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], serviceWorkers: 'block', colorScheme: o.dark ? 'dark' : 'light' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, FIBERS, purpose }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: true, drawMapKind: 'off',
      meta: { [NAME]: { mode: 'survey', purpose: purpose || 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, fibers: FIBERS, cables24: true } }, exp: { dxfMode: 'tpl', dxfLabels: 'tidy' } }));
  }, { RECS, NAME, USER, LINKS, FIBERS, purpose: o.purpose });
  await page.goto(base + 'index.html');
  await ready(page);
  return { ctx, page, errors };
}
async function ready(page) {
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); const t = document.getElementById('toast'); if (t) t.style.visibility = 'hidden'; }); // (the offline map's toast would cover the screenshots' buttons)
}
const tap = (page, sel) => (page.__phone ? page.tap(sel) : page.click(sel));
/** A question left open by the screen (the splicing details' reminder on the Drawing): its quiet ✕ or its last button. */
async function noAsk(page) { for (let i = 0; i < 3 && await page.isVisible('#askBox'); i++) { await page.evaluate(() => { const x = document.querySelector('#askBox .askx'); if (x) { x.click(); return; } const B = [...document.querySelectorAll('#askBox button')]; B[B.length - 1].click(); }); await page.waitForTimeout(300); } }
/** Add Pin: what is it?, as it is on the screen: the groups and their kinds, NEW, a symbol in each. */
const picker = (page) => page.evaluate(() => ({ open: !document.getElementById('askBox').hidden, title: document.getElementById('askTitle').textContent,
  groups: [...document.querySelectorAll('#askBox .pgrp')].map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('.ptile')].map((t) => t.dataset.kind)]),
  fresh: [...document.querySelectorAll('#askBox .ptile')].filter((t) => t.querySelector('.pnew')).map((t) => t.dataset.kind),
  symbols: [...document.querySelectorAll('#askBox .ptile')].every((t) => !!t.querySelector('.psym svg')), cancel: [...document.querySelectorAll('#askBox .row > .btn')].map((b) => b.textContent) }));
const lastRec = (page) => page.evaluate(() => { const P = window.__polecam.points, r = P[P.length - 1]; return { id: r.id, el: r.element, st: r.status, poleId: r.poleId, type: r.poleType, boq: r.boq || {}, site: r.siteKind || '', src: r.source }; });
/** A kind picked in the list (the map's Add Pin), its record placed at lat, lon (then, before: what else is set) and saved: what the
    record said, and the record. */
async function addPin(page, k, lat, lon, before) {
  await tap(page, '#pinAddBtn'); await page.waitForTimeout(400);
  await tap(page, `#askBox .ptile[data-kind="${k}"]`); await page.waitForSelector('#editor:not([hidden])'); await page.waitForTimeout(700);
  const ed = await page.evaluate(() => ({ title: document.getElementById('editorTitle').textContent, el: document.getElementById('elemSel').value, st: document.getElementById('svStatus').value,
    id: document.getElementById('poleId').value, warn: document.getElementById('fmtWarn').hidden ? '' : document.getElementById('fmtWarn').textContent }));
  await page.evaluate(([la, lo]) => window.__polecam.pinMap.setView([la, lo], 19, { animate: false }), [lat, lon]); await page.waitForTimeout(400);
  if (before) await before();
  await tap(page, '#edSave'); await page.waitForTimeout(1000);
  return { ed, rec: await lastRec(page) };
}

for (const size of ['phone', 'desk']) {
  test(`${size}: Add Pin on the map (beta 7.12: its pin alone, round, its name and tip kept), above the round buttons and lined up with them, not covered; the map beside them is the map`, async () => {
    const { ctx, page, errors } = await open(size);
    try {
      const r = await page.evaluate(() => {
        const b = document.getElementById('pinAddBtn'), q = b.getBoundingClientRect(), rt = document.getElementById('routeBtn').getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        const beside = document.elementFromPoint(q.left - 8, rt.top + rt.height / 2); // (left of the round buttons, beside Add Pin: the map, not the buttons' column; (beta 7.12) round now, as wide as they are)
        return { shown: !b.hidden && q.width > 0, text: b.textContent.trim(), name: b.getAttribute('aria-label'), tip: b.title, icon: !!b.querySelector('svg'), inView: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight,
          top: q.bottom <= rt.top, right: Math.abs(q.right - rt.right) < 1.5, round: Math.abs(q.width - rt.width) < 1.5 && Math.abs(q.height - rt.height) < 1.5, hit: !!hit && b.contains(hit), map: !!beside && !!beside.closest('#map') && !beside.closest('.mapbtns') };
      });
      assert.equal(r.text, '', 'the owner (beta 7.12): "can you remove the text add pin?": its pin alone'); assert.equal(r.tip, 'Add Pin'); assert.ok(r.icon, 'its pin');
      assert.match(r.name, /^Add Pin: pick what it is/);
      for (const k of ['shown', 'inView', 'top', 'right', 'round', 'hit', 'map']) assert.ok(r[k], `${k}: ${JSON.stringify(r)}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('As-Plan (phone): Add Pin: what is it? in its groups; each kind places a record of its element, status and kind; a pole: no PP- number, and onto the cable', async () => {
  const { ctx, page, errors } = await open('phone'); page.__phone = true;
  try {
    await tap(page, '#pinAddBtn'); await page.waitForTimeout(400);
    const p = await picker(page);
    assert.equal(p.title, 'Add Pin: what is it?');
    assert.deepEqual(p.groups, [['Poles and corners', ['pole', 'po', 'co']], ['On the cable', ['cl', 'dnap', 'lcp']], ['Boxes underground', ['hh', 'mh', 'sb']], ['Sites', ['tower', 'odc', 'olt']]]);
    assert.deepEqual(p.fresh, ['cl', 'dnap', 'lcp', 'hh', 'mh', 'sb'], 'NEW: the kinds the map had no pin for');
    assert.ok(p.symbols, 'a symbol in each'); assert.deepEqual(p.cancel, ['Cancel']);
    const box = await page.evaluate(() => { const b = document.querySelector('#askBox .panel').getBoundingClientRect(); return [b.left, b.right, b.bottom, innerWidth, innerHeight, document.documentElement.scrollWidth]; });
    assert.ok(box[0] >= 0 && box[1] <= box[3] + 0.5 && box[2] <= box[4] + 0.5 && box[5] <= box[3], `the list on the screen, a sheet from the foot: ${box}`);
    await tap(page, '#askBox .row > .btn'); await page.waitForTimeout(300); assert.equal(await page.isVisible('#askBox'), false, 'Cancel closes it');
    // a pole on the cable's first span: Proposed, a Globe pole, no PP- number (the generic P-0001); Put on RUN 1 splits the span at it
    const pole = await addPin(page, 'pole', 7.10466, 125.6012);
    assert.equal(pole.ed.title, 'New pole on the map'); assert.equal(pole.ed.el, 'Pole'); assert.equal(pole.ed.st, 'Proposed');
    assert.doesNotMatch(pole.ed.id, /^PP-/, 'no PP- number given in the record'); assert.equal(pole.ed.warn, '', 'no ID warning for a pole with no ID yet');
    assert.deepEqual([pole.rec.el, pole.rec.st, pole.rec.poleId, pole.rec.type, pole.rec.src], ['Pole', 'Proposed', 'P-0001', 'Globe', 'map']);
    assert.equal(await page.textContent('#askTitle'), 'Put P-0001 on the cable?');
    await page.locator('#askBox button', { hasText: 'Put on RUN 1' }).click(); await page.waitForTimeout(800);
    assert.deepEqual(await page.evaluate(() => window.__polecam.S.meta['DEMO ADD PIN'].fibers[0].path.slice(0, 3)), ['p1', pole.rec.id, 'p2'], 'on RUN 1, between the span\'s poles');
    // every other kind
    const WANT = { po: ['Pull-off', 'Proposed', 'New pull-off on the map'], co: ['Cross-over', 'Proposed', 'New cross-over on the map'], cl: ['Closure', 'Proposed', 'New closure on the map'],
      dnap: ['NAP', 'Proposed', 'New dummy NAP box on the map', 'Dummy NAP'], lcp: ['NAP', 'Proposed', 'New LCP on the map', 'LCP 1x4'], hh: ['Handhole', 'Proposed', 'New handhole on the map'],
      mh: ['Manhole', 'Proposed', 'New manhole on the map'], sb: ['Service box', 'Proposed', 'New service box on the map'], tower: ['Site', 'New', 'New tower on the map', '', 'Tower'],
      odc: ['ODC', 'Proposed', 'New ODC on the map'], olt: ['Site', 'New', 'New OLT on the map', '', 'OLT'] };
    let n = 0;
    for (const [k, [el, st, title, nap, site]] of Object.entries(WANT)) {
      const at = k === 'po' || k === 'co' ? [7.1052 + 0.0003 * n, 125.6000] : ['cl', 'dnap', 'lcp'].includes(k) ? [7.10468, 125.6014 + 0.0004 * n] : [7.1040 - 0.0002 * n, 125.6030]; n++;
      const r = await addPin(page, k, ...at);
      assert.deepEqual([r.ed.title, r.ed.el, r.ed.st], [title, el, st], `${k}: its record`);
      assert.deepEqual([r.rec.el, r.rec.st, r.rec.boq.napType || '', r.rec.site, r.rec.src], [el, st, nap || '', site || '', 'map'], `${k}: saved`);
      if (k === 'po' || k === 'co') { assert.equal(await page.isVisible('#jnBar'), true, `${k}: its poles asked next (beta 6.9)`); await page.click('#jnBarCancel'); await page.waitForTimeout(300); }
    }
    const S = await page.evaluate(() => ({ lastSt: window.__polecam.S.lastSt || {}, seen: window.__polecam.S.pinSeen || {} }));
    assert.deepEqual(S.lastSt, {}, 'the camera\'s own status choices are not changed by pins placed by hand');
    await tap(page, '#pinAddBtn'); await page.waitForTimeout(400);
    assert.deepEqual((await picker(page)).fresh, [], 'NEW goes once a kind was picked on this phone');
    await tap(page, '#askBox .row > .btn'); await page.waitForTimeout(300);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('As-Built and Audit (computer): an As-Built\'s pole is New (no PP- number); an Audit lists no pole, corner, dummy NAP box or LCP, its closure Existing; Esc closes the list', async () => {
  for (const purpose of ['As-built', 'Audit']) {
    const { ctx, page, errors } = await open('desk', { purpose });
    try {
      await page.click('#pinAddBtn'); await page.waitForTimeout(400);
      const p = await picker(page);
      if (purpose === 'As-built') {
        assert.deepEqual(p.groups.map((g) => g[0]), GROUPS); assert.deepEqual(p.groups.flatMap((g) => g[1]), KINDS);
        const box = await page.evaluate(() => { const b = document.querySelector('#askBox .panel'); return [b.scrollHeight <= b.clientHeight + 1, getComputedStyle(document.querySelector('#askBox .row.pins')).gridTemplateColumns.split(' ').length]; });
        assert.deepEqual(box, [true, 2], 'a computer: the groups two by two, all on the screen');
        await page.keyboard.press('Escape'); await page.waitForTimeout(300); assert.equal(await page.isVisible('#askBox'), false, 'Esc closes it');
        const r = await addPin(page, 'pole', 7.1050, 125.6040, () => page.evaluate(() => [...document.querySelectorAll('#editor .chips[data-k="mloop"] button')].find((b) => b.textContent === 'No loop').click())); // (an As-Built answers the loop first, v2.42.16)
        assert.deepEqual([r.ed.st, r.rec.el, r.rec.st, r.rec.src], ['New', 'Pole', 'New', 'map']); assert.doesNotMatch(r.rec.poleId, /^PP-/);
      } else {
        assert.deepEqual(p.groups, [['On the cable', ['cl']], ['Boxes underground', ['hh', 'mh', 'sb']], ['Sites', ['tower', 'odc', 'olt']]]);
        await page.click('#askBox .row > .btn'); await page.waitForTimeout(300);
        const r = await addPin(page, 'cl', 7.10468, 125.6014);
        assert.deepEqual([r.rec.el, r.rec.st, r.rec.src], ['Closure', 'Existing', 'map']);
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('the Drawing (phone): ✎ then Add Pin (its pin) opens the same list; a handhole tapped on the Drawing is a handhole record', async () => {
  const { ctx, page, errors } = await open('phone'); page.__phone = true;
  try {
    await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(1500); await noAsk(page);
    await page.evaluate(() => document.getElementById('drawEdit').click()); await page.waitForTimeout(900);
    assert.equal((await page.textContent('#rtDrwSite')).trim(), '', 'its pin alone (beta 7.12)'); assert.equal(await page.getAttribute('#rtDrwSite', 'title'), 'Add Pin'); assert.match(await page.getAttribute('#rtDrwSite', 'aria-label'), /^Add Pin/);
    await page.evaluate(() => document.getElementById('rtDrwSite').click()); await page.waitForTimeout(400);
    const p = await picker(page);
    assert.equal(p.title, 'Add Pin: what is it?'); assert.deepEqual(p.groups.flatMap((g) => g[1]), KINDS);
    await tap(page, '#askBox .ptile[data-kind="hh"]'); await page.waitForTimeout(400);
    assert.match(await page.textContent('#rtHint'), /^Tap the Drawing where the handhole goes/);
    const c = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.3]; });
    await page.touchscreen.tap(c[0], c[1]); await page.waitForSelector('#editor:not([hidden])'); await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => [document.getElementById('elemSel').value, document.getElementById('svStatus').value]), ['Handhole', 'Proposed']);
    await tap(page, '#edSave'); await page.waitForTimeout(1200);
    const r = await lastRec(page); assert.deepEqual([r.el, r.st, r.poleId], ['Handhole', 'Proposed', 'HH-0001']);
    assert.equal(await page.isVisible('#drawing'), true, 'back on the Drawing');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

/** Plan style or Export beside the Drawing: where it is, its columns, what would be cut or push the page sideways. */
const panel = (page, id) => page.evaluate((id) => {
  const s = document.getElementById(id), b = s.getBoundingClientRect(), body = s.querySelector('.body'), g = s.querySelector('.dsgrid'), btn = s.querySelector('[data-sidew]');
  const cut = [...s.querySelectorAll('button, summary, input, select, h2')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0)
    .filter((e) => { const r = e.getBoundingClientRect(); return r.right > b.right + 1 || r.left < b.left - 1; }).map((e) => e.id || e.className || e.tagName);
  const col = (sel) => { const e = s.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().width) : 0; };
  return { side: s.classList.contains('side'), left: Math.round(b.left), w: Math.round(b.width), right: Math.round(b.right), vw: innerWidth, cols: g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0,
    prev: col('#dsPrevCol'), cards: col('.dsctl'), drawing: Math.round(document.querySelector('#drawing .drwcol').getBoundingClientRect().width), btn: btn && btn.offsetParent ? btn.textContent.trim() : '',
    sideways: (!!body && body.scrollWidth > body.clientWidth + 1) || document.documentElement.scrollWidth > innerWidth, cut };
}, id);
async function drawing(page) { await page.evaluate(() => document.getElementById('drawBtn').click()); await page.waitForTimeout(1500); await noAsk(page); }
async function styleOpen(page) { await page.evaluate(() => document.getElementById('drawSetBtn').click()); await page.waitForTimeout(1000); await noAsk(page); }

for (const [size, dark] of [['d1280', false], ['desk', false], ['desk', true], ['d1920', false]]) {
  test(`computer ${SIZES[size].viewport.width}x${SIZES[size].viewport.height}${dark ? ' (dark)' : ''}: Plan style and Export beside the Drawing are wide (Plan style: its preview beside the cards); Narrower: 400 px, kept; Wider again`, async () => {
    const { ctx, page, errors } = await open(size, { dark });
    try {
      const vw = SIZES[size].viewport.width, want = Math.min(1100, Math.max(720, vw * 0.62));
      await drawing(page); await styleOpen(page);
      let s = await panel(page, 'drwStyle');
      assert.ok(s.side && Math.abs(s.w - want) <= 1 && s.right === vw, `Plan style wide, at the right: ${JSON.stringify(s)}`);
      assert.ok(s.cols === 2 && s.prev >= 340 && s.cards >= 390, `the preview beside the cards, each with room: ${JSON.stringify(s)}`);
      assert.ok(s.drawing >= vw - want - 1 && s.drawing >= 440, `the Drawing still beside it: ${JSON.stringify(s)}`);
      assert.equal(s.btn, 'Narrower'); assert.equal(s.sideways, false); assert.deepEqual(s.cut, []);
      assert.ok(await page.evaluate(() => { const c = document.getElementById('drawPv').getBoundingClientRect(), l = document.getElementById('drawLegend'), r = l.getBoundingClientRect(); return !l.open || !c.width || c.left >= r.right || c.top >= r.bottom; }),
        'the Drawing\'s chip (the drawing shown) beside its open legend, not under it');
      // Narrower: 400 px, the preview over the cards (as before); kept on this computer; Wider: the room again
      await page.click('#drwStyle [data-sidew]'); await page.waitForTimeout(500);
      s = await panel(page, 'drwStyle');
      assert.ok(s.side && s.w === 400 && s.right === vw && s.cols !== 2 && s.btn === 'Wider' && !s.sideways && !s.cut.length, `Narrower: ${JSON.stringify(s)}`);
      if (size === 'desk' && !dark) {
        await page.waitForTimeout(400); await page.reload(); await ready(page); await drawing(page); await styleOpen(page);
        s = await panel(page, 'drwStyle'); assert.ok(s.w === 400 && s.btn === 'Wider', `kept after a reload: ${JSON.stringify(s)}`);
      }
      await page.click('#drwStyle [data-sidew]'); await page.waitForTimeout(500);
      s = await panel(page, 'drwStyle'); assert.ok(Math.abs(s.w - want) <= 1 && s.btn === 'Narrower', `Wider: ${JSON.stringify(s)}`);
      assert.equal(await page.evaluate(() => !!window.__polecam.S.sideNarrow), false);
      // Export (Export plan, on the Drawing): the same room, its rows at a readable width
      await page.goBack(); await page.waitForTimeout(800);
      await page.evaluate(() => document.getElementById('drawDxf').click()); await page.waitForTimeout(1200); await noAsk(page);
      const x = await panel(page, 'export');
      assert.ok(x.side && Math.abs(x.w - want) <= 1 && x.right === vw && x.btn === 'Narrower' && !x.sideways && !x.cut.length, `Export wide: ${JSON.stringify(x)}`);
      const rows = await page.evaluate(() => { const c = document.getElementById('dxfCard').getBoundingClientRect(); return Math.round(c.width); });
      assert.ok(rows <= 770 && rows >= 360, `Export's rows at a readable width: ${rows}`);
      await page.click('#export [data-sidew]'); await page.waitForTimeout(500);
      const xn = await panel(page, 'export'); assert.ok(xn.w === 400 && xn.btn === 'Wider' && !xn.sideways && !xn.cut.length, `Export narrower: ${JSON.stringify(xn)}`);
      await page.click('#export [data-sidew]'); await page.waitForTimeout(300);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('phone: Plan style and Export from the Drawing as before: the whole screen, no Narrower or Wider, nothing sideways', async () => {
  const { ctx, page, errors } = await open('phone');
  try {
    await drawing(page); await styleOpen(page);
    const s = await panel(page, 'drwStyle');
    assert.ok(!s.side && s.left === 0 && s.w === 390 && s.btn === '' && !s.sideways, JSON.stringify(s));
    await page.goBack(); await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('drawDxf').click()); await page.waitForTimeout(1200); await noAsk(page);
    const x = await panel(page, 'export');
    assert.ok(!x.side && x.w === 390 && x.btn === '' && !x.sideways, JSON.stringify(x));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
