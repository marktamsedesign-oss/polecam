/* ---------- the sketch editor ----------
   G-eSAA: made from the CEF-Plan demo's 60_ui.js (version 17) by tools/make_ui.py. The drawing engine (30_core.js, 40_iso.js, 50_export.js) is
   used as it is. What differs from the demo: the sketch is kept in the project (not in the browser), photos come from the camera of the
   app, the logos come from the app, export goes through the app's save and share, and an accepted task is view-only. */
const $ = s => document.querySelector(s);
const SVG = { top: $('#svgTop'), iso: $('#svgIso'), sheets: $('#svgSheets') }, panel = $('#panel');
const VB = {}, needFit = { top: true, iso: true, sheets: true };
/* ROOT is the whole plan. S is the sketch being worked on: the site itself, or the inside of one of its cabins (inId). focus: the cabinet whose rack is open. */
let ROOT = null, inId = null, focus = null, focusTurn = 0, backView = null;
let S, IMG = {}, sel = null, mode = 'select', tab = 'site', view = 'top', active = 'top', draft = [], placing = null;
let runKind = 'ladder', fib = 'ae', autoAlign = true, live = null, isoT = 0;
const SNAPS = ['rpole', 'epole', 'odf', 'odc', 'hh', 'clo', 'sbox', 'enc', 'exit', 'port'];
let isoHits = [], isoSc = null, dragNote = '', topLabs = [], isoLabs = [];
let dump = '', dl = null, dlReady = false, busy = false, msg = null, hist = [], lastPush = { k: '', t: 0 }, topTh = 0.3, saveNote = '', cursor = '', photoNote = '';

/* ---------- G-eSAA: the app this page runs in ----------
   HOST is the app's side of the editor (app.js, window.__cefHost). APP is what the app gave at the start: who exports (PREPARED BY), who
   accepted the task (CHECKED BY), the company and the project line of the title block, the line under the frame, and whether the plan
   can only be looked at. VIEW: why it is view-only ('' when it can be changed). SNAP: the plan as it was opened, for a view-only plan. */
const HOST = (() => { try { return window.parent !== window && window.parent.__cefHost ? window.parent.__cefHost : null; } catch (e) { return null; } })();
let APP = { by: '', checkedBy: '', org: '', link: '', footer: '', ver: 'G-eSAA', lock: false, fix: null, viewOnly: '', gps: false, canLogo: false, guide: true }, VIEW = '', SNAP = '', LAST = '', READY = false;
const VIEW_OK = ['sel', 'room-in', 'focus-in', 'back', 'go-route', 'go-tab', 'guide-off', 'export-zip', 'export-pdf', 'lab-item'];
const DEMO_LINE = 'G-eSAA CEF-PLAN DEMO - GENERIC FRAME, NOT THE OFFICIAL TEMPLATE';
/* the sketch as the sheets take it: PREPARED BY is the person who exports, the company and the project line come from the app */
function appSketch(S0) { const X = Object.assign({}, S0); X.site = Object.assign({}, S0.site, { by: APP.by || '', org: APP.org || S0.site.org || '', link: S0.site.link || APP.link || '' }); return X; }
/* the sheets of the engine, with the app's own line under the frame instead of the demo's, and CHECKED BY filled in */
function appSheets(X) {
  const sh = buildSheets(X), foot = String(APP.footer || APP.ver || 'G-eSAA').replace(/[^\x20-\x7E]/g, '-').slice(0, 220);
  for (const s of sh) {
    for (const p of s.prims) if (p.k === 'tx') { if (p.s === DEMO_LINE) p.s = foot; else if (p.s.indexOf('NOT IN THIS SET: THE VICINITY MAP') === 0) p.s = 'NOT IN THIS SET: THE VICINITY MAP.'; }
    const ck = String(APP.checkedBy || '').trim().toUpperCase();
    if (ck) { const c = s.prims.find(p => p.k === 'tx' && p.s === 'CHECKED BY'); if (c) { let h = 2.3; const w = textW(ck, h) * 1.08, max = 30 - 2.8; if (w > max && w > 0) h *= max / w; s.prims.push({ k: 'tx', p: [c.p[0], c.p[1] - 7.9], s: ck, h, lay: 'tx', al: 'l', a: 0, b: true }); } }
  }
  return sh;
}
const sheetsNow = () => appSheets(appSketch(ROOT));
/* the README of the export, in the app's words */
function appReadme(t) {
  const e = HOST && HOST.exporter ? HOST.exporter() : {}, who = ['Exported by: ' + (e.name || ''), 'Mobile: ' + (e.mobile || ''), 'Email: ' + (e.email || ''), 'Company: ' + (e.company || ''), 'App: ' + (APP.ver || 'G-eSAA')].join('\r\n');
  return t.replace('CEF PLAN - EXPORT FROM THE G-eSAA CEF-PLAN DEMO', 'CEF PLAN - EXPORT FROM G-eSAA\r\n' + who).replace('Open it again in the demo from the Export tab.', 'Open it again in G-eSAA: CEF plan, Export, Open a saved sketch.')
    .replace('LIMITS OF THIS DEMO', (Object.keys(LOGO).length ? 'logos/  ' + Object.keys(LOGO).map(k => k + '_logo.png').join(', ') + ': the pictures of the logo boxes of the sheets.\r\n' : '') + 'exported_by.txt\r\n  Who exported these files.\r\n\r\nLIMITS').replace('  The sheet frame is generic. It is not the official CEF template.\r\n', '');
}
/* the PDF says which app made it and who exported it */
async function appPdf(bytes) { try { const d = await PDFLib.PDFDocument.load(bytes); d.setCreator(APP.ver || 'G-eSAA'); d.setProducer((APP.ver || 'G-eSAA') + ' (pdf-lib)'); if (APP.by) d.setAuthor(APP.by); if (APP.footer) d.setSubject(APP.footer); return await d.save(); } catch (e) { return bytes; } }
const b64bytes = src => { const s = atob(String(src).slice(String(src).indexOf(',') + 1)), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
/* what comes from the project is written into the sketch: the site name, its ID and its coordinates */
function applyFixed() { const f = APP.fix; if (!f || !ROOT) return; for (const k of ['name', 'id', 'lat', 'lon']) if (f[k] != null && f[k] !== '' && (APP.lock || ROOT.site[k] == null || ROOT.site[k] === '')) ROOT.site[k] = f[k]; if (APP.lock) ROOT.site.anchor = 'tower'; }
/* the next thing to do, for someone new to it */
function guide() {
  if (VIEW) return { t: VIEW, view: 1 };
  if (!ROOT || S.room || focus || APP.guide === false) return null;
  const R = ROOT, rg = routeGeom(R), st = [
    [!!(R.site.name && R.site.id), 'Fill in the site name and ID, the site size and the gate.', 'site', 'Site'],
    [R.els.some(e => TYPES[e.t].g === 'tower'), 'Add the tower and the equipment that is on the site now.', 'els', 'Elements'],
    [R.els.some(e => e.st === 'P') || R.runs.some(r => r.st === 'P'), 'Add what is proposed: the riser pole, the conduit or trench, the ODF.', 'els', 'Elements'],
    [rg.sum.ae > 0.05 && rg.sum.ugt > 0.05, 'Draw the two cables: AE (aerial) and UG (underground).', 'route', 'Route'],
    [R.photos.length > 0, 'Take the site photos and mark them on the plan.', 'photos', 'Photos']], i = st.findIndex(q => !q[0]);
  if (i < 0) return { n: st.length, of: st.length, done: 1, t: 'All steps done. Look at the Sheets view, then export.', tab: 'export', b: 'Export' };
  return { n: i + 1, of: st.length, t: st[i][1], tab: st[i][2], b: st[i][3] };
}
function drawGuide() {
  const el = $('#guide'), g = guide(); if (!el) return; el.hidden = !g; if (!g) return;
  el.className = 'guide' + (g.view ? ' view' : g.done ? ' done' : '');
  el.innerHTML = g.view ? '<b>View only</b><span>' + esc(g.t) + '</span>' : '<b>' + (g.done ? 'Done' : 'Step ' + g.n + ' of ' + g.of) + '</b><span>' + esc(g.t) + '</span>' + (tab === g.tab ? '' : '<button class="b s" data-a="go-tab" data-tab="' + g.tab + '">' + esc(g.b) + '</button>') + '<button class="b s ic" data-a="guide-off" aria-label="Hide these steps" title="Hide these steps">&times;</button>';
}


function norm(o) {
  const b = blank(), old = !(o.v >= 2), old3 = !(o.v >= 3), r = o.route || {}; o.site = Object.assign(b.site, o.site || {});
  if (!r.ae || !r.ug) {                        /* a sketch from before there were two fibers: its aerial legs become the AE fiber, the rest the UG fiber */
    const pts = Array.isArray(r.pts) ? r.pts : [], legs = Array.isArray(r.legs) ? r.legs : []; let k = 0; while (k < legs.length && legs[k] && legs[k].type === 'aerial') k++;
    const ug = pts.slice(k).map(p => ({ x: p.x, y: p.y })), keep = t => t === 'liquid' || t === 'wall' ? t : 'auto';
    o.route = Object.assign(b.route, { ae: { pts: k ? pts.slice(0, k + 1).map(p => ({ x: p.x, y: p.y, loop: num(p.loop, 0) })) : [], cable: r.cable || b.route.ae.cable }, ug: { pts: ug.length > 1 ? ug : [], legs: ug.length > 1 ? legs.slice(k).map(l => ({ type: keep(l && l.type) })) : [], cable: b.route.ug.cable }, aerialH: num(r.aerialH, 6), endRise: num(r.endRise, 1), note: r.note != null ? r.note : b.route.note });
  } else o.route = Object.assign(b.route, r);
  const R = o.route; R.ae = Object.assign({ pts: [], cable: b.route.ae.cable }, R.ae); R.ug = Object.assign({ pts: [], legs: [], cable: b.route.ug.cable }, R.ug);
  if (!Array.isArray(R.ae.pts)) R.ae.pts = []; if (!Array.isArray(R.ug.pts)) R.ug.pts = []; if (!Array.isArray(R.ug.legs)) R.ug.legs = [];
  while (R.ug.legs.length < Math.max(0, R.ug.pts.length - 1)) R.ug.legs.push({ type: 'auto' }); R.ug.legs.length = Math.max(0, R.ug.pts.length - 1);
  if (Array.isArray(o.ladders) && !Array.isArray(o.runs)) o.runs = o.ladders.map(l => Object.assign({ kind: 'ladder', name: '' }, l));   /* sketches saved by the first demo */
  delete o.ladders;
  for (const k of ['gates', 'els', 'runs', 'photos']) if (!Array.isArray(o[k])) o[k] = [];
  if (!o.lab || typeof o.lab !== 'object' || Array.isArray(o.lab)) o.lab = {};
  o.els = o.els.filter(e => e && TYPES[e.t]); o.runs = o.runs.filter(l => l && RUNS[l.kind] && Array.isArray(l.pts) && l.pts.length > 1);
  /* depths: the earlier demos used stand-in values (0.6 m and 1.0 m). The usual depth is now 1.5 m; a depth that was typed in is kept. */
  for (const e of o.els) if (e.t === 'sbox' || e.t === 'hh') { if (e.t === 'sbox' && e.dp == null && num(e.h, 0) > 0.2) e.h = 0.1; if (e.dp == null || (old && Math.abs(num(e.dp, 0) - (e.t === 'hh' ? 1 : 0.6)) < 1e-6)) e.dp = UGD; }
  for (const l of o.runs) if (l.kind !== 'ladder' && (l.dp == null || (old && l.kind === 'trench' && Math.abs(num(l.dp, 0) - 0.6) < 1e-6))) l.dp = UGD;
  for (const e of o.els) { if (e.t === 'cabin' && e.inside && typeof e.inside === 'object' && e.inside.site) { try { e.inside = syncRoom(norm(e.inside), e); } catch (x) { delete e.inside; } } else if (e.inside !== undefined) delete e.inside; }      /* the sketch of the inside of a cabin */
  if (old3) {                                  /* saved before the OSP standard dimensions: what still has the old stand-in value gets the standard one; anything that was typed in is kept */
    const was = (x, v) => Math.abs(num(x, -1) - v) < 1e-6;
    if (was(o.route.aerialH, 6)) o.route.aerialH = STD.msg;
    for (const e of o.els) { if (isPole(e)) { if (was(e.h, 9.14)) e.h = STD.poleUp; if (was(e.w, 0.3)) { e.w = 0.27; e.d = 0.27; } } if (e.t === 'exit' && num(e.w, 0) < 0.2) { e.w = STD.exitW; e.d = STD.exitW; } }
    for (const l of o.runs) if (l.kind === 'conduit' && was(l.w, 0.11)) l.w = STD.hdpe;
  }
  if ((o.v | 0) < 4) {                         /* saved before the conduit of the hand-made plans (114.3 mm PVC): what still has the 50 mm of the earlier demo gets the new size */
    const was = (x, v) => Math.abs(num(x, -1) - v) < 1e-6;
    for (const l of o.runs) if (l.kind === 'conduit' && (was(l.w, 0.05) || was(l.w, 0.11))) l.w = STD.hdpe;
    for (const e of o.els) if (e.t === 'exit' && was(e.w, 0.3)) { e.w = STD.exitW; e.d = STD.exitW; }
  }
  for (const e of o.els) if (e.t === 'sbox' && e.ty != null && !SBOX[e.ty]) delete e.ty;
  if (o.site.names && (typeof o.site.names !== 'object' || Array.isArray(o.site.names))) delete o.site.names; if (o.site.txt != null && o.site.txt !== 'auto' && !isFinite(+o.site.txt)) delete o.site.txt;
  seatItems(o);
  if (o.site.below !== 'depth') delete o.site.below; if (o.site.clo !== 'none') delete o.site.clo;
  o.v = 4; o.site.L = clamp(num(o.site.L, 20), 2, 500); o.site.W = clamp(num(o.site.W, 16), 2, 500); o.iso = (o.iso | 0) & 3; o.sample = !!o.sample; return o;
}
/* Logos: the vendor's own and the client's. They come from the app: the vendor's is the company logo (set once, shared with the company),
   the client's is the admin's (or the file of the app). Each is made a PNG here, as the export names them .png. */
let LOGO = {};
function syncLogos() { LOGOS = {}; for (const k in LOGO) LOGOS[k] = { w: LOGO[k].w, h: LOGO[k].h }; }


const allImg = () => { const o = Object.assign({}, IMG); for (const k in LOGO) o['logo_' + k] = LOGO[k].src; return o; };
function setLogos(Lg) {
  LOGO = {}; const todo = [];
  for (const k of ['vendor', 'client']) {
    const src = Lg && Lg[k]; if (typeof src !== 'string' || !/^data:image\//.test(src)) continue;
    todo.push(new Promise(res => { const im = new Image(); im.onerror = () => res(); im.onload = () => { try { const q = Math.min(1, 800 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * q)), h = Math.max(1, Math.round(im.naturalHeight * q)), c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h); LOGO[k] = { src: c.toDataURL('image/png'), w, h }; } catch (e) { } res(); }; im.src = src; }));
  }
  return Promise.all(todo).then(() => { syncLogos(); needFit.sheets = true; });
}

let saveT = 0;
function save() { if (VIEW || !HOST || !ROOT || !READY) return; clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
function saveNow() { clearTimeout(saveT); saveT = 0; if (VIEW || !HOST || !ROOT || !READY) return; const s = JSON.stringify(ROOT); if (s === LAST) return; try { if (HOST.save(s) !== false) LAST = s; saveNote = ''; } catch (e) { saveNote = 'none'; } }
function push(k) { const now = Date.now(); if (k && k === lastPush.k && now - lastPush.t < 1500) { lastPush.t = now; return; } hist.push(JSON.stringify(ROOT)); if (hist.length > 80) hist.shift(); lastPush = { k: k || '', t: now }; }
/* a whole new plan: the editor goes back to the site */
function setRoot(o) { ROOT = o; S = o; inId = null; if (focus) { focus = null; view = backView || 'top'; } needFit.top = needFit.iso = needFit.sheets = true; }
/* after the plan was put back (undo): S is found again in it */
function relink() {
  const c = inId ? ROOT.els.find(e => e.id === inId && e.t === 'cabin') : null;
  if (c && c.inside) S = c.inside; else { if (inId) needFit.top = needFit.iso = true; inId = null; S = ROOT; }
  if (focus && !ROOT.els.some(e => e.id === focus && e.t === 'odc')) { focus = null; view = backView || 'top'; needFit.top = needFit.iso = true; }
}
const cabinNow = () => inId ? ROOT.els.find(e => e.id === inId) || null : null;
const small = () => !!(S.room || focus);            /* a room or one cabinet: a drawing a few metres across */
function undo() { if (VIEW || !hist.length) return; ROOT = norm(JSON.parse(hist.pop())); relink(); sel = null; draft = []; live = null; placing = null; if (mode === 'photo') mode = 'select'; lastPush = { k: '', t: 0 }; refresh(true); }
const elById = id => S.els.find(e => e.id === id), runById = id => S.runs.find(e => e.id === id), phById = id => S.photos.find(e => e.id === id);
const wide = () => window.matchMedia('(min-width: 901px)').matches;

/* ---------- views ---------- */
function fitBox(bb, pad) { return { x: bb[0] - pad, y: -bb[3] - pad, w: bb[2] - bb[0] + 2 * pad, h: bb[3] - bb[1] + 2 * pad }; }
function applyVB(n) { const v = VB[n]; if (v) SVG[n].setAttribute('viewBox', r3(v.x) + ' ' + r3(v.y) + ' ' + r3(v.w) + ' ' + r3(v.h)); }
function unit(n) { const m = SVG[n].getScreenCTM(); return m && m.a ? 1 / m.a : (VB[n] ? VB[n].w / Math.max(1, SVG[n].clientWidth) : 0.05); }
function toSvg(n, x, y) { const m = SVG[n].getScreenCTM(); if (!m) return [0, 0]; const p = new DOMPoint(x, y).matrixTransform(m.inverse()); return [p.x, p.y]; }
const shown = n => view === n || (view === 'both' && n !== 'sheets');
const GRID_R = '<defs><pattern id="gr" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="scale(.2)"><path class="g1" d="M1 0V5M2 0V5M3 0V5M4 0V5M0 1H5M0 2H5M0 3H5M0 4H5"/><path class="g5" d="M0 0V5M0 0H5"/></pattern></defs><rect x="-200" y="-200" width="400" height="400" fill="url(#gr)"/>';      /* in a room: 1 m squares, 0.2 m lines */
const GRID = '<defs><pattern id="gr" width="5" height="5" patternUnits="userSpaceOnUse"><path class="g1" d="M1 0V5M2 0V5M3 0V5M4 0V5M0 1H5M0 2H5M0 3H5M0 4H5"/><path class="g5" d="M0 0V5M0 0H5"/></pattern></defs><rect x="-1000" y="-1000" width="2000" height="2000" fill="url(#gr)"/>';
let topFix = 0, topFit = null;      /* topFit: the text size and the zoom when the sketch was last fitted */
/* while the inside of a cabin is sketched: what is outside it, and where a cable ladder or the cable arrives at its walls */
let roomCtx = null;
function ctxNow() { const c = cabinNow(); return roomCtx = S.room && c ? outsideOf(ROOT, c, 3) : null; }
const noGhost = P => P.filter(p => p.lay !== 'gh');
function drawTop() {
  /* text on the sketch is sized for the screen it is on, so it stays readable on a phone */
  const lo = S.room ? 0.04 : 0.22;
  if (needFit.top || !VB.top || !topFix) { const m = Math.max(S.site.L, S.site.W), base = clamp(m / 62, lo, 1.5); topFix = clamp(10 * m * 1.35 / (SVG.top.clientWidth || 600), base, base * 2.5); }
  const r = buildTop(S, { th: topFix, labels: true, dims: true, north: true, photos: !S.room, short: (SVG.top.clientWidth || 600) < 760, ctx: ctxNow(), inside: true }); topTh = r.th; topLabs = r.labs || []; { const c = document.querySelector('#vTop .cap'); if (c) c.textContent = (S.room ? 'Floor of the cabin · sketch here · grey: what is outside' : 'Top view · sketch here') + (r.skipped ? ' · zoom in for ' + r.skipped + ' more name' + (r.skipped === 1 ? '' : 's') : ''); }
  const fit = needFit.top || !VB.top; if (fit) { VB.top = fitBox(primBox(noGhost(r.prims)), S.room ? 1 : 1.2); needFit.top = false; }
  SVG.top.innerHTML = (S.room ? GRID_R : GRID) + '<g>' + svgPrims(r.prims) + '</g><g id="ov"></g>'; applyVB('top'); if (fit) topFit = { th: topFix, u: unit('top'), min: clamp(Math.max(S.site.L, S.site.W) / 62, lo, 1.5) * 0.7 }; drawOverlay();
}
let isoFix = null;
function drawIso() {
  /* the model takes about two thirds of the panel and the notes are kept inside the panel's shape.
     A wide panel gets the full wording, in the proportions of the printed sheet. A narrow one (phone, split view) gets short names it can show at a readable size. */
  const only = focus ? { only: focus, turn: focusTurn } : null;
  if (needFit.iso || !VB.iso || !isoFix) {
    const bb = primBox(buildIso(S, Object.assign({ labels: false }, only)).prims), cw = SVG.iso.clientWidth || 700, ch = Math.max(200, (SVG.iso.clientHeight || 500) - 34), k = Math.min(cw / ((bb[2] - bb[0]) * 1.5), ch / ((bb[3] - bb[1]) * 1.3)), short = cw < 760;   /* 34 px at the top are the panel's caption */
    isoFix = { th: clamp((short ? clamp(cw / 105, 5.4, 6.8) : clamp((bb[2] - bb[0]) * k / 125, 7, 10)) / k, small() ? 0.012 : 0.1, 4), box: [cw / k * 0.96, ch / k * 0.96], short, cap: 34 / k };
  }
  /* at a fit the notes may use the room the panel has; after that they stay inside what is in view, so an edit never pushes one off the screen */
  const fit = needFit.iso || !VB.iso || !isoFix.rect, r = buildIso(S, Object.assign({ th: isoFix.th, box: fit ? isoFix.box : null, rect: fit ? null : isoFix.rect, short: isoFix.short, screen: 1, ctx3: S.room ? (ctxNow() || {}).lines3 : null }, only));
  if (fit) { const v = VB.iso = fitBox(primBox(noGhost(r.prims)), isoFix.th), p = isoFix.th * 0.5; isoFix.rect = [v.x + p, -(v.y + v.h) + p, v.x + v.w - p, -v.y - p]; v.y -= isoFix.cap; v.h += isoFix.cap; needFit.iso = false; }
  isoHits = r.hits || []; isoSc = r.sc || null; isoLabs = r.labs || []; { const c = $('#capIso'); if (c) c.textContent = (focus ? 'Cabinet with its door open · drag an item up or down' : S.room ? 'Inside the cabin · follows the sketch · grey dashes: the ladder and cable outside' : 'Isometric · follows the sketch') + (r.skipped ? ' · zoom in for ' + r.skipped + ' more name' + (r.skipped === 1 ? '' : 's') : ''); }
  SVG.iso.innerHTML = svgPrims(r.prims) + '<g id="ovI"></g>'; applyVB('iso'); if (fit) { isoFix.th0 = isoFix.th; isoFix.u0 = unit('iso'); } drawIsoOverlay();
}
/* Labels are laid out again when the zoom changes. Zoomed in, the text keeps its size on the screen, so it is smaller against the model
   and more names find room on their items. Zoomed out again, it goes back to the size it had at the fit. */
let zoomT = 0;
function relabel() {
  clearTimeout(zoomT);
  zoomT = setTimeout(() => {
    if (shown('iso') && isoFix && isoFix.u0 && VB.iso) { const t = clamp(isoFix.th0 * unit('iso') / isoFix.u0, Math.min(isoFix.th0, small() ? isoFix.th0 * 0.45 : 0.14), isoFix.th0); if (Math.abs(Math.log(t / isoFix.th)) > 0.12) { isoFix.th = t; drawIso(); } }
    if (shown('top') && topFit && VB.top) { const t = clamp(topFit.th * unit('top') / topFit.u, Math.min(topFit.th, topFit.min), topFit.th); if (Math.abs(Math.log(t / topFix)) > 0.12) { topFix = t; drawTop(); } }
  }, 170);
}
function drawSheets() {
  const sh = sheetsNow(), gap = 14; let o = '';
  sh.forEach((s, i) => {
    o += '<g transform="translate(0 ' + i * (SH.H + gap) + ')"><rect class="sheetbg" x="0" y="' + (-SH.H) + '" width="' + SH.W + '" height="' + SH.H + '"/>';
    { const AI = allImg(); for (const im of s.images) if (AI[im.id]) o += '<image href="' + AI[im.id] + '" x="' + r3(im.x) + '" y="' + r3(-im.y - im.h) + '" width="' + r3(im.w) + '" height="' + r3(im.h) + '" preserveAspectRatio="none"/>'; }
    o += svgPrims(s.prims) + '</g>';
  });
  if (needFit.sheets || !VB.sheets) { VB.sheets = { x: -8, y: -SH.H - 8, w: SH.W + 16, h: SH.H + 16 }; needFit.sheets = false; }
  SVG.sheets.innerHTML = o; applyVB('sheets');
}
function tip(p) { const a = num(p.dir, 0) * D2R, r = 0.95 * topTh * 3.4; return [p.x + Math.sin(a) * r, p.y + Math.cos(a) * r]; }
function drawOverlay() {
  const g = SVG.top.querySelector('#ov'); if (!g) return;
  const u = unit('top'), r = 6.5 * u, L = S.site.L, W = S.site.W, fs = r3(13 * u); let o = '';
  const pts = P => P.map(p => r3(p[0]) + ',' + r3(-p[1])).join(' '), hd = (p, c) => '<circle class="ov-h' + (c || '') + '" cx="' + r3(p[0]) + '" cy="' + r3(-p[1]) + '" r="' + r3(r) + '"/>';
  if (sel && sel.k === 'el') {
    const e = elById(sel.id);
    if (e) {
      const P = elPoly(e), b = polyBox(P); o += '<polygon class="ov-sel" points="' + pts(P) + '"/>';
      if (e.t === 'cabin' && !S.room) { for (const q of cabinPorts(e)) o += hd(q.at, ' b'); for (const q of cabinDoors(e)) o += hd(doorAt(e, q), ' dr'); for (const q of cabinAcs(e)) o += hd(q.at, ' ac'); }          /* its porthole, doors and aircon units slide along the walls by these handles */
      if (b[0] > 0.05 && b[0] < L && e.y > 0 && e.y < W) o += '<path class="ov-g" d="M0 ' + r3(-e.y) + 'H' + r3(b[0]) + '"/><text class="ov-t" x="' + r3(b[0] / 2) + '" y="' + r3(-e.y - 4 * u) + '" font-size="' + fs + '" text-anchor="middle">' + f2(b[0]) + '</text>';
      if (b[1] > 0.05 && b[1] < W && e.x > 0 && e.x < L) o += '<path class="ov-g" d="M' + r3(e.x) + ' 0V' + r3(-b[1]) + '"/><text class="ov-t" x="' + r3(e.x + 5 * u) + '" y="' + r3(-b[1] / 2) + '" font-size="' + fs + '">' + f2(b[1]) + '</text>';
    }
  }
  if (sel && sel.k === 'run') { const l = runById(sel.id); if (l) { o += '<polyline class="ov-g" points="' + pts(l.pts) + '"/>'; for (const p of l.pts) o += hd(p, ' g'); } }
  if (S.room && !focus && (!sel || sel.k === 'rdoor') && mode !== 'run' && mode !== 'route') S.gates.forEach(q => { const hz = q.side === 'S' || q.side === 'N', c = num(q.off, 0) + num(q.w, 0.9) / 2; o += hd(hz ? [c, q.side === 'S' ? 0 : S.site.W] : [q.side === 'W' ? 0 : S.site.L, c], ' dr'); });      /* the doors of the room, by their handles */
  if (!S.room && (mode === 'run' || mode === 'route')) for (const e of S.els) if (e.t === 'cabin') for (const q of cabinPorts(e)) o += '<circle class="ov-d" cx="' + r3(q.at[0]) + '" cy="' + r3(-q.at[1]) + '" r="' + r3(1.7 * r) + '"/>';      /* where a ladder or the cable goes into a cabin */
  if (mode === 'run' && draft.length) { o += '<polyline class="ov-d" points="' + pts(draft) + '"/>'; for (const p of draft) o += hd(p, ' g'); }
  if (tab === 'route' || mode === 'route' || (sel && sel.k === 'pt')) for (const f of ['ae', 'ug']) S.route[f].pts.forEach((p, i) => { const up = f === 'ae' ? -8 : 17; o += hd([p.x, p.y], sel && sel.k === 'pt' && sel.f === f && sel.i === i ? ' on' : '') + '<text class="ov-n" x="' + r3(p.x + 9 * u) + '" y="' + r3(-p.y + up * u) + '" font-size="' + fs + '">' + (f === 'ae' ? 'A' : 'U') + (i + 1) + '</text>'; });
  if (sel && sel.k === 'lab') { const l = topLabs.find(q => q.key === sel.key); if (l) o += '<polygon class="ov-sel" points="' + pts(l.poly) + '"/>'; }
  if (sel && sel.k === 'photo') { const p = phById(sel.id); if (p && p.placed) { const t = tip(p); o += '<circle class="ov-sel" cx="' + r3(p.x) + '" cy="' + r3(-p.y) + '" r="' + r3(1.5 * topTh) + '"/><path class="ov-g" d="M' + r3(p.x) + ' ' + r3(-p.y) + 'L' + r3(t[0]) + ' ' + r3(-t[1]) + '"/>' + hd(t, ' v'); } }
  if (live && live.length > 1) o += '<polyline class="ov-s" points="' + pts(live) + '"/>';
  g.innerHTML = o;
}
/* the isometric can be edited too: the selected item is outlined, and a round handle with an up-down arrow changes its height or depth */
function drawIsoOverlay() {
  const g = SVG.iso.querySelector('#ovI'); if (!g) return; const u = unit('iso'), r = 8 * u; let o = '';
  const pts = P => P.map(p => r3(p[0]) + ',' + r3(-p[1])).join(' ');
  const hd = p => { const x = p[0], y = -p[1], a = 0.5 * r, b = 0.26 * r; return '<g class="ov-z"><circle cx="' + r3(x) + '" cy="' + r3(y) + '" r="' + r3(r) + '"/><path d="M' + r3(x) + ' ' + r3(y - a) + 'V' + r3(y + a) + 'M' + r3(x - b) + ' ' + r3(y - a + b) + 'L' + r3(x) + ' ' + r3(y - a) + 'L' + r3(x + b) + ' ' + r3(y - a + b) + 'M' + r3(x - b) + ' ' + r3(y + a - b) + 'L' + r3(x) + ' ' + r3(y + a) + 'L' + r3(x + b) + ' ' + r3(y + a - b) + '"/></g>'; };
  if (sel && sel.k === 'el') { const h = isoHits.find(q => q.k === 'el' && q.id === sel.id); if (h) { o += '<polygon class="ov-sel" points="' + pts(h.poly) + '"/>'; if (h.hp) o += hd(h.hp); if (h.lp) o += '<circle class="ov-h g" cx="' + r3(h.lp[0]) + '" cy="' + r3(-h.lp[1]) + '" r="' + r3(0.8 * r) + '"/>'; } }
  if (sel && sel.k === 'run') { const h = isoHits.find(q => q.k === 'run' && q.id === sel.id); if (h) o += '<polyline class="ov-g w" points="' + pts(h.line) + '"/>' + (h.hp ? hd(h.hp) : ''); }
  if (tab === 'route' || (sel && sel.k === 'pt')) { const h = isoHits.find(q => q.k === 'aer'); if (h) o += hd(h.hp); }
  if (sel && sel.k === 'lab') { const l = isoLabs.find(q => q.key === sel.key); if (l) o += '<polygon class="ov-sel" points="' + pts(l.poly) + '"/>'; }
  g.innerHTML = o;
}
/* fast = in the middle of a drag: the isometric is heavier to draw, so it follows a few times a second */
function drawViews(fast) { $('#views').dataset.v = view; if (shown('top')) drawTop(); if (shown('iso') && !(fast && performance.now() - isoT < 130)) { drawIso(); isoT = performance.now(); } if (shown('sheets')) drawSheets(); }
function setView(v) { if (v === 'both' && !wide()) v = 'top'; if ((v === 'both') !== (view === 'both')) needFit.iso = needFit.top = true; view = v; if (v !== 'both') active = v; else if (active === 'sheets') active = 'top'; refresh(false); }
function needTop() { if (!focus && !shown('top')) setView(wide() ? 'both' : 'top'); }

/* ---------- top bar, mode bar, status ---------- */
function drawChrome() {
  const g = routeGeom(S), cab = cabinNow(), room = !!S.room, odc = focus ? elById(focus) : null;
  $('#who').textContent = [ROOT.site.name, ROOT.site.id].filter(Boolean).join(' · ') + (cab ? '  ›  inside ' + elLabel(ROOT, cab) : odc ? '  ›  ' + elLabel(S, odc) : '');
  $('#bUndo').disabled = !hist.length; $('#views').dataset.v = view; $('#bTurn').hidden = view === 'top';
  $('#bBack').hidden = !(cab || odc); $('#bDone').hidden = !!(cab || odc); drawGuide();
  $('#segView').hidden = !!focus; $('#tabs').hidden = !!focus;
  for (const b of document.querySelectorAll('#segView button')) { b.setAttribute('aria-selected', b.dataset.v === view); if (b.dataset.v === 'sheets') b.hidden = room; }
  for (const b of document.querySelectorAll('#tabs button')) { const t = b.dataset.tab; b.setAttribute('aria-selected', t === tab); b.hidden = room && (t === 'photos' || t === 'table' || t === 'export'); if (t === 'site') b.textContent = room ? 'Cabin' : 'Site'; if (t === 'route') b.textContent = room ? 'Cable' : 'Route'; }
  const mb = $('#modebar'); let h = '';
  const al = '<button class="b s" data-a="align-toggle" aria-pressed="' + autoAlign + '">Auto-align ' + (autoAlign ? 'on' : 'off') + '</button>';
  if (mode === 'route') h = '<span>' + (room ? 'Cable' : fib.toUpperCase() + ' fiber') + ': drag to draw it, or tap points</span>' + al + '<button class="b s" data-a="route-undo"' + (S.route[fib].pts.length ? '' : ' disabled') + '>Remove last</button><button class="b s" data-a="route-done">Done</button>';
  else if (mode === 'run') h = '<span>Drag to draw the ' + RUNS[runKind].n.toLowerCase() + ', or tap points' + (draft.length ? ' (' + draft.length + ')' : '') + '</span>' + al + '<button class="b s" data-a="run-done">Done</button>';
  else if (mode === 'photo') h = '<span>Tap where photo ' + (S.photos.findIndex(p => p.id === placing) + 1) + ' was taken</span><button class="b s" data-a="photo-cancel">Cancel</button>';
  mb.hidden = !h; mb.innerHTML = h;
  let s = '<span class="h">' + (dragNote || (mode === 'route' || mode === 'run' ? 'Drag draws · two fingers or Shift+drag move the view' : cursor || (mode === 'select' ? (sel && sel.k === 'lab' ? 'Drag the label to move it · it stays with its item' : focus ? 'Tap an item, then drag it up or down · it snaps to the free rack units' : active === 'iso' && view !== 'top' ? 'Tap an item, then drag · round handle: height' : 'Drag to move · tap to edit · tap a name twice to pick the label') : ''))) + '</span>';
  if (room) { if (g.sum.ugt > 0.05) s += '<span>Cable inside <b>' + f1(g.sum.ugt) + ' m</b></span>'; }
  else if (g.sum.total > 0.05) s += '<span>FOC AE <b>' + f1(g.sum.ae) + ' m</b> · UG <b>' + f1(g.sum.ugt) + ' m</b></span>';
  { const nw = g.warn.length + g.notes.length; if (nw && !focus) s += '<button class="w" data-a="go-route">' + nw + ' to check</button>'; }
  $('#status').innerHTML = s;
}

/* ---------- side panel ---------- */
const fid = k => 'f_' + k.replace(/\W/g, '_');
const F = (label, k, v, attrs) => '<label class="f"><span>' + label + '</span><input id="' + fid(k) + '" data-k="' + k + '" value="' + esc(v == null ? '' : v) + '" ' + (attrs || 'type="number" step="0.1" inputmode="decimal"') + '></label>';
const Sel = (label, k, v, opts) => '<label class="f"><span>' + label + '</span><select id="' + fid(k) + '" data-k="' + k + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
const TXT = 'type="text" autocomplete="off"';
function tabSite() {
  const s = S.site, b = num(s.bearing, 0); let h = '';
  if (S.sample) h += '<div class="note">This is the made-up sample site, opened from a sketch file. The sheets say so.</div>';
  else if (!S.els.length) h += '<div class="note">Start here: set the site size, fence and gate. Then go to <b>Elements</b> for the tower and equipment, <b>Route</b> for the fiber, <b>Photos</b>, and <b>Export</b>.</div>';
  const LK = (a, k) => a + (APP.lock && APP.fix && APP.fix[k] != null && APP.fix[k] !== '' ? ' disabled' : '');
  h += '<h3>Site</h3><div class="row">' + F('Site name', 'site.name', s.name, LK(TXT, 'name')) + F('Site ID', 'site.id', s.id, LK(TXT, 'id')) + '</div>';
  h += '<div class="row">' + F('Latitude (decimal °)', 'site.lat', s.lat, LK('type="number" step="any" inputmode="decimal" placeholder="6.198889"', 'lat')) + F('Longitude (decimal °)', 'site.lon', s.lon, LK('type="number" step="any" inputmode="decimal" placeholder="125.182306"', 'lon')) + '</div>';
  if (APP.lock) h += '<p class="hint">The name, the ID and the coordinates come from the site pin of the project. To change them, change the pin.</p>';
  else if (APP.gps && !S.room && !VIEW) h += '<div class="btns"><button class="b s" data-a="gps">Use this phone\'s GPS position</button></div>';
  h += '<div class="row">' + Sel('Coordinates taken at', 'site.anchor', s.anchor, [['tower', 'Tower centre'], ['sw', 'Bottom-left corner']]) + F('Top side faces (° from true north)', 'site.bearing', s.bearing, 'type="number" step="1" min="0" max="360" inputmode="decimal"') + '</div>';
  h += '<p class="hint">Stand inside the site and face the side that is at the top of your sketch. Type the compass reading. 0 means the top of the sketch is north' + (b ? '; now it is ' + f1(b) + '°' : '') + '.</p>';
  h += '<h3>Perimeter</h3><div class="one">' + Sel('Site type', 'site.kind', s.kind, [['fenced', 'Fenced ground site'], ['unfenced', 'Unfenced ground site'], ['rooftop', 'Rooftop']]) + '</div>';
  h += '<div class="row">' + F('Width, left to right (m)', 'site.L', s.L) + F('Depth, bottom to top (m)', 'site.W', s.W) + '</div>';
  if (s.kind === 'rooftop') h += '<div class="one">' + F('Building height (m)', 'site.bh', s.bh) + '</div>';
  if (s.kind === 'fenced') {
    h += '<div class="row">' + Sel('Fence', 'site.fence', s.fence, [['chb', 'Concrete (CHB) wall'], ['cyc', 'Cyclone wire'], ['barb', 'Barbed wire']]) + F('Fence height (m)', 'site.fh', s.fh) + '</div>';
    h += '<div class="row">' + F('Post spacing (m)', 'site.post', s.post) + (s.fence === 'barb' ? '<span></span>' : Sel('Barbed wire on top', 'site.wire', num(s.wire, 0) ? 1 : 0, [[1, 'Yes'], [0, 'No']])) + '</div>';
    h += '<div class="one">' + Sel('Fence in the isometric', 'site.cut', s.cut === 'none' ? 'none' : 'near', [['near', 'Leave out the two near sides, to show the site'], ['none', 'Draw the whole fence']]) + '</div>';
    h += '<h3>Gates</h3>';
    S.gates.forEach((q, i) => { const hz = q.side === 'S' || q.side === 'N'; h += '<div class="row3">' + Sel('Side', 'gate.' + i + '.side', q.side, [['S', 'Bottom'], ['N', 'Top'], ['W', 'Left'], ['E', 'Right']]) + F('From ' + (hz ? 'left' : 'bottom') + ' (m)', 'gate.' + i + '.off', q.off) + F('Width (m)', 'gate.' + i + '.w', q.w) + '<button class="b s ic d" data-a="gate-del" data-i="' + i + '" aria-label="Remove gate">×</button></div>'; });
    h += '<div class="btns"><button class="b s" data-a="gate-add">Add a gate</button></div>';
  }
  h += '<h3>Drawing</h3><div class="row">' + '<label class="f"><span>Prepared by (on the sheets)</span><input value="' + esc(APP.by || '') + '" disabled></label>' + F('Show towers up to (m)', 'site.towerShow', s.towerShow, 'type="number" step="1" min="3" inputmode="decimal" placeholder="lower half"') + '</div>';
  h += '<p class="hint">Towers are drawn at their real size. One higher than 15 m is drawn from the ground up to half its height, or up to the height you type above, and its label says how much is shown.</p>';
  h += '<div class="row">' + F('Project (title block and cover)', 'site.link', s.link, TXT + ' placeholder="' + esc(APP.link || 'for example MW TO FOC PROJECT') + '"') + (APP.org ? '<label class="f"><span>Company (title block)</span><input value="' + esc(APP.org) + '" disabled></label>' : F('Company (title block)', 'site.org', s.org, TXT)) + '</div>';
  h += '<p class="hint">Prepared by is the person who exports the plan (Your details in G-eSAA). Checked by is the coordinator who accepted the task' + (APP.checkedBy ? ': ' + esc(APP.checkedBy) : '') + '. Approved by is left empty, for a signature.</p>';
  if (!S.room) {
    h += '<h3>Logos</h3><div class="row">' + [['vendor', 'Your company'], ['client', 'Client']].map(q => '<div class="f"><span>' + q[1] + '</span><div class="btns">' + (LOGO[q[0]] ? '<img alt="' + q[1] + ' logo" src="' + LOGO[q[0]].src + '" style="height:34px;max-width:96px;object-fit:contain;background:#fff;border-radius:4px;padding:2px">' : '<span class="nologo">none yet</span>') + (q[0] === 'vendor' && APP.canLogo && !VIEW ? '<button class="b s" data-a="logo-set">' + (LOGO.vendor ? 'Change' : 'Add logo') + '</button>' + (LOGO.vendor ? '<button class="b s d" data-a="logo-del">Remove</button>' : '') : '') + '</div></div>').join('') + '</div>';
    h += '<p class="hint">Both go on the cover and in the title block of every sheet. Your company\'s logo is set once and is the same on your company\'s plan drawings' + (APP.canLogo ? '' : ' (' + esc(APP.logoNote || 'set in Settings, Exports') + ')') + '. The client\'s logo is set by the admin, for everyone.</p>';
    h += '<h3>As on the hand-made plans</h3><div class="one">' + Sel('What is buried, in the isometric', 'site.below', s.below === 'depth' ? 'depth' : 'flat', [['flat', 'At ground level: conduit as a strip, service box flat'], ['depth', 'With its depth, dashed below the ground']]) + '</div>';
    h += '<div class="one">' + Sel('Closure on the riser pole', 'site.clo', s.clo === 'none' ? 'none' : 'auto', [['auto', 'Yes: AE and UG cable meet in it'], ['none', 'Not needed: one cable, up the riser and on']]) + '</div>';
    h += '<p class="hint">The conduit is 2 runs of ' + PVC_MM + ' mm PVC, concrete encased, with 4 x 32 mm sub-ducts, and the G.I. riser pipe is ' + PVC_MM + ' mm, as on the hand-made plans. Lengths and tables always use the real depth.</p>';
  }
  h += '<h3>Names on the drawing</h3><div class="one">' + Sel('Size of the names', 'site.txt', txAuto(S) ? 'auto' : String(Math.round(txK(S) * 100)), [['auto', 'Automatic'], ['70', 'Small, 1.5 mm on the sheet'], ['85', '1.8 mm'], ['100', 'Standard, 2.2 mm'], ['120', '2.6 mm'], ['140', '3.0 mm'], ['170', 'Large, 3.7 mm']]) + '</div>';
  h += '<p class="hint">Automatic: a name is written at the standard size on its item or beside it. One that finds no room there is written smaller, never under 1.8 mm on the A3 sheet (the usual least size of text on a drawing), If there is still no room it is written right beside the item even across a line of the drawing (the line is broken under the name), and gets a leader with an arrow only when that does not work either. A long name, such as the one of a proposed conduit, goes to clear space in a few lines with a leader and an arrowhead, as on the hand-made plans. A proposed item says PROPOSED; lengths are in green. A size you pick is used for every name.</p>';
  for (let i = 0; i < NAMES.length; i += 2) h += '<div class="row">' + NAMES.slice(i, i + 2).map(q => Sel(q[1], 'site.nm.' + q[0], nameOn(S, q[0]) ? 1 : 0, [[1, 'Shown'], [0, 'Hidden']])).join('') + (i + 1 < NAMES.length ? '' : '<span></span>') + '</div>';
  h += '<p class="hint">The plan is about the fiber, so the names of the tower site itself are left out unless you turn them on. The items are still drawn. The site name and ID are written beside the top of the tower, in bold and larger than the other names; tap them to drag or retype.</p>';
  return h;
}
/* what a rack or cabinet holds, in words */
const rackSays = h => { const K = rackOf(h), n = rackItems(S, h).length; return elLabel(S, h) + ', ' + K.n + ' rack units' + (n ? ', ' + n + ' item' + (n === 1 ? '' : 's') + ' in it' : ', empty'); };
/* what the porthole of the room lines up with outside */
function portHint(e) {
  const C = ctxNow(), M = C ? C.marks : [], mk = M.find(q => Math.hypot(q.x - e.x, q.y - e.y) < 0.12), what = q => q.kind === 'ladder' ? 'cable ladder' : 'cable';
  let h = '<p class="hint">The porthole sits on the wall nearest to where you drag it. The cabin on the site plan shows it on the same wall.</p>';
  if (mk) { const want = r2(mk.z + 0.1), off = mk.kind === 'ladder' && mk.z > 0.3 && Math.abs(want - num(e.z, 0)) > 0.03; h += '<div class="note">In line with the ' + what(mk) + ' outside, which arrives ' + f2(mk.z) + ' m above the floor.' + (off ? ' The porthole is at ' + f2(num(e.z, 0)) + ' m.' : '') + '</div>' + (off ? '<div class="btns"><button class="b s" data-a="port-level" data-z="' + want + '">Put the porthole at the height of that ladder</button></div>' : ''); }
  else if (M.length) h += '<div class="warn">Not in line with what arrives outside. A grey arrow on the wall marks where the ' + what(M[0]) + ' outside meets the cabin. Drag the porthole to it and it snaps there.</div>';
  else h += '<p class="hint">Nothing arrives at this cabin from outside yet. On the site, draw the cable ladder or the UG fiber to the cabin wall: it will show here in grey, with an arrow on the wall.</p>';
  return h;
}
/* what the app draws by the OSP standard for this element */
function stdHint(e) {
  const t = e.t === 'rpole' ? 'By the standard: the pole stands ' + f2(STD.poleUp) + ' m above the ground and ' + f1(STD.poleIn) + ' m in it, in a concrete encasement (' + f2(STD.encUp) + ' m above ground, ' + f2(STD.encDn) + ' m below). The G.I. pipe comes up through the encasement and lies against the pole, held by stainless straps; above it the U-guard up to the cable. The closure stands above the loop holder.'
    : e.t === 'clo' ? 'On a pole it stands upright, ' + f0(STD.gap * 1000) + ' mm above the loop holder. The loop is ' + f0(STD.loopD * 1000) + ' mm across and sits ' + f0(STD.gap * 1000) + ' mm above the wire. Give the pole a loop on the Route tab.'
    : e.t === 'exit' ? 'A concrete block with the two ' + PVC_MM + ' mm pipes that come up in it. The cable is in one of them; the spare one is closed with a blank duct plug.'
    : e.t === 'sbox' ? (SBOX[e.ty] ? 'Type ' + e.ty + ': ' + SBOX[e.ty].inn + ' mm inside. Drawn at the size of its frame, ' + f2(SBOX[e.ty].w) + ' x ' + f2(SBOX[e.ty].d) + ' m, and ' + f2(SBOX[e.ty].dp) + ' m deep.' : 'Pick a type of the standard (A1, A2, B1, B2) and the box takes its size and depth.') : '';
  return t ? '<p class="hint">' + t + '</p>' : '';
}
function inspector(e) {
  const T = TYPES[e.t], b = polyBox(elPoly(e)), L = S.site.L, W = S.site.W, sq = ['t3', 't4', 'guy', 'rtt'].includes(e.t), sd = S.room ? 'wall' : 'side', host = rackHost(S, e);
  if (host) {                                             /* an item in a rack: where it is in the rack is what matters */
    const K = rackOf(host), q = rackSlots(S, host).find(k => k.e === e) || { u: 1, ru: units(e) };
    let h = '<div class="insp"><div class="insp-h"><b>' + esc(T.n) + '</b><button class="b s" data-a="dup">Copy</button><button class="b s d" data-a="del">Delete</button></div>';
    if (host.t === 'odc' && !focus && !S.room) h += '<div class="btns"><button class="b p" data-a="focus-in" data-id="' + host.id + '">Open the rack of ' + esc(elLabel(S, host)) + '</button></div>';
    h += '<div class="row">' + F('Label on the drawing', 'el.name', e.name, TXT + ' placeholder="' + esc((T.cn || T.s).toUpperCase()) + '"') + Sel('Status', 'el.st', e.st, [['E', 'Existing'], ['P', 'Proposed']]) + '</div>';
    h += '<div class="row">' + F('Rack unit, from the bottom', 'el.u', q.u, 'type="number" step="1" min="1" max="' + K.n + '" inputmode="numeric"') + F('Height (rack units)', 'el.ru', q.ru, 'type="number" step="1" min="1" max="30" inputmode="numeric"') + '</div>';
    if (e.t === 'odf') h += '<div class="row">' + F('Size', 'el.size', e.size, TXT) + '<span></span></div>';
    return h + '<p class="hint">In ' + esc(rackSays(host)) + '. It takes ' + uText(q) + '. In the isometric, tap it and drag it up or down: it snaps to the free units.' + (focus ? '' : ' Drag it on the plan to take it out or to put it in another rack.') + '</p></div>';
  }
  let h = '<div class="insp"><div class="insp-h"><b>' + esc(T.n) + '</b><button class="b s" data-a="rot">Turn 90°</button><button class="b s" data-a="dup">Copy</button><button class="b s d" data-a="del">Delete</button></div>';
  if (e.t === 'cabin' && !S.room) { const I = e.inside, n = I ? I.els.filter(q => q.t !== 'port' && q.t !== 'ac').length : 0; h += '<div class="btns"><button class="b p" data-a="room-in">Open the inside</button></div><p class="hint">' + (n ? 'Inside: ' + n + ' item' + (n === 1 ? '' : 's') + (routeGeom(I).sum.ugt > 0.05 ? ', ' + f1(routeGeom(I).sum.ugt) + ' m of cable' : '') + '. ' : '') + 'Sketch the floor of the cabin: racks, the ODF at its rack units, the porthole and the indoor cable ladder. The app draws the inside view and puts it on the Details sheet. On the site plan and in the isometric the racks and the ODF show dashed, as seen through the cabin.</p><p class="hint"><b>Porthole:</b> the round blue handle on the wall of the cabin. Drag it along the walls; it snaps to the end of a cable ladder or of the UG fiber. A cable ladder drawn to the cabin stops at its wall, and what is sketched inside shows in grey.</p>'; }
  if (e.t === 'cabin' && !S.room) h += cabinParts(e);      /* its doors and aircon units */
  if (e.t === 'odc' && !S.room) h += '<div class="btns"><button class="b p" data-a="focus-in">Open the rack</button></div><p class="hint">' + esc(rackSays(e)) + '. Open it to see the cabinet with its door open and to set the rack units of its ODF. A cabinet that holds something goes on the Details sheet.</p>';
  if (e.t === 'rack') h += '<p class="hint">' + esc(rackSays(e)) + '. Its front is the side with the double line. Add an ODF or rack equipment: it goes into a rack by itself.</p>';
  h += '<div class="row">' + F('Label on the drawing', 'el.name', e.name, TXT + ' placeholder="' + esc(elLabel(S, Object.assign({}, e, { name: '' }))) + '"') + Sel('Status', 'el.st', e.st, [['E', 'Existing'], ['P', 'Proposed']]) + '</div>';
  h += '<div class="row">' + F('From left ' + sd + ' (m)', 'el.gl', f2(b[0])) + F('From right ' + sd + ' (m)', 'el.gr', f2(L - b[2])) + '</div><div class="row">' + F('From bottom ' + sd + ' (m)', 'el.gb', f2(b[1])) + F('From top ' + sd + ' (m)', 'el.gt', f2(W - b[3])) + '</div>';
  h += '<div class="row">' + (T.rd ? F('Diameter (m)', 'el.w', e.w) : sq ? F(e.t === 'guy' ? 'Mast face width (m)' : 'Base width, leg to leg (m)', 'el.w', e.w) : F('Width (m)', 'el.w', e.w) + (e.t === 'port' ? '' : F('Depth (m)', 'el.d', e.d)));
  h += T.g === 'tower' ? F('Tower height (m)', 'el.th', e.th) : F('Height (m)', 'el.h', e.h);
  if (e.t === 'guy') h += F('Guy anchors, from mast (m)', 'el.ar', e.ar);
  if (hasLad(e)) h += Sel('Ladder on the tower', 'el.lad', e.lad == null || e.lad === '' ? 'auto' : String(e.lad), [['auto', 'Where the cable ladder arrives']].concat(towerHull(e).map((q, i) => [String(i), 'Side ' + (i + 1)]), [['none', 'No ladder']]));
  if (e.t === 'odf') h += F('Size', 'el.size', e.size, TXT);
  if (inRack(e)) h += F('Height (rack units)', 'el.ru', units(e), 'type="number" step="1" min="1" max="30" inputmode="numeric"');
  if (e.t === 'sbox') h += Sel('Type', 'el.ty', e.ty || '', [['', 'Own size']].concat(Object.keys(SBOX).map(k => [k, k + ': ' + (k[0] === 'A' ? 'vertical' : 'horizontal') + ', conduit ' + f0(SBOX[k].cd * 1000) + ' mm deep'])));
  if (e.dp != null) h += F('Depth below ground (m)', 'el.dp', e.dp);
  if (e.z != null) h += F(e.t === 'port' ? 'Its middle above the floor (m)' : e.t === 'ac' ? 'Its bottom above the floor (m)' : 'Height above ground (m)', 'el.z', e.z);
  if (!T.rd && e.t !== 'port' && e.t !== 'ac') h += F('Turned (°)', 'el.rot', e.rot, 'type="number" step="5" inputmode="decimal"');
  return h + '</div>' + stdHint(e) + (e.t === 'ac' ? '<p class="hint">The outdoor unit stands outside the wall nearest to where you drag it. The cabin on the site plan shows it on the same wall. Delete it to have none.</p>' : '') + (hasLad(e) ? '<p class="hint">The tower has one ladder. A cable ladder that reaches the tower joins it. To put it somewhere else, pick a side here, or drag the green handle at its foot in the isometric.</p>' : '') + (e.t === 'port' ? portHint(e) : '') + (inRack(e) ? '<p class="hint">It is not in a rack. Drag it onto a rack' + (S.room ? '' : ' or an outdoor cabinet') + ' on the plan and it goes in.</p>' : '') + '</div>';
}
function tabEls() {
  const e = sel && sel.k === 'el' ? elById(sel.id) : null, ld = sel && sel.k === 'run' ? runById(sel.id) : null; let h = '';
  if (e) h += inspector(e);
  else if (ld) {
    const K = RUNS[ld.kind];
    h += '<div class="insp"><div class="insp-h"><b>' + esc(K.n) + '</b><button class="b s" data-a="run-more">Draw more</button><button class="b s d" data-a="del">Delete</button></div>';
    h += '<div class="row">' + Sel('Kind', 'run.kind', ld.kind, (S.room ? ['ladder', 'part'] : Object.keys(RUNS).filter(k => !RUNS[k].room)).map(k => [k, RUNS[k].n])) + Sel('Status', 'run.st', ld.st, [['E', 'Existing'], ['P', 'Proposed']]) + '</div>';
    h += '<div class="row">' + F('Label on the drawing', 'run.name', ld.name, TXT + ' placeholder="' + esc(K.cap) + '"') + F(ld.kind === 'conduit' ? 'Size of one pipe (m)' : ld.kind === 'part' ? 'Thickness (m)' : 'Width (m)', 'run.w', ld.w, 'type="number" step="0.01" inputmode="decimal"') + '</div>';
    if (ld.kind !== 'part') h += '<div class="row">' + (ld.kind === 'trench' ? F('Depth of the excavation (m)', 'run.dp', ld.dp == null ? UGD : ld.dp) + '<span></span>' : ld.kind === 'ladder' ? F(S.room ? 'Height above the floor (m)' : 'Height above ground (m)', 'run.z', ld.z) + '<span></span>' : F('Height above ground (m), 0 = buried', 'run.z', ld.z) + (buried(ld) ? F('Depth below ground (m)', 'run.dp', ld.dp == null ? UGD : ld.dp) : '<span></span>')) + '</div>';
    h += '<p class="hint">Length ' + f1(runLen(ld)) + ' m. Drag its points on the plan.' + (ld.kind === 'part' ? ' A wall from floor to ceiling. An end dragged near a wall of the cabin goes onto it. The cable is not stopped by it.' : ld.kind === 'ladder' ? (S.room ? ' The cable lies on the ladder at the ladder\'s own height. Indoors the ladder hangs from the ceiling. Start it on the porthole and end it over the rack.' : ' The UG fiber lies on a ladder at the ladder\'s own height. A ladder that reaches a lattice tower joins the tower\'s own ladder. One that ends on the porthole of a cabin carries the cable to it.') : ' The UG fiber that is drawn along it runs in it, at its depth.' + (ld.kind === 'conduit' ? ' It is drawn as two pipes, green on top of black, as the standard has it (2 runs of 50 mm HDPE); the cable goes in the black one.' : '')) + '</p></div>';
  }
  else if (S.room) h += '<p class="hint">Tap a button to put that item in the room, then drag it into place. An ODF or rack equipment goes into a rack by itself; drag it up or down in the isometric to set its rack units. The porthole and an aircon unit go to the wall nearest to where you drag them; the aircon stands outside it. Doors are set in the Cabin tab.</p>';
  else h += '<p class="hint">Tap a button to put that item in the middle of the site. Then drag it into place, or type its distances from the fence. Tap anything on the plan or on the isometric to edit it. Items that belong together snap together: an ODF into its cabinet, a closure onto a pole or into a hand hole, a hand hole or service box onto a conduit, trench or underground cable. Every name on the drawing is a label you can drag and retype: tap it, or tap it a second time when it is written on its item.</p>';
  for (const [title, list] of S.room ? [['In the cabin', ['rack', 'odf', 'runit', 'port', 'ac', 'box']]] : [['tower', 'Tower'], ['equip', 'On site now'], ['foc', 'For the fiber']].map(q => [q[1], Object.keys(TYPES).filter(t => TYPES[t].g === q[0])])) h += '<h3>' + title + '</h3><div class="pal">' + list.map(t => '<button class="b s" data-a="add" data-t="' + t + '">' + esc(TYPES[t].n) + '</button>').join('') + '</div>';
  h += '<h3>Lines you draw</h3><div class="pal">' + (S.room ? ['ladder', 'part'] : Object.keys(RUNS).filter(k => !RUNS[k].room)).map(k => '<button class="b s" data-a="run-draw" data-kind="' + k + '"' + (mode === 'run' && runKind === k ? ' aria-pressed="true"' : '') + '>' + esc(RUNS[k].n) + '</button>').join('') + '</div>';
  h += S.room ? '<p class="hint">Pick one, then drag on the floor plan the way it runs. A cable ladder goes from the porthole to over the racks; the cable is drawn in the Cable tab. A partition wall divides the room, from floor to ceiling; its ends snap to the walls.</p>' : '<p class="hint">Pick one, then drag on the plan the way the line runs. The app straightens it, squares the corners and snaps it to poles, hand holes, cabinets and the porthole of a cabin. The two fibers are drawn in the Route tab.</p>';
  h += '<h3>On the plan (' + (S.els.length + S.runs.length) + ')</h3>';
  for (const q of S.els) h += '<button class="li" data-a="sel" data-kind="el" data-id="' + q.id + '"' + (e === q ? ' aria-current="true"' : '') + '><i class="dot ' + (q.st === 'P' ? 'P' : TYPES[q.t].g === 'tower' ? 'T' : '') + '"></i>' + esc(q.name || TYPES[q.t].n) + '<span>' + (rackHost(S, q) ? uText(rackSlots(S, rackHost(S, q)).find(k => k.e === q) || { u: 1, ru: 1 }) : f1(q.x) + ', ' + f1(q.y)) + '</span></button>';
  for (const q of S.runs) h += '<button class="li" data-a="sel" data-kind="run" data-id="' + q.id + '"' + (ld === q ? ' aria-current="true"' : '') + '><i class="dot ' + (q.st === 'P' ? 'P' : q.kind === 'ladder' ? 'L' : '') + '"></i>' + esc(q.name || RUNS[q.kind].n) + '<span>' + f1(runLen(q)) + ' m</span></button>';
  return h;
}
function tabRoute() {
  const R = S.route, g = routeGeom(S), s = g.sum;
  let h = '<p class="hint">Two fibers on one plan. <b>AE</b> comes in on poles from outside and ends on the riser pole. <b>UG</b> starts on that pole, goes down the riser pipe, runs in the trench or conduit and on the cable ladder, and ends on the ODF. They meet in the closure on the pole.</p>';
  for (const n of g.notes) h += '<div class="warn">' + esc(n) + '</div>';
  for (const w of g.warn) h += '<div class="warn">UG leg ' + (w.leg + 1) + ' runs through ' + esc(w.names.join(', ')) + '. Move a point or change the run.</div>';
  if (g.join && g.join.pole) h += '<div class="note">AE and UG meet on the riser pole. The closure stands on the pole above the loop holder, its cable ports ' + f1(g.join.z) + ' m above the ground' + (g.join.auto ? ' (the app drew it)' : '') + '. The UG cable comes up the G.I. pipe and the U-guard to it.</div>';
  for (const f of ['ae', 'ug']) {
    const Q = R[f], n = Q.pts.length, on = mode === 'route' && fib === f;
    h += '<h3>' + (f === 'ae' ? 'AE fiber (aerial)' : 'UG fiber (underground)') + '</h3><div class="btns">';
    h += on ? '<button class="b p" data-a="route-done">Done drawing</button><button class="b" data-a="route-undo"' + (n ? '' : ' disabled') + '>Remove last point</button>' : '<button class="b p" data-a="route-draw" data-f="' + f + '">' + (n ? 'Add more points' : 'Draw the ' + f.toUpperCase() + ' fiber') + '</button><button class="b" data-a="route-clear" data-f="' + f + '"' + (n ? '' : ' disabled') + '>Clear</button>';
    h += '</div><p class="hint">' + (f === 'ae' ? 'Start outside the site, where the cable comes from. Tap each pole. Finish on the riser pole. The arrow and the note go at the outside end.' : 'Start on the riser pole. Tap along the trench or conduit, then along the ladder, and finish on the ODF, or on the porthole of a cabin when the ODF is inside it. The fiber follows what it is drawn on: it lies in the trench at its depth and on the ladder at its height, corners and all. Two conduits or trenches that meet in a hand hole or service box carry it through both. A point snaps onto an ODF, also one inside a cabin, and onto a closure: the cable goes into a closure at its entrance.') + '</p>';
    h += '<div class="row">' + Sel('Cable', 'route.' + f + '.cable', Q.cable, CABLES.map(c => [c, c])) + (f === 'ae' ? F('Aerial cable height (m)', 'route.aerialH', R.aerialH) : F('Rise into an ODF that is not in a rack (m)', 'route.endRise', R.endRise)) + '</div>';
    if (f === 'ae') h += '<div class="one">' + F('Note at the outside end', 'route.note', R.note, TXT) + '</div>';
    Q.pts.forEach((p, i) => {
      h += '<div class="leg"><span class="n">' + (i + 1) + '</span>' + (f === 'ae' ? '<select data-k="pt.' + i + '.loop" aria-label="Loop at AE point ' + (i + 1) + '">' + [0, 10, 15, 20, 30, 50].map(v => '<option value="' + v + '"' + (num(p.loop, 0) === v ? ' selected' : '') + '>' + (v ? v + ' m loop here' : 'No loop here') + '</option>').join('') + '</select>' : '<small>' + f1(p.x) + ' m from left, ' + f1(p.y) + ' m from bottom</small>') + '<span></span><button class="b s ic d" data-a="pt-del" data-f="' + f + '" data-i="' + i + '" aria-label="Remove ' + f.toUpperCase() + ' point ' + (i + 1) + '">×</button></div>';
      if (i + 1 < n) {
        const parts = g.legs.filter(l => l.f === f && l.i === i), len = parts.reduce((a, l) => a + l.len, 0);
        if (f === 'ae') h += '<div class="leg"><span class="bar2"></span><small>Aerial, pole to pole</small><span class="len">' + f1(len) + ' m</span><span></span></div>';
        else { const t = (Q.legs[i] || {}).type || 'auto', now = Array.from(new Set(parts.map(l => LEG[l.type].n.toLowerCase()))).join(', '); h += '<div class="leg"><span class="bar2"></span><select data-k="leg.' + i + '" aria-label="Run of UG leg ' + (i + 1) + '"><option value="auto"' + (t === 'auto' ? ' selected' : '') + '>App decides: ' + esc(now || 'new conduit') + '</option>' + Object.keys(LEG).filter(k => k !== 'aerial').map(k => '<option value="' + k + '"' + (k === t ? ' selected' : '') + '>' + LEG[k].n + '</option>').join('') + '</select><span class="len">' + f1(len) + ' m</span><span></span></div>'; }
      }
    });
  }
  if (s.total > 0.05) {
    const row = (a, v) => v > 0.05 ? '<tr><td>' + a + '</td><td class="r">' + f1(v) + ' m</td></tr>' : '', tot = (a, v) => '<tr class="tot"><td>' + a + '</td><td class="r">' + f1(v) + ' m</td></tr>';
    h += '<h3>Cable length</h3><table class="t">' + row('AE, pole to pole', s.aerial) + row('AE loops (' + s.nloop + ')', s.loop) + (s.ae > 0.05 ? tot('Total FOC AE', s.ae) : '') + ['ug', 'xug', 'ladder', 'open', 'liquid', 'wall'].map(k => row('UG: ' + LEG[k].n.toLowerCase(), s[k])).join('') + row('UG: up and down (riser, exit conduit, drops)', s.vert) + row('UG: inside the cabin, porthole to ODF', s.inside) + (s.ugt > 0.05 ? tot('Total FOC UG', s.ugt) : '') + '</table>';
    h += '<p class="hint">The app adds the up-and-down parts itself: up the riser pipe to the closure, out of the ground at an exit conduit, down into the cabinet. Buried runs are measured at their depth.</p>';
  }
  return h;
}
function tabPhotos() {
  let h = '<p class="hint">Take the site pictures with the camera of the app. Then mark on the plan where each one was taken, and drag its handle to show which way the camera faced.</p>' + (VIEW ? '' : '<div class="btns"><button class="b p" data-a="photo-take">Take a photo</button></div>');
  if (photoNote) h += '<div class="warn">' + esc(photoNote) + '</div>';

  S.photos.forEach((p, i) => {
    const tb = Math.round(((num(p.dir, 0) + num(S.site.bearing, 0)) % 360 + 360) % 360);
    h += '<div class="ph">' + (IMG[p.id] ? '<img src="' + IMG[p.id] + '" alt="Photo ' + (i + 1) + '">' : '<div class="noimg">picture not on this phone</div>') + '<div><div class="n">Photo ' + (i + 1) + (p.placed ? '' : ' · not on the plan yet') + '</div><div class="one">' + F('Caption', 'photo.' + p.id + '.cap', p.cap, TXT + ' placeholder="What it shows"') + '</div>';
    if (p.placed) h += '<div class="one">' + F('Camera faced (° from true north)', 'photo.' + p.id + '.dir', tb, 'type="number" step="5" min="0" max="360" inputmode="decimal"') + '</div>';
    h += '<div class="btns"><button class="b s" data-a="photo-place" data-id="' + p.id + '">' + (p.placed ? 'Move on plan' : 'Mark on plan') + '</button><button class="b s d" data-a="photo-del" data-id="' + p.id + '">Remove</button></div></div></div>';
  });
  return h;
}
function tabTable() {
  let h = '<p class="hint">This table fills itself from the sketch. It goes on the isometric sheet.</p><table class="t"><tr><th>No.</th><th>List of activity</th><th>Type</th><th>Qty</th><th>Length</th></tr>';
  cefTable(S).forEach((r, i) => { h += '<tr><td>' + (i + 1) + '</td><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="r">' + esc(r[2]) + '</td><td class="r">' + esc(r[3]) + '</td></tr>'; });
  return h + '</table><p class="hint" style="margin-top:10px">' + focFormula(S).map(esc).join('<br>') + '</p><p class="hint">How it counts: AE and UG are two cables, each with its own length. An ODF inside a cabin is counted with the others, and cable drawn inside a cabin is part of the UG length. Each proposed riser pole brings one concrete encasement. The closure where the two cables meet is counted even when the app drew it. G.I. riser pipe is the pipe up the pole, from the ground to the closure. Loop holders are the loops on the AE fiber; loops in hand holes and service boxes are taken as given and are not drawn. Exit conduits are the ones you placed plus the ones the app adds where the UG cable comes out of the ground. Open trench conduit is the UG fiber in new conduit, plus any proposed conduit, encasement or trench drawn where the fiber does not run.</p>';
}
function checks() {
  const c = [], s = S.site, g = geo(S), rg = routeGeom(S), np = S.photos.filter(p => !p.placed).length;
  c.push(s.name && s.id ? [1, 'Site name and ID are filled in.'] : [0, 'Site name or ID is empty. That box of the title block will be blank.']);
  c.push(g ? [1, 'Coordinates are set, taken at the ' + g.at.toLowerCase() + '.'] : [0, 'No coordinates. The ZIP will have no map-position DXF and no KML.']);
  if (g && g.fallback) c.push([0, 'No tower on the plan, so the coordinates are taken at the bottom-left corner.']);
  if (g && !g.zoneOk) c.push([0, 'Longitude is outside UTM zone 51 (120 to 126 E). The map DXF uses extended zone 51.']);
  c.push(S.els.some(e => TYPES[e.t].g === 'tower') ? [1, 'A tower is on the plan.'] : [0, 'No tower on the plan.']);
  c.push(rg.sum.ae > 0.05 ? [1, 'AE fiber drawn: ' + f1(rg.sum.ae) + ' m with loops.'] : [0, 'No AE fiber drawn.']);
  c.push(rg.sum.ugt > 0.05 ? [1, 'UG fiber drawn: ' + f1(rg.sum.ugt) + ' m.'] : [0, 'No UG fiber drawn.']);
  for (const n of rg.notes) c.push([0, n]);
  for (const w of rg.warn) c.push([0, 'UG leg ' + (w.leg + 1) + ' runs through ' + w.names.join(', ') + '.']);
  if (S.route.ug.pts.length > 1 && !S.els.some(e => e.t === 'odf' || (e.t === 'cabin' && e.inside && e.inside.els.some(q => q.t === 'odf')))) c.push([0, 'No ODF on the plan for the UG fiber to end on.']);
  { const d = details(S); c.push(d.length ? [1, 'Details sheet: ' + d.map(q => q.title.toLowerCase()).join('; ') + '.'] : [0, 'No details sheet: no cabin has anything sketched inside, and no outdoor cabinet holds an ODF.']); }
  c.push(S.photos.length ? [np ? 0 : 1, S.photos.length + ' photo' + (S.photos.length === 1 ? '' : 's') + (np ? ', ' + np + ' not marked on the plan.' : ', all marked on the plan.')] : [0, 'No photos added.']);
  if (S.sample) c.push([0, 'This is still the sample site. The sheets will say so.']);
  return c;
}
function tabExport() {
  const libs = typeof PDFLib !== 'undefined', can = dlReady && dl && libs && !busy, e = HOST && HOST.exporter ? HOST.exporter() : {};
  let h = '<h3>Before you export</h3><ul class="chk">' + checks().map(c => '<li' + (c[0] ? '' : ' class="w"') + '>' + esc(c[1]) + '</li>').join('') + '</ul>';
  h += '<div class="btns"><button class="b p" data-a="export-zip"' + (can ? '' : ' disabled') + '>Save ZIP: DXF + PDF + KML</button><button class="b" data-a="export-pdf"' + (can ? '' : ' disabled') + '>Save PDF only</button></div>';
  if (!libs) h += '<div class="warn">The PDF tool of the app did not load. Close the CEF plan and open it again.</div>';
  if (msg) h += '<div class="' + msg.c + '" role="status">' + esc(msg.t) + '</div>';
  h += '<p class="hint">Exported by ' + esc([e.name, e.mobile, e.email].filter(Boolean).join(' · ') || 'you') + '. It is written on every sheet and in the files.</p>';
  h += '<h3>In the ZIP</h3><table class="t"><tr><td>Sheets DXF</td><td>Isometric with CEF table, top view, details (inside of a cabin, open cabinets), photo frames. 1 unit = 1 m.</td></tr><tr><td>PDF</td><td>The same sheets on A3, with the photos.</td></tr><tr><td>Map DXF</td><td>The top view at its real place, UTM 51N.</td></tr><tr><td>KML</td><td>To check the place in Google Earth.</td></tr><tr><td>Photos</td><td>Numbered as on the plan.</td></tr><tr><td>Logos</td><td>The pictures of the two logo boxes.</td></tr><tr><td>Sketch file</td><td>To open the sketch here again.</td></tr></table>';
  h += '<p class="hint" style="margin-top:8px">Check the Sheets view first to see what you will get.</p>';
  if (!VIEW) h += '<h3>Open a saved sketch</h3><div class="btns"><label class="b filebtn">Choose a sketch file (.json)<input type="file" accept=".json,application/json" data-k="open" hidden></label></div><p class="hint">It replaces the sketch on the screen. Undo brings yours back.</p>';
  return h;
}
const WALLS = [['S', 'Bottom (front)'], ['N', 'Top'], ['W', 'Left'], ['E', 'Right']];
/* inside a cabin: what this sketch is, and its door */
function tabRoom() {
  const c = cabinNow(), si = S.site; let h = '';
  h += '<div class="note">You are inside <b>' + esc(c ? elLabel(ROOT, c) : 'the cabin') + '</b>: ' + f1(si.L) + ' × ' + f1(si.W) + ' m, ' + f1(num(si.fh, 2.8)) + ' m high. The sketch is its floor from above. The bottom of the sketch is the front of the cabin.</div>';
  h += '<div class="btns"><button class="b p" data-a="back">Back to the site</button></div>';
  h += '<p class="hint"><b>Elements</b>: racks, the ODF and other rack equipment, the porthole, the indoor cable ladder. <b>Cable</b>: the cable from the porthole to the ODF. The isometric shows the room with the two walls nearest to you cut down; press <b>Turn</b> to look from another corner. To change the size of the room, go back and edit the cabin.</p>';
  h += '<h3>Door</h3>';
  S.gates.forEach((q, i) => { const hz = q.side === 'S' || q.side === 'N'; h += '<div class="row3">' + Sel('Wall', 'gate.' + i + '.side', q.side, WALLS) + F('From ' + (hz ? 'left' : 'bottom') + ' (m)', 'gate.' + i + '.off', q.off) + F('Width (m)', 'gate.' + i + '.w', q.w) + '<button class="b s ic d" data-a="gate-del" data-i="' + i + '" aria-label="Remove door">×</button></div>'; });
  h += '<div class="btns"><button class="b s" data-a="gate-add">Add a door</button></div><p class="hint">The cabin on the site plan gets its door on the same wall.</p>';
  return h;
}
/* inside a cabin: the cable from the porthole to the ODF */
function tabCable() {
  const Q = S.route.ug, g = routeGeom(S), s = g.sum, n = Q.pts.length, on = mode === 'route'; let h = '';
  h += '<p class="hint">The cable inside the cabin. Start on the <b>porthole</b>, tap along the cable ladder, and finish on the <b>ODF</b> in its rack. The cable lies on the ladder, then comes down the front of the rack to the ODF at its rack units.</p>';
  for (const nt of g.notes) h += '<div class="warn">' + esc(nt) + '</div>';
  h += '<div class="btns">' + (on ? '<button class="b p" data-a="route-done">Done drawing</button><button class="b" data-a="route-undo"' + (n ? '' : ' disabled') + '>Remove last point</button>' : '<button class="b p" data-a="route-draw" data-f="ug">' + (n ? 'Add more points' : 'Draw the cable') + '</button><button class="b" data-a="route-clear" data-f="ug"' + (n ? '' : ' disabled') + '>Clear</button>') + '</div>';
  Q.pts.forEach((p, i) => {
    h += '<div class="leg"><span class="n">' + (i + 1) + '</span><small>' + f1(p.x) + ' m from left, ' + f1(p.y) + ' m from bottom</small><span></span><button class="b s ic d" data-a="pt-del" data-f="ug" data-i="' + i + '" aria-label="Remove cable point ' + (i + 1) + '">×</button></div>';
    if (i + 1 < n) { const parts = g.legs.filter(l => l.f === 'ug' && l.i === i); h += '<div class="leg"><span class="bar2"></span><small>' + esc(Array.from(new Set(parts.map(l => l.type === 'ladder' ? 'On the cable ladder' : 'In the open'))).join(', ')) + '</small><span class="len">' + f1(parts.reduce((a, l) => a + l.len, 0)) + ' m</span><span></span></div>'; }
  });
  if (s.ugt > 0.05) {
    const row = (a, v) => v > 0.05 ? '<tr><td>' + a + '</td><td class="r">' + f1(v) + ' m</td></tr>' : '';
    h += '<h3>Cable length inside</h3><table class="t">' + row('On the cable ladder', s.ladder) + row('In the open', s.open + s.ug + s.xug + s.liquid + s.wall) + row('Up and down', s.vert) + '<tr class="tot"><td>Inside the cabin</td><td class="r">' + f1(s.ugt) + ' m</td></tr></table>';
    h += '<p class="hint">This length is added to the UG cable of the site. On the site, end the UG fiber on the porthole of this cabin.</p>';
  }
  return h;
}
/* one outdoor cabinet with its door open: its rack and what is mounted in it */
function tabFocus() {
  const c = elById(focus); if (!c) return ''; const K = rackOf(c), its = rackSlots(S, c).slice().sort((a, b) => b.u - a.u), e = sel && sel.k === 'el' ? elById(sel.id) : null, it = e ? its.find(q => q.e === e) : null;
  let h = '<div class="note"><b>' + esc(elLabel(S, c)) + '</b> with its door open. The rack has ' + K.n + ' units, counted from the bottom.</div><div class="btns"><button class="b p" data-a="back">Back to the site</button></div>';
  if (it) h += inspector(e);
  h += '<h3>Add to the rack</h3><div class="pal"><button class="b s" data-a="add" data-t="odf">ODF</button><button class="b s" data-a="add" data-t="runit">Rack equipment</button></div>';
  h += '<p class="hint">A new item takes the highest free place. Tap it on the drawing, then drag it up or down: it snaps to the free rack units, and its name on the side of the cabinet follows. <b>Turn</b> shows the cabinet from its other side.</p>';
  h += '<h3>In the rack (' + its.length + ')</h3>';
  for (const q of its) h += '<button class="li" data-a="sel" data-kind="el" data-id="' + q.e.id + '"' + (q.e === e ? ' aria-current="true"' : '') + '><i class="dot ' + (q.e.st === 'P' ? 'P' : '') + '"></i>' + esc(q.e.name || TYPES[q.e.t].n) + '<span>' + uText(q) + '</span></button>';
  if (!its.length) h += '<p class="hint">Nothing in the rack yet.</p>';
  return h + '<div class="one" style="margin-top:12px">' + F('Name of the cabinet on the drawing', 'odc.name', c.name, TXT + ' placeholder="' + esc(elLabel(S, Object.assign({}, c, { name: '' }))) + '"') + '</div>';
}
const TABS = { site: tabSite, els: tabEls, route: tabRoute, photos: tabPhotos, table: tabTable, export: tabExport };
const tabNow = () => focus ? tabFocus() : S.room && tab === 'site' ? tabRoom() : S.room && tab === 'route' ? tabCable() : TABS[S.room && !['site', 'els', 'route'].includes(tab) ? 'els' : tab]();
function panelFocused() { const a = document.activeElement; return !!a && panel.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); }
/* a label that is picked: what it says by itself, what the user typed, and the item it belongs to */
function labInfo(key) {
  const e = elById(key), r = runById(key);
  if (e) return { name: TYPES[e.t].n, cur: e.name || '', def: elLabel(S, Object.assign({}, e, { name: '' })), item: { k: 'el', id: key } };
  if (r) return { name: RUNS[r.kind].n, cur: r.name || '', def: runLabel(Object.assign({}, r, { name: '' })), item: { k: 'run', id: key } };
  if (key === 'ug' && S.room) return { name: 'Cable', cur: (S.lab.ug || {}).t || '', def: 'FOC UG' };
  if (/^in/.test(key)) for (const c of S.els) if (c.t === 'cabin' && c.inside) { const q = (c.inside.els || []).find(k => 'in' + k.id === key); if (q) return { name: TYPES[q.t].n + ' inside the cabin', cur: (S.lab[key] || {}).t || '', def: elLabel(c.inside, q) }; }
  if (key === 'note') return { name: 'Note at the outside end', cur: S.route.note || '', def: '' };
  if (/^len/.test(key)) return { name: 'Measured length', fixed: 1 };
  if (key === 'tid') { const si = S.site || {}; return { name: 'Site name and ID', cur: (S.lab.tid || {}).t || '', def: [si.name, si.id].map(v => String(v || '').trim().toUpperCase()).filter(Boolean).join(' / ') }; }
  const lp = /^loop(\d+)$/.exec(key), rec = S.lab[key] || {}, def = key === 'ae' || key === 'ug' ? focName(S, routeGeom(S), key) : key === 'clo' ? 'PROPOSED CLOSURE' : /^exit/.test(key) ? 'PROPOSED RISER PIPE' : /^riser/.test(key) ? 'PROPOSED G.I. RISER PIPE' : /^ugd/.test(key) ? 'PROPOSED U-GUARD' : /^port/.test(key) ? 'PORTHOLE' : /^gate/.test(key) ? (S.room ? 'DOOR' : 'GATE') : lp ? 'LOOP HOLDER W/ ' + f2(num((S.route.ae.pts[+lp[1]] || {}).loop, 0)) + 'm LOOP' : '';
  return { name: key === 'ae' ? 'AE fiber' : key === 'ug' ? 'UG fiber' : key === 'clo' ? 'Closure' : /^exit/.test(key) ? 'Exit conduit' : /^riser/.test(key) ? 'Riser pipe' : /^ugd/.test(key) ? 'U-guard' : /^port/.test(key) ? 'Porthole' : /^gate/.test(key) ? (S.room ? 'Door' : 'Gate') : lp ? 'Loop' : 'Label', cur: rec.t || '', def };
}
function labBox() {
  if (!sel || sel.k !== 'lab') return ''; const q = labInfo(sel.key), rec = S.lab[sel.key] || {}, moved = ['p', 'i0', 'i1', 'i2', 'i3'].some(v => Array.isArray(rec[v]));
  let h = '<div class="insp"><div class="insp-h"><b>Label · ' + esc(q.name) + '</b>' + (q.item ? '<button class="b s" data-a="lab-item">Edit the item</button>' : '') + '<button class="b s" data-a="lab-reset"' + (moved ? '' : ' disabled') + '>Put it back</button></div>';
  if (q.fixed) h += '<p class="hint">This is a length the app measured, so its text cannot be retyped. You can drag it.</p>';
  else h += '<div class="one">' + F('Text on the drawing (empty = the usual name)', 'lab.t', q.cur, TXT + ' placeholder="' + esc(q.def) + '"') + '</div>';
  return h + '<p class="hint">Drag the label on the drawing to move it. It keeps its place next to its item when the item moves. A label you moved far from its item gets a leader line.</p></div>';
}
function drawPanel() {
  const a = document.activeElement, k = a && panel.contains(a) && a.dataset ? a.dataset.k : null, st = panel.scrollTop;
  panel.innerHTML = labBox() + tabNow(); panel.scrollTop = st;
  if (VIEW) { for (const n of panel.querySelectorAll('input, select, textarea')) n.disabled = true; for (const n of panel.querySelectorAll('button[data-a]')) if (VIEW_OK.indexOf(n.dataset.a) < 0) n.disabled = true; }
  if (k) { const n = panel.querySelector('[data-k="' + k + '"]'); if (n && n.type !== 'file') { n.focus({ preventScroll: true }); if (n.tagName === 'INPUT') try { n.select(); } catch (e) { } } }
}
function refresh(full, fast) {
  if (VIEW && ROOT && SNAP && JSON.stringify(ROOT) !== SNAP) { ROOT = norm(JSON.parse(SNAP)); relink(); SNAP = JSON.stringify(ROOT); draft = []; live = null; placing = null; mode = 'select'; full = true; }   /* a view-only plan is put back as it was opened */
  drawViews(fast); drawChrome(); if (full || !panelFocused()) drawPanel(); save();
}
let raf = 0; function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(false, true); }); }
function setMsg(t, c) { msg = t ? { t, c: c || 'note' } : null; if (tab === 'export') drawPanel(); }

/* ---------- editing ---------- */
function riders(e) { if (!['pad', 'cabin', 'odc', 'cow', 'box', 'rack'].includes(e.t)) return []; const P = elPoly(e), a = e.w * e.d; return S.els.filter(q => q !== e && q.w * q.d < a && inPoly([q.x, q.y], P)); }
function applyField(k, t) {
  const p = k.split('.'), v = t.value, si = S.site, x = parseFloat(v), r2 = q => Math.round(q * 100) / 100;
  if (p[0] === 'site') {
    const f = p[1];
    if (['name', 'id', 'by', 'org', 'link', 'lat', 'lon', 'kind', 'fence', 'anchor', 'labels', 'cut', 'below', 'clo'].includes(f)) { push('f:' + k); si[f] = v; if ((f === 'below' && v !== 'depth') || (f === 'clo' && v !== 'none')) delete si[f]; if (f === 'name' || f === 'id') S.sample = false; if (f === 'kind' || f === 'labels' || f === 'cut' || f === 'below' || f === 'clo') needFit.iso = needFit.top = needFit.sheets = true; return true; }
    if (f === 'txt') { push('f:' + k); if (v === 'auto' || v === '') delete si.txt; else si.txt = clamp(num(v, 100), 50, 250); needFit.iso = needFit.top = needFit.sheets = true; return true; }
    if (f === 'nm') { if (!NAMES.some(q => q[0] === p[2])) return false; push('f:' + k); si.names = Object.assign({}, si.names); si.names[p[2]] = String(v) === '1'; needFit.iso = needFit.top = needFit.sheets = true; return true; }
    if (f === 'towerShow') { push('f:' + k); si.towerShow = isFinite(x) && x > 0 ? clamp(x, 3, 300) : ''; needFit.iso = needFit.sheets = true; return true; }
    const lim = { L: [2, 500], W: [2, 500], fh: [0.5, 10], post: [1, 20], bh: [0, 200], bearing: [0, 360], wire: [0, 1] }[f]; if (!lim || !isFinite(x)) return false;
    push('f:' + k); si[f] = clamp(x, lim[0], lim[1]); if (f !== 'bearing' && f !== 'post' && f !== 'wire') needFit.iso = needFit.top = true; return true;
  }
  if (p[0] === 'gate') { const q = S.gates[+p[1]]; if (!q) return false; if (p[2] === 'side') { push('f:' + k); q.side = v; return true; } if (!isFinite(x)) return false; push('f:' + k); q[p[2]] = Math.max(p[2] === 'w' ? 0.5 : 0, x); return true; }
  if (p[0] === 'odc') { const c = focus && elById(focus); if (!c) return false; push('f:' + k); c.name = v; return true; }
  if (p[0] === 'el') {
    const e = sel && sel.k === 'el' && elById(sel.id), f = p[1]; if (!e) return false;
    if (f === 'name' || f === 'st' || f === 'size') { push('f:' + k); e[f] = v; return true; }
    if (f === 'ty') { push(); if (SBOX[v]) { const B = SBOX[v]; e.ty = v; e.w = B.w; e.d = B.d; e.dp = B.dp; } else delete e.ty; return true; }      /* a service box of the standard takes the size of its frame and its depth */
    if (f === 'lad') { push(); if (v === 'auto' || v === 'none') e.lad = v; else { e.lad = clamp(parseInt(v, 10) || 0, 0, 3); e.ladT = 0.5; } return true; }
    if (!isFinite(x)) return false; push('f:' + k);
    if (f === 'u' || f === 'ru') {                         /* where an item sits in its rack, and how many units it takes */
      const host = rackHost(S, e); if (f === 'ru') e.ru = clamp(Math.round(x), 1, 30);
      if (host) { const u = slotFor(S, host, e, f === 'u' ? x : num(e.u, 1)); if (u != null) e.u = u; seatItems(S); } else if (f === 'u') e.u = Math.max(1, Math.round(x));
      return true;
    }
    const on = []; if (SNAPS.includes(e.t)) for (const ff of ['ae', 'ug']) for (const q of S.route[ff].pts) if (Math.hypot(q.x - e.x, q.y - e.y) < 0.06) on.push(q);      /* fiber points that sit on the item go with it, as when it is dragged */
    const b = polyBox(elPoly(e)), mv = (dx, dy) => { for (const q of riders(e).concat([e], on)) { q.x = r2(q.x + dx); q.y = r2(q.y + dy); } };
    if (f === 'gl') mv(x - b[0], 0); else if (f === 'gr') mv(S.site.L - b[2] - x, 0); else if (f === 'gb') mv(0, x - b[1]); else if (f === 'gt') mv(0, S.site.W - b[3] - x);
    else if (f === 'rot') e.rot = (x % 360 + 360) % 360;
    else if (f === 'w' || f === 'd') { e[f] = clamp(x, 0.05, 100); if (e.t === 'sbox') delete e.ty; if (TYPES[e.t].rd || ['t3', 't4', 'guy', 'rtt'].includes(e.t)) e.d = e.w; }
    else if (f === 'h') e.h = clamp(x, 0.02, 100); else if (f === 'th') e.th = clamp(x, 1, 300); else if (f === 'ar') e.ar = clamp(x, 1, 200); else if (f === 'z') e.z = clamp(x, 0, 100); else if (f === 'dp') { e.dp = clamp(x, 0.1, 10); if (e.t === 'sbox') delete e.ty; } else return false;
    if (e.t === 'cabin' && e.inside) syncRoom(e.inside, e); if (e.t === 'port' || e.t === 'ac') toWall(e); seatItems(S);
    return true;
  }
  if (p[0] === 'lab') {
    if (!sel || sel.k !== 'lab') return false; const key = sel.key, e = elById(key), r = runById(key); push('f:' + k + key);
    if (e) e.name = v; else if (r) r.name = v; else if (key === 'note') S.route.note = v; else { const q = S.lab[key] || (S.lab[key] = {}); q.t = v; }
    return true;
  }
  if (p[0] === 'run') {
    const l = sel && sel.k === 'run' && runById(sel.id), f = p[1]; if (!l) return false;
    if (f === 'st' || f === 'name') { push('f:' + k); l[f] = v; return true; }
    if (f === 'kind') { if (!RUNS[v]) return false; push(); if (Math.abs(num(l.w, 0) - RUNS[l.kind].w) < 1e-6) l.w = RUNS[v].w; if (Math.abs(num(l.z, 0) - RUNS[l.kind].z) < 1e-6) l.z = RUNS[v].z; l.kind = v; if (v === 'trench' && l.dp == null) l.dp = RUNS.trench.dp; return true; }
    if (!isFinite(x)) return false; push('f:' + k); l[f] = f === 'w' ? clamp(x, 0.02, 3) : f === 'dp' ? clamp(x, 0.1, 10) : clamp(x, 0, 60); return true;
  }
  if (p[0] === 'route') {
    if (p[1] === 'note') { push('f:' + k); S.route.note = v; return true; }
    if ((p[1] === 'ae' || p[1] === 'ug') && p[2] === 'cable') { push('f:' + k); S.route[p[1]].cable = v; return true; }
    if (p[1] !== 'aerialH' && p[1] !== 'endRise') return false;
    if (!isFinite(x)) return false; push('f:' + k); S.route[p[1]] = clamp(x, p[1] === 'aerialH' ? 0.5 : 0, 60); return true;
  }
  if (p[0] === 'leg') { const l = S.route.ug.legs[+p[1]]; if (!l || (v !== 'auto' && (!LEG[v] || v === 'aerial'))) return false; push(); l.type = v; return true; }
  if (p[0] === 'pt') { const q = S.route.ae.pts[+p[1]]; if (!q || !isFinite(x)) return false; push(); q.loop = Math.max(0, x); return true; }
  if (p[0] === 'photo') { const q = phById(p[1]); if (!q) return false; if (p[2] === 'cap') { push('f:' + k); q.cap = v; return true; } if (!isFinite(x)) return false; push('f:' + k); q.dir = ((x - num(si.bearing, 0)) % 360 + 360) % 360; return true; }
  return false;
}
const r2 = q => Math.round(q * 100) / 100;
/* a porthole belongs on a wall: it goes to the wall nearest to where it is, and lies along it. Gives back that wall. */
/* the doors and aircon units of a cabin, in its panel on the site: a list with a delete button each, and buttons to add */
function cabinParts(e) {
  const WN = { F: 'front', B: 'back', R: 'right', L: 'left' }, D = cabinDoors(e), A = cabinAcs(e), id = esc(e.id);
  let h = '<h3>Doors and aircon</h3><div class="parts">';
  D.forEach((q, i) => { h += '<div class="li"><span>Door ' + (i + 1) + ': ' + WN[q.face] + ' wall, ' + f2(q.w) + ' m wide</span><button class="b s d" data-a="cdoor-del" data-id="' + id + '" data-i="' + i + '" aria-label="Delete door ' + (i + 1) + '">×</button></div>'; });
  A.forEach((q, i) => { h += '<div class="li"><span>Aircon ' + (i + 1) + ': ' + WN[q.face] + ' wall</span><button class="b s d" data-a="cac-del" data-id="' + id + '" data-i="' + i + '" aria-label="Delete aircon ' + (i + 1) + '">×</button></div>'; });
  if (!D.length && !A.length) h += '<p class="hint">No door and no aircon unit.</p>';
  return h + '</div><div class="btns"><button class="b s" data-a="cdoor-add" data-id="' + id + '">Add a door</button><button class="b s" data-a="cac-add" data-id="' + id + '">Add an aircon unit</button></div><p class="hint">On the plan, drag a door by its dark handle and an aircon unit by its grey handle; they slide along the walls and round the corners. A door\'s width is set inside the cabin, in the Cabin tab.</p>';
}
/* a door of a cabin moved on the site plan: it slides along the walls. g: the door in the inside sketch */
const WALLN = { S: 'front', N: 'back', W: 'left', E: 'right' };
function slideDoor(g, w, d, q) { const k = wallOf(w, d, q[0], q[1]), len = k.side === 'S' || k.side === 'N' ? w : d, along = k.side === 'S' || k.side === 'N' ? k.x : k.y; g.side = k.side; g.w = Math.min(num(g.w, 0.9), len); g.off = Math.round(clamp(along - g.w / 2, 0, len - g.w) * 20) / 20; return k; }
function siteDoor(e, i, p) { if (!e.inside) e.inside = newRoom(e); const g = e.inside.gates[i]; if (!g) return; const k = slideDoor(g, e.w, e.d, toRoom(e, p)); dragNote = 'Door on the ' + WALLN[k.side] + ' wall, ' + f2(g.off) + ' m from its ' + (k.side === 'S' || k.side === 'N' ? 'left' : 'bottom') + ' end'; }
function siteAc(e, i, p) { if (!e.inside) e.inside = newRoom(e); const a = e.inside.els.filter(q => q.t === 'ac')[i]; if (!a) return; const r = toRoom(e, p), k = wallOf(e.w, e.d, r[0], r[1]); a.x = r2(k.x); a.y = r2(k.y); a.rot = k.side === 'S' || k.side === 'N' ? 0 : 90; dragNote = 'Aircon unit on the ' + WALLN[k.side] + ' wall of the cabin'; }
/* where a door's handle is: the middle of the door, on its wall */
const doorAt = (e, q) => faceXY(e, q.face, q.u, 0);
function toWall(e) { if (!S.room) return null; const k = wallOf(S.site.L, S.site.W, e.x, e.y); e.x = r2(k.x); e.y = r2(k.y); e.rot = k.side === 'S' || k.side === 'N' ? 0 : 90; return k; }
/* The porthole of a cabin, moved on the site plan: it slides along the walls and goes to the end of a cable ladder, or to a point of the UG fiber, that is at that wall. */
function sitePort(e, i, p) {
  if (!e.inside) e.inside = newRoom(e); const pe = e.inside.els.filter(q => q.t === 'port')[i]; if (!pe) return;
  const r = toRoom(e, p); let k = wallOf(e.w, e.d, r[0], r[1]), best = null; const C = [];
  for (const run of S.runs) if (run.kind === 'ladder' && run.pts.length > 1) C.push([run.pts[0], 'cable ladder'], [run.pts[run.pts.length - 1], 'cable ladder']);
  for (const q of S.route.ug.pts) C.push([[q.x, q.y], 'UG fiber']);
  for (const [c, nm] of C) { const cr = toRoom(e, c), ck = wallOf(e.w, e.d, cr[0], cr[1]), dp = Math.hypot(ck.x - k.x, ck.y - k.y); if (ck.side === k.side && Math.hypot(ck.x - cr[0], ck.y - cr[1]) < 0.6 && dp < 0.45 && (!best || dp < best.d)) best = { d: dp, k: ck, nm }; }
  if (best) k = best.k;
  pe.x = r2(k.x); pe.y = r2(k.y); pe.rot = k.side === 'S' || k.side === 'N' ? 0 : 90;
  dragNote = best ? 'Porthole at the end of the ' + best.nm : 'Porthole on the ' + { S: 'front', N: 'back', W: 'left', E: 'right' }[k.side] + ' wall of the cabin · it snaps to the end of a cable ladder';
}
/* On the site sketch a cable ladder stops at the wall of a cabin: what is inside is drawn in the sketch of the inside.
   A ladder point put inside a cabin goes straight to the wall, so the ladder stays square. It takes the porthole only when that is right there; otherwise the porthole is the thing to move. */
function wallStop(c, r) {
  const k = wallOf(c.w, c.d, r[0], r[1]), near = cabinPorts(c).filter(q => q.side === k.side).map(q => ({ q, d: Math.hypot(q.x - k.x, q.y - k.y) })).sort((a, b) => a.d - b.d)[0], on = near && near.d < 0.12, w = on ? near.q.at : fromRoom(c, [k.x, k.y]);
  return { q: [r2(w[0]), r2(w[1])], port: !!on, note: on ? 'On the porthole of the cabin' : 'At the wall of the cabin · a ladder outside stops here' + (near && near.d < 3 ? ' · the porthole is ' + f2(near.d) + ' m along the wall: pick the cabin and drag its blue handle here' : '') };
}
function atCabinWall(p) { if (S.room) return null; const c = S.els.find(e => e.t === 'cabin' && inCabin(e, p, 0.02)); return c ? wallStop(c, toRoom(c, p)) : null; }
/* a short word in the status line about what the app just did; it goes away by itself */
let sayT = 0;
function say(t) { dragNote = t; clearTimeout(sayT); sayT = setTimeout(() => { if (dragNote === t) { dragNote = ''; drawChrome(); } }, 6000); }
/* a ladder that was drawn through the wall of a cabin is cut where it goes in */
function stopAtCabins(P) {
  if (S.room) return P; const inC = p => S.els.find(e => e.t === 'cabin' && inCabin(e, p, 0.02));
  const cut = Q => { for (let i = 1; i < Q.length; i++) { const c = inC(Q[i]); if (c && !inC(Q[i - 1])) { const a = toRoom(c, Q[i - 1]), b = toRoom(c, Q[i]), t = clipT(a, b, [0, 0, c.w, c.d]), w = wallStop(c, t ? [a[0] + (b[0] - a[0]) * t[0], a[1] + (b[1] - a[1]) * t[0]] : b); say('The ladder was cut at the cabin. ' + w.note); return Q.slice(0, i).concat([w.q]); } } return Q; };
  return cut(cut(P).slice().reverse()).reverse();
}
/* a rack item that was moved or added takes a free place in the rack it is now in */
function settle(e) { if (e && inRack(e)) { const host = rackHost(S, e); if (host) { const u = slotFor(S, host, e, e.u != null ? e.u : rackOf(host).n - units(e) - 1); if (u != null) e.u = u; } } seatItems(S); }
/* the porthole of a cabin, on the site sketch: cables and ladders snap to it */
function portPt(m) { if (S.room) return null; const pa = portAt(S, m, 0.5); return pa ? [r2(pa.port.at[0]), r2(pa.port.at[1])] : null; }
const SN = () => S.room ? 0.25 : 0.4;
/* a ladder drawn in a room hangs under the ceiling */
function fixRun(r) { if (S.room && r.kind === 'part') r.pts = r.pts.map(onRoomWall); if (S.room && r.kind === 'ladder') r.z = Math.max(0.5, Math.min(RUNS.ladder.z, Math.round((num(S.site.fh, 2.8) - 0.5) * 10) / 10)); return r; }
/* the nearest point on lines of the given kinds: drawn runs, or legs of the fiber. A point close to an end goes to the end. */
function nearLine(p, lines, tol) {
  let best = null;
  for (const P of lines) for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; if (l2 < 1e-6) continue;
    let t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1); const L = Math.sqrt(l2); if (t * L < 0.4) t = 0; else if ((1 - t) * L < 0.4) t = 1;
    const q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < tol && (!best || d < best.d)) best = { q: [r2(q[0]), r2(q[1])], d };
  }
  return best;
}
const runLines = kinds => S.runs.filter(r => kinds.indexOf(r.kind) >= 0).map(r => r.pts);
const legLines = types => routeGeom(S).legs.filter(l => types.indexOf(l.type) >= 0).map(l => [l.a, l.b]);
/* the ends of the other fiber: where AE and UG are meant to meet */
const otherEnds = f => { const o = [], P = S.route[f === 'ae' ? 'ug' : 'ae'].pts; if (P.length) { o.push([P[0].x, P[0].y]); if (P.length > 1) o.push([P[P.length - 1].x, P[P.length - 1].y]); } return o; };
/* things that belong together snap together while one of them is dragged */
function relSnap(e, raw) {
  const near = (types, tol) => { let b = null; for (const q of S.els) if (q !== e && types.indexOf(q.t) >= 0) { const d = Math.hypot(q.x - raw[0], q.y - raw[1]); if (d < tol && (!b || d < b.d)) b = { q, d }; } return b; };
  if (inRack(e)) { const h = near(['odc', 'rack'], S.room ? 0.45 : 0.9); if (h) return { p: [h.q.x, h.q.y], note: TYPES[e.t].s + (h.q.t === 'rack' ? ' in the rack' : ' in the cabinet: its door opens') + ' · drag it up or down in the isometric to set its rack units' }; }
  if (e.t === 'clo') { const h = near(['rpole', 'epole'], 0.9); if (h) return { p: [h.q.x, h.q.y], note: 'Closure on the pole, at the AE cable' }; const pit = near(['hh', 'sbox'], 0.7); if (pit) return { p: [pit.q.x, pit.q.y], note: 'Closure in the ' + TYPES[pit.q.t].n.toLowerCase() }; }
  if (e.t === 'hh' || e.t === 'sbox') { const a = nearLine(raw, legLines(['ug', 'xug']), 0.7), b = nearLine(raw, runLines(['conduit', 'encase', 'trench']), 0.7), c = a && (!b || a.d <= b.d) ? a : b; if (c) return { p: c.q, note: TYPES[e.t].n + ' on the ' + (c === a ? 'underground cable' : 'conduit or trench') }; }
  if (e.t === 'exit') { const ends = []; for (const r of S.runs) if (r.kind !== 'ladder') ends.push(r.pts[0], r.pts[r.pts.length - 1]); for (const l of legLines(['ug', 'xug'])) ends.push(l[0], l[1]); let b = null; for (const q of ends) { const d = Math.hypot(q[0] - raw[0], q[1] - raw[1]); if (d < 0.7 && (!b || d < b.d)) b = { q, d }; } if (b) return { p: [b.q[0], b.q[1]], note: 'Exit conduit at the end of the buried conduit' }; }
  return null;
}
/* the item a point snaps onto: the nearest one in reach. An ODF or a closure wins over the cabinet, pole or box it sits in. For a cable, an ODF in the sketch of the inside of a cabin counts too. */
function snapItem(m, cable) {
  let b = null; const r = SN();
  for (const e of S.els) if (SNAPS.includes(e.t)) { const d = Math.hypot(e.x - m[0], e.y - m[1]); if (d < r && (!b || d - (e.t === 'odf' || e.t === 'clo' ? 0.08 : 0) < b.d)) b = { d: d - (e.t === 'odf' || e.t === 'clo' ? 0.08 : 0), p: [e.x, e.y], note: 'On the ' + TYPES[e.t].n.toLowerCase() + (e.t === 'clo' ? ': the cable goes in at its entrance' : '') }; }
  if (cable && !S.room) { const o = odfInCabin(S, m, r); if (o && (!b || o.d - 0.08 < b.d)) b = { d: o.d, p: [r2(o.at[0]), r2(o.at[1])], note: 'On the ODF inside the cabin' }; }
  return b;
}
/* a point inside a room that is near one of its walls goes onto it: where a partition wall ends */
function onRoomWall(p) { const L = S.site.L, W = S.site.W, t = 0.25; let x = clamp(p[0], 0, L), y = clamp(p[1], 0, W); if (x < t) x = 0; else if (x > L - t) x = L; if (y < t) y = 0; else if (y > W - t) y = W; return [r2(x), r2(y)]; }
function snapPt(m) { { const q = snapItem(m, mode === 'route'); if (q) return q.p; } if (S.room && mode === 'run' && runKind === 'part') return onRoomWall([snap(m[0]), snap(m[1])]); { const q = portPt(m); if (q) return q; } if (mode === 'run' && runKind === 'ladder') { const w = atCabinWall(m); if (w) return w.q; } if (mode === 'route') { for (const q of otherEnds(fib)) if (Math.hypot(q[0] - m[0], q[1] - m[1]) < 0.4) return q; if (fib === 'ug') { const r = nearLine(m, runLines(['ladder', 'conduit', 'encase', 'trench']), 0.3); if (r) return r.q; } } return [snap(m[0]), snap(m[1])]; }
/* a point being dragged: it snaps onto poles and cabinets, and lines up with its neighbours when it comes close */
function movePt(raw, nb, cable, lad) {
  { const q = snapItem(raw, !!cable); if (q) { dragNote = q.note; return q.p; } }
  { const q = portPt(raw); if (q) { dragNote = 'On the porthole of the cabin'; return q; } }
  if (lad) { const w = atCabinWall(raw); if (w) { dragNote = w.note; return w.q; } }
  if (cable) for (const q of otherEnds(cable)) if (Math.hypot(q[0] - raw[0], q[1] - raw[1]) < 0.4) { dragNote = 'AE and UG meet here'; return q; }
  if (cable === 'ug') { const r = nearLine(raw, runLines(['ladder', 'conduit', 'encase', 'trench']), 0.3); if (r) { dragNote = 'UG fiber on the ladder, conduit or trench: it follows it'; return r.q; } }   /* the UG cable follows ladders, conduits and trenches */
  dragNote = '';
  const t = Math.max(0.15, 8 * unit('top')); let x = snap(raw[0]), y = snap(raw[1]);
  if (autoAlign) for (const p of nb) if (p) { if (Math.abs(raw[0] - p[0]) < t) x = p[0]; if (Math.abs(raw[1] - p[1]) < t) y = p[1]; }
  return [x, y];
}
function cleanPts(P) {
  const o = P.filter((p, i) => !i || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 0.05);
  for (let i = o.length - 2; i > 0; i--) { const a = o[i - 1], b = o[i], c = o[i + 1]; if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 0.02 * Math.hypot(c[0] - a[0], c[1] - a[1]) && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0) o.splice(i, 1); }
  return o;
}
/* a freehand stroke is finished: straighten it, then add it to the fiber route or to a drawn run */
function finishStroke(st) {
  const u = unit('top'), tol = clamp(11 * u, 0.12, 1.5), tolEnd = Math.max(0.5, 16 * u); let len = 0; for (let i = 1; i < st.length; i++) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  if (st.length < 2 || len < Math.max(0.3, 2 * tol)) return false;
  if (mode === 'route') {
    const R = S.route[fib], last = R.pts[R.pts.length - 1], start = last ? [last.x, last.y] : null, H = strokeHelpers(S, fib);
    const pts = tidyStroke(start ? [start].concat(st) : st, { tol, tolEnd, align: autoAlign, start, pts: H.pts, guides: H.guides }); if (pts.length < 2) return false;
    push(); pts.forEach((q, i) => { if (i === 0 && last) return; addPt(q); });
  } else {
    const cur = sel && sel.k === 'run' ? runById(sel.id) : null, ext = !draft.length && cur && cur.kind === runKind ? cur : null, H = strokeHelpers(S, ext), near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.max(0.6, 18 * u);
    let start = null, pre = false;
    if (draft.length) start = draft[draft.length - 1]; else if (ext) { const e0 = ext.pts[0], e1 = ext.pts[ext.pts.length - 1]; if (near(st[0], e1)) start = e1; else if (near(st[0], e0)) { start = e0; pre = true; } }
    const pts0 = tidyStroke(start ? [start].concat(st) : st, { tol, tolEnd, align: autoAlign, start, pts: H.pts, guides: H.guides }), pts = runKind === 'ladder' ? cleanPts(stopAtCabins(pts0)) : pts0; if (pts.length < 2) return false;
    push();
    if (draft.length) { const r = fixRun(newRun(runKind, cleanPts(draft.concat(pts.slice(1))), S)); draft = []; S.runs.push(r); sel = { k: 'run', id: r.id }; }
    else if (start && ext) ext.pts = cleanPts(pre ? pts.slice(1).reverse().concat(ext.pts) : ext.pts.concat(pts.slice(1)));
    else { const r = fixRun(newRun(runKind, pts, S)); S.runs.push(r); sel = { k: 'run', id: r.id }; }
  }
  return true;
}
function addEl(t) {
  if (!TYPES[t]) return;
  if (focus) { const c = elById(focus); if (!c || !inRack({ t })) return; push(); const e = newEl(t, c.x, c.y); S.els.push(e); settle(e); sel = { k: 'el', id: e.id }; refresh(true); panel.scrollTop = 0; return; }
  push(); const L = S.site.L, W = S.site.W, room = !!S.room, o = {}; let x = snap(L / 2), y = snap(W / 2);
  /* an ODF or rack equipment goes into a rack or cabinet that has none of its kind yet; on a site with no cabinet, an ODF goes onto a cabin */
  const host = inRack({ t }) ? S.els.find(q => (q.t === 'odc' || q.t === 'rack') && !rackItems(S, q).some(i => i.t === t)) || (room ? S.els.find(q => q.t === 'rack') : t === 'odf' ? S.els.find(q => q.t === 'cabin' && !S.els.some(i => i.t === 'odf' && hostOf(S, [i.x, i.y], i) === q)) : null) : null;
  if (host) { x = host.x; y = host.y; }
  else if (t === 'port' && room) { x = S.els.some(q => q.t === 'port' && q.x > L - 0.05) ? 0 : L; y = snap(W / 2); o.z = Math.round((num(S.site.fh, 2.8) - 0.45) * 10) / 10; }
  else if (t === 'ac' && room) { const used = S.els.filter(q => q.t === 'ac').map(q => wallOf(L, W, q.x, q.y).side), sd = ['E', 'W', 'N', 'S'].find(k => used.indexOf(k) < 0) || 'E'; x = sd === 'E' ? L : sd === 'W' ? 0 : snap(L * 0.7); y = sd === 'N' ? W : sd === 'S' ? 0 : snap(W * 0.7); o.z = Math.round(Math.max(0, num(S.site.fh, 2.8) - 1.1) * 10) / 10; }      /* on a wall without one, high up */
  else if (t === 'rack' && room) {                       /* racks stand in a row at the back wall, their fronts to the door */
    y = r2(Math.max(TYPES.rack.d / 2, W - 0.3 - TYPES.rack.d / 2)); let ok = false;
    for (let i = 0; i < 14 && !ok; i++) { const c = r2(L / 2 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * TYPES.rack.w); if (c >= TYPES.rack.w / 2 && c <= L - TYPES.rack.w / 2 && !S.els.some(q => Math.hypot(q.x - c, q.y - y) < 0.5)) { x = c; ok = true; } }
  }
  else { const step = room ? 0.7 : 1.2; let n = 0; while (n++ < 60 && S.els.some(q => Math.hypot(q.x - x, q.y - y) < (room ? 0.5 : 0.7))) { x = snap(x + step); if (x > L - 0.5) { x = room ? 0.5 : 1; y = snap(y - step); } } }
  const e = Object.assign(newEl(t, x, y), o); S.els.push(e); if (t === 'port' || t === 'ac') toWall(e); settle(e);
  sel = { k: 'el', id: e.id }; tab = 'els'; mode = 'select'; needFit.iso = true; needTop(); refresh(true); panel.scrollTop = 0;
}
/* into a cabin, into the rack of a cabinet, and back to the site */
function roomIn(id) {
  const e = ROOT.els.find(q => q.id === id && q.t === 'cabin'); if (!e) return;
  if (!e.inside) { push(); e.inside = newRoom(e); } else syncRoom(e.inside, e);
  inId = e.id; S = e.inside; sel = null; mode = 'select'; draft = []; dragNote = ''; tab = 'els'; needFit.top = needFit.iso = true;
  if (view === 'sheets' || view === 'iso') view = wide() ? 'both' : 'top'; active = 'top'; refresh(true); panel.scrollTop = 0;
}
function focusIn(id) {
  const e = ROOT.els.find(q => q.id === id && q.t === 'odc'); if (!e || S.room) return;
  focus = e.id; focusTurn = 0; backView = view; view = 'iso'; active = 'iso'; sel = null; mode = 'select'; draft = []; needFit.iso = true; refresh(true); panel.scrollTop = 0;
}
function goBack() {
  if (focus) { sel = { k: 'el', id: focus }; focus = null; view = backView === 'both' && !wide() ? 'top' : backView || 'top'; if (view !== 'both') active = view; }
  else if (inId) { sel = { k: 'el', id: inId }; inId = null; S = ROOT; }
  else return;
  mode = 'select'; draft = []; live = null; dragNote = ''; tab = 'els'; needFit.top = needFit.iso = needFit.sheets = true; refresh(true); panel.scrollTop = 0;
}
function delSel() { if (VIEW) return;
  if (!sel) return; push();
  if (sel.k === 'el') S.els = S.els.filter(e => e.id !== sel.id); else if (sel.k === 'run') S.runs = S.runs.filter(e => e.id !== sel.id); else if (sel.k === 'photo') S.photos = S.photos.filter(e => e.id !== sel.id); else if (sel.k === 'pt') delPt(sel.f, sel.i); else if (sel.k === 'lab') { hist.pop(); return; }
  sel = null; needFit.iso = true; refresh(true);
}
function delPt(f, i) { const R = S.route[f]; if (!R || !R.pts[i]) return; R.pts.splice(i, 1); if (f === 'ug') { if (R.legs.length) R.legs.splice(Math.min(i, R.legs.length - 1), 1); R.legs.length = Math.max(0, R.pts.length - 1); } }
/* one more point on the fiber that is being drawn */
function addPt(q) { const R = S.route[fib]; if (fib === 'ae') R.pts.push({ x: q[0], y: q[1], loop: 0 }); else { R.pts.push({ x: q[0], y: q[1] }); if (R.pts.length > 1) R.legs.push({ type: 'auto' }); } }
function action(a, b) {
  const d = b ? b.dataset : {};
  if (VIEW && VIEW_OK.indexOf(a) < 0) { say('View only: ' + VIEW); drawChrome(); return; }
  switch (a) {
    case 'add': addEl(d.t); return;
    case 'sel': sel = { k: d.kind, id: d.id }; needTop(); refresh(true); panel.scrollTop = 0; return;
    case 'rot': { const e = sel && elById(sel.id); if (e) { push(); e.rot = (num(e.rot, 0) + 90) % 360; refresh(true); } return; }
    case 'dup': { const e = sel && elById(sel.id); if (e) { push(); const inR = !!rackHost(S, e), c = Object.assign({}, e, { id: uid(), x: inR ? e.x : snap(e.x + (S.room ? 0.6 : 1)), y: inR ? e.y : snap(e.y - (S.room ? 0 : 1)) }); delete c.inside; if (inR) delete c.u; if (e.inside) c.inside = JSON.parse(JSON.stringify(e.inside)); S.els.push(c); settle(c); sel = { k: 'el', id: c.id }; refresh(true); } return; }
    case 'del': delSel(); return;
    case 'gate-add': push(); S.gates.push(S.room ? { side: 'S', off: Math.max(0, snap(S.site.L / 2 - 0.45)), w: Math.min(0.9, S.site.L) } : { side: 'S', off: Math.max(0, snap(S.site.L / 2 - 2)), w: 4 }); refresh(true); return;
    case 'room-in': if (sel && sel.k === 'el') roomIn(sel.id); return;
    case 'focus-in': if (d.id) focusIn(d.id); else if (sel && sel.k === 'el') focusIn(sel.id); return;
    case 'back': goBack(); return;
    case 'port-level': { const e = sel && sel.k === 'el' && elById(sel.id); if (e && e.t === 'port' && isFinite(+d.z)) { push(); e.z = r2(clamp(+d.z, 0.3, Math.max(0.3, num(S.site.fh, 2.8) - 0.2))); refresh(true); } return; }
    case 'gate-del': push(); S.gates.splice(+d.i, 1); refresh(true); return;
    case 'photo-take': takePhoto(); return;
    case 'gps': useGps(); return;
    case 'go-tab': if (TABS[d.tab]) { tab = d.tab; msg = null; refresh(true); panel.scrollTop = 0; } return;
    case 'guide-off': APP.guide = false; if (HOST && HOST.pref) HOST.pref('guide', false); drawGuide(); return;
    case 'logo-set': case 'logo-del': if (HOST && HOST.logo) Promise.resolve(HOST.logo(a === 'logo-del' ? 'remove' : 'pick')).then(Lg => Lg ? setLogos(Lg).then(() => refresh(true)) : null, () => { }); return;
    case 'cdoor-add': case 'cdoor-del': case 'cac-add': case 'cac-del': {
      const e = elById(d.id); if (!e || e.t !== 'cabin') return; push(); if (!e.inside) e.inside = newRoom(e); const I = e.inside, L = e.w, W = e.d;
      if (a === 'cdoor-del') I.gates.splice(+d.i, 1);
      else if (a === 'cac-del') { const q = I.els.filter(k => k.t === 'ac')[+d.i]; if (q) I.els = I.els.filter(k => k !== q); }
      else if (a === 'cdoor-add') { const sd = ['S', 'N', 'W', 'E'].sort((p, q) => I.gates.filter(g => g.side === p).length - I.gates.filter(g => g.side === q).length)[0], len = sd === 'S' || sd === 'N' ? L : W, w = Math.min(0.9, len); I.gates.push({ side: sd, off: Math.round(Math.max(0, len / 2 - w / 2) * 20) / 20, w }); }
      else { const used = I.els.filter(k => k.t === 'ac').map(k => wallOf(L, W, k.x, k.y).side), sd = ['E', 'W', 'N', 'S'].find(s => used.indexOf(s) < 0) || 'E', p = sd === 'E' ? [L, W * 0.7] : sd === 'W' ? [0, W * 0.7] : sd === 'N' ? [L * 0.7, W] : [L * 0.7, 0]; I.els.push(Object.assign(newEl('ac', p[0], p[1]), { x: r2(p[0]), y: r2(p[1]), z: Math.round(Math.max(0, num(e.h, 2.8) - 1.1) * 10) / 10, rot: sd === 'E' || sd === 'W' ? 90 : 0, st: e.st || 'E' })); }
      needFit.iso = true; refresh(true); return;
    }
    case 'run-draw': if (mode === 'run' && runKind === d.kind) { action('run-done'); return; } mode = 'run'; runKind = RUNS[d.kind] ? d.kind : 'ladder'; draft = []; sel = null; needTop(); refresh(true); return;
    case 'run-more': { const r = sel && sel.k === 'run' && runById(sel.id); if (r) { mode = 'run'; runKind = r.kind; draft = []; needTop(); refresh(true); } return; }
    case 'run-done': if (runKind === 'ladder') draft = cleanPts(stopAtCabins(draft)); if (draft.length > 1) { push(); const l = fixRun(newRun(runKind, draft, S)); S.runs.push(l); sel = { k: 'run', id: l.id }; tab = 'els'; } mode = 'select'; draft = []; refresh(true); return;
    case 'align-toggle': autoAlign = !autoAlign; drawChrome(); return;
    case 'route-draw': mode = 'route'; fib = d.f === 'ug' ? 'ug' : 'ae'; sel = null; tab = 'route'; needTop(); refresh(true); return;
    case 'route-done': mode = 'select'; refresh(true); return;
    case 'route-undo': if (S.route[fib].pts.length) { push(); delPt(fib, S.route[fib].pts.length - 1); refresh(true); } return;
    case 'route-clear': { const f = d.f === 'ug' ? 'ug' : 'ae'; push(); S.route[f].pts = []; if (f === 'ug') S.route.ug.legs = []; sel = null; refresh(true); return; }
    case 'pt-del': push(); delPt(d.f === 'ug' ? 'ug' : 'ae', +d.i); sel = null; refresh(true); return;
    case 'lab-reset': if (sel && sel.k === 'lab' && S.lab[sel.key]) { push(); for (const v of ['p', 'i0', 'i1', 'i2', 'i3']) delete S.lab[sel.key][v]; refresh(true); } return;
    case 'lab-item': if (sel && sel.k === 'lab') { const q = labInfo(sel.key); if (q.item) { sel = q.item; tab = 'els'; refresh(true); panel.scrollTop = 0; } } return;
    case 'photo-place': mode = 'photo'; placing = d.id; needTop(); refresh(true); return;
    case 'photo-cancel': mode = 'select'; placing = null; refresh(true); return;
    case 'photo-del': push(); S.photos = S.photos.filter(p => p.id !== d.id); if (sel && sel.id === d.id) sel = null; needFit.sheets = true; refresh(true); return;
    case 'go-route': tab = 'route'; refresh(true); return;
    case 'export-zip': doExport('zip'); return;
    case 'export-pdf': doExport('pdf'); return;
    case 'copy-dxf': { const t = sheetsDXF(sheetsNow()); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { dump = ''; setMsg('DXF text copied. Paste it into a text file and name it .dxf.', 'good'); }, () => { dump = t; setMsg('Could not copy by itself. The DXF text is in the box below: select all of it, copy, paste into a text file and name it .dxf.', 'warn'); const d = $('#dump'); if (d) { d.focus(); d.select(); } }); return; }
  }
}
/* A site picture is taken with the camera of the app, with its checks (taken live, with a GPS fix; a dark or unclear one is refused).
   The app keeps it in its photo store and gives it back here to show and to print. No picture file can be brought in. */
let taking = false;
function takePhoto() {
  if (taking || VIEW || !HOST || !HOST.takePhoto) return; taking = true; photoNote = '';
  Promise.resolve(HOST.takePhoto()).then(r => {
    taking = false; if (!r || !r.id || !r.src) return;
    push(); IMG[r.id] = r.src; ROOT.photos.push(Object.assign({ id: r.id, cap: '', x: 0, y: 0, dir: 0, placed: false, w: r.w || 4, h: r.h || 3 }, r.at ? { at: r.at } : {}, r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : {})); needFit.sheets = true; tab = 'photos'; refresh(true);
  }, e => { taking = false; photoNote = 'The photo was not added' + (e && e.message ? ': ' + e.message : '.'); refresh(true); });
}
function useGps() {
  if (VIEW || APP.lock || !HOST || !HOST.gps) return; say('Getting the GPS position…'); drawChrome();
  Promise.resolve(HOST.gps()).then(g => { if (!g || !isFinite(g.lat) || !isFinite(g.lon)) { say('No GPS position yet. Stand in the open and try again.'); drawChrome(); return; } push(); ROOT.site.lat = +(+g.lat).toFixed(6); ROOT.site.lon = +(+g.lon).toFixed(6); say('Coordinates set from the GPS: stand at the tower when you tap it.'); refresh(true); }, () => { say('No GPS position.'); drawChrome(); });
}
function openSketch(file) {
  if (!file || VIEW) return; const rd = new FileReader();
  rd.onload = () => { try { const o = JSON.parse(rd.result); if (!o || !o.site || !Array.isArray(o.els)) throw 0; push(); setRoot(norm(o)); applyFixed(); sel = null; setMsg('Sketch opened. Pictures are not kept in a sketch file: take them again.', 'good'); refresh(true); } catch (e) { setMsg('That file is not a CEF sketch file.', 'warn'); } };
  rd.readAsText(file);
}
async function doExport(kind) {
  if (busy || !dl) return; busy = true; setMsg('Building the files…', 'note');
  try {
    saveNow();
    const X = appSketch(ROOT), base = baseName(X), sheets = appSheets(X), pdf = await appPdf(await toPDF(sheets, allImg(), X)); let name, data;
    if (kind === 'pdf') { name = base + '_CEF.pdf'; data = new Blob([pdf], { type: 'application/pdf' }); }
    else {
      const g = geo(X), files = [{ name: base + '_CEF_sheets.dxf', data: sheetsDXF(sheets) }, { name: base + '_CEF.pdf', data: pdf }];
      if (g) files.push({ name: base + '_CEF_map_UTM51N.dxf', data: mapDXF(X, g) }, { name: base + '_CEF.kml', data: toKML(X, g) });
      for (const k in LOGO) files.push({ name: 'logos/' + k + '_logo.png', data: b64bytes(LOGO[k].src) });
      X.photos.forEach((p, i) => { const src = IMG[p.id]; if (src) files.push({ name: 'photos/photo_' + String(i + 1).padStart(2, '0') + '.jpg', data: b64bytes(src), pid: p.id }); });
      files.push({ name: base + '_CEF_sketch.json', data: JSON.stringify(ROOT, null, 1) }, { name: 'README.txt', data: appReadme(readme(X, base, g, sheets)) });
      data = await HOST.zip(files); name = base + '_CEF.zip';                                  /* the app's own ZIP: it adds exported_by.txt and the photos as they are kept */
    }
    await dl.save({ filename: name, data, kind }); busy = false; setMsg((kind === 'pdf' ? 'The PDF' : 'The ZIP') + ' is ready: ' + name + '.', 'good');
  } catch (e) {
    const c = e && e.code; busy = false;
    setMsg(c === 'declined' ? 'Not saved. The save was cancelled.' : c ? 'Could not save here (' + c + ').' : 'Could not build the files: ' + (e && e.message ? e.message : e), 'warn');
  }
}

/* ---------- pointer work on the drawings ---------- */
function hitTest(m) {
  const u = unit('top'), pr = Math.max(10 * u, S.room ? 0.03 : 0.15);
  if (sel && sel.k === 'photo') { const p = phById(sel.id); if (p && p.placed) { const t = tip(p); if (Math.hypot(m[0] - t[0], m[1] - t[1]) < pr * 1.3) return { k: 'pdir', id: p.id }; } }
  if (!S.room && sel && sel.k === 'el') { const e = elById(sel.id); if (e && e.t === 'cabin') { let b = null; const try1 = (p, k, i) => { const d = Math.hypot(m[0] - p[0], m[1] - p[1]); if (d < pr * 1.3 && (!b || d < b.d)) b = { d, h: { k, id: e.id, i } }; };      /* the handle nearest the pointer: porthole, door or aircon unit */
    cabinPorts(e).forEach((q, i) => try1(q.at, 'porth', i)); cabinDoors(e).forEach((q, i) => try1(doorAt(e, q), 'doorh', i)); cabinAcs(e).forEach((q, i) => try1(q.at, 'ach', i)); if (b) return b.h; } }
  if (S.room && !focus && (!sel || sel.k === 'rdoor') && mode !== 'run' && mode !== 'route') for (let i = 0; i < S.gates.length; i++) { const q = S.gates[i], hz = q.side === 'S' || q.side === 'N', c = num(q.off, 0) + num(q.w, 0.9) / 2, p = hz ? [c, q.side === 'S' ? 0 : S.site.W] : [q.side === 'W' ? 0 : S.site.L, c]; if (Math.hypot(m[0] - p[0], m[1] - p[1]) < pr * 1.3) return { k: 'rdoor', i }; }
  if (tab === 'route' || (sel && sel.k === 'pt')) { const order = sel && sel.k === 'pt' && sel.f === 'ae' ? ['ae', 'ug'] : ['ug', 'ae']; for (const f of order) for (let i = S.route[f].pts.length - 1; i >= 0; i--) { const p = S.route[f].pts[i]; if (Math.hypot(m[0] - p.x, m[1] - p.y) < pr * 1.2) return { k: 'pt', f, i }; } }
  for (const p of S.photos) if (p.placed && Math.hypot(m[0] - p.x, m[1] - p.y) < Math.max(pr, topTh)) return { k: 'photo', id: p.id };
  if (sel && sel.k === 'run') { const l = runById(sel.id); if (l) for (let i = 0; i < l.pts.length; i++) if (Math.hypot(m[0] - l.pts[i][0], m[1] - l.pts[i][1]) < pr * 1.2) return { k: 'rpt', id: l.id, i }; }
  let best = null, ba = 1e9;
  for (const e of S.els) { const P = elPoly(e), b = polyBox(P), a = (b[2] - b[0]) * (b[3] - b[1]); if ((inPoly(m, P) || Math.hypot(m[0] - e.x, m[1] - e.y) < pr) && a < ba) { best = e; ba = a; } }
  if (best) return { k: 'el', id: best.id };
  for (const l of S.runs) for (let i = 0; i + 1 < l.pts.length; i++) if (distSeg(m, l.pts[i], l.pts[i + 1]) < Math.max(pr * 0.8, num(l.w, 0.4) / 2)) return { k: 'run', id: l.id };
  for (const f of ['ae', 'ug']) { const R = S.route[f].pts; for (let i = 0; i + 1 < R.length; i++) if (distSeg(m, [R[i].x, R[i].y], [R[i + 1].x, R[i + 1].y]) < pr * 0.8) return { k: 'pt', f, i: Math.hypot(m[0] - R[i].x, m[1] - R[i].y) < Math.hypot(m[0] - R[i + 1].x, m[1] - R[i + 1].y) ? i : i + 1 }; }
  return null;
}
/* the label under the pointer: the smallest one, when two overlap */
function labAt(labs, m) { let b = null, ba = 1e9; for (const l of labs) if (inPoly(m, l.poly)) { const a = polyBoxArea(l.poly); if (a < ba) { ba = a; b = l; } } return b; }
const sameHit = (a, b) => !!a && !!b && a.k === b.k && a.id === b.id && a.k !== 'pt';
/* what is under the pointer in the isometric: the height handle of the selected item first, then the smallest element there, then a run */
function hitIso(m) {
  const u = unit('iso'), pr = Math.max(12 * u, 0.1), near = p => p && Math.hypot(m[0] - p[0], m[1] - p[1]) < pr * 1.25;
  if (sel && sel.k === 'el') { const h = isoHits.find(q => q.k === 'el' && q.id === sel.id); if (h && near(h.hp)) return { k: 'elh', id: h.id, f: h.f }; if (h && near(h.lp)) return { k: 'ladh', id: h.id }; }
  if (sel && sel.k === 'run') { const h = isoHits.find(q => q.k === 'run' && q.id === sel.id); if (h && near(h.hp)) return { k: 'runh', id: h.id, f: h.f }; }
  if (tab === 'route' || (sel && sel.k === 'pt')) { const h = isoHits.find(q => q.k === 'aer'); if (h && near(h.hp)) return { k: 'aerh' }; }
  /* something very small is picked when the tap lands close to it; a line that is closer still to the tap wins over it */
  let best = null, ba = 1e9, bd = 0;
  for (const h of isoHits) if (h.k === 'el' && (!focus || h.item)) {
    const b = polyBox(h.poly), a = (b[2] - b[0]) * (b[3] - b[1]), ins = inPoly(m, h.poly), dc = Math.hypot(m[0] - (b[0] + b[2]) / 2, m[1] - (b[1] + b[3]) / 2);
    if ((ins || (Math.max(b[2] - b[0], b[3] - b[1]) < 2 * pr && dc < pr)) && a < ba) { ba = a; best = h; bd = ins ? 0 : dc; }
  }
  if (!focus) for (const h of isoHits) if (h.k === 'run') for (let i = 0; i + 1 < h.line.length; i++) { const d = distSeg(m, h.line[i], h.line[i + 1]); if (d < pr * 0.8 && (!best || ba > 6 || d < bd)) return { k: 'run', id: h.id }; }
  return best ? { k: 'el', id: best.id } : null;
}
function grab(h) {
  if (h.k === 'el') { const e = elById(h.id), on = []; if (e && SNAPS.includes(e.t)) for (const f of ['ae', 'ug']) for (const p of S.route[f].pts) if (Math.hypot(p.x - e.x, p.y - e.y) < 0.06) on.push(p); return e ? { x: e.x, y: e.y, u: e.u, r: riders(e).map(q => ({ q, x: q.x, y: q.y })), on } : null; }   /* fiber points that sit on the item go with it */
  if (h.k === 'porth') { const e = elById(h.id), q = e && cabinPorts(e)[h.i]; return q ? { x: q.at[0], y: q.at[1] } : null; }
  if (h.k === 'doorh') { const e = elById(h.id), q = e && cabinDoors(e)[h.i]; if (!q) return null; const c = doorAt(e, q); return { x: c[0], y: c[1] }; }
  if (h.k === 'ach') { const e = elById(h.id), q = e && cabinAcs(e)[h.i]; return q ? { x: q.at[0], y: q.at[1] } : null; }
  if (h.k === 'rdoor') { const q = S.gates[h.i]; if (!q) return null; const hz = q.side === 'S' || q.side === 'N', c = num(q.off, 0) + num(q.w, 0.9) / 2; return hz ? { x: c, y: q.side === 'S' ? 0 : S.site.W } : { x: q.side === 'W' ? 0 : S.site.L, y: c }; }
  if (h.k === 'pt') { const p = S.route[h.f].pts[h.i]; return p ? { x: p.x, y: p.y } : null; }
  if (h.k === 'lab') { const l = (h.v === 'p' ? topLabs : isoLabs).find(q => q.key === h.key); return l ? { ox: l.c[0] - l.ap[0], oy: l.c[1] - l.ap[1] } : null; }
  if (h.k === 'run') { const l = runById(h.id); if (!l) return null; const P = l.pts.map(q => q.slice()); P.z = num(l.z, 0); return P; }
  if (h.k === 'ladh') { const e = elById(h.id), L = e && towerLad(S, e); return L ? { x: L.foot[0], y: L.foot[1] } : null; }
  if (h.k === 'elh') { const e = elById(h.id); return e ? { v: num(e[h.f], 0) } : null; }
  if (h.k === 'runh') { const l = runById(h.id); return l ? { v: num(l[h.f], h.f === 'dp' ? RUNS.trench.dp : 0) } : null; }
  if (h.k === 'aerh') return { v: num(S.route.aerialH, STD.msg) };
  if (h.k === 'rpt') { const l = runById(h.id); return l && l.pts[h.i] ? l.pts[h.i].slice() : null; }
  if (h.k === 'photo') { const p = phById(h.id); return p ? { x: p.x, y: p.y } : null; }
  return {};
}
function dragTo(g, dx, dy) {
  const h = g.hit, o = g.orig; if (!o) return;
  if (h.k === 'lab') { const q = S.lab[h.key] || (S.lab[h.key] = {}); q[h.v] = [r2(o.ox + dx), r2(o.oy + dy)]; dragNote = 'Label moved · it stays with its item'; return; }
  if (g.n === 'iso') {                                   /* in the isometric: up and down is height, the rest is a move on the ground */
    const up = dy, lim = (v, a, b) => clamp(snap(v), a, b);
    /* an item in a rack moves up and down its rack, one unit at a time, to the nearest free place */
    const ride = (e, u0) => { const host = e && rackHost(S, e); if (!host) return false; const u = slotFor(S, host, e, Math.round(num(u0, 1) + up / RU)); if (u != null) e.u = u; dragNote = TYPES[e.t].s + ' at ' + uText({ u: num(e.u, 1), ru: units(e) }) + ' of ' + rackOf(host).n + ' · counted from the bottom'; return true; };
    if (h.k === 'elh' && h.f === 'u') { ride(elById(h.id), o.v); return; }
    if (h.k === 'el') { const e = elById(h.id); if (e && inRack(e) && ride(e, o.u)) return; if (focus) return; }
    if (h.k === 'elh') { const e = elById(h.id); if (e) { if (h.f === 'dp') e.dp = lim(o.v - up, 0.1, 10); else if (h.f === 'z') e.z = lim(o.v + up, 0, 100); else e.h = lim(o.v + up, 0.05, 100); dragNote = (h.f === 'dp' ? 'Depth ' : h.f === 'z' ? 'Height above ground ' : 'Height ') + f1(e[h.f]) + ' m'; } return; }
    if (h.k === 'runh') { const l = runById(h.id); if (l) { if (h.f === 'dp') l.dp = lim(o.v - up, 0.1, 10); else l.z = lim(o.v + up, 0, 60); dragNote = (h.f === 'dp' ? 'Depth ' : 'Height above ground ') + f1(l[h.f]) + ' m'; } return; }
    if (h.k === 'aerh') { S.route.aerialH = lim(o.v + up, 0.5, 60); dragNote = 'Aerial cable height ' + f1(S.route.aerialH) + ' m'; return; }
    if (h.k === 'run') {                                   /* a ladder or raised pipe is up in the air: dragging it straight up or down changes its height, any other way moves it across the ground */
      const l = runById(h.id);
      if (l && !buried(l)) {
        if (!g.lock && Math.hypot(dx, dy) > 7 * unit('iso')) g.lock = Math.abs(dx) < 0.5 * Math.abs(dy) ? 'z' : 'xy';
        if (!g.lock) return;
        if (g.lock === 'z') { l.z = lim(o.z + up, 0, 60); dragNote = RUNS[l.kind].n + ' height ' + f1(l.z) + ' m · its ' + (S.room ? 'hangers' : 'posts') + ' follow'; return; }
        dragNote = 'Moved across the ground · height stays ' + f1(num(l.z, 0)) + ' m (drag straight up or down to change it)';
      }
    }
    if (!isoSc) return; const d = isoSc.ground(dx, dy); dx = d[0]; dy = d[1];
    if (h.k === 'ladh') {                                  /* the tower's ladder goes to the side it is dragged to */
      const e = elById(h.id); if (!e) return; const H = towerHull(e), p = [o.x + dx, o.y + dy]; let b = null;
      for (let i = 0; i < H.length; i++) { const a = H[i], c = H[(i + 1) % H.length], ex = c[0] - a[0], ey = c[1] - a[1], t = clamp(((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1), dd = Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t); if (!b || dd < b.d) b = { d: dd, i, t }; }
      e.lad = b.i; e.ladT = r2(clamp(b.t, 0.12, 0.88)); dragNote = 'Tower ladder on side ' + (b.i + 1); return;
    }
  }
  if (h.k === 'porth') { const e = elById(h.id); if (e) sitePort(e, h.i, [o.x + dx, o.y + dy]); return; }
  if (h.k === 'doorh') { const e = elById(h.id); if (e) siteDoor(e, h.i, [o.x + dx, o.y + dy]); return; }
  if (h.k === 'ach') { const e = elById(h.id); if (e) siteAc(e, h.i, [o.x + dx, o.y + dy]); return; }
  if (h.k === 'rdoor') { const g = S.gates[h.i]; if (g) { const k = slideDoor(g, S.site.L, S.site.W, [o.x + dx, o.y + dy]); dragNote = 'Door on the ' + WALLN[k.side] + ' wall, ' + f2(g.off) + ' m from its ' + (k.side === 'S' || k.side === 'N' ? 'left' : 'bottom') + ' end'; } return; }
  if (h.k === 'el') { const e = elById(h.id); if (e) { const sn = relSnap(e, [o.x + dx, o.y + dy]); dragNote = sn ? sn.note : ''; e.x = sn ? sn.p[0] : snap(o.x + dx); e.y = sn ? sn.p[1] : snap(o.y + dy); if (e.t === 'ac' && S.room) { const k = toWall(e); dragNote = 'Aircon unit on the ' + { S: 'bottom', N: 'top', W: 'left', E: 'right' }[k.side] + ' wall, outside it'; }
      if (e.t === 'port' && S.room) { const k = toWall(e), mk = (roomCtx ? roomCtx.marks : []).filter(q => q.side === k.side).map(q => ({ q, d: Math.hypot(q.x - e.x, q.y - e.y) })).sort((a, b) => a.d - b.d)[0]; dragNote = 'Porthole on the ' + { S: 'bottom', N: 'top', W: 'left', E: 'right' }[k.side] + ' wall'; if (mk && mk.d < 0.4) { e.x = r2(mk.q.x); e.y = r2(mk.q.y); dragNote = 'Porthole in line with the ' + (mk.q.kind === 'ladder' ? 'cable ladder' : 'cable') + ' outside · it arrives ' + f1(mk.q.z) + ' m above the floor'; } } for (const r of o.r) { r.q.x = r2(r.x + e.x - o.x); r.q.y = r2(r.y + e.y - o.y); } for (const p of o.on || []) { p.x = e.x; p.y = e.y; } } }
  else if (h.k === 'pt') { const R = S.route[h.f].pts, p = R[h.i]; if (p) { const q = movePt([o.x + dx, o.y + dy], [R[h.i - 1], R[h.i + 1]].map(t => t && [t.x, t.y]), h.f); p.x = q[0]; p.y = q[1]; } }
  else if (h.k === 'run') { const l = runById(h.id); if (l) l.pts = o.map(q => [snap(q[0] + dx), snap(q[1] + dy)]); }
  else if (h.k === 'rpt') { const l = runById(h.id); if (l && l.pts[h.i]) { const q = movePt([o[0] + dx, o[1] + dy], [l.pts[h.i - 1], l.pts[h.i + 1]], null, l.kind === 'ladder'); l.pts[h.i] = S.room && l.kind === 'part' ? onRoomWall(q) : q; } }
  else if (h.k === 'photo') { const p = phById(h.id); if (p) { p.x = snap(o.x + dx); p.y = snap(o.y + dy); } }
  else if (h.k === 'pdir') { const p = phById(h.id); if (p) p.dir = Math.round((Math.atan2(g.m0[0] + dx - p.x, g.m0[1] + dy - p.y) / D2R % 360 + 360) % 360); }
}
function pick(h, switchTab) {
  if (h && h.k === 'aerh') return;
  if (!h) sel = null; else if (focus && h.k === 'el' && h.id === focus) sel = null; else if (h.k === 'lab') sel = { k: 'lab', key: h.key }; else if (h.k === 'rpt' || h.k === 'runh') sel = { k: 'run', id: h.id }; else if (h.k === 'elh' || h.k === 'ladh' || h.k === 'porth' || h.k === 'doorh' || h.k === 'ach') sel = { k: 'el', id: h.id }; else if (h.k === 'pdir') sel = { k: 'photo', id: h.id }; else if (h.k === 'rdoor') sel = null; else sel = h;
  if (switchTab && sel && sel.k !== 'lab') { tab = sel.k === 'pt' ? 'route' : sel.k === 'photo' ? 'photos' : 'els'; }
}
function tap(g) {
  const m = g.m0;
  if (mode === 'route') { push(); addPt(snapPt(m)); refresh(true); return; }
  if (mode === 'run') { const q = snapPt(m); draft.push(q); refresh(true); return; }
  if (mode === 'photo') { const p = phById(placing); if (p) { push(); p.x = snap(m[0]); p.y = snap(m[1]); p.placed = true; sel = { k: 'photo', id: p.id }; } mode = 'select'; placing = null; refresh(true); return; }
  /* a name written on its item: the first tap picks the item, a second tap on the name picks the label */
  const had = !!sel, lb = g.lab && (!g.hit || sameHit(sel, g.hit) || g.hit.k === 'lab') ? { k: 'lab', key: g.lab.key } : null; pick(lb || g.hit, true); refresh(true); if (sel && (sel.k === 'el' || sel.k === 'run' || sel.k === 'lab') && !had) panel.scrollTop = 0;
}
function zoomAt(n, f, cx, cy) { const v = VB[n]; if (!v) return; const nw = clamp(v.w * f, small() ? 0.2 : 0.8, 6000), k = nw / v.w; if (cx == null) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; } v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.w = nw; v.h *= k; applyVB(n); if (n === 'top') drawOverlay(); if (n === 'iso') drawIsoOverlay(); relabel(); }
function bindView(n) {
  const svg = SVG[n], P = new Map(); let g = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button > 1) return; if (e.button === 1) e.preventDefault(); active = n; if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    try { svg.setPointerCapture(e.pointerId); } catch (_) { }
    P.set(e.pointerId, [e.clientX, e.clientY]); dragNote = '';
    if (P.size === 2) { const a = [...P.values()]; if (live) { live = null; drawOverlay(); } g = { k: 'pinch', d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), mx: (a[0][0] + a[1][0]) / 2, my: (a[0][1] + a[1][1]) / 2 }; return; }
    if (P.size > 2) return;
    const s = toSvg(n, e.clientX, e.clientY), m = [s[0], -s[1]];
    g = { k: 'tap', n, id: e.pointerId, sx: e.clientX, sy: e.clientY, m0: m, u: unit(n), vb: Object.assign({}, VB[n]), hit: n === 'top' && mode === 'select' && e.button === 0 ? hitTest(m) : null, moved: false };
    if (n === 'top' && mode === 'select' && e.button === 0) { const lb = labAt(topLabs, m); g.lab = lb; if (lb && sel && sel.k === 'lab' && sel.key === lb.key) g.hit = { k: 'lab', key: lb.key, v: 'p' }; }   /* a picked label is dragged by its text */
    if (n === 'iso' && mode === 'select' && e.button === 0) {          /* a tap picks; only the item already picked (or a handle) can be dragged, so moving the view never moves a thing by accident */
      const h = hitIso(m), lb = labAt(isoLabs, m), hand = h && (h.k === 'elh' || h.k === 'runh' || h.k === 'aerh' || h.k === 'ladh'); g.tapHit = h;
      if (lb && !hand && sel && sel.k === 'lab' && sel.key === lb.key) g.hit = g.tapHit = { k: 'lab', key: lb.key, v: 'i' + (isoSc ? isoSc.k : (S.iso | 0) & 3) };
      else if (h && (hand || (sel && sel.k === h.k && sel.id === h.id))) g.hit = h;
      if (lb && !hand && (!h || sameHit(sel, h))) g.tapHit = { k: 'lab', key: lb.key };
    }
    g.draw = n === 'top' && (mode === 'route' || mode === 'run') && e.button === 0 && !e.shiftKey; if (g.draw) g.stroke = [m];
    if (VIEW) { g.hit = null; g.draw = false; } if (g.hit) g.orig = grab(g.hit);
  });
  svg.addEventListener('pointermove', e => {
    if (n === 'top' && e.pointerType === 'mouse') { const s = toSvg(n, e.clientX, e.clientY), c = f1(s[0]) + ' m from left · ' + f1(-s[1]) + ' m from bottom'; if (c !== cursor) { cursor = c; const el = $('#status .h'); if (el) el.textContent = c; } }
    if (!P.has(e.pointerId)) return; P.set(e.pointerId, [e.clientX, e.clientY]); if (!g) return;
    if (g.k === 'pinch') { if (P.size < 2) return; const a = [...P.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), mx = (a[0][0] + a[1][0]) / 2, my = (a[0][1] + a[1][1]) / 2, u = unit(n), c = toSvg(n, mx, my); VB[n].x -= (mx - g.mx) * u; VB[n].y -= (my - g.my) * u; zoomAt(n, g.d / Math.max(d, 1), c[0] - (mx - g.mx) * u, c[1] - (my - g.my) * u); g.d = d; g.mx = mx; g.my = my; return; }
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved) { if (Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 3 : 8)) return; g.moved = true; if (g.hit) { push(); pick(g.hit, false); } }
    if (g.draw) { const q = toSvg(n, e.clientX, e.clientY), l = g.stroke[g.stroke.length - 1]; if (Math.hypot(q[0] - l[0], -q[1] - l[1]) > 2 * g.u) { g.stroke.push([q[0], -q[1]]); live = g.stroke; drawOverlay(); } }
    else if (g.hit) { dragTo(g, dx * g.u, -dy * g.u); schedule(); }
    else if (VB[n]) { VB[n].x = g.vb.x - dx * g.u; VB[n].y = g.vb.y - dy * g.u; applyVB(n); }
  });
  const up = e => {
    if (!P.has(e.pointerId)) return; P.delete(e.pointerId); if (!g) return;
    if (g.k === 'pinch') { if (P.size < 2) g = null; return; }
    if (e.pointerId !== g.id) return; const gg = g; g = null;
    if (gg.draw && gg.moved) { live = null; if (e.type === 'pointerup' && !finishStroke(gg.stroke)) tap(gg); else refresh(true); }
    else if (!gg.moved && e.type === 'pointerup') { if (n === 'top') tap(gg); else if (n === 'iso' && mode === 'select') { const had = !!sel; pick(gg.tapHit || null, !focus); refresh(true); if (sel && !had) panel.scrollTop = 0; } }
    else if (gg.moved && gg.hit) { dragNote = ''; if (gg.hit.k === 'el') settle(elById(gg.hit.id)); pick(gg.hit, !focus); refresh(true); }
    else if (n === 'top') drawOverlay();
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', () => { if (cursor) { cursor = ''; drawChrome(); } });
  svg.addEventListener('wheel', e => { e.preventDefault(); const c = toSvg(n, e.clientX, e.clientY); zoomAt(n, Math.exp(clamp(e.deltaY, -150, 150) * 0.0016), c[0], c[1]); }, { passive: false });
}

/* ---------- start ---------- */
{ const st = document.createElement('style'); st.textContent = layerCSS(); document.body.appendChild(st); }
view = window.matchMedia('(min-width: 1100px)').matches ? 'both' : 'top';

setRoot(norm(blank()));          /* until the plan comes from the app */
for (const n of ['top', 'iso', 'sheets']) bindView(n);
panel.addEventListener('input', e => { const t = e.target, k = t.dataset && t.dataset.k; if (!k || t.type === 'file') return; if (applyField(k, t)) { drawViews(); drawChrome(); save(); } });
panel.addEventListener('change', e => { const t = e.target, k = t.dataset && t.dataset.k; if (k === 'open') { openSketch(t.files[0]); t.value = ''; return; } setTimeout(() => refresh(true), 0); });
panel.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) action(b.dataset.a, b); });
$('#modebar').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) action(b.dataset.a, b); });
$('#status').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) action(b.dataset.a, b); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; msg = tab === 'export' ? msg : null; refresh(true); panel.scrollTop = 0; });
$('#segView').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); });
$('#bUndo').addEventListener('click', undo);
$('#guide').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) action(b.dataset.a, b); });
$('#bDone').addEventListener('click', () => { saveNow(); if (HOST && HOST.close) HOST.close(); });
$('#bBack').addEventListener('click', goBack);
$('#bTurn').addEventListener('click', () => { if (focus) { focusTurn = focusTurn ? 0 : 1; needFit.iso = true; refresh(false); return; } push(); S.iso = ((S.iso | 0) + 1) % 4; needFit.iso = needFit.sheets = true; if (VIEW) SNAP = JSON.stringify(ROOT); refresh(false); });
$('#bIn').addEventListener('click', () => zoomAt(view === 'both' ? active : view, 1 / 1.3));
$('#bOut').addEventListener('click', () => zoomAt(view === 'both' ? active : view, 1.3));
$('#bFit').addEventListener('click', () => { needFit.top = needFit.iso = needFit.sheets = true; drawViews(); });
window.addEventListener('keydown', e => {
  if (VIEW && e.key !== 'Escape') return;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); }
  else if (e.key === 'Escape') { if (mode !== 'select') { mode = 'select'; draft = []; live = null; placing = null; } else sel = null; refresh(true); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && sel) { e.preventDefault(); delSel(); }
});
window.addEventListener('resize', () => { if (view === 'both' && !wide()) setView('top'); else drawOverlay(); });
window.addEventListener('load', () => { needFit.top = needFit.iso = true; drawViews(); });
refresh(true);
/* Saving: the app's own save and share. A test build can put its own saver on this page (window.__cefSave). */
dl = { save: o => (typeof window.__cefSave === 'function' ? window.__cefSave(o) : HOST.deliver(o.filename, o.data, o.kind)) }; dlReady = true;
async function start() {
  let A = null; try { A = HOST ? await HOST.init() : null; } catch (e) { A = null; }
  if (!A) { $('#nohost').hidden = false; document.querySelector('.app').hidden = true; return; }
  APP = Object.assign(APP, A.app || {}); VIEW = APP.viewOnly || ''; IMG = Object.assign({}, A.photos || {});
  let o = null; try { o = A.sketch ? JSON.parse(A.sketch) : null; } catch (e) { o = null; }
  setRoot(norm(o && o.site ? o : blank())); applyFixed(); await setLogos(A.logos || {});
  hist = []; sel = null; mode = 'select'; tab = A.tab && TABS[A.tab] ? A.tab : 'site'; SNAP = JSON.stringify(ROOT); LAST = o && o.site ? SNAP : ''; READY = true;
  document.body.classList.toggle('viewonly', !!VIEW); $('#bUndo').hidden = !!VIEW;
  needFit.top = needFit.iso = needFit.sheets = true; refresh(true);
}
/* what the app and its tests reach on this page */
window.CEF = { ready: () => READY, flush: saveNow, sketch: () => JSON.stringify(ROOT), photoIds: () => (ROOT ? ROOT.photos.map(p => p.id) : []), setLogos: Lg => setLogos(Lg).then(() => refresh(true)), view: () => VIEW,
  test: { start: o => { setRoot(norm(o)); applyFixed(); hist = []; lastPush = { k: '', t: 0 }; sel = null; mode = 'select'; tab = 'site'; refresh(true); saveNow(); }, load: (o, imgs) => { push(); setRoot(norm(o)); applyFixed(); if (imgs) Object.assign(IMG, imgs); sel = null; mode = 'select'; refresh(true); saveNow(); }, photo: (id, src, w, h) => { IMG[id] = src; ROOT.photos.push({ id, cap: '', x: 0, y: 0, dir: 0, placed: false, w: w || 4, h: h || 3 }); needFit.sheets = true; refresh(true); } } };
start();
