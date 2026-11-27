/* beta 7.16 (CEF drawing): the owner's items on the CEF plan's drawing, in Node: the CEF plan's engine (vendor/cef 30_core.js, 40_iso.js,
   50_export.js, as the editor's page runs it). Run: node --test tests/cef-drawing.test.cjs (or python3 tests/run_all.py --only cef-drawing).
   - (2) "Exit Conduit: extend conduits only without concrete scenarios": an exit conduit with its conduits only (el.conc false): no concrete block
     in the top view, the isometric and its detail, the two pipes from the ground up; named ", NO CONCRETE"; a row of its own in the CEF table and
     a note of its own, with no concrete; the DXF valid (ezdxf's audit, when Python has ezdxf: GESAA_PY, else python3).
   - (3) "Existing Pole will be use to create a riser pipe/conduits. (conduits, U-Guard and concrete encasement must be proposed on plan drawing.":
     a riser pole marked existing, and an existing pole, that the UG cable goes up: the concrete encasement at its foot drawn proposed (red, and
     dashed red below the ground) in the top view, the isometric and the riser pole detail, named PROPOSED CONCRETE ENCASEMENT, the pole itself
     existing; the CEF table counts the pole as existing and its new encasement (a riser pole marked existing no longer counts as PROP. RISER
     POLE); one with no cable up it stays existing, all of it; a pedestal box in place of the encasement: none, as before.
   - (4) "Exit Conduits to porthole: FOC not using the conduit holes.": the UG fiber goes up inside the exit conduit to the mouth of its pipe (0.07 m
     above the block, or above the item's height; before, it left at 0.4 m whatever the height, out of the side of a taller one) and runs level from
     there; it goes through the porthole by a hole of its own (the bottom row first, the one in line with where it comes from), level through the
     wall at the hole's height, and the inside (its detail too) starts there; two cables through one porthole take two holes.
   - (6) "CEF plan requires 2 cabin interconnection with multiple portholes, ladder and conduits involve ... Riser > Conduit > Exit Conduit > Porthole >
     Ladder > porthole > Ladder > porthole > ladder > rack > ODF": a made-up plan of two cabins, the UG fiber as tapped through the chain: up the riser,
     along the trench, up the exit conduit, into cabin A through a hole of its porthole, along A's ladder, out through a hole of A's other porthole,
     along the ladder between the cabins, into cabin B the same way, along B's ladder and down to the ODF in its rack; no new conduit made up, nothing to
     check; each piece keeps the number of its leg; the inside of each cabin (its detail, the editor's) drawn from the hole it goes in by (and out by).
     The same from fewer taps (riser pole and ODF; with the exit conduit; with the portholes), as the app lays it; an interconnection from an ODF in A
     to one in B; without a riser (from a hand hole); one cabin as before. The laid line loses a spur that goes out and straight back to nothing, and
     takes in the porthole it goes through the wall by.
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
  for (const f of ['20_isokit.js', '30_core.js', '40_iso.js', '50_export.js']) vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'cef', f), 'utf8'), ctx, { filename: f });
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
  /* an interconnection: from the ODF in cabin A's rack, along A's ladder, out by its porthole, along the ladder between the cabins, into B, to the ODF in B's rack */
  MK.cabin2link = () => { const S = MK.cabin2(), A = S.els.find(e => e.t === 'cabin'), B = S.els.filter(e => e.t === 'cabin')[1], IA = A.inside, rk = newEl('rack2', 2.4, 2.4); rk.id = 'kra'; IA.els.push(rk); const od = Object.assign(newEl('odf', rk.x, rk.y), { st: 'P', id: 'koa' }); IA.els.push(od);
    const odB = B.inside.els.find(e => e.t === 'odf'); S.route.ae.pts = []; S.route.ug.pts = [fromRoom(A, [od.x, od.y]), fromRoom(B, [odB.x, odB.y])].map(p => ({ x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100 })); S.route.ug.legs = [{ type: 'auto' }];
    const L = layFoc(S, S.route.ug.pts.map(p => [p.x, p.y]), 'ug'); S.route.ug.pts = L.ug.map(p => ({ x: p[0], y: p[1] })); S.route.ug.legs = L.ug.slice(1).map(() => ({ type: 'auto' })); return S; };
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

test('(3) an existing pole with a new riser: the riser, the U-guard and the concrete encasement at its foot proposed (red, named so), the pole existing, in every view and the table', () => {
  const rows = (sk) => JSON.parse(run(`JSON.stringify(cefTable(SK))`, sk)).filter((r) => /RISER POLE|ENCASEMENT/.test(r[0])).map((r) => [r[0], r[2]]);
  const sq = (P, lay) => P.filter((p) => p.k === 'pl' && p.close && p.pts.length === 4 && p.lay === lay && Math.abs(Math.hypot(p.pts[1][0] - p.pts[0][0], p.pts[1][1] - p.pts[0][1]) - 0.47) < 0.01).length;
  const texts = (P) => P.filter((p) => p.k === 'tx').map((p) => p.s).join(' ');      /* (a long name is written line by line)*/
  for (const [nm, blk, pl] of [['rpoleE', 'RPOLE_1', 'eq'], ['epoleR', 'EPOLE_1', 'ex']]) {
    const S = mk(nm), top = run(`buildTop(SK, { labels: true }).prims`, S), iso = run(`buildIso(SK, { labels: true }).prims`, S), pole = own(top, blk), pi = own(iso, blk);
    assert.equal(sq(pole, 'pp'), 1, `${nm}: the top view, its encasement proposed`); assert.ok(pole.some((p) => p.k === 'ci' && p.lay === pl), `${nm}: the pole itself existing`);
    assert.ok(pi.some((p) => p.lay === 'pp') && pi.some((p) => p.lay === 'hp'), `${nm}: the isometric, its encasement proposed, above and below the ground`); assert.ok(pi.some((p) => p.lay === pl), `${nm}: the pole existing`);
    assert.ok(!pi.some((p) => p.lay === 'hd' && p.pts.length > 4), `${nm}: no existing encasement below the ground`);
    for (const P of [top, iso]) assert.match(texts(P.filter((p) => p.lay === 'tp')), /PROPOSED CONCRETE ENCASEMENT/, `${nm}: named, in red`);
    assert.match(texts(iso), /PROPOSED G\.I\. RISER PIPE/); assert.ok(run(`routeGeom(SK).risers.length`, S) === 1);
    const det = run(`(() => { SK.site.pd = { riser: true }; const d = partDetails(SK, routeGeom(SK)).find((q) => q.key === 'riser'), G = new Gfx(); d.draw(G); return G.p; })()`, S);
    assert.ok(det.filter((p) => p.k === 'pl' && p.lay === 'pp' && p.close).length >= 1 && det.some((p) => p.lay === 'ex'), `${nm}: the riser pole detail, the pole existing and its encasement proposed`);
  }
  assert.deepEqual(rows(mk('rpoleE')), [['RISER POLE (EXISTING)', '1'], ['PROP. RISER POLE', ''], ['CONCRETE ENCASEMENT', '1']], 'a riser pole marked existing: an existing pole, its new encasement');
  assert.deepEqual(rows(mk('epoleR')), [['RISER POLE (EXISTING)', '1'], ['PROP. RISER POLE', ''], ['CONCRETE ENCASEMENT', '1']], 'an existing pole with a new riser: its new encasement counted');
  assert.deepEqual(rows(mk('rpoleEidle')), [['RISER POLE (EXISTING)', '1'], ['PROP. RISER POLE', ''], ['CONCRETE ENCASEMENT', '']], 'a riser pole marked existing, no cable up it: its riser and encasement are there already');
  assert.deepEqual(rows(mk('noexit')), [['RISER POLE (EXISTING)', ''], ['PROP. RISER POLE', '1'], ['CONCRETE ENCASEMENT', '1']], 'a proposed riser pole: as before');
  /* an existing riser pole with no cable up it yet: all of it existing, as before */
  const I = run(`buildIso(SK, { labels: true }).prims`, mk('rpoleEidle')), P = own(I, 'RPOLE_1');
  assert.ok(!P.some((p) => p.lay === 'pp' || p.lay === 'hp'), 'nothing of it proposed'); assert.doesNotMatch(texts(I), /ENCASEMENT/);
  /* with a pedestal box at the foot of an existing pole, no encasement (as before) */
  const ped = mk('epoleR'); ped.els.find((e) => e.t === 'epole').ped = 'P';
  assert.equal(sq(own(run(`buildTop(SK, { labels: true }).prims`, ped), 'EPOLE_1'), 'pp'), 0); assert.deepEqual(rows(ped)[2], ['CONCRETE ENCASEMENT', '']);
});

/** the route of a plan: its pieces, upright pieces and sums, and each porthole's holes on the site (W on the wall line, O on its outer face, z above the ground) */
const ROUTE = `(() => { const g = routeGeom(SK), r3 = (v) => Math.round(v * 1000) / 1000, P = (p) => [r3(p[0]), r3(p[1])];
  const holes = []; for (const c of SK.els) if (c.t === 'cabin') cabinPorts(c).forEach((q, k) => portHoles(c, q).forEach((h, i) => { const H = holeAt(c, q, h); holes.push({ c: c.id, k, i, W: P(H.W), O: P(H.O), z: r3(baseZ(SK, c) + H.z) }); }));
  return { legs: g.legs.map((l) => ({ f: l.f, i: l.i, cn: l.cn || 0, type: l.type, a: P(l.a), b: P(l.b), za: r3(l.za), zb: r3(l.zb), cab: l.cab || '' })), verts: g.verts.map((v) => ({ kind: v.kind, at: P(v.at), z0: r3(v.z0), z1: r3(v.z1), cab: v.cab || '', cn: v.cn || 0 })), sum: g.sum, parts: g.parts.map((p) => p.sum), exits: g.exits.map((x) => ({ at: P(x.at), g: x.g, h: x.h })), holes, via: g.parts.map((p) => p.via || null), notes: g.notes }; })()`;
const near = (p, q, t = 0.006) => Math.hypot(p[0] - q[0], p[1] - q[1]) < t;
/** the hole a cable goes through: the piece through the wall, level, from the outer face to the wall line, at a hole of the porthole */
function through(R, cn, c) { const l = R.legs.find((q) => q.cn === cn && q.cab === c && q.type === 'open' && R.holes.some((h) => near(q.a, h.O) && near(q.b, h.W))); return l ? Object.assign({ l }, R.holes.find((h) => near(l.a, h.O) && near(l.b, h.W))) : null; }
test('(4) the UG fiber goes up inside the exit conduit and leaves it at its mouth, and goes through the porthole by a hole of its own, level through the wall', () => {
  /* one cable: up the exit conduit to the mouth of its pipe (the block 0.4 m, the pipe 0.07 m above it), level to the wall, up to the bottom middle hole, through it */
  const R = run(ROUTE, mk('cabin1')), c = 'k2', ex = R.verts.find((v) => v.kind === 'exit'), up = R.verts.find((v) => v.kind === 'drop' && !v.cab);
  assert.equal(ex.z1, 0.47, 'up to the mouth'); const lv = R.legs.find((l) => l.type === 'open' && !l.cab); assert.equal(lv.za, 0.47); assert.equal(lv.zb, 0.47); assert.ok(near(lv.a, R.exits[0].at), 'from the pipe the cable is in');
  const h = through(R, 0, c); assert.ok(h, 'through a hole'); assert.equal(h.i, 1, 'the bottom row, the one in line with where it comes from'); assert.equal(h.l.za, h.z); assert.equal(h.l.zb, h.z, 'level through the wall'); assert.equal(h.z, 2.22);
  assert.ok(near(up.at, h.O) && up.z0 === 0.47 && up.z1 === h.z, 'up the wall to the hole, on its outer face');
  assert.ok(near(lv.b, h.O), 'from the mouth to below the hole');
  /* the inside of the cabin, as its detail draws it: from the same hole */
  const V = run(`viaRoute(SK, SK.els.find((e) => e.t === 'cabin'))`, mk('cabin1'));
  assert.ok(Math.abs(V.startZ - h.z) < 1e-6, 'the inside starts at the height of the hole'); assert.ok(near([V.ug.pts[0].x, V.ug.pts[0].y], run(`(() => { const c = SK.els.find((e) => e.t === 'cabin'), q = cabinPorts(c)[0]; return holeAt(c, q, portHoles(c, q)[1]).o; })()`, mk('cabin1'))), 'and its point');
  /* a taller exit conduit (1.2 m up the wall): the cable goes up inside it to its mouth, not out of its side at 0.4 m */
  const T = run(ROUTE, (() => { const S = mk('cabin1'); S.els.find((e) => e.t === 'exit').h = 1.2; return S; })());
  assert.equal(T.verts.find((v) => v.kind === 'exit').z1, 1.27); assert.ok(T.legs.filter((l) => l.type === 'open' && !l.cab).every((l) => l.za === 1.27 && l.zb === 1.27), 'level from the mouth');
  /* with its conduits only: the same mouth */
  assert.equal(run(ROUTE, mk('cabin1Bare')).verts.find((v) => v.kind === 'exit').z1, 0.47);
  /* two cables through one porthole: a hole each, both level through the wall */
  const two = mk('cabin1'); two.more = [{ id: 'c2', ae: { pts: [], cable: '24C FIG. 8' }, ug: { pts: JSON.parse(JSON.stringify(two.route.ug.pts)), legs: JSON.parse(JSON.stringify(two.route.ug.legs)), cable: '24C DUCT' }, note: '' }];
  const R2 = run(ROUTE, two), h0 = through(R2, 0, c), h1 = through(R2, 1, c);
  assert.ok(h0 && h1 && h0.i !== h1.i, `a hole each (${h0 && h0.i}, ${h1 && h1.i})`); assert.equal(h1.z, 2.22, 'the bottom row first');
  /* the sample site: the cable leaves its exit conduit at the mouth; its length as before */
  const N = run(ROUTE, mk('named')); assert.deepEqual(N.verts.filter((v) => v.kind === 'exit').map((v) => v.z1), [0.47]); assert.equal(N.sum.ugt, 31.2);
});

/** the two-cabin plan and its points: the porthole of cabin A from the exit conduit (A1), A's other one (A2), B's (B1), the ODF in B, a point on A's ladder */
const CH = `(() => { const S = MK.cabin2(), [A, B] = S.els.filter((e) => e.t === 'cabin'), od = B.inside.els.find((e) => e.t === 'odf'), r2 = (p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
  return { A: A.id, B: B.id, A1: r2(cabinPorts(A)[0].at), A2: r2(cabinPorts(A)[1].at), B1: r2(cabinPorts(B)[0].at), ODF: r2(fromRoom(B, [od.x, od.y])), LA: r2(fromRoom(A, [1.5, 3.4])), EX: [5.3, 7.6], POLE: [2, 1.5],
    inA: (p) => inCabin(A, p, 0.03), inB: (p) => inCabin(B, p, 0.03) }; })()`;
const chain = (R, P) => {      /* what the route of the chain must be: up the riser, the trench to the exit conduit, into A through a hole of A1, along A's ladder, out through a hole of A2, along the ladder between the cabins, into B through a hole of B1, along B's ladder, down to the ODF */
  const inA = R.legs.filter((l) => l.cab === P.A), inB = R.legs.filter((l) => l.cab === P.B), site = R.legs.filter((l) => l.f === 'ug' && !l.cab);
  assert.deepEqual(R.via.map((v) => v && [v.cab, (v.thru || []).map((w) => w.cab)]), [[P.B, [P.A]]], 'into cabin B, through cabin A');
  assert.ok(inA.some((l) => l.type === 'ladder') && inB.some((l) => l.type === 'ladder'), 'along the ladders inside both cabins');
  const hA1 = through(R, 0, P.A), hB1 = through(R, 0, P.B); assert.ok(hA1 && hB1, 'into A and into B through a hole');
  const outA = R.legs.find((l) => l.cab === P.A && l.type === 'open' && R.holes.some((h) => h.c === P.A && h.k === 1 && near(l.a, h.W) && near(l.b, h.O)));
  assert.ok(outA && outA.za === outA.zb, 'out of A through a hole of A2, level through the wall');
  const between = site.find((l) => l.type === 'ladder'); assert.ok(between && near(between.a, outA.b) && R.holes.some((h) => h.c === P.B && near(between.b, h.O)), 'along the ladder between the cabins, from the hole of A2 to the hole of B1');
  assert.ok(!site.some((l) => P.inA(l.a) || P.inA(l.b) || P.inB(l.a) || P.inB(l.b)), 'nothing of the site\'s pieces in a cabin');
  assert.deepEqual(R.notes, [], 'nothing to check'); assert.equal(R.sum.ug, 9.4, 'no new conduit but the trench drawn'); assert.equal(R.sum.ladder, 1.7, 'the ladder between the cabins');
  assert.ok(R.verts.some((v) => v.kind === 'exit' && v.z1 === 0.47) && R.verts.some((v) => v.kind === 'riser'), 'up the riser, up the exit conduit to its mouth');
  const last = R.verts.filter((v) => v.cab === P.B).pop(); assert.ok(last && last.z0 < last.z1 && last.z0 > 1.5 && last.z0 < 2.1, 'down to the ODF at its rack units');
};
test('(6) the UG fiber through two cabins: Riser > Conduit > Exit Conduit > Porthole > Ladder > Porthole > Ladder > Porthole > Ladder > Rack > ODF', () => {
  const P = run(CH, null), S = mk('cabin2'); P.inA = (p) => run(`inCabin(SK.els.find((e) => e.t === 'cabin'), ${JSON.stringify(p)}, 0.03)`, S); P.inB = (p) => run(`inCabin(SK.els.filter((e) => e.t === 'cabin')[1], ${JSON.stringify(p)}, 0.03)`, S);
  /* as tapped, each element of the chain */
  const R = run(ROUTE, S); chain(R, P);
  assert.deepEqual([...new Set(R.legs.filter((l) => l.f === 'ug' && !l.cab && l.type === 'ladder').map((l) => l.i))], [6], 'the piece between the cabins keeps the number of its leg as drawn');
  /* the inside of each cabin as its detail and the editor draw it: from the hole it goes in by; cabin A to the hole it goes out by */
  const VA = run(`viaRoute(SK, SK.els.find((e) => e.t === 'cabin'))`, S), VB = run(`viaRoute(SK, SK.els.filter((e) => e.t === 'cabin')[1])`, S);
  assert.ok(Math.abs(VA.startZ - 2.22) < 1e-6 && Math.abs(VA.endZ - 2.22) < 1e-6 && VA.ug.pts.length > 4, 'cabin A: in through a hole, out through another');
  assert.ok(Math.abs(VB.startZ - 2.22) < 1e-6 && VB.endZ == null, 'cabin B: in through a hole, to the ODF');
  const det = run(`buildSheets(SK, {}).find((q) => /DETAILS/.test(q.name)).prims.filter((p) => p.lay === 'ug').length`, S); assert.ok(det > 4, 'the details sheet draws the cable inside both cabins');
  /* laid by the app from fewer taps, or from the inside of A: the same way */
  for (const taps of [['POLE', 'ODF'], ['POLE', 'EX', 'ODF'], ['POLE', 'EX', 'A1', 'A2', 'B1', 'ODF']]) {
    const L = run(`(() => { const L = layFoc(SK, ${JSON.stringify(taps.map((k) => P[k]))}, 'ug'); SK.route.ae.pts = []; SK.route.ug.pts = L.ug.map((p) => ({ x: p[0], y: p[1] })); SK.route.ug.legs = L.ug.slice(1).map(() => ({ type: 'auto' })); return SK; })()`, mk('cabin2'));
    assert.ok(L.route.ug.pts.some((p) => P.inA([p.x, p.y])), `${taps.join(' > ')}: laid through cabin A`);
    const R2 = run(ROUTE, L); chain(R2, P);
  }
  /* an interconnection, from the ODF in A's rack to the ODF in B's: out of A by its porthole, along the ladder between, into B */
  const R3 = run(ROUTE, mk('cabin2link')); assert.deepEqual(R3.via.map((v) => v && [v.cab, (v.thru || []).map((w) => w.cab)]), [[P.B, [P.A]]]); assert.deepEqual(R3.notes, []);
  assert.ok(R3.legs.some((l) => l.f === 'ug' && !l.cab && l.type === 'ladder') && R3.sum.ug === 0, 'only the ladder between them on the site');
  /* without a riser: from a hand hole on the trench */
  const hh = mk('cabin2'); const rp = hh.els.find((e) => e.t === 'rpole'); rp.t = 'hh'; Object.assign(rp, { w: 0.8, d: 0.8, h: 0.05, dp: 1.5, st: 'E' }); hh.route.ae.pts = [];
  const R4 = run(ROUTE, hh); assert.ok(!R4.verts.some((v) => v.kind === 'riser')); assert.deepEqual(R4.via.map((v) => v && (v.thru || []).length), [1]); assert.deepEqual(R4.notes, []);
  /* one cabin, as before: the fiber ends in it */
  const R5 = run(ROUTE, mk('cabin1')); assert.deepEqual(R5.via.map((v) => v && [v.cab, v.thru || null]), [['k2', null]]);
  /* the line laid: a spur out and straight back to a point on nothing is taken off; a line through a cabin's wall by its porthole takes the porthole in */
  assert.deepEqual(run(`layFoc(SK, [[2, 1.5], [2, 9.5], [2, 7.6], [5.3, 7.6]], 'ug').ug`, S), [[2, 1.5], [2, 7.6], [5.3, 7.6]]);
  const V2 = run(`viaItems(SK, [[4.5, 7.6], [6.2, 7.6]], 0.5)`, S); assert.ok(V2.some((p) => near(p, P.A1)), 'the porthole the line goes through');
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
