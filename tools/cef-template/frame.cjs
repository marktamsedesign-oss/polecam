/* (beta 7.15, CEF template kit) The CEF's generic frame, title block and cover page as the CEF plan's engine draws them today (vendor/cef:
   sheetFrame and the cover of buildSheets), with a field (@@NAME@@) where each value goes, and the CEF's style kit (CEF_KIT, LAYERS) and
   north arrow: the input of make_cef_template.py, which writes the generic CEF template DXF from it.
     node tools/cef-template/frame.cjs > frame.json
   Every position and size is the engine's own: the frame is drawn by sheetFrame itself with the fields as its values (a value is not made
   smaller to fit its box here: its box, the room the engine gives it, goes with it). Nothing is read from or sent anywhere. */
'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const CEF = path.join(__dirname, '..', '..', 'vendor', 'cef');
const ctx = vm.createContext({ console, Math, Date });
for (const f of ['20_isokit.js', '30_core.js', '40_iso.js', '50_export.js']) vm.runInContext(fs.readFileSync(path.join(CEF, f), 'utf8'), ctx, { filename: f });
const out = vm.runInContext(`(() => {
  const AREAS = [], ROOM = new WeakMap();
  /* a value keeps its height (the template's field has its box, the room the engine gives it); a logo's box is noted */
  fitTx = function (G, p, s, h, maxW, lay, al, b) { G.tx(p, s, h, lay, al, 0, b); ROOM.set(G.p[G.p.length - 1], maxW); };
  logoAt = function (images, key, x, y, w, h) { AREAS.push({ key, box: [x, y, x + w, y + h] }); return !!LOGO_ON; };
  var LOGO_ON = false;
  const S = blank(); Object.assign(S.site, { link: '@@LINK@@', id: '@@SITE_ID@@', name: '@@SITE_NAME@@', serial: '@@SERIAL@@', by: '@@PREPARED_BY@@', chk: '@@CHECKED_BY@@', apr: '@@APPROVED_BY@@', org: '@@COMPANY_NAME@@', lat: 7.1, lon: 125.6 });
  const DATE = isoDate(), COORD = coordText(S), DEMO = 'G-eSAA CEF-PLAN DEMO - GENERIC FRAME, NOT THE OFFICIAL TEMPLATE';
  const field = s => s === DATE ? '@@DATE@@' : s === COORD ? '@@COORDINATES@@' : s === '1 OF 9' ? '@@SHEET_NO@@' : s === PLAN_KIND ? '@@PLAN_KIND@@' : s === DEMO ? '@@EXPORTED_BY@@' : s;
  const take = (P) => ({ lines: P.filter(p => p.k === 'pl').map(p => ({ pts: p.pts, close: !!p.close, lay: p.lay })),
    texts: P.filter(p => p.k === 'tx').map(p => ({ p: p.p, s: field(p.s), h: p.h, al: p.al, b: p.b, lay: p.lay, a: p.a, room: ROOM.get(p) || 0 })) });
  /* the sheet: the frame of every sheet but the cover (no view: the view's title is the CEF's, in the drawing area) */
  const G = new Gfx(); sheetFrame(S, G, { view: '', sheet: '@@SHEET_TITLE@@', scale: '@@SCALE@@', n: 1, N: 9, images: [] });
  const sheet = take(G.p); sheet.areas = AREAS.splice(0);
  /* the two boxes the engine leaves without a value today: their fields where its values go (as val() puts them) */
  for (const [cap, tok, w] of [['DWG. No.', '@@DWG_NO@@', 50], ['ISSUE No.', '@@ISSUE_NO@@', 20]]) { const c = sheet.texts.find(t => t.s === cap); sheet.texts.push({ p: [c.p[0], c.p[1] - 5.4 + 1.9], s: tok, h: 2.5, al: 'l', b: true, lay: 'tx', a: 0, room: w - 2.8 }); }
  sheet.drawing = [FR.x0, FR.y0, FR.x1, FR.y1]; sheet.tables = [FR.sx0, FR.y0 + SH.TB, FR.sx1, FR.y1]; sheet.paper = [SH.W, SH.H];
  /* the cover, with its logos (their boxes noted): the cover of buildSheets */
  LOGO_ON = true; const C = buildSheets(S, { details: false, photos: false })[0];
  const cover = take(C.prims); cover.areas = AREAS.filter(a => a.box[1] === 212); cover.paper = [SH.W, SH.H];
  /* the north arrow, at the size the drawings have it (2.4 mm names): its foot at 0, 0, pointing up */
  const N = new Gfx(); northArrow(N, [0, 0], [0, 1], 2.4);
  return JSON.stringify({ sheet, cover, north: N.p, kit: CEF_KIT, layers: Object.fromEntries(Object.entries(LAYERS).map(([k, L]) => [k, { name: L[0], aci: L[1], dashed: !!L[2], rgb: L[4], mm: L[5], use: CEF_KIT.layers[k] || '' }])) });
})()`, ctx);
process.stdout.write(out + '\n');
