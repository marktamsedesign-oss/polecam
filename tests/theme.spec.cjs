/* (beta 7.16, Theme) the owner: "Dark mode or Light mode on the theme." Run: node --test tests/theme.spec.cjs (or python3 tests/run_all.py --only theme).
   Settings › Theme: Light (the look as it always was, the default), Dark, or Same as the phone (Dark while the phone is in dark mode). The app on a
   phone (393 x 852) and a computer (1280 x 800), the made-up As-Plan project of drawing-menu.spec.cjs with its cable (RUN 1), the made-up template:
   - the setting: three choices, beside Text size at the bottom of Settings; Light with nothing chosen; a choice on the page at once and kept on the
     phone (its settings: theme), the status bar's colour (theme-color) with it; found by the Tutorial's search (theme, dark mode: the topic
     "Theme: light or dark" first, its Show me rings the setting) and by Plan style's Find a setting (Theme, Settings: a tap opens Settings at it);
   - before the first paint: opened with Dark kept, or Same as the phone with the phone dark, the page is dark from its first frame (the theme on
     <html> before <body> is read and before the first paint, the status bar colour with it); Light kept and the phone dark: light;
   - Same as the phone follows the phone's dark mode as it changes (emulated prefers-color-scheme), the CEF plan editor's and the splicing details'
     pages in their frames too; the CEF plan's drawing stays on white paper (its paper, grid and drawing colours as in Light), the editor round
     it dark; the splicing details' diagram a white sheet on a dark desk;
   - the contrast walk in Dark, 393 px and 1280 px: every text, field value, placeholder and icon of the main screens (the map and its bars, the
     legend, the cable route bar, Projects, Settings, the records, a record's form and each of its tabs, Export, Plan style, the Drawing in
     View and Edit with its legend, the Tutorial with its search, a topic and Show me, a question, a toast, the busy screen, Administration,
     Team, the CEF plan editor (its sketch, sheets and tabs) and the splicing details) against what is under it: WCAG AA (4.5:1; large text,
     icons and placeholders 3:1; what is dimmed while another screen is used, and the map's own pictures, pins and symbols, aside); no light
     box left where the screen is dark (but a chosen chip or button, the white camera button, the yellow badges, QR codes, logos and symbols on
     white); the Drawing's plan a white sheet of paper on the dark surround (pixels of the canvas);
   - Light unchanged: the phone in dark mode no longer changes it (the same colours of every element, the phone light or dark), its colours as
     before (the page #eef1f6, the bars #0f2547, the panels #ffffff, the text #132033, the status bar #0f2547), the Drawing's canvas all paper.
   SHOTS_DIR=folder saves a screenshot of each screen walked. Uses an isolated browser profile and a local HTTP server; every name, number and
   place is made up. About 2 minutes. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { editOn } = require('./drawing-edit.cjs'); // ((beta 7.14, View / Edit) the Drawing opens in View: Edit on to choose an item)

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-seed-made-up-blocks.dxf'), 'utf8'); // (the made-up template with the plan's blocks)
const SHOTS = process.env.SHOTS_DIR || null; // (screenshots for a person to look at: SHOTS_DIR=folder)

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
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

const NAME = 'DEMO THEME TEST', T0 = '2026-11-01T08:00:00.000Z';
const USER = { name: 'Juan Dela Cruz', mobile: '09170000001', email: 'juan@demo-contractor.example', company: 'DEMO CONTRACTOR' };
const LA0 = 7.10465, LO0 = 125.6010, DD = 0.00036;
const POLES = []; for (let i = 0; i < 8; i++) POLES.push([`s${i + 1}`, `CC-${9001 + i}`, LA0 + (i > 4 ? (i - 4) * DD : 0), LO0 + Math.min(i, 4) * DD]);
const ON = { s2: { closure: true, closureId: 'CL-9001', boq: { owner: 'Electric', clamp: '8-10', clo: '24C', cloSt: 'New' } }, s3: { boq: { owner: 'Electric', clamp: '8-10', guy: 'Down guy', ground: 'Yes' } }, s4: { status: 'Existing' },
  s6: { nap: true, napId: 'NAP-9001', boq: { owner: 'Electric', clamp: '8-10', napType: 'NAP 1x8', napSt: 'New' } } };
const RECS = POLES.map(([id, poleId, lat, lon], i) => ({ id, project: NAME, element: 'Pole', poleId, poleType: 'Concrete', status: 'Proposed', lat, lon, accuracy: 4.2, created: `2026-11-01T08:0${i}:00.000Z`, updated: T0, takenAt: T0, by: USER.name, boq: { owner: 'Electric', clamp: '8-10' }, ...(ON[id] || {}) }))
  .concat([{ id: 't1', project: NAME, element: 'Site', siteKind: 'Tower', poleId: 'DEMO SITE MIN9001', status: 'Existing', lat: LA0, lon: LO0 - 1.2 * DD, accuracy: 4.2, created: '2026-11-01T08:09:00.000Z', updated: T0, takenAt: T0, by: USER.name, boq: {} }]);
const LINKS = [['t1', 's1', 'F12'], ...POLES.slice(1).map((p, i) => [POLES[i][0], p[0], 'F12'])];
const FIBERS = [{ n: 1, path: ['t1', ...POLES.map((p) => p[0])], cab: 'F12' }];
const way = (id, name, hw, pts) => ({ type: 'way', id, tags: { highway: hw, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const OVERPASS = { version: 0.6, elements: [way(1, 'MADE-UP ST', 'residential', [[LA0 - 0.00008, LO0 - 0.0006], [LA0 - 0.00008, LO0 + 4 * DD + 0.00008]]),
  way(2, 'SAMPLE AVE', 'tertiary', [[LA0 - 0.00008, LO0 + 4 * DD + 0.00008], [LA0 + 3 * DD + 0.0006, LO0 + 4 * DD + 0.00008]])] };

/** The app with the made-up project (o.desk: a computer; o.scheme: the phone's light or dark mode; o.theme: the Theme kept; o.seed: the
 *  made-up template on the phone; o.init: a script run at the start of every page, before the page's own). */
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.desk ? { width: 1280, height: 800 } : { width: 393, height: 852 }, isMobile: !o.desk, hasTouch: !o.desk, deviceScaleFactor: 1, serviceWorkers: 'block', colorScheme: o.scheme || 'light' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.startsWith('https://overpass-api.de/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) }); return r.abort(); });
  if (o.init) await ctx.addInitScript(o.init);
  const page = await ctx.newPage(), errors = []; page.__touch = !o.desk;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(async ({ RECS, NAME, USER, LINKS, FIBERS, theme }) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
      r.onsuccess = () => { const d = r.result, tx = d.transaction('points', 'readwrite'), st = tx.objectStore('points'); st.clear(); RECS.forEach((x) => st.put(x)); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    localStorage.setItem('polecam.settings', JSON.stringify({ projects: [NAME], project: NAME, sampleDone: true, saveCheck: false, zone: 51, user: USER, v17: 1, v20: 1, v64addr: 1, plNotice: 1, routeTip: true, rtGrabTip: true, drawHintOff: false, drawMapKind: 'off', drawLegendOpen: false,
      exp: { dxfMode: 'tpl', dxfPdf: true, dxfCef: false, planOut: 'files', dxfMarks: 'both', dxfLabels: 'std' },
      meta: { [NAME]: { mode: 'survey', purpose: 'As-plan', contractor: 'DEMO CONTRACTOR', links: LINKS, fibers: FIBERS, cables24: true } }, ...(theme ? { theme } : {}) }));
  }, { RECS, NAME, USER, LINKS, FIBERS, theme: o.theme || null });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn') && window.__polecam.points.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  if (o.seed) await page.evaluate(async (text) => {
    await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const d = r.result, tx = d.transaction('packs', 'readwrite'); tx.objectStore('packs').put({ k: '~dxfseed', text }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    const S = window.__polecam.S; S.dxfSeed = { name: 'plan-seed-made-up-blocks.dxf', size: text.length, at: '2026-11-01T08:00:00.000Z', from: 'file', id: '' }; window.__polecam.persist();
  }, SEED);
  return { ctx, page, errors };
}
const themeOf = (page) => page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'), body: getComputedStyle(document.body).backgroundColor }));
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('polecam.settings')).theme);
const DARK = { attr: 'dark', meta: '#0b1830', body: 'rgb(10, 18, 32)' }, LIGHT = { attr: 'light', meta: '#0f2547', body: 'rgb(238, 241, 246)' };
async function until(fn, what, ms) { const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 10000)) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 120)); } throw new Error(`waited for ${what}: ${JSON.stringify(v)}`); }
/** Every sheet and question closed (Discard a record not saved). */
async function home(page) {
  for (let i = 0; i < 12; i++) {
    const asking = await page.evaluate(() => { const a = document.getElementById('askBox'); if (a && !a.hidden) { const b = [...a.querySelectorAll('button')].find((x) => /^(Discard|Cancel|Close|Not now|Later)/.test(x.textContent.trim())) || a.querySelector('button'); if (b) b.click(); return true; } return false; });
    if (asking) { await page.waitForTimeout(300); continue; }
    if (!(await page.locator('section.sheet:not([hidden])').count())) break;
    await page.goBack(); await page.waitForTimeout(350);
  }
  await page.evaluate(() => { document.querySelectorAll('.overlay:not([hidden])').forEach((o) => { o.hidden = true; }); });
}
const settingsBottom = async (page) => { await page.click('#settingsBtn'); await page.waitForTimeout(400); await page.evaluate(() => document.querySelector('#settings .body').scrollTo(0, 99999)); await page.waitForTimeout(200); };
/** The Drawing open with the plan shown (the preview made); onAsk: what to do while the reminder (the splicing details to make) is asked,
 *  before its ✕ (Later) is tapped. */
async function drawing(page, onAsk) {
  await page.evaluate(() => document.getElementById('drawBtn').click());
  await until(() => page.evaluate(() => { const s = window.__polecam.drwPlan(); return s && s.on && !s.busy; }), 'the plan shown', 60000);
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); }); await page.waitForTimeout(700);
  if (await page.evaluate(() => !document.getElementById('askBox').hidden)) { if (onAsk) await onAsk(); await page.evaluate(() => { const x = document.querySelector('#askBox .askx') || [...document.querySelectorAll('#askBox button')].pop(); x.click(); }); await page.waitForTimeout(300); }
}
const look = (page, m) => page.evaluate(([la, lo, m0]) => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); window.__polecam.drwLook(la, lo, m0, r.width * 0.5, r.height * 0.5); }, [LA0 + 0.0006, LO0 + 0.0012, m]);
/** A pixel of the Drawing's canvas, at a share of its width and height. */
const px = (page, fx, fy) => page.evaluate(([a, b]) => { const c = document.getElementById('drawCanvas'), d = c.getContext('2d').getImageData(Math.round(c.width * a), Math.round(c.height * b), 1, 1).data; return [d[0], d[1], d[2]]; }, [fx, fy]);

/* ---------- the contrast walk (run in the page or a frame) ---------- */
function WALKER() {
  const parse = (c) => {
    if (!c || c === 'transparent' || c === 'none') return [0, 0, 0, 0];
    if (c[0] === '#') { let h = c.slice(1); if (h.length <= 4) h = h.split('').map((x) => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1]; }
    if (c === 'white') return [255, 255, 255, 1]; if (c === 'black') return [0, 0, 0, 1];
    const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (t, u) => { const a = t[3] + u[3] * (1 - t[3]); if (a <= 0) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (t[i] * t[3] + u[i] * u[3] * (1 - t[3])) / a).concat([a]); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const vis = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || +s.opacity === 0) return false; } return true; };
  const isImg = (e) => { if (['IMG', 'CANVAS', 'VIDEO', 'IFRAME'].includes(e.tagName)) return true; if (e.classList && (e.classList.contains('leaflet-tile-container') || e.classList.contains('leaflet-tile-pane'))) return true; const s = getComputedStyle(e); return !!s.backgroundImage && s.backgroundImage !== 'none'; };
  const desc = (e) => { const p = []; for (let x = e; x && x.nodeType === 1 && p.length < 4; x = x.parentElement) { let s = x.tagName.toLowerCase(); if (x.id) { s += '#' + x.id; p.unshift(s); break; } if (x.classList.length) s += '.' + [...x.classList].slice(0, 2).join('.'); p.unshift(s); } return p.join(' > '); };
  /** what is under (x, y) below el (el's own background first, the elements under it as the page paints them): [r, g, b, a], or 'image' */
  const bgAt = (el, x, y) => {
    const stack = document.elementsFromPoint(x, y), i = stack.findIndex((e) => e === el || e.contains(el)), chain = [el];
    if (i >= 0) stack.slice(i).forEach((e) => { if (e !== el && !el.contains(e)) chain.push(e); }); else for (let e = el.parentElement; e; e = e.parentElement) chain.push(e);
    let acc = [0, 0, 0, 0];
    for (const e of chain) { if (isImg(e)) { if (acc[3] >= 0.99) break; return 'image'; } const c = parse(getComputedStyle(e).backgroundColor) || [0, 0, 0, 0]; if (c[3] > 0) { acc = over(acc, c); if (acc[3] >= 0.99) return acc; } }
    const r0 = parse(getComputedStyle(document.documentElement).backgroundColor); return over(acc, r0 && r0[3] ? r0 : [255, 255, 255, 1]);
  };
  const opac = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  /** not to be used now: disabled, or dimmed while another screen is used (no taps, faded) */
  const inert = (el) => { if (el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"], fieldset:disabled, [inert]')) return true;
    if (getComputedStyle(el).pointerEvents === 'none') for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const z = getComputedStyle(e); if (z.pointerEvents === 'none' && +z.opacity < 0.95) return true; } return false; };
  const MAP = '.leaflet-map-pane, #legend .sq'; // (the map's own pictures, pins, labels and symbols: as the map draws them)
  window.__themeWalk = (allow) => {
    const low = [], W = innerWidth, H = innerHeight, seen = new Set(); let n = 0;
    const check = (el, rect, kind, text, inks, need) => {
      if (rect.width < 2 || rect.height < 2 || rect.right < 0 || rect.bottom < 0 || rect.left > W || rect.top > H) return;
      const x = Math.min(W - 1, Math.max(0, rect.left + rect.width / 2)), y = Math.min(H - 1, Math.max(0, rect.top + rect.height / 2)), top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && getComputedStyle(top).pointerEvents !== 'none') return; // (under another screen: not seen)
      const b = bgAt(el, x, y); if (b === 'image') return; const op = opac(el); let best = null;
      for (const ink of [].concat(inks)) { let f = parse(ink); if (!f) continue; f = [f[0], f[1], f[2], f[3] * op]; const c = over(f, b), r = ratio(c, b); if (!best || r > best.r) best = { c, r }; }
      if (!best) return; n++;
      if (best.r < need) low.push(`${kind} "${text}" ${desc(el)}: ${best.r.toFixed(2)} < ${need} (${best.c.slice(0, 3).map(Math.round)} on ${b.slice(0, 3).map(Math.round)})`);
    };
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let t; (t = tw.nextNode());) {
      const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'OPTION', 'TEMPLATE'].includes(el.tagName) || el.closest('svg') || el.closest(MAP) || !vis(el) || inert(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t); const rects = [...rg.getClientRects()].filter((r) => r.width > 1 && r.height > 1); if (!rects.length) continue;
      const s = getComputedStyle(el), sz = parseFloat(s.fontSize), large = sz >= 24 || (+s.fontWeight >= 700 && sz >= 18.66); if (parse(s.color)[3] === 0) continue;
      check(el, rects[0], 'text', t.nodeValue.trim().slice(0, 40), s.color, large ? 3 : 4.5);
    }
    document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), select, textarea').forEach((el) => {
      if (!vis(el) || inert(el) || el.closest(MAP)) return; const r = el.getBoundingClientRect();
      if (el.tagName === 'SELECT' || el.value) check(el, r, 'field', (el.tagName === 'SELECT' ? (el.selectedOptions[0] || {}).textContent || '' : el.value).slice(0, 40), getComputedStyle(el).color, 4.5);
      else if (el.placeholder) check(el, r, 'placeholder', el.placeholder.slice(0, 40), getComputedStyle(el, '::placeholder').color, 3);
    });
    document.querySelectorAll('svg').forEach((sv) => { // icons in buttons and rows, 12 px and up: the colours they are drawn in (the best of them), 3:1
      const r = sv.getBoundingClientRect(); if (r.width < 12 || r.height < 12 || sv.closest('#map, .leaflet-container') || !vis(sv) || inert(sv)) return;
      const host = sv.closest('button, a, .rowbtn, .ic, [role=button], label, summary'); if (!host) return;
      const inks = [], add = (c) => { const q = parse(c); if (q && q[3] > 0) inks.push(c); };
      sv.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse, text').forEach((sh) => { if (sh.closest('symbol, defs, clipPath, mask')) return; const z = getComputedStyle(sh); if (z.stroke && z.stroke !== 'none' && parseFloat(z.strokeWidth) > 0 && !/^url/.test(z.stroke)) add(z.stroke); if (z.fill && z.fill !== 'none' && !/^url/.test(z.fill)) add(z.fill); });
      sv.querySelectorAll('use').forEach((u) => { const id = (u.getAttribute('href') || '').replace(/^#/, ''), sym = id && document.getElementById(id), cs = getComputedStyle(u); if (!sym) return;
        const at = (sh, a) => { for (let e = sh; e && e !== sym.parentNode; e = e.parentNode) { const v = e.getAttribute && e.getAttribute(a); if (v != null) return v; } return null; }; // (on the shape, or the group or symbol it is in)
        sym.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse').forEach((sh) => { const st = at(sh, 'stroke'), fi = at(sh, 'fill'), stroke = st || cs.stroke, fill = fi == null ? cs.fill : fi;
          if (stroke && stroke !== 'none') add(stroke === 'currentColor' ? cs.color : stroke); if (fill && fill !== 'none') add(fill === 'currentColor' ? cs.color : fill); }); });
      check(sv, r, 'icon', (host.getAttribute('aria-label') || host.textContent || '').trim().slice(0, 30), inks.length ? inks : [getComputedStyle(sv).color], 3);
    });
    const light = []; // a light box left where the screen is dark (400 px² and more, an opaque light background, seen)
    document.querySelectorAll('body *').forEach((el) => {
      if (['CANVAS', 'IMG', 'VIDEO', 'IFRAME', 'svg', 'SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('svg') || el.closest(MAP) || (allow && el.closest(allow))) return;
      const r = el.getBoundingClientRect(); if (r.width * r.height < 400 || r.bottom < 0 || r.right < 0 || r.top > H || r.left > W) return;
      const c = parse(getComputedStyle(el).backgroundColor); if (!c || c[3] < 0.85 || lum(c) < 0.45 || !vis(el)) return;
      const top = document.elementFromPoint(Math.min(W - 1, Math.max(0, r.left + r.width / 2)), Math.min(H - 1, Math.max(0, r.top + r.height / 2)));
      if (top && top !== el && !el.contains(top) && !top.contains(el)) return;
      light.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)} rgb(${c.slice(0, 3).join(',')})`);
    });
    return { n, low, light };
  };
}
const WALK_SRC = `(${WALKER.toString()})()`;
/* Light on purpose in Dark: a chosen chip or button (the light ink behind dark text), the white camera button, the project kind badge and the
   yellow badges, the switches' knobs, QR codes, logos and the pins' symbols on white, the plan's preview button, the toast (the ink's colour,
   as in Light), the tutorial's ring; in the CEF plan editor its drawing's paper. */
const ALLOW = ['[aria-pressed="true"]', '[aria-checked="true"]', '[aria-selected="true"]', '.chip:has(input:checked)', '.tchip.on', '#captureBtn', '.badge', '.lock', '.betatag', '.swi', '#qrImg', '#setLogoImg', '.lpbox', '.dxflogo',
  '.psym', '#crossSym', '.edsym', '.svsym', '.dsbig', '#toast', '#tutSpot', '.views'].join(', ');
const walked = [];
/** The walk on what is on the screen now (frame: a page in a frame); its screenshot to SHOTS_DIR. */
async function walk(page, name, frame, least) {
  await page.waitForTimeout(450);
  const f = frame || page;
  await f.evaluate(WALK_SRC);
  const r = await f.evaluate((allow) => window.__themeWalk(allow), ALLOW);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `theme-${name}.png`) });
  walked.push(`${name}: ${r.n}`);
  assert.ok(r.n >= (least || 3), `${name}: something to check (${r.n})`);
  return r.low.map((x) => `${name}: ${x}`).concat(r.light.map((x) => `${name}: light box ${x}`));
}

/** The main screens, one after the other: the problems found on each. */
async function walkAll(page, desk) {
  const W = desk ? 'desk' : 'phone', bad = [];
  const go = async (name, fn) => { try { await fn(); } catch (e) { bad.push(`${W}-${name}: ${e.message.split('\n')[0]}`); } await home(page); };
  await go('map', async () => { bad.push(...await walk(page, `${W}-map`)); await page.click('#legendBtn'); bad.push(...await walk(page, `${W}-legend`)); await page.click('#legendBtn'); });
  await go('route', async () => { await page.click('#routeBtn'); await page.waitForTimeout(700); bad.push(...await walk(page, `${W}-route`)); await page.evaluate(() => { const b = document.getElementById('rbDone'); if (b && b.offsetParent) b.click(); if (document.body.classList.contains('routing')) document.getElementById('routeBtn').click(); }); });
  if (desk) await go('photos', async () => { await page.click('#photosBtn'); await page.waitForTimeout(500); bad.push(...await walk(page, `${W}-photos`)); await page.click('#photosBtn'); });
  await go('projects', async () => { await page.click('#projectBtn'); bad.push(...await walk(page, `${W}-projects`)); });
  await go('settings', async () => { await page.click('#settingsBtn'); bad.push(...await walk(page, `${W}-settings`)); await page.evaluate(() => document.querySelector('#settings .body').scrollTo(0, 99999)); bad.push(...await walk(page, `${W}-settings-end`)); });
  await go('records', async () => { await page.click('#mapSummary'); bad.push(...await walk(page, `${W}-records`)); });
  await go('record', async () => {
    await page.evaluate(() => window.__polecam.newAt({ lat: 7.105, lon: 125.602 })); await page.waitForTimeout(700);
    const n = await page.evaluate(() => document.querySelectorAll('#edTabs button').length);
    for (let i = 0; i < n; i++) { await page.evaluate((k) => document.querySelectorAll('#edTabs button')[k].click(), i); await page.waitForTimeout(300); bad.push(...await walk(page, `${W}-record-tab${i + 1}`)); }
  });
  await go('export', async () => { await page.click('#exportBtn'); bad.push(...await walk(page, `${W}-export`)); await page.evaluate(() => { const b = document.querySelector('#export .body'); if (b) b.scrollTo(0, 99999); }); bad.push(...await walk(page, `${W}-export-end`)); });
  await go('planstyle', async () => { await page.evaluate(() => window.__polecam.openStyle()); await page.waitForTimeout(900); bad.push(...await walk(page, `${W}-planstyle`)); await page.evaluate(() => { const d = document.querySelector('#drwStyle details:not([open]) > summary'); if (d) d.click(); }); await page.waitForTimeout(500); bad.push(...await walk(page, `${W}-planstyle-card`)); });
  await go('drawing', async () => {
    await drawing(page, async () => { bad.push(...await walk(page, `${W}-drawing-reminder`)); }); bad.push(...await walk(page, `${W}-drawing`));
    await editOn(page); await page.waitForTimeout(300);
    await page.evaluate(() => { const l = document.getElementById('drawLegend'); if (l) l.open = true; }); await page.waitForTimeout(300); bad.push(...await walk(page, `${W}-drawing-edit`));
    await page.evaluate(() => { const l = document.getElementById('drawLegend'); if (l) l.open = false; });
    await look(page, 0.4); await page.waitForTimeout(400); const m = await pick(page, 'lbl:s3'); bad.push(...await walk(page, `${W}-drawing-toolbar`));
    if (desk) { await page.mouse.click(m.x, m.y, { button: 'right' }); await page.waitForTimeout(300); bad.push(...await walk(page, `${W}-drawing-menu`)); await page.keyboard.press('Escape'); }
    await page.evaluate(() => document.getElementById('drawModeView').click());
  });
  await go('tutorial', async () => {
    await page.click('#tutorialBtn'); bad.push(...await walk(page, `${W}-tutorial`));
    await page.fill('#tutQ', 'dark mode'); await page.click('#tutGo'); await page.waitForTimeout(300); bad.push(...await walk(page, `${W}-tutorial-search`));
    await page.evaluate(() => document.querySelector('#tutList .tuttopic').click()); await page.waitForTimeout(500); bad.push(...await walk(page, `${W}-tutorial-topic`));
    await page.evaluate(() => document.querySelector('#tutTopic .btn.show').click()); await page.waitForTimeout(1300); bad.push(...await walk(page, `${W}-tutorial-showme`));
    await page.keyboard.press('Escape');
  });
  await go('question', async () => { page.evaluate(() => window.__polecam.ask('Reset the user of this phone?', 'Your name, mobile, email and company are removed from this phone (made up).', [{ label: 'Cancel', value: false }, { label: 'Reset user', value: true, primary: true }])); bad.push(...await walk(page, `${W}-question`)); });
  await go('toast', async () => { await page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = 'Saved: CC-9001 (made up)'; t.hidden = false; }); try { bad.push(...await walk(page, `${W}-toast`)); } finally { await page.evaluate(() => { document.getElementById('toast').hidden = true; }); } });
  await go('busy', async () => { await page.evaluate(() => { document.getElementById('busy').hidden = false; document.getElementById('busyText').textContent = 'Making the plan… 3 / 9'; document.getElementById('busyCancel').hidden = false; });
    try { bad.push(...await walk(page, `${W}-busy`, null, 2)); } finally { await page.evaluate(() => { document.getElementById('busy').hidden = true; document.getElementById('busyCancel').hidden = true; }); } });
  await go('admin', async () => {
    await page.click('#settingsBtn'); await page.waitForTimeout(300); await page.click('#goAdmin'); await page.waitForTimeout(500); bad.push(...await walk(page, `${W}-admin-pin`));
    await page.fill('#admPin', '1234'); if (await page.isVisible('#admPin2')) await page.fill('#admPin2', '1234'); await page.click('#admUnlock'); await page.waitForTimeout(1000); bad.push(...await walk(page, `${W}-admin`));
  });
  await go('team', async () => { await page.click('#settingsBtn'); await page.waitForTimeout(300); await page.evaluate(() => { const b = document.getElementById('goTeam'); b.hidden = false; b.click(); }); await page.waitForTimeout(900); bad.push(...await walk(page, `${W}-team`)); });
  await go('cef', async () => {
    assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { pin: 't1' })), true, 'the CEF plan opens');
    const fr = await cefFrame(page); bad.push(...await walk(page, `${W}-cef`, fr));
    await fr.evaluate(() => document.querySelector('#segView [data-v="sheets"]').click()); bad.push(...await walk(page, `${W}-cef-sheets`, fr));
    for (const t of ['els', 'route']) { await fr.evaluate((k) => document.querySelector(`#tabs [data-tab="${k}"]`).click(), t); bad.push(...await walk(page, `${W}-cef-${t}`, fr)); }
    await fr.evaluate(() => document.getElementById('bDone').click()); await page.waitForTimeout(800);
  });
  await go('splice', async () => {
    assert.equal(await page.evaluate(() => window.__polecam.splice.open(null)), true, 'the splicing details open');
    const fr = await frameOf(page, /vendor\/splice\/splice\.html/); await page.waitForTimeout(2000); bad.push(...await walk(page, `${W}-splice`, fr));
  });
  return bad;
}
/** An item of the plan on the Drawing (Edit on) tapped until it is the one chosen: where it is. */
async function pick(page, id) {
  for (let k = 0; k < 8; k++) {
    let m = (await page.evaluate(() => window.__polecam.drwMv())).items.find((x) => x.id === id); assert.ok(m, `${id} on the plan`);
    const R = await page.evaluate(() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    if (m.x < R.l + 50 || m.x > R.l + R.w - 110 || m.y < R.t + 190 || m.y > R.t + R.h - 230) { await page.evaluate(([X, Y]) => { window.__polecam.drwView({ cx: X, cy: Y }); window.__polecam.drwRedraw(); }, [m.box[0], m.box[1]]); await page.waitForTimeout(120); m = (await page.evaluate(() => window.__polecam.drwMv())).items.find((x) => x.id === id); }
    await (page.__touch ? page.touchscreen.tap(m.x, m.y) : page.mouse.click(m.x, m.y)); await page.waitForTimeout(380);
    const s = (await page.evaluate(() => window.__polecam.drwMv())).sels; if (s.length === 1 && s[0] === id) return m;
  }
  throw new Error(`${id} not chosen`);
}
async function frameOf(page, re) { let fr = null; for (let i = 0; i < 100 && !fr; i++) { await page.waitForTimeout(250); fr = page.frames().find((f) => re.test(f.url())); } assert.ok(fr, `the frame ${re}`); return fr; }
async function cefFrame(page) {
  const fr = await frameOf(page, /vendor\/cef\/cef\.html/);
  await fr.waitForFunction(() => window.CEF && CEF.ready && CEF.ready(), null, { timeout: 30000 });
  await fr.evaluate(() => { const s = sampleSite(); s.sample = false; CEF.test.start(s); CEF.flush(); }); await page.waitForTimeout(600);
  return fr;
}

/* ---------- the tests ---------- */
test('Settings › Theme: Light, Dark, Same as the phone; Light at first; kept on the phone, the status bar colour with it; found by the Tutorial and Find a setting', async () => {
  const { ctx, page, errors } = await open();
  assert.deepEqual(await themeOf(page), LIGHT, 'nothing chosen: Light');
  await settingsBottom(page);
  const row = await page.evaluate(() => { const s = document.getElementById('setTheme'), l = s.closest('label'), t = document.getElementById('setTextSize').closest('label');
    return { label: l.firstChild.textContent.trim(), opts: [...s.options].map((o) => [o.value, o.textContent]), value: s.value, inSettings: !!s.closest('#settings'), besideTextSize: l.previousElementSibling === t, seen: !!s.offsetParent }; });
  assert.deepEqual(row, { label: 'Theme', opts: [['light', 'Light (default)'], ['dark', 'Dark'], ['auto', 'Same as the phone']], value: 'light', inSettings: true, besideTextSize: true, seen: true });
  await page.selectOption('#setTheme', 'dark');
  assert.deepEqual(await themeOf(page), DARK, 'Dark at once');
  assert.equal(await kept(page), 'dark', 'kept on the phone');
  await page.selectOption('#setTheme', 'auto');
  assert.deepEqual(await themeOf(page), LIGHT, 'Same as the phone, the phone light: light');
  assert.equal(await kept(page), 'auto');
  await page.selectOption('#setTheme', 'light'); assert.equal(await kept(page), 'light');
  await page.selectOption('#setTheme', 'dark');
  await page.reload(); await page.waitForFunction(() => !!window.__polecam && !!document.getElementById('exportBtn'), null, { timeout: 60000 });
  assert.deepEqual(await themeOf(page), DARK, 'opened again: Dark kept');
  await settingsBottom(page); assert.equal(await page.inputValue('#setTheme'), 'dark'); await home(page);
  // the Tutorial: its search finds the topic first, Show me rings the setting
  await page.click('#tutorialBtn'); await page.fill('#tutQ', 'dark mode'); await page.click('#tutGo'); await page.waitForTimeout(300);
  assert.match(await page.evaluate(() => document.querySelector('#tutList .tuttopic').textContent), /^Theme: light or dark/);
  await page.evaluate(() => document.querySelector('#tutList .tuttopic').click()); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#tutTopic .btn.show').click());
  const ring = await until(() => page.evaluate(() => { const s = document.getElementById('tutSpot'), t = document.getElementById('setTheme'); if (!s || s.hidden || !s.getClientRects().length || document.getElementById('settings').hidden) return null; const a = s.getBoundingClientRect(), b = t.getBoundingClientRect(); return a.left <= b.left + 2 && a.right >= b.right - 2 && a.top <= b.top + 2 && a.bottom >= b.bottom - 2 && b.top >= 0 && b.bottom <= innerHeight ? 'ringed' : null; }), 'the ring round Theme');
  assert.equal(ring, 'ringed', 'Show me: Settings open, the ring round the Theme');
  await page.keyboard.press('Escape'); await home(page);
  // Plan style's Find a setting: Theme, in Settings; a tap opens Settings at it
  await page.evaluate(() => window.__polecam.openStyle()); await page.waitForTimeout(700);
  await page.fill('#plFindQ', 'dark mode'); await page.waitForTimeout(300);
  const found = await page.evaluate(() => [...document.querySelectorAll('#plFindRes .plfr')].map((b) => [b.querySelector('b').textContent, b.querySelector('small').textContent, b.dataset.app || '']));
  assert.deepEqual(found, [['Theme', 'Settings, at the bottom', 'setThemeRow']], 'Find a setting: dark mode');
  await page.evaluate(() => document.querySelector('#plFindRes .plfr[data-app]').click());
  const at = await until(() => page.evaluate(() => { const r = document.getElementById('setThemeRow'), b = r.getBoundingClientRect(); return !document.getElementById('settings').hidden && r.classList.contains('sthl') && b.top >= 0 && b.bottom <= innerHeight ? document.activeElement.id : null; }), 'Settings at Theme');
  assert.equal(at, 'setTheme', 'Settings open, the Theme row marked and seen, its choice focused');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** At the start of index.html: when data-theme first came on <html>, what it was when <body> came, and the first paint's time. */
const FIRST = () => {
  if (!/index\.html$/.test(location.pathname)) return;
  const rec = window.__first = { themeAt: null, theme: null, atBody: null, paint: [] };
  new MutationObserver(() => {
    const d = document.documentElement;
    if (d && rec.themeAt == null && d.hasAttribute('data-theme')) { rec.themeAt = performance.now(); rec.theme = d.getAttribute('data-theme'); }
    if (document.body && !rec.atBody) rec.atBody = { theme: d.getAttribute('data-theme'), meta: (document.querySelector('meta[name="theme-color"]') || {}).content || '', bg: getComputedStyle(document.body).backgroundColor, t: performance.now() };
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-theme'] });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => rec.paint.push([e.name, e.startTime]))).observe({ type: 'paint', buffered: true }); } catch (e) { /* none */ }
};
test('before the first paint: opened in Dark (or Same as the phone, the phone dark) the page is dark from its first frame; Light, the phone dark: light', async () => {
  for (const [theme, scheme, want] of [['dark', 'light', DARK], ['auto', 'dark', DARK], [null, 'dark', LIGHT], ['light', 'dark', LIGHT]]) {
    const { ctx, page, errors } = await open({ theme, scheme, init: FIRST });
    const r = await page.evaluate(() => window.__first);
    const fp = (r.paint.find((x) => x[0] === 'first-paint') || r.paint[0] || [])[1];
    assert.ok(r.themeAt != null && r.atBody && r.themeAt <= r.atBody.t, `${theme}/${scheme}: the theme on <html> before <body> (${JSON.stringify(r)})`);
    assert.equal(r.theme, want.attr, `${theme}/${scheme}: the theme put first`);
    assert.deepEqual({ attr: r.atBody.theme, meta: r.atBody.meta, body: r.atBody.bg }, want, `${theme}/${scheme}: when <body> came`);
    assert.ok(fp != null && r.themeAt < fp, `${theme}/${scheme}: before the first paint (${r.themeAt} < ${fp})`);
    assert.deepEqual(await themeOf(page), want, `${theme}/${scheme}: once open`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Same as the phone follows the phone\'s dark mode as it changes, the CEF plan editor and the splicing details too; their drawing on white paper', async () => {
  const { ctx, page, errors } = await open({ theme: 'auto', scheme: 'light' });
  assert.deepEqual(await themeOf(page), LIGHT);
  await page.emulateMedia({ colorScheme: 'dark' }); await until(async () => (await themeOf(page)).attr === 'dark', 'dark');
  assert.deepEqual(await themeOf(page), DARK, 'the phone dark: Dark, at once');
  await page.emulateMedia({ colorScheme: 'light' }); await until(async () => (await themeOf(page)).attr === 'light', 'light');
  assert.deepEqual(await themeOf(page), LIGHT, 'the phone light again: Light');
  // the CEF plan editor, open while the phone changes
  assert.equal(await page.evaluate(() => window.__polecam.cef.open(null, { pin: 't1' })), true);
  const fr = await cefFrame(page);
  const cef = () => fr.evaluate(() => { const v = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim(), bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
    return { attr: document.documentElement.getAttribute('data-theme'), paper: bg('.views'), panel: bg('.panel'), body: bg('body'), ink: v('--d-ink'), prop: v('--d-prop'), grid: v('--grid'), sheet: v('--paper') }; });
  const L = { paper: 'rgb(255, 255, 255)', ink: '#18212c', prop: '#d1302a', grid: '#e7ecf1', sheet: '#ffffff' };
  assert.deepEqual(await cef(), { attr: 'light', panel: 'rgb(251, 252, 253)', body: 'rgb(232, 236, 240)', ...L }, 'the CEF editor: Light');
  await page.emulateMedia({ colorScheme: 'dark' }); await until(async () => (await cef()).attr === 'dark', 'the CEF editor dark');
  assert.deepEqual(await cef(), { attr: 'dark', panel: 'rgb(22, 28, 36)', body: 'rgb(14, 19, 25)', ...L }, 'the CEF editor: Dark round the drawing; its paper and drawing as in Light');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'theme-follow-cef-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' }); await until(async () => (await cef()).attr === 'light', 'the CEF editor light');
  await fr.evaluate(() => document.getElementById('bDone').click()); await page.waitForTimeout(800); await home(page);
  // the splicing details
  assert.equal(await page.evaluate(() => window.__polecam.splice.open(null)), true);
  const sp = await frameOf(page, /vendor\/splice\/splice\.html/); await page.waitForTimeout(1500);
  const spl = () => sp.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), desk: getComputedStyle(document.querySelector('.stage')).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
  assert.deepEqual(await spl(), { attr: 'light', desk: 'rgb(217, 224, 234)', body: 'rgb(238, 241, 246)' });
  await page.emulateMedia({ colorScheme: 'dark' }); await until(async () => (await spl()).attr === 'dark', 'the splicing details dark');
  assert.deepEqual(await spl(), { attr: 'dark', desk: 'rgb(7, 13, 24)', body: 'rgb(10, 18, 32)' }, 'the splicing details: Dark, its diagram on a dark desk');
  const sheet = await sp.evaluate(() => { const r = [...document.querySelectorAll('#view svg rect')].map((x) => getComputedStyle(x).fill).filter((f) => /^rgb\(255, 255, 255\)$/.test(f)); return r.length; });
  assert.ok(sheet > 0, 'its sheet white');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'theme-follow-splice-dark.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const desk of [false, true]) {
  test(`the contrast walk in Dark, ${desk ? '1280' : '393'} px: every text and icon of the main screens readable (WCAG AA), no light box left; the Drawing's plan a white sheet on the dark surround`, async () => {
    const { ctx, page, errors } = await open({ theme: 'dark', seed: true, desk });
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    const bad = await walkAll(page, desk);
    assert.deepEqual(bad, [], `${walked.filter((x) => x.startsWith(desk ? 'desk' : 'phone')).join(', ')}`);
    // the Drawing: the plan's sheet white on the dark surround, zoomed out; the north arrow on its piece of paper
    await drawing(page); await look(page, desk ? 1.6 : 2.4); await page.waitForTimeout(700);
    assert.deepEqual(await px(page, 0.02, 0.98), [10, 18, 32], 'the surround (a corner of the canvas)');
    const pl = await page.evaluate(() => window.__polecam.drwPlan()); assert.ok(pl && pl.on, 'the plan shown');
    const sheet = await page.evaluate(() => { const c = document.getElementById('drawCanvas'), g = c.getContext('2d'), out = []; for (let y = 0.3; y <= 0.7; y += 0.05) for (let x = 0.2; x <= 0.8; x += 0.05) { const d = g.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data; out.push(d[0] + d[1] + d[2]); } return out.filter((s) => s > 700).length; });
    assert.ok(sheet > 10, `the sheet: white paper in the middle (${sheet} light points)`);
    const tag = await page.evaluate(() => { const c = document.getElementById('drawCanvas'), d = c.getContext('2d').getImageData(c.width - 14, 14, 1, 1).data; return [d[0], d[1], d[2]]; });
    assert.ok(tag.every((v) => v > 220), `the north arrow and scale bar on their piece of paper (${tag})`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `theme-${desk ? 'desk' : 'phone'}-drawing-sheet.png`) });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

/** The colours of every element seen on the screen now (its text, background and border colours). */
const colours = (page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length).map((e) => { const s = getComputedStyle(e); return `${e.tagName}#${e.id}.${e.className && e.className.baseVal == null ? e.className : ''} ${s.color} ${s.backgroundColor} ${s.borderTopColor} ${s.fill} ${s.stroke}`; }));
test('Light unchanged: the phone\'s dark mode does not change it; its colours as before; the Drawing\'s canvas all paper', async () => {
  const seen = {};
  for (const scheme of ['light', 'dark']) {
    const { ctx, page, errors } = await open({ scheme, seed: true });
    assert.deepEqual(await themeOf(page), LIGHT, `the phone ${scheme}: Light`);
    const c = await page.evaluate(() => { const g = (s, p) => getComputedStyle(document.querySelector(s))[p]; return { topbar: g('#topbar', 'backgroundColor'), nav: g('#bottombar', 'backgroundColor'), ink: g('body', 'color'), summary: g('#mapSummary', 'backgroundColor'), scheme: g('html', 'colorScheme') }; });
    assert.deepEqual(c, { topbar: 'rgb(15, 37, 71)', nav: 'rgb(15, 37, 71)', ink: 'rgb(19, 32, 51)', summary: 'rgb(255, 255, 255)', scheme: 'light' }, `the phone ${scheme}: the Light colours`);
    const S = seen[scheme] = {};
    S.map = await colours(page);
    await page.click('#settingsBtn'); await page.waitForTimeout(400); S.settings = await colours(page); await home(page);
    await page.click('#exportBtn'); await page.waitForTimeout(400); S.export = await colours(page); await home(page);
    await page.click('#tutorialBtn'); await page.waitForTimeout(400); S.tutorial = await colours(page); await home(page);
    await drawing(page); await look(page, 2.4); await page.waitForTimeout(600);
    assert.deepEqual(await px(page, 0.02, 0.98), [251, 251, 248], `the phone ${scheme}: the Drawing's canvas paper to its edge, as before`);
    S.drawing = await colours(page); await home(page);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  for (const k of Object.keys(seen.light)) assert.deepEqual(seen.dark[k], seen.light[k], `${k}: the same colours, the phone light or dark`);
});
