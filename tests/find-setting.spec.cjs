/* beta 6.7 (UX step 5 fixes; the independent review): Plan style's Find a setting in the browser, with the company plan made (the
   Simple drawing's own rows hidden). Run: python3 tests/run_all.py --only find-setting (or node --test tests/find-setting.spec.cjs).
   A phone (390x844) and a small phone with the largest text (360x640, text size 1.45):
   - Find a setting is on the screen when Plan style opens, above its Reset / Done footer;
   - a row found and tapped is marked, on top (nothing over it) and focused: a Basic row, an Advanced row, a Colours and sizes row;
   - a row hidden now (Photo width, Extra cable on each span, FOC %) says "only with the Simple drawing"; tapped, Kind of drawing is
     marked and focused, with the note of what to choose; choosing Simple marks the row asked for;
   - (small phone) every row of Plan style, typed by its label and tapped: marked, on top and focused (a new row is checked by itself);
   - (small phone) the Tutorial's search: one setting row, the first topic on the screen, More › (Find a setting with the same words,
     focus on its first result), and Show me of a Simple drawing row (Kind of drawing marked, focused).
   - (beta 6.7, UX step 5 fixes, round 2; phone, small phone and a desk, 1440x900) right after launch, Plan style and Export never
     opened: the Tutorial's search for "foc" and "photo width" says "only with the Simple drawing" (on the row and in its aria-label),
     and Show me marks Kind of drawing with its note;
   - (round 2) More › with Plan style used last on Advanced (a section open far down, a row just marked): Find a setting and its
     results on the screen under the preview, from the top, focus on the first result, nothing marked; and the same with the
     Tutorial opened over Plan style (its Search the Tutorial link).
   Uses an isolated browser profile and a local HTTP server; no production data. */
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
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

const SIZES = { phone: { viewport: { width: 390, height: 844 }, textScale: 1 }, small: { viewport: { width: 360, height: 640 }, textScale: 1.45 },
  desk: { viewport: { width: 1440, height: 900 }, textScale: 1, desk: true } }; // (desk: round 2's tests only)
/** The app (company plan, no template); style: Plan style opened (false: nothing opened since launch); extra: more saved settings. */
async function open(size, style = true, extra = {}) {
  const Z = SIZES[size], ctx = await browser.newContext(Z.desk ? { viewport: Z.viewport, serviceWorkers: 'block' } : { viewport: Z.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(([ts, extra]) => {
    if (!localStorage.getItem('polecam.settings')) localStorage.setItem('polecam.settings', JSON.stringify({
      user: { name: 'Test Surveyor', company: 'Test Company', mobile: '09171234567', email: 'test@example.com' },
      readId: false, saveCheck: false, view: { lat: 14.5, lon: 121, z: 17 }, v17: 1, v20: 1, project: 'Test project', projects: ['Test project'],
      textScale: ts, exp: { dxfMode: 'tpl' }, plNotice: 1, ...extra, // (the company plan made, no template needed for these rows)
    }));
  }, [Z.textScale, extra]);
  const page = await ctx.newPage(), errors = []; page.__size = size;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('goPlanStyle'));
  await page.waitForTimeout(800);
  if (!style) { await closeAll(page); return { ctx, page, errors }; }
  await page.evaluate(() => { document.querySelectorAll('section.sheet').forEach((s) => { if (!s.hidden && s.id !== 'drwStyle') { const c = s.querySelector('[data-close]'); if (c) c.click(); } }); document.getElementById('goPlanStyle').click(); });
  await page.waitForFunction(() => !document.getElementById('drwStyle').hidden);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
const closeAll = async (page) => { await page.evaluate(() => { document.querySelectorAll('section.sheet').forEach((s) => { if (!s.hidden) { const c = s.querySelector('[data-close]'); if (c) c.click(); } }); }); await page.waitForTimeout(500); };
/** The Tutorial (from the map, every screen closed first) searched for q. */
async function tutOpen(page, q) {
  await closeAll(page);
  await page.evaluate(() => document.getElementById('tutorialBtn').click()); await page.waitForTimeout(600);
  await page.fill('#tutQ', q); await page.waitForTimeout(400);
}
const tap = (page, loc) => (SIZES[page.__size] && SIZES[page.__size].desk ? loc.click() : loc.tap());
/** Is el (a selector) on the screen, above Plan style's footer and on top at its middle? */
const onTop = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return 'missing';
  const r = el.getBoundingClientRect(), foot = document.querySelector('#drwStyle > .foot').getBoundingClientRect();
  if (!r.width || r.top < 0 || r.bottom > foot.top) return `not in view: ${Math.round(r.top)}-${Math.round(r.bottom)}, footer at ${Math.round(foot.top)}`;
  const h = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + Math.min(r.height / 2, 14));
  return h && (h === el || el.contains(h) || h.contains(el)) ? true : `covered by ${h ? h.id || h.className || h.tagName : 'nothing'}`;
}, sel);
/** Types q in Find a setting and taps the result whose label is label (the n-th of that label). */
async function find(page, q, label, n = 0) {
  await page.evaluate(() => { document.querySelector('#drwStyle .dsbody').scrollTop = 0; });
  await page.fill('#plFindQ', q);
  const items = page.locator('#plFindRes .plfr').filter({ has: page.locator('b', { hasText: label }) });
  const item = items.nth(n), where = await item.locator('small').textContent();
  await item.tap();
  await page.waitForTimeout(700);
  return where;
}
const marked = (page) => page.evaluate(() => {
  const x = document.querySelector('#drwStyle .sthl'); if (!x) return null;
  x.setAttribute('data-tmark', ''); const why = document.getElementById('plFindWhy');
  return { label: x.dataset.find || x.dataset.findx, focus: x.contains(document.activeElement), note: why && x.contains(why) ? why.textContent : '' };
});

for (const size of ['phone', 'small']) {
  test(`${size}: Find a setting is on the screen at opening; a row found is marked, on top and focused`, async () => {
    const { ctx, page, errors } = await open(size);
    try {
      assert.equal(await onTop(page, '#plFindQ'), true, 'Find a setting at opening');
      for (const [q, label, n] of [['sheet split', 'Sheet split (Tidy)'], ['clamp types beside', 'Clamp types beside each pole'], ['circle colour', 'Circle colour', 1], ['loops', '20 m loops at boxes']]) {
        await find(page, q, label, n);
        const m = await marked(page);
        assert.ok(m && m.label === label && m.focus && !m.note, `${q}: ${JSON.stringify(m)}`);
        assert.equal(await onTop(page, '[data-tmark]'), true, `${q}: the row marked is on top`);
        await page.evaluate(() => document.querySelector('[data-tmark]').removeAttribute('data-tmark'));
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
  test(`${size}: a Simple drawing row, hidden with the company plan: Kind of drawing marked with its note; Simple chosen: the row`, async () => {
    const { ctx, page, errors } = await open(size);
    try {
      for (const [q, label, name] of [['photo width', 'Photo width (Simple drawing)', 'Photo width'], ['foc', 'Extra cable on each span, FOC % (Simple drawing)', 'Extra cable on each span, FOC %']]) {
        const where = await find(page, q, label);
        assert.match(where, /Plan style › Plan file · only with the Simple drawing$/);
        const m = await marked(page);
        assert.ok(m && m.label === 'Kind of drawing' && m.focus, `${q}: ${JSON.stringify(m)}`);
        assert.equal(m.note, `${name}: only with the Simple drawing. To use it, choose Simple points and photos here.`);
        assert.equal(await page.evaluate(() => document.activeElement.id + ' ' + document.activeElement.getAttribute('aria-describedby')), 'dxfMode plFindWhy');
        assert.equal(await onTop(page, '[data-tmark]'), true, `${q}: Kind of drawing on top`);
        await page.evaluate(() => document.querySelector('[data-tmark]').removeAttribute('data-tmark'));
      }
      await page.selectOption('#dxfMode', 'simple'); // (after foc)
      await page.waitForTimeout(700);
      const m = await marked(page);
      assert.ok(m && m.label === 'Extra cable on each span, FOC % (Simple drawing)' && m.focus && !m.note, JSON.stringify(m));
      assert.equal(await onTop(page, '[data-tmark]'), true, 'the FOC row, shown now, on top');
      assert.equal(await page.evaluate(() => !document.getElementById('plFindWhy') && !document.getElementById('dxfMode').hasAttribute('aria-describedby')), true, 'the note gone');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
/* Every row of Plan style (Basic, Advanced, Colours and sizes), on the small phone with the company plan: typed by its label and
   tapped, it is marked, on top above the footer and focused; a row hidden now marks Kind of drawing with its note. A new row is
   checked here by itself. */
test('small: every row of Plan style, found by its label and tapped, is marked, on top and focused (company plan)', async () => {
  const { ctx, page, errors } = await open('small');
  try {
    const rows = await page.evaluate(() => [...document.querySelectorAll('#drwStyle [data-find], #drwStyle [data-findx]')].filter((el) => el.closest('#plBasic, #plAdv')).map((el, i) => {
      el.dataset.tfa = String(i); let off = false; for (let x = el; x && !x.matches('#plBasic, #plAdv'); x = x.parentElement) if (x.hidden) off = true;
      return { i, label: el.dataset.find || el.dataset.findx, off };
    }));
    assert.ok(rows.length >= 85, `${rows.length} rows`);
    assert.deepEqual(rows.filter((r) => r.off).map((r) => r.label), ['Photo beside each point (Simple drawing)', 'Photo width (Simple drawing)',
      'Extra cable on each span, FOC % (Simple drawing)', 'Pole circle size (Simple drawing)', 'Label size (Simple drawing)']);
    const bad = [], seen = {};
    for (const r of rows) {
      const n = seen[r.label] = (seen[r.label] || 0) + 1; // (twins, as Circle colour: the n-th of that label, in the screen's order)
      await page.evaluate(() => { document.querySelector('#drwStyle .dsbody').scrollTop = 0; });
      await page.fill('#plFindQ', r.label);
      const item = page.locator('#plFindRes .plfr').filter({ has: page.locator('b', { hasText: new RegExp(`^${r.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).nth(n - 1);
      if (!(await item.count())) { bad.push(`${r.label}: not listed`); continue; }
      await item.tap(); await page.waitForTimeout(600);
      const m = await page.evaluate((i) => {
        const x = document.querySelector('#drwStyle .sthl'); if (!x) return { none: true };
        const r = x.getBoundingClientRect(), foot = document.querySelector('#drwStyle > .foot').getBoundingClientRect();
        const onTop = r.width > 0 && r.top >= 0 && r.top + 10 < foot.top && [[r.left + 16, r.top + Math.min(10, r.height / 2)], [r.left + r.width / 2, r.top + Math.min(r.height / 2, 24)]]
          .every(([a, c]) => { const h = document.elementFromPoint(a, c); return !!h && (h === x || x.contains(h)); });
        const why = document.getElementById('plFindWhy');
        return { me: x.dataset.tfa === String(i), kind: x.id === 'psKind', onTop, focus: x.contains(document.activeElement), why: why && x.contains(why) ? why.textContent : '' };
      }, r.i);
      const good = r.off ? m.kind && m.onTop && m.focus && / only with the Simple drawing\. To use it, choose Simple points and photos here\.$/.test(m.why) : m.me && m.onTop && m.focus && !m.why;
      if (!good) bad.push(`${r.label}${r.off ? ' (hidden now)' : ''}: ${JSON.stringify(m)}`);
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
/* The Tutorial's search on the small phone: one setting row at most (the topics stay on the screen), More › opens Find a setting
   with the same words, focus on its first result; a Simple drawing row's Show me marks Kind of drawing, focused. */
test('small: the Tutorial\'s setting rows: the first topic on the screen, More ›, Show me of a hidden row', async () => {
  const { ctx, page, errors } = await open('small');
  const tut = async (q) => {
    await page.evaluate(() => { document.querySelectorAll('section.sheet').forEach((s) => { if (!s.hidden) { const c = s.querySelector('[data-close]'); if (c) c.click(); } }); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('tutorialBtn').click()); await page.waitForTimeout(600);
    await page.fill('#tutQ', q); await page.waitForTimeout(400);
  };
  try {
    await tut('colour');
    const st = await page.evaluate(() => {
      const L = document.getElementById('tutList'), sets = L.querySelectorAll('.tutset'), last = sets[sets.length - 1];
      let t = last && last.nextElementSibling; while (t && (t.classList.contains('tutcat') || t.classList.contains('tutset'))) t = t.nextElementSibling;
      return { sets: sets.length, more: !!L.querySelector('.tutsethd .tutsetall'), topicBottom: t ? Math.round(t.getBoundingClientRect().bottom) : null, vh: innerHeight };
    });
    assert.ok(st.sets === 1 && st.more && st.topicBottom && st.topicBottom <= st.vh, JSON.stringify(st));
    await page.locator('#tutList .tutsetall').tap(); await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => ({ open: !document.getElementById('drwStyle').hidden, tut: !document.getElementById('tutorial').hidden, q: document.getElementById('plFindQ').value,
      focus: !!document.activeElement && document.activeElement.classList.contains('plfr') })), { open: true, tut: false, q: 'colour', focus: true });
    await tut('photo width');
    await page.locator('#tutList .tutset').first().tap(); await page.waitForTimeout(800);
    const m = await marked(page);
    assert.ok(m && m.label === 'Kind of drawing' && m.focus && /^Photo width: only with the Simple drawing\./.test(m.note), JSON.stringify(m));
    assert.equal(await onTop(page, '[data-tmark]'), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

/* beta 6.7 (UX step 5 fixes, round 2; reviewer): right after launch (Plan style and Export never opened, so renderDxfTpl has not set
   the screen), a Simple drawing row found in the Tutorial says it is only with the Simple drawing, and Show me marks Kind of drawing. */
const inView = (page) => page.evaluate(() => { // the focused element, Find a setting's box: on the screen, under the preview (narrow), above the footer
  const bd = document.querySelector('#drwStyle .dsbody'), b = bd.getBoundingClientRect(), pc = document.getElementById('dsPrevCol').getBoundingClientRect(), top = bd.clientWidth < 720 ? pc.bottom : b.top;
  const ok = (el) => { if (!el) return 'missing'; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= top - 1 && r.bottom <= b.bottom + 1 ? true : `${el.id || el.className}: ${Math.round(r.top)}-${Math.round(r.bottom)}, room ${Math.round(top)}-${Math.round(b.bottom)}`; };
  const a = document.activeElement;
  return { focus: a && a.classList.contains('plfr') ? ok(a) : `focus on ${a ? a.id || a.className || a.tagName : 'nothing'}`, box: ok(document.getElementById('plFindBox')),
    marked: document.querySelectorAll('#drwStyle .sthl').length, q: document.getElementById('plFindQ').value, open: !document.getElementById('drwStyle').hidden, tut: !document.getElementById('tutorial').hidden };
});
for (const size of Object.keys(SIZES)) {
  test(`${size}: right after launch, the Tutorial's search: a Simple drawing row says so, and Show me marks Kind of drawing`, async () => {
    const { ctx, page, errors } = await open(size, false);
    try {
      for (const [q, label, name] of [['foc', 'Extra cable on each span, FOC % (Simple drawing)', 'Extra cable on each span, FOC %'], ['photo width', 'Photo width (Simple drawing)', 'Photo width']]) {
        await page.reload(); await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('tutorialBtn')); await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => document.getElementById('drwStyle').hidden && document.getElementById('export').hidden), true, 'nothing opened yet');
        await tutOpen(page, q);
        const row = page.locator('#tutList .tutset').filter({ has: page.locator('b', { hasText: label }) }).first();
        assert.equal(await row.count(), 1, `${q}: the setting row`);
        assert.equal(await row.locator('small').textContent(), 'Plan style › Plan file · only with the Simple drawing', `${q}: its place`);
        assert.match(await row.getAttribute('aria-label'), /in Plan style › Plan file · only with the Simple drawing\. Show me$/, `${q}: its aria-label`);
        await tap(page, row); await page.waitForTimeout(800);
        const m = await marked(page);
        assert.ok(m && m.label === 'Kind of drawing' && m.focus, `${q}: ${JSON.stringify(m)}`);
        assert.equal(m.note, `${name}: only with the Simple drawing. To use it, choose Simple points and photos here.`);
        assert.equal(await page.evaluate(() => document.activeElement.id + ' ' + document.activeElement.getAttribute('aria-describedby')), 'dxfMode plFindWhy');
        assert.equal(await onTop(page, '[data-tmark]'), true, `${q}: Kind of drawing on top`);
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
  test(`${size}: More › with Plan style used last on Advanced: Find a setting and its results on the screen, focused, nothing marked`, async () => {
    const { ctx, page, errors } = await open(size, false, { plTab: 'advanced', plOpen: 'stGrid' });
    try {
      // a Show me of Sheet split (Advanced › Map sheets, far down: marked), then the Tutorial's colour, More ›
      await tutOpen(page, 'sheet split');
      await tap(page, page.locator('#tutList .tutset').filter({ has: page.locator('b', { hasText: 'Sheet split (Tidy)' }) }).first()); await page.waitForTimeout(800);
      const m = await marked(page); assert.ok(m && m.label === 'Sheet split (Tidy)', JSON.stringify(m));
      await tutOpen(page, 'colour');
      await tap(page, page.locator('#tutList .tutsetall')); await page.waitForTimeout(700);
      let v = await inView(page);
      assert.deepEqual(v, { focus: true, box: true, marked: 0, q: 'colour', open: true, tut: false }, `after Sheet split: ${JSON.stringify(v)}`);
      // reloaded (S.plTab, S.plOpen kept): the Tutorial first, More ›
      await page.reload(); await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('tutorialBtn')); await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('polecam.settings')).plTab), 'advanced');
      await tutOpen(page, 'colour');
      await tap(page, page.locator('#tutList .tutsetall')); await page.waitForTimeout(700);
      v = await inView(page);
      assert.deepEqual(v, { focus: true, box: true, marked: 0, q: 'colour', open: true, tut: false }, `after a reload: ${JSON.stringify(v)}`);
      // the Tutorial over Plan style (Search the Tutorial ›), scrolled down to Map sheets: More › brings Find a setting back on the screen
      await page.fill('#plFindQ', ''); await page.evaluate(() => { const d = document.getElementById('stGrid'); d.open = true; d.scrollIntoView(); }); await page.waitForTimeout(400);
      await page.fill('#plFindQ', 'colour'); await page.evaluate(() => { document.querySelector('#drwStyle .dsbody').scrollTop = 1e5; }); await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('#plFindRes .plfrtut').click()); await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => !document.getElementById('tutorial').hidden && document.getElementById('tutQ').value), 'colour');
      await tap(page, page.locator('#tutList .tutsetall')); await page.waitForTimeout(700);
      v = await inView(page);
      assert.deepEqual(v, { focus: true, box: true, marked: 0, q: 'colour', open: true, tut: false }, `over Plan style: ${JSON.stringify(v)}`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
