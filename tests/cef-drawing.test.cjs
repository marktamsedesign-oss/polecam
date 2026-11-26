/* beta 7.16 (CEF drawing): the owner's items on the CEF plan's drawing, in Node: the CEF plan's engine (vendor/cef 30_core.js, 40_iso.js,
   50_export.js, as the editor's page runs it). Run: node --test tests/cef-drawing.test.cjs (or python3 tests/run_all.py --only cef-drawing).
   - (2) "Exit Conduit: extend conduits only without concrete scenarios": an exit conduit with its conduits only (el.conc false): no concrete block
     in the top view, the isometric and its detail, the two pipes from the ground up; named ", NO CONCRETE"; a row of its own in the CEF table and
     a note of its own, with no concrete; the DXF valid (ezdxf's audit, when Python has ezdxf: GESAA_PY, else python3).
   - Without the new choice and away from what the fixes change, every output (the DXF with its layout tabs and of the older kind, the sheets,
     the PDF, the KML, the table and its notes) byte for byte as beta 7.15 (6e2bd49) made them: SHA-256 of that engine's output on the same plans.
   Every name, number and place is made up. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : Buffer.from(x)).digest('hex').slice(0, 16);
/* the engine as the editor's page loads it, in a context of its own: a fixed clock and made-up random numbers, so its output can be compared */
const FIXED = Date.UTC(2026, 10, 25, 4, 0, 0);
class FDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } }
function engine() {
  const ctx = vm.createContext({ console, Date: FDate, Math: Object.create(Math), TextEncoder, TextDecoder, Uint8Array, setTimeout, clearTimeout, Promise, atob, btoa });
  ctx.self = ctx; ctx.window = ctx;
  let seed = 7; ctx.Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'pdf-lib', 'pdf-lib.min.js'), 'utf8'), ctx, { filename: 'pdf-lib.min.js' });
  for (const f of ['30_core.js', '40_iso.js', '50_export.js']) vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'cef', f), 'utf8'), ctx, { filename: f });
  vm.runInContext(SKETCHES, ctx, { filename: 'sketches' });
  return ctx;
}
/* the made-up CEF plans (built with the engine's own functions) */
const SKETCHES = String.raw`var MK = {};
(function () {
  const fix = S => { let n = 0; const ren = o => { o.id = 'k' + (++n); }; for (const e of S.els) { ren(e); if (e.inside) { for (const q of e.inside.els) ren(q); for (const r of e.inside.runs) ren(r); } } for (const r of S.runs) ren(r); return JSON.parse(JSON.stringify(S)); };
  const add = (S, t, x, y, o) => { const e = Object.assign(newEl(t, x, y), o || {}); S.els.push(e); return e; };
  const named = S => { S.sample = false; Object.assign(S.site, { name: 'DEMO SITE', id: 'DEMO-0001', link: 'DEMO PROJECT', serial: 'OWO-0000-001', org: 'DEMO CONTRACTOR', by: 'Juan Dela Cruz', chk: 'Maria Santos', apr: 'Pedro Reyes' }); return S; };
  const pts = P => P.map(p => ({ x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100 }));
  const ug = (S, P) => { S.route.ug.pts = pts(P); S.route.ug.legs = S.route.ug.pts.slice(1).map(() => ({ type: 'auto' })); };
  /* the engine's sample site, named; its exit conduits taken away (the cable comes out of the ground where the trench ends) */
  MK.named = () => fix(named(sampleSite()));
  MK.noexit = () => { const S = MK.named(); S.els = S.els.filter(e => e.t !== 'exit'); return S; };
  MK.noexitPed = () => { const S = MK.noexit(); S.els.find(e => e.t === 'rpole').ped = 'P'; return S; };
  MK.empty = () => { const d = blank(); Object.assign(d.site, { name: 'DEMO EMPTY', id: 'DEMO-0001', lat: 7.07, lon: 125.6 }); return d; };
  /* an existing pole on the site that no cable goes up */
  MK.epoleIdle = () => { const S = MK.noexit(); add(S, 'epole', 17, 14, { st: 'E' }); return fix(S); };
  /* a cabin whose inside has its own cable, from the porthole to the ODF; the site's cable ends on the porthole (as plans before 2.45.1 / beta 6.9 did) */
  MK.cabinOld = () => {
    const S = blank(); named(S); Object.assign(S.site, { L: 20, W: 16, lat: 7.071, lon: 125.611, bearing: 10 });
    add(S, 't3', 15, 11, { w: 5, th: 40 });
    const c = add(S, 'cabin', 6, 8, { w: 3, d: 4, h: 2.8 }), I = c.inside = newRoom(c), port = I.els.find(q => q.t === 'port'); port.x = 0; port.y = 0.5; port.rot = 90;
    const rk = newEl('rack2', 2.2, 3.2); I.els.push(rk); const od = Object.assign(newEl('odf', rk.x, rk.y), { st: 'P' }); I.els.push(od);
    I.runs.push(Object.assign(newRun('ladder', [[0.15, 0.5], [0.15, 3.2], [2.2, 3.2]]), { z: 2.2 }));
    I.route.ug.pts = pts([[0, 0.5], [0.15, 0.5], [0.15, 3.2], [2.2, 3.2], [od.x, od.y]]); I.route.ug.legs = I.route.ug.pts.slice(1).map(() => ({ type: 'auto' }));
    add(S, 'rpole', 2, 1.5); S.runs.push(newRun('trench', [[2, 1.5], [2, 6.5], [4.5, 6.5]]));
    S.route.ae.pts = [{ x: -6, y: 1.5, loop: 0 }, { x: 2, y: 1.5, loop: 15 }];
    ug(S, [[2, 1.5], [2, 6.5], cabinPorts(c)[0].at]);
    return fix(S);
  };
  /* the UG fiber from the riser pole along the trench to the exit conduit at the cabin wall, up to the porthole, along the ladder inside, to the ODF in the rack */
  MK.cabin1 = () => {
    const S = blank(); named(S); Object.assign(S.site, { L: 20, W: 16, lat: 7.071, lon: 125.611, bearing: 10 });
    add(S, 't3', 15, 11, { w: 5, th: 40 });
    const c = add(S, 'cabin', 6, 8, { w: 3, d: 4, h: 2.8 }), I = c.inside = newRoom(c), port = I.els.find(q => q.t === 'port'); port.x = 0; port.y = 0.5; port.rot = 90;
    const rk = newEl('rack2', 2.2, 3.2); I.els.push(rk); const od = Object.assign(newEl('odf', rk.x, rk.y), { st: 'P' }); I.els.push(od);
    I.runs.push(Object.assign(newRun('ladder', [[0.15, 0.5], [0.15, 3.2], [2.2, 3.2]]), { z: 2.2 }));
    add(S, 'rpole', 2, 1.5); add(S, 'exit', 4.3, 6.5, { st: 'P' }); S.runs.push(newRun('trench', [[2, 1.5], [2, 6.5], [4.3, 6.5]]));
    S.route.ae.pts = [{ x: -6, y: 1.5, loop: 0 }, { x: 2, y: 1.5, loop: 15 }];
    ug(S, [[2, 1.5], [2, 6.5], [4.3, 6.5], cabinPorts(c)[0].at, fromRoom(c, [0.15, 3.2]), fromRoom(c, [2.2, 3.2]), fromRoom(c, [od.x, od.y])]);
    return fix(S);
  };
  /* two cabins: riser pole > trench > exit conduit > porthole of cabin A > ladder in A > A's porthole on its other wall > ladder between the cabins > porthole of cabin B > ladder in B > 2-post rack > ODF */
  MK.cabin2 = () => {
    const S = blank(); named(S); Object.assign(S.site, { L: 24, W: 18, lat: 7.072, lon: 125.612, bearing: 0 });
    add(S, 't3', 19, 14, { w: 5, th: 40 });
    const A = add(S, 'cabin', 7, 9, { w: 3, d: 4, h: 2.8 }), IA = A.inside = newRoom(A), pa = IA.els.find(q => q.t === 'port'); pa.x = 0; pa.y = 0.6; pa.rot = 90;
    IA.els.push(Object.assign(newEl('port', 3, 3.4), { z: 2.3, rot: 90 }));
    IA.runs.push(Object.assign(newRun('ladder', [[0.15, 0.6], [0.15, 3.4], [2.85, 3.4]]), { z: 2.2 }));
    const B = add(S, 'cabin', 12, 9, { w: 3, d: 4, h: 2.8 }), IB = B.inside = newRoom(B), pb = IB.els.find(q => q.t === 'port'); pb.x = 0; pb.y = 3.4; pb.rot = 90;
    const rk = newEl('rack2', 2, 1.6); IB.els.push(rk); const od = Object.assign(newEl('odf', rk.x, rk.y), { st: 'P' }); IB.els.push(od);
    IB.runs.push(Object.assign(newRun('ladder', [[0.15, 3.4], [2, 3.4], [2, 1.6]]), { z: 2.2 }));
    add(S, 'rpole', 2, 1.5); add(S, 'exit', 5.3, 7.6, { st: 'P' }); S.runs.push(newRun('trench', [[2, 1.5], [2, 7.6], [5.3, 7.6]]));
    const PA2 = fromRoom(A, [3, 3.4]), PB1 = fromRoom(B, [0, 3.4]); S.runs.push(Object.assign(newRun('ladder', [PA2, PB1]), { z: 2.2 }));
    S.route.ae.pts = [{ x: -6, y: 1.5, loop: 0 }, { x: 2, y: 1.5, loop: 15 }];
    ug(S, [[2, 1.5], [2, 7.6], [5.3, 7.6], fromRoom(A, [0, 0.6]), fromRoom(A, [0.15, 3.4]), fromRoom(A, [2.85, 3.4]), PA2, PB1, fromRoom(B, [2, 3.4]), fromRoom(B, [od.x, od.y])]);
    return fix(S);
  };
  /* (2) the exit conduits with their conduits only, no concrete */
  MK.namedBare = () => { const S = MK.named(); for (const e of S.els) if (e.t === 'exit') e.conc = false; return S; };
  MK.cabin1Bare = () => { const S = MK.cabin1(); S.els.find(e => e.t === 'exit').conc = false; return S; };
  /* (3) the riser pole marked existing (the pole is there, its riser is new); an existing pole that takes the riser; one with no cable up it */
  MK.rpoleE = () => { const S = MK.noexit(); S.els.find(e => e.t === 'rpole').st = 'E'; return S; };
  MK.epoleR = () => { const S = MK.noexit(); const p = S.els.find(e => e.t === 'rpole'); p.t = 'epole'; p.st = 'E'; return S; };
  MK.rpoleEidle = () => { const S = MK.rpoleE(); S.route.ug.pts = []; S.route.ug.legs = []; S.route.ae.pts = []; return S; };
})();
`;
const E = engine();
const mk = (nm) => vm.runInContext(`MK.${nm}()`, E);
const run = (code, sk) => { E.SK = sk; const v = vm.runInContext(code, E); return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; };      /* (out of the engine's realm) */
/** the prims of one item of the plan in a drawing (its block), by the item's kind and number among its kind: 'EXIT_2' */
const own = (prims, blk) => prims.filter((p) => p.g && p.g.split('|')[0] === blk);
const box2 = (P) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) for (const q of p.pts || [p.c]) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return [x0, y0, x1, y1]; };
function audit(text) {      /* ezdxf's audit, with a Python that has ezdxf (GESAA_PY, else python3; none: null) */
  for (const py of [process.env.GESAA_PY, 'python3'].filter(Boolean)) {
    if (spawnSync(py, ['-c', 'import ezdxf'], { encoding: 'utf8' }).status !== 0) continue;
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-cefdraw-')), f = path.join(d, 'cef.dxf'); fs.writeFileSync(f, text);
    const r = spawnSync(py, ['-I', '-c', 'import sys, ezdxf\nfrom ezdxf import recover\ndoc, a = recover.readfile(sys.argv[1])\nb = doc.audit()\nprint(len(a.errors), len(b.errors), len(b.fixes))\nfor e in b.errors[:5]: print(e.message)', f], { encoding: 'utf8' });
    fs.rmSync(d, { recursive: true, force: true }); return (r.stdout || '') + (r.stderr || '');
  }
  return null;
}

test('(2) an exit conduit with its conduits only: no concrete block in any view, its two pipes from the ground up, named and counted so, with no concrete', async () => {
  const S = mk('namedBare'), S0 = mk('named');
  assert.deepEqual(run(`SK.els.filter((e) => e.t === 'exit').map((e) => elLabel(SK, e))`, S), ['EXIT CONDUIT, NO CONCRETE', 'PROPOSED EXIT CONDUIT, NO CONCRETE'], 'its name says so');
  assert.deepEqual(run(`SK.els.filter((e) => e.t === 'exit').map((e) => elLabel(SK, e))`, S0), ['EXIT CONDUIT', 'PROPOSED EXIT CONDUIT'], 'with its concrete block: as before');
  /* the top view: the block (a closed outline 0.42 m square) only with concrete; the two 114.3 mm pipes side by side, the spare with the cross of its plug */
  const top = (sk) => { const P = run(`buildTop(SK, { labels: true }).prims`, sk); return ['EXIT_1', 'EXIT_2'].map((b) => own(P, b)); };
  for (const q of top(S)) { assert.ok(!q.some((p) => p.k === 'pl' && p.close), 'no block outline'); assert.equal(q.filter((p) => p.k === 'ci' && Math.abs(p.r - 0.05715) < 1e-6).length, 2, 'its two pipes'); assert.equal(q.filter((p) => p.k === 'pl' && !p.close).length, 2, 'the cross of the blank duct plug on the spare'); }
  for (const q of top(S0)) assert.equal(q.filter((p) => p.k === 'pl' && p.close).length, 1, 'with concrete: the block');
  /* the isometric: without the block an exit conduit is as wide as its two pipes (above the ground: what is below is dashed, its bend) */
  const iso = (sk) => { const P = run(`buildIso(SK, { labels: false }).prims`, sk); return ['EXIT_1', 'EXIT_2'].map((b) => { const B = box2(own(P, b).filter((p) => p.lay !== 'hp' && p.lay !== 'hd')); return +(B[2] - B[0]).toFixed(3); }); };
  for (const w of iso(S)) assert.ok(w > 0.15 && w < 0.42, `the two pipes only (${w} wide)`);
  for (const w of iso(S0)) assert.ok(w > 0.6, `the block (${w} wide)`);
  /* the CEF table: a row of its own, with no concrete; the notes say how it is built */
  const tb = run(`JSON.stringify([cefTable(SK), stdNote(SK)])`, S), [rows, note] = JSON.parse(tb);
  assert.deepEqual(rows.find((r) => r[0] === 'EXIT CONDUIT'), ['EXIT CONDUIT', '', '', ''], 'no exit conduit with concrete');
  assert.deepEqual(rows.find((r) => r[0] === 'EXIT CONDUIT, NO CONCRETE'), ['EXIT CONDUIT, NO CONCRETE', '2-114.3mm PVC', '2', '']);
  assert.doesNotMatch(note, /IN A CONCRETE BLOCK/); assert.match(note, /EXIT CONDUIT, NO CONCRETE: THE 2 RUNS OF 114\.3 mm PVC CONDUIT COME UP OUT OF THE GROUND/);
  const both = mk('named'); both.els.find((e) => e.t === 'exit').conc = false;
  const [rows2, note2] = JSON.parse(run(`JSON.stringify([cefTable(SK), stdNote(SK)])`, both));
  assert.deepEqual(rows2.filter((r) => /^EXIT CONDUIT/.test(r[0])), [['EXIT CONDUIT', '114.3mm', '1', ''], ['EXIT CONDUIT, NO CONCRETE', '2-114.3mm PVC', '1', '']], 'one of each');
  assert.match(note2, /IN A CONCRETE BLOCK/); assert.match(note2, /NO CONCRETE/);
  assert.ok(!rows.some((r) => r[0] === 'EXIT CONDUIT, NO CONCRETE' && /CONCRETE ENCASEMENT/.test(r[1])));
  /* its detail on the isometric sheet: the two conduits out of the ground, no concrete block */
  const det = run(`(() => { SK.site.pd = { exit: true }; return partDetails(SK, routeGeom(SK)).filter((d) => d.key === 'exit').map((d) => { const G = new Gfx(); d.draw(G); return G.p.filter((p) => p.k === 'tx').map((p) => p.s); }); })()`, mk('cabin1Bare'));
  assert.equal(det.length, 1); assert.ok(det[0].includes('EXIT CONDUIT DETAIL') && det[0].includes('NO CONCRETE') && !det[0].includes('CONCRETE ENCASEMENT'), det[0].join(' / '));
  /* the sheets, the DXF and the KML: named so; the DXF valid */
  const sheets = run(`JSON.stringify(buildSheets(SK, {}))`, S); assert.match(sheets, /EXIT CONDUIT, NO/);
  const dxf = run(`sheetsDXF(buildSheets(SK, {}), { dims: {} })`, S), dxf12 = run(`sheetsDXF(buildSheets(SK, { details: false, photos: false }), { old: true })`, S);
  assert.match(dxf, /\r\n1\r\n(PROPOSED )?(EXIT )?CONDUIT, NO( CONCRETE)?\r\n/, 'its name, as the sheets write it (a long name on two lines)');
  assert.match(run(`toKML(SK, geo(SK))`, S), /<name>PROPOSED EXIT CONDUIT, NO CONCRETE<\/name>/);
  for (const t of [dxf, dxf12]) { const a = audit(t); if (a != null) assert.match(a, /^0 0 \d+/, `ezdxf: ${a}`); }
});

test('without the new choices, and away from what the fixes change, the CEF plan\'s files are byte for byte as beta 7.15 (6e2bd49) made them', async () => {
  // [plan, file, SHA-256 (first 16) of what beta 7.15 (6e2bd49: vendor/cef 30_core.js, 40_iso.js, 50_export.js) made of it in this same context: each plan's sheets made
  // twice (every page; no details or photo pages), its DXFs, sheets and PDF made of them, its KML, and its CEF table with the length formula and the notes]
  const WANT = [
    ['noexit', 'dxf all', '2764e8bb9f79c35a'], ['noexit', 'dxf no det/ph', 'ca266d736fb17c09'], ['noexit', 'dxf R12', '1e26da69b69a2b21'], ['noexit', 'sheets json', '08e993b3b8ad97ba'], ['noexit', 'pdf', 'f35c8371a1e5098e'], ['noexit', 'kml', 'a4b90c1189444284'], ['noexit', 'table', '3141969c5b829cc0'],
    ['noexitPed', 'dxf all', '274fb24b2cad4a49'], ['noexitPed', 'dxf no det/ph', '424a53ece3915075'], ['noexitPed', 'dxf R12', '82bb3eb13394d474'], ['noexitPed', 'sheets json', 'ed0f405fcd50844a'], ['noexitPed', 'pdf', '98bc1437af90e727'], ['noexitPed', 'kml', 'a4b90c1189444284'], ['noexitPed', 'table', '3f26895404ff6eee'],
    ['empty', 'dxf all', 'e011696164a4dc5e'], ['empty', 'dxf no det/ph', 'e011696164a4dc5e'], ['empty', 'dxf R12', '061d7de859da70ee'], ['empty', 'sheets json', '35347a7093137c6e'], ['empty', 'pdf', '876026df87dd4c8b'], ['empty', 'kml', '079675d22df2e5f4'], ['empty', 'table', 'cb4cc2d1e3423703'],
    ['epoleIdle', 'dxf all', '574a881d1efaf9df'], ['epoleIdle', 'dxf no det/ph', '1b13f10bf9981225'], ['epoleIdle', 'dxf R12', 'a4b2e51f13e4eba7'], ['epoleIdle', 'sheets json', 'd1d8224037b43cdf'], ['epoleIdle', 'pdf', '448e7a6827d257da'], ['epoleIdle', 'kml', '76bce7d7f8a6d381'], ['epoleIdle', 'table', 'c791fd7e501e7f2b'],
    ['cabinOld', 'dxf all', '000c8af1939e209e'], ['cabinOld', 'dxf no det/ph', '6443138606c86fde'], ['cabinOld', 'dxf R12', '96d89152cdc67fa3'], ['cabinOld', 'sheets json', '32018fc5288253c6'], ['cabinOld', 'pdf', 'b97985be704012e2'], ['cabinOld', 'kml', '842ea6f1ef122a55'], ['cabinOld', 'table', '30c572d55901bdde']];
  const X = engine(), JOBS = { 'dxf all': `(S1 = buildSheets(SK, {}), S2 = buildSheets(SK, { details: false, photos: false }), sheetsDXF(S1, { dims: {} }))`, 'dxf no det/ph': `sheetsDXF(S2, { dims: {} })`, 'dxf R12': `sheetsDXF(S2, { old: true })`, 'sheets json': `JSON.stringify(S1)`, pdf: `toPDF(S1, {}, SK)`, kml: `(() => { const g = geo(SK); return g ? toKML(SK, g) : '-'; })()`, table: `JSON.stringify([cefTable(SK), focFormula(SK), stdNote(SK)])` };
  const got = []; vm.runInContext('var S1, S2;', X);
  for (const [pn, what] of WANT) { if (what === 'dxf all') X.SK = vm.runInContext(`MK.${pn}()`, X); got.push([pn, what, sha(await vm.runInContext(JOBS[what], X))]); }
  assert.deepEqual(got, WANT, 'as beta 7.15 made them');
});
